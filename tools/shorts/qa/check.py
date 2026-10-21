#!/usr/bin/env python3
"""完成したショート（mp4）を、出す前に機械で全部見る。

    python3 tools/shorts/qa/check.py out.mp4 [work_dir] [--json report.json] [--md report.md]
                                     [--plate no_text.mp4] [--crops DIR] [--only id,id] [--skip id,id]

work_dir は render.py の --work（plan.json・字の絵・音の束）。無くても回るが、束や時間割が
要る検査は not-checkable になる（「無かったので通した」にはしない）。

終了コード（docs/island-standards.md §15 の決めに、人が見る段を1つ足したもの）:
  0 = 全部 pass
  1 = fail が1つ以上
  2 = 動画そのものが読めない（数えるものが無い）
  3 = fail は無いが、needs-human か not-checkable が残っている（人が見るまで出さない）

検査の一覧・線・線の理由は README.md。ここは呼ぶ順と、結果のまとめ方だけ。
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import audio  # noqa: E402
import container  # noqa: E402
import cuts  # noqa: E402
import faces  # noqa: E402
import linebreak  # noqa: E402
import reuse  # noqa: E402
import still  # noqa: E402
import stutter  # noqa: E402
import text  # noqa: E402
import textdup  # noqa: E402
import textface  # noqa: E402
import video  # noqa: E402
import watermark  # noqa: E402
from common import FAIL, HUMAN, NA, PASS, SEVERITY, Ctx, ffprobe, load_plan, load_style, rate  # noqa: E402

# id → 検査。並びは報告の並び（形式 → 音 → 字 → 絵）
CHECKS = {
    "container": container.check,
    "loudness": audio.check_loudness,
    "voice_vs_bgm": audio.check_voice_vs_bgm,
    "subtitle_sync": text.check_subtitle_sync,
    "text_dup": textdup.check,
    "line_breaks": linebreak.check,
    "safe_area": text.check_safe_area,
    "watermark": watermark.check,
    "faces": faces.check,
    "text_on_face": textface.check,
    "black": video.check_black,
    "frozen": video.check_frozen,
    "cut_length": cuts.check_cut_length,
    "similar_run": cuts.check_similar_run,
    "still_image": still.check,
    "source_stutter": stutter.check,
    "shot_reuse": reuse.check,
    "silence": audio.check_silence,
    "clipping": audio.check_clipping,
    "original_audio": audio.check_original_audio,
}
# 絵だけを見る検査（音を差し替えた動画には、前の結果がそのまま使える）
VIDEO_ONLY = ("safe_area", "watermark", "faces", "text_on_face", "black", "frozen", "cut_length", "similar_run",
              "still_image", "source_stutter", "shot_reuse")
# 下書き（render.py --draft）で回す最低限。中身を直している間に崩れやすいものだけ:
# 字幕と声のずれ・字が安全域から出ていないか・真っ黒なコマ・強調の字の言い直し（時間割だけで測るので速い）。
# 元素材のカクつきと使い回しも下書きで回す。どちらも「どの区間をどこに使うか」で決まり、それを直すのは
# 下書きの段だから（本番で見つけると、区間を選び直して書き出しからやり直しになる）。カクつきは元素材を
# 読むだけで縦横半分の書き出しにも関係なく、42秒の動画で 20秒。使い回しはカットごとに3コマで 5秒
# （2026-10-19、zjHZucyfrq8 p2 v2）。
# カットの長さ・似た見た目の連続・止め絵も、同じ理由で下書きで回す（あやと 2026-10-21。どれも「どの区間を
# どこに何秒使うか」で決まり、本番で見つけると選び直しになる）。長さは時間割だけ、止め絵はカクつきと同じ
# 元素材の読みを使い回し、似た見た目は使い回しと同じコマの要約を使い回すので、足してもほとんど遅くならない。
# 顔・透かし・字と顔は字なしの版と本番の画素で見るので、本番の段で回す。
# 字の改行（語の途中で割れていないか）は、字を直している下書きの段で崩れやすく、時間割の字だけで測るので一瞬
DRAFT_CHECKS = ("subtitle_sync", "safe_area", "black", "text_dup", "line_breaks", "cut_length", "similar_run",
                "still_image", "source_stutter", "shot_reuse")

LABEL = {PASS: "合格", FAIL: "不合格", HUMAN: "人が見る", NA: "測れない"}


def make_ctx(mp4: Path, work: Path | None, *, plate: Path | None = None, style: Path | None = None,
             crops: Path | None = None) -> Ctx:
    plan = load_plan(work)
    st = load_style(style, plan)
    pr = ffprobe(mp4)
    v = next((s for s in pr.get("streams", []) if s.get("codec_type") == "video"), None)
    if v is None:
        raise SystemExit(2)
    if plate is None and work is not None and (work / "no_text.mp4").exists():
        plate = work / "no_text.mp4"
    fps = rate(v.get("avg_frame_rate")) or rate(v.get("r_frame_rate")) or 30.0
    nb = v.get("nb_frames")
    n = int(nb) if nb and str(nb).isdigit() else int(round(float(pr["format"]["duration"]) * fps))
    W, H = int(v["width"]), int(v["height"])
    notes = []
    if plan and plan.get("draft"):
        # 下書き（render.py --draft）は縦横半分。字の絵と置き場は時間割の座標（W x H）なので、
        # コマを広げて測る（common.iter_frames）。形式（container）は本番の大きさで見るものなので落ちる
        notes.append(f"下書き（{W}x{H}）を時間割の {plan['size'][0]}x{plan['size'][1]} に広げて測った")
        W, H = plan["size"]
    return Ctx(mp4=mp4, work=work, style=st, out_dir=crops or mp4.with_suffix(".qa"), plate=plate,
               plan=plan, probe=pr, W=W, H=H, fps=fps, nframes=n, notes=notes)


def run_checks(ctx: Ctx, only: list[str] | None = None, skip: list[str] | None = None) -> dict:
    results, times = [], {}
    for cid, fn in CHECKS.items():
        if (only and cid not in only) or (skip and cid in skip):
            continue
        t0 = time.monotonic()
        try:
            r = fn(ctx)
        except Exception as e:  # 1本の検査が落ちても、ほかは回す。落ちたことは隠さない
            r = {"id": cid, "title": cid, "status": NA, "summary": f"検査が途中で止まった: {type(e).__name__}: {e}",
                 "measured": {}, "thresholds": {}, "problems": [f"{type(e).__name__}: {e}"], "artifacts": []}
        times[cid] = round(time.monotonic() - t0, 2)
        r["seconds"] = times[cid]
        results.append(r)
    worst = max((r["status"] for r in results), key=lambda s: SEVERITY[s], default=NA)
    return {"file": str(ctx.mp4), "work": str(ctx.work) if ctx.work else None,
            "plate": str(ctx.plate) if ctx.plate else None, "overall": worst,
            "counts": {s: sum(r["status"] == s for r in results) for s in SEVERITY},
            "checks": results, "notes": ctx.notes}


def exit_code(report: dict) -> int:
    o = report["overall"]
    return {PASS: 0, FAIL: 1, HUMAN: 3, NA: 3}[o]


def markdown(report: dict) -> str:
    lines = [f"## ショートの品質チェック: `{Path(report['file']).name}`", "",
             f"全体: **{LABEL[report['overall']]}**（" + " / ".join(
                 f"{LABEL[s]} {n}" for s, n in report["counts"].items() if n) + "）", "",
             "| 検査 | 判定 | 測った値 |", "| --- | --- | --- |"]
    for r in report["checks"]:
        summ = str(r["summary"]).replace("|", "\\|")
        lines.append(f"| {r['title']} | {LABEL[r['status']]} | {summ} |")
    bad = [r for r in report["checks"] if r["status"] != PASS]
    if bad:
        lines += ["", "### 見てほしいところ", ""]
        for r in bad:
            lines.append(f"- **{r['title']}**（{LABEL[r['status']]}）")
            for p in r["problems"][:8]:
                lines.append(f"  - {p}")
            for a in r["artifacts"][:8]:
                lines.append(f"  - 切り抜き: `{a}`")
    if report.get("notes"):
        lines += ["", "### 道具からの注意", ""] + [f"- {n}" for n in report["notes"]]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mp4", type=Path)
    ap.add_argument("work", type=Path, nargs="?")
    ap.add_argument("--plate", type=Path, help="字を重ねずに書いた同じ動画（render.py --no-text）。既定: work/no_text.mp4")
    ap.add_argument("--style", type=Path, help="様式（既定: plan.json に写した様式 → tools/shorts/render/style.json）")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--md", type=Path)
    ap.add_argument("--crops", type=Path, help="人が見る切り抜きの置き場（既定: <mp4>.qa/）")
    ap.add_argument("--only", help="この検査だけ（, 区切り）")
    ap.add_argument("--skip", help="この検査を飛ばす（, 区切り）")
    ap.add_argument("--draft", action="store_true",
                    help=f"下書きの最低限だけ（{','.join(DRAFT_CHECKS)}）。出す前は必ず全部を回す")
    a = ap.parse_args()
    if a.draft and not a.only:
        a.only = ",".join(DRAFT_CHECKS)
    if not a.mp4.exists():
        print(f"✕ 無い: {a.mp4}")
        return 2
    try:
        ctx = make_ctx(a.mp4, a.work, plate=a.plate, style=a.style, crops=a.crops)
    except SystemExit:
        print(f"✕ 映像が読めない: {a.mp4}")
        return 2
    only = [s for s in (a.only or "").split(",") if s]
    skip = [s for s in (a.skip or "").split(",") if s]
    unknown = [s for s in only + skip if s not in CHECKS]
    if unknown:
        print(f"✕ そんな検査は無い: {unknown}（{list(CHECKS)}）")
        return 2
    rep = run_checks(ctx, only, skip)
    if a.json:
        a.json.write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str))
    md = markdown(rep)
    if a.md:
        a.md.write_text(md)
    print(md)
    return exit_code(rep)


if __name__ == "__main__":
    sys.exit(main())
