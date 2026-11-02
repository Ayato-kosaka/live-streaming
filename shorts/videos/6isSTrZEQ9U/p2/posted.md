# 浸水の回 p2 — 出したもの

あやとの「11/03に出して」（[#1053 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1053#issuecomment-6534829956)）を受けて、
**2026-11-03 21:30 JST（12:30 UTC）の予約投稿**にした。時刻の指定が無かったので、これまでの回と同じ 21:30 にした（#1053 に書いた）。
投稿先が時刻に出すので、セッションが止まっていても出る。

いま予約してあるのは **`flood-p2-v6`**（2026-11-02 に v3 から差し替えた。下の「取り下げた v3」）。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/wDtTjwEd0Pg | `scheduledTimeSeconds` 1793709000 ＝ 2026-11-03T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7703655878980848916 | TikTok Studio の一覧の行に `Nov 3, 12:30 PM`（一覧は UTC） |

- **差し替えた理由:** あやとの「配信の声の音量が前回小さくて聞こえづらかったので注意してね」（[#1086 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1086#issuecomment-6583565860)）。
  この回の配信の声2行（「どうしよう、どうしよう……」「えぐいって……」）が、話している所で AI の声より小さかったので、道具を直して書き出し直した。
  同じ時刻のまま差し替えると #1053 に書いた（[コメント](https://github.com/Ayato-kosaka/live-streaming/issues/1053#issuecomment-6583652469)）。画は v3 と同じで、違うのは配信の声の大きさと9行目の字幕の出はじめ（2コマ）だけ
- 動画は `flood-p2-v6`（35.93秒）。sha256 `503030d43558a25afbb4ee3df7f185a8c3cc5901dabb2712231ce4b13a6ff676` を、`qa_p2.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p2.json`（version を flood-p2-v6 にした。題「🇬🇧イギリスの宿でシャワーを浴びたら、全館浸水しました！」・説明・キャプション・`publish_at` は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 6isSTrZEQ9U（【緊急】僕のせいでホステルが浸水しました）、
  サムネイルは題の札と水浸しのシャワー室の床が見える 1.0秒のコマ（v3 の 1.0秒のコマとバイト単位で同じ）。状態は `PROCESSED`（36秒）
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-03・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（v6: YouTube `done` wDtTjwEd0Pg・TikTok `done` 7703655878980848916。どちらも `note` に予約の時刻。取り下げた v3 の2行は消さずに、`note` に取り下げたことと読み直した状態を書いた）

## 取り下げた v3（`flood-p2-v3`・sha256 `8ba9c9ef20ad…`）

v3 は 2026-10-30 に予約した版（この箱から下見の web.app に届かず、EC2 が下見から落として照らした）。

| 場所 | URL | どうしたか（読み直した状態） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/jH5SZqTP3M8 | 2026-11-02T19:01Z に**予約を外して非公開のまま残した**（消していない。取り戻せるように）。Studio の privacy が `VIDEO_PRIVACY_PRIVATE`・`scheduledPublishingDetails` が null |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702603552035802375 | 2026-11-02T19:03Z に予約ごと削除した（公開前の予約なので）。TikTok Studio の一覧にこの ID の行が無い |

- 取り下げは**新しい版を上げる前に**した（`tools/shorts/post/README.md` の「予約を差し替える」。YouTube は `yt-unschedule` → `yt-draft --replaces jH5SZqTP3M8`）。
  逆の順だと、取り下げに失敗したとき 12:30Z に2本出る
- YouTube の同じ題のショートは、新しい v6（予約あり）と残した v3（非公開・予約なし）の2本。TikTok の同じ題の行は v6 の1本だけ

## 公開のあとに確かめること

2026-11-03 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る（v6 の ID で）。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直す。
残した v3（jH5SZqTP3M8）が非公開のままなのも見る。そのあと EC2 の `~/shorts_post/6isSTrZEQ9U` を `post.py clean` で消す。
