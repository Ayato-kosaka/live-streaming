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
