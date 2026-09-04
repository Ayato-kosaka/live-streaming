# 島のスプライトを焼く

Kenney の CC0 3Dモデルを、**あつまれ どうぶつの森に寄せた画風**の透過PNGに焼くための
道具です。焼いた結果は `site/public/sprites/` に入っています。
素材そのもの（`models/`）とライブラリ（`vendor/`）はリポジトリに入れていません。

## 何をしているか

- `render.html` … three.js で1枚ずつ描く
  - **輪郭線は付けない。** あつ森には線が無く、形は色の差だけで分かれている
  - 環境光を主役にして影の側も明るく保ち、`MeshLambertMaterial` でなだらかに陰を付ける
  - 足元に**接地影を焼き込む**。これが無いと島に置いたとき物が浮いて見える
  - 色は総取り替えする
    - nature-kit はマテリアルに名前が付いている（`dirt` / `grass` / `stone` …）ので、
      名前ごとに行き先の色を決める（`MATERIALS`）
    - 建物キットは共有テクスチャ（colormap）なので、そのピクセルを色相帯ごとに
      塗り替える（`BANDS`）。建物キットでは
      `green`＝壁 / `blue`＝柱と窓枠 / `neutral`＝屋根 に対応するので、
      屋根の色は `neutral` を上書きして決める
- `manifest.mjs` … 焼くものの一覧。建物はモジュールパーツを組んで1枚にする
- `bake.mjs` … まとめて焼く
- `meta.py` … 焼いた絵を切り詰めて WebP に変換し、島に置くための寸法を
  `site/content/sprites.json` に書く。PNG のままだと島1枚で3MB近くになる
- `lab.mjs` … 試作用。JSON で渡した定義だけを焼いて見比べる
- `og.mjs` … 共有カード(`site/public/og.png`)を島そのものから作り直す
- `shot2.mjs` … 画面の見た目を撮って確かめる

## 焼き直す手順

```bash
cd tools/sprites

# 1. 素材を取ってくる（CC0・商用可・クレジット不要）
mkdir -p models/gltf models/holiday
curl -L -o /tmp/nk.zip   "https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip"
unzip -q /tmp/nk.zip -d /tmp/nk && cp -r "/tmp/nk/Models/GLTF format/." models/gltf/
# holiday-kit / mini-characters / building-kit も同様に kenney.nl から取得して
# models/holiday/ models/ に置く（各 Models/GLB format の中身と Textures/）

# 2. three.js を置く
npm i three playwright-core
cp node_modules/three/build/three.module.js node_modules/three/build/three.core.js vendor/
cp -r node_modules/three/examples/jsm vendor/jsm

# 3. 焼く
python3 -m http.server 8904 &
node bake.mjs ../../site/public/sprites
python3 meta.py
```

## ライセンス

素材はすべて [Kenney](https://kenney.nl) の CC0（パブリックドメイン）です。
クレジットは必須ではありませんが、サイトのフッターに記載しています。
