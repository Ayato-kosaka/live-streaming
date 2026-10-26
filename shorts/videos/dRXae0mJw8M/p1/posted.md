# カズベキの動物たちの回 p1 — 出したもの

あやとの「完璧です 2026/10/25 21:30に投稿して」（[#1020 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1020#issuecomment-6376680974)、2026-10-23 23:19 UTC）を受けて、
**2026-10-25 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、こちらのセッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/3Z2Kq-H0BCo | `scheduledTimeSeconds` 1792931400 ＝ 2026-10-25T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7700013140997672210 | TikTok Studio の一覧の行に `Oct 25, 12:30 PM`（一覧は UTC）。`tt_post.py scheduled` で読み直した |

- 動画は完成の下見に出した `drx-p1-v3`（50.77秒・1523コマ・48,243,622 バイト、YouTube と TikTok で同じ1本）。
  sha256 `7510c83335717eb16c92472ef5cbb951eb3e091f305a800ca72b2d1b4f308810` を、`qa_p1.md` の控えの全桁と照らしてから使い、
  EC2 に送ったあとも EC2 の上で同じ値を照らした（上げる段と予約の段の直前にも照らした）。mp4 は Actions の書き出し（run 40033465554）の置き場から取った
- 投稿文: `post_p1.json`（`publish_at` を 2026-10-25T12:30:00Z にした。題・本文の字は下見のときと同じ）と `tt_caption_p1.txt`
- YouTube: 題・説明（改行まで）が投稿文と1字ずつ一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 dRXae0mJw8M、
  サムネイルは題の札が見える 1.0秒のコマ、ショートとして入っている（51秒）。予約のタイムゾーンの札は「（GMT+0000）現地時間」。
  同じ題のショートは Studio に 3Z2Kq-H0BCo の1本だけ（`yt_post.py dup`）、ログインなしの oEmbed は 403（予約中）
- TikTok: キャプション一致（メンションに化けた字なし）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。
  押したボタンの字が Schedule であることを確かめてから押した。一覧にこの題の行は1本だけ、ログインなしの `embed/v2` は 400（予約中）
- 台帳: `tools/shorts/post/posted.json`（両方 `done`。予約の時刻を `note` に書いた）

## 途中で起きたこと

- 遠隔デスクトップの見張りは一度も止めなかった（`desktop-input` は `xi2-never`。PR #1016 の形のまま、待ちなしで通った）。YouTube の本人確認の窓も出なかった
- TikTok は fish の Chrome を使うので、鍵 `~/locks/fish-voice` が空いているのを見てから取り、終わって外した
- 予約が両方済んだあと、YouTube の同じ題の数え直しの最中（23:45 UTC）に、EC2 がほかの手で止められた（`Client.UserInitiatedShutdown`。起こしたのはこちらではない）。
  予約は投稿先に入っているので影響はない。読み直し・鍵を外す・送った動画を消すために自分で起こし、済んでから開いた Chrome を閉じて止めた
- TikTok の `embed/v2` は1回目と2回目が 503 だった。公開済みの別の投稿でも同じ時に 503 が出ていたので、TikTok 側の一時的なもの。3回目で 400

## 公開のあとに確かめること

2026-10-25 12:30 UTC を過ぎたら、`tools/shorts/post/README.md` の「予約の時刻のあとに、出たかを確かめる」のとおり、
EC2 からログインしない `curl` で YouTube の oEmbed（200 で題が返れば公開）と TikTok の `embed/v2`（200 で `secret` が false なら公開）を見て、
Studio と TikTok Studio の一覧でも読み直す。見るのは 3Z2Kq-H0BCo と 7700013140997672210。

### 公開を確かめた（2026-10-25）

予約の時刻（12:30 UTC）のあと、EC2 からログインしない `curl` で 12:50 UTC に見て、12:51〜12:53 UTC に Studio と TikTok Studio の一覧で読み直した
（Studio は列 `ytstudio`、TikTok Studio は列 `fish` の札を取って読んだ。どちらも待ちなし。読み終えて `down()` で Chrome を閉じた）。

- YouTube `3Z2Kq-H0BCo`（https://youtube.com/shorts/3Z2Kq-H0BCo）: oEmbed が 200 で題「🇬🇪海外の山奥に来たら、動物たちがはちゃめちゃすぎた！」を返した
  （`youtube.title` と1字ずつ一致）→ 公開。Studio の `get_creator_videos` は `privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null・
  `timePublishedSeconds` 1792931419（= 12:30:19 UTC）・`CREATOR_CONTENT_TYPE_SHORTS`（51秒）。ショートの一覧（111本を見た）でも同じ題はこの1本だけで、公開
- TikTok `7700013140997672210`（https://www.tiktok.com/@ayato_arigato/video/7700013140997672210）: `embed/v2` が 200（1回目で）・`"secret":false`・
  `createTime` 1792931400（= 12:30:00 UTC）→ 公開。ログインしない動画のページも `secret` false・`privateItem` false。
  TikTok Studio の一覧の行は予約の時計の札が外れ、`Oct 25, 12:30 PM`・公開範囲は選べる「Everyone」（見た時点で再生 14）。この題の行は1本だけ
- 投稿文（`post_p1.json`）との読み比べ。違ったところは無い
  - YouTube の題・説明欄（`BGM：ポケットサウンド – https://pocket-se.info/` の行とハッシュタグの行まで）が `youtube.title` / `youtube.description` と1字ずつ一致
  - 関連動画は `dRXae0mJw8M`（`videoLinkageShortsAttribution`。`youtube.related_video` の本編）
  - TikTok のキャプションは、ログインしない動画のページの `desc` と TikTok Studio の一覧の行のどちらも、
    `tt_caption_p1.txt`（＝ `tiktok.caption`）の改行を空白にしたものと1字ずつ一致（`#ポケットサウンド` も入っている）
- EC2 は止まっていたのでこちらで起こし、読み終えて札を返してから `ec2.py stop` で止めた（`--force` なし）。
  EC2 の `yt_post.py`・`tt_post.py`・`yt_studio.py`・`cdp.py`（版 2）はリポジトリと同じだった
