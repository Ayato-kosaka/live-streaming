/**
 * `/travel/bulgaria/sofia` の「行った」（行った項目の印・その日のカードの写真・話・場面・一言）。**自動生成。手で直さない。**
 *
 * 元は `python/data/guide/bulgaria/sofia/went.json`（組み立て）と `streams/YYYY/MM/*.facts.json`。
 * 直すならそちらを直して、`python3 python/guidebook_went.py bulgaria/sofia` で焼き直す。
 * 鍵は「節/項目の id」。面の中身（手で組んだ TS）が、項目の id で当てる。
 */
import type { Went } from "./types";

export const SOFIA_WENT: { updated: string; hash: string; items: Record<string, { went: Went }> } = /* BEGIN GUIDE */
{
 "updated": "2026-11-20",
 "hash": "034570ef28a11ad8",
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
     "女性市場ではふつうのプレーンしか見つからず、乳製品の専門店まで行って、イチゴのアイリャンを選びました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/yogurt",
     "title": "ソフィアで本場のヨーグルトを探してきた【2026年11月】"
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
     "蛇口の温泉水を飲んでみましたが、正直まずかったです。温泉卵の汁のような味で、ぬめぬめしていました。"
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
     "バニツァを買いに入ったパン屋は、パンの種類が多く、ヨーグルトも売っていました。バニツァは丸いものを想像していたら、形も中身もいろいろ。アップルシナモンとくるみ、ポテト入りのビーガン、ほうれん草とチーズと卵などが並んでいました。"
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
     "行ったのは開いた初日の夜で、準備が間に合っておらず、ホットチョコの店はまだ開いていませんでした。ワッフル屋でバナナとストロベリーの両方を頼んだら、ミックスにしてくれました。",
     "昼にもう一度通ると、ソーセージがたくさん売られていて、フランクフルトの匂いでおなかが減ってきます。ツリーの飾りも凝っていて、夜には分からなかったデコレーションまで見えました。"
    ],
    "pic": {
     "src": "/travel/bulgaria/sofia/xmas-market-960.webp",
     "small": "/travel/bulgaria/sofia/xmas-market-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "ソフィアのクリスマスマーケット。赤い飾りのツリーと、屋台に集まる人たち（2026年11月14日）",
     "kind": "card",
     "date": "2026-11-14"
    }
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
     "紅茶やスパイスが瓶で量り売りされていて、お土産屋の並びは想像以上でした。北マケドニアやアルバニアの市場より清潔だと感じました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/yogurt",
     "title": "ソフィアで本場のヨーグルトを探してきた【2026年11月】"
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
     "初めは、石の遺構を温泉の跡だと思っていました。調べてみると、古代ローマの都市セルディカの遺跡で、セルディカはソフィアの元の名前らしいです。",
     "別の日に地下道へ入ると、急にローマ時代の遺跡が現れて、異世界に来たのかと思いました。"
    ],
    "pic": {
     "src": "/travel/bulgaria/sofia/serdica-960.webp",
     "small": "/travel/bulgaria/sofia/serdica-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "ソフィアの中心。バーニャ・バシ・モスクと、手前の掘り下げた石の遺構（2026年11月13日）",
     "kind": "card",
     "date": "2026-11-13"
    }
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
     "湯気が出ている温泉の蛇口を見つけました。地元の人たちが並んで温泉水を汲んでいます。触ってみると熱くて、ぬめぬめ。50度ぐらいあるかもしれません。"
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
     "大聖堂の第一印象は、大きくてかっこいい。中にはステンドグラスがあって、正教会では珍しいと思いました。壁画は古く、歴史を感じる色合いです。少し前に行った北マケドニアの教会は絵の色が新しかったので、違いがよく分かりました。2階は入口が閉じていて、上がれませんでした。"
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
     "歩行者通りの始まりにある聖ネデリャ教会の前から歩き出しました。ブルガリアは高い建物が少なく、路面の店が多い。何でも揃う商店街のような通りです。"
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
     "かっこいい劇場だなと思って、写真を撮りました。"
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
     "イチゴのアイリャンは真っピンクでトロトロ。日本の飲むヨーグルトによく似ていて、想像よりずっとおいしかったです。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/yogurt",
     "title": "ソフィアで本場のヨーグルトを探してきた【2026年11月】"
    },
    "say": "正味みんなまずいを期待してたやろ",
    "pic": {
     "src": "/travel/bulgaria/sofia/yogurt-shop-960.webp",
     "small": "/travel/bulgaria/sofia/yogurt-shop-480.webp",
     "w": 960,
     "h": 1280,
     "alt": "ソフィアの乳製品の店（Млекарница）の前で、イチゴのアイリャンの瓶を持つ手（2026年11月13日）",
     "kind": "card",
     "date": "2026-11-13"
    }
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
     "迷った末に選んだのは、定番らしいチーズと卵のバニツァ。3.6ユーロ、日本円で638円でした。2階のイートインで食べてみると、チーズは濃厚でしょっぱく、北マケドニアやアルバニアのチーズに近い味。外はパリパリ、中はねっとりしたパイ生地に、チーズがゴロゴロ入っていました。"
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
     "女性市場の中にあるブルガリア料理のファストフード店「ピストル36」で、4ユーロぐらいでお任せにしてもらいました。出てきたのは3ユーロのムサカ。念願の一皿です。挽き肉・じゃがいも・にんじんの上に、ヨーグルトと卵のソースをかけて焼いた家庭料理で、食べてみると肉じゃがの分厚いオムレツみたいな味でした。"
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
     "買ったボザは、1L入りで150円ぐらいでした。"
    ],
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
}
/* END GUIDE */;
