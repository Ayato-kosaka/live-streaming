#!/usr/bin/env python3
"""0秒目に置く画（冒頭3秒の画）の候補を、その配信の素材から測って3つ挙げ、いまの0秒目と並べた絵を作る。

    python3 tools/shorts/plan/hook.py <spec_X.json> --material <復号した置き場/videoId> --out <置き場> \\
        [--clips <取り込んだ窓の index.json> …] [--current <書き出した X.mp4>] [--name X]

出来るもの: `<置き場>/hook_<名前>.jpg`（いまの0秒目＋候補3つ）と `hook_<名前>.json`（測った値・上位20）。
名前は `--name`、無ければ spec のファイル名 `spec_<名前>.json` の <名前>、それも無ければ spec の `id`
（2案の回で、A と B が同じ id でも上書きしない）。
**決めるのは人。** 道具は測れるもので並べるだけで、「その動画の答え（オチ）を先に見せる画か」は人が見る
（手順は viral-shorts-creator の `references/production.md` 3 と `script_writing.md` 1）。

## 素材は、開いたままの置き場から読む（写しを作らない）

`--material` は `decrypt.py` が開いた `<置き場>/<videoId>`。その下を見て、在るものから候補を作る。

| 置き場 | 候補にする画 |
| --- | --- |
| `clips/`（`--clips` で渡した index.json か、置き場の `clips/index.json`） | mp4 が在れば1秒ごと。無い窓（`--sheets` で開いた回）は見る用のシート（2秒に1コマ）から |
| `zoom-*/` | シートから（依頼の fps） |
| `archive/` | コンタクトシート（10秒に1コマ） |

同じ秒を2か所が持っていれば、細かいほう（mp4 → zoom → 窓のシート → archive）を使う。**archive が無くても回る**
（いまは原稿が使う区間だけを clips・zoom で取るので、ほぼ毎回無い。前は無いと落ち、担当が zoom から組んで渡していた）。

spec の行の `src` に**ほかの回の秒**（`kunXt2sXnFQ 0:17:23–0:17:26`。書きかたは `material.py`）があれば、その回の素材を
`--material` の隣（`<置き場>/kunXt2sXnFQ/`）から同じように読む。無ければ、どの回のどの行の素材が無いかを言って止まる（2）。
**地図の行**（`27:46:40.0` から。`tools/shorts/hookmap` の刺し素材）は候補にしない（配信の画ではない。落とさずに外す）。

## 候補にする範囲

spec の**行ごとの区間**の前後 `--margin` 秒（既定 30）。前は行の時刻の最初から最後までを1つの範囲にしていたので、
最後の行が回の終わり近く（2:19:43）にあると、範囲が回まるごとに広がり、同じ配信の別の案の画（C のバスに B のケバブ屋）が
上に来た。

## 何を測るか（どれも 216x384 に縮めて、透かしの帯を落としてから）

| 物差し | 何を見ているか |
| --- | --- |
| 色の強さ | Hasler と Süsstrunk の colorfulness。くすんだ壁・歩道・暗い車内は低い |
| 暖色の寄り | 画の真ん中（横 15〜85%・縦 20〜80%）のうち、赤〜黄で鮮やかな画素の割合。料理・黄色いバスの寄りで高い |
| くっきり | 真ん中のラプラシアンの分散。ぶれた画は低い |
| 動き | 取り込みの `visual.csv`（1秒ごとの隣のコマとの差）。archive と zoom は刻みが違うので、同じ置き場の中で順位を付ける。無い秒は真ん中の順位 |
| 顔の寄り | YuNet でいちばん大きい顔の面積の割合。2人以上写っていれば「第三者の顔」の印（ぼかしが要る） |
| 山場 | その時刻が、spec の後ろ6割にある【大】か「上がる」感情の行の画か（その動画の答えに近い画） |

点 ＝ 色の強さ・暖色の寄りの順位（各1）＋くっきり・動き・顔の順位（各0.5）＋山場（1）− 暗い画（1）。
順位は候補の中での百分位（物差しの目盛りを揃えるため。同じ値は同じ順位。顔の無い画がみな 0 のとき、並んだ順で順位が
割れて後ろの画ほど点が高くなっていた）。上から、**場面の違う**3つを選ぶ（場面は `scenes.csv` の変わりめで区切る。archive が
無い回は、zoom の変わりめと、窓・zoom の頭も切れ目にする。窓どうしは別の場所なので）。

### 顔は、黙って0で数えない

重みは SHORTS_QA_YUNET → `render/models/` → `qa/models/` →（worktree なら）元の clone の同じ所、の順に探し、どこにも無ければ
書き出しの道具と同じ `tools/shorts/render/fetch_fonts.sh` で取りに行く（`--no-fetch` なら取りに行かずに止まる）。取れなければ
止まる（2）。顔を数えずに回すなら `--no-faces` と言う（絵の見出しと json に「顔は数えていない」と出て、点に顔を足さない）。
ラベルの書体も同じ（M PLUS → 箱の和文の書体。和文の字形が無い書体は豆腐になるので使わない）。

**大きい顔は、点が高いときだけ数える**（面積 `BIG_FACE` を越える箱は、YuNet の点 `BIG_FACE_SCORE` 以上）。クラムチャウダーの回で
鍋の手羽先を「顔 45%」と数え、その画が1位に来た。手元の6回のシート（3,718件）で測ると、こねる生地と手・投げ銭の札の絵・
室内を顔と数えた箱（面積 34〜99%）は点 0.71〜0.85、本物の自撮りの顔は面積 40% までで点 0.92 前後（2026-11-04）。
"""
from __future__ import annotations

import argparse
import bisect
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import material as M  # noqa: E402

REPO = HERE.parents[2]
RENDER = HERE.parent / "render"
FETCH = RENDER / "fetch_fonts.sh"
YUNET_NAME = "face_detection_yunet_2023mar.onnx"
FONT_NAME = "MPLUSRounded1c-Black.ttf"
# 箱の和文の書体（M PLUS が無いとき）。和文の字形を持つかは has_japanese で確かめる
SYSTEM_FONTS = [Path("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"),
                Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
                Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                Path("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf")]
TW, TH = 216, 384          # 測る大きさ（アーカイブのシートの1コマと同じ）
KEEP_H = 1192 / 1280       # PRISM Live の透かしの帯より上だけ使う（render の style.json の watermarks）
MIN_APART = 8.0            # 候補どうしをこれだけ離す（同じ場面の隣のコマを3つ並べない）
DEDUP_S = 0.6              # 同じ回のこの秒の内は同じ画（細かい置き場のほうを残す）
PRIO = {"clip": 0, "zoom": 1, "clipsheet": 2, "archive": 3}   # 同じ秒なら小さいほうを残す
BIG_FACE, BIG_FACE_SCORE = 0.30, 0.90   # 面積がこれを越える顔の箱は、点がこれ以上のときだけ数える（頭の注）


def stop(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def hms(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:04.1f}"


# ---------------------------------------------------------------- 顔の重みと書体

def checkout_roots() -> list[Path]:
    """この道具の clone と、worktree なら元の clone。git の外の重み・書体は元の clone にだけ在ることが多い"""
    roots = [REPO]
    try:
        common = subprocess.run(["git", "-C", str(HERE), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                capture_output=True, text=True, timeout=10, check=False).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        common = ""
    if common:
        main = Path(common).parent
        if main.is_dir() and main.resolve() != REPO.resolve():
            roots.append(main)
    return roots


def yunet_places() -> list[Path]:
    env = os.environ.get("SHORTS_QA_YUNET")
    out = [Path(env)] if env else []
    for r in checkout_roots():
        out += [r / "tools/shorts/render/models" / YUNET_NAME, r / "tools/shorts/qa/models" / YUNET_NAME]
    return out


def font_places() -> list[Path]:
    return [r / "tools/shorts/render/fonts" / FONT_NAME for r in checkout_roots()] + SYSTEM_FONTS


def has_japanese(path) -> bool:
    """和文の字形を持つ書体か（書体のファイルか、読んだ書体）。持たない書体は、和文も、無い字（私用領域）も同じ豆腐の箱で描く"""
    try:
        f = ImageFont.truetype(str(path), 24) if isinstance(path, (str, Path)) else path
    except OSError:
        return False

    def ink(s: str) -> bytes:
        im = Image.new("L", (90, 40))
        ImageDraw.Draw(im).text((2, 2), s, fill=255, font=f)
        return im.tobytes()
    kana = ink("あ顔")
    return any(kana) and kana != ink("\U000F0000\U000F0001")


def first(places: list[Path], ok=lambda p: True) -> Path | None:
    for p in places:
        try:
            if p.is_file() and p.stat().st_size > 0 and ok(p):
                return p
        except OSError:
            continue
    return None


def ensure_assets(faces: bool, fetch: bool) -> tuple[Path | None, Path]:
    """（顔の重み, ラベルの書体）。無ければ書き出しの道具と同じ取りかた（fetch_fonts.sh）で取り、取れなければ止まる"""
    def look() -> tuple[Path | None, Path | None]:
        return (first(yunet_places()) if faces else None), first(font_places(), has_japanese)
    yun, fnt = look()
    if (faces and yun is None) or fnt is None:
        what = "・".join(x for x, miss in (("顔の重み（YuNet）", faces and yun is None), ("和文の書体", fnt is None)) if miss)
        if fetch:
            print(f"{what}が無いので取りに行く: bash {FETCH}（書き出しの道具と同じ取りかた）", file=sys.stderr)
            try:
                r = subprocess.run(["bash", str(FETCH)], capture_output=True, text=True, timeout=900, check=False)
                if r.returncode != 0:
                    print((r.stdout + r.stderr).strip()[-800:], file=sys.stderr)
            except (OSError, subprocess.SubprocessError) as e:
                print(f"取りに行けなかった: {e}", file=sys.stderr)
            yun, fnt = look()
        if faces and yun is None:
            stop(f"顔の重み（{YUNET_NAME}）が無い。探した所: " + " / ".join(str(p) for p in yunet_places())
                 + f"。`bash {FETCH}` で取ってから回す（顔を数えずに回すなら --no-faces）")
        if fnt is None:
            stop("ラベルに使う和文の書体が無い（豆腐の絵になる）。探した所: " + " / ".join(str(p) for p in font_places())
                 + f"。`bash {FETCH}` で M PLUS を取ってから回す")
    return yun, fnt


def face_detector(model: Path):
    import cv2
    if not hasattr(cv2, "FaceDetectorYN"):
        stop(f"OpenCV {cv2.__version__} に FaceDetectorYN が無い（顔を数えずに回すなら --no-faces）")
    try:
        return cv2.FaceDetectorYN.create(str(model), "", (TW, TH), 0.7, 0.3, 50)
    except cv2.error as e:
        stop(f"顔の重みを読めない（{model}: {e}）。消して fetch_fonts.sh で取り直す")


def face_areas(found, w: int, h: int) -> list[float]:
    """YuNet の検出（1行 = x, y, w, h, 5点の x・y, 点）→ 顔と数える箱の面積の割合。
    大きい箱は点が高いときだけ数える（料理・生地・札の絵を、画面の半分の顔と数えない。頭の注）"""
    out = []
    for f in [] if found is None else found:
        area = float(f[2]) * float(f[3]) / (w * h)
        if area > BIG_FACE and float(f[14]) < BIG_FACE_SCORE:
            continue
        out.append(area)
    return out


# ---------------------------------------------------------------- spec の行

def row_spans(spec: dict, main: str) -> tuple[list[tuple[int, str, float, float]], list[int]]:
    """spec の行ごとの（行の番号, 回, 始まり, 終わり）と、地図の行の番号。点で書いた src は2秒の区間にする"""
    out, maps = [], []
    for i, r in enumerate(spec["rows"]):
        for s in r.get("src") or []:
            vid, a, b = M.span(s)
            if M.is_map(a):
                if i not in maps:
                    maps.append(i)
                continue
            out.append((i, vid or main, a, b if b is not None else a + 2.0))
    return out, maps


def payoff_rows(spec: dict) -> set[int]:
    """山場の行: 後ろ6割にある【大】か「上がる」感情（mood が up_ で始まる）の行"""
    n = len(spec["rows"])
    return {i for i, r in enumerate(spec["rows"])
            if i >= 0.4 * n and (r.get("big") or str(r.get("mood") or "").startswith("up"))}


def wanted(spans: list[tuple[int, str, float, float]], margin: float):
    """候補にする秒か: 同じ回の、どれかの行の区間の前後 margin 秒の内"""
    def ok(vid: str, t: float) -> bool:
        return any(v == vid and a - margin <= t <= b + margin for _, v, a, b in spans)
    return ok


# ---------------------------------------------------------------- 候補の画


def fit(img: Image.Image) -> Image.Image:
    """縦長の1コマを、透かしの帯を落として測る大きさに揃える"""
    w, h = img.size
    return img.crop((0, 0, w, int(h * KEEP_H))).resize((TW, int(TH * KEEP_H)), Image.BILINEAR)


def clip_file(index: Path, c: dict) -> Path:
    f = Path(c["file"])
    return f if f.is_absolute() else index.parent / f


def clip_frames(index: Path, clips: list[dict], vid: str, ok) -> list[dict]:
    """窓の mp4 を1秒ごとに（fps=1 の k 枚目は、窓の頭から k+0.5 秒のあたり）"""
    import numpy as np
    out = []
    for c in clips:
        if not any(ok(vid, float(c["start"]) + k + 0.5) for k in range(int(float(c["end"]) - float(c["start"])) + 1)):
            continue
        f = clip_file(index, c)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-vf", f"fps=1,scale={TW}:{TH}",
                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
        n = len(raw) // (TW * TH * 3)
        arr = np.frombuffer(raw[:n * TW * TH * 3], np.uint8).reshape(n, TH, TW, 3)
        for k in range(n):
            t = float(c["start"]) + k + 0.5
            if ok(vid, t):
                out.append({"vid": vid, "t": t, "kind": "clip", "src": f"窓 {f.name}",
                            "img": fit(Image.fromarray(arr[k]))})
    return out


def sheet_frames(d: Path, base: Path, kind: str, vid: str, ok, only_clips: set[int] | None = None) -> list[dict]:
    """シート（clips の見る用・zoom・archive。並びはシートの寸法から割り出す）から、候補にする秒のコマを切り出す"""
    rows = M.sheet_rows(d)
    if not rows:
        return []
    wh = M.dims(d, base)
    if wh is None:
        print(f"  注意: {vid} の {d.name} は縦横が分からない（meta.json が無い）ので飛ばす", file=sys.stderr)
        return []
    out = []
    for r in rows:
        if only_clips is not None and int(r.get("clip") or 0) not in only_clips:
            continue
        ts = M.row_times(r)
        keep = [k for k, t in enumerate(ts) if ok(vid, t)]
        if not keep:
            continue
        f = d / r["file"]
        if not f.exists():
            print(f"  注意: シートが無い: {f}", file=sys.stderr)
            continue
        sheet = Image.open(f).convert("RGB")
        try:
            cells = [(k, M.cell(sheet, k, len(ts), *wh)) for k in keep]
        except ValueError as e:
            print(f"  注意: {f} を切れない（{e}）", file=sys.stderr)
            continue
        label = {"clipsheet": f"窓のシート {Path(r['file']).name}", "zoom": f"zoom {d.name[5:]}",
                 "archive": "シート"}[kind]
        for k, im in cells:
            out.append({"vid": vid, "t": ts[k], "kind": kind, "src": label, "img": fit(im)})
    return out


def own_indexes(base: Path, given: list[Path]) -> list[Path]:
    """その回の窓の一覧: --clips で渡したもの、無ければ置き場の clips/index.json"""
    own = base / "clips" / "index.json"
    return given or ([own] if own.exists() else [])


def video_frames(base: Path, vid: str, indexes: list[Path], ok, notes: list[str]) -> list[dict]:
    """その回の候補の画（clips・zoom・archive の在るものから）。同じ秒は細かい置き場のほうを残す"""
    out: list[dict] = []
    for idx in indexes:
        d = json.loads(idx.read_text())
        clips = [c for c in (d["clips"] if isinstance(d, dict) else d) if c.get("ok") is not False]
        have = [c for c in clips if clip_file(idx, c).exists()]
        if have:
            out += clip_frames(idx, have, vid, ok)
        gone = {int(c.get("n", 0)) for c in clips if c not in have}
        if gone and M.sheet_rows(idx.parent):
            notes.append(f"{vid}: 窓の mp4 が無い {len(gone)} 本は、見る用のシート（2秒に1コマ）から取った")
            out += sheet_frames(idx.parent, base, "clipsheet", vid, ok, gone)
    for z in sorted(base.glob("zoom-*")):
        out += sheet_frames(z, base, "zoom", vid, ok)
    out += sheet_frames(base / "archive", base, "archive", vid, ok)
    kept: list[dict] = []
    for c in sorted(out, key=lambda c: (PRIO[c["kind"]], c["t"])):
        if not any(abs(k["t"] - c["t"]) < DEDUP_S for k in kept):
            kept.append(c)
    return sorted(kept, key=lambda c: c["t"])


def visual_motion(base: Path) -> tuple[dict[int, float], str]:
    """1秒ごとの動き（visual.csv）と、どの置き場の物差しか。archive が在ればそれ、無ければ zoom をつないだもの"""
    import csv
    srcs = [base / "archive" / "visual.csv"] if (base / "archive" / "visual.csv").exists() else []
    kind = "archive"
    if not srcs:
        srcs, kind = sorted(base.glob("zoom-*/visual.csv")), "zoom"
    out: dict[int, float] = {}
    for p in srcs:
        with open(p, newline="") as f:
            for r in csv.DictReader(f):
                out.setdefault(int(float(r["t"])), float(r["motion_mean"]))
    return out, kind


def scene_starts(base: Path, windows: list[float]) -> list[float]:
    """場面の変わりめ。archive の scenes.csv（回まるごと）と zoom の scenes.csv。archive が無ければ、窓と zoom の頭も切れ目にする
    （手持ちで歩き続ける配信は変わりめがほぼ出ず、場面が1つになって3つ選べない。窓どうしは別の場所）"""
    import csv
    ts: list[float] = []
    for p in [base / "archive" / "scenes.csv", *sorted(base.glob("zoom-*/scenes.csv"))]:
        if p.exists():
            with open(p, newline="") as f:
                ts += [float(r["t"]) for r in csv.DictReader(f)]
    if not (base / "archive" / "scenes.csv").exists():
        ts += windows
        for z in base.glob("zoom-*"):
            rows = M.sheet_rows(z)
            if rows:
                ts.append(float(rows[0]["from"]))
    return sorted(set(ts))


def colorfulness(a) -> float:
    import numpy as np
    r, g, b = [a[..., i].astype(np.float64) for i in range(3)]
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))


def measure(c: dict, det) -> dict:
    import cv2
    import numpy as np
    a = np.asarray(c["img"])
    h, w = a.shape[:2]
    mid = a[int(h * 0.2):int(h * 0.8), int(w * 0.15):int(w * 0.85)]
    hsv = cv2.cvtColor(mid, cv2.COLOR_RGB2HSV)
    hue, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    warm = ((hue <= 25) | (hue >= 165)) & (s > 90) & (v > 90)
    gray = cv2.cvtColor(mid, cv2.COLOR_RGB2GRAY)
    faces = []
    if det is not None:
        det.setInputSize((w, h))
        _, fs = det.detect(cv2.cvtColor(a, cv2.COLOR_RGB2BGR))
        faces = face_areas(fs, w, h)
    return {"colorful": round(colorfulness(a), 2), "warm": round(float(warm.mean()), 4),
            "sharp": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
            "face": round(max(faces) if faces else 0.0, 4), "faces": len(faces),
            "bright": round(float(a.mean()), 1)}


def pct(vals: list[float]) -> list[float]:
    """候補の中での百分位（0〜1）。同じ値は同じ順位（並んだ位置の平均）"""
    order = sorted(range(len(vals)), key=lambda k: vals[k])
    rank = [0.0] * len(vals)
    k = 0
    while k < len(order):
        j = k
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[k]]:
            j += 1
        for x in order[k:j + 1]:
            rank[x] = (k + j) / 2
        k = j + 1
    top = max(1, len(vals) - 1)
    return [r / top for r in rank]


def score_all(cands: list[dict], spec: dict, spans, motion: dict[str, tuple[dict, str]], faces: bool) -> None:
    pay = payoff_rows(spec)
    for c in cands:
        near = [(0.0 if a <= c["t"] <= b else min(abs(c["t"] - a), abs(c["t"] - b)), i)
                for i, v, a, b in spans if v == c["vid"]]
        d, i = min(near) if near else (99.0, None)
        c["row"] = i if d <= 3.0 else None
        c["payoff"] = c["row"] in pay
        mv, kind = motion.get(c["vid"], ({}, "none"))
        c["m"]["motion"] = mv.get(int(c["t"]))
        c["motion_src"] = f"{c['vid']}:{kind}"
    keys = {"colorful": 1.0, "warm": 1.0, "sharp": 0.5, "motion": 0.5, **({"face": 0.5} if faces else {})}
    ranks = {k: pct([c["m"][k] for c in cands]) for k in keys if k != "motion"}
    # 動きは archive（1/5秒の差）と zoom（1/10秒の差）で目盛りが違うので、同じ物差しの中で順位を付ける。無い秒は真ん中
    ranks["motion"] = [0.5] * len(cands)
    groups: dict[str, list[int]] = {}
    for j, c in enumerate(cands):
        if c["m"]["motion"] is not None:
            groups.setdefault(c["motion_src"], []).append(j)
    for js in groups.values():
        for j, r in zip(js, pct([cands[j]["m"]["motion"] for j in js])):
            ranks["motion"][j] = r
    for j, c in enumerate(cands):
        s = sum(w * ranks[k][j] for k, w in keys.items()) + (1.0 if c["payoff"] else 0.0)
        s -= 1.0 if c["m"]["bright"] < 40 else 0.0
        c["score"] = round(s, 3)
        c["ranks"] = {k: round(ranks[k][j], 2) for k in keys}


def pick(cands: list[dict], scenes: dict[str, list[float]], n: int = 3) -> list[dict]:
    """点の高い順に、**場面（scenes.csv の変わりめで区切った間）が互いに違う**ものを n 個。
    北マケドニアの B で、時刻（8秒）や見た目の差で離すだけだと、3つとも「同じバス停で同じ構図で食べている」画になり、
    選ぶ意味が無かった（縮めた絵の差は、同じ場面どうし 0.10〜0.21・別の場面 0.16〜0.32 で、線が引けなかった）"""
    out = []
    for c in sorted(cands, key=lambda c: -c["score"]):
        c["scene"] = f"{c['vid']}#{bisect.bisect_right(scenes.get(c['vid'], []), c['t'])}"
        if all((c["vid"] != o["vid"] or abs(c["t"] - o["t"]) >= MIN_APART) and c["scene"] != o["scene"] for o in out):
            out.append(c)
        if len(out) == n:
            break
    return out


def current_frame(mp4: Path) -> Image.Image:
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0", "-i", str(mp4), "-frames:v", "1",
                          "-vf", "scale=540:960", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    return Image.fromarray(np.frombuffer(raw, np.uint8).reshape(960, 540, 3))


def montage(tiles: list[tuple[Image.Image, list[str]]], title: str, out: Path, font_path: Path) -> None:
    def font(size: int):
        return ImageFont.truetype(str(font_path), size)
    W, H, lab, gap, head = 360, 640, 132, 12, 56
    img = Image.new("RGB", (gap + max(1, len(tiles)) * (W + gap), head + H + lab + gap), (20, 20, 20))
    d = ImageDraw.Draw(img)
    d.text((gap, 12), title, fill=(240, 240, 240), font=font(28))
    for k, (im, lines) in enumerate(tiles):
        x = gap + k * (W + gap)
        t = im.copy()
        t.thumbnail((W, H))
        img.paste(t, (x + (W - t.width) // 2, head))
        for j, s in enumerate(lines):
            d.text((x + 4, head + H + 6 + j * 31), s, fill=(255, 230, 120) if j == 0 else (230, 230, 230),
                   font=font(24 if j == 0 else 21))
    img.save(out, "JPEG", quality=88)


def out_name(spec_path: Path, spec: dict, name: str | None) -> str:
    """出力の名前: --name → spec_<名前>.json の <名前> → spec の id"""
    if name:
        return name
    m = re.fullmatch(r"spec_(.+)\.json", spec_path.name)
    return m.group(1) if m else str(spec.get("id") or "x")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec", type=Path)
    ap.add_argument("--material", type=Path, required=True,
                    help="復号した材料の videoId の置き場（clips/・zoom-*/・archive/ のどれかがある所）。ほかの回は隣の置き場から読む")
    ap.add_argument("--clips", type=Path, action="append", default=[],
                    help="取り込んだ窓の index.json（複数可。回は index.json の video で分ける）。無ければ各回の clips/index.json")
    ap.add_argument("--current", type=Path, help="いまの書き出し（0秒目のコマを並べる）")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--name", help="出力の名前（hook_<名前>.jpg）。既定は spec_<名前>.json の <名前>、無ければ spec の id")
    ap.add_argument("--margin", type=float, default=30.0, help="spec の行ごとの区間の前後に足す秒（候補を探す範囲）")
    ap.add_argument("--no-faces", action="store_true", help="顔を数えない（絵と json にそう出し、点に顔を足さない）")
    ap.add_argument("--no-fetch", action="store_true", help="顔の重み・書体が無くても取りに行かずに止まる")
    a = ap.parse_args(argv)
    spec = json.loads(a.spec.read_text())
    main_vid = a.material.name
    root = a.material.parent
    faces = not a.no_faces
    yunet, font_path = ensure_assets(faces, not a.no_fetch)

    spans, maps = row_spans(spec, main_vid)
    if not spans:
        stop("spec の行に、配信の秒を書いた src が1つも無い（地図の行だけ）")
    vids = list(dict.fromkeys(v for _, v, _, _ in spans))
    given: dict[str, list[Path]] = {v: [] for v in vids}
    for p in a.clips:
        d = json.loads(p.read_text())
        clips = d["clips"] if isinstance(d, dict) else d
        if clips and all(M.is_map(float(c["start"])) for c in clips):
            continue    # 地図の素材の窓（hookmap.py の index.json）は候補にしない
        v = M.index_video(p, d) or main_vid
        if v not in given:
            print(f"  注意: {p} は {v} の窓。spec の行が使っていない回なので候補にしない", file=sys.stderr)
            continue
        given[v].append(p)
    missing = [v for v in vids if not (root / v).is_dir()]
    if missing:
        rows_of = {v: sorted({i for i, vv, _, _ in spans if vv == v}) for v in missing}
        stop("素材の置き場が無い回がある: " + "・".join(f"{v}（{root / v}・行 {rows_of[v]}）" for v in missing)
             + "。decrypt.py で開いて同じ置き場に並べてから回す（コマ一覧だけなら --sheets で数秒）")

    ok = wanted(spans, a.margin)
    notes: list[str] = []
    cands: list[dict] = []
    motion: dict[str, tuple[dict, str]] = {}
    scenes: dict[str, list[float]] = {}
    for v in vids:
        base = root / v
        idxs = own_indexes(base, given[v])
        got = video_frames(base, v, idxs, ok, notes)
        if not got:
            rows = sorted({i for i, vv, _, _ in spans if vv == v})
            stop(f"{v} の候補にする画が無い（{base} の clips・zoom-*・archive のシートに、行 {rows} の区間の前後 "
                 f"{a.margin:g} 秒のコマが無い）。区間を clips か zoom で取ってから回す")
        cands += got
        motion[v] = visual_motion(base)
        windows = []
        for p in idxs:
            d = json.loads(p.read_text())
            windows += [float(c["start"]) for c in (d["clips"] if isinstance(d, dict) else d)]
        scenes[v] = scene_starts(base, windows)
    det = face_detector(yunet) if faces else None
    for c in cands:
        c["m"] = measure(c, det)
    score_all(cands, spec, spans, motion, faces)
    top = pick(cands, scenes)
    a.out.mkdir(parents=True, exist_ok=True)
    name = out_name(a.spec, spec, a.name)
    row0 = [(v, a0) for i, v, a0, _ in spans if i == 0]
    cur = row0[0] if row0 and 0 not in maps else None

    def when(c: dict) -> str:
        return hms(c["t"]) if c["vid"] == main_vid else f"{c['vid']} {hms(c['t'])}"

    def lines_of(c: dict, k: int) -> list[str]:
        r = c["row"]
        m = c["m"]
        return [f"候補{k}  点 {c['score']:.2f}" + ("  山場" if c["payoff"] else ""),
                f"{when(c)}  {c['src'][:16]}" if c["vid"] == main_vid else when(c),
                f"行 {r if r is not None else '—'}" + (f" {spec['rows'][r]['line'][:11]}" if r is not None else "（spec の外）"),
                f"色{m['colorful']:.0f} 暖{m['warm'] * 100:.0f}% 動{(m['motion'] or 0):.1f}"
                + (f" 顔{m['face'] * 100:.0f}%" if faces else " 顔—")
                + (f" 人{m['faces']}" if m["faces"] > 1 else "")]
    rank = sorted(cands, key=lambda c: -c["score"])
    tiles = []
    if a.current:
        same = [c for c in cands if cur is not None and c["vid"] == cur[0] and abs(c["t"] - cur[1]) <= 1.0]
        cs = max(same, key=lambda c: c["score"]) if same else None
        tiles.append((current_frame(a.current), ["いまの0秒目" + (f"  点 {cs['score']:.2f}" if cs else ""),
                                                 f"{hms(cur[1]) if cur else '地図' if 0 in maps else '—'}（spec の1行目）",
                                                 f"順位 {rank.index(cs) + 1}/{len(cands)}" if cs else "",
                                                 ""]))
    for k, c in enumerate(top, 1):
        tiles.append((c["img"].resize((360, int(360 * c["img"].height / c["img"].width))), lines_of(c, k)))
    title = f"{name}: 0秒目の画の候補（測った順。決めるのは人）" + ("" if faces else "　※顔は数えていない")
    montage(tiles, title, a.out / f"hook_{name}.jpg", font_path)
    kinds: dict[str, int] = {}
    for c in cands:
        kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    (a.out / f"hook_{name}.json").write_text(json.dumps({
        "spec": str(a.spec), "candidates": len(cands), "current_t": cur[1] if cur else None,
        "current_video": cur[0] if cur else None, "videos": vids, "map_rows": maps, "margin": a.margin,
        "faces": "yunet" if faces else "off", "sources": kinds, "notes": notes,
        "picked": [{k: v for k, v in c.items() if k != "img"} for c in top],
        "top20": [{k: v for k, v in c.items() if k != "img"} for c in rank[:20]]}, ensure_ascii=False, indent=1))
    for n_ in notes:
        print(f"  {n_}", file=sys.stderr)
    print(json.dumps({"out": str(a.out / f"hook_{name}.jpg"), "candidates": len(cands), "sources": kinds,
                      "map_rows": maps, "faces": "yunet" if faces else "off",
                      "picked": [(when(c), c["src"], c["row"], c["score"]) for c in top]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
