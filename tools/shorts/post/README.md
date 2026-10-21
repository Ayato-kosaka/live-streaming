# ショートを出す（YouTube Studio と TikTok の web、EC2 の Chrome から）

投稿の道は #911 で決まっている: **あやとの依頼で、EC2 のログイン済み Chrome をこちらが操作して出す。**
YouTube の API 鍵は使わない。EC2 と Chrome の触り方は `.claude/skills/ec2-chrome/SKILL.md`、
Studio の読み書きは `.claude/skills/youtube-studio/SKILL.md`。

| ファイル | どこで動く | 何をするか |
| --- | --- | --- |
| `post.py` | 手元 | 入口。`send`（送る）・`cover`（題の札のコマを切り出して送る）・`yt-draft`・`yt-related`・`yt-thumb`・`yt-publish`・`tt-post`・`clean` |
| `yt_thumb.py` | EC2（`~/cdp/`） | Studio: サムネイルを絵のファイルに差し替えて保存 |
| `send.py` | 手元 | 動画・投稿文・題の札の絵を EC2 へ送り、EC2 で sha256 を照らす。GCS の `transfer/` に置いて、EC2 には署名付き URL を `curl` で落とさせる（下の「EC2 への送りかた」）。`clean` で送った動画を消す |
| `yt_post.py` | EC2（`~/cdp/`） | Studio: 上げる → 非公開で保存 → 関連動画 → 公開。結果は最後の `RESULT {...}` の1行 |
| `tt_post.py` | EC2（`~/cdp/`） | TikTok Studio: 上げる → キャプションを貼る → 設定を読む → 投稿（`--dry` で手前まで）。予約の日を暦で押す手の見張りは `tt_post_selftest.py`（手元で回る。EC2 に触らない） |
| `posted.py` / `posted.json` | 手元（git に入れる） | 出した記録の台帳（動画の sha256 × 場所 → 状態・投稿 ID）。投稿の段が EC2 に触る前に引く。見張りは `posted_selftest.py` |

## 手順（1本ぶん）

```bash
D=<動画と投稿文の置き場（A.mp4 post_A.json …）>
python3 tools/shorts/post/post.py send       --dir $D --video <元の動画ID> --option A   # 1分ほど（ほとんどが Actions の URL 待ち）
python3 tools/shorts/post/post.py yt-draft   --video <元の動画ID> --option A --sha <sha256>   # 非公開で保存。ショートの ID が出る（sha256 は send が出す mp4_sha256）
python3 tools/shorts/post/post.py yt-related --video <元の動画ID> --id <ショートのID>   # 関連動画に元のアーカイブ
python3 tools/shorts/post/post.py cover      --dir $D --video <元の動画ID> --option A   # 題の札が見えるコマ（既定 1.0秒）を切り出して送る
python3 tools/shorts/post/post.py yt-thumb   --video <元の動画ID> --option A --id <ショートのID>   # それをサムネイルに
python3 tools/shorts/post/post.py tt-post    --video <元の動画ID> --option A --dry --cover   # 投稿の手前まで確かめる
# 出すのは、あやとが issue かチャットで「出して」と言った案だけ。EC2 の mp4 の sha256 を照らして出す
python3 tools/shorts/post/post.py yt-publish --video <元の動画ID> --option A --id <ショートのID> --sha <sha256>   # --video/--option が無いと EC2 の mp4 を引けず MISMATCH で止まる
python3 tools/shorts/post/post.py tt-post    --video <元の動画ID> --option A --cover --sha <sha256>
python3 tools/shorts/post/post.py clean      --video <元の動画ID>                     # 送った動画を消す（SSM のログには触らない）
```

- **同じ動画を同じ場所へ2回出さない**（#920）。`yt-draft` と `tt-post` は EC2 に触る前に台帳 `posted.json` を引き、
  同じ sha256 × 同じ場所が `done` なら投稿 ID を出して止まる。`pending`（前の回が途中で切れた）でも止まるので、
  投稿先で見てから、出ていれば `post.py mark --place <youtube|tiktok> --sha <sha256> --done --id <投稿ID>`、
  出ていなければ `--again` を付けてやり直す。始める直前に `pending`、ID が取れたら `done` を書く。**台帳が変わったらコミットする**
- EC2 で Chrome を開く手は、どれも**遠隔デスクトップの入力が7分止まっているのを見てから**動く（`post.py` の `GUARD`）。
  あやとが触っている最中なら `desktop_busy` で何もせずに戻る
- 待つあいだは `~/locks/shorts-post` を触って見張り（idle-stop）に止められないようにしている。終わったら消す
- 媒体の決まり（あやと）:
  - YouTube: 曲は動画に焼いてあるので付けない。子ども向けではない。改変されたコンテンツは「いいえ」（声は特定の人のまねではない AI の読み上げで、説明欄に書いてある）。**関連動画に元のアーカイブ**（2026-10-17）
  - **サムネイル（YouTube）とカバー（TikTok）は、題の札が見えるコマ**（2026-10-17。`cover` で切り出した絵を上げる。コマを選ぶ窓より、どのコマになるかが確か）
  - TikTok: キャプションは `post_*.json` の `tiktok.caption` の**題の行のすぐ下に「YouTube「@あやとグルメアプリ」の生配信から」**（2026-10-17、`post.py` の `TT_SOURCE_LINE` が足す）。音源は付けない。AI 生成の印は付けない
  - **BGM のクレジットは `post_*.json` に手で書く**（道具は足さない）。2026-10-21 からの曲（ポケットサウンドの「クシコス・ポスト」）は、
    `description` と `tiktok.caption` の「ナレーションは AI 音声を使用しています。」の次の行に `BGM：ポケットサウンド – https://pocket-se.info/`、
    `tiktok.caption` のハッシュタグの行に `#ポケットサウンド`（ポケットサウンドの規約。決めた理由は `docs/shorts.md` 4）。
    城塞の回 #977 までの `post_*.json` は `BGM: OtoLogic（CC BY 4.0）` なので、写したら書き換える

## EC2 への送りかた（2026-10-18 から）

**中身を SSM のコマンドに載せない。** 前の `send.py` は動画を base64 に割って SSM の send-command に載せていて、
動画がそのまま EC2 の SSM エージェントのログに残った。送ったあとにログを消していたが、2026-10-18 に
「監査ログの改ざん」として安全確認に止められたので、**ログは消さない**（消す・空にする・回すのどれもしない）。
いまは:

1. `send.py` が Actions（「ショートの下見を置く」、依頼の place は `transfer`）に署名付き URL を頼む。
   結果はこの回だけの鍵で包んで作業枝に返り、開いたら作業枝から下ろす
2. 作業箱から GCS の `transfer/` に直に上げる（上げる URL は1時間）
3. EC2 に `curl` で落とさせ、EC2 の上で sha256 を照らす。**SSM のコマンドに載るのは URL だけ**
4. 照らし終わったら（落ちても）GCS のものをすぐ消す

- **URL は EC2 のログに残る。それは仕方ないとする。** 見る URL の寿命は3時間で、4 で消したあとは 404。
  置いたものも1日で消える（バケットの寿命の決まり。`uploads/` の30日・`preview/` `render/` の14日はそのまま）
- **URL は標準出力・コミット・issue に出さない。** `send.py` は名前・大きさ・秒・sha256・HTTP の数だけを出す。
  鍵と開いた URL は一時の場所（リポジトリの外）に置き、終わったら消す
- `post.py` の道具（`yt_post.py` など）は `ec2.py put` のまま。中身はリポジトリの公開物と同じなので、ログに残っても困らない
- 確かめたこと（2026-10-18、作り物の動画 21MB）: 起動から52秒（URL が来るまで44秒・上げる0.6秒・EC2 が落とす7秒）。
  前の小分けは 30MB で約15分。EC2 の sha256 が一致し、消したあとの見る URL は 404。
  EC2 の上でその動画の base64 から48字の断片を50本作り（断片をコマンドに載せないため）、SSM のログと
  `/var/lib/amazon/ssm/*/document/orchestration` を数えて**どちらも0**。同じ数えかたで、`ec2.py put` で送った
  乱数の字（4KB）はログの3行・orchestration の1ファイルに当たった（数えかたが見えている証拠）。ログは消さずに
  6,711行 → 10,146行（1行目は同じ）

## 分かっていること（2026-10-17 に1本目で踏んだ）

- **アップロードの画面で Escape を押すと、画面ごと閉じる。** 下書きは残るが、その先を押せない。
  閉じたら `yt_post.py resume <ID> <post.json>`（詳細のページの「ドラフトを編集」から続き）
- **チャンネルにアップロードの既定（説明欄の定型文）が入っている。** 説明欄は全部選んで消してから打つ（`set_text`）。
  読み直しは `get_creator_videos` の `title` / `description` を投稿文と1字ずつ比べる
- **関連動画はアップロードの画面に無い。** 詳細のページの `ytcp-shorts-content-links-picker #linked-video-editor-link` →
  「特定の動画の選択」→ `#search-yours` に元の題 → `ytcp-entity-card` を押す → 保存。
  読み直しは `videoLinkageShortsAttribution.links[].targetExternalVideoId`
- 改変されたコンテンツのラジオは `VIDEO_HAS_ALTERED_CONTENT_NO`、子ども向けでないは `VIDEO_MADE_FOR_KIDS_NOT_MFK`、
  公開設定は `PRIVATE` / `PUBLIC`（`tp-yt-paper-radio-button[name=…]`）
- アップロードの画面の右の「動画リンク」は `youtube.com/shorts/<ID>`。説明欄の手引きのリンク（creatoracademy）を拾わないよう行き先で絞る
- `get_creator_videos` の mask に知らない列を入れても落ちない（黙って返さない）
- **公開設定の窓は position: fixed の `tp-yt-paper-dialog` の中で、offsetParent が null。** 見えている窓を offsetParent で
  探すと拾えない。中身の `ytcp-video-visibility-select` を直に見る
- ショートでも詳細のページに「サムネイル → ファイルをアップロード」（`ytcp-thumbnail-uploader input#file-loader`）が在る
- **TikTok のキャプションには、上げた直後にファイル名（`A`）が入っている。** CDP の Ctrl+A（modifiers だけ）は Linux の
  Chrome で全選択にならないので、`commands: ["selectAll"]` を付けて送り、残れば末尾から字数ぶん Backspace
- TikTok の「When to post」のラジオは2つとも字が `Now\nSchedule` になる。並びの先頭が Now
- TikTok のカバーは「Edit cover」→ 窓の中の file input（`accept` に image）に絵を渡す → 右上の「Save」（button ではないことがある）
- TikTok にログインしてあるのは `~/cdp-fish` の Chrome（`tt_post.py` の `NAME`）。画面は英語。EC2 の Chrome の時計は UTC
  （TikTok の一覧の時刻が UTC で出る）
- **こちらの手が、遠隔デスクトップの見張り（`GUARD`）を自分で止めることがある**（2026-10-21）。EC2 を起こした直後は
  無操作の時間が起動からの数分しか無いので、`desktop_busy` で戻る。Studio や TikTok で動画を開いた手のあとも、無操作の
  時間が0に戻っていた（遠隔デスクトップの接続は無かった。Chrome が動画の再生中に画面の消灯を止める仕掛けが、X の無操作の
  時間を戻している見立て）。**見張りは外さない。** 次の手の前に、EC2 の上で無操作が7分を超えるのを待ってから回す
  （1手ごとに7分ほど待つことになる）

## 予約投稿（2026-10-21 に最安ホステルの回 p2 で両方とも通した）

あやとの「19時に出して」のように時刻の指定があれば、**投稿先の予約で出す**（こちらのセッションが止まっていても、その時刻に出る）。
`--at` は **UTC の ISO**（19:00 JST なら `2026-10-21T10:00:00Z`）。EC2 の Chrome の時計は UTC なので、両方とも UTC のまま入れる。

```bash
# YouTube: 非公開の下書き（yt-draft → yt-related → yt-thumb）を作ってから、予約にする
python3 tools/shorts/post/post.py yt-publish --video <元の動画ID> --option <案> --id <ショートのID> --sha <sha256> --at 2026-10-21T10:00:00Z
# TikTok: 上げて、キャプション・カバー・予約の日時を入れて「Schedule」を押す（--dry で押す手前まで）
python3 tools/shorts/post/post.py tt-post --video <元の動画ID> --option <案> --cover --sha <sha256> --at 2026-10-21T10:00
```

- **YouTube**（`yt_post.py publish <ID> --at <ISO>`。`--dry` で欄を入れて「キャンセル」まで）: 詳細のページ → 公開設定 →
  「スケジュールを設定」（`#second-container-expand-button`）→ 日付は `#datepicker-trigger` を開いて「日付を入力」の箱
  （`ytcp-date-picker tp-yt-paper-input#textbox input`）に `2026/10/21` を打って Enter、時刻は `ytcp-datetime-picker` の中の
  `H:MM` の箱に `10:00` を打って Enter → 完了 → 保存
  - **タイムゾーンの札は「（GMT+0000）現地時間」**（窓の「タイムゾーン」を開くと選ばれている行が読める）。Chrome の時計と札の
    両方が UTC であることを確かめてから入れる。違えば押さずに止まる
  - 読み直しは `get_creator_videos` の `scheduledPublishingDetails.scheduledPublishings[]`（`scheduledTimeSeconds` が UTC の秒、
    `action` が `SCHEDULED_PUBLISHING_ACTION_SET_PUBLIC`、`status` が `SCHEDULED_PUBLISHING_STATUS_SCHEDULED`）。
    秒が `--at` と1秒でも違えば ok にしない。同じ時刻で予約済みなら何もしない。予約のあいだ `privacy` は `VIDEO_PRIVACY_PRIVATE` のまま
- **TikTok**（`tt_post.py post … --at`。`--dry` で押す手前、`--probe` で時刻の欄を開いて中身を書き出すだけ）:
  `input[type=radio][value=schedule]` を押すと、時刻（`HH:MM`）と日付（`YYYY-MM-DD`）の欄が出る。既定は今日・いまから20分ほど先
  - **日付を先に、時刻をあとに入れる。** 日付の欄（`YYYY-MM-DD`）を押すと暦（`.calendar-wrapper`）が開く。見出しは
    `.month-title`「October」と `.year-title`「2026」、左右の `.month-header-wrapper .arrow`（左が前の月・右が次の月）、
    日は `.day-span-container > span.day`（押せる日は class に `valid`、選んでいる日に `selected`）。
    **頭に前の月の日が並ぶ**（10月なら頭の「27 28 29 30」は9月）ので、字だけで探さない。週は日曜はじまりで、
    1日の曜日ぶんずらした位置の字が日と同じで、`valid` が付いているときだけ押す（`pick_day`）。月が違えば矢印で送る
    （2か月より先は `date_too_far` で押さない）。押すと暦は閉じ、欄の値が変わる（2026-10-21 に 10/22 で通した）
  - 時刻の欄は左の列が時（00〜23）・右の列が分（**5分おき**。`--at` の分が5の倍数でなければ `bad_at` で止まる）。
    `.tiktok-timepicker-option-item` の中の span（class に `tiktok-timepicker-le` / `-ri`）の字で押す。
    閉じるのは Escape（blur だけでは開いたまま）。**翌日の日を押したあとは Escape でも開いたまま残った**ので、
    そのときは時刻の欄をもう一度押して閉じる（外を押しても閉じる）。閉じたのを見るまで ok にしない（開いたまま
    「Schedule」を押すと、1回目が欄を閉じるだけになりうる）
  - **開いているかは、ますの高さで見る**（`TIME_OPEN`）。閉じた欄もますは DOM に残り、幅 84px のまま高さだけ 0 になる。
    幅で見ると、一度も開いていないうちから「開いている」と出る（2026-10-21 に1回それで止まった。押してはいない）
  - 押すボタンの字が **Schedule であることを確かめてから押す**（Post は今すぐ出る）。予約のときは念押しの窓が出ても押さない
  - 読み直しは投稿の一覧（`tt_post.py scheduled <題の字> <UTC の ISO>`）。予約の行は公開範囲が灰色で、作った日の代わりに
    時計の印と `Oct 21, 10:00 AM`（UTC。時刻と AM のあいだは細い空白 U+202F のことがある）が出る。投稿 ID（`/video/…`）は
    予約の時点で出るので、台帳は `done` になる
- 予約は出したのと同じに数える。台帳（`posted.json`）は予約の時点で `done`、`note` に予約の時刻を書く
- **予約の時刻のあとに、出たかを確かめる**（2026-10-21 に最安ホステルの回 p2 で、予約中の城塞の回と並べて見分けた）。
  どちらも EC2 で、ログインしない `curl` で見る（この箱からは youtube.com・tiktok.com に届かない）
  - YouTube: `https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/<ID>&format=json` が **200 で題を返せば公開**、
    予約中（非公開）は 403。動画のページを開くと、公開済みでも「bot ではないことを確認」でログインを求められるので使わない
  - TikTok: **oEmbed は使えない**（予約中でも 200 を返し、題も作者も空）。`https://www.tiktok.com/embed/v2/<ID>` が
    **200 で `secret` が false なら公開**、予約中は 400
  - 最後に Studio（`get_creator_videos` の `privacy` が `VIDEO_PRIVACY_PUBLIC`・`scheduledPublishingDetails` が null）と
    TikTok Studio の一覧（予約の時計の札が外れて、公開範囲が選べる「Everyone」の行）でも読み直す
- **YouTube の本人確認**（2026-10-21）: 上げる画面で「本人確認 — 続行するには、本人確認を行う必要があります」の窓が出て、
  「次へ」は Google のパスワードの画面だった。「別の方法」はパスキー・アカウント復元（再設定用のメール）だけで、スマホの
  確認（dp）は無かった。**こちらでは打たない・アカウント復元は選ばない。** あやとに遠隔デスクトップの ytstudio の Chrome で
  本人確認をしてもらった。窓が出たまま進めると、題だけ入って説明欄の改行・改変コンテンツの問いが入らず、動画も保存されない

## 1本目（2026-10-17）

北マケドニアの回の A を、この道具で出した（YouTube https://youtube.com/shorts/Do04EoViYdU ・TikTok の投稿 7697445174338751765）。
初めての手を回すときは、画面の写し（`~/shots/post/`）を持ち帰って見る。
