// تولید آیکون‌های PNG اپ (فنجان چای) بدون هیچ وابستگی بیرونی.
// اجرا:  node tools/make-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- رمزگذار ساده‌ی PNG ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- کشیدن تصویر ----------
// همه‌ی مختصات در فضای 512×512 تعریف شده و بعد مقیاس می‌شود.
const S = 512;

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const BG_TOP = [0xf0, 0x9d, 0x4a];
const BG_BOTTOM = [0xc2, 0x41, 0x0c];
const CREAM = [0xff, 0xfa, 0xf2];
const TEA = [0x8a, 0x33, 0x09];

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

// بدنه‌ی فنجان: ذوزنقه با گوشه‌های پایینی گرد
function inCup(x, y) {
  const yTop = 206, yBot = 356;
  if (y < yTop || y > yBot) return false;
  const t = (y - yTop) / (yBot - yTop);
  const half = 100 - 26 * t;
  const left = 256 - half, right = 256 + half;
  const r = 26;
  if (y > yBot - r) {
    const dy = y - (yBot - r);
    const shrink = r - Math.sqrt(Math.max(0, r * r - dy * dy));
    return x >= left + shrink && x <= right - shrink;
  }
  return x >= left && x <= right;
}

// دسته‌ی فنجان: حلقه‌ای در سمت راست
function inHandle(x, y) {
  if (x < 350) return false;
  const dx = x - 352, dy = y - 262;
  const d = Math.sqrt(dx * dx + dy * dy);
  return d <= 54 && d >= 32;
}

// بخار: سه خط موج‌دار بالای فنجان
function inSteam(x, y) {
  if (y < 62 || y > 176) return false;
  for (const cx of [196, 256, 316]) {
    const wave = cx + Math.sin((y - 62) / 30) * 15;
    if (Math.abs(x - wave) <= 9) return true;
  }
  return false;
}

function sample(x, y) {
  // بخار کمی محوتر از بقیه است
  if (inSteam(x, y)) return { c: CREAM, a: 0.78 };
  // سطح چای داخل فنجان
  if (inEllipse(x, y, 256, 208, 84, 17)) return { c: TEA, a: 1 };
  // لبه‌ی فنجان
  if (inEllipse(x, y, 256, 208, 102, 24)) return { c: CREAM, a: 1 };
  if (inCup(x, y)) return { c: CREAM, a: 1 };
  if (inHandle(x, y)) return { c: CREAM, a: 1 };
  // نعلبکی
  if (inEllipse(x, y, 256, 378, 152, 30)) return { c: CREAM, a: 1 };
  return null;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // نمونه‌برداری ۳×۳ برای لبه‌های نرم
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * S;
          const y = ((py + (sy + 0.5) / SS) / size) * S;
          const bg = mix(BG_TOP, BG_BOTTOM, y / S);
          const fg = sample(x, y);
          const c = fg ? mix(bg, fg.c, fg.a) : bg;
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = 255; // تمام‌پر: خود آی‌اواس گوشه‌ها را گرد می‌کند
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const png = render(size);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(name, size + '×' + size, png.length + ' بایت');
}
