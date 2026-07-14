// HoneyMoney brand mark — a radiant orange sunburst: 20 tapered rays around a
// solid hub, one flat brand orange (#FF7518), no gradients, so it stays legible
// from a small mark up to a hero. Inline SVG so it stays crisp and needs no
// network request. The same construction generates the app icons — see
// scripts/generate-icons.mjs; keep the two in step.

const ORANGE = "#FF7518";

const N = 20;
const CX = 24;
const R_IN = 3.94;
const R_LONG = 10.88;
const R_SHORT = 9.47;
const CORE = 4.12;
const BASE_HALF = (7.6 * Math.PI) / 180;
const TIP_HALF = (2.6 * Math.PI) / 180;

// Rays alternate long/short — a uniform star reads as a mechanical cog; the
// slight irregularity is what makes it read as light.
const RAYS = Array.from({ length: N }, (_, i) => {
  const a = (2 * Math.PI * i) / N - Math.PI / 2; // start at 12 o'clock
  const rOut = i % 2 === 0 ? R_LONG : R_SHORT;
  const at = (r: number, off: number) =>
    `${(CX + r * Math.cos(a + off)).toFixed(2)},${(CX + r * Math.sin(a + off)).toFixed(2)}`;
  return `M${at(R_IN, -BASE_HALF)} L${at(rOut, -TIP_HALF)} L${at(rOut, TIP_HALF)} L${at(R_IN, BASE_HALF)} Z`;
});

export default function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="HoneyMoney"
      className={className}
    >
      <g fill={ORANGE}>
        {RAYS.map((d, i) => (
          <path key={i} d={d} />
        ))}
        <circle cx={CX} cy={CX} r={CORE} />
      </g>
    </svg>
  );
}
