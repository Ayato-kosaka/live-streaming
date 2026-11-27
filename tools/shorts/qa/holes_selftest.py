"""**本編集の担当が回り道でしのいだ道具の穴（2026-11-27）が、塞がったままか。** 書き出しも ffmpeg も検査役も使わない。

    python3 tools/shorts/qa/holes_selftest.py
    BREAK=heading python3 tools/shorts/qa/holes_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。台は `tools/shorts/feedback/legs.py`。
指示書の組み立て（`build_edit.py`）の側の穴（見出しの札を消さない・島の画面の窓・行の種類とカットの種類）は `tools/shorts/plan/build_edit_selftest.py`。

| 足 | 確かめること |
| --- | --- |
| `heading` | 字の重なり（`text_dup`）は、段の見出しの札（「1. 1階は雑貨」）が同じときの字幕「1階は雑貨やった」と重なっても落とさない。番号の無いテロップ「1階は雑貨」は今までどおり言い直しで落とす |
| `island_art` | 絵の窓の種類（`art_clips.py` の KINDS）に `island`（あやと島の画面）が在り、止め絵の検査（`still.py` の ART_KINDS）と同じ並び。画と言葉の検査（`scene.py`）は、台帳の印が island の窓を島の画面（`island`）と読む |
| `footage_frames` | 画と言葉の検査は、撮影の素材のカット（`footage`）のコマを、手元の私有の置き場の作業用（`SHORTS_FOOTAGE_DIR/<ID>.mp4`）から読む |
| `noframe` | コマを渡さずに得た答え（`frames` 0）は、控えから読んでも・指示書に押してあっても数えず（not-checkable）、控えにも指示書にも書かない |

`common.py` は numpy を読み込むが、ここで使う関数は numpy を使わない。Selftests（numpy を入れない）でも回るように、無ければ空の
numpy を置く（ここでは画素を1つも読まない）。
"""
from __future__ import annotations

import ast
import contextlib
import io
import json
import os
import sys
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools/shorts/feedback"))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools/shorts/render"))
import legs  # noqa: E402

try:
    import numpy  # noqa: F401
except ImportError:
    sys.modules["numpy"] = types.ModuleType("numpy")

CUTS = {
    "heading": ("textdup.py", '    telops = [i for i in its if i["kind"] == "telop" and i not in heads]\n',
                '    telops = [i for i in its if i["kind"] == "telop"]\n', {"heading"}, "見出しの札も言い直しに数える（前の形）"),
    "heading_form": ("textdup.py", 'HEADING = re.compile(r"^\\s*[0-9０-９]+\\s*[.．、:：)）]")', 'HEADING = re.compile(r"(?!)")', {"heading"},
                     "番号つきのテロップを見出しと読まない"),
    "art_island": ("art_clips.py", 'KINDS = ("generated", "free", "card", "island")', 'KINDS = ("generated", "free", "card")', {"island_art"},
                   "絵の窓の種類に島の画面が無い（前の形。free で作って overrides に kind を書く回り道）"),
    "still_island": ("still.py", 'ART_KINDS = ("generated", "free", "card", "island")', 'ART_KINDS = ("generated", "free", "card")',
                     {"island_art"}, "止め絵の検査が、島の画面の窓を絵の窓と読まない"),
    "scene_island": ("scene.py", 'ART_KIND = {"card": "card", "free": "stock", "island": "island"}', 'ART_KIND = {"card": "card", "free": "stock"}',
                     {"island_art"}, "画と言葉の検査が、島の画面の窓を描いた絵（art）と読む"),
    "footage_path": ("scene.py", '                                (footage_file(c["footage"]) if c.get("footage") else None, c["in"], 1)):\n',
                     "                                ):\n", {"footage_frames"}, "撮影の素材のコマを読まない（前の形）"),
    "noframe_read": ("scene.py", "        v = {k: a for k, a in (v.items() if isinstance(v, dict) else []) if with_frames(k, a)}\n", "",
                     {"noframe"}, "控えのコマの無い答えを数える"),
    "noframe_stamp": ("scene.py", "        if key in v and with_frames(key, v[key]):   # コマの無い答えは指示書に押さない\n",
                      "        if key in v:\n", {"noframe"}, "コマの無い答えを指示書に押す"),
    "noframe_save": ("scene.py", "    v = {k: a for k, a in v.items() if with_frames(k, a)}   # コマの無い答えは控えに残さない\n", "",
                     {"noframe"}, "コマの無い答えを控えに書く"),
    "noframe_cut": ("scene.py", " and with_frames(st[\"key\"], st):", ":", {"noframe"}, "指示書に押してあったコマの無い答えを数える"),
}

FILES = {"textdup.py": HERE / "textdup.py", "scene.py": HERE / "scene.py", "art_clips.py": ROOT / "tools/shorts/render/art_clips.py",
         "still.py": HERE / "still.py"}


def _const(text: str, name: str):
    for node in ast.parse(text).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    return None


def setup(cut):
    c = CUTS[cut] if cut else None
    mods = types.SimpleNamespace()
    for name in ("textdup.py", "scene.py", "art_clips.py"):
        mod = legs.load(FILES[name], name[:-3], (c[1], c[2]) if c and c[0] == name else None)
        setattr(mods, name[:-3], mod)
    still = FILES["still.py"].read_text(encoding="utf-8")   # still.py は stutter（OpenCV）を読み込むので、字で読む
    if c and c[0] == "still.py":
        still = still.replace(c[1], c[2])
    mods.still_kinds = _const(still, "ART_KINDS")
    return mods


def _ctx(M, plan, box: Path, name: str):
    from common import Ctx
    return Ctx(mp4=box / f"{name}.json", work=None, style={}, out_dir=box / name, plan=plan, fps=30)


def leg_heading(M):
    def plan(telop):
        return {"fps": 30, "frames": 90, "titles": [], "captions": [{"from": 0, "to": 90, "lines": ["1階は雑貨やった"]}],
                "telops": [{"from": 0, "to": 90, "text": telop}]}
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        head = M.textdup.check(_ctx(M, plan("1. 1階は雑貨"), box, "h"))
        bare = M.textdup.check(_ctx(M, plan("1階は雑貨"), box, "b"))
    return [(f"見出しの札「1. 1階は雑貨」は、字幕と重なっても落とさない（{head['status']}）",
             head["status"] == "pass" and (head.get("measured") or {}).get("headings") == 1),
            (f"番号の無いテロップ「1階は雑貨」は言い直しで落とす（{bare['status']}）", bare["status"] == "fail")]


def leg_island_art(M):
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / "index.json").write_text(json.dumps({"video": "artIsland01", "art": True,
                                                  "clips": [{"n": 1, "file": "01_guide.mp4", "art": "island"}]}), encoding="utf-8")
        got = M.scene.cut_kind({"path": str(d / "01_guide.mp4")})
    kinds = tuple(M.art_clips.KINDS)
    return [(f"絵の窓の種類に island が在る（{kinds}）", "island" in kinds),
            (f"止め絵の検査の ART_KINDS（{M.still_kinds}）が art_clips.py の KINDS と同じ並び", tuple(M.still_kinds or ()) == kinds),
            (f"台帳の印が island の窓を、画と言葉の検査が island と読む（{got}）", got == "island")]


def _cut_plan(fid: str = "ffhole0001"):
    return {"fps": 30, "frames": 60, "cuts": [{"src": "f", "footage": fid, "video": f"footage:{fid}", "in": 30, "out": 90, "at": 0,
                                               "frames": 60, "row": 0, "shows": "白い吹き抜けの本屋", "kind": "footage"}],
            "narration": [{"at": 0, "text": "中に入ると、白い吹き抜け！"}], "titles": [], "telops": [], "notes": []}


def leg_footage_frames(M):
    seen = []
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / "ffhole0001.mp4").write_bytes(b"\0")
        saved_env, saved_fb = os.environ.get("SHORTS_FOOTAGE_DIR"), M.scene._frame_bytes
        os.environ["SHORTS_FOOTAGE_DIR"] = str(d)
        M.scene._frame_bytes = lambda path, t: (seen.append((Path(path).name, round(t, 2))) or b"jpeg")
        try:
            got = M.scene.cut_frames(_ctx(M, _cut_plan(), d, "f"), 0)
        finally:
            M.scene._frame_bytes = saved_fb
            if saved_env is None:
                os.environ.pop("SHORTS_FOOTAGE_DIR", None)
            else:
                os.environ["SHORTS_FOOTAGE_DIR"] = saved_env
    return [(f"撮影の素材のカットのコマを作業用から読む（{seen}）", len(got) == 2 and {n for n, _ in seen} == {"ffhole0001.mp4"}),
            ("入りのコマ（30）からの秒で読む", [t for _, t in seen] == [round((30 + 60 / 3) / 30, 2), round((30 + 120 / 3) / 30, 2)])]


def leg_noframe(M):
    out = []
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        plan = _cut_plan("ffnone0001")
        ver = d / "v.json"
        os.environ["SHORTS_SCENE_VERDICTS"] = str(ver)
        os.environ["SHORTS_SCENE_JUDGE"] = "0"
        saved = M.scene.JUDGE
        M.scene.JUDGE = None
        try:
            key = M.scene.item_key(plan, M.scene.rows(plan), 0)
            bare = {"related": True, "shows_true": True, "selfie": False, "frames": 0, "why": "コマ無し"}
            ver.write_text(json.dumps({key: bare}), encoding="utf-8")
            r1 = M.scene.check_scene_match(_ctx(M, plan, d, "a"))
            out.append((f"控えのコマの無い答えは数えない（{r1['status']}）", r1["status"] == "not-checkable"))
            stamped = json.loads(json.dumps(plan))
            stamped["cuts"][0]["scene"] = {"key": key, **bare}
            ver.write_text("{}", encoding="utf-8")
            r2 = M.scene.check_scene_match(_ctx(M, stamped, d, "b"))
            out.append((f"指示書に押してあったコマの無い答えも数えない（{r2['status']}）", r2["status"] == "not-checkable"))
            ctx = _ctx(M, plan, d, "c")
            M.scene.save_verdicts(ctx, {key: bare, "h:0000": {"names_content": True, "why": "見出し"}})
            kept = json.loads(ver.read_text(encoding="utf-8"))
            out.append((f"控えに書くとき、コマの無いカットの答えを落とす（見出しの答えは残す。{sorted(kept)}）", sorted(kept) == ["h:0000"]))
            edit = {"meta": {"fps": 30}, "sources": {"f": {"footage": "ffnone0001"}}, "narration": {"lines": plan["narration"]},
                    "cuts": [{"src": "f", "in": 30, "out": 90, "row": 0, "shows": "白い吹き抜けの本屋", "kind": "footage"}]}
            ep = d / "edit.json"
            ep.write_text(json.dumps(edit, ensure_ascii=False), encoding="utf-8")
            ctx2 = M.scene.edit_ctx(ep, out_dir=d / "e")
            ctx2._cache["scene_verdicts"] = {M.scene.item_key(ctx2.plan, M.scene.rows(ctx2.plan), 0): bare}
            with contextlib.redirect_stderr(io.StringIO()):
                n = M.scene.stamp(ep, ctx2)
            after = json.loads(ep.read_text(encoding="utf-8"))
            out.append((f"コマの無い答えは指示書に押さない（押した {n} 件）", n == 0 and "scene" not in after["cuts"][0]))
        finally:
            M.scene.JUDGE = saved
            os.environ.pop("SHORTS_SCENE_VERDICTS", None)
            os.environ.pop("SHORTS_SCENE_JUDGE", None)
    return out


LEGS = {"heading": leg_heading, "island_art": leg_island_art, "footage_frames": leg_footage_frames, "noframe": leg_noframe}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
