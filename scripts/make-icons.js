'use strict';
// Génère build/icon.png (1024×1024) : un bouclier sur fond arrondi. Aucune dépendance.
// electron-builder en tire lui-même l'icône .ico (Windows) et .icns (macOS).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;
const SS = 3; // sur-échantillonnage pour des bords lisses
const px = new Uint8Array(SIZE * SIZE * 4);

function inRoundedSquare(x, y, r) {
  const m = 0.04 * SIZE, lo = m, hi = SIZE - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = x < lo + r ? lo + r : x > hi - r ? hi - r : x;
  const cy = y < lo + r ? lo + r : y > hi - r ? hi - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Bouclier : bord supérieur plat, flancs droits puis pointe arrondie.
function inShield(x, y) {
  const u = (x - SIZE / 2) / (SIZE * 0.5), v = (y - SIZE * 0.5) / (SIZE * 0.5); // [-1,1]
  const top = -0.62, bottom = 0.68;
  if (v < top || v > bottom) return false;
  const t = (v - top) / (bottom - top);
  const half = t < 0.45 ? 0.46 : 0.46 * Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 1.7));
  return Math.abs(u) <= half;
}

function inCheck(x, y) { // coche « tout est filtré »
  const seg = (ax, ay, bx, by, w) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= w;
  };
  const s = SIZE;
  return seg(0.36 * s, 0.50 * s, 0.46 * s, 0.60 * s, 0.035 * s) || seg(0.46 * s, 0.60 * s, 0.65 * s, 0.38 * s, 0.035 * s);
}

for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
      const x = i + (si + 0.5) / SS, y = j + (sj + 0.5) / SS;
      if (!inRoundedSquare(x, y, 0.22 * SIZE)) continue;
      let c = [20, 24, 32]; // fond
      if (inShield(x, y)) c = inCheck(x, y) ? [20, 24, 32] : [138, 180, 248];
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = SS * SS, o = (j * SIZE + i) * 4;
    const cov = a / 255;
    px[o] = cov ? r / cov : 0; px[o + 1] = cov ? g / cov : 0; px[o + 2] = cov ? b / cov : 0; px[o + 3] = Math.round(a / n);
  }
}

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let j = 0; j < SIZE; j++) { raw[j * (SIZE * 4 + 1)] = 0; Buffer.from(px.buffer, j * SIZE * 4, SIZE * 4).copy(raw, j * (SIZE * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('Icône écrite :', out, `(${png.length} octets)`);
