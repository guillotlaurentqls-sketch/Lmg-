'use strict';

const $ = (id) => document.getElementById(id);
let state = null;
let page = 'home'; // 'home' | 'cat' | 'tv' | 'list' | 'fav'
let query = '';
let manage = false; // écran des profils en mode « gérer »
let lastSig = '';

// ───────────── Utilitaires ─────────────

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const letter = (t) => (t || '?').trim().charAt(0).toUpperCase() || '?';
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');
const looksLikeUrl = (v) => /[./:]/.test(v) && !/\s{2,}/.test(v.trim());

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(cls, text, title, onClick) {
  const b = el('button', cls, text);
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(ev); });
  return b;
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.]+\))$/i;
function hue(key) { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function paint(node, e) {
  if (e.color && SAFE_COLOR.test(e.color)) { // couleur du thème du site, assombrie pour garder le texte lisible
    node.style.background = `linear-gradient(135deg, color-mix(in srgb, ${e.color} 62%, #000), color-mix(in srgb, ${e.color} 22%, #000))`;
    return;
  }
  const h = hue(e.key);
  node.style.background = `linear-gradient(135deg, hsl(${h} 55% 34%), hsl(${(h + 45) % 360} 60% 16%))`;
}

async function openFrom(input, opts) {
  const r = await window.launcher.open(input, opts);
  const err = $('homeError');
  if (r && !r.ok) { err.textContent = r.error; err.hidden = false; } else err.hidden = true;
  return r;
}

function scroller(track) {
  const left = el('button', 'arrow left', '‹'), right = el('button', 'arrow right', '›');
  left.setAttribute('aria-label', 'Défiler à gauche'); right.setAttribute('aria-label', 'Défiler à droite');
  left.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
  right.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
  return [left, right];
}

// ───────────── Cartes ─────────────

function card(e) {
  const c = el('div', 'card' + (e.later ? ' flag' : ''));
  c.tabIndex = 0;
  c.setAttribute('role', 'button');
  c.setAttribute('aria-label', `Ouvrir ${e.title}`);
  paint(c, e);
  c.append(el('span', 'big', letter(e.title)));
  if (e.icon) { const i = el('img', 'ico'); i.src = e.icon; i.alt = ''; c.append(i); }
  const meta = el('div', 'meta');
  meta.append(el('div', 't', e.title), el('div', 'u', hostOf(e.url)));
  c.append(meta);
  if (e.group) c.append(el('span', 'badge', e.group));

  const tools = el('div', 'tools');
  tools.append(
    btn(e.favorite ? 'on' : '', e.favorite ? '★' : '☆', e.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => window.launcher.updateEntry(e.key, { favorite: !e.favorite })),
    btn(e.later ? 'on' : '', e.later ? '✓' : '＋', e.later ? 'Retirer de Ma liste' : 'Ajouter à Ma liste', () => window.launcher.updateEntry(e.key, { later: !e.later })),
    btn('', '✎', 'Renommer, classer dans une collection', () => editEntry(e)),
    btn('del', '✕', 'Retirer de la bibliothèque', () => window.launcher.removeEntry(e.key))
  );
  c.append(tools);
  const open = () => openFrom(e.url, { reuse: true });
  c.addEventListener('click', open);
  c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  return c;
}

function chanCard(ch) {
  const c = el('div', 'card chan');
  c.tabIndex = 0;
  c.setAttribute('role', 'button');
  c.setAttribute('aria-label', `Ouvrir ${ch.title}`);
  paint(c, { key: ch.title, color: '' });
  c.append(el('span', 'big', letter(ch.title)));
  const meta = el('div', 'meta');
  meta.append(el('div', 't', ch.title), el('div', 'u', hostOf(ch.url)));
  c.append(meta);
  const tools = el('div', 'tools');
  tools.append(btn('', '＋', 'Ajouter en plus, sans quitter l’accueil (pour la mosaïque)', () => openFrom(ch.url, { chain: true, background: true })));
  c.append(tools);
  const open = () => openFrom(ch.url, { chain: true });
  c.addEventListener('click', open);
  c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  return c;
}

function catCard(c) {
  const k = el('div', 'card chan');
  k.tabIndex = 0;
  k.setAttribute('role', 'button');
  k.setAttribute('aria-label', `Ouvrir ${c.title} sur ${c.provider}`);
  paint(k, { key: c.cat + c.title, color: '' });
  k.append(el('span', 'big', letter(c.title)));
  const meta = el('div', 'meta');
  meta.append(el('div', 't', c.title), el('div', 'u', c.provider));
  k.append(meta);
  const open = () => openFrom(c.url, { chain: true });
  k.addEventListener('click', open);
  k.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  return k;
}

const allCategories = () => (state.providers || []).flatMap((p) => (p.categories || []).map((c) => ({ ...c, provider: p.title })));

function searchChips(q) {
  const box = el('div', 'chips');
  box.append(el('span', 'chips-l', `Chercher « ${q.trim()} » sur :`));
  for (const p of (state.providers || []).filter((x) => x.search)) {
    const b = el('button', 'chip2', p.title);
    b.addEventListener('click', () => openFrom(p.search.replace('{q}', encodeURIComponent(q.trim())), { chain: true }));
    box.append(b);
  }
  return box;
}

function runningCard(t) {
  const c = el('div', 'card chan running');
  c.tabIndex = 0;
  c.setAttribute('role', 'button');
  paint(c, { key: t.key, color: t.color });
  c.append(el('span', 'big', letter(t.title)));
  if (t.icon) { const i = el('img', 'ico'); i.src = t.icon; i.alt = ''; c.append(i); }
  const meta = el('div', 'meta');
  meta.append(el('div', 't', t.title), el('div', 'u', hostOf(t.url)));
  c.append(meta, el('span', 'live', t.audible ? '🔊 en cours' : 'ouvert'));
  const tools = el('div', 'tools');
  tools.append(btn('del', '✕', 'Fermer ce site', () => window.launcher.closeTab(t.id)));
  c.append(tools);
  c.addEventListener('click', () => window.launcher.activateTab(t.id));
  c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') window.launcher.activateTab(t.id); });
  return c;
}

function row(title, cards, note, extra) {
  const r = el('section', 'row');
  const h = el('h2', '', title);
  if (note) h.append(el('small', '', note));
  if (extra) h.append(extra);
  const track = el('div', 'track');
  for (const c of cards) track.append(c);
  r.append(h, track, ...scroller(track));
  return r;
}

function grid(cards) {
  const g = el('div', 'grid');
  for (const c of cards) g.append(c);
  return g;
}

// ───────────── Pages ─────────────

function hero(recent) {
  const h = el('section', 'hero');
  const body = el('div', 'hero-body');
  if (!recent.length) {
    h.classList.add('welcome');
    h.dataset.letter = '▶';
    body.append(
      el('p', 'eyebrow', 'Bienvenue'),
      el('h1', '', `Bonjour ${state.profile.name}`),
      el('p', 'hero-sub', 'Colle l’adresse d’un site dans la barre du haut : il s’ouvre en direct, sans publicités, et rejoint ta bibliothèque.')
    );
    h.append(body);
    return h;
  }
  const e = recent[0];
  paint(h, e);
  h.dataset.letter = letter(e.title);
  const actions = el('div', 'hero-actions');
  const play = el('button', 'primary', '▶ Reprendre');
  play.addEventListener('click', () => openFrom(e.lastUrl || e.url, { reuse: true }));
  const later = el('button', '', e.later ? '✓ Dans Ma liste' : '＋ Ma liste');
  later.addEventListener('click', () => window.launcher.updateEntry(e.key, { later: !e.later }));
  const home = el('button', '', 'Page d’accueil du site');
  home.addEventListener('click', () => openFrom(e.url, {}));
  actions.append(play, later, home);
  body.append(
    el('p', 'eyebrow', 'Reprendre'),
    el('h1', '', e.title),
    el('p', 'hero-sub', `${hostOf(e.url)} · dernière visite le ${fmtDate(e.lastOpened)}${e.opens > 1 ? ` · ${e.opens} ouvertures` : ''}`),
    actions
  );
  h.append(body);
  return h;
}

function runningRow() {
  if (!state.tabs.length) return null;
  const n = state.tabs.length;
  let extra = null;
  if (n > 1) { extra = el('button', 'act primary', '▦ Tout voir en mosaïque'); extra.addEventListener('click', () => window.launcher.showView(true)); }
  return row('En cours', state.tabs.map(runningCard), `${n} site${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''}`, extra);
}

function renderHome() {
  const root = $('page');
  const lib = state.library;
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr');
  const recent = lib.filter((e) => e.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened);
  root.append(hero(recent));
  const running = runningRow(); if (running) root.append(running);
  if (recent.length) root.append(row('Reprendre', recent.slice(0, 14).map(card)));
  const later = lib.filter((e) => e.later).sort(byTitle);
  if (later.length) root.append(row('Ma liste', later.map(card), `${later.length}`));
  const favs = lib.filter((e) => e.favorite).sort(byTitle);
  if (favs.length) root.append(row('Favoris', favs.map(card), `${favs.length}`));
  const groups = [...new Set(lib.map((e) => e.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  for (const g of groups) root.append(row(g, lib.filter((e) => e.group === g).sort(byTitle).map(card)));
  const others = lib.filter((e) => !e.group).sort(byTitle);
  if (others.length) root.append(row('Mes sites', others.map(card), `${others.length}`));
  const cats = allCategories();
  if (cats.length) {
    const more = el('button', 'act', 'Toutes les catégories →');
    more.addEventListener('click', () => go('cat'));
    root.append(row('Films, séries, documentaires', cats.slice(0, 14).map(catCard), '', more));
  }
  if (state.channels.length) {
    const first = state.channels.filter((c) => c.group !== 'Guide TV').slice(0, 14);
    const more = el('button', 'act', 'Toutes les chaînes →');
    more.addEventListener('click', () => go('tv'));
    root.append(row('Chaînes TV', first.map(chanCard), '', more));
  }
  $('groupList').replaceChildren(...groups.map((g) => { const o = document.createElement('option'); o.value = g; return o; }));
}

function renderCategories() {
  const root = $('page');
  root.append(el('h2', 'pagehead', 'Catégories'));
  root.append(el('p', 'pagesub', 'Films, séries, documentaires… : chaque carte ouvre la page de la catégorie sur le site de la plateforme, en direct. Pour un titre précis, utilise la recherche.'));
  const cats = allCategories();
  const names = [...new Set(cats.map((c) => c.cat))];
  for (const n of names) root.append(row(n, cats.filter((c) => c.cat === n).map(catCard)));
}

function renderTv() {
  const root = $('page');
  root.append(el('h2', 'pagehead', 'Chaînes TV'));
  root.append(el('p', 'pagesub', 'Pages officielles en direct de chaque chaîne : le site s’affiche tel quel, programmes compris. « ＋ » ajoute une chaîne sans quitter l’accueil, puis « Tout voir en mosaïque ».'));
  const running = runningRow(); if (running) root.append(running);
  const groups = [...new Set(state.channels.map((c) => c.group))];
  for (const g of groups) root.append(row(g, state.channels.filter((c) => c.group === g).map(chanCard)));
}

function renderCollection(title, sub, entries, emptyText) {
  const root = $('page');
  root.append(el('h2', 'pagehead', title), el('p', 'pagesub', sub));
  if (!entries.length) { root.append(el('p', 'empty', emptyText)); return; }
  root.append(grid(entries.map(card)));
}

function renderSearch() {
  const root = $('page');
  const q = norm(query);
  const libHits = state.library.filter((e) => norm(`${e.title} ${e.group} ${hostOf(e.url)}`).includes(q));
  const chanHits = state.channels.filter((c) => norm(`${c.title} ${c.group} ${hostOf(c.url)}`).includes(q));
  const catHits = allCategories().filter((c) => norm(`${c.title} ${c.cat} ${c.provider}`).includes(q));
  root.append(el('h2', 'pagehead', `Résultats pour « ${query.trim()} »`));
  root.append(searchChips(query));
  if (catHits.length) { root.append(el('h3', 'sechead', 'Catégories')); root.append(grid(catHits.map(catCard))); }
  if (!libHits.length && !chanHits.length && !catHits.length) {
    root.append(el('p', 'empty', 'Rien dans ta bibliothèque, les chaînes ou les catégories. Lance la recherche sur une plateforme avec les boutons ci-dessus, ou colle une adresse complète (ex. arte.tv) puis Entrée.'));
    return;
  }
  if (libHits.length) { root.append(el('h3', 'sechead', 'Ma bibliothèque')); root.append(grid(libHits.map(card))); }
  if (chanHits.length) { root.append(el('h3', 'sechead', 'Chaînes TV')); root.append(grid(chanHits.map(chanCard))); }
}

function renderPage() {
  const root = $('page');
  root.replaceChildren();
  if (query.trim() && !looksLikeUrl(query)) return renderSearch();
  if (page === 'cat') return renderCategories();
  if (page === 'tv') return renderTv();
  if (page === 'list') return renderCollection('Ma liste', 'Les sites que tu veux garder sous la main. Ajoute-en avec « ＋ » sur une affiche.', state.library.filter((e) => e.later).sort((a, b) => a.title.localeCompare(b.title, 'fr')), 'Ta liste est vide. Survole (ou touche) une affiche et utilise « ＋ » pour l’ajouter ici.');
  if (page === 'fav') return renderCollection('Favoris', 'Tes sites préférés, avec ★.', state.library.filter((e) => e.favorite).sort((a, b) => a.title.localeCompare(b.title, 'fr')), 'Aucun favori pour le moment. Utilise ☆ sur une affiche.');
  return renderHome();
}

function go(p) {
  page = p; query = ''; $('homeInput').value = '';
  lastSig = ''; render();
  $('home').scrollTo({ top: 0 });
}

// ───────────── En-tête, profils, pied de page ─────────────

function avatarNode(p, cls) {
  const a = el('div', 'avatar' + (cls ? ' ' + cls : ''), p.emoji);
  a.style.background = p.color;
  return a;
}

function renderHeader() {
  for (const b of $('mainNav').querySelectorAll('button')) b.classList.toggle('on', b.dataset.page === page && !query.trim());
  const ab = $('btnProfile');
  ab.replaceChildren();
  ab.style.background = state.profile.color;
  ab.textContent = state.profile.emoji;
  ab.title = `Profil : ${state.profile.name}`;
}

function renderFooter() {
  const f = state.filters;
  const when = f.updatedAt ? new Date(f.updatedAt).toLocaleString('fr-FR') : '';
  const text = {
    loading: 'Filtres : téléchargement en cours…',
    updating: 'Filtres : mise à jour en cours…',
    cached: `Filtres chargés (dernière mise à jour : ${when})`,
    ready: `Filtres à jour (${when})`,
    stale: `Filtres : mise à jour impossible, liste du ${when} conservée`,
    error: `Filtres indisponibles : le blocage est inactif (${f.error || 'réseau ?'})`
  }[f.status] || '';
  $('filterStatus').textContent = text;
  $('totalBlocked').textContent = `${state.totalBlocked.toLocaleString('fr-FR')} requêtes bloquées au total`;
  const banner = $('drmBanner');
  if (state.drm.status === 'missing') {
    banner.hidden = false;
    banner.replaceChildren();
    const b = document.createElement('b');
    b.textContent = 'Widevine (DRM) absent. ';
    banner.append(b, 'Les vidéos protégées (flux chiffrés) ne se lanceront pas dans cette version d’Electron ; les vidéos non protégées fonctionnent. Voir le README, section « Vidéos protégées ».');
  } else banner.hidden = true;
}

function renderChooser() {
  const box = $('profiles');
  box.replaceChildren();
  for (const p of state.profiles) {
    const b = el('div', 'profile');
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', manage ? `Modifier le profil ${p.name}` : `Regarder en tant que ${p.name}`);
    b.append(avatarNode(p), el('span', 'nm', p.name), el('span', 'ct', `${p.count} site${p.count > 1 ? 's' : ''}`));
    if (manage) b.append(btn('edit', '✎', 'Modifier', () => editProfile(p)));
    const act = () => (manage ? editProfile(p) : window.launcher.selectProfile(p.id));
    b.addEventListener('click', act);
    b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') act(); });
    box.append(b);
  }
  if (state.profiles.length < 6) {
    const add = el('div', 'profile add');
    add.tabIndex = 0;
    add.setAttribute('role', 'button');
    add.setAttribute('aria-label', 'Ajouter un profil');
    const a = el('div', 'avatar', '＋');
    add.append(a, el('span', 'nm', 'Ajouter un profil'));
    add.addEventListener('click', () => editProfile(null));
    add.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') editProfile(null); });
    box.append(add);
  }
  $('btnManage').textContent = manage ? 'Terminé' : 'Gérer les profils';
}

function renderTabs() {
  const list = $('tabList');
  list.replaceChildren();
  for (const t of state.tabs) {
    const d = el('div', 'tab' + (t.id === state.activeId ? ' on' : ''));
    if (t.icon) { const i = el('img'); i.src = t.icon; i.alt = ''; d.append(i); }
    d.append(el('span', 'tt', t.title));
    if (t.audible) d.append(el('span', 'snd', '🔊'));
    d.append(btn('tx', '✕', 'Fermer cet onglet (Ctrl+W)', () => window.launcher.closeTab(t.id)));
    d.title = t.url;
    d.addEventListener('click', () => window.launcher.activateTab(t.id));
    list.append(d);
  }
  $('btnMosaic').hidden = state.tabs.length < 2;
  $('btnMosaic').classList.toggle('on', state.mosaic);
  $('btnMosaic').querySelector('.lbl').textContent = state.mosaic ? 'Mosaïque : activée' : 'Mosaïque';
}

function renderBar() {
  const s = state;
  $('bar').hidden = false;
  $('btnBack').disabled = !s.canGoBack;
  $('btnFwd').disabled = !s.canGoForward;
  if (document.activeElement !== $('addr')) $('addr').value = s.url || '';
  $('btnZoomReset').textContent = `${s.zoom} %`;
  const b = $('btnBlock');
  b.classList.toggle('off', !s.blockingEnabled);
  $('shieldLabel').textContent = s.blockingEnabled ? 'Blocage activé' : 'Blocage désactivé';
  $('blockedCount').textContent = String(s.pageBlocked);
  b.title = s.blockingEnabled
    ? `${s.pageBlocked} requêtes bloquées sur cette page, ${s.popupsBlocked} pop-ups. Cliquer pour désactiver sur ${s.siteKey}.`
    : `Blocage désactivé sur ${s.siteKey}. Cliquer pour le réactiver.`;
  const entry = s.library.find((e) => e.key === s.siteKey);
  const fav = !!(entry && entry.favorite), later = !!(entry && entry.later);
  $('btnPin').textContent = fav ? '★' : '☆';
  $('btnPin').classList.toggle('on', fav);
  $('btnPin').title = fav ? 'Retirer des favoris' : 'Ajouter aux favoris';
  $('btnLater').textContent = later ? '✓' : '＋';
  $('btnLater').classList.toggle('on', later);
  $('btnLater').title = later ? 'Retirer de Ma liste' : 'Ajouter à Ma liste';
  const chip = $('drmChip');
  chip.hidden = s.drm.status !== 'missing';
  if (!chip.hidden) { chip.textContent = 'DRM indisponible'; chip.className = 'chip warn'; chip.title = 'Widevine absent : les vidéos chiffrées ne peuvent pas être lues.'; }
}

// ───────────── Rendu principal ─────────────

function signature(s) {
  // On ne redessine l'accueil que si quelque chose de visible a changé (évite de perdre le défilement).
  return JSON.stringify([s.mode, s.profile && s.profile.id, s.profiles, s.settings, page, query, manage,
    s.library.map((e) => [e.key, e.title, e.group, e.favorite, e.later, e.lastOpened, e.color, e.icon.length]),
    s.tabs.map((t) => [t.id, t.title, t.audible, t.icon.length]), s.activeId, s.mosaic,
    (s.providers || []).length, s.drm.status, s.filters.status, s.filters.updatedAt, Math.floor(s.totalBlocked / 25)]);
}

function render() {
  const s = state;
  document.documentElement.dataset.theme = s.settings.theme;
  document.body.className = 'mode-' + (s.mode === 'site' ? 'site' : s.mode === 'profiles' ? 'profiles' : 'home');
  if (s.mode === 'site') { renderTabs(); renderBar(); return; }
  $('bar').hidden = true;
  const sig = signature(s);
  if (sig === lastSig) return;
  lastSig = sig;
  if (s.mode === 'profiles') return renderChooser();
  renderHeader(); renderPage(); renderFooter();
}

window.launcher.onState((s) => { state = s; render(); });
window.launcher.onFocusAddress(() => {
  const t = state && state.mode === 'site' ? $('addr') : $('homeInput');
  t.focus(); t.select();
});

// ───────────── Dialogues ─────────────

let editing = null;
function editEntry(e) {
  editing = e;
  $('dlgTitle').value = e.title;
  $('dlgGroup').value = e.group;
  $('dlgFav').checked = e.favorite;
  $('dlgLater').checked = e.later;
  $('dlgUrl').textContent = e.url;
  $('dlg').showModal();
  $('dlgTitle').select();
}
$('dlgForm').addEventListener('submit', () => {
  if (editing) window.launcher.updateEntry(editing.key, { title: $('dlgTitle').value, group: $('dlgGroup').value, favorite: $('dlgFav').checked, later: $('dlgLater').checked });
});
$('dlgCancel').addEventListener('click', () => $('dlg').close());
$('dlgRemove').addEventListener('click', () => { if (editing) window.launcher.removeEntry(editing.key); $('dlg').close(); });

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🐯', '🦄', '🚀', '🎬', '🎮', '🌸', '⚽', '🎧'];
const COLORS = ['#4f7cff', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#6b7280'];
let pEditing = null, pEmoji = EMOJIS[0], pColor = COLORS[0];

function paintProfileForm() {
  const pv = $('pPreview');
  pv.textContent = pEmoji; pv.style.background = pColor;
  $('pEmojis').replaceChildren(...EMOJIS.map((em) => { const b = el('button', 'sw' + (em === pEmoji ? ' on' : ''), em); b.type = 'button'; b.setAttribute('aria-label', `Avatar ${em}`); b.addEventListener('click', () => { pEmoji = em; paintProfileForm(); }); return b; }));
  $('pColors').replaceChildren(...COLORS.map((co) => { const b = el('button', 'sw' + (co === pColor ? ' on' : ''), ''); b.type = 'button'; b.style.background = co; b.setAttribute('aria-label', `Couleur ${co}`); b.addEventListener('click', () => { pColor = co; paintProfileForm(); }); return b; }));
}
function editProfile(p) {
  pEditing = p;
  pEmoji = p ? p.emoji : EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  pColor = p ? p.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  $('pdlgTitle').textContent = p ? 'Modifier le profil' : 'Nouveau profil';
  $('pName').value = p ? p.name : '';
  $('pDelete').hidden = !p || state.profiles.length <= 1;
  $('pError').hidden = true;
  paintProfileForm();
  $('pdlg').showModal();
  $('pName').focus();
}
$('pdlgForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const r = await window.launcher.saveProfile(pEditing ? pEditing.id : null, { name: $('pName').value, emoji: pEmoji, color: pColor });
  if (r && !r.ok) { $('pError').textContent = r.error; $('pError').hidden = false; return; }
  $('pdlg').close();
});
$('pCancel').addEventListener('click', () => $('pdlg').close());
$('pDelete').addEventListener('click', async () => {
  if (!pEditing) return;
  if (!confirm(`Supprimer le profil « ${pEditing.name} », sa bibliothèque et ses connexions aux sites ?`)) return;
  const r = await window.launcher.deleteProfile(pEditing.id);
  if (r && !r.ok) { $('pError').textContent = r.error; $('pError').hidden = false; return; }
  $('pdlg').close();
});

$('sdlgForm').addEventListener('submit', () => {});
$('sTheme').addEventListener('change', () => window.launcher.setSettings({ theme: $('sTheme').value }));
$('sAsk').addEventListener('change', () => window.launcher.setSettings({ askProfile: $('sAsk').checked }));

// ───────────── Événements ─────────────

$('mainNav').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-page]'); if (b) go(b.dataset.page); });

$('btnProfile').addEventListener('click', (ev) => { ev.stopPropagation(); $('profileMenu').hidden = !$('profileMenu').hidden; });
document.addEventListener('click', () => { $('profileMenu').hidden = true; });
$('profileMenu').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-act]'); if (!b) return;
  $('profileMenu').hidden = true;
  if (b.dataset.act === 'edit') editProfile(state.profiles.find((p) => p.id === state.profile.id));
  if (b.dataset.act === 'switch') { manage = false; window.launcher.openChooser(); }
  if (b.dataset.act === 'settings') { $('sTheme').value = state.settings.theme; $('sAsk').checked = state.settings.askProfile; $('sdlg').showModal(); }
});
$('btnManage').addEventListener('click', () => { manage = !manage; lastSig = ''; render(); });

// Recherche : on filtre en tapant ; une adresse (avec un point, « / » ou « : ») s'ouvre avec Entrée.
$('homeInput').addEventListener('input', () => { query = $('homeInput').value; $('homeError').hidden = true; lastSig = ''; render(); });
$('homeForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const v = $('homeInput').value;
  if (!v.trim()) return;
  if (looksLikeUrl(v)) {
    const r = await openFrom(v, {});
    if (r && r.ok) { query = ''; $('homeInput').value = ''; }
    return;
  }
  const first = $('page').querySelector('.grid .card');
  if (first) first.click(); // Entrée ouvre le premier résultat
  else { const chip = $('page').querySelector('.chip2'); if (chip) chip.click(); } // sinon, recherche sur la première plateforme
});
$('homeInput').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { query = ''; $('homeInput').value = ''; lastSig = ''; render(); } });

$('addr').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { window.launcher.open($('addr').value, { here: true }); $('addr').blur(); }
  if (e.key === 'Escape') { $('addr').value = state.url; $('addr').blur(); }
});
$('addr').addEventListener('focus', () => $('addr').select());
$('btnBack').addEventListener('click', () => window.launcher.back());
$('btnFwd').addEventListener('click', () => window.launcher.forward());
$('btnReload').addEventListener('click', () => window.launcher.reload());
$('btnHome').addEventListener('click', () => { $('homeInput').value = ''; query = ''; window.launcher.home(); });
$('btnNewTab').addEventListener('click', () => { $('homeInput').value = ''; query = ''; window.launcher.home(); });
$('btnMosaic').addEventListener('click', () => window.launcher.toggleMosaic());
$('btnZoomIn').addEventListener('click', () => window.launcher.zoomIn());
$('btnZoomOut').addEventListener('click', () => window.launcher.zoomOut());
$('btnZoomReset').addEventListener('click', () => window.launcher.zoomReset());
$('btnBlock').addEventListener('click', () => window.launcher.toggleBlocking());
$('btnPin').addEventListener('click', () => window.launcher.toggleFavorite(state.url));
$('btnLater').addEventListener('click', () => window.launcher.toggleLater(state.url));
$('btnFilters').addEventListener('click', () => window.launcher.updateFilters());

// Navigation au clavier entre les affiches (utile à la télécommande ou au clavier)
document.addEventListener('keydown', (ev) => {
  const c = ev.target.closest && ev.target.closest('.card, .profile');
  if (!c || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  const sibs = [...c.parentElement.children].filter((x) => x.tabIndex === 0);
  const i = sibs.indexOf(c);
  let target = null;
  if (ev.key === 'ArrowRight') target = sibs[i + 1];
  if (ev.key === 'ArrowLeft') target = sibs[i - 1];
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    const rowEl = c.closest('.row');
    const rows = [...document.querySelectorAll('#page .row')];
    const next = rows[rows.indexOf(rowEl) + (ev.key === 'ArrowDown' ? 1 : -1)];
    if (next) { const cards = [...next.querySelectorAll('.card')]; target = cards[Math.min(i, cards.length - 1)]; }
  }
  if (target) { ev.preventDefault(); target.focus(); target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
});

// Bouton « Retour » d'Android : remonte à l'accueil avant de quitter l'appli.
window.__backPressed = () => {
  if (!state || state.mode === 'profiles') return false;
  if (document.querySelector('dialog[open]')) { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); return true; }
  if (query.trim() || page !== 'home') { go('home'); return true; }
  return false;
};

window.launcher.getState().then((s) => { state = s; render(); if (s.mode === 'home') $('homeInput').focus(); });
