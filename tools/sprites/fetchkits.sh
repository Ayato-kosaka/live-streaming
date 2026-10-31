#!/usr/bin/env bash
# 焼くための素材（three と Kenney のキット。どちらも公開・CC0/MIT）を落として、
# manifest.mjs が読む置き場（vendor/ と models/）に並べる。README.md「スプライトを焼く」の手順そのもの。
#
#   bash tools/sprites/fetchkits.sh food-kit [nature-kit holiday-kit building-kit mini-characters]
#
# **作業箱からは kenney.nl に届かない**（プロキシで 000/403）。ふだんは Actions の
# `.github/workflows/bake_sprites.yml` がこれを呼ぶ。届く箱なら手元でもそのまま使える。
#
# ## Textures/ を落とさない
#
# food-kit の glb は色を持たず、`Textures/colormap.png` の1枚を全員で共有している。
# 欠けていても**焼くほうは何も言わずに通り、まっ白な絵が焼ける**（2026-10-17 の人参）。
# だからここで「zip に在ったのに置き場に無い」を見つけたら止める。
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

# 実際に焼いて確かめた版。上げると render.html の読み込みが変わりうる（README）
V="${THREE_VERSION:-0.168.0}"
get() { curl -fsSL --retry 3 --retry-delay 5 --max-time 300 -o "$1" "$2"; }

mkdir -p vendor/jsm/loaders vendor/jsm/utils
get vendor/three.module.js "https://unpkg.com/three@$V/build/three.module.js"
get vendor/jsm/loaders/GLTFLoader.js "https://unpkg.com/three@$V/examples/jsm/loaders/GLTFLoader.js"
get vendor/jsm/utils/BufferGeometryUtils.js "https://unpkg.com/three@$V/examples/jsm/utils/BufferGeometryUtils.js"
echo "three $V: $(wc -c < vendor/three.module.js) バイト"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

for kit in "$@"; do
  # 置き場は manifest.mjs の NK / HK / BK / FK
  case "$kit" in
    nature-kit) fmt="GLTF format"; dest="models/gltf" ;;
    holiday-kit) fmt="GLB format"; dest="models/holiday" ;;
    building-kit | mini-characters) fmt="GLB format"; dest="models" ;;
    food-kit) fmt="GLB format"; dest="models/food" ;;
    *) echo "知らないキット: $kit" >&2; exit 1 ;;
  esac

  # zip の在りかは各ページの中に書いてある。版ごとに URL が変わるので決め打ちしない
  get "$tmp/$kit.html" "https://kenney.nl/assets/$kit"
  zip_url="$(grep -oE "https://[^\"' <>]+\.zip" "$tmp/$kit.html" | head -1 || true)"
  if [ -z "$zip_url" ]; then
    echo "$kit: ページに zip の在りかが無い（kenney.nl の作りが変わった？）" >&2
    exit 1
  fi
  get "$tmp/$kit.zip" "$zip_url"
  # どの版で焼いたかを残す。キットが新しくなると部品の名前が変わる（README）
  echo "$kit: $zip_url（$(wc -c < "$tmp/$kit.zip") バイト）"
  echo "- \`$kit\`: $zip_url" >> "$summary"

  rm -rf "$tmp/$kit"
  unzip -q "$tmp/$kit.zip" -d "$tmp/$kit"
  src="$(find "$tmp/$kit" -type d -name "$fmt" | sort | head -1)"
  if [ -z "$src" ]; then
    echo "$kit: zip に「$fmt」が無い。中身:" >&2
    find "$tmp/$kit" -maxdepth 3 -type d | sed "s|$tmp/$kit/||" >&2
    exit 1
  fi
  mkdir -p "$dest"
  cp -r "$src"/. "$dest"/

  # Textures/ が形式のフォルダの外に置かれている版もある。在るなら一緒に置く
  if [ ! -d "$dest/Textures" ]; then
    tex="$(find "$tmp/$kit" -type d -name Textures | sort | head -1)"
    if [ -n "$tex" ]; then cp -r "$tex" "$dest/Textures"; fi
  fi
  had_tex="$(find "$tmp/$kit" -name 'colormap*.png' | head -1)"
  if [ -n "$had_tex" ] && ! ls "$dest"/Textures/colormap*.png > /dev/null 2>&1; then
    echo "$kit: zip に colormap が在るのに $dest/Textures/ に無い。まっ白に焼ける" >&2
    exit 1
  fi
  n_model="$(find "$dest" -maxdepth 1 -type f \( -name '*.glb' -o -name '*.gltf' \) | wc -l)"
  echo "$kit → $dest: 部品 $n_model 点 / Textures: $(ls "$dest/Textures" 2> /dev/null | tr '\n' ' ')"
done
