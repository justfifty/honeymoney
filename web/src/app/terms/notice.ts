// The terms of service, in one place, in both languages.
//
// The PDPA's bilingual requirement is about the privacy NOTICE, not about
// terms — so this could lawfully have been English-only. It is not, for a
// reason that has nothing to do with the Act: the product is for Malaysian
// families, the privacy notice already sets the bar at both languages, and a
// service that explains how it uses your data in Malay but what you are
// agreeing to only in English has chosen the wrong half to translate.
//
// ⚠️ The Bahasa Malaysia below is a careful working translation, NOT one
// certified by a Malaysian legal practitioner — the same caveat as
// app/privacy/notice.ts, and the same instruction: counsel reviews both before
// launch, and where they differ it is the Malay a Malaysian user relies on.
//
// The substance is drawn from docs/DISCLAIMER.md, which was already written and
// already correct — it was simply sitting in a guide page rather than in an
// agreement anyone had accepted.

export interface TermsSection {
  id: string;
  en: { heading: string; body: string[] };
  ms: { heading: string; body: string[] };
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: "who",
    en: {
      heading: "Who you are agreeing with",
      body: [
        "HoneyMoney is operated by JUST50 (“we”, “us”). Contact: privacy@honeymoney.app.",
        "These terms govern the service. How we handle your personal data is governed separately by our Privacy Notice, which you should read alongside this.",
      ],
    },
    ms: {
      heading: "Dengan siapa anda bersetuju",
      body: [
        "HoneyMoney dikendalikan oleh JUST50 (“kami”). Hubungi: privacy@honeymoney.app.",
        "Terma ini mentadbir perkhidmatan. Cara kami mengendalikan data peribadi anda ditadbir secara berasingan oleh Notis Privasi kami, yang perlu anda baca bersama-sama ini.",
      ],
    },
  },
  {
    id: "what",
    en: {
      heading: "What HoneyMoney is, and what it is not",
      body: [
        "HoneyMoney helps you record spending, organise it into three buckets, and see what your own numbers imply. That is all it does.",
        "It is NOT financial advice. We are not a licensed financial adviser, and nothing in the app is personal financial, tax or investment advice. For advice, speak to a licensed financial planner, or to AKPK (Agensi Kaunseling dan Pengurusan Kredit), which is free.",
        "It is NOT a bank or a fund manager. We never hold, move or invest your money.",
        "Where the app shows financial products, it is a catalogue you chose to open. We do not rank them, we do not recommend one over another, and a listing is not an endorsement. Each product belongs to its licensed provider and is subject to that provider’s terms.",
      ],
    },
    ms: {
      heading: "Apa itu HoneyMoney, dan apa yang bukan",
      body: [
        "HoneyMoney membantu anda merekod perbelanjaan, menyusunnya ke dalam tiga baldi, dan melihat apa yang ditunjukkan oleh angka anda sendiri. Itu sahaja fungsinya.",
        "Ia BUKAN nasihat kewangan. Kami bukan penasihat kewangan berlesen, dan tiada apa-apa dalam aplikasi ini merupakan nasihat kewangan, cukai atau pelaburan peribadi. Untuk nasihat, rujuk perancang kewangan berlesen, atau AKPK (Agensi Kaunseling dan Pengurusan Kredit), yang percuma.",
        "Ia BUKAN bank atau pengurus dana. Kami tidak pernah memegang, memindahkan atau melaburkan wang anda.",
        "Apabila aplikasi memaparkan produk kewangan, ia adalah katalog yang anda pilih untuk buka. Kami tidak menyusun kedudukannya, tidak mengesyorkan satu berbanding yang lain, dan penyenaraian bukan sokongan. Setiap produk milik penyedia berlesennya dan tertakluk kepada terma penyedia tersebut.",
      ],
    },
  },
  {
    id: "account",
    en: {
      heading: "Your account",
      body: [
        "You must be at least 18 to hold an account. A household can include children as members, but the account belongs to an adult.",
        "Keep your password to yourself. Anything done through your account is treated as done by you.",
        "Give us accurate information. The figures the app produces are only as good as what you enter.",
        "If you invite someone into your household, you are choosing to share the household’s shared records with them. Spending you mark private stays private.",
      ],
    },
    ms: {
      heading: "Akaun anda",
      body: [
        "Anda mesti berumur sekurang-kurangnya 18 tahun untuk memiliki akaun. Sebuah isi rumah boleh memasukkan anak-anak sebagai ahli, tetapi akaun itu milik seorang dewasa.",
        "Rahsiakan kata laluan anda. Apa-apa yang dilakukan melalui akaun anda dianggap dilakukan oleh anda.",
        "Berikan maklumat yang tepat. Angka yang dihasilkan aplikasi hanya sebaik apa yang anda masukkan.",
        "Jika anda menjemput seseorang ke dalam isi rumah anda, anda memilih untuk berkongsi rekod bersama isi rumah itu dengan mereka. Perbelanjaan yang anda tandakan peribadi kekal peribadi.",
      ],
    },
  },
  {
    id: "use",
    en: {
      heading: "How you may use it",
      body: [
        "Use HoneyMoney for your own household’s money, and for lawful purposes.",
        "Do not upload another person’s financial records unless you have the right to. Do not try to reach data belonging to another household. Do not scrape, resell or reverse-engineer the service, or use it to build a competing product.",
        "Do not use it to break the law, or in a way that damages the service for other people.",
      ],
    },
    ms: {
      heading: "Cara anda boleh menggunakannya",
      body: [
        "Gunakan HoneyMoney untuk wang isi rumah anda sendiri, dan untuk tujuan yang sah.",
        "Jangan muat naik rekod kewangan orang lain melainkan anda mempunyai hak untuk berbuat demikian. Jangan cuba mencapai data milik isi rumah lain. Jangan mengikis, menjual semula atau merekayasa balik perkhidmatan ini, atau menggunakannya untuk membina produk pesaing.",
        "Jangan gunakannya untuk melanggar undang-undang, atau dengan cara yang merosakkan perkhidmatan bagi orang lain.",
      ],
    },
  },
  {
    id: "yours",
    en: {
      heading: "Your records stay yours",
      body: [
        "You own what you enter. We do not sell it, and we do not share it with anyone outside the processors listed in the Privacy Notice.",
        "We use your records only to run the service for you. Nothing else happens to them unless you tick a box telling us otherwise, and nothing is ticked for you.",
        "You can export everything from Settings at any time, and you can delete your account. Deletion is permanent after a short grace period.",
      ],
    },
    ms: {
      heading: "Rekod anda kekal milik anda",
      body: [
        "Anda memiliki apa yang anda masukkan. Kami tidak menjualnya, dan kami tidak berkongsinya dengan sesiapa di luar pemproses yang disenaraikan dalam Notis Privasi.",
        "Kami menggunakan rekod anda hanya untuk menjalankan perkhidmatan bagi anda. Tiada apa-apa lain berlaku kepadanya melainkan anda menanda kotak yang memberitahu kami sebaliknya, dan tiada apa-apa ditanda untuk anda.",
        "Anda boleh mengeksport semuanya dari Tetapan pada bila-bila masa, dan anda boleh memadamkan akaun anda. Pemadaman adalah kekal selepas tempoh tangguh yang singkat.",
      ],
    },
  },
  {
    id: "ai",
    en: {
      heading: "The AI features are optional, and they can be wrong",
      body: [
        "AI is off unless you turn it on. When it is off, the app still works and still calculates everything — a language model only ever chooses the wording.",
        "Every figure you see is calculated by the app, not written by a model. But AI can still misread a receipt, mis-file a purchase, or phrase something poorly. Check anything before you act on it.",
        "When AI is on, the app sends the least it can: for questions, placeholder names rather than your figures. Where a local model is available, your documents are processed on hardware you or we control and do not leave it at all.",
      ],
    },
    ms: {
      heading: "Ciri AI adalah pilihan, dan ia boleh tersilap",
      body: [
        "AI dimatikan melainkan anda menghidupkannya. Apabila ia dimatikan, aplikasi tetap berfungsi dan tetap mengira segalanya — model bahasa hanya memilih perkataan.",
        "Setiap angka yang anda lihat dikira oleh aplikasi, bukan ditulis oleh model. Namun AI masih boleh tersalah baca resit, tersalah fail pembelian, atau menyusun ayat dengan kurang tepat. Semak apa-apa sebelum anda bertindak atasnya.",
        "Apabila AI dihidupkan, aplikasi menghantar sekurang-kurang yang mampu: bagi soalan, nama ruang letak dan bukan angka anda. Jika model tempatan tersedia, dokumen anda diproses pada perkakasan yang anda atau kami kawal dan tidak keluar daripadanya langsung.",
      ],
    },
  },
  {
    id: "availability",
    en: {
      heading: "Availability — read this one",
      body: [
        "HoneyMoney is early software, offered as it is. We do not promise it will be available, and we do not offer a service level.",
        "Part of the service runs from hardware we operate directly, which means the app can be offline for hours or days. The public pages stay up; the signed-in app may not.",
        "Keep your own copy of anything you would be upset to lose. Settings → Export gives you the lot as a file.",
      ],
    },
    ms: {
      heading: "Ketersediaan — sila baca yang ini",
      body: [
        "HoneyMoney ialah perisian peringkat awal, ditawarkan sebagaimana adanya. Kami tidak menjanjikan ia akan tersedia, dan kami tidak menawarkan tahap perkhidmatan.",
        "Sebahagian perkhidmatan berjalan dari perkakasan yang kami kendalikan secara langsung, bermakna aplikasi boleh terputus selama berjam-jam atau berhari-hari. Halaman awam kekal naik; aplikasi yang perlu log masuk mungkin tidak.",
        "Simpan salinan anda sendiri bagi apa-apa yang anda tidak sanggup kehilangan. Tetapan → Eksport memberikan semuanya sebagai satu fail.",
      ],
    },
  },
  {
    id: "liability",
    en: {
      heading: "What we are responsible for",
      body: [
        "You decide what to do with your money. We are not responsible for decisions you make, for financial outcomes, or for anything a third-party provider does.",
        "To the fullest extent Malaysian law allows, we are not liable for indirect or consequential loss, lost profits, or lost data. Where liability cannot be excluded, it is limited to what you have paid us in the previous twelve months — which, while the service is free, is nothing.",
        "Nothing here limits liability that cannot lawfully be limited, including for fraud or for death or personal injury caused by negligence.",
      ],
    },
    ms: {
      heading: "Apa yang menjadi tanggungjawab kami",
      body: [
        "Anda yang memutuskan apa hendak dilakukan dengan wang anda. Kami tidak bertanggungjawab atas keputusan yang anda buat, atas hasil kewangan, atau atas apa-apa yang dilakukan oleh penyedia pihak ketiga.",
        "Setakat yang dibenarkan sepenuhnya oleh undang-undang Malaysia, kami tidak bertanggungan bagi kerugian tidak langsung atau berbangkit, kehilangan keuntungan, atau kehilangan data. Jika tanggungan tidak boleh dikecualikan, ia terhad kepada jumlah yang anda telah bayar kepada kami dalam dua belas bulan sebelumnya — yang, selagi perkhidmatan ini percuma, adalah sifar.",
        "Tiada apa-apa di sini mengehadkan tanggungan yang tidak boleh dihadkan di sisi undang-undang, termasuk bagi penipuan atau bagi kematian atau kecederaan diri akibat kecuaian.",
      ],
    },
  },
  {
    id: "ending",
    en: {
      heading: "Ending it",
      body: [
        "You can close your account whenever you like, from Settings.",
        "We may suspend or close an account that breaks these terms, that puts other people’s data at risk, or that we are required to close by law. Where we reasonably can, we will tell you first and give you a chance to export.",
        "We may stop offering the service. If we do, we will give notice and time to export, unless something outside our control makes that impossible.",
      ],
    },
    ms: {
      heading: "Menamatkannya",
      body: [
        "Anda boleh menutup akaun anda pada bila-bila masa, dari Tetapan.",
        "Kami boleh menggantung atau menutup akaun yang melanggar terma ini, yang membahayakan data orang lain, atau yang dikehendaki ditutup oleh undang-undang. Jika munasabah, kami akan memberitahu anda dahulu dan memberi peluang untuk mengeksport.",
        "Kami mungkin berhenti menawarkan perkhidmatan ini. Jika begitu, kami akan memberi notis dan masa untuk mengeksport, melainkan sesuatu di luar kawalan kami menjadikannya mustahil.",
      ],
    },
  },
  {
    id: "changes",
    en: {
      heading: "Changes, and which law applies",
      body: [
        "These terms carry a version. If we change them in a way that alters the deal, we will show you the new version and ask you to accept it. Until you do, the version you accepted is the one that binds you.",
        "These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction.",
      ],
    },
    ms: {
      heading: "Perubahan, dan undang-undang yang terpakai",
      body: [
        "Terma ini membawa nombor versi. Jika kami mengubahnya dengan cara yang mengubah perjanjian, kami akan menunjukkan versi baharu dan meminta anda menerimanya. Sehingga anda berbuat demikian, versi yang anda terima adalah yang mengikat anda.",
        "Terma ini ditadbir oleh undang-undang Malaysia, dan mahkamah Malaysia mempunyai bidang kuasa.",
      ],
    },
  },
];
