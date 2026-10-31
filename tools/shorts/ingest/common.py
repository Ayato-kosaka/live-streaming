"""取り込み・解析の各段で共有する小物。

ここに置くのは「同じ判断を2か所でしないための」ものだけ。
時刻の読み書き・動画IDの形・走らせない時間帯（gate.py が読めないときの戻り先）・段ごとの計時。
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import re
import time
import traceback
from pathlib import Path

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

# **時計の枠は、Actions が読めないときの戻り先だけ。** 「Cookie を使い始めてよいか」は
# gate.py が、Cookie を使うワークフローの run が動いているかで決める。毎晩の取り込みは
# cron から数時間遅れ、枠の外（00:05・01:45 UTC）に来た晩もあるので、枠だけでは守れない
# （`python3 python/cron_lag.py`）。読めないあいだは、前と同じ帯（落とすのに長くて10分
# かかるので、よく来る帯の頭より15分手前から）で止めて、危ない側に倒さない。
NO_GO_FROM = (21, 15)
NO_GO_UNTIL = (24, 0)


def in_no_go(now: dt.datetime | None = None) -> bool:
    now = now or dt.datetime.now(dt.timezone.utc)
    m = now.hour * 60 + now.minute
    return NO_GO_FROM[0] * 60 + NO_GO_FROM[1] <= m < NO_GO_UNTIL[0] * 60 + NO_GO_UNTIL[1]


def secs(t: str | int | float) -> float:
    """`0:12:00` も `12:00` も `720` も受ける。"""
    if isinstance(t, (int, float)):
        return float(t)
    t = str(t).strip()
    if ":" not in t:
        return float(t)
    p = [float(x) for x in t.split(":")]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def hms(t: float) -> str:
    t = int(round(t))
    return f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}"


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict], cols: list[str]) -> None:
    """numpy を要らないところ（channel）でも使うので、media ではなくここに置く。"""
    with open(path, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        wr.writeheader()
        for r in rows:
            wr.writerow(r)


def read_json(path: Path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


class Stages:
    """段ごとに「かかった秒・成功/失敗・理由」を控える。

    **1つの段が落ちても次の段へ進む。** 自動字幕が取れなくても絵は作れるし、
    whisper が落ちても音量は出せる。全部か無しかにすると、1か所の失敗で
    1時間ぶんの計算を捨てることになる。

    理由（`error`）は暗号化する側（run.json）にだけ入れる。平文の manifest には
    状態の語（ok / failed / skipped）しか出さない。例外の文面に題名や
    字幕の一部が混ざらないとは言い切れないので。
    """

    def __init__(self):
        self.rows: list[dict] = []

    def run(self, name: str, fn, *a, **kw):
        t0 = time.time()
        row = {"stage": name, "status": "ok"}
        print(f"== {name} …", flush=True)
        try:
            out = fn(*a, **kw)
            if isinstance(out, dict) and out.get("_skip"):
                row["status"] = "skipped"
                row["note"] = out.get("_skip")
            return out
        except Exception as e:  # noqa: BLE001 — 段を止めないための受け
            row["status"] = "failed"
            row["error"] = f"{type(e).__name__}: {e}"[:600]
            row["trace"] = traceback.format_exc()[-2000:]
            return None
        finally:
            row["sec"] = round(time.time() - t0, 1)
            self.rows.append(row)
            # **ログに出すのは段の名前・状態・秒だけ。** 理由は暗号化の中へ。
            print(f"   {name}: {row['status']}  {row['sec']}秒", flush=True)

    def status(self) -> dict:
        return {r["stage"]: r["status"] for r in self.rows}
