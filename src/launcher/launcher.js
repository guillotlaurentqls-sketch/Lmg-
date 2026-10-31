'use strict';

const $ = (id) => document.getElementById(id);
let state = null;

function letter(title) { return (title || '?').trim().charAt(0).toUpperCase() || '?'; }
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

async function openFrom(input, errEl) {
  const r = await window.launcher.open(input);
  if (!r.ok) { errEl.textContent = r.error; errEl.hidden = false; }
  else errEl.hidden = true;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderFavs() {
  const box = $('favs');
  box.replaceChildren();
  $('favSection').hidden = state.favorites.length === 0;
  for (const f of state.favorites) {
    const tile = el('div', 'tile');
    tile.append(el('div', 'letter', letter(f.title)), el('div', 't', f.title), el('div', 'u', hostOf(f.url)));
    const x = el('button', 'x', '✕');
    x.title = 'Retirer des favoris';
    x.addEventListener('click', (e) => { e.stopPropagation(); window.launcher.toggleFavorite(f.url, f.title); });
    tile.append(x);
    tile.addEventListener('click', () => openFrom(f.url, $('homeError')));
    box.append(tile);
  }
}

function renderHistory() {
  const ul = $('hist');
  ul.replaceChildren();
  $('histSection').hidden = state.history.length === 0;
  const favUrls = new Set(state.favorites.map((f) => f.url));
  for (const h of state.history) {
    const li = el('li');
    const pin = el('button', 'pin' + (favUrls.has(h.url) ? ' on' : ''), favUrls.has(h.url) ? '★' : '☆');
    pin.title = favUrls.has(h.url) ? 'Retirer des favoris' : 'Épingler en favori';
    pin.addEventListener('click', (e) => { e.stopPropagation(); window.launcher.toggleFavorite(h.url, h.title); });
    const x = el('button', 'x', '✕');
    x.title = 'Retirer de l’historique';
    x.addEventListener('click', (e) => { e.stopPropagation(); window.launcher.removeHistory(h.url); });
    li.append(pin, el('span', 't', h.title), el('span', 'u', h.url), x);
    li.addEventListener('click', () => openFrom(h.url, $('homeError')));
    ul.append(li);
  }
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
    banner.append(b, 'Les vidéos protégées (flux chiffrés) ne se lanceront pas dans cette version d’Electron ; les vidéos non protégées fonctionnent. Voir le README, section « DRM / Widevine ».');
  } else {
    banner.hidden = true;
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
  const isFav = state.favorites.some((f) => f.url === s.url);
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
  renderFavs(); renderHistory(); renderFooter();
  if (state.mode === 'site') renderBar();
}

window.launcher.onState((s) => { state = s; render(); });
window.launcher.onFocusAddress(() => {
  const t = state && state.mode === 'site' ? $('addr') : $('homeInput');
  t.focus(); t.select();
});

$('homeForm').addEventListener('submit', (e) => { e.preventDefault(); openFrom($('homeInput').value, $('homeError')); });
$('addr').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { window.launcher.open($('addr').value).then((r) => { if (!r.ok) $('addr').classList.add('bad'); }); $('addr').blur(); }
  if (e.key === 'Escape') { $('addr').value = state.url; $('addr').blur(); }
});
$('addr').addEventListener('focus', () => $('addr').select());
$('btnBack').addEventListener('click', () => window.launcher.back());
$('btnFwd').addEventListener('click', () => window.launcher.forward());
$('btnReload').addEventListener('click', () => window.launcher.reload());
$('btnHome').addEventListener('click', () => { $('homeInput').value = ''; window.launcher.home(); });
$('btnZoomIn').addEventListener('click', () => window.launcher.zoomIn());
$('btnZoomOut').addEventListener('click', () => window.launcher.zoomOut());
$('btnZoomReset').addEventListener('click', () => window.launcher.zoomReset());
$('btnBlock').addEventListener('click', () => window.launcher.toggleBlocking());
$('btnPin').addEventListener('click', () => window.launcher.toggleFavorite(state.url, state.title));
$('btnClearHist').addEventListener('click', () => window.launcher.clearHistory());
$('btnFilters').addEventListener('click', () => window.launcher.updateFilters());

window.launcher.getState().then((s) => { state = s; render(); $('homeInput').focus(); });
