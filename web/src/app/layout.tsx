import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Track from "./Track";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import HoneyField from "./HoneyField";
import InstallPrompt from "./InstallPrompt";
import PendingDeletionNotice from "./PendingDeletionNotice";
import LegalUpdateNotice from "./LegalUpdateNotice";
import OfflineGate from "./OfflineGate";
import BottomNav from "./BottomNav";
import ChromeGate from "./ChromeGate";

// Routes that ship their own navigation and must not also get the site's.
// /demo is a one-page app with its own bottom tab bar; two fixed bars stack,
// and the global one wins every tap.
const SELF_CHROME = ["/demo"];
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import FxRates from "./FxRates";
import { getRates } from "@/lib/fx";
import { applyRates, type RateTable } from "@/lib/format";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font for headings + the wordmark — a modern, friendly geometric sans
// that reads as a designed fintech brand, not a default system stack.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const SITE_URL = "https://honeymoney.app";
const SITE_DESC =
  "AI financial wellness for Malaysian individuals, couples and families — funding transparency, spending autonomy. A household knowledge-graph money engine, private by design. MAIC Nexus 2026, Track T3.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "HoneyMoney — AI Financial Wellness for Malaysian Families",
    template: "%s · HoneyMoney",
  },
  description: SITE_DESC,
  applicationName: "HoneyMoney",
  keywords: [
    "financial wellness", "budgeting", "Malaysia", "fintech", "personal finance",
    "couples finance", "knowledge graph", "AI", "PocketBase", "MAIC Nexus 2026",
    "financial inclusion", "e-wallet", "household budget", "family finance",
  ],
  authors: [{ name: "Team HoneyMoney" }],
  // Icons come from the app/ file convention (favicon.ico, icon.svg,
  // apple-icon.png) — Next emits the <link> tags itself, so declaring them here
  // too would only risk the two drifting apart.
  appleWebApp: { capable: true, title: "HoneyMoney", statusBarStyle: "default" },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "HoneyMoney",
    title: "HoneyMoney — AI Financial Wellness for Malaysian Families",
    description: SITE_DESC,
    locale: "en_MY",
    images: [{ url: "/product-sankey.png", width: 1600, height: 900, alt: "HoneyMoney — money as a living knowledge graph" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HoneyMoney — AI Financial Wellness",
    description: "Funding transparency, spending autonomy. AI-supported and private by design, built for Malaysian individuals, couples and families.",
    images: ["/product-sankey.png"],
  },
};

// Mobile-first: fit the viewport, allow zoom (accessibility), brand-orange theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FF7518",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch live FX once per render and apply it on BOTH sides: applyRates() here
  // updates the server bundle's table, and <FxRates> ships the same table into
  // the browser's copy. Without that second half, a client component would keep
  // converting at the stale hard-coded rates and quietly disagree with the
  // server-rendered figure right next to it. Never let a rate lookup break the
  // page — worst case we fall back to the indicative table, clearly labelled.
  let table: RateTable = {};
  try {
    table = (await getRates()).table;
    applyRates(table);
  } catch {
    /* offline or the central banks are down — the indicative fallback stands */
  }

  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      {/* Clear the fixed bottom nav on mobile; nothing on desktop, where it is
          hidden. The safe-area term is not decoration: BottomNav is 3.5rem of
          tabs PLUS `pb-[env(safe-area-inset-bottom)]`, so on a phone with a home
          indicator the bar is ~5.6rem tall while a flat `pb-16` reserved 4rem —
          and the last ~1.6rem of every page sat underneath it, unreachable.
          Keep the two in step: change one, change the other. */}
      <body className="min-h-full flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <FxRates table={table} />
        {/* dotted sunburst that trails the cursor behind every page.
            Renders nothing on touch devices — it is a pointer effect, and it was
            costing phones 324 KB and 4 200 DOM nodes for something they could
            never move. See HoneyField.tsx. */}
        <HoneyField />
        <SiteHeader />
        <PendingDeletionNotice />
        <LegalUpdateNotice />
        <OfflineGate />
        <div className="flex flex-1 flex-col">{children}</div>
        <ChromeGate hideOn={SELF_CHROME}>
          <SiteFooter />
        </ChromeGate>
        <InstallPrompt />
        <ChromeGate hideOn={SELF_CHROME}>
          <BottomNav
            labels={{
              record: tr("nav.record"),
              dashboard: tr("nav.dashboard"),
              graph: tr("nav.graph"),
              hscore: tr("nav.hscore"),
              more: tr("more.title"),
            }}
          />
        </ChromeGate>
        <Track />
      </body>
    </html>
  );
}
