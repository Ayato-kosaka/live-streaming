# 島のスプライトを焼く

Kenney の CC0 3Dモデルを、**あやとのキャラ絵と同じ画風**（太い黒線＋フラット塗り）の
透過PNGに焼くための道具です。焼いた結果は `site/public/sprites/` に入っています。
素材そのもの（`models/`）とライブラリ（`vendor/`）はリポジトリに入れていません。

## 何をしているか

- `render.html` … three.js で1枚ずつ描く
  - `MeshToonMaterial` ＋ 3段グラデーションで陰影を面で割る（フラット塗り）
  - 頂点を法線方向へ押し出した黒い裏面シェルで輪郭線を付ける。押し出し量は
    カメラの表示範囲から決めるので、**大きい物でも小さい物でも線の太さが画面上で揃う**
  - テクスチャを持たないモデル（nature-kit）は、マテリアル色を色相帯ごとに
    置き換えて島の配色にする（`PALETTE_RULES`）
- `manifest.mjs` … 焼くものの一覧。建物はモジュールパーツを組んで1枚にする
- `bake.mjs` … まとめて焼く

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
```

## ライセンス

素材はすべて [Kenney](https://kenney.nl) の CC0（パブリックドメイン）です。
クレジットは必須ではありませんが、サイトのフッターに記載しています。
