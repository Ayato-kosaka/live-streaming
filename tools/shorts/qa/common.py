"""完成したショートの検査で、どの検査も使う道具（読み込み・音と絵の取り出し・結果の形）。

ここにあるのは「読む」ものだけ。合否の線は各検査のファイルに、理由と一緒に置く。
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Iterator

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
RENDER = HERE.parent / "render"
SR = 48000

PASS, FAIL, HUMAN, NA = "pass", "fail", "needs-human", "not-checkable"
# 並べたときに重いほうが勝つ順。全体の判定は、いちばん重いもの
SEVERITY = {PASS: 0, NA: 1, HUMAN: 2, FAIL: 3}


def result(cid: str, title: str, status: str, summary: str, *, measured: dict | None = None,
           thresholds: dict | None = None, problems: list | None = None,
           artifacts: list | None = None) -> dict:
    """検査1本ぶんの結果。数字（measured）と線（thresholds）を必ず並べて返す。

    「通った」だけを返すと、何を見て通ったのかが残らない（docs/island-standards.md §15）。
    """
    assert status in SEVERITY, status
    return {"id": cid, "title": title, "status": status, "summary": summary,
            "measured": measured or {}, "thresholds": thresholds or {},
            "problems": problems or [], "artifacts": artifacts or []}


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def ffprobe(path: Path) -> dict:
    out = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
              text=True).stdout
    return json.loads(out)


def rate(s: str | None) -> float | None:
    if not s or s in ("0/0", "N/A"):
        return None
    if "/" in s:
        a, b = s.split("/")
        return int(a) / int(b) if int(b) else None
    return float(s)


def mp4_boxes(path: Path) -> list[tuple[str, int, int]]:
    """mp4 の最上位の箱を（名前, 位置, 大きさ）で並べる。faststart の確かめに使う。"""
    total = path.stat().st_size
    out, pos = [], 0
    with open(path, "rb") as f:
        while pos + 8 <= total:
            f.seek(pos)
            size, typ = struct.unpack(">I4s", f.read(8))
            if size == 1:
                size = struct.unpack(">Q", f.read(8))[0]
            elif size == 0:
                size = total - pos
            if size < 8:
                break
            out.append((typ.decode("latin1"), pos, size))
            pos += size
    return out


# ---------------------------------------------------------------- 音

def decode_audio(path: Path, channels: int = 2) -> np.ndarray:
    """mp4 / wav の音を 48kHz の float で読む。

    **2ch を ffmpeg に 1ch へ混ぜさせない。** ffmpeg の 2→1 は左右を足して √2 倍にするので、
    左右同じ音が +3dB に読める（verify.py の mix_rms がそれで 3dB 高く出ていた）。
    1ch が欲しいときは、ここで読んだ 2ch を自分で平均する。
    """
    raw = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-vn",
               "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"]).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, channels).copy()


def mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=1) if x.ndim == 2 else x


def rms_db(x: np.ndarray) -> float:
    if len(x) == 0:
        return -120.0
    v = float(np.sqrt(np.mean(np.square(x.astype(np.float64)))))
    return 20 * math.log10(v) if v > 1e-9 else -120.0


def envelope_db(x: np.ndarray, win: int) -> np.ndarray:
    """win サンプルごとの RMS（dBFS）。端数は捨てる。"""
    n = len(x) // win
    if n == 0:
        return np.zeros(0)
    e = np.sqrt(np.mean(np.square(x[: n * win].astype(np.float64)).reshape(n, win), axis=1))
    return 20 * np.log10(np.maximum(e, 1e-9))


def runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """True が続く区間を [始まり, 終わり) で返す。"""
    if len(mask) == 0:
        return []
    m = np.concatenate([[False], mask.astype(bool), [False]])
    d = np.diff(m.astype(np.int8))
    starts = np.flatnonzero(d == 1)
    ends = np.flatnonzero(d == -1)
    return list(zip(starts.tolist(), ends.tolist()))


# ---------------------------------------------------------------- 絵

def _select_expr(frames: list[int]) -> str:
    """コマ番号の並びを、ffmpeg の select の式にする（render/selectexpr.py。続いた番号は between に畳み、
    項は括弧で二分に組む。`+` で横につなぐと、新しい ffmpeg は101項から受け付けない）。"""
    import sys

    if str(RENDER) not in sys.path:
        sys.path.append(str(RENDER))  # 後ろに足す（qa の同名のものを render で隠さない）
    from selectexpr import select_expr

    return select_expr(frames)


# 1回の ffmpeg で抜き出すコマの数。塊ごとに頭から復号し直すので、大きくしすぎない。
# 塊の境目でコマを落とさない・重ねないことは render/selectexpr_selftest.py が、ここを小さくして当てる
CHUNK = 400


_NATIVE: dict = {}


def native_size(path: Path) -> tuple[int, int]:
    """動画そのものの縦横（下書きは 540x960 で、時間割の座標は 1080x1920）。"""
    key = str(path)
    if key not in _NATIVE:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                              "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
                             capture_output=True, text=True).stdout.strip()
        w, _, h = out.partition("x")
        _NATIVE[key] = (int(w), int(h)) if w.isdigit() and h.isdigit() else (0, 0)
    return _NATIVE[key]


def iter_frames(path: Path, frames: Iterable[int], W: int, H: int,
                gray: bool = False) -> Iterator[tuple[int, np.ndarray]]:
    """指定したコマを、1回の復号で順に返す（全部を手元に溜めない。1コマ 6MB ある）。

    動画が W x H と違う大きさ（render.py --draft の縦横半分）なら、W x H に広げて返す。
    時間割の字の絵・置き場は W x H の座標なので、広げれば同じ検査がそのまま使える。
    """
    want = sorted(set(int(f) for f in frames if f >= 0))
    if not want:
        return
    grow = native_size(path) not in ((W, H), (0, 0))
    # 塊（CHUNK コマ）に分けて復号し直す。前は「式が長すぎると受け付けない」ためだったが、
    # 式は括弧で浅く組むようになった（_select_expr）。塊の数だけ頭から復号し直す
    chunk = CHUNK
    for k in range(0, len(want), chunk):
        part = want[k:k + chunk]
        pix, ch = ("gray", 1) if gray else ("rgb24", 3)
        vf = f"select={_select_expr(part)}" + (f",scale={W}:{H}:flags=bicubic" if grow else "")
        # 欲しいコマを出し切ったら ffmpeg を止める（-frames:v）。止めないと、後ろのコマを使わなくても
        # 動画の終わりまで復号し続け、それを待つ（61秒の版の頭のコマだけ欲しいときに 8秒ほど余計にかかった）
        proc = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-map", "0:v:0",
             "-vf", vf, "-fps_mode", "passthrough", "-frames:v", str(len(part)),
             "-f", "rawvideo", "-pix_fmt", pix, "-"], stdout=subprocess.PIPE)
        size = W * H * ch
        got = 0
        try:
            for f in part:
                buf = proc.stdout.read(size)
                if len(buf) < size:
                    break
                arr = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, ch) if ch == 3 else \
                    np.frombuffer(buf, dtype=np.uint8).reshape(H, W)
                got += 1
                yield f, arr
        finally:
            proc.stdout.close()
            proc.wait()
        if got < len(part):
            # コマ数が probe より少ない（壊れた・短い）。黙って少なく返さず、呼んだ側に分かるように
            raise RuntimeError(f"{path} から {len(part)} コマ欲しかったが {got} コマしか読めなかった")


def small_gray(path: Path, W: int, H: int, div: int = 8) -> np.ndarray:
    """全コマを 1/div の白黒で読む（黒・止まりを見る用。60秒で 58MB）。"""
    w, h = W // div, H // div
    raw = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-map", "0:v:0",
               "-vf", f"scale={w}:{h}:flags=area,format=gray", "-fps_mode", "passthrough",
               "-f", "rawvideo", "-"]).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w)


_FRAME_MEMO: dict = {}


def frame_memo(tag: str, img: np.ndarray, fn: Callable):
    """同じ画素のコマには、同じ答えを返す（重い検出を2度しない）。

    1本の動画の中では効かない（同じコマは2度見ない）。効くのは、同じ動画の一部だけを
    差し替えた版をいくつも続けて見るとき（selftest の対照）。鍵は画素ぜんぶの md5 なので、
    1画素でも違えば別のコマとして測り直す。
    """
    key = (tag, img.shape, hashlib.md5(img.tobytes()).digest())
    if key not in _FRAME_MEMO:
        _FRAME_MEMO[key] = fn()
    return _FRAME_MEMO[key]


def video_md5(path: Path) -> str:
    """映像の中身（ビット列）の md5。同じ映像に同じ検査を2度かけないために使う。"""
    out = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-map", "0:v:0",
               "-c", "copy", "-f", "md5", "-"], text=True).stdout.strip()
    return out.split("=", 1)[-1]


# ---------------------------------------------------------------- 書き出しの控え（work）

OVERLAY_KINDS = ("titles", "telops", "captions")


def overlays(plan: dict | None) -> list[dict]:
    """重ねた字の絵を全部（タイトル・テロップ・字幕）。種類を足したら OVERLAY_KINDS に足す。

    書き出し側が `overlays` を持っていれば、それを正とする（新しい種類の重ね物も拾える）。
    """
    if not plan:
        return []
    if isinstance(plan.get("overlays"), list):
        return [dict(o) for o in plan["overlays"]]
    out = []
    for kind in OVERLAY_KINDS:
        for it in plan.get(kind, []) or []:
            if all(k in it for k in ("x", "y", "w", "h", "from", "to")):
                out.append({"kind": kind[:-1], **it})
    return out


_STREAM: dict = {}


def stream_of(path: Path) -> tuple[str, float]:
    """素材のファイルが、どの配信の何秒目から始まるか（配信の id, 頭の秒）。

    取り込みの clips は、同じ置き場の index.json に配信の id（`video`）と区間ごとの頭の秒（`start`）を
    書いている。Actions の書き出し（`render/remote.py`）は素材を sha256 の名前で並べ直すので、区間ごとに
    `video` を持つ index.json を書き戻す（区間の `video` があればそれを、無ければ全体の `video` を取る）。
    どちらも無い素材（手で作った絵・selftest の合成）は、ファイルそのものを1本の配信とみなし、
    頭を 0 秒にする（別のファイルどうしは「同じ配信」と言わない側に倒す）。
    """
    key = str(path)
    if key not in _STREAM:
        vid, t0 = key, 0.0
        ix = Path(path).parent / "index.json"
        try:
            j = json.loads(ix.read_text())
            for c in j.get("clips", []):
                if c.get("file") == Path(path).name:
                    vid = str(c.get("video") or j.get("video") or Path(path).parent)
                    t0 = float(c.get("start") or 0.0)
                    break
        except (OSError, ValueError, AttributeError):
            pass
        _STREAM[key] = (vid, t0)
    return _STREAM[key]


_ENTRY: dict = {}


def clip_entry(path: Path) -> dict:
    """素材のファイルの、取り込みの台帳（同じ置き場の index.json）の行。無ければ空。

    止め絵を作る道具は、元の絵を台帳に書き残している（Hc-z52fs108 の App Store の画面は `source_png`、
    zjHZucyfrq8 の止め絵は `range` に「…のうち … の1コマ」）。止め絵の検査はそれを人に見せる。
    """
    key = str(path)
    if key not in _ENTRY:
        _ENTRY[key] = {}
        try:
            j = json.loads((Path(path).parent / "index.json").read_text())
            for c in j.get("clips", []):
                if isinstance(c, dict) and c.get("file") == Path(path).name:
                    _ENTRY[key] = c
                    break
        except (OSError, ValueError, AttributeError):
            pass
    return _ENTRY[key]


def hms(t: float) -> str:
    """秒を H:MM:SS.s に。**先に 0.1秒に丸めてから**時・分・秒に割る（割ってから丸めると、
    299.97 が 0:04:60.0 になる）。"""
    tenths = int(round(max(0.0, float(t)) * 10))
    h, r = divmod(tenths, 36000)
    m, r = divmod(r, 600)
    return f"{h}:{m:02d}:{r / 10:04.1f}"


def segments(plan: dict | None) -> list[dict]:
    """時間割のカットを、出来上がりの秒と元素材（ファイル・コマ・配信の中の秒）に戻す。

    書き出しは plan.json の `cuts` に、元素材の置き場（path）・元のコマ（in / out、元素材の fps で数える。
    render.py は元素材の fps が時間割と同じものしか受けない）・出来上がりの頭のコマ（at）を写している。
    """
    if not plan or not plan.get("cuts"):
        return []
    fps = float(plan["fps"])
    out = []
    for k, c in enumerate(plan["cuts"]):
        if not all(key in c for key in ("path", "in", "out", "at")):
            continue
        n = int(c.get("frames") or (c["out"] - c["in"]))
        vid, t0 = stream_of(Path(c["path"]))
        out.append({"k": k, "path": str(c["path"]), "file": Path(c["path"]).name, "in": int(c["in"]),
                    "out": int(c["out"]), "at": int(c["at"]), "frames": n,
                    "from_s": c["at"] / fps, "to_s": (c["at"] + n) / fps,
                    "stream": vid, "src_from": t0 + c["in"] / fps, "src_to": t0 + c["out"] / fps,
                    "crop": c.get("crop"), "zoom": c.get("zoom"), "src": c.get("src")})
    return out


def where(s: dict) -> str:
    """区間を人が元の配信で探せる言い方にする（出来上がりの秒・配信の中の時刻・素材のファイル）。"""
    span = f"{hms(s['src_from'])}〜{hms(s['src_to'])}"
    f = s["file"]
    stem, dot, ext = f.partition(".")
    if len(stem) == 64 and all(ch in "0123456789abcdef" for ch in stem):
        f = f"{stem[:12]}…{dot}{ext}"  # Actions では素材が sha256 の名前で並ぶ。頭だけで見分けられる
    if s["stream"] != s["path"]:
        return f"{s['from_s']:.2f}〜{s['to_s']:.2f} 秒（配信 {s['stream']} の {span}・素材 {f}）"
    return f"{s['from_s']:.2f}〜{s['to_s']:.2f} 秒（素材 {f} の {span}）"


def safe_area(style: dict) -> dict:
    s = style["safe"]
    W = style["canvas"]["width"]
    return {"top": s["top"], "bottom": s["bottom"], "left": s["left"], "right": s["right"],
            "right_column_from_y": s["right_column_from_y"], "right_column_x": s["right_column_x"],
            "width": W, "height": style["canvas"]["height"]}


def safe_mask(sa: dict) -> np.ndarray:
    """安全領域を True にした 1080x1920 の面。右の列（y>=840）は x<888 まで。"""
    m = np.zeros((sa["height"], sa["width"]), dtype=bool)
    m[sa["top"]:sa["bottom"], sa["left"]:sa["right"]] = True
    m[sa["right_column_from_y"]:, sa["right_column_x"]:] = False
    return m


def rect_violations(x: float, y: float, w: float, h: float, sa: dict) -> list[str]:
    """箱 [x, x+w) × [y, y+h) が安全領域からはみ出しているところを、言葉で返す。"""
    out = []
    if y < sa["top"]:
        out.append(f"上端 y={y:.0f} < {sa['top']}")
    if y + h > sa["bottom"]:
        out.append(f"下端 y={y + h:.0f} > {sa['bottom']}")
    if x < sa["left"]:
        out.append(f"左端 x={x:.0f} < {sa['left']}")
    if x + w > sa["right"]:
        out.append(f"右端 x={x + w:.0f} > {sa['right']}")
    if y + h > sa["right_column_from_y"] and x + w > sa["right_column_x"]:
        out.append(f"右の列（y>{sa['right_column_from_y']}）で右端 x={x + w:.0f} > {sa['right_column_x']}")
    return out


@dataclass
class Ctx:
    """検査1回ぶんの入力。重い読み込み（音・小さい白黒の全コマ）は一度だけにする。"""
    mp4: Path
    work: Path | None
    style: dict
    out_dir: Path
    plate: Path | None = None
    plan: dict | None = None
    probe: dict = field(default_factory=dict)
    W: int = 0
    H: int = 0
    fps: float = 0.0
    nframes: int = 0
    notes: list = field(default_factory=list)
    _cache: dict = field(default_factory=dict)

    def memo(self, key: str, fn: Callable):
        if key not in self._cache:
            self._cache[key] = fn()
        return self._cache[key]

    @property
    def mix(self) -> np.ndarray:
        return self.memo("mix", lambda: decode_audio(self.mp4, 2))

    @property
    def gray_small(self) -> np.ndarray:
        return self.memo("gray_small", lambda: small_gray(self.mp4, self.W, self.H, 8))

    @property
    def spf(self) -> int:
        return int(round(SR / self.fps)) if self.fps else SR // 30

    def stems(self) -> dict | None:
        """書き出しに使った音の束（ナレーション・BGM・元音声）。無ければ None。

        長さが時間割と合わないものは使わない（古い work を読むと、別の動画の音を測ることになる）。
        """
        def load():
            if not self.work or not self.plan:
                return None
            n = int(self.plan["frames"]) * int(round(SR / self.plan["fps"]))
            out = {}
            for name in ("narration", "bgm", "source"):
                p = self.work / f"stem_{name}.f32"
                if p.exists():
                    a = np.fromfile(p, dtype="<f4")
                    if len(a) % 2 or len(a) // 2 != n:
                        self.notes.append(f"stem_{name}.f32 の長さ {len(a) // 2} が時間割 {n} と合わない（使わない）")
                        continue
                    out[name] = a.reshape(-1, 2)
            return out if ("narration" in out and "bgm" in out) else None
        return self.memo("stems", load)

    def stem_fit(self) -> dict | None:
        """仕上がりの音 ≒ a·ナレーション + b·BGM (+ c·元音声) を最小二乗で当てる。

        - ずれ（サンプル）を相互相関で探す。AAC の頭の詰め物を ffmpeg が外せていれば 0
        - a, b が 1 から離れていれば、束を混ぜたあとに音量を変えている（最後の音量合わせ）。
          声と BGM の差は a/b で直して測る
        - 残り（residual）は、束に無い音＝元音声の漏れ・リミッター・AAC の誤差
        """
        def fit():
            st = self.stems()
            if st is None:
                return None
            mix = mono(self.mix).astype(np.float64)
            narr = mono(st["narration"]).astype(np.float64)
            bgm = mono(st["bgm"]).astype(np.float64)
            src = mono(st["source"]).astype(np.float64) if "source" in st else None
            n = min(len(mix), len(narr))
            ref = narr + bgm + (src if src is not None else 0)
            # ずれは ±50ms の範囲で探す（それ以上ずれていたら、もう同じ動画の束ではない）。
            # 1サンプルずつ内積を取ると 4801 回で 20 秒かかるので、FFT で全部のずれを一度に出す
            L0 = min(n, SR * 20)
            x, y = mix[:L0], ref[:L0]
            N = 1 << int(math.ceil(math.log2(2 * L0)))
            cc = np.fft.irfft(np.fft.rfft(x, N) * np.conj(np.fft.rfft(y, N)), N)
            lags = np.arange(-2400, 2401)
            vals = cc[lags % N]
            den = float(np.linalg.norm(x) * np.linalg.norm(y))
            k = int(np.argmax(vals))
            lag = int(lags[k])
            corr = float(vals[k] / den) if den > 0 else 0.0
            a0, b0 = max(0, lag), max(0, -lag)
            L = n - abs(lag)
            m = mix[a0:a0 + L]
            cols = [narr[b0:b0 + L], bgm[b0:b0 + L]] + ([src[b0:b0 + L]] if src is not None else [])
            A = np.stack(cols, axis=1)
            coef, *_ = np.linalg.lstsq(A, m, rcond=None)
            resid = m - A @ coef
            return {"lag": int(lag), "corr": round(corr, 4), "gain_narration": float(coef[0]),
                    "gain_bgm": float(coef[1]), "gain_source": float(coef[2]) if src is not None else None,
                    "resid": resid, "offset": b0, "length": L}
        return self.memo("stem_fit", fit)

    def stems_usable(self) -> tuple[bool, str]:
        """束が「この mp4 の音の素」と言えるか。言えないなら、束を使う検査は判定しない。"""
        f = self.stem_fit()
        if f is None:
            return False, "work に音の束（stem_narration.f32 / stem_bgm.f32）が無い"
        if f["corr"] < 0.5:
            return False, f"束と仕上がりの音が似ていない（相関 {f['corr']}）。別の動画の work では"
        if not (0.25 <= f["gain_narration"] <= 4.0):
            return False, f"ナレーションの束が仕上がりで {f['gain_narration']:.2f} 倍。別の動画の work では"
        return True, ""


def narration_windows(plan: dict, n: int, spf: int) -> np.ndarray:
    inside = np.zeros(n, dtype=bool)
    for ln in plan.get("narration", []):
        inside[ln["at"] * spf:(ln["at"] + ln["frames"]) * spf] = True
    return inside


def near(mask: np.ndarray, pad: int) -> np.ndarray:
    """mask の前後 pad サンプル以内なら True（累積和で数える。畳み込みだと遅い）。"""
    n = len(mask)
    cs = np.concatenate([[0], np.cumsum(mask)])
    lo = np.clip(np.arange(n) - pad, 0, n)
    hi = np.clip(np.arange(n) + pad + 1, 0, n)
    return (cs[hi] - cs[lo]) > 0


def load_plan(work: Path | None) -> dict | None:
    if not work:
        return None
    p = work / "plan.json"
    return json.loads(p.read_text()) if p.exists() else None


def load_style(path: Path | None, plan: dict | None) -> dict:
    """様式。書き出しが plan.json に様式を写していればそれを、無ければ指定、無ければ既定。"""
    if plan and isinstance(plan.get("style"), dict) and "safe" in plan["style"]:
        return plan["style"]
    p = path or (RENDER / "style.json")
    return json.loads(Path(p).read_text())


def env_flag(name: str) -> bool:
    return os.environ.get(name, "") not in ("", "0")
