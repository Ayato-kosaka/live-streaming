"""render.py の plan.json と style.json から、Remotion に渡す props.json を作る。

素材は public/ に symlink で並べ、props の中は public/ からの相対名にする。
"""
import json
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).parent
PUB = HERE / "public"


ROOT = None  # render.py を回した場所（古い plan.json は相対パスを持っているので）


def link(src: str, name: str) -> str:
    if not Path(src).is_absolute() and ROOT:
        src = str(ROOT / src)
    dst = PUB / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.is_symlink() or dst.exists():
        dst.unlink()
    # Remotion は public/ を束ねるときに symlink を辿らないので、実体を置く
    try:
        os.link(Path(src).resolve(), dst)
    except OSError:
        shutil.copy2(Path(src).resolve(), dst)
    return name


def main(plan_path, style_path, fonts_dir, out="props.json"):
    global ROOT
    ROOT = Path(plan_path).resolve().parent.parent
    plan = json.loads(Path(plan_path).read_text())
    style = json.loads(Path(style_path).read_text())
    for c in plan["cuts"]:
        c["file"] = link(c["path"], "media/" + Path(c["path"]).name)
    for i, ln in enumerate(plan["narration"]):
        ln["norm"] = link(ln["norm_file"], f"media/narr_{i:02d}.wav")
    if plan.get("bgm"):
        plan["bgm"]["norm"] = link(plan["bgm"]["norm_file"], "media/bgm_norm.wav")
    for f in style["fonts"].values():
        if f.endswith(".ttf"):
            link(str(Path(fonts_dir) / f), "fonts/" + f)
    (HERE / out).write_text(json.dumps({"plan": plan, "style": style}, ensure_ascii=False))
    print(HERE / out)


if __name__ == "__main__":
    main(*sys.argv[1:])
