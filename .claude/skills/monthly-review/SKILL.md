---
name: monthly-review
description: 月末配信「1ヶ月ふりかえり授賞式」の画面（OBS 1枚・1080×1080）を作って出す手順。決まりは docs/spec/monthly-review.md（MR-1〜）。期間を決める → データを取る → 中身を選ぶ → 書き出す → 測る → 出す → 前日の配信ぶんを足して出し直す → 配信のあとにタップ数を取る。トリガー語:「月末配信」「月末集計」「ふりかえり授賞式」「monthly review」。
---

# 月末配信の授賞式を作る

## 役割と入出力

| | |
| --- | --- |
| 決まり（拘束力あり） | **`docs/spec/monthly-review.md`**。作る前に全部読む。この手順と食い違ったら仕様が正 |
| 出すもの | `public/<年><月>_monthly_review.html`（単一ファイル・実行時の外部依存は Firestore の SDK だけ） |
| 道具 | `tools/monthly_review/`（中身の JSON → 画面に書き出す・測る） |
| 島の側の同じ月 | `/months/<年-月>`（`python/build_monthly.py` が焼く）。数はここと同じ（MR-3） |
| 本番の道 | `https://ayato-arigato.com/<年><月>_monthly_review`（MR-28） |

手で HTML に中身を貼らない。過去の月のページを土台にしない（仕様に無い決まりが混ざる）。

## 手順

### 1. 期間を決める（MR-1）

`python/build_monthly.py` の `FINALS` に今回の月末配信の日を1行足し、PR に札 `出す`。
マージされたら `rebake.yml` を `scripts=build_monthly, dry_run=false` で回し、`site/content/months.ts` に今月を焼く。

### 2. 材料をそろえる

```bash
python3 python/stream_notes.py pending --month YYYY-MM     # 0 になるまで議事録を作る（スキル stream-notes）
python3 python/buzzwords.py --from <期間の頭> --to <期間の尻> # 流行語の候補（MR-18）
```

| 材料 | 取り方 |
| --- | --- |
| 出席・皆勤・オープニングの4つの数 | `python3 tools/monthly_review/kinkin_from_months.py YYYY-MM`（`months.ts` から。皆勤の人のひとことは `content.json` の `kinkinWords`） |
| 投げ銭 | `run_admin_script.yml` を `script=monthly_tips_run`, `args={"from":..,"to":..}` で回し、ログの JSON を `tools/monthly_review/YYYY-MM.tips.json` に置く |
| 付箋（MR-19） | Firestore `islandNotes`。`run_admin_script.yml` の読み取りで取る |
| カードの写真（MR-14・15） | Firestore `islandStreamEventImage`（`role: card`、`day` が期間内）と Cloud Storage。横 900px の JPEG にして `tools/monthly_review/YYYY-MM/cards/` に置く |
| 中身を選ぶ材料 | 目次 `streams/YYYY/MM.md` → 議事録 `streams/YYYY/MM/<stem>.md` → 必要なときだけ `*.chat.txt`・字幕 |

### 3. 中身を選ぶ

`tools/monthly_review/YYYY-MM.content.json` に書く。コーナーと数は MR-11、選びかたは MR-14〜MR-21。
選び終えたら次の2つを確かめる。
- クイズと6分割の出来事の突き合わせ（MR-13）。被りは 0 にする
- 視聴者さんの引用を1行ずつ声に出して読む（MR-17）

### 4. 書き出して測る

```bash
node tools/monthly_review/build_<年><月>.mjs     # JSON と画像 → public/<年><月>_monthly_review.html
node tools/monthly_review/check.mjs             # MR-22〜27 を全面・全ステップで測る
```

撮った絵を横 540px に縮め、1面ずつ目で見る（MR-26）。

### 5. 出す

1. 進行の書類を作って初期化する。`run_admin_script.yml` で `script=firestore_write`、`args={"collection":"monthlyReview","doc":"<docId>","data":{"scene":0,"step":0,"ts":1,"confetti":0}}` を回す
2. PR に札 `出す` を付ける（スキル `island-ship`）
3. 本番の道が 200 で、中身が master のファイルと同じことを確かめる
4. あやとに次の3つの道を渡す: `https://ayato-arigato.com/<年><月>_monthly_review`（OBS は `?role=view`、操作は `?role=ctrl`）

### 6. 前日の配信ぶんを足す（MR-30）

前日の配信が取り込まれたら（`streams/` に入り、`months.ts` の分母が増えたら）、次をやり直して出し直す。
- 2章の材料（出席・投げ銭・流行語）
- 3章の中身のうち、その日に関わるもの（6分割の最後のコマ・手紙の最後の段落）

### 7. 配信のあと: タップ数を取る

```bash
python3 .claude/skills/ec2-chrome/ec2.py queue     # EC2 の Chrome（使い終えたら stop）
python3 tools/youtube_taps.py --missing            # python/data/monthly_taps.json へ
python3 python/build_monthly.py --build            # /months に焼き直す
```

台帳に仮の数を置かない。取れないときは `yt_taps.py` の読みどころを直す。

## 道具の決まり

- BigQuery はこの作業箱から読めない。読むのは Actions（`run_admin_script.yml`・`rebake.yml`）
- `site/content/*.ts` を正規表現で読まない。`python/ts_read.py` を通す（`ts_readers_selftest`）
- Firestore の書きは apiKey では通らない。書類の作成・初期化は `run_admin_script.yml` から
- 撮るときは Playwright（`require('playwright')`）と `python3 -m http.server`。`window.__jump(面, 99)` で、その面を最後まで出した状態にする
- 次の月は `202611.template.html` と `build_202611.mjs` を写して月を替える
