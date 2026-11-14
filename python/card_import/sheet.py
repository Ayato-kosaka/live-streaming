"""あいまいなものだけ、番号付きの一覧画で1回で見る（4章の5）。

- `sheet` … `ambiguous` の候補を 5×4（1枚 256px）の一覧画にする。EC2 の `<root>/sheets/` に置く。
  作業箱へは `ec2.py get` で持ってくる（絵は SSM の標準出力に載せない）
- `judge` … 番号 → 残す / 落とす を書き戻す。その回の候補（`picks`）をその場で直し、
  次に選び直したときにも効くよう `decisions` にも残す

番号と sha の対応は SQLite（`sheets`）にだけ置く。一覧画の字は番号だけ。
"""

from __future__ import annotations

import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .store import keep_path


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # 古い Pillow
        return ImageFont.load_default()


def sheet(db, root, batch: str, cols: int = 5, rows: int = 4, tile: int = 256) -> list[Path]:
    root = Path(root)
    shas = [r["sha"] for r in db.execute(
        "SELECT sha FROM picks WHERE batch=? AND ambiguous=1 ORDER BY day, taken, sha", (batch,))]
    db.execute("DELETE FROM sheets WHERE batch=?", (batch,))
    out: list[Path] = []
    per = cols * rows
    font = _font(40)
    for page in range((len(shas) + per - 1) // per):
        canvas = Image.new("RGB", (cols * tile, rows * tile), (24, 24, 24))
        d = ImageDraw.Draw(canvas)
        for i, sha in enumerate(shas[page * per:(page + 1) * per]):
            num = page * per + i + 1
            db.execute("INSERT INTO sheets VALUES(?,?,?)", (batch, num, sha))
            x, y = (i % cols) * tile, (i // cols) * tile
            with Image.open(keep_path(root, sha)) as im:
                im = im.convert("RGB")
                im.thumbnail((tile - 6, tile - 6))
                canvas.paste(im, (x + (tile - im.width) // 2, y + (tile - im.height) // 2))
            d.rectangle([x + 4, y + 4, x + 70, y + 50], fill=(0, 0, 0))
            d.text((x + 10, y + 6), str(num), fill=(255, 230, 80), font=font)
        p = root / "sheets" / f"{batch}-{page + 1}.jpg"
        p.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(p, "JPEG", quality=85)
        out.append(p)
    db.commit()
    return out


def judge(db, batch: str, marks: dict[int, str]) -> dict:
    """`marks` は {番号: "keep" | "drop"}。"""
    got = {"keep": 0, "drop": 0, "unknown": 0}
    for num, what in sorted(marks.items()):
        r = db.execute("SELECT sha FROM sheets WHERE batch=? AND num=?", (batch, num)).fetchone()
        if r is None or what not in ("keep", "drop"):
            got["unknown"] += 1
            continue
        sha = r["sha"]
        db.execute("INSERT OR REPLACE INTO decisions VALUES(?,?,?)", (sha, what, time.time()))
        if what == "drop":
            db.execute("DELETE FROM picks WHERE batch=? AND sha=?", (batch, sha))
        else:
            db.execute("UPDATE picks SET ambiguous=0 WHERE batch=? AND sha=?", (batch, sha))
        got[what] += 1
    db.commit()
    return got


def parse_marks(args: list[str]) -> dict[int, str]:
    """`3=drop 5=keep` か `--drop 1,2 --keep 3` の形（`run.py judge`）。k/d の1字でもよい。"""
    out: dict[int, str] = {}
    mode = None
    for a in args:
        if a in ("--drop", "--keep"):
            mode = a[2:]
            continue
        if "=" in a:
            n, v = a.split("=", 1)
            out[int(n)] = {"k": "keep", "d": "drop"}.get(v, v)
        elif mode:
            for n in a.split(","):
                if n.strip():
                    out[int(n)] = mode
    return out
