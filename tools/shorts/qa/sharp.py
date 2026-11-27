"""画質の検査: カットごとに、書き出しの大きさで見た鮮明さを数え、フック（題の札が出ている間）に粗い配信の画が無いかを見る。

あやと（#1450、2026-11-26、国民の館の回 vxy-p5-v5 を見て。帳面 F-094 の3回目）:

> 画質が悪いのが多い。あやと島カードか渡した動画を使えないのか。
> 特にフックは画質悪いの使わないのを絶対ルールにしてるはず。（飲んでるシーンとかは除く）

決まり（F-094）は在ったのに、画質を数える検査が無く、担当の目だけに任せていた。

## 何を数えるか

カットごとに、出来上がりの 20%・50%・80% の3コマを字なしの版（`no_text.mp4`。無ければ仕上がり）から白黒で読み、
**画面のまん中（横 25〜75%・縦 30〜70%）のラプラシアンの分散**の中央値を「鮮明さ」とする。まん中だけを見るのは、
集中線（`fx` の speedlines は楕円の外にだけ描く）と、上下の透かしの帯を避けるため。仕上がりで測るときは、
字の絵（`overlays`・`overlays_anim`）の箱を外して測る。

素材の種類は時間割から: `footage` の印 → 撮影の動画、画像のファイル・絵の窓（台帳に `art`）→ 写真・絵、
取り込みの台帳（index.json）に配信の id がある → 配信、どれでもない（地図の動画・合成）→ その他。
**判定するのは配信の画だけ**（地図や描いた絵は平らな地が多く、この数では粗さを言えない）。

## 線（SHARP_MIN = 300）

2026-11-27 に、あやとが粗いと言った vxy-p5-v5 と、出してよいと言われた版（sov-c-v7・kjb-a-v2c・rom-p5-v7）の
字なしの版で測った。配信の画（720x1280 を 1080x1920 に広げたもの）は 85カットで **1.0〜137**（v5 は 5.8〜57.9）、
撮影の動画（1080x1920）は v5 の3カットで **947〜1206**。線はその間の 300 に置いた（配信の画の最大の約2倍・撮影の動画の
最小の約3分の1）。出してよいと言われた3本も配信の画は全部この線の下で、決まり（フックに粗い配信の画を使わない）は
その後にできたもの（あの3本のフックも、今の決まりでは落ちる）。

## 判定

- **落ち**: フック（`titles` の出ている間）に掛かる配信の画で、鮮明さが線より下のもの。ただし spec の行かカットに
  `event`（その場の出来事そのものが要る画: 飲む・食べる瞬間の本人など。理由を字で書く）があれば落とさない。
  その場合も、同じ素材の窓の中で 0.5秒ごとに測り、いちばん鮮明な秒を並べる。使った秒より 1.5倍以上鮮明な秒があれば人が見る
- **人が見る**: 本編の粗い配信の画のうち、同じ配信の ±180秒に撮った撮影の動画が台帳（`shorts/footage/index.json`）に
  在り、その動画をこの回でまだ1度も使っていないもの（同じ物が写る、もっと良い素材がありうる）。どの素材かを並べる
- ほかは合格。カットごとの数は `measured.cuts` に並ぶ（人の目の表で、粗い行を見る手がかりにする）
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from common import FAIL, HUMAN, NA, PASS, Ctx, clip_entry, ffprobe, hms, iter_frames, result, segments, stream_of, where

SHARP_MIN = 300.0          # 鮮明さ（まん中のラプラシアンの分散）の線。上の「線」
BOX = (0.25, 0.75, 0.30, 0.70)   # 測る所（横の始め・終わり、縦の始め・終わり。画面の割合）
SAMPLES = (0.2, 0.5, 0.8)  # カットの中の測るコマ
NEAR_FOOTAGE_S = 180.0     # 本編の粗い画の近くに撮影の動画があるかを見る幅（配信の秒）
BEST_STEP_S = 0.5          # event のカットで、窓の中を測る間隔
BEST_RATIO = 1.5           # 使った秒よりこれ以上鮮明な秒が窓にあれば、人が見る
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".avif"}
FOOTAGE_INDEX = Path(__file__).resolve().parents[3] / "shorts" / "footage" / "index.json"


def laplacian_var(gray: np.ndarray, mask: np.ndarray | None = None) -> float:
    """白黒のコマのまん中（BOX）の、ラプラシアン（4近傍）の分散。mask が True の画素は数えない。"""
    H, W = gray.shape[:2]
    x0, x1, y0, y1 = int(W * BOX[0]), int(W * BOX[1]), int(H * BOX[2]), int(H * BOX[3])
    g = gray[y0:y1, x0:x1].astype(np.float32)
    lap = (-4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:])
    if mask is not None:
        keep = ~mask[y0:y1, x0:x1][1:-1, 1:-1]
        if keep.sum() < lap.size * 0.2:
            return float("nan")
        lap = lap[keep]
    return float(lap.var())


def kind_of(ctx: Ctx, s: dict) -> str:
    cut = (ctx.plan or {}).get("cuts", [])[s["k"]]
    if cut.get("footage"):
        return "footage"
    if Path(s["path"]).suffix.lower() in IMAGE_EXT or clip_entry(Path(s["path"])).get("art"):
        return "image"
    if s["stream"] != s["path"]:
        return "stream"
    return "other"


def text_mask(plan: dict, f: int, W: int, H: int) -> np.ndarray | None:
    """そのコマに出ている字の絵の箱（少し広げる）。字なしの版で測るときは要らない。"""
    boxes = [o for key in ("overlays", "overlays_anim") for o in (plan.get(key) or [])
             if isinstance(o, dict) and all(k in o for k in ("x", "y", "w", "h", "from", "to"))
             and o["from"] <= f < o["to"]]
    if not boxes:
        return None
    m = np.zeros((H, W), dtype=bool)
    for o in boxes:
        x0, y0 = max(0, int(o["x"]) - 8), max(0, int(o["y"]) - 8)
        m[y0:int(o["y"] + o["h"]) + 8, x0:int(o["x"] + o["w"]) + 8] = True
    return m


def footage_near(video: str, t: float) -> list[dict]:
    try:
        items = json.loads(FOOTAGE_INDEX.read_text(encoding="utf-8")).get("items", [])
    except (OSError, ValueError):
        return []
    out = []
    for it in items:
        st = it.get("stream") or {}
        if st.get("video") == video and st.get("at_s") is not None and abs(float(st["at_s"]) - t) <= NEAR_FOOTAGE_S:
            out.append({"id": it["id"], "at": st.get("at"), "desc": it.get("desc", "")})
    return out


def best_in_window(s: dict, fps: float, W: int, H: int) -> dict | None:
    """event のカット: 同じ素材のファイル（取り込みの窓）を 0.5秒ごとに測り、いちばん鮮明な秒。"""
    from common import native_size
    try:
        w, h = native_size(Path(s["path"]))
    except Exception:  # noqa: BLE001
        return None
    if not w:
        return None
    try:
        n = int(float(ffprobe(Path(s["path"]))["format"]["duration"]) * fps)
    except Exception:  # noqa: BLE001
        n = s["out"]
    step = max(1, int(round(BEST_STEP_S * fps)))
    got = {f: laplacian_var(g) for f, g in iter_frames(Path(s["path"]), range(0, n, step), W, H, gray=True)}
    if not got:
        return None
    f = max(got, key=got.get)
    return {"src_s": hms(s["src_from"] - s["in"] / fps + f / fps), "sharp": round(got[f], 1)}


def check(ctx: Ctx) -> dict:
    cid, title = "sharpness", "画質（粗い画）"
    th = {"sharp_min": SHARP_MIN, "box": BOX, "samples": SAMPLES, "judged_kind": "stream",
          "near_footage_s": NEAR_FOOTAGE_S, "best_ratio_for_event": BEST_RATIO}
    segs = segments(ctx.plan)
    if not segs:
        return result(cid, title, NA, "時間割（plan.json の cuts）が無く、カットの元素材に戻れない", thresholds=th)
    plan, fps = ctx.plan, float(ctx.plan["fps"])
    src = ctx.plate or ctx.mp4
    use_mask = ctx.plate is None
    want = {s["k"]: [s["at"] + min(s["frames"] - 1, int(s["frames"] * p)) for p in SAMPLES] for s in segs}
    vals: dict[int, float] = {}
    for f, g in iter_frames(src, [f for fs in want.values() for f in fs], ctx.W, ctx.H, gray=True):
        vals[f] = laplacian_var(g, text_mask(plan, f, ctx.W, ctx.H) if use_mask else None)
    hook_to = max([int(t.get("to", 0)) for t in plan.get("titles") or []] + [0])
    rows, problems, fails, humans = [], [], [], []
    for s in segs:
        cut = plan["cuts"][s["k"]]
        v = [vals[f] for f in want[s["k"]] if f in vals and not np.isnan(vals[f])]
        sharp = round(float(np.median(v)), 1) if v else None
        kind = kind_of(ctx, s)
        hook = s["at"] < hook_to
        row = {"k": s["k"], "row": cut.get("row"), "from_s": round(s["from_s"], 2), "to_s": round(s["to_s"], 2),
               "kind": kind, "sharp": sharp, "hook": hook, "coarse": kind == "stream" and sharp is not None and sharp < SHARP_MIN,
               "event": cut.get("event")}
        if row["coarse"] and hook:
            if row["event"]:
                best = best_in_window(s, fps, ctx.W, ctx.H)
                row["best"] = best
                if best and best["sharp"] >= BEST_RATIO * sharp and best["sharp"] - sharp >= 20:
                    humans.append(row)
                    problems.append(f"{where(s)}: フックの配信の画（出来事そのもの: {row['event']}）の鮮明さ {sharp}。"
                                    f"同じ窓に {best['src_s']} の {best['sharp']} がある → その秒を使えないか見る")
            else:
                fails.append(row)
                problems.append(f"{where(s)}: フック（題の札の間）に粗い配信の画（鮮明さ {sharp}・線 {SHARP_MIN:.0f}）"
                                f" → 撮影の動画・あやと島カードの写真に替える。出来事そのものが要る画なら spec の行に event を書く")
        elif row["coarse"]:
            near = footage_near(s["stream"], (s["src_from"] + s["src_to"]) / 2)
            used = {c.get("footage") for c in plan["cuts"] if c.get("footage")}   # もう使った素材は見たうえで選んでいる
            near = [x for x in near if x["id"] not in used]
            if near:
                row["near_footage"] = near
                humans.append(row)
                problems.append(f"{where(s)}: 粗い配信の画（鮮明さ {sharp}）。同じ場面の撮影の動画 "
                                + "・".join(f"{x['id']}（配信の {x['at']}・{x['desc']}）" for x in near[:3])
                                + " がある → 同じ物が写るなら替える")
        rows.append(row)
    by = {k: [r["sharp"] for r in rows if r["kind"] == k and r["sharp"] is not None] for k in ("stream", "footage", "image", "other")}
    m = {"cuts": rows, "by_kind": {k: {"n": len(v), "min": min(v), "max": max(v)} for k, v in by.items() if v},
         "hook_to_s": round(hook_to / fps, 2), "coarse_hook": len([r for r in rows if r["coarse"] and r["hook"]]),
         "coarse_body": len([r for r in rows if r["coarse"] and not r["hook"]]), "measured_on": "no_text" if not use_mask else "mp4"}
    if fails:
        status, summ = FAIL, f"フックに粗い配信の画 {len(fails)} カット（鮮明さ {', '.join(str(r['sharp']) for r in fails)}・線 {SHARP_MIN:.0f}）"
    elif humans:
        status, summ = HUMAN, f"粗い配信の画のうち、もっと良い素材がありうるもの {len(humans)} カット"
    else:
        status, summ = PASS, f"フックに粗い配信の画は無い（題の札 {m['hook_to_s']}秒まで）"
    summ += f"。粗い配信の画 {m['coarse_hook']}（フック）＋{m['coarse_body']}（本編）/ {len(rows)} カット"
    if by.get("footage"):
        summ += f"。撮影の動画 {len(by['footage'])} カット（鮮明さ {min(by['footage']):.0f}〜）"
    return result(cid, title, status, summ, measured=m, thresholds=th, problems=problems)
