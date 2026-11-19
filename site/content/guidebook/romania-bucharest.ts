/**
 * ブカレストのガイドブック（`/travel/romania/bucharest`）の中身。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/romania/bucharest/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_bake.py romania/bucharest` で焼き直す。
 * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。
 */
import type { Guidebook } from "./types";

export const BUCHAREST: Guidebook = /* BEGIN GUIDE */
{
 "country": "romania",
 "city": "bucharest",
 "name": "ブカレスト",
 "kicker": "ルーマニア",
 "local": {
  "text": "București",
  "lang": "ro",
  "roman": "Bucuresti"
 },
 "lead": "「東欧のパリ」と称えられた街",
 "cover": {
  "src": "/guide/romania/bucharest/photos/ateneo-rumano-bucarest-rumania-2-0b72e4bc-960.webp",
  "small": "/guide/romania/bucharest/photos/ateneo-rumano-bucarest-rumania-2-0b72e4bc-500.webp",
  "w": 960,
  "h": 723,
  "alt": "白い柱と緑の丸屋根のルーマニア・アテネ音楽堂。前に芝生の庭",
  "kind": "photo",
  "credit": {
   "by": "Diego Delso (1974–)",
   "lic": "CC BY-SA 4.0",
   "page": "https://commons.wikimedia.org/wiki/File:Ateneo_Rumano,_Bucarest,_Ruman%C3%ADa,_2016-05-29,_DD_73.jpg"
  }
 },
 "title": "ブカレスト観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜ルーマニア",
 "description": "ルーマニアの首都ブカレストの観光ガイド。見どころマップと、やりたいこと8つ（国民の館の見学、ドラキュラ城への日帰り、老舗ビアホール、アテネ音楽堂）、サルマーレとパパナシ。",
 "rate": {
  "unit": "レイ",
  "yen": 32.7,
  "date": "2026-11-18"
 },
 "about": {
  "cards": [
   {
    "id": "paris",
    "icon": "plaza",
    "q": "なぜ「小パリ」？",
    "a": "戦間期のブカレストは、優雅な建物の並ぶ街並みから「小パリ」と呼ばれた。いまの凱旋門は1936年にできた。",
    "src": [
     {
      "name": "Wikipedia（日本語）「ブカレスト」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "palace",
    "icon": "museum",
    "q": "国民の館って何？",
    "a": "チャウシェスク政権が1984年に建て始めた議会の建物。重さは世界一とされ、いまも7割ほどが使われていない。",
    "src": [
     {
      "name": "Wikipedia「Palace of the Parliament」",
      "url": "https://en.wikipedia.org/wiki/Palace_of_the_Parliament",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "dracula",
    "icon": "castle",
    "q": "ドラキュラと関係ある？",
    "a": "ブカレストが史書に初めて出るのは1459年。ドラキュラのモデルとされるヴラド・ツェペシュの居城としてだった。",
    "src": [
     {
      "name": "Wikipedia（日本語）「ブカレスト」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia（日本語）「ヴラド・ツェペシュ」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%B4%E3%83%A9%E3%83%89%E3%83%BB%E3%83%84%E3%82%A7%E3%83%9A%E3%82%B7%E3%83%A5",
      "seen": "2026-11-19"
     }
    ]
   }
  ],
  "areas": [
   {
    "id": "old-town",
    "name": "旧市街",
    "color": "#ffd98a",
    "lead": "リプスカニ通りを中心にした石畳の一帯",
    "see": [
     "old-town",
     "stavropoleos",
     "curtea",
     "carusel",
     "cec",
     "manuc",
     "macca"
    ],
    "plan": [
     2,
     1,
     2
    ],
    "src": [
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia（日本語）「ブカレスト」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Centrul Vechi」",
      "url": "https://www.openstreetmap.org/way/240572668",
      "seen": "2026-11-19"
     }
    ],
    "body": "古い教会と宿屋のあいだに、レストランとバーが並ぶ。",
    "local": {
     "text": "Centrul Vechi",
     "lang": "ro",
     "roman": "Centrul Vechi"
    }
   },
   {
    "id": "civic",
    "name": "国民の館周辺",
    "color": "#d9ccf5",
    "lead": "国民の館と、統一広場へまっすぐ延びる大通りの一帯",
    "see": [
     "palace",
     "patriarchal",
     "salvation"
    ],
    "plan": [
     3,
     1,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Palace of the Parliament」",
      "url": "https://en.wikipedia.org/wiki/Palace_of_the_Parliament",
      "seen": "2026-11-19"
     },
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Palatul Parlamentului」",
      "url": "https://www.openstreetmap.org/relation/2230391",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Piața Unirii」",
      "url": "https://www.openstreetmap.org/way/1457676979",
      "seen": "2026-11-19"
     }
    ],
    "body": "総主教大聖堂の丘もここ。",
    "local": {
     "text": "Centrul Civic",
     "lang": "ro",
     "roman": "Centrul Civic"
    }
   },
   {
    "id": "revolution",
    "name": "革命広場周辺",
    "color": "#ffc4d2",
    "lead": "勝利通り沿いに、アテネ音楽堂や旧王宮の建物が並ぶ",
    "see": [
     "revolution",
     "athenaeum",
     "calea",
     "national-art",
     "cismigiu"
    ],
    "plan": [
     1,
     1,
     2
    ],
    "src": [
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Piața Revoluției」",
      "url": "https://www.openstreetmap.org/way/1454580957",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Ateneul Român」",
      "url": "https://www.openstreetmap.org/way/16291602",
      "seen": "2026-11-19"
     }
    ],
    "body": "1989年の革命の舞台になった広場がまん中。",
    "local": {
     "text": "Piața Revoluției",
     "lang": "ro",
     "roman": "Piata Revolutiei"
    }
   }
  ]
 },
 "todo": [
  {
   "id": "palace",
   "title": "巨大な国民の館を見学したい！",
   "lead": "重さ世界一とされる議会の建物の中へ",
   "what": "議会の建物「国民の館」の中を、ガイドについて歩いて回る。チャウシェスクの命で1984年に建て始めた。12階・1,100の部屋があり、重さは世界一とされる。いまも議会の下院と上院が入っていて、建物の7割ほどは使われていない。床の広さは36万5,000平方メートル。地下にも8階あり、いちばん下は核シェルター。材料はほとんどルーマニアのもので、大理石が100万立方メートル、クリスタルのシャンデリアが480基（メディアシュのガラス工場の作）。建てるために、ウラヌスの丘を平らにし、古い街の中心のおよそ7平方キロメートルを取り壊した。",
   "how": "見学はガイドつきで、パスポートを持って行く。西の棟には国立現代美術館があり、2004年に開いた。ガラスの別棟から外の入口で入る。",
   "time": "見学はおよそ1時間20分。",
   "money": "",
   "tip": "",
   "route": "",
   "see": [
    "palace"
   ],
   "src": [
    {
     "name": "Wikivoyage「Bucharest」",
     "url": "https://en.wikivoyage.org/wiki/Bucharest",
     "seen": "2026-11-19"
    },
    {
     "name": "Wikipedia「Palace of the Parliament」",
     "url": "https://en.wikipedia.org/wiki/Palace_of_the_Parliament",
     "seen": "2026-11-19"
    }
   ]
  },
  {
   "id": "bran",
   "title": "ドラキュラ城へ日帰りしたい！",
   "lead": "トランシルヴァニアの山あいに立つ14世紀の城",
   "what": "ブラン城（ドラキュラ城）を見に、トランシルヴァニアの山あいまで日帰りで行く。1377年にトランシルヴァニアとワラキアの境を守るために建った城。「ドラキュラ城」の名で売り出されている。",
   "how": "ブカレストから列車かバスでブラショフまで約3時間。ブラショフのバスターミナル2から、ブラン行きのバスで約45分。",
   "time": "10月から3月は16時に閉まる。",
   "money": "",
   "tip": "入口の券売機は混みやすいので、切符はネットで買っておくとよい。",
   "route": "",
   "see": [
    "bran"
   ],
   "src": [
    {
     "name": "Wikivoyage「Bran」",
     "url": "https://en.wikivoyage.org/wiki/Bran",
     "seen": "2026-11-19"
    }
   ]
  },
  {
   "id": "caru",
   "title": "老舗ビアホールで乾杯したい！",
   "lead": "1879年の醸造所から始まった旧市街の名店",
   "what": "旧市街のビアホール、カル・ク・ベレでビールを飲む。1879年にビールの醸造所として始まり、1899年にレストランになった。ネオ・ゴシックの建物で、中はアール・ヌーヴォーの飾り。",
   "how": "旧市街のスタヴロポレオス通り5番。",
   "time": "",
   "money": "自家製のビールは300mlで22.5レイ、400mlで29.5レイ、1リットルで65.5レイ（2026年9月の献立）。サルマーレは87レイ、パパナシは61レイ（同じ献立）。",
   "tip": "「1メートルのビール」は、10杯ぶん・4リットルを1枚の板にのせて出す（222レイ）。献立はルーマニア語と英語。ミティテイ・豆のチョルバ・焼きなすのサラダも載っている。",
   "route": "",
   "see": [
    "old-town",
    "stavropoleos"
   ],
   "src": [
    {
     "name": "Wikipedia「Caru' cu Bere」",
     "url": "https://en.wikipedia.org/wiki/Caru%27_cu_Bere",
     "seen": "2026-11-19"
    },
    {
     "name": "Caru' cu Bere「Meniu băutură」（2026年9月の献立）",
     "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-bautura-carucubere-septembrie.pdf",
     "seen": "2026-11-19"
    },
    {
     "name": "Caru' cu Bere「Meniu mâncare」（2026年9月の献立）",
     "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-mancare-carucubere-septembrie.pdf",
     "seen": "2026-11-19"
    }
   ],
   "eat": [
    "bere",
    "mici",
    "sarmale"
   ]
  },
  {
   "id": "sarmale",
   "title": "本場のサルマーレを食べたい！",
   "lead": "ロールキャベツにママリガとサワークリーム",
   "what": "ルーマニアのロールキャベツ、サルマーレを食べる。酢漬けのキャベツかぶどうの葉で、ひき肉と米と玉ねぎを包み、陶器の鍋で何時間も煮る。とうもろこしの粥ママリガを添えて食べることが多い。",
   "how": "ラ・ママでは、キャベツのサルマーレにママリガと燻製の豚ばらを添えて、3個42レイ・5個56レイ（2026年版の献立）。カル・ク・ベレでは、ママリガ・サワークリーム・青唐辛子を添えて87レイ（2026年9月の献立）。",
   "time": "",
   "money": "",
   "tip": "米と香草だけで包んだ、肉の入らない作りもある。ラ・ママのサルマーレの中身は、豚と牛のひき肉・玉ねぎ・トマトペースト・米。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikipedia「Romanian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
     "seen": "2026-11-19"
    },
    {
     "name": "La Mama「Meniu」（ediția 1/2026）",
     "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
     "seen": "2026-11-19"
    },
    {
     "name": "Caru' cu Bere「Meniu mâncare」（2026年9月の献立）",
     "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-mancare-carucubere-septembrie.pdf",
     "seen": "2026-11-19"
    }
   ],
   "eat": [
    "sarmale",
    "mamaliga"
   ]
  },
  {
   "id": "papanasi",
   "title": "揚げたてのパパナシを食べたい！",
   "lead": "チーズの生地にジャムとサワークリーム",
   "what": "ルーマニアの揚げドーナツ、パパナシを食べる。甘いチーズと卵とセモリナの生地を、ゆでるか揚げて作る。果物のジャムかシロップと、サワークリームをかける。",
   "how": "ラ・ママでは、生の牛のチーズの生地に、ジャムとサワークリームをかけて1個21レイ・2個32レイ（2026年版の献立）。カル・ク・ベレでは、甘いチーズの生地に自家製のジャムとサワークリームで61レイ（2026年9月の献立）。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikipedia「Romanian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
     "seen": "2026-11-19"
    },
    {
     "name": "La Mama「Meniu」（ediția 1/2026）",
     "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
     "seen": "2026-11-19"
    },
    {
     "name": "Caru' cu Bere「Meniu mâncare」（2026年9月の献立）",
     "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-mancare-carucubere-septembrie.pdf",
     "seen": "2026-11-19"
    }
   ],
   "eat": [
    "papanasi"
   ]
  },
  {
   "id": "carusel",
   "title": "光あふれる本屋さんに行きたい！",
   "lead": "銀行だった建物を直した白い吹き抜けの書店",
   "what": "旧市街の書店、カルトゥレシュティ・カルセルの中を歩く。20世紀の初めにクリソヴェローニ家の銀行の本店として建った建物。荒れていたのを5年かけて直し、2015年に直し終えた。",
   "how": "旧市街のリプスカニ通り55番。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "",
   "see": [
    "carusel",
    "old-town"
   ],
   "src": [
    {
     "name": "Wikipedia「Cărturești Carusel」",
     "url": "https://en.wikipedia.org/wiki/C%C4%83rture%C8%99ti_Carusel",
     "seen": "2026-11-19"
    }
   ]
  },
  {
   "id": "athenaeum",
   "title": "アテネ音楽堂で名曲を聴きたい！",
   "lead": "1888年に開いた丸屋根のホールで演奏会",
   "what": "ルーマニア・アテネ音楽堂で、ジョルジェ・エネスク・フィルハーモニーの演奏会を聴く。1888年に開いた、街でいちばん格の高い音楽堂。丸屋根の円い建物で、ジョルジェ・エネスク音楽祭の会場でもある。",
   "how": "切符はネットと、アテネ音楽堂の窓口で買える（2025-2026年の季節）。",
   "time": "",
   "money": "",
   "tip": "ホールの壁には、ダキアの征服から1918年の大ルーマニアまでの歴史を描いた、長さ75メートル・高さ3メートルのフレスコ画がぐるりと続く。席は794。建てる費用の一部は、28年続いた「アテネ音楽堂に1レウを！」の募金で集めた。設計はフランスの建築家アルベール・ガルロン。2007年に欧州遺産ラベルに選ばれた。",
   "route": "",
   "see": [
    "athenaeum",
    "revolution"
   ],
   "src": [
    {
     "name": "Wikipedia「Romanian Athenaeum」",
     "url": "https://en.wikipedia.org/wiki/Romanian_Athenaeum",
     "seen": "2026-11-19"
    },
    {
     "name": "Știri pe surse「George Enescu Philharmonic puts tickets on sale for second part of 2025 - 2026 season」",
     "url": "https://www.stiripesurse.ro/george-enescu-philharmonic-puts-tickets-on-sale-for-second-part-of-2025-2026-season_3842712",
     "seen": "2026-11-19"
    }
   ]
  },
  {
   "id": "xmas",
   "title": "クリスマスマーケットを歩きたい！",
   "lead": "国民の館の前の広場に屋台と大きなツリー",
   "what": "ブカレストのクリスマスマーケットで、屋台をのぞいて歩く。2025年は国民の館の前の憲法広場で、11月29日から12月28日まで開いた。2025年は平日12時〜22時、土日10時〜22時に開いていた。",
   "how": "",
   "time": "",
   "money": "",
   "tip": "2025年は、初日の11月29日の夕方に街のクリスマスの明かりもともった。",
   "route": "",
   "see": [
    "palace"
   ],
   "src": [
    {
     "name": "Newsweek România「Târgurile de Crăciun din București se deschid oficial pe 29 noiembrie 2025 și țin până pe 28 decembrie」",
     "url": "https://newsweek.ro/actualitate/targurile-de-craciun-din-bucuresti-se-deschid-oficial-pe-29-noiembrie-2025-si-tin-pana-pe-28-decembrie",
     "seen": "2026-11-19"
    },
    {
     "name": "Playtech「8 târguri de Crăciun în București, în 2025」",
     "url": "https://playtech.ro/2025/8-targuri-de-craciun-in-bucuresti-in-2025-harta-completa-si-programul-fiecaruia/",
     "seen": "2026-11-19"
    }
   ],
   "marks": [
    {
     "kind": "season",
     "text": "冬だけ"
    }
   ]
  }
 ],
 "see": {
  "items": [
   {
    "id": "old-town",
    "name": "旧市街（リプスカニ）",
    "local": {
     "text": "Centrul Vechi",
     "lang": "ro",
     "roman": "Centrul Vechi"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/romania/bucharest/photos/bucharest-sunset-on-lipscani-str-731ff323-960.webp",
     "small": "/guide/romania/bucharest/photos/bucharest-sunset-on-lipscani-str-731ff323-500.webp",
     "w": 960,
     "h": 640,
     "alt": "夕暮れのリプスカニ通り。古い建物の前にテラス席が並ぶ",
     "kind": "photo",
     "credit": {
      "by": "Ștefan Jurcă from Munich, Germany",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Bucharest_-_Sunset_on_Lipscani_Street_(28592940111).jpg"
     }
    },
    "body": "リプスカニ通りを中心にした石畳の一帯。中世からの商いの中心で、いまは直した古い建物にレストランとバーが並び、若い人でにぎわう。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Centrul+Vechi+Bucure%C8%99ti&hl=ja",
    "todo": [
     "caru",
     "carusel"
    ],
    "src": [
     {
      "name": "Wikipedia（日本語）「ブカレスト」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Bucharest_-_Sunset_on_Lipscani_Street_(28592940111).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.43151,
     "lon": 26.1002
    },
    "area": "old-town"
   },
   {
    "id": "palace",
    "name": "国民の館（議会宮殿）",
    "local": {
     "text": "Palatul Parlamentului",
     "lang": "ro",
     "roman": "Palatul Parlamentului"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/romania/bucharest/photos/fountains-in-front-of-the-romani-5668662a-960.webp",
     "small": "/guide/romania/bucharest/photos/fountains-in-front-of-the-romani-5668662a-500.webp",
     "w": 960,
     "h": 640,
     "alt": "噴水の並ぶ大通りの先に、明かりのともった国民の館",
     "kind": "photo",
     "credit": {
      "by": "dronepicr",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Fountains_in_front_of_the_Romanian_Palace_of_Parliament_in_Bucharest_(47981521036).jpg"
     }
    },
    "body": "チャウシェスクの命で1984年に建て始め、1997年にできた議会の建物。重さは世界一とされ、行政の建物としてはアメリカの国防総省に次ぐ大きさ。部屋は1,100、大理石は100万立方メートル。",
    "facts": [
     {
      "label": "行きかた",
      "text": "イズヴォル通り2-4番。地下鉄M1・M3のイズヴォル駅。入口は北の側"
     },
     {
      "label": "見学",
      "text": "ガイドつきの見学で中に入る。パスポートを持って行く"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Palatul+Parlamentului+Bucure%C8%99ti&hl=ja",
    "todo": [
     "palace"
    ],
    "src": [
     {
      "name": "Wikipedia「Palace of the Parliament」",
      "url": "https://en.wikipedia.org/wiki/Palace_of_the_Parliament",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Fountains_in_front_of_the_Romanian_Palace_of_Parliament_in_Bucharest_(47981521036).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.42751,
     "lon": 26.087248
    },
    "area": "civic"
   },
   {
    "id": "revolution",
    "name": "革命広場",
    "local": {
     "text": "Piața Revoluției",
     "lang": "ro",
     "roman": "Piata Revolutiei"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/romania/bucharest/photos/3-bucuresti-romania-piata-palatu-cbe1960e-960.webp",
     "small": "/guide/romania/bucharest/photos/3-bucuresti-romania-piata-palatu-cbe1960e-500.webp",
     "w": 960,
     "h": 720,
     "alt": "革命広場。広い石畳の広場と、まわりに並ぶ大きな建物",
     "kind": "photo",
     "credit": {
      "by": "Britchi Mirela",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:(3)_Bucuresti,_Romania._Piata_Palatului_-_Piata_Revolutiei_(vedere_de_ansamblu).jpg"
     }
    },
    "body": "1989年の革命の舞台の1つになった広場。真ん中に記念碑が立ち、まわりに旧王宮や大学図書館の建物が並ぶ。",
    "facts": [
     {
      "label": "行きかた",
      "text": "地下鉄のウニヴェルシターテ駅から600m。統一広場や北駅、国民の館からも歩ける"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pia%C8%9Ba+Revolu%C8%9Biei+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:(3)_Bucuresti,_Romania._Piata_Palatului_-_Piata_Revolutiei_(vedere_de_ansamblu).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.438657,
     "lon": 26.097498
    },
    "area": "revolution"
   },
   {
    "id": "athenaeum",
    "name": "ルーマニア・アテネ音楽堂",
    "local": {
     "text": "Ateneul Român",
     "lang": "ro",
     "roman": "Ateneul Roman"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/romania/bucharest/photos/ateneo-rumano-bucarest-rumania-2-0b72e4bc-960.webp",
     "small": "/guide/romania/bucharest/photos/ateneo-rumano-bucarest-rumania-2-0b72e4bc-500.webp",
     "w": 960,
     "h": 723,
     "alt": "白い柱と緑の丸屋根のルーマニア・アテネ音楽堂。前に芝生の庭",
     "kind": "photo",
     "credit": {
      "by": "Diego Delso (1974–)",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ateneo_Rumano,_Bucarest,_Ruman%C3%ADa,_2016-05-29,_DD_73.jpg"
     }
    },
    "body": "1888年に開いた丸屋根の音楽堂で、ジョルジェ・エネスク・フィルハーモニーの本拠。中の壁には、ルーマニアの歴史を描いた長さ75メートルのフレスコ画がぐるりと続く。設計はフランスの建築家アルベール・ガルロン。",
    "facts": [
     {
      "label": "行きかた",
      "text": "ベンジャミン・フランクリン通り1-3番。革命広場のそばで、地下鉄M2のピアツァ・ロマナ駅"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ateneul+Rom%C3%A2n+Bucure%C8%99ti&hl=ja",
    "todo": [
     "athenaeum"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian Athenaeum」",
      "url": "https://en.wikipedia.org/wiki/Romanian_Athenaeum",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Ateneo_Rumano,_Bucarest,_Ruman%C3%ADa,_2016-05-29,_DD_73.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.441357,
     "lon": 26.097361
    },
    "area": "revolution"
   },
   {
    "id": "stavropoleos",
    "name": "スタヴロポレオス修道院",
    "local": {
     "text": "Mănăstirea Stavropoleos",
     "lang": "ro",
     "roman": "Manastirea Stavropoleos"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/bucharest-stavropoleos-monastery-e35fb897-960.webp",
     "small": "/guide/romania/bucharest/photos/bucharest-stavropoleos-monastery-e35fb897-500.webp",
     "w": 960,
     "h": 640,
     "alt": "スタヴロポレオス修道院の中庭。彫刻のある石の柱の回廊",
     "kind": "photo",
     "credit": {
      "by": "Ștefan Jurcă from Munich, Germany",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Bucharest_-_Stavropoleos_Monastery_(28648667365).jpg"
     }
    },
    "body": "18世紀の初めに建った小さな修道院の教会。石の彫刻と壁画で知られる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%83n%C4%83stirea+Stavropoleos+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Bucharest_-_Stavropoleos_Monastery_(28648667365).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.431783,
     "lon": 26.098829
    },
    "area": "old-town"
   },
   {
    "id": "curtea",
    "name": "旧王宮跡（クルテア・ヴェケ）",
    "local": {
     "text": "Curtea Veche",
     "lang": "ro",
     "roman": "Curtea Veche"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/curtea-veche-church-with-garden-4383ffa2-960.webp",
     "small": "/guide/romania/bucharest/photos/curtea-veche-church-with-garden-4383ffa2-500.webp",
     "w": 960,
     "h": 638,
     "alt": "旧王宮跡のそばに立つ、れんがの縞模様の古い教会と庭",
     "kind": "photo",
     "credit": {
      "by": "DimiTalen",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Curtea_Veche_Church_with_garden,_Bucharest,_2017.jpg"
     }
    },
    "body": "ワラキアの公たちの宮廷の跡。1459年にこの地の城塞がヴラド・ツェペシュの居城になったのが、ブカレストが史書に出る最初とされる。",
    "facts": [
     {
      "label": "行きかた",
      "text": "フランツェザ通り25-31番。地下鉄のピアツァ・ウニリイ駅"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Curtea+Veche+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia（日本語）「ブカレスト」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Curtea_Veche_Church_with_garden,_Bucharest,_2017.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.430094,
     "lon": 26.102063
    },
    "area": "old-town"
   },
   {
    "id": "carusel",
    "name": "カルトゥレシュティ・カルセル（書店）",
    "local": {
     "text": "Cărturești Carusel",
     "lang": "ro",
     "roman": "Carturesti Carusel"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/libraria-carturesti-carusel-inte-80b93050-960.webp",
     "small": "/guide/romania/bucharest/photos/libraria-carturesti-carusel-inte-80b93050-500.webp",
     "w": 960,
     "h": 646,
     "alt": "白い吹き抜けのまわりに本棚の階が重なる、カルトゥレシュティ・カルセルの中",
     "kind": "photo",
     "credit": {
      "by": "Mihai Petre",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Libraria_Carturesti_Carusel_-_Interior_ziua.jpg"
     }
    },
    "body": "20世紀の初めに銀行の本店として建った建物を、5年かけて直した書店。直し終えたのは2015年。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=C%C4%83rture%C8%99ti+Carusel+Bucure%C8%99ti&hl=ja",
    "todo": [
     "carusel"
    ],
    "src": [
     {
      "name": "Wikipedia「Cărturești Carusel」",
      "url": "https://en.wikipedia.org/wiki/C%C4%83rture%C8%99ti_Carusel",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Libraria_Carturesti_Carusel_-_Interior_ziua.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.431894,
     "lon": 26.101578
    },
    "area": "old-town"
   },
   {
    "id": "calea",
    "name": "勝利通り（カレア・ヴィクトリエイ）",
    "local": {
     "text": "Calea Victoriei",
     "lang": "ro",
     "roman": "Calea Victoriei"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/calea-victoriei-2-01765da8-960.webp",
     "small": "/guide/romania/bucharest/photos/calea-victoriei-2-01765da8-500.webp",
     "w": 960,
     "h": 720,
     "alt": "古い建物と新しいビルが並ぶ勝利通り",
     "kind": "photo",
     "credit": {
      "by": "Leontin l",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Calea_Victoriei_(2).jpg"
     }
    },
    "body": "旧市街の西の端から北へ延びる大通り。革命広場とアテネ音楽堂の前を通る。名前は「勝利の道」の意味。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Calea+Victoriei+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia「Calea Victoriei」",
      "url": "https://en.wikipedia.org/wiki/Calea_Victoriei",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Calea_Victoriei_(2).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.442081,
     "lon": 26.094047
    },
    "area": "revolution"
   },
   {
    "id": "cec",
    "name": "CEC宮殿",
    "local": {
     "text": "Palatul CEC",
     "lang": "ro",
     "roman": "Palatul CEC"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/romania/bucharest/photos/cec-palace-bucharest-aabbcfa0-960.webp",
     "small": "/guide/romania/bucharest/photos/cec-palace-bucharest-aabbcfa0-500.webp",
     "w": 960,
     "h": 2025,
     "alt": "アーチの入口と丸屋根のCEC宮殿",
     "kind": "photo",
     "credit": {
      "by": "Yair-haklai",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:CEC_Palace,_Bucharest-.jpg"
     }
    },
    "body": "勝利通りの南の入口に立つ、貯蓄銀行（CEC）の本店だった建物。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Palatul+CEC+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap「Palatul Casei de Economii şi Consemnaţiuni」",
      "url": "https://www.openstreetmap.org/way/973712798",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:CEC_Palace,_Bucharest-.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.432013,
     "lon": 26.096478
    },
    "area": "old-town"
   },
   {
    "id": "patriarchal",
    "name": "総主教大聖堂",
    "local": {
     "text": "Catedrala Patriarhală",
     "lang": "ro",
     "roman": "Catedrala Patriarhala"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/romania/bucharest/photos/catedrala-patriarhala-bucuresti-77432c50-960.webp",
     "small": "/guide/romania/bucharest/photos/catedrala-patriarhala-bucuresti-77432c50-500.webp",
     "w": 960,
     "h": 720,
     "alt": "白い壁と灰色の丸屋根が3つ並ぶ総主教大聖堂",
     "kind": "photo",
     "credit": {
      "by": "Chainwit.",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Catedrala_Patriarhal%C4%83,_Bucure%C8%99ti_(2023)_-_IMG_02.jpg"
     }
    },
    "body": "ルーマニア正教会の総主教の大聖堂。国民の館の東の小さな丘に立つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Catedrala+Patriarhal%C4%83+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap「Catedrala Patriarhală \"Sfinții Împărați Constantin și Elena\"」",
      "url": "https://www.openstreetmap.org/way/232296927",
      "seen": "2026-11-19"
     },
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Catedrala_Patriarhal%C4%83,_Bucure%C8%99ti_(2023)_-_IMG_02.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.424563,
     "lon": 26.097951
    },
    "area": "civic"
   },
   {
    "id": "arc",
    "name": "凱旋門",
    "local": {
     "text": "Arcul de Triumf",
     "lang": "ro",
     "roman": "Arcul de Triumf"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/arcul-de-triumf-7303cd20-960.webp",
     "small": "/guide/romania/bucharest/photos/arcul-de-triumf-7303cd20-500.webp",
     "w": 960,
     "h": 640,
     "alt": "並木の大通りの先に立つ凱旋門",
     "kind": "photo",
     "credit": {
      "by": "Vaivoda Vlad",
      "lic": "CC BY-SA 3.0 ro",
      "page": "https://commons.wikimedia.org/wiki/File:Arcul_de_Triumf.JPG"
     }
    },
    "body": "いまの石の門は1936年にできた。12月1日の国の祝日の軍のパレードは、この門のそばのキセレフ通りか、国民の館の前の憲法広場で開かれる。",
    "facts": [
     {
      "label": "行きかた",
      "text": "トラム41番のカジン停留所か、地下鉄M2のアヴィアトリロル駅から500m"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Arcul+de+Triumf+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia「Great Union Day」",
      "url": "https://en.wikipedia.org/wiki/Great_Union_Day",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Arcul_de_Triumf.JPG",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.46719,
     "lon": 26.078127
    },
    "line": "中心から4.3km"
   },
   {
    "id": "village",
    "name": "農村博物館",
    "local": {
     "text": "Muzeul Național al Satului „Dimitrie Gusti”",
     "lang": "ro",
     "roman": "Muzeul National al Satului Dimitrie Gusti"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/dimitrie-gusti-national-village-62624751-960.webp",
     "small": "/guide/romania/bucharest/photos/dimitrie-gusti-national-village-62624751-500.webp",
     "w": 960,
     "h": 720,
     "alt": "農村博物館の古い木の家。軒の深い縁側",
     "kind": "photo",
     "credit": {
      "by": "Cris Coman",
      "lic": "PD",
      "page": "https://commons.wikimedia.org/wiki/File:Dimitrie_Gusti_national_village_museum_Bucharest_house_veranda.jpg"
     }
    },
    "body": "国じゅうから運んできた昔の家や教会が、湖のほとりの林に並ぶ野外の博物館。建物は300ほど。",
    "facts": [
     {
      "label": "行きかた",
      "text": "キセレフ通り28-30番。トラム41番のアグロノミエ停留所か、地下鉄M2のアヴィアトリロル駅から公園を抜けて15分ほど"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeul+Satului+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Dimitrie_Gusti_national_village_museum_Bucharest_house_veranda.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.471581,
     "lon": 26.077914
    },
    "line": "中心から4.8km"
   },
   {
    "id": "park",
    "name": "ヘラストラウ公園（ミハイ1世公園）",
    "local": {
     "text": "Parcul Regele Mihai I",
     "lang": "ro",
     "roman": "Parcul Regele Mihai I"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/romania/bucharest/photos/herastrau-park-leaves-unsplash-2d4f91fa-960.webp",
     "small": "/guide/romania/bucharest/photos/herastrau-park-leaves-unsplash-2d4f91fa-500.webp",
     "w": 960,
     "h": 638,
     "alt": "紅葉した木と落ち葉、その向こうの湖。ヘラストラウ公園の秋",
     "kind": "photo",
     "credit": {
      "by": "Rula Sibai rulasibai",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Herastrau_park_leaves_(Unsplash).jpg"
     }
    },
    "body": "湖を囲む、市内でいちばん大きな公園。夏は貸しボートが出る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Parcul+Regele+Mihai+I+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Herastrau_park_leaves_(Unsplash).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.473553,
     "lon": 26.089427
    },
    "line": "中心から4.8km"
   },
   {
    "id": "ceausescu",
    "name": "チャウシェスク邸（春の宮殿）",
    "local": {
     "text": "Palatul Primăverii",
     "lang": "ro",
     "roman": "Palatul Primaverii"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/romania/bucharest/photos/chess-table-in-palatul-primaveri-c363575f-960.webp",
     "small": "/guide/romania/bucharest/photos/chess-table-in-palatul-primaveri-c363575f-500.webp",
     "w": 960,
     "h": 1440,
     "alt": "チャウシェスク邸の中。金色の椅子とチェスの卓",
     "kind": "photo",
     "credit": {
      "by": "Tim Adams",
      "lic": "CC BY 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Chess_table_in_Palatul_Prim%C7%8Everii_aka_Spring_Palace_in_Bucharest_Romania.jpg"
     }
    },
    "body": "ニコラエ・チャウシェスクが暮らした家。いまは中を見て回れる博物館。",
    "facts": [
     {
      "label": "行きかた",
      "text": "地下鉄のアヴィアトリロル駅"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Palatul+Prim%C4%83verii+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap「Palatul Primăverii (fosta locuință a lui Nicolae Ceaușescu)」",
      "url": "https://www.openstreetmap.org/way/38236017",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Chess_table_in_Palatul_Prim%C7%8Everii_aka_Spring_Palace_in_Bucharest_Romania.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.468877,
     "lon": 26.092324
    },
    "line": "中心から4.2km"
   },
   {
    "id": "bran",
    "name": "ブラン城（ドラキュラ城）",
    "local": {
     "text": "Castelul Bran",
     "lang": "ro",
     "roman": "Castelul Bran"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/bran-castle-tb1-bbd2d57d-960.webp",
     "small": "/guide/romania/bucharest/photos/bran-castle-tb1-bbd2d57d-500.webp",
     "w": 960,
     "h": 720,
     "alt": "森の上の岩に立つ、赤い屋根と白い壁のブラン城",
     "kind": "photo",
     "credit": {
      "by": "Todor Bozhinov",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Bran_Castle_TB1.jpg"
     }
    },
    "body": "1377年にトランシルヴァニアとワラキアの境を守るために建った城。「ドラキュラ城」として知られるが、小説のドラキュラともヴラド・ツェペシュとも、関わりは薄いとされる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Castelul+Bran&hl=ja",
    "todo": [
     "bran"
    ],
    "src": [
     {
      "name": "Wikivoyage「Bran」",
      "url": "https://en.wikivoyage.org/wiki/Bran",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Bran_Castle_TB1.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 45.515077,
     "lon": 25.367237
    },
    "line": "中心から134km"
   },
   {
    "id": "national-art",
    "name": "ルーマニア国立美術館（旧王宮）",
    "local": {
     "text": "Muzeul Național de Artă al României",
     "lang": "ro",
     "roman": "Muzeul National de Arta al Romaniei"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/the-national-museum-of-art-of-ro-cfa3ddd5-960.webp",
     "small": "/guide/romania/bucharest/photos/the-national-museum-of-art-of-ro-cfa3ddd5-500.webp",
     "w": 960,
     "h": 638,
     "alt": "革命広場の記念碑と、奥に立つ旧王宮の建物（いまはルーマニア国立美術館）",
     "kind": "photo",
     "credit": {
      "by": "Jorge Láscar from Australia",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:The_National_Museum_of_Art_of_Romania_(11321261983).jpg"
     }
    },
    "body": "革命広場に面した旧王宮の建物に入る美術館。ルーマニアの中世と近代の美術と、王家が集めたヨーロッパの絵を見せる。1989年の革命で建物が傷ついた。",
    "facts": [
     {
      "label": "行きかた",
      "text": "勝利通り49-53番。地下鉄M2のピアツァ・ヴィクトリエイ駅か、ウニヴェルシターテ駅から600m"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeul+Na%C8%9Bional+de+Art%C4%83+al+Rom%C3%A2niei+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「National Museum of Art of Romania」",
      "url": "https://en.wikipedia.org/wiki/National_Museum_of_Art_of_Romania",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:The_National_Museum_of_Art_of_Romania_(11321261983).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.440074,
     "lon": 26.095788
    },
    "area": "revolution"
   },
   {
    "id": "peasant",
    "name": "ルーマニア農民博物館",
    "local": {
     "text": "Muzeul Național al Țăranului Român",
     "lang": "ro",
     "roman": "Muzeul National al Taranului Roman"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/bucharest-romania-national-museu-f6181a3a-960.webp",
     "small": "/guide/romania/bucharest/photos/bucharest-romania-national-museu-f6181a3a-500.webp",
     "w": 960,
     "h": 720,
     "alt": "ルーマニア農民博物館の焼き物の部屋。棚に並ぶ壺と皿",
     "kind": "photo",
     "credit": {
      "by": "Britchi V.I.Iulia",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Bucharest,_Romania._National_Museum_of_the_Romanian_Peasant._Ceramic_collection.jpg"
     }
    },
    "body": "農村の暮らしの品を10万点あまり持つ博物館。民族衣装の布・イコン・焼き物が並ぶ。1996年に「ヨーロッパ・ミュージアム・オブ・ザ・イヤー」に選ばれた。建物は1912〜1941年に建った、ルーマニアの伝統の形を取り入れたネオ・ルーマニア様式。",
    "facts": [
     {
      "label": "行きかた",
      "text": "キセレフ通り3番。地下鉄M2のピアツァ・ヴィクトリエイ駅"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeul+Na%C8%9Bional+al+%C8%9A%C4%83ranului+Rom%C3%A2n+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「National Museum of the Romanian Peasant」",
      "url": "https://en.wikipedia.org/wiki/National_Museum_of_the_Romanian_Peasant",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Bucharest,_Romania._National_Museum_of_the_Romanian_Peasant._Ceramic_collection.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.454423,
     "lon": 26.083983
    },
    "line": "中心から2.9km"
   },
   {
    "id": "cismigiu",
    "name": "チシミジウ公園",
    "local": {
     "text": "Grădina Cișmigiu",
     "lang": "ro",
     "roman": "Gradina Cismigiu"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/cismigiu-rowboats-697b152d-960.webp",
     "small": "/guide/romania/bucharest/photos/cismigiu-rowboats-697b152d-500.webp",
     "w": 960,
     "h": 623,
     "alt": "チシミジウ公園の池に浮かぶ貸しボート",
     "kind": "photo",
     "credit": {
      "by": "Joe Mabel",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Cismigiu_-_rowboats.jpg"
     }
    },
    "body": "1847年に開いた、中心部でいちばん古く大きな公園（14.6ヘクタール）。まん中に人の手で掘った池がある。ドイツの園芸家マイヤーが小道と岩場を作り、池へ下りるロマン主義の庭にした。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Gr%C4%83dina+Ci%C8%99migiu+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Cișmigiu Gardens」",
      "url": "https://en.wikipedia.org/wiki/Ci%C8%99migiu_Gardens",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Cismigiu_-_rowboats.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.43726,
     "lon": 26.0906
    },
    "area": "revolution"
   },
   {
    "id": "manuc",
    "name": "ハヌル・ルイ・マヌク（旧市街の宿屋）",
    "local": {
     "text": "Hanul lui Manuc",
     "lang": "ro",
     "roman": "Hanul lui Manuc"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/bucharest-hanul-lui-manuc-2023-i-86d47855-960.webp",
     "small": "/guide/romania/bucharest/photos/bucharest-hanul-lui-manuc-2023-i-86d47855-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "ハヌル・ルイ・マヌクの中庭と、2階を囲む木の回廊",
     "kind": "photo",
     "credit": {
      "by": "Chainwit.",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Bucharest_-_Hanul_lui_Manuc_(2023)_-_img_03.jpg"
     }
    },
    "body": "1808年にアルメニア人の商人マヌク・ベイが建てた隊商宿。木の回廊が囲む大きな中庭を持ち、いまも宿とレストランとして使われる、街でいちばん古い宿の建物。1806〜1812年の露土戦争を終わらせたブカレスト条約の、前の話し合いの場になった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Hanul+lui+Manuc+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Hanul lui Manuc」",
      "url": "https://en.wikipedia.org/wiki/Hanul_lui_Manuc",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Bucharest_-_Hanul_lui_Manuc_(2023)_-_img_03.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.42972,
     "lon": 26.102347
    },
    "area": "old-town"
   },
   {
    "id": "macca",
    "name": "マッカ・ヴィラクロッセ・パサージュ",
    "local": {
     "text": "Pasajul Macca-Vilacrosse",
     "lang": "ro",
     "roman": "Pasajul Macca-Vilacrosse"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/romania/bucharest/photos/pasajul-macca-villacrosse-vedere-53a56bd9-960.webp",
     "small": "/guide/romania/bucharest/photos/pasajul-macca-villacrosse-vedere-53a56bd9-500.webp",
     "w": 960,
     "h": 640,
     "alt": "マッカ・ヴィラクロッセ・パサージュの中。ガラスの天窓の下の丸い吹き抜け",
     "kind": "photo",
     "credit": {
      "by": "Mihai Petre",
      "lic": "CC BY-SA 3.0 ro",
      "page": "https://commons.wikimedia.org/wiki/File:Pasajul_Macca-Villacrosse_-_Vedere_Interior.jpg"
     }
    },
    "body": "1891年にできた、黄色いガラスの屋根のアーケード。勝利通りから旧市街へ抜ける。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pasajul+Macca-Vilacrosse+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "In Your Pocket「Pasajul Macca-Vilacrosse」",
      "url": "https://www.inyourpocket.com/romania/bucharest/venues/pasajul-macca-vilacrosse",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Pasajul_Macca-Villacrosse_-_Vedere_Interior.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.433016,
     "lon": 26.098887
    },
    "area": "old-town"
   },
   {
    "id": "salvation",
    "name": "国民救済大聖堂",
    "local": {
     "text": "Catedrala Mântuirii Neamului",
     "lang": "ro",
     "roman": "Catedrala Mantuirii Neamului"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/people-s-salvation-cathedral-1-4a4f6777-960.webp",
     "small": "/guide/romania/bucharest/photos/people-s-salvation-cathedral-1-4a4f6777-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "建てている途中の国民救済大聖堂。金色の丸屋根とクレーン",
     "kind": "photo",
     "credit": {
      "by": "Turgidson",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:People%27s_Salvation_Cathedral_(1).jpg"
     }
    },
    "body": "国民の館の向かいの丘に建つ、ルーマニア正教会の大聖堂。2010年に建て始め、2025年10月26日にモザイクが聖別されて15年の工事を終えた。高さは十字架の先まで133メートル。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Catedrala+M%C3%A2ntuirii+Neamului+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「People's Salvation Cathedral」",
      "url": "https://en.wikipedia.org/wiki/People%27s_Salvation_Cathedral",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:People%27s_Salvation_Cathedral_(1).jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.425905,
     "lon": 26.082294
    },
    "area": "civic"
   },
   {
    "id": "peles",
    "name": "ペレシュ城（シナイア）",
    "local": {
     "text": "Castelul Peleș",
     "lang": "ro",
     "roman": "Castelul Peles"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/romania/bucharest/photos/peles-castle-sinaia-romania-01-3d51b102-960.webp",
     "small": "/guide/romania/bucharest/photos/peles-castle-sinaia-romania-01-3d51b102-500.webp",
     "w": 960,
     "h": 720,
     "alt": "森を背にした、木組みの壁と尖った塔のペレシュ城",
     "kind": "photo",
     "credit": {
      "by": "Adam Jones Adam63",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Peles_Castle_-_Sinaia_-_Romania_01.jpg"
     }
    },
    "body": "カルパチアの山あいの町シナイアに、国王カロル1世が建てた夏の城。1883年に開き、1914年まで建て増した。ネオ・ルネサンスとゴシック・リヴァイヴァルを混ぜた形で、その場で作った電気で全部をまかなった世界で初めての城とされる。1953年から博物館。",
    "facts": [
     {
      "label": "行きかた",
      "text": "シナイアは、ブカレストとブラショフを結ぶ幹線の鉄道の途中の駅"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Castelul+Pele%C8%99+Sinaia&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Peleș Castle」",
      "url": "https://en.wikipedia.org/wiki/Pele%C8%99_Castle",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Sinaia」",
      "url": "https://en.wikivoyage.org/wiki/Sinaia",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Peles_Castle_-_Sinaia_-_Romania_01.jpg",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 45.360085,
     "lon": 25.542733
    },
    "line": "中心から112km"
   },
   {
    "id": "snagov",
    "name": "スナゴフ修道院",
    "local": {
     "text": "Mănăstirea Snagov",
     "lang": "ro",
     "roman": "Manastirea Snagov"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/romania/bucharest/photos/snagov-monastery-frontal-view-a50fc641-960.webp",
     "small": "/guide/romania/bucharest/photos/snagov-monastery-frontal-view-a50fc641-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "スナゴフ修道院の正面。れんがと石の縞の壁の小さな教会",
     "kind": "photo",
     "credit": {
      "by": "Ferran Cornellà",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Snagov_monastery,_frontal_view.JPG"
     }
    },
    "body": "スナゴフ湖の島に立つ修道院。いまの教会は1521年の建物。ヴラド・ツェペシュが葬られたという言い伝えがあるが、確かではない。1933〜1934年に墓を開けたときは、中に何も無かった。島へは2009年にできた歩道橋で渡る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%83n%C4%83stirea+Snagov&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Snagov Monastery」",
      "url": "https://en.wikipedia.org/wiki/Snagov_Monastery",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Snagov_monastery,_frontal_view.JPG",
      "seen": "2026-11-19"
     }
    ],
    "geo": {
     "lat": 44.729703,
     "lon": 26.175741
    },
    "line": "中心から34km"
   }
  ],
  "far": [
   {
    "id": "arc",
    "name": "凱旋門",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Arcul+de+Triumf+Bucure%C8%99ti&hl=ja",
    "km": 4.3
   },
   {
    "id": "village",
    "name": "農村博物館",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeul+Satului+Bucure%C8%99ti&hl=ja",
    "km": 4.8
   },
   {
    "id": "park",
    "name": "ヘラストラウ公園",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Parcul+Regele+Mihai+I+Bucure%C8%99ti&hl=ja",
    "km": 4.8
   },
   {
    "id": "ceausescu",
    "name": "チャウシェスク邸",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Palatul+Prim%C4%83verii+Bucure%C8%99ti&hl=ja",
    "km": 4.2
   },
   {
    "id": "bran",
    "name": "ブラン城",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Castelul+Bran&hl=ja",
    "km": 134
   },
   {
    "id": "peasant",
    "name": "ルーマニア農民博物館",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeul+Na%C8%9Bional+al+%C8%9A%C4%83ranului+Rom%C3%A2n+Bucure%C8%99ti&hl=ja",
    "km": 2.9
   },
   {
    "id": "peles",
    "name": "ペレシュ城",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Castelul+Pele%C8%99+Sinaia&hl=ja",
    "km": 112
   },
   {
    "id": "snagov",
    "name": "スナゴフ修道院",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%83n%C4%83stirea+Snagov&hl=ja",
    "km": 34
   }
  ],
  "map": {
   "mid": "1bnQj8W6JkK0YPI-0SsMHit1zGEe3xqU",
   "title": "ブカレスト｜見たいもの",
   "ll": "44.4333,26.0923",
   "z": 13,
   "pins": 23
  }
 },
 "eat": {
  "kinds": [
   {
    "id": "local",
    "label": "ルーマニアの料理"
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
    "id": "sarmale",
    "name": "サルマーレ（ロールキャベツ）",
    "local": {
     "text": "Sarmale",
     "lang": "ro",
     "roman": "Sarmale"
    },
    "body": "酢漬けのキャベツかぶどうの葉で、ひき肉と米と玉ねぎを包み、陶器の鍋で何時間も煮る。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハヌル・ルイ・マヌク（旧市街の宿屋のレストラン）・カル・ク・ベレ（旧市街のビアホール）・ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     },
     {
      "label": "豚肉",
      "text": "ひき肉の種類は店や家で違う。トランシルヴァニアでは燻した豚の足や皮を鍋に入れる。米と香草だけの作りもある。ラ・ママの献立では豚と牛のひき肉。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sarmale+Bucure%C8%99ti&hl=ja",
    "places": [
     "manuc",
     "caru",
     "lamama"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "mici",
    "name": "ミティテイ（皮なしの焼きソーセージ）",
    "local": {
     "text": "Mititei",
     "lang": "ro",
     "roman": "Mititei"
    },
    "body": "にんにく・タイム・パプリカで味をつけたひき肉を、棒の形にして焼く。マスタードとパンを添える。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・クルテア・ベラリロル（旧市街のビアホール）"
     },
     {
      "label": "豚肉",
      "text": "羊だけの作りと、豚・子牛・羊を合わせる作りがある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mititei+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "berarilor"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "ciorba",
    "name": "チョルバ（酸っぱいスープ）",
    "local": {
     "text": "Ciorbă",
     "lang": "ro",
     "roman": "Ciorbă"
    },
    "body": "レモン汁や酢、ザワークラウトの汁で酸味をつけたスープ。もつのチョルバ・デ・ブルタには、サワークリームと卵の黄身、にんにくが入る。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・クルテア・ベラリロル（旧市街のビアホール）"
     },
     {
      "label": "豚肉",
      "text": "具はスープの種類で違う（肉・野菜・もつ）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ciorb%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "berarilor"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "ciorba-perisoare",
    "name": "チョルバ・デ・ペリショアレ（肉団子の酸っぱいスープ）",
    "local": {
     "text": "Ciorbă de perișoare",
     "lang": "ro",
     "roman": "Ciorbă de perișoare"
    },
    "body": "肉団子（ペリショアレ）を入れた酸っぱいスープ。肉団子はトルコから伝わったとされる。ラ・ママの献立では、ひき肉と米の団子に、にんじん・パプリカ・トマトを合わせ、発酵させた酸っぱい汁（ボルシュ）で味をつける。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     },
     {
      "label": "豚肉",
      "text": "ラ・ママの献立では、肉団子は豚のひき肉。ほかの店の肉は確かめていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ciorb%C4%83+de+peri%C8%99oare+Bucure%C8%99ti&hl=ja",
    "places": [
     "lamama"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "tochitura",
    "name": "トキトゥーラ（肉の煮込み）",
    "local": {
     "text": "Tochitură",
     "lang": "ro",
     "roman": "Tochitură"
    },
    "body": "豚肉と、生と燻製のソーセージをトマトのソースで煮る。角切りの豚肉を焼いて、塩けのある白いチーズ（テレメアなど）と目玉焼きを添える作りもある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tochitur%C4%83+Bucure%C8%99ti&hl=ja",
    "kinds": [
     "local"
    ],
    "flags": {
     "pork": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "fasole",
    "name": "ファソレ・ク・カルナツィ（豆と腸詰めの煮込み）",
    "local": {
     "text": "Fasole cu cârnați",
     "lang": "ro",
     "roman": "Fasole cu cârnați"
    },
    "body": "豆（ファソレ）と、にんにくのきいた腸詰め（カルナツィ）の料理。腸詰めは燻製にしたものが多い。豆はつぶしてペースト（ファソレ・バトゥタ）にもする。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・クルテア・ベラリロル（旧市街のビアホール）"
     },
     {
      "label": "豚肉",
      "text": "腸詰めの肉の種類は確かめていない。カル・ク・ベレの豆のチョルバには燻製の豚肉が入る。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Fasole+cu+c%C3%A2rna%C8%9Bi+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "berarilor"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Caru' cu Bere「Meniu mâncare」（2026年9月の献立）",
      "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-mancare-carucubere-septembrie.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "salata-de-vinete",
    "name": "サラタ・デ・ヴィネテ（焼きなすのペースト）",
    "local": {
     "text": "Salată de vinete",
     "lang": "ro",
     "roman": "Salată de vinete"
    },
    "body": "焼いて皮をむいたなすに、刻んだ玉ねぎと塩を合わせ、油かマヨネーズで練る。パンにのせて食べる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・クルテア・ベラリロル（旧市街のビアホール）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Salat%C4%83+de+vinete+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "berarilor"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Caru' cu Bere「Meniu mâncare」（2026年9月の献立）",
      "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-mancare-carucubere-septembrie.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "bulz",
    "name": "ブルズ（チーズ入りのママリガ焼き）",
    "local": {
     "text": "Bulz",
     "lang": "ro",
     "roman": "Bulz"
    },
    "body": "ママリガ（とうもろこしの粥）にルーマニアの羊のチーズとサワークリームを合わせて焼く。ラ・ママの献立ではブルドゥフのチーズと熟成させたテレメアを入れ、目玉焼きをのせる（36レイ）。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     },
     {
      "label": "豚肉",
      "text": "ラ・ママのブルズには、燻製の豚ばら（カイザー）がのる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bulz+Bucure%C8%99ti&hl=ja",
    "places": [
     "lamama"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "mamaliga",
    "name": "ママリガ（とうもろこしの粥）",
    "local": {
     "text": "Mămăligă",
     "lang": "ro",
     "roman": "Mămăligă"
    },
    "body": "とうもろこしの粉を煮た、ルーマニア風のポレンタ。それだけでも、料理に添えても食べる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%83m%C4%83lig%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "telemea",
    "name": "テレメア（白いチーズ）",
    "local": {
     "text": "Telemea",
     "lang": "ro",
     "roman": "Telemea"
    },
    "body": "牛か羊の乳で作る白いチーズで、フェタに少し似ている。サラダにも、ママリガにも合わせる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Telemea+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "lamama"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "shaorma",
    "name": "シャオルマ（ルーマニアのシャワルマ）",
    "local": {
     "text": "Șaormă",
     "lang": "ro",
     "roman": "Șaormă"
    },
    "body": "国でいちばん好かれている屋台の食べ物の1つ。ブカレストのシャオルマの店は、量で30〜45レイ（2025年）。",
    "facts": [
     {
      "label": "どこで",
      "text": "ドリストル・ケバプ 旧市街店（シャオルマ）"
     },
     {
      "label": "豚肉",
      "text": "肉の種類は出どころに書かれていない。店で確かめる。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C8%98aorm%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "dristor"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Bucharest.ro「The most popular shawarma spots in Bucharest」（2025年10月3日）",
      "url": "https://www.bucharest.ro/articles/the-most-popular-shawarma-spots-in-bucharest-590",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "covrigi",
    "name": "コヴリジ（ルーマニアのプレッツェル）",
    "local": {
     "text": "Covrigi",
     "lang": "ro",
     "roman": "Covrigi"
    },
    "body": "輪の形の焼いたパン。ごまをまぶしたものが多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "ルカ（コヴリジのパン屋）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Covrigi+Bucure%C8%99ti&hl=ja",
    "places": [
     "luca"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "placinta",
    "name": "プラチンタ（パイ）",
    "local": {
     "text": "Plăcintă",
     "lang": "ro",
     "roman": "Plăcintă"
    },
    "body": "昔からの焼き菓子のパイ。ラ・ママの献立のプラチンタは、パイ生地で甘い牛のチーズを包んで焼く（25レイ）。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pl%C4%83cint%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "lamama"
    ],
    "kinds": [
     "sweets",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "papanasi",
    "name": "パパナシ（揚げドーナツ）",
    "local": {
     "text": "Papanași",
     "lang": "ro",
     "roman": "Papanași"
    },
    "body": "甘いチーズと卵とセモリナの生地を、ゆでるか揚げる。果物のジャムかシロップと、サワークリームをかける。カル・ク・ベレの献立では61レイ。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Papana%C8%99i+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "lamama"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Caru' cu Bere「Meniu mâncare」（2026年9月の献立）",
      "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-mancare-carucubere-septembrie.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "gogosi",
    "name": "ゴゴシ（揚げドーナツ）",
    "local": {
     "text": "Gogoși",
     "lang": "ro",
     "roman": "Gogoși"
    },
    "body": "「ドーナツ」と訳されるが、揚げた生地に近い。ラ・ママの献立では5個で29レイ。",
    "facts": [
     {
      "label": "どこで",
      "text": "ラ・ママ ウニヴェルシターテ店（ルーマニア料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Gogo%C8%99i+Bucure%C8%99ti&hl=ja",
    "places": [
     "lamama"
    ],
    "kinds": [
     "sweets",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "savarina",
    "name": "サヴァリナ（シロップの菓子）",
    "local": {
     "text": "Savarină",
     "lang": "ro",
     "roman": "Savarină"
    },
    "body": "発酵させた生地を丸い型で焼き、ラムのシロップに浸して、ホイップクリームを詰める。上にいちごかサワーチェリーのジャム。いまもケーキ屋でいちばん好かれる菓子の1つ。",
    "facts": [
     {
      "label": "どこで",
      "text": "アナ・パン シュティルベイ・ヴォダ通り店（菓子とパン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Savarin%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "anapan"
    ],
    "kinds": [
     "sweets"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Newsweek România「Cine a inventat savarina」（2025年9月1日）",
      "url": "https://newsweek.ro/timp-liber/cine-a-inventat-savarina-deliciosul-desert-iubit-de-romani-un-rege-in-exil-la-originea-prajiturii",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "amandina",
    "name": "アマンディナ（チョコのケーキ）",
    "local": {
     "text": "Amandină",
     "lang": "ro",
     "roman": "Amandină"
    },
    "body": "チョコレートのスポンジに、アーモンドとチョコレートのクリームを挟み、チョコレートの糖衣をかけたケーキ。",
    "facts": [
     {
      "label": "どこで",
      "text": "アナ・パン シュティルベイ・ヴォダ通り店（菓子とパン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Amandin%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "anapan"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "kurtos",
    "name": "クルトシュ・カラーチ（煙突菓子）",
    "local": {
     "text": "Cozonac secuiesc",
     "lang": "ro",
     "roman": "Cozonac secuiesc"
    },
    "body": "生地を棒に巻いて焼き、グラニュー糖と溶かしたバターをまぶした筒の形の菓子。ハンガリーの名前はクルトシュ・カラーチ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Cozonac+secuiesc+Bucure%C8%99ti&hl=ja",
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "cozonac",
    "name": "コゾナック（甘いパン）",
    "local": {
     "text": "Cozonac",
     "lang": "ro",
     "roman": "Cozonac"
    },
    "body": "牛乳・卵・砂糖・バターを練り込んだ甘いパンで、クリスマスの定番。くるみやけしの実を巻き込む。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Cozonac+Bucure%C8%99ti&hl=ja",
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "bere",
    "name": "ルーマニアのビール",
    "local": {
     "text": "Bere",
     "lang": "ro",
     "roman": "Bere"
    },
    "body": "ドイツの流れをくむ金色のピルスナーが多い。地元の醸造所の銘柄と、クラフトビールもある。カル・ク・ベレは自家製のビール（400mlで29.5レイ）、クルテア・ベラリロルはおもにティミショアレアナ。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）・クルテア・ベラリロル（旧市街のビアホール）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bere+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru",
     "berarilor"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Caru' cu Bere「Meniu băutură」（2026年9月の献立）",
      "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-bautura-carucubere-septembrie.pdf",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "vin",
    "name": "ルーマニアワイン（フェテアスカ・ネアグラ）",
    "local": {
     "text": "Fetească neagră",
     "lang": "ro",
     "roman": "Fetească neagră"
    },
    "body": "ルーマニアのワインには3,000年を超える伝統がある。フェテアスカ・ネアグラは古くからある在来の黒ぶどうで、深いルビー色の赤になる。カル・ク・ベレではグラスで34レイから。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Feteasc%C4%83+neagr%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikipedia「Fetească neagră」",
      "url": "https://en.wikipedia.org/wiki/Feteasc%C4%83_neagr%C4%83",
      "seen": "2026-11-19"
     },
     {
      "name": "Caru' cu Bere「Meniu băutură」（2026年9月の献立）",
      "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-bautura-carucubere-septembrie.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "visinata",
    "name": "ヴィシナータ（さくらんぼのリキュール）",
    "local": {
     "text": "Vișinată",
     "lang": "ro",
     "roman": "Vișinată"
    },
    "body": "サワーチェリーのリキュール。カル・ク・ベレの献立に2種類ある（29〜33レイ）。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Vi%C8%99inat%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     },
     {
      "name": "Caru' cu Bere「Meniu băutură」（2026年9月の献立）",
      "url": "https://www.carucubere.ro/wp-content/uploads/2026/09/meniu-bautura-carucubere-septembrie.pdf",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "tuica",
    "name": "ツイカ（すももの蒸留酒）",
    "local": {
     "text": "Țuică",
     "lang": "ro",
     "roman": "Țuică"
    },
    "body": "すももから作る強い蒸留酒。国のすももの4分の3ほどがツイカになる。2回蒸留した果実の蒸留酒はパーリンカと呼ぶ。",
    "facts": [
     {
      "label": "どこで",
      "text": "カル・ク・ベレ（旧市街のビアホール）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C8%9Auic%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "caru"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "manuc",
    "name": "ハヌル・ルイ・マヌク（旧市街の宿屋のレストラン）",
    "what": "1808年の宿屋の建物を使った旧市街のレストラン。郷土料理を出す。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Hanu%27+lui+Manuc+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "ルーマニア政府観光局「ブカレスト」（日本語）",
      "url": "https://romaniatourism.com/ja/bucharest.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Hanu' lui Manuc"
   },
   {
    "id": "caru",
    "name": "カル・ク・ベレ（旧市街のビアホール）",
    "what": "1879年のビール醸造所から始まったビアホール。建物は国の歴史的建造物。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Caru%27+cu+Bere+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Caru' cu Bere」",
      "url": "https://en.wikipedia.org/wiki/Caru%27_cu_Bere",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Caru' cu Bere",
    "went": false
   },
   {
    "id": "lamama",
    "name": "ラ・ママ ウニヴェルシターテ店（ルーマニア料理）",
    "what": "手ごろな値段のルーマニア料理の店で、市内に5軒ある。献立に肉団子のチョルバ（27レイ）・サルマーレ（42レイから）・ブルズ（36レイ）・パパナシ（21レイから）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=La+Mama+Universitate+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "La Mama「Meniu」（ediția 1/2026）",
      "url": "https://lamama.ro/wp-content/uploads/2026/04/meniu1.pdf",
      "seen": "2026-11-19"
     }
    ],
    "roman": "La Mama Universitate",
    "went": false
   },
   {
    "id": "berarilor",
    "name": "クルテア・ベラリロル（旧市街のビアホール）",
    "what": "旧市街のビアホールで、ビールはおもにティミショアレアナ。献立に焼いたミティテイ・豆のペースト・焼きなすのサラダ・日替わりのチョルバ。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Curtea+Berarilor+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     },
     {
      "name": "Curtea Berarilor「Meniu mâncare」",
      "url": "https://curteaberarilor.com/meniu-mancare/",
      "seen": "2026-11-19"
     },
     {
      "name": "Curtea Berarilor「Meniu băuturi」",
      "url": "https://curteaberarilor.com/meniu-bauturi/",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Curtea Berarilor",
    "went": false
   },
   {
    "id": "dristor",
    "name": "ドリストル・ケバプ 旧市街店（シャオルマ）",
    "what": "街の名物のようになったシャオルマのチェーン。値段は量で30〜45レイ（2025年）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Dristor+Kebap+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Bucharest.ro「The most popular shawarma spots in Bucharest」（2025年10月3日）",
      "url": "https://www.bucharest.ro/articles/the-most-popular-shawarma-spots-in-bucharest-590",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Dristor Kebap"
   },
   {
    "id": "luca",
    "name": "ルカ（コヴリジのパン屋）",
    "what": "コヴリジのチェーン。コーヒーも安い。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Luca+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Luca"
   },
   {
    "id": "anapan",
    "name": "アナ・パン シュティルベイ・ヴォダ通り店（菓子とパン）",
    "what": "市内に店のある菓子とパンの店。1切れ売りの菓子にアマンディナとサヴァリナ（どちらも21.9レイ）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ana+Pan+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Ana Pan「Prăjituri la bucată」（店のネットの品書き）",
      "url": "https://www.anapan.ro/prajituri-la-bucata/",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Ana Pan",
    "went": false
   }
  ],
  "map": {
   "mid": "1Hxw88i769fIdEV32_EAtHUfS_atEkw0",
   "title": "ブカレスト｜食べたいもの",
   "ll": "44.4343,26.0906",
   "z": 14,
   "pins": 7
  }
 },
 "buy": {
  "items": [
   {
    "id": "horezu",
    "name": "ホレズ焼き（陶器）",
    "local": {
     "text": "Ceramica de Horezu",
     "lang": "ro",
     "roman": "Ceramica de Horezu"
    },
    "body": "ヴルチャ県の北で手作りされる陶器。こげ茶・赤・緑・青と「ホレズの象牙色」で伝統の模様を描く。2012年にユネスコの無形文化遺産になった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ceramica+de+Horezu+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "UNESCO「Decision of the Intergovernmental Committee: 7.COM 11.28」（ホレズの陶器）",
      "url": "https://ich.unesco.org/en/decisions/7.COM/11.28",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "ie",
    "name": "刺繍のブラウス「イエ」",
    "local": {
     "text": "Ie",
     "lang": "ro",
     "roman": "Ie"
    },
    "body": "天然の糸で手作りする白いブラウスで、肩に色とりどりの刺繍が入る。男女の民族衣装の1つで、2022年にユネスコの無形文化遺産になった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ie+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "UNESCO「The art of the traditional blouse with embroidery on the shoulder (altiță)」",
      "url": "https://ich.unesco.org/en/RL/the-art-of-the-traditional-blouse-with-embroidery-on-the-shoulder-alti-an-element-of-cultural-identity-in-romania-and-the-republic-of-moldova-01861",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "zacusca",
    "name": "ザクスカ（野菜のペースト）",
    "local": {
     "text": "Zacuscă",
     "lang": "ro",
     "roman": "Zacusca"
    },
    "body": "焼いたなすと赤ピーマン、炒めた玉ねぎ、トマトペーストを、弱火で長く煮たペースト。",
    "facts": [
     {
      "label": "どこで",
      "text": "メガ・イマージュ（統一広場のスーパー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Zacusc%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "megaimage"
    ],
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "magiun",
    "name": "マジウン（すもものジャム）",
    "local": {
     "text": "Magiun de prune Topoloveni",
     "lang": "ro",
     "roman": "Magiun de prune Topoloveni"
    },
    "body": "すもものジャム。トポロヴェニのマジウンは、ルーマニアの地理的表示（PGI）に登録されている。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Magiun+de+prune+Topoloveni+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "rom",
    "name": "ROMのチョコバー",
    "local": {
     "text": "Rom",
     "lang": "ro",
     "roman": "Rom"
    },
    "body": "1964年から同じ作りの、ラムの香りがするチョコバー。包みは国旗の3色で、名前は国の名の頭3文字。",
    "facts": [
     {
      "label": "アルコール",
      "text": "中のクリームに、エタノールとラムが少し入っている（ラムは0.1%）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Rom+Bucure%C8%99ti&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Le Petit Journal Bucarest「Ces 5 sucreries roumaines qui nous rappellent notre enfance」（2025年2月19日更新）",
      "url": "https://lepetitjournal.com/bucarest/communaute/ces-5-sucreries-roumaines-qui-nous-rappellent-notre-enfance-324018",
      "seen": "2026-11-19"
     },
     {
      "name": "Open Food Facts「Rom ciocolată cu lapte」（2026年11月16日更新）",
      "url": "https://world.openfoodfacts.org/product/5941047823892",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "eugenia",
    "name": "オイゲニアのビスケット",
    "local": {
     "text": "Eugenia",
     "lang": "ro",
     "roman": "Eugenia"
    },
    "body": "ココアかバニラのクリームを挟んだビスケット。70年あまり作られている、共産主義の時代からある数少ないビスケットの1つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Eugenia+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Le Petit Journal Bucarest「Ces 5 sucreries roumaines qui nous rappellent notre enfance」（2025年2月19日更新）",
      "url": "https://lepetitjournal.com/bucarest/communaute/ces-5-sucreries-roumaines-qui-nous-rappellent-notre-enfance-324018",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "gerovital",
    "name": "ジェロヴィタールの化粧品",
    "local": {
     "text": "Gerovital",
     "lang": "ro",
     "roman": "Gerovital"
    },
    "body": "ルーマニアでいちばん大きい化粧品の会社ファルメク（クルジュ＝ナポカ）の銘柄。医師アナ・アスランが作った「ジェロヴィタールH3」の名と作る権利を持つ。",
    "facts": [
     {
      "label": "どこで",
      "text": "ジェロヴィタール パークレイク店（化粧品）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Gerovital+Bucure%C8%99ti&hl=ja",
    "places": [
     "gerovital"
    ],
    "src": [
     {
      "name": "Wikipedia「Farmec」",
      "url": "https://en.wikipedia.org/wiki/Farmec",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "wine",
    "name": "ルーマニアワインの瓶",
    "local": {
     "text": "Vin românesc",
     "lang": "ro",
     "roman": "Vin romanesc"
    },
    "body": "ワインの伝統は3,000年を超える。在来のぶどうのフェテアスカ・グラサ・タマイオアサ・ブスイオアカ・バベアスカで作るワインが多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Vin+rom%C3%A2nesc+Bucure%C8%99ti&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "tuica",
    "name": "ツイカ・パーリンカの瓶",
    "local": {
     "text": "Țuică",
     "lang": "ro",
     "roman": "Tuica"
    },
    "body": "すももの蒸留酒ツイカと、2回蒸留した果実の蒸留酒パーリンカ。",
    "facts": [
     {
      "label": "どこで",
      "text": "メガ・イマージュ（統一広場のスーパー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C8%9Auic%C4%83+Bucure%C8%99ti&hl=ja",
    "places": [
     "megaimage"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Romanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
      "seen": "2026-11-19"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "megaimage",
    "name": "メガ・イマージュ（統一広場のスーパー）",
    "what": "統一広場の角にあるスーパー。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mega+Image+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap「Mega Image」",
      "url": "https://www.openstreetmap.org/node/1439628129",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Mega Image",
    "went": false
   },
   {
    "id": "gerovital",
    "name": "ジェロヴィタール パークレイク店（化粧品）",
    "what": "ファルメクがブカレストに開いた最初のジェロヴィタールの店（2016年）。商業施設パークレイクの中で、ジェロヴィタールとアスラヴィタールの品を全部置く。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Gerovital+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Actual de Cluj「Farmec deschide la București primul magazin Gerovital din România」（2016年9月21日）",
      "url": "https://actualdecluj.ro/?p=66837",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Gerovital」",
      "url": "https://www.openstreetmap.org/node/11009898049",
      "seen": "2026-11-19"
     }
    ],
    "roman": "Gerovital",
    "km": 4.0
   }
  ],
  "map": {
   "mid": "1s_CajsZr1gRTujN2bAp5hJwkfG3vgRI",
   "title": "ブカレスト｜買いたいもの",
   "ll": "44.4241,26.1265",
   "z": 13,
   "pins": 2
  }
 },
 "videos": {
  "streams": {
   "country": "romania",
   "city": "ルーマニア"
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
    "lead": "平年の最高気温が18〜31℃",
    "to": "#guide-season"
   },
   {
    "id": "safety",
    "icon": "key",
    "label": "治安",
    "value": "概して良好",
    "lead": "客引きのバーと白タクに注意",
    "to": "#guide-safety"
   },
   {
    "id": "budget",
    "icon": "wallet",
    "label": "乗り物の目安",
    "value": "1回3〜5レイ",
    "lead": "バス・トラム3レイ、地下鉄5レイ",
    "to": "#budget"
   },
   {
    "id": "transit",
    "icon": "bus",
    "label": "移動",
    "value": "地下鉄5路線",
    "lead": "カードのタッチで乗れる",
    "to": "#guide-transit"
   }
  ],
  "guides": [
   {
    "id": "airport",
    "icon": "plane",
    "title": "空港から市内へ",
    "lead": "急行バス100番で統一広場へ",
    "parts": [
     {
      "h": "",
      "text": "アンリ・コアンダ国際空港（OTP）は市の中心から北へ約18km。"
     },
     {
      "h": "",
      "text": "急行バス100番が統一広場まで走る。90分で3レイ（約100円。2025年7月）。カードのタッチで払える。"
     },
     {
      "h": "",
      "text": "北駅（ガラ・デ・ノルド）までの列車もある。おおよそ40分おき。"
     },
     {
      "h": "",
      "text": "タクシーは到着ロビーにある公式のタッチパネルで呼ぶ。中心まで61〜65レイ（約2,000〜2,130円）。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "transit",
    "icon": "bus",
    "title": "市内の乗り物",
    "lead": "地下鉄は5路線。タッチで乗れる",
    "parts": [
     {
      "h": "",
      "text": "地下鉄（メトロレックス）は M1〜M5 の5路線で、5時から23時ごろまで。夜通しは走らない。"
     },
     {
      "h": "",
      "text": "バス・トラム・トロリーバスは90分で3レイ。地下鉄の紙の切符は2回で10レイ（2025年9月）。"
     },
     {
      "h": "",
      "text": "カードのタッチで、地下鉄の全駅とたいていのバス、一部のトラムに乗れる。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "pay",
    "icon": "currency",
    "title": "払いかたとチップ",
    "lead": "通貨はレウ。空港の両替は避ける",
    "parts": [
     {
      "h": "",
      "text": "通貨はレウ（複数形はレイ。RON）。1レウは約32.7円（2026年11月18日の参照レート）。"
     },
     {
      "h": "",
      "text": "空港の両替はレートが1割ほど悪い。北駅の両替もよくない。"
     }
    ],
    "src": [
     {
      "name": "欧州中央銀行（ユーロの参照レート）",
      "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "sim",
    "icon": "sim",
    "title": "ネットと SIM",
    "lead": "携帯の会社は3つ。eSIM も使える",
    "parts": [
     {
      "h": "",
      "text": "携帯の会社は2025年10月から Orange・Vodafone・Digi の3つ（Telekom の携帯は Vodafone と Digi が引き継いだ）。"
     },
     {
      "h": "",
      "text": "eSIM が使える。SIM は空港の到着ロビーの、タクシーを呼ぶタッチパネルの近くの売店でも買える。"
     }
    ],
    "src": [
     {
      "name": "Business Forum「Vodafone and Digi complete Telekom Romania mobile acquisition」（2025年10月2日）",
      "url": "https://www.businessforum.ro/industry/20251002/vodafone-and-digi-complete-telekom-romania-mobile-acquisition-2377/amp",
      "seen": "2026-11-19"
     },
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "safety",
    "icon": "key",
    "title": "治安のコツ",
    "lead": "客引きのバーと白タクに注意",
    "parts": [
     {
      "h": "",
      "text": "客引きに誘われたバーで、注文に見合わない法外な会計をされた日本人の例がある。客引きにはついて行かない。"
     },
     {
      "h": "",
      "text": "空港や駅では、無許可の白タクが親切を装って近づき、高い料金を請求する。通常20〜30レイのところを40〜60レイなど。配車アプリか公式の乗り場で。"
     },
     {
      "h": "",
      "text": "公共交通機関の中ではスリ、ホテルやレストランでは置き引きに注意。"
     },
     {
      "h": "水道水",
      "text": "水道は配管の手入れが悪く、水が濁ることがある。飲むのは市販のボトルの水がすすめられている。"
     }
    ],
    "src": [
     {
      "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "id": "phrases",
    "icon": "phrase",
    "title": "ルーマニア語のひとこと",
    "lead": "Bună ziua（ブナ・ズィウア）＝こんにちは",
    "parts": [],
    "src": [
     {
      "name": "Wikivoyage「Romanian phrasebook」",
      "url": "https://en.wikivoyage.org/wiki/Romanian_phrasebook",
      "seen": "2026-11-19"
     }
    ],
    "words": [
     {
      "local": {
       "text": "Bună ziua",
       "lang": "ro",
       "roman": "buna ziua",
       "kana": "ブナ・ズィウア"
      },
      "jp": "こんにちは"
     },
     {
      "local": {
       "text": "Bună dimineața",
       "lang": "ro",
       "roman": "buna dimineata",
       "kana": "ブナ・ディミネアツァ"
      },
      "jp": "おはようございます"
     },
     {
      "local": {
       "text": "Mulțumesc",
       "lang": "ro",
       "roman": "multumesc",
       "kana": "ムルツメスク"
      },
      "jp": "ありがとう"
     },
     {
      "local": {
       "text": "Da",
       "lang": "ro",
       "roman": "da",
       "kana": "ダ"
      },
      "jp": "はい"
     },
     {
      "local": {
       "text": "Nu",
       "lang": "ro",
       "roman": "nu",
       "kana": "ヌ"
      },
      "jp": "いいえ"
     },
     {
      "local": {
       "text": "Pardon",
       "lang": "ro",
       "roman": "pardon",
       "kana": "パルドン"
      },
      "jp": "すみません"
     },
     {
      "local": {
       "text": "Cât costă asta?",
       "lang": "ro",
       "roman": "cat costa asta",
       "kana": "クト・コスタ・アスタ？"
      },
      "jp": "これはいくらですか？"
     },
     {
      "local": {
       "text": "Nota, vă rog",
       "lang": "ro",
       "roman": "nota va rog",
       "kana": "ノタ・ヴァ・ログ"
      },
      "jp": "お勘定をお願いします"
     },
     {
      "local": {
       "text": "Poftă bună",
       "lang": "ro",
       "roman": "pofta buna",
       "kana": "ポフタ・ブナ"
      },
      "jp": "召し上がれ"
     },
     {
      "local": {
       "text": "La revedere",
       "lang": "ro",
       "roman": "la revedere",
       "kana": "ラ・レヴェデレ"
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
     "text": "平年の最高気温が18〜31℃になるのは4〜10月。11月は10.5℃、12月は4.2℃まで下がる。"
    },
    {
     "h": "祝日",
     "text": "12月1日は国の祝日（大統一の日）。ブカレストでは軍のパレードがあり、凱旋門のそばのキセレフ通りか、憲法広場で開かれる。"
    },
    {
     "h": "時差",
     "text": "ルーマニアは東ヨーロッパ時間（UTC+2）で、日本より7時間遅い。3月の最終日曜から10月の最終日曜までは夏時間（UTC+3）で6時間遅い。"
    }
   ],
   "src": [
    {
     "name": "Wikipedia（日本語）「ブカレスト」",
     "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
     "seen": "2026-11-19"
    },
    {
     "name": "Wikipedia「Great Union Day」",
     "url": "https://en.wikipedia.org/wiki/Great_Union_Day",
     "seen": "2026-11-19"
    },
    {
     "name": "Wikipedia「Time in Romania」",
     "url": "https://en.wikipedia.org/wiki/Time_in_Romania",
     "seen": "2026-11-19"
    }
   ]
  },
  "budget": {
   "rows": [],
   "tips": [],
   "days": [],
   "extras": [
    {
     "label": "バス・トラム1回（90分）",
     "local": "3レイ",
     "yen": "100円",
     "src": [
      {
       "name": "Wikivoyage「Bucharest」",
       "url": "https://en.wikivoyage.org/wiki/Bucharest",
       "seen": "2026-11-19"
      }
     ]
    },
    {
     "label": "地下鉄1回（2回券を割って）",
     "local": "5レイ",
     "yen": "160円",
     "src": [
      {
       "name": "Wikivoyage「Bucharest」",
       "url": "https://en.wikivoyage.org/wiki/Bucharest",
       "seen": "2026-11-19"
      }
     ]
    },
    {
     "label": "地下鉄とバスの乗り継ぎ（120分）",
     "local": "7レイ",
     "yen": "230円",
     "src": [
      {
       "name": "Wikivoyage「Bucharest」",
       "url": "https://en.wikivoyage.org/wiki/Bucharest",
       "seen": "2026-11-19"
      }
     ]
    },
    {
     "label": "空港バス100番（90分）",
     "local": "3レイ",
     "yen": "100円",
     "src": [
      {
       "name": "Wikivoyage「Bucharest」",
       "url": "https://en.wikivoyage.org/wiki/Bucharest",
       "seen": "2026-11-19"
      }
     ]
    },
    {
     "label": "空港から中心までタクシー",
     "local": "61〜65レイ",
     "yen": "2,000〜2,130円",
     "src": [
      {
       "name": "Wikivoyage「Bucharest」",
       "url": "https://en.wikivoyage.org/wiki/Bucharest",
       "seen": "2026-11-19"
      }
     ]
    },
    {
     "label": "地下鉄の10回券",
     "local": "40レイ",
     "yen": "1,310円",
     "src": [
      {
       "name": "Wikivoyage「Bucharest」",
       "url": "https://en.wikivoyage.org/wiki/Bucharest",
       "seen": "2026-11-19"
      }
     ]
    }
   ],
   "rate": "1レウは約32.7円。ルーマニアのレウ（RON。複数形はレイ）は変動相場で、円は1ユーロ＝5.3467レイ・174.85円（2026年11月18日の欧州中央銀行の参照レート）で直した。",
   "rateSrc": [
    {
     "name": "欧州中央銀行（ユーロの参照レート）",
     "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
     "seen": "2026-11-19"
    }
   ]
  },
  "pack": [
   {
    "icon": "passport",
    "label": "パスポート",
    "why": "国民の館の見学でも見せる。",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "icon": "coin",
    "label": "少しのレイの現金",
    "why": "空港の両替はレートが1割ほど悪いので、両替は街で。",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "icon": "jacket",
    "label": "冬の上着",
    "why": "11月の平均最低は1.4℃、12月は-3.3℃。",
    "src": [
     {
      "name": "Wikipedia（日本語）「ブカレスト」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "icon": "bottle",
    "label": "水のボトル",
    "why": "水道水は濁ることがあり、飲むのは市販の水がすすめられている。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "icon": "firstaid",
    "label": "海外旅行の保険",
    "why": "救急病院は国立救急病院（電話 021-599-2300）。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
      "seen": "2026-11-19"
     }
    ]
   },
   {
    "icon": "phrase",
    "label": "翻訳のアプリ",
    "why": "警察に届けるときはルーマニア語の通訳が要る。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
      "seen": "2026-11-19"
     }
    ]
   }
  ],
  "climate": {
   "months": [
    {
     "hi": 3.0,
     "lo": -5.0,
     "mm": 40.1
    },
    {
     "hi": 6.3,
     "lo": -3.5,
     "mm": 33.0
    },
    {
     "hi": 12.3,
     "lo": 0.3,
     "mm": 42.4
    },
    {
     "hi": 18.5,
     "lo": 4.9,
     "mm": 50.2
    },
    {
     "hi": 24.1,
     "lo": 9.7,
     "mm": 70.4
    },
    {
     "hi": 28.1,
     "lo": 13.9,
     "mm": 82.7
    },
    {
     "hi": 30.4,
     "lo": 15.6,
     "mm": 68.6
    },
    {
     "hi": 30.6,
     "lo": 15.2,
     "mm": 48.9
    },
    {
     "hi": 25.0,
     "lo": 10.7,
     "mm": 60.5
    },
    {
     "hi": 18.0,
     "lo": 5.7,
     "mm": 60.7
    },
    {
     "hi": 10.5,
     "lo": 1.4,
     "mm": 43.6
    },
    {
     "hi": 4.2,
     "lo": -3.3,
     "mm": 47.0
    }
   ],
   "note": "平均最高と平均最低。ブカレスト（1991〜2020年の平年値）",
   "src": [
    {
     "name": "Wikipedia（日本語）「ブカレスト」",
     "url": "https://ja.wikipedia.org/wiki/%E3%83%96%E3%82%AB%E3%83%AC%E3%82%B9%E3%83%88",
     "seen": "2026-11-19"
    }
   ]
  },
  "help": {
   "calls": [
    {
     "num": "112",
     "label": "警察・救急・消防",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
       "seen": "2026-11-19"
      }
     ]
    },
    {
     "num": "021-599-2300",
     "label": "国立救急病院",
     "note": "ブカレスト",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
       "seen": "2026-11-19"
      }
     ]
    }
   ],
   "embassy": {
    "name": "在ルーマニア日本国大使館",
    "address": "Șoseaua Nicolae Titulescu 4-8, București",
    "tel": "（市外局番 021）319-1890",
    "note": "ブカレストに日本の大使館がある。犯罪の被害に遭ったら、警察に届けて大使館にも知らせる。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ambasada+Japoniei+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（ルーマニア 安全対策基礎データ。2025年11月7日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_177.html",
      "seen": "2026-11-19"
     },
     {
      "name": "OpenStreetMap「Ambasada Japoniei」",
      "url": "https://www.openstreetmap.org/node/4281742495",
      "seen": "2026-11-19"
     }
    ]
   }
  }
 },
 "published": "2026-11-19",
 "updated": "2026-11-20",
 "hash": "da53557fae379bb6"
}
/* END GUIDE */;
