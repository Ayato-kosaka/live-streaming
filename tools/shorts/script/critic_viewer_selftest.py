"""**視聴者役の返事の数えかた（`critic_viewer.py`）の見張り。** 要るのは Python だけ。

    python3 tools/shorts/script/critic_viewer_selftest.py
    BREAK=stress python3 tools/shorts/script/critic_viewer_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。台は `tools/shorts/feedback/legs.py`。

| 足 | 確かめること |
| --- | --- |
| `clean` | ストレス 0・次 2 の返事は通る |
| `stress` | ストレス 1 の行は ✕（帳面 F-070「初見で意味が分かる」） |
| `unknown` | 分かったが × の行は、ストレス 0 でも ✕ |
| `next_run` | 2行目から締めの2行前までに「次」0 が2行続けば ✕。1行だけ・締めの所なら出さない（F-070「続きが気になる」） |
| `shape` | 欄が足りない・ストレスが数でない行は、形の崩れとして数える（黙って読み飛ばさない） |
| `gate` | 本編集の1枚の関所（`gate`。帳面 F-100）: `--keep` で置いた返事なら通る。返事が無い・頭に指紋が無い・返事のあとで原稿を直した・ストレス1の行が残る・行が欠ける、のどれでも止まる |
| `wire` | `brief.py edit` は、原稿の隣に返事が無ければ1枚を作らずに終了コード 2（関所の名前は `brief.py` の GATES の `viewer_pass`） |
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "feedback"))
sys.path.insert(0, str(HERE))
import legs  # noqa: E402
import contextlib  # noqa: E402
import io  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402

CUTS = {
    # 関所（gate）も同じ judge で数えるので、ストレスを見なければ gate の「ストレス1の行が残る返事は止まる」も落ちる
    "stress": ("critic_viewer.py", '        if r["stress"] >= 1:\n', '        if r["stress"] >= 9:\n', {"stress", "gate"}, "ストレス1の行を ✕ にしない"),
    "unknown": ("critic_viewer.py", '        elif r["got"] == "×":\n', '        elif False:\n', {"unknown"}, "分からない（×）の行を見ない"),
    "next_run": ("critic_viewer.py", '        if rows.get(i - 1, {}).get("next") == 0 and rows.get(i, {}).get("next") == 0:\n',
                 "        if False:\n", {"next_run"}, "「次」0 が続くのを見ない"),
    "next_close": ("critic_viewer.py", "    last = lint_mod.closing_index(lines) - 2\n", "    last = len(lines)\n", {"next_run"},
                   "締めの所の「次」0 まで数える"),
    "shape": ("critic_viewer.py", "        if len(f) < 7:\n", "        if False:\n", {"shape"}, "欄の足りない行を崩れに数えない"),
    # 本編集の1枚の関所（帳面 F-100）
    "gate_none": ("critic_viewer.py", "    if not p.is_file():\n        raise ValueError", "    if False:\n        raise ValueError", {"gate", "wire"},
                  "返事が無くても、本編集の1枚を作らせる（読めずに OSError で落ちる。brief.py edit も訳を言えずに落ちる）"),
    "gate_head": ("critic_viewer.py", "    if not head.startswith(KEEP_HEAD):\n", "    if False:\n", {"gate"}, "指紋の無い（手で写した）返事を数える"),
    "gate_sha": ("critic_viewer.py", "    if head[len(KEEP_HEAD):].strip() != script_sha(lines):\n", "    if False:\n", {"gate"},
                 "返事のあとで直した原稿を通す"),
    "gate_fail": ("critic_viewer.py", '    if res["fail"]:\n        raise ValueError', '    if False:\n        raise ValueError', {"gate"},
                  "ストレス1以上の行が残る返事を通す"),
    "gate_rows": ("critic_viewer.py", "    if bad:\n        raise ValueError", "    if False:\n        raise ValueError", {"gate"},
                  "行の欠けた返事を通す"),
    "wire": ("brief.py", "            viewer_mod.gate(sc, Path(a.viewer) if a.viewer else None)", "            pass", {"wire"},
             "brief.py edit が関所を呼ばない"),
}

LINES = ["題", "2行目", "3行目", "4行目", "5行目", "6行目", "みんなは、どう思う？"]


def reply(over=None):
    over = over or {}
    out = []
    for i in range(1, len(LINES) + 1):
        got, s, nx = over.get(i, ("○", 0, 2))
        out.append(f"{i}|話|訳|{got}|問い|{s}|{nx}||")
    out.append("全体|4|ふつう")
    return "\n".join(out)


def setup(cut):
    c = CUTS[cut] if cut else None
    V = legs.load(HERE / "critic_viewer.py", "critic_viewer", (c[1], c[2]) if c and c[0] == "critic_viewer.py" else None)
    # brief.py は読み込んだ critic_viewer（外した字の写し）を sys.modules から引く
    V.brief = legs.load(HERE / "brief.py", "brief", (c[1], c[2]) if c and c[0] == "brief.py" else None)
    return V


def run(V, text):
    rows, whole, bad = V.parse(text)
    return V.judge(rows, LINES, whole), bad


def leg_clean(V):
    res, bad = run(V, reply())
    return [("ストレス 0・次 2 の返事は ✕ 0", not res["fail"] and not bad)]


def leg_stress(V):
    res, _ = run(V, reply({3: ("○", 1, 2)}))
    return [("3行目のストレス 1 を ✕", [x[0] for x in res["fail"]] == [3])]


def leg_unknown(V):
    res, _ = run(V, reply({4: ("×", 0, 2)}))
    return [("4行目の × を ✕（ストレス 0 でも）", [x[0] for x in res["fail"]] == [4])]


def leg_next_run(V):
    two, _ = run(V, reply({3: ("○", 0, 0), 4: ("○", 0, 0)}))
    one, _ = run(V, reply({3: ("○", 0, 0)}))
    end, _ = run(V, reply({6: ("○", 0, 0), 7: ("○", 0, 0)}))
    return [("3・4行目の「次」0 を ✕（4行目）", [x[0] for x in two["fail"]] == [4]),
            ("1行だけの「次」0 は出さない", not one["fail"]),
            ("締めの所（6・7行目）の「次」0 は出さない", not end["fail"])]


def leg_shape(V):
    _, _, bad = V.parse("1|話|訳|○\n2|話|訳|○|問い|たくさん|2||")
    return [(f"欄の足りない行と、数でないストレスを崩れに数える（{len(bad)}）", len(bad) == 2)]


def _stops(fn) -> str:
    """fn() が ValueError で止まれば、その訳。止まらなければ空。ほかの例外は訳にしない（関所が止めたことにしない）。"""
    try:
        fn()
    except ValueError as e:
        return str(e) or "止まった"
    except Exception:  # noqa: BLE001
        return ""
    return ""


def leg_gate(V):
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        sc = d / "script_A.txt"
        sc.write_text("\n".join(LINES) + "\n", encoding="utf-8")
        good = d / "reply_good.txt"
        good.write_text(reply(), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            r = subprocess.run([sys.executable, str(HERE / "critic_viewer.py"), str(good), str(sc), "--keep"],
                               capture_output=True, text=True, timeout=60, check=False)
        kept = V.kept_path(sc)
        out = [(f"--keep で原稿の隣に {kept.name} を置く（終了コード {r.returncode}）", r.returncode == 0 and kept.is_file()
                and kept.name == "viewer_A.txt")]
        out.append(("置いた返事で関所を通る", not _stops(lambda: V.gate(sc)) and _no_raise(lambda: V.gate(sc))))
        nofile = d / "script.txt"
        nofile.write_text("\n".join(LINES) + "\n", encoding="utf-8")
        out.append(("返事が無ければ止まる", "無い" in _stops(lambda: V.gate(nofile))))
        bare = d / "bare.txt"
        bare.write_text(reply(), encoding="utf-8")
        out.append(("頭に指紋の無い返事（手で写した）は止まる", "指紋" in _stops(lambda: V.gate(sc, bare))))
        stressed = d / "stressed.txt"
        stressed.write_text(f"{V.KEEP_HEAD}{V.script_sha(LINES)}\n" + reply({3: ("○", 1, 2)}), encoding="utf-8")
        out.append(("ストレス1の行が残る返事は止まる", "3行目" in _stops(lambda: V.gate(sc, stressed))))
        short = d / "short.txt"
        short.write_text(f"{V.KEEP_HEAD}{V.script_sha(LINES)}\n" + "\n".join(reply().splitlines()[:-2]), encoding="utf-8")
        out.append(("行の欠けた返事は止まる", "返事に無い行" in _stops(lambda: V.gate(sc, short))))
        sc.write_text("\n".join(LINES[:-1] + ["みんなは、行ってみたい？"]) + "\n", encoding="utf-8")
        out.append(("返事のあとで原稿を直したら止まる", "前の原稿" in _stops(lambda: V.gate(sc))))
    return out


def _no_raise(fn) -> bool:
    try:
        fn()
    except Exception:  # noqa: BLE001
        return False
    return True


def leg_wire(V):
    B = V.brief
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / "script.txt").write_text("\n".join(LINES) + "\n", encoding="utf-8")
        saved, argv = B.build_edit_brief, sys.argv
        B.build_edit_brief = lambda *a, **k: "1枚"
        sys.argv = ["brief.py", "edit", "--episode", str(d)]
        err = io.StringIO()
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
                rc = B.main()
        finally:
            B.build_edit_brief, sys.argv = saved, argv
    return [(f"返事の無い原稿では本編集の1枚を作らない（終了コード {rc}）", rc == 2 and "視聴者役の返事" in err.getvalue()),
            ("関所の名前が brief.py の GATES に在る", "viewer_pass" in B.GATES)]


LEGS = {"clean": leg_clean, "stress": leg_stress, "unknown": leg_unknown, "next_run": leg_next_run, "shape": leg_shape,
        "gate": leg_gate, "wire": leg_wire}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
