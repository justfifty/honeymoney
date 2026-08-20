import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import DemoApp from "./DemoApp";

export const metadata: Metadata = {
  title: "Try HoneyMoney — live demo",
  description:
    "Four Malaysian households, a year of real-shaped spending each, and a money health score you can watch move. No sign-up, nothing saved.",
};

// Public and deliberately unauthenticated. Everything below the shell is a
// client component holding generated data in memory, so this route touches
// neither PocketBase nor the session — which is what lets it be indexed, shared
// and opened by a judge at 2am without the origin machine being involved.
//
// Static on purpose: no dynamic data means the edge snapshot
// (scripts/build-static-site.mjs) can carry it, so /demo stays up even when the
// machine serving the real app is off.
export const dynamic = "force-static";

export default async function DemoPage() {
  const lang = await getLocale();
  return <DemoApp lang={lang} />;
}
