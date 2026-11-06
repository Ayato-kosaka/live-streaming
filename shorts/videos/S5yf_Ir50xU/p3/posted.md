# リーズの回 p3 — 出したもの

あやとの「2026/11/06 21:30 にだして」（[#1051 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1051#issuecomment-6550068971)。フックに地図のアニメーションを入れた v5 の下見への返事）を受けて、
`leeds-p3-v5` を **2026-11-06 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/cJbIZUniHqk | `scheduledTimeSeconds` 1794832200 ＝ **2026-11-16T12:30:00Z**（一般公開・予約済み。それまでは非公開）。はじめは 11/6、2026-11-06 に動かした（下の「11/16 への移動」） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7705026584759176469 | TikTok Studio の一覧の行に `Nov 16, 12:30 PM`（一覧は UTC）。入れ直した投稿（前の ID は 7702978071061630229） |

- 動画は `leeds-p3-v5`（45.53秒）。sha256 `3985cb919ce36d9b9732244398ee14440e6d40346b945da3e94b7b4d2750d27e` を、`qa_p3.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p3.json`（題「🇬🇧イギリス第三の街を、1日歩いて回ったらやばかった！」。`publish_at` を両方 2026-11-06T12:30:00Z にした。字は変えていない）
- **サムネイルとカバーは 0.5秒のコマ**（ほかの回の 1.0秒ではない）。1.0秒は「リーズの中心部」の札が開いた直後で、札の中がまだ空（白い四角に縮尺と方角だけ）だった。
  0.5秒は題の札とイギリスの地図に「3 リーズ・2 バーミンガム・1 ロンドン」が出ていて、題の「第三の街」がそのまま見える。2.4秒（道のりが描き終わった札）も見て、小さく出たときに読みやすい 0.5秒にした。
  `post.py cover --cover-at 0.5` で切った（`post_p3.json` の `cover_at_s` は 1.0 のまま。投稿文の字は変えない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 S5yf_Ir50xU（【神回】イギリス第三の街リーズを歩く！…）
- TikTok: キャプション一致（題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」）、カバーは同じ 0.5秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で日時の欄（2026-11-06・12:30）まで確かめてから予約した。読み直しで、この題の行は1本だけ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` cJbIZUniHqk・TikTok `done` 7702978071061630229。どちらも `note` に予約の時刻）

## 11/16 への移動（2026-11-06）

あやとの「2026/11/06 21:30にだして。元々あったやつは2026/11/16」（[#1108 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1108#issuecomment-6672818460)）で、
11/6 の枠をチキンシチューの回（#1108）に譲り、この回を **2026-11-16 21:30 JST（12:30 UTC）** に動かした。同じ日に2本出ないよう、**この回を先に動かしてから**チキンシチューを予約した。

- 00:19Z に YouTube Studio の詳細ページで「本人確認」の窓が出て止まった（「次へ」は押さず、何も打っていない）。あやとが 11:40Z ごろ遠隔デスクトップで通し、入力が7分止まるのを待ってから続けた
- **YouTube（時刻だけ。動画は差し替えていない）**: `yt_post.py publish cJbIZUniHqk --at 2026-11-16T12:30:00Z` を `--dry`（2026/11/16・12:30・タイムゾーン「（GMT+0000）現地時間」）→ 本番（11:49Z）。
  読み直した: `scheduledTimeSeconds` 1794832200・`SCHEDULED_PUBLISHING_STATUS_SCHEDULED`・`VIDEO_PRIVACY_PRIVATE`・関連動画 S5yf_Ir50xU。12:31Z の oEmbed は 403（公開されていない）
- **TikTok（予約ごと消して入れ直した）**: `tt_post.py delete 7702978071061630229 イギリス第三の街を 2026-11-06T12:30:00Z`（11:55Z。行の札 `Nov 6, 12:30 PM` を見てから消した）。
  読み直した: 一覧（`check`）に同じ題の行が0本・ログインなしの `embed/v2/7702978071061630229` が 400。
  EC2 に残っていた同じ mp4（`p3.mp4`、`3985cb91…d27e`）・`tt_caption_p3.txt`（手元の `post_p3.json` から組んだキャプションと sha256 一致）・`p3_cover.jpg`（手元で 0.5秒のコマを切り直したものとバイト単位で同じ）で、
  `post.py tt-post --video S5yf_Ir50xU --option p3 --cover --sha … --at 2026-11-16T12:30 --again` を入れた（11:58Z。締め切りが近かったので `--dry` は回さず、本番の段がキャプション・日時の欄・ボタンの字 Schedule を確かめてから押した）。
  新しい投稿 ID は **7705026584759176469**。読み直しで、この題の行は1本だけ・`Nov 16, 12:30 PM`
- 投稿文 `post_p3.json` の `publish_at` を両方 2026-11-16T12:30:00Z にした（字は変えていない）
- 台帳: YouTube の行の `note` に時刻を動かしたこと、消した TikTok の行の `note` に消したことと読み直した値、入れ直した行は新しい行（`again`）

## 公開のあとに確かめること

2026-11-16 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
そのあと Studio（`privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と TikTok Studio の一覧（時計の札が外れて Everyone）でも読み直し、
EC2 の `~/shorts_post/S5yf_Ir50xU` を `post.py clean` で消す。
