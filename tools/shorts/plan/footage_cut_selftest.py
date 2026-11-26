"""**撮影の素材のカット・素材の顔のぼかし・仕上げ（札・効果音・窓の帯）を overrides から組む（`build_edit.py`）の見張り。**

    python3 tools/shorts/plan/footage_cut_selftest.py
    BREAK=foot_audio python3 tools/shorts/plan/footage_cut_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。声の測り（`narration_frames`）と
`render.py` は偽物（`build_edit_selftest.py` と同じ作り。字の数 ÷ 毎秒の字数をコマに切り上げる）で、**本物の `build_edit.main()`** を回す。

なぜ: ホットワインの回 D（#1445）までは build_edit が撮影の素材を引けず、担当が組んだあとに印のカットを手で
`{"footage": ID}` に置き換え、顔のぼかし・効果音・窓の帯も手のスクリプトで足していた（ビリヤニの回も札と効果音を）。
組み直すたびに消えるので、道具に入れた。

| 足 | 確かめること |
| --- | --- |
| `same_out` | 新しい欄（撮影の素材の秒・帳面の footage・sfx・stickers・bands・corner_note_to）を使わない回は、**撮影の素材を入れる前の build_edit と1バイトも同じ指示書**（下の `SAME_SHA`。前の版で組んで控えた）。台帳（`--footage`）が無くても組める |
| `footage` | spec の `src`・overrides の `t` の `<ID> <秒>` → `sources` の `f_<ID>` = `{"footage": ID}` だけ（道・透かし・t0 を持たない）・入りは秒×30・カットに `audio_db` を書かない・meta の行に素材の秒。長さを越えるなら前にずらして知らせる・区間の終わりと `until` も上限・「同上」は同じ素材の続きのコマ。台帳に無い ID・`audio_db`・元の声の行に当てる・素材が短すぎる、は止まる |
| `faces` | 撮影の素材のカットに、帳面のその素材の箱（`from_t` が `<ID> <秒>`）のうち掛かるものだけが、作業用のコマ番号でカットの中に切って入る（ほかの素材・掛からない秒の箱は入らない）。配信の窓の箱は撮影の素材に掛からない。検出の記録が無い・作業用が作り直された（sha256 が違う）・通した範囲の外、は止まる。`"faces": false` なら箱を入れず止まらない |
| `finish` | overrides の `sfx`・`stickers` の時（行の頭・行の何本目のカット＋コマ・終わりから・割合・秒）が、組んだ行とカットのコマに付く・相対の道は overrides の置き場から・`bands` は区間に掛かる窓の素材にだけ・行の `corner_note_to` で注を早く消す・同じ材料で2回組むと同じ指示書・知らない時の形は止まる |

## 守りを1つずつ外す

下の `CUTS` が `build_edit.py` の本物の字を1か所だけ書き換えた写しで足を全部回し、**外した守りの足だけが落ちる**かを見る。
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
import types
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
FPS = 30

# 新しい欄を使わない回の指示書の sha256（置き場の道は <tmp> に直してから）。撮影の素材を入れる前の build_edit.py
# （コミット 26c4ecf57）で組んで控えた。build_edit の出力を変える直しをしたら、理由をコミットに書いてここを直す
SAME_SHA = "edcc2e655680de4b14bf0c32fc7a02ac28f001e8eca91f6a604bb7b141a40434"

CUTS: dict[str, tuple[str, str, set[str], str]] = {
    "stream_src": ('                    sources.setdefault(key, {"path": clip["path"], "watermark": "prism_live", "t0": clip["start"]})\n',
                   '                    sources.setdefault(key, {"path": clip["path"], "t0": clip["start"]})\n',
                   {"same_out"}, "窓の素材を撮影の素材と同じ形（透かしなし）にする（今までの回の指示書が変わる）"),
    "foot_audio": ('                if cs.get("audio_db") is not None:\n                    sys.exit(f"{i}行目: 撮影の素材',
                   '                if False:\n                    sys.exit(f"{i}行目: 撮影の素材',
                   {"footage"}, "撮影の素材のカットの audio_db を組む段で断らない（音を使うつもりのまま書き出しまで行く）"),
    "foot_place": ("        if fin + m > lim:\n", "        if False:\n",
                   {"footage"}, "素材の長さ・区間の終わり・until を越えても前にずらさない（無いコマを取る）"),
    "foot_orig": ("        if M.footage_ref(cs[\"t\"]):\n            sys.exit(f\"{i}行目は元の声の行",
                  "        if False:\n            sys.exit(f\"{i}行目は元の声の行",
                  {"footage"}, "元の声の行に撮影の素材を当てても断らない（音の無い素材から声を取る）"),
    "faces_stop": ("        if rec is None:\n            sys.exit(f\"{i}行目: 撮影の素材 {fid} の顔を",
                   "        if rec is None:\n            return []\n            sys.exit(f\"{i}行目: 撮影の素材 {fid} の顔を",
                   {"faces"}, "顔を検出に通していない撮影の素材のカットも、ぼかしなしで組む"),
    "faces_sha": ('        if rec.get("sha256") and sha and rec["sha256"] != sha:\n', "        if False:\n",
                  {"faces"}, "作り直した作業用に、前の作業用の顔の箱を当てる"),
    "faces_range": ("        if not any(s0 - 0.5 / FPS <= a and b <= s1 + 0.5 / FPS", "        if False and not any(s0 - 0.5 / FPS <= a and b <= s1 + 0.5 / FPS",
                    {"faces"}, "顔の検出に通していない秒のカットも組む"),
    "faces_other": ('            if M.footage_ref(str(r["from_t"]))[0] != fid:\n                continue\n',
                    '            if False:\n                continue\n',
                    {"faces"}, "ほかの撮影の素材の顔の箱まで掛ける"),
    "faces_clip": ('            o["from"], o["to"] = max(fin, round(ra * FPS)), min(fout, round(rb * FPS))\n',
                   '            o["from"], o["to"] = round(ra * FPS), round(rb * FPS)\n',
                   {"faces"}, "顔の箱をカットの中に切らない（同じ素材の次のカットに前の箱が残る）"),
    "anchor_cut": ('        base += sum(c["out"] - c["in"] for c in rc[:k])\n', "        base += 0\n",
                   {"finish"}, "行の何本目のカットの時を、行の頭から数える"),
    "rel_path": ("        return str(q if q.is_absolute() else (ov_dir / q).resolve())\n", "        return str(q)\n",
                 {"finish"}, "相対の道を overrides の置き場から読まない（書き出しが指示書の置き場から探して無い）"),
    "bands_all": ('               if c["start"] < b and c["end"] > a and', '               if True and',
                  {"finish"}, "bands を区間に掛からない窓にも付ける"),
    "note_to": ('        if "corner_note_to" in rows_ov.get(str(i), {}):\n', "        if False:\n",
                {"finish"}, "行の corner_note_to を読まない（注が本人の顔の上に残る）"),
}


def fake_render() -> types.ModuleType:
    m = types.ModuleType("render")
    style = {"narration": {"max_tempo": 1.4}, "big": {"order": ["x"], "looks": {"x": {"pre_roll_frames": 0}}}}
    m.load_style = lambda ref, base: json.loads(json.dumps(style))
    m.tempo_cap = lambda st: 1.4
    return m


def load_tool(src: Path) -> types.ModuleType:
    sys.modules.pop("build_edit", None)
    spec = importlib.util.spec_from_file_location("build_edit", src / "build_edit.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["build_edit"] = mod
    spec.loader.exec_module(mod)
    return mod


LEDGER = {"items": [{"id": "fa00000001", "seconds": 5.0, "w": 1080, "h": 1920, "sha256": "aa" * 32},
                    {"id": "fb00000002", "seconds": 6.0, "w": 1080, "h": 1920, "sha256": "bb" * 32}]}


class Bench:
    def __init__(self, src: Path, tmp: Path) -> None:
        self.be = load_tool(src)
        self.tmp, self.n = tmp, 0
        self.clips = tmp / "index.json"
        self.clips.write_text(json.dumps({"clips": [{"n": 1, "start": 0, "end": 600, "file": "c01.mp4"},
                                                     {"n": 2, "start": 600, "end": 700, "file": "c02.mp4"}]}))
        self.ledger = tmp / "footage_index.json"
        self.ledger.write_text(json.dumps(LEDGER))

    def run(self, rows: list[dict], ov: dict | None = None, books: list[dict] | None = None,
            ledger: Path | None | str = "default", extra: list[str] | None = None) -> dict:
        """1回組む。rows は spec の行（line の字の数で声の長さが決まる: 毎秒6字）"""
        self.n += 1
        d = self.tmp / f"run{self.n}"
        d.mkdir()
        sp = {"id": "T", "title": "見張り", "rows": rows}
        (d / "spec_T.json").write_text(json.dumps(sp, ensure_ascii=False))
        args = [str(d / "spec_T.json"), "--clips", str(self.clips), "--out", str(d / "edit_T.json"),
                "--work", str(d / "work"), "--footage", str(self.ledger if ledger == "default" else ledger)]
        if ov is not None:
            (d / "ov").mkdir()
            (d / "ov" / "ov.json").write_text(json.dumps(ov, ensure_ascii=False))
            args += ["--overrides", str(d / "ov" / "ov.json")]
        for k, bk in enumerate(books or []):
            (d / f"blur{k}.json").write_text(json.dumps(bk, ensure_ascii=False))
            args += ["--blur", str(d / f"blur{k}.json")]
        args += extra or []

        def narration_frames(lines, narr, work):
            return [(math.ceil(len(ln["text"]) / 6.0 * FPS), []) for ln in lines]
        sys.modules["render"] = fake_render()
        self.be.narration_frames = narration_frames
        buf = io.StringIO()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                rc = self.be.main(args)
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
            if not isinstance(e.code, int) and e.code is not None:
                buf.write(str(e.code))
        except Exception:
            rc = 1
            buf.write(traceback.format_exc())
        out = d / "edit_T.json"
        edit = json.loads(out.read_text()) if out.exists() and rc == 0 else None
        raw = out.read_text().replace(str(d), "<tmp>").replace(str(self.tmp), "<tmp>") if edit else ""
        return {"rc": rc, "text": buf.getvalue(), "edit": edit, "raw": raw, "dir": d}


def line(n: int) -> str:
    return "あ" * n + "。"


# ---- 足 ---------------------------------------------------------------

def leg_same_out(b: Bench):
    """新しい欄を使わない回（窓・同上・注・帳面の窓の箱・寄る・明るさ）。台帳は無い道を渡す"""
    rows = [{"line": line(12), "src": ["0:01:00"], "corner_note": "◆注"},
            {"line": line(18), "src": ["0:02:00", "0:03:00"], "fx": "寄る"},
            {"line": line(9), "src": ["0:03:30"], "same_as_prev": True},
            {"line": line(15), "src": ["0:10:05"]}]
    ov = {"rows": {"1": {"cuts": [{"t": "0:02:00", "share": 0.4, "gamma": 1.2}, {"t": "0:03:00", "share": 0.6}]}}}
    book = {"regions": [{"from_t": "0:02:00", "to_t": "0:02:05", "rect": [1, 2, 30, 40], "cells": 7}]}
    r = b.run(rows, ov, [book], ledger=b.tmp / "nothing.json")
    e = r["edit"] or {}
    sha = hashlib.sha256(r["raw"].encode()).hexdigest()
    return [(f"組む（終了コード {r['rc']}）。台帳が無くても読まない {r['text'][-160:]!r}", r["rc"] == 0 and bool(e)),
            ("sfx・stickers を足さない・素材は窓だけ",
             "sfx" not in e and "stickers" not in e and all("path" in s for s in (e.get("sources") or {}).values())),
            (f"前の build_edit と同じ指示書（sha256 {sha[:12]}… / 控え {SAME_SHA[:12]}…）", sha == SAME_SHA)]


def leg_footage(b: Bench):
    out = []
    rows = [{"line": line(12), "src": ["fa00000001 0.5"]},
            {"line": line(18), "src": ["0:01:00", "fb00000002 1.0"]},
            {"line": line(9), "src": ["0:01:30"], "same_as_prev": True},
            {"line": line(6), "src": ["fa00000001 4.5"]}]
    ov = {"rows": {"1": {"cuts": [{"t": "0:01:00", "share": 0.5}, {"t": "fb00000002 1.0", "share": 0.5}]}}}
    book = {"footage": {"fa00000001": {"sha256": "aa" * 32, "scanned": [[0, 5]]},
                        "fb00000002": {"sha256": "bb" * 32, "scanned": [[0, 6]]}}, "regions": []}
    r = b.run(rows, ov, [book])
    e = r["edit"] or {}
    cuts, src = e.get("cuts") or [], e.get("sources") or {}
    out.append((f"組む（終了コード {r['rc']}）{r['text'][-200:]!r}", r["rc"] == 0 and len(cuts) == 5))
    if len(cuts) != 5:
        return out
    c0, c2, c3, c4 = cuts[0], cuts[2], cuts[3], cuts[4]
    out.append(("素材は f_<ID> = {footage: ID} だけ",
                src.get("f_fa00000001") == {"footage": "fa00000001"} and src.get("f_fb00000002") == {"footage": "fb00000002"}))
    out.append((f"spec の src の秒 0.5 → 入り 15（{c0['in']}）・音を書かない", c0["src"] == "f_fa00000001" and c0["in"] == 15
                and "audio_db" not in c0))
    out.append((f"overrides の t の秒 1.0 → 入り 30（{c2['src']} {c2['in']}）", c2["src"] == "f_fb00000002" and c2["in"] == 30))
    out.append((f"「同上」は同じ素材の続きのコマ（{c3['src']} {c3['in']} / 前の終わり {c2['out']}）",
                c3["src"] == "f_fb00000002" and c3["in"] == c2["out"]))
    lim = int(5.0 * FPS) - 1
    out.append((f"素材の長さを越える入り（4.5秒）は前にずらす（{c4['in']}〜{c4['out']}・上限 {lim}）と知らせる",
                c4["out"] == lim and c4["in"] < 135 and "撮影の素材 fa00000001" in r["text"]))
    meta = (e.get("meta") or {}).get("rows") or []
    out.append((f"meta の行に素材の秒（{meta[0]['cuts'] if meta else None}）",
                bool(meta) and meta[0]["cuts"][0].startswith("fa00000001 0.50+")))
    # 区間の終わり・until も上限
    r2 = b.run([{"line": line(2), "src": ["fa00000001 1.0–2.0"]}], None, [book])
    c = ((r2["edit"] or {}).get("cuts") or [{}])[0]
    out.append((f"区間の終わり 2.0秒を越えない（{c.get('in')}〜{c.get('out')}）", c.get("out") == 60))
    r3 = b.run([{"line": line(12), "src": ["0:00:01"]}], {"rows": {"0": {"cuts": [{"t": "fa00000001 1.0", "until": "3.5"}]}}}, [book])
    c = ((r3["edit"] or {}).get("cuts") or [{}])[0]
    out.append((f"until 3.5秒を越えない（{c.get('in')}〜{c.get('out')}）", c.get("out") == 105))
    # 止まる4つ
    for what, rows_, ov_, want in [
            ("台帳に無い ID", [{"line": line(6), "src": ["fc00000003 0.0"]}], None, "台帳"),
            ("audio_db", [{"line": line(6), "src": ["0:00:01"]}], {"rows": {"0": {"cuts": [{"t": "fa00000001 0", "audio_db": -10}]}}}, "audio_db"),
            ("元の声の行", [{"line": line(6), "src": ["fa00000001 0.0–1.0"], "orig_voice": "x"}], None, "音が無い"),
            ("素材が短すぎる（6秒の素材に約7秒）", [{"line": line(40), "src": ["fb00000002 0"]}], None, "取れない")]:
        rr = b.run(rows_, ov_, [book])
        out.append((f"{what} は止まる（{rr['rc']}・{rr['text'][-90:]!r}）", rr["rc"] not in (0, None) and want in rr["text"]))
    return out


def leg_faces(b: Bench):
    out = []
    book = {"footage": {"fa00000001": {"sha256": "aa" * 32, "scanned": [[0, 5]]},
                        "fb00000002": {"sha256": "bb" * 32, "scanned": [[0, 1.5]]}},
            "regions": [{"from_t": "fa00000001 0.3", "to_t": "fa00000001 1.5", "cells": 7, "note": "face_scan",
                         "keys": [{"t": "0.9", "rect": [10, 20, 30, 40]}, {"t": "1.2", "rect": [40, 20, 30, 40]}]},
                        {"from_t": "fa00000001 3.0", "to_t": "fa00000001 3.5", "rect": [5, 5, 5, 5]},
                        {"from_t": "fb00000002 0.0", "to_t": "fb00000002 1.0", "rect": [7, 7, 7, 7]},
                        {"from_t": "0:00:00", "to_t": "0:00:59", "rect": [9, 9, 9, 9]}]}
    rows = [{"line": line(12), "src": ["fa00000001 0.5"]}, {"line": line(12), "src": ["0:00:01"]}]
    r = b.run(rows, None, [book])
    cuts = (r["edit"] or {}).get("cuts") or []
    out.append((f"組む（{r['rc']}）{r['text'][-160:]!r}", r["rc"] == 0 and len(cuts) == 2))
    if len(cuts) != 2:
        return out
    bl = cuts[0].get("blur") or []
    c = cuts[0]
    out.append((f"掛かる箱だけ（1つ。{len(bl)}）", len(bl) == 1))
    if bl:
        x = bl[0]
        out.append((f"秒 → 作業用のコマ（keys {[k['f'] for k in x.get('keys', [])]}）・カットの中に切る（{x.get('from')}〜{x.get('to')} / "
                    f"カット {c['in']}〜{c['out']}）",
                    [k["f"] for k in x.get("keys", [])] == [27, 36] and x.get("from") == c["in"] == 15
                    and x.get("to") == min(c["out"], 45) and x.get("cells") == 7))
    out.append(("窓のカットには窓の箱（撮影の素材の箱は掛からない）",
                [z.get("rect") for z in cuts[1].get("blur") or []] == [[9, 9, 9, 9]]))
    # 同じ素材の後ろのカットに、前の秒の箱を持ち越さない
    r2 = b.run([{"line": line(6), "src": ["fa00000001 2.6"]}], None, [book])
    bl2 = (((r2["edit"] or {}).get("cuts") or [{}])[0]).get("blur") or []
    out.append((f"3.0〜3.5秒の箱だけ（{[z.get('rect') for z in bl2]}）", [z.get("rect") for z in bl2] == [[5, 5, 5, 5]]))
    for what, rows_, ov_, bk, want in [
            ("検出の記録が無い", [{"line": line(6), "src": ["fa00000001 0"]}], None, {"regions": []}, "face_scan.py --footage fa00000001"),
            ("作業用が作り直された", [{"line": line(6), "src": ["fa00000001 0"]}], None,
             {"footage": {"fa00000001": {"sha256": "cc" * 32, "scanned": [[0, 5]]}}, "regions": []}, "sha256"),
            ("通した範囲の外", [{"line": line(6), "src": ["fb00000002 1.2"]}], None, book, "範囲")]:
        rr = b.run(rows_, ov_, [bk])
        out.append((f"{what} は止まる（{rr['rc']}・{rr['text'][-80:]!r}）", rr["rc"] not in (0, None) and want in rr["text"]))
    rr = b.run([{"line": line(6), "src": ["0:00:01"]}], {"rows": {"0": {"cuts": [{"t": "fa00000001 0", "faces": False}]}}},
               [{"regions": []}])
    c = ((rr["edit"] or {}).get("cuts") or [{}])[0]
    out.append((f"faces: false は箱を入れず止まらない（{rr['rc']}）", rr["rc"] == 0 and "blur" not in c))
    return out


def leg_finish(b: Bench):
    out = []
    rows = [{"line": line(12), "src": ["0:00:10"]},
            {"line": line(18), "src": ["0:01:00", "0:02:00"], "corner_note": "◆実食"},
            {"line": line(9), "src": ["0:10:05"]}]
    ov = {"rows": {"1": {"cuts": [{"t": "0:01:00", "share": 0.4}, {"t": "0:02:00", "share": 0.6}],
                         "corner_note_to": {"row": 1, "cut": 1}}},
          "sfx": [{"at": {"row": 2}, "file": "se/a.mp3", "db": -6, "note": "行の頭"},
                  {"at": {"row": 1, "cut": 1, "f": 6}, "file": "/abs/b.mp3"},
                  {"at": 7, "file": "/abs/c.mp3"}],
          "stickers": [{"image": "img/x.png", "from": {"row": 1, "frac": 0.5}, "to": {"row": 1, "end": True, "f": -3},
                        "x": 800, "y": 1330, "w": 300}],
          "bands": [{"t": "0:10:01–0:12:00", "size": [720, 1280], "rows": [[140, 272]], "margin": 5, "note": "帯"}]}
    r = b.run(rows, ov)
    e = r["edit"] or {}
    out.append((f"組む（{r['rc']}）{r['text'][-160:]!r}", r["rc"] == 0 and bool(e)))
    if not e:
        return out
    mr = e["meta"]["rows"]
    c1 = [c for c in e["cuts"] if c["row"] == 1]
    sfx = e.get("sfx") or []
    out.append((f"sfx の時（{[s['at'] for s in sfx]}）= 2行目の頭・1行目の2本目＋6・7",
                [s["at"] for s in sfx] == [mr[2]["from"], mr[1]["from"] + (c1[0]["out"] - c1[0]["in"]) + 6, 7]))
    ov_dir = r["dir"] / "ov"
    out.append((f"相対の道は overrides の置き場から（{sfx[0].get('file') if sfx else None}）",
                bool(sfx) and sfx[0]["file"] == str((ov_dir / "se/a.mp3").resolve()) and sfx[1]["file"] == "/abs/b.mp3"
                and sfx[0].get("db") == -6 and sfx[0].get("note") == "行の頭"))
    st = (e.get("stickers") or [{}])[0]
    out.append((f"札の時（{st.get('from')}〜{st.get('to')}）= 行の半ば〜行の終わり−3・ほかの欄はそのまま",
                st.get("from") == mr[1]["from"] + mr[1]["frames"] // 2 and st.get("to") == mr[1]["from"] + mr[1]["frames"] - 3
                and st.get("image") == str((ov_dir / "img/x.png").resolve()) and st.get("w") == 300))
    srcs = e["sources"]
    with_b = sorted(k for k, s in srcs.items() if s.get("bands"))
    out.append((f"bands は区間に掛かる窓（c02）だけ（{with_b}）・t と note は持たない",
                with_b == ["c02"] and srcs["c02"]["bands"] == {"size": [720, 1280], "rows": [[140, 272]], "margin": 5}))
    note = (e.get("notes") or [{}])[0]
    out.append((f"注は2本目のカットの頭で消える（{note.get('to')}）", note.get("to") == mr[1]["from"] + c1[0]["out"] - c1[0]["in"]))
    r2 = b.run(rows, ov)
    out.append(("同じ材料で2回組むと同じ指示書", bool(r["raw"]) and r2["raw"] == r["raw"]))
    rr = b.run(rows, {"rows": ov["rows"], "sfx": [{"at": {"rows": 1}, "file": "/abs/a.mp3"}]})
    out.append((f"知らない時の形は止まる（{rr['rc']}）", rr["rc"] not in (0, None) and "時は" in rr["text"]))
    return out


LEGS = {"same_out": leg_same_out, "footage": leg_footage, "faces": leg_faces, "finish": leg_finish}


def run_legs(src: Path, tmp: Path, quiet: bool) -> tuple[list[str], int]:
    b = Bench(src, tmp)
    failed, checked = [], 0
    for name, fn in LEGS.items():
        res = fn(b)
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> None:
    shutil.copy(HERE / "build_edit.py", dst / "build_edit.py")
    old, new, _, _ = CUTS[name]
    text = (dst / "build_edit.py").read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が build_edit.py に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / "build_edit.py").write_text(text.replace(old, new), encoding="utf-8")


def child(name: str) -> int:
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        src, tmp = Path(td) / "src", Path(td) / "runs"
        src.mkdir()
        tmp.mkdir()
        cut_copy(name, src)
        failed, checked = run_legs(src, tmp, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    return 2 if checked == 0 else (1 if failed else 0)


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, want, why) in CUTS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=name), timeout=120, check=False)
        line_ = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line_[-1][len("LEGS_FAILED "):])) if line_ else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-200:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(HERE, Path(td), quiet=False)
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
