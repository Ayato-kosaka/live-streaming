#!/usr/bin/env python3
"""**Kenney のキットを、控えた写し（`kits.json`）から取って、sha256 で確かめる。**

    python3 tools/sprites/kitmirror.py fetch food-kit <置き場>   # <置き場>/<format>/… に並べる
    python3 tools/sprites/kitmirror.py borrow fantasy-town-kit <形式のフォルダ>   # 借りるファイルだけ上書き
    python3 tools/sprites/kitmirror.py where food-kit             # 「format<TAB>dest<TAB>title」を1行
    python3 tools/sprites/kitmirror.py kits                        # 知っているキットを空白で並べる

終了コード 0=全部そろって sha256 も一致 / 1=取れない・一致しないものが在った /
**2=知らないキット・控えが空**（`docs/island-standards.md` §15）。

## なぜ要るか

2026-11-12 から、kenney.nl がキットのページを GitHub のランナーに 403 で返す（#1351）。
`bake_sprites.yml` が素材を落とすところで毎回止まり、料理の主役の絵が1枚も焼けなくなった。
**断られた先を、出口や名乗りを替えて取り直しには行かない**（#337 #338 と同じ決まり）。
Kenney のキットは CC0 なので、CC0 のまま再配布されている写しから取る。

写しは誰でも書き換えられる置き場なので、**中身が同じであることを sha256 で確かめる。**
`kits.json` の sha256 は、別々の2か所の写しで全部のファイルが一致したものだけを書いてある。
1か所目で合わなければ2か所目を見て、どちらでも合わなければ**そのファイルを置かずに 1 で止める。**
合わないものを置くと、版の違う部品で焼いた絵が黙ってコミットされる。

`fetchkits.sh` が、kenney.nl のページが断ったときだけこれを呼ぶ。
置き場の形は zip を開いたときと同じ（`<置き場>/<format>/Textures/colormap.png`）にしてあるので、
そのあとの「Textures/ が置けたか」の見張りは、zip から取ったときと同じものがそのまま効く。

## 借りるファイル（`borrow`）

町の建物（Fantasy Town Kit）の絵19枚は、キット自身の `Textures/colormap.png` ではなく、
**Mini Characters と同じ Kenney 共通の色見本**で焼かれている。同じ置き場で colormap を
取り合っていた頃に焼いたもので、`render.html` の色相帯（green=壁・blue=柱・neutral=屋根）も
その色見本に合わせてある。キット自身の色見本で焼くと屋根が塗り替わらない
（`hut-home` が物の差 28.1。共通の色見本なら19枚とも「同じ」。2026-11-21 に測った）。
だから `kits.json` の `borrow` に「このファイルは、あのキットのものを置く」と書く。
写しから取るときも、kenney.nl の zip から取ったときも（`fetchkits.sh` が `borrow` を呼ぶ）同じものが置かれる。
"""
import hashlib
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LOCK = Path(__file__).resolve().with_name("kits.json")
# 1ファイル数十KB。16本並べると、キット1つ（200点）が数秒で終わる
JOBS = 16
TIMEOUT_SEC = 60


def load(lock: Path = LOCK) -> dict:
    return json.loads(lock.read_text(encoding="utf-8"))["kits"]


def safe(rel: str) -> bool:
    """控えの名前が、置き場の外を指していないか。"""
    parts = rel.split("/")
    return bool(rel) and not rel.startswith("/") and "\\" not in rel and all(p not in ("", ".", "..") for p in parts)


def grab(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SEC) as r:
            return r.read()
    except (OSError, ValueError):
        return None


def fetch_one(mirrors: list[str], rel: str, want: str, out: Path) -> tuple[str, str]:
    """写しを順に当たり、sha256 が合ったものだけを置く。(rel, どこから or 断った理由)"""
    seen = []
    for i, base in enumerate(mirrors):
        body = grab(base + urllib.request.quote(rel))
        if body is None:
            seen.append(f"{i + 1}:取れない")
            continue
        got = hashlib.sha256(body).hexdigest()
        if got != want:
            seen.append(f"{i + 1}:sha256 が違う（{got[:12]}…）")
            continue
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        return rel, f"ok{i + 1}"
    return rel, " / ".join(seen) or "写しが無い"


def plan(kit: str, kits: dict, only_borrowed: bool) -> tuple[int, list[tuple[str, str, list[str]]]]:
    """(終了コード, [(名前, sha256, 当たる写し)])。借りるファイルは、貸すキットの写しに当たる。"""
    k = kits.get(kit)
    if not k or not k.get("files") or not k.get("mirrors"):
        print(f"{kit}: kits.json に控えが無い", file=sys.stderr)
        return 2, []
    bad = [rel for rel in k["files"] if not safe(rel)]
    if bad:
        print(f"{kit}: 置き場の外を指す名前が控えに在る: {bad[:3]}", file=sys.stderr)
        return 1, []
    lend = k.get("borrow", {})
    if set(lend) - set(k["files"]):
        print(f"{kit}: borrow に files に無い名前が在る（sha256 を控えずに借りない）", file=sys.stderr)
        return 1, []
    jobs = []
    for rel, want in sorted(k["files"].items()):
        if rel in lend:
            mirrors = kits.get(lend[rel], {}).get("mirrors")
            if not mirrors:
                print(f"{kit}: {rel} を借りる先 {lend[rel]} が kits.json に無い", file=sys.stderr)
                return 1, []
            jobs.append((rel, want, mirrors))
        elif not only_borrowed:
            jobs.append((rel, want, k["mirrors"]))
    return 0, jobs


def run(kit: str, root: Path, kits: dict, only_borrowed: bool) -> int:
    rc, jobs = plan(kit, kits, only_borrowed)
    if rc or not jobs:
        return rc
    with ThreadPoolExecutor(JOBS) as ex:
        res = list(ex.map(lambda j: fetch_one(j[2], j[0], j[1], root), jobs))
    fails = [(rel, why) for rel, why in res if not why.startswith("ok")]
    for rel, why in fails[:10]:
        print(f"  ✕ {rel}: {why}", file=sys.stderr)
    if fails:
        print(f"{kit}: {len(fails)}/{len(res)} 点が写しから取れない・一致しない。置かずに止める", file=sys.stderr)
        return 1
    by: dict[str, int] = {}
    for _, why in res:
        by[why] = by.get(why, 0) + 1
    where = "・".join(f"{w[2:]}か所目 {c}点" for w, c in sorted(by.items()))
    k = kits[kit]
    lent = "".join(f"。{r} は {src} のもの" for r, src in sorted(k.get("borrow", {}).items()))
    what = "借りるファイルを" if only_borrowed else f"{k['title']}（{k['license']}）を"
    print(f"{kit}: {what}写しから {len(res)} 点。sha256 は全部一致（{where}）{lent}")
    return 0


def fetch(kit: str, out: Path, kits: dict | None = None) -> int:
    """キットの形式のフォルダぜんぶを `<out>/<format>/` に並べる（借りるファイルは貸すキットの写しから）。"""
    kits = load() if kits is None else kits
    return run(kit, out / (kits.get(kit) or {}).get("format", "_"), kits, False)


def borrow(kit: str, fmt_dir: Path, kits: dict | None = None) -> int:
    """借りるファイルだけを、形式のフォルダ（zip を開いたところ）に上書きする。借りるものが無ければ何もしない。"""
    kits = load() if kits is None else kits
    return run(kit, fmt_dir, kits, True)


def main(argv: list[str]) -> int:
    if len(argv) == 1 and argv[0] == "kits":
        print(" ".join(sorted(load())))
        return 0
    if len(argv) == 2 and argv[0] == "where":
        k = load().get(argv[1])
        if not k:
            print(f"知らないキット: {argv[1]}", file=sys.stderr)
            return 2
        print(f"{k['format']}\t{k['dest']}\t{k['title']}")
        return 0
    if len(argv) == 3 and argv[0] == "fetch":
        return fetch(argv[1], Path(argv[2]))
    if len(argv) == 3 and argv[0] == "borrow":
        return borrow(argv[1], Path(argv[2]))
    print(__doc__.split("\n\n")[1], file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
