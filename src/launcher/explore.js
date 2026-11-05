'use strict';
/*
 * Explorer (version web) : parcourir, chercher et regarder des films et séries depuis des sources publiques
 * qui proposent une API ouverte : Internet Archive et les instances PeerTube. Comme dans une appli de lecture
 * à sources : bibliothèque, historique, reprise à la minute près. Chaque œuvre affiche sa licence ;
 * le téléchargement n'est proposé que pour les licences ouvertes (domaine public, Creative Commons).
 * Rien n'est copié : les vidéos sont lues depuis le serveur de la source.
 */
(() => {
  const KEY = 'adbl.explore.v1';
  const PAGE = 24;

  const IA = { id: 'ia', kind: 'ia', title: 'Internet Archive', sub: 'Films et séries du domaine public ou sous licence ouverte' };
  const IA_CATS = [
    { id: 'feature_films', title: 'Longs métrages' },
    { id: 'classic_tv', title: 'Télévision classique' },
    { id: 'silent_films', title: 'Films muets' },
    { id: 'animationandcartoons', title: 'Animation' },
    { id: 'SciFi_Horror', title: 'Science-fiction et horreur' },
    { id: 'prelinger', title: 'Archives Prelinger' }
  ];
  const PT_DEFAULT = { id: 'pt:https://framatube.org', kind: 'peertube', base: 'https://framatube.org', title: 'Framatube', sub: 'Vidéos libres (PeerTube)' };
  const PT_FR = { Music: 'Musique', Films: 'Films', Vehicles: 'Véhicules', Art: 'Art', Sports: 'Sport', Travels: 'Voyages', Gaming: 'Jeux vidéo', People: 'Personnes', Comedy: 'Humour', Entertainment: 'Divertissement', 'News & Politics': 'Actualités et politique', 'How To': 'Tutoriels', Education: 'Éducation', Activism: 'Militantisme', 'Science & Technology': 'Sciences et technologies', Animals: 'Animaux', Kids: 'Enfants', Food: 'Cuisine' };
  const PT_OPEN_LICENCES = new Set([1, 2, 3, 4, 5, 6, 7]); // Creative Commons (toutes variantes) et domaine public

  // ───────── Données par profil (stockage du navigateur) ─────────
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { store = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* stockage plein */ } };
  let pid = 'default';
  const data = () => (store[pid] = Object.assign({ library: [], history: [], instances: [] }, store[pid] || {}));

  // ───────── État de l'écran ─────────
  const ui = { tab: 'home', source: null, cat: '', sort: 'popular', query: '', items: [], total: 0, page: 0, loading: false, error: '', detail: null, playing: null, ptCats: {}, confirmClear: false };
  let ctx = null;
  const refresh = () => ctx && ctx.refresh();

  // ───────── Utilitaires ─────────
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const plain = (html) => { try { return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.trim(); } catch { return ''; } };
  const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };
  const fmtSize = (b) => { b = Number(b) || 0; return b > 1e9 ? (b / 1e9).toFixed(1) + ' Go' : b > 1e6 ? Math.round(b / 1e6) + ' Mo' : b ? Math.round(b / 1e3) + ' Ko' : ''; };
  async function getJson(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const sources = () => [IA, PT_DEFAULT, ...data().instances.map((b) => ({ id: 'pt:' + b, kind: 'peertube', base: b, title: new URL(b).hostname, sub: 'Instance PeerTube ajoutée', custom: true }))];
  const sourceById = (id) => sources().find((s) => s.id === id);

  // ───────── Source : Internet Archive ─────────
  const words = (q) => String(q || '').replace(/["():\[\]\\{}^~*?!+\-&|/]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  async function iaBrowse() {
    const parts = ['mediatype:movies', `collection:(${ui.cat || 'feature_films'})`];
    const w = words(ui.query);
    if (w.length) parts.push(`(title:(${w.join(' AND ')}) OR subject:(${w.join(' AND ')}) OR creator:(${w.join(' AND ')}))`);
    const u = new URL('https://archive.org/advancedsearch.php');
    u.searchParams.set('q', parts.join(' AND '));
    for (const f of ['identifier', 'title', 'year', 'creator']) u.searchParams.append('fl[]', f);
    u.searchParams.set('rows', String(PAGE));
    u.searchParams.set('page', String(ui.page + 1));
    u.searchParams.append('sort[]', ui.sort === 'recent' ? 'addeddate desc' : 'downloads desc');
    u.searchParams.set('output', 'json');
    const d = await getJson(u.toString());
    return {
      total: d.response.numFound,
      items: d.response.docs.map((x) => ({
        key: 'ia|' + x.identifier, sourceId: 'ia', id: x.identifier,
        title: String(Array.isArray(x.title) ? x.title[0] : x.title || x.identifier), year: x.year || '',
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
      title: String(Array.isArray(m.title) ? m.title[0] : m.title || item.title),
      description: plain(Array.isArray(m.description) ? m.description.join(' ') : m.description).slice(0, 1200),
      creator: String(Array.isArray(m.creator) ? m.creator[0] : m.creator || ''), year: m.year || (m.date ? String(m.date).slice(0, 4) : item.year),
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
  async function ptBrowse(src) {
    const u = new URL(src.base + '/api/v1/videos');
    u.searchParams.set('start', String(ui.page * PAGE));
    u.searchParams.set('count', String(PAGE));
    u.searchParams.set('sort', ui.sort === 'recent' ? '-publishedAt' : '-trending');
    u.searchParams.set('nsfw', 'false');
    if (ui.cat) u.searchParams.set('categoryOneOf', ui.cat);
    if (ui.query.trim()) u.searchParams.set('search', ui.query.trim().slice(0, 100));
    const d = await getJson(u.toString());
    return {
      total: d.total,
      items: (d.data || []).map((v) => ({
        key: src.id + '|' + v.uuid, sourceId: src.id, id: v.uuid, title: String(v.name || ''), year: v.publishedAt ? String(v.publishedAt).slice(0, 4) : '',
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
      title: String(d.name || item.title), description: plain(desc || d.description).slice(0, 1200),
      creator: String((d.channel || {}).displayName || (d.account || {}).displayName || ''), year: d.publishedAt ? String(d.publishedAt).slice(0, 4) : item.year,
      license: { label: licId ? String((d.licence || {}).label || 'Licence') : 'Licence non précisée', url: '', open: PT_OPEN_LICENCES.has(licId) },
      videos, quality: true, page: httpsOnly(d.url) || src.base + '/w/' + item.id
    };
  }

  // ───────── Actions ─────────
  async function loadBrowse(reset) {
    const src = ui.source;
    if (!src) return;
    if (reset) { ui.items = []; ui.page = 0; ui.total = 0; }
    ui.loading = true; ui.error = ''; refresh();
    try {
      const r = src.kind === 'ia' ? await iaBrowse() : await ptBrowse(src);
      if (ui.source !== src) return;
      ui.items = ui.items.concat(r.items); ui.total = r.total;
    } catch (e) {
      ui.error = 'Cette source ne répond pas pour le moment (' + e.message + '). Réessaie plus tard.';
    }
    ui.loading = false; refresh();
  }
  function openSource(src) {
    Object.assign(ui, { tab: 'browse', source: src, cat: src.kind === 'ia' ? 'feature_films' : '', sort: 'popular', query: '', items: [], page: 0, total: 0, detail: null, playing: null });
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
    for (const [id, label] of [['home', 'Accueil'], ['library', `Bibliothèque (${data().library.length})`], ['history', 'Historique'], ['sources', 'Sources']]) {
      const b = el('button', 'chip2' + (ui.tab === id || (id === 'home' && ['browse', 'detail'].includes(ui.tab) && false) ? ' on' : ''), label);
      b.addEventListener('click', () => { ui.tab = id; ui.playing = null; ui.confirmClear = false; refresh(); });
      bar.append(b);
    }
    return bar;
  }

  function resumeCards() {
    return data().history.slice(0, 14).map((h) => posterCard({ key: h.itemKey, sourceId: h.sourceId, id: h.id, title: h.title, year: h.year, thumb: h.thumb }, {
      sub: `à ${fmtTime(h.pos)}`, progress: h.dur ? h.pos / h.dur : 0
    }));
  }

  function renderHome(root) {
    const hist = resumeCards();
    if (hist.length) root.append(ctx.row('Reprendre la lecture', hist));
    root.append(el('h3', 'sechead', 'Sources'));
    const g = el('div', 'grid');
    for (const s of sources()) {
      const c = el('div', 'card chan svc');
      c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', `Parcourir ${s.title}`);
      ctx.paint(c, { key: s.id, color: s.kind === 'ia' ? '#8a5a00' : '#f1680d' });
      c.append(el('span', 'big', ctx.letter(s.title)));
      const meta = el('div', 'meta');
      meta.append(el('div', 't', s.title), el('div', 'u', s.sub));
      c.append(meta);
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
    const input = el('input'); input.type = 'search'; input.placeholder = `Rechercher sur ${src.title}`; input.value = ui.query; input.setAttribute('aria-label', 'Rechercher'); input.enterKeyHint = 'search';
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
    root.append(ctx.grid(lib.map((x) => posterCard(x, { onRemove: () => { data().library = data().library.filter((y) => y.key !== x.key); save(); refresh(); } }))));
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
    root.append(el('h2', 'pagehead', 'Sources'));
    root.append(el('p', 'pagesub', 'Une source est un service qui publie son catalogue par une API ouverte. Tu peux ajouter n’importe quelle instance PeerTube par son adresse. Le contenu de chaque instance est sous sa responsabilité : sa licence est affichée sur chaque fiche.'));
    const list = el('div', 'files');
    for (const s of sources()) {
      const row = el('div', 'frow');
      row.append(el('span', 'fname', s.title + ' · ' + s.sub));
      if (s.custom) { const x = ctx.btn('danger', 'Retirer', `Retirer ${s.title}`, () => { data().instances = data().instances.filter((b) => 'pt:' + b !== s.id); save(); refresh(); }); row.append(x); }
      list.append(row);
    }
    root.append(list);
    const form = el('form', 'searchrow');
    const input = el('input'); input.type = 'url'; input.placeholder = 'https://peertube.example.org'; input.setAttribute('aria-label', 'Adresse d’une instance PeerTube'); input.autocomplete = 'off';
    const add = el('button', 'primary', 'Ajouter'); add.type = 'submit';
    const msg = el('p', 'pagesub');
    form.append(input, add);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      let base;
      try { const u = new URL(input.value.trim()); if (u.protocol !== 'https:') throw new Error(); base = u.origin; } catch { msg.textContent = 'Saisis une adresse en https:// (ex. https://framatube.org).'; return; }
      if (sources().some((s) => s.base === base)) { msg.textContent = 'Cette instance est déjà dans la liste.'; return; }
      if (data().instances.length >= 8) { msg.textContent = 'Huit instances au maximum.'; return; }
      msg.textContent = 'Vérification…';
      try {
        const d = await getJson(base + '/api/v1/videos?count=1');
        if (!d || typeof d.total !== 'number') throw new Error('réponse inattendue');
      } catch (e) { msg.textContent = 'Ce site ne ressemble pas à une instance PeerTube (' + e.message + ').'; return; }
      data().instances.push(base); save(); refresh();
    });
    root.append(form, msg);
  }

  // ───────── Entrées publiques ─────────
  window.Explore = {
    /** Dessine la page « Explorer » dans `root`. */
    render(root, c) {
      ctx = c;
      pid = (c.state.profile && c.state.profile.id) || 'default';
      root.append(el('h2', 'pagehead', 'Explorer'));
      root.append(el('p', 'pagesub', 'Films et séries de sources publiques, avec lecteur intégré, bibliothèque, historique et reprise à la minute près.'));
      root.append(subnav());
      if (ui.tab === 'browse' && ui.source) renderBrowse(root);
      else if (ui.tab === 'detail') renderDetail(root);
      else if (ui.tab === 'library') renderLibrary(root);
      else if (ui.tab === 'history') renderHistory(root);
      else if (ui.tab === 'sources') renderSources(root);
      else renderHome(root);
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
