"""YouTube の字幕ファイル（json3 / vtt）を、時刻つきの行に読む。

ショートの材料（analyze.py）と、配信の文字起こし（python/stream_text.py）の両方が使う。
**読み方を2か所に持たない。** 片方だけ直して、もう片方が古いまま、になるので。
"""

from __future__ import annotations

import json
import re
from pathlib import Path


def parse_json3(path: Path) -> list[dict]:
    """YouTube の json3。自動字幕は1語ずつの `segs` に時刻のずれ（tOffsetMs）がつく。

    自動字幕は2行で流れるので、表示の長さ（dDurationMs）は次の行と重なる。
    重なりは次の行の頭で切る。改行だけの `aAppend` の行は捨てる。
    """
    d = json.loads(path.read_text(encoding="utf-8"))
    evs = [e for e in d.get("events") or [] if e.get("segs")]
    rows = []
    for e in evs:
        txt = "".join(s.get("utf8", "") for s in e["segs"]).replace("\n", " ").strip()
        if not txt:
            continue
        st = e.get("tStartMs", 0) / 1000
        rows.append({"start": round(st, 2), "end": round(st + e.get("dDurationMs", 0) / 1000, 2),
                     "text": txt,
                     "words": [{"t": round(st + s.get("tOffsetMs", 0) / 1000, 2),
                                "w": s.get("utf8", "")} for s in e["segs"]
                               if s.get("utf8", "").strip()]})
    for a, b in zip(rows, rows[1:]):
        if b["start"] > a["start"]:
            a["end"] = min(a["end"], b["start"])
    return rows


VTT_TIME = re.compile(r"(\d+):(\d\d):(\d\d)\.(\d+)\s+-->\s+(\d+):(\d\d):(\d\d)\.(\d+)")


def parse_vtt(path: Path) -> list[dict]:
    rows, cur, last = [], None, ""
    for line in path.read_text(encoding="utf-8").splitlines():
        m = VTT_TIME.search(line)
        if m:
            g = [int(x) for x in m.groups()]
            cur = {"start": g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000,
                   "end": g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000, "text": ""}
            rows.append(cur)
        elif cur is not None and line.strip():
            t = re.sub(r"<[^>]+>", "", line).strip()
            # 自動字幕の vtt は前の行をもう一度書いてから足すので、同じ行は捨てる
            if t and t != last:
                cur["text"] = (cur["text"] + " " + t).strip()
                last = t
    return [r for r in rows if r["text"]]
