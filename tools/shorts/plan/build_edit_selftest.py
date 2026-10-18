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
    "always_cap": ("        tempo = min(max(raw, 1.0), args.max_tempo)\n", "        tempo = args.max_tempo\n",
                   {"under_cap"}, "要る倍率が上限以内でも、上限で読ませる"),
    "style_cap": ("        args.max_tempo = R.tempo_cap(st_all)\n", "        args.max_tempo = 1.4\n",
                  {"over_cap_fits"}, "上限を様式から読まない"),
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

    def run(self, per_line: list[int], natural: float, cap: float = CAP) -> dict:
        """1回組む。終了コード・標準出力と標準エラー・できた指示書（無ければ None）・測った倍率"""
        self.n += 1
        d = self.tmp / f"run{self.n}"
        d.mkdir()
        rows = [{"line": "あ" * c + "。", "src": ["0:01:00"]} for c in per_line]
        rows[HOLD_ROW]["hold"] = 0.5
        rows[BIG_ROW]["big"] = True
        spec = d / "spec_T.json"
        spec.write_text(json.dumps({"id": "T", "title": "見張り", "narration_cps_target": CPS, "rows": rows},
                                   ensure_ascii=False))
        out = d / "edit_T.json"
        tempos: list[float] = []

        def narration_frames(lines, narr, work):
            tempo = float(narr.get("tempo") or 1.0)
            tempos.append(tempo)
            return [(voice_frames(self.be.spoken_chars(ln["text"]), natural, tempo), []) for ln in lines]

        sys.modules["render"] = fake_render(cap)
        self.be.narration_frames = narration_frames
        buf = io.StringIO()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                rc = self.be.main([str(spec), "--clips", str(self.clips), "--out", str(out),
                                   "--work", str(d / "work")])
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
            if not isinstance(e.code, int) and e.code is not None:
                buf.write(str(e.code))
        except Exception:
            rc = 1
            buf.write(traceback.format_exc())
        edit = json.loads(out.read_text()) if out.exists() else None
        return {"rc": rc, "text": buf.getvalue(), "edit": edit, "tempos": tempos}


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


LEGS = {
    "under_cap": leg_under_cap,
    "over_cap_fits": leg_over_cap_fits,
    "over_60_stops": leg_over_60_stops,
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
