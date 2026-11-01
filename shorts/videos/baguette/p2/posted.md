# バゲットの回 p2 — 出したもの

あやとの「2026/11/05 21:30」（[#1071 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1071#issuecomment-6555288416)。v6 の下見への返事）を受けて、
`baguette-p2-v6` を **2026-11-05 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/As4LP4FPzPw | `scheduledTimeSeconds` 1793881800 ＝ 2026-11-05T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7703115629053627654 | TikTok Studio の一覧の行に `Nov 5, 12:30 PM`（一覧は UTC） |

- 動画は `baguette-p2-v6`（52.07秒）。sha256 `6ed7cca14c25278e8d0ea60bd7999285f4757f9806d68fb46b54378625ccc29c` を、`qa_p2.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p2.json`（題「海外旅行中に作ったバケットが簡単すぎた！」。`publish_at` を両方 2026-11-05T12:30:00Z にした。字は変えていない）
- **4本の配信のまとめなので、`post.py` の `--video` は置き場の名前 `baguette`**（猫の回 `cats` と同じ形）。EC2 の置き場は `~/shorts_post/baguette`、台帳の plan は `baguette/p2`。
  `yt-related` だけは `--video` が「関連動画に付ける動画」なので、焼いた回 `28Tcc0c5sNE`（投稿文の `related_video`）を渡した
- **サムネイルとカバーは 2.0秒のコマ**（題の札は 0〜4秒）。0.5・1.0・1.5・2.0秒を並べて見て、天板を引き出して焼き上がりのパンがいちばん大きく、ミトンが下に寄っている 2.0秒にした
  （1.0秒はミトンと腕が画面の半分を占めていた）。`post.py cover --cover-at 2.0` で切った（`post_p2.json` の `cover_at_s` は 1.0 のまま）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は焼いた回 28Tcc0c5sNE（🇲🇰北マケドニアのほったらかしパン&アヒージョつくるぞー！！！）。状態は `PROCESSED`（53秒）
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 2.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-05・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` As4LP4FPzPw・TikTok `done` 7703115629053627654。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-05 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/baguette` を `post.py clean --video baguette` で消す。
