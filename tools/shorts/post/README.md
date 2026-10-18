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
| `tt_post.py` | EC2（`~/cdp/`） | TikTok Studio: 上げる → キャプションを貼る → 設定を読む → 投稿（`--dry` で手前まで） |
| `posted.py` / `posted.json` | 手元（git に入れる） | 出した記録の台帳（動画の sha256 × 場所 → 状態・投稿 ID）。投稿の段が EC2 に触る前に引く。見張りは `posted_selftest.py` |

## 手順（1本ぶん）

```bash
D=<動画と投稿文の置き場（A.mp4 post_A.json …）>
python3 tools/shorts/post/post.py send       --dir $D --video <元の動画ID> --option A   # Actions が URL を作るのを待つぶん（1分ほど）＋数秒
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

## 予約投稿

- YouTube: 公開設定の段に「スケジュール設定」が在る（2026-10-17 に見た）。`yt_post.py publish --at` はまだ押すところまで作っていない
- TikTok: 「When to post」に `Now` / `Schedule` が在る（2026-10-15 に見た）。`tt_post.py post --at` は Schedule を押して欄を出すところまで。
  日時の欄の入れ方はまだ確かめていない。**時刻は EC2 の Chrome の時計（UTC）で出る**

## 1本目（2026-10-17）

北マケドニアの回の A を、この道具で出した（YouTube https://youtube.com/shorts/Do04EoViYdU ・TikTok の投稿 7697445174338751765）。
初めての手を回すときは、画面の写し（`~/shots/post/`）を持ち帰って見る。
