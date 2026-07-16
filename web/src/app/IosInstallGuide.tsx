// Presentational, hook-free iOS "Add to Home Screen" walkthrough — shared by the
// install banner, the header menu, and the /setup page (so it can render inside
// both server and client components). Strings default to English; callers on
// i18n'd pages pass translated overrides.

export interface IosGuideStrings {
  title?: string;
  openSafari?: string;
  step1?: string;
  step2?: string;
  step3?: string;
}

const DEFAULTS: Required<Omit<IosGuideStrings, "title">> & { title: string } = {
  title: "Install on iPhone / iPad",
  openSafari:
    "Open honeymoney.app in Safari first — “Add to Home Screen” isn’t available inside another app’s browser (e.g. Telegram or Instagram).",
  step1: "Tap the Share button in the Safari toolbar",
  step2: "Scroll down and tap “Add to Home Screen”",
  step3: "Tap “Add” — HoneyMoney lands on your home screen and opens full-screen, just like an app.",
};

export default function IosInstallGuide({
  needsSafari = false,
  showTitle = true,
  strings,
}: {
  needsSafari?: boolean;
  showTitle?: boolean;
  strings?: IosGuideStrings;
}) {
  const s = { ...DEFAULTS, ...strings };
  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-300">
      {showTitle && <p className="mb-2 font-semibold text-zinc-800 dark:text-zinc-100">{s.title}</p>}
      {needsSafari && (
        <p className="mb-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          {s.openSafari}
        </p>
      )}
      <ol className="space-y-1.5">
        <li className="flex gap-2">
          <Step n={1} />
          <span>
            {s.step1} <ShareGlyph />
          </span>
        </li>
        <li className="flex gap-2">
          <Step n={2} />
          <span>{s.step2}</span>
        </li>
        <li className="flex gap-2">
          <Step n={3} />
          <span>{s.step3}</span>
        </li>
      </ol>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
      {n}
    </span>
  );
}

// The iOS Share glyph (square with an upward arrow) so the instruction points at
// the exact toolbar button, not just the word "Share".
export function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 -translate-y-px align-text-bottom text-sky-600"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
