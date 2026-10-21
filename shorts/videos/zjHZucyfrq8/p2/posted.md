# 最安ホステルの回 p2 — 出したもの

あやとの「19時に出して」（[#959 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/959#issuecomment-6305646320)、2026-10-21 01:21 UTC）を受けて、
**2026-10-21 19:00 JST（10:00 UTC）の予約投稿**にした。投稿先が時刻に出すので、こちらのセッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/qcWK52DE0X8 | `scheduledTimeSeconds` 1792576800 ＝ 2026-10-21T10:00:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7698941571512765717 | TikTok Studio の一覧の行に `Oct 21, 10:00 AM`（一覧は UTC）と時計の印 |

- 動画の sha256: `d759c6c0dbc1bf199a924cc2ec191bd204f90d0f7453daff075ed062bfd00746`（v10・46.70秒、YouTube と TikTok で同じ1本）
- 投稿文: `post_p2.json` と `tt_caption_p2.txt`（[#959 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/959#issuecomment-6304422126) で見せた字のまま。1字ずつ比べた）
- YouTube: 題・説明（改行まで）が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 zjHZucyfrq8、
  サムネイルは題の札とベッドが見える 1.0秒のコマ、ショートとして入っている（47秒）
- TikTok: キャプション一致、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印はオフ
- 台帳: `tools/shorts/post/posted.json`（両方 `done`。予約の時刻を `note` に書いた）

## 途中で起きたこと

- YouTube に上げる画面で「本人確認」の窓が出た。「次へ」は Google のパスワードの画面で、ほかの方法はパスキーとアカウント復元だけだった。
  こちらでは何も打たず、あやとに遠隔デスクトップで本人確認をしてもらってから上げ直した（1回目は Studio に保存されていない）
- 予約の道具はこの回で作った（`yt_post.py publish --at`・`tt_post.py post --at`。手順は `tools/shorts/post/README.md` の「予約投稿」）
