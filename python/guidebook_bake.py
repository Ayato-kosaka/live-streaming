"""**ガイドブック型の街の面（`/travel/<国>/<街>`）の中身を、材料と組み立てと facts から焼く。**（#1228）

    python3 python/guidebook_bake.py north-macedonia/skopje            # 焼く（site/content/guidebook/north-macedonia-skopje.ts）
    python3 python/guidebook_bake.py north-macedonia/skopje --check    # 焼かずに、焼いてあるものが今の材料と同じかだけ（違えば 1）
    python3 python/guidebook_bake.py north-macedonia/skopje --photos   # 組み立てのカードの写真を本番の口から取って置く（外に出る）

終了コード 0=焼けた・同じ / 1=材料か組み立てに食い違いがある（何も書かない）/ 2=材料が無い。

## 何から何を焼くか

| 置き場 | 何 | 書く人 |
| --- | --- | --- |
| `python/data/guide/<国>/<街>/guidebook.json` | **骨組みと事実。** 行く前のガイド（出どころつき）と、行った事実（facts の行への結び） | 材料を集める担当（`python/guide_book_check.py` が見る） |
| `python/data/guide/<国>/<街>/compose.json` | **組み立て。** どのカードの写真・どの一言・どの話・エリアの色と並び・要約の短い字 | 面を作る側 |
| `streams/YYYY/MM/*.facts.json` | 配信から抜いた「実際に行った」 | `python/guide_facts.py` |
| `python/data/guide/<国>/<街>/mymaps/mids.json` | マイマップの埋め込みの id（**在るときだけ**。無いあいだ、面は地図の枠を出さない） | マイマップを作る担当 |

型は `site/content/guidebook/types.ts`（ソフィアと同じ）。**面に出す字は、ここで1字も足さない**——
足すのは材料と組み立ての字を並べ替えたものと、数えた数（やりたいこと◯選）だけ。

## 骨組みと肉付けの分けかた（`docs/guide-design.md` ★1）

材料の字の入れ物は、`src`（外の出どころ）か `facts`（配信の行）を持つ。

- **`src` を持つ字 → 骨組み**（窓の中の本文・事実の並び。出どころの行が付く）
- **`facts` だけを持つ字 → 肉付け**（「行った」の箱の中の話。場面のリンクは箱に1つ）

だから、材料の担当が書いた「あやとは…」の字は、行った箱に入る。組み立ての `story` は、材料に話の無い
行った項目にだけ足す。**数は結んだ行どおり**（結んだ行に無い数を書くと止める。`guide_bake.Baker.allowed_numbers`）。

## 一言と動画（#1228 の導線: 検索 → ブログ → ショート → アーカイブ → ライブ）

- 一言は節に1つまで（`compose.say`）。字はその項目の場面の行の `quote` から写す——**組み立てには字を書かない**
- 行った項目の動画は ① ショート（`short`）→ ② 場面（`scene`）。場面の無い行った項目は止める
- 好みの印は持たない（#326）。料理と飲み物は `pork` `alcohol` を `flags` に写すだけ

## 写真

- **行った項目は、その日のあやと島カード**（`compose.cards`。カードの日が、その項目の行った日のどれかでないと止める）。
  置き場は `site/public/travel/<国>/<街>/<名前>-{480,960}.webp`（前のハブと記事と同じ所。取りかたも前のハブの `guide_bake.fetch_photos` と同じ口）
- **行っていない項目は、材料の借りた写真**（Wikimedia Commons）。作者とライセンスを持たない写真は使わない。
  **面は Commons から直に読まない**——`python/guide_photos.py` が `site/public/guide/<国>/<街>/photos/` に落とした絵を指す
  （置き場に無ければ止める。混んだ日に Wikimedia が 429 で断り、前の見どころマップのピンが白い丸になった）
- 描いた絵（表紙・エリア地図・やりたいこと・料理・土産）は面の側が `public/guide/<国>/<街>/manifest.json` から読む（ここでは触らない）

## 最終更新の日付

`guide_bake.py` と同じ。**中身の字が変わったときだけ進める**（頭に中身の指紋を持たせる）。公開の日付は組み立ての `published`。
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_bake as gb  # noqa: E402  facts の読みかた・数の確かめ・指紋・カードの写真の口は、記事と同じものを使う
import guide_facts as gf  # noqa: E402
import guide_photos as gp  # noqa: E402  借りた写真の置き場の道は1か所で引く
from maps_link import search as maps_search  # noqa: E402  Google マップの道は1か所で組む

ROOT = gb.ROOT
CONTENT = ROOT / "site/content/guidebook"
PUBLIC = ROOT / "site/public"
BEGIN, END = gb.BEGIN, gb.END

#: 中心から何km離れたら「中心から離れた所」に出すか（歩いて行かない所）
FAR_KM = 2.5
#: マイマップの題に名前が無いときの、節の名前
LABEL = {"see": "見たいもの", "eat": "食べたいもの", "buy": "買いたいもの"}
#: どのエリアにも入らない見どころを、いちばん近いエリアに入れてよい距離
AREA_KM = 1.2


class Stop(Exception):
    """材料が無い（終了 2）。"""


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    p = math.radians
    h = math.sin(p(b[0] - a[0]) / 2) ** 2 + math.cos(p(a[0])) * math.cos(p(b[0])) * math.sin(p(b[1] - a[1]) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def inside(pt: tuple[float, float], poly: list[list[float]]) -> bool:
    """点が多角形の中か（緯度・経度。偶奇の数えかた）"""
    lat, lon = pt
    hit = False
    for i in range(len(poly)):
        (y1, x1), (y2, x2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def has_src(x) -> bool:
    return isinstance(x, dict) and bool(x.get("src"))


def text_of(x) -> str:
    return x.get("text", "").strip() if isinstance(x, dict) else ""


class Book:
    def __init__(self, key: str, root: Path = ROOT, streams: Path | None = None):
        self.key = key
        self.country, self.city = key.split("/")
        self.root = root
        d = root / "python/data/guide" / key
        self.dir = d
        for f in ("guidebook.json", "compose.json"):
            if not (d / f).exists():
                raise Stop(f"{key} の {f} が無い（{d / f}）")
        self.g = json.loads((d / "guidebook.json").read_text(encoding="utf-8"))
        self.c = json.loads((d / "compose.json").read_text(encoding="utf-8"))
        # facts の行は記事と同じ拾いかた（確かめの済んでいないファイルが1本でもあれば止まる）
        try:
            self.b = gb.Baker(key, root=root, streams=streams, script=d / "compose.json")
        except gb.Stop as e:
            raise Stop(str(e)) from e
        self.rows = {f"{x['v']}@{x['t']}#{x['it']['kind']}": x for x in self.b.rows}
        self.table = json.loads((root / "python/data/guide/cities.json").read_text(encoding="utf-8"))
        self.errors: list[str] = []
        self.used_cards: set[str] = set()
        self.said: dict[str, str] = {}

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    # ------------------------------------------------------------ facts
    def row(self, fid: str, where: str) -> dict | None:
        x = self.rows.get(fid)
        if x is None:
            self.err(where, f"facts の行「{fid}」が無い")
            return None
        if x["hold"]:
            self.err(where, f"「{fid}」は{'確かめが要る行' if x['hold'] == 'verify' else 'チャットが出どころの行'}。面に出さない")
            return None
        return x

    def rows_of(self, fs, where: str) -> list[dict]:
        out = []
        for f in fs or []:
            fid = f["id"] if isinstance(f, dict) else f
            x = self.row(fid, where)
            if x:
                out.append(x)
        return out

    @staticmethod
    def scene(x: dict) -> dict:
        return {"v": x["v"], "t": x["t"], "date": x["date"]}

    def check_numbers(self, text: str, xs: list[dict], where: str, extra: set[str] | None = None) -> None:
        # 測った値の「何を測ったか」の字（「60番のバスに乗ってから…」）も、その行の字
        meas = {n for x in xs for n in gf.numbers_in((x["it"].get("measured") or {}).get("what", ""))}
        bad = gf.numbers_in(text) - self.b.allowed_numbers(xs) - meas - (extra or set())
        if bad:
            self.err(where, f"「{text[:40]}…」の数 {sorted(bad)} が、結んだ行に無い（言っていない数を足さない）")

    def check_short(self, text: str, source: str, where: str) -> None:
        """要約の字（組み立て）の数が、元の材料の字に在るか"""
        bad = gf.numbers_in(text) - gf.numbers_in(source)
        if bad:
            self.err(where, f"「{text}」の数 {sorted(bad)} が、材料の字に無い")

    # ------------------------------------------------------------ 出どころ・写真
    @staticmethod
    def src(*groups) -> list[dict]:
        seen: set[str] = set()
        out = []
        for g in groups:
            for s in g or []:
                if s.get("url") and s["url"] not in seen:
                    seen.add(s["url"])
                    out.append({"name": s["name"], "url": s["url"], "seen": s.get("seen", "")})
        return out

    def commons(self, p: dict | None, where: str) -> dict | None:
        """借りた写真。**島の置き場に落とした絵**（960・500。`python/guide_photos.py`）。作者・ライセンス・元のページは材料のまま"""
        if not p:
            return None
        for k in ("file", "by", "lic", "page", "alt", "w"):
            if not p.get(k):
                self.err(where, f"借りた写真に {k} が無い（作者とライセンスを出す決まり）")
                return None
        # 面は Wikimedia から直に読まない（混んだ日に 429 で断られ、ピンが白い丸になった）。置き場に落とした絵を配る
        big = gp.local(self.key, p["file"], 960, self.root)
        small = gp.local(self.key, p["file"], 500, self.root)
        if not big or not small:
            self.err(where, f"借りた写真「{p['file']}」が置き場に無い（先に python3 python/guide_photos.py {self.key}）")
            return None
        w, h = gb.Baker._size(self.root / "site/public" / big.lstrip("/"))
        return {"src": big, "small": small, "w": w, "h": h, "alt": p["alt"], "kind": "photo",
                "credit": {"by": p["by"], "lic": p["lic"], "page": p["page"]}}

    def card(self, name: str, where: str, days: set[str] | None = None) -> dict | None:
        """あやと島カードの写真。**行った項目は、行った日のカードだけ**"""
        c = (self.c.get("cards") or {}).get(name)
        if not c:
            self.err(where, f"カード「{name}」が compose.json の cards に無い")
            return None
        if days is not None and c["day"] not in days:
            self.err(where, f"カード「{name}」の日 {c['day']} が、この項目の行った日（{'・'.join(sorted(days))}）に無い")
        base = f"/travel/{self.key}/{name}"
        files = {w: PUBLIC / f"{base.lstrip('/')}-{w}.webp" for w in gb.WIDTHS}
        missing = [str(f.relative_to(self.root)) if f.is_relative_to(self.root) else str(f) for f in files.values() if not f.exists()]
        if missing:
            self.err(where, f"カードの絵が無い（{', '.join(missing)}）。先に --photos")
            return None
        self.used_cards.add(name)
        w, h = gb.Baker._size(files[gb.WIDTHS[-1]])
        return {"src": f"{base}-{gb.WIDTHS[-1]}.webp", "small": f"{base}-{gb.WIDTHS[0]}.webp", "w": w, "h": h,
                "alt": c["alt"], "kind": "card", "date": c["day"]}

    def card_by_id(self, cid: str) -> str | None:
        return next((k for k, v in (self.c.get("cards") or {}).items() if v["id"] == cid), None)

    def local(self, loc, lang: str = "mk") -> dict | None:
        if not isinstance(loc, dict) or not loc.get("text"):
            return None
        out = {"text": loc["text"], "lang": loc.get("lang", lang)}
        if loc.get("roman"):
            out["roman"] = loc["roman"]
        # 読みの仮名。エリアの短い名前（おしゃれエリア）に、現地の呼び名（デバル・マーロ）を添えるのに使う
        if loc.get("kana"):
            out["kana"] = loc["kana"]
        return out

    # ------------------------------------------------------------ 行った箱
    def went(self, sec: str, x: dict, where: str, story_from: list = (), facts: list | None = None) -> dict | None:
        """行った人の話。**場面は1つ**（材料の `scene`。無ければ結んだ最初の行）。

        `story_from` は材料の字の入れ物のうち、`facts` だけを持つもの（あやとの体験）。組み立ての `story` は後ろに足す
        """
        key = x.get("key", "")
        ckey = f"{sec}/{key}"
        comp = (self.c.get("items") or {}).get(ckey) or {}
        w = x.get("went")
        fs = facts if facts is not None else ((w or {}).get("facts") if isinstance(w, dict) else None)
        if not fs:
            if comp.get("story") or (self.c.get("say") or {}).get(sec) == key:
                self.err(where, "行っていない項目に、組み立ての話か一言を付けている")
            return None
        rows = self.rows_of(fs, where)
        if not rows:
            return None
        sc = x.get("scene")
        at = self.row(sc["id"], f"{where}.scene") if sc else rows[0]
        if sc and at and sc["id"] not in {f["id"] if isinstance(f, dict) else f for f in fs}:
            self.err(where, f"場面「{sc['id']}」がこの項目の行った行に無い")
        if at is None:
            return None
        story: list[str] = []
        for t in story_from:
            if text_of(t) and not has_src(t):
                xs = self.rows_of(t.get("facts"), where)
                self.check_numbers(text_of(t), xs, where)
                story.append(text_of(t))
        if comp.get("story"):
            s = comp["story"]
            xs = self.rows_of(s.get("facts"), f"{where}.story")
            self.check_numbers(s["text"], xs, f"{where}.story")
            story.append(s["text"])
        out: dict = {"date": min(r["date"] for r in rows), "scene": self.scene(at)}
        if story:
            out["story"] = story
        if x.get("short"):
            out["short"] = x["short"]
        if (self.c.get("say") or {}).get(sec) == key:
            q = at["it"].get("quote")
            if not q:
                self.err(where, f"一言に選んだのに、場面の行（{sc and sc['id']}）に本人の一言（quote）が無い")
            else:
                out["say"] = q
                self.said[sec] = key
        return out

    def went_days(self, x: dict) -> set[str]:
        w = x.get("went")
        return {r["date"] for r in self.rows_of((w or {}).get("facts") if isinstance(w, dict) else [], "")}

    def pic_for(self, sec: str, x: dict, where: str, fallback: dict | None) -> dict | None:
        """行った項目はその日のカード、行っていない項目は借りた写真"""
        name = ((self.c.get("items") or {}).get(f"{sec}/{x.get('key')}") or {}).get("card")
        if name:
            if not x.get("went") and sec != "eat-note":
                self.err(where, f"行っていない項目に、カード「{name}」を付けている")
            return self.card(name, where, self.went_days(x) if sec != "eat-note" else None)
        return self.commons(fallback, where)

    # ------------------------------------------------------------ 節
    def about(self) -> dict:
        """どんな街の問いと答え。**問いは組み立て**（`compose.about.<key>.q`）、**答えは材料の字のまま**（`about.cards[].text`）。

        前は大きい数の札（`num` `unit`）だった。数を大きく見せる札は AI の作った面に見える、とあやとに言われて
        問いと答えにした（#1228・2026-11-16・`docs/island-misses.md` #327）。問いに数を入れない（事実は答えの側に置く）
        """
        a = self.g["about"]
        comp = self.c.get("about") or {}
        cards = []
        for c in a["cards"]:
            w = f"about.cards({c['key']})"
            q = (comp.get(c["key"]) or {}).get("q", "")
            if not q:
                self.err(w, "問い（compose.json の about.<key>.q）が無い")
                continue
            if len(q) > 15 or not q.endswith("？") or re.search(r"\d", q):
                self.err(w, f"問いは15字まで・「？」で終わる・数を入れない（{q}）")
            card: dict = {"id": c["key"]}
            # 問いの頭の絵（`components/ui/Icon` の名前。違う名前は面の型が止める）
            if comp[c["key"]].get("icon"):
                card["icon"] = comp[c["key"]]["icon"]
            cards.append({**card, "q": q, "a": c["text"], "src": self.src(c.get("src"))})
        return {"cards": cards, "areas": []}

    def areas(self, see: list[dict]) -> list[dict]:
        comp = self.c.get("areas") or {}
        out = []
        for a in self.g["about"]["areas"]:
            w = f"about.areas({a['key']})"
            c = comp.get(a["key"])
            if not c:
                self.err(w, "エリアの色と並び（compose.json の areas）が無い")
                continue
            # 札（エリア地図）には最初の1文だけ。残りは窓の中
            first, _, more = text_of(a.get("tone")).partition("。")
            area = {"id": a["key"], "name": a["name"], "color": c["color"], "lead": first, "see": [],
                    "plan": c["plan"], "src": self.src((a.get("tone") or {}).get("src"), (a.get("local") or {}).get("src"),
                                                     (a.get("range") or {}).get("src"))}
            if more.strip():
                area["body"] = more.strip()
            loc = self.local(a.get("local"))
            if loc:
                area["local"] = loc
            wt = self.went("area", a, w)
            if wt:
                area["went"] = wt
            out.append(area)
        # 見どころをエリアに入れる。**線（多角形）の中**が先、どれにも入らなければ、近いエリアの中心から AREA_KM まで。
        # （前は座標を持つやりたいことも入れて、見どころマップの写真のピンの代表にしていた。2026-11-16 にピンをやめた）
        raw = {a["key"]: a for a in self.g["about"]["areas"]}
        for it, spec in zip(see, self.g["see"]):
            if "lat" not in spec or spec.get("town") != self.g["city"]["town"]:
                continue
            pt = (spec["lat"], spec["lon"])
            dist = {k: km(pt, (r["center"]["lat"], r["center"]["lon"])) for k, r in raw.items()}
            hits = [k for k, r in raw.items() if inside(pt, r["range"]["polygon"])]
            pick = min(hits, key=dist.get) if hits else min(dist, key=dist.get)
            if hits or dist[pick] <= AREA_KM:
                it["area"] = pick
                next(x for x in out if x["id"] == pick)["see"].append(it["id"])
        return out

    def see(self) -> tuple[list[dict], list[dict]]:
        center = next(s for s in self.g["see"] if s.get("rank") == 1 and "lat" in s)
        sq = next((s for s in self.g["see"] if s["key"] == "square"), center)
        items, far = [], []
        for s in self.g["see"]:
            w = f"see({s['key']})"
            what = s.get("what") or {}
            it: dict = {"id": s["key"], "name": s["name"]}
            loc = self.local(s.get("local"))
            if loc:
                it["local"] = loc
            if s.get("rank"):
                it["rank"] = s["rank"]
            pic = self.pic_for("see", s, w, s.get("photo"))
            if pic:
                it["pic"] = pic
            it["body"] = text_of(what) if has_src(what) else ""
            it["facts"] = [{"label": i["label"], "text": i["text"]} for i in s.get("info") or []]
            if s.get("maps"):
                it["maps"] = s["maps"]
            if (s.get("links") or {}).get("todo"):
                it["todo"] = s["links"]["todo"]
            it["src"] = self.src(what.get("src"), *[i.get("src") for i in s.get("info") or []], (s.get("local") or {}).get("src"),
                                 (s.get("photo") or {}).get("src"))
            wt = self.went("see", s, w, story_from=[what])
            if wt:
                it["went"] = wt
            if "lat" in s:
                # 面には出さない。検索と AI の読み手に渡す見どころの名札（`components/guidebook/SpotsLd.tsx`）だけが読む（#1262）
                it["geo"] = {"lat": s["lat"], "lon": s["lon"]}
                d = km((sq["lat"], sq["lon"]), (s["lat"], s["lon"]))
                if d >= FAR_KM:
                    k = round(d, 1) if d < 10 else round(d)
                    it["line"] = f"中心から{k:g}km"
                    far.append({"id": s["key"], "name": re.sub(r"（.*?）$", "", s["name"]), "what": "", "maps": s.get("maps", ""), "km": k})
            items.append(it)
        return items, far

    def todo(self) -> list[dict]:
        out = []
        for t in self.g["todo"]:
            w = f"todo({t['key']})"
            pts = t.get("points") or {}
            ext = {k: [p for p in pts.get(k) or [] if has_src(p)] for k in ("what", "why", "how", "time", "money", "tips", "route")}
            own = [p for k in ("what", "why", "how", "time", "money", "tips", "route") for p in pts.get(k) or [] if not has_src(p)]
            join = lambda ps: "".join(text_of(p) for p in ps)  # noqa: E731
            ph = t.get("photo") or {}
            pic = None
            # 1枚のカードを2つに切って使う日がある（食堂コスモスのチェバピと豆の煮込み）。どちらの切りかたかは組み立てで選ぶ
            comp_card = ((self.c.get("items") or {}).get(f"todo/{t['key']}") or {}).get("card")
            if t.get("went") and comp_card:
                pic = self.card(comp_card, w, self.went_days(t))
            elif t.get("went") and ph.get("card"):
                name = self.card_by_id(ph["card"]["id"])
                if not name:
                    self.err(w, f"材料のカード {ph['card']['id']} が compose.json の cards に無い")
                else:
                    pic = self.card(name, w, self.went_days(t))
            if not pic:
                pic = self.commons((ph.get("commons") or [None])[0], w)
            it = {"id": t["key"], "title": t["title"], "lead": t["head"], "what": join(ext["what"] + ext["why"]),
                  "how": join(ext["how"]), "time": join(ext["time"]), "money": join(ext["money"]), "tip": join(ext["tips"]),
                  "route": join(ext["route"]), "see": (t.get("links") or {}).get("see") or [],
                  "src": self.src(*[p.get("src") for k in ext for p in ext[k]])}
            if (t.get("links") or {}).get("eat"):
                it["eat"] = t["links"]["eat"]
            # 題は「〜したい！」で20字まで（`docs/guide-copy.md` 3章。飾りはリードへ）
            if len(t["title"]) > 20 or not t["title"].endswith("！"):
                self.err(w, f"題は「〜したい！」の形で20字まで（{len(t['title'])}字「{t['title']}」）")
            # 札の印は値段か季節だけ・12字まで（`docs/island-misses.md` #328。やりたいことの題は、その街ならではの話なので
            # 「その国ならでは」の印は付けない）。印の数は、窓に出す字（出どころつき）か、あやとの行の字に在るものだけ
            marks = []
            for m in t.get("marks") or []:
                if m.get("kind") not in ("price", "season") or not m.get("text") or len(m["text"]) > 12:
                    self.err(w, f"札の印は値段（price）か季節（season）で12字まで（{m}）")
                    continue
                said = "".join(text_of(p) for ps in pts.values() for p in ps or [])
                if gf.numbers_in(m["text"]) - gf.numbers_in(said):
                    self.err(w, f"札の印「{m['text']}」の数が、窓の字に無い")
                marks.append({"kind": m["kind"], "text": m["text"]})
            if marks:
                it["marks"] = marks
            if pic:
                it["pic"] = pic
            wt = self.went("todo", t, w, story_from=own)
            if wt:
                it["went"] = wt
            elif own:
                self.err(w, "行っていないやりたいことに、あやとの体験の字（facts だけの字）がある")
            out.append(it)
        if not 1 <= len(out) <= 8:
            self.err("todo", f"やりたいことは8まで（{len(out)}）")
        return out

    def places(self, sec: str, sq: tuple[float, float]) -> list[dict]:
        out: dict[str, dict] = {}
        for it in self.g[sec]["items"]:
            for s in it.get("stores") or []:
                if s["key"] in out:
                    out[s["key"]]["went"] = out[s["key"]].get("went") or bool(s.get("went"))
                    continue
                p = {"id": s["key"], "name": s["name"], "what": text_of(s.get("why")), "maps": s["maps"],
                     "src": self.src((s.get("why") or {}).get("src"))}
                if s.get("local") and s["local"] != s["name"]:
                    p["roman"] = s["local"]
                if s.get("went"):
                    p["went"] = True
                d = km(sq, (s["lat"], s["lon"]))
                if d >= FAR_KM:
                    p["km"] = round(d, 1)
                out[s["key"]] = p
        return list(out.values())

    def dish(self, sec: str, it: dict, city_local: str) -> dict:
        w = f"{sec}({it['key']})"
        what = it.get("what") or {}
        out: dict = {"id": it["key"], "name": it["name"]}
        loc = self.local(it.get("local"))
        if loc:
            out["local"] = loc
        pic = self.pic_for(sec, it, w, it.get("photo"))
        if pic:
            out["pic"] = pic
        out["body"] = text_of(what) if has_src(what) else ""
        facts = []
        stores = it.get("stores") or []
        if stores:
            facts.append({"label": "どこで", "text": "・".join(s["name"] for s in stores)})
        for k, label in (("pork_note", "豚肉"), ("alcohol_note", "アルコール"), ("where_note", "買える所")):
            if has_src(it.get(k)):
                facts.append({"label": label, "text": text_of(it[k])})
        out["facts"] = facts
        if loc:
            # 料理と土産は「品の現地の名前＋街」で近くの店が並ぶ（#1228 決めたこと4。ソフィアと同じ）
            out["maps"] = maps_search(loc["text"], city_local)
        if stores:
            out["places"] = [s["key"] for s in stores]
        if it.get("kinds"):
            out["kinds"] = it["kinds"]
        flags = {k: True for k in ("pork", "alcohol") if it.get(k) is True}
        if flags:
            out["flags"] = flags
        out["src"] = self.src(what.get("src"), *[(it.get(k) or {}).get("src") for k in ("pork_note", "alcohol_note", "where_note")],
                              (it.get("local") or {}).get("src"), (it.get("photo") or {}).get("src"))
        own = [what, it.get("related"), it.get("note")]
        wt = self.went(sec, it, w, story_from=[x for x in own if x])
        if wt:
            out["went"] = wt
        return out

    def went_notes(self) -> list[dict]:
        """食べたものの「行った店」（地図に置けない所）。材料の `eat.went_notes`"""
        out = []
        for n in self.g["eat"].get("went_notes") or []:
            w = f"eat.went_notes({n['key']})"
            comp = (self.c.get("items") or {}).get(f"eat/{n['key']}") or {}
            if not comp.get("kinds"):
                self.err(w, "絞りの札（compose.json の kinds）が無い")
            it = {"id": n["key"], "name": n["name"], "body": "", "facts": [], "kinds": comp.get("kinds") or [], "src": []}
            days = {r["date"] for r in self.rows_of(n.get("facts"), w)}
            name = comp.get("card")
            if name:
                pic = self.card(name, w, days)
                if pic:
                    it["pic"] = pic
            wt = self.went("eat", {"key": n["key"], "went": {"facts": n.get("facts")}}, w, story_from=[n])
            if wt:
                it["went"] = wt
            out.append(it)
        return out

    def guides(self) -> list[dict]:
        comp = self.c.get("guides") or {}
        out = []
        for g in self.g["basics"]["guide"]:
            w = f"basics.guide({g['key']})"
            c = comp.get(g["key"]) or {}
            pts = g.get("points") or []
            ext = [p for p in pts if has_src(p)]
            own = [p for p in pts if not has_src(p)]
            words = None
            if g.get("phrases"):
                words = [{"local": {"text": p["mk"], "lang": "mk", "roman": p["roman"], "kana": p["kana"]}, "jp": p["ja"]} for p in g["phrases"]]
            lead = c.get("lead")
            if not lead and words:
                lead = f"{words[0]['local']['text']}（{words[0]['local']['kana']}）＝{words[0]['jp']}"
            if not lead:
                self.err(w, "札の1行（compose.json の guides の lead）が無い")
                lead = ""
            self.check_short(lead, " ".join(text_of(p) for p in pts) + " ".join(p.get("ja", "") for p in g.get("phrases") or []), w)
            x = {"id": g["key"], "icon": c.get("icon", ""), "title": g["title"], "lead": lead,
                 "parts": [{"h": "", "text": text_of(p)} for p in ext],
                 "src": self.src(*[p.get("src") for p in ext], g.get("phrases_src"))}
            if g["key"] == "safety":
                wa = (self.g["basics"].get("emergency") or {}).get("water")
                if has_src(wa):
                    x["parts"].append({"h": "水道水", "text": text_of(wa)})
                    x["src"] = self.src(x["src"], wa.get("src"))
            if words:
                x["words"] = words
            if own:
                fs = [f for p in own for f in p.get("facts") or []]
                wt = self.went("guide", {"key": g["key"]}, w, story_from=own, facts=fs)
                if wt:
                    x["went"] = wt
            if x["icon"] not in self.b.icons:
                self.err(w, f"絵「{x['icon']}」が IconName に無い")
            out.append(x)
        return out

    def season(self) -> dict:
        b = self.g["basics"]
        s = next(x for x in b["summary"] if x["key"] == "season")
        parts = [{"h": "歩きやすい季節", "text": s["text"]}, {"h": "祝日", "text": b["holidays"]["text"]},
                 {"h": "時差", "text": b["time"]["text"]}]
        lead = (self.c.get("season") or {}).get("lead", "")
        self.check_short(lead, s["text"], "season")
        x = {"id": "season", "icon": "sun", "title": "季節と行事", "lead": lead, "parts": parts,
             "src": self.src(s.get("src"), b["holidays"].get("src"), b["time"].get("src"))}
        own = [b["holidays"].get("went"), b.get("autumn")]
        own = [o for o in own if o and not has_src(o)]
        if own:
            wt = self.went("guide", {"key": "season"}, "season", story_from=own, facts=[f for o in own for f in o.get("facts") or []])
            if wt:
                x["went"] = wt
        return x

    def basics(self) -> dict:
        b = self.g["basics"]
        comp = self.c.get("summary") or {}
        summary = []
        for s in b["summary"]:
            c = comp.get(s["key"])
            w = f"basics.summary({s['key']})"
            if not c:
                self.err(w, "要約の短い字（compose.json の summary）が無い")
                continue
            self.check_short(c["value"] + " " + c["lead"], s["text"], w)
            if c["icon"] not in self.b.icons:
                self.err(w, f"絵「{c['icon']}」が IconName に無い")
            summary.append({"id": s["key"], "icon": c["icon"], "label": c.get("label", s["title"]), "value": c["value"],
                            "lead": c["lead"], "to": c["to"]})
        bud = b["budget"]
        days = []
        for d in bud.get("days") or []:
            parts = []
            for p in d["parts"]:
                w = f"basics.budget({d['label']}・{p['label']})"
                xs = self.rows_of(p.get("facts"), w)
                if not xs:
                    continue
                # 額は、その行の「言ったままの額」と同じであること（円は本人がその場で円に直したもの）
                said = {gf.as_num(a["value"]) for x in xs for a in x["it"].get("amounts") or [] if a.get("unit") == "円"}
                if str(p["yen"]) not in said:
                    self.err(w, f"{p['yen']}円 が、結んだ行の額（{sorted(said)}）に無い")
                parts.append({"label": p["label"], "yen": p["yen"], "at": self.scene(xs[0])})
            if sum(p["yen"] for p in parts) != d["total_yen"]:
                self.err(f"basics.budget({d['label']})", "内訳の足し算が合計と合わない")
            days.append({"label": d["label"], "parts": parts})
        extras = [{"label": x["label"], "local": f"{x['den']}デナル", "yen": f"{x['yen']}円", "src": self.src(x.get("src"))}
                  for x in bud.get("extras") or []]
        note = None
        if bud.get("note") and not has_src(bud["note"]):
            note = self.went("guide", {"key": "budget"}, "basics.budget.note", story_from=[bud["note"]], facts=bud["note"].get("facts"))
        pack = []
        for p in b.get("packing") or []:
            w = f"basics.packing({p['key']})"
            icon = (self.c.get("pack") or {}).get(p["key"], "")
            if icon not in self.b.icons:
                self.err(w, f"絵「{icon}」が IconName に無い（compose.json の pack）")
            label, _, why = p["text"].partition("。")
            pack.append({"icon": icon, "label": label, "why": why.strip(), "src": self.src(p.get("src"))})
        cl = b["climate"]
        climate = {"months": [{"hi": m["high"], "lo": m["low"], "mm": m["rain_mm"]} for m in cl["months"]],
                   "note": f"平均最高と平均最低。{cl['where']}", "src": self.src(cl.get("src"))}
        em = b["emergency"]
        calls = []
        for n in em["numbers"]:
            label, _, note2 = n["what"].partition("（")
            calls.append({"num": n["no"], "label": label, "note": note2.rstrip("）"), "src": self.src(n.get("src"))})
        e = em["embassy"]
        help_ = {"calls": calls, "embassy": {"name": e["name"], "address": e["address"], "tel": e["tel"], "note": text_of(e),
                                            "maps": e["maps"], "src": self.src(e.get("src"))}}
        budget: dict = {"rows": [], "tips": [], "days": days, "extras": extras, "rate": self.g["rate"]["text"],
                        "rateSrc": self.src(self.g["rate"].get("src"))}
        if note:
            budget["note"] = note
        if bud.get("article"):
            budget["article"] = bud["article"]
        return {"summary": summary, "guides": self.guides(), "season": self.season(), "budget": budget, "pack": pack,
                "climate": climate, "help": help_}

    def mymaps(self, sq: tuple[float, float]) -> dict[str, dict]:
        """マイマップの埋め込み。**`mymaps/mids.json` が在るときだけ**（作るのは別の担当。EC2 の Chrome から）。

        形はソフィアの `python/data/bulgaria/mymaps/mids.json` と同じ（`maps: [{which, mid, title, pins}]`）。
        開いた時点の中心と縮尺は**ピンの広がりから出す**（`build_bulgaria.py` の `view` と同じ式。手で書いて2回外した）。
        ピンは同じ置き場の CSV（マイマップに取り込んだもの）。見たいものは中心から FAR_KM までで枠を決める
        """
        p = self.dir / "mymaps" / "mids.json"
        if not p.exists():
            return {}
        d = json.loads(p.read_text(encoding="utf-8"))
        out: dict[str, dict] = {}
        for m in (d.get("maps") if isinstance(d, dict) else d) or []:
            which, mid = m.get("which"), m.get("mid")
            w = f"mymaps.{which}"
            if which not in ("see", "eat", "buy") or not mid:
                self.err(w, "mids.json の行に which（see・eat・buy）と mid が無い")
                continue
            f = self.dir / "mymaps" / f"{which}.csv"
            rows = list(csv.DictReader(f.read_text(encoding="utf-8-sig").splitlines())) if f.exists() else []
            pts = [(float(r["緯度"]), float(r["経度"])) for r in rows if r.get("緯度") and r.get("経度")]
            near = [q for q in pts if which != "see" or km(sq, q) < FAR_KM]
            if not near:
                self.err(w, f"{f.name} にピンが無い（枠の中心と縮尺が出せない）")
                continue
            la, lo = [q[0] for q in near], [q[1] for q in near]
            clat, clon = (min(la) + max(la)) / 2, (min(lo) + max(lo)) / 2
            dlon = max(max(lo) - min(lo), 1e-4) * 1.35
            dlat = max(max(la) - min(la), 1e-4) * 1.35 * (400 / 300)
            span = max(dlon, dlat / math.cos(math.radians(clat)))
            z = max(12, min(17, math.floor(math.log2(360.0 / span * (400 / 256)))))
            out[which] = {"mid": mid, "title": m.get("title") or f"{self.g['city']['name']}｜{LABEL[which]}", "ll": f"{clat:.4f},{clon:.4f}",
                          "z": z, "pins": int(m.get("pins") or len(pts))}
        return out

    # ------------------------------------------------------------ 全部
    def build(self) -> dict:
        g, c = self.g, self.c
        city_local = g["city"]["local"]["text"]
        sq_spec = next((s for s in g["see"] if s["key"] == "square"), None)
        sq = (sq_spec["lat"], sq_spec["lon"]) if sq_spec else (0.0, 0.0)
        see, far = self.see()
        about = self.about()
        todo = self.todo()
        about["areas"] = self.areas(see)
        eat = [self.dish("eat", it, city_local) for it in g["eat"]["items"]] + self.went_notes()
        buy = [self.dish("buy", it, city_local) for it in g["buy"]["items"]]
        cover = c.get("cover") or {}
        catch = (g.get("cover") or {}).get("catch") or []
        if not isinstance(cover.get("catch"), int) or not 0 <= cover["catch"] < len(catch):
            self.err("cover", "表紙のひとことは、材料の cover.catch の何番目かで選ぶ")
            lead = ""
        else:
            lead = catch[cover["catch"]]["text"]
        pic = self.card(cover.get("card", ""), "cover")
        counts = {"todo": len(todo), "see": len(see), "eat": len(g["eat"]["items"])}
        desc = c["description"]["text"].format(**counts)
        self.check_numbers(desc, self.rows_of(c["description"].get("facts"), "description"), "description",
                           extra={str(v) for v in counts.values()})
        if len(desc) > 120:
            self.err("description", f"120字まで（{len(desc)}字）")
        for sec, key in (c.get("say") or {}).items():
            if self.said.get(sec) != key:
                self.err(f"say.{sec}", f"一言に選んだ「{key}」が、その節の行った項目に無い")
        unused = set(c.get("cards") or {}) - self.used_cards
        if unused:
            self.err("cards", f"使っていないカード {sorted(unused)}（組み立てに残すと、どこに出たかが追えない）")
        if not c.get("persona") or not c.get("terms"):
            # 面の頭に、誰が・何を調べて読むかを書く（#323 の決めごと4）
            self.err("compose", "persona（読む人）と terms（狙う語）が無い")
        shorts = sorted((s for s in (g.get("shorts") or {}).get("items") or []), key=lambda s: s["date"])
        maps = self.mymaps(sq)
        return {
            "country": self.country, "city": self.city, "name": g["city"]["name"],
            "kicker": self.table["countries"][self.country]["name"],
            "local": {"text": city_local, "lang": g["city"]["local"]["lang"], "roman": g["city"]["local"]["roman"]},
            "lead": lead, "cover": pic or {}, "title": c["title"].format(**counts), "description": desc,
            "rate": {"unit": "デナル", "yen": round(g["rate"]["eur_jpy"] / g["rate"]["eur_mkd"], 2), "date": "2026-11-13"},
            "about": about, "todo": todo,
            "see": {"items": see, "far": far, **({"map": maps["see"]} if "see" in maps else {})},
            "eat": {"kinds": [{"id": k["key"], "label": k["name"]} for k in g["eat"]["kinds"]], "items": eat, "places": self.places("eat", sq),
                    **({"map": maps["eat"]} if "eat" in maps else {})},
            "buy": {"items": buy, "places": self.places("buy", sq), **({"map": maps["buy"]} if "buy" in maps else {})},
            "videos": {"streams": {"country": self.country, "city": self.table["countries"][self.country]["name"]},
                       "shorts": [s["id"] for s in shorts]},
            "basics": self.basics(),
        }

    def report(self, g: dict) -> str:
        """行った項目の数と、ショートが付いた項目・場面だけの項目の数（あやとに報告する数）"""
        secs = {"やりたいこと": g["todo"], "エリア": g["about"]["areas"], "見たい": g["see"]["items"],
                "食べたい": g["eat"]["items"], "買いたい": g["buy"]["items"]}
        out, tw, ts, tc = [], 0, 0, 0
        for name, xs in secs.items():
            went = [x for x in xs if x.get("went")]
            sh = [x for x in went if x["went"].get("short")]
            tw, ts, tc = tw + len(went), ts + len(sh), tc + len(went) - len(sh)
            out.append(f"  {name}: {len(xs)}件（行った {len(went)}・ショートつき {len(sh)}・場面だけ {len(went) - len(sh)}）")
        says = sum(1 for xs in secs.values() for x in xs if (x.get("went") or {}).get("say"))
        head = f"行った {tw}件（ショートつき {ts}・場面だけ {tc}）・一言 {says}・この街のショート {len(g['videos']['shorts'])}本"
        return "\n".join([head, *out])


# ---------------------------------------------------------------- 書き出し

def out_path(key: str, content: Path = CONTENT) -> Path:
    return content / f"{key.replace('/', '-')}.ts"


def const_of(key: str) -> str:
    return key.split("/")[1].upper().replace("-", "_")


def render(key: str, g: dict) -> str:
    return (
        "/**\n"
        f" * {g['name']}のガイドブック（`/travel/{key}`）の中身。**自動生成。手で直さない。**\n"
        " *\n"
        f" * 元は `python/data/guide/{key}/guidebook.json`（骨組みと事実）・`compose.json`（組み立て）・`streams/YYYY/MM/*.facts.json`。\n"
        f" * 直すならそちらを直して、`python3 python/guidebook_bake.py {key}` で焼き直す。\n"
        " * 一言の字と場面の秒は facts から写している（組み立てには、どの項目の一言かしか無い）。\n"
        " */\n"
        'import type { Guidebook } from "./types";\n\n'
        f"export const {const_of(key)}: Guidebook = {BEGIN}\n"
        + json.dumps(g, ensure_ascii=False, indent=1)
        + f"\n{END};\n"
    )


def bake(key: str, *, check: bool = False, today: str | None = None, root: Path = ROOT, content: Path = CONTENT,
         streams: Path | None = None) -> int:
    try:
        b = Book(key, root=root, streams=streams)
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
    old = gb.read_baked(p)
    fp = gb.fingerprint(g)
    day = today or gb.today_jst()
    g = {**g, "published": b.c["published"],
         "updated": (old or {}).get("updated") if old and old.get("hash") == fp else day, "hash": fp}
    text = render(key, g)
    rel = p.relative_to(root) if p.is_relative_to(root) else p
    if check:
        same = p.exists() and p.read_text(encoding="utf-8") == text
        print(("同じ" if same else "焼き直しが要る") + f": {rel}")
        print(b.report(g))
        return 0 if same else 1
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print(f"焼いた: {rel}（指紋 {fp}・公開 {g['published']}・最終更新 {g['updated']}）")
    print(b.report(g))
    return 0


def fetch_cards(key: str, root: Path = ROOT) -> int:
    """組み立てのカードのうち、置き場に無いものを本番の口から取る（`guide_bake.fetch_photos` と同じ口と同じ寸法）"""
    from io import BytesIO

    from PIL import Image

    c = json.loads((root / "python/data/guide" / key / "compose.json").read_text(encoding="utf-8"))
    out = root / "site/public/travel" / key
    want = {k: v for k, v in (c.get("cards") or {}).items() if not all((out / f"{k}-{w}.webp").exists() for w in gb.WIDTHS)}
    if not want:
        print("カードの絵は全部置いてある")
        return 0
    out.mkdir(parents=True, exist_ok=True)
    cards = json.loads(gb._get(gb.CARDS_API)).get("cards") or []
    # **写真の id と url だけを拾う。** 同じ行の住人の名前・アイコンは、ここで読み捨てる（#1203）
    url_of = {x["photoId"]: (x["url"], x.get("day")) for x in cards if x.get("photoId") and x.get("url")}
    bad = 0
    for k, p in want.items():
        hit = url_of.get(p["id"])
        if not hit or hit[1] != p["day"]:
            print(f"::error::カード {k}（{p['id']}・{p['day']}）が本番に無いか、日が違う")
            bad += 1
            continue
        gb._save(Image.open(BytesIO(gb._get(hit[0]))), out, k, p.get("crop"))
        print(f"置いた: {k}（{p['day']}）")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", help="<国>/<街>（例: north-macedonia/skopje）")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--photos", action="store_true", help="組み立てのカードの写真を本番の口から取って置く（外に出る）")
    ap.add_argument("--today", help="今日の日付（見張りが差し替える）")
    a = ap.parse_args(argv)
    if a.photos:
        return fetch_cards(a.key)
    return bake(a.key, check=a.check, today=a.today)


if __name__ == "__main__":
    sys.exit(main())
