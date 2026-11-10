# ほったらかしパンの準備の回 p1（A） — 出したもの

あやとの「2026/11/12」（[#1107 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1107#issuecomment-6674755664)）を受けて、`urw-p1a-v3` を **2026-11-12 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/y2b07xe2-nk | `scheduledTimeSeconds` 1794400200 ＝ **2026-11-11T12:30:00Z**（一般公開・予約済み。それまでは非公開）。はじめは 11/12、2026-11-10 に動かした（下の「11/11 への移動」） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7706522051476983046 | TikTok Studio の一覧の行に `Nov 11, 12:30 PM`（一覧は UTC）。入れ直した投稿（前の ID は 7705034799551286548） |

- 動画は `urw-p1a-v3`（42.47秒）。sha256 `2e236b219363f68064ce204c7f767f3938dd873e13c5d8fbb71f4804210f440f` を検査の記録の控えと全桁で照らしてから使い、EC2 の上でも照らした。この作業箱からは下見の web.app に届かないので、EC2 が下見のページの mp4 を落として照らした。題の札のコマ（カバー）は EC2 に入れた ffmpeg（6.1.1、作業箱と同じ版）で切った
- 投稿文: 置き場の `post_*.json`（`publish_at` を両方 2026-11-12T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、非公開で上げてから予約。関連動画は元の配信 urwD3EmjTxs（読み直しの `targetExternalVideoId`）。サムネイルは題の札が見える 1.0秒 のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。押す前にボタンの字が Schedule であることを確かめた。読み直しで、この題の行は1本だけ。カバーは同じ 1.0秒 のコマ。`--dry` で日時の欄（2026-11-12・12:30）まで確かめてから予約した
- この日は 00:19Z に YouTube Studio で「本人確認」の窓が出て止まり、あやとが 11:40Z ごろ遠隔デスクトップで通してから上げた（#1108）
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` y2b07xe2-nk・TikTok `done` 7705034799551286548。どちらも `note` に予約の時刻）

## 11/11 への移動（2026-11-10）

あやとの「ほったらかしパンを11/11にかえといて」（チャット。[#1107 の書き置き](https://github.com/Ayato-kosaka/live-streaming/issues/1107#issuecomment-6767342826)）で、
11/12 → **2026-11-11 21:30 JST（12:30 UTC）** に動かした（時刻の指定は無いのでいつもの 21:30。11/11 の枠はほかに無い）。

- **YouTube（時刻だけ。動画は差し替えていない）**: `yt_post.py publish y2b07xe2-nk --at 2026-11-11T12:30:00Z` を `--dry`（2026/11/11・12:30・タイムゾーン「（GMT+0000）現地時間」）→ 本番（12:35Z）。
  読み直した: `scheduledTimeSeconds` 1794400200・`SCHEDULED_PUBLISHING_STATUS_SCHEDULED`・`VIDEO_PRIVACY_PRIVATE`
- **TikTok（予約ごと消して入れ直した）**: `tt_post.py delete 7705034799551286548 はかり無しの量り方 2026-11-12T12:30:00Z`（12:37Z）→ 一覧（`check`）に同じ題の行が0本を読んだ。
  EC2 の置き場は前に消していたので、EC2 が下見の `p1-A.mp4` を落として sha256 `2e236b21…440f` を全桁で照らし（21,216,298 バイト）、カバーは同じ ffmpeg（6.1.1）で 1.0秒のコマを切り直した。
  投稿文は `post_A.json` から組み直したキャプション（`publish_at` のほかは変えていない）。`--dry`（日時の欄 2026-11-11・12:30・キャプション一致・Everyone・AI 印オフ）を通してから `--again` で予約した（12:41Z）。
  新しい投稿 ID は **7706522051476983046**。読み直しで、この題の行は1本だけ・`Nov 11, 12:30 PM`
- 投稿文 `post_A.json` の `publish_at` を両方 2026-11-11T12:30:00Z にした
- 予約を読み直せたので終わり（帳面 F-069）。EC2 の `~/shorts_post/urwD3EmjTxs` は `post.py clean` で消した

## 公開のあとに確かめること

2026-11-12 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見て、EC2 の `~/shorts_post/urwD3EmjTxs` を `post.py clean` で消す。
