'use strict';

const $ = (id) => document.getElementById(id);
let state = null;

function letter(title) { return (title || '?').trim().charAt(0).toUpperCase() || '?'; }
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

async function openFrom(input, errEl, opts) {
  const r = await window.launcher.open(input, opts);
  if (!r.ok) { errEl.textContent = r.error; errEl.hidden = false; }
  else errEl.hidden = true;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function hue(key) { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.]+\))$/i;
function paint(node, e) {
  if (e.color && SAFE_COLOR.test(e.color)) { // couleur du thème du site, assombrie pour garder le texte lisible
    node.style.background = `linear-gradient(135deg, color-mix(in srgb, ${e.color} 62%, #000), color-mix(in srgb, ${e.color} 22%, #000))`;
    return;
  }
  const h = hue(e.key);
  node.style.background = `linear-gradient(135deg, hsl(${h} 55% 34%), hsl(${(h + 45) % 360} 60% 16%))`;
}
function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''; }

function card(e) {
  const c = el('div', 'card');
  c.tabIndex = 0;
  paint(c, e);
  c.append(el('span', 'big', letter(e.title)));
  if (e.icon) { const i = el('img', 'ico'); i.src = e.icon; i.alt = ''; c.append(i); }
  const meta = el('div', 'meta');
  meta.append(el('div', 't', e.title), el('div', 'u', hostOf(e.url)));
  c.append(meta);
  if (e.group) c.append(el('span', 'badge', e.group));

  const tools = el('div', 'tools');
  const fav = el('button', e.favorite ? 'on' : '', e.favorite ? '★' : '☆');
  fav.title = e.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris';
  fav.addEventListener('click', (ev) => { ev.stopPropagation(); window.launcher.updateEntry(e.key, { favorite: !e.favorite }); });
  const edit = el('button', '', '✎');
  edit.title = 'Renommer, classer dans un groupe';
  edit.addEventListener('click', (ev) => { ev.stopPropagation(); editEntry(e); });
  const del = el('button', 'del', '✕');
  del.title = 'Retirer de la bibliothèque';
  del.addEventListener('click', (ev) => { ev.stopPropagation(); window.launcher.removeEntry(e.key); });
  tools.append(fav, edit, del);
  c.append(tools);

  const open = () => openFrom(e.url, $('homeError'), { reuse: true });
  c.addEventListener('click', open);
  c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  return c;
}

function row(title, entries, note) {
  const r = el('section', 'row');
  const h = el('h2', '', title);
  if (note) h.append(el('small', '', note));
  const track = el('div', 'track');
  for (const e of entries) track.append(card(e));
  const left = el('button', 'arrow left', '‹'), right = el('button', 'arrow right', '›');
  left.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
  right.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
  r.append(h, track, left, right);
  return r;
}

function renderLibrary() {
  const lib = state.library;
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr');
  const recent = lib.filter((e) => e.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened);

  // Bandeau : le dernier site ouvert
  const hero = $('hero');
  hero.hidden = recent.length === 0;
  if (recent.length) {
    const e = recent[0];
    paint(hero, e);
    $('heroTitle').textContent = e.title;
    $('heroSub').textContent = `${hostOf(e.url)} · dernière visite le ${fmtDate(e.lastOpened)}${e.opens > 1 ? ` · ${e.opens} ouvertures` : ''}`;
    $('heroPlay').onclick = () => openFrom(e.lastUrl || e.url, $('homeError'));
    $('heroHome').onclick = () => openFrom(e.url, $('homeError'));
  }

  const rows = $('rows');
  rows.replaceChildren();
  $('empty').hidden = lib.length > 0;

  if (recent.length) rows.append(row('Reprendre', recent.slice(0, 14)));
  const favs = lib.filter((e) => e.favorite).sort(byTitle);
  if (favs.length) rows.append(row('Favoris', favs));
  const groups = [...new Set(lib.map((e) => e.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  for (const g of groups) rows.append(row(g, lib.filter((e) => e.group === g).sort(byTitle)));
  const others = lib.filter((e) => !e.group).sort(byTitle);
  if (others.length) rows.append(row('Mes sites', others, `${others.length}`));

  $('groupList').replaceChildren(...groups.map((g) => { const o = document.createElement('option'); o.value = g; return o; }));
}

let editing = null;
function editEntry(e) {
  editing = e;
  $('dlgTitle').value = e.title;
  $('dlgGroup').value = e.group;
  $('dlgFav').checked = e.favorite;
  $('dlgUrl').textContent = e.url;
  $('dlg').showModal();
  $('dlgTitle').select();
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
  } else {
    banner.hidden = true;
  }
}

function renderTabs() {
  const list = $('tabList');
  list.replaceChildren();
  for (const t of state.tabs) {
    const d = el('div', 'tab' + (t.id === state.activeId ? ' on' : ''));
    if (t.icon) { const i = el('img'); i.src = t.icon; i.alt = ''; d.append(i); }
    d.append(el('span', 'tt', t.title));
    if (t.audible) d.append(el('span', 'snd', '🔊'));
    const x = el('button', 'tx', '✕');
    x.title = 'Fermer cet onglet (Ctrl+W)';
    x.addEventListener('click', (ev) => { ev.stopPropagation(); window.launcher.closeTab(t.id); });
    d.append(x);
    d.title = t.url;
    d.addEventListener('click', () => window.launcher.activateTab(t.id));
    list.append(d);
  }
  $('btnMosaic').hidden = state.tabs.length < 2;
  $('btnMosaic').classList.toggle('on', state.mosaic);
  $('btnMosaic').textContent = state.mosaic ? '▦ Mosaïque : activée' : '▦ Mosaïque';
}

function renderRunning() {
  const box = $('running');
  box.replaceChildren();
  box.hidden = state.tabs.length === 0;
  if (!state.tabs.length) return;
  const r = el('section', 'row');
  const h = el('h2', '', 'En cours');
  h.append(el('small', '', `${state.tabs.length} site${state.tabs.length > 1 ? 's' : ''} ouvert${state.tabs.length > 1 ? 's' : ''}`));
  if (state.tabs.length > 1) {
    const m = el('button', 'act primary', '▦ Tout voir en mosaïque');
    m.addEventListener('click', () => window.launcher.showView(true));
    h.append(m);
  }
  const track = el('div', 'track');
  for (const t of state.tabs) {
    const c = el('div', 'card chan running');
    c.tabIndex = 0;
    paint(c, { key: t.key, color: t.color });
    c.append(el('span', 'big', letter(t.title)));
    if (t.icon) { const i = el('img', 'ico'); i.src = t.icon; i.alt = ''; c.append(i); }
    const meta = el('div', 'meta');
    meta.append(el('div', 't', t.title), el('div', 'u', hostOf(t.url)));
    c.append(meta, el('span', 'live', t.audible ? '🔊 en cours' : 'ouvert'));
    const tools = el('div', 'tools');
    const del = el('button', 'del', '✕');
    del.title = 'Fermer ce site';
    del.addEventListener('click', (ev) => { ev.stopPropagation(); window.launcher.closeTab(t.id); });
    tools.append(del);
    c.append(tools);
    c.addEventListener('click', () => { window.launcher.activateTab(t.id); });
    track.append(c);
  }
  const left = el('button', 'arrow left', '‹'), right = el('button', 'arrow right', '›');
  left.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
  right.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
  r.append(h, track, left, right);
  box.append(r);
}

function chanCard(ch) {
  const c = el('div', 'card chan');
  c.tabIndex = 0;
  paint(c, { key: ch.title, color: '' });
  c.append(el('span', 'big', letter(ch.title)));
  const meta = el('div', 'meta');
  meta.append(el('div', 't', ch.title), el('div', 'u', hostOf(ch.url)));
  c.append(meta);
  const tools = el('div', 'tools');
  const add = el('button', '', '＋');
  add.title = 'Ajouter en plus (sans quitter l’accueil) : pour la mosaïque';
  add.addEventListener('click', (ev) => { ev.stopPropagation(); openFrom(ch.url, $('homeError'), { chain: true, background: true }); });
  tools.append(add);
  c.append(tools);
  const open = () => openFrom(ch.url, $('homeError'), { chain: true });
  c.addEventListener('click', open);
  c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  return c;
}

function renderTv() {
  const box = $('tv');
  box.replaceChildren();
  if (!state.channels.length) return;
  box.append(el('h2', 'tvhead', 'Chaînes TV'));
  box.append(el('p', 'tvsub', 'Pages officielles en direct de chaque chaîne : le site s’affiche tel quel, programmes compris. « ＋ » ajoute une chaîne sans quitter l’accueil, puis « Tout voir en mosaïque ».'));
  const groups = [...new Set(state.channels.map((c) => c.group))];
  for (const g of groups) {
    const r = el('section', 'row');
    r.append(el('h2', '', g));
    const track = el('div', 'track');
    for (const ch of state.channels.filter((c) => c.group === g)) track.append(chanCard(ch));
    const left = el('button', 'arrow left', '‹'), right = el('button', 'arrow right', '›');
    left.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
    right.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
    r.append(track, left, right);
    box.append(r);
  }
}

function renderBar() {
  const s = state;
  $('btnBack').disabled = !s.canGoBack;
  $('btnFwd').disabled = !s.canGoForward;
  if (document.activeElement !== $('addr')) $('addr').value = s.url || '';
  $('btnZoomReset').textContent = `${s.zoom} %`;
  const btn = $('btnBlock');
  btn.classList.toggle('off', !s.blockingEnabled);
  $('shieldLabel').textContent = s.blockingEnabled ? 'Blocage activé' : 'Blocage désactivé';
  $('blockedCount').textContent = String(s.pageBlocked);
  btn.title = s.blockingEnabled
    ? `${s.pageBlocked} requêtes bloquées sur cette page, ${s.popupsBlocked} pop-ups. Cliquer pour désactiver sur ${s.siteKey}.`
    : `Blocage désactivé sur ${s.siteKey}. Cliquer pour le réactiver.`;
  const isFav = state.library.some((e) => e.key === s.siteKey && e.favorite);
  $('btnPin').textContent = isFav ? '★' : '☆';
  $('btnPin').classList.toggle('on', isFav);
  $('btnPin').title = isFav ? 'Retirer des favoris' : 'Épingler ce site en favori';
  const chip = $('drmChip');
  chip.hidden = state.drm.status !== 'missing';
  if (!chip.hidden) { chip.textContent = 'DRM indisponible'; chip.className = 'chip warn'; chip.title = 'Widevine absent : les vidéos chiffrées ne peuvent pas être lues.'; }
}

function render() {
  document.body.className = state.mode === 'site' ? 'mode-site' : 'mode-home';
  $('bar').hidden = state.mode !== 'site';
  if (state.mode === 'home') { renderRunning(); renderLibrary(); renderTv(); }
  else renderTabs();
  renderFooter();
  if (state.mode === 'site') renderBar();
}

window.launcher.onState((s) => { state = s; render(); });
window.launcher.onFocusAddress(() => {
  const t = state && state.mode === 'site' ? $('addr') : $('homeInput');
  t.focus(); t.select();
});

$('homeForm').addEventListener('submit', (e) => { e.preventDefault(); openFrom($('homeInput').value, $('homeError')); });
$('addr').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { window.launcher.open($('addr').value, { here: true }).then((r) => { if (!r.ok) $('addr').classList.add('bad'); }); $('addr').blur(); }
  if (e.key === 'Escape') { $('addr').value = state.url; $('addr').blur(); }
});
$('addr').addEventListener('focus', () => $('addr').select());
$('btnBack').addEventListener('click', () => window.launcher.back());
$('btnFwd').addEventListener('click', () => window.launcher.forward());
$('btnReload').addEventListener('click', () => window.launcher.reload());
$('btnHome').addEventListener('click', () => { $('homeInput').value = ''; window.launcher.home(); });
$('btnNewTab').addEventListener('click', () => { $('homeInput').value = ''; window.launcher.home(); });
$('btnMosaic').addEventListener('click', () => window.launcher.toggleMosaic());
$('btnZoomIn').addEventListener('click', () => window.launcher.zoomIn());
$('btnZoomOut').addEventListener('click', () => window.launcher.zoomOut());
$('btnZoomReset').addEventListener('click', () => window.launcher.zoomReset());
$('btnBlock').addEventListener('click', () => window.launcher.toggleBlocking());
$('btnPin').addEventListener('click', () => window.launcher.toggleFavorite(state.url));
$('dlgForm').addEventListener('submit', () => {
  if (editing) window.launcher.updateEntry(editing.key, { title: $('dlgTitle').value, group: $('dlgGroup').value, favorite: $('dlgFav').checked });
});
$('dlgCancel').addEventListener('click', () => $('dlg').close());
$('dlgRemove').addEventListener('click', () => { if (editing) window.launcher.removeEntry(editing.key); $('dlg').close(); });
$('btnFilters').addEventListener('click', () => window.launcher.updateFilters());

window.launcher.getState().then((s) => { state = s; render(); $('homeInput').focus(); });
