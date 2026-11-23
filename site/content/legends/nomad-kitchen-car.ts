/**
 * ノマドキッチンカーの面（`/legends/nomad-kitchen-car`）の中身。**自動生成。手で直さない。元は book.json**
 *
 * 元は `python/data/legends/nomad-kitchen-car/book.json`（材料担当）と `photos.json`（絵担当）。直すならそちらを直して、
 * `python3 python/legend_kitchen_bake.py` で焼き直す。節の名前・添える字・押しどころの字・2つのシミュレーションの
 * 最初の値は焼く道具が持つ（式の手本も焼く道具の `menu()`・`day()`・`say()`）。
 */
import type { KitchenCarBook } from "./kitchenCarTypes";

export const NOMAD_KITCHEN_CAR: KitchenCarBook = /* 焼いた中身 */
{
 "slug": "nomad-kitchen-car",
 "updated": "2026-11-23",
 "meta": {
  "title": "ノマドキッチンカープロジェクト【キッチンカーでヨーロッパ一周】",
  "description": "キッチンカーでたい焼きを売りながらヨーロッパを一周する企画。ルートと景色のイメージ、メニュー開発と1日の収益のシミュレーション、3Dで外装と内装の着せ替え、課題一覧を載せた。2027年の秋ごろの開始を目標に進めている（2026年11月）。",
  "h1": "ノマドキッチンカープロジェクト",
  "sub": "キッチンカーでたい焼きを売りながらヨーロッパを一周する",
  "goal": "2027年の秋ごろの開始を目標に進めている（2026年11月）"
 },
 "sections": {
  "route": "ルートと景色",
  "menu": "売るもの",
  "look": "外装と内装",
  "money": "収益構造",
  "issues": "課題一覧",
  "shorts": "30日後にキッチンカーでヨーロッパを一周する人"
 },
 "folds": {
  "progress": "ここまでの進み具合",
  "log": "判断ログ",
  "facts": "確かめた事実"
 },
 "subs": {
  "menuSim": "メニュー開発のシミュレーション",
  "foodCompare": "食べ物ごとの比較",
  "dress": "キッチンカーの着せ替え",
  "vehicles": "車の候補の比較",
  "photos": "キッチンカーの実際の様子",
  "daySim": "1日の収益のシミュレーション",
  "big": "特大課題",
  "life": "暮らしの課題"
 },
 "side": {
  "route": "イメージ。まだ決まっていない",
  "shorts": "こんな形でやりたいと思っている（2026年11月）",
  "money": "目安",
  "issues": "2026年11月23日時点の考え"
 },
 "ui": {
  "updated": "最終更新",
  "back": "島へ戻る",
  "sources": "出どころ",
  "drew": "写真ではない絵は、あやと島案内鳥が AI で描いたもの。",
  "more": "もっと見る",
  "est": "見立て",
  "picks": [
   "",
   "第1",
   "第2",
   "第3"
  ],
  "why": "なぜたい焼きか",
  "ideas": "メニューの候補",
  "viewer": "視聴者さんの案",
  "compare": {
   "food": "品",
   "perHour": "1時間に焼ける数",
   "price": "値段",
   "cost": "1個の材料",
   "profit": "1個の利益",
   "rate": "利益率",
   "machine": "機材",
   "energy": "電気・ガス"
  },
  "interior": "内装",
  "vehicle": {
   "price": "値段の幅",
   "license": "免許",
   "good": "よいところ",
   "weak": "弱いところ"
  },
  "place": {
   "hours": "売る時間",
   "fee": "出店料",
   "buyers": "1日に来て買う人"
  },
  "star": "★",
  "buyOrRent": "買うか借りるか",
  "premise": "前提と出どころ",
  "notIn": "車・保険・泊まる所は入っていない",
  "fixed": {
   "lpg_eur_kg": "ガス（LPG）",
   "diesel_eur_l": "軽油",
   "l_per_100km": "燃費",
   "power_eur_kwh": "電気",
   "vat_pct": "付加価値税"
  },
  "yen": "円の換算",
  "work": "ヨーロッパで働くための手続き",
  "permit": "食べ物を売る許可",
  "japan": "日本",
  "europe": "ヨーロッパ",
  "stars": "難しさ",
  "who": {
   "ayato": "あやと",
   "guide": "あやと島案内鳥"
  },
  "log": {
   "date": "日付",
   "what": "何を",
   "why": "なぜ",
   "by": "決めた人"
  }
 },
 "toc": [
  {
   "id": "route",
   "label": "ルートと景色",
   "note": "5か所"
  },
  {
   "id": "menu",
   "label": "売るもの",
   "note": "5品"
  },
  {
   "id": "look",
   "label": "外装と内装",
   "note": "4組"
  },
  {
   "id": "money",
   "label": "収益構造",
   "note": "目安"
  },
  {
   "id": "issues",
   "label": "課題一覧",
   "note": "46件"
  },
  {
   "id": "shorts",
   "label": "30日後にキッチンカーでヨーロッパを一周する人",
   "note": "30本"
  }
 ],
 "cover": {
  "quotes": [
   {
    "id": "world-first",
    "text": "世界初の、世界初",
    "date": "2026-11-09",
    "cite": "2026年11月9日の配信"
   },
   {
    "id": "dream",
    "text": "夢の夢の夢のプロジェクト",
    "date": "2026-11-21",
    "cite": "2026年11月21日の配信"
   }
  ],
  "note": "2026年11月に調べた範囲では、キッチンカーでヨーロッパを一周した例は見つからなかった"
 },
 "route": {
  "plan": {
   "text": "あやとの例は、ポルトガルから北欧、ギリシャのあたりまで",
   "date": "2026-11-23"
  },
  "line": [
   {
    "lat": 38.7223,
    "lon": -9.1393
   },
   {
    "lat": 41.1579,
    "lon": -8.6291
   },
   {
    "lat": 40.4168,
    "lon": -3.7038
   },
   {
    "lat": 44.8378,
    "lon": -0.5792
   },
   {
    "lat": 48.8566,
    "lon": 2.3522
   },
   {
    "lat": 50.8503,
    "lon": 4.3517
   },
   {
    "lat": 52.3676,
    "lon": 4.9041
   },
   {
    "lat": 53.5511,
    "lon": 9.9937
   },
   {
    "lat": 55.6761,
    "lon": 12.5683
   },
   {
    "lat": 59.9139,
    "lon": 10.7522
   },
   {
    "lat": 59.3293,
    "lon": 18.0686
   },
   {
    "lat": 52.52,
    "lon": 13.405
   },
   {
    "lat": 50.0755,
    "lon": 14.4378
   },
   {
    "lat": 48.2082,
    "lon": 16.3738
   },
   {
    "lat": 47.4979,
    "lon": 19.0402
   },
   {
    "lat": 44.7866,
    "lon": 20.4489
   },
   {
    "lat": 41.9981,
    "lon": 21.4254
   },
   {
    "lat": 40.6401,
    "lon": 22.9444
   },
   {
    "lat": 37.9838,
    "lon": 23.7275
   }
  ],
  "labels": [
   {
    "id": "portugal",
    "name": "ポルトガル",
    "lat": 39.6,
    "lon": -8.1
   },
   {
    "id": "nordic",
    "name": "北欧",
    "lat": 61.0,
    "lon": 14.5
   },
   {
    "id": "greece",
    "name": "ギリシャ",
    "lat": 39.3,
    "lon": 21.9
   }
  ],
  "countries": [
   "france",
   "belgium",
   "netherlands",
   "germany",
   "sweden",
   "czech",
   "austria",
   "hungary",
   "north-macedonia"
  ]
 },
 "views": [
  {
   "id": "lake-town",
   "title": "湖のある町",
   "lead": "湖のほとりに車を停める",
   "scene": {
    "date": "2026-11-21",
    "cite": "2026年11月21日の配信 4:07:30",
    "v": "A_cJ9CNM0G8",
    "t": 14850
   }
  },
  {
   "id": "sea-town",
   "title": "海が見える町",
   "lead": "坂道の先に広がる青い入り江",
   "scene": {
    "date": "2026-11-21",
    "cite": "2026年11月21日の配信 4:07:30",
    "v": "A_cJ9CNM0G8",
    "t": 14850
   }
  },
  {
   "id": "mountain-town",
   "title": "山の途中の町",
   "lead": "登山の途中でひと休みする人へ",
   "scene": {
    "date": "2026-11-21",
    "cite": "2026年11月21日の配信 4:07:30",
    "v": "A_cJ9CNM0G8",
    "t": 14850
   }
  },
  {
   "id": "local-spot",
   "title": "地元の穴場",
   "lead": "ガイドブックに載らない景色を探す",
   "scene": {
    "date": "2026-11-21",
    "cite": "2026年11月21日の配信 4:07:30",
    "v": "A_cJ9CNM0G8",
    "t": 14850
   }
  },
  {
   "id": "italy-seaside",
   "title": "イタリアの海辺",
   "lead": "ここでコーラを売りたい",
   "scene": {
    "date": "2026-11-08",
    "cite": "2026年11月8日の配信"
   }
  }
 ],
 "menu": {
  "picks": [
   {
    "rank": 1,
    "food": "taiyaki"
   },
   {
    "rank": 2,
    "food": "takoyaki"
   },
   {
    "rank": 3,
    "food": "crepe"
   },
   {
    "rank": 3,
    "food": "waffle"
   },
   {
    "rank": 3,
    "food": "pizza"
   }
  ],
  "decided": {
   "date": "2026-11-21",
   "cite": "2026年11月21日の配信 4:01:00",
   "v": "A_cJ9CNM0G8",
   "t": 14460
  },
  "why": [
   {
    "id": "viewer-idea",
    "text": "11月21日の作戦会議で視聴者さんの一言から第1候補になった"
   },
   {
    "id": "first-timers",
    "text": "毎回ちがう町で売るので常連より初めての人が相手"
   },
   {
    "id": "cute",
    "text": "知らない人が見てもかわいい魚の形"
   },
   {
    "id": "known-fillings",
    "text": "チョコやバナナやイチゴなら食べる前から味の想像がつく"
   },
   {
    "id": "anko-tako",
    "text": "あんこやたこは中身が分からず買うハードルが上がる"
   },
   {
    "id": "made-by-japanese",
    "text": "日本人が作っているとアピールできるお菓子"
   }
  ],
  "ideas": [
   {
    "id": "choco-banana-taiyaki",
    "name": "チョコとバナナのたい焼き",
    "food": "taiyaki",
    "from": "ayato",
    "date": "2026-11-21"
   },
   {
    "id": "berry-banana-taiyaki",
    "name": "イチゴとバナナのたい焼き",
    "food": "taiyaki",
    "from": "ayato",
    "date": "2026-11-21"
   },
   {
    "id": "marshmallow-taiyaki",
    "name": "マシュマロとチョコのたい焼き",
    "food": "taiyaki",
    "from": "ayato",
    "date": "2026-11-21"
   },
   {
    "id": "taiyaki-parfait",
    "name": "魚の口からアイスクリームが出るたい焼きのパフェ",
    "food": "taiyaki",
    "from": "ayato",
    "date": "2026-11-22"
   },
   {
    "id": "sweet-takoyaki",
    "name": "甘い生地にチョコクリームを入れたたこ焼き",
    "food": "takoyaki",
    "from": "ayato",
    "date": "2026-11-20"
   },
   {
    "id": "dessert-takoyaki",
    "name": "イチゴやチョコを入れたデザートのたこ焼き",
    "food": "takoyaki",
    "from": "ayato",
    "date": "2026-11-21"
   },
   {
    "id": "pizza-takoyaki",
    "name": "ピザ風のたこ焼き",
    "food": "takoyaki",
    "from": "ayato",
    "date": "2026-11-21"
   },
   {
    "id": "croissant-taiyaki",
    "name": "クロワッサン生地のたい焼き",
    "food": "taiyaki",
    "from": "viewer",
    "date": "2026-11-21"
   },
   {
    "id": "curry-taiyaki",
    "name": "カレーのたい焼き",
    "food": "taiyaki",
    "from": "viewer",
    "date": "2026-11-21"
   },
   {
    "id": "local-taiyaki",
    "name": "その国の味を入れたたい焼き",
    "food": "taiyaki",
    "from": "viewer",
    "date": "2026-11-21"
   },
   {
    "id": "sausage-takoyaki",
    "name": "ウインナーとケチャップのたこ焼き",
    "food": "takoyaki",
    "from": "viewer",
    "date": "2026-11-21"
   },
   {
    "id": "waffle-takoyaki",
    "name": "ワッフル風のたこ焼き",
    "food": "takoyaki",
    "from": "viewer",
    "date": "2026-11-21"
   }
  ]
 },
 "foods": [
  {
   "id": "taiyaki",
   "name": "たい焼き",
   "unit": "匹",
   "sim": true,
   "perHour": [
    40,
    60
   ],
   "price": [
    2.0,
    3.6
   ],
   "cost": [
    0.2,
    0.45
   ],
   "dough": [
    0.05,
    0.1
   ],
   "pack": [
    0.03,
    0.1
   ],
   "machine": "電気のたい焼き機（5匹焼き・21kg）",
   "energy": {
    "kind": "電気",
    "text": "3.2kW（イベントの16Aの電源1口に1台）",
    "gasKgH": 0,
    "elecKw": 3.2
   },
   "profit": 2.29,
   "rate": 0.88,
   "src": [
    {
     "name": "glovoapp.com",
     "url": "https://glovoapp.com/kk/bg/sofia/stores/taiyaki-spot-sof",
     "seen": "2026-11-23"
    },
    {
     "name": "speisekarte.de",
     "url": "https://www.speisekarte.de/berlin/restaurant/mr_melon_pan/speisekarte",
     "seen": "2026-11-23"
    },
    {
     "name": "expats.cz",
     "url": "https://www.expats.cz/czech-news/article/taiyaki-bar-a-japanese-ice-cream-spot-debuts-in-prague",
     "seen": "2026-11-23"
    },
    {
     "name": "maxima.com",
     "url": "https://maxima.com/de/digitales-waffeleisen-taiyaki-fischform-5-stueck.html",
     "seen": "2026-11-23"
    },
    {
     "name": "server.maximakitchenequipment.com",
     "url": "https://server.maximakitchenequipment.com/maxima/maxima-manuals/09374182_UM.pdf",
     "seen": "2026-11-23"
    },
    {
     "name": "supermarktcheck.de",
     "url": "https://www.supermarktcheck.de/aldi-nord/sortiment/mehl/",
     "seen": "2026-11-23"
    },
    {
     "name": "topagrar.com",
     "url": "https://www.topagrar.com/gefluegel/aldi-nord-erhoht-eierpreise-um-25-c-20021903.html",
     "seen": "2026-11-23"
    },
    {
     "name": "aldi-sued.de",
     "url": "https://www.aldi-sued.de/newsroom/alle-pressemitteilungen/marke-und-produkte/2025/preisfuehrer-aldi-senkt-schon-wieder-zahlreiche-molkereiprodukte-dauerhaft-im-preis",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "per_hour",
    "cost",
    "dough",
    "pack"
   ]
  },
  {
   "id": "takoyaki",
   "name": "たこ焼き",
   "unit": "舟",
   "sim": true,
   "perHour": [
    20,
    30
   ],
   "price": [
    6.5,
    8.0
   ],
   "cost": [
    0.4,
    0.6
   ],
   "dough": [
    0.08,
    0.15
   ],
   "pack": [
    0.05,
    0.12
   ],
   "machine": "たこ焼きの鉄板（28穴を2枚）とCEマークのあるガスこんろ",
   "energy": {
    "kind": "ガス",
    "text": "ガス 約0.26kg/時",
    "gasKgH": 0.26,
    "elecKw": 0
   },
   "profit": 6.28,
   "rate": 0.93,
   "src": [
    {
     "name": "sortiraparis.com",
     "url": "https://www.sortiraparis.com/en/where-to-eat-in-paris/restaurant/articles/291509-moemachi-small-takoyaki-shop-on-the-trail",
     "seen": "2026-11-23"
    },
    {
     "name": "themanc.com",
     "url": "https://themanc.com/news/a-new-japanese-street-food-stall-has-opened-in-the-arndale-market/",
     "seen": "2026-11-23"
    },
    {
     "name": "endoshoji.co.jp",
     "url": "https://www.endoshoji.co.jp/catalog_v212/pdf/P1002.pdf",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "per_hour",
    "cost",
    "dough",
    "pack"
   ]
  },
  {
   "id": "crepe",
   "name": "クレープ",
   "unit": "枚",
   "sim": true,
   "perHour": [
    30,
    45
   ],
   "price": [
    3.7,
    6.5
   ],
   "cost": [
    0.3,
    0.5
   ],
   "dough": [
    0.05,
    0.1
   ],
   "pack": [
    0.03,
    0.08
   ],
   "machine": "ガスのクレープ焼き器（鉄板は40×40cm）",
   "energy": {
    "kind": "ガス",
    "text": "ガス 最大約0.47kg/時（6.04kW）",
    "gasKgH": 0.47,
    "elecKw": 0
   },
   "profit": 4.37,
   "rate": 0.92,
   "src": [
    {
     "name": "stuttgarter-zeitung.de",
     "url": "https://www.stuttgarter-zeitung.de/lokales/esslingen/weihnachtsmarkt-esslingen-was-kosten-gluehwein-und-schwaebische-pizza-es-herrscht-so-eine-stimmung-78880896.html",
     "seen": "2026-11-23"
    },
    {
     "name": "stirileprotv.ro",
     "url": "https://stirileprotv.ro/divers/targul-de-craciun-din-drumul-taberei-west-side-christmas-market-program-si-tarife-cat-costa-un-pahar-de-vin-fiert.html",
     "seen": "2026-11-23"
    },
    {
     "name": "ggmgastro.com",
     "url": "https://www.ggmgastro.com/en-gb-eur/commercial-gas-crepe-maker-thermostatic-control-cgom5-plcgom6",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "per_hour",
    "cost",
    "dough",
    "pack",
    "gas_kg_h"
   ]
  },
  {
   "id": "waffle",
   "name": "ワッフル",
   "unit": "枚",
   "sim": true,
   "perHour": [
    23,
    30
   ],
   "price": [
    4.0,
    8.0
   ],
   "cost": [
    1.2,
    1.6
   ],
   "dough": [
    0.1,
    0.2
   ],
   "pack": [
    0.05,
    0.15
   ],
   "machine": "ガスのワッフル焼き器（焼き型2組・40kg）",
   "energy": {
    "kind": "ガス",
    "text": "ガス 最大約0.41kg/時（5.24kW）",
    "gasKgH": 0.41,
    "elecKw": 0
   },
   "profit": 4.21,
   "rate": 0.75,
   "src": [
    {
     "name": "restaupro.com",
     "url": "https://www.restaupro.com/pdf/produit_fiche_19046.pdf",
     "seen": "2026-11-23"
    },
    {
     "name": "youtube.com",
     "url": "https://www.youtube.com/watch?v=A_cJ9CNM0G8&t=13710s",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "price",
    "cost",
    "dough",
    "pack",
    "gas_kg_h"
   ]
  },
  {
   "id": "pizza",
   "name": "ピザ",
   "unit": "枚",
   "sim": false,
   "perHour": [
    20,
    30
   ],
   "price": [
    8.0,
    8.9
   ],
   "cost": [
    1.0,
    1.5
   ],
   "dough": [
    0.15,
    0.25
   ],
   "pack": [
    0.3,
    0.5
   ],
   "machine": "ガスのピザ窯（2枚焼き・175kg）",
   "energy": {
    "kind": "ガス",
    "text": "ガス 最大1.35kg/時（24kW）",
    "gasKgH": 1.35,
    "elecKw": 0
   },
   "profit": 6.65,
   "rate": 0.84,
   "src": [
    {
     "name": "speisekarte.de",
     "url": "https://www.speisekarte.de/ingolstadt-donau/restaurant/apizz_pizzawagen_foodtruck_ingolstadt/speisekarte",
     "seen": "2026-11-23"
    },
    {
     "name": "speisekarte.de",
     "url": "https://www.speisekarte.de/ratingen/restaurant/pizza_point_foodtruck/speisekarte",
     "seen": "2026-11-23"
    },
    {
     "name": "cdn.shopify.com",
     "url": "https://cdn.shopify.com/s/files/1/1241/8236/files/st-QUICK-2PIZZE-GAS.pdf",
     "seen": "2026-11-23"
    },
    {
     "name": "nellaonline.com",
     "url": "https://www.nellaonline.com/products/alfa-quick-2-pizze-gas-wood-pizza-oven-q2p",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "per_hour",
    "cost",
    "dough",
    "pack"
   ]
  }
 ],
 "compare": {
  "head": [
   "品",
   "1時間に焼ける数",
   "値段",
   "1個の材料",
   "1個の利益",
   "利益率",
   "機材",
   "電気・ガス"
  ],
  "rows": [
   {
    "id": "taiyaki",
    "name": "たい焼き",
    "cells": [
     {
      "text": "40〜60匹",
      "est": true
     },
     {
      "text": "€2.0〜3.6",
      "est": false
     },
     {
      "text": "€0.20〜0.45",
      "est": true
     },
     {
      "text": "€2.29",
      "est": false
     },
     {
      "text": "88%",
      "est": false
     },
     {
      "text": "電気のたい焼き機（5匹焼き・21kg）",
      "est": false
     },
     {
      "text": "電気 3.2kW（イベントの16Aの電源1口に1台）",
      "est": false
     }
    ]
   },
   {
    "id": "takoyaki",
    "name": "たこ焼き",
    "cells": [
     {
      "text": "20〜30舟",
      "est": true
     },
     {
      "text": "€6.5〜8.0",
      "est": false
     },
     {
      "text": "€0.4〜0.6",
      "est": true
     },
     {
      "text": "€6.28",
      "est": false
     },
     {
      "text": "93%",
      "est": false
     },
     {
      "text": "たこ焼きの鉄板（28穴を2枚）とCEマークのあるガスこんろ",
      "est": false
     },
     {
      "text": "ガス 約0.26kg/時",
      "est": false
     }
    ]
   },
   {
    "id": "crepe",
    "name": "クレープ",
    "cells": [
     {
      "text": "30〜45枚",
      "est": true
     },
     {
      "text": "€3.7〜6.5",
      "est": false
     },
     {
      "text": "€0.3〜0.5",
      "est": true
     },
     {
      "text": "€4.37",
      "est": false
     },
     {
      "text": "92%",
      "est": false
     },
     {
      "text": "ガスのクレープ焼き器（鉄板は40×40cm）",
      "est": false
     },
     {
      "text": "ガス 最大約0.47kg/時（6.04kW）",
      "est": true
     }
    ]
   },
   {
    "id": "waffle",
    "name": "ワッフル",
    "cells": [
     {
      "text": "23〜30枚",
      "est": false
     },
     {
      "text": "€4〜8",
      "est": true
     },
     {
      "text": "€1.2〜1.6",
      "est": true
     },
     {
      "text": "€4.21",
      "est": false
     },
     {
      "text": "75%",
      "est": false
     },
     {
      "text": "ガスのワッフル焼き器（焼き型2組・40kg）",
      "est": false
     },
     {
      "text": "ガス 最大約0.41kg/時（5.24kW）",
      "est": true
     }
    ]
   },
   {
    "id": "pizza",
    "name": "ピザ",
    "cells": [
     {
      "text": "20〜30枚",
      "est": true
     },
     {
      "text": "€8.0〜8.9",
      "est": false
     },
     {
      "text": "€1.0〜1.5",
      "est": true
     },
     {
      "text": "€6.65",
      "est": false
     },
     {
      "text": "84%",
      "est": false
     },
     {
      "text": "ガスのピザ窯（2枚焼き・175kg）",
      "est": false
     },
     {
      "text": "ガス 最大1.35kg/時（24kW）",
      "est": false
     }
    ]
   }
  ]
 },
 "fillings": [
  {
   "id": "chocolate",
   "name": "チョコ",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.08,
    0.1
   ],
   "known": 3,
   "allergens": [
    "乳",
    "大豆"
   ],
   "flags": [],
   "from": "ayato",
   "sprite": "food-chocolate",
   "src": [
    {
     "name": "aldi-sued.de",
     "url": "https://www.aldi-sued.de/newsroom/alle-pressemitteilungen/marke-und-produkte/2026/gegen-den-trend--aldi-laesst-schokoladenpreise-schmelzen",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "hazelnut-cream",
   "name": "ヘーゼルナッツのチョコクリーム",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.05,
    0.06
   ],
   "known": 3,
   "allergens": [
    "木の実",
    "乳",
    "大豆"
   ],
   "flags": [],
   "from": "ayato",
   "src": [
    {
     "name": "mydealz.de",
     "url": "https://www.mydealz.de/deals/kaufland-nutella-750g-glas-zu-je-379eur-entspricht-399eur-pro-kg-ohne-app-1709-2309-2840575",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "banana",
   "name": "バナナ",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.01,
    0.02
   ],
   "known": 3,
   "allergens": [],
   "flags": [],
   "from": "ayato",
   "sprite": "food-banana",
   "src": [
    {
     "name": "mydealz.de",
     "url": "https://www.mydealz.de/deals/aldi-nord-bananen-1kg-2869114",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "strawberry",
   "name": "イチゴ",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.06,
    0.11
   ],
   "known": 3,
   "allergens": [],
   "flags": [],
   "from": "ayato",
   "sprite": "food-strawberry",
   "src": [
    {
     "name": "stuttgarter-zeitung.de",
     "url": "https://www.stuttgarter-zeitung.de/panorama/werden-erdbeeren-jetzt-wieder-teurer-78893906.html",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "custard",
   "name": "カスタード",
   "foods": [
    "taiyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.02,
    0.03
   ],
   "known": 3,
   "allergens": [
    "卵",
    "乳"
   ],
   "flags": [],
   "from": "viewer",
   "sprite": "food-pudding",
   "src": [
    {
     "name": "aldi-sued.de",
     "url": "https://www.aldi-sued.de/newsroom/alle-pressemitteilungen/marke-und-produkte/2025/preisfuehrer-aldi-senkt-schon-wieder-zahlreiche-molkereiprodukte-dauerhaft-im-preis",
     "seen": "2026-11-23"
    },
    {
     "name": "topagrar.com",
     "url": "https://www.topagrar.com/gefluegel/aldi-nord-erhoht-eierpreise-um-25-c-20021903.html",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "whipped-cream",
   "name": "ホイップクリーム",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.04,
    0.05
   ],
   "known": 3,
   "allergens": [
    "乳"
   ],
   "flags": [],
   "from": "ayato",
   "src": [
    {
     "name": "aldi-sued.de",
     "url": "https://www.aldi-sued.de/newsroom/alle-pressemitteilungen/marke-und-produkte/2025/preisfuehrer-aldi-senkt-schon-wieder-zahlreiche-molkereiprodukte-dauerhaft-im-preis",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "marshmallow",
   "name": "マシュマロ",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe"
   ],
   "cost": [
    0.03,
    0.06
   ],
   "known": 2,
   "allergens": [],
   "flags": [
    "gelatin"
   ],
   "from": "ayato",
   "src": [],
   "est": [
    "cost"
   ]
  },
  {
   "id": "apple-cinnamon",
   "name": "りんごとシナモン",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.03,
    0.05
   ],
   "known": 3,
   "allergens": [],
   "flags": [],
   "from": "ayato",
   "sprite": "food-apple",
   "src": [],
   "est": [
    "cost"
   ]
  },
  {
   "id": "cheese",
   "name": "チーズ",
   "foods": [
    "taiyaki",
    "takoyaki",
    "crepe",
    "waffle"
   ],
   "cost": [
    0.08,
    0.1
   ],
   "known": 3,
   "allergens": [
    "乳"
   ],
   "flags": [],
   "from": "ayato",
   "sprite": "food-cheese",
   "src": [],
   "est": [
    "cost"
   ]
  },
  {
   "id": "sausage",
   "name": "ウインナー",
   "foods": [
    "taiyaki",
    "takoyaki"
   ],
   "cost": [
    0.06,
    0.07
   ],
   "known": 3,
   "allergens": [
    "セロリ",
    "からし",
    "大豆"
   ],
   "flags": [
    "pork"
   ],
   "from": "viewer",
   "sprite": "food-meat-sausage",
   "src": [
    {
     "name": "t-online.de",
     "url": "https://www.t-online.de/leben/aktuelles/id_101471120/aldi-preise-discounter-aendert-die-preise-fuer-fleisch.html",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "cost"
   ]
  },
  {
   "id": "tomato-sauce",
   "name": "トマトソース",
   "foods": [
    "taiyaki",
    "takoyaki"
   ],
   "cost": [
    0.02,
    0.03
   ],
   "known": 3,
   "allergens": [],
   "flags": [],
   "from": "ayato",
   "sprite": "food-tomato",
   "src": [],
   "est": [
    "cost"
   ]
  },
  {
   "id": "anko",
   "name": "あんこ",
   "foods": [
    "taiyaki"
   ],
   "cost": [
    0.1,
    0.2
   ],
   "known": 1,
   "allergens": [],
   "flags": [],
   "from": "guide",
   "src": [],
   "est": [
    "cost"
   ]
  },
  {
   "id": "octopus",
   "name": "たこ",
   "foods": [
    "takoyaki"
   ],
   "cost": [
    0.15,
    0.3
   ],
   "known": 1,
   "allergens": [
    "軟体動物"
   ],
   "flags": [],
   "from": "guide",
   "src": [],
   "est": [
    "cost"
   ]
  }
 ],
 "places": [
  {
   "id": "town-market",
   "name": "青空市場",
   "fee": {
    "kind": "fixed",
    "eur": [
     15,
     60
    ]
   },
   "hours": 6,
   "buyers": [
    30,
    80
   ],
   "rows": [
    {
     "label": "売る時間",
     "text": "6時間",
     "est": false
    },
    {
     "label": "出店料",
     "est": true,
     "text": "€15〜60/日"
    },
    {
     "label": "1日に来て買う人",
     "text": "30〜80人",
     "est": true
    }
   ],
   "src": [
    {
     "name": "nuernberg.de",
     "url": "https://www.nuernberg.de/imperia/md/maerkte/dokumente/gebuehrentarif.pdf",
     "seen": "2026-11-23"
    },
    {
     "name": "malmo.se",
     "url": "https://malmo.se/For-foretag-och-verksamheter/Verksamhet-pa-offentliga-platser/Salja-mat-och-dryck-fran-food-trucks.html",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "fee",
    "buyers"
   ]
  },
  {
   "id": "summer-fest",
   "name": "夏のフェス",
   "fee": {
    "kind": "share",
    "pct": [
     20,
     30
    ]
   },
   "hours": 8,
   "buyers": [
    100,
    250
   ],
   "rows": [
    {
     "label": "売る時間",
     "text": "8時間",
     "est": false
    },
    {
     "label": "出店料",
     "est": false,
     "text": "売上の20〜30%"
    },
    {
     "label": "1日に来て買う人",
     "text": "100〜250人",
     "est": true
    }
   ],
   "src": [
    {
     "name": "nos.nl",
     "url": "https://nos.nl/op3/artikel/2131539-met-80-km-u-naar-denemarken-om-pannenkoeken-te-bakken",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "buyers"
   ]
  },
  {
   "id": "winter-market",
   "name": "クリスマスマーケット",
   "fee": {
    "kind": "fixed",
    "eur": [
     13,
     227
    ]
   },
   "hours": 8,
   "buyers": [
    80,
    200
   ],
   "rows": [
    {
     "label": "売る時間",
     "text": "8時間",
     "est": false
    },
    {
     "label": "出店料",
     "est": false,
     "text": "€13〜227/日"
    },
    {
     "label": "1日に来て買う人",
     "text": "80〜200人",
     "est": true
    }
   ],
   "src": [
    {
     "name": "cm-evora.pt",
     "url": "https://www.cm-evora.pt/wp-content/uploads/2025/11/Normas-de-Participacao-2025.pdf",
     "seen": "2026-11-23"
    },
    {
     "name": "bad-homburg.de",
     "url": "https://www.bad-homburg.de/events/weihnachtsstadt/Weihnachtsstadt%202026/AVB_Weihnachtsmarkt%20Schloss_Winterzauber_Bad%20Homburg%202026.pdf",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "buyers"
   ]
  },
  {
   "id": "japan-fest",
   "name": "日本文化のイベント",
   "fee": {
    "kind": "fixed",
    "eur": [
     2075,
     2075
    ]
   },
   "hours": 8,
   "buyers": [
    250,
    600
   ],
   "rows": [
    {
     "label": "売る時間",
     "text": "8時間",
     "est": false
    },
    {
     "label": "出店料",
     "est": true,
     "text": "€2,075/日"
    },
    {
     "label": "1日に来て買う人",
     "text": "250〜600人",
     "est": true
    }
   ],
   "src": [
    {
     "name": "visitduesseldorf.de",
     "url": "https://www.visitduesseldorf.de/_Resources/Persistent/3966c6f550da854645695fa79ab32cb90107cb56/Informationen-Teilnahme-Zelt_2026.pdf",
     "seen": "2026-11-23"
    }
   ],
   "est": [
    "fee",
    "buyers"
   ]
  }
 ],
 "sim": {
  "food": "taiyaki",
  "fillings": [
   "chocolate",
   "banana",
   "strawberry"
  ],
  "price": 3.5,
  "place": "town-market",
  "say": {
   "bake": "焼くのが追いつかず並んだ人を待たせてしまう",
   "crowd": "焼ける数に対して買いに来る人が少ない",
   "loss": "場所代と燃料が売り上げを上回って赤字になる",
   "thin": "売れても1個に残るお金が少ない",
   "pricey": "この値段だとまわりの屋台より高く見える",
   "unknown": "中身が想像できず手に取るのをためらう人が出る",
   "good": "焼く数と買う人がちょうど合ってうまく回る"
  },
  "sayOrder": [
   "loss",
   "bake",
   "crowd",
   "pricey",
   "unknown",
   "thin",
   "good"
  ],
  "buy": [
   "買いたくなる",
   "迷う人もいる",
   "手に取りにくい"
  ],
  "rule": {
   "known": {
    "1": 0.55,
    "2": 0.8,
    "3": 1.0
   },
   "power": 1.5,
   "appeal": [
    0.3,
    1.3
   ],
   "buy": [
    0.9,
    0.7
   ],
   "crowd": 0.5,
   "thin": 0.6
  },
  "driveKm": 50,
  "start": {
   "cost": 0.33,
   "net": 3.271,
   "margin": 2.941,
   "rate": 0.8991,
   "perHour": 50.0,
   "cap": 300,
   "appeal": 0.7155,
   "demand": 39,
   "sold": 39,
   "feeFixed": 38,
   "feeShare": 0,
   "gasKg": 0.0,
   "elec": 6.528,
   "fuel": 10.25,
   "left": 59.9221,
   "buy": 1,
   "say": "crowd"
  }
 },
 "looks": [
  {
   "id": "nordic",
   "name": "北欧風",
   "lead": "白い車体に赤と藍のチューリップが咲く",
   "interior": {
    "name": "北欧風の内装",
    "lead": "肩の高さに草花の帯を通した白木の壁",
    "src": []
   }
  },
  {
   "id": "majolica",
   "name": "イタリアのマジョリカ焼き",
   "lead": "黄・青・緑の3色で描いたレモンと花",
   "interior": {
    "name": "サンスーシ宮殿の花の部屋",
    "lead": "黄色の壁に色を塗った花と果物と鳥の木彫り",
    "src": [
     {
      "name": "Wikipedia「Schloss Sanssouci」",
      "url": "https://de.wikipedia.org/wiki/Schloss_Sanssouci",
      "seen": "2026-11-23"
     },
     {
      "name": "deutsche-digitale-bibliothek.de",
      "url": "https://www.deutsche-digitale-bibliothek.de/item/I2GDFFLJYWYQAC2A22EHWKMFSQOJOCZG",
      "seen": "2026-11-23"
     }
    ]
   }
  },
  {
   "id": "azulejo",
   "name": "ポルトガルのタイル",
   "lead": "藍と白のタイルで車体を包む",
   "interior": {
    "name": "ポルトガルのタイルの内装",
    "lead": "壁の下半分だけを藍と白のタイルにする",
    "src": []
   }
  },
  {
   "id": "wa",
   "name": "和風",
   "lead": "藍に白く染め抜いた青海波と麻の葉",
   "interior": {
    "name": "和風の内装",
    "lead": "窓口に短い藍ののれんを掛ける",
    "src": []
   }
  }
 ],
 "vehicles": [
  {
   "id": "small-van",
   "name": "小さい車",
   "said": {
    "text": "アルファードみたいなやつ",
    "date": "2026-11-15",
    "cite": "2026年11月15日の配信 1:01:00",
    "v": "hJ6vFAGX3rI",
    "t": 3660
   },
   "price": {
    "eur": [
     5000,
     20000
    ],
    "what": "改造する前の中古のバン（オランダとドイツの掲載例）"
   },
   "priceText": "€5,000〜20,000",
   "license": "EUのB免許（総重量3,500kgまで）",
   "good": "小さくて停めやすい。自分で改造する様子も見せられる",
   "weak": "狭い。寝床と台所が同じ箱になる",
   "first": false,
   "src": [
    {
     "name": "marktplaats.nl",
     "url": "https://www.marktplaats.nl/q/hoogdak+bestelbus/",
     "seen": "2026-11-23"
    },
    {
     "name": "autozeitung.de",
     "url": "https://www.autozeitung.de/camper-ausbau-selbst-machen-208319.html",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "box-van",
   "name": "窓口つきの箱バン",
   "price": {
    "eur": [
     7950,
     75630
    ],
    "what": "中古の販売車の掲載例（オランダ・ドイツ・ポルトガル。ドイツは税別）"
   },
   "priceText": "€7,950〜75,630",
   "license": "EUのB免許（総重量3,500kgまで）",
   "good": "売る設備がそろっている。窓口と看板が絵になる",
   "weak": "中古の販売車には寝床が無いので作り足す。古い車は排ガスの規制区域に入れない",
   "first": true,
   "src": [
    {
     "name": "truckscout24.de",
     "url": "https://www.truckscout24.de/transporter/gebraucht/verkaufswagen-food-truck",
     "seen": "2026-11-23"
    },
    {
     "name": "marktplaats.nl",
     "url": "https://www.marktplaats.nl/q/foodtruck/",
     "seen": "2026-11-23"
    },
    {
     "name": "olx.pt",
     "url": "https://www.olx.pt/ads/q-food-truck/",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "campervan-tent",
   "name": "キャンピングバン＋テントの屋台",
   "price": {
    "eur": [
     4999,
     81965
    ],
    "what": "中古のキャンピングカーの掲載例（オランダ。1ページ目の真ん中の値は約€30,000）。テントの屋台一式は別"
   },
   "priceText": "€4,999〜81,965",
   "license": "EUのB免許（総重量3,500kgまで）",
   "good": "寝床と店が分かれる。いちばん安く始められる",
   "weak": "ひと目でキッチンカーと分かりにくい。テントを出せる場所が限られる",
   "first": false,
   "src": [
    {
     "name": "marktplaats.nl",
     "url": "https://www.marktplaats.nl/q/buscamper/",
     "seen": "2026-11-23"
    },
    {
     "name": "legislation.gov.uk",
     "url": "https://www.legislation.gov.uk/eur/2004/852/annex/II/chapter/III",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "camper-trailer",
   "name": "キャンピングカー＋販売トレーラー",
   "price": {
    "eur": [
     5870,
     34000
    ],
    "what": "販売トレーラーの掲載例（オランダ・ドイツ）。キャンピングカーは別"
   },
   "priceText": "€5,870〜34,000",
   "license": "750kgを超えるトレーラーはEUのB96かBE（日本ではけん引免許）",
   "good": "住まいと店が別の箱になる",
   "weak": "1人でのバックが難しい。船や通行料が長さで高くなる",
   "first": false,
   "src": [
    {
     "name": "marktplaats.nl",
     "url": "https://www.marktplaats.nl/q/foodtruck/",
     "seen": "2026-11-23"
    },
    {
     "name": "kleinanzeigen.de",
     "url": "https://www.kleinanzeigen.de/s-foodtruck/k0",
     "seen": "2026-11-23"
    },
    {
     "name": "adac.de",
     "url": "https://www.adac.de/verkehr/rund-um-den-fuehrerschein/erwerb/anhaengerfuehrerschein-b96/",
     "seen": "2026-11-23"
    }
   ]
  }
 ],
 "buyOrRent": [
  {
   "id": "buy",
   "name": "買う",
   "price": "中古の販売車は€7,950〜75,630の掲載例（ドイツは税別）",
   "good": "改造も登録も思いどおりに決められる",
   "weak": "始めに大きなお金が要る",
   "src": [
    {
     "name": "truckscout24.de",
     "url": "https://www.truckscout24.de/transporter/gebraucht/verkaufswagen-food-truck",
     "seen": "2026-11-23"
    },
    {
     "name": "marktplaats.nl",
     "url": "https://www.marktplaats.nl/q/foodtruck/",
     "seen": "2026-11-23"
    },
    {
     "name": "olx.pt",
     "url": "https://www.olx.pt/ads/q-food-truck/",
     "seen": "2026-11-23"
    }
   ]
  },
  {
   "id": "rent",
   "name": "借りる",
   "price": "キャンピングカーは1日€50〜220（ポルトガル）。販売車は平日1日€950の例（ドイツ・2021年）",
   "good": "始めのお金が小さい。下見の旅に向く",
   "weak": "国をまたぐことや改造や商売に使うことを禁じる貸し手が多い",
   "src": [
    {
     "name": "roadgenius.com",
     "url": "https://roadgenius.com/campers/portugal",
     "seen": "2026-11-23"
    },
    {
     "name": "transgourmet.de",
     "url": "https://www.transgourmet.de/sites/default/files/2021-05/Handout_Truck_Burger_Truck_Bronze_Update_2021_web_1.pdf",
     "seen": "2026-11-23"
    }
   ]
  }
 ],
 "photos": [],
 "money": {
  "inputs": [
   {
    "id": "price",
    "min": 2,
    "max": 8,
    "step": 0.1,
    "default": 3.5,
    "src": [
     {
      "name": "glovoapp.com",
      "url": "https://glovoapp.com/kk/bg/sofia/stores/taiyaki-spot-sof",
      "seen": "2026-11-23"
     },
     {
      "name": "speisekarte.de",
      "url": "https://www.speisekarte.de/berlin/restaurant/mr_melon_pan/speisekarte",
      "seen": "2026-11-23"
     },
     {
      "name": "expats.cz",
      "url": "https://www.expats.cz/czech-news/article/taiyaki-bar-a-japanese-ice-cream-spot-debuts-in-prague",
      "seen": "2026-11-23"
     }
    ],
    "est": []
   },
   {
    "id": "sold",
    "min": 10,
    "max": 150,
    "step": 1,
    "default": 39,
    "src": [],
    "est": [
     "max"
    ]
   },
   {
    "id": "cost",
    "min": 0.1,
    "max": 1.5,
    "step": 0.01,
    "default": 0.33,
    "src": [
     {
      "name": "supermarktcheck.de",
      "url": "https://www.supermarktcheck.de/aldi-nord/sortiment/mehl/",
      "seen": "2026-11-23"
     },
     {
      "name": "aldi-sued.de",
      "url": "https://www.aldi-sued.de/newsroom/alle-pressemitteilungen/marke-und-produkte/2026/gegen-den-trend--aldi-laesst-schokoladenpreise-schmelzen",
      "seen": "2026-11-23"
     }
    ],
    "est": [
     "max"
    ]
   },
   {
    "id": "fee-fixed",
    "min": 0,
    "max": 400,
    "step": 1,
    "default": 38,
    "src": [
     {
      "name": "nuernberg.de",
      "url": "https://www.nuernberg.de/imperia/md/maerkte/dokumente/gebuehrentarif.pdf",
      "seen": "2026-11-23"
     },
     {
      "name": "bad-homburg.de",
      "url": "https://www.bad-homburg.de/events/weihnachtsstadt/Weihnachtsstadt%202026/AVB_Weihnachtsmarkt%20Schloss_Winterzauber_Bad%20Homburg%202026.pdf",
      "seen": "2026-11-23"
     }
    ],
    "est": [
     "max"
    ]
   },
   {
    "id": "fee-share",
    "min": 0,
    "max": 30,
    "step": 1,
    "default": 0,
    "src": [
     {
      "name": "nos.nl",
      "url": "https://nos.nl/op3/artikel/2131539-met-80-km-u-naar-denemarken-om-pannenkoeken-te-bakken",
      "seen": "2026-11-23"
     },
     {
      "name": "festivalinsights.com",
      "url": "https://www.festivalinsights.com/2016/01/managing-catering-provision/",
      "seen": "2026-11-23"
     }
    ],
    "est": []
   },
   {
    "id": "gas-kg",
    "min": 0,
    "max": 5,
    "step": 0.1,
    "default": 0.0,
    "src": [
     {
      "name": "ggmgastro.com",
      "url": "https://www.ggmgastro.com/en-gb-eur/commercial-gas-crepe-maker-thermostatic-control-cgom5-plcgom6",
      "seen": "2026-11-23"
     },
     {
      "name": "endoshoji.co.jp",
      "url": "https://www.endoshoji.co.jp/catalog_v212/pdf/P1002.pdf",
      "seen": "2026-11-23"
     }
    ],
    "est": [
     "max"
    ]
   },
   {
    "id": "drive-km",
    "min": 0,
    "max": 300,
    "step": 10,
    "default": 50,
    "src": [],
    "est": [
     "default",
     "max"
    ]
   }
  ],
  "fixed": {
   "lpg_eur_kg": {
    "value": 1.8,
    "unit": "€/kg",
    "src": [
     {
      "name": "fuel-prices.eu",
      "url": "https://www.fuel-prices.eu/live/france/gpl/en/",
      "seen": "2026-11-23"
     },
     {
      "name": "fuel-prices.eu",
      "url": "https://www.fuel-prices.eu/live/italy/gpl/en/",
      "seen": "2026-11-23"
     }
    ],
    "est": true
   },
   "diesel_eur_l": {
    "value": 2.05,
    "unit": "€/L",
    "src": [
     {
      "name": "fuel-prices.eu",
      "url": "https://www.fuel-prices.eu/news/weekly/europe-fuel-prices-week-2026-11-16/",
      "seen": "2026-11-23"
     }
    ],
    "est": false
   },
   "l_per_100km": {
    "value": 10,
    "unit": "L/100km",
    "src": [
     {
      "name": "promobil.de",
      "url": "https://www.promobil.de/weitere-ratgeber/so-testet-promobi-kraftstoff-verbrauch-diesel-wohnmobil/",
      "seen": "2026-11-23"
     }
    ],
    "est": false
   },
   "power_eur_kwh": {
    "value": 0.34,
    "unit": "€/kWh",
    "src": [
     {
      "name": "ec.europa.eu",
      "url": "https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_205/default/table?lang=en",
      "seen": "2026-11-23"
     }
    ],
    "est": false
   },
   "vat_pct": {
    "value": 7,
    "unit": "%",
    "src": [
     {
      "name": "europa.eu",
      "url": "https://europa.eu/youreurope/business/taxation/vat/vat-rules-rates/index_en.htm",
      "seen": "2026-11-23"
     }
    ],
    "est": true
   }
  },
  "premise": [
   {
    "label": "ガス（LPG）",
    "text": "€1.8/kg",
    "est": true
   },
   {
    "label": "軽油",
    "text": "€2.05/L",
    "est": false
   },
   {
    "label": "燃費",
    "text": "10L/100km",
    "est": false
   },
   {
    "label": "電気",
    "text": "€0.34/kWh",
    "est": false
   },
   {
    "label": "付加価値税",
    "text": "7%",
    "est": true
   },
   {
    "label": "円の換算",
    "text": "1€＝174.35円（2026年11月20日）",
    "est": false
   }
  ],
  "start": {
   "elec": 6.528,
   "left": 59.9221
  }
 },
 "rate": {
  "jpyPerEur": 174.35,
  "date": "2026-11-20",
  "src": [
   {
    "name": "data.ecb.europa.eu",
    "url": "https://data.ecb.europa.eu/data/datasets/EXR/EXR.D.JPY.EUR.SP00.A",
    "seen": "2026-11-23"
   }
  ]
 },
 "issues": {
  "asOf": "2026-11-23",
  "work": {
   "title": "ヨーロッパで働くための手続き",
   "text": "ヨーロッパは国ごとに、外国人が働いてよいかの決まりが違う。いくつか道を調べ、2026年11月、そのうち1本に手応えが出た"
  },
  "permit": {
   "title": "食べ物を売る許可",
   "plan": {
    "text": "あやとの考えは、1つめの国で売りながら、次の国の許可を取りに行くこと",
    "date": "2026-11-23"
   },
   "layers": [
    {
     "id": "before",
     "title": "その国で事業者になれるか",
     "text": "売る国で事業者と税の登録をする手続きが、食べ物の許可より先に来る",
     "weight": "heaviest",
     "weightLabel": "いちばん重い",
     "src": [
      {
       "name": "cm-lagos.pt",
       "url": "https://www.cm-lagos.pt/areas-de-atuacao/espaco-da-empresa/o-espaco-da-empresa-informa/documentos/download/27472/14458/104",
       "seen": "2026-11-23"
      },
      {
       "name": "entreprendre.service-public.gouv.fr",
       "url": "https://entreprendre.service-public.gouv.fr/vosdroits/F21856",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "food",
     "title": "食べ物の登録",
     "text": "EUの規則で、車1台を1つの施設として、事業を登録した国の当局に届け出る。多くの国で審査のない届け出",
     "weight": "light",
     "weightLabel": "軽い",
     "src": [
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2004/852/article/6/adopted",
       "seen": "2026-11-23"
      },
      {
       "name": "kontrollwiki.livsmedelsverket.se",
       "url": "https://kontrollwiki.livsmedelsverket.se/artikel/print/pdf/108",
       "seen": "2026-11-23"
      },
      {
       "name": "cm-lagos.pt",
       "url": "https://www.cm-lagos.pt/areas-de-atuacao/espaco-da-empresa/o-espaco-da-empresa-informa/documentos/download/27472/14458/104",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "place",
     "title": "売る場所の許可",
     "text": "自治体や主催者が場所ごとに出す。許可が下りるまで時間がかかる（オランダは8〜12週、ギリシャは公募と約2か月）",
     "weight": "heavy",
     "weightLabel": "重い",
     "src": [
      {
       "name": "business.gov.nl",
       "url": "https://business.gov.nl/starting-your-business/starting-situations/starting-a-food-truck-business/",
       "seen": "2026-11-23"
      },
      {
       "name": "en.mitos.gov.gr",
       "url": "https://en.mitos.gov.gr/index.php/%CE%94%CE%94:Street_food_market_vendor_licence",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "gear",
     "title": "設備の検査",
     "text": "ガスは使う人の免許ではなく、設備の検査と証明。ドイツは使う前と2年ごと、デンマークは最長24か月ごと",
     "weight": "mid",
     "weightLabel": "中",
     "src": [
      {
       "name": "vorschriften.bgn-branchenwissen.de",
       "url": "https://vorschriften.bgn-branchenwissen.de/daten/pdf/310_003.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "sik.dk",
       "url": "https://sik.dk/sites/default/files/2024-05/gas_i_foodtrucks_mv_2024.pdf",
       "seen": "2026-11-23"
      }
     ]
    }
   ],
   "compare": [
    {
     "id": "food",
     "label": "食べ物",
     "japan": "保健所の審査つきの許可。車1台ごとに車を持ち込んで検査を受ける（有効は5年以上）",
     "europe": "多くの国は審査のない届け出。事業を登録した国の当局へ出し、ほかのEUの国の登録をそのまま認める国もある",
     "src": [
      {
       "name": "laws.e-gov.go.jp",
       "url": "https://laws.e-gov.go.jp/law/322AC0000000233",
       "seen": "2026-11-23"
      },
      {
       "name": "hokeniryo1.metro.tokyo.lg.jp",
       "url": "https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/kyokatodokede/files/jidousha_tebiki202610.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2004/852/article/6/adopted",
       "seen": "2026-11-23"
      },
      {
       "name": "kontrollwiki.livsmedelsverket.se",
       "url": "https://kontrollwiki.livsmedelsverket.se/artikel/print/pdf/108",
       "seen": "2026-11-23"
      },
      {
       "name": "ruokavirasto.fi",
       "url": "https://www.ruokavirasto.fi/en/foodstuffs/food-sector/product-and-industry-specific-requirements/sale-of-food/foreign-mobile-sellers/",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "place",
     "label": "売る場所",
     "japan": "道路は警察、公園は管理者、イベントは主催者の許可",
     "europe": "自治体・主催者・警察の許可。国ごと、場所ごとに出す",
     "src": [
      {
       "name": "laws.e-gov.go.jp",
       "url": "https://laws.e-gov.go.jp/law/335AC0000000105",
       "seen": "2026-11-23"
      },
      {
       "name": "pref.osaka.lg.jp",
       "url": "https://www.pref.osaka.lg.jp/o100110/shokuhin/kyoka/jidousya_r70601.html",
       "seen": "2026-11-23"
      },
      {
       "name": "entreprendre.service-public.gouv.fr",
       "url": "https://entreprendre.service-public.gouv.fr/vosdroits/F21856",
       "seen": "2026-11-23"
      },
      {
       "name": "polisen.se",
       "url": "https://polisen.se/tjanster-tillstand/tillstand-ansok/avgifter-for-tillstand/",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "gear",
     "label": "設備と火",
     "japan": "火を使う催しは消防へ届けて消火器を置く（東京都）",
     "europe": "ガスの設備の定期検査（ドイツとデンマークは2年ごと）",
     "src": [
      {
       "name": "tfd.metro.tokyo.lg.jp",
       "url": "https://www.tfd.metro.tokyo.lg.jp/kouhyou/kijun/shugokasaiyobo.html",
       "seen": "2026-11-23"
      },
      {
       "name": "vorschriften.bgn-branchenwissen.de",
       "url": "https://vorschriften.bgn-branchenwissen.de/daten/pdf/310_003.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "sik.dk",
       "url": "https://sik.dk/sites/default/files/2024-05/gas_i_foodtrucks_mv_2024.pdf",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "person",
     "label": "人の資格",
     "japan": "食品衛生責任者（約6時間の講習。修了証は全国で有効）",
     "europe": "EU共通の免許は無い。国ごとの講習（フランスは14時間）",
     "src": [
      {
       "name": "hokeniryo1.metro.tokyo.lg.jp",
       "url": "https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/law/sekininsya.html",
       "seen": "2026-11-23"
      },
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2004/852/annex/II/chapter/XII/adopted",
       "seen": "2026-11-23"
      },
      {
       "name": "charente-maritime.gouv.fr",
       "url": "https://www.charente-maritime.gouv.fr/contenu/telechargement/67801/487188/file/Food-Trucks.pdf",
       "seen": "2026-11-23"
      }
     ]
    },
    {
     "id": "cross",
     "label": "県や国をまたぐ",
     "japan": "許可を出した自治体の区域ごと。県をまたいで1枚で通るのは大阪府と和歌山県のあいだだけ（2026年3月の国の資料）",
     "europe": "国によって扱いが分かれる。スウェーデンとフィンランドはEUの登録で足り、ポルトガルは届け出が要る",
     "src": [
      {
       "name": "mhlw.go.jp",
       "url": "https://www.mhlw.go.jp/content/001681567.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "mhlw.go.jp",
       "url": "https://www.mhlw.go.jp/content/10906000/001666048.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "kontrollwiki.livsmedelsverket.se",
       "url": "https://kontrollwiki.livsmedelsverket.se/artikel/print/pdf/108",
       "seen": "2026-11-23"
      },
      {
       "name": "ruokavirasto.fi",
       "url": "https://www.ruokavirasto.fi/en/foodstuffs/food-sector/product-and-industry-specific-requirements/sale-of-food/foreign-mobile-sellers/",
       "seen": "2026-11-23"
      },
      {
       "name": "ahresp.com",
       "url": "https://ahresp.com/app/uploads/2018/11/Regime_Jur%C3%ADdico_Restaura%C3%A7%C3%A3o_Bebidas.pdf",
       "seen": "2026-11-23"
      }
     ]
    }
   ]
  },
  "life": [
   {
    "name": "トイレ",
    "items": [
     {
      "n": 1,
      "id": "toilet-dump",
      "title": "トイレの中身の捨て場",
      "plan": "カセット式のトイレにして、捨て場をその週の道順に入れておく",
      "stars": 2,
      "src": []
     },
     {
      "n": 2,
      "id": "toilet-night",
      "title": "夜のトイレ",
      "plan": "車の中に置き、売る区画とは扉で分ける",
      "stars": 2,
      "src": []
     }
    ]
   },
   {
    "name": "水",
    "items": [
     {
      "n": 3,
      "id": "water-fill",
      "title": "きれいな水の補給",
      "plan": "100リットルのタンクを積み、キャンプ場やキャンピングカー用の駐車場で入れる",
      "stars": 2,
      "src": []
     },
     {
      "n": 4,
      "id": "grey-water",
      "title": "使った水の捨て場",
      "plan": "決められた排水口にだけ流す",
      "stars": 2,
      "src": []
     },
     {
      "n": 5,
      "id": "hand-wash",
      "title": "手洗いのお湯",
      "plan": "小さな湯沸かしを積む。国ごとの決まりを先に確かめる",
      "stars": 3,
      "src": [
       {
        "name": "legislation.gov.uk",
        "url": "https://www.legislation.gov.uk/eur/2004/852/annex/II/chapter/III",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 6,
      "id": "dish-wash",
      "title": "道具の洗い場",
      "plan": "器は使い捨てにし、道具は2つの槽で洗い、汚れた水は分けてためる",
      "stars": 3,
      "src": []
     },
     {
      "n": 7,
      "id": "water-weight",
      "title": "水の重さ",
      "plan": "売る日の朝だけタンクを満たす",
      "stars": 2,
      "src": []
     },
     {
      "n": 8,
      "id": "freeze",
      "title": "冬の凍結",
      "plan": "冬は南で過ごし、タンクは車の中に置く",
      "stars": 3,
      "src": []
     }
    ]
   },
   {
    "name": "電気",
    "items": [
     {
      "n": 10,
      "id": "fridge-power",
      "title": "冷蔵庫の電気",
      "plan": "屋根のソーラーと走りながらの充電でまかなう",
      "stars": 2,
      "src": []
     },
     {
      "n": 11,
      "id": "nordic-solar",
      "title": "冬と北欧はソーラーが発電しない",
      "plan": "外から電気をもらえるキャンプ場に泊まる",
      "stars": 3,
      "src": [
       {
        "name": "re.jrc.ec.europa.eu",
        "url": "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=59.91&lon=10.75&peakpower=0.4&loss=14&angle=0&aspect=0",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 12,
      "id": "baking-power",
      "title": "焼く機械の電気",
      "plan": "CEマークのある電気のたい焼き機をEUの店で買い、イベントの16Aの電源を借りる",
      "stars": 3,
      "src": [
       {
        "name": "maxima.com",
        "url": "https://maxima.com/de/digitales-waffeleisen-taiyaki-fischform-5-stueck.html",
        "seen": "2026-11-23"
       },
       {
        "name": "visitduesseldorf.de",
        "url": "https://www.visitduesseldorf.de/_Resources/Persistent/3966c6f550da854645695fa79ab32cb90107cb56/Informationen-Teilnahme-Zelt_2026.pdf",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 13,
      "id": "generator",
      "title": "発電機の音と禁止",
      "plan": "発電機は持たず、イベントの電源を借りる",
      "stars": 2,
      "src": []
     }
    ]
   },
   {
    "name": "ガス",
    "items": [
     {
      "n": 14,
      "id": "gas-fittings",
      "title": "ボンベの口金が国ごとに違う",
      "plan": "LPGの給油所で詰められるタンクと、変換の口金を積む",
      "stars": 3,
      "src": [
       {
        "name": "promobil.de",
        "url": "https://www.promobil.de/zubehoer/gasflaschen-adapter-fuer-europa-entnahme-und-fuellung-leicht-erklaert/",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 15,
      "id": "gas-ce",
      "title": "ガス機器のCEマーク",
      "plan": "ガスで使う機器はEUで買う",
      "stars": 3,
      "src": [
       {
        "name": "legislation.gov.uk",
        "url": "https://www.legislation.gov.uk/eur/2016/426/article/3/adopted",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 16,
      "id": "gas-check",
      "title": "ガスの点検と換気と一酸化炭素",
      "plan": "配管の検査を受け、一酸化炭素とガスの警報器を付ける",
      "stars": 2,
      "src": [
       {
        "name": "vorschriften.bgn-branchenwissen.de",
        "url": "https://vorschriften.bgn-branchenwissen.de/daten/pdf/310_003.pdf",
        "seen": "2026-11-23"
       }
      ]
     }
    ]
   },
   {
    "name": "寝床",
    "items": [
     {
      "n": 17,
      "id": "bed-kitchen",
      "title": "寝床と台所の分けかた",
      "plan": "扉で分け、寝具は袋にしまう。図面を作って先に当局に聞く",
      "stars": 4,
      "src": [
       {
        "name": "legislation.gov.uk",
        "url": "https://www.legislation.gov.uk/eur/2004/852/annex/II/chapter/III",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 31,
      "id": "no-overnight",
      "title": "自然保護区や海岸で泊まれない",
      "plan": "地図でキャンプ場や車中泊の場所を探す",
      "stars": 2,
      "src": [
       {
        "name": "diariodarepublica.pt",
        "url": "https://diariodarepublica.pt/dr/detalhe/lei/66-2021-170083315",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 32,
      "id": "camping-fine",
      "title": "キャンプと見なされて罰金になる",
      "plan": "売っていない時間は、椅子も台も外に出さない",
      "stars": 1,
      "src": [
       {
        "name": "diariodarepublica.pt",
        "url": "https://diariodarepublica.pt/dr/detalhe/lei/66-2021-170083315",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 33,
      "id": "event-night",
      "title": "イベント会場での夜",
      "plan": "主催者に車で寝てよいかを聞く",
      "stars": 2,
      "src": []
     },
     {
      "n": 45,
      "id": "damp",
      "title": "結露とカビ",
      "plan": "換気扇と除湿で防ぐ",
      "stars": 2,
      "src": []
     }
    ]
   },
   {
    "name": "車",
    "items": [
     {
      "n": 18,
      "id": "registration",
      "title": "車の登録の種類（キャンピングカーか販売車か）",
      "plan": "登録する国の検査機関に先に聞く",
      "stars": 4,
      "src": [
       {
        "name": "tuev-nord.de",
        "url": "https://www.tuev-nord.de/de/wissen/ratgeber-und-tipps-mobilitaet/wohnmobil-zulassung/",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 19,
      "id": "inspection-home",
      "title": "登録した国へ戻る車検",
      "plan": "旅の始まりと終わりを、登録した国にする",
      "stars": 3,
      "src": [
       {
        "name": "dgt.es",
        "url": "https://www.dgt.es/comunicacion/notas-de-prensa/20260316-trafico-actualiza-instruccion-autocaravanas/index.html",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 20,
      "id": "ownership",
      "title": "自分の名前で車を登録できない国がある",
      "plan": "登録できる国を先に調べて比べる",
      "stars": 5,
      "src": [
       {
        "name": "rdw.nl",
        "url": "https://www.rdw.nl/kopen-of-verkopen/kenteken-overschrijven-op-naam-van-een-persoon",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 21,
      "id": "insurance",
      "title": "車の保険（商売・車中泊・回る国）",
      "plan": "書面で確かめてから入る",
      "stars": 4,
      "src": [
       {
        "name": "europa.eu",
        "url": "https://europa.eu/youreurope/citizens/vehicles/insurance/validity/index_en.htm",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 40,
      "id": "breakdown",
      "title": "故障で止まる",
      "plan": "部品の手に入りやすい、ヨーロッパに多い車種を選ぶ",
      "stars": 3,
      "src": []
     }
    ]
   },
   {
    "name": "免許",
    "items": [
     {
      "n": 22,
      "id": "drive-period",
      "title": "旅行者として運転できる期間が国ごとに違う",
      "plan": "国ごとの表を作って滞在を組む",
      "stars": 2,
      "src": [
       {
        "name": "imt-ip.pt",
        "url": "https://www.imt-ip.pt/condutores/informacoes-gerais/quero-ser-condutor/tenho-carta-de-conducao-estrangeira/",
        "seen": "2026-11-23"
       },
       {
        "name": "vegvesen.no",
        "url": "https://www.vegvesen.no/en/driving-licences/driving-licence-holders/foreign-driving-licence-in-norway/using-a-non-eueea-driving-licence-in-norway/",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 23,
      "id": "idp-1year",
      "title": "国外運転免許証が1年で切れる",
      "plan": "旅のあいだに取り直す手立てを、出発の前に住所地の窓口で確かめる",
      "stars": 2,
      "src": [
       {
        "name": "npa.go.jp",
        "url": "https://www.npa.go.jp/policies/application/license_renewal/living_abroad.html",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 24,
      "id": "jp-license",
      "title": "日本の免許の更新",
      "plan": "一時帰国のときに、期間の前に更新する",
      "stars": 2,
      "src": [
       {
        "name": "police.pref.kanagawa.jp",
        "url": "https://www.police.pref.kanagawa.jp/assets/entry/83005_02.pdf",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 25,
      "id": "weight-35t",
      "title": "総重量3.5トンを超える",
      "plan": "3,500kgまでの車にし、荷を全部積んで量る",
      "stars": 3,
      "src": [
       {
        "name": "adac.de",
        "url": "https://www.adac.de/verkehr/rund-um-den-fuehrerschein/erwerb/anhaengerfuehrerschein-b96/",
        "seen": "2026-11-23"
       },
       {
        "name": "police.pref.osaka.lg.jp",
        "url": "https://www.police.pref.osaka.lg.jp/kotsu/untenmenkyo/shurui/5963.html",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 26,
      "id": "trailer-license",
      "title": "トレーラーの免許",
      "plan": "750kgまでのトレーラーにするか、けん引の免許を取る",
      "stars": 4,
      "src": [
       {
        "name": "adac.de",
        "url": "https://www.adac.de/verkehr/rund-um-den-fuehrerschein/erwerb/anhaengerfuehrerschein-b96/",
        "seen": "2026-11-23"
       }
      ]
     }
    ]
   },
   {
    "name": "道",
    "items": [
     {
      "n": 27,
      "id": "low-emission",
      "title": "排ガスの規制区域",
      "plan": "排ガスの基準Euro 6の車にし、フランスのシールや都市ごとの登録をそろえる",
      "stars": 3,
      "src": [
       {
        "name": "service-public.gouv.fr",
        "url": "https://www.service-public.gouv.fr/particuliers/vosdroits/F33371",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 28,
      "id": "tolls",
      "title": "自動で払う通行料とヴィネット",
      "plan": "道順に合わせて買う",
      "stars": 1,
      "src": [
       {
        "name": "www2.gov.pt",
        "url": "https://www2.gov.pt/en/noticias/sistema-easytoll-ja-se-encontra-disponivel-para-veiculos-de-matricula-estrangeira",
        "seen": "2026-11-23"
       },
       {
        "name": "oesterreich.gv.at",
        "url": "https://www.oesterreich.gv.at/en/themen/mobilitaet/kfz/10/Vignette-und-Maut/Vignette-fuer-Fahrzeuge-bis-3,5-t.html",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 29,
      "id": "ferries",
      "title": "船と橋が高い",
      "plan": "陸の道と時期を選び、車の長さを6m以下にする",
      "stars": 2,
      "src": [
       {
        "name": "oresundsbron.com",
        "url": "https://www.oresundsbron.com/en/prices",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 30,
      "id": "diesel",
      "title": "軽油が高い",
      "plan": "走る距離を抑え、同じ道を戻らずに回る",
      "stars": 3,
      "src": [
       {
        "name": "fuel-prices.eu",
        "url": "https://www.fuel-prices.eu/news/weekly/europe-fuel-prices-week-2026-11-16/",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 41,
      "id": "parking-size",
      "title": "高さと長さで停められない",
      "plan": "低くて短い車にする",
      "stars": 2,
      "src": []
     }
    ]
   },
   {
    "name": "暮らし",
    "items": [
     {
      "n": 34,
      "id": "shower",
      "title": "シャワー",
      "plan": "キャンプ場やジムで浴びる",
      "stars": 1,
      "src": []
     },
     {
      "n": 35,
      "id": "laundry",
      "title": "洗濯",
      "plan": "週に1回、コインランドリーへ行く",
      "stars": 1,
      "src": []
     },
     {
      "n": 36,
      "id": "stream-net",
      "title": "配信の回線",
      "plan": "現地のSIMを2社と、衛星の回線を用意する",
      "stars": 3,
      "src": []
     },
     {
      "n": 37,
      "id": "roaming",
      "title": "ローミングの4か月の決まり",
      "plan": "国ごとにプリペイドのSIMを買う",
      "stars": 2,
      "src": [
       {
        "name": "europa.eu",
        "url": "https://europa.eu/youreurope/roaming_en",
        "seen": "2026-11-23"
       }
      ]
     },
     {
      "n": 38,
      "id": "theft",
      "title": "盗難と車上荒らし",
      "plan": "機材を外から見せず、保険とGPSを付ける",
      "stars": 3,
      "src": []
     },
     {
      "n": 42,
      "id": "burns-health",
      "title": "やけどと体調",
      "plan": "救急箱を積み、保険で受けられる範囲を確かめる",
      "stars": 2,
      "src": []
     }
    ]
   },
   {
    "name": "店",
    "items": [
     {
      "n": 9,
      "id": "summer-heat",
      "title": "夏の暑さ（チョコと生地）",
      "plan": "12ボルトの冷蔵庫と保冷箱を使い、仕込みはその日にする",
      "stars": 3,
      "src": []
     },
     {
      "n": 39,
      "id": "one-person",
      "title": "1人で運転と仕込みと販売と配信をする",
      "plan": "売るのは週に1〜2日にし、移動の日は配信を軽くする",
      "stars": 4,
      "src": []
     },
     {
      "n": 43,
      "id": "cash",
      "title": "入金の遅れと現金",
      "plan": "カードで払えるようにする",
      "stars": 2,
      "src": []
     },
     {
      "n": 44,
      "id": "oil-waste",
      "title": "使った油とごみ",
      "plan": "主催者に回収してもらうか、持ち帰る",
      "stars": 2,
      "src": []
     },
     {
      "n": 46,
      "id": "temp-log",
      "title": "冷蔵の温度の記録",
      "plan": "温度を記録する計器を置く",
      "stars": 1,
      "src": []
     }
    ]
   }
  ]
 },
 "shorts": [
  "30日後、キッチンカーでヨーロッパを一周します",
  "魚の型が届いた",
  "1匹の原価、全部で何円？",
  "焼き失敗集",
  "あんこ、ヨーロッパの人は食べる？",
  "中身4種、どれが勝つ？",
  "魚の口からソフトクリーム",
  "1時間で何匹焼ける？",
  "外装、AとBどっち？",
  "白い車が魚の車になる",
  "キッチンカーで寝てみた",
  "電気、足りる？",
  "手洗い場がないと売れない",
  "「たい焼き」を8か国語で",
  "いくらなら買う？",
  "たこ焼き vs たい焼き",
  "タコを入れないたこ焼き",
  "100匹焼いてみた",
  "屋台の先輩に会いに行く",
  "初めての試し売り（10匹）",
  "売れ残り、どうする？",
  "1日目の場所を下見",
  "ルームツアー30秒",
  "荷物を半分に",
  "名前と看板が決まった",
  "1人で全部回す本番練習",
  "みんなの付箋、ぜんぶ焼いた",
  "大きい車でバック練習",
  "明日出発。最後の1匹",
  "いってきます"
 ],
 "progress": [
  {
   "date": "2025-03-22",
   "title": "リエージュのワッフル",
   "body": "ベルギーのリエージュでワッフルを食べた日に、キッチンカーでワッフルを売りながら日本を一周する話をした",
   "scene": {
    "date": "2025-03-22",
    "cite": "2025年3月22日の配信 2:17:00",
    "v": "_Crl6Z-HlBA",
    "t": 8220
   }
  },
  {
   "date": "2025-09-05",
   "title": "キャンピングカーでカフェ",
   "body": "ジョージアのボルジョミの配信で、視聴者さんからキャンピングカーでキッチンカーのカフェを開く案が届いた",
   "scene": {
    "date": "2025-09-05",
    "cite": "2025年9月5日の配信 1:11:00",
    "v": "vPgcesGxtvY",
    "t": 4260
   }
  },
  {
   "date": "2026-11-08",
   "title": "山の出店の行列",
   "body": "北マケドニアの山の出店に行列ができていたのを見て、キッチンカーでヨーロッパを一周する話が始まった",
   "scene": {
    "date": "2026-11-08",
    "cite": "2026年11月8日の配信 1:30:30",
    "v": "qAXRe3qQyvo",
    "t": 5430
   }
  },
  {
   "date": "2026-11-09",
   "title": "名前が付いた",
   "body": "ノマドキッチンカープロジェクトと名付けた"
  },
  {
   "date": "2026-11-21",
   "title": "たい焼きへ",
   "body": "ルーマニアへ向かうバスの中の作戦会議で、売るものの第1がたい焼きになった",
   "scene": {
    "date": "2026-11-21",
    "cite": "2026年11月21日の配信 4:01:00",
    "v": "A_cJ9CNM0G8",
    "t": 14460
   }
  },
  {
   "date": "2026-11-23",
   "title": "このページ",
   "body": "あやとの答えをもとに、このページを作り始めた"
  }
 ],
 "log": [
  {
   "date": "2026-11-23",
   "what": "外装と内装を北欧風・イタリアのマジョリカ焼き・ポルトガルのタイル・和風の4組にした",
   "why": "あやとがこの4つを挙げた",
   "by": "ayato"
  },
  {
   "date": "2026-11-23",
   "what": "キッチンカーの名前は付箋で集めてあやとが選ぶ",
   "why": "名前を一緒に考えること自体を遊びにして、決めるのはあやとにするため",
   "by": "ayato"
  },
  {
   "date": "2026-11-23",
   "what": "開始の目標を2027年の秋ごろにした",
   "why": "11月21日の配信で来年の秋を目標と話した",
   "by": "ayato"
  },
  {
   "date": "2026-11-23",
   "what": "車の最初の姿を窓口つきの箱バンにした",
   "why": "窓口と台所と寝床を1台に収められ、ひと目でキッチンカーと分かるため",
   "by": "guide"
  },
  {
   "date": "2026-11-23",
   "what": "たい焼き機は電気のものから考える",
   "why": "EUの店で売られていて、CEマークを確かめられたのは電気のたい焼き機だけだったため",
   "by": "guide"
  },
  {
   "date": "2026-11-21",
   "what": "売るものの第1をたい焼きにした",
   "why": "見た目が可愛く、中身が分かり、初めての人が買いたくなるため",
   "by": "ayato"
  }
 ],
 "facts": [
  {
   "id": "permit",
   "name": "食べ物を売る許可",
   "items": [
    {
     "id": "eu-852-register",
     "text": "EUの食品衛生の規則では、事業者が自分の施設を1つずつ当局に届け出て登録する",
     "src": [
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2004/852/article/6/adopted",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "eu-mobile-hygiene",
     "text": "移動や仮設の施設には、手洗い・飲み水・洗浄・廃水の決まりがある",
     "src": [
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2004/852/annex/II/chapter/III",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "eu-no-license",
     "text": "食べ物を扱う人には仕事に見合った衛生の教育が要る。EU共通の免許や試験は無い",
     "src": [
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2004/852/annex/II/chapter/XII/adopted",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "se-no-renotify",
     "text": "スウェーデンでは、EUかEEAで登録済みの移動施設は改めて届け出なくてよい",
     "src": [
      {
       "name": "kontrollwiki.livsmedelsverket.se",
       "url": "https://kontrollwiki.livsmedelsverket.se/artikel/print/pdf/108",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "se-not-review",
     "text": "スウェーデンの登録は審査ではなく、記録への記入",
     "src": [
      {
       "name": "kontrollwiki.livsmedelsverket.se",
       "url": "https://kontrollwiki.livsmedelsverket.se/artikel/print/pdf/108",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "se-police-fee",
     "text": "スウェーデンで公道を使う警察の許可の手数料は990クローナ",
     "src": [
      {
       "name": "polisen.se",
       "url": "https://polisen.se/tjanster-tillstand/tillstand-ansok/avgifter-for-tillstand/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "fi-six-months",
     "text": "フィンランドでは、ほかのEUの国で登録した移動施設の年6か月未満の営業は届け出が要らない",
     "src": [
      {
       "name": "ruokavirasto.fi",
       "url": "https://www.ruokavirasto.fi/en/foodstuffs/food-sector/product-and-industry-specific-requirements/sale-of-food/foreign-mobile-sellers/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "dk-30-days",
     "text": "デンマークでは、合わせて年およそ30日までのイベントでの営業は登録の対象の外",
     "src": [
      {
       "name": "retsinformation.dk",
       "url": "https://www.retsinformation.dk/api/pdf/248446",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "pt-mcp-event",
     "text": "ポルトガルでは、移動の飲食は市へ前もって届け出る。ラーゴス市の案内では、届け出は伝えたイベント1回だけ有効",
     "src": [
      {
       "name": "cm-lagos.pt",
       "url": "https://www.cm-lagos.pt/areas-de-atuacao/espaco-da-empresa/o-espaco-da-empresa-informa/documentos/download/27472/14458/104",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "pt-city-event",
     "text": "ポルトガルのラーゴス市では、市が主催する単発のイベントに出る事業者は、国の内外とも届け出が要らない",
     "src": [
      {
       "name": "cm-lagos.pt",
       "url": "https://www.cm-lagos.pt/areas-de-atuacao/espaco-da-empresa/o-espaco-da-empresa-informa/documentos/download/27472/14458/104",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "pt-foreign",
     "text": "ポルトガルの法律は、国外で設立した事業者にも移動の飲食の届け出を求める",
     "src": [
      {
       "name": "ahresp.com",
       "url": "https://ahresp.com/app/uploads/2018/11/Regime_Jur%C3%ADdico_Restaura%C3%A7%C3%A3o_Bebidas.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "es-retail",
     "text": "スペインでは、移動販売の車は小売の食品施設として州の登録に届け出る",
     "src": [
      {
       "name": "boe.es",
       "url": "https://www.boe.es/buscar/pdf/2022/BOE-A-2022-21681-consolidado.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "fr-ddpp",
     "text": "フランスではフードトラックは移動する飲食店で、県の役所に届け出る",
     "src": [
      {
       "name": "charente-maritime.gouv.fr",
       "url": "https://www.charente-maritime.gouv.fr/contenu/telechargement/67801/487188/file/Food-Trucks.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "fr-14h",
     "text": "フランスでは、フードトラックで少なくとも1人が14時間の衛生講習を受ける",
     "src": [
      {
       "name": "charente-maritime.gouv.fr",
       "url": "https://www.charente-maritime.gouv.fr/contenu/telechargement/67801/487188/file/Food-Trucks.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "fr-card",
     "text": "フランスの移動販売の登録証は30ユーロで4年有効。約15日〜1か月で届き、待つあいだは1か月の仮証明が出る",
     "src": [
      {
       "name": "entreprendre.service-public.gouv.fr",
       "url": "https://entreprendre.service-public.gouv.fr/vosdroits/F21856",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "de-gas-2y",
     "text": "ドイツでは、車のLPGの設備を使う前と少なくとも2年ごとに資格者が検査する",
     "src": [
      {
       "name": "vorschriften.bgn-branchenwissen.de",
       "url": "https://vorschriften.bgn-branchenwissen.de/daten/pdf/310_003.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "dk-gas-24m",
     "text": "デンマークでは、ガスの設備があるフードトラックは最長24か月ごとに認可業者の検査を受ける",
     "src": [
      {
       "name": "sik.dk",
       "url": "https://sik.dk/sites/default/files/2024-05/gas_i_foodtrucks_mv_2024.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "nl-8-12w",
     "text": "オランダでは、商工会議所と食品安全庁への登録が要り、自治体の許可に8〜12週かかることがある",
     "src": [
      {
       "name": "business.gov.nl",
       "url": "https://business.gov.nl/starting-your-business/starting-situations/starting-a-food-truck-business/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "nl-market",
     "text": "オランダでは、市場に車を停めて売るには自治体の市場の許可が要る。路上の祭りや年に1度の市は、主催者が自治体の許可を持っていれば、出店者の許可は要らないことが多い",
     "src": [
      {
       "name": "business.gov.nl",
       "url": "https://business.gov.nl/starting-your-business/starting-situations/starting-a-food-truck-business/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gr-street-food",
     "text": "ギリシャのストリートフードの市場の出店は市の公募で決まり、手続きは約2か月",
     "src": [
      {
       "name": "en.mitos.gov.gr",
       "url": "https://en.mitos.gov.gr/index.php/%CE%94%CE%94:Street_food_market_vendor_licence",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "cz-prague",
     "text": "プラハでは、旧市街の文化財保護区で車の移動販売が禁止されている（一部の公園などを除く）",
     "src": [
      {
       "name": "sbirkapp.gov.cz",
       "url": "https://sbirkapp.gov.cz/detail/SPPPN4QKCDSULXMM/text",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "no-oslo",
     "text": "オスロの公有地のフードトラックの枠は6か所で年48,296クローネ。2026年11月23日に見たときは空きが無かった",
     "src": [
      {
       "name": "oslo.kommune.no",
       "url": "https://www.oslo.kommune.no/gate-transport-og-parkering/leie-torg-fortau-og-gater/sok-om-plass-til-foodtrucks/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "no-exam",
     "text": "ノルウェーの飲食の許可には、管理者がノルウェー語の試験に受かる必要がある",
     "src": [
      {
       "name": "oslo.kommune.no",
       "url": "https://www.oslo.kommune.no/skatt-og-naring/salg-servering-og-skjenking/etablerer-og-kunnskapsprovene/etablererproven/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    }
   ]
  },
  {
   "id": "japan",
   "name": "日本の許可",
   "items": [
    {
     "id": "jp-permit-car",
     "text": "日本の保健所の営業許可は車1台ごと。車を持ち込んで検査を受けて取る",
     "src": [
      {
       "name": "hokeniryo1.metro.tokyo.lg.jp",
       "url": "https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/kyokatodokede/files/jidousha_tebiki202610.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "laws.e-gov.go.jp",
       "url": "https://laws.e-gov.go.jp/law/323M40000100023",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-5years",
     "text": "営業許可の有効期間は法律で5年を下らない（北海道は5年、福岡市は6年）",
     "src": [
      {
       "name": "laws.e-gov.go.jp",
       "url": "https://laws.e-gov.go.jp/law/322AC0000000233",
       "seen": "2026-11-23"
      },
      {
       "name": "pref.hokkaido.lg.jp",
       "url": "https://www.pref.hokkaido.lg.jp/hf/kse/kitchen-car.html",
       "seen": "2026-11-23"
      },
      {
       "name": "city.fukuoka.lg.jp",
       "url": "https://www.city.fukuoka.lg.jp/hofuku/hokensho/shokuhinanzen/minami_kitchencar.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-fee",
     "text": "自動車の飲食店営業の許可の手数料は16,000〜18,300円の例がある（港区・福岡市・世田谷区）",
     "src": [
      {
       "name": "city.minato.tokyo.jp",
       "url": "https://www.city.minato.tokyo.jp/shokuhinkouiki/kurashi/shokuhin/anzen/documents/jidousya.html",
       "seen": "2026-11-23"
      },
      {
       "name": "city.fukuoka.lg.jp",
       "url": "https://www.city.fukuoka.lg.jp/hofuku/hokensho/shokuhinanzen/minami_kitchencar.html",
       "seen": "2026-11-23"
      },
      {
       "name": "city.setagaya.lg.jp",
       "url": "https://www.city.setagaya.lg.jp/02245/3240.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-area",
     "text": "許可が効くのは、許可を出した自治体の区域だけ。東京都は都内一円",
     "src": [
      {
       "name": "mhlw.go.jp",
       "url": "https://www.mhlw.go.jp/content/10906000/001666048.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "hokeniryo1.metro.tokyo.lg.jp",
       "url": "https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/kyokatodokede/files/jidousha_tebiki202610.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-cross",
     "text": "県をまたいで1枚で通るのは大阪府と和歌山県のあいだだけ（2026年3月の国の資料）",
     "src": [
      {
       "name": "mhlw.go.jp",
       "url": "https://www.mhlw.go.jp/content/001681567.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "mhlw.go.jp",
       "url": "https://www.mhlw.go.jp/content/10906000/001666048.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-place",
     "text": "保健所の許可とは別に、道路は警察、公園は管理者、イベントは主催者の許可が要る",
     "src": [
      {
       "name": "laws.e-gov.go.jp",
       "url": "https://laws.e-gov.go.jp/law/335AC0000000105",
       "seen": "2026-11-23"
      },
      {
       "name": "pref.osaka.lg.jp",
       "url": "https://www.pref.osaka.lg.jp/o100110/shokuhin/kyoka/jidousya_r70601.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-fire",
     "text": "東京都では、火を使う催しの露店は3日前までに消防署へ届け、消火器を置く",
     "src": [
      {
       "name": "tfd.metro.tokyo.lg.jp",
       "url": "https://www.tfd.metro.tokyo.lg.jp/kouhyou/kijun/shugokasaiyobo.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-tank",
     "text": "キッチンカーの水のタンクは、営業の中身によって約40・80・200リットルの3つ",
     "src": [
      {
       "name": "laws.e-gov.go.jp",
       "url": "https://laws.e-gov.go.jp/law/323M40000100023",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "jp-sekininsha",
     "text": "食品衛生責任者の講習は東京都で約6時間・12,000円。修了証は全国で有効",
     "src": [
      {
       "name": "hokeniryo1.metro.tokyo.lg.jp",
       "url": "https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/law/sekininsya.html",
       "seen": "2026-11-23"
      },
      {
       "name": "toshoku.or.jp",
       "url": "https://www.toshoku.or.jp/training/index.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    }
   ]
  },
  {
   "id": "vehicle",
   "name": "車と免許",
   "items": [
    {
     "id": "vh-box-van-price",
     "text": "中古の販売車の掲載は、オランダの€7,950からドイツの€75,630（税別）まで",
     "src": [
      {
       "name": "truckscout24.de",
       "url": "https://www.truckscout24.de/transporter/gebraucht/verkaufswagen-food-truck",
       "seen": "2026-11-23"
      },
      {
       "name": "marktplaats.nl",
       "url": "https://www.marktplaats.nl/q/foodtruck/",
       "seen": "2026-11-23"
      },
      {
       "name": "olx.pt",
       "url": "https://www.olx.pt/ads/q-food-truck/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "vh-de-camper-reg",
     "text": "ドイツのキャンピングカーの登録は、中の大半が住むための作りであることが条件",
     "src": [
      {
       "name": "tuev-nord.de",
       "url": "https://www.tuev-nord.de/de/wissen/ratgeber-und-tipps-mobilitaet/wohnmobil-zulassung/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "vh-eu-insurance",
     "text": "EUの国で登録した車の強制保険は、EUのほかの国でも有効",
     "src": [
      {
       "name": "europa.eu",
       "url": "https://europa.eu/youreurope/citizens/vehicles/insurance/validity/index_en.htm",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "vh-license-b",
     "text": "EUのB免許で運転できるのは総重量3,500kgまで",
     "src": [
      {
       "name": "adac.de",
       "url": "https://www.adac.de/verkehr/rund-um-den-fuehrerschein/erwerb/anhaengerfuehrerschein-b96/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "vh-jp-license",
     "text": "日本の普通免許（2017年3月12日以降）は総重量3.5トン未満",
     "src": [
      {
       "name": "police.pref.osaka.lg.jp",
       "url": "https://www.police.pref.osaka.lg.jp/kotsu/untenmenkyo/shurui/5963.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "vh-idp",
     "text": "国外運転免許証の有効期間は発給から1年",
     "src": [
      {
       "name": "pref.aichi.jp",
       "url": "https://www.pref.aichi.jp/police/menkyo/qa/menkyo/kokusai.html",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    }
   ]
  },
  {
   "id": "gear",
   "name": "機材",
   "items": [
    {
     "id": "gear-taiyaki-ce",
     "text": "EUの店で売られているたい焼き機で、CEマークを確かめられたのは電気のもの（5匹焼き・3.2kW・21kg）だった",
     "src": [
      {
       "name": "maxima.com",
       "url": "https://maxima.com/de/digitales-waffeleisen-taiyaki-fischform-5-stueck.html",
       "seen": "2026-11-23"
      },
      {
       "name": "server.maximakitchenequipment.com",
       "url": "https://server.maximakitchenequipment.com/maxima/maxima-manuals/09374182_UM.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-gas-rule",
     "text": "EUの規則では、ガスを燃やす調理の機器は決まりに合わないと売ることも使い始めることもできない",
     "src": [
      {
       "name": "legislation.gov.uk",
       "url": "https://www.legislation.gov.uk/eur/2016/426/article/3/adopted",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-used-import",
     "text": "中古の品も、EUの外から初めて入るときにEUの製品の決まりの対象になる",
     "src": [
      {
       "name": "transport-community.org",
       "url": "https://www.transport-community.org/wp-content/uploads/2024/03/DG-GROW-Blue-Guide-March-2024.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-japan-no-ce",
     "text": "日本の業務用のたい焼き機とたこ焼き器のカタログに、CEマークの記載は無い",
     "src": [
      {
       "name": "endoshoji.co.jp",
       "url": "https://www.endoshoji.co.jp/catalog_v212/pdf/P1005.pdf",
       "seen": "2026-11-23"
      },
      {
       "name": "endoshoji.co.jp",
       "url": "https://www.endoshoji.co.jp/catalog_v212/pdf/P1002.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-softserve",
     "text": "卓上のソフトクリーム機の例は1.15kWで45kg。取扱説明書は毎日の殺菌と2週ごとの分解洗浄を求める",
     "src": [
      {
       "name": "static.ggmgastro.com",
       "url": "https://static.ggmgastro.com/Cafe%20%26%20Eis/Softeismaschinen/SEMG16K/SEMG16K%20Manual%20EN.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-whip",
     "text": "1リットルのホイップの道具は電気を使わず、重さは約1.3kg",
     "src": [
      {
       "name": "culinary.isi.com",
       "url": "https://culinary.isi.com/en-US/culinary/product/gourmet-whip-1l",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-nl-n2o",
     "text": "オランダは2023年から笑気ガスを禁じたが、食品のホイップに使うのは例外",
     "src": [
      {
       "name": "rijksoverheid.nl",
       "url": "https://www.rijksoverheid.nl/onderwerpen/drugs/verbod-op-lachgas",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "gear-pizza-oven",
     "text": "ガスのピザ窯（2枚焼き）の例は24kWでガスは最大1.35kg/時、重さは175kg",
     "src": [
      {
       "name": "cdn.shopify.com",
       "url": "https://cdn.shopify.com/s/files/1/1241/8236/files/st-QUICK-2PIZZE-GAS.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    }
   ]
  },
  {
   "id": "market",
   "name": "場所と値段",
   "items": [
    {
     "id": "mk-taiyaki-price",
     "text": "ヨーロッパの店のたい焼きは1匹€2〜3.6の例（ソフィア・ベルリン・プラハ）",
     "src": [
      {
       "name": "glovoapp.com",
       "url": "https://glovoapp.com/kk/bg/sofia/stores/taiyaki-spot-sof",
       "seen": "2026-11-23"
      },
      {
       "name": "speisekarte.de",
       "url": "https://www.speisekarte.de/berlin/restaurant/mr_melon_pan/speisekarte",
       "seen": "2026-11-23"
      },
      {
       "name": "expats.cz",
       "url": "https://www.expats.cz/czech-news/article/taiyaki-bar-a-japanese-ice-cream-spot-debuts-in-prague",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "mk-pizza-truck",
     "text": "ドイツのピザのキッチンカーのマルゲリータは€8.00〜8.90（2025年のメニュー）",
     "src": [
      {
       "name": "speisekarte.de",
       "url": "https://www.speisekarte.de/ingolstadt-donau/restaurant/apizz_pizzawagen_foodtruck_ingolstadt/speisekarte",
       "seen": "2026-11-23"
      },
      {
       "name": "speisekarte.de",
       "url": "https://www.speisekarte.de/ratingen/restaurant/pizza_point_foodtruck/speisekarte",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "mk-nuremberg",
     "text": "ニュルンベルクの青空市場で1日だけ出す場所代は、売り場の前1mあたり€11.35。電気代は別",
     "src": [
      {
       "name": "nuernberg.de",
       "url": "https://www.nuernberg.de/imperia/md/maerkte/dokumente/gebuehrentarif.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "mk-evora",
     "text": "ポルトガルのエヴォラのクリスマスマーケット（2025年）は、バーと揚げ菓子のトレーラーの出店が15日間で€200（税込）",
     "src": [
      {
       "name": "cm-evora.pt",
       "url": "https://www.cm-evora.pt/wp-content/uploads/2025/11/Normas-de-Participacao-2025.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "mk-bad-homburg",
     "text": "ドイツのバート・ホンブルクのクリスマスマーケット（2026年）は、キッチンカーの枠が12日間で税別€1,320（三輪の小型車）か€2,640（それより大きい車）。広告と電源の口の€80と電気代は別",
     "src": [
      {
       "name": "bad-homburg.de",
       "url": "https://www.bad-homburg.de/events/weihnachtsstadt/Weihnachtsstadt%202026/AVB_Weihnachtsmarkt%20Schloss_Winterzauber_Bad%20Homburg%202026.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "mk-xmas-deadline",
     "text": "有名なクリスマスマーケットの応募の締め切りは、前の年の12月31日（ミュンヘン）からその年の5月7日（ドレスデン）まで",
     "src": [
      {
       "name": "stadt.muenchen.de",
       "url": "https://stadt.muenchen.de/service/info/christkindlmarkt-genehmigung-fur-verkaufsstand/1081176/",
       "seen": "2026-11-23"
      },
      {
       "name": "dresden.de",
       "url": "https://www.dresden.de/media/pdf/wirtschaft/markte/STM-2026-Ausschreibungstext.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "mk-japan-fest",
     "text": "デュッセルドルフの日本デーでは、キッチンカーの場所代が1㎡あたり€100（税別）",
     "src": [
      {
       "name": "visitduesseldorf.de",
       "url": "https://www.visitduesseldorf.de/_Resources/Persistent/3966c6f550da854645695fa79ab32cb90107cb56/Informationen-Teilnahme-Zelt_2026.pdf",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "mk-fest-share",
     "text": "オランダの夏のフェスで、売上の20〜30%を主催者に払った例がある（2016年）",
     "src": [
      {
       "name": "nos.nl",
       "url": "https://nos.nl/op3/artikel/2131539-met-80-km-u-naar-denemarken-om-pannenkoeken-te-bakken",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "mk-diesel",
     "text": "軽油のEUの平均は1リットル€2.05（2026年11月16日の週）",
     "src": [
      {
       "name": "fuel-prices.eu",
       "url": "https://www.fuel-prices.eu/news/weekly/europe-fuel-prices-week-2026-11-16/",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    }
   ]
  },
  {
   "id": "life",
   "name": "暮らし",
   "items": [
    {
     "id": "lf-solar",
     "text": "400Wのソーラーの発電は、リスボンの7月で1日2.37kWh、オスロの12月で1日0.03kWh",
     "src": [
      {
       "name": "re.jrc.ec.europa.eu",
       "url": "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=38.72&lon=-9.14&peakpower=0.4&loss=14&angle=0&aspect=0",
       "seen": "2026-11-23"
      },
      {
       "name": "re.jrc.ec.europa.eu",
       "url": "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=59.91&lon=10.75&peakpower=0.4&loss=14&angle=0&aspect=0",
       "seen": "2026-11-23"
      }
     ],
     "grade": "確"
    },
    {
     "id": "lf-roaming",
     "text": "EUのローミングは4か月の使いかたを見て、外国での利用が多いと追加料金の対象になる",
     "src": [
      {
       "name": "europa.eu",
       "url": "https://europa.eu/youreurope/roaming_en",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    },
    {
     "id": "lf-pt-overnight",
     "text": "ポルトガルでは、保護区の外でも同じ市に泊まれるのは最長48時間。罰金は€60〜300",
     "src": [
      {
       "name": "diariodarepublica.pt",
       "url": "https://diariodarepublica.pt/dr/detalhe/lei/66-2021-170083315",
       "seen": "2026-11-23"
      }
     ],
     "grade": "二"
    }
   ]
  }
 ],
 "hash": "17a95892fd6f"
}
/* ここまで */;
