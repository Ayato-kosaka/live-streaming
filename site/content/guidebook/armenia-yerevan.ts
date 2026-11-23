/**
 * エレバンのガイドブック（`/travel/armenia/yerevan`）の中身。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/armenia/yerevan/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_bake.py armenia/yerevan` で焼き直す。
 * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。
 */
import type { Guidebook } from "./types";

export const YEREVAN: Guidebook = /* BEGIN GUIDE */
{
 "country": "armenia",
 "city": "yerevan",
 "name": "エレバン",
 "kicker": "アルメニア",
 "local": {
  "text": "Երևան",
  "lang": "hy",
  "roman": "Yerevan"
 },
 "lead": "「ピンクシティ」と称えられた街",
 "cover": {
  "src": "/guide/armenia/yerevan/photos/yerevan-republic-square-armenia-150da468-960.webp",
  "small": "/guide/armenia/yerevan/photos/yerevan-republic-square-armenia-150da468-500.webp",
  "w": 960,
  "h": 638,
  "alt": "共和国広場。ピンクの石の建物が広場を囲む",
  "kind": "photo",
  "credit": {
   "by": "Vyacheslav Argenberg",
   "lic": "CC BY 4.0",
   "page": "https://commons.wikimedia.org/wiki/File:Yerevan,_Republic_Square,_Armenia.jpg"
  }
 },
 "title": "エレバン観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜アルメニア",
 "description": "アルメニアの首都エレバンの観光ガイド。見どころマップと、やりたいこと8つ（大階段カスケード、アララトのブランデー工場、ガルニ神殿とゲガルド修道院への日帰り）、ホロヴァツとラヴァシュ。",
 "rate": {
  "unit": "ドラム",
  "yen": 0.44,
  "date": "2026-11-20"
 },
 "about": {
  "cards": [
   {
    "id": "history",
    "icon": "ruins",
    "q": "歴史は？",
    "a": "紀元前782年、ウラルトゥ王国がエレブニの要塞を築いた。エレバンの名前はエレブニから来ている。",
    "src": [
     {
      "name": "Wikipedia「Erebuni Fortress」",
      "url": "https://en.wikipedia.org/wiki/Erebuni_Fortress",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "トラベルjp「【2025年最新】アルメニアでおすすめの観光地14選 ミステリアスな風景の虜に」（2025年4月14日更新）",
      "url": "https://www.travel.co.jp/guide/matome/3139/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "ararat",
    "icon": "mountain",
    "q": "アララト山は？",
    "a": "街の南に見える山。ノアの箱舟がたどり着いたと伝わる。いまはトルコの側にある。",
    "src": [
     {
      "name": "Wikipedia「Mount Ararat」",
      "url": "https://en.wikipedia.org/wiki/Mount_Ararat",
      "seen": "2026-11-23"
     },
     {
      "name": "トラベルjp「【2025年最新】アルメニアでおすすめの観光地14選 ミステリアスな風景の虜に」（2025年4月14日更新）",
      "url": "https://www.travel.co.jp/guide/matome/3139/",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "pink",
    "icon": "plaza",
    "q": "なぜピンクシティ？",
    "a": "共和国広場の建物は、ピンクや黄色の凝灰岩で建てた。濃さのちがうピンクの凝灰岩から「ピンクシティ」と呼ばれる。",
    "src": [
     {
      "name": "Wikipedia「Republic Square, Yerevan」",
      "url": "https://en.wikipedia.org/wiki/Republic_Square,_Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "VELTRA「エレバン市内半日観光ツアー＜貸切／日本語ガイド／4時間／エレバン発＞」（2026年2月20日）",
      "url": "https://www.veltra.com/jp/europe/armenia/a/188787",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "areas": [
   {
    "id": "republic",
    "name": "共和国広場周辺",
    "color": "#ffc4d2",
    "lead": "ピンクと黄色の石の建物に囲まれた広場のまわりに、歴史博物館、週末の青空市、ブルーモスク、大聖堂が集まる街のまん中",
    "see": [
     "republic",
     "gregory",
     "bluemosque",
     "vernissage",
     "history",
     "gum",
     "parajanov"
    ],
    "plan": [
     2,
     1,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Republic Square, Yerevan」",
      "url": "https://en.wikipedia.org/wiki/Republic_Square,_Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Հանրապետության հրապարակ」",
      "url": "https://www.openstreetmap.org/node/9740281135",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Հայաստանի պատմության թանգարան」",
      "url": "https://www.openstreetmap.org/node/1436858079",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Vernissage」",
      "url": "https://www.openstreetmap.org/way/31662730",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Կապույտ Մզկիթ」",
      "url": "https://www.openstreetmap.org/way/235841246",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Սուրբ Գրիգոր Լուսավորիչ եկեղեցի」",
      "url": "https://www.openstreetmap.org/way/31622320",
      "seen": "2026-11-23"
     }
    ],
    "local": {
     "text": "Հանրապետության հրապարակ",
     "lang": "hy",
     "roman": "Hanrapetutyan hraparak"
    }
   },
   {
    "id": "cascade",
    "name": "カスケード周辺",
    "color": "#d9ccf5",
    "lead": "オペラ座から北の丘へ、大きな階段のカスケードが上る",
    "see": [
     "cascade",
     "matenadaran",
     "mother",
     "opera",
     "northern"
    ],
    "plan": [
     1,
     2,
     2
    ],
    "src": [
     {
      "name": "Wikipedia「Yerevan Cascade」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Cascade",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Կասկադ」",
      "url": "https://www.openstreetmap.org/way/83688503",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Օպերայի և բալետի ազգային ակադեմիական թատրոն」",
      "url": "https://www.openstreetmap.org/relation/19203229",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Հյուսիսային պողոտա」",
      "url": "https://www.openstreetmap.org/way/430406007",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Երևանի Մատենադարան」",
      "url": "https://www.openstreetmap.org/relation/20960090",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Մայր Հայաստան」",
      "url": "https://www.openstreetmap.org/node/375565244",
      "seen": "2026-11-23"
     }
    ],
    "body": "丘の上には古文書館と、街を見下ろす母なるアルメニア像。",
    "local": {
     "text": "Կասկադ",
     "lang": "hy",
     "roman": "Kaskad"
    }
   }
  ]
 },
 "todo": [
  {
   "id": "cascade",
   "title": "大階段カスケードを上りたい！",
   "lead": "上の段から、アララト山と街を見渡す",
   "what": "テラスと噴水と彫刻のある大きな階段の建物、カスケードを上る。建築家タマニャンが描いた街の計画の軸の上にあり、街の象徴の1つ。上の段からは、アララト山と街のまん中が見渡せる。",
   "how": "オペラ座のすぐ北。ふもとの彫刻の庭には、ボテロなど世界の作家の作品が並ぶ。",
   "time": "中のエスカレーターは毎日8時〜20時。段ごとに外へ出られる。",
   "money": "1階と中のエスカレーターはただ。カフェスジアン美術館の展示は大人1,000ドラム（約440円）。",
   "tip": "夕方に上ると、街とアララト山の眺めがいい。",
   "route": "上ったら道を渡って勝利公園へ。母なるアルメニア像と遊園地がある。",
   "see": [
    "cascade",
    "mother"
   ],
   "src": [
    {
     "name": "Wikipedia「Yerevan Cascade」",
     "url": "https://en.wikipedia.org/wiki/Yerevan_Cascade",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Yerevan」",
     "url": "https://en.wikivoyage.org/wiki/Yerevan",
     "seen": "2026-11-23"
    }
   ],
   "went": {
    "date": "2026-04-25",
    "scene": {
     "v": "5cWmE-KqHLA",
     "t": 19830,
     "date": "2026-04-25"
    },
    "story": [
     "上の段からは、富士山のような山が見えました。もう一度行った日は、次の日の大事な移動に備えて、エスカレーターで上へ。エスカレーターでも、上まで結構長かったです。"
    ],
    "more": {
     "href": "/travel/armenia/yerevan/cascade",
     "title": "カスケードの大階段を上ってきた【2026年4〜5月】"
    }
   }
  },
  {
   "id": "khorovats",
   "title": "本場のホロヴァツを食べたい！",
   "lead": "肉も野菜も炭火で焼く、アルメニアのバーベキュー",
   "what": "アルメニアの焼き肉、ホロヴァツを食べる。豚・羊・鶏・牛の塊を焼き、玉ねぎとアルメニアのスパイスで味をつける。トマト・なす・ピーマンも一緒に焼く。ひき肉で作るものはキャバブと呼び、ホロヴァツより安い。焼いた肉は、薄いパンのラヴァシュで包んで食べる。",
   "how": "郷土料理のチェーン、カラスの品書きに鶏のホロヴァツがある。ラヴァシュ4枚と玉ねぎ、香草が付く。",
   "time": "",
   "money": "カラスの鶏のホロヴァツは3,730ドラム（約1,640円）。",
   "tip": "夏は、フラズダン渓谷の店で地元の人がホロヴァツとザリガニを囲む。値段は店でまちまちなので、先に確かめる。",
   "route": "",
   "see": [],
   "src": [
    {
     "name": "Wikipedia「Khorovats」",
     "url": "https://en.wikipedia.org/wiki/Khorovats",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Armenia」",
     "url": "https://en.wikivoyage.org/wiki/Armenia",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Lavash」",
     "url": "https://en.wikipedia.org/wiki/Lavash",
     "seen": "2026-11-23"
    },
    {
     "name": "Glovo「KARAS」（配達の品書き）",
     "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Yerevan」",
     "url": "https://en.wikivoyage.org/wiki/Yerevan",
     "seen": "2026-11-23"
    }
   ],
   "eat": [
    "khorovats",
    "kebab",
    "lavash"
   ]
  },
  {
   "id": "brandy",
   "title": "アララトのブランデー工場を見学したい！",
   "lead": "1887年から続く蒸留所の熟成庫へ",
   "what": "アララトの名前でブランデーを造るエレバン・ブランデー工場の、博物館のツアーに入る。1887年に商人のネルセス・タイリャンがエレバンに開いた蒸留所が始まり。1902年のボルドーの博覧会で、コニャックの造りの基準にかなうと認められた。1940年代にできた「ドヴィン」は、イギリスの首相に好まれたと伝わる。",
   "how": "フラズダン川を見下ろす建物で、1953年にできた。",
   "time": "ツアーは、いまも使う熟成庫を通って、たいてい試飲で終わる。",
   "money": "",
   "tip": "アルメニアのブランデーは土産の定番。街なかにアララトのブランデーだけを売る店がいくつもあり、空港の免税店でも買える。",
   "route": "",
   "see": [
    "brandy"
   ],
   "src": [
    {
     "name": "Wikipedia「Yerevan Brandy Company」",
     "url": "https://en.wikipedia.org/wiki/Yerevan_Brandy_Company",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Yerevan」",
     "url": "https://en.wikivoyage.org/wiki/Yerevan",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "vernissage",
   "title": "ヴェルニサージュでおみやげを探したい！",
   "lead": "週末だけの青空市に、じゅうたんと工芸品",
   "what": "共和国広場の近くで週末に開く青空の市、ヴェルニサージュを歩く。古いじゅうたん、木彫りとバックギャモンの盤、絵、みやげ、古い磁器、刺しゅう、石の細工が並ぶ。",
   "how": "アラム通りとブザンド通りのあいだの公園。共和国広場から歩ける。",
   "time": "開くのは土曜と日曜。",
   "money": "",
   "tip": "古いじゅうたんを国の外へ持ち出すには、文化省の輸出の証明が要る。買うときに売り手に取ってもらう。",
   "route": "",
   "see": [
    "vernissage"
   ],
   "src": [
    {
     "name": "Wikivoyage「Armenia」",
     "url": "https://en.wikivoyage.org/wiki/Armenia",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Yerevan」",
     "url": "https://en.wikivoyage.org/wiki/Yerevan",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "garni",
   "title": "ガルニ神殿とゲガルド修道院へ行きたい！",
   "lead": "ギリシャ風の神殿と、岩を掘った世界遺産",
   "what": "エレバンの東の、ガルニ神殿とゲガルド修道院を1日で回る。ガルニ神殿はイオニア式の柱が並ぶ神殿で、キリスト教より前のアルメニアのいちばんの象徴。ゲガルド修道院は山を半分掘って造った修道院で、ユネスコの世界遺産。神殿の下のガルニ渓谷には、六角の玄武岩の柱が並ぶ。",
   "how": "エレバンのガイ・バスステーションから266番のマルシュルートカ（乗合バス）でガルニへ。約30分おきに出る。いちばん速いのはタクシー。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "先にゲガルドへ行き、そこからガルニへ戻るように回るとよい。ガルニ・ゴグト・ゲガルドのあいだは3〜4kmずつ。",
   "see": [
    "garni",
    "geghard",
    "symphony"
   ],
   "src": [
    {
     "name": "Wikivoyage「Garni」",
     "url": "https://en.wikivoyage.org/wiki/Garni",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Temple of Garni」",
     "url": "https://en.wikipedia.org/wiki/Temple_of_Garni",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Geghard」",
     "url": "https://en.wikipedia.org/wiki/Geghard",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Garni Gorge」",
     "url": "https://en.wikipedia.org/wiki/Garni_Gorge",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "khorvirap",
   "title": "ホル・ヴィラップからアララト山を見たい！",
   "lead": "トルコ国境の近くで、聖書の山を正面に",
   "what": "トルコとの国境の近くの修道院、ホル・ヴィラップへ行き、アララト山を見る。国の守護聖人グレゴリウスが、王に13年閉じ込められた所。アララト山は、ノアの箱舟がたどり着いたと伝わる山。",
   "how": "エレバンの南バスステーションから467番のマルシュルートカで、修道院から1.5kmの所まで行ける。",
   "time": "",
   "money": "",
   "tip": "グレゴリウスが閉じ込められた深い穴には、いまも下りられる。",
   "route": "エレバン発の1日ツアーは、ホル・ヴィラップと、さらに南のノラヴァンクを合わせて回ることが多い。",
   "see": [
    "khorvirap",
    "noravank"
   ],
   "src": [
    {
     "name": "Wikipedia「Khor Virap」",
     "url": "https://en.wikipedia.org/wiki/Khor_Virap",
     "seen": "2026-11-23"
    },
    {
     "name": "トラベルjp「【2025年最新】アルメニアでおすすめの観光地14選 ミステリアスな風景の虜に」（2025年4月14日更新）",
     "url": "https://www.travel.co.jp/guide/matome/3139/",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Mount Ararat」",
     "url": "https://en.wikipedia.org/wiki/Mount_Ararat",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Artashat」",
     "url": "https://en.wikivoyage.org/wiki/Artashat",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "etchmiadzin",
   "title": "世界最古の大聖堂へ行きたい！",
   "lead": "301年にキリスト教を選んだ国の総本山",
   "what": "アルメニア使徒教会の総本山、エチミアジン大聖堂へ行く。言い伝えでは301〜303年にグレゴリウスが建てた。世界でいちばん古い大聖堂とされることが多い。アルメニアは301年に、世界で最初に公式にキリスト教を受け入れた国。",
   "how": "エレバンの中央（キリキア）バスステーションから203番のマルシュルートカで20〜30分。",
   "time": "",
   "money": "",
   "tip": "",
   "route": "途中のズヴァルトノツ大聖堂の跡でも降りられる。同じ街に、618年に建てた聖フリプシメ教会がある。",
   "see": [
    "etchmiadzin",
    "hripsime",
    "zvartnots"
   ],
   "src": [
    {
     "name": "Wikipedia「Etchmiadzin Cathedral」",
     "url": "https://en.wikipedia.org/wiki/Etchmiadzin_Cathedral",
     "seen": "2026-11-23"
    },
    {
     "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
     "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Echmiadzin」",
     "url": "https://en.wikivoyage.org/wiki/Echmiadzin",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Saint Hripsime Church」",
     "url": "https://en.wikipedia.org/wiki/Saint_Hripsime_Church",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "sevan",
   "title": "セヴァン湖へ日帰りしたい！",
   "lead": "コーカサスでいちばん大きな湖と、半島の修道院",
   "what": "アルメニアとコーカサスでいちばん大きな湖、セヴァン湖へ行く。湖の北西の半島に、874年にできた修道院セヴァナヴァンクが建つ。修道院からは、広い湖が見渡せる。",
   "how": "エレバンの北バスステーションから、セヴァンの町へマルシュルートカで1時間。",
   "time": "",
   "money": "",
   "tip": "湖のあたりの名物は魚とザリガニ。焼いても、揚げても、燻しても出す。",
   "route": "",
   "see": [
    "sevanavank"
   ],
   "src": [
    {
     "name": "Wikipedia「Lake Sevan」",
     "url": "https://en.wikipedia.org/wiki/Lake_Sevan",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Sevanavank」",
     "url": "https://en.wikipedia.org/wiki/Sevanavank",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikivoyage「Sevan」",
     "url": "https://en.wikivoyage.org/wiki/Sevan",
     "seen": "2026-11-23"
    }
   ],
   "went": {
    "date": "2026-05-20",
    "scene": {
     "v": "haHAczqMooM",
     "t": 9900,
     "date": "2026-05-20"
    },
    "story": [
     "市バスとミニバスを乗り継ぎ、最後はヒッチハイクで湖へ。対岸が見えないほど大きな湖で、ほとりの店で1,200円の魚料理を食べました。"
    ],
    "more": {
     "href": "/travel/armenia/yerevan/sevan",
     "title": "セヴァン湖に行ってきた【2026年5月】"
    },
    "say": "これはええわ。"
   }
  }
 ],
 "see": {
  "items": [
   {
    "id": "republic",
    "name": "共和国広場",
    "local": {
     "text": "Հանրապետության հրապարակ",
     "lang": "hy",
     "roman": "Hanrapetutyan hraparak"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/yerevan-republic-square-armenia-150da468-960.webp",
     "small": "/guide/armenia/yerevan/photos/yerevan-republic-square-armenia-150da468-500.webp",
     "w": 960,
     "h": 638,
     "alt": "共和国広場。ピンクの石の建物が広場を囲む",
     "kind": "photo",
     "credit": {
      "by": "Vyacheslav Argenberg",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Yerevan,_Republic_Square,_Armenia.jpg"
     }
    },
    "body": "街のまん中の広場。楕円の広場と、音楽に合わせて動く噴水の池からなる。まわりの5つの建物は、ピンクと黄色の凝灰岩で建てた、アルメニアの模様を使った新古典様式。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Republic+Square+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Republic Square, Yerevan」",
      "url": "https://en.wikipedia.org/wiki/Republic_Square,_Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Yerevan,_Republic_Square,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.178026,
     "lon": 44.512877
    },
    "area": "republic"
   },
   {
    "id": "cascade",
    "name": "カスケード",
    "local": {
     "text": "Կասկադ",
     "lang": "hy",
     "roman": "Kaskad"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/yerevan-cascade-of-yerevan-armen-172fee4d-960.webp",
     "small": "/guide/armenia/yerevan/photos/yerevan-cascade-of-yerevan-armen-172fee4d-500.webp",
     "w": 960,
     "h": 638,
     "alt": "カスケード。白い大きな階段と噴水",
     "kind": "photo",
     "credit": {
      "by": "Vyacheslav Argenberg",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Yerevan,_Cascade_of_Yerevan,_Armenia.jpg"
     }
    },
    "body": "テラス・噴水・彫刻・展示室を段々に重ねた、大きな階段の建物。街のまん中と北の高台を結び、街の象徴の1つ。",
    "facts": [
     {
      "label": "入場",
      "text": "1階と、上まで行く中のエスカレーターはただ。カフェスジアン美術館の展示は大人1,000ドラム（約440円）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Cascade+Complex+Yerevan&hl=ja",
    "todo": [
     "cascade"
    ],
    "src": [
     {
      "name": "Wikipedia「Yerevan Cascade」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Cascade",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Yerevan,_Cascade_of_Yerevan,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-25",
     "scene": {
      "v": "5cWmE-KqHLA",
      "t": 19950,
      "date": "2026-04-25"
     },
     "story": [
      "夕日まで20分しかなく、大階段を爆速で登りました。階段に座る人たちが見ていたのは、夕日の沈む方向ではありませんでした。最後にもう一度行った日は、エスカレーターで上へ。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/cascade",
      "title": "カスケードの大階段を上ってきた【2026年4〜5月】"
     },
     "say": "無限映画館。みんなほら、みんな座ってるやろ。この階段とこにここにな映画館ですよ。無限映画館。"
    },
    "geo": {
     "lat": 40.191463,
     "lon": 44.515587
    },
    "area": "cascade"
   },
   {
    "id": "matenadaran",
    "name": "マテナダラン（古文書館）",
    "local": {
     "text": "Մատենադարան",
     "lang": "hy",
     "roman": "Matenadaran"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/matenadaran-building-exterior-ye-d51f1520-960.webp",
     "small": "/guide/armenia/yerevan/photos/matenadaran-building-exterior-ye-d51f1520-500.webp",
     "w": 960,
     "h": 720,
     "alt": "マテナダランの建物と、前に立つ像",
     "kind": "photo",
     "credit": {
      "by": "Furkan Akkurt",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Matenadaran_building_exterior_Yerevan_2026.jpg"
     }
    },
    "body": "アルメニアの写本を世界でいちばん多く持つ、博物館と研究所を兼ねた古文書館。前に、アルメニア文字を作ったメスロプ・マシュトツの像が立つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Matenadaran+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Matenadaran」",
      "url": "https://en.wikipedia.org/wiki/Matenadaran",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Matenadaran_building_exterior_Yerevan_2026.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.192461,
     "lon": 44.522209
    },
    "area": "cascade"
   },
   {
    "id": "genocide",
    "name": "アルメニア人虐殺記念館（ツィツェルナカベルド）",
    "local": {
     "text": "Ծիծեռնակաբերդ",
     "lang": "hy",
     "roman": "Tsitsernakaberd"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/genocide-memorial-complex-from-a-5a4f2942-960.webp",
     "small": "/guide/armenia/yerevan/photos/genocide-memorial-complex-from-a-5a4f2942-500.webp",
     "w": 960,
     "h": 717,
     "alt": "丘の上の虐殺記念碑を上から",
     "kind": "photo",
     "credit": {
      "by": "Aleksey Chalabyan (a.k.a. Xelgen)",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Genocide_Memorial_complex_from_air_on_a_sunny_day,_September_2017.jpg"
     }
    },
    "body": "1915年ごろのオスマン帝国によるアルメニア人虐殺の犠牲者をしのぶ、国の記念碑と博物館。1967年に「つばめの砦」という名の丘に建てた。毎年4月24日には多くの人が花を手向ける。",
    "facts": [
     {
      "label": "開館",
      "text": "記念碑はいつでも入れる。博物館は火〜日曜の11時〜16時で、入場はただ"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tsitsernakaberd+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Tsitsernakaberd」",
      "url": "https://en.wikipedia.org/wiki/Tsitsernakaberd",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Genocide_Memorial_complex_from_air_on_a_sunny_day,_September_2017.jpg",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-17",
     "scene": {
      "v": "2y4IbYu-ZeI",
      "t": 8910,
      "date": "2026-05-17"
     },
     "pic": {
      "src": "/travel/armenia/yerevan/hill-960.webp",
      "small": "/travel/armenia/yerevan/hill-480.webp",
      "w": 960,
      "h": 1280,
      "alt": "丘の上から見た街。雲のすきまから光が差す（2026年5月17日）",
      "kind": "card",
      "date": "2026-05-17"
     },
     "story": [
      "街から坂道や階段を登って歩きました。記念碑の44mの塔は民族の復活、12の石板は失われた土地を表すそうです。犠牲者は100万〜150万人とされると聞いて、えげつないと感じました。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/memorial",
      "title": "ジェノサイド記念碑まで歩いてきた【2026年5月】"
     }
    },
    "geo": {
     "lat": 40.185718,
     "lon": 44.489184
    }
   },
   {
    "id": "mother",
    "name": "母なるアルメニア像",
    "local": {
     "text": "Մայր Հայաստան",
     "lang": "hy",
     "roman": "Mayr Hayastan"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/2025-05-18-yerevan-mother-armeni-af3c5b98-960.webp",
     "small": "/guide/armenia/yerevan/photos/2025-05-18-yerevan-mother-armeni-af3c5b98-500.webp",
     "w": 960,
     "h": 640,
     "alt": "剣を持って立つ母なるアルメニア像",
     "kind": "photo",
     "credit": {
      "by": "Alexkom000",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:2025-05-18_Yerevan,_Mother_Armenia_Monument_1.jpg"
     }
    },
    "body": "勝利公園から街を見下ろす女性の像。1967年に、スターリンの像に代えて立てた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Mother+Armenia+Yerevan&hl=ja",
    "todo": [
     "cascade"
    ],
    "src": [
     {
      "name": "Wikipedia「Mother Armenia」",
      "url": "https://en.wikipedia.org/wiki/Mother_Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:2025-05-18_Yerevan,_Mother_Armenia_Monument_1.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.195155,
     "lon": 44.524674
    },
    "area": "cascade"
   },
   {
    "id": "gregory",
    "name": "聖グレゴリー啓蒙者大聖堂",
    "local": {
     "text": "Սուրբ Գրիգոր Լուսավորիչ",
     "lang": "hy",
     "roman": "Surb Grigor Lusavorich"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/saint-gregory-the-illuminator-ca-756e2d3b-960.webp",
     "small": "/guide/armenia/yerevan/photos/saint-gregory-the-illuminator-ca-756e2d3b-500.webp",
     "w": 960,
     "h": 640,
     "alt": "聖グレゴリー啓蒙者大聖堂の外観",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Saint_Gregory_the_Illuminator_Cathedral,_Yerevan_(2026).jpg"
     }
    },
    "body": "アルメニア使徒教会でいちばん大きな大聖堂。キリスト教の国になって1700年を記念して、2001年にできた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Saint+Gregory+the+Illuminator+Cathedral+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Saint Gregory the Illuminator Cathedral, Yerevan」",
      "url": "https://en.wikipedia.org/wiki/Saint_Gregory_the_Illuminator_Cathedral,_Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Saint_Gregory_the_Illuminator_Cathedral,_Yerevan_(2026).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.172074,
     "lon": 44.516871
    },
    "area": "republic"
   },
   {
    "id": "bluemosque",
    "name": "ブルーモスク",
    "local": {
     "text": "Կապույտ մզկիթ",
     "lang": "hy",
     "roman": "Kapuyt mzkit"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/blue-mosque-yerevan-in-2019-06-77c7c76d-960.webp",
     "small": "/guide/armenia/yerevan/photos/blue-mosque-yerevan-in-2019-06-77c7c76d-500.webp",
     "w": 960,
     "h": 540,
     "alt": "ブルーモスクの青いタイルの丸屋根",
     "kind": "photo",
     "credit": {
      "by": "23artashes",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Blue_Mosque,_Yerevan_in_2019_06.jpg"
     }
    },
    "body": "18世紀にイランのハーンが建てたシーア派のモスク。街のまん中に残るいちばん古い建物の1つで、いまアルメニアで礼拝をしているただ1つのモスク。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Blue+Mosque+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Blue Mosque, Yerevan」",
      "url": "https://en.wikipedia.org/wiki/Blue_Mosque,_Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Blue_Mosque,_Yerevan_in_2019_06.jpg",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-23",
     "scene": {
      "v": "1KWNenbPR5A",
      "t": 1190,
      "date": "2026-05-23"
     },
     "story": [
      "ブルーモスクの前を通りました。アルメニアにも、ブルーモスクがあるんです。"
     ]
    },
    "geo": {
     "lat": 40.177883,
     "lon": 44.50556
    },
    "area": "republic"
   },
   {
    "id": "vernissage",
    "name": "ヴェルニサージュ",
    "local": {
     "text": "Վեռնիսաժ",
     "lang": "hy",
     "roman": "Vernisazh"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/vernissage-in-yerevan-9a7f6d02-960.webp",
     "small": "/guide/armenia/yerevan/photos/vernissage-in-yerevan-9a7f6d02-500.webp",
     "w": 960,
     "h": 640,
     "alt": "ヴェルニサージュの工芸品の売り場",
     "kind": "photo",
     "credit": {
      "by": "acid holic",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Vernissage_in_yerevan.jpg"
     }
    },
    "body": "共和国広場の近くで、土曜と日曜に開く工芸品と古物の青空市。",
    "facts": [
     {
      "label": "開く日",
      "text": "土曜・日曜"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Vernissage+Yerevan&hl=ja",
    "todo": [
     "vernissage"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Vernissage_in_yerevan.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.175976,
     "lon": 44.51818
    },
    "area": "republic"
   },
   {
    "id": "erebuni",
    "name": "エレブニ要塞",
    "local": {
     "text": "Էրեբունի",
     "lang": "hy",
     "roman": "Erebuni"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/2014-erywan-erebuni-ruiny-twierd-263cc5e1-960.webp",
     "small": "/guide/armenia/yerevan/photos/2014-erywan-erebuni-ruiny-twierd-263cc5e1-500.webp",
     "w": 960,
     "h": 541,
     "alt": "丘の上のエレブニ要塞の石の壁",
     "kind": "photo",
     "credit": {
      "by": "Marcin Konsek",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:2014_Erywa%C5%84,_Erebuni,_Ruiny_twierdzy_(01).jpg"
     }
    },
    "body": "ウラルトゥ王国の要塞の町の跡。紀元前782年から丘の上に建ち、エレバンという名前はエレブニから来ている。",
    "facts": [
     {
      "label": "入場",
      "text": "博物館と遺跡で1,000ドラム（約440円）、遺跡だけなら500ドラム。火〜日曜の10時半〜16時半"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Erebuni+Fortress+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Erebuni Fortress」",
      "url": "https://en.wikipedia.org/wiki/Erebuni_Fortress",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:2014_Erywa%C5%84,_Erebuni,_Ruiny_twierdzy_(01).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.140305,
     "lon": 44.538147
    },
    "line": "中心から4.7km"
   },
   {
    "id": "opera",
    "name": "オペラ座（オペラ・バレエ劇場）",
    "local": {
     "text": "Օպերայի և բալետի թատրոն",
     "lang": "hy",
     "roman": "Operayi yev baleti tatron"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/exterior-of-opera-house-of-yerev-08475eda-960.webp",
     "small": "/guide/armenia/yerevan/photos/exterior-of-opera-house-of-yerev-08475eda-500.webp",
     "w": 960,
     "h": 593,
     "alt": "円い形のオペラ座の建物",
     "kind": "photo",
     "credit": {
      "by": "Armenak Margarian",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Exterior_of_Opera_house_of_Yerevan_2019-05-16.jpg"
     }
    },
    "body": "1933年に開いた、オペラとバレエの劇場。設計は街の計画を手がけた建築家タマニャン。前は自由広場。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Yerevan+Opera+Theatre&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Yerevan Opera Theatre」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Opera_Theatre",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Exterior_of_Opera_house_of_Yerevan_2019-05-16.jpg",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-25",
     "scene": {
      "v": "2u4HfAvQdsI",
      "t": 200,
      "date": "2026-05-19"
     },
     "story": [
      "オペラ座の前の広場では、スティッチのダーツに当てると景品がもらえる遊びをやっていました。遠くから投げたダーツが外れて飛んでくるのが怖くて、ベンチの端でサングラスをして備えていました。"
     ]
    },
    "geo": {
     "lat": 40.185749,
     "lon": 44.515063
    },
    "area": "cascade"
   },
   {
    "id": "history",
    "name": "アルメニア歴史博物館",
    "local": {
     "text": "Հայաստանի պատմության թանգարան",
     "lang": "hy",
     "roman": "Hayastani patmutyan tangaran"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/yerevan-history-museum-of-armeni-9870ea29-960.webp",
     "small": "/guide/armenia/yerevan/photos/yerevan-history-museum-of-armeni-9870ea29-500.webp",
     "w": 960,
     "h": 638,
     "alt": "夜の歴史博物館。共和国広場に面した建物",
     "kind": "photo",
     "credit": {
      "by": "Vyacheslav Argenberg",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Yerevan,_History_Museum_of_Armenia_at_night,_Armenia.jpg"
     }
    },
    "body": "共和国広場に建つ国の博物館。1920年にでき、40万点を持つ。考古・貨幣・民族の部がある。",
    "facts": [
     {
      "label": "入場",
      "text": "2,000ドラム（約880円）。火〜土曜の11時〜18時、日曜は11時〜17時"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=History+Museum+of+Armenia+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「History Museum of Armenia」",
      "url": "https://en.wikipedia.org/wiki/History_Museum_of_Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Yerevan,_History_Museum_of_Armenia_at_night,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.178514,
     "lon": 44.513861
    },
    "area": "republic"
   },
   {
    "id": "brandy",
    "name": "エレバン・ブランデー工場（アララト）",
    "local": {
     "text": "Երևանի կոնյակի գործարան",
     "lang": "hy",
     "roman": "Yerevani konyaki gortsaran"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/ararat-brandy-factory-in-yerevan-8f3fd389-960.webp",
     "small": "/guide/armenia/yerevan/photos/ararat-brandy-factory-in-yerevan-8f3fd389-500.webp",
     "w": 960,
     "h": 720,
     "alt": "川の上に建つブランデー工場の建物",
     "kind": "photo",
     "credit": {
      "by": "Brejnev",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Ararat_brandy_factory_in_Yerevan,_Winter_time.JPG"
     }
    },
    "body": "アララトの名前でブランデーを造る工場。フラズダン川を見下ろす建物は1953年にでき、敷地の中にアララト博物館がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Yerevan+Brandy+Company&hl=ja",
    "todo": [
     "brandy"
    ],
    "src": [
     {
      "name": "Wikipedia「Yerevan Brandy Company」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Brandy_Company",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Ararat_brandy_factory_in_Yerevan,_Winter_time.JPG",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.176361,
     "lon": 44.496414
    }
   },
   {
    "id": "gum",
    "name": "グム市場",
    "local": {
     "text": "ԳՈՒՄ շուկա",
     "lang": "hy",
     "roman": "GUM shuka"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/dried-fruits-in-gum-market-yerev-bec0fab8-960.webp",
     "small": "/guide/armenia/yerevan/photos/dried-fruits-in-gum-market-yerev-bec0fab8-500.webp",
     "w": 960,
     "h": 720,
     "alt": "グム市場に山と積まれたドライフルーツ",
     "kind": "photo",
     "credit": {
      "by": "Armineaghayan",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Dried_fruits_in_Gum_Market,_Yerevan.jpg"
     }
    },
    "body": "タシール・モールの近くの、屋根つきの大きな市場。果物と野菜、ドライフルーツ、肉、干したハーブの売り場がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=GUM+Market+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Dried_fruits_in_Gum_Market,_Yerevan.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.167397,
     "lon": 44.514941
    },
    "area": "republic"
   },
   {
    "id": "northern",
    "name": "北大通り",
    "local": {
     "text": "Հյուսիսային պողոտա",
     "lang": "hy",
     "roman": "Hyusisayin poghota"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/yerevan-northern-avenue-armenia-996311d8-960.webp",
     "small": "/guide/armenia/yerevan/photos/yerevan-northern-avenue-armenia-996311d8-500.webp",
     "w": 960,
     "h": 540,
     "alt": "北大通り。両側に石の建物が並ぶ歩行者の道",
     "kind": "photo",
     "credit": {
      "by": "Vyacheslav Argenberg",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Yerevan,_Northern_Avenue,_Armenia.jpg"
     }
    },
    "body": "オペラ座と共和国広場を結ぶ、歩行者の通り。2008年に開いた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Northern+Avenue+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Yerevan,_Northern_Avenue,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.182178,
     "lon": 44.514677
    },
    "area": "cascade"
   },
   {
    "id": "parajanov",
    "name": "パラジャーノフ博物館",
    "local": {
     "text": "Սերգեյ Փարաջանովի թանգարան",
     "lang": "hy",
     "roman": "Sergey Parajanovi tangaran"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/sergei-parajanov-museum-e6ea630a-960.webp",
     "small": "/guide/armenia/yerevan/photos/sergei-parajanov-museum-e6ea630a-500.webp",
     "w": 960,
     "h": 693,
     "alt": "峡谷の上に建つパラジャーノフ博物館",
     "kind": "photo",
     "credit": {
      "by": "Tiia Monto",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Sergei_Parajanov_Museum.jpg"
     }
    },
    "body": "ソ連の映画監督で美術家のセルゲイ・パラジャーノフの家の博物館。コラージュの作品で知られる。",
    "facts": [
     {
      "label": "入場",
      "text": "1,000ドラム（約440円）。毎日10時〜17時半"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sergei+Parajanov+Museum+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Sergei Parajanov Museum」",
      "url": "https://en.wikipedia.org/wiki/Sergei_Parajanov_Museum",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Sergei_Parajanov_Museum.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.178897,
     "lon": 44.50007
    },
    "area": "republic"
   },
   {
    "id": "yerevanlake",
    "name": "エレバン湖",
    "local": {
     "text": "Երևանյան լիճ",
     "lang": "hy",
     "roman": "Yerevanyan lich"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/view-of-yerevan-lake-01-f7b86dfa-960.webp",
     "small": "/guide/armenia/yerevan/photos/view-of-yerevan-lake-01-f7b86dfa-500.webp",
     "w": 960,
     "h": 540,
     "alt": "エレバン湖と、まわりの街",
     "kind": "photo",
     "credit": {
      "by": "Violmsyan",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:View_of_Yerevan_Lake_01.jpg"
     }
    },
    "body": "街の南西、フラズダン渓谷の先にある人造の湖。1963年に造られ、広さは57.45ha。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Yerevan+Lake&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Yerevan Lake」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Lake",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:View_of_Yerevan_Lake_01.jpg",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-16",
     "scene": {
      "v": "c-ogYrwX8iA",
      "t": 4140,
      "date": "2026-05-16"
     },
     "pic": {
      "src": "/travel/armenia/yerevan/lake-960.webp",
      "small": "/travel/armenia/yerevan/lake-480.webp",
      "w": 960,
      "h": 720,
      "alt": "エレバン湖。曇り空の下の湖と、対岸の建物（2026年5月16日）",
      "kind": "card",
      "date": "2026-05-16"
     },
     "story": [
      "街から歩いて1時間ほど。大きくて、晴れていればアララト山も見える眺めでしたが、近くで見ると汚くてびっくりしました。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/lake",
      "title": "エレバン湖まで歩いてきた【2026年5月】"
     }
    },
    "geo": {
     "lat": 40.161597,
     "lon": 44.478547
    },
    "line": "中心から3.4km"
   },
   {
    "id": "garni",
    "name": "ガルニ神殿",
    "local": {
     "text": "Գառնիի տաճար",
     "lang": "hy",
     "roman": "Garnii tachar"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/garni-temple-front-view-2026-5a243e28-960.webp",
     "small": "/guide/armenia/yerevan/photos/garni-temple-front-view-2026-5a243e28-500.webp",
     "w": 960,
     "h": 699,
     "alt": "ガルニ神殿。石の階段の上に柱が並ぶ",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Garni_Temple_(front_view,_2026).jpg"
     }
    },
    "body": "イオニア式の柱が並ぶ神殿で、キリスト教より前のアルメニアのいちばんの象徴。旧ソ連でただ1つ、ほぼ形の残るヘレニズムの建物。1679年の地震で崩れ、1970年代に建て直した。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Garni+Temple&hl=ja",
    "todo": [
     "garni"
    ],
    "src": [
     {
      "name": "Wikipedia「Temple of Garni」",
      "url": "https://en.wikipedia.org/wiki/Temple_of_Garni",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Garni」",
      "url": "https://en.wikivoyage.org/wiki/Garni",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Garni_Temple_(front_view,_2026).jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.112341,
     "lon": 44.730219
    },
    "line": "中心から20km"
   },
   {
    "id": "geghard",
    "name": "ゲガルド修道院",
    "local": {
     "text": "Գեղարդ",
     "lang": "hy",
     "roman": "Geghard"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/geghard-monastery-armenia-f3277b75-960.webp",
     "small": "/guide/armenia/yerevan/photos/geghard-monastery-armenia-f3277b75-500.webp",
     "w": 960,
     "h": 638,
     "alt": "崖を背にしたゲガルド修道院",
     "kind": "photo",
     "credit": {
      "by": "Vyacheslav Argenberg",
      "lic": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Geghard_Monastery,_Armenia.jpg"
     }
    },
    "body": "山を半分掘って造った修道院で、ユネスコの世界遺産。4世紀にグレゴリウスが洞窟の泉に開き、いまの本堂は1215年にできた。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Geghard+Monastery+Garni&hl=ja",
    "todo": [
     "garni"
    ],
    "src": [
     {
      "name": "Wikipedia「Geghard」",
      "url": "https://en.wikipedia.org/wiki/Geghard",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Geghard_Monastery,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.140327,
     "lon": 44.81839
    },
    "line": "中心から26km"
   },
   {
    "id": "symphony",
    "name": "石のシンフォニー（ガルニ渓谷）",
    "local": {
     "text": "Քարերի սիմֆոնիա",
     "lang": "hy",
     "roman": "Kareri simfonia"
    },
    "rank": 3,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/symphony-of-stones-armenia-2e5059f1-960.webp",
     "small": "/guide/armenia/yerevan/photos/symphony-of-stones-armenia-2e5059f1-500.webp",
     "w": 960,
     "h": 640,
     "alt": "渓谷の壁に並ぶ六角の石の柱",
     "kind": "photo",
     "credit": {
      "by": "mk4oto https://www.instagram.com/mk4oto/",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Symphony_of_Stones,_Armenia.jpg"
     }
    },
    "body": "アザト川が削ったガルニ渓谷の壁に、六角の玄武岩の柱が並ぶ。上の岬にガルニ神殿が建つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Symphony+of+Stones+Garni&hl=ja",
    "todo": [
     "garni"
    ],
    "src": [
     {
      "name": "Wikipedia「Garni Gorge」",
      "url": "https://en.wikipedia.org/wiki/Garni_Gorge",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Garni」",
      "url": "https://en.wikivoyage.org/wiki/Garni",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Symphony_of_Stones,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.115054,
     "lon": 44.741141
    },
    "line": "中心から21km"
   },
   {
    "id": "etchmiadzin",
    "name": "エチミアジン大聖堂",
    "local": {
     "text": "Էջմիածնի Մայր տաճար",
     "lang": "hy",
     "roman": "Ejmiatsni Mayr tachar"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/etchmiadzin-cathedral-2024-c50c0ddc-960.webp",
     "small": "/guide/armenia/yerevan/photos/etchmiadzin-cathedral-2024-c50c0ddc-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "エチミアジン大聖堂の石の外観",
     "kind": "photo",
     "credit": {
      "by": "Antisyntagmatarchos",
      "lic": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Etchmiadzin_Cathedral_2024.jpg"
     }
    },
    "body": "アルメニア使徒教会の総本山。言い伝えでは301〜303年にグレゴリウスが建て、世界でいちばん古い大聖堂とされることが多い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Etchmiadzin+Cathedral+Vagharshapat&hl=ja",
    "todo": [
     "etchmiadzin"
    ],
    "src": [
     {
      "name": "Wikipedia「Etchmiadzin Cathedral」",
      "url": "https://en.wikipedia.org/wiki/Etchmiadzin_Cathedral",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Echmiadzin」",
      "url": "https://en.wikivoyage.org/wiki/Echmiadzin",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Etchmiadzin_Cathedral_2024.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.16184,
     "lon": 44.291116
    },
    "line": "中心から19km"
   },
   {
    "id": "hripsime",
    "name": "聖フリプシメ教会",
    "local": {
     "text": "Սուրբ Հռիփսիմե",
     "lang": "hy",
     "roman": "Surb Hripsime"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/saint-hripsime-church-1cbfc021-960.webp",
     "small": "/guide/armenia/yerevan/photos/saint-hripsime-church-1cbfc021-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "聖フリプシメ教会の石の外観",
     "kind": "photo",
     "credit": {
      "by": "MSyuzan",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Saint_Hripsime_Church.jpg"
     }
    },
    "body": "618年に、アルメニアのキリスト教化の話に出てくるローマの乙女フリプシメの墓の上に建てた教会。アルメニアの古い建築の傑作とされる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Saint+Hripsime+Church+Vagharshapat&hl=ja",
    "todo": [
     "etchmiadzin"
    ],
    "src": [
     {
      "name": "Wikipedia「Saint Hripsime Church」",
      "url": "https://en.wikipedia.org/wiki/Saint_Hripsime_Church",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Saint_Hripsime_Church.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.16698,
     "lon": 44.309558
    },
    "line": "中心から17km"
   },
   {
    "id": "zvartnots",
    "name": "ズヴァルトノツ古代遺跡",
    "local": {
     "text": "Զվարթնոց",
     "lang": "hy",
     "roman": "Zvartnots"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/zvartnots-cathedral-2018-09-28-ec4d3d23-960.webp",
     "small": "/guide/armenia/yerevan/photos/zvartnots-cathedral-2018-09-28-ec4d3d23-500.webp",
     "w": 960,
     "h": 640,
     "alt": "ズヴァルトノツの大聖堂の跡。円く並ぶ柱",
     "kind": "photo",
     "credit": {
      "by": "Սարո Հովհաննիսյան",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Zvartnots_Cathedral_2018-09-28.jpg"
     }
    },
    "body": "643〜652年に建てた大聖堂の跡。外が円い三層の建物で、中世のアルメニアの建物では他に例が無い。小さな博物館がある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Zvartnots+Cathedral+Vagharshapat&hl=ja",
    "todo": [
     "etchmiadzin"
    ],
    "src": [
     {
      "name": "Wikipedia「Zvartnots Cathedral」",
      "url": "https://en.wikipedia.org/wiki/Zvartnots_Cathedral",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Echmiadzin」",
      "url": "https://en.wikivoyage.org/wiki/Echmiadzin",
      "seen": "2026-11-23"
     },
     {
      "name": "トラベルjp「【2025年最新】アルメニアでおすすめの観光地14選 ミステリアスな風景の虜に」（2025年4月14日更新）",
      "url": "https://www.travel.co.jp/guide/matome/3139/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Zvartnots_Cathedral_2018-09-28.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 40.160031,
     "lon": 44.336343
    },
    "line": "中心から15km"
   },
   {
    "id": "khorvirap",
    "name": "ホル・ヴィラップ修道院",
    "local": {
     "text": "Խոր Վիրապ",
     "lang": "hy",
     "roman": "Khor Virap"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/khor-virap-monastery-and-mount-a-a8e0597d-960.webp",
     "small": "/guide/armenia/yerevan/photos/khor-virap-monastery-and-mount-a-a8e0597d-500.webp",
     "w": 960,
     "h": 639,
     "alt": "ホル・ヴィラップ修道院と、うしろのアララト山",
     "kind": "photo",
     "credit": {
      "by": "Andrew Behesnilian ( MrAndrew47 )",
      "lic": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Khor_Virap_Monastery_and_Mount_Ararat,_Armenia.jpg"
     }
    },
    "body": "トルコとの国境の近く、アララト平原の修道院。国の守護聖人グレゴリウスが王に13年閉じ込められた所で、巡礼の地。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Khor+Virap+Monastery+Lusarat&hl=ja",
    "todo": [
     "khorvirap"
    ],
    "src": [
     {
      "name": "Wikipedia「Khor Virap」",
      "url": "https://en.wikipedia.org/wiki/Khor_Virap",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Khor_Virap_Monastery_and_Mount_Ararat,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 39.878388,
     "lon": 44.57635
    },
    "line": "中心から34km"
   },
   {
    "id": "sevanavank",
    "name": "セヴァナヴァンク（セヴァン修道院）",
    "local": {
     "text": "Սևանավանք",
     "lang": "hy",
     "roman": "Sevanavank"
    },
    "rank": 1,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/sevanavank-on-1-09-23-22-b6009454-960.webp",
     "small": "/guide/armenia/yerevan/photos/sevanavank-on-1-09-23-22-b6009454-500.webp",
     "w": 960,
     "h": 1280,
     "alt": "湖の半島に建つ石の修道院",
     "kind": "photo",
     "credit": {
      "by": "Anastasiya Lvova (1988–)",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Sevanavank_on_1.09.23,_22.jpg"
     }
    },
    "body": "セヴァン湖の北西の半島に建つ修道院で、874年にできた。もとは島だったが、スターリンの時代に湖の水を抜いて水面が約20m下がり、半島になった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sevanavank&hl=ja",
    "todo": [
     "sevan"
    ],
    "src": [
     {
      "name": "Wikipedia「Sevanavank」",
      "url": "https://en.wikipedia.org/wiki/Sevanavank",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Sevanavank_on_1.09.23,_22.jpg",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-20",
     "scene": {
      "v": "haHAczqMooM",
      "t": 15780,
      "date": "2026-05-20"
     },
     "story": [
      "丘の上に教会が2つあって、片方は中に入れました。中は石でできていて、カトリックの大聖堂とは雰囲気が全然違います。ふもとは、お祭りみたいなにぎわいでした。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/sevan",
      "title": "セヴァン湖に行ってきた【2026年5月】"
     }
    },
    "geo": {
     "lat": 40.563984,
     "lon": 45.010808
    },
    "line": "中心から60km"
   },
   {
    "id": "noravank",
    "name": "ノラヴァンク修道院",
    "local": {
     "text": "Նորավանք",
     "lang": "hy",
     "roman": "Noravank"
    },
    "rank": 2,
    "pic": {
     "src": "/guide/armenia/yerevan/photos/surb-astvatsatsin-church-noravan-afe9179f-960.webp",
     "small": "/guide/armenia/yerevan/photos/surb-astvatsatsin-church-noravan-afe9179f-500.webp",
     "w": 960,
     "h": 1464,
     "alt": "赤い崖の下のノラヴァンク修道院",
     "kind": "photo",
     "credit": {
      "by": "Petar Milošević",
      "lic": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Surb_Astvatsatsin_Church,_Noravank_Monastery,_Armenia.jpg"
     }
    },
    "body": "エレバンから122km、アマグ川の細い渓谷にある13世紀の修道院。向かいの赤い崖と、壁から突き出た石の階段で上る2階建ての教会で知られる。",
    "facts": [
     {
      "label": "行き方",
      "text": "エレバンのゴルツァラナイン駅の近くから、イェゲグナゾル行きのマルシュルートカ（乗合バス）で1時間半〜2時間、2,000ドラム（2025年4月）。8時〜18時に出る"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Noravank+Monastery+Areni&hl=ja",
    "src": [
     {
      "name": "Wikipedia「Noravank」",
      "url": "https://en.wikipedia.org/wiki/Noravank",
      "seen": "2026-11-23"
     },
     {
      "name": "トラベルjp「【2025年最新】アルメニアでおすすめの観光地14選 ミステリアスな風景の虜に」（2025年4月14日更新）",
      "url": "https://www.travel.co.jp/guide/matome/3139/",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yeghegnadzor」",
      "url": "https://en.wikivoyage.org/wiki/Yeghegnadzor",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikimedia Commons（ファイルのページ）",
      "url": "https://commons.wikimedia.org/wiki/File:Surb_Astvatsatsin_Church,_Noravank_Monastery,_Armenia.jpg",
      "seen": "2026-11-23"
     }
    ],
    "geo": {
     "lat": 39.684823,
     "lon": 45.233039
    },
    "line": "中心から82km"
   }
  ],
  "far": [
   {
    "id": "erebuni",
    "name": "エレブニ要塞",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Erebuni+Fortress+Yerevan&hl=ja",
    "km": 4.7
   },
   {
    "id": "yerevanlake",
    "name": "エレバン湖",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Yerevan+Lake&hl=ja",
    "km": 3.4
   },
   {
    "id": "garni",
    "name": "ガルニ神殿",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Garni+Temple&hl=ja",
    "km": 20
   },
   {
    "id": "geghard",
    "name": "ゲガルド修道院",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Geghard+Monastery+Garni&hl=ja",
    "km": 26
   },
   {
    "id": "symphony",
    "name": "石のシンフォニー",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Symphony+of+Stones+Garni&hl=ja",
    "km": 21
   },
   {
    "id": "etchmiadzin",
    "name": "エチミアジン大聖堂",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Etchmiadzin+Cathedral+Vagharshapat&hl=ja",
    "km": 19
   },
   {
    "id": "hripsime",
    "name": "聖フリプシメ教会",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Saint+Hripsime+Church+Vagharshapat&hl=ja",
    "km": 17
   },
   {
    "id": "zvartnots",
    "name": "ズヴァルトノツ古代遺跡",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Zvartnots+Cathedral+Vagharshapat&hl=ja",
    "km": 15
   },
   {
    "id": "khorvirap",
    "name": "ホル・ヴィラップ修道院",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Khor+Virap+Monastery+Lusarat&hl=ja",
    "km": 34
   },
   {
    "id": "sevanavank",
    "name": "セヴァナヴァンク",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Sevanavank&hl=ja",
    "km": 60
   },
   {
    "id": "noravank",
    "name": "ノラヴァンク修道院",
    "what": "",
    "maps": "https://www.google.com/maps/search/?api=1&query=Noravank+Monastery+Areni&hl=ja",
    "km": 82
   }
  ],
  "map": {
   "mid": "1zMbxaSaOM8CckwwCOhLgnGuK0MyB_Y4",
   "title": "エレバン｜見たいもの",
   "ll": "40.1813,44.5069",
   "z": 13,
   "pins": 25
  }
 },
 "eat": {
  "kinds": [
   {
    "id": "local",
    "label": "アルメニアの料理"
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
    "id": "khorovats",
    "name": "ホロヴァツ（アルメニアのバーベキュー）",
    "local": {
     "text": "Khorovats",
     "lang": "hy",
     "roman": "Khorovats"
    },
    "body": "肉の塊を焼き、玉ねぎとアルメニアのスパイスで味をつける。トマト・なす・ピーマンも一緒に焼く。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラス（郷土料理のチェーン）"
     },
     {
      "label": "豚肉",
      "text": "豚・羊・鶏・牛のどれでも作る。カラスの品書きのホロヴァツは鶏。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Khorovats+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "karas"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Khorovats」",
      "url": "https://en.wikipedia.org/wiki/Khorovats",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「KARAS」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kebab",
    "name": "キャバブ（ひき肉の串焼き）",
    "local": {
     "text": "Kebab",
     "lang": "hy",
     "roman": "Kebab"
    },
    "body": "ホロヴァツをひき肉で作ったもので、ホロヴァツより安い。",
    "facts": [
     {
      "label": "豚肉",
      "text": "ひき肉が何の肉かは、出どころに書かれていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kebab+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-23",
     "scene": {
      "v": "o7OIStvxT0Q",
      "t": 4870,
      "date": "2026-04-23"
     },
     "story": [
      "マーケット街の串焼き屋で、チキンの串を温めてもらいました。中身はつくね・ネギ・コリアンダーで、トルティーヤの上につくね串を敷いたような味。串焼きとトルティーヤで200円ぐらいでした。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/market",
      "title": "エレバンの市場を歩いてきた【2026年4〜5月】"
     },
     "say": "このでかで200円はやばない?"
    }
   },
   {
    "id": "lavash",
    "name": "ラヴァシュ（薄いパン）",
    "local": {
     "text": "Lavash",
     "lang": "hy",
     "roman": "Lavash"
    },
    "body": "薄くて大きなパン。タンドールの壁に貼って焼く。アルメニアでは毎日食べ、焼いた肉を包むのにも使う。",
    "facts": [
     {
      "label": "どこで",
      "text": "アート・ランチ（食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Lavash+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "artlunch"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Lavash」",
      "url": "https://en.wikipedia.org/wiki/Lavash",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-21",
     "scene": {
      "v": "YFxoJhKOasQ",
      "t": 3300,
      "date": "2026-05-22"
     },
     "story": [
      "スーパーでは、ラヴァシュを1枚ずつ量り売りで買えます。パンがおいしくて、毎日のようにスーパーで買って食べていました。街のパン屋では、ラヴァシュを機械を使って伸ばして焼いていました。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/bakery",
      "title": "エレバンのパン屋でガタを食べてきた【2026年4〜5月】"
     }
    }
   },
   {
    "id": "dolma",
    "name": "ドルマ（ぶどうの葉の包み）",
    "local": {
     "text": "Dolma",
     "lang": "hy",
     "roman": "Dolma"
    },
    "body": "ぶどうの葉で包む。キャベツの葉や、ピーマン・なすに詰める作りもある。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラス（郷土料理のチェーン）"
     },
     {
      "label": "豚肉",
      "text": "中の肉が何の肉かは、品書きに書かれていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dolma+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "karas"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「KARAS」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "khash",
    "name": "ハシュ（牛の足の煮込み）",
    "local": {
     "text": "Khash",
     "lang": "hy",
     "roman": "Khash"
    },
    "body": "牛や羊の頭・足・胃を煮た、アルメニアの古い料理。冬のごちそうで、慣れの要る味と言われる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラス（郷土料理のチェーン）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Khash+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "karas"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Khash (dish)」",
      "url": "https://en.wikipedia.org/wiki/Khash_(dish)",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "harissa",
    "name": "ハリサ（麦と肉の粥）",
    "local": {
     "text": "Harissa",
     "lang": "hy",
     "roman": "Harissa"
    },
    "body": "煮てほぐした鶏か羊の肉と、ひいた麦を粥のように煮る。復活祭に食べ、国の料理とされる。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラス（郷土料理のチェーン）・アート・ランチ（食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Harissa+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "karas",
     "artlunch"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "spas",
    "name": "スパス（ヨーグルトのスープ）",
    "local": {
     "text": "Spas",
     "lang": "hy",
     "roman": "Spas"
    },
    "body": "発酵乳マツンのスープ。香草と皮をむいた麦を入れ、卵と小麦粉で分離を防ぐ。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラス（郷土料理のチェーン）・アート・ランチ（食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Spas+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "karas",
     "artlunch"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Spas (soup)」",
      "url": "https://en.wikipedia.org/wiki/Spas_(soup)",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "lahmajo",
    "name": "ラフマジョ（薄焼きの肉のパン）",
    "local": {
     "text": "Lahmajo",
     "lang": "hy",
     "roman": "Lahmajo"
    },
    "body": "薄い生地に、ひき肉・刻んだ野菜・香草をのせて焼く。",
    "facts": [
     {
      "label": "どこで",
      "text": "トゥン・ラフマジョ（ラフマジョの店）・メル・タゲ（ラフマジョの店）・オスト（ラフマジョとハチャプリ）・カラス（郷土料理のチェーン）"
     },
     {
      "label": "豚肉",
      "text": "のせるひき肉は牛か羊が多い。オストとカラスの品書きは牛肉。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Lahmajo+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "tunlahmajo",
     "mertaghe",
     "ost",
     "karas"
    ],
    "kinds": [
     "local",
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Lahmacun」",
      "url": "https://en.wikipedia.org/wiki/Lahmacun",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「OST」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/ost",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「KARAS」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-18",
     "scene": {
      "v": "j_yInDStbKg",
      "t": 3450,
      "date": "2026-05-18"
     },
     "story": [
      "ラフマジュンは、アルメニアのソウルフード。前に食べようとしたときは、売り切れでした。裏路地の奥の専門店は、探すのに迷いましたが、まずザクロのソースを使ったアラビックを頼みました。2枚でお腹いっぱいになり、閉店時間を過ぎて店から追い出されました。"
     ]
    }
   },
   {
    "id": "khachapuri",
    "name": "ハチャプリ（チーズのパン）",
    "local": {
     "text": "Khachapuri",
     "lang": "hy",
     "roman": "Khachapuri"
    },
    "body": "チーズを詰めて焼く、ジョージアのパン。",
    "facts": [
     {
      "label": "どこで",
      "text": "オスト（ラフマジョとハチャプリ）・アート・ランチ（食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Khachapuri+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "ost",
     "artlunch"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Wikipedia「Khachapuri」",
      "url": "https://en.wikipedia.org/wiki/Khachapuri",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-21",
     "scene": {
      "v": "k-3fN6Ynsok",
      "t": 3695,
      "date": "2026-04-21"
     },
     "story": [
      "中東寄りの店ザ・ピザでは、品書きのアジャリ・ハチャプリが480円。ジョージアより安かったです。"
     ]
    }
   },
   {
    "id": "shaurma",
    "name": "シャウルマ（エレバン風のシャワルマ）",
    "local": {
     "text": "Shaurma",
     "lang": "hy",
     "roman": "Shaurma"
    },
    "body": "肉と、細く削ったじゃがいも・玉ねぎ・香草・トマト・漬けたきゅうりを巻く。",
    "facts": [
     {
      "label": "どこで",
      "text": "トゥマニャン・シャウルマ・マスター・クラス（シャウルマとラフマジョ）"
     },
     {
      "label": "豚肉",
      "text": "トゥマニャン・シャウルマの品書きには鶏と豚がある。マスター・クラスの品書きは鶏。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Shaurma+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "tumanyan",
     "masterclass"
    ],
    "kinds": [
     "quick"
    ],
    "src": [
     {
      "name": "Glovo「Tumanyan Shaurma」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/tumanyan-shaurma",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「Master Class」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/master-class-yrv",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "zhingyalov",
    "name": "ジンガロフ・ハツ（香草を包んだパン）",
    "local": {
     "text": "Jingalov Hats",
     "lang": "hy",
     "roman": "Jingalov Hats"
    },
    "body": "刻んだ香草と青い野菜を包んだ平たいパン。アルツァフとシュニクのアルメニア人の料理。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Jingalov+Hats+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Zhingyalov hats」",
      "url": "https://en.wikipedia.org/wiki/Zhingyalov_hats",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "manti",
    "name": "マンティ（小さな肉のギョウザ）",
    "local": {
     "text": "Manti",
     "lang": "hy",
     "roman": "Manti"
    },
    "body": "ギョウザの一種。ラフマジョの店メル・タゲでも出す。",
    "facts": [
     {
      "label": "どこで",
      "text": "メル・タゲ（ラフマジョの店）"
     },
     {
      "label": "豚肉",
      "text": "中の肉が何の肉かは、出どころに書かれていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Manti+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "mertaghe"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "kufta",
    "name": "キュフタ（肉団子）",
    "local": {
     "text": "Kufta",
     "lang": "hy",
     "roman": "Kufta"
    },
    "body": "肉を使った団子の料理。挽き割り麦と合わせたイシュリ・キュフタもある。",
    "facts": [
     {
      "label": "どこで",
      "text": "アート・ランチ（食堂）"
     },
     {
      "label": "豚肉",
      "text": "アート・ランチの品書きのキュフタは牛肉。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Kufta+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "artlunch"
    ],
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「Art Lunch」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/art-lunch-yrv-yrv",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "ghapama",
    "name": "ガパマ（かぼちゃの詰め物）",
    "local": {
     "text": "Ghapama",
     "lang": "hy",
     "roman": "Ghapama"
    },
    "body": "中をくりぬいたかぼちゃに、米・バター・はちみつ・ドライフルーツ・木の実を詰めて焼く。デザートとして出すことが多い。",
    "facts": [
     {
      "label": "豚肉",
      "text": "肉を詰める作りもあり、何の肉かは出どころに書かれていない。"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ghapama+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "local",
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Ghapama」",
      "url": "https://en.wikipedia.org/wiki/Ghapama",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "sujukh",
    "name": "スジュフ（干したソーセージ）",
    "local": {
     "text": "Sujukh",
     "lang": "hy",
     "roman": "Sujukh"
    },
    "body": "牛肉で作る、干して塩漬けにした辛いソーセージ。トルコのスジュクより詰まっていて辛い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Sujukh+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Armenian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Armenian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "matnakash",
    "name": "マトナカシュ（ふんわりしたパン）",
    "local": {
     "text": "Matnakash",
     "lang": "hy",
     "roman": "Matnakash"
    },
    "body": "発酵させたふっくらしたパン。指で筋をつけて形を作り、甘い紅茶を塗って焼くので皮が金色になる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Matnakash+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikipedia「Matnakash」",
      "url": "https://en.wikipedia.org/wiki/Matnakash",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "matsun",
    "name": "マツン（ヨーグルト）",
    "local": {
     "text": "Matsun",
     "lang": "hy",
     "roman": "Matsun"
    },
    "body": "何世紀も前からある、アルメニアのヨーグルト。冷やして食べると、夏の暑い日にさっぱりする。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Matsun+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "local"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "gata",
    "name": "ガタ（甘いパン）",
    "local": {
     "text": "Gata",
     "lang": "hy",
     "roman": "Gata"
    },
    "body": "アルメニアの甘いパン。町や地方で形が違う。よく食べられるコリツは、小麦粉・バター・砂糖の詰め物を入れる。",
    "facts": [
     {
      "label": "どこで",
      "text": "アート・ランチ（食堂）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Gata+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "artlunch"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Gata (food)」",
      "url": "https://en.wikipedia.org/wiki/Gata_(food)",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-24",
     "scene": {
      "v": "7R7xote6efA",
      "t": 7110,
      "date": "2026-04-24"
     },
     "story": [
      "フードマーケットのパン屋で買ったガタは100円。パイ生地に、カスタードのような中身が入っていました。お気に入りのパン屋のガタは、固くてずっしり重く、中に砂糖菓子のようなものが入っていて、おいしかったです。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/bakery",
      "title": "エレバンのパン屋でガタを食べてきた【2026年4〜5月】"
     }
    }
   },
   {
    "id": "ponchik",
    "name": "ポンチク（カスタードの揚げパン）",
    "local": {
     "text": "Ponchik",
     "lang": "hy",
     "roman": "Ponchik"
    },
    "body": "揚げた生地にカスタードを詰め、粉砂糖をかけたドーナツ。",
    "facts": [
     {
      "label": "どこで",
      "text": "グランド・キャンディのポンチク屋"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ponchik+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "grandcandy"
    ],
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "apricot",
    "name": "あんず（アプリコット）",
    "local": {
     "text": "Tsiran",
     "lang": "hy",
     "roman": "Tsiran"
    },
    "body": "あんずの学名プルヌス・アルメニアカは、アルメニアにちなむ。生でも、干しても食べる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tsiran+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "sweets"
    ],
    "src": [
     {
      "name": "Wikipedia「Armenian cuisine」",
      "url": "https://en.wikipedia.org/wiki/Armenian_cuisine",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-21",
     "scene": {
      "v": "74c2AutI7PY",
      "t": 4950,
      "date": "2026-05-21"
     },
     "story": [
      "あんずを初めて食べました。うまかったです。"
     ]
    }
   },
   {
    "id": "tan",
    "name": "タン（塩味のヨーグルトの飲み物）",
    "local": {
     "text": "Tan",
     "lang": "hy",
     "roman": "Tan"
    },
    "body": "ヨーグルトを水でのばし、塩を少し入れた飲み物。炭酸入りの瓶もある。",
    "facts": [
     {
      "label": "どこで",
      "text": "カラス（郷土料理のチェーン）・オスト（ラフマジョとハチャプリ）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Tan+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "karas",
     "ost"
    ],
    "kinds": [
     "drinks"
    ],
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "brandy",
    "name": "アルメニアのブランデー",
    "local": {
     "text": "Konyak",
     "lang": "hy",
     "roman": "Konyak"
    },
    "body": "アルメニアの人はコニャックとも呼ぶ。熟成が長いほど味がまろやかで、値段も上がる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Konyak+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "areni",
    "name": "アレニのワイン",
    "local": {
     "text": "Areni",
     "lang": "hy",
     "roman": "Areni"
    },
    "body": "アルメニアにしかない赤ぶどうの品種。アレニ村の近くの洞窟で、2007年に世界でいちばん古いワインの醸造所の跡が見つかった。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Areni+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Areni (grape)」",
      "url": "https://en.wikipedia.org/wiki/Areni_(grape)",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "oghi",
    "name": "果物のウォッカ（オギ）",
    "local": {
     "text": "Oghi",
     "lang": "hy",
     "roman": "Oghi"
    },
    "body": "果物だけで造る蒸留酒。いちばん人気は桑の実のトゥティ・オギ。セイヨウサンシュユ・梨・あんず・桃のものもある。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Oghi+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "kinds": [
     "drinks"
    ],
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "karas",
    "name": "カラス（郷土料理のチェーン）",
    "what": "郷土料理のチェーン。品書きに鶏のホロヴァツ（3,730ドラム）・ドルマ（2,160ドラム）・ハシュ（2,730ドラム）・ハリサ（1,370ドラム）・スパス（950ドラム）・ラフマジョ（480ドラム）・タン。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Karas+Yerevan&hl=ja",
    "src": [
     {
      "name": "Glovo「KARAS」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Karas",
    "km": 4.5,
    "went": false
   },
   {
    "id": "artlunch",
    "name": "アート・ランチ（食堂）",
    "what": "スープと家庭料理の食堂。品書きにハリサ（930ドラム）・スパス（560ドラム）・キュフタ（1,080ドラム）・ガタ（100gで250ドラム）・ラヴァシュ（50gで60ドラム）・ハチャプリ・タン。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Art+Lunch+Yerevan&hl=ja",
    "src": [
     {
      "name": "Glovo「Art Lunch」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/art-lunch-yrv-yrv",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Art Lunch",
    "km": 3.1,
    "went": false
   },
   {
    "id": "tunlahmajo",
    "name": "トゥン・ラフマジョ（ラフマジョの店）",
    "what": "とても安いラフマジョの店で、いつも地元の人でいっぱい。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Tun+Lahmajo+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Tun Lahmajo"
   },
   {
    "id": "mertaghe",
    "name": "メル・タゲ（ラフマジョの店）",
    "what": "トゥマニャン通りの小さなラフマジョの店。マンティと、地方のラザニアに似たノラハルスもある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Mer+Taghe+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Mer Taghe",
    "went": false
   },
   {
    "id": "ost",
    "name": "オスト（ラフマジョとハチャプリ）",
    "what": "安い軽食の店。品書きにラフマジョ（1,400ドラム）・メグレリ風のハチャプリ（3,500ドラム）・タン（500ドラム）。",
    "maps": "https://www.google.com/maps/search/?api=1&query=OST+Yerevan&hl=ja",
    "src": [
     {
      "name": "Glovo「OST」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/ost",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ],
    "roman": "OST",
    "went": false
   },
   {
    "id": "tumanyan",
    "name": "トゥマニャン・シャウルマ",
    "what": "エレバン風のシャウルマの地元のチェーンで、街に十数店ある。品書きに鶏のシャウルマ（XL 1,950ドラム）・豚のシャウルマ（XL 2,050ドラム）。どちらも細く削ったじゃがいもを巻く。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Tumanyan+Shaurma+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Glovo「Tumanyan Shaurma」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/tumanyan-shaurma",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Tumanyan Shaurma"
   },
   {
    "id": "masterclass",
    "name": "マスター・クラス（シャウルマとラフマジョ）",
    "what": "シャウルマとラフマジョの店。品書きに鶏のシャウルマ（小さいもので820ドラム）・ラフマジョ（1,100ドラム）・タン。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Master+Class+Yerevan&hl=ja",
    "src": [
     {
      "name": "Glovo「Master Class」（配達の品書き）",
      "url": "https://glovoapp.com/en/am/yerevan/stores/master-class-yrv",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Master Class"
   },
   {
    "id": "grandcandy",
    "name": "グランド・キャンディのポンチク屋",
    "what": "ソ連の時代のポンチク屋のあとに入った、菓子の会社グランド・キャンディの店。揚げたてのポンチクを安く出し、地元で作った飴とチョコレートも売る。10時〜20時。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ponchikanots+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Ponchikanots"
   }
  ],
  "map": {
   "mid": "12CdSOmdLz2BDfKIfq_OccAYYpznri5k",
   "title": "エレバン｜食べたいもの",
   "ll": "40.1704,44.4911",
   "z": 12,
   "pins": 8
  }
 },
 "buy": {
  "items": [
   {
    "id": "brandy",
    "name": "アルメニアのブランデー（アララト）",
    "local": {
     "text": "ARARAT",
     "lang": "hy",
     "roman": "ARARAT"
    },
    "body": "土産の定番。街なかにアララトの工場のブランデーだけを売る店がいくつもあり、空港の免税店でも買える。熟成が長いほど高い。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=ARARAT+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Yerevan Brandy Company」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Brandy_Company",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "wine",
    "name": "アレニのワイン",
    "local": {
     "text": "Areni",
     "lang": "hy",
     "roman": "Areni"
    },
    "body": "アルメニアにしかない赤ぶどうの品種アレニのワイン。ヴァヨツ・ゾルの高い所のぶどう畑で多く育つ。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Areni+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "flags": {
     "alcohol": true
    },
    "src": [
     {
      "name": "Wikipedia「Areni (grape)」",
      "url": "https://en.wikipedia.org/wiki/Areni_(grape)",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "carpet",
    "name": "アルメニアのじゅうたん",
    "local": {
     "text": "Հայկական գորգ",
     "lang": "hy",
     "roman": "Haykakan gorg"
    },
    "body": "新しいものも古いものも土産に人気。古いじゅうたんはヴェルニサージュにも並ぶ。古いものを持ち出すには文化省の輸出の証明が要る。",
    "facts": [
     {
      "label": "どこで",
      "text": "ヴェルニサージュ（週末の青空市）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D5%80%D5%A1%D5%B5%D5%AF%D5%A1%D5%AF%D5%A1%D5%B6+%D5%A3%D5%B8%D6%80%D5%A3+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "vernissage"
    ],
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikipedia「Armenian carpet」",
      "url": "https://en.wikipedia.org/wiki/Armenian_carpet",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "khachkar",
    "name": "ハチュカル（十字架石）を彫った石の細工",
    "local": {
     "text": "Խաչքար",
     "lang": "hy",
     "roman": "Khachkar"
    },
    "body": "十字架を彫った石の碑ハチュカルは、中世のアルメニアの美術。彫る技はユネスコの無形文化遺産。ヴェルニサージュには石の細工の売り場がある。",
    "facts": [
     {
      "label": "どこで",
      "text": "ヴェルニサージュ（週末の青空市）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D4%BD%D5%A1%D5%B9%D6%84%D5%A1%D6%80+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "vernissage"
    ],
    "src": [
     {
      "name": "Wikipedia「Khachkar」",
      "url": "https://en.wikipedia.org/wiki/Khachkar",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "duduk",
    "name": "ドゥドゥク（あんずの木の笛）",
    "local": {
     "text": "Դուդուկ",
     "lang": "hy",
     "roman": "Duduk"
    },
    "body": "あんずの木で作る、二枚のリードの笛。ヴェルニサージュには楽器も並ぶ。",
    "facts": [
     {
      "label": "どこで",
      "text": "ヴェルニサージュ（週末の青空市）"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=%D4%B4%D5%B8%D6%82%D5%A4%D5%B8%D6%82%D5%AF+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "vernissage"
    ],
    "src": [
     {
      "name": "Wikipedia「Duduk」",
      "url": "https://en.wikipedia.org/wiki/Duduk",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "driedfruit",
    "name": "ドライフルーツ",
    "local": {
     "text": "Dried fruits",
     "lang": "hy",
     "roman": "Dried fruits"
    },
    "body": "グム市場の中に、ドライフルーツの売り場が並ぶ。種を抜いた干し桃に、くるみと砂糖を詰めたアラニという菓子もある。",
    "facts": [
     {
      "label": "どこで",
      "text": "グム市場"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Dried+fruits+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "gum"
    ],
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-21",
     "scene": {
      "v": "74c2AutI7PY",
      "t": 4530,
      "date": "2026-05-21"
     },
     "story": [
      "エレバンマーケットで干し柿を買おうとしたら、果物をどんどん詰められて、所持金を全部持っていかれました。干し柿は3つで200円。硬めで、思ったより悪くなかったです。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/market",
      "title": "エレバンの市場を歩いてきた【2026年4〜5月】"
     }
    }
   },
   {
    "id": "ttulavash",
    "name": "トゥトゥ・ラヴァシュ（果物の干した板）",
    "local": {
     "text": "Ttu lavash",
     "lang": "hy",
     "roman": "Ttu lavash"
    },
    "body": "すももやあんず、さくらんぼを薄い板に干したもの。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Ttu+lavash+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "jam",
    "name": "くるみやサジーのジャム",
    "local": {
     "text": "Chichkhan",
     "lang": "hy",
     "roman": "Chichkhan"
    },
    "body": "アルメニアでは、とれるものはほとんど何でも瓶に詰める。くるみの実のジャムや、サジー（チチハン）のジャムが土産になる。",
    "facts": [],
    "maps": "https://www.google.com/maps/search/?api=1&query=Chichkhan+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "chocolate",
    "name": "グランド・キャンディの飴とチョコレート",
    "local": {
     "text": "Grand Candy",
     "lang": "hy",
     "roman": "Grand Candy"
    },
    "body": "菓子の会社グランド・キャンディの店は、ポンチクのほかに地元で作った飴とチョコレートを売る。",
    "facts": [
     {
      "label": "どこで",
      "text": "グランド・キャンディのポンチク屋"
     }
    ],
    "maps": "https://www.google.com/maps/search/?api=1&query=Grand+Candy+%D4%B5%D6%80%D6%87%D5%A1%D5%B6&hl=ja",
    "places": [
     "grandcandy"
    ],
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "places": [
   {
    "id": "vernissage",
    "name": "ヴェルニサージュ（週末の青空市）",
    "what": "土曜と日曜に開く青空の市。古いじゅうたん・木彫り・バックギャモンの盤・絵・みやげ・古い磁器・刺しゅう・石の細工・楽器が並ぶ。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Vernissage+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Vernissage",
    "went": false
   },
   {
    "id": "gum",
    "name": "グム市場",
    "what": "タシール・モールの近くの、屋根つきの大きな市場。果物と野菜、ドライフルーツ、肉、干したハーブの売り場がある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=GUM+Market+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "roman": "GUM Market"
   },
   {
    "id": "grandcandy",
    "name": "グランド・キャンディのポンチク屋",
    "what": "ソ連の時代のポンチク屋のあとに入った、菓子の会社グランド・キャンディの店。揚げたてのポンチクを安く出し、地元で作った飴とチョコレートも売る。10時〜20時。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Ponchikanots+Yerevan&hl=ja",
    "src": [
     {
      "name": "Wikivoyage「Yerevan」",
      "url": "https://en.wikivoyage.org/wiki/Yerevan",
      "seen": "2026-11-23"
     }
    ],
    "roman": "Ponchikanots"
   }
  ],
  "map": {
   "mid": "192RePTKUWItbmvLapDuKpaaYo6r-Llg",
   "title": "エレバン｜買いたいもの",
   "ll": "40.1788,44.5170",
   "z": 13,
   "pins": 3
  }
 },
 "videos": {
  "streams": {
   "country": "armenia",
   "city": "エレバン"
  },
  "shorts": []
 },
 "basics": {
  "summary": [
   {
    "id": "season",
    "icon": "sun",
    "label": "旬の季節",
    "value": "5月・9〜10月",
    "lead": "平年の最高気温が20.7〜29.0℃",
    "to": "#guide-season"
   },
   {
    "id": "safety",
    "icon": "key",
    "label": "治安",
    "value": "スリと置き引きに注意",
    "lead": "写真を口実に近づく手口がある",
    "to": "#guide-safety"
   },
   {
    "id": "budget",
    "icon": "wallet",
    "label": "乗り物の目安",
    "value": "空港バス300ドラム",
    "lead": "街のまん中まで約30分",
    "to": "#budget"
   },
   {
    "id": "transit",
    "icon": "bus",
    "label": "移動",
    "value": "地下鉄は1路線",
    "lead": "QRコードかカードで乗る",
    "to": "#guide-transit"
   }
  ],
  "guides": [
   {
    "id": "airport",
    "icon": "plane",
    "title": "空港から市内へ",
    "lead": "201番のバスで街のまん中へ",
    "parts": [
     {
      "h": "",
      "text": "ズヴァルトノツ国際空港（EVN）。街の中心まで車で12km、約20分。"
     },
     {
      "h": "",
      "text": "201番のバスが7時〜23時は30分おき、0時〜6時は1時間おきに出る。片道300ドラム（約130円）で約30分。終点はアミリャン通り。"
     },
     {
      "h": "",
      "text": "タクシーは配車アプリの gg か Yandex Go を使うと、法外な料金を求められにくい。"
     }
    ],
    "src": [
     {
      "name": "Wikipedia「Zvartnots International Airport」",
      "url": "https://en.wikipedia.org/wiki/Zvartnots_International_Airport",
      "seen": "2026-11-23"
     },
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "id": "transit",
    "icon": "bus",
    "title": "市内の乗り物",
    "lead": "地下鉄はQRコードかカード。タクシーはアプリで",
    "parts": [
     {
      "h": "",
      "text": "地下鉄は南北に1本の路線。2024年11月からトークンは使えず、QRコード（Telcellのアプリか端末で買う）か、NFCの銀行カードで払う。"
     },
     {
      "h": "",
      "text": "紙の切符は2025年8月で終わった。"
     },
     {
      "h": "",
      "text": "流しのタクシーは法外な料金を求めることがあるので、gg や Yandex Go の配車アプリを使う。"
     }
    ],
    "src": [
     {
      "name": "Wikipedia「Yerevan Metro」",
      "url": "https://en.wikipedia.org/wiki/Yerevan_Metro",
      "seen": "2026-11-23"
     },
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-05-10",
     "scene": {
      "v": "ey_pIoeVo_8",
      "t": 690,
      "date": "2026-05-10"
     },
     "story": [
      "切符は券売機テルセルで買う形で、バスでは現金もカードも使えませんでした。待っていた49番はなかなか来ず、降りる場所にも迷いました。"
     ],
     "more": {
      "href": "/travel/armenia/yerevan/bus",
      "title": "エレバンの市バスに乗ってきた【2026年5月】"
     }
    }
   },
   {
    "id": "pay",
    "icon": "currency",
    "title": "払いかたとチップ",
    "lead": "通貨はドラム。サービス料に気をつける",
    "parts": [
     {
      "h": "",
      "text": "通貨はドラム（AMD）。1ドラムは約0.44円（2026年11月20日のアルメニア中央銀行のレート）。"
     },
     {
      "h": "",
      "text": "レストランは10%のサービス料を付けるところが増えた。品書きに書いていないこともあるので、聞いて確かめる。"
     },
     {
      "h": "",
      "text": "チップは端数を切り上げるか、10%を置く人が多い。タクシーではふつう要らない。"
     },
     {
      "h": "",
      "text": "現金は合わせて1万米ドル相当まで、申告なしで持ち込める。"
     }
    ],
    "src": [
     {
      "name": "アルメニア中央銀行の為替レート（2026年11月20日）",
      "url": "https://api.cba.am/exchangerates.asmx",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-24",
     "scene": {
      "v": "7R7xote6efA",
      "t": 6900,
      "date": "2026-04-24"
     },
     "story": [
      "ATMで下ろすときに間違えて、1,000円ほどしか下ろせておらず、パン屋で払ったら所持金がちょうど0円になりました。セヴァン湖の店では、カードは使えないと言われたのに、それなら帰りますと言ったら使えました。"
     ]
    }
   },
   {
    "id": "sim",
    "icon": "sim",
    "title": "ネットと SIM",
    "lead": "旅行者には Ucom か Viva",
    "parts": [
     {
      "h": "",
      "text": "携帯の会社は Viva・Team・Ucom の3つ。大きな町に店があり、SIM を買える。"
     },
     {
      "h": "",
      "text": "旅行者には、料金の組み合わせが多く、いろいろな言葉で助けてもらえる Ucom と Viva がよくすすめられる。"
     },
     {
      "h": "",
      "text": "街のカフェは無料の Wi-Fi が多い。"
     }
    ],
    "src": [
     {
      "name": "Wikipedia「Telecommunications in Armenia」",
      "url": "https://en.wikipedia.org/wiki/Telecommunications_in_Armenia",
      "seen": "2026-11-23"
     },
     {
      "name": "Wikivoyage「Armenia」",
      "url": "https://en.wikivoyage.org/wiki/Armenia",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-19",
     "scene": {
      "v": "jTpvux9mM44",
      "t": 3660,
      "date": "2026-04-19"
     },
     "story": [
      "SIMは1ヶ月無制限で1,600円ほど。10分以内に使えると言われたのに、開通まで30分ほどかかって使えず、店に戻って直してもらいました。"
     ]
    }
   },
   {
    "id": "safety",
    "icon": "key",
    "title": "治安のコツ",
    "lead": "スリと、荒い車に気をつける",
    "parts": [
     {
      "h": "",
      "text": "スリと置き引きが多い。貴重品は体に付け、バッグはたすき掛けにして手で押さえる。"
     },
     {
      "h": "",
      "text": "観光地で一緒に写真を撮ろうと声をかけ、肩を組むなどして財布を抜く手口がある。"
     },
     {
      "h": "",
      "text": "運転手は交通の決まりを守らないことが多い。横断歩道でも気をつける。"
     },
     {
      "h": "",
      "text": "知らない人から荷物を預からない。"
     },
     {
      "h": "水道水",
      "text": "水道の水は歯みがきや料理には使えるが、飲むならミネラルウォーターがすすめられている。"
     }
    ],
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ],
    "went": {
     "date": "2026-04-19",
     "scene": {
      "v": "jTpvux9mM44",
      "t": 5530,
      "date": "2026-04-19"
     },
     "story": [
      "差別は受けず、めちゃくちゃ平和だと感じました。ただ、横断歩道は怖くて、信号をつけてほしいと思いました。夜中の1時ごろには、道路で車が衝突する事故を見ました。"
     ]
    }
   },
   {
    "id": "phrases",
    "icon": "phrase",
    "title": "アルメニア語のひとこと",
    "lead": "Բարև ձեզ（バレヴ・ズェズ）＝こんにちは",
    "parts": [],
    "src": [
     {
      "name": "Wikivoyage「Armenian phrasebook」",
      "url": "https://en.wikivoyage.org/wiki/Armenian_phrasebook",
      "seen": "2026-11-23"
     }
    ],
    "words": [
     {
      "local": {
       "text": "Բարև ձեզ",
       "lang": "hy",
       "roman": "barev dzez",
       "kana": "バレヴ・ズェズ"
      },
      "jp": "こんにちは"
     },
     {
      "local": {
       "text": "Բարի լույս",
       "lang": "hy",
       "roman": "bari luys",
       "kana": "バリ・ルイス"
      },
      "jp": "おはようございます"
     },
     {
      "local": {
       "text": "Բարի երեկո",
       "lang": "hy",
       "roman": "bari yereko",
       "kana": "バリ・イェレコ"
      },
      "jp": "こんばんは"
     },
     {
      "local": {
       "text": "Շնորհակալություն",
       "lang": "hy",
       "roman": "shnorhakalutyun",
       "kana": "シュノラカルチュン"
      },
      "jp": "ありがとう"
     },
     {
      "local": {
       "text": "Այո",
       "lang": "hy",
       "roman": "ayo",
       "kana": "アヨ"
      },
      "jp": "はい"
     },
     {
      "local": {
       "text": "Ոչ",
       "lang": "hy",
       "roman": "voch",
       "kana": "ヴォチ"
      },
      "jp": "いいえ"
     },
     {
      "local": {
       "text": "Կներեք",
       "lang": "hy",
       "roman": "knereq",
       "kana": "クネレク"
      },
      "jp": "すみません（呼びかけ）"
     },
     {
      "local": {
       "text": "Խնդրեմ",
       "lang": "hy",
       "roman": "khndrem",
       "kana": "ヘンドレム"
      },
      "jp": "お願いします"
     },
     {
      "local": {
       "text": "Սա ինչ արժե",
       "lang": "hy",
       "roman": "sa inch arzhe",
       "kana": "サ・インチ・アルジェ？"
      },
      "jp": "これはいくらですか？"
     },
     {
      "local": {
       "text": "Ցտեսություն",
       "lang": "hy",
       "roman": "tstesutyun",
       "kana": "ツテスチュン"
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
   "lead": "歩きやすいのは5月と9〜10月",
   "parts": [
    {
     "h": "歩きやすい季節",
     "text": "平年の最高気温は5月24.3℃・9月29.0℃・10月20.7℃。7月は34.0℃、1月は0.6℃。雨は1年を通じて少ない。"
    },
    {
     "h": "祝日",
     "text": "4月24日はアルメニア人虐殺の犠牲者を追悼する日で、国の休み。"
    },
    {
     "h": "時差",
     "text": "アルメニアは UTC+4 で、日本より5時間遅い。"
    }
   ],
   "src": [
    {
     "name": "Wikipedia（日本語）「エレバン」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%A8%E3%83%AC%E3%83%90%E3%83%B3",
     "seen": "2026-11-23"
    },
    {
     "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
     "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Public holidays in Armenia」",
     "url": "https://en.wikipedia.org/wiki/Public_holidays_in_Armenia",
     "seen": "2026-11-23"
    },
    {
     "name": "Wikipedia「Time in Armenia」",
     "url": "https://en.wikipedia.org/wiki/Time_in_Armenia",
     "seen": "2026-11-23"
    }
   ],
   "went": {
    "date": "2026-04-24",
    "scene": {
     "v": "7R7xote6efA",
     "t": 5700,
     "date": "2026-04-24"
    },
    "story": [
     "4月24日の前の晩、帰り道で、ろうそくのようなものを持って音楽を流す大行列に出会いました。昔の大量虐殺を忘れないための行列らしく、道は警察に封鎖されていました。"
    ]
   }
  },
  "budget": {
   "rows": [],
   "tips": [],
   "days": [],
   "extras": [
    {
     "label": "空港バス201番（街のまん中まで）",
     "local": "300ドラム",
     "yen": "130円",
     "src": [
      {
       "name": "Wikipedia「Zvartnots International Airport」",
       "url": "https://en.wikipedia.org/wiki/Zvartnots_International_Airport",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "カフェスジアン美術館（カスケード）",
     "local": "1,000ドラム",
     "yen": "440円",
     "src": [
      {
       "name": "Wikivoyage「Yerevan」",
       "url": "https://en.wikivoyage.org/wiki/Yerevan",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "アルメニア歴史博物館",
     "local": "2,000ドラム",
     "yen": "880円",
     "src": [
      {
       "name": "Wikivoyage「Yerevan」",
       "url": "https://en.wikivoyage.org/wiki/Yerevan",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "エレブニ要塞（博物館と遺跡）",
     "local": "1,000ドラム",
     "yen": "440円",
     "src": [
      {
       "name": "Wikivoyage「Yerevan」",
       "url": "https://en.wikivoyage.org/wiki/Yerevan",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "ノラヴァンクの近くのイェゲグナゾルまでマルシュルートカ",
     "local": "2,000ドラム",
     "yen": "880円",
     "src": [
      {
       "name": "Wikivoyage「Yeghegnadzor」",
       "url": "https://en.wikivoyage.org/wiki/Yeghegnadzor",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "鶏のホロヴァツ（カラス）",
     "local": "3,730ドラム",
     "yen": "1,640円",
     "src": [
      {
       "name": "Glovo「KARAS」（配達の品書き）",
       "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "label": "ラフマジョ（カラス）",
     "local": "480ドラム",
     "yen": "210円",
     "src": [
      {
       "name": "Glovo「KARAS」（配達の品書き）",
       "url": "https://glovoapp.com/en/am/yerevan/stores/karas-yvn",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "rate": "1ドラムは約0.44円。アルメニアのドラム（AMD）は変動相場で、円は1ユーロ＝395.18ドラム・10円＝22.695ドラム（2026年11月20日のアルメニア中央銀行のレート）で直した。",
   "rateSrc": [
    {
     "name": "アルメニア中央銀行の為替レート（2026年11月20日）",
     "url": "https://api.cba.am/exchangerates.asmx",
     "seen": "2026-11-23"
    }
   ]
  },
  "pack": [
   {
    "icon": "passport",
    "label": "パスポート",
    "why": "日本の人は、観光などの180日以内の滞在なら査証が要らない。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "bottle",
    "label": "水のボトル",
    "why": "街の中心の水道の水は歯みがきや料理には使えるが、飲むならミネラルウォーター。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "firstaid",
    "label": "海外旅行の保険",
    "why": "新しい医療の機械を持つ病院は限られている。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "jacket",
    "label": "冬は厚いコート",
    "why": "12〜2月は雪が積もり、マイナス10〜20度まで下がる。",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     }
    ]
   },
   {
    "icon": "sunglasses",
    "label": "夏は日差しの備え",
    "why": "7月の平年の最高気温は34.0℃。",
    "src": [
     {
      "name": "Wikipedia（日本語）「エレバン」",
      "url": "https://ja.wikipedia.org/wiki/%E3%82%A8%E3%83%AC%E3%83%90%E3%83%B3",
      "seen": "2026-11-23"
     }
    ]
   }
  ],
  "climate": {
   "months": [
    {
     "hi": 0.6,
     "lo": -7.8,
     "mm": 22
    },
    {
     "hi": 3.7,
     "lo": -5.3,
     "mm": 25
    },
    {
     "hi": 11.7,
     "lo": 0.3,
     "mm": 30
    },
    {
     "hi": 19.5,
     "lo": 6.9,
     "mm": 37
    },
    {
     "hi": 24.3,
     "lo": 10.8,
     "mm": 44
    },
    {
     "hi": 29.6,
     "lo": 14.7,
     "mm": 21
    },
    {
     "hi": 34.0,
     "lo": 18.8,
     "mm": 9
    },
    {
     "hi": 33.0,
     "lo": 17.8,
     "mm": 8
    },
    {
     "hi": 29.0,
     "lo": 13.3,
     "mm": 8
    },
    {
     "hi": 20.7,
     "lo": 7.0,
     "mm": 27
    },
    {
     "hi": 12.1,
     "lo": 1.4,
     "mm": 23
    },
    {
     "hi": 4.5,
     "lo": -3.6,
     "mm": 23
    }
   ],
   "note": "平均最高と平均最低。エレバン（平年値）",
   "src": [
    {
     "name": "Wikipedia（日本語）「エレバン」",
     "url": "https://ja.wikipedia.org/wiki/%E3%82%A8%E3%83%AC%E3%83%90%E3%83%B3",
     "seen": "2026-11-23"
    }
   ]
  },
  "help": {
   "calls": [
    {
     "num": "102",
     "label": "警察",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "num": "103",
     "label": "救急車",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "num": "101",
     "label": "消防",
     "note": "",
     "src": [
      {
       "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
       "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "embassy": {
    "name": "在アルメニア日本国大使館",
    "address": "Babayan street 23/4, Yerevan 0037",
    "tel": "+374-11-52-30-10",
    "note": "エレバンに日本の大使館がある。",
    "maps": "https://www.google.com/maps/search/?api=1&query=Embassy+of+Japan+in+Armenia+Yerevan&hl=ja",
    "src": [
     {
      "name": "外務省 海外安全ホームページ（アルメニア 安全対策基礎データ。2024年6月20日更新）",
      "url": "https://www.anzen.mofa.go.jp/info/pcsafetymeasure_199.html",
      "seen": "2026-11-23"
     },
     {
      "name": "OpenStreetMap「Ճապոնիայի Դեսպանություն」",
      "url": "https://www.openstreetmap.org/way/1518979292",
      "seen": "2026-11-23"
     }
    ]
   }
  }
 },
 "published": "2026-11-23",
 "updated": "2026-11-23",
 "hash": "3bade7913e7b4dcf"
}
/* END GUIDE */;
