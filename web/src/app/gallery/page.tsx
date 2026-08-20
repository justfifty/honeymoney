import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "../Logo";

export const metadata = {
  title: "Graph Gallery",
  description:
    "Real screenshots of HoneyMoney's knowledge graph — six views, five lenses and three personas over one money model.",
};

// Public product gallery. Deliberately PocketBase-free: it renders nothing but
// /public images and dictionary strings, which is what lets it survive in the
// always-on static snapshot (scripts/build-static-site.mjs) while /graph — the
// live, data-backed version of the same thing — needs the origin.
type Shot = { img: string; k: string };

const SIX: Shot[] = [
  { img: "g-family-sankey.png", k: "sankey" },
  { img: "g-family-treemap.png", k: "treemap" },
  { img: "g-family-tree.png", k: "tree" },
  { img: "g-family-organic.png", k: "organic" },
  { img: "g-family-bars.png", k: "bars" },
  { img: "g-family-flow.png", k: "flow" },
];

const LENSES: Shot[] = [
  { img: "g-family-lens-person.png", k: "person" },
  { img: "g-family-lens-vendor.png", k: "vendor" },
  { img: "g-family-lens-category.png", k: "category" },
];

// Individual · couple · family on one engine. The business frames were retired
// with the business persona — see UI/UX spec v2 §1. The family is already the
// subject of both sections above, so this one carries the other two sizes.
const PERSONAS: Shot[] = [
  { img: "g-solo-sankey.png", k: "solo" },
  { img: "g-solo-lens-income.png", k: "soloLens" },
  { img: "g-couple-sankey.png", k: "couple" },
  { img: "g-couple-lens-person.png", k: "coupleLens" },
];

export default async function GalleryPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <main className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> {tr("gallery.title")}
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/graph" className="text-amber-600 hover:underline">
            🕸️ {tr("gallery.live")}
          </Link>
          <Link href="/guide" className="text-zinc-500 hover:underline">
            {tr("nav.guide")}
          </Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">{tr("gallery.subtitle")}</p>

      <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 text-sm leading-relaxed dark:border-amber-900 dark:bg-amber-950/20">
        {tr("gallery.intro")}
      </p>

      <Group title={tr("gallery.s1.title")} body={tr("gallery.s1.body")} shots={SIX} tr={tr} />
      <Group title={tr("gallery.s2.title")} body={tr("gallery.s2.body")} shots={LENSES} tr={tr} />
      <Group title={tr("gallery.s3.title")} body={tr("gallery.s3.body")} shots={PERSONAS} tr={tr} />

      <p className="mt-10 text-xs text-zinc-400">{tr("gallery.note")}</p>
    </main>
  );
}

function Group({
  title,
  body,
  shots,
  tr,
}: {
  title: string;
  body: string;
  shots: Shot[];
  tr: (k: string) => string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {shots.map((s) => (
          <figure
            key={s.img}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          >
            {/* Plain <img>: next/image's optimizer is a server route, and this
                page has to render identically from a static host with no server. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/gallery/${s.img}`}
              alt={tr(`gallery.${s.k}.t`)}
              loading="lazy"
              decoding="async"
              className="w-full border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
            />
            <figcaption className="p-4">
              <h3 className="text-sm font-semibold">{tr(`gallery.${s.k}.t`)}</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{tr(`gallery.${s.k}.b`)}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
