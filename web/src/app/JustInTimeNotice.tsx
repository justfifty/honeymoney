import Link from "next/link";
import { inContextNotice } from "@/lib/legalDocs";

// The two sentences that appear where the thing actually happens.
//
// A privacy notice is given once, at signup, to a person who is thinking about
// nothing except getting into the app. By the time they photograph a receipt
// containing somebody else's name, or send a question to a model in another
// country, that notice is weeks old and was never about this moment. The law's
// notice-and-choice principle is satisfied by the long document; a person is
// informed by the short one, here, now.
//
// THE TEXT COMES FROM lib/legalDocs.ts, never from this component or its
// callers. A banner that says something the full notice does not is worse than
// no banner — it is a second, contradictory disclosure that nobody has reviewed.
// So the short form lives beside the long form, in the same object, and this
// renders whichever the caller names.

export default function JustInTimeNotice({
  doc,
  tone = "info",
  children,
}: {
  /** Slug in lib/legalDocs.ts. Its `inContext` text is what renders. */
  doc: string;
  tone?: "info" | "warn";
  /** Extra, situation-specific text — e.g. the provider actually configured. */
  children?: React.ReactNode;
}) {
  const text = inContextNotice(doc);
  if (!text) return null;

  const skin =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300";

  return (
    <div className={`rounded-xl border p-3 text-xs leading-relaxed ${skin}`}>
      <p>{text}</p>
      {children && <div className="mt-1.5">{children}</div>}
      <p className="mt-1.5">
        <Link href={`/legal/${doc}`} className="font-medium underline underline-offset-2">
          Read the full notice
        </Link>
      </p>
    </div>
  );
}
