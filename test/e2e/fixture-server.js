const http = require('http'); const fs = require('fs'); const path = require('path');
// Site de test local : sous-domaines, iframe, vidéo, cookie, pop-ups et vraies adresses de pubs.
// Fichiers requis dans test/e2e/site/ : test.webm (ffmpeg, voir docs/ENVIRONNEMENT.md) et icon.png.
const dir = path.join(__dirname, 'site');
const page = (title, body) => `<!doctype html><meta charset=utf-8><title>${title}</title><link rel=icon href="/icon.png"><meta name=theme-color content="#c0392b"><body style="font:16px sans-serif">${body}`;
http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/test.webm') {
    const buf = fs.readFileSync(path.join(dir, 'test.webm'));
    const range = req.headers.range;
    if (range) { const m = /bytes=(\d+)-(\d*)/.exec(range); const s = +m[1]; const e = m[2] ? +m[2] : buf.length - 1;
      res.writeHead(206, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${buf.length}`, 'Content-Length': e - s + 1 }); return res.end(buf.slice(s, e + 1)); }
    res.writeHead(200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': buf.length }); return res.end(buf);
  }
  if (url.pathname === '/icon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(fs.readFileSync(path.join(dir, 'icon.png'))); }
  if (url.pathname === '/login') { res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'session=abc123; Max-Age=86400; Path=/; HttpOnly' }); return res.end(page('Connecté', '<p id=ok>Connecté</p>')); }
  if (url.pathname === '/whoami') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page('Qui suis-je', `<p id=who>${/session=abc123/.test(req.headers.cookie || '') ? 'CONNECTE' : 'ANONYME'}</p>`)); }
  if (host.startsWith('player.')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page('Lecteur', `<video id=v src="http://site.example:8080/test.webm" width=480 controls muted></video><p id=sub>sous-domaine OK</p>`)); }
  if (host.startsWith('other.') || host.startsWith('ads.')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page('Externe ' + host, '<p>site externe</p>')); }
  if (url.pathname === '/page2') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page('Page 2', '<p id=p2>page 2</p><a id=back href="/">retour</a>')); }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(page('Site de test', `
<h1 id=h>Site de test</h1>
<a id=same href="/page2">même site</a> |
<a id=sub href="http://player.site.example:8080/">sous-domaine</a> |
<a id=ext href="http://other.example:8080/" target=_blank>externe (_blank)</a> |
<a id=ext2 href="http://other.example:8080/">externe (même onglet)</a> |
<a id=login href="/login">login</a> | <a id=who href="/whoami">whoami</a>
<br><button id=pop onclick="window.open('http://ads.example:8080/pop','_blank','width=300,height=300')">popup</button>
<br><video id=v src="/test.webm" width=480 controls muted></video>
<iframe id=fr src="http://player.site.example:8080/" width=520 height=300></iframe>
<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
<script src="https://www.google-analytics.com/analytics.js"></script>
<img src="https://ad.doubleclick.net/ddm/ad/x.gif" width=1 height=1>
<img src="https://securepubads.g.doubleclick.net/gampad/ads?x=1" width=1 height=1>
<script>window.open('http://ads.example:8080/autopop','_blank','width=300,height=300');</script>
`));
}).listen(8080, () => console.log('listening 8080'));
