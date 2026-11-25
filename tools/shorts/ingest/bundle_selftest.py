"""clips の区間の紙を束ねる道具（bundle.py）の見張り。**YouTube にも GitHub にも触らない。**

    python3 tools/shorts/ingest/bundle_selftest.py
    BREAK=split python3 tools/shorts/ingest/bundle_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。
要るのは openssl だけ（plan.py が公開鍵を読む）。書くのは一時フォルダの中だけ。

## 何を見るか

| 足 | 確かめること |
| --- | --- |
| `seg600` | 1区間の上限（plan.py の `CLIPS_MAX_SEC`）を越える区間を、上限以下に割り、すき間も重なりも無く元を覆う |
| `total1800` | 1回ぶんの区間を、合計（`CLIPS_MAX_TOTAL`）・区間の数（`CLIPS_MAX_COUNT`）に収まる依頼に詰め、1つも落とさない |
| `samevideo` | 1つの束（push 1回）に同じ回は1本（#1195。plan.py の置き場 `<id>__clips` が重なると、あとの1本だけが残る） |
| `per8` | 1つの束は `PER_PUSH` 本まで。溢れた分は次の束へ、1本も落とさない |
| `overlap` | 同じ回の区間の重なり・接しているものをつなぐ。離れたものはつながない |
| `shape_id` | 紙の形1 `{"<id>": {"mode":"clips","ranges":[…]}, "note": …}` を読む（note は読み飛ばす） |
| `shape_requests` | 紙の形2 `{"requests":[{"video":…},{"videos":[…]}]}` を読む |
| `verify` | 書く前の検査が plan.py の `items_of` を本当に通す（上限を1秒越えた依頼を断る）・束の中の置き場の重なりを断る |
| `name` | 同じ札で回し直すと同じ名前に同じ中身・同じ名前で中身が違えば書かずに断る。限りは plan.py の物と同じ |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

`CUTS` が bundle.py の字を1か所だけ書き換えた写しを一時フォルダに作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる
（字を直したのに、ここを直し忘れた）。
"""

from __future__ import annotations

import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
COPY = ("bundle.py", "plan.py", "common.py", "gate.py")

# 外す守り: 名前 → (bundle.py の本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, set[str], str]] = {
    "split": ("    n = max(1, math.ceil((e - s) / SEG_MAX))\n", "    n = 1\n",
              {"seg600"}, "長い区間を割らない"),
    "total": ('            if j["total"] + d <= TOTAL_MAX and len(j["ranges"]) < COUNT_MAX:\n',
              "            if True:\n", {"total1800"}, "合計と区間の数を見ずに1つの依頼へ詰める"),
    "same": ("            if vid in used:\n", "            if False:\n",
             {"samevideo"}, "1つの束に同じ回を2本入れる"),
    "per": ("            if len(push) >= PER_PUSH:\n", "            if False:\n",
            {"per8"}, "1つの束の本数を見ない"),
    "merge": ("        if cur is not None and s <= cur[1]:\n", "        if False:\n",
              {"overlap"}, "重なりをつながない"),
    "byid": ("        if isinstance(v, dict) and VIDEO_ID.match(k):\n", "        if False:\n",
             {"shape_id"}, "形1（回の ID が鍵）を読まない"),
    "reqs": ('    reqs = paper["requests"] if "requests" in paper else [paper]\n',
             "    reqs = [paper]\n", {"shape_requests"}, "形2（requests の並び）を読まない"),
    "plan": ("    return plan.items_of(req, origin)\n",
             '    return [{"key": req["videos"][0] + "__clips"}]\n',
             {"verify"}, "書く前に plan.py の検査を通さない"),
    "name": ("                if old is not None and sig(old) != sig(req):\n",
             "                if False:\n", {"name"}, "同じ名前で中身の違う依頼を上書きする"),
}


def pubkey() -> str:
    if os.environ.get("BUNDLE_PEM"):
        return os.environ["BUNDLE_PEM"]
    with tempfile.TemporaryDirectory() as td:
        priv = Path(td) / "k.pem"
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                        "rsa_keygen_bits:2048", "-out", str(priv)], check=True, capture_output=True)
        return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                              capture_output=True, text=True).stdout


def load(dir_: Path):
    sys.path.insert(0, str(dir_))
    return importlib.import_module("bundle")


def run_legs(b, pem: str, work: Path, quiet: bool = True) -> tuple[list[str], int]:
    plan = b.plan
    failed: list[str] = []
    checked = 0

    def leg(name: str, fn) -> None:
        nonlocal checked
        try:
            ok, what = fn()
        except Exception as e:  # noqa: BLE001 — 足の中の失敗は全部「落ちた」
            ok, what = False, f"{type(e).__name__}: {e}"
            if not quiet:
                traceback.print_exc()
        checked += 1
        print(f"  {'○' if ok else '✕'} {name}: {what}")
        if not ok:
            failed.append(name)

    def seg600():
        s, e = 3600.0, 3600.0 + 1300
        ps = b.split_long(s, e)
        cover = ps[0][0] == s and ps[-1][1] == e and all(
            ps[i][1] == ps[i + 1][0] for i in range(len(ps) - 1))
        ok = cover and len(ps) == 3 and all(0 < q - p <= plan.CLIPS_MAX_SEC for p, q in ps)
        one = b.split_long(0.0, float(plan.CLIPS_MAX_SEC))
        return ok and len(one) == 1, f"1300秒 → {[q - p for p, q in ps]}秒・{plan.CLIPS_MAX_SEC}秒ちょうどは割らない"

    def total1800():
        segs = [(i * 1000.0, i * 1000.0 + 500) for i in range(5)]
        jobs = b.pack(segs)
        ok = len(jobs) == 2 and all(sum(e - s for s, e in j) <= plan.CLIPS_MAX_TOTAL for j in jobs)
        ok = ok and sorted(x for j in jobs for x in j) == segs
        tiny = [(i * 20.0, i * 20.0 + 10) for i in range(plan.CLIPS_MAX_COUNT + 10)]
        tj = b.pack(tiny)
        ok = ok and all(len(j) <= plan.CLIPS_MAX_COUNT for j in tj) and sum(map(len, tj)) == len(tiny)
        return ok, (f"500秒×5 → 依頼 {[sum(e - s for s, e in j) for j in jobs]}秒・"
                    f"10秒×{len(tiny)} → {[len(j) for j in tj]}区間")

    def samevideo():
        jobs = [("aGOz5otlEs8", [(0, 1)]), ("aGOz5otlEs8", [(2, 3)]), ("sOvaH0tBzSg", [(0, 1)])]
        ps = b.assign_pushes(jobs)
        ok = all(len({v for v, _ in p}) == len(p) for p in ps)
        ok = ok and [r for p in ps for v, r in p if v == "aGOz5otlEs8"] == [[(0, 1)], [(2, 3)]]
        return ok, f"同じ回2本 + 別の回1本 → 束 {[[v[:4] for v, _ in p] for p in ps]}"

    def per8():
        vids = [f"vid{i:02d}xxxxxx" for i in range(b.PER_PUSH + 2)]
        ps = b.assign_pushes([(v, [(0, 1)]) for v in vids])
        ok = all(len(p) <= b.PER_PUSH for p in ps) and sorted(v for p in ps for v, _ in p) == vids
        return ok and len(ps) == 2, f"{len(vids)}回 → 束 {[len(p) for p in ps]}本（{b.PER_PUSH}本まで）"

    def overlap():
        got = b.merge([(50, 60), (10, 20), (15, 30), (30, 40), (55, 58), (70, 80)])
        return got == [(10, 40), (50, 60), (70, 80)], f"→ {got}"

    def shape_id():
        got = b.read_paper({"aGOz5otlEs8": {"mode": "clips", "ranges": ["1:45:00-1:46:20"]},
                            "sOvaH0tBzSg": {"mode": "clips", "ranges": ["0:40:40-0:45:50"]},
                            "note": "読み飛ばす"}, "形1")
        want = [("aGOz5otlEs8", [(6300.0, 6380.0)]), ("sOvaH0tBzSg", [(2440.0, 2750.0)])]
        return got == want, f"→ {got}"

    def shape_requests():
        got = b.read_paper({"note": "x", "requests": [
            {"mode": "clips", "video": "KjB_aBsTIf0", "ranges": ["0:32:00-0:34:00"]},
            {"mode": "clips", "videos": ["A_cJ9CNM0G8"], "ranges": ["0:55:30-0:58:30"]}]}, "形2")
        want = [("KjB_aBsTIf0", [(1920.0, 2040.0)]), ("A_cJ9CNM0G8", [(3330.0, 3510.0)])]
        return got == want, f"→ {got}"

    def verify():
        long = {"mode": "clips", "videos": ["aGOz5otlEs8"], "pubkey": pem,
                "ranges": [f"0:00:00-{b.fmt(plan.CLIPS_MAX_SEC + 1)}"]}
        ok_req = dict(long, ranges=["0:00:00-0:01:00"])
        try:
            b.verify([[("long.json", long)]])
            caught = False
        except plan.Bad:
            caught = True
        try:
            b.verify([[("a.json", ok_req), ("b.json", dict(ok_req, ranges=["0:02:00-0:03:00"]))]])
            dup = False
        except plan.Bad:
            dup = True
        b.verify([[("a.json", ok_req)]])
        return caught and dup, f"{plan.CLIPS_MAX_SEC + 1}秒の区間を断る={caught}・束の中の同じ回を断る={dup}"

    def name():
        same = (b.SEG_MAX is plan.CLIPS_MAX_SEC and b.TOTAL_MAX is plan.CLIPS_MAX_TOTAL
                and b.COUNT_MAX is plan.CLIPS_MAX_COUNT)
        d = work / "name"
        d.mkdir(exist_ok=True)
        p1, p2 = d / "p1.json", d / "p2.json"
        key = d / "k.pub"
        key.write_text(pem)
        base = {"mode": "clips", "videos": ["aGOz5otlEs8"], "pubkey": pem}
        p1.write_text(json.dumps(dict(base, ranges=["0:10:00-0:11:00"])))
        p2.write_text(json.dumps(dict(base, ranges=["0:20:00-0:21:00"])))
        out = d / "out"
        args = ["--pubkey", str(key), "--out", str(out), "--tag", "t1"]
        with open(os.devnull, "w") as null:
            old, sys.stdout = sys.stdout, null
            try:
                r1 = b.main([str(p1), *args])
                first = (out / "clips-aGOz5otlEs8-t1-p1.json").read_text()
                r2 = b.main([str(p1), *args])
                again = (out / "clips-aGOz5otlEs8-t1-p1.json").read_text() == first
                try:
                    b.main([str(p2), *args])
                    refused = False
                except plan.Bad:
                    refused = True
            finally:
                sys.stdout = old
        written = json.loads(first)
        passes = bool(plan.items_of(written, "written")) and written["ranges"] == ["0:10:00-0:11:00"]
        after = json.loads((out / "clips-aGOz5otlEs8-t1-p1.json").read_text())["ranges"]
        ok = same and r1 == r2 == 0 and again and refused and passes and after == written["ranges"]
        return ok, (f"限りは plan.py の物={same}・回し直しは同じ中身={again}・"
                    f"中身が違えば断る={refused}・書いたものが plan.py を通る={passes}")

    for n, fn in (("seg600", seg600), ("total1800", total1800), ("samevideo", samevideo),
                  ("per8", per8), ("overlap", overlap), ("shape_id", shape_id),
                  ("shape_requests", shape_requests), ("verify", verify), ("name", name)):
        leg(n, fn)
    return failed, checked


def child(name: str) -> int:
    old, new, _, _ = CUTS[name]
    with tempfile.TemporaryDirectory() as td:
        ing = Path(td) / "r" / "tools" / "shorts" / "ingest"
        ing.mkdir(parents=True)
        for f in COPY:
            shutil.copy(HERE / f, ing / f)
        src = (ing / "bundle.py").read_text(encoding="utf-8")
        if src.count(old) != 1:
            print(f"外す字が bundle.py に1つだけ在るのではない（{src.count(old)}個）: {old!r}")
            return 2
        (ing / "bundle.py").write_text(src.replace(old, new), encoding="utf-8")
        work = Path(td) / "work"
        work.mkdir()
        failed, checked = run_legs(load(ing), pubkey(), work)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill(pem: str) -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, want, why) in CUTS.items():
        env = dict(os.environ, BREAK=name, BUNDLE_PEM=pem)
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=120, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    pem = pubkey()
    print("[足] 本物で回す")
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(load(HERE), pem, Path(td), quiet=False)
    print()
    bad = drill(pem)
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        print("\nNG  束ねる道具の見張り 落ちた")
        return 1
    print(f"○ {checked}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    print("\nOK  束ねる道具の見張り 全部通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
