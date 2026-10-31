"""人が直す画面に渡す bundle.json と、スマホ向けの軽い素材（プロキシ）を作る。

    python3 make_bundle.py props.json dist [issue_url] [edit_id]

本番では、配信アーカイブの全体ではなく「各カットの前後 ±3 秒」だけを
半分の解像度で書き出して置く（1本あたり数 MB）。PoC では素材が短いので丸ごと。
"""
import json
import subprocess
import sys
from pathlib import Path

props = json.loads(Path(sys.argv[1]).read_text())
dist = Path(sys.argv[2])
issue = sys.argv[3] if len(sys.argv) > 3 else None
edit_id = sys.argv[4] if len(sys.argv) > 4 else "poc-hitchhike"  # 指示書の id（差分を当てる先の取り違えを防ぐ）
pub = Path(sys.argv[1]).parent / "public"
media = dist / "media"
media.mkdir(parents=True, exist_ok=True)
plan = props["plan"]
done = {}
for c in plan["cuts"]:
    name = Path(c["file"]).name
    if name not in done:
        out = media / name
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(pub / c["file"]),
                        "-vf", "scale=iw/2:ih/2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
                        "-g", "15", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(out)], check=True)
        done[name] = out.stat().st_size
    c["file"] = name
for ln in plan["narration"]:
    name = Path(ln["norm"]).with_suffix(".m4a").name
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(pub / ln["norm"]),
                    "-c:a", "aac", "-b:a", "96k", str(media / name)], check=True)
    ln["norm"] = name
if plan.get("bgm"):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(pub / plan["bgm"]["norm"]),
                    "-c:a", "aac", "-b:a", "96k", str(media / "bgm_norm.m4a")], check=True)
    plan["bgm"]["norm"] = "bgm_norm.m4a"
# 手元のパスは公開先に出さない（bundle.json は誰でも読める場所に置く）
for c in plan["cuts"]:
    c.pop("path", None)
for ln in plan["narration"]:
    ln.pop("file", None)
    ln.pop("norm_file", None)
for it in plan["titles"] + plan["captions"]:
    it.pop("png", None)
if plan.get("bgm"):
    plan["bgm"].pop("norm_file", None)
    plan["bgm"].pop("path", None)
bundle = {"id": edit_id, "issue": issue, "plan": plan, "style": props["style"],
          "mediaBase": "media", "fontBase": "fonts"}
(dist / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False))
# この作業箱の Chromium は H.264 を再生できない（独自コーデック抜きの版）。確かめる用に WebM も作る。
# 本番（iPhone の Safari）は mp4 のほうを使う。
for name in list(done):
    webm = (media / name).with_suffix(".webm")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(media / name),
                    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-deadline", "realtime", "-cpu-used", "8",
                    "-g", "15", "-c:a", "libopus", "-b:a", "64k", str(webm)], check=True)
for c in plan["cuts"]:
    c["file"] = Path(c["file"]).with_suffix(".webm").name
(dist / "bundle_webm.json").write_text(json.dumps(bundle, ensure_ascii=False))
total = sum(p.stat().st_size for p in media.iterdir())
print(json.dumps({"proxies": done, "media_total_bytes": total}, ensure_ascii=False))
