# live-streaming

種別: 台帳

あやとの配信（YouTube）と、その留守番の場所「あやと島」（本番の URL は `site/content/site.ts` の `SITE.url`）を作っているリポジトリ。

## どこから読むか

| 読む人 | 入口 |
| --- | --- |
| このリポジトリで作業する Claude Code | [`CLAUDE.md`](./CLAUDE.md)（いつも守ることと、何をどこで読むか） |
| 文書を探す人 | [`docs/README.md`](./docs/README.md)（文書の台帳。全部の文書が種別つきで1行ずつ載っている） |
| 確かめかた・ビルドのしかた | [`docs/island-verify.md`](./docs/island-verify.md) |

## どこに何が在るか

| 置き場 | 何か |
| --- | --- |
| `site/` | あやと島（Next.js。静的に書き出す） |
| `app/` `components/` `public/` | 配信に映す面（Expo の web）と、月末のページ |
| `functions/` | 口（`/island-api/*`。Firebase Functions）。一覧は [`docs/island-api.md`](./docs/island-api.md) |
| `python/` | BigQuery・Firestore からデータを作る道具と、見張り（`*_selftest.py`） |
| `infra/big-query/` | BigQuery のデータセットと表を作り直すとき。手順は [`infra/big-query/README.md`](./infra/big-query/README.md) |
| `tools/sprites/` | 絵を焼く・面を撮って測る道具 |
| `streams/` | 配信ごとの文字起こしと議事録 |
| `.github/workflows/` | 毎晩の取り込み・焼き直し・デプロイ |

## チャットの取り込み（島より前からある仕組み）

毎晩、YouTube のアーカイブを見つけてコメントを BigQuery に入れている。仕組みの説明は、それぞれのファイルの頭に置いてある。

| 何をするか | どこを読むか |
| --- | --- |
| アーカイブを見つける（uploads playlist から列挙。lookback と既知の video_id で打ち切る） | `python/discover_videos.py` → `python/youtube_api/discovery.py` |
| YouTube の OAuth トークンを Doneru 経由で受け取る（`DONERU_ALERTBOX_KEY`。401 で取り直す） | `python/youtube_api/oauth.py` `python/youtube_api/client.py` |
| コメントを yt-dlp で落として MERGE する | `python/fetch_chat_data.py` |
| MERGE の値を STRING・INT64 だけで渡し、SQL 側で `SAFE_CAST` / `SAFE.PARSE_JSON` に直す理由 | `python/bq/queries.py` の `QUERY_MERGE_CHAT_MESSAGES` の上 |
| 表の列と、誰が書いて誰が読むか | [`docs/island-db.md`](./docs/island-db.md) |
| 毎晩の取り込みの見届けかた | `/nightly-check`（`.claude/skills/nightly-check/SKILL.md`） |
