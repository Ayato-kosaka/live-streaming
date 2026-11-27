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
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "feedback"))
sys.path.insert(0, str(HERE))
import legs  # noqa: E402

CUTS = {
    "stress": ("critic_viewer.py", '        if r["stress"] >= 1:\n', '        if r["stress"] >= 9:\n', {"stress"}, "ストレス1の行を ✕ にしない"),
    "unknown": ("critic_viewer.py", '        elif r["got"] == "×":\n', '        elif False:\n', {"unknown"}, "分からない（×）の行を見ない"),
    "next_run": ("critic_viewer.py", '        if rows.get(i - 1, {}).get("next") == 0 and rows.get(i, {}).get("next") == 0:\n',
                 "        if False:\n", {"next_run"}, "「次」0 が続くのを見ない"),
    "next_close": ("critic_viewer.py", "    last = lint_mod.closing_index(lines) - 2\n", "    last = len(lines)\n", {"next_run"},
                   "締めの所の「次」0 まで数える"),
    "shape": ("critic_viewer.py", "        if len(f) < 7:\n", "        if False:\n", {"shape"}, "欄の足りない行を崩れに数えない"),
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
    return legs.load(HERE / "critic_viewer.py", "critic_viewer", (c[1], c[2]) if c else None)


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


LEGS = {"clean": leg_clean, "stress": leg_stress, "unknown": leg_unknown, "next_run": leg_next_run, "shape": leg_shape}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
