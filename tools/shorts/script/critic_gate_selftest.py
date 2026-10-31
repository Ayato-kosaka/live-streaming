"""**関所の合否を数える道具（`critic_gate.py`）の見張り。** 要るのは Python だけ（批評役は回さない）。

    python3 tools/shorts/script/critic_gate_selftest.py
    BREAK=jump python3 tools/shorts/script/critic_gate_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。

`critic_gate.py` は、批評役の JSON の数（跳ぶ行・取消・捨てた問い・帳面の ID・点）から合否を決める。
ここが緩むと、批評役が正しく見つけた跳びや取消を、関所が黙って通す。逆に厳しすぎると、
【あやと】の行（あやとが書いた字）で落とし、あやとの決めたものを替える直しを作文者に回すことになる（`script_writing.md` 7.3）。

| 足 | 確かめること |
| --- | --- |
| `shape` | 決まりの形の JSON は通り、鍵が無い・enum に無い字・決まりに無い鍵は崩れとして出す |
| `count` | つなぎの数が原稿の行数と違えば、崩れとして出す |
| `jump` | 跳の行を ✕。最後の行がアーカイブの1行なら、その行の跳は数えない |
| `question` | 答えない問い・答える前に移る問いを ✕。終わりの問い（アーカイブの前の問いも）は数えない |
| `cancel` | 取消の2回目・印なし・理由なし・2行を消す・すぐ戻す、をそれぞれ ✕。印と理由のある1回は通す。動は数えない |
| `outsider` | 画に居ない人（視聴者のコメントなど）の言葉を持ち出した行を ✕。範囲の外の行は崩れ（2026-10-23 から。前の「印の無い人の話」は外した） |
| `alone` | その行だけで意味が通らない行（`alone` の `ok` が false）を ✕（理由つき）。最後のアーカイブの1行は数えない。【あやと】の行は △。抜けた行・2回ある行は崩れ。題の札（行 0）は飛ばす |
| `checked` | 約束のカードの ID が `checked` に1つでも無ければ ✕（欠けた ID を名指す）。`ledger` に挙げた ID は当てたに数える。帳面の外の約束 X2 も帳面の ID と同じに扱う |
| `numbers` | 前の声に無い数を ✕ |
| `ledger` | 帳面にある ID は ✕、帳面に無い ID は △ |
| `scores` | 2 以下は ✕、3 は △、4 は何も出さない |
| `ayato` | 【あやと】の行（spec の why が「あやとの題」など）に当たった ✕ は △ にする（まとめ役が裁く） |
| `as_of` | 城塞 p1 の承認（2026-10-21:6306110329）で読み直すと、あとでできた F-037（09:28）の ✕ は △。前からある F-008 は ✕ のまま。as_of 無しなら F-037 も ✕ |
| `i_side` | (h) の F-039・F-040 は、同じ行に (i)(j)(k) の当たりがあれば ✕、無ければ △（批評役自身の見かたでは渡れている） |
| `cli` | 終了コード: 通る 0・落ちる 1・形が違う 2 |
| `focaccia` | フォカッチャの下書き（あやと「台本の品質が悪い」#1014）は、添削の時点（2026-10-23:6354242835）の決まりでも、批評役が何も挙げなくても lint の T-READ（1行目）・L-NEXT（21行目）で落ちる。あやとの添削版は同じ時点で lint の ✕ 0（日付だけにすると夕方の規則まで当たる）。批評役の (h) F-047 は ✕ |
"""
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
sys.path.insert(0, str(HERE.parent / "feedback"))
import legs  # noqa: E402

CUTS = {
    "shape_required": ("critic_gate.py", "            if k not in d:\n", "            if False:\n", {"shape"}, "必須の鍵を見ない"),
    "shape_enum": ("critic_gate.py", '        if "enum" in schema and d not in schema["enum"]:\n', "        if False:\n",
                   {"shape"}, "enum に無い字を通す"),
    "count": ("critic_gate.py", "    if len(tsu) != n:\n", "    if False:\n", {"count"}, "つなぎの数を見ない"),
    "jump": ("critic_gate.py", '        if t == "跳":\n', "        if False:\n", {"jump"}, "跳の行を数えない"),
    "archive_last": ("critic_gate.py", "        if i_side and last_archive and line == n:\n            return\n", "",
                     {"jump", "alone"}, "アーカイブの1行の (i)(j) まで数える"),
    "q_none": ("critic_gate.py", "        if not ans or not in_range(ans) or ans <= ln:\n", "        if False:\n",
               {"question"}, "答えない問いを通す"),
    "q_moved": ("critic_gate.py", '        elif q.get("moved"):\n', "        elif False:\n", {"question"}, "答える前に移る問いを通す"),
    "final_ask": ("critic_gate.py", "        if final_ask:\n            continue\n", "", {"question"}, "終わりの問いまで答えを求める"),
    "cancel_count": ("critic_gate.py", "        if k >= 1:\n", "        if False:\n", {"cancel"}, "取消の2回目を通す"),
    "cancel_mark": ("critic_gate.py", '        if not (t.get("mark") or "").strip():\n', "        if False:\n", {"cancel"}, "印の無い取消を通す"),
    "cancel_reason": ("critic_gate.py", '        if not t.get("reason"):\n', "        if False:\n", {"cancel"}, "理由の無い取消を通す"),
    "cancel_erases": ("critic_gate.py", '        if len(t.get("erases") or []) >= 2:\n', "        if False:\n", {"cancel"}, "積んだ結論の取消を通す"),
    "cancel_back": ("critic_gate.py", '        if t.get("back"):\n', "        if False:\n", {"cancel"}, "すぐ戻す取消を通す"),
    "outsider": ("critic_gate.py", '        if in_range(h.get("line")):\n', "        if False:\n",
                 {"outsider", "i_side"}, "画に居ない人の言葉を通す（i_side は (k) の当たりを F-039 の印に使う）"),
    "alone": ("critic_gate.py", '        if not alone[i].get("ok"):\n', "        if False:\n", {"alone"}, "その行だけで通らない行を通す"),
    "alone_count": ("critic_gate.py", "    if set(alone) != set(range(1, n + 1)):\n", "    if False:\n", {"alone"}, "抜けた行を見ない"),
    "alone_card": ("critic_gate.py", "        if ln == 0:\n            continue\n", "", {"alone"}, "題の札（行 0）の1件を崩れに数える"),
    "checked": ("critic_gate.py", "    if miss:\n        fail.append((None, \"(h) 当てていない約束\"",
                "    if False:\n        fail.append((None, \"(h) 当てていない約束\"", {"checked"}, "当てていない約束を通す"),
    "checked_ledger": ("critic_gate.py", ' | {h.get("id") for h in d.get("ledger", [])}\n', "\n", {"checked"},
                       "ledger に挙げた ID を、当てたに数えない"),
    "known_own": ("critic_gate.py", "    known = {**led.items, **{o.id: o for o in ledger_mod.OWN}}", "    known = dict(led.items)", {"checked"},
                  "帳面の外の約束（X2）の当たりを、カードに無い ID として △ にする"),
    "as_of_text": ("critic_gate.py", '    return f"{as_of[0]}:{as_of[1]}" if as_of[1] is not None else as_of[0]\n', "    return as_of[0]\n",
                   {"focaccia"}, "lint に、承認の時点のコメントID を渡さない（日付だけにする）"),
    "numbers": ("critic_gate.py", '        if in_range(x.get("line")) and not x.get("said_before"):\n', "        if False:\n",
                {"numbers"}, "前に声の無い数を通す"),
    "ledger_unknown": ("critic_gate.py", "        if fid not in known:\n", "        if False:\n", {"ledger"}, "帳面に無い ID まで ✕ にする"),
    "score_low": ("critic_gate.py", "        if v <= 2:\n", "        if False:\n", {"scores"}, "2 以下の点を通す"),
    "score_three": ("critic_gate.py", "        elif v == 3:\n", "        elif False:\n", {"scores"}, "3 の点を △ に出さない"),
    "ayato": ("critic_gate.py", "        if line in ayato:\n", "        if False:\n", {"ayato", "alone"}, "【あやと】の行でも ✕ にする"),
    "i_side": ("critic_gate.py", "        if fid in I_SIDE and ln not in i_lines:\n", "        if False:\n",
               {"i_side"}, "(i) で渡れている行の F-039 も ✕ にする"),
    "as_of": ("critic_gate.py", "        if not in_force(known[fid], as_of):\n", "        if False:\n",
              {"as_of"}, "承認より後にできた決まりでも ✕ にする"),
    "lint_in": ("critic_gate.py", '    return [h for h in lint_mod.lint(c, as_of_text(as_of))["hits"] if not h.look]\n',
                "    return []\n", {"focaccia"}, "lint の ✕ を関所の合否に入れない"),
    "as_of_id": ("critic_gate.py", "        if d < day or (d == day and (cid is None or not ids or min(ids) <= cid)):\n",
                 "        if d < day or d == day:\n", {"as_of"}, "同じ日の決まりの前後をコメントID で分けない"),
}


def setup(cut):
    c = CUTS[cut] if cut else None
    return legs.load(HERE / "critic_gate.py", "gate", (c[1], c[2]) if c else None)


SCRIPT = FIX / "approved/TDArug_te90_p1/script.txt"   # 20行。最後が「…アーカイブ見てね！」、その前が「みんなやったら…？」
FOCACCIA_AT = "2026-10-23:6354242835"   # フォカッチャのあやとの添削（#1014）
sys.path.insert(0, str(HERE))
import brief as _brief  # noqa: E402
CARD_IDS = _brief.card_ids()             # 約束のカードの ID（帳面から。手で並べない）


def base(n=20) -> dict:
    """何にも当たらない批評役の JSON（20行・全部4・約束のカードを全部当てた）。"""
    return {"scores": dict.fromkeys("abcdef", 4), "score_why": dict.fromkeys("abcdef", ""), "checked": list(CARD_IDS),
            "alone": [{"line": i, "ok": True, "why": ""} for i in range(1, n + 1)], "outsider": [],
            "tsunagi": ["題"] + ["足"] * (n - 3) + ["締", "締"], "questions": [], "turns": [],
            "numbers": [], "ledger": [], "leave": [], "fixes": [], "verdict": "通る"}


def run(G, d, rows=None):
    c, rows0 = G.brief.rows_of(SCRIPT, None)
    return G.judge(d, c, rows if rows is not None else rows0)


def fails(G, d, rows=None):
    return run(G, d, rows)["fail"]


def with_(**kw):
    d = base()
    for k, v in kw.items():
        d[k] = v
    return d


# ---- 足 ----
def leg_shape(G):
    schema = json.loads(G.SCHEMA.read_text(encoding="utf-8"))
    ok = not G.check_shape(base(), schema)
    miss = base()
    del miss["tsunagi"]
    bad_enum = with_(tsunagi=["題", "飛"] + ["足"] * 18)
    extra = with_(note="長い説明")
    return [("決まりの形の JSON は通る", ok),
            ("tsunagi が無ければ崩れ", bool(G.check_shape(miss, schema))),
            ("つなぎに「飛」（enum に無い字）があれば崩れ", bool(G.check_shape(bad_enum, schema))),
            ("決まりに無い鍵（note）があれば崩れ", bool(G.check_shape(extra, schema)))]


def leg_count(G):
    return [("つなぎが19個（原稿は20行）なら崩れ", bool(run(G, with_(tsunagi=["題"] + ["足"] * 18))["bad"])),
            ("20個なら崩れなし", not run(G, base())["bad"])]


def leg_jump(G):
    t = base()["tsunagi"]
    t5 = list(t)
    t5[4] = "跳"
    tl = list(t)
    tl[19] = "跳"
    return [("5行目の跳を ✕", [f[0] for f in fails(G, with_(tsunagi=t5))] == [5]),
            ("最後の行（アーカイブの1行）の跳は数えない", not fails(G, with_(tsunagi=tl))),
            ("跳が無ければ ✕ 0", not fails(G, base()))]


def leg_question(G):
    none_ = fails(G, with_(questions=[{"line": 6, "answered_by": 0, "moved": False}]))
    moved = fails(G, with_(questions=[{"line": 6, "answered_by": 11, "moved": True}]))
    ok = fails(G, with_(questions=[{"line": 2, "answered_by": 5, "moved": False}]))
    final = fails(G, with_(questions=[{"line": 19, "answered_by": 0, "moved": False}]))
    return [("答えない問い（6行目）を ✕", [f[0] for f in none_] == [6]),
            ("答える前に移る問いを ✕", [f[0] for f in moved] == [6]),
            ("答える問い（2 → 5）は通す", not ok),
            ("終わりの問い（アーカイブの前の19行目）は答えを求めない", not final)]


def turn(line, **kw):
    t = {"line": line, "kind": "取消", "mark": "でも", "reason": True, "erases": [line - 1], "back": False}
    t.update(kw)
    return t


def leg_cancel(G):
    def f(*ts):
        return [x for x in fails(G, with_(turns=list(ts))) if x[1] == "(i) 取消"]
    return [("印と理由のある取消1回は通す", not f(turn(5))),
            ("取消の2回目を ✕", [x[0] for x in f(turn(5), turn(11))] == [11]),
            ("印の無い取消を ✕", bool(f(turn(5, mark="")))),
            ("理由が声に無い取消を ✕", bool(f(turn(5, reason=False)))),
            ("2行で積んだ結論を消す取消を ✕", bool(f(turn(11, erases=[9, 10])))),
            ("すぐあとで向きを戻す取消を ✕", bool(f(turn(11, back=True)))),
            ("動は何回あっても数えない", not f(turn(3, kind="動"), turn(6, kind="動", mark=""), turn(12, kind="動")))]


def leg_outsider(G):
    hit = fails(G, with_(outsider=[{"line": 11, "who": "視聴者のコメント"}]))
    return [("画に居ない人の言葉（11行目・視聴者のコメント）を ✕", [(x[0], x[1]) for x in hit] == [(11, "(k) 画に居ない人の言葉")]),
            ("挙げなければ通る（「って」の印の有無は数えない）", not fails(G, base())),
            ("範囲の外の行（21）は崩れ", bool(run(G, with_(outsider=[{"line": 21, "who": "x"}]))["bad"]))]


def leg_alone(G):
    def al(no=(), why="宛先が犬のまま", n=20):
        return [{"line": i, "ok": i not in no, "why": why if i in no else ""} for i in range(1, n + 1)]
    a5, last = al((5,)), al((20,))
    hit = fails(G, with_(alone=a5))
    c, rows = G.brief.rows_of(SCRIPT, None)
    rows = copy.deepcopy(rows)
    rows[4]["why"] = "あやとの添削（#977 2026-10-21）"
    ayato = G.judge(with_(alone=a5), c, rows)
    return [("その行だけで通らない5行目を ✕（理由つき）", [(x[0], x[2]) for x in hit] == [(5, "宛先が犬のまま")]),
            ("最後の行（アーカイブの1行）の「否」は数えない", not fails(G, with_(alone=last))),
            ("【あやと】の行の「否」は △（まとめ役が裁く）", not ayato["fail"] and any(x[0] == 5 for x in ayato["look"])),
            ("20行目が抜けたら崩れ", bool(run(G, with_(alone=al(n=19)))["bad"])),
            ("同じ行が2回あれば崩れ", bool(run(G, with_(alone=al() + [{"line": 3, "ok": True, "why": ""}]))["bad"])),
            ("題の札（行 0）の1件は飛ばす（崩れにしない）", not run(G, with_(alone=[{"line": 0, "ok": True, "why": ""}] + al()))["bad"])]


def leg_checked(G):
    miss = run(G, with_(checked=[i for i in CARD_IDS if i != "F-048"]))
    via_ledger = run(G, with_(checked=[i for i in CARD_IDS if i != "F-048"],
                              ledger=[{"id": "F-048", "line": 8, "why": "コメントの話"}]))
    own = run(G, with_(ledger=[{"id": "X2", "line": 8, "why": "盛っている"}]))
    return [(f"カード {len(CARD_IDS)} 枚を全部当てれば通る（帳面の外の X2 を含む）", "X2" in CARD_IDS and not fails(G, base())),
            ("F-048 を当てていなければ ✕（欠けた ID を名指す）", [(x[1], x[2]) for x in miss["fail"]] == [("(h) 当てていない約束", "F-048")]),
            ("checked に無くても、ledger に挙げた F-048 は当てたに数える", [x[1] for x in via_ledger["fail"]] == ["(h) F-048"]),
            ("帳面の外の約束 X2 の当たりも ✕（カードに無い ID の △ にしない）", [x[1] for x in own["fail"]] == ["(h) X2"])]


def leg_numbers(G):
    return [("前の声に無い数（15行目）を ✕", [x[0] for x in fails(G, with_(numbers=[{"line": 15, "said_before": False}]))] == [15]),
            ("前に言った数は通す", not fails(G, with_(numbers=[{"line": 15, "said_before": True}])))]


def leg_ledger(G):
    known = run(G, with_(ledger=[{"id": "F-037", "line": 18, "why": "答えのあとの行"}]))
    unknown = run(G, with_(ledger=[{"id": "F-999", "line": 18, "why": "x"}]))
    return [("帳面にある ID（F-037）は ✕", [x[1] for x in known["fail"]] == ["(h) F-037"]),
            ("帳面に無い ID（F-999）は ✕ にせず △", not unknown["fail"] and any("F-999" in x[2] for x in unknown["look"]))]


def leg_scores(G):
    s2 = run(G, with_(scores={**dict.fromkeys("abcdef", 4), "b": 2}))
    s3 = run(G, with_(scores={**dict.fromkeys("abcdef", 4), "c": 3}))
    s4 = run(G, base())
    return [("(b) 2 は ✕", [x[1] for x in s2["fail"]] == ["(b) 2"]),
            ("(c) 3 は ✕ にせず △", not s3["fail"] and [x[1] for x in s3["look"]] == ["(c) 3"]),
            ("全部 4 なら ✕ も △ も無い", not s4["fail"] and not s4["look"])]


def leg_ayato(G):
    c, rows = G.brief.rows_of(SCRIPT, None)
    rows = copy.deepcopy(rows)
    rows[0]["why"] = "あやとの題（#977 2026-10-21）"
    t = base()["tsunagi"]
    d = with_(ledger=[{"id": "F-031", "line": 0, "why": "題"}, {"id": "F-008", "line": 1, "why": "x"}])
    res = G.judge(d, c, rows)
    other = G.judge(with_(ledger=[{"id": "F-008", "line": 2, "why": "x"}]), c, rows)
    return [("【あやと】の題（行0・行1）に当たった帳面の ID は △（まとめ役が裁く）",
             not res["fail"] and len([x for x in res["look"] if "【あやと】" in x[2]]) == 2),
            ("【あやと】でない行は ✕ のまま", [x[0] for x in other["fail"]] == [2]),
            ("つなぎの数は変わらない（20）", len(t) == 20)]


def leg_i_side(G):
    alone = run(G, with_(ledger=[{"id": "F-039", "line": 18, "why": "誰の興奮か分からない"}]))
    both = run(G, with_(ledger=[{"id": "F-039", "line": 11, "why": "文字起こしのまま"}], outsider=[{"line": 11, "who": "チャット"}]))
    other = run(G, with_(ledger=[{"id": "F-008", "line": 18, "why": "x"}]))
    return [("(i) の当たりの無い行の F-039 は ✕ にせず △", not alone["fail"] and [x[1] for x in alone["look"]] == ["(h) F-039"]),
            ("(k) の当たり（画に居ない人の言葉）と同じ行の F-039 は ✕", "(h) F-039" in [x[1] for x in both["fail"]]),
            ("F-039・F-040 でない ID は、(i) が無くても ✕", [x[1] for x in other["fail"]] == ["(h) F-008"])]


def leg_as_of(G):
    castle = G.parse_as_of("2026-10-21:6306110329")
    f037 = with_(ledger=[{"id": "F-037", "line": 18, "why": "言い直し"}])
    f008 = with_(ledger=[{"id": "F-008", "line": 18, "why": "誰の興奮か"}])
    c, rows = G.brief.rows_of(SCRIPT, None)
    later = G.judge(f037, c, rows, as_of=castle)
    old = G.judge(f008, c, rows, as_of=castle)
    now = G.judge(f037, c, rows)
    after = G.judge(f037, c, rows, as_of=G.parse_as_of("2026-10-21:6312662172"))
    return [("承認より後にできた F-037 は △", not later["fail"] and [x[1] for x in later["look"]] == ["(h) F-037"]),
            ("前からある F-008 は ✕ のまま", [x[1] for x in old["fail"]] == ["(h) F-008"]),
            ("as_of 無しなら F-037 は ✕", [x[1] for x in now["fail"]] == ["(h) F-037"]),
            ("F-037 ができたコメント（地下鉄の承認）の時点なら ✕", [x[1] for x in after["fail"]] == ["(h) F-037"])]


def leg_cli(G):
    def rc(d):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "critic.json"
            p.write_text(d if isinstance(d, str) else json.dumps(d, ensure_ascii=False), encoding="utf-8")
            # 城塞 p1 は承認の時点で読む（今日の決まりでは、あとでできた L-NICK・L-PARTICLE・L-ATE が lint で当たる）
            return subprocess.run([sys.executable, str(HERE / "critic_gate.py"), str(p), str(SCRIPT), "--as-of", "2026-10-21:6306110329"],
                                  capture_output=True,
                                  text=True, timeout=60, check=False).returncode
    t = base()["tsunagi"]
    t[4] = "跳"
    return [("何にも当たらなければ 0", rc(base()) == 0), ("跳が1つあれば 1", rc(with_(tsunagi=t)) == 1),
            ("形の違う JSON は 2", rc({"scores": {}}) == 2), ("JSON でなければ 2", rc("通る") == 2)]


def leg_focaccia(G):
    ng, ok = FIX / "rejected/VusdZVyjgjQ_p1/script.txt", FIX / "approved/VusdZVyjgjQ_p1/script.txt"
    c_ng, rows_ng = G.brief.rows_of(ng, None)
    c_ok, _ = G.brief.rows_of(ok, None)
    at = G.parse_as_of(FOCACCIA_AT)
    lf = [(h.rule, h.line) for h in G.lint_fails_of(c_ng, at)]
    hit = G.judge(base(len(c_ng.lines)) | {"ledger": [{"id": "F-047", "line": 12, "why": "2: 意気込みだけ"}]}, c_ng, rows_ng)
    return [("下書きは、批評役が何も挙げなくても lint の T-READ（1行目）・L-NEXT（21行目）で落ちる",
             sorted(lf) == [("L-NEXT", 21), ("T-READ", 1)]),
            ("あやとの添削版は、添削の時点の決まりで lint の ✕ 0", not G.lint_fails_of(c_ok, at)),
            ("批評役の (h) F-047（12行目）は ✕", [(x[0], x[1]) for x in hit["fail"]] == [(12, "(h) F-047")])]


LEGS = {
    "shape": leg_shape, "count": leg_count, "jump": leg_jump, "question": leg_question, "cancel": leg_cancel,
    "outsider": leg_outsider, "alone": leg_alone, "checked": leg_checked, "numbers": leg_numbers, "ledger": leg_ledger, "scores": leg_scores, "ayato": leg_ayato,
    "i_side": leg_i_side, "as_of": leg_as_of, "cli": leg_cli, "focaccia": leg_focaccia,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
