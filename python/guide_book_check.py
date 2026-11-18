"""**ガイドブック型の街の面（#1228）の材料 `guidebook.json` を、数えて確かめる。マイマップの CSV もここで書く。**

    python3 python/guide_book_check.py                          # north-macedonia/skopje を確かめて、数を表で出す
    python3 python/guide_book_check.py north-macedonia/skopje   # 街を名指し
    python3 python/guide_book_check.py --mymaps                 # mymaps/{see,eat,buy}.csv を書き直す

終了コード 0=通った / 1=落ちた所がある / **2=数えるものが無い**（材料が無い・項目が0）。

## なぜ要るか

最初のスコピエの面は、**行っていないオフリドを「行った」と書いた**（`docs/island-misses.md` #324）。
材料は人（とエージェント）が集めるので、同じ外しかたは字を目で読んでも見落とす。
だから材料の側に、**機械で数えられる約束**を置いた（`guidebook.json` の `_meta`）:

1. **出どころの無い事実 0** — 事実を持つ欄（`text` `what` `why` `tone`）の入れ物は、`src`（https と見た日）か `facts`（配信の行）を持つ
2. **座標の無い店 0** — 食べたい・買いたいの店は全部 `lat` `lon` と `coord_src` を持つ。座標はスコピエとマトカ渓谷の枠の中
3. **facts に辿れない「行った」0** — `facts` の `id`（`動画ID@秒#種類`）は `streams/YYYY/MM/<stem>.facts.json` の行に1対1で当たる。
   確かめが要る行（`verify`）とチャットが出どころの行（`via`。視聴者さんの話）は使わない
4. **行っていない街の「行った」0** — `went` を持つ項目の `town` は、`python/data/guide/cities.json` にその国の街か日帰り（`trips`）として
   在るものだけ。しかも `went` の行の街・遠出と `town` が合うときだけ通る（オフリドの項目に、スコピエの行を結んでも落ちる）

5. **動画の欄（導線: 検索 → ブログ → ショート → アーカイブ → ライブ）** — 行った項目は `scene`（その項目の went の行の1つ）を持つ。
   `short` は `python/data/shorts.json`（`site/content/shorts.ts` の元）に在る北マケドニア（🇲🇰）のショートで、当てた理由（`shorts.items` の `basis` と facts）がある。
   行っていない項目には付けない（ショートの日付は出した日で、撮った日ではないので、日付では当てない）

ほかに、面の形の約束（表紙のひとこと3案・25字、どんな街の札2〜3枚・60字、エリア4〜6・多角形4〜8点、やりたいこと8まで・見出し30字、
実用ガイド6つ・ひとこと10個）・好みの印を付けない（`mark` `like` `syrup` を置かない。#1228 の返事）・
いまのハブの項目を全部引き継いでいる（`from_hub`）・CSV が材料と同じ、を見る。

## 対照

`python/guide_book_check_selftest.py` が、本物の材料を1か所ずつ壊した写しを当てて、その札だけで落ちるかを見る。
`python3 python/mutation_drill.py python/guide_book_check_selftest.py` でも当てられる。
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACT_KEYS = ("text", "what", "why", "tone")
NO_PREF = ("mark", "like", "syrup")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FID = re.compile(r"^([A-Za-z0-9_-]{11})@(\d+)#([a-z]+)$")
REF = re.compile(r"^(\d{2})-(\d{2}) (\d+):(\d{2}):(\d{2})$")
#: スコピエの街とマトカ渓谷が入る枠（南, 北, 西, 東）。外の座標は打ち間違いか、別の街
BBOX = (41.85, 42.15, 21.20, 21.75)
GUIDE_KEYS = ("airport", "transit", "pay", "sim", "safety", "phrases")
#: 自由に使えるライセンスだけ。NC（営利不可）・ND（改変不可）・fair use は落とす（docs/country-guide.md 1-2-1）
LIC_OK = re.compile(r"^(CC0|PD|CC BY \d\.\d|CC BY-SA \d\.\d)$")
CSV_COLS = ["名前", "緯度", "経度", "説明", "現地表記", "印", "Googleマップ"]


def plen(s: str) -> int:
    """面で読む字数。数字・英字も1字に数える（len と同じ）。"""
    return len(s)


class Book:
    def __init__(self, key: str, root: Path = ROOT, book: Path | None = None, mymaps: Path | None = None):
        self.key = key
        self.country, self.city = key.split("/")
        self.root = root
        self.path = book or root / "python/data/guide" / key / "guidebook.json"
        self.mymaps = mymaps or self.path.parent / "mymaps"
        self.errors: list[str] = []
        self.d = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else None
        self.rows = self._rows()
        self.towns = self._towns()

    # ------------------------------------------------------------ 材料
    def _rows(self) -> dict[str, dict]:
        out = {}
        for p in sorted((self.root / "streams").glob("*/*/*.facts.json")):
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
            except ValueError:
                continue
            for it in d.get("items", []):
                fid = f"{d.get('video_id')}@{it.get('t')}#{it.get('kind')}"
                out[fid] = {"v": d.get("video_id"), "date": d.get("date_local", ""), "country": d.get("country"),
                            "city": d.get("city"), "it": it}
        return out

    def _towns(self) -> set[str]:
        """行ったことのある街と、その街からの日帰り（cities.json）。ここに無い town は「行った」にできない。"""
        t = json.loads((self.root / "python/data/guide/cities.json").read_text(encoding="utf-8"))
        c = (t.get("countries") or {}).get(self.country) or {}
        out = set()
        for city, v in (c.get("cities") or {}).items():
            out.add(city)
            out |= set((v.get("trips") or {}).keys())
        return out

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    # ------------------------------------------------------------ 見る
    def check(self) -> None:
        d = self.d
        self.walk(d, "", self.city)
        self.check_from_hub()
        self.check_shape()
        self.check_stores()
        self.check_budget()
        self.check_photos()
        self.check_csv()

    def walk(self, x, where: str, town: str) -> None:
        # 分からないもの（unknown）は「無い理由」の一覧で、事実ではない。台本の注（_meta）も同じ
        if where.startswith((".unknown", "._meta")):
            return
        if isinstance(x, list):
            for i, y in enumerate(x):
                self.walk(y, f"{where}[{i}]", town)
            return
        if not isinstance(x, dict):
            return
        town = x.get("town", town)
        name = x.get("key") or x.get("name") or ""
        here = f"{where}{'(' + name + ')' if name else ''}"
        for k in NO_PREF:
            if k in x:
                self.err(here, f"好みの印「{k}」を置いている（あやとの好みで印を付けない。#1228）")
        has_fact = any(isinstance(x.get(k), str) and x.get(k).strip() for k in FACT_KEYS)
        if has_fact and not (x.get("src") or x.get("facts")):
            self.err(here, "出どころの無い事実（src も facts も無い）")
        if "src" in x:
            self.check_src(x["src"], here)
        if "coord_src" in x:
            self.check_src(x["coord_src"], here)
        if "lat" in x or "lon" in x:
            self.check_coord(x, here)
        if "facts" in x:
            self.check_facts(x["facts"], here, town, strict=False)
        if "went" in x:
            w = x["went"]
            if w is False:
                pass
            elif isinstance(w, dict) and w.get("facts"):
                if town not in self.towns:
                    self.err(here, f"行っていない街「{town}」を「行った」にしている（行った街: {', '.join(sorted(self.towns))}）")
                self.check_facts(w["facts"], here + ".went", town, strict=True)
            else:
                self.err(here, "went は false か {facts: [...]}（推測で true にしない）")
        if "key" in x and ("went" in x or "short" in x or "scene" in x):
            self.check_video(x, here)
        for k, v in x.items():
            if k in ("src", "coord_src", "facts"):
                continue
            if isinstance(v, (dict, list)):
                self.walk(v, f"{where}.{k}" if not name else f"{here}.{k}", town)

    def shorts_known(self) -> dict[str, str]:
        """チャンネルのショート（id → 題名）。

        **`site/content/shorts.ts` は字で読まない**（TS を読む口は `python/ts_read.py` の1本。docs/island-misses.md の208）。
        shorts.ts はこの控え（`python/data/shorts.json`）から `python/build_shorts.py` が焼くので、元の JSON を読む。
        """
        if not hasattr(self, "_shorts"):
            p = self.root / "python/data/shorts.json"
            d = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
            self._shorts = {s.get("id"): s.get("title", "") for s in d.get("shorts") or []}
        return self._shorts

    def check_video(self, x: dict, where: str) -> None:
        """導線（検索 → ブログ → ショート → アーカイブ → ライブ）の欄。行った項目だけが持ち、行った項目は場面を必ず持つ。"""
        went = x.get("went")
        if went and not x.get("scene"):
            self.err(where, "行った項目に場面（scene）が無い")
        if not went and (x.get("scene") or x.get("short")):
            self.err(where, "行っていない項目に scene・short を付けている")
        sc = x.get("scene")
        if sc and isinstance(went, dict):
            ids = {f.get("id") for f in went.get("facts") or []}
            if sc.get("id") not in ids:
                self.err(where, f"場面「{sc.get('id')}」がこの項目の went の行に無い")
            row = self.rows.get(sc.get("id", ""))
            if row and (sc.get("video") != row["v"] or sc.get("t") != row["it"].get("t")
                        or sc.get("url") != f"https://www.youtube.com/watch?v={row['v']}&t={row['it'].get('t')}s"):
                self.err(where, "場面の video・t・url が行と食い違う")
        sh = x.get("short")
        if sh:
            title = self.shorts_known().get(sh)
            if title is None:
                self.err(where, f"ショート「{sh}」が python/data/shorts.json に無い")
            elif "🇲🇰" not in title:
                self.err(where, f"ショート「{sh}」は北マケドニアのショートでない（{title}）")
            basis = {s.get("id"): s for s in ((self.d.get("shorts") or {}).get("items") or [])}.get(sh) or {}
            if not (basis.get("basis") or {}).get("facts"):
                self.err(where, f"ショート「{sh}」をこの項目に当てた理由（shorts.items の basis と facts）が無い")

    def check_src(self, src, where: str) -> None:
        if not isinstance(src, list) or not src:
            self.err(where, "出どころが空")
            return
        for s in src:
            if not isinstance(s, dict) or not str(s.get("url", "")).startswith("https://"):
                self.err(where, f"出どころの URL が https で始まらない（{s}）")
            elif not DAY.match(str(s.get("seen", ""))):
                self.err(where, f"出どころに見た日が無い（{s.get('url')}）")

    def check_coord(self, x: dict, where: str) -> None:
        lat, lon = x.get("lat"), x.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            self.err(where, "座標が数で無い")
            return
        s, n, w, e = BBOX
        if not (s <= lat <= n and w <= lon <= e):
            self.err(where, f"座標 {lat},{lon} がスコピエとマトカ渓谷の枠の外")
        if not x.get("coord_src"):
            self.err(where, "座標の出どころ（coord_src）が無い")

    def check_facts(self, fs, where: str, town: str, strict: bool) -> None:
        if not isinstance(fs, list) or not fs:
            self.err(where, "facts が空")
            return
        for f in fs:
            fid = f.get("id", "") if isinstance(f, dict) else ""
            m = FID.match(fid)
            row = self.rows.get(fid)
            if not m or row is None:
                self.err(where, f"facts の行に辿れない「{fid}」")
                continue
            it = row["it"]
            if it.get("verify"):
                self.err(where, f"「{fid}」は確かめが要る行（verify）。使わない")
            if it.get("via"):
                self.err(where, f"「{fid}」はチャットが出どころの行（via。視聴者さんの話）。使わない")
            if row["country"] != self.country or row["city"] not in self.towns:
                self.err(where, f"「{fid}」は{row['country']}/{row['city']}の配信。{self.key} の材料に結べない")
            if f.get("video") != row["v"] or f.get("t") != it.get("t") or f.get("kind") != it.get("kind"):
                self.err(where, f"「{fid}」の video・t・kind が id と食い違う")
            r = REF.match(str(f.get("ref", "")))
            if not r or f"{r.group(1)}-{r.group(2)}" != row["date"][5:] or \
                    int(r.group(3)) * 3600 + int(r.group(4)) * 60 + int(r.group(5)) != it.get("t"):
                self.err(where, f"「{fid}」の ref（{f.get('ref')}）が配信の日付・時刻と合わない")
            if f.get("url") != f"https://www.youtube.com/watch?v={row['v']}&t={it.get('t')}s":
                self.err(where, f"「{fid}」の url が配信の時刻を指していない")
            if strict:
                ftown = it.get("trip") or row["city"]
                if ftown != town:
                    self.err(where, f"「行った」の行「{fid}」は {ftown} の行で、この項目の街 {town} と合わない")

    def check_from_hub(self) -> None:
        hub = self.root / "python/data/guide" / f"{self.key}.json"
        if not hub.exists():
            return
        h = json.loads(hub.read_text(encoding="utf-8"))
        want = {f"{s}/{it['key']}" for s, v in (h.get("sections") or {}).items() for it in v.get("items", [])}
        got: set[str] = set()

        def grab(x):
            if isinstance(x, dict):
                got.update(x.get("from_hub") or [])
                for v in x.values():
                    grab(v)
            elif isinstance(x, list):
                for v in x:
                    grab(v)
        grab(self.d)
        for k in sorted(want - got):
            self.err("from_hub", f"いまのハブの「{k}」を引き継いでいない")
        for k in sorted(got - want):
            self.err("from_hub", f"「{k}」はいまのハブに無い鍵")

    def check_shape(self) -> None:
        d = self.d
        catch = (d.get("cover") or {}).get("catch") or []
        if len(catch) != 3:
            self.err("cover.catch", f"ひとことの紹介は3案（{len(catch)}案）")
        for c in catch:
            if plen(c.get("text", "")) > 25:
                self.err("cover.catch", f"25字を超える（{plen(c['text'])}字）「{c['text']}」")
        about = d.get("about") or {}
        cards = about.get("cards") or []
        # 2026-11-18 に 3〜4 から 2〜3 にした。問いはその街が何で語られているかで選び、基本情報と同じ話（お金・言葉）を
        # 置かない（あやと #1228「お金と言葉は基本情報に書いてあるので要らない」・`docs/island-misses.md` #332）
        if not 2 <= len(cards) <= 3:
            self.err("about.cards", f"札は2〜3枚（{len(cards)}枚）")
        for c in cards:
            if plen(c.get("text", "")) > 60:
                self.err(f"about.cards({c.get('key')})", f"60字を超える（{plen(c['text'])}字）")
        areas = about.get("areas") or []
        # 2026-11-18 に 4〜6 から 2〜6 にした。地区の名前は日本語のガイドの字だけで、分けすぎて見どころの無い地区は
        # 隣に含める（`docs/guide-copy.md` 5章）。スコピエは日本語の頁の分けかたが「旧市街・新市街」の2つ
        if not 2 <= len(areas) <= 6:
            self.err("about.areas", f"エリアは2〜6（{len(areas)}）")
        for a in areas:
            w = f"about.areas({a.get('key')})"
            # 名前は、日本語のガイドがその一帯をそう呼んでいる頁を持つ（作った呼び名を使わない。`docs/guide-copy.md` 5章）
            if not a.get("name_src"):
                self.err(w, f"名前「{a.get('name')}」の出どころ（name_src。日本語のガイドの頁）が無い")
            poly = (a.get("range") or {}).get("polygon") or []
            if not 4 <= len(poly) <= 8:
                self.err(w, f"範囲の多角形は4〜8点（{len(poly)}点）")
            for p in poly:
                if not (isinstance(p, list) and len(p) == 2):
                    self.err(w, f"多角形の点の形が違う（{p}）")
                    continue
                s, n, we, e = BBOX
                if not (s <= p[0] <= n and we <= p[1] <= e):
                    self.err(w, f"多角形の点 {p} が枠の外")
            if not (a.get("range") or {}).get("src"):
                self.err(w, "範囲の出どころが無い")
            if not (a.get("center") or {}).get("lat"):
                self.err(w, "中心の座標が無い")
            if not 1 <= len(a.get("landmarks") or []) <= 2:
                self.err(w, "目印は1〜2個")
            if "went" not in a:
                self.err(w, "went（行ったか）が無い")
        todo = d.get("todo") or []
        if not 1 <= len(todo) <= 8:
            self.err("todo", f"やりたいことは8まで（{len(todo)}）")
        for t in todo:
            w = f"todo({t.get('key')})"
            if plen(t.get("head", "")) > 30:
                self.err(w, f"見出しが30字を超える（{plen(t['head'])}字）")
            if "went" not in t:
                self.err(w, "went（行ったか）が無い")
            if not t.get("points"):
                self.err(w, "本文の要点が無い")
            ph = t.get("photo") or {}
            if not ph.get("commons") and not ph.get("card"):
                self.err(w, "写真の候補が無い")
        for sec in ("see",):
            for it in d.get(sec) or []:
                if "went" not in it:
                    self.err(f"{sec}({it.get('key')})", "went（行ったか）が無い")
        for it in (d.get("eat") or {}).get("items") or []:
            w = f"eat({it.get('key')})"
            for k in ("alcohol", "pork"):
                if k not in it or it[k] not in (True, False, None):
                    self.err(w, f"{k} は true / false / null")
                if it.get(k) is None and not it.get(f"{k}_note"):
                    self.err(w, f"{k} が null なのに {k}_note（店や作りで違う理由）が無い")
            if not it.get("kinds"):
                self.err(w, "札の種類（kinds）が無い")
        kinds = {k["key"] for k in (d.get("eat") or {}).get("kinds") or []}
        for it in (d.get("eat") or {}).get("items") or []:
            for k in it.get("kinds") or []:
                if k not in kinds:
                    self.err(f"eat({it.get('key')})", f"種類「{k}」が kinds に無い")
        guide = (d.get("basics") or {}).get("guide") or []
        keys = [g.get("key") for g in guide]
        if tuple(keys) != GUIDE_KEYS:
            self.err("basics.guide", f"実用ガイドは {'・'.join(GUIDE_KEYS)} の6つ（{keys}）")
        for g in guide:
            if g.get("key") == "phrases":
                ph = g.get("phrases") or []
                if len(ph) != 10:
                    self.err("basics.guide(phrases)", f"ひとことは10個（{len(ph)}個）")
                if not g.get("phrases_src"):
                    self.err("basics.guide(phrases)", "ひとことの出どころが無い")
                else:
                    self.check_src(g["phrases_src"], "basics.guide(phrases)")
                for p in ph:
                    if not all(p.get(k) for k in ("mk", "roman", "kana", "ja")):
                        self.err("basics.guide(phrases)", f"ひとことの欄が欠けている（{p}）")
        summary = (d.get("basics") or {}).get("summary") or []
        if [s.get("key") for s in summary] != ["season", "safety", "budget", "transit"]:
            self.err("basics.summary", "要約は 旬の季節・治安・予算・移動 の4枚")
        clim = (d.get("basics") or {}).get("climate") or {}
        if len(clim.get("months") or []) != 12 or not clim.get("src"):
            self.err("basics.climate", "月ごとの気温と雨は12か月と出どころ")
        emb = ((d.get("basics") or {}).get("emergency") or {}).get("embassy") or {}
        if not emb.get("name") or not emb.get("src"):
            self.err("basics.emergency.embassy", "大使館の名前と出どころが無い")
        for s in (d.get("shorts") or {}).get("items") or []:
            if s.get("id") not in self.shorts_known():
                self.err("shorts", f"ショート「{s.get('id')}」が python/data/shorts.json に無い")
        for u in d.get("unknown") or []:
            if not (u.get("what") and u.get("why")):
                self.err("unknown", f"分からないものには what と why（{u}）")

    def stores(self, sec: str) -> list[tuple[dict, dict]]:
        out = []
        for it in (self.d.get(sec) or {}).get("items") or []:
            for s in it.get("stores") or []:
                out.append((it, s))
        return out

    def check_stores(self) -> None:
        for sec in ("eat", "buy"):
            for it, s in self.stores(sec):
                w = f"{sec}({it.get('key')}).stores({s.get('key')})"
                if not isinstance(s.get("lat"), (int, float)) or not isinstance(s.get("lon"), (int, float)):
                    self.err(w, "座標の無い店")
                if not s.get("why"):
                    self.err(w, "なぜその店かが無い")
                if "went" not in s:
                    self.err(w, "went（行ったか）が無い")

    def check_budget(self) -> None:
        b = (self.d.get("basics") or {}).get("budget") or {}
        for day in b.get("days") or []:
            parts = day.get("parts") or []
            for p in parts:
                if not p.get("facts"):
                    self.err(f"basics.budget({day.get('label')})", f"「{p.get('label')}」の額に配信の行が無い")
            if sum(p.get("yen", 0) for p in parts) != day.get("total_yen"):
                self.err(f"basics.budget({day.get('label')})", "内訳の足し算が合計と合わない")
        for x in b.get("extras") or []:
            if not x.get("src"):
                self.err("basics.budget.extras", f"「{x.get('label')}」に出どころが無い")

    def check_photos(self) -> None:
        def each(x, where):
            if isinstance(x, dict):
                if "thumbs" in x or ("file" in x and "lic" in x):
                    w = f"{where}({x.get('file')})"
                    if not LIC_OK.match(str(x.get("lic", ""))):
                        self.err(w, f"自由に使えるライセンスで無い（{x.get('lic')}）")
                    for k in ("by", "lic", "page", "alt"):
                        if not x.get(k):
                            self.err(w, f"写真に {k} が無い（作者とライセンスを出す決まり）")
                    if not str(x.get("page", "")).startswith("https://commons.wikimedia.org/wiki/File:"):
                        self.err(w, "元のページが Wikimedia Commons で無い")
                    th = x.get("thumbs") or {}
                    ow = x.get("w")
                    if not isinstance(ow, int) or ow <= 0:
                        self.err(w, "写真の元の幅（w）が無い")
                        ow = 0
                    # 元より大きい幅は Wikimedia が返さないので、元より小さい幅だけを求める
                    for wd in [s for s in ("250", "500", "960") if int(s) < ow]:
                        u = str(th.get(wd, ""))
                        if not (u.startswith("https://upload.wikimedia.org/wikipedia/commons/thumb/") and f"/{wd}px-" in u):
                            self.err(w, f"{wd} 幅の URL が無い（Wikimedia の決まった幅）")
                for k, v in x.items():
                    each(v, f"{where}.{k}")
            elif isinstance(x, list):
                for i, v in enumerate(x):
                    each(v, f"{where}[{i}]")
        each(self.d.get("todo"), "todo")
        each(self.d.get("see"), "see")
        each(self.d.get("eat"), "eat")
        each(self.d.get("buy"), "buy")

    # ------------------------------------------------------------ CSV
    def csv_rows(self) -> dict[str, list[dict]]:
        def mk(name, lat, lon, what, local, went, q):
            return {"名前": name, "緯度": f"{lat:.6f}", "経度": f"{lon:.6f}", "説明": (what or "")[:240],
                    "現地表記": local or "", "印": "あやとが行った" if went else "", "Googleマップ": q}

        see = []
        for it in self.d.get("see") or []:
            if isinstance(it.get("lat"), (int, float)):
                what = it["what"]["text"] if isinstance(it.get("what"), dict) else it.get("what", "")
                see.append(mk(it["name"], it["lat"], it["lon"], what, (it.get("local") or {}).get("text"),
                              bool(it.get("went")), it.get("maps", "")))
        out = {"see.csv": see}
        for sec in ("eat", "buy"):
            seen: dict[str, dict] = {}
            for it, s in self.stores(sec):
                k = s.get("key")
                if k in seen:
                    seen[k]["説明"] = (seen[k]["説明"] + "／" + it["name"])[:240]
                    continue
                why = s["why"]["text"] if isinstance(s.get("why"), dict) else s.get("why", "")
                seen[k] = mk(s["name"], s["lat"], s["lon"], f"{it['name']}：{why}", s.get("local"),
                             bool(s.get("went")), s.get("maps", ""))
            out[f"{sec}.csv"] = list(seen.values())
        return out

    @staticmethod
    def csv_text(rows: list[dict]) -> str:
        b = io.StringIO()
        w = csv.DictWriter(b, fieldnames=CSV_COLS, lineterminator="\r\n")
        w.writeheader()
        w.writerows(rows)
        return "﻿" + b.getvalue()

    def write_csv(self) -> None:
        self.mymaps.mkdir(parents=True, exist_ok=True)
        for name, rows in self.csv_rows().items():
            # **BOM 付きで書く。** My Maps の取り込みは、無いと日本語が化ける（python/bulgaria_mymaps.py と同じ）
            (self.mymaps / name).write_text(self.csv_text(rows), encoding="utf-8", newline="")
            print(f"{name}: {len(rows)}件 → {self.mymaps / name}")

    def check_csv(self) -> None:
        try:
            rows = self.csv_rows()
        except (KeyError, TypeError) as e:
            self.err("mymaps", f"CSV を組めない（{e}）")
            return
        for name, rs in rows.items():
            p = self.mymaps / name
            if not p.exists():
                self.err(f"mymaps/{name}", "CSV が無い（--mymaps で書く）")
            elif p.read_bytes().decode("utf-8") != self.csv_text(rs):
                self.err(f"mymaps/{name}", "CSV が材料と食い違う（材料を直したら --mymaps で書き直す）")
            if not rs:
                self.err(f"mymaps/{name}", "CSV の行が0")

    # ------------------------------------------------------------ 数
    def counts(self) -> list[tuple[str, str]]:
        d = self.d
        todo = d.get("todo") or []
        see = d.get("see") or []
        eat = (d.get("eat") or {}).get("items") or []
        buy = (d.get("buy") or {}).get("items") or []

        def went(xs):
            return sum(1 for x in xs if x.get("went"))

        def nstores(sec):
            return len({s.get("key") for _, s in self.stores(sec)})
        empty = [it["name"] for it in eat if not it.get("stores")]
        guide = (d.get("basics") or {}).get("guide") or []
        areas = (d.get("about") or {}).get("areas") or []
        return [
            ("やりたいこと", f"{len(todo)}（うち行った {went(todo)}）"),
            ("見たいもの", f"{len(see)}（うち行った {went(see)}・座標あり {sum(1 for x in see if 'lat' in x)}）"),
            ("食べたいもの", f"{len(eat)}品（店 {nstores('eat')}軒・うち行った店 {sum(1 for _, s in self.stores('eat') if s.get('went'))}。店の無い品 {len(empty)}: {'・'.join(empty) or 'なし'}）"),
            ("買いたいもの", f"{len(buy)}品（店 {nstores('buy')}軒）"),
            ("実用ガイド", f"{len(guide)}項目"),
            ("エリア", f"{len(areas)}（うち行った {went(areas)}）"),
            ("動画", self.video_count()),
            ("分からないもの", f"{len(d.get('unknown') or [])}件"),
        ]

    def video_count(self) -> str:
        scene, short = [], []

        def grab(x):
            if isinstance(x, dict):
                if "key" in x and x.get("scene"):
                    scene.append(x["key"])
                if "key" in x and x.get("short"):
                    short.append((x["key"], x["short"]))
                for v in x.values():
                    grab(v)
            elif isinstance(x, list):
                for v in x:
                    grab(v)
        grab({k: v for k, v in self.d.items() if k != "shorts"})
        allmk = [s.get("id") for s in (self.d.get("shorts") or {}).get("items") or []]
        used = {s for _, s in short}
        return f"場面 {len(scene)}項目・ショート {len(short)}項目（北マケドニアのショート {len(allmk)}本のうち付いた {len(used & set(allmk))}本）"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("key", nargs="?", default="north-macedonia/skopje")
    ap.add_argument("--mymaps", action="store_true", help="mymaps/{see,eat,buy}.csv を書き直す")
    ap.add_argument("--root", type=Path, default=ROOT, help="リポジトリの場所（見張りが差し替える）")
    ap.add_argument("--book", type=Path, help="guidebook.json の場所（見張りが差し替える）")
    ap.add_argument("--mymaps-dir", type=Path, help="CSV の置き場（見張りが差し替える）")
    a = ap.parse_args(argv)
    b = Book(a.key, root=a.root, book=a.book, mymaps=a.mymaps_dir)
    if b.d is None:
        print(f"::error::材料が無い: {b.path}")
        return 2
    n = len(b.d.get("todo") or []) + len(b.d.get("see") or []) + len((b.d.get("eat") or {}).get("items") or [])
    if n == 0 or not b.rows:
        print("::error::数えるものが無い（項目が0か、facts.json が1本も無い）")
        return 2
    if a.mymaps:
        b.write_csv()
    b.check()
    print(f"| {a.key} | 数 |\n| --- | --- |")
    for k, v in b.counts():
        print(f"| {k} | {v} |")
    for e in b.errors:
        print(f"::error::{e}")
    print(f"落ちた所 {len(b.errors)}件")
    return 1 if b.errors else 0


if __name__ == "__main__":
    sys.exit(main())
