"""**面が借りている Commons の写真を、島の置き場から配る。**（#1228）

    python3 python/guide_photos.py                          # 全部の面ぶん、まだ置いていない写真だけ落とす（外に出る）
    python3 python/guide_photos.py north-macedonia/skopje   # 1つの面だけ
    python3 python/guide_photos.py nordic                   # 頭が合う面をまとめて（北欧の6か国）
    python3 python/guide_photos.py --check                  # 落とさずに確かめるだけ（外に出ない）
    python3 python/guide_photos.py --lookup "File:X.jpg" …  # Commons のファイルのページから、材料の写真の欄を組む（外に出る）

終了コード 0=揃った / 1=足りない・焼いたものに Wikimedia の絵が残っている / 2=数えるものが無い。

## なぜ要るか（2026-11-15）

面が `upload.wikimedia.org` から直に読んでいると、Wikimedia が混んだ日に 429（取りすぎ）で断り、見どころマップの
ピンが白い丸になる。この箱から本番の写真の URL を curl すると 429 が返った。見る人の手元でも同じことが起きうる。
だから**使う幅で一度だけ落として webp にし**、`site/public/` の下の面ごとの置き場から配る。
作者・ライセンス・元のページは、いままでどおり材料の字（`by` `lic` `page`／`cm`／`credit` `creditHref`）を面に出す。

## 面ごとの置き場（`PLACES`）

| 面 | 置き場（`site/public/` の下） | 幅 | 材料 |
| --- | --- | --- | --- |
| 街のガイドブック（`/travel/<国>/<街>`） | `guide/<国>/<街>/photos/` | 120・500・960 | `python/data/…` の写真の欄 |
| 北欧の6か国（`/travel/<国>`） | `travel/<国>/photos/` | 250・500・960 | `python/data/nordic-src/` のその国の見どころ |

幅は**面が読む幅だけ**置く。ガイドブックは 500（狭い画面）・960（広い画面・窓）と、120（前は見どころマップのピン。2026-11-16 にピンをやめて面は読まなくなった。置き場の絵を外すのは絵の担当）。
北欧は 250（段の頭の 52px 角）・500（国の札・見たいものの一覧）・960（開いた写真・国の表紙）。
企画の写真（前の `next/photos/`。告知の面 `/next` の札）は、面ごと畳んだときに置き場ごと消した（#1277）。

## 置き場の名前

`<置き場>/<名前>-<幅>.webp`。名前は Commons のファイル名だけで決まる（英数字の頭＋ファイル名の MD5 の頭8字）——
焼く道具が、写真の一覧を持たずに道を引ける。元がいちばん大きい幅より小さい写真は、元の大きさのまま同じ名前で置く
（`guide_bake._save` と同じ）。

焼く道具（`python/guidebook_bake.py`・`python/build_bulgaria.py`・`python/build_nordic.py`）は `local()` で
置き場の道に直す。**置き場に無ければ焼かずに止まる**（先にここを回す）。企画（`projects.ts`）は焼く道具を持たない
手書きの表なので、道は人が書き、ここの `--check` が置き場と突き合わせる。

## 取りかた

- 1枚につき1回だけ取る（いちばん大きい幅の縮小。元がそれより小さければ元のファイル）。ほかの幅は手元で縮める
- 名乗る（User-Agent）・1枚ごとに間を空ける・429 なら待って取り直す（`WAITS`）
- **置いてある写真は取り直さない**（続けて取ると締め出される。取り直すなら絵を消してから回す）
- 書きかけの絵を「置いた」に数えない（別の名前に書いてから入れ替える）

`--lookup` が API（`api.php`）ではなくファイルのページ（HTML）を読むのは、2026-11-15 にこの箱から API が
429 で全部断られ、ページは 200 で返ったから。
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
#: 街のガイドブックの幅。ピン（44px の丸・2倍の画面で 88px）・狭い画面・広い画面
WIDTHS = (120, 500, 960)
#: 北欧の国の面の幅。段の頭の 52px 角（`nspot-th`）・国の札と見たいものの一覧・開いた写真と国の表紙。
#: `python/build_nordic.py` が前から Commons に頼んでいた 250・500・960 と同じ（見た目を変えない）
NORDIC_WIDTHS = (250, 500, 960)
# 名乗りには連絡先を入れる（Wikimedia の User-Agent policy）。入れていなかった 2026-11-19 に、置き場が
# この名乗りにだけ 429 を返し続けた。島の URL を入れるのは、あやとが #1228 で決めた（2026-11-19「1・連絡先入れる」）
UA = "guide-photo-mirror/1.0 (https://ayato-arigato.com; static travel guide; Commons photos with credit)"
#: 429 のあと待つ秒。2026-11-14 に間を置かず16枚取って半分断られた（`guide_bake.fetch_photos`）
WAITS = (5, 20, 60, 120)
#: 1枚ごとの間（秒）
GAP = 4.0
#: `--gentle` の1枚ごとの間（秒）。置き場が 429 を返している日に、締め出しを長引かせない取りかた（2026-11-19。ブカレスト）
GENTLE_GAP = 60.0

_NSRC = "python/data/nordic-src"
#: 北欧の6か国の材料。**その国の見どころの `img` と `big` だけ**を見る。元の `nordic.json` には、ルートから外した
#: ノルウェーとデンマークの見どころと、面に出ない控えの道（`fbs`。元のファイルを `|` でつないだもの）も入っている。
#: 面に出ない写真まで取りに行かない。国は `python/build_nordic.py` の `ROUTE_ORDER` と同じ（selftest が突き合わせる）
_NFIELDS = ("img", "big")
NORDIC: dict[str, tuple] = {
    "poland": (f"{_NSRC}/poland_spots.json", (), _NFIELDS),
    "lithuania": (f"{_NSRC}/nordic.json", ("spots", "リトアニア"), _NFIELDS),
    "latvia": (f"{_NSRC}/nordic.json", ("spots", "ラトビア"), _NFIELDS),
    "estonia": (f"{_NSRC}/nordic.json", ("spots", "エストニア"), _NFIELDS),
    "finland": (f"{_NSRC}/nordic.json", ("spots", "フィンランド"), _NFIELDS),
    "sweden": (f"{_NSRC}/nordic.json", ("spots", "スウェーデン"), _NFIELDS),
}

#: **Commons から消えた写真。** 縮小も元のファイルも 404 で、ファイルのページが「No file by this name exists.」
#: と返したもの。消える理由の多くは許諾の取り消しなので、写しを探して出さない。ここは取りに行かず、
#: 焼く道具は `gone()` を先に見て、その見どころを「写真なし」で焼く（割れた絵の枠を出さない）。
#: 代わりの写真を選んだら、材料を直してここから外す（`guide_photos_selftest.py` が、どの材料にも無い名前を落とす）
GONE: dict[str, str] = {
    # 本番の面でも、前から割れた絵の枠で出ていた（直に読んでいたので、誰も気づかなかった）
    "Dolphinarium_of_the_Lithuanian_Maritime_Museum_in_Klaipėda,_Lithuania_in_2016.jpg": "2026-11-15 ランナーから縮小・元とも 404",
}

#: 面ごとの、置き場（`site/public/` の下）・置く幅・写真の出どころ（材料）・面に焼いたもの（Wikimedia の絵が
#: 残っていないかを見る所）。材料は（ファイル, JSON の中の道[, 見る欄]）。道が () ならファイルぜんぶ、
#: 見る欄が無ければ全部の欄。JSON でないファイル（`projects.ts`）は字のまま読む
PLACES: dict[str, dict] = {
    "bulgaria/sofia": {
        "dir": "guide/bulgaria/sofia/photos",
        "widths": WIDTHS,
        "from": [("python/data/bulgaria/photos.json", ())],
        "baked": ["site/content/bulgaria.ts", "site/content/guidebook/bulgaria-sofia.ts"],
    },
    "north-macedonia/skopje": {
        "dir": "guide/north-macedonia/skopje/photos",
        "widths": WIDTHS,
        "from": [("python/data/guide/north-macedonia/skopje/guidebook.json", ())],
        "baked": ["site/content/guidebook/north-macedonia-skopje.ts"],
    },
    **{
        f"nordic/{slug}": {
            "dir": f"travel/{slug}/photos",
            "widths": NORDIC_WIDTHS,
            "from": [src],
            "baked": [f"site/content/nordic/{slug}.json"],
        }
        for slug, src in NORDIC.items()
    },
}

# 材料を焼く道に乗った街（`python/data/guide/<国>/<街>/guidebook.json`）は、スコピエと同じ形で足す。
# 前は街を1つずつここに書く表で、次の街（ブカレスト）が「知らない面」で止まった（#1292）
for _book in sorted((ROOT / "python/data/guide").glob("*/*/guidebook.json")):
    _key = f"{_book.parent.parent.name}/{_book.parent.name}"
    PLACES.setdefault(_key, {
        "dir": f"guide/{_key}/photos",
        "widths": WIDTHS,
        "from": [(f"python/data/guide/{_key}/guidebook.json", ())],
        "baked": [f"site/content/guidebook/{_key.replace('/', '-')}.ts"],
    })

#: Commons の絵の道（縮小か元のファイル）。名前と、縮小なら幅
UP = re.compile(
    # 名前に `|` は入らない（MediaWiki の題に使えない字）。北欧の材料は控えの道を `|` でつないでいる
    r"https://upload\.wikimedia\.org/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/\"'\s?#|]+)(?:/(\d+)px-[^/\"'\s?#|]+)?"
)
#: 手書きの表の、借りた写真の出どころのリンク（`creditHref: "https://commons.wikimedia.org/wiki/File:…"`）
CREDIT = re.compile(r"creditHref:\s*[\"']https://commons\.wikimedia\.org/wiki/(File:[^\"'\s?#]+)")
#: 国ごとの移植版（「CC BY-SA 3.0 ro」のように末尾に国の2字）も同じ許諾なので通す。NC・ND は今までどおり落とす
LIC_OK = re.compile(r"^(CC0|PD|CC BY \d\.\d( [a-z]{2})?|CC BY-SA \d\.\d( [a-z]{2})?)$")


def norm(name: str) -> str:
    """ファイル名を1つの形に（`File:` を外し、% を戻し、空白を _ に）"""
    n = urllib.parse.unquote(name.strip())
    n = re.sub(r"^(File|Image):", "", n)
    return n.replace(" ", "_")


def stem(name: str) -> str:
    """置き場の名前。**ファイル名だけで決まる**（同じ写真は2つの道を持たない）"""
    n = norm(name)
    h = hashlib.md5(n.encode("utf-8")).hexdigest()[:8]
    head = unicodedata.normalize("NFKD", n.rsplit(".", 1)[0]).encode("ascii", "ignore").decode().lower()
    head = re.sub(r"[^a-z0-9]+", "-", head).strip("-")[:32].strip("-")
    return f"{head}-{h}" if head else h


def gone(ref: str) -> bool:
    """Commons から消えた写真か（ファイル名か upload の URL）"""
    m = UP.match(ref)
    return norm(m.group(1) if m else ref) in GONE


def widths_of(key: str) -> tuple[int, ...]:
    return PLACES[key]["widths"]


def slot(width: int | None, widths: tuple[int, ...] = WIDTHS) -> int:
    """求められた幅に、置いた幅のどれを当てるか（元のファイル・1920 は、いちばん大きい幅）"""
    if width is None:
        return widths[-1]
    for w in widths:
        if width <= w:
            return w
    return widths[-1]


def commons_url(name: str, width: int | None) -> str:
    """Commons のファイルの置き場（名前の MD5 で決まる。`guide_bake.commons_url` と同じ式）"""
    n = norm(name)
    h = hashlib.md5(n.encode("utf-8")).hexdigest()
    q = urllib.parse.quote(n)
    if not width:
        return f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{q}"
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{width}px-{q}"


def photo_dir(key: str, root: Path = ROOT) -> Path:
    return root / "site/public" / PLACES[key]["dir"]


def public(key: str, name: str, width: int) -> str:
    return f"/{PLACES[key]['dir']}/{stem(name)}-{width}.webp"


def local(key: str, ref: str, width: int | None = None, root: Path = ROOT) -> str | None:
    """借りた写真（Commons のファイル名か upload の URL）を、置き場の道に直す。**置いていなければ None**。

    URL を渡したときは、その縮小の幅から置いた幅を選ぶ（`width` を渡せばそちら）
    """
    m = UP.match(ref)
    name = m.group(1) if m else ref
    if width is None and m and m.group(2):
        width = int(m.group(2))
    w = slot(width, widths_of(key))
    p = photo_dir(key, root) / f"{stem(name)}-{w}.webp"
    return public(key, name, w) if p.exists() else None


def _pick(o, path: tuple[str, ...]):
    """材料の JSON の中の道をたどる。**道が無ければ None**（何も拾わず、`check` の数えた数が減る）"""
    for k in path:
        if not isinstance(o, dict) or k not in o:
            return None
        o = o[k]
    return o


def _fields(o, fields: tuple[str, ...]):
    """材料のうち、その欄だけ（見どころの並びなら、1件ずつの欄）"""
    if isinstance(o, list):
        return [_fields(x, fields) for x in o]
    if isinstance(o, dict):
        return [o.get(k) for k in fields]
    return o


def wanted(key: str, root: Path = ROOT) -> dict[str, dict]:
    """材料に出てくる Commons の写真。名前 → {元の幅（分かれば）, いちばん大きい幅以上の縮小があるか}"""
    out: dict[str, dict] = {}
    top = widths_of(key)[-1]

    def add(name: str, w: int | None = None, thumb: int | None = None) -> None:
        n = norm(name)
        x = out.setdefault(n, {"w": None, "big": False})
        if w:
            x["w"] = w
        if thumb and thumb >= top:
            x["big"] = True

    def walk(o) -> None:
        if isinstance(o, dict):
            if isinstance(o.get("file"), str) and o.get("lic"):
                add(o["file"], o.get("w") if isinstance(o.get("w"), int) else None)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, str):
            for m in UP.finditer(o):
                add(m.group(1), None, int(m.group(2)) if m.group(2) else None)

    for rel, path, *fields in PLACES[key]["from"]:
        f = root / rel
        if not f.exists():
            continue
        t = f.read_text(encoding="utf-8")
        if f.suffix == ".json":
            o = _pick(json.loads(t), path)
            walk(_fields(o, fields[0]) if fields else o)
            continue
        walk(t)
        # 出どころのリンクしか持たない写真は、元の大きさが分からない。縮小を先に頼む
        # （元が小さくて縮小が返らなければ、`fetch` が元のファイルを1回だけ試す）
        for m in CREDIT.finditer(t):
            add(m.group(1), None, top)
    return {n: x for n, x in out.items() if n not in GONE}


def source(name: str, info: dict, top: int = WIDTHS[-1]) -> str:
    """取りに行く1本。元が `top` より大きければ `top` の縮小、小さければ元のファイル（Commons は元より大きい縮小を返さない）"""
    big = info["w"] > top if info.get("w") else info.get("big")
    return commons_url(name, top if big else None)


def done(key: str, name: str, root: Path = ROOT) -> bool:
    d = photo_dir(key, root)
    return all((d / f"{stem(name)}-{w}.webp").exists() for w in widths_of(key))


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def pull(url: str, get=_get, sleep=time.sleep, log=print, waits: tuple[int, ...] = WAITS) -> tuple[bytes | None, int]:
    """1本取る。戻りは（中身, 断られたときの番号）。**429 だけは待って取り直す**（ほかの断りは、待っても変わらない）。
    待つのは `WAITS` と、Wikimedia が返す Retry-After の長いほう"""
    for i in range(len(waits) + 1):
        try:
            return get(url), 200
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == len(waits):
                log(f"  断られた（{e.code}）: {url}")
                return None, e.code
            ra = (e.headers or {}).get("Retry-After") if e.headers is not None else None
            wait = max(waits[i], int(ra) if ra and str(ra).isdigit() else 0)
            log(f"  429。{wait}秒待って取り直す")
            sleep(wait)
        except urllib.error.URLError as e:
            log(f"  届かない（{e.reason}）: {url}")
            return None, 0
    return None, 0


def save(data: bytes, key: str, name: str, root: Path = ROOT) -> None:
    """面の幅ぶんの webp にして置く。**書きかけを置いたに数えない**（別の名前に書いてから入れ替える）"""
    from PIL import Image  # 写真を置くときだけ要る

    im = Image.open(BytesIO(data))
    im.load()
    if im.mode in ("RGBA", "LA", "P"):
        # 透けた PNG を黒い地にしない
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    im = im.convert("RGB")
    d = photo_dir(key, root)
    d.mkdir(parents=True, exist_ok=True)
    for w in widths_of(key):
        w2 = min(w, im.width)
        h = max(1, round(im.height * w2 / im.width))
        f = d / f"{stem(name)}-{w}.webp"
        tmp = f.with_suffix(".tmp")
        im.resize((w2, h), Image.LANCZOS).save(tmp, "WEBP", quality=72 if w > 120 else 78, method=6)
        tmp.replace(f)


def fetch(key: str, root: Path = ROOT, get=_get, sleep=time.sleep, log=print, gentle: bool = False) -> int:
    """`gentle` は、置き場が 429 を返している日の取りかた: 1枚ごとに `GENTLE_GAP` 秒あけ、429 は取り直さず、
    **1回でも返ったらその回はそこで止める**（続けて叩くと締め出しが長引く）。名乗り（`UA`）は変えない"""
    gap = GENTLE_GAP if gentle else GAP
    want = wanted(key, root)
    if not want:
        log(f"::error::{key}: 材料に借りた写真が1枚も無い（置き場が動いた？）")
        return 2
    bad = got = 0
    for name, info in sorted(want.items()):
        if done(key, name, root):
            continue
        if got or bad:
            sleep(gap)
        url = source(name, info, widths_of(key)[-1])
        data, code = pull(url, get, sleep, log, waits=() if gentle else WAITS)
        if gentle and code == 429:
            log(f"{key}: 429 が返ったので、この回はここで止める（いま置いた {got}・残り {sum(not done(key, n, root) for n in want)}）")
            return 1
        if data is None and code in (400, 404) and "/thumb/" in url:
            # 元の幅を持たない材料（ソフィア・北欧・企画）で、元がいちばん大きい幅より小さかったとき（縮小が無い）。
            # **429 のときは元のファイルへ逃げない**（数十 MB の元を、締め出されている最中に取りに行くことになる）
            sleep(GAP)
            data, code = pull(commons_url(name, None), get, sleep, log)
        if data is None:
            log(f"::error::{key}: 借りた写真「{name}」が取れない")
            bad += 1
            continue
        save(data, key, name, root)
        got += 1
        log(f"置いた: {stem(name)}（{name}）")
    log(f"{key}: 借りた写真 {len(want)} 枚のうち、いま置いた {got}・取れない {bad}")
    return 1 if bad else 0


#: 置き場の写真を指す道。置き場（`photos` の手前まで）・名前・幅
REF = re.compile(r"/([a-z0-9-]+(?:/[a-z0-9-]+)*)/photos/([a-z0-9-]+)-(\d+)\.webp")


def check(key: str, root: Path = ROOT) -> tuple[list[str], int]:
    """**焼いたものに Wikimedia の絵が0本で、面が指す写真が全部置いてある**か。戻りは（食い違い, 数えた数）"""
    bad: list[str] = []
    seen = 0
    d = photo_dir(key, root)
    home = PLACES[key]["dir"].removesuffix("/photos")
    for rel in PLACES[key]["baked"]:
        f = root / rel
        if not f.exists():
            bad.append(f"{rel}: 焼いたものが無い")
            continue
        t = f.read_text(encoding="utf-8")
        n = len(UP.findall(t))
        if n > 0:
            bad.append(f"{rel}: Wikimedia から直に読む絵が {n} 本残っている（焼き直す。写真が無ければ先にこの道具で落とす）")
        for m in REF.finditer(t):
            seen += 1
            if m.group(1) != home:
                bad.append(f"{rel}: 別の面の置き場を指している（{m.group(0)}）")
                continue
            # 面が指していない幅も、在ること（ガイドブックのピンは 120 を読む。`components/guidebook/SpotMap.tsx` の `tiny`）
            for w in {int(m.group(3)), *widths_of(key)}:
                if not (d / f"{m.group(2)}-{w}.webp").exists():
                    bad.append(f"{rel}: 置き場に無い（{m.group(2)}-{w}.webp）")
    for name in sorted(wanted(key, root)):
        seen += 1
        if not done(key, name, root):
            bad.append(f"{key}: 材料の写真「{name}」が置き場に揃っていない（python3 python/guide_photos.py {key}）")
    return sorted(set(bad)), seen


# ------------------------------------------------------------------ 材料の写真の欄を組む


def _text(s: str) -> str:
    # 作者の札（Creator のひな形）は、頭に <style> を抱えている
    s = re.sub(r"<(style|script)\b.*?</\1>", " ", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def parse_page(name: str, h: str, seen: str) -> dict:
    """Commons のファイルのページ（HTML）から、材料の写真の欄。**alt は人が書く**（空で返す）"""
    h = html.unescape(h)
    by = ""
    m = re.search(r'id="fileinfotpl_aut"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>', h, re.S)
    if m:
        by = _text(m.group(1))
    lics = [_text(x) for x in re.findall(r'class="licensetpl_short"[^>]*>(.*?)</span>', h, re.S)]
    lics = ["PD" if x.lower().startswith(("public domain", "pd")) else x for x in lics]
    lic = next((x for x in lics if LIC_OK.match(x)), lics[0] if lics else "")
    w = 0
    m = re.search(r'class="fileInfo">\(([\d,]+) × ([\d,]+)', h)
    if m:
        w = int(m.group(1).replace(",", ""))
    n = norm(name)
    page = "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(n, safe="(),_-.")
    return {
        "file": n.replace("_", " "),
        "by": by,
        "lic": lic,
        "page": page,
        "alt": "",
        "w": w,
        "src": [{"name": "Wikimedia Commons（ファイルのページ）", "url": page, "seen": seen}],
        "thumbs": {str(x): commons_url(n, x) for x in (250, 500, 960) if x < w},
    }


def lookup(names: list[str], get=_get, sleep=time.sleep, log=print) -> int:
    rows = []
    for i, name in enumerate(names):
        if i:
            sleep(GAP)
        url = "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(norm(name))
        data, _ = pull(url, get, sleep, log)
        if data is None:
            return 1
        rows.append(parse_page(name, data.decode("utf-8", "replace"), date.today().isoformat()))
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    return 0 if all(r["by"] and LIC_OK.match(r["lic"]) and r["w"] for r in rows) else 1


def pick(asked: list[str]) -> tuple[list[str], list[str]]:
    """頼まれた面。そのままの名前か、頭（`nordic` → 北欧の6か国）。戻りは（面, 知らない名前）"""
    keys: list[str] = []
    unknown: list[str] = []
    for a in asked or list(PLACES):
        hit = [k for k in PLACES if k == a or k.startswith(a.rstrip("/") + "/")]
        if not hit:
            unknown.append(a)
        keys += [k for k in hit if k not in keys]
    return keys, unknown


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", nargs="*", help="面（例: north-macedonia/skopje・nordic/finland・nordic）。無ければ全部")
    ap.add_argument("--check", action="store_true", help="落とさずに確かめるだけ")
    ap.add_argument("--lookup", nargs="+", metavar="FILE", help="Commons のファイル名から、材料の写真の欄を組む")
    ap.add_argument("--gentle", action="store_true", help="1枚ごとに60秒あけ、429 が1回でも返ったら止める（置き場が締め出している日）")
    a = ap.parse_args(argv)
    if a.lookup:
        return lookup(a.lookup)
    keys, unknown = pick(a.key)
    if unknown:
        print(f"::error::知らない面: {', '.join(unknown)}（{', '.join(PLACES)}）")
        return 2
    if not a.check:
        rc = max(fetch(k, gentle=a.gentle) for k in keys)
        if rc:
            return rc
    worst = 0
    for k in keys:
        bad, seen = check(k)
        if seen == 0:
            print(f"::error::{k}: 数えるものが無い（材料も焼いたものの写真も0）")
            worst = max(worst, 2)
            continue
        for b in bad:
            print(f"::error::{b}")
        print(f"{k}: 写真の道 {seen} 本を見た・食い違い {len(bad)}")
        worst = max(worst, 1 if bad else 0)
    return worst


if __name__ == "__main__":
    sys.exit(main())
