// The PDPA notice, in one place, in both languages.
//
// Section 7 of Malaysia's PDPA requires the written notice to be given in BOTH
// English and Bahasa Malaysia. That is not a translation nicety — a notice
// issued in one language only is defective, and consent collected under a
// defective notice is worth correspondingly less. So the two languages are
// stored side by side in the same object: adding a section without its Malay
// text is a type error, not something to notice in review six weeks later.
//
// ⚠️ The Bahasa Malaysia below is a careful working translation, NOT one
// certified by a Malaysian legal practitioner. Before launch it must be
// reviewed by counsel — the English and Malay must say the same thing, and
// where they differ it is the Malay a Malaysian data subject will rely on.
//
// docs/PRIVACY.md is GENERATED from this file by scripts/build-privacy-doc.mjs.
// Edit here, then run `npm run privacy:doc`. Do not edit the Markdown.

export interface NoticeSection {
  id: string;
  en: { heading: string; body: string[] };
  ms: { heading: string; body: string[] };
}

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    id: "who",
    en: {
      heading: "Who we are",
      body: [
        "HoneyMoney is a household budgeting app operated by Team JUST50. This notice explains what personal data we collect when you use it, why, and what you can tell us to stop.",
        "It is issued under the Personal Data Protection Act 2010 (Malaysia) and its 2024 amendments.",
      ],
    },
    ms: {
      heading: "Siapa kami",
      body: [
        "HoneyMoney ialah aplikasi belanjawan isi rumah yang dikendalikan oleh Team JUST50. Notis ini menerangkan data peribadi yang kami kumpul apabila anda menggunakannya, sebabnya, dan apa yang boleh anda arahkan kami hentikan.",
        "Notis ini dikeluarkan di bawah Akta Perlindungan Data Peribadi 2010 (Malaysia) dan pindaannya pada tahun 2024.",
      ],
    },
  },
  {
    id: "collect",
    en: {
      heading: "What we collect",
      body: [
        "Account details: your name, email address, and the household you belong to.",
        "Money records you enter: amounts, dates, who paid, which bucket, any note or photo you attach, and any receipt text you scan.",
        "Your H-Score: the score, the band, and the five sub-scores computed from those records.",
        "Technical data needed to run the service: session cookies, and error logs that do not contain your records.",
        "We do not collect bank credentials, and HoneyMoney has no connection to your bank. Every record is one you entered.",
      ],
    },
    ms: {
      heading: "Apa yang kami kumpul",
      body: [
        "Butiran akaun: nama, alamat e-mel, dan isi rumah yang anda sertai.",
        "Rekod kewangan yang anda masukkan: jumlah, tarikh, siapa yang membayar, baldi mana, sebarang nota atau gambar yang anda lampirkan, dan teks resit yang anda imbas.",
        "H-Score anda: skor, band, dan lima sub-skor yang dikira daripada rekod tersebut.",
        "Data teknikal untuk menjalankan perkhidmatan: kuki sesi, dan log ralat yang tidak mengandungi rekod anda.",
        "Kami tidak mengumpul kelayakan perbankan, dan HoneyMoney tidak mempunyai sambungan kepada bank anda. Setiap rekod adalah rekod yang anda masukkan sendiri.",
      ],
    },
  },
  {
    id: "purposes",
    en: {
      heading: "Why we process it",
      body: [
        "To run the app: store your records, show your dashboard and graphs, and compute your H-Score. This is what the product does, so it comes with having an account.",
        "AI features (only if you switch them on): Ask Honey and receipt scanning send the text you capture to a third-party AI provider. Off unless you agree.",
        "Matched financial products (only if you switch them on): we share your spending tier — a band, never your records — with licensed partners so they can offer relevant products. Off unless you agree, and you can withdraw at any time.",
        "Anonymous statistics (only if you switch them on): we include your household in aggregate figures that cannot be traced back to you.",
        "We do not sell your records. We do not give any third party your transactions.",
      ],
    },
    ms: {
      heading: "Tujuan pemprosesan",
      body: [
        "Untuk menjalankan aplikasi: menyimpan rekod anda, memaparkan papan pemuka dan graf, serta mengira H-Score anda. Inilah fungsi produk ini, jadi ia disertakan bersama akaun anda.",
        "Ciri AI (hanya jika anda menghidupkannya): Ask Honey dan pengimbasan resit menghantar teks yang anda tangkap kepada penyedia AI pihak ketiga. Dimatikan melainkan anda bersetuju.",
        "Produk kewangan yang dipadankan (hanya jika anda menghidupkannya): kami berkongsi tahap perbelanjaan anda — satu band, bukan rekod anda — dengan rakan kongsi berlesen supaya mereka boleh menawarkan produk yang berkaitan. Dimatikan melainkan anda bersetuju, dan anda boleh menariknya balik pada bila-bila masa.",
        "Statistik tanpa nama (hanya jika anda menghidupkannya): kami memasukkan isi rumah anda dalam angka agregat yang tidak boleh dikesan kembali kepada anda.",
        "Kami tidak menjual rekod anda. Kami tidak memberikan transaksi anda kepada mana-mana pihak ketiga.",
      ],
    },
  },
  {
    id: "obligatory",
    en: {
      heading: "What is required, and what is your choice",
      body: [
        "Required: your email and password, because an account cannot exist without them, and the records you choose to enter, because there is nothing to show you otherwise. If you do not want this processing to continue, you can close your account and we will delete it.",
        "Entirely your choice: AI features, matched financial products, and anonymous statistics. All three are off until you turn them on. Declining any of them does not reduce the rest of the app.",
      ],
    },
    ms: {
      heading: "Apa yang diwajibkan, dan apa yang menjadi pilihan anda",
      body: [
        "Diwajibkan: e-mel dan kata laluan anda, kerana akaun tidak boleh wujud tanpanya, dan rekod yang anda pilih untuk masukkan, kerana tiada apa yang boleh dipaparkan tanpanya. Jika anda tidak mahu pemprosesan ini diteruskan, anda boleh menutup akaun anda dan kami akan memadamkannya.",
        "Sepenuhnya pilihan anda: ciri AI, produk kewangan yang dipadankan, dan statistik tanpa nama. Ketiga-tiganya dimatikan sehingga anda menghidupkannya. Menolak mana-mana daripadanya tidak mengurangkan fungsi aplikasi yang lain.",
      ],
    },
  },
  {
    id: "recipients",
    en: {
      heading: "Who else sees it",
      body: [
        "Other members of your household see the household's shared records. Records in a Personal bucket are not shown to them.",
        "Our hosting provider stores the database on our behalf and does not use it for anything else.",
        "An AI provider receives the text you capture, only if you switched AI features on.",
        "Licensed financial partners receive your spending tier, only if you switched matched products on. They never receive your transactions.",
        "We disclose data to authorities only where the law requires it.",
      ],
    },
    ms: {
      heading: "Siapa lagi yang melihatnya",
      body: [
        "Ahli lain dalam isi rumah anda melihat rekod kongsi isi rumah. Rekod dalam baldi Peribadi tidak dipaparkan kepada mereka.",
        "Penyedia pengehosan kami menyimpan pangkalan data bagi pihak kami dan tidak menggunakannya untuk tujuan lain.",
        "Penyedia AI menerima teks yang anda tangkap, hanya jika anda menghidupkan ciri AI.",
        "Rakan kongsi kewangan berlesen menerima tahap perbelanjaan anda, hanya jika anda menghidupkan produk yang dipadankan. Mereka tidak sekali-kali menerima transaksi anda.",
        "Kami mendedahkan data kepada pihak berkuasa hanya apabila dikehendaki oleh undang-undang.",
      ],
    },
  },
  {
    id: "location",
    en: {
      heading: "Where it is stored",
      body: [
        "Your data is stored on servers in Singapore. This is a transfer outside Malaysia, and we tell you plainly rather than leaving you to find out.",
        "Singapore has its own comparable data protection law. We rely on that, on our contract with the hosting provider, and on your consent to this notice.",
        "If you use AI features, the AI provider may process your text outside Malaysia and Singapore.",
      ],
    },
    ms: {
      heading: "Di mana ia disimpan",
      body: [
        "Data anda disimpan di pelayan di Singapura. Ini merupakan pemindahan ke luar Malaysia, dan kami menyatakannya dengan jelas dan bukan membiarkan anda mengetahuinya sendiri.",
        "Singapura mempunyai undang-undang perlindungan data yang setanding. Kami bergantung pada undang-undang tersebut, pada kontrak kami dengan penyedia pengehosan, dan pada persetujuan anda terhadap notis ini.",
        "Jika anda menggunakan ciri AI, penyedia AI mungkin memproses teks anda di luar Malaysia dan Singapura.",
      ],
    },
  },
  {
    id: "retention",
    en: {
      heading: "How long we keep it",
      body: [
        "Your records are kept while your account is open, because their whole value is the history.",
        "When you close your account we mark it deleted immediately and purge it permanently within 30 days.",
        "Consent records — what you agreed to and when — are kept longer, because they are the evidence that we processed your data lawfully.",
      ],
    },
    ms: {
      heading: "Berapa lama kami menyimpannya",
      body: [
        "Rekod anda disimpan selagi akaun anda dibuka, kerana nilainya terletak pada sejarahnya.",
        "Apabila anda menutup akaun, kami menandakannya sebagai dipadam serta-merta dan memusnahkannya secara kekal dalam tempoh 30 hari.",
        "Rekod persetujuan — apa yang anda persetujui dan bila — disimpan lebih lama, kerana ia adalah bukti bahawa kami memproses data anda secara sah.",
      ],
    },
  },
  {
    id: "rights",
    en: {
      heading: "Your rights",
      body: [
        "Access: ask for a copy of what we hold. You do not have to ask — Settings → Export downloads it as a file immediately.",
        "Correction: edit any record in the app, or ask us to fix anything you cannot.",
        "Withdraw consent: switch off AI, matched products, or statistics at any time in Settings. We stop that processing when you do.",
        "Stop direct marketing: you have a standing right to require us to stop processing your data for marketing. Switching off matched products does this, and we will honour a request by email just as fast.",
        "Portability: your export is machine-readable JSON, so you can take it elsewhere.",
        "Delete: close your account and we delete it.",
        "Complain: you may complain to us, and to the Personal Data Protection Commissioner (Jabatan Perlindungan Data Peribadi, Malaysia).",
      ],
    },
    ms: {
      heading: "Hak anda",
      body: [
        "Akses: minta salinan data yang kami simpan. Anda tidak perlu memohon — Tetapan → Eksport memuat turunnya sebagai fail serta-merta.",
        "Pembetulan: sunting mana-mana rekod dalam aplikasi, atau minta kami membetulkan apa yang anda tidak boleh sunting.",
        "Menarik balik persetujuan: matikan ciri AI, produk yang dipadankan, atau statistik pada bila-bila masa dalam Tetapan. Kami menghentikan pemprosesan tersebut sebaik anda berbuat demikian.",
        "Menghentikan pemasaran langsung: anda mempunyai hak berterusan untuk menghendaki kami berhenti memproses data anda bagi tujuan pemasaran. Mematikan produk yang dipadankan melakukan perkara ini, dan kami akan melaksanakan permintaan melalui e-mel dengan sama pantas.",
        "Kemudahalihan: eksport anda dalam format JSON yang boleh dibaca mesin, jadi anda boleh membawanya ke tempat lain.",
        "Pemadaman: tutup akaun anda dan kami akan memadamkannya.",
        "Aduan: anda boleh membuat aduan kepada kami, dan kepada Pesuruhjaya Perlindungan Data Peribadi (Jabatan Perlindungan Data Peribadi, Malaysia).",
      ],
    },
  },
  {
    id: "security",
    en: {
      heading: "How we protect it",
      body: [
        "Traffic is encrypted in transit. Passwords are hashed, never stored in readable form.",
        "Any AI key a household saves is encrypted before it reaches the database, so it is not readable in a backup.",
        "Every change to a money record is written to an append-only, hash-chained ledger, so tampering is detectable rather than silent.",
        "If a breach occurs that is likely to cause you significant harm, we will notify the Commissioner and you, as the law requires.",
      ],
    },
    ms: {
      heading: "Bagaimana kami melindunginya",
      body: [
        "Trafik disulitkan semasa penghantaran. Kata laluan dicincang (hashed) dan tidak pernah disimpan dalam bentuk yang boleh dibaca.",
        "Sebarang kunci AI yang disimpan oleh isi rumah disulitkan sebelum sampai ke pangkalan data, jadi ia tidak boleh dibaca dalam sandaran.",
        "Setiap perubahan pada rekod kewangan ditulis ke dalam lejar rantaian-cincang yang hanya boleh ditambah, jadi pengubahsuaian dapat dikesan dan bukannya berlaku secara senyap.",
        "Sekiranya berlaku pelanggaran data yang berkemungkinan menyebabkan kemudaratan ketara kepada anda, kami akan memaklumkan Pesuruhjaya dan anda, seperti yang dikehendaki undang-undang.",
      ],
    },
  },
  {
    id: "contact",
    en: {
      heading: "Contact us",
      body: [
        "For any request under this notice — access, correction, withdrawal, deletion, or a complaint — contact our Data Protection Officer at privacy@honeymoney.app.",
        "We aim to respond within 21 days.",
      ],
    },
    ms: {
      heading: "Hubungi kami",
      body: [
        "Untuk sebarang permintaan di bawah notis ini — akses, pembetulan, penarikan balik, pemadaman, atau aduan — hubungi Pegawai Perlindungan Data kami di privacy@honeymoney.app.",
        "Kami berusaha untuk membalas dalam tempoh 21 hari.",
      ],
    },
  },
];
