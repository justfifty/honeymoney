// Generative "Bunga Raya" (hibiscus) field — Malaysia's national flower, formed
// from honey particles: gold at the heart, hibiscus/Jalur-Gemilang red at the
// petal tips. Five petals (like the real Bunga Raya) via a polar envelope.
// Deterministic seeded PRNG so server and client render identically (no hydration
// drift); pure static SVG, no canvas/JS cost. This is the "designed", distinctly
// Malaysian hero signature — honey-gold, not a generic red-dot cloud.

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
// heart (gold) → honey → amber → Bunga Raya / Jalur Gemilang red at the tips
const STOPS = ["#FBD24E", "#E8A012", "#D66A12", "#CE1126"].map(hexToRgb);
function colorAt(t: number) {
  const c = Math.min(0.999, Math.max(0, t));
  const seg = Math.min(STOPS.length - 2, Math.floor(c * (STOPS.length - 1)));
  const local = c * (STOPS.length - 1) - seg;
  const [r1, g1, b1] = STOPS[seg];
  const [r2, g2, b2] = STOPS[seg + 1];
  return `rgb(${lerp(r1, r2, local)},${lerp(g1, g2, local)},${lerp(b1, b2, local)})`;
}

export default function HoneyField() {
  const rand = mulberry32(20260731);
  const W = 1400;
  const H = 860;
  const cx = W / 2;
  const cy = H * 0.42;
  const Rmax = Math.min(W, H) * 0.66;
  const N = 4200;

  const dots: string[] = [];
  for (let i = 0; i < N; i++) {
    const ang = rand() * Math.PI * 2;
    // five-petal Bunga Raya envelope (|cos(2.5θ)| → 5 lobes), with a filled heart
    const petal = Math.pow(Math.abs(Math.cos(2.5 * ang)), 0.55);
    const env = 0.28 + 0.72 * petal;
    const rr = Math.pow(rand(), 0.5); // dense toward the heart, still fills petals
    const radius = rr * env * Rmax;
    const x = cx + Math.cos(ang) * radius * 1.2; // a touch wider than tall
    const y = cy + Math.sin(ang) * radius;
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
    const rad = 0.5 + rand() * 1.7;
    // keep petal tips visible; only the very outer edge softens a little
    const op = (0.42 + rand() * 0.5) * (1 - rr * 0.12);
    dots.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="${colorAt(rr * 1.05)}" opacity="${op.toFixed(2)}"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${dots.join("")}</svg>`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 [mask-image:radial-gradient(ellipse_88%_66%_at_50%_37%,#000_52%,transparent_86%)]"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
