# ホステルの回 p4 — 出したもの

あやとの「オッケーです。21：30に出して」（[#1043 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1043#issuecomment-6467867613)、2026-10-28）を受けて、
`hostel-p4-v5` を **2026-10-28 21:30 JST（12:30 UTC）** に出した。

| 場所 | URL | 出た時刻 |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/CSE9FVCRdlw | 21:31:18 JST に一般公開（予約ではなく、21:30:05 から即時公開の段を回した） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7701684666276793618 | 21:30 JST の予約（TikTok Studio が時刻に出した） |

- 動画は `hostel-p4-v5`（38.03秒・1141コマ）。sha256 `2fd5711ca2c87ba7dbb5b5dca292bd2b423f7a48d1b21dd3bee21f4364f97aac` を `qa_p4.md` の控えと照らし、EC2 に送ったあとも EC2 の上で照らした。YouTube と TikTok で同じ1本
- 投稿文: `post_p4.json`（題・本文の字は変えていない）
- YouTube: 題・説明が投稿文と一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 vZ2O8pabk1g、サムネイルは題の札が見える 1.0秒のコマ
- 台帳: `tools/shorts/post/posted.json`（YouTube `done` CSE9FVCRdlw、TikTok `done` 7701684666276793618）

## 途中で起きたこと

- **YouTube の上げる画面で「本人確認 — 続行するには、本人確認を行う必要があります」の窓が出て止まった**（20:47 JST ごろ）。「次へ」の先は Google のパスワードの画面なので、こちらでは進めず、#1043 であやとに頼んだ（`call_ayato.yml` で通知）。
  窓に隠れて詳細の欄が押せず、`yt_post.py draft` は `details_not_set` で落ち、台帳は `pending` のまま残った
- あやとが遠隔デスクトップで本人確認を通したあと、Studio に「非公開として保存済み」で残っていた下書き CSE9FVCRdlw を `yt_post.py resume` で続きから進めた。
  投稿の待ち（遠隔デスクトップの入力が7分ない）を `desktop-input idle` で見てから回した（本物の遠隔デスクトップで `xi2` を返した。137,245ms → 451,255ms）
- 台帳は `post.py mark --place youtube --done --id CSE9FVCRdlw` で `done` にした（下書きを作った段の続きなので `--again` は使っていない）
- **予約は15分以上先しか受け付けない**（`yt_post.py` の `too_soon`。21:16 JST の時点で 21:30 は14分後）。なので予約ではなく、12:30:05 UTC まで待ってから `yt-publish` を即時公開で回した

## 公開を確かめた

2026-10-28 12:32 UTC ごろ、EC2 からログインしない `curl` で:

- YouTube の oEmbed → **200**、題「🇲🇰海外ホステルを追い出されました！」
- TikTok の `embed/v2/7701684666276793618` → 1回目 503（TikTok 側の一時的なもの。滝の回でも混じった）、2回目 **200・`"secret":false`**
- `yt-publish` の返事で Studio の `privacy` が `VIDEO_PRIVACY_PUBLIC`
