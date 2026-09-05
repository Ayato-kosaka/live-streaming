# サムネイルの道具

配信のサムネを作り直すための道具置き場。
何をどう決めたかは [`docs/thumbnail-automation.md`](../../docs/thumbnail-automation.md) に書いてある。

## 準備

```bash
cd tools/thumbs
npm install                      # playwright-core
pip install pillow numpy "opencv-python-headless<5"
```

Chromium は `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` にある。
**OpenCV は 5.0 で Haar カスケードが消えているので、4系を入れること。**

## 中身

| ファイル | 何をする |
| --- | --- |
| `scrape.py` | いま日本で伸びている動画のサムネを集める。型を読むため |
| `refshot.py` | 集めたものを一覧の画像にする |
| `fetch_src.py` | あやとの配信からサムネと自動候補フレームを落とす。黒帯も落とす |
| `facecrop.py` | 縦フレームから顔を切り出す。横サムネの主役にするため |
| `catalog.mjs` | 型のカタログを 1280×720 で描く |

## 使い方

```bash
# 参考にする実物を集める（q.json は検索語の配列）
echo '["海外在住 ライブ配信","ジョージア 生活"]' > q.json
python3 scrape.py q.json
python3 refshot.py ref/index.json ref/sheet.png   # 上位24件を並べる

# あやとの配信から素材を作る
python3 fetch_src.py 5-1bHix5X1s v3L539GafQo
python3 facecrop.py

# カタログを描く
node catalog.mjs        # out/1.jpg 〜 8.jpg
```

## つまずいたところ

- **HTML から画像を描くときは `<meta charset="utf-8">` を必ず入れる。**
  無いと Chromium が latin-1 と誤認して日本語が全部化ける
- **自動候補フレーム（`maxres1〜3.jpg`）は、ほぼ全部が「話しているあやと」。**
  料理の皿も絶景も出てこない。料理回・旅回は配信本体から抜くしかない
- **切り出した顔は暗い。** 明るさ1.28 / コントラスト1.12 / 彩度1.18 くらい上げてちょうどいい
- **このサンドボックスからは配信本体を落とせない**（403 / bot 判定）
