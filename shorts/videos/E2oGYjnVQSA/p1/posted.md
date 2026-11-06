# チキンシチューの回 p1 — 出したもの

あやとの「2026/11/06 21:30にだして。元々あったやつは2026/11/16」（[#1108 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1108#issuecomment-6672818460)）を受けて、`e2o-p1-v4` を **2026-11-06 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/GLmdZ6wkaqA | `scheduledTimeSeconds` 1793968200 ＝ 2026-11-06T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7705027200134679829 | TikTok Studio の一覧の行に `Nov 6, 12:30 PM`（一覧は UTC） |

- 動画は `e2o-p1-v4`（52.30秒）。sha256 `cf3427aeb0a5fb06065f2c70747d768fab20c6d8d0800f5132711c6eee29bfcc` を検査の記録の控えと全桁で照らしてから使い、EC2 の上でも照らした。この作業箱からは下見の web.app に届かないので、EC2 が下見のページの mp4 を落として照らした。題の札のコマ（カバー）は EC2 に入れた ffmpeg（6.1.1、作業箱と同じ版）で切った
- 投稿文: 置き場の `post_*.json`（`publish_at` を両方 2026-11-06T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、非公開で上げてから予約。関連動画は元の配信 E2oGYjnVQSA（読み直しの `targetExternalVideoId`）。サムネイルは題の札が見える 1.0秒 のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。押す前にボタンの字が Schedule であることを確かめた。読み直しで、この題の行は1本だけ。カバーは同じ 1.0秒 のコマ。11/6 の枠にいたリーズの回（#1051）は、**先に 11/16 へ動かしてから**この回を予約した（`shorts/videos/S5yf_Ir50xU/p3/posted.md`）。締め切りが近かったので TikTok の `--dry` は回さず、本番の段がキャプション・日時の欄・ボタンの字を確かめてから押した
- この日は 00:19Z に YouTube Studio で「本人確認」の窓が出て止まり、あやとが 11:40Z ごろ遠隔デスクトップで通してから上げた（#1108）
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` GLmdZ6wkaqA・TikTok `done` 7705027200134679829。どちらも `note` に予約の時刻）

## 公開を確かめた（2026-11-06 12:31〜12:34 UTC）

- YouTube `GLmdZ6wkaqA`: Studio で `VIDEO_PRIVACY_PUBLIC`・`timePublishedSeconds` 1793968210（12:30:10Z）。ログインしない oEmbed が 200 で題「🇲🇰北マケドニアで、チキンシチューを作ったらお店の味やった！」
- TikTok `7705027200134679829`: ログインしない `embed/v2` が 200・`"secret":false`（1回目は 503、15秒あけて取り直して 200）
- あとで EC2 の `~/shorts_post/E2oGYjnVQSA` を `post.py clean` で消す
