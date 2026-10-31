# ヨークの回 p2 — 出したもの

あやとの「2026/11/02 21:30」（[#1050 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1050#issuecomment-6536357560)。v6 の下見への返事）を受けて、
`york-p2-v6` を **2026-11-02 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/jz5RjaX-H6Q | `scheduledTimeSeconds` 1793622600 ＝ 2026-11-02T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702624928511708468 | TikTok Studio の一覧の行に `Nov 2, 12:30 PM`（一覧は UTC） |

- 動画は `york-p2-v6`（48.80秒）。sha256 `fbd9b78a499717196ef3d103f0471a8c7ebbfdffb73d6174b7021a377db7e996` を、`qa_p2.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p2.json`（題「🇬🇧イギリスにあるアフタヌーンティーの超本場がやばすぎた！」。`publish_at` を両方 2026-11-02T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 _VmXgP27Dqw（【神回】イギリスの古都、ヨークを歩いてみた。…）、サムネイルは題の札とベティズの三段のお皿が見える 1.0秒のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-02・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` jz5RjaX-H6Q・TikTok `done` 7702624928511708468。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-02 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/_VmXgP27Dqw` を `post.py clean` で消す。
