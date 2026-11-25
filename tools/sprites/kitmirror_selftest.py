#!/usr/bin/env python3
"""**kenney.nl が断ったときの写しの道（`kitmirror.py` と `fetchkits.sh`）が、断るときに断るかを見る。**

    python3 tools/sprites/kitmirror_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**網に出ない。** 写しは `file://` の置き場でこしらえ、`fetchkits.sh` は一時の置き場へ
写して、偽の `curl`（kenney.nl には 403 を返す）を PATH の頭に置いて回す。
本物の `tools/sprites/models/` には1バイトも書かない。

## なぜ要るか

写しは誰でも書き換えられる置き場で、そこから取った部品はそのまま島の絵になって
コミットされる。**sha256 が合わないのに置く**・**どちらでも合わないのに 0 で終わる**の
どちらかが起きると、版の違う部品で焼いた絵が黙って入る。焼くほうは何も言わない
（`Textures/` が無ければまっ白に焼けて通る。README）。だから両側から当てる:

- **守りたかったもの**: 1か所目が違えば2か所目で救う。どちらも違えば置かずに止める
- **断られた先を迂回しない**: kenney.nl へはページを1回取りに行くだけで、名乗りや出口を替えない
- **控えが manifest を覆っている**: 焼く絵の部品が控えに無いと、写しの道では焼けない
- **テクスチャを取り合わない**: Fantasy Town Kit と Mini Characters が同じ置き場で
  `Textures/colormap.png` を上書きし合っていた（CLAUDE.md「スプライトの色」）
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import kitmirror  # noqa: E402

FAILED: list[str] = []
CHECKED = 0


def ok(cond: bool, what: str) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


GLB = b"glTF-fake-model"
TEX = b"\x89PNG-fake-colormap"
TEX2 = b"\x89PNG-another-kit"


def mirror(root: Path, files: dict[str, bytes]) -> str:
    """file:// の写しをこしらえて、その頭の URL を返す。"""
    for rel, body in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(body)
    return root.as_uri() + "/"


def kit(mirrors: list[str], files: dict[str, bytes], dest: str = "models/food") -> dict:
    return {"title": "Fake Kit (1.0)", "license": "CC0-1.0", "format": "GLB format",
            "dest": dest, "mirrors": mirrors, "files": {k: sha(v) for k, v in files.items()}}


def quiet(fn, *a):
    """本体の出す字は見ない（判定は戻り値と置かれたもので見る）。"""
    import contextlib
    import io
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return fn(*a)


def case_rescue(tmp: Path) -> None:
    print("\n[1] 1か所目の sha256 が違えば、2か所目の正しいほうを置く")
    want = {"apple.glb": GLB, "Textures/colormap.png": TEX}
    a = mirror(tmp / "a", {"apple.glb": GLB, "Textures/colormap.png": b"tampered"})
    b = mirror(tmp / "b", want)
    out = tmp / "out1"
    rc = quiet(kitmirror.fetch, "fake", out, {"fake": kit([a, b], want)})
    ok(rc == 0, f"2か所目で全部そろう → 0（実際 {rc}）")
    got = out / "GLB format" / "Textures" / "colormap.png"
    ok(got.is_file() and got.read_bytes() == TEX, "置かれた colormap は sha256 の合う2か所目のもの")
    ok((out / "GLB format" / "apple.glb").read_bytes() == GLB, "部品は zip を開いたときと同じ形（<format>/…）に並ぶ")


def case_reject(tmp: Path) -> None:
    print("\n[2] どちらの写しでも合わなければ、置かずに 1 で止める")
    want = {"apple.glb": GLB, "Textures/colormap.png": TEX}
    a = mirror(tmp / "c", {"apple.glb": GLB, "Textures/colormap.png": b"tampered-1"})
    b = mirror(tmp / "d", {"apple.glb": GLB, "Textures/colormap.png": b"tampered-2"})
    out = tmp / "out2"
    rc = quiet(kitmirror.fetch, "fake", out, {"fake": kit([a, b], want)})
    ok(rc == 1, f"2か所とも sha256 が違う → 1（実際 {rc}）")
    ok(not (out / "GLB format" / "Textures" / "colormap.png").exists(), "合わないものは置き場に残らない")

    out = tmp / "out3"
    rc = quiet(kitmirror.fetch, "fake", out, {"fake": kit([a, b], {**want, "pear.glb": GLB})})
    ok(rc == 1, f"どちらの写しにも無いファイルが在る → 1（実際 {rc}）")


def case_borrow(tmp: Path) -> None:
    print("\n[8] 借りるファイル（borrow）は、貸すキットの写しから取って置く")
    town_own = {"wall.glb": GLB, "Textures/colormap.png": TEX2}   # キット自身の色見本
    chars = {"character-a.glb": GLB, "Textures/colormap.png": TEX}  # 共通の色見本
    t_m = mirror(tmp / "bt", town_own)
    c_m = mirror(tmp / "bc", chars)
    town = kit([t_m], {"wall.glb": GLB, "Textures/colormap.png": TEX}, "models")
    town["borrow"] = {"Textures/colormap.png": "chars"}
    kits = {"town": town, "chars": kit([c_m], chars, "models/characters")}
    out = tmp / "ob1"
    rc = quiet(kitmirror.fetch, "town", out, kits)
    got = out / "GLB format" / "Textures" / "colormap.png"
    ok(rc == 0 and got.is_file() and got.read_bytes() == TEX,
       f"fetch: 町の colormap は自身のものではなく、貸す側の共通の色見本（実際 {rc}）")
    zipdir = tmp / "ob2"
    mirror(zipdir, town_own)  # zip を開いたところ。キット自身の色見本が入っている
    rc = quiet(kitmirror.borrow, "town", zipdir, kits)
    ok(rc == 0 and (zipdir / "Textures" / "colormap.png").read_bytes() == TEX,
       f"borrow: zip の色見本を、共通の色見本で上書きする（実際 {rc}）")
    rc = quiet(kitmirror.borrow, "chars", tmp / "ob3", kits)
    ok(rc == 0 and not (tmp / "ob3").exists(), f"借りるものが無いキットは何もしない（実際 {rc}）")
    no_lender = {**kits, "town": {**town, "borrow": {"Textures/colormap.png": "nope"}}}
    ok(quiet(kitmirror.fetch, "town", tmp / "ob4", no_lender) == 1, "貸す側が控えに無い → 1")
    unlisted = {**kits, "town": {**town, "borrow": {"Textures/other.png": "chars"}}}
    ok(quiet(kitmirror.fetch, "town", tmp / "ob5", unlisted) == 1, "sha256 を控えていない名前を借りる → 1")
    rc, box, _ = run_fetchkits(tmp, kits, ["town", "chars"])
    placed = box / "models" / "Textures" / "colormap.png"
    ok(rc == 0 and placed.is_file() and placed.read_bytes() == TEX,
       f"fetchkits.sh: 町と住人を同じ回に落としても、町の置き場は共通の色見本（実際 {rc}）")
    # kenney.nl が届く日の道。zip にはキット自身の色見本が入っているが、置くのは共通の色見本
    zip_town = {"Town Kit/Models/GLB format/wall.glb": GLB, "Town Kit/Models/GLB format/Textures/colormap.png": TEX2}
    rc, box, log = run_fetchkits(tmp, kits, ["town"], {"town": zip_town})
    placed = box / "models" / "Textures" / "colormap.png"
    ok(rc == 0 and "kenney.nl/media/town.zip" in log and placed.is_file() and placed.read_bytes() == TEX,
       f"fetchkits.sh: kenney.nl の zip から取った回も、町の置き場は共通の色見本（実際 {rc}）")


def case_lock_shape(tmp: Path) -> None:
    print("\n[3] 控えがおかしいときは取りに行かない")
    a = mirror(tmp / "e", {"apple.glb": GLB})
    ok(quiet(kitmirror.fetch, "nope", tmp / "o4", {"fake": kit([a], {"apple.glb": GLB})}) == 2,
       "知らないキット → 2")
    ok(quiet(kitmirror.fetch, "fake", tmp / "o5", {"fake": kit([a], {})}) == 2, "files が空 → 2")
    ok(quiet(kitmirror.fetch, "fake", tmp / "o6", {"fake": kit([], {"apple.glb": GLB})}) == 2, "写しが無い → 2")
    (tmp / "e" / "evil.glb").write_bytes(GLB)
    rc = quiet(kitmirror.fetch, "fake", tmp / "o7" / "in", {"fake": kit([a + "x/"], {"../../evil.glb": GLB})})
    ok(rc == 1 and not (tmp / "o7" / "evil.glb").exists(), f"置き場の外を指す名前 → 1 で、外に書かない（実際 {rc}）")
    r = subprocess.run([sys.executable, str(HERE / "kitmirror.py"), "where", "no-such-kit"],
                       capture_output=True, text=True)
    ok(r.returncode == 2, f"`where` に知らないキット → 2（実際 {r.returncode}）")


def case_real_lock() -> None:
    print("\n[4] 本物の kits.json")
    kits = kitmirror.load()
    ok(len(kits) >= 5, f"キットが5つ以上（{len(kits)}）")
    dests = [k["dest"] for k in kits.values()]
    ok(len(dests) == len(set(dests)), f"置き場（dest）がキットごとに別（{sorted(dests)}）")
    for name, k in sorted(kits.items()):
        pinned = all(re.search(r"/[0-9a-f]{40}/", m) for m in k["mirrors"])
        hexes = all(re.fullmatch(r"[0-9a-f]{64}", v) for v in k["files"].values())
        ok(len(k["mirrors"]) >= 2 and pinned, f"{name}: 写しが2か所以上で、どれも commit で版を止めてある")
        ok(k["license"] == "CC0-1.0" and hexes and all(kitmirror.safe(r) for r in k["files"]),
           f"{name}: CC0 で、sha256 は64桁、名前は置き場の中（{len(k['files'])}点）")
        if k["format"] == "GLB format":
            # GLB 形式の4つは、どの glb も Textures/colormap.png を外から読む（無いとまっ白）
            ok("Textures/colormap.png" in k["files"], f"{name}: Textures/colormap.png が控えに在る")
        for rel, lender in k.get("borrow", {}).items():
            ok(k["files"].get(rel) == kits.get(lender, {}).get("files", {}).get(rel),
               f"{name}: 借りる {rel} の sha256 が、貸す {lender} の控えと同じ")
    # 町の絵19枚は共通の色見本で焼いてあり、色相帯もそれに合わせてある。自身の色見本に
    # 「直す」と屋根が塗り替わらなくなる（hut-home で物の差 28.1。kitmirror.py「借りるファイル」）
    town, chars = kits.get("fantasy-town-kit", {}), kits.get("mini-characters", {})
    ok(town.get("borrow", {}).get("Textures/colormap.png") == "mini-characters"
       and town["files"]["Textures/colormap.png"] == chars.get("files", {}).get("Textures/colormap.png"),
       "fantasy-town-kit の colormap は mini-characters から借りる（いまの町の絵の色）")

    r = subprocess.run(["node", str(HERE / "bakeplan.mjs"), "--parts"], capture_output=True, text=True, cwd=HERE)
    ok(r.returncode == 0, f"manifest の部品が全部どれかのキットの置き場に在る（bakeplan --parts {r.returncode}）"
       + (f": {r.stderr.strip()[:200]}" if r.returncode else ""))
    try:
        parts = json.loads(r.stdout)
    except ValueError:
        parts = {}
    n = sum(len(v) for v in parts.values())
    lost = [f"{k}/{p}" for k, ps in parts.items() for p in ps if p not in kits.get(k, {}).get("files", {})]
    ok(n > 0 and not lost, f"manifest の部品 {n} 点が全部、そのキットの控えに在る（無い: {lost[:5]}）")


FAKE_CURL = r"""#!/usr/bin/env bash
# 偽の curl。引数を控え、kenney.nl には 403、unpkg には中身の要らない字を返す
printf '%s\n' "$*" >> "$CURL_LOG"
out=""; fmt=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) fmt="$2"; shift 2 ;;
    --retry | --retry-delay | --max-time) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
case "$url" in
  # KENNEY_ZIPS に <キット>.zip が在るキットだけ、ページが 200 で zip の在りかを返す（届く日の道）
  https://kenney.nl/media/*.zip) cp "$KENNEY_ZIPS/${url##*/}" "$out"; [ -n "$fmt" ] && printf 200; exit 0 ;;
  https://kenney.nl/assets/*)
    k="${url##*/}"
    if [ -f "$KENNEY_ZIPS/$k.zip" ]; then
      printf '<a href="https://kenney.nl/media/%s.zip">' "$k" > "$out"; [ -n "$fmt" ] && printf 200
    else
      : > "$out"; [ -n "$fmt" ] && printf 403
    fi
    exit 0 ;;
  https://unpkg.com/*) printf 'export {};\n' > "$out"; [ -n "$fmt" ] && printf 200; exit 0 ;;
esac
echo "偽の curl: 知らない宛先 $url" >&2
exit 7
"""


def run_fetchkits(tmp: Path, kits: dict, names: list[str],
                  zips: dict[str, dict[str, bytes]] | None = None) -> tuple[int, Path, str]:
    """fetchkits.sh と kitmirror.py を一時の置き場へ写し、偽の curl で回す。

    `zips` に入れたキットだけ、kenney.nl が 200 で zip を返す（中身は {zip の中の名前: バイト}）。
    """
    import zipfile
    box = tmp / f"box-{len(list(tmp.glob('box-*')))}"
    box.mkdir()
    (box / "zips").mkdir()
    for name, members in (zips or {}).items():
        with zipfile.ZipFile(box / "zips" / f"{name}.zip", "w") as z:
            for arc, body in members.items():
                z.writestr(arc, body)
    for f in ("fetchkits.sh", "kitmirror.py"):
        shutil.copy(HERE / f, box / f)
    (box / "kits.json").write_text(json.dumps({"why": "見張りの偽物", "kits": kits}), encoding="utf-8")
    bin_ = box / "bin"
    bin_.mkdir()
    (bin_ / "curl").write_text(FAKE_CURL, encoding="utf-8")
    (bin_ / "curl").chmod(0o755)
    log = box / "curl.log"
    env = {**os.environ, "PATH": f"{bin_}{os.pathsep}{os.environ['PATH']}", "CURL_LOG": str(log),
           "GITHUB_STEP_SUMMARY": str(box / "summary.md"), "KENNEY_ZIPS": str(box / "zips")}
    r = subprocess.run(["bash", str(box / "fetchkits.sh"), *names], capture_output=True, text=True, env=env, timeout=120)
    return r.returncode, box, (log.read_text(encoding="utf-8") if log.exists() else "")


def case_fetchkits(tmp: Path) -> None:
    print("\n[5] fetchkits.sh: kenney.nl が 403 なら、迂回せずに写しから取って置く")
    files = {"apple.glb": GLB, "Textures/colormap.png": TEX}
    a = mirror(tmp / "fa", files)
    rc, box, log = run_fetchkits(tmp, {"food-kit": kit([a], files)}, ["food-kit"])
    ok(rc == 0, f"403 のあと写しから取れて 0（実際 {rc}）")
    tex = box / "models" / "food" / "Textures" / "colormap.png"
    ok(tex.is_file() and tex.read_bytes() == TEX, "models/food/Textures/colormap.png が置けた（無いとまっ白に焼ける）")
    asked = [line for line in log.splitlines() if "kenney.nl" in line]
    ok(len(asked) == 1, f"kenney.nl へはページを1回取りに行くだけ（{len(asked)}回）")
    ok(not re.search(r"(^|\s)(-A|--user-agent|-H|--header|-x|--proxy|--resolve|--connect-to)(\s|$)", log),
       "名乗り・出口・宛先を替える引数を curl に渡していない")
    summary = (box / "summary.md").read_text(encoding="utf-8") if (box / "summary.md").exists() else ""
    ok("写しから" in summary and "403" in summary, "run の要約に「403 だったので写しから」が残る")

    print("\n[6] fetchkits.sh: 写しが合わなければ、置かずに止まる")
    bad = mirror(tmp / "fb", {"apple.glb": GLB, "Textures/colormap.png": b"tampered"})
    rc, box, _ = run_fetchkits(tmp, {"food-kit": kit([bad], files)}, ["food-kit"])
    ok(rc != 0, f"sha256 が違う → 0 で終わらない（実際 {rc}）")
    ok(not (box / "models" / "food" / "Textures" / "colormap.png").exists(), "合わない colormap は置き場に無い")

    print("\n[7] fetchkits.sh: 2つのキットが同じ置き場で colormap を取り合ったら止まる")
    other = {"wall.glb": GLB, "Textures/colormap.png": TEX2}
    b = mirror(tmp / "fc", other)
    rc, box, _ = run_fetchkits(tmp, {"food-kit": kit([a], files, "models"),
                                     "fantasy-town-kit": kit([b], other, "models")}, ["food-kit", "fantasy-town-kit"])
    ok(rc != 0, f"同じ置き場に別の colormap → 0 で終わらない（実際 {rc}）")
    ok((box / "models" / "Textures" / "colormap.png").read_bytes() == TEX, "先に置いたキットの colormap が上書きされていない")
    rc, box, _ = run_fetchkits(tmp, {"food-kit": kit([a], files)}, ["building-kit"])
    ok(rc != 0, f"控えに無いキットの名前（building-kit）→ 0 で終わらない（実際 {rc}）")


def main() -> int:
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        case_rescue(tmp)
        case_reject(tmp)
        case_lock_shape(tmp)
        case_real_lock()
        case_fetchkits(tmp)
        case_borrow(tmp)
    if CHECKED == 0:
        print("数えるものが無い")
        return 2
    print(f"\n{CHECKED - len(FAILED)}/{CHECKED} 通った")
    for f in FAILED:
        print(f"  ✕ {f}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
