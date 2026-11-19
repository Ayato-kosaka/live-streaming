"""**facts.json に結んだ面（旅のガイドの記事）の共通の土台。** facts の行の読みかた・結び・数の確かめ・写真。

    python3 python/guide_bake.py north-macedonia/skopje/prices --photos   # 台本の写真を本番の口と Wikimedia から取って、絵を置く（外に出る）

終了コード 0=置けた / 1=取れない写真がある / 2=台本に写真が無い。

## いま、これを使っているもの

| 使う人 | 何に |
| --- | --- |
| `python/guide_article.py`（記事 `/travel/<国>/<街>/<話>`） | `Baker`（facts の行・結び・額の見せかた・写真）と、指紋・書き出しの印 |
| `python/guidebook_bake.py`（街のガイドブック `/travel/<国>/<街>`） | `Baker` の facts の行と数の確かめ、カードの写真の口（`CARDS_API` `_get` `_save`）、指紋 |

## 前は街の面（ハブ）もここで焼いていた（2026-11-15 まで）

スコピエの街の面は、台本 `python/data/guide/north-macedonia/skopje.json` からここで焼いていた。
**ガイドブック型（#1228）に移したので、ハブの組み立てと書き出しは外した。** 台本は、引き継ぎ漏れの見張り
（`python/guide_book_check.py` の `from_hub`）の相手として残してある。

一緒に**好みの印も外した**（`mark_of` と好みの言葉の表。`docs/island-misses.md` #326）。あやとの好み（豚・酒・
ローカル市場）で品に ◎○⚠ を付けていた。記事は印を使っていない。街のガイドブックは、豚肉あり・アルコールありを
事実のアイコンで出すだけ（`components/guidebook/parts.tsx` の `FlagMarks`）。

## 結び（`refs`）の形

台本に書くのは facts の行への結び（`"10-14 1:38:30"`、絞るなら `#種類` `@動画`）だけで、本人の一言の字・額・場面の秒は
ここが facts から写す。**確かめが要る行（`verify`）とチャットが出どころの行（`via`）は結べない。**

## 写真（`--photos`）

- **あやとの写真**（`photos`）: 本番の `GET /island-api/cards` から、**台本に書いた写真の id の `url`（素の写真。
  住人は立っていない）だけ**を取る。同じ行に在る住人の名前とアイコンは読み捨てる——**保存しない・書き出さない**（#1203）
- **借りた写真**（`commons`）: Wikimedia Commons のファイル。作者・ライセンス・元のページを台本に書き、面に出す

どちらも 480px と 960px 幅の WebP にして `site/public/travel/<国>/<街>/<鍵>-<幅>.webp` に置く。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
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



REF = re.compile(r"^(\d\d-\d\d) (\d+:\d\d:\d\d)(?: ?#(\w+))?(?: ?@([\w-]+))?$")
DAY = re.compile(r"^\d{4}-\d\d-\d\d$")
WIDTHS = (480, 960)


class Stop(Exception):
    """台本か材料が無い（終了 2）。"""


def today_jst() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d")


def fmt_amount(v: float) -> str:
    return f"{int(v):,}" if v == int(v) else f"{v:g}"


def mins(sec: int) -> str:
    return f"{sec / 60:g}"


def icon_names(path: Path) -> set[str]:
    """面で使える絵の名前（`IconName` の並び）。**台本の打ち間違いで、絵の無い札を出さない**"""
    t = path.read_text(encoding="utf-8")
    body = t[t.index("export type IconName"):]
    body = body[: body.index(";")]
    return set(re.findall(r'"([a-z][a-zA-Z0-9]*)"', body))


class Baker:
    """台本1本を、facts と突き合わせる。記事（`guide_article.py`）と街のガイドブック（`guidebook_bake.py`）が使う。"""

    def __init__(self, key: str, root: Path = ROOT, streams: Path | None = None, table: Path | None = None,
                 script: Path | None = None, pre_trip: bool = False):
        self.key = key
        # 行く前の街（配信の facts が1本も無い街）。**街のガイドブックだけが立てる**——記事は行った話なので、
        # facts が無ければ止まるのが正しい。ガイドブックは骨組み（出どころつきの外の事実）だけで焼ける（#1292）
        self.pre_trip = pre_trip
        self.country, self.city = key.split("/")
        self.root = root
        self.streams = streams or root / "streams"
        self.table = gf.load_table(table or root / "python/data/guide/cities.json")
        self.script_path = script or root / "python/data/guide" / f"{key}.json"
        if not self.script_path.exists():
            raise Stop(f"台本が無い: {self.script_path}")
        self.s = json.loads(self.script_path.read_text(encoding="utf-8"))
        self.icons = icon_names(ROOT / "site/components/ui/icons/index.ts")
        self.errors: list[str] = []
        self.used: set[int] = set()        # 使った行（id）。数を報告に出す
        self._index()

    # ------------------------------------------------------------ 材料
    def _index(self) -> None:
        files = [p for p in gf.find_files(self.streams, [], None)
                 if gf.head_of(p).get("country") == self.country and gf.head_of(p).get("city") == self.city]
        if not files and not self.pre_trip:
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

    @staticmethod
    def scene(x: dict) -> dict:
        return {"v": x["v"], "t": x["t"], "date": x["date"]}

    # ------------------------------------------------------------ 字の確かめ
    def allowed_numbers(self, xs: list[dict], ext: list[dict] | None = None) -> set[str]:
        """結んだ行の数（と、外の出どころの1行の数）。記事（`guide_article.py`）も同じものを使う"""
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

    def check_numbers(self, text: str, xs: list[dict], where: str) -> None:
        extra = gf.numbers_in(text) - self.allowed_numbers(xs)
        if extra:
            self.errors.append(f"{where}: 「{text}」の数 {sorted(extra)} が、結んだ行に無い（言っていない数を足さない）")

    @staticmethod
    def measured_sec(it: dict) -> int:
        m = it["measured"]
        a, b = (sn.sec(*re.fullmatch(sn.TIME, m[k]).groups()) for k in ("from", "to"))
        return b - a

    # ------------------------------------------------------------ 配信から写す部品
    def quote(self, ref: str, where: str) -> dict | None:
        x = self.find(ref, where)
        if not x:
            return None
        q = x["it"].get("quote")
        if not q:
            self.errors.append(f"{where}: 「{ref}」には本人の一言（quote）が無い")
            return None
        return {"q": q, "at": self.scene(x)}

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

    def price_row(self, spec, where: str) -> dict | None:
        """値段の1行。`"10-12 0:21:00"` か `{"ref": …, "what": "表に出す名前"}`"""
        ref, label = (spec, None) if isinstance(spec, str) else (spec["ref"], spec.get("what"))
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
        if label:
            self.check_numbers(label, [x], where)
        return {"what": label or it["what"], "amount": amt, "at": self.scene(x)}

    # ------------------------------------------------------------ 外の出どころ
    def src(self, xs, where: str) -> list[dict]:
        out = []
        for i, e in enumerate(xs or []):
            w = f"{where}.src[{i}]"
            for k in ("name", "url", "seen"):
                if not e.get(k):
                    self.errors.append(f"{w}: 出どころに {k} が無い（出どころの無い事実は載せない）")
            if not str(e.get("url", "")).startswith("https://"):
                self.errors.append(f"{w}: 出どころが https の URL でない")
            if e.get("seen") and not DAY.match(e["seen"]):
                self.errors.append(f"{w}: 見た日の形が YYYY-MM-DD でない（{e['seen']}）")
            out.append({k: e.get(k, "") for k in ("name", "url", "seen")})
        return out

    def ext(self, e: dict, where: str) -> dict:
        """外の出どころの1行（`{text, src, name, seen}`）。記事（`guide_article.py`）の Keyword が使う"""
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
        out = {"text": spec["text"], "lang": spec["lang"], "src": spec.get("src", "")}
        for k in ("roman", "kana"):
            if spec.get(k):
                out[k] = spec[k]
        return out

    # ------------------------------------------------------------ 写真
    def photo(self, key: str | None, where: str) -> dict | None:
        if not key:
            return None
        mine = (self.s.get("photos") or {}).get(key)
        lent = (self.s.get("commons") or {}).get(key)
        if not mine and not lent:
            self.errors.append(f"{where}: 写真「{key}」が台本の photos にも commons にも無い")
            return None
        base = f"/travel/{self.key}/{key}"
        files = {w: PUBLIC / f"{base.lstrip('/')}-{w}.webp" for w in WIDTHS}
        missing = [str(f.relative_to(ROOT)) for f in files.values() if not f.exists()]
        if missing:
            self.errors.append(f"{where}: 写真の絵が無い（{', '.join(missing)}）。先に --photos")
            return None
        w, h = self._size(files[WIDTHS[-1]])
        # 切り出した写真は元より大きく焼かない（`fetch_photos`）。並べる幅は、置いた絵の実寸から
        set_w = {w_: self._size(f)[0] for w_, f in files.items()}
        p = mine or lent
        out = {"src": f"{base}-{WIDTHS[-1]}.webp",
               "srcSet": ", ".join(f"{base}-{w_}.webp {set_w[w_]}w" for w_ in WIDTHS),
               "w": w, "h": h, "alt": p["alt"]}
        if mine:
            day = mine["day"]
            v = next((hd["v"] for hd in self.heads if hd["date"] == day), None)
            if not v:
                self.errors.append(f"{where}: 写真の日 {day} の配信が facts に無い（出どころのリンクが張れない）")
            out |= {"day": day, "v": v or ""}
        else:
            for k in ("by", "lic", "page"):
                if not lent.get(k):
                    self.errors.append(f"{where}: 借りた写真「{key}」に {k} が無い（作者とライセンスを出す決まり）")
            if not str(lent.get("page", "")).startswith("https://commons.wikimedia.org/"):
                self.errors.append(f"{where}: 借りた写真「{key}」の元のページが Wikimedia Commons でない")
            out |= {"by": lent.get("by", ""), "lic": lent.get("lic", ""), "page": lent.get("page", "")}
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

    def icon(self, name: str, where: str) -> str:
        if name not in self.icons:
            self.errors.append(f"{where}: 絵「{name}」が `IconName` に無い")
        return name


# ---------------------------------------------------------------- 書き出しの印（記事とガイドブックが使う）

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


# ---------------------------------------------------------------- 写真

def commons_url(name: str, width: int | None) -> str:
    """Commons のファイルの置き場（名前の MD5 で決まる）。`width` を付けると縮めた絵"""
    n = name.replace(" ", "_")
    h = hashlib.md5(n.encode("utf-8")).hexdigest()
    q = urllib.parse.quote(n)
    if not width:
        return f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{q}"
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{width}px-{q}"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "guide-bake/1.0 (static travel guide; photos with credit)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _save(im, out: Path, k: str, crop=None) -> None:
    from PIL import Image  # 写真を置くときだけ要る

    im = im.convert("RGB")
    if crop:
        # 1枚に2品が写っているとき、その品の所だけを切り出す（割合で [左, 上, 右, 下]）
        x0, y0, x1, y1 = crop
        im = im.crop((round(im.width * x0), round(im.height * y0), round(im.width * x1), round(im.height * y1)))
    for w in WIDTHS:
        w2 = min(w, im.width)
        h = round(im.height * w2 / im.width)
        im.resize((w2, h), Image.LANCZOS).save(out / f"{k}-{w}.webp", "WEBP", quality=72, method=6)


def fetch_photos(key: str, root: Path = ROOT, only_commons: bool = False) -> int:
    from io import BytesIO

    from PIL import Image

    script = json.loads((root / "python/data/guide" / f"{key}.json").read_text(encoding="utf-8"))
    photos = {} if only_commons else (script.get("photos") or {})
    lent = script.get("commons") or {}
    if not photos and not lent:
        print("::error::台本に photos も commons も無い")
        return 2
    out = root / "site/public/travel" / key
    out.mkdir(parents=True, exist_ok=True)
    bad = 0
    if photos:
        cards = json.loads(_get(CARDS_API)).get("cards") or []
        # **写真の id と url だけを拾う。** 同じ行の住人の名前・アイコンは、ここで読み捨てる
        url_of = {c["photoId"]: (c["url"], c.get("day")) for c in cards if c.get("photoId") and c.get("url")}
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
            _save(Image.open(BytesIO(_get(url))), out, k, p.get("crop"))
            print(f"置いた: {k}（{p['day']}）")
    for k, p in lent.items():
        # 置いてある借りた写真は取り直さない。**続けて取ると Wikimedia に締め出される**（429。2026-11-14 に
        # 16枚を間を置かずに取って、半分が断られた）。取り直すときは絵を消してから回す
        if (out / f"{k}-{WIDTHS[-1]}.webp").exists():
            continue
        # 元の幅が 960px より小さいファイルは、縮めた絵が無い（Commons は元より大きい縮小を返さない）
        url = commons_url(p["file"], WIDTHS[-1] if p.get("w", 0) > WIDTHS[-1] else None)
        data = None
        for wait in (0, 5, 20, 60):
            time.sleep(wait or 2)
            try:
                data = _get(url)
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    break
        if data is None:
            print(f"::error::借りた写真 {k}（{p['file']}）が取れない（締め出されたか、ファイルが無い）")
            bad += 1
            continue
        _save(Image.open(BytesIO(data)), out, k, p.get("crop"))
        print(f"置いた: {k}（Commons: {p['file']}）")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", help="台本の鍵（例: north-macedonia/skopje/prices）")
    ap.add_argument("--photos", action="store_true", help="台本の写真を本番の口と Commons から取って置く（外に出る）")
    ap.add_argument("--commons", action="store_true", help="--photos のうち、借りた写真だけ取る")
    a = ap.parse_args(argv)
    if not a.photos:
        # 街の面はもうここで焼かない（`python/guidebook_bake.py`）。記事は `python/guide_article.py`
        print("::error::焼くのは guidebook_bake.py（街）か guide_article.py（記事）。ここは --photos だけ")
        return 2
    return fetch_photos(a.key, only_commons=a.commons)


if __name__ == "__main__":
    sys.exit(main())
