---
name: island-ship
description: あやと島の直したものを本番に出すまでの手順。既定は PR に札 `出す` を付けて ship.yml に任せる（緑になりしだいマージ → Hosting / Functions を起こして終わるまで待つ → 本番と突き合わせる → PR に1コメント）。こちらは札を付けて、そのコメントを読むだけ。ワークフロー・Firestore のルールなど ship.yml で出せないものだけ手で回す。トリガー語:「本番に出す」「デプロイ」「マージして出して」「ship」。
---

# 直したものを本番に出す

**出すかどうかを決めるのは、こちらの責務のまま。札 `出す` を付けることが、その判断。**
`ship.yml` は「緑なら出す」を機械的に回すだけで、何も決めない。品質が届いているかは
付ける前に自分で見る（0章）。

**既定の出しかた: PR を作る → 札 `出す` を付ける → 待つ（ポーリングしない）→ コメントを読む。**
CI の待ち・マージ・デプロイの起動と待ち・本番との突き合わせは、全部 Actions の中で回る
（#1117。それまでセッションが何十回も API を叩き、長いログを読んで回していた）。

## 0. **まず `docs/island-standards.md` を開く**

**この章を飛ばさない。** 求められている水準と、出す前のチェックがそこにある。

> **「前より良い」は基準ではない。基準は、見た人がワクワクするか。**
> 出す前に**自分の目で見る**（撮る）。見て「弱い」と思ったら、それは弱い。**出さない。**

チェックを1つずつ潰してから、下へ進む。**潰せないものがあるなら、札を付けない。**

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
tools/build.sh 3130
python3 -m http.server 4130 --directory site/.next-3130 &
DIST=site/.next-3130 SPORT=4130 node tools/sprites/crawl.mjs   # 絵・h1・JSエラー・横あふれ・リンク切れ（0/1/2）
DIST=site/.next-3130 node tools/sprites/orphanpage.mjs         # どこからも入れない面（0/1/2）
```

`bad 0` / リンク切れ 0 が条件。`orphanpage.mjs` は `crawl.mjs` の裏返し（リンクの無い行き先）で、
1秒で終わる。終わったら配った箱を落とす。

## 2. 本番データを触るなら、先に dry-run

`python/admin/*.py` は**既定が dry-run**。`args` に `{"apply": true}` を渡すまで書かない。
`run_admin_script.yml` は dispatch した ref を見るので、**master に入れる前に枝のまま**試せる:

```
mcp__github__actions_run_trigger  method=run_workflow  workflow_id=run_admin_script.yml
  ref=<枝>  inputs={"script":"cards_build","args":"{}"}             ← dry-run
  ref=<枝>  inputs={"script":"cards_build","args":"{\"apply\": true}"}  ← 書く
```

**dry-run の件数を読んでから apply する。** 狙った件数と違ったら止まる。

## 3. PR を作る

- コミットメッセージは日本語。**何をしたかではなく、なぜそうしたかを書く**。モデル名を入れない
- `git add -A` は使わない。触ったファイルを名指しで add する。**型が通らない状態は push しない**
- **押す前に、いまどこに居るかを見る**（`git branch --show-current`）。master の上でコミットして
  枝の名前を押すと、**新しいコミットが1つも載らないまま PR ができる**（#100）
- 本文に **`Closes #NNN`** を書く。マージで GitHub が閉じ、`ship.yml` が閉じた issue に同じ1行を書く。
  指してはいるが閉じないなら `#NNN は閉じない` と1行（書かないと `Closes Check` が赤い）
- 面（`site/app`）か部品（`site/components`）を触ったら、`site/content/updates.ts` に
  **その人に何ができるようになったか**を1行（`on` は**本番に配る日**。「〜しました」で言い切る）。
  内側だけの直しは足さない。忘れても `python/upkeep_watch.py` が翌朝鳴らす

マージは**マージコミット**（squash しない）。

## 4. 札 `出す` を付けて、待つ（既定）

```bash
gh api -X POST repos/Ayato-kosaka/live-streaming/issues/<PR>/labels -f 'labels[]=出す'
```

付けたら **`subscribe_pr_activity` で待つ。ポーリングしない**（`gh pr checks` も `actions_list` も
叩かない。叩くほどトークンが減る。それをやめるための仕組み）。結果は `github-actions[bot]` の
コメントで届く。読んだら `unsubscribe_pr_activity`。

| コメントの1行目 | 意味 | こちらがやること |
| --- | --- | --- |
| `出しました: #N をマージ（…）→ Hosting` | マージ・配り・突き合わせまで済んだ | 報告する（7章）。3行目の `本番の突き合わせ: n/n` が割れていないか見る |
| `出しました: … → 配り先なし（…だけ）` | マージだけ（配るものが無い） | 報告する |
| `出せませんでした: …` | マージしていない。札 `出す` は外れ、`待ち-システム` が付いた | 書いてある行だけ直して、**札を付け直す**（それが「もう一度出す」の判断） |
| `出しきれませんでした: …` | マージはした。配りか突き合わせが落ちた | 書いてある行を見て、直したものを新しい PR で出す |

**何もコメントが来ないのは「まだ待っている」。** checks が走っている間・枝でショートの取り込みが
走っている間（#291）・mergeable が分からない間は、黙って次の完了を待つ。
いつまでも来なければ、ship.yml が起きていない（5章の手で回す）。

### 付ける前に「付けたらどうなるか」を見る

**付けた瞬間に動く。** 迷ったら先に dry-run で見る（既定が dry-run。マージも配りもしない）:

```bash
gh api -X POST repos/Ayato-kosaka/live-streaming/actions/workflows/ship.yml/dispatches \
  -f ref=master -f 'inputs[pr]=<PR>' -f 'inputs[dry_run]=true'
```

run の要約に「札を付けたら → go / wait / fail」と、**何をマージし、どの配りを起こし、
何を本番と突き合わせるか**が出る（いまの本番の entry と書き出しの印も）。

### ship.yml がやること

1. **見る**（書かない）: open・札・base が master・手で出す面に触れていない・head の check が
   自分以外ぜんぶ success か skipped（**neutral は緑にしない**）・枝で他の run が走っていない・mergeable
2. **マージ**（merge commit。head の sha を名指しするので、見たあとに動いた head はマージしない）
3. GITHUB_TOKEN のマージでは `push: master` が起きないので、**`Selftests` と `重い見張り` を名指しで起こす**
4. 変えた場所で配り先を決めて、master で workflow_dispatch し、**終わるまで runner の中で待つ**

   | 変えたもの | 配り先 |
   | --- | --- |
   | `site/` `public/` `app/`、Expo の書き出しに入るもの（`lib/` `components/` `hooks/` `constants/` `assets/` `web/` と直下の設定）、`firebase.json` | Hosting |
   | `functions/` | Functions |
   | それ以外（`docs/` `python/` `.claude/` …） | 配らない |

5. **本番と突き合わせる**（`live-streaming-d3cac.web.app`。`.firebaserc` から読む）:
   `public/` の変えたファイル最大20本を sha256 で / Expo を変えたら `/expo-app` の entry が引けて変わったか /
   `site/` を変えたら `/` と触った面が 200 で新しい書き出しの印を持つか / Functions は配りの結論
6. PR に1コメント（5行以内）、`Closes #N` で閉じた issue に同じ1行。落ちたら落ちた行だけ

配りは1本ずつ（`concurrency`）。中身と判断の表は `python/ship.py` の頭、対照は `python/ship_selftest.py`。

## 5. ship.yml が使えないとき（手で回す）

| 面 | なぜ使えないか |
| --- | --- |
| `.github/workflows/` を触る PR | GITHUB_TOKEN は `workflows` の権限を持てない。**マージの時点で GitHub に断られる**（ship.yml は「手で出す面」と1行返す） |
| `firestore.rules` `storage.rules` | 配る前に手で dry-run する面。Hosting を押すと本番のルールが差し替わる |
| PR の checks が無い面・PR を経ないもの | 起こすものが無い |
| コメントがいつまでも来ない | ship.yml が起きていない（名前の繋ぎが切れた・Actions が止まっている） |

手で回すときは:

1. **マージ**（merge commit）。手でマージすると `push: master` で `Selftests` と `重い見張り` が走る
2. **まず、マージしたコミットに変更ファイルが在るかを見る**（`git show --stat origin/master | head -3`）。
   ファイルが1件も出てこないマージは、何もしていない（#100）
3. **配る**（`push` では起きない。両方とも手で起動する）

   ```
   mcp__github__actions_run_trigger  method=run_workflow  workflow_id=<yml>  ref=master
   mcp__github__actions_list  method=list_workflow_jobs  resource_id=<run id>  minimal_output=true
   ```

   `minimal_output=true` を必ず付ける。Hosting は**緑で終わるのが正常**（`firestore:rules`・Storage の
   ルール・`firestore:indexes` の3つが緑か）。赤かったら本物の異常。ログは `failed_only`・`tail_lines` で読む
4. **本番で見る。必ずキャッシュバスタを付ける**（`/island-api/*` は CDN に乗る）。
   Functions は2〜3分かかるので、デプロイ緑を見てから叩く

   ```bash
   B="https://live-streaming-d3cac.web.app"; C="cb=$(date +%s)"
   curl -s "$B/island-api/cards?$C" | head -c 400
   ```

   `firebase.json` を触ったら `node tools/sprites/notfound.mjs`（無い道が 404。配る前は `--dist`）。
   本番の面を一周するのは `node tools/sprites/prodsweep.mjs`（配りのワークフローからも自動で走る）

## 6. issue を閉じる（飛ばさない）

- `Closes #NNN` を書いておけば、マージで閉じ、ship.yml が同じ1行を残す。**手で閉じるぶんは、出したその場で**
  （あとでまとめて、にしない。#159 #160 #161 #163 が2日開いたままだった）
- 新しく立てた issue には `待ち-あやと` / `待ち-システム` / `旅のあと` のどれか（迷ったら `待ち-システム`）。
  あやとにしかできないことなら `/ask-ayato`（自分のトークンの `@Ayato-kosaka` は通知が飛ばない）
- 閉じるときは**何を出したかを1行**。やっていないことが残るなら、**残りがどこで追えるか**を書く

仕組みは `docs/island-tickets.md`。

## 7. 報告する

**聞かずに進めてよいが、やったことは必ず報告する。** ship.yml のコメント（マージ・配り先・
デプロイの run・突き合わせ n/n）をそのまま使ってよい。落ちたテストや飛ばした手順は、飛ばしたと書く。

本番の見た目を撮るときは、先に `python3 tools/sprites/avatars.py` で住人の絵を落として、
`tools/sprites/route.mjs` の `offline(ctx)` で差し替える（このサンドボックスのブラウザからは
`lh3.googleusercontent.com` に届かない。やらないと島の12人が全員そっくり同じに写る）。
