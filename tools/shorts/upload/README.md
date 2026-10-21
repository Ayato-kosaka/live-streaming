# 録画を受け取る（あやとがスマホから上げる URL）

あやとが iPhone の Safari か PC から、配信の録画（10分の切り出しで 0.5〜2GB、全編で 5〜10GB）を
上げられるページを1枚作る。**7日で開けなくなる。** 上げたものは非公開のバケットに30日置き、
Actions の中で解析に使う（画質の比較・アーカイブとの音合わせ）。git には通さない。
あやと（2026-10-18）「アップロードURLください」。

## 使い方（作業箱で）

```bash
# ページを作る。URL は --out/upload/<名前>/page/url.txt にだけ書く（標準出力には出さない）
python3 tools/shorts/upload/ask.py page  --name rec-1018 \
  --key <スクラッチパッド>/keys/priv.pem --out <スクラッチパッド>/upload

# 届いたものを見る（解像度・fps・ビットレート・長さ・音声・撮った時刻、sha256）
python3 tools/shorts/upload/ask.py probe --name rec-1018 --key <同じ> --out <同じ>
#   大きいものを全部落とし直したくないとき（sha256 を出さない。ffprobe は頭と moov だけ読む）
python3 tools/shorts/upload/ask.py probe --name rec-1018 --key <同じ> --out <同じ> --no-hash

# 使い終わったら消す（消さなくても30日で消える）
python3 tools/shorts/upload/ask.py drop  --name rec-1018 --key <同じ> --out <同じ>

# 作業箱からも CORS の下見と非公開を見直す（何も上げない）
python3 tools/shorts/upload/ask.py check --name rec-1018 --out <同じ>
```

- `probe` の結果は `--out/upload/<名前>/probe/result.json`。1本ずつ `object`（`gs://…/uploads/<名前>/<乱数>/00.bin`）・
  `source`（ブラウザが添えた元のファイル名・大きさ）・`summary`（解像度・fps・ビットレート・長さ・音声・
  回転・撮った時刻）・`ffprobe`（全部。位置の札は抜いてある）・`sha256`。**解析の道具はこの `object` を読む**
- URL はあやとに渡してよい（制作の issue・チャット）。リポジトリには平文で入れない
- master に入ったあとは `--via dispatch` で workflow_dispatch から起こせる（既定は依頼ファイルを作業枝に積む形）
- 鍵の作りかたは `tools/shorts/ingest/README.md`（セッションごとに作り直す）

### Drive の共有フォルダから素材を受け取る（`drive`）

あやとが素材を Google Drive のフォルダ（リンクを知っている人は閲覧可）で渡してきたとき。作業箱からは
drive.google.com に届かない（プロキシが 403。コネクタでもフォルダの中身が一覧に出ない）ので、ランナーで落とす。

```bash
python3 tools/shorts/upload/ask.py drive --name fra-a-drive --folder <フォルダの ID> \
  --key <スクラッチパッド>/keys/priv.pem --out <スクラッチパッド>/drive
# → --out/upload/<名前>/drive/ に result.json・sheets/（2秒おき・時刻入りのコマ一覧）・media/NN.mp4
```

- ランナーは `gdown --folder` で落とし（駄目なら埋め込み用の一覧から1本ずつ）、動画は**書き出しにそのまま渡せる形**
  （回転を焼いた縦横・長い辺 1920・30fps 以下・H.264・BT.709。HLG/PQ は縮めてから tonemap）に揃えて
  `uploads/<名前>/<乱数>/NN.mp4` に置き、署名付き GET（3日）を返す。HEIC は heif-convert で JPEG に
- `result.json` の `files[]` に元のファイル名・撮った時刻・元の縦横と回転・色・揃えたものの sha256。ログには番号・大きさ・秒だけ
- 2026-10-21 フランス周遊 A v3（#998）: iPhone 11 Pro の 4K を 11本（うち HEIC 1枚は開けなかった）、落とす 28秒・揃える 96秒

### 前の版の書き出しの入力を取り戻す（`cas`）

`remote.py up` は入力を `render/cas/<sha256>` に置く。作業箱で声や素材を消したあとでも、前の版の依頼
（`git show <コミット>:shorts/render/<名前>.json` の `items[].edit` と `objects[].sha256`）を並べて頼めば、同じバイト列が戻る。
声を作り直すと読みが変わるので、原稿が同じ直しはこれで前の声を使う。

```bash
python3 tools/shorts/upload/ask.py cas --name <名前> --list <sha256 を並べたファイル> \
  --cas-out <スクラッチパッド>/cas --key <鍵> --out <スクラッチパッド>/drive
# 指示書（items[].edit）は in/<sha256>.<拡張子> の道で書かれている。指示書の隣に in/ を作って並べれば、
# そのまま remote.py up に渡せる（同じ sha なので上げ直しは起きない）
```

## ページがすること

動画を選ぶ → 進み具合（％・量・残りの時間）→「届きました（ファイル名・大きさ）」。続けて何本でも
（枠の数まで。既定12本）。**GCS の resumable upload で 8MiB ずつ上げる。** 電波が切れたら自分で
待って続きから送り直し、それでも駄目なら「もう一度、同じ動画を選ぶと続きから送ります」と出す
（どこまで送ったかは、その端末の localStorage に、動画の頭と尻 1MB の指紋で覚える）。
送っているあいだは画面が消えないようにする（Wake Lock。効かない端末もある）。

**画面では仕組みを説明しない**（CLAUDE.md）。出す字は「動画を選ぶ」「終わるまで、この画面を閉じないでください」
「届きました」「途切れました。…」「このページの期限が切れました」だけ。

## 流れ

```
作業箱 ask.py page                作業枝 claude/…                     Actions shorts_upload.yml（serve.py → store.py）
 依頼を積む ───────────────→ shorts/upload/<name>.json ─push→ 権限を聞く・寿命の決まりをそろえる
                                                                     uploads/<name>/<乱数>/00.bin… の枠を署名（7日）
                                                                     ページ1枚を hosting:channel:deploy sp-<乱数> --expires 7d
                                                                     CORS をそろえる → ブラウザと同じ要求で上げてみる
                               …/.work/upload/<name>/page/  ←── URL と結果を依頼の公開鍵で包んで置く（依頼は下ろす）
 開いて url.txt を書く・暗号文を下ろす

あやとのブラウザ ──PUT 控え 00.json（元の名前・大きさ・指紋。在れば 412 → 次の枠）─→ GCS
                  ──POST 00.bin（署名付き・枠の始め）──→ GCS（セッションの URL が返る）
                  ──PUT 8MiB ずつ（Content-Range）─→ GCS（どこまで届いたかが返る）

作業箱 ask.py probe ─→ shorts/upload/<name>.json ─push→ 署名付き URL のまま ffprobe・落とし直して sha256・md5 を突き合わせる
```

### 枠と控え

ブラウザが上げる名前は、ページを作る時点では分からない。だから決まった名前の枠（`00.bin` 〜）を先に
署名して、元のファイル名は控え（`00.json`）に書かせる。

**控えを置くことが、枠を取ること。** 控えの PUT の署名には `x-goog-if-generation-match: 0` を入れてあり、
もう控えのある枠は 412 で断られるので、ページは次の枠へ進む（別の端末から上げても上書きしない）。
録画の resumable の始めにも同じ札を入れてあるが、**GCS は始めの時点ではこの札を見ない**
（2026-10-18 にランナーで実測。在る名前でも 201 が返った）。札が効くのは最後の1切れで、そこで 412 になる。
だから枠の取り合いを始めで決めると、全部送ったあとで断られる。控えで先に決める。

大きさの上限（`x-goog-content-length-range: 0,16GiB`）も始めの署名に入れてある。

### GCS の答えかた

resumable の途中の答えは本来 **308**（Location の無いリダイレクト）。ブラウザによって扱いが揺れるので、
`X-GUploader-No-308: yes` を付けて **200 ＋ `X-HTTP-Status-Code-Override: 308`** で返させる。
どちらで返っても読めるようにしてある。ページを配った直後に、ランナーが同じ要求（Origin 付き）で
小さなものを上げて、CORS の下見・控えで枠を取る（2回目は 412）・始め・1切れ目・どこまで届いたか（＝再開）・
残り・md5・同じ名前でもう1本上げると最後で 412（前のものが残る）・署名なしで 403 を見る（`store.selftest`）。

## 置き場の設定（バケット `live-streaming-d3cac-shorts-preview`）

下見と同じバケット（#938 であやとが作った。Actions のサービスアカウントは**このバケットだけ**管理者）。
設定は `serve.py page` が毎回読み直して、足りなければそろえる（`storage.buckets.update` がある）。

| 何を | どうしてあるか |
| --- | --- |
| 公開 | 公開アクセス防止を強制・均一アクセス（あやとが作ったとき）。署名なしの道は 403 |
| 寿命 | `uploads/` は30日で消える。**ほかの道の14日の決まりは `preview/` `render/` に絞った**（寿命の決まりは「どれか1つに当たれば消す」ので、全体の14日を残すと録画も14日で消える） |
| CORS | 配ったページの出どころ（`https://live-streaming-d3cac--sp-….web.app`。ページごとに足し、新しい順に10まで）からの PUT・POST・OPTIONS だけ。GET は許さない（ブラウザから読み返す道を作らない）。ほかの CORS の決まりには触らない。**`https://live-streaming-d3cac--*.web.app` の形は GCS が読まない**（2026-10-18 に実測。形だけでは下見が通らなかった）ので、出どころは1つずつ |
| 消したもの | 取っておかない（soft delete 0日。あやとが作ったとき） |

## 守っていること

- ページの URL はチャンネル名に乱数 80bit、署名は7日。ページには noindex・no-referrer・no-store・
  CSP（通信は `storage.googleapis.com` だけ）を付け、外の書体も絵も読まない
- 本番のサイト（live チャンネル）には触らない。本番の firebase.json・public は使わない（`host.py` と同じ）
- ログに出すのは名前・数・秒・成否・権限の ○/✕ だけ。URL・署名・元のファイル名は暗号化した結果にだけ入れる
- ffprobe の結果から位置（GPS）の札は抜く

## 確かめたこと（2026-10-18）

- `page` はランナーで25秒ほど（起きるまでの待ちは別）。ランナーの selftest は全部 ○
  （控え 200→412・始め 201・1切れ目 200＋上書きの札 308・続きから 524288バイト目・md5 一致・
  同じ名前でもう1本は始め 201 → 最後で 412 で前のものが残る・上限 `0,512KiB−1` で 768KiB は断られる・署名なし 403）
- EC2 の Chrome 151（iPhone の幅 390×844・3倍の真似）でページを開き、作り物の動画 200MB（本物の mov ＋
  中身が乱数の `free` の箱）を 3MB/秒に絞って上げた。3割で開き直し → 同じ動画を選び直すと 0.9秒で3割から続き。
  6割で15秒電波を切る →「電波を待っています…」→ 戻ると自分で続きから。「届きました」まで。JS のエラー 0・横あふれ無し
- `probe` で落とし直した sha256 が EC2 の手元のものと一致し、GCS の md5 とも一致。ffprobe は 1920x1080・30fps・
  h264・AAC 48kHz 2ch・6.0秒を読んだ（署名付き URL のまま 0.6秒）

## 確かめていないこと

- **iPhone の Safari 本体では回していない**（EC2 の Chrome とランナーで確かめた）
- iPhone で「写真」から選ぶと、iOS が書き出し直して小さくなることがある。`probe` の大きさ・
  ビットレートが思ったより小さければ、「ファイル」から選んでもらう

## 落ちたときの見方

1. `ask.py` の最後の行（`!! …`）。Actions で落ちたときは暗号化した `run.json` の `error`
2. Actions の「ショートの録画を受け取る」のログ（権限の ○/✕・寿命・CORS・上げてみた結果の1行）
3. ページで「途切れました」が続く → `ask.py check`（CORS の下見が通るか）。通るなら回線
