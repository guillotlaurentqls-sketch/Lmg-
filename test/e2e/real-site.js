'use strict';
// Ouvre un vrai site dans l'appli et enregistre des captures + l'état (nécessite l'accès réseau au site).
// Usage : node test/e2e/real-site.js https://www.arte.tv/fr/ [dossier-de-sortie]
const fs = require('fs');
const path = require('path');
const { launch, ui, site, state, sleep, quit } = require('./lib');

const url = process.argv[2] || 'https://www.arte.tv/fr/';
const out = path.resolve(process.argv[3] || path.join(__dirname, 'out'));
fs.mkdirSync(out, { recursive: true });

(async () => {
  await launch('/tmp/adbl-e2e-real');
  const u = await ui(); await sleep(8000);
  await u.type('#homeInput', url, true);
  await sleep(15000); // chargement du site
  let s = await state(u);
  const sp = await site();
  console.log('URL affichée   :', s.url);
  console.log('Titre de page  :', sp ? await sp.eval('document.title') : '(aucune page)');
  console.log('Erreur         :', s.error ? `${s.error.desc} (${s.error.code})` : 'aucune');
  console.log('Bloquées       :', s.pageBlocked, 'requêtes sur cette page |', s.popupsBlocked, 'pop-ups | filtres :', s.filters.status);
  if (sp) {
    await sp.screenshot(path.join(out, '1-page.png'));
    console.log('Vidéos sur la page :', await sp.eval(`document.querySelectorAll('video').length`), '| iframes :', await sp.eval(`document.querySelectorAll('iframe').length`));
  }
  await u.screenshot(path.join(out, '2-barre.png'));
  await u.click('#btnHome'); await sleep(1500);
  s = await state(u);
  const e = s.library.find((x) => x.url === url || url.includes(x.key));
  console.log('Fiche gardée   :', e ? JSON.stringify({ title: e.title, color: e.color, icône: !!e.icon, ouvertures: e.opens }) : 'absente');
  await u.screenshot(path.join(out, '3-accueil.png'));
  console.log('DRM            :', JSON.stringify(s.drm));
  console.log('Captures dans  :', out);
  await quit();
})().catch(async (e) => { console.error('ERREUR', e); await quit(); process.exit(1); });
