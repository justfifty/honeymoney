import { SCHEME_STORAGE_KEY } from "@/lib/chartPalette";

// Two display choices the reader has already made, applied BEFORE the first
// paint instead of after hydration.
//
// Both were stored correctly and both were re-applied in a useEffect inside the
// one component that owns the control — ChartSchemePicker on /graph, and
// PrivacyToggle on /dashboard. An effect runs after the page has been painted,
// and only on a page that mounts that component, which produced two distinct
// failures:
//
//   1. The palette silently reverted. Switch to the colour-blind-safe scheme on
//      /graph, then open /dashboard directly, or reload — nothing sets the root
//      attribute, so every chart and chip renders in the default red-versus-
//      green. The choice looked like it had not been saved. It had; nobody was
//      reading it.
//
//   2. "Hide balances" flashed the balances. The blur is CSS keyed off the root
//      attribute, so on every load the real figures were painted first and blurred
//      a frame or two later — in an app whose whole reason for that button is
//      someone reading over your shoulder on the LRT.
//
// So it moves here: a blocking inline script in <head>-position, ahead of any
// paint. It is small and synchronous on purpose — deferring it is exactly the
// bug above with a shorter fuse. Everything is inside try/catch because
// localStorage throws outright in a locked-down browser, and a display
// preference must never be able to stop the page.
//
// The server renders no attribute at all, and this runs before React hydrates,
// so there is nothing for hydration to disagree with.
export default function BootPrefs() {
  const js = `
try {
  var s = localStorage.getItem(${JSON.stringify(SCHEME_STORAGE_KEY)});
  if (s === "cvd" || s === "contrast" || s === "honey") document.documentElement.dataset.chartScheme = s;
  document.documentElement.dataset.hideBalances = String(localStorage.getItem("hm-hide-balances") === "1");
} catch (e) {}
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
