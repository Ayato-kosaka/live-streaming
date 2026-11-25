"""担当が書いた clips の区間の紙を束ねて、**plan.py が落とさない**依頼ファイルにする。

    python3 tools/shorts/ingest/bundle.py --pubkey key.pub --out <置き場> 紙1.json 紙2.json …
    python3 tools/shorts/ingest/bundle.py … --tag 20261126b   # 名前の札（既定は UTC の分まで）

push はしない。並べた束（push 1回ぶん）の表と、次に出す束のファイルだけを出す。
出した束を `shorts/requests/` に置いて push するのは担当。

## なぜ（2026-11-25）

依頼を手で束ねて3回落とした。(1) clips の1区間は600秒まで (2) 1つの依頼の合計は1800秒まで
(3) plan.py はその push で変わった依頼ファイルしか読まないので、落ちた依頼は名前を変えないと
読み直されない (4) 同じ回の clips を1回の push で2本頼むと、plan.py の置き場（`<id>__clips`）が
重なってあとの1本だけが残る（#1195）。

## 何をするか

1. 紙を読む。形は3つ: `{"<id>": {"mode":"clips","ranges":[…]}}`・
   `{"requests":[{"mode":"clips","video(s)":…,"ranges":[…]}]}`・plan.py の依頼そのもの
2. 回ごとに区間を全部集め、**重なり・接しているものをつなぐ**（同じ場面を2回取らない）
3. 1区間の上限（plan.py の `CLIPS_MAX_SEC`）を越えるものを、ほぼ同じ長さに割る
4. 回ごとに、合計（`CLIPS_MAX_TOTAL`）と区間の数（`CLIPS_MAX_COUNT`）に収まる依頼に詰める
5. 依頼を push の束に分ける: **1つの束に同じ回は1本**・1つの束に `PER_PUSH` 本まで
6. どの依頼も plan.py の `items_of`（Bad を投げる検査）に通し、束ごとに置き場が重ならないことも
   見てから書く。**1つでも落ちるなら1枚も書かない**

限りの数はここに写さない。plan.py から読む（plan.py が変われば、ここも同じだけ変わる）。
`PER_PUSH` だけはこの道具の決め（main 2026-11-25。plan.py の `MAX_ITEMS` より小さい）。

## 名前

`<prefix>-<回>-<札>-p<束の番号>.json`。札の既定は UTC の分までの時刻なので、回すたびに新しい名前になる
（落ちた依頼を出し直すとき、名前を変え忘れて読まれない、を起こさない）。
同じ名前で中身の違うファイルが `--out` か git の `shorts/requests/` に在れば、書かずに断る。

## 次に出す束

`shorts/requests/` に git で入っている依頼と、回と区間が同じ依頼は「置いてある」と数える。
全部が置いてある束は済み、そうでない最初の束が「次」。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import plan  # noqa: E402
from common import VIDEO_ID, hms, secs  # noqa: E402

Bad = plan.Bad
ROOT = plan.ROOT
SEG_MAX = plan.CLIPS_MAX_SEC
TOTAL_MAX = plan.CLIPS_MAX_TOTAL
COUNT_MAX = plan.CLIPS_MAX_COUNT
PER_PUSH = min(8, plan.MAX_ITEMS)


def fmt(t: float) -> str:
    """秒を `H:MM:SS`（端数があれば `H:MM:SS.s`）に。common.secs で同じ秒に戻る。"""
    if abs(t - round(t)) < 1e-6:
        return hms(t)
    whole = math.floor(t)
    frac = f"{t - whole:.3f}".rstrip("0")[1:]
    return hms(whole) + frac


def ranges_of(raw, origin: str) -> list[tuple[float, float]]:
    if isinstance(raw, str):
        raw = [x for x in re.split(r"\s*[,/]\s*", raw) if x.strip()]
    if not raw:
        raise Bad(f"{origin}: ranges が空")
    out = []
    for r in raw:
        try:
            out.append(plan.parse_range(r))
        except Bad as e:
            raise Bad(f"{origin}: {e}") from None
    return out


def videos_of(req: dict, origin: str) -> list[str]:
    vids = req.get("videos") or ([req["video"]] if req.get("video") else [])
    if isinstance(vids, str):
        vids = [v for v in re.split(r"[,\s]+", vids) if v]
    if not vids:
        raise Bad(f"{origin}: video(s) が空")
    for v in vids:
        if not VIDEO_ID.match(str(v)):
            raise Bad(f"{origin}: 動画IDの形が違う: {v!r}")
    return [str(v) for v in vids]


def clips_req(req: dict, origin: str) -> dict:
    if req.get("mode") != "clips":
        raise Bad(f"{origin}: 束ねるのは clips だけ（来たのは {req.get('mode')!r}）")
    return req


def parse_by_id(paper: dict, origin: str) -> list[tuple[str, list]]:
    """形1: `{"<id>": {"mode":"clips","ranges":[…]}, "note": …}`。"""
    out = []
    for k, v in paper.items():
        if isinstance(v, dict) and VIDEO_ID.match(k):
            req = clips_req(v, f"{origin} の {k}")
            out.append((k, ranges_of(req.get("ranges") or req.get("range"), f"{origin} の {k}")))
    return out


def parse_requests(paper: dict, origin: str) -> list[tuple[str, list]]:
    """形2: `{"requests":[{"mode":"clips","video(s)":…,"ranges":[…]}]}`。形3（依頼そのもの）もここ。"""
    reqs = paper["requests"] if "requests" in paper else [paper]
    out = []
    for i, req in enumerate(reqs):
        o = f"{origin} の requests[{i}]" if "requests" in paper else origin
        req = clips_req(req, o)
        rs = ranges_of(req.get("ranges") or req.get("range"), o)
        out += [(v, rs) for v in videos_of(req, o)]
    return out


def read_paper(paper, origin: str) -> list[tuple[str, list]]:
    """紙1枚 → [(回, [(開始秒, 終了秒)…])…]。形が読めない紙は断る（黙って0件にしない）。"""
    if not isinstance(paper, dict):
        raise Bad(f"{origin}: 紙は JSON の {{…}}")
    if "requests" in paper or "mode" in paper:
        got = parse_requests(paper, origin)
    else:
        got = parse_by_id(paper, origin)
    if not got:
        raise Bad(f"{origin}: clips の区間が1つも読めない（形は README の「束ねる」）")
    return got


def merge(rs: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """重なり・接しているものをつなぐ。開始の順に並ぶ。"""
    out: list[list[float]] = []
    for s, e in sorted(rs):
        cur = out[-1] if out else None
        if cur is not None and s <= cur[1]:
            cur[1] = max(cur[1], e)
        else:
            out.append([s, e])
    return [(s, e) for s, e in out]


def split_long(s: float, e: float) -> list[tuple[float, float]]:
    """1区間の上限を越えるものを、ほぼ同じ長さに割る（端に数秒だけの切れ端を作らない）。"""
    n = max(1, math.ceil((e - s) / SEG_MAX))
    cuts = [s] + [s + round((e - s) * i / n) for i in range(1, n)] + [e]
    return [(cuts[i], cuts[i + 1]) for i in range(n)]


def pack(segs: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    """1回ぶんの区間を、合計と区間の数の上限に収まる依頼に詰める（前から順に、入る最初の依頼へ）。"""
    jobs: list[dict] = []
    for s, e in segs:
        d = e - s
        for j in jobs:
            if j["total"] + d <= TOTAL_MAX and len(j["ranges"]) < COUNT_MAX:
                break
        else:
            j = {"total": 0.0, "ranges": []}
            jobs.append(j)
        j["total"] += d
        j["ranges"].append((s, e))
    return [sorted(j["ranges"]) for j in jobs]


def assign_pushes(jobs: list[tuple[str, list]]) -> list[list[tuple[str, list]]]:
    """依頼を push の束に分ける。1つの束に同じ回は1本・`PER_PUSH` 本まで。
    残りの多い回から先に入れる（束の数が「いちばん多い回の本数」と「全体 ÷ PER_PUSH」の大きいほうで済む）。
    同じ回の依頼どうしは、前に詰めたものから順に出る。"""
    first: dict[str, int] = {}
    for i, (vid, _) in enumerate(jobs):
        first.setdefault(vid, i)
    pending = list(jobs)
    pushes = []
    while pending:
        left = {v: sum(1 for w, _ in pending if w == v) for v in first}
        cand = sorted(range(len(pending)),
                      key=lambda i: (-left[pending[i][0]], first[pending[i][0]], i))
        push: list[tuple[str, list]] = []
        used: set[str] = set()
        took: set[int] = set()
        for i in cand:
            vid = pending[i][0]
            if len(push) >= PER_PUSH:
                break
            if vid in used:
                continue
            push.append(pending[i])
            used.add(vid)
            took.add(i)
        pending = [p for i, p in enumerate(pending) if i not in took]
        pushes.append(push)
    return pushes


def bundle(papers: list[tuple[str, object]]) -> list[list[tuple[str, list]]]:
    """紙の束 → push の束（[[(回, [(開始, 終了)…]), …], …]）。"""
    by_vid: dict[str, list] = {}
    for origin, paper in papers:
        for vid, rs in read_paper(paper, origin):
            by_vid.setdefault(vid, []).extend(rs)
    jobs = []
    for vid, rs in by_vid.items():
        segs = [p for s, e in merge(rs) for p in split_long(s, e)]
        jobs += [(vid, j) for j in pack(segs)]
    return assign_pushes(jobs)


def plan_check(req: dict, origin: str) -> list[dict]:
    return plan.items_of(req, origin)


def verify(files: list[list[tuple[str, dict]]]) -> None:
    """書く前に、plan.py が push のときにする検査を、束ごとにそのまま当てる。"""
    for n, push in enumerate(files, 1):
        keys: list[str] = []
        for name, req in push:
            keys += [it["key"] for it in plan_check(req, name)]
        if len(push) > PER_PUSH:
            raise Bad(f"束 {n}: {len(push)}本（{PER_PUSH}本まで）")
        if len(set(keys)) != len(keys):
            raise Bad(f"束 {n}: 置き場が重なる（同じ回の clips が2本。#1195）: {sorted(keys)}")
        if len(keys) > plan.MAX_ITEMS:
            raise Bad(f"束 {n}: {len(keys)}本（plan.py は {plan.MAX_ITEMS}本まで）")


def to_files(pushes, pem: str, prefix: str, tag: str, note: str) -> list[list[tuple[str, dict]]]:
    out = []
    for n, push in enumerate(pushes, 1):
        out.append([(f"{prefix}-{vid}-{tag}-p{n}.json",
                     {"mode": "clips", "videos": [vid], "ranges": [f"{fmt(s)}-{fmt(e)}" for s, e in rs],
                      "note": note, "pubkey": pem}) for vid, rs in push])
    return out


def sig(req: dict) -> tuple:
    """回と区間（秒）。名前と鍵と note を見ずに「同じ依頼か」を決める。読めなければ空。"""
    try:
        return (tuple(videos_of(req, "")), tuple(ranges_of(req.get("ranges") or req.get("range"), "")))
    except (Bad, AttributeError, TypeError):
        return ()


def tracked_requests() -> dict[str, dict]:
    """git の `shorts/requests/` に入っている依頼（名前 → 中身）。読むだけ。"""
    p = subprocess.run(["git", "-C", str(ROOT), "ls-files", "--", plan.REQ_DIR],
                       capture_output=True, text=True)
    out = {}
    for f in p.stdout.split():
        if not f.endswith(".json"):
            continue
        try:
            out[Path(f).name] = json.loads((ROOT / f).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
    return out


def load_pubkey(arg: str) -> str:
    p = Path(arg)
    text = p.read_text(encoding="utf-8") if p.is_file() else arg
    return plan.norm_pem(text)[0]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="clips の区間の紙を、plan.py が落とさない push の束にする")
    ap.add_argument("papers", nargs="+", help="区間の紙（JSON）")
    ap.add_argument("--pubkey", required=True, help="公開鍵（PEM のファイルか、PEM の字）")
    ap.add_argument("--out", required=True, help="依頼ファイルを書く置き場")
    ap.add_argument("--prefix", default="clips", help="名前の頭（既定 clips）")
    ap.add_argument("--tag", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M"),
                    help="名前の札（既定は UTC の分までの時刻）")
    a = ap.parse_args(argv)

    if not re.match(r"^[A-Za-z0-9._-]+$", a.prefix + a.tag):
        raise Bad("--prefix と --tag は英数字と . _ - だけ")
    pem = load_pubkey(a.pubkey)
    papers = []
    for f in a.papers:
        try:
            papers.append((Path(f).name, json.loads(Path(f).read_text(encoding="utf-8"))))
        except (OSError, ValueError) as e:
            raise Bad(f"{f}: 読めない（{e}）") from None
    note = "bundle.py で束ねた（" + "・".join(n for n, _ in papers) + "）"
    files = to_files(bundle(papers), pem, a.prefix, a.tag, note)
    verify(files)

    out = Path(a.out)
    tracked = tracked_requests()
    for push in files:
        for name, req in push:
            for where, have in (("--out", out / name), ("shorts/requests", None)):
                old = tracked.get(name) if have is None else (
                    json.loads(have.read_text(encoding="utf-8")) if have.is_file() else None)
                if old is not None and sig(old) != sig(req):
                    raise Bad(f"{where} に同じ名前で中身の違う {name} が在る。--tag を変える")
    out.mkdir(parents=True, exist_ok=True)
    for push in files:
        for name, req in push:
            (out / name).write_text(json.dumps(req, ensure_ascii=False, indent=1) + "\n",
                                    encoding="utf-8")

    placed = {sig(r): n for n, r in tracked.items() if sig(r)}
    nxt = None
    print(f"| 束 | 状態 | 本数 | 回 | 秒 |\n| --- | --- | --- | --- | --- |")
    for n, push in enumerate(files, 1):
        done = all(sig(r) in placed for _, r in push)
        if not done and nxt is None:
            nxt = n
        state = "置いてある" if done else ("**次**" if nxt == n else "待ち")
        total = sum(e - s for _, r in push for s, e in ranges_of(r["ranges"], ""))
        print(f"| {n} | {state} | {len(push)} | {' '.join(r['videos'][0] for _, r in push)} | {total:g} |")
    if nxt is None:
        print("\n次に出す束は無い（全部の束と同じ中身が shorts/requests に在る）")
        return 0
    print(f"\n次に出す束 {nxt}（{out}/ に書いた。shorts/requests/ に置いて1回で push する）\n")
    print("| ファイル | 区間 | 秒 |\n| --- | --- | --- |")
    for name, r in files[nxt - 1]:
        rs = ranges_of(r["ranges"], "")
        print(f"| {name} | {len(rs)} | {sum(e - s for s, e in rs):g} |")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! 束ねられない: {e}")
        sys.exit(1)
