'use strict';

const { app, BaseWindow, WebContentsView, Menu, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { normalizeUrl, siteKey, isHttpUrl, isSameSite, isAuthSite } = require('./url');
const { Store } = require('./store');

const TOOLBAR_H = 52;
const PARTITION = 'persist:sites'; // cookies, connexions et stockage conservés entre deux lancements
const FILTER_REFRESH_MS = 6 * 60 * 60 * 1000;
const HISTORY_MAX = 30;

let win = null;
let ui = null; // vue du lanceur (accueil + barre d'outils)
let site = null; // vue du site affiché
let ses = null;
let blocker = null;
let mode = 'home'; // 'home' | 'site'
let htmlFullscreen = false;
let siteHome = ''; // adresse ouverte par l'utilisateur : référence « même site »
let lastExternalOpen = 0;

const page = { blocked: 0, popups: 0, error: null, drm: { status: 'unknown', detail: '' } };
const filters = { status: 'loading', updatedAt: null, error: '' };

let store;
const defaultSites = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites.default.json'), 'utf8'));

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

function installBlocker(newBlocker) {
  if (blocker) {
    try { blocker.disableBlockingInSession(ses); } catch { /* déjà retiré */ }
  }
  blocker = newBlocker;
  blocker.enableBlockingInSession(ses); // injecte aussi les filtres cosmétiques
  // On remplace les écouteurs réseau par des versions « filtrables » site par site, avec compteur.
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (isDisabledFor(details)) return callback({});
    const current = blocker;
    current.onBeforeRequest(details, (response) => {
      if (response && (response.cancel || response.redirectURL)) {
        store.data.totalBlocked += 1;
        if (details.webContents && site && details.webContents.id === site.webContents.id) page.blocked += 1;
        scheduleState();
        store.save();
      }
      callback(response);
    });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (isDisabledFor(details)) return callback({});
    blocker.onHeadersReceived(details, callback);
  });
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

// ───────────────────────────── Fenêtre et vues ──────────────────────────────

function createWindow() {
  win = new BaseWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'AdBlock Launcher',
    backgroundColor: '#14161a',
    icon: path.join(__dirname, '..', 'build', 'icon.png')
  });

  site = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  });
  ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  win.contentView.addChildView(site);
  win.contentView.addChildView(ui); // le lanceur reste au-dessus
  site.setVisible(false);

  ui.webContents.loadFile(path.join(__dirname, 'launcher', 'index.html'));
  ui.webContents.once('did-finish-load', probeWidevine);
  attachSite(site.webContents);

  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('closed', () => { win = null; ui = null; site = null; });
  layout();
}

function layout() {
  if (!win || !ui || !site) return;
  const { width, height } = win.getContentBounds();
  if (mode === 'home') {
    ui.setBounds({ x: 0, y: 0, width, height });
    site.setVisible(false);
    ui.setVisible(true);
  } else if (htmlFullscreen) {
    ui.setVisible(false);
    site.setVisible(true);
    site.setBounds({ x: 0, y: 0, width, height });
  } else {
    ui.setVisible(true);
    ui.setBounds({ x: 0, y: 0, width, height: TOOLBAR_H });
    site.setVisible(true);
    site.setBounds({ x: 0, y: TOOLBAR_H, width, height: Math.max(0, height - TOOLBAR_H) });
  }
}

function attachSite(wc) {
  // Fenêtres : les pop-ups sont refusés, les liens « normaux » sont routés selon leur destination.
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (!isHttpUrl(url)) { page.popups += 1; scheduleState(); return { action: 'deny' }; }
    const reference = siteHome || wc.getURL();
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
      page.popups += 1; scheduleState();
      return { action: 'deny' };
    }
    if (isSameSite(url, reference) || isAuthSite(url)) {
      setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(url); });
      return { action: 'deny' };
    }
    // Lien externe : navigateur par défaut, au plus un toutes les 2 s (les pubs enchaînent les ouvertures).
    const now = Date.now();
    if (now - lastExternalOpen > 2000 && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
      lastExternalOpen = now;
      shell.openExternal(url);
    } else {
      page.popups += 1; scheduleState();
    }
    return { action: 'deny' };
  });

  const guard = (e, url, isMainFrame = true) => {
    if (!isMainFrame) return;
    if (!isHttpUrl(url)) { e.preventDefault(); return; }
    if (!(isSameSite(url, siteHome || wc.getURL()) || isAuthSite(url))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  };
  wc.on('will-navigate', (e, url, _inPlace, isMainFrame) => guard(e, url, isMainFrame));
  wc.on('will-redirect', (e, url) => { if (!isHttpUrl(url)) e.preventDefault(); }); // les redirections http(s) restent libres

  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) { page.blocked = 0; page.popups = 0; page.error = null; }
    scheduleState();
  });
  wc.on('did-navigate', () => { applyZoom(); scheduleState(); });
  wc.on('did-navigate-in-page', scheduleState);
  wc.on('dom-ready', applyZoom);
  wc.on('did-start-loading', scheduleState);
  wc.on('did-stop-loading', scheduleState);
  wc.on('page-title-updated', (_e, title) => {
    if (win) win.setTitle(`${title} — AdBlock Launcher`);
    const hit = store.data.history.find((h) => h.url === siteHome);
    if (hit && !hit.titleFixed) { hit.title = title; hit.titleFixed = true; store.save(); }
    scheduleState();
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 : navigation annulée
    page.error = { code, desc, url };
    wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorPage(desc, url)));
  });

  // Lecteur vidéo : le plein écran HTML agrandit la vue du site à toute la fenêtre.
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); scheduleState(); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); scheduleState(); });
}

function errorPage(desc, url) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;background:#14161a;color:#e8eaed;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:560px;padding:24px"><h1 style="font-size:22px">Impossible d’afficher ce site</h1>
<p style="color:#9aa0a6">${esc(desc)}</p><p style="word-break:break-all;color:#9aa0a6">${esc(url)}</p>
<p><a href="${esc(url)}" style="color:#8ab4f8">Réessayer</a></p></div>`;
}

// ───────────────────────────── Actions ──────────────────────────────────────

function openSite(input) {
  const r = normalizeUrl(input);
  if (!r.ok) return r;
  siteHome = r.url;
  mode = 'site';
  page.blocked = 0; page.popups = 0; page.error = null;
  recordHistory(r.url);
  layout();
  site.webContents.loadURL(r.url);
  site.webContents.focus();
  scheduleState();
  return { ok: true, url: r.url };
}

function goHome() {
  mode = 'home';
  htmlFullscreen = false;
  if (win && win.isFullScreen()) win.setFullScreen(false);
  site.webContents.loadURL('about:blank'); // coupe le son et la vidéo
  siteHome = '';
  if (win) win.setTitle('AdBlock Launcher');
  layout();
  scheduleState();
}

function recordHistory(url) {
  const h = store.data.history.filter((x) => x.url !== url);
  const old = store.data.history.find((x) => x.url === url);
  h.unshift({ url, title: old ? old.title : new URL(url).hostname.replace(/^www\./, ''), titleFixed: !!old?.titleFixed, ts: Date.now() });
  store.data.history = h.slice(0, HISTORY_MAX);
  store.save();
}

function currentKey() {
  return mode === 'site' ? siteKey(site.webContents.getURL() || siteHome) : '';
}

function zoomKey() { return currentKey(); }

function applyZoom() {
  const key = zoomKey();
  if (key && store.data.zoom[key]) site.webContents.setZoomFactor(store.data.zoom[key]);
}

function changeZoom(delta) {
  if (mode !== 'site') return;
  const key = zoomKey();
  const cur = site.webContents.getZoomFactor();
  const next = delta === 'reset' ? 1 : Math.min(3, Math.max(0.5, Math.round((cur + delta) * 100) / 100));
  site.webContents.setZoomFactor(next);
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
  page.blocked = 0;
  site.webContents.reload();
  scheduleState();
}

function togglePin(url, title) {
  const n = normalizeUrl(url);
  if (!n.ok) return;
  const favs = store.data.favorites;
  const i = favs.findIndex((f) => f.url === n.url);
  if (i >= 0) favs.splice(i, 1);
  else favs.push({ url: n.url, title: (title || new URL(n.url).hostname.replace(/^www\./, '')).slice(0, 80) });
  store.save();
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
    page.drm = await ui.webContents.executeJavaScript(code);
  } catch (e) {
    page.drm = { status: 'unknown', detail: e.message };
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
  const wc = site && !site.webContents.isDestroyed() ? site.webContents : null;
  const url = mode === 'site' && wc ? wc.getURL() : '';
  const key = currentKey();
  return {
    mode,
    fullscreen: htmlFullscreen,
    url: isHttpUrl(url) ? url : siteHome,
    title: wc ? wc.getTitle() : '',
    loading: !!wc && wc.isLoading(),
    canGoBack: !!wc && mode === 'site' && wc.navigationHistory.canGoBack(),
    canGoForward: !!wc && mode === 'site' && wc.navigationHistory.canGoForward(),
    zoom: wc ? Math.round(wc.getZoomFactor() * 100) : 100,
    siteKey: key,
    blockingEnabled: key ? !store.data.disabledSites.includes(key) : true,
    disabledSites: store.data.disabledSites,
    pageBlocked: page.blocked,
    popupsBlocked: page.popups,
    totalBlocked: store.data.totalBlocked,
    error: page.error,
    favorites: store.data.favorites,
    history: store.data.history.map(({ url: u, title, ts }) => ({ url: u, title, ts })),
    filters: { ...filters },
    drm: page.drm
  };
}

function pushState() {
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('state', snapshot());
}

function registerIpc() {
  const trusted = (e) => ui && e.sender === ui.webContents; // seul le lanceur peut commander l'appli
  const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => (trusted(e) ? fn(...args) : undefined));

  handle('state:get', () => snapshot());
  handle('site:open', (input) => openSite(String(input)));
  handle('nav:home', () => goHome());
  handle('nav:back', () => { if (site.webContents.navigationHistory.canGoBack()) site.webContents.navigationHistory.goBack(); });
  handle('nav:forward', () => { if (site.webContents.navigationHistory.canGoForward()) site.webContents.navigationHistory.goForward(); });
  handle('nav:reload', () => site.webContents.reload());
  handle('zoom:in', () => changeZoom(0.1));
  handle('zoom:out', () => changeZoom(-0.1));
  handle('zoom:reset', () => changeZoom('reset'));
  handle('block:toggle', () => toggleBlocking());
  handle('fav:toggle', (url, title) => togglePin(String(url), String(title || '')));
  handle('history:remove', (url) => {
    store.data.history = store.data.history.filter((h) => h.url !== String(url));
    store.save(); scheduleState();
  });
  handle('history:clear', () => { store.data.history = []; store.save(); scheduleState(); });
  handle('filters:update', () => updateFilters());
  handle('drm:probe', () => probeWidevine());
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const ifSite = (fn) => () => { if (mode === 'site') fn(); };
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Fichier', submenu: [
      { label: 'Accueil', accelerator: 'CmdOrCtrl+H', click: () => goHome() },
      { label: 'Saisir une adresse…', accelerator: 'CmdOrCtrl+L', click: () => { goFocusAddress(); } },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit', label: 'Quitter' }
    ] },
    { label: 'Édition', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'Affichage', submenu: [
      { label: 'Précédent', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: ifSite(() => site.webContents.navigationHistory.canGoBack() && site.webContents.navigationHistory.goBack()) },
      { label: 'Suivant', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: ifSite(() => site.webContents.navigationHistory.canGoForward() && site.webContents.navigationHistory.goForward()) },
      { label: 'Actualiser', accelerator: 'CmdOrCtrl+R', click: ifSite(() => site.webContents.reload()) },
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

function cleanUserAgent(s) {
  // Retire « Electron/x » et le nom de l'appli pour que les sites voient un Chrome ordinaire.
  return s.replace(/\s*Electron\/\S+/i, '').replace(new RegExp(`\\s*${app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\S+`, 'i'), '');
}

function setupSession() {
  ses = session.fromPartition(PARTITION);
  ses.setUserAgent(cleanUserAgent(ses.getUserAgent()));

  // Permissions : lecture, plein écran et presse-papiers seulement. Caméra, micro, position, notifications : refusés.
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

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
      favorites: [], history: [], disabledSites: [], zoom: {}, totalBlocked: 0
    });
    if (store.isNew) { store.data.favorites = defaultSites.map((s) => ({ ...s })); store.save(); }

    setupSession();
    registerIpc();
    buildMenu();
    createWindow();

    const startLink = process.argv.slice(1).find((a) => /^https?:\/\//i.test(a));
    if (startLink) setTimeout(() => openSite(startLink), 300);

    await loadFiltersFromCache(); // démarrage rapide avec les dernières listes connues
    await updateFilters(); // puis mise à jour immédiate…
    setInterval(updateFilters, FILTER_REFRESH_MS).unref(); // …et régulière

    app.on('activate', () => { if (BaseWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('before-quit', () => {
    if (store) store.flush();
    if (ses) ses.cookies.flushStore().catch(() => {}); // garantit la connexion conservée au prochain lancement
    if (ses) ses.flushStorageData();
  });
  app.on('window-all-closed', () => app.quit());
}
