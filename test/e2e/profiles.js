'use strict';
// Profils : pages, recherche, Ma liste, création d'un profil et ISOLATION des connexions entre profils.
// Prérequis : npm run e2e:server (site de test local sur le port 8080).
const { launch, ui, site, state, sleep, quit } = require('./lib');
const FIX = ['--host-resolver-rules=MAP *.example 127.0.0.1', '--proxy-bypass-list=*.example;localhost;127.0.0.1'];
const who = async () => { for (let i = 0; i < 30; i++) { const sp = await site(); if (sp) { try { const v = await sp.eval(`document.getElementById('who')&&document.getElementById('who').textContent`); if (v) return v; } catch {} } await sleep(500); } return '(rien)'; };
const open = async (u, url) => { await u.type('#homeInput', url, true); await sleep(3500); };
(async () => {
  await launch('/tmp/adbl-prof', FIX); let u = await ui(); await sleep(8000);
  let s = await state(u);
  console.log('1 démarrage:', s.mode, '| profil:', s.profile.name, s.profile.emoji, '| profils:', s.profiles.length);
  // pages
  for (const p of ['tv', 'list', 'fav', 'home']) { await u.click(`#mainNav button[data-page=${p}]`); await sleep(400); console.log('  page', p, '→', await u.eval(`document.querySelector('#page .pagehead, #page .hero h1')?.textContent`), '| cartes:', await u.eval(`document.querySelectorAll('#page .card').length`)); }
  // recherche
  await u.type('#homeInput', 'art'); await sleep(500);
  console.log('2 recherche « art »:', await u.eval(`document.querySelector('#page .pagehead').textContent`), '|', await u.eval(`[...document.querySelectorAll('#page .card .t')].map(x=>x.textContent).join(', ')`));
  await u.eval(`document.getElementById('homeInput').value='';document.getElementById('homeInput').dispatchEvent(new Event('input'))`); await sleep(300);
  // Ma liste
  await u.eval(`[...document.querySelectorAll('#page .card')].find(c=>c.querySelector('.t').textContent==='ARTE').querySelector('.tools button:nth-child(2)').click()`); await sleep(500);
  s = await state(u); console.log('3 Ma liste:', s.library.filter(e => e.later).map(e => e.title).join(','));
  // connexion dans le profil 1
  await open(u, 'http://site.example:8080/login'); await u.type('#addr', 'http://site.example:8080/whoami', true); await sleep(3000);
  console.log('4 profil 1 connecté:', await who());
  // créer le profil 2 via l'interface
  await u.click('#btnHome'); await sleep(500);
  await u.click('#btnProfile'); await sleep(200); await u.click('#profileMenu button[data-act=switch]'); await sleep(800);
  s = await state(u); console.log('5 sélecteur:', s.mode, '| profils:', s.profiles.map(p => p.name).join(','));
  await u.click('.profile.add'); await sleep(400);
  await u.type('#pName', 'Léa'); await u.click('#pEmojis .sw:nth-child(3)'); await u.click('#pColors .sw:nth-child(4)'); await sleep(200);
    await u.eval(`document.getElementById('pdlgForm').requestSubmit()`); await sleep(800);
  s = await state(u); console.log('6 profil créé:', s.profiles.map(p => `${p.emoji}${p.name}(${p.count})`).join(' | '));
  const lea = s.profiles.find(p => p.name === 'Léa');
  await u.eval(`[...document.querySelectorAll('.profile')].find(p=>p.textContent.includes('Léa')).click()`); await sleep(1200);
  s = await state(u); console.log('7 profil actif:', s.profile.name, '| Ma liste:', s.library.filter(e => e.later).length, '| favoris:', s.library.filter(e => e.favorite).length);
  await open(u, 'http://site.example:8080/whoami');
  { const st = await state(u); const { targets } = require('./lib'); console.log('   diag: mode', st.mode, '| onglets', st.tabs.map(t => t.url).join(','), '| cibles', (await targets()).map(t => t.url.slice(0, 50)).join(' | '), '| erreur', JSON.stringify(st.error), '| saisie', await u.eval(`document.getElementById('homeInput').value`)); }
  console.log('8 profil 2 sur le même site:', await who(), '(attendu ANONYME : session séparée)');
  // retour profil 1
  await u.click('#btnHome'); await sleep(500); await u.click('#btnProfile'); await sleep(200); await u.click('#profileMenu button[data-act=switch]'); await sleep(800);
  await u.eval(`[...document.querySelectorAll('.profile')].find(p=>p.textContent.includes('Moi')).click()`); await sleep(1000);
  await open(u, 'http://site.example:8080/whoami');
  console.log('9 retour profil 1:', await who(), '(attendu CONNECTE)');
  await quit();
  // relance : choix du profil demandé
  await launch('/tmp/adbl-prof', FIX); u = await ui(); await sleep(6000);
  s = await state(u); console.log('10 relance:', s.mode, '| profils:', s.profiles.map(p => p.name).join(','));
  await quit();
})().catch(async e => { console.error('ERREUR', e); await quit(); process.exit(1); });
