# 退避と、戻しかた

**失ったら取り戻せないものだけを、本番の外へ毎晩1回写している。**
この文書は「戻すとき」に読むもの。旅の途中でも、上から順に打てば戻る。

- 取るしくみ … `.github/workflows/backup.yml`（毎晩 02:00 UTC）
- 何を取るか … `python/backup/plan.py`（**1件ずつ理由が書いてある**）
- 置き場 … BigQuery の `live-streaming-d3cac.island_backup`（**asia-northeast1**）

---

## いますぐ確かめたいとき

**いちばん軽いのは、Firestore に置いてある札を1枚読むこと。**

```
run_admin_script.yml → firestore_read
  {"collection": "islandBackupHealth", "doc": "last"}
```

```
at            いつ取ったか
ok            true / false
error         落ちた理由（型と一行だけ）
tookSec       何秒かかったか
firestoreDocs 何件取ったか
firestoreBytes 何バイトぶんか
bqRows        BigQuery から何行積んだか
photosOk      写真の索引（Firestore の url 欄）が引けたか
photosAdded   この回に新しく取った枚数
photosLeft    まだ取れていない枚数（**0 なら全部入っている**）
photosFailed  この回に取れなかった枚数（合言葉が作り直された等）
runUrl        その実行のログ
```

**写真は `photosAdded` だけ見ない。** 1回の実行に上限（128MB）があるので、
上限で切り上げた回と取り切った回が同じ字に見える。**見るのは `photosLeft`。**

**退避が本番の Firestore に書くのは、この1書類だけ。** ほかは全部読むだけ。
（`firestore.rules` はこの入れ物を名指ししていないが、いちばん下の
catch-all で deny に落ちるので、ブラウザからは読めない）
（`functions/src/chatCapture.ts` の `streamChatHealth`、
`python/fund_daily.py` の `islandFundHealth` と同じ手）

もっと詳しく見たいとき:

```
run_admin_script.yml → backup_status  {}
```

出るもの: 直近10回の 〇✕ と、置き場に入っている件数。

**赤くなるのは2つのときだけ。**

1. **いちばん新しい回が落ちている**
2. **36時間以上、1回も走っていない**（毎晩 02:00 UTC のはず）

過去に落ちた回があっても、そのあと通っていれば赤くしない。
**旅の17日でひと晩こけただけで、残り16日ずっと赤いままになると、赤が意味を失う。**

**2 は、ワークフローの赤では捕まえられない唯一の壊れ方。**
cron そのものが動いていないときは、赤い実行すら残らない。

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

## 戻しかた（旅の写真）

置き場の `photos` は1行1枚。`body` が実体（BYTES）、`size` と `sha256` が
そのときの記録。**戻すというのは、取り出してこの2つに一致することまで。**

```bash
# 1枚戻して、バイト列が一致するか見る（**置き場を読むだけ**）
python python/backup/restore.py --photo

# 実体をファイルに書き出す
python python/backup/restore.py --photo --photo-out /tmp/one.jpg

# どの1枚かを指定する（省くといちばん新しいもの）
python python/backup/restore.py --photo --photo-path "nordic/photos/2026-09-12/xxxx.jpg"
```

**毎晩これが1枚、`backup.yml` の `drill` で自動で回っている。**

全部を書き出すときは、置き場から `path` と `body` を読んで並べる。
`body` は BYTES なので、BigQuery のコンソールから落とすと base64 の字になる。
**元のファイル名（`path`）と一緒に書き出す**こと。書類の `url` は
合言葉ごと変わりうるが、`path` は変わらない。

---

## 写真を手で流す（溜まっているぶんを早く入れたいとき）

```
run_admin_script.yml → backup_photos
  {}                                … 下見。**1バイトも書かない**
  {"apply": true}                   … 上限（128MB）ぶん取る
  {"apply": true, "budget_mb": 400} … 上限を押し上げて取る
  {"verify": true}                  … 1枚戻してバイト列を突き合わせる
  {"selftest": true}                … 偽の置き場で振る舞いを動かす（外に出ない）
```

**`backup_now` ではなくこちらを押す。** あちらは退避を丸ごと回すので、
写真を何回か続けて押すあいだ、BigQuery を毎回 490MB 読み直すことになる。

---

## 何を取っていて、何を取っていないか

理由は `python/backup/plan.py` に1件ずつ書いてある。ここは要約。

### 取っている

| 何 | なぜ |
| --- | --- |
| 視聴者さんの書いた字（`islandNotes` `islandIdeas` `islandStreamEvent` `islandNextPlans` `islandPolls`） | **どこからも作り直せない** |
| 旅の日記（`nordicLog`）と「いまどこ」（`island`） | 人しか書けない。日記は焼き込みへ移ってもう増えないが、**入れ物は消さない** |
| 手で紐付けた対応表（`islandDonors`）と、名前を出してよいという同意（`islandUsers`） | 人の作業と、本人の意思表示 |
| 豚の貯金箱（`islandFundSuperChats` `islandFundSpends` `islandFundGoals`） | 手で入れたぶんと支出は、どこからも作り直せない |
| 投げ銭の台帳（`islandTips`） | 作り直せることになっているが、**お金の記録を「たぶん戻る」に賭けない** |
| 訪問者数（`islandVisits`）とハート・票の重複よけ（`islandHearts` `islandPollVotes`） | BigQuery から出せない。失うと数が壊れる |
| 写真への参照（`islandStreamEventImage` `nordicPhotos`） | これが無いと、実体があっても辿れない |
| **旅の写真の実体**（`nordic/photos/…`・3枚 2.4MB） | **人が撮ったもので、どこからも作り直せない。** 参照だけ取って実体を取らないのは、鍵だけ持って家を持たないのと同じ |
| **キャラクターの絵の実体**（`island/characters/…`・533件 338MB） | **視聴者さんが描いたもの。** 元は各自の Google ドライブだが、こちらから取りに行く道は無い（`docs/island-character.md`）。置き場の 94% がこれ |
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

### 1. 置き場の、**索引に載っていない中身**

写真の実体は、**Storage の口をまったく通らずに取っている。**
Firestore の書類（`islandStreamEventImage` / `nordicPhotos`）の `url` 欄に入って
いる**合言葉つきのダウンロード URL** を、そのまま HTTP で叩いている
（`functions/src/islandApi.ts` の `photoUrl()`）。

Storage の IAM では読めないことを本番で実測してある（2026-09-12）:

```
Functions のサービスアカウント  … objects.list ○ / **objects.get ✕**
Actions のサービスアカウント    … **権限が1つも無い**
```

**数えられることは、退避できることではない。** どちらの道でも実体は読めないので、
索引（Firestore）のほうから辿っている。

その代わり、**この道で届かないものがある:**

- **Firestore の索引に載っていない実体には、1枚も届かない。**
  「差が出たらここに実測を書く」と書いてあったので、測った（2026-09-13）。

  | 置き場のフォルダ | 件数 | バイト | 索引から辿れるか |
  | --- | ---: | ---: | --- |
  | `island/characters/` | 539 | 337,784,452 | **533件は辿れる**（`islandCharacter` の `images.{plain,scene}` に合言葉つき URL）。残り6件は焼き直しで置き換わった古い png / jpg で、**もう誰も読んでいない** |
  | `nordic/photos/` | 3 | 2,422,958 | 3件とも辿れる |
  | `purged/public-bucket/` | 2 | 23,767 | **辿れない。** 公開バケットを片づけたときの控えで、合言葉つき URL を持たない |

  **置き場の 94% はキャラクターの絵**（原寸166件だけで 319,271,977 バイト）。
  幅ごとの版367件は `python/admin/characters_rebake.py` の `bake()` で
  原寸から焼き直せるが、**それは置き場の 5% にしかならない**ので、
  選り分けずに533件とも取る。戻すときに焼き直しの一手が要らない
- **合言葉が作り直された1枚は、二度と取れない。** 403 か 404 で返る。
  数えて `::warning::` に出す。**残りは取り切る**
- `url` 欄の無い書類も同じ。数えて出す

置き場を直接読めるようになれば（#296 の「読むだけの役」）、1つ目が埋まる。
**急がない。** 索引に載っているぶんは、この道で入る。

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
  photos           … 写真の実体（1行1枚。`body` が BYTES・`sha256` が指紋）
  runs             … 1回ぶんの記録。取れたか・何件・何バイト・何秒
```

**古い世代は 90 日で落とす**（`python/backup/sink.py` の `KEEP_DAYS`）。
Firestore の世代は1晩あたり 1MB 弱なので、90日でも 90MB。

### 実測（2026-09-11。はじめの1回を取ったところ）

| 表 | 行 | バイト |
| --- | --- | --- |
| `chat_messages` | 135,427 | 168,891,018 |
| `firestore_docs` | 1,917 / 1世代 | 956,122 / 1世代 |
| `doneru_donations` | 974 | 497,516 |
| `videos` | 763 | 114,943 |
| `doneru_ingest_runs` | 14 | 2,028 |
| | | **合計 約 164MB** |

**本番と突き合わせて、4表とも件数も中身の指紋も一致している。**

**この日の 164MB に、実体は1バイトも入っていない。** 入りはじめるのは
2026-09-12 に `photos.py` を入れてから。旅の写真3枚（2.4MB）はその日に
入り切っていて、キャラクターの絵533件（338MB）がそのあと。
**入り切れば置き場は 約 500MB になる**（東京の置き場代で月 1〜2円）。

### 旅の17日でどれだけ増えるか

| 何 | 1晩 | ×17日 |
| --- | --- | --- |
| Firestore の世代 | 約 0.96MB | **約 16MB** |
| `chat_messages`（増えたぶん） | 450〜800行 ≒ 1.0MB | **約 17MB** |
| `videos` / `doneru_donations` / `doneru_ingest_runs` | 0（毎回入れ替え） | 0 |
| `runs` | 約 1.2KB | 約 20KB |
| | | **合計 約 35MB** |

**旅が終わった時点で 約 200MB。** BigQuery の置き場代は東京で 1GB あたり
月 $0.023 なので、**月 1円もいかない。**
毎晩の読み取りは 約 490MB（本番と退避の突き合わせを含む）で、17晩ぶんで
8.3GB ＝ **合計 $0.05 ほど。**

**写真は、いちばん効く。** すでに溜まっているのが 544枚 340MB。
そのうえで1枚 300KB 前後・1日20枚なら 6MB/日で **17日で約 100MB**
（退避全体の増えぶんの8割以上）。
上限まで貼った最悪の日が17日続くと 120枚 × 4MB × 17 = 8.2GB。
**だから写真だけは「増えたぶんだけ」にしてある。** 毎晩まるごと写すと、
17日目には17日ぶんを17回写すことになる。

**1回の実行の上限は 128MB**（`python/backup/photos.py` の `BUDGET_BYTES`）。
溜まっている 340MB は3回で取り切る。退避は1晩に最低2回起きる
（取り込み2本の完了に繋いである）ので、**2晩で追いつく。**
定常の 6MB/日は上限の 5% なので、普段は当たらない。
**上限に当たっても赤くしない。** 残り枚数を `::notice::` に出して、
次の回が続きから拾う（栞は置き場そのもの＝`photos` に入っている名前）。

---

## 落ちたらどう分かるか

1. **ワークフローが赤くなる。** `continue-on-error` をどこにも使っていない
2. **`islandBackupHealth/last` に `ok: false` と理由が残る。**
   旅の途中は、これを `firestore_read` で1枚読むのがいちばん早い
3. `island_backup.runs` にも1回ぶんが残る → `backup_status` で直近10回まとめて読める
4. **取るだけでなく、毎晩「戻せるか」も試している。**
   `backup.yml` の `drill` が、エミュレータへ1コレクション戻して
   件数と中身の指紋を突き合わせ、**写真も1枚戻してバイト列を突き合わせる。**
   **壊れた退避で緑を出さないため**
