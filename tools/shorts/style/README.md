# 参考ショートの見た目と音を測る

参考のショートを渡されたら、**台本だけでなく、見た目（書体・大きさ・位置・縁・色・動き）と
音（声と BGM の差）も測ってから作る**（`docs/island-misses.md` #278）。ここはその道具と、
参考1本を測る手順。測った値と「いまの基準」は
`.claude/skills/viral-shorts-creator/references/style_reference.md` に置く。

**参考の実物（mp4・コマ・音）と、そこから作ったもの（並べ画像・連続画像・`grab_*.npy`・
字の見本の JSON）は、リポジトリに入れない。** 他人の動画で、字の見本には台本の字が入る。
全部セッションの作業場所（以下 `<scratch>`）に置き、リポジトリに残すのは数と言葉の説明だけ。

## 道具

| 道具 | 何を測るか | 出力（`--out` の下） |
| --- | --- | --- |
| `bgm_gap.py` | 混ざった1本から「声 − 話している間の BGM」（dB）。こちらの書き出しをどう動かせば同じ差になるか（`match`） | JSON |
| `font_match.py` | 参考の字と候補の書体の、字形の重なり（IoU）の順位 | `font_match.json`・`mask_<id>.png` |
| `font_sheet.py` | 参考の字と候補の字を1字ずつ重ねた並べ画像（どこがはみ出すかを目で見る） | `font_<role>.png` |
| `style_measure.py` | 字の高さ・位置・縁の層と太さ・塗りのグラデ・発光・書体の px と字間 | `style_measure.json` |
| `anim_probe.py` | 字が出る・いる・消えるコマ（元の fps のまま）と連続画像 | `grab_<id>.npy`・`anim_measure.json`・`anim_<id>.png` |
| `anim_curve.py` | 出かたの曲線（倍率・濃さ・くっきり度・位置） | `curve_<id>.json` |
| `bgm_gap_selftest.py` | `bgm_gap.py` の物差しが狂っていないか（下の「見張り」） | — |
| `fonts.txt` | 書体を当てる候補の43本（google/fonts の中の道） | — |

要るのは **numpy・OpenCV・Pillow・ffmpeg だけ**（この箱から huggingface などには届かない）。
各道具の頭に、何を測るか・使い方・出力を書いてある（`python3 <道具> -h` でも出る）。

## 1. 参考を取り込む

この箱から YouTube には届かないので、取り込み（`tools/shorts/ingest/README.md`）の **`clips`** で取る。
参考ショートなら1本まるごとを1区間で頼む（長さは切り上げ。1区間10分まで）。

```json
{"mode": "clips", "videos": ["<動画ID>"], "ranges": ["0:00:00-0:01:01"], "pubkey": "<公開鍵>"}
```

元の縦横・fps・音のまま mp4 になる（2026-10-16 の参考は 2160x3840・60fps・AAC 192k ステレオ）。
鍵の作りかた・依頼の置きかた・開きかたは取り込みの README のとおり。

```bash
git fetch origin <作業枝> && git merge --ff-only FETCH_HEAD
python3 tools/shorts/ingest/decrypt.py --key <scratch>/keys/priv.pem --out <scratch>/ref shorts/.work/<動画ID>/clips
# → <scratch>/ref/<動画ID>/clips/01_0-00-00_0-01-01.mp4
```

**開いたら、作業枝からは下ろす**（暗号文でも数百MB ある。作業枝に置きっぱなしにしない）。

```bash
git rm -r -q shorts/.work/<動画ID>/clips && git commit -m "参考の取り込みを開いたので下ろす" && git push
```

## 2. 音を測る（声と BGM の差）

いちばん速く（4K 61秒で5秒）、いちばん効くので先に回す。

```bash
python3 tools/shorts/style/bgm_gap.py measure <scratch>/ref/<id>/clips/01_….mp4 --out <scratch>/style_<id>/audio_ref.json
```

読みどころ:

- `blind.main.D_speech_db` … 声 − 話している間の BGM（125〜5000Hz・K 特性）。**これを合わせる**
- `blind.lo` / `blind.hi` … 帯ごと。`hi`（2.5〜5kHz）は誤差が大きい（平均 +3.2dB）ので目安だけ
- `blind.speech_ratio` … 話している割合。高い（0.9 以上）とダッキングの有無はそもそも聞こえない
- `side_vs_mid_db` … −30 を下回ると BGM がほぼモノラルで、この方法では測れない（道具が止まる）
- `loudness` … 全体の LUFS・トゥルーピーク

こちらの書き出しをどう動かせば同じ差になるかは、`tools/shorts/render/render.py` が残す作業の置き場
（`stem_*.f32`・`bgm_norm.wav`・`plan.json`）に向けて `match` を回す。`--bias` は分け方の誤差
（2026-10-16 の照合: 125〜5000Hz −0.20 / 125〜1500Hz −0.67 / 2500〜5000Hz +3.24）。

```bash
python3 tools/shorts/style/bgm_gap.py match <render の work> --target <scratch>/style_<id>/audio_ref.json \
  --bias -0.2 --bias-lo -0.67 --bias-hi 3.24 --out <scratch>/style_<id>/audio_match.json
```

`rows[]` に案ごとの `bgm_rms_dbfs`・`duck_db`・`duck_hi_db` と、作り直した束での本当の差が出る。
分け方を変えたときは、`validate`（こちらの書き出しの本物の束と突き合わせる）と
`synth --chain`（BGM を別の曲に差し替えて符号化を3回通す）で誤差を測り直し、`--bias` を直す。

## 3. コマを抜いて、字の見本を書く

字が出ている秒のコマを、**元の画素のまま** PNG で抜く（`-ss` を `-i` の前に置くと、その秒のコマになる）。

```bash
ffmpeg -v error -ss 2.50 -i <mp4> -frames:v 1 <scratch>/style_<id>/frames/f_2.50.png
```

どの秒に何が出ているかは、まず 0.5秒刻みくらいで何枚か抜いて目で見る。役割（題の札・字幕・
大きい字…）ごとに見本を1〜3行選び、SPEC.json に書く（`<scratch>/style_<id>/font_spec.json`）。

```json
{"samples": [
  {"id": "c_1", "role": "c", "frame": "frames/f_2.50.png", "box": [420, 1840, 1720, 2000],
   "text": "<その行の字>", "edge": "dark", "fill": "white", "layers": ["dark"]}
]}
```

- `frame` は相対なら SPEC.json の置き場から読む。`box` はそのコマの中で行を囲む矩形（元の画素）
- `edge` は字を囲む縁の色、`fill` は字の塗りの色。名前は `font_match.py` の `classes`:
  `dark`（ほぼ黒）・`black`（黒め）・`white`・`notwhite`・`light`（明るく色の薄い）・`yellow`・`red`・
  `darkred`・`pink`
- `layers` は塗りから外へ向かう縁の色の順（赤い縁の外に黒い縁なら `["red", "dark"]`）
- 取り出しがうまくいかないときは `min_area`（小さい点を捨てる面積）・`close`（塗りの穴を閉じる画素）

## 4. 書体を当てる

候補を `fonts.txt` から落とす（google/fonts。`-g` は道の `[` `]` をそのまま送るため）。

```bash
mkdir -p <scratch>/fonts
grep -v '^#' tools/shorts/style/fonts.txt | while read -r p; do
  curl -fsSL -g -o "<scratch>/fonts/${p##*/}" "https://raw.githubusercontent.com/google/fonts/main/$p"
done
python3 tools/shorts/style/font_match.py <scratch>/style_<id>/font_spec.json --fonts <scratch>/fonts --out <scratch>/style_<id>/fm
python3 tools/shorts/style/font_sheet.py <scratch>/style_<id>/font_spec.json <scratch>/style_<id>/fm/font_match.json \
  --fonts <scratch>/fonts --out <scratch>/style_<id>/fm --top 3
```

- 数（字ごとの IoU `char_iou`・行の IoU `line_iou`）で上位を出し、**並べ画像を目で見て決める。**
  差が 0.01 も無い2本は数では決められない（2026-10-16 は M PLUS Rounded 1c Black 0.761 と
  LINE Seed JP ExtraBold 0.762。行の IoU と見た目で M PLUS にした）
- 0.80 前後なら同じ系統、0.70 前後は「近い」まで。**本物の書体の名前は分からない**ことが多い
  （有料・配布元に届かない書体を使っていることがある）
- 書き出しで使う書体は `tools/shorts/render/fetch_fonts.sh` が落とす。そこに無い書体を使うなら、そちらに足す

## 5. 大きさ・位置・縁・色を測る

決めた書体を役割ごとに `--pick` で渡すと、塗りの高さが参考と同じになる font px と字間まで出る。

```bash
python3 tools/shorts/style/style_measure.py <scratch>/style_<id>/font_spec.json --out <scratch>/style_<id>/sm \
  --fonts <scratch>/fonts --pick c=MPLUSRounded1c-Black.ttf --pick d4=KaiseiTokumin-ExtraBold.ttf
```

読みどころ（`style_measure.json`。px はどれも 1080 幅に直した値）: `font_px_1080`・`tracking_em`・
`center_y_1080`（行の塗りの中心）・`outline_layers[].width_px_1080`（縁の太さ）・
`fill_rgb_by_height_top_to_bottom`（塗りのグラデ。上から10段）・`glow`（発光の色と半径）。
同じ役割の見本が2〜3行あれば、平均を取って丸める。

## 6. 動きを測る

出かた・消えかたは EVENTS.json に区間を書いて抜く（`<scratch>/style_<id>/anim_events.json`）。

```json
{"band": [1000, 2500], "scale": 0.5,
 "events": [{"id": "c1_in", "role": "c", "t0": 1.95, "t1": 2.6, "fill": "white", "edge": "dark",
             "roi": [300, 1800, 1900, 2060], "view": [200, 1750, 1960, 2100], "strip": {"first": 0, "count": 15}}]}
```

```bash
python3 tools/shorts/style/anim_probe.py grab    <mp4> <scratch>/style_<id>/anim_events.json --out <scratch>/style_<id>/anim
python3 tools/shorts/style/anim_probe.py measure <scratch>/style_<id>/anim_events.json --out <scratch>/style_<id>/anim
python3 tools/shorts/style/anim_probe.py strip   <scratch>/style_<id>/anim_events.json --out <scratch>/style_<id>/anim
# 拡大・ふわっと出るものだけ、落ち着いたコマ（N）を型にして曲線を測る（区間をまたぐなら --grabs）
python3 tools/shorts/style/anim_curve.py <scratch>/style_<id>/anim_events.json --out <scratch>/style_<id>/anim \
  --id d4_in --grabs d4_out --ref-frame 862 --from 824 --to 862
```

- まず `strip` の連続画像を見て、カット（1コマで出る・消える）か、動いて出るかを分ける。
  2026-10-16 の参考はほぼ全部カットだった。カットのものに曲線は要らない
- 揺れは `anim_measure.json` の `cx` `cy` の標準偏差と最大（コマごとに跳ねているか）
- コマ番号は**動画の頭を 0 とした元の fps の番号**。30fps の書き出しに写すときは `fps / 30` で割って間引く
- `grab_<id>.npy` は 4K を 0.5倍で持っても1区間 300MB ほどになる。測り終えたら消す

## 7. style.json のどこへ写すか

書き出しの様式は `tools/shorts/render/style.json`（座標は 1080x1920）。測った値の写し先:

| 測った値 | style.json | メモ |
| --- | --- | --- |
| 字幕の書体 | `fonts.caption`（ファイル名） | |
| 字幕の `font_px_1080` | `caption.size` | |
| 字幕の `center_y_1080` | `caption.center_y` | 書き出しの `center_y` は**字の箱（書体の上下の余白込み）の中心**。塗りの中心と数px ずれるので、下の 8 で測り直して合わせる |
| 字幕の縁 `width_px_1080`・色 | `caption.stroke`・`caption.stroke_color` | Pillow の縁は塗りの外へ太るので、測った幅をそのまま入れる |
| 字幕の塗りの色 | `caption.color` | |
| 字幕の行の送り | `caption.line_gap` | 書き出しは「書体の行の高さ＋line_gap」で積む。M PLUS Rounded 1c Black の 48px は行の高さ 68px なので、送り 51.5px なら −16.5 |
| 大きい字の px・塗り・縁 | `telop.size`・`telop.color`・`telop.stroke`・`telop.stroke_color` | 書き出しの強調の字は1種しか持てない。役割ごとの見た目（グラデ・発光・2重の縁・揺れ）は書き出し側の対応が要る |
| 拡大して出る曲線（30fps に間引いた倍率） | `telop.pop` | カットで出るなら `[1.0]` |
| 題の札 | `title.*` | 書き出しの題は「箱に字」の形。参考の形（箱なし・縁2層・グラデ・発光）には書き出し側の対応が要る |
| `match` の案の `bgm_rms_dbfs`・`duck_db`・`duck_hi_db` | `audio.*` | |

## 8. 合わせたら、こちらを同じ道具で測る

**同じ物差しで並べるまで「合わせた」と言わない。** 書き出した mp4 から同じ秒のコマを抜いて
`style_measure.py` を回し、`bgm_gap.py measure` を回して、参考の値と並べる
（こちらは本物の束もあるので、音は `bgm_gap.py truth <work>` と分けて測った値の両方が出せる）。

## 見張り

`bgm_gap_selftest.py` は、numpy で作った声らしい音と BGM らしい音を既知の差（8 / 13.5 / 19dB）で混ぜ、
`bgm_gap.py` で測った差が ±1.5dB に入るかを見る（数秒）。分け方を壊した物差しで外れることも
対照として毎回見る（作った音が易しすぎて、壊れても緑のまま、にしない）。

numpy が要るので、全部の PR で走る Selftests（`python/selftest_runner.py`）では理由つきで外し、
`tools/shorts/` を触った PR で走る `.github/workflows/shorts_selftest.yml` が名指しで回す。
手元では `python3 tools/shorts/style/bgm_gap_selftest.py`。
守っている実物を壊して赤くなるかは `python3 python/mutation_drill.py tools/shorts/style/bgm_gap_selftest.py`。

字の道具（`font_match.py` ほか）には見張りが無い。どれも並べ画像・連続画像を人が見て決める前提の
道具で、数の正しさは見本の取り出しかた（色の分類と箱）に左右されるため。
