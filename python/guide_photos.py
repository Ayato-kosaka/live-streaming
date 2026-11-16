"""**街のガイドブックの面（`/travel/<国>/<街>`）が借りている Commons の写真を、島の置き場から配る。**（#1228）

    python3 python/guide_photos.py                          # 2つの街ぶん、まだ置いていない写真だけ落とす（外に出る）
    python3 python/guide_photos.py north-macedonia/skopje   # 1つの街だけ
    python3 python/guide_photos.py --check                  # 落とさずに確かめるだけ（外に出ない）
    python3 python/guide_photos.py --lookup "File:X.jpg" …  # Commons のファイルのページから、材料の写真の欄を組む（外に出る）

終了コード 0=揃った / 1=足りない・焼いたものに Wikimedia の絵が残っている / 2=数えるものが無い。

## なぜ要るか（2026-11-15）

面が `upload.wikimedia.org` から直に読んでいると、Wikimedia が混んだ日に 429（取りすぎ）で断り、見どころマップの
ピンが白い丸になる。この箱から本番の写真の URL を curl すると 429 が返った。見る人の手元でも同じことが起きうる。
だから**使う幅で一度だけ落として webp にし**、`site/public/guide/<国>/<街>/photos/` から配る。
作者・ライセンス・元のページは、いままでどおり材料の字（`by` `lic` `page`／`cm`）を面に出す。

## 置き場の名前

`photos/<名前>-<幅>.webp`。名前は Commons のファイル名だけで決まる（英数字の頭＋ファイル名の MD5 の頭8字）——
焼く道具が、写真の一覧を持たずに道を引ける。幅は 120（前は見どころマップのピン。2026-11-16 にピンをやめて、いまは面から読んでいない）・500（狭い画面）・960（広い画面・窓）。
元がそれより小さい写真は、元の大きさのまま同じ名前で置く（`guide_bake._save` と同じ）。

焼く道具（`python/guidebook_bake.py`・`python/build_bulgaria.py`）は `local()` で置き場の道に直す。
**置き場に無ければ焼かずに止まる**（先にここを回す）。

## 取りかた

- 1枚につき1回だけ取る（960 の縮小。元が 960 より小さければ元のファイル）。500 と 120 は手元で縮める
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
#: 置く幅。ピン（44px の丸・2倍の画面で 88px）・狭い画面・広い画面
WIDTHS = (120, 500, 960)
UA = "guide-photo-mirror/1.0 (static travel guide; Commons photos with credit)"
#: 429 のあと待つ秒。2026-11-14 に間を置かず16枚取って半分断られた（`guide_bake.fetch_photos`）
WAITS = (5, 20, 60, 120)
#: 1枚ごとの間（秒）
GAP = 4.0

#: 街ごとの、写真の出どころ（材料）と、面に焼いたもの（Wikimedia の絵が残っていないかを見る所）
CITIES: dict[str, dict[str, list[str]]] = {
    "bulgaria/sofia": {
        "from": ["python/data/bulgaria/photos.json"],
        "baked": ["site/content/bulgaria.ts", "site/content/guidebook/bulgaria-sofia.ts"],
    },
    "north-macedonia/skopje": {
        "from": ["python/data/guide/north-macedonia/skopje/guidebook.json"],
        "baked": ["site/content/guidebook/north-macedonia-skopje.ts"],
    },
}

#: Commons の絵の道（縮小か元のファイル）。名前と、縮小なら幅
UP = re.compile(
    r"https://upload\.wikimedia\.org/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/\"'\s?#]+)(?:/(\d+)px-[^/\"'\s?#]+)?"
)
LIC_OK = re.compile(r"^(CC0|PD|CC BY \d\.\d|CC BY-SA \d\.\d)$")


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


def slot(width: int | None) -> int:
    """求められた幅に、置いた幅のどれを当てるか（元のファイル・1920 は 960）"""
    if width is None:
        return WIDTHS[-1]
    for w in WIDTHS:
        if width <= w:
            return w
    return WIDTHS[-1]


def commons_url(name: str, width: int | None) -> str:
    """Commons のファイルの置き場（名前の MD5 で決まる。`guide_bake.commons_url` と同じ式）"""
    n = norm(name)
    h = hashlib.md5(n.encode("utf-8")).hexdigest()
    q = urllib.parse.quote(n)
    if not width:
        return f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{q}"
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{width}px-{q}"


def photo_dir(key: str, root: Path = ROOT) -> Path:
    return root / "site/public/guide" / key / "photos"


def public(key: str, name: str, width: int) -> str:
    return f"/guide/{key}/photos/{stem(name)}-{width}.webp"


def local(key: str, ref: str, width: int | None = None, root: Path = ROOT) -> str | None:
    """借りた写真（Commons のファイル名か upload の URL）を、置き場の道に直す。**置いていなければ None**。

    URL を渡したときは、その縮小の幅から置いた幅を選ぶ（`width` を渡せばそちら）
    """
    m = UP.match(ref)
    name = m.group(1) if m else ref
    if width is None and m and m.group(2):
        width = int(m.group(2))
    w = slot(width)
    p = photo_dir(key, root) / f"{stem(name)}-{w}.webp"
    return public(key, name, w) if p.exists() else None


def wanted(key: str, root: Path = ROOT) -> dict[str, dict]:
    """材料に出てくる Commons の写真。名前 → {元の幅（分かれば）, 960 以上の縮小があるか}"""
    out: dict[str, dict] = {}

    def add(name: str, w: int | None = None, thumb: int | None = None) -> None:
        n = norm(name)
        x = out.setdefault(n, {"w": None, "big": False})
        if w:
            x["w"] = w
        if thumb and thumb >= WIDTHS[-1]:
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

    for rel in CITIES[key]["from"]:
        f = root / rel
        if f.exists():
            walk(json.loads(f.read_text(encoding="utf-8")))
    return out


def source(name: str, info: dict) -> str:
    """取りに行く1本。元が 960 より大きければ 960 の縮小、小さければ元のファイル（Commons は元より大きい縮小を返さない）"""
    big = info["w"] > WIDTHS[-1] if info.get("w") else info.get("big")
    return commons_url(name, WIDTHS[-1] if big else None)


def done(key: str, name: str, root: Path = ROOT) -> bool:
    d = photo_dir(key, root)
    return all((d / f"{stem(name)}-{w}.webp").exists() for w in WIDTHS)


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def pull(url: str, get=_get, sleep=time.sleep, log=print) -> tuple[bytes | None, int]:
    """1本取る。戻りは（中身, 断られたときの番号）。**429 だけは待って取り直す**（ほかの断りは、待っても変わらない）。
    待つのは `WAITS` と、Wikimedia が返す Retry-After の長いほう"""
    for i in range(len(WAITS) + 1):
        try:
            return get(url), 200
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == len(WAITS):
                log(f"  断られた（{e.code}）: {url}")
                return None, e.code
            ra = (e.headers or {}).get("Retry-After") if e.headers is not None else None
            wait = max(WAITS[i], int(ra) if ra and str(ra).isdigit() else 0)
            log(f"  429。{wait}秒待って取り直す")
            sleep(wait)
        except urllib.error.URLError as e:
            log(f"  届かない（{e.reason}）: {url}")
            return None, 0
    return None, 0


def save(data: bytes, key: str, name: str, root: Path = ROOT) -> None:
    """3つの幅の webp にして置く。**書きかけを置いたに数えない**（別の名前に書いてから入れ替える）"""
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
    for w in WIDTHS:
        w2 = min(w, im.width)
        h = max(1, round(im.height * w2 / im.width))
        f = d / f"{stem(name)}-{w}.webp"
        tmp = f.with_suffix(".tmp")
        im.resize((w2, h), Image.LANCZOS).save(tmp, "WEBP", quality=72 if w > 120 else 78, method=6)
        tmp.replace(f)


def fetch(key: str, root: Path = ROOT, get=_get, sleep=time.sleep, log=print) -> int:
    want = wanted(key, root)
    if not want:
        log(f"::error::{key}: 材料に借りた写真が1枚も無い（置き場が動いた？）")
        return 2
    bad = got = 0
    for name, info in sorted(want.items()):
        if done(key, name, root):
            continue
        if got or bad:
            sleep(GAP)
        url = source(name, info)
        data, code = pull(url, get, sleep, log)
        if data is None and code in (400, 404) and "/thumb/" in url:
            # 元の幅を持たない材料（ソフィア）で、元が 960 より小さかったとき（縮小が無い）。
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


REF = re.compile(r"/guide/([a-z0-9-]+/[a-z0-9-]+)/photos/([a-z0-9-]+)-(\d+)\.webp")


def check(key: str, root: Path = ROOT) -> tuple[list[str], int]:
    """**焼いたものに Wikimedia の絵が0本で、面が指す写真が全部置いてある**か。戻りは（食い違い, 数えた数）"""
    bad: list[str] = []
    seen = 0
    d = photo_dir(key, root)
    for rel in CITIES[key]["baked"]:
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
            if m.group(1) != key:
                bad.append(f"{rel}: 別の街の置き場を指している（{m.group(0)}）")
                continue
            # ピンは 120 を読む（`components/guidebook/SpotMap.tsx` の `tiny`）。面が指していなくても、在ること
            for w in {int(m.group(3)), WIDTHS[0]}:
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


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", nargs="*", help="街（例: north-macedonia/skopje）。無ければ全部")
    ap.add_argument("--check", action="store_true", help="落とさずに確かめるだけ")
    ap.add_argument("--lookup", nargs="+", metavar="FILE", help="Commons のファイル名から、材料の写真の欄を組む")
    a = ap.parse_args(argv)
    if a.lookup:
        return lookup(a.lookup)
    keys = a.key or list(CITIES)
    unknown = [k for k in keys if k not in CITIES]
    if unknown:
        print(f"::error::知らない街: {', '.join(unknown)}（{', '.join(CITIES)}）")
        return 2
    if not a.check:
        rc = max(fetch(k) for k in keys)
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
