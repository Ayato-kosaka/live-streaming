"""YouTube の字幕ファイル（json3 / vtt）を、時刻つきの行に読む。

ショートの材料（analyze.py・字幕だけの道の quick_captions.py）と、
配信の文字起こし（python/stream_text.py）が使う。
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


END_MARKS = ("。", "！", "？", "!", "?")
# 1語の中の句点の直後で切る（句点は前に残す）
SENT_SPLIT = re.compile(r"(?<=[。！？!?])")
PUNCT = "。、！？!?,."


def lines(rows: list[dict], gap: float = 1.2, max_chars: int = 40) -> list[tuple[float, str]]:
    """字幕の行を、読む用の「1行1文」に刻み直す。（言い始めの秒, 文）の並び。

    自動字幕の1行（json3 の event）は画面に出す1行で、文の途中で切れて次の行へ続く。
    原稿の区間を決めるときに読みたいのは「何秒から何を言ったか」なので、**語の時刻で**
    つなぎ直して切る。自動字幕には句読点がほとんど無いので、切るのは
    句点・語と語の頭のあいだが `gap` 秒を越えたとき（息つぎ）・`max_chars` 字に届いたとき。
    語の時刻が無い字幕（vtt）は1行をそのまま1つの語として扱う。

    いまの ja の自動字幕には句点が付く（VusdZVyjgjQ の 3時間55分で「。」2,357・「?」252）。
    ただし語の時刻を持たない長い1語（130字近く）で来る行もあるので、**1語の中の句点でも切る**
    （切った後ろは同じ秒）。息つぎのあとに句点だけが来たら、前の文の尻に付ける。
    """
    words: list[tuple[float, str]] = []
    for r in rows:
        ws = r.get("words") or []
        pairs = [(w["t"], w["w"]) for w in ws] if ws else (
            [(r["start"], r["text"])] if r.get("text") else [])
        for t, w in pairs:
            words += [(t, piece) for piece in SENT_SPLIT.split(w) if piece]
    out: list[tuple[float, str]] = []
    cur, t0, prev = "", None, None
    for t, w in words:
        w = re.sub(r"\s+", " ", w)
        if w.strip() and not w.strip().strip(PUNCT):
            # 句読点だけの語は、息つぎのあとに来ても今の文（無ければ前の文）の尻に付ける。
            # 「。」1字の行を作らない
            p = w.strip()
            if cur.strip():
                cur += p
                if p.endswith(END_MARKS):
                    out.append((t0, cur.strip()))
                    cur, t0 = "", None
            elif out and not out[-1][1].endswith(END_MARKS):
                out[-1] = (out[-1][0], out[-1][1] + p)
            prev = t
            continue
        if cur.strip() and ((prev is not None and t - prev > gap) or len(cur.strip()) >= max_chars):
            out.append((t0, cur.strip()))
            cur, t0 = "", None
        if t0 is None:
            t0 = t
        cur += w
        prev = t
        if w.strip().endswith(END_MARKS):
            out.append((t0, cur.strip()))
            cur, t0 = "", None
    if cur.strip():
        out.append((t0, cur.strip()))
    return [(t, s) for t, s in out if s]
