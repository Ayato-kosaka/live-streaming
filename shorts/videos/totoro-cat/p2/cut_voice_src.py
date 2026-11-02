"""voice_src の行の声を、clips の mp4 の元の音から切ってつなぐ（build_edit の orig_audio と同じ作り: 48kHz・1ch・つなぎ目 12ms・頂点 0.9）。python3 -I shorts/videos/totoro-cat/p2/cut_voice_src.py <clips の置き場> <出力>。切る秒は spec の voice_src と同じ。"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np
C = Path(sys.argv[1]); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
SR = 48000
plan = {
 "03": [("01_0-37-18_0-37-58.mp4", 32.72, 35.35)],
 "09": [("10_2-00-08_2-00-56.mp4", 4.30, 5.30), ("10_2-00-08_2-00-56.mp4", 9.95, 10.95), ("10_2-00-08_2-00-56.mp4", 13.22, 14.30)],
 "10": [("10_2-00-08_2-00-56.mp4", 42.10, 43.30), ("10_2-00-08_2-00-56.mp4", 44.40, 45.40)],
 "06": [("06_1-18-18_1-18-38.mp4", 4.85, 7.10), ("06_1-18-18_1-18-38.mp4", 10.05, 11.60)],
 "07": [("06_1-18-18_1-18-38.mp4", 13.05, 13.95)],
}
fade = int(SR * 0.012)
res = {}
for k, segs in plan.items():
    parts = []
    for f, a, b in segs:
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(C / f), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
        x = np.frombuffer(raw, dtype=np.float32).copy()
        env = np.ones(len(x), dtype=np.float32); env[:fade] = np.linspace(0, 1, fade); env[-fade:] = np.linspace(1, 0, fade)
        parts.append(x * env)
    y = np.concatenate(parts)
    pk = float(np.max(np.abs(y)))
    if pk > 0.9: y = y * (0.9 / pk)
    p = out / f"vsrc_{k}.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    res[k] = {"file": str(p), "duration": round(len(y) / SR, 3), "segments": [[f, a, b] for f, a, b in segs]}
    print(k, res[k]["duration"])
json.dump(res, open(out / "vsrc.json", "w"), ensure_ascii=False, indent=1)
