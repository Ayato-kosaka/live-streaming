#!/usr/bin/env python3
"""書き出したショートが、編集指示書どおりになっているかを測る。

    python3 verify.py out.mp4 work_dir [--twin out2.mp4]

見るもの:
1. 形式（1080x1920・30fps・コマ数・音声 48kHz）
2. **カット位置**: 合成素材に焼いたフレーム番号（12ビットの白黒の箱）を、
   書き出したコマから読み戻し、指示書の in/out と1コマ単位で照合する。
   各カットの「最初・2コマ目・真ん中・最後から2コマ目・最後」を見る。
3. **字幕の出入り**: 字幕の箱の範囲で、出る直前と出たコマの差が、
   ふつうのコマ間の差より大きいか（出入りが指示書のフレームで起きているか）。
4. **音量差**: ナレーションの間の「ナレーション」と「下げた BGM」、
   ナレーションの無い間の BGM を、書き出しに使った音の束から dB で測る。
   仕上がりの mp4 の積分ラウドネス（LUFS）も出す。
5. `--twin` があれば、同じ指示書で書いたもう1本とバイト単位・コマ単位で比べる。

合成素材（tools/shorts/render/make_assets.py）にしか効かない検査（2 と 3）がある。
本番の配信アーカイブには箱が無いので、2 は「合成素材で道具を確かめる」用。

**出す前の検査はここではなく `tools/shorts/qa/check.py`。** こちらは「書き出しの道具が
指示書どおりに書けているか」（カット位置の照合・2本のバイト一致）を見る道具で、
qa は「できあがりが媒体に出してよい形か」（音量・安全領域・透かし・顔…）を見る。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

# 同じ階の selectexpr.py を読む（qa/drill.py から import されたときも。後ろに足すので、呼んだ側の同名を隠さない）
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.append(str(Path(__file__).resolve().parent))
from selectexpr import select_expr  # noqa: E402

SR = 48000


def ffprobe(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration,"
                          "sample_rate,channels:format=duration,size", "-of", "json", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def grab(path: Path, frames: list[int], W: int, H: int) -> dict[int, np.ndarray]:
    """指定コマを1回のデコードで rgb の配列として取る。

    式は selectexpr.py で組む（`+` で横につなぐと、新しい ffmpeg は101項から受け付けない）。
    `-vsync 0` は ffmpeg 9.0 で消えた（`Unrecognized option 'vsync'`、終了コード 8。PR #1015 の CI の赤はこれ）。
    同じ意味の `-fps_mode passthrough` は 5.1 から在る。
    """
    uniq = sorted(set(frames))
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-vf", f"select={select_expr(uniq)}", "-fps_mode", "passthrough", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)
    assert len(arr) == len(uniq), (len(arr), len(uniq))
    return dict(zip(uniq, arr))


# 合成素材の箱の置き場（make_assets.py と同じ数。素材の側の座標）
BARCODE = {
    (1080, 1920): {"x0": 60, "step": 80, "box": 70, "y0": 150},
    (1920, 1080): {"x0": 960 - 6 * 46, "step": 46, "box": 40, "y0": 100},
}


def barcode_points(cut: dict, W: int, H: int) -> tuple[list[tuple[float, float]], float]:
    """素材の箱の中心が、書き出しのどこに来るか。render.py とは別に計算し直す。"""
    w, h = cut["w"], cut["h"]
    bc = BARCODE[(w, h)]
    src = [(bc["x0"] + k * bc["step"] + bc["box"] / 2, bc["y0"] + bc["box"] / 2) for k in range(12)]
    if cut["fit"] == "cover":
        s = max(W / w, H / h)
        sw, sh = 2 * math.ceil(w * s / 2), 2 * math.ceil(h * s / 2)
        cx = round((sw - W) * cut.get("focus_x", 0.5))
        cy = round((sh - H) * cut.get("focus_y", 0.5))
        pts = [(x * sw / w - cx, y * sh / h - cy) for x, y in src]
        return pts, bc["box"] * sw / w
    s = min(W / w, H / h)
    fw, fh = 2 * round(w * s / 2), 2 * round(h * s / 2)
    ox, oy = (W - fw) / 2, (H - fh) / 2
    return [(ox + x * fw / w, oy + y * fh / h) for x, y in src], bc["box"] * fw / w


def read_code(img: np.ndarray, pts, box: float) -> int:
    r = max(2, int(box * 0.25))
    v = 0
    for k, (x, y) in enumerate(pts):
        patch = img[int(y) - r:int(y) + r, int(x) - r:int(x) + r].astype(float)
        if patch.mean() > 128:
            v |= 1 << k
    return v


def check_cuts(out: Path, plan: dict) -> dict:
    W, H = plan["size"]
    want = {}
    for c in plan["cuts"]:
        n = c["frames"]
        for off in sorted({0, 1, n // 2, n - 2, n - 1}):
            want[c["at"] + off] = (c, c["in"] + off)
    imgs = grab(out, list(want), W, H)
    rows, bad = [], 0
    for f in sorted(want):
        c, exp = want[f]
        pts, box = barcode_points(c, W, H)
        got = read_code(imgs[f], pts, box)
        ok = got == exp
        bad += not ok
        rows.append({"frame": f, "cut_src": c["src"], "expect_src_frame": exp, "read": got, "ok": ok})
    return {"checked": len(rows), "mismatch": bad, "rows": rows}


def check_captions(out: Path, plan: dict) -> dict:
    W, H = plan["size"]
    frames = []
    for cap in plan["captions"]:
        a, b = cap["from"], cap["to"]
        frames += [a - 1, a, a + 1, b - 2, b - 1, b]
    frames = [f for f in frames if 0 <= f < plan["frames"]]
    imgs = grab(out, frames, W, H)

    def diff(cap, f1, f2):
        if f1 not in imgs or f2 not in imgs:
            return None
        y0, y1, x0, x1 = cap["y"], cap["y"] + cap["h"], cap["x"], cap["x"] + cap["w"]
        return float(np.abs(imgs[f1][y0:y1, x0:x1].astype(int) - imgs[f2][y0:y1, x0:x1].astype(int)).mean())

    rows, bad = [], 0
    for cap in plan["captions"]:
        a, b = cap["from"], cap["to"]
        on, base_on = diff(cap, a - 1, a), diff(cap, a, a + 1)
        off, base_off = diff(cap, b - 1, b), diff(cap, b - 2, b - 1)
        ok_on = on is None or on > 3 * max(base_on, 0.5)
        ok_off = off is None or off > 3 * max(base_off, 0.5)
        bad += (not ok_on) + (not ok_off)
        rows.append({"from": a, "to": b, "text": "／".join(cap["lines"]),
                     "diff_at_on": on, "diff_after_on": base_on,
                     "diff_at_off": off, "diff_before_off": base_off, "ok": ok_on and ok_off})
    return {"checked": len(rows), "bad_edges": bad, "rows": rows}


def rms_db(x: np.ndarray) -> float:
    v = float(np.sqrt(np.mean(np.square(x.astype(np.float64))))) if len(x) else 0.0
    return 20 * math.log10(v) if v > 0 else -120.0


def windows(plan: dict, n: int) -> tuple[np.ndarray, np.ndarray]:
    """ナレーションの間（inside）と、ナレーションから 0.5 秒以上離れた間（outside）。"""
    spf = SR // plan["fps"]
    inside = np.zeros(n, dtype=bool)
    for ln in plan["narration"]:
        inside[ln["at"] * spf:(ln["at"] + ln["frames"]) * spf] = True
    pad = SR // 2
    # 前後 pad サンプル以内にナレーションがあるか（累積和で数える。畳み込みだと遅すぎる）
    cs = np.concatenate([[0], np.cumsum(inside)])
    lo = np.clip(np.arange(n) - pad, 0, n)
    hi = np.clip(np.arange(n) + pad + 1, 0, n)
    near = (cs[hi] - cs[lo]) > 0
    outside = ~near
    outside[-2 * SR:] = False  # 最後のフェードアウトは除く
    return inside, outside


def check_audio(out: Path, work: Path, plan: dict) -> dict:
    res = {}
    stem_n, stem_b = work / "stem_narration.f32", work / "stem_bgm.f32"
    if stem_n.exists() and stem_b.exists():
        # 書き出しに使った音の束から測る（ナレーションと BGM を分けて測れる）
        narr = np.fromfile(stem_n, dtype="<f4").reshape(-1, 2)[:, 0]
        bgm = np.fromfile(stem_b, dtype="<f4").reshape(-1, 2)[:, 0]
        inside, outside = windows(plan, len(narr))
        res["narration_rms_dbfs_during"] = round(rms_db(narr[inside]), 2)
        res["bgm_rms_dbfs_during_narration"] = round(rms_db(bgm[inside]), 2)
        res["bgm_rms_dbfs_without_narration"] = round(rms_db(bgm[outside]), 2)
        res["speech_over_bgm_db"] = round(res["narration_rms_dbfs_during"] - res["bgm_rms_dbfs_during_narration"], 2)
        res["duck_depth_db"] = round(res["bgm_rms_dbfs_without_narration"] - res["bgm_rms_dbfs_during_narration"], 2)
    # 仕上がりの mp4 からも測る（どの書き出し道具でも同じ物差しで比べられるように）。
    # 2ch のまま読んで自分で平均する。ffmpeg に -ac 1 で混ぜさせると左右を足して √2 倍にするので、
    # 左右同じ音が +3dB に読めていた（束の -16dBFS が、仕上がりで -13.3 に見えた）
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(out), "-vn",
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    mix = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).mean(axis=1)
    inside, outside = windows(plan, len(mix))
    res["mix_rms_dbfs_during_narration"] = round(rms_db(mix[inside]), 2)
    res["mix_rms_dbfs_bgm_only"] = round(rms_db(mix[outside]), 2)
    # 仕上がりの中で BGM だけを見る: 合成 BGM のベース（44〜65Hz）は、声（open_jtalk の男声）と
    # 元素材の 220Hz より低いので、70Hz 以下だけを通すとほぼ BGM だけが残る。
    # （本番の BGM には効かない。合成素材でダッキングが仕上がりまで届いているかを見る用）
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(out), "-vn",
                          "-af", "lowpass=f=70,lowpass=f=70,lowpass=f=70,lowpass=f=70",
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    low = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).mean(axis=1)
    res["mix_bgm_band_duck_db"] = round(rms_db(low[outside[:len(low)]]) - rms_db(low[inside[:len(low)]]), 2)
    ebu = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(out), "-vn",
                          "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS", ebu)
    p = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+) dBFS", ebu)
    res["mix_integrated_lufs"] = float(m.group(1)) if m else None
    res["mix_true_peak_dbfs"] = float(p.group(1)) if p else None
    return res


def framemd5(path: Path) -> str:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-map", "0", "-f", "framemd5", "-"], check=True, capture_output=True).stdout
    lines = [ln for ln in out.decode().splitlines() if not ln.startswith("#")]
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("work", type=Path)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--json", type=Path, help="結果を書き出す先")
    a = ap.parse_args()
    plan = json.loads((a.work / "plan.json").read_text())
    res = {"probe": ffprobe(a.out)}
    res["cuts"] = check_cuts(a.out, plan)
    res["captions"] = check_captions(a.out, plan)
    res["audio"] = check_audio(a.out, a.work, plan)
    if a.twin:
        res["twin"] = {
            "sha256_a": sha(a.out), "sha256_b": sha(a.twin),
            "bytes_identical": sha(a.out) == sha(a.twin),
            "framemd5_identical": framemd5(a.out) == framemd5(a.twin),
        }
    text = json.dumps(res, ensure_ascii=False, indent=1)
    if a.json:
        a.json.write_text(text)
    summary = {
        "cuts_checked": res["cuts"]["checked"], "cut_mismatch": res["cuts"]["mismatch"],
        "caption_edges_bad": res["captions"]["bad_edges"], "audio": res["audio"],
        "twin": res.get("twin"),
        "bad_rows": [r for r in res["cuts"]["rows"] if not r["ok"]][:8]
        + [r for r in res["captions"]["rows"] if not r["ok"]],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    ok = res["cuts"]["mismatch"] == 0 and res["captions"]["bad_edges"] == 0
    if a.twin:
        ok = ok and res["twin"]["bytes_identical"]
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
