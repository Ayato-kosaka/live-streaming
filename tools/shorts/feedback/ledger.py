#!/usr/bin/env python3
"""**あやとの指摘の帳面**（`.claude/skills/viral-shorts-creator/references/ayato_feedback.md`）を読む。

    python3 tools/shorts/feedback/ledger.py            # 決まりを分類ごとに1行ずつ（書く人・批評役に渡す一覧）
    python3 tools/shorts/feedback/ledger.py --check    # 帳面の形が崩れていないか

終了コード 0=読めた（`--check` なら形も揃っている）/ 1=形が崩れている / 2=帳面が無い・読めない。

使うのは3つ。取りこぼしの見張り（`watch.py`）は、帳面に入っているコメントの URL を数える。
原稿の検査（`tools/shorts/script/lint.py`）は、規則ごとに持っている帳面の ID がここに在るかを見る
（`ledger_selftest.py`）。作文者・批評役の1枚（`tools/shorts/script/brief.py`）は、原稿の段の約束（`script_items`）を
決まりと直しの全文で「約束のカード」にする。lint の L-NICK（呼び名）・L-ATE（当て表）も、同じ項目と欄から読む。

置き換わった字は「置き換わった」の欄に移して、題と決まりからは消す（1枚には出さない）。

## 帳面の形（ここが読むところだけ）

```
## 指摘
### F-001 <決まりを1行で>
- **言われた:**
  - 2026-10-21 #975 https://github.com/Ayato-kosaka/live-streaming/issues/975#issuecomment-…
- **分類:** 題
- **あやとの言葉:** …
- **決まり:** …
- **直す前 → 直した後:** …
- **当てる場所:** `lint:T-FLAG` ／ `check:still_image` ／ 批評役 (h) ／ 人の目（…）

## 指摘ではないコメント
- https://github.com/Ayato-kosaka/live-streaming/issues/977#issuecomment-…（時刻の指定）
```

**数えるのは、この2つの節の中の URL だけ。** 前書きに例として書いた URL を「入っている」に数えると、
例に使ったコメントは二度と見張りに出てこない。
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REL = ".claude/skills/viral-shorts-creator/references/ayato_feedback.md"
PATH = ROOT / REL

REPO = "Ayato-kosaka/live-streaming"
FEEDBACK = "指摘"
OTHER = "指摘ではないコメント"

# 分類。「進め方」は指示の7つに足した。承認の読みかた・段取り・受け持ちのように、
# 動画の中身ではなく作りかたへの指摘が、7つのどれにも入らなかった（2026-10-21 のバックフィルで5項目）
CATEGORIES = ("題", "言い回し", "事実", "構成", "画", "音", "投稿", "進め方")

# 1項目に必ず要る欄。どれかが欠けた項目は、読む人が「どうすればいいか」か「どこで当てるか」を失う
FIELDS = ("言われた", "分類", "あやとの言葉", "決まり", "直す前 → 直した後", "当てる場所")

URL = re.compile(r"https://github\.com/" + re.escape(REPO) + r"/issues/(\d+)#issuecomment-(\d+)")
ITEM = re.compile(r"^### (F-\d{3}) (.+?)\s*$")
FIELD = re.compile(r"^- \*\*(.+?):\*\*\s*(.*)$")
DATE = re.compile(r"20\d\d-\d\d-\d\d")
LINT = re.compile(r"`lint:([A-Z]-[A-Z]+)`")
CHECK = re.compile(r"`check:([a-z_]+)`")
CRITIC = "批評役 (h)"
HUMAN = "人の目"

# 原稿の段（作文者・批評役の1枚に「約束のカード」で全文を入れる）の項目の選びかた。
# 分類だけで選ぶと、字に効くのに分類が別の項目が落ちる（2026-10-23 の棚卸しで、F-014 画・F-019 音・F-050 進め方が
# 作文者に1字も届いていなかった）。だから「当てる場所」が原稿の段を名指していれば、分類にかかわらず入れる
SCRIPT_CATS = ("題", "言い回し", "事実", "構成")
WRITE = "書く段"
# 任意の欄。後の項目で置き換わった古い字と、置き換えた ID を残す。1枚には出さない
# （置き換わった字が題や決まりに残ると、1枚に毎回出て、新しい決まりと逆を教える。F-043 の「札と1行目は別の字でよい」がそれ）
REPLACED = "置き換わった"


def for_script(it) -> bool:
    """原稿の段に効く項目か（題・言い回し・事実・構成か、当てる場所が lint・批評役・書く段を名指す）。"""
    return it.category in SCRIPT_CATS or bool(it.lint) or WRITE in it.place or "批評役" in it.place


@dataclass
class Item:
    id: str
    title: str
    line: int
    fields: dict = field(default_factory=dict)
    refs: dict = field(default_factory=dict)   # コメントID → issue 番号

    @property
    def category(self) -> str:
        return self.fields.get("分類", "").strip()

    @property
    def date(self) -> str:
        m = DATE.search(self.fields.get("言われた", ""))
        return m.group(0) if m else ""

    @property
    def times(self) -> int:
        """言われた回数（「言われた」の箇条の数）。"""
        return sum(1 for ln in self.fields.get("言われた", "").splitlines() if ln.strip().startswith("- "))

    @property
    def place(self) -> str:
        return self.fields.get("当てる場所", "")

    @property
    def lint(self) -> set:
        return set(LINT.findall(self.place))

    @property
    def checks(self) -> set:
        return set(CHECK.findall(self.place))


@dataclass
class Ledger:
    items: dict = field(default_factory=dict)       # F-ID → Item（書いてある順）
    feedback: dict = field(default_factory=dict)    # コメントID → issue 番号（「指摘」の節）
    other: dict = field(default_factory=dict)       # コメントID → issue 番号（「指摘ではない」の節）
    problems: list = field(default_factory=list)

    def refs(self) -> dict:
        """2つの節のどちらかに在るコメント。コメントID → issue 番号の集合。"""
        out: dict = {}
        for d in (self.feedback, self.other):
            for cid, num in d.items():
                out.setdefault(cid, set()).add(num)
        return out


def parse(text: str) -> Ledger:
    """帳面の字を読む。**崩れていても止まらない**（崩れは `problems` に積む）。

    見張りは、ほかの枝の書きかけの帳面も読む。1つ崩れているだけで全部を「読めない」にすると、
    入っているコメントまで取りこぼしに数えてしまう。
    """
    led = Ledger()
    section = None
    item: Item | None = None
    cur = None   # いま読んでいる欄の名前
    seen_ids: list = []
    where: dict = {}   # コメントID → (節, issue 番号) 。同じコメントが両方の節に在るのを見つける

    def note(cid: int, num: int, sec: str, lineno: int):
        if cid in where:
            sec0, num0 = where[cid]
            if num0 != num:
                led.problems.append(f"{lineno}行目: コメント {cid} の issue 番号が #{num0} と #{num} で食い違う")
            if sec0 != sec:
                led.problems.append(f"{lineno}行目: コメント {cid} が「{FEEDBACK}」と「{OTHER}」の両方に在る（どちらか1つに）")
        else:
            where[cid] = (sec, num)

    for no, raw in enumerate(text.splitlines(), 1):
        if raw.startswith("## "):
            name = raw[3:].strip()
            section = name if name in (FEEDBACK, OTHER) else None
            item, cur = None, None
            continue
        if section == FEEDBACK:
            m = ITEM.match(raw)
            if m:
                item = Item(m.group(1), m.group(2), no)
                if item.id in led.items:
                    led.problems.append(f"{no}行目: {item.id} が2つある")
                led.items.setdefault(item.id, item)
                seen_ids.append(item.id)
                cur = None
                continue
            if raw.startswith("### "):
                led.problems.append(f"{no}行目: 項目の見出しが「### F-000 決まり」の形でない: {raw[:40]}")
                item, cur = None, None
                continue
            if item is None:
                continue
            f = FIELD.match(raw)
            if f:
                cur = f.group(1)
                item.fields[cur] = f.group(2)
            elif cur is not None:
                item.fields[cur] = item.fields[cur] + "\n" + raw
            for u in URL.finditer(raw):
                num, cid = int(u.group(1)), int(u.group(2))
                item.refs[cid] = num
                led.feedback[cid] = num
                note(cid, num, FEEDBACK, no)
        elif section == OTHER:
            for u in URL.finditer(raw):
                num, cid = int(u.group(1)), int(u.group(2))
                led.other[cid] = num
                note(cid, num, OTHER, no)

    # 足すのは末尾に。番号を途中に差し込むと、ほかの手引きが指している ID がずれる
    for a, b in zip(seen_ids, seen_ids[1:]):
        if b <= a:
            led.problems.append(f"{b} が {a} の後ろにある（ID は書いた順に増やす）")
    for it in led.items.values():
        miss = [k for k in FIELDS if not it.fields.get(k, "").strip()]
        if miss:
            led.problems.append(f"{it.id}: 欄が無い・空: {'・'.join(miss)}")
        if it.category and it.category not in CATEGORIES:
            led.problems.append(f"{it.id}: 分類「{it.category}」は {'・'.join(CATEGORIES)} のどれでもない")
        if "言われた" in it.fields and not it.date:
            led.problems.append(f"{it.id}: 「言われた」に日付（YYYY-MM-DD）が無い")
        if it.place and not (it.lint or it.checks or CRITIC in it.place or HUMAN in it.place):
            led.problems.append(f"{it.id}: 当てる場所に `lint:…`・`check:…`・{CRITIC}・{HUMAN} のどれも無い")
    if not led.items:
        led.problems.append(f"「## {FEEDBACK}」の節に項目が1つも無い")
    return led


def load(path: Path | str = PATH) -> Ledger:
    return parse(Path(path).read_text(encoding="utf-8"))


# 帳面の外の約束（あやとの指摘ではなく、こちらが #907 で要件として書いたもの。あやとの言葉の記録は無い）。
# 原稿の段の約束なので、カードと当て表には帳面の項目と並べて入れる。ID は棚卸し（2026-10-23）の呼び名のまま
OWN = (
    Item("X2", "煽らない・事実と違うことを言わない。1行ずつ、元動画の時刻か外の出典を持つ", 0, fields={
        "言われた": "\n  - 2026-10-15 #907 https://github.com/Ayato-kosaka/live-streaming/issues/907#issuecomment-6196197685"
                    "（こちらが書いた「変えない制約」の3と6）",
        "分類": "事実",
        "決まり": "する — 数字・出来事は、配信の時刻か外の出典で言えるものだけを書き、1行ずつ spec の `why` に配信の時刻を書く。"
                 "本人の思い違いは、思い違いのまま本人の言葉で言う。言い切れないことは書かないか「〜とも」にする。"
                 "しない — 盛る（数を増やす・確かめていない「世界初」）・煽る（起きていない危険や結末を言う）・確かめていない場面を事実として言う",
        "直す前 → 直した後": "「全財産590円」→「残りの現金590円」（カードは持っていた） ／ 「あと10分」→「俺の計算では、あと10分」"
                          "（実際は約23分あった。本人の思い違いは本人の言葉で）",
        "当てる場所": "書く段 ／ 批評役 (h)（配信の字幕と並べる）",
    }),
)


def script_items(led: Ledger | None = None) -> list:
    """原稿の段の約束（帳面の項目のうち `for_script` に当たるもの、書いてある順）と、帳面の外の約束。"""
    led = led or load()
    return [it for it in led.items.values() if for_script(it)] + list(OWN)


def main() -> int:
    ap = argparse.ArgumentParser(description="あやとの指摘の帳面を読む")
    ap.add_argument("--path", default=str(PATH))
    ap.add_argument("--check", action="store_true", help="形が崩れていないかだけを見る")
    a = ap.parse_args()
    try:
        led = load(a.path)
    except OSError as e:
        print(f"帳面を読めない: {e}", file=sys.stderr)
        return 2
    if a.check:
        for p in led.problems:
            print(f"✕ {p}")
        print(f"項目 {len(led.items)}・指摘のコメント {len(led.feedback)}・指摘ではないコメント {len(led.other)}"
              f"・崩れ {len(led.problems)}")
        return 1 if led.problems else 0
    for cat in CATEGORIES:
        rows = [it for it in led.items.values() if it.category == cat]
        if not rows:
            continue
        print(f"## {cat}")
        for it in rows:
            times = f"（{it.times}回）" if it.times > 1 else ""
            print(f"- {it.id} {it.title}{times}")
    return 1 if led.problems else 0


if __name__ == "__main__":
    sys.exit(main())
