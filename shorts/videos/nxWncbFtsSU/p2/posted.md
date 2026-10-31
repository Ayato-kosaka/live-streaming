# エディンバラの回 p2 — 出したもの

あやとの「A 2026/11/01 / B 2026/11/04」（[#1052 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1052#issuecomment-6549123667)。A v4・B v8 の下見への返事）を受けて、
2本とも**予約投稿**にした。時刻の指定が無かったので、これまでの回と同じ 21:30 JST にした（#1052 に書いた）。前にあった「B→A の順で」はこの日付で置き換わり、A が先。
投稿先が時刻に出すので、セッションが止まっていても出る。

## A — エディンバラを1日で（`edinburgh-p2A-v4`）

**2026-11-01 21:30 JST（12:30 UTC）**

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/KjU8rcsN7PM | `scheduledTimeSeconds` 1793536200 ＝ 2026-11-01T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702950049428376853 | TikTok Studio の一覧の行に `Nov 1, 12:30 PM`（一覧は UTC） |

- 動画は `edinburgh-p2A-v4`（47.6秒）。sha256 `87a1ccae53a6d3b0cdef960195249ebf431a608d013bd19fe413d171045c5b6d` を、`qa_A.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_A.json`（題「🇬🇧イギリスのエディンバラを、1日で回ったらやばかった！」。`publish_at` を両方 2026-11-01T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 nxWncbFtsSU、サムネイルは題の札と城の大広間（甲冑と市松の床）が見える 1.0秒のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-01・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ

## B — ハギス（`edinburgh-p2B-v8`）

**2026-11-04 21:30 JST（12:30 UTC）**

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/YJvEbZ3dmEQ | `scheduledTimeSeconds` 1793795400 ＝ 2026-11-04T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702951050025717012 | TikTok Studio の一覧の行に `Nov 4, 12:30 PM`（一覧は UTC） |

- 動画は `edinburgh-p2B-v8`（33.87秒）。sha256 `c57ff6ed19971e4c0de90937e351b7aaf2b273adb377d0a509a2e030fc6dfa41` を、`qa_p2.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_B.json`（題「🇬🇧イギリスのめちゃくちゃ美味しい料理、ハギスを食べてみた！」。`publish_at` を両方 2026-11-04T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 nxWncbFtsSU、サムネイルは題の札とフォークのハギスが見える 1.0秒のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-04・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ

## 台帳

`tools/shorts/post/posted.json`（A: YouTube `done` KjU8rcsN7PM・TikTok `done` 7702950049428376853 ／ B: YouTube `done` YJvEbZ3dmEQ・TikTok `done` 7702951050025717012。4行とも `note` に予約の時刻）

## 公開のあとに確かめること

それぞれの時刻（A は 2026-11-01 12:30 UTC、B は 2026-11-04 12:30 UTC）を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直す。
EC2 の `~/shorts_post/nxWncbFtsSU` は A・B の両方が入っているので、**B の公開を確かめてから** `post.py clean` で消す。
