# 城塞の夕日と野良犬の回 p1 — 出したもの

あやとの「2026/10/22 19:00 に出して」（[#977 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/977#issuecomment-6310722951)、2026-10-21 07:39 UTC）を受けて、
**2026-10-22 19:00 JST（10:00 UTC）の予約投稿**にした。投稿先が時刻に出すので、こちらのセッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/mdbEL8b5b_8 | `scheduledTimeSeconds` 1792663200 ＝ 2026-10-22T10:00:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7699048596204834068 | TikTok Studio の一覧の行に `Oct 22, 10:00 AM`（一覧は UTC）。`tt_post.py scheduled` で読み直した |

- 動画の sha256: `6ccb162b31e57a3c212e2965519434955631b7c32773d423bea999230ba2c986`（51.13秒、YouTube と TikTok で同じ1本）
- 投稿文: `post_p1.json` と `tt_caption_p1.txt`。完成の下見（[#977 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/977#issuecomment-6308021517)）で書いたとおり、
  説明欄に城塞の回（TDArug_te90）と夕日の回（WJ8KEi1V-no）のリンクと、声が AI であることを入れた。字の並びは最安ホステルの回 p2 の形を写した
  （TikTok のキャプションはホステルの回と同じく URL を貼らず、題の下に「YouTube「@あやとグルメアプリ」の生配信から」）
- YouTube: 題・説明（改行まで）が投稿文と1字ずつ一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 TDArug_te90、
  サムネイルは題の札と犬の顔が見える 1.1秒のコマ、ショートとして入っている（52秒）
- TikTok: キャプション一致、カバーは同じ 1.1秒のコマ、公開範囲 Everyone、AI 生成の印はオフ
- 台帳: `tools/shorts/post/posted.json`（両方 `done`。予約の時刻を `note` に書いた）

## 途中で起きたこと

- TikTok の予約の道具は今日の日付にしか入れられなかったので、日付の暦を送って日を押す手を足した
  （`tt_post.py` の `set_date`・`pick_day`。見張りは `tt_post_selftest.py`。手順は `tools/shorts/post/README.md` の「予約投稿」）
- 1回目の TikTok は、時刻の選ぶ欄が「開いたまま」と見て、Schedule を押す前に止まった（押していない。台帳の pending）。
  閉じた欄もますの幅は残る作りで、開いているかを幅で見ていたのが誤りだった。高さで見るよう直して `--again` でやり直した
- EC2 を起こした直後と、Studio・TikTok で動画を開いた手のあとは、遠隔デスクトップの見張りが「入力から7分以内」で止める。
  遠隔デスクトップの接続は無かった。見張りは外さず、1手ごとに無操作が7分を超えるのを待ってから回した
- YouTube の本人確認の窓は、今回は出なかった
