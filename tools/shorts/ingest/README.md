# ショートの材料を作る（取り込み・解析）

配信アーカイブ・参考ショート・チャンネルの一覧から、見どころ探しの**材料**を作る。
見どころの判断（意味の理解）はしない。材料は3つ。

- **文字起こし** — YouTube の自動字幕と faster-whisper の2系統
- **コンタクトシート** — 一定の刻みのコマを格子に並べ、各コマの下に `H:MM:SS` を焼いた JPEG
- **数値の時系列** — 1秒ごとの動き・明るさ・彩度・音量（RMS / LUFS）、場面の変わりめ、
  10秒ごとの要約（YouTube の「よく再生された部分」つき）

**このリポジトリは公開。** 出来たものは全部、依頼ファイルに入れた公開鍵で暗号化して
作業枝の `shorts/.work/` に置く。平文で置くのは「何がいくつ・何バイト・成否」だけの
`manifest.json`。`shorts/.work/` は作業用の一時置き場で、master には入れない。

## 流れ

```
shorts/requests/*.json を claude/** の枝に push
  └ .github/workflows/shorts_ingest.yml
      plan     依頼を読む（形・公開鍵・時間帯・置き場の枝を見る）            plan.py
      fetch    YouTube から1本ずつ順に取る（Cookie を握るのはここだけ）       download.py
               → Actions のキャッシュに置く（artifact は公開で誰でも落とせるので使わない）
      analyze  1本ずつ並べて解析（Cookie 無し）→ 暗号化 → 作業枝に push        analyze.py / seal.py / push.sh
      cleanup  受け渡しのキャッシュを消す
手元: git で枝を取り込み → decrypt.py でリポジトリの外に開く
```

YouTube に触るのと重い計算を Actions でやるのは、作業箱から YouTube にも
huggingface.co にも、artifact の実体（`*.blob.core.windows.net`）にも届かないから。
届くのは git だけなので、結果は git で持ち帰る。

## 依頼ファイル（`shorts/requests/<好きな名前>.json`）

**その push で足した・書き換えた依頼だけ**が走る（置いてある依頼が全部走り直すことはない）。
同じものをもう一度回したいときは、名前を変えて置き直す。

```json
{"mode": "archive",   "videos": ["yk-by7R7iPA", "hK0SwIeAxg0"], "pubkey": "-----BEGIN PUBLIC KEY-----\n…"}
{"mode": "reference", "videos": ["_IhNSDR6eVk", "OEFJIhPunJ0"], "pubkey": "…"}
{"mode": "zoom",      "video": "yk-by7R7iPA", "range": "0:12:00-0:14:00", "fps": 1, "pubkey": "…"}
{"mode": "channel",   "channels": ["@cheethann3", "UCCwutAH6ieHNvdyJAfSld7w"], "tab": "shorts",
                      "limit": 200, "details": 60, "pubkey": "…"}
```

| 欄 | 意味 | 既定 |
| --- | --- | --- |
| `mode` | `archive`（長い配信）/ `reference`（他人のショート）/ `zoom`（区間を細かく）/ `channel`（一覧） | 必須 |
| `videos` / `video` | 動画ID（11字） | 必須（channel 以外） |
| `pubkey` | RSA 2048bit 以上の公開鍵。`openssl pkey -in priv.pem -pubout` の形。改行が空白に化けてもよい | 必須 |
| `range` | zoom の区間 `H:MM:SS-H:MM:SS`。15分まで | zoom で必須 |
| `fps` | zoom で1秒に何コマ取るか（0〜5）。区間×fps は1200コマまで | 1 |
| `whisper` | `{"model": "large-v3-turbo", "batch": 8, "beam": 5, "language": "ja"}`。`language: "auto"` で言語も当てさせる | 左のとおり |
| `bench` | archive だけ。`{"range": "0:20:00-0:25:00", "models": ["small", "medium", "large-v3"]}` 同じ区間を別のモデルでも書き起こして、秒と中身を並べる | 無し |
| `channels` | `@ハンドル` か `UC…`（24字） | channel で必須 |
| `tab` | `shorts` / `videos` / `streams` | `shorts` |
| `limit` | 一覧で取る本数（新しい順） | 200 |
| `details` | 一覧のうち再生数の多い順に何本、1本ずつのページから長さ・投稿日・高評価数・正確な再生数を引き直すか（200まで） | 50 |

`workflow_dispatch` でも同じ入力で回せる（master に入ってから。`videos` 欄に、channel のときは
チャンネルを並べる。`branch` は結果を置く枝で、`claude/` で始まる名前しか受けない）。

### 鍵の作りかた（セッションごとに作り直す）

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out <スクラッチパッド>/keys/priv.pem
openssl pkey -in <スクラッチパッド>/keys/priv.pem -pubout -out <スクラッチパッド>/keys/pub.pem
```

**秘密鍵はリポジトリに入れない**（`.gitignore` の `*.pem` でも弾かれるが、そもそも中に置かない）。

## 置かれるもの（平文）

```
shorts/.work/<videoId>/archive/            …/reference/   …/zoom-<開始秒>-<終了秒>-<fps>fps/
shorts/.work/channels/<@を外した名前>/<tab>/
    manifest.json   平文。状態と数だけ
    key.enc         RSA-OAEP(SHA-256) で包んだ AES 鍵・HMAC 鍵・IV（80バイト）
    payload.enc     中身の tar.gz を AES-256-CBC で暗号化したもの（45MB を超えたら .000 .001 … に切る）
```

`manifest.json` の欄: `status`（ok / partial / failed）・`stages`（段ごとの ok / failed / skipped）・
`counts`（シートの枚数・字幕と書き起こしの区間数・変わりめの数・一覧の本数・ファイル数）・
`bytes`（平文 / tar.gz / 暗号文）・`encrypted_files`（名前・バイト・sha256）・`hmac_sha256`・
`pubkey_sha256`（どの鍵で包んだか）・`run`（Actions の run の URL）。
**題名・字幕・理由の文面は入れない**（理由は暗号化した `run.json` の中）。

## 開きかた

```bash
git fetch origin claude/serene-darwin-sf09tt && git merge --ff-only FETCH_HEAD
python3 tools/shorts/ingest/decrypt.py --key <スクラッチパッド>/keys/priv.pem --out <スクラッチパッド>/ingest
# 1つだけ: 末尾に shorts/.work/yk-by7R7iPA/archive のように置き場を足す
```

`<out>/<置き場>/` に開く（例 `<out>/yk-by7R7iPA/archive/`、`<out>/channels/cheethann3/shorts/`）。
**展開先がリポジトリの中なら断る。** 鍵違い・暗号文の破損（HMAC 不一致）も開かない。

## 中身（暗号化の中）

まず `index.md` を開く（そのフォルダに何があって、各列が何かを書いてある）。

| ファイル | archive | reference | zoom | channel | 中身 |
| --- | :-: | :-: | :-: | :-: | --- |
| `meta.json` | ○ | ○ | ○ | | 題名・チャンネル・長さ・公開日時・再生数/高評価数（`counts_fetched_at` の時点）・縦横・fps・yt-dlp の版・`heatmap`（よく再生された部分）・chapters |
| `captions.json` / `.txt` | ○ | ○ | | | YouTube の字幕（ja）。`source` が auto / manual。取れなければ `ok:false` と `why` |
| `transcript.json` / `.txt` | ○ | ○ | | | faster-whisper。区間ごとに start / end / text と単語ごとの時刻。頭にモデル・かかった秒・RTF |
| `sheets/NNNN.jpg` + `sheets.csv` | 10秒に1コマ・5×4（200秒/枚） | 1秒に1コマ・4×3 | 指定 fps・4×3 | | 各コマの下の帯がそのコマの**本当の時刻** |
| `scenes.csv` | ○ | ○ | ○ | | 場面の変わりめ（t / hms / score / ratio） |
| `visual.csv` | ○ | ○ | ○ | | 1秒ごと: motion_mean / motion_max / bright / sat / score_max / cut |
| `audio.csv` | ○ | ○ | | | 1秒ごと: rms_db / peak_db / lufs_m / lufs_s |
| `timeline10.csv` | ○ | | | | 10秒ごとの要約（シートの1コマと同じ刻み）と heat（よく再生された度合い） |
| `structure.json` | | ○ | | | カット数・平均ショット長・字数/秒・喋っている割合・頭3秒・再生数と高評価 |
| `bench/bench.md` | 依頼に bench があれば | | | | 同じ区間をモデル違いで書き起こした比べ |
| `channel.json` / `.csv` | | | | ○ | 一覧（order＝タブでの並び・再生数・長さ・投稿日・高評価・rank_views） |
| `run.json` | ○ | ○ | ○ | ○ | 段ごとの秒・成否・落ちた理由、道具の版 |
| `logs/` | ○ | ○ | ○ | ○ | yt-dlp と ffmpeg のログ |

列の単位:

- `motion_*` — 隣り合うコマ（archive は 1/5秒、reference は 1/30秒、zoom は 1/10秒）の明るさの差の平均（0〜255）。
  **刻みが違うので、mode をまたいで比べない**
- `bright` 0〜255 / `sat` 0〜1 / `score` は HSV の各チャンネルの差の平均（0〜255）
- `ratio` は前後2コマの点数の平均の何倍跳ねたか。**3以上かつ score 15以上を変わりめ**にした
  （PySceneDetect の AdaptiveDetector と同じ考え）。変わりめの時刻は「新しい場面が最初に写ったコマ」で、
  本当の切れ目はその1コマ前との間にある
- `rms_db` / `peak_db` は dBFS（0 が最大）。`lufs_m` はその秒の momentary（0.4秒窓）の最大、`lufs_s` は short-term（3秒窓）
- `heat` は YouTube の「よく再生された部分」（0〜1）。再生の少ない動画には無い

## 手元で確かめる（YouTube に行かずに一周）

```bash
python3 tools/shorts/ingest/dryrun.py <リポジトリの外の空きフォルダ>
```

ffmpeg で場面の変わりめが分かっている縦長の動画を作り、解析 → 暗号化 → 復号を通す。
変わりめの時刻・シートの枚数と焼いた秒・zoom の秒の足し込み・channel の並び・
復号したものが元と1バイトも違わないこと・鍵違い／暗号文の破損／リポジトリの中への展開を
断ることを見る。whisper はモデルを落とせない箱でも回るように外してある（`whisper: failed` は正常）。

## 落ちたときの見方

1. **`manifest.json` の `stages`** を見る（平文なので git で取り込めば読める）。
   `download: failed` なら取れていない。それ以外が failed なら、復号して `run.json` の
   `stages[].error` を見る
2. **取れていない**とき — Actions の `fetch` の job のログに、口（player_client）ごとの
   `見えた / 駄目` と断り文句、1本ごとの `OK / NG（理由）` が出る。理由の語は
   `ボット確認`（Cookie が無効か IP の評判）/ `429（取りすぎ）`/ `動画が見られない`/ `形式が無い`。
   yt-dlp の出力そのものは暗号化した `logs/ytdlp.log` にある
3. **plan で落ちた** — 依頼の形・公開鍵・時間帯（21:15〜23:59 UTC は取り始めない）・枝の名前。
   理由はログに1行で出る
4. **作業枝に置けなかった** — `analyze` の job の「作業枝に置く」。5回とも push を断られたら赤
5. **キャッシュの受け渡し** — `fetch` が落ちて何も置けなかったとき、`analyze` は
   「取ったものがキャッシュに無い」で failed の manifest を置く

`fetch` の job は**同じ ref の毎晩の取り込みと同じ枠**（`fetch-chat-${{ github.ref }}`）。
1つの枠に「走っている1本＋待っている1本」までしか並ばず、3本目が来ると待っていた
1本が取り消される。**依頼は1回の push にまとめるか、前の fetch が終わってから次を push する。**

## 守っていること

- `YOUTUBE_COOKIES` は**読むだけ**。`cookies/update` は使わない。`/tmp` の写しは job の最後で消す
- 21:15〜23:59 UTC は取り始めない（plan と download.py の両方で見る）
- ログに出すのは段・状態・秒・個数・バイト数だけ。題名・字幕・フレームは出さない
- 動画の実物（mp4 / mkv / m4a）は commit しない。キャッシュで受け渡して、最後に消す
- チャット（視聴者の名前）は取らない（字幕は `ja-orig,ja` だけを頼む）
- 置くのは `claude/` で始まる枝だけ。`push.sh` が `manifest.json / key.enc / payload.enc*`
  以外が混ざっていないことを見てから置く
