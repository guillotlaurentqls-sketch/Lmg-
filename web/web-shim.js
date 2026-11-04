/* Version web : copie adaptée de android/shim/android-shim.js (voir web/build.js). */
'use strict';
/*
 * Sur Android, l'interface (launcher.js) tourne telle quelle : ce fichier lui fournit « window.launcher »,
 * avec les mêmes fonctions que sur le bureau, mais en gardant les données (profils, bibliothèque, listes)
 * dans le stockage local de la WebView, et en confiant l'ouverture des sites au code Java (window.Android).
 */
(() => {
  const A = null; // pas de code natif : les sites s'ouvrent dans des onglets du navigateur
  const STORE = 'adbl.web.v1';

  // ───────── Adresses (même logique que src/url.js) ─────────
  const MULTI = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'com.br', 'com.mx', 'co.in', 'co.za', 'com.tr', 'com.cn', 'com.ar']);
  const BAD_SCHEME = /^(javascript|data|file|about|blob|chrome|view-source|mailto|tel|ftp|ws|wss|intent):/i;
  function normalizeUrl(input) {
    if (typeof input !== 'string') return { ok: false, error: 'Adresse vide.' };
    let s = input.trim().replace(/^[<"'`(]+|[>"'`),.;]+$/g, '').replace(/\s+/g, '');
    if (!s) return { ok: false, error: 'Adresse vide.' };
    if (BAD_SCHEME.test(s) || (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s))) return { ok: false, error: 'Seules les adresses http et https sont acceptées.' };
    if (s.startsWith('//')) s = 'https:' + s; else if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch { return { ok: false, error: 'Cette adresse n’est pas valide.' }; }
    if (!(u.hostname.includes('.') || u.hostname === 'localhost')) return { ok: false, error: 'Cette adresse ne ressemble pas à un site web.' };
    return { ok: true, url: u.href };
  }
  function siteKey(x) {
    let h = x; try { if (/^[a-z]+:\/\//i.test(x)) h = new URL(x).hostname; } catch { /* garde */ }
    h = String(h || '').toLowerCase().replace(/\.$/, '');
    if (!h || /^[\d.]+$/.test(h) || h.includes(':') || h === 'localhost') return h;
    const p = h.split('.'); if (p.length <= 2) return h;
    return MULTI.has(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
  }
  const isSame = (a, b) => !!b && siteKey(a) === siteKey(b);
  const autoTitle = (url) => { const l = siteKey(url).split('.')[0] || 'Site'; return l.charAt(0).toUpperCase() + l.slice(1); };
  const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;
  function brandFromTitle(title, url) {
    const label = siteKey(url).split('.')[0].toLowerCase();
    const seg = String(title || '').split(/\s+[|\-–—·•:]\s+/).map((x) => x.trim()).find((x) => x && x.toLowerCase().includes(label));
    return seg && seg.length <= 40 ? seg : '';
  }

  // ───────── Données ─────────
  let channels = [], providers = [], defaults = [];
  let tabs = [], activeId = null, blockInfo = { status: 'loading', updatedAt: 0, error: '' };
  let drm = { status: 'unknown', detail: '' };
  let profileId = null;
  let listener = null;

  const newEntry = (o) => ({ key: '', url: '', lastUrl: o.url, title: '', titleAuto: false, group: '', favorite: false, later: false, opens: 0, lastOpened: 0, icon: '', iconUrl: '', color: '', ...o });
  const seed = () => defaults.map((d) => newEntry({ key: siteKey(d.url), url: d.url, lastUrl: d.url, title: d.title, group: d.group || '', favorite: true }));

  let data;
  try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { data = null; }
  const fresh = !data;
  data = data || { profiles: [], currentProfile: null, askProfile: true, theme: 'dark', totalBlocked: 0 };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* stockage plein */ } };

  const EMB = window.__EMBED__ || {}; // listes intégrées à la page par web/build.js
  const ready = Promise.resolve([EMB.channels || [], EMB.providers || [], EMB.defaults || []]).then(([c, p, d]) => {
    channels = c; providers = p; defaults = d;
    if (data.profiles.length === 0) data.profiles.push({ id: 'p1', name: 'Moi', emoji: '🙂', color: '#4f7cff', createdAt: Date.now(), library: seed() });
    for (const p2 of data.profiles) for (const e of p2.library) { e.later = !!e.later; e.icon = e.icon || ''; e.color = e.color || ''; }
    save();
    const last = data.profiles.find((x) => x.id === data.currentProfile);
    if (data.profiles.length === 1) choose(data.profiles[0].id);
    else if (!data.askProfile && last) choose(last.id);
    try { drm = JSON.parse(A.drm()); } catch { /* pont absent */ }
    try { blockInfo = JSON.parse(A.blocklist()); } catch { /* pont absent */ }
  });

  const profile = () => data.profiles.find((x) => x.id === profileId) || null;
  const lib = () => (profile() ? profile().library : []);
  const findEntry = (url) => lib().find((e) => e.key === siteKey(url));

  function choose(id) {
    if (!data.profiles.some((x) => x.id === id)) return;
    profileId = id; data.currentProfile = id; save();
    if (A) A.setProfile(id);
    tabs = []; activeId = null;
  }

  function touch(url) {
    const p = profile(); if (!p) return;
    let e = findEntry(url);
    if (!e) {
      e = newEntry({ key: siteKey(url), url, title: autoTitle(url), titleAuto: true });
      p.library.push(e);
      if (p.library.length > 200) {
        const drop = p.library.filter((x) => !x.favorite && !x.later).sort((a, b) => a.lastOpened - b.lastOpened)[0];
        if (drop) p.library = p.library.filter((x) => x !== drop);
      }
    }
    e.lastUrl = url; e.opens += 1; e.lastOpened = Date.now(); save();
  }

  function snapshot() {
    const prof = profile();
    return {
      web: true, mode: profileId ? 'home' : 'profiles', mosaic: false, fullscreen: false, url: '', title: '', loading: false,
      canGoBack: false, canGoForward: false, zoom: 100, siteKey: '', blockingEnabled: true, disabledSites: [],
      pageBlocked: 0, popupsBlocked: 0, totalBlocked: data.totalBlocked, error: null,
      tabs, activeId, library: lib(), channels, providers,
      profile: prof ? { id: prof.id, name: prof.name, emoji: prof.emoji, color: prof.color, services: prof.services || [] } : null,
      profiles: data.profiles.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, color: x.color, count: x.library.length })),
      settings: { theme: data.theme, askProfile: data.askProfile },
      filters: { status: blockInfo.status, updatedAt: blockInfo.updatedAt || null, error: blockInfo.error || '' },
      drm
    };
  }
  const emit = () => { if (listener) listener(snapshot()); };
  const mutate = (fn) => { fn(); save(); emit(); };

  // ───────── Appels venant de Java ─────────
  window.__native = {
    tabs(list) { tabs = list; activeId = list.length ? list[list.length - 1].id : null; emit(); },
    blocklist(info) { blockInfo = info; emit(); },
    identity(info) { // nom, icône et couleur lus sur la page ouverte, comme sur le bureau
      const e = lib().find((x) => x.key === info.key);
      if (!e) return;
      let changed = false;
      if (info.color && COLOR_RE.test(info.color.trim()) && e.color !== info.color.trim()) { e.color = info.color.trim(); changed = true; }
      const brand = e.titleAuto ? brandFromTitle(info.title, e.url) : '';
      if (brand && brand !== e.title) { e.title = brand; changed = true; }
      if (info.icon && e.icon !== info.icon) { e.icon = info.icon; changed = true; }
      if (info.url && isSame(info.url, e.url) && e.lastUrl !== info.url) { e.lastUrl = info.url; changed = true; }
      if (changed) { save(); emit(); }
    }
  };

  // ───────── API identique à celle du bureau ─────────
  // Un vrai lien cliqué par l'utilisateur : le navigateur l'ouvre dans un nouvel onglet.
  function openInBrowser(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  }
  const noop = () => Promise.resolve();
  window.launcher = {
    getState: () => ready.then(snapshot),
    open: async (input, opts = {}) => {
      await ready;
      if (!profileId) return { ok: false, error: 'Choisis d’abord un profil.' };
      const r = normalizeUrl(String(input));
      if (!r.ok) return r;
      if (!opts.chain) touch(r.url);
      let res = { ok: true, url: r.url };
      openInBrowser(r.url);
      emit();
      return res;
    },
    activateTab: noop,
    closeTab: noop,
    home: noop, back: noop, forward: noop, reload: noop, zoomIn: noop, zoomOut: noop, zoomReset: noop,
    toggleBlocking: noop, showView: noop, toggleMosaic: noop,
    toggleFavorite: (url) => { const e = findEntry(url); if (e) mutate(() => { e.favorite = !e.favorite; }); return noop(); },
    toggleService: (id) => { const p = profile(); if (p && providers.some((x) => x.id === id && x.kind === 'service')) mutate(() => { p.services = p.services || []; const i = p.services.indexOf(id); if (i >= 0) p.services.splice(i, 1); else p.services.push(id); }); return noop(); },
    toggleLater: (url) => { const e = findEntry(url); if (e) mutate(() => { e.later = !e.later; }); return noop(); },
    updateEntry: (key, patch) => {
      const e = lib().find((x) => x.key === key);
      if (e && patch) mutate(() => {
        if (typeof patch.title === 'string' && patch.title.trim() && patch.title.trim() !== e.title) { e.title = patch.title.trim().slice(0, 60); e.titleAuto = false; }
        if (typeof patch.group === 'string') e.group = patch.group.trim().slice(0, 40);
        if (typeof patch.favorite === 'boolean') e.favorite = patch.favorite;
        if (typeof patch.later === 'boolean') e.later = patch.later;
      });
      return noop();
    },
    removeEntry: (key) => { const p = profile(); if (p) mutate(() => { p.library = p.library.filter((x) => x.key !== key); }); return noop(); },
    selectProfile: (id) => { choose(id); emit(); return noop(); },
    openChooser: () => { profileId = null; tabs = []; if (A) A.setProfile('none'); emit(); return noop(); },
    saveProfile: async (id, d) => {
      await ready;
      const name = String((d && d.name) || '').trim().slice(0, 20);
      if (!name) return { ok: false, error: 'Donne un nom au profil.' };
      if (!/^#[0-9a-f]{6}$/i.test(String(d.color))) return { ok: false, error: 'Choisis une couleur.' };
      if (!String(d.emoji || '')) return { ok: false, error: 'Choisis un avatar.' };
      if (data.profiles.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Ce nom existe déjà.' };
      if (id) { const p = data.profiles.find((x) => x.id === id); if (!p) return { ok: false, error: 'Profil introuvable.' }; Object.assign(p, { name, emoji: d.emoji, color: d.color }); }
      else { if (data.profiles.length >= 6) return { ok: false, error: 'Six profils au maximum.' }; data.profiles.push({ id: 'p' + Date.now().toString(36), name, emoji: d.emoji, color: d.color, createdAt: Date.now(), library: seed() }); }
      save(); emit();
      return { ok: true };
    },
    deleteProfile: async (id) => {
      if (data.profiles.length <= 1) return { ok: false, error: 'Il faut garder au moins un profil.' };
      if (profileId === id) { profileId = null; tabs = []; }
      data.profiles = data.profiles.filter((x) => x.id !== id);
      if (A) A.deleteProfile(id); // efface aussi les connexions de ce profil
      save(); emit();
      return { ok: true };
    },
    setSettings: (patch) => { if (patch) mutate(() => { if (['dark', 'light', 'auto'].includes(patch.theme)) data.theme = patch.theme; if (typeof patch.askProfile === 'boolean') data.askProfile = patch.askProfile; }); return noop(); },
    updateFilters: () => { if (A) A.updateBlocklist(); return noop(); },
    probeDrm: () => { try { drm = JSON.parse(A.drm()); } catch { /* pont absent */ } emit(); return noop(); },
    cast: () => { if (A) A.cast(); return noop(); },
    onState: (cb) => { listener = cb; },
    onFocusAddress: () => {}
  };
})();
