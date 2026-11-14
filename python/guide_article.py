"""**旅のガイドの記事（`/travel/<国>/<街>/<話>`）の中身を、台本と facts.json から焼く。書き出した面を見る。**

    python3 python/guide_article.py north-macedonia/skopje/prices             # 焼く（site/content/travel/north-macedonia/skopje-prices.ts）
    python3 python/guide_article.py north-macedonia/skopje/prices --check     # 焼かずに、焼いてあるものが今の材料と同じかだけ（違えば 1）
    python3 python/guide_article.py north-macedonia/skopje/prices --dist site/.next-3130   # 書き出した面を見る

終了コード 0=焼けた・同じ・通った / 1=台本か材料か面に食い違いがある（何も書かない）/ 2=台本・材料・面が無い。

## 街の面（`guide_bake.py`）と何が違うか

記事は **勝てる問い1つ**に1枚で答える面（`docs/guide-design.md` ★3）。節は問いの順に台本が決める
（街の面のように節の並びを固定しない）。そのかわり、#323 の決めごとを焼く前に止める:

| 止めること | なぜ |
| --- | --- |
| 1つの節に本人の一言が2つ以上 | 1節に1つまで（★2）。いちばん効く1つを選ぶ |
| 案内鳥の文に、結んだ行に無い数 | 言っていない数を足さない（5-1）。日付の数は結んだ行の日付から、外の出どころの数はその行から |
| 確かめが要る行（`verify`）・チャットが出どころの行（`via`）への結び | 面に出さない（8章） |
| 説明口調・画面の仕組みの説明 | `guide_watch.py` の `TONE` `MECH` と同じ物差し |

facts の読みかた・結びの形（`MM-DD h:mm:ss[#種類][@動画]`）・額の見せかた（「ぐらい」→「約」）・写真は、
**`guide_bake.Baker` をそのまま使う**（書き換えない。同じ結びが、街の面と記事で同じ行に当たる）。

## 足し算した額（`days`）

「先に答え: 1日いくら」は、払った額を足した額。足した額は facts のどの行にも無いので、そのままでは
`guide_watch.py` の「額」の足が「facts に無い額」として赤くする。**足し算は道具がやり、面には部品の額と一緒に出す。**

- 焼くとき: 部品はどれも `verify` の無い行の、円で言った額。合計は道具が出す（台本に合計を書かない）
- 見るとき（`--dist`）: 合計の字（`data-sum`）を、`data-parts` の場面の facts の額から**足し直して**突き合わせる。
  面は `guide_watch.check_page` にそのまま渡し（額・一言・口調の3本はそのまま）、その「facts に無い額」のうち
  **足し直して合った額だけ**を外す（答えの文や頭の一文に同じ合計が出てよいように）

## 見るとき足すもの

- 1つの節（`<section>`）に吹き出し（`data-quote="ayato"`）が2つ以上ない
- 表の行（`tbody tr`）は全部、場面のリンクを持つ（`guide_watch` は額のある行だけを見る）

対照は `python/guide_article_selftest.py`。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_bake as gb  # noqa: E402  facts の読みかた・結び・額の見せかた・写真は街の面と同じものを使う
import guide_facts as gf  # noqa: E402
import guide_watch as gw  # noqa: E402  書き出した面の3本の見張りと、口調の物差し

ROOT = gb.ROOT
SCRIPTS = ROOT / "python/data/guide"
CONTENT = gb.CONTENT

# 抜いて対照を当てる（`guide_article_selftest.py`）。本物の動きでは空
#   numbers 焼くとき: 結んだ行に無い数 / quotes 1節に一言1つ / sum 見るとき: 足し直し / rowlink 表の行の場面
BREAK: set[str] = set()


def script_path(key: str, scripts: Path = SCRIPTS) -> Path:
    """`<国>/<街>/<話>` の台本。**`python/data/guide/<国>/<街>/<話>.json`**（街の台本の1段下。
    `guide_watch.keys()` は `*/*.json` しか拾わないので、記事の台本を街と取り違えない）"""
    return scripts / f"{key}.json"


def out_path(key: str, content: Path = CONTENT) -> Path:
    country, city, slug = key.split("/")
    return content / country / f"{city}-{slug}.ts"


def yen_of(x: dict) -> tuple[int, bool] | None:
    """その行の、円で言った額（1つ）と「ぐらい」で言ったか。足し算の部品にしてよいのはこれだけ"""
    it = x["it"]
    said = [a for a in it.get("amounts") or [] if a.get("as") == "said" and a.get("unit") == "円"]
    if len(said) != 1:
        return None
    v = said[0]["value"]
    if not isinstance(v, (int, float)) or v != int(v):
        return None
    plain = gf.norm(it["text"]).replace(",", "")
    forms = [str(int(v))] + ([f"{int(v // 10000)}万"] if v >= 10000 and v % 10000 == 0 else [])
    approx = any(re.search(re.escape(f) + r"円(?:ぐらい|ほど|くらい)", plain) for f in forms)
    return int(v), approx


def yen_text(v: int, approx: bool) -> str:
    return f"{'約' if approx else ''}{v:,}円"


class ArticleBaker:
    def __init__(self, key: str, root: Path = ROOT, script: Path | None = None, streams: Path | None = None):
        self.key = key
        parts = key.split("/")
        if len(parts) != 3:
            raise gb.Stop(f"鍵は <国>/<街>/<話>: {key}")
        self.path = script or script_path(key, root / "python/data/guide")
        if not self.path.exists():
            raise gb.Stop(f"台本が無い: {self.path}")
        s = json.loads(self.path.read_text(encoding="utf-8"))
        if s.get("city") != "/".join(parts[:2]):
            raise gb.Stop(f"台本の city（{s.get('city')}）が鍵（{key}）と違う")
        self.s = s
        # facts の索引・結び・写真は街の焼き器に任せる（台本は記事のものを渡す。写真は街の置き場を引く）
        self.b = gb.Baker(s["city"], root=root, script=self.path, streams=streams)
        self.errors = self.b.errors
        self.sums: set[str] = set()       # 足し算で出した額（文に書いてよい数）
        self.items = 0

    # ------------------------------------------------------------ 字の確かめ
    def tone(self, text: str, where: str) -> None:
        for m in sorted({m.group() for m in gw.TONE.finditer(text)}):
            self.errors.append(f"{where}: 説明口調「{m}」（{text}）")
        for m in sorted({m.group() for m in gw.MECH.finditer(text)}):
            self.errors.append(f"{where}: 画面の仕組みの説明「{m}」（{text}）")

    def text(self, spec: dict, where: str, extra: set[str] | None = None, ext: list[dict] | None = None) -> str:
        """案内鳥の文。結んだ行に無い数を止める（足し算の額・品の数は `extra` で通す）"""
        t = spec["text"]
        xs = self.b.refs(spec.get("refs") or [], where)
        if not spec.get("refs"):
            self.errors.append(f"{where}: 「{t}」が facts のどの行にも結ばれていない")
        bad = gf.numbers_in(t) - self.b.allowed_numbers(xs, ext) - (extra or set()) - self.sums
        if bad and "numbers" not in BREAK:
            self.errors.append(f"{where}: 「{t}」の数 {sorted(bad)} が、結んだ行に無い（言っていない数を足さない）")
        self.tone(t, where)
        return t

    def quote(self, ref: str, where: str) -> dict | None:
        x = self.b.find(ref, where)
        if not x:
            return None
        q = x["it"].get("quote")
        if not q:
            self.errors.append(f"{where}: 「{ref}」には本人の一言（quote）が無い")
            return None
        return {"q": q, "at": self.b.scene(x)}

    # ------------------------------------------------------------ 部品
    def row(self, r: dict, where: str) -> dict | None:
        x = self.b.find(r["ref"], where)
        if not x:
            return None
        it = x["it"]
        what = r.get("what") or it.get("what") or ""
        if not what:
            self.errors.append(f"{where}: 品の名前が無い")
        bad = gf.numbers_in(what) - self.b.allowed_numbers([x])
        if bad:
            self.errors.append(f"{where}: 品の名前「{what}」の数 {sorted(bad)} が、その行に無い")
        self.tone(what, where)
        if "other" in r:
            # 同じ場面で続けて言った別の額（値切る前の宿代など）。**その行の字に在る額だけ**
            v = r["other"]
            hit = [a for a in it.get("other_amounts") or [] if a.get("value") == v and a.get("unit") == "円"]
            plain = gf.norm(it["text"]).replace(",", "")
            if not hit or str(v) not in plain:
                self.errors.append(f"{where}: {v}円 がその行の別の額（other_amounts）と字の両方に無い")
                return None
            approx = bool(re.search(re.escape(str(v)) + r"円(?:ぐらい|ほど|くらい)", plain))
            amount = yen_text(v, approx)
        else:
            amount = self.b.amount(x)
            if not it.get("amounts") or not amount:
                self.errors.append(f"{where}: 「{r['ref']}」に言ったままの額が無い")
                return None
        out = {"what": what, "amount": amount, "at": self.b.scene(x)}
        if r.get("total"):
            out["total"] = True
        if not r.get("total") and r.get("count", True):
            self.items += 1
        return out

    def day(self, d: dict, where: str) -> dict | None:
        parts, total, approx = [], 0, False
        for i, p in enumerate(d["parts"]):
            w = f"{where}.parts[{i}]"
            x = self.b.find(p["ref"], w)
            if not x:
                continue
            y = yen_of(x)
            if not y:
                self.errors.append(f"{w}: 「{p['ref']}」に円で言った額が1つだけ、の形で無い（足し算の部品にしない）")
                continue
            v, a = y
            total += v
            approx |= a
            self.tone(p["label"], w)
            parts.append({"label": p["label"], "amount": yen_text(v, a), "at": self.b.scene(x)})
        if len(parts) != len(d["parts"]):
            return None
        self.sums.add(str(total))
        return {"label": d["label"], "sum": yen_text(total, approx), "value": total, "parts": parts}

    def photo(self, key: str, where: str) -> dict | None:
        return self.b.photo(key, where)

    # ------------------------------------------------------------ 組む
    def build(self) -> dict:
        s = self.s
        a = s["answer"]
        days = [d for d in (self.day(d, f"answer.days[{i}]") for i, d in enumerate(a["days"])) if d]

        sections = []
        for i, sec in enumerate(s["sections"]):
            w = f"sections[{i}]({sec['id']})"
            out: dict = {"id": sec["id"], "h": sec["h"], "toc": sec["toc"], "icon": sec["icon"]}
            self.tone(sec["h"], w)
            if sec.get("table"):
                rows = [r for r in (self.row(r, f"{w}.table[{j}]") for j, r in enumerate(sec["table"]["rows"])) if r]
                out["table"] = {"caption": sec["table"]["caption"], "rows": rows}
            sections.append((sec, out, w))

        # 品の数は表から数える（題に入る。手で書かない）
        n = self.items
        extra = {str(n)}

        out_secs = []
        quotes_seen: set[tuple] = set()
        for sec, out, w in sections:
            out["answer"] = self.text(sec["answer"], f"{w}.answer")
            body, nq = [], 0
            for j, blk in enumerate(sec.get("body") or []):
                bw = f"{w}.body[{j}]"
                if "quote" in blk:
                    q = self.quote(blk["quote"], bw)
                    nq += 1
                    if q:
                        k = (q["at"]["v"], q["at"]["t"], q["q"])
                        if k in quotes_seen:
                            self.errors.append(f"{bw}: 同じ一言を2回出している「{q['q']}」")
                        quotes_seen.add(k)
                        body.append({"quote": q})
                elif "photo" in blk:
                    p = self.photo(blk["photo"], bw)
                    if p:
                        body.append({"photo": p})
                else:
                    body.append({"text": self.text(blk, bw)})
            if nq > 1 and "quotes" not in BREAK:
                self.errors.append(f"{w}: 本人の一言が {nq} つ在る（1節に1つまで）")
            out["body"] = body
            if sec.get("pairs"):
                out["pairs"] = [{"head": p["head"], "text": self.text(p, f"{w}.pairs[{j}]")}
                                for j, p in enumerate(sec["pairs"])]
            if sec.get("keyword"):
                k = sec["keyword"]
                ext = [self.b.ext(e, f"{w}.keyword.ext[{j}]") for j, e in enumerate(k.get("ext") or [])]
                self.tone(k["title"], f"{w}.keyword")
                out["keyword"] = {"title": k["title"],
                                  "lines": [self.text(l_, f"{w}.keyword.lines[{j}]", ext=ext)
                                            for j, l_ in enumerate(k["lines"])],
                                  "ext": ext}
            if sec.get("scene"):
                x = self.b.find(sec["scene"], f"{w}.scene")
                if x:
                    out["scene"] = self.b.scene(x)
            if out.get("table"):
                cap = out["table"]["caption"]
                days_ok = set()
                for r in out["table"]["rows"]:
                    y, mo, d = r["at"]["date"].split("-")
                    days_ok |= {str(int(y)), str(int(mo)), str(int(d))}
                bad = gf.numbers_in(cap) - days_ok
                if bad:
                    self.errors.append(f"{w}.table: 見出し「{cap}」の数 {sorted(bad)} が、表の行の日付に無い")
            out_secs.append(out)

        def fill(t: str) -> str:
            return t.replace("{n}", str(n))

        title = fill(s["title"])
        h1 = [fill(x) for x in s["h1"]]
        self.text({"text": title, "refs": s.get("title_refs")}, "title", extra)
        for j, x in enumerate(h1):
            self.text({"text": x, "refs": s.get("title_refs")}, f"h1[{j}]", extra)
        if "".join(h1) != title:
            self.errors.append("h1 をつないだ字が題（title）と違う（見出しと題は同じ字）")
        desc = self.text({"text": s["description"], "refs": s.get("description_refs")}, "description")
        if len(desc) > 120:
            self.errors.append(f"description が {len(desc)} 字（120字まで）")

        answer = {
            "id": a["id"], "h": a["h"], "toc": a["toc"], "icon": a["icon"],
            "text": self.text(a, "answer"),
            "days": days,
            "points": [{"head": p["head"], "text": self.text(p, f"answer.points[{j}]")} for j, p in enumerate(a["points"])],
            "note": self.text(a["note"], "answer.note"),
        }
        cover = self.photo(s["cover"], "cover")

        # 面の上で場面を引いた回（多い順）。配信の一覧に使う
        cited: dict[str, int] = {}

        def add(sc):
            if sc:
                cited[sc["v"]] = cited.get(sc["v"], 0) + 1
        for d in days:
            for p in d["parts"]:
                add(p["at"])
        for sec in out_secs:
            for r in (sec.get("table") or {}).get("rows", []):
                add(r["at"])
            for b in sec["body"]:
                if "quote" in b:
                    add(b["quote"]["at"])
            add(sec.get("scene"))
        streams = [v for v, _ in sorted(cited.items(), key=lambda kv: (-kv[1], kv[0]))]

        return {
            "slug": self.key.split("/")[2],
            "title": title,
            "h1": h1,
            "description": desc,
            "lead": self.text(s["lead"], "lead", extra),
            "cover": cover,
            "items": n,
            "streams": {**s["streams"], "videos": streams},
            "answer": answer,
            "sections": out_secs,
        }

    def report(self) -> str:
        used = len(self.b.used)
        ready = len(self.b.ready)
        quotes = sum(1 for sec in self.s["sections"] for b in sec.get("body") or [] if "quote" in b)
        return f"使った facts の行 {used}（そのまま出せる {ready} 行のうち）・品 {self.items}・一言 {quotes}"


# ---------------------------------------------------------------- 書き出し

def render(key: str, g: dict) -> str:
    rel = f"python/data/guide/{key}.json"
    return (
        "/**\n"
        f" * 記事（`/travel/{key}`）の中身。**自動生成。手で直さない。**\n"
        " *\n"
        f" * 元は台本 `{rel}` と `streams/YYYY/MM/*.facts.json`。\n"
        f" * 直すなら台本か facts のほうを直して、`python3 python/guide_article.py {key}` で焼き直す。\n"
        " * 一言の字・額・場面の秒は facts から写している。足し算の額は道具が出している。\n"
        " */\n"
        'import type { GuideArticle } from "@/components/travel/article/types";\n\n'
        f"export const ARTICLE: GuideArticle = {gb.BEGIN}\n"
        + json.dumps(g, ensure_ascii=False, indent=1)
        + f"\n{gb.END};\n"
    )


def bake(key: str, *, check: bool = False, today: str | None = None, root: Path = ROOT,
         content: Path = CONTENT, **kw) -> int:
    try:
        b = ArticleBaker(key, root=root, **kw)
        g = b.build()
    except gb.Stop as e:
        print(f"::error::{e}")
        return 2
    if b.errors:
        for e in b.errors:
            print(f"::error::{e}")
        print(f"止めた: {len(b.errors)}件。何も書いていない")
        return 1
    p = out_path(key, content)
    old = gb.read_baked(p)
    fp = gb.fingerprint(g)
    day = today or gb.today_jst()
    g = {**g, "published": (old or {}).get("published") or day,
         "updated": (old or {}).get("updated") if old and old.get("hash") == fp else day, "hash": fp}
    text = render(key, g)
    if check:
        same = p.exists() and p.read_text(encoding="utf-8") == text
        print(("同じ" if same else "焼き直しが要る") + f": {p.relative_to(root) if p.is_relative_to(root) else p}")
        print(b.report())
        return 0 if same else 1
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print(f"焼いた: {p.relative_to(root) if p.is_relative_to(root) else p}（指紋 {fp}・公開 {g['published']}・最終更新 {g['updated']}）")
    print(b.report())
    return 0


# ---------------------------------------------------------------- 書き出した面を見る

SUM = re.compile(r'(<(\w+)\b[^>]*\bdata-sum="(\d+)"[^>]*\bdata-parts="([^"]*)"[^>]*>)([^<]*)(</\2>)')


def check_sums(page: str, rows: list[dict], units: dict) -> tuple[set[str], list[str], int]:
    """足し算した額（`data-sum`）を、部品の場面の facts の額から足し直して突き合わせる。
    →（合った額, 食い違い, 見た数）。**合った額だけが**、本文のほかの所（答えの文・頭の一文）に出てよい"""
    errs: list[str] = []
    ok: set[str] = set()
    at: dict[tuple[str, int], list[dict]] = {}
    for x in rows:
        at.setdefault((x["v"], x["t"]), []).append(x)
    seen = 0
    for m in SUM.finditer(page):
        seen += 1
        want, parts, shown = int(m.group(3)), m.group(4), m.group(5)
        total, bad = 0, False
        for p in filter(None, parts.split(",")):
            v, _, t = p.rpartition(":")
            here = [x for x in at.get((v, int(t)), []) if not x["hold"]]
            ys = {y for y in (yen_of(x) for x in here) if y}
            if len(ys) != 1:
                errs.append(f"[足し算] 部品 {p} の、確かめの要らない円の額が1つに決まらない")
                bad = True
                continue
            total += next(iter(ys))[0]
        got = set(gf.money_in(shown, units))
        if bad:
            continue
        if (total != want or got != {(str(want), "円")}) and "sum" not in BREAK:
            errs.append(f"[足し算] 「{shown}」（data-sum={want}）が、部品を足し直した {total}円 と合わない")
            continue
        ok.add(str(want))
    return ok, errs, seen


def check_sections(page: str) -> tuple[list[str], int]:
    """1つの節に吹き出しが2つ以上ないか。表の行が全部場面のリンクを持つか"""
    art, _ = gw.parse(page)
    errs: list[str] = []
    if art is None:
        return ["本文（article.tg）が無い"], 0
    n = 0
    for sec in (s for s in art.walk() if s.tag == "section"):
        n += 1
        qs = [q for q in sec.walk() if gw.is_quote(q)]
        if len(qs) > 1 and "quotes" not in BREAK:
            errs.append(f"[一言] 節 #{sec.attrs.get('id', '?')} に一言が {len(qs)} つ（1節に1つまで）")
        for tr in (t for t in sec.walk() if t.tag == "tr" and t.parent is not None and t.parent.tag == "tbody"):
            if not any(a.tag == "a" and gw.scene_of(a) for a in tr.walk()) and "rowlink" not in BREAK:
                errs.append(f"[表] 節 #{sec.attrs.get('id', '?')} の行「{tr.text().strip()[:20]}」に場面のリンクが無い")
    return errs, n


def page_path(dist: Path, key: str) -> Path | None:
    for p in (dist / "travel" / f"{key}.html", dist / "travel" / key / "index.html"):
        if p.exists():
            return p
    return None


def watch(key: str, dist: Path, streams: Path) -> int:
    country, city, _ = key.split("/")
    p = page_path(dist, key)
    if p is None:
        print(f"::error::{key}: 書き出した面が {dist}/travel/{key}.html に無い（先に tools/build.sh）")
        return 2
    rows = gw.rows_of(country, city, streams)
    if not rows:
        print(f"::error::{key}: facts の行が1つも無い。突き合わせる相手が無い")
        return 2
    table = gf.load_table(ROOT / "python/data/guide/cities.json")
    units = gf.money_units(table, country)
    page = p.read_text(encoding="utf-8")
    good, errs, sums = check_sums(page, rows, units)
    sec_errs, secs = check_sections(page)
    r = gw.check_page(key, page, rows, units)
    if r is None or not r.seen["一言"] or not r.seen["字"] or not secs or not sums:
        print(f"::error::{key}: 面の本文（article.tg）・節・一言・足し算のどれかが読めない。見るものが無い")
        return 2
    # `guide_watch` の「facts に無い額」のうち、足し直して合った額だけを外す（文言は `check_money` の1つ目の足）
    sum_ok = {f"[額] {v}円 が facts のどの行にも無い" for v in good}
    errs += sec_errs + [e for e in r.errors if e not in sum_ok]
    seen = "・".join(f"{n}{c}" for n, c in r.seen.items()) + f"・節{secs}・足し算{sums}"
    if errs:
        print(f"✕ {key}（{seen}）: {len(errs)}件")
        for e in errs:
            print(f"  - {e}")
        return 1
    print(f"○ {key}（{seen}）: 額・一言・口調・足し算・1節1言とも0件")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", help="<国>/<街>/<話>（例: north-macedonia/skopje/prices）")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--dist", help="書き出した置き場（site/.next-3130 など）。付けると、面を見る")
    ap.add_argument("--streams", default=str(ROOT / "streams"))
    ap.add_argument("--today", help="今日の日付（見張りが差し替える）")
    a = ap.parse_args(argv)
    if a.dist:
        return watch(a.key, Path(a.dist), Path(a.streams))
    return bake(a.key, check=a.check, today=a.today)


if __name__ == "__main__":
    sys.exit(main())
