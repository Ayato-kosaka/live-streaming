"""**絵コンテ（`storyboard.py`）の見張り。合成のシートだけで回す（Python と Pillow だけ）。**

    python3 tools/shorts/plan/storyboard_selftest.py
    BREAK=title_fallback python3 tools/shorts/plan/storyboard_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。和文の書体の無い箱（Selftests）では、書体だけ
Pillow の既定の書体に差し替える（字の形は見ない）。シートの1コマの色に「回と秒」を焼き、切り出したコマから読み返す
（`hook_selftest.py` と同じ作り）。

## 何を見るか（2026-11-04 に5件の絵コンテを作った担当たちが踏んだもの）

| 足 | 確かめること |
| --- | --- |
| `title_card` | spec に `title` が無い（1次の spec は題の札 `title_card` だけ）: 落ちずに回り、見出しの題は題の札（国旗の絵文字と改行を外したもの）。どちらも無ければ空で回る。`title` があればそれ |
| `out_name` | 2案の回（`spec_A.json`・`spec_B.json`。id はどちらも p1）: 出力は `storyboard_A.jpg`・`table_A.md` と `_B` に分かれて上書きしない。`spec.json` なら id・`--name` ならその名前 |
| `stills` | still の無い行は src の1つ目の頭（回の名前つきならその回）から・`kun-t2s_nFQ@0:01:10` の still はその回の置き場から・地図の行（`27:46:40.0`）は落ちずに灰色の札・窓の見る用のシート（`clips/`）だけの回でも切れる。切ったコマはどれも、その回のその秒 |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が `storyboard.py` の**本物の字**を1か所だけ書き換えた写しを作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる。
"""
from __future__ import annotations

import importlib.util
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
import types
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
FILES = ("storyboard.py", "material.py", "readtime.py")

CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "title_fallback": ("storyboard.py", '    t = spec.get("title") or spec.get("title_card") or ""\n',
                       '    t = spec["title"]\n',
                       {"title_card", "out_name", "stills"}, "spec に title が無いと落ちる（1次の spec は題の札だけ。どの足の spec も title を持たない）"),
    "flag_strip": ("storyboard.py", '    t = re.sub(r"[\\U0001F1E6-\\U0001F1FF\\uFE0F]", "", str(t))\n',
                   "    t = str(t)\n",
                   {"title_card"}, "題の札の国旗の絵文字を外さない（和文の書体に字形が無く豆腐になる）"),
    "name_from_file": ("storyboard.py", '    m = re.fullmatch(r"spec_(.+)\\.json", spec_path.name)\n', "    m = None\n",
                       {"out_name"}, "出力の名前を spec の id で決める（2案の回で A と B が上書きし合う）"),
    "named_still": ("storyboard.py", "    return v or default, sec(still)\n", "    return default, sec(still)\n",
                    {"stills"}, "still の回の名前を読まず、ほかの回の秒をこの回の置き場から探す"),
    "still_from_src": ("storyboard.py",
                       '    return M.ref(v, f"{int(h)}:{int(rem // 60):02d}:{rem % 60:04.1f}")\n',
                       '    return f"{int(h)}:{int(rem // 60):02d}:{rem % 60:04.1f}"\n',
                       {"stills"}, "still の無い行で、src の回の名前を捨てる"),
    "map_tile": ("storyboard.py", "    if M.is_map(t):\n        return map_tile()\n",
                 "    if False:\n        return map_tile()\n",
                 {"stills"}, "地図の行で配信のシートを探して落ちる"),
    "clips_sheets": ("storyboard.py",
                     '    for d in sorted(base.glob("zoom-*")) + [base / "clips", base / "archive"]:\n',
                     '    for d in sorted(base.glob("zoom-*")) + [base / "archive"]:\n',
                     {"stills"}, "窓の見る用のシート（clips/）を探さない（clips だけの回で落ちる）"),
}

MAIN, OTHER = "MAINvid_001", "kun-t2s_nFQ"
VW, VH = 720, 1280
TW, TH = 45, 80
GAP, HEAD = 4, 30
MAP_SRC = "27:46:40.0–27:46:42.9"


def color_of(vid: str, t: float) -> tuple[int, int, int]:
    v = int(round(t))
    return 40 + (v % 32) * 6, 40 + ((v // 32) % 32) * 6, 90 if vid == MAIN else 170


def decode(img: Image.Image) -> tuple[str, int]:
    w, h = img.size
    r, g, b = ImageStat.Stat(img.convert("RGB").crop((w // 2 - 5, h // 2 - 5, w // 2 + 5, h // 2 + 5))).mean
    return (MAIN if b < 130 else OTHER), int(round((r - 40) / 6)) + 32 * int(round((g - 40) / 6))


def make_sheet(path: Path, vid: str, times: list[float], cols: int) -> None:
    lab = max(20, int(round(TH * 0.07)))
    used = math.ceil(len(times) / cols)
    img = Image.new("RGB", (cols * TW + (cols + 1) * GAP, HEAD + used * (TH + lab) + (used + 1) * GAP), (24, 24, 24))
    d = ImageDraw.Draw(img)
    for i, t in enumerate(times):
        r, c = divmod(i, cols)
        x, y = GAP + c * (TW + GAP), HEAD + GAP + r * (TH + lab + GAP)
        img.paste(Image.new("RGB", (TW, TH), color_of(vid, t)), (x, y))
        d.rectangle([x, y + TH, x + TW - 1, y + TH + lab - 1], fill=(0, 0, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=95)


def write_csv(path: Path, head: list[str], rows: list[list]) -> None:
    path.write_text(",".join(head) + "\n" + "".join(",".join(str(x) for x in r) + "\n" for r in rows))


def write_clips(base: Path, vid: str, windows: list[tuple[float, float]]) -> None:
    d = base / "clips"
    d.mkdir(parents=True, exist_ok=True)
    (d / "meta.json").write_text(json.dumps({"id": vid, "width": VW, "height": VH}))
    rows = []
    for n, (a, b) in enumerate(windows, 1):
        ts = [a + 2 * k for k in range(int((b - a) // 2) + 1)]
        f = f"sheets/{n:02d}_01.jpg"
        make_sheet(d / f, vid, ts, 6)
        rows.append([n, f, "", "", ts[0], ts[-1], len(ts), 0, f"{n:02d}_x.mp4", a])
    (d / "index.json").write_text(json.dumps({"video": vid, "clips": [
        {"n": n, "start": a, "end": b, "file": f"{n:02d}_x.mp4"} for n, (a, b) in enumerate(windows, 1)]}))
    write_csv(d / "sheets.csv", ["clip", "file", "from_hms", "to_hms", "from", "to", "frames", "bytes", "clip_file", "start"],
              rows)


def write_zoom(base: Path, vid: str, a: float, b: float) -> None:
    d = base / f"zoom-{int(a)}-{int(b)}-1fps"
    d.mkdir(parents=True, exist_ok=True)
    (d / "meta.json").write_text(json.dumps({"id": vid, "width": VW, "height": VH, "range": [a, b]}))
    ts = [a + k for k in range(int(b - a) + 1)]
    rows = []
    for s in range(0, len(ts), 20):
        part = ts[s:s + 20]
        f = f"sheets/{s // 20:04d}.jpg"
        make_sheet(d / f, vid, part, 5)
        rows.append([f, "", "", part[0], part[-1], len(part), 0])
    write_csv(d / "sheets.csv", ["file", "from_hms", "to_hms", "from", "to", "frames", "bytes"], rows)


def load_tool(src: Path) -> types.ModuleType:
    for m in ("storyboard", "material", "readtime"):
        sys.modules.pop(m, None)
    spec = importlib.util.spec_from_file_location("storyboard", src / "storyboard.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["storyboard"] = mod
    spec.loader.exec_module(mod)
    real_font = mod.font

    def font(size: int):
        # 和文の書体が無い箱（Selftests）では、Pillow の既定の書体で描く（字の形は見ない）
        try:
            return real_font(size)
        except SystemExit:
            try:
                return ImageFont.load_default(size=size)
            except TypeError:
                return ImageFont.load_default()
    mod.font = font
    return mod


class Bench:
    def __init__(self, src: Path, tmp: Path) -> None:
        self.sb = load_tool(src)
        self.tmp = tmp
        self.n = 0
        root = tmp / "ingest"
        write_clips(root / MAIN, MAIN, [(50, 80)])      # この回は窓の見る用のシートだけ（archive も zoom も無い）
        write_zoom(root / OTHER, OTHER, 55, 75)         # ほかの回は zoom だけ
        write_zoom(tmp / "zingest" / MAIN, MAIN, 50, 80)
        self.root = root

    def run(self, spec: dict, fname: str, material: Path, extra: list[str] | None = None) -> dict:
        self.n += 1
        d = self.tmp / f"run{self.n}"
        d.mkdir()
        sp = d / fname
        sp.write_text(json.dumps(spec, ensure_ascii=False))
        out = d / "out"
        buf = io.StringIO()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                rc = self.sb.main([str(sp), str(material), str(out), *(extra or [])])
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
            if not isinstance(e.code, int) and e.code is not None:
                buf.write(str(e.code))
        except Exception:
            rc = 1
            buf.write(traceback.format_exc())
        return {"rc": rc, "text": buf.getvalue(), "names": sorted(p.name for p in out.iterdir()) if out.exists() else []}


def rows_of(n: int) -> list[dict]:
    return [{"line": f"{k}行目の原稿です。", "src": [f"0:01:{k * 2:02d}–0:01:{k * 2 + 1:02d}"], "visual": "画"}
            for k in range(n)]


def leg_title_card(b: Bench):
    sb = b.sb
    zm = b.tmp / "zingest" / MAIN
    card = "🇲🇰北マケドニアで、\nアサリ抜きクラムチャウダーを作った！"
    r1 = b.run({"id": "p1", "title_card": card, "rows": rows_of(3)}, "spec.json", zm)
    out = [(f"title が無く title_card だけの spec でも回る（終了コード {r1['rc']}）{'' if r1['rc'] == 0 else r1['text'][-300:]}",
            r1["rc"] == 0 and "storyboard_p1.jpg" in r1["names"])]
    try:
        t = sb.title_of({"id": "p1", "title_card": card})
        out.append((f"見出しの題は題の札から、国旗と改行を外して（{t!r}）",
                    t == "北マケドニアで、アサリ抜きクラムチャウダーを作った！"))
        t2 = sb.title_of({"id": "p1"})
        out.append((f"題も題の札も無ければ空（{t2!r}）", t2 == ""))
        t3 = sb.title_of({"id": "p1", "title": "仮の題", "title_card": card})
        out.append((f"title があればそれ（{t3!r}）", t3 == "仮の題"))
    except Exception as e:
        out.append((f"題を読めない（{type(e).__name__}: {e}）", False))
    r2 = b.run({"id": "p1", "rows": rows_of(2)}, "spec.json", zm)
    out.append((f"題も題の札も無い spec でも回る（終了コード {r2['rc']}）", r2["rc"] == 0))
    return out


def leg_out_name(b: Bench):
    zm = b.tmp / "zingest" / MAIN
    d = b.tmp / "names"
    outs = []
    for fname in ("spec_A.json", "spec_B.json"):
        sp = d / fname
        sp.parent.mkdir(parents=True, exist_ok=True)
        sp.write_text(json.dumps({"id": "p1", "title_card": "題", "rows": rows_of(2)}, ensure_ascii=False))
        buf = io.StringIO()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                outs.append(b.sb.main([str(sp), str(zm), str(d / "out")]))
        except BaseException as e:
            outs.append(f"{type(e).__name__}: {e}")
    names = sorted(p.name for p in (d / "out").iterdir()) if (d / "out").exists() else []
    want = ["storyboard_A.jpg", "storyboard_B.jpg", "table_A.md", "table_B.md"]
    r3 = b.run({"id": "p1", "rows": rows_of(2)}, "spec_A.json", zm, ["--name", "X"])
    r4 = b.run({"id": "p9", "rows": rows_of(2)}, "spec.json", zm)
    return [(f"2案（spec_A・spec_B。id はどちらも p1）の出力が分かれる（{outs}・{names}）", outs == [0, 0] and names == want),
            (f"--name X なら storyboard_X（{r3['names']}）", r3["names"] == ["storyboard_X.jpg", "table_X.md"]),
            (f"spec.json なら id（{r4['names']}）", r4["names"] == ["storyboard_p9.jpg", "table_p9.md"])]


def leg_stills(b: Bench):
    sb = b.sb
    rows = [{"line": "この回の画（src から）", "src": ["0:01:00–0:01:02"]},
            {"line": "ほかの回の画（src から）", "src": [f"{OTHER} 0:01:04–0:01:06"]},
            {"line": "ほかの回の画（still）", "src": [f"{OTHER} 0:01:09–0:01:11"], "still": f"{OTHER}@0:01:10"},
            {"line": "地図の行", "src": [MAP_SRC], "still": None},
            {"line": "この回の画（still）", "src": ["0:01:07–0:01:09"], "still": "0:01:08"}]
    want = [(MAIN, 60), (OTHER, 64), (OTHER, 70), "地図の札", (MAIN, 68)]
    got: list = []
    for r in rows:
        try:
            vid, t = sb.parse(sb.still_of(r), MAIN)
            im = sb.frame(b.root, vid, t)
            if t >= 100000:   # 地図の行は、灰色の札（配信の画は無い）
                got.append("地図の札" if im.convert("RGB").getpixel((3, 3)) == (70, 78, 92) else "地図でない画")
            else:
                got.append(decode(im))
        except BaseException as e:
            got.append(f"{type(e).__name__}: {str(e)[:60]}")
    r = b.run({"id": "p1", "title_card": "題", "rows": rows}, "spec_A.json", b.root / MAIN)
    return [(f"行ごとに切ったコマ（{got} / 欲しいのは {want}）", got == want),
            (f"ほかの回の画・地図の行・窓のシートだけの回で、絵コンテが回る（終了コード {r['rc']}）"
             f"{'' if r['rc'] == 0 else r['text'][-300:]}", r["rc"] == 0 and any(n.startswith("storyboard_") for n in r["names"]))]


LEGS = {"title_card": leg_title_card, "out_name": leg_out_name, "stills": leg_stills}


def run_legs(src: Path, tmp: Path, quiet: bool) -> tuple[list[str], int]:
    b = Bench(src, tmp)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        try:
            res = fn(b)
        except Exception:
            res = [(f"足が落ちた: {traceback.format_exc()[-400:]}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> None:
    for f in FILES:
        shutil.copy(HERE / f, dst / f)
    f, old, new, _, _ = CUTS[name]
    text = (dst / f).read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が {f} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / f).write_text(text.replace(old, new), encoding="utf-8")


def child(name: str) -> int:
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        src, tmp = Path(td) / "src", Path(td) / "runs"
        src.mkdir()
        tmp.mkdir()
        cut_copy(name, src)
        failed, checked = run_legs(src, tmp, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        env = dict(os.environ, BREAK=name, PYTHONDONTWRITEBYTECODE="1")
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=300, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-200:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(HERE, Path(td), quiet=False)
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
