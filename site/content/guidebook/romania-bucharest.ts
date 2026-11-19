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
 "lead": "「小パリ」と称えられた街",
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
 "description": "ルーマニアの首都ブカレストの観光ガイド。見どころマップと地区、やりたいこと3つ（アテネ音楽堂の演奏会、本場のサルマーレ、揚げたてのパパナシ）、食べたいもの・買いたいもの・基本情報。",
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
     "cec"
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
     "patriarchal"
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
     "calea"
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
   "id": "sarmale",
   "title": "本場のサルマーレを食べたい！",
   "lead": "ロールキャベツにママリガとサワークリーム",
   "what": "ルーマニアのロールキャベツ、サルマーレを食べる。酢漬けのキャベツかぶどうの葉で、ひき肉と米と玉ねぎを包み、陶器の鍋で何時間も煮る。とうもろこしの粥ママリガを添えて食べることが多い。",
   "how": "",
   "time": "",
   "money": "",
   "tip": "米と香草だけで包んだ、肉の入らない作りもある。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikipedia「Romanian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Romanian_cuisine",
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
   "how": "",
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
    }
   ],
   "eat": [
    "papanasi"
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
   "tip": "",
   "route": "",
   "see": [
    "athenaeum"
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
   ],
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
   }
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
    "body": "チャウシェスクの命で1984年に建て始め、1997年にできた議会の建物。重さは世界一とされ、行政の建物としてはアメリカの国防総省に次ぐ大きさ。",
    "facts": [
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
    "body": "1989年の革命の舞台の1つになった広場。真ん中に記念碑が立ち、まわりに旧王宮や大学図書館の建物が並ぶ。",
    "facts": [],
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
    "body": "1888年に開いた丸屋根の音楽堂で、ジョルジェ・エネスク・フィルハーモニーの本拠。中の壁には、ルーマニアの歴史を描いた絵がぐるりと続く。",
    "facts": [],
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
    "body": "18世紀の初めに建った小さな修道院の教会。石の彫刻と壁画で知られる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%83n%C4%83stirea+Stavropoleos+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
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
    "body": "ワラキアの公たちの宮廷の跡。1459年にこの地の城塞がヴラド・ツェペシュの居城になったのが、ブカレストが史書に出る最初とされる。",
    "facts": [],
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
    "body": "いまの石の門は1936年にできた。12月1日の国の祝日の軍のパレードは、この門のそばのキセレフ通りか、国民の館の前の憲法広場で開かれる。",
    "facts": [],
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
    "body": "国じゅうから運んできた昔の家や教会が、湖のほとりの林に並ぶ野外の博物館。建物は300ほど。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeul+Satului+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
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
    "body": "湖を囲む、市内でいちばん大きな公園。夏は貸しボートが出る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Parcul+Regele+Mihai+I+Bucure%C8%99ti&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Bucharest」",
      "url": "https://en.wikivoyage.org/wiki/Bucharest",
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
    "body": "ニコラエ・チャウシェスクが暮らした家。いまは中を見て回れる博物館。",
    "facts": [],
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
     }
    ],
    "geo": {
     "lat": 45.515077,
     "lon": 25.367237
    },
    "line": "中心から134km"
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
   }
  ],
  "map": {
   "mid": "1bnQj8W6JkK0YPI-0SsMHit1zGEe3xqU",
   "title": "ブカレスト｜見たいもの",
   "ll": "44.4333,26.0947",
   "z": 13,
   "pins": 15
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
      "text": "ハヌル・ルイ・マヌク（旧市街の宿屋のレストラン）"
     },
     {
      "label": "豚肉",
      "text": "ひき肉の種類は店や家で違う。トランシルヴァニアでは燻した豚の足や皮を鍋に入れる。米と香草だけの作りもある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sarmale+Bucure%C8%99ti&hl=ja",
    "places": [
     "manuc"
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
      "label": "豚肉",
      "text": "羊だけの作りと、豚・子牛・羊を合わせる作りがある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mititei+Bucure%C8%99ti&hl=ja",
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
      "label": "豚肉",
      "text": "具はスープの種類で違う（肉・野菜・もつ）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ciorb%C4%83+Bucure%C8%99ti&hl=ja",
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
    "id": "mamaliga",
    "name": "ママリガ（とうもろこしの粥）",
    "local": {
     "text": "Mămăligă",
     "lang": "ro",
     "roman": "Mămăligă"
    },
    "body": "とうもろこしの粉を煮た、ルーマニア風のポレンタ。それだけでも、料理に添えても食べる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=M%C4%83m%C4%83lig%C4%83+Bucure%C8%99ti&hl=ja",
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
    "id": "papanasi",
    "name": "パパナシ（揚げドーナツ）",
    "local": {
     "text": "Papanași",
     "lang": "ro",
     "roman": "Papanași"
    },
    "body": "甘いチーズと卵とセモリナの生地を、ゆでるか揚げる。果物のジャムかシロップと、サワークリームをかける。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Papana%C8%99i+Bucure%C8%99ti&hl=ja",
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
    "roman": "Caru' cu Bere"
   }
  ],
  "map": {
   "mid": "1Hxw88i769fIdEV32_EAtHUfS_atEkw0",
   "title": "ブカレスト｜食べたいもの",
   "ll": "44.4325,26.1002",
   "z": 15,
   "pins": 3
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
   }
  ],
  "map": {
   "mid": "1s_CajsZr1gRTujN2bAp5hJwkfG3vgRI",
   "title": "ブカレスト｜買いたいもの",
   "ll": "44.4284,26.1046",
   "z": 17,
   "pins": 1
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
 "hash": "bb378f598c0efc1c"
}
/* END GUIDE */;
