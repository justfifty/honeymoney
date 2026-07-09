import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HoneyMoney — AI Financial Wellness",
  description:
    "Funding transparency, spending autonomy. A knowledge-graph financial wellness engine for families and businesses. MAIC Nexus 2026, Track T3.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "HoneyMoney", statusBarStyle: "default" },
};

// Mobile-first: fit the viewport, allow zoom (accessibility), amber theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E09112",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
