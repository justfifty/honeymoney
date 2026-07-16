"use client";

import { useState } from "react";
import { usePwaInstall } from "./usePwaInstall";
import IosInstallGuide, { type IosGuideStrings } from "./IosInstallGuide";

// Landing-hero nudge shown ONLY to iPhone/iPad visitors who haven't installed
// yet — on Android/desktop it renders nothing, keeping the hero clean. Tapping
// it expands the Safari "Add to Home Screen" walkthrough right there, so an iOS
// user never has to hunt through the menu to find how to install.
export default function IosInstallHint({ label, guide }: { label: string; guide: IosGuideStrings }) {
  const { isIos, iosNeedsSafari, installed } = usePwaInstall();
  const [open, setOpen] = useState(false);

  if (installed || !(isIos || iosNeedsSafari)) return null;

  return (
    <div className="hm-animate mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-3.5 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
      >
        🍎 {label}
      </button>
      {open && (
        <div className="mx-auto mt-3 max-w-sm rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <IosInstallGuide needsSafari={iosNeedsSafari} strings={guide} />
        </div>
      )}
    </div>
  );
}
