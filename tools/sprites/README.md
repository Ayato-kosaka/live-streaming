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

`crawl.mjs` と `noemoji.mjs` は開発サーバーではなく**書き出したもの**を見る。

```bash
cd /home/user/live-streaming/site
NEXT_DIST_DIR=.next-verify npx next build
(nohup python3 -m http.server 4331 --directory .next-verify > /dev/null 2>&1 &)
cd ../tools/sprites && SPORT=4331 node crawl.mjs
```

## スプライトを焼く

```bash
cd tools/sprites
(nohup python3 -m http.server 8904 > /dev/null 2>&1 &)
node bake.mjs && python3 meta.py
```
