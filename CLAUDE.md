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

## 作業の入口

まず読む:

- [`docs/island-concept.md`](docs/island-concept.md) — 何のための島か。見た目・触りごこち・言葉の原則
- [`docs/island-db.md`](docs/island-db.md) — BigQuery / Firestore / Git の3層のデータ設計
- [`docs/island-plan-drafts.md`](docs/island-plan-drafts.md) — 企画ページを視聴者さんと作る仕組み
- [`docs/island-login.md`](docs/island-login.md) — YouTube ログインを有効にする手順（あやとの作業）

## 検証のしかた

```bash
cd site
npx next dev -p 3000            # 開発サーバー
NEXT_DIST_DIR=.next-verify npx next build   # 確認用ビルド
```

**確認用ビルドでは必ず `NEXT_DIST_DIR` を付ける。**
付けずに `next build` を叩くと、動いている開発サーバーの `.next` を壊して
ハイドレーションが止まり、「スマホ幅なのにPCの表示になる」といった見えづらい壊れ方をする。

ページを触ったら、書き出したものを一通り回して確認する:

```bash
cd site && NEXT_DIST_DIR=.next-verify npx next build
python3 -m http.server 4321 --directory .next-verify &
cd ../tools/sprites && node crawl.mjs    # 全ページの h1・JSエラー・横あふれ・リンク切れ
```

Playwright は `tools/sprites/node_modules` にある（リポジトリ直下には無い）。
スクリーンショット系のスクリプトは `tools/sprites/` から実行する。

### このサンドボックスから出られない先

ブラウザからは `lh3.googleusercontent.com`（住人のキャラクター画像）と
`upload.wikimedia.org`（北欧の写真）に届かない。本番では出る。
確認するときは `page.route()` でローカル画像に差し替える（`tools/sprites/talk.mjs` 参照）。

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

## コミットと PR

- コミットメッセージは日本語。**何をしたかではなく、なぜそうしたかを書く。**
- コード中のコメントも日本語。「そう書いた理由」を残す。読めば分かることは書かない。
- モデル名（Claude / Opus など）をコミットメッセージ・PR・コードコメントに入れない。
