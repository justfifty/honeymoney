import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Track from "./Track";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import InstallPrompt from "./InstallPrompt";

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
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
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

// Mobile-first: fit the viewport, allow zoom (accessibility), amber theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E8A012",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
        <InstallPrompt />
        <Track />
      </body>
    </html>
  );
}
