// HoneyMoney brand mark — a single-orange honeycomb hexagon with a white
// Bunga Raya (hibiscus, Malaysia's national flower) at its heart. One flat brand
// orange (#E8A012), white flower, no gradients — clean and legible at every size.
// Inline SVG so it stays crisp and needs no network request.
export default function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const ORANGE = "#E8A012";
  const petals = [0, 72, 144, 216, 288].map((a) => (
    <ellipse key={a} cx="24" cy="16.6" rx="3.7" ry="6.4" fill="#ffffff" transform={`rotate(${a} 24 24)`} />
  ));
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
      {/* honeycomb cell — one flat orange */}
      <path
        d="M24 3.5 41.3 13.5v20L24 43.5 6.7 33.5v-20z"
        fill={ORANGE}
        stroke="#C8850E"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* white hibiscus */}
      {petals}
      <circle cx="24" cy="24" r="2.6" fill={ORANGE} />
    </svg>
  );
}
