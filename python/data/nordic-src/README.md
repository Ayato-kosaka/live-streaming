# 北欧の見どころの、元データ

`build_nordic.py` がここから `site/content/nordic/*.json`（7本・見どころ161件）を焼く。

## なぜリポジトリに入れたか（2026-09-15）

**それまで `/tmp/nordic.json` と `/tmp/poland_spots.json` にしか無かった。**
箱が消えたら**二度と焼き直せない**状態だった。

ほかの `/tmp` 依存（`world10m.json` などの地図）は `curl` で取り直せる。
**この2本だけは取り直せない。** 元はあやとが用意した北欧ガイドから抜き出したもので、
リポジトリにも本番にも GitHub にも無かった。

焼き込みの洗い直し（`docs/island-misses.md` #104）で見つけて、その場で拾った。

## 使いかた

    python3 python/guide_photos.py nordic   # 見どころの写真を島の置き場（site/public/travel/<国>/photos/）に落とす
    python3 python/build_nordic.py          # 焼く（置き場に無い写真があれば止まる）

（`build_nordic.py` はここを見る。`/tmp` は見ない。`--dry-run` は無い——前ここに書いてあったが、
渡しても黙って焼く）

写真は Commons の URL を直に焼かない。Wikimedia が混んだ日に 429 で断られ、枠が空になる（2026-11-15）。
この箱から Wikimedia が断る日は、`guide_photos.py` を Actions のランナーで回して写真を持ち帰る。

## 手で直さない

`site/content/nordic/*.json` は焼いたもの。直すならここを直して焼き直す。
