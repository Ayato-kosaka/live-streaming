"""**あやとの指摘の帳面（`ayato_feedback.md`）と、その読み手（`ledger.py`）の見張り。** 要るのは Python だけ。

    python3 tools/shorts/feedback/ledger_selftest.py
    BREAK=dup python3 tools/shorts/feedback/ledger_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾うので、**全部の PR で**走る。
帳面を書き崩した PR は、ショートを触っていなくてもここで止まる。

## 何を見るか

帳面は「書く人・批評役が読んで、規則と検査が名指す」ものなので、壊れかたが3つある。

1. **形が崩れる**（ID が2つ・欄が無い・分類が違う・日付が無い・当てる場所が無い・ID の順・同じコメントが両方の節）
2. **名指しが切れる**。帳面の `lint:<規則>` に対応する規則が `lint.py` に無い／`lint.py` の規則が帳面の項目を指していない／
   `check:<検査>` が `check.py` に無い。どれも、指摘が「当たっているつもりで当たっていない」になる
3. **読まれなくなる**。手順（`SKILL.md`・`script_writing.md` 7.4 の (h)・`hand-off`・`island-misses.md`）から帳面への道が消える。
   作っても読まれなければ意味が無い

| 足 | 確かめること |
| --- | --- |
| `real_ledger` | 本物の帳面に崩れが0、項目が1つ以上 |
| `lint_link` | 本物の帳面と `lint.py` の名指しが両向きに揃う。片方を消した写しでは崩れが出る |
| `check_link` | 帳面の `check:<検査>` が全部 `check.py` に在る。在らない名前を書いた写しでは崩れが出る |
| `wiring` | 手順の4か所が帳面を名指している |
| `dup_id` `missing_field` `category` `date` `place` `order` | それぞれの崩れを、こしらえた帳面で拾う |
| `both_sections` | 同じコメントが「指摘」と「指摘ではない」の両方に在るのを拾う |
| `outside_sections` | 前書きに書いた URL は、入っているコメントに数えない |
| `guard_real` | 本物の帳面と控え（`unguarded.txt`）と本物のコード: 機械の関所の崩れが0 |
| `guard_drop` `guard_new` | 控えから1行消すと落ちる／控えに無い違反（2回言われて人の目だけ）を1つ足すと落ちる |
| `guard_stale` `guard_frozen` | 直った項目が控えに残ると落ちる／締めの日より後に言われた項目は控えに在っても落ちる |
| `guard_names` `guard_reason` `guard_absolute` | コードに無い名前・関所だけで理由の無い項目を拾う／1回でも「絶対」は対象 |
| `guard_cli` | `ledger.py --check` が、控えから1行消した写しで 1 を返す |

4. **2回目からは、人の目だけにしない**（2026-11-27）。「言われた」が2行以上か「絶対」の項目は、当てる場所に
   コードに在る機械の名前（`lint:`・`check:`・`brief:`・`post:`）を持つ。いまの違反は控えに載せ、減ることしか許さない
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
import legs  # noqa: E402

CHECK_PY = ROOT / "tools/shorts/qa/check.py"
WIRES = (
    (".claude/skills/viral-shorts-creator/SKILL.md", ("references/ayato_feedback.md", "tools/shorts/script/lint.py")),
    # (h) の表は #1457（2026-11-26）で批評役が視聴者役と事実の確かめ役に分かれたときに消えた。残る (h) の段を名指す
    (".claude/skills/viral-shorts-creator/references/script_writing.md", ("ayato_feedback.md", "（(h)）", "tools/shorts/script/lint.py")),
    (".claude/skills/hand-off/SKILL.md", ("ayato_feedback.md",)),
    ("docs/island-misses.md", ("ayato_feedback.md",)),
)

CUTS = {
    "dup": ("ledger.py", '                    led.problems.append(f"{no}行目: {item.id} が2つある")\n', "                    pass\n",
            {"dup_id"}, "同じ ID を見逃す"),
    "fields": ("ledger.py", '        miss = [k for k in FIELDS if not it.fields.get(k, "").strip()]\n', "        miss = []\n",
               {"missing_field"}, "欠けた欄を見ない"),
    "both": ("ledger.py", "            if sec0 != sec:\n", "            if False:\n",
             {"both_sections"}, "両方の節に在るコメントを見逃す"),
    "section": ("ledger.py", "            section = name if name in (FEEDBACK, OTHER) else None\n",
                "            section = name if name in (FEEDBACK, OTHER) else OTHER\n",
                {"outside_sections"}, "前書きの URL まで数える"),
    "order": ("ledger.py", "        if b <= a:\n", "        if False:\n", {"order"}, "ID の順を見ない"),
    "category": ("ledger.py", "        if it.category and it.category not in CATEGORIES:\n", "        if False:\n",
                 {"category"}, "分類の名前を見ない"),
    "date": ("ledger.py", '        if "言われた" in it.fields and not it.date:\n', "        if False:\n",
             {"date"}, "日付の無い項目を通す"),
    "place": ("ledger.py", "        if it.place and not (it.lint or it.checks or CRITIC in it.place or HUMAN in it.place):\n",
              "        if False:\n", {"place"}, "当てる場所の無い項目を通す"),
    # ---- 2回目からは人の目だけにしない（2026-11-27） ----
    "g_allow": ("ledger.py", "        if fid not in allow:\n", "        if False:\n", {"guard_drop", "guard_new", "guard_cli"},
                "控えに無い違反を通す"),
    "g_stale": ("ledger.py", "        elif fid not in bad:\n", "        elif False:\n", {"guard_stale"}, "直った項目が控えに残っても通す"),
    "g_frozen": ("ledger.py", "        elif led.items[fid].last_date > GUARD_FROZEN:\n", "        elif False:\n", {"guard_frozen"},
                 "締めの日より後に言われた項目も控えで逃がす"),
    "g_names": ("ledger.py", '    out = [f"`{k}:{n}` がコードに無い" for k, n in sorted(it.machine) if n not in names.get(k, set())]\n',
                "    out = []\n", {"guard_names"}, "コードに無い名前を見ない"),
    "g_reason": ("ledger.py", '        elif not kinds & set(JUDGES) and not it.fields.get(REASON, "").strip():\n', "        elif False:\n",
                 {"guard_reason"}, "関所だけの項目に理由を求めない"),
    "g_nomachine": ("ledger.py", "        if not kinds:\n", "        if False:\n", {"guard_new"}, "機械の名前の無い項目を、名前が無いと言わない"),
    "g_target": ("ledger.py", '    return it.times >= 2 or "絶対" in it.title or "絶対" in it.fields.get("決まり", "")\n',
                 "    return it.times >= 2\n", {"guard_absolute", "guard_real"}, "1回の「絶対」を対象にしない"),
    "g_exit": ("ledger.py", "        return 1 if led.problems or gprobs else 0\n", "        return 1 if led.problems else 0\n",
               {"guard_cli"}, "`--check` が機械の関所の崩れで落ちない"),
    "lint_token": ("ledger.py", "LINT = re.compile(r\"`lint:([A-Z]-[A-Z]+)`\")", "LINT = re.compile(r\"(?!x)x\")",
                   {"lint_link", "real_ledger"}, "帳面の `lint:` を読まない"),
}


class Ctx:
    def __init__(self, ledger, lint):
        self.ledger, self.lint = ledger, lint


def setup(cut):
    c = CUTS[cut] if cut else None
    led = legs.load(HERE / "ledger.py", "ledger", (c[1], c[2]) if c else None)
    lint = legs.load(ROOT / "tools/shorts/script/lint.py", "lint")
    return Ctx(led, lint)


U = "https://github.com/Ayato-kosaka/live-streaming/issues/{}#issuecomment-{}"


def item(fid="F-001", cat="題", said=None, place="人の目（どこで）", drop=()):
    fields = {
        "言われた": "\n  - " + (said or f"2026-10-21 #975 {U.format(975, 1)}"),
        "分類": f" {cat}",
        "あやとの言葉": "\n  > 言葉",
        "決まり": " する — x",
        "直す前 → 直した後": " a → b",
        "当てる場所": f" {place}",
    }
    body = [f"### {fid} 決まり", ""]
    for k, v in fields.items():
        if k not in drop:
            body.append(f"- **{k}:**{v}")
    return "\n".join(body) + "\n"


def ledger_text(items, other="", preface=""):
    return f"# 帳面\n\n## 書きかた\n\n{preface}\n\n## 指摘\n\n" + "\n".join(items) + f"\n## 指摘ではないコメント\n\n{other}\n"


def problems(c, text):
    return c.ledger.parse(text).problems


def links(c, led, rules):
    """帳面と lint の規則の名指しが、両向きに揃っているか。崩れを字で返す。"""
    out = []
    for r in rules:
        for fid in r.ledger:
            it = led.items.get(fid)
            if it is None:
                out.append(f"{r.id} が指す {fid} が帳面に無い")
            elif r.id not in it.lint:
                out.append(f"{fid} の当てる場所に `lint:{r.id}` が無い")
    ids = {r.id: r for r in rules}
    for it in led.items.values():
        for rid in it.lint:
            if rid not in ids:
                out.append(f"{it.id} が名指す lint:{rid} が lint.py に無い")
            elif it.id not in ids[rid].ledger:
                out.append(f"{it.id} が名指す lint:{rid} は、{it.id} を指していない")
    return out


def check_names(led, text):
    return [f"{it.id} の check:{n} が check.py に無い" for it in led.items.values() for n in sorted(it.checks)
            if f'"{n}"' not in text]


# ---- 足 ----
def leg_real_ledger(c):
    led = c.ledger.load()
    return [(f"本物の帳面に崩れが無い（{len(led.items)}項目）" + (f" ← {led.problems[:3]}" if led.problems else ""),
             not led.problems),
            ("項目が1つ以上ある（0 を答えにしない）", len(led.items) > 0)]


def leg_lint_link(c):
    real = c.ledger.PATH.read_text(encoding="utf-8")
    led = c.ledger.parse(real)
    got = links(c, led, c.lint.RULES)
    cut = links(c, c.ledger.parse(real.replace("`lint:L-MIETE`", "")), c.lint.RULES)
    stray = links(c, led, list(c.lint.RULES) + [c.lint.Rule("L-NONE", ("F-999",), "2026-10-21", "x", lambda _: [])])
    return [(f"帳面と lint.py の名指しが両向きに揃う（規則 {len(c.lint.RULES)}）" + (f" ← {got[:3]}" if got else ""), not got),
            ("帳面から `lint:L-MIETE` を消した写しでは崩れが出る", any("L-MIETE" in p for p in cut)),
            ("帳面に無い F-999 を指す規則では崩れが出る", any("F-999" in p for p in stray))]


def leg_check_link(c):
    text = CHECK_PY.read_text(encoding="utf-8")
    led = c.ledger.load()
    got = check_names(led, text)
    names = sorted({n for it in led.items.values() for n in it.checks})
    bad = c.ledger.parse(c.ledger.PATH.read_text(encoding="utf-8").replace("`check:cut_length`", "`check:no_such_check`"))
    return [(f"帳面の check:（{len(names)}種）が全部 check.py に在る" + (f" ← {got}" if got else ""), not got and bool(names)),
            ("在らない名前を書いた写しでは崩れが出る", bool(check_names(bad, text)))]


def leg_wiring(c):
    out = []
    for rel, needles in WIRES:
        p = ROOT / rel
        text = p.read_text(encoding="utf-8") if p.exists() else ""
        miss = [n for n in needles if n not in text]
        out.append((f"{rel} が {'・'.join(needles)} を名指している" + (f" ← 無い: {miss}" if miss else ""), not miss))
    return out


def leg_dup_id(c):
    return [("同じ ID が2つ在るのを拾う", any("2つある" in p for p in problems(c, ledger_text([item("F-001"), item("F-001")]))))]


def leg_missing_field(c):
    return [("「決まり」の欠けた項目を拾う", any("決まり" in p for p in problems(c, ledger_text([item(drop=("決まり",))])))),
            ("全部の欄がある項目は通す", not problems(c, ledger_text([item()])))]


def leg_category(c):
    return [("分類「雰囲気」を拾う", any("分類" in p for p in problems(c, ledger_text([item(cat="雰囲気")]))))]


def leg_date(c):
    return [("日付の無い「言われた」を拾う", any("日付" in p for p in problems(c, ledger_text([item(said=f"チャット {U.format(975, 1)}")]))))]


def leg_place(c):
    return [("当てる場所が「あとで」だけの項目を拾う", any("当てる場所" in p for p in problems(c, ledger_text([item(place="あとで")])))),
            ("`check:cut_length` だけでも通す", not problems(c, ledger_text([item(place="`check:cut_length`")])))]


def leg_order(c):
    return [("F-002 の後ろの F-001 を拾う", any("後ろ" in p for p in problems(c, ledger_text([item("F-002"), item("F-001")]))))]


def leg_both_sections(c):
    text = ledger_text([item()], other=f"- {U.format(975, 1)}（承認）")
    return [("同じコメントが両方の節に在るのを拾う", any("両方" in p for p in problems(c, text)))]


def leg_outside_sections(c):
    led = c.ledger.parse(ledger_text([item()], other=f"- {U.format(977, 3)}（時刻）", preface=f"例: {U.format(976, 2)}"))
    return [("前書きの URL（コメント 2）は数えない", 2 not in led.refs()),
            ("指摘の節（1）と指摘ではない節（3）は数える", set(led.refs()) == {1, 3})]


# ---- 2回目からは、人の目だけにしない（2026-11-27） ----
NAMES = {"lint": {"L-NICK"}, "check": {"cut_length"}, "brief": {"edit_size"}, "post": set()}


def said(n: int, date: str = "2026-10-21") -> str:
    return "\n  - ".join(f"{date} #975 {U.format(975, 100 + i)}" for i in range(n))


def guard(c, items, allow="", names=NAMES):
    return c.ledger.guard(c.ledger.parse(ledger_text(items)), allow, names)[0]


def why(c, one, names=NAMES):
    """1項目が違反している理由（控えと突き合わせる前）。"""
    return c.ledger.unguarded(c.ledger.parse(ledger_text([one])).items["F-001"], names)


def leg_guard_real(c):
    led = c.ledger.load()
    allow = c.ledger.UNGUARDED.read_text(encoding="utf-8")
    probs, bad = c.ledger.guard(led, allow, c.ledger.code_names())
    n = sum(c.ledger.guard_target(it) for it in led.items.values())
    return [(f"本物の帳面と控えと本物のコード: 機械の関所の崩れが無い（対象 {n}項目・控え {len(bad)}行）"
             + (f" ← {probs[:3]}" if probs else ""), not probs),
            ("対象の項目が1つ以上ある（0 を答えにしない）", n > 0),
            ("本物のコードから名前を引ける（lint の L-NICK・check.py の cut_length・brief.py の edit_size）",
             all(x in c.ledger.code_names()[k] for k, x in (("lint", "L-NICK"), ("check", "cut_length"), ("brief", "edit_size"))))]


def leg_guard_drop(c):
    led = c.ledger.load()
    allow = c.ledger.UNGUARDED.read_text(encoding="utf-8")
    rows = [ln for ln in allow.splitlines() if ln.startswith("F-")]
    if not rows:
        return [("控えが空（全部直った）。消す行が無いので、こしらえた控えで見る",
                 any("控えに無い" in p for p in guard(c, [item(said=said(2))], "")))]
    cut = allow.replace(rows[0] + "\n", "", 1)
    probs = c.ledger.guard(led, cut, c.ledger.code_names())[0]
    return [(f"控えから {rows[0][:5]} を消すと落ちる", any(rows[0][:5] in p and "控えに無い" in p for p in probs))]


def leg_guard_new(c):
    two = item(said=said(2))
    return [("2回言われて人の目だけの項目が、控えに無ければ落ちる（機械の名前が無い、と言う）",
             any("F-001" in p and "機械の名前" in p for p in guard(c, [two], ""))),
            ("同じ項目を控えに載せれば通る", not guard(c, [two], "F-001  画  決まり\n")),
            ("`check:cut_length` を持てば、控え無しで通る", not guard(c, [item(said=said(2), place="`check:cut_length` ／ 人の目")], "")),
            ("1回だけの人の目の項目は対象でない", not guard(c, [item()], ""))]


def leg_guard_stale(c):
    ok = item(said=said(2), place="`lint:L-NICK`")
    return [("直った項目が控えに残っていたら落ちる", any("もう違反していない" in p for p in guard(c, [ok], "F-001\n"))),
            ("帳面に無い ID が控えにあれば落ちる", any("帳面に無い" in p for p in guard(c, [ok], "F-002\n")))]


def leg_guard_frozen(c):
    late = item(said=said(1) + f"\n  - 2026-11-28 #975 {U.format(975, 9)}")
    return [("締めの日より後に言われた項目は、控えに在っても落ちる", any("より後" in p for p in guard(c, [late], "F-001\n"))),
            ("締めの日までの項目は控えで通る", not guard(c, [item(said=said(2))], "F-001\n"))]


def leg_guard_names(c):
    probs = why(c, item(place="`lint:L-NOPE` ／ `brief:no_such_gate`"))
    return [("コードに無い `lint:L-NOPE`・`brief:no_such_gate` を拾う（1回の項目でも）",
             any("L-NOPE" in p for p in probs) and any("no_such_gate" in p for p in probs)),
            ("コードに在る名前だけなら通る", not why(c, item(said=said(2), place="`lint:L-NICK` ／ `brief:edit_size`")))]


def leg_guard_reason(c):
    gate = item(said=said(2), place="`brief:edit_size` ／ 人の目")
    with_why = gate.replace("- **当てる場所:**", "- **機械にできない理由:** 承認の読みかたは機械が決められない\n- **当てる場所:**")
    return [("関所（brief:）だけで理由の欄が無い項目を拾う", any("機械にできない理由" in p for p in why(c, gate))),
            ("理由の欄があれば通る", not why(c, with_why))]


def leg_guard_absolute(c):
    one = item().replace(" する — x", " する — x（絶対）")
    return [("1回でも決まりに「絶対」がある項目は対象（人の目だけなら違反）", bool(why(c, one))),
            ("1回で「絶対」の無い人の目の項目は対象でない", not why(c, item()))]


def leg_guard_cli(c):
    import contextlib
    import io
    import tempfile
    allow = c.ledger.UNGUARDED.read_text(encoding="utf-8")
    rows = [ln for ln in allow.splitlines() if ln.startswith("F-")]
    with tempfile.TemporaryDirectory() as td:
        led_p, allow_p = Path(td) / "led.md", Path(td) / "allow.txt"
        if rows:
            led_p.write_text(c.ledger.PATH.read_text(encoding="utf-8"), encoding="utf-8")
            allow_p.write_text(allow.replace(rows[0] + "\n", "", 1), encoding="utf-8")
        else:
            led_p.write_text(ledger_text([item(said=said(2))]), encoding="utf-8")
            allow_p.write_text("", encoding="utf-8")
        argv = sys.argv
        try:
            sys.argv = ["ledger.py", "--check", "--path", str(led_p), "--allow", str(allow_p)]
            with contextlib.redirect_stdout(io.StringIO()):
                rc = c.ledger.main()
        finally:
            sys.argv = argv
    return [("`--check` は、控えから1行消した写しで 1 を返す", rc == 1)]


LEGS = {
    "real_ledger": leg_real_ledger, "lint_link": leg_lint_link, "check_link": leg_check_link, "wiring": leg_wiring,
    "dup_id": leg_dup_id, "missing_field": leg_missing_field, "category": leg_category, "date": leg_date,
    "place": leg_place, "order": leg_order, "both_sections": leg_both_sections, "outside_sections": leg_outside_sections,
    "guard_real": leg_guard_real, "guard_drop": leg_guard_drop, "guard_new": leg_guard_new, "guard_stale": leg_guard_stale,
    "guard_frozen": leg_guard_frozen, "guard_names": leg_guard_names, "guard_reason": leg_guard_reason,
    "guard_absolute": leg_guard_absolute, "guard_cli": leg_guard_cli,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
