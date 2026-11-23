/**
 * ベオグラードのガイドブック（`/travel/serbia/belgrade`）の中身。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/serbia/belgrade/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_bake.py serbia/belgrade` で焼き直す。
 * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。
 */
import type { Guidebook } from "./types";

export const BELGRADE: Guidebook = /* BEGIN GUIDE */
{
 "country": "serbia",
 "city": "belgrade",
 "name": "ベオグラード",
 "kicker": "セルビア",
 "local": {
  "text": "Beograd",
  "lang": "sr",
  "roman": "Beograd"
 },
 "lead": "ドナウとサヴァに抱かれた白い町",
 "cover": {
  "src": "/guide/serbia/belgrade/photos/p037152-661920-belgrade-fortress-3be9c0cb-960.webp",
  "small": "/guide/serbia/belgrade/photos/p037152-661920-belgrade-fortress-3be9c0cb-500.webp",
  "w": 960,
  "h": 595,
  "alt": "川の合流を見下ろす高台に、石の城壁が続くベオグラード要塞",
  "kind": "photo",
  "credit": {
   "by": "Oliver Bunic",
   "lic": "CC BY 4.0",
   "page": "https://commons.wikimedia.org/wiki/File:P037152-661920_-_Belgrade_fortress_stand_at_the_downtown_of_Belgrade.jpg"
  }
 },
 "title": "ベオグラード観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜セルビア",
 "description": "セルビアの首都ベオグラードの観光ガイド。見どころマップと、やりたいこと8つ（要塞から見る川の合流、聖サヴァ大聖堂、テスラ博物館、ノヴィ・サドへの日帰り）、チェヴァプチチとカイマク。",
 "rate": {
  "unit": "ディナール",
  "yen": 1.48,
  "date": "2026-11-20"
 },
 "about": {
  "cards": [
   {
    "id": "history",
    "icon": "castle",
    "q": "歴史は？",
    "a": "名前は「白い町」の意味。ドナウ川とサヴァ川の合流点の崖に要塞が立ち、要塞をめぐる戦いは100回を超える。",
    "src": [
     {
      "name": "Wikipedia（日本語）「ベオグラード」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%99%E3%82%AA%E3%82%B0%E3%83%A9%E3%83%BC%E3%83%89",
      "seen": "2026-11-22"
     },
     {
      "name": "地球の歩き方「セルビアの基本情報と観光ガイド」",
      "url": "https://www.arukikata.co.jp/area/rs/",
      "seen": "2026-11-22"
     },
     {
      "name": "NEWT「セルビア・ベオグラード旅行におすすめの観光地11選！」",
      "url": "https://newt.net/srb/mag-9081158317",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "tesla",
    "icon": "idea",
    "q": "テスラとの関係は？",
    "a": "空港の名前にもなった、セルビアを代表する偉人。市内のニコラ・テスラ博物館が、テスラの眠る場所。",
    "src": [
     {
      "name": "地球の歩き方「セルビアのおすすめ観光スポット10選！歴史と自然の宝庫を巡る」",
      "url": "https://www.arukikata.co.jp/webmagazine/272443/",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Nikola Tesla Museum」",
      "url": "https://en.wikipedia.org/wiki/Nikola_Tesla_Museum",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "night",
    "icon": "night",
    "q": "夜はどんな街？",
    "a": "古い町の雰囲気と、新しいナイトライフの両方を楽しめる街。サヴァ川とドナウ川の岸には、船のバーやクラブが並ぶ。",
    "src": [
     {
      "name": "地球の歩き方「セルビアの基本情報と観光ガイド」",
      "url": "https://www.arukikata.co.jp/area/rs/",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   }
  ],
  "areas": [
   {
    "id": "kalemegdan",
    "name": "カレメグダン周辺",
    "color": "#ffd98a",
    "lead": "2つの川の合流を見下ろす崖の上の要塞と公園",
    "see": [
     "kalemegdan",
     "pobednik",
     "military",
     "msu",
     "zoo"
    ],
    "plan": [
     2,
     1,
     1
    ],
    "src": [
     {
      "name": "Wikipedia「Belgrade Fortress」",
      "url": "https://en.wikipedia.org/wiki/Belgrade_Fortress",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "地球の歩き方「セルビアの基本情報と観光ガイド」",
      "url": "https://www.arukikata.co.jp/area/rs/",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Београдска тврђава」",
      "url": "https://www.openstreetmap.org/way/450824126",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Бео зоо врт」",
      "url": "https://www.openstreetmap.org/way/33517093",
      "seen": "2026-11-22"
     }
    ],
    "body": "中に博物館や動物園があり、夕暮れの眺めが美しい。",
    "local": {
     "text": "Kalemegdan",
     "lang": "sr",
     "roman": "Kalemegdan"
    }
   },
   {
    "id": "knez",
    "name": "クネズ・ミハイロ通り周辺",
    "color": "#d9ccf5",
    "lead": "要塞から共和国広場へ延びる歩行者天国の目抜き通り",
    "see": [
     "knez",
     "republic",
     "nmuseum",
     "ljubica",
     "bajrakli",
     "ethno",
     "dorcol"
    ],
    "plan": [
     2,
     2,
     1
    ],
    "src": [
     {
      "name": "Wikipedia「Knez Mihailova Street」",
      "url": "https://en.wikipedia.org/wiki/Knez_Mihailova_Street",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Кнеза Михаила」",
      "url": "https://www.openstreetmap.org/way/23671224",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Трг републике」",
      "url": "https://www.openstreetmap.org/node/6760759093",
      "seen": "2026-11-22"
     }
    ],
    "body": "博物館やモスク、古い地区のドルチョルもすぐそば。",
    "local": {
     "text": "Knez Mihailova",
     "lang": "sr",
     "roman": "Knez Mihailova"
    }
   },
   {
    "id": "skadarlija",
    "name": "スカダルリヤ",
    "color": "#ffc4d2",
    "lead": "石畳の坂道に、生演奏の流れる古いカファナが並ぶボヘミアン地区",
    "see": [
     "skadarlija",
     "stmark",
     "assembly"
    ],
    "plan": [
     3,
     2,
     1
    ],
    "src": [
     {
      "name": "Wikipedia「Skadarlija」",
      "url": "https://en.wikipedia.org/wiki/Skadarlija",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia（日本語）「スカダルリヤ」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%B9%E3%82%AB%E3%83%80%E3%83%AB%E3%83%AA%E3%83%A4",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Скадарска」",
      "url": "https://www.openstreetmap.org/way/392994845",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Три шешира」",
      "url": "https://www.openstreetmap.org/way/150590534",
      "seen": "2026-11-22"
     }
    ],
    "local": {
     "text": "Skadarlija",
     "lang": "sr",
     "roman": "Skadarlija"
    }
   },
   {
    "id": "sava",
    "name": "聖サヴァ大聖堂周辺",
    "color": "#c8e6c9",
    "lead": "白い大聖堂の立つ丘",
    "see": [
     "sava",
     "tesla"
    ],
    "plan": [
     2,
     3,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Church of Saint Sava」",
      "url": "https://en.wikipedia.org/wiki/Church_of_Saint_Sava",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Храм Светог Саве」",
      "url": "https://www.openstreetmap.org/way/89808919",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Музеј Николе Тесле」",
      "url": "https://www.openstreetmap.org/node/12845103007",
      "seen": "2026-11-22"
     }
    ],
    "body": "北へ少し歩くと、ニコラ・テスラ博物館がある。",
    "local": {
     "text": "Hram Svetog Save",
     "lang": "sr",
     "roman": "Hram Svetog Save"
    }
   },
   {
    "id": "zemun",
    "name": "ゼムン",
    "color": "#bfe3f5",
    "lead": "ドナウ川の岸の古い町",
    "see": [
     "zemun",
     "gardos"
    ],
    "plan": [
     1,
     1,
     1
    ],
    "src": [
     {
      "name": "Wikipedia「Zemun」",
      "url": "https://en.wikipedia.org/wiki/Zemun",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Гардош」",
      "url": "https://www.openstreetmap.org/node/11582139369",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Кеј ослобођења」",
      "url": "https://www.openstreetmap.org/way/24843758",
      "seen": "2026-11-22"
     }
    ],
    "body": "丘の上に塔が立ち、川沿いに散歩道と魚料理の店が続く。",
    "local": {
     "text": "Zemun",
     "lang": "sr",
     "roman": "Zemun"
    }
   }
  ]
 },
 "todo": [
  {
   "id": "kalemegdan",
   "title": "要塞から2つの川の合流を眺めたい！",
   "lead": "サヴァ川がドナウ川に注ぐ崖の上の公園",
   "what": "ベオグラード要塞とカレメグダン公園を歩き、崖の上からサヴァ川とドナウ川の合流を見下ろす。紀元前3世紀にケルト人の部族スコルディスキが築いた「シンギドゥヌム」が街の始まり。のちにローマの軍団が、合流点の丘に陣を置いた。要塞をめぐる戦いは100回を超え、壊されるたびに直されてきた。1979年に国の特に重要な文化財になった、街でいちばん人が訪れる名所。",
   "how": "要塞と公園には24時間、ただで入れる。中に軍事博物館・教会・動物園がある。崖の上からは、合流点と、その先の大戦争島（ヴェリコ・ラトノ島）が見える。",
   "time": "夕暮れどきの眺めがとくに美しい。",
   "money": "要塞の中の軍事博物館は大人350ディナール。",
   "tip": "観光案内所は、要塞の入口のそばのクネズ・ミハイロ通り56番、市立図書館の中。毎日9〜20時。カレメグダン公園の人混みでは、スリの被害が多い。バッグは体の前に抱える。",
   "route": "",
   "see": [
    "kalemegdan",
    "pobednik",
    "military",
    "zoo"
   ],
   "src": [
    {
     "name": "Wikipedia「Belgrade Fortress」",
     "url": "https://en.wikipedia.org/wiki/Belgrade_Fortress",
     "seen": "2026-11-22"
    },
    {
     "name": "地球の歩き方「セルビアのおすすめ観光スポット10選！歴史と自然の宝庫を巡る」",
     "url": "https://www.arukikata.co.jp/webmagazine/272443/",
     "seen": "2026-11-22"
    },
    {
     "name": "NEWT「セルビア・ベオグラード旅行におすすめの観光地11選！」",
     "url": "https://newt.net/srb/mag-9081158317",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "地球の歩き方「セルビアの基本情報と観光ガイド」",
     "url": "https://www.arukikata.co.jp/area/rs/",
     "seen": "2026-11-22"
    },
    {
     "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
     "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
     "seen": "2026-11-22"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "入るのは無料"
    }
   ]
  },
  {
   "id": "cevapi",
   "title": "本場のチェヴァプチチを食べたい！",
   "lead": "炭火で焼いた棒のひき肉に、カイマクと玉ねぎ",
   "what": "ひき肉を棒の形にして焼いたチェヴァプチチ（チェヴァピ）を、平たいパンと一緒に食べる。セルビアとボスニア・ヘルツェゴヴィナの国の料理とされる。5〜10本を皿か平たいパンにのせ、刻んだ玉ねぎ・カイマクを添えることが多い。南の町レスコヴァツの炭火焼きの料理は、移り住んだ人たちと一緒にベオグラードに入り、いちばん売れる料理になった。",
   "how": "チェーン店のワルテルでは、牛肉のチェヴァピ125gに半分の平たいパンをつけて565ディナール（2026年10月の献立）。スカダルリヤのトリ・シェシラでは「トリ・シェシラのチェヴァピ」が1,240ディナール。",
   "time": "",
   "money": "ワルテルでカイマク70gを足すと200ディナール。",
   "tip": "シェシル・モイの献立は、チェヴァピにフライドポテトを添えて1,250ディナール、カイマクつきで1,380ディナール。",
   "route": "",
   "see": [
    "skadarlija"
   ],
   "src": [
    {
     "name": "Wikipedia「Ćevapi」",
     "url": "https://en.wikipedia.org/wiki/%C4%86evapi",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Serbian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
     "seen": "2026-11-22"
    },
    {
     "name": "Walter「Kompakt meni — Centralni」（市の中の店の献立。2026年10月の PDF）",
     "url": "https://kopakt-menus.walter.rs/SR/Kompakt-Walter-Centralni-SR.pdf",
     "seen": "2026-11-22"
    },
    {
     "name": "Tri šešira「Jelovnik」（店のネットの献立）",
     "url": "https://trisesira.rs/jelovnik/",
     "seen": "2026-11-22"
    },
    {
     "name": "Šešir moj「Jelovnik / Menu」（2025年4月の献立。PDF）",
     "url": "https://www.sesirmoj.rs/_files/ugd/adcb74_2977c0d7fa2642af95c635540b811fd6.pdf",
     "seen": "2026-11-22"
    }
   ],
   "eat": [
    "cevapi",
    "kajmak",
    "pljeskavica"
   ],
   "marks": [
    {
     "kind": "price",
     "text": "565ディナールから"
    }
   ]
  },
  {
   "id": "skadarlija",
   "title": "石畳のスカダルリヤで夕食したい！",
   "lead": "生演奏の流れる老舗の食堂（カファナ）が並ぶ通り",
   "what": "石畳の通りスカダルリヤの、伝統料理の食堂（カファナ）で夕食をとる。ベオグラードのボヘミアン地区で、「ベオグラードのモンマルトル」とも呼ばれる。1901年に宿屋「ダルダネリ」が取り壊されると、そこに居ついていた作家や俳優が、スカダルリヤの宿屋やカファナに移ってきた。1864年に開いたトリ・シェシラ（3つの帽子）は、2022年の時点で、スカダルリヤでいちばん古いいまも営むカファナ。",
   "how": "夜は多くの店が、民謡やタンブリツァの生演奏とともにセルビアの料理を出す。",
   "time": "",
   "money": "トリ・シェシラの献立では、チェヴァピ1,240ディナール、カラジョルジェヴァ・シュニツラ1,680ディナール。シェシル・モイの献立では、ムチュカリツァ1,350ディナール、バクラヴァ650ディナール（2025年4月）。",
   "tip": "スカダルリヤは、カレメグダンに次いで街で2番目に人が訪れる名所。",
   "route": "",
   "see": [
    "skadarlija"
   ],
   "src": [
    {
     "name": "Wikipedia「Skadarlija」",
     "url": "https://en.wikipedia.org/wiki/Skadarlija",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia（日本語）「スカダルリヤ」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%B9%E3%82%AB%E3%83%80%E3%83%AB%E3%83%AA%E3%83%A4",
     "seen": "2026-11-22"
    },
    {
     "name": "Tri šešira「Jelovnik」（店のネットの献立）",
     "url": "https://trisesira.rs/jelovnik/",
     "seen": "2026-11-22"
    },
    {
     "name": "Šešir moj「Jelovnik / Menu」（2025年4月の献立。PDF）",
     "url": "https://www.sesirmoj.rs/_files/ugd/adcb74_2977c0d7fa2642af95c635540b811fd6.pdf",
     "seen": "2026-11-22"
    }
   ],
   "eat": [
    "karadjordjeva",
    "sopska",
    "rakija"
   ]
  },
  {
   "id": "sava",
   "title": "聖サヴァ大聖堂の金のモザイクを見たい！",
   "lead": "正教会の聖堂では世界で4番目の大きさ",
   "what": "聖サヴァ大聖堂に入り、金色のモザイクで覆われた丸屋根と、地下の聖堂を見る。セルビア正教会の最初の大主教で国の守護聖人、聖サヴァにささげた聖堂。1594年にオスマン帝国が聖サヴァの遺骸を焼いたと伝わる場所に建てた。1935年に建て始め、外は2004年、中は2020年にようやくできた。中を覆うモザイクはおよそ1万5,000平方メートルで、キリスト教の世界でいちばん広い。丸屋根の中央には、キリストの昇天を描いた1,230平方メートルのモザイク。",
   "how": "毎日8〜20時に開いていて、入るのは無料。正面の入口から下りた地下の聖堂は、明るく磨かれた広い空間で、壁一面に新しいイコンが並ぶ。",
   "time": "",
   "money": "",
   "tip": "地下の聖堂と上の聖堂では、ふだんから礼拝が行われている。",
   "route": "",
   "see": [
    "sava"
   ],
   "src": [
    {
     "name": "Wikipedia「Church of Saint Sava」",
     "url": "https://en.wikipedia.org/wiki/Church_of_Saint_Sava",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "入るのは無料"
    }
   ]
  },
  {
   "id": "tesla",
   "title": "テスラ博物館で放電の実験を見たい！",
   "lead": "電気の発明家テスラの眠る、小さな博物館",
   "what": "ニコラ・テスラ博物館で、英語のガイドについてテスラの遺品と発明の模型を見て、実験の実演を見る。テスラ（1856〜1943年）は、交流の電気・無線・交流のモーターに大きな仕事を残した。博物館はテスラの一生と仕事を伝える場所で、テスラの眠る場所でもある。資料は2003年にユネスコの「世界の記憶」に登録された。ベオグラードの空港の名前も、ベオグラード・ニコラ・テスラ空港。",
   "how": "英語のガイドの見学は毎正時に始まり、実験の実演がある。場所はクルンスカ通り51番。",
   "time": "月曜は10〜18時、火〜日曜は10〜20時。混む時間には長い列ができる。",
   "money": "英語のガイドの見学は800ディナールで、現金だけ。",
   "tip": "",
   "route": "",
   "see": [
    "tesla"
   ],
   "src": [
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Nikola Tesla Museum」",
     "url": "https://en.wikipedia.org/wiki/Nikola_Tesla_Museum",
     "seen": "2026-11-22"
    },
    {
     "name": "地球の歩き方「セルビアのおすすめ観光スポット10選！歴史と自然の宝庫を巡る」",
     "url": "https://www.arukikata.co.jp/webmagazine/272443/",
     "seen": "2026-11-22"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "800ディナール"
    }
   ]
  },
  {
   "id": "riblja",
   "title": "ドナウの川辺で魚のスープを食べたい！",
   "lead": "ゼムンの川沿いの店で、パプリカの効いた一杯",
   "what": "ゼムンのドナウ川沿いの魚料理の店で、魚のスープ（リブリャ・チョルバ）を食べる。ドナウ川とサヴァ川の合流点にあるベオグラードは、川魚の料理の長い歴史を持つ。とくにゼムンの川沿いの店で、魚のスープや魚の煮込みを出す。魚のスープは、パプリカで味をつけたパンノニア地方の料理。ゼムンは1934年にベオグラードに入るまで別の町だった。",
   "how": "ゼムン河岸の魚料理の店シャランでは、骨を抜いた鯉の切り身の入った魚のスープ（0.5リットル）が1,120ディナール（2025年11月の献立）。同じ店の、ナマズか鯉の魚のパプリカ煮込みは3,200ディナール。",
   "time": "シャランは月曜が休み。火・水曜は15時〜0時、木〜日曜は13時〜翌1時。",
   "money": "",
   "tip": "中心のスカダルリヤのトリ・シェシラの献立にも、魚のスープがある（460ディナール）。",
   "route": "",
   "see": [
    "zemun",
    "gardos"
   ],
   "src": [
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Serbian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Zemun」",
     "url": "https://en.wikipedia.org/wiki/Zemun",
     "seen": "2026-11-22"
    },
    {
     "name": "Restoran Šaran「Meni」（2025年11月の献立。PDF）",
     "url": "https://saran.co.rs/Menu/%C5%A0aran%20Meni%20srpski%20nov%202025.pdf",
     "seen": "2026-11-22"
    },
    {
     "name": "Restoran Šaran「Meni」（店の頁。営業時間）",
     "url": "https://saran.co.rs/meni/",
     "seen": "2026-11-22"
    },
    {
     "name": "Tri šešira「Jelovnik」（店のネットの献立）",
     "url": "https://trisesira.rs/jelovnik/",
     "seen": "2026-11-22"
    }
   ],
   "eat": [
    "riblja"
   ]
  },
  {
   "id": "burek",
   "title": "朝ごはんにブレクを食べたい！",
   "lead": "薄い生地を重ねて焼いたパイに、飲むヨーグルト",
   "what": "パン屋で、チーズや肉を薄い生地で包んで焼いたブレクを買い、朝ごはんにする。ブレクは、チーズ・肉・ほうれん草・じゃがいもを薄い生地で包んだパイ。飲むヨーグルトと食べるのが昔からの食べかた。ブレクやギバニツァのような薄い生地のパイは、セルビアのふつうの朝ごはん。パン屋（ペカラ）は街のどこにでもあり、朝早くから夜遅くまで開いている。",
   "how": "パン屋のチェーンのフレブ・イ・キフレには、チーズや肉の「おばあちゃんのピタ」が並ぶ。トリ・シェシラでは、手で巻いた窯焼きのチーズのピタに発酵乳（キセロ・ムレコ）を添えて560ディナール。2人前の前菜の盛り合わせ（2,490ディナール）には自家製のブレクが入る。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Serbian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
     "seen": "2026-11-22"
    },
    {
     "name": "Hleb & Kifle「Пите」（店のネットの品書き）",
     "url": "https://hlebikifle.rs/kategorija-proizvoda/pite/",
     "seen": "2026-11-22"
    },
    {
     "name": "Tri šešira「Jelovnik」（店のネットの献立）",
     "url": "https://trisesira.rs/jelovnik/",
     "seen": "2026-11-22"
    }
   ],
   "eat": [
    "burek",
    "pita",
    "gibanica"
   ]
  },
  {
   "id": "novi-sad",
   "title": "ノヴィ・サドへ日帰りしたい！",
   "lead": "高速列車で36分。ドナウ河畔の要塞の町",
   "what": "セルビアで2番目に大きな街ノヴィ・サドへ日帰りで行き、ドナウ川を見下ろすペトロヴァラディン要塞に登る。ノヴィ・サドは、文化の中心として「セルビアのアテネ」と呼ばれてきた。2022年の欧州文化首都。ペトロヴァラディン要塞は「ドナウのジブラルタル」と呼ばれる要塞。時計塔は、長い針が時、短い針が分を指す。",
   "how": "ベオグラードとノヴィ・サドのあいだは高速の線になり、途中で止まらない高速列車「ソコ」なら36分ほど。2026年7月の時点で、ノヴィ・サド駅は屋根の崩落のあとの修理で閉まっていて、列車は川向こうのペトロヴァラディン駅に止まる。バスは15分おきに出ていて、速い便で90分。",
   "time": "",
   "money": "列車の切符は、ソコが697ディナール、普通の列車が469ディナール。",
   "tip": "ノヴィ・サドからドナウ川を下ったスレムスキ・カルロヴツィは、博物館・教会・画廊の多い小さな町。",
   "route": "",
   "see": [
    "petrovaradin",
    "karlovci"
   ],
   "src": [
    {
     "name": "Wikipedia「Novi Sad」",
     "url": "https://en.wikipedia.org/wiki/Novi_Sad",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikivoyage「Novi Sad」",
     "url": "https://en.wikivoyage.org/wiki/Novi_Sad",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Petrovaradin Fortress」",
     "url": "https://en.wikipedia.org/wiki/Petrovaradin_Fortress",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    }
   ],
   "marks": [
    {
     "kind": "price",
     "text": "列車697ディナール"
    }
   ]
  }
 ],
 "see": {
  "items": [
   {
    "id": "kalemegdan",
    "name": "ベオグラード要塞（カレメグダン公園）",
    "local": {
     "text": "Beogradska tvrđava / Kalemegdan",
     "lang": "sr",
     "roman": "Beogradska tvrdjava / Kalemegdan"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/p037152-661920-belgrade-fortress-3be9c0cb-960.webp",
     "small": "/guide/serbia/belgrade/photos/p037152-661920-belgrade-fortress-3be9c0cb-500.webp",
     "w": 960,
     "h": 595,
     "alt": "川の合流を見下ろす高台に、石の城壁が続くベオグラード要塞",
     "kind": "photo",
     "credit": {
      "by": "Oliver Bunic",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:P037152-661920_-_Belgrade_fortress_stand_at_the_downtown_of_Belgrade.jpg"
     }
    },
    "body": "サヴァ川とドナウ川の合流を見下ろす崖の上の要塞と公園。紀元前3世紀にケルト人の部族が築いた砦に始まり、のちにローマの軍団が陣を置いた。街でいちばん人が訪れる名所。",
    "facts": [
     {
      "label": "入る",
      "text": "24時間、ただで入れる。中に軍事博物館・教会・動物園がある"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kalemegdan+Beograd&hl=ja",
    "todo": [
     "kalemegdan"
    ],
    "src": [
     {
      "name": "Wikipedia「Belgrade Fortress」",
      "url": "https://en.wikipedia.org/wiki/Belgrade_Fortress",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:P037152-661920_-_Belgrade_fortress_stand_at_the_downtown_of_Belgrade.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.823502,
     "lon": 20.449765
    },
    "area": "kalemegdan"
   },
   {
    "id": "knez",
    "name": "クネズ・ミハイロ通り",
    "local": {
     "text": "Knez Mihailova",
     "lang": "sr",
     "roman": "Knez Mihailova"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/knez-mihailova-street-october-20-ba0d1992-960.webp",
     "small": "/guide/serbia/belgrade/photos/knez-mihailova-street-october-20-ba0d1992-500.webp",
     "w": 960,
     "h": 1051,
     "alt": "石畳の歩行者天国に、古い建物と店が並ぶクネズ・ミハイロ通り",
     "kind": "photo",
     "credit": {
      "by": "DKjellby",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Knez_Mihailova_Street_(October_2026,_1).jpg"
     }
    },
    "body": "カレメグダンから共和国広場へ延びる、長さ1kmの歩行者と買い物の目抜き通り。1870年代の終わりに建った屋敷が並び、1964年に街で初めての「通りごとの文化財」になった。",
    "facts": [
     {
      "label": "気をつける",
      "text": "人混みで、気づかないうちにバッグを開けられる被害が多い"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Knez+Mihailova+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Knez Mihailova Street」",
      "url": "https://en.wikipedia.org/wiki/Knez_Mihailova_Street",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Knez_Mihailova_Street_(October_2026,_1).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.816397,
     "lon": 20.45861
    },
    "area": "knez"
   },
   {
    "id": "sava",
    "name": "聖サヴァ大聖堂",
    "local": {
     "text": "Hram Svetog Save",
     "lang": "sr",
     "roman": "Hram Svetog Save"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/hram-svetog-save-beograd-0005-ed-70f8761b-960.webp",
     "small": "/guide/serbia/belgrade/photos/hram-svetog-save-beograd-0005-ed-70f8761b-500.webp",
     "w": 960,
     "h": 802,
     "alt": "白い壁と緑の丸屋根の聖サヴァ大聖堂",
     "kind": "photo",
     "credit": {
      "by": "Npps90",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Hram_svetog_save_beograd_0005_(edited).jpg"
     }
    },
    "body": "セルビアの守護聖人、聖サヴァにささげた正教会の聖堂で、正教会の聖堂では世界で4番目の大きさ。1935年に建て始め、外は2004年、中の金色のモザイクは2020年にできた。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "毎日8〜20時。入るのは無料"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Hram+Svetog+Save+Beograd&hl=ja",
    "todo": [
     "sava"
    ],
    "src": [
     {
      "name": "Wikipedia「Church of Saint Sava」",
      "url": "https://en.wikipedia.org/wiki/Church_of_Saint_Sava",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Hram_svetog_save_beograd_0005_(edited).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.798045,
     "lon": 20.469188
    },
    "line": "中心から3.2km",
    "area": "sava"
   },
   {
    "id": "skadarlija",
    "name": "スカダルリヤ",
    "local": {
     "text": "Skadarlija",
     "lang": "sr",
     "roman": "Skadarlija"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/skadarska-street-c941551f-960.webp",
     "small": "/guide/serbia/belgrade/photos/skadarska-street-c941551f-500.webp",
     "w": 960,
     "h": 720,
     "alt": "石畳の坂道の両側に、テラス席の並ぶスカダルリヤ",
     "kind": "photo",
     "credit": {
      "by": "Erwan Martin",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Skadarska_street.jpg"
     }
    },
    "body": "石畳の坂道に古いカファナ（伝統料理の食堂）が並ぶ、ベオグラードのボヘミアン地区。「ベオグラードのモンマルトル」とも呼ばれ、1967年から保護されている。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Skadarlija+Beograd&hl=ja",
    "todo": [
     "skadarlija"
    ],
    "src": [
     {
      "name": "Wikipedia「Skadarlija」",
      "url": "https://en.wikipedia.org/wiki/Skadarlija",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia（日本語）「スカダルリヤ」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%B9%E3%82%AB%E3%83%80%E3%83%AB%E3%83%AA%E3%83%A4",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Skadarska_street.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.818099,
     "lon": 20.464758
    },
    "area": "skadarlija"
   },
   {
    "id": "republic",
    "name": "共和国広場",
    "local": {
     "text": "Trg republike",
     "lang": "sr",
     "roman": "Trg republike"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/republic-square-27420599076-dc1a7bad-960.webp",
     "small": "/guide/serbia/belgrade/photos/republic-square-27420599076-dc1a7bad-500.webp",
     "w": 960,
     "h": 571,
     "alt": "共和国広場。ミハイロ公の騎馬像と、後ろの国立博物館",
     "kind": "photo",
     "credit": {
      "by": "Erik Cleves Kristensen",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Republic_Square_(27420599076).jpg"
     }
    },
    "body": "国立博物館・国立劇場と、ミハイロ公の騎馬像の立つ街の中心の広場。ミハイロ公は、オスマン帝国の兵をベオグラードから退かせる話し合いをした人。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Trg+republike+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Republic Square (Belgrade)」",
      "url": "https://en.wikipedia.org/wiki/Republic_Square_(Belgrade)",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Republic_Square_(27420599076).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.816222,
     "lon": 20.460295
    },
    "area": "knez"
   },
   {
    "id": "nmuseum",
    "name": "国立博物館",
    "local": {
     "text": "Narodni muzej Srbije",
     "lang": "sr",
     "roman": "Narodni muzej Srbije"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/national-museum-of-serbia-dsc046-369287f9-960.webp",
     "small": "/guide/serbia/belgrade/photos/national-museum-of-serbia-dsc046-369287f9-500.webp",
     "w": 960,
     "h": 540,
     "alt": "共和国広場に面した、丸屋根の国立博物館の正面",
     "kind": "photo",
     "credit": {
      "by": "Simon Legner ( User:simon04 )",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:National_Museum_of_Serbia_(DSC04612).jpg"
     }
    },
    "body": "1844年にできた、ベオグラードでいちばん大きく古い博物館。収蔵品は40万点を超え、旧石器・古代・中世・近代に分けて見せる。",
    "facts": [
     {
      "label": "入場",
      "text": "大人300ディナール。日曜は無料。入口は横のヴァセ・チャラピチャ通り"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Narodni+muzej+Srbije+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「National Museum of Serbia」",
      "url": "https://en.wikipedia.org/wiki/National_Museum_of_Serbia",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:National_Museum_of_Serbia_(DSC04612).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.816789,
     "lon": 20.459645
    },
    "area": "knez"
   },
   {
    "id": "tesla",
    "name": "ニコラ・テスラ博物館",
    "local": {
     "text": "Muzej Nikole Tesle",
     "lang": "sr",
     "roman": "Muzej Nikole Tesle"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/genciceva-kuca-6-618176b4-960.webp",
     "small": "/guide/serbia/belgrade/photos/genciceva-kuca-6-618176b4-500.webp",
     "w": 960,
     "h": 720,
     "alt": "ニコラ・テスラ博物館の入る、白い2階建ての屋敷",
     "kind": "photo",
     "credit": {
      "by": "Dungodung",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Gen%C4%8Di%C4%87eva_ku%C4%87a_6.jpg"
     }
    },
    "body": "発明家ニコラ・テスラの一生と仕事を伝える科学の博物館で、テスラの眠る場所。16万点を超える資料を持ち、テスラの資料は2003年にユネスコの「世界の記憶」に登録された。",
    "facts": [
     {
      "label": "見学",
      "text": "英語のガイドの見学は毎正時に始まり、実験の実演がある。800ディナールで現金だけ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzej+Nikole+Tesle+Beograd&hl=ja",
    "todo": [
     "tesla"
    ],
    "src": [
     {
      "name": "Wikipedia「Nikola Tesla Museum」",
      "url": "https://en.wikipedia.org/wiki/Nikola_Tesla_Museum",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Gen%C4%8Di%C4%87eva_ku%C4%87a_6.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.805105,
     "lon": 20.4707
    },
    "line": "中心から2.6km",
    "area": "sava"
   },
   {
    "id": "yugoslavia",
    "name": "ユーゴスラビア博物館（花の家）",
    "local": {
     "text": "Muzej Jugoslavije",
     "lang": "sr",
     "roman": "Muzej Jugoslavije"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/muzej-jugoslavije-003-b0b84d6e-960.webp",
     "small": "/guide/serbia/belgrade/photos/muzej-jugoslavije-003-b0b84d6e-500.webp",
     "w": 960,
     "h": 640,
     "alt": "緑の丘に立つ、ユーゴスラビア博物館の建物",
     "kind": "photo",
     "credit": {
      "by": "Ванилица",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Muzej_Jugoslavije_003.jpg"
     }
    },
    "body": "ユーゴスラビアの歴史と、大統領チトーの一生を伝える博物館。敷地の「花の家」に、チトーと妻ヨヴァンカが眠る。年に12万人が訪れる、セルビアでいちばん人の来る博物館。",
    "facts": [
     {
      "label": "入場",
      "text": "火〜日曜10〜18時。大人600ディナール"
     },
     {
      "label": "行きかた",
      "text": "トロリーバス40番か41番"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzej+Jugoslavije+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Museum of Yugoslavia」",
      "url": "https://en.wikipedia.org/wiki/Museum_of_Yugoslavia",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「House of Flowers (mausoleum)」",
      "url": "https://en.wikipedia.org/wiki/House_of_Flowers_(mausoleum)",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Muzej_Jugoslavije_003.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.788019,
     "lon": 20.452314
    },
    "line": "中心から4km"
   },
   {
    "id": "stmark",
    "name": "聖マルコ教会",
    "local": {
     "text": "Crkva Svetog Marka",
     "lang": "sr",
     "roman": "Crkva Svetog Marka"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/crkva-svetog-marka-beograd-st-ma-14b18849-960.webp",
     "small": "/guide/serbia/belgrade/photos/crkva-svetog-marka-beograd-st-ma-14b18849-500.webp",
     "w": 960,
     "h": 793,
     "alt": "赤と黄色の縞の壁の聖マルコ教会",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Crkva_svetog_Marka,_Beograd_(St._Mark%27s_Church,_Belgrade).jpg"
     }
    },
    "body": "タシュマイダン公園に立つ、セルビア・ビザンティン様式の正教会の教会。1931〜1940年に建ち、中にドゥシャン王の墓がある。外の形はグラチャニツァ修道院を手本にした。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "毎日7〜19時"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Crkva+Svetog+Marka+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Church of Saint Mark, Belgrade」",
      "url": "https://en.wikipedia.org/wiki/Church_of_Saint_Mark,_Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Crkva_svetog_Marka,_Beograd_(St._Mark%27s_Church,_Belgrade).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.810449,
     "lon": 20.468929
    },
    "area": "skadarlija"
   },
   {
    "id": "assembly",
    "name": "国会議事堂",
    "local": {
     "text": "Dom Narodne skupštine",
     "lang": "sr",
     "roman": "Dom Narodne skupstine"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/4e217d16-960.webp",
     "small": "/guide/serbia/belgrade/photos/4e217d16-500.webp",
     "w": 960,
     "h": 404,
     "alt": "緑の丸屋根の国会議事堂と、前の広場",
     "kind": "photo",
     "credit": {
      "by": "Boris Dimitrov",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:%D0%94%D0%BE%D0%BC_%D0%9D%D0%B0%D1%80%D0%BE%D0%B4%D0%BD%D0%B5_%D0%A1%D0%BA%D1%83%D0%BF%D1%88%D1%82%D0%B8%D0%BD%D0%B5_%D0%A1%D1%80%D0%B1%D0%B8%D1%98%D0%B5.jpg"
     }
    },
    "body": "1907〜1936年に建った、ネオ・バロック様式の議会の建物。ニコラ・パシッチ広場に立ち、向かいに大統領の住む新宮殿と、市庁舎の旧宮殿がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dom+Narodne+skup%C5%A1tine+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「House of the National Assembly, Belgrade」",
      "url": "https://en.wikipedia.org/wiki/House_of_the_National_Assembly,_Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:%D0%94%D0%BE%D0%BC_%D0%9D%D0%B0%D1%80%D0%BE%D0%B4%D0%BD%D0%B5_%D0%A1%D0%BA%D1%83%D0%BF%D1%88%D1%82%D0%B8%D0%BD%D0%B5_%D0%A1%D1%80%D0%B1%D0%B8%D1%98%D0%B5.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.811727,
     "lon": 20.465932
    },
    "area": "skadarlija"
   },
   {
    "id": "ljubica",
    "name": "リュビツァ妃の邸宅",
    "local": {
     "text": "Konak kneginje Ljubice",
     "lang": "sr",
     "roman": "Konak kneginje Ljubice"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/konak-knjeginje-ljubice-2-023f4bd0-960.webp",
     "small": "/guide/serbia/belgrade/photos/konak-knjeginje-ljubice-2-023f4bd0-500.webp",
     "w": 960,
     "h": 720,
     "alt": "白い壁に赤い瓦屋根の、リュビツァ妃の邸宅",
     "kind": "photo",
     "credit": {
      "by": "Original uploader was Goldfinger at sr.wikipedia",
      "lic": "CC BY-SA 3.0 rs",
      "page": "https://commons.wikimedia.org/wiki/File:Konak_knjeginje_Ljubice_2.JPG"
     }
    },
    "body": "ミロシュ・オブレノヴィチ公の妃リュビツァのために1830年に建った屋敷。1979年から市立博物館の分館で、オスマン風からヨーロッパ風へ移る19世紀の建築と家具を見せる。",
    "facts": [
     {
      "label": "入場",
      "text": "火〜土曜10〜17時、日曜10〜14時。大人200ディナール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Konak+kneginje+Ljubice+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Konak_knjeginje_Ljubice_2.JPG",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.817105,
     "lon": 20.452235
    },
    "area": "knez"
   },
   {
    "id": "bajrakli",
    "name": "バイラクリ・モスク",
    "local": {
     "text": "Bajrakli džamija",
     "lang": "sr",
     "roman": "Bajrakli dzamija"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/spoljasnost-bajrakli-dzamije-02-a619bd2f-960.webp",
     "small": "/guide/serbia/belgrade/photos/spoljasnost-bajrakli-dzamije-02-a619bd2f-500.webp",
     "w": 960,
     "h": 643,
     "alt": "石の壁と細い塔（ミナレット）のバイラクリ・モスク",
     "kind": "photo",
     "credit": {
      "by": "Missty011",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Spolja%C5%A1nost_Bajrakli_d%C5%BEamije_02.JPG"
     }
    },
    "body": "1575年ごろに建ったモスク。オスマン帝国の時代に街に273あったモスクのうち、残っているのはここだけ。名前はトルコ語で「旗のある」。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bajrakli+d%C5%BEamija+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Bajrakli Mosque, Belgrade」",
      "url": "https://en.wikipedia.org/wiki/Bajrakli_Mosque,_Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Spolja%C5%A1nost_Bajrakli_d%C5%BEamije_02.JPG",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.822057,
     "lon": 20.457349
    },
    "area": "knez"
   },
   {
    "id": "pobednik",
    "name": "勝利者の像（ポベドニク）",
    "local": {
     "text": "Pobednik",
     "lang": "sr",
     "roman": "Pobednik"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/pobednik-the-victor-belgrade-a232ff33-960.webp",
     "small": "/guide/serbia/belgrade/photos/pobednik-the-victor-belgrade-a232ff33-500.webp",
     "w": 960,
     "h": 1278,
     "alt": "高い柱の上に立つ勝利者の像",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Pobednik_(The_Victor,_Belgrade).jpg"
     }
    },
    "body": "要塞の上に立つ、高さ14mの記念の像。彫刻家イヴァン・メシュトロヴィチの作。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pobednik+Beograd&hl=ja",
    "todo": [
     "kalemegdan"
    ],
    "src": [
     {
      "name": "Wikipedia「Pobednik」",
      "url": "https://en.wikipedia.org/wiki/Pobednik",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Pobednik_(The_Victor,_Belgrade).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.823028,
     "lon": 20.447706
    },
    "area": "kalemegdan"
   },
   {
    "id": "military",
    "name": "軍事博物館",
    "local": {
     "text": "Vojni muzej",
     "lang": "sr",
     "roman": "Vojni muzej"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/f1872efc-960.webp",
     "small": "/guide/serbia/belgrade/photos/f1872efc-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "要塞の中の軍事博物館の建物と、前に並ぶ大砲",
     "kind": "photo",
     "credit": {
      "by": "Andrija12345678",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:%D0%A1%D0%B2%D1%98%D0%B5%D1%82%D0%BB%D0%BE%D0%BF%D0%B8%D1%81_%D0%92%D0%BE%D1%98%D0%BD%D0%BE%D0%B3_%D0%BC%D1%83%D0%B7%D0%B5%D1%98%D0%B0_%D1%83_%D0%91%D0%B8%D0%BE%D0%B3%D1%80%D0%B0%D0%B4%D1%83.jpg"
     }
    },
    "body": "要塞の中にある、1878年にできた軍事の博物館。ローマの剣やかぶと、セルビアの騎士の重い鎧から、近代の銃まで3,000点を超える品を持つ。",
    "facts": [
     {
      "label": "入場",
      "text": "火〜日曜10〜17時。大人350ディナール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Vojni+muzej+Beograd&hl=ja",
    "todo": [
     "kalemegdan"
    ],
    "src": [
     {
      "name": "Wikipedia「Military Museum, Belgrade」",
      "url": "https://en.wikipedia.org/wiki/Military_Museum,_Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:%D0%A1%D0%B2%D1%98%D0%B5%D1%82%D0%BB%D0%BE%D0%BF%D0%B8%D1%81_%D0%92%D0%BE%D1%98%D0%BD%D0%BE%D0%B3_%D0%BC%D1%83%D0%B7%D0%B5%D1%98%D0%B0_%D1%83_%D0%91%D0%B8%D0%BE%D0%B3%D1%80%D0%B0%D0%B4%D1%83.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.821919,
     "lon": 20.449806
    },
    "area": "kalemegdan"
   },
   {
    "id": "zemun",
    "name": "ゼムン河岸",
    "local": {
     "text": "Zemunski kej",
     "lang": "sr",
     "roman": "Zemunski kej"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/zemun-panorama-from-gardos-tower-6fb9f29a-960.webp",
     "small": "/guide/serbia/belgrade/photos/zemun-panorama-from-gardos-tower-6fb9f29a-500.webp",
     "w": 960,
     "h": 355,
     "alt": "ガルドシュの塔から見た、赤い屋根の並ぶゼムンの町とドナウ川",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Zemun_panorama_from_Gardo%C5%A1_tower.jpg"
     }
    },
    "body": "ゼムンの、ドナウ川に沿って何kmも続く散歩道。ガルドシュの丘の東に、食事の店が並ぶ。ゼムンは1934年にベオグラードに入った古い町。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Zemunski+kej+Beograd&hl=ja",
    "todo": [
     "riblja"
    ],
    "src": [
     {
      "name": "Wikipedia「Zemun」",
      "url": "https://en.wikipedia.org/wiki/Zemun",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Zemun_panorama_from_Gardo%C5%A1_tower.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.849309,
     "lon": 20.411248
    },
    "line": "中心から4.2km",
    "area": "zemun"
   },
   {
    "id": "gardos",
    "name": "ガルドシュの塔",
    "local": {
     "text": "Kula na Gardošu",
     "lang": "sr",
     "roman": "Kula na Gardosu"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/belgrad-zemun-kula-sibinjanin-ja-f0cecd31-960.webp",
     "small": "/guide/serbia/belgrade/photos/belgrad-zemun-kula-sibinjanin-ja-f0cecd31-500.webp",
     "w": 960,
     "h": 1661,
     "alt": "れんがの壁と尖った屋根のガルドシュの塔",
     "kind": "photo",
     "credit": {
      "by": "Stefan Didam - Schmallenberg",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Belgrad_(Zemun)_-_Kula_Sibinjanin_Janka.jpg"
     }
    },
    "body": "ゼムンのガルドシュの丘に立つ、高さ36mの塔。ハンガリー人の定住千年を祝って1896年に建てた7つの記念碑の1つで、いちばん南のもの。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kula+Gardo%C5%A1+Zemun+Beograd&hl=ja",
    "todo": [
     "riblja"
    ],
    "src": [
     {
      "name": "Wikipedia「Gardoš Tower」",
      "url": "https://en.wikipedia.org/wiki/Gardo%C5%A1_Tower",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Belgrad_(Zemun)_-_Kula_Sibinjanin_Janka.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.848124,
     "lon": 20.410728
    },
    "line": "中心から4.1km",
    "area": "zemun"
   },
   {
    "id": "ada",
    "name": "アダ・ツィガンリヤ",
    "local": {
     "text": "Ada Ciganlija",
     "lang": "sr",
     "roman": "Ada Ciganlija"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/sava-lake-4824475d-960.webp",
     "small": "/guide/serbia/belgrade/photos/sava-lake-4824475d-500.webp",
     "w": 567,
     "h": 426,
     "alt": "木々に囲まれた、サヴァ湖の静かな水面",
     "kind": "photo",
     "credit": {
      "by": "Zvonko at English Wikipedia ; Transfer was made by User:Mifter .",
      "lic": "PD",
      "page": "https://commons.wikimedia.org/wiki/File:Sava_Lake_(%D0%A1%D0%B0%D0%B2%D1%81%D0%BA%D0%BE_%D1%98%D0%B5%D0%B7%D0%B5%D1%80%D0%BE).jpg"
     }
    },
    "body": "サヴァ川の島をつないで半島にした、湖と浜のある憩いの場。夏は1日に10万人を超える人が来て、「ベオグラードの海」と呼ばれる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ada+Ciganlija+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Ada Ciganlija」",
      "url": "https://en.wikipedia.org/wiki/Ada_Ciganlija",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Sava_Lake_(%D0%A1%D0%B0%D0%B2%D1%81%D0%BA%D0%BE_%D1%98%D0%B5%D0%B7%D0%B5%D1%80%D0%BE).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.784437,
     "lon": 20.381037
    },
    "line": "中心から6.9km"
   },
   {
    "id": "msu",
    "name": "現代美術館",
    "local": {
     "text": "Muzej savremene umetnosti",
     "lang": "sr",
     "roman": "Muzej savremene umetnosti"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/beograd-muzej-savremene-umetnost-35ddc026-960.webp",
     "small": "/guide/serbia/belgrade/photos/beograd-muzej-savremene-umetnost-35ddc026-500.webp",
     "w": 960,
     "h": 516,
     "alt": "白い角ばった箱を重ねたような現代美術館の建物",
     "kind": "photo",
     "credit": {
      "by": "Fred Romero",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Beograd_-_Muzej_Savremene_Umetnosti_(MoCAB)_(crop).jpg"
     }
    },
    "body": "1958年にできた、20世紀からの美術の美術館。1965年から新ベオグラードのいまの建物で、3万5,000点を超える作品を持つ。",
    "facts": [
     {
      "label": "入場",
      "text": "水〜月曜11〜19時。大人600ディナール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzej+savremene+umetnosti+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Museum of Contemporary Art, Belgrade」",
      "url": "https://en.wikipedia.org/wiki/Museum_of_Contemporary_Art,_Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Beograd_-_Muzej_Savremene_Umetnosti_(MoCAB)_(crop).jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.819594,
     "lon": 20.4424
    },
    "area": "kalemegdan"
   },
   {
    "id": "zoo",
    "name": "ベオグラード動物園",
    "local": {
     "text": "Beo zoo vrt",
     "lang": "sr",
     "roman": "Beo zoo vrt"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/beli-lav-belgrade-zoo-ce44e763-960.webp",
     "small": "/guide/serbia/belgrade/photos/beli-lav-belgrade-zoo-ce44e763-500.webp",
     "w": 960,
     "h": 720,
     "alt": "ベオグラード動物園の白いライオン",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Beli_lav_Belgrade_zoo.JPG"
     }
    },
    "body": "カレメグダン公園の中に1936年にできた動物園。210種・およそ800頭の動物がいる、セルビアでいちばん大きな動物園。",
    "facts": [
     {
      "label": "入場",
      "text": "大人700ディナール。4〜10月は8〜20時半、11〜3月は8〜17時"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Beo+zoo+vrt+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Belgrade Zoo」",
      "url": "https://en.wikipedia.org/wiki/Belgrade_Zoo",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Beli_lav_Belgrade_zoo.JPG",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.825851,
     "lon": 20.453607
    },
    "area": "kalemegdan"
   },
   {
    "id": "ethno",
    "name": "民族学博物館",
    "local": {
     "text": "Etnografski muzej",
     "lang": "sr",
     "roman": "Etnografski muzej"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/musee-ethnographique-de-belgrade-260944f0-960.webp",
     "small": "/guide/serbia/belgrade/photos/musee-ethnographique-de-belgrade-260944f0-500.webp",
     "w": 486,
     "h": 513,
     "alt": "学生広場に面した、民族学博物館の建物",
     "kind": "photo",
     "credit": {
      "by": "Original uploader was en:User:BoskoM at en.wikipedia Own work",
      "lic": "PD",
      "page": "https://commons.wikimedia.org/wiki/File:Mus%C3%A9e_ethnographique_de_Belgrade.jpg"
     }
    },
    "body": "バルカンでも古い博物館の1つ。セルビアの民族衣装・道具・昔の暮らしを広く見せる。",
    "facts": [
     {
      "label": "入場",
      "text": "木〜火曜10〜20時。大人200ディナール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Etnografski+muzej+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Ethnographic Museum, Belgrade」",
      "url": "https://en.wikipedia.org/wiki/Ethnographic_Museum,_Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Mus%C3%A9e_ethnographique_de_Belgrade.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.819873,
     "lon": 20.456459
    },
    "area": "knez"
   },
   {
    "id": "dorcol",
    "name": "ドルチョル",
    "local": {
     "text": "Dorćol",
     "lang": "sr",
     "roman": "Dorcol"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/rue-cara-dusanova-a-belgrade-a4e0b7bc-960.webp",
     "small": "/guide/serbia/belgrade/photos/rue-cara-dusanova-a-belgrade-a4e0b7bc-500.webp",
     "w": 650,
     "h": 487,
     "alt": "ドルチョルの、古い建物の並ぶツァラ・ドゥシャナ通り",
     "kind": "photo",
     "credit": {
      "by": "en:User:BoskoM",
      "lic": "PD",
      "page": "https://commons.wikimedia.org/wiki/File:Rue_Cara_Du%C5%A1anova_%C3%A0_Belgrade.jpg"
     }
    },
    "body": "モスクのあたりからドナウ川の岸まで下る、街でいちばん古く残る地区。名前はトルコ語の「4つの道」から。2000年代から、店と画廊が増えた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dor%C4%87ol+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Dorćol」",
      "url": "https://en.wikipedia.org/wiki/Dor%C4%87ol",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Rue_Cara_Du%C5%A1anova_%C3%A0_Belgrade.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 44.822631,
     "lon": 20.461478
    },
    "area": "knez"
   },
   {
    "id": "petrovaradin",
    "name": "ペトロヴァラディン要塞（ノヴィ・サド）",
    "local": {
     "text": "Petrovaradinska tvrđava",
     "lang": "sr",
     "roman": "Petrovaradinska tvrdjava"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/petrovaradin-fortress-petervarad-f5764db8-960.webp",
     "small": "/guide/serbia/belgrade/photos/petrovaradin-fortress-petervarad-f5764db8-500.webp",
     "w": 960,
     "h": 372,
     "alt": "ドナウ川の岸の上に続く、ペトロヴァラディン要塞の城壁",
     "kind": "photo",
     "credit": {
      "by": "Pudelek (Marcin Szala)",
      "lic": "CC BY-SA 3.0 rs",
      "page": "https://commons.wikimedia.org/wiki/File:Petrovaradin_Fortress_(P%C3%A9terv%C3%A1radi_v%C3%A1r,_Peterwardein).JPG"
     }
    },
    "body": "ノヴィ・サドの対岸、ドナウ川の右岸に立つ稜堡の要塞で、「ドナウのジブラルタル」と呼ばれる。いまの南の部分の礎石は1692年。時計塔の針は、長い針が時、短い針が分を指す。",
    "facts": [
     {
      "label": "行きかた",
      "text": "ベオグラードから高速列車「ソコ」で36分ほど"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Petrovaradinska+tvr%C4%91ava+Novi+Sad&hl=ja",
    "todo": [
     "novi-sad"
    ],
    "src": [
     {
      "name": "Wikipedia「Petrovaradin Fortress」",
      "url": "https://en.wikipedia.org/wiki/Petrovaradin_Fortress",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Novi Sad」",
      "url": "https://en.wikivoyage.org/wiki/Novi_Sad",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Petrovaradin_Fortress_(P%C3%A9terv%C3%A1radi_v%C3%A1r,_Peterwardein).JPG",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 45.252155,
     "lon": 19.863828
    },
    "line": "中心から66km"
   },
   {
    "id": "karlovci",
    "name": "スレムスキ・カルロヴツィ",
    "local": {
     "text": "Sremski Karlovci",
     "lang": "sr",
     "roman": "Sremski Karlovci"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/serbia/belgrade/photos/vidikovac-sremski-karlovci-8295-adac84d0-960.webp",
     "small": "/guide/serbia/belgrade/photos/vidikovac-sremski-karlovci-8295-adac84d0-500.webp",
     "w": 960,
     "h": 640,
     "alt": "丘から見下ろした、スレムスキ・カルロヴツィの町並みと教会",
     "kind": "photo",
     "credit": {
      "by": "Ванилица",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Vidikovac_Sremski_Karlovci_8295_10.jpg"
     }
    },
    "body": "ノヴィ・サドからドナウ川を下った小さな町。ハプスブルク帝国の時代にセルビア正教会の座が置かれ、1848年の革命のときはセルビア人の政治と文化の中心だった。博物館・教会・画廊が多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sremski+Karlovci&hl=ja",
    "todo": [
     "novi-sad"
    ],
    "src": [
     {
      "name": "Wikipedia「Sremski Karlovci」",
      "url": "https://en.wikipedia.org/wiki/Sremski_Karlovci",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Vidikovac_Sremski_Karlovci_8295_10.jpg",
      "seen": "2026-11-22"
     }
    ],
    "geo": {
     "lat": 45.203046,
     "lon": 19.933834
    },
    "line": "中心から59km"
   }
  ],
  "far": [
   {
    "id": "sava",
    "name": "聖サヴァ大聖堂",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Hram+Svetog+Save+Beograd&hl=ja",
    "km": 3.2
   },
   {
    "id": "tesla",
    "name": "ニコラ・テスラ博物館",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzej+Nikole+Tesle+Beograd&hl=ja",
    "km": 2.6
   },
   {
    "id": "yugoslavia",
    "name": "ユーゴスラビア博物館",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzej+Jugoslavije+Beograd&hl=ja",
    "km": 4.0
   },
   {
    "id": "zemun",
    "name": "ゼムン河岸",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Zemunski+kej+Beograd&hl=ja",
    "km": 4.2
   },
   {
    "id": "gardos",
    "name": "ガルドシュの塔",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kula+Gardo%C5%A1+Zemun+Beograd&hl=ja",
    "km": 4.1
   },
   {
    "id": "ada",
    "name": "アダ・ツィガンリヤ",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ada+Ciganlija+Beograd&hl=ja",
    "km": 6.9
   },
   {
    "id": "petrovaradin",
    "name": "ペトロヴァラディン要塞",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Petrovaradinska+tvr%C4%91ava+Novi+Sad&hl=ja",
    "km": 66
   },
   {
    "id": "karlovci",
    "name": "スレムスキ・カルロヴツィ",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Sremski+Karlovci&hl=ja",
    "km": 59
   }
  ],
  "map": {
   "mid": "1eJkbz3IwpNs6w25h_7t_S7Bi1iL5PSk",
   "title": "ベオグラード｜見たいもの",
   "ll": "44.8182,20.4557",
   "z": 13,
   "pins": 23
  }
 },
 "eat": {
  "kinds": [
   {
    "id": "local",
    "label": "セルビアの料理"
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
    "id": "cevapi",
    "name": "チェヴァプチチ（棒の形の焼いたひき肉）",
    "local": {
     "text": "Ćevapi",
     "lang": "sr",
     "roman": "Ćevapi"
    },
    "body": "ひき肉を棒の形にして焼いた料理で、セルビアの国の料理とされる。5〜10本を皿か平たいパンにのせ、刻んだ玉ねぎ・カイマクを添えることが多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）・トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）・カファナ「？」（ズナク・ピタニャ）"
     },
     {
      "label": "豚肉",
      "text": "ひき肉は豚か牛。ワルテルの献立では牛肉だけ。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%86evapi+Beograd&hl=ja",
    "places": [
     "walter",
     "trisesira",
     "sesirmoj",
     "znak"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Ćevapi」",
      "url": "https://en.wikipedia.org/wiki/%C4%86evapi",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Walter「Kompakt meni — Centralni」（市の中の店の献立。2026年10月の PDF）",
      "url": "https://kopakt-menus.walter.rs/SR/Kompakt-Walter-Centralni-SR.pdf",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "pljeskavica",
    "name": "プリェスカヴィツァ（セルビア風ハンバーグ）",
    "local": {
     "text": "Pljeskavica",
     "lang": "sr",
     "roman": "Pljeskavica"
    },
    "body": "ひき肉に香辛料で味をつけて平たく焼いた、セルビアの国の料理の1つ。皿か平たいパンにのせ、玉ねぎを添える。",
    "facts": [
     {
      "label": "どこで",
      "text": "ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）・トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）"
     },
     {
      "label": "豚肉",
      "text": "もとは豚・牛・羊のひき肉を合わせる。ワルテルとシェシル・モイの献立では牛肉。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pljeskavica+Beograd&hl=ja",
    "places": [
     "walter",
     "trisesira",
     "sesirmoj"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Pljeskavica」",
      "url": "https://en.wikipedia.org/wiki/Pljeskavica",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Walter「Kompakt meni — Centralni」（市の中の店の献立。2026年10月の PDF）",
      "url": "https://kopakt-menus.walter.rs/SR/Kompakt-Walter-Centralni-SR.pdf",
      "seen": "2026-11-22"
     },
     {
      "name": "Šešir moj「Jelovnik / Menu」（2025年4月の献立。PDF）",
      "url": "https://www.sesirmoj.rs/_files/ugd/adcb74_2977c0d7fa2642af95c635540b811fd6.pdf",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "karadjordjeva",
    "name": "カラジョルジェヴァ・シュニツラ（カイマク入りのカツ）",
    "local": {
     "text": "Karađorđeva šnicla",
     "lang": "sr",
     "roman": "Karađorđeva šnicla"
    },
    "body": "巻いた子牛・豚・鶏の肉にカイマクを詰め、衣をつけて揚げたカツ。タルタルソースとレモンを添える。1956〜1957年にチトーの料理人が思いついたとされる。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）"
     },
     {
      "label": "豚肉",
      "text": "シェシル・モイの献立では、豚のエスカロープ（1,450ディナール）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kara%C4%91or%C4%91eva+%C5%A1nicla+Beograd&hl=ja",
    "places": [
     "trisesira",
     "sesirmoj"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Karađorđeva šnicla」",
      "url": "https://en.wikipedia.org/wiki/Kara%C4%91or%C4%91eva_%C5%A1nicla",
      "seen": "2026-11-22"
     },
     {
      "name": "Šešir moj「Jelovnik / Menu」（2025年4月の献立。PDF）",
      "url": "https://www.sesirmoj.rs/_files/ugd/adcb74_2977c0d7fa2642af95c635540b811fd6.pdf",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "sarma",
    "name": "サルマ（ロールキャベツ）",
    "local": {
     "text": "Sarma",
     "lang": "sr",
     "roman": "Sarma"
    },
    "body": "酢漬けのキャベツ・ふだん草・ぶどうの葉で、米とひき肉を包んだ料理。セルビアの国の料理の1つ。",
    "facts": [
     {
      "label": "豚肉",
      "text": "ひき肉は豚か牛。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sarma+Beograd&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "paprike",
    "name": "プニェネ・パプリケ（ピーマンの肉詰め）",
    "local": {
     "text": "Punjene paprike",
     "lang": "sr",
     "roman": "Punjene paprike"
    },
    "body": "ピーマンに米とひき肉を詰めた料理。",
    "facts": [
     {
      "label": "豚肉",
      "text": "ひき肉の種類は店や家で違う（料理の説明は「米とひき肉」まで）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Punjene+paprike+Beograd&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "pasulj",
    "name": "パスリ（豆の煮込み）",
    "local": {
     "text": "Pasulj",
     "lang": "sr",
     "roman": "Pasulj"
    },
    "body": "白いんげんなどの豆を煮込んだスープ。冬、とくにクリスマスのころによく食べる。",
    "facts": [
     {
      "label": "どこで",
      "text": "ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     },
     {
      "label": "豚肉",
      "text": "燻製のベーコン・ソーセージ・豚の足を入れることが多い。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pasulj+Beograd&hl=ja",
    "places": [
     "walter"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Pasulj」",
      "url": "https://en.wikipedia.org/wiki/Pasulj",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "prebranac",
    "name": "プレブラナツ（豆の重ね焼き）",
    "local": {
     "text": "Prebranac",
     "lang": "sr",
     "roman": "Prebranac"
    },
    "body": "豆のキャセロール。",
    "facts": [
     {
      "label": "どこで",
      "text": "シェシル・モイ（スカダルリヤのカファナ）"
     },
     {
      "label": "豚肉",
      "text": "シェシル・モイの献立では「セルビアの豆」（580ディナール）。肉が入るかは書いていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Prebranac+Beograd&hl=ja",
    "places": [
     "sesirmoj"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Šešir moj「Jelovnik / Menu」（2025年4月の献立。PDF）",
      "url": "https://www.sesirmoj.rs/_files/ugd/adcb74_2977c0d7fa2642af95c635540b811fd6.pdf",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "muckalica",
    "name": "ムチュカリツァ（焼いた肉の煮込み）",
    "local": {
     "text": "Mućkalica",
     "lang": "sr",
     "roman": "Mućkalica"
    },
    "body": "炭火で焼いた肉と野菜を煮込んだ辛いシチュー。名前は「混ぜる」という意味の言葉から。レスコヴァツ風がいちばん知られる。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）"
     },
     {
      "label": "豚肉",
      "text": "肉は店や地方で違う。トリ・シェシラの献立は「レスコヴァツ風」（1,280ディナール）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mu%C4%87kalica+Beograd&hl=ja",
    "places": [
     "trisesira",
     "sesirmoj"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Mućkalica」",
      "url": "https://en.wikipedia.org/wiki/Mu%C4%87kalica",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Tri šešira「Jelovnik」（店のネットの献立）",
      "url": "https://trisesira.rs/jelovnik/",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "riblja",
    "name": "リブリャ・チョルバ（魚のスープ）",
    "local": {
     "text": "Riblja čorba",
     "lang": "sr",
     "roman": "Riblja čorba"
    },
    "body": "パプリカで味をつけた魚のスープで、パンノニア地方の料理。",
    "facts": [
     {
      "label": "どこで",
      "text": "シャラン（ゼムン河岸の魚料理）・トリ・シェシラ（スカダルリヤのカファナ）"
     },
     {
      "label": "豚肉",
      "text": "シャランの献立では、骨を抜いた鯉の切り身が入る（1,120ディナール）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Riblja+%C4%8Dorba+Beograd&hl=ja",
    "places": [
     "saran",
     "trisesira"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Restoran Šaran「Meni」（2025年11月の献立。PDF）",
      "url": "https://saran.co.rs/Menu/%C5%A0aran%20Meni%20srpski%20nov%202025.pdf",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "kajmak",
    "name": "カイマク（乳脂のクリーム）",
    "local": {
     "text": "Kajmak",
     "lang": "sr",
     "roman": "Kajmak"
    },
    "body": "生乳をゆっくり煮てから弱火で2時間ほど温め、表面にできる乳脂を集めたクリーム。",
    "facts": [
     {
      "label": "どこで",
      "text": "シェシル・モイ（スカダルリヤのカファナ）・ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kajmak+Beograd&hl=ja",
    "places": [
     "sesirmoj",
     "walter"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Kaymak」",
      "url": "https://en.wikipedia.org/wiki/Kaymak",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "ajvar",
    "name": "アイバル（赤ピーマンのペースト）",
    "local": {
     "text": "Ajvar",
     "lang": "sr",
     "roman": "Ajvar"
    },
    "body": "焼いた赤ピーマンを主に作るペースト。甘いもの・ピリ辛・とても辛いものがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "シェシル・モイ（スカダルリヤのカファナ）・トリ・シェシラ（スカダルリヤのカファナ）・ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ajvar+Beograd&hl=ja",
    "places": [
     "sesirmoj",
     "trisesira",
     "walter"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Ajvar」",
      "url": "https://en.wikipedia.org/wiki/Ajvar",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "urnebes",
    "name": "ウルネベス（チーズと唐辛子のペースト）",
    "local": {
     "text": "Urnebes",
     "lang": "sr",
     "roman": "Urnebes"
    },
    "body": "白いチーズとカイマクに辛い唐辛子を混ぜたペースト。名前は「めちゃくちゃ」という意味。ニシュと南セルビアの名物。",
    "facts": [
     {
      "label": "どこで",
      "text": "シェシル・モイ（スカダルリヤのカファナ）・ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Urnebes+Beograd&hl=ja",
    "places": [
     "sesirmoj",
     "walter"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Urnebes」",
      "url": "https://en.wikipedia.org/wiki/Urnebes",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "sopska",
    "name": "ショプスカ・サラダ",
    "local": {
     "text": "Šopska salata",
     "lang": "sr",
     "roman": "Šopska salata"
    },
    "body": "トマト・きゅうり・玉ねぎのサラダに、白いチーズをのせる。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）・シャラン（ゼムン河岸の魚料理）・ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C5%A0opska+salata+Beograd&hl=ja",
    "places": [
     "trisesira",
     "sesirmoj",
     "saran",
     "walter"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "cvarci",
    "name": "チュヴァルツィ（豚の脂かす）",
    "local": {
     "text": "Čvarci",
     "lang": "sr",
     "roman": "Čvarci"
    },
    "body": "豚の脂を溶かしてラードを作るときに残る、かりかりの脂かす。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C4%8Cvarci+Beograd&hl=ja",
    "kinds": [
     "local"
    ],
    "flags": {
     "pork": true
    },
    "src": [
     {
      "name": "Wikipedia「Čvarci」",
      "url": "https://en.wikipedia.org/wiki/%C4%8Cvarci",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "burek",
    "name": "ブレク（薄い生地のパイ）",
    "local": {
     "text": "Burek",
     "lang": "sr",
     "roman": "Burek"
    },
    "body": "チーズ・肉・ほうれん草・じゃがいもを薄い生地で包んで焼いたパイ。飲むヨーグルトと食べるのが昔からの食べかた。",
    "facts": [
     {
      "label": "豚肉",
      "text": "中身はチーズ・肉・ほうれん草・じゃがいもなど。肉の種類は確かめていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Burek+Beograd&hl=ja",
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "pita",
    "name": "チーズのピタ（薄い生地のパイ）",
    "local": {
     "text": "Pita",
     "lang": "sr",
     "roman": "Pita"
    },
    "body": "薄い生地のパイは、セルビアの朝ごはんの定番。パン屋のフレブ・イ・キフレには、チーズ・肉・さくらんぼ・りんごの「おばあちゃんのピタ」が並ぶ。",
    "facts": [
     {
      "label": "どこで",
      "text": "フレブ・イ・キフレ ゼレニ・ヴェナツ店（パン屋）・トリ・シェシラ（スカダルリヤのカファナ）"
     },
     {
      "label": "豚肉",
      "text": "フレブ・イ・キフレには肉のピタもある（肉の種類は品書きに無い）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pita+Beograd&hl=ja",
    "places": [
     "hlebikifle",
     "trisesira"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Hleb & Kifle「Пите」（店のネットの品書き）",
      "url": "https://hlebikifle.rs/kategorija-proizvoda/pite/",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "gibanica",
    "name": "ギバニツァ（チーズと卵のパイ）",
    "local": {
     "text": "Gibanica",
     "lang": "sr",
     "roman": "Gibanica"
    },
    "body": "カッテージチーズと卵を、薄い生地と重ねて焼いたパイ。1818年のヴク・カラジッチのセルビア語の辞書にも出てくる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Gibanica+Beograd&hl=ja",
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Gibanica」",
      "url": "https://en.wikipedia.org/wiki/Gibanica",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "proja",
    "name": "プロヤ（とうもろこしのパン）",
    "local": {
     "text": "Proja",
     "lang": "sr",
     "roman": "Proja"
    },
    "body": "とうもろこしの粉で焼くパンで、セルビアの国の料理の1つ。朝ごはんに食べることが多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "シェシル・モイ（スカダルリヤのカファナ）・カファナ「？」（ズナク・ピタニャ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Proja+Beograd&hl=ja",
    "places": [
     "sesirmoj",
     "znak"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Proja」",
      "url": "https://en.wikipedia.org/wiki/Proja",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "palacinke",
    "name": "パラチンケ（クレープ）",
    "local": {
     "text": "Palačinke",
     "lang": "sr",
     "roman": "Palačinke"
    },
    "body": "チョコレート・ジャム・くるみなどを包んだクレープ。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pala%C4%8Dinke+Beograd&hl=ja",
    "places": [
     "trisesira",
     "sesirmoj"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "krempita",
    "name": "クレムピタ（カスタードのケーキ）",
    "local": {
     "text": "Krempita",
     "lang": "sr",
     "roman": "Krempita"
    },
    "body": "カスタードとクリームを重ねたケーキ。トリ・シェシラの献立では「ベオグラードのクレムピタ」。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Krempita+Beograd&hl=ja",
    "places": [
     "trisesira",
     "sesirmoj"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Tri šešira「Jelovnik」（店のネットの献立）",
      "url": "https://trisesira.rs/jelovnik/",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "baklava",
    "name": "バクラヴァ",
    "local": {
     "text": "Baklava",
     "lang": "sr",
     "roman": "Baklava"
    },
    "body": "薄い生地を重ねて刻んだナッツを挟み、シロップか蜂蜜で甘くした菓子。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・シェシル・モイ（スカダルリヤのカファナ）・ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Baklava+Beograd&hl=ja",
    "places": [
     "trisesira",
     "sesirmoj",
     "walter"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "tufahije",
    "name": "トゥファヒヤ（くるみ入りの煮りんご）",
    "local": {
     "text": "Tufahije",
     "lang": "sr",
     "roman": "Tufahije"
    },
    "body": "くるみを詰めたりんごを、砂糖の入った湯で煮た菓子。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tufahije+Beograd&hl=ja",
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "vanilice",
    "name": "ヴァニリツェ（バニラのクッキー）",
    "local": {
     "text": "Vanilice",
     "lang": "sr",
     "roman": "Vanilice"
    },
    "body": "バニラのクッキー。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Vanilice+Beograd&hl=ja",
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "rakija",
    "name": "ラキヤ（果物の蒸留酒）",
    "local": {
     "text": "Rakija",
     "lang": "sr",
     "roman": "Rakija"
    },
    "body": "果物から作る蒸留酒で、アルコールはふつう40%。すもものシュリヴォヴィツァ・マルメロのドゥニェヴァチャ・洋なしのヴィリャモヴカ・あんずのカイシエヴァチャ・ぶどうのロザがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）・ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Rakija+Beograd&hl=ja",
    "places": [
     "trisesira",
     "walter"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Rakia」",
      "url": "https://en.wikipedia.org/wiki/Rakia",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "kafa",
    "name": "ドマチャ・カファ（セルビアのコーヒー）",
    "local": {
     "text": "Domaća kafa",
     "lang": "sr",
     "roman": "Domaća kafa"
    },
    "body": "朝ごはんの前に、昔ながらのコーヒー（ドマチャ・カファ）かエスプレッソを飲む人が多い。ほかの淹れかたを頼まなければ、セルビア風（トルコ風）のコーヒーが出てくる。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Doma%C4%87a+kafa+Beograd&hl=ja",
    "places": [
     "trisesira"
    ],
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "pivo",
    "name": "セルビアのビール",
    "local": {
     "text": "Pivo",
     "lang": "sr",
     "roman": "Pivo"
    },
    "body": "ビールはこのごろ人気で、昔からのラキヤやワインをしのぐほど飲まれている。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pivo+Beograd&hl=ja",
    "places": [
     "trisesira"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "prokupac",
    "name": "プロクパツ（セルビアの赤ワイン）",
    "local": {
     "text": "Prokupac",
     "lang": "sr",
     "roman": "Prokupac"
    },
    "body": "セルビアの赤ワインのぶどう。新鮮さと黒い果実の香りで知られる。",
    "facts": [
     {
      "label": "どこで",
      "text": "トリ・シェシラ（スカダルリヤのカファナ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Prokupac+Beograd&hl=ja",
    "places": [
     "trisesira"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Prokupac」",
      "url": "https://en.wikipedia.org/wiki/Prokupac",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "walter",
    "name": "ワルテル ストラヒニチャ・バナ通り店（チェヴァピ）",
    "what": "チェヴァピのチェーン。市の中の店の献立に、牛肉のチェヴァピ125gと半分の平たいパンで565ディナール（2026年10月）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Walter+Beograd&hl=ja",
    "src": [
     {
      "name": "Walter「Kompakt meni — Centralni」（市の中の店の献立。2026年10月の PDF）",
      "url": "https://kopakt-menus.walter.rs/SR/Kompakt-Walter-Centralni-SR.pdf",
      "seen": "2026-11-22"
     },
     {
      "name": "Walter「Kompakt meni」（店ごとの献立の表。ストラヒニチャ・バナ通りの店は「Centralni」）",
      "url": "https://walter.rs/meni/",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Валтер」",
      "url": "https://www.openstreetmap.org/node/3030604566",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Walter",
    "went": false
   },
   {
    "id": "trisesira",
    "name": "トリ・シェシラ（スカダルリヤのカファナ）",
    "what": "1864年に開いた、スカダルリヤでいちばん古いいまも営むカファナ（2022年の時点）。献立に炭火焼き・魚のスープ・菓子。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Tri+%C5%A1e%C5%A1ira+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Skadarlija」",
      "url": "https://en.wikipedia.org/wiki/Skadarlija",
      "seen": "2026-11-22"
     },
     {
      "name": "Tri šešira「Jelovnik」（店のネットの献立）",
      "url": "https://trisesira.rs/jelovnik/",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Tri šešira",
    "went": false
   },
   {
    "id": "sesirmoj",
    "name": "シェシル・モイ（スカダルリヤのカファナ）",
    "what": "スカダルリヤ通り21番のカファナ。楽団が舟歌などを演奏し、セルビアの料理を出す。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%C5%A0e%C5%A1ir+moj+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Šešir moj「Jelovnik / Menu」（2025年4月の献立。PDF）",
      "url": "https://www.sesirmoj.rs/_files/ugd/adcb74_2977c0d7fa2642af95c635540b811fd6.pdf",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Šešir moj",
    "went": false
   },
   {
    "id": "znak",
    "name": "カファナ「？」（ズナク・ピタニャ）",
    "what": "店の頁が「ベオグラードでいちばん古い店」と書くカファナ。チェヴァピから、酢漬けキャベツの鶏ももの煮込み・プロヤ・菓子まで出す。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Znak+pitanja+Beograd&hl=ja",
    "src": [
     {
      "name": "Kafana Znak Pitanja「Najstarija kafana u Beogradu」（店の頁。2026年4月17日更新）",
      "url": "https://www.znakpitanja.rs/",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Znak pitanja",
    "went": false
   },
   {
    "id": "saran",
    "name": "シャラン（ゼムン河岸の魚料理）",
    "what": "ゼムン河岸の魚料理の店。2025年11月の献立に魚のスープと魚のパプリカ煮込み。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%C5%A0aran+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Restoran Šaran「Meni」（2025年11月の献立。PDF）",
      "url": "https://saran.co.rs/Menu/%C5%A0aran%20Meni%20srpski%20nov%202025.pdf",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Šaran",
    "km": 4.0,
    "went": false
   },
   {
    "id": "hlebikifle",
    "name": "フレブ・イ・キフレ ゼレニ・ヴェナツ店（パン屋）",
    "what": "パン屋のチェーン。品書きにチーズ・肉・さくらんぼ・りんごの「おばあちゃんのピタ」。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Hleb+%26+Kifle+Beograd&hl=ja",
    "src": [
     {
      "name": "Hleb & Kifle「Пите」（店のネットの品書き）",
      "url": "https://hlebikifle.rs/kategorija-proizvoda/pite/",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Хлеб & Кифле」",
      "url": "https://www.openstreetmap.org/node/13175631361",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Hleb & Kifle"
   }
  ],
  "map": {
   "mid": "1iQam-CrGDFdKbfWzh05JthqVbishCdc",
   "title": "ベオグラード｜食べたいもの",
   "ll": "44.8313,20.4388",
   "z": 12,
   "pins": 6
  }
 },
 "buy": {
  "items": [
   {
    "id": "rakija",
    "name": "ラキヤの瓶",
    "local": {
     "text": "Rakija",
     "lang": "sr",
     "roman": "Rakija"
    },
    "body": "果物から作る蒸留酒。すもものシュリヴォヴィツァ・マルメロのドゥニェヴァチャなどがある。乾杯は「ジヴェリ！」。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラキヤ・バーの土産の店（テラズィイェ通り）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Rakija+Beograd&hl=ja",
    "places": [
     "rakiabar"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Rakia」",
      "url": "https://en.wikipedia.org/wiki/Rakia",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "medovaca",
    "name": "メドヴァチャ（蜂蜜のラキヤ）",
    "local": {
     "text": "Medovača",
     "lang": "sr",
     "roman": "Medovaca"
    },
    "body": "蜂蜜を合わせたラキヤ。ラキヤ・バーの土産の店では、焼いた土の瓶に入れて売る。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラキヤ・バーの土産の店（テラズィイェ通り）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Medova%C4%8Da+Beograd&hl=ja",
    "places": [
     "rakiabar"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Rakia bar「RAKIA BAR - Gift shop」（土産の店の頁）",
      "url": "https://shop.rakiabar.com/",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "ajvar",
    "name": "アイバルの瓶詰め",
    "local": {
     "text": "Ajvar",
     "lang": "sr",
     "roman": "Ajvar"
    },
    "body": "焼いた赤ピーマンを主に作るペースト。甘いもの・ピリ辛・とても辛いものがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラキヤ・バーの土産の店（テラズィイェ通り）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ajvar+Beograd&hl=ja",
    "places": [
     "rakiabar"
    ],
    "src": [
     {
      "name": "Wikipedia「Ajvar」",
      "url": "https://en.wikipedia.org/wiki/Ajvar",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "plazma",
    "name": "プラズマ（ビスケット）",
    "local": {
     "text": "Plazma",
     "lang": "sr",
     "roman": "Plazma"
    },
    "body": "バンビ社のやわらかいビスケットで、1967年に出た。砕いて重ねた「プラズマのケーキ」もある。",
    "facts": [
     {
      "label": "どこで",
      "text": "イデア ツァラ・ドゥシャナ通り店（スーパー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Plazma+Beograd&hl=ja",
    "places": [
     "idea"
    ],
    "src": [
     {
      "name": "Wikipedia「Plazma (biscuit)」",
      "url": "https://en.wikipedia.org/wiki/Plazma_(biscuit)",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikipedia「Serbian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Serbian_cuisine",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "eurocrem",
    "name": "エウロクレム（2色のチョコクリーム）",
    "local": {
     "text": "Eurocrem",
     "lang": "sr",
     "roman": "Eurocrem"
    },
    "body": "茶と白の2色の、ヘーゼルナッツとココアのスプレッド。ベオグラードの南のゴルニ・ミラノヴァツの工場で作り、ユーゴスラビアでいちばん人気の品だった。",
    "facts": [
     {
      "label": "どこで",
      "text": "マクシ（スーパー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Eurocrem+Beograd&hl=ja",
    "places": [
     "maxi"
    ],
    "src": [
     {
      "name": "Wikipedia「Eurocrem」",
      "url": "https://en.wikipedia.org/wiki/Eurocrem",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "smoki",
    "name": "スモキ（ピーナッツ味のスナック）",
    "local": {
     "text": "Smoki",
     "lang": "sr",
     "roman": "Smoki"
    },
    "body": "ピーナッツ味の、ふくらませたとうもろこしのスナック。1972年にゼムンで生まれた、南東ヨーロッパで初めての品。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Smoki+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Smoki」",
      "url": "https://en.wikipedia.org/wiki/Smoki",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "opanci",
    "name": "オパンツィ（革の伝統の靴）",
    "local": {
     "text": "Opanci",
     "lang": "sr",
     "roman": "Opanci"
    },
    "body": "革で作った、ひもの無い農民の伝統の靴。セルビアでは、つま先の角のような形で産地が分かる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Opanci+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Opanak」",
      "url": "https://en.wikipedia.org/wiki/Opanak",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "pirot",
    "name": "ピロトのキリム（織物の敷物）",
    "local": {
     "text": "Pirotski ćilim",
     "lang": "sr",
     "roman": "Pirotski cilim"
    },
    "body": "南東セルビアの町ピロトで織られてきた、平織りの敷物。セルビアの国の象徴の1つとされる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pirotski+%C4%87ilim+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Pirot carpet」",
      "url": "https://en.wikipedia.org/wiki/Pirot_carpet",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "prokupac",
    "name": "プロクパツのワイン",
    "local": {
     "text": "Prokupac",
     "lang": "sr",
     "roman": "Prokupac"
    },
    "body": "セルビアの赤ワインのぶどうプロクパツのワイン。新鮮さと黒い果実の香りで知られ、近年は質の高いワインに使われている。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Prokupac+Beograd&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Prokupac」",
      "url": "https://en.wikipedia.org/wiki/Prokupac",
      "seen": "2026-11-22"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "rakiabar",
    "name": "ラキヤ・バーの土産の店（テラズィイェ通り）",
    "what": "テラズィイェ通り42番の土産の店。ラキヤの瓶と、昔の作りかたのアイバル・ジャムを置く。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Rakia+bar+Gift+shop+Beograd&hl=ja",
    "src": [
     {
      "name": "Rakia bar「RAKIA BAR - Gift shop」（土産の店の頁）",
      "url": "https://shop.rakiabar.com/",
      "seen": "2026-11-22"
     },
     {
      "name": "Rakia bar「Rakije」（土産の店の品書き）",
      "url": "https://shop.rakiabar.com/rakije.html",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Rakia bar Gift shop",
    "went": false
   },
   {
    "id": "idea",
    "name": "イデア ツァラ・ドゥシャナ通り店（スーパー）",
    "what": "セルビアのおもなスーパーのチェーンの1つ。店の頁で、プラズマ300gを2つ買うと袋がもらえる売り出しをしている。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Idea+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Idea「Plazma」（スーパーの売り出しの頁）",
      "url": "https://www.idea.rs/Aktuelno/Plazma",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「IDEA」",
      "url": "https://www.openstreetmap.org/node/5077027000",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Idea"
   },
   {
    "id": "maxi",
    "name": "マクシ（スーパー）",
    "what": "セルビアのおもなスーパーのチェーンの1つ。ネットの品書きにエウロクレム。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Maxi+Beograd&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     },
     {
      "name": "Maxi「Krem Eurocrem činija 500g」（スーパーのネットの品書き）",
      "url": "https://www.maxi.rs/Slatki-i-slani-konditori/Chokoladni-proizvodi/Kremovi-i-proizvodi-sa-kremom/Krem-Eurocrem-cinija-500g/p/7175886",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Maxi」",
      "url": "https://www.openstreetmap.org/way/103256672",
      "seen": "2026-11-22"
     }
    ],
    "roman": "Maxi",
    "km": 5.5
   }
  ],
  "map": {
   "mid": "1BEwt84P5M0F1lNlVJN0_3hSNNWh1H-Q",
   "title": "ベオグラード｜買いたいもの",
   "ll": "44.8085,20.4825",
   "z": 12,
   "pins": 3
  }
 },
 "videos": {
  "streams": {
   "country": "serbia",
   "city": "セルビア"
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
    "lead": "平年の最高気温が19〜30℃",
    "to": "#guide-season"
   },
   {
    "id": "safety",
    "icon": "key",
    "label": "治安",
    "value": "スリに注意",
    "lead": "バスと観光地の人混みで",
    "to": "#guide-safety"
   },
   {
    "id": "budget",
    "icon": "wallet",
    "label": "乗り物の目安",
    "value": "市内は無料",
    "lead": "バス・トラム・トロリーバス",
    "to": "#budget"
   },
   {
    "id": "transit",
    "icon": "bus",
    "label": "移動",
    "value": "トラム11系統",
    "lead": "地下鉄はまだ無い。バスが中心",
    "to": "#guide-transit"
   }
  ],
  "guides": [
   {
    "id": "airport",
    "icon": "plane",
    "title": "空港から市内へ",
    "lead": "無料の72番か、ミニバスA1で中心へ",
    "parts": [
     {
      "h": "",
      "text": "ベオグラード・ニコラ・テスラ空港（BEG）は、市の中心から西へ18km。"
     },
     {
      "h": "",
      "text": "72番のバスは無料で、30分おきに新ベオグラードの駅を通ってゼレニ・ヴェナツまで約50分。5時〜23時半。"
     },
     {
      "h": "",
      "text": "ミニバスA1は、バスターミナルを通ってスラヴィヤ広場まで約30分。400ディナール（約590円）か4ユーロを運転手に払う（2026年1月）。夜も走る。"
     },
     {
      "h": "",
      "text": "タクシーは配車アプリか電話で呼ぶのがいちばん安全。到着ロビーで待っているタクシーは悪質なものが多い。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "transit",
    "icon": "bus",
    "title": "市内の乗り物",
    "lead": "市内のバスとトラムは無料",
    "parts": [
     {
      "h": "",
      "text": "市内のバス・トラム・トロリーバスは無料。列車と、E番の急行バスは別。"
     },
     {
      "h": "",
      "text": "タクシーは国の決めた料金で、初乗り270ディナール、1kmごとに96〜125ディナール、待ちは1分20ディナール。"
     },
     {
      "h": "",
      "text": "タクシーは、屋根に市の紋章と番号の札があり、ナンバーが TX で終わるものに乗る。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "pay",
    "icon": "currency",
    "title": "払いかたとチップ",
    "lead": "通貨はディナール。カードも使える",
    "parts": [
     {
      "h": "",
      "text": "通貨はディナール（RSD）。1ディナールは約1.48円（2026年11月20日）。"
     },
     {
      "h": "",
      "text": "セルビアは EU とユーロ圏に入っていないが、銀行のカードはふつうに使える。"
     },
     {
      "h": "",
      "text": "空港の両替所のレートは公式のレートから5%以内で、悪くない。"
     },
     {
      "h": "",
      "text": "タクシーのチップは、喜ばれるが要らない。荷物の料金はメーターに入っている。"
     }
    ],
    "src": [
     {
      "name": "Wikipedia「Serbian dinar」",
      "url": "https://en.wikipedia.org/wiki/Serbian_dinar",
      "seen": "2026-11-22"
     },
     {
      "name": "kurs.resenje.org「EUR 2026-11-20」（セルビア国立銀行の公式の中間レート 第222号の写し）",
      "url": "https://kurs.resenje.org/api/v1/currencies/eur/rates/2026-11-20",
      "seen": "2026-11-22"
     },
     {
      "name": "欧州中央銀行（ユーロの参照レート。2026年11月20日）",
      "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "sim",
    "icon": "sim",
    "title": "ネットと SIM",
    "lead": "携帯の会社は3つ。4Gが広い",
    "parts": [
     {
      "h": "",
      "text": "携帯の会社は A1・mts・Yettel の3つ。街と幹線道路は4Gで、大きな街では5Gも始まった。"
     },
     {
      "h": "",
      "text": "配車アプリは SMS で電話番号を確かめるので、携帯の会社によっては届かないことがある。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "safety",
    "icon": "key",
    "title": "治安のコツ",
    "lead": "人混みのスリに注意",
    "parts": [
     {
      "h": "",
      "text": "クネズ・ミハイロ通りやカレメグダン公園、大きなショッピングモールの人混みで、気づかないうちにバッグを開けられる被害がある。"
     },
     {
      "h": "",
      "text": "バスで数人に不自然に体を寄せられ、揺れに乗じてバッグを開けられた例がある。混んだ車両は避ける。"
     },
     {
      "h": "",
      "text": "リュックや肩掛けのバッグは、体の前に抱える。"
     },
     {
      "h": "",
      "text": "政治の課題をめぐるデモが続いている。デモには近寄らない。"
     },
     {
      "h": "水道水",
      "text": "水道水は飲めるが、とくに山あいでは硬い。市販のミネラルウォーターを飲むこともすすめられている。"
     }
    ],
    "src": [
     {
      "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "id": "phrases",
    "icon": "phrase",
    "title": "セルビア語のひとこと",
    "lead": "Dobar dan（ドバル・ダン）＝こんにちは",
    "parts": [],
    "src": [
     {
      "name": "Wikivoyage「Serbian phrasebook」",
      "url": "https://en.wikivoyage.org/wiki/Serbian_phrasebook",
      "seen": "2026-11-22"
     }
    ],
    "words": [
     {
      "local": {
       "text": "Dobar dan",
       "lang": "sr",
       "roman": "dobar dan",
       "kana": "ドバル・ダン"
      },
      "jp": "こんにちは"
     },
     {
      "local": {
       "text": "Hvala",
       "lang": "sr",
       "roman": "hvala",
       "kana": "フヴァラ"
      },
      "jp": "ありがとう"
     },
     {
      "local": {
       "text": "Molim",
       "lang": "sr",
       "roman": "molim",
       "kana": "モリム"
      },
      "jp": "お願いします"
     },
     {
      "local": {
       "text": "Da",
       "lang": "sr",
       "roman": "da",
       "kana": "ダ"
      },
      "jp": "はい"
     },
     {
      "local": {
       "text": "Ne",
       "lang": "sr",
       "roman": "ne",
       "kana": "ネ"
      },
      "jp": "いいえ"
     },
     {
      "local": {
       "text": "Izvinite",
       "lang": "sr",
       "roman": "izvinite",
       "kana": "イズヴィニテ"
      },
      "jp": "すみません"
     },
     {
      "local": {
       "text": "Koliko ovo košta?",
       "lang": "sr",
       "roman": "koliko ovo kosta",
       "kana": "コリコ・オヴォ・コシュタ？"
      },
      "jp": "これはいくらですか？"
     },
     {
      "local": {
       "text": "Račun, molim",
       "lang": "sr",
       "roman": "racun molim",
       "kana": "ラチュン・モリム"
      },
      "jp": "お勘定をお願いします"
     },
     {
      "local": {
       "text": "Živeli!",
       "lang": "sr",
       "roman": "ziveli",
       "kana": "ジヴェリ！"
      },
      "jp": "乾杯！"
     },
     {
      "local": {
       "text": "Doviđenja",
       "lang": "sr",
       "roman": "dovidjenja",
       "kana": "ドヴィジェニャ"
      },
      "jp": "さようなら"
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
     "text": "平年の最高気温が19〜30℃になるのは4〜10月。11月は12.2℃、12月は6.1℃まで下がる。"
    },
    {
     "h": "祝日",
     "text": "2月15日は国の日（スレテニェ）。1804年の第一次セルビア蜂起の始まりと、1835年の最初の近代の憲法を記念する。"
    },
    {
     "h": "時差",
     "text": "セルビアは中央ヨーロッパ時間（UTC+1）で、日本より8時間遅い。3月の最終日曜から10月の最終日曜までは夏時間（UTC+2）で7時間遅い。"
    }
   ],
   "src": [
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Statehood Day (Serbia)」",
     "url": "https://en.wikipedia.org/wiki/Statehood_Day_(Serbia)",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Time in Serbia」",
     "url": "https://en.wikipedia.org/wiki/Time_in_Serbia",
     "seen": "2026-11-22"
    }
   ]
  },
  "budget": {
   "rows": [],
   "tips": [],
   "days": [],
   "extras": [
    {
     "label": "空港のミニバスA1",
     "local": "400ディナール",
     "yen": "590円",
     "src": [
      {
       "name": "Wikivoyage「Belgrade」",
       "url": "https://en.wikivoyage.org/wiki/Belgrade",
       "seen": "2026-11-22"
      }
     ]
    },
    {
     "label": "タクシーの初乗り",
     "local": "270ディナール",
     "yen": "400円",
     "src": [
      {
       "name": "Wikivoyage「Belgrade」",
       "url": "https://en.wikivoyage.org/wiki/Belgrade",
       "seen": "2026-11-22"
      }
     ]
    },
    {
     "label": "タクシー1kmごと",
     "local": "96〜125ディナール",
     "yen": "140〜190円",
     "src": [
      {
       "name": "Wikivoyage「Belgrade」",
       "url": "https://en.wikivoyage.org/wiki/Belgrade",
       "seen": "2026-11-22"
      }
     ]
    },
    {
     "label": "高速列車ソコ（ノヴィ・サドまで）",
     "local": "697ディナール",
     "yen": "1,030円",
     "src": [
      {
       "name": "Wikivoyage「Novi Sad」",
       "url": "https://en.wikivoyage.org/wiki/Novi_Sad",
       "seen": "2026-11-22"
      }
     ]
    },
    {
     "label": "普通の列車（ノヴィ・サドまで）",
     "local": "469ディナール",
     "yen": "700円",
     "src": [
      {
       "name": "Wikivoyage「Novi Sad」",
       "url": "https://en.wikivoyage.org/wiki/Novi_Sad",
       "seen": "2026-11-22"
      }
     ]
    }
   ],
   "rate": "1ディナールは約1.48円。セルビア・ディナール（RSD）は、1ユーロ＝117.6412ディナール（セルビア国立銀行の2026年11月20日の中間レート）と、1ユーロ＝174.35円（同じ日の欧州中央銀行の参照レート）で直した。",
   "rateSrc": [
    {
     "name": "kurs.resenje.org「EUR 2026-11-20」（セルビア国立銀行の公式の中間レート 第222号の写し）",
     "url": "https://kurs.resenje.org/api/v1/currencies/eur/rates/2026-11-20",
     "seen": "2026-11-22"
    },
    {
     "name": "欧州中央銀行（ユーロの参照レート。2026年11月20日）",
     "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
     "seen": "2026-11-22"
    }
   ]
  },
  "pack": [
   {
    "icon": "passport",
    "label": "パスポート",
    "why": "いつも持ち歩くよう言われていて、私服の警察官に見せることもある。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "icon": "coin",
    "label": "少しのディナールの現金",
    "why": "テスラ博物館の見学は現金だけ。",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "icon": "jacket",
    "label": "冬の上着",
    "why": "12月の平年の最低気温は0.5℃、1月は-0.7℃。",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "icon": "bottle",
    "label": "水のボトル",
    "why": "水道水は飲める。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
      "seen": "2026-11-22"
     },
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "icon": "firstaid",
    "label": "海外旅行の保険",
    "why": "セルビア政府は、2万ユーロ以上の医療費をまかなう保険を勧めている。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
      "seen": "2026-11-22"
     }
    ]
   },
   {
    "icon": "phrase",
    "label": "翻訳のアプリ",
    "why": "英語はよく通じるが、病院には外国語の通じない人もいる。",
    "src": [
     {
      "name": "Wikivoyage「Belgrade」",
      "url": "https://en.wikivoyage.org/wiki/Belgrade",
      "seen": "2026-11-22"
     }
    ]
   }
  ],
  "climate": {
   "months": [
    {
     "hi": 5.2,
     "lo": -0.7,
     "mm": 47.9
    },
    {
     "hi": 7.8,
     "lo": 0.6,
     "mm": 43.5
    },
    {
     "hi": 13.1,
     "lo": 4.2,
     "mm": 48.7
    },
    {
     "hi": 18.9,
     "lo": 8.8,
     "mm": 51.5
    },
    {
     "hi": 23.6,
     "lo": 13.2,
     "mm": 72.3
    },
    {
     "hi": 27.1,
     "lo": 16.7,
     "mm": 95.6
    },
    {
     "hi": 29.3,
     "lo": 18.4,
     "mm": 66.5
    },
    {
     "hi": 29.7,
     "lo": 18.5,
     "mm": 55.1
    },
    {
     "hi": 24.3,
     "lo": 14.1,
     "mm": 58.6
    },
    {
     "hi": 18.7,
     "lo": 9.4,
     "mm": 54.8
    },
    {
     "hi": 12.2,
     "lo": 5.1,
     "mm": 49.6
    },
    {
     "hi": 6.1,
     "lo": 0.5,
     "mm": 54.8
    }
   ],
   "note": "平均最高と平均最低。ベオグラード（平年値）",
   "src": [
    {
     "name": "Wikivoyage「Belgrade」",
     "url": "https://en.wikivoyage.org/wiki/Belgrade",
     "seen": "2026-11-22"
    },
    {
     "name": "Wikipedia「Belgrade」",
     "url": "https://en.wikipedia.org/wiki/Belgrade",
     "seen": "2026-11-22"
    }
   ]
  },
  "help": {
   "calls": [
    {
     "num": "192",
     "label": "警察",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
       "seen": "2026-11-22"
      }
     ]
    },
    {
     "num": "193",
     "label": "消防",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
       "seen": "2026-11-22"
      }
     ]
    },
    {
     "num": "194",
     "label": "救急",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
       "seen": "2026-11-22"
      }
     ]
    }
   ],
   "embassy": {
    "name": "在セルビア日本国大使館",
    "address": "Trešnjinog cveta 13, Novi Beograd",
    "tel": "（市外局番011）301-2800",
    "note": "新ベオグラードに日本の大使館がある。開館は8時半から17時で、夜と休日は緊急の電話に回る。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ambasada+Japana+Beograd&hl=ja",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（セルビア 安全対策基礎データ。2026年3月16日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_175.html",
      "seen": "2026-11-22"
     },
     {
      "name": "OpenStreetMap「Амбасада Јапана」",
      "url": "https://www.openstreetmap.org/relation/8813142",
      "seen": "2026-11-22"
     }
    ]
   }
  }
 },
 "published": "2026-11-22",
 "updated": "2026-11-23",
 "hash": "f3d25eca203e0961"
}
/* END GUIDE */;
