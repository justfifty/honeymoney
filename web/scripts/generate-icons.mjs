// Generates every app icon from one source of truth: the HoneyMoney sunburst.
//
// The ray geometry below is the same construction as src/app/Logo.tsx (20 rays,
// alternating long/short, tapered from a solid hub) so the browser-tab icon and
// the logo in the header can never drift apart. Re-run with:
//
//   npm run icons
//
// Emits:
//   src/app/favicon.ico          16/32/48 — the tab icon
//   src/app/icon.svg             crisp tab icon for modern browsers
//   src/app/apple-icon.png       180 — iOS home screen (iOS rounds it itself, so square)
//   public/icon-192.png          PWA
//   public/icon-512.png          PWA
//   public/icon-maskable.png     PWA maskable — full-bleed, glyph inside the 80% safe zone
//
// The mark is a WHITE knockout on a solid brand-orange tile rather than orange
// on transparent: at 16px on a dark tab strip, thin orange rays on transparency
// all but vanish, and a maskable icon needs an opaque plate anyway.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ORANGE = "#FF7518";
const SIZE = 512;
const C = SIZE / 2;

// The full mark: 20 rays, alternating long/short, tapered — ratios lifted from
// Logo.tsx. R_LONG sizes the glyph to ~68% of the tile: big enough to carry,
// still inside a maskable icon's 80% safe zone.
const FULL = {
  n: 20,
  rLong: 0.34 * SIZE,
  shortRatio: 0.8704,
  inRatio: 0.3621,
  coreRatio: 0.3787,
  baseDeg: 7.6,
  tipDeg: 2.6,
};

// At 16px a ray of the full mark is well under a pixel wide, so all 20 smear
// into a white blob and the sunburst reads as a dot. The small sizes therefore
// get a deliberately coarser cut of the same mark: fewer rays, wider taper,
// smaller hub — the silhouette survives the downsample. Standard favicon
// practice; nobody can tell at 16px, and it's unmistakably the same logo.
const COMPACT = {
  n: 12,
  rLong: 0.38 * SIZE,
  shortRatio: 0.82,
  inRatio: 0.34,
  coreRatio: 0.30,
  baseDeg: 13,
  tipDeg: 6.5,
};

function rays(g) {
  const rShort = g.rLong * g.shortRatio;
  const rIn = g.rLong * g.inRatio;
  const baseHalf = (g.baseDeg * Math.PI) / 180;
  const tipHalf = (g.tipDeg * Math.PI) / 180;
  return Array.from({ length: g.n }, (_, i) => {
    const a = (2 * Math.PI * i) / g.n - Math.PI / 2; // start at 12 o'clock
    const rOut = i % 2 === 0 ? g.rLong : rShort;
    const at = (r, off) =>
      `${(C + r * Math.cos(a + off)).toFixed(2)},${(C + r * Math.sin(a + off)).toFixed(2)}`;
    return `M${at(rIn, -baseHalf)} L${at(rOut, -tipHalf)} L${at(rOut, tipHalf)} L${at(rIn, baseHalf)} Z`;
  });
}

// rx: 112 ≈ 22% is the squircle-ish radius browsers expect of a tab tile; pass 0
// for surfaces (iOS, maskable) that apply their own mask.
function tileSvg(rx, g = FULL) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="HoneyMoney">
  <rect width="${SIZE}" height="${SIZE}" rx="${rx}" fill="${ORANGE}"/>
  <g fill="#fff">
${rays(g).map((d) => `    <path d="${d}"/>`).join("\n")}
    <circle cx="${C}" cy="${C}" r="${(g.rLong * g.coreRatio).toFixed(2)}"/>
  </g>
</svg>
`;
}

const ROUNDED = Buffer.from(tileSvg(112));
const SQUARE = Buffer.from(tileSvg(0));
const ROUNDED_SMALL = Buffer.from(tileSvg(112, COMPACT));

const png = (svg, size) => sharp(svg).resize(size, size).png().toBuffer();

// ICO is just a small container; modern Windows and every browser since IE11
// accept PNG payloads inside it, which saves hand-rolling BMP+alpha masks.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // 0 means 256
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); // palette colours
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.buf)]);
}

const write = (rel, buf) => {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log(`  ${rel}  (${buf.length.toLocaleString()} bytes)`);
};

console.log("HoneyMoney icons — sunburst on brand orange");

write("src/app/icon.svg", ROUNDED);

// 16 and 32 take the coarser cut; 48 has the pixels to carry the full mark.
const icoImages = await Promise.all(
  [
    { size: 16, art: ROUNDED_SMALL },
    { size: 32, art: ROUNDED_SMALL },
    { size: 48, art: ROUNDED },
  ].map(async ({ size, art }) => ({ size, buf: await png(art, size) })),
);
write("src/app/favicon.ico", buildIco(icoImages));

write("src/app/apple-icon.png", await png(SQUARE, 180));
write("public/icon-192.png", await png(ROUNDED, 192));
write("public/icon-512.png", await png(ROUNDED, 512));
write("public/icon-maskable.png", await png(SQUARE, 512));

console.log("done.");
