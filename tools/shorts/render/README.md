# ショートの書き出し（編集指示書 → 縦型 mp4）

編集指示書（JSON）1つから、1080×1920・30fps のショートを ffmpeg で書き出す。
同じ指示書からは、同じバイト列が出る（`verify.py --twin` で確かめる）。

```bash
bash tools/shorts/render/fetch_fonts.sh                 # 書体（OFL）を落とす。git には入れない
python3 tools/shorts/render/render.py edit.json --out out.mp4 --work out.work
python3 tools/shorts/render/verify.py out.mp4 out.work  # 形式・カット位置・字幕の出入り・音量差
```

要るもの: ffmpeg（libx264 入り。ubuntu-24.04 の apt の 6.1.1 で確かめた）、
python3 の numpy・Pillow・budoux・OpenCV（`opencv-python-headless`。5.0.0 で確かめた）、
仮ナレーションに open_jtalk（`open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001`）。
`fetch_fonts.sh` は書体と、顔の見つけ役（YuNet、MIT）の重みも落とす。

**コマは Python を通る。** ffmpeg は復号と符号化だけで、その間で1コマずつ
透かしを切り落とし・顔をぼかし・1080×1920 に収め（ゆっくり寄るもここ）・字を重ねる。
ffmpeg のフィルタだと、寄りが整数の画素に丸められて震え、ぼかしの箱の大きさを
時間で変えられず、テロップの「ポン」が作れなかった（`render.py` の頭）。
30秒で約1分（4コア。復号・加工・符号化を別の糸で重ねている）。

### 本番の素材で回す（企画 → 指示書 → 書き出し → 確かめる）

```bash
python3 tools/shorts/plan/build_edit.py shorts/videos/<id>/p1/spec_A.json \
  --clips <clips>/index.json --voice <voice>/lines.json --bgm <bgm>.mp3 \
  --overrides ov_A.json --blur blur_<id>.json --video <id> --out edit_A.json
python3 tools/shorts/render/faces.py edit_A.json faces_A/          # 顔の見落としを探す（決めるのは人）
python3 tools/shorts/render/render.py edit_A.json --out A.mp4 --work A.work
python3 tools/shorts/render/sheet.py A.mp4 A.work A_sheet.jpg      # 行ごとの真ん中の1コマを並べた1枚
python3 tools/shorts/render/render.py edit_A.json --out A_bare.mp4 --work A_bare.work --no-text
python3 tools/shorts/render/safearea.py A.mp4 A_bare.mp4           # 字の画素が安全領域の外に無いか
```

`verify.py` のカット照合は合成素材の箱を読むので、本番の素材では使えない（字幕の出入り・音量・
`--twin` は本番でも意味がある）。

### 道具が壊れていないかを確かめる（合成素材で）

`make_assets.py` が、コマごとにフレーム番号を白黒の箱で焼いた合成映像を作る。
`verify.py` はその箱を書き出しから読み戻して、指示書のカット位置と1コマ単位で照合する。

```bash
python3 tools/shorts/render/make_assets.py /tmp/sh/assets      # 縦・横の合成映像と BGM（2分ほど）
cp tools/shorts/render/example.edit.json /tmp/sh/edit.json
python3 tools/shorts/render/render.py /tmp/sh/edit.json --out /tmp/sh/a.mp4 --work /tmp/sh/a.work
python3 tools/shorts/render/render.py /tmp/sh/edit.json --out /tmp/sh/b.mp4 --work /tmp/sh/b.work
python3 tools/shorts/render/verify.py /tmp/sh/a.mp4 /tmp/sh/a.work --twin /tmp/sh/b.mp4
```

**x264 はスライス単位の並列にしてある**（`sliced-threads=1`）。コマ単位の並列だと、
箱が混んでいるときだけ別のバイト列が出た（同時に3本回して1本違った）。
ffmpeg の版が変わればバイト列も変わる。照合とダッキングの検査は版に依存しない。

## 人が直した差分を当てる

微修正の画面（PoC）は、直したところを ```json の囲みで出す。issue に貼られたら:

```bash
python3 tools/shorts/render/apply_patch.py edit.json comment.md --out edit2.json
```

字幕の文字はナレーションの行の `caption` に入り、カットの長さが変わったら後ろのナレーションとテロップを同じだけずらす。

## 編集指示書

`example.edit.json` が見本（合成素材で、ぼかし・元の音・テロップまで通る）。

| 欄 | 中身 |
| --- | --- |
| `sources.<名>.watermark` | 焼き込まれた透かしの名前（`style.json` の `watermarks`）。`prism_live` なら下の帯を切り落として使う |
| `cuts[].in` / `out` | 元素材の**フレーム番号**（`out` は含まない）。秒で持たない（29.97 と 30 の丸めで1コマずれる） |
| `cuts[].fit` | `cover`（縦いっぱいに拡大して切る。`focus_x` / `focus_y` で寄せ）/ `blur`（全体を入れて背景をぼかす） |
| `cuts[].zoom` | ゆっくり寄る。`{"from": 1.0, "to": 1.12, "x": 0.5, "y": 0.4}`（x, y は元素材の 0〜1。その点を動かさずに寄る。`"ease": "out"` で終わりを緩める） |
| `cuts[].blur` | 顔を潰す箱。元素材の画素 `[x, y, w, h]`。`{"rect": …}` か `{"keys": [{"f": 元素材のコマ, "rect": …}, …]}`（直線で補う）。`from` / `to`（元素材のコマ）で出す間を絞る。`cells` はモザイクの細かさ（短い辺を何マスに。既定 7） |
| `cuts[].inset` | 元素材の一部を札にして大きく見せる。`{"rect": [x, y, w, h], "w": 840, "cy": 765}`（下の「字の置き場」） |
| `cuts[].audio_db` | 元の音を入れる（既定は消す）。本人の短い一言を残すとき。ナレーションの間は BGM と同じだけ下がる |
| `title.text` | 上のタイトル。`\n` で改行。無ければ文節で折り返す |
| `telops[]` | 強調の字（絵コンテの「中央: …」）。`{"from", "to", "text"}`。重ねてはいけない（同時に1つ）。`parts: [{"text", "at"}]` で言葉を順に足す |
| `narration.engine` | `files`（行ごとの声のファイル。本番）/ `open_jtalk`（尺の下書き） |
| `narration.lines[].at` | できあがりの何フレーム目から話すか |
| `narration.lines[].audio` | その行の声（Fish Audio のファイル）。頭と尻の無音を詰めて使う |
| `narration.lines[].caption` | 字幕だけ変えたいとき（声はそのまま）。人が直す画面がここに書く |
| `bgm.path` / `db` / `start_s` | BGM。ナレーションの間だけ `style.json` の `duck_db` 下がる |

**字幕は声の長さから決まる。** 行ごとの声の頭と尻の無音を詰め、声が鳴っている間（＋6コマ）だけ出す。
だから字幕と声は同じフレームで始まる。次の行が12コマ以内に始まるなら、そこまで出したままにする
（消えるのと画が変わるのが同じコマになる。7コマだけ消えてまた出る、のちらつきも無くなる）。
2行に収まらない字幕は、文ごと（長ければ「、」ごと）に何枚かに分け、切り替えを**声の間**に合わせる
（字数の比で見当をつけ、いちばん近い「間のあと声が出るコマ」へ寄せる）。

## 字の置き場（タイトル・テロップ・字幕）

画面に出す字は3種類だけ。縦に重ならないように、置き場を固定している。

| | 置き場（1080×1920） | 形 |
| --- | --- | --- |
| タイトル | y=380 から（2行で 380〜640） | 黄色の角丸の箱に黒い太丸ゴシック。全編 |
| テロップ | タイトルの下端＋20 〜 字幕2行ぶんの上端−20（660〜869）の**真ん中** | 黄色い字・黒の太い縁・下に影。数字だけ 1.3倍。出だしの5コマで「ポン」と出る（0.7→0.92→1.06→1.02→1.0） |
| 字幕 | 中心 y=1000（2行で 889〜1110） | 白い字に黒の縁（箱は敷かない）。文節で2行まで |

- テロップの帯の高さは、**字幕が1行でも2行でも同じ**にしている（行数で動くと目が迷う）
- テロップは帯に収まるいちばん大きな大きさ（100px から2pxずつ下げる）。1行で72px以上に収まらなければ、空白の所で2行に割る
- 帯の下端（869）は右のボタン列（y≥840）に掛かる。テロップの幅が 696 を超えるときは、840 より上に寄せる
- `inset`（札）はテロップと同じ帯を使う。だから札のカットにはテロップを出さない（`build_edit.py` が外す）。
  北マケドニアの回のメニューは「280 Lekë」の行がどのコマでも画面の上の端（UI に隠れる帯）にしか無く、
  寄っても切り方を変えても安全領域に入らなかったので、札にした
- 画面に同時に出るのは、タイトル＋テロップ1つ＋字幕まで

## 顔のぼかし・透かし

- **透かし（PRISM Live）は切り落とす。** 18窓・273コマの「どの場面でも明るい画素」の外枠が
  720×1280 で `[405, 1204, 270, 39]`。その帯より12px上（y=1192）から下を捨て、cover で左右を切る。
  ぼかしや描き埋めと違って跡が残らない。捨てる帯（下の 7%）はどのみち説明文とチャンネル名で隠れる。
  切り落とせない素材には `"mode": "inpaint"`（周りから描き埋める）もある
- **顔は、モザイクにしてからぼかす。** ぼかしだけだと目鼻の位置と肌の色が残り、知っている人には分かる。
  箱の短い辺を `cells` マスにして、マス目が見えなくなるまでぼかす。縁は外側にだけ広げて馴染ませ、角は丸める
- 箱を決めるのは人。`faces.py` は見落としを減らす道具で、指示書の各カットを YuNet に通し、
  「同じ人」の列にまとめ、箱に覆われていない顔を赤で出す。看板・お菓子の箱・タイヤも顔と言うので、
  **絵を見て決める**。決めた箱は動画ごとの帳面（元動画の時刻で書く）に置き、`build_edit.py --blur` で
  どの案のカットにも当てる（同じ店・同じバスを3案が使い回しても、1回決めれば効く）

`--work` に `plan.json`（できあがりの時間割）が残る。人が直す画面や、
ほかの書き出し先は、これを読む。

## 企画から指示書を組む（`tools/shorts/plan/build_edit.py`）

企画の `spec_X.json`（絵コンテの行）＋取り込んだ窓の `index.json`＋声の `lines.json` → `edit_X.json`。

- 1行の長さ ＝ 声の長さ（詰めたもの）＋ 0.25秒 ＋ `hold`。最後の行だけ `--tail`（既定1秒）足す
- 元動画の時刻が2つある行は2カットに分ける。ナレーションが2文なら、1文目が終わった**声の間**で切る
- 「上（全編）: …」がタイトル、「中央: …」がその行のテロップ。演出に「寄る」があれば、そのカットをゆっくり寄せる。
  「順に」があれば、テロップを言葉ごとに、ナレーションでその言葉を言うあたりで足していく
- カットの入りは、spec の時刻を窓の頭からのコマ数に直したもの。窓や `until` を越えるなら前にずらして知らせる

spec に書けないこと（どの画を使うか・どこに寄るか・誰の顔をぼかすか）は overrides と帳面に書く。時刻は元動画の時刻。

```json
{"rows": {"3": {"telop": "", "telop_cuts": [1], "hold": 0.4, "cuts": [
  {"t": "0:48:46.0", "len": 2.0, "until": "0:48:48.0", "inset": {"rect": [175, 15, 530, 140]}, "note": "なぜこの画か"},
  {"t": "0:58:03.0", "until": "0:58:05.4", "zoom": {"to": 1.1, "x": 0.5, "y": 0.75}, "share": 0.5, "audio_db": -14}]}}}
```

| 欄 | 中身 |
| --- | --- |
| `cuts[].t` / `until` | 使い始める時刻と、それより後ろを使ってはいけない時刻（指が映る・場面が変わる） |
| `cuts[].len` / `share` | 長さを秒で固定 / 行の中での割合（全カットに書いたときだけ効く） |
| `telop` / `telop_cuts` | テロップの文字を差し替える（`""` で出さない）/ 出すカットの番号 |

帳面（`--blur`）は `{"regions": [{"from_t", "to_t", "rect" か "keys": [{"t", "rect"}], "cells", "note"}]}`。
箱は元素材（720×1280）の画素。そのカットに掛かる時間のぶんだけ、指示書の `cuts[].blur` に入る。

## 様式（style.json）

全ショートで使い回す。書体は M PLUS Rounded 1c（タイトル ExtraBold、字幕 Black）。
あやとの既存ショートのテロップ（黄色地に黒の太い丸ゴシック・白に黒縁）と
並べて比べて、いちばん近かったもの。

### 安全領域

1080×1920 の画素。3つの重ね合わせで、いちばん厳しい値を取った。

| | YouTube（Google 広告の縦型の安全領域） | TikTok（広告の安全領域の型紙を 1080 に拡大） | あやとの YouTube アプリのスクショで測った値 | 採った値 |
| --- | --- | --- | --- | --- |
| 上 | 288 | 240 | 357（上のタブ「登録チャンネル・ライブ・急上昇」の下端） | **360** |
| 下 | 672 | 660 | 610（「検索」チップの上端） | **672**（y=1248 より下に置かない） |
| 左 | 48 | 120 | 47（縦長の画面では左右が切れる） | **120** |
| 右 | 192 | 120（ボタン列は y=840 から幅 180） | 174（ボタン列の左端。y=995 から下） | 上半分 **120**、y=840 から下 **192** |

YouTube と TikTok の数は、公式の型紙（Google 広告ヘルプ「About video ad specs」の
縦型テンプレート、TikTok 広告ヘルプの In-Feed の型紙）を書き起こした
socialync.io の値（2026-10-15 に読んだ。作業箱から公式ページに直接は届かなかった）。
どちらも**広告**の型紙で、ふつうの投稿の UI とは少し違う。だから実物のスクショでも測った。

字幕の箱は幅 696 まで・中心 y=1000 なので、右のボタン列（x>888）に掛からない。
タイトルは y=380 から（上のタブの下）。
