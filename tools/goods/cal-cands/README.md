# カレンダーの絵の候補（選ばなかったものも含む）

月ごとに ChatGPT で3枚ずつ作った候補（7月は2テーマ × 3枚）。面に出しているのは
`../cal-src/` に置いた1枚だけで、ここは**差し替えるときの手元**。

- `<MM>-<a〜f>.webp` … 候補そのもの（1254px の正方形）。MM は暦の月（2025年11月の思い出 → `11`）
- `<MM>-sheet.jpg` … その月の候補を横に並べた見比べ用（7月は上の段が a〜c＝イワシ祭り、下の段が d〜f＝ルーレット）

差し替えかた:

```bash
python3 -c "from PIL import Image; Image.open('tools/goods/cal-cands/12-a.webp').save('tools/goods/cal-src/12-a.png')"
python3 tools/goods/calbake.py
```

面の字（`site/content/goods.ts` の `CAL_MONTHS` の `alt`）は、写っているものが変わったら直す。
