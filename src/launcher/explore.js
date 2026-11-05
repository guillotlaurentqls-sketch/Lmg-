'use strict';
/*
 * Explorer (version web) : parcourir, chercher et regarder des films et séries depuis des sources publiques
 * qui proposent une API ouverte : Internet Archive et les instances PeerTube.
 * Recherche globale sur toutes les sources, sources enregistrées, nouveautés, bibliothèque, historique,
 * reprise à la minute près. Chaque œuvre affiche sa licence ; le téléchargement n'est proposé que pour les
 * licences ouvertes (domaine public, Creative Commons). Rien n'est copié : les vidéos sont lues depuis le
 * serveur de la source.
 */
(() => {
  const KEY = 'adbl.explore.v1';
  const PAGE = 24;
  const GLOBAL_N = 10; // résultats par source dans la recherche globale
  const REFRESH_MS = 6 * 3600 * 1000; // mise à jour automatique des nouveautés
  const MAX_INSTANCES = 12;

  const IA = { id: 'ia', kind: 'ia', title: 'Internet Archive', sub: 'Films et séries du domaine public ou sous licence ouverte' };
  const IA_CATS = [
    { id: '', title: 'Tout' },
    { id: 'feature_films', title: 'Longs métrages' },
    { id: 'classic_tv', title: 'Télévision classique' },
    { id: 'silent_films', title: 'Films muets' },
    { id: 'animationandcartoons', title: 'Animation' },
    { id: 'SciFi_Horror', title: 'Science-fiction et horreur' },
    { id: 'prelinger', title: 'Archives Prelinger' }
  ];
  const IA_ALL = IA_CATS.filter((c) => c.id).map((c) => c.id);
  const PT_DEFAULT = { id: 'pt:https://framatube.org', kind: 'peertube', base: 'https://framatube.org', title: 'Framatube', sub: 'Vidéos libres (PeerTube)' };
  // Instances publiques testées : elles répondent et acceptent les requêtes depuis une page web.
  const SUGGESTED = [
    { base: 'https://video.blender.org', title: 'Blender', sub: 'Films d’animation libres de la fondation Blender' },
    { base: 'https://tilvids.com', title: 'TILvids', sub: 'Vidéos éducatives' },
    { base: 'https://videos.lescommuns.org', title: 'Les Communs', sub: 'Vidéos francophones des communs' },
    { base: 'https://video.ploud.fr', title: 'Ploud', sub: 'Plateforme francophone' }
  ];
  const PT_FR = { Music: 'Musique', Films: 'Films', Vehicles: 'Véhicules', Art: 'Art', Sports: 'Sport', Travels: 'Voyages', Gaming: 'Jeux vidéo', People: 'Personnes', Comedy: 'Humour', Entertainment: 'Divertissement', 'News & Politics': 'Actualités et politique', 'How To': 'Tutoriels', Education: 'Éducation', Activism: 'Militantisme', 'Science & Technology': 'Sciences et technologies', Animals: 'Animaux', Kids: 'Enfants', Food: 'Cuisine' };
  const PT_OPEN_LICENCES = new Set([1, 2, 3, 4, 5, 6, 7]); // Creative Commons (toutes variantes) et domaine public

  // ───────── Données par profil (stockage du navigateur) ─────────
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { store = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* stockage plein */ } };
  let pid = 'default';
  // Toujours le même objet : les modifications faites par les fonctions asynchrones ne se perdent pas.
  const data = () => {
    const d = store[pid] || (store[pid] = {});
    const defaults = { library: [], history: [], instances: [], disabled: [], seen: {}, news: {}, checkedAt: 0 };
    for (const k of Object.keys(defaults)) if (!(k in d)) d[k] = defaults[k];
    return d;
  };

  // ───────── État de l'écran ─────────
  const ui = { tab: 'home', source: null, cat: '', sort: 'popular', query: '', items: [], total: 0, page: 0, loading: false, error: '', detail: null, playing: null, ptCats: {}, confirmClear: false, g: null, checking: false, libFilter: '', autoChecked: {}, backupMsg: '', addMsg: '', draft: { g: '', b: '', add: '', backup: '' } };
  let ctx = null;
  const refresh = () => ctx && ctx.refresh();

  // ───────── Utilitaires ─────────
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const plain = (html) => { try { return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.trim(); } catch { return ''; } };
  const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
  const cut = (s, n) => String(s == null ? '' : s).slice(0, n);
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };
  const fmtSize = (b) => { b = Number(b) || 0; return b > 1e9 ? (b / 1e9).toFixed(1) + ' Go' : b > 1e6 ? Math.round(b / 1e6) + ' Mo' : b ? Math.round(b / 1e3) + ' Ko' : ''; };
  const fmtAgo = (t) => { if (!t) return 'jamais'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
  async function getJson(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const validBase = (b) => { try { const u = new URL(b); return u.protocol === 'https:' ? u.origin : ''; } catch { return ''; } };
  const sources = () => [IA, PT_DEFAULT, ...data().instances.map((b) => {
    const s = SUGGESTED.find((x) => x.base === b);
    return { id: 'pt:' + b, kind: 'peertube', base: b, title: s ? s.title : new URL(b).hostname, sub: s ? s.sub : 'Instance PeerTube ajoutée', custom: true };
  })];
  const sourceById = (id) => sources().find((s) => s.id === id);
  const isEnabled = (s) => !data().disabled.includes(s.id);
  const enabledSources = () => sources().filter(isEnabled);

  // ───────── Source : Internet Archive ─────────
  const words = (q) => String(q || '').replace(/["():\[\]\\{}^~*?!+\-&|/]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  /** o : { cat, query, sort, page, count } */
  async function iaBrowse(o) {
    const cats = o.cat ? [o.cat] : IA_ALL;
    const parts = ['mediatype:movies', `collection:(${cats.join(' OR ')})`];
    const w = words(o.query);
    if (w.length) parts.push(`(title:(${w.join(' AND ')}) OR subject:(${w.join(' AND ')}) OR creator:(${w.join(' AND ')}))`);
    const u = new URL('https://archive.org/advancedsearch.php');
    u.searchParams.set('q', parts.join(' AND '));
    for (const f of ['identifier', 'title', 'year', 'creator', 'addeddate']) u.searchParams.append('fl[]', f);
    u.searchParams.set('rows', String(o.count));
    u.searchParams.set('page', String(o.page + 1));
    u.searchParams.append('sort[]', o.sort === 'recent' ? 'addeddate desc' : 'downloads desc');
    u.searchParams.set('output', 'json');
    const d = await getJson(u.toString());
    return {
      total: d.response.numFound,
      items: d.response.docs.map((x) => ({
        key: 'ia|' + x.identifier, sourceId: 'ia', id: x.identifier,
        title: cut(Array.isArray(x.title) ? x.title[0] : x.title || x.identifier, 200), year: x.year || '', date: x.addeddate || '',
        thumb: 'https://archive.org/services/img/' + encodeURIComponent(x.identifier)
      }))
    };
  }
  async function iaDetail(item) {
    const d = await getJson('https://archive.org/metadata/' + encodeURIComponent(item.id));
    const m = d.metadata || {};
    const lic = typeof m.licenseurl === 'string' ? m.licenseurl : '';
    const open = /creativecommons\.org\/(publicdomain|licenses)\//i.test(lic);
    const label = !lic ? 'Licence non précisée' : /publicdomain/i.test(lic) ? 'Domaine public' : 'Creative Commons';
    const vids = (d.files || []).filter((f) => /\.(mp4|ogv)$/i.test(f.name) && !/_(sample|trailer)\./i.test(f.name));
    const byBase = new Map(); // un seul fichier par épisode : on préfère le MP4
    for (const f of vids) {
      const base = f.name.replace(/\.(mp4|ogv)$/i, '').replace(/_?512kb$/i, '');
      const cur = byBase.get(base);
      if (!cur || (/\.mp4$/i.test(f.name) && !/\.mp4$/i.test(cur.name))) byBase.set(base, f);
    }
    const videos = [...byBase.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).slice(0, 60).map((f) => ({
      name: f.name, label: f.name.replace(/\.(mp4|ogv)$/i, '').replace(/_/g, ' '), size: f.size,
      url: `https://archive.org/download/${encodeURIComponent(item.id)}/${encodeURIComponent(f.name)}`
    }));
    return {
      title: cut(Array.isArray(m.title) ? m.title[0] : m.title || item.title, 200),
      description: plain(Array.isArray(m.description) ? m.description.join(' ') : m.description).slice(0, 1200),
      creator: cut(Array.isArray(m.creator) ? m.creator[0] : m.creator || '', 120), year: m.year || (m.date ? String(m.date).slice(0, 4) : item.year),
      license: { label, url: /^https?:\/\//.test(lic) ? lic : '', open },
      videos, page: 'https://archive.org/details/' + encodeURIComponent(item.id)
    };
  }

  // ───────── Source : PeerTube ─────────
  async function ptCats(src) {
    if (ui.ptCats[src.id]) return ui.ptCats[src.id];
    try {
      const c = await getJson(src.base + '/api/v1/videos/categories');
      ui.ptCats[src.id] = Object.entries(c).map(([id, name]) => ({ id, title: PT_FR[name] || name }));
    } catch { ui.ptCats[src.id] = []; }
    return ui.ptCats[src.id];
  }
  async function ptBrowse(src, o) {
    const u = new URL(src.base + '/api/v1/videos');
    u.searchParams.set('start', String(o.page * o.count));
    u.searchParams.set('count', String(o.count));
    u.searchParams.set('sort', o.sort === 'recent' ? '-publishedAt' : '-trending');
    u.searchParams.set('nsfw', 'false');
    if (o.cat) u.searchParams.set('categoryOneOf', o.cat);
    if (o.query && o.query.trim()) u.searchParams.set('search', o.query.trim().slice(0, 100));
    const d = await getJson(u.toString());
    return {
      total: d.total,
      items: (d.data || []).map((v) => ({
        key: src.id + '|' + v.uuid, sourceId: src.id, id: v.uuid, title: cut(v.name, 200), year: v.publishedAt ? String(v.publishedAt).slice(0, 4) : '', date: v.publishedAt || '',
        thumb: httpsOnly(src.base + (v.thumbnailPath || '')), duration: v.duration || 0
      }))
    };
  }
  async function ptDetail(src, item) {
    const d = await getJson(`${src.base}/api/v1/videos/${encodeURIComponent(item.id)}`);
    let desc = '';
    try { desc = (await getJson(`${src.base}/api/v1/videos/${encodeURIComponent(item.id)}/description`)).description || ''; } catch { /* description facultative */ }
    const files = [...(d.files || []), ...(((d.streamingPlaylists || [])[0] || {}).files || [])]
      .filter((f) => httpsOnly(f.fileUrl) && /\.mp4(\?|$)/i.test(f.fileUrl))
      .sort((a, b) => ((b.resolution || {}).id || 0) - ((a.resolution || {}).id || 0));
    const seen = new Set();
    const videos = files.filter((f) => { const k = (f.resolution || {}).id; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((f) => ({ name: ((f.resolution || {}).label || 'Vidéo'), label: ((f.resolution || {}).label || 'Vidéo'), size: f.size, url: f.fileUrl, quality: (f.resolution || {}).id || 0 }));
    const licId = (d.licence || {}).id;
    return {
      title: cut(d.name || item.title, 200), description: plain(desc || d.description).slice(0, 1200),
      creator: cut((d.channel || {}).displayName || (d.account || {}).displayName || '', 120), year: d.publishedAt ? String(d.publishedAt).slice(0, 4) : item.year,
      license: { label: licId ? cut((d.licence || {}).label || 'Licence', 80) : 'Licence non précisée', url: '', open: PT_OPEN_LICENCES.has(licId) },
      videos, quality: true, page: httpsOnly(d.url) || src.base + '/w/' + item.id
    };
  }

  const browseOf = (src, o) => (src.kind === 'ia' ? iaBrowse(o) : ptBrowse(src, o));

  // ───────── Recherche globale ─────────
  let gToken = 0;
  async function globalSearch(q) {
    q = String(q || '').trim();
    const token = ++gToken;
    if (!q) { ui.g = null; refresh(); return; }
    ui.g = { q, res: enabledSources().map((s) => ({ src: s, items: [], total: 0, loading: true, error: '' })) };
    refresh();
    await Promise.all(ui.g.res.map(async (r) => {
      try {
        const out = await browseOf(r.src, { cat: '', query: q, sort: 'popular', page: 0, count: GLOBAL_N });
        if (token !== gToken) return;
        r.items = out.items; r.total = out.total;
      } catch (e) { if (token === gToken) r.error = 'ne répond pas (' + e.message + ')'; }
      if (token === gToken) { r.loading = false; refresh(); }
    }));
  }

  // ───────── Nouveautés et mises à jour ─────────
  const newItemsOf = (s) => {
    const d = data(); const since = d.seen[s.id] || 0;
    return ((d.news[s.id] || {}).items || []).filter((i) => Date.parse(i.date) > since);
  };
  async function checkUpdates(force) {
    const d = data();
    if (ui.checking) return;
    if (!force && Date.now() - d.checkedAt < REFRESH_MS) return;
    ui.checking = true; refresh();
    await Promise.all(enabledSources().map(async (s) => {
      try {
        const r = await browseOf(s, { cat: '', query: '', sort: 'recent', page: 0, count: 12 });
        if (!d.seen[s.id]) d.seen[s.id] = Date.now() - 3 * 864e5; // première fois : on montre les 3 derniers jours, sans tout inonder
        d.news[s.id] = { checkedAt: Date.now(), items: r.items.map((i) => ({ key: i.key, sourceId: i.sourceId, id: i.id, title: i.title, year: i.year, thumb: i.thumb, date: i.date })) };
      } catch { /* source injoignable : on garde les nouveautés précédentes */ }
    }));
    d.checkedAt = Date.now(); save();
    ui.checking = false; refresh();
  }
  function markAllSeen() { const d = data(); for (const s of sources()) d.seen[s.id] = Date.now(); save(); refresh(); }

  // ───────── Actions ─────────
  async function loadBrowse(reset) {
    const src = ui.source;
    if (!src) return;
    if (reset) { ui.items = []; ui.page = 0; ui.total = 0; }
    ui.loading = true; ui.error = ''; refresh();
    try {
      const r = await browseOf(src, { cat: ui.cat, query: ui.query, sort: ui.sort, page: ui.page, count: PAGE });
      if (ui.source !== src) return;
      ui.items = ui.items.concat(r.items); ui.total = r.total;
    } catch (e) {
      ui.error = 'Cette source ne répond pas pour le moment (' + e.message + '). Réessaie plus tard.';
    }
    ui.loading = false; refresh();
  }
  function openSource(src, query) {
    ui.draft.b = query || '';
    Object.assign(ui, { tab: 'browse', source: src, cat: '', sort: 'popular', query: query || '', items: [], page: 0, total: 0, detail: null, playing: null });
    data().seen[src.id] = Date.now(); save(); // l'ouvrir vaut « vu »
    if (src.kind === 'peertube') ptCats(src).then(refresh);
    loadBrowse(true);
  }
  async function openDetail(item) {
    const src = sourceById(item.sourceId);
    if (!src) return;
    Object.assign(ui, { tab: 'detail', detail: { item, loading: true }, playing: null, error: '' });
    refresh();
    try {
      const info = src.kind === 'ia' ? await iaDetail(item) : await ptDetail(src, item);
      ui.detail = { item, info };
    } catch (e) {
      ui.detail = { item, error: 'Impossible de charger cette fiche (' + e.message + ').' };
    }
    refresh();
  }
  const inLibrary = (key) => data().library.some((x) => x.key === key);
  function toggleLibrary(item, info) {
    const d = data();
    const i = d.library.findIndex((x) => x.key === item.key);
    if (i >= 0) d.library.splice(i, 1);
    else d.library.unshift({ key: item.key, sourceId: item.sourceId, id: item.id, title: (info && info.title) || item.title, year: item.year || '', thumb: item.thumb || '', at: Date.now() });
    save(); refresh();
  }
  const histFor = (itemKey, videoName) => data().history.find((h) => h.itemKey === itemKey && h.videoName === videoName);
  function saveProgress(item, info, video, pos, dur) {
    const d = data();
    let h = histFor(item.key, video.name);
    if (!h) { h = { itemKey: item.key, sourceId: item.sourceId, id: item.id, videoName: video.name, videoLabel: video.label }; d.history.unshift(h); }
    Object.assign(h, { title: (info && info.title) || item.title, thumb: item.thumb || '', year: item.year || '', pos, dur: dur || h.dur || 0, at: Date.now() });
    d.history = d.history.sort((a, b) => b.at - a.at).slice(0, 100);
    save();
  }
  async function addInstance(raw) {
    const base = validBase(String(raw || '').trim());
    if (!base) return 'Saisis une adresse en https:// (ex. https://framatube.org).';
    if (sources().some((s) => s.base === base)) return 'Cette instance est déjà dans la liste.';
    if (data().instances.length >= MAX_INSTANCES) return `${MAX_INSTANCES} instances au maximum.`;
    try {
      const d = await getJson(base + '/api/v1/videos?count=1');
      if (!d || typeof d.total !== 'number') throw new Error('réponse inattendue');
    } catch (e) { return 'Ce site ne ressemble pas à une instance PeerTube (' + e.message + ').'; }
    data().instances.push(base); save();
    return '';
  }

  // ───────── Sauvegarde et restauration ─────────
  function exportText() {
    const d = data();
    return JSON.stringify({ v: 1, instances: d.instances, disabled: d.disabled, library: d.library, history: d.history }, null, 1);
  }
  function importText(text) {
    let o;
    try { o = JSON.parse(text); } catch { return 'Ce texte n’est pas une sauvegarde valide.'; }
    if (!o || o.v !== 1) return 'Sauvegarde non reconnue.';
    const d = data();
    const str = (x, n) => cut(x, n);
    for (const b of Array.isArray(o.instances) ? o.instances.slice(0, MAX_INSTANCES) : []) {
      const base = validBase(b);
      if (base && !d.instances.includes(base) && !sources().some((s) => s.base === base) && d.instances.length < MAX_INSTANCES) d.instances.push(base);
    }
    d.disabled = Array.from(new Set([...d.disabled, ...(Array.isArray(o.disabled) ? o.disabled.map((x) => str(x, 200)) : [])]));
    const clean = (x) => ({ key: str(x.key, 300), sourceId: str(x.sourceId, 200), id: str(x.id, 200), title: str(x.title, 200), year: str(x.year, 10), thumb: httpsOnly(x.thumb) || '', at: Number(x.at) || Date.now() });
    for (const x of Array.isArray(o.library) ? o.library.slice(0, 500) : []) {
      if (x && x.key && !d.library.some((y) => y.key === x.key)) d.library.push(clean(x));
    }
    for (const x of Array.isArray(o.history) ? o.history.slice(0, 200) : []) {
      if (!x || !x.itemKey) continue;
      const mine = d.history.find((h) => h.itemKey === x.itemKey && h.videoName === x.videoName);
      const c = Object.assign(clean({ key: x.itemKey, ...x }), { itemKey: str(x.itemKey, 300), videoName: str(x.videoName, 300), videoLabel: str(x.videoLabel, 200), pos: Number(x.pos) || 0, dur: Number(x.dur) || 0, at: Number(x.at) || 0 });
      delete c.key;
      if (!mine) d.history.push(c); else if (c.at > mine.at) Object.assign(mine, c);
    }
    d.history = d.history.sort((a, b) => b.at - a.at).slice(0, 100);
    save();
    return '';
  }

  // ───────── Éléments d'interface ─────────
  function posterCard(item, opts = {}) {
    const c = el('div', 'card media');
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', `Ouvrir ${item.title}`);
    ctx.paint(c, { key: item.key, color: '' });
    c.append(el('span', 'big', ctx.letter(item.title)));
    if (item.thumb) {
      const img = el('img', 'poster');
      img.src = item.thumb; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove());
      c.append(img);
    }
    const meta = el('div', 'meta');
    meta.append(el('div', 't', item.title), el('div', 'u', [item.year, opts.sub].filter(Boolean).join(' · ')));
    c.append(meta);
    if (opts.badge) c.append(el('span', 'badge newb', opts.badge));
    if (opts.progress) { const p = el('div', 'progress'); const i = el('i'); i.style.width = Math.min(100, Math.round(opts.progress * 100)) + '%'; p.append(i); c.append(p); }
    if (opts.onRemove) {
      const tools = el('div', 'tools');
      tools.append(ctx.btn('del', '✕', 'Retirer', opts.onRemove));
      c.append(tools);
    }
    const open = opts.onOpen || (() => openDetail(item));
    c.addEventListener('click', open);
    c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
    return c;
  }

  function subnav() {
    const bar = el('div', 'chips subnav');
    for (const [id, label] of [['home', 'Accueil'], ['library', `Bibliothèque (${data().library.length})`], ['history', 'Historique'], ['sources', `Sources (${enabledSources().length})`]]) {
      const b = el('button', 'chip2' + (ui.tab === id ? ' on' : ''), label);
      b.addEventListener('click', () => { ui.tab = id; ui.playing = null; ui.confirmClear = false; ui.g = null; gToken++; refresh(); });
      bar.append(b);
    }
    return bar;
  }

  function resumeCards() {
    return data().history.slice(0, 14).map((h) => posterCard({ key: h.itemKey, sourceId: h.sourceId, id: h.id, title: h.title, year: h.year, thumb: h.thumb }, {
      sub: `à ${fmtTime(h.pos)}`, progress: h.dur ? h.pos / h.dur : 0
    }));
  }

  function newsCards() {
    const all = [];
    for (const s of enabledSources()) for (const i of newItemsOf(s)) all.push({ s, i });
    all.sort((a, b) => Date.parse(b.i.date) - Date.parse(a.i.date));
    return { total: all.length, cards: all.slice(0, 14).map(({ s, i }) => posterCard(i, { sub: s.title, badge: 'Nouveau' })) };
  }

  function globalForm(initial) {
    const form = el('form', 'searchrow');
    const input = el('input'); input.type = 'search'; input.placeholder = 'Rechercher dans toutes tes sources'; input.value = ui.draft.g || initial || ''; input.addEventListener('input', () => { ui.draft.g = input.value; }); input.setAttribute('aria-label', 'Recherche globale'); input.enterKeyHint = 'search';
    const go = el('button', 'primary', 'Chercher'); go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', (ev) => { ev.preventDefault(); ui.tab = 'home'; ui.draft.g = input.value; globalSearch(input.value); });
    return form;
  }

  function renderGlobal(root) {
    const g = ui.g;
    const done = g.res.filter((r) => !r.loading).length;
    root.append(el('h3', 'sechead', `Résultats pour « ${g.q} »`));
    root.append(el('p', 'pagesub', done < g.res.length ? `Recherche dans ${g.res.length} sources… (${done} répondu${done > 1 ? 's' : ''})` : `${g.res.reduce((n, r) => n + r.total, 0).toLocaleString('fr-FR')} résultats dans ${g.res.length} sources`));
    for (const r of g.res) {
      if (r.loading) { root.append(el('p', 'pagesub', `${r.src.title} : recherche…`)); continue; }
      if (r.error) { root.append(el('p', 'note', `${r.src.title} ${r.error}`)); continue; }
      if (!r.items.length) continue;
      const more = el('button', 'act', `Tout voir (${r.total.toLocaleString('fr-FR')}) →`);
      more.addEventListener('click', () => { ui.g = null; gToken++; openSource(r.src, g.q); });
      root.append(ctx.row(r.src.title, r.items.map((i) => posterCard(i)), '', more));
    }
    if (done === g.res.length && g.res.every((r) => !r.items.length && !r.error)) root.append(el('p', 'empty', 'Aucun résultat dans tes sources. Essaie un autre mot, ou ajoute des sources dans l’onglet Sources.'));
  }

  function renderHome(root) {
    const d = data();
    const bar = el('div', 'updbar');
    bar.append(el('span', 'updtxt', ui.checking ? 'Mise à jour des nouveautés…' : `Nouveautés mises à jour ${fmtAgo(d.checkedAt)}`));
    const upd = el('button', '', '↻ Mettre à jour'); upd.disabled = ui.checking;
    upd.addEventListener('click', () => checkUpdates(true));
    bar.append(upd);
    root.append(bar);

    const news = newsCards();
    if (news.cards.length) {
      const seen = el('button', 'act', 'Tout marquer comme vu');
      seen.addEventListener('click', markAllSeen);
      root.append(ctx.row('Nouveautés', news.cards, `${news.total}`, seen));
    }
    const hist = resumeCards();
    if (hist.length) root.append(ctx.row('Reprendre la lecture', hist));

    root.append(el('h3', 'sechead', 'Sources'));
    const g = el('div', 'grid');
    for (const s of sources()) {
      const on = isEnabled(s);
      const c = el('div', 'card chan svc' + (on ? '' : ' off'));
      c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', `Parcourir ${s.title}`);
      ctx.paint(c, { key: s.id, color: s.kind === 'ia' ? '#8a5a00' : '#f1680d' });
      c.append(el('span', 'big', ctx.letter(s.title)));
      const meta = el('div', 'meta');
      meta.append(el('div', 't', s.title), el('div', 'u', on ? s.sub : 'Désactivée'));
      c.append(meta);
      const n = on ? newItemsOf(s).length : 0;
      if (n) c.append(el('span', 'badge newb', `${n} nouveauté${n > 1 ? 's' : ''}`));
      c.addEventListener('click', () => openSource(s));
      c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openSource(s); });
      g.append(c);
    }
    root.append(g);
    root.append(el('p', 'note ok', 'Sources publiques uniquement. Chaque œuvre indique sa licence, et le téléchargement n’est proposé que pour les licences ouvertes (domaine public, Creative Commons).'));
  }

  function renderBrowse(root) {
    const src = ui.source;
    const head = el('div', 'backrow');
    const back = el('button', 'outline', '← Sources');
    back.addEventListener('click', () => { ui.tab = 'home'; refresh(); });
    head.append(back, el('h2', 'pagehead inline', src.title));
    root.append(head);

    const form = el('form', 'searchrow');
    const input = el('input'); input.type = 'search'; input.placeholder = `Rechercher sur ${src.title}`; input.value = ui.draft.b; input.addEventListener('input', () => { ui.draft.b = input.value; }); input.setAttribute('aria-label', 'Rechercher'); input.enterKeyHint = 'search';
    const go = el('button', 'primary', 'Chercher'); go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', (ev) => { ev.preventDefault(); ui.query = input.value; loadBrowse(true); });
    root.append(form);

    const sortBar = el('div', 'chips');
    for (const [id, label] of [['popular', 'Populaires'], ['recent', 'Récents']]) {
      const b = el('button', 'chip2' + (ui.sort === id ? ' on' : ''), label);
      b.addEventListener('click', () => { ui.sort = id; loadBrowse(true); });
      sortBar.append(b);
    }
    root.append(sortBar);

    const cats = src.kind === 'ia' ? IA_CATS : [{ id: '', title: 'Toutes' }, ...(ui.ptCats[src.id] || [])];
    const catBar = el('div', 'chips');
    for (const c of cats) {
      const b = el('button', 'chip2' + (ui.cat === c.id ? ' on' : ''), c.title);
      b.addEventListener('click', () => { ui.cat = c.id; loadBrowse(true); });
      catBar.append(b);
    }
    root.append(catBar);

    if (ui.error) root.append(el('p', 'note', ui.error));
    if (ui.items.length) {
      root.append(ctx.grid(ui.items.map((i) => posterCard(i))));
      root.append(el('p', 'pagesub', `${ui.items.length} affichés sur ${ui.total.toLocaleString('fr-FR')}`));
    } else if (!ui.loading && !ui.error) root.append(el('p', 'empty', 'Aucun résultat.'));
    if (ui.loading) root.append(el('p', 'pagesub', 'Chargement…'));
    else if (ui.items.length && ui.items.length < ui.total) {
      const more = el('button', 'primary more', 'Charger la suite');
      more.addEventListener('click', () => { ui.page += 1; loadBrowse(false); });
      root.append(more);
    }
  }

  function player(item, info, video) {
    const box = el('div', 'playerbox');
    const v = el('video');
    v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.src = video.url;
    const prior = histFor(item.key, video.name);
    let last = 0;
    v.addEventListener('loadedmetadata', () => { if (prior && prior.pos > 5 && prior.pos < (v.duration || Infinity) - 10) v.currentTime = prior.pos; });
    const persist = () => { if (v.currentTime > 1) saveProgress(item, info, video, v.currentTime, v.duration); };
    v.addEventListener('timeupdate', () => { if (Date.now() - last > 4000) { last = Date.now(); persist(); } });
    v.addEventListener('pause', persist);
    v.addEventListener('ended', () => saveProgress(item, info, video, 0, v.duration));
    v.addEventListener('error', () => { box.append(el('p', 'note', 'Ce navigateur ne peut pas lire ce fichier. Utilise « Voir sur le site d’origine ».')); });
    window.addEventListener('pagehide', persist, { once: true });
    box.append(v);
    return { box, video: v };
  }

  function renderDetail(root) {
    const dt = ui.detail;
    const back = el('button', 'outline', '← Retour');
    back.addEventListener('click', () => { ui.tab = ui.source ? 'browse' : 'home'; ui.playing = null; refresh(); });
    root.append(back);
    if (!dt) return;
    const item = dt.item;
    if (dt.loading) { root.append(el('p', 'pagesub', 'Chargement de la fiche…')); return; }
    if (dt.error) { root.append(el('p', 'note', dt.error)); return; }
    const info = dt.info;

    if (ui.playing) {
      const { box, video } = player(item, info, ui.playing);
      root.append(box);
      video.play().catch(() => { /* lecture manuelle */ });
    }

    const wrap = el('div', 'detail');
    const poster = el('div', 'dposter');
    ctx.paint(poster, { key: item.key, color: '' });
    if (item.thumb) { const img = el('img'); img.src = item.thumb; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', () => img.remove()); poster.append(img); }
    const body = el('div', 'dbody');
    body.append(el('h2', 'pagehead inline', info.title));
    body.append(el('p', 'pagesub', [info.year, info.creator].filter(Boolean).join(' · ')));
    const lic = el('p', 'licline');
    lic.append(el('span', 'lic' + (info.license.open ? ' open' : ''), info.license.label));
    if (info.license.url) { const a = el('a', '', 'voir la licence'); a.href = info.license.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; lic.append(' ', a); }
    body.append(lic);

    const actions = el('div', 'hero-actions');
    const first = info.videos[0];
    if (first) {
      const h = histFor(item.key, first.name);
      const play = el('button', 'primary', h && h.pos > 5 ? `▶ Reprendre à ${fmtTime(h.pos)}` : '▶ Lire');
      play.addEventListener('click', () => { ui.playing = first; refresh(); window.scrollTo(0, 0); });
      actions.append(play);
    }
    const lib = el('button', '', inLibrary(item.key) ? '✓ Dans ma bibliothèque' : '＋ Bibliothèque');
    lib.addEventListener('click', () => toggleLibrary(item, info));
    actions.append(lib);
    const site = el('a', 'btnlink', 'Voir sur le site d’origine'); site.href = info.page; site.target = '_blank'; site.rel = 'noopener noreferrer';
    actions.append(site);
    body.append(actions);
    if (info.description) body.append(el('p', 'desc', info.description));
    wrap.append(poster, body);
    root.append(wrap);

    if (info.videos.length === 0) root.append(el('p', 'note', 'Aucun fichier lisible directement dans le navigateur. Utilise « Voir sur le site d’origine ».'));
    if (info.videos.length > 1 || info.quality) {
      root.append(el('h3', 'sechead', info.quality ? 'Qualités' : `Épisodes et fichiers (${info.videos.length})`));
      const list = el('div', 'files');
      for (const f of info.videos) {
        const row = el('div', 'frow' + (ui.playing && ui.playing.name === f.name ? ' now' : ''));
        const h = histFor(item.key, f.name);
        row.append(el('span', 'fname', f.label + (h && h.pos > 5 ? ` · vu jusqu’à ${fmtTime(h.pos)}` : '')), el('span', 'fsize', fmtSize(f.size)));
        const p = el('button', '', '▶'); p.title = 'Lire'; p.setAttribute('aria-label', `Lire ${f.label}`);
        p.addEventListener('click', () => { ui.playing = f; refresh(); window.scrollTo(0, 0); });
        row.append(p);
        if (info.license.open) { const a = el('a', 'btnlink small', '⬇'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Télécharger (licence ouverte)'; a.setAttribute('aria-label', `Télécharger ${f.label}`); row.append(a); }
        list.append(row);
      }
      root.append(list);
    } else if (info.license.open && first) {
      const a = el('a', 'btnlink', `⬇ Télécharger (${fmtSize(first.size) || 'licence ouverte'})`); a.href = first.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      root.append(a);
    }
    root.append(el('p', 'note ok', info.license.open
      ? 'Licence ouverte : le téléchargement est proposé. Respecte les conditions de la licence (mention de l’auteur, usage non commercial selon le cas).'
      : 'Licence non précisée ou restrictive : lecture en ligne seulement, pas de téléchargement.'));
  }

  function renderLibrary(root) {
    root.append(el('h2', 'pagehead', 'Bibliothèque'));
    const lib = data().library;
    if (!lib.length) { root.append(el('p', 'empty', 'Ta bibliothèque est vide. Ouvre une œuvre et touche « ＋ Bibliothèque ».')); return; }
    const ids = [...new Set(lib.map((x) => x.sourceId))];
    if (ids.length > 1) {
      const bar = el('div', 'chips');
      for (const id of ['', ...ids]) {
        const s = id ? sourceById(id) : null;
        const b = el('button', 'chip2' + (ui.libFilter === id ? ' on' : ''), id ? (s ? s.title : id) : `Tout (${lib.length})`);
        b.addEventListener('click', () => { ui.libFilter = id; refresh(); });
        bar.append(b);
      }
      root.append(bar);
    }
    const shown = lib.filter((x) => !ui.libFilter || x.sourceId === ui.libFilter);
    root.append(ctx.grid(shown.map((x) => posterCard(x, { sub: (sourceById(x.sourceId) || {}).title, onRemove: () => { data().library = data().library.filter((y) => y.key !== x.key); save(); refresh(); } }))));
  }

  function renderHistory(root) {
    root.append(el('h2', 'pagehead', 'Historique'));
    const h = data().history;
    if (!h.length) { root.append(el('p', 'empty', 'Rien de regardé pour le moment. Ta position est enregistrée pendant la lecture.')); return; }
    const clear = el('button', 'danger', ui.confirmClear ? 'Confirmer : tout effacer' : 'Tout effacer');
    clear.addEventListener('click', () => { if (!ui.confirmClear) { ui.confirmClear = true; refresh(); return; } ui.confirmClear = false; data().history = []; save(); refresh(); });
    root.append(clear);
    root.append(ctx.grid(h.map((x) => posterCard({ key: x.itemKey, sourceId: x.sourceId, id: x.id, title: x.title, year: x.year, thumb: x.thumb }, {
      sub: `${x.videoLabel && x.videoLabel !== x.title ? x.videoLabel + ' · ' : ''}à ${fmtTime(x.pos)}`, progress: x.dur ? x.pos / x.dur : 0,
      onRemove: () => { data().history = data().history.filter((y) => y !== x); save(); refresh(); }
    }))));
  }

  function renderSources(root) {
    const d = data();
    root.append(el('h2', 'pagehead', 'Sources'));
    root.append(el('p', 'pagesub', 'Une source est un service qui publie son catalogue par une API ouverte. La recherche globale et les nouveautés interrogent les sources activées. Le contenu de chaque instance PeerTube est sous sa responsabilité : sa licence est affichée sur chaque fiche.'));
    const list = el('div', 'files');
    for (const s of sources()) {
      const on = isEnabled(s);
      const row = el('div', 'frow' + (on ? '' : ' offrow'));
      row.append(el('span', 'fname', s.title + ' · ' + s.sub));
      const tg = el('button', on ? 'on' : '', on ? '✓ Activée' : 'Désactivée');
      tg.addEventListener('click', () => { d.disabled = on ? [...d.disabled, s.id] : d.disabled.filter((x) => x !== s.id); save(); refresh(); });
      row.append(tg);
      if (s.custom) row.append(ctx.btn('danger', 'Retirer', `Retirer ${s.title}`, () => { d.instances = d.instances.filter((b) => 'pt:' + b !== s.id); d.disabled = d.disabled.filter((x) => x !== s.id); save(); refresh(); }));
      list.append(row);
    }
    root.append(list);

    const sug = SUGGESTED.filter((s) => !sources().some((x) => x.base === s.base));
    if (sug.length) {
      root.append(el('h3', 'sechead', 'Sources suggérées'));
      const sl = el('div', 'files');
      for (const s of sug) {
        const row = el('div', 'frow');
        row.append(el('span', 'fname', s.title + ' · ' + s.sub));
        const add = el('button', 'primary', 'Ajouter');
        add.addEventListener('click', async () => { add.disabled = true; ui.addMsg = await addInstance(s.base); refresh(); });
        row.append(add);
        sl.append(row);
      }
      root.append(sl);
    }

    root.append(el('h3', 'sechead', 'Ajouter une instance PeerTube'));
    const form = el('form', 'searchrow');
    const input = el('input'); input.type = 'url'; input.placeholder = 'https://peertube.example.org'; input.setAttribute('aria-label', 'Adresse d’une instance PeerTube'); input.autocomplete = 'off'; input.value = ui.draft.add; input.addEventListener('input', () => { ui.draft.add = input.value; });
    const add = el('button', 'primary', 'Ajouter'); add.type = 'submit';
    form.append(input, add);
    form.addEventListener('submit', async (ev) => { ev.preventDefault(); ui.addMsg = 'Vérification…'; refresh(); ui.addMsg = await addInstance(input.value); if (!ui.addMsg) ui.draft.add = ''; refresh(); });
    root.append(form);
    if (ui.addMsg) root.append(el('p', 'pagesub', ui.addMsg));

    root.append(el('h3', 'sechead', 'Sauvegarde'));
    root.append(el('p', 'pagesub', 'Tes sources, ta bibliothèque et ton historique restent dans ce navigateur. Exporte-les pour les garder ou les passer sur un autre appareil, puis colle le texte dans « Importer » là-bas.'));
    const ta = el('textarea', 'backup'); ta.rows = 5; ta.setAttribute('aria-label', 'Sauvegarde'); ta.placeholder = 'Texte de sauvegarde'; ta.value = ui.draft.backup; ta.addEventListener('input', () => { ui.draft.backup = ta.value; });
    const acts = el('div', 'hero-actions');
    const exp = el('button', '', 'Exporter'); exp.addEventListener('click', () => { ta.value = exportText(); ui.draft.backup = ta.value; ta.select(); ui.backupMsg = 'Sauvegarde générée : copie le texte ci-dessus.'; msg.textContent = ui.backupMsg; });
    const imp = el('button', 'primary', 'Importer'); imp.addEventListener('click', () => { const e = importText(ta.value); ui.backupMsg = e || 'Importé : sources, bibliothèque et historique fusionnés.'; refresh(); });
    acts.append(exp, imp);
    const msg = el('p', 'pagesub', ui.backupMsg);
    root.append(ta, acts, msg);
  }

  // ───────── Entrées publiques ─────────
  window.Explore = {
    /** Dessine la page « Explorer » dans `root`. */
    render(root, c) {
      ctx = c;
      pid = (c.state.profile && c.state.profile.id) || 'default';
      root.append(el('h2', 'pagehead', 'Explorer'));
      root.append(el('p', 'pagesub', 'Films et séries de sources publiques : recherche dans toutes tes sources, nouveautés, lecteur intégré, bibliothèque et reprise à la minute près.'));
      if (['home', 'library', 'history', 'sources'].includes(ui.tab)) root.append(globalForm(ui.g ? ui.g.q : ''));
      root.append(subnav());
      if (ui.tab === 'home' && ui.g) renderGlobal(root);
      else if (ui.tab === 'browse' && ui.source) renderBrowse(root);
      else if (ui.tab === 'detail') renderDetail(root);
      else if (ui.tab === 'library') renderLibrary(root);
      else if (ui.tab === 'history') renderHistory(root);
      else if (ui.tab === 'sources') renderSources(root);
      else renderHome(root);
      if (!ui.autoChecked[pid]) { ui.autoChecked[pid] = true; setTimeout(() => checkUpdates(false), 0); } // mise à jour automatique à l'ouverture
    },
    /** Rangée « Reprendre » pour l'accueil, ou null s'il n'y a rien à reprendre. */
    homeRow(c) {
      ctx = ctx || c;
      pid = (c.state.profile && c.state.profile.id) || 'default';
      const cards = resumeCards();
      return cards.length ? c.row('Reprendre un film ou une série', cards) : null;
    }
  };
})();
