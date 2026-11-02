"""**品質チェックの YouTube ライブの札の検査（`badge.py`）が、落ちるときに落ちるか。**

    python3 tools/shorts/qa/badge_selftest.py
    BREAK=present python3 tools/shorts/qa/badge_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

書き出しを通さない。札の絵は本物の `render/live_badge.py` で描き（様式は本物の `style.json` の A）、
1080x1920・60コマ（2秒）の mp4 を numpy で重ねて作る（灰色の地に、札・題の札・字幕・終わりの札の絵）。
時間割（plan.json）も手で書く。だから足ごとに「時間割と mp4 のどちらか1つだけ」を壊せる。
要るのは ffmpeg・numpy・Pillow（Selftests には無いので、回し役の SKIP に載せ、`shorts_selftest.yml` が名指しで回す）。

| 足 | 壊し方 | 欲しい判定 |
| --- | --- | --- |
| `clean` | 壊さない（札は 0〜60コマ・題の札と終わりの札は札の下 16px） | pass・札を出す回として見た・見えないコマ 0・ぶつかり 0 |
| `off` | 札を出さない回（様式の enabled が false・時間割に札が無い） | pass・対象外 |
| `style_on` | 様式は出すのに、時間割に札が無い | fail |
| `no_overlay` | 時間割に札はあるが、重ね物（overlays）に札の絵が無い | fail |
| `half` | mp4 の 15コマ目から後ろに札を描かない（見るのは 0・30・59コマ） | fail（見えないコマ） |
| `moved` | mp4 の札を 40px 右に描く（時間割はそのまま） | fail（見えないコマ） |
| `span` | 時間割の札の出る間を 0〜25コマにする | fail（出る間） |
| `unsafe` | 札を y 300（安全領域の上 360 より上）に置く（時間割も mp4 も） | fail（安全領域） |
| `title_hit` | 題の札を y 380（札と重なる）に置く | fail（ぶつかり: 題の札） |
| `end_hit` | 終わりの札を y 400 に置く | fail（ぶつかり: 終わりの札） |
| `edge` | 字幕の箱を札の下端からちょうど 8px 下に置く／7px 下に置く | pass ／ fail |
| `time` | 札の出る間を 0〜10コマにし、20〜60コマの字幕を札と同じ所に置く | 出る間で落ち、ぶつかりは数えない（時間が重ならない） |
| `inset` | 札（inset）の帯を札の高さに置く | fail（ぶつかり: 札の帯） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

`CUTS` が `badge.py` を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**ことを確かめる。
"""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
RENDER = HERE.parent / "render"
BREAK = os.environ.get("BREAK", "")
W, H, N, FPS = 1080, 1920, 60, 30
END_TEXT = "※YouTubeで毎日22時から配信"

# 名前: (本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, set[str], str]] = {
    "style_on": ("        if cfg.get(\"enabled\"):\n", "        if False:\n", {"style_on"},
                 "様式が出すと言っていても、時間割に札が無ければ対象外にする"),
    "overlay": ("        problems.append(\"札の絵が、時間割の重ね物（overlays）に無い\")\n", "        pass\n",
                {"no_overlay"}, "重ね物に札の絵が無くても落とさない"),
    "span": ("    if int(lb.get(\"from\", -1)) != 0 or int(lb.get(\"to\", -1)) < n:\n", "    if False:\n",
             {"span", "time"}, "札の出る間を見ない"),
    "safe": ("    if sv:\n", "    if False:\n", {"unsafe"}, "安全領域の外を落とさない"),
    "collide": ("        if ob is None or not _near(box, ob, MARGIN):\n", "        if True:\n",
                {"title_hit", "end_hit", "edge"}, "ほかの字とのぶつかりを数えない"),
    "margin": ("MARGIN = 8 ", "MARGIN = 0 ", {"edge"}, "近さの余白を 0 にする（7px まで寄っても通る）"),
    "time_filter": ("        if not (int(o[\"from\"]) < a1 and a0 < int(o[\"to\"])):\n            continue\n", "",
                    {"time"}, "出ている時間が重ならない字まで、ぶつかりに数える"),
    "present": ("            if not mae < PRESENT_MAE:\n", "            if False:\n", {"half", "moved"},
                "札が見えないコマを数えない"),
    "inset": ("    for ib in _inset_boxes(plan, ctx.W):\n", "    for ib in []:\n", {"inset"},
              "札（inset）の帯とのぶつかりを見ない"),
}


def load_mod(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def fonts_ok() -> bool:
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(RENDER / "fonts")]:
        if d and all((Path(d) / n).exists() for n in ("MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf")):
            return True
    return False


def fonts_dir(box: Path) -> Path | None:
    """本物の書体が無ければ、箱の太字を M PLUS の名前で置く（render の見張りと同じ）。"""
    if fonts_ok():
        return None
    cands = []
    for root in ("/usr/share/fonts", "/usr/local/share/fonts"):
        if os.path.isdir(root):
            cands += sorted(Path(root).rglob("*.ttf"))
    pick = next((p for p in cands if "Bold" in p.name), cands[0] if cands else None)
    if pick is None:
        raise SystemExit(2)
    d = box / "fonts"
    d.mkdir(exist_ok=True)
    for n in ("MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf"):
        (d / n).symlink_to(pick)
    return d


def make_src(dst: Path, cut: str | None) -> None:
    """qa/ を写す（守りを1つ外すなら、badge.py のその字だけ書き換える）。"""
    shutil.copytree(HERE, dst, ignore=shutil.ignore_patterns("__pycache__"))
    # 写した qa/ は、隣の ../render/（コマ番号の式 selectexpr・様式）を本物から読む
    (dst.parent / "render").symlink_to(RENDER, target_is_directory=True)
    if cut:
        old, new, _, _ = CUTS[cut]
        text = (dst / "badge.py").read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が badge.py に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        (dst / "badge.py").write_text(text.replace(old, new), encoding="utf-8")


# ---------------------------------------------------------------- 素材

class Kit:
    """札・題の札・字幕・終わりの札の絵と、mp4 を作る道具。"""

    def __init__(self, d: Path):
        from PIL import Image, ImageDraw, ImageFont
        self.d = d
        sys.path.insert(0, str(RENDER))
        try:
            LB = load_mod("live_badge", RENDER / "live_badge.py")
        finally:
            sys.path.pop(0)
        st = json.loads((RENDER / "style.json").read_text(encoding="utf-8"))
        st["live_badge"].update({"enabled": True, "look": "A"})
        self.style = st
        fdir = os.environ.get("SHORTS_FONTS_DIR") or str(RENDER / "fonts")
        font_for = lambda k: Path(fdir) / st["fonts"].get(k, k)  # noqa: E731
        self.badge = LB.badge_img(LB.config(st), font_for)
        self.badge.save(d / "badge.png")
        f = ImageFont.truetype(str(font_for("caption")), 56)

        def card(text, w, h, path):
            im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            dr = ImageDraw.Draw(im)
            dr.rounded_rectangle([0, 0, w - 1, h - 1], radius=24, fill=(0, 0, 0, 255))
            dr.text((30, 20), text, font=f, fill=(255, 255, 255, 255))
            im.save(path)
            return str(path)

        self.title_png = card("題の札のテスト", 840, 200, d / "title.png")
        self.end_png = card(END_TEXT, 760, 100, d / "end.png")
        self.cap_png = card("字幕のテスト", 600, 100, d / "cap.png")

    def mp4(self, name: str, badge_at=(120, 372), badge_frames=range(N), extra=()) -> Path:
        """灰色の地（ゆっくり明るさが変わる）に、札とほかの絵を重ねた N コマ。

        mp4 は badge.py を見ずに作るので、守りを外す子どうしで使い回す（親が BADGE_KIT に置き場を渡す。
        子ごとに6本作り直すと、それだけで 1本 8秒・10回で 80秒かかった）。
        """
        import numpy as np
        from PIL import Image
        kit = os.environ.get("BADGE_KIT")
        out = (Path(kit) if kit else self.d) / f"{name}.mp4"
        if kit and out.is_file():
            return out
        proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                                 "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "ultrafast",
                                 "-crf", "16", "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE)
        for f in range(N):
            g = 90 + f
            im = Image.new("RGBA", (W, H), (g, g + 10, g + 20, 255))
            for png, x, y, a, b in extra:
                if a <= f < b:
                    im.alpha_composite(Image.open(png), (x, y))
            if f in badge_frames:
                im.alpha_composite(self.badge, badge_at)
            proc.stdin.write(np.asarray(im.convert("RGB")).tobytes())
        proc.stdin.close()
        proc.wait()
        return out

    def plan(self, *, badge_xy=(120, 372), span=(0, N), live=True, title_y=444, end_y=444, extra=(),
             cuts=None, style_on=True) -> dict:
        st = copy.deepcopy(self.style)
        st["live_badge"]["enabled"] = style_on
        bw, bh = self.badge.size
        ovs = [{"kind": "title", "png": self.title_png, "x": 120, "y": title_y, "w": 840, "h": 200,
                "from": 0, "to": 12, "text": "題の札のテスト", "line": 0},
               {"kind": "caption", "png": self.title_png, "x": 120, "y": title_y, "w": 840, "h": 200,
                "from": 0, "to": 12, "text": "題の札のテスト", "line": 0, "card": True},
               {"kind": "caption", "png": self.cap_png, "x": 240, "y": 900, "w": 600, "h": 100,
                "from": 12, "to": 20, "text": "字幕のテスト", "line": 1},
               {"kind": "note", "png": self.end_png, "x": 120, "y": end_y, "w": 760, "h": 100,
                "from": 20, "to": N, "text": END_TEXT}] + list(extra)
        p = {"fps": FPS, "size": [W, H], "frames": N, "style": st, "overlays": ovs,
             "titles": [{"look": "card", "x": 120, "y": title_y, "w": 840, "h": 200, "from": 0, "to": 12}],
             "notes": [{"text": END_TEXT, "end_note": True, "from": 20, "to": N}],
             "cuts": cuts or [{"at": 0, "frames": N}], "captions": [], "telops": []}
        if live:
            item = {"look": "A", "text": "● LIVE｜YouTube ライブより", "png": str(self.d / "badge.png"),
                    "x": badge_xy[0], "y": badge_xy[1], "w": bw, "h": bh, "from": span[0], "to": span[1],
                    "gap": 16, "made_room": {}}
            p["live_badge"] = item
            ovs.insert(0, {"kind": "badge", "png": item["png"], "x": item["x"], "y": item["y"], "w": bw, "h": bh,
                           "from": span[0], "to": span[1], "text": item["text"]})
        return p

    def videos(self, end_y=444, title_y=444) -> list:
        return [(self.title_png, 120, title_y, 0, 12), (self.cap_png, 240, 900, 12, 20), (self.end_png, 120, end_y, 20, N)]


def run_check(C, B, mp4: Path, plan: dict, name: str, d: Path) -> dict:
    work = d / f"w_{name}"
    work.mkdir(exist_ok=True)
    (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    ctx = C.make_ctx(mp4, work, crops=d / f"{name}.qa")
    return B.check(ctx)


# ---------------------------------------------------------------- 足

def legs(C, B, kit: Kit, d: Path) -> dict:
    clean = kit.mp4("clean", extra=kit.videos())
    import numpy as np
    ys = np.nonzero((np.asarray(kit.badge)[:, :, 3] >= 16).any(axis=1))[0]
    bot = 372 + int(ys.max()) + 1          # 札の見える画素の下端（検査が箱を取るのと同じ線）
    cases = {}

    def go(name, plan, mp4=clean):
        cases[name] = run_check(C, B, mp4, plan, name, d)
        return cases[name]

    r = go("clean", kit.plan())
    m = r["measured"]
    out = {"clean": [(f"pass（{r['status']}: {r['summary']}）", r["status"] == "pass"),
                     (f"札を出す回として見た（{m.get('frames_looked')}コマ）",
                      m.get("applicable") is True and m.get("frames_looked", 0) >= 3),
                     (f"見えないコマ 0（{len(m.get('missing_frames', []))}）・ぶつかり 0（{len(m.get('collisions', []))}）",
                      not m.get("missing_frames") and not m.get("collisions"))]}
    r = go("off", kit.plan(live=False, style_on=False))
    out["off"] = [(f"対象外で pass（{r['status']}: {r['summary']}）",
                   r["status"] == "pass" and r["measured"].get("applicable") is False)]
    r = go("style_on", kit.plan(live=False, style_on=True))
    out["style_on"] = [(f"様式は出すのに時間割に札が無ければ落とす（{r['status']}）", r["status"] == "fail")]
    p = kit.plan()
    p["overlays"] = [o for o in p["overlays"] if o["kind"] != "badge"]
    r = go("no_overlay", p)
    out["no_overlay"] = [(f"重ね物に札の絵が無ければ落とす（{r['status']}）", r["status"] == "fail")]
    r = go("half", kit.plan(), kit.mp4("half", badge_frames=range(15), extra=kit.videos()))
    mf = r["measured"].get("missing_frames", [])
    out["half"] = [(f"15コマ目から後ろが見えない（{r['status']}・{[x['frame'] for x in mf]}）",
                    r["status"] == "fail" and mf and min(x["frame"] for x in mf) >= 15)]
    r = go("moved", kit.plan(), kit.mp4("moved", badge_at=(160, 372), extra=kit.videos()))
    out["moved"] = [(f"40px 右にずれた札は見えないと読む（{r['status']}・見えないコマ {len(r['measured'].get('missing_frames', []))}）",
                     r["status"] == "fail" and len(r["measured"].get("missing_frames", [])) >= 3)]
    r = go("span", kit.plan(span=(0, 25)))
    out["span"] = [(f"出る間 0〜25 を落とす（{r['status']}: {r['problems'][:1]}）",
                    r["status"] == "fail" and any("出る間" in x for x in r["problems"]))]
    r = go("unsafe", kit.plan(badge_xy=(120, 300)), kit.mp4("unsafe", badge_at=(120, 300), extra=kit.videos()))
    out["unsafe"] = [(f"y 300 の札を安全領域の外と読む（{r['status']}: {r['measured'].get('safe_violations')}）",
                      r["status"] == "fail" and bool(r["measured"].get("safe_violations")))]
    r = go("title_hit", kit.plan(title_y=380), kit.mp4("title_hit", extra=kit.videos(title_y=380)))
    col = [c["what"] for c in r["measured"].get("collisions", [])]
    out["title_hit"] = [(f"題の札とのぶつかりを数える（{r['status']}・{col}）", r["status"] == "fail" and "題の札" in col)]
    r = go("end_hit", kit.plan(end_y=400), kit.mp4("end_hit", extra=kit.videos(end_y=400)))
    col = [c["what"] for c in r["measured"].get("collisions", [])]
    out["end_hit"] = [(f"終わりの札とのぶつかりを数える（{r['status']}・{col}）", r["status"] == "fail" and "終わりの札" in col)]
    # 字幕の箱（見える画素）を札の下端から 8px／7px 下に置く（絵の箱の上端＝見える画素の上端の絵を使う）
    ok8 = go("edge8", kit.plan(extra=[{"kind": "caption", "png": kit.cap_png, "x": 240, "y": bot + 8, "w": 600, "h": 100,
                                        "from": 0, "to": N, "text": "8px 下"}]))
    ng7 = go("edge7", kit.plan(extra=[{"kind": "caption", "png": kit.cap_png, "x": 240, "y": bot + 7, "w": 600, "h": 100,
                                        "from": 0, "to": N, "text": "7px 下"}]))
    out["edge"] = [(f"8px 下は通る（{ok8['status']}）", ok8["status"] == "pass"),
                   (f"7px 下は落ちる（{ng7['status']}）", ng7["status"] == "fail")]
    r = go("time", kit.plan(span=(0, 10), extra=[{"kind": "caption", "png": kit.cap_png, "x": 120, "y": 372, "w": 600,
                                                   "h": 100, "from": 20, "to": N, "text": "時間が違う"}]))
    out["time"] = [(f"出る間で落ちる（{r['status']}）", r["status"] == "fail" and any("出る間" in x for x in r["problems"])),
                   (f"時間が重ならない字はぶつかりに数えない（{len(r['measured'].get('collisions', []))}）",
                    not r["measured"].get("collisions"))]
    r = go("inset", kit.plan(cuts=[{"at": 0, "frames": N, "inset": {"rect": [0, 0, 720, 300], "w": 840, "cy": 500}}]))
    col = [c["what"] for c in r["measured"].get("collisions", [])]
    out["inset"] = [(f"札（inset）の帯とのぶつかりを数える（{r['status']}・{col}）",
                     r["status"] == "fail" and "札（inset）の帯" in col)]
    return out


def child(name: str | None) -> int:
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        fd = fonts_dir(box)
        if fd:
            os.environ["SHORTS_FONTS_DIR"] = str(fd)
        src = box / "qa"
        make_src(src, name)
        for m in ("badge", "check", "common", "text"):
            sys.modules.pop(m, None)
        sys.path.insert(0, str(src))
        import badge as B  # noqa: E402
        import check as C  # noqa: E402
        d = box / "case"
        d.mkdir()
        kit = Kit(d)
        res = legs(C, B, kit, d)
    failed = []
    for leg, rows in res.items():
        print(f"[{leg}]")
        for what, ok in rows:
            print(f"  {'○' if ok else '✕'} {what}")
        if any(not ok for _, ok in rows):
            failed.append(leg)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    return 1 if failed else 0


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, want, why) in CUTS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=name), timeout=600, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    try:
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow が要る）")
        return 2
    if shutil.which("ffmpeg") is None:
        print("✕ 回せない: ffmpeg が無い")
        return 2
    if BREAK:
        return child(BREAK)
    with tempfile.TemporaryDirectory() as kit:
        os.environ["BADGE_KIT"] = kit
        rc = child(None)
        print()
        bad = drill()
    print()
    if rc or bad:
        if rc:
            print("✕ 本物で落ちた足がある（上の ✕）")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ 13通りの足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
