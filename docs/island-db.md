# あやと島 — データ設計

保存している場所は3つ。**BigQuery**（配信とコメントの生データ）、
**Firestore**（島の状態と、みんなが書いたもの）、**Git**（手で書いたコンテンツ）。

大きな方針:

- **ブラウザから Firestore を直接触らせない。** 読み書きはすべて Cloud Functions
  (`islandApi`) を通す。`firestore.rules` は島のコレクションを全部 deny にしてある
  （Admin SDK はルールを迂回するので、これで足りる）。
- **原本は BigQuery。** Firestore に置くのは、そこから集計した「表示用の答え」だけ。
  サイトから重いクエリを投げない。
- **手で書くものは Git に置く。** 料理・国・伝説・北欧ガイドのような、
  レビューして育てたいものはコードとして扱う。

---

## 1. BigQuery — `live-streaming-d3cac.youtube_chat`

配信のアーカイブとチャットの原本。GitHub Actions が毎日流し込む。

### `videos` — 配信1本＝1行

| 列 | 型 | 中身 |
| --- | --- | --- |
| `video_id` | STRING | YouTube の動画ID（主キー） |
| `title` | STRING | タイトル |
| `actual_start_time` | TIMESTAMP | 実際に始まった時刻 |
| `status` | STRING | 取り込みの状態（`PENDING` / `WAITING` / `FAILED` / `SUCCEEDED` / `SKIPPED`） |
| `first_seen_at` | TIMESTAMP | 見つけた時刻 |
| `next_retry_at` | TIMESTAMP | 次に試す時刻 |
| `attempt_count` | INT64 | 試した回数 |
| `last_attempt_at` | TIMESTAMP | 最後に試した時刻 |
| `last_error_code` / `last_error_detail` | STRING | 失敗の理由 |
| `succeeded_at` | TIMESTAMP | 取り込めた時刻 |
| `yt_dlp_version` | STRING | 取り込みに使った版 |

#### 取り込みの状態は、WAITING で止まったまま戻ってこない

見つけた配信は `PENDING` で入り、チャットが取れれば `SUCCEEDED`。取れなければ

- 見つけてから24時間以内 → `WAITING`（翌日もう一度）
- 24時間を過ぎても取れない → `FAILED`
- 見つけてから7日を過ぎても取れない → `SKIPPED`

と落ちていく（`python/fetch_chat_data.py` の `handle_no_chat_file`）。

**ところが `WAITING` は落ちない。** 拾い直すクエリ
（`python/bq/queries.py` の `QUERY_SELECT_TARGET_VIDEOS`）が

```sql
AND first_seen_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
```

で7日を過ぎたものを**対象から外す**ので、7日のあいだに一度も拾われなかった
`WAITING` は、`SKIPPED` にも `FAILED` にも落ちないまま永久に残る。
状態を落とすのは「拾って処理したとき」だけで、拾わない相手には誰も触らない。

2026-09-10 時点で `WAITING` が28本（うち26本は 2026-02-06〜07-28）。
**全部 `attempt_count = 1`、`last_error_code` は NULL。** 一度試したきり、
二度と拾われていない。

なぜ一度も拾われないかは、`next_retry_at` の置き方で説明が付く。
`next_retry_at` は `first_seen_at + 24時間`ちょうど。ところが定時実行
（`0 20 * * *`）は毎晩ぶれる。本番の実測:

| 晩 | 実際に走った時刻(UTC) |
| --- | --- |
| 09-07 | 22:26 |
| 09-08 | 22:16 |
| 09-09 | 22:09 |

09-08 に見つけた配信の `next_retry_at` は 09-09 の 22:16。
翌晩のジョブは 22:09 に動いたので、**7分足りずに拾われなかった。**
そのまま7日が過ぎれば、もう誰も見ない。

**手前に置く直しは入っている**（#249 で `next_retry_at` を
`first_seen_at + 24時間 - 3時間` にした）。これから見つける配信は拾われる。
**すでに WAITING で固まっている28本は、それでは動かない。**
`first_seen_at` が7日より古いので、クエリの対象に入らないため。

WAITING が残っているぶんだけ、**チャットの1件も無い配信日**が増える。
その日は「誰も来なかった日」ではなく「誰が居たか読めていない日」で、
数え方は次のとおり。

### `chat_messages` — コメント1件＝1行

| 列 | 型 | 中身 |
| --- | --- | --- |
| `video_id` | STRING | どの配信か |
| `event_id` | STRING | YouTube 側のID（`video_id` と合わせて一意） |
| `event_type` | STRING | `TEXT` / スパチャ / メンバーなど |
| `timestamp_usec` | INT64 | 配信開始からのマイクロ秒 |
| `published_at` | TIMESTAMP | 書き込まれた時刻 |
| `author_name` | STRING | 表示名（変わることがある） |
| `author_channel_id` | STRING | チャンネルID（**人の同一性はこれで見る**） |
| `message_text` | STRING | 本文 |
| `message_runs_json` | JSON | 絵文字などを含む元の構造 |
| `purchase_amount_text` | STRING | スパチャの金額表記 |
| `ingest_run_id` / `ingested_at` / `source_file` / `source_line_no` | | 取り込みの記録 |
| `raw_item_json` | JSON | 元データそのまま |

取り込みは `MERGE`（べき等）。同じ配信を何度流しても増えない。

### `doneru_donations` — Doneru の寄付1件＝1行

**スパチャは `chat_messages` に入っているが、Doneru 経由の寄付はどこにも無かった。**
`functions/src/doneruAmount.ts` で取れるのは合計額だけで、誰がいつ出したかは取れない
（`docs/nordic-fund.md` 2.2 / 2.3）。ここがその置き場所。

| 列 | 型 | 中身 |
| --- | --- | --- |
| `donation_id` | STRING | Doneru 側のID（主キー）。無ければ中身の SHA-256 |
| `donated_at` | TIMESTAMP | 出された時刻（UTC） |
| `donor_name` | STRING | 表示名 |
| `amount` | NUMERIC | 視聴者が払った額 |
| `settlement_amount` | NUMERIC | **手数料を引いた、実際に振り込まれる額**（`amount` の約95%） |
| `amount_text` | STRING | 元の表記（`¥1,000` など） |
| `currency` | STRING | 通貨（本番データでは全件 NULL＝円） |
| `message_text` | STRING | 添えられた言葉 |
| `status` | STRING | `振込完了` / `振込待ち` |
| `viewer_pk` | STRING | **人の同一性はこれで見る**（`chat_messages.author_channel_id` と同じ役目） |
| `fetched_start` / `fetched_end` | DATE | どの期間を訊いて取れた行か |
| `ingest_run_id` / `ingested_at` | | 取り込みの記録 |
| `raw_json` | JSON | 元データそのまま |

入れているのは `python/fetch_doneru_donations.py`（`.github/workflows/fetch_doneru_donations.yml` が毎日 5:30 に回す）。

**取っているのは CSV。** `/streamer/donation-list/csv?start=...&end=...` を1回叩く。
画面が使っている JSON の一覧（`?year=...`）から移した。あちらは**年でしか切れず**、
データの無い年を訊くと**ページ送りを無視して同じページを返し続ける**。
CSV は日付範囲で切れてページ送りが無いので、その両方が消える。

既定の期間は**去年の元日から明日まで**。

- 去年から: 年をまたいだ直後でも去年の大晦日が必ず入る。1回の往復で全部返るので、
  1年ぶん多く取っても代金はほとんど変わらない
- 明日まで: `end` が含まれるのか分からないので、**取りこぼさない側に倒す**。
  1日多く訊いて空が返るほうが、今日ぶんを落とすより安い

過去ぶんは `workflow_dispatch` の `since` に年を入れて流す
（`since=2024` なら 2024 年の元日から今日まで）。
`donation_id` で `MERGE` するので、何度流しても増えない。

#### Doneru の CSV は壊れている（いちばん時間を取られたところ）

**メッセージの中のカンマ・改行・引用符をエスケープしていない。** 引用符は
使っているのに、メッセージの中の `"` をそのまま出すので、そこで引用が
終わったことにされる。素直に読むと行がずれる。

本番で順に踏んだもの:

| 何が起きるか | 症状 |
| --- | --- |
| メッセージに改行 → 1件が2行に割れる | 後半が別の寄付として入る（日付も金額も無い行が4件） |
| メッセージにカンマ → 列が増える | ヘッダー8列に対して14列。取得ごと落ちる |
| 末尾の列が空 → 列が減る | 「割れた行」と誤認すると**本物を消す**（2025 が 568→566 になった） |
| 1行目だけで既に8列超え | 「完全な行」と誤認して、続きを別の寄付にする |
| メッセージの中の `"` | そこから次の `"` までが1つのセルに飲まれる |

**組み直しの規則は1本にまとめてある**（`python/doneru/client.py`）。

1. 引用符は**解釈する**（ヘッダーにも付いている。切ると 6802 列に割れる）
2. **日時の列が日付の形をしている行**を1件の始まりとみなす
3. 次の始まりが来るまでを1件として集める
4. つないで、はみ出したぶんはメッセージに畳み、足りないぶんは空で埋める

**長さで「完全な行か」を決めてはいけない。** はみ出しも不足も両方あるので、
長さは何も保証しない。切れ目は「次が始まったか」でしか決まらない。

組み直した件数はログに出る。**0 でなくなったり急に増えたりしたら、
向こうの出し方が変わった合図。**

**メッセージの中の `"` だけは直しようがない。** どこまでがメッセージで
どこからが次の列か、情報として区別が付かない。いま1件それがあり、
`精算状態` の列にメッセージが流れ込んでいる。金額と日時は正しいので
件数にも合計にも影響しない。元は `raw_json` にある。

**ヘッダーは日本語。** キー名を突き合わせるときに英数字以外を捨ててはいけない
（`日時` も `名前` も `金額` も空文字になって、どの候補にも当たらなくなる）。
`normalizer._key` は空白と区切り記号だけを落とす。

**文字コードを決め打ちしない。** UTF-8 BOM でも Shift_JIS(cp932) でも読めるようにしてある。

**毎日「その年を全件」取り直しているので、止まっても欠けない。**
何日止まっていても、直して1回流せば止まっていた期間ごと埋まる。
差分を積む作りにしていないことが、そのまま復旧のしやすさになっている。

**列名は決め打ちしていない。** Doneru に公開 API は無く、画面が叩いている API を
そのまま使っているので、向こうの都合で名前が変わりうる。候補名を並べて当たったものを
使い、当たらなくても `raw_json` に丸ごと残す。形を見るには:

```bash
DONERU_COOKIE=... python python/fetch_doneru_donations.py --probe   # キー名と件数だけ出る
```

**この表から金額の順位表を作らない。** 出す人は60人しかいないので上位が常連で固定される。
理由は `docs/nordic-fund.md` の「やらないことにした案」にある。人数と合計のための原本。

#### 名前で人を数えない

**`donor_name` で数えると人数が増える。** 本番の967件を名前で数えると45人、
`viewer_pk` で数えると28人。同じ人が名前を変えて投げている。
`chat_messages` で `author_channel_id` を見ているのと同じ理由。

#### 手元のメモと照合する

**どの数字と突き合わせるかを先に決める。** 3通りあって、金額が違う。

| 見たいもの | 使う列 | 絞り |
| --- | --- | --- |
| 視聴者が出してくれた額 | `amount` | なし |
| 実際に振り込まれる額 | `settlement_amount` | なし |
| もう入金された額 | `settlement_amount` | `status = '振込完了'` |

```sql
SELECT
  EXTRACT(YEAR FROM DATETIME(donated_at, 'Asia/Tokyo')) AS year,
  status,
  COUNT(*) AS count,
  COUNT(DISTINCT viewer_pk) AS people,
  SUM(amount) AS paid,
  SUM(settlement_amount) AS settlement
FROM `live-streaming-d3cac.youtube_chat.doneru_donations`
GROUP BY year, status
ORDER BY year, status
```

**通貨が混ざっていないか先に見る。** スパチャには外貨が2件混ざっていた
（`docs/nordic-fund.md` 2.3）ので、Doneru も同じ可能性がある。
本番の967件では全件 NULL（円）だった。

```sql
SELECT currency, COUNT(*) AS count, SUM(amount) AS total
FROM `live-streaming-d3cac.youtube_chat.doneru_donations`
GROUP BY currency
```

`amount` が NULL の行があれば、そこは `amount_text` の形が読めていない。
`raw_json` に元が残っているので、`python/doneru/normalizer.py` の候補名か
金額の読み取りを直せば作り直せる。

```sql
SELECT COUNT(*) FROM `live-streaming-d3cac.youtube_chat.doneru_donations`
WHERE amount IS NULL OR donated_at IS NULL
```

#### 作り直す

取り方が変わって列が変わったときは、古い行を混ぜない。
`workflow_dispatch` の `recreate` を true にすると、取り込む前に
`doneru_donations` を `DROP` してから作り直す（`TRUNCATE` ではなく `DROP`。
列の並びごと作り直したいので）。

**`doneru_ingest_runs` は消えない。** あれは寄付ではなく実行の記録で、
取り方が変わっても過去に何日セッションが持ったかの意味は変わらないため。

### `doneru_ingest_runs` — 取り込みを試した記録1回＝1行

**セッションが何日持ったかを測るために置いてある。** 落ちたことは Actions の
通知メールで分かるが、いつからいつまで生きていたかはどこにも残らない。
`_dt` を入れ直す頻度を決めるには寿命が要る。

| 列 | 型 | 中身 |
| --- | --- | --- |
| `run_id` / `ran_at` | STRING / TIMESTAMP | いつの実行か |
| `outcome` | STRING | `ok` / `session_expired` / `error` |
| `period` | STRING | 取りに行った期間（`2025-01-01..2026-09-07`） |
| `donations` | INT64 | 入れた件数 |
| `cookie_shape` | STRING | `_dt` の長さの判定（**値は入れない**） |
| `renewed_dt` | BOOL | Doneru が `_dt` を配り直したか |
| `detail` | STRING | 失敗の理由 |

**落ちたときこそ残す。** 何日持ったかは、成功と失敗の両方が並んで初めて出る。
`--probe` と `--dry-run` は本番の実行ではないので残さない。
記録そのものが失敗しても取り込みは落とさない（記録は本題ではない）。

#### 寿命を見る

```sql
SELECT
  DATE(ran_at, 'Asia/Tokyo') AS day,
  outcome,
  COUNT(*) AS runs,
  MAX(donations) AS donations
FROM `live-streaming-d3cac.youtube_chat.doneru_ingest_runs`
GROUP BY day, outcome
ORDER BY day DESC
```

`ok` が続いたあと `session_expired` が出たら、そこがそのセッションの終わり。
**最後の `ok` と最初の `session_expired` のあいだが寿命**（日次で回しているので
精度は1日）。入れ直すたびに1本ぶんの寿命が記録に増えていく。

```sql
-- 直近の「入れ直しから切れるまで」
SELECT
  MIN(ran_at) AS alive_from,
  MAX(IF(outcome = 'ok', ran_at, NULL)) AS last_ok,
  TIMESTAMP_DIFF(
    MAX(IF(outcome = 'ok', ran_at, NULL)), MIN(ran_at), HOUR
  ) AS lasted_hours
FROM `live-streaming-d3cac.youtube_chat.doneru_ingest_runs`
WHERE ran_at > (
  SELECT IFNULL(MAX(ran_at), TIMESTAMP('1970-01-01'))
  FROM `live-streaming-d3cac.youtube_chat.doneru_ingest_runs`
  WHERE outcome = 'session_expired'
)
```

#### Doneru のセッションを入れ直す

認証はブラウザの cookie（`_dt`）だけ。**切れたら自動では戻せない**（ログインが
Google OAuth なので Actions の中では通せない）。切れると
`fetch_doneru_donations` が終了コード 2 で落ちるので、**Actions の失敗通知メール**で気づく。
ログの `::error::` に理由が出るため、他の失敗と区別が付く。

**あやとが Doneru からログアウトすると、その時点で切れる。** これは Doneru が
サーバ側でセッションを破棄している証拠なので、直すべき欠陥ではない
（ログアウトしても生き続けるほうが危ない）。付き合う制約として扱う。
止まっているあいだのデータは、入れ直して1回流せば埋まる。

ログの `貼られている値の形` が「Doneru の形と一致」なのに 401 なら、
貼り損ねではなくセッションのほう。ログインし直して取り直す。

1. ブラウザで https://doneru.jp にログインする
2. DevTools > Application > Cookies > `https://doneru.jp` の `_dt` の値をコピーする
3. Settings > Secrets and variables > Actions の `DONERU_COOKIE` を更新する
4. `Fetch Doneru Donations` を `workflow_dispatch` で流し直す

`_dt` は**どの IP からでも寄付一覧が読める鍵**。Secrets 以外の場所に置かない。
`cf_clearance` や `_ga` などは要らない（貼っても捨てられる）。

### 出席の数え方 — 読めていない日は、出席にも分母にも入れない

`python/build_residents.py`（直近90日）と月末の表彰で使う。

- **日ごとに数える。** 同じ日に2本配信していても1日
- **配信日は UTC で切る**（日本時間の朝9時が境目。22時開始の枠と、0時を
  またいだ続きが同じ日に入る）
- **取り込めていない配信日は、出席にも分母にも入れない**

3つめの「取り込めていない日」は、**その日の配信がどれも `SUCCEEDED` に
なっていない日**。取り込みは通ったのにコメントが1件も無かった日
（`SUCCEEDED` なのにチャット0。本番に1日ある）は**本物の0**なので、
分母には入れる。読めていないのと0だったのを混ぜないのは、こちら向きも同じ。

3つめが `docs/island-standards.md` 10（読めていないことを、値0と同じ絵に
しない）そのもの。前は「初コメントがその日以前の人を、その日は全員出席と
みなす」にしていた。**読めていないものを「居た」と言い切っている。**

そして実害が出ていた（2026-09-10 の実測、直近90日）:

| | 日数・人数 |
| --- | --- |
| 配信のあった日 | 87日 |
| チャットの残っている日 | 83日 |
| チャットが1件も無い日 | 6日 |
| 期間内にコメントした人 | 318人 |
| 本当に5日以上いた人 | **59人** |
| 読めない6日を全員に足したときの人数 | **174人** |
| 1日しかコメントしていない人 | 200人 |
| **うち「常連」に数えられていた人** | **72人** |

読めない日が6日あると、1日＋6日＝7日で常連の線（5日）を超える。
**1回来ただけの人が72人、常連として数えられていた。**

**分母は「読めた日」にそろえる**（配信のあった日ではない）。
`videos` に開始時刻が無いのにチャットだけある日が本番に2日あるので、
配信日で割ると出席が分母を超える人が出る。

全期間で見ると、配信はあったのにチャットが1件も無い日は30日ある。
内訳は **WAITING が15日**（2026-02-06〜09-09）、FAILED が14日、
そして「取り込めたのに本当に0だった日」が1日。
**WAITING を拾い直せれば、15日は読めるようになる。**

#### 常連の数は3か所で数えている。**食い違わせない**

| どこ | 期間 | 日の切り方 | 読めない日 |
| --- | --- | --- | --- |
| `python/island_daily_stats.py` → `island/state.stats.activeFriends` | 直近90日 | 日本時間 | 足していない |
| `python/build_residents.py` → `ACTIVE_FRIENDS`（焼き込み） | 直近90日 | UTC | 足していた → **やめた** |
| `python/island_channels.py` → `islandChannels.days` | 全期間 | 日本時間 | 足していない |

画面に出るのは1つめ（本番の実測で60）。**焼き込みは、それが読めなかった
ときの受け皿。** 直す前の数え方のまま焼き直すと受け皿が174になるので、
`/state` が読めない人にだけ「住人174人」と出る。
**読めなかったときに数字が3倍になる受け皿**は、受け皿ではない。

`.claude/skills/monthly-review/SKILL.md` 3章にはまだ古い決めごと
（コメント消失日は当時すでに来ていた人を出席扱い）が残っている。
**月末の表彰も同じ直しが要る。** あちらは皆勤賞の分母にもなるので、
直すと皆勤の顔ぶれが変わる。

### ここから作るもの

| スクリプト | 出す先 | 何を |
| --- | --- | --- |
| `python/island_daily_stats.py` | Firestore `island/state.stats` | 配信本数・配信日数・コメント数・のべ人数・直近90日の常連の数 |
| `python/build_city_streams.py` | `site/content/cityStreams.ts` | 国と街ごとの代表配信（滞在期間とキーワードで割り当て） |
| `site/content/chatter.ts` | 手で | 住人のセリフの元ネタ（口調を写すために読む） |

---

## 2. Firestore

### `island/state` — 島の状態（1ドキュメントだけ）

```
island/state
  stats: {
    streams: number         配信本数
    streamDays: number      配信した日数
    since: "YYYY-MM-DD"     最初の配信日
    comments: number        コメント総数
    people: number          のべ人数
    activeFriends: number   直近90日で5日以上来てくれた人
    recentPeople: number    直近90日に来た人
    latest: [{ videoId, title, date }]   最近の配信5本
    updatedAt: number
  }
  current: {
    place: "ジョージア・トビリシ"   いまいる場所
    word: string                    ひとこと
    week: string[]                  今週やること
    theme: string                   今月のテーマ
    updatedAt: "YYYY-MM-DD"
  }
```

`stats` は `island_daily_stats.py` が毎日書く。
`current` は `island_set_current.py` であやとが手で書く。

### `islandStreamEvent/{id}` — 企画（旧 `islandNextPlans`・#202）

**#202 で `islandNextPlans` から改名した。** 「これから」だけのものでは
なくなったため。**北欧◯日目も、もう終わった企画も、同じ入れ物に入る。**
そうしないと、カードを企画に紐付けられない。

**口（API）の名前は `/nextplans` のまま。** Functions と Hosting は別々に
手で起動する（`CLAUDE.md`）ので、入れ物と口を同じ日に変えると、片方が
先に出た日に掲示板がまるごと 404 になる。畳むのは画面が移ってから。

**「一言の提案」と「ページ1枚の下書き」は、同じもの**（#161）。
前は `islandIdeas`（120字・ログイン不要）と `islandDrafts`（12,000字・ログイン必須）に
割れていて、**一言を出したあと下書きへ進む道が無かった。**
題ひとつで出して、あとから育てられる1つの入れ物にしてある。

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `title` | string | 題（60字まで）。**これだけあれば出せる** |
| `when` `date` | string | 画面に出す言い方と、数えるための日（YYYY-MM-DD） |
| `note` | string | ひとことで言うと（200字まで） |
| `tags` | string[] | ふだ（6つまで） |
| `place` | object | `{ name, area, map }` |
| `about` | string[] | どんなものか。段落ごと |
| `links` | object[] | `{ label, href }` |
| `photos` | object[] | `{ src, alt, credit, creditHref }` |
| `embeds` | object[] | `{ kind, id, note }` |
| `by` | string? | 名乗った名前（なくてもいい） |
| `uid` | string? | ログインして出していれば、その人 |
| `cid` | string | 端末ID。**「あとから直す鍵」でもある**（下） |
| `hearts` | number | ハートの数。仕組みは付箋とまったく同じ（`islandHearts`） |
| `status` | string | `proposed`（提案）→ `next`（これから）→ `done`（やった） |
| `planId` | string? | 立ったページの id（`content/plans.ts` の `PLANS` / `LEGENDS`） |
| `videoIds` | string[] | **この企画のものだと決めた配信**（#202）。あやとだけが足せる |
| `source` | string? | `git-plan` / `nordic-day`。運営側が種から入れた行の印 |
| `board` | boolean? | `false` なら掲示板の一覧に出さない。**`hidden` とは別**（`hidden` にするとカードの組み立てからも落ちる） |
| `archived` | boolean | しまってあるか。**消さずにしまう。戻せる**（あやとだけ） |
| `hidden` | boolean | 隠すとき（管理スクリプトから） |
| `createdAt` / `updatedAt` | number | ミリ秒 |

**1件12,000字まで。1日12件まで。**

#### あとから直せるのは誰か

ログイン不要にした以上、本人の証は端末の印（`cid`）しか無い。
印を推測できれば他人の企画を直せるので、**時間で縛る**（あやと承認済み・#161）。

| 出したとき | 直せるのは |
| --- | --- |
| ログインしていた（`uid` がある） | その `uid` の人だけ。いつでも |
| ログインしていなかった | 同じ `cid` の端末だけ。**出してから24時間だけ** |
| — | あやと（`admin`）はいつでも |

`cid` は `crypto.randomUUID()`（36文字・122ビット）。鍵として使うときは
長さで縛る（`isStrongCid`）。8文字でも通る `isCid` は、連投を数えるためのもので、
そのままでは鍵に使わない。

**`cid` を画面に返さない。** 返すと、それを見た人が他人の企画を直せる。
`firestore.rules` でこのコレクションを deny にしているのも同じ理由。

#### `status` と Git 側の企画の関係

段を動かせるのはあやとだけ（`POST /island-api/nextplans/{id}/status`）。
「これから」に上げるときは `planId` で Git 側の企画に結び付ける。
**結び付けないと、掲示板に出た提案と、実際に立っているページが他人のままになる。**

| 段 | 島のどこに出るか |
| --- | --- |
| `proposed` | `/board` の一覧 |
| `next` | `/board` に「これから」と出て、`planId` のページ（`/next` ほか）へ行ける |
| `done` | `/board` に「やった」と出て、`LEGENDS` のページへ行ける |

**Git 側の企画1つに、結び付く行は1つだけ。** しまってある行は数えない。
`POST /nextplans/{id}/status` は、その `planId` を別の行が持っていたら 409 で断る。

これは実際に破れていた。#202 の種入れ（`python/admin/streamevents_import.py`）が、
**同じ企画がもう掲示板に提案として出ていることを見ずに**もう1件作って、
ジョージアバイバイと海外出発二周年が2行になった。掲示板に出るほう（人が出した行）は
`planId` を持たないので、**清書してページが立っても「提案」の札のまま**で、
カードの付く行だけが別に「これから」になっていた。

- 種は、その `planId` を持つ行がもうあれば作らない
- 二重になっているものを畳むのは `python/admin/plans_relink.py`
  （**掲示板に出ているほうを残す。** 人が書いた行で、ハートも名前も付いている）
- 段と Git 側が食い違っている行は、`/board` であやとにだけ「食い違っている」と出る
  （`site/components/live/Board.tsx` の `gitPlanLike`）

### `islandIdeas/{id}` — 掲示板に貼られた提案（旧・#161 で役目が終わった）

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `text` | string | 提案（200字まで） |
| `name` | string | 名乗った名前（なくてもいい） |
| `uid` | string? | ログインしていれば、その人 |
| `cid` | string | 端末ID（連投を止めるため） |
| `votes` | number | いいねの数 |
| `movedTo` | string? | 付箋へ移した先（#162） |
| `hidden` | boolean | 隠すとき |
| `createdAt` | number | ミリ秒 |

**本番の8件は #162 で全部付箋（`islandNotes`）へ移り、`hidden: true` が付いている。**
表に出るものは0件。**口は畳んだ（#171）。** `GET/POST /ideas` も
`POST /ideas/:id/vote` も、もう無い。`/state` も `ideas` を返さない。

**入れ物は残す。書いた人の字なので消さない。** `firestore.rules` は deny のまま。

### `islandNotes/{id}` — 付箋

**1つの入れ物に、2つの形が入っている。** 見分けるのは `planId` があるか
`theme` があるかで、読む口（API）も別（`/notes` と `/stickies`）。

#### テーマに貼られた付箋（#160。これから増えるのはこちら）

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `theme` | string | 宛先。`content/themes.ts` の id（`nordic` `lithuania` `island`…） |
| `text` | string | 中身（120字まで） |
| `by` | string? | 名乗った名前（なくてもいい） |
| `cid` / `uid` | string | 端末ID／ログインしていれば本人 |
| `hearts` | number | ハートの数。`islandHearts` の書類の数と同じになる |
| `byOwner` | boolean | 運営者が立てた付箋か。**おたずねの選択肢がこれ** |
| `reply` / `repliedAt` / `repliedBy` | string / number / string | あやとからの返信。1枚に1つ。消す・直すもできる |
| `archived` / `archivedAt` / `archivedBy` | boolean / number / string | しまってあるか。**消さずにしまう。戻せる** |
| `hidden` | boolean | 隠すとき（管理スクリプトから） |
| `createdAt` | number | ミリ秒 |

**コレクションを階層分けしていない。** `islandNotes/{theme}/notes/{id}` にすると、
テーマ横断で新着を見るときに全テーマを舐めることになるし、テーマは
あとから増える。平らのまま `where("theme", "==", ...)` で引く
（#160 に理由が3つ書いてある）。そのぶんの複合インデックスは
`firestore.indexes.json` にある。

- `theme` 昇順 + `createdAt` 降順 + `__name__` 降順 … テーマの中を新しい順。
  `__name__` を明に書いてあるのは、同じミリ秒に2件入ったときページの境目で
  1件飛ぶのを止めるため、読む側が書類IDでも並べているから（`pageOf`）
- `theme` 昇順 + `hearts` 降順 … テーマの中を押された順（国のページ）

**おたずね（`islandPolls` / `islandPollVotes`）の行き先がここ。**
「運営者が立てた付箋（`byOwner: true`）に、みんながハートを押していく」形に置き換わる。

| いまの poll | 統合後 |
| --- | --- |
| `question` | テーマの表示名、または運営者の付箋1枚 |
| `options[{id, label}]` | `byOwner: true` の付箋が2〜4枚 |
| `votes[id]` | 各付箋の `hearts` |
| `openUntil` | テーマ側に締め切りを持つ |

**入れ物は #160 でできているが、まだ中身が移っていない。**
移すのは #162。それまで `GET /poll` と `GET /fork` は今までどおり動く
（画面と API を同時に切り替えて壊さない）。

#### 企画に貼られた付箋（旧。移行待ち）

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `planId` | string | どの企画への付箋か |
| `text` | string | 中身（120字まで） |
| `cid` | string | 端末ID |
| `hidden` | boolean | 隠すとき |
| `createdAt` | number | ミリ秒 |

### `islandTips/{tipId}` — 投げ銭の台帳（#202）

**YouTube のスパチャと Doneru の寄付を1本にしたもの。**
あやと島カードはここから組み上がる。`python/island_tips.py` が毎日置く。

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `sourceEventId` | string | 元のID。`yt:<videoId>:<eventId>` か `doneru:<donationId>`。**一意** |
| `source` | string | `youtube_superchat` / `doneru` |
| `channelId` | string \| null | YouTube のチャンネル。Doneru は `islandDonors` を通して引く。紐付いていなければ null |
| `day` | string | **日本時間で切った配信日**（YYYY-MM-DD） |
| `donatedAt` | number | 出された時刻（ミリ秒） |
| `videoId` | string? | どの配信か。Doneru は持っていない |
| `videoStartedAt` | number? | その配信が始まった時刻。0時をまたいだぶんを人が拾うときに要る |
| `amount` | number | 視聴者が払った額 |
| `currency` | string | `JPY` ほか。**外貨が混ざる**（本番の380件に ₪ と CA$ が1件ずつ） |
| `settlementAmount` | number? | 手数料を引いた額（Doneru だけ） |
| `displayNameSnapshot` | string? | そのときの表示名 |
| `viewerPk` | string? | どねID（Doneru だけ） |
| `createdAt` / `updatedAt` | string | ISO8601 |

**書類IDは `sourceEventId` の SHA-1 の頭32文字。** 生の値を使わないのは、
YouTube の `event_id` が Base64 風で `/` を含みうるから。
**同じ寄付なら毎回同じIDになるので、流し直しても増えない。**

#### 配信日の境目は日本時間の0時

旧 `nordicDays` は `published_at` から**9時間引いていた**（＝日本時間の
18時が境目）。旅で時差が9回変わるとそのたびに1日が2つに割れる（#201）。
`DATE(donated_at, "Asia/Tokyo")` に固定して、**またいだぶんは人が決める**
（`islandStreamEvent.videoIds` に後半の動画IDを足す）。

実際にまたいでいる配信がある。`MoxSgyW_12k` は 8/30 と 8/31 の両方に
スパチャが入っている。**境目をどこに置いても、機械には割れる。**

#### 金額は持つ。ただし外に出さない

`amount` を持つのは、いままで意図的に避けていたことの反転
（#202 で承認）。Doneru と突き合わせるのに要る。**代わりに2つ守る。**

1. **島の画面で、金額で並べない・出さない。** 決めは生きている
   （`docs/nordic-fund.md`。出す人は60人しかいないので、上位は常連で
   固定され、320円が1万円の隣に並ぶ）
2. **`firestore.rules` で閉じてある。** 誰がいくら出したかは、本人以外に
   見えてはいけない。読むのは Functions と日次ジョブだけ

台帳から画面へ出る口は `channelsOfDay`（`functions/src/streamEvents.ts`）
1つだけで、そこは**チャンネルIDしか持ち出さない。**

### `islandStreamEventImage/{imageId}` — 企画に付く画像（#202）

旧 `nordicPhotos`。**書類IDは移行の前後で変えない。** カードのIDが
`<画像のID>__<チャンネルID>` なので、変えると動かしてあるカードがはぐれる。

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `streamEventId` | string | どの企画のものか。空なら、まだ決まっていない |
| `role` | string | `card` / `gallery` / `cover`。**カードになるのは `card` だけ** |
| `day` | string | その日（YYYY-MM-DD）。旧 `/nordic` が日ごとに並べるのに使う |
| `storagePath` | string | Cloud Storage の道 |
| `url` | string | 合言葉つきの URL |
| `w` / `h` | number | 寸法 |
| `note` | string | 一言（120字まで） |
| `takenAt` | string? | 撮った日 |
| `sortOrder` | number? | 並び |
| `uid` | string | 貼った人（あやと） |
| `at` / `createdAt` / `updatedAt` | | 時刻 |

**書く口は当分2つ動かす。** `POST /nordic/photos`（旧・日付から入る）と
`POST /streamevents/{id}/images`（新・企画から入る）。前者は中で両方に
書く。旅で毎日使っているものを出発直前に作り替えない（#202 の順番）。

**1枚は1つの企画にしか付かない。** 1日に企画は何本でも立つので、
貼るときの既定は「その日のいちばん古い企画」。あとから
`POST /streamevents/images/{id}` で付け替えられる（カードも作り直す）。

### `islandCards/{cardId}` — 配られたカード（#173・#202 で作り直し）

**#202 から「置いてある」。** 前は読むたびに写真と名簿から組み立てて
いて、ここに入るのは「本人が動かしたぶんの上書き」だけだった。

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `channelId` | string | もらった人 |
| `streamEventId` | string | どの企画のカードか |
| `streamEventImageId` | string | どの画像か |
| `day` | string | その日（YYYY-MM-DD）。画面が企画の札を引く |
| `earnedAt` | number | もらった時刻（＝投げ銭の時刻） |
| `x` / `y` / `rot` / `scale` | number | 置き方。`y` は**足元**の高さ |
| `movedBy` / `movedAt` | | 本人が動かしたときだけ |
| `createdAt` / `updatedAt` | number | ミリ秒 |

**書類IDは `<画像のID>__<チャンネルID>`。** 決め打ちなので、
2か所から作っても同じ書類になる。

| いつ作るか | 誰が |
| --- | --- |
| 画像を貼ったとき | `functions/src/streamEvents.ts` の `mintForImage` |
| 毎日 | `python/island_cards.py` |

**両側から埋めて、どちらが先でも同じ結果になるようにしてある。**
片方だけだと、「画像が先で投げ銭が後」の日か「貼った夜」のどちらかが空になる。

#### 平置きにしてある

`islandChannels/{channelId}/cards/{cardId}` にはできない。`/cards`
（島じゅうのカードを新しい順）にコレクショングループ索引が要るが、
**うちは索引を作れない**（#168）。平置きなら

- 島じゅう → `orderBy("earnedAt","desc")`（単一フィールド）
- その人の → `where("channelId","==",…)`（同じく単一フィールド）

**どちらも索引を足さずに引ける。**

#### 企画と配信は N:N

**1本の配信に企画が何本も乗る。** 9月11日は「北欧旅の出発日」
「海外出発二周年」「ジョージアバイバイ」の3本。だから
「`videoId` → その配信の企画」を**1本に決めない。**
当たった企画すべてについて、その企画のカード画像ぶんカードを作る。

当たり方は2つあって、**両方を足す**（片方で打ち切らない）。

1. その企画が `videoIds` でこの配信を名乗っている
2. 企画の日付と、投げ銭の日（日本時間）が同じ

**1で当たったら2を見ない、にしない。** あやとが `videoIds` を足すのは
たいてい1本だけなので、そこで打ち切ると残りのカードが黙って消える。

### `islandHearts/{key}` — 誰がどの付箋にハートを押したか

ドキュメントIDは `` `${noteId}_${uid ?? cid}` ``。**ログイン不要で、解除できる。**
**消す＝解除**なので、票（`islandVotes`）と違って「押した」を数える側ではなく
書類の有無で持つ。数そのものは `islandNotes.hearts` にある。

**企画（`islandNextPlans`）のハートも、同じ入れ物・同じ形のIDを使う**（#161）。
書類IDは Firestore の自動IDなので、付箋と企画でぶつかることはない。
入れ物を分けなかったのは、1日の上限（`heart`）と「消す＝解除」の作りを
2つに割らないため。

| 項目 | 型 |
| --- | --- |
| `at` | number（押した時刻） |
| `note` | string（どの付箋か。付箋のとき） |
| `plan` | string（どの企画か。企画のとき） |

### `islandVotes/{key}` — 誰がどれに投票したか（旧・#171 で口が消えた）

ドキュメントIDは `` `${ideaId}_${uid ?? cid}` ``。1人1票にするためだけのもの。
`/ideas/:id/vote` を畳んだので、**もう増えない。** 13件のまま残してある。

### `islandRate/{key}` — 1日の上限

ドキュメントIDは `` `${kind}_${YYYY-MM-DD}_${uid ?? cid}` ``。

| 項目 | 型 |
| --- | --- |
| `n` | number（その日の回数） |
| `kind` | string（plan / idea / note / sticky / heart / draft / poll / fork / visit） |
| `day` | string |
| `updatedAt` | number |

上限は 企画12件 / 付箋20件 / ハート120回 / 日（`plan` は出すのも育てるのも同じ枠）。
ハートは**解除も1回ぶん使う。** 使わないと、同じ付箋で押す・外すを
繰り返して書き込みを無限に起こせる。

### `islandChannels/{channelId}` — チャンネルIDと、名前と写真（#190・#202）

配信に来たことがある人ぶん（2,200人以上）。`python/island_channels.py` と
`python/island_channel_photos.py` が毎日置く。

| 項目 | 型 | 中身 | 誰が |
| --- | --- | --- | --- |
| `name` | string | いま名乗っている名前 | `island_channels.py` |
| `lastAt` | string | 最後に喋った時刻 | 同上 |
| `photo` | string \| null | **YouTube のプロフィール写真** | `island_channel_photos.py` |
| `photoAt` | string | 写真を入れた時刻 | 同上 |
| `updatedAt` | string | | |

#### `photo` はカードの絵ではない

**混ぜないこと。** アイコンは2つあって、出どころも意味も違う。

| | 何 | どこが正 |
| --- | --- | --- |
| キャラクター | カードに乗る絵（ひめひめさんのハリネズミ） | あやとのスプレッドシート（`site/content/residents.ts` に焼いてある） |
| プロフィール写真 | YouTube のアイコン | `islandChannels.photo` |

キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
変わらないのが正しい。** `photo` はマイページのアイコンが古くならない
ようにするためのもの。

#### 毎日ぜんぶは引かない

`channels.list` は `id` を50件まとめて渡せる（1回＝1ユニット）ので、
2,200人でも45ユニットで済む。**それでも毎日ぜんぶは引かない。**
枠は Discovery（`search.list` は1回100ユニット）と どねID の紐付けと
分け合っていて、こちらが毎日45ユニット固定で乗ると、足りなくなった日に
真っ先に困るのは配信の探索のほうだから。

**1日500人まで（10ユニット）。** 順は
（1）ログインしたことがある人 →（2）まだ写真が無くて最近来た人 →
（3）残りをチャンネルID順に、日ごとに窓をずらして。
2と3は直近90日に来た人だけ。500人ずつなら5日で1周する。

**変わらなかった人には `photoAt` を書かない。** 書くと、変わっていない
500件ぶんの書き込みを毎日払うことになる。順に回すのは窓ずらしがやる。

### `islandUsers/{uid}` — ログインした人

| 項目 | 型 | 中身 | 誰が書くか |
| --- | --- | --- | --- |
| `name` | string | YouTube のチャンネル名 | ログイン時に自動 |
| `channelId` | string | YouTube のチャンネルID | ログイン時に自動 |
| `photo` | string | YouTube のアイコンURL | ログイン時に自動 |
| `nickname` | string? | 島で出す名前（本名以外にしたいとき） | 本人 |
| `character` | string? | 島にいる自分のキャラクター（Drive の画像ID） | 本人が選ぶ |
| `showName` | boolean | 名前を島に出すか | 本人 |
| `showPhoto` | boolean | YouTube アイコンを島に出すか | 本人 |
| `canDraft` | boolean | 企画ページの下書きを書いてよいか（旧。#161 で誰でも書けるようになり、#171 で**どこからも読まれなくなった**） | あやと（コンソール） |
| `admin` | boolean | 全員ぶんの下書きを読めるか | あやと（コンソール） |
| `firstSeenAt` / `lastSeenAt` | number | 初回と直近 | 自動 |

**`character` が入っていて、かつ `showName` か `showPhoto` のどちらかが true の人だけ**が
`GET /state` の `residents` に載る。何もしていない人の名前は絶対に出ない。

### `islandDrafts/{id}` — 企画ページの下書き（旧・#161 で役目が終わった）

中身の形は `islandNextPlans` と同じ（`uid` `by` `title` `when` `date` `note`
`tags` `place` `about[]` `links[]` `photos[]` `embeds[]` `createdAt` `updatedAt`）。
違うのは、**ログイン必須で、あやとが `canDraft` を立てた人しか書けなかった**こと。

**本番は0件**（2026-09-06 に数えた）。移すものは無かった。
**口は畳んだ（#171）。** `GET/POST /drafts` は、もう無い。

`islandUsers.canDraft` は、これで**どこからも読まれない欄**になった。
消していないのは、立ててある人に「前は書けた」という記録が残るのと、
消しても誰も得をしないため。**新しく立てる意味は無い。**

---

## 3. Git（`site/content/`）— 手で書くもの

レビューして育てたいものは、DB ではなくコードに置く。

### 3.1 手で書くもの

| ファイル | 中身 |
| --- | --- |
| `site.ts` | プロフィール・外部リンク・数字の焼き込み値（API が返るまでの控え） |
| `streamTypes.ts` | 配信の型5つ |
| `recipes.ts` | 作ってきた料理（**クッキング・スタンプ帳の元**） |
| `countries.ts` | 歩いた国と、滞在期間 |
| `chapters.ts` | 島の連なり（章）と、その期間 |
| `legends.ts` | 伝説の企画8つ |
| `apps.ts` | 作っているアプリ |
| `plans.ts` | これからの企画 |
| `chatter.ts` | 住人のセリフ |
| `voice.ts` | 画面に出る言葉ぜんぶ |
| `themes.ts` `directory.ts` `roulette.ts` `planDays.ts` | 島の景色・目次・ルーレット・日付から企画を引く表 |

### 3.2 焼くもの（自動生成。手で書き換えない）

**元のスクリプトを直してから作り直す。**

| 焼かれるもの | 元 | 回すもの |
| --- | --- | --- |
| `chapterStats.ts` `chapterStreams.ts` | BigQuery + `chapters.ts` | `python/build_chapter_stats.py` |
| `countryStats.ts` | BigQuery + `countries.ts` | `python/build_country_stats.py` |
| `cityStreams.ts` | BigQuery + `countries.ts` | `python/build_city_streams.py` |
| `onThisDay.ts` | BigQuery + `countries.ts` + `streamPeaks.ts` | `python/build_on_this_day.py` |
| `streamPeaks.ts` | BigQuery | `python/build_stream_peaks.py` |
| `residents.ts` | BigQuery + `python/residents_map.json` | `python/build_residents.py` |
| `kitchenTalk.ts` | BigQuery + `recipes.ts` + `residents.ts` | `python/build_kitchen_talk.py` |
| `legendDays.ts` | BigQuery + `legends.ts` | `python/build_legend_days.py` |
| `voices.ts` | BigQuery + `python/voices_picks.json` | `python/build_voices.py` |
| `shorts.ts` | `python/data/shorts.json`（手で足す表） | `python/build_shorts.py --build` |
| `nordic.ts` + `nordic/*.json` | 下ごしらえした JSON | `python/build_nordic.py` / `build_nordic_map.py` |
| `atlas/route.json` + `atlas/c/*.json` | 世界地図データ + `countries.ts` | `python/build_world_route.py` |
| `sprites.json` | `site/public/sprites/*.webp` | `tools/sprites/manifest.mjs` |
| `characterBox.ts` | 住人のキャラクター画像 | `tools/sprites/avatars.py` → `charbox.py` |

### 3.3 **ここを回すものは、どこにも無い**

**上の表のスクリプトは、ひとつも定時で走っていない。**
`.github/workflows/` で cron を持っているのは `schedule_fetch_chat.yml` と
`fetch_doneru_donations.yml` の2本だけで、どちらも **BigQuery と Firestore しか触らない**。
Hosting のデプロイ（`npm run build:web`）も python を1行も通さない。

つまり **BigQuery と Firestore は毎晩ひとりでに新しくなるのに、
`site/content/` は誰かが手で焼いて commit するまで、焼いた日のまま止まる。**
デプロイを何度しても、止まった中身がそのまま何度も出ていく。

**焼き直したかどうかは、ファイルの commit 日では分からない。**
別の理由で触られた日が付くだけで、中身は古いままのことがある。
中身の最新を見る（`chapterStats.ts` `chapterStreams.ts` は冒頭の「数えた日」、
`onThisDay.ts` は `LATEST_DAY`、ほかは中の日付のいちばん新しいもの）。

### 焼き込んである数字を新しくする

**毎晩ひとりでに新しくなるのは BigQuery と Firestore だけ。** `site/content/` に
焼き込んである数字は、cron でも Hosting のデプロイでも動かない
（`npm run build:web` は expo export → public コピー → next build で、python を1行も通らない）。
置いたままにすると、取り込みだけが進んで**画面の数字が止まる。**

新しくするのは Actions の **「島の数字を焼き直す」**（`.github/workflows/rebake.yml`）。
`workflow_dispatch` だけで、cron は付けていない。**押すもの。**

| スクリプト | 焼く先 | 元 |
| --- | --- | --- |
| `build_chapter_stats.py` | `chapterStats.ts` `chapterStreams.ts` | BigQuery |
| `build_residents.py` | `residents.ts` | BigQuery |
| `build_stream_peaks.py` | `streamPeaks.ts` | BigQuery |
| `build_on_this_day.py` | `onThisDay.ts` | BigQuery |
| `build_country_stats.py` | `countryStats.ts` | `python/data/country_stats.json`（取り置き） |
| `build_kitchen_talk.py` | `kitchenTalk.ts` | `python/data/kitchen_*.json`（取り置き） |

**下の2本は BigQuery を引かない。** 取り置きの JSON を焼き直すだけなので、
回しても数字は動かない。新しくするには先にその JSON を取り直す。

依存が2つある。`build_on_this_day` は `streamPeaks.ts` を読み、
`build_kitchen_talk` は `residents.ts` を読む。**焼く順はワークフロー側で固定してある。**

入力は3つ。`scripts`（空なら6本ぜんぶ。**allowlist に無い名前は走らずに落ちる**）、
`dry_run`（既定 **true**。何がどれだけ変わるかを出して終わる）、
`deploy`（既定 false。true なら commit のあと Hosting も起動する）。

`cityStreams.ts` はここに入れていない。**いまの中身は古い版のスクリプトで焼かれていて、
焼き直すと選び直しになる**（並びごと変わる）。入れる前に、選び方の変化を確かめる必要がある。
`nordic.ts` は元の JSON がリポジトリに無いので、そもそも回せない。

---

## 4. API（`/island-api/*`）

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/state` | 誰でも | 数字・いまいる場所・企画提案・付箋・名前を出す住人 |
| `GET` | `/nextplans` | 誰でも | 企画の一覧。`?archived=1` はあやとだけ。**`?events=1` で運営側の企画（`board: false`）も混ぜる** |
| `GET` | `/nextplans/:id` | 誰でも | 企画1件（育てる画面が続きを書くために引く） |
| `POST` | `/nextplans` | 誰でも | 企画を出す。**題だけでいい**（1日12件） |
| `POST` | `/nextplans/:id` | 出した人 | 育てる。**送った中身でまるごと置き換わる** |
| `POST` | `/nextplans/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/nextplans/:id/status` | あやとだけ | 段を動かす。`planId` で Git 側の企画に結ぶ |
| `POST` | `/nextplans/:id/videos` | あやとだけ | **この企画のものだと決めた配信**（#202）。URL を貼ってもよい |
| `GET` | `/streamevents?day=YYYY-MM-DD` | 誰でも | **その日に立っている企画**。1日に何本でも立つので配列 |
| `GET` | `/streamevents/:id/images` | 誰でも | その企画の画像 |
| `POST` | `/streamevents/:id/images` | あやとだけ | 画像を貼る。貼った時点でカードも作る |
| `POST` | `/streamevents/images/:id` | あやとだけ | どの企画のものかを付け替える。カードも作り直す |
| `DELETE` | `/streamevents/images/:id` | あやとだけ | 画像を消す。**カードも実体も消える** |
| `POST` | `/nextplans/:id/archive` | あやとだけ | しまう・戻す。**消えない** |
| `GET` | `/notes` | 誰でも | 企画に貼られた付箋（旧。移行待ち） |
| `POST` | `/notes` | 誰でも | 企画に付箋を貼る（旧。1日20件） |
| `GET` | `/stickies` | 誰でも | テーマに貼られた付箋。`?theme=` で1つ、無ければ横断の新着 |
| `POST` | `/stickies` | 誰でも | テーマに付箋を貼る（1日20件） |
| `POST` | `/stickies/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/stickies/:id/reply` | あやとだけ | 返信する。空で送ると取り消し |
| `POST` | `/stickies/:id/archive` | あやとだけ | しまう・戻す。**消えない** |
| `POST` | `/me` | ログイン済み | 島での見え方を保存する |

ログインしていない人は端末IDで数え、ログインした人は uid で数える。
端末を変えても同じ人として扱われるのはこのため。

**`/notes` と `/stickies` は、入れ物が同じで口が別。** 画面が切り替わっている
途中の日に、両方が混ざったものが両方の画面に出るのを止めるためで、
旧来のぶんが移り終わったら（#162）`/notes` を畳む。

**旧（`/ideas` `/drafts`）は畳んだ（#171）。** 残してあったのは同じ理由で、
Functions と Hosting を別々に手で起動する（`CLAUDE.md`）ので、片方だけ先に
出た日に掲示板がまるごと 404 になるのを避けるため。両方が本番に出て3日たった
ので、古い画面を開きっぱなしのタブも、もう残っていない。
