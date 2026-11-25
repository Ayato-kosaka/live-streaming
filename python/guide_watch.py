"""**街のガイドの面を、書き出した HTML で見る。** 出す前の見張り3本（`docs/guide-design.md` 8章）。

    python3 python/guide_watch.py --dist site/.next-3130                          # 材料（guidebook.json）のある街を全部
    python3 python/guide_watch.py --dist site/.next-3130 north-macedonia/skopje   # 1つだけ

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（材料が0本・面の本文が読めない。
`docs/island-standards.md` §15。「0件だったので通りました」とは言わない）。

## 何を見るか

| 足 | 見ること | 正 |
| --- | --- | --- |
| 額 | 面に出た額（円・デナール・ユーロ…）が、`verify` の無い facts の行か、**材料の出どころつきの字**に在る。値段の表と料理の額は、**その行の場面（動画と秒）の facts の行の額**と同じ。合計の額は、**同じ表・同じ行に並んだ額の足し算**か、**列の見出しに単位を書いた表の合計の行**（内訳の足し算）のときだけ通す。換算の比（「1ユーロ＝177円」）と「1円もかからない」は額ではない | facts（`streams/**/*.facts.json`）・材料（`guidebook.json`・`HAND`） |
| 一言 | 吹き出し（`data-quote="ayato"`）が**全部**場面のリンクの中に在り、リンクの動画と秒が、その一言を持つ facts の行の `t` と同じ。チャットが出どころの行（`via`）の字は引かない。吹き出しの外に本人の一言を「」で置かない | facts |
| 口調 | 案内鳥の字（一言・配信の題・外の出どころの題を除いた本文と、`<title>`・`description`）に、説明口調の語と画面の仕組みの説明が0 | `docs/guide-design.md` 5-1・CLAUDE.md「画面で、システムの仕様を説明しない」 |
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
（`Videos.tsx` の `WentBox`）、一言は場面の札の中の `data-quote="ayato"`、動画の題は `data-quote="title"`、
外の出どころの題（リンクの字）は `data-quote="src"`（`parts.tsx` の `SrcLine`・`Sources.tsx`・記事の `ExtLine` と出どころの一覧）。
足したのは2つ。

- **合計の額**: 「あやとの1日」の表は、内訳（facts の行の額）の下に日ごとの合計を出す。合計そのものは facts に無いので、
  同じ表・同じ行に並んだ確かめの済んだ額の、2〜4個の足し算に当たるときだけ通す（`summed`）。足し算に当たらない合計は落ちる
- **外の出どころの表**: `data-src` の中の表（乗り物の目安など）は、場面の表として突き合わせない（出どころが正）

材料（`python/data/guide/<国>/<街>/guidebook.json`）のある街を見る。前のハブの台本（`<国>/<街>.json`）では探さない。

## 足のつかまえかた

- 本文は `<article class="tg">`（記事）か `<article class="gb">`（街のガイドブック）の中だけ（島の枠——看板・足元——は全部の面に共通なので、ここでは見ない）
- 場面のリンクは `https://www.youtube.com/watch?v=<id>&t=<秒>s`（`scene.ts`）
- 額は `guide_facts.money_in`（字幕を読む道具と同じ単位の表 `python/data/guide/cities.json`）で拾う。
  外の出どころの行（`.tg-ext`）の額は、その出どころが正なので facts とは突き合わせない。
  外の出どころの題（`data-quote="src"` のリンクの字）の中の額も読まない（下の「外の出どころの題を口調から外した」と同じ理由）

## 2026-11-23 に、外の出どころの題を口調から外した

ベオグラードの面（#1365）が「本文に説明口調『おすすめ』」で赤くなった。出どころは案内鳥の字ではなく、
出どころのリンクの字——NEWT「セルビア・ベオグラード旅行におすすめの観光地11選！」と、地球の歩き方「セルビアのおすすめ観光スポット10選！…」。
他人の記事の題をそのまま引いたもので、配信の題と同じ扱いが正しい。飛ばすのは**印（`data-quote="src"`）の付いた外へのリンクの字だけ**。
同じ外の事実の箱（`data-src`）の中でも、案内鳥が書いた地の文は今までどおり全部読む（箱ごと飛ばすと、地の文の「おすすめ」が素通りする。
`mutation_drill.py` の当て先）。赤の1行が NEWT だけだったのは、口調の赤を**語ごとに1行**にまとめ、最初に出た所だけを添えていたから
（地球の歩き方の題も同じ1行に畳まれていた。VELTRA の題は材料の中だけで、面には出ていない）。いまは何か所あったかも添える。

## 2026-11-24 に、外の出どころの題を額からも外した

イスタンブールの面が「20リラ が facts のどの行にも無い」で赤くなった。拾ったのは出どころの一覧に並んだ
sol haber「İstanbullunun ulaşım masrafına yeni zam: Tam bilet 46,20 TL」——トルコの記事の題で、小数のカンマで切れた
「20 TL」を額と読んでいた。口調の見張りは 11-23 から題を飛ばしていたが、額の見張りは飛ばしていなかった。
出どころの一覧は外の事実の箱（`data-src`）の外に並ぶので、箱で飛ばす守りにも掛からない。
飛ばすのは口調と同じ**印の付いた外へのリンクの字だけ**で、箱の外にある案内鳥とあやとの字の額は、今までどおり facts と突き合わせる。

## 2026-11-24 に、最初に手で組んだ街（ソフィア）の形を読めるようにした

ソフィアを名指しで当てると、正しい額が36件落ちた。ソフィアは guidebook.json を持たない（焼く道に乗る前に手で組んだ）ので
`keys()` に入らず、名指ししない限り一度も見張られていなかった。落ちかたは4つの形で、どれも面ではなく見張りが読めていなかった。

- **出どころつきの材料の額（32件）。** 札の下の行・値段の印・まとめの札・空港の案内・安く済ませるコツの額は、ソフィアの
  調べた事実（`python/data/bulgaria/facts.json`。`build_bulgaria.py` が焼く）にある。前は材料の額を「行く前の街」の
  guidebook.json の `text` からしか読まなかった。いまは**行った街でも**材料の額を通し、手で組んだ街の材料は `HAND` に名指しする。
  facts.json は欄の名前が品ごとに違う（料理の `price`・基本の `body`・数の札の `n` `unit` `cap`）ので、`src` を持つ入れ物の字の欄を全部読む。
  **`src` の無い入れ物の字（`lead`・`rate_note`）の額は、今までどおり数えない**
- **予算の合計（2件）。** まとめの札の「約36ユーロ〜」「約6,400円〜」は、別の入れ物の「1日の予算」の表の合計の行。表のマスに
  単位が無い（列の見出しが「ユーロ」「円」）ので、`summed` は内訳を読めなかった。いまは列の見出しの単位でマスを読み、合計の行が
  **内訳の足し算**（ユーロの列）か、**その足し算を表に書いた換算の比で直したもの**（円の列。円のマスは丸めてあるので足さない）のときだけ通す
- **換算の比（1件）。** 表の注記「1ユーロ＝177円」の 177円 は値段ではない。「1<単位>＝（は）<数><別の単位>」は額として読まない
- **言い回し（1件）。** 「1円もかからない」は額ではない。「1<単位>も」のすぐあとが打ち消しのときは読まない

対照は `python/guide_watch_selftest.py`（足を1本ずつ抜いて、その足だけが赤くなるか）。
"""

from __future__ import annotations

import argparse
import functools
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


def ext_title(n: Node) -> bool:
    """外の出どころの題（出どころのリンクの字）。他人の記事の題をそのまま引いたもの（「〜おすすめ10選」）。
    **リンクの字だけ。** 印（`data-quote="src"`）が付いていても、外（https・YouTube 以外）へのリンクでなければ案内鳥の字として読む。
    リンクを入れている行・外の事実の箱（`data-src`）は飛ばさない——中の地の文は案内鳥が書いた字"""
    href = html.unescape(n.attrs.get("href", ""))
    return (n.tag == "a" and n.attrs.get("data-quote") == "src"
            and href.startswith("https://") and "youtube.com" not in href)


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


@functools.lru_cache(maxsize=None)
def _not_money(key: tuple[tuple[str, str], ...]) -> tuple[re.Pattern, re.Pattern]:
    """額に見えて額でない2つの形。単位の言いかたは `money_in` と同じ表から（`key` は `units` を並べたもの）。

    - 換算の比「1ユーロ＝177円」「1デナールは約2.7円」——1つ目が「1」で、2つの単位が違うもの（同じ単位かは置き換えで見る）
    - 「1円もかからない」——「1<単位>も」のすぐあと（12字まで・文の終わりの前）が打ち消し"""
    alt = "|".join(re.escape(u) for u, _ in sorted(key, key=lambda x: len(x[0]), reverse=True))
    num = gf.NUM.pattern
    rate = re.compile(rf"(?<![\d.,])1\s*({alt})\s*(?:=|は)\s*約?\s*({num})\s*({alt})", re.I)
    nil = re.compile(rf"(?<![\d.,])1\s*(?:{alt})\s*も(?=[^。|]{{0,12}}?(?:ない|なかっ|ません|ず))", re.I)
    return rate, nil


def page_money(s: str, units: dict) -> list[tuple[str, str]]:
    """面の字の額（`money_in`）。換算の比と「1円もかからない」は値段ではないので、読む前に外す（2026-11-24 ソフィア）"""
    s = gf.norm(s)
    if not units:
        return []
    rate, nil = _not_money(tuple(sorted(units.items())))
    if "rate" not in BREAK:
        s = rate.sub(lambda m: SEP if units[m.group(1).casefold()] != units[m.group(3).casefold()] else m.group(), s)
    if "nil" not in BREAK:
        s = nil.sub(SEP, s)
    return gf.money_in(s, units)


def rates_in(s: str, units: dict) -> dict[tuple[str, str], float]:
    """字に書いた換算の比 {(元の単位, 直した単位): 比}。「1ユーロ＝177円」→ {("ユーロ", "円"): 177.0}"""
    if not units:
        return {}
    rate, _ = _not_money(tuple(sorted(units.items())))
    out = {}
    for m in rate.finditer(gf.norm(s)):
        a, b = units[m.group(1).casefold()], units[m.group(3).casefold()]
        if a != b:
            out[(a, b)] = float(gf.numval(m.group(2)))
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
        found = set(page_money(n.text(skip=skip, sep=SEP), units))
        if (v, u) not in found:
            continue
        parts = [float(x) for x, uu in found if uu == u and (x, uu) in ready and x != v]
        for k in range(2, min(4, len(parts)) + 1):
            if any(abs(sum(c) - float(v)) < 0.5 for c in itertools.combinations(parts, k)):
                return True
    return False


CELL = re.compile(rf"^(約)?\s*({gf.NUM.pattern})(?:\s*[〜~]\s*({gf.NUM.pattern}))?$")


def _cell(n: Node) -> tuple[float, float, bool] | None:
    """単位の無いマス（「1〜2」「約2,700」「約36〜47」）→（下, 上, 丸めたか）。数だけのマスでなければ None"""
    m = CELL.match(gf.norm(n.text()).strip())
    if not m:
        return None
    lo = float(gf.numval(m.group(2)))
    return lo, float(gf.numval(m.group(3))) if m.group(3) else lo, bool(m.group(1))


def _near(tot: tuple[float, float, bool], lo: float, hi: float) -> bool:
    """合計のマスが、足した値（下・上）と同じか。「約」の合計は、書いた桁の半分までずれてよい（約6,400 → ±50・約36 → ±0.5）"""
    steps = []
    for v in tot[:2]:
        if v and v == int(v):
            p, k = 1, int(v)
            while k % 10 == 0:
                p, k = p * 10, k // 10
            steps.append(p)
        elif v:
            steps.append(0.01)
    tol = min(steps or [1]) / 2 if tot[2] else 0.005
    return abs(tot[0] - lo) <= tol and abs(tot[1] - hi) <= tol


def column_totals(art: Node, units: dict, skip) -> set[tuple[str, str]]:
    """列の見出しに単位を書いた表（「何に｜ユーロ｜円」。ソフィアの「1日の予算」）の、合計の行（`tfoot`）の額のうち、
    内訳の足し算に当たるもの。**合計は facts に無い**ので、ほかの所（まとめの札の「約36ユーロ〜」）に出たら、これと突き合わせる。

    マスに単位が無いので、`summed` は内訳を読めない（2026-11-24）。見出しの単位でマスを読み、合計が
    （1）その列の内訳の足し算か、（2）足し算の合った列を、その表に書いた換算の比（「1ユーロ＝177円」）で直したもの、のときだけ通す。
    **丸めた内訳（「約2,700」）は足さない。** 丸めを6つ足すと合計の丸めより大きくずれる（ソフィアの円の列は内訳が 6,600、合計が 6,400。
    面は円の合計を、ユーロの合計から直して出している）"""
    out: set[tuple[str, str]] = set()
    if "budget" in BREAK:
        return out

    def kids(n: Node, tags: tuple[str, ...]) -> list[Node]:
        return [k for k in n.kids if isinstance(k, Node) and k.tag in tags]

    for t in art.walk():
        if t.tag != "table" or skip(t) or any(skip(p) for p in t.up()):
            continue
        part = {k.tag: k for k in kids(t, ("thead", "tbody", "tfoot"))}
        head = kids(part["thead"], ("tr",)) if "thead" in part else []
        foot = kids(part["tfoot"], ("tr",)) if "tfoot" in part else []
        if not head or not foot or "tbody" not in part:
            continue
        cols = {i: units[w] for i, c in enumerate(kids(head[0], ("th", "td")))
                if (w := gf.norm(c.text()).strip().casefold()) in units}
        body = [kids(tr, ("th", "td")) for tr in kids(part["tbody"], ("tr",))]
        last = kids(foot[0], ("th", "td"))
        tots, sums = {}, {}
        for i in cols:
            got = [_cell(row[i]) if i < len(row) else None for row in body]
            tot = _cell(last[i]) if i < len(last) else None
            if tot is None or not got or None in got:
                continue
            tots[i] = tot
            if not any(c[2] for c in got):
                sums[i] = (sum(c[0] for c in got), sum(c[1] for c in got))
        direct = {i for i, s in sums.items() if _near(tots[i], *s)}
        rates = rates_in(t.text(sep=SEP), units)
        conv = {j for j in set(tots) - direct
                if any((cols[i], cols[j]) in rates and _near(tots[j], *(x * rates[(cols[i], cols[j])] for x in sums[i]))
                       for i in direct)}
        for i in direct | conv:
            out |= {(gf.as_num(tots[i][0]), cols[i]), (gf.as_num(tots[i][1]), cols[i])}
    return out


def check_money(art: Node, rows: list[dict], units: dict, r: Report, outside: set[tuple[str, str]] | None = None) -> None:
    """`outside` は、材料の出どころつきの字に在る額（`outside_amounts`）。要約の札（「1回3〜5レイ」）や札の下の行
    （ソフィアの「4〜6ユーロ」）のように、出どころの印の無い所に出た額は、材料の出どころつきの字と突き合わせる。
    行く前の街は facts が無いのでこれだけが頼り。行った街も、配信で払っていない額（調べた値段）はここに在る"""
    ready: set[tuple[str, str]] = set(outside or ())
    held: set[tuple[str, str]] = set()
    for x in rows:
        hold = x["hold"] if "verify" not in BREAK else None
        (held if hold else ready).update(amounts_of(x, units))

    def ext(n: Node) -> bool:
        # 外の出どころの事実は、その出どころが正（facts と突き合わせない）。配信の題は、題のまま。
        # 外の出どころの題（リンクの字）も他人の字（口調の見張りと同じ `ext_title`）。面の終わりの出どころの一覧は
        # 外の事実の箱（`data-src`）の外に並ぶので、題の中の額（「Tam bilet 46,20 TL」）を読んでいた（2026-11-24 イスタンブール）
        return is_src(n) or verbatim(n) or (ext_title(n) and "srcamount" not in BREAK)

    # 1. 面のどこに出た額も、確かめの要らない行に在る（合計の行の額は、内訳の足し算のとき）
    body = art.text(skip=ext, sep=SEP)
    totals = column_totals(art, units, ext)
    for v, u in page_money(body, units):
        r.seen["額"] += 1
        if (v, u) in ready or (v, u) in totals or summed(art, v, u, ready, units, ext):
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
        shown = set(page_money(amt, units))
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
        if (is_quote(n) or verbatim(n)) and "scope" not in BREAK:
            return True
        # 外の出どころの題も、他人の字（2026-11-23。#1365）
        return ext_title(n) and "srctitle" not in BREAK

    parts = [("本文", art.text(skip=skip, sep=SEP)), ("題", head.get("title", "")), ("description", head.get("description", ""))]
    for where, s in parts:
        r.seen["字"] += len(s.replace(SEP, ""))
        if "tone" not in BREAK:
            for m in sorted({m.group() for m in TONE.finditer(s)}):
                r.ng("口調", f"{where}に説明口調「{m}」{times(s, m)}: …{around(s, m)}…")
        if "mech" not in BREAK:
            for m in sorted({m.group() for m in MECH.finditer(s)}):
                r.ng("口調", f"{where}に画面の仕組みの説明「{m}」{times(s, m)}: …{around(s, m)}…")


def times(s: str, w: str) -> str:
    """同じ語が何か所あったか。赤は語ごとに1行で、添えるのは最初の1か所だけなので、残りが畳まれたことを字で出す"""
    n = s.count(w)
    return f"（{n}か所。最初の1か所）" if n > 1 else ""


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
    """材料（`<国>/<街>/guidebook.json`）のある街と、手で組んだ街（`HAND`。名指ししないと見張られなかった）。**前のハブの台本（`<国>/<街>.json`）では探さない**——面はもう焼いていない"""
    return sorted({f"{p.parent.parent.name}/{p.parent.name}" for p in scripts.glob("*/*/guidebook.json")} | set(HAND))


#: 手で組んだ街（guidebook.json を持たない街）の、出どころつきの材料。ソフィアは焼く道（guidebook.json）に乗る前に
#: 手で組んだ街で、調べた事実は `python/data/bulgaria/facts.json`（`build_bulgaria.py` が `content/bulgaria.ts` に焼き、
#: `content/guidebook/bulgaria-sofia.ts` が面に組む）。写真の材料も同じく名指ししている（`guide_photos.PLACES`）
HAND: dict[str, list[str]] = {"bulgaria/sofia": ["python/data/bulgaria/facts.json"]}


def material_amounts(x, units: dict) -> set[tuple[str, str]]:
    """材料の出どころつきの字（`src` を持つ入れ物の、字の欄）に在る額。**出どころの無い入れ物の字の額は数えない**。

    街の材料（guidebook.json）の外の事実は `{"text", "src"}`。手で組んだソフィアの facts.json は欄の名前が品ごとに違う
    （料理の `price`・基本の `body`・数の札の `n` と `unit`）ので、入れ物の字の欄を全部読む。出どころの道（`src` `feesrc`・https）は読まない"""
    out: set[tuple[str, str]] = set()
    if isinstance(x, dict):
        if x.get("src"):
            if "material" in BREAK:
                texts = [x.get("text")]
            else:
                texts = [v for k, v in x.items() if isinstance(v, str) and not k.endswith("src") and not v.startswith("http")]
                if isinstance(x.get("n"), (str, int, float)) and isinstance(x.get("unit"), str):
                    texts.append(f"{x['n']}{x['unit']}")
            for s in texts:
                if isinstance(s, str):
                    out.update(gf.money_in(s, units))
        for v in x.values():
            out |= material_amounts(v, units)
    elif isinstance(x, list):
        for v in x:
            out |= material_amounts(v, units)
    return out


def outside_amounts(key: str, units: dict, scripts: Path = SCRIPTS) -> set[tuple[str, str]]:
    """材料（街の guidebook.json と、手で組んだ街の `HAND`）の出どころつきの字に在る額"""
    paths = [scripts / key / "guidebook.json"] + ([ROOT / p for p in HAND.get(key, [])] if "hand" not in BREAK else [])
    out: set[tuple[str, str]] = set()
    for p in paths:
        try:
            out |= material_amounts(json.loads(p.read_text(encoding="utf-8")), units)
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
        lost = [x for x in HAND.get(k, []) if not (ROOT / x).exists()]
        if lost:
            print(f"::error::{k}: 手で組んだ街の材料（{'・'.join(lost)}）が無い。置き場を見失っている")
            return 2
        units = gf.money_units(table, country)
        text = p.read_text(encoding="utf-8")
        # 材料の出どころつきの額は、行った街でも通す（調べた値段は配信で払っていない。2026-11-24 ソフィア）
        r = check_page(k, text, rows, units, outside_amounts(k, units))
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
