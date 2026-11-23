# ノマドキッチンカープロジェクト — 材料の受け渡しの型（運営が決めた。材料・絵・3D・面の担当が同じものを読む）

- 企画書: GitHub issue Ayato-kosaka/live-streaming#1418 の本文「2. ページの企画書」「3. 運営が決めたこと」と、あやとの答え（同じ issue のコメント
  7108400397）。**本文と答えが違う所は答えが正**（「この話をした配信」の節を置かない・実現度の % を出さない・収益は1日まで など）
- 決まりの条: ADR 0018（始まる前の企画の面と下書きの印。`docs/spec/model.md` M-8・M-33）、ADR 0020（計画と課題・判断の記録・試算を持つ／
  ガイドブックの形の紙面の絵は画集の調子、遊びと3Dは島の絵の調子）、`docs/spec/routes.md` R-10
- 作法はインド屋台飯100食（`python/data/legends/india-street-food/README.md`）とそろえる: 材料は `book.json`（字・数・出どころ）、
  絵の注文は `art_order.json`、`meta` を頭に置く、事実は `src`（https の URL の配列）を連れてくる、`id` は英小文字とハイフンで**一度決めたら変えない**
  （絵のファイル名・面の錨・付箋の宛先になる）

## 置き場

| 何 | 置き場 | 書く人 |
| --- | --- | --- |
| 材料（字・数・出どころ） | `python/data/legends/nomad-kitchen-car/book.json` | 材料担当 |
| 絵の注文書 | `python/data/legends/nomad-kitchen-car/art_order.json` | 材料担当 → 絵担当 |
| 本物のキッチンカーの写真（選んだもの） | `python/data/legends/nomad-kitchen-car/photos.json` | 絵担当 |
| 材料を数えて確かめる道具 | `python/legend_kitchen_check.py`（毎 PR で回す見張り `python/legend_kitchen_check_selftest.py`） | 材料担当 |
| 焼く道具 | `python/legend_kitchen_bake.py`（インドの `python/legend_book_bake.py` の小道具を借りる） | 面担当 |
| 焼いた中身（面が読む） | `site/content/legends/nomad-kitchen-car.ts`（`NOMAD_KITCHEN_CAR`。頭に「自動生成。手で直さない」） | 面担当の焼く道具 |
| 描いた絵 | `site/public/legends/nomad-kitchen-car/`（下の「絵の置き場」） | 紙面の絵と `manifest.json` は絵担当（`legend_art.py` の finalize）、外装・内装と `skins.json` は `tools/van3d/skin_pack.py`、3D の静止画は Actions |
| 3D の寸法表と、外装・内装の型の絵 | `site/components/legends/kitchen/van3d/dims.json`・`tools/van3d/`（型の絵と、柄を型へ貼り込む道具） | 3D 担当 |

材料と絵は面の部品より先に置いてよい。面に出るのは、面担当が焼いて組んだ日から。

## 面の並びと、材料の欄

| # | 節 | `book.json` の欄 | 絵 |
| --- | --- | --- | --- |
| 1 | 表紙 | `meta`・`cover` | `cover` |
| 2 | ルートと景色（イメージ） | `route`・`views` | `map`・`views/<id>` |
| 3 | 売るもの（メニュー開発のシミュレーション・食べ物ごとの比較） | `menu`・`foods`・`fillings`・`places`・`sim` | `foods/<id>`（シミュレーションの具は島の焼いた絵 `site/public/sprites/food-*`） |
| 4 | 外装と内装（キッチンカーの着せ替え・車の候補の比較・キッチンカーの実際の様子） | `looks`・`vehicles`・`buy_or_rent`（写真は `photos.json`。台所と寝床の並べ替えの区画は 3D 担当の `dims.json`） | `skins/<id>`・`interiors/<id>`・`vehicles/<id>`・`stills/…` |
| 5 | 収益構造（1日の収益のシミュレーション） | `money` | — |
| 6 | 課題一覧（特大課題2つ・暮らしの課題46件） | `issues` | — |
| 7 | 30日後にキッチンカーでヨーロッパを一周する人 | `shorts` | — |
| 8 | 付箋 | `notes`（**印を外す日に** `site/content/themes.ts` へ移す。下の「お題」） | — |
| 9 | 下のほうに畳む: ここまでの進み具合・判断ログ・確かめた事実 | `progress`・`log`・`facts` | — |
| 10 | 書き手（あやと島案内鳥） | なし（面の部品が持つ） | — |

置かないものは #1418 本文3章の「載せないもの」と、あやとの答え（上）。ここには並べ直さない。

## 焼く道具が持つ字（材料に書かない）

節の名前と、言い方の決まった字は焼く道具が持つ（インドの `SECTIONS` と同じ。出どころは #1418 とあやとの答え）。材料に同じ字を書かない。

| 鍵 | 字 |
| --- | --- |
| `route` | ルートと景色 |
| `menu` | 売るもの（中に「メニュー開発のシミュレーション」「食べ物ごとの比較」） |
| `look` | 外装と内装（中に「キッチンカーの着せ替え」「車の候補の比較」「キッチンカーの実際の様子」） |
| `money` | 収益構造（中に「1日の収益のシミュレーション」） |
| `issues` | 課題一覧（中に「特大課題」「暮らしの課題」） |
| `shorts` | 30日後にキッチンカーでヨーロッパを一周する人 |
| `progress`・`log`・`facts` | ここまでの進み具合・判断ログ・確かめた事実 |
| 添える字 | ルート「イメージ。まだ決まっていない」／30本「こんな形でやりたいと思っている（2026年11月）」／数字「目安」／課題「2026年11月23日時点の考え」 |

## book.json の形

```jsonc
{
  "slug": "nomad-kitchen-car",
  "updated": "YYYY-MM-DD",      // 材料の字が変わった日（ビルドの日にしない）
  "seen": "2026-11-23",         // 出どころを見た日の既定。項目ごとに "seen" で上書きできる（面の出どころの行に「◯月◯日に見た」）
  "rate": { "jpy_per_eur": 174.35, "date": "2026-11-20", "src": ["https://…"] },  // 円に直す1本。円は焼く道具と面が計算する（材料に円を書かない）

  "meta": {
    "title": "…",               // <title>。25〜45字。中身で立てる（キッチンカーでヨーロッパ一周、が入る）
    "description": "…",         // 80〜160字
    "h1": "ノマドキッチンカープロジェクト",                       // この字のまま
    "sub": "…",                 // 見出しの下の一行。何をする企画かを人の言葉で1文に（キャッチの言い回しにしない。guide-copy 0章）
    "goal": "2027年の秋ごろの開始を目標に進めている（2026年11月）"  // この字のまま。日付の欄にしない（企画の表の日付は空のまま）
  },

  "cover": {
    "quotes": [                 // ちょうど2つ。この順。本人の言葉（字幕の字のまま。読点は足してよい）。場面のリンクは持たない（日付だけで引く）
      { "id": "world-first", "text": "世界初の、世界初", "date": "2026-11-09" },
      { "id": "dream", "text": "夢の夢の夢のプロジェクト", "date": "2026-11-21" }
    ],
    "note": "2026年11月に調べた範囲では、キッチンカーでヨーロッパを一周した例は見つからなかった"  // この字のまま（小さな注）
  },

  "route": {
    "plan": { "text": "あやとの例は、ポルトガルから北欧、ギリシャのあたりまで", "date": "2026-11-23" },
    // ↑ 案内鳥の地の文。この字のまま。あやとの話をまとめた字で、本人の字そのものではないので、本人の言葉の枠（「」）で引かない
    "line": [ { "lat": 38.7223, "lon": -9.1393 } ],   // 線の通り道（2〜40点）。絵地図に点線で焼く。**日付・季節・長さ・何日を持たない**
    "labels": [                 // 絵に焼く地名。あやとの例の3つだけ
      { "id": "portugal", "name": "ポルトガル", "lat": 0, "lon": 0 },
      { "id": "nordic", "name": "北欧", "lat": 0, "lon": 0 },
      { "id": "greece", "name": "ギリシャ", "lat": 0, "lon": 0 }
    ],
    "countries": ["…"]          // 線が通る国のうち、島に国の面が在るものの slug（`site/content/travel.ts` の国）。札で引く。0〜20
  },
  "views": [                    // ちょうど5。この id でこの順。景色は「ここに停めて売りたい」という企画の話として書く
    { "id": "lake-town", "title": "湖のある町", "lead": "…",
      "said": { "date": "2026-11-21", "videoId": "A_cJ9CNM0G8", "at": "4:07:30" } }
    // sea-town 海が見える町／mountain-town 山の途中の町／local-spot 地元の穴場（ここまで 11/21 の同じ場面）
    // italy-seaside イタリアの海辺（2026-11-08。場面のリンクは持たない）。lead は 0〜30字（無くてよい）。見出しを言い直さず、続きを1つだけ
  ],

  "menu": {
    "picks": [                  // 第1〜第3。rank 1 は taiyaki、2 は takoyaki、3 は crepe・waffle・pizza（ちょうど5行）
      { "rank": 1, "food": "taiyaki" }
    ],
    "decided": { "date": "2026-11-21", "videoId": "A_cJ9CNM0G8", "at": "4:01:00" },  // たい焼きが第1になった場面
    "why": [ { "id": "first-timers", "text": "…" } ],   // なぜたい焼きか。4〜7行。#1418 とあやとの言葉から（読点で割らない。同じ止めかたを3つ続けない）
    "ideas": [                  // メニューの候補の表。5〜20行
      { "id": "croissant-taiyaki", "name": "クロワッサン生地のたい焼き", "food": "taiyaki", "from": "viewer", "date": "2026-11-21" }
      // from は "ayato" か "viewer"。viewer は運営が採った視聴者さんの案で、面には「視聴者さんの案」とだけ出る。
      // **名前・ハンドル・チャットの字を持たない**（docs/README.md D-9）。案の名前は運営が付け直した字。
      // 誰の案かは、字幕とチャットの時刻を並べて、先に言ったほうにする（あやとが先なら ayato）
    ]
  },
  "foods": [                    // ちょうど5。taiyaki takoyaki crepe waffle pizza の順。比較の表とシミュレーションが同じ数を読む
    { "id": "taiyaki", "name": "たい焼き", "unit": "匹", "sim": true,   // sim: メニュー開発の「生地」に並ぶか（pizza だけ false）
      "per_hour": [40, 60],     // 1人で焼いて売る数（1時間）
      "price": [2.6, 4.5],      // ヨーロッパの店の1個の値段（€）
      "cost": [0.20, 0.45],     // よくある1個の材料（€。比較の表の利益に使う）
      "dough": [0.05, 0.10],    // 生地1個ぶんの材料（€。シミュレーション）
      "pack": [0.03, 0.10],     // 包み1個ぶん（€）
      "machine": "…",           // 機材の字（事業者や商品の名前を書かない。「電気のたい焼き機（5匹焼き）」の形。1台の機械の値だけを書く）
      "energy": { "kind": "電気", "text": "…", "gas_kg_h": 0, "elec_kw": 3.2 },
      // kind は 電気 | ガス。gas_kg_h はガスの1時間の量（電気なら 0）。elec_kw は電気の機械の kW（ガスなら 0）
      "src": ["https://…"], "est": ["per_hour"] }   // est: 出どころが見立て（推）の欄の名前。数は src か est のどちらかを必ず持つ
  ],
  "fillings": [                 // 中身の候補。10〜30
    { "id": "chocolate", "name": "チョコ", "foods": ["taiyaki", "takoyaki", "crepe", "waffle"],
      "cost": [0.08, 0.10],     // 1個に3つ入れるときの1つぶんの材料（€）
      "known": 3,               // 初めての人に中身が分かるか: 3 分かる／2 好みが分かれる／1 分からない・こわがられる（あんこ・たこは 1）
      "allergens": ["乳", "大豆"],   // EU の14品目の字（規則 1169/2011 附属書 II）
      "flags": [],              // "pork" | "alcohol" | "gelatin"
      "from": "ayato",          // "ayato" | "viewer" | "guide"（運営が足した定番）
      "sprite": "food-chocolate",   // 島の焼いた絵（site/public/sprites/<名前>.webp）。無ければ書かない
      "src": ["https://…"], "est": [] }
  ],
  "places": [                   // 売る場所。3〜5。名前は日本の旅行者が使う字（青空市場・クリスマスマーケット。訳して作らない。guide-design ★7）
    { "id": "town-market", "name": "青空市場",
      "fee": { "kind": "fixed", "eur": [15, 60] },   // kind: fixed（€/日。場所代と電源の口まで。電気の使った分は含めない）| share（"pct": [20, 30]。売上の割合）
      "hours": 6,               // 売る時間
      "buyers": [30, 80],       // 1日に来て買いそうな人の幅
      "src": ["https://…"], "est": ["buyers"] }
  ],
  "sim": {                      // メニュー開発のシミュレーションの最初の形（収益構造の最初の値も、ここから焼く道具が組む）
    "food": "taiyaki", "fillings": ["chocolate", "banana", "strawberry"], "price": 3.5, "place": "town-market",
    "say": { "bake": "…", "crowd": "…", "loss": "…", "thin": "…", "pricey": "…", "unknown": "…", "good": "…" }
    // 案内鳥のひとこと。鍵はこの7つ（焼くのが追いつかない／人が足りない／赤字／利益が薄い／相場より高い／中身が分かりにくい／うまく回る）。各40字まで
  },

  "looks": [                    // 外装と内装の組。4〜8。先頭の4組は nordic majolica azulejo wa の順（あやとの答えの順）
    { "id": "nordic", "name": "北欧風", "lead": "…", "interior": { "name": "…", "lead": "…" } },
    { "id": "majolica", "name": "イタリアのマジョリカ焼き", "lead": "…",
      "interior": { "name": "サンスーシ宮殿の花の部屋", "lead": "…", "src": ["https://…"] } }
    // azulejo ポルトガルのタイル／wa 和風。色（車体・差し色・庇の縞）は skin_pack が skins.json に書く（字ではないので）
    // 5組目からは、あやとが ChatGPT で描いて渡した絵の組（#1418 本文2章の5「1組ずつ増える」）。絵を skin_pack で型へ貼り込み、
    // ここに1行・art_order.json の looks に1行を足す（id は英小文字とハイフン。付箋に貼られた絵は使わない）
  ],
  "vehicles": [                 // 車の候補。ちょうど4。small-van box-van campervan-tent camper-trailer の順
    { "id": "small-van", "name": "小さい車",
      "said": { "text": "アルファードみたいなやつ", "date": "2026-11-15", "videoId": "hJ6vFAGX3rI", "at": "1:01:00" },
      "price": { "eur": [5000, 20000], "what": "…" },   // 掲載例の幅と、何の値段か
      "license": "…", "good": "…", "weak": "…",
      "first": false,           // 最初の姿（3D の車）。box-van（窓口つきの箱バン）だけ true
      "src": ["https://…"] }
  ],
  "buy_or_rent": [ { "id": "buy", "name": "買う", "price": "…", "good": "…", "weak": "…", "src": ["https://…"] } ],  // buy と rent のちょうど2

  "money": {                    // 1日の収益のシミュレーション。**1日まで**（ひと月・車の分割・保険・泊まる所の欄を持たない）
    "inputs": [                 // つまみ。この id でこの順: price sold cost fee-fixed fee-share gas-kg drive-km（7つとも min max step を持つ）
      { "id": "drive-km", "min": 0, "max": 300, "step": 10, "default": 50, "src": [], "est": ["default"] }
      // 最初の値（default）を書くのは drive-km だけ。ほかは sim の1匹から焼く道具が組む（2つのシミュレーションを同じ1匹から始める）:
      // price ← sim.price／sold と cost ← sim の結果／出店料の形と値 ← sim.place の fee／gas-kg ← foods の gas_kg_h × places の hours。
      // 刻み（step）は、組んだ値が刻みの上に乗る細かさにする（売る数 1・材料 0.01・定額 1）。焼く道具は組んだ値を刻みに丸め、
      // メニュー開発にも同じ丸めた値を渡す（2つの最初の結果が同じになることを焼く道具が確かめる）
    ],
    "fixed": {                  // つまみにしない値。この鍵でこの順
      "lpg_eur_kg": { "value": 0, "src": ["https://…"] },
      "diesel_eur_l": { "value": 2.05, "src": ["https://…"] },
      "l_per_100km": { "value": 10, "src": ["https://…"] },
      "power_eur_kwh": { "value": 0.34, "src": ["https://…"] },   // 電気の1kWh。電気の食べ物は elec_kw × 売る時間 × これ
      "vat_pct": { "value": 7, "src": ["https://…"], "est": ["value"] }  // 付加価値税の %。売上と利益は税込の値段 ÷ (1＋vat_pct/100) から数える
    }
  },

  "issues": {
    "as_of": "2026-11-23",
    "work": { "text": "ヨーロッパは国ごとに、外国人が働いてよいかの決まりが違う。いくつか道を調べ、2026年11月、そのうち1本に手応えが出た" },
    // ↑ 特大課題1。**この字のまま。足さない・削らない・言い換えない・出どころを付けない**（道具が字の一致を見る）
    "permit": {                 // 特大課題2: 食べ物を売る許可
      "plan": { "text": "あやとの考えは、1つめの国で売りながら、次の国の許可を取りに行くこと", "date": "2026-11-23" },
      // ↑ 案内鳥の地の文。この字のまま（あやとの話をまとめた字で、本人の字そのものではないので「」で引かない）
      "layers": [               // ちょうど4。before（その手前）food（食品の登録）place（売る場所の許可）gear（設備の検査）の順
        { "id": "before", "title": "…", "text": "…", "weight": "heaviest", "src": ["https://…"] }
        // weight: light | mid | heavy | heaviest（面は「軽い・中・重い・いちばん重い」と出す）
      ],
      "compare": [              // 日本の保健所の許可と並べた図。ちょうど5行: food place gear person cross
        { "id": "food", "label": "食べ物", "japan": "…", "europe": "…", "src": ["https://…"] }
      ]
    },
    "life": [                   // 暮らしの課題。ちょうど46。n は 1〜46 を抜けなく
      { "n": 1, "id": "toilet-dump", "group": "トイレ", "title": "…", "plan": "…", "stars": 2 }
      // group: トイレ 水 電気 ガス 寝床 車 免許 道 暮らし 店 のどれか。plan は「2026年11月23日時点の考え」。stars は難しさ 1〜5
      // 事実を言う行は src を持つ（考えだけの行は無くてよい）
    ]
  },

  "shorts": { "titles": ["…"] },  // ちょうど30。並びが番号（1〜30）。「あと◯日」・残りの日数・開かないマスを書かない

  "notes": [                    // お題6つ。この id でこの順（id は付箋の宛先になる。変えない）
    { "id": "kitchen-car-menu", "name": "メニューの案", "lead": "…", "placeholder": "…" }
    // kitchen-car-views 見てみたい町と景色／kitchen-car-tips 暮らしの知恵（トイレ・水・電気・寝床）／kitchen-car-thoughts この旅に思うこと／
    // kitchen-car-name キッチンカーの名前（lead は「選んだ名前を車と看板に描く」で始める）／kitchen-car-shorts ショートの案
  ],

  "progress": [                 // ここまでの進み具合。ちょうど6。古い順
    { "date": "2025-03-22", "title": "…", "body": "…", "said": { "videoId": "_Crl6Z-HlBA", "at": "2:17:00" } }
    // 2025-03-22 リエージュのワッフル／2025-09-05 キャンピングカーでカフェ（視聴者さんの案）／2026-11-08 山の出店の行列／
    // 2026-11-09 名前が付く（said なし）／2026-11-21 たい焼きへ／2026-11-23 このページ（said なし）。日付と時刻は字幕で確かめる
  ],
  "log": [                      // 判断ログ。5〜20。新しい順。企画で決めたこと（売るもの・開始の目標・車・機材・名前の決め方など）だけ。
    { "date": "2026-11-23", "what": "…", "why": "…", "by": "ayato" }   // by: ayato | guide（面は「あやと」「あやと島案内鳥」）
    // 面の作りかたの決まり（実現度を出さない・1日まで・数字は目安 など）は書かない。それは #1418 と ADR に在る（画面で仕組みを説明しない）
  ],
  "facts": [                    // 確かめた事実。10〜60
    { "id": "eu-852-register", "group": "permit", "text": "…", "src": ["https://…"], "seen": "2026-11-23" }
    // group: permit（売る許可）japan（日本の許可）vehicle（車と免許）gear（機材）market（場所と値段）life（暮らし）
  ]
}
```

### 本人の言葉（`said` と `cover.quotes`）

- 形は `{ "text"?, "date", "videoId"?, "at"? }`。`videoId` と `at`（`H:MM:SS`、字幕の30秒の枠の頭）は**両方そろえるか、両方持たない**
- 焼くと `{ text, date, v, t, cite }` になり、面は「2026年11月21日の配信 4:01:00」から、その秒の配信を開く。場面を持たない引用は日付だけを出す
- `cover.quotes`・`views[].said`・`progress[].said` は場面のリンクを持たなくてよい（日付だけで引く）。`menu.decided` と `vehicles[].said` は持つ
- **引く時刻は、点検の担当が運営の非公開の資料と突き合わせてから面に出す**（照らす範囲はここにも道具にも書かない）
- 本人の言葉の枠（「」）で引くのは、字幕か本人が書いた字のままのものだけ。運営がまとめた字は、案内鳥の地の文（`route.plan`・`issues.permit.plan`）に置く

## 数と決まり（`python/legend_kitchen_check.py` が数える）

| 欄 | 数 | 決まり |
| --- | --- | --- |
| `meta.title` / `meta.description` | 25〜45字 / 80〜160字 | `meta.h1`・`meta.goal`・`cover.note`・`issues.work.text`・`route.plan.text`・`issues.permit.plan.text` は上の字と1字も違わない |
| `cover.quotes` | 2 | id は world-first・dream |
| `route.line` / `route.labels` / `route.countries` | 2〜40 / 3 / 0〜20 | 座標は小数6桁まで。line と labels に日付・季節・長さの欄を持たない |
| `views` | 5 | id と並びは上のとおり |
| `menu.picks` / `menu.why` / `menu.ideas` | 5 / 4〜7 / 5〜20 | ideas の from は ayato か viewer |
| `foods` / `fillings` / `places` | 5 / 10〜30 / 3〜5 | 幅は `[小, 大]`（小 ≦ 大）。数は src か est を持つ。fillings の foods・sprite・`sim` の鍵は在るものを指す。energy の gas_kg_h と elec_kw は、電気ならガスが 0・ガスなら電気が 0 |
| `sim.say` | 7 | 鍵は bake crowd loss thin pricey unknown good |
| `looks` / `vehicles` / `buy_or_rent` | 4〜8 / 4 / 2 | looks の先頭4組は上の id と名前。vehicles の first は box-van だけ |
| `money.inputs` / `money.fixed` | 7 / 5 | inputs の鍵は price sold cost fee-fixed fee-share gas-kg drive-km。min ≦ default ≦ max。default を持つのは drive-km だけ。fixed の鍵は lpg_eur_kg diesel_eur_l l_per_100km power_eur_kwh vat_pct |
| `issues.permit.layers` / `compare` / `life` | 4 / 5 / 46 | life の n は 1〜46、stars は 1〜5、group は上の10のどれか |
| `shorts.titles` / `notes` / `progress` / `log` / `facts` | 30 / 6 / 6 / 5〜20 / 10〜60 | notes の id は上の6つ。kitchen-car-name の lead は「選んだ名前を車と看板に描く」で始まる |

- `src` は https の URL。同じ URL を2回書かない。出どころの名前は焼く道具が URL から読む（作らない）
- `id` は英小文字とハイフン（`^[a-z0-9]+(-[a-z0-9]+)*$`）。同じ配列の中で一意
- 確かめの道具には、**禁じる語の表を持たせない**。持つのは、上の数・鍵・言い切りの字の一致だけ

## 字の決まり

- `docs/guide-copy.md` の6章（外しがちな形の12項目）と7章（出す前の当て 1〜7）を、面に出る字の全部に当てる。当てた表は
  `python/data/legends/nomad-kitchen-car/copy_check.md` に置く（インドと同じ）。表の「型」「手本」は、当てた字に本当に合うものだけ書き、
  地の文と表の字は「地の文」にとどめる。0件と書くときは、何を何行見たかを添える
- 作った呼び名を付けない。節と遊びの名前は、あやとの言葉（メニュー開発・着せ替え・収益構造・課題一覧・判断ログ）と上の表の字だけ。
  物や場所の呼び方は日本の旅行者が使う字（クリスマスマーケット・CEマーク。こちらで訳した字にしない。`docs/guide-design.md` ★7）
- 一行の字（`meta.sub`・`views[].lead`・`menu.why[].text`・`looks[].lead`・`looks[].interior.lead`・`sim.say`）は読点で割らない。“”『』「」で強めない。
  同じ止めかたを3つ続けない（6章の7）
- 一行の外の字（車の良いところ・弱いところ、課題の考えなど）も、1行に中身を2つ詰めない。2つあるなら「。」で切る（guide-copy 1章）
- 日付つきの過去形で書く。「いま」「〜中」「最新」を書かない（`docs/island-standards.md` 16章）。「あと◯日」を書かない
- 画面で仕組みや式を説明しない（同 6章）。前提は出どころの行と、確かめた事実の畳みへ
- 数字は全部「目安」。面は数字のそばに出どころを畳んで添える。仮の数を事実の言い方で書かない
- 視聴者さんに見せる字で、書き手は「あやと島案内鳥」（同 17章）。視聴者さんの素性を書かない（`docs/README.md` D-9）
- 調べものの言い回し（キャッチ・「一言でいうと」）を写さない。材料に取るのは事実と出どころだけ
- 公開してよい線は #1418 本文3章と、運営の非公開の資料。材料担当と点検の担当は依頼文で受け取る

## art_order.json の形

```jsonc
{
  "style": "…",               // 紙面の絵（表紙・地図・景色・車の候補）を同じ画集の調子にする頼み。字を描かせない・布を敷かない・顔の分かる人を描かない
  "cover": { "draw": "…" },   // 南欧の海辺の町に、窓口つきの箱バンが停まっている。ヨーロッパの海だと分かること。看板に字なし。題は finalize が焼く
  "map": { "draw": "…", "bbox": { "west": 0, "east": 0, "south": 0, "north": 0 } },
                              // 線だけの絵地図。海岸線は下敷きどおり。線（book.json の route.line）と3つの地名は finalize が緯度経度から焼く
  "views":    [ { "id": "<views の id>", "title": "湖のある町", "draw": "何を描くか1行" } ],                 // 5
  "foods":    [ { "id": "<foods の id>", "title": "たい焼き", "draw": "…", "ref": "<写真の URL>" } ],         // 5。街のガイドの料理と同じ卓と光
  "vehicles": [ { "id": "<vehicles の id>", "title": "小さい車", "draw": "…" } ],                           // 4。斜め横から・看板に字なし
  "looks":    [ { "id": "<looks の id>", "title": "北欧風",
                  "exterior": { "mode": "tile", "draw": "…" },   // mode: tile（継ぎ目の無い柄＋帯を型に貼り込む）| panel（側面を1枚の絵で）
                  "interior": { "draw": "…" }, "ref": ["https://…"] } ]                                 // 4。遠近なし・字なし
}
```

- `ref` に付箋に貼られた絵を使わない（外装は、あやとが渡した絵と運営が描いた絵だけ）。看板・車体・メニュー板に字を入れない
  （キッチンカーの名前は付箋で集めて、あやとが選ぶまで入れない）
- 外装と内装は3Dに貼る絵なので島の絵の調子（輪郭線なし・平ら・遠近なし）。区画の大きさは 3D 担当の型の絵に合わせる

## photos.json の形（本物のキッチンカーの写真）

```jsonc
[ { "id": "lisbon-market", "img": "https://upload.wikimedia.org/…/960px-…", "thumb": "https://upload.wikimedia.org/…/500px-…",
    "page": "https://commons.wikimedia.org/wiki/File:…", "by": "撮った人", "lic": "CC BY-SA 4.0",
    "alt": "…", "w": 960, "h": 640, "checked": "YYYY-MM-DD" } ]   // 4〜8
```

- 候補は Actions の `commons_photos.yml` で集める（許諾は道具が public domain・CC0・CC BY・CC BY-SA に絞る）
- 選ぶのは、**人の顔・店の名前・ロゴが分からないもの**だけ（車体や扉の字が店の名前・所在地・連絡先として読めるものも外す）。
  `checked` は運営が絵を目で見た日。面に添えるのは撮った人と許諾だけ
- 置き場に写さない（縮尺つきの URL を指す。幅は 500・960）

## 絵の置き場（`site/public/legends/nomad-kitchen-car/`）

| ファイル | 何 |
| --- | --- |
| `cover.webp`（題を焼いた）・`cover-base.webp`（字なし）・`cover-1200x630.jpg` | 表紙。貼られたときの絵（1200x630）は字の無い版から切る。構造化データの絵は表紙の1枚（`cover.webp`。インドの面の `BookLd` と同じ。16:9・4:3・1:1 に切った版は作らない） |
| `map.webp`・`map-base.webp` | ルートの絵地図（線と地名を焼いた版／焼く前） |
| `views/<id>.webp`・`foods/<id>.webp`・`vehicles/<id>.webp` | 景色・食べ物・車の候補（小さい版は `-small.webp`） |
| `manifest.json` | 上の紙面の絵の `src`・`src_small`・`w`・`h`・`alt` と、描いた頼みの `v`・`prompt_sha`。**書くのは `legend_art.py` の finalize だけ** |
| `skins/<id>.webp`・`skins/<id>-1024.webp` | 外装の型（3D に貼る1枚） |
| `interiors/<id>.webp` | 内装の型 |
| `skins.json` | 外装と内装の `src`・`w`・`h`・`alt` と外装の色（`<id>.colors`: `body` `accent` `awning`）。**書くのは `tools/van3d/skin_pack.py` だけ** |
| `stills/<looks の id>-<day｜open｜dusk｜peek>.webp` | 3D の静止画（Actions で撮る。WebGL の無い人と、3D を読む前の姿）。名前と大きさ（800×600）が決まっているので一覧のファイルを持たない |

manifest.json の形はインド（`site/content/legends/drawn.ts` の頭）と同じ: `{ "cover": { "src", "w", "h", "alt" }, "map": {…}, "<組>": { "<id>": { "src", "src_small", "w", "h", "alt" } } }`。
インドの finalize は manifest.json を毎回知っている鍵だけで書き直すので、外装・内装・静止画の鍵をここに足さない（足すと消える。1つのファイルに書く人は1人）。
ファイルが無い絵は面に出さない（壊れた枠を出さない）。

## お題（付箋）を出す日

- 下書きのあいだ、`notes` は面に出ない（お題の行が `site/content/themes.ts` に無いため。M-33）
- あやとの「繋いでいい」で印を外す日に、面担当が `notes` の6行を `themes.ts` へ移す（`group: PLAN_GROUP`・`project: "nomad-kitchen-car"`）。
  移したら `book.json` の `notes` は `id` だけを残す（字を2か所に持たない）。id は Firestore に入るので、移したあとは変えない・消さない
- メニュー開発のシミュレーションの「付箋に貼る」は、`kitchen-car-menu` の行が在るときだけ出る
