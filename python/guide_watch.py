"""**街のガイドの面を、書き出した HTML で見る。** 出す前の見張り3本（`docs/guide-design.md` 8章）。

    python3 python/guide_watch.py --dist site/.next-3130                          # 材料（guidebook.json）のある街を全部
    python3 python/guide_watch.py --dist site/.next-3130 north-macedonia/skopje   # 1つだけ

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（材料が0本・面の本文が読めない。
`docs/island-standards.md` §15。「0件だったので通りました」とは言わない）。

## 何を見るか

| 足 | 見ること | 正 |
| --- | --- | --- |
| 額 | 面に出た額（円・デナール・ユーロ…）が、`verify` の無い facts の行に在る。値段の表と料理の額は、**その行の場面（動画と秒）の facts の行の額**と同じ。合計の額は、**同じ表・同じ行に並んだ額の足し算**のときだけ通す | facts（`streams/**/*.facts.json`） |
| 一言 | 吹き出し（`data-quote="ayato"`）が**全部**場面のリンクの中に在り、リンクの動画と秒が、その一言を持つ facts の行の `t` と同じ。チャットが出どころの行（`via`）の字は引かない。吹き出しの外に本人の一言を「」で置かない | facts |
| 口調 | 案内鳥の字（一言・配信の題を除いた本文と、`<title>`・`description`）に、説明口調の語と画面の仕組みの説明が0 | `docs/guide-design.md` 5-1・CLAUDE.md「画面で、システムの仕様を説明しない」 |
| 節の一言 | 本人の一言は**節（`<section>`）に1つまで** | `docs/island-misses.md` #323 の決めごと2 |
| 場面 | 行った人の話（`data-went`）は場面のリンクを**1つだけ**持つ（値段の表の行・測った値の始まりと終わりは数えない）。外の事実（`data-src`）の中に場面のリンクを置かない | #323 の決めごと2（一文ごとにリンクを付けない） |
| 出どころ | 外の事実（`data-src`）が、出どころのリンク（https・YouTube 以外）と見た日（`<time datetime>`）を持つ | `docs/country-guide.md` 1-2・#323 の決めごと1 |
| 数 | 窓の数がソフィアの面の数以上（やりたいこと8・見たいもの22・食べたいもの23）。やりたいことの札の絵は全部 `do-<id>` の描いた絵。外す面は無い（下限より前に作ったスコピエも 2026-11-20 に届いた） | #1228（2026-11-19 あやと「ソフィアに比べて全体にしょぼい」「描いた絵と写真が混ざっている」）・`/city-guide` の下限 |

## 2026-11-14 に足した3本（節の一言・場面・出どころ）

最初のスコピエの面は「どの一文も配信へ辿れる」を面の形にしてしまい、場面のリンクが210本・一言が45個並んだ
（#323）。前の見張りは「一言は場面のリンクの中に在るか」だけを見ていて、**一言とリンクが多すぎること**は
見ていなかった——むしろ「リンクの無い行」を赤くする側だった。いまは逆に、骨組み（外の事実）には出どころを、
肉付け（行った話）には場面を1つだけ、を見る。

## なぜ書き出した HTML を見るか

焼く道具（街は `python/guidebook_bake.py`、記事は `python/guide_article.py`）も焼く前に同じことを止めている。
それでも**面に出たもの**を見る理由は2つ。

1. **面は焼いたものだけでできていない。** 部品の名札（「この場面」「行った」）・表の合計の行・出どころの行は
   部品（`site/components/guidebook/`）が持つ。焼く道具はそこを見ない
2. **秒を写したあとで、部品が別の秒を出しうる。** 場面のリンクを組むのは部品（`Videos.tsx` の `watch`）で、
   焼いたものの `t` と面の `&t=` は別の場所で決まる。同じであることは、面を見ないと分からない

## 2026-11-15 に、ガイドブック型の面（`components/guidebook/`）へ当てた

スコピエの面は、前のハブ（`components/travel/Guide.tsx`・`article.tg`）からガイドブック型（`article.gb`）へ移った。
目印は同じものを部品に持たせてある——骨組みの入れ物は `data-src`（`parts.tsx` の `Ext`）、行った箱は `data-went`
（`Videos.tsx` の `WentBox`）、一言は場面の札の中の `data-quote="ayato"`、動画の題は `data-quote="title"`。
足したのは2つ。

- **合計の額**: 「あやとの1日」の表は、内訳（facts の行の額）の下に日ごとの合計を出す。合計そのものは facts に無いので、
  同じ表・同じ行に並んだ確かめの済んだ額の、2〜4個の足し算に当たるときだけ通す（`summed`）。足し算に当たらない合計は落ちる
- **外の出どころの表**: `data-src` の中の表（乗り物の目安など）は、場面の表として突き合わせない（出どころが正）

材料（`python/data/guide/<国>/<街>/guidebook.json`）のある街を見る。前のハブの台本（`<国>/<街>.json`）では探さない。

## 足のつかまえかた

- 本文は `<article class="tg">`（記事）か `<article class="gb">`（街のガイドブック）の中だけ（島の枠——看板・足元——は全部の面に共通なので、ここでは見ない）
- 場面のリンクは `https://www.youtube.com/watch?v=<id>&t=<秒>s`（`scene.ts`）
- 額は `guide_facts.money_in`（字幕を読む道具と同じ単位の表 `python/data/guide/cities.json`）で拾う。
  外の出どころの行（`.tg-ext`）の額は、その出どころが正なので facts とは突き合わせない

対照は `python/guide_watch_selftest.py`（足を1本ずつ抜いて、その足だけが赤くなるか）。
"""

from __future__ import annotations

import argparse
import html
import itertools
import json
import re
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_facts as gf  # noqa: E402  facts の読みかた・単位の表は、束ねる道具と同じものを使う

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "python/data/guide"

WATCH = re.compile(r"^https://www\.youtube\.com/watch\?v=([\w-]+)&t=(\d+)s$")

# 説明口調（5-1）。**案内鳥の字だけ**を見る（本人の一言は字幕のまま、配信の題はそのまま出す決まり）
TONE = re.compile(
    r"できます|できません|なっています|なっております|おすすめ|オススメ|お勧め|お薦め|"
    r"ください|しましょう|でしょう|ご紹介|紹介します|いかが|ご覧"
)
# 画面の仕組みの説明（CLAUDE.md・5-1 の「書かない」の3例と、その言い換え）
MECH = re.compile(
    r"配信から抜|抜き出し|自動で|機械で|規則で|確かめが要る|確かめてから|"
    r"出していません|載せていません|出しません|載せません|表示して|表示しま|"
    r"この面|このページ|本ページ|当ページ|文字起こし|字幕から|facts|verify"
)

# 要素の境目に挟む字。空白にすると `money_in` の「数\s*単位」が境目をまたいで読む
SEP = "|"

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

# 抜いて対照を当てる（`guide_watch_selftest.py`）。本物の動きでは全部 False
BREAK: set[str] = set()


# ---------------------------------------------------------------- HTML を木に

@dataclass
class Node:
    tag: str
    attrs: dict
    parent: "Node | None" = None
    kids: list = field(default_factory=list)   # Node か str

    def cls(self) -> set[str]:
        return set((self.attrs.get("class") or "").split())

    def text(self, skip=lambda n: False, sep: str = "") -> str:
        """中の字。`sep` は要素の境目に挟む字（表の「1:12:40」と次の行の「円は」を、くっつけて「40円」と読まない）"""
        out = []
        for k in self.kids:
            if isinstance(k, str):
                out.append(k)
            elif not skip(k):
                out.append(sep + k.text(skip, sep) + sep)
        return "".join(out)

    def walk(self):
        for k in self.kids:
            if isinstance(k, Node):
                yield k
                yield from k.walk()

    def up(self):
        n = self.parent
        while n is not None:
            yield n
            n = n.parent


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {})
        self.cur = self.root
        self.head: dict[str, str] = {}
        self._title = False

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "meta" and a.get("name") == "description":
            self.head["description"] = a.get("content", "")
        if tag == "title":
            self._title = True
        n = Node(tag, a, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.cur.tag == tag:
            self.cur = self.cur.parent or self.root

    def handle_endtag(self, tag):
        if tag == "title":
            self._title = False
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        if self._title:
            self.head["title"] = self.head.get("title", "") + data
        self.cur.kids.append(data)


def parse(text: str) -> tuple[Node | None, dict]:
    t = Tree()
    t.feed(text)
    t.close()
    art = next((n for n in t.root.walk() if n.tag == "article" and n.cls() & {"tg", "gb"}), None)
    return art, t.head


def scene_of(a: Node) -> tuple[str, int] | None:
    m = WATCH.match(html.unescape(a.attrs.get("href", "")))
    return (m.group(1), int(m.group(2))) if m else None


def is_quote(n: Node) -> bool:
    """本人の一言（字幕の字のまま）"""
    return n.attrs.get("data-quote") == "ayato"


def is_src(n: Node) -> bool:
    """外の出どころの事実（骨組み）"""
    return "data-src" in n.attrs or "tg-ext" in n.cls()


def is_went(n: Node) -> bool:
    """行った人の話（肉付け）"""
    return "data-went" in n.attrs


def verbatim(n: Node) -> bool:
    """配信の題（そのまま出す。island-design 1章の例外）。埋め込みの題と、配信の一覧"""
    return n.attrs.get("data-quote") == "title" or "tg-vids" in n.cls()


# ---------------------------------------------------------------- facts

def rows_of(country: str, city: str, streams: Path) -> list[dict]:
    """その街の facts の行。焼く道具（`guide_bake.Baker._index`）と同じ拾いかた"""
    out = []
    for p in gf.find_files(streams, [], None):
        d = gf.head_of(p)
        if d.get("country") != country or d.get("city") != city:
            continue
        for it in d["items"]:
            out.append({"v": d["video_id"], "t": it["t"], "it": it,
                        "hold": "verify" if it.get("verify") else ("chat" if it.get("via") else None)})
    return out


def amounts_of(x: dict, units: dict) -> set[tuple[str, str]]:
    """その行が持つ額（`amounts` と、字・一言の中の額）"""
    it = x["it"]
    out = set()
    for a in it.get("amounts") or []:
        v = gf.as_num(a.get("value"))
        if v and a.get("unit"):
            out.add((v, units.get(gf.norm(a["unit"]).casefold(), a["unit"])))
    for s in (it.get("text") or "", it.get("quote") or "", it.get("what") or ""):
        out |= set(gf.money_in(s, units))
    return out


# ---------------------------------------------------------------- 見る

@dataclass
class Report:
    key: str
    errors: list[str] = field(default_factory=list)
    seen: dict[str, int] = field(default_factory=lambda: {"額": 0, "表の行": 0, "一言": 0, "話": 0, "外の事実": 0, "場面": 0, "字": 0})

    def ng(self, leg: str, msg: str) -> None:
        self.errors.append(f"[{leg}] {msg}")


#: 合計を探す入れ物。合計とその内訳が並ぶ所（表・表の行・札・段落）
SUM_BLOCKS = {"table", "tr", "li", "p", "a", "dd"}


def summed(art: Node, v: str, u: str, ready: set[tuple[str, str]], units: dict, skip) -> bool:
    """`v` `u` が、同じ入れ物に並んだ確かめの済んだ額（2〜4個）の足し算か。**合計は言っていない数ではない**"""
    if "sum" in BREAK:
        return False
    for n in art.walk():
        if n.tag not in SUM_BLOCKS or skip(n) or any(skip(p) for p in n.up()):
            continue
        found = set(gf.money_in(n.text(skip=skip, sep=SEP), units))
        if (v, u) not in found:
            continue
        parts = [float(x) for x, uu in found if uu == u and (x, uu) in ready and x != v]
        for k in range(2, min(4, len(parts)) + 1):
            if any(abs(sum(c) - float(v)) < 0.5 for c in itertools.combinations(parts, k)):
                return True
    return False


def check_money(art: Node, rows: list[dict], units: dict, r: Report, outside: set[tuple[str, str]] | None = None) -> None:
    """`outside` は、行く前の街の材料の外の事実（出どころつきの字）に在る額。行く前の街は facts が無いので、
    要約の札（「1回3〜5レイ」）のように出どころの印の無い所に出た額は、材料の外の事実と突き合わせる"""
    ready: set[tuple[str, str]] = set(outside or ())
    held: set[tuple[str, str]] = set()
    for x in rows:
        hold = x["hold"] if "verify" not in BREAK else None
        (held if hold else ready).update(amounts_of(x, units))

    def ext(n: Node) -> bool:
        # 外の出どころの事実は、その出どころが正（facts と突き合わせない）。配信の題は、題のまま
        return is_src(n) or verbatim(n)

    # 1. 面のどこに出た額も、確かめの要らない行に在る
    body = art.text(skip=ext, sep=SEP)
    for v, u in gf.money_in(body, units):
        r.seen["額"] += 1
        if (v, u) in ready or summed(art, v, u, ready, units, ext):
            continue
        if (v, u) in held:
            r.ng("額", f"{v}{u} は確かめが要る行（verify）・チャットの行にしか無い")
        elif "unbacked" not in BREAK:
            r.ng("額", f"{v}{u} が facts のどの行にも無い")

    # 2. 値段の表と料理の額は、その行の場面の facts の行と同じ額
    if "row" in BREAK:
        return
    at = {}
    for x in rows:
        at.setdefault((x["v"], x["t"]), []).append(x)
    cells: list[tuple[str, Node]] = []
    for n in art.walk():
        # 外の出どころの表（乗り物の目安など）は、出どころが正。場面の表として突き合わせない
        if ext(n) or any(ext(p) for p in n.up()):
            continue
        if n.tag == "tr" and n.parent is not None and n.parent.tag == "tbody":
            td = [k for k in n.kids if isinstance(k, Node) and k.tag == "td"]
            if len(td) >= 2:
                cells.append((td[0].text(), n))
        elif "tg-dish-price" in n.cls():
            b = next((k for k in n.kids if isinstance(k, Node) and k.tag == "b"), None)
            if b is not None:
                cells.append((b.text(), n))
    for amt, holder in cells:
        r.seen["表の行"] += 1
        link = next((a for a in holder.walk() if a.tag == "a" and scene_of(a)), None)
        shown = set(gf.money_in(amt, units))
        if not shown:
            continue
        if link is None:
            r.ng("額", f"表の額「{amt.strip()}」に場面のリンクが無い")
            continue
        v, t = scene_of(link)
        here = at.get((v, t), [])
        ok = [x for x in here if not x["hold"] and shown <= amounts_of(x, units)]
        if ok:
            continue
        if any(shown <= amounts_of(x, units) for x in here):
            r.ng("額", f"表の額「{amt.strip()}」（{v} {t}秒）は確かめが要る行の額")
        else:
            r.ng("額", f"表の額「{amt.strip()}」が、その場面（{v} {t}秒）の facts の行の額と合わない")


def check_quotes(art: Node, rows: list[dict], r: Report) -> None:
    by_q: dict[str, list[dict]] = {}
    for x in rows:
        q = x["it"].get("quote")
        if q:
            by_q.setdefault(q, []).append(x)
    for n in art.walk():
        if not is_quote(n):
            continue
        r.seen["一言"] += 1
        q = n.text().strip()
        a = next((p for p in n.up() if p.tag == "a"), None)
        sc = scene_of(a) if a is not None else None
        if sc is None and "nolink" not in BREAK:
            r.ng("一言", f"「{q}」に場面のリンクが無い")
            continue
        hits = by_q.get(q, [])
        if not hits:
            r.ng("一言", f"「{q}」が facts のどの一言とも字が違う（字幕の字のまま、が決まり）")
            continue
        if sc is None:
            continue
        v, t = sc
        same = [x for x in hits if x["v"] == v and (x["t"] == t or "sec" in BREAK)]
        if not same:
            want = "・".join(f"{x['v']} {x['t']}秒" for x in hits)
            r.ng("一言", f"「{q}」のリンクが {v} {t}秒。facts の行は {want}")
            continue
        if all(x["hold"] == "chat" for x in same) and "chat" not in BREAK:
            r.ng("一言", f"「{q}」はチャットが出どころの行（本人が言ったことにしない）")

    # 吹き出しの外に、本人の一言を「」で置かない（リンクの無い一言になる）
    if "bare" in BREAK:
        return
    known = {gf.squash(q): q for q in by_q if len(gf.squash(q)) >= 4}
    for n in art.walk():
        if n.tag not in ("p", "li", "td", "dd", "span", "h3") or is_quote(n):
            continue
        own = "".join(k for k in n.kids if isinstance(k, str))
        for m in re.finditer(r"「([^「」]{2,})」", own):
            s = gf.squash(m.group(1))
            if s in known:
                r.ng("一言", f"「{m.group(1)}」が吹き出しの外に在る（場面のリンクが無い）")



def check_sections(art: Node, r: Report) -> None:
    """節の一言は1つまで・行った話の場面は1つ・外の事実には出どころ（#323）"""
    r.seen["場面"] = sum(1 for a in art.walk() if a.tag == "a" and scene_of(a))
    if "many" not in BREAK:
        for sec in (n for n in art.walk() if n.tag == "section"):
            qs = [n for n in sec.walk() if is_quote(n)]
            if len(qs) > 1:
                r.ng("節の一言", f"節「{sec.attrs.get('id', '?')}」に本人の一言が{len(qs)}つ（1つまで）: "
                     + "／".join(n.text().strip()[:12] for n in qs[:3]))

    def counted(a: Node, box: Node) -> bool:
        # 値段の表の行（何をいくらで買ったかの証拠）と、測った値の始まり・終わりは数えない
        for p in a.up():
            if p is box:
                return True
            if p.tag == "table" or "tg-meas" in p.cls():
                return False
        return True

    for n in art.walk():
        if is_went(n):
            r.seen["話"] += 1
            links = [a for a in n.walk() if a.tag == "a" and scene_of(a) and counted(a, n)]
            if len(links) > 1 and "perline" not in BREAK:
                r.ng("場面", f"行った話に場面のリンクが{len(links)}本（話1つに1本）: …{n.text()[:24]}…")
            elif not links and "wentlink" not in BREAK:
                r.ng("場面", f"行った話に場面のリンクが無い: …{n.text()[:24]}…")
        elif is_src(n) and not any(is_src(p) for p in n.up()):
            r.seen["外の事実"] += 1
            if "extscene" not in BREAK and any(a.tag == "a" and scene_of(a) for a in n.walk()):
                r.ng("場面", f"外の事実の中に配信の場面のリンク: …{n.text()[:24]}…")
            if "nosrc" in BREAK:
                continue
            src = [a for a in n.walk() if a.tag == "a" and a.attrs.get("href", "").startswith("https://")
                   and "youtube.com" not in a.attrs.get("href", "")]
            seen = [x for x in n.walk() if x.tag == "time" and re.match(r"^\d{4}-\d\d-\d\d$", x.attrs.get("datetime", ""))]
            if not src or not seen:
                r.ng("出どころ", f"外の事実に{'出どころのリンク' if not src else '見た日'}が無い: …{n.text()[:24]}…")

def check_tone(art: Node, head: dict, r: Report) -> None:
    def skip(n: Node) -> bool:
        # 本人の一言と配信の題は、案内鳥の字ではない
        return (is_quote(n) or verbatim(n)) and "scope" not in BREAK

    parts = [("本文", art.text(skip=skip, sep=SEP)), ("題", head.get("title", "")), ("description", head.get("description", ""))]
    for where, s in parts:
        r.seen["字"] += len(s.replace(SEP, ""))
        if "tone" not in BREAK:
            for m in sorted({m.group() for m in TONE.finditer(s)}):
                r.ng("口調", f"{where}に説明口調「{m}」: …{around(s, m)}…")
        if "mech" not in BREAK:
            for m in sorted({m.group() for m in MECH.finditer(s)}):
                r.ng("口調", f"{where}に画面の仕組みの説明「{m}」: …{around(s, m)}…")


def around(s: str, w: str, n: int = 18) -> str:
    i = s.find(w)
    return re.sub(r"\s+", " ", s[max(0, i - n): i + len(w) + n])


# ---------------------------------------------------------------- 数の下限（2026-11-19）
#
# ソフィアの面の数を、次の街からの下限にする。行く前のブカレストを「やりたいこと3・見たいもの1」で出して、
# あやとに「ソフィアに比べて全体にしょぼい」「描いた絵と写真が混ざっている」と言われた（#1228）。
# 材料の検査（`guide_book_check.py`）は材料しか見ないので、写真が揃わずに面から落ちた札・描けていない札は数えられない。
# だから**書き出した面の札**を数える。数は本番のソフィア（2026-11-19）: やりたいこと8・見たいもの22・食べたいもの23
FLOOR = {"do": 8, "see": 22, "eat": 23}
FLOOR_NAME = {"do": "やりたいこと", "see": "見たいもの", "eat": "食べたいもの"}
# 外す面は置かない。下限より前に作ったスコピエを、まだ届いていない足だけ外していた（`FLOOR_BEFORE`）が、
# 2026-11-20 にやりたいこと8枚を描いた絵にし、食べたいものを23品にして届いたので、外す仕組みごと消した。
# 新しい街を下限の前で出すときも、外さずに届くまで出さない（`/city-guide` 2-5b）


def check_floor(art: Node, key: str, r: Report) -> dict[str, int]:
    """札の数と、やりたいことの札の絵が全部描いた絵（`/guide/<国>/<街>/do-<id>-*.webp`）か。

    札の数は窓（`<dialog id="do-…">` など）で数える。写真の無い見たいものは面から落ちる（`dress` のあと絞る）ので、
    材料の数ではなく窓の数がいま見えている札の数。絵は札（`a.gb-todo-card`）の `<img src>` で見る——描いた絵は
    manifest から `do-<id>` の名前で入り、借りた写真は `photos/` の下から入る
    """
    n = {k: 0 for k in FLOOR}
    for d in art.walk():
        if d.tag == "dialog":
            head = (d.attrs.get("id") or "").split("-", 1)[0]
            if head in n:
                n[head] += 1
    for k, low in FLOOR.items():
        if n[k] < low and "floor" not in BREAK:
            r.ng("数", f"{FLOOR_NAME[k]}が {n[k]}（下限 {low}。ソフィアの面の数）")
    drawn = re.compile(rf"^/guide/{re.escape(key)}/do-([a-z0-9-]+)-\d+\.webp$")
    cards = [a for a in art.walk() if a.tag == "a" and "gb-todo-card" in a.cls()]
    for a in cards:
        want = (a.attrs.get("href") or "").removeprefix("#do-")
        img = next((i for i in a.walk() if i.tag == "img"), None)
        m = drawn.match((img.attrs.get("src") or "") if img else "")
        if (m is None or m.group(1) != want) and "drawn" not in BREAK:
            got = img.attrs.get("src") if img else "絵が無い"
            r.ng("数", f"やりたいこと「{want}」の札が描いた絵ではない（{got}）")
    if len(cards) != n["do"] and "drawn" not in BREAK:
        r.ng("数", f"やりたいことの札 {len(cards)}枚と窓 {n['do']}つが合わない（札の形が変わって数えられていない）")
    return n


def check_page(key: str, page: str, rows: list[dict], units: dict, outside: set[tuple[str, str]] | None = None) -> Report | None:
    """1枚ぶん。本文（`article.tg`）が無ければ None（数えるものが無い）"""
    art, head = parse(page)
    if art is None:
        if "blind" not in BREAK:
            return None
        art = Node("article", {"class": "tg"})
    r = Report(key)
    check_money(art, rows, units, r, outside)
    check_quotes(art, rows, r)
    check_sections(art, r)
    check_tone(art, head, r)
    return r


# ---------------------------------------------------------------- 回す

def keys(scripts: Path = SCRIPTS) -> list[str]:
    """材料（`<国>/<街>/guidebook.json`）のある街。**前のハブの台本（`<国>/<街>.json`）では探さない**——面はもう焼いていない"""
    return sorted(f"{p.parent.parent.name}/{p.parent.name}" for p in scripts.glob("*/*/guidebook.json"))


def outside_amounts(key: str, units: dict, scripts: Path = SCRIPTS) -> set[tuple[str, str]]:
    """材料の外の事実（`src` を持つ入れ物の `text`）に在る額。**出どころの無い字の額は数えない**"""
    out: set[tuple[str, str]] = set()

    def walk(x):
        if isinstance(x, dict):
            if x.get("src") and isinstance(x.get("text"), str):
                out.update(gf.money_in(x["text"], units))
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    try:
        walk(json.loads((scripts / key / "guidebook.json").read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    return out


def pre_trip(key: str, scripts: Path = SCRIPTS) -> bool:
    """材料が「行く前の街」の印（`city.pre_trip`）を持つか。材料が読めなければ False（行った街として厳しく見る）"""
    p = scripts / key / "guidebook.json"
    try:
        return bool(json.loads(p.read_text(encoding="utf-8"))["city"].get("pre_trip"))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def page_path(dist: Path, key: str) -> Path | None:
    for p in (dist / "travel" / f"{key}.html", dist / "travel" / key / "index.html"):
        if p.exists():
            return p
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", nargs="*", help="<国>/<街>（無ければ材料のある街を全部）")
    ap.add_argument("--dist", required=True, help="書き出した置き場（site/.next-3130 など）")
    ap.add_argument("--streams", default=str(ROOT / "streams"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    dist = Path(a.dist)
    ks = a.key or keys()
    if not ks:
        print("::error::材料（python/data/guide/<国>/<街>/guidebook.json）が1本も無い。見るものが無い")
        return 2
    table = gf.load_table(ROOT / "python/data/guide/cities.json")
    bad = 0
    out = []
    for k in ks:
        country, city = k.split("/")
        p = page_path(dist, k)
        if p is None:
            print(f"::error::{k}: 書き出した面が {dist}/travel/{k}.html に無い（先に tools/build.sh）")
            return 2
        rows = rows_of(country, city, Path(a.streams))
        # 行く前の街（材料の city.pre_trip。#1292）は facts がまだ無いのが正しい。「行った」の突き合わせは飛ばし、
        # 口調と節は見る。**行った街なのに facts が無いのは、読む道具が置き場を見失ったときなので 2 のまま**
        pre = pre_trip(k)
        if not rows and not pre:
            print(f"::error::{k}: facts の行が1つも無い。突き合わせる相手が無い")
            return 2
        units = gf.money_units(table, country)
        text = p.read_text(encoding="utf-8")
        r = check_page(k, text, rows, units, outside_amounts(k, units) if pre else None)
        if r is None or not r.seen["字"] or (not pre and not r.seen["一言"]):
            print(f"::error::{k}: 面の本文（article.tg / article.gb）か一言が読めない。見るものが無い")
            return 2
        n = check_floor(parse(text)[0], k, r)
        print(f"  {k}: 札の数 " + "・".join(f"{FLOOR_NAME[x]}{n[x]}（下限{FLOOR[x]}）" for x in FLOOR))
        if pre:
            print(f"  {k}: 行く前の街（材料の city.pre_trip）。facts が {len(rows)}行なので、「行った」の突き合わせは飛ばした")
            if r.seen["一言"]:
                r.errors.append(f"行く前の街なのに、あやとの一言が {r.seen['一言']}つある（行っていない街で「言った」にしない）")
        seen = "・".join(f"{n}{c}" for n, c in r.seen.items())
        out.append({"key": k, "errors": r.errors, "seen": r.seen})
        if r.errors:
            bad += 1
            print(f"✕ {k}（{seen}）: {len(r.errors)}件")
            for e in r.errors:
                print(f"  - {e}")
        else:
            print(f"○ {k}（{seen}）: 額・一言・口調とも0件")
    if a.json:
        print(json.dumps(out, ensure_ascii=False))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
