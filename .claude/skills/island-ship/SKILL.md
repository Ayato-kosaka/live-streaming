---
name: island-ship
description: あやと島の直したものを本番に出すまでの手順。型・lint・全面巡回で確かめ、本番データに対して dry-run し、PR を作ってマージし、Hosting / Functions を手で起動して、出たものを本番で突き合わせる。トリガー語:「本番に出す」「デプロイ」「マージして出して」「ship」。
---

# 直したものを本番に出す

**デプロイは `push` では起きない。** どちらも `workflow_dispatch` で手で起動する。

| 何を変えたか | 走らせるワークフロー |
| --- | --- |
| `site/` `public/` `app/`（画面） | `firebase-hosting-deploy-prod.yml` |
| `functions/`（API） | `firebase-functions-deploy.yml` |
| `python/` `.github/workflows/`（毎晩のジョブ） | **デプロイ不要**。次の回から master のものが走る |

`firestore.rules` は Hosting のワークフローが配る。**ルールを変えたら Hosting を走らせる。**

## 1. 出す前に確かめる

```bash
cd site      && npx tsc --noEmit          ; echo "site tsc=$?"
cd functions && npx tsc --noEmit          ; echo "functions tsc=$?"
cd functions && npx eslint src --ext .ts  ; echo "eslint=$?"
python3 -m py_compile python/*.py         ; echo "py=$?"
```

**終了状態で見る。** `| head` を挟むと head の終了状態になって、常に 0 に見える。

画面を触ったなら、書き出したものを静的に配って全面を巡回する（開発サーバーでは測らない）:

```bash
cd site && NEXT_DIST_DIR=.next-verify npx next build
python3 -m http.server 4321 --directory .next-verify &
cd ../tools/sprites && node crawl.mjs     # 全ページの h1・JSエラー・横あふれ・リンク切れ
```

`bad 0` / リンク切れ 0 が条件。終わったら開発サーバーは落とす（3.7GB まで膨らむ）。

## 2. 本番データを触るなら、先に dry-run

`python/admin/*.py` は**既定が dry-run**。`args` に `{"apply": true}` を渡すまで書かない。

**master にマージする前に、ブランチのまま本番データで試せる。**
`run_admin_script.yml` は `actions/checkout` が dispatch した ref を見るので、
ブランチを push してからそのブランチで起動すればよい。

```
mcp__github__actions_run_trigger  method=run_workflow
  workflow_id=run_admin_script.yml
  ref=claude/streaming-website-concept-jhpv28
  inputs={"script":"cards_build","args":"{}"}            ← dry-run
  inputs={"script":"cards_build","args":"{\"apply\": true}"}  ← 書く
```

**dry-run の件数を読んでから apply する。** 狙った件数と違ったら止まる。
（#209 では「素性を足す2枚 / そのまま1枚」= 狙った2枚だけ、新しく増えるカード0、
を確かめてから apply した）

## 3. コミットと PR

- コミットメッセージは日本語。**何をしたかではなく、なぜそうしたかを書く**
- **モデル名（Claude / Opus など）を入れない**（コミット・PR・コードコメントすべて）
- `git add -A` は使わない。触ったファイルを名指しで add する
- **型が通らない状態は push しない**（同じブランチを他の担当が使っている）

master は squash マージで進むので、ブランチとは履歴が割れる。
`git log origin/master..HEAD` が何十件あっても、`git diff origin/master --stat` が
空なら中身は同じ。**差分の行数で見る。**

マージのあとはブランチに master を取り込んでおく:

```bash
git fetch origin master && git merge origin/master -m "master を取り込む"
git push -u origin claude/streaming-website-concept-jhpv28
```

push が network で落ちたら 2s → 4s → 8s → 16s で4回まで。

## 4. デプロイして、ログの最後まで見る

```
mcp__github__actions_run_trigger  method=run_workflow  workflow_id=<yml>  ref=master
mcp__github__actions_list  method=list_workflow_jobs  resource_id=<run id>  minimal_output=true
```

**`minimal_output=true` を必ず付ける**（付けないと巨大なコミット本文が返る）。

Hosting は**いまも赤で終わるのが正常**。最後の `firestore:indexes` が #168
（サービスアカウントに索引を作る権限が無い）で必ず 403 になる。
**そこは最後尾に置いてあるので、その前のルールと画面は配られている。**
ログで `firebase deploy --only firestore:rules` と Storage のルールが
緑になっていることまで見る。`continue-on-error` は外してあるが、順番で守っている。

## 5. 出たものを本番で見る

**必ずキャッシュバスタを付ける。** `/island-api/*` は CDN に乗るので、
付けないと `x-cache: HIT` で古い返事を読む（それで「本番0件」と誤報したことがある）。

```bash
B="https://live-streaming-d3cac.web.app"; C="cb=$(date +%s)"
curl -s "$B/island-api/cards?$C" | head -c 400
for u in / /me /cards /friends /about /next /nordic/photos; do
  printf "%-16s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' "$B$u")"
done
```

Functions のデプロイは2〜3分かかる。**デプロイ緑を見てから叩く。**

## 6. 報告する

CLAUDE.md の決まり: **聞かずに進めてよいが、やったことは必ず報告する。**
落ちたテストや飛ばした手順は、飛ばしたと書く。緑なら緑と書く。

このサンドボックスから**ブラウザでは** `lh3.googleusercontent.com` と
`upload.wikimedia.org` に届かない（curl では取れる）。
本番の見た目を撮るときは先に `python3 tools/sprites/avatars.py` で落として、
`tools/sprites/route.mjs` の `offline(ctx)` で差し替える。
やらないと**島の12人が全員そっくり同じに写る。**
