# 画面を撮って確かめる道具

Playwright はこのフォルダの `node_modules` にある（リポジトリ直下には無い）。
**必ずこのフォルダから実行すること。**

## 並列で作業するとき

複数人（複数エージェント）が同時に開発サーバーを立てると、ポートを奪い合って
「スマホ幅なのにPC表示になる」といった、見えづらい壊れ方をする。
**担当ごとに別のポートを使うこと。**

```bash
# 開発サーバー（担当ごとに違う番号にする）
cd /home/user/live-streaming/site
PORT=3011 npx next dev -p 3011

# 撮る側にも同じ番号を渡す
cd ../tools/sprites
PORT=3011 node island.mjs
PORT=3011 node page.mjs /nordic /tmp/shots/x.png 390 1200 0
```

`pkill -f "next dev"` は**使わないこと**。他の人のサーバーまで落ちる。
自分のポートだけ落とすなら:

```bash
pkill -f "next dev -p 3011"
```

## 何を撮る道具か

| ファイル | 何をする |
| --- | --- |
| `page.mjs <パス> <出力> [幅] [高さ] [スクロール]` | 好きなページを1枚 |
| `island.mjs` | 島の寄り・引きと fps |
| `talk.mjs` | 住人に話しかける流れ |
| `nmap.mjs` | 北欧のルート地図だけ |
| `align.mjs` | 建物の絵と当たり判定のズレ。ズレていたら終了コード1 |
| `crawl.mjs` | 書き出した全ページの h1・JSエラー・横あふれ・リンク切れ |
| `noemoji.mjs` | 書き出したHTMLに絵文字が残っていないか |
| `acref.py` | どうぶつの森の公式スクショを `/tmp/acref` に落とす |
| `mefootpage.mjs <ポート>` | `/me` の一覧の**足元**だけの見本を組む（ログインが要る面を静的に見るため） |
| `mefoot.mjs` | その見本を 360 / 390 で撮って、足元の高さ・中黒・横あふれ・押しどころを測る |
| `mefield.mjs` | 同じ見本の**書く欄**を1つずつ。字・地・枠・押しどころの高さ・横あふれ |

`crawl.mjs` と `noemoji.mjs` は開発サーバーではなく**書き出したもの**を見る。

```bash
cd /home/user/live-streaming/site
NEXT_DIST_DIR=.next-verify npx next build
(nohup python3 -m http.server 4331 --directory .next-verify > /dev/null 2>&1 &)
cd ../tools/sprites && SPORT=4331 node crawl.mjs
```

## ログインが要る面（`/me` `/me/desk`）の足元を見る

`/me` は入っている人にしか中身が出ないので、本番をそのまま開けない。
**書き出した `me.html` の器をそのまま使い**、中の紙だけを部品の JSX から写した
markup に差し替えて撮る。頭の `<link rel=stylesheet>` は触らないので、
**本番と同じ CSS が同じ順で当たる。**

```bash
tools/build.sh 3200
node tools/sprites/mefootpage.mjs 3200
(nohup python3 -m http.server 4200 --directory site/.next-3200 > /dev/null 2>&1 &)
TAG=after node tools/sprites/mefoot.mjs        # /tmp/mefoot/after/
```

欄（`<input>` `<select>` `<textarea>`）が島の見た目から外れていないかは `mefield.mjs`。
**素の欄は白い箱とシステムの字で出る**ので、そこを機械で捕まえる。

```bash
SPORT=4200 TAG=after node tools/sprites/mefield.mjs   # /tmp/mefield/after/
python3 tools/sprites/inkpx.py after _mefield          # 欄の中の字の濃さ
```

`inkpx.mjs` は文字ノードを辿るので、**閉じた `<select>` の中身と placeholder を
測れない**（箱が 0x0、そもそも文字ノードでない）。`mefield.mjs` が欄そのものを
1箱として撮って `inkpx.py` に渡す。

`CHIP=1 node tools/sprites/mefootpage.mjs 3200` で足元に `.chip` を混ぜて組める。
**足元は札を入れない場所**なので、混ぜても同じ絵になるのが正しい
（`site/app/me/me.css` の `.mp-note-foot > span.chip`）。混ぜた絵と混ぜない絵を
画素で比べて、1画素でも違えば決めごとが効いていない。

字の濃さは `inkpx.mjs` にそのまま渡せる。

```bash
PORT=4200 PAGES=/mefoot.html TAG=mefoot360 W=360 DPR=3 node tools/sprites/inkpx.mjs
python3 tools/sprites/inkpx.py mefoot360 _mefoot
```

## スプライトを焼く

```bash
cd tools/sprites
(nohup python3 -m http.server 8904 > /dev/null 2>&1 &)
node bake.mjs && python3 meta.py
```

## 配信で使う3面（`/roulette` `/me/remote` `/me/roulette`）を数える

`/roulette` は**ログインが要らない**（表示側は session を読むだけ）。見本を
組まずに素で開ける。`liveraw.mjs` でまずそれを確かめる。

```bash
tools/build.sh 3500
(nohup python3 -m http.server 4500 --directory site/.next-3500 > /dev/null 2>&1 &)
SPORT=4500 node tools/sprites/liveraw.mjs    # 素で開けるか（差し込み無し）
SPORT=4500 node tools/sprites/livecheck.mjs  # 素の欄・48px・横あふれ・動くものの外接矩形
SPORT=4500 TAG=live node tools/sprites/liveink.mjs
python3 tools/sprites/inkpx.py live rl-cand-1920
SPORT=4500 node tools/sprites/livecpu.mjs    # 結果の札の回る光を A/B（交互に3回）
```

| ファイル | 何をする |
| --- | --- |
| `liveseed.mjs` | `asme.mjs` に**島の遠隔操作（`/island-api/remote`）だけ**を足す差し込み口。あちらが返さないと `/me/remote` が灰色の骨のまま出る |
| `liveraw.mjs` | `/roulette` を**差し込み無し**で3通り開く |
| `livecheck.mjs` | 8場面 × 幅ぶん撮って数える。**測る前に素の欄4つ・台の外の `.nph-post-row`・20x20 の押しどころを仕込んで、検出が拾うかを毎回出す**（`docs/island-misses.md` #19） |
| `liveink.mjs` | 字の濃さの2枚組。**欄の中（placeholder と閉じた `<select>`）も測る**（`inkpx.mjs` は文字ノードを辿るので測れない）。動くものは**その場で**止める（頭に巻き戻すと、終わった結果の札が 0.28倍で輪に重なる） |
| `livecpu.mjs` | 結果の札の後ろで回る光の代金。A と B を交互に3回 |

出るもの: `/tmp/live/<場面>/w<幅>.png`・`/tmp/live/report.json`・`/tmp/ink/live/*`

**素の `<button>` は、この島では既定の顔にならない**（`app/css/tokens.css` 564行が
全ボタンから地・枠・字を落としている）。「ブラウザ既定のボタン」を探しても
原理的に0件なので、代わりに**「reset のまま板になっていない」**（地も枠も厚みも
無い）を数えること。

## じぶんのことと机（`/me` `/me/desk`）を、道具9つ ×4つの状態で見る

机は**札を押した道具しか作られない**ので、押さずに撮ると9つのうち1つしか見ていない。
`mesweep.mjs` が札を1つずつ押して、0件・待ち・落ちたも含めて撮る。

```bash
tools/build.sh 3600
(nohup python3 -m http.server 4600 --directory site/.next-3600 > /dev/null 2>&1 &)
SPORT=4600 node tools/sprites/mesweep.mjs                  # うまくいった日
for m in empty down wait; do SPORT=4600 MEMODE=$m node tools/sprites/mesweep.mjs; done
OPENALL=1 SPORT=4600 node tools/sprites/mesweep.mjs        # 畳みを全部開けて、もう一度
python3 tools/sprites/mestates.py                          # 4つを横に並べて1枚に
SPORT=4600 node tools/sprites/meink.mjs                    # 字の濃さ（欄の中も）
python3 tools/sprites/inkpx.py meink _desk-plan
SPORT=4600 node tools/sprites/mefaces.mjs                  # 書く欄の顔が何種類あるか
```

| ファイル | 何をする |
| --- | --- |
| `meseed.mjs` | `asme.mjs` を包んで、一覧の口を **0件 / 返らない / 500** に差し替える。`/me` だけはどの状態でも返す（落とすと机ごと1枚に化けて、道具の中が撮れない）。`/alertbox/session` は POST だが「読みに行っている口」なので落とす側に入れる |
| `mesweep.mjs` | 13場面 × 360/390 を撮って、素の欄・OS が描く印と矢印・48px・横あふれを数える。**測るたびに素の部品4つと `.dform` の外の `.nph-post-row` 1つを仕込んで、挙がったかを毎回出す**（`docs/island-misses.md` #19） |
| `meink.mjs` | 字の濃さの2枚組。**欄の中（placeholder と閉じた `<select>`）も別に撮る** |
| `mefaces.mjs` | 書く欄の顔（地・枠・角・彫り・字）を数え上げて、何種類に割れているかを出す |
| `mestates.py` | `mesweep` の4状態を横に並べて1枚にする。**0件と落ちたは、並べないと見分けられない** |

出るもの: `/tmp/mesweep/{ok,empty,down,wait,ok-open}/`・`/tmp/mesweep/states/`・`/tmp/ink/meink/`

**比べる相手は「規則の当たらないところに置いた素の部品」にする。** 同じ親に置くと
`.dform input` が子孫に当たって素の部品にも効き、**正しい欄27件が全部「否」**と出る。
