# 猫の触れ合い集 p1 — 出したもの

あやとの「2026/10/29 21:30に出して」（[#1045 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1045#issuecomment-6481805956)）を受けて、
`cats-p1-v6` を **2026-10-29 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/2vKj9g3BAdA | `scheduledTimeSeconds` 1793277000 ＝ 2026-10-29T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7701849085640396053 | TikTok Studio の一覧の行に `Oct 29, 12:30 PM`（一覧は UTC） |

- 動画は `cats-p1-v6`（30.13秒・904コマ）。sha256 `95e6332b7b6f49b12435d0afa1ba698607587f778e7461e66430cd1ea55a11a9` を、書き出しの要約と `qa_p1.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p1.json`。題は「🐱海外の野良猫たち人懐こすぎた！」（札の書体に猫の絵文字が無いので、札には付けず投稿の題にだけ付けた）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画はねるねの回 d8UwWnFhjwY、サムネイルは題の札が見える 1.0秒のコマ。本人確認の窓は出なかった
- TikTok: キャプション一致（メンションに化けた字なし）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で手前まで確かめてから予約した
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` 2vKj9g3BAdA・TikTok `done` 7701849085640396053）

## 公開のあとに確かめること

2026-10-29 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。

## 公開を確かめた

2026-10-29 12:54 UTC、EC2 からログインしない `curl` で:

- YouTube の oEmbed → **200**、題「🐱海外の野良猫たち人懐こすぎた！」
- TikTok の `embed/v2/7701849085640396053` → 1回目で **200・`"secret":false`**

EC2 に送った動画（`~/shorts_post/cats`）は `post.py clean` で消した。
