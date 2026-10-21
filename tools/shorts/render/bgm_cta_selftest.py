"""**BGM の頭の無音を飛ばす（F-041）・最後の画に注の札を出す（F-042）が、書き出しの既定で効いているか。**

    python3 tools/shorts/render/bgm_cta_selftest.py
    BREAK=trim python3 tools/shorts/render/bgm_cta_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

あやとの2つの指示（2026-10-21）を、回ごとの手の指定ではなく道具の既定にした:

- F-041「BGM の初めのミュート部分は切ってください」。ポケットサウンドの「クシコス・ポスト」は頭に 1.42秒の無音
  （mp3 のデコーダの床 −135dB）がある。書き出しが測って飛ばす（`render.py` の `bgm_head_silence`）
- F-042「最後のテロップ『※YouTubeで毎日22時から配信』」「このCTAテロップ、次から全部入れて」。
  様式の `end_note` を書き出しが最後のカットに足す（`render.py` の `end_note`）。「※生配信のアーカイブ」はこれに替える

要るのは ffmpeg・numpy・Pillow・OpenCV・budoux（書き出しそのもの）。Selftests には無いので、回し役
（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す
（国旗の見張りと同じ形）。書体は本物（`fetch_fonts.sh`）が無ければ、箱にある書体を同じ名前で置く。
YuNet は使わない（字の顔よけを切った様式で書く）。

## 何を見るか

本物の `render.py` と `style.json` を写して回す。素材は ffmpeg と numpy で作る（灰色の画・200Hz の声・
頭に 1.42秒の −135dB の床がある和音の BGM）。

| 足 | 確かめること |
| --- | --- |
| `trim_head` | 頭に 1.42秒の無音のある BGM で、時間割の `head_trim_s` が 1.40〜1.43秒。BGM の束の0コマ目が −60dBFS より大きく、2〜20コマ目の真ん中の値から 8dB 以内（最初のコマから鳴っている） |
| `no_cut_music` | 頭から鳴っている BGM は削らない（`head_trim_s` が 0） |
| `quiet_intro` | 静かな前奏（本体より 30dB 小さい）は無音と読まない（削らない） |
| `cta_last_cut` | 最後のカットが 2.5秒の回: 注「※YouTubeで毎日22時から配信」が最後のカットの頭から終わりまで |
| `cta_short_last_cut` | 最後のカットが 1秒の回: 読める長さ（2秒）を残して、終わりの 60コマ前から |
| `cta_replaces` | 「※生配信のアーカイブ」の注は外して CTA に替える。指示書に CTA を書いてあっても2つにならない |
| `stack` | 終わりに別の注があっても、2つの札が重ならない（下に積む） |
| `e2e` | 本物の書き出し（下書き）の mp4 で、最初のコマから音がある（0コマ目が 2〜20コマ目の真ん中から 10dB 以内）・最後のコマの札の箱が、札の出る前の同じ所より暗い（灰色の画に半透明の黒い札） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
CTA = "※YouTubeで毎日22時から配信"
OLD = "※生配信のアーカイブ"
FPS = 30
SR = 48000

# 名前: (ファイル, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "trim": ("render.py", "        src = src[head:]\n", "        src = src[0:]\n",
             {"trim_head", "e2e"}, "測った頭の無音を飛ばさない"),
    "floor": ("render.py",
              "    line = max(ref * db(cfg.get(\"rel_db\", -40)), db(cfg.get(\"floor_dbfs\", -70)))\n",
              "    line = ref * db(-200)\n",
              {"trim_head", "e2e"}, "線を床（−70dBFS）より下に引く（mp3 のデコーダの −135dB を音と読む）"),
    "fade": ("style.json", "    \"bgm_fade_in_s\": 0.033,\n", "    \"bgm_fade_in_s\": 0.3,\n",
             {"trim_head", "e2e"}, "頭の上げを前の 0.3秒に戻す（最初のコマが −24dB でほぼ鳴らない）"),
    "quiet": ("style.json", "\"bgm_head_trim\": { \"rel_db\": -40,", "\"bgm_head_trim\": { \"rel_db\": -10,",
              {"quiet_intro"}, "線を曲の大きさの −10dB まで上げる（静かな前奏を無音と読んで削る）"),
    "cta": ("render.py", "    notes = end_note(notes, cuts, total, style)\n", "",
            {"cta_last_cut", "cta_short_last_cut", "cta_replaces", "stack", "e2e"}, "終わりの札を足さない"),
    "replace": ("render.py", "    drop = set(cfg.get(\"replaces\") or [])\n", "    drop = set()\n",
                {"cta_replaces"}, "「※生配信のアーカイブ」を外さない（終わりに注が2つ）"),
    "min": ("render.py",
            "    a = min(cuts[-1][\"at\"], max(0, total - round(float(cfg.get(\"min_s\", 2.0)) * style[\"canvas\"][\"fps\"])))\n",
            "    a = cuts[-1][\"at\"]\n",
            {"cta_short_last_cut"}, "最後のカットが短くても、そのカットの間だけ出す（1秒で読みきれない）"),
    "stack": ("render.py", "                y = prev[\"y\"] + prev[\"h\"] + st.get(\"stack_gap\", 12)\n",
              "                pass\n", {"stack"}, "同じ時に出る注を積まない（札が重なる）"),
}


# ---------------------------------------------------------------- 道具と素材の用意

def fonts_dir(box: Path) -> Path | None:
    """本物の書体（fetch_fonts.sh）が無ければ、箱の太字を M PLUS の名前で置く（flag_selftest.py と同じ）。"""
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf"]
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(HERE / "fonts")]:
        if d and all((Path(d) / n).exists() for n in names):
            return Path(d)
    cands = []
    for root in ("/usr/share/fonts", "/usr/local/share/fonts"):
        if os.path.isdir(root):
            cands += sorted(Path(root).rglob("*.ttf"))
    pick = next((p for p in cands if "Bold" in p.name), cands[0] if cands else None)
    if pick is None:
        return None
    d = box / "fonts"
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).symlink_to(pick)
    return d


def make_src(dst: Path, cut: str | None) -> None:
    """本物を写す（守りを1つ外すなら、その字だけ書き換える）。外す字が無ければ 2 で落ちる。"""
    for p in HERE.glob("*.py"):
        shutil.copy(p, dst / p.name)
    for p in HERE.glob("*.json"):
        shutil.copy(p, dst / p.name)
    shutil.copytree(HERE / "flags", dst / "flags")
    # 書き出しは割ってよい所を品質チェックの qa/ から読む（render.py の隣の ../qa/）
    shutil.copytree(HERE.parent / "qa", dst.parent / "qa", ignore=shutil.ignore_patterns("assets", "__pycache__"))
    if cut:
        fname, old, new, _, _ = CUTS[cut]
        text = (dst / fname).read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        (dst / fname).write_text(text.replace(old, new), encoding="utf-8")


def f32_to(path: Path, x, rate: int, ch: int) -> Path:
    """float のまま wav に書く（16bit では −135dB の床が 0 に丸まり、mp3 の頭と違うものになる）。"""
    import numpy as np
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(rate),
                    "-ac", str(ch), "-i", "-", "-c:a", "pcm_f32le", str(path)],
                   input=np.ascontiguousarray(x, dtype="<f4").tobytes(), check=True)
    return path


def make_assets(d: Path) -> None:
    import numpy as np
    rng = np.random.default_rng(1011)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=0x808080:s=180x320:r=30", "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(d / "src.mp4")], check=True)
    # 声: 200Hz と倍音を 4Hz で揺らしたもの 0.8秒（話している間の RMS は書き出しが −16dBFS に揃える）
    t = np.arange(int(0.8 * SR)) / SR
    v = (np.sin(2 * np.pi * 200 * t) + 0.5 * np.sin(2 * np.pi * 400 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 4 * t))
    f32_to(d / "voice.wav", (0.2 * v)[:, None], SR, 1)
    rate = 44100

    def chord(sec: float, amp: float):
        tt = np.arange(int(sec * rate)) / rate
        y = amp * (np.sin(2 * np.pi * 262 * tt) + np.sin(2 * np.pi * 330 * tt) + np.sin(2 * np.pi * 392 * tt)) / 3
        return np.stack([y, y], axis=1)

    def floor(sec: float):
        return rng.normal(0, 10 ** (-135 / 20), (int(sec * rate), 2))

    f32_to(d / "bgm_head.wav", np.vstack([floor(1.42), chord(8, 0.5)]), rate, 2)
    f32_to(d / "bgm_now.wav", chord(8, 0.5), rate, 2)
    f32_to(d / "bgm_quiet.wav", np.vstack([chord(1.0, 0.5 * 10 ** (-30 / 20)), chord(8, 0.5)]), rate, 2)
    (d / "st.json").write_text(json.dumps({"extends": "style.json", "avoid_faces": {"enabled": False}}),
                               encoding="utf-8")


def edit_of(d: Path, name: str, last: int, bgm: str = "bgm_head.wav", notes: list | None = None) -> Path:
    """灰色の画2カット（2秒・last コマ）。声は 1.0秒目から（それより前の音は BGM だけ）。"""
    e = {"version": 2, "id": f"selftest-{name}", "style": "st.json", "sources": {"s": {"path": "src.mp4"}},
         "cuts": [{"src": "s", "in": 0, "out": 60}, {"src": "s", "in": 60, "out": 60 + last}],
         "narration": {"engine": "files", "lines": [{"at": 30, "text": "テスト", "caption": "", "file": "voice.wav"}]},
         "bgm": {"path": bgm, "db": 0.0}}
    if notes:
        e["notes"] = notes
    p = d / f"edit_{name}.json"
    p.write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return p


def load(src: Path):
    for name in ("render", "textlook", "flags"):
        sys.modules.pop(name, None)
    sys.path.insert(0, str(src))
    try:
        spec = importlib.util.spec_from_file_location("render", src / "render.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules["render"] = mod
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.path.pop(0)


def db_of(x) -> float:
    import numpy as np
    return 20 * math.log10(max(float(np.sqrt(np.mean(np.asarray(x, dtype=np.float64) ** 2))) if len(x) else 0.0, 1e-12))


def frame_db(x, n: int) -> list[float]:
    spf = SR // FPS
    return [db_of(x[i * spf:(i + 1) * spf]) for i in range(n)]


def plan_of(R, edit: Path, work: Path) -> dict:
    ed, style, base = R.load(edit)
    work.mkdir(parents=True, exist_ok=True)
    return R.plan(ed, style, base, work), style, base


def bgm_stem(R, edit: Path, work: Path) -> tuple[dict, list[float]]:
    import numpy as np
    p, style, base = plan_of(R, edit, work)
    _, bgm_p, _ = R.audio_stems(p, style, base, work)
    b = np.fromfile(bgm_p, dtype="<f4").reshape(-1, 2).mean(axis=1)
    return p, frame_db(b, 21)


# ---------------------------------------------------------------- 足

def leg_trim_head(R, d: Path) -> list[tuple[str, bool]]:
    import numpy as np
    p, fr = bgm_stem(R, edit_of(d, "head", 75), d / "w_head")
    got = p["bgm"].get("head_trim_s")
    mid = float(np.median(fr[2:21]))
    return [(f"頭の無音 1.42秒を測った（head_trim_s {got}）", got is not None and 1.40 <= got <= 1.43),
            (f"BGM の束の0コマ目が鳴っている（{fr[0]:.1f}dBFS。線 −60）", fr[0] > -60),
            (f"0コマ目が 2〜20コマ目の真ん中 {mid:.1f}dB から 8dB 以内（{fr[0] - mid:+.1f}dB）", fr[0] >= mid - 8)]


def leg_no_cut_music(R, d: Path) -> list[tuple[str, bool]]:
    p, fr = bgm_stem(R, edit_of(d, "now", 75, "bgm_now.wav"), d / "w_now")
    got = p["bgm"].get("head_trim_s")
    return [(f"頭から鳴っている曲は削らない（head_trim_s {got}）", got == 0)]


def leg_quiet_intro(R, d: Path) -> list[tuple[str, bool]]:
    p, fr = bgm_stem(R, edit_of(d, "quiet", 75, "bgm_quiet.wav"), d / "w_quiet")
    got = p["bgm"].get("head_trim_s")
    return [(f"本体より 30dB 小さい前奏を無音と読まない（head_trim_s {got}）", got == 0)]


def ctas(p: dict) -> list[dict]:
    return [n for n in p["notes"] if n["text"] == CTA]


def leg_cta_last_cut(R, d: Path) -> list[tuple[str, bool]]:
    p, _, _ = plan_of(R, edit_of(d, "c25", 75), d / "w_c25")
    c = ctas(p)
    out = [(f"終わりの札がちょうど1つ（{len(c)}）", len(c) == 1)]
    if len(c) == 1:
        out.append((f"最後のカットの頭（{p['cuts'][-1]['at']}）から終わり（{p['frames']}）まで"
                    f"（{c[0]['from']}〜{c[0]['to']}）", (c[0]["from"], c[0]["to"]) == (p["cuts"][-1]["at"], p["frames"])))
    return out


def leg_cta_short_last_cut(R, d: Path) -> list[tuple[str, bool]]:
    p, _, _ = plan_of(R, edit_of(d, "c10", 30), d / "w_c10")
    c = ctas(p)
    out = [(f"終わりの札がちょうど1つ（{len(c)}）", len(c) == 1)]
    if len(c) == 1:
        want = p["frames"] - 2 * FPS
        out.append((f"最後のカットが1秒でも、終わりの2秒前（{want}）から出す（{c[0]['from']}〜{c[0]['to']}）",
                    (c[0]["from"], c[0]["to"]) == (want, p["frames"])))
    return out


def leg_cta_replaces(R, d: Path) -> list[tuple[str, bool]]:
    p, _, _ = plan_of(R, edit_of(d, "old", 75, notes=[{"from": 60, "to": 135, "text": OLD}]), d / "w_old")
    texts = [n["text"] for n in p["notes"]]
    out = [(f"「{OLD}」を外して CTA だけにした（{texts}）", texts == [CTA])]
    p2, _, _ = plan_of(R, edit_of(d, "dup", 75, notes=[{"from": 70, "to": 135, "text": CTA}]), d / "w_dup")
    t2 = [(n["text"], n["from"]) for n in p2["notes"]]
    out.append((f"指示書に CTA があれば足さない（{t2}）", t2 == [(CTA, 70)]))
    return out


def leg_stack(R, d: Path) -> list[tuple[str, bool]]:
    p, style, _ = plan_of(R, edit_of(d, "stk", 75, notes=[{"from": 60, "to": 135, "text": "※音は別録り"}]),
                          d / "w_stk")
    R.layout(p, style, d / "w_stk")
    ns = p["notes"]
    out = [(f"終わりの注が2つ（{[n['text'] for n in ns]}）", len(ns) == 2 and CTA in [n["text"] for n in ns])]
    if len(ns) == 2:
        a, b = sorted(ns, key=lambda n: n["y"])
        out.append((f"2つの札が縦に重ならない（{a['y']}〜{a['y'] + a['h']} と {b['y']}〜{b['y'] + b['h']}）",
                    a["y"] + a["h"] <= b["y"]))
    return out


def leg_e2e(R, d: Path) -> list[tuple[str, bool]]:
    """本物の書き出し（下書き）を回して、mp4 の頭の音と最後のコマの札を見る。"""
    import numpy as np
    edit = edit_of(d, "e2e", 75)
    mp4, work = d / "e2e.mp4", d / "e2e.work"
    r = subprocess.run([sys.executable, str(Path(R.__file__)), str(edit), "--draft", "--out", str(mp4),
                        "--work", str(work)], capture_output=True, text=True, timeout=300)
    if r.returncode != 0 or not mp4.is_file():
        return [(f"書き出しが落ちた（{r.returncode}）: {(r.stderr or '')[-300:]}", False)]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-t", "0.7", "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    fr = frame_db(np.frombuffer(raw, dtype="<f4"), 21)
    mid = float(np.median(fr[2:21]))
    out = [(f"mp4 の0コマ目に音がある（{fr[0]:.1f}dBFS。線 −60）", fr[0] > -60),
           (f"0コマ目が 2〜20コマ目の真ん中 {mid:.1f}dB から 10dB 以内（{fr[0] - mid:+.1f}dB）", fr[0] >= mid - 10)]
    plan = json.loads((work / "plan.json").read_text(encoding="utf-8"))
    c = [n for n in plan["notes"] if n["text"] == CTA]
    out.append((f"時間割に終わりの札（{len(c)}）", len(c) == 1))
    if len(c) != 1:
        return out
    n = c[0]
    W, H = plan["size"][0] // 2, plan["size"][1] // 2
    last = plan["frames"] - 1
    pix = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-vf", f"select=eq(n\\,15)+eq(n\\,{last})",
                          "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         check=True, capture_output=True).stdout
    a = np.frombuffer(pix, dtype=np.uint8).reshape(-1, H, W)
    if len(a) != 2:
        return out + [(f"コマが取れない（{len(a)}）", False)]
    x0, y0, x1, y1 = n["x"] // 2, n["y"] // 2, (n["x"] + n["w"]) // 2, (n["y"] + n["h"]) // 2
    before, after = float(a[0, y0:y1, x0:x1].mean()), float(a[1, y0:y1, x0:x1].mean())
    out.append((f"最後のコマの札の箱が、札の出る前より暗い（{before:.0f} → {after:.0f}）", before - after > 25))
    return out


LEGS = {
    "trim_head": leg_trim_head,
    "no_cut_music": leg_no_cut_music,
    "quiet_intro": leg_quiet_intro,
    "cta_last_cut": leg_cta_last_cut,
    "cta_short_last_cut": leg_cta_short_last_cut,
    "cta_replaces": leg_cta_replaces,
    "stack": leg_stack,
    "e2e": leg_e2e,
}


def run_legs(src: Path, d: Path) -> tuple[list[str], int]:
    R = load(src)
    failed, checked = [], 0
    for name, fn in LEGS.items():
        try:
            res = fn(R, d)
        except SystemExit as e:
            res = [(f"途中で止まった: {e.code}", False)]
        except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
            res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        print(f"[{name}]")
        for what, ok in res:
            print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def child(name: str | None) -> int:
    """写し（守りを1つ外すならそれ）で足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        fd = fonts_dir(box)
        if fd is None:
            print("✕ 回せない: 書体が1つも無い（tools/shorts/render/fetch_fonts.sh か、fonts-dejavu-core）")
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        src = box / "render"
        src.mkdir()
        make_src(src, name)
        d = box / "case"
        d.mkdir()
        make_assets(d)
        failed, checked = run_legs(src, d)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
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
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow・opencv-python-headless・budoux が要る）")
        return 2
    if shutil.which("ffmpeg") is None:
        print("✕ 回せない: ffmpeg が無い")
        return 2
    if BREAK:
        return child(BREAK)
    rc = child(None)
    print()
    bad = drill()
    print()
    if rc == 2:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if rc or bad:
        if rc:
            print("✕ 本物で落ちた足がある（上の ✕）")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
