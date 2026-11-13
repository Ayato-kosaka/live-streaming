"""**街のガイドの面（`/travel/<国>/<街>`）の中身を、台本と facts.json から焼く。**

    python3 python/guide_bake.py north-macedonia/skopje            # 焼く（site/content/travel/north-macedonia/skopje.ts）
    python3 python/guide_bake.py north-macedonia/skopje --check    # 焼かずに、焼いてあるものが今の材料と同じかだけ（違えば 1）
    python3 python/guide_bake.py north-macedonia/skopje --photos   # 台本の写真を本番の口から取って、絵を置く（外に出る）

終了コード 0=焼けた・同じ / 1=台本か材料に食い違いがある（何も書かない）/ 2=台本か材料が無い。

## 何を焼くか

面の字のうち、**街ごとに変わるものは全部ここから出る。** 面（`site/app/travel/<国>/<街>/page.tsx`）は
焼いたものを読むだけで、節の見出しと並びだけを持つ（どの街の面も、同じ場所に同じ問いがある。
`docs/guide-design.md` 2-0）。

| 元 | 何を持つか | 誰が書くか |
| --- | --- | --- |
| `streams/YYYY/MM/<stem>.facts.json` | 行った日・額・本人の一言・場面の時刻 | `/guide-facts`（確かめは `python/guide_facts.py`） |
| `python/data/guide/<国>/<街>.json`（台本） | 案内鳥の地の文・どの行をどの節に使うか・写真・外の出どころ | 面を作る担当 |

**台本には、本人の一言の字も、額も、場面の秒も書かない。** 書くのは facts の行への結び（`"10-14 1:38:30"`）だけで、
字と秒はここが facts から写す。手で写すと、1字違いと1行ずれが必ず混ざる（一言は字幕の字のまま、が決まり。
`docs/guide-design.md` 5-2）。

## 焼く前に止めるもの

- **確かめが要る行（`verify`）とチャットが出どころの行（`via`）に結んでいる**（面に出さない決まり。8章）
- 結びが facts のどの行にも当たらない・2行以上に当たる（種類 `#quote` か動画 `@<id>` で絞る）
- **案内鳥の文に、結んだ行に無い数字が在る**（「言っていないことを足さない」。5-1。日付の数は結んだ行の日付から、
  外の出どころの数はその出どころの行から引いてよい）
- 種類と節が合わない（`caution` を「どこへ行った？」に置く、など。2-0 の表）
- 一言の無い行を、一言として結んだ
- 写真の絵が置き場に無い（先に `--photos`）

## 最終更新の日付

**中身の字が変わったときだけ進める**（`docs/guide-design.md` 9章の11）。焼いたものの頭に中身の指紋を持たせ、
焼き直して指紋が同じなら日付を据え置く。公開の日付は、最初に焼いた日のまま動かさない。

## 写真（`--photos`）

本番の `GET /island-api/cards` から、**台本に書いた写真の id の `url`（素の写真。住人は立っていない）だけ**を取る。
同じ行に在る住人の名前とアイコンは読み捨てる——**保存しない・書き出さない**（#1203）。
取った絵は 480px と 960px 幅の WebP にして `site/public/travel/<国>/<街>/<鍵>-<幅>.webp` に置く。

## 見張り

`python/guide_watch.py`（面に出た額・一言の場面・説明口調）。焼いたものに対して回す。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_facts as gf  # noqa: E402  facts の読みかた・確かめは束ねる道具と同じものを使う
import stream_notes as sn  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "python/data/guide"
CONTENT = ROOT / "site/content/travel"
PUBLIC = ROOT / "site/public"
CARDS_API = "https://live-streaming-d3cac.web.app/island-api/cards"
JST = timezone(timedelta(hours=9))

BEGIN = "/* BEGIN GUIDE */"
END = "/* END GUIDE */"

# 節の並び。**街が変わっても変えない**（`docs/guide-design.md` 2-0。見出しと絵は面の側が持つ）
ORDER = ["about", "move", "money", "places", "food", "stay", "caution", "trip"]

# 節ごとに、結んでよい種類。`fact`（街のようす）はどの節の行にもなる。
# `quote` は、その一言の `about`（どの問いの話か）がここに在ること
KINDS_OK = {
    "about": {"fact"},
    "move": {"move", "fact"},
    "money": {"price", "stay", "fact"},
    "places": {"place", "fact"},
    "food": {"food", "place", "fact"},
    "stay": {"stay", "fact"},
    "caution": {"caution", "fact"},
    # 遠出のカードは、その遠出の札が付いた行と、帰り道の行（街の `move` `caution`）
    "trip": {"move", "place", "fact", "caution"},
}

REF = re.compile(r"^(\d\d-\d\d) (\d+:\d\d:\d\d)(?: ?#(\w+))?(?: ?@([\w-]+))?$")
WIDTHS = (480, 960)


class Stop(Exception):
    """台本か材料が無い（終了 2）。"""


def today_jst() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d")


def fmt_amount(v: float) -> str:
    return f"{int(v):,}" if v == int(v) else f"{v:g}"


def mins(sec: int) -> str:
    return f"{sec / 60:g}"


class Baker:
    """1つの街の台本を、facts と突き合わせながら面の中身に組む。"""

    def __init__(self, key: str, root: Path = ROOT, streams: Path | None = None, table: Path | None = None,
                 script: Path | None = None):
        self.key = key
        self.country, self.city = key.split("/")
        self.root = root
        self.streams = streams or root / "streams"
        self.table = gf.load_table(table or root / "python/data/guide/cities.json")
        self.script_path = script or root / "python/data/guide" / f"{key}.json"
        if not self.script_path.exists():
            raise Stop(f"台本が無い: {self.script_path}")
        self.s = json.loads(self.script_path.read_text(encoding="utf-8"))
        self.errors: list[str] = []
        self.used: set[int] = set()        # 使った行（id）。数を報告に出す
        self._index()

    # ------------------------------------------------------------ 材料
    def _index(self) -> None:
        files = [p for p in gf.find_files(self.streams, [], None)
                 if gf.head_of(p).get("country") == self.country and gf.head_of(p).get("city") == self.city]
        if not files:
            raise Stop(f"{self.key} の .facts.json が1本も無い")
        for p in files:
            r = gf.check_file(p, self.table)
            if r.blind or r.ng:
                raise Stop(f"{p.name} が guide_facts.py check を通っていない（先に直す）")
        self.rows: list[dict] = []
        self.heads: list[dict] = []
        for p in files:
            d = gf.head_of(p)
            self.heads.append({"v": d["video_id"], "date": d["date_local"], "start": d["start_jst"]})
            for it in d["items"]:
                self.rows.append({"id": len(self.rows), "v": d["video_id"], "date": d["date_local"],
                                  "t": it["t"], "it": it,
                                  "hold": "verify" if it.get("verify") else ("chat" if it.get("via") else None)})
        self.heads.sort(key=lambda h: h["start"])
        self.ready = [x for x in self.rows if not x["hold"]]

    def find(self, ref: str, where: str) -> dict | None:
        m = REF.match(ref.strip())
        if not m:
            self.errors.append(f"{where}: 結びの形が読めない「{ref}」（MM-DD h:mm:ss[#種類][@動画]）")
            return None
        md, hms, kind, vid = m.groups()
        t = sn.sec(*re.fullmatch(sn.TIME, hms).groups())
        hit = [x for x in self.rows if x["date"][5:] == md and x["t"] == t
               and (not kind or x["it"]["kind"] == kind) and (not vid or x["v"] == vid)]
        if not hit:
            self.errors.append(f"{where}: 「{ref}」に当たる facts の行が無い")
            return None
        if len(hit) > 1:
            kinds = "・".join(f"{x['it']['kind']}@{x['v']}" for x in hit)
            self.errors.append(f"{where}: 「{ref}」が {len(hit)} 行に当たる（{kinds}）。#種類 か @動画 で絞る")
            return None
        x = hit[0]
        if x["hold"]:
            why = "確かめが要る行（verify）" if x["hold"] == "verify" else "チャットが出どころの行（via）"
            self.errors.append(f"{where}: 「{ref}」は{why}。面に出さない")
            return None
        self.used.add(x["id"])
        return x

    def refs(self, spec, where: str) -> list[dict]:
        rs = spec if isinstance(spec, list) else [spec]
        return [x for x in (self.find(r, where) for r in rs) if x]

    def kind_ok(self, x: dict, sec: str, where: str) -> None:
        it = x["it"]
        k = it["kind"]
        if sec == "trip" and it.get("trip"):
            return
        if k == "quote":
            k = it.get("about") or "fact"
        if k not in KINDS_OK[sec]:
            self.errors.append(f"{where}: 種類 {k} の行（{x['date'][5:]} {sn.hms(x['t'])}）は、この節（{sec}）に置かない")

    @staticmethod
    def scene(x: dict) -> dict:
        return {"v": x["v"], "t": x["t"], "date": x["date"]}

    # ------------------------------------------------------------ 字の確かめ
    def allowed_numbers(self, xs: list[dict], ext: list[dict] | None = None) -> set[str]:
        ok: set[str] = set()
        for x in xs:
            it = x["it"]
            for s in (it["text"], it.get("quote") or "", it.get("what") or ""):
                ok |= gf.numbers_in(s)
            for a in it.get("amounts") or []:
                v = gf.as_num(a["value"])
                if v:
                    ok.add(v)
            if it.get("measured"):
                ok.add(gf.numval(mins(self.measured_sec(it))))
            y, mo, d = x["date"].split("-")
            ok |= {str(int(y)), str(int(mo)), str(int(d))}
        for e in ext or []:
            ok |= gf.numbers_in(e.get("text", ""))
            ok |= {str(int(p)) for p in e.get("seen", "").split("-") if p}
        return ok

    def check_numbers(self, text: str, xs: list[dict], where: str, ext: list[dict] | None = None) -> None:
        extra = gf.numbers_in(text) - self.allowed_numbers(xs, ext)
        if extra:
            self.errors.append(f"{where}: 「{text}」の数 {sorted(extra)} が、結んだ行に無い（言っていない数を足さない）")

    @staticmethod
    def measured_sec(it: dict) -> int:
        m = it["measured"]
        a, b = (sn.sec(*re.fullmatch(sn.TIME, m[k]).groups()) for k in ("from", "to"))
        return b - a

    # ------------------------------------------------------------ 部品
    def line(self, spec: dict, sec: str, where: str, ext: list[dict] | None = None) -> dict | None:
        xs = self.refs(spec.get("refs") or [], where)
        if not xs:
            if not spec.get("refs"):
                self.errors.append(f"{where}: 「{spec.get('text', '')}」が facts のどの行にも結ばれていない")
            return None
        for x in xs:
            self.kind_ok(x, sec, where)
        self.check_numbers(spec["text"], xs, where, ext)
        out = {"text": spec["text"], "at": self.scene(xs[0])}
        if spec.get("quote"):
            q = self.quote(spec["quote"], sec, f"{where}.quote")
            if q:
                out["quote"] = q
        return out

    def quote(self, ref: str, sec: str, where: str) -> dict | None:
        x = self.find(ref, where)
        if not x:
            return None
        self.kind_ok(x, sec, where)
        q = x["it"].get("quote")
        if not q:
            self.errors.append(f"{where}: 「{ref}」には本人の一言（quote）が無い")
            return None
        return {"q": q, "at": self.scene(x)}

    def quotes(self, refs: list[str], sec: str, where: str) -> list[dict]:
        out = [q for q in (self.quote(r, sec, f"{where}.quotes[{i}]") for i, r in enumerate(refs)) if q]
        seen = set()
        for q in out:
            k = (q["at"]["v"], q["at"]["t"], q["q"])
            if k in seen:
                self.errors.append(f"{where}: 同じ一言を2回出している「{q['q']}」")
            seen.add(k)
        return out

    def measured(self, ref: str, where: str) -> dict | None:
        x = self.find(ref, where)
        if not x:
            return None
        it = x["it"]
        if not it.get("measured"):
            self.errors.append(f"{where}: 「{ref}」に測った値（measured）が無い")
            return None
        m = it["measured"]
        a, b = (sn.sec(*re.fullmatch(sn.TIME, m[k]).groups()) for k in ("from", "to"))
        return {"what": m["what"], "mins": mins(b - a),
                "from": {"v": x["v"], "t": a, "date": x["date"]}, "to": {"v": x["v"], "t": b, "date": x["date"]}}

    def amount(self, x: dict) -> str:
        """額の見せかた。**言ったまま**（円の額は本人がその場で円に直したもの）。「ぐらい・ほど」は「約」に（5-4）"""
        it = x["it"]
        out = []
        for a in it.get("amounts") or []:
            if a.get("as") != "said" or not a.get("unit"):
                continue
            v = float(a["value"])
            s = fmt_amount(v)
            plain = gf.norm(it["text"]).replace(",", "")
            forms = [str(int(v)) if v == int(v) else repr(v)]
            if v >= 10000 and v % 10000 == 0:
                forms.append(f"{int(v // 10000)}万")
            approx = any(re.search(re.escape(f) + re.escape(a["unit"]) + r"(?:ぐらい|ほど|くらい)", plain)
                         for f in forms)
            out.append(f"{'約' if approx else ''}{s}{a['unit']}")
        return "・".join(out)

    def price_row(self, ref: str, where: str) -> dict | None:
        x = self.find(ref, where)
        if not x:
            return None
        it = x["it"]
        if not it.get("amounts"):
            self.errors.append(f"{where}: 「{ref}」に額（amounts）が無い")
            return None
        amt = self.amount(x)
        if not amt:
            self.errors.append(f"{where}: 「{ref}」の額に、言ったままの単位つきのものが無い")
            return None
        return {"what": it["what"], "amount": amt, "at": self.scene(x)}

    def ext(self, e: dict, where: str) -> dict:
        for k in ("text", "src", "name", "seen"):
            if not e.get(k):
                self.errors.append(f"{where}: 外の出どころの行に {k} が無い（出どころの無い事実は載せない）")
        if not str(e.get("src", "")).startswith("https://"):
            self.errors.append(f"{where}: 外の出どころが https の URL でない")
        return {k: e.get(k, "") for k in ("text", "src", "name", "seen")}

    def local(self, spec: dict | None, where: str) -> dict | None:
        if not spec:
            return None
        if not spec.get("src", "").startswith("https://"):
            self.errors.append(f"{where}: 現地のつづりに出どころ（src）が無い")
        return {"text": spec["text"], "lang": spec["lang"], "src": spec.get("src", "")}

    def photo(self, key: str | None, where: str) -> dict | None:
        if not key:
            return None
        p = (self.s.get("photos") or {}).get(key)
        if not p:
            self.errors.append(f"{where}: 写真「{key}」が台本の photos に無い")
            return None
        base = f"/travel/{self.key}/{key}"
        files = {w: PUBLIC / f"{base.lstrip('/')}-{w}.webp" for w in WIDTHS}
        missing = [str(f.relative_to(self.root)) for f in files.values() if not f.exists()]
        if missing:
            self.errors.append(f"{where}: 写真の絵が無い（{', '.join(missing)}）。先に --photos")
            return None
        w, h = self._size(files[WIDTHS[-1]])
        # 切り出した写真は元より大きく焼かない（`fetch_photos`）。並べる幅は、置いた絵の実寸から
        set_w = {w_: self._size(f)[0] for w_, f in files.items()}
        day = p["day"]
        v = next((hd["v"] for hd in self.heads if hd["date"] == day), None)
        if not v:
            self.errors.append(f"{where}: 写真の日 {day} の配信が facts に無い（出どころのリンクが張れない）")
        out = {"src": f"{base}-{WIDTHS[-1]}.webp",
               "srcSet": ", ".join(f"{base}-{w_}.webp {set_w[w_]}w" for w_ in WIDTHS),
               "w": w, "h": h, "alt": p["alt"], "day": day, "v": v or ""}
        if p.get("pos"):
            out["pos"] = p["pos"]
        return out

    @staticmethod
    def _size(f: Path) -> tuple[int, int]:
        b = f.read_bytes()
        # WebP（VP8 / VP8L / VP8X）の頭から寸法だけ読む。Pillow を焼くたびに要らないように
        if b[12:16] == b"VP8 ":
            return int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF
        if b[12:16] == b"VP8L":
            n = int.from_bytes(b[21:25], "little")
            return (n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1
        if b[12:16] == b"VP8X":
            return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
        raise ValueError(f"{f}: WebP として読めない")

    # ------------------------------------------------------------ 組む
    def card(self, c: dict, sec: str, where: str) -> dict:
        out: dict = {"key": c["key"], "name": c["name"]}
        if c.get("sub"):
            out["sub"] = c["sub"]
        loc = self.local(c.get("local"), where)
        if loc:
            out["local"] = loc
        lines = [ln for ln in (self.line(s, sec, f"{where}.lines[{i}]") for i, s in enumerate(c.get("lines") or [])) if ln]
        qs = self.quotes(c.get("quotes") or [], sec, where)
        out["lines"] = lines
        # 一言は3つまで見せて、4つ目からは畳む（`docs/guide-design.md` 2-1 の終わり）
        out["quotes"], out["more"] = qs[:3], qs[3:]
        out["measured"] = [m for m in (self.measured(r, f"{where}.measured") for r in c.get("measured") or []) if m]
        out["went"] = sorted({ln["at"]["date"] for ln in lines} | {q["at"]["date"] for q in qs})
        ph = self.photo(c.get("photo"), where)
        if ph:
            # 同じ1枚の別の所を見せるときは、カードの側で寄せる所を変える（チェバピと豆の煮込みが1枚に写っている）
            out["photo"] = {**ph, "pos": c["pos"]} if c.get("pos") else ph
        if c.get("maps"):
            out["maps"] = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(c["maps"]) + "&hl=ja"
        info = []
        for i, f in enumerate(c.get("info") or []):
            ln = self.line(f, sec, f"{where}.info[{i}]")
            if ln:
                info.append({"label": f["label"], **ln})
        out["info"] = info
        if not lines and not qs:
            self.errors.append(f"{where}: カード「{c['name']}」に行も一言も無い")
        return out

    def section(self, sid: str, spec: dict) -> dict:
        w = f"sections.{sid}"
        ext = [self.ext(e, f"{w}.ext[{i}]") for i, e in enumerate(spec.get("ext") or [])]
        ans_x = self.refs(spec["answer"]["refs"], f"{w}.answer")
        for x in ans_x:
            self.kind_ok(x, sid, f"{w}.answer")
        self.check_numbers(spec["answer"]["text"], ans_x, f"{w}.answer")
        sc = self.find(spec["scene"], f"{w}.scene")
        out: dict = {"id": sid, "answer": spec["answer"]["text"],
                     "scene": self.scene(sc) if sc else None, "ext": ext}
        out["lines"] = [ln for ln in (self.line(s, sid, f"{w}.lines[{i}]") for i, s in enumerate(spec.get("lines") or [])) if ln]
        out["quotes"] = self.quotes(spec.get("quotes") or [], sid, w)
        # 節の地の文に添える一言は、行に付けたものと合わせて3つまで（`docs/guide-design.md` 3章・5-2）
        n_q = len(out["quotes"]) + sum(1 for ln in out["lines"] if ln.get("quote"))
        if n_q > 3:
            self.errors.append(f"{w}: 節の一言は3つまで（{n_q}）")
        moves = []
        for i, m in enumerate(spec.get("moves") or []):
            mw = f"{w}.moves[{i}]"
            ln = self.line({"text": m["got"], "refs": m["refs"]}, sid, mw)
            if not ln:
                continue
            mv = {"from": m["from"], "to": m["to"], "by": m["by"], "got": m["got"], "at": ln["at"],
                  "lines": [x for x in (self.line(s, sid, f"{mw}.lines[{j}]") for j, s in enumerate(m.get("lines") or [])) if x]}
            if m.get("said"):
                self.check_numbers(m["said"], self.refs(m["refs"], mw), mw)
                mv["said"] = m["said"]
            if m.get("quote"):
                q = self.quote(m["quote"], sid, mw)
                if q:
                    mv["quote"] = q
            moves.append(mv)
        out["moves"] = moves
        out["tables"] = [{"caption": t["caption"],
                          "rows": [r for r in (self.price_row(ref, f"{w}.tables[{i}]") for ref in t["rows"]) if r]}
                         for i, t in enumerate(spec.get("tables") or [])]
        if spec.get("keyword"):
            k = spec["keyword"]
            kext = [self.ext(e, f"{w}.keyword.ext[{i}]") for i, e in enumerate(k.get("ext") or [])]
            out["keyword"] = {"title": k["title"],
                              "lines": [x for x in (self.line(s, sid, f"{w}.keyword.lines[{i}]") for i, s in enumerate(k["lines"])) if x],
                              "ext": kext}
        out["cards"] = [self.card(c, sid, f"{w}.cards[{i}]") for i, c in enumerate(spec.get("cards") or [])]
        for n, c in enumerate(out["cards"], 1):
            if sid == "places":
                c["n"] = n
        out["others"] = [ln for ln in (self.line(s, sid, f"{w}.others[{i}]") for i, s in enumerate(spec.get("others") or [])) if ln]
        dishes = []
        for i, d in enumerate(spec.get("dishes") or []):
            dw = f"{w}.dishes[{i}]"
            c = self.card(d, sid, dw)
            if not c.get("photo"):
                # 格子のマスは写真から先に読む。**空のマスを置かない**（`docs/guide-design.md` 4-1）
                self.errors.append(f"{dw}: 料理の格子に写真の無いマスを置かない（「ほかに食べたもの」の行にする）")
            if d.get("price"):
                pr = self.price_row(d["price"], dw)
                if pr:
                    c["price"] = pr
            if d.get("where"):
                c["where"] = d["where"]
            dishes.append(c)
        out["dishes"] = dishes
        out["trips"] = []
        for i, tcard in enumerate(spec.get("trips") or []):
            tw = f"{w}.trips[{i}]"
            c = self.card(tcard, sid, tw)
            if tcard.get("scene"):
                s2 = self.find(tcard["scene"], tw)
                if s2:
                    c["scene"] = self.scene(s2)
            out["trips"].append(c)
        return out

    def build(self) -> dict:
        s = self.s
        for k in ("name", "title", "description", "lead", "cover", "sections"):
            if k not in s:
                self.errors.append(f"台本に {k} が無い")
        if self.errors:
            return {}
        lead_x = self.refs(s["lead"]["refs"], "lead")
        self.check_numbers(s["lead"]["text"], lead_x, "lead")
        if len(s["lead"]["text"]) > 40:
            self.errors.append(f"lead: 表紙の一言は40字まで（{len(s['lead']['text'])}字）")
        desc_x = self.refs(s["description"]["refs"], "description")
        self.check_numbers(s["description"]["text"], desc_x, "description")
        if len(s["description"]["text"]) > 120:
            self.errors.append(f"description: 120字まで（{len(s['description']['text'])}字）")
        nums = []
        for i, b in enumerate(s.get("nums") or []):
            x = self.find(b["ref"], f"nums[{i}]")
            if not x:
                continue
            if b.get("measured"):
                if not x["it"].get("measured"):
                    self.errors.append(f"nums[{i}]: 「実測」と書くのに、行に測った値（measured）が無い")
                    continue
                n = mins(self.measured_sec(x["it"]))
                if gf.numval(b["n"].replace("約", "")) != gf.numval(n):
                    self.errors.append(f"nums[{i}]: 実測の値 {b['n']} が、測った値 {n} と違う")
            else:
                self.check_numbers(b["n"] + b["unit"] + b["cap"], [x], f"nums[{i}]")
            nums.append({"n": b["n"], "unit": b["unit"], "cap": b["cap"], "measured": bool(b.get("measured")),
                         "at": self.scene(x)})
        secs = []
        for sid in ORDER:
            if sid in s["sections"]:
                secs.append(self.section(sid, s["sections"][sid]))
        extra = set(s["sections"]) - set(ORDER)
        if extra:
            self.errors.append(f"sections: 知らない節 {sorted(extra)}（並びは {ORDER}）")
        # 埋め込みの1本は機械で決める（9章の2）: その街で facts の項目がいちばん多い回、その回の最初の `place` から
        counts: dict[str, int] = {}
        for x in self.rows:
            counts[x["v"]] = counts.get(x["v"], 0) + 1
        top = max(self.heads, key=lambda h: (counts.get(h["v"], 0), h["start"]))
        places = sorted(x["t"] for x in self.rows if x["v"] == top["v"] and x["it"]["kind"] == "place")
        embed = {"v": top["v"], "t": places[0] if places else 0, "date": top["date"]}
        return {
            "country": self.country, "city": self.city, "name": s["name"],
            "local": self.local(s.get("local"), "local"),
            "title": s["title"], "description": s["description"]["text"], "lead": s["lead"]["text"],
            "cover": self.photo(s["cover"], "cover"),
            "embed": embed,
            "streams": s.get("streams"),
            "nums": nums,
            "sections": secs,
            "sources": [self.ext(e, f"sources[{i}]") for i, e in enumerate(s.get("sources") or [])],
        }

    def report(self) -> str:
        n_ready = len(self.ready)
        n_used = len(self.used)
        return f"facts: 使った {n_used}件 / そのまま出せる {n_ready}件（項目 {len(self.rows)}件・配信 {len(self.heads)}本）"


# ---------------------------------------------------------------- 書き出し

def out_path(key: str, content: Path = CONTENT) -> Path:
    return content / f"{key}.ts"


def read_baked(p: Path) -> dict | None:
    if not p.exists():
        return None
    t = p.read_text(encoding="utf-8")
    try:
        return json.loads(t[t.index(BEGIN) + len(BEGIN): t.index(END)])
    except ValueError:
        return None


def fingerprint(g: dict) -> str:
    body = {k: v for k, v in g.items() if k not in ("published", "updated", "hash")}
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def render(key: str, g: dict) -> str:
    rel = f"python/data/guide/{key}.json"
    return (
        "/**\n"
        f" * {g['name']}の面（`/travel/{key}`）の中身。**自動生成。手で直さない。**\n"
        " *\n"
        f" * 元は台本 `{rel}` と `streams/YYYY/MM/*.facts.json`。\n"
        f" * 直すなら台本か facts のほうを直して、`python3 python/guide_bake.py {key}` で焼き直す。\n"
        " * 一言の字・額・場面の秒は facts から写している（台本には結びしか無い）。\n"
        " */\n"
        'import type { CityGuide } from "@/content/travel/types";\n\n'
        f"export const GUIDE: CityGuide = {BEGIN}\n"
        + json.dumps(g, ensure_ascii=False, indent=1)
        + f"\n{END};\n"
    )


def bake(key: str, *, check: bool = False, today: str | None = None, root: Path = ROOT,
         content: Path = CONTENT, **kw) -> int:
    try:
        b = Baker(key, root=root, **kw)
        g = b.build()
    except Stop as e:
        print(f"::error::{e}")
        return 2
    if b.errors:
        for e in b.errors:
            print(f"::error::{e}")
        print(f"止めた: {len(b.errors)}件。何も書いていない")
        return 1
    p = out_path(key, content)
    old = read_baked(p)
    fp = fingerprint(g)
    day = today or today_jst()
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


# ---------------------------------------------------------------- 写真

def fetch_photos(key: str, root: Path = ROOT) -> int:
    from PIL import Image  # 写真を置くときだけ要る

    script = json.loads((root / "python/data/guide" / f"{key}.json").read_text(encoding="utf-8"))
    photos = script.get("photos") or {}
    if not photos:
        print("::error::台本に photos が無い")
        return 2
    req = urllib.request.Request(CARDS_API, headers={"User-Agent": "guide-bake"})
    with urllib.request.urlopen(req, timeout=60) as r:
        cards = json.load(r).get("cards") or []
    # **写真の id と url だけを拾う。** 同じ行の住人の名前・アイコンは、ここで読み捨てる
    url_of = {c["photoId"]: (c["url"], c.get("day")) for c in cards if c.get("photoId") and c.get("url")}
    out = root / "site/public/travel" / key
    out.mkdir(parents=True, exist_ok=True)
    bad = 0
    for k, p in photos.items():
        hit = url_of.get(p["id"])
        if not hit:
            print(f"::error::写真 {k}（{p['id']}）が本番のカードに無い")
            bad += 1
            continue
        url, day = hit
        if day != p["day"]:
            print(f"::error::写真 {k} の日が台本（{p['day']}）とカード（{day}）で違う")
            bad += 1
            continue
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "guide-bake"}), timeout=60) as r:
            data = r.read()
        from io import BytesIO

        im = Image.open(BytesIO(data))
        im = im.convert("RGB")
        if p.get("crop"):
            # 1枚に2品が写っているとき、その品の所だけを切り出す（割合で [左, 上, 右, 下]）
            x0, y0, x1, y1 = p["crop"]
            im = im.crop((round(im.width * x0), round(im.height * y0), round(im.width * x1), round(im.height * y1)))
        for w in WIDTHS:
            w2 = min(w, im.width)
            h = round(im.height * w2 / im.width)
            im.resize((w2, h), Image.LANCZOS).save(out / f"{k}-{w}.webp", "WEBP", quality=72, method=6)
        print(f"置いた: {k}（{p['day']}）")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", help="<国>/<街>（例: north-macedonia/skopje）")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--photos", action="store_true", help="台本の写真を本番の口から取って置く（外に出る）")
    ap.add_argument("--today", help="今日の日付（見張りが差し替える）")
    a = ap.parse_args(argv)
    if a.photos:
        return fetch_photos(a.key)
    return bake(a.key, check=a.check, today=a.today)


if __name__ == "__main__":
    sys.exit(main())
