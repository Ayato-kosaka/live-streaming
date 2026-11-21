#!/usr/bin/env python3
"""**Kenney のキットを、控えた写し（`kits.json`）から取って、sha256 で確かめる。**

    python3 tools/sprites/kitmirror.py fetch food-kit <置き場>   # <置き場>/<format>/… に並べる
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


def fetch(kit: str, out: Path, kits: dict | None = None) -> int:
    kits = load() if kits is None else kits
    k = kits.get(kit)
    if not k or not k.get("files") or not k.get("mirrors"):
        print(f"{kit}: kits.json に控えが無い", file=sys.stderr)
        return 2
    bad = [rel for rel in k["files"] if not safe(rel)]
    if bad:
        print(f"{kit}: 置き場の外を指す名前が控えに在る: {bad[:3]}", file=sys.stderr)
        return 1
    root = out / k["format"]
    with ThreadPoolExecutor(JOBS) as ex:
        res = list(ex.map(lambda kv: fetch_one(k["mirrors"], kv[0], kv[1], root), sorted(k["files"].items())))
    fails = [(rel, why) for rel, why in res if not why.startswith("ok")]
    for rel, why in fails[:10]:
        print(f"  ✕ {rel}: {why}", file=sys.stderr)
    if fails:
        print(f"{kit}: {len(fails)}/{len(res)} 点が写しから取れない・一致しない。置かずに止める", file=sys.stderr)
        return 1
    by = {}
    for _, why in res:
        by[why] = by.get(why, 0) + 1
    where = "・".join(f"{n}か所目 {c}点" for n, c in sorted((w[2:], c) for w, c in by.items()))
    print(f"{kit}: {k['title']}（{k['license']}）を写しから {len(res)} 点。sha256 は全部一致（{where}）")
    return 0


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
    print(__doc__.split("\n\n")[1], file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
