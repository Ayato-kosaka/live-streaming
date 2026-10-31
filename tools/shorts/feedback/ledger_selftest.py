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
    (".claude/skills/viral-shorts-creator/references/script_writing.md", ("ayato_feedback.md", "| (h) |", "tools/shorts/script/lint.py")),
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


LEGS = {
    "real_ledger": leg_real_ledger, "lint_link": leg_lint_link, "check_link": leg_check_link, "wiring": leg_wiring,
    "dup_id": leg_dup_id, "missing_field": leg_missing_field, "category": leg_category, "date": leg_date,
    "place": leg_place, "order": leg_order, "both_sections": leg_both_sections, "outside_sections": leg_outside_sections,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
