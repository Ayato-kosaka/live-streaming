"""**街のガイドの面（`/travel/<国>/<街>`）の中身を、台本と facts.json から焼く。**

    python3 python/guide_bake.py north-macedonia/skopje            # 焼く（site/content/travel/north-macedonia/skopje.ts）
    python3 python/guide_bake.py north-macedonia/skopje --check    # 焼かずに、焼いてあるものが今の材料と同じかだけ（違えば 1）
    python3 python/guide_bake.py north-macedonia/skopje --photos   # 台本の写真を本番の口と Wikimedia から取って、絵を置く（外に出る）

終了コード 0=焼けた・同じ / 1=台本か材料に食い違いがある（何も書かない）/ 2=台本か材料が無い。

## 骨組みと肉付け（2026-11-14 の作り直し）

最初の面は「配信の事実を並べた記録」で、あやとに30点と言われた（`docs/island-misses.md` #323）。
**どの一文も配信へ辿れる、という守りを面の骨組みにしてしまった**のが根っこ。いまの形は逆にした:

| 台本の欄 | 何か | 正 | 焼くときに止めるもの |
| --- | --- | --- | --- |
| `what` `info` | **骨組み**（行く前のガイド。行っていない所も載る） | 外の出どころ（`src`: 名前・URL・見た日） | 出どころが1つも無い／https でない／見た日が無い |
| `went` | **肉付け**（行った人の話。1件に1つ） | facts の行（`refs`） | 結んだ行に無い数／確かめが要る行・チャットの行への結び／場面が結んだ行の外 |
| `quote`（節の） | 本人の一言。**節に1つまで** | facts の `quote` | 一言の無い行・チャットの行 |

**話（`went.text`）は物語にしてよい**（事実をつないで、案内鳥の言葉で）。ただし数と固有名は結んだ行どおり。
台本には、本人の一言の字も、額も、場面の秒も書かない。書くのは facts の行への結び（`"10-14 1:38:30"`）だけで、
字と秒はここが facts から写す。

## 印（あやとの好みに合うか）

`/bulgaria` と同じ規則（`docs/country-guide.md` 2章）。**手で書かない。** 好みの言葉は
`python/build_bulgaria.py` の `LIKE_FOOD` `LIKE_SPOT`（`python/data/bulgaria/taste.json` の実測）をそのまま使う。
台本に書くのは、判定に要る事実（豚・酒・シロップ菓子・入場料）だけ。

## 最終更新の日付

**中身の字が変わったときだけ進める**（`docs/guide-design.md` 9章の11）。焼いたものの頭に中身の指紋を持たせ、
焼き直して指紋が同じなら日付を据え置く。公開の日付は、最初に焼いた日のまま動かさない。

## 写真（`--photos`）

- **あやとの写真**（`photos`）: 本番の `GET /island-api/cards` から、**台本に書いた写真の id の `url`（素の写真。
  住人は立っていない）だけ**を取る。同じ行に在る住人の名前とアイコンは読み捨てる——**保存しない・書き出さない**（#1203）
- **借りた写真**（`commons`）: Wikimedia Commons のファイル。**行っていない所にだけ使う**（行った所は、その日の写真）。
  作者・ライセンス・元のページを台本に書き、面に出す

どちらも 480px と 960px 幅の WebP にして `site/public/travel/<国>/<街>/<鍵>-<幅>.webp` に置く。
**借りた写真も手元に置く**——よそのサーバーの絵を面から直に引くと、向こうが落ちた日に穴が開く。

## 見張り

`python/guide_watch.py`（面に出た額・一言・節の一言の数・場面のリンクの数・出どころ・説明口調）。
焼いたものではなく、**書き出した HTML**に対して回す（`python3 python/guide_watch.py --dist site/.next-<ポート>`）。
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
from build_bulgaria import LIKE_FOOD, LIKE_SPOT  # noqa: E402  好みの言葉は1か所（ソフィアと同じ規則で印を付ける）

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "python/data/guide"
CONTENT = ROOT / "site/content/travel"
PUBLIC = ROOT / "site/public"
CARDS_API = "https://live-streaming-d3cac.web.app/island-api/cards"
JST = timezone(timedelta(hours=9))

BEGIN = "/* BEGIN GUIDE */"
END = "/* END GUIDE */"

# 節の並び。**`/bulgaria` と同じ骨組み**（見たい・食べたい・買いたい・したい・基本情報）。街が変わっても変えない
ORDER = ["see", "eat", "buy", "todo", "basics"]
STAMPS = ("行った", "前を通った", "行く前に調べた")

# 高いと感じる入場料の線。`build_bulgaria.PRICEY_EUR`（8ユーロ）をデナルに直したもの（1ユーロ＝61.3644デナル）
PRICEY_MKD = 490

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


def mark_of(sec: str, spec: dict) -> tuple[str, str]:
    """印ひとつ。**規則はここ1本**（`build_bulgaria.mark_food` `mark_buy` `mark_spot` と同じ考え）。

    台本に書くのは判定に要る事実（`pork` `alcohol` `syrup` `fee`）だけで、印も理由の字もここが決める。
    """
    text = spec.get("name", "") + spec.get("what", "")
    if sec in ("eat", "buy"):
        if spec.get("alcohol"):
            return "warn", ("お酒。あやとは飲まないので、人に贈るときだけ" if sec == "buy"
                            else "お酒。あやとは2年ほど前にやめている")
        if spec.get("pork") is True:
            return "warn", "豚。あやとは豚肉が苦手（ハム・ソーセージも）"
        if spec.get("syrup"):
            return "warn", "シロップ漬けの中東系の菓子。あやとの好みから外れる（バクラヴァ系）"
        if spec.get("pork") == "mix":
            return "ok", "豚を混ぜる作りかたもある。頼む前に聞く"
        for word, why in LIKE_FOOD:
            if word in text:
                return "good", why
        return "ok", ""
    fee = spec.get("fee") or ""
    m = re.search(r"([0-9][0-9,]*)\s*デナル", fee)
    if m and int(m.group(1).replace(",", "")) >= PRICEY_MKD:
        return "warn", "入場料が高め。あやとは値段で入るかを決める"
    for word, why in LIKE_SPOT:
        if word in text:
            return "good", why
    if "無料" in fee:
        return "ok", "ただで入れる"
    return "ok", ""


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
        self.icons = icon_names(ROOT / "site/components/ui/icons/index.ts")
        self.errors: list[str] = []
        self.used: set[int] = set()        # 使った行（id）。数を報告に出す
        self.keys: set[str] = set()
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

    @staticmethod
    def scene(x: dict) -> dict:
        return {"v": x["v"], "t": x["t"], "date": x["date"]}

    # ------------------------------------------------------------ 字の確かめ
    def allowed_numbers(self, xs: list[dict]) -> set[str]:
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

    # ------------------------------------------------------------ 組む
    def went(self, spec: dict, where: str) -> dict | None:
        """行った人の話。**場面は1つ**（`at`。無ければ結んだ最初の行）"""
        stamp = spec.get("stamp", "行った")
        if stamp not in STAMPS:
            self.errors.append(f"{where}: 札「{stamp}」は {STAMPS} のどれか")
        xs = self.refs(spec.get("refs") or [], where)
        if not xs:
            self.errors.append(f"{where}: 話「{spec.get('text', '')[:20]}…」が facts のどの行にも結ばれていない")
            return None
        self.check_numbers(spec["text"], xs, where)
        at = xs[0]
        if spec.get("at"):
            a = self.find(spec["at"], f"{where}.at")
            if a and a["id"] not in {x["id"] for x in xs}:
                self.errors.append(f"{where}: 場面「{spec['at']}」が、話に結んだ行（refs）の外")
            at = a or at
        out: dict = {"stamp": stamp, "days": sorted({x["date"] for x in xs}), "text": spec["text"],
                     "at": self.scene(at), "rows": []}
        ph = self.photo(spec.get("photo"), f"{where}.photo")
        if ph:
            if "day" not in ph:
                self.errors.append(f"{where}: 行った話の写真は、あやとの写真だけ（借りた写真を体験に見せない）")
            out["photo"] = ph
        if spec.get("measured"):
            m = self.measured(spec["measured"], f"{where}.measured")
            if m:
                out["measured"] = m
        out["rows"] = [r for r in (self.price_row(s, f"{where}.rows[{i}]") for i, s in enumerate(spec.get("rows") or [])) if r]
        return out

    def item(self, spec: dict, sec: str, where: str) -> dict:
        key = spec.get("key", "")
        if not key or key in self.keys:
            self.errors.append(f"{where}: 鍵「{key}」が無いか、ほかの件と同じ")
        self.keys.add(key)
        out: dict = {"key": key, "name": spec["name"], "icon": self.icon(spec.get("icon", ""), where)}
        loc = self.local(spec.get("local"), where)
        if loc:
            out["local"] = loc
        if sec != "basics":
            if spec.get("rank") is not None:
                if spec["rank"] not in (1, 2, 3):
                    self.errors.append(f"{where}: ★は1〜3")
                out["rank"] = spec["rank"]
            out["mark"], out["markWhy"] = mark_of(sec, spec)
        elif spec.get("rank") is not None:
            self.errors.append(f"{where}: 基本情報に★を付けない")
        if spec.get("what"):
            out["what"] = spec["what"]
        out["info"] = [{"label": f["label"], "text": f["text"]} for f in spec.get("info") or []]
        out["src"] = self.src(spec.get("src"), where)
        has_ext = bool(spec.get("what") or spec.get("info"))
        if has_ext and not out["src"]:
            self.errors.append(f"{where}: 「{spec['name']}」の外の事実に出どころが無い")
        if not has_ext and out["src"]:
            self.errors.append(f"{where}: 「{spec['name']}」に出どころだけ在って、外の事実が無い")
        if spec.get("maps"):
            out["maps"] = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(spec["maps"]) + "&hl=ja"
        w = self.went(spec["went"], f"{where}.went") if spec.get("went") else None
        if not has_ext and not w:
            self.errors.append(f"{where}: 「{spec['name']}」に外の事実も、行った人の話も無い")
        if not has_ext and spec.get("rank") is not None:
            self.errors.append(f"{where}: 外の出どころの無い件（行った人の話だけ）に★を付けない（重要度は一般の話）")
        # タイルの絵は、行った件ならその日の写真、行っていない件なら借りた写真
        ph = (w or {}).get("photo") or self.photo(spec.get("photo"), f"{where}.photo")
        if ph:
            out["photo"] = ph
        if w:
            out["went"] = w
        return out

    def section(self, sid: str, spec: dict) -> dict:
        w = f"sections.{sid}"
        lead = spec["lead"]
        lead_x = self.refs(lead.get("refs") or [], f"{w}.lead")
        self.check_numbers(lead["text"], lead_x, f"{w}.lead")
        items = [self.item(it, sid, f"{w}.items[{i}]") for i, it in enumerate(spec.get("items") or [])]
        if isinstance(spec.get("quote"), list):
            # 本人の一言は、節でいちばん効く1つだけ（#323 の決めごと2）
            self.errors.append(f"{w}: 一言は節に1つまで")
            spec = {**spec, "quote": None}
        q = self.quote(spec["quote"], f"{w}.quote") if spec.get("quote") else None
        of = spec.get("quoteOf")
        if q and of not in {it["key"] for it in items}:
            self.errors.append(f"{w}: 一言の持ち主「{of}」が、この節の件に無い")
        name_of = {it["key"]: it["name"] for it in items}
        return {"id": sid, "lead": lead["text"], "quote": q, "quoteOf": name_of.get(of) if q else None, "items": items}

    def build(self) -> dict:
        s = self.s
        for k in ("name", "title", "description", "lead", "cover", "intro", "rate", "sections"):
            if k not in s:
                self.errors.append(f"台本に {k} が無い")
        if self.errors:
            return {}
        if not s.get("persona") or not s.get("terms"):
            # 面の頭に、誰が・何を調べて読むかを書く（#323 の決めごと4）。書かずに作ると、どの問いにも答えない面になる
            self.errors.append("台本に persona（読む人）と terms（狙う語）が無い")
        lead_x = self.refs(s["lead"]["refs"], "lead")
        self.check_numbers(s["lead"]["text"], lead_x, "lead")
        if len(s["lead"]["text"]) > 40:
            self.errors.append(f"lead: 表紙の一言は40字まで（{len(s['lead']['text'])}字）")
        desc = s["description"]
        self.check_numbers(desc["text"], self.refs(desc.get("refs") or [], "description"), "description")
        if len(desc["text"]) > 120:
            self.errors.append(f"description: 120字まで（{len(desc['text'])}字）")
        intro_w = s["intro"]["went"]
        ix = self.refs(intro_w["refs"], "intro.went")
        self.check_numbers(intro_w["text"], ix, "intro.went")
        at = self.find(intro_w["at"], "intro.went.at") if intro_w.get("at") else (ix[0] if ix else None)
        intro = {"ext": {"text": s["intro"]["ext"]["text"], "src": self.src(s["intro"]["ext"].get("src"), "intro.ext")},
                 "went": {"text": intro_w["text"], "at": self.scene(at) if at else {"v": "", "t": 0, "date": ""}}}
        if not intro["ext"]["src"]:
            self.errors.append("intro.ext: 出どころが無い")
        rate = {"text": s["rate"]["text"], "src": self.src(s["rate"].get("src"), "rate")}
        if not rate["src"]:
            self.errors.append("rate: 出どころが無い")
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
        secs = [self.section(sid, s["sections"][sid]) for sid in ORDER if sid in s["sections"]]
        missing = [sid for sid in ORDER if sid not in s["sections"]]
        if missing:
            # 骨組みの節が欠けた面は、ガイドではなく記録になる（#323）
            self.errors.append(f"sections: 骨組みの節が欠けている {missing}")
        extra = set(s["sections"]) - set(ORDER)
        if extra:
            self.errors.append(f"sections: 知らない節 {sorted(extra)}（並びは {ORDER}）")
        arts = []
        for i, a in enumerate(s.get("articles") or []):
            if not a.get("href", "").startswith(f"/travel/{self.key}/"):
                self.errors.append(f"articles[{i}]: 記事の道が /travel/{self.key}/ の下に無い")
            arts.append({"href": a["href"], "title": a["title"], "note": a["note"],
                         "icon": self.icon(a.get("icon", ""), f"articles[{i}]")})
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
            "title": s["title"], "description": desc["text"], "lead": s["lead"]["text"],
            "cover": self.photo(s["cover"], "cover"),
            "intro": intro,
            "rate": rate,
            "embed": embed,
            "streams": s.get("streams"),
            "nums": nums,
            "sections": secs,
            "articles": arts,
        }

    def report(self, g: dict | None = None) -> str:
        out = [f"facts: 使った {len(self.used)}件 / そのまま出せる {len(self.ready)}件（項目 {len(self.rows)}件・配信 {len(self.heads)}本）"]
        if g:
            links = len(g["nums"]) + 1  # 驚く数・頭の話
            for s in g["sections"]:
                went = [it for it in s["items"] if it.get("went")]
                been = [it for it in went if it["went"]["stamp"] == "行った"]
                srcd = sum(1 for it in s["items"] if it["src"])
                rows = sum(len(it["went"]["rows"]) for it in went)
                links += len(went) + rows + (1 if s["quote"] else 0)
                out.append(f"  {s['id']}: {len(s['items'])}件（行った {len(been)}・話のある件 {len(went)}・出どころつき {srcd}）"
                           f"・一言 {1 if s['quote'] else 0}・値段の行 {rows}")
            out.append(f"  場面のリンク（場面の札・吹き出し・驚く数・値段の行）: {links}本")
        return "\n".join(out)


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
        print(b.report(g))
        return 0 if same else 1
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print(f"焼いた: {p.relative_to(root) if p.is_relative_to(root) else p}（指紋 {fp}・公開 {g['published']}・最終更新 {g['updated']}）")
    print(b.report(g))
    return 0


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
    ap.add_argument("key", help="<国>/<街>（例: north-macedonia/skopje）")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--photos", action="store_true", help="台本の写真を本番の口と Commons から取って置く（外に出る）")
    ap.add_argument("--commons", action="store_true", help="--photos のうち、借りた写真だけ取る")
    ap.add_argument("--today", help="今日の日付（見張りが差し替える）")
    a = ap.parse_args(argv)
    if a.photos:
        return fetch_photos(a.key, only_commons=a.commons)
    return bake(a.key, check=a.check, today=a.today)


if __name__ == "__main__":
    sys.exit(main())
