"""**0秒目の画の候補（`hook.py`）と、spec の時刻の読みかた（`material.py`）の見張り。合成のシートだけで回す。**

    python3 tools/shorts/plan/hook_selftest.py
    BREAK=named_ref python3 tools/shorts/plan/hook_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python と Pillow だけ
（Selftests には numpy も OpenCV も無い。ffmpeg もネットも使わない）。測りの本体（`measure`。numpy と OpenCV で色と顔を測る）は
偽物に差し替え、**コマの色に焼いた「回と秒」を読み返す**（どの置き場のどのコマを切り出したかまで分かる）。
numpy と OpenCV が在る箱（ショートの見張り `shorts_selftest.yml`）では、face_filter の足で本物の `measure` も1回通す。

## 何を見るか（2026-11-04 に5件の絵コンテを作った担当たちが、同じ道具で踏んだもの）

| 足 | 確かめること |
| --- | --- |
| `named_src` | ほかの回の秒（`kun-t2s_nFQ 0:01:00–0:01:02`）の行: その回の素材を `--material` の隣の置き場から読み、候補の画はその回のその秒のコマ・地図の行（`27:46:40.0–…`）は候補から外して落ちない・ほかの回の置き場が無ければ、その回と行を言って止まる（2） |
| `assets` | 顔の重みが無い: 取りに行く（`fetch_fonts.sh` と同じ道。偽物で）・取りに行かない（`--no-fetch`）なら止まる（2。json を書かない）・`--no-faces` なら回り、絵の見出しと json に「顔は数えていない」。和文の字形の無い書体（豆腐になる）は使わない |
| `no_archive` | archive が無い（窓の見る用のシートと zoom だけ。mp4 も無い）: 回る・どの候補も切った秒のコマ（6x5 と 5x4 の並び）・同じ秒は細かい置き場の1枚だけ・窓の頭で場面を分けて3つ選ぶ・見出しだけの `archive/sheets.csv` でも落ちない |
| `row_windows` | 最後の行が回の終わり近く（2:19:43）でも、候補は行ごとの区間の前後 `--margin` 秒だけ（回まるごとに広がらない） |
| `face_filter` | 面積 30% を越える顔の箱は点 0.9 以上のときだけ顔と数える（鍋の手羽先を「顔 45%」と数えない）・本物の大きい顔と小さい顔は数える・顔の無い画がみな 0 でも順位が並び順で割れない |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が `hook.py`・`material.py` の**本物の字**を1か所だけ書き換えた写しを作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
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
FILES = ("hook.py", "material.py")

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    # 1. ほかの回の秒・地図の行
    "named_ref": ("hook.py", "            out.append((i, vid or main, a, b if b is not None else a + 2.0))\n",
                  "            out.append((i, main, a, b if b is not None else a + 2.0))\n",
                  {"named_src"}, "回の名前を読み捨て、ほかの回の秒をこの回の秒として探す"),
    "map_keep": ("hook.py", "            if M.is_map(a):\n", "            if False:\n",
                 {"named_src"}, "地図の行（配信の時間軸の外の秒）を、配信の行として扱う"),
    "other_root": ("hook.py", "        base = root / v\n", "        base = a.material\n",
                   {"named_src"}, "ほかの回の画も、この回の置き場から探す"),
    "missing_other": ("hook.py", "    if missing:\n", "    if False:\n",
                      {"named_src"}, "ほかの回の置き場が無くても、どの回のどの行かを言わずに進む"),
    "ref_parse": ("material.py", '_REF = re.compile(r"^\\s*([A-Za-z0-9_-]{11})(?:\\s+|@)\\s*(\\S.*)$")\n',
                  '_REF = re.compile(r"(?!x)x")\n',
                  {"named_src"}, "時刻の頭の回の名前を読まない（hook.py が落ちる・担当が行を外した写しを作る）"),
    # 2. 顔の重み・書体
    "silent_faces": ("hook.py", "        if faces and yun is None:\n            stop(",
                     "        if False:\n            stop(",
                     {"assets"}, "顔の重みが無いまま進む（黙って顔を 0 で数える）"),
    "no_fetch_path": ("hook.py", "        if fetch:\n", "        if False:\n",
                      {"assets"}, "顔の重みが無いとき、書き出しの道具と同じ取りかたで取りに行かない"),
    "tofu": ("hook.py", '    return any(kana) and kana != ink("\\U000F0000\\U000F0001")\n', "    return True\n",
             {"assets"}, "和文の字形の無い書体も使う（ラベルが豆腐になる）"),
    "no_faces_label": ("hook.py",
                       '    title = f"{name}: 0秒目の画の候補（測った順。決めるのは人）" + ("" if faces else "　※顔は数えていない")\n',
                       '    title = f"{name}: 0秒目の画の候補（測った順。決めるのは人）"\n',
                       {"assets"}, "顔を数えていない絵に、そう書かない"),
    # 3. archive の無い回
    "clipsheets": ("hook.py", "        if gone and M.sheet_rows(idx.parent):\n", "        if False:\n",
                   {"named_src", "no_archive"}, "mp4 の無い窓を、見る用のシートから取らない"),
    "zoom_off": ("hook.py", '    for z in sorted(base.glob("zoom-*")):\n', "    for z in []:\n",
                 {"named_src", "no_archive", "row_windows", "assets"}, "zoom のシートを候補にしない"),
    "dedupe": ("hook.py", '        if not any(abs(k["t"] - c["t"]) < DEDUP_S for k in kept):\n', "        if True:\n",
               {"no_archive"}, "同じ秒を2つの置き場から2枚並べる"),
    "archive_required": ("material.py", "    if not p.exists():\n        return []\n",
                         "    if False:\n        return []\n",
                         {"named_src", "no_archive", "row_windows", "assets"},
                         "置き場に sheets.csv が無いと落ちる（archive が無い回で回らない）"),
    "grid_fixed": ("material.py", "    for cols in range(1, 9):\n", "    for cols in (5,):\n",
                   {"named_src", "no_archive"}, "シートの並びを 5 列と決め打ちする（窓の見る用のシートは 6 列）"),
    # 4. 候補にする範囲
    "window_range": ("hook.py", "        return any(v == vid and a - margin <= t <= b + margin for _, v, a, b in spans)\n",
                     "        return min(x[2] for x in spans) - margin <= t <= max(x[3] for x in spans) + margin\n",
                     {"row_windows"}, "行の最初から最後までを1つの範囲にする（最後の行が回の終わり近くだと回まるごと）"),
    # 6. 顔の数えかた
    "big_face": ("hook.py", "        if area > BIG_FACE and float(f[14]) < BIG_FACE_SCORE:\n", "        if False:\n",
                 {"face_filter"}, "点の低い大きな箱（鍋の手羽先）も顔と数える"),
    "pct_ties": ("hook.py", "            rank[x] = (k + j) / 2\n", "            rank[x] = order.index(x)\n",
                 {"face_filter"}, "同じ値の順位を並び順で割る（顔の無い画がみな 0 のとき、後ろの画ほど点が高い）"),
}

MAIN, OTHER = "MAINvid_001", "kun-t2s_nFQ"   # 11字の videoId（- と _ を含む回も読む）
VW, VH = 720, 1280                           # 配信の縦横（縦長）
TW, TH = 45, 80                              # シートの1コマ（小さくてよい。並びは寸法から割り出される）
GAP, HEAD = 4, 30                            # media.make_sheets の余白（見張りの側でも書いておく）
MAP_SRC = "27:46:40.0–27:46:42.9"            # 地図の行（hookmap.py の T_BASE から）


# ---- 合成の素材 ------------------------------------------------------------

def color_of(vid: str, t: float) -> tuple[int, int, int]:
    """コマの色に「回と秒」を焼く（JPEG でも読み返せるよう、6 刻み）"""
    v = int(round(t))
    return 40 + (v % 32) * 6, 40 + ((v // 32) % 32) * 6, 90 if vid == MAIN else 170


def decode(img: Image.Image) -> tuple[str, int]:
    w, h = img.size
    r, g, b = ImageStat.Stat(img.convert("RGB").crop((w // 2 - 5, h // 2 - 5, w // 2 + 5, h // 2 + 5))).mean
    return (MAIN if b < 130 else OTHER), int(round((r - 40) / 6)) + 32 * int(round((g - 40) / 6))


def make_sheet(path: Path, vid: str, times: list[float], cols: int) -> None:
    """media.make_sheets と同じ並び（各コマの下に帯・最後の1枚は埋まった段まで）"""
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


def meta(d: Path, vid: str, **kw) -> None:
    d.mkdir(parents=True, exist_ok=True)
    (d / "meta.json").write_text(json.dumps({"id": vid, "width": VW, "height": VH, **kw}))


def write_clips(base: Path, vid: str, windows: list[tuple[float, float]]) -> None:
    """取り込んだ窓（mp4 は無い。--sheets で開いた形）: index.json・meta.json・見る用のシート（2秒に1コマ・6x5）"""
    d = base / "clips"
    meta(d, vid, ranges=[list(w) for w in windows])
    clips, rows = [], []
    for n, (a, b) in enumerate(windows, 1):
        clips.append({"n": n, "start": a, "end": b, "file": f"{n:02d}_x.mp4", "ok": True})
        ts = [a + 2 * k for k in range(int((b - a) // 2) + 1)]
        f = f"sheets/{n:02d}_01.jpg"
        make_sheet(d / f, vid, ts, 6)
        rows.append([n, f, "", "", ts[0], ts[-1], len(ts), 0, f"{n:02d}_x.mp4", a])
    (d / "index.json").write_text(json.dumps({"video": vid, "clips": clips}))
    write_csv(d / "sheets.csv", ["clip", "file", "from_hms", "to_hms", "from", "to", "frames", "bytes", "clip_file", "start"],
              rows)


def write_zoom(base: Path, vid: str, a: float, b: float, step: float = 1.0) -> None:
    """zoom（5x4 の並び）と、その visual.csv・scenes.csv"""
    d = base / f"zoom-{int(a)}-{int(b)}-{1 / step:g}fps"
    meta(d, vid, range=[a, b])
    ts = [a + step * k for k in range(int(round((b - a) / step)) + 1)]
    rows = []
    for s in range(0, len(ts), 20):
        part = ts[s:s + 20]
        f = f"sheets/{s // 20:04d}.jpg"
        make_sheet(d / f, vid, part, 5)
        rows.append([f, "", "", part[0], part[-1], len(part), 0])
    write_csv(d / "sheets.csv", ["file", "from_hms", "to_hms", "from", "to", "frames", "bytes"], rows)
    write_csv(d / "visual.csv", ["t", "motion_mean", "motion_max", "bright", "sat", "score_max", "cut"],
              [[int(t), 1 + (int(t) * 7) % 13, 0, 100, 0.5, 0, 0] for t in ts])
    write_csv(d / "scenes.csv", ["t", "hms", "score", "ratio"], [])


def spec_file(d: Path, name: str, rows: list[dict]) -> Path:
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_text(json.dumps({"id": "p1", "title_card": "見張り", "rows": rows}, ensure_ascii=False))
    return p


# ---- 道具を読む・偽物を差す -------------------------------------------------

def load_tool(src: Path) -> types.ModuleType:
    for m in ("hook", "material"):
        sys.modules.pop(m, None)
    spec = importlib.util.spec_from_file_location("hook", src / "hook.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["hook"] = mod
    spec.loader.exec_module(mod)
    return mod


def fake_measure(c: dict, det) -> dict:
    """measure の代わり（numpy も OpenCV も使わない）。コマの色から回と秒を読み返し、色の強さは秒から決める"""
    vid, v = decode(c["img"])
    c["decoded"] = (vid, v)
    return {"colorful": float(v % 17), "warm": float(v % 5) / 10, "sharp": float(v % 11), "face": 0.0, "faces": 0,
            "bright": 100.0}


class Bench:
    def __init__(self, src: Path, tmp: Path) -> None:
        self.h = load_tool(src)
        self.tmp = tmp
        self.n = 0
        self.titles: list[str] = []
        self.font = tmp / "fake_font.ttf"
        self.font.write_bytes(b"x")
        self.h.measure = fake_measure
        self.h.montage = lambda tiles, title, out, font_path: (self.titles.append(title), out.write_bytes(b"jpg"))
        self.h.has_japanese = lambda p: Path(str(p)).name == "fake_font.ttf"
        self.h.font_places = lambda: [self.font]
        self.yunet = tmp / "models" / "face_detection_yunet_2023mar.onnx"
        self.h.yunet_places = lambda: [self.yunet]

    def run(self, argv: list[str]) -> dict:
        self.n += 1
        out = self.tmp / f"out{self.n}"
        buf = io.StringIO()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                rc = self.h.main([*argv, "--out", str(out)])
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
        except Exception:
            rc = 1
            buf.write(traceback.format_exc())
        js = sorted(out.glob("hook_*.json")) if out.exists() else []
        return {"rc": rc, "text": buf.getvalue(), "json": json.loads(js[0].read_text()) if js else None,
                "names": sorted(p.name for p in out.iterdir()) if out.exists() else []}


def all_decoded(cands: list[dict]) -> bool:
    """候補の画が、どれも候補の回と秒のコマか（シートの並びを読み違えると、隣のコマや帯を切る）"""
    return bool(cands) and all(tuple(c.get("decoded") or ()) == (c["vid"], int(round(c["t"]))) for c in cands)


# ---- 足 ----------------------------------------------------------------------

def leg_named_src(b: Bench):
    root = b.tmp / "named" / "ingest"
    write_clips(root / MAIN, MAIN, [(50, 70), (110, 130), (170, 190)])
    write_zoom(root / OTHER, OTHER, 40, 80)
    rows = [{"line": "この回の1行目", "src": ["0:01:00–0:01:02"]},
            {"line": "この回の2行目", "src": ["0:02:00–0:02:02"]},
            {"line": "ほかの回の行", "src": [f"{OTHER} 0:01:00–0:01:02"], "still": f"{OTHER}@0:01:01"},
            {"line": "地図の行", "src": [MAP_SRC], "still": None},
            {"line": "地図とこの回の行", "src": [MAP_SRC, "0:03:00"]}]
    sp = spec_file(b.tmp / "named", "spec_A.json", rows)
    r = b.run([str(sp), "--material", str(root / MAIN), "--no-faces"])
    j = r["json"] or {}
    top = j.get("top20") or []   # 偽の measure が読み返した回と秒（decoded）も json に乗る
    other = [c for c in top if c.get("vid") == OTHER]
    out = [(f"回る（終了コード {r['rc']}）{'' if r['rc'] == 0 else r['text'][-300:]}", r["rc"] == 0 and bool(j)),
           (f"回は {j.get('videos')}（この回・ほかの回）", j.get("videos") == [MAIN, OTHER]),
           (f"地図の行（3・4行目の1つ目）は候補から外し、行の番号を出す（{j.get('map_rows')}）", j.get("map_rows") == [3, 4]),
           ("候補の画は、どれもその回のその秒のコマ（ほかの回の行はほかの回の置き場から）",
            all(tuple(c.get("decoded") or ()) == (c["vid"], int(round(c["t"]))) for c in top)),
           (f"ほかの回の候補がある（{len(other)}）・その回の行の前後30秒だけ（30〜92秒）",
            bool(other) and all(30 <= c["t"] <= 92 for c in other)),
           ("ほかの回の候補は、ほかの回の行に付く", any(c.get("row") == 2 for c in other)),
           ("地図の秒の候補は無い", all(c["t"] < 100000 for c in top))]
    # ほかの回の置き場が無い: その回と行を言って止まる（2）。json を書かない
    root2 = b.tmp / "named2" / "ingest"
    write_clips(root2 / MAIN, MAIN, [(50, 70)])
    r2 = b.run([str(sp), "--material", str(root2 / MAIN), "--no-faces"])
    out.append((f"ほかの回の置き場が無ければ止まる（終了コード {r2['rc']}）・回の名前と行を言う・json を書かない",
                r2["rc"] == 2 and r2["json"] is None and "素材の置き場が無い回" in r2["text"]
                and OTHER in r2["text"] and "[2]" in r2["text"]))
    return out


def leg_assets(b: Bench):
    h = b.h
    root = b.tmp / "assets" / "ingest"
    write_zoom(root / MAIN, MAIN, 40, 80)
    sp = spec_file(b.tmp / "assets", "spec_B.json", [{"line": "1行", "src": ["0:01:00–0:01:02"]}])
    out = []
    # 重みが無く、取りに行かない: 止まる（2）。黙って 0 で数えない
    if b.yunet.exists():
        b.yunet.unlink()
    try:
        with redirect_stderr(io.StringIO()) as err:
            got = h.ensure_assets(True, False)
        out.append((f"重みが無く取りに行かないなら止まる（返った: {got}）", False))
    except SystemExit as e:
        msg = err.getvalue()
        out.append((f"重みが無く取りに行かないなら止まる（終了コード {e.code}）・探した所と取りかたと --no-faces を言う",
                    e.code == 2 and "顔の重み" in msg and "探した所" in msg and "fetch_fonts.sh" in msg
                    and "--no-faces" in msg))
    # 重みが無く、取りに行く: 書き出しの道具と同じ取りかた（偽の fetch_fonts.sh が重みを置く）で取れたら使う
    fetch = b.tmp / "fake_fetch.sh"
    fetch.write_text(f"mkdir -p '{b.yunet.parent}' && printf onnx > '{b.yunet}'\n")
    h.FETCH = fetch
    try:
        with redirect_stderr(io.StringIO()) as err:
            yun, fnt = h.ensure_assets(True, True)
        out.append((f"無ければ取りに行き、取れた重みを使う（{yun}）・取りに行くと言う",
                    yun == b.yunet and "取りに行く" in err.getvalue()))
    except SystemExit as e:
        out.append((f"無ければ取りに行き、取れた重みを使う（止まった: {e.code}）", False))
    # 取りに行っても取れない: 止まる
    b.yunet.unlink()
    fetch.write_text("exit 3\n")
    try:
        with redirect_stderr(io.StringIO()):
            got = h.ensure_assets(True, True)
        out.append((f"取りに行っても取れなければ止まる（返った: {got}）", False))
    except SystemExit as e:
        out.append((f"取りに行っても取れなければ止まる（終了コード {e.code}）", e.code == 2))
    # 道具ごと: --no-fetch で止まる（json を書かない）・--no-faces なら回って、そう書く
    r = b.run([str(sp), "--material", str(root / MAIN), "--no-fetch"])
    out.append((f"重みが無い・--no-fetch: 止まる（終了コード {r['rc']}）・json を書かない",
                r["rc"] == 2 and r["json"] is None))
    r2 = b.run([str(sp), "--material", str(root / MAIN), "--no-faces"])
    j2 = r2["json"] or {}
    out.append((f"--no-faces: 回る（終了コード {r2['rc']}）・json に faces: off（{j2.get('faces')}）・点に顔を足さない",
                r2["rc"] == 0 and j2.get("faces") == "off"
                and all("face" not in (c.get("ranks") or {}) for c in j2.get("top20") or [])))
    out.append((f"--no-faces: 絵の見出しに「顔は数えていない」（{b.titles[-1] if b.titles else None}）",
                bool(b.titles) and "顔は数えていない" in b.titles[-1]))
    out.append(("出力の名前は spec_<名前>.json の <名前>（hook_B.json）", "hook_B.json" in r2["names"]))
    # 和文の字形の無い書体は使わない（豆腐になる）。Pillow の既定の書体は欧文だけ
    real = load_tool(Path(h.__file__).parent)
    try:
        latin = ImageFont.load_default(size=24)
    except TypeError:
        latin = None
    if latin is not None and hasattr(latin, "getlength"):
        out.append(("欧文だけの書体（Pillow の既定）は和文の書体と認めない", real.has_japanese(latin) is False))
    jp = [p for p in [*real.font_places()] if p.is_file()]
    if jp:
        out.append((f"和文の書体は認める（{jp[0].name}）", real.has_japanese(jp[0]) is True))
    sys.modules["hook"] = h   # 読み直した本物を、足の外へ持ち出さない
    return out


def leg_no_archive(b: Bench):
    root = b.tmp / "noarch" / "ingest"
    base = root / MAIN
    write_clips(base, MAIN, [(50, 70), (110, 130), (170, 190)])
    write_zoom(base, MAIN, 100, 140)          # 2つ目の窓と重なる（同じ秒は zoom の1枚だけ残す）
    rows = [{"line": "1行目", "src": ["0:01:00–0:01:02"]}, {"line": "2行目", "src": ["0:02:00–0:02:02"]},
            {"line": "3行目", "src": ["0:03:00–0:03:02"]}]
    sp = spec_file(b.tmp / "noarch", "spec.json", rows)
    r = b.run([str(sp), "--material", str(base), "--no-faces"])   # archive の置き場そのものが無い
    j = r["json"] or {}
    top, picked = j.get("top20") or [], j.get("picked") or []
    src = j.get("sources") or {}
    pairs = sorted((c["t"], c["kind"]) for c in top)
    near = [(x, y) for x, y in zip(pairs, pairs[1:]) if y[0] - x[0] < 0.6]
    zoom_span = [c for c in top if 100 <= c["t"] <= 130 and c["kind"] == "clipsheet"]
    out = [(f"archive が無くても回る（終了コード {r['rc']}）{'' if r['rc'] == 0 else r['text'][-300:]}",
            r["rc"] == 0 and bool(j)),
           (f"窓の見る用のシートと zoom の両方から候補を作る（{src}）", src.get("clipsheet", 0) > 0 and src.get("zoom", 0) > 0),
           ("候補の画は、どれもその秒のコマ（6x5・5x4 の並びを読み違えない）",
            all(tuple(c.get("decoded") or ()) == (c["vid"], int(round(c["t"]))) for c in top)),
           (f"同じ秒の画は1枚だけ（0.6秒の内に2枚: {near[:3]}）", not near),
           (f"zoom と重なる秒は zoom のほう（窓のシートが残った: {[c['t'] for c in zoom_span][:5]}）", not zoom_span),
           (f"場面の違う3つを選ぶ（{[(c['t'], c.get('scene')) for c in picked]}）",
            len(picked) == 3 and len({c.get("scene") for c in picked}) == 3),
           ("mp4 の無い窓はシートから取ったと言う", any("シート" in n for n in j.get("notes") or []))]
    # 担当が zoom から組んだ archive（sheets.csv が見出しだけ）が残っていても落ちない
    (base / "archive").mkdir(parents=True)
    write_csv(base / "archive" / "sheets.csv", ["file", "from_hms", "to_hms", "from", "to", "frames"], [])
    r2 = b.run([str(sp), "--material", str(base), "--no-faces"])
    out.append((f"見出しだけの archive/sheets.csv でも回る（終了コード {r2['rc']}・候補 {(r2['json'] or {}).get('candidates')}）",
                r2["rc"] == 0 and (r2["json"] or {}).get("candidates") == j.get("candidates")))
    return out


def leg_row_windows(b: Bench):
    root = b.tmp / "windows" / "ingest"
    write_zoom(root / MAIN, MAIN, 0, 9000, step=10.0)   # 回まるごと10秒に1コマ（2時間30分）
    rows = [{"line": "最初の行", "src": ["0:01:00–0:01:02"]}, {"line": "最後の行", "src": ["2:19:43–2:19:45"]}]
    sp = spec_file(b.tmp / "windows", "spec.json", rows)
    r = b.run([str(sp), "--material", str(root / MAIN), "--no-faces", "--margin", "30"])
    j = r["json"] or {}
    top = j.get("top20") or []
    ok = [(30 <= c["t"] <= 92) or (8353 <= c["t"] <= 8415) for c in top]
    # 手で数えた候補: 30〜90秒の7コマと 8360〜8410秒の6コマ
    return [(f"回る（終了コード {r['rc']}）", r["rc"] == 0 and bool(j)),
            (f"候補は行ごとの区間の前後30秒の13コマだけ（{j.get('candidates')}。回まるごとなら 839）", j.get("candidates") == 13),
            ("並んだ候補は、どれも行の区間の前後30秒の内", bool(top) and all(ok))]


def leg_face_filter(b: Bench):
    h = b.h

    def box(area: float, score: float, w: int = 216, hh: int = 357) -> list[float]:
        side = math.sqrt(area * w * hh)
        return [10, 10, side, side, *([0.0] * 10), score]
    W, H = 216, 357
    cases = [("鍋の手羽先（面積45%・点0.75）", [box(0.45, 0.75)], []),
             ("こねる生地（面積89%・点0.71）", [box(0.89, 0.71)], []),
             ("投げ銭の札の絵（面積34%・点0.85）", [box(0.34, 0.85)], []),
             ("自撮りの近い顔（面積38%・点0.93）", [box(0.38, 0.93)], [0.38]),
             ("ふつうの顔（面積18%・点0.72）", [box(0.18, 0.72)], [0.18]),
             ("2人（本物の大きい顔と、点の低い大きい箱）", [box(0.38, 0.93), box(0.6, 0.8)], [0.38]),
             ("見つからない", None, [])]
    out = []
    for what, found, want in cases:
        got = [round(x, 2) for x in h.face_areas(found, W, H)]
        out.append((f"{what} → 顔と数える面積 {got}（欲しいのは {want}）", got == want))
    ranks = h.pct([0.0, 0.0, 0.0, 0.0, 0.2])
    out.append((f"顔の無い画（みな 0）は同じ順位（{[round(x, 2) for x in ranks]}）",
                len(set(ranks[:4])) == 1 and ranks[4] == 1.0))
    out.append((f"違う値は小さい順に 0〜1（{h.pct([3.0, 1.0, 2.0])}）", h.pct([3.0, 1.0, 2.0]) == [1.0, 0.0, 0.5]))
    # numpy と OpenCV の在る箱では、本物の measure に偽の検出を通す（Selftests には無いので、在るときだけ）
    try:
        import cv2  # noqa: F401
        import numpy as np
    except ImportError:
        return out
    real = load_tool(Path(h.__file__).parent)

    class Det:
        def __init__(self, rows):
            self.rows = rows

        def setInputSize(self, size):
            pass

        def detect(self, img):
            return 1, (np.array(self.rows, dtype=np.float32) if self.rows else None)
    img = Image.new("RGB", (W, H), (180, 120, 60))
    m1 = real.measure({"img": img}, Det([box(0.45, 0.75)]))
    m2 = real.measure({"img": img}, Det([box(0.38, 0.93), box(0.6, 0.8)]))
    out.append((f"本物の measure: 手羽先の箱は顔 0（{m1['face']}・{m1['faces']}人）", m1["face"] == 0.0 and m1["faces"] == 0))
    out.append((f"本物の measure: 本物の顔だけ数える（{m2['face']}・{m2['faces']}人）",
                abs(m2["face"] - 0.38) < 0.01 and m2["faces"] == 1))
    sys.modules["hook"] = h
    return out


LEGS = {
    "named_src": leg_named_src,
    "assets": leg_assets,
    "no_archive": leg_no_archive,
    "row_windows": leg_row_windows,
    "face_filter": leg_face_filter,
}


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
    """本物の hook.py・material.py を写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
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
