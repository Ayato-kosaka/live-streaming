"""spec の元動画の時刻の書きかたと、復号した材料（clips・zoom・archive のシート）の読みかた。

hook.py・build_edit.py・storyboard.py が同じ読みかたをするために、1か所に置く。前は道具ごとに読みかたが違い、
ほかの回の秒を書いた行で hook.py が落ち、build_edit.py は読めず、担当が行を外した spec の写しや、
zoom から組んだ archive の写しを作って回していた（2026-11-04 の絵コンテ5件）。

## 元動画の時刻の書きかた（spec の `src`・`still`、overrides の `cuts[].t`）

| 書きかた | 意味 |
| --- | --- |
| `0:53:10` / `0:53:10.5–0:53:13` | この回（`--material` の回・指示書の `--video`）の秒。区間の線は – — - ~ 〜 のどれでも |
| `kunXt2sXnFQ 0:17:23.5–0:17:26` | **ほかの回の秒**。頭に videoId（11字）と空白。絵コンテの `still` は `kunXt2sXnFQ@0:17:24.5` も同じ |
| `27:46:40.0–27:46:42.9` | **地図の行**（`tools/shorts/hookmap` の刺し素材）。配信の時間軸の外の秒（`MAP_T` から） |
"""
from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path

# 配信の時間軸の外の秒。tools/shorts/hookmap/hookmap.py の T_BASE と同じ値（配信は10時間まで。100000秒 = 27:46:40）。
# 地図の素材の窓はここから始まる。hook_selftest.py が hookmap.py の字と突き合わせる
MAP_T = 100000.0
# 頭の videoId（11字）と、空白か @。時刻（0:53:10 など）は「:」を含むので、ここに当たらない
_REF = re.compile(r"^\s*([A-Za-z0-9_-]{11})(?:\s+|@)\s*(\S.*)$")
_DASH = re.compile(r"\s*[–—\-~〜]\s*")
# シートの余白（tools/shorts/ingest/media.py の SHEET_GAP・SHEET_HEAD。make_sheets と同じ並び）
GAP, HEAD = 4, 30


def split_ref(s: str) -> tuple[str | None, str]:
    """'kunXt2sXnFQ 0:17:23–0:17:26' →（'kunXt2sXnFQ', '0:17:23–0:17:26'）。回の名前が無ければ（None, そのまま）"""
    m = _REF.match(s or "")
    return (m.group(1), m.group(2).strip()) if m else (None, (s or "").strip())


def ref(video: str | None, t: str) -> str:
    """split_ref の逆。回の名前が無ければ時刻だけ"""
    return f"{video} {t}" if video else t


def sec(s: str) -> float:
    """'0:53:10' / '1:09:43.5' / '53:10' / 'kunXt2sXnFQ 0:17:23.5' → 秒（回の名前は読み飛ばす）"""
    p = [float(x) for x in split_ref(s)[1].split(":")]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def span(s: str) -> tuple[str | None, float, float | None]:
    """spec の元動画の時刻 →（回の名前か None, 始まり, 終わりか None）。'0:51:00' のような点は終わりが None"""
    video, rest = split_ref(s)
    parts = _DASH.split(rest)
    if len(parts) == 2 and parts[1]:
        return video, sec(parts[0]), sec(parts[1])
    return video, sec(parts[0]), None


def is_map(t: float) -> bool:
    """地図の行の秒か（配信の画ではない）"""
    return t >= MAP_T - 1e-6


def index_video(path: Path, d: dict) -> str | None:
    """取り込んだ窓の一覧（clips の index.json）がどの回のものか。取り込みは index.json に `video` を書く。
    地図の素材（hookmap.py の index.json）には無いので None"""
    v = d.get("video") if isinstance(d, dict) else None
    if v:
        return str(v)
    meta = path.parent / "meta.json"
    if meta.exists():
        try:
            return json.loads(meta.read_text()).get("id") or None
        except (OSError, ValueError):
            return None
    return None


def dims(d: Path, base: Path) -> tuple[int, int] | None:
    """その置き場のコマの縦横（元の配信の幅・高さ）。置き場の meta.json、無ければ同じ回のほかの置き場の meta.json"""
    for m in [d / "meta.json", base / "clips" / "meta.json", base / "archive" / "meta.json",
              *sorted(base.glob("zoom-*/meta.json"))]:
        if m.exists():
            try:
                j = json.loads(m.read_text())
            except (OSError, ValueError):
                continue
            if j.get("width") and j.get("height"):
                return int(j["width"]), int(j["height"])
    return None


def grid_of(sheet, n: int, vw: int, vh: int) -> tuple[int, int, int, int]:
    """シートの寸法から、列の数・1コマの幅と高さ・帯の高さを割り出す。

    zoom は 1x1・2x2・4x3・5x4、アーカイブは 5x4、窓の見る用のシートは 6x5（横長は入れ替え）と、置き場ごとに並びが
    違う。決め打ちすると、1x1 のシートで隣のコマにずれる（frame_at.py の 2x2 決め打ちがそれだった）。
    最後の1枚は埋まった段までで切ってある（media.make_sheets）ので、段の数はコマの数から出す。"""
    best = None
    for cols in range(1, 9):
        tw = (sheet.width - (cols + 1) * GAP) // cols
        if tw <= 0 or cols * tw + (cols + 1) * GAP != sheet.width:
            continue
        rows = math.ceil(n / cols)
        est = tw * vh / vw
        for th in range(int(est) - 6, int(est) + 7):
            lab = max(20, int(round(th * 0.07)))
            err = abs(HEAD + rows * (th + lab) + (rows + 1) * GAP - sheet.height)
            if best is None or err < best[0]:
                best = (err, cols, tw, th, lab)
    if best is None:
        raise ValueError(f"シートの並びが割り出せない: {sheet.size}")
    return best[1:]


def sheet_rows(d: Path) -> list[dict]:
    """置き場の sheets.csv の行（from / to / frames / file …）。見出しだけ・無いときは空"""
    p = d / "sheets.csv"
    if not p.exists():
        return []
    with open(p, newline="") as f:
        return [r for r in csv.DictReader(f) if r.get("file") and r.get("frames")]


def row_times(r: dict) -> list[float]:
    """sheets.csv の1行（1枚のシート）の、コマごとの配信の秒"""
    a, b, n = float(r["from"]), float(r["to"]), int(r["frames"])
    step = (b - a) / (n - 1) if n > 1 else 0.0
    return [a + k * step for k in range(n)]


def cell(sheet, k: int, n: int, vw: int, vh: int):
    """シートの k 番目のコマ（帯を除いた画）"""
    cols, tw, th, lab = grid_of(sheet, n, vw, vh)
    r, c = divmod(k, cols)
    x, y = GAP + c * (tw + GAP), HEAD + GAP + r * (th + lab + GAP)
    return sheet.crop((x, y, x + tw, y + th))
