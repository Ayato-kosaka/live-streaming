"""字と顔の検査: 字幕・【大】の字が、ぼかしていない顔（＝配信者本人）の目と鼻に被っていないか。

自撮りの画が多い。字を画面の縦のまん中に置くと、顔のど真ん中（目・口元）に乗る（あやとの決め
2026-10-16: 字はまん中が基本、ただし顔は避ける）。守るのは目と鼻（顔の箱の上端から鼻の下まで。
あやとの直し #926「口くらいなら被っても良い」）。書き出し（render.py の avoid_faces）が行ごとに
目と鼻の下へずらす（上へは逃がさない）。ここはその結果を、書き出したコマで数える。

- 顔は**字なしの書き出し（plate）**で探す。字を重ねた版で探すと、字が顔を隠して見つからず、
  被っているものほど通ってしまう
- 字が出ている全コマで探す（前後3〜4コマも。つなぐため）。見つけ役（YuNet。重みが無ければ Haar）・肌色・
  ぼかしの判定は顔の検査（faces.py）と同じ。YuNet の重みは書き出しの道具の `render/models/` にもあれば使う
- 1〜4コマだけ出る箱は顔として数えない（食べ物・車輪・手を顔と間違えた箱。本物の顔は続けて出る）。
  隣のコマ（1コマ空いてよい）で重なる箱（IoU 0.3 以上）をつなぎ、5つ以上つながったものだけが顔
- 目と鼻の範囲は、YuNet の5点から（鼻の先の点から口の点へ 4割下りた所までを鼻の下とする。
  `facetrack.guard_zone`）。点の無い Haar では箱の高さの 72%。書き出しも同じ関数で決める
- 字の箱は、時間割（plan.json）の字の絵の、濃さ 16 以上の画素の外接矩形（縁・発光を含む）。
  揺れ・出入りの動きの途中の絵（overlays_anim）も1枚ずつ数える
- 題の札（頭の4秒）は数えない（置き場を決めてある札で、字幕とは別。被りの数は measured に出す）
- 1コマでも重なれば fail。ただし spec の行に `face_overlap_ok: {"frames": N, "why": …}`（顔が画面いっぱいで
  置き場が無い、と人が決めた例外）があれば、その行（字幕が2枚に割れても行で足す）は N コマまで通し、超えたら落とす
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

import faces as F
from facetrack import HAAR_ZONE, MIN_RUN, NOSE_TO_MOUTH, RUN_GAP, RUN_IOU, guard_zone, keep_persistent
from common import FAIL, NA, PASS, RENDER, Ctx, frame_memo, iter_frames, result

ALPHA_MIN = 16            # 字の箱の線（safe_area の Card.bbox と同じ）
SKIP_KINDS = ("title",)   # 題の札。字幕を兼ねる札の写し（card: True）も数えない
RENDER_YUNET = RENDER / "models" / "face_detection_yunet_2023mar.onnx"


def text_boxes(plan: dict) -> list[dict]:
    """字の箱（題の札を除く）。{from, to, box: [x0, y0, x1, y1], kind, text}。"""
    out, seen = [], {}
    for o in list(plan.get("overlays") or []) + list(plan.get("overlays_anim") or []):
        if o.get("kind") in SKIP_KINDS or o.get("card") or not o.get("png") or not os.path.exists(o["png"]):
            continue
        if o["png"] not in seen:
            a = np.asarray(Image.open(o["png"]).convert("RGBA"))[:, :, 3]
            ys, xs = np.nonzero(a >= ALPHA_MIN)
            seen[o["png"]] = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else None
        bb = seen[o["png"]]
        if bb is None:
            continue
        x, y = int(o["x"]), int(o["y"])
        out.append({"from": int(o["from"]), "to": int(o["to"]), "kind": o.get("kind"), "text": o.get("text", ""),
                    "big": o.get("big"), "line": o.get("line"), "ok": o.get("face_overlap_ok"),
                    "box": [x + bb[0], y + bb[1], x + bb[2], y + bb[3]]})
    return out


def title_boxes(plan: dict) -> list[dict]:
    out = []
    for o in plan.get("overlays") or []:
        if o.get("kind") == "title" and not o.get("card"):
            out.append({"from": int(o["from"]), "to": int(o["to"]),
                        "box": [int(o["x"]), int(o["y"]), int(o["x"]) + int(o["w"]), int(o["y"]) + int(o["h"])]})
    return out


def overlap(t, f) -> int:
    x0, y0, x1, y1 = t
    fx, fy, fw, fh = f[:4]
    return max(0, min(x1, fx + fw) - max(x0, fx)) * max(0, min(y1, fy + fh) - max(y0, fy))


def check(ctx: Ctx) -> dict:
    title = "字と顔（被り）"
    th = {"alpha_min": ALPHA_MIN, "min_run": MIN_RUN, "run_gap": RUN_GAP, "run_iou": RUN_IOU,
          "skin_min": F.SKIN_MIN, "blurred_if": f"細かさ < まわりの {F.BLUR_RATIO} 倍 かつ < {F.BLUR_ABS}",
          "fail_if": "字の箱と、顔の目と鼻の範囲（箱の上端〜鼻の下）が1コマでも重なる"
                     "（spec の face_overlap_ok の行は、書いたコマ数を超えたら）",
          "nose_to_mouth": NOSE_TO_MOUTH, "haar_zone": HAAR_ZONE,
          "not_counted": list(SKIP_KINDS)}
    if not ctx.plan:
        return result("text_on_face", title, NA, "work（plan.json）が無い（字の箱が分からない）", thresholds=th)
    if ctx.plate is None or not os.path.exists(ctx.plate):
        return result("text_on_face", title, NA,
                      "字なしの書き出し（plate）が無い。字の下の顔は字を重ねた版では見つからないので、字なしの版で探す",
                      thresholds=th)
    try:
        import cv2
    except ImportError:
        return result("text_on_face", title, NA, "OpenCV が無い", thresholds=th)
    d = F.detector(cv2, also=(RENDER_YUNET,), full=True)
    if d is None:
        return result("text_on_face", title, NA, "顔の検出器が無い（YuNet の重みも Haar も無い）", thresholds=th)
    name, run_det, wants_gray = d
    th["detector"] = name
    boxes = text_boxes(ctx.plan)
    titles = title_boxes(ctx.plan)
    n = ctx.nframes
    raw: list[list] = [[] for _ in range(n)]

    def detect(img):
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        sm = cv2.resize(gray if wants_gray else cv2.cvtColor(img, cv2.COLOR_RGB2BGR),
                        (int(ctx.W * F.DET_SCALE), int(ctx.H * F.DET_SCALE)), interpolation=cv2.INTER_AREA)
        out = []
        for det in run_det(sm):
            X, Y, Wd, Hd = [int(round(v / F.DET_SCALE)) for v in det[:4]]
            lm = [v / F.DET_SCALE for v in det[4:14]]
            skin = F.skin_share(cv2, img, X, Y, Wd, Hd)
            inner, outer = F.sharpness(cv2, gray, X, Y, Wd, Hd)
            out.append((X, Y, Wd, Hd, skin, inner, outer, lm))
        return out

    # 字が出ているコマ（と、つなぐために前後 MIN_RUN+RUN_GAP コマ）だけ探す。字の無いコマの顔は被りようがない
    pad = MIN_RUN + RUN_GAP
    want = sorted({g for t in boxes for g in range(max(0, t["from"] - pad), min(n, t["to"] + pad))})
    dropped = {"not_skin": 0, "blurred": 0}
    for f, img in iter_frames(ctx.plate, want, ctx.W, ctx.H):
        for (X, Y, Wd, Hd, skin, inner, outer, lm) in frame_memo(f"textface5:{name}", img, lambda: detect(img)):
            if skin < F.SKIN_MIN:
                dropped["not_skin"] += 1
                continue
            if inner < F.BLUR_ABS and (outer <= 0 or inner < F.BLUR_RATIO * outer):
                dropped["blurred"] += 1
                continue
            raw[f].append([X, Y, Wd, Hd] + lm)
    # 続けて出たかは顔の箱ぜんぶでつなぎ、字と比べるのは目と鼻の範囲だけ
    faces = [[guard_zone(r[0], r[1], r[2], r[3], r[4:14] or None) for r in row] for row in keep_persistent(raw)]
    lines: dict = {}
    for t in boxes:
        for f in range(max(0, t["from"]), min(n, t["to"])):
            for fb in faces[f]:
                ov = overlap(t["box"], fb)
                if ov <= 0:
                    continue
                # 例外の印は spec の行ごと（1行が2枚の字幕に割れても、重なりのコマは行で足す）
                key = ("line", t["line"]) if t.get("ok") and t.get("line") is not None else (t["kind"], t["text"])
                r = lines.setdefault(key, {"kind": t["kind"], "text": t["text"], "big": t.get("big"), "ok": t.get("ok"),
                                           "frames": set(), "max_px": 0, "first": f, "text_box": t["box"], "face": fb})
                r["frames"].add(f)
                if ov > r["max_px"]:
                    r.update(max_px=ov, text_box=t["box"], face=fb, worst=f)
                r["first"] = min(r["first"], f)
    rows, allowed = [], []
    for r in sorted(lines.values(), key=lambda r: r["first"]):
        row = {**{k: v for k, v in r.items() if k != "frames"}, "frames": len(r["frames"]),
               "from_t": round(r["first"] / ctx.fps, 2)}
        # spec の行に face_overlap_ok（顔が画面いっぱいで置き場が無い、と人が決めた例外）があれば、
        # 書いたコマ数までは通す。超えたら落とす（置き場や画が変わって重なりが増えたのに、黙って通さない）
        if r.get("ok") and row["frames"] <= int(r["ok"]["frames"]):
            allowed.append(row)
        else:
            rows.append(row)
    title_hits = sum(1 for t in titles for f in range(max(0, t["from"]), min(n, t["to"]))
                     if any(overlap(t["box"], fb) > 0 for fb in faces[f]))
    m = {"detector": name, "frames": len(want), "frames_total": n, "frames_with_face": sum(1 for x in faces if x),
         "detections": sum(len(x) for x in raw), "dropped": dropped,
         "dropped_short": sum(len(x) for x in raw) - sum(len(x) for x in faces),
         "text_boxes": len(boxes), "lines_on_face": rows, "lines_allowed": allowed,
         "title_card_frames_on_face": title_hits}
    note = (f"・例外の印で通した行 {len(allowed)}（" + "、".join(f"「{a['text'][:10]}」{a['frames']}/{a['ok']['frames']}コマ"
                                                  for a in allowed) + "）") if allowed else ""
    if rows:
        return result("text_on_face", title, FAIL,
                      f"字が顔に被っている行 {len(rows)}（{sum(r['frames'] for r in rows)}コマ）" + note,
                      measured=m, thresholds=th,
                      problems=[f"{r['from_t']}秒〜 {r['kind']}「{r['text'][:24]}」: 目と鼻 {[round(v) for v in r['face'][:4]]}"
                                f" と字 {r['text_box']}"
                                f" が {r['frames']}コマ重なる（いちばん多いコマ {r['worst']}・{round(r['max_px'])}px²）"
                                + (f"。例外の印は {r['ok']['frames']}コマまで" if r.get("ok") else "") for r in rows])
    return result("text_on_face", title, PASS,
                  f"字の出ている {len(want)}コマで顔のあるコマ {m['frames_with_face']}・字の箱 {len(boxes)} 枚・"
                  f"重なり {'例外の行だけ' if allowed else '0'}" + note,
                  measured=m, thresholds=th)
