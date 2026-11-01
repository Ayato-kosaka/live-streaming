# リーズの回 p3 — 出したもの

あやとの「2026/11/06 21:30 にだして」（[#1051 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1051#issuecomment-6550068971)。フックに地図のアニメーションを入れた v5 の下見への返事）を受けて、
`leeds-p3-v5` を **2026-11-06 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/cJbIZUniHqk | `scheduledTimeSeconds` 1793968200 ＝ 2026-11-06T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7702978071061630229 | TikTok Studio の一覧の行に `Nov 6, 12:30 PM`（一覧は UTC） |

- 動画は `leeds-p3-v5`（45.53秒）。sha256 `3985cb919ce36d9b9732244398ee14440e6d40346b945da3e94b7b4d2750d27e` を、`qa_p3.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p3.json`（題「🇬🇧イギリス第三の街を、1日歩いて回ったらやばかった！」。`publish_at` を両方 2026-11-06T12:30:00Z にした。字は変えていない）
- **サムネイルとカバーは 0.5秒のコマ**（ほかの回の 1.0秒ではない）。1.0秒は「リーズの中心部」の札が開いた直後で、札の中がまだ空（白い四角に縮尺と方角だけ）だった。
  0.5秒は題の札とイギリスの地図に「3 リーズ・2 バーミンガム・1 ロンドン」が出ていて、題の「第三の街」がそのまま見える。2.4秒（道のりが描き終わった札）も見て、小さく出たときに読みやすい 0.5秒にした。
  `post.py cover --cover-at 0.5` で切った（`post_p3.json` の `cover_at_s` は 1.0 のまま。投稿文の字は変えない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 S5yf_Ir50xU（【神回】イギリス第三の街リーズを歩く！…）
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 0.5秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-06・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` cJbIZUniHqk・TikTok `done` 7702978071061630229。どちらも `note` に予約の時刻）

## 公開のあとに確かめること

2026-11-06 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/S5yf_Ir50xU` を `post.py clean` で消す。
