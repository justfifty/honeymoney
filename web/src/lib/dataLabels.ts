// Translation for DEMO DATA labels (bucket / goal / income-source / persona names
// that live in the seeded database, not the UI dictionary). A lookup keyed by the
// exact English seed label; anything not in the map — real vendor brands
// (99 Speedmart, TNB…), person names — falls through unchanged, so it is safe to
// apply universally to any label. Custom (non-seed) labels also pass through.
// Non-English values are machine translations — flag for native review.
import type { Locale } from "./i18n";

type LabelTr = { ms: string; zh: string; "zh-Hant": string; hi: string; ta: string };

export const DATA_LABELS: Record<string, LabelTr> = {
  // persona / tenant display names
  "The Rahman Household": { ms: "Isi Rumah Rahman", zh: "Rahman 家庭", "zh-Hant": "Rahman 家庭", hi: "Rahman परिवार", ta: "Rahman குடும்பம்" },
  "Aisha — Solo (Freelance + Shop)": { ms: "Aisha — Solo (Kerja Bebas + Kedai)", zh: "Aisha — 个人 (自由职业 + 店铺)", "zh-Hant": "Aisha — 個人 (自由職業 + 店鋪)", hi: "Aisha — एकल (फ्रीलांस + दुकान)", ta: "Aisha — தனி (ஃப்ரீலான்ஸ் + கடை)" },
  // income sources
  "Salary": { ms: "Gaji", zh: "薪水", "zh-Hant": "薪水", hi: "वेतन", ta: "சம்பளம்" },
  "Aiman — Salary": { ms: "Aiman — Gaji", zh: "Aiman — 薪水", "zh-Hant": "Aiman — 薪水", hi: "Aiman — वेतन", ta: "Aiman — சம்பளம்" },
  "Siti — Salary": { ms: "Siti — Gaji", zh: "Siti — 薪水", "zh-Hant": "Siti — 薪水", hi: "Siti — वेतन", ta: "Siti — சம்பளம்" },
  "Rental (spare room)": { ms: "Sewa (bilik tambahan)", zh: "租金 (空房)", "zh-Hant": "租金 (空房)", hi: "किराया (अतिरिक्त कमरा)", ta: "வாடகை (உபரி அறை)" },
  "Side Hustle (Grab)": { ms: "Kerja Sampingan (Grab)", zh: "副业 (Grab)", "zh-Hant": "副業 (Grab)", hi: "अतिरिक्त काम (Grab)", ta: "பக்க வேலை (Grab)" },
  "Cafe Revenue": { ms: "Hasil Kafe", zh: "咖啡馆收入", "zh-Hant": "咖啡館收入", hi: "कैफे राजस्व", ta: "கஃபே வருவாய்" },
  "Dine-in Revenue": { ms: "Hasil Makan di Kedai", zh: "堂食收入", "zh-Hant": "堂食收入", hi: "डाइन-इन राजस्व", ta: "உள்ளே சாப்பிடும் வருவாய்" },
  "Catering Orders": { ms: "Pesanan Katering", zh: "餐饮订单", "zh-Hant": "餐飲訂單", hi: "कैटरिंग ऑर्डर", ta: "கேட்டரிங் ஆர்டர்கள்" },
  "Delivery (GrabFood/foodpanda)": { ms: "Penghantaran (GrabFood/foodpanda)", zh: "外送 (GrabFood/foodpanda)", "zh-Hant": "外送 (GrabFood/foodpanda)", hi: "डिलीवरी (GrabFood/foodpanda)", ta: "டெலிவரி (GrabFood/foodpanda)" },
  "Freelance Design": { ms: "Reka Bentuk Bebas", zh: "自由设计", "zh-Hant": "自由設計", hi: "फ्रीलांस डिज़ाइन", ta: "ஃப்ரீலான்ஸ் வடிவமைப்பு" },
  "Online Shop (Shopee)": { ms: "Kedai Dalam Talian (Shopee)", zh: "网店 (Shopee)", "zh-Hant": "網店 (Shopee)", hi: "ऑनलाइन दुकान (Shopee)", ta: "ஆன்லைன் கடை (Shopee)" },
  "Rental (studio unit)": { ms: "Sewa (unit studio)", zh: "租金 (单间单位)", "zh-Hant": "租金 (單間單位)", hi: "किराया (स्टूडियो यूनिट)", ta: "வாடகை (ஸ்டூடியோ யூனிட்)" },
  "Dividends (ASB/stocks)": { ms: "Dividen (ASB/saham)", zh: "股息 (ASB/股票)", "zh-Hant": "股息 (ASB/股票)", hi: "लाभांश (ASB/स्टॉक)", ta: "பங்குலாபம் (ASB/பங்குகள்)" },
  "Content (YouTube/TikTok)": { ms: "Kandungan (YouTube/TikTok)", zh: "内容创作 (YouTube/TikTok)", "zh-Hant": "內容創作 (YouTube/TikTok)", hi: "कंटेंट (YouTube/TikTok)", ta: "உள்ளடக்கம் (YouTube/TikTok)" },
  // buckets — the three starter buckets every new household gets (lib/household.ts)
  "Must-paid": { ms: "Wajib Bayar", zh: "必付", "zh-Hant": "必付", hi: "अनिवार्य भुगतान", ta: "கட்டாயச் செலவு" },
  "Savings": { ms: "Simpanan", zh: "储蓄", "zh-Hant": "儲蓄", hi: "बचत", ta: "சேமிப்பு" },
  "Spendings": { ms: "Perbelanjaan", zh: "日常开销", "zh-Hant": "日常開銷", hi: "खर्च", ta: "செலவுகள்" },
  "Rent": { ms: "Sewa", zh: "房租", "zh-Hant": "房租", hi: "किराया", ta: "வாடகை" },
  "Utilities": { ms: "Utiliti", zh: "水电费", "zh-Hant": "水電費", hi: "उपयोगिताएँ", ta: "பயன்பாட்டு கட்டணங்கள்" },
  "Education": { ms: "Pendidikan", zh: "教育", "zh-Hant": "教育", hi: "शिक्षा", ta: "கல்வி" },
  "Groceries": { ms: "Barangan Runcit", zh: "杂货", "zh-Hant": "雜貨", hi: "किराना", ta: "மளிகை" },
  "Personal — Aiman": { ms: "Peribadi — Aiman", zh: "个人 — Aiman", "zh-Hant": "個人 — Aiman", hi: "व्यक्तिगत — Aiman", ta: "தனிப்பட்ட — Aiman" },
  "Personal — Siti": { ms: "Peribadi — Siti", zh: "个人 — Siti", "zh-Hant": "個人 — Siti", hi: "व्यक्तिगत — Siti", ta: "தனிப்பட்ட — Siti" },
  "Payroll": { ms: "Gaji Pekerja", zh: "薪资", "zh-Hant": "薪資", hi: "पेरोल", ta: "ஊதியப் பட்டியல்" },
  "Suppliers": { ms: "Pembekal", zh: "供应商", "zh-Hant": "供應商", hi: "आपूर्तिकर्ता", ta: "சப்ளையர்கள்" },
  "Rent & Utilities": { ms: "Sewa & Utiliti", zh: "房租与水电", "zh-Hant": "房租與水電", hi: "किराया और उपयोगिताएँ", ta: "வாடகை & பயன்பாட்டு கட்டணங்கள்" },
  "Tax Reserve": { ms: "Rizab Cukai", zh: "税务储备", "zh-Hant": "稅務儲備", hi: "कर आरक्षित", ta: "வரி இருப்பு" },
  "Growth Fund": { ms: "Dana Pertumbuhan", zh: "成长基金", "zh-Hant": "成長基金", hi: "वृद्धि कोष", ta: "வளர்ச்சி நிதி" },
  "Owner Draw": { ms: "Ambilan Pemilik", zh: "业主提款", "zh-Hant": "業主提款", hi: "मालिक आहरण", ta: "உரிமையாளர் எடுப்பு" },
  "Transport": { ms: "Pengangkutan", zh: "交通", "zh-Hant": "交通", hi: "परिवहन", ta: "போக்குவரத்து" },
  "Kids & School": { ms: "Anak & Sekolah", zh: "孩子与学校", "zh-Hant": "孩子與學校", hi: "बच्चे और स्कूल", ta: "குழந்தைகள் & பள்ளி" },
  "Statutory (EPF/SOCSO/EIS)": { ms: "Berkanun (EPF/SOCSO/EIS)", zh: "法定扣除 (EPF/SOCSO/EIS)", "zh-Hant": "法定扣除 (EPF/SOCSO/EIS)", hi: "वैधानिक (EPF/SOCSO/EIS)", ta: "சட்டப்பூர்வ (EPF/SOCSO/EIS)" },
  "Income Tax (PCB)": { ms: "Cukai Pendapatan (PCB)", zh: "所得税 (PCB)", "zh-Hant": "所得稅 (PCB)", hi: "आयकर (PCB)", ta: "வருமான வரி (PCB)" },
  "Insurance (life + medical)": { ms: "Insurans (hayat + perubatan)", zh: "保险 (人寿 + 医疗)", "zh-Hant": "保險 (人壽 + 醫療)", hi: "बीमा (जीवन + चिकित्सा)", ta: "காப்பீடு (ஆயுள் + மருத்துவம்)" },
  "Bills & Subscriptions": { ms: "Bil & Langganan", zh: "账单与订阅", "zh-Hant": "帳單與訂閱", hi: "बिल और सब्सक्रिप्शन", ta: "பில்கள் & சந்தாக்கள்" },
  "Employer Statutory (EPF/SOCSO)": { ms: "Berkanun Majikan (EPF/SOCSO)", zh: "雇主法定 (EPF/SOCSO)", "zh-Hant": "雇主法定 (EPF/SOCSO)", hi: "नियोक्ता वैधानिक (EPF/SOCSO)", ta: "முதலாளி சட்டப்பூர்வ (EPF/SOCSO)" },
  "SST / Service Tax": { ms: "SST / Cukai Perkhidmatan", zh: "SST / 服务税", "zh-Hant": "SST / 服務稅", hi: "SST / सेवा कर", ta: "SST / சேவை வரி" },
  "Business Insurance": { ms: "Insurans Perniagaan", zh: "商业保险", "zh-Hant": "商業保險", hi: "व्यवसाय बीमा", ta: "வணிக காப்பீடு" },
  "Utilities & Internet": { ms: "Utiliti & Internet", zh: "水电与网络", "zh-Hant": "水電與網路", hi: "उपयोगिताएँ और इंटरनेट", ta: "பயன்பாட்டு கட்டணங்கள் & இணையம்" },
  "Marketing": { ms: "Pemasaran", zh: "营销", "zh-Hant": "行銷", hi: "मार्केटिंग", ta: "சந்தைப்படுத்தல்" },
  "Software & AI": { ms: "Perisian & AI", zh: "软件与 AI", "zh-Hant": "軟體與 AI", hi: "सॉफ्टवेयर और AI", ta: "மென்பொருள் & AI" },
  "Rent & Home": { ms: "Sewa & Rumah", zh: "房租与居家", "zh-Hant": "房租與居家", hi: "किराया और घर", ta: "வாடகை & வீடு" },
  "Statutory & Tax (self)": { ms: "Berkanun & Cukai (sendiri)", zh: "法定与税务 (自雇)", "zh-Hant": "法定與稅務 (自僱)", hi: "वैधानिक और कर (स्वयं)", ta: "சட்டப்பூர்வ & வரி (சொந்தம்)" },
  "Insurance": { ms: "Insurans", zh: "保险", "zh-Hant": "保險", hi: "बीमा", ta: "காப்பீடு" },
  "Business Costs": { ms: "Kos Perniagaan", zh: "业务成本", "zh-Hant": "業務成本", hi: "व्यवसाय लागत", ta: "வணிக செலவுகள்" },
  "Emergency & Tax Reserve": { ms: "Kecemasan & Rizab Cukai", zh: "应急与税务储备", "zh-Hant": "應急與稅務儲備", hi: "आपातकाल और कर आरक्षित", ta: "அவசரம் & வரி இருப்பு" },
  "Investments": { ms: "Pelaburan", zh: "投资", "zh-Hant": "投資", hi: "निवेश", ta: "முதலீடுகள்" },
  "Living & Food": { ms: "Kehidupan & Makanan", zh: "生活与饮食", "zh-Hant": "生活與飲食", hi: "जीवन और भोजन", ta: "வாழ்க்கை & உணவு" },
  "Personal & Lifestyle": { ms: "Peribadi & Gaya Hidup", zh: "个人与生活方式", "zh-Hant": "個人與生活方式", hi: "व्यक्तिगत और जीवनशैली", ta: "தனிப்பட்ட & வாழ்க்கை முறை" },
  // goals
  "House Deposit": { ms: "Deposit Rumah", zh: "购房首付", "zh-Hant": "購房頭期款", hi: "घर का डाउन पेमेंट", ta: "வீட்டு முன்பணம்" },
  "Umrah Fund": { ms: "Dana Umrah", zh: "Umrah 基金", "zh-Hant": "Umrah 基金", hi: "उमराह कोष", ta: "உம்ரா நிதி" },
  "Own Studio Space": { ms: "Ruang Studio Sendiri", zh: "拥有工作室空间", "zh-Hant": "擁有工作室空間", hi: "अपना स्टूडियो स्थान", ta: "சொந்த ஸ்டூடியோ இடம்" },
};

export function dataLabel(locale: Locale, raw: string): string {
  if (locale === "en") return raw;
  return DATA_LABELS[raw]?.[locale] ?? raw;
}
