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
        "This is one of eleven notices rather than one long document, so that the notice which applies to a particular thing can be put in front of you before that thing happens. The others cover the advice boundary, the H-Score’s limits, the AI features, household sharing, sponsors and referrals, device storage, retention, acceptable use, and licences. All of them are at honeymoney.app/legal, in English and Bahasa Malaysia.",
      ],
    },
    ms: {
      heading: "Siapa kami",
      body: [
        "HoneyMoney ialah aplikasi belanjawan isi rumah yang dikendalikan oleh Team JUST50. Notis ini menerangkan data peribadi yang kami kumpul apabila anda menggunakannya, sebabnya, dan apa yang boleh anda arahkan kami hentikan.",
        "Notis ini dikeluarkan di bawah Akta Perlindungan Data Peribadi 2010 (Malaysia) dan pindaannya pada tahun 2024.",
        "Ini adalah satu daripada sebelas notis dan bukan satu dokumen panjang, supaya notis yang berkenaan dengan sesuatu perkara dapat dikemukakan kepada anda sebelum perkara itu berlaku. Yang lain merangkumi sempadan nasihat, had H-Score, ciri AI, perkongsian isi rumah, penaja dan rujukan, storan peranti, pengekalan, penggunaan yang boleh diterima, dan lesen. Kesemuanya di honeymoney.app/legal, dalam bahasa Inggeris dan Bahasa Malaysia.",
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
        "Basic visit counts: the page visited, the country it was viewed from, and how long it stayed open. Nothing we write records an IP address, a browser fingerprint, or your account. A small number of visit rows written before 27 August 2026 still carry an IP address and browser user-agent from an older version of this counter; those fields are being cleared and nothing creates them any more.",
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
        "Kiraan lawatan asas: halaman yang dilawati, negara ia dilihat, dan berapa lama ia dibuka. Apa yang kami tulis tidak merekodkan alamat IP, cap jari pelayar, atau akaun anda. Sebilangan kecil baris lawatan yang ditulis sebelum 27 Ogos 2026 masih membawa alamat IP dan agen-pengguna pelayar daripada versi lama pengira ini; medan tersebut sedang dikosongkan dan tiada apa-apa yang menciptanya lagi.",
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
        "Matched financial products: NOT CURRENTLY OFFERED. We are not asking for this and we are not doing it. If we ever do, it would share a spending band and never your records, it would be off until you switched it on, and we would ask you again under an updated version of this notice.",
        "Anonymous statistics (only if you switch them on): we include your household in aggregate figures that cannot be traced back to you.",
        "Everything above is for one end: showing a household its own money clearly, and helping it learn from it. HoneyMoney is an educational and organisational tool. We do not use your records to profile you, to score you for anyone else, to decide anything about you, or to train an AI model.",
        "We do not sell your records. We do not give any third party your transactions.",
      ],
    },
    ms: {
      heading: "Tujuan pemprosesan",
      body: [
        "Untuk menjalankan aplikasi: menyimpan rekod anda, memaparkan papan pemuka dan graf, serta mengira H-Score anda. Inilah fungsi produk ini, jadi ia disertakan bersama akaun anda.",
        "Ciri AI (hanya jika anda menghidupkannya): Ask Honey dan pengimbasan resit menghantar teks yang anda tangkap kepada penyedia AI pihak ketiga. Dimatikan melainkan anda bersetuju.",
        "Produk kewangan yang dipadankan: TIDAK DITAWARKAN BUAT MASA INI. Kami tidak memintanya dan kami tidak melakukannya. Jika kami berbuat demikian kelak, ia hanya akan berkongsi band perbelanjaan dan bukan rekod anda, ia akan dimatikan sehingga anda menghidupkannya, dan kami akan bertanya kepada anda semula di bawah versi notis ini yang dikemas kini.",
        "Statistik tanpa nama (hanya jika anda menghidupkannya): kami memasukkan isi rumah anda dalam angka agregat yang tidak boleh dikesan kembali kepada anda.",
        "Semua yang di atas adalah untuk satu tujuan: menunjukkan kepada sesebuah isi rumah wang mereka sendiri dengan jelas, dan membantu mereka belajar daripadanya. HoneyMoney ialah alat pendidikan dan penyusunan. Kami tidak menggunakan rekod anda untuk memprofil anda, memberi anda skor bagi pihak orang lain, membuat keputusan tentang anda, atau melatih model AI.",
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
        "Entirely your choice: AI features and anonymous statistics. Both are off until you turn them on. Declining either does not reduce the rest of the app.",
      ],
    },
    ms: {
      heading: "Apa yang diwajibkan, dan apa yang menjadi pilihan anda",
      body: [
        "Diwajibkan: e-mel dan kata laluan anda, kerana akaun tidak boleh wujud tanpanya, dan rekod yang anda pilih untuk masukkan, kerana tiada apa yang boleh dipaparkan tanpanya. Jika anda tidak mahu pemprosesan ini diteruskan, anda boleh menutup akaun anda dan kami akan memadamkannya.",
        "Sepenuhnya pilihan anda: ciri AI dan statistik tanpa nama. Kedua-duanya dimatikan sehingga anda menghidupkannya. Menolak mana-mana daripadanya tidak mengurangkan fungsi aplikasi yang lain.",
      ],
    },
  },
  {
    // Every other section of this notice is about YOUR data. This one is about
    // the other people who end up in it — the partner in the household, the
    // child added as a member, the person named in a note. The PDPA makes the
    // person who enters that data responsible for having the right to, and a
    // notice that never mentions it leaves the account holder carrying an
    // obligation nobody told them about.
    id: "others",
    en: {
      heading: "Other people in your records",
      body: [
        "A household app necessarily holds data about people other than you: who paid, who a spend was for, who a loan is owed to. When you enter it, you are the one deciding to record it.",
        "Only enter another person's details if you are entitled to. Tell the adults in your household that their spending is recorded here and that you can see the shared buckets, because they are entitled to know.",
        "Children: a household can include a child as a member, but the account belongs to an adult. If you add a child, you confirm you are their parent or guardian and are giving consent on their behalf. We do not knowingly hold data on a child added by anyone else, and we will delete it if you tell us.",
        "Anyone in your household — or anyone named in your records — can write to privacy@honeymoney.app to ask what is held about them, to correct it, or to have it removed. We will act on that request even though the account is not theirs.",
      ],
    },
    ms: {
      heading: "Orang lain dalam rekod anda",
      body: [
        "Aplikasi isi rumah semestinya menyimpan data tentang orang selain anda: siapa yang membayar, perbelanjaan itu untuk siapa, hutang itu terhutang kepada siapa. Apabila anda memasukkannya, anda yang membuat keputusan untuk merekodkannya.",
        "Masukkan butiran orang lain hanya jika anda berhak berbuat demikian. Beritahu orang dewasa dalam isi rumah anda bahawa perbelanjaan mereka direkodkan di sini dan bahawa anda boleh melihat baldi kongsi, kerana mereka berhak mengetahuinya.",
        "Kanak-kanak: sesebuah isi rumah boleh memasukkan kanak-kanak sebagai ahli, tetapi akaun itu milik seorang dewasa. Jika anda menambah kanak-kanak, anda mengesahkan bahawa anda ialah ibu bapa atau penjaganya dan memberikan persetujuan bagi pihaknya. Kami tidak menyimpan data kanak-kanak yang ditambah oleh orang lain dengan pengetahuan kami, dan kami akan memadamkannya jika anda memberitahu kami.",
        "Sesiapa dalam isi rumah anda — atau sesiapa yang dinamakan dalam rekod anda — boleh menulis kepada privacy@honeymoney.app untuk bertanya apa yang disimpan tentang mereka, membetulkannya, atau memintanya dibuang. Kami akan bertindak atas permintaan itu walaupun akaun itu bukan milik mereka.",
      ],
    },
  },
  {
    // The pitch deck sells employer-sponsored seats. Nothing is built, and the
    // gap between "what the deck promises a judge" and "what the notice permits
    // us to do" is exactly where a data-protection problem starts. So the
    // guarantees are written down BEFORE the feature exists, while they are
    // still cheap to honour: state that it is off, and state the terms on which
    // it could ever be switched on.
    id: "sponsors",
    en: {
      heading: "Employers and sponsors",
      body: [
        "HoneyMoney is free for households. We have described a future model in which an employer or a community organisation sponsors seats, the way they might sponsor health cover.",
        "NOT CURRENTLY OFFERED. No employer, sponsor or organisation receives anything about you today, and no such reporting is built.",
        "If it is ever offered, these are the terms and they are not negotiable: a sponsor never sees a record, a transaction, a balance, an H-Score or a name. A sponsor sees group figures only, and only for groups of at least ten people, so that no figure can be narrowed down to a person. Anything smaller is withheld entirely rather than rounded or blurred. Taking part would be your choice, off until you switched it on, and we would ask you again under an updated version of this notice.",
        "Your account is yours, not your employer's. If a sponsorship starts or ends, nothing happens to your records and nothing happens to your account.",
      ],
    },
    ms: {
      heading: "Majikan dan penaja",
      body: [
        "HoneyMoney percuma untuk isi rumah. Kami telah menerangkan model masa hadapan di mana majikan atau organisasi komuniti menaja kerusi, sebagaimana mereka mungkin menaja perlindungan kesihatan.",
        "TIDAK DITAWARKAN BUAT MASA INI. Tiada majikan, penaja atau organisasi menerima apa-apa tentang anda hari ini, dan tiada pelaporan sedemikian dibina.",
        "Jika ia ditawarkan kelak, inilah syaratnya dan ia tidak boleh dirunding: penaja tidak sekali-kali melihat rekod, transaksi, baki, H-Score atau nama. Penaja hanya melihat angka kumpulan, dan hanya bagi kumpulan sekurang-kurangnya sepuluh orang, supaya tiada angka boleh disempitkan kepada seseorang. Apa-apa yang lebih kecil ditahan sepenuhnya dan bukan dibundarkan atau dikaburkan. Penyertaan adalah pilihan anda, dimatikan sehingga anda menghidupkannya, dan kami akan bertanya kepada anda semula di bawah versi notis ini yang dikemas kini.",
        "Akaun anda milik anda, bukan milik majikan anda. Jika tajaan bermula atau tamat, tiada apa-apa berlaku kepada rekod anda dan tiada apa-apa berlaku kepada akaun anda.",
      ],
    },
  },
  {
    id: "recipients",
    en: {
      heading: "Who else sees it",
      body: [
        "US. This is the first entry because leaving it out would be the most misleading omission this notice could make. HoneyMoney is not zero-knowledge: your records sit in our database in readable form, because the server has to compute your dashboard, your projection and your H-Score over them, and it cannot do that over encrypted data. A small number of people on Team JUST50 hold the administrator credentials that can read any household. We use that access to run and repair the service, and for nothing else — but we CAN, and no setting in this app changes that.",
        "You can also stop this being true. Switching your household to local-only storage deletes what we hold and stops the server accepting more — see Your rights below. Until you do, the paragraph above applies.",
        "The one exception is a sealed backup. It is encrypted in your browser with a passphrase we never receive, so we hold ciphertext we cannot open. If you want something in HoneyMoney that we genuinely cannot read, that is the feature, and it is the only one.",
        "Other members of your household see what YOU have chosen to share with them, per kind of data. Two things are shared by default because the app cannot work without them — the bills that must be paid, and the total each person contributed. Your individual transactions, spending categories, receipts and statements, goals, H-Score, and insights and forecasts are all PRIVATE by default and stay private until you switch them on in Sharing. Switching one off again hides your history as well as anything new.",
        "Our hosting provider stores the database on our behalf and does not use it for anything else. Cloudflare carries the traffic between your device and us, and holds the encrypted daily backups.",
        "An AI provider receives the text or image you capture, and only if you switched AI features on. Today that is one of: a local model running on hardware we operate, which sends nothing to anyone; Google (Gemini); or Groq. Receipt scanning runs in your own browser by default and reaches no provider at all.",
        "The OpenTimestamps public calendars receive a one-way fingerprint (a SHA-256 hash) of your household's audit-ledger head, so the ledger can be proved un-tampered without us being trusted. The fingerprint contains none of your records, cannot be reversed into them, and is not linked to your name or account. This runs only when someone in your household presses Anchor.",
        "No financial partner or employer receives anything today, because matched products are not offered and sponsored seats are not built.",
        "We disclose data to authorities only where the law requires it, and only what it requires.",
      ],
    },
    ms: {
      heading: "Siapa lagi yang melihatnya",
      body: [
        "KAMI. Ini disenaraikan pertama kerana meninggalkannya adalah peninggalan paling mengelirukan yang boleh dilakukan oleh notis ini. HoneyMoney bukan sistem tanpa-pengetahuan (zero-knowledge): rekod anda berada dalam pangkalan data kami dalam bentuk yang boleh dibaca, kerana pelayan perlu mengira papan pemuka, unjuran dan H-Score anda daripadanya, dan ia tidak boleh berbuat demikian ke atas data yang disulitkan. Sebilangan kecil orang dalam Team JUST50 memegang kelayakan pentadbir yang boleh membaca mana-mana isi rumah. Kami menggunakan akses itu untuk menjalankan dan membaiki perkhidmatan, dan bukan untuk apa-apa lain — tetapi kami BOLEH, dan tiada tetapan dalam aplikasi ini mengubahnya.",
        "Anda juga boleh menghentikan perkara ini daripada benar. Menukar isi rumah anda kepada storan tempatan sahaja memadamkan apa yang kami pegang dan menghentikan pelayan daripada menerima lagi — lihat Hak anda di bawah. Sehingga anda berbuat demikian, perenggan di atas terpakai.",
        "Satu-satunya pengecualian ialah sandaran bermeterai. Ia disulitkan dalam pelayar anda dengan frasa laluan yang tidak pernah kami terima, jadi kami menyimpan teks sifer yang tidak boleh kami buka. Jika anda mahukan sesuatu dalam HoneyMoney yang benar-benar tidak boleh kami baca, itulah cirinya, dan itu sahaja.",
        "Ahli lain dalam isi rumah anda melihat apa yang ANDA pilih untuk dikongsi dengan mereka, mengikut jenis data. Dua perkara dikongsi secara lalai kerana aplikasi tidak dapat berfungsi tanpanya — bil yang mesti dibayar, dan jumlah yang disumbangkan oleh setiap orang. Transaksi individu, kategori perbelanjaan, resit dan penyata, matlamat, H-Score, serta wawasan dan ramalan anda semuanya PERIBADI secara lalai dan kekal peribadi sehingga anda menghidupkannya dalam Perkongsian. Mematikannya semula menyembunyikan sejarah anda serta apa-apa yang baharu.",
        "Penyedia pengehosan kami menyimpan pangkalan data bagi pihak kami dan tidak menggunakannya untuk tujuan lain. Cloudflare membawa trafik antara peranti anda dan kami, serta menyimpan sandaran harian yang disulitkan.",
        "Penyedia AI menerima teks atau imej yang anda tangkap, dan hanya jika anda menghidupkan ciri AI. Hari ini ia adalah salah satu daripada: model tempatan yang berjalan pada perkakasan yang kami kendalikan, yang tidak menghantar apa-apa kepada sesiapa; Google (Gemini); atau Groq. Pengimbasan resit berjalan dalam pelayar anda sendiri secara lalai dan tidak sampai kepada mana-mana penyedia.",
        "Kalendar awam OpenTimestamps menerima cap jari sehala (cincangan SHA-256) bagi kepala lejar audit isi rumah anda, supaya lejar itu boleh dibuktikan tidak diusik tanpa perlu mempercayai kami. Cap jari itu tidak mengandungi rekod anda, tidak boleh diterbalikkan menjadi rekod anda, dan tidak dikaitkan dengan nama atau akaun anda. Ia berjalan hanya apabila seseorang dalam isi rumah anda menekan Anchor.",
        "Tiada rakan kongsi kewangan atau majikan menerima apa-apa hari ini, kerana produk yang dipadankan tidak ditawarkan dan kerusi tajaan belum dibina.",
        "Kami mendedahkan data kepada pihak berkuasa hanya apabila dikehendaki oleh undang-undang, dan hanya apa yang dikehendakinya.",
      ],
    },
  },
  {
    id: "location",
    en: {
      heading: "Where it is stored",
      body: [
        "The app itself runs on hardware we operate directly in Malaysia. Your session goes to it through Cloudflare, which carries the traffic but is not where your records live.",
        "The database that holds your records is run for us by our hosting provider, DOM Cloud, on Oracle Cloud infrastructure in SINGAPORE. That is a cross-border transfer and we say so plainly rather than leaving you to find out. Singapore has its own comparable data protection law; we rely on that, on our contract with the provider, and on your consent to this notice.",
        "If you use AI features, the provider may process what you send outside Malaysia — Google and Groq both do. If the local model is the one in use, nothing leaves the machine in Malaysia at all. Which provider is active is shown to you in Settings.",
        "Daily backups are kept off-site with Cloudflare R2 in the Asia-Pacific region, so your records survive a server failure. We keep the last 14 and delete older ones automatically.",
      ],
    },
    ms: {
      heading: "Di mana ia disimpan",
      body: [
        "Aplikasi ini berjalan pada perkakasan yang kami kendalikan sendiri di Malaysia. Sesi anda sampai kepadanya melalui Cloudflare, yang membawa trafik tetapi bukan tempat rekod anda disimpan.",
        "Pangkalan data yang menyimpan rekod anda dijalankan untuk kami oleh penyedia pengehosan kami, DOM Cloud, di atas infrastruktur Oracle Cloud di SINGAPURA. Itu ialah pemindahan rentas sempadan dan kami menyatakannya dengan jelas dan bukan membiarkan anda mengetahuinya sendiri. Singapura mempunyai undang-undang perlindungan data yang setanding; kami bergantung padanya, pada kontrak kami dengan penyedia, dan pada persetujuan anda terhadap notis ini.",
        "Jika anda menggunakan ciri AI, penyedia mungkin memproses apa yang anda hantar di luar Malaysia — Google dan Groq kedua-duanya berbuat demikian. Jika model tempatan yang digunakan, tiada apa-apa keluar daripada mesin di Malaysia. Penyedia yang aktif ditunjukkan kepada anda dalam Tetapan.",
        "Sandaran harian disimpan di luar tapak dengan Cloudflare R2 di rantau Asia-Pasifik, supaya rekod anda kekal jika pelayan gagal. Kami menyimpan 14 yang terakhir dan memadam yang lebih lama secara automatik.",
      ],
    },
  },
  {
    id: "retention",
    en: {
      heading: "How long we keep it",
      body: [
        "Your records are kept while your account is open, because their whole value is the history.",
        "When you close your account we mark it deleted immediately and purge it permanently within 30 days. Backups made before that date are deleted on their own 14-day cycle, so the last trace is gone within about 45 days.",
        "Consent records — what you agreed to and when — are kept longer, because they are the evidence that we processed your data lawfully.",
      ],
    },
    ms: {
      heading: "Berapa lama kami menyimpannya",
      body: [
        "Rekod anda disimpan selagi akaun anda dibuka, kerana nilainya terletak pada sejarahnya.",
        "Apabila anda menutup akaun, kami menandakannya sebagai dipadam serta-merta dan memusnahkannya secara kekal dalam tempoh 30 hari. Sandaran yang dibuat sebelum tarikh itu dipadam mengikut kitaran 14 harinya sendiri, jadi kesan terakhir hilang dalam kira-kira 45 hari.",
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
        "Withdraw consent: switch off AI, matched products, or statistics at any time in Settings → Privacy. Each switch saves the moment you change it — there is no second button to press — and every change is recorded with a timestamp. We stop that processing when you do.",
        "Stop direct marketing: you have a standing right to require us to stop processing your data for marketing. Switching off matched products does this, and we will honour a request by email just as fast.",
        "Portability: your export is machine-readable JSON, so you can take it elsewhere. You can also keep a standing copy — pick a location on your phone, a drive or a synced folder, and HoneyMoney writes your whole record set there whenever you ask. That copy reads and analyses on your own device with no network and no server, and it stays readable if we disappear.",
        "Stop sharing with your household: switch off any kind of data in Sharing, or stop everything in one action. It takes effect immediately and applies to your history, not only to what comes next. You can also leave a household outright, without anyone’s approval.",
        "See who looked: every time another household member opens data you have shared, it is recorded in a log only you can read. Nobody can delete a line from it, including us.",
        "Delete: close your account and we delete it. You can also delete an individual record or an individual receipt image at any time, without closing anything.",
        "Keep your records off our server entirely: in Your copy, a household owner can switch to local-only storage. We then permanently delete every record, graph node and score snapshot we hold for that household, and the server refuses to store any more. It is a real trade and not a free upgrade — the H-Score, forecasts, household sharing and Ask Honey all stop, because they are computed from records we would no longer have. We will not do it until you demonstrably hold a current copy of your own, because deleting somebody’s only copy in order to honour a privacy preference would be the worst possible way to fail at privacy.",
        "Complain: you may complain to us, and to the Personal Data Protection Commissioner (Jabatan Perlindungan Data Peribadi, Malaysia).",
      ],
    },
    ms: {
      heading: "Hak anda",
      body: [
        "Akses: minta salinan data yang kami simpan. Anda tidak perlu memohon — Tetapan → Eksport memuat turunnya sebagai fail serta-merta.",
        "Pembetulan: sunting mana-mana rekod dalam aplikasi, atau minta kami membetulkan apa yang anda tidak boleh sunting.",
        "Menarik balik persetujuan: matikan ciri AI, produk yang dipadankan, atau statistik pada bila-bila masa dalam Tetapan → Privasi. Setiap suis disimpan sebaik anda mengubahnya — tiada butang kedua untuk ditekan — dan setiap perubahan direkodkan dengan cap masa. Kami menghentikan pemprosesan tersebut sebaik anda berbuat demikian.",
        "Menghentikan pemasaran langsung: anda mempunyai hak berterusan untuk menghendaki kami berhenti memproses data anda bagi tujuan pemasaran. Mematikan produk yang dipadankan melakukan perkara ini, dan kami akan melaksanakan permintaan melalui e-mel dengan sama pantas.",
        "Kemudahalihan: eksport anda dalam format JSON yang boleh dibaca mesin, jadi anda boleh membawanya ke tempat lain. Anda juga boleh menyimpan salinan berterusan — pilih lokasi pada telefon, pemacu atau folder yang disegerakkan, dan HoneyMoney akan menulis keseluruhan set rekod anda ke situ bila-bila anda minta. Salinan itu boleh dibaca dan dianalisis pada peranti anda sendiri tanpa rangkaian dan tanpa pelayan, dan ia kekal boleh dibaca jika kami tiada lagi.",
        "Berhenti berkongsi dengan isi rumah anda: matikan mana-mana jenis data dalam Perkongsian, atau hentikan semuanya dalam satu tindakan. Ia berkuat kuasa serta-merta dan terpakai kepada sejarah anda, bukan hanya kepada apa yang akan datang. Anda juga boleh keluar daripada sesebuah isi rumah terus, tanpa kelulusan sesiapa.",
        "Lihat siapa yang melihat: setiap kali ahli isi rumah lain membuka data yang anda kongsi, ia direkodkan dalam log yang hanya anda boleh baca. Tiada sesiapa boleh memadam satu barisnya, termasuk kami.",
        "Pemadaman: tutup akaun anda dan kami akan memadamkannya. Anda juga boleh memadam rekod individu atau imej resit individu pada bila-bila masa, tanpa menutup apa-apa.",
        "Simpan rekod anda sepenuhnya di luar pelayan kami: dalam Salinan anda, pemilik isi rumah boleh bertukar kepada storan tempatan sahaja. Kami kemudian memadamkan secara kekal setiap rekod, nod graf dan snapshot skor yang kami pegang bagi isi rumah itu, dan pelayan enggan menyimpan apa-apa lagi. Ia satu pertukaran sebenar dan bukan naik taraf percuma — H-Score, ramalan, perkongsian isi rumah dan Ask Honey semuanya berhenti, kerana ia dikira daripada rekod yang tidak lagi kami miliki. Kami tidak akan melakukannya sehingga anda terbukti memegang salinan semasa milik anda sendiri, kerana memadamkan satu-satunya salinan seseorang demi menghormati pilihan privasi adalah cara paling teruk untuk gagal dalam privasi.",
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
        "A sealed backup is encrypted in your own browser before it is uploaded, using a passphrase we never receive. We hold the ciphertext, its size, when it was sealed, and any label you typed — we cannot read what is inside it, and we cannot recover it if you forget the passphrase.",
        "If a breach occurs that is likely to cause you significant harm, we will notify the Commissioner and you, as the law requires.",
        "Administrator access is limited to the people who operate the service, it is used to run and repair it, and every change to a money record — by anyone, including us — is written to the append-only hash-chained ledger, so an alteration is detectable rather than silent. What is NOT yet in place: multi-factor authentication on those administrator credentials, and a way for you to see a list of your own active sessions and end them. Both are gaps we are naming rather than leaving for you to discover.",
        "What we have not done: HoneyMoney is early software built to align with the PDPA, and it has not been through an independent privacy audit or certification. Part of it runs on hardware we operate ourselves, so it can be offline for hours or days. Keep your own copy of anything you would be upset to lose — Settings → Export gives you the lot in one click.",
      ],
    },
    ms: {
      heading: "Bagaimana kami melindunginya",
      body: [
        "Trafik disulitkan semasa penghantaran. Kata laluan dicincang (hashed) dan tidak pernah disimpan dalam bentuk yang boleh dibaca.",
        "Sebarang kunci AI yang disimpan oleh isi rumah disulitkan sebelum sampai ke pangkalan data, jadi ia tidak boleh dibaca dalam sandaran.",
        "Setiap perubahan pada rekod kewangan ditulis ke dalam lejar rantaian-cincang yang hanya boleh ditambah, jadi pengubahsuaian dapat dikesan dan bukannya berlaku secara senyap.",
        "Sandaran bermeterai disulitkan dalam pelayar anda sendiri sebelum dimuat naik, menggunakan frasa laluan yang tidak pernah kami terima. Kami menyimpan teks sifer, saiznya, masa ia dimeteraikan, dan label yang anda taip — kami tidak boleh membaca kandungannya, dan tidak boleh memulihkannya jika anda terlupa frasa laluan itu.",
        "Sekiranya berlaku pelanggaran data yang berkemungkinan menyebabkan kemudaratan ketara kepada anda, kami akan memaklumkan Pesuruhjaya dan anda, seperti yang dikehendaki undang-undang.",
        "Akses pentadbir terhad kepada orang yang mengendalikan perkhidmatan ini, ia digunakan untuk menjalankan dan membaikinya, dan setiap perubahan pada rekod kewangan — oleh sesiapa, termasuk kami — ditulis ke dalam lejar rantaian-cincang yang hanya boleh ditambah, jadi sebarang pengubahan dapat dikesan dan bukannya berlaku secara senyap. Apa yang BELUM ada: pengesahan pelbagai faktor pada kelayakan pentadbir tersebut, dan cara untuk anda melihat senarai sesi aktif anda sendiri dan menamatkannya. Kedua-duanya adalah jurang yang kami namakan dan bukan kami biarkan anda temui sendiri.",
        "Apa yang belum kami lakukan: HoneyMoney ialah perisian peringkat awal yang dibina untuk selaras dengan PDPA, dan ia belum melalui audit atau pensijilan privasi bebas. Sebahagiannya berjalan pada perkakasan yang kami kendalikan sendiri, jadi ia boleh terputus selama berjam-jam atau berhari-hari. Simpan salinan anda sendiri bagi apa-apa yang anda tidak sanggup kehilangan — Tetapan → Eksport memberikan semuanya dengan satu klik.",
      ],
    },
  },
  {
    id: "contact",
    en: {
      heading: "Contact us",
      body: [
        "For any request under this notice — access, correction, withdrawal, deletion, or a complaint — contact our privacy lead at privacy@honeymoney.app.",
        "We aim to respond within 21 days, which is the period the PDPA allows for a data access request.",
        "HoneyMoney is operated by Team JUST50, in Malaysia. If you are not satisfied with how we handle a request, you may complain to the Personal Data Protection Commissioner (Jabatan Perlindungan Data Peribadi, Malaysia) at pdp.gov.my.",
      ],
    },
    ms: {
      heading: "Hubungi kami",
      body: [
        "Untuk sebarang permintaan di bawah notis ini — akses, pembetulan, penarikan balik, pemadaman, atau aduan — hubungi ketua privasi kami di privacy@honeymoney.app.",
        "Kami berusaha untuk membalas dalam tempoh 21 hari, iaitu tempoh yang dibenarkan oleh PDPA bagi permintaan akses data.",
        "HoneyMoney dikendalikan oleh Team JUST50, di Malaysia. Jika anda tidak berpuas hati dengan cara kami mengendalikan sesuatu permintaan, anda boleh membuat aduan kepada Pesuruhjaya Perlindungan Data Peribadi (Jabatan Perlindungan Data Peribadi, Malaysia) di pdp.gov.my.",
      ],
    },
  },
];
