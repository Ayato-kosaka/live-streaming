# 北欧の見どころの、元データ

`build_nordic.py` がここから `site/content/nordic/*.json`（7本・見どころ161件）を焼く。

## なぜリポジトリに入れたか（2026-09-15）

**それまで `/tmp/nordic.json` と `/tmp/poland_spots.json` にしか無かった。**
箱が消えたら**二度と焼き直せない**状態だった。

ほかの `/tmp` 依存（`world10m.json` などの地図）は `curl` で取り直せる。
**この2本だけは取り直せない。** 元はあやとが用意した北欧ガイドから抜き出したもので、
リポジトリにも本番にも GitHub にも無かった。

焼き込みの洗い直し（`docs/island-misses.md` #102）で見つけて、その場で拾った。

## 使いかた

    python3 python/build_nordic.py --dry-run

（`build_nordic.py` はここを見る。`/tmp` は見ない）

## 手で直さない

`site/content/nordic/*.json` は焼いたもの。直すならここを直して焼き直す。
