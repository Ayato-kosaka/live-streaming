"""すでにカードになっている写真（4章の3）。

公開の `GET /island-api/nordic/photos`（`{days: [{day, photos: [{url, …}]}]}`）の写真を落とし、
pHash と CLIP の埋め込みを台帳（`existing`）に置く。一度数えた URL は数え直さない。
"""

from __future__ import annotations

import json
import urllib.request

from .measure import Broken, measure
from .store import pack_vec

UA = {"User-Agent": "card-import/1.0"}


def _get(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def list_photos(api: str) -> list[tuple[str, str]]:
    j = json.loads(_get(api).decode("utf-8"))
    out = []
    for d in j.get("days", []):
        for p in d.get("photos", []):
            if isinstance(p.get("url"), str):
                out.append((p.get("day") or d.get("day"), p["url"]))
    return out


def refresh(db, cfg, embedder, photos: list[tuple[str, str]] | None = None, fetch=_get,
            log=print) -> dict:
    """足りない分だけ数える。`photos` と `fetch` は見張りが差し替える。"""
    if photos is None:
        photos = list_photos(cfg["existing"]["url"])
    have = {r[0] for r in db.execute("SELECT url FROM existing")}
    n_new = n_bad = 0
    for day, url in photos:
        if url in have:
            continue
        try:
            m, img = measure(fetch(url), cfg["read"]["keepLong"], cfg["read"]["maxPixels"])
        except (Broken, OSError) as e:
            n_bad += 1
            log(f"  読めなかった写真 1枚（{type(e).__name__}）")
            continue
        vec, _, _ = embedder.analyze(img)
        db.execute("INSERT OR REPLACE INTO existing VALUES(?,?,?,?)", (url, day, m["phash"], pack_vec(vec)))
        db.commit()
        n_new += 1
    total = db.execute("SELECT COUNT(*) FROM existing").fetchone()[0]
    return {"listed": len(photos), "new": n_new, "unreadable": n_bad, "total": total}
