/**
 * `/travel/bulgaria/sofia` の「行った」（行った項目の印・その日のカードの写真・話・場面・一言）。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/bulgaria/sofia/went.json`（組み立て）と `streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_went.py bulgaria/sofia` で焼き直す。
 * 鍵は「節/項目の id」。面の中身（手で組んだ TS）が、項目の id で当てる。
 */
import type { Pic, Went } from "./types";

export const SOFIA_WENT: { updated: string; hash: string; items: Record<string, { pic?: Pic; went: Went }> } = /* BEGIN GUIDE */
{
 "updated": "2026-11-19",
 "hash": "a4acc981962418ff",
 "items": {
  "todo/yogurt": {
   "went": {
    "date": "2026-11-13",
    "scene": {
     "v": "jnKVIXn4qQs",
     "t": 5370,
     "date": "2026-11-13"
    },
    "story": [
     "女性市場ではヨーグルトがなかなか見つからず、やっと見つけたのはふつうのプレーンで、買うほどではなかった。",
     "乳製品専門店まで行くと、プレーンやイチゴ味など、ヨーグルトの種類がとても多かった。あやとが選んだのはイチゴのアイリャン。"
    ]
   },
   "pic": {
    "src": "/travel/bulgaria/sofia/yogurt-shop-960.webp",
    "small": "/travel/bulgaria/sofia/yogurt-shop-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "ソフィアの乳製品の店（Млекарница）の前で、イチゴのアイリャンの瓶を持つ手（2026年11月13日）",
    "kind": "card",
    "date": "2026-11-13"
   }
  },
  "todo/hotspring": {
   "went": {
    "date": "2026-11-16",
    "scene": {
     "v": "2EKBYEnv850",
     "t": 1780,
     "date": "2026-11-16"
    },
    "story": [
     "あやとも蛇口の湯を飲んでみた。温泉卵の汁のような味で、ぬめぬめしていた。"
    ],
    "say": "引くほどまずいです"
   }
  },
  "todo/banitsa": {
   "went": {
    "date": "2026-11-15",
    "scene": {
     "v": "hJ6vFAGX3rI",
     "t": 1925,
     "date": "2026-11-15"
    },
    "story": [
     "あやとが入ったパン屋は、パンの種類が多く、ヨーグルトも売っていた。丸いバニツァを想像していたら、形も中身もさまざまで、アップルシナモンとくるみ、ポテト入りのビーガン、ほうれん草とチーズと卵などが並んでいた。"
    ]
   }
  },
  "todo/xmas": {
   "went": {
    "date": "2026-11-14",
    "scene": {
     "v": "zDHHuafmP1A",
     "t": 11050,
     "date": "2026-11-14"
    },
    "story": [
     "あやとが行ったときは開いた初日の夜で、準備が間に合わず、ホットチョコの店はまだ開いていなかった。ワッフル屋でバナナとストロベリーの両方を頼むと、ミックスにしてくれた。",
     "昼にもう一度通ると、ソーセージの匂いが漂い、夜には分からなかったツリーの飾りまで見えた。"
    ]
   },
   "pic": {
    "src": "/travel/bulgaria/sofia/xmas-market-960.webp",
    "small": "/travel/bulgaria/sofia/xmas-market-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "ソフィアのクリスマスマーケット。赤い飾りのツリーと、屋台に集まる人たち（2026年11月14日）",
    "kind": "card",
    "date": "2026-11-14"
   }
  },
  "see/zhenski-pazar": {
   "went": {
    "date": "2026-11-13",
    "scene": {
     "v": "jnKVIXn4qQs",
     "t": 1800,
     "date": "2026-11-13"
    },
    "story": [
     "あやとが初めて行ったとき、お土産屋の並びを見て想像以上だと驚いた。紅茶やスパイスが瓶で量り売りされ、陶器屋にはコップなどかわいい器が並ぶ。北マケドニアやアルバニアの市場より清潔だと感じたそう。"
    ]
   },
   "pic": {
    "src": "/travel/bulgaria/sofia/zhenski-pazar-960.webp",
    "small": "/travel/bulgaria/sofia/zhenski-pazar-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "ソフィアの女性市場。瓶に入った紅茶やスパイスと、木箱に盛ったナッツ（2026年11月13日）",
    "kind": "card",
    "date": "2026-11-13"
   }
  },
  "see/serdica": {
   "went": {
    "date": "2026-11-13",
    "scene": {
     "v": "2EKBYEnv850",
     "t": 5050,
     "date": "2026-11-16"
    },
    "story": [
     "あやとは初め、石の遺構を温泉の跡だと思った。調べると、古代ローマの都市セルディカの遺跡で、セルディカはソフィアの元の名前だった。",
     "別の日に地下道へ入ると、急にローマ時代の遺跡が現れて、異世界のようだと驚いた。"
    ]
   },
   "pic": {
    "src": "/travel/bulgaria/sofia/serdica-960.webp",
    "small": "/travel/bulgaria/sofia/serdica-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "ソフィアの中心。バーニャ・バシ・モスクと、手前の掘り下げた石の遺構（2026年11月13日）",
    "kind": "card",
    "date": "2026-11-13"
   }
  },
  "see/mineral-bath": {
   "went": {
    "date": "2026-11-16",
    "scene": {
     "v": "2EKBYEnv850",
     "t": 1270,
     "date": "2026-11-16"
    },
    "story": [
     "温泉の蛇口から湯気が立ち、地元の人たちが並んで温泉水を汲んでいた。あやとが触ると湯は熱く、ぬめぬめしていた。"
    ]
   }
  },
  "see/nevsky": {
   "went": {
    "date": "2026-11-17",
    "scene": {
     "v": "aGOz5otlEs8",
     "t": 2290,
     "date": "2026-11-17"
    },
    "story": [
     "あやとの第一印象は、大きくてかっこいい。中には、あやとが正教会では珍しいと話したステンドグラスがあり、壁画は古く、歴史を感じる色合いだった。あやとが行ったときは、2階の入口が閉じていて上がれなかった。"
    ],
    "say": "画面いっぱいにシャンデリアよ"
   }
  },
  "see/vitosha-blvd": {
   "went": {
    "date": "2026-11-16",
    "scene": {
     "v": "2EKBYEnv850",
     "t": 6465,
     "date": "2026-11-16"
    },
    "story": [
     "聖ネデリャ教会の前から歩き出すと、高い建物は少なく、路面の店が続く。あやとは、何でも揃う商店街のようだと言った。"
    ]
   }
  },
  "see/national-theatre": {
   "went": {
    "date": "2026-11-17",
    "scene": {
     "v": "aGOz5otlEs8",
     "t": 845,
     "date": "2026-11-17"
    },
    "story": [
     "あやとは、かっこいい劇場だと言って写真を撮った。"
    ]
   }
  },
  "eat/ayryan": {
   "went": {
    "date": "2026-11-13",
    "scene": {
     "v": "jnKVIXn4qQs",
     "t": 6090,
     "date": "2026-11-13"
    },
    "story": [
     "あやとが乳製品専門店で選んだのは、イチゴのアイリャン。真っピンクでトロトロ、塩気はまったく無く、日本の飲むヨーグルトによく似ていた。",
     "アルメニアで飲んだヨーグルトの飲みものがとてもまずかったので警戒していたが、想像よりずっとおいしかった。"
    ],
    "say": "正味みんなまずいを期待してたやろ"
   },
   "pic": {
    "src": "/travel/bulgaria/sofia/yogurt-shop-960.webp",
    "small": "/travel/bulgaria/sofia/yogurt-shop-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "ソフィアの乳製品の店（Млекарница）の前で、イチゴのアイリャンの瓶を持つ手（2026年11月13日）",
    "kind": "card",
    "date": "2026-11-13"
   }
  },
  "eat/banitsa": {
   "went": {
    "date": "2026-11-15",
    "scene": {
     "v": "hJ6vFAGX3rI",
     "t": 2370,
     "date": "2026-11-15"
    },
    "story": [
     "迷った末に選んだのは、定番らしいチーズと卵のバニツァ。3.6ユーロ（638円）。2階のイートインで食べてみると、チーズは濃厚でしょっぱく、外はパリパリ、中はねっとりしたパイ生地だった。"
    ]
   }
  },
  "eat/musaka": {
   "went": {
    "date": "2026-11-17",
    "scene": {
     "v": "aGOz5otlEs8",
     "t": 6370,
     "date": "2026-11-17"
    },
    "story": [
     "女性市場の中の、ブルガリア料理のファストフード店「ピストル36」で、4ユーロぐらいでお任せにしてもらうと、出てきたのは3ユーロのムサカ。挽き肉・じゃがいも・にんじんにヨーグルトと卵のソースをかけて焼いた家庭料理で、食べてみたあやとのたとえは、肉じゃがの分厚いオムレツ。"
    ]
   }
  },
  "eat/boza": {
   "went": {
    "date": "2026-11-14",
    "scene": {
     "v": "zDHHuafmP1A",
     "t": 2945,
     "date": "2026-11-14"
    },
    "story": [
     "あやとが買ったボザは、1L入りで150円ぐらいだった。"
    ]
   },
   "pic": {
    "src": "/travel/bulgaria/sofia/boza-960.webp",
    "small": "/travel/bulgaria/sofia/boza-480.webp",
    "w": 960,
    "h": 1280,
    "alt": "1L入りのボザの瓶と、ピンクのお菓子（2026年11月14日）",
    "kind": "card",
    "date": "2026-11-14"
   }
  }
 }
}
/* END GUIDE */;
