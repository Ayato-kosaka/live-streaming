"""YouTube ライブの札（様式の `live_badge`。帳面 F-064・制作 #1097）の検査。

あやと（2026-11-02）「YouTubeライブってわかる表紙を上部左寄せに入れたいなぁ」。札を出す回で、

1. **出ているか**: 0コマ目・1秒ごと・最後のコマで、札の絵が時間割の置き場に見えるか（字の置き場の検査
   `text.Card` と同じ物差し: 不透明な画素の差の平均が `PRESENT_MAE` より小さい）
2. **出る間**: 0コマ目から最後のコマまで（時間割の from / to）
3. **置き場**: 安全領域の中（上 360 は YouTube の上のチップの下端 355 と TikTok の上の帯 240 の下。
   左 120・右の列。`common.rect_violations`）
4. **ぶつかっていないか**: 札と同じ時に出ている字（題の札・全編のタイトル・字幕・【大】の字・注・終わりの札・
   テロップ）と、札（inset）の帯に、`MARGIN` px より近づいていないか。字の箱は絵の見える画素（濃さ 16 以上）で取る

札を出さない回（様式の `live_badge.enabled` が false・時間割に札が無い）は**対象外**で pass にする
（終了コードを変えない）。様式は出すと言っているのに時間割に札が無ければ落とす（書き出しが足し損ねた）。
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

from common import FAIL, PASS, Ctx, iter_frames, rect_violations, result, safe_area
from text import PRESENT_MAE, Card

TITLE = "YouTube ライブの札"
MARGIN = 8          # 札とほかの字の箱がこれより近ければ「ぶつかる」（書き出しは 16px 空ける。様式の gap）
ALPHA_MIN = 16      # 見える画素の線（字の置き場・字と顔の検査と同じ）
EVERY_S = 1.0       # 出ているかを見る間隔（秒）


def _vis_box(png: str, x: int, y: int, memo: dict) -> list[int] | None:
    """絵の見える画素の箱 [x0, y0, x1, y1]（画面の座標）。絵が無ければ None。"""
    if png not in memo:
        if not png or not os.path.exists(png):
            memo[png] = None
        else:
            a = np.asarray(Image.open(png).convert("RGBA"))[:, :, 3]
            ys, xs = np.nonzero(a >= ALPHA_MIN)
            memo[png] = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else None
    bb = memo[png]
    return None if bb is None else [x + bb[0], y + bb[1], x + bb[2], y + bb[3]]


def _near(a: list[int], b: list[int], m: int) -> bool:
    """箱 a と b が m px より近い（重なる・触れる）か。"""
    return a[0] < b[2] + m and b[0] < a[2] + m and a[1] < b[3] + m and b[1] < a[3] + m


def _name(o: dict, plan: dict) -> str:
    k = o.get("kind")
    if k == "title":
        return "題の札" if any(t.get("look") == "card" for t in plan.get("titles") or []) else "タイトル"
    if k == "caption":
        return "【大】の字" if o.get("big") else "字幕"
    if k == "note":
        ends = {n.get("text") for n in plan.get("notes") or [] if n.get("end_note")}
        return "終わりの札" if o.get("text") in ends else "注"
    if k == "telop":
        return "テロップ"
    return str(k)


def _inset_boxes(plan: dict, W: int) -> list[dict]:
    """札（inset）の帯の箱と出る間（書き出しの busy_bands と同じ測りかた。帯は元素材を拡大した画なので重ね物に無い）。"""
    out = []
    for c in plan.get("cuts") or []:
        ins = c.get("inset")
        if not ins:
            continue
        r0 = ins["keys"][0]["rect"] if ins.get("keys") else ins["rect"]
        w = int(ins.get("w", 840))
        oh = r0[3] * w / r0[2]
        cy = int(ins.get("cy", 765))
        out.append({"from": int(c["at"]), "to": int(c["at"]) + int(c["frames"]),
                    "box": [round((W - w) / 2), round(cy - oh / 2), round((W + w) / 2), round(cy + oh / 2)]})
    return out


def check(ctx: Ctx) -> dict:
    plan = ctx.plan or {}
    cfg = (ctx.style or {}).get("live_badge") or {}
    lb = plan.get("live_badge")
    th = {"margin_px": MARGIN, "present_mae": PRESENT_MAE, "every_s": EVERY_S}
    if not lb:
        if cfg.get("enabled"):
            return result("live_badge", TITLE, FAIL,
                          f"様式は札を出す（look {cfg.get('look')}）のに、時間割に札が無い（書き出しが足していない）",
                          measured={"applicable": True}, thresholds=th,
                          problems=["様式の live_badge.enabled が true なのに、plan.json に live_badge が無い"])
        return result("live_badge", TITLE, PASS, "対象外（札を出さない回）", measured={"applicable": False},
                      thresholds=th)

    problems: list[str] = []
    n = ctx.nframes
    m: dict = {"applicable": True, "look": lb.get("look"), "from": lb.get("from"), "to": lb.get("to"),
               "frames": n, "made_room": lb.get("made_room")}
    memo: dict = {}
    ovs = [o for o in plan.get("overlays") or [] if o.get("kind") == "badge"]
    if not ovs:
        problems.append("札の絵が、時間割の重ね物（overlays）に無い")

    # 出る間: 0コマ目から最後まで
    if int(lb.get("from", -1)) != 0 or int(lb.get("to", -1)) < n:
        problems.append(f"札の出る間が {lb.get('from')}〜{lb.get('to')}コマ（0〜{n}コマのはず）")

    # 置き場: 安全領域の中
    box = _vis_box(lb.get("png", ""), int(lb["x"]), int(lb["y"]), memo) or \
        [int(lb["x"]), int(lb["y"]), int(lb["x"]) + int(lb["w"]), int(lb["y"]) + int(lb["h"])]
    m["box"] = box
    sa = safe_area(ctx.style)
    sv = rect_violations(box[0], box[1], box[2] - box[0], box[3] - box[1], sa)
    m["safe_violations"] = sv
    if sv:
        problems.append("札が安全領域の外: " + "、".join(sv))

    # ぶつかり: 同じ時に出ている字の箱と、札（inset）の帯
    a0, a1 = int(lb.get("from", 0)), int(lb.get("to", n))
    hits, seen = [], set()
    others = [o for o in list(plan.get("overlays") or []) + list(plan.get("overlays_anim") or [])
              if o.get("kind") != "badge" and not o.get("card")]
    for o in others:
        if not (int(o["from"]) < a1 and a0 < int(o["to"])):
            continue
        ob = _vis_box(o.get("png", ""), int(o["x"]), int(o["y"]), memo)
        if ob is None or not _near(box, ob, MARGIN):
            continue
        key = (_name(o, plan), o.get("text", ""))
        if key in seen:
            continue
        seen.add(key)
        hits.append({"what": key[0], "text": key[1], "from": int(o["from"]), "to": int(o["to"]), "box": ob})
    for ib in _inset_boxes(plan, ctx.W):
        if ib["from"] < a1 and a0 < ib["to"] and _near(box, ib["box"], MARGIN):
            hits.append({"what": "札（inset）の帯", "text": "", **ib})
    m["collisions"] = hits
    for h in hits:
        problems.append(f"{h['what']}「{h['text'][:16]}」（{h['from']}〜{h['to']}コマ・y {h['box'][1]}〜{h['box'][3]}）が"
                        f"札（y {box[1]}〜{box[3]}）と {MARGIN}px より近い")

    # 出ているか: 0コマ目・1秒ごと・最後のコマ
    looked, missing = [], []
    if ovs:
        card = Card(ovs[0])
        step = max(1, round(EVERY_S * ctx.fps))
        want = sorted({f for f in list(range(a0, min(a1, n), step)) + [a0, min(a1, n) - 1] if 0 <= f < n})
        for f, img in iter_frames(ctx.mp4, want, ctx.W, ctx.H):
            mae = card.calibrate(img)
            looked.append(f)
            if not mae < PRESENT_MAE:
                missing.append({"frame": f, "mae": round(mae, 1)})
        if len(looked) < len(want):
            problems.append(f"見たいコマ {len(want)} のうち {len(looked)} しか読めない")
    m["frames_looked"] = len(looked)
    m["missing_frames"] = missing
    if missing:
        fs = ", ".join(str(x["frame"]) for x in missing[:8])
        problems.append(f"札が見えないコマ {len(missing)}/{len(looked)}（{fs}{' …' if len(missing) > 8 else ''}）")

    status = FAIL if problems else PASS
    summ = (f"look {lb.get('look')}・{len(looked)}コマで見えた・ぶつかり {len(hits)}"
            if status == PASS else f"{len(problems)}件（見えないコマ {len(missing)}・ぶつかり {len(hits)}）")
    return result("live_badge", TITLE, status, summ, measured=m, thresholds=th, problems=problems)
