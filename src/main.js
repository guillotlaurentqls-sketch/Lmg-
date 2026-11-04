'use strict';

const { app, BaseWindow, WebContentsView, Menu, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { normalizeUrl, siteKey, isHttpUrl, isSameSite, isAuthSite } = require('./url');
const { Store } = require('./store');

const TABS_H = 34; // rangée des onglets
const BAR_H = 52; // barre d'outils (une ligne)
const BAR_H_COMPACT = 92; // barre d'outils sur petit écran : deux lignes (boutons, puis adresse)
const COMPACT_W = 700;
const MAX_TABS = 8;
const MOSAIC_MAX = 4; // sites affichés en même temps dans la mosaïque
const GAP = 3;
const FILTER_REFRESH_MS = 6 * 60 * 60 * 1000;
const LIB_MAX = 200;

let win = null;
let ui = null; // vue du lanceur (accueil, onglets et barre d'outils)
let ses = null; // session du profil actif
const sessions = new Map(); // une session (cookies, connexions) par profil
let blocker = null;
let profileId = null; // profil actif (null : écran « Qui regarde ? »)
let store;

// Onglets : chacun a sa propre vue de site, son compteur et son état.
let tabs = [];
let activeId = null;
let nextId = 1;
let mode = 'home'; // 'profiles' | 'home' | 'site'
let mosaic = false;
let fsTab = null; // onglet en plein écran vidéo
let lastExternalOpen = 0;

const drm = { status: 'unknown', detail: '' };
const filters = { status: 'loading', updatedAt: null, error: '' };

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const defaultSites = readJson('sites.default.json');
const channels = readJson('channels.json');
const providers = readJson('providers.json'); // plateformes légales : pages de recherche et de catégories

const active = () => tabs.find((t) => t.id === activeId) || null;
const tabByWcId = (id) => tabs.find((t) => t.wc.id === id) || null;

// ───────────────────────────── Sécurité globale ─────────────────────────────

// Aucun contenu ne peut ouvrir une fenêtre ou naviguer hors http(s), où que ce soit.
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('will-navigate', (e, url) => {
    if ((ui && wc === ui.webContents) || !isHttpUrl(url)) e.preventDefault();
  });
});

// ───────────────────────────── Blocage (Ghostery) ───────────────────────────

function isDisabledFor(details) {
  const top = details.resourceType === 'mainFrame'
    ? details.url
    : (details.webContents && !details.webContents.isDestroyed() && details.webContents.getURL()) || details.referrer || '';
  const key = siteKey(top);
  return !!key && store.data.disabledSites.includes(key);
}

// Ghostery ne sait câbler qu'une session à la fois (ses canaux IPC sont uniques) : on câble chaque profil nous-mêmes.
const COSMETIC_IPC = '@ghostery/adblocker/inject-cosmetic-filters';
const MUTATION_IPC = '@ghostery/adblocker/is-mutation-observer-enabled';
const PRELOAD_PATH = require.resolve('@ghostery/adblocker-electron-preload', { paths: [require.resolve('@ghostery/adblocker-electron')] });
const preloaded = new WeakSet();
let cosmeticIpcDone = false;

function registerCosmeticIpc() {
  if (cosmeticIpcDone) return;
  cosmeticIpcDone = true;
  // Filtres cosmétiques (éléments de pub masqués) : on les saute sur les sites où le blocage est désactivé.
  ipcMain.handle(COSMETIC_IPC, (e, url, msg) => {
    if (!blocker || store.data.disabledSites.includes(siteKey(String(url || '')))) return undefined;
    return blocker.onInjectCosmeticFilters(e, url, msg);
  });
  ipcMain.handle(MUTATION_IPC, (e) => (blocker ? blocker.onIsMutationObserverEnabled(e) : false));
}

function wireSession(s) {
  if (!preloaded.has(s) && blocker.config.loadCosmeticFilters === true) {
    s.registerPreloadScript({ type: 'frame', filePath: PRELOAD_PATH });
    preloaded.add(s);
  }
  // Écouteurs réseau « filtrables » site par site, avec compteur par onglet.
  s.webRequest.onBeforeRequest((details, callback) => {
    if (isDisabledFor(details)) return callback({});
    blocker.onBeforeRequest(details, (response) => {
      if (response && (response.cancel || response.redirectURL)) {
        store.data.totalBlocked += 1;
        const tab = details.webContents ? tabByWcId(details.webContents.id) : null;
        if (tab) tab.blocked += 1;
        scheduleState();
        store.save();
      }
      callback(response);
    });
  });
  s.webRequest.onHeadersReceived((details, callback) => {
    if (isDisabledFor(details)) return callback({});
    blocker.onHeadersReceived(details, callback);
  });
}

function installBlocker(newBlocker) {
  blocker = newBlocker; // les écouteurs lisent toujours le blocage courant : les listes se renouvellent sans recâblage
  registerCosmeticIpc();
  for (const s of sessions.values()) wireSession(s);
}

const cacheFile = () => path.join(app.getPath('userData'), 'filters.bin');

async function loadFiltersFromCache() {
  try {
    const bytes = await fs.promises.readFile(cacheFile());
    installBlocker(ElectronBlocker.deserialize(new Uint8Array(bytes)));
    const stat = await fs.promises.stat(cacheFile());
    filters.status = 'cached';
    filters.updatedAt = stat.mtimeMs;
    return true;
  } catch {
    return false; // pas de cache (premier lancement) ou cache d'une autre version
  }
}

async function updateFilters() {
  filters.status = filters.updatedAt ? 'updating' : 'loading';
  scheduleState();
  try {
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    installBlocker(fresh);
    await fs.promises.writeFile(cacheFile(), fresh.serialize());
    filters.status = 'ready';
    filters.updatedAt = Date.now();
    filters.error = '';
  } catch (err) {
    filters.error = err.message;
    filters.status = blocker ? 'stale' : 'error';
    console.error('[filtres] mise à jour impossible :', err.message);
  }
  scheduleState();
}

// ───────────────────────────── Fenêtre ──────────────────────────────────────

function createWindow() {
  win = new BaseWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 520,
    title: 'AdBlock Launcher',
    backgroundColor: '#14161a',
    icon: path.join(__dirname, '..', 'build', 'icon.png')
  });

  ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  win.contentView.addChildView(ui);
  ui.webContents.loadFile(path.join(__dirname, 'launcher', 'index.html'));
  ui.webContents.once('did-finish-load', probeWidevine);

  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('closed', () => { tabs = []; win = null; ui = null; });
  layout();
}

/** Les sites affichés dans la mosaïque : les 4 premiers onglets, en y gardant l'onglet actif. */
function mosaicTabs() {
  const shown = tabs.slice(0, MOSAIC_MAX);
  const a = active();
  if (a && !shown.includes(a)) shown[shown.length - 1] = a;
  return shown;
}

function layout() {
  if (!win || !ui) return;
  const { width, height } = win.getContentBounds();

  if (mode !== 'site' || tabs.length === 0) {
    ui.setVisible(true);
    ui.setBounds({ x: 0, y: 0, width, height });
    for (const t of tabs) t.view.setVisible(false);
    return;
  }
  if (fsTab) { // plein écran vidéo : le site seul, sur toute la fenêtre
    ui.setVisible(false);
    for (const t of tabs) t.view.setVisible(t === fsTab);
    fsTab.view.setBounds({ x: 0, y: 0, width, height });
    return;
  }

  const top = TABS_H + (width < COMPACT_W ? BAR_H_COMPACT : BAR_H);
  ui.setVisible(true);
  ui.setBounds({ x: 0, y: 0, width, height: top });
  const bodyH = Math.max(0, height - top);

  if (!mosaic) {
    for (const t of tabs) t.view.setVisible(t.id === activeId);
    const a = active();
    if (a) a.view.setBounds({ x: 0, y: top, width, height: bodyH });
    return;
  }

  // Mosaïque : 2 sites côte à côte, 3 ou 4 sites en grille 2×2 (le dernier s'étale si le nombre est impair).
  const shown = mosaicTabs();
  const n = shown.length;
  const cols = n <= 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor((width - GAP * (cols - 1)) / cols);
  const cellH = Math.floor((bodyH - GAP * (rows - 1)) / rows);
  for (const t of tabs) t.view.setVisible(shown.includes(t));
  shown.forEach((t, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const lastAlone = cols === 2 && i === n - 1 && n % 2 === 1;
    t.view.setBounds({
      x: lastAlone ? 0 : c * (cellW + GAP),
      y: top + r * (cellH + GAP),
      width: lastAlone ? width : cellW,
      height: cellH
    });
  });
}

/** Le son suit l'onglet actif : tous les autres sont coupés (mosaïque comprise). */
function applyAudio() {
  for (const t of tabs) {
    if (!t.wc.isDestroyed()) t.wc.setAudioMuted(!(mode === 'site' && t.id === activeId));
  }
}

// ───────────────────────────── Onglets ──────────────────────────────────────

function createTab() {
  const view = new WebContentsView({
    webPreferences: {
      partition: partitionFor(profileId),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  });
  const tab = { id: nextId++, view, wc: view.webContents, home: '', blocked: 0, popups: 0, error: null };
  tabs.push(tab);
  win.contentView.addChildView(view);
  win.contentView.addChildView(ui); // le lanceur reste au-dessus
  attachTab(tab);
  return tab;
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [tab] = tabs.splice(i, 1);
  if (fsTab === tab) { fsTab = null; if (win && win.isFullScreen()) win.setFullScreen(false); }
  win.contentView.removeChildView(tab.view);
  tab.wc.close();
  if (activeId === id) activeId = (tabs[i] || tabs[i - 1] || {}).id ?? null;
  if (tabs.length === 0) { mode = 'home'; mosaic = false; activeId = null; if (win) win.setTitle('AdBlock Launcher'); }
  layout(); applyAudio(); scheduleState();
}

function activateTab(id) {
  if (!tabs.some((t) => t.id === id)) return;
  activeId = id;
  mode = 'site';
  const a = active();
  layout(); applyAudio(); scheduleState();
  a.wc.focus();
  if (win) win.setTitle(`${a.wc.getTitle() || 'AdBlock Launcher'} — AdBlock Launcher`);
}

function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activateTab(tabs[(i + dir + tabs.length) % tabs.length].id);
}

function setMosaic(on) {
  mosaic = !!on && tabs.length > 1;
  if (mosaic) mode = 'site';
  layout(); applyAudio(); scheduleState();
}

function attachTab(tab) {
  const wc = tab.wc;
  const reference = () => tab.home || wc.getURL();

  // Fenêtres : les pop-ups sont refusés, les liens « normaux » sont routés selon leur destination.
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (!isHttpUrl(url)) { tab.popups += 1; scheduleState(); return { action: 'deny' }; }
    if (disposition === 'new-window') {
      // window.open(...) avec dimensions : pop-up. Seule exception, la fenêtre de connexion d'un fournisseur d'identité.
      if (isAuthSite(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520, height: 700, autoHideMenuBar: true,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
          }
        };
      }
      tab.popups += 1; scheduleState();
      return { action: 'deny' };
    }
    if (isSameSite(url, reference()) || isAuthSite(url)) {
      setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(url); });
      return { action: 'deny' };
    }
    // Lien externe : navigateur par défaut, au plus un toutes les 2 s (les pubs enchaînent les ouvertures).
    const now = Date.now();
    if (now - lastExternalOpen > 2000 && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
      lastExternalOpen = now;
      shell.openExternal(url);
    } else {
      tab.popups += 1; scheduleState();
    }
    return { action: 'deny' };
  });

  wc.on('will-navigate', (e, url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return;
    if (!isHttpUrl(url)) { e.preventDefault(); return; }
    if (!(isSameSite(url, reference()) || isAuthSite(url))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  wc.on('will-redirect', (e, url) => { if (!isHttpUrl(url)) e.preventDefault(); }); // les redirections http(s) restent libres

  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) { tab.blocked = 0; tab.popups = 0; tab.error = null; }
    scheduleState();
  });
  wc.on('did-navigate', (_e, url) => {
    const entry = tab.home ? findEntry(tab.home) : null;
    if (entry && isSameSite(url, tab.home)) { entry.lastUrl = url; store.save(); } // « Reprendre » rouvre la dernière page
    applyZoom(tab); scheduleState();
  });
  wc.on('did-navigate-in-page', scheduleState);
  wc.on('dom-ready', () => applyZoom(tab));
  wc.on('page-favicon-updated', (_e, favicons) => captureIcon(tab, favicons));
  wc.on('did-finish-load', () => captureIdentity(tab));
  wc.on('did-start-loading', scheduleState);
  wc.on('did-stop-loading', scheduleState);
  wc.on('audio-state-changed', scheduleState);
  wc.on('page-title-updated', (_e, title) => {
    if (win && tab.id === activeId) win.setTitle(`${title} — AdBlock Launcher`);
    scheduleState();
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 : navigation annulée
    tab.error = { code, desc, url };
    wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorPage(desc, url)));
  });
  // Dans la mosaïque, cliquer sur un site le rend actif (il récupère le son).
  wc.on('focus', () => {
    if (mosaic && mode === 'site' && activeId !== tab.id) { activeId = tab.id; applyAudio(); scheduleState(); }
  });

  // Lecteur vidéo : le plein écran HTML agrandit le site à toute la fenêtre.
  wc.on('enter-html-full-screen', () => { fsTab = tab; activeId = tab.id; win.setFullScreen(true); layout(); applyAudio(); scheduleState(); });
  wc.on('leave-html-full-screen', () => { fsTab = null; win.setFullScreen(false); layout(); scheduleState(); });
}

function errorPage(desc, url) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;background:#14161a;color:#e8eaed;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:560px;padding:24px"><h1 style="font-size:22px">Impossible d’afficher ce site</h1>
<p style="color:#9aa0a6">${esc(desc)}</p><p style="word-break:break-all;color:#9aa0a6">${esc(url)}</p>
<p><a href="${esc(url)}" style="color:#8ab4f8">Réessayer</a></p></div>`;
}

// ───────────────────────────── Bibliothèque ─────────────────────────────────

const profile = () => store.data.profiles.find((x) => x.id === profileId) || null;
const lib = () => (profile() ? profile().library : []);

function autoTitle(url) {
  const label = siteKey(url).split('.')[0] || 'Site';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function findEntry(url) {
  const key = siteKey(url);
  return lib().find((e) => e.key === key);
}

/** Chaque adresse ouverte est ajoutée à la bibliothèque, regroupée par site (domaine). */
function touchSite(url) {
  let e = findEntry(url);
  if (!e) {
    e = newEntry({ key: siteKey(url), url, title: autoTitle(url), titleAuto: true });
    const p = profile();
    if (!p) return;
    p.library.push(e);
    if (p.library.length > LIB_MAX) {
      const drop = p.library.filter((x) => !x.favorite && !x.later).sort((x, y) => x.lastOpened - y.lastOpened)[0];
      if (drop) p.library = p.library.filter((x) => x !== drop);
    }
  }
  e.lastUrl = url;
  e.opens += 1;
  e.lastOpened = Date.now();
  store.save();
}

// ── Le site « s'adapte » : nom, icône et couleur lus sur la page ouverte, gardés dans la bibliothèque ──

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;
const ICON_MAX = 100 * 1024;

function newEntry(o) {
  return { key: '', url: '', lastUrl: o.url, title: '', titleAuto: false, group: '', favorite: false, later: false, opens: 0, lastOpened: 0, icon: '', iconUrl: '', color: '', ...o };
}

function entryOf(tab) {
  if (!tab.home || tab.wc.isDestroyed()) return null;
  return isSameSite(tab.wc.getURL(), tab.home) ? findEntry(tab.home) : null;
}

/** « Titre de l'émission | ARTE » → « ARTE » : on ne retient que le segment qui contient le nom du site. */
function brandFromTitle(title, url) {
  const label = siteKey(url).split('.')[0].toLowerCase();
  const seg = String(title || '').split(/\s+[|\-–—·•:]\s+/).map((x) => x.trim()).find((x) => x && x.toLowerCase().includes(label));
  return seg && seg.length <= 40 ? seg : '';
}

async function captureIdentity(tab) {
  const e = entryOf(tab);
  if (!e) return;
  try {
    const info = await tab.wc.executeJavaScript(
      `({ color: (document.querySelector('meta[name="theme-color"]') || {}).content || '', title: document.title })`
    );
    let changed = false;
    if (typeof info.color === 'string' && COLOR_RE.test(info.color.trim()) && e.color !== info.color.trim()) { e.color = info.color.trim(); changed = true; }
    const brand = e.titleAuto ? brandFromTitle(info.title, e.url) : '';
    if (brand && brand !== e.title) { e.title = brand; changed = true; }
    if (changed) { store.save(); scheduleState(); }
  } catch { /* page fermée entre-temps */ }
}

async function captureIcon(tab, favicons) {
  const e = entryOf(tab);
  const url = (favicons || []).find((u) => isHttpUrl(u));
  if (!e || !url || e.iconUrl === url) return;
  try {
    const res = await ses.fetch(url, { headers: { Accept: 'image/*' } });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !/^image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon|svg\+xml)$/.test(type)) return;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > ICON_MAX) return;
    e.icon = `data:${type};base64,${buf.toString('base64')}`;
    e.iconUrl = url;
    store.save(); scheduleState();
  } catch { /* icône indisponible : on garde la lettre */ }
}

function updateEntry(key, patch) {
  const e = lib().find((x) => x.key === key);
  if (!e || !patch || typeof patch !== 'object') return;
  if (typeof patch.title === 'string' && patch.title.trim() && patch.title.trim() !== e.title) { e.title = patch.title.trim().slice(0, 60); e.titleAuto = false; } // un nom choisi à la main n'est plus modifié
  if (typeof patch.group === 'string') e.group = patch.group.trim().slice(0, 40);
  if (typeof patch.favorite === 'boolean') e.favorite = patch.favorite;
  if (typeof patch.later === 'boolean') e.later = patch.later;
  store.save(); scheduleState();
}

function removeEntry(key) {
  const p = profile();
  if (p) p.library = p.library.filter((x) => x.key !== key);
  store.save(); scheduleState();
}

/** Les abonnements que la personne a (Netflix, Prime Video…), par profil : on ne garde que l'identifiant du service, jamais d'identifiant de connexion. */
function toggleService(id) {
  const p = profile();
  if (!p || !providers.some((x) => x.id === id && x.kind === 'service')) return;
  p.services = p.services || [];
  const i = p.services.indexOf(id);
  if (i >= 0) p.services.splice(i, 1); else p.services.push(id);
  store.save(); scheduleState();
}

function toggleFlag(url, flag) {
  const n = normalizeUrl(url);
  if (!n.ok || !profile()) return;
  let e = findEntry(n.url);
  if (!e) { touchSite(n.url); e = findEntry(n.url); e.opens = 0; e.lastOpened = 0; }
  e[flag] = !e[flag];
  store.save(); scheduleState();
}

// ───────────────────────────── Actions ──────────────────────────────────────

/**
 * Ouvre une adresse.
 *  here       : navigue dans l'onglet actif (barre d'adresse)
 *  reuse      : si un onglet du même site existe déjà, on s'y place sans le recharger (fiches de la bibliothèque)
 *  background : ouvre dans un nouvel onglet sans quitter l'accueil
 *  chain      : chaîne TV ou guide, qui ne s'ajoute pas à la bibliothèque
 */
function openSite(input, opts = {}) {
  if (!profileId) return { ok: false, error: 'Choisis d’abord un profil.' };
  const r = normalizeUrl(input);
  if (!r.ok) return r;
  let tab = null;
  if (opts.here && active()) tab = active();
  else if (opts.reuse) tab = tabs.find((t) => siteKey(t.home || t.wc.getURL()) === siteKey(r.url)) || null;
  else tab = tabs.find((t) => t.home === r.url) || null; // même adresse exacte : on réutilise l'onglet
  const existed = !!tab;
  if (!tab) {
    if (tabs.length >= MAX_TABS) return { ok: false, error: `Maximum ${MAX_TABS} onglets : ferme-en un avant d’en ouvrir un autre.` };
    tab = createTab();
  }
  if (!opts.chain) touchSite(r.url);
  if (!existed || !opts.reuse) {
    tab.home = r.url; tab.blocked = 0; tab.popups = 0; tab.error = null;
    tab.wc.loadURL(r.url);
  }
  if (!opts.background) { activeId = tab.id; mode = 'site'; }
  else if (!activeId) activeId = tab.id;
  layout(); applyAudio(); scheduleState();
  if (!opts.background) tab.wc.focus();
  return { ok: true, url: r.url, id: tab.id };
}

function goHome() {
  mode = 'home';
  fsTab = null;
  if (win && win.isFullScreen()) win.setFullScreen(false);
  if (win) win.setTitle('AdBlock Launcher');
  layout(); applyAudio(); scheduleState(); // les onglets restent ouverts (muets) : « En cours » sur l'accueil
}

function currentKey() {
  const a = active();
  return mode === 'site' && a ? siteKey(a.wc.getURL() || a.home) : '';
}

function applyZoom(tab) {
  const key = siteKey(tab.wc.getURL() || tab.home);
  if (key && store.data.zoom[key]) tab.wc.setZoomFactor(store.data.zoom[key]);
}

function changeZoom(delta) {
  const a = active();
  if (mode !== 'site' || !a) return;
  const key = currentKey();
  const cur = a.wc.getZoomFactor();
  const next = delta === 'reset' ? 1 : Math.min(3, Math.max(0.5, Math.round((cur + delta) * 100) / 100));
  a.wc.setZoomFactor(next);
  if (next === 1) delete store.data.zoom[key]; else store.data.zoom[key] = next;
  store.save();
  scheduleState();
}

function toggleBlocking() {
  const key = currentKey();
  if (!key) return;
  const list = store.data.disabledSites;
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1); else list.push(key);
  store.save();
  for (const t of tabs) if (siteKey(t.wc.getURL() || t.home) === key) { t.blocked = 0; t.wc.reload(); }
  scheduleState();
}

async function probeWidevine() {
  const code = `(async () => {
    try {
      await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: 'SW_SECURE_CRYPTO' }]
      }]);
      return { status: 'available', detail: '' };
    } catch (e) { return { status: 'missing', detail: String(e && e.name || e) }; }
  })()`;
  try {
    // Sonde faite depuis le lanceur (contexte sécurisé) : le résultat dépend d'Electron, pas du site.
    Object.assign(drm, await ui.webContents.executeJavaScript(code));
  } catch (e) {
    Object.assign(drm, { status: 'unknown', detail: e.message });
  }
  scheduleState();
}

// ───────────────────────────── État partagé avec l'interface ─────────────────

let stateTimer = null;
function scheduleState() {
  if (stateTimer) return;
  stateTimer = setTimeout(() => { stateTimer = null; pushState(); }, 80);
}

function snapshot() {
  const a = active();
  const wc = a && !a.wc.isDestroyed() ? a.wc : null;
  const cur = mode === 'site' && wc ? wc.getURL() : '';
  const key = currentKey();
  const library = lib();
  const prof = profile();
  return {
    mode,
    mosaic,
    fullscreen: !!fsTab,
    url: isHttpUrl(cur) ? cur : (a ? a.home : ''),
    title: wc ? wc.getTitle() : '',
    loading: !!wc && wc.isLoading(),
    canGoBack: !!wc && mode === 'site' && wc.navigationHistory.canGoBack(),
    canGoForward: !!wc && mode === 'site' && wc.navigationHistory.canGoForward(),
    zoom: wc ? Math.round(wc.getZoomFactor() * 100) : 100,
    siteKey: key,
    blockingEnabled: key ? !store.data.disabledSites.includes(key) : true,
    disabledSites: store.data.disabledSites,
    pageBlocked: a ? a.blocked : 0,
    popupsBlocked: a ? a.popups : 0,
    totalBlocked: store.data.totalBlocked,
    error: a ? a.error : null,
    tabs: tabs.map((t) => {
      const u = t.wc.isDestroyed() ? '' : t.wc.getURL();
      const entry = library.find((e) => e.key === siteKey(t.home || u));
      return {
        id: t.id,
        title: (t.wc.isDestroyed() ? '' : t.wc.getTitle()) || (entry ? entry.title : '') || siteKey(t.home),
        url: isHttpUrl(u) ? u : t.home,
        key: siteKey(t.home || u),
        icon: entry ? entry.icon : '',
        color: entry ? entry.color : '',
        loading: !t.wc.isDestroyed() && t.wc.isLoading(),
        audible: !t.wc.isDestroyed() && t.wc.isCurrentlyAudible(),
        blocked: t.blocked
      };
    }),
    activeId,
    library,
    channels,
    providers,
    profile: prof ? { id: prof.id, name: prof.name, emoji: prof.emoji, color: prof.color, services: prof.services || [] } : null,
    profiles: store.data.profiles.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, color: x.color, count: x.library.length })),
    settings: { theme: store.data.theme, askProfile: store.data.askProfile },
    filters: { ...filters },
    drm: { ...drm }
  };
}

function pushState() {
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('state', snapshot());
}

const asId = (v) => (Number.isInteger(v) ? v : -1);

function registerIpc() {
  const trusted = (e) => ui && e.sender === ui.webContents; // seul le lanceur peut commander l'appli
  const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => (trusted(e) ? fn(...args) : undefined));
  const onActive = (fn) => () => { const a = active(); if (a) fn(a); };

  handle('state:get', () => snapshot());
  handle('site:open', (input, opts) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    return openSite(String(input), { here: o.here === true, reuse: o.reuse === true, background: o.background === true, chain: o.chain === true });
  });
  handle('nav:home', () => goHome());
  handle('nav:back', onActive((a) => { if (a.wc.navigationHistory.canGoBack()) a.wc.navigationHistory.goBack(); }));
  handle('nav:forward', onActive((a) => { if (a.wc.navigationHistory.canGoForward()) a.wc.navigationHistory.goForward(); }));
  handle('nav:reload', onActive((a) => a.wc.reload()));
  handle('zoom:in', () => changeZoom(0.1));
  handle('zoom:out', () => changeZoom(-0.1));
  handle('zoom:reset', () => changeZoom('reset'));
  handle('block:toggle', () => toggleBlocking());
  handle('tab:activate', (id) => activateTab(asId(id)));
  handle('tab:close', (id) => closeTab(asId(id)));
  handle('view:show', (wantMosaic) => { if (tabs.length) { mode = 'site'; if (!active()) activeId = tabs[0].id; setMosaic(wantMosaic === true); } });
  handle('mosaic:toggle', () => setMosaic(!mosaic));
  handle('fav:toggle', (url) => toggleFlag(String(url), 'favorite'));
  handle('later:toggle', (url) => toggleFlag(String(url), 'later'));
  handle('service:toggle', (id) => toggleService(String(id)));
  handle('profile:select', (id) => selectProfile(String(id)));
  handle('profile:chooser', () => openChooser());
  handle('profile:save', (id, data) => saveProfile(id == null ? null : String(id), data));
  handle('profile:delete', (id) => deleteProfile(String(id)));
  handle('settings:set', (patch) => setSettings(patch));
  handle('lib:update', (key, patch) => updateEntry(String(key), patch));
  handle('lib:remove', (key) => removeEntry(String(key)));
  handle('filters:update', () => updateFilters());
  handle('drm:probe', () => probeWidevine());
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const ifSite = (fn) => () => { const a = active(); if (mode === 'site' && a) fn(a); };
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Fichier', submenu: [
      { label: 'Accueil', accelerator: 'CmdOrCtrl+H', click: () => goHome() },
      { label: 'Nouvel onglet (accueil)', accelerator: 'CmdOrCtrl+T', click: () => { goHome(); goFocusAddress(); } },
      { label: 'Saisir une adresse…', accelerator: 'CmdOrCtrl+L', click: () => goFocusAddress() },
      { label: 'Fermer l’onglet', accelerator: 'CmdOrCtrl+W', click: ifSite((a) => closeTab(a.id)) },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit', label: 'Quitter' }
    ] },
    { label: 'Édition', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'Affichage', submenu: [
      { label: 'Précédent', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: ifSite((a) => a.wc.navigationHistory.canGoBack() && a.wc.navigationHistory.goBack()) },
      { label: 'Suivant', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: ifSite((a) => a.wc.navigationHistory.canGoForward() && a.wc.navigationHistory.goForward()) },
      { label: 'Actualiser', accelerator: 'CmdOrCtrl+R', click: ifSite((a) => a.wc.reload()) },
      { type: 'separator' },
      { label: 'Onglet suivant', accelerator: 'Ctrl+Tab', click: () => cycleTab(1) },
      { label: 'Onglet précédent', accelerator: 'Ctrl+Shift+Tab', click: () => cycleTab(-1) },
      { label: 'Mosaïque (plusieurs sites)', accelerator: 'CmdOrCtrl+M', click: () => setMosaic(!mosaic) },
      { type: 'separator' },
      { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', click: () => changeZoom(0.1) },
      { label: 'Zoom + (=)', accelerator: 'CmdOrCtrl+=', visible: false, click: () => changeZoom(0.1) },
      { label: 'Zoom −', accelerator: 'CmdOrCtrl+-', click: () => changeZoom(-0.1) },
      { label: 'Zoom 100 %', accelerator: 'CmdOrCtrl+0', click: () => changeZoom('reset') },
      { type: 'separator' },
      { label: 'Plein écran', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function goFocusAddress() {
  if (ui) { ui.webContents.focus(); ui.webContents.send('focus-address'); }
}

// ───────────────────────────── Démarrage ────────────────────────────────────

// Anciennes versions : favoris + historique → bibliothèque unique.
function migrateLibrary() {
  const d = store.data;
  if (!d.favorites && !d.history) return;
  d.library = d.library || [];
  for (const f of d.favorites || []) {
    if (!isHttpUrl(f.url) || d.library.some((e) => e.key === siteKey(f.url))) continue;
    d.library.push({ key: siteKey(f.url), url: f.url, lastUrl: f.url, title: f.title || autoTitle(f.url), group: '', favorite: true, opens: 0, lastOpened: 0 });
  }
  for (const h of (d.history || []).slice().reverse()) {
    if (!isHttpUrl(h.url)) continue;
    let e = d.library.find((x) => x.key === siteKey(h.url));
    if (!e) { e = { key: siteKey(h.url), url: h.url, lastUrl: h.url, title: autoTitle(h.url), group: '', favorite: false, opens: 0, lastOpened: 0 }; d.library.push(e); }
    e.opens += 1; e.lastOpened = Math.max(e.lastOpened, h.ts || 0);
  }
  delete d.favorites; delete d.history;
  store.save();
}

function cleanUserAgent(s) {
  // Retire « Electron/x » et le nom de l'appli pour que les sites voient un Chrome ordinaire.
  return s.replace(/\s*Electron\/\S+/i, '').replace(new RegExp(`\\s*${app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\S+`, 'i'), '');
}

const partitionFor = (id) => (id === 'p1' ? 'persist:sites' : `persist:profile-${id}`); // p1 garde la session des versions précédentes

function sessionFor(id) {
  let s = sessions.get(id);
  if (!s) {
    s = session.fromPartition(partitionFor(id));
    s.setUserAgent(cleanUserAgent(s.getUserAgent()));
    // Permissions : lecture, plein écran et presse-papiers seulement. Caméra, micro, position, notifications : refusés.
    const allowed = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
    s.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
    s.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
    sessions.set(id, s);
    if (blocker) wireSession(s);
  }
  return s;
}

// ── Profils : chacun a sa bibliothèque, ses favoris, sa liste et sa propre session de navigation ──

function closeAllTabs() {
  for (const t of tabs.slice()) closeTab(t.id);
  fsTab = null; mosaic = false; activeId = null;
}

function selectProfile(id) {
  if (!store.data.profiles.some((x) => x.id === id)) return;
  closeAllTabs();
  profileId = id;
  store.data.currentProfile = id;
  ses = sessionFor(id);
  mode = 'home';
  store.save();
  if (win) win.setTitle('AdBlock Launcher');
  layout(); scheduleState();
}

function openChooser() {
  closeAllTabs();
  profileId = null; ses = null;
  mode = 'profiles';
  if (win) { if (win.isFullScreen()) win.setFullScreen(false); win.setTitle('AdBlock Launcher'); }
  layout(); scheduleState();
}

const EMOJI_RE = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\u200d\ufe0f]*$/u;

function saveProfile(id, data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Profil invalide.' };
  const name = String(data.name || '').trim().slice(0, 20);
  const emoji = String(data.emoji || '');
  const color = String(data.color || '');
  if (!name) return { ok: false, error: 'Donne un nom au profil.' };
  if (!EMOJI_RE.test(emoji) || emoji.length > 12) return { ok: false, error: 'Choisis un avatar.' };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { ok: false, error: 'Choisis une couleur.' };
  if (store.data.profiles.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Ce nom existe déjà.' };
  if (id) {
    const p = store.data.profiles.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Profil introuvable.' };
    Object.assign(p, { name, emoji, color });
  } else {
    if (store.data.profiles.length >= 6) return { ok: false, error: 'Six profils au maximum.' };
    store.data.profiles.push({ id: 'p' + Date.now().toString(36), name, emoji, color, createdAt: Date.now(), library: seedLibrary() });
  }
  store.save(); scheduleState();
  return { ok: true };
}

async function deleteProfile(id) {
  if (store.data.profiles.length <= 1) return { ok: false, error: 'Il faut garder au moins un profil.' };
  const p = store.data.profiles.find((x) => x.id === id);
  if (!p) return { ok: false };
  if (profileId === id) openChooser();
  store.data.profiles = store.data.profiles.filter((x) => x.id !== id);
  if (store.data.currentProfile === id) store.data.currentProfile = null;
  store.save();
  try { await sessionFor(id).clearStorageData(); } catch { /* session déjà vide */ } // supprime aussi ses connexions
  sessions.delete(id);
  scheduleState();
  return { ok: true };
}

function setSettings(patch) {
  if (!patch || typeof patch !== 'object') return;
  if (['dark', 'light', 'auto'].includes(patch.theme)) store.data.theme = patch.theme;
  if (typeof patch.askProfile === 'boolean') store.data.askProfile = patch.askProfile;
  store.save(); scheduleState();
}

const seedLibrary = () => defaultSites.map((d) => newEntry({ key: siteKey(d.url), url: d.url, lastUrl: d.url, title: d.title, group: d.group || '', favorite: true }));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const link = argv.find((a) => /^https?:\/\//i.test(a));
    if (link) openSite(link);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('fr.lmg.adblocklauncher');
    store = new Store(path.join(app.getPath('userData'), 'state.json'), {
      profiles: [], currentProfile: null, askProfile: true, theme: 'dark', disabledSites: [], zoom: {}, totalBlocked: 0
    });
    migrateLibrary();
    const d = store.data;
    if (d.library) { // version à profil unique → profil « Moi » (garde sa session de navigation)
      d.profiles.push({ id: 'p1', name: 'Moi', emoji: '🙂', color: '#4f7cff', createdAt: Date.now(), library: d.library });
      delete d.library;
    }
    if (d.profiles.length === 0) {
      d.profiles.push({ id: 'p1', name: 'Moi', emoji: '🙂', color: '#4f7cff', createdAt: Date.now(), library: seedLibrary() });
    }
    for (const p of d.profiles) {
      p.services = Array.isArray(p.services) ? p.services : [];
      for (const e of p.library) { // entrées d'avant l'adaptation et les listes
        if (e.titleAuto === undefined) e.titleAuto = e.title === autoTitle(e.url);
        e.icon = e.icon || ''; e.iconUrl = e.iconUrl || ''; e.color = e.color || ''; e.later = !!e.later;
      }
    }
    store.save();

    registerIpc();
    buildMenu();
    createWindow();
    const last = d.profiles.find((x) => x.id === d.currentProfile);
    if (d.profiles.length === 1) selectProfile(d.profiles[0].id);
    else if (!d.askProfile && last) selectProfile(last.id);
    else openChooser();

    const startLink = process.argv.slice(1).find((a) => /^https?:\/\//i.test(a));
    if (startLink) setTimeout(() => openSite(startLink), 300);

    await loadFiltersFromCache(); // démarrage rapide avec les dernières listes connues
    await updateFilters(); // puis mise à jour immédiate…
    setInterval(updateFilters, FILTER_REFRESH_MS).unref(); // …et régulière

    app.on('activate', () => { if (BaseWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('before-quit', () => {
    if (store) store.flush();
    for (const x of sessions.values()) { x.cookies.flushStore().catch(() => {}); x.flushStorageData(); } // garantit la connexion conservée au prochain lancement
  });
  app.on('window-all-closed', () => app.quit());
}
