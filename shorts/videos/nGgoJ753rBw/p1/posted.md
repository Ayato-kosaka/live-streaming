# 地下鉄の回 p1 — 出したもの

あやとの「最後のテロップ「※YouTubeで毎日22時から配信」に変えて … その他オッケー」（[#975 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/975#issuecomment-6320025941)、2026-10-21 15:41 UTC）で承認。
出す時刻はこちらから書いた **2026-10-24 19:00 JST（10:00 UTC）**（[#975 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/975#issuecomment-6320234128)）。
上げる直前（17:50 UTC）に #975 を読み直し、時刻を変える返事は無かったので、その時刻の予約投稿にした。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/VP9gim0yrCw | `scheduledTimeSeconds` 1792836000 ＝ 2026-10-24T10:00:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7699182093368036628 | TikTok Studio の一覧の行に `Oct 24, 10:00 AM`（一覧は UTC）。`tt_post.py scheduled` で読み直した |

- 動画の sha256: `27e1e809f04e5c3dfd62c2b8552bb678f0d1f4a90b6c5679ba19929d9b21ba92`（v4、37.2秒、YouTube と TikTok で同じ1本）。
  承認された下見（v3）から、最後のテロップを「※YouTubeで毎日22時から配信」に替え（帳面 F-042）、BGM の頭の無音を切った（F-041）版
- 投稿文: `post_p1.json` と `tt_caption_p1.txt`。字の並びは銅像の回 p2 の形を写した。説明欄には、本編（nGgoJ753rBw、39分から）と
  船に乗った日の回（dWAQsv5jKzY、1:34:00 から）のリンク、声が AI であること、`BGM：ポケットサウンド – https://pocket-se.info/`。
  TikTok のハッシュタグの行に `#ポケットサウンド`。視聴者さんの名前は入れていない
- YouTube: 題・説明（改行まで）が投稿文と1字ずつ一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は本編 nGgoJ753rBw、
  ショートとして入っている（38秒）。予約のタイムゾーンの札は「（GMT+0000）現地時間」
- **サムネイル・カバーは 1.85秒のコマ**（題の札の下に、入ってくる青い扉の地下鉄）。既定の 1.0秒は港の家並みで、題の「地下鉄」が画に無い。
  窓の中の乗客はぶれていて、顔は分からない
- TikTok: キャプション一致・メンションに化けた字なし、カバーは同じ 1.85秒のコマ、公開範囲 Everyone、AI 生成の印はオフ、
  押したボタンの字が Schedule であることを確かめてから押した
- 台帳: `tools/shorts/post/posted.json`（両方 `done`。予約の時刻を `note` に書いた）

## 途中で起きたこと

- 銅像の回 p2 の差し替え（v7 → v8）と同じ回で出した。EC2 はこちらで起こし、終わったあと Chrome を閉じて止めた
- YouTube の本人確認の窓は出なかった

## 公開のあとに確かめること

2026-10-24 10:00 UTC を過ぎたら、`tools/shorts/post/README.md` の「予約の時刻のあとに、出たかを確かめる」のとおり、
EC2 からログインしない `curl` で YouTube の oEmbed（200 で題が返れば公開）と TikTok の `embed/v2`（200 で `secret` が false なら公開）を見て、
Studio と TikTok Studio の一覧でも読み直す。確かめたら #975 を閉じる。

### 公開を確かめた（2026-10-24）

予約の時刻（10:00 UTC）のあと、EC2 からログインしない `curl` で 10:10 UTC に見て、10:14〜10:15 UTC に Studio と TikTok Studio の一覧で読み直した
（Studio は列 `ytstudio`、TikTok Studio は列 `fish` の札を取って読んだ。どちらも待ちなし）。

- YouTube `VP9gim0yrCw`（https://youtube.com/shorts/VP9gim0yrCw）: oEmbed が 200 で題「🇸🇪 ストックホルム来たら、地下鉄が高すぎた！」を返した → 公開。
  Studio の `get_creator_videos` は `privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が無い・
  `timePublishedSeconds` 1792836028（= 10:00:28 UTC）。ショートの一覧（111本を見た）でも同じ題はこの1本だけで、公開
- TikTok `7699182093368036628`（https://www.tiktok.com/@ayato_arigato/video/7699182093368036628）: `embed/v2` が 200・`"secret":false`・
  `createTime` 1792836000（= 10:00:00 UTC）→ 公開。TikTok Studio の一覧の行は予約の時計の札が外れ、`Oct 24, 10:00 AM`・
  公開範囲は選べる「Everyone」（見た時点で再生 14）
- 投稿文（`post_p1.json`）との読み比べ。違ったところは無い
  - YouTube の題・説明欄（`BGM：ポケットサウンド – https://pocket-se.info/` の行とハッシュタグの行まで）が `youtube.title` / `youtube.description` と1字ずつ一致
  - 関連動画は `nGgoJ753rBw`（`youtube.related_video` の本編）
  - TikTok のキャプションは、ログインしない動画のページの `desc` と TikTok Studio の一覧の行のどちらも、
    `tt_caption_p1.txt`（`tiktok.caption` の題の行の下に「YouTube「@あやとグルメアプリ」の生配信から」を足したもの）の改行を空白にしたものと1字ずつ一致
    （TikTok は本文の改行を空白にして持つ。`#ポケットサウンド` も入っている）
- EC2 は止まっていたのでこちらで起こし、読み終えて `ec2.py stop` で止めた。EC2 の `~/cdp/cdp.py` が札を取る前の古い版だったので、
  読む前にリポジトリの版を置き直した（`yt_post.py`・`tt_post.py`・`yt_studio.py`・`ec2-queue` などはリポジトリと同じだった）
