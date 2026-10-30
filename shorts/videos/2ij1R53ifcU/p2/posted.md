# 髭剃りの回 p2 — 出したもの

あやとの「2026/10/30 21:30にだして」（[#1047 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1047#issuecomment-6481872005)）を受けて、
`razor-p2-v2` を **2026-10-30 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、セッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/XMxoa-BWRME | `scheduledTimeSeconds` 1793363400 ＝ 2026-10-30T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7701852652023418118 | TikTok Studio の一覧の行に `Oct 30, 12:30 PM`（一覧は UTC） |

- 動画は `razor-p2-v2`（38.77秒）。sha256 `07935a196be07925468f93d34ae276d766cdc4522727a5d15af324897c0bb762` を、書き出しの要約と `qa_p2.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p2.json`（題「🇦🇱アルバニアでの髭剃り探しが大変すぎた！」）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 2ij1R53ifcU、サムネイルは題の札と龍の髭剃りが見える 1.0秒のコマ
- TikTok: キャプション一致、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。`--dry` で手前まで確かめてから予約した
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` XMxoa-BWRME・TikTok `done` 7701852652023418118）

## 公開のあとに確かめること

2026-10-30 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。

## 公開を確かめた（2026-10-30 13:10 UTC）

- YouTube: oEmbed が 200 で、題「🇦🇱アルバニアでの髭剃り探しが大変すぎた！」が返った
- TikTok: `embed/v2/7701852652023418118` が 200 で `"secret":false`（はじめの5回は 503、15秒あけて取り直したら 200）。oEmbed も 200
- EC2 の `~/shorts_post/2ij1R53ifcU` は `post.py clean` で消した
