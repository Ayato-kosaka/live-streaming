# グルメの回 p3 — 出したもの

あやとの「Cで。2026/10/31 21:30にだして」（[#1046 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1046#issuecomment-6483220474)）を受けて、
相席の行の画は v2 のまま（相席の人の皿は配信に写っていない。`qa_p3.md` の探した記録）で、`cosmos-p3-v2` を **2026-10-31 21:30 JST（12:30 UTC）の予約投稿**にした。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/IZpZGM5Xbyg | `scheduledTimeSeconds` 1793449800 ＝ 2026-10-31T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7701868585764916500 | TikTok Studio の一覧の行に `Oct 31, 12:30 PM`。同じ題の行は1本だけ |

- 動画は `cosmos-p3-v2`（40.10秒・1203コマ）。sha256 `73c7c4b18fe5fc041c7c29ad77f231d24428ddf4e94bb0df83bd534cbf7c7655` を、書き出しの要約と `qa_p3.md` の控えの全桁と照らしてから使い、EC2 に送ったあとも EC2 の上で照らした
- 投稿文: `post_p3.json`（題「🇲🇰北マケドニアの行列店の大衆食堂を食べてみた！」）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 UQdkUSro9Ck、サムネイルは題の札とチェバピ・豆の煮込みが見える 1.0秒のコマ
- TikTok: キャプション一致、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` IZpZGM5Xbyg・TikTok `done` 7701868585764916500）

## 途中で起きたこと

- **TikTok の段が、カバーの窓を開いた直後に黙って止まった**（本番2回・`--dry` 1回）。窓の中身が遅れて出て、3秒ではまだ「Upload cover」の字が無く、
  `click_text` が投げていた。`post.py` の `remote_run` は `ec2.run(quiet=True)` で stderr を返さないので、例外が手元に見えなかった
- 止まるたびに `tt_post.py scheduled` / `check` で一覧を引き、**この題の予約も下書きも無い**のを見てから `--again` でやり直した
- 直したもの: `tt_post.py` は字が出るまで最長20秒待ち、出なければ `cover_upload_tab` で止めて返す。`post.py` の TikTok の段は `2>&1` で traceback ごと持ち帰る。
  直した版で1回目に通った（字が出るまで約7秒待っていた）

## 公開のあとに確かめること

2026-10-31 12:30 UTC を過ぎたら、EC2 からログインしない `curl` で YouTube の oEmbed（200 で題）と TikTok の `embed/v2`（200 で `secret` が false）を見る。
