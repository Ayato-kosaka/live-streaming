# エディンバラの回 p2 — 出したもの

あやとの「A 2026/11/01 / B 2026/11/04」（[#1052 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1052#issuecomment-6549123667)。A v4・B v8 の下見への返事）を受けて、
2本とも**予約投稿**にした。時刻の指定が無かったので、これまでの回と同じ 21:30 JST にした（#1052 に書いた）。前にあった「B→A の順で」はこの日付で置き換わり、A が先。
投稿先が時刻に出すので、セッションが止まっていても出る。

## A — エディンバラを1日で（`edinburgh-p2A-v5b`。v4 から差し替え）

**2026-11-01 21:30 JST（12:30 UTC）**

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/wACcdJnOv18 | `scheduledTimeSeconds` 1793536200 ＝ 2026-11-01T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702992021371243777 | TikTok Studio の一覧の行に `Nov 1, 12:30 PM`（一覧は UTC） |

- **差し替えた理由:** あやとの依頼（[#1052 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1052#issuecomment-6550265898) に書き置いたチャット「エディンバラを回る回もフックがあまりに画質低いので、差し替えて欲しい」）で、
  フックをリーズの回と同じイギリスの地図のアニメーションにした v5b を、v4 と同じ時刻で予約し直した。題・説明・キャプションは v4 と同じ
- 動画は `edinburgh-p2A-v5b`（47.6秒。ファイル名は `edinburgh-p2A-v5.mp4`、本編集の担当が双子の食い違いで回し直した中身）。
  sha256 `3c772be43e45e49f0844fcb56f3341ee567f15fc9f68b8e1ecec70845732a85a` を全桁で照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_A.json`（version は edinburgh-p2A-v5b。`publish_at` は両方 2026-11-01T12:30:00Z のまま）
- **サムネイルとカバーは 0.5秒のコマ。** 題の札と、光るスコットランド・★エディンバラ（スコットランドの首都）・ロンドンが同時に見える。0.3〜0.6秒を並べて見て、
  0.3・0.4秒はロンドンの点がまだ動いていて、0.6秒は寄り始めていたので、止まって見える 0.5秒にした（`post.py cover --cover-at 0.5`。`post_A.json` の `_cover_note` は v4 のときの字で、直していない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 nxWncbFtsSU。状態は `PROCESSED`（48秒）
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 0.5秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-01・12:30）まで確かめてから予約した

### 取り下げた v4（`edinburgh-p2A-v4`・sha256 `87a1ccae53a6…`）

| 場所 | URL | どうしたか（読み直した状態） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/KjU8rcsN7PM | 2026-11-01T00:06Z に**予約を外して非公開のまま残した**（消していない。取り戻せるように）。Studio の privacy が `VIDEO_PRIVACY_PRIVATE`・`scheduledPublishingDetails` が null |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702950049428376853 | 2026-11-01T00:10Z に予約ごと削除した（公開前の予約なので）。TikTok Studio の一覧にこの ID の行が無い |

- 取り下げは**新しい版を上げる前に**した。逆の順だと、取り下げに失敗したとき 12:30Z に2本出る。YouTube の同じ題の見張り（`dup`）と TikTok の見張り（`find_posts`）も、古いほうが残っていると新しい版を止める
- YouTube の同じ題のショートは、新しい版（予約あり）と残した v4（非公開・予約なし）の2本。TikTok の同じ題の行は新しい版の1本だけ

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

`tools/shorts/post/posted.json`（A: YouTube `done` wACcdJnOv18・TikTok `done` 7702992021371243777 ／ B: YouTube `done` YJvEbZ3dmEQ・TikTok `done` 7702951050025717012。どの行も `note` に予約の時刻。取り下げた A v4 の2行は消さずに、`note` に取り下げたことと読み直した状態を書いた）

## 公開のあとに確かめること

それぞれの時刻（A は 2026-11-01 12:30 UTC、B は 2026-11-04 12:30 UTC）を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直す。
EC2 の `~/shorts_post/nxWncbFtsSU` は A・B の両方が入っているので、**B の公開を確かめてから** `post.py clean` で消す。
