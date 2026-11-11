"""**声の倍率の上限と、尺の関所（`build_edit.py`）の見張り。声も ffmpeg も使わない。**

    python3 tools/shorts/plan/build_edit_selftest.py
    BREAK=gate python3 tools/shorts/plan/build_edit_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ
（Selftests には numpy が無いので、numpy を読む `render.py` は偽物に差し替える）。

## 何を見るか

声の測り（`narration_frames`）を偽物に差し替えて、**本物の `build_edit.main()`** を回す。偽物は
「字の数 ÷ 素の速さ ÷ 倍率」をコマに切り上げて返すだけ（Fish の声も ffmpeg も Rubber Band も使わない）。
`render.py` も偽物で、様式（`narration.max_tempo` と【大】の見た目）だけを返す。

| 足 | 確かめること |
| --- | --- |
| `under_cap` | 要る倍率が上限以内 → 要る倍率で読ませる（上限の倍率では一度も測らない）。止めない・注意も出さない |
| `over_cap_fits` | 上限を越えるが、上限で読んで59秒以内 → 上限で読ませ、注意を1行出して組む（終了コード 0）。注意に出す見込みの尺が、組んだ指示書の尺と同じ。上限は様式から読む（様式を 1.3 にすれば 1.3） |
| `over_60_stops` | 上限で読んでも59秒を越える（声だけなら入るが、行の間と末尾を足すと越える）→ 指示書を書かずに終了コード 2。尺・何%・何字を出し、その数が下の手計算と合う。言われたとおり減らせば通る |
| `card_own` | 題の札が1行目と同じ言葉（国旗・改行・句読点だけ違う）なら、札が1行目の字幕を兼ねる（字幕を出さない・札に line）。別の言葉（あやと F-043「札は手段と日数、1行目は回れた中身」）なら兼ねない（1行目の字幕を出す・札に line を持たせない・札は題の行の終わりか4秒の早いほうで消す） |
| `voice_src` | 声だけを配信の別の秒から取った行（spec の `voice_src`。画は別の秒。猫の回 p2）: 本番の声で組むと、その行に `orig_voice`・`voice_src` の印が行の最後に付く（書き出しが元の声として揃える）・声は声の一覧のその行の音（`audio`）で、元の音は切らない・ほかの行には付かない・仮の声（`--voice` 無し）なら付けない・`orig_voice` と両方ある行は元の声の行として組む |
| `vsrc_tempo` | voice_src の行（本人の声）は速めない: 本番の声で組むと、その行は素の速さの長さで組み（偽の測りは書き出しと同じく voice_src の印の行に倍率を掛けない）、喋る速さの倍率は AI の声の行の字と長さだけから決める。仮の声なら、ふつうの行として倍率に数えて速める（ハトのフンの回 v2 は 17・18行の叫びが 1.4倍の早送りだった。帳面 F-019） |
| `orig_voice` | 元の声の行（あやと F-051「叫びは配信の本人の声で」）: 声の一覧にその行のぶんが無くても組む（あれば止まる）・その行の声はカットと同じ区間の元の音（`file`）で、仮の声にも倍率にも数えない・画は声と同じコマから取り、最後のカットだけ行の間ぶん延ばす・【大】でも声を遅らせない・延ばした画が until を越えるなら入りをずらさずに止まる |
| `named_src` | ほかの回の秒（`OTHERvid_02 0:01:00–…`。夫婦の車の回 A・クラムチャウダーの回）: 名前の付いた秒はその回の窓から・名前の無い秒は同じ秒を持つほかの回の窓を取らずにこの回の窓から・地図の行（`27:46:40.0`）は地図の窓から・「同上」の続きは前の行と同じ回から・ぼかしの帳面は名前の付いた回の窓にだけ掛かる・index.json に video が無い一覧は `<videoId>=<index.json>` で名指せる・窓の無い回は止まる |

数の手計算（`expect_frames`）は `build_edit.py` の関数を使わずに書く。見張りの側が本物と同じ式を
借りると、本物の式が壊れても一緒に壊れて、緑のままになる。

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が `build_edit.py` の**本物の字**を1か所だけ書き換えた写しを作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる
（字を直したのに、ここを直し忘れた）。
"""

from __future__ import annotations

import importlib.util
import io
import json
import math
import os
import re
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

# 外す守り: 名前 → (本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, set[str], str]] = {
    "gate": ("            if fit_s > FIT_S:\n", "            if False:\n",
             {"over_60_stops"}, "上限で読んでも入らない尺で止めない"),
    # 止めすぎると、入る尺の原稿（over_cap_fits）も、言われたとおり減らした原稿（over_60_stops の最後）も通らない
    "strict": ("            if fit_s > FIT_S:\n", "            if True:\n",
               {"over_cap_fits", "over_60_stops"}, "上限を越えたら、入る尺でも止める"),
    "voice_only": ("            fit_s = sum(row_frames(vf, h, p, k == len(vfs) - 1, args)\n"
                   "                        for k, (vf, h, p) in enumerate(zip(vfs, holds, pres))) / FPS\n",
                   "            fit_s = sum(vfs) / FPS\n",
                   {"over_60_stops", "over_cap_fits"}, "見積もりに行の間・hold・【大】の間・末尾を足さない"),
    "exit_code": ("                sys.exit(2)\n", "                sys.exit(1)\n",
                  {"over_60_stops"}, "止まるときの終了コードを 2 にしない"),
    "pct_base": ("    pct = math.ceil((1 - room / voice_s) * 100)\n",
                 "    pct = math.ceil((1 - FIT_S / video_s) * 100)\n",
                 {"over_60_stops"}, "減らす割合を声ではなく動画の長さから出す"),
    # orig_voice も倍率を手計算と突き合わせる足なので、一緒に落ちる
    "always_cap": ("        tempo = min(max(raw, 1.0), args.max_tempo)\n", "        tempo = args.max_tempo\n",
                   {"under_cap", "orig_voice", "vsrc_tempo"}, "要る倍率が上限以内でも、上限で読ませる"),
    "style_cap": ("        args.max_tempo = R.tempo_cap(st_all)\n", "        args.max_tempo = 1.4\n",
                  {"over_cap_fits"}, "上限を様式から読まない"),
    # 題の札と1行目が別の言葉のとき（あやと F-043）
    "card_always_same": ("    card_own = card_row is not None and bare_text(title) != bare_text(rows[card_row][\"line\"])\n",
                         "    card_own = False\n",
                         {"card_own"}, "札が別の言葉でも1行目の字幕を兼ねさせる（読み上げの字が画面に出ない）"),
    "card_raw_compare": ("    card_own = card_row is not None and bare_text(title) != bare_text(rows[card_row][\"line\"])\n",
                         "    card_own = card_row is not None and title != rows[card_row][\"line\"]\n",
                         {"card_own"}, "国旗・改行・句読点の違いで別の言葉と読む（同じ言葉が札と字幕に2回出る）"),
    "card_to": ("            edit[\"title\"][\"to\"] = min(edit[\"title\"][\"to\"], row[\"from\"] + row[\"frames\"])\n",
                "            pass\n",
                {"card_own"}, "兼ねない札を題の行の終わりで消さない（2行目の字幕と並ぶ）"),
    # 元の声の行（帳面 F-051。叫びは配信の本人の声で流す）。voice_src の足も「orig_voice と両方ある行は元の声の行」を
    # 当てるので、元の声の行が組めなくなる2つ（orig_count・orig_tts）ではそちらも落ちる
    "orig_count": ("        if len(voice) != len(rows) - len(orig_rows):\n", "        if len(voice) != len(rows):\n",
                   {"orig_voice", "voice_src"}, "元の声の行のぶんまで声の数を求める（その行の声は作らないので、組めない）"),
    "orig_tts": ("        lines[i] = {\"text\": rows[i][\"line\"], \"orig_voice\": True, \"file\": str(wav)}\n",
                 "        lines[i] = {\"text\": rows[i][\"line\"], \"orig_voice\": True}\n",
                 {"orig_voice", "voice_src"}, "元の声の行に元の音を置かない（字を AI の声か仮の声で読ませる）"),
    # voice_src の足も、倍率の字に voice_src の行を数えないことを手計算と突き合わせるので、一緒に落ちる
    "orig_tempo": ("        chars = sum(spoken_chars(lines[k][\"text\"]) for k in paced)\n",
                   "        chars = sum(spoken_chars(ln[\"text\"]) for ln in lines)\n",
                   {"orig_voice", "vsrc_tempo"}, "喋る速さの倍率に、速めない元の声の行の字まで数える"),
    "orig_shift": ("            if i in orig_rows:\n                clip, t0 = orig_place(",
                   "            if False:\n                clip, t0 = orig_place(",
                   {"orig_voice"}, "元の声の行のカットも until に合わせて入りをずらす（声と画の秒がずれる）"),
    "orig_peak": ("    return ORIG_PEAK / peak if peak > ORIG_PEAK else 1.0\n", "    return 1.0\n",
                  {"orig_voice"}, "元の声の 1.0 を越える頂点を下げない（16bit に書くと平らに割れる）"),
    # 声だけを配信の別の秒から取った行（spec の voice_src。猫の回 p2、#1086）
    "vsrc_mark": ("            lines[i][\"orig_voice\"] = True\n            lines[i][\"voice_src\"] = True\n",
                  "            pass\n",
                  {"voice_src"}, "voice_src の行に元の声の印を付けない（AI の声と同じ行全体の RMS で揃い、小さく聞こえる）"),
    "vsrc_draft": ("    if voice is not None:\n        # voice_src の行も、", "    if True:\n        # voice_src の行も、",
                   {"voice_src"}, "仮の声（--voice 無し）の行にも元の声の印を付ける（Open JTalk の声を配信の声として整える）"),
    "vsrc_both": ("    vsrc_rows = {i for i, r in enumerate(rows) if r.get(\"voice_src\") and i not in orig_rows}\n",
                  "    vsrc_rows = {i for i, r in enumerate(rows) if r.get(\"voice_src\")}\n",
                  {"voice_src"}, "orig_voice と voice_src の両方がある行にも voice_src の印を付ける（声と画が同じ秒の行なのに、別の秒の声と読まれる）"),
    # voice_src の行は本人の声なので速めない（ハトのフンの回 v2 は 17・18行の叫びが 1.4倍の早送りだった。帳面 F-019）
    "vsrc_paced": ("    paced = [k for k in spoken if k not in live_vsrc]\n", "    paced = list(spoken)\n",
                   {"vsrc_tempo"}, "喋る速さの倍率の字と長さに voice_src の行も数える（本人の声の速さで AI の声の倍率が動く）"),
    "vsrc_measure": ("        got = dict(zip(spoken, narration_frames([dict(lines[k], voice_src=True) if k in live_vsrc else lines[k]\n",
                     "        got = dict(zip(spoken, narration_frames([lines[k] if k in live_vsrc else lines[k]\n",
                     {"vsrc_tempo"}, "voice_src の行を倍率を掛けた長さで測る（書き出しで鳴る素の長さとずれ、行が短く組まれる）"),
    "vsrc_live_draft": ("    live_vsrc = vsrc_rows if voice is not None else set()\n", "    live_vsrc = vsrc_rows\n",
                        {"vsrc_tempo"}, "仮の声（--voice 無し）の voice_src の行も速めない行として組む（Open JTalk の声は配信の声ではない）"),
    "orig_pre": ("            and i not in orig_rows else 0 for i, (lk, r) in enumerate(zip(looks, rows))]\n",
                 "            else 0 for i, (lk, r) in enumerate(zip(looks, rows))]\n",
                 {"orig_voice"}, "元の声の行が【大】のとき、字が出きるまで声を遅らせる（同じ秒の画とずれる）"),
    # ほかの回の秒（spec の src に回の名前。2026-11-04 の絵コンテ5件で、担当が回ごとにずらした一覧の写しを作っていた）
    "named_pool": ("        if video and video != self.default:\n", "        if False:\n",
                   {"named_src"}, "回の名前を付けた秒も、どの回の窓からでも引く（同じ秒を持つ別の回の画を取る）"),
    "default_pool": ("        return [c for c in self.clips\n"
                     "                if not c.get(\"video\") or c.get(\"video\") == self.default or c.get(\"video\") not in self.named]\n",
                     "        return list(self.clips)\n",
                     {"named_src"}, "名前の無い秒を、名前で呼んだほかの回の窓からも引く"),
    "named_cont": ("            cont = {\"t\": M.ref(prev_video, fmt_exact(prev_end)), \"note\": \"前の行の画の続き\"}\n",
                   "            cont = {\"t\": fmt_exact(prev_end), \"note\": \"前の行の画の続き\"}\n",
                   {"named_src"}, "「同上」の続きを、前の行の回ではなくこの回から取る"),
    "named_lib": ("        if pools is not None and not any(c is clip for c in pools.get(src_video(str(r[\"from_t\"])))):\n",
                  "        if False:\n",
                  {"named_src"}, "ぼかしの帳面の箱を、秒だけで突き合わせる（別の回の同じ秒のカットに掛かる）"),
    "index_video": ("        video = m.group(1) if m else M.index_video(path, d)\n",
                    "        video = m.group(1) if m else None\n",
                    {"named_src"}, "窓の一覧がどの回のものかを index.json の video から読まない"),
}

FPS = 30
CAP = 1.4            # 偽の様式の narration.max_tempo（いまの style.json と同じ値）
CPS = 9.0            # spec の narration_cps_target（伸びているショートの速さ）
FIT = 59.0           # 止める線（build_edit.py の FIT_S。見張りの側でも書いておく）
# 行の長さに足すもの（build_edit.py の既定 --gap 0.25・--tail 0.5 を、ここで手で数えたもの）
GAP_F = 8            # round(0.25 × 30)
TAIL_F = 15          # round(0.5 × 30)
HOLD_ROW, HOLD_F = 3, 22    # hold 0.5 秒の行。round((0.25 + 0.5) × 30) = round(22.5) = 22（偶数へ丸める）
BIG_ROW, PRE_F = 5, 10      # 【大】の行と、字が出きってから声を出すまでのコマ（様式の pre_roll_frames）
CARD_S = 4.0                # spec の title_card_seconds（あやと F-015「開始4秒だけ」）
ORIG_ROW = 7                # 元の声の行（F-051）。hold の行・【大】の行とは別の行
ORIG_LINE = "ああーっ！……最悪や！"


def voice_frames(chars: int, natural: float, tempo: float) -> int:
    """偽の声の長さ（コマ）。素の速さ natural（毎秒の字数）を tempo 倍にして、コマに切り上げる"""
    return math.ceil(chars / natural * FPS / tempo)


def expect_frames(per_line: list[int], natural: float, tempo: float) -> tuple[int, int]:
    """手で数えた（声のコマ, 動画のコマ）。build_edit.py の関数は使わない"""
    voice = sum(voice_frames(c, natural, tempo) for c in per_line)
    extra = GAP_F * len(per_line) + (HOLD_F - GAP_F) + PRE_F + TAIL_F
    return voice, voice + extra


def fake_render(cap: float) -> types.ModuleType:
    """render.py の代わり。様式（上限の倍率と、【大】の見た目1つ）だけを返す"""
    m = types.ModuleType("render")
    style = {"narration": {"max_tempo": cap},
             "big": {"order": ["x"], "looks": {"x": {"pre_roll_frames": PRE_F}}}}
    m.load_style = lambda ref, base: json.loads(json.dumps(style))
    m.tempo_cap = lambda st: float((st.get("narration") or {}).get("max_tempo") or 99.0)
    return m


def load_tool(src: Path) -> types.ModuleType:
    sys.modules.pop("build_edit", None)
    spec = importlib.util.spec_from_file_location("build_edit", src / "build_edit.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["build_edit"] = mod
    spec.loader.exec_module(mod)
    return mod


class Bench:
    def __init__(self, src: Path, tmp: Path) -> None:
        self.be = load_tool(src)
        self.tmp = tmp
        self.n = 0
        clips = tmp / "index.json"
        clips.write_text(json.dumps({"clips": [{"n": 1, "start": 0, "end": 600, "file": "c01.mp4"}]}))
        self.clips = clips

    def run(self, per_line: list[int], natural: float, cap: float = CAP,
            card: tuple[str, str] | None = None, orig: dict | None = None,
            vsrc: dict | None = None) -> dict:
        """1回組む。終了コード・標準出力と標準エラー・できた指示書（無ければ None）・測った倍率。

        card =（1行目の読み上げ, 題の札）を渡すと、1行目を題の札の行にする。
        orig = {"row", "cuts", "voices"（声の一覧に入れる文の数。None なら仮の声）, "big"} を渡すと、
        その行を元の声の行（orig_voice）にする。
        vsrc = {"row", "voices"（True なら全部の行の声を声の一覧に入れる。False なら仮の声）} を渡すと、
        その行を声だけが配信の音の行（voice_src）にする（orig と同じ行にしてもよい）。
        """
        self.n += 1
        d = self.tmp / f"run{self.n}"
        d.mkdir()
        rows = [{"line": "あ" * c + "。", "src": ["0:01:00"]} for c in per_line]
        rows[HOLD_ROW]["hold"] = 0.5
        rows[BIG_ROW]["big"] = True
        sp = {"id": "T", "title": "見張り", "narration_cps_target": CPS, "rows": rows}
        if card is not None:
            rows[0]["line"], sp["title_card"] = card
            rows[0]["card"] = True
            sp["title_card_seconds"] = CARD_S
        extra: list[str] = []
        seen: list[str] = []
        if orig is not None:
            r = rows[orig["row"]]
            r["line"], r["orig_voice"] = ORIG_LINE, "0:02:00〜0:02:05"
            r["big"] = bool(orig.get("big"))
            ovp = d / "ov.json"
            ovp.write_text(json.dumps({"rows": {str(orig["row"]): {"cuts": orig["cuts"]}}}, ensure_ascii=False))
            extra += ["--overrides", str(ovp)]
            if orig.get("voices") is not None:
                vs = [{"plan": "T", "file": f"v{k:02d}.wav", "caption": rr["line"]}
                      for k, rr in enumerate(rows) if k != orig["row"]][:orig["voices"]]
                while len(vs) < orig["voices"]:
                    vs.append({"plan": "T", "file": "extra.wav", "caption": ORIG_LINE})
                vp = d / "lines.json"
                vp.write_text(json.dumps(vs, ensure_ascii=False))
                extra += ["--voice", str(vp)]
        if vsrc is not None:
            rows[vsrc["row"]]["voice_src"] = "配信の声（0:03:00.0〜0:03:02.0。画は別の秒）"
            if vsrc.get("voices") and orig is None:
                vp = d / "lines.json"
                vp.write_text(json.dumps([{"plan": "T", "file": f"v{k:02d}.wav", "caption": rr["line"]}
                                          for k, rr in enumerate(rows)], ensure_ascii=False))
                extra += ["--voice", str(vp)]
        spec = d / "spec_T.json"
        spec.write_text(json.dumps(sp, ensure_ascii=False))
        out = d / "edit_T.json"
        tempos: list[float] = []

        def narration_frames(lines, narr, work):
            tempo = float(narr.get("tempo") or 1.0)
            tempos.append(tempo)
            seen.extend(ln["text"] for ln in lines)
            # 書き出し（render.narration_wav）と同じ決まり: voice_src の印の行（本人の声）は倍率を掛けない
            return [(voice_frames(self.be.spoken_chars(ln["text"]), natural, 1.0 if ln.get("voice_src") else tempo), [])
                    for ln in lines]

        def orig_audio(pieces, work, name):
            # 元の音を開く代わりに、どの区間を渡されたかだけ控える（ffmpeg も numpy も使わない）
            self.orig_calls.append([(p["in"], p["frames"]) for p in pieces])
            return Path(work) / f"{name}.wav"

        sys.modules["render"] = fake_render(cap)
        self.be.narration_frames = narration_frames
        self.be.orig_audio = orig_audio
        self.orig_calls: list = []
        buf = io.StringIO()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                rc = self.be.main([str(spec), "--clips", str(self.clips), "--out", str(out),
                                   "--work", str(d / "work"), *extra])
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
            if not isinstance(e.code, int) and e.code is not None:
                buf.write(str(e.code))
        except Exception:
            rc = 1
            buf.write(traceback.format_exc())
        edit = json.loads(out.read_text()) if out.exists() else None
        return {"rc": rc, "text": buf.getvalue(), "edit": edit, "tempos": tempos, "seen": seen,
                "orig_calls": list(self.orig_calls)}


def seen_estimate(text: str) -> str | None:
    m = re.search(r"上限で読んで ([\d.]+) 秒の見込み", text)
    return m.group(1) if m else None


# ---- 足 ---------------------------------------------------------------

def leg_under_cap(b: Bench):
    per_line, natural = [17] * 18, 6.6
    raw = sum(voice_frames(c, natural, 1.0) for c in per_line) / FPS / (sum(per_line) / CPS)
    r = b.run(per_line, natural)
    sp = ((r["edit"] or {}).get("meta") or {}).get("speech") or {}
    return [(f"要る倍率 {raw:.3f} は上限 {CAP} 以内（足の前提）", raw < CAP),
            (f"組む（終了コード {r['rc']}）・指示書を書く", r["rc"] == 0 and r["edit"] is not None),
            (f"要る倍率で読ませる（指示書の倍率 {sp.get('tempo')}）", sp.get("tempo") == round(raw, 3)),
            (f"上限の倍率では一度も測らない（測った倍率 {r['tempos']}）",
             all(abs(t - CAP) > 1e-9 for t in r["tempos"])),
            ("注意も止まる知らせも出さない", "上限" not in r["text"])]


def leg_over_cap_fits(b: Bench):
    per_line, natural = [17] * 18, 5.0
    _, frames = expect_frames(per_line, natural, CAP)
    r = b.run(per_line, natural)
    e = r["edit"] or {}
    sp = (e.get("meta") or {}).get("speech") or {}
    got = (e.get("meta") or {}).get("frames")
    est = seen_estimate(r["text"])
    out = [(f"上限で読んで {frames / FPS:.1f} 秒（足の前提: {FIT} 秒以内）", frames / FPS <= FIT),
           (f"組む（終了コード {r['rc']}）・指示書を書く", r["rc"] == 0 and bool(e)),
           (f"上限で読ませる（指示書の倍率 {sp.get('tempo')}）", sp.get("tempo") == CAP),
           ("注意を1行出す（上限で止めた）", r["text"].count("上限で止めた") == 1),
           (f"組んだ尺が手計算と合う（{got} コマ / 手計算 {frames} コマ）", got == frames),
           (f"注意に出す見込み {est} 秒が、組んだ尺 {frames / FPS:.1f} 秒と同じ", est == f"{frames / FPS:.1f}")]
    # 上限は様式から読む。様式の上限を 1.3 にすれば 1.3 で読ませる
    _, f13 = expect_frames(per_line, natural, 1.3)
    r13 = b.run(per_line, natural, cap=1.3)
    sp13 = (((r13["edit"] or {}).get("meta") or {}).get("speech") or {})
    out += [(f"様式の上限が 1.3 なら 1.3 で読ませる（終了コード {r13['rc']}・倍率 {sp13.get('tempo')}・"
             f"{f13 / FPS:.1f} 秒）", r13["rc"] == 0 and sp13.get("tempo") == 1.3)]
    return out


def leg_over_60_stops(b: Bench):
    per_line, natural = [16] * 24, 5.0
    voice, frames = expect_frames(per_line, natural, CAP)
    chars = sum(per_line)
    pct = math.ceil((1 - (FIT - (frames - voice) / FPS) / (voice / FPS)) * 100)
    m = -(-chars * pct // 100)
    r = b.run(per_line, natural)
    t = r["text"]
    out = [(f"声だけなら {voice / FPS:.1f} 秒で入るが、行の間と末尾を足すと {frames / FPS:.1f} 秒（足の前提）",
            voice / FPS <= FIT < frames / FPS),
           (f"終了コード 2 で止まる（{r['rc']}）", r["rc"] == 2),
           ("指示書を書かない", r["edit"] is None),
           (f"「上限 {CAP} でも {frames / FPS:.1f} 秒になる」と出す", f"上限 {CAP} でも {frames / FPS:.1f} 秒になる" in t),
           (f"「字を約 {pct}% 減らす（あと {m} 字）」と出す", f"字を約 {pct}% 減らす（あと {m} 字）" in t),
           ("倍率を上げて入れる案は出さない（注意の「上限で止めた」で組み進めない）", "上限で止めた" not in t)]
    # 言われたとおり m 字減らす（行の頭から1字ずつ）と、通る
    cut = list(per_line)
    for k in range(m):
        cut[k % len(cut)] -= 1
    r2 = b.run(cut, natural)
    got = (((r2["edit"] or {}).get("meta") or {}).get("frames") or 0) / FPS
    out += [(f"{m} 字減らすと通る（終了コード {r2['rc']}・{got:.1f} 秒）", r2["rc"] == 0 and 0 < got <= FIT)]
    return out


def leg_card_own(b: Bench):
    """題の札が1行目と同じ言葉なら札が字幕を兼ね、別の言葉（F-043）なら兼ねない"""
    per_line, natural = [17] * 8, 6.6
    same = ("ストックホルム来たら、地下鉄が高すぎた！", "🇸🇪 ストックホルム来たら、\n地下鉄が高すぎた！")
    own = ("フランスに行ったら、10日で南仏も回れた！", "🇫🇷 フランスを10日\nレンタカー旅してみた！")
    rs, ro = b.run(per_line, natural, card=same), b.run(per_line, natural, card=own)
    es, eo = rs["edit"] or {}, ro["edit"] or {}
    ts, to = es.get("title") or {}, eo.get("title") or {}
    ls = ((es.get("narration") or {}).get("lines") or [{}])[0]
    lo = ((eo.get("narration") or {}).get("lines") or [{}])[0]
    row0 = (((eo.get("meta") or {}).get("rows") or [{}])[0])
    end0 = int(row0.get("from", 0)) + int(row0.get("frames", 0))
    cap_f = round(CARD_S * FPS)
    return [(f"どちらも組む（終了コード {rs['rc']} / {ro['rc']}）", rs["rc"] == 0 and ro["rc"] == 0 and es and eo),
            ("同じ言葉（国旗・改行・句読点だけ違う）: 1行目の字幕を出さない（札が兼ねる）", ls.get("caption") == ""),
            (f"同じ言葉: 札は1行目に付く（line {ts.get('line')}）・上限 {cap_f} コマ（{ts.get('to')}）",
             ts.get("line") == 0 and ts.get("to") == cap_f and ts.get("look") == "card"),
            (f"別の言葉: 1行目の字幕を消さない（caption {lo.get('caption')!r}）",
             "caption" not in lo and lo.get("text") == own[0]),
            (f"別の言葉: 札は行の字幕として扱わない（line を持たない: {sorted(to)}）",
             "line" not in to and to.get("look") == "card" and to.get("text") == own[1]),
            (f"別の言葉: 札は題の行の終わり（{end0} コマ）か {cap_f} コマの早いほうで消す（{to.get('to')}）",
             0 < end0 < cap_f and to.get("to") == min(end0, cap_f))]


def leg_orig_voice(b: Bench):
    """元の声の行（F-051）: 声を作らず、カットと同じコマの元の音を声の行に置く。画と声の秒をずらさない"""
    per_line, natural = [17] * 10, 6.6
    cuts = [{"t": "0:02:00.0", "len": 1.6}, {"t": "0:02:02.0–0:02:04.5"}]
    # 手で数えた区間: 窓の頭（0秒）からのコマ。1.6秒 = 48コマ、2.5秒 = 75コマ
    want_pieces = [(120 * FPS, 48), (122 * FPS, 75)]
    orig_f = 48 + 75
    spoken = [c for k, c in enumerate(per_line) if k != ORIG_ROW]
    raw = sum(voice_frames(c, natural, 1.0) for c in spoken) / FPS / (sum(spoken) / CPS)
    ra = b.run(per_line, natural, orig={"row": ORIG_ROW, "cuts": cuts, "voices": None, "big": True})
    e = ra["edit"] or {}
    lines = ((e.get("narration") or {}).get("lines") or [])
    ln = lines[ORIG_ROW] if len(lines) > ORIG_ROW else {}
    mrow = (((e.get("meta") or {}).get("rows") or [{}] * (ORIG_ROW + 1))[ORIG_ROW])
    got_cuts = [(c["in"], c["out"]) for c in e.get("cuts", []) if c.get("row") == ORIG_ROW]
    want_cuts = [(want_pieces[0][0], want_pieces[0][0] + 48), (want_pieces[1][0], want_pieces[1][0] + 75 + GAP_F)]
    sp = (e.get("meta") or {}).get("speech") or {}
    out = [(f"組む（終了コード {ra['rc']}）・指示書を書く", ra["rc"] == 0 and bool(e)),
           (f"元の音を、カットと同じ区間から取る（渡した区間 {ra['orig_calls']} / 手計算 {[want_pieces]}）",
            ra["orig_calls"] == [want_pieces]),
           (f"その行の声は元の音（file・印 orig_voice・AI の声 audio は無い。{sorted(ln)}）",
            str(ln.get("file", "")).endswith(f"orig_T_{ORIG_ROW:02d}.wav") and ln.get("orig_voice") is True
            and "audio" not in ln and ln.get("text") == ORIG_LINE),
           ("仮の声で読ませない（声の測りに、元の声の行の字が渡らない）", ORIG_LINE not in ra["seen"]),
           (f"倍率は声を作る行だけから決める（{sp.get('tempo')} / 手計算 {round(raw, 3)}）",
            sp.get("tempo") == round(raw, 3)),
           (f"画は声と同じコマから・最後のカットだけ行の間ぶん延ばす（{got_cuts} / 手計算 {want_cuts}）",
            got_cuts == want_cuts),
           (f"行の長さ = 元の音 {orig_f} + 行の間 {GAP_F} コマ（{mrow.get('frames')}）・meta に印",
            mrow.get("frames") == orig_f + GAP_F and mrow.get("orig_voice") is True),
           (f"【大】でも、字が出きるまで声を遅らせない（声の頭 {ln.get('at')} = 行の頭 {mrow.get('from')}）",
            ln.get("at") == mrow.get("from") and "caption_from" not in ln)]
    # 声の一覧には、元の声の行のぶんが無い（9文）。10文渡したら止まる
    rb = b.run(per_line, natural, orig={"row": ORIG_ROW, "cuts": cuts, "voices": len(per_line) - 1})
    eb = rb["edit"] or {}
    lb = ((eb.get("narration") or {}).get("lines") or [])
    out += [(f"声 {len(per_line) - 1}文（元の声の行のぶん無し）で組む（終了コード {rb['rc']}）",
             rb["rc"] == 0 and len(lb) == len(per_line) and "audio" not in lb[ORIG_ROW]
             and all("audio" in x for k, x in enumerate(lb) if k != ORIG_ROW)),
            ("声を作る行の字幕は、それぞれの行の声（元の声の行で1つずれない）",
             all(x.get("audio") == f"{Path(b.tmp / f'run{b.n}' / f'v{k:02d}.wav')}"
                 for k, x in enumerate(lb) if k != ORIG_ROW))]
    rc_ = b.run(per_line, natural, orig={"row": ORIG_ROW, "cuts": cuts, "voices": len(per_line)})
    out += [(f"声 {len(per_line)}文（元の声の行のぶんまで）なら止まる（終了コード {rc_['rc']}）",
             rc_["rc"] != 0 and rc_["edit"] is None and "声の数" in rc_["text"])]
    # 行の間ぶん延ばした画が until を越える: ずらして収めず、止まる
    cu = [cuts[0], {**cuts[1], "until": "0:02:04.6"}]
    rd = b.run(per_line, natural, orig={"row": ORIG_ROW, "cuts": cu, "voices": None})
    out += [(f"画が until を越えるなら、入りをずらさずに止まる（終了コード {rd['rc']}）",
             rd["rc"] != 0 and rd["edit"] is None and "元の声" in rd["text"])]
    # 16bit の wav に書くと 1.0 を越えた頂点が平らに割れる。叫びの復号で出た 1.048 は 0.9 まで下げ、小さい声は上げない
    hot, quiet = b.be.orig_gain(1.048), b.be.orig_gain(0.5)
    out += [(f"1.0 を越える頂点（1.048）は割れない所まで下げる（倍率 {hot:.3f}・下げた頂点 {1.048 * hot:.3f}）",
             1.048 * hot <= 0.9 + 1e-9),
            (f"頂点が低い声は上げない（0.5 の倍率 {quiet}）", quiet == 1.0)]
    return out


VSRC_ROW = 4                # voice_src の行（hold・【大】・元の声の行とは別の行）


def leg_voice_src(b: Bench):
    """声だけを配信の別の秒から取った行（spec の voice_src）: 本番の声で組めば、書き出しが元の声として揃える印が付く"""
    per_line, natural = [17] * 10, 6.6
    ra = b.run(per_line, natural, vsrc={"row": VSRC_ROW, "voices": True})
    lines = (((ra["edit"] or {}).get("narration") or {}).get("lines") or [])
    ln = lines[VSRC_ROW] if len(lines) > VSRC_ROW else {}
    others = [x for k, x in enumerate(lines) if k != VSRC_ROW]
    out = [(f"組む（終了コード {ra['rc']}）・声の一覧は voice_src の行のぶんも入れて {len(per_line)}文",
            ra["rc"] == 0 and len(lines) == len(per_line)),
           (f"その行に orig_voice・voice_src の印（{ {k: ln.get(k) for k in ('orig_voice', 'voice_src')} }）",
            ln.get("orig_voice") is True and ln.get("voice_src") is True),
           (f"印は行の最後（担当の手の印と同じ並び。{list(ln)}）", list(ln)[-2:] == ["orig_voice", "voice_src"]),
           (f"声は声の一覧のその行の音（audio {str(ln.get('audio', ''))[-7:]}）・元の音は切らない（{ra['orig_calls']}）",
            str(ln.get("audio", "")).endswith(f"v{VSRC_ROW:02d}.wav") and "file" not in ln and ra["orig_calls"] == []),
           ("ほかの行には印が付かない", all("orig_voice" not in x and "voice_src" not in x for x in others))]
    # 仮の声（--voice 無し）: Open JTalk の声は配信の声ではないので印を付けない
    rb = b.run(per_line, natural, vsrc={"row": VSRC_ROW, "voices": False})
    lb = (((rb["edit"] or {}).get("narration") or {}).get("lines") or [])
    out.append((f"仮の声で組むと印を付けない（終了コード {rb['rc']}・{sorted(lb[VSRC_ROW]) if len(lb) > VSRC_ROW else None}）",
                rb["rc"] == 0 and len(lb) > VSRC_ROW and "orig_voice" not in lb[VSRC_ROW]
                and "voice_src" not in lb[VSRC_ROW]))
    # orig_voice と voice_src の両方がある行は、元の声の行（声と画が同じ秒）として組む
    cuts = [{"t": "0:02:00.0", "len": 1.6}]
    rc_ = b.run(per_line, natural, orig={"row": ORIG_ROW, "cuts": cuts, "voices": len(per_line) - 1},
                vsrc={"row": ORIG_ROW})
    lc = (((rc_["edit"] or {}).get("narration") or {}).get("lines") or [])
    lo = lc[ORIG_ROW] if len(lc) > ORIG_ROW else {}
    out.append((f"orig_voice と両方ある行は元の声の行（終了コード {rc_['rc']}・{sorted(lo)}）",
                rc_["rc"] == 0 and lo.get("orig_voice") is True and "voice_src" not in lo and "file" in lo))
    return out


def leg_vsrc_tempo(b: Bench):
    """voice_src の行（本人の声）は速めない: 素の速さで測って組み、喋る速さの倍率の字にも長さにも数えない。
    仮の声（--voice 無し）なら、ふつうの行として倍率に数えて速める"""
    per_line, natural = [17] * 10, 6.6
    per_line[VSRC_ROW] = 30          # 長い行にして、倍率に数えたら手計算と食い違うようにする
    vs_chars = per_line[VSRC_ROW]
    paced = [c for k, c in enumerate(per_line) if k != VSRC_ROW]
    raw = sum(voice_frames(c, natural, 1.0) for c in paced) / FPS / (sum(paced) / CPS)
    tempo = round(min(max(raw, 1.0), CAP), 3)
    ra = b.run(per_line, natural, vsrc={"row": VSRC_ROW, "voices": True})
    e = ra["edit"] or {}
    sp = (e.get("meta") or {}).get("speech") or {}
    mrows = (e.get("meta") or {}).get("rows") or []
    mv = mrows[VSRC_ROW] if len(mrows) > VSRC_ROW else {}
    m1 = mrows[1] if len(mrows) > 1 else {}
    want_vs = voice_frames(vs_chars, natural, 1.0) + GAP_F
    want_1 = voice_frames(17, natural, tempo) + GAP_F
    out = [(f"組む（終了コード {ra['rc']}）", ra["rc"] == 0 and bool(e)),
           (f"倍率は AI の声の行だけから決める（{sp.get('tempo')} / 手計算 {tempo}）", sp.get("tempo") == tempo),
           (f"倍率の字に voice_src の行を数えない（{sp.get('chars')} / 手計算 {sum(paced)}）", sp.get("chars") == sum(paced)),
           (f"voice_src の行は素の速さの長さで組む（{mv.get('frames')} コマ / 手計算 {want_vs}）", mv.get("frames") == want_vs),
           (f"AI の声の行は倍率を掛けた長さ（{m1.get('frames')} コマ / 手計算 {want_1}）", m1.get("frames") == want_1)]
    # 仮の声: Open JTalk の声は配信の声ではないので、ふつうの行として倍率に数えて速める
    raw_all = sum(voice_frames(c, natural, 1.0) for c in per_line) / FPS / (sum(per_line) / CPS)
    tempo_all = round(min(max(raw_all, 1.0), CAP), 3)
    rb = b.run(per_line, natural, vsrc={"row": VSRC_ROW, "voices": False})
    eb = rb["edit"] or {}
    spb = (eb.get("meta") or {}).get("speech") or {}
    mb = ((eb.get("meta") or {}).get("rows") or [{}] * (VSRC_ROW + 1))[VSRC_ROW]
    out += [(f"仮の声なら voice_src の行も倍率に数える（字 {spb.get('chars')} / {sum(per_line)}・倍率 {spb.get('tempo')} / {tempo_all}）",
             rb["rc"] == 0 and spb.get("chars") == sum(per_line) and spb.get("tempo") == tempo_all),
            (f"仮の声なら voice_src の行も速めた長さ（{mb.get('frames')} / 手計算 {voice_frames(vs_chars, natural, tempo_all) + GAP_F}）",
             mb.get("frames") == voice_frames(vs_chars, natural, tempo_all) + GAP_F)]
    return out


MAIN_V, OTHER_V = "MAINvideo01", "OTHERvid_02"   # 11字の videoId（この回・ほかの回）
MAP_T = 100000.0                                # 地図の素材の秒（hookmap.py の T_BASE。見張りの側でも書いておく）


def run_named(b: Bench, rows: list[dict], clips: list[str], lib: list | None = None) -> dict:
    """ほかの回の秒を含む spec で1回組む（仮の声。どの行も声 45コマ）。終了コード・出力・指示書"""
    b.n += 1
    d = b.tmp / f"run{b.n}"
    d.mkdir()
    spec = d / "spec_N.json"
    spec.write_text(json.dumps({"id": "N", "title": "見張り", "rows": rows}, ensure_ascii=False))
    args = [str(spec)] + [x for c in clips for x in ("--clips", c)] + ["--out", str(d / "edit_N.json"),
                                                                      "--work", str(d / "work")]
    if lib is not None:
        (d / "blur.json").write_text(json.dumps({"regions": lib}, ensure_ascii=False))
        args += ["--blur", str(d / "blur.json")]
    sys.modules["render"] = fake_render(CAP)
    b.be.narration_frames = lambda lines, narr, work: [(45, []) for _ in lines]
    buf = io.StringIO()
    try:
        with redirect_stdout(buf), redirect_stderr(buf):
            rc = b.be.main(args)
    except SystemExit as e:
        rc = e.code if isinstance(e.code, int) else 1
        if not isinstance(e.code, int) and e.code is not None:
            buf.write(str(e.code))
    except Exception:
        rc = 1
        buf.write(traceback.format_exc())
    out = d / "edit_N.json"
    return {"rc": rc, "text": buf.getvalue(), "edit": json.loads(out.read_text()) if out.exists() else None}


def leg_named_src(b: Bench):
    """ほかの回の秒（spec の src に回の名前）: その回の窓から引く。名前の無い秒・地図の行・続き・ぼかしの帳面も取り違えない"""
    d = b.tmp / "named"
    d.mkdir(exist_ok=True)
    # 2つの回の窓は同じ秒（0〜600秒）を持つ。ほかの回の一覧を先に渡す（並びの頭から探すと、ほかの回の窓を先に見つける）
    other = d / "other_index.json"
    other.write_text(json.dumps({"video": OTHER_V, "clips": [{"n": 1, "start": 0, "end": 600, "file": "o01.mp4"}]}))
    main_ = d / "main_index.json"
    main_.write_text(json.dumps({"video": MAIN_V, "clips": [{"n": 1, "start": 0, "end": 600, "file": "m01.mp4"}]}))
    hmap = d / "map_index.json"
    hmap.write_text(json.dumps({"clips": [{"n": 1, "start": MAP_T, "end": MAP_T + 3, "file": "hook_map.mp4"}]}))
    rows = [{"line": "あいうえおかきくけこ。", "src": ["0:01:00–0:01:02"]},
            {"line": "さしすせそたちつてと。", "src": [f"{OTHER_V} 0:01:00–0:01:02"]},
            {"line": "なにぬねのはひふへほ。", "src": [f"{OTHER_V} 0:05:00"], "same_as_prev": True},
            {"line": "まみむめもやゆよらり。", "src": ["27:46:40.0–27:46:41.5"]}]
    lib = [{"from_t": "0:00:59", "to_t": "0:01:10", "rect": [0.1, 0.1, 0.2, 0.2], "note": "この回の人"},
           {"from_t": f"{OTHER_V} 0:00:59", "to_t": f"{OTHER_V} 0:01:10", "rect": [0.5, 0.5, 0.6, 0.6],
            "note": "ほかの回の人"}]
    r = run_named(b, rows, [str(other), str(main_), str(hmap)], lib)
    e = r["edit"] or {}
    src = e.get("sources") or {}
    cuts = e.get("cuts") or []
    path_of = [Path(src.get(c.get("src"), {}).get("path", "")).name for c in cuts]
    notes = [[x.get("note") for x in c.get("blur", [])] for c in cuts]
    rows_n = [c.get("row") for c in cuts]
    want = ["m01.mp4", "o01.mp4", "o01.mp4", "hook_map.mp4"]
    out = [(f"組む（終了コード {r['rc']}）{'' if r['rc'] == 0 else r['text'][-300:]}", r["rc"] == 0 and bool(e)),
           (f"行ごとの窓（{list(zip(rows_n, path_of))} / 欲しいのは {want}）", path_of == want and rows_n == [0, 1, 2, 3]),
           ("名前の付いた秒は、その回の窓の 60秒（1800コマ）から", len(cuts) > 1 and cuts[1].get("in") == 1800),
           ("「同上」の続きは前の行と同じ回の、前のカットの次のコマから",
            len(cuts) > 2 and cuts[2].get("in") == cuts[1].get("out")),
           ("地図の行は地図の窓の頭から（0コマ目）", len(cuts) > 3 and cuts[3].get("in") == 0),
           (f"ぼかしの帳面は名前の付いた回の窓にだけ掛かる（{notes[:2]}）",
            notes[:2] == [["この回の人"], ["ほかの回の人"]]),
           ("meta の行のカットに回の名前が出る",
            any(OTHER_V in s for s in (((e.get("meta") or {}).get("rows") or [{}, {}])[1].get("cuts") or [])))]
    # index.json に video の無い一覧は <videoId>=<index.json> で名指す
    bare = d / "bare_index.json"
    bare.write_text(json.dumps({"clips": [{"n": 1, "start": 0, "end": 600, "file": "o01.mp4"}]}))
    r2 = run_named(b, rows[:2], [f"{OTHER_V}={bare}", str(main_)])
    c2 = (r2["edit"] or {}).get("cuts") or []
    s2 = (r2["edit"] or {}).get("sources") or {}
    p2 = [Path(s2.get(c.get("src"), {}).get("path", "")).name for c in c2]
    out.append((f"<videoId>=<index.json> で名指した一覧から引く（終了コード {r2['rc']}・{p2}）",
                r2["rc"] == 0 and p2 == ["m01.mp4", "o01.mp4"]))
    # 窓を渡していない回の秒は、止まってその回の名前を言う
    r3 = run_named(b, rows[:2], [str(main_)])
    out.append((f"窓の無い回の秒は止まる（終了コード {r3['rc']}）",
                r3["rc"] != 0 and r3["edit"] is None and f"{OTHER_V} の窓が無い" in r3["text"]))
    return out


LEGS = {
    "under_cap": leg_under_cap,
    "over_cap_fits": leg_over_cap_fits,
    "over_60_stops": leg_over_60_stops,
    "card_own": leg_card_own,
    "orig_voice": leg_orig_voice,
    "voice_src": leg_voice_src,
    "vsrc_tempo": leg_vsrc_tempo,
    "named_src": leg_named_src,
}


def run_legs(src: Path, tmp: Path, quiet: bool) -> tuple[list[str], int]:
    b = Bench(src, tmp)
    failed: list[str] = []
    checked = 0
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
    """本物の build_edit.py を写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    shutil.copy(HERE / "build_edit.py", dst / "build_edit.py")
    old, new, _, _ = CUTS[name]
    text = (dst / "build_edit.py").read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が build_edit.py に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / "build_edit.py").write_text(text.replace(old, new), encoding="utf-8")


def child(name: str) -> int:
    """守りを1つ外した写しで足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
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
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, want, why) in CUTS.items():
        env = dict(os.environ, BREAK=name)
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=120, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
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
