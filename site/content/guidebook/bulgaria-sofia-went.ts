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
 "updated": "2026-11-26",
 "hash": "7faaa7b2a34ad992",
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
     "中央鉱泉浴場のそばの温泉の蛇口で、温泉水を飲んでみました。温泉卵の汁のような味で、引くほどまずかったです。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/hotspring",
     "title": "ソフィアの温泉の蛇口で温泉水を飲んできた【2026年11月】"
    },
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
     "パン屋のバニツァは、形も中身もさまざま。アップルシナモンとくるみ、ポテト入りのビーガンなどが並んでいました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/banitsa",
     "title": "ソフィアのパン屋でバニツァを食べてきた【2026年11月】"
    }
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
     "開いた初日の夜は準備が間に合っておらず、ホットチョコの店は閉まっていました。昼に通ると、ソーセージの屋台とツリーの飾りがよく見えました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/xmas",
     "title": "ソフィアのクリスマスマーケットに行ってきた【2026年11月】"
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
     "地下道に入ると、急にローマ時代の遺跡が現れます。セルディカは、ソフィアの元の名前です。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/hotspring",
     "title": "ソフィアの温泉の蛇口で温泉水を飲んできた【2026年11月】"
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
     "湯気の出る温泉の蛇口に、地元の人が並んで温泉水を汲んでいました。触ると熱くて、ぬめぬめです。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/hotspring",
     "title": "ソフィアの温泉の蛇口で温泉水を飲んできた【2026年11月】"
    }
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
     "大きくてかっこいい大聖堂。中は画面いっぱいのシャンデリアで、正教会では珍しいステンドグラスもありました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/nevsky",
     "title": "ソフィアのアレクサンドル・ネフスキー大聖堂に行ってきた【2026年11月】"
    },
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
     "聖ネデリャ教会の前から始まる歩行者の通り。路面の店が並び、何でもそろう商店街のようでした。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/hotspring",
     "title": "ソフィアの温泉の蛇口で温泉水を飲んできた【2026年11月】"
    }
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
     "大聖堂へ向かう途中に通りました。かっこいい劇場だなと思って、写真を撮りました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/nevsky",
     "title": "ソフィアのアレクサンドル・ネフスキー大聖堂に行ってきた【2026年11月】"
    }
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
     "定番らしいチーズと卵のバニツァは3.6ユーロ。外はパリパリ、中はねっとりで、チーズは濃厚でしょっぱかったです。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/banitsa",
     "title": "ソフィアのパン屋でバニツァを食べてきた【2026年11月】"
    }
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
     "女性市場の中の「ピストル36」で、3ユーロのムサカ。肉じゃがの分厚いオムレツのような味でした。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/nevsky",
     "title": "ソフィアのアレクサンドル・ネフスキー大聖堂に行ってきた【2026年11月】"
    }
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
    "more": {
     "href": "/travel/bulgaria/sofia/xmas",
     "title": "ソフィアのクリスマスマーケットに行ってきた【2026年11月】"
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
  },
  "eat/mekitsa": {
   "went": {
    "date": "2026-11-19",
    "scene": {
     "v": "KjB_aBsTIf0",
     "t": 2700,
     "date": "2026-11-19"
    },
    "story": [
     "揚げパン専門店で、目の前で揚げてもらった蜂蜜ナッツのメキツァ。蜂蜜がデロンデロンで、奥から給食の揚げパンの味がしました。"
    ],
    "more": {
     "href": "/travel/bulgaria/sofia/mekitsa",
     "title": "ソフィアで揚げパンのメキツァを食べてきた【2026年11月】"
    }
   }
  }
 }
}
/* END GUIDE */;
