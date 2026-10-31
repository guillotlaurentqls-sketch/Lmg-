'use strict';
// Mini-pilote de l'appli par le protocole DevTools (CDP) : aucune dépendance.
// Prérequis : Node 22, Xvfb (xvfb-run), npm install déjà fait.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

let proc;
/** extraArgs : p. ex. les règles DNS locales pour le site de test. EXE=chemin pour lancer l'appli empaquetée. */
async function launch(userData, extraArgs = []) {
  const cmd = process.env.EXE ? [process.env.EXE] : [path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'), ROOT];
  proc = spawn('xvfb-run', ['-n', '99', '-s', '-screen 0 1280x800x24 -ac', ...cmd,
    '--no-sandbox', // nécessaire uniquement parce que les conteneurs tournent en root
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, ...extraArgs],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  proc.stdout.on('data', (d) => process.env.V && process.stdout.write(d));
  proc.stderr.on('data', (d) => process.env.V && process.stdout.write(d));
  for (let i = 0; i < 60; i++) { try { await getJson('/json/version'); return; } catch { await sleep(500); } }
  throw new Error('CDP indisponible');
}

async function targets() { return (await getJson('/json')).filter((t) => t.type === 'page'); }

class Tab {
  constructor(t) {
    this.t = t; this.id = 0; this.cb = new Map();
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    this.ready = new Promise((r) => this.ws.addEventListener('open', r));
    this.ws.addEventListener('message', (m) => { const o = JSON.parse(m.data); if (o.id && this.cb.has(o.id)) { this.cb.get(o.id)(o); this.cb.delete(o.id); } });
  }
  async send(method, params = {}) {
    await this.ready; const id = ++this.id;
    return new Promise((res, rej) => { this.cb.set(id, (o) => (o.error ? rej(new Error(o.error.message)) : res(o.result))); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr, gesture = false) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: gesture });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  }
  async click(sel) {
    const r = await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    if (!r) throw new Error('introuvable ' + sel);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  async type(sel, text, enter) {
    await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.focus();e.select&&e.select()})()`);
    await this.send('Input.insertText', { text });
    if (enter) for (const type of ['keyDown', 'keyUp']) await this.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined });
  }
  async screenshot(file) {
    require('fs').writeFileSync(file, Buffer.from((await this.send('Page.captureScreenshot', {})).data, 'base64'));
  }
  close() { this.ws.close(); }
}

/** Capture de tout l'écran virtuel (fenêtre entière, toutes les vues) : nécessite ffmpeg. */
function screen(file) {
  const r = require('child_process').spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1280x800', '-i', ':99', '-frames:v', '1', file]);
  if (r.status !== 0) throw new Error('capture d\'écran impossible : ' + String(r.stderr));
}

async function ui() { for (let i = 0; i < 40; i++) { const t = (await targets()).find((x) => x.url.startsWith('file://')); if (t) return new Tab(t); await sleep(300); } throw new Error('lanceur introuvable'); }
async function site() { const t = (await targets()).find((x) => /^(https?|data):/.test(x.url)); return t ? new Tab(t) : null; }
const state = (u) => u.eval('window.launcher.getState()');

/** Fermeture propre (comme un utilisateur) : indispensable pour que les cookies soient écrits sur disque. */
async function quit() {
  try {
    const v = await getJson('/json/version'); const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r)); ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  } catch { /* déjà fermée */ }
  await sleep(4000);
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* rien à tuer */ }
  await sleep(500);
}

async function sites() { return (await targets()).filter((x) => /^(https?|data):/.test(x.url)).map((t) => new Tab(t)); }

module.exports = { launch, targets, ui, site, sites, state, sleep, quit, screen };
