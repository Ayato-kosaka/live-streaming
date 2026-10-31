# ショートの材料を作る（取り込み・解析）

配信アーカイブ・参考ショート・チャンネルの一覧から、見どころ探しの**材料**を作る。
見どころの判断（意味の理解）はしない。材料は3つ。

- **文字起こし** — YouTube の自動字幕と faster-whisper の2系統
- **コンタクトシート** — 一定の刻みのコマを格子に並べ、各コマの下に `H:MM:SS` を焼いた JPEG
- **数値の時系列** — 1秒ごとの動き・明るさ・彩度・音量（RMS / LUFS）、場面の変わりめ、
  10秒ごとの要約（YouTube の「よく再生された部分」つき）

もう1つ、企画が決まったあとの**編集の素材**も同じ道で取る（`clips`）。頼んだ区間を
1本ずつ、元の縦横・fps・音つきの mp4 に切ったもの。書き出し（`tools/shorts/render/`）が
これを読む。画を選ぶための**見る用のシート**（mp4 ごとに2秒に1コマ）も添え、シートだけを
mp4 とは別の小さな封にも包むので、**mp4 の暗号文（数百MB）を落とさずにシートを読める**
（下の「シートだけ開く」。#1011）。

**区間を決めるだけなら、まず `captions`（字幕だけの道）。** 媒体を落とさずに YouTube の自動字幕と
題・長さだけを取り、その場で封をして置く。push から手元に届くまで**約1分**（下の「字幕だけの道」）。

**このリポジトリは公開。** 出来たものは全部、依頼ファイルに入れた公開鍵で暗号化して
作業枝の `shorts/.work/` に置く。平文で置くのは「何がいくつ・何バイト・成否」だけの
`manifest.json`。`shorts/.work/` は作業用の一時置き場で、master には入れない。

## 流れ

```
shorts/requests/*.json を claude/** の枝に push
  └ .github/workflows/shorts_ingest.yml
      plan     依頼を読む（形・公開鍵・置き場の枝を見る）                    plan.py
               → 毎晩の取り込みが動いていれば、終わるまで待つ（最長60分）      gate.py
      captions mode captions だけ。字幕と題・長さを取り、封をして作業枝に置く    quick_captions.py / seal.py / push.sh
               （媒体を落とさない。fetch と同じ Cookie の枠。fetch はこのあと）
      fetch    YouTube から1本ずつ順に取る（Cookie を握るのは fetch と captions。 download.py
               1本ごとに、毎晩の取り込みが動き出していないかを見直す）
               → Actions のキャッシュに置く（artifact は公開で誰でも落とせるので使わない）
      analyze  1本ずつ並べて解析（Cookie 無し）→ 暗号化 → 作業枝に push        analyze.py / seal.py / push.sh
      cleanup  受け渡しのキャッシュを消す
手元: git で枝を取り込み → decrypt.py でリポジトリの外に開く
```

YouTube に触るのと重い計算を Actions でやるのは、作業箱から YouTube にも
huggingface.co にも、artifact の実体（`*.blob.core.windows.net`）にも届かないから。
届くのは git だけなので、結果は git で持ち帰る。

## 依頼ファイル（`shorts/requests/<好きな名前>.json`）

**その push で足した・書き換えた依頼だけ**が走る（置いてある依頼が全部走り直すことはない。
push の前後を GitHub の compare で比べて拾う）。同じものをもう一度回したいときは、名前を変えて置き直す。
1回の push で40本まで（`plan.py` の `MAX_ITEMS`）。

```json
{"mode": "archive",   "videos": ["yk-by7R7iPA", "hK0SwIeAxg0"], "pubkey": "-----BEGIN PUBLIC KEY-----\n…"}
{"mode": "reference", "videos": ["_IhNSDR6eVk", "OEFJIhPunJ0"], "pubkey": "…"}
{"mode": "zoom",      "video": "yk-by7R7iPA", "range": "0:12:00-0:14:00", "fps": 1, "pubkey": "…"}
{"mode": "zoom",      "video": "yk-by7R7iPA", "ranges": ["0:48:10-0:49:10", "0:50:25-0:51:45"],
                      "fps": 1, "grid": "2x2", "tile": 720, "pubkey": "…"}
{"mode": "channel",   "channels": ["@cheethann3", "UCCwutAH6ieHNvdyJAfSld7w"], "tab": "shorts",
                      "limit": 200, "details": 60, "pubkey": "…"}
{"mode": "clips",     "videos": ["yk-by7R7iPA"], "ranges": ["0:13:29-0:14:05", "0:14:10-0:14:38"],
                      "pubkey": "…"}
{"mode": "captions",  "videos": ["VusdZVyjgjQ"], "pubkey": "…"}
```

| 欄 | 意味 | 既定 |
| --- | --- | --- |
| `mode` | `archive`（長い配信）/ `reference`（他人のショート）/ `zoom`（区間を細かく）/ `channel`（一覧）/ `clips`（編集の素材。区間ごとの mp4）/ `captions`（字幕と題・長さだけ。媒体を落とさない） | 必須 |
| `videos` / `video` | 動画ID（11字） | 必須（channel 以外） |
| `pubkey` | RSA 2048bit 以上の公開鍵。`openssl pkey -in priv.pem -pubout` の形。改行が空白に化けてもよい | 必須 |
| `range` / `ranges` | zoom の区間 `H:MM:SS-H:MM:SS`（1区間15分まで）。`ranges` で並べると1区間1本の job になる。**clips では、並べた区間が全部1本の job**（配信は1回だけ取って、そこから全部切る）。1区間10分・合計30分・60区間まで。秒に端数を書いてよい（`0:13:29.5`）。並べた順が mp4 の番号になり、重なっていてもそれぞれ1本 | zoom・clips で必須 |
| `fps` | zoom で1秒に何コマ取るか（0〜5）。区間×fps は1200コマまで | 1 |
| `grid` / `tile` | zoom のシートの格子（縦長のときの「横x縦」。横長なら入れ替わる）とコマの長辺（240〜1280）。**看板・メニュー・予約画面の字を読みたいときは `"2x2"` と `720`**（Read で 1コマ約385×685 に見える）。それでも小さければ数秒だけ `"1x1"` と `1280` で頼む（元を 1080p で取る） | `4x3` / 480 |
| `whisper` | `{"model": "large-v3-turbo", "batch": 8, "beam": 5, "language": "ja"}`。`language: "auto"` で言語も当てさせる | 左のとおり |
| `bench` | archive だけ。`{"range": "0:20:00-0:25:00", "models": ["small", "medium", "large-v3"]}` 同じ区間を別のモデルでも書き起こして、秒と中身を並べる | 無し |
| `channels` | `@ハンドル` か `UC…`（24字） | channel で必須 |
| `tab` | `shorts` / `videos` / `streams` | `shorts` |
| `limit` | 一覧で取る本数（新しい順） | 200 |
| `details` | 一覧のうち再生数の多い順に何本、1本ずつのページから長さ・投稿日・高評価数・正確な再生数を引き直すか（200まで） | 50 |

`workflow_dispatch` でも同じ入力で回せる（master に入ってから。`videos` 欄に、channel のときは
チャンネルを並べる。clips の区間は `range` 欄にカンマ区切りで並べる。`branch` は結果を置く枝で、
`claude/` で始まる名前しか受けない）。

### 鍵の作りかた（セッションごとに作り直す）

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out <スクラッチパッド>/keys/priv.pem
openssl pkey -in <スクラッチパッド>/keys/priv.pem -pubout -out <スクラッチパッド>/keys/pub.pem
```

**秘密鍵はリポジトリに入れない**（`.gitignore` の `*.pem` でも弾かれるが、そもそも中に置かない）。

## 字幕だけの道（`captions`。#1014）

**書き起こしが `streams/` に無い回は、まず字幕で区間を決めて原稿に入る。whisper は原稿が使う区間だけ。**
配信の議事録の元（`streams/YYYY/MM/<stem>.transcript.txt`）は毎晩の取り込みのあとに付くので、
配信の当日・翌朝の回にはまだ無い。そこで archive（配信まるごとを取って whisper）を頼むと、
字幕は最初の数分で取れているのに、全部が終わるまで1つの封にならない。フォカッチャの回
（VusdZVyjgjQ・3時間55分）は、道具の入れが32分止まり、whisper が40分を越えても終わらず、
1時間を越えても原稿の段に入れなかった（帳面 F-046）。

```bash
# shorts/requests/<好きな名前>.json を claude/ の枝に足して push する
{"mode": "captions", "videos": ["VusdZVyjgjQ"], "pubkey": "-----BEGIN PUBLIC KEY-----\n…"}
# 置き場は shorts/.work/<id>/captions/。届いたら開く（数百KB なので git で取り込んでよい）
git fetch origin claude/serene-darwin-sf09tt && git merge FETCH_HEAD
python3 tools/shorts/ingest/decrypt.py --key <秘密鍵> --out <リポジトリの外> shorts/.work/VusdZVyjgjQ/captions
```

- **媒体は落とさない**（`yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs ja-orig,ja`）。
  ffmpeg も whisper も入れないので、job は1分ほどで終わる
- 開くと `<out>/<id>/captions/` に `captions.txt`（**読む用。`[H:MM:SS] 文` を1行1文**。句点・1.2秒を越える
  息つぎ・40字で切る。頭の `# ` の数行が題・長さ・字幕の種類・行数）・`captions.json`（字幕の1行ずつと語の時刻）・
  `meta.json`（題・長さ・公開日時・chapters・heatmap）・`run.json`（当たった口と成否）
- 字幕は `ja-orig`（話した言葉のまま）を先に、無ければ `ja`。口は tools/clip/fetch.py の順に当たり、
  字幕が取れた口で止める（5つまで）。**Cookie・PO Token は fetch の job と同じ**（`YOUTUBE_COOKIES` を読むだけ・
  gate.py を通る・fetch と同じ concurrency の枠）。同じ push に archive などが混ざっていても、
  fetch は captions の job が終わってから走る（同じ run の2つの job で Cookie を同時に握らない）
- **字幕が取れないとき** — 「この動画には ja の字幕（自動も手動も）がまだ無い」は、口2つが揃って
  字幕の一覧に ja が無いと言ったとき。配信の直後は自動字幕が遅れて付くので、時間をおいて依頼の名前を
  変えて頼み直す。どちらでも「取れなかった」封は置かれ（manifest の `status: failed`）、job は赤くなる
- 区間が決まったら、その区間だけを `clips`（編集の素材）・`zoom`（コマを細かく）で頼む。
  配信まるごとの `archive` は、自動字幕が無い・崩れていて読めない回だけ。**原稿は whisper を待たない**
- 前の版で開いた `captions.txt` の切りかたを揃えるときは
  `python3 tools/shorts/ingest/quick_captions.py --text <out>/<id>/captions/captions.json`

2026-10-22 の実測（VusdZVyjgjQ・3時間55分）: push から暗号文が枝に積まれるまで **62秒・61秒**
（run 39870585977・39871775416。captions の job 45秒・43秒。道具の入れ 9〜11秒・字幕を取って封をする
15秒・置く 2〜3秒）。字幕 2,819行 → 1行1文 3,804行（最長59字）・暗号文 0.2MB。
同じ回の archive は、道具の入れ 32分・whisper 40分超だった。

## 置かれるもの（平文）

```
shorts/.work/<videoId>/archive/            …/reference/   …/zoom-<開始秒>-<終了秒>-<fps>fps/   …/clips/
shorts/.work/channels/<@を外した名前>/<tab>/
    manifest.json   平文。状態と数だけ
    key.enc         RSA-OAEP(SHA-256) で包んだ AES 鍵・HMAC 鍵・IV（80バイト）
    payload.enc     中身の tar.gz を AES-256-CBC で暗号化したもの（45MB を超えたら .000 .001 … に切る）
    sheets.key.enc  clips だけ。見る用の小さな封の鍵（key.enc とは別の鍵）
    sheets.enc      clips だけ。シート（sheets/・sheets.csv）と一覧（index.json・index.md・meta.json）
                    だけを同じ形で包んだもの。数MB（大きいほうの封にも同じものが入っている）
```

**45MB で切るのは、GitHub が 100MB を超えるファイルの push を断る（50MB から警告）から。**
clips は暗号文が数百MB になるので、ほぼ必ず切れる。切った順につなぐと元の暗号文で、
HMAC はつないだ全体に掛けてある。`push.sh` は 90MB 以上のファイルが混ざっていたら置かずに落ちる。

`manifest.json` の欄: `status`（ok / partial / failed）・`stages`（段ごとの ok / failed / skipped）・
`counts`（シートの枚数・字幕と書き起こしの区間数・変わりめの数・一覧の本数・clips の本数と合格した本数と秒・ファイル数）・
`bytes`（平文 / tar.gz / 暗号文）・`encrypted_files`（名前・バイト・sha256）・`hmac_sha256`・
`pubkey_sha256`（どの鍵で包んだか）・`run`（Actions の run の URL）・
`sheets`（clips だけ。小さな封の鍵のファイル名・暗号文の一覧・HMAC・シートの枚数・ファイル数・バイト数）。
**題名・字幕・理由の文面は入れない**（理由は暗号化した `run.json` の中）。

## 開きかた

```bash
git fetch origin claude/serene-darwin-sf09tt && git merge --ff-only FETCH_HEAD
python3 tools/shorts/ingest/decrypt.py --key <スクラッチパッド>/keys/priv.pem --out <スクラッチパッド>/ingest
# 1つだけ: 末尾に shorts/.work/yk-by7R7iPA/archive のように置き場を足す
```

`<out>/<置き場>/` に開く（例 `<out>/yk-by7R7iPA/archive/`、`<out>/channels/cheethann3/shorts/`）。
**展開先がリポジトリの中なら断る。** 鍵違い・暗号文の破損（HMAC 不一致）も開かない。
切った暗号文（`payload.enc.000` …）は manifest の並びの順につないで開く。1つでも欠けている・
sha256 が合わないときは開かない（git の取り込みが途中なら、取り込み直す）。
clips は数百MB になるので、全体をメモリに載せずに 1MB ずつ流して開く
（復号した tar.gz は展開先の隣に一時ファイルで受けて、展開したら消す）。

### シートだけ開く（clips。本編集の担当はまずこれ）

**枝を git で取り込まない。** 取り込むと mp4 の暗号文（数百MB）も全部落ちてくる。
`--branch` は GitHub の API（`gh api`）で、枝の先の commit から `manifest.json` と小さな封
（`sheets.key.enc`・`sheets.enc`）だけを取り、`<out>/.sealed/` に置いてから開く。
中身は git の blob（`git/blobs/<sha>`）で取り、届いたものの git の hash を置き場の一覧と突き合わせる。
合わない置き場は `NG` と出して開かず、終了コードは 1（ほかの置き場は開く。下の「これまでに踏んだこと」）。

```bash
K=<スクラッチパッド>/keys/ref_private.pem; O=<スクラッチパッド>/ingest
python3 tools/shorts/ingest/decrypt.py --key $K --out $O --sheets --branch claude/serene-darwin-sf09tt
#   → この鍵で包んだ clips を全部。1つだけなら末尾に shorts/.work/weSZaHeQVlI/clips のように足す
ls $O/weSZaHeQVlI/clips/sheets/          # 01_01.jpg 01_02.jpg 02_01.jpg …（Read で開く）
```

- 開くと `<out>/<videoId>/clips/` に `sheets/NN_PP.jpg`・`sheets.csv`・`index.json`・`index.md`・`meta.json`。
  **先に開いた mp4 は消さない**（`sheets/` だけを入れ替える）
- 枝を取り込み済みなら `--branch` を外して置き場を指す（`--sheets shorts/.work/<id>/clips`）
- 画が決まって mp4 が要るようになったら、前と同じく git で取り込んで `--sheets` 無しで開く
- ほかの担当の鍵で包んだ置き場は、manifest だけ読んで飛ばす。`--sheets` で小さな封が無い回
  （シートを作る前の回・archive など）は「シートの封が無い」で断る

## 中身（暗号化の中）

まず `index.md` を開く（そのフォルダに何があって、各列が何かを書いてある）。

| ファイル | archive | reference | zoom | channel | 中身 |
| --- | :-: | :-: | :-: | :-: | --- |
| `meta.json` | ○ | ○ | ○ | | 題名・チャンネル・長さ・公開日時・再生数/高評価数（`counts_fetched_at` の時点）・縦横・fps・yt-dlp の版・`heatmap`（よく再生された部分）・chapters |
| `captions.json` / `.txt` | ○ | ○ | | | YouTube の字幕（ja）。`source` が auto / manual。取れなければ `ok:false` と `why` |
| `transcript.json` / `.txt` | ○ | ○ | | | faster-whisper。区間ごとに start / end / text と単語ごとの時刻。頭にモデル・かかった秒・RTF。`.txt` は単語の時刻で句点・0.6秒の間・30字ごとに切った読む用（前の版で作った `.txt` は `python3 tools/shorts/ingest/asr.py text transcript.json` で作り直せる） |
| `sheets/NNNN.jpg` + `sheets.csv` | 10秒に1コマ・5×4（200秒/枚）・長辺320 | 1秒に1コマ・4×3・長辺480 | 指定 fps・既定 4×3・長辺480（`grid` / `tile` で変える） | | 各コマの下の帯がそのコマの**本当の時刻** |
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

### clips の中身

| ファイル | 中身 |
| --- | --- |
| `NN_H-MM-SS_H-MM-SS.mp4` | 依頼に並べた区間を1本ずつ（`NN` は並べた順）。**0秒が配信の区間の頭のコマ。** 元の縦横・fps（CFR に揃える）・音つき。H.264（x264 CRF 18・preset slow・yuv420p）＋ AAC 192k ステレオ |
| `index.json` | `clips[]` = n / range / start / end（配信の秒）/ file / duration / video_duration / audio_duration / width / height / fps / frames / bytes / sha256 / ok / why。`source`（取った形式・縦横・fps・符号化）と `encode`（切りかた） |
| `sheets/NN_PP.jpg` | 見る用のシート。`NN` は mp4 の番号、`PP` は何枚目か。**切った mp4 から**2秒に1コマ（mp4 の0秒から）。各コマの下の帯が**配信の時刻**（端数のある区間は 0.1秒まで）と mp4 の中の秒（`+12s`。指示書の in / out はこれ × fps のコマ番号）。縦長は 6×5（1枚60秒）・横長は 5×6。60秒を超える区間は均して何枚かに分ける（31コマを 30＋1 にしない）。1コマの長辺 320 |
| `sheets.csv` | clip（mp4 の番号）/ file / from_hms / to_hms / from / to（配信の秒）/ frames / bytes / clip_file / start |
| `meta.json` | 上の表と同じ（題名・長さ・`original_max`＝YouTube にある最大の縦横）に、`ranges` を足したもの |
| `run.json` / `logs/` | 段の成否と、yt-dlp・ffmpeg（`ffmpeg_clips.log`）のログ |

**なぜ区間ごとに取らず、配信を丸ごと取ってから切るか。** yt-dlp の区間取り
（`--download-sections`）は ffmpeg の `-ss … -c copy` で落とすので、頭が区間の手前の
キーフレームに寄り、そのファイルの 0秒が配信の何秒かを確かめる手が無い。clips は
配信と同じ時間軸のファイルを1本持ち、`-ss` を入力の前に置いて符号化し直す
（ffmpeg が手前のキーフレームから復号して、頼んだ秒より前のコマを捨ててから書く）。
`dryrun.py` が、コマ番号を縞で焼いた動画（キーフレーム5秒おき）でこれを当てている。

**合否は1本ずつ。** 長さが頼んだ秒から ±0.5秒・映像と音がある・縦横が元と同じ・
fps が元と同じ、のどれかが外れた mp4 は `ok:false` と `why` が付き、段 `clips` が failed
（manifest は partial）になる。合格したぶんはそのまま使える。

映像は「縦横 → fps → 符号化」の順に選ぶ（`-S res,fps,vcodec:avc`）。同じ縦横なら avc1 を取る
（YouTube は avc1 にいちばん多くビットを割き、zoom と同じ元になるのでコマを突き合わせられる）。
音は既定の並びでいちばん良いもの（ふつうは opus）。

## どれくらいかかるか（2026-10-15 の実測。ランナーは 4 vCPU / 16GB・GPU 無し）

| | yk-by7R7iPA（1:42:49） | hK0SwIeAxg0（3:29:53） | 参考ショート（15〜170秒） |
| --- | --- | --- | --- |
| 取る（480p avc1 + m4a、字幕・info つき） | 66〜166秒 / 670MB | 118〜252秒 / 1.5GB | 1本 8〜24秒（37本で12分） |
| 音（16kHz wav・RMS・EBU R128） | 44秒 | 61秒 | — |
| 映像（1回読み・5コマ/秒の数値・10秒1コマのシート） | 127秒 | 208秒 | — |
| whisper large-v3-turbo（int8・8本まとめて・beam 5・VAD） | 読み込み18秒 + **1068秒（RTF 0.173）** | 読み込み14秒 + **1518秒（RTF 0.121）** | 読み込み15〜18秒 + 21〜26秒 |
| 解析の job 全体 | 25分（bench 4分を含む） | 30分 | 1本 約2分 |
| 暗号化して置いたもの | 6.8MB（シート31枚 6.5MB） | 18.3MB（シート63枚 17.8MB） | 1〜3MB |

VAD は yk の 6,169秒のうち 3,080秒、hK の 12,593秒のうち 7,329秒を「声がある」として残した。

clips の見る用のシート（2026-10-21・run 39660478161。フランス周遊 A の橋 2区間・ヴァンス 1区間、どれも 720x1280）:

| | weSZaHeQVlI（45秒＋60秒） | hPZ2hAggOLE（45秒） |
| --- | --- | --- |
| シート | 2枚（23コマ・30コマ）0.78MB | 1枚（23コマ）0.30MB |
| sheets の段 | — | **1.6秒**（切る clips の段は 25.4秒） |
| 小さな封（sheets.enc） | **0.77MB** | **0.29MB** |
| 大きいほうの封（mp4 入り） | 60.8MB（2つに切れた） | 22.6MB |

`--sheets --branch` で2か所を取って開くまで **5.2秒**（取ったのは 1.1MB）。前は担当が枝を取り込み、
mp4 の暗号文を開いてから手元の使い捨てで18区間のコマ一覧を作り直していた（コマ一覧だけで211秒）。
帯の秒と画が合っていることは、ヴァンスの mp4 を開いて当てた（23コマとも、帯の秒のコマが
mp4 のコマの中でいちばん近い。1秒ずらして当てると 22コマが外れる）。

同じ5分（yk の 0:20:00〜0:25:00）をモデル違いで書き起こした秒（`bench/bench.md`）:

| モデル | 書き起こし秒 | RTF | 所感 |
| --- | --- | --- | --- |
| small | 26.7 | 0.089 | 固有名詞が崩れる（鬼滅の刃→キミツネイバ、画質→合室、投げ銭→投げ戦） |
| medium | 76.3 | 0.254 | 鬼滅の刃・画質・SIM は通る。祝日→スクリーツ、投げ銭→投げ戦 |
| large-v3 | 127.8 | 0.426 | 鬼滅の刃・祝日・SIM・画質・投げ銭が通る |
| **large-v3-turbo（本番）** | 全体で RTF 0.17 | — | large-v3 とほぼ同じ字面（鬼滅の刃・祝日・画質・投げ銭）で、速さは約2.5倍。SIM を1か所「新聞」と聞き違えた |

**自動字幕（YouTube）と whisper はどちらも要る。** whisper は固有名詞に強い（鬼滅の刃・祝日・
スカンデルベグを自動字幕より多く正しく拾う）が、VAD で小声を落とすので字数は自動字幕の8割
（yk 13,235字 / 16,655字）。数字は自動字幕のほうが残ることがある（hK 1:52 の「23.900ユロ」を
whisper は「900ユーロ」と頭を落とした）。BGM だけの終わりに「ご視聴ありがとうございました」を
足すことがある（参考ショートで実際に出た。配信2本では0回）。

## 手元で確かめる（YouTube に行かずに一周）

```bash
python3 tools/shorts/ingest/dryrun.py <リポジトリの外の空きフォルダ>
```

ffmpeg で場面の変わりめが分かっている縦長の動画を作り、解析 → 暗号化 → 復号を通す。
変わりめの時刻・シートの枚数と焼いた秒・zoom の秒の足し込み・channel の並び・
復号したものが元と1バイトも違わないこと・鍵違い／暗号文の破損／リポジトリの中への展開を
断ることを見る。whisper はモデルを落とせない箱でも回るように外してある（`whisper: failed` は正常）。

clips は、コマ番号を2進の縞で焼いた動画（キーフレーム5秒おき・B フレームあり）から
区間を切り、**切った mp4 の1コマ目が頼んだ秒のコマで、そこから1コマも抜けず重ならずに
続くこと**を縞を読み戻して見る。動画の外にはみ出す区間が NG になって残りが使えること、
暗号文を小さく切ってもつないで開けること・切れ端が1つ欠けたら開かないことも見る。
clips のシートは、**シートの各コマに写っている縞が「区間の頭＋2秒×k」のコマ**であること
（帯の秒と画が合っている）・コマの数と枚数・横長の長い区間（65.5秒・頭に端数）が横長の格子で
17＋16 に均されること・小さな封の3つだけ（mp4 の暗号文無し）で `--sheets` が開けて、
出てくるのがシートと一覧だけで元と1バイトも違わないことを見る。

毎回の PR では、ffmpeg の要らない5本が回し役（`python3 python/selftest_runner.py`）から走る。

- `quick_captions_selftest.py` — 字幕だけの道。偽の yt-dlp（`python -m yt_dlp` で起きる）と偽の gate で、
  頼むのが字幕と info.json だけ（`--skip-download`・媒体の形式を頼まない）・ja-orig を先に選ぶ・
  1行1文の切りかた・口の当たりかた（ボット確認を飛ばす・字幕が無いと口2つが言ったら見切る・5つで止まる）・
  一周して封に題名も字幕も平文で出ず、封をしたら平文が残らない・gate が止めたら YouTube に当たらない・
  retry.sh（上限で切って1回だけ取り直す）・ワークフローの captions の job と道具の入れの上限。
  守りを1つずつ外した写しで回して、その足だけが落ちることも見る（`BREAK=<名前>` で1つだけ）

- `plan_selftest.py` — 依頼の読みかた。clips の18区間が1本の job・頼んだ順のまま・上限で断る、
  zoom と archive が変わっていない。captions は fetch / analyze の列に入らず `captions` / `captions_count` に分かれる
- `gate_selftest.py` — 毎晩の取り込みとぶつからないか（下の「毎晩の取り込みと同時に取らない」）。
  偽の Actions と偽の時計で、動いていない → すぐ通る・queued / in_progress → 待つ・
  60分で止まる・読めない → 時計の枠に戻る、と、plan / download が本当にここを通ること・
  ワークフローが `actions: read` を渡していること
- `decrypt_selftest.py` — 切った暗号文の封と開け。つないで1バイトも違わない・切らない形も開く・
  壊れた／書き換えた／欠けた／入れ替えた切れ端・違う鍵・git の中への展開を断る。
  clips の小さな封: 3つだけ（payload.enc 無し）で `--sheets` が開きシートと一覧だけが出る・
  壊した／違う鍵／小さな封の無い回は断る・`--branch` が取りに行くのは manifest と小さな封だけ
  （偽の GitHub で回す）。偽の GitHub に contents の raw の書き換えをさせ、前の取りかたでは化けて
  開けない（対照）・blob で取れば大きいほうまで元のまま開く・blob まで化けたら突き合わせで止まる（対照）・
  main ごと回して化けた置き場だけ NG で終了コード 1
- `push_selftest.py` — 作業枝に置く（push.sh）。f が小さな封（sheets.key.enc・sheets.enc）を置くこと、
  g が字幕だけの道の封を置き場ごとに `SEALED` で指して続けて置くこと

## 落ちたときの見方

1. **`manifest.json` の `stages`** を見る（平文なので git で取り込めば読める）。
   `download: failed` なら取れていない。それ以外が failed なら、復号して `run.json` の
   `stages[].error` を見る
2. **取れていない**とき — Actions の `fetch` の job のログに、口（player_client）ごとの
   `見えた / 駄目` と断り文句、1本ごとの `OK / NG（理由）` が出る。理由の語は
   `ボット確認`（Cookie が無効か IP の評判）/ `429（取りすぎ）`/ `動画が見られない`/ `形式が無い`。
   yt-dlp の出力そのものは暗号化した `logs/ytdlp.log` にある
3. **plan で落ちた** — 依頼の形・公開鍵・枝の名前、または毎晩の取り込みを60分待っても
   終わらなかった（Actions が読めないときは時計の枠の中だった）。理由はログに1行で出る。
   待ったかどうかは `判定:` で始まる行（下の「毎晩の取り込みと同時に取らない」）
4. **作業枝に置けなかった** — `analyze` の job の「作業枝に置く」。8回とも push を断られたら赤。
   枝が消えていた（PR のマージで消える）ときは、その run の sha の上に作り直して置き、
   run の頁に `::warning::` で出る（`push.sh`・#291）
5. **キャッシュの受け渡し** — `fetch` が落ちて何も置けなかったとき、`analyze` は
   「取ったものがキャッシュに無い」で failed の manifest を置く
6. **道具を入れる段が長い・赤い** — captions / fetch / analyze の「道具を入れる」は、apt・pip・npm・clone を
   1つずつ上限つきで回し、越えたら切って1回だけ取り直す（`retry.sh`。ふだんは全部で10〜40秒）。
   ログの `!! apt-get update -qq … 120秒で終わらないので切った（1回目・120秒）` が止まったところ。
   2回とも駄目なら段ごと赤くなる（段そのものにも `timeout-minutes` がある）。2026-10-22 に
   analyze の段が32分止まったのを受けて置いた。切ったところは `::warning::` で run の頁の注記にも出る
   （この箱からはログが読めないが、注記は `gh api repos/…/check-runs/<job>/annotations` で読める）。
   **ffmpeg は `ffmpeg.sh` が入れる。** 入っていれば apt に触らず、apt（`--no-install-recommends`）が
   上限で2回切られたら GitHub の静的ビルド（BtbN/FFmpeg-Builds）に切り替える。同じ晩、clips の fetch が
   apt-get install ffmpeg を4分ずつ2回切られて落ちたため（run 39870741046）。静的ビルドは**版の決まった枝**
   （`ffmpeg-n8.1-latest` → `ffmpeg-n9.0-latest`）だけを当て、master の夜間版には逃げない（2026-10-23、
   夜間版で `-vsync` が消えていて検査が止まった。#1015）。どの枝も落とせなければ赤くなるので、
   `ffmpeg.sh` の `FFMPEG_STATIC_BRANCHES` の既定を、BtbN の latest に今ある枝に上げる

`fetch` の job は**同じ ref の毎晩の取り込みと同じ枠**（`fetch-chat-${{ github.ref }}`）。
1つの枠に「走っている1本＋待っている1本」までしか並ばず、3本目が来ると待っていた
1本が取り消される。**依頼は1回の push にまとめるか、前の fetch が終わってから次を push する。**
作業枝から push で走るときは ref が master と違うので、毎晩の取り込みとは枠が別になる
（そちらと重ならないことは、下の gate.py が受け持つ）。

### 毎晩の取り込みと同時に取らない（`gate.py`）

**時計では決めない。Actions の run を見る。** `YOUTUBE_COOKIES` を使うワークフローの run が
`queued` / `in_progress`（plan では `pending` も）なら、1分ごとに見直して終わるまで待つ。

- **見るワークフローは、そのたびに grep して求める**（`.github/workflows/*.yml` のうち、
  コメントでない行に `YOUTUBE_COOKIES` が在るもの。自分を除く）。いまの一覧は
  `python3 tools/shorts/ingest/gate.py --list`。コメントでしか名前を出していない
  `rebake.yml` などは Cookie を握らないので入らない
- **待つのは plan（取る前）と download.py（1本ごと）。** 持ち時間はどちらも60分
  （download.py は job の中で合わせて60分）。待ち切れたら止めて、どの run が動いていたかを
  1行で出す。plan で止まれば何も置かれない。download.py で止まった動画は「取らなかった」
  manifest が置かれる
- **ログの読みどころは `判定:` の行。** `毎晩の取り込み（Cookie を使うもの 3本）は動いていない → 通る`
  ／ `毎晩の取り込みが終わった（3分待った） → 通る` ／ `60分待っても終わらない: … → 止める`
- **Actions が読めないとき**（権限が無い・通信に落ちた・見るワークフローが0本）だけ、
  前の時計の枠に戻る。21:15〜23:59 UTC なら止める（00:00 UTC を過ぎてから push し直す）。
  1回だけ読めないのは10秒あけて読み直す。動いていると読めたあとで読めなくなったら、
  終わったとはみなさず待ち続ける
- **download.py は `pending` を待たない。** master で回すと、fetch の job は毎晩の取り込みと
  同じ枠を握るので、あちらの `pending` はこちらが終わるのを待っている。それを待つと互いに止まる

**なぜ時計をやめたか。** 毎晩の取り込みは cron の時刻どおりに走らず、遅れは月ごとに伸びている
（いまの遅れは `python3 python/cron_lag.py` で測る。2026-10-18 に測ったときは、20:00 UTC の
cron が直近30日で 21:54〜01:48 UTC に来ていた）。
時計の枠（21:15〜23:59 UTC）は、枠の外に来た晩（00:05・01:03・01:45 UTC）を防げず、
取り込みが1回3分で終わったあとの空いた時間まで止めていた。2026-10-18 は 20:25 UTC に
頼んだ取り込みが 00:00 まで3時間半待たされた（その晩の取り込みは 22:08〜22:12 だった）。

**取り直しても変わらない理由では粘らない。** `長尺（240秒超）なので取らなかった`（reference だけ。
`--match-filter`）と、どの口でも `Video unavailable`（消された・非公開）は1回で見切る。
1つの口だけが `Video unavailable` と言うことはある（default が言って mweb で取れた）。

### これまでに踏んだこと

- **枝を作った push / ふつうの push で依頼が0件になる** — Actions に届く push の `commits[]` から
  added / modified が読めなかった。いまは push の前後を compare で引いている
- **whisper が10秒で落ちる** — faster-whisper 1.2.1 がファイルの道を渡されると PyAV で読み直し、
  いまの PyAV が `metadata_errors` を受け付けない。手元の 16kHz wav を読んで波形で渡している
- **回ごと取り消したのに解析が走る** — `if: always()` だった。いまは `!cancelled()`
- **10秒刻みのコマと焼いた秒が5〜10秒ずれる** — `fps` フィルタの丸め。`select` で取り、
  showinfo の本当の時刻を焼いている（`media.py` の頭）
- **37本を並べると push がぶつかる** — 取り直しを8回・ばらつかせた待ちにした
- **`--branch` で key.enc が化ける**（2026-10-23）— dRXae0mJw8M の clips の `key.enc`（384バイトの乱数）が
  571バイトの文字列で届き、openssl が開けず `CalledProcessError` で止まった。`contents/<道>` を
  `Accept: application/vnd.github.raw` で取ると、GitHub が乱数を UTF-16BE の文字と見立てて
  UTF-8 に書き換えて返していた（応答の Content-Length が既に 571）。同じファイルを
  `git/blobs/<sha>` の raw で取ると 384バイトのまま。いまは blob で取り、git の hash で確かめる

## 守っていること

- `YOUTUBE_COOKIES` は**読むだけ**。`cookies/update` は使わない。`/tmp` の写しは job の最後で消す
- Cookie を使うほかの取り込み（毎晩の取り込みほか）が動いているあいだは取り始めない
  （plan と download.py の両方で Actions の run を見る。読めないときだけ 21:15〜23:59 UTC の時計の枠）
- ログに出すのは段・状態・秒・個数・バイト数だけ。題名・字幕・フレームは出さない
- 動画の実物（mp4 / mkv / m4a）は平文で commit しない。取ったものはキャッシュで受け渡して、
  最後に消す。clips の mp4 も暗号文の中にだけ入る
- チャット（視聴者の名前）は取らない（字幕は `ja-orig,ja` だけを頼む）
- 置くのは `claude/` で始まる枝だけ。`push.sh` が `manifest.json / key.enc / payload.enc*` /
  `sheets.key.enc / sheets.enc*` 以外が混ざっていないこと・90MB 以上のファイルが無いことを見てから置く
