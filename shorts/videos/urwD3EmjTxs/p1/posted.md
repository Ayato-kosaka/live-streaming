# ほったらかしパンの準備の回 p1（A） — 出したもの

あやとの「2026/11/12」（[#1107 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1107#issuecomment-6674755664)）を受けて、`urw-p1a-v3` を **2026-11-12 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/y2b07xe2-nk | `scheduledTimeSeconds` 1794486600 ＝ 2026-11-12T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7705034799551286548 | TikTok Studio の一覧の行に `Nov 12, 12:30 PM`（一覧は UTC） |

- 動画は `urw-p1a-v3`（42.47秒）。sha256 `2e236b219363f68064ce204c7f767f3938dd873e13c5d8fbb71f4804210f440f` を検査の記録の控えと全桁で照らしてから使い、EC2 の上でも照らした。この作業箱からは下見の web.app に届かないので、EC2 が下見のページの mp4 を落として照らした。題の札のコマ（カバー）は EC2 に入れた ffmpeg（6.1.1、作業箱と同じ版）で切った
- 投稿文: 置き場の `post_*.json`（`publish_at` を両方 2026-11-12T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、非公開で上げてから予約。関連動画は元の配信 urwD3EmjTxs（読み直しの `targetExternalVideoId`）。サムネイルは題の札が見える 1.0秒 のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。押す前にボタンの字が Schedule であることを確かめた。読み直しで、この題の行は1本だけ。カバーは同じ 1.0秒 のコマ。`--dry` で日時の欄（2026-11-12・12:30）まで確かめてから予約した
- この日は 00:19Z に YouTube Studio で「本人確認」の窓が出て止まり、あやとが 11:40Z ごろ遠隔デスクトップで通してから上げた（#1108）
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` y2b07xe2-nk・TikTok `done` 7705034799551286548。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-12 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見て、EC2 の `~/shorts_post/urwD3EmjTxs` を `post.py clean` で消す。
