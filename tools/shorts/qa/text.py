"""字の検査: 字幕が声と同じコマで出るか／字（タイトル・テロップ・字幕）が安全領域に収まっているか。

どちらも「時間割（plan.json）がそう言っている」ではなく、**書き出したコマの画素**で確かめる。
時間割は、どのコマのどこを見ればよいかの手がかりにだけ使う。
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

from common import (FAIL, NA, PASS, SR, Ctx, iter_frames, mono, overlays, rect_violations,
                    result, safe_area, safe_mask)

# 字の絵（PNG）の、不透明な画素（字の色と縁）と、コマの同じ画素の差の平均。両方を 1/3 に
# 縮めてから比べる（細い線は H.264 でにじむので、そのままだと出ていても差が大きく出る）。
# 実測（1/3、位置を合わせたあと）: 出ている M PLUS の字幕 0.5〜1.5、細い線ばかりの代わりの
# 書体（DejaVu の「NO GLYPH」）でも 16 以下。出ていない（地・別のページの字幕）は 120 以上。
# 間を取って 35。地がたまたま白と黒の縞でも、字の形と画素ごとに揃うことはない
PRESENT_MAE = 35.0
K = 3
# 書き出しは、字の絵を偶数の画素に丸めて置くことがある（yuv420 の色差に揃える）。時間割の
# x が奇数だと、実物は 1px ずれる。細い線の字だと、それだけで差が 33 まで上がった。
# だから字の絵ごとに、出ているはずのコマで ±2px を探して、ずれを決めてから比べる
SHIFT = 2
SYNC_MAX_FRAMES = 1          # 字幕は声の出だしから ±1コマ以内に出ること（あやとの決め）
EARLY_OFF_FRAMES = 3         # 声が終わる 3コマより前に字幕が消えたら（次の字幕も無いのに）落とす
ONSET_REL_DB = -30.0         # 声の出だし: その行のいちばん大きい所から -30dB を越えた最初のサンプル
ONSET_FLOOR_DBFS = -60.0
PLATE_DIFF = 40              # 字なしの書き出しとの差で、字の画素とみなす差（0〜255）
PLATE_OUTSIDE_PX = 400       # 安全領域の外に、字の画素がこれより多く出たら落とす（文字1つぶんほど）


class Card:
    """重ねた字の絵1枚。不透明な画素だけで、コマと比べる。"""

    def __init__(self, ov: dict):
        img = Image.open(ov["png"]).convert("RGBA")
        a = np.asarray(img)
        self.rgb = a[:, :, :3]
        self.alpha = a[:, :, 3]
        self.mask = self.alpha >= 250
        self.h, self.w = self.alpha.shape
        self.hs, self.ws = self.h // K * K, self.w // K * K
        self.rgb_s = _shrink(self.rgb[:self.hs, :self.ws])
        self.mask_s = _shrink(self.alpha[:self.hs, :self.ws, None])[:, :, 0] >= 250
        ys, xs = np.nonzero(self.alpha >= 16)
        # 箱（見える範囲）。字幕は地の箱ごと、テロップは字の形だけ
        self.bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else (0, 0, self.w, self.h)
        self.ov = ov
        self.off = (0, 0)

    def mae_at(self, frame: np.ndarray, x: int, y: int) -> float:
        """左上 (x, y) に置いたときの差。はみ出す置き場は 255（そこには無い）。"""
        H, W = frame.shape[:2]
        if x < 0 or y < 0 or x + self.ws > W or y + self.hs > H or self.mask_s.sum() < 20:
            return 255.0
        crop = _shrink(frame[y:y + self.hs, x:x + self.ws])
        m = self.mask_s
        return float(np.abs(crop[m] - self.rgb_s[m]).mean())

    def at(self, frame: np.ndarray) -> float:
        """時間割の位置（＋決めたずれ）での差。"""
        return self.mae_at(frame, int(self.ov["x"]) + self.off[0], int(self.ov["y"]) + self.off[1])

    def calibrate(self, frame: np.ndarray) -> float:
        """時間割の位置のまわり ±SHIFT px で、いちばん合う所をずれとして覚える。"""
        x, y = int(self.ov["x"]), int(self.ov["y"])
        best = min((self.mae_at(frame, x + dx, y + dy), dx, dy)
                   for dy in range(-SHIFT, SHIFT + 1) for dx in range(-SHIFT, SHIFT + 1))
        if best[0] < PRESENT_MAE:
            self.off = (best[1], best[2])
        return best[0]


def _shrink(a: np.ndarray) -> np.ndarray:
    """K 画素四方の平均で縮める（縦横とも K の倍数の大きさで渡す）。"""
    h, w, c = a.shape
    return a.reshape(h // K, K, w // K, K, c).mean(axis=(1, 3))


def _cards(ctx: Ctx) -> list[Card]:
    def load():
        out = []
        for ov in overlays(ctx.plan):
            if ov.get("png") and os.path.exists(ov["png"]):
                out.append(Card(ov))
            else:
                ctx.notes.append(f"{ov.get('kind')}（{ov.get('from')}コマ〜）の絵 {ov.get('png')} が無い")
        return out
    return ctx.memo("cards", load)


# ---------------------------------------------------------------- 字幕と声

def _env(x: np.ndarray, win: int = 120) -> np.ndarray:
    """2.5ms の移動 RMS。**後ろ向き**（i 番目は i までの 2.5ms）。

    前向きに取ると、声が出る 2.5ms 前から値が上がり、コマの境目では出だしが1コマ早く読める
    （6コマ遅らせた声が 5コマに読めた）。
    """
    c = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    i = np.arange(1, len(x) + 1)
    return np.sqrt(np.maximum((c[i] - c[np.maximum(0, i - win)]) / win, 0))


def voice_span(narr: np.ndarray, lo: int, hi: int, peak_lo: int, peak_hi: int) -> tuple[int, int] | None:
    """[lo, hi) サンプルの中で、声が始まるサンプルと終わるサンプル。"""
    seg = narr[max(0, lo):hi]
    if len(seg) == 0:
        return None
    env = _env(seg)
    pk = env[max(0, peak_lo - lo):max(0, peak_hi - lo)]
    peak = float(pk.max()) if len(pk) else float(env.max())
    if peak <= 0:
        return None
    thr = max(peak * 10 ** (ONSET_REL_DB / 20), 10 ** (ONSET_FLOOR_DBFS / 20))
    idx = np.flatnonzero(env >= thr)
    if len(idx) == 0:
        return None
    return max(0, lo) + int(idx[0]), max(0, lo) + int(idx[-1])


def check_subtitle_sync(ctx: Ctx) -> dict:
    title = "字幕と声のずれ"
    th = {"max_offset_frames": SYNC_MAX_FRAMES, "early_off_frames": EARLY_OFF_FRAMES,
          "present_mae_max": PRESENT_MAE, "voice_onset": f"行の最大から {ONSET_REL_DB}dB"}
    plan = ctx.plan
    if not plan or not plan.get("narration"):
        return result("subtitle_sync", title, NA if not plan else FAIL,
                      "時間割（plan.json）が無い" if not plan else "ナレーションが1行も無い（ナレーションが主役のはず）",
                      thresholds=th, problems=[] if not plan else ["ナレーションが無い"])
    spf = int(round(SR / plan["fps"]))
    st = ctx.stems()
    if st is None:
        # 声の出だしは、書き出しに使ったナレーションの束でしか測れない（仕上がりの音には
        # BGM と元音声が混ざっていて、出だしの1コマを言い切れない）
        return result("subtitle_sync", title, NA, "work に stem_narration.f32 が無く、声の出だしを測れない",
                      thresholds=th)
    narr = mono(st["narration"])
    lines = plan["narration"]
    by_line: dict[int, list[Card]] = {}
    for c in _cards(ctx):
        if c.ov.get("kind") == "caption" and "line" in c.ov:
            by_line.setdefault(int(c.ov["line"]), []).append(c)
    for v in by_line.values():
        v.sort(key=lambda c: c.ov["from"])

    # 声の出だし・終わり（サンプル → コマ）。前後の行の声を拾わないよう、隣の行の間で切る
    voice = []
    for i, ln in enumerate(lines):
        prev_end = (lines[i - 1]["at"] + lines[i - 1]["frames"]) * spf if i else 0
        lo = max(prev_end, (ln["at"] - 15) * spf)
        hi = (ln["at"] + ln["frames"] + 15) * spf
        nxt = lines[i + 1]["at"] * spf if i + 1 < len(lines) else len(narr)
        sp = voice_span(narr, lo, min(hi, nxt), ln["at"] * spf, (ln["at"] + ln["frames"]) * spf)
        voice.append(None if sp is None else (sp[0] // spf, sp[1] // spf))

    # 行ごとに2つの窓: 出だし（最初のページ）と、終わり（最後のページ）。
    # 終わりは、その窓に掛かるその行の字の絵ぜんぶで見る。揺れる字は置き場ごとに別の絵として控えてあり、
    # 最後の絵だけで見ると、震えが ±2px の字（感情の字幕）は前の置き場でもたまたま当たって、
    # 「声より早く消えた」と誤った（2026-10-16、A の「この時点で、あと20分」）
    wins: dict[tuple[int, str], tuple[list[Card], list[int]]] = {}
    want: dict[int, list[Card]] = {}
    for i, ln in enumerate(lines):
        cs = by_line.get(i, [])
        if not cs or voice[i] is None:
            continue
        v0, v1 = voice[i]
        for key, ref, v in (("on", cs[0].ov["from"], v0), ("off", cs[-1].ov["to"], v1)):
            a, b = max(0, min(ref, v) - 6), min(ctx.nframes - 1, max(ref, v) + 6)
            cards = [cs[0]] if key == "on" else \
                [c for c in cs if int(c.ov["from"]) <= b + 1 and int(c.ov["to"]) >= a - 1] or [cs[-1]]
            wins[(i, key)] = (cards, list(range(a, b + 1)))
            for f in range(a, b + 1):
                for c in cards:
                    if c not in want.setdefault(f, []):
                        want[f].append(c)
    # まず字の絵ごとに、出ているはずの真ん中のコマで置き場のずれ（±2px）を決める
    mids: dict[int, list[Card]] = {}
    for cs in by_line.values():
        for c in cs:
            mids.setdefault(min(ctx.nframes - 1, (int(c.ov["from"]) + int(c.ov["to"])) // 2), []).append(c)
    for f, img in iter_frames(ctx.mp4, list(mids), ctx.W, ctx.H):
        for c in mids[f]:
            c.calibrate(img)
    mae: dict[tuple[int, int], float] = {}
    for f, img in iter_frames(ctx.mp4, list(want), ctx.W, ctx.H):
        for c in want[f]:
            mae[(id(c), f)] = c.at(img)

    def present(c: Card, f: int) -> bool | None:
        v = mae.get((id(c), f))
        return None if v is None else v < PRESENT_MAE

    def present_any(cards: list[Card], f: int) -> bool | None:
        got = [present(c, f) for c in cards]
        return True if any(g for g in got) else (None if all(g is None for g in got) else False)

    problems, worst, rows = [], 0, []
    for i, ln in enumerate(lines):
        cs = by_line.get(i, [])
        row = {"line": i, "at": ln["at"], "voice_on": None, "caption_on": None, "offset": None}
        rows.append(row)
        if voice[i] is None:
            problems.append(f"{i}行目: 声が聞こえない（stem_narration.f32 のその場所が無音）")
            continue
        v0, v1 = voice[i]
        row["voice_on"], row["voice_off"] = v0, v1
        if not cs:
            problems.append(f"{i}行目（{ln['at']}コマ目）: 声はあるのに字幕が無い")
            continue
        (first,), fr = wins[(i, "on")]
        on = next((f for f in fr if present(first, f) and present(first, f + 1) is not False), None)
        if on is None:
            problems.append(f"{i}行目: 字幕が出たコマが見つからない（{fr[0]}〜{fr[-1]}コマ目を見た）")
            continue
        if on == fr[0]:
            # 見た範囲の最初から出ていた: もっと前から出ている（ずれは少なくともこれだけ）
            row["note"] = "見た範囲の最初から出ていた"
        off = on - v0
        row.update({"caption_on": on, "offset": off})
        worst = max(worst, abs(off))
        if abs(off) > SYNC_MAX_FRAMES:
            problems.append(f"{i}行目: 声は {v0} コマ目、字幕は {on} コマ目（{off:+d}コマ）")
        # 終わり: 最後のページが消えたコマ。次の行の字幕がもう出ているなら、早く消えても構わない
        lasts, fr2 = wins[(i, "off")]
        gone = next((f for f in fr2 if present_any(lasts, f) is False and present_any(lasts, f - 1)), None)
        row["caption_off"] = gone
        nxt = by_line.get(i + 1)
        nxt_from = nxt[0].ov["from"] if nxt else None
        if gone is not None and gone < v1 - EARLY_OFF_FRAMES and (nxt_from is None or nxt_from > gone):
            problems.append(f"{i}行目: 声は {v1} コマ目まであるのに、字幕は {gone} コマ目で消える")
    m = {"voice_from": "stem_narration.f32", "lines": rows, "worst_offset_frames": worst,
         "frames_looked": len(want)}
    return result("subtitle_sync", title, FAIL if problems else PASS,
                  f"{len(lines)}行・いちばん大きいずれ {worst}コマ", measured=m, thresholds=th, problems=problems)


# ---------------------------------------------------------------- 安全領域

def _locate(card: Card, img: np.ndarray) -> tuple[int, int, float] | None:
    """字の絵が、コマのどこにあるか。まず時間割の位置、無ければ全体を探す。"""
    m0 = card.calibrate(img)
    if m0 < PRESENT_MAE:
        return int(card.ov["x"]) + card.off[0], int(card.ov["y"]) + card.off[1], m0
    try:
        import cv2
    except ImportError:
        return None
    # 1/4 に縮めて、不透明な画素だけで当てる（地の透けた所は比べない）
    k = 4
    small = cv2.resize(img, (img.shape[1] // k, img.shape[0] // k), interpolation=cv2.INTER_AREA)
    tw, thh = max(4, card.w // k), max(4, card.h // k)
    tpl = cv2.resize(card.rgb.astype(np.uint8), (tw, thh), interpolation=cv2.INTER_AREA)
    msk = cv2.resize(card.mask.astype(np.uint8) * 255, (tw, thh), interpolation=cv2.INTER_AREA)
    msk = (msk > 200).astype(np.uint8)
    if msk.sum() < 20 or tw >= small.shape[1] or thh >= small.shape[0]:
        return None
    r = cv2.matchTemplate(small, tpl, cv2.TM_SQDIFF, mask=msk)
    _, _, loc, _ = cv2.minMaxLoc(r)
    bx, by = loc[0] * k, loc[1] * k
    best = None
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            v = card.mae_at(img, bx + dx, by + dy)
            if best is None or v < best[2]:
                best = (bx + dx, by + dy, v)
    return best if best and best[2] < PRESENT_MAE else None


def check_safe_area(ctx: Ctx) -> dict:
    title = "字の置き場（安全領域）"
    sa = safe_area(ctx.style)
    th = {k: sa[k] for k in ("top", "bottom", "left", "right", "right_column_from_y", "right_column_x")}
    th["plate_diff"] = PLATE_DIFF
    th["plate_outside_px_max"] = PLATE_OUTSIDE_PX
    cards = _cards(ctx)
    if not ctx.plan and not ctx.plate:
        return result("safe_area", title, NA, "work（plan.json）も字なしの書き出しも無い", thresholds=th)
    problems, rows, m = [], [], {}
    if ctx.plan is not None:
        kinds = {c.ov.get("kind") for c in cards}
        if "title" not in kinds:
            problems.append("タイトル（上の黄色い箱）が無い")
        # 字の絵ごとに、出ている間の頭・真ん中・終わりのコマで、実際の位置を探す
        want: dict[int, list[Card]] = {}
        for c in cards:
            a, b = int(c.ov["from"]), min(int(c.ov["to"]), ctx.nframes)
            # テロップの「ポン」は最初の数コマだけ大きい。その間は最後の絵と形が違うので避ける
            a2 = a + len(c.ov.get("pop", [])) + 1
            for f in sorted({min(b - 1, a2), (a + b) // 2, max(a, b - 2)}):
                if 0 <= f < ctx.nframes:
                    want.setdefault(f, []).append(c)
        found: dict[int, list] = {}
        for f, img in iter_frames(ctx.mp4, list(want), ctx.W, ctx.H):
            for c in want[f]:
                found.setdefault(id(c), []).append((f, _locate(c, img)))
        for c in cards:
            hits = [(f, loc) for f, loc in found.get(id(c), []) if loc is not None]
            kind = c.ov.get("kind")
            row = {"kind": kind, "from": c.ov["from"], "to": c.ov["to"], "plan_xy": [c.ov["x"], c.ov["y"]],
                   "looked": [f for f, _ in found.get(id(c), [])]}
            # 時間割が言っている置き場そのものが外なら、それも落とす（書き出しがそう置くつもり）
            bx0, by0, bx1, by1 = c.bbox
            pv = rect_violations(c.ov["x"] + bx0, c.ov["y"] + by0, bx1 - bx0, by1 - by0, sa)
            if not hits:
                problems.append(f"{kind}（{c.ov['from']}〜{c.ov['to']}コマ）が、出ているはずのコマに見つからない")
                row["found"] = None
            else:
                xs = sorted({(x, y) for _, (x, y, _) in hits})
                row["found_xy"] = [list(p) for p in xs]
                for (x, y) in xs:
                    v = rect_violations(x + bx0, y + by0, bx1 - bx0, by1 - by0, sa)
                    if v:
                        problems.append(f"{kind}（{c.ov['from']}〜{c.ov['to']}コマ）: " + "、".join(v))
                    if abs(x - c.ov["x"]) > 2 or abs(y - c.ov["y"]) > 2:
                        problems.append(f"{kind}（{c.ov['from']}コマ〜）が時間割の位置 {c.ov['x']},{c.ov['y']} ではなく {x},{y} にある")
            if pv and not hits:
                problems.append(f"{kind}（{c.ov['from']}〜{c.ov['to']}コマ）の時間割の置き場: " + "、".join(pv))
            row["plan_violations"] = pv
            rows.append(row)
        m["overlays"] = rows
        m["overlay_count"] = len(cards)

    if ctx.plate is not None:
        m["plate"] = _plate_diff(ctx, sa, problems)
    status = FAIL if problems else PASS
    return result("safe_area", title, status,
                  f"字の絵 {len(cards)} 枚" + (f"・字なしとの差 {m['plate']['frames']}コマ" if "plate" in m else ""),
                  measured=m, thresholds=th, problems=sorted(set(problems), key=problems.index))


def _plate_diff(ctx: Ctx, sa: dict, problems: list) -> dict:
    """字なしの書き出し（同じ指示書を字を重ねずに書いたもの）とコマごとに引き、字の画素を出す。

    時間割に載っていない重ね物（あとから足した種類）も、これなら拾える。
    """
    try:
        import cv2
    except ImportError:
        cv2 = None
    safe = safe_mask(sa)
    step = 7
    frames = list(range(0, ctx.nframes, step))
    for c in _cards(ctx):
        frames += [int(c.ov["from"]) + 2, (int(c.ov["from"]) + int(c.ov["to"])) // 2]
    frames = sorted({f for f in frames if 0 <= f < ctx.nframes})
    worst, bad_frames, same_px = 0, [], []
    a_it = iter_frames(ctx.mp4, frames, ctx.W, ctx.H)
    b_it = iter_frames(ctx.plate, frames, ctx.W, ctx.H)
    for (fa, a), (fb, b) in zip(a_it, b_it):
        d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
        mask = (d > PLATE_DIFF).astype(np.uint8)
        if cv2 is not None:
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        mask = mask.astype(bool)
        same_px.append(float(np.mean(d < 12)))
        out = int(np.sum(mask & ~safe))
        worst = max(worst, out)
        if out > PLATE_OUTSIDE_PX:
            ys, xs = np.nonzero(mask & ~safe)
            bad_frames.append({"frame": fa, "outside_px": out,
                               "bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]})
    similar = float(np.median(same_px)) if same_px else 0.0
    info = {"frames": len(frames), "worst_outside_px": worst, "bad_frames": bad_frames[:10],
            "plate_similarity": round(similar, 3)}
    if similar < 0.8:
        problems.append(f"字なしの書き出しが、この動画と字以外でも違う（同じ画素 {similar:.0%}）。別の指示書の書き出しでは")
    elif bad_frames:
        b = bad_frames[0]
        problems.append(f"字なしとの差で、安全領域の外に字の画素 {b['outside_px']}px（{b['frame']}コマ目、"
                        f"範囲 {b['bbox']}）ほか {len(bad_frames) - 1}コマ")
    return info
