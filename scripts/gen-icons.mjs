// Generate PWA PNG icons (192/512 + maskable) from the SVG favicon.
// Run once (or when the brand changes):  node scripts/gen-icons.mjs
// Outputs to public/icons/. sharp is a devDependency.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const BRAND = 'calorie.monster';
const BG = '#16a34a';

// A maskable icon needs ~10% safe padding around the glyph.
function svg({ size, pad }) {
  const inner = size - pad * 2;
  const emoji = Math.round(inner * 0.62);
  const y = Math.round(size * 0.7);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif">
      <rect width="${size}" height="${size}" fill="${BG}"/>
      <text x="${size / 2}" y="${y}" font-size="${emoji}" text-anchor="middle">🥗</text>
    </svg>`,
  );
}

const sizes = [
  { out: 'icon-192.png', size: 192, pad: 0 },
  { out: 'icon-512.png', size: 512, pad: 0 },
  { out: 'maskable-192.png', size: 192, pad: 24 },
  { out: 'maskable-512.png', size: 512, pad: 64 },
];

await mkdir('public/icons', { recursive: true });
for (const { out, size, pad } of sizes) {
  await sharp(svg({ size, pad })).png().toFile(`public/icons/${out}`);
  console.log(`✓ public/icons/${out} (${size}×${size}${pad ? ', maskable' : ''})`);
}
console.log(`Done — ${BRAND} icons generated.`);
