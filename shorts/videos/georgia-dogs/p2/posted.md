# ジョージアの野良犬 p2 — 出したもの

あやとの「次の日付で出して」（[#1087 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1087#issuecomment-6613440947)。v5 の下見への返事）を受けて、
`georgia-dogs-p2-v5` を **2026-11-08 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

- 「次の日付」は、予約の並び（11/4 バゲット・11/5 エディンバラ B・11/6 リーズ）の次。猫（#1086）の返事が 19:27:10Z で先、犬は 19:27:55Z なので、猫が 11/7、犬が 11/8。時刻はこれまでの回と同じ 21:30 JST
- 左上の「YouTube ライブ」の札は入れていない。あやとの「TikTokでおすすめに乗りにくいならやめる。」（[#1097 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1097#issuecomment-6613397878)）で、札なしの v5 のまま出す

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/5O7Hi-dY_-k | `scheduledTimeSeconds` 1794141000 ＝ 2026-11-08T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7704052964100476212 | TikTok Studio の一覧の行に `Nov 8, 12:30 PM`（一覧は UTC） |

- 動画は `georgia-dogs-p2-v5`（42.57秒）。sha256 `e36d734bf711258dd150c32087cbf489c795ae5bfaef7ee4bd7b6901d95b7ac2` を、`qa_p2.md` の控えの全桁と照らしてから使い（手元 `/tmp/cc-work/final/georgia-dogs-p2-v5.mp4`）、EC2 に送ったあとも EC2 の上で照らした（`yt-draft`・`yt-publish`・`tt-post` の各段の前にも）
- 投稿文: `post_p2.json`（題「🇬🇪ジョージアに来たら、野良犬が共存してた！」。`publish_at` を両方 2026-11-08T12:30:00Z にした。字は変えていない）。視聴者さんの名前は入っていない
- EC2 の置き場は `~/shorts_post/georgia-dogs`、台帳の plan は `georgia-dogs/p2`。`yt-related` だけは `--video` に元の配信 `nzf06yFqIkk`（投稿文の `related_video`）を渡した
- **関連動画は1回目に別の回に付いた。** 元の配信の題「ジョージア風フレンチトーストの材料探しにマーケットいきます」は、同じ題の配信が3本ある（`lxnJu5iQ_rU`・`ChHS2hPQsf8`・`nzf06yFqIkk`）。
  道具は選ぶ窓で題の字が当たった先頭の札を押していて、`lxnJu5iQ_rU` に付いた（読み直しが `ok: false` で止めた）。札（`ytcp-entity-card`）は `video.videoId` を持っているので、
  `yt_post.py` の `related()` を **ID で札を選ぶ**形に直し（ID が読めない形のときだけ、題がちょうど1つに当たる場合に押す）、`--dry` のあと付け直した。読み直した: `videoLinkageShortsAttribution.links` が `nzf06yFqIkk` の1本
- **サムネイルとカバーは 1.0秒のコマ**（`cover_at_s` のまま）。題の札と、公園であお向けに転がる白い犬が見える
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、予約の日時は `--at` で入れ、タイムゾーン「（GMT+0000）現地時間」を見てから保存した
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-08・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- **EC2 へ送るのが1回落ちた**: Actions の「ショートの下見を置く」が、暗号文を置く段（`tools/shorts/ingest/seal.py`）で `Invalid cross-device link` になり、作業箱が URL を待ち続けた。
  runner の /tmp と作業場が別の器のときに rename が落ちる。`shutil.move` に直して、残った依頼を下ろしてから送り直した（URL は出ていない回なので、上げたものは無い）
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` 5O7Hi-dY_-k・TikTok `done` 7704052964100476212。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-08 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/georgia-dogs` を `post.py clean --video georgia-dogs` で消す。

## 公開を確かめた（2026-11-08 12:45〜12:48 UTC）

予約の時刻（12:30 UTC）のあと、EC2 から見た。

- YouTube `5O7Hi-dY_-k`: ログインしない oEmbed が 200 で、題「🇬🇪ジョージアに来たら、野良犬が共存してた！」を返した（`post_p2.json` の youtube.title と同じ）。
  Studio でも `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null・`timePublishedSeconds` 1794141029（12:30:29Z）。
  **関連動画は元の配信 `nzf06yFqIkk` のまま**（`videoLinkageShortsAttribution` の `targetExternalVideoId`。同じ題の配信3本のうち、取り違えて直したほう）
- TikTok `7704052964100476212`: ログインしない `embed/v2` が1回目で 200・`"secret":false`。
  TikTok Studio の一覧でも、この題の行は1本だけで、予約の札（`(GMT+0) UTC`）が外れて `Nov 8, 12:30 PM Everyone`、再生28
- EC2 の `~/shorts_post/georgia-dogs` を `post.py clean --video georgia-dogs` で消した
