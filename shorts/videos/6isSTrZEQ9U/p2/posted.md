# 浸水の回 p2 — 出したもの

あやとの「11/03に出して」（[#1053 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1053#issuecomment-6534829956)）を受けて、
`flood-p2-v3` を **2026-11-03 21:30 JST（12:30 UTC）の予約投稿**にした。時刻の指定が無かったので、これまでの回と同じ 21:30 にした（#1053 に書いた）。
投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/jH5SZqTP3M8 | `scheduledTimeSeconds` 1793709000 ＝ 2026-11-03T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702603552035802375 | TikTok Studio の一覧の行に `Nov 3, 12:30 PM (GMT+0)`（一覧は UTC） |

- 動画は `flood-p2-v3`（35.93秒）。sha256 `8ba9c9ef20ad4b3031eaf022bc06f8d9c252908b551a00d5fef9b499451bdc98` を、`qa_p2.md` の控えの全桁と照らした。
  この箱からは下見（web.app）に届かないので、EC2 が下見から落として EC2 の上で照らし、作業箱にも同じものを持ってきて照らした（題の札のコマを作業箱の ffmpeg で切るため）
- 投稿文: `post_p2.json`（題「🇬🇧イギリスの宿でシャワーを浴びたら、全館浸水しました！」。`publish_at` を両方 2026-11-03T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 6isSTrZEQ9U（【緊急】僕のせいでホステルが浸水しました）、サムネイルは題の札と水浸しのシャワー室の床が見える 1.0秒のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-03・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` jH5SZqTP3M8・TikTok `done` 7702603552035802375。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-03 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/6isSTrZEQ9U` を `post.py clean` で消す。
