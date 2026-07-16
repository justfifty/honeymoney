import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Track from "./Track";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import HoneyField from "./HoneyField";
import InstallPrompt from "./InstallPrompt";
import PendingDeletionNotice from "./PendingDeletionNotice";
import BottomNav from "./BottomNav";
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
  "AI financial wellness for Malaysian households and small businesses — funding transparency, spending autonomy. A local-first knowledge-graph money engine. MAIC Nexus 2026, Track T3.";

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
    "financial inclusion", "e-wallet", "household budget", "SME cashflow",
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
    description: "Funding transparency, spending autonomy. Local-first, AI-supported, built for Malaysian families and SMEs.",
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
      {/* pb-16 on mobile so content clears the fixed bottom nav; none on desktop */}
      <body className="min-h-full flex flex-col pb-16 md:pb-0">
        <FxRates table={table} />
        {/* dotted sunburst that trails the cursor behind every page */}
        <HoneyField />
        <SiteHeader />
        <PendingDeletionNotice />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
        <InstallPrompt />
        <BottomNav
          labels={{
            dashboard: tr("nav.dashboard"),
            records: tr("nav.records"),
            capture: tr("nav.capture"),
            goals: tr("nav.goals"),
            learn: tr("nav.learn"),
          }}
        />
        <Track />
      </body>
    </html>
  );
}
