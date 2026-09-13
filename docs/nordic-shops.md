# 街のお土産と雑貨（どこから来て、どう焼き直すか）

## なぜあるか

2026-09-13、あやとはビャウィストクに着いて、こう言った。

> ビャウィストク Białystok つきました。
> **お土産とか雑貨とか行きたかったけど、あやと島みても見つからず行けなかった**、、、
> 以前お願いなかったっけ？ わかる？伝わる？**可愛い雑貨が見れたり、その土地のお土産が探せたり。**

頼まれていた。9/6 の企画会議で @まこも-z3i さんが言っている
（`docs/island-meeting-nordic.md`）。

> 21:23「ポ−ランドに行ったらアウシュビッツは行きたいな! **あとは雑貨とか家具もみたい**」

**掲示板の付箋に書き留めただけで、現地で使える形にしていなかった。**
島は「集めた意見を置くところ」であって「旅先で開く道具」になっていなかった、
というのがこの1件の中身。

## どこに出ているか

| 面 | 何が出るか |
| --- | --- |
| `/nordic/day/<n>` | **その日に着く街**のお店。面の頭に近道の札を1つ置いてある |
| `/nordic/<国>` | その国で降りる街ぜんぶのお店（街ごとに1枚） |

部品は `site/components/nordic/Shops.tsx`（サーバ）と
`ShopRows.tsx`（ブラウザ側。畳みと「いま開いてるか」だけ）。

**1行まるごとが押しどころで、押すと地図アプリが開く。**
行き先は Google マップの `?api=1&query=<緯度>,<経度>`。
入っていればアプリが開き、入っていなければブラウザの地図が開く（iPhone / Android とも）。
`geo:` は使わない。Android では開くが、iPhone の Safari は知らない綴りとして落とす。

**名前で検索させず、座標で開く。** 名前で投げると同じ名前の別の支店に飛ぶ。

## 出典（ODbL）

データは **OpenStreetMap**。**表示義務があるので、画面の1行を消さない。**

- 画面: お店の区画のいちばん下に「地図とお店 — OpenStreetMap」（`.nshop-osm`）
- 焼いた JSON: `site/content/nordic/shops.json` の `credit` / `license`

© OpenStreetMap contributors — https://www.openstreetmap.org/copyright

同じ断りが街地図（`tools/nordic/citymap.py`）のぶんも兼ねている。
同じ面の同じデータ元なので、1行で受け持つ。

## 焼き直しかた

```bash
python3 tools/nordic/shops.py              # キャッシュがあれば使う（向こうへ投げない）
python3 tools/nordic/shops.py ヴィリニュス     # 街を1つだけ
python3 tools/nordic/shops.py --force      # 落とし直す
```

- **焼く街は旅程から出す**（`geocode.visit_cities()`）。街の名簿を手で作らない
- 落とした生データは `tools/nordic/.osmcache/shops-<街>.json`（リポジトリには入れない）。
  **選び方を変えるたびに向こうへ投げ直さない**ように、落とすのは広く
  （`shop=*` と `craft=*` と市場の全部）、絞るのはこちら側でやる
- **同じものを2度流しても同じ結果になる。** 日付を1つも焼いていない

## 相手は公共の無料サーバ

Overpass の控えを6つ、上から順に1回ずつ試す。**連打しない。**
混んでいるときは状態コード 200 のまま HTML（`Dispatcher_Client::…::timeout`）が
返るので、**中身が JSON かどうか**で見ている。

2026-09-13 に叩いた結果:

| 控え | その日 |
| --- | --- |
| `overpass.openstreetmap.fr` | 2.0秒で返った（8街ぜんぶここが返した） |
| `overpass.private.coffee` | 120秒まるごと黙ってから切れた |
| `overpass.osm.ch` / `maps.mail.ru` | 生きていた |
| `overpass.kumi.systems` | 50秒返らない |
| `overpass-api.de` | too busy |

**どれが生きているかは日で入れ替わる。** 順は目安でしかない。

## 0軒と「読めなかった」を分けている

Overpass は混むと空を返す。0軒と失敗を同じ扱いにすると、あやとは
「この街には無い」と思って探しに行かない（`docs/island-misses.md` #79）。

- 焼くほう: 街ごとに `ok` を持つ。**読めなかった街は、前に読めた表を消さない**
- 画面: `ok: false` は「まだ調べられていない」、`ok: true` で 0軒は
  「地図にまだ1軒も載っていない」。**別の字にする**

## どの `shop=` を拾っているか

**実際に返ってきた中身を1件ずつ読んでから決めた**（`docs/island-misses.md` #78）。
ビャウィストクの 1,111件を全部目で見た結果が下。表そのものは
`tools/nordic/shops.py` の頭にあり、増やすときは**必ずキャッシュを読み直して
名前を見てから**足す。

| 区画 | 拾うもの | 拾った例 |
| --- | --- | --- |
| おみやげと工芸 | `gift` `souvenir` `art` `antiques` `pottery` `musical_instrument`、手仕事の `craft=*` | Cepelia、Amatų Namai、Antyki、Pył-Ceramic studio |
| 雑貨とインテリア | `variety_store` `interior_decoration` `houseware` `kitchen` `craft`(shop) `fabric` `bag` | home&you、à Tab、Homla、Lino Namai |
| 食べておみやげ | `honey` `confectionery` `chocolate` `deli` `cheese` `farm` `spices` `tea` | Podlaska Pasieka、Krakowski Kredens、Rūta |
| 市場 | `amenity=marketplace` | Halės turgus、Bazarek "Piaski" |
| （琥珀だけ） | `jewelry` のうち名前に琥珀の語があるもの | Ambermuse、An-Mira's Amber |

落としているもの:

| 落とす | 理由 |
| --- | --- |
| `clothes`（ビャウィストクだけで 100軒） | H&M・Cropp・Mohito。チェーンの服屋 |
| `books` | Empik・Dom Książki。本屋であって雑貨ではない |
| `alcohol` | 酒販店 |
| `stationery` `toys` `candles` `second_hand` `charity` | チェーンか、土地と関係がないもの |
| `jewelry` の残り | Apart・W.KRUK。金のチェーン店 |
| 卸と印刷 | `hurtownia tkanin`（生地の卸）、`Fototapety`（壁紙の印刷）。旅の人が入る店ではない |

**数が多いことは良いことではない。** 「◯軒取れた」は測定であって、
それが「可愛い雑貨」かどうかは中身を見ないと分からない。

種類ごとに**中心から近い順に20軒まで**。ストックホルムは 368軒、
ワルシャワは 262軒あって、全部載せると一覧ではなく名簿になる。
1日で歩けるのはせいぜい数軒で、その数軒は必ず中心の近くにある
（ストックホルムの上位20軒はぜんぶ旧市街の 0.6km 以内）。

## 何軒あったか（2026-09-13 に焼いたもの）

| 街 | 落とした件数 | 条件に合った | 焼いた |
| --- | ---: | ---: | ---: |
| カトヴィツェ | 1,931 | 98 | 63 |
| ワルシャワ | 3,580 | 262 | 63 |
| ビャウィストク | 999 | 34 | **34**（20に届かないので全部） |
| ヴィリニュス | 960 | 83 | 66 |
| リガ | 1,999 | 186 | 72 |
| タリン | 1,329 | 166 | 66 |
| ヘルシンキ | 2,363 | 235 | 68 |
| ストックホルム | 2,933 | 368 | 64 |
| 合計 | 16,094 | 1,432 | **496** |

**読めなかった街は無い。** 8街とも `overpass.openstreetmap.fr` が返した。

寄るか決まっていない街（トラカイ・シャウレイ・ルンダーレ・パルヌ）は焼いていない。
船の中・飛行機の中は街ではないので出てこない。

## 営業時間は、書いてあるものだけ

`site/components/nordic/hours.ts` が `opening_hours` を読む。

- 読めたら日本語にする（`Mo-Fr 10:00-18:00; Sa 10:00-14:00`
  → `月〜金 10:00-18:00 / 土 10:00-14:00 / 日 休み`）
- **読めない書き方（第2日曜・月指定・`10:00+`）は、書いてある字のまま出す**
- **書いていない店は「時間はわからない」。** 埋めない。
  嘘の時間は、閉まっている店まで歩かせることになる

本番の 312件のうち 292件（94%）が読めている。

「いま開いてる／いまは閉まってる」の札は**画面が出てから**、その街の時計
（`Intl` の `Europe/Vilnius` など）で数える。静的書き出しなので、ビルド時に
焼くと翌日には嘘になる。**その日が「今日」でない面では、開閉を言わない。**

## ついでに直したもの

`tools/nordic/geocode.py` の `visit_cities()` が、視聴者さんの提案
（`nordic.ts` の `WANTS`）に付いている `city: "シャウレイ"` を**行く街として
拾っていた。** シャウレイは寄るか決まっていない街で、そこの地図を焼いて
一度叱られている（`docs/island-misses.md` #4）。旅程より下は見ないようにした。
`citymap.py` も同じ関数を使っているので、あちらも一緒に直っている。
