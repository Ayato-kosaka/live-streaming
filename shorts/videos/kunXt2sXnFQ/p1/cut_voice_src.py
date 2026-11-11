"""voice_src の行（17・18行目）の声を、clips の mp4 の元の音から切ってつなぐ（build_edit の orig_audio と同じ作り:
48kHz・1ch・つなぎ目 12ms・頂点 0.9）。切る秒は spec の voice_src と同じ（窓 02 は 6:35:30 から）。
python3 -I shorts/videos/kunXt2sXnFQ/p1/cut_voice_src.py <clips の置き場> <出力>

秒の決めかた: 語の秒は Whisper large-v3-turbo（EC2・語ごとの時刻）と YouTube の自動字幕で取り、頭と尻は 40ms ごとの
音量で、声の立ち上がり（−20dB を越える所）の 40ms 前から、−27dB を下回る所までにした。
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

C = Path(sys.argv[1]); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
SR = 48000
W2 = "02_6-35-30_6-45-30.mp4"  # 6:35:30 = 23730秒から
plan = {
    # 「うんこかけられてんけど」6:40:03.30〜04.42 と「もう最悪や」6:40:06.42〜07.95（あいだの「。」の2秒は詰める。行が3秒ちょうどにならないよう、頭と尻の息を 0.05秒ずつ削った）
    "17": [(W2, 273.30, 274.42), (W2, 276.42, 277.95)],
    # 「おい、おい、おい。誰やこれ」6:40:47.66〜49.24
    "18": [(W2, 317.66, 319.24)],
}
fade = int(SR * 0.012)
res = {}
for k, segs in plan.items():
    parts = []
    for f, a, b in segs:
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(C / f),
                              "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
        x = np.frombuffer(raw, dtype=np.float32).copy()
        env = np.ones(len(x), dtype=np.float32); env[:fade] = np.linspace(0, 1, fade); env[-fade:] = np.linspace(1, 0, fade)
        parts.append(x * env)
    y = np.concatenate(parts)
    pk = float(np.max(np.abs(y)))
    if pk > 0.9:
        y = y * (0.9 / pk)
    p = out / f"vsrc_{k}.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    res[k] = {"file": str(p), "duration": round(len(y) / SR, 3), "segments": [[f, a, b] for f, a, b in segs]}
    print(k, res[k]["duration"])
json.dump(res, open(out / "vsrc.json", "w"), ensure_ascii=False, indent=1)
