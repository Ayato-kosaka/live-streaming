# ショートの材料を作る（取り込み・解析）

配信アーカイブ・参考ショート・チャンネルの一覧から、見どころ探しの**材料**を作る。
見どころの判断（意味の理解）はしない。材料は3つ。

- **文字起こし** — YouTube の自動字幕と faster-whisper の2系統
- **コンタクトシート** — 一定の刻みのコマを格子に並べ、各コマの下に `H:MM:SS` を焼いた JPEG
- **数値の時系列** — 1秒ごとの動き・明るさ・彩度・音量（RMS / LUFS）、場面の変わりめ、
  10秒ごとの要約（YouTube の「よく再生された部分」つき）

もう1つ、企画が決まったあとの**編集の素材**も同じ道で取る（`clips`）。頼んだ区間を
1本ずつ、元の縦横・fps・音つきの mp4 に切ったもの。書き出し（`tools/shorts/render/`）が
これを読む。

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
```

| 欄 | 意味 | 既定 |
| --- | --- | --- |
| `mode` | `archive`（長い配信）/ `reference`（他人のショート）/ `zoom`（区間を細かく）/ `channel`（一覧）/ `clips`（編集の素材。区間ごとの mp4） | 必須 |
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

## 置かれるもの（平文）

```
shorts/.work/<videoId>/archive/            …/reference/   …/zoom-<開始秒>-<終了秒>-<fps>fps/   …/clips/
shorts/.work/channels/<@を外した名前>/<tab>/
    manifest.json   平文。状態と数だけ
    key.enc         RSA-OAEP(SHA-256) で包んだ AES 鍵・HMAC 鍵・IV（80バイト）
    payload.enc     中身の tar.gz を AES-256-CBC で暗号化したもの（45MB を超えたら .000 .001 … に切る）
```

**45MB で切るのは、GitHub が 100MB を超えるファイルの push を断る（50MB から警告）から。**
clips は暗号文が数百MB になるので、ほぼ必ず切れる。切った順につなぐと元の暗号文で、
HMAC はつないだ全体に掛けてある。`push.sh` は 90MB 以上のファイルが混ざっていたら置かずに落ちる。

`manifest.json` の欄: `status`（ok / partial / failed）・`stages`（段ごとの ok / failed / skipped）・
`counts`（シートの枚数・字幕と書き起こしの区間数・変わりめの数・一覧の本数・clips の本数と合格した本数と秒・ファイル数）・
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
切った暗号文（`payload.enc.000` …）は manifest の並びの順につないで開く。1つでも欠けている・
sha256 が合わないときは開かない（git の取り込みが途中なら、取り込み直す）。
clips は数百MB になるので、全体をメモリに載せずに 1MB ずつ流して開く
（復号した tar.gz は展開先の隣に一時ファイルで受けて、展開したら消す）。

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

毎回の PR では、ffmpeg の要らない2本が回し役（`python3 python/selftest_runner.py`）から走る。

- `plan_selftest.py` — 依頼の読みかた。clips の18区間が1本の job・頼んだ順のまま・上限で断る、
  zoom と archive が変わっていない
- `decrypt_selftest.py` — 切った暗号文の封と開け。つないで1バイトも違わない・切らない形も開く・
  壊れた／書き換えた／欠けた／入れ替えた切れ端・違う鍵・git の中への展開を断る

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
作業枝から push で走るときは ref が master と違うので、毎晩の取り込みとは枠が別になる
（そちらと重ならないことは、時間帯の見張りが受け持つ）。

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

## 守っていること

- `YOUTUBE_COOKIES` は**読むだけ**。`cookies/update` は使わない。`/tmp` の写しは job の最後で消す
- 21:15〜23:59 UTC は取り始めない（plan と download.py の両方で見る）
- ログに出すのは段・状態・秒・個数・バイト数だけ。題名・字幕・フレームは出さない
- 動画の実物（mp4 / mkv / m4a）は平文で commit しない。取ったものはキャッシュで受け渡して、
  最後に消す。clips の mp4 も暗号文の中にだけ入る
- チャット（視聴者の名前）は取らない（字幕は `ja-orig,ja` だけを頼む）
- 置くのは `claude/` で始まる枝だけ。`push.sh` が `manifest.json / key.enc / payload.enc*`
  以外が混ざっていないこと・90MB 以上のファイルが無いことを見てから置く
