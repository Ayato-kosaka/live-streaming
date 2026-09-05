#!/usr/bin/env python3
"""どの面から、どの面まで、何タップで着くかを数える。

    python3 tools/sprites/taps.py site/.next-3180

書き出した HTML を全部読んで、面から面への `<a href="/...">` を辺にした図を作り、
全部の組について最短の手数を出す。**「2タップ以内で着く」を文章で言わない。**
1本でも届かない組があれば、その名前を出す。

見ないもの:
  - `/404`。どこからも張られていないので、行き先の側からも外す
  - 外へ出るリンク（YouTube など）。島の中の話ではない
  - `#` から先（同じ面の中の移動はタップに数えない）

**目で見えないリンクは、ここでは見分けられない。** 読み上げにだけ残してある
パンくずのような口も1本と数える。実際に押せるかどうかは
`tools/sprites/hitbox.mjs` で別に測る。
"""
import re
import sys
from collections import deque
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "site/.next-verify")

SKIP = {"_next", "cache", "server", "static"}
pages = {}
for f in root.rglob("*.html"):
    if SKIP & set(f.relative_to(root).parts):
        continue
    p = "/" + str(f.relative_to(root))[:-5]
    if p == "/404":
        continue
    pages[p.replace("/index", "") or "/"] = f

href = re.compile(r'href="(/[^"#]*)')
edges = {}
for p, f in pages.items():
    html = f.read_text(errors="ignore")
    out = set()
    for h in href.findall(html):
        h = h.rstrip("/") or "/"
        if h in pages and h != p:
            out.add(h)
    edges[p] = out

names = sorted(pages)
worst = 0
far = []
unreachable = []
for a in names:
    dist = {a: 0}
    q = deque([a])
    while q:
        v = q.popleft()
        if dist[v] >= 3:
            continue
        for w in edges[v]:
            if w not in dist:
                dist[w] = dist[v] + 1
                q.append(w)
    for b in names:
        if b == a:
            continue
        d = dist.get(b)
        if d is None:
            unreachable.append((a, b))
        else:
            worst = max(worst, d)
            if d > 2:
                far.append((a, b, d))

print(f"面: {len(names)}  組: {len(names) * (len(names) - 1)}")
print(f"いちばん遠い組: {worst} タップ")
print(f"3タップ以上かかる組: {len(far)}")
for a, b, d in far[:40]:
    print(f"  {a} → {b}  {d}")
print(f"たどり着けない組: {len(unreachable)}")
for a, b in unreachable[:40]:
    print(f"  {a} → {b}")

# どの面が、いくつの面へ1タップで行けるか。乗り換え駅がどれかを見る。
top = sorted(((len(v), k) for k, v in edges.items()), reverse=True)[:5]
print("1タップで行ける先が多い面:", ", ".join(f"{k} {n}" for n, k in top))
