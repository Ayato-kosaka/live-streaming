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

### `islandIdeas/{id}` — 企画掲示板に貼られた提案

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `text` | string | 提案（200字まで） |
| `name` | string | 名乗った名前（なくてもいい） |
| `uid` | string? | ログインしていれば、その人 |
| `cid` | string | 端末ID（連投を止めるため） |
| `votes` | number | いいねの数 |
| `hidden` | boolean | 隠すとき |
| `createdAt` | number | ミリ秒 |

北欧の国ごとの募集も、ここに `【リトアニア】` という札を頭に付けて入る。
別のコレクションを作らないのは、票と一覧の仕組みを分けたくないため。

### `islandNotes/{id}` — 「これから」に貼られた付箋

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `planId` | string | どの企画への付箋か |
| `text` | string | 中身（120字まで） |
| `cid` | string | 端末ID |
| `hidden` | boolean | 隠すとき |
| `createdAt` | number | ミリ秒 |

### `islandVotes/{key}` — 誰がどれに投票したか

ドキュメントIDは `` `${ideaId}_${uid ?? cid}` ``。1人1票にするためだけのもの。

### `islandRate/{key}` — 1日の上限

ドキュメントIDは `` `${kind}_${YYYY-MM-DD}_${uid ?? cid}` ``。

| 項目 | 型 |
| --- | --- |
| `n` | number（その日の回数） |
| `kind` | string（idea / note / draft） |
| `day` | string |
| `updatedAt` | number |

上限は 企画8件 / 付箋20件 / 下書き12件 / 日。

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
| `canDraft` | boolean | 企画ページの下書きを書いてよいか | あやと（コンソール） |
| `admin` | boolean | 全員ぶんの下書きを読めるか | あやと（コンソール） |
| `firstSeenAt` / `lastSeenAt` | number | 初回と直近 | 自動 |

**`character` が入っていて、かつ `showName` か `showPhoto` のどちらかが true の人だけ**が
`GET /state` の `residents` に載る。何もしていない人の名前は絶対に出ない。

### `islandDrafts/{id}` — 企画ページの下書き

| 項目 | 型 | 中身 |
| --- | --- | --- |
| `uid` | string | 書いた人 |
| `by` | string | 書いた人の表示名 |
| `title` `when` `date` `note` `tags` | | 企画の基本 |
| `place` | object | `{ name, area, map }` |
| `about` | string[] | どんなものか。段落ごと |
| `links` | object[] | `{ label, href }` |
| `photos` | object[] | `{ src, alt, credit, creditHref }` |
| `embeds` | object[] | `{ kind, id, note }` |
| `createdAt` / `updatedAt` | number | ミリ秒 |

下書きはそのままでは公開されない。
あやとが Claude Code で仕上げて `site/content/plans.ts` に入れて、はじめてページになる。

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
| `GET` | `/ideas` | 誰でも | 企画提案の一覧 |
| `POST` | `/ideas` | 誰でも | 企画提案を貼る（1日8件） |
| `POST` | `/ideas/:id/vote` | 誰でも | いいね（1人1票） |
| `POST` | `/notes` | 誰でも | 付箋を貼る（1日20件） |
| `POST` | `/me` | ログイン済み | 島での見え方を保存する |
| `GET` | `/drafts` | `canDraft` の人 | 自分の下書き（`admin` は全員ぶん） |
| `POST` | `/drafts` | `canDraft` の人 | 下書きを保存する（1日12件） |

ログインしていない人は端末IDで数え、ログインした人は uid で数える。
端末を変えても同じ人として扱われるのはこのため。
