# 退避と、戻しかた

**失ったら取り戻せないものだけを、本番の外へ毎晩1回写している。**
この文書は「戻すとき」に読むもの。旅の途中でも、上から順に打てば戻る。

- 取るしくみ … `.github/workflows/backup.yml`（毎晩 02:00 UTC）
- 何を取るか … `python/backup/plan.py`（**1件ずつ理由が書いてある**）
- 置き場 … BigQuery の `live-streaming-d3cac.island_backup`（**asia-northeast1**）

---

## いますぐ確かめたいとき

Actions を開けない旅の途中でも、これだけで「昨日ちゃんと取れたか」が分かる。

```
run_admin_script.yml → backup_status  {}
```

出るもの: 直近10回の 〇✕ と、置き場に入っている件数。
**1回でも ✕ があれば、このスクリプト自体が終了コード 1 で終わる。**

---

## 戻しかた（Firestore）

### 1. どの世代があるか見る

```
run_admin_script.yml → backup_restore_test  {"collection": "islandNotes"}
```

これは**エミュレータへ戻して突き合わせるだけ**なので、本番は1バイトも変わらない。
毎晩ひとりでに走っているのと同じもの。手で1回押して、緑になるのを見ればよい。

世代の一覧だけ見たいときは、BigQuery のコンソールで:

```sql
SELECT taken_at, collection, COUNT(*) AS n
FROM `live-streaming-d3cac.island_backup.firestore_docs`
GROUP BY taken_at, collection
ORDER BY taken_at DESC
LIMIT 50
```

### 2. 本番へ戻す（**事故のあとだけ**）

**この道は、既定では通れないようにしてある。** 合言葉を環境変数で渡さないと動かない。

`run_admin_script.yml` からは**わざと呼べない**（`python/admin/` に口を置いていない）。
本番へ書き戻すのは、手元で1回、目で見ながらやる作業だから。

```bash
export BQ_PROJECT_ID=live-streaming-d3cac
export GOOGLE_APPLICATION_CREDENTIALS=<サービスアカウントの鍵>

# ① まず下見。1件も書かない。何件足りていて、何件中身が違うかが出る
python python/backup/restore.py --collection islandNotes

# ② 出た数を読んで、納得できたら書く
RESTORE_TO_PRODUCTION=yes-i-mean-it \
  python python/backup/restore.py --collection islandNotes --apply
```

`--at "2026-09-15T02:00:00Z"` を足すと、その世代へ戻せる（省くといちばん新しいもの）。

**書いたあと、読み直して1件ずつ指紋を比べる。** 件数だけ合っていて中身が違う、は通らない。

### 3. 消えたぶんだけ足したいとき

`restore.py` は `set()` で書くので、**退避に入っている書類だけを上書きする。**
退避に無い書類（事故のあとに新しく書かれたもの）は消さない。
「消えたものを足す」と「全部を戻す」が同じ操作になる。

---

## 戻しかた（BigQuery）

置き場の表は**本番と同じ形**（列も型も同じ）で入っている。

### 小さい表（`videos` / `doneru_donations` / `doneru_ingest_runs`）

毎晩まるごと入れ替えているので、置き場のものがそのまま最新。

```sql
CREATE OR REPLACE TABLE `live-streaming-d3cac.youtube_chat.videos_restored` AS
SELECT * FROM `live-streaming-d3cac.island_backup.videos`;
```

**いきなり本番の名前へ書かない。** `_restored` に出して、件数を見てから差し替える。
（`island_backup` は東京、`youtube_chat` は US なので、**このクエリはそのままでは
通らない。** BigQuery のコンソールで置き場のほうを一度 US へ書き出すか、
`bq extract` → `bq load` で渡す。手元でやるなら
`python python/backup/restore.py --list` と同じ要領で行を読んで載せ直す）

### `chat_messages`（**増えたぶんだけ積んである**）

同じ行が取り込み直されると2つ入るので、**戻すときはたたむ。**
たたみかたは毎晩の突き合わせと同じ（`video_id` + `event_id` の、いちばん新しい `ingested_at`）。

```sql
SELECT * EXCEPT(_rn) FROM (
  SELECT b.*, ROW_NUMBER() OVER (
    PARTITION BY video_id, event_id ORDER BY ingested_at DESC
  ) AS _rn
  FROM `live-streaming-d3cac.island_backup.chat_messages` b
) WHERE _rn = 1
```

---

## 何を取っていて、何を取っていないか

理由は `python/backup/plan.py` に1件ずつ書いてある。ここは要約。

### 取っている

| 何 | なぜ |
| --- | --- |
| 視聴者さんの書いた字（`islandNotes` `islandIdeas` `islandStreamEvent` `islandNextPlans` `islandPolls`） | **どこからも作り直せない** |
| 旅の日記（`nordicLog`）と「いまどこ」（`island`） | 人しか書けない。旅のあいだ毎日増える |
| 手で紐付けた対応表（`islandDonors`）と、名前を出してよいという同意（`islandUsers`） | 人の作業と、本人の意思表示 |
| 豚の貯金箱（`islandFundSuperChats` `islandFundSpends` `islandFundGoals`） | 手で入れたぶんと支出は、どこからも作り直せない |
| 投げ銭の台帳（`islandTips`） | 作り直せることになっているが、**お金の記録を「たぶん戻る」に賭けない** |
| 訪問者数（`islandVisits`）とハート・票の重複よけ（`islandHearts` `islandPollVotes`） | BigQuery から出せない。失うと数が壊れる |
| 写真への参照（`islandStreamEventImage` `nordicPhotos`） | これが無いと、実体があっても辿れない |
| `chat_messages`（**増えたぶんだけ**） | **外から二度と取れない。** アーカイブが消えたら終わり |
| `videos` `doneru_donations` `doneru_ingest_runs`（まるごと） | 取り込みのリトライ状態と、セッションの寿命は引き直せない |

### 取っていない

| 何 | なぜ |
| --- | --- |
| `islandChannels`（2,260件・書類の6割） | **毎晩ぜんぶ作り直している。** 一晩で戻る |
| `islandCards` | `islandTips` × 写真からの導出。焼き直せる |
| `nordicDays` | #202 で `islandTips` へ移した旧。もう読んでいない |
| `islandRate` `islandRemote` `rouletteSessions` `monthlyReview` `streamChatHealth` `islandFundHealth` `islandHere` | その日限り・その場限り。翌日には意味が無い |

**分類していない入れ物が出てきたら、取ったうえで `::warning::` を出す。**
取りこぼすより余分に取るほうが安い（Firestore は全部で 1MB）。

---

## 取れていないもの（正直に書く）

### 1. 旅の写真の**実体**

`islandStreamEventImage` の参照は取れているが、**画像そのものは取れていない。**
取り込みを動かしているサービスアカウントに **Storage の権限が1つも無い**（実測）:

```
storage.buckets.create ✕   storage.objects.create ✕
storage.buckets.get    ✕   storage.objects.list   ✕
```

**読む権限（`storage.objects.list` と `get`）が1つ付けば、何も直さずに動き出す。**
`python/backup/run.py` の `dump_photos()` が毎晩そこを試して、権限が無いあいだは
`::warning::` を出して先へ進む（**毎晩赤くしても直らないものを赤くすると、赤が意味を失う**）。

### 2. プロジェクトごと消える事故

置き場は本番と別のデータセット・別の場所（東京 / US）だが、**同じ
`live-streaming-d3cac` の中にある。** プロジェクトごと消えたら両方消える。
外へ出すには GCS のバケットが要る（＝上と同じ権限の話）。

### 3. サブコレクション

いまの本番には無い。増えたら、毎晩の退避が `::warning::` で知らせる。

---

## 置き場の中身

```
live-streaming-d3cac.island_backup   （asia-northeast1）
  firestore_docs   … Firestore の世代（taken_at で日ごとに切ってある）
  chat_messages    … 増えたぶんを積む。本番と同じ形
  videos           … 毎晩まるごと入れ替え
  doneru_donations … 同上
  doneru_ingest_runs … 同上
  photos           … 写真の実体（**権限が来た日から入りはじめる**）
  runs             … 1回ぶんの記録。取れたか・何件・何バイト・何秒
```

**古い世代は 90 日で落とす**（`python/backup/sink.py` の `KEEP_DAYS`）。
Firestore の世代は1晩あたり 1MB 弱なので、90日でも 90MB。

---

## 落ちたらどう分かるか

1. **ワークフローが赤くなる。** `continue-on-error` をどこにも使っていない
2. `island_backup.runs` に `ok=false` と理由が残る → `backup_status` で読める
3. **取るだけでなく、毎晩「戻せるか」も試している。**
   `backup.yml` の `drill` が、エミュレータへ1コレクション戻して
   件数と中身の指紋を突き合わせる。**壊れた退避で緑を出さないため**
