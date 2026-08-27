import { permanentRedirect } from "next/navigation";

// /settings/privacy → /setup#privacy
//
// This route exists because the privacy notice promised it. Until now the
// notice's own footer sent the reader to "Settings → Privacy" at
// /settings/privacy, and the settings screen has always lived at /setup — so
// the one link in the document whose job is to make the withdrawal right
// REACHABLE returned 404. A notice that says "you may withdraw at any time"
// and then 404s on the way to the switch has not given the right; it has
// described one. Under the PDPA that is the difference between an operative
// control and a paper promise.
//
// The source link is fixed (app/privacy/page.tsx now points straight at
// /setup#privacy), so nothing in the app needs this any more. It stays anyway:
// the notice has been exported to docs/PRIVACY.md, rendered into PDFs, and
// snapshotted to Cloudflare Pages, and every one of those copies carries the
// old path. A permanent redirect keeps them all working instead of leaving
// printed evidence of a dead link.
//
// permanentRedirect (308) rather than redirect (307): the move is not
// temporary, and 308 is what tells a crawler or a cached PDF reader to stop
// asking.
export default function SettingsPrivacyRedirect(): never {
  permanentRedirect("/setup#privacy");
}
