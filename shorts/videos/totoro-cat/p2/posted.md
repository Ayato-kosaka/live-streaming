# トトロみたいな猫 p2 — 出したもの

あやとの「オッケーです　次の日付で出して」（[#1086 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1086#issuecomment-6613425529)。v6 の下見への返事）を受けて、
`totoro-cat-p2-v6` を **2026-11-07 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

- 「次の日付」は、予約の並び（11/4 バゲット・11/5 エディンバラ B・11/6 リーズ）の次の空いた日。猫の返事（19:27:10Z）が犬（19:27:55Z、#1087）より先なので、猫が 11/7、犬が 11/8。時刻はこれまでの回と同じ 21:30 JST
- 左上の「YouTube ライブ」の札は入れていない。あやとの「TikTokでおすすめに乗りにくいならやめる。」（[#1097 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1097#issuecomment-6613397878)）で、札なしの v6 のまま出す

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/F9BGvL10A5o | `scheduledTimeSeconds` 1794054600 ＝ 2026-11-07T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7704042438209424646 | TikTok Studio の一覧の行に `Nov 7, 12:30 PM`（一覧は UTC） |

- 動画は `totoro-cat-p2-v6`（34.63秒）。sha256 `c9a91f5a5bc3e005bfe68d501ecf2ef56edfc6e2c14e80e47b74f9d3d489bd32` を、`qa_p2.md` の控えの全桁と照らしてから使い（手元 `/tmp/cc-work/final/totoro-cat-p2-v6.mp4`）、EC2 に送ったあとも EC2 の上で照らした（`yt-draft`・`yt-publish`・`tt-post` の各段の前にも）
- 投稿文: `post_p2.json`（題「🇬🇪ジョージアの生意気子猫が、膝で爆睡したくせに僕をすぐ忘れやがった！」。`publish_at` を両方 2026-11-07T12:30:00Z にした。字は変えていない）。視聴者さんの名前は入っていない
- EC2 の置き場は `~/shorts_post/totoro-cat`、台帳の plan は `totoro-cat/p2`（置き場の名前。バゲットの回と同じ形）。`yt-related` だけは `--video` に元の配信 `d8UwWnFhjwY`（投稿文の `related_video`）を渡した
- **サムネイルとカバーは 1.0秒のコマ**（`cover_at_s` のまま）。題の札（5行）と、膝の上から目を丸くして見上げる子猫が見える
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 d8UwWnFhjwY（7月の月末配信や！！アツい1ヶ月だった！朝日みるぞ！）。予約の日時は `--at` で入れ、タイムゾーン「（GMT+0000）現地時間」を見てから保存した
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-07・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` F9BGvL10A5o・TikTok `done` 7704042438209424646。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-07 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/totoro-cat` を `post.py clean --video totoro-cat` で消す。

## 公開を確かめた（2026-11-07 12:44〜12:49 UTC）

予約の時刻（12:30 UTC）のあと、EC2 から見た。

- YouTube `F9BGvL10A5o`: ログインしない oEmbed が 200 で、題「🇬🇪ジョージアの生意気子猫が、膝で爆睡したくせに僕をすぐ忘れやがった！」を返した（`post_p2.json` の youtube.title と同じ）。
  Studio でも `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null・`timePublishedSeconds` 1794054620（12:30:20Z）
- TikTok `7704042438209424646`: ログインしない `embed/v2` は 503 が5回続き、15秒あけて取り直した6回目で 200・`"secret":false`。
  TikTok Studio の一覧でも、この題の行は1本だけで、予約の札（`(GMT+0) UTC`）が外れて `Nov 7, 12:30 PM Everyone`、再生5
- EC2 の `~/shorts_post/totoro-cat` を `post.py clean --video totoro-cat` で消した
