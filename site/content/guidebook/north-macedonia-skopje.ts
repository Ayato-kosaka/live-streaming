/**
 * スコピエのガイドブック（`/travel/north-macedonia/skopje`）の中身。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/north-macedonia/skopje/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_bake.py north-macedonia/skopje` で焼き直す。
 * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。
 */
import type { Guidebook } from "./types";

export const SKOPJE: Guidebook = /* BEGIN GUIDE */
{
 "country": "north-macedonia",
 "city": "skopje",
 "name": "スコピエ",
 "kicker": "北マケドニア",
 "local": {
  "text": "Скопје",
  "lang": "mk",
  "roman": "Skopje"
 },
 "lead": "石橋の北はオスマンの市場、南は像の広場",
 "cover": {
  "src": "/travel/north-macedonia/skopje/bridge-960.webp",
  "small": "/travel/north-macedonia/skopje/bridge-480.webp",
  "w": 960,
  "h": 1280,
  "alt": "スコピエ。銅像が並ぶ橋と、その先の白い柱の建物（2026年10月15日）",
  "kind": "card",
  "date": "2026-10-15"
 },
 "title": "スコピエ観光ガイド【2026年】見どころ・食べ物・物価・マトカ渓谷",
 "description": "北マケドニアの首都スコピエのガイド。やりたいこと6選、見どころ25か所、名物14品、1日の予算。2026年10月に行った配信者の体験つき。マトカ渓谷へは60番のバスで実測49分。",
 "rate": {
  "unit": "デナル",
  "yen": 2.88,
  "date": "2026-11-13"
 },
 "about": {
  "cards": [
   {
    "id": "scupi",
    "num": "1",
    "unit": "世紀末から",
    "title": "ローマの町スクピから",
    "body": "1世紀末にローマの町スクピとして築かれ、518年の地震で廃れたのち、ユスティニアヌス1世が建て直した。",
    "src": [
     {
      "name": "Wikipedia「Skopje」",
      "url": "https://en.wikipedia.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "ottoman",
    "num": "5",
    "unit": "世紀あまり",
    "title": "500年のオスマン時代",
    "body": "オスマン帝国が5世紀あまり治めた。旧市街のモスクや隊商宿は、そのころに建ったもの。",
    "src": [
     {
      "name": "Wikipedia「Skopje」",
      "url": "https://en.wikipedia.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Old Bazaar, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Old_Bazaar,_Skopje",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "tange",
    "num": "約8",
    "unit": "割が壊れた",
    "title": "1963年の地震と丹下健三",
    "body": "1963年の地震で街の約8割が壊れ、中心部は日本の建築家・丹下健三の計画で建て直された。",
    "src": [
     {
      "name": "Wikipedia「Skopje」",
      "url": "https://en.wikipedia.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「1963 Skopje earthquake」",
      "url": "https://en.wikipedia.org/wiki/1963_Skopje_earthquake",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "skopje2014",
    "num": "2010",
    "unit": "年からの計画",
    "title": "像と柱の「スコピエ2014」",
    "body": "広場のまわりの像と柱の建物の多くは、2010〜2014年の計画で建った。費用をめぐり評判は割れる。",
    "src": [
     {
      "name": "Wikipedia「Macedonia Square, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Macedonia_Square,_Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Skopje 2014」",
      "url": "https://en.wikipedia.org/wiki/Skopje_2014",
      "seen": "2026-11-15"
     }
    ]
   }
  ],
  "more": [],
  "areas": [
   {
    "id": "carsija",
    "name": "旧市街チャルシヤ",
    "color": "#ffd98a",
    "lead": "オスマン時代からの市場",
    "see": [
     "old-bazaar",
     "fortress",
     "kursumli",
     "mosque",
     "bit-pazar",
     "sv-spas",
     "clock-tower",
     "sultan-murat",
     "daut-pasha"
    ],
    "plan": [
     2,
     1,
     2
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Old Bazaar, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Old_Bazaar,_Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Skopje Old Bazaar（historic=district））",
      "url": "https://www.openstreetmap.org/way/1532093164",
      "seen": "2026-11-15"
     }
    ],
    "body": "モスク・隊商宿・小さな店が、石橋の北の路地に集まる",
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "UQdkUSro9Ck",
      "t": 1200,
      "date": "2026-10-14"
     }
    }
   },
   {
    "id": "square",
    "name": "マケドニア広場まわり",
    "color": "#a9dcf5",
    "lead": "噴水の上の巨大な戦士の像、凱旋門、像の並ぶ橋",
    "see": [
     "stone-bridge",
     "square",
     "clement",
     "teresa",
     "porta",
     "archaeology",
     "holocaust",
     "struggle"
    ],
    "plan": [
     1,
     2,
     3
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Macedonia Square, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Macedonia_Square,_Skopje",
      "seen": "2026-11-15"
     }
    ],
    "body": "2010年代に建った像と柱の建物が集まる",
    "went": {
     "date": "2026-10-15",
     "scene": {
      "v": "CKJvprUMOgA",
      "t": 690,
      "date": "2026-10-15"
     }
    }
   },
   {
    "id": "newtown",
    "name": "新市街（地震のあとの中心部）",
    "color": "#d9ccf5",
    "lead": "1963年の地震のあと、丹下健三の計画で建て直された中心部",
    "see": [
     "museum"
    ],
    "plan": [
     2,
     3,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Skopje」",
      "url": "https://en.wikipedia.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Diamond Mall）",
      "url": "https://www.openstreetmap.org/way/1231158369",
      "seen": "2026-11-15"
     }
    ],
    "body": "駅とバスのターミナル、モール、半分壊れた旧駅舎の博物館がある",
    "went": {
     "date": "2026-10-28",
     "scene": {
      "v": "la_OkustLkA",
      "t": 2105,
      "date": "2026-10-28"
     }
    }
   },
   {
    "id": "debar-maalo",
    "name": "デバル・マーロ",
    "color": "#ffc4d2",
    "lead": "並木道にレストラン・バー・カフェが並ぶ、街のボヘミアンな地区",
    "see": [],
    "plan": [
     1,
     1,
     1
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Debar Maalo（place=suburb））",
      "url": "https://www.openstreetmap.org/node/6239561763",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "body": "1920年代にデバル地方から移った人たちが住みついた"
   },
   {
    "id": "vodno",
    "name": "ヴォドノ山",
    "color": "#bfe8a6",
    "lead": "街の南西にそびえる山",
    "see": [
     "st-pantaleon",
     "millennium-cross"
    ],
    "plan": [
     1,
     3,
     1
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Karpoš」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Karpo%C5%A1",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Vodno」",
      "url": "https://en.wikipedia.org/wiki/Vodno",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Millennium Cross）",
      "url": "https://www.openstreetmap.org/way/229939246",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Middle Vodno）",
      "url": "https://www.openstreetmap.org/node/13655181221",
      "seen": "2026-11-15"
     }
    ],
    "body": "中腹のスレドノ・ヴォドノから、頂上の十字架へロープウェイで上がる",
    "went": {
     "date": "2026-11-08",
     "scene": {
      "v": "qAXRe3qQyvo",
      "t": 4740,
      "date": "2026-11-08"
     }
    }
   }
  ]
 },
 "todo": [
  {
   "id": "carsija-walk",
   "title": "旧市街チャルシヤを歩く",
   "lead": "隊商宿とモスクの路地を、ビト・パザルの市場まで",
   "what": "石橋を渡った先の旧市街を歩き、オスマン時代の隊商宿（ハン）・モスク・時計塔をめぐって、北の端の市場ビト・パザルまで抜ける。道を作るために一部は壊されたが、それでもバルカンで最大の古い市場。通りごとに金・靴・鍋・服と、商う品が分かれていた。少なくとも12世紀から商いが続き、オスマン時代のモスクがおよそ30残る。",
   "how": "マケドニア広場から石橋を渡ると、旧市街の入口のカルポシュ蜂起広場に出る。",
   "time": "旧市街・城塞・地震のあとの建物を歩いてざっと見るなら1〜2時間。",
   "money": "歩くのはただ。城塞も入場はただ。クルシュムリ・アンなどの隊商宿は、中を歩いて見て回れる。旧市街の菓子店リガラのバクラヴァなどは80〜200デナル（約230〜570円。2023年1月の値段）。",
   "tip": "市場など人の集まる所ではスリ・ひったくりが多い。バッグは体の前に。",
   "route": "石橋 → カルポシュ蜂起広場 → 聖スパス教会 → スリ・アン → クルシュムリ・アン → ビト・パザル → ムスタファ・パシャ・モスク → 城塞。南から北へ抜けて、高台で終わる順。",
   "see": [
    "old-bazaar",
    "kursumli",
    "mosque",
    "bit-pazar",
    "sv-spas",
    "clock-tower"
   ],
   "src": [
    {
     "name": "Wikivoyage「Skopje/Stara Čaršija」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Old Bazaar, Skopje」",
     "url": "https://en.wikipedia.org/wiki/Old_Bazaar,_Skopje",
     "seen": "2026-11-14"
    },
    {
     "name": "Wikivoyage「Skopje」",
     "url": "https://en.wikivoyage.org/wiki/Skopje",
     "seen": "2026-11-15"
    },
    {
     "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
     "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
     "seen": "2026-11-15"
    }
   ],
   "pic": {
    "src": "/travel/north-macedonia/skopje/umbrellas-960.webp",
    "small": "/travel/north-macedonia/skopje/umbrellas-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "スコピエの旧市街。傘が吊られた石畳の通り（2026年10月13日）",
    "kind": "card",
    "date": "2026-10-13"
   },
   "went": {
    "date": "2026-10-12",
    "scene": {
     "v": "UQdkUSro9Ck",
     "t": 1200,
     "date": "2026-10-14"
    },
    "story": [
     "晴れた日に歩く。あやとは雨の日に土産のアクセサリーくらいしか見られず、晴れた日にもう一度歩くと通りの様子がまるで違った。",
     "月曜と祝日は閉まる店が多い。"
    ]
   }
  },
  {
   "id": "square-statues",
   "title": "像だらけのマケドニア広場を歩く",
   "lead": "噴水の戦士像から凱旋門まで、スコピエ2014をめぐる",
   "what": "噴水の上に立つ高さ14.5mの騎馬像の広場から、像の並ぶ橋、川向こうのフィリッポス2世像、凱旋門マケドニア門までを歩く。広場とそのまわりの像・噴水・柱の建物の多くは「スコピエ2014」計画で建ち、136の建造物に見積もりで8,000万〜5億ユーロがかかった。費用と歴史の描きかたをめぐって評判が割れている。",
   "how": "広場は街のまん中。旧市街とは石橋でつながっている。",
   "time": "",
   "money": "広場と橋はただ。マケドニア門は中の階段とエレベーターで屋上まで上がれる。",
   "tip": "芸術の橋には音楽家などの像が29体、文明の橋には28体並ぶ。",
   "route": "マケドニア広場 → 文明の橋 → カルポシュ蜂起広場（フィリッポス2世像）→ 芸術の橋 → マザー・テレサ記念館 → マケドニア門。",
   "see": [
    "square",
    "stone-bridge",
    "porta",
    "teresa"
   ],
   "src": [
    {
     "name": "Wikivoyage「Skopje/Centar」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikivoyage「Skopje/Stara Čaršija」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Macedonia Square, Skopje」",
     "url": "https://en.wikipedia.org/wiki/Macedonia_Square,_Skopje",
     "seen": "2026-11-14"
    },
    {
     "name": "Wikipedia「Skopje 2014」",
     "url": "https://en.wikipedia.org/wiki/Skopje_2014",
     "seen": "2026-11-14"
    },
    {
     "name": "Wikipedia「Porta Macedonia」",
     "url": "https://en.wikipedia.org/wiki/Porta_Macedonia",
     "seen": "2026-11-14"
    }
   ],
   "pic": {
    "src": "/travel/north-macedonia/skopje/warrior-960.webp",
    "small": "/travel/north-macedonia/skopje/warrior-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "マケドニア広場。騎馬像をのせた柱と噴水、獅子の像（2026年10月15日）",
    "kind": "card",
    "date": "2026-10-15"
   },
   "went": {
    "date": "2026-10-15",
    "scene": {
     "v": "CKJvprUMOgA",
     "t": 690,
     "date": "2026-10-15"
    },
    "story": [
     "あやとが見つけたのは、左手にショットガン、右手に拳銃の像と、鼻先だけピカピカの牛の像。"
    ],
    "short": "frcgM9wiRr8"
   }
  },
  {
   "id": "kale",
   "title": "城塞（カレ）から街を見下ろす",
   "lead": "6世紀の砦の上から、ヴァルダル川と街をながめる",
   "what": "旧市街の上の丘に残る城塞の城壁と塔を歩き、ヴァルダル川と街を見下ろす。スコピエの谷でいちばん高い丘にあり、街を見わたせる。最初の砦は6世紀に、ローマの町の石で築かれた。",
   "how": "旧市街から坂を上がる。ムスタファ・パシャ・モスクのすぐ西。",
   "time": "",
   "money": "入場はただ。",
   "tip": "",
   "route": "旧市街チャルシヤを歩いたあと、最後に上がると、歩いた路地を上から見られる。",
   "see": [
    "fortress"
   ],
   "src": [
    {
     "name": "Wikivoyage「Skopje/Stara Čaršija」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Skopje Fortress」",
     "url": "https://en.wikipedia.org/wiki/Skopje_Fortress",
     "seen": "2026-11-14"
    }
   ],
   "pic": {
    "src": "/travel/north-macedonia/skopje/fortress-960.webp",
    "small": "/travel/north-macedonia/skopje/fortress-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "スコピエ城塞の石の塔と城壁（2026年10月18日）",
    "kind": "card",
    "date": "2026-10-18"
   },
   "went": {
    "date": "2026-10-18",
    "scene": {
     "v": "TDArug_te90",
     "t": 9930,
     "date": "2026-10-18"
    },
    "story": [
     "夕日を見るなら早めに。あやとが日の入りに合わせて行くと門はもう閉まっていて、入口の隣の駐車場から日が沈むのを見た。",
     "城塞の手前の堀に架かる橋は、あやとが渡るのをやめたほど傷んで見えた。"
    ],
    "short": "ieMGyM2QjCA"
   }
  },
  {
   "id": "matka",
   "title": "マトカ渓谷へ、60番のバスで日帰り",
   "lead": "岩山と湖の渓谷へ。路線バスで約1時間",
   "what": "トレスカ川をせき止めた湖のまわりの渓谷で、川沿いを歩き、中世の修道院を見て、ボートで洞窟ヴレロへ渡る。国でいちばん人気の外遊びの場所のひとつ。洞窟が10あり、ヴレロ洞窟は「新・世界七不思議（自然）」の候補77に入った。",
   "how": "交通センター（鉄道駅とバスターミナルの建物）の市バス乗り場から60番。あやとは、いちばん大きい中央のバス停が始発だと思い込んで、乗る場所を間違えた。乗る前に、時刻表の出るアプリ SkopjeBus で乗り場を確かめる。",
   "time": "中心から50分ほど。",
   "money": "市バスは1回35デナル（アプリかスコプスカ・カード）、運転手に現金なら50デナル（約100〜140円）。タクシーなら800デナル（約2,310円）ほど。",
   "tip": "南ヨーロッパでいちばん毒の強いヘビ、ハナダカクサリヘビもすむ。",
   "route": "バスを降りる → 湖のほとりの聖アンドレイ修道院 → ボートでヴレロ洞窟（片道約20分）→ 帰りのバスの時刻を先に見ておく。",
   "see": [
    "matka"
   ],
   "src": [
    {
     "name": "Wikivoyage「Skopje/Matka Canyon」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Matka_Canyon",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Matka Canyon」",
     "url": "https://en.wikipedia.org/wiki/Matka_Canyon",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikivoyage「Skopje」",
     "url": "https://en.wikivoyage.org/wiki/Skopje",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikivoyage「Skopje/Outer Skopje」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Outer_Skopje",
     "seen": "2026-11-15"
    }
   ],
   "pic": {
    "src": "/travel/north-macedonia/skopje/matka-960.webp",
    "small": "/travel/north-macedonia/skopje/matka-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "マトカ渓谷。岩山のあいだの湖と、紅葉の木（2026年10月24日）",
    "kind": "card",
    "date": "2026-10-24"
   },
   "went": {
    "date": "2026-10-24",
    "scene": {
     "v": "eHBAnQF56-E",
     "t": 4860,
     "date": "2026-10-24"
    },
    "story": [
     "あやとが着いたとき、岩山と紅葉と川が一度に見えて、水が澄んでいた。",
     "あやとは60番に乗ってから、渓谷の手前で降ろされるまで約49分。その日は終点まで行かず手前で折り返し、そこから歩いて30分だった。",
     "この日の渓谷行きのバスは2本しか無かった。帰りのバスはもう終わっていて、夜のバスでようやく帰った。",
     "エンジンのボートは客が5人集まるまで出ない。乗り場は6時に閉まり、あやとは夕方に5人集まらず乗れなかった。ボートに乗るなら早い時間に。",
     "道の看板には狼・毒ヘビ・イノシシ・クマ・キツネがいると書いてある。"
    ],
    "say": "岩山に紅葉に川"
   }
  },
  {
   "id": "vodno",
   "title": "ヴォドノ山へ、街から歩いて登る",
   "lead": "頂の十字架へは、中腹からロープウェイもある",
   "what": "街の南西のヴォドノ山を登る。頂（1,066m）には、高さ66mのミレニアム・クロスが立つ。街のどこからでも見える山で、街を見わたす展望の場所。十字架は2002年に、キリスト教2000年を記念して建った。",
   "how": "ロープウェイなら、市バスで中腹のスレドノ・ヴォドノ（557m）へ行き、そこから頂まで1.75km。ロープウェイは2011年から。",
   "time": "",
   "money": "ロープウェイは100デナル（約290円。Wikivoyage の2016年の値段）。",
   "tip": "ロープウェイは月曜と、毎月最後の火曜は動かない。歩くなら、中腹から頂上までの道が人気。尾根づたいにマトカ渓谷まで約18kmを歩く人もいる。",
   "route": "中腹の手前のゴルノ・ネレジ村には、1164年の壁画が残る聖パンテレイモン修道院がある。帰りに寄れる。",
   "see": [
    "millennium-cross",
    "st-pantaleon"
   ],
   "src": [
    {
     "name": "Wikipedia「Vodno」",
     "url": "https://en.wikipedia.org/wiki/Vodno",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Millennium Cross」",
     "url": "https://en.wikipedia.org/wiki/Millennium_Cross",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikivoyage「Skopje」",
     "url": "https://en.wikivoyage.org/wiki/Skopje",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikivoyage「Skopje/Karpoš」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Karpo%C5%A1",
     "seen": "2026-11-15"
    }
   ],
   "pic": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Millennium_Cross_Vodno_2025_3.jpg/960px-Millennium_Cross_Vodno_2025_3.jpg",
    "alt": "ヴォドノ山の頂に立つ、白い鉄骨のミレニアム・クロス",
    "kind": "photo",
    "credit": {
     "by": "kallerna",
     "lic": "CC BY-SA 4.0",
     "page": "https://commons.wikimedia.org/wiki/File:Millennium_Cross_Vodno_2025_3.jpg"
    },
    "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Millennium_Cross_Vodno_2025_3.jpg/500px-Millennium_Cross_Vodno_2025_3.jpg"
   },
   "went": {
    "date": "2026-11-08",
    "scene": {
     "v": "qAXRe3qQyvo",
     "t": 4740,
     "date": "2026-11-08"
    },
    "story": [
     "あやとは宿から歩いて登り、山の途中の駐車場に並ぶ出店で、梨ジュースとクッキーを買ってひと休みした。15時20分、あと1時間で日が暮れるので、十字架の手前で引き返した。",
     "歩くなら、街から山道を登る。あやとが見た地図アプリでは、十字架まで歩いて2時間6分の道だった。",
     "あやとが行く前の晩に調べると、昔の案内にはバスがあると書いてあるのに、地図アプリでは歩きの道しか出なかった。",
     "あやとは宿から、山の途中の出店のある駐車場まで1時間ちょいだった。",
     "山の途中の駐車場の出店では、クレジットカードが使えた。",
     "あやとが行った11月8日は、地図アプリの口コミに、工事でロープウェイが使えないとあった。動いているかを先に確かめる。",
     "日が沈むと、山道はすぐ暗くなる。あやとは携帯のライトで足元だけを見て下りた。下りの道は急で滑りやすく、野良犬もいた。",
     "登る途中で見つけたスーパーは、日曜で休みだった。"
    ]
   }
  },
  {
   "id": "debar-maalo-night",
   "title": "デバル・マーロのカファナで夕ごはん",
   "lead": "生演奏のある店で、マケドニア料理とラキヤを",
   "what": "並木道に食堂とバーが並ぶデバル・マーロで、カファナ（酒も料理も出す昔ながらの食堂）に入って夕ごはんにする。街のボヘミアンな地区で、通りにはレストラン・バー・カフェが数えきれないほど並ぶ。スコプスキ・メラクは生演奏のある古典的なマケドニア料理の店で、街でいちばん知られた伝統料理の店のひとつ。",
   "how": "マケドニア広場から西へ。聖クリメント・オフリド大聖堂の先。",
   "time": "",
   "money": "",
   "tip": "多くのカファナは生演奏の夜がある。イダディヤは、街でいちばん古いカファナのひとつ。",
   "route": "夕方に聖クリメント・オフリド大聖堂を見て、そのままデバル・マーロへ歩く。",
   "see": [
    "clement"
   ],
   "src": [
    {
     "name": "Wikivoyage「Skopje/Centar」",
     "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Kafana」",
     "url": "https://en.wikipedia.org/wiki/Kafana",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikivoyage「Skopje」",
     "url": "https://en.wikivoyage.org/wiki/Skopje",
     "seen": "2026-11-15"
    }
   ],
   "eat": [
    "rakija",
    "tavche"
   ],
   "pic": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Starogradska_arhitektura_vo_Debar_Maalo%2C_Skopje_na_Ilindenska.jpg/960px-Starogradska_arhitektura_vo_Debar_Maalo%2C_Skopje_na_Ilindenska.jpg",
    "alt": "デバル・マーロの古い家並み",
    "kind": "photo",
    "credit": {
     "by": "Hip.Hop_MKD ( А.М.-П. Методијевски карадакоски )",
     "lic": "CC BY-SA 3.0",
     "page": "https://commons.wikimedia.org/wiki/File:Starogradska_arhitektura_vo_Debar_Maalo%2C_Skopje_na_Ilindenska.jpg"
    },
    "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Starogradska_arhitektura_vo_Debar_Maalo%2C_Skopje_na_Ilindenska.jpg/500px-Starogradska_arhitektura_vo_Debar_Maalo%2C_Skopje_na_Ilindenska.jpg"
   }
  }
 ],
 "see": {
  "items": [
   {
    "id": "old-bazaar",
    "name": "旧市街（オールド・バザール）",
    "local": {
     "text": "Стара чаршија",
     "lang": "mk",
     "roman": "Stara čaršija"
    },
    "rank": 1,
    "pic": {
     "src": "/travel/north-macedonia/skopje/umbrellas-960.webp",
     "small": "/travel/north-macedonia/skopje/umbrellas-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "スコピエの旧市街。傘が吊られた石畳の通り（2026年10月13日）",
     "kind": "card",
     "date": "2026-10-13"
    },
    "body": "少なくとも12世紀から商いが続く、バルカンでも指折りの古くて大きな市場。オスマン時代のモスクがおよそ30、隊商宿（ハン）もいくつも残っていて、石畳の細い路地に小さな店が並ぶ。石橋からビト・パザルの市場まで、城塞の下からセラヴァ川まで広がっている。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D1%82%D0%B0%D1%80%D0%B0+%D1%87%D0%B0%D1%80%D1%88%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "carsija-walk"
    ],
    "src": [
     {
      "name": "Wikipedia「Old Bazaar, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Old_Bazaar,_Skopje",
      "seen": "2026-11-14"
     }
    ],
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "UQdkUSro9Ck",
      "t": 1200,
      "date": "2026-10-14"
     },
     "story": [
      "着いた日は月曜で、閉まっている店が多かった。次の日は雨で、見られたのは土産物のアクセサリーくらい。晴れた日にもう一度歩くと、通りの様子がまるで違って見えた。"
     ]
    },
    "area": "carsija"
   },
   {
    "id": "stone-bridge",
    "name": "石橋（カメン・モスト）",
    "local": {
     "text": "Камен мост",
     "lang": "mk",
     "roman": "Kamen most"
    },
    "rank": 1,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/08_Skopje.jpg/960px-08_Skopje.jpg",
     "alt": "ヴァルダル川にかかる、アーチの連なる石橋",
     "kind": "photo",
     "credit": {
      "by": "Делфина",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:08_Skopje.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/08_Skopje.jpg/500px-08_Skopje.jpg"
    },
    "body": "ヴァルダル川にかかる石の橋で、街の紋章にも旗にも描かれている、スコピエの顔。ローマ時代の土台の上に、1451〜1469年、メフメト2世のもとで架けられた。長さ214m、幅6mで、半円のアーチが12。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D0%B0%D0%BC%D0%B5%D0%BD+%D0%BC%D0%BE%D1%81%D1%82+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "square-statues"
    ],
    "src": [
     {
      "name": "Wikipedia「Stone Bridge (Skopje)」",
      "url": "https://en.wikipedia.org/wiki/Stone_Bridge_(Skopje)",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:08_Skopje.jpg",
      "seen": "2026-11-15"
     }
    ],
    "area": "square"
   },
   {
    "id": "square",
    "name": "マケドニア広場と、スコピエ2014の像",
    "local": {
     "text": "Плоштад Македонија",
     "lang": "mk",
     "roman": "Ploštad Makedonija"
    },
    "rank": 1,
    "pic": {
     "src": "/travel/north-macedonia/skopje/warrior-960.webp",
     "small": "/travel/north-macedonia/skopje/warrior-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "マケドニア広場。騎馬像をのせた柱と噴水、獅子の像（2026年10月15日）",
     "kind": "card",
     "date": "2026-10-15"
    },
    "body": "国でいちばん大きな広場（18,500m²）で、川をまたいで広がる。ユーゴスラビアからの独立は、ここで宣言された。広場とそのまわりの像・噴水・柱の並ぶ建物の多くは、2010〜2014年の「スコピエ2014」計画で建ったもの。136の建造物に、見積もりで8,000万〜5億ユーロがかかり、費用と歴史の描きかたをめぐって国の中でも評判が割れている。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9F%D0%BB%D0%BE%D1%88%D1%82%D0%B0%D0%B4+%D0%9C%D0%B0%D0%BA%D0%B5%D0%B4%D0%BE%D0%BD%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "square-statues"
    ],
    "src": [
     {
      "name": "Wikipedia「Macedonia Square, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Macedonia_Square,_Skopje",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Skopje 2014」",
      "url": "https://en.wikipedia.org/wiki/Skopje_2014",
      "seen": "2026-11-14"
     }
    ],
    "went": {
     "date": "2026-10-15",
     "scene": {
      "v": "CKJvprUMOgA",
      "t": 690,
      "date": "2026-10-15"
     },
     "story": [
      "広場の噴水は、あやとがこれまで見た中でいちばん大きいかもしれないほど。銅像の並ぶ橋には、橋だけで20体はいて、30体ほどいそうだった。"
     ],
     "short": "frcgM9wiRr8"
    },
    "area": "square"
   },
   {
    "id": "fortress",
    "name": "スコピエ城塞（カレ）",
    "local": {
     "text": "Скопско кале",
     "lang": "mk",
     "roman": "Skopsko kale"
    },
    "rank": 1,
    "pic": {
     "src": "/travel/north-macedonia/skopje/fortress-960.webp",
     "small": "/travel/north-macedonia/skopje/fortress-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "スコピエ城塞の石の塔と城壁（2026年10月18日）",
     "kind": "card",
     "date": "2026-10-18"
    },
    "body": "旧市街の上、街でいちばん高い所からヴァルダル川を見下ろす城塞。最初の砦は6世紀に、ローマの町の石を使って築かれた。石橋と並んで、街の紋章と旗に描かれている。",
    "facts": [
     {
      "label": "入場",
      "text": "ただ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%BA%D0%BE%D0%BF%D1%81%D0%BA%D0%BE+%D0%BA%D0%B0%D0%BB%D0%B5+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "kale"
    ],
    "src": [
     {
      "name": "Wikipedia「Skopje Fortress」",
      "url": "https://en.wikipedia.org/wiki/Skopje_Fortress",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-18",
     "scene": {
      "v": "TDArug_te90",
      "t": 2220,
      "date": "2026-10-18"
     },
     "story": [
      "入口で料金はかからず、そのまま中に入れた。"
     ],
     "short": "ieMGyM2QjCA"
    },
    "area": "carsija"
   },
   {
    "id": "clement",
    "name": "聖クリメント・オフリド大聖堂",
    "local": {
     "text": "Соборна црква „Св. Климент Охридски“",
     "lang": "mk",
     "roman": "Soborna crkva Sv. Kliment Ohridski"
    },
    "rank": 2,
    "pic": {
     "src": "/travel/north-macedonia/skopje/clement-960.webp",
     "small": "/travel/north-macedonia/skopje/clement-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "聖クリメント・オフリド大聖堂。丸屋根が重なる外観と噴水（2026年10月20日）",
     "kind": "card",
     "date": "2026-10-20"
    },
    "body": "マケドニア正教会でいちばん大きな大聖堂。1972年に建てはじめ、1990年8月12日に聖別された。丸屋根とアーチだけでできた、36m四方の円堂。主の丸屋根のキリストの壁画は70m²、目の長さが1.5mある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%B2.+%D0%9A%D0%BB%D0%B8%D0%BC%D0%B5%D0%BD%D1%82+%D0%9E%D1%85%D1%80%D0%B8%D0%B4%D1%81%D0%BA%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "debar-maalo-night"
    ],
    "src": [
     {
      "name": "Wikipedia「Church of St. Clement of Ohrid」",
      "url": "https://en.wikipedia.org/wiki/Church_of_St._Clement_of_Ohrid",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-20",
     "scene": {
      "v": "DNLVmUpew48",
      "t": 6360,
      "date": "2026-10-20"
     },
     "story": [
      "大聖堂は大きく、現代建築のような見た目だった。中は礼拝の最中で、観光客は誰もおらず、みんなが真剣。あやとはじっと様子を見てから、いったん外へ出た。"
     ]
    },
    "area": "square"
   },
   {
    "id": "museum",
    "name": "スコピエ市博物館（旧駅舎）と、1963年の地震",
    "local": {
     "text": "Музеј на град Скопје",
     "lang": "mk",
     "roman": "Muzej na grad Skopje"
    },
    "rank": 2,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Antigua_estaci%C3%B3n_de_ferrocarril%2C_Skopie%2C_Macedonia%2C_2014-04-17%2C_DD_15.JPG/960px-Antigua_estaci%C3%B3n_de_ferrocarril%2C_Skopie%2C_Macedonia%2C_2014-04-17%2C_DD_15.JPG",
     "alt": "地震で半分が壊れたまま残る旧駅舎（いまはスコピエ市博物館）",
     "kind": "photo",
     "credit": {
      "by": "Diego Delso",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Antigua_estaci%C3%B3n_de_ferrocarril%2C_Skopie%2C_Macedonia%2C_2014-04-17%2C_DD_15.JPG"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Antigua_estaci%C3%B3n_de_ferrocarril%2C_Skopie%2C_Macedonia%2C_2014-04-17%2C_DD_15.JPG/500px-Antigua_estaci%C3%B3n_de_ferrocarril%2C_Skopie%2C_Macedonia%2C_2014-04-17%2C_DD_15.JPG"
    },
    "body": "1963年7月26日の朝5時17分、マグニチュード6.1の地震で街の約8割が壊れ、1,000人以上が亡くなった。博物館は、そのとき大きく壊れた旧駅舎の、残った3分の1に1970年から入っていて、紀元前3000年ごろからの街の歴史を並べている。駅舎の時計は、地震の時刻で止まったまま。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9C%D1%83%D0%B7%D0%B5%D1%98+%D0%BD%D0%B0+%D0%B3%D1%80%D0%B0%D0%B4+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikipedia「1963 Skopje earthquake」",
      "url": "https://en.wikipedia.org/wiki/1963_Skopje_earthquake",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Museum of the City of Skopje」",
      "url": "https://en.wikipedia.org/wiki/Museum_of_the_City_of_Skopje",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Antigua_estaci%C3%B3n_de_ferrocarril%2C_Skopie%2C_Macedonia%2C_2014-04-17%2C_DD_15.JPG",
      "seen": "2026-11-15"
     }
    ],
    "area": "newtown"
   },
   {
    "id": "teresa",
    "name": "マザー・テレサ記念館",
    "local": {
     "text": "Спомен-куќа на Мајка Тереза",
     "lang": "mk",
     "roman": "Spomen-kukja na Majka Tereza"
    },
    "rank": 2,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Memorial_House_of_Mother_Teresa.jpg/960px-Memorial_House_of_Mother_Teresa.jpg",
     "alt": "マザー・テレサ記念館の外観",
     "kind": "photo",
     "credit": {
      "by": "kallerna",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Memorial_House_of_Mother_Teresa.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Memorial_House_of_Mother_Teresa.jpg/500px-Memorial_House_of_Mother_Teresa.jpg"
    },
    "body": "マザー・テレサは、1910年から1928年までスコピエで暮らした。記念館は、彼女が洗礼を受けた聖堂の跡に建ち、2009年1月に開いた。マケドニア広場のすぐ東。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "9:00〜20:00（土日は14:00まで）"
     },
     {
      "label": "入場",
      "text": "ただ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%BF%D0%BE%D0%BC%D0%B5%D0%BD+%D0%BA%D1%83%D1%9C%D0%B0+%D0%BD%D0%B0+%D0%9C%D0%B0%D1%98%D0%BA%D0%B0+%D0%A2%D0%B5%D1%80%D0%B5%D0%B7%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Memorial House of Mother Teresa」",
      "url": "https://en.wikipedia.org/wiki/Memorial_House_of_Mother_Teresa",
      "seen": "2026-11-14"
     },
     {
      "name": "In Your Pocket（Mother Teresa Memorial House）",
      "url": "https://www.inyourpocket.com/mother-teresa-memorial-house_150514v",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Memorial_House_of_Mother_Teresa.jpg",
      "seen": "2026-11-15"
     }
    ],
    "area": "square"
   },
   {
    "id": "porta",
    "name": "マケドニア門（ポルタ・マケドニヤ）",
    "local": {
     "text": "Порта Македонија",
     "lang": "mk",
     "roman": "Porta Makedonija"
    },
    "rank": 3,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Porta_Macedonia%2C_Skopie%2C_Macedonia_del_Norte%2C_2014-04-16%2C_DD_105.jpg/960px-Porta_Macedonia%2C_Skopie%2C_Macedonia_del_Norte%2C_2014-04-16%2C_DD_105.jpg",
     "alt": "白い大理石の凱旋門、マケドニア門",
     "kind": "photo",
     "credit": {
      "by": "Diego Delso",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Porta_Macedonia%2C_Skopie%2C_Macedonia_del_Norte%2C_2014-04-16%2C_DD_105.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Porta_Macedonia%2C_Skopie%2C_Macedonia_del_Norte%2C_2014-04-16%2C_DD_105.jpg/500px-Porta_Macedonia%2C_Skopie%2C_Macedonia_del_Norte%2C_2014-04-16%2C_DD_105.jpg"
    },
    "body": "独立20年を記念して2012年1月にできた凱旋門。高さ21m、費用は440万ユーロ。外側は大理石の浮き彫りで覆われ、中の階段とエレベーターで屋上まで上がれる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9F%D0%BE%D1%80%D1%82%D0%B0+%D0%9C%D0%B0%D0%BA%D0%B5%D0%B4%D0%BE%D0%BD%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "square-statues"
    ],
    "src": [
     {
      "name": "Wikipedia「Porta Macedonia」",
      "url": "https://en.wikipedia.org/wiki/Porta_Macedonia",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Porta_Macedonia%2C_Skopie%2C_Macedonia_del_Norte%2C_2014-04-16%2C_DD_105.jpg",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-17",
     "scene": {
      "v": "hk39U7ZEKCQ",
      "t": 4860,
      "date": "2026-10-17"
     },
     "story": [
      "新市街を探して歩いていて、凱旋門とナポレオン風の騎馬像のある広場に出たところで、ここが新市街だと気づいた。"
     ]
    },
    "area": "square"
   },
   {
    "id": "kursumli",
    "name": "クルシュムリ・アン（隊商宿）",
    "local": {
     "text": "Куршумли ан",
     "lang": "mk",
     "roman": "Kuršumli an"
    },
    "rank": 3,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Kurshumli-An-Skopje-MK.JPG/960px-Kurshumli-An-Skopje-MK.JPG",
     "alt": "石とれんがの回廊に囲まれた、クルシュムリ・アンの中庭",
     "kind": "photo",
     "credit": {
      "by": "Македонец",
      "lic": "CC BY 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Kurshumli-An-Skopje-MK.JPG"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Kurshumli-An-Skopje-MK.JPG/500px-Kurshumli-An-Skopje-MK.JPG"
    },
    "body": "15〜16世紀に建った、オスマン時代の隊商宿。屋根の丸屋根はもとは鉛で葺かれていて、それが名前（鉛の宿）になった。厩には馬が100頭入り、宿にも牢にも使われた。旧市街の中。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D1%83%D1%80%D1%88%D1%83%D0%BC%D0%BB%D0%B8+%D0%B0%D0%BD+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "carsija-walk"
    ],
    "src": [
     {
      "name": "Wikipedia「Kuršumli An」",
      "url": "https://en.wikipedia.org/wiki/Kur%C5%A1umli_An",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Kurshumli-An-Skopje-MK.JPG",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "mosque",
    "name": "ムスタファ・パシャ・モスク",
    "local": {
     "text": "Мустафа-пашина џамија",
     "lang": "mk",
     "roman": "Mustafa-pašina džamija"
    },
    "rank": 3,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Blue_dome_and_sky_%2828449231727%29.jpg/960px-Blue_dome_and_sky_%2828449231727%29.jpg",
     "alt": "ムスタファ・パシャ・モスクの、青い空の下の丸屋根",
     "kind": "photo",
     "credit": {
      "by": "aiva.",
      "lic": "CC BY 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Blue_dome_and_sky_%2828449231727%29.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Blue_dome_and_sky_%2828449231727%29.jpg/500px-Blue_dome_and_sky_%2828449231727%29.jpg"
    },
    "body": "旧市街の上の台地に、1492年に建ったモスク。建てたのは、のちにセリム1世の宰相になるムスタファ・パシャ。建ったときの姿を、ほぼそのまま残している。",
    "facts": [
     {
      "label": "入場",
      "text": "ただ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9C%D1%83%D1%81%D1%82%D0%B0%D1%84%D0%B0+%D0%BF%D0%B0%D1%88%D0%B8%D0%BD%D0%B0+%D1%9F%D0%B0%D0%BC%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "carsija-walk"
    ],
    "src": [
     {
      "name": "Wikipedia「Mustafa Pasha Mosque」",
      "url": "https://en.wikipedia.org/wiki/Mustafa_Pasha_Mosque",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Blue_dome_and_sky_%2828449231727%29.jpg",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "vardar",
    "name": "ヴァルダル川の岸",
    "local": {
     "text": "Вардар",
     "lang": "mk",
     "roman": "Vardar"
    },
    "rank": 3,
    "pic": {
     "src": "/travel/north-macedonia/skopje/ship-960.webp",
     "small": "/travel/north-macedonia/skopje/ship-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "スコピエの川沿い。川に浮かぶ木の帆船（2026年10月12日）",
     "kind": "card",
     "date": "2026-10-12"
    },
    "body": "北マケドニアでいちばん長い川（388km）。ギリシャに入るとアクシオス川と名を変え、テッサロニキでエーゲ海に注ぐ。スコピエでは、この川を境に旧市街と広場が向かい合う。川沿いには、自転車道と歩道・公園・カフェの並ぶ岸辺の道がある。",
    "facts": [],
    "src": [
     {
      "name": "Wikipedia「Vardar」",
      "url": "https://en.wikipedia.org/wiki/Vardar",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikivoyage「Skopje/Outer Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Outer_Skopje",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "NY9pzYrA-5o",
      "t": 2940,
      "date": "2026-10-12"
     },
     "story": [
      "着いた日に川沿いを歩くと、川が臭くない。船が何隻も泊まっていた。あやとは、川の匂いでその国のインフラが分かると話した。"
     ]
    }
   },
   {
    "id": "frescoes",
    "name": "壁画だらけの正教会（名前は確かめていない）",
    "pic": {
     "src": "/travel/north-macedonia/skopje/frescoes-960.webp",
     "small": "/travel/north-macedonia/skopje/frescoes-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "正教会の中。金色のシャンデリアと壁一面の絵（2026年10月17日）",
     "kind": "card",
     "date": "2026-10-17"
    },
    "body": "",
    "facts": [],
    "src": [],
    "went": {
     "date": "2026-10-17",
     "scene": {
      "v": "hk39U7ZEKCQ",
      "t": 3420,
      "date": "2026-10-17"
     },
     "story": [
      "あやとが10月17日に入った、壁一面に絵が続く正教会。色合いがきれいにまとまっていて、今まで見た中でいちばんだと言った。"
     ],
     "say": "絵画が無限。無限絵画です"
    }
   },
   {
    "id": "terrace",
    "name": "テラスのカフェが並ぶ通り（場所は確かめていない）",
    "pic": {
     "src": "/travel/north-macedonia/skopje/terrace-960.webp",
     "small": "/travel/north-macedonia/skopje/terrace-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "スコピエの、テラス席のあるカフェが並ぶ通り（2026年10月27日）",
     "kind": "card",
     "date": "2026-10-27"
    },
    "body": "",
    "facts": [],
    "src": [],
    "went": {
     "date": "2026-10-27",
     "scene": {
      "v": "_XzkJJIvpOE",
      "t": 2490,
      "date": "2026-10-27"
     },
     "story": [
      "あやとが「おしゃれ地区」と呼んだ通り。テラス席のカフェと中東風のパン屋がぽつぽつ並び、飲食店が多かった。"
     ]
    }
   },
   {
    "id": "bit-pazar",
    "name": "ビト・パザル（市場）",
    "local": {
     "text": "Бит-пазар",
     "lang": "mk",
     "roman": "Bit-pazar"
    },
    "rank": 2,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Bit_Pazar%2C_Skopje_2.jpg/960px-Bit_Pazar%2C_Skopje_2.jpg",
     "alt": "旧市街の北の市場、ビト・パザル",
     "kind": "photo",
     "credit": {
      "by": "Resnjari",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Bit_Pazar%2C_Skopje_2.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Bit_Pazar%2C_Skopje_2.jpg/500px-Bit_Pazar%2C_Skopje_2.jpg"
    },
    "body": "街でいちばん大きな食べ物の市場。旧市街の終わる所から始まり、何百年も同じ場所にある。果物・野菜・サラダ・チーズ・お茶・香辛料・花が並ぶ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%91%D0%B8%D1%82+%D0%BF%D0%B0%D0%B7%D0%B0%D1%80+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "carsija-walk"
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Bit_Pazar%2C_Skopje_2.jpg",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "sv-spas",
    "name": "聖スパス教会（救世主教会）",
    "local": {
     "text": "Црква „Св. Спас“",
     "lang": "mk",
     "roman": "Crkva Sv. Spas"
    },
    "rank": 2,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Sv_Spas.jpg/960px-Sv_Spas.jpg",
     "alt": "聖スパス教会（救世主教会）の外観",
     "kind": "photo",
     "credit": {
      "by": "Nikolovskii",
      "lic": "CC BY-SA 2.0",
      "page": "https://commons.wikimedia.org/wiki/File:Sv_Spas.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Sv_Spas.jpg/500px-Sv_Spas.jpg"
    },
    "body": "旧市街でいちばん大事な教会。オスマンの決まりで外は飾らず、床を地面より1m以上低くして建てた。中の木彫りのイコン壁で知られ、中庭に国の英雄ゴツェ・デルチェフの石棺がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%B2.+%D0%A1%D0%BF%D0%B0%D1%81+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "carsija-walk"
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Church of the Ascension of Jesus, Skopje」",
      "url": "https://en.wikipedia.org/wiki/Church_of_the_Ascension_of_Jesus,_Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Sv_Spas.jpg",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "clock-tower",
    "name": "時計塔（サアト・クラ）",
    "local": {
     "text": "Саат-кула",
     "lang": "mk",
     "roman": "Saat-kula"
    },
    "rank": 3,
    "body": "1572年に建った六角形の塔で、オスマン帝国で最初の時計塔とされる。上まで105段。時計は1963年の地震のあとの混乱でなくなった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%B0%D0%B0%D1%82+%D0%BA%D1%83%D0%BB%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "carsija-walk"
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "sultan-murat",
    "name": "スルタン・ムラト・モスク",
    "local": {
     "text": "Султан-муратова џамија",
     "lang": "mk",
     "roman": "Sultan-muratova džamija"
    },
    "rank": 3,
    "body": "1436年に建った、バルカンで残るいちばん古いモスクかもしれないとされるモスク。国でも指折りの大きさ。時計塔のとなり。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D1%83%D0%BB%D1%82%D0%B0%D0%BD+%D0%9C%D1%83%D1%80%D0%B0%D1%82+%D1%9F%D0%B0%D0%BC%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "daut-pasha",
    "name": "ダウト・パシャ・ハマム（国立美術館）",
    "local": {
     "text": "Даут-пашин амам",
     "lang": "mk",
     "roman": "Daut-pašin amam"
    },
    "rank": 3,
    "body": "15世紀後半の大浴場で、男湯と女湯が並ぶ。いまは19〜20世紀の美術の国立美術館で、丸屋根の内側の飾りだけでも見る価値がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%94%D0%B0%D1%83%D1%82+%D0%BF%D0%B0%D1%88%D0%B8%D0%BD+%D0%B0%D0%BC%D0%B0%D0%BC+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "area": "carsija"
   },
   {
    "id": "archaeology",
    "name": "考古学博物館",
    "local": {
     "text": "Музеј на археологија",
     "lang": "mk",
     "roman": "Muzej na arheologija"
    },
    "rank": 3,
    "body": "川に面した新しいギリシャ風の建物に、6,000点を超える収蔵品。近くのスクピで見つかったヴィーナス像が目玉。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "火〜日 10:00〜18:00（Wikivoyage の2016年の情報）"
     },
     {
      "label": "入場",
      "text": "300デナル（約860円）、学生150デナル（Wikivoyage の2016年の値段）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%90%D1%80%D1%85%D0%B5%D0%BE%D0%BB%D0%BE%D1%88%D0%BA%D0%B8+%D0%BC%D1%83%D0%B7%D0%B5%D1%98+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ],
    "area": "square"
   },
   {
    "id": "holocaust",
    "name": "マケドニアのユダヤ人のホロコースト記念センター",
    "local": {
     "text": "Меморијален центар на холокаустот на Евреите од Македонија",
     "lang": "mk",
     "roman": "Memorijalen centar na holokaustot"
    },
    "rank": 3,
    "body": "ホロコーストまでユダヤ人の街区だった所に建つ。殺された7,148人のマケドニアのユダヤ人を悼み、トレブリンカへ運んだ貨車などを並べる。",
    "facts": [
     {
      "label": "開いている時間",
      "text": "火〜金 9:00〜19:00、土日 9:00〜15:00、月曜休み（Wikivoyage の2016年の情報）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A5%D0%BE%D0%BB%D0%BE%D0%BA%D0%B0%D1%83%D1%81%D1%82+%D0%BC%D0%B5%D0%BC%D0%BE%D1%80%D0%B8%D1%98%D0%B0%D0%BB%D0%B5%D0%BD+%D1%86%D0%B5%D0%BD%D1%82%D0%B0%D1%80+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ],
    "area": "square"
   },
   {
    "id": "struggle",
    "name": "マケドニア闘争博物館",
    "local": {
     "text": "Музеј на македонската борба",
     "lang": "mk",
     "roman": "Muzej na makedonskata borba"
    },
    "rank": 3,
    "body": "オスマン時代から1990年代の独立までの闘いを、たくさんの蝋人形でたどる博物館。独立20年の2011年に開いた。案内つきで回る。",
    "facts": [
     {
      "label": "入場",
      "text": "300デナル（約860円。Wikivoyage の2016年の値段）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9C%D1%83%D0%B7%D0%B5%D1%98+%D0%BD%D0%B0+%D0%BC%D0%B0%D0%BA%D0%B5%D0%B4%D0%BE%D0%BD%D1%81%D0%BA%D0%B0%D1%82%D0%B0+%D0%B1%D0%BE%D1%80%D0%B1%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ],
    "area": "square"
   },
   {
    "id": "st-pantaleon",
    "name": "聖パンテレイモン修道院（ゴルノ・ネレジ）",
    "local": {
     "text": "Црква „Св. Пантелејмон“",
     "lang": "mk",
     "roman": "Crkva Sv. Pantelejmon"
    },
    "rank": 2,
    "body": "ヴォドノ山の中腹の村にある1164年の教会。ビザンツのコムネノス朝の壁画が多く残り、その1場面は50デナル札にも描かれている。街を見わたす場所にある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%B2.+%D0%9F%D0%B0%D0%BD%D1%82%D0%B5%D0%BB%D0%B5%D1%98%D0%BC%D0%BE%D0%BD+%D0%93%D0%BE%D1%80%D0%BD%D0%BE+%D0%9D%D0%B5%D1%80%D0%B5%D0%B7%D0%B8&hl=ja",
    "todo": [
     "vodno"
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Karpoš」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Karpo%C5%A1",
      "seen": "2026-11-15"
     }
    ],
    "line": "中心から5.2km",
    "area": "vodno"
   },
   {
    "id": "millennium-cross",
    "name": "ミレニアム・クロス（ヴォドノ山）",
    "local": {
     "text": "Милениумски крст",
     "lang": "mk",
     "roman": "Mileniumski krst"
    },
    "rank": 2,
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Millennium_Cross_Vodno_2025_3.jpg/960px-Millennium_Cross_Vodno_2025_3.jpg",
     "alt": "ヴォドノ山の頂に立つ、白い鉄骨のミレニアム・クロス",
     "kind": "photo",
     "credit": {
      "by": "kallerna",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Millennium_Cross_Vodno_2025_3.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Millennium_Cross_Vodno_2025_3.jpg/500px-Millennium_Cross_Vodno_2025_3.jpg"
    },
    "body": "街の南西にそびえるヴォドノ山（1,066m）の頂に、高さ66mの十字架が2002年に建った。北マケドニアのキリスト教2000年の記念で、街を見わたす展望の場所になっている。中腹（標高557m）までバスが通い、そこから頂上へは2011年からロープウェイがある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9C%D0%B8%D0%BB%D0%B5%D0%BD%D0%B8%D1%83%D0%BC%D1%81%D0%BA%D0%B8+%D0%BA%D1%80%D1%81%D1%82+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "todo": [
     "vodno"
    ],
    "src": [
     {
      "name": "Wikipedia「Vodno」",
      "url": "https://en.wikipedia.org/wiki/Vodno",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Millennium Cross」",
      "url": "https://en.wikipedia.org/wiki/Millennium_Cross",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Millennium_Cross_Vodno_2025_3.jpg",
      "seen": "2026-11-15"
     }
    ],
    "line": "中心から4.6km",
    "area": "vodno"
   },
   {
    "id": "aqueduct",
    "name": "スコピエ水道橋",
    "local": {
     "text": "Скопски аквадукт",
     "lang": "mk",
     "roman": "Skopski akvadukt"
    },
    "rank": 3,
    "body": "街の北のヴィズベゴヴォ村にある、国でただ一つの水道橋の遺跡。いつ建ったかは分かっていない。55のアーチが386m残る。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%BA%D0%BE%D0%BF%D1%81%D0%BA%D0%B8+%D0%B0%D0%BA%D0%B2%D0%B0%D0%B4%D1%83%D0%BA%D1%82&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Outer Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Outer_Skopje",
      "seen": "2026-11-15"
     }
    ],
    "line": "中心から3.1km"
   },
   {
    "id": "matka",
    "name": "マトカ渓谷",
    "local": {
     "text": "Матка",
     "lang": "mk",
     "roman": "Matka"
    },
    "rank": 1,
    "pic": {
     "src": "/travel/north-macedonia/skopje/matka-960.webp",
     "small": "/travel/north-macedonia/skopje/matka-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "マトカ渓谷。岩山のあいだの湖と、紅葉の木（2026年10月24日）",
     "kind": "card",
     "date": "2026-10-24"
    },
    "body": "スコピエの中心から西にある、約5,000haの渓谷。国でいちばん古い人造湖があり、洞窟が10（いちばん長いもので176m）と、中世の修道院がいくつも残る。トレスカ川のカヤックも人気で、山歩きの季節は復活祭のころから11月まで。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D0%B0%D1%9A%D0%BE%D0%BD+%D0%9C%D0%B0%D1%82%D0%BA%D0%B0&hl=ja",
    "todo": [
     "matka"
    ],
    "src": [
     {
      "name": "Wikipedia「Matka Canyon」",
      "url": "https://en.wikipedia.org/wiki/Matka_Canyon",
      "seen": "2026-11-14"
     }
    ],
    "went": {
     "date": "2026-10-24",
     "scene": {
      "v": "eHBAnQF56-E",
      "t": 4860,
      "date": "2026-10-24"
     },
     "story": [
      "岩山と紅葉と川が一度に見えて、水が澄んでいた。川の水に手を入れると、冷たかった。"
     ]
    },
    "line": "中心から12km"
   }
  ],
  "far": [
   {
    "id": "st-pantaleon",
    "name": "聖パンテレイモン修道院",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%B2.+%D0%9F%D0%B0%D0%BD%D1%82%D0%B5%D0%BB%D0%B5%D1%98%D0%BC%D0%BE%D0%BD+%D0%93%D0%BE%D1%80%D0%BD%D0%BE+%D0%9D%D0%B5%D1%80%D0%B5%D0%B7%D0%B8&hl=ja",
    "km": 5.2
   },
   {
    "id": "millennium-cross",
    "name": "ミレニアム・クロス",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9C%D0%B8%D0%BB%D0%B5%D0%BD%D0%B8%D1%83%D0%BC%D1%81%D0%BA%D0%B8+%D0%BA%D1%80%D1%81%D1%82+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "km": 4.6
   },
   {
    "id": "aqueduct",
    "name": "スコピエ水道橋",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%BA%D0%BE%D0%BF%D1%81%D0%BA%D0%B8+%D0%B0%D0%BA%D0%B2%D0%B0%D0%B4%D1%83%D0%BA%D1%82&hl=ja",
    "km": 3.1
   },
   {
    "id": "matka",
    "name": "マトカ渓谷",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D0%B0%D1%9A%D0%BE%D0%BD+%D0%9C%D0%B0%D1%82%D0%BA%D0%B0&hl=ja",
    "km": 12
   }
  ]
 },
 "eat": {
  "kinds": [
   {
    "id": "breakfast",
    "label": "朝ごはん"
   },
   {
    "id": "local",
    "label": "ローカルの料理"
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
    "id": "tavche",
    "name": "タヴチェ・グラフチェ（豆の土鍋焼き）",
    "local": {
     "text": "Тавче гравче",
     "lang": "mk",
     "roman": "Tavče gravče"
    },
    "pic": {
     "src": "/travel/north-macedonia/skopje/kosmos-beans-960.webp",
     "small": "/travel/north-macedonia/skopje/kosmos-beans-480.webp",
     "w": 720,
     "h": 720,
     "alt": "食堂コスモスの豆の煮込み（2026年10月14日）",
     "kind": "card",
     "date": "2026-10-14"
    },
    "body": "北マケドニアの国民食とされる豆の料理。素焼きの土鍋（タヴァ）に入れて焼き、そのまま出てくる。名前は「タヴァに入った豆」。テトヴォ風が人気。",
    "facts": [
     {
      "label": "どこで",
      "text": "コスモス（旧市街の食堂）・オールド・ハウス（1836年の家の食堂）・スコプスキ・メラク"
     },
     {
      "label": "豚肉",
      "text": "豆の料理だが、燻製の豚肉やベーコンなどの干し肉を足す作りもある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A2%D0%B0%D0%B2%D1%87%D0%B5+%D0%B3%D1%80%D0%B0%D0%B2%D1%87%D0%B5+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "kosmos",
     "old-house",
     "merak"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Tavče gravče」",
      "url": "https://en.wikipedia.org/wiki/Tav%C4%8De_grav%C4%8De",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:%D0%93%D1%80%D0%B0%D0%B2_%D0%B2%D0%BE_%D1%82%D0%B0%D0%B2%D0%B0(%D1%82%D0%B0%D1%84%D1%87%D0%B5_%D0%B3%D1%80%D0%B0%D0%B2%D1%87%D0%B5)_(3).jpg",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-14",
     "scene": {
      "v": "UQdkUSro9Ck",
      "t": 4470,
      "date": "2026-10-14"
     },
     "story": [
      "あやとは10月14日にコスモスで、トマトとチーズでクリーミーな、大きい豆の甘い煮込みを食べた。11月9日に宿のキッチンでタヴチェ・グラフチェを作ったとき、コスモスのはもっとクリーミーだったと比べた。"
     ],
     "say": "これ当たり。すごい当たり"
    }
   },
   {
    "id": "kebapi",
    "name": "ケバピ（チェバピ）",
    "local": {
     "text": "Ќебапи",
     "lang": "mk",
     "roman": "Ḱebapi"
    },
    "pic": {
     "src": "/travel/north-macedonia/skopje/kosmos-cevapi-960.webp",
     "small": "/travel/north-macedonia/skopje/kosmos-cevapi-480.webp",
     "w": 672,
     "h": 672,
     "alt": "食堂コスモスのチェバピ5本（2026年10月14日）",
     "kind": "card",
     "date": "2026-10-14"
    },
    "body": "ひき肉を指ほどの棒にして、炭火で焼いたもの。5〜10本を皿かパンにのせ、刻んだ玉ねぎを添えて出す。旧ユーゴスラビアの国々で広く食べられ、牛だけで作る国もあれば、豚や羊を混ぜる国もある。ブルガリアや北マケドニアのケバプチェは、豚と牛を混ぜることが多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "デスタン（旧市街）・コスモス（旧市街の食堂）"
     },
     {
      "label": "豚肉",
      "text": "豚と牛を混ぜることが多い。豚だけの作りもあり、牛だけで作る国もある。店で違う。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%8C%D0%B5%D0%B1%D0%B0%D0%BF%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "destan",
     "kosmos"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "flags": {
     "pork": true
    },
    "src": [
     {
      "name": "Wikipedia「Ćevapi」",
      "url": "https://en.wikipedia.org/wiki/%C4%86evapi",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Kebapche」",
      "url": "https://en.wikipedia.org/wiki/Kebapche",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-14",
     "scene": {
      "v": "UQdkUSro9Ck",
      "t": 4290,
      "date": "2026-10-14"
     },
     "story": [
      "食堂コスモスで頼んだチェバピは、炭の匂いをまとっていて、肉汁が広がった。あやとのたとえは、バーベキューで焼いたソーセージ。"
     ],
     "short": "IZpZGM5Xbyg"
    }
   },
   {
    "id": "burek",
    "name": "ブレク",
    "local": {
     "text": "Бурек",
     "lang": "mk",
     "roman": "Burek"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Burek.png/960px-Burek.png",
     "alt": "渦巻きに焼いたパイ、ブレク",
     "kind": "photo",
     "credit": {
      "by": "Popo le Chien",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Burek.png"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Burek.png/500px-Burek.png"
    },
    "body": "薄い生地を重ねて焼いたパイ。中身はチーズ・ひき肉・ほうれん草・じゃがいもなど。バルカンでは、ヨーグルトの飲み物と一緒に食べることが多い。",
    "facts": [
     {
      "label": "どこで",
      "text": "ブレクの店（旧市街）・ブレク・カイ・クキ（デバル・マーロ）・長距離バスターミナルの売店"
     },
     {
      "label": "豚肉",
      "text": "中身はチーズ・ひき肉・ほうれん草・じゃがいもなどで、店と種類で違う。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%91%D1%83%D1%80%D0%B5%D0%BA+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "burek-carsija",
     "burek-kuki",
     "bus-station"
    ],
    "kinds": [
     "breakfast",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Börek」",
      "url": "https://en.wikipedia.org/wiki/B%C3%B6rek",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Burek.png",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "shopska",
    "name": "ショプスカ・サラダ",
    "local": {
     "text": "Шопска салата",
     "lang": "mk",
     "roman": "Šopska salata"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Chopska.jpg/960px-Chopska.jpg",
     "alt": "刻んだトマトときゅうりに、白いチーズをかけたショプスカ・サラダ",
     "kind": "photo",
     "credit": {
      "by": "Popo le Chien",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Chopska.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Chopska.jpg/500px-Chopska.jpg"
    },
    "body": "トマト・きゅうり・玉ねぎ・ピーマンに、白いチーズをたっぷり削ってかけたサラダ。もとはブルガリアの国民食で、南東ヨーロッパで広く食べられている。",
    "facts": [
     {
      "label": "どこで",
      "text": "スコプスキ・メラク・ゴスティルニツァ DM"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A8%D0%BE%D0%BF%D1%81%D0%BA%D0%B0+%D1%81%D0%B0%D0%BB%D0%B0%D1%82%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "merak",
     "dm"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Shopska salad」",
      "url": "https://en.wikipedia.org/wiki/Shopska_salad",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Chopska.jpg",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "pastrmajlija",
    "name": "パストルマイリヤ",
    "local": {
     "text": "Пастрмајлија",
     "lang": "mk",
     "roman": "Pastrmajlija"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/PastrmajlijaAngela.JPG/960px-PastrmajlijaAngela.JPG",
     "alt": "楕円のパン生地に角切りの肉をのせて焼いた、パストルマイリヤ",
     "kind": "photo",
     "credit": {
      "by": "Slavica Panova",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:PastrmajlijaAngela.JPG"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/PastrmajlijaAngela.JPG/500px-PastrmajlijaAngela.JPG"
    },
    "body": "楕円のパン生地に、角切りの肉をのせて焼いたもの。名前は、塩漬けにして干した羊肉（パストルマ）から。卵やチーズをのせることもある。東部のシュティプで人気で、毎年お祭りも開かれる。燻製や干した豚肉・鶏肉を使う作りもある。",
    "facts": [
     {
      "label": "どこで",
      "text": "パストルマイリヤ＆グリル・ハウス"
     },
     {
      "label": "豚肉",
      "text": "名前は干した羊肉から来ているが、燻製や干した豚肉を使う作りもある。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9F%D0%B0%D1%81%D1%82%D1%80%D0%BC%D0%B0%D1%98%D0%BB%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "pastrmajlija-house"
    ],
    "kinds": [
     "local"
    ],
    "flags": {
     "pork": true
    },
    "src": [
     {
      "name": "Wikipedia「Pastrmajlija」",
      "url": "https://en.wikipedia.org/wiki/Pastrmajlija",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:PastrmajlijaAngela.JPG",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "selsko-meso",
    "name": "セルスコ・メソ（村の肉の土鍋煮）",
    "local": {
     "text": "Селско месо",
     "lang": "mk",
     "roman": "Selsko meso"
    },
    "body": "豚肉ときのこを土鍋で煮込んだ料理。玉ねぎ・燻製の肉・ひき肉・トマト・チーズ・ピーマン・ワインを入れる。ブルガリアでも食べる。",
    "facts": [
     {
      "label": "どこで",
      "text": "オールド・ハウス（1836年の家の食堂）・スコプスキ・メラク"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%B5%D0%BB%D1%81%D0%BA%D0%BE+%D0%BC%D0%B5%D1%81%D0%BE+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "old-house",
     "merak"
    ],
    "kinds": [
     "local"
    ],
    "flags": {
     "pork": true
    },
    "src": [
     {
      "name": "Wikipedia「Selsko meso」",
      "url": "https://en.wikipedia.org/wiki/Selsko_meso",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "polneti-piperki",
    "name": "ポルネティ・ピペルキ（ピーマンの詰めもの）",
    "local": {
     "text": "Полнети пиперки",
     "lang": "mk",
     "roman": "Polneti piperki"
    },
    "body": "ピーマンに米、または米とひき肉を詰めた料理。",
    "facts": [
     {
      "label": "どこで",
      "text": "オールド・ハウス（1836年の家の食堂）・スコプスキ・メラク"
     },
     {
      "label": "豚肉",
      "text": "米だけのものと、米とひき肉のものがある。ひき肉の種類は店で違う。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9F%D0%BE%D0%BB%D0%BD%D0%B5%D1%82%D0%B8+%D0%BF%D0%B8%D0%BF%D0%B5%D1%80%D0%BA%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "old-house",
     "merak"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "doner",
    "name": "ドネル・ケバブ",
    "local": {
     "text": "Донер",
     "lang": "mk",
     "roman": "Doner"
    },
    "body": "縦に回る串に重ねた肉を焼き、外側から薄くそいで出すトルコの料理。回る串はオスマン帝国で19世紀に生まれた。",
    "facts": [
     {
      "label": "どこで",
      "text": "ハムザ・ドネル（旧市街）"
     },
     {
      "label": "豚肉",
      "text": "肉の種類は店で違う。ハムザの肉は確かめていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%94%D0%BE%D0%BD%D0%B5%D1%80+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "hamza"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Doner kebab」",
      "url": "https://en.wikipedia.org/wiki/Doner_kebab",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-18",
     "scene": {
      "v": "TDArug_te90",
      "t": 10230,
      "date": "2026-10-18"
     },
     "story": [
      "旧市街で先に入ったケバブ屋は1個1,500円、チェーン店も単品で約800円で、あやとはどちらも見送ってハムザへ行った。辛さを聞かれて「はい」と答えると激辛になる。",
      "ハムザのケバブは、唐辛子が口の中でシャリシャリ言うほどの激辛。それでも、とてもおいしかった。"
     ],
     "short": "ieMGyM2QjCA"
    }
   },
   {
    "id": "sweets",
    "name": "トゥルンバとバクラヴァ（シロップの菓子）",
    "local": {
     "text": "Тулумба / Баклава",
     "lang": "mk",
     "roman": "Tulumba / Baklava"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/2/24/Tulumba.jpg",
     "alt": "シロップに漬けた揚げ菓子、トゥルンバ",
     "kind": "photo",
     "credit": {
      "by": "Risteristevski",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Tulumba.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Tulumba.jpg/250px-Tulumba.jpg"
    },
    "body": "棒状に絞った生地を揚げて、熱いうちに甘いシロップをかけた菓子。オスマン帝国の料理が広まった国々で食べられている。北マケドニアでは、バクラヴァやカダイフも定番の菓子。",
    "facts": [
     {
      "label": "どこで",
      "text": "リガラ（菓子店）・アンテプ・バクラヴァ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A2%D1%83%D0%BB%D1%83%D0%BC%D0%B1%D0%B0+%2F+%D0%91%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "rigara",
     "antep"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Tulumba」",
      "url": "https://en.wikipedia.org/wiki/Tulumba",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Tulumba.jpg",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "boza",
    "name": "ボザ",
    "local": {
     "text": "Боза",
     "lang": "mk",
     "roman": "Boza"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Boza.jpg/960px-Boza.jpg",
     "alt": "グラスに入った、とろりとした発酵の飲み物ボザ",
     "kind": "photo",
     "credit": {
      "by": "FoPen",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Boza.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Boza.jpg/500px-Boza.jpg"
    },
    "body": "穀物を発酵させた、とろりとした飲み物。甘酸っぱく、アルコールは1%ほど。北マケドニアでは、昔からアルバニア系の売り手が売ってきた。",
    "facts": [
     {
      "label": "アルコール",
      "text": "アルコールは1%ほど。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%91%D0%BE%D0%B7%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "kinds": [
     "drinks",
     "sweets"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Boza」",
      "url": "https://en.wikipedia.org/wiki/Boza",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Boza.jpg",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "mastika",
    "name": "マスティカ",
    "local": {
     "text": "Мастика",
     "lang": "mk",
     "roman": "Mastika"
    },
    "body": "マスティックの木の樹脂で香りをつけた酒。北マケドニアでは、タヴチェ・グラフチェとマスティカが、この国の料理と酒の代表とされる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カイ・ゴツェ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9C%D0%B0%D1%81%D1%82%D0%B8%D0%BA%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "kaj-gotse"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Mastika」",
      "url": "https://en.wikipedia.org/wiki/Mastika",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-14"
     }
    ]
   },
   {
    "id": "rakija",
    "name": "ラキヤ（果物の蒸留酒）",
    "local": {
     "text": "Ракија",
     "lang": "mk",
     "roman": "Rakija"
    },
    "body": "南東ヨーロッパで飲まれる果物の蒸留酒。ふつうはアルコール40%で、家で造るものはもっと強い。北マケドニアの地元の酒として、ワイン・マスティカと並ぶ。",
    "facts": [
     {
      "label": "どこで",
      "text": "スコプスキ・メラク"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A0%D0%B0%D0%BA%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "merak"
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
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "vranec-glass",
    "name": "ヴラネツ（赤ワイン）",
    "local": {
     "text": "Вранец",
     "lang": "mk",
     "roman": "Vranec"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Macedonian_Vranec.jpg/960px-Macedonian_Vranec.jpg",
     "alt": "北マケドニアの赤ワイン、ヴラネツの瓶",
     "kind": "photo",
     "credit": {
      "by": "Agne27",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Macedonian_Vranec.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Macedonian_Vranec.jpg/500px-Macedonian_Vranec.jpg"
    },
    "body": "北マケドニアでいちばん大事なぶどうの1つから造る、濃い紫の赤ワイン。大きな造り手にティクヴェシュとストビがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ドロップストップ（ワインのガストロバー）・ワイン・ベリー"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%92%D1%80%D0%B0%D0%BD%D0%B5%D1%86+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "dropstop",
     "wine-berry"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Vranac」",
      "url": "https://en.wikipedia.org/wiki/Vranac",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Macedonian_Vranec.jpg",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "beer",
    "name": "ビール（スコプスコ・旧市街の地ビール）",
    "local": {
     "text": "Скопско",
     "lang": "mk",
     "roman": "Skopsko"
    },
    "body": "スコプスコは北マケドニアでいちばん飲まれているビールで、国の市場の64%を占める。旧市街には自家製ビールの店もある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ピヴニツァ・スター・グラッド（オールド・タウン・ブルワリー）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%BA%D0%BE%D0%BF%D1%81%D0%BA%D0%BE+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "star-grad"
    ],
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Skopsko beer」",
      "url": "https://en.wikipedia.org/wiki/Skopsko_beer",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "joy",
    "name": "JOY（カフェ）",
    "body": "",
    "facts": [],
    "kinds": [
     "sweets"
    ],
    "src": [],
    "pic": {
     "src": "/travel/north-macedonia/skopje/carrot-cake-960.webp",
     "small": "/travel/north-macedonia/skopje/carrot-cake-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "JOY のキャロットケーキとアメリカーノ（2026年10月19日）",
     "kind": "card",
     "date": "2026-10-19"
    },
    "went": {
     "date": "2026-10-19",
     "scene": {
      "v": "misSMBhPlkc",
      "t": 2970,
      "date": "2026-10-19"
     },
     "story": [
      "あやとはキャロットケーキとアメリカーノで約750円。キャロットケーキは粘りが強く、上の砂糖が甘い。"
     ]
    }
   },
   {
    "id": "panpan",
    "name": "パン屋パンパン",
    "body": "",
    "facts": [],
    "kinds": [
     "breakfast"
    ],
    "src": [],
    "pic": {
     "src": "/travel/north-macedonia/skopje/panpan-960.webp",
     "small": "/travel/north-macedonia/skopje/panpan-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "パン屋パンパンの紙袋とコーヒー（2026年10月23日）",
     "kind": "card",
     "date": "2026-10-23"
    },
    "went": {
     "date": "2026-10-19",
     "scene": {
      "v": "vZ2O8pabk1g",
      "t": 9840,
      "date": "2026-10-23"
     },
     "story": [
      "祝日で閉まる店が多い日にも開いていた。17時に閉まるらしく、遅く行くとパンが2種類しか残っていなかった。"
     ]
    }
   }
  ],
  "places": [
   {
    "id": "kosmos",
    "name": "コスモス（旧市街の食堂）",
    "what": "あやとが行列に並んで入った旧市街の食堂。チェバピと豆の煮込みを食べ、11月9日には、ここの豆の煮込みのほうがクリーミーだったと言った。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kosmos+%D0%A1%D1%82%D0%B0%D1%80%D0%B0+%D1%87%D0%B0%D1%80%D1%88%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [],
    "roman": "Kosmos",
    "went": true
   },
   {
    "id": "old-house",
    "name": "オールド・ハウス（1836年の家の食堂）",
    "what": "1836年に建った、いまも使われている国で最も古い伝統家屋の食堂。マケドニアの料理を出す。どの料理があるかは確かめていない。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D1%82%D0%B0%D1%80%D0%B0+%D0%BA%D1%83%D1%9C%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Стара куќа",
    "went": false
   },
   {
    "id": "merak",
    "name": "スコプスキ・メラク",
    "what": "生演奏のある古典的なマケドニア料理の店。炭火の肉と地元のワインが多い。伝統料理・ワイン・ラキヤで知られる。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D0%BA%D0%BE%D0%BF%D1%81%D0%BA%D0%B8+%D0%BC%D0%B5%D1%80%D0%B0%D0%BA+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Скопски мерак",
    "went": false
   },
   {
    "id": "destan",
    "name": "デスタン（旧市街）",
    "what": "旧市街の安いケバピとケバブの店。地元の人にも旅行者にも人気で、早くて気取らない。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%94%D0%B5%D1%81%D1%82%D0%B0%D0%BD+%D0%A1%D0%B0%D0%BB%D0%B8%D1%85+%D0%90%D1%81%D0%B8%D0%BC+%D0%A1%D1%82%D0%B0%D1%80%D0%B0+%D1%87%D0%B0%D1%80%D1%88%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Дестан"
   },
   {
    "id": "burek-carsija",
    "name": "ブレクの店（旧市街）",
    "what": "旧市街のラザル・タネフ通りにある、名前に「ブレク」を掲げたパン屋（OSM）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Burek+%D0%9B%D0%B0%D0%B7%D0%B0%D1%80+%D0%A2%D0%B0%D0%BD%D0%B5%D0%B2+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Burek）",
      "url": "https://www.openstreetmap.org/node/9200216053",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Burek"
   },
   {
    "id": "burek-kuki",
    "name": "ブレク・カイ・クキ（デバル・マーロ）",
    "what": "デバル・マーロのオルチェ・ニコロフ通りの、ブレクのパン屋（OSM）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%91%D1%83%D1%80%D0%B5%D0%BA+%D0%9A%D0%B0%D1%98+%D0%9A%D1%83%D0%BA%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Бурек Кај Куки）",
      "url": "https://www.openstreetmap.org/node/10154536448",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Бурек Кај Куки"
   },
   {
    "id": "bus-station",
    "name": "長距離バスターミナルの売店",
    "what": "バスターミナルの中に、ブレクを売る店がある。国境を越えるバスの前後に。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%90%D0%B2%D1%82%D0%BE%D0%B1%D1%83%D1%81%D0%BA%D0%B0+%D1%81%D1%82%D0%B0%D0%BD%D0%B8%D1%86%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Автобуска станица"
   },
   {
    "id": "dm",
    "name": "ゴスティルニツァ DM",
    "what": "デバル・マーロの人気のマケドニア料理の店。炭火の料理と居酒屋風の料理、にぎやかな夜。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%93%D0%BE%D1%81%D1%82%D0%B8%D0%BB%D0%BD%D0%B8%D1%86%D0%B0+%D0%94%D0%9C+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Гостилница ДМ"
   },
   {
    "id": "pastrmajlija-house",
    "name": "パストルマイリヤ＆グリル・ハウス",
    "what": "アエロドロム区の、店の名前に料理名を掲げる店（OSM）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9F%D0%B0%D1%81%D1%82%D1%80%D0%BC%D0%B0%D1%98%D0%BB%D0%B8%D1%98%D0%B0+%26+%D0%93%D1%80%D0%B8%D0%BB-%D1%85%D0%B0%D1%83%D1%81+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Пастрмајлија & Грил-хаус）",
      "url": "https://www.openstreetmap.org/node/13076499969",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Пастрмајлија & Грил-хаус",
    "km": 3.0
   },
   {
    "id": "hamza",
    "name": "ハムザ・ドネル（旧市街）",
    "what": "旧市街でいちばん安いと言われる、とあやとが聞いて入った店。OSM で旧市街にあるハムザはビトパザルスカ通りのこの1軒（もう1軒は広場の南）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Hamza+Doner+Bitpazarska+Skopje&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Hamza Doner（Bitpazarska））",
      "url": "https://www.openstreetmap.org/node/6814247285",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Hamza Doner",
    "went": true
   },
   {
    "id": "rigara",
    "name": "リガラ（菓子店）",
    "what": "旧市街の、作りたての菓子の店。Wikivoyage はバクラヴァをすすめる。80〜200デナル（2023年1月）。店の中も面白い。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A0%D0%B8%D0%B3%D0%B0%D1%80%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Ригара"
   },
   {
    "id": "antep",
    "name": "アンテプ・バクラヴァ",
    "what": "緑の市場の近くの、バクラヴァの菓子店（OSM）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%90%D0%BD%D1%82%D0%B5%D0%BF+%D0%B1%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Антеп баклава）",
      "url": "https://www.openstreetmap.org/node/12870824765",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Антеп баклава"
   },
   {
    "id": "kaj-gotse",
    "name": "カイ・ゴツェ",
    "what": "旧市街のバルカン料理の店。主菜・野菜・ビール・マスティカで1,000デナル（約2,880円）を切る、と Wikivoyage。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D0%B0%D1%98+%D0%93%D0%BE%D1%86%D0%B5+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Кај Гоце"
   },
   {
    "id": "dropstop",
    "name": "ドロップストップ（ワインのガストロバー）",
    "what": "マケドニアのワインに力を入れたガストロバー。ワインに合わせたコースもある。1963年の地震を生き残った建物の中。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Dropstop+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Dropstop"
   },
   {
    "id": "wine-berry",
    "name": "ワイン・ベリー",
    "what": "マケドニアと近隣国のワインがそろうワインバー。軽い料理と小皿。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Wine+Berry+Skopje&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Wine Berry"
   },
   {
    "id": "star-grad",
    "name": "ピヴニツァ・スター・グラッド（オールド・タウン・ブルワリー）",
    "what": "生演奏と自家製ビールの店。小皿の料理も出す。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Old+Town+Brewery+Skopje&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Пивница Стар Град"
   }
  ]
 },
 "buy": {
  "items": [
   {
    "id": "cookie",
    "name": "マケドニアの箱入りクッキー",
    "body": "",
    "facts": [
     {
      "label": "どこで",
      "text": "カム・マーケット（中心部の店）・ラムストア（カピシュテツ）・スーパー・ヴェロ"
     }
    ],
    "places": [
     "kam",
     "ramstore",
     "vero"
    ],
    "src": [],
    "went": {
     "date": "2026-10-17",
     "scene": {
      "v": "0upPnKMc5po",
      "t": 3870,
      "date": "2026-10-21"
     },
     "story": [
      "スーパーの箱入りクッキー。あやとが買ったのは300g入りで150円、バターの味が効いていた。バニラ・アーモンド・ココナッツと味を変えて、毎日1箱食べていた。サクッとして、パン屋やケーキ屋のクッキーのよう。",
      "旧市街から歩いた先のクッキー屋の量り売りは約500円で、あやとは買わなかった。"
     ]
    }
   },
   {
    "id": "ajvar",
    "name": "アイヴァルの瓶",
    "local": {
     "text": "Ајвар",
     "lang": "mk",
     "roman": "Ajvar"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Ajvar1_bright.jpg/960px-Ajvar1_bright.jpg",
     "alt": "赤いパプリカのペースト、アイヴァル",
     "kind": "photo",
     "credit": {
      "by": "Off-shell",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ajvar1_bright.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Ajvar1_bright.jpg/500px-Ajvar1_bright.jpg"
    },
    "body": "焼いた赤いパプリカ（なすを混ぜることも）で作るペースト。パンに塗っても、つけ合わせにもなる。甘口・ピリ辛・激辛がある。「マケドニアのアイヴァル」は、世界知的所有権機関に名前が登録されている。家で作るものは秋にまとめて作って瓶に詰める。瓶は預ける荷物に入れる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カム・マーケット（中心部の店）・ラムストア（カピシュテツ）・スーパー・ヴェロ"
     },
     {
      "label": "買える所",
      "text": "土産の一覧の品は、ほとんどスコピエのふつうのスーパーで買えた、と旅の書き手。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%90%D1%98%D0%B2%D0%B0%D1%80+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "kam",
     "ramstore",
     "vero"
    ],
    "src": [
     {
      "name": "Wikipedia「Ajvar」",
      "url": "https://en.wikipedia.org/wiki/Ajvar",
      "seen": "2026-11-14"
     },
     {
      "name": "Jídlo na cestách「What to bring back from North Macedonia」（2026年8月16日）",
      "url": "https://www.jidlonacestach.cz/en/what-to-bring-back-from-north-macedonia/",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Ajvar1_bright.jpg",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "coffee",
    "name": "トルココーヒーの粉",
    "local": {
     "text": "Турско кафе",
     "lang": "mk",
     "roman": "Tursko kafe"
    },
    "body": "北マケドニアでいちばん飲まれているコーヒー。スーパーには袋がたくさん並び、200g入りの大きな袋もあった。",
    "facts": [
     {
      "label": "どこで",
      "text": "カム・マーケット（中心部の店）・ラムストア（カピシュテツ）・スーパー・ヴェロ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A2%D1%83%D1%80%D1%81%D0%BA%D0%BE+%D0%BA%D0%B0%D1%84%D0%B5+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "kam",
     "ramstore",
     "vero"
    ],
    "src": [
     {
      "name": "Wikipedia「Macedonian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_cuisine",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-13",
     "scene": {
      "v": "donehL4hO68",
      "t": 6210,
      "date": "2026-10-13"
     },
     "story": [
      "スーパーの棚にトルココーヒーがずらりと並んでいた。違いが分からないまま、あやとは1つ選んで買った。"
     ]
    }
   },
   {
    "id": "chocolate",
    "name": "エヴロパのチョコレート",
    "local": {
     "text": "Европа",
     "lang": "mk",
     "roman": "Evropa"
    },
    "body": "スコピエのチョコレート工場エヴロパの品。旅の書き手は、川沿いの11月13日通りの会社の店で、全種類をまとめて買えたと書いている。",
    "facts": [
     {
      "label": "どこで",
      "text": "エヴロパの菓子店（中心部）"
     },
     {
      "label": "買える所",
      "text": "書き手の言う川沿いの店は、OSM では見つからなかった（地図に置いたのは中心部の別の店）。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%95%D0%B2%D1%80%D0%BE%D0%BF%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "evropa"
    ],
    "src": [
     {
      "name": "Jídlo na cestách「What to bring back from North Macedonia」（2026年8月16日）",
      "url": "https://www.jidlonacestach.cz/en/what-to-bring-back-from-north-macedonia/",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "vranec",
    "name": "ヴラネツ（赤ワインの瓶）",
    "local": {
     "text": "Вранец",
     "lang": "mk",
     "roman": "Vranec"
    },
    "pic": {
     "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Macedonian_Vranec.jpg/960px-Macedonian_Vranec.jpg",
     "alt": "北マケドニアの赤ワイン、ヴラネツの瓶",
     "kind": "photo",
     "credit": {
      "by": "Agne27",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Macedonian_Vranec.jpg"
     },
     "small": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Macedonian_Vranec.jpg/500px-Macedonian_Vranec.jpg"
    },
    "body": "北マケドニアでいちばん大事なぶどうの1つから造る、濃い紫の赤ワイン。大きな造り手にティクヴェシュとストビがある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ティクヴェシュのワインの店・カムニク（ワインの店）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%92%D1%80%D0%B0%D0%BD%D0%B5%D1%86+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "tikves",
     "kamnik"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Vranac」",
      "url": "https://en.wikipedia.org/wiki/Vranac",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Macedonian_Vranec.jpg",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "rakija",
    "name": "ラキヤ（瓶）",
    "local": {
     "text": "Ракија",
     "lang": "mk",
     "roman": "Rakija"
    },
    "body": "果物の蒸留酒。農家の市場では、自家製の蒸留酒も売っている。",
    "facts": [
     {
      "label": "どこで",
      "text": "緑の市場（ゼレン・パザル）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A0%D0%B0%D0%BA%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "places": [
     "zelen-pazar"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Rakia」",
      "url": "https://en.wikipedia.org/wiki/Rakia",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "market",
    "name": "市場の食材（チーズ・香辛料・お茶）",
    "body": "市場では果物・野菜・サラダ・チーズ・お茶・香辛料・花が買える。緑の市場のほうが値段は手ごろ。",
    "facts": [
     {
      "label": "どこで",
      "text": "ビト・パザル（市場）・緑の市場（ゼレン・パザル）"
     }
    ],
    "places": [
     "bit-pazar",
     "zelen-pazar"
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "id": "winter",
    "name": "防寒具（マフラー・手袋・ニット帽）",
    "body": "",
    "facts": [
     {
      "label": "どこで",
      "text": "LC ワイキキ（ダイヤモンド・モール）"
     }
    ],
    "places": [
     "lcw"
    ],
    "src": [],
    "went": {
     "date": "2026-10-28",
     "scene": {
      "v": "la_OkustLkA",
      "t": 2555,
      "date": "2026-10-28"
     },
     "story": [
      "10月の終わりに急に寒くなり、1週間前まで半袖だったあやとは手が震えるほどだった。マフラーと手袋を合わせて約1,500円で買い、寒さはだいぶましになった。"
     ]
    }
   },
   {
    "id": "grocery",
    "name": "自炊の買い出し（スーパー）",
    "body": "",
    "facts": [
     {
      "label": "どこで",
      "text": "カム・マーケット（中心部の店）・ラムストア（カピシュテツ）・スーパー・ヴェロ"
     }
    ],
    "places": [
     "kam",
     "ramstore",
     "vero"
    ],
    "src": [],
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "NY9pzYrA-5o",
      "t": 1020,
      "date": "2026-10-12"
     },
     "story": [
      "あやとはほぼ毎日スーパーで買い出して、宿の台所で自炊した。パスタは75円、ニンジンもバナナも1kg約100円。1回の買い出しは約1,000〜1,300円。",
      "着いた日に行った「街でいちばん安いと噂のディスカウントスーパー」は、廃墟のようなビルの中にあり、入口が狭い。店の名前と場所は配信から決められない。"
     ]
    }
   },
   {
    "id": "crafts",
    "name": "旧市街の金銀の細工とアクセサリー",
    "body": "旧市街は通りごとに品が分かれ、金の通りもあった。あやとが歩いたときは、並ぶ店の9割ほどがジュエリー屋で、ドレス屋も多かった。",
    "facts": [
     {
      "label": "どこで",
      "text": "旧市街の店々"
     }
    ],
    "places": [
     "old-bazaar"
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-13",
     "scene": {
      "v": "donehL4hO68",
      "t": 1440,
      "date": "2026-10-13"
     }
    }
   }
  ],
  "places": [
   {
    "id": "kam",
    "name": "カム・マーケット（中心部の店）",
    "what": "国でいちばん安いスーパーのチェーン（アルディ風）。この店は中心部の50番師団通り。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D0%B0%D0%BC+%D0%BC%D0%B0%D1%80%D0%BA%D0%B5%D1%82+50-%D1%82%D0%B0+%D0%94%D0%B8%D0%B2%D0%B8%D0%B7%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「North Macedonia」",
      "url": "https://en.wikivoyage.org/wiki/North_Macedonia",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Кам Маркет）",
      "url": "https://www.openstreetmap.org/node/1851607184",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Кам маркет",
    "went": false
   },
   {
    "id": "ramstore",
    "name": "ラムストア（カピシュテツ）",
    "what": "中心部の南西、カピシュテツのスーパー（OSM）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ramstore+Kapishtec+Skopje&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Ramstore（Kapištec））",
      "url": "https://www.openstreetmap.org/way/1568898470",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Рамстор",
    "went": false
   },
   {
    "id": "vero",
    "name": "スーパー・ヴェロ",
    "what": "大きなスーパーの入ったモール。レストランやカフェ、携帯会社の店もある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Super+Vero+Skopje&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Супер Веро",
    "went": false
   },
   {
    "id": "evropa",
    "name": "エヴロパの菓子店（中心部）",
    "what": "スコピエのチョコレート工場エヴロパの名前の菓子店（OSM）。ディミトリエ・チュポフスキ通り。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%95%D0%B2%D1%80%D0%BE%D0%BF%D0%B0+%D0%94%D0%B8%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B5+%D0%A7%D1%83%D0%BF%D0%BE%D0%B2%D1%81%D0%BA%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Европа бр. 4）",
      "url": "https://www.openstreetmap.org/node/3484100379",
      "seen": "2026-11-15"
     },
     {
      "name": "Jídlo na cestách「What to bring back from North Macedonia」（2026年8月16日）",
      "url": "https://www.jidlonacestach.cz/en/what-to-bring-back-from-north-macedonia/",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Европа бр. 4"
   },
   {
    "id": "tikves",
    "name": "ティクヴェシュのワインの店",
    "what": "大きな造り手ティクヴェシュの名前のワインの店（OSM）。川沿いの11月13日通り。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A2%D0%B8%D0%BA%D0%B2%D0%B5%D1%88+%D0%9A%D0%B5%D1%98+13-%D1%82%D0%B8+%D0%9D%D0%BE%D0%B5%D0%BC%D0%B2%D1%80%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Tikves）",
      "url": "https://www.openstreetmap.org/node/5901737585",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikipedia「Vranac」",
      "url": "https://en.wikipedia.org/wiki/Vranac",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Тиквеш"
   },
   {
    "id": "kamnik",
    "name": "カムニク（ワインの店）",
    "what": "ディミトリエ・チュポフスキ通りのワインの店（OSM）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%9A%D0%B0%D0%BC%D0%BD%D0%B8%D0%BA+%D0%94%D0%B8%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B5+%D0%A7%D1%83%D0%BF%D0%BE%D0%B2%D1%81%D0%BA%D0%B8+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（Kamnik）",
      "url": "https://www.openstreetmap.org/node/5901752486",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Камник"
   },
   {
    "id": "zelen-pazar",
    "name": "緑の市場（ゼレン・パザル）",
    "what": "旅行者が少ない農家の市場で、値段が手ごろ。自家製の蒸留酒も売っている。議会の近く。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%97%D0%B5%D0%BB%D0%B5%D0%BD+%D0%BF%D0%B0%D0%B7%D0%B0%D1%80+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Centar」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Зелен пазар",
    "went": false
   },
   {
    "id": "bit-pazar",
    "name": "ビト・パザル（市場）",
    "what": "街でいちばん大きな食べ物の市場。果物・野菜・チーズ・お茶・香辛料・花。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%91%D0%B8%D1%82-%D0%BF%D0%B0%D0%B7%D0%B0%D1%80+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Бит-пазар"
   },
   {
    "id": "lcw",
    "name": "LC ワイキキ（ダイヤモンド・モール）",
    "what": "あやとがダイヤモンド・モールで入った服のチェーン店。売れ残りの黒の長いマフラーが300円、手袋は約1,200円だった。OSM のこの店はダイヤモンド・モールの位置にある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=LC+Waikiki+Diamond+Mall+Skopje&hl=ja",
    "src": [
     {
      "name": "OpenStreetMap（LC Waikiki）",
      "url": "https://www.openstreetmap.org/node/13418045401",
      "seen": "2026-11-15"
     },
     {
      "name": "OpenStreetMap（Diamond Mall）",
      "url": "https://www.openstreetmap.org/way/1231158369",
      "seen": "2026-11-15"
     }
    ],
    "roman": "LC Waikiki",
    "went": true
   },
   {
    "id": "old-bazaar",
    "name": "旧市街の店々",
    "what": "通りごとに金・靴・鍋・服と商う品が分かれていた市場。",
    "maps": "https://www.google.com/maps/search/?api=1&query=%D0%A1%D1%82%D0%B0%D1%80%D0%B0+%D1%87%D0%B0%D1%80%D1%88%D0%B8%D1%98%D0%B0+%D0%A1%D0%BA%D0%BE%D0%BF%D1%98%D0%B5&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Skopje/Stara Čaršija」",
      "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
      "seen": "2026-11-15"
     }
    ],
    "roman": "Стара чаршија"
   }
  ]
 },
 "videos": {
  "streams": {
   "country": "north-macedonia",
   "city": "北マケドニア"
  },
  "shorts": [
   "ieMGyM2QjCA",
   "frcgM9wiRr8",
   "CSE9FVCRdlw",
   "IZpZGM5Xbyg",
   "GLmdZ6wkaqA",
   "DjKYQtnrtMg"
  ]
 },
 "basics": {
  "summary": [
   {
    "id": "season",
    "icon": "sun",
    "label": "旬の季節",
    "value": "5・6・9・10月",
    "lead": "平年の最高気温が20〜30℃",
    "to": "#guide-season"
   },
   {
    "id": "safety",
    "icon": "key",
    "label": "治安",
    "value": "危険情報は解除",
    "lead": "名所と市場ではスリに注意",
    "to": "#guide-safety"
   },
   {
    "id": "budget",
    "icon": "wallet",
    "label": "1日の予算",
    "value": "約2,400円",
    "lead": "宿約1,400円＋買い出し約1,000円",
    "to": "#budget"
   },
   {
    "id": "transit",
    "icon": "bus",
    "label": "移動",
    "value": "歩いて回れる",
    "lead": "旧市街から広場まで1〜2時間",
    "to": "#guide-transit"
   }
  ],
  "guides": [
   {
    "id": "airport",
    "icon": "plane",
    "title": "空港から市内へ",
    "lead": "街の南東20km。空港バスかタクシーで",
    "parts": [
     {
      "h": "",
      "text": "スコピエ国際空港（SKP）は街の南東20km。"
     },
     {
      "h": "",
      "text": "空港バスは片道199デナル（約570円）。飛行機が着いて15〜30分後に出口の外から出て、キャピトル・モール・バスターミナル・ホリデイ・インを通り、約25分。切符は空港のカウンターかネットで、現金でもカードでも買える。"
     },
     {
      "h": "",
      "text": "帰りの空港バスの切符は、バスターミナルの中の空港バスの窓口で買う。"
     },
     {
      "h": "",
      "text": "タクシーは中心まで15〜25ユーロ。空港の掲示の決まった額は25ユーロ（2022年）。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "スコピエ国際空港（空港バスの案内）",
      "url": "https://skp.airports.com.mk/en-EN/bus/page/bus",
      "seen": "2026-11-14"
     }
    ],
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "NY9pzYrA-5o",
      "t": 60,
      "date": "2026-10-12"
     },
     "story": [
      "あやとはアルバニアから国境越えのバスで来た。4時間と聞いていたのに7時間かかり、着いたのは16時。"
     ]
    }
   },
   {
    "id": "transit",
    "icon": "bus",
    "title": "市内の乗り物",
    "lead": "赤い市バスは、乗り換えなしの1回払い",
    "parts": [
     {
      "h": "",
      "text": "赤い市バスは、乗り換えなしならどこまでも1回35デナル（アプリ SkopjeBus かスコプスカ・カード）、運転手に現金なら50デナル。現金だと QR コードの切符が出るので、車内の読み取り機にかざす。"
     },
     {
      "h": "",
      "text": "スコプスカ・カードはバスターミナルで、営業時間内（18時まで）にしか買えない。1日券は市内線120デナル、全線150デナル。"
     },
     {
      "h": "",
      "text": "ふだんの便は朝5時から夜11時まで。夜中の0時から4時までは夜行バスがある。"
     },
     {
      "h": "",
      "text": "タクシーはふつう300デナル（約860円）を超えない。アプリ Wizi なら呼べて、カードでも払える。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「Skopje」",
      "url": "https://en.wikivoyage.org/wiki/Skopje",
      "seen": "2026-11-15"
     },
     {
      "name": "ガジ・ババ区の観光案内（公共交通）",
      "url": "https://tourist-guide.gazibaba.gov.mk/useful-information/public-transport",
      "seen": "2026-11-14"
     }
    ],
    "went": {
     "date": "2026-10-24",
     "scene": {
      "v": "eHBAnQF56-E",
      "t": 660,
      "date": "2026-10-24"
     },
     "story": [
      "あやとは、乗るときに払った切符が読み取り機になかなか反応せず苦労した。バス停の電光掲示板は、昼は光が弱くて読めなかった。"
     ]
    }
   },
   {
    "id": "pay",
    "icon": "currency",
    "title": "払いかたとチップ",
    "lead": "通貨はデナル。カードもよく使える",
    "parts": [
     {
      "h": "",
      "text": "通貨はデナル（MKD）。1ユーロ＝61.3644デナルに固定されている。"
     },
     {
      "h": "",
      "text": "カードはよく使える。いっぽう市場などの個人の店ではカードが使えないことが多く、ユーロがそのまま使えるのは空港のタクシーくらい。少しのデナルを先に持っておく。"
     },
     {
      "h": "",
      "text": "ATM は、自分の銀行の手数料とは別に200〜300デナル取ることが多い。両替は両替所が手早い。路上で両替しない。"
     },
     {
      "h": "",
      "text": "チップは欠かせないものではないが、渡すと喜ばれる。"
     }
    ],
    "src": [
     {
      "name": "Wikipedia「Macedonian denar」",
      "url": "https://en.wikipedia.org/wiki/Macedonian_denar",
      "seen": "2026-11-14"
     },
     {
      "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
      "seen": "2026-11-14"
     },
     {
      "name": "Wikivoyage「North Macedonia」",
      "url": "https://en.wikivoyage.org/wiki/North_Macedonia",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "NY9pzYrA-5o",
      "t": 1830,
      "date": "2026-10-12"
     },
     "story": [
      "あやとはスーパーでカードが使えた。それでも ATM で約3万円を下ろして、現金を持ち歩いた。"
     ]
    }
   },
   {
    "id": "sim",
    "icon": "sim",
    "title": "ネットと SIM",
    "lead": "携帯の会社は4つ。どれも 5G",
    "parts": [
     {
      "h": "",
      "text": "携帯の会社は T-Mobile・A1・LycaMobile・MTel の4つで、どれも 5G。SIM を買うときにパスポートを見せることがある。旅行者向けの大きなデータの包みが安い。"
     },
     {
      "h": "",
      "text": "カフェの多くは無料の Wi-Fi がある。鍵がかかっていたら、パスワードを聞けばいい。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「North Macedonia」",
      "url": "https://en.wikivoyage.org/wiki/North_Macedonia",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-12",
     "scene": {
      "v": "NY9pzYrA-5o",
      "t": 90,
      "date": "2026-10-12"
     },
     "story": [
      "あやとは着いたその日に SIM を買って開通した。最初は1週間用で、次に1か月用に替えた。"
     ]
    }
   },
   {
    "id": "safety",
    "icon": "key",
    "title": "治安のコツ",
    "lead": "人の集まる所では、スリとひったくりに注意",
    "parts": [
     {
      "h": "",
      "text": "人の集まる所（観光名所・市場）ではスリ・ひったくり・窃盗が多い。目立つ服装を避け、財布には要るぶんの現金だけ。バッグは車道と反対の手で持つ。"
     },
     {
      "h": "",
      "text": "夜の不要な外出は控え、夜に動くなら明るい通りを選ぶか、宿でタクシーを呼ぶ。"
     },
     {
      "h": "",
      "text": "ホテルなど旅行者向けの宿以外に泊まるときは、着いたら最寄りの警察署に届け出る決まりがある。"
     },
     {
      "h": "水道水",
      "text": "水道水は飲める。公共の水飲み場も多い。"
     }
    ],
    "src": [
     {
      "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「North Macedonia」",
      "url": "https://en.wikivoyage.org/wiki/North_Macedonia",
      "seen": "2026-11-15"
     }
    ],
    "went": {
     "date": "2026-10-15",
     "scene": {
      "v": "CKJvprUMOgA",
      "t": 1140,
      "date": "2026-10-15"
     },
     "story": [
      "あやとの印象は、きれいでゴミが少なく、治安は悪くない。泊まったホステルも旅行者ばかりで平和だった。",
      "旧市街でケバブを食べていたら、野良犬に持っていかれそうになった（地元の人が助けてくれた）。"
     ]
    }
   },
   {
    "id": "phrases",
    "icon": "phrase",
    "title": "マケドニア語のひとこと",
    "lead": "Здраво（ズドラヴォ）＝こんにちは",
    "parts": [
     {
      "h": "",
      "text": "公用語はマケドニア語で、キリル文字で書く。地元の人向けの店はキリル文字だけのことが多い。人前に立つ仕事の人は英語がとても上手。"
     }
    ],
    "src": [
     {
      "name": "Wikivoyage「North Macedonia」",
      "url": "https://en.wikivoyage.org/wiki/North_Macedonia",
      "seen": "2026-11-15"
     },
     {
      "name": "Wikivoyage「Macedonian phrasebook」",
      "url": "https://en.wikivoyage.org/wiki/Macedonian_phrasebook",
      "seen": "2026-11-15"
     }
    ],
    "words": [
     {
      "local": {
       "text": "Здраво",
       "lang": "mk",
       "roman": "zdravo",
       "kana": "ズドラヴォ"
      },
      "jp": "こんにちは"
     },
     {
      "local": {
       "text": "Добро утро",
       "lang": "mk",
       "roman": "dobro utro",
       "kana": "ドブロ・ウトロ"
      },
      "jp": "おはようございます"
     },
     {
      "local": {
       "text": "Благодарам",
       "lang": "mk",
       "roman": "blagodaram",
       "kana": "ブラゴダラム"
      },
      "jp": "ありがとう"
     },
     {
      "local": {
       "text": "Ве молам",
       "lang": "mk",
       "roman": "ve molam",
       "kana": "ヴェ・モラム"
      },
      "jp": "お願いします"
     },
     {
      "local": {
       "text": "Да",
       "lang": "mk",
       "roman": "da",
       "kana": "ダ"
      },
      "jp": "はい"
     },
     {
      "local": {
       "text": "Не",
       "lang": "mk",
       "roman": "ne",
       "kana": "ネ"
      },
      "jp": "いいえ"
     },
     {
      "local": {
       "text": "Извинете",
       "lang": "mk",
       "roman": "izvinete",
       "kana": "イズヴィネテ"
      },
      "jp": "すみません"
     },
     {
      "local": {
       "text": "Довидување",
       "lang": "mk",
       "roman": "doviduvanje",
       "kana": "ドヴィドゥヴァニェ"
      },
      "jp": "さようなら"
     },
     {
      "local": {
       "text": "Колку е ова?",
       "lang": "mk",
       "roman": "kolku e ova?",
       "kana": "コルク・エ・オヴァ？"
      },
      "jp": "これはいくら？"
     },
     {
      "local": {
       "text": "Зборувате ли англиски?",
       "lang": "mk",
       "roman": "zboruvate li angliski?",
       "kana": "ズボルヴァテ・リ・アングリスキ？"
      },
      "jp": "英語を話せますか？"
     }
    ]
   }
  ],
  "season": {
   "id": "season",
   "icon": "sun",
   "title": "季節と行事",
   "lead": "歩きやすいのは5・6・9・10月",
   "parts": [
    {
     "h": "歩きやすい季節",
     "text": "平年の最高気温が20〜30℃に収まるのは5・6・9・10月。7〜8月は最高32℃、12〜2月は最低が氷点下。"
    },
    {
     "h": "祝日",
     "text": "10月11日は「マケドニア蜂起の日」、10月23日は「マケドニア革命闘争の日」で、どちらも国の祝日。祝日が日曜に重なると、翌日の月曜が休みになる（2026年は10月11日が日曜で、12日が休みになった）。"
    },
    {
     "h": "時差",
     "text": "北マケドニアは中央ヨーロッパ時間（UTC+1）。3月の最終日曜から10月の最終日曜までは夏時間（UTC+2）。日本との時差は、夏時間のあいだ7時間、それ以外は8時間。"
    }
   ],
   "src": [
    {
     "name": "Wikipedia「Skopje」（気候の表。スコピエ国際空港・1991〜2020年の平年値）",
     "url": "https://en.wikipedia.org/wiki/Skopje#Climate",
     "seen": "2026-11-15"
    },
    {
     "name": "Wikipedia「Public holidays in North Macedonia」",
     "url": "https://en.wikipedia.org/wiki/Public_holidays_in_North_Macedonia",
     "seen": "2026-11-14"
    },
    {
     "name": "Wikipedia「Time in North Macedonia」",
     "url": "https://en.wikipedia.org/wiki/Time_in_North_Macedonia",
     "seen": "2026-11-14"
    }
   ],
   "went": {
    "date": "2026-10-13",
    "scene": {
     "v": "donehL4hO68",
     "t": 370,
     "date": "2026-10-13"
    },
    "story": [
     "あやとが着いた次の日に聞くと前の日は大きな祝日で、どこの店も閉まっていた。10月23日も祝日で、郵便局もスーパーも閉まっていた。",
     "10月後半は並木が色づく。あやとは10月17日に紅葉を見て、もう冬という感じで寒いと言った。"
    ]
   }
  },
  "budget": {
   "rows": [],
   "tips": [],
   "days": [
    {
     "label": "自炊の日",
     "parts": [
      {
       "label": "宿1泊（ホステル。10泊で値切ったあと）",
       "yen": 1400,
       "at": {
        "v": "UQdkUSro9Ck",
        "t": 5910,
        "date": "2026-10-14"
       }
      },
      {
       "label": "スーパーの買い出し1回",
       "yen": 1000,
       "at": {
        "v": "CKJvprUMOgA",
        "t": 7680,
        "date": "2026-10-15"
       }
      }
     ]
    },
    {
     "label": "カフェに寄った日",
     "parts": [
      {
       "label": "宿1泊",
       "yen": 1400,
       "at": {
        "v": "UQdkUSro9Ck",
        "t": 5910,
        "date": "2026-10-14"
       }
      },
      {
       "label": "スーパーの買い出し1回",
       "yen": 1000,
       "at": {
        "v": "CKJvprUMOgA",
        "t": 7680,
        "date": "2026-10-15"
       }
      },
      {
       "label": "カフェのケーキとコーヒー",
       "yen": 750,
       "at": {
        "v": "misSMBhPlkc",
        "t": 2970,
        "date": "2026-10-19"
       }
      }
     ]
    },
    {
     "label": "防寒具を買った日",
     "parts": [
      {
       "label": "宿1泊",
       "yen": 1400,
       "at": {
        "v": "UQdkUSro9Ck",
        "t": 5910,
        "date": "2026-10-14"
       }
      },
      {
       "label": "スーパーの買い出し1回",
       "yen": 1000,
       "at": {
        "v": "CKJvprUMOgA",
        "t": 7680,
        "date": "2026-10-15"
       }
      },
      {
       "label": "マフラーと手袋",
       "yen": 1500,
       "at": {
        "v": "la_OkustLkA",
        "t": 3935,
        "date": "2026-10-28"
       }
      }
     ]
    }
   ],
   "extras": [
    {
     "label": "市バス1回",
     "local": "35〜50デナル",
     "yen": "100〜140円",
     "src": [
      {
       "name": "Wikivoyage「Skopje」",
       "url": "https://en.wikivoyage.org/wiki/Skopje",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "空港バス（片道）",
     "local": "199デナル",
     "yen": "570円",
     "src": [
      {
       "name": "Wikivoyage「Skopje」",
       "url": "https://en.wikivoyage.org/wiki/Skopje",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "タクシー（市内）",
     "local": "300までデナル",
     "yen": "860まで円",
     "src": [
      {
       "name": "Wikivoyage「Skopje」",
       "url": "https://en.wikivoyage.org/wiki/Skopje",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "マトカ渓谷までタクシー",
     "local": "約800デナル",
     "yen": "2310円",
     "src": [
      {
       "name": "Wikivoyage「Skopje/Outer Skopje」",
       "url": "https://en.wikivoyage.org/wiki/Skopje/Outer_Skopje",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "旧市街の食堂（主菜・野菜・ビール・マスティカ）",
     "local": "1,000までデナル",
     "yen": "2,880まで円",
     "src": [
      {
       "name": "Wikivoyage「Skopje/Stara Čaršija」",
       "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "旧市街の菓子（2023年1月）",
     "local": "80〜200デナル",
     "yen": "230〜580円",
     "src": [
      {
       "name": "Wikivoyage「Skopje/Stara Čaršija」",
       "url": "https://en.wikivoyage.org/wiki/Skopje/Stara_%C4%8Car%C5%A1ija",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "ロープウェイ（2016年）",
     "local": "100デナル",
     "yen": "290円",
     "src": [
      {
       "name": "Wikivoyage「Skopje/Karpoš」",
       "url": "https://en.wikivoyage.org/wiki/Skopje/Karpo%C5%A1",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "label": "博物館の入場（2016年）",
     "local": "300デナル",
     "yen": "860円",
     "src": [
      {
       "name": "Wikivoyage「Skopje/Centar」",
       "url": "https://en.wikivoyage.org/wiki/Skopje/Centar",
       "seen": "2026-11-15"
      }
     ]
    }
   ],
   "rate": "1デナルは約2.9円。北マケドニアのデナル（MKD）は2002年からユーロに固定されていて、1ユーロ＝61.3644デナル（±1%）。円は1ユーロ＝176.83円（2026年11月13日の欧州中央銀行の参照レート）で直した。",
   "rateSrc": [
    {
     "name": "Wikipedia「Macedonian denar」",
     "url": "https://en.wikipedia.org/wiki/Macedonian_denar",
     "seen": "2026-11-14"
    },
    {
     "name": "欧州中央銀行（ユーロと円の参照レート）",
     "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-jpy.en.html",
     "seen": "2026-11-14"
    }
   ],
   "note": {
    "date": "2026-10-12",
    "scene": {
     "v": "NY9pzYrA-5o",
     "t": 1110,
     "date": "2026-10-12"
    },
    "story": [
     "円は、あやとがその場で円に直して言った額（値札の数字を3倍して読んでいた）。"
    ]
   },
   "article": "/travel/north-macedonia/skopje/prices"
  },
  "pack": [
   {
    "icon": "passport",
    "label": "パスポート",
    "why": "北マケドニアを出る日から3か月以上の残りが要る。観光で3か月以内ならビザは要らない。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "icon": "coin",
    "label": "少しのデナルの現金",
    "why": "市場などの個人の店はカードが使えないことが多い。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "icon": "jacket",
    "label": "10月の終わりからの防寒具",
    "why": "平年の11月は最高12.5℃・最低2.8℃。あやとは10月27日に急な寒さで手が震え、次の日にマフラーと手袋を買った。",
    "src": [
     {
      "name": "Wikipedia「Skopje」（気候の表。スコピエ国際空港・1991〜2020年の平年値）",
      "url": "https://en.wikipedia.org/wiki/Skopje#Climate",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "icon": "umbrella",
    "label": "折りたたみの傘",
    "why": "10〜12月は月に7〜11日、雨か雪が降る。",
    "src": [
     {
      "name": "Wikipedia「Skopje」（気候の表。スコピエ国際空港・1991〜2020年の平年値）",
      "url": "https://en.wikipedia.org/wiki/Skopje#Climate",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "icon": "firstaid",
    "label": "海外旅行保険",
    "why": "重い病気やけがでは、オーストリアなど近くの国へ運ばれることがある。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
      "seen": "2026-11-15"
     }
    ]
   },
   {
    "icon": "phrase",
    "label": "翻訳アプリ",
    "why": "地元の人向けの店はキリル文字だけのことが多い。あやとはスーパーで品名を Google 翻訳で調べた。",
    "src": [
     {
      "name": "Wikivoyage「North Macedonia」",
      "url": "https://en.wikivoyage.org/wiki/North_Macedonia",
      "seen": "2026-11-15"
     }
    ]
   }
  ],
  "climate": {
   "months": [
    {
     "hi": 4.8,
     "lo": -3.3,
     "mm": 30
    },
    {
     "hi": 9.0,
     "lo": -1.6,
     "mm": 29
    },
    {
     "hi": 14.5,
     "lo": 1.9,
     "mm": 38
    },
    {
     "hi": 19.4,
     "lo": 5.7,
     "mm": 40
    },
    {
     "hi": 24.4,
     "lo": 10.3,
     "mm": 43
    },
    {
     "hi": 29.2,
     "lo": 14.3,
     "mm": 54
    },
    {
     "hi": 32.0,
     "lo": 16.3,
     "mm": 38
    },
    {
     "hi": 32.3,
     "lo": 16.2,
     "mm": 36
    },
    {
     "hi": 26.7,
     "lo": 12.2,
     "mm": 34
    },
    {
     "hi": 20.1,
     "lo": 7.6,
     "mm": 49
    },
    {
     "hi": 12.5,
     "lo": 2.8,
     "mm": 45
    },
    {
     "hi": 5.9,
     "lo": -1.4,
     "mm": 48
    }
   ],
   "note": "平均最高と平均最低。スコピエ国際空港（1991〜2020年の平年値）",
   "src": [
    {
     "name": "Wikipedia「Skopje」（気候の表。スコピエ国際空港・1991〜2020年の平年値）",
     "url": "https://en.wikipedia.org/wiki/Skopje#Climate",
     "seen": "2026-11-15"
    }
   ]
  },
  "help": {
   "calls": [
    {
     "num": "112",
     "label": "警察・消防・救急",
     "note": "どれが要るかを聞かれる",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
       "seen": "2026-11-15"
      },
      {
       "name": "Wikipedia「Telephone numbers in North Macedonia」",
       "url": "https://en.wikipedia.org/wiki/Telephone_numbers_in_North_Macedonia",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "num": "192",
     "label": "警察",
     "note": "",
     "src": [
      {
       "name": "Wikipedia「Telephone numbers in North Macedonia」",
       "url": "https://en.wikipedia.org/wiki/Telephone_numbers_in_North_Macedonia",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "num": "193",
     "label": "消防",
     "note": "",
     "src": [
      {
       "name": "Wikipedia「Telephone numbers in North Macedonia」",
       "url": "https://en.wikipedia.org/wiki/Telephone_numbers_in_North_Macedonia",
       "seen": "2026-11-15"
      }
     ]
    },
    {
     "num": "194",
     "label": "救急",
     "note": "",
     "src": [
      {
       "name": "Wikipedia「Telephone numbers in North Macedonia」",
       "url": "https://en.wikipedia.org/wiki/Telephone_numbers_in_North_Macedonia",
       "seen": "2026-11-15"
      }
     ]
    }
   ],
   "embassy": {
    "name": "在北マケドニア日本国大使館",
    "address": "Filip Vtori Makedonski 3, Soravia Center, floor 6, 1000 Skopje, North Macedonia",
    "tel": "（市外局番 02）3118-063／国外からは +389 2 3118 063",
    "note": "スコピエに日本の大使館がある（兼轄ではない）。ソラヴィア・センターの6階。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Soravia+Center+Skopje&hl=ja",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（北マケドニア 安全対策基礎データ）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_205.html",
      "seen": "2026-11-15"
     }
    ]
   }
  }
 },
 "published": "2026-11-14",
 "updated": "2026-11-15",
 "hash": "dd591cc6b86f9e6e"
}
/* END GUIDE */;
