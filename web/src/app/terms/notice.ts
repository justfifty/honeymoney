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
        "Nine further notices sit beside these two, each covering one thing: the advice boundary, the H-Score’s limits, the AI features, household sharing, sponsors and referrals, device storage, how long we keep things, acceptable use, and licences. They are at honeymoney.app/legal and they form part of this agreement where they describe what we will and will not do.",
      ],
    },
    ms: {
      heading: "Dengan siapa anda bersetuju",
      body: [
        "HoneyMoney dikendalikan oleh JUST50 (“kami”). Hubungi: privacy@honeymoney.app.",
        "Terma ini mentadbir perkhidmatan. Cara kami mengendalikan data peribadi anda ditadbir secara berasingan oleh Notis Privasi kami, yang perlu anda baca bersama-sama ini.",
        "Sembilan notis lain berada di sisi kedua-dua ini, masing-masing meliputi satu perkara: sempadan nasihat, had H-Score, ciri AI, perkongsian isi rumah, penaja dan rujukan, storan peranti, berapa lama kami menyimpan sesuatu, penggunaan yang boleh diterima, dan lesen. Kesemuanya di honeymoney.app/legal dan ia menjadi sebahagian daripada perjanjian ini setakat ia menerangkan apa yang kami akan dan tidak akan lakukan.",
      ],
    },
  },
  {
    id: "what",
    en: {
      heading: "What HoneyMoney is, and what it is not",
      body: [
        "HoneyMoney helps you record spending, organise it into three buckets, and see what your own numbers imply. That is all it does. It is an educational and organisational tool, offered free of charge for the benefit of the households that use it.",
        "It is NOT financial advice. We are not a licensed financial adviser, and nothing in the app is personal financial, tax or investment advice. For advice, speak to a licensed financial planner, or to AKPK (Agensi Kaunseling dan Pengurusan Kredit), which is free.",
        "It is NOT a bank or a fund manager. We never hold, move or invest your money.",
        "The Money Health Score (H-Score) is NOT a credit score. It is arithmetic on the figures you yourself typed in, it is visible only to you and your household, and it is not shared with any lender, insurer, landlord or employer. It has no bearing on your creditworthiness and must not be presented to anyone as if it did. Nobody may require you to show it.",
        "Every projection, forecast and warning is an estimate extrapolated from what you entered. It is a planning aid, not a guarantee. Check it against your own bank and e-wallet statements before acting on it.",
        "Where the app shows financial products, it is a catalogue you chose to open. We do not rank them, we do not recommend one over another, and a listing is not an endorsement. Each product belongs to its licensed provider and is subject to that provider’s terms.",
      ],
    },
    ms: {
      heading: "Apa itu HoneyMoney, dan apa yang bukan",
      body: [
        "HoneyMoney membantu anda merekod perbelanjaan, menyusunnya ke dalam tiga baldi, dan melihat apa yang ditunjukkan oleh angka anda sendiri. Itu sahaja fungsinya. Ia ialah alat pendidikan dan penyusunan, ditawarkan secara percuma untuk manfaat isi rumah yang menggunakannya.",
        "Ia BUKAN nasihat kewangan. Kami bukan penasihat kewangan berlesen, dan tiada apa-apa dalam aplikasi ini merupakan nasihat kewangan, cukai atau pelaburan peribadi. Untuk nasihat, rujuk perancang kewangan berlesen, atau AKPK (Agensi Kaunseling dan Pengurusan Kredit), yang percuma.",
        "Ia BUKAN bank atau pengurus dana. Kami tidak pernah memegang, memindahkan atau melaburkan wang anda.",
        "Money Health Score (H-Score) BUKAN skor kredit. Ia ialah pengiraan ke atas angka yang anda sendiri masukkan, ia hanya kelihatan kepada anda dan isi rumah anda, dan ia tidak dikongsi dengan mana-mana pemberi pinjaman, penanggung insurans, tuan rumah atau majikan. Ia tiada kaitan dengan kelayakan kredit anda dan tidak boleh dikemukakan kepada sesiapa seolah-olah ia berkaitan. Tiada sesiapa boleh mewajibkan anda menunjukkannya.",
        "Setiap unjuran, ramalan dan amaran adalah anggaran yang diekstrapolasi daripada apa yang anda masukkan. Ia alat bantu perancangan, bukan jaminan. Semaknya dengan penyata bank dan e-dompet anda sendiri sebelum bertindak atasnya.",
        "Apabila aplikasi memaparkan produk kewangan, ia adalah katalog yang anda pilih untuk buka. Kami tidak menyusun kedudukannya, tidak mengesyorkan satu berbanding yang lain, dan penyenaraian bukan sokongan. Setiap produk milik penyedia berlesennya dan tertakluk kepada terma penyedia tersebut.",
      ],
    },
  },
  {
    // The deck says "Free for households, forever". A pitch deck can say that;
    // a contract has to survive the day the money runs out. So this clause
    // promises the thing that is actually keepable — we will not start charging
    // an existing household without asking, and you leave with everything —
    // rather than a word ("forever") that binds people who cannot honour it.
    id: "free",
    en: {
      heading: "It is free, and what that means",
      body: [
        "HoneyMoney is free of charge for households. There is no trial, no card, no usage limit you have to pay to lift, and no feature held back behind a price. We built it to be useful to people under cost-of-living pressure, and pricing them out would defeat the point.",
        "We intend to keep the household tier free. If that ever has to change, we will not start charging an account that already exists without telling you first and asking you to agree — and if you decline, you keep the right to export everything and leave with it.",
        "A sponsor — an employer or a community organisation — may one day pay for seats. That never makes them a party to this agreement, never gives them access to your records, and never changes what you owe, which is nothing. Nothing about your account depends on a sponsorship continuing.",
        "Free also sets the limit of what you can expect. There is no service level, no support commitment, and no compensation for downtime. Read the availability clause below.",
      ],
    },
    ms: {
      heading: "Ia percuma, dan apa maksudnya",
      body: [
        "HoneyMoney percuma untuk isi rumah. Tiada tempoh percubaan, tiada kad, tiada had penggunaan yang perlu dibayar untuk dibuka, dan tiada ciri yang ditahan di sebalik harga. Kami membinanya untuk berguna kepada orang yang menghadapi tekanan kos sara hidup, dan meletakkan harga yang menyingkirkan mereka akan menggagalkan tujuannya.",
        "Kami berhasrat mengekalkan peringkat isi rumah sebagai percuma. Jika itu terpaksa berubah kelak, kami tidak akan mula mengenakan bayaran kepada akaun yang sedia ada tanpa memberitahu anda terlebih dahulu dan meminta persetujuan anda — dan jika anda menolak, anda tetap berhak mengeksport semuanya dan membawanya pergi.",
        "Penaja — majikan atau organisasi komuniti — mungkin suatu hari nanti membayar bagi kerusi. Itu tidak sekali-kali menjadikan mereka pihak kepada perjanjian ini, tidak memberikan mereka akses kepada rekod anda, dan tidak mengubah apa yang anda terhutang, iaitu tiada apa-apa. Tiada apa-apa tentang akaun anda bergantung pada tajaan yang berterusan.",
        "Percuma juga menetapkan had apa yang boleh anda jangkakan. Tiada tahap perkhidmatan, tiada komitmen sokongan, dan tiada pampasan bagi masa henti. Baca fasal ketersediaan di bawah.",
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
        "You are responsible for the people you add and for the details you enter about other people. Only record another person’s information if you are entitled to, and tell the adults in your household that their spending is recorded here and that you can see the shared buckets.",
        "If you add a child as a household member, you confirm you are that child’s parent or guardian and that you consent on their behalf. Do not add a child you are not responsible for.",
        "Anyone named in your records may write to privacy@honeymoney.app to ask what is held about them, correct it, or have it removed, and we will act on that even though the account is yours.",
      ],
    },
    ms: {
      heading: "Akaun anda",
      body: [
        "Anda mesti berumur sekurang-kurangnya 18 tahun untuk memiliki akaun. Sebuah isi rumah boleh memasukkan anak-anak sebagai ahli, tetapi akaun itu milik seorang dewasa.",
        "Rahsiakan kata laluan anda. Apa-apa yang dilakukan melalui akaun anda dianggap dilakukan oleh anda.",
        "Berikan maklumat yang tepat. Angka yang dihasilkan aplikasi hanya sebaik apa yang anda masukkan.",
        "Jika anda menjemput seseorang ke dalam isi rumah anda, anda memilih untuk berkongsi rekod bersama isi rumah itu dengan mereka. Perbelanjaan yang anda tandakan peribadi kekal peribadi.",
        "Anda bertanggungjawab ke atas orang yang anda tambah dan ke atas butiran yang anda masukkan tentang orang lain. Rekodkan maklumat orang lain hanya jika anda berhak berbuat demikian, dan beritahu orang dewasa dalam isi rumah anda bahawa perbelanjaan mereka direkodkan di sini dan bahawa anda boleh melihat baldi kongsi.",
        "Jika anda menambah kanak-kanak sebagai ahli isi rumah, anda mengesahkan bahawa anda ialah ibu bapa atau penjaga kanak-kanak itu dan bahawa anda memberi persetujuan bagi pihaknya. Jangan tambah kanak-kanak yang bukan tanggungjawab anda.",
        "Sesiapa yang dinamakan dalam rekod anda boleh menulis kepada privacy@honeymoney.app untuk bertanya apa yang disimpan tentang mereka, membetulkannya, atau memintanya dibuang, dan kami akan bertindak atasnya walaupun akaun itu milik anda.",
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
        "Do not use HoneyMoney to monitor, profile or control another person without their knowledge and permission. Being in a relationship with somebody, contributing to a bill, or having access to their phone does not authorise access to their financial information.",
        "Do not use it to break the law, or in a way that damages the service for other people.",
      ],
    },
    ms: {
      heading: "Cara anda boleh menggunakannya",
      body: [
        "Gunakan HoneyMoney untuk wang isi rumah anda sendiri, dan untuk tujuan yang sah.",
        "Jangan muat naik rekod kewangan orang lain melainkan anda mempunyai hak untuk berbuat demikian. Jangan cuba mencapai data milik isi rumah lain. Jangan mengikis, menjual semula atau merekayasa balik perkhidmatan ini, atau menggunakannya untuk membina produk pesaing.",
        "Jangan gunakan HoneyMoney untuk memantau, memprofil atau mengawal orang lain tanpa pengetahuan dan kebenaran mereka. Berada dalam hubungan dengan seseorang, menyumbang kepada sesuatu bil, atau mempunyai akses kepada telefon mereka tidak memberi kuasa untuk mencapai maklumat kewangan mereka.",
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
        "When AI is on, the app sends the least it can: for questions, placeholder names rather than your figures. Where a local model is available, your documents are processed on hardware you or we control and do not leave it at all. Which provider is active is shown to you in Settings, and the Privacy Notice names them.",
        "The Telegram bot, if you use it, is a separate choice again. Anything you forward to it passes through Telegram before it reaches us, under Telegram’s terms and not ours. Use the app itself for anything you would rather not put in a chat message.",
      ],
    },
    ms: {
      heading: "Ciri AI adalah pilihan, dan ia boleh tersilap",
      body: [
        "AI dimatikan melainkan anda menghidupkannya. Apabila ia dimatikan, aplikasi tetap berfungsi dan tetap mengira segalanya — model bahasa hanya memilih perkataan.",
        "Setiap angka yang anda lihat dikira oleh aplikasi, bukan ditulis oleh model. Namun AI masih boleh tersalah baca resit, tersalah fail pembelian, atau menyusun ayat dengan kurang tepat. Semak apa-apa sebelum anda bertindak atasnya.",
        "Apabila AI dihidupkan, aplikasi menghantar sekurang-kurang yang mampu: bagi soalan, nama ruang letak dan bukan angka anda. Jika model tempatan tersedia, dokumen anda diproses pada perkakasan yang anda atau kami kawal dan tidak keluar daripadanya langsung. Penyedia yang aktif ditunjukkan kepada anda dalam Tetapan, dan Notis Privasi menamakannya.",
        "Bot Telegram, jika anda menggunakannya, ialah pilihan berasingan sekali lagi. Apa-apa yang anda kirim kepadanya melalui Telegram sebelum sampai kepada kami, di bawah terma Telegram dan bukan terma kami. Gunakan aplikasi itu sendiri untuk apa-apa yang anda tidak mahu letakkan dalam mesej sembang.",
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
        "What we do commit to, so that “as it is” is not the whole of our side: we encrypt traffic in transit and passwords at rest, we encrypt every off-site backup, we test that a backup actually restores, we write every change to a money record into an append-only hash-chained ledger so tampering is detectable, we run no third-party analytics or advertising code, and if a breach occurs that is likely to cause you significant harm we will tell you and the Commissioner as the law requires. Those are obligations, not features.",
      ],
    },
    ms: {
      heading: "Ketersediaan — sila baca yang ini",
      body: [
        "HoneyMoney ialah perisian peringkat awal, ditawarkan sebagaimana adanya. Kami tidak menjanjikan ia akan tersedia, dan kami tidak menawarkan tahap perkhidmatan.",
        "Sebahagian perkhidmatan berjalan dari perkakasan yang kami kendalikan secara langsung, bermakna aplikasi boleh terputus selama berjam-jam atau berhari-hari. Halaman awam kekal naik; aplikasi yang perlu log masuk mungkin tidak.",
        "Simpan salinan anda sendiri bagi apa-apa yang anda tidak sanggup kehilangan. Tetapan → Eksport memberikan semuanya sebagai satu fail.",
        "Apa yang kami komited, supaya “sebagaimana adanya” bukan keseluruhan pihak kami: kami menyulitkan trafik semasa penghantaran dan kata laluan semasa disimpan, kami menyulitkan setiap sandaran luar tapak, kami menguji bahawa sandaran itu benar-benar boleh dipulihkan, kami menulis setiap perubahan pada rekod kewangan ke dalam lejar rantaian-cincang yang hanya boleh ditambah supaya pengubahsuaian dapat dikesan, kami tidak menjalankan sebarang kod analitik atau pengiklanan pihak ketiga, dan jika berlaku pelanggaran yang berkemungkinan menyebabkan kemudaratan ketara kepada anda, kami akan memberitahu anda dan Pesuruhjaya seperti yang dikehendaki undang-undang. Itu adalah kewajipan, bukan ciri.",
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
