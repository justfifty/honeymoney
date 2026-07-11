// HoneyMoney brand mark — a honeycomb cell (financial "structure") holding a
// honey drop (warmth). Corporate palette: honey gold gradient + a trust-green
// core. Inline SVG so it stays crisp at every size and needs no network request.
// Pair with the wordmark (Honey in ink + Money in honey) rendered by the caller.
export default function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const gid = "hm-honey-grad";
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
      <defs>
        <linearGradient id={gid} x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5B733" />
          <stop offset="1" stopColor="#E0900F" />
        </linearGradient>
      </defs>
      {/* honeycomb cell */}
      <path
        d="M24 3.5 41.3 13.5v20L24 43.5 6.7 33.5v-20z"
        fill={`url(#${gid})`}
        stroke="#B4740A"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* honey drop */}
      <path
        d="M24 13c-6 6.4-9 11.2-9 15a9 9 0 0 0 18 0c0-3.8-3-8.6-9-15z"
        fill="#FFFFFF"
      />
      {/* trust-green core */}
      <circle cx="24" cy="29" r="3.4" fill="#1F6F4A" />
    </svg>
  );
}
