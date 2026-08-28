// The notices themselves. Content only — the shape and the reasoning are in
// lib/legal.ts, and the rendering is in app/legal/[doc]/page.tsx.

import type { LegalDoc } from "./legal";
import { SHARE_SPECS } from "./sharing";

// ── Financial education disclaimer ─────────────────────────────────────────
//
// The single most important document here, and the reason it is separate from
// the terms: the boundary between "an educational tool" and "regulated advice"
// is what stands between this project and a licensing problem, and a boundary
// buried in clause 8 of a contract is not one a regulator, a judge or a user
// will find. It gets a URL.
//
// It also states, plainly, the thing most disclaimers imply and never say: a
// disclaimer does not by itself make regulated activity unregulated. The SC's
// own position. Writing that down is uncomfortable and is exactly why it
// belongs here — it is the sentence that keeps the product design honest,
// because it means the protection has to come from what the app actually does
// (no ranking, no recommendation, no score-gated products) rather than from a
// paragraph.
const disclaimer: LegalDoc = {
  slug: "disclaimer",
  version: "2026-08-27",
  en: {
    title: "Financial education disclaimer",
    summary:
      "HoneyMoney is an educational tool. It is not advice, not a bank, and not a licensed adviser — and this page says exactly where that line sits.",
  },
  ms: {
    title: "Penafian pendidikan kewangan",
    summary:
      "HoneyMoney ialah alat pendidikan. Ia bukan nasihat, bukan bank, dan bukan penasihat berlesen — halaman ini menyatakan dengan tepat di mana garisan itu terletak.",
  },
  inContext: {
    en: "Educational only. HoneyMoney is not financial advice and does not guarantee any outcome.",
    ms: "Untuk pendidikan sahaja. HoneyMoney bukan nasihat kewangan dan tidak menjamin sebarang hasil.",
  },
  sections: [
    {
      id: "what",
      en: {
        heading: "What HoneyMoney is",
        body: [
          "An educational and organisational tool for household money. It records what you tell it, sorts it into three buckets, does arithmetic on it, and shows you the result. That is the whole of it.",
          "It is offered free of charge to households because the people under the most cost-of-living pressure are the ones a price would exclude.",
        ],
      },
      ms: {
        heading: "Apa itu HoneyMoney",
        body: [
          "Alat pendidikan dan penyusunan untuk wang isi rumah. Ia merekod apa yang anda beritahu, menyusunnya ke dalam tiga baldi, membuat pengiraan, dan menunjukkan hasilnya kepada anda. Itu sahaja.",
          "Ia ditawarkan secara percuma kepada isi rumah kerana orang yang paling tertekan oleh kos sara hidup ialah mereka yang akan disingkirkan oleh harga.",
        ],
      },
    },
    {
      id: "not",
      en: {
        heading: "What it is not",
        body: [
          "It is NOT personal financial advice. Nothing in the app is a recommendation about what you should do with your money, and nothing in it is tailored to your circumstances in the sense that word carries in financial regulation.",
          "It is NOT banking, lending, investment, insurance, takaful, tax, legal or accounting advice or service. We are not licensed by Bank Negara Malaysia or the Securities Commission, and we do not hold, move, lend or invest your money.",
          "It does NOT guarantee an outcome. Forecasts, warnings, category splits, the H-Score and anything an AI feature writes are educational aids computed from figures you entered or approved. They can be incomplete or wrong, and they promise nothing.",
          "It is NOT a substitute for a professional. For advice about your own situation, speak to a licensed financial planner, a licensed adviser, an accountant, or — free of charge in Malaysia — AKPK, the credit counselling agency set up by Bank Negara.",
        ],
      },
      ms: {
        heading: "Apa yang ia bukan",
        body: [
          "Ia BUKAN nasihat kewangan peribadi. Tiada apa-apa dalam aplikasi ini merupakan syor tentang apa yang patut anda lakukan dengan wang anda, dan tiada apa-apa di dalamnya disesuaikan dengan keadaan anda dalam erti kata yang dibawa oleh peraturan kewangan.",
          "Ia BUKAN perkhidmatan atau nasihat perbankan, pinjaman, pelaburan, insurans, takaful, cukai, undang-undang atau perakaunan. Kami tidak dilesenkan oleh Bank Negara Malaysia atau Suruhanjaya Sekuriti, dan kami tidak memegang, memindahkan, meminjamkan atau melaburkan wang anda.",
          "Ia TIDAK menjamin sebarang hasil. Ramalan, amaran, pecahan kategori, H-Score dan apa-apa yang ditulis oleh ciri AI adalah alat bantu pendidikan yang dikira daripada angka yang anda masukkan atau luluskan. Ia boleh tidak lengkap atau salah, dan ia tidak menjanjikan apa-apa.",
          "Ia BUKAN pengganti kepada seorang profesional. Untuk nasihat tentang keadaan anda sendiri, rujuk perancang kewangan berlesen, penasihat berlesen, akauntan, atau — percuma di Malaysia — AKPK, agensi kaunseling kredit yang ditubuhkan oleh Bank Negara.",
        ],
      },
    },
    {
      id: "limits-of-a-disclaimer",
      en: {
        heading: "What this page cannot do",
        body: [
          "A disclaimer does not change what an activity is. The Securities Commission has said as much: telling users that something is not advice does not remove a licensing requirement from conduct that is, in substance, regulated advice.",
          "So the protection here is not this page. It is what the app does and does not do. The product directory lists licensed providers and carries no score, rank, rating or “best for” field, because there is nowhere in the data model to put one. It is never filtered by your H-Score, because a score-gated directory is a recommendation with extra steps. No listing is paid for today, and any that ever is will say so on its face.",
          "If we ever build something that crosses that line, the answer will be to get licensed or not to build it — not to lengthen this page.",
        ],
      },
      ms: {
        heading: "Apa yang halaman ini tidak boleh lakukan",
        body: [
          "Penafian tidak mengubah sifat sesuatu aktiviti. Suruhanjaya Sekuriti telah menyatakan demikian: memberitahu pengguna bahawa sesuatu itu bukan nasihat tidak menghapuskan keperluan pelesenan bagi kelakuan yang, pada intinya, adalah nasihat terkawal.",
          "Jadi perlindungan di sini bukanlah halaman ini. Ia adalah apa yang aplikasi ini lakukan dan tidak lakukan. Direktori produk menyenaraikan penyedia berlesen dan tidak membawa sebarang skor, kedudukan, penarafan atau medan “terbaik untuk”, kerana tiada tempat dalam model data untuk meletakkannya. Ia tidak pernah ditapis mengikut H-Score anda, kerana direktori yang bergantung pada skor ialah syor dengan langkah tambahan. Tiada penyenaraian dibayar hari ini, dan mana-mana yang dibayar kelak akan menyatakannya secara terbuka.",
          "Jika kami membina sesuatu yang melepasi garisan itu, jawapannya ialah mendapatkan lesen atau tidak membinanya — bukan memanjangkan halaman ini.",
        ],
      },
    },
    {
      id: "your-decisions",
      en: {
        heading: "Your decisions stay yours",
        body: [
          "You are responsible for reviewing what the app produces before you act on it — imported statements, scanned receipts, automatic categories and AI-assisted entries alike. Check them against your own bank and e-wallet records.",
          "Statutory figures (EPF, SOCSO, EIS, PCB, SST) are shown as cashflow so you can see them, not as a filing. File through LHDN, KWSP, your accountant or approved software.",
        ],
      },
      ms: {
        heading: "Keputusan anda kekal milik anda",
        body: [
          "Anda bertanggungjawab menyemak apa yang dihasilkan oleh aplikasi sebelum bertindak atasnya — penyata yang diimport, resit yang diimbas, kategori automatik dan entri berbantukan AI. Semaknya dengan rekod bank dan e-dompet anda sendiri.",
          "Angka berkanun (KWSP, PERKESO, SIP, PCB, SST) dipaparkan sebagai aliran tunai supaya anda dapat melihatnya, bukan sebagai penyata. Failkan melalui LHDN, KWSP, akauntan anda atau perisian yang diluluskan.",
        ],
      },
    },
  ],
};

// ── H-Score methodology and limits ─────────────────────────────────────────
const hscore: LegalDoc = {
  slug: "hscore",
  version: "2026-08-27",
  en: {
    title: "H-Score: how it works, and what it is not",
    summary:
      "The Money Health Score in full: what it measures, the weights, what happens when data is missing, and why no lender, employer or landlord may use it.",
  },
  ms: {
    title: "H-Score: cara ia berfungsi, dan apa yang ia bukan",
    summary:
      "Money Health Score sepenuhnya: apa yang diukurnya, wajarannya, apa yang berlaku apabila data tiada, dan mengapa tiada pemberi pinjaman, majikan atau tuan rumah boleh menggunakannya.",
  },
  inContext: {
    en: "Not a credit score. Computed from what you entered, visible only to you, and never shared with a lender, insurer, landlord or employer.",
    ms: "Bukan skor kredit. Dikira daripada apa yang anda masukkan, kelihatan kepada anda sahaja, dan tidak pernah dikongsi dengan pemberi pinjaman, penanggung insurans, tuan rumah atau majikan.",
  },
  sections: [
    {
      id: "measures",
      en: {
        heading: "What it measures",
        body: [
          "Five things about the money you have recorded, weighted to a total of 100: how much of your income you save, how heavy your essential spending is, how much of your income goes to debt, how many months of expenses your buffer would cover, and whether your personal spending stayed inside the cap you set yourself.",
          "It is measured over a rolling 90 days. One-off annual bills — road tax, insurance, school fees, Raya — are spread across 12 months, so a single large legitimate payment does not crater a month.",
          "Your band (Building, Steady, Strong, Thriving) only changes after the underlying score has held at the new level for 7 consecutive days. A number that flips twice a week is not an identity anyone can act on.",
        ],
      },
      ms: {
        heading: "Apa yang diukurnya",
        body: [
          "Lima perkara tentang wang yang telah anda rekodkan, diwajarkan kepada jumlah 100: berapa banyak pendapatan anda yang disimpan, berapa berat perbelanjaan penting anda, berapa banyak pendapatan anda yang pergi kepada hutang, berapa bulan perbelanjaan yang boleh ditampung oleh simpanan penampan anda, dan sama ada perbelanjaan peribadi anda kekal dalam had yang anda tetapkan sendiri.",
          "Ia diukur dalam tempoh 90 hari bergolek. Bil tahunan sekali sahaja — cukai jalan, insurans, yuran sekolah, Raya — disebarkan selama 12 bulan, supaya satu pembayaran besar yang sah tidak menjunamkan sesuatu bulan.",
          "Jalur anda (Membina, Stabil, Kukuh, Makmur) hanya berubah selepas skor asas kekal pada tahap baharu selama 7 hari berturut-turut. Nombor yang berbolak-balik dua kali seminggu bukanlah identiti yang boleh ditindaklanjuti oleh sesiapa.",
        ],
      },
    },
    {
      id: "inputs",
      en: {
        heading: "Where the inputs come from",
        body: [
          "Entirely from you. Every figure is a record you entered, imported or approved. HoneyMoney has no connection to any bank, and nothing is fetched about you from anywhere.",
          "That means a loan you have not told us about scores as no debt at all, and savings you hold elsewhere do not count. The score describes the money you have shown it, not the money you have.",
          "Records you have marked private still count towards your own score — it is your score. Records you have excluded from household totals do not count towards the household's.",
        ],
      },
      ms: {
        heading: "Dari mana input datang",
        body: [
          "Sepenuhnya daripada anda. Setiap angka ialah rekod yang anda masukkan, import atau luluskan. HoneyMoney tiada sambungan kepada mana-mana bank, dan tiada apa-apa diambil tentang anda dari mana-mana tempat.",
          "Ini bermakna pinjaman yang tidak anda beritahu kami dikira sebagai tiada hutang langsung, dan simpanan yang anda pegang di tempat lain tidak dikira. Skor itu menggambarkan wang yang anda tunjukkan kepadanya, bukan wang yang anda miliki.",
          "Rekod yang anda tandakan peribadi tetap dikira dalam skor anda sendiri — ia skor anda. Rekod yang anda kecualikan daripada jumlah isi rumah tidak dikira dalam skor isi rumah.",
        ],
      },
    },
    {
      id: "missing",
      en: {
        heading: "When there is not enough to be honest about",
        body: [
          "Below a minimum of recent activity the score is shown as PROVISIONAL, greyed, and accompanied by a list of exactly what is still missing. It is not hidden, because a blank screen tells you nothing, and it is not presented as final, because it would be a confident number computed from almost nothing.",
          "Individual components carry their own warnings. A component fed by data you have not supplied says so in place of scoring you well by default.",
          "Every point is traceable. The methodology panel on the score itself shows the period, the record count and the weights, so you can disagree with the arithmetic rather than only with the result.",
        ],
      },
      ms: {
        heading: "Apabila tidak cukup untuk jujur tentangnya",
        body: [
          "Di bawah tahap minimum aktiviti terkini, skor dipaparkan sebagai SEMENTARA, dikelabukan, dan disertai senarai tepat apa yang masih tiada. Ia tidak disembunyikan, kerana skrin kosong tidak memberitahu anda apa-apa, dan ia tidak dipersembahkan sebagai muktamad, kerana ia akan menjadi nombor yang yakin yang dikira daripada hampir tiada apa-apa.",
          "Komponen individu membawa amaran masing-masing. Komponen yang disuap oleh data yang tidak anda bekalkan menyatakannya, dan bukannya memberi anda skor baik secara lalai.",
          "Setiap mata boleh dijejaki. Panel metodologi pada skor itu sendiri menunjukkan tempoh, bilangan rekod dan wajaran, supaya anda boleh tidak bersetuju dengan pengiraannya dan bukan hanya dengan hasilnya.",
        ],
      },
    },
    {
      id: "limits",
      en: {
        heading: "The limits — read this one",
        body: [
          "It is NOT a credit score. It has no relationship to CCRIS, CTOS, or any credit bureau, and it has no bearing on your creditworthiness.",
          "It is NOT a lending decision, an affordability assessment, an investment suitability assessment, or a recommendation of any kind.",
          "It must NOT be relied on by a third party for employment, tenancy, insurance, lending or any similar decision. Nobody may require you to show it. We do not give it to anyone, and there is no mechanism in the app by which a lender, employer, landlord or insurer could obtain it.",
          "Your score is private to you by default, including from the people in your own household. Sharing it is a switch only you can turn on, and turning it off again hides it and your history of it.",
          "If any figure behind it is wrong, correct the record and the score recomputes. Nothing about it is fixed or held against you.",
        ],
      },
      ms: {
        heading: "Hadnya — sila baca yang ini",
        body: [
          "Ia BUKAN skor kredit. Ia tiada kaitan dengan CCRIS, CTOS, atau mana-mana biro kredit, dan ia tiada kaitan dengan kelayakan kredit anda.",
          "Ia BUKAN keputusan pinjaman, penilaian kemampuan, penilaian kesesuaian pelaburan, atau syor dalam apa jua bentuk.",
          "Ia TIDAK boleh dijadikan sandaran oleh pihak ketiga bagi keputusan pekerjaan, penyewaan, insurans, pinjaman atau apa-apa keputusan serupa. Tiada sesiapa boleh mewajibkan anda menunjukkannya. Kami tidak memberikannya kepada sesiapa, dan tiada mekanisme dalam aplikasi ini yang membolehkan pemberi pinjaman, majikan, tuan rumah atau penanggung insurans memperolehnya.",
          "Skor anda peribadi kepada anda secara lalai, termasuk daripada orang dalam isi rumah anda sendiri. Berkongsinya ialah suis yang hanya anda boleh hidupkan, dan mematikannya semula menyembunyikannya berserta sejarahnya.",
          "Jika mana-mana angka di sebaliknya salah, betulkan rekod itu dan skor akan dikira semula. Tiada apa-apa mengenainya yang tetap atau digunakan terhadap anda.",
        ],
      },
    },
  ],
};

// ── AI feature notice ──────────────────────────────────────────────────────
const ai: LegalDoc = {
  slug: "ai",
  version: "2026-08-27",
  en: {
    title: "AI features: what is sent, to whom, and how to stop",
    summary:
      "AI is optional and off by default. This says exactly what leaves your device when it is on, which provider receives it, and what still works when it is off.",
  },
  ms: {
    title: "Ciri AI: apa yang dihantar, kepada siapa, dan cara menghentikannya",
    summary:
      "AI adalah pilihan dan dimatikan secara lalai. Ini menyatakan dengan tepat apa yang keluar dari peranti anda apabila ia dihidupkan, penyedia mana yang menerimanya, dan apa yang masih berfungsi apabila ia dimatikan.",
  },
  inContext: {
    en: "Optional. This sends the text you selected to an AI provider outside Malaysia. Do not include account numbers, ID numbers, passwords or other people's details. Core budgeting works without it.",
    ms: "Pilihan. Ini menghantar teks yang anda pilih kepada penyedia AI di luar Malaysia. Jangan sertakan nombor akaun, nombor pengenalan, kata laluan atau butiran orang lain. Belanjawan teras berfungsi tanpanya.",
  },
  sections: [
    {
      id: "off",
      en: {
        heading: "It is off until you turn it on, and the app works without it",
        body: [
          "No AI feature runs unless you have given consent for it in Settings. With AI off, HoneyMoney still records, categorises, buckets, forecasts, computes your H-Score and scans receipts. Nothing that produces a number needs a model.",
          "Turning it off later stops it immediately. Nothing you previously sent can be recalled from a provider, and we say so rather than implying otherwise.",
        ],
      },
      ms: {
        heading: "Ia dimatikan sehingga anda menghidupkannya, dan aplikasi berfungsi tanpanya",
        body: [
          "Tiada ciri AI berjalan melainkan anda telah memberikan persetujuan untuknya dalam Tetapan. Dengan AI dimatikan, HoneyMoney tetap merekod, mengkategori, membaldi, meramal, mengira H-Score anda dan mengimbas resit. Tiada apa-apa yang menghasilkan nombor memerlukan model.",
          "Mematikannya kemudian menghentikannya serta-merta. Apa yang telah anda hantar sebelum ini tidak boleh ditarik balik daripada penyedia, dan kami menyatakannya dan bukannya membayangkan sebaliknya.",
        ],
      },
    },
    {
      id: "never-maths",
      en: {
        heading: "A model never does the arithmetic",
        body: [
          "Every figure in HoneyMoney is computed by our code. A language model only ever chooses the wording around figures that already exist.",
          "Before an AI-written answer reaches you, every number in it is checked against what the code produced. If even one was invented, the whole answer is thrown away and a plain pre-written one is shown instead. That check runs whether or not you would have noticed.",
        ],
      },
      ms: {
        heading: "Model tidak pernah membuat pengiraan",
        body: [
          "Setiap angka dalam HoneyMoney dikira oleh kod kami. Model bahasa hanya memilih perkataan di sekeliling angka yang sudah wujud.",
          "Sebelum jawapan yang ditulis AI sampai kepada anda, setiap nombor di dalamnya disemak dengan apa yang dihasilkan oleh kod. Jika satu pun direka, keseluruhan jawapan dibuang dan jawapan biasa yang ditulis terlebih dahulu dipaparkan sebagai gantinya. Semakan itu berjalan sama ada anda perasan atau tidak.",
        ],
      },
    },
    {
      id: "who",
      en: {
        heading: "Which provider, and where it is",
        body: [
          "One of three, and the active one is named on your Settings screen. A local model running on hardware we operate in Malaysia — nothing leaves that machine. Google (Gemini) — processing outside Malaysia. Groq — processing outside Malaysia.",
          "Receipt scanning runs in your own browser by default, using an OCR engine served from our origin. In that mode the image never reaches us or any provider, and it works with no internet connection at all.",
        ],
      },
      ms: {
        heading: "Penyedia yang mana, dan di mana ia berada",
        body: [
          "Salah satu daripada tiga, dan yang aktif dinamakan pada skrin Tetapan anda. Model tempatan yang berjalan pada perkakasan yang kami kendalikan di Malaysia — tiada apa-apa keluar dari mesin itu. Google (Gemini) — pemprosesan di luar Malaysia. Groq — pemprosesan di luar Malaysia.",
          "Pengimbasan resit berjalan dalam pelayar anda sendiri secara lalai, menggunakan enjin OCR yang disajikan dari domain kami. Dalam mod itu imej tidak pernah sampai kepada kami atau mana-mana penyedia, dan ia berfungsi tanpa sambungan internet langsung.",
        ],
      },
    },
    {
      id: "what-is-sent",
      en: {
        heading: "Exactly what is sent",
        body: [
          "For a question to Honey: an intent, placeholder names and ordinals — not your figures, not your merchants, not your notes. The arithmetic happens here; the model is given the shape of an answer and asked to phrase it.",
          "For receipt or statement reading with a cloud provider: the document itself, because there is no way to read an image without sending the image. This is why on-device scanning is the default and why the cloud option is a separate, explicit choice.",
          "Never sent, in any mode: your password, your email address, your account identifiers, your H-Score, or another household member's records.",
          "This is about what reaches an AI PROVIDER. It is not a claim that your records are unreadable by us — they are readable, and the Privacy Notice says so plainly under “Who else sees it”.",
          "Do not paste account numbers, identity card numbers, passwords or other people's personal details into an AI prompt. We cannot remove them once sent.",
        ],
      },
      ms: {
        heading: "Apa yang dihantar dengan tepat",
        body: [
          "Bagi soalan kepada Honey: satu niat, nama ruang letak dan nombor kedudukan — bukan angka anda, bukan peniaga anda, bukan nota anda. Pengiraan berlaku di sini; model diberi bentuk jawapan dan diminta menyusun ayatnya.",
          "Bagi pembacaan resit atau penyata dengan penyedia awan: dokumen itu sendiri, kerana tiada cara membaca imej tanpa menghantar imej itu. Inilah sebabnya pengimbasan pada peranti ialah lalai dan mengapa pilihan awan ialah pilihan berasingan yang eksplisit.",
          "Tidak pernah dihantar, dalam mana-mana mod: kata laluan anda, alamat e-mel anda, pengenal akaun anda, H-Score anda, atau rekod ahli isi rumah yang lain.",
          "Ini mengenai apa yang sampai kepada PENYEDIA AI. Ia bukan dakwaan bahawa rekod anda tidak boleh dibaca oleh kami — ia boleh dibaca, dan Notis Privasi menyatakannya dengan jelas di bawah “Siapa lagi yang melihatnya”.",
          "Jangan tampal nombor akaun, nombor kad pengenalan, kata laluan atau butiran peribadi orang lain ke dalam gesaan AI. Kami tidak boleh membuangnya setelah dihantar.",
        ],
      },
    },
    {
      id: "controls",
      en: {
        heading: "Your controls",
        body: [
          "Turn AI off entirely, in Settings → Privacy. It is one switch and it takes effect immediately.",
          "Keep receipt scanning on-device, which is the default. Cloud extraction is a separate choice you make per import.",
          "Choose the provider, or supply your own key so requests run under your own account rather than ours. A key you save is encrypted before it reaches the database.",
          "Every call is logged with its cost, so you can see what ran and what it cost rather than taking our word for it.",
        ],
      },
      ms: {
        heading: "Kawalan anda",
        body: [
          "Matikan AI sepenuhnya, dalam Tetapan → Privasi. Ia satu suis dan ia berkuat kuasa serta-merta.",
          "Kekalkan pengimbasan resit pada peranti, iaitu tetapan lalai. Pengekstrakan awan ialah pilihan berasingan yang anda buat bagi setiap import.",
          "Pilih penyedia, atau bekalkan kunci anda sendiri supaya permintaan berjalan di bawah akaun anda dan bukan akaun kami. Kunci yang anda simpan disulitkan sebelum sampai ke pangkalan data.",
          "Setiap panggilan dilog bersama kosnya, supaya anda boleh melihat apa yang berjalan dan berapa kosnya dan bukan sekadar mempercayai kata-kata kami.",
        ],
      },
    },
    {
      id: "wrong",
      en: {
        heading: "It can still be wrong",
        body: [
          "AI can misread a receipt, file a purchase under the wrong bucket, or phrase something badly. Check anything before you act on it, and correct it if it is wrong — your correction is what gets stored, and the correction itself is recorded in the audit ledger.",
        ],
      },
      ms: {
        heading: "Ia masih boleh tersilap",
        body: [
          "AI boleh tersalah baca resit, memfailkan pembelian di bawah baldi yang salah, atau menyusun ayat dengan kurang tepat. Semak apa-apa sebelum anda bertindak atasnya, dan betulkannya jika ia salah — pembetulan anda itulah yang disimpan, dan pembetulan itu sendiri direkodkan dalam lejar audit.",
        ],
      },
    },
  ],
};

// ── Household sharing notice ───────────────────────────────────────────────
//
// The default table is GENERATED from lib/sharing.ts rather than typed out.
// A notice that describes defaults which the code no longer implements is worse
// than no notice, and the only way to guarantee they agree is to have one
// source. If a default changes, this document changes with it.
const sharing: LegalDoc = {
  slug: "sharing",
  version: "2026-08-27",
  en: {
    title: "Household sharing notice",
    summary:
      "What the people in your household can and cannot see, what changes when you revoke, and how to leave.",
  },
  ms: {
    title: "Notis perkongsian isi rumah",
    summary:
      "Apa yang orang dalam isi rumah anda boleh dan tidak boleh lihat, apa yang berubah apabila anda menarik balik, dan cara untuk keluar.",
  },
  inContext: {
    en: "Private by default. Your transactions, receipts, goals, score and forecast are not shared with your household unless you switch them on.",
    ms: "Peribadi secara lalai. Transaksi, resit, matlamat, skor dan ramalan anda tidak dikongsi dengan isi rumah anda melainkan anda menghidupkannya.",
  },
  sections: [
    {
      id: "default",
      en: {
        heading: "Private by default",
        body: [
          "Eight kinds of data can be shared with your household. Two are on by default because the app cannot do its job without them — what must be paid, and the total each person contributed. The other six are off.",
          ...SHARE_SPECS.map(
            (s) =>
              `${s.label} — ${s.default ? "SHARED by default" : "PRIVATE by default"}. When on: ${s.onMeans} When off: ${s.offMeans}`,
          ),
        ],
      },
      ms: {
        heading: "Peribadi secara lalai",
        body: [
          "Lapan jenis data boleh dikongsi dengan isi rumah anda. Dua dihidupkan secara lalai kerana aplikasi tidak dapat menjalankan tugasnya tanpanya — apa yang mesti dibayar, dan jumlah yang disumbangkan oleh setiap orang. Enam yang lain dimatikan.",
          "Butiran penuh setiap satu, berserta apa yang dilihat oleh isi rumah anda apabila ia dihidupkan dan dimatikan, dipaparkan dalam Perkongsian & privasi. Tetapan lalai adalah: item mesti-bayar dan jumlah sumbangan DIKONGSI; kategori perbelanjaan, transaksi individu, matlamat, resit dan penyata, H-Score, serta wawasan dan ramalan adalah PERIBADI.",
        ],
      },
    },
    {
      id: "who",
      en: {
        heading: "Who a share reaches",
        body: [
          "The household, as a whole — every current member of it, named for you on the sharing screen. There is no per-person matrix, deliberately: sharing with one member of a household but not another invites exactly the negotiation this app exists to remove, and it would let an owner grant themselves access to somebody else's data.",
          "Nobody outside your household, ever, through this mechanism. Sharing settings govern what your household sees. They have nothing to do with third parties, which are covered by the Privacy Notice.",
        "IMPORTANT, AND EASY TO MISREAD: these switches make your data private from the PEOPLE IN YOUR HOUSEHOLD. They do not make it private from us. HoneyMoney is not zero-knowledge — your records are readable in our database because the server computes your dashboard and H-Score over them, and a small number of people on our team hold credentials that can read any household. Marking something private hides it from your partner, not from the operator. The only thing in HoneyMoney we genuinely cannot read is a sealed backup, which is encrypted in your own browser with a passphrase we never receive.",
          "Only you can change what you share. Not an owner, not an administrator, not us. There is no field in the request that names whose sharing is being changed, so there is no request anyone else can construct.",
        ],
      },
      ms: {
        heading: "Siapa yang dicapai oleh perkongsian",
        body: [
          "Isi rumah, secara keseluruhan — setiap ahli semasanya, dinamakan untuk anda pada skrin perkongsian. Tiada matriks setiap orang, secara sengaja: berkongsi dengan seorang ahli isi rumah tetapi bukan yang lain menjemput rundingan yang aplikasi ini wujud untuk menghapuskannya, dan ia akan membenarkan pemilik memberikan dirinya akses kepada data orang lain.",
          "Tiada sesiapa di luar isi rumah anda, sama sekali, melalui mekanisme ini. Tetapan perkongsian mentadbir apa yang dilihat oleh isi rumah anda. Ia tiada kaitan dengan pihak ketiga, yang diliputi oleh Notis Privasi.",
        "PENTING, DAN MUDAH DISALAH FAHAM: suis ini menjadikan data anda peribadi daripada ORANG DALAM ISI RUMAH ANDA. Ia tidak menjadikannya peribadi daripada kami. HoneyMoney bukan sistem tanpa-pengetahuan — rekod anda boleh dibaca dalam pangkalan data kami kerana pelayan mengira papan pemuka dan H-Score anda daripadanya, dan sebilangan kecil orang dalam pasukan kami memegang kelayakan yang boleh membaca mana-mana isi rumah. Menandakan sesuatu sebagai peribadi menyembunyikannya daripada pasangan anda, bukan daripada pengendali. Satu-satunya perkara dalam HoneyMoney yang benar-benar tidak boleh kami baca ialah sandaran bermeterai, yang disulitkan dalam pelayar anda sendiri dengan frasa laluan yang tidak pernah kami terima.",
          "Hanya anda boleh mengubah apa yang anda kongsi. Bukan pemilik, bukan pentadbir, bukan kami. Tiada medan dalam permintaan yang menamakan perkongsian siapa yang sedang diubah, jadi tiada permintaan yang boleh dibina oleh orang lain.",
        ],
      },
    },
    {
      id: "revoke",
      en: {
        heading: "Revocation, and what happens to history",
        body: [
          "REVOCATION IS RETROACTIVE. Switching a share off hides your existing records as well as anything new. This is the more surprising of the two possible rules and it is the one we chose, because someone revoking is usually revoking because of what is already there — a rule that left the last two years visible would protect nobody.",
          "Nothing is deleted. Your records stay yours and stay in your own view. Hiding them from your household does not remove them from the app, and your own totals do not change.",
          "It cannot undo what was already read. If someone has seen a figure, they know it. No switch takes that back and we will not pretend otherwise.",
          "Household money stays household money. A bill recorded against the household rather than against a person is everyone's record and stays visible. These switches govern what is attributed to you.",
          "A gap is visible. Someone who could see a figure yesterday can tell that it is no longer there, even though they cannot see what it was.",
        ],
      },
      ms: {
        heading: "Penarikan balik, dan apa yang berlaku kepada sejarah",
        body: [
          "PENARIKAN BALIK BERKUAT KUASA KE BELAKANG. Mematikan perkongsian menyembunyikan rekod sedia ada anda serta apa-apa yang baharu. Ini adalah peraturan yang lebih mengejutkan antara dua kemungkinan dan inilah yang kami pilih, kerana orang yang menarik balik biasanya berbuat demikian kerana apa yang sudah ada di sana — peraturan yang membiarkan dua tahun lepas kelihatan tidak melindungi sesiapa.",
          "Tiada apa-apa dipadamkan. Rekod anda kekal milik anda dan kekal dalam paparan anda sendiri. Menyembunyikannya daripada isi rumah anda tidak membuangnya daripada aplikasi, dan jumlah anda sendiri tidak berubah.",
          "Ia tidak boleh membatalkan apa yang sudah dibaca. Jika seseorang telah melihat sesuatu angka, mereka mengetahuinya. Tiada suis yang boleh menariknya balik dan kami tidak akan berpura-pura sebaliknya.",
          "Wang isi rumah kekal wang isi rumah. Bil yang direkodkan terhadap isi rumah dan bukan terhadap seseorang ialah rekod semua orang dan kekal kelihatan. Suis ini mentadbir apa yang dikaitkan dengan anda.",
          "Jurang itu kelihatan. Seseorang yang boleh melihat sesuatu angka semalam boleh mengetahui bahawa ia tiada lagi, walaupun mereka tidak boleh melihat apa nilainya.",
        ],
      },
    },
    {
      id: "invite",
      en: {
        heading: "Joining and leaving",
        body: [
          "Nobody joins your household without being invited AND accepting. An invitation is a code with an expiry, it can be bound to one email address, it can be revoked before it is used, and the person receiving it has to act to accept. Adding someone silently is not possible.",
          "An invitation does not grant access to your private data. A new member sees what your sharing switches say they see, which by default is the must-pay items and the contribution totals.",
          "You can leave at any time, immediately, without anyone's approval. Your sharing is revoked first and your membership removed second, in that order. Records you entered stay in that household's history because they are part of its accounts; the link to you goes.",
          "Being in a relationship, contributing to a bill, or having access to somebody's device does not authorise access to their financial information.",
        ],
      },
      ms: {
        heading: "Menyertai dan keluar",
        body: [
          "Tiada sesiapa menyertai isi rumah anda tanpa dijemput DAN menerima jemputan. Jemputan ialah kod dengan tarikh luput, ia boleh diikat kepada satu alamat e-mel, ia boleh ditarik balik sebelum digunakan, dan penerimanya perlu bertindak untuk menerimanya. Menambah seseorang secara senyap adalah mustahil.",
          "Jemputan tidak memberikan akses kepada data peribadi anda. Ahli baharu melihat apa yang dinyatakan oleh suis perkongsian anda, yang secara lalai ialah item mesti-bayar dan jumlah sumbangan.",
          "Anda boleh keluar pada bila-bila masa, serta-merta, tanpa kelulusan sesiapa. Perkongsian anda ditarik balik dahulu dan keahlian anda dibuang kemudian, mengikut susunan itu. Rekod yang anda masukkan kekal dalam sejarah isi rumah itu kerana ia sebahagian daripada akaunnya; pautan kepada anda dibuang.",
          "Berada dalam sesuatu hubungan, menyumbang kepada sesuatu bil, atau mempunyai akses kepada peranti seseorang tidak memberi kuasa untuk mencapai maklumat kewangan mereka.",
        ],
      },
    },
    {
      id: "log",
      en: {
        heading: "Seeing who looked",
        body: [
          "Every time another member opens data you have shared, it is recorded, along with every change you make to your own sharing and everybody joining or leaving. You can read that log; nobody can delete a line from it, including us.",
          "Your log is yours. Other members cannot see it, which means nobody can watch you checking your own privacy settings.",
          "It records access through the app, which is the only thing the app can honestly claim to know about. It cannot record somebody reading over your shoulder, a screenshot taken before you revoked, or anything you said out loud.",
        ],
      },
      ms: {
        heading: "Melihat siapa yang telah melihat",
        body: [
          "Setiap kali ahli lain membuka data yang anda kongsi, ia direkodkan, bersama setiap perubahan yang anda buat pada perkongsian anda sendiri dan setiap orang yang menyertai atau keluar. Anda boleh membaca log itu; tiada sesiapa boleh memadam satu barisnya, termasuk kami.",
          "Log anda milik anda. Ahli lain tidak boleh melihatnya, bermakna tiada sesiapa boleh memerhati anda menyemak tetapan privasi anda sendiri.",
          "Ia merekodkan akses melalui aplikasi, iaitu satu-satunya perkara yang aplikasi ini boleh dakwa mengetahuinya dengan jujur. Ia tidak boleh merekodkan seseorang yang membaca dari belakang bahu anda, tangkapan skrin yang diambil sebelum anda menarik balik, atau apa-apa yang anda sebut sendiri.",
        ],
      },
    },
  ],
};

// ── Sponsor and partner notice ─────────────────────────────────────────────
const sponsors: LegalDoc = {
  slug: "sponsors",
  version: "2026-08-27",
  en: {
    title: "Sponsors, partners and referrals",
    summary:
      "Who pays for HoneyMoney, what a sponsor can and cannot ever receive, and what happens when you follow a link to somebody else.",
  },
  ms: {
    title: "Penaja, rakan kongsi dan rujukan",
    summary:
      "Siapa yang membayar untuk HoneyMoney, apa yang penaja boleh dan tidak boleh terima, dan apa yang berlaku apabila anda mengikuti pautan ke tempat lain.",
  },
  inContext: {
    en: "Your sponsor never receives your records, documents, H-Score, insights or identifiable usage. Only anonymous group figures, and only for groups of ten or more.",
    ms: "Penaja anda tidak pernah menerima rekod, dokumen, H-Score, wawasan atau penggunaan anda yang boleh dikenal pasti. Hanya angka kumpulan tanpa nama, dan hanya bagi kumpulan sepuluh orang atau lebih.",
  },
  sections: [
    {
      id: "today",
      en: {
        heading: "Today: nobody sponsors anything",
        body: [
          "No employer, sponsor or organisation funds any account, and no such reporting is built. HoneyMoney is free to households and is currently paid for by the people who make it.",
          "The guarantees below are written down before the feature exists, while they are still cheap to honour. That is deliberate: a data wall added after a customer has seen a dashboard is a negotiation, and a data wall written first is a constraint.",
        ],
      },
      ms: {
        heading: "Hari ini: tiada sesiapa menaja apa-apa",
        body: [
          "Tiada majikan, penaja atau organisasi membiayai mana-mana akaun, dan tiada pelaporan sedemikian dibina. HoneyMoney percuma kepada isi rumah dan pada masa ini dibiayai oleh orang yang membinanya.",
          "Jaminan di bawah ditulis sebelum ciri itu wujud, ketika ia masih murah untuk dikotakan. Itu disengajakan: tembok data yang ditambah selepas pelanggan melihat papan pemuka ialah rundingan, manakala tembok data yang ditulis dahulu ialah kekangan.",
        ],
      },
    },
    {
      id: "never",
      en: {
        heading: "What a sponsor can never receive",
        body: [
          "Your financial records. Any transaction, balance, category or total attributable to you.",
          "Your uploaded documents. No receipt, no statement, no photograph.",
          "Your H-Score, its band, or any sub-score.",
          "Any insight, forecast or warning written about your money.",
          "Identifiable usage data. Not whether you logged in, not how often, not when you stopped.",
          "Your name, email address or account identifier in connection with any figure.",
        ],
      },
      ms: {
        heading: "Apa yang penaja tidak boleh terima sama sekali",
        body: [
          "Rekod kewangan anda. Sebarang transaksi, baki, kategori atau jumlah yang boleh dikaitkan dengan anda.",
          "Dokumen yang anda muat naik. Tiada resit, tiada penyata, tiada gambar.",
          "H-Score anda, jalurnya, atau mana-mana sub-skor.",
          "Sebarang wawasan, ramalan atau amaran yang ditulis tentang wang anda.",
          "Data penggunaan yang boleh dikenal pasti. Bukan sama ada anda log masuk, bukan berapa kerap, bukan bila anda berhenti.",
          "Nama, alamat e-mel atau pengenal akaun anda berkaitan dengan sebarang angka.",
        ],
      },
    },
    {
      id: "aggregate",
      en: {
        heading: "What a sponsor could receive, if this is ever built",
        body: [
          "Group-level figures only, and only where the group is at least ten people. A figure describing fewer than ten is withheld entirely — not rounded, not blurred, not labelled “small sample”. Those all leak: a rounded figure over a known headcount is often invertible, and saying the sample is small tells the reader the group is small, which is itself the fact that identifies people in a team of six.",
          "Where most cells of a breakdown would be withheld, the breakdown is not shown at all. A chart full of holes is worse than a total, because the surviving cells stand out and the gaps are informative in themselves.",
          "Taking part would be your choice, off until you switched it on, and we would ask you again under an updated Privacy Notice.",
          "Participation would never be a condition of employment, and no employment decision may be taken on your use or non-use of HoneyMoney. That will be a term of every sponsor agreement, not a hope.",
          "Your account is yours, not your employer's. If a sponsorship starts or ends, nothing happens to your records and nothing happens to your account.",
        ],
      },
      ms: {
        heading: "Apa yang penaja boleh terima, jika ini dibina kelak",
        body: [
          "Angka peringkat kumpulan sahaja, dan hanya jika kumpulan itu sekurang-kurangnya sepuluh orang. Angka yang menggambarkan kurang daripada sepuluh ditahan sepenuhnya — tidak dibundarkan, tidak dikaburkan, tidak dilabel “sampel kecil”. Semua itu membocorkan: angka yang dibundarkan ke atas bilangan pekerja yang diketahui selalunya boleh diterbalikkan, dan menyatakan sampel itu kecil memberitahu pembaca bahawa kumpulan itu kecil, iaitu fakta yang mengenal pasti orang dalam pasukan seramai enam.",
          "Jika kebanyakan sel dalam sesuatu pecahan akan ditahan, pecahan itu tidak dipaparkan langsung. Carta yang penuh lubang lebih teruk daripada jumlah keseluruhan, kerana sel yang tinggal menjadi menonjol dan jurangnya sendiri bermaklumat.",
          "Penyertaan adalah pilihan anda, dimatikan sehingga anda menghidupkannya, dan kami akan bertanya kepada anda semula di bawah Notis Privasi yang dikemas kini.",
          "Penyertaan tidak sekali-kali menjadi syarat pekerjaan, dan tiada keputusan pekerjaan boleh dibuat berdasarkan penggunaan atau bukan penggunaan HoneyMoney oleh anda. Itu akan menjadi terma dalam setiap perjanjian penaja, bukan sekadar harapan.",
          "Akaun anda milik anda, bukan milik majikan anda. Jika tajaan bermula atau tamat, tiada apa-apa berlaku kepada rekod anda dan tiada apa-apa berlaku kepada akaun anda.",
        ],
      },
    },
    {
      id: "directory",
      en: {
        heading: "The provider directory, and referrals",
        body: [
          "The directory lists licensed Malaysian financial providers by category. Every listing names its regulator and licence reference so you can check it yourself against the Bank Negara FSP directory or the Securities Commission register.",
          "Listings carry no score, rank, rating or “best for” field — there is nowhere in the data model to put one. The directory is never filtered by your H-Score, because a score-gated directory is a recommendation with extra steps and would make us an unlicensed adviser.",
          "Every listing today is unpaid. How a listing is paid for is shown on the listing itself, and any that ever carries a listing or referral fee will say so on its face. Fees will never be tied to a score tier, because tying income to the score would corrupt the score.",
          "Following a link takes you to somebody else. Their terms and their privacy notice apply, not ours. We do not send them your records, your H-Score or anything about you — a link is a link.",
        ],
      },
      ms: {
        heading: "Direktori penyedia, dan rujukan",
        body: [
          "Direktori menyenaraikan penyedia kewangan berlesen Malaysia mengikut kategori. Setiap penyenaraian menamakan pengawal selia dan rujukan lesennya supaya anda boleh menyemaknya sendiri dengan direktori FSP Bank Negara atau daftar Suruhanjaya Sekuriti.",
          "Penyenaraian tidak membawa sebarang skor, kedudukan, penarafan atau medan “terbaik untuk” — tiada tempat dalam model data untuk meletakkannya. Direktori tidak pernah ditapis mengikut H-Score anda, kerana direktori yang bergantung pada skor ialah syor dengan langkah tambahan dan akan menjadikan kami penasihat tanpa lesen.",
          "Setiap penyenaraian hari ini tidak dibayar. Cara sesuatu penyenaraian dibiayai dipaparkan pada penyenaraian itu sendiri, dan mana-mana yang membawa yuran penyenaraian atau rujukan kelak akan menyatakannya secara terbuka. Yuran tidak akan sekali-kali diikat kepada peringkat skor, kerana mengikat pendapatan kepada skor akan merosakkan skor itu.",
          "Mengikuti sesuatu pautan membawa anda kepada orang lain. Terma dan notis privasi mereka yang terpakai, bukan kami. Kami tidak menghantar rekod anda, H-Score anda atau apa-apa tentang anda kepada mereka — pautan tetap pautan.",
        ],
      },
    },
  ],
};

// ── Storage notice ─────────────────────────────────────────────────────────
const storage: LegalDoc = {
  slug: "storage",
  version: "2026-08-27",
  en: {
    title: "Cookies and what is stored on your device",
    summary:
      "HoneyMoney sets no advertising or tracking cookies. This lists everything it does put on your device and how to clear each of it.",
  },
  ms: {
    title: "Kuki dan apa yang disimpan pada peranti anda",
    summary:
      "HoneyMoney tidak menetapkan sebarang kuki pengiklanan atau penjejakan. Ini menyenaraikan segala yang diletakkannya pada peranti anda dan cara membersihkan setiap satu.",
  },
  sections: [
    {
      id: "none",
      en: {
        heading: "What we do not do",
        body: [
          "No advertising cookies. No tracking pixels. No third-party analytics SDK — no Google Analytics, no Meta pixel, no session-replay tool. Nothing on any page of this app reports to anybody else about you.",
          "This is why there is no cookie consent banner: everything below is either strictly necessary for the service you asked for, or is storage you control directly on your own device.",
        ],
      },
      ms: {
        heading: "Apa yang kami tidak lakukan",
        body: [
          "Tiada kuki pengiklanan. Tiada piksel penjejakan. Tiada SDK analitik pihak ketiga — tiada Google Analytics, tiada piksel Meta, tiada alat main semula sesi. Tiada apa-apa pada mana-mana halaman aplikasi ini melaporkan tentang anda kepada orang lain.",
          "Inilah sebabnya tiada sepanduk persetujuan kuki: semua yang di bawah sama ada benar-benar perlu untuk perkhidmatan yang anda minta, atau merupakan storan yang anda kawal terus pada peranti anda sendiri.",
        ],
      },
    },
    {
      id: "what",
      en: {
        heading: "What is stored, and why",
        body: [
          "A session cookie, so you stay signed in. Strictly necessary — without it you would sign in on every page. Clearing it signs you out.",
          "A language and currency preference, so the app opens in the language you chose.",
          "A service-worker cache holding the app's static files, the offline page, and — after your first receipt scan — the on-device OCR engine and language models, about 28 MB. This is what makes the app work with no connection. Clearing site data removes it; the next scan downloads it again.",
          "An IndexedDB queue holding spends you recorded while offline, until they are sent. Deleting this loses records that have not yet reached the server, so the app tells you how many are waiting rather than clearing them silently.",
          "If you set up Your copy, a second IndexedDB store holds a full snapshot of your records for offline reading and analysis, together with a pointer to the file location you chose. Clearing site data removes both. The file itself is yours, wherever you put it, and clearing site data does not touch it.",
          "Small interface preferences — a collapsed panel, a chosen tab. Never anything about your money.",
          "Basic visit counts are recorded on our own server, not on your device: the page, the country, and how long it stayed open. No IP address, no browser fingerprint, and not linked to your account.",
        ],
      },
      ms: {
        heading: "Apa yang disimpan, dan sebabnya",
        body: [
          "Kuki sesi, supaya anda kekal log masuk. Benar-benar perlu — tanpanya anda perlu log masuk pada setiap halaman. Membersihkannya akan melog keluar anda.",
          "Pilihan bahasa dan mata wang, supaya aplikasi dibuka dalam bahasa yang anda pilih.",
          "Cache pekerja perkhidmatan yang menyimpan fail statik aplikasi, halaman luar talian, dan — selepas imbasan resit pertama anda — enjin OCR pada peranti berserta model bahasa, kira-kira 28 MB. Inilah yang membolehkan aplikasi berfungsi tanpa sambungan. Membersihkan data tapak akan membuangnya; imbasan seterusnya akan memuat turunnya semula.",
          "Baris gilir IndexedDB yang menyimpan perbelanjaan yang anda rekod semasa di luar talian, sehingga ia dihantar. Memadamkannya akan kehilangan rekod yang belum sampai ke pelayan, jadi aplikasi memberitahu anda berapa banyak yang menunggu dan bukannya membersihkannya secara senyap.",
          "Jika anda menyediakan Salinan anda, satu lagi storan IndexedDB menyimpan snapshot penuh rekod anda untuk bacaan dan analisis luar talian, berserta penunjuk kepada lokasi fail yang anda pilih. Membersihkan data tapak akan membuang kedua-duanya. Fail itu sendiri milik anda, di mana sahaja anda meletakkannya, dan membersihkan data tapak tidak menyentuhnya.",
          "Pilihan antara muka kecil — panel yang dikuncupkan, tab yang dipilih. Tidak pernah apa-apa tentang wang anda.",
          "Kiraan lawatan asas direkodkan pada pelayan kami sendiri, bukan pada peranti anda: halaman, negara, dan berapa lama ia dibuka. Tiada alamat IP, tiada cap jari pelayar, dan tidak dikaitkan dengan akaun anda.",
        ],
      },
    },
    {
      id: "clear",
      en: {
        heading: "Clearing it",
        body: [
          "Sign out. As of 27 August 2026 this does more than drop the session cookie: it deletes the local copy of your records, clears every page this app cached, and empties the browser storage it set. Anything you recorded offline and have not sent is sent first where possible, and you are warned and asked before anything unsent would be lost. The file you chose to keep your records in is NOT touched — that is yours, it may be on a drive or a memory card, and signing out of a website is no reason for us to reach through and erase it.",
          "Signing IN also clears whatever a previous session left on the device, so one person cannot inherit another’s cached pages on a shared phone or tablet.",
          "Clear site data for honeymoney.app in your browser settings to remove everything above at once — including the offline cache and any queued records.",
          "Uninstall the app if you installed it to your home screen. This removes its storage with it.",
          "The quick-exit button on the Leaving and safety page clears this app's local storage and caches on its way out. It cannot clear your browser history, and no web page can.",
        ],
      },
      ms: {
        heading: "Membersihkannya",
        body: [
          "Log keluar. Mulai 27 Ogos 2026 ini melakukan lebih daripada menggugurkan kuki sesi: ia memadamkan salinan tempatan rekod anda, membersihkan setiap halaman yang di-cache oleh aplikasi ini, dan mengosongkan storan pelayar yang ditetapkannya. Apa-apa yang anda rekod di luar talian dan belum dihantar akan dihantar dahulu jika boleh, dan anda diberi amaran dan ditanya sebelum apa-apa yang belum dihantar hilang. Fail yang anda pilih untuk menyimpan rekod anda TIDAK disentuh — ia milik anda, mungkin berada pada pemacu atau kad memori, dan log keluar daripada laman web bukan alasan untuk kami memadamkannya.",
          "Log MASUK juga membersihkan apa-apa yang ditinggalkan oleh sesi sebelumnya pada peranti itu, supaya seorang tidak mewarisi halaman cache orang lain pada telefon atau tablet yang dikongsi.",
          "Bersihkan data tapak bagi honeymoney.app dalam tetapan pelayar anda untuk membuang semua di atas sekali gus — termasuk cache luar talian dan sebarang rekod yang menunggu.",
          "Nyahpasang aplikasi jika anda memasangnya ke skrin utama. Ini membuang storannya sekali.",
          "Butang keluar pantas pada halaman Keluar dan keselamatan membersihkan storan tempatan dan cache aplikasi ini semasa keluar. Ia tidak boleh membersihkan sejarah pelayar anda, dan tiada halaman web yang boleh.",
        ],
      },
    },
  ],
};

// ── Retention schedule ─────────────────────────────────────────────────────
const retention: LegalDoc = {
  slug: "retention",
  version: "2026-08-27",
  en: {
    title: "How long we keep things",
    summary:
      "A schedule, per kind of data, with the actual periods — because the PDPA requires personal data no longer needed to be permanently deleted, and a policy nobody can check is not one.",
  },
  ms: {
    title: "Berapa lama kami menyimpan sesuatu",
    summary:
      "Jadual, mengikut jenis data, dengan tempoh sebenar — kerana PDPA menghendaki data peribadi yang tidak lagi diperlukan dipadamkan secara kekal, dan dasar yang tidak boleh disemak oleh sesiapa bukanlah dasar.",
  },
  sections: [
    {
      id: "schedule",
      en: {
        heading: "The schedule",
        body: [
          "Your money records — kept while your account is open, because their whole value is the history. Deleted when you close the account.",
          "Receipt and statement images — kept attached to their record while the account is open. Delete an individual image at any time from the record; the record survives without it.",
          "Off-site backups — the last 14 daily backups with Cloudflare R2, encrypted. Older ones are deleted automatically on that rolling cycle.",
          "A closed account — marked deleted immediately, purged permanently within 30 days. Backups taken before that date age out on their own 14-day cycle, so the last trace is gone within about 45 days.",
          "Consent and sharing decisions — kept longer than the data they govern, because they are the evidence that processing was lawful. Held for as long as needed to demonstrate that or to answer a dispute.",
          "The share access log — kept while the account is open, so you can look back at who read what. It cannot be edited or deleted by anyone, including us.",
          "The audit ledger — append-only and permanent for the life of the household, because it is what makes tampering with money records detectable.",
          "Visit counts — the page, country and duration, with no IP and no account link. Kept as aggregate operational statistics.",
          "AI call records — the model, the token count and the cost. Kept so cost is auditable. The content of a request is not stored by us.",
          "Support correspondence — kept for a limited period after the case closes, then deleted.",
          "A sealed vault backup — kept until you delete it. We cannot read it and cannot recover it if you lose the passphrase.",
        ],
      },
      ms: {
        heading: "Jadual",
        body: [
          "Rekod kewangan anda — disimpan selagi akaun anda dibuka, kerana nilainya terletak pada sejarahnya. Dipadamkan apabila anda menutup akaun.",
          "Imej resit dan penyata — disimpan bersama rekodnya selagi akaun dibuka. Padamkan imej individu pada bila-bila masa daripada rekod itu; rekod itu kekal tanpanya.",
          "Sandaran luar tapak — 14 sandaran harian terakhir dengan Cloudflare R2, disulitkan. Yang lebih lama dipadamkan secara automatik mengikut kitaran bergolek itu.",
          "Akaun yang ditutup — ditandakan dipadam serta-merta, dimusnahkan secara kekal dalam tempoh 30 hari. Sandaran yang diambil sebelum tarikh itu luput mengikut kitaran 14 harinya sendiri, jadi kesan terakhir hilang dalam kira-kira 45 hari.",
          "Keputusan persetujuan dan perkongsian — disimpan lebih lama daripada data yang ditadbirnya, kerana ia bukti bahawa pemprosesan adalah sah. Disimpan selama yang diperlukan untuk membuktikannya atau untuk menjawab sesuatu pertikaian.",
          "Log akses perkongsian — disimpan selagi akaun dibuka, supaya anda boleh menyemak semula siapa membaca apa. Ia tidak boleh disunting atau dipadam oleh sesiapa, termasuk kami.",
          "Lejar audit — hanya boleh ditambah dan kekal sepanjang hayat isi rumah, kerana itulah yang menjadikan pengubahsuaian rekod kewangan dapat dikesan.",
          "Kiraan lawatan — halaman, negara dan tempoh, tanpa IP dan tanpa pautan akaun. Disimpan sebagai statistik operasi agregat.",
          "Rekod panggilan AI — model, kiraan token dan kos. Disimpan supaya kos boleh diaudit. Kandungan sesuatu permintaan tidak disimpan oleh kami.",
          "Surat-menyurat sokongan — disimpan untuk tempoh terhad selepas kes ditutup, kemudian dipadamkan.",
          "Sandaran peti bermeterai — disimpan sehingga anda memadamkannya. Kami tidak boleh membacanya dan tidak boleh memulihkannya jika anda kehilangan frasa laluan.",
        ],
      },
    },
    {
      id: "delete",
      en: {
        heading: "Deleting sooner",
        body: [
          "You do not have to wait for a schedule. Delete an individual record, an individual receipt image, or the whole account, at any time, from within the app.",
          "Closing your account starts a short grace period during which you can undo it, then the data is purged permanently. That grace period exists because account deletion done in anger at 2 a.m. is the one destructive action people most often regret.",
          "Take your export first — one click, machine-readable JSON, everything you can see.",
        ],
      },
      ms: {
        heading: "Memadam lebih awal",
        body: [
          "Anda tidak perlu menunggu jadual. Padamkan rekod individu, imej resit individu, atau keseluruhan akaun, pada bila-bila masa, dari dalam aplikasi.",
          "Menutup akaun anda memulakan tempoh tangguh yang singkat di mana anda boleh membatalkannya, kemudian data dimusnahkan secara kekal. Tempoh tangguh itu wujud kerana pemadaman akaun yang dilakukan dalam kemarahan pada pukul 2 pagi ialah tindakan memusnahkan yang paling kerap disesali orang.",
          "Ambil eksport anda dahulu — satu klik, JSON yang boleh dibaca mesin, semua yang anda boleh lihat.",
        ],
      },
    },
  ],
};

// ── Acceptable use ─────────────────────────────────────────────────────────
const acceptableUse: LegalDoc = {
  slug: "acceptable-use",
  version: "2026-08-27",
  en: {
    title: "Acceptable use",
    summary:
      "The short list of things that will get an account suspended — most of which exist to protect the other people whose data ends up in a household.",
  },
  ms: {
    title: "Penggunaan yang boleh diterima",
    summary:
      "Senarai pendek perkara yang akan menyebabkan akaun digantung — kebanyakannya wujud untuk melindungi orang lain yang datanya berakhir dalam sesebuah isi rumah.",
  },
  sections: [
    {
      id: "people",
      en: {
        heading: "Other people",
        body: [
          "Do not use HoneyMoney to monitor, profile or control another person without their knowledge and permission. This is the rule the whole sharing design exists to enforce, and breaking it is the fastest way to lose an account.",
          "Do not upload another person's financial records, receipts or statements unless you are entitled to. A receipt is a photograph of where somebody was.",
          "Do not add a child to a household unless you are their parent or guardian.",
          "Do not share an account. Each adult gets their own, because each adult's sharing choices have to be their own.",
          "Do not impersonate anyone, or create an account in somebody else's name.",
        ],
      },
      ms: {
        heading: "Orang lain",
        body: [
          "Jangan gunakan HoneyMoney untuk memantau, memprofil atau mengawal orang lain tanpa pengetahuan dan kebenaran mereka. Inilah peraturan yang seluruh reka bentuk perkongsian wujud untuk menguatkuasakannya, dan melanggarnya ialah cara terpantas untuk kehilangan akaun.",
          "Jangan muat naik rekod kewangan, resit atau penyata orang lain melainkan anda berhak berbuat demikian. Resit ialah gambar tempat seseorang pernah berada.",
          "Jangan tambah kanak-kanak ke dalam isi rumah melainkan anda ibu bapa atau penjaganya.",
          "Jangan berkongsi akaun. Setiap orang dewasa mendapat akaun sendiri, kerana pilihan perkongsian setiap orang dewasa mestilah miliknya sendiri.",
          "Jangan menyamar sebagai sesiapa, atau membuka akaun atas nama orang lain.",
        ],
      },
    },
    {
      id: "service",
      en: {
        heading: "The service",
        body: [
          "Do not try to reach data belonging to another household, or test whether you can.",
          "Do not upload malware, or content that is unlawful under Malaysian law.",
          "Do not fabricate receipts or statements, or use HoneyMoney to produce a document intended to mislead somebody.",
          "Do not scrape, resell or reverse-engineer the service, or use it to build a competing product.",
          "Do not damage the service for other people — flooding it, probing it, or automating against it at a volume a household would not produce.",
        ],
      },
      ms: {
        heading: "Perkhidmatan",
        body: [
          "Jangan cuba mencapai data milik isi rumah lain, atau menguji sama ada anda boleh.",
          "Jangan muat naik perisian hasad, atau kandungan yang menyalahi undang-undang Malaysia.",
          "Jangan memalsukan resit atau penyata, atau menggunakan HoneyMoney untuk menghasilkan dokumen yang bertujuan mengelirukan seseorang.",
          "Jangan mengikis, menjual semula atau merekayasa balik perkhidmatan ini, atau menggunakannya untuk membina produk pesaing.",
          "Jangan merosakkan perkhidmatan bagi orang lain — membanjirinya, menyiasatnya, atau mengautomasikannya pada jumlah yang tidak akan dihasilkan oleh sesebuah isi rumah.",
        ],
      },
    },
    {
      id: "consequences",
      en: {
        heading: "What happens if you do",
        body: [
          "We may suspend or close an account that breaks these rules, that puts other people's data at risk, or that we are required to close by law.",
          "Where we reasonably can, we will tell you first, say what the problem is, and give you a chance to export your data before anything is closed.",
          "Where there is an immediate risk to another person or to the service, we may act first and explain afterwards. That exception is narrow and is not a general licence to act without notice.",
          "If you think a suspension is wrong, write to privacy@honeymoney.app. A person reads it.",
        ],
      },
      ms: {
        heading: "Apa yang berlaku jika anda melanggarnya",
        body: [
          "Kami boleh menggantung atau menutup akaun yang melanggar peraturan ini, yang membahayakan data orang lain, atau yang dikehendaki ditutup oleh undang-undang.",
          "Jika munasabah, kami akan memberitahu anda dahulu, menyatakan apa masalahnya, dan memberi anda peluang mengeksport data anda sebelum apa-apa ditutup.",
          "Jika terdapat risiko serta-merta kepada orang lain atau kepada perkhidmatan, kami mungkin bertindak dahulu dan menjelaskannya kemudian. Pengecualian itu sempit dan bukan lesen umum untuk bertindak tanpa notis.",
          "Jika anda rasa sesuatu penggantungan itu salah, tulis kepada privacy@honeymoney.app. Seorang manusia akan membacanya.",
        ],
      },
    },
  ],
};

// ── Copyright and open source ──────────────────────────────────────────────
const licences: LegalDoc = {
  slug: "licences",
  version: "2026-08-27",
  en: {
    title: "Copyright, your content, and open source",
    summary:
      "Who owns what: the app, the records you enter, and the open-source components HoneyMoney is built on.",
  },
  ms: {
    title: "Hak cipta, kandungan anda, dan sumber terbuka",
    summary:
      "Siapa memiliki apa: aplikasi, rekod yang anda masukkan, dan komponen sumber terbuka yang menjadi asas HoneyMoney.",
  },
  sections: [
    {
      id: "ours",
      en: {
        heading: "Ours",
        body: [
          "The HoneyMoney application, its source code, design, interface, written content, the three-bucket method as presented here, and the H-Score methodology are owned by Team JUST50 and protected by Malaysian copyright law.",
          "The HoneyMoney name and logo are ours. Do not use them to name your own product, to imply we endorse something, or in a way that suggests an association that does not exist. Referring to HoneyMoney by name — in a review, an article, or a comparison — is fine and needs no permission.",
        ],
      },
      ms: {
        heading: "Milik kami",
        body: [
          "Aplikasi HoneyMoney, kod sumbernya, reka bentuk, antara muka, kandungan bertulis, kaedah tiga baldi seperti yang dipersembahkan di sini, dan metodologi H-Score dimiliki oleh Team JUST50 dan dilindungi oleh undang-undang hak cipta Malaysia.",
          "Nama dan logo HoneyMoney adalah milik kami. Jangan gunakannya untuk menamakan produk anda sendiri, untuk membayangkan kami menyokong sesuatu, atau dengan cara yang mencadangkan hubungan yang tidak wujud. Merujuk kepada HoneyMoney dengan nama — dalam ulasan, artikel atau perbandingan — adalah dibenarkan dan tidak memerlukan kebenaran.",
        ],
      },
    },
    {
      id: "yours",
      en: {
        heading: "Yours",
        body: [
          "You own everything you put in: your records, your notes, your receipts, your goals. We claim no ownership of any of it.",
          "You give us permission to store it, process it and display it back to you, and to share it with your household to the extent your own sharing switches say so. That permission exists only to run the service for you, and it ends when you delete the data or close the account.",
          "We do not use your records to train an AI model. Not ours, not anyone else's.",
        ],
      },
      ms: {
        heading: "Milik anda",
        body: [
          "Anda memiliki segala yang anda masukkan: rekod anda, nota anda, resit anda, matlamat anda. Kami tidak menuntut pemilikan ke atas mana-mana daripadanya.",
          "Anda memberi kami kebenaran untuk menyimpannya, memprosesnya dan memaparkannya kembali kepada anda, serta berkongsinya dengan isi rumah anda setakat yang dinyatakan oleh suis perkongsian anda sendiri. Kebenaran itu wujud semata-mata untuk menjalankan perkhidmatan bagi anda, dan ia tamat apabila anda memadamkan data atau menutup akaun.",
          "Kami tidak menggunakan rekod anda untuk melatih model AI. Bukan model kami, bukan model sesiapa.",
        ],
      },
    },
    {
      id: "oss",
      en: {
        heading: "Open source we depend on",
        body: [
          "HoneyMoney is built on open-source software, and the licences of those components are respected in full. The principal ones, with their licences: Next.js and React (MIT), PocketBase (MIT), Tailwind CSS (MIT), tesseract.js and the Tesseract OCR engine (Apache 2.0), pdf.js (Apache 2.0), and the Tesseract language models published by Google (Apache 2.0).",
          "The complete dependency list, with the licence of each package and its version, is in package.json and package-lock.json in the application, which is the authoritative record. Ask at privacy@honeymoney.app for a copy of any licence text.",
          "Where an open-source licence requires attribution, this page is that attribution. Where one requires source availability, we will provide it on request for the components it applies to.",
        ],
      },
      ms: {
        heading: "Sumber terbuka yang kami bergantung padanya",
        body: [
          "HoneyMoney dibina di atas perisian sumber terbuka, dan lesen komponen tersebut dihormati sepenuhnya. Yang utama, berserta lesennya: Next.js dan React (MIT), PocketBase (MIT), Tailwind CSS (MIT), tesseract.js dan enjin OCR Tesseract (Apache 2.0), pdf.js (Apache 2.0), serta model bahasa Tesseract yang diterbitkan oleh Google (Apache 2.0).",
          "Senarai kebergantungan yang lengkap, berserta lesen setiap pakej dan versinya, terdapat dalam package.json dan package-lock.json dalam aplikasi, iaitu rekod yang berwibawa. Minta di privacy@honeymoney.app untuk salinan mana-mana teks lesen.",
          "Jika sesuatu lesen sumber terbuka memerlukan pengiktirafan, halaman ini ialah pengiktirafan itu. Jika sesuatu lesen memerlukan ketersediaan kod sumber, kami akan menyediakannya atas permintaan bagi komponen yang berkenaan.",
        ],
      },
    },
  ],
};

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  disclaimer,
  hscore,
  ai,
  sharing,
  sponsors,
  storage,
  retention,
  "acceptable-use": acceptableUse,
  licences,
};

export function legalDoc(slug: string): LegalDoc | null {
  return LEGAL_DOCS[slug] ?? null;
}

/** The two-sentence form for a just-in-time banner. */
export function inContextNotice(slug: string, lang: "en" | "ms" = "en"): string | null {
  return LEGAL_DOCS[slug]?.inContext?.[lang] ?? null;
}
