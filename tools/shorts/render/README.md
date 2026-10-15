# ショートの書き出し（編集指示書 → 縦型 mp4）

編集指示書（JSON）1つから、1080×1920・30fps のショートを ffmpeg で書き出す。
同じ指示書からは、同じバイト列が出る（`verify.py --twin` で確かめる）。

```bash
bash tools/shorts/render/fetch_fonts.sh                 # 書体（OFL）を落とす。git には入れない
python3 tools/shorts/render/render.py edit.json --out out.mp4 --work out.work
python3 tools/shorts/render/verify.py out.mp4 out.work  # 形式・カット位置・字幕の出入り・音量差
```

要るもの: ffmpeg（libass/libx264 入り。ubuntu-24.04 の apt の 6.1.1 で確かめた）、
python3 の numpy・Pillow・budoux、仮ナレーションに open_jtalk
（`open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001`）。

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

字幕の文字はナレーションの行の `caption` に入り、カットの長さが変わったら後ろのナレーションを同じだけずらす。

## 編集指示書

`example.edit.json` が見本。

| 欄 | 中身 |
| --- | --- |
| `cuts[].in` / `out` | 元素材の**フレーム番号**（`out` は含まない）。秒で持たない（29.97 と 30 の丸めで1コマずれる） |
| `cuts[].fit` | `cover`（縦いっぱいに拡大して切る。`focus_x` で左右の寄せ）/ `blur`（全体を入れて背景をぼかす） |
| `title.text` | 上のタイトル。`\n` で改行。無ければ文節で折り返す |
| `narration.lines[].at` | できあがりの何フレーム目から話すか |
| `narration.lines[].caption` | 字幕だけ変えたいとき（声はそのまま）。人が直す画面がここに書く |
| `bgm.path` | BGM。ナレーションの間だけ `style.json` の `duck_db` 下がる |

字幕はナレーションの音声の長さから決まる（行ごとに声を作り、その長さだけ出す）。
だから字幕と声は同じフレームで始まる。

`--work` に `plan.json`（できあがりの時間割）が残る。人が直す画面や、
ほかの書き出し先は、これを読む。

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
