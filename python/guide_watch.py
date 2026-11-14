"""**街のガイドの面を、書き出した HTML で見る。** 出す前の見張り3本（`docs/guide-design.md` 8章）。

    python3 python/guide_watch.py --dist site/.next-3130                          # 台本のある街を全部
    python3 python/guide_watch.py --dist site/.next-3130 north-macedonia/skopje   # 1つだけ

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（台本が0本・面の本文が読めない。
`docs/island-standards.md` §15。「0件だったので通りました」とは言わない）。

## 何を見るか

| 足 | 見ること | 正 |
| --- | --- | --- |
| 額 | 面に出た額（円・デナール・ユーロ…）が、`verify` の無い facts の行に在る。値段の表と料理の額は、**その行の場面（動画と秒）の facts の行の額**と同じ | facts（`streams/**/*.facts.json`） |
| 一言 | 吹き出し（`data-quote="ayato"`）が**全部**場面のリンクの中に在り、リンクの動画と秒が、その一言を持つ facts の行の `t` と同じ。チャットが出どころの行（`via`）の字は引かない。吹き出しの外に本人の一言を「」で置かない | facts |
| 口調 | 案内鳥の字（一言・配信の題を除いた本文と、`<title>`・`description`）に、説明口調の語と画面の仕組みの説明が0 | `docs/guide-design.md` 5-1・CLAUDE.md「画面で、システムの仕様を説明しない」 |
| 節の一言 | 本人の一言は**節（`<section>`）に1つまで** | `docs/island-misses.md` #323 の決めごと2 |
| 場面 | 行った人の話（`data-went`）は場面のリンクを**1つだけ**持つ（値段の表の行・測った値の始まりと終わりは数えない）。外の事実（`data-src`）の中に場面のリンクを置かない | #323 の決めごと2（一文ごとにリンクを付けない） |
| 出どころ | 外の事実（`data-src`）が、出どころのリンク（https・YouTube 以外）と見た日（`<time datetime>`）を持つ | `docs/country-guide.md` 1-2・#323 の決めごと1 |

## 2026-11-14 に足した3本（節の一言・場面・出どころ）

最初のスコピエの面は「どの一文も配信へ辿れる」を面の形にしてしまい、場面のリンクが210本・一言が45個並んだ
（#323）。前の見張りは「一言は場面のリンクの中に在るか」だけを見ていて、**一言とリンクが多すぎること**は
見ていなかった——むしろ「リンクの無い行」を赤くする側だった。いまは逆に、骨組み（外の事実）には出どころを、
肉付け（行った話）には場面を1つだけ、を見る。

## なぜ書き出した HTML を見るか

`python/guide_bake.py` も焼く前に同じことを止めている。それでも**面に出たもの**を見る理由は2つ。

1. **面は焼いたものだけでできていない。** 部品の名札（「この場面」「行った」）・表の下の1行・書き手の枠は
   `site/components/travel/Guide.tsx` が持つ。焼く道具はそこを見ない
2. **秒を写したあとで、部品が別の秒を出しうる。** 吹き出しのリンクを組むのは `scene.ts` の `watchUrl` で、
   焼いたものの `t` と面の `&t=` は別の場所で決まる。同じであることは、面を見ないと分からない

## 足のつかまえかた

- 本文は `<article class="tg">` の中だけ（島の枠——看板・足元——は全部の面に共通なので、ここでは見ない）
- 場面のリンクは `https://www.youtube.com/watch?v=<id>&t=<秒>s`（`scene.ts`）
- 額は `guide_facts.money_in`（字幕を読む道具と同じ単位の表 `python/data/guide/cities.json`）で拾う。
  外の出どころの行（`.tg-ext`）の額は、その出どころが正なので facts とは突き合わせない

対照は `python/guide_watch_selftest.py`（足を1本ずつ抜いて、その足だけが赤くなるか）。
"""

from __future__ import annotations

import argparse
import html
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
    art = next((n for n in t.root.walk() if n.tag == "article" and "tg" in n.cls()), None)
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


def check_money(art: Node, rows: list[dict], units: dict, r: Report) -> None:
    ready: set[tuple[str, str]] = set()
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
        if (v, u) in ready:
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


def check_page(key: str, page: str, rows: list[dict], units: dict) -> Report | None:
    """1枚ぶん。本文（`article.tg`）が無ければ None（数えるものが無い）"""
    art, head = parse(page)
    if art is None:
        if "blind" not in BREAK:
            return None
        art = Node("article", {"class": "tg"})
    r = Report(key)
    check_money(art, rows, units, r)
    check_quotes(art, rows, r)
    check_sections(art, r)
    check_tone(art, head, r)
    return r


# ---------------------------------------------------------------- 回す

def keys(scripts: Path = SCRIPTS) -> list[str]:
    return sorted(f"{p.parent.name}/{p.stem}" for p in scripts.glob("*/*.json"))


def page_path(dist: Path, key: str) -> Path | None:
    for p in (dist / "travel" / f"{key}.html", dist / "travel" / key / "index.html"):
        if p.exists():
            return p
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", nargs="*", help="<国>/<街>（無ければ台本のある街を全部）")
    ap.add_argument("--dist", required=True, help="書き出した置き場（site/.next-3130 など）")
    ap.add_argument("--streams", default=str(ROOT / "streams"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    dist = Path(a.dist)
    ks = a.key or keys()
    if not ks:
        print("::error::台本（python/data/guide/<国>/<街>.json）が1本も無い。見るものが無い")
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
        if not rows:
            print(f"::error::{k}: facts の行が1つも無い。突き合わせる相手が無い")
            return 2
        r = check_page(k, p.read_text(encoding="utf-8"), rows, gf.money_units(table, country))
        if r is None or not r.seen["一言"] or not r.seen["字"]:
            print(f"::error::{k}: 面の本文（article.tg）か一言が読めない。見るものが無い")
            return 2
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
