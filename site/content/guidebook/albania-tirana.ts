/**
 * ティラナのガイドブック（`/travel/albania/tirana`）の中身。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/albania/tirana/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_bake.py albania/tirana` で焼き直す。
 * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。
 */
import type { Guidebook } from "./types";

export const TIRANA: Guidebook = /* BEGIN GUIDE */
{
 "country": "albania",
 "city": "tirana",
 "name": "ティラナ",
 "kicker": "アルバニア",
 "local": {
  "text": "Tirana",
  "lang": "sq",
  "roman": "Tirana"
 },
 "lead": "「ヨーロッパの隠れた宝石」と称えられる国の首都",
 "cover": {
  "src": "/guide/albania/tirana/photos/tirana-skanderbeg-square-sheshi-03607d53-960.webp",
  "small": "/guide/albania/tirana/photos/tirana-skanderbeg-square-sheshi-03607d53-500.webp",
  "w": 960,
  "h": 578,
  "alt": "スカンデルベグ広場。広い石の広場の先に騎馬像と建物",
  "kind": "photo",
  "credit": {
   "by": "Pudelek",
   "lic": "CC BY-SA 4.0",
   "page": "https://commons.wikimedia.org/wiki/File:Tirana_-_Skanderbeg_Square_(Sheshi_Sk%C3%ABnderbej)_-_by_Pudelek.jpg"
  }
 },
 "title": "ティラナ観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜アルバニア",
 "description": "アルバニアの首都ティラナの観光ガイド。見どころマップと、やりたいこと8つ（核シェルターの博物館、ピラミッド、ダイティ山のロープウェイ、クルヤ城への日帰り）、フェルゲセとビュレク。",
 "rate": {
  "unit": "レク",
  "yen": 1.94,
  "date": "2026-11-20"
 },
 "about": {
  "cards": [
   {
    "id": "hero",
    "icon": "statue",
    "q": "スカンデルベグって誰？",
    "a": "15世紀にオスマン帝国と戦った国の英雄。街のまん中の広場に騎馬像が立ち、広場の名前にもなっている。",
    "src": [
     {
      "name": "Wikipedia「Skanderbeg」",
      "url": "https://en.wikipedia.org/wiki/Skanderbeg",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Skanderbeg Square」",
      "url": "https://en.wikipedia.org/wiki/Skanderbeg_Square",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "isolation",
    "icon": "tunnel",
    "q": "共産主義の時代は？",
    "a": "ホッジャの政権は国を自ら閉ざし、1960〜80年代に国じゅうで17万を超えるトーチカを造った。",
    "src": [
     {
      "name": "Wikipedia「Tirana」",
      "url": "https://en.wikipedia.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Bunkers in Albania」",
      "url": "https://en.wikipedia.org/wiki/Bunkers_in_Albania",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "areas": [
   {
    "id": "skanderbeg",
    "name": "スカンデルベグ広場周辺",
    "color": "#ffd98a",
    "lead": "英雄の騎馬像の立つ広場のまわりに、モスクと時計塔、オペラの建物、博物館が集まる街のまん中",
    "see": [
     "skanderbeg",
     "ethem",
     "clock",
     "bunkart2",
     "leaves",
     "cathedral",
     "namazgah",
     "tanners"
    ],
    "plan": [
     2,
     1,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Skanderbeg Square」",
      "url": "https://en.wikipedia.org/wiki/Skanderbeg_Square",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Sheshi Skënderbej」",
      "url": "https://www.openstreetmap.org/relation/21803823",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Shtëpia me Gjethe - Muzeu i Përgjimeve të Sigurimit të Shtetit」",
      "url": "https://www.openstreetmap.org/way/418943098",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Ura e Tabakëve」",
      "url": "https://www.openstreetmap.org/way/627129048",
      "seen": "2026-11-23"
     }
    ],
    "local": {
     "text": "Sheshi Skënderbej",
     "lang": "sq",
     "roman": "Sheshi Skenderbej"
    }
   },
   {
    "id": "pazari",
    "name": "パザリ・イ・リ",
    "color": "#d9ccf5",
    "lead": "1931年に古いバザールの跡に作られた市場の一帯",
    "see": [
     "pazari"
    ],
    "plan": [
     3,
     1,
     1
    ],
    "src": [
     {
      "name": "Wikipedia「New Bazaar, Tirana」",
      "url": "https://en.wikipedia.org/wiki/New_Bazaar,_Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Pazari i Ri」",
      "url": "https://www.openstreetmap.org/way/480510821",
      "seen": "2026-11-23"
     }
    ],
    "body": "2017年に作り直され、古いココノジ・モスクが残る。",
    "local": {
     "text": "Pazari i Ri",
     "lang": "sq",
     "roman": "Pazari i Ri"
    }
   },
   {
    "id": "blloku",
    "name": "ブロック",
    "color": "#ffc4d2",
    "lead": "共産主義の時代は入れなかった幹部の住む一帯",
    "see": [
     "pyramid",
     "blloku",
     "postbllok",
     "teresa"
    ],
    "plan": [
     1,
     2,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Ish-Blloku」",
      "url": "https://en.wikipedia.org/wiki/Ish-Blloku",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Blloku」",
      "url": "https://www.openstreetmap.org/node/6298022013",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Piramida e Tiranës」",
      "url": "https://www.openstreetmap.org/way/174510408",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Bunkeri i Memorialit \"Postbllok\"」",
      "url": "https://www.openstreetmap.org/node/5179401322",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Sheshi Nënë Tereza」",
      "url": "https://www.openstreetmap.org/way/1292145197",
      "seen": "2026-11-23"
     }
    ],
    "body": "いまはカフェとレストラン、バーが並ぶ。",
    "local": {
     "text": "Blloku",
     "lang": "sq",
     "roman": "Blloku"
    }
   }
  ]
 },
 "todo": [
  {
   "id": "bunkart",
   "title": "核シェルターの博物館に潜りたい！",
   "lead": "冷戦の時代に掘った地下の部屋を歩く",
   "what": "共産主義の時代の地下のシェルターを使った博物館、バンクアートを歩く。エンヴェル・ホッジャの政権は、1960〜80年代に国じゅうで17万を超えるトーチカを造った。バンクアート1は1970年代に国の指導者たちのために造った核シェルターで、地下の何階にもわたって約3,000平方メートルある。バンクアート2は旧内務省の下のシェルターと地下道で、警察と秘密警察の歴史を見せる。",
   "how": "バンクアート2はスカンデルベグ広場のすぐ東。バンクアート1は、ダイティ山のロープウェイの乗り場のすぐ北にある。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "バンクアート1とダイティ・エクスプレスは近いので、同じ日に回せる。",
   "see": [
    "bunkart2",
    "bunkart1"
   ],
   "src": [
    {
     "name": "Wikivoyage「Tirana」",
     "url": "https://en.wikivoyage.org/wiki/Tirana",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Bunkers in Albania」",
     "url": "https://en.wikipedia.org/wiki/Bunkers_in_Albania",
     "seen": "2026-11-23"
    },
    {
     "name": "OpenStreetMap「Bunk'Art」",
     "url": "https://www.openstreetmap.org/node/4306447779",
     "seen": "2026-11-23"
    },
    {
     "name": "OpenStreetMap「Dajti Ekspres」",
     "url": "https://www.openstreetmap.org/way/1562005169",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "pyramid",
   "title": "ピラミッドの上に登りたい！",
   "lead": "独裁者の記念館が若者の学びの場に",
   "what": "大通りに立つティラナのピラミッドの、外の階段を上る。1988年にエンヴェル・ホッジャの記念館として開いた。設計にはホッジャの娘が加わった。1991年からは会議場、1999年のコソボ紛争ではNATOの拠点になった。オランダの設計事務所MVRDVが、もとのコンクリートの形を残して直し、段々の階段と明かり窓を足した。2023年に開いた。",
   "how": "殉教者大通り沿い。スカンデルベグ広場から南へ歩ける。",
   "time": "上れるのは明るいあいだ。",
   "money": "",
   "tip": "",
   "route": "",
   "see": [
    "pyramid"
   ],
   "src": [
    {
     "name": "Wikipedia「Pyramid of Tirana」",
     "url": "https://en.wikipedia.org/wiki/Pyramid_of_Tirana",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Tirana」",
     "url": "https://en.wikivoyage.org/wiki/Tirana",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "dajti",
   "title": "ロープウェイでダイティ山へ行きたい！",
   "lead": "15分の空中散歩で街を見下ろす",
   "what": "ロープウェイのダイティ・エクスプレスで、街の東のダイティ山へ上る。国でいちばん行きやすい山で、街の人は羊の丸焼きの昼ごはんに上る。",
   "how": "時計塔から出る青いポルチェラン行きのバスが、いちばん速くて乗り換えも無い。終点から坂を少し上ると乗り場。バスは5時半から24時まで、5〜20分おき。",
   "time": "上の駅まで約15分。火曜日が休み（祝日なら動く）。",
   "money": "店と決めたタクシーの「メル・タクシー」なら、中心から乗り場まで片道750レク。",
   "tip": "切符は下の駅でだけ買える。祝日などは並ぶので、9時から11時に着くのがよい。切符は買った日だけ使える。",
   "route": "",
   "see": [
    "dajti"
   ],
   "src": [
    {
     "name": "Dajti Ekspres「FAQ」",
     "url": "https://dajtiekspres.com/faq/",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Tirana」",
     "url": "https://en.wikivoyage.org/wiki/Tirana",
     "seen": "2026-11-23"
    },
    {
     "name": "Dajti Ekspres「Getting here」",
     "url": "https://dajtiekspres.com/getting-here/",
     "seen": "2026-11-23"
    },
    {
     "name": "Dajti Ekspres「Tickets & Opening Times」",
     "url": "https://dajtiekspres.com/rates-and-opening-hours/",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "byrek",
   "title": "焼きたてのビュレクを食べたい！",
   "lead": "ほうれん草やチーズを薄い生地で包むパイ",
   "what": "アルバニアのパイ、ビュレクを食べる。手でのばした薄い生地を何枚も重ねて焼く。屋台の店「ビュレクトレ」は小さな三角に包んで売る。ティラナのあたりは、肉・ほうれん草・チーズの詰め物が多い。",
   "how": "ブロックのミスター・チキンの品書きに、鶏肉のビュレクがある。",
   "time": "",
   "money": "ミスター・チキンの鶏肉のビュレクは350レク（Wolt の配達の品書き）。",
   "tip": "詰め物は、塩気のある凝乳のチーズ（ギゼ）、ひき肉と玉ねぎ、ほうれん草と卵がよくある。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikipedia「Börek」",
     "url": "https://en.wikipedia.org/wiki/B%C3%B6rek",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Albania」",
     "url": "https://en.wikivoyage.org/wiki/Albania",
     "seen": "2026-11-23"
    },
    {
     "name": "Wolt「Mr. Chicken」（配達の品書き）",
     "url": "https://wolt.com/en/alb/tirana/restaurant/mr-chicken01",
     "seen": "2026-11-23"
    }
   ],
   "eat": [
    "byrek"
   ]
  },
  {
   "id": "fergese",
   "title": "名物のフェルゲセを食べたい！",
   "lead": "ピーマンとチーズの、ティラナ生まれの焼きもの",
   "what": "ティラナ生まれの郷土料理、フェルゲセを食べる。ピーマン・トマト・玉ねぎ・にんにくと塩気のある凝乳のチーズ（ギゼ）を、オリーブオイルで煮てから焼く。チーズの代わりにレバーを入れる作りは「フェルゲセ・ティラネ」と呼ぶ。",
   "how": "テク・ズガラ・エ・ティロネスとティミ・キング・ピルスの品書きにある。",
   "time": "",
   "money": "テク・ズガラ・エ・ティロネスで430レク、ティミ・キング・ピルスで420レク（Wolt の配達の品書き）。",
   "tip": "レバーを足したものはタヴェ・ゼウと呼ぶ。同じ2軒の品書きにある（550レク・540レク）。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikivoyage「Albania」",
     "url": "https://en.wikivoyage.org/wiki/Albania",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Fërgesë」",
     "url": "https://en.wikipedia.org/wiki/F%C3%ABrges%C3%AB",
     "seen": "2026-11-23"
    },
    {
     "name": "Wolt「Zgara e Tirones」（配達の品書き）",
     "url": "https://wolt.com/en/alb/tirana/restaurant/zgara-e-tirones",
     "seen": "2026-11-23"
    },
    {
     "name": "Wolt「Tymi King Pils」（配達の品書き）",
     "url": "https://wolt.com/en/alb/tirana/restaurant/restorant-tymi",
     "seen": "2026-11-23"
    }
   ],
   "eat": [
    "fergese",
    "tave-dheu"
   ]
  },
  {
   "id": "cafe",
   "title": "ブロックのカフェでくつろぎたい！",
   "lead": "カフェの数は人口あたり世界一とされる国",
   "what": "ブロックのテラスのカフェで、エスプレッソやマキアートを飲む。2016年に、人口あたりのカフェの数でスペインを抜いて世界一になった。10万人あたり654軒。ブロックは共産主義の時代、政治局の人たちだけが住み、ふつうの人は入れなかった。",
   "how": "ブロックはイスマイル・チェマリ通りとそのまわりの通り。",
   "time": "",
   "money": "",
   "tip": "アルバニアではエスプレッソ・カプチーノ・マキアート・トルココーヒーがよく飲まれる。チップの習慣は無い。都会の店なら端数を切り上げる程度。",
   "route": "",
   "see": [
    "blloku"
   ],
   "src": [
    {
     "name": "Wikipedia「Ish-Blloku」",
     "url": "https://en.wikipedia.org/wiki/Ish-Blloku",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Albanian cuisine」",
     "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Tirana」",
     "url": "https://en.wikivoyage.org/wiki/Tirana",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Albania」",
     "url": "https://en.wikivoyage.org/wiki/Albania",
     "seen": "2026-11-23"
    }
   ],
   "eat": [
    "kafe"
   ]
  },
  {
   "id": "kruja",
   "title": "英雄の城クルヤへ日帰りしたい！",
   "lead": "スカンデルベグが戦った山の上の城とバザール",
   "what": "スカンデルベグの城があるクルヤへ日帰りで行き、城と博物館とバザールを歩く。クルヤ城は、15世紀にスカンデルベグがオスマン帝国に立ち向かった拠点。城へ続く古いバザールは17世紀から。じゅうたんや手作りのフェルトの品、民族衣装の古着を売る。",
   "how": "ティラナの北バスターミナルから、7時から18時までバスかミニバスが1時間おき。約45分。",
   "time": "バザールは毎日7時から23時まで。",
   "money": "スカンデルベグ博物館は500レク。バザールの安いみやげは100レクから。",
   "tip": "",
   "route": "",
   "see": [
    "kruja",
    "skmuseum",
    "krujabazaar"
   ],
   "src": [
    {
     "name": "Wikivoyage「Krujë」",
     "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Fortress of Krujë」",
     "url": "https://en.wikipedia.org/wiki/Fortress_of_Kruj%C3%AB",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Skanderbeg」",
     "url": "https://en.wikipedia.org/wiki/Skanderbeg",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "berat",
   "title": "千の窓の町ベラトへ日帰りしたい！",
   "lead": "白い壁に窓が重なる世界遺産の町",
   "what": "「千の窓の町」と呼ばれるベラトへ、日帰りで行く。白い壁にたくさんの窓が並ぶ家々が、丘の斜面に重なって見える。2008年にユネスコの世界遺産になった。オスマン帝国と東ローマの建物が残る。川の東の丘の上に城があり、城の中も人の住む町。",
   "how": "ティラナの南70km。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "イスラム教徒の多かったマンガレム地区と、キリスト教徒の多かったゴリツァ地区が、川をはさんで向き合う。",
   "see": [
    "berat"
   ],
   "src": [
    {
     "name": "Wikivoyage「Berat」",
     "url": "https://en.wikivoyage.org/wiki/Berat",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Berat」",
     "url": "https://en.wikipedia.org/wiki/Berat",
     "seen": "2026-11-23"
    }
   ]
  }
 ],
 "see": {
  "items": [
   {
    "id": "skanderbeg",
    "name": "スカンデルベグ広場",
    "local": {
     "text": "Sheshi Skënderbej",
     "lang": "sq",
     "roman": "Sheshi Skenderbej"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/albania/tirana/photos/tirana-skanderbeg-square-sheshi-03607d53-960.webp",
     "small": "/guide/albania/tirana/photos/tirana-skanderbeg-square-sheshi-03607d53-500.webp",
     "w": 960,
     "h": 578,
     "alt": "スカンデルベグ広場。広い石の広場の先に騎馬像と建物",
     "kind": "photo",
     "credit": {
      "by": "Pudelek",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tirana_-_Skanderbeg_Square_(Sheshi_Sk%C3%ABnderbej)_-_by_Pudelek.jpg"
     }
    },
    "body": "街のまん中の広場で、広さはおよそ4万平方メートル。国の英雄スカンデルベグの騎馬像が立つ。まわりにエトヘム・ベイ・モスク・時計塔・国立歴史博物館・オペラの建物が並ぶ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sheshi+Sk%C3%ABnderbej+Tiran%C3%AB&hl=ja",
    "todo": [
     "bunkart"
    ],
    "src": [
     {
      "name": "Wikipedia「Skanderbeg Square」",
      "url": "https://en.wikipedia.org/wiki/Skanderbeg_Square",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tirana_-_Skanderbeg_Square_(Sheshi_Sk%C3%ABnderbej)_-_by_Pudelek.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.328144,
     "lon": 19.818434
    },
    "area": "skanderbeg"
   },
   {
    "id": "ethem",
    "name": "エトヘム・ベイ・モスク",
    "local": {
     "text": "Xhamia e Et'hem Beut",
     "lang": "sq",
     "roman": "Xhamia e Ethem Beut"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/albania/tirana/photos/et-hem-bey-mosque-30519049807-57421dd2-960.webp",
     "small": "/guide/albania/tirana/photos/et-hem-bey-mosque-30519049807-57421dd2-500.webp",
     "w": 768,
     "h": 1024,
     "alt": "エトヘム・ベイ・モスクと隣の時計塔",
     "kind": "photo",
     "credit": {
      "by": "David Stanley from Nanaimo, Canada",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Et%27_hem_Bey_Mosque_(30519049807).jpg"
     }
    },
    "body": "木や滝や橋を描いた、柱廊の外と中のフレスコ画で知られるモスク。共産主義の時代は閉じられ、1991年に許しの無いまま1万人が集まって礼拝が戻った。1821年にできた。",
    "facts": [
     {
      "label": "見学",
      "text": "毎日見学できるが、礼拝の時間は入れない。奥の部屋は靴を脱ぐ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Xhamia+e+Et%27hem+Beut+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Et'hem Bey Mosque」",
      "url": "https://en.wikipedia.org/wiki/Et%27hem_Bey_Mosque",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Et%27_hem_Bey_Mosque_(30519049807).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.327802,
     "lon": 19.819326
    },
    "area": "skanderbeg"
   },
   {
    "id": "clock",
    "name": "時計塔",
    "local": {
     "text": "Kulla e Sahatit",
     "lang": "sq",
     "roman": "Kulla e Sahatit"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/clock-tower-of-tirana-1-afa18e6b-960.webp",
     "small": "/guide/albania/tirana/photos/clock-tower-of-tirana-1-afa18e6b-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "石を積んだ四角い時計塔",
     "kind": "photo",
     "credit": {
      "by": "Radosław Botev",
      "lic": "CC BY 3.0 pl",
      "page": "https://commons.wikimedia.org/wiki/File:Clock_Tower_of_Tirana_(1).jpg"
     }
    },
    "body": "エトヘム・ベイ・モスクの隣に立つ、オスマン帝国の時代の塔。1822年にできたとも、1822年に建て始めて1830年にできたとも伝わる。街の古い建物の1つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kulla+e+Sahatit+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Clock Tower of Tirana」",
      "url": "https://en.wikipedia.org/wiki/Tirana_Clock_Tower",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Clock_Tower_of_Tirana_(1).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.327703,
     "lon": 19.819683
    },
    "area": "skanderbeg"
   },
   {
    "id": "bunkart2",
    "name": "バンクアート2",
    "local": {
     "text": "Bunk'Art 2",
     "lang": "sq",
     "roman": "Bunk'Art 2"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/albania/tirana/photos/tirane-albania-january-2023-bunk-edbab28a-960.webp",
     "small": "/guide/albania/tirana/photos/tirane-albania-january-2023-bunk-edbab28a-500.webp",
     "w": 960,
     "h": 720,
     "alt": "バンクアート2の地下の展示室",
     "kind": "photo",
     "credit": {
      "by": "Sharon Hahn Darlin",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tiran%C3%AB,_Albania_January_2023_-_BUNK%27ART_2_museum_07.jpg"
     }
    },
    "body": "旧内務省の下の、共産主義の時代のトーチカと地下道を使った博物館。20世紀のアルバニアの警察と秘密警察の役目を見せる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bunk%27Art+2+Tiran%C3%AB&hl=ja",
    "todo": [
     "bunkart"
    ],
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tiran%C3%AB,_Albania_January_2023_-_BUNK%27ART_2_museum_07.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.327022,
     "lon": 19.819551
    },
    "area": "skanderbeg"
   },
   {
    "id": "bunkart1",
    "name": "バンクアート1",
    "local": {
     "text": "Bunk'Art 1",
     "lang": "sq",
     "roman": "Bunk'Art 1"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/bunkart-horse-gas-mask-185fc23b-960.webp",
     "small": "/guide/albania/tirana/photos/bunkart-horse-gas-mask-185fc23b-500.webp",
     "w": 960,
     "h": 716,
     "alt": "バンクアート1の展示。第一次世界大戦の馬のガスマスク",
     "kind": "photo",
     "credit": {
      "by": "Bjørn Christian Tørrissen",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:BunkArt-Horse-Gas-Mask.jpg"
     }
    },
    "body": "街の外れの、冷戦の時代の大きな核シェルターを歴史と現代美術の博物館にしたもの。1970年代に国の指導者たちのために造られ、地下の何階にもわたって約3,000平方メートルある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bunk%27Art+1+Tiran%C3%AB&hl=ja",
    "todo": [
     "bunkart"
    ],
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:BunkArt-Horse-Gas-Mask.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.35314,
     "lon": 19.861207
    },
    "line": "中心から4.5km"
   },
   {
    "id": "pyramid",
    "name": "ティラナのピラミッド",
    "local": {
     "text": "Piramida e Tiranës",
     "lang": "sq",
     "roman": "Piramida e Tiranes"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/albania/tirana/photos/the-pyramid-of-tirana-albania-c33ac594-960.webp",
     "small": "/guide/albania/tirana/photos/the-pyramid-of-tirana-albania-c33ac594-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "階段のついた白いティラナのピラミッド",
     "kind": "photo",
     "credit": {
      "by": "Marina Lamaj",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:The_Pyramid_of_Tirana,_Albania.jpg"
     }
    },
    "body": "1988年にエンヴェル・ホッジャの記念館として開いた建物。1991年からは会議場、1999年のコソボ紛争ではNATOの拠点になった。オランダの設計事務所MVRDVが直し、2023年に若者のITの学びの場として開いた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Piramida+e+Tiran%C3%ABs+Tiran%C3%AB&hl=ja",
    "todo": [
     "pyramid"
    ],
    "src": [
     {
      "name": "Wikipedia「Pyramid of Tirana」",
      "url": "https://en.wikipedia.org/wiki/Pyramid_of_Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:The_Pyramid_of_Tirana,_Albania.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.323019,
     "lon": 19.821589
    },
    "area": "blloku"
   },
   {
    "id": "leaves",
    "name": "葉の館（秘密警察の博物館）",
    "local": {
     "text": "Shtëpia me Gjethe",
     "lang": "sq",
     "roman": "Shtepia me Gjethe"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/muzeu-kombetar-i-pergjimeve-shte-55d52a47-960.webp",
     "small": "/guide/albania/tirana/photos/muzeu-kombetar-i-pergjimeve-shte-55d52a47-500.webp",
     "w": 960,
     "h": 640,
     "alt": "つたの葉に覆われた葉の館の建物",
     "kind": "photo",
     "credit": {
      "by": "Bes-ART",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Muzeu_Komb%C3%ABtar_i_P%C3%ABrgjimeve,_%E2%80%9CSht%C3%ABpia_me_Gjethe%E2%80%9D.jpg"
     }
    },
    "body": "共産主義の時代に秘密警察シグリミの本部だった建物で、2017年5月23日に博物館として開いた。見張られ、捕らえられ、罰せられた人たちにささげた博物館。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sht%C3%ABpia+me+Gjethe+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Museum of Secret Surveillance」",
      "url": "https://en.wikipedia.org/wiki/Museum_of_Secret_Surveillance",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Muzeu_Komb%C3%ABtar_i_P%C3%ABrgjimeve,_%E2%80%9CSht%C3%ABpia_me_Gjethe%E2%80%9D.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.326467,
     "lon": 19.816327
    },
    "area": "skanderbeg"
   },
   {
    "id": "cathedral",
    "name": "キリスト復活大聖堂",
    "local": {
     "text": "Katedralja Ngjallja e Krishtit",
     "lang": "sq",
     "roman": "Katedralja Ngjallja e Krishtit"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/resurrection-of-christ-orthodox-5faf9e46-960.webp",
     "small": "/guide/albania/tirana/photos/resurrection-of-christ-orthodox-5faf9e46-500.webp",
     "w": 960,
     "h": 640,
     "alt": "丸屋根と鐘楼のキリスト復活大聖堂",
     "kind": "photo",
     "credit": {
      "by": "Andrew Milligan sumo",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Resurrection_of_Christ_Orthodox_Cathedral_of_Tirana,_Albania_(49601709231).jpg"
     }
    },
    "body": "アルバニア正教会の大聖堂で、バルカンの正教会の教会でも大きな1つとされる。2012年6月24日に開いた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Katedralja+Ngjallja+e+Krishtit+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Resurrection Cathedral, Tirana」",
      "url": "https://en.wikipedia.org/wiki/Resurrection_Cathedral,_Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Resurrection_of_Christ_Orthodox_Cathedral_of_Tirana,_Albania_(49601709231).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.326495,
     "lon": 19.817412
    },
    "area": "skanderbeg"
   },
   {
    "id": "namazgah",
    "name": "ナマズガー・モスク（ティラナの大モスク）",
    "local": {
     "text": "Xhamia e Namazgjasë",
     "lang": "sq",
     "roman": "Xhamia e Namazgjase"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/tirana-xhamia-e-namazgjase-2024-e84830ad-960.webp",
     "small": "/guide/albania/tirana/photos/tirana-xhamia-e-namazgjase-2024-e84830ad-500.webp",
     "w": 960,
     "h": 1344,
     "alt": "4本のミナレットが立つナマズガー・モスク",
     "kind": "photo",
     "credit": {
      "by": "Steffen Schmitz ( more photos )",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tirana,_Xhamia_e_Namazgjas%C3%AB,_2024-10_CN-01.jpg"
     }
    },
    "body": "1万人が祈れる、バルカンでいちばん大きいモスク。2015年に建て始め、2024年10月10日に開いた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Xhamia+e+Namazgjas%C3%AB+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Namazgah Mosque」",
      "url": "https://en.wikipedia.org/wiki/Namazgah_Mosque",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tirana,_Xhamia_e_Namazgjas%C3%AB,_2024-10_CN-01.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.325722,
     "lon": 19.824243
    },
    "area": "skanderbeg"
   },
   {
    "id": "blloku",
    "name": "ブロック",
    "local": {
     "text": "Blloku",
     "lang": "sq",
     "roman": "Blloku"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/ish-blloku-neighborhood-in-tiran-fb6db407-960.webp",
     "small": "/guide/albania/tirana/photos/ish-blloku-neighborhood-in-tiran-fb6db407-500.webp",
     "w": 960,
     "h": 718,
     "alt": "ブロックの通り。並木と建物のあいだのカフェ",
     "kind": "photo",
     "credit": {
      "by": "Leeturtle",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ish-Blloku_neighborhood_in_Tirana,_Albania.jpg"
     }
    },
    "body": "共産主義の時代は政治局の人たちだけが住み、ふつうの人は入れなかった一帯。いまはブティックやレストラン、バー、カフェが並ぶ。エンヴェル・ホッジャの家もここに残る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Blloku+Tiran%C3%AB&hl=ja",
    "todo": [
     "cafe"
    ],
    "src": [
     {
      "name": "Wikipedia「Ish-Blloku」",
      "url": "https://en.wikipedia.org/wiki/Ish-Blloku",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Ish-Blloku_neighborhood_in_Tirana,_Albania.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.321333,
     "lon": 19.816066
    },
    "area": "blloku"
   },
   {
    "id": "lake",
    "name": "グランドパーク（人造湖の公園）",
    "local": {
     "text": "Parku i Madh",
     "lang": "sq",
     "roman": "Parku i Madh"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/artificial-lake-tirana-park-alba-99a73f43-960.webp",
     "small": "/guide/albania/tirana/photos/artificial-lake-tirana-park-alba-99a73f43-500.webp",
     "w": 960,
     "h": 1707,
     "alt": "グランドパークの人造湖と、まわりの木",
     "kind": "photo",
     "credit": {
      "by": "DenisaRucaj",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Artificial_Lake,_Tirana_Park,_Albania.jpg"
     }
    },
    "body": "街の南の、人造湖を囲む289ヘクタールの公園。聖プロコピウス教会や大統領の館もある。朝の散歩や走る人が多い。南の端に動物園と植物園。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Parku+i+Madh+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Grand Park of Tirana」",
      "url": "https://en.wikipedia.org/wiki/Grand_Park_of_Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Artificial_Lake,_Tirana_Park,_Albania.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.311489,
     "lon": 19.829455
    }
   },
   {
    "id": "dajti",
    "name": "ダイティ山とロープウェイ（ダイティ・エクスプレス）",
    "local": {
     "text": "Dajti Ekspres",
     "lang": "sq",
     "roman": "Dajti Ekspres"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/albania/tirana/photos/dajti-ekspres-by-roy-lindman-1dfa258e-960.webp",
     "small": "/guide/albania/tirana/photos/dajti-ekspres-by-roy-lindman-1dfa258e-500.webp",
     "w": 960,
     "h": 640,
     "alt": "森の上を行くダイティ・エクスプレスのゴンドラ",
     "kind": "photo",
     "credit": {
      "by": "Roy r lindman",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Dajti_Ekspres_by_Roy_Lindman.jpg"
     }
    },
    "body": "街の東の山へ上るロープウェイ。上の駅まで約15分。山の上にはレストランやミニゴルフ、アドベンチャーパークがある。",
    "facts": [
     {
      "label": "休み",
      "text": "火曜日が休み（祝日なら動く）"
     },
     {
      "label": "行きかた",
      "text": "時計塔から青いポルチェラン行きのバスで終点へ。坂を少し上ると乗り場"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dajti+Ekspres+Tiran%C3%AB&hl=ja",
    "todo": [
     "dajti"
    ],
    "src": [
     {
      "name": "Dajti Ekspres「FAQ」",
      "url": "https://dajtiekspres.com/faq/",
      "seen": "2026-11-23"
     },
     {
      "name": "Dajti Ekspres「Tickets & Opening Times」",
      "url": "https://dajtiekspres.com/rates-and-opening-hours/",
      "seen": "2026-11-23"
     },
     {
      "name": "Dajti Ekspres「Getting here」",
      "url": "https://dajtiekspres.com/getting-here/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Dajti_Ekspres_by_Roy_Lindman.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.350831,
     "lon": 19.861161
    },
    "line": "中心から4.4km"
   },
   {
    "id": "pazari",
    "name": "パザリ・イ・リ（新しいバザール）",
    "local": {
     "text": "Pazari i Ri",
     "lang": "sq",
     "roman": "Pazari i Ri"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/new-bazaar-pazari-i-ri-tirana-al-51a032e8-960.webp",
     "small": "/guide/albania/tirana/photos/new-bazaar-pazari-i-ri-tirana-al-51a032e8-500.webp",
     "w": 960,
     "h": 720,
     "alt": "パザリ・イ・リの市場。屋根の下に並ぶ店",
     "kind": "photo",
     "credit": {
      "by": "Ridiculopathy",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:New_Bazaar_(Pazari_i_Ri),_Tirana,_Albania.jpg"
     }
    },
    "body": "中心の大通りの東の市場の一帯。1931年に古いバザールの跡に作られ、2017年にすっかり作り直された。古いココノジ・モスクがある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pazari+i+Ri+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「New Bazaar, Tirana」",
      "url": "https://en.wikipedia.org/wiki/New_Bazaar,_Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:New_Bazaar_(Pazari_i_Ri),_Tirana,_Albania.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.330246,
     "lon": 19.82435
    },
    "area": "pazari"
   },
   {
    "id": "tanners",
    "name": "なめし革職人の橋",
    "local": {
     "text": "Ura e Tabakëve",
     "lang": "sq",
     "roman": "Ura e Tabakeve"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/tanners-bridge-tirana-albania-01-3737df94-960.webp",
     "small": "/guide/albania/tirana/photos/tanners-bridge-tirana-albania-01-3737df94-500.webp",
     "w": 960,
     "h": 1450,
     "alt": "石のアーチのなめし革職人の橋",
     "kind": "photo",
     "credit": {
      "by": "Pasztilla aka Attila Terbócs",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tanners%27_Bridge,_Tirana,_Albania_01.jpg"
     }
    },
    "body": "18世紀のオスマン帝国の時代の石の歩道橋。東の山あいから家畜と作物を運ぶ道の一部で、肉屋となめし革職人の店のそばで川を渡っていた。1990年代に歩道橋として直した。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ura+e+Tabak%C3%ABve+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Tanners' Bridge」",
      "url": "https://en.wikipedia.org/wiki/Tanners%27_Bridge",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tanners%27_Bridge,_Tirana,_Albania_01.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.326424,
     "lon": 19.82605
    },
    "area": "skanderbeg"
   },
   {
    "id": "postbllok",
    "name": "ポストブロック（共産主義の記念碑）",
    "local": {
     "text": "Postbllok",
     "lang": "sq",
     "roman": "Postbllok"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/postbllok-memorial-bunker-6744d027-960.webp",
     "small": "/guide/albania/tirana/photos/postbllok-memorial-bunker-6744d027-500.webp",
     "w": 960,
     "h": 685,
     "alt": "ポストブロックに置かれたコンクリートのトーチカ",
     "kind": "photo",
     "credit": {
      "by": "Ivan Ruggiero I'd appreciate if you could mail me (ivanrugg+credit@gmail.com) if you want to use this picture out of the Wikimedia project scope. Please attribute as: Ivan Ruggiero (Wikimedia)",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Postbllok_Memorial_Bunker.jpg"
     }
    },
    "body": "ブロックの入口の角にある、共産主義の時代を思い出すための記念碑。トーチカとベルリンの壁のかけら、スパチ政治犯収容所の柱を置く。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Postbllok+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap「Bunkeri i Memorialit \"Postbllok\"」",
      "url": "https://www.openstreetmap.org/node/5179401322",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Postbllok_Memorial_Bunker.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.320962,
     "lon": 19.820149
    },
    "area": "blloku"
   },
   {
    "id": "mosaic",
    "name": "ティラナのモザイク",
    "local": {
     "text": "Mozaiku i Tiranës",
     "lang": "sq",
     "roman": "Mozaiku i Tiranes"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/tirana-mosaic-new-exhibition-202-31d3abf7-960.webp",
     "small": "/guide/albania/tirana/photos/tirana-mosaic-new-exhibition-202-31d3abf7-500.webp",
     "w": 960,
     "h": 720,
     "alt": "ガラスの屋根の下に見せている、ティラナのモザイクの床",
     "kind": "photo",
     "credit": {
      "by": "Sapfan",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Tirana_mosaic_new_exhibition_2025.jpg"
     }
    },
    "body": "3世紀のローマの家の跡とされ、5〜6世紀にまわりに教会が建った。鳥や魚の模様の床のモザイクが残る。市内で唯一の遺跡。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mozaiku+i+Tiran%C3%ABs+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Tirana Mosaic」",
      "url": "https://en.wikipedia.org/wiki/Tirana_Mosaic",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tirana_mosaic_new_exhibition_2025.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.330064,
     "lon": 19.804249
    }
   },
   {
    "id": "teresa",
    "name": "マザー・テレサ広場",
    "local": {
     "text": "Sheshi Nënë Tereza",
     "lang": "sq",
     "roman": "Sheshi Nene Tereza"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/tirana-university-and-mother-ter-fc088c1d-960.webp",
     "small": "/guide/albania/tirana/photos/tirana-university-and-mother-ter-fc088c1d-500.webp",
     "w": 960,
     "h": 710,
     "alt": "ティラナ大学の建物と、前に広がるマザー・テレサ広場",
     "kind": "photo",
     "credit": {
      "by": "Leeturtle",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tirana_University_and_Mother_Teresa_Square.jpg"
     }
    },
    "body": "大通りの南の端の広場。ティラナ大学・考古学研究所・芸術大学・国立競技場の建物が囲む。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sheshi+N%C3%ABn%C3%AB+Tereza+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tirana_University_and_Mother_Teresa_Square.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.31788,
     "lon": 19.821294
    },
    "area": "blloku"
   },
   {
    "id": "motheralbania",
    "name": "母なるアルバニア像（国の殉教者墓地）",
    "local": {
     "text": "Nëna Shqipëri",
     "lang": "sq",
     "roman": "Nena Shqiperi"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/tirana-mother-albania-1-3b79f61d-960.webp",
     "small": "/guide/albania/tirana/photos/tirana-mother-albania-1-3b79f61d-500.webp",
     "w": 960,
     "h": 640,
     "alt": "墓地の丘に立つ母なるアルバニア像",
     "kind": "photo",
     "credit": {
      "by": "Julian Nyča",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tirana_%E2%80%93_Mother_Albania_1.jpg"
     }
    },
    "body": "第二次世界大戦でティラナのために戦った900人のパルチザンが眠る墓地。1972年にできた高さ12メートルの母なるアルバニア像が立つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=N%C3%ABna+Shqip%C3%ABri+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tirana_%E2%80%93_Mother_Albania_1.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.30854,
     "lon": 19.840069
    },
    "line": "中心から2.8km"
   },
   {
    "id": "petrela",
    "name": "ペトレラ城",
    "local": {
     "text": "Kalaja e Petrelës",
     "lang": "sq",
     "roman": "Kalaja e Petreles"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/view-of-petrela-castle-albania-ec53c12b-960.webp",
     "small": "/guide/albania/tirana/photos/view-of-petrela-castle-albania-ec53c12b-500.webp",
     "w": 960,
     "h": 718,
     "alt": "丘の上のペトレラ城の石の塔",
     "kind": "photo",
     "credit": {
      "by": "Leeturtle",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:View_of_Petrela_Castle,_Albania.jpg"
     }
    },
    "body": "ティラナの南の岩山に立つ城。6世紀に東ローマのユスティニアヌス1世が建てたのが始まりで、いまの建物は15世紀。スカンデルベグの時代はその妹ママイツァが守った。城の中にレストランがある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kalaja+e+Petrel%C3%ABs+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Petrelë Castle」",
      "url": "https://en.wikipedia.org/wiki/Petrel%C3%AB_Castle",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:View_of_Petrela_Castle,_Albania.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.254849,
     "lon": 19.854581
    },
    "line": "中心から8.7km"
   },
   {
    "id": "kruja",
    "name": "クルヤ城",
    "local": {
     "text": "Kalaja e Krujës",
     "lang": "sq",
     "roman": "Kalaja e Krujes"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/kruje-castle-64e04e62-960.webp",
     "small": "/guide/albania/tirana/photos/kruje-castle-64e04e62-500.webp",
     "w": 960,
     "h": 720,
     "alt": "山の斜面に立つクルヤ城の石の塔",
     "kind": "photo",
     "credit": {
      "by": "QaifarShqiptari",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Kruj%C3%AB_Castle.jpg"
     }
    },
    "body": "スカンデルベグがオスマン帝国に立ち向かった拠点の城。中にベクタシュ派の修道場、スカンデルベグ博物館、モスクの跡と塔、民族学博物館、ハマム（浴場）がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kalaja+e+Kruj%C3%ABs&hl=ja",
    "todo": [
     "kruja"
    ],
    "src": [
     {
      "name": "Wikipedia「Fortress of Krujë」",
      "url": "https://en.wikipedia.org/wiki/Fortress_of_Kruj%C3%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Kruj%C3%AB_Castle.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.506891,
     "lon": 19.793933
    },
    "line": "中心から20km"
   },
   {
    "id": "skmuseum",
    "name": "スカンデルベグ博物館",
    "local": {
     "text": "Muzeu Kombëtar Gjergj Kastrioti Skënderbeu",
     "lang": "sq",
     "roman": "Muzeu Kombetar Gjergj Kastrioti Skenderbeu"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/skanderbeg-museum-kruje-panorami-9b1663f7-960.webp",
     "small": "/guide/albania/tirana/photos/skanderbeg-museum-kruje-panorami-9b1663f7-500.webp",
     "w": 960,
     "h": 642,
     "alt": "石の壁と塔の形のスカンデルベグ博物館",
     "kind": "photo",
     "credit": {
      "by": "Colin W",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Skanderbeg_Museum,_Kruje_-_panoramio.jpg"
     }
    },
    "body": "クルヤ城の中の、国の英雄スカンデルベグの博物館。1982年11月1日に開いた。昔の石の塔の家にならった形で、設計の1人はエンヴェル・ホッジャの娘プランヴェラ。",
    "facts": [
     {
      "label": "入場料",
      "text": "500レク"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeu+Sk%C3%ABnderbeu+Kruj%C3%AB&hl=ja",
    "todo": [
     "kruja"
    ],
    "src": [
     {
      "name": "Wikipedia「Skanderbeg Museum」",
      "url": "https://en.wikipedia.org/wiki/Skanderbeg_Museum",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Skanderbeg_Museum,_Kruje_-_panoramio.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.507457,
     "lon": 19.794066
    },
    "line": "中心から20km"
   },
   {
    "id": "krujabazaar",
    "name": "クルヤの古いバザール",
    "local": {
     "text": "Pazari i Vjetër",
     "lang": "sq",
     "roman": "Pazari i Vjeter"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/souvenire-shop-old-bazar-kruja-a-d0deeaf5-960.webp",
     "small": "/guide/albania/tirana/photos/souvenire-shop-old-bazar-kruja-a-d0deeaf5-500.webp",
     "w": 960,
     "h": 1286,
     "alt": "クルヤの古いバザールの、みやげの並ぶ木の店",
     "kind": "photo",
     "credit": {
      "by": "Klejdi Shtrepi",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Souvenire_Shop_-_Old_Bazar,_Kruja,_Albania.jpg"
     }
    },
    "body": "17世紀からの古いバザールで、地元ではデレジクと呼ぶ。市役所のそばから城の門まで、かつては200ほどの店が並んだ。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "毎日7時〜23時"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Pazari+i+Kruj%C3%ABs&hl=ja",
    "todo": [
     "kruja"
    ],
    "src": [
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Souvenire_Shop_-_Old_Bazar,_Kruja,_Albania.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.509793,
     "lon": 19.794221
    },
    "line": "中心から20km"
   },
   {
    "id": "berat",
    "name": "ベラト（千の窓の町）",
    "local": {
     "text": "Berat",
     "lang": "sq",
     "roman": "Berat"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/albania/tirana/photos/berat-mangalem-1a-5d80eeb4-960.webp",
     "small": "/guide/albania/tirana/photos/berat-mangalem-1a-5d80eeb4-500.webp",
     "w": 960,
     "h": 720,
     "alt": "斜面に重なる白い家と窓のマンガレム地区",
     "kind": "photo",
     "credit": {
      "by": "Wolfgang Sauber",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Berat_-_Mangalem_1a.jpg"
     }
    },
    "body": "白い壁にたくさんの窓が並ぶ家々から「千の窓の町」と呼ばれる。オスマン帝国と東ローマの建物が残り、2008年にユネスコの世界遺産になった。ティラナの南70km。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mangalem+Berat&hl=ja",
    "todo": [
     "berat"
    ],
    "src": [
     {
      "name": "Wikivoyage「Berat」",
      "url": "https://en.wikivoyage.org/wiki/Berat",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Berat」",
      "url": "https://en.wikipedia.org/wiki/Berat",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Berat_-_Mangalem_1a.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.705387,
     "lon": 19.949939
    },
    "line": "中心から70km"
   },
   {
    "id": "durres",
    "name": "ドゥラスの円形劇場",
    "local": {
     "text": "Amfiteatri i Durrësit",
     "lang": "sq",
     "roman": "Amfiteatri i Durresit"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/albania/tirana/photos/amphitheatre-of-durres-by-pudele-72cf15a4-960.webp",
     "small": "/guide/albania/tirana/photos/amphitheatre-of-durres-by-pudele-72cf15a4-500.webp",
     "w": 960,
     "h": 601,
     "alt": "ドゥラスの円形劇場の石のアーチと客席の跡",
     "kind": "photo",
     "credit": {
      "by": "Pudelek",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Amphitheatre_of_Durr%C3%ABs_(by_Pudelek).JPG"
     }
    },
    "body": "2世紀にトラヤヌス帝の時代に建て始めたローマの円形劇場。バルカン半島でいちばん大きく、2万人が入れた。1966年の終わりに見つかった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Amfiteatri+i+Durr%C3%ABsit&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Amphitheatre of Durrës」",
      "url": "https://en.wikipedia.org/wiki/Amphitheatre_of_Durr%C3%ABs",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Amphitheatre_of_Durr%C3%ABs_(by_Pudelek).JPG",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 41.312123,
     "lon": 19.445002
    },
    "line": "中心から31km"
   }
  ],
  "far": [
   {
    "id": "bunkart1",
    "name": "バンクアート1",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Bunk%27Art+1+Tiran%C3%AB&hl=ja",
    "km": 4.5
   },
   {
    "id": "dajti",
    "name": "ダイティ山とロープウェイ",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Dajti+Ekspres+Tiran%C3%AB&hl=ja",
    "km": 4.4
   },
   {
    "id": "motheralbania",
    "name": "母なるアルバニア像",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=N%C3%ABna+Shqip%C3%ABri+Tiran%C3%AB&hl=ja",
    "km": 2.8
   },
   {
    "id": "petrela",
    "name": "ペトレラ城",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kalaja+e+Petrel%C3%ABs+Tiran%C3%AB&hl=ja",
    "km": 8.7
   },
   {
    "id": "kruja",
    "name": "クルヤ城",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kalaja+e+Kruj%C3%ABs&hl=ja",
    "km": 20
   },
   {
    "id": "skmuseum",
    "name": "スカンデルベグ博物館",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Muzeu+Sk%C3%ABnderbeu+Kruj%C3%AB&hl=ja",
    "km": 20
   },
   {
    "id": "krujabazaar",
    "name": "クルヤの古いバザール",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Pazari+i+Kruj%C3%ABs&hl=ja",
    "km": 20
   },
   {
    "id": "berat",
    "name": "ベラト",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mangalem+Berat&hl=ja",
    "km": 70
   },
   {
    "id": "durres",
    "name": "ドゥラスの円形劇場",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Amfiteatri+i+Durr%C3%ABsit&hl=ja",
    "km": 31
   }
  ],
  "map": {
   "mid": "1L9thsYMaBokQ_vBAivcPD35ZAAee5tA",
   "title": "ティラナ｜見たいもの",
   "ll": "41.3209,19.8169",
   "z": 13,
   "pins": 24
  }
 },
 "eat": {
  "kinds": [
   {
    "id": "local",
    "label": "アルバニアの料理"
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
    "id": "fergese",
    "name": "フェルゲセ（ピーマンとチーズの焼きもの）",
    "local": {
     "text": "Fërgesë",
     "lang": "sq",
     "roman": "Fërgesë"
    },
    "body": "焼いたチーズ・野菜・卵の料理で、ティラナ生まれ。ピーマン・トマト・玉ねぎと塩気のある凝乳のチーズを煮てから焼く。",
    "facts": [
     {
      "label": "どこで",
      "text": "テク・ズガラ・エ・ティロネス 2（炭火焼きと郷土料理）・ティミ・キング・ピルス（郷土料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=F%C3%ABrges%C3%AB+Tirana&hl=ja",
    "places": [
     "zgara",
     "tymi"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Fërgesë」",
      "url": "https://en.wikipedia.org/wiki/F%C3%ABrges%C3%AB",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "tave-dheu",
    "name": "タヴェ・ゼウ（レバー入りのフェルゲセ）",
    "local": {
     "text": "Tavë dheu",
     "lang": "sq",
     "roman": "Tavë dheu"
    },
    "body": "フェルゲセにレバーを足したもの。フェルゲセ・メ・メルチとも呼ぶ。",
    "facts": [
     {
      "label": "どこで",
      "text": "テク・ズガラ・エ・ティロネス 2（炭火焼きと郷土料理）・ティミ・キング・ピルス（郷土料理）"
     },
     {
      "label": "豚肉",
      "text": "足すレバーが何の肉のものかは、品書きに書かれていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tav%C3%AB+dheu+Tirana&hl=ja",
    "places": [
     "zgara",
     "tymi"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Zgara e Tirones」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/zgara-e-tirones",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Tymi King Pils」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/restorant-tymi",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "tave-kosi",
    "name": "タヴェ・コシ（羊肉のヨーグルト焼き）",
    "local": {
     "text": "Tavë kosi",
     "lang": "sq",
     "roman": "Tavë kosi"
    },
    "body": "羊肉と米に、ヨーグルト・卵・バター・小麦粉を合わせてかけ、窯で焼く。エルバサン生まれとされ、国の料理の1つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tav%C3%AB+kosi+Tirana&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Tavë kosi」",
      "url": "https://en.wikipedia.org/wiki/Tav%C3%AB_kosi",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "tasqebap",
    "name": "タスケバプ（羊肉の煮込み）",
    "local": {
     "text": "Tasqebap",
     "lang": "sq",
     "roman": "Tasqebap"
    },
    "body": "羊肉とトマトと玉ねぎの煮込み。夕食にはこうした煮込みがよく付く。",
    "facts": [
     {
      "label": "どこで",
      "text": "クイック・バイト（食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tasqebap+Tirana&hl=ja",
    "places": [
     "quickbite"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "qofte",
    "name": "コフテ（肉団子）",
    "local": {
     "text": "Qofte",
     "lang": "sq",
     "roman": "Qofte"
    },
    "body": "ひき肉と香草とスパイスの肉団子。サラダやパン、ご飯を添えて昼か夜に食べる。「家の（シュテピエ）」と書いた作りもある。",
    "facts": [
     {
      "label": "どこで",
      "text": "クイック・バイト（食堂）・ティミ・キング・ピルス（郷土料理）"
     },
     {
      "label": "豚肉",
      "text": "ひき肉の種類は品書きで違う。ティミ・キング・ピルスの品書きには、パンチェッタを合わせた鶏のコフテもある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Qofte+Tirana&hl=ja",
    "places": [
     "quickbite",
     "tymi"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Tymi King Pils」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/restorant-tymi",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "speca",
    "name": "スペツァ・テ・ムブシュラ（詰め物のピーマン）",
    "local": {
     "text": "Speca të mbushura",
     "lang": "sq",
     "roman": "Speca të mbushura"
    },
    "body": "ピーマンにチーズを詰めて焼く。",
    "facts": [
     {
      "label": "どこで",
      "text": "テク・ズガラ・エ・ティロネス 2（炭火焼きと郷土料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Speca+t%C3%AB+mbushura+Tirana&hl=ja",
    "places": [
     "zgara"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "japrak",
    "name": "ヤプラク（ぶどうの葉の包み）",
    "local": {
     "text": "Japrak",
     "lang": "sq",
     "roman": "Japrak"
    },
    "body": "ぶどうの葉で、ひき肉と米と香草を包んで煮る。羊肉を入れない作りもある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Japrak+Tirana&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "flija",
    "name": "フリア（重ねたクレープ）",
    "local": {
     "text": "Flija",
     "lang": "sq",
     "roman": "Flija"
    },
    "body": "クレープのような生地を何層も重ね、クリームを塗りながら焼く。北の地方とコソボの料理で、太陽の形に焼く。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Flija+Tirana&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Flia」",
      "url": "https://en.wikipedia.org/wiki/Flia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "djathe",
    "name": "ジャテ・イ・バルデ（白いチーズ）",
    "local": {
     "text": "Djathë i bardhë",
     "lang": "sq",
     "roman": "Djathë i bardhë"
    },
    "body": "白くてやわらかい、フェタに似た若いチーズ。焼いても出す。",
    "facts": [
     {
      "label": "どこで",
      "text": "ティミ・キング・ピルス（郷土料理）・テク・ズガラ・エ・ティロネス 2（炭火焼きと郷土料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Djath%C3%AB+i+bardh%C3%AB+Tirana&hl=ja",
    "places": [
     "tymi",
     "zgara"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "byrek",
    "name": "ビュレク（薄い生地のパイ）",
    "local": {
     "text": "Byrek",
     "lang": "sq",
     "roman": "Byrek"
    },
    "body": "手でのばした薄い生地を重ねて焼くパイ。ティラナのあたりは肉・ほうれん草・チーズの詰め物が多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "ミスター・チキン（ブロックのファストフード）"
     },
     {
      "label": "豚肉",
      "text": "詰め物は、チーズ・ひき肉と玉ねぎ・ほうれん草と卵など、作りで違う。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Byrek+Tirana&hl=ja",
    "places": [
     "mrchicken"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Börek」",
      "url": "https://en.wikipedia.org/wiki/B%C3%B6rek",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "sufllaqe",
    "name": "スフラチェ（ピタパンの包み）",
    "local": {
     "text": "Sufllaqe",
     "lang": "sq",
     "roman": "Sufllaqe"
    },
    "body": "街の小さな店や屋台で、ドネルやジロと並んで売っている包みもの。",
    "facts": [
     {
      "label": "どこで",
      "text": "ミスター・チキン（ブロックのファストフード）"
     },
     {
      "label": "豚肉",
      "text": "肉の種類を書かない品書きがある。ミスター・チキンの品書きには鶏肉のジロ（ジロ・プレ）がある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sufllaqe+Tirana&hl=ja",
    "places": [
     "mrchicken"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Mr. Chicken」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/mr-chicken01",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "petulla",
    "name": "ペトゥラ（揚げパン）",
    "local": {
     "text": "Petulla",
     "lang": "sq",
     "roman": "Petulla"
    },
    "body": "小麦粉かそば粉の生地を揚げたもの。いちじくのジャムや蜂蜜、フェタを付けて、家の朝ごはんに食べる。",
    "facts": [
     {
      "label": "どこで",
      "text": "ムリリ・イ・ヴィエテル（コーヒーの店）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Petulla+Tirana&hl=ja",
    "places": [
     "mulliri"
    ],
    "kinds": [
     "quick",
     "sweets"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "bakllava",
    "name": "バクラヴァ（ナッツの層の菓子）",
    "local": {
     "text": "Bakllava",
     "lang": "sq",
     "roman": "Bakllava"
    },
    "body": "人気の菓子で、大みそかには必ず作る。",
    "facts": [
     {
      "label": "どこで",
      "text": "ソメグ ドン・ボスコ通り店（菓子とパン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bakllava+Tirana&hl=ja",
    "places": [
     "someg"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Baklava」",
      "url": "https://en.wikipedia.org/wiki/Baklava",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kadaif",
    "name": "カダイフ（細い麺の菓子）",
    "local": {
     "text": "Kadaif",
     "lang": "sq",
     "roman": "Kadaif"
    },
    "body": "細い麺のような生地にくるみかピスタチオを包み、シロップで甘くする。バクラヴァと並べて出すこともある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ソメグ ドン・ボスコ通り店（菓子とパン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kadaif+Tirana&hl=ja",
    "places": [
     "someg"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "trilece",
    "name": "トリレチェ（3種のミルクのケーキ）",
    "local": {
     "text": "Trileçe",
     "lang": "sq",
     "roman": "Trileçe"
    },
    "body": "軽いスポンジに3種類のミルクをしみこませたケーキ。上にキャラメルをのせることが多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "アルティスティ（ピザとカフェ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Trile%C3%A7e+Tirana&hl=ja",
    "places": [
     "artisti"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Trileçe」",
      "url": "https://en.wikipedia.org/wiki/Trile%C3%A7e",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kabuni",
    "name": "カブニ（甘い米の菓子）",
    "local": {
     "text": "Kabuni",
     "lang": "sq",
     "roman": "Kabuni"
    },
    "body": "米を揚げて、干しぶどう・クローブ・シナモンで甘くした菓子。冷やして出す。",
    "facts": [
     {
      "label": "どこで",
      "text": "パノラマ（クルヤ城のそばのレストラン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kabuni+Tirana&hl=ja",
    "places": [
     "panorama"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "ballokume",
    "name": "バロクメ（エルバサンのクッキー）",
    "local": {
     "text": "Ballokume",
     "lang": "sq",
     "roman": "Ballokume"
    },
    "body": "中世のエルバサンで生まれたクッキー。毎年3月の祝日「夏の日」に作る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ballokume+Tirana&hl=ja",
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kafe",
    "name": "アルバニアのコーヒー（エスプレッソ・マキアート）",
    "local": {
     "text": "Kafe",
     "lang": "sq",
     "roman": "Kafe"
    },
    "body": "エスプレッソ・カプチーノ・マキアートのほか、トルココーヒーもよく飲む。2016年に人口あたりのカフェの数が世界一になった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kafe+Tirana&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "caj-mali",
    "name": "チャイ・マリ（山のお茶）",
    "local": {
     "text": "Çaj mali",
     "lang": "sq",
     "roman": "Çaj mali"
    },
    "body": "山に生えるシデリティスの花と茎のお茶。蜂蜜とレモンを入れて飲むことが多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C3%87aj+mali+Tirana&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "dhalle",
    "name": "ザッレ（ヨーグルトの飲み物）",
    "local": {
     "text": "Dhallë",
     "lang": "sq",
     "roman": "Dhallë"
    },
    "body": "ヨーグルトを水か牛乳でのばした飲み物。夏によく飲み、塩を入れることもある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dhall%C3%AB+Tirana&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "boza",
    "name": "ボザ（とうもろこしの甘い飲み物）",
    "local": {
     "text": "Boza",
     "lang": "sq",
     "roman": "Boza"
    },
    "body": "とうもろこしと小麦の、甘い麦芽の飲み物。お菓子と一緒によく飲む。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Boza+Tirana&hl=ja",
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "raki",
    "name": "ラキ（果実の蒸留酒）",
    "local": {
     "text": "Raki",
     "lang": "sq",
     "roman": "Raki"
    },
    "body": "アルバニアでいちばん飲まれる蒸留酒。ぶどう・すもも・ブラックベリーのものが多い。町や家で作る。",
    "facts": [
     {
      "label": "どこで",
      "text": "パノラマ（クルヤ城のそばのレストラン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Raki+Tirana&hl=ja",
    "places": [
     "panorama"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "birra",
    "name": "コルチャのビール",
    "local": {
     "text": "Birra Korça",
     "lang": "sq",
     "roman": "Birra Korça"
    },
    "body": "1928年に南東の町コルチャで始まったビールの会社。国で3番目に大きい。",
    "facts": [
     {
      "label": "どこで",
      "text": "テク・ズガラ・エ・ティロネス 2（炭火焼きと郷土料理）・ティミ・キング・ピルス（郷土料理）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Birra+Kor%C3%A7a+Tirana&hl=ja",
    "places": [
     "zgara",
     "tymi"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Birra Korça」",
      "url": "https://en.wikipedia.org/wiki/Birra_Kor%C3%A7a",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "vere",
    "name": "アルバニアワイン",
    "local": {
     "text": "Verë",
     "lang": "sq",
     "roman": "Verë"
    },
    "body": "ワインを飲む伝統の国で、食事の席で少しずつ飲む。土地のぶどうの、甘めのワインが知られる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ver%C3%AB+Tirana&hl=ja",
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "zgara",
    "name": "テク・ズガラ・エ・ティロネス 2（炭火焼きと郷土料理）",
    "what": "炭火焼きの肉と郷土料理の店。品書きにフェルゲセ（430レク）・タヴェ・ゼウ（550レク）・詰め物のピーマン・コルチャのビール。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Tek+Zgara+e+Tiron%C3%ABs+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Zgara e Tirones」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/zgara-e-tirones",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Tek Zgara e Tironës",
    "went": false
   },
   {
    "id": "tymi",
    "name": "ティミ・キング・ピルス（郷土料理）",
    "what": "郷土料理の店。品書きにフェルゲセ（420レク）・タヴェ・ゼウ（540レク）・白いチーズ・コフテ・コルチャのビール。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Tymi+King+Pils+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wolt「Tymi King Pils」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/restorant-tymi",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Tymi King Pils",
    "went": false
   },
   {
    "id": "quickbite",
    "name": "クイック・バイト（食堂）",
    "what": "日替わりのスープと煮込みの食堂。品書きにタスケバプ（350レク）・家のコフテとピラフ（500レク）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Quick+Bite+Tiran%C3%AB+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wolt「Quick Bite」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/quick-bite2",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Quick Bite Tiranë",
    "went": false
   },
   {
    "id": "mrchicken",
    "name": "ミスター・チキン（ブロックのファストフード）",
    "what": "ブロックの、アルバニアのファストフードの店。品書きにスフラチェ（330レク）・鶏肉のビュレク（350レク）・ジロ。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mr.+Chicken+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Mr. Chicken」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/mr-chicken01",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Mr. Chicken",
    "went": false
   },
   {
    "id": "mulliri",
    "name": "ムリリ・イ・ヴィエテル（コーヒーの店）",
    "what": "アルバニアのコーヒーの店。品書きにトルココーヒーの粉（100gで140レク）と、街の名前の缶（850レク）・揚げ菓子ペトゥラ（160レク）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mulliri+i+Vjet%C3%ABr+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wolt「Mulliri」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/mulliri-vjeter",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Mulliri i Vjetër」",
      "url": "https://www.openstreetmap.org/way/344257175",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Mulliri i Vjetër"
   },
   {
    "id": "someg",
    "name": "ソメグ ドン・ボスコ通り店（菓子とパン）",
    "what": "菓子とパンの店。品書きにバクラヴァ（150レク）・カダイフ（110レク）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Someg+Don+Bosko+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wolt「Someg Bakery & Pastry, Don Bosko」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/someg-bakery-pastry-don-bosko",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Someg Don Bosko",
    "went": false
   },
   {
    "id": "artisti",
    "name": "アルティスティ（ピザとカフェ）",
    "what": "エルバサン通りのピザとカフェの店。品書きにトリレチェ（250レク）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Artisti+Tiran%C3%AB+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wolt「Artisti Pizza」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/artisti",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Artisti Tiranë"
   },
   {
    "id": "panorama",
    "name": "パノラマ（クルヤ城のそばのレストラン）",
    "what": "クルヤ城のそばの店。村の鶏の料理と甘い米の菓子カブニを出し、セイヨウサンシュユとブラックベリーの地元のラキも飲める。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Panorama+Kruj%C3%AB+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Panorama Krujë",
    "km": 20.3,
    "went": false
   }
  ],
  "map": {
   "mid": "1gtJHQIvQKBcxmQhIbTCANbV64jP2lrA",
   "title": "ティラナ｜食べたいもの",
   "ll": "41.4146,19.8093",
   "z": 12,
   "pins": 8
  }
 },
 "buy": {
  "items": [
   {
    "id": "felt",
    "name": "手作りのフェルトの品（帽子チェレシェ・室内ばき）",
    "local": {
     "text": "Qeleshe",
     "lang": "sq",
     "roman": "Qeleshe"
    },
    "body": "アルバニアの人がかぶってきた、白くてつばの無いフェルトの帽子チェレシェ。クルヤでは羊の毛を弓のような道具でたたいて固めて作る。クルヤのバザールはフェルトの室内ばきも売る。",
    "facts": [
     {
      "label": "どこで",
      "text": "クルヤの古いバザール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Qeleshe+Tirana&hl=ja",
    "places": [
     "krujabazaar"
    ],
    "src": [
     {
      "name": "Wikipedia「Qeleshe」",
      "url": "https://en.wikipedia.org/wiki/Qeleshe",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "carpet",
    "name": "手織りのじゅうたん",
    "local": {
     "text": "Qilim",
     "lang": "sq",
     "roman": "Qilim"
    },
    "body": "クルヤの古いバザールで売る手作りのじゅうたん。安いみやげより値が張る。",
    "facts": [
     {
      "label": "どこで",
      "text": "クルヤの古いバザール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Qilim+Tirana&hl=ja",
    "places": [
     "krujabazaar"
    ],
    "src": [
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "eagle",
    "name": "双頭の鷲のみやげ",
    "local": {
     "text": "Shqiponja",
     "lang": "sq",
     "roman": "Shqiponja"
    },
    "body": "赤い地に鷲を描いた「アルバニア」のみやげ。クルヤのバザールにたくさん並ぶ。",
    "facts": [
     {
      "label": "どこで",
      "text": "クルヤの古いバザール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Shqiponja+Tirana&hl=ja",
    "places": [
     "krujabazaar"
    ],
    "src": [
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "costume",
    "name": "民族衣装と古道具",
    "local": {
     "text": "Antikitete",
     "lang": "sq",
     "roman": "Antikitete"
    },
    "body": "クルヤの古いバザールには、いろいろな民族衣装を含む本物の古道具がある。楽器はティラナで買うより高い。",
    "facts": [
     {
      "label": "どこで",
      "text": "クルヤの古いバザール"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Antikitete+Tirana&hl=ja",
    "places": [
     "krujabazaar"
    ],
    "src": [
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "coffee",
    "name": "トルココーヒーの缶",
    "local": {
     "text": "Kafe turke",
     "lang": "sq",
     "roman": "Kafe turke"
    },
    "body": "トルココーヒーはアルバニアでもよく飲まれる。コーヒーの店ムリリは、ティラナ・ドゥラス・ヴロラ・シュコドラの名前の缶（850レク）と、100gの粉（140レク）を売る。",
    "facts": [
     {
      "label": "どこで",
      "text": "ムリリ・イ・ヴィエテル（コーヒーの店）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kafe+turke+Tirana&hl=ja",
    "places": [
     "mulliri"
    ],
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wolt「Mulliri」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/mulliri-vjeter",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "bunker",
    "name": "トーチカの形の灰皿",
    "local": {
     "text": "Bunker",
     "lang": "sq",
     "roman": "Bunker"
    },
    "body": "アラバスター（雪花石膏）で作ったトーチカの形の灰皿は、ラキと並ぶアルバニアのみやげ。国じゅうに造られたトーチカの形。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Bunker+Tirana&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Bunkers in Albania」",
      "url": "https://en.wikipedia.org/wiki/Bunkers_in_Albania",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "caj-mali",
    "name": "山のお茶（チャイ・マリ）の乾いた葉",
    "local": {
     "text": "Çaj mali",
     "lang": "sq",
     "roman": "Caj mali"
    },
    "body": "シデリティスの花と茎を干したもので、たいていの市場で買える。アルバニアの人がいちばん飲むお茶。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%C3%87aj+mali+Tirana&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "olive",
    "name": "アルバニアのオリーブオイル",
    "local": {
     "text": "Vaj ulliri",
     "lang": "sq",
     "roman": "Vaj ulliri"
    },
    "body": "アルバニアの料理でいちばん古く、いちばん使われる油。古代から作られている。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Vaj+ulliri+Tirana&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "raki",
    "name": "ラキの瓶",
    "local": {
     "text": "Raki",
     "lang": "sq",
     "roman": "Raki"
    },
    "body": "アルバニアのみやげの定番。いちばん飲まれる蒸留酒で、ぶどう・すもも・ブラックベリーのものが多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Raki+Tirana&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "wine",
    "name": "アルバニアワインの瓶",
    "local": {
     "text": "Verë",
     "lang": "sq",
     "roman": "Vere"
    },
    "body": "6,000年前までさかのぼるとされるワインの国。土地のぶどうの甘めのワインが知られる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ver%C3%AB+Tirana&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Albanian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Albanian_cuisine",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "krujabazaar",
    "name": "クルヤの古いバザール",
    "what": "城の入口へ続く石畳の古いバザール。毎日7時から23時まで。じゅうたん・手作りのフェルトの品・民族衣装の古着・鷲の旗のみやげ。安いみやげは100レクから。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Pazari+i+Kruj%C3%ABs+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Krujë」",
      "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Pazari i Krujës",
    "km": 20.3,
    "went": false
   },
   {
    "id": "mulliri",
    "name": "ムリリ・イ・ヴィエテル（コーヒーの店）",
    "what": "アルバニアのコーヒーの店。品書きにトルココーヒーの粉（100gで140レク）と、街の名前の缶（850レク）・揚げ菓子ペトゥラ（160レク）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mulliri+i+Vjet%C3%ABr+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "Wolt「Mulliri」（配達の品書き）",
      "url": "https://wolt.com/en/alb/tirana/restaurant/mulliri-vjeter",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Mulliri i Vjetër」",
      "url": "https://www.openstreetmap.org/way/344257175",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Mulliri i Vjetër"
   }
  ],
  "map": {
   "mid": "1h-pJ4_ilUkmXubj1LqhcbsvmXUb5avg",
   "title": "ティラナ｜買いたいもの",
   "ll": "41.4203,19.8074",
   "z": 12,
   "pins": 2
  }
 },
 "videos": {
  "streams": {
   "country": "albania",
   "city": "ティラナ"
  },
  "shorts": []
 },
 "basics": {
  "summary": [
   {
    "id": "season",
    "icon": "sun",
    "label": "旬の季節",
    "value": "4〜5月・9〜10月",
    "lead": "平年の最高気温が19.0〜27.3℃",
    "to": "#guide-season"
   },
   {
    "id": "safety",
    "icon": "key",
    "label": "治安",
    "value": "夜の行動は控えめに",
    "lead": "日本人の被害の情報は無い",
    "to": "#guide-safety"
   },
   {
    "id": "budget",
    "icon": "wallet",
    "label": "乗り物の目安",
    "value": "空港バス400レク",
    "lead": "広場まで30〜40分",
    "to": "#budget"
   },
   {
    "id": "transit",
    "icon": "bus",
    "label": "移動",
    "value": "地下鉄は無い",
    "lead": "歩きと市バスで回る",
    "to": "#guide-transit"
   }
  ],
  "guides": [
   {
    "id": "airport",
    "icon": "plane",
    "title": "空港から市内へ",
    "lead": "空港バスでスカンデルベグ広場へ",
    "parts": [
     {
      "h": "",
      "text": "ティラナ国際空港（TIA）は街の中心から17km。"
     },
     {
      "h": "",
      "text": "市の空港バス（LU-NA）がスカンデルベグ広場まで、24時間・毎正時に出る。400レク（約780円）で30〜40分。現金・カード・サイトで払える。"
     },
     {
      "h": "",
      "text": "空港の公式のタクシーは中心まで2,200〜2,500レク（約4,270〜4,850円）。電話やアプリで呼ぶ電気自動車のタクシーは1,100〜1,300レク（約2,140〜2,520円。2025年7月）。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana International Airport Nënë Tereza」",
      "url": "https://en.wikivoyage.org/wiki/Tirana_International_Airport_N%C3%ABn%C3%AB_Tereza",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "transit",
    "icon": "bus",
    "title": "市内の乗り物",
    "lead": "中心は歩ける。市バスはGoogleマップで",
    "parts": [
     {
      "h": "",
      "text": "地下鉄は無い。中心は歩いて回れる広さ。"
     },
     {
      "h": "",
      "text": "2024年4月から、市バスの路線と時刻がGoogleマップで引ける。"
     },
     {
      "h": "",
      "text": "ダイティ山へは、時計塔から出る青いポルチェラン行きのバス。5時半から24時まで、5〜20分おき。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Dajti Ekspres「Getting here」",
      "url": "https://dajtiekspres.com/getting-here/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "pay",
    "icon": "currency",
    "title": "払いかたとチップ",
    "lead": "通貨はレク。チップは要らない",
    "parts": [
     {
      "h": "",
      "text": "通貨はレク（ALL）。1レクは約1.94円（2026年11月20日のアルバニア銀行の公式レート）。"
     },
     {
      "h": "",
      "text": "外国のカードでATMから引き出すと、1回500〜800レクの手数料がかかる（2026年。OTP 500・Credins 600・Raiffeisen 800レク）。"
     },
     {
      "h": "",
      "text": "チップの習慣は無い。都会の店なら端数を切り上げる程度。"
     },
     {
      "h": "",
      "text": "レクを国の外へ持ち出すことは禁じられている。"
     }
    ],
    "src": [
     {
      "name": "アルバニア銀行「Official exchange rate」（2026年11月20日の公式レート）",
      "url": "https://www.bankofalbania.org/Markets/Official_exchange_rate/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "sim",
    "icon": "sim",
    "title": "ネットと SIM",
    "lead": "Vodafone か One。空港の売り場は高い",
    "parts": [
     {
      "h": "",
      "text": "旅行者はふつう Vodafone か One。2025年10月の時点で、Vodafone の旅行者向けのいちばん安い組み合わせは40GBで2,400レク（約4,660円）。"
     },
     {
      "h": "",
      "text": "空港の中の Vodafone と One の売り場は、高い組み合わせしか置いていない。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Albania」",
      "url": "https://en.wikivoyage.org/wiki/Albania",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana International Airport Nënë Tereza」",
      "url": "https://en.wikivoyage.org/wiki/Tirana_International_Airport_N%C3%ABn%C3%AB_Tereza",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "safety",
    "icon": "key",
    "title": "治安のコツ",
    "lead": "夜の行動と、荒い車に気をつける",
    "parts": [
     {
      "h": "",
      "text": "麻薬の取引や犯罪組織があると言われるが、日本人がねらわれているという情報は無い。"
     },
     {
      "h": "",
      "text": "夜の行動は控え、携帯電話などの連絡の手段を持つ。知らない人から近づかれても相手にしない。"
     },
     {
      "h": "",
      "text": "車の運転は荒く、青信号でも安全とは限らない。道を渡るときは地元の人と一緒に。"
     },
     {
      "h": "",
      "text": "軍の施設の写真は撮れない。"
     },
     {
      "h": "水道水",
      "text": "水道の水は避け、ミネラルウォーターを使うのがすすめられている。"
     }
    ],
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "phrases",
    "icon": "phrase",
    "title": "アルバニア語のひとこと",
    "lead": "Përshëndetje（パルシェンデティエ）＝こんにちは",
    "parts": [],
    "src": [
     {
      "name": "Wikivoyage「Albanian phrasebook」",
      "url": "https://en.wikivoyage.org/wiki/Albanian_phrasebook",
      "seen": "2026-11-23"
     }
    ],
    "words": [
     {
      "local": {
       "text": "Përshëndetje",
       "lang": "sq",
       "roman": "pershendetje",
       "kana": "パルシェンデティエ"
      },
      "jp": "こんにちは"
     },
     {
      "local": {
       "text": "Mirëdita",
       "lang": "sq",
       "roman": "mirdita",
       "kana": "ミルディタ"
      },
      "jp": "こんにちは（日中）"
     },
     {
      "local": {
       "text": "Mirëmëngjes",
       "lang": "sq",
       "roman": "mirmengjes",
       "kana": "ミルメンジェス"
      },
      "jp": "おはようございます"
     },
     {
      "local": {
       "text": "Faleminderit",
       "lang": "sq",
       "roman": "faleminderit",
       "kana": "ファレミンデリト"
      },
      "jp": "ありがとう"
     },
     {
      "local": {
       "text": "Po",
       "lang": "sq",
       "roman": "po",
       "kana": "ポ"
      },
      "jp": "はい"
     },
     {
      "local": {
       "text": "Jo",
       "lang": "sq",
       "roman": "jo",
       "kana": "ヨ"
      },
      "jp": "いいえ"
     },
     {
      "local": {
       "text": "Më falni",
       "lang": "sq",
       "roman": "me falni",
       "kana": "マ・ファルニ"
      },
      "jp": "すみません"
     },
     {
      "local": {
       "text": "Ju lutem",
       "lang": "sq",
       "roman": "ju lutem",
       "kana": "ユ・ルテム"
      },
      "jp": "お願いします"
     },
     {
      "local": {
       "text": "Sa është kjo?",
       "lang": "sq",
       "roman": "sa eshte kjo",
       "kana": "サ・アシュタ・キョ？"
      },
      "jp": "これはいくらですか？"
     },
     {
      "local": {
       "text": "Mirupafshim",
       "lang": "sq",
       "roman": "mirupafshim",
       "kana": "ミルパフシム"
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
   "lead": "歩きやすいのは4〜5月と9〜10月",
   "parts": [
    {
     "h": "歩きやすい季節",
     "text": "平年の最高気温は4月19.0℃・5月23.8℃・9月27.3℃・10月21.8℃。7〜8月は30.7℃、11月は雨が172mmといちばん多い。"
    },
    {
     "h": "祝日",
     "text": "11月28日は独立記念日で国の祝日。"
    },
    {
     "h": "時差",
     "text": "アルバニアは中央ヨーロッパ時間（UTC+1）で、日本より8時間遅い。3月の最終日曜から10月の最終日曜までは夏時間（UTC+2）で7時間遅い。"
    }
   ],
   "src": [
    {
     "name": "Wikipedia（日本語）「ティラナ」",
     "url": "https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%A3%E3%83%A9%E3%83%8A",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Public holidays in Albania」",
     "url": "https://en.wikipedia.org/wiki/Public_holidays_in_Albania",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Time in Albania」",
     "url": "https://en.wikipedia.org/wiki/Time_in_Albania",
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
     "label": "空港バス（広場まで）",
     "local": "400レク",
     "yen": "780円",
     "src": [
      {
       "name": "Wikivoyage「Tirana International Airport Nënë Tereza」",
       "url": "https://en.wikivoyage.org/wiki/Tirana_International_Airport_N%C3%ABn%C3%AB_Tereza",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "空港から中心まで公式のタクシー",
     "local": "2,200〜2,500レク",
     "yen": "4,270〜4,850円",
     "src": [
      {
       "name": "Wikivoyage「Tirana International Airport Nënë Tereza」",
       "url": "https://en.wikivoyage.org/wiki/Tirana_International_Airport_N%C3%ABn%C3%AB_Tereza",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "空港から中心まで電気自動車のタクシー",
     "local": "1,100〜1,300レク",
     "yen": "2,140〜2,520円",
     "src": [
      {
       "name": "Wikivoyage「Tirana International Airport Nënë Tereza」",
       "url": "https://en.wikivoyage.org/wiki/Tirana_International_Airport_N%C3%ABn%C3%AB_Tereza",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "中心からダイティ・エクスプレスまでタクシー",
     "local": "750レク",
     "yen": "1,460円",
     "src": [
      {
       "name": "Dajti Ekspres「Getting here」",
       "url": "https://dajtiekspres.com/getting-here/",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "スカンデルベグ博物館（クルヤ）",
     "local": "500レク",
     "yen": "970円",
     "src": [
      {
       "name": "Wikivoyage「Krujë」",
       "url": "https://en.wikivoyage.org/wiki/Kruj%C3%AB",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "SIM（Vodafone の旅行者向け 40GB）",
     "local": "2,400レク",
     "yen": "4,660円",
     "src": [
      {
       "name": "Wikivoyage「Albania」",
       "url": "https://en.wikivoyage.org/wiki/Albania",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "rate": "1レクは約1.94円。アルバニアのレク（ALL）は変動相場で、円は1ユーロ＝89.78レク・100円＝51.52レク（2026年11月20日のアルバニア銀行の公式レート）で直した。",
   "rateSrc": [
    {
     "name": "アルバニア銀行「Official exchange rate」（2026年11月20日の公式レート）",
     "url": "https://www.bankofalbania.org/Markets/Official_exchange_rate/",
     "seen": "2026-11-23"
    }
   ]
  },
  "pack": [
   {
    "icon": "passport",
    "label": "パスポート",
    "why": "日本の人は90日までの滞在なら査証が要らない。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "coin",
    "label": "少しのユーロかレクの現金",
    "why": "ATMの手数料が1回500〜800レクかかるので、引き出す回数は少なく。",
    "src": [
     {
      "name": "Wikivoyage「Tirana」",
      "url": "https://en.wikivoyage.org/wiki/Tirana",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "umbrella",
    "label": "雨具",
    "why": "11月は平年172mm、12月は148mm、1月は143mmと冬に雨が多い。",
    "src": [
     {
      "name": "Wikipedia（日本語）「ティラナ」",
      "url": "https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%A3%E3%83%A9%E3%83%8A",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "bottle",
    "label": "水のボトル",
    "why": "水道の水は避け、ミネラルウォーターがすすめられている。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "firstaid",
    "label": "海外旅行の保険",
    "why": "医療の水準は低く、高い程度の治療は国の外で受けることになる。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "powerbank",
    "label": "モバイルバッテリーと明かり",
    "why": "電気の供給が安定せず、停電がよく起きる。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "climate": {
   "months": [
    {
     "hi": 11.6,
     "lo": 1.8,
     "mm": 143
    },
    {
     "hi": 12.9,
     "lo": 2.6,
     "mm": 132
    },
    {
     "hi": 15.6,
     "lo": 4.5,
     "mm": 115
    },
    {
     "hi": 19.0,
     "lo": 7.9,
     "mm": 104
    },
    {
     "hi": 23.8,
     "lo": 12.1,
     "mm": 103
    },
    {
     "hi": 27.7,
     "lo": 15.6,
     "mm": 68
    },
    {
     "hi": 30.7,
     "lo": 17.2,
     "mm": 42
    },
    {
     "hi": 30.7,
     "lo": 16.9,
     "mm": 46
    },
    {
     "hi": 27.3,
     "lo": 14.1,
     "mm": 78
    },
    {
     "hi": 21.8,
     "lo": 10.1,
     "mm": 114
    },
    {
     "hi": 17.1,
     "lo": 6.3,
     "mm": 172
    },
    {
     "hi": 13.0,
     "lo": 3.2,
     "mm": 148
    }
   ],
   "note": "平均最高と平均最低。ティラナ（平年値）",
   "src": [
    {
     "name": "Wikipedia（日本語）「ティラナ」",
     "url": "https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%A3%E3%83%A9%E3%83%8A",
     "seen": "2026-11-23"
    }
   ]
  },
  "help": {
   "calls": [
    {
     "num": "129",
     "label": "警察",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "num": "127",
     "label": "救急車",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "num": "128",
     "label": "消防",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "embassy": {
    "name": "在アルバニア日本国大使館",
    "address": "Rruga e Kavajës, Nd 50, H1, 1023 Tirana",
    "tel": "+355-4-454-7930",
    "note": "ティラナに日本の大使館がある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ambasada+e+Japonis%C3%AB+Tiran%C3%AB&hl=ja",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルバニア 安全対策基礎データ。2025年4月9日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_196.html",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Ambasada e Japonisë」",
      "url": "https://www.openstreetmap.org/node/5974456407",
      "seen": "2026-11-23"
     }
    ]
   }
  }
 },
 "published": "2026-11-23",
 "updated": "2026-11-23",
 "hash": "61dec4cc35f3a189"
}
/* END GUIDE */;
