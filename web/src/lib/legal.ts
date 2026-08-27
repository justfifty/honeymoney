// The trust pack: every notice HoneyMoney owes a user, as data.
//
// ── WHY THIS IS NOT ONE LONG TERMS PAGE ────────────────────────────────────
//
// A single document containing the contract, the PDPA notice, the advice
// disclaimer, the AI disclosure and the sponsor position is legally tidy and
// practically useless. Nobody reads it, so nobody is informed by it, so the
// consent collected under it is worth very little — and the one clause that
// mattered to a particular person was on screen four of eleven.
//
// The rule instead is: the right notice appears before the relevant thing
// happens. That needs the notices to be separable — addressable, versioned, and
// quotable in a two-sentence form at the point of action — which is what this
// module makes possible. `/legal/ai` is a page a person can be sent to; it is
// also the source of the sentence shown above the AI toggle.
//
// ── ONE SHAPE, BOTH LANGUAGES, ENFORCED BY THE TYPE ────────────────────────
//
// Same discipline as app/privacy/notice.ts: English and Bahasa Malaysia sit in
// one object, so a section cannot be live in one language and missing in the
// other. Section 7 of the PDPA requires the privacy notice in both; the rest are
// bilingual because a household that reads its data rights in Malay and its
// liability limits only in English has been given half a trust pack.
//
// ⚠️ The Bahasa Malaysia throughout is a careful working translation, NOT one
// certified by a Malaysian legal practitioner. Counsel reviews both before any
// compliance claim is made, and where the two differ it is the Malay a
// Malaysian user relies on.

export interface LegalSection {
  id: string;
  en: { heading: string; body: string[] };
  ms: { heading: string; body: string[] };
}

export interface LegalDoc {
  /** URL slug under /legal. */
  slug: string;
  /** Bumped when the substance changes. Shown on the page. */
  version: string;
  en: { title: string; summary: string };
  ms: { title: string; summary: string };
  /**
   * The two-sentence form, shown at the point of action rather than on this
   * page. Held here so the short notice and the long one cannot drift: a
   * just-in-time banner that says something the full document does not is worse
   * than no banner.
   */
  inContext?: { en: string; ms: string };
  sections: LegalSection[];
}

export const LEGAL_PACK_VERSION = "2026-08-27";

/**
 * Everything in the pack, in the order it is listed on /legal.
 *
 * Ordered by when a person needs it, not by legal weight: what the app is and
 * is not, then what happens to their data, then the contract, then the
 * housekeeping. A reader scanning this list top to bottom should meet their own
 * question before they meet ours.
 */
export interface PackEntry {
  slug: string;
  icon: string;
  /** External route for the two documents that predate the pack. */
  href?: string;
}

export const PACK_ORDER: PackEntry[] = [
  { slug: "privacy", icon: "🔒", href: "/privacy" },
  { slug: "terms", icon: "📜", href: "/terms" },
  { slug: "disclaimer", icon: "⚠️" },
  { slug: "hscore", icon: "💗" },
  { slug: "ai", icon: "🤖" },
  { slug: "sharing", icon: "👪" },
  { slug: "sponsors", icon: "🤝" },
  { slug: "storage", icon: "🍪" },
  { slug: "retention", icon: "🗓️" },
  { slug: "acceptable-use", icon: "🚦" },
  { slug: "licences", icon: "©️" },
];
