"""**カットの選び方の検査（長さ・似た見た目の連続・止め絵）が、落ちるときに落ちるか。**

    python3 tools/shorts/qa/cuts_selftest.py [--keep DIR]

あやと（#959、2026-10-20 23:57 UTC）:「静止画はやめて欲しい」「同じカットを3秒以上使わない」「同じような見た目の
カットも連続3秒以上使わないで欲しい」。check.py の `cut_length`・`similar_run`・`still_image` が、それぞれの
壊し方で落ち、壊していない並べ方では通ることを、合成の場面と時間割だけで当てる。

**書き出し（render.py）は通さない。** 3つとも出来上がりの画素ではなく、時間割（`plan.json` の `cuts`）・元素材・
カットの見本のコマを見るので、場面の絵をそのままつないだ下書きの大きさの mp4 と、その時間割で当たる
（使い回しの足 `drill.reuse_legs` と同じ作り）。本物の書き出しの clean が3つとも通ることは、
`qa_selftest.py` / `qa_video_selftest.py` の clean が当てている。この2本は 1本 5分の上限の手前にいるので、
足はこちらに分けた。

足ごとに、新しい3つと、隣の2つ（元素材のカクつき・同じ画の使い回し）を回し、**壊したところを見る検査だけが
落ちる**ことを見る。カクつく素材の足は、カクつきの検査は落ち、止め絵の検査は通る
（あやと「なければカクカクでも良い」。カクつく映像は止め絵ではない）。

| 足 | 並べ方 | cut_length | similar_run | still_image |
| --- | --- | --- | --- | --- |
| clean | 別の場面 2.5秒を4つ | pass | pass | pass |
| cut_long | 1つ目だけ 3.5秒 | **fail** | pass | pass |
| cut_under | 2.97秒（89コマ）を2つ | pass（線の手前） | pass | pass |
| cut_continued | 同じ素材の続き（out = 次の in）を2カットに割って 3.33秒 | **fail**（1つのカットと数える） | pass | pass |
| similar_pair | 同じ素材の別の時刻を 2.5秒＋2.5秒で続ける | pass | **fail**（5.0秒） | pass |
| similar_short | 同じ並びで 1.47秒＋1.47秒 | pass | pass（2.93秒） | pass |
| similar_presenter | similar_pair と同じ並びで、場面に顔を据える | pass | pass（本人の画どうし） | pass |
| punch_in | 同じ素材の続きで、寄せだけ 1.0 → 1.3 に跳ばす | pass（寄せが跳べば別のカット） | **fail**（同じ瞬間） | pass |
| still_zoom | 止めた絵（同じコマの mp4）に、時間割で寄せ 1.0→1.1 | pass | pass | **fail** |
| still_split | 止めた絵を頭から2回、寄せを続けて 1.33＋1.67秒 | **fail**（3.0秒。つなぎで絵が変わらない） | pass | **fail** |
| still_png | 素材が画像のファイル | pass | pass | **fail**（時間割の印） |
| still_ledger | 動く素材だが、取り込みの台帳に `source_png` | pass | pass | **fail**（台帳の印） |
| judder | 4コマずつ同じ絵（実質 7.5fps）の素材 | pass | pass | pass（絵が変わる対 25%）。source_stutter は **fail** |

終了コード 0=思ったとおり / 1=思ったとおりでない / 2=数えるものが無い（ffmpeg・OpenCV・顔の検出器）。
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import drill  # noqa: E402

FPS = drill.FPS
NEW = ("cut_length", "similar_run", "still_image")
ALSO = ("source_stutter", "shot_reuse")


def encode(path: Path, frames) -> None:
    """270x480 のコマの並びを mp4 にする（場面の絵と同じ大きさ・同じ符号化）。"""
    enc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", "270x480", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "ultrafast",
                            "-crf", "18", "-pix_fmt", "yuv420p", str(path)], stdin=subprocess.PIPE)
    for f in frames:
        enc.stdin.write(f.tobytes())
    enc.stdin.close()
    enc.wait()


def materials(box: Path) -> dict[str, Path]:
    """足の素材。A〜F は色相と模様の違う流れる場面（`drill.scene_clip`。隣どうし色の分布がほぼ重ならない）、
    S は同じ素材の別の時刻を使う8秒の青い場面、P は S に顔（高さ 0.27）を据えた「本人が話す画」。
    G から、止めた絵（T: 頭の1コマを 4秒）・画像のファイル（PNG）・カクつく素材（J: 4コマずつ同じ絵）を作る。
    台帳の足（L）は、動く場面 E の写しに `source_png` を書いた index.json を添える。"""
    from PIL import Image
    m: dict[str, Path] = {}
    for k, nm in enumerate("ABCDEFG"):
        m[nm] = box / f"scene_{nm}.mp4"
        drill.scene_clip(m[nm], seed=40 + k, hue=k * 255 // 7, n=120)
    m["S"], m["P"] = box / "scene_S.mp4", box / "scene_P.mp4"
    drill.scene_clip(m["S"], seed=30, hue=170, n=240)
    # 顔は既定より大きく（高さ 0.27）。既定の大きさは本人の画の線のちょうど上下に出て、コマによって外れる
    drill.scene_clip(m["P"], seed=30, hue=170, n=240, face=True, face_size=(112, 130))
    g = drill.scene_frames(m["G"])
    m["T"] = box / "still_T.mp4"
    encode(m["T"], [g[0]] * 120)
    m["PNG"] = box / "still.png"
    Image.fromarray(g[0]).save(m["PNG"])
    m["J"] = box / "judder_J.mp4"
    encode(m["J"], [g[k - k % 4] for k in range(120)])
    led = box / "ledger"
    led.mkdir(exist_ok=True)
    m["L"] = led / "01_canvas.mp4"
    shutil.copy(m["E"], m["L"])
    (led / "index.json").write_text(json.dumps({"clips": [{"file": m["L"].name, "source_png": "screenshot.png"}]}))
    return m


def frames_of(src: Path, a: int, b: int):
    import numpy as np
    from PIL import Image
    if src.suffix == ".png":
        return np.repeat(np.asarray(Image.open(src).convert("RGB"))[None], b - a, axis=0)
    fr = drill.scene_frames(src)[a:b]
    assert len(fr) == b - a, (src, a, b, len(fr))
    return fr


def leg(box: Path, name: str, cuts: list[tuple]) -> tuple[Path, Path]:
    """カットの並びどおりに場面の絵をつないだ下書きの大きさ（540x960）の mp4 と、その時間割（`drill.synth_leg` の写し。
    カットに寄せ（zoom）を書ける・画像のファイルを素材にできる、の2つを足した）。寄せは時間割にだけ書き、
    絵には掛けない（3つの検査はどれも、寄せる前の元素材と時間割の寄せの数を読む）。"""
    mp4, work = box / f"{name}.mp4", box / f"{name}.work"
    work.mkdir(exist_ok=True)
    enc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", "540x960", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "ultrafast",
                            "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)],
                           stdin=subprocess.PIPE)
    plan_cuts, at = [], 0
    for c in cuts:
        src, a, b = c[:3]
        extra = c[3] if len(c) > 3 else {}
        enc.stdin.write(frames_of(src, a, b).repeat(2, axis=1).repeat(2, axis=2).tobytes())
        plan_cuts.append({"src": src.stem, "path": str(src), "in": a, "out": b, "at": at, "frames": b - a,
                          "crop": [0, 0, 270, 480], **extra})
        at += b - a
    enc.stdin.close()
    enc.wait()
    (work / "plan.json").write_text(json.dumps({"fps": FPS, "size": [1080, 1920], "frames": at, "draft": True,
                                                "cuts": plan_cuts, "overlays": []}, ensure_ascii=False))
    return mp4, work


def legs(m: dict[str, Path]) -> dict[str, tuple]:
    """足の名前 → （カットの並び, 落ちるはずの検査とその判定, 測った値の形）。表は頭の docstring。"""
    A, B, Cs, D, S, P, T, J = (m[k] for k in ("A", "B", "C", "D", "S", "P", "T", "J"))
    z = lambda a, b: {"zoom": {"from": a, "to": b, "x": 0.5, "y": 0.5}}  # noqa: E731
    cl = lambda r: r["cut_length"]["measured"]  # noqa: E731
    sr = lambda r: r["similar_run"]["measured"]  # noqa: E731
    si = lambda r: r["still_image"]["measured"]  # noqa: E731
    return {
        "clean": ([(A, 0, 75), (B, 0, 75), (Cs, 0, 75), (D, 0, 75)], {},
                  lambda r: cl(r)["longest"]["sec"] == 2.5 and sr(r)["longest_run"] is None and si(r)["measured_cuts"] == 4),
        "cut_long": ([(A, 0, 105), (B, 0, 60), (Cs, 0, 60)], {"cut_length": "fail"},
                     lambda r: cl(r)["longest"]["sec"] == 3.5 and len(cl(r)["over"]) == 1),
        "cut_under": ([(A, 0, 89), (B, 0, 89)], {},
                      lambda r: cl(r)["longest"]["sec"] == 2.97),
        "cut_continued": ([(A, 0, 50), (A, 50, 100), (B, 0, 60)], {"cut_length": "fail"},
                          lambda r: cl(r)["cuts"] == 2 and cl(r)["plan_cuts"] == 3 and cl(r)["longest"]["sec"] == 3.33),
        "similar_pair": ([(S, 0, 75), (S, 120, 195), (B, 0, 60)], {"similar_run": "fail"},
                         lambda r: sr(r)["longest_run"]["sec"] == 5.0 and sr(r)["longest_run"]["cuts"] == 2
                         and cl(r)["cuts"] == 3),
        "similar_short": ([(S, 0, 44), (S, 120, 164), (B, 0, 60)], {},
                          lambda r: sr(r)["longest_run"]["sec"] == 2.93),
        "similar_presenter": ([(P, 0, 75), (P, 120, 195), (B, 0, 60)], {},
                              lambda r: sr(r)["longest_run"] is None and len(sr(r)["presenter_cuts"]) == 2),
        "punch_in": ([(A, 0, 50, z(1.0, 1.0)), (A, 50, 100, z(1.3, 1.35)), (B, 0, 60)], {"similar_run": "fail"},
                     lambda r: cl(r)["cuts"] == 3 and sr(r)["longest_run"]["why"] == ["同じ瞬間"]),
        "still_zoom": ([(A, 0, 60), (T, 0, 75, z(1.0, 1.1)), (B, 0, 60)], {"still_image": "fail"},
                       lambda r: len(si(r)["stills"]) == 1 and si(r)["stills"][0]["changed_share"] == 0.0
                       and si(r)["stills"][0]["zoom"] and not si(r)["stills"][0]["mark"]),
        "still_split": ([(T, 0, 40, z(1.0, 1.05)), (T, 0, 50, z(1.05, 1.1)), (B, 0, 60)],
                        {"cut_length": "fail", "still_image": "fail"},
                        lambda r: cl(r)["longest"]["sec"] == 3.0 and cl(r)["longest"]["plan_cuts"] == 2
                        and len(si(r)["stills"]) == 2),
        "still_png": ([(A, 0, 60), (m["PNG"], 0, 60), (B, 0, 60)], {"still_image": "fail"},
                      lambda r: len(si(r)["stills"]) == 1 and "画像" in (si(r)["stills"][0]["mark"] or "")),
        "still_ledger": ([(A, 0, 60), (m["L"], 0, 60), (B, 0, 60)], {"still_image": "fail"},
                         lambda r: len(si(r)["stills"]) == 1 and "台帳" in (si(r)["stills"][0]["mark"] or "")
                         and si(r)["stills"][0]["changed_share"] > 0.5),
        "judder": ([(A, 0, 60), (J, 0, 75), (B, 0, 60)], {"source_stutter": "fail"},
                   lambda r: not si(r)["stills"] and 0.15 <= si(r)["rows"][1]["changed_share"] <= 0.35),
    }


def run(keep: Path | None) -> int:
    miss = drill.need()
    if miss:
        print("✕ 回せない（数えるものが無い）: " + " / ".join(miss))
        return 2
    import check as C
    t_all = time.monotonic()
    tmp = None
    if keep:
        box = keep.resolve()
        box.mkdir(parents=True, exist_ok=True)
    else:
        tmp = tempfile.TemporaryDirectory(prefix="cuts_selftest_")
        box = Path(tmp.name)
    try:
        t0 = time.monotonic()
        m = materials(box)
        print(f"[素材] {len(m)}本 {time.monotonic() - t0:.1f}秒")
        rows, bad = [], []
        for name, (cuts, want, shape) in legs(m).items():
            t0 = time.monotonic()
            mp4, work = leg(box, name, cuts)
            ctx = C.make_ctx(mp4, work, crops=box / f"{name}.qa")
            rep = {r["id"]: r for r in C.run_checks(ctx, only=list(NEW + ALSO))["checks"]}
            wrong = []
            for cid in NEW + ALSO:
                if rep[cid]["status"] != want.get(cid, "pass"):
                    wrong.append(f"{cid}: {rep[cid]['status']}（欲しいのは {want.get(cid, 'pass')}。{rep[cid]['summary']}）")
            # 分母: どの検査も、並べたカットを全部見たうえでの答えであること（似た見た目の連続は、絵が変わらない
            # つなぎでまとめたあとのカットを見るので、長さの検査がまとめた数と同じこと）
            seen = {"cut_length": (rep["cut_length"]["measured"].get("plan_cuts"), len(cuts)),
                    "still_image": (rep["still_image"]["measured"].get("cuts"), len(cuts)),
                    "similar_run": (rep["similar_run"]["measured"].get("cuts"), rep["cut_length"]["measured"].get("cuts"))}
            for cid, (n, need) in seen.items():
                if n != need:
                    wrong.append(f"{cid} が見たカット {n}（{need} のはず）")
            try:
                fits = bool(shape(rep))
            except (KeyError, TypeError, IndexError):
                fits = False
            if not fits:
                wrong.append("測った値の形が思ったとおりでない: " + " ／ ".join(
                    f"{cid} {rep[cid]['summary']}" for cid in NEW))
            if wrong:
                bad.append((name, wrong))
            failed = [cid for cid in NEW + ALSO if rep[cid]["status"] != "pass"]
            rows.append(("○" if not wrong else "✕", name, ", ".join(f"{k}={v}" for k, v in want.items()) or "（なし）",
                         ", ".join(failed) or "（なし）", round(time.monotonic() - t0, 1),
                         " ／ ".join(rep[cid]["summary"] for cid in NEW if rep[cid]["status"] != "pass")))
            if keep:
                (box / f"{name}.qa.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str))
        print()
        print("| | 足 | 落ちるはずの検査 | 落ちた検査 | 秒 | 落ちた検査の要約 |")
        print("| --- | --- | --- | --- | --- | --- |")
        for r in rows:
            print("| " + " | ".join(str(x) for x in r) + " |")
        print(f"\n全体 {time.monotonic() - t_all:.1f}秒")
        if bad:
            print("\n✕ 思ったとおりでない:")
            for name, ws in bad:
                for w in ws:
                    print(f"  {name}: {w}")
            return 1
        print(f"○ {len(rows)}通り、思ったとおり（壊した足は壊したところを見る検査だけが落ち、ほかは pass）")
        return 0
    finally:
        if tmp is not None:
            tmp.cleanup()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", type=Path, help="作った動画と報告を残す置き場")
    sys.exit(run(ap.parse_args().keep))
