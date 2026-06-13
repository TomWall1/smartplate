/**
 * Generate the Deals to Dish mobile app icon / adaptive icon / splash / favicon
 * from the crossed-cutlery logo (lucide UtensilsCrossed) into mobile/assets/.
 * Run from repo root: node scripts/genMobileIcons.js   (requires `sharp`)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'mobile', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const GUM = '#36453B';
const WHITE = '#FFFFFF';
const BONE = '#F4EEE2';

// lucide "utensils-crossed" (24x24, stroke-based) — same glyph as the in-app logo
const GLYPH = `
  <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/>
  <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/>
  <path d="m2.1 21.8 6.4-6.3"/>
  <path d="m19 5-7 7"/>`;

function logo({ size, bg, stroke = WHITE, frac = 0.5 }) {
  const scale = (frac * size) / 24;
  const t = (size - 24 * scale) / 2;
  const bgEl = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bgEl}
    <g transform="translate(${t} ${t}) scale(${scale})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g>
  </svg>`;
}

async function png(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, file));
  console.log('wrote', file);
}

(async () => {
  await png(logo({ size: 1024, bg: GUM, frac: 0.52 }), 'icon.png', 1024);                       // iOS / main
  await png(logo({ size: 1024, bg: null, stroke: WHITE, frac: 0.42 }), 'adaptive-icon.png', 1024); // android foreground (bg from app.json)
  await png(logo({ size: 1024, bg: BONE, stroke: GUM, frac: 0.34 }), 'splash-icon.png', 1024);   // splash (bone bg, gum logo)
  await png(logo({ size: 48, bg: GUM, frac: 0.55 }), 'favicon.png', 48);                         // expo web
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
