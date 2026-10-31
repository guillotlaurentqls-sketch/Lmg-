'use strict';
const { launch, ui, site, state, sleep, quit } = require('./lib');
// Arguments propres au site de test : *.example → 127.0.0.1, sans proxy.
const FIXTURE_ARGS = ['--host-resolver-rules=MAP *.example 127.0.0.1', '--proxy-bypass-list=*.example;localhost;127.0.0.1'];

(async () => {
  await launch('/tmp/adbl-e2e-fixture', FIXTURE_ARGS);
  const u = await ui(); await sleep(8000);
  let s = await state(u);
  console.log('Filtres:', s.filters.status, '| bibliothèque:', s.library.map((e) => e.title).join(', '));
  await u.type('#homeInput', '  http://site.example:8080/?a=1&b=2  ', true); await sleep(7000);
  s = await state(u);
  const sp = await site();
  console.log('Ouvert:', s.url, '| titre:', await sp.eval('document.title'));
  console.log('Requêtes bloquées:', s.pageBlocked, '(attendu 5) | pop-ups refusés:', s.popupsBlocked, '(attendu ≥ 1)');
  const e = s.library.find((x) => x.key === 'site.example');
  console.log('Fiche:', e.title, e.color, e.icon ? 'icône OK' : 'sans icône');
  console.log('DRM:', JSON.stringify(s.drm));
  await quit();
  process.exit(s.pageBlocked >= 5 && s.popupsBlocked >= 1 ? 0 : 1);
})().catch(async (e) => { console.error('ERREUR', e); await quit(); process.exit(1); });
