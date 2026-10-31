"""形式: 媒体がそのまま受け取って、縦型ショートとして扱う形になっているか。"""
from __future__ import annotations

from common import FAIL, PASS, Ctx, mp4_boxes, rate, result

# 線と、その理由
WANT_W, WANT_H = 1080, 1920          # 縦 9:16。YouTube ショート・TikTok とも、この大きさで画面いっぱい
FPS_OK = (29.97 - 0.01, 30.0 + 0.01)  # 「30fps 前後」。29.97 も 30 として扱う（配信の元素材がどちらもある）
MAX_SEC = 60.0                        # あやとの決め: 60秒未満（YouTube は3分まで受けるが、ここは企画の決め）
AUDIO_RATES = (44100, 48000)
AV_GAP_SEC = 0.1                      # 音と絵の長さの差。AAC の詰め物（1024サンプル≒21ms）より十分大きく


def check(ctx: Ctx) -> dict:
    pr = ctx.probe
    streams = pr.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    fmt = pr.get("format", {})
    problems, m = [], {}
    th = {"size": f"{WANT_W}x{WANT_H}", "fps": "29.97〜30", "duration_lt_sec": MAX_SEC,
          "video_codec": "h264 / yuv420p", "audio_codec": "aac", "audio_rate": list(AUDIO_RATES),
          "audio_channels": 2, "faststart": "moov が mdat より前", "av_gap_max_sec": AV_GAP_SEC}

    dur = float(fmt.get("duration") or 0)
    m["duration_sec"] = round(dur, 3)
    if not (0 < dur < MAX_SEC):
        problems.append(f"長さ {dur:.2f} 秒（{MAX_SEC:.0f} 秒未満であること）")

    if v is None:
        problems.append("映像が無い")
    else:
        m["size"] = f"{v.get('width')}x{v.get('height')}"
        if (v.get("width"), v.get("height")) != (WANT_W, WANT_H):
            problems.append(f"大きさ {m['size']}（{WANT_W}x{WANT_H} であること）")
        r, avg = rate(v.get("r_frame_rate")), rate(v.get("avg_frame_rate"))
        m["fps"] = round(r, 3) if r else None
        m["avg_fps"] = round(avg, 3) if avg else None
        for name, val in (("r_frame_rate", r), ("avg_frame_rate", avg)):
            if val is None or not (FPS_OK[0] <= val <= FPS_OK[1]):
                problems.append(f"{name} が {val}（29.97〜30 であること）")
        m["video_codec"] = v.get("codec_name")
        m["pix_fmt"] = v.get("pix_fmt")
        if v.get("codec_name") != "h264":
            problems.append(f"映像の符号 {v.get('codec_name')}（h264 であること）")
        if v.get("pix_fmt") != "yuv420p":
            problems.append(f"画素の形 {v.get('pix_fmt')}（yuv420p であること。ほかは再生できない端末がある）")
        sar = v.get("sample_aspect_ratio")
        m["sar"] = sar
        if sar not in (None, "1:1", "0:1", "N/A"):
            problems.append(f"画素の縦横比 {sar}（1:1 であること。違うと引き伸ばされる）")
        rot = [sd for sd in v.get("side_data_list", []) or [] if "rotation" in sd]
        if rot and int(rot[0].get("rotation", 0)) != 0:
            problems.append(f"回転の印 {rot[0].get('rotation')}°（縦のまま書き出すこと）")
        nb = v.get("nb_frames")
        m["frames"] = int(nb) if nb and str(nb).isdigit() else None
        if ctx.plan and m["frames"] is not None and m["frames"] != int(ctx.plan["frames"]):
            problems.append(f"コマ数 {m['frames']} が時間割 {ctx.plan['frames']} と違う")

    if a is None:
        problems.append("音が無い")
    else:
        m["audio_codec"] = a.get("codec_name")
        m["audio_rate"] = int(a.get("sample_rate") or 0)
        m["audio_channels"] = a.get("channels")
        if a.get("codec_name") != "aac":
            problems.append(f"音の符号 {a.get('codec_name')}（aac であること）")
        if m["audio_rate"] not in AUDIO_RATES:
            problems.append(f"音の周波数 {m['audio_rate']}（44100 か 48000 であること）")
        if a.get("channels") != 2:
            problems.append(f"音の数 {a.get('channels')}ch（2ch であること）")
        if v is not None and a.get("duration") and v.get("duration"):
            gap = abs(float(a["duration"]) - float(v["duration"]))
            m["av_gap_sec"] = round(gap, 3)
            if gap > AV_GAP_SEC:
                problems.append(f"音と絵の長さが {gap:.2f} 秒違う")

    boxes = mp4_boxes(ctx.mp4)
    names = [b[0] for b in boxes]
    m["top_boxes"] = names
    if "moov" not in names or "mdat" not in names:
        problems.append(f"mp4 の箱が揃っていない: {names}")
    elif names.index("moov") > names.index("mdat"):
        # 後ろに moov があると、全部落としきるまで再生が始まらない（媒体の取り込みでも遅れる）
        problems.append("moov が mdat の後ろ（faststart になっていない）")
    m["faststart"] = "moov" in names and "mdat" in names and names.index("moov") < names.index("mdat")

    summary = (f"{m.get('size')} {m.get('fps')}fps {dur:.2f}秒 {m.get('video_codec')}/{m.get('audio_codec')} "
               f"{m.get('audio_rate')}Hz {m.get('audio_channels')}ch faststart={m['faststart']}")
    return result("container", "形式", FAIL if problems else PASS, summary,
                  measured=m, thresholds=th, problems=problems)
