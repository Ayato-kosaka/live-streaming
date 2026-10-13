# カレンダーの住人を、その月の投げ銭ランキングで入れ替える

卓上カレンダー（#786）の絵には、**その月の投げ銭ランキング上位7人**（同額の7位は全員）を、
小さな人形の姿でひっそり描いている。その数え方・見本の作り方・頼みの文を置く場所。
全体の手順は `docs/goods-calendar.md`。

## 1. 上位7人を数える — `rank.sql`

`python/admin/monthly_tips_run.py` と**同じ数え方**（貢献額 = スパチャ ÷ 2 + Doneru、図鑑で名寄せ。
`docs/island-money.md`）を、BigQuery の中で1本に写したもの。月は JST の暦月。

- 図鑑は Firestore の毎晩の退避 `island_backup.firestore_docs` の最新世代を読む
  （図鑑は asia-northeast1、`youtube_chat` は US なので、1本に繋げるときは
  スパチャ・Doneru も `island_backup.chat_messages` / `island_backup.doneru_donations` に差し替える）
- 数える月は先頭の `periods` で変える
- **結果の額は公開の場（issue・Actions のログ）に出さない。** 順位と呼び名だけ

## 2. 住人の見本を作る — `sheet.py`

上位の図鑑ID の順に、背景なしの絵を番号つきで並べる。**名前は入れない**（ChatGPT に視聴者さんの名前を渡さない）。

## 3. ChatGPT で住人だけ入れ替える — `swap-prompt.txt`

`/chatgpt-image` で、**いま出している元絵（`tools/goods/cal-src/<MM>-a.png`）と見本の2枚**を添付して頼む。
`swap-prompt.txt` は 10月の文。景色・あやと・旗などは残し、住人だけ全員入れ替える。

上がってきたら元の絵と並べて、景色が変わっていないこと・住人が全員1回ずつ入っていること・元の住人が残っていないことを見る。
通ったら `tools/goods/cal-src/<MM>-a.png` を置き換えて `python3 tools/goods/calbake.py`（右下の一言は焼くときに重なる）。
