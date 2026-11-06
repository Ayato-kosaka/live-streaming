"""**対談系の切り抜き（様式の `talk`・帳面 F-065・#1104）の道具が、使わない回は何も変えず、使う回は話し手ごとの字幕の色・
全編の題の札とその1語の色・終わりの1秒の札・行の間なしで組み、品質チェックが対談系に当てない検査だけを対象外にするか。**

    python3 tools/shorts/render/talk_selftest.py
    BREAK=draw python3 tools/shorts/render/talk_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

要るのは ffmpeg・numpy・Pillow・OpenCV・budoux（書き出しそのもの）。Selftests には無いので、回し役
（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す
（`live_badge_selftest.py` と同じ形）。書体は本物（`fetch_fonts.sh`）が無ければ、箱にある書体を同じ名前で置く。

## 何を見るか

本物の `render.py`・`talk.py`・`build_edit.py`・`qa/check.py` と様式（いまの本番の `style_v3.json` に、顔よけだけ切ったもの）を
写して回す。素材は ffmpeg で作る（灰色の画・300Hz の音）。

| 足 | 確かめること |
| --- | --- |
| `off_default` | 様式のまま（`talk.enabled: false`）・指示書に新しい印が無い回は、字の絵（PNG のバイト）と置き場・時間割が、様式から `talk` を丸ごと消した版と全部同じ。字幕にも題にも `speaker`・`hl` が無い。終わりの札は最後のカットの頭から |
| `speaker` | 話し手 A（黄）・W（水色）・印なしの3行: 字幕の絵の字の画素が、それぞれ黄・水色・白。A・W の字に白いふち（塗りと同じ色だった細い縁）が残らない。黒い縁は残る |
| `strict` | 印を書いたのに様式が対談系でない（`enabled: false`。色は書いてある）・様式に無い印・【大】の行に印 → どれも書き出さずに止まる |
| `title_hl` | 題の札の「歩きました」だけ色: 絵の大きさは色なしと同じ（強調の大きさ 1.2 を様式に書いても、札では大きくしない）・色の画素が出る・色なしでは出ない・題に無い語は止まる |
| `end_last` | 様式の `end_note.last_s: 1.0` で、終わりの札が最後の30コマだけ。書かなければ最後のカットの頭から |
| `build_edit` | spec の `speaker`・`title_card_full`・`title_card_highlight`、overrides の `views`（帯と寄りの切り出し）と `--gap 0 --tail 0`: 指示書の声の行に `speaker`・題の札が0コマ目から最後まで（`line` 無し）・`title.highlight`・帯と寄りが別の素材の名前（`c01@band`・`c01@A`）で別の `crop` とカットの `fit`・尺は元の声の区間の和そのもの。書かない spec と既定の引数では、`speaker` も `highlight` も無く、素材は窓の名前のまま（`crop`・`fit` 無し）、題の札は頭（1行目の終わり）まで・行の間 0.25秒と末尾 0.5秒 |
| `qa` | 品質チェック: 5秒の1カットの下書きを、様式のまま回すと `cut_length` が落ちる（対象外にしない）。`talk.enabled` なら `cut_length`・`similar_run`・`voice_vs_bgm` が対象外（合格。当てた場合の判定と要約を measured に残す）。時間割に BGM があれば `voice_vs_bgm` は対象外にしない |

**使わない回が書き出しで1バイトも変わらないこと**は、本番の素材で確かめた（2026-11-06、ワルテミスさんとの対談の素材。
対談系の印を全部外した spec を入れる前（c2ca7051）と後の build_edit で組んで指示書が同じ sha256 `0cd4b97d…`、その頭2行を
本番の段で書き出して mp4 が同じ sha256 `5e77b424…`。`shorts/videos/LxrbXwHssF0/p1/qa_C.md`）。ここでは時間割と字の絵で当てる
（下書きの x264 はコマ単位の並列でバイト一致を求めないので、mp4 のバイトでは当てない）。

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import copy
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
FPS = 30
YELLOW, BLUE = "#F9D342", "#7FD8FF"
TITLE = "『歩きました』じゃないんですよ\n偏見をなくしたくて"

# 名前: (置き場からの道, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "default_on": ("render/style.json", "    \"enabled\": false,\n    \"speakers\": {}\n",
                   "    \"enabled\": true,\n    \"speakers\": {}\n",
                   {"off_default", "qa"}, "既定を「対談系」にする（対談系の前の回まで、3秒のカットの検査が外れる）"),
    "end_default": ("render/style.json", "    \"min_s\": 2.0\n  },\n  \"live_badge\"",
                    "    \"min_s\": 2.0,\n    \"last_s\": 1.0\n  },\n  \"live_badge\"",
                    {"off_default", "end_last"}, "終わりの札を、既定で最後の1秒だけにする（対談系の前の回の札が短くなる）"),
    "gate": ("render/talk.py", "    if not tk.get(\"enabled\"):\n        return None\n", "",
             {"strict"}, "様式の enabled を見ずに、話し手の色を使う"),
    "unknown": ("render/talk.py", "    if not sp or not sp.get(\"fill\"):\n", "    if False:\n",
                {"strict"}, "様式に無い話し手の印でも止まらない"),
    "rim": ("render/talk.py", "                    o[\"color\"] = fill\n", "                    pass\n",
            {"speaker"}, "塗りと同じ色だった細い縁を、話し手の色にしない（色の字に白いふちが残る）"),
    "draw": ("render/render.py", "            c_st = TK.caption_style(cap_st, style, it.get(\"speaker\"))\n",
             "            c_st = cap_st\n", {"speaker"}, "字幕を描くときに話し手の色を使わない"),
    "carry": ("render/render.py", "            if spk is not None:\n                cap[\"speaker\"] = spk\n", "",
              {"speaker"}, "声の行の話し手の印を、字幕まで運ばない"),
    "strict_big": ("render/render.py", "        if spk is not None and (big or ment or ln.get(\"parts\")):\n",
                   "        if False:\n", {"strict"}, "【大】の行の話し手の印でも止まらない"),
    "title_plan": ("render/render.py", "            ti[\"hl\"] = [str(h) for h in title[\"highlight\"]]\n",
                   "            pass\n", {"title_hl"}, "指示書の title.highlight を時間割に運ばない"),
    "title_pass": ("render/render.py", "style, drawn, hl=it.get(\"hl\"))\n", "style, drawn)\n",
                   {"title_hl"}, "題の札を描くときに、色を変える語を渡さない"),
    "title_scale": ("render/render.py", "\"fill\": \"#F9D342\"}), \"scale\": 1.0}\n", "\"fill\": \"#F9D342\"})}\n",
                    {"title_hl"}, "題の札の強調で字を大きくする（札の幅で決めた大きさが崩れる）"),
    "title_missing": ("render/render.py", "    if hl and not hit[0]:\n", "    if False:\n",
                      {"title_hl"}, "題に無い語を色を変える語に書いても止まらない"),
    "last_s": ("render/render.py", "    if cfg.get(\"last_s\"):\n", "    if False:\n",
               {"end_last"}, "end_note.last_s を見ない（対談系の札が、最後のカットの頭から出る）"),
    "be_speaker": ("plan/build_edit.py", "            lines[i][\"speaker\"] = str(r[\"speaker\"])\n", "            pass\n",
                   {"build_edit"}, "spec の話し手の印を、指示書の声の行に運ばない"),
    "be_full": ("plan/build_edit.py", "        edit[\"title\"] = {\"text\": title, \"look\": \"card\", \"from\": 0, \"to\": t}\n",
                "        edit[\"title\"] = {\"text\": title, \"look\": \"card\", \"from\": 0, \"to\": round(4.0 * FPS)}\n",
                {"build_edit"}, "title_card_full でも、題の札を頭の4秒で消す"),
    "be_hl": ("plan/build_edit.py",
              "        edit[\"title\"][\"highlight\"] = [str(h) for h in spec[\"title_card_highlight\"]]\n",
              "        pass\n", {"build_edit"}, "spec の title_card_highlight を、指示書の題に運ばない"),
    "be_view": ("plan/build_edit.py", "                key = f\"{key}@{vname}\"\n", "",
                {"build_edit"}, "views の帯と寄りを、同じ素材の名前に入れる（あとの切り出しが前の切り出しに負ける）"),
    "be_fit": ("plan/build_edit.py", "                cut[\"fit\"] = views[vname][\"fit\"]\n", "                pass\n",
               {"build_edit"}, "views の fit をカットに書かない（寄りが帯と同じ収めかたになる）"),
    "be_gap": ("plan/build_edit.py", "    n = voice_frames + round((args.gap + hold) * FPS) + pre\n",
               "    n = voice_frames + round((GAP_S + hold) * FPS) + pre\n",
               {"build_edit"}, "--gap を見ずに、行の間を 0.25秒のまま足す"),
    "qa_gate": ("qa/check.py", "    if not tk.get(\"enabled\"):\n        return {}\n", "",
                {"qa"}, "様式の enabled を見ずに、対談系の対象外を当てる"),
    "qa_bgm": ("qa/check.py", "        out.pop(\"voice_vs_bgm\")\n", "        pass\n",
               {"qa"}, "BGM のある対談系の回でも、声と BGM の差を対象外にする"),
    "qa_apply": ("qa/check.py", "        if cid in ex:\n            r = exempted(r, ex[cid])\n", "",
                 {"qa"}, "対象外の検査を、当てたときの判定のまま返す"),
    "qa_keep": ("qa/check.py", "\"status_if_applied\": r[\"status\"], ", "",
                {"qa"}, "対象外にした検査の、当てた場合の判定を残さない（黙って外す）"),
}


# ---------------------------------------------------------------- 道具と素材の用意

def fonts_dir(box: Path) -> Path | None:
    """本物の書体（fetch_fonts.sh）が無ければ、箱の太字を M PLUS の名前で置く（live_badge_selftest.py と同じ）。"""
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf", "DelaGothicOne-Regular.ttf"]
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


def make_src(top: Path, cut: str | None) -> None:
    """本物の render/・qa/・plan/ を top の下に写す（守りを1つ外すなら、その字だけ書き換える）。"""
    render = top / "render"
    render.mkdir()
    for p in HERE.glob("*.py"):
        shutil.copy(p, render / p.name)
    for p in HERE.glob("*.json"):
        shutil.copy(p, render / p.name)
    shutil.copytree(HERE / "flags", render / "flags")
    shutil.copytree(HERE.parent / "qa", top / "qa", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(HERE.parent / "plan", top / "plan", ignore=shutil.ignore_patterns("__pycache__"))
    if cut:
        rel, old, new, _, _ = CUTS[cut]
        text = (top / rel).read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {rel} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        (top / rel).write_text(text.replace(old, new), encoding="utf-8")


def make_assets(d: Path) -> None:
    # 灰色の画と 300Hz の音（元の声の行の音を切り出す相手）。窓は元動画の 100〜110秒
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "color=c=0x808080:s=180x320:r=30",
                    "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=48000",
                    "-t", "10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(d / "src.mp4")], check=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(d / "src.mp4"),
                    "-t", "0.8", "-vn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", str(d / "voice.wav")], check=True)
    (d / "index.json").write_text(json.dumps({"video": "TESTvid0001", "clips": [
        {"n": 1, "start": 100.0, "end": 110.0, "file": "src.mp4", "ok": True}]}), encoding="utf-8")
    base = {"extends": "style_v3.json", "avoid_faces": {"enabled": False}}
    talk = {"enabled": True, "speakers": {"A": {"fill": YELLOW}, "W": {"fill": BLUE}}}
    # 題の札は2行とも白（対談系の回の様式と同じ）。強調の大きさ 1.2 は、札では効かないことを確かめるため
    white = {"font": "caption", "size": 82, "min_size": 52,
             "look": {"fill": "#FDFDFD", "outline": [{"color": "#FDFDFD", "width": 0.75},
                                                     {"color": "#000000", "width_em": 0.055}], "tracking": -0.04}}
    card = {"lines": [white, white], "highlight": {"fill": YELLOW, "scale": 1.2}}
    styles = {
        "st_off.json": base,
        "st_talk.json": {**base, "talk": talk, "title_card": card},
        # 色は書いてあるが、対談系ではない（enabled: false）
        "st_notalk.json": {**base, "talk": {**talk, "enabled": False}},
        "st_last.json": {**base, "end_note": {"last_s": 1.0}},
    }
    for name, st in styles.items():
        (d / name).write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")


def edit_of(d: Path, name: str, style: str, lines: list[dict], title: dict | None = None,
            cuts: list[tuple[int, int]] | None = None) -> Path:
    e = {"version": 2, "id": f"selftest-{name}", "style": style, "sources": {"s": {"path": "src.mp4"}},
         "cuts": [{"src": "s", "in": a, "out": b} for a, b in (cuts or [(0, 60), (60, 135)])],
         "title": title or {"text": "🇬🇪ジョージアの野良犬", "look": "card", "from": 0, "to": 50, "line": 0},
         "narration": {"engine": "files", "lines": lines}}
    p = d / f"edit_{name}.json"
    p.write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return p


LINES = [{"at": 0, "text": "ジョージアに来たら", "caption": "", "file": "voice.wav"},
         {"at": 60, "text": "首都の大通りでも寝てる", "file": "voice.wav"}]


def load(src: Path):
    for name in ("render", "textlook", "flags", "live_badge", "orig_voice", "talk"):
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


def laid(R, d: Path, name: str, style: str | dict, lines: list[dict] | None = None, title: dict | None = None):
    """時間割を作り、字を置く（顔は探さない）。style は様式のファイル名か、様式そのもの。"""
    ed, st, base = R.load(edit_of(d, name, style if isinstance(style, str) else "st_off.json", lines or LINES, title))
    if isinstance(style, dict):
        st = style
    work = d / f"w_{name}"
    work.mkdir(parents=True, exist_ok=True)
    p = R.plan(ed, st, base, work)
    layers = R.layout(p, st, work)
    return p, st, layers


def sig(layers) -> list:
    out = []
    for ly in layers:
        it = ly["item"]
        img = ly["imgs"][0] if ly.get("imgs") else ly["base"]
        out.append((ly["kind"], it.get("from"), it.get("to"), it.get("x"), it.get("y"), img.size, img.tobytes()))
    return out


def plan_sig(p: dict) -> str:
    """時間割の、字と置き場の全部（絵の置き場の道 png は作業の置き場ごとに違うので外す。絵そのものは sig で比べる）。"""
    def strip(x):
        if isinstance(x, dict):
            return {k: strip(v) for k, v in x.items() if k != "png"}
        if isinstance(x, list):
            return [strip(v) for v in x]
        return x
    keep = {k: strip(p[k]) for k in ("frames", "cuts", "captions", "titles", "notes", "telops")}
    return json.dumps(keep, sort_keys=True, ensure_ascii=False, default=str)


def ink(png: str, rgb: str) -> tuple[int, int, int]:
    """字の絵の、色 rgb に近い画素・白が混ざった画素・黒い画素の数（濃さが 250 以上の所だけ）。

    白が混ざった画素は、rgb のいちばん低い成分が 50 以上持ち上がり、明るさも rgb より 40 以上明るい所
    （黄なら青、水色なら赤が持ち上がる。塗りと同じ色だった 0.75px の縁を白のまま残すと、縮めたあとの
    字のふちがこうなる。真っ白（240 以上）は1〜3画素しか出ないので、それでは数えられない）。
    """
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(png).convert("RGBA")).astype(int)
    solid = a[:, :, 3] >= 250
    c = a[:, :, :3]
    want = np.array([int(rgb[1:3], 16), int(rgb[3:5], 16), int(rgb[5:7], 16)])
    near = (np.abs(c - want).max(axis=2) <= 24) & solid
    low = int(np.argmin(want))
    lift = (c[:, :, low] >= want[low] + 50) & (c.sum(axis=2) >= want.sum() + 40) & solid
    black = (c.max(axis=2) <= 40) & solid
    return int(near.sum()), int(lift.sum()), int(black.sum())


def white_px(png: str) -> int:
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(png).convert("RGBA")).astype(int)
    return int(((a[:, :, :3].min(axis=2) >= 240) & (a[:, :, 3] >= 250)).sum())


def stops(fn):
    """fn() が書き出さずに止まる（SystemExit）か。止まらなければ None、止まればその字。"""
    try:
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            fn()
    except SystemExit as e:
        return str(e.code)
    return None


# ---------------------------------------------------------------- 足

def leg_off_default(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    p, st, layers = laid(R, d, "off", "st_off.json")
    st2 = json.loads(json.dumps(st))
    st2.pop("talk", None)
    p2, _, layers2 = laid(R, d, "nokey", st2)
    caps = p["captions"]
    end = [n for n in p["notes"] if n.get("end_note")]
    return [(f"様式のまま（talk.enabled: {st.get('talk', {}).get('enabled')}）", (st.get("talk") or {}).get("enabled") is False),
            (f"様式から talk を消した版と、字の絵と置き場が全部同じ（{len(layers)} 枚）", sig(layers) == sig(layers2)),
            ("時間割（カット・字幕・題・注）も同じ", plan_sig(p) == plan_sig(p2)),
            ("字幕に speaker・題に hl が無い", all("speaker" not in c for c in caps) and all("hl" not in t for t in p["titles"])),
            (f"終わりの札は最後のカットの頭から（{end[0]['from'] if end else None}・欲しいのは 60）",
             bool(end) and end[0]["from"] == 60)]


def leg_speaker(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    lines = [{"at": 0, "text": "危ない目に合わなかったですか", "file": "voice.wav", "speaker": "W"},
             {"at": 45, "text": "国境の検問所に捕らえられて", "file": "voice.wav", "speaker": "A"},
             {"at": 90, "text": "首都の大通りでも寝てる", "file": "voice.wav"}]
    p, st, layers = laid(R, d, "spk", "st_talk.json", lines, {"text": "対談", "look": "card", "from": 0, "to": 10})
    by = {}
    for c in p["captions"]:
        by.setdefault(c["line"], c)
    out = [(f"字幕に話し手の印（{[by.get(k, {}).get('speaker') for k in range(3)]}）",
            [by.get(k, {}).get("speaker") for k in range(3)] == ["W", "A", None])]
    if len(by) < 3 or any("png" not in by[k] for k in range(3)):
        return out + [("3行とも字幕の絵がある", False)]
    w_near, w_lift, w_black = ink(by[0]["png"], BLUE)
    a_near, a_lift, a_black = ink(by[1]["png"], YELLOW)
    n_y = ink(by[2]["png"], YELLOW)[0]
    n_white = white_px(by[2]["png"])
    out += [(f"W の字は水色（{w_near}画素）・白の混ざったふちは塗りの 2% 未満（{w_lift}）・黒い縁は残る（{w_black}）",
             w_near > 800 and w_lift < 0.02 * w_near and w_black > 400),
            (f"A の字は黄（{a_near}画素）・白の混ざったふちは塗りの 2% 未満（{a_lift}）・黒い縁は残る（{a_black}）",
             a_near > 800 and a_lift < 0.02 * a_near and a_black > 400),
            (f"印の無い行は白のまま（白 {n_white}・黄 {n_y}）", n_white > 800 and n_y < 20)]
    return out


def leg_strict(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    spk = [{"at": 0, "text": "危ない目に合わなかったですか", "file": "voice.wav", "speaker": "A"}]
    big = [{"at": 0, "text": "歩きました", "file": "voice.wav", "speaker": "A", "big": "pop"}]
    unk = [{"at": 0, "text": "危ない目に合わなかったですか", "file": "voice.wav", "speaker": "Z"}]
    t = {"text": "対談", "look": "card", "from": 0, "to": 10}
    r1 = stops(lambda: laid(R, d, "s1", "st_notalk.json", spk, t))
    r2 = stops(lambda: laid(R, d, "s2", "st_talk.json", unk, t))
    st = R.load_style("st_talk.json", d)
    look = next(iter(st["big"]["looks"]))
    big[0]["big"] = look
    r3 = stops(lambda: laid(R, d, "s3", "st_talk.json", big, t))
    return [(f"様式が対談系でないのに印 → 止まる（{r1}）", r1 is not None),
            (f"様式に無い印 → 止まる（{r2}）", r2 is not None),
            (f"【大】の行に印 → 止まる（{r3}）", r3 is not None)]


def leg_title_hl(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    t0 = {"text": TITLE, "look": "card", "from": 0, "to": 135}
    t1 = {**t0, "highlight": ["歩きました"]}
    lines = [{"at": 0, "text": "危ない目に合わなかったですか", "file": "voice.wav"}]
    p0, _, _ = laid(R, d, "t0", "st_talk.json", lines, t0)
    p1, _, _ = laid(R, d, "t1", "st_talk.json", lines, t1)
    a, b = p0["titles"][0], p1["titles"][0]
    y0 = ink(a["png"], YELLOW)[0]
    y1 = ink(b["png"], YELLOW)[0]
    miss = stops(lambda: laid(R, d, "t2", "st_talk.json", lines, {**t0, "highlight": ["走りました"]}))
    return [(f"時間割の題に色を変える語（{b.get('hl')}）", b.get("hl") == ["歩きました"]),
            (f"絵の大きさは色なしと同じ（{(a['w'], a['h'])} / {(b['w'], b['h'])}）", (a["w"], a["h"]) == (b["w"], b["h"])),
            (f"色の画素が出る（{y1}）・色なしでは出ない（{y0}）", y1 > 1500 and y0 < 20),
            (f"題に無い語 → 止まる（{miss}）", miss is not None)]


def leg_end_last(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    p, _, _ = laid(R, d, "last", "st_last.json")
    q, _, _ = laid(R, d, "nolast", "st_off.json")
    e1 = [n for n in p["notes"] if n.get("end_note")]
    e0 = [n for n in q["notes"] if n.get("end_note")]
    total = p["frames"]
    return [(f"last_s 1.0 で最後の30コマだけ（{e1[0]['from'] if e1 else None}〜{e1[0]['to'] if e1 else None} / {total}）",
             bool(e1) and (e1[0]["from"], e1[0]["to"]) == (total - 30, total)),
            (f"書かなければ最後のカットの頭から（{e0[0]['from'] if e0 else None}・欲しいのは 60）",
             bool(e0) and e0[0]["from"] == 60)]


def run_build(top: Path, d: Path, spec: dict, name: str, extra: list[str],
              ov: dict | None = None) -> tuple[int, dict | None, str]:
    sp = d / f"spec_{name}.json"
    sp.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    if ov is not None:
        op = d / f"ov_{name}.json"
        op.write_text(json.dumps(ov, ensure_ascii=False), encoding="utf-8")
        extra = [*extra, "--overrides", str(op)]
    out = d / f"built_{name}.json"
    r = subprocess.run([sys.executable, str(top / "plan" / "build_edit.py"), str(sp), "--clips", str(d / "index.json"),
                        "--out", str(out), "--style", "st_talk.json", *extra], capture_output=True, text=True, timeout=300,
                       cwd=str(d))
    if r.returncode != 0 or not out.exists():
        return r.returncode, None, (r.stderr or r.stdout)[-400:]
    return 0, json.loads(out.read_text(encoding="utf-8")), ""


def leg_build_edit(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    rows = [{"line": "危ない目に合わなかったですか", "src": ["0:01:41.0–0:01:43.0"], "orig_voice": True, "speaker": "W"},
            {"line": "国境の検問所に捕らえられて", "src": ["0:01:44.0–0:01:46.5"], "orig_voice": True, "speaker": "A"}]
    talk = {"id": "T", "title_card": TITLE, "title_card_full": True, "title_card_highlight": ["歩きました"], "rows": rows}
    views = {"views": {"band": {"crop": [0, 20, 180, 140], "fit": "blur"}, "A": {"crop": [90, 20, 90, 160], "fit": "cover"}},
             "view_default": "band",
             "rows": {"1": {"cuts": [{"t": "0:01:44.0–0:01:45.0"}, {"t": "0:01:45.0–0:01:46.5", "view": "A"}]}}}
    rc, e, err = run_build(top, d, talk, "talk", ["--gap", "0", "--tail", "0"], views)
    if e is None:
        return [(f"対談系の spec が組めない（{rc}: {err}）", False)]
    total = e["meta"]["frames"]
    ln = e["narration"]["lines"]
    srcs = {c["src"]: (e["sources"][c["src"]].get("crop"), c.get("fit")) for c in e["cuts"]}
    out = [(f"声の行に話し手の印（{[x.get('speaker') for x in ln]}）", [x.get("speaker") for x in ln] == ["W", "A"]),
           (f"views: 帯と寄りが別の素材の名前・切り出し・fit（{srcs}）",
            srcs == {"c01@band": ([0, 20, 180, 140], "blur"), "c01@A": ([90, 20, 90, 160], "cover")}
            and [c["src"] for c in e["cuts"]] == ["c01@band", "c01@band", "c01@A"]),
           (f"尺は元の声の区間の和そのもの（{total}・欲しいのは 60+75）", total == 135),
           (f"題の札が0コマ目から最後まで・line 無し（{ {k: e['title'].get(k) for k in ('look', 'from', 'to', 'line')} }）",
            (e["title"].get("look"), e["title"].get("from"), e["title"].get("to")) == ("card", 0, total)
            and "line" not in e["title"]),
           (f"題の色を変える語（{e['title'].get('highlight')}）", e["title"].get("highlight") == ["歩きました"])]
    plain_rows = [{k: v for k, v in r.items() if k != "speaker"} for r in rows]
    plain_rows[0]["card"] = True
    plain = {"id": "P", "title_card": TITLE, "rows": plain_rows}
    rc, e2, err = run_build(top, d, plain, "plain", [])
    if e2 is None:
        return out + [(f"書かない spec が組めない（{rc}: {err}）", False)]
    t2 = e2["meta"]["frames"]
    out += [("書かない spec: 声の行に speaker が無い・題に highlight が無い",
             all("speaker" not in x for x in e2["narration"]["lines"]) and "highlight" not in e2["title"]),
            (f"views の無い overrides: 素材は窓の名前のまま・切り出しも fit も無い（{sorted(e2['sources'])}）",
             sorted(e2["sources"]) == ["c01"] and "crop" not in e2["sources"]["c01"]
             and all("fit" not in c for c in e2["cuts"])),
            (f"書かない spec: 行の間 0.25秒（8コマ）と末尾 0.5秒（15コマ）を足す（{t2}・欲しいのは 60+8+75+8+15）",
             t2 == 166),
            (f"書かない spec: 題の札は1行目の終わりで消える（to {e2['title'].get('to')}・欲しいのは 68）",
             e2["title"].get("to") == 68)]
    return out


def leg_qa(R, d: Path, top: Path) -> list[tuple[str, bool]]:
    """本物の書き出し（下書き）の 5秒の1カットを、品質チェックの3検査に通す。"""
    edit = edit_of(d, "qa", "st_off.json", [{"at": 0, "text": "首都の大通りでも寝てる", "file": "voice.wav"}],
                   {"text": "対談", "look": "card", "from": 0, "to": 30}, cuts=[(0, 150)])
    mp4, work = d / "qa.mp4", d / "qa.work"
    r = subprocess.run([sys.executable, str(top / "render" / "render.py"), str(edit), "--draft", "--out", str(mp4),
                        "--work", str(work)], capture_output=True, text=True, timeout=300)
    if r.returncode != 0 or not mp4.is_file():
        return [(f"書き出しが落ちた（{r.returncode}）: {(r.stderr or '')[-300:]}", False)]
    code = r"""
import copy, json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import check as C
ctx = C.make_ctx(Path(sys.argv[2]), Path(sys.argv[3]))
only = ["cut_length", "similar_run", "voice_vs_bgm"]
out = {"off": C.run_checks(ctx, only=only)}
st = copy.deepcopy(ctx.style); st["talk"] = {"enabled": True, "speakers": {}}
ctx.style = st
out["talk"] = C.run_checks(ctx, only=only)
ctx.plan = dict(ctx.plan, bgm={"path": "bgm.mp3", "db": 0})
out["talk_bgm"] = C.run_checks(ctx, only=["voice_vs_bgm"])
print(json.dumps(out, default=str))
"""
    q = subprocess.run([sys.executable, "-c", code, str(top / "qa"), str(mp4), str(work)], capture_output=True,
                       text=True, timeout=300)
    try:
        rep = json.loads(q.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return [(f"品質チェックが読めない: {(q.stderr or q.stdout)[-300:]}", False)]
    off = {c["id"]: c for c in rep["off"]["checks"]}
    tk = {c["id"]: c for c in rep["talk"]["checks"]}
    tb = {c["id"]: c for c in rep["talk_bgm"]["checks"]}
    cl = tk.get("cut_length", {})
    ex = (cl.get("measured") or {}).get("exempt") or {}
    return [(f"様式のまま: 5秒の1カットで cut_length が落ちる（{off.get('cut_length', {}).get('status')}）・対象外の印が無い",
             off.get("cut_length", {}).get("status") == "fail"
             and all("exempt" not in (c.get("measured") or {}) for c in off.values())),
            (f"対談系: 3つとも合格（{ {k: v.get('status') for k, v in tk.items()} }）",
             len(tk) == 3 and all(v.get("status") == "pass" for v in tk.values())),
            (f"対談系: 3つとも対象外の印（{ {k: bool((v.get('measured') or {}).get('exempt')) for k, v in tk.items()} }）",
             all((v.get("measured") or {}).get("exempt") for v in tk.values())),
            (f"対談系: cut_length の当てた場合の判定を残す（{ex.get('status_if_applied')}）", ex.get("status_if_applied") == "fail"),
            (f"BGM のある対談系: voice_vs_bgm は対象外にしない（{(tb.get('voice_vs_bgm', {}).get('measured') or {}).get('exempt')}）",
             "voice_vs_bgm" in tb and not (tb["voice_vs_bgm"].get("measured") or {}).get("exempt"))]


LEGS = {
    "off_default": leg_off_default,
    "speaker": leg_speaker,
    "strict": leg_strict,
    "title_hl": leg_title_hl,
    "end_last": leg_end_last,
    "build_edit": leg_build_edit,
    "qa": leg_qa,
}


def run_legs(top: Path, d: Path) -> tuple[list[str], int]:
    R = load(top / "render")
    sys.path.insert(0, str(top / "render"))
    failed, checked = [], 0
    for name, fn in LEGS.items():
        try:
            res = fn(R, d, top)
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
        top = box / "shorts"
        top.mkdir()
        make_src(top, name)
        d = box / "case"
        d.mkdir()
        make_assets(d)
        # 字の絵の置き場（R.load は指示書の隣の様式を読む）。素材も同じ所
        for n in ("style.json", "style_p3.json", "style_v3.json"):
            shutil.copy(top / "render" / n, d / n)
        failed, checked = run_legs(top, d)
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
                           env=dict(os.environ, BREAK=name), timeout=900, check=False)
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
