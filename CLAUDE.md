# このリポジトリの進め方（Claude Code 向け）

## 立ち位置

**Claude Code をプロジェクトリーダーとして扱う。**
あやと（オーナー）から都度の承認を取らずに、次のことをやってよい。

- ブランチを切って実装し、コミットする
- PR を作って、自分でマージする
- master にマージしたあと、本番へデプロイする
- 作業の粒度・順番・設計の判断をする

聞かずに進めてよいが、**やったことは必ず報告する**。
壊れうる変更（既存の配信用ページ、Firestore のルール、GitHub Actions の秘密情報まわり）は、
やる前に一言添えてから進める。

## デプロイの手順

master にマージしたら、**両方**を `workflow_dispatch` で走らせる。

| 何を変えたか | 走らせるワークフロー |
| --- | --- |
| `site/` `public/` `app/`（画面） | `Firebase Hosting Deploy`（`firebase-hosting-deploy-prod.yml`） |
| `functions/`（API） | `Deploy Firebase Functions`（`firebase-functions-deploy.yml`） |

どちらも `push` トリガーは効いていない（Hosting はコメントアウト、Functions は `main` を
見ているがこのリポジトリの既定ブランチは `master`）。**手で起動する必要がある。**

Hosting は `npm run build:web` を通る。Expo の web ビルド → `dist/` に public をコピー →
`site`（Next.js）をビルドして `site/out/` を `dist/` に重ねる、という順。
つまり **あやと島は `dist/` の一部として配信される**。

## ドキュメントと issue の使い分け

**`docs/` には、あとから読んで意味のあるものだけ置く。**
仕組みがどうなっているか、なぜそう決めたか、どこを触ればいいか。

次のものは `docs/` に置かない。**GitHub issue を立てる。**

- あやたにやってもらう操作（コンソールの設定、権限付与、鍵の発行）
- 「これから増やすとしたら」のような検討中の案
- 期限や状態を持つもの（やった / やっていない が変わるもの）

issue を立てたら、**終わったら自分で閉じるところまでやる。**
開けっぱなしにしない。誰かの操作待ちで止まっているものは、待っていることが分かるように書く。

## 作業の入口

まず読む:

- [`docs/island-design.md`](docs/island-design.md) — **デザイン仕様。拘束力あり。作る前に必ず読む**
- [`docs/island-concept.md`](docs/island-concept.md) — 何のための島か。作り方の背景
- [`docs/island-db.md`](docs/island-db.md) — BigQuery / Firestore / Git の3層のデータ設計
- [`docs/island-plan-drafts.md`](docs/island-plan-drafts.md) — 企画ページを視聴者さんと作る仕組み

## 検証のしかた

```bash
cd site
npx next dev -p 3000            # 開発サーバー
NEXT_DIST_DIR=.next-verify npx next build   # 確認用ビルド
```

**`NEXT_DIST_DIR` は、ビルドだけでなく開発サーバーにも付ける。**
付けないと `.next` を共有する。並列で何人も動かしていると、開発サーバー同士と
ビルドが同じ `.next` を奪い合って、ハイドレーションが止まったり
（「スマホ幅なのにPCの表示になる」）、`build-manifest.json が無い` で
ビルドが落ちたりする。**1人1つ、ポートと同じ名前を付ける。**

```bash
NEXT_DIST_DIR=.next-dev3130 npx next dev -p 3130
NEXT_DIST_DIR=.next-3130 npx next build
```

`.next` は 600MB を超える。使い終わったら消す。

ページを触ったら、書き出したものを一通り回して確認する:

```bash
cd site && NEXT_DIST_DIR=.next-verify npx next build
python3 -m http.server 4321 --directory .next-verify &
cd ../tools/sprites && node crawl.mjs    # 全ページの h1・JSエラー・横あふれ・リンク切れ
```

Playwright は `tools/sprites/node_modules` にある（リポジトリ直下には無い）。
スクリーンショット系のスクリプトは `tools/sprites/` から実行する。

### このサンドボックスから出られない先

**ブラウザからは** `lh3.googleusercontent.com`（住人のキャラクター画像）と
`upload.wikimedia.org`（北欧の写真）に届かない。本番では出る。

**ただし curl では取れる。** 住人の絵を全員 `ayato.png` に差し替えて撮ると、
島の12人が全員そっくり同じに写って、レビューしても何も分からない。
先に落としてから撮る:

```bash
python3 tools/sprites/avatars.py     # /tmp/avatars/<icon>.png に22人ぶん
```

差し替えは `tools/sprites/route.mjs` の `offline(ctx)` を使う。
落としてあれば**本番と同じ絵を1人ずつ**返し、無ければ `ayato.png` に落ちる。

```js
import { offline } from "./route.mjs";
const ctx = await b.newContext({ ... });
await offline(ctx);
```

## つまずきやすいところ

- **スプライトの色** — テクスチャを持つキットは `Textures/colormap.png` を共有してしまう。
  food-kit は必ず `models/food/` に自分のテクスチャごと置く。
- **Wikimedia のサムネイル** — 2026年から使える幅が決まっている（120 / 250 / 330 / 500 / 960 / 1920）。
  それ以外は 400 で返ってくる。
- **SVG の CSS transform** — 既定の原点は (0,0)。図形の中心で回したいときは
  `transform-box: fill-box; transform-origin: center;` を付ける。
- **静的書き出し** — `output: "export"` なので、ビルド時の日付と数字が焼き込まれる。
  「あと何日」「いちばん近い企画」「配信本数」は画面が出てから計算し直している。同じ轍を踏まない。
- **自動生成ファイルを手で直さない** — `site/content/cityStreams.ts`、
  `site/content/nordic/*.json`、`site/content/sprites.json`。元のスクリプトを直して作り直す。
- **`site/tsconfig.json` の include を畳まない** — Next はビルドのたびに、自分の dist の
  型パスが include に無ければ**書き足す**。並列でビルドを回していると、そこで
  書き換えが衝突してビルドが落ちる（1日に3回踏んだ）。使うポートぶんを先に
  並べてあるので、**そのまま置いておく。** 畳むと次のビルドでまた書き足される。
  （`typescript.tsconfigPath` で逃がす手は使えない。Next はそのファイルを作り直して
  くれないので、本番のビルドが `paths` を失って落ちる。試して戻した）
- **CPU の絞り（`Emulation.setCPUThrottlingRate`）は、それ自体が CPU を食う** —
  `/board` を6秒で、絞りなし 120ms が 4倍絞りで 4,710ms（うちメイン 4,367ms）。
  **どの面にも1フレーム 13ms 前後の下駄がつく。** 「島も北欧も掲示板も 13ms」が
  揃ったら、それは下駄。読み込みの速さを見るときは絞ったまま、
  描画の CPU を見るときは絞りを外してから測る。
- **描画の速さを、壁の時計で測らない** — この箱で並列に作業していると load average が
  20を超える。rAF の間隔は**同じ条件を2回測って 33ms と 116ms** が出る。
  「60fps になった」の誤報はこれで出た。CDP の `Performance.ProcessTime`（描画プロセスが
  実際に使った CPU 秒）から**1フレームあたりの CPU** を出す（同条件3回で 24/25/25）。
  道具は `tools/sprites/framecpu.mjs`。転送量（バイト数）は混み具合に影響されないので、
  そちらは壁の時計でよい。
- **文字の濃さは、同じ面を2回撮って測る** — 1枚目はそのまま、2枚目は**字の色だけ透明**にする。
  `text-shadow` は透明にしても残るので、2枚目が「その字が乗っている地そのもの」になる。
  差の出た画素が字の画素。道具は `tools/sprites/inkpx.mjs`。
  - **合否は中央値で決める。字の下位10%で決めない。** にじみ（アンチエイリアス）の
    画素を測ることになる。校正になるのが島の札の名前で、計算値ちょうど 9.25 の字でも
    下位10%は 5.06、最低は 3.24 と出る。真の値が 9.25 の字がそうなるので、
    下位10%で判定するとどんな字も落ちる。
  - **代わりに「地のばらつき」を見る。** 中心だけ濃い暗幕を敷いて中央値をよく見せた
    ことが1度ある（中央値 7.16 のまま端が 3.28）。あれは字ではなく**地**が場所で
    変わっていたので、2枚目（地だけの絵）を字の面積ぶん見て、いちばん明るい地と
    いちばん暗い地の両方で比を出せば分かる。
  - **島を止めてから撮る。** 2枚のあいだに住人が歩きカメラが寄ると、差分に字と
    関係ない画素が混ざる（「地が紫（住人の服）」という値が実際に出た）。
    CSS の animation を止めるだけでは足りない。島は rAF で動くので
    `window.requestAnimationFrame = () => 0` で止める。
  - **dpr は 2 以上で撮る。** dpr1 だと同じ字が 7.02、dpr2 だと 9.25 と、2〜3割低く出る。
- **SVG の SMIL（`<animate repeatCount="indefinite">`）も、中身を全部描き直す** —
  `/nordic/sweden` は誰も触っていない3秒で CPU 3,180ms（島 920 / 掲示板 120）だった。
  目印のパルス22本が、そのたび 380本のパスを焼き直していた。
  外すと 5,640ms → **0ms**。要素数でも、ぼかしでも、画素数でもない
  （`filter` 除去・`clip-path` 除去・`opacity` を1に・dpr=1、どれも効かない）。
  動かすものは**地図とは別の小さな要素**に載せて、CSS の `transform` / `opacity` でやる。
- **SVG は `viewBox` を書き換えると中身を全部描き直す** — 1ドットでも動かすと、
  画面の外にある部分まで毎フレームなぞる。島はこれで1フレーム 26.6ms（うち 20ms が
  ラスタライズ）だった。動かすのは CSS の `transform` にして、`viewBox` は据え置く。
  `will-change` を SVG の**中の要素**に付けるのは逆効果（133ms まで悪化した）。付けるなら `<svg>` に。

## コミットと PR

- コミットメッセージは日本語。**何をしたかではなく、なぜそうしたかを書く。**
- コード中のコメントも日本語。「そう書いた理由」を残す。読めば分かることは書かない。
- モデル名（Claude / Opus など）をコミットメッセージ・PR・コードコメントに入れない。
