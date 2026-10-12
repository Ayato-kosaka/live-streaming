# 背景なしの絵を差し替えるときの置き場

`python/admin/characters_plain_swap.py` に渡す透過の PNG を、ここに
`<書類ID>.png` の名前で置く（例: `1a5RFkHtQVQhVENchDxOEWbrQnJpRozM_.png`）。
ARGS の `src` は `python/admin/plain_swap/<書類ID>.png`。

**送って確かめ終わったら、ここから消す。** 消すのは送ったのと同じ PR か、
その直後のコミット。

- 送ったあとは置き場（Cloud Storage）の `full` が正になる。
  ここに写しが残ると、どちらが今の絵か分からなくなる
- 流し直したくなったら、git の履歴から戻せる

ここに置いてよいのは、島に出す絵だけ（リポジトリは公開）。
