'use strict';
// Assemble la version web : la même interface que le bureau et Android, en un seul fichier HTML.
//   web/dist/index.html     : page complète, installable sur l'écran d'accueil (hébergement GitHub Pages, par exemple)
//   web/dist/artifact.html  : même page sans l'enveloppe <html>, pour un hébergement qui l'ajoute lui-même
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const json = (f) => JSON.parse(read('src', f));

const html = read('src/launcher/index.html');
const css = read('src/launcher/launcher.css');
const js = read('src/launcher/launcher.js');
const shim = read('web/web-shim.js');
const embed = JSON.stringify({ channels: json('channels.json'), providers: json('providers.json'), defaults: json('sites.default.json') }).replace(/</g, '\\u003c');

const body = html.slice(html.indexOf('<body'), html.indexOf('<script src="launcher.js">'))
  .replace(/<body[^>]*>/, '');
for (const [name, text] of [['css', css], ['js', js], ['shim', shim]]) {
  if (/<\/(script|style)/i.test(text)) throw new Error(`${name} contient une balise de fermeture : à échapper`);
}
const scripts = `<script>window.__EMBED__ = ${embed};</script>\n<script>${shim}</script>\n<script>${js}</script>`;
const TITLE = 'Lanceur AdBlock Web';

const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });

fs.writeFileSync(path.join(dist, 'artifact.html'),
  `<title>${TITLE}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n${css}\n</style>\n${body}\n${scripts}\n`);

fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0e1013">
<meta name="color-scheme" content="dark light">
<title>${TITLE}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
${css}
</style>
</head>
<body class="mode-home">
${body}
${scripts}
</body>
</html>
`);

fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'AdBlock Launcher', short_name: 'AdBlock', lang: 'fr', start_url: '.', scope: '.', display: 'standalone',
  background_color: '#0e1013', theme_color: '#0e1013',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
}, null, 2));
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png']]) {
  // icône réduite depuis build/icon.png si ffmpeg est disponible, sinon l'originale
  const out = path.join(dist, name);
  const r = require('child_process').spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(root, 'build/icon.png'), '-vf', `scale=${size}:${size}`, out]);
  if (r.status !== 0) fs.copyFileSync(path.join(root, 'build/icon.png'), out);
}
console.log('Version web écrite dans', dist);
