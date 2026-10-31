"""**トークンと時間の数え役（`tally.py`）の見張り。** 要るのは Python だけ（本物の記録は読まない。こしらえた記録で回す）。

    python3 tools/shorts/cost/tally_selftest.py
    BREAK=dedupe python3 tools/shorts/cost/tally_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。

数え役が狂うと、「半分にした」が数の上で嘘になる（#1011。前と後を同じ物差しで並べるための道具）。
読み違えやすい所が5つあるので、1つずつ足にした。

| 足 | 確かめること |
| --- | --- |
| `dedupe` | 1回の呼び出しが記録で3行（思考・本文・道具）に分かれていても、1回に数える。入力は3倍にならない |
| `long_prefix` | 道具の入力が行の頭に長く付いた呼び出しの行（`"type":"assistant"` が3000字より後ろ）も拾う |
| `notes` | 担当の終わりの数（`subagent_tokens`）を表示のトークンにし、最後の呼び出しの本当の出力を出す |
| `idle` | 新しい頼みの前の長いあいだ（待っていた時間）は足さず、1回の長い思考（次の行が呼び出し）は足す |
| `stage` | 説明の字から段を決める（批評役を原稿より先に見る） |
| `calibrate` | 出力 = 0.3×署名 + 0.7×見える字 でこしらえた3人から、係数を合わせ直せる |
| `runs` | `critic.py` の控え（1回1行）を、表示のトークン＝入力＋キャッシュ＋出力の担当として読む |
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "feedback"))
import legs  # noqa: E402

CUTS = {
    "dedupe": ("tally.py", '            mid = msg.get("id")\n', '            mid = (msg.get("id") or "") + str(id(d))\n',
               {"dedupe"}, "呼び出しを message.id でまとめない"),
    "long_prefix": ("tally.py", "            is_call = '\"type\":\"assistant\"' in line\n",
                    "            is_call = '\"type\":\"assistant\"' in line[:3000]\n", {"long_prefix"}, "行の頭だけを見る"),
    "idle": ("tally.py", "                    if gap > 0 and not (prompt and gap > IDLE):\n", "                    if gap > 0:\n",
             {"idle"}, "待っていた時間まで足す"),
    "notes": ("tally.py", '        if n and n[0] == "completed" and 0 < n[1] - calls[-1].prompt < 128000:\n', "        if False:\n",
              {"notes"}, "担当の終わりの数を読まない"),
    "stage": ("tally.py", '    ("批評", re.compile(r"critic|批評|関所|gate", re.I)),\n', "", {"stage"}, "批評役の段を見ない"),
    "calib": ("tally.py", "    a = (sxz * syy - syz * sxy) / det\n", "    a = 0.0\n", {"calibrate"}, "署名の係数を合わせない"),
}


def setup(cut):
    c = CUTS[cut] if cut else None
    return legs.load(HERE / "tally.py", "tally", (c[1], c[2]) if c else None)


def dumps(d) -> str:
    """Claude Code の記録と同じ、空白の無い JSON（数え役は `"type":"assistant"` の字で行を探す）。"""
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def ts(sec: int) -> str:
    return f"2026-10-21T10:{sec // 60:02d}:{sec % 60:02d}.000Z"


def call_lines(mid, sec, prompt, blocks, prefix=""):
    """1回の呼び出しを、中身の塊ごとの行にする（どの行も同じ usage）。"""
    out = []
    for b in blocks:
        head = {"wireToolInputs": {"t": {"command": prefix}}} if prefix else {}
        d = {**head, "type": "assistant", "timestamp": ts(sec),
             "message": {"id": mid, "model": "claude-opus-5-5", "content": [b],
                         "usage": {"input_tokens": 2, "cache_read_input_tokens": prompt - 2, "cache_creation_input_tokens": 0,
                                   "output_tokens": 8}}}
        out.append(dumps(d))
    return out


def user(sec, text=None, tool=False, meta=False):
    content = [{"type": "tool_result", "tool_use_id": "t1", "content": "結果"}] if tool else text
    d = {"type": "user", "timestamp": ts(sec), "message": {"role": "user", "content": content}}
    if meta:
        d["isMeta"] = True
    return dumps(d)


def build(root: Path):
    """セッション1つ: 本体（担当の終わりの知らせ入り）と、担当2人（A: ふつう、B: 頭の長い行と待ち時間）。"""
    sid = "11111111-2222-3333-4444-555555555555"
    sub = root / sid / "subagents"
    sub.mkdir(parents=True)
    a = [user(0, "批評して"),
         *call_lines("msg_a1", 3, 10000, [{"type": "thinking", "thinking": "", "signature": "s" * 3000},
                                           {"type": "text", "text": "読む"},
                                           {"type": "tool_use", "name": "Read", "input": {"p": "x"}}]),
         user(5, tool=True),
         *call_lines("msg_a2", 9, 12000, [{"type": "text", "text": "ok"}])]
    (sub / "agent-aaaa.jsonl").write_text("\n".join(a) + "\n", encoding="utf-8")
    (sub / "agent-aaaa.meta.json").write_text(json.dumps({"description": "Fresh critic: test A", "agentType": "x"}), encoding="utf-8")
    b = [user(0, "直して"),
         *call_lines("msg_b1", 2, 20000, [{"type": "tool_use", "name": "Bash", "input": {"c": "y"}}]),
         user(4, tool=True),
         *call_lines("msg_b2", 64, 21000, [{"type": "tool_use", "name": "Bash", "input": {"c": "z"}}], prefix="x" * 4000),
         user(66, tool=True),
         user(66 + 1200, "続きをお願い", meta=True),
         *call_lines("msg_b3", 66 + 1205, 22000, [{"type": "text", "text": "done"}])]
    (sub / "agent-bbbb.jsonl").write_text("\n".join(b) + "\n", encoding="utf-8")
    (sub / "agent-bbbb.meta.json").write_text(json.dumps({"description": "Editor-in-chief for metro short script"}), encoding="utf-8")
    note = ("<task-notification>\n<task-id>aaaa</task-id>\n<status>completed</status>\n<summary>x</summary>\n"
            "<usage><subagent_tokens>13000</subagent_tokens><tool_uses>1</tool_uses><duration_ms>9000</duration_ms></usage>\n"
            "</task-notification>")
    main = [user(0, "はじめ"), dumps({"type": "user", "timestamp": ts(10), "message": {"role": "user", "content": note}})]
    sess = root / f"{sid}.jsonl"
    sess.write_text("\n".join(main) + "\n", encoding="utf-8")
    return sess


class Ctx:
    def __init__(self, T):
        self.T = T
        self.td = tempfile.TemporaryDirectory(prefix="tally-selftest-")
        self.sess = build(Path(self.td.name))
        self.agents = {a.id: a for a in T.load(self.sess, main=False)}


def leg_dedupe(c):
    a = c.agents["aaaa"]
    return [("担当 A は呼び出し2回（記録は4行）", len(a.calls) == 2),
            ("入力＋キャッシュは 10000＋12000（3倍にならない）", a.total("inp") + a.total("cr") + a.total("cw") == 22000)]


def leg_long_prefix(c):
    b = c.agents["bbbb"]
    return [("頭に4000字の道具の入力が付いた行も呼び出しに数える（3回）", len(b.calls) == 3)]


def leg_notes(c):
    a = c.agents["aaaa"]
    return [("表示のトークンは担当の終わりの数（13000）", a.last_ctx == 13000),
            ("最後の呼び出しの本当の出力は 13000 − 12000 = 1000", a.out_true_last == 1000)]


def leg_idle(c):
    b = c.agents["bbbb"]
    return [("待っていた20分は足さず、60秒の生成は足す（動いていた秒 ≈ 71）", 60 <= b.active <= 80)]


def leg_stage(c):
    T = c.T
    return [("Fresh critic → 批評", T.stage_of("Fresh critic 3: France draft A") == "批評"),
            ("Gate (a)-(i) critic → 批評（原稿より先）", T.stage_of("Gate (a)-(i) critic: France A r12") == "批評"),
            ("Editor-in-chief for … script → 原稿", T.stage_of("Editor-in-chief for metro short script") == "原稿"),
            ("Fix caption … → 書き出し", T.stage_of("Fix caption mid-word line breaks") == "書き出し"),
            ("当たらなければ その他", T.stage_of("Fetch viewer stickies") == "その他")]


def leg_calibrate(c):
    T = c.T
    pts = []
    for sig, vis in ((10000, 1000), (50000, 3000), (200000, 6000)):
        ag = T.Agent("x", "x", "批評", [T.Call("m", sig=sig, vis=vis)])
        ag.out_true_last = round(0.3 * sig + 0.7 * vis)
        pts.append(ag)
    a, b, n, err = T.calibrate(pts)
    return [("3人から a≈0.3・b≈0.7 に合う", abs(a - 0.3) < 0.01 and abs(b - 0.7) < 0.05 and n == 3)]


def leg_runs(c):
    T = c.T
    p = Path(c.td.name) / "runs.jsonl"
    p.write_text(json.dumps({"id": "statue", "label": "新しい批評役", "start": ts(0), "end": ts(60), "model": "m",
                             "usage": {"input_tokens": 5, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 12000,
                                       "output_tokens": 5000}, "duration_ms": 60000, "duration_api_ms": 55000},
                            ensure_ascii=False) + "\n", encoding="utf-8")
    r = T.load_runs(p)
    return [("1回を1人として読む", len(r) == 1 and r[0].stage == T.CLI),
            ("表示のトークン＝入力＋キャッシュ＋出力（17005）", r and r[0].last_ctx == 17005),
            ("時間は控えの duration_ms（60秒）", r and r[0].seconds == 60)]


LEGS = {"dedupe": leg_dedupe, "long_prefix": leg_long_prefix, "notes": leg_notes, "idle": leg_idle, "stage": leg_stage,
        "calibrate": leg_calibrate, "runs": leg_runs}


def _setup(cut):
    return Ctx(setup(cut))


if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, _setup))
