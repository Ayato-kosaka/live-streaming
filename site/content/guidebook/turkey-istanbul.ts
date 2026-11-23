/**
 * イスタンブールのガイドブック（`/travel/turkey/istanbul`）の中身。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/turkey/istanbul/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_bake.py turkey/istanbul` で焼き直す。
 * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。
 */
import type { Guidebook } from "./types";

export const ISTANBUL: Guidebook = /* BEGIN GUIDE */
{
 "country": "turkey",
 "city": "istanbul",
 "name": "イスタンブール",
 "kicker": "トルコ",
 "local": {
  "text": "İstanbul",
  "lang": "tr",
  "roman": "Istanbul"
 },
 "lead": "「文明の十字路」と称えられた街",
 "cover": {
  "src": "/guide/turkey/istanbul/photos/hagia-sophia-mars-2013-22d15ac0-960.webp",
  "small": "/guide/turkey/istanbul/photos/hagia-sophia-mars-2013-22d15ac0-500.webp",
  "w": 960,
  "h": 641,
  "alt": "アヤソフィアの外観",
  "kind": "photo",
  "credit": {
   "by": "Arild Vågen",
   "lic": "CC BY-SA 3.0",
   "page": "https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg"
  }
 },
 "title": "イスタンブール観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜トルコ",
 "description": "トルコの街イスタンブールの観光ガイド。見どころマップと、やりたいこと8つ（ボスポラス海峡のクルーズ、ハマムのアカスリ、グランドバザール、サバサンド）、ケバブとバクラヴァ。",
 "rate": {
  "unit": "リラ",
  "yen": 3.14,
  "date": "2026-11-20"
 },
 "about": {
  "cards": [
   {
    "id": "crossroads",
    "icon": "bridge",
    "q": "なぜ「文明の十字路」？",
    "a": "ボスポラス海峡が市をヨーロッパ側とアジア側に分ける。東と西が出会う「文明の十字路」と呼ばれてきた。",
    "src": [
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "Rick Steves「A Crossroads of Civilizations in Istanbul」",
      "url": "https://www.ricksteves.com/watch-read-listen/read/articles/the-many-layers-of-istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "history",
    "icon": "castle",
    "q": "どんな歴史？",
    "a": "330年に東ローマ帝国の都コンスタンティノープルに、1453年からはオスマン帝国の都。1923年に都はアンカラへ。",
    "src": [
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "ayasofya",
    "icon": "mosque",
    "q": "アヤソフィアって何？",
    "a": "537年に建った大聖堂。1453年にモスク、1935年に博物館になり、2020年にふたたびモスクになった。",
    "src": [
     {
      "name": "Wikipedia「Hagia Sophia」",
      "url": "https://en.wikipedia.org/wiki/Hagia_Sophia",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "areas": [
   {
    "id": "oldcity",
    "name": "旧市街",
    "color": "#ffd98a",
    "lead": "アヤソフィア・ブルーモスク・トプカプ宮殿・地下宮殿が歩いて回れる距離に集まる一帯",
    "see": [
     "ayasofya",
     "blue",
     "topkapi",
     "cistern",
     "bazaar",
     "spice",
     "suleymaniye",
     "hippodrome",
     "archaeology",
     "rustem"
    ],
    "plan": [
     1,
     2,
     2
    ],
    "src": [
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Hagia Sofia din Istanbul」",
      "url": "https://www.openstreetmap.org/way/109862851",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Kapalı Çarşı」",
      "url": "https://www.openstreetmap.org/way/303807317",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Süleymaniye Camii」",
      "url": "https://www.openstreetmap.org/relation/1564032",
      "seen": "2026-11-23"
     }
    ],
    "body": "北の金角湾の岸にグランドバザールとエジプシャン・バザール。",
    "local": {
     "text": "Sultanahmet / Fatih",
     "lang": "tr",
     "roman": "Sultanahmet / Fatih"
    }
   },
   {
    "id": "beyoglu",
    "name": "ベイオール",
    "color": "#d9ccf5",
    "lead": "金角湾の北の側",
    "see": [
     "galata",
     "istiklal"
    ],
    "plan": [
     1,
     1,
     2
    ],
    "src": [
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Galata」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Galata",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Galata Kulesi」",
      "url": "https://www.openstreetmap.org/way/23236783",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「İstiklal Caddesi」",
      "url": "https://www.openstreetmap.org/way/485070951",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Taksim Meydanı」",
      "url": "https://www.openstreetmap.org/relation/4473230",
      "seen": "2026-11-23"
     }
    ],
    "body": "ガラタ塔の坂から、イスティクラル通りがタクシム広場まで延びる。",
    "local": {
     "text": "Beyoğlu",
     "lang": "tr",
     "roman": "Beyoglu"
    }
   },
   {
    "id": "asian",
    "name": "アジア側",
    "color": "#ffc4d2",
    "lead": "ボスポラス海峡の東の岸",
    "see": [
     "kadikoy"
    ],
    "plan": [
     3,
     2,
     1
    ],
    "src": [
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Kadıköy」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Kad%C4%B1k%C3%B6y",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Maiden's Tower」",
      "url": "https://en.wikipedia.org/wiki/Maiden%27s_Tower",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Kadıköy İskelesi」",
      "url": "https://www.openstreetmap.org/way/560203763",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Kız Kulesi」",
      "url": "https://www.openstreetmap.org/way/103821246",
      "seen": "2026-11-23"
     }
    ],
    "body": "船着き場のカドゥキョイに市場の通りが広がり、ユスキュダルの沖に乙女の塔が立つ。",
    "local": {
     "text": "Anadolu Yakası",
     "lang": "tr",
     "roman": "Anadolu Yakasi"
    }
   }
  ]
 },
 "todo": [
  {
   "id": "bosphorus",
   "title": "ボスポラス海峡をクルーズしたい！",
   "lead": "エミノニュからアナドル・カヴァウまで船で往復",
   "what": "シェヒル・ハトラルの「ボスポラス海峡の長いツアー」の船で、エミノニュからアナドル・カヴァウまで行って帰る。海峡はマルマラ海と黒海を結び、市をヨーロッパ側とアジア側に分ける。岸にはドルマバフチェ宮殿・オルタキョイ・ルメリ・ヒサール・ベイレルベイ宮殿が並ぶ。",
   "how": "エミノニュ・ベシクタシュ・ユスキュダル・カンルジャ・サルイェル・ルメリ・カヴァウ・アナドル・カヴァウの7つの船着き場に寄る。毎日出る。切符は船着き場の窓口か、シェヒル・ハトラルのネットで買う。行きと帰りに同じ切符を使う。",
   "time": "2026〜2027年の冬の時刻表では、エミノニュを10時35分に出て、アナドル・カヴァウに12時25分に着く。帰りは15時に出て、エミノニュに16時40分。休みを入れて約6時間。",
   "money": "往復は外国人640リラ（約2,010円）。",
   "tip": "アナドル・カヴァウでは約2時間半、船が待つ。",
   "route": "",
   "see": [
    "dolmabahce",
    "ortakoy",
    "rumeli",
    "beylerbeyi"
   ],
   "src": [
    {
     "name": "e-Yaşam Rehberi「Şehir Hatları Uzun Boğaz Turu」（2026年9月7日更新）",
     "url": "https://e-yasamrehberi.com/deniz_ulasimi/sehir-hatlari-uzun-bogaz-turu.htm",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia（日本語）「イスタンブール」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Istanbul/European Bosphorus」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul/European_Bosphorus",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Beylerbeyi Palace」",
     "url": "https://en.wikipedia.org/wiki/Beylerbeyi_Palace",
     "seen": "2026-11-23"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "往復640リラ"
    }
   ]
  },
  {
   "id": "hammam",
   "title": "ハマムでアカスリしたい！",
   "lead": "1584年の浴場で、垢すりと泡の洗い",
   "what": "昔ながらの浴場ハマムのチェンベルリタシュ・ハマムで、温めた大理石の台に横になり、垢すり（ケセ）と石けんの泡で洗ってもらう。ヌルバヌ・スルタンの寄進で、ミマール・スィナンの時代の1584年にできた、男女2つの浴場を持つハマム。",
   "how": "ヴェズィルハン通り8番。コンスタンティヌスの記念柱の向かい。男湯と女湯に分かれ、同じ性の係の人が洗う。",
   "time": "毎日6時〜24時。",
   "money": "入浴だけは3,200リラ（57ユーロ）。垢すりと泡の洗い（15分）がつくと4,050リラ（72ユーロ）。",
   "tip": "どの組にも腰に巻く布ペシテマルとサンダルがつく。タオル・石けん・シャンプー・着替えの小部屋も値段に入る。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Çemberlitaş Hamamı（浴場のサイト。料金の表）",
     "url": "https://www.cemberlitashamami.com/en/",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
     "seen": "2026-11-23"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "垢すり4,050リラ"
    }
   ]
  },
  {
   "id": "bazaar",
   "title": "グランドバザールでお土産探ししたい！",
   "lead": "61本の屋根つき通りに、4,000を超える店",
   "what": "屋根のある大きな市場グランドバザールの通りを歩いて、お土産を探す。1455〜1456年の冬に建て始めた市場で、1日に25万〜40万人が訪れる。ロクムの店が多い。じゅうたんとキリムの店は、ブルーモスクの東のアラスタ・バザールのあたりにも集まる。",
   "how": "トラムT1のベヤズット駅。",
   "time": "月〜土曜の9時〜19時。日曜と祝日は休み。",
   "money": "",
   "tip": "値段の交渉はふつうのこと。グランドバザールの値段はほかの所の倍で、地元の人は買いに来ない。エジプシャン・バザールの値段も、交渉したあとでも街のほかの所の倍。",
   "route": "",
   "see": [
    "bazaar",
    "spice"
   ],
   "src": [
    {
     "name": "Wikipedia「Grand Bazaar, Istanbul」",
     "url": "https://en.wikipedia.org/wiki/Grand_Bazaar,_Istanbul",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "balik",
   "title": "エミノニュでサバサンドを食べたい！",
   "lead": "焼いた魚をパンに挟む、船着き場の名物",
   "what": "サバなどの脂ののった魚を焼くか揚げて、野菜といっしょにトルコのパンに挟んだサンドイッチ「バルック・エキメッキ」を食べる。焼いた魚にトマト・香草・玉ねぎを合わせてパンに挟むのが、エミノニュの人気の軽食。エミノニュの広場で、船の上で作って出すのが定番。",
   "how": "エミノニュには、エミノニュ・バルック・エキメッキと、デニズ・ユルドゥズ・バルクチュの店がある。",
   "time": "",
   "money": "",
   "tip": "いまは漁師が船から直に売ることは許されていない。",
   "route": "",
   "see": [
    "galatabridge"
   ],
   "src": [
    {
     "name": "Wikipedia「Balık ekmek」",
     "url": "https://en.wikipedia.org/wiki/Bal%C4%B1k_ekmek",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Turkish cuisine」",
     "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
     "seen": "2026-11-23"
    }
   ],
   "eat": [
    "balik-ekmek"
   ]
  },
  {
   "id": "cistern",
   "title": "地下宮殿のメドゥーサに会いたい！",
   "lead": "6世紀の貯水槽に、大理石の柱が336本",
   "what": "地下の貯水槽「地下宮殿」に下りて、柱の森を歩き、メドゥーサの顔の柱の台を見る。6世紀にユスティニアヌス1世の時代に造り、約8万立方メートルの水をためた。メドゥーサの顔の台が2つある。どこから運んだかは分かっていない。1963年のボンド映画「ロシアより愛をこめて」に出てくる。",
   "how": "イェレバタン通り1/3番。トラムT1のスルタンアフメット駅から260m。",
   "time": "毎日9時〜18時30分と、19時30分〜22時。",
   "money": "大人は9時〜18時30分が1,500リラ（約4,710円）、19時30分〜22時が2,400リラ（約7,530円）。",
   "tip": "2020〜2022年の修復のあと、LEDの明かりとデジタルの展示「ダハ・デリネ（もっと深く）」で開き直した。",
   "route": "",
   "see": [
    "cistern"
   ],
   "src": [
    {
     "name": "Wikipedia「Basilica Cistern」",
     "url": "https://en.wikipedia.org/wiki/Basilica_Cistern",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
     "seen": "2026-11-23"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "昼1,500リラ"
    }
   ]
  },
  {
   "id": "ferry",
   "title": "フェリーでアジア側へ渡りたい！",
   "lead": "カドゥキョイの魚市場まで、海峡を船で渡る",
   "what": "船で、ヨーロッパ側からアジア側のカドゥキョイへ渡る。ボスポラス海峡が市をヨーロッパ側とアジア側に分け、住む人のおよそ3分の1がアジア側に暮らす。",
   "how": "カドゥキョイへの船は、ヨーロッパ側のエミノニュ・カラキョイ・ベシクタシュから出る。着いたら、魚市場（9時〜20時30分）と、牛の像から南へ延びる歩行者の通りバハリイェ通りへ。",
   "time": "",
   "money": "カドゥキョイとエミノニュの船は65.21リラ（約200円。2026年7月20日から）。",
   "tip": "イスタンブールカードは、街角の小さな店や駅の機械で買え、現金かクレジットカードで足せる。",
   "route": "",
   "see": [
    "kadikoy",
    "maiden"
   ],
   "src": [
    {
     "name": "Wikivoyage「Istanbul/Kadıköy」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul/Kad%C4%B1k%C3%B6y",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia（日本語）「イスタンブール」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
     "seen": "2026-11-23"
    },
    {
     "name": "sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
     "url": "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Istanbul」",
     "url": "https://en.wikivoyage.org/wiki/Istanbul",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "kebab",
   "title": "本場のケバブを食べたい！",
   "lead": "縦の串で焼くドネルに、ヨーグルトのイスケンデル",
   "what": "トルコのケバブを食べる。縦に回る串で焼いた肉を薄く削いだドネル・ケバブや、平たい鉄の串で焼くアダナ・ケバブ。縦に回して焼く形は、ブルサが生まれた所とされることが多い。1850年代のブルサのイスケンデル・エフェンディの考えとされる。イスケンデル・ケバブは、ドネルにヨーグルト・トマトのソース・バターをかけた料理で、ブルサ生まれ。",
   "how": "イスケンデル・エフェンディの家の店ケバプチュ・イスケンデルは、イスタンブールではニシャンタシュのシャカユク通り67番に店がある。",
   "time": "",
   "money": "",
   "tip": "ドネルは薄いパンで巻くと「デュリュム」になる。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikipedia「Doner kebab」",
     "url": "https://en.wikipedia.org/wiki/Doner_kebab",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Turkish cuisine」",
     "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
     "seen": "2026-11-23"
    },
    {
     "name": "Kebapçı İskender（店のサイト）",
     "url": "https://www.iskender.com.tr/",
     "seen": "2026-11-23"
    }
   ],
   "eat": [
    "doner",
    "iskender",
    "adana"
   ]
  },
  {
   "id": "islands",
   "title": "プリンスィズ諸島へ日帰りしたい！",
   "lead": "馬車が電気の車に替わった、ビュユック島へ船で",
   "what": "シェヒル・ハトラルの船で、マルマラ海のプリンスィズ諸島でいちばん大きいビュユック島へ渡り、島を歩く。2020年まで島の乗り物は馬車だけだった。いまは電気の車に替わっている。大きな丘ユジェテペの上に、聖ゲオルギオスのギリシャ正教の修道院がある。",
   "how": "ヨーロッパ側のエミノニュ・カバタシュ、アジア側のカドゥキョイ・ボスタンジュから、シェヒル・ハトラルの船が出る。",
   "time": "",
   "money": "ボスタンジュと島の船は171.89リラ（約540円。2026年7月20日から）。",
   "tip": "トロツキーが1929年から1933年まで暮らした屋敷ヤナロス邸は、いまは廃墟。",
   "route": "",
   "see": [
    "buyukada"
   ],
   "src": [
    {
     "name": "Wikipedia「Büyükada」",
     "url": "https://en.wikipedia.org/wiki/B%C3%BCy%C3%BCkada",
     "seen": "2026-11-23"
    },
    {
     "name": "sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
     "url": "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809",
     "seen": "2026-11-23"
    }
   ]
  }
 ],
 "see": {
  "items": [
   {
    "id": "ayasofya",
    "name": "アヤソフィア",
    "local": {
     "text": "Ayasofya",
     "lang": "tr",
     "roman": "Ayasofya"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/hagia-sophia-mars-2013-22d15ac0-960.webp",
     "small": "/guide/turkey/istanbul/photos/hagia-sophia-mars-2013-22d15ac0-500.webp",
     "w": 960,
     "h": 641,
     "alt": "アヤソフィアの外観",
     "kind": "photo",
     "credit": {
      "by": "Arild Vågen",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg"
     }
    },
    "body": "537年に東ローマ帝国のユスティニアヌス1世が建てた大聖堂。直径30メートルを超える丸屋根をのせる。1453年のコンスタンティノープルの陥落のあとモスクになり、1935年に博物館、2020年にふたたびモスクになった。1985年から世界遺産。",
    "facts": [
     {
      "label": "行きかた",
      "text": "アヤソフィア広場。トラムT1のスルタンアフメット駅から300m"
     },
     {
      "label": "見学",
      "text": "いまも礼拝の場なので、礼拝の時間と服装に気をつける"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ayasofya+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Hagia Sophia」",
      "url": "https://en.wikipedia.org/wiki/Hagia_Sophia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.008505,
     "lon": 28.980011
    },
    "area": "oldcity"
   },
   {
    "id": "blue",
    "name": "スルタンアフメット・モスク（ブルーモスク）",
    "local": {
     "text": "Sultan Ahmet Camii",
     "lang": "tr",
     "roman": "Sultan Ahmet Camii"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/exterior-of-sultan-ahmed-i-mosqu-e4c4690b-960.webp",
     "small": "/guide/turkey/istanbul/photos/exterior-of-sultan-ahmed-i-mosqu-e4c4690b-500.webp",
     "w": 960,
     "h": 1505,
     "alt": "スルタンアフメット・モスク（ブルーモスク）の外観",
     "kind": "photo",
     "credit": {
      "by": "Moonik",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Exterior_of_Sultan_Ahmed_I_Mosque_in_Istanbul,_Turkey_001.JPG"
     }
    },
    "body": "スルタンのアフメト1世の命で1609年に建て始め、1617年にできたモスク。6本のミナレットが囲む。中は2万1,043枚のイズニックのタイルと、青の多い塗りの飾りで、これが「ブルーモスク」と呼ばれるわけの1つ。2023年4月に修復を終えて開き直した。",
    "facts": [
     {
      "label": "行きかた",
      "text": "トラムT1のスルタンアフメット駅から250m"
     },
     {
      "label": "入場",
      "text": "無料。5〜10月は9時〜21時、11〜4月は9時〜19時"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sultan+Ahmet+Camii+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Blue Mosque, Istanbul」",
      "url": "https://en.wikipedia.org/wiki/Blue_Mosque,_Istanbul",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Exterior_of_Sultan_Ahmed_I_Mosque_in_Istanbul,_Turkey_001.JPG",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.005384,
     "lon": 28.976853
    },
    "area": "oldcity"
   },
   {
    "id": "topkapi",
    "name": "トプカプ宮殿",
    "local": {
     "text": "Topkapı Sarayı",
     "lang": "tr",
     "roman": "Topkapi Sarayi"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/palacio-de-topkap-estambul-turqu-d8e2399b-960.webp",
     "small": "/guide/turkey/istanbul/photos/palacio-de-topkap-estambul-turqu-d8e2399b-500.webp",
     "w": 960,
     "h": 960,
     "alt": "トプカプ宮殿の建物",
     "kind": "photo",
     "credit": {
      "by": "Diego Delso (1974–)",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Palacio_de_Topkap%C4%B1,_Estambul,_Turqu%C3%ADa,_2024-09-30,_DD_90-92_HDR.jpg"
     }
    },
    "body": "メフメト2世が、コンスタンティノープルの征服から6年後の1459年に建て始めた宮殿。オスマン帝国の政治の中心で、スルタンの住まいだった。1924年に博物館になった。4つの中庭とハレムがあり、宝物館にはスプーン職人のダイヤモンドとトプカプの短剣が並ぶ。",
    "facts": [
     {
      "label": "行きかた",
      "text": "トラムT1のスルタンアフメット駅から650m"
     },
     {
      "label": "開いている日",
      "text": "水〜月曜の9時〜17時（火曜は休み）"
     },
     {
      "label": "入場料",
      "text": "宮殿・ハレム・アヤイリニの共通券で2,750リラ（約8,630円）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Topkap%C4%B1+Saray%C4%B1+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Topkapı Palace」",
      "url": "https://en.wikipedia.org/wiki/Topkap%C4%B1_Palace",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Palacio_de_Topkap%C4%B1,_Estambul,_Turqu%C3%ADa,_2024-09-30,_DD_90-92_HDR.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.01298,
     "lon": 28.984066
    },
    "area": "oldcity"
   },
   {
    "id": "cistern",
    "name": "地下宮殿（バシリカ・シスタン）",
    "local": {
     "text": "Yerebatan Sarnıcı",
     "lang": "tr",
     "roman": "Yerebatan Sarnici"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/basilica-cistern-medusa-head-bf685db1-960.webp",
     "small": "/guide/turkey/istanbul/photos/basilica-cistern-medusa-head-bf685db1-500.webp",
     "w": 960,
     "h": 640,
     "alt": "地下宮殿の柱の台に彫られたメドゥーサの顔",
     "kind": "photo",
     "credit": {
      "by": "Nan Palmero",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Basilica_Cistern_-_Medusa_head.jpg"
     }
    },
    "body": "6世紀にユスティニアヌス1世の時代に造った地下の貯水槽。広さは約138メートル×65メートルで、高さ9メートルの大理石の柱336本が天井を支える。北西の隅の2本の柱の台には、メドゥーサの顔が彫られている。トルコ語の名前は「地下の宮殿」の意味。",
    "facts": [
     {
      "label": "行きかた",
      "text": "イェレバタン通り1/3番。トラムT1のスルタンアフメット駅から260m"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Yerebatan+Sarn%C4%B1c%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "cistern"
    ],
    "src": [
     {
      "name": "Wikipedia「Basilica Cistern」",
      "url": "https://en.wikipedia.org/wiki/Basilica_Cistern",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Basilica_Cistern_-_Medusa_head.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.008479,
     "lon": 28.978383
    },
    "area": "oldcity"
   },
   {
    "id": "bazaar",
    "name": "グランドバザール",
    "local": {
     "text": "Kapalıçarşı",
     "lang": "tr",
     "roman": "Kapalicarsi"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/istanbul-grand-bazaar-5510599079-0714fe93-960.webp",
     "small": "/guide/turkey/istanbul/photos/istanbul-grand-bazaar-5510599079-0714fe93-500.webp",
     "w": 960,
     "h": 540,
     "alt": "グランドバザールの中の通り",
     "kind": "photo",
     "credit": {
      "by": "Jorge Franganillo",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Istanbul_-_Grand_Bazaar_(55105990794).jpg"
     }
    },
    "body": "1455〜1456年の冬に建て始めた屋根つきの市場。61本の屋根のある通りに4,000を超える店が並び、広さは3万700平方メートル。1日に25万〜40万人が訪れる。まん中の古い建物は、宝石と高い品を扱ったジェヴァーヒル・ベデステン。",
    "facts": [
     {
      "label": "行きかた",
      "text": "トラムT1のベヤズット駅"
     },
     {
      "label": "開いている日",
      "text": "月〜土曜の9時〜19時。日曜と祝日は休み"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kapal%C4%B1%C3%A7ar%C5%9F%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "bazaar"
    ],
    "src": [
     {
      "name": "Wikipedia「Grand Bazaar, Istanbul」",
      "url": "https://en.wikipedia.org/wiki/Grand_Bazaar,_Istanbul",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Istanbul_-_Grand_Bazaar_(55105990794).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.010954,
     "lon": 28.968022
    },
    "area": "oldcity"
   },
   {
    "id": "spice",
    "name": "エジプシャン・バザール（スパイス・バザール）",
    "local": {
     "text": "Mısır Çarşısı",
     "lang": "tr",
     "roman": "Misir Carsisi"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/interior-of-spice-bazaar-misir-c-e4568763-960.webp",
     "small": "/guide/turkey/istanbul/photos/interior-of-spice-bazaar-misir-c-e4568763-500.webp",
     "w": 960,
     "h": 1440,
     "alt": "エジプシャン・バザールの中",
     "kind": "photo",
     "credit": {
      "by": "Tarikkaanmuslu",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Interior_of_Spice_Bazaar_(Misir_Carsisi),_Istanbul_-_Tarik_Kaan_Muslu.jpg"
     }
    },
    "body": "エミノニュの市場。1660年にイェニ・モスクの一角として建て始めた。名前は「エジプトの市場」の意味で、建てるお金がエジプトの州の税から出たためとされる。85の店に、スパイス・ロクム・ドライフルーツ・ナッツが並ぶ。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "毎日8時〜19時30分"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%B1s%C4%B1r+%C3%87ar%C5%9F%C4%B1s%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "bazaar"
    ],
    "src": [
     {
      "name": "Wikipedia「Spice Bazaar」",
      "url": "https://en.wikipedia.org/wiki/Spice_Bazaar",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Interior_of_Spice_Bazaar_(Misir_Carsisi),_Istanbul_-_Tarik_Kaan_Muslu.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.016479,
     "lon": 28.970538
    },
    "area": "oldcity"
   },
   {
    "id": "galata",
    "name": "ガラタ塔",
    "local": {
     "text": "Galata Kulesi",
     "lang": "tr",
     "roman": "Galata Kulesi"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/galata-tower-january-2015-6fc2a516-960.webp",
     "small": "/guide/turkey/istanbul/photos/galata-tower-january-2015-6fc2a516-500.webp",
     "w": 960,
     "h": 1885,
     "alt": "ガラタ塔",
     "kind": "photo",
     "credit": {
      "by": "Martin Falbisoner",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Galata_Tower_January_2015.JPG"
     }
    },
    "body": "ジェノヴァ人が14世紀に、ガラタの城壁のいちばん高い所に建てた塔。高さは屋根の先まで62.59メートルで、8階が展望のテラス。2020年10月6日に修復を終えて「ガラタ塔博物館」として開き直した。",
    "facts": [
     {
      "label": "行きかた",
      "text": "メトロM2のシシハーネ駅から500m"
     },
     {
      "label": "開いている時間",
      "text": "毎日8時30分〜23時（最後の入場は22時）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Galata+Kulesi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Galata Tower」",
      "url": "https://en.wikipedia.org/wiki/Galata_Tower",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Galata」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Galata",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Galata_Tower_January_2015.JPG",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.025641,
     "lon": 28.974213
    },
    "area": "beyoglu"
   },
   {
    "id": "suleymaniye",
    "name": "スレイマニエ・モスク",
    "local": {
     "text": "Süleymaniye Camii",
     "lang": "tr",
     "roman": "Suleymaniye Camii"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/suleymaniye-mosque-february-2013-620e8f2c-960.webp",
     "small": "/guide/turkey/istanbul/photos/suleymaniye-mosque-february-2013-620e8f2c-500.webp",
     "w": 960,
     "h": 704,
     "alt": "スレイマニエ・モスク",
     "kind": "photo",
     "credit": {
      "by": "Arild Vågen",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:S%C3%BCleymaniye_Mosque_February_2013_01.jpg"
     }
    },
    "body": "スレイマン1世の命で、宮廷の建築家ミマール・スィナンが建てたモスク。1550年に礎を置き、1557年に開いた。第3の丘の上に立ち、金角湾を広く見下ろす。オスマン帝国の時代のモスクでは市内でいちばん大きい。裏の墓地にスレイマン1世と妻ヒュッレムの廟がある。",
    "facts": [
     {
      "label": "行きかた",
      "text": "メトロM2のヴェズネジレル駅から750m"
     },
     {
      "label": "入場",
      "text": "無料。土〜木曜は8時30分〜17時、金曜は8時30分〜13時30分"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=S%C3%BCleymaniye+Camii+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Süleymaniye Mosque」",
      "url": "https://en.wikipedia.org/wiki/S%C3%BCleymaniye_Mosque",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:S%C3%BCleymaniye_Mosque_February_2013_01.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.016229,
     "lon": 28.963955
    },
    "area": "oldcity"
   },
   {
    "id": "hippodrome",
    "name": "ヒッポドローム（スルタンアフメット広場）",
    "local": {
     "text": "Sultanahmet Meydanı",
     "lang": "tr",
     "roman": "Sultanahmet Meydani"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/obelisk-of-theodosius-hippodrome-22d4a72a-960.webp",
     "small": "/guide/turkey/istanbul/photos/obelisk-of-theodosius-hippodrome-22d4a72a-500.webp",
     "w": 960,
     "h": 640,
     "alt": "ヒッポドロームのテオドシウスのオベリスク",
     "kind": "photo",
     "credit": {
      "by": "Ank Kumar",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Obelisk_of_Theodosius,_Hippodrome_of_Constantinople,_Istanbul,_Turkey_(Ank_Kumar)_02.jpg"
     }
    },
    "body": "東ローマ帝国の都の戦車競走の場で、街の社交の中心だった所。いまはスルタンアフメット広場。テオドシウス1世が390年にエジプトのカルナックから運んだオベリスク、デルフォイの蛇の柱、10世紀の切り石のオベリスクが残る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sultanahmet+Meydan%C4%B1+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Hippodrome of Constantinople」",
      "url": "https://en.wikipedia.org/wiki/Hippodrome_of_Constantinople",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Obelisk_of_Theodosius,_Hippodrome_of_Constantinople,_Istanbul,_Turkey_(Ank_Kumar)_02.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.006516,
     "lon": 28.975977
    },
    "area": "oldcity"
   },
   {
    "id": "archaeology",
    "name": "イスタンブール考古学博物館",
    "local": {
     "text": "İstanbul Arkeoloji Müzeleri",
     "lang": "tr",
     "roman": "Istanbul Arkeoloji Muzeleri"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/gate-of-istanbul-archaeological-a72fae44-960.webp",
     "small": "/guide/turkey/istanbul/photos/gate-of-istanbul-archaeological-a72fae44-500.webp",
     "w": 960,
     "h": 720,
     "alt": "イスタンブール考古学博物館の門",
     "kind": "photo",
     "credit": {
      "by": "Antoloji",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Gate_of_Istanbul_Archaeological_Museums.jpg"
     }
    },
    "body": "ギュルハネ公園とトプカプ宮殿のそばに並ぶ、3つの考古学の博物館。1891年に開き、館長のオスマン・ハムディ・ベイが作った。100万点を超える品を持ち、シドンの王の墓所から出た「アレキサンダー大王の石棺」が知られる。",
    "facts": [
     {
      "label": "行きかた",
      "text": "トラムT1のギュルハネ駅から350m"
     },
     {
      "label": "開いている時間",
      "text": "毎日9時〜17時30分。入場料は大人15ユーロ（約2,620円）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%B0stanbul+Arkeoloji+M%C3%BCzeleri&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Istanbul Archaeology Museums」",
      "url": "https://en.wikipedia.org/wiki/Istanbul_Archaeology_Museums",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Gate_of_Istanbul_Archaeological_Museums.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.011699,
     "lon": 28.981323
    },
    "area": "oldcity"
   },
   {
    "id": "rustem",
    "name": "リュステム・パシャ・モスク",
    "local": {
     "text": "Rüstem Paşa Camii",
     "lang": "tr",
     "roman": "Rustem Pasa Camii"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/rustem-pasha-mosque-mihrab-tiles-7515e3d6-960.webp",
     "small": "/guide/turkey/istanbul/photos/rustem-pasha-mosque-mihrab-tiles-7515e3d6-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "リュステム・パシャ・モスクのミフラーブのまわりのタイル",
     "kind": "photo",
     "credit": {
      "by": "R Prazeres",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Rustem_Pasha_Mosque_mihrab_tiles_DSCF2406.jpg"
     }
    },
    "body": "大宰相リュステム・パシャのために、ミマール・スィナンが建てたモスク。1561〜1563年ごろの建物とされる。中の壁の多くを、花と幾何学の模様のイズニックのタイルが覆う。エジプシャン・バザールのそばで、店の並ぶ丸天井の上の高い台に建つ。",
    "facts": [
     {
      "label": "行きかた",
      "text": "ハスルジュラル通り62番。トラムT1のエミノニュ駅から450m。入場は無料"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=R%C3%BCstem+Pa%C5%9Fa+Camii+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Rüstem Pasha Mosque」",
      "url": "https://en.wikipedia.org/wiki/R%C3%BCstem_Pasha_Mosque",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Rustem_Pasha_Mosque_mihrab_tiles_DSCF2406.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.017665,
     "lon": 28.968699
    },
    "area": "oldcity"
   },
   {
    "id": "istiklal",
    "name": "イスティクラル通り",
    "local": {
     "text": "İstiklal Caddesi",
     "lang": "tr",
     "roman": "Istiklal Caddesi"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/nostalgictramistiklalavenue-c8ac276d-960.webp",
     "small": "/guide/turkey/istanbul/photos/nostalgictramistiklalavenue-c8ac276d-500.webp",
     "w": 960,
     "h": 636,
     "alt": "イスティクラル通りを走るノスタルジック・トラム",
     "kind": "photo",
     "credit": {
      "by": "CeeGee",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:NostalgicTram%C4%B0stiklalAvenue.jpg"
     }
    },
    "body": "タクシム広場からガラタサライ広場を通ってテュネル広場まで、約2キロの歩行者の通り。1992年に車が通れなくなり、新しく敷いた線路を1920年代の車両のノスタルジック・トラム（T2）が走る。",
    "facts": [
     {
      "label": "乗り物",
      "text": "テュネル広場とカラキョイを結ぶ地下のケーブルカーF2（1875年から）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%B0stiklal+Caddesi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Istanbul/Galata」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Galata",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:NostalgicTram%C4%B0stiklalAvenue.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.033861,
     "lon": 28.978167
    },
    "line": "中心から2.8km",
    "area": "beyoglu"
   },
   {
    "id": "galatabridge",
    "name": "ガラタ橋",
    "local": {
     "text": "Galata Köprüsü",
     "lang": "tr",
     "roman": "Galata Koprusu"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/fishermen-on-galata-bridge-52ec6a61-960.webp",
     "small": "/guide/turkey/istanbul/photos/fishermen-on-galata-bridge-52ec6a61-500.webp",
     "w": 960,
     "h": 633,
     "alt": "ガラタ橋の釣り人たち",
     "kind": "photo",
     "credit": {
      "by": "Martin Falbisoner",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Fishermen_on_Galata_Bridge.JPG"
     }
    },
    "body": "金角湾をまたいで、エミノニュとカラキョイを結ぶ長さ490メートルの橋。いまの橋はこの場所の5代目で、1994年12月にできた。",
    "facts": [
     {
      "label": "歩いて",
      "text": "エミノニュから橋を歩いてカラキョイ（ガラタ）の側へ渡れる"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Galata+K%C3%B6pr%C3%BCs%C3%BC+%C4%B0stanbul&hl=ja",
    "todo": [
     "balik"
    ],
    "src": [
     {
      "name": "Wikipedia「Galata Bridge」",
      "url": "https://en.wikipedia.org/wiki/Galata_Bridge",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Galata」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Galata",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Fishermen_on_Galata_Bridge.JPG",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.020006,
     "lon": 28.973121
    }
   },
   {
    "id": "dolmabahce",
    "name": "ドルマバフチェ宮殿",
    "local": {
     "text": "Dolmabahçe Sarayı",
     "lang": "tr",
     "roman": "Dolmabahce Sarayi"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/palacio-de-dolmabahce-estambul-t-51e8a3e0-960.webp",
     "small": "/guide/turkey/istanbul/photos/palacio-de-dolmabahce-estambul-t-51e8a3e0-500.webp",
     "w": 960,
     "h": 607,
     "alt": "ドルマバフチェ宮殿",
     "kind": "photo",
     "credit": {
      "by": "Diego Delso (1974–)",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Palacio_de_Dolmabah%C3%A7e,_Estambul,_Turqu%C3%ADa,_2024-09-28,_DD_110.jpg"
     }
    },
    "body": "スルタンのアブデュルメジト1世の命で1843〜1853年に建てた宮殿。ボスポラス海峡のヨーロッパ側の岸、ベシクタシュにある。285の部屋と46の広間を持ち、天井の金箔に14トンの金を使った。儀式の間には、750の灯りを持つ重さ4.5トンの世界でいちばん大きなクリスタルのシャンデリア。1938年11月10日の9時5分にアタテュルクがここで亡くなり、部屋の時計はその時刻のまま。",
    "facts": [
     {
      "label": "開いている日",
      "text": "火〜日曜の9時〜17時（月曜は休み）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dolmabah%C3%A7e+Saray%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "bosphorus"
    ],
    "src": [
     {
      "name": "Wikipedia「Dolmabahçe Palace」",
      "url": "https://en.wikipedia.org/wiki/Dolmabah%C3%A7e_Palace",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/European Bosphorus」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/European_Bosphorus",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Palacio_de_Dolmabah%C3%A7e,_Estambul,_Turqu%C3%ADa,_2024-09-28,_DD_110.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.038961,
     "lon": 28.999773
    },
    "line": "中心から3.8km"
   },
   {
    "id": "ortakoy",
    "name": "オルタキョイ・モスク",
    "local": {
     "text": "Ortaköy Camii",
     "lang": "tr",
     "roman": "Ortakoy Camii"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/ortakoy-mosque-and-bosphorus-bri-2fbfcb03-960.webp",
     "small": "/guide/turkey/istanbul/photos/ortakoy-mosque-and-bosphorus-bri-2fbfcb03-500.webp",
     "w": 960,
     "h": 720,
     "alt": "オルタキョイ・モスクとボスポラス橋",
     "kind": "photo",
     "credit": {
      "by": "Calistemon",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ortak%C3%B6y_Mosque_and_Bosphorus_Bridge,_March_2024_01.jpg"
     }
    },
    "body": "ボスポラス海峡の岸、ボスポラス橋のたもとに立つモスク。アブデュルメジト1世の命で、ドルマバフチェ宮殿と同じバルヤン家の父子が設計し、1854年か1856年ごろにできた。まわりのオルタキョイは、カフェが並ぶ地区で、具をたくさんのせた焼きじゃがいも「クンピル」の店がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ortak%C3%B6y+Camii+%C4%B0stanbul&hl=ja",
    "todo": [
     "bosphorus"
    ],
    "src": [
     {
      "name": "Wikipedia「Ortaköy Mosque」",
      "url": "https://en.wikipedia.org/wiki/Ortak%C3%B6y_Mosque",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/European Bosphorus」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/European_Bosphorus",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Ortak%C3%B6y_Mosque_and_Bosphorus_Bridge,_March_2024_01.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.047287,
     "lon": 29.026772
    },
    "line": "中心から5.8km"
   },
   {
    "id": "maiden",
    "name": "乙女の塔（クズ・クレスィ）",
    "local": {
     "text": "Kız Kulesi",
     "lang": "tr",
     "roman": "Kiz Kulesi"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/maiden-tower-istanbul-p1100204-201b077c-960.webp",
     "small": "/guide/turkey/istanbul/photos/maiden-tower-istanbul-p1100204-201b077c-500.webp",
     "w": 960,
     "h": 720,
     "alt": "乙女の塔",
     "kind": "photo",
     "credit": {
      "by": "Matti Blume",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Maiden_tower,_Istanbul_(P1100204).jpg"
     }
    },
    "body": "ボスポラス海峡の南の入口、アジア側のユスキュダルの岸から約200メートルの小島に立つ塔。1110年に皇帝アレクシオス1世が木の塔を建て、いまの石の塔は1763年のもの。2021年に修復を始め、2023年5月に開き直した。皇帝の娘が蛇にかまれる言い伝えがある。",
    "facts": [
     {
      "label": "渡りかた",
      "text": "岸との間を小舟が一日じゅう行き来する"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=K%C4%B1z+Kulesi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Maiden's Tower」",
      "url": "https://en.wikipedia.org/wiki/Maiden%27s_Tower",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Maiden_tower,_Istanbul_(P1100204).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.021049,
     "lon": 29.004132
    }
   },
   {
    "id": "kadikoy",
    "name": "カドゥキョイの魚市場（バルック・パザル）",
    "local": {
     "text": "Kadıköy Balık Pazarı",
     "lang": "tr",
     "roman": "Kadikoy Balik Pazari"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/kadkoy-market-stall-istanbul-d78816b8-960.webp",
     "small": "/guide/turkey/istanbul/photos/kadkoy-market-stall-istanbul-d78816b8-500.webp",
     "w": 960,
     "h": 640,
     "alt": "カドゥキョイの市場の店先",
     "kind": "photo",
     "credit": {
      "by": "Jwslubbock",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Kad%C4%B1k%C3%B6y_market_stall,_Istanbul.jpg"
     }
    },
    "body": "アジア側のカドゥキョイの船着き場のそばの市場の通り。魚市場は新しい魚と海の幸が中心で、上の通りには香草の店や古本屋も並ぶ。",
    "facts": [
     {
      "label": "行きかた",
      "text": "ヨーロッパ側のエミノニュ・カラキョイ・ベシクタシュから船が出る"
     },
     {
      "label": "開いている時間",
      "text": "毎日9時〜20時30分"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kad%C4%B1k%C3%B6y+Bal%C4%B1k+Pazar%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "ferry"
    ],
    "src": [
     {
      "name": "Wikivoyage「Istanbul/Kadıköy」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Kad%C4%B1k%C3%B6y",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Kad%C4%B1k%C3%B6y_market_stall,_Istanbul.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.992908,
     "lon": 29.022868
    },
    "line": "中心から4km",
    "area": "asian"
   },
   {
    "id": "balat",
    "name": "バラット",
    "local": {
     "text": "Balat",
     "lang": "tr",
     "roman": "Balat"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/colorful-balat-houses-345d94e9-960.webp",
     "small": "/guide/turkey/istanbul/photos/colorful-balat-houses-345d94e9-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "バラットの色とりどりの家",
     "kind": "photo",
     "credit": {
      "by": "Antoloji",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Colorful_Balat_houses.jpg"
     }
    },
    "body": "金角湾の西の岸の地区。昔はユダヤ人の暮らしの中心で、ギリシャ人やアルメニア人も住んだ。明るい色に塗り直した家が並び、2020年代に旅行者でいちばんにぎわう一帯の1つになった。15世紀に開いたアフリダ・シナゴーグがある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Balat+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Balat, Fatih」",
      "url": "https://en.wikipedia.org/wiki/Balat,_Fatih",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Colorful_Balat_houses.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.032003,
     "lon": 28.948293
    },
    "line": "中心から3.7km"
   },
   {
    "id": "chora",
    "name": "カーリエ・モスク（コーラ修道院）",
    "local": {
     "text": "Kariye Camii",
     "lang": "tr",
     "roman": "Kariye Camii"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/genealogy-of-mary-mosaic-chora-c-bb2530b0-960.webp",
     "small": "/guide/turkey/istanbul/photos/genealogy-of-mary-mosaic-chora-c-bb2530b0-500.webp",
     "w": 960,
     "h": 640,
     "alt": "コーラ修道院のモザイク「聖母の系譜」",
     "kind": "photo",
     "credit": {
      "by": "Till Niermann",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Genealogy_of_Mary_mosaic,_Chora_church,_Istanbul.jpg"
     }
    },
    "body": "ビザンティン末期のモザイクとフレスコ画で知られる、もとの教会。中の絵は、テオドロス・メトキテスがお金を出して1310〜1317年ごろに作らせた。1945年に博物館に決まり、2020年8月にモスクに戻って、2024年5月6日に礼拝の場として開いた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kariye+Camii+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Chora Church」",
      "url": "https://en.wikipedia.org/wiki/Chora_Church",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Genealogy_of_Mary_mosaic,_Chora_church,_Istanbul.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.031214,
     "lon": 28.938955
    },
    "line": "中心から4.3km"
   },
   {
    "id": "pierreloti",
    "name": "ピエール・ロティの丘",
    "local": {
     "text": "Piyer Loti Tepesi",
     "lang": "tr",
     "roman": "Piyer Loti Tepesi"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/golden-horn-panorama-from-pierre-414dad61-960.webp",
     "small": "/guide/turkey/istanbul/photos/golden-horn-panorama-from-pierre-414dad61-500.webp",
     "w": 960,
     "h": 540,
     "alt": "ピエール・ロティの丘から見た金角湾",
     "kind": "photo",
     "credit": {
      "by": "Kurmanbek",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Golden_Horn_panorama_from_Pierre_Loti_Hill.jpg"
     }
    },
    "body": "エユップにある、金角湾を見下ろす丘の上の屋外のカフェ。丘へはロープウェイが5分おきに出る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pierre+Loti+Tepesi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Istanbul/Golden Horn」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Golden_Horn",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Golden_Horn_panorama_from_Pierre_Loti_Hill.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.053291,
     "lon": 28.933368
    },
    "line": "中心から6.3km"
   },
   {
    "id": "rumeli",
    "name": "ルメリ・ヒサール",
    "local": {
     "text": "Rumelihisarı",
     "lang": "tr",
     "roman": "Rumelihisari"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/rumelihisar-8393629929-edf287c2-960.webp",
     "small": "/guide/turkey/istanbul/photos/rumelihisar-8393629929-edf287c2-500.webp",
     "w": 960,
     "h": 638,
     "alt": "ルメリ・ヒサール",
     "kind": "photo",
     "credit": {
      "by": "Jorge Láscar from Australia",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Rumelihisar%C4%B1_(8393629929).jpg"
     }
    },
    "body": "15世紀の前半に建った大きな城塞。第2ボスポラス橋のたもとにある。",
    "facts": [
     {
      "label": "開いている日",
      "text": "9時〜17時（月曜は休み）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Rumelihisar%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "bosphorus"
    ],
    "src": [
     {
      "name": "Wikivoyage「Istanbul/European Bosphorus」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/European_Bosphorus",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Rumelihisar%C4%B1_(8393629929).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.084917,
     "lon": 29.056712
    },
    "line": "中心から11km"
   },
   {
    "id": "beylerbeyi",
    "name": "ベイレルベイ宮殿",
    "local": {
     "text": "Beylerbeyi Sarayı",
     "lang": "tr",
     "roman": "Beylerbeyi Sarayi"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/beylerbeyi-palace-wide-94917deb-960.webp",
     "small": "/guide/turkey/istanbul/photos/beylerbeyi-palace-wide-94917deb-500.webp",
     "w": 960,
     "h": 339,
     "alt": "ベイレルベイ宮殿",
     "kind": "photo",
     "credit": {
      "by": "Eusebius",
      "lic": "CC BY 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Beylerbeyi_Palace_-_wide.jpg"
     }
    },
    "body": "ボスポラス海峡のアジア側の岸に、スルタンのアブデュルアズィズのため1861〜1865年に建てた宮殿。設計はバルヤン家のサルキス・バルヤン。夏の住まいで、外国の元首を迎える場にも使い、フランスの皇后ウジェニーも訪れた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Beylerbeyi+Saray%C4%B1+%C4%B0stanbul&hl=ja",
    "todo": [
     "bosphorus"
    ],
    "src": [
     {
      "name": "Wikipedia「Beylerbeyi Palace」",
      "url": "https://en.wikipedia.org/wiki/Beylerbeyi_Palace",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Beylerbeyi_Palace_-_wide.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.042718,
     "lon": 29.040036
    },
    "line": "中心から6.3km"
   },
   {
    "id": "buyukada",
    "name": "ビュユック島（プリンスィズ諸島）",
    "local": {
     "text": "Büyükada",
     "lang": "tr",
     "roman": "Buyukada"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/turkey/istanbul/photos/buyukada-of-prince-islands-in-is-16b2dd86-960.webp",
     "small": "/guide/turkey/istanbul/photos/buyukada-of-prince-islands-in-is-16b2dd86-500.webp",
     "w": 960,
     "h": 640,
     "alt": "ビュユック島",
     "kind": "photo",
     "credit": {
      "by": "Ozalphakan2",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Buyukada_of_Prince_Islands_in_Istanbul.jpg"
     }
    },
    "body": "マルマラ海のプリンスィズ諸島でいちばん大きい島（約5.4平方キロメートル）。2020年まで乗り物は馬車だけで、馬は電気の車に替わった。大きな丘ユジェテペの上に、聖ゲオルギオスのギリシャ正教の修道院がある。トロツキーが1929年4月から1933年7月まで亡命して暮らした。",
    "facts": [
     {
      "label": "行きかた",
      "text": "ヨーロッパ側のエミノニュ・カバタシュ、アジア側のカドゥキョイ・ボスタンジュから、シェヒル・ハトラルの船が出る"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=B%C3%BCy%C3%BCkada+%C4%B0stanbul&hl=ja",
    "todo": [
     "islands"
    ],
    "src": [
     {
      "name": "Wikipedia「Büyükada」",
      "url": "https://en.wikipedia.org/wiki/B%C3%BCy%C3%BCkada",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Buyukada_of_Prince_Islands_in_Istanbul.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.856355,
     "lon": 29.119037
    },
    "line": "中心から21km"
   }
  ],
  "far": [
   {
    "id": "istiklal",
    "name": "イスティクラル通り",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%B0stiklal+Caddesi+%C4%B0stanbul&hl=ja",
    "km": 2.8
   },
   {
    "id": "dolmabahce",
    "name": "ドルマバフチェ宮殿",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Dolmabah%C3%A7e+Saray%C4%B1+%C4%B0stanbul&hl=ja",
    "km": 3.8
   },
   {
    "id": "ortakoy",
    "name": "オルタキョイ・モスク",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ortak%C3%B6y+Camii+%C4%B0stanbul&hl=ja",
    "km": 5.8
   },
   {
    "id": "kadikoy",
    "name": "カドゥキョイの魚市場",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kad%C4%B1k%C3%B6y+Bal%C4%B1k+Pazar%C4%B1+%C4%B0stanbul&hl=ja",
    "km": 4.0
   },
   {
    "id": "balat",
    "name": "バラット",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Balat+%C4%B0stanbul&hl=ja",
    "km": 3.7
   },
   {
    "id": "chora",
    "name": "カーリエ・モスク",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kariye+Camii+%C4%B0stanbul&hl=ja",
    "km": 4.3
   },
   {
    "id": "pierreloti",
    "name": "ピエール・ロティの丘",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Pierre+Loti+Tepesi+%C4%B0stanbul&hl=ja",
    "km": 6.3
   },
   {
    "id": "rumeli",
    "name": "ルメリ・ヒサール",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Rumelihisar%C4%B1+%C4%B0stanbul&hl=ja",
    "km": 11
   },
   {
    "id": "beylerbeyi",
    "name": "ベイレルベイ宮殿",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Beylerbeyi+Saray%C4%B1+%C4%B0stanbul&hl=ja",
    "km": 6.3
   },
   {
    "id": "buyukada",
    "name": "ビュユック島",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=B%C3%BCy%C3%BCkada+%C4%B0stanbul&hl=ja",
    "km": 21
   }
  ],
  "map": {
   "mid": "18_UNS6v0rRg0ZCyiuwNh7kq2rYbEhew",
   "title": "イスタンブール｜見たいもの",
   "ll": "41.0155,28.9840",
   "z": 13,
   "pins": 23
  }
 },
 "eat": {
  "kinds": [
   {
    "id": "local",
    "label": "トルコの料理"
   },
   {
    "id": "quick",
    "label": "安く手早く"
   },
   {
    "id": "sweets",
    "label": "甘いもの"
   },
   {
    "id": "drinks",
    "label": "飲み物"
   }
  ],
  "items": [
   {
    "id": "doner",
    "name": "ドネル・ケバブ",
    "local": {
     "text": "Döner kebap",
     "lang": "tr",
     "roman": "Döner kebap"
    },
    "body": "縦に回る串で焼いた肉を、焼けたところから薄く削ぐ。パンに挟むか、薄いパンで巻いたデュリュムにする。",
    "facts": [
     {
      "label": "豚肉",
      "text": "肉は羊・牛・鶏が多く、豚はまれ。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=D%C3%B6ner+kebap+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Doner kebab」",
      "url": "https://en.wikipedia.org/wiki/Doner_kebab",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "iskender",
    "name": "イスケンデル・ケバブ",
    "local": {
     "text": "İskender kebap",
     "lang": "tr",
     "roman": "İskender kebap"
    },
    "body": "ドネル・ケバブに、ヨーグルト・トマトのソース・バターをかけた料理。ブルサ生まれ。",
    "facts": [
     {
      "label": "どこで",
      "text": "ケバプチュ・イスケンデル ニシャンタシュ店（イスケンデル・ケバブ）"
     },
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%B0skender+kebap+%C4%B0stanbul&hl=ja",
    "places": [
     "iskender"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "adana",
    "name": "アダナ・ケバブ",
    "local": {
     "text": "Adana kebap",
     "lang": "tr",
     "roman": "Adana kebap"
    },
    "body": "手で刻んだ肉に唐辛子を混ぜ、平たい幅広の鉄の串に付けて焼くケバブ。",
    "facts": [
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Adana+kebap+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kofte",
    "name": "キョフテ（トルコの肉団子）",
    "local": {
     "text": "Köfte",
     "lang": "tr",
     "roman": "Köfte"
    },
    "body": "トルコの肉料理の1つ。ハジュ・アブドゥッラーの献立には、焼いたキョフテとチーズ入りのキョフテがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・アブドゥッラー（トルコ料理の食堂）"
     },
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=K%C3%B6fte+%C4%B0stanbul&hl=ja",
    "places": [
     "haciabdullah"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Hacı Abdullah「Menü」（店のサイトの献立）",
      "url": "https://haciabdullah.com.tr/menu/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "lahmacun",
    "name": "ラフマジュン（ひき肉をのせた薄いパン）",
    "local": {
     "text": "Lahmacun",
     "lang": "tr",
     "roman": "Lahmacun"
    },
    "body": "薄いパンの生地に、香辛料を混ぜたひき肉を薄くのせて焼く。",
    "facts": [
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Lahmacun+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "pide",
    "name": "ピデ（平たいパン）",
    "local": {
     "text": "Pide",
     "lang": "tr",
     "roman": "Pide"
    },
    "body": "小麦粉で作る、平たく広いパン。",
    "facts": [
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pide+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "manti",
    "name": "マントゥ（肉を包んだ小さな生地）",
    "local": {
     "text": "Mantı",
     "lang": "tr",
     "roman": "Mantı"
    },
    "body": "ひき肉を包んで三角に折った小さな生地。",
    "facts": [
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mant%C4%B1+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "sarma",
    "name": "ヤプラック・サルマ（ぶどうの葉の包み）",
    "local": {
     "text": "Yaprak sarma",
     "lang": "tr",
     "roman": "Yaprak sarma"
    },
    "body": "ぶどうの葉で、肉と米を包む。ハジュ・アブドゥッラーの献立には、ぶどうの葉とキャベツのサルマがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・アブドゥッラー（トルコ料理の食堂）"
     },
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Yaprak+sarma+%C4%B0stanbul&hl=ja",
    "places": [
     "haciabdullah"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Hacı Abdullah「Menü」（店のサイトの献立）",
      "url": "https://haciabdullah.com.tr/menu/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "mercimek",
    "name": "メルジメッキ・チョルバス（レンズ豆のスープ）",
    "local": {
     "text": "Mercimek çorbası",
     "lang": "tr",
     "roman": "Mercimek çorbası"
    },
    "body": "レンズ豆のスープ。食堂の定番の料理の1つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mercimek+%C3%A7orbas%C4%B1+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kahvalti",
    "name": "カフヴァルトゥ（トルコの朝ごはん）",
    "local": {
     "text": "Kahvaltı",
     "lang": "tr",
     "roman": "Kahvaltı"
    },
    "body": "品数の多いトルコの朝ごはん。「カフヴァルトゥ」は「コーヒーの前」の意味。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kahvalt%C4%B1+%C4%B0stanbul&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "balik-ekmek",
    "name": "サバサンド（バルック・エキメッキ）",
    "local": {
     "text": "Balık ekmek",
     "lang": "tr",
     "roman": "Balık ekmek"
    },
    "body": "焼くか揚げた魚（多くはサバ）を、野菜といっしょにトルコのパンに挟む。エミノニュの名物。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bal%C4%B1k+ekmek+%C4%B0stanbul&hl=ja",
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Balık ekmek」",
      "url": "https://en.wikipedia.org/wiki/Bal%C4%B1k_ekmek",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "midye",
    "name": "ミディエ・ドルマ（ムール貝の詰めもの）",
    "local": {
     "text": "Midye dolma",
     "lang": "tr",
     "roman": "Midye dolma"
    },
    "body": "詰めものをしたムール貝。揚げたムール貝もある。「ドルマ」は「詰めたもの」の意味。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Midye+dolma+%C4%B0stanbul&hl=ja",
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "simit",
    "name": "スィミット（ごまのパン）",
    "local": {
     "text": "Simit",
     "lang": "tr",
     "roman": "Simit"
    },
    "body": "ごまをまぶした輪の形のパン。街なかで売る軽食。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Simit+%C4%B0stanbul&hl=ja",
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kumpir",
    "name": "クンピル（具だくさんの焼きじゃがいも）",
    "local": {
     "text": "Kumpir",
     "lang": "tr",
     "roman": "Kumpir"
    },
    "body": "焼いたじゃがいもに、カシャルのチーズとたくさんの具をのせる。オルタキョイの名物。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kumpir+%C4%B0stanbul&hl=ja",
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/European Bosphorus」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/European_Bosphorus",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "islak",
    "name": "ウスラック・ハンバーガー（濡れたハンバーガー）",
    "local": {
     "text": "Islak hamburger",
     "lang": "tr",
     "roman": "Islak hamburger"
    },
    "body": "香辛料で味を付けた肉のパテと、特製のソースを挟んだハンバーガー。タクシムのクズルカヤラルが考えた。",
    "facts": [
     {
      "label": "どこで",
      "text": "クズルカヤラル タクシム店（ウスラック・ハンバーガー）"
     },
     {
      "label": "豚肉",
      "text": "トルコでは豚肉は一部の店にあるだけで、ふだんはあまり食べない（ムスリムが多いため）。肉の種類は店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Islak+hamburger+%C4%B0stanbul&hl=ja",
    "places": [
     "kizilkayalar"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Kızılkayalar「Islak Hamburger」（店のサイト）",
      "url": "https://kizilkayalar.com.tr/islak-hamburger/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "baklava",
    "name": "バクラヴァ",
    "local": {
     "text": "Baklava",
     "lang": "tr",
     "roman": "Baklava"
    },
    "body": "ピスタチオかくるみで作る菓子。カラキョイ・ギュルルオウルの品の一覧には、ピスタチオ・くるみ・ヘーゼルナッツ・アーモンドのバクラヴァ。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラキョイ・ギュルルオウル（バクラヴァ）・ハフズ・ムスタファ 1864（エミノニュの菓子店）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Baklava+%C4%B0stanbul&hl=ja",
    "places": [
     "gulluoglu",
     "hafiz"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Karaköy Güllüoğlu（店のサイトの品の一覧）",
      "url": "https://www.karakoygulluoglu.com/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "lokum",
    "name": "ロクム（ターキッシュ・ディライト）",
    "local": {
     "text": "Lokum",
     "lang": "tr",
     "roman": "Lokum"
    },
    "body": "食後の消化のために食べられてきた菓子。ハジュ・ベキルは1777年からロクムを作る。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・ベキル バフチェカプ店（ロクムの老舗）・ハフズ・ムスタファ 1864（エミノニュの菓子店）・カラキョイ・ギュルルオウル（バクラヴァ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Lokum+%C4%B0stanbul&hl=ja",
    "places": [
     "hacibekir",
     "hafiz",
     "gulluoglu"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Hacı Bekir（店のサイト）",
      "url": "https://www.hacibekir.com/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kunefe",
    "name": "キュネフェ（チーズの焼き菓子）",
    "local": {
     "text": "Künefe",
     "lang": "tr",
     "roman": "Künefe"
    },
    "body": "細い糸の生地カダイフで、溶けたチーズを挟んで焼く。ハジュ・アブドゥッラーの献立にある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・アブドゥッラー（トルコ料理の食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=K%C3%BCnefe+%C4%B0stanbul&hl=ja",
    "places": [
     "haciabdullah"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Hacı Abdullah「Menü」（店のサイトの献立）",
      "url": "https://haciabdullah.com.tr/menu/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "dondurma",
    "name": "ドンドゥルマ（トルコアイス）",
    "local": {
     "text": "Dondurma",
     "lang": "tr",
     "roman": "Dondurma"
    },
    "body": "「ガム・アイスクリーム」とも呼ばれるトルコのアイス。野生の蘭の根から取るサーレプを使うことがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "マド イスティクラル通りの店（トルコアイス）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dondurma+%C4%B0stanbul&hl=ja",
    "places": [
     "mado"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "sutlac",
    "name": "スュトラッチ（ライスプディング）",
    "local": {
     "text": "Sütlaç",
     "lang": "tr",
     "roman": "Sütlaç"
    },
    "body": "トルコのライスプディングで、牛乳の菓子の1つ。ハジュ・アブドゥッラーの献立にある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・アブドゥッラー（トルコ料理の食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=S%C3%BCtla%C3%A7+%C4%B0stanbul&hl=ja",
    "places": [
     "haciabdullah"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Hacı Abdullah「Menü」（店のサイトの献立）",
      "url": "https://haciabdullah.com.tr/menu/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "cay",
    "name": "チャイ（トルコの紅茶）",
    "local": {
     "text": "Çay",
     "lang": "tr",
     "roman": "Çay"
    },
    "body": "トルコの人は、朝ごはんにも一日じゅうも紅茶（チャイ）を飲む。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C3%87ay+%C4%B0stanbul&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kahve",
    "name": "トルココーヒー",
    "local": {
     "text": "Türk kahvesi",
     "lang": "tr",
     "roman": "Türk kahvesi"
    },
    "body": "煎りたての豆をごく細かい粉にし、水と砂糖とともに小さな鍋で泡が立つまでゆっくり温める。小さなカップに、水を1杯添えて出す。2013年にユネスコの無形文化遺産になった。",
    "facts": [
     {
      "label": "どこで",
      "text": "クルカフヴェジ・メフメト・エフェンディ カドゥキョイ店（トルココーヒー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=T%C3%BCrk+kahvesi+%C4%B0stanbul&hl=ja",
    "places": [
     "mehmetefendi"
    ],
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "UNESCO「Turkish coffee culture and tradition」",
      "url": "https://ich.unesco.org/en/RL/turkish-coffee-culture-and-tradition-00645",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "ayran",
    "name": "アイラン（ヨーグルトの飲み物）",
    "local": {
     "text": "Ayran",
     "lang": "tr",
     "roman": "Ayran"
    },
    "body": "ヨーグルトから作る飲み物で、トルコでいちばんよく飲まれる冷たい飲み物。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ayran+%C4%B0stanbul&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "boza",
    "name": "ボザ（冬の飲み物）",
    "local": {
     "text": "Boza",
     "lang": "tr",
     "roman": "Boza"
    },
    "body": "昔からの冬の飲み物。シナモンを添えて飲む。",
    "facts": [
     {
      "label": "どこで",
      "text": "ヴェファ・ボザジュス（ボザの店）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Boza+%C4%B0stanbul&hl=ja",
    "places": [
     "vefa"
    ],
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "salep",
    "name": "サーレプ（冬の飲み物）",
    "local": {
     "text": "Salep",
     "lang": "tr",
     "roman": "Salep"
    },
    "body": "牛乳・バニラ・砂糖・でんぷんで作る、冬の飲み物。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Salep+%C4%B0stanbul&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "raki",
    "name": "ラク（トルコの酒）",
    "local": {
     "text": "Rakı",
     "lang": "tr",
     "roman": "Rakı"
    },
    "body": "トルコでいちばん好まれている酒。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Rak%C4%B1+%C4%B0stanbul&hl=ja",
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "iskender",
    "name": "ケバプチュ・イスケンデル ニシャンタシュ店（イスケンデル・ケバブ）",
    "what": "1867年にブルサでイスケンデル・ケバブを始めた家の店。イスタンブールの店はニシャンタシュのシャカユク通り67番。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kebap%C3%A7%C4%B1+%C4%B0skender+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Kebapçı İskender（店のサイト）",
      "url": "https://www.iskender.com.tr/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Kebapçı İskender",
    "km": 4.9
   },
   {
    "id": "haciabdullah",
    "name": "ハジュ・アブドゥッラー（トルコ料理の食堂）",
    "what": "1888年からのトルコ料理の食堂。献立にぶどうの葉のサルマ・肉の煮込み・キョフテ・キュネフェ・スュトラッチ。酒は出さない。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Hac%C4%B1+Abdullah+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Hacı Abdullah「Menü」（店のサイトの献立）",
      "url": "https://haciabdullah.com.tr/menu/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Galata」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Galata",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Hacı Abdullah",
    "km": 3.0,
    "went": false
   },
   {
    "id": "kizilkayalar",
    "name": "クズルカヤラル タクシム店（ウスラック・ハンバーガー）",
    "what": "「ウスラック・ハンバーガー」を考えた店で、1978年から。最初の店はタクシムのスラセルヴィレル通り2/C番。",
    "maps": "https://www.google.com/maps/search/?api=1&query=K%C4%B1z%C4%B1lkayalar+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Kızılkayalar「Islak Hamburger」（店のサイト）",
      "url": "https://kizilkayalar.com.tr/islak-hamburger/",
      "seen": "2026-11-23"
     },
     {
      "name": "Kızılkayalar「Taksim」（店のサイト）",
      "url": "https://kizilkayalar.com.tr/taksim-detayli-sayfasi/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Kızılkayalar",
    "km": 3.1
   },
   {
    "id": "gulluoglu",
    "name": "カラキョイ・ギュルルオウル（バクラヴァ）",
    "what": "カラキョイのケマンケシュ通り67番のバクラヴァの店。品の一覧はピスタチオ・くるみなどのバクラヴァと、カダイフ・ロクム。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Karak%C3%B6y+G%C3%BCll%C3%BCo%C4%9Flu+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Karaköy Güllüoğlu（店のサイトの品の一覧）",
      "url": "https://www.karakoygulluoglu.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Karaköy Güllüoğlu",
    "went": false
   },
   {
    "id": "hafiz",
    "name": "ハフズ・ムスタファ 1864（エミノニュの菓子店）",
    "what": "1864年の名を掲げる菓子の店。品の一覧はバクラヴァ・カダイフ・ケーキ・ムハッレビ（牛乳のプリン）・ロクム。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Haf%C4%B1z+Mustafa+1864+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Hafız Mustafa 1864（店のサイトの品の一覧）",
      "url": "https://www.hafizmustafa.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Hafız Mustafa 1864",
    "went": false
   },
   {
    "id": "hacibekir",
    "name": "ハジュ・ベキル バフチェカプ店（ロクムの老舗）",
    "what": "1777年にバフチェカプで開いた菓子の店。ロクム・アキデ（飴）・ヘルヴァを作る。バフチェカプの店は古い菓子屋として文化財に登録され、店そのものが「生きている博物館」。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ali+Muhiddin+Hac%C4%B1+Bekir+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Hacı Bekir（店のサイト）",
      "url": "https://www.hacibekir.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Ali Muhiddin Hacı Bekir"
   },
   {
    "id": "mado",
    "name": "マド イスティクラル通りの店（トルコアイス）",
    "what": "1850年から続くというアイスの店。アイスは100種類近く。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mado+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "MADO（店のサイト）",
      "url": "https://www.mado.com.tr/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Mado",
    "km": 3.0
   },
   {
    "id": "mehmetefendi",
    "name": "クルカフヴェジ・メフメト・エフェンディ カドゥキョイ店（トルココーヒー）",
    "what": "トルココーヒーの豆を煎って挽く店。本店はエミノニュのタフミス通りで、カドゥキョイとシルケジにも店がある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kurukahveci+Mehmet+Efendi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Kurukahveci Mehmet Efendi（店のサイト）",
      "url": "https://www.mehmetefendi.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Kurukahveci Mehmet Efendi",
    "km": 4.3
   },
   {
    "id": "vefa",
    "name": "ヴェファ・ボザジュス（ボザの店）",
    "what": "ボザ（冬の飲み物）を作る店。品の一覧にボザ・ぶどうの汁シュラ・ビネガー。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Vefa+Bozac%C4%B1s%C4%B1+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Vefa Bozacısı（店のサイト）",
      "url": "https://www.vefa.com.tr/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Vefa Bozacısı"
   }
  ],
  "map": {
   "mid": "1pqWgs0E7ORjHve2u05CQ71URWEfc6Ag",
   "title": "イスタンブール｜食べたいもの",
   "ll": "41.0209,28.9918",
   "z": 12,
   "pins": 9
  }
 },
 "buy": {
  "items": [
   {
    "id": "lokum",
    "name": "ロクム（ターキッシュ・ディライト）",
    "local": {
     "text": "Lokum",
     "lang": "tr",
     "roman": "Lokum"
    },
    "body": "トルコの菓子ロクム。ハジュ・ベキルは1777年からロクムを作り、オスマンの宮廷の菓子職人の長を3代つとめた。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・ベキル バフチェカプ店（ロクムの老舗）・ハフズ・ムスタファ 1864（エミノニュの菓子店）・カラキョイ・ギュルルオウル（バクラヴァ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Lokum+%C4%B0stanbul&hl=ja",
    "places": [
     "hacibekir",
     "hafiz",
     "gulluoglu"
    ],
    "src": [
     {
      "name": "Hacı Bekir（店のサイト）",
      "url": "https://www.hacibekir.com/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "akide",
    "name": "アキデ・シェケリ（昔ながらの飴）",
    "local": {
     "text": "Akide şekeri",
     "lang": "tr",
     "roman": "Akide sekeri"
    },
    "body": "ハジュ・ベキルが1777年からロクム・ヘルヴァとともに作ってきた、昔ながらの飴。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハジュ・ベキル バフチェカプ店（ロクムの老舗）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Akide+%C5%9Fekeri+%C4%B0stanbul&hl=ja",
    "places": [
     "hacibekir"
    ],
    "src": [
     {
      "name": "Hacı Bekir（店のサイト）",
      "url": "https://www.hacibekir.com/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kahve",
    "name": "トルココーヒーの粉",
    "local": {
     "text": "Türk kahvesi",
     "lang": "tr",
     "roman": "Turk kahvesi"
    },
    "body": "ごく細かく挽いたトルココーヒーの粉。小さな鍋で煮出して飲む。トルココーヒーの文化は2013年にユネスコの無形文化遺産になった。",
    "facts": [
     {
      "label": "どこで",
      "text": "クルカフヴェジ・メフメト・エフェンディ カドゥキョイ店（トルココーヒー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=T%C3%BCrk+kahvesi+%C4%B0stanbul&hl=ja",
    "places": [
     "mehmetefendi"
    ],
    "src": [
     {
      "name": "UNESCO「Turkish coffee culture and tradition」",
      "url": "https://ich.unesco.org/en/RL/turkish-coffee-culture-and-tradition-00645",
      "seen": "2026-11-23"
     },
     {
      "name": "Kurukahveci Mehmet Efendi（店のサイト）",
      "url": "https://www.mehmetefendi.com/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "baklava",
    "name": "バクラヴァ（持ち帰りの箱）",
    "local": {
     "text": "Baklava",
     "lang": "tr",
     "roman": "Baklava"
    },
    "body": "ピスタチオやくるみのバクラヴァ。ハフズ・ムスタファはネットでも売り、国の内外へ送る。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラキョイ・ギュルルオウル（バクラヴァ）・ハフズ・ムスタファ 1864（エミノニュの菓子店）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Baklava+%C4%B0stanbul&hl=ja",
    "places": [
     "gulluoglu",
     "hafiz"
    ],
    "src": [
     {
      "name": "Karaköy Güllüoğlu（店のサイトの品の一覧）",
      "url": "https://www.karakoygulluoglu.com/",
      "seen": "2026-11-23"
     },
     {
      "name": "Hafız Mustafa 1864（店のサイトの品の一覧）",
      "url": "https://www.hafizmustafa.com/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "cay",
    "name": "トルコの紅茶の茶葉",
    "local": {
     "text": "Çay",
     "lang": "tr",
     "roman": "Cay"
    },
    "body": "トルコの人が朝から一日じゅう飲む紅茶（チャイ）。お土産の定番の1つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C3%87ay+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "spice",
    "name": "スパイスとドライフルーツ",
    "local": {
     "text": "Baharat",
     "lang": "tr",
     "roman": "Baharat"
    },
    "body": "エジプシャン・バザールの85の店に、スパイス・ロクム・ドライフルーツ・ナッツが並ぶ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Baharat+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Spice Bazaar」",
      "url": "https://en.wikipedia.org/wiki/Spice_Bazaar",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kilim",
    "name": "じゅうたん・キリム",
    "local": {
     "text": "Halı / Kilim",
     "lang": "tr",
     "roman": "Hali / Kilim"
    },
    "body": "トルコのじゅうたんと平織りのキリム。店はブルーモスクの東のアラスタ・バザールのあたりに多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Hal%C4%B1+%2F+Kilim+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "pestemal",
    "name": "ペシテマル（ハマムの布）",
    "local": {
     "text": "Peştamal",
     "lang": "tr",
     "roman": "Pestamal"
    },
    "body": "ハマムで体に巻く、昔ながらの布。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pe%C5%9Ftamal+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Çemberlitaş Hamamı（浴場のサイト。料金の表）",
      "url": "https://www.cemberlitashamami.com/en/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "iznik",
    "name": "イズニック・タイルの模様の陶器",
    "local": {
     "text": "İznik çinisi",
     "lang": "tr",
     "roman": "Iznik cinisi"
    },
    "body": "ブルーモスクやリュステム・パシャ・モスクの壁を飾るイズニックのタイル。花と幾何学の模様が多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%B0znik+%C3%A7inisi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Blue Mosque, Istanbul」",
      "url": "https://en.wikipedia.org/wiki/Blue_Mosque,_Istanbul",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Rüstem Pasha Mosque」",
      "url": "https://en.wikipedia.org/wiki/R%C3%BCstem_Pasha_Mosque",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "raki",
    "name": "ラクの瓶",
    "local": {
     "text": "Rakı",
     "lang": "tr",
     "roman": "Raki"
    },
    "body": "トルコでいちばん好まれている酒、ラク。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Rak%C4%B1+%C4%B0stanbul&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Turkish cuisine」",
      "url": "https://en.wikipedia.org/wiki/Turkish_cuisine",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "hacibekir",
    "name": "ハジュ・ベキル バフチェカプ店（ロクムの老舗）",
    "what": "1777年にバフチェカプで開いた菓子の店。ロクム・アキデ（飴）・ヘルヴァを作る。バフチェカプの店は古い菓子屋として文化財に登録され、店そのものが「生きている博物館」。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ali+Muhiddin+Hac%C4%B1+Bekir+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Hacı Bekir（店のサイト）",
      "url": "https://www.hacibekir.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Ali Muhiddin Hacı Bekir",
    "went": false
   },
   {
    "id": "hafiz",
    "name": "ハフズ・ムスタファ 1864（エミノニュの菓子店）",
    "what": "1864年の名を掲げる菓子の店。品の一覧はバクラヴァ・カダイフ・ケーキ・ムハッレビ（牛乳のプリン）・ロクム。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Haf%C4%B1z+Mustafa+1864+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Hafız Mustafa 1864（店のサイトの品の一覧）",
      "url": "https://www.hafizmustafa.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Hafız Mustafa 1864",
    "went": false
   },
   {
    "id": "gulluoglu",
    "name": "カラキョイ・ギュルルオウル（バクラヴァ）",
    "what": "カラキョイのケマンケシュ通り67番のバクラヴァの店。品の一覧はピスタチオ・くるみなどのバクラヴァと、カダイフ・ロクム。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Karak%C3%B6y+G%C3%BCll%C3%BCo%C4%9Flu+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Karaköy Güllüoğlu（店のサイトの品の一覧）",
      "url": "https://www.karakoygulluoglu.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Karaköy Güllüoğlu",
    "went": false
   },
   {
    "id": "mehmetefendi",
    "name": "クルカフヴェジ・メフメト・エフェンディ カドゥキョイ店（トルココーヒー）",
    "what": "トルココーヒーの豆を煎って挽く店。本店はエミノニュのタフミス通りで、カドゥキョイとシルケジにも店がある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kurukahveci+Mehmet+Efendi+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "Kurukahveci Mehmet Efendi（店のサイト）",
      "url": "https://www.mehmetefendi.com/",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Kurukahveci Mehmet Efendi",
    "km": 4.3
   }
  ],
  "map": {
   "mid": "1xfkj6Rp9txoSsF0NNij7dPqYCZeuP-M",
   "title": "イスタンブール｜買いたいもの",
   "ll": "41.0079,28.9993",
   "z": 12,
   "pins": 4
  }
 },
 "videos": {
  "streams": {
   "country": "turkey",
   "city": "イスタンブール"
  },
  "shorts": []
 },
 "basics": {
  "summary": [
   {
    "id": "season",
    "icon": "sun",
    "label": "旬の季節",
    "value": "4〜10月",
    "lead": "平年の最高気温が16〜28℃",
    "to": "#guide-season"
   },
   {
    "id": "safety",
    "icon": "key",
    "label": "治安",
    "value": "ぼったくりに注意",
    "lead": "旧市街とタクシムの夜のバー",
    "to": "#guide-safety"
   },
   {
    "id": "budget",
    "icon": "wallet",
    "label": "乗り物の目安",
    "value": "1回46.20リラ",
    "lead": "メトロ・トラム・バス",
    "to": "#budget"
   },
   {
    "id": "transit",
    "icon": "tram",
    "label": "移動",
    "value": "トラムT1",
    "lead": "旧市街の名所を結ぶ",
    "to": "#guide-transit"
   }
  ],
  "guides": [
   {
    "id": "airport",
    "icon": "plane",
    "title": "空港から市内へ",
    "lead": "メトロM11かバスのハヴァイストで",
    "parts": [
     {
      "h": "",
      "text": "イスタンブール空港（IST）は市の北西30km。メトロM11が市内と結び、6時15分から0時15分まで走る。"
     },
     {
      "h": "",
      "text": "空港バスのハヴァイストは、アクサライのメトロ駅まで約90分。5.42ユーロ（2024年10月）。"
     },
     {
      "h": "",
      "text": "タクシーはスルタンアフメットまで約50km・約50分で、約27.92ユーロ（2024年10月）。"
     },
     {
      "h": "",
      "text": "アジア側のサビハ・ギョクチェン空港（SAW）は市の東30km。メトロM4でカドゥキョイまで約1時間。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "transit",
    "icon": "tram",
    "title": "市内の乗り物",
    "lead": "イスタンブールカードで乗る",
    "parts": [
     {
      "h": "",
      "text": "カードのイスタンブールカードは、街角の小さな店や駅の機械で買える。足すのは現金かクレジットカード。"
     },
     {
      "h": "",
      "text": "メトロ・トラム・バスは1回46.20リラ（2026年7月20日から）。"
     },
     {
      "h": "",
      "text": "トラムT1はカバタシュからバージュラルまで。旧市街の名所の多くはこの沿線。"
     },
     {
      "h": "",
      "text": "地下のケーブルカーF2（1875年から）が、カラキョイとイスティクラル通りを結ぶ。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     },
     {
      "name": "sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
      "url": "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "pay",
    "icon": "currency",
    "title": "払いかたとチップ",
    "lead": "通貨はリラ。両替は街で",
    "parts": [
     {
      "h": "",
      "text": "通貨はトルコリラ（TRY）。1リラは約3.14円（2026年11月20日の参照レート）。"
     },
     {
      "h": "",
      "text": "両替は銀行・大きなホテル・両替所で、米ドルとユーロができる。旅行者の多い地区には、日本円を両替できる所もある。"
     },
     {
      "h": "",
      "text": "両替は空港ではなく、街の銀行か両替所（ドヴィズ・ビュロス）で。"
     },
     {
      "h": "",
      "text": "ユーロと米ドルは旅行者の多い所では使えるが、リラしか受け取らない名所もある。"
     }
    ],
    "src": [
     {
      "name": "欧州中央銀行（ユーロの参照レート）",
      "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
      "seen": "2026-11-23"
     },
     {
      "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "sim",
    "icon": "sim",
    "title": "ネットと SIM",
    "lead": "4G はどの会社でも使える",
    "parts": [
     {
      "h": "",
      "text": "トルコの携帯の会社はどこも 4G が使える。5G は一部の場所だけで、2026年に本格的に始まる見込み。"
     },
     {
      "h": "",
      "text": "広場とバスには無料の Wi-Fi がある。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "safety",
    "icon": "key",
    "title": "治安のコツ",
    "lead": "ぼったくりバーと流しのタクシー",
    "parts": [
     {
      "h": "",
      "text": "夕方と夜、スルタンアフメット地区とタクシム地区（とくにイスティクラル通り）で、ぼったくりバーの被害が多い。知らない人に誘われた店には行かない。"
     },
     {
      "h": "",
      "text": "日本語で話しかけて親しくなり、高いじゅうたんを売りつける手口がある。"
     },
     {
      "h": "",
      "text": "流しのタクシーで、遠回りやメーターを消して高い料金を求められる例が多い。ホテルを通すか配車のアプリで呼び、メーターが動いているか確かめる。"
     },
     {
      "h": "",
      "text": "ブラシを落として拾わせ、「ただで」磨いたあとに高いお金を求める靴磨きがいる。払わない。"
     },
     {
      "h": "水道水",
      "text": "水道水は飲めない。飲むのは市販のボトルの水。"
     }
    ],
    "src": [
     {
      "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "phrases",
    "icon": "phrase",
    "title": "トルコ語のひとこと",
    "lead": "Merhaba（メルハバ）＝こんにちは",
    "parts": [],
    "src": [
     {
      "name": "Wikivoyage「Turkish phrasebook」",
      "url": "https://en.wikivoyage.org/wiki/Turkish_phrasebook",
      "seen": "2026-11-23"
     }
    ],
    "words": [
     {
      "local": {
       "text": "Merhaba",
       "lang": "tr",
       "roman": "merhaba",
       "kana": "メルハバ"
      },
      "jp": "こんにちは"
     },
     {
      "local": {
       "text": "Günaydın",
       "lang": "tr",
       "roman": "gunaydin",
       "kana": "ギュナイドゥン"
      },
      "jp": "おはようございます"
     },
     {
      "local": {
       "text": "Teşekkür ederim",
       "lang": "tr",
       "roman": "tesekkur ederim",
       "kana": "テシェッキュル・エデリム"
      },
      "jp": "ありがとう"
     },
     {
      "local": {
       "text": "Evet",
       "lang": "tr",
       "roman": "evet",
       "kana": "エヴェト"
      },
      "jp": "はい"
     },
     {
      "local": {
       "text": "Hayır",
       "lang": "tr",
       "roman": "hayir",
       "kana": "ハユル"
      },
      "jp": "いいえ"
     },
     {
      "local": {
       "text": "Afedersiniz",
       "lang": "tr",
       "roman": "afedersiniz",
       "kana": "アフェデルスィニズ"
      },
      "jp": "すみません"
     },
     {
      "local": {
       "text": "Bakar mısınız?",
       "lang": "tr",
       "roman": "bakar misiniz",
       "kana": "バカル・ムスヌズ？"
      },
      "jp": "（店の人を呼ぶ）すみません"
     },
     {
      "local": {
       "text": "Bu kaç para?",
       "lang": "tr",
       "roman": "bu kac para",
       "kana": "ブ・カチ・パラ？"
      },
      "jp": "これはいくらですか？"
     },
     {
      "local": {
       "text": "Hesap lütfen",
       "lang": "tr",
       "roman": "hesap lutfen",
       "kana": "ヘサプ・リュトフェン"
      },
      "jp": "お勘定をお願いします"
     },
     {
      "local": {
       "text": "Hoşçakalın",
       "lang": "tr",
       "roman": "hoscakalin",
       "kana": "ホシュチャカルン"
      },
      "jp": "さようなら（去る人が言う）"
     }
    ]
   }
  ],
  "season": {
   "id": "season",
   "icon": "sun",
   "title": "季節と行事",
   "lead": "歩きやすいのは4〜10月",
   "parts": [
    {
     "h": "歩きやすい季節",
     "text": "平年の最高気温が16〜28℃になるのは4〜10月。11〜1月は雨が多く、月に100mm前後降る。"
    },
    {
     "h": "祝日",
     "text": "10月29日は共和国の宣言（1923年）を記念する共和国記念日で、前の日の午後も休み。ラマザン・バイラム（3日）とクルバン・バイラム（4日）は、イスラムの暦で毎年日付が動く。"
    },
    {
     "h": "時差",
     "text": "トルコは一年じゅう UTC+3 で、日本より6時間遅い。夏時間は無い。"
    }
   ],
   "src": [
    {
     "name": "Wikipedia（日本語）「イスタンブール」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Public holidays in Turkey」",
     "url": "https://en.wikipedia.org/wiki/Public_holidays_in_Turkey",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Time in Turkey」",
     "url": "https://en.wikipedia.org/wiki/Time_in_Turkey",
     "seen": "2026-11-23"
    }
   ]
  },
  "budget": {
   "rows": [],
   "tips": [],
   "days": [],
   "extras": [
    {
     "label": "メトロ・トラム・バス1回",
     "local": "46.20リラ",
     "yen": "140円",
     "src": [
      {
       "name": "sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
       "url": "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "船 カドゥキョイ〜エミノニュ",
     "local": "65.21リラ",
     "yen": "200円",
     "src": [
      {
       "name": "sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
       "url": "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "船 ボスタンジュ〜島",
     "local": "171.89リラ",
     "yen": "540円",
     "src": [
      {
       "name": "sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」（2026年7月17日）",
       "url": "https://haber.sol.org.tr/haber/istanbullunun-ulasim-masrafina-yeni-zam-tam-bilet-4620-tl-411809",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "ボスポラス海峡の長いツアー（往復・外国人）",
     "local": "640リラ",
     "yen": "2,010円",
     "src": [
      {
       "name": "e-Yaşam Rehberi「Şehir Hatları Uzun Boğaz Turu」（2026年9月7日更新）",
       "url": "https://e-yasamrehberi.com/deniz_ulasimi/sehir-hatlari-uzun-bogaz-turu.htm",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "地下宮殿（昼）",
     "local": "1,500リラ",
     "yen": "4,710円",
     "src": [
      {
       "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
       "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "ハマム（垢すりと泡の洗いつき）",
     "local": "4,050リラ",
     "yen": "12,710円",
     "src": [
      {
       "name": "Çemberlitaş Hamamı（浴場のサイト。料金の表）",
       "url": "https://www.cemberlitashamami.com/en/",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "rate": "1リラは約3.14円。トルコリラ（TRY）は変動相場で、円は1ユーロ＝55.5788リラ・174.35円（2026年11月20日の欧州中央銀行の参照レート）で直した。",
   "rateSrc": [
    {
     "name": "欧州中央銀行（ユーロの参照レート）",
     "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
     "seen": "2026-11-23"
    }
   ]
  },
  "pack": [
   {
    "icon": "passport",
    "label": "パスポート",
    "why": "",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "coin",
    "label": "少しのリラの現金",
    "why": "リラしか受け取らない名所もある。",
    "src": [
     {
      "name": "Wikivoyage「Istanbul」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "shirt",
    "label": "モスクに入るときの、きちんとした服",
    "why": "アヤソフィアはいまも礼拝の場で、服装に気をつける。",
    "src": [
     {
      "name": "Wikivoyage「Istanbul/Sultanahmet-Old City」",
      "url": "https://en.wikivoyage.org/wiki/Istanbul/Sultanahmet-Old_City",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "bottle",
    "label": "水のボトル",
    "why": "水道水は飲めない。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "firstaid",
    "label": "海外旅行の保険",
    "why": "旅行者の食中毒が多く、腹痛・熱・下痢のときは医療機関へ。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "umbrella",
    "label": "冬は傘",
    "why": "11〜1月は月に100mm前後の雨が降る。",
    "src": [
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "climate": {
   "months": [
    {
     "hi": 8.7,
     "lo": 2.9,
     "mm": 98.4
    },
    {
     "hi": 9.1,
     "lo": 2.8,
     "mm": 80.2
    },
    {
     "hi": 11.2,
     "lo": 3.9,
     "mm": 69.9
    },
    {
     "hi": 16.5,
     "lo": 7.7,
     "mm": 45.8
    },
    {
     "hi": 21.4,
     "lo": 12.0,
     "mm": 36.1
    },
    {
     "hi": 26.0,
     "lo": 16.0,
     "mm": 34.0
    },
    {
     "hi": 28.4,
     "lo": 18.5,
     "mm": 38.8
    },
    {
     "hi": 28.5,
     "lo": 18.7,
     "mm": 47.8
    },
    {
     "hi": 25.0,
     "lo": 15.5,
     "mm": 61.4
    },
    {
     "hi": 20.1,
     "lo": 12.0,
     "mm": 96.9
    },
    {
     "hi": 15.3,
     "lo": 8.5,
     "mm": 110.7
    },
    {
     "hi": 11.1,
     "lo": 5.3,
     "mm": 123.9
    }
   ],
   "note": "平均最高と平均最低。イスタンブール（平年値）",
   "src": [
    {
     "name": "Wikipedia（日本語）「イスタンブール」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
     "seen": "2026-11-23"
    }
   ]
  },
  "help": {
   "calls": [
    {
     "num": "112",
     "label": "警察・救急・消防",
     "note": "2021年から全部112に統一",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "num": "0212-317-4600",
     "label": "在イスタンブール日本国総領事館",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "embassy": {
    "name": "在イスタンブール日本国総領事館",
    "address": "Esentepe Mah. Büyükdere Cad. No:209, Tekfen Tower Kat:10, Şişli, İstanbul",
    "tel": "0212-317-4600（国外からは +90 212-317-4600）",
    "note": "イスタンブールに日本の総領事館がある（大使館は首都アンカラ）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Tekfen+Tower+%C4%B0stanbul&hl=ja",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（トルコ 安全対策基礎データ。2025年6月11日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_052.html",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia（日本語）「イスタンブール」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A4%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%96%E3%83%BC%E3%83%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Tekfen Tower」",
      "url": "https://www.openstreetmap.org/way/905819810",
      "seen": "2026-11-23"
     }
    ]
   }
  }
 },
 "published": "2026-11-23",
 "updated": "2026-11-24",
 "hash": "9076fc9b87d0e811"
}
/* END GUIDE */;
