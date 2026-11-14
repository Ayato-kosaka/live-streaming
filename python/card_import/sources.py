"""写真の源。**展開せずに**1枚ずつ渡す。

源は `entries()` で `Entry` を順に返すものなら何でもよい。いまあるのは2つ:

- `TakeoutZip` … Google フォトの書き出し（Takeout）の zip 1本。2GB ずつに割れて届く
- `Folder`     … 手元のフォルダ（Takeout 以外の源の差し替え口。見張りも使う）

**zip は展開しない。** EC2 のディスクは空きが 6.8GB しか無く、2GB の zip を
広げると倍になる。`zipfile` でメンバーを1つずつ読む。

### Takeout の横の JSON

写真ごとに `<名前>.json`（新しい書き出しでは `<名前>.supplemental-metadata.json`）が付き、
`photoTakenTime`（UTC の秒）と `geoData` を持つ。厄介なところが3つある:

1. **名前が51字で切られる**（`IMG_….JPG.supplemental-metad.json`）。
   前から一致で引く（`scan.py` の `_sidecar_for`）
2. **重複の番号の位置が違う**。写真が `IMG_1(1).JPG` なら JSON は `IMG_1.JPG(1).json`
3. **写真と JSON が別の zip に入ることがある**（割れ目をまたぐ）。だから JSON は
   SQLite（`sidecars`）にためて、選ぶときにも引き直す
"""

from __future__ import annotations

import json
import os
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".tif", ".tiff", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".3gp", ".avi", ".mkv", ".webm", ".mts", ".m2ts", ".wmv", ".mpg", ".mpeg"}

_SUPP = "supplemental-metadata"


@dataclass
class Entry:
    member: str          # 源の中での名前（台帳の鍵。手元の SQLite にだけ置く）
    kind: str            # image / video / json / other
    size: int
    read: Callable[[], bytes]

    @property
    def dir(self) -> str:
        return os.path.dirname(self.member)

    @property
    def name(self) -> str:
        return os.path.basename(self.member)


def kind_of(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    if ext == ".json":
        return "json"
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return "other"


def sidecar_media_name(json_name: str) -> str | None:
    """横の JSON の名前から、対応する写真の名前（切れていれば前の部分）を出す。"""
    if not json_name.lower().endswith(".json"):
        return None
    base = json_name[:-5]
    num = ""
    m = re.search(r"\(\d+\)$", base)
    if m:
        num, base = m.group(0), base[: m.start()]
    # `.supplemental-metadata` とその切れ端を外す
    head, dot, tail = base.rpartition(".")
    if dot and tail and _SUPP.startswith(tail) and "." in head:
        base = head
    if num:
        stem, ext = os.path.splitext(base)
        base = f"{stem}{num}{ext}"
    return base or None


def parse_sidecar(raw: bytes) -> dict | None:
    """`photoTakenTime` と `geoData` だけを取り出す。"""
    try:
        j = json.loads(raw.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(j, dict) or "photoTakenTime" not in j:
        return None
    try:
        ts = int(j["photoTakenTime"]["timestamp"])
    except Exception:  # noqa: BLE001
        ts = None
    lat = lng = None
    for key in ("geoData", "geoDataExif"):
        g = j.get(key) or {}
        try:
            la, lo = float(g.get("latitude", 0)), float(g.get("longitude", 0))
        except Exception:  # noqa: BLE001
            continue
        if la or lo:
            lat, lng = la, lo
            break
    return {"ts": ts, "lat": lat, "lng": lng, "title": j.get("title")}


class TakeoutZip:
    kind = "takeout"

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.name = self.path.name
        self.size = self.path.stat().st_size

    def entries(self) -> Iterator[Entry]:
        with zipfile.ZipFile(self.path) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                yield Entry(info.filename, kind_of(info.filename), info.file_size,
                            (lambda i=info: z.read(i)))


class Folder:
    """手元のフォルダ。下を全部たどる。並びは名前順で固定（再開しても同じ順）。"""
    kind = "folder"

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.name = self.path.name
        self.size = 0

    def entries(self) -> Iterator[Entry]:
        for p in sorted(self.path.rglob("*")):
            if p.is_file():
                rel = p.relative_to(self.path).as_posix()
                yield Entry(rel, kind_of(p.name), p.stat().st_size, (lambda q=p: q.read_bytes()))


def open_source(path: str) -> TakeoutZip | Folder:
    p = Path(path)
    if p.is_dir():
        return Folder(p)
    return TakeoutZip(p)
