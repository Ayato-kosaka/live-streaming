"""**その日が来ると嘘になる字**を、画面に出る文の中から拾う。

    python3 python/text_expires_watch.py
    python3 python/text_expires_watch.py --dir /tmp/写し --today 2026-09-17

終了コード 0=通った / 1=見つかった / **2=数えるものが無い**。

## なぜ要るか

2026-09-17 に、島を分かち合ったときに出る1枚（`site/public/og.png`）が
「焼いた日のまま止まっていた」（`docs/island-misses.md` #134）。
根っこは絵ではない。**「その日が来ると嘘になる字を、焼き込んでいる」**という形。

同じ形が画面の字にもある。`site/app/nordic/page.tsx` の `metadata.description` が
「2026年9月11日出発、9月20日ストックホルム着、**27日に発つまで**」と書いていた。
旅は9月27日に終わる。**その日から、この字は嘘になる。**
しかも `<meta>` なので、次にビルドするまで直らない。

`python/stale_content_watch.py` は**焼き込みが古くなっていないか**を見る。
こちらは**字が、いつ嘘になるか**を見る。軸が違う。

| | 何を見るか | どこから読むか |
| --- | --- | --- |
| `stale_content_watch.py` | 焼き込みの**中の日付**が今日から離れた | `site/content/*.ts` |
| ここ | 画面に出る**文**が、ある日に嘘になる | `site/app` `site/content` `site/components` |

## 拾うものの決めかた

**1件ごとに「いつ嘘になるか」を言えること。** 言えないものは拾わない。
これが拾いすぎを止める唯一の歯止めになっている。「なんとなく古そう」は
日を言えないので、ここでは見つけたことにならない。

拾うのは、**日付**と**これから起きる言い方**が同じ文にあるもの。

| 見かた | 何が起きたら赤いか |
| --- | --- |
| `MIRAI` | 日付が**まだ来ていない**。その日に嘘になる |
| `SUGITA` | 日付が**もう過ぎた**のに、これから起きる言い方のまま。**いま嘘** |

「これから起きる言い方」は `FORWARD` の語だけ。**丁寧形（〜ます）は入れない。**
「城があります」はいつ読んでも本当で、拾うと分母が意味を失う
（`docs/island-standards.md` §15「拾いすぎる道具は、誰も見なくなる」）。

**過去の事実は拾わない。**「2023年8月1日に出会った」「2024年9月に日本を出た」は
いつ読んでも本当なので、日付があっても `FORWARD` が無ければ通る。

## 引用は判定しない。ただし分母には出す

`site/content/` には、**視聴者さんの書き込みと配信の題名がそのまま入っている**本がある
（`chapterStreams.ts` の「明日は13時から」など）。あれは**言った時点の記録**で、
日が過ぎても嘘にならない。`QUOTES` に並べて判定から外す。

**黙って抜かない。** 何本を引用として外したかを表に出す。抜いた本が増えても
数が減らないと、見ている範囲が縮んだことに気づけない（同 §15）。

## 印字に入れないもの

このリポジトリは公開。出すのは**ファイル名・行・日付・拾った字の頭**だけ。
判定から外した本（引用）の**中身は1文字も出さない**——あそこは視聴者さんの
書き込みそのものなので、名前が混じっていてもこちらからは見分けられない。
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE = REPO / "site"

# 見に行く置き場。**ここを増やしたら、分母も一緒に増える**
DIRS = ("app", "content", "components")

JP = re.compile(r"[ぁ-んァ-ヶ一-龥]")

# 日付の書きかた3つ。**年の無いものも拾う**（「27日に発つまで」の27日は
# すぐ上の「9月」に付いているので、月を持ち回って解く）
D_YMD = re.compile(r"(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?")
D_MD = re.compile(r"(?<![\d-])(\d{1,2})月(\d{1,2})日")
# 月の書いていない「27日」。**「丸1日」「あと3日」は日付ではない**ので、
# 前に付く字で外す。1日は「一日」の意味で使うことが多いので、そもそも拾わない
D_D = re.compile(r"(?<![\d\-丸約半計全毎翌同])(?<!あと)(?<!残り)(\d{1,2})日(?![間目])")

# **これから起きる言い方。** 丁寧形（〜ます）は入れない（上の「拾うものの決めかた」）。
# 迷ったら入れないほうへ倒す。1件でも狼少年が出ると、この表ごと読まれなくなる
FORWARD = re.compile(
    # これから起きると言っている動き。**「〜ます」だけの丁寧形は入れない**
    r"発つ|発ちます|向かう|向かいます|着く|着きます|"
    # 予定。**「予定だった」は過去なので外す**（実際に1件これで狼少年が出た）
    r"予定(?!だ|でし)|これから|まもなく|"
    r"北上します|渡ります|"
    # 「〜まで」。終わりの日を先に言っている形
    r"つまで|までが|まで。|まで、|"
    # 言い切りの現在形。**て形（「降りて」）は入れない**——過去の語りでも使う
    r"歩きます|行きます|行ってきます|やります|します。|します、|"
    r"出る。|出る、|入る。|越える。|会う。|"
    # まだ決まっていないことを聞いている。日付つきで聞けば、その日に意味を失う
    r"するか|行くか|どうする|"
    r"がそれ"
)

# **引用の本。** 視聴者さんの書き込みと配信の題名がそのまま入っている。
# 言った時点の記録なので、日が過ぎても嘘にならない。中身は印字しない
QUOTES: dict[str, str] = {
    "chapterStreams.ts": "配信の題名そのもの。「明日は13時から」は言った日の記録",
    "cityStreams.ts": "配信の題名そのもの（自動生成）",
    "onThisDay.ts": "その日の配信の題名（自動生成）",
    "legendDays.ts": "伝説の日の配信の題名（自動生成）",
    "streamPeaks.ts": "盛り上がった時刻と書き込み（自動生成）",
    "shorts.ts": "ショートの題名そのもの（自動生成）",
    "voices.ts": "視聴者さんの書き込みそのもの",
    "kitchenTalk.ts": "料理の回の書き込みそのもの",
    "countryStats.ts": "国ごとの配信の題名（自動生成）",
    "chapterStats.ts": "章ごとの数（自動生成）。日付は「数えた日」だけ",
    "roulette.ts": "配信の題名から作った引き（自動生成）",
}

# **見送り。** 拾いはしたが、その日が来ても嘘にならないと決めたもの。
# 鍵は「ファイル + 字の頭40文字」。**字を書き直すと鍵が外れて、また赤くなる。**
# 黙って落とさずに表へ出す（`docs/island-standards.md` §15）。
ALLOW: dict[tuple[str, str], str] = {
    (
        "content/plans.ts",
        "着いて終わりではない。友だちの家に7泊して、${md(NORDIC_UNTIL)",
    ): "旅の終わりの決めごと。日が過ぎても「27日に発つまでが北欧旅」は本当のまま",
    (
        "content/nordicFood.ts",
        "木曜日に出る。旅では9月24日がそれ",
    ): "スウェーデンの木曜の食べもの。旅の木曜が9月24日だったことは、日が過ぎても本当",
}

# **判定の足を1本ずつ折る。** `BREAK=<足>` を渡すと、直す前の measuring に戻る。
# 対照（`python/text_expires_watch_selftest.py`）は、折るたびに落ちることまで見る
# （`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
BREAKS = ("forward", "wayaku", "carry", "carryblock", "jsx", "quotes", "past")


def broken(leg: str) -> bool:
    return os.environ.get("BREAK", "") == leg


# **日付を、そのすぐ上の欄から持ってくる本。**
#
# 企画は「その日」を `date:` / `until:` という別の欄に持っていて、**本文には
# 日付が書いていない。**「行ってきます」「北欧へ発つ」は、その企画の日を過ぎたら
# 嘘になるのに、文だけ見ても日が分からないので1件も拾えなかった。
# **1つの企画の中では、いちばん先の日がその文の期限**として読む。
CARRY_FROM: dict[str, re.Pattern[str]] = {
    "content/plans.ts": re.compile(r'^\s*(?:date|until|done|when): (?:"(\d{4}-\d{2}-\d{2})"|[A-Z_]+),'),
}

# 企画の切れ目。ここで持ち回っている日を捨てる（次の企画の文に前の日を付けない）
CARRY_RESET = re.compile(r"^  \{$|^  \},?$|^\];$")

MIRAI = "MIRAI"  # まだ来ていない日。その日に嘘になる
SUGITA = "SUGITA"  # もう過ぎた日。いま嘘


# ---------------------------------------------------------------- 読むところ


def spans(src: str) -> list[tuple[str, int, int]]:
    """字の在りか。`("str"|"code", 始まり, 終わり)`。**注釈は返さない。**

    `//` `/* */` を落として、引用符の中を `str`、それ以外を `code` で返す。
    JSX の地の文は `code` のほうに残るので、下の `texts()` が拾い直す。
    """
    out: list[tuple[str, int, int]] = []
    i, n, code_from = 0, len(src), 0
    while i < n:
        c = src[i]
        if c in "\"'`":
            out.append(("code", code_from, i))
            j = i + 1
            start = j
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == c:
                    break
                j += 1
            out.append(("str", start, min(j, n)))
            i = j + 1
            code_from = i
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            out.append(("code", code_from, i))
            j = src.find("\n", i)
            i = n if j < 0 else j + 1
            code_from = i
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            out.append(("code", code_from, i))
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            code_from = i
            continue
        i += 1
    out.append(("code", code_from, n))
    return out


# JSX の地の文は `>` と `<` のあいだにいる。`{}` は差し込みなので境目になる
JSX_RUN = re.compile(r"[^<>{}\n]+")


def texts(src: str) -> list[tuple[int, str]]:
    """画面に出る字（と、その始まりの位置）。

    **日本語を1文字も持たないものは数えない。** クラス名・URL・鍵の名前を
    分母に入れると、「7万件のうち3件」という読めない数になる。
    """
    out: list[tuple[int, str]] = []
    for kind, a, b in spans(src):
        seg = src[a:b]
        if not JP.search(seg):
            continue
        if kind == "str":
            out.append((a, seg))
            continue
        if broken("jsx"):
            continue
        for m in JSX_RUN.finditer(seg):
            s = m.group(0).strip()
            if s and JP.search(s):
                out.append((a + m.start(), s))
    return out


def files(root: Path) -> list[Path]:
    """見に行くファイル。**並びを決めて返す**（出力が回すたび変わらないように）。"""
    out: list[Path] = []
    for d in DIRS:
        base = root / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_file() and p.suffix in (".ts", ".tsx"):
                out.append(p)
    return out


# ---------------------------------------------------------------- 日を解くところ


def _mk(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None  # 2026-13-45 のような字


def _months(today: date) -> list[int]:
    """今日の前後の月。月の書いていない「27日」を解くのに使う。"""
    return sorted({(today.replace(day=15) + timedelta(days=k)).month for k in (-31, 0, 31)})


def _near(today: date, m: int, d: int) -> date | None:
    """年の書いていない「9月27日」を、**今日にいちばん近い年**で解く。

    去年の9月と来年の9月なら、今日から近いほうを採る。**半年より遠いものは
    解かない**——「3月11日に10万再生」のような去年の話に、勝手に来年の年を
    付けてはいけない。
    """
    best: date | None = None
    for y in (today.year - 1, today.year, today.year + 1):
        got = _mk(y, m, d)
        if got is None:
            continue
        if best is None or abs((got - today).days) < abs((best - today).days):
            best = got
    if best is None or abs((best - today).days) > 183:
        return None
    return best


@dataclass
class Hit:
    """拾った1件。**`expires` を持たないものは、ここに入れない。**"""

    path: str
    line: int
    rule: str
    expires: date
    text: str
    # 見送りと決めた理由。空でなければ赤にしない（上の `ALLOW`）
    allowed: str = ""


@dataclass
class Facts:
    """1本を読んで分かったこと。**判定はしない。**"""

    name: str
    texts: int = 0
    dated: int = 0
    # 上の欄から日を持ってきた字の数。**分母と別に出す**（読む人が、どちらの
    # 拾い方で出たのかを見分けられるように）
    carried: int = 0
    # (行, 字, [日付]) — 日付を1つ以上持つ字だけ
    found: list[tuple[int, str, list[date]]] = field(default_factory=list)


def dates_in(t: str, today: date) -> list[date]:
    """文の中の日付。**月を持ち回る**——「9月20日ストックホルム着、27日に発つ」の
    27日は、すぐ前の「9月」の27日。持ち回らないと、この形が1件も拾えない。
    """
    got: list[tuple[int, date]] = []
    used: list[tuple[int, int]] = []
    month: int | None = None
    for m in D_YMD.finditer(t):
        d = _mk(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if d:
            got.append((m.start(), d))
            month = d.month
        used.append(m.span())
    for m in (() if broken("wayaku") else D_MD.finditer(t)):
        if any(a <= m.start() < b for a, b in used):
            continue
        d = _near(today, int(m.group(1)), int(m.group(2)))
        if d:
            got.append((m.start(), d))
            month = int(m.group(1))
        used.append(m.span())
    for m in (() if broken("carry") else D_D.finditer(t)):
        if any(a <= m.start() < b for a, b in used):
            continue
        if month is None:
            # **月の書いていない「27日に発ちます」も拾う。** 同じ文に月が無ければ、
            # 今日の前後の月のうち今日にいちばん近い日として読む。企画の文は
            # 「いまの月のこと」を言っているので、これで当たる。
            # （「12日間」「8日目」は上の `D_D` が最初から拾っていない）
            dd = int(m.group(1))
            if dd < 2:
                continue  # 「1日」は「一日」の意味で使う。日付として読まない
            near = [x for x in (_near(today, m0, dd) for m0 in _months(today)) if x]
            if not near:
                continue
            got.append((m.start(), min(near, key=lambda x: abs((x - today).days))))
            continue
        d = _near(today, month, int(m.group(1)))
        if d:
            got.append((m.start(), d))
    return [d for _, d in sorted(got)]


def scan(path: Path, today: date, rel: str = "") -> Facts:
    """1本を読む。**BigQuery も git も引かない。**"""
    f = Facts(name=path.name)
    src = path.read_text(encoding="utf-8")
    carry = _carry_map(src, rel)
    for off, t in texts(src):
        f.texts += 1
        line = src[:off].count("\n") + 1
        ds = dates_in(t, today)
        if not ds and line in carry:
            ds = [carry[line]]
            f.carried += 1
        if not ds:
            continue
        f.dated += 1
        f.found.append((line, t, ds))
    return f


def _carry_map(src: str, rel: str) -> dict[int, date]:
    """行 → その行の字に効く日。**企画の切れ目でいったん捨てる。**

    1つの企画の中に `date` と `until` があれば、**いちばん先の日**を採る。
    旅は9月11日に始まって27日に終わるので、その中の文が嘘になるのは27日。
    """
    pat = CARRY_FROM.get(rel)
    if pat is None or broken("carryblock"):
        return {}
    lines = src.split("\n")
    # **名前で置いた日も解く。** 同じ日を2か所に書かないために
    # `until: NORDIC_UNTIL` と書いてあると、日が1つも見つからない
    named = {
        m.group(1): d
        for m in re.finditer(r'^const ([A-Z_]+) = "(\d{4}-\d{2}-\d{2})";', src, re.M)
        if (d := _mk(*(int(x) for x in m.group(2).split("-"))))
    }
    # まず企画ごとの区切りを決めて、その区間の日をぜんぶ集める
    out: dict[int, date] = {}
    start = 0
    days: list[date] = []
    for i, line in enumerate(lines):
        if CARRY_RESET.match(line):
            if days:
                for n in range(start + 1, i + 2):
                    out[n] = max(days)
            start, days = i, []
            continue
        m = pat.match(line)
        if m:
            got = (
                _mk(*(int(x) for x in m.group(1).split("-")))
                if m.group(1)
                else named.get((m.group(0).split(": ")[-1]).strip(","))
            )
            if got:
                days.append(got)
    return out


def scan_all(root: Path, today: date) -> dict[str, Facts]:
    return {str(p.relative_to(root)): scan(p, today, str(p.relative_to(root))) for p in files(root)}


# ---------------------------------------------------------------- 決めるところ


@dataclass
class Verdict:
    hits: list[Hit] = field(default_factory=list)
    # 拾ったが、嘘にならないと決めたもの（`ALLOW`）
    passed: list[Hit] = field(default_factory=list)
    blind: list[str] = field(default_factory=list)
    n_files: int = 0
    n_texts: int = 0
    n_dated: int = 0
    n_carried: int = 0
    n_judged_files: int = 0
    n_judged_texts: int = 0
    quoted: list[tuple[str, str, int]] = field(default_factory=list)  # 本・理由・字の数

    @property
    def ok(self) -> bool:
        return not self.hits and not self.blind


def judge(seen: dict[str, Facts], today: date) -> Verdict:
    """読んだ結果を見て、赤にするかどうかを決める。**ファイルを開かない。**

    仕込んだ字で赤くなることと鳴らないことを、手元で両側から見られるようにするため
    （`python/text_expires_watch_selftest.py`）。
    """
    v = Verdict()
    v.n_files = len(seen)
    for rel, f in sorted(seen.items()):
        v.n_texts += f.texts
        v.n_dated += f.dated
        v.n_carried += f.carried
        why = None if broken("quotes") else QUOTES.get(f.name)
        if why is not None:
            # **中身は出さない。** 数だけ出して分母に入れる
            v.quoted.append((rel, why, f.texts))
            continue
        v.n_judged_files += 1
        v.n_judged_texts += f.texts
        for line, t, ds in f.found:
            if not broken("forward") and not FORWARD.search(t):
                continue  # 過去の事実。日付があっても嘘にならない
            # **いちばん先の日で言う。** 文の中に9月11日と9月27日があるなら、
            # この文がまるごと嘘になるのは27日
            d = max(ds)
            if broken("past") and d < today:
                continue
            why = ALLOW.get((rel, t[:40]), "")
            h = Hit(rel, line, MIRAI if d >= today else SUGITA, d, t, why)
            (v.passed if why else v.hits).append(h)
    if v.n_texts == 0:
        v.blind.append("画面に出る字が1つも見つかりません（読みかたが外れている）")
    if v.n_dated == 0:
        v.blind.append("日付を持つ字が1つもありません（日付の読みかたが外れている）")
    for name in sorted(set(QUOTES) - {f.name for f in seen.values()}):
        v.blind.append(f"{name} が置き場にありません（引用の表には在る）")
    # **当たらなくなった見送りは、表から落とす合図。** 字を直したのに
    # 見送りだけ残ると、次に同じ字を書いた人が黙って通る
    hit_keys = {(h.path, h.text[:40]) for h in v.passed}
    for key in sorted(set(ALLOW) - hit_keys):
        v.blind.append(f"見送りの表の {key[0]}「{key[1][:20]}…」が、もうどこにも当たりません")
    return v


# ---------------------------------------------------------------- 出すところ


def report(v: Verdict, today: date) -> None:
    """**分母から出す。**「0件」だけでは、見ていないから0件と区別がつかない
    （`docs/island-standards.md` §15）。"""
    print(
        f"{v.n_files}本のファイルから画面に出る字 {v.n_texts}件を拾って、"
        f"うち日付を持つのが {v.n_dated}件"
        f"（{v.n_carried}件は、字ではなくすぐ上の欄から日を取った）。"
        f"判定したのは {v.n_judged_files}本 / {v.n_judged_texts}件"
        f"（引用として外したのが {len(v.quoted)}本）。きょうは {today}"
    )
    print()
    if v.quoted:
        print("  判定しない本（引用。中身は出さない）")
        for rel, why, n in v.quoted:
            print(f"    {rel:34} 字{n:5}件  {why}")
        print()

    if v.passed:
        print(f"  拾ったが、嘘にはならないと決めたもの {len(v.passed)}件")
        for h in sorted(v.passed, key=lambda h: (h.path, h.line)):
            print(f"    {h.path}:{h.line} {h.expires}  {h.allowed}")
        print()

    soon = [h for h in v.hits if h.rule == MIRAI]
    now = [h for h in v.hits if h.rule == SUGITA]
    print(f"  もう嘘になっている {len(now)}件 / これから嘘になる {len(soon)}件")
    for h in sorted(now, key=lambda h: (h.expires, h.path, h.line)):
        print(f"::error::{h.path}:{h.line} {h.expires} に嘘になった: {h.text[:90]}")
    for h in sorted(soon, key=lambda h: (h.expires, h.path, h.line)):
        left = (h.expires - today).days
        print(f"::error::{h.path}:{h.line} {h.expires}（あと{left}日）に嘘になる: {h.text[:90]}")
    for line in v.blind:
        print(f"::error::数えられません: {line}")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n### その日が来ると嘘になる字\n\n")
            f.write(
                f"{v.n_files}本 / 字 {v.n_texts}件を見て、判定は "
                f"{v.n_judged_files}本 / {v.n_judged_texts}件"
                f"（引用 {len(v.quoted)}本を除く）\n\n"
            )
            if v.ok:
                f.write("嘘になる字はありません。\n")
            for h in v.hits:
                f.write(f"- 🔴 `{h.path}:{h.line}` {h.expires} — {h.text[:60]}\n")
            for line in v.blind:
                f.write(f"- ⚠️ 数えられません: {line}\n")


def main() -> int:
    argv = sys.argv[1:]
    root = SITE
    today = date.today()
    if "--dir" in argv:
        root = Path(argv[argv.index("--dir") + 1])
    if "--today" in argv:
        raw = argv[argv.index("--today") + 1]
        try:
            today = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            print("--today は YYYY-MM-DD で渡してください", file=sys.stderr)
            return 2

    if not root.is_dir():
        print(f"置き場がありません: {root}", file=sys.stderr)
        return 2
    seen = scan_all(root, today)
    if not seen:
        print(f"数えるものがありません（{root} に .ts / .tsx が1本もない）", file=sys.stderr)
        return 2

    v = judge(seen, today)
    report(v, today)
    if v.blind:
        return 2
    return 1 if v.hits else 0


if __name__ == "__main__":
    sys.exit(main())
