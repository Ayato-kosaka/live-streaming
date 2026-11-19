#!/usr/bin/env python3
"""街のガイドの見どころマップと表紙を、画像検索の一覧の大きさ（横 240px）に縮めて1枚に並べる。

    python3 python/guide_thumb.py romania/bucharest --out <scratch>/thumb240.png

**見るのは人の目。** 道具は縮めて並べるだけで、「読めるか」は判定しない（字の画素で測る道具は
`tools/sprites/inkpx.mjs` で、絵に焼いた字には当てていない）。見て、地区名・題・街の名前が
読めなければ `finalize` の札の大きさか置き場を直す（`/city-guide` 2-3・2-4）。

前は手で `python3 -c "…resize((240, …))"` を回していた（`/city-guide` 5章の「無い」）。
街ごとに同じ1行を書き直していたので道具にした（#1292）。

終了コード: 0=並べた / 2=縮める絵が1枚も無い（描いていない・置き場が違う。2 を合格と読まない）
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W = 240


def pictures(key: str, root: Path = ROOT) -> list[tuple[str, Path]]:
    """manifest に載っている見どころマップと表紙（横・縦）の、いちばん大きい版"""
    d = root / "site/public/guide" / key
    m = d / "manifest.json"
    if not m.exists():
        return []
    man = json.loads(m.read_text(encoding="utf-8"))
    out = []
    for slot in ("areamap", "cover", "cover_tall"):
        x = man.get(slot) or {}
        src = x.get("src") or ""
        p = root / "site/public" / src.lstrip("/")
        if src and p.exists():
            out.append((slot, p))
    return out


def sheet(items: list[tuple[str, Path]], out: Path) -> tuple[int, int]:
    from PIL import Image

    tiles = []
    for _, p in items:
        im = Image.open(p).convert("RGB")
        tiles.append(im.resize((W, round(W * im.height / im.width)), Image.LANCZOS))
    gap = 12
    w = sum(t.width for t in tiles) + gap * (len(tiles) + 1)
    h = max(t.height for t in tiles) + gap * 2
    s = Image.new("RGB", (w, h), "white")
    x = gap
    for t in tiles:
        s.paste(t, (x, gap))
        x += t.width + gap
    out.parent.mkdir(parents=True, exist_ok=True)
    s.save(out)
    return s.size


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", help="<国>/<街>（例: romania/bucharest）")
    ap.add_argument("--out", required=True, help="並べた1枚の置き場（PNG）")
    a = ap.parse_args(argv)
    items = pictures(a.key)
    if not items:
        print(f"::error::{a.key} の manifest に、縮める絵（見どころマップ・表紙）が無い")
        return 2
    size = sheet(items, Path(a.out))
    print(f"並べた: {a.out}（{size[0]}x{size[1]}・{'・'.join(s for s, _ in items)}・どれも横 {W}px）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
