/* Генерация .ico, .png и .icns из assets/icon.svg
   Запускается как: node scripts/build-icons.js
*/
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'assets', 'icon.svg');
const OUT_DIR = path.join(ROOT, 'assets');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

function renderPng(svg, size) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0, 0, 0, 0)',
  });
  return r.render().asPng();
}

(async () => {
  if (!fs.existsSync(SVG_PATH)) {
    console.error('Не найден', SVG_PATH);
    process.exit(1);
  }
  const svg = fs.readFileSync(SVG_PATH);

  // PNGs
  console.log('PNG:');
  const pngBuffers = {};
  for (const size of SIZES) {
    const buf = renderPng(svg, size);
    const out = path.join(OUT_DIR, `icon-${size}.png`);
    fs.writeFileSync(out, buf);
    pngBuffers[size] = buf;
    console.log(`  ${out}  ${(buf.length / 1024).toFixed(1)} KB`);
  }

  // Главный icon.png — 512
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), pngBuffers[512]);
  console.log('  assets/icon.png');

  // Windows .ico (содержит несколько размеров)
  console.log('ICO:');
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const ico = await pngToIco(icoSizes.map((s) => pngBuffers[s]));
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico);
  console.log(`  assets/icon.ico  ${(ico.length / 1024).toFixed(1)} KB`);

  console.log('Готово.');
})().catch((e) => { console.error(e); process.exit(1); });
