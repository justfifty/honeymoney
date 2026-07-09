// Lightweight, dependency-free i18n. A dictionary lookup with graceful English
// fallback — so partially-translated locales (zh/ta/hi) degrade cleanly to
// English per-key instead of breaking. English + Malay are complete; the other
// three are scaffolded (core chrome) to prove the architecture scales.
// No next-intl / routing changes — the locale is a `?lang=` param (or cookie).

export const LOCALES = ["en", "ms", "zh", "ta", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文",
  ta: "தமிழ்",
  hi: "हिन्दी",
};

type Dict = Record<string, string>;

const en: Dict = {
  "app.title": "Money, Visualized",
  "app.subtitle": "{nodes} nodes · {edges} edges · six lenses on one living graph",
  "app.focusedOn": "Focused on {label} — {nodes} nodes · {edges} edges",
  "nav.dashboard": "Dashboard",
  "persona.label": "Persona",
  "lens.label": "Lens",
  "lens.income": "Income",
  "lens.bucket": "Bucket",
  "lens.vendor": "Vendor",
  "lens.category": "Category",
  "lens.people": "People",
  "lens.wholeGraph": "whole graph",
  "lens.clear": "Clear focus",
  "stat.incomeMo": "Income / mo",
  "stat.allocatedMo": "Allocated / mo",
  "stat.spentMtd": "Spent (mtd)",
  "stat.unallocated": "Unallocated",
  "mode.sankey": "Sankey",
  "mode.treemap": "Treemap",
  "mode.tree": "Tree",
  "mode.organic": "Organic",
  "mode.bars": "Budget",
  "mode.flow": "Flow",
  "add.title": "Add to the graph",
  "add.hint": "income · bucket · allocation · spend — for any person",
  "add.spend": "Spend",
  "add.income": "Income",
  "add.bucket": "Bucket",
  "add.allocation": "Allocation",
  "add.submit": "Add",
  "cap.speak": "Speak",
  "cap.scan": "Scan receipt",
  "cap.noTokens": "free · on-device · no AI tokens",
};

const ms: Dict = {
  "app.title": "Wang, Divisualkan",
  "app.subtitle": "{nodes} nod · {edges} tepi · enam lensa pada satu graf hidup",
  "app.focusedOn": "Fokus pada {label} — {nodes} nod · {edges} tepi",
  "nav.dashboard": "Papan Pemuka",
  "persona.label": "Persona",
  "lens.label": "Lensa",
  "lens.income": "Pendapatan",
  "lens.bucket": "Baldi",
  "lens.vendor": "Penjual",
  "lens.category": "Kategori",
  "lens.people": "Orang",
  "lens.wholeGraph": "seluruh graf",
  "lens.clear": "Kosongkan fokus",
  "stat.incomeMo": "Pendapatan / bln",
  "stat.allocatedMo": "Diperuntukkan / bln",
  "stat.spentMtd": "Dibelanja (btk)",
  "stat.unallocated": "Belum diperuntuk",
  "mode.sankey": "Sankey",
  "mode.treemap": "Peta Pokok",
  "mode.tree": "Pokok",
  "mode.organic": "Organik",
  "mode.bars": "Bajet",
  "mode.flow": "Aliran",
  "add.title": "Tambah ke graf",
  "add.hint": "pendapatan · baldi · peruntukan · perbelanjaan — untuk sesiapa",
  "add.spend": "Belanja",
  "add.income": "Pendapatan",
  "add.bucket": "Baldi",
  "add.allocation": "Peruntukan",
  "add.submit": "Tambah",
  "cap.speak": "Cakap",
  "cap.scan": "Imbas resit",
  "cap.noTokens": "percuma · atas peranti · tanpa token AI",
};

// Scaffolded locales — core chrome only; everything else falls back to English.
const zh: Dict = {
  "app.title": "金钱可视化",
  "persona.label": "身份",
  "lens.label": "视角",
  "nav.dashboard": "仪表板",
  "stat.incomeMo": "月收入",
  "stat.allocatedMo": "已分配",
  "stat.spentMtd": "已花费",
  "add.title": "添加到图表",
  "cap.speak": "语音",
  "cap.scan": "扫描收据",
};
const ta: Dict = {
  "app.title": "பணம், காட்சிப்படுத்தப்பட்டது",
  "persona.label": "நபர்",
  "lens.label": "லென்ஸ்",
  "nav.dashboard": "டாஷ்போர்டு",
  "stat.incomeMo": "வருமானம் / மாதம்",
  "add.title": "வரைபடத்தில் சேர்",
  "cap.speak": "பேசு",
  "cap.scan": "ரசீதை ஸ்கேன்",
};
const hi: Dict = {
  "app.title": "पैसा, दृश्य रूप में",
  "persona.label": "व्यक्ति",
  "lens.label": "लेंस",
  "nav.dashboard": "डैशबोर्ड",
  "stat.incomeMo": "आय / माह",
  "add.title": "ग्राफ़ में जोड़ें",
  "cap.speak": "बोलें",
  "cap.scan": "रसीद स्कैन करें",
};

const DICTS: Record<Locale, Dict> = { en, ms, zh, ta, hi };

export function normalizeLocale(raw?: string): Locale {
  return (LOCALES as readonly string[]).includes(raw ?? "") ? (raw as Locale) : DEFAULT_LOCALE;
}

// t(locale, key, vars?) — falls back to English per-key, then to the key itself.
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[locale]?.[key] ?? DICTS.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
  return s;
}
