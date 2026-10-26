# 滝の回 p2 — 出したもの

あやとの「冒頭の映像だけもっとこだわって欲しい。とはいえ、良い映像がないよね？犬出すとかかな？そこだけ直したら2026/10/26 21:30に投稿」
（[#1019 のコメント](https://github.com/Ayato-kosaka/live-streaming/issues/1019#issuecomment-6376656920)、2026-10-23 23:17 UTC）を受けて、
冒頭を子犬に差し替えた v4 を **2026-10-26 21:30 JST（12:30 UTC）の予約投稿**にした。投稿先が時刻に出すので、こちらのセッションが止まっていても出る。

| 場所 | URL | 予約の時刻（読み直した値） |
| --- | --- | --- |
| YouTube | https://youtube.com/shorts/NibbSNmx0U8 | `scheduledTimeSeconds` 1793017800 ＝ 2026-10-26T12:30:00Z（一般公開・予約済み。それまでは非公開） |
| TikTok | https://www.tiktok.com/@ayato_arigato/video/7700034754187513108 | TikTok Studio の一覧の行に `Oct 26, 12:30 PM`（一覧は UTC）。`tt_post.py scheduled` で読み直した |

- 動画は冒頭を犬に差し替えた `ldg-p2-v4`（48.73秒・1462コマ・52,496,685 バイト、YouTube と TikTok で同じ1本）。
  sha256 `b2d980b4c5e229e236906e2a8fb1718c2795771e73b882bbafd953c8ae5fd958` を、`qa_p2.md` の控えの全桁と照らしてから使い、
  EC2 に送ったあとも EC2 の上で同じ値を照らした（上げる段と予約の段の直前にも照らした）。mp4 は Actions の書き出し（run 40045228226）の置き場から取った
- 投稿文: `post_p2.json`（`publish_at` は 2026-10-26T12:30:00Z。題・本文の字は変えていない）と `tt_caption_p2.txt`
- YouTube: 題・説明（改行まで）が投稿文と1字ずつ一致、子ども向けでない、改変されたコンテンツ「いいえ」、関連動画は元の配信 LdgTh1DC3Jk、
  サムネイルは題の札と駆けてくる子犬が見える 1.0秒のコマ、ショートとして入っている（49秒）。予約のタイムゾーンの札は「（GMT+0000）現地時間」。
  同じ題のショートは Studio に NibbSNmx0U8 の1本だけ（`yt_post.py dup`）、ログインなしの oEmbed は 403（予約中）
- TikTok: キャプション一致（メンションに化けた字なし）、カバーは同じ 1.0秒のコマ、公開範囲 Everyone、AI 生成の印と投稿内容の開示はオフ。
  押したボタンの字が Schedule であることを確かめてから押した。一覧にこの題の行は1本だけ、ログインなしの `embed/v2` は 400（予約中）
- 台帳: `tools/shorts/post/posted.json`（YouTube `done`、TikTok は1回目の `pending` と2回目の `done`。予約の時刻を `note` に書いた）

## 途中で起きたこと

- 遠隔デスクトップの見張りは一度も止めなかった（`desktop-input` は `xi2-never`。PR #1016 の形のまま、待ちなしで通った）。YouTube の本人確認の窓も出なかった
- **同じ時刻に、別の担当が別のショートを EC2 から出していた**（`~/shorts_post/` に別の動画の置き場があり、TikTok は fish の Chrome で `tt_post.py` を回していた）。
  こちらは鍵 `~/locks/fish-voice` が空いているのを見てから取ったが、あちらはその鍵を見ずに回していた
- **TikTok の1回目は、中身を1行も出さずに落ちた。** `tt_post.py` の `fresh_tab` は新しいタブを作って**ほかのタブを全部閉じる**。こちらの投稿の段が
  始まった十数秒後に、あちらの `tt_post.py --dry` が同じ Chrome で始まり、こちらのタブが閉じられた（EC2 で、あちらの `tt_post.py` が 01:01:57 UTC に
  始まったのを `ps` で見た。こちらの段は 01:01:45 に台帳へ `pending` を書いて始まっている）。予約を押す所（上げてから約65秒）には届いていない。
  台帳が `pending` で止まったので、TikTok Studio の一覧をこの題で引いて0件（`check` と `scheduled` の両方）を見てから、`--again` でやり直した
- やり直しは `post.py` の台帳の挟み方（`posting`）をそのまま使い、本体の直前に「EC2 で `tt_post.py` / `yt_post.py` / `yt_thumb.py` が走っていないのを待つ」を足して回した。
  YouTube の段の前にも、同じ道具が走っていないのを `ps` で見てから回した（`yt_post.py` の `studio()` も同じ Chrome に新しいタブを作る）
- TikTok の `embed/v2` は 503 が2回混じった（同じ時に公開済みの別の投稿は 200）。TikTok 側の一時的なもので、ほかの回は 400

## 公開のあとに確かめること

2026-10-26 12:30 UTC を過ぎたら、`tools/shorts/post/README.md` の「予約の時刻のあとに、出たかを確かめる」のとおり、
EC2 からログインしない `curl` で YouTube の oEmbed（200 で題が返れば公開）と TikTok の `embed/v2`（200 で `secret` が false なら公開）を見て、
Studio と TikTok Studio の一覧でも読み直す。見るのは NibbSNmx0U8 と 7700034754187513108。

### 公開を確かめた（2026-10-26）

予約の時刻（12:30 UTC）のあと、EC2 からログインしない `curl` で 13:00 UTC ごろに見て、続けて Studio と TikTok Studio の一覧で読み直した
（Studio は列 `ytstudio`、TikTok Studio は列 `fish` の札を取って読んだ。どちらも待ちなし。読み終えて `down()` で Chrome を閉じた）。

- YouTube `NibbSNmx0U8`（https://youtube.com/shorts/NibbSNmx0U8）: oEmbed が 200（1回目で）で題「🇬🇪ジョージアで滝を観に行こうと思ったら大惨事に！」を返した → 公開。
  Studio の `get_creator_videos` は `privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null・
  `timePublishedSeconds` 1793017832（= 12:30:32 UTC）・`CREATOR_CONTENT_TYPE_SHORTS`（49秒）・`VIDEO_STATUS_PROCESSED`。ショートの一覧でも同じ題の行はこの1本だけ
- TikTok `7700034754187513108`（https://www.tiktok.com/@ayato_arigato/video/7700034754187513108）: `embed/v2` は 503 が2回混じって3回目で 200・`"secret":false` → 公開。
  ログインしない動画のページも `secret` false・`privateItem` false・`createTime` 1793017800（= 12:30:00 UTC）。
  TikTok Studio の一覧でこの題の行は1本だけ（`find_posts` の当たりもこの投稿の URL 1つ）で、行の時刻は `Oct 26, 12:30 PM`
- 投稿文（`post_p2.json`）との読み比べ。違ったところは無い
  - YouTube の題・説明欄（`BGM：ポケットサウンド – https://pocket-se.info/` の行とハッシュタグの行まで）が `youtube.title` / `youtube.description` と1字ずつ一致
  - 関連動画は `LdgTh1DC3Jk`（`videoLinkageShortsAttribution`。`youtube.related_video` の本編）
  - TikTok のキャプションは、ログインしない動画のページの `desc` と TikTok Studio の一覧の行のどちらも、
    `tt_caption_p2.txt`（＝ `tiktok.caption`）の改行を空白にしたものと1字ずつ一致（`#ポケットサウンド` も入っている）
- EC2 は止まっていたのでこちらで起こし、読み終えて札を返してから `ec2.py stop` で止めた（`--force` なし。止める前に `ec2.py queue` で列が空いているのを見た）。
  EC2 の `yt_studio.py`・`yt_post.py`・`tt_post.py`・`cdp.py` はリポジトリと同じだった（sha256 で突き合わせた）
