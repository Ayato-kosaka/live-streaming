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

### A の公開を確かめた（2026-11-01 12:45 UTC）

- YouTube（v5b `wACcdJnOv18`）: oEmbed が 200 で、題「🇬🇧イギリスのエディンバラを、1日で回ったらやばかった！」が返った
- TikTok（v5b `7702992021371243777`）: `embed/v2` が 200 で `"secret":false`（はじめの3回は 503、15秒あけて取り直した4回目で 200）
- 取り下げた v4（YouTube `KjU8rcsN7PM`）: oEmbed が 403（非公開のまま）。公開されていない
- EC2 の `~/shorts_post/nxWncbFtsSU` は B が残っているので、まだ消していない

## B — ハギス（`edinburgh-p2B-v8`）

**2026-11-05 21:30 JST（12:30 UTC）**（はじめは 11/4。2026-11-03 にバゲットの回と入れ換えた。下の「11/4 と 11/5 の入れ換え」）

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/YJvEbZ3dmEQ | `scheduledTimeSeconds` 1793881800 ＝ 2026-11-05T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7704036972335041798 | TikTok Studio の一覧の行に `Nov 5, 12:30 PM`（一覧は UTC）。入れ直した投稿（前の ID は 7702951050025717012） |

- 動画は `edinburgh-p2B-v8`（33.87秒）。sha256 `c57ff6ed19971e4c0de90937e351b7aaf2b273adb377d0a509a2e030fc6dfa41` を、`qa_p2.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_B.json`（題「🇬🇧イギリスのめちゃくちゃ美味しい料理、ハギスを食べてみた！」。`publish_at` を両方 2026-11-04T12:30:00Z にした。字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 nxWncbFtsSU、サムネイルは題の札とフォークのハギスが見える 1.0秒のコマ
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-04・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ

### 11/4 と 11/5 の入れ換え（2026-11-03）

あやとの「11月4日(水)分と11/5分を入れ換えて」（チャット。[#1071 の書き置き](https://github.com/Ayato-kosaka/live-streaming/issues/1071#issuecomment-6613552874)）で、
B を 11/4 → **11/5 21:30 JST**、バゲット（#1071）を 11/5 → 11/4 にした。途中で落ちても 11/4 に2本出ないよう、どちらの媒体も **B を先に 11/5 へ動かしてから**バゲットを動かした。

- **YouTube（動画は差し替えていない。時刻だけ）**: `yt_post.py publish YJvEbZ3dmEQ --at 2026-11-05T12:30:00Z` を `--dry` で日時の欄（2026/11/05・12:30、タイムゾーン「（GMT+0000）現地時間」）まで確かめ、
  キャンセルして元の 1793795400 のままなのを読んでから保存した（2026-11-03T19:49Z）。読み直した: `scheduledTimeSeconds` 1793881800・`SCHEDULED_PUBLISHING_STATUS_SCHEDULED`・`VIDEO_PRIVACY_PRIVATE`
  - 予約済みの動画では「スケジュールを設定」がもう開いていて、開くボタンが幅0で隠れている。前の `schedule()` はそれを押して窓の外（0,0）を押し、
    タイムゾーンの札が読めずに `timezone_not_utc` で止まった（押してはいない）。見えているときだけ押すよう `yt_post.py` を直した
- **TikTok（予約ごと消して入れ直した）**: TikTok Studio の一覧で、予約中の行は鉛筆・グラフ・吹き出しが灰色で押せず、「…」には Download（灰色）と Delete だけ。**時刻は変えられない。**
  1. `tt_post.py delete 7702951050025717012 ハギスを食べてみた 2026-11-04T12:30:00Z` を `--dry`（念押しの窓「Delete post?」まで）→ 本番（2026-11-03T19:57Z）。
     読み直した: 一覧（`check`）に同じ題の行が0本・ログインなしの `embed/v2/7702951050025717012` が 400
  2. EC2 に残っていた同じ mp4（`~/shorts_post/nxWncbFtsSU/B.mp4`、sha256 `c57ff6ed19971e4c0de90937e351b7aaf2b273adb377d0a509a2e030fc6dfa41` を上の控えと全桁で照らした）・
     同じ投稿文（`tt_caption_B.txt` の sha256 が手元の `post_B.json` から組んだキャプションと一致）・同じカバー（10/31 に切った `B_cover.jpg`、1.0秒のコマ）で、
     `post.py tt-post --video nxWncbFtsSU --option B --cover --sha … --at 2026-11-05T12:30` を `--dry`（日時の欄 2026-11-05・12:30・キャプション一致・Everyone・AI 印オフ）→
     一覧に古い行が無いのを読んだうえで `--again`（台帳が同じ sha256 を止めるため）で予約した。新しい投稿 ID は **7704036972335041798**。読み直しで、この題の行は1本だけ・`Nov 5, 12:30 PM`

## 台帳

`tools/shorts/post/posted.json`（A: YouTube `done` wACcdJnOv18・TikTok `done` 7702992021371243777 ／ B: YouTube `done` YJvEbZ3dmEQ・TikTok `done` 7704036972335041798（入れ直し。消した 7702951050025717012 の行は消さずに `note` に消したことと読み直した値）。どの行も `note` に予約の時刻。取り下げた A v4 の2行は消さずに、`note` に取り下げたことと読み直した状態を書いた）

## 公開のあとに確かめること

それぞれの時刻（A は 2026-11-01 12:30 UTC、B は **2026-11-05 12:30 UTC**）を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直す。
EC2 の `~/shorts_post/nxWncbFtsSU` は A・B の両方が入っているので、**B の公開を確かめてから** `post.py clean` で消す。
