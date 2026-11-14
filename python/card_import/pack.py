"""出す（docs/card-import.md 2章の tar）。

```
manifest.json
<sha>.webp     長辺1600（手元の keep をそのまま。scan で EXIF を落として書いてある）
<sha>.t.webp   長辺400
```

**manifest に位置・ファイル名・元のパスを入れない。** 項目は下の `ITEM_KEYS` だけを
この順で書く（足すときは docs 2章を先に直す）。
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import tarfile
import time
from pathlib import Path

from PIL import Image

from .measure import _fit, write_webp
from .store import keep_path

ITEM_KEYS = ["sha", "day", "takenAt", "w", "h", "tw", "th", "category", "score", "group",
             "kind", "ambiguous", "reasons"]
COUNT_KEYS = ["scanned", "notImage", "outOfRange", "exactDup", "broken", "lowQuality",
              "irrelevant", "nearDup", "alreadyCard", "pool", "selected", "calib"]


def manifest(db, root, batch: str, source: str = "takeout") -> dict:
    run = db.execute("SELECT * FROM runs WHERE batch=?", (batch,)).fetchone()
    if run is None:
        raise SystemExit(f"選んだ記録がありません（先に select）: {batch}")
    counts = json.loads(run["counts"])
    items = []
    for r in db.execute("SELECT * FROM picks WHERE batch=? ORDER BY day, taken, sha", (batch,)):
        items.append({"sha": r["sha"], "day": r["day"], "takenAt": r["taken"],
                      "category": r["category"], "score": r["score"], "group": r["grp"],
                      "kind": r["kind"], "ambiguous": bool(r["ambiguous"]),
                      "reasons": json.loads(r["reasons"])})
    # 一覧画で落としたものは picks から消えているので、数え直す
    counts["selected"] = sum(1 for i in items if i["kind"] == "candidate")
    counts["calib"] = sum(1 for i in items if i["kind"] == "calib")
    return {"batch": batch, "source": source,
            "range": {"from": run["range_from"], "to": run["range_to"]},
            "missing": json.loads(run["missing"]),
            "counts": {k: counts.get(k, 0) for k in COUNT_KEYS}, "items": items}


def pack(db, root, cfg, batch: str, out: Path | None = None, source: str = "takeout") -> tuple[Path, dict]:
    root = Path(root)
    m = manifest(db, root, batch, source)
    out = out or root / "out" / f"{batch}.tar"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmpdir = root / "tmp"
    tmpdir.mkdir(exist_ok=True)
    tmp = out.with_suffix(".tar.part")
    items = []
    with tarfile.open(tmp, "w") as tar:
        blobs: list[tuple[str, Path]] = []
        for it in m["items"]:
            src = keep_path(root, it["sha"])
            if not src.exists():
                raise SystemExit(f"手元の絵がありません（prune で消えた？ select からやり直す）: {it['sha'][:12]}")
            with Image.open(src) as im:
                im.load()
                w, h = im.size
                th_path = tmpdir / f"{it['sha']}.t.webp"
                tw, thh = write_webp(_fit(im.convert("RGB"), cfg["read"]["thumbLong"]), th_path,
                                     cfg["read"]["thumbQuality"])
            full = {**it, "w": w, "h": h, "tw": tw, "th": thh}
            items.append({k: full[k] for k in ITEM_KEYS})
            blobs += [(f"{it['sha']}.webp", src), (f"{it['sha']}.t.webp", th_path)]
        m["items"] = items
        raw = json.dumps(m, ensure_ascii=False, indent=1).encode("utf-8")
        ti = tarfile.TarInfo("manifest.json")
        ti.size, ti.mtime = len(raw), int(time.time())
        tar.addfile(ti, io.BytesIO(raw))
        for name, p in blobs:
            ti = tarfile.TarInfo(name)
            ti.size, ti.mtime = p.stat().st_size, int(time.time())
            with p.open("rb") as f:
                tar.addfile(ti, f)
    for _, p in blobs:
        if p.parent == tmpdir:
            p.unlink(missing_ok=True)
    tmp.replace(out)
    return out, m


def upload(path: Path, content_type: str = "application/x-tar", env: str = "CARD_IMPORT_PUT_URL") -> int:
    """署名付き PUT URL へ `curl -T`。**URL は環境変数からだけ読み、出さない・書かない。**

    URL は SSM のコマンドに1本だけ載せる（`CARD_IMPORT_PUT_URL='…' python3 -m card_import.run upload …`）。
    """
    url = os.environ.get(env)
    if not url:
        raise SystemExit(f"{env} がありません（署名付き URL は別の担当の道具が出す）")
    r = subprocess.run(["curl", "-sS", "-f", "-X", "PUT", "-T", str(path), "-H", f"Content-Type: {content_type}",
                        "-o", "/dev/null", "-w", "%{http_code}", url], capture_output=True, text=True)
    code = r.stdout.strip()
    # curl のエラー文には URL が入ることがあるので、そのまま出さない
    print(f"上げた: HTTP {code or '?'}・{path.stat().st_size:,} バイト" if r.returncode == 0
          else f"上げられなかった: curl {r.returncode}・HTTP {code or '?'}")
    return r.returncode
