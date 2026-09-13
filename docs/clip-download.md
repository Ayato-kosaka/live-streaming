# 配信の動画そのものを落とすとき

**この箱からは落とせない。Actions でやる。**（2026-09-12 に確かめた）

## 何が起きるか

`yt-dlp` は形式の一覧までは取れる。取りに行った瞬間に 403 Forbidden になる。
ffmpeg 経由でも、`yt-dlp` 自身の downloader でも、HLS でも DASH でも同じ。
**20回試して20回とも 403。**

## なぜか

媒体の URL（`googlevideo.com`）は**取りに来た IP に紐づけて署名されている**
（`ip=` が `sparams` に入っている＝署名の対象）。
この箱の出口はプロキシで、**接続ごとに別の IP に変わる**。

    $ for i in 1 2 3; do curl -s https://api.ipify.org; echo; done
    160.79.106.137
    160.79.106.131
    160.79.106.128

抽出したときの IP と、取りに行くときの IP が一致しない。だから断られる。
`http_proxy` を ffmpeg に渡しても変わらない。**出口そのものの話**なので。

## PO Token では直らない

「`pot` が無いから弾かれている」も疑って、BotGuard を deno で回して
PO Token を作るところまでやった（`bgutil-ytdlp-pot-provider`）。
**トークンは作れるが、403 は変わらない。** IP の方が原因。

## どうするか

**GitHub Actions のランナーでやる。** ランナーは1つの IP で最後まで通る。
`.github/workflows/clip_day1.yml` がその形。媒体は 17 秒で取れた。

渡し口は **artifact しかない。** 置き場（Firebase Storage）に書けるのは
Functions だけで（#283）、あの口は小さな絵しか受け取らない。
この箱には `FIREBASE_SERVICE_ACCOUNT` も無いので、そもそも頼めない。

## コメントの記録は、この箱でも取れる

`--write-subs --sub-langs live_chat` は別の口なので通る。
各行に `videoOffsetTimeMsec` が入っていて、**配信内の位置がそのまま取れる。**
15時間を目で探さずに済む。ボット確認は出たり出なかったりするので、
出たら少し待って別の `player_client` で試す。**Cookie は使わない。**
