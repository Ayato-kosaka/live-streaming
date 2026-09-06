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
| `status` | STRING | 取り込みの状態（discovered / succeeded / failed） |
| `first_seen_at` | TIMESTAMP | 見つけた時刻 |
| `next_retry_at` | TIMESTAMP | 次に試す時刻 |
| `attempt_count` | INT64 | 試した回数 |
| `last_attempt_at` | TIMESTAMP | 最後に試した時刻 |
| `last_error_code` / `last_error_detail` | STRING | 失敗の理由 |
| `succeeded_at` | TIMESTAMP | 取り込めた時刻 |
| `yt_dlp_version` | STRING | 取り込みに使った版 |

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

### `islandNextPlans/{id}` — 企画（`/board`「企画をだす」・`/next/new`）

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
表に出るものは0件。読む口（`GET /ideas`）はまだ動いているが、
画面はもう見ていない。畳むのは #171。

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

### `islandVotes/{key}` — 誰がどれに投票したか

ドキュメントIDは `` `${ideaId}_${uid ?? cid}` ``。1人1票にするためだけのもの。

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
| `canDraft` | boolean | 企画ページの下書きを書いてよいか（旧。#161 で誰でも書けるようになった） | あやと（コンソール） |
| `admin` | boolean | 全員ぶんの下書きを読めるか | あやと（コンソール） |
| `firstSeenAt` / `lastSeenAt` | number | 初回と直近 | 自動 |

**`character` が入っていて、かつ `showName` か `showPhoto` のどちらかが true の人だけ**が
`GET /state` の `residents` に載る。何もしていない人の名前は絶対に出ない。

### `islandDrafts/{id}` — 企画ページの下書き（旧・#161 で役目が終わった）

中身の形は `islandNextPlans` と同じ（`uid` `by` `title` `when` `date` `note`
`tags` `place` `about[]` `links[]` `photos[]` `embeds[]` `createdAt` `updatedAt`）。
違うのは、**ログイン必須で、あやとが `canDraft` を立てた人しか書けなかった**こと。

**本番は0件**（2026-09-06 に数えた）。移すものは無い。
読み書きの口（`GET/POST /drafts`）はまだ動いているが、画面はもう見ていない。
畳むのは #171。

---

## 3. Git（`site/content/`）— 手で書くもの

レビューして育てたいものは、DB ではなくコードに置く。

| ファイル | 中身 |
| --- | --- |
| `site.ts` | プロフィール・外部リンク・数字の焼き込み値 |
| `streamTypes.ts` | 配信の型5つ |
| `recipes.ts` | 作ってきた料理 |
| `countries.ts` | 歩いた国と、滞在期間 |
| `cityStreams.ts` | 国と街ごとの代表配信（**自動生成**） |
| `legends.ts` | 伝説の企画8つ |
| `apps.ts` | 作っているアプリ |
| `plans.ts` | これからの企画 |
| `nordic.ts` + `nordic/*.json` | 北欧旅（**自動生成**。元は `python/build_nordic.py`） |
| `residents.ts` | 島の住人（キャラクター画像と、一緒にいた日数） |
| `chatter.ts` | 住人のセリフ |
| `voice.ts` | 画面に出る言葉ぜんぶ |
| `sprites.json` | スプライトの寸法（**自動生成**） |

自動生成のファイルは手で書き換えない。元のスクリプトを直してから作り直す。

---

## 4. API（`/island-api/*`）

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/state` | 誰でも | 数字・いまいる場所・企画提案・付箋・名前を出す住人 |
| `GET` | `/nextplans` | 誰でも | 企画の一覧。`?archived=1` はあやとだけ |
| `GET` | `/nextplans/:id` | 誰でも | 企画1件（育てる画面が続きを書くために引く） |
| `POST` | `/nextplans` | 誰でも | 企画を出す。**題だけでいい**（1日12件） |
| `POST` | `/nextplans/:id` | 出した人 | 育てる。**送った中身でまるごと置き換わる** |
| `POST` | `/nextplans/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/nextplans/:id/status` | あやとだけ | 段を動かす。`planId` で Git 側の企画に結ぶ |
| `POST` | `/nextplans/:id/archive` | あやとだけ | しまう・戻す。**消えない** |
| `GET` | `/ideas` | 誰でも | 企画提案の一覧（旧。画面は見ていない） |
| `POST` | `/ideas` | 誰でも | 企画提案を貼る（旧。1日8件） |
| `POST` | `/ideas/:id/vote` | 誰でも | いいね（旧。1人1票） |
| `GET` | `/notes` | 誰でも | 企画に貼られた付箋（旧。移行待ち） |
| `POST` | `/notes` | 誰でも | 企画に付箋を貼る（旧。1日20件） |
| `GET` | `/stickies` | 誰でも | テーマに貼られた付箋。`?theme=` で1つ、無ければ横断の新着 |
| `POST` | `/stickies` | 誰でも | テーマに付箋を貼る（1日20件） |
| `POST` | `/stickies/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/stickies/:id/reply` | あやとだけ | 返信する。空で送ると取り消し |
| `POST` | `/stickies/:id/archive` | あやとだけ | しまう・戻す。**消えない** |
| `POST` | `/me` | ログイン済み | 島での見え方を保存する |
| `GET` | `/drafts` | `canDraft` の人 | 自分の下書き（旧。画面は見ていない） |
| `POST` | `/drafts` | `canDraft` の人 | 下書きを保存する（旧。1日12件） |

ログインしていない人は端末IDで数え、ログインした人は uid で数える。
端末を変えても同じ人として扱われるのはこのため。

**`/notes` と `/stickies` は、入れ物が同じで口が別。** 画面が切り替わっている
途中の日に、両方が混ざったものが両方の画面に出るのを止めるためで、
旧来のぶんが移り終わったら（#162）`/notes` を畳む。

**旧（`/ideas` `/drafts`）を残してあるのも同じ理由。** Functions と Hosting は
別々に手で起動する（`CLAUDE.md`）ので、片方だけ先に出た日がある。
そこで古い口を消すと、その日のあいだ掲示板がまるごと 404 になる。畳むのは #171。
