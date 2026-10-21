"""映像と音から、1秒ごとの数値とコンタクトシートを作る。

## 映像は1回だけ読む

1時間43分の配信を何度も頭から読むと、そのたびに数分かかる。
ffmpeg を1本だけ起こして `split` で2つに分け、

- 片方は小さく縮めた生の画素（`stats_fps` コマ/秒）を pipe で受けて、明るさ・彩度・
  動きの量・場面の変わりめの点数をその場で数える
- もう片方はコンタクトシートの1コマぶんの大きさ（`sheet_fps` コマ/秒）で PNG に書く

## コマの取りかたは `fps` ではなく `select`

ffmpeg の `fps` フィルタで10秒に1枚取ると、**焼いた秒と画がずれる。**
既定（`round=near`）だと「0:00:10」と書いたコマに 0:00:14.97 の画が入り、
`round=up` でも mkv（時刻がミリ秒）だと先頭のコマに 0:00:09.97 の画が入った。
秒を焼き込むので、ずれた画に秒を書くと見どころの位置を5〜10秒まちがえる。
`select='gte(t, 取った枚数 × 刻み)'` は「刻みに届いた最初のコマ」を取るので
ずれが1コマ未満になり、さらにシートに焼く秒は showinfo が出す**そのコマの本当の時刻**を使う。
（2026-10-15 に、1/4秒ごとに明るさを変えた動画と testsrc2 の時刻表示で当てて確かめた）

## 場面の変わりめ

PySceneDetect の AdaptiveDetector と同じ考え方を numpy で書いてある
（依存を1つ減らすため）。HSV の各チャンネルの差の平均を「点数」にし、
**前後2コマの点数の平均より3倍以上跳ねたコマ**を変わりめとする。
歩きながら振ったカメラは前後のコマも点数が高いので跳ねにならず、
OBS の場面切り替えや動画の編集点のような「1コマだけ大きく変わる」ところが残る。
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import wave
from pathlib import Path

import numpy as np

from common import hms, write_csv  # noqa: F401 — analyze が media から引く名前も残す

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def probe(path: Path) -> dict:
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,"
         "r_frame_rate,sample_rate,channels,duration",
         "-of", "json", str(path)], capture_output=True, text=True)
    d = json.loads(p.stdout or "{}")
    out = {"duration": float((d.get("format") or {}).get("duration") or 0),
           "bytes": int((d.get("format") or {}).get("size") or 0)}
    for st in d.get("streams") or []:
        if st.get("codec_type") == "video" and "video" not in out:
            fr = st.get("avg_frame_rate") or st.get("r_frame_rate") or "0/1"
            try:
                a, b = fr.split("/")
                fps = float(a) / float(b) if float(b) else 0.0
            except ValueError:
                fps = 0.0
            out["video"] = {"codec": st.get("codec_name"), "width": st.get("width"),
                            "height": st.get("height"), "fps": round(fps, 3)}
        if st.get("codec_type") == "audio" and "audio" not in out:
            out["audio"] = {"codec": st.get("codec_name"),
                            "sample_rate": int(st.get("sample_rate") or 0),
                            "channels": st.get("channels")}
    return out


def _even(x: float) -> int:
    return max(2, int(round(x / 2)) * 2)


def tile_size(w: int, h: int, long_side: int) -> tuple[int, int]:
    if h >= w:
        return _even(long_side * w / h), long_side
    return long_side, _even(long_side * h / w)


def _hsv(rgb: np.ndarray) -> np.ndarray:
    """uint8 RGB → float32 HSV（H は 0〜180、S と V は 0〜255。OpenCV と同じ目盛り）。"""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = f.max(axis=-1)
    mn = f.min(axis=-1)
    d = mx - mn
    safe = np.where(d == 0, 1.0, d)
    h = np.where(mx == r, ((g - b) / safe) % 6,
                 np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 30.0
    h = np.where(d == 0, 0.0, h)
    s = np.where(mx > 0, d / np.where(mx == 0, 1.0, mx) * 255.0, 0.0)
    return np.stack([h, s, mx], axis=-1)


def _pick(step: float) -> str:
    # 刻みごとに「刻みちょうどか、そのすぐ後の最初のコマ」を1枚ずつ取る。
    # mkv の時刻はミリ秒に丸めてあるので、1/30秒が 0.033 になって刻み 0.0333 に
    # 届かない。ほんの少し（刻みの1/4か 2ms の小さいほう）先へ見る
    eps = min(0.002, step / 4)
    return f"select='gte(t+{eps}\\,selected_n*{step:.6f})'"


def _fit(tw: int, th: int) -> str:
    """シートの1コマの大きさに縮める（縦横比は保ち、余りは黒で埋める）。"""
    return (f"scale={tw}:{th}:flags=lanczos:force_original_aspect_ratio=decrease,"
            f"pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2")


SHOWINFO_PTS = re.compile(r"Parsed_showinfo\S* @ \S+\] .*?pts_time:(\S+)")


def grab_frames(src: Path, frames_dir: Path, log: Path, *, every: float,
                tile: tuple[int, int]) -> tuple[list[Path], list[float]]:
    """`every` 秒に1コマ、シートの1コマの大きさの PNG に書き、そのコマの本当の時刻と返す。

    clips の見る用のシート（切った mp4 から作る）に使う。取りかたは video_pass の
    シートと同じ（`select` で刻みに届いた最初のコマを取り、焼く秒は showinfo の時刻）。
    時刻は mp4 の中の秒（0 が区間の頭）。**時刻とコマの数が合わなければ落とす。**
    「n 枚目 × 刻み」で埋めると、ずれていても帯がもっともらしい秒を書いてしまう。
    """
    tw, th = tile
    frames_dir.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-v", "info", "-nostdin", "-y",
           "-i", str(src), "-map", "0:v:0", "-vf", f"{_pick(every)},showinfo,{_fit(tw, th)}",
           "-fps_mode", "passthrough", "-c:v", "png", "-start_number", "0",
           str(frames_dir / "%06d.png")]
    with open(log, "w", encoding="utf-8") as lf:
        rc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=lf).returncode
    if rc != 0:
        raise RuntimeError(f"ffmpeg が {rc} で終わった（{log.name}）")
    frames = sorted(frames_dir.glob("*.png"))
    pts = [float(x) for x in SHOWINFO_PTS.findall(log.read_text(errors="ignore"))]
    if len(pts) != len(frames):
        raise RuntimeError(f"showinfo の時刻 {len(pts)}個とコマ {len(frames)}枚が合わない")
    return frames, pts


def video_pass(src: Path, work: Path, *, stats_fps: float, sheet_fps: float,
               tile: tuple[int, int], start: float = 0.0, length: float | None = None) -> dict:
    """1回の読みで、コマごとの数値と、シート用のコマ（PNG）を作る。

    `start` / `length` は元の動画の中の位置（秒）。zoom のように、落とした
    動画そのものが区間のときは 0 / None で、時刻の読み替えは呼ぶ側がやる。
    """
    info = probe(src)
    v = info.get("video") or {}
    w, h = int(v.get("width") or 0), int(v.get("height") or 0)
    if not w or not h:
        raise RuntimeError("映像の縦横が読めない")
    sw, sh = (128, _even(128 * h / w)) if w >= h else (_even(128 * w / h), 128)
    tw, th = tile
    frames_dir = work / "_frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    fc = (f"[0:v]split=2[a][b];"
          f"[a]{_pick(1 / stats_fps)},scale={sw}:{sh}:flags=area,format=rgb24[s];"
          f"[b]{_pick(1 / sheet_fps)},showinfo,{_fit(tw, th)}[t]")
    # showinfo の行（各コマの本当の時刻）を拾うので info で受ける。行はファイルへ。
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-v", "info", "-nostdin"]
    if start:
        cmd += ["-ss", f"{start:.3f}"]
    if length:
        cmd += ["-t", f"{length:.3f}"]
    cmd += ["-i", str(src), "-filter_complex", fc,
            "-map", "[s]", "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1",
            "-map", "[t]", "-fps_mode", "passthrough", "-c:v", "png", "-start_number", "0",
            str(frames_dir / "%06d.png")]
    errf = open(work / "_ffmpeg_video.log", "w")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errf)
    n_bytes = sw * sh * 3
    bright, sat, motion, score = [], [], [], []
    prev_y = prev_hsv = None
    while True:
        buf = proc.stdout.read(n_bytes)
        if not buf or len(buf) < n_bytes:
            break
        rgb = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        y = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
        hsv = _hsv(rgb)
        bright.append(float(y.mean()))
        sat.append(float(hsv[..., 1].mean() / 255.0))
        if prev_y is None:
            motion.append(0.0)
            score.append(0.0)
        else:
            motion.append(float(np.abs(y - prev_y).mean()))
            score.append(float(np.abs(hsv - prev_hsv).mean()))
        prev_y, prev_hsv = y, hsv
    proc.wait()
    errf.close()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg が {proc.returncode} で終わった（_ffmpeg_video.log）")
    frames = sorted(frames_dir.glob("*.png"))
    # シートに焼く時刻は「n 枚目 × 刻み」ではなく、そのコマの本当の時刻。
    # 配信が途中で途切れて時刻が飛んでいても、焼いた秒が画とずれない
    log = (work / "_ffmpeg_video.log").read_text(errors="ignore")
    pts = [float(x) for x in SHOWINFO_PTS.findall(log)]
    if len(pts) != len(frames):
        pts = [i / sheet_fps for i in range(len(frames))]
    return {"stats_fps": stats_fps, "sheet_fps": sheet_fps, "bright": bright, "sat": sat,
            "motion": motion, "score": score, "frames": frames, "frame_times": pts,
            "tile": [tw, th],
            "src": {"width": w, "height": h, "fps": v.get("fps"), "codec": v.get("codec"),
                    "duration": info.get("duration")}}


def detect_cuts(scores: list[float], fps: float, *, ratio_th: float = 3.0,
                min_score: float = 15.0, window: int = 2, min_gap: float = 0.5) -> list[dict]:
    n = len(scores)
    cuts, last = [], -1e9
    for i in range(1, n):
        lo, hi = max(1, i - window), min(n, i + window + 1)
        nb = [scores[j] for j in range(lo, hi) if j != i]
        avg = sum(nb) / len(nb) if nb else 0.0
        ratio = scores[i] / avg if avg > 1e-6 else (255.0 if scores[i] > 0 else 0.0)
        t = i / fps
        if scores[i] >= min_score and ratio >= ratio_th and t - last >= min_gap:
            cuts.append({"t": round(t, 3), "score": round(scores[i], 1),
                         "ratio": round(min(ratio, 255.0), 1)})
            last = t
    return cuts


def per_second_visual(vp: dict, cuts: list[dict], offset: float = 0.0) -> list[dict]:
    fps = vp["stats_fps"]
    n = len(vp["bright"])
    secs_n = int(math.ceil(n / fps))
    cut_sec: dict[int, int] = {}
    for c in cuts:
        cut_sec[int(c["t"])] = cut_sec.get(int(c["t"]), 0) + 1
    rows = []
    for s in range(secs_n):
        a, b = int(round(s * fps)), min(n, int(round((s + 1) * fps)))
        if a >= b:
            continue
        m = vp["motion"][a:b]
        t = s + offset
        rows.append({"t": int(t) if float(t).is_integer() else round(t, 2), "hms": hms(t),
                     "motion_mean": round(sum(m) / len(m), 2), "motion_max": round(max(m), 2),
                     "bright": round(sum(vp["bright"][a:b]) / (b - a), 1),
                     "sat": round(sum(vp["sat"][a:b]) / (b - a), 3),
                     "score_max": round(max(vp["score"][a:b]), 1),
                     "cut": cut_sec.get(s, 0)})
    return rows



def _font(size: int):
    from PIL import ImageFont
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


SHEET_GAP, SHEET_HEAD = 4, 30


def sheet_cell(i: int, grid: tuple[int, int], tile: tuple[int, int]) -> tuple[int, int]:
    """シートの i 番目のコマの左上（make_sheets と同じ並び）。読み戻す側（dryrun.py）も使う。"""
    cols, _ = grid
    tw, th = tile
    label_h = max(20, int(round(th * 0.07)))
    r, c = divmod(i, cols)
    return (SHEET_GAP + c * (tw + SHEET_GAP),
            SHEET_HEAD + SHEET_GAP + r * (th + label_h + SHEET_GAP))


def make_sheets(frames: list[Path], times: list[float], out_dir: Path, *,
                grid: tuple[int, int], tile: tuple[int, int], title: str,
                step_label: str, quality: int = 80, per: int | None = None,
                labels: list[str] | None = None, name=None, clock=hms) -> list[dict]:
    """コマを格子に並べ、各コマの**下の帯**に H:MM:SS を書く。

    秒は画の上に重ねない。ショートの字幕（テロップ）は下にも上にも出るので、
    重ねるとちょうど読みたい字を隠す。

    `per`（1枚に並べるコマの数。既定は格子いっぱい）・`labels`（帯の字。既定は H:MM:SS）・
    `name`（k 枚目のファイル名）・`clock`（見出しの時刻の書きかた）は clips の見る用のシートが使う。並びと余白は変えない
    （tools/shorts/plan/ や qa/ が同じ数を写して読んでいる）。
    """
    from PIL import Image, ImageDraw

    cols, rows = grid
    tw, th = tile
    gap = SHEET_GAP
    label_h = max(20, int(round(th * 0.07)))
    head_h = SHEET_HEAD
    W = cols * tw + (cols + 1) * gap
    H = head_h + rows * (th + label_h) + (rows + 1) * gap
    f_label = _font(label_h - 5)
    f_head = _font(18)
    per = min(per or cols * rows, cols * rows)
    labels = labels or [hms(t) for t in times]
    name = name or (lambda k: f"{k:04d}.jpg")
    out_dir.mkdir(parents=True, exist_ok=True)
    total = (len(frames) + per - 1) // per
    sheets = []
    for k in range(total):
        chunk = list(zip(frames[k * per:(k + 1) * per], times[k * per:(k + 1) * per],
                         labels[k * per:(k + 1) * per]))
        # 最後の1枚は埋まった段までで切る（空の段を何百 px も運ばない）
        used = (len(chunk) + cols - 1) // cols
        img = Image.new("RGB", (W, H - (rows - used) * (th + label_h + gap)), (24, 24, 24))
        d = ImageDraw.Draw(img)
        t_from, t_to = chunk[0][1], chunk[-1][1]
        d.text((gap + 2, 5), f"{title} | {clock(t_from)} - {clock(t_to)} | {step_label} | "
               f"{k + 1}/{total}", fill=(235, 235, 235), font=f_head)
        for i, (fp, t, lab) in enumerate(chunk):
            x, y = sheet_cell(i, grid, tile)
            with Image.open(fp) as fr:
                img.paste(fr.convert("RGB"), (x, y))
            d.rectangle([x, y + th, x + tw - 1, y + th + label_h - 1], fill=(0, 0, 0))
            d.text((x + 6, y + th + 2), lab, fill=(255, 255, 255), font=f_label)
        fn = name(k)
        img.save(out_dir / fn, "JPEG", quality=quality, optimize=True)
        sheets.append({"file": f"sheets/{fn}", "from": round(t_from, 2),
                       "to": round(t_to, 2), "from_hms": hms(t_from), "to_hms": hms(t_to),
                       "frames": len(chunk), "bytes": (out_dir / fn).stat().st_size})
    return sheets


def extract_wav(src: Path, dst: Path) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(src), "-vn",
                    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst)], check=True)


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        n = w.getnframes()
        return np.frombuffer(w.readframes(n), np.int16)


EBU = re.compile(r"t:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(\S+)\s+S:\s*(\S+)")


def _f(x: str) -> float | None:
    try:
        v = float(x)
    except ValueError:
        return None
    return None if math.isnan(v) or v < -120 else v


def audio_series(src: Path, wav16: Path, work: Path) -> tuple[list[dict], dict]:
    """1秒ごとの RMS / ピーク（16kHz モノラルから）と、LUFS（元の音から、EBU R128）。

    LUFS は ffmpeg の ebur128 が 0.1秒ごとに出す行を拾う。行は**ログには出さず**
    ファイルに受ける（数値だけだが、公開ログに何千行も積む理由がない）。
    """
    x = read_wav(wav16).astype(np.float32) / 32768.0
    sr = 16000
    n_sec = int(math.ceil(len(x) / sr))
    logf = work / "_ebur128.log"
    with open(logf, "w") as ef:
        subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-i", str(src), "-vn",
                        "-af", "ebur128", "-f", "null", "-"], stdout=subprocess.DEVNULL,
                       stderr=ef, check=True)
    text = logf.read_text(errors="ignore")
    m_max: dict[int, float] = {}
    s_end: dict[int, float] = {}
    for mt in EBU.finditer(text):
        t = float(mt.group(1))
        sec = int(max(0.0, t - 1e-6))
        m, s = _f(mt.group(2)), _f(mt.group(3))
        if m is not None:
            m_max[sec] = max(m_max.get(sec, -999.0), m)
        if s is not None:
            s_end[sec] = s
    summ = {}
    mi = re.search(r"Integrated loudness:\s*I:\s*(-?[\d.]+) LUFS", text)
    ml = re.search(r"Loudness range:\s*LRA:\s*(-?[\d.]+) LU", text)
    if mi:
        summ["integrated_lufs"] = float(mi.group(1))
    if ml:
        summ["lra"] = float(ml.group(1))
    rows = []
    for s in range(n_sec):
        seg = x[s * sr:(s + 1) * sr]
        if not len(seg):
            continue
        rms = float(np.sqrt(np.mean(seg * seg)))
        pk = float(np.max(np.abs(seg)))
        rows.append({"t": s, "hms": hms(s),
                     "rms_db": round(20 * math.log10(max(rms, 1e-6)), 1),
                     "peak_db": round(20 * math.log10(max(pk, 1e-6)), 1),
                     "lufs_m": None if s not in m_max else round(m_max[s], 1),
                     "lufs_s": None if s not in s_end else round(s_end[s], 1)})
    vals = [r["rms_db"] for r in rows]
    if vals:
        summ["rms_db_mean"] = round(sum(vals) / len(vals), 1)
        summ["rms_db_max"] = max(vals)
    return rows, summ
