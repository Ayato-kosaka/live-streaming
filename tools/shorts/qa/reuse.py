"""同じ画の使い回しの検査: 1つの画が、動画の何割を占め、何回出てくるか。

あやと（2026-10-19、最安ホステルの回 p2）:「同じ映像使いまわしすぎてて見飽きる」。屋上のベッドの画が
42秒のうち 13秒・4回出ていた。人の目の検査は1秒1コマの一覧で同じ画が並ぶのを見ていたが、
「冒頭の画に戻す呼び戻し」と読んで通した。企画の段の数え方（`planning.md` の 1.6）は画の**種類**の数
だけで、1つの画が何秒出ているかを誰も数えていなかった。

## 何を「同じ画」とするか

カットの組ごとに、画面に出た絵（字なしの書き出し `no_text.mp4`。無ければ仕上がりから字の箱を除いて）を
カットの 2割・5割・8割の3コマで比べ、次のどれかなら同じ画として束ねる（つながりは推移する）。

1. **同じ瞬間**: 同じ配信の同じ時刻（元の区間が重なるか 1秒以内）を使い、画面の色の分布も近い
   （同じ画面の録画でも、別の所に寄せて別のものを見せているカットは別の画。Hc-z52fs108 のダッシュボード）
2. **同じ場面**: 同じ素材のファイル（取り込みで1本に切った、配信の続いた1場面）か、同じ配信で 10秒以内。
   かつ、画面の色の分布が近い（HSV の 12x4x4 の分布の重なりが 0.6 以上）
3. **ほぼ同じ絵**: pHash（64ビットの形の要約）の違いが 10ビット以内。素材・時刻を問わない

ただし**本人が大きく写る画どうし**（ぼかしていない顔が画面の高さの 1割以上）は 1. でしか束ねない。
自撮りで話す画は、同じ場所でも毎回ちがう表情と身ぶりを見せる画で、使い回しではない
（Hc-z52fs108 は同じ場所の三脚の画が 8カット、yk-by7R7iPA B はケバブを持った自撮りが 6カット。どちらも出した）。

## 数えかた

束ごとに、出来上がりで**続いて並んだカットは1回**と数える（1つの画を行の境で2つに割っただけのもの）。
2回以上出てくる束について、合わせた秒の割合と回数を出す。1回しか出ない長い画は使い回しではないので数えない
（長くて弱い画は、人の目の検査の帯で見る）。

- 割合が **25%** を越える束があれば落とす
- 回数が **3回** を越える束があれば落とす
- 冒頭と終わりが同じ画（呼び戻し）は1本の動画に1つしか作れない。呼び戻しも回数と秒に数え、線を守っている
  ときだけ通す（呼び戻しだから多めに見る、はしない。p2 はそれで見過ごした）

### 実測（2026-10-19。いちばん大きい束）

| 動画 | 人の判定 | 割合 | 回数 |
| --- | --- | --- | --- |
| zjHZucyfrq8 p2 v2（屋上のベッド） | 使い回しすぎ（あやと） | **30.8%（13.0 / 42.2秒）** | **4**（冒頭と終わりを含む） |
| Hc-z52fs108 p2（ダッシュボードの棒グラフ） | 出した | 21.9% | 3（冒頭と終わりを含む） |
| yk-by7R7iPA B（メニューの板） | 出した | 15.5% | 3 |
| yk-by7R7iPA C（バス停の通り） | 出した | 13.2% | 2 |
| yk-by7R7iPA A（回る串） | 出した | 11.3% | 2 |

線は出したものの最大（21.9%・3回）と、言われたもの（30.8%・4回）の間に置いた。
色の分布の 0.6 は、p2 のベッドの6カットが互いに 0.55〜0.96（つながりで1つになる）、同じ素材の別の物
（コンロとフライパン、宿の部屋の引きと寄り）が 0.57 以下だったことから。pHash の 10 は、同じ区間を
使い直したカットが 0〜8、別の絵が 12 以上（三脚で同じ所を写した別の時刻が 12、同じ一覧の別の切り抜きが 14）。
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from common import FAIL, NA, PASS, Ctx, frame_memo, iter_frames, result, segments, where

SAMPLES = (0.2, 0.5, 0.8)   # カットの中の、比べるコマの位置
THUMB = (135, 240)          # 比べる大きさ（1/8）。字の箱の面（video.text_mask）と同じ縮尺
DET_SIZE = (360, 640)       # 本人の顔を探す大きさ（1/3）
SAME_LOOK = 0.60            # HSV の分布の重なり（0〜1）がこれ以上なら、見た目が近い
TWIN_PHASH = 10             # pHash の違い（63ビット中）がこれ以下なら、ほぼ同じ絵
MOMENT_SEC = 1.0            # 同じ配信で、元の区間がこれ以内なら同じ瞬間
NEAR_SEC = 10.0             # 別の素材のファイルでも、同じ配信のこれ以内なら同じ場面
PRESENTER_FACE = 0.10       # ぼかしていない顔の高さが画面のこれ以上なら、本人が話す画
SHARE_FAIL = 0.25           # 2回以上出る画が、動画のこれを越えたら落とす
COUNT_FAIL = 3              # 1つの画がこれを越える回数出てきたら落とす


def _dct_matrix(n: int) -> np.ndarray:
    k = np.arange(n)
    c = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n)) * np.sqrt(2 / n)
    c[0] /= np.sqrt(2)
    return c


_DCT32 = _dct_matrix(32)


def signature(img: np.ndarray, keep: np.ndarray | None) -> dict:
    """1コマの要約: HSV の分布（字の箱は数えない）と pHash（字の箱は字の外の平均で埋める）。"""
    th = np.asarray(Image.fromarray(img).resize(THUMB, Image.BOX))
    hsv = np.asarray(Image.fromarray(th).convert("HSV")).astype(np.int32)
    sel = hsv.reshape(-1, 3) if keep is None else hsv[keep]
    idx = (sel[:, 0] * 12 // 256) * 16 + (sel[:, 1] * 4 // 256) * 4 + (sel[:, 2] * 4 // 256)
    hist = np.bincount(idx, minlength=192).astype(np.float64)
    hist /= max(1.0, hist.sum())
    g = np.asarray(Image.fromarray(th).convert("L"), np.float64)
    if keep is not None and keep.any():
        g = np.where(keep, g, g[keep].mean())
    g32 = np.asarray(Image.fromarray(g.astype(np.uint8)).resize((32, 32), Image.BILINEAR), np.float64)
    d = (_DCT32 @ g32 @ _DCT32.T)[:8, :8].ravel()[1:]
    return {"hist": hist, "phash": d > np.median(d)}


def presenter_height(cv2, det, img: np.ndarray) -> float:
    """ぼかしていない、肌色の顔のうち、いちばん高いものの高さ（画面の高さに対する割合）。

    img は 1/3 に縮めたコマ（360x640）。本人の画の線（高さ 1割）の顔は、ここで 64px 以上ある。
    """
    import faces
    _, run_det, wants_gray = det
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    best = 0.0
    for (x, y, w, h) in run_det(gray if wants_gray else cv2.cvtColor(img, cv2.COLOR_RGB2BGR)):
        if faces.skin_share(cv2, img, x, y, w, h) < faces.SKIN_MIN:
            continue
        inner, outer = faces.sharpness(cv2, gray, x, y, w, h)
        if inner < faces.BLUR_ABS and (outer <= 0 or inner < faces.BLUR_RATIO * outer):
            continue  # ぼかした顔は、通りがかりの人（本人はぼかさない）
        best = max(best, h / img.shape[0])
    return best


def alike(segs: list[dict], sig: dict, pres, i: int, j: int, look_line: float = SAME_LOOK) -> str | None:
    """カット i と j が「同じ画」か。同じなら理由（人に見せる言葉）、違えば None。

    使い回し（shot_reuse）の束ね方と、似た見た目の連続（cuts.check_similar_run）の見分けは、**この1本**で決める
    （同じ瞬間・同じ場面・pHash・本人の画の外し方）。違うのは色の分布の線（look_line）だけで、続けて並べた
    カットのほうが緩い（`cuts.SIMILAR_LOOK`。宿の部屋の引きと寄りは使い回しでは別の画、続けると似た見た目）。
    """
    a, b = segs[i], segs[j]
    same_stream = a["stream"] == b["stream"]
    gap = max(a["src_from"], b["src_from"]) - min(a["src_to"], b["src_to"])
    look = max(float(np.minimum(x["hist"], y["hist"]).sum()) for x in sig[i] for y in sig[j]) >= look_line
    twin = min(int(np.sum(x["phash"] != y["phash"])) for x in sig[i] for y in sig[j]) <= TWIN_PHASH
    if same_stream and gap <= MOMENT_SEC and look:
        return "同じ瞬間"
    scene = (a["path"] == b["path"] or (same_stream and gap <= NEAR_SEC)) and look
    # 顔を探すのは、同じ瞬間ではないのに束ねそうな組だけ（ほとんどの組は色で別と分かる）
    if (scene or twin) and not (pres(i) and pres(j)):
        return "同じ場面で見た目が近い" if scene else "ほぼ同じ絵"
    return None


def group(segs: list[dict], sig: dict, pres) -> list[list[int]]:
    """カットを同じ画の束に分ける。pres(i) は「本人が大きく写る画か」（要るときだけ顔を探す）。"""
    n = len(segs)
    par = list(range(n))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            if alike(segs, sig, pres, i, j):
                par[find(i)] = find(j)
    out: dict[int, list[int]] = {}
    for i in range(n):
        out.setdefault(find(i), []).append(i)
    return [sorted(g) for g in out.values()]


def runs_of(g: list[int], order: list[int]) -> list[list[int]]:
    """出来上がりで続いて並んだカットを1回にまとめる（order は時間の順に並べたカットの番号）。"""
    pos = {k: i for i, k in enumerate(order)}
    out: list[list[int]] = []
    for k in sorted(g, key=lambda k: pos[k]):
        if out and pos[out[-1][-1]] == pos[k] - 1:
            out[-1].append(k)
        else:
            out.append([k])
    return out


def sheet(ctx: Ctx, imgs: list[np.ndarray], name: str) -> str:
    """束になったカットの真ん中のコマを横に並べた絵（人が「本当に同じ画か」を見る用）。"""
    tw, th = DET_SIZE
    im = Image.new("RGB", (tw * len(imgs), th), "white")
    for i, a in enumerate(imgs):
        im.paste(Image.fromarray(a).resize((tw, th), Image.BILINEAR), (i * tw, 0))
    p = ctx.out_dir / name
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, quality=85)
    return str(p)


def looks(ctx: Ctx) -> dict:
    """カットごとの見た目（3コマの要約・縮めたコマ・本人の画か）。測れなければ {"na": 理由}。

    使い回し（shot_reuse）と似た見た目の連続（similar_run）が同じものを読む。1回の検査で2度復号しないように
    ctx に覚えておく（Actions では2つを同じ組に置いている。`render/remote.py` の QA_GROUPS）。
    """
    def load() -> dict:
        segs = segments(ctx.plan)
        if not segs:
            return {"na": "時間割（plan.json の cuts）が無く、カットの区切りが分からない"}
        try:
            import cv2
            import faces
        except ImportError:
            return {"na": "OpenCV が無い（本人の画を見分けられない）"}
        det = faces.detector(cv2)
        if det is None:
            return {"na": "顔の検出器が無い（本人の画を見分けられない）"}
        # 画面に出た絵。字なしの書き出しがあればそれ、無ければ仕上がりの字の箱を除いて比べる
        use_plate = ctx.plate is not None and Path(ctx.plate).exists()
        src = Path(ctx.plate) if use_plate else ctx.mp4
        keep = None
        if not use_plate:
            import video
            keep = ~video.text_mask(ctx, THUMB[1], THUMB[0])
        want: dict[int, int] = {}
        for i, s in enumerate(segs):
            for q in SAMPLES:
                want[s["at"] + int(round(q * max(0, s["frames"] - 1)))] = i
        sig: dict[int, list] = {i: [] for i in range(len(segs))}
        small: dict[int, list] = {i: [] for i in range(len(segs))}
        for f, img in iter_frames(src, list(want), ctx.W, ctx.H):
            i = want[f]
            sig[i].append(signature(img, keep))
            # 顔は束ねそうな組にだけ探すので、1/3 に縮めたコマを取っておく（1コマ 0.7MB）
            small[i].append(np.asarray(Image.fromarray(img).resize(DET_SIZE, Image.BOX)))
        if any(not v for v in sig.values()):
            lost = [where(segs[i]) for i, v in sig.items() if not v]
            return {"na": f"{len(lost)} カットの絵が読めなかった", "problems": lost[:8], "detector": det[0]}
        face_h: dict[int, float] = {}

        def pres(i: int) -> bool:
            if i not in face_h:
                face_h[i] = 0.0
                for im in small[i]:
                    face_h[i] = max(face_h[i], frame_memo(f"reuse_face:{det[0]}", im,
                                                          lambda: presenter_height(cv2, det, im)))
                    if face_h[i] >= PRESENTER_FACE:
                        break
            return face_h[i] >= PRESENTER_FACE
        return {"segs": segs, "sig": sig, "small": small, "pres": pres, "face_h": face_h, "detector": det[0],
                "use_plate": use_plate}
    return ctx.memo("cut_looks", load)


def check(ctx: Ctx) -> dict:
    cid, title = "shot_reuse", "同じ画の使い回し"
    th = {"same_look_hist_ge": SAME_LOOK, "twin_phash_le": TWIN_PHASH, "same_moment_sec": MOMENT_SEC,
          "same_scene": f"同じ素材のファイルか、同じ配信の {NEAR_SEC:g}秒以内",
          "presenter_face_ge": PRESENTER_FACE, "fail_if_share_gt": SHARE_FAIL, "fail_if_count_gt": COUNT_FAIL}
    L = looks(ctx)
    if "detector" in L:
        th["detector"] = L["detector"]
    if "na" in L:
        return result(cid, title, NA, L["na"], thresholds=th, problems=L.get("problems"))
    segs, sig, small, pres, face_h, use_plate = (L[k] for k in ("segs", "sig", "small", "pres", "face_h", "use_plate"))
    fps = float(ctx.plan["fps"])
    total = float(ctx.plan.get("frames") or ctx.nframes) / fps
    order = sorted(range(len(segs)), key=lambda i: segs[i]["at"])
    first, last = order[0], order[-1]
    rows = []
    for g in group(segs, sig, pres):
        rr = runs_of(g, order)
        sec = sum(segs[i]["frames"] for i in g) / fps
        rows.append({"cuts": g, "runs": len(rr), "sec": round(sec, 2), "share": round(sec / total, 3),
                     "callback": first in g and last in g and len(rr) >= 2,
                     "appearances": [{"from_s": round(segs[r[0]]["from_s"], 2), "to_s": round(segs[r[-1]]["to_s"], 2),
                                      "cuts": [where(segs[i]) for i in r]} for r in rr]})
    reused = sorted([r for r in rows if r["runs"] >= 2], key=lambda r: (-r["share"], -r["runs"]))
    bad = [r for r in reused if r["share"] > SHARE_FAIL or r["runs"] > COUNT_FAIL]
    m = {"frames_from": "字なしの書き出し" if use_plate else "仕上がり（字の箱を除く）", "cuts": len(segs),
         "faces_looked_cuts": len(face_h),
         "presenter_cuts": [round(segs[i]["from_s"], 2) for i in sorted(face_h) if face_h[i] >= PRESENTER_FACE],
         "reused": [{k: v for k, v in r.items() if k != "cuts"} for r in reused[:6]],
         "largest": ({k: reused[0][k] for k in ("sec", "share", "runs", "callback")} if reused else None)}
    problems, artifacts = [], []
    for k, r in enumerate(bad):
        why = []
        if r["share"] > SHARE_FAIL:
            why.append(f"動画の {r['share']:.0%}（線 {SHARE_FAIL:.0%}）")
        if r["runs"] > COUNT_FAIL:
            why.append(f"{r['runs']}回（線 {COUNT_FAIL}回）")
        cb = "。冒頭と終わりの呼び戻しも数えた" if r["callback"] else ""
        spans = "・".join(f"{a['from_s']:.1f}〜{a['to_s']:.1f}秒" for a in r["appearances"])
        problems.append(f"同じ画が {r['runs']}回・合わせて {r['sec']:.1f}秒: {'、'.join(why)}{cb}。出ている所 {spans}"
                        f" → 2回目より後を、別の画に替える")
        for a in r["appearances"]:
            for c in a["cuts"]:
                problems.append(f"└ {c}")
        artifacts.append(sheet(ctx, [small[i][len(small[i]) // 2] for i in r["cuts"]], f"reuse_{k:02d}.jpg"))
    if reused:
        # 表の1行には、落ちた束があればそれを、無ければいちばん大きい束を出す
        top = bad[0] if bad else reused[0]
        summ = (f"いちばん多い画 {top['sec']:.1f}秒（{top['share']:.0%}）・{top['runs']}回"
                + ("（冒頭と終わりの呼び戻しを含む）" if top["callback"] else "")
                + f"／線 {SHARE_FAIL:.0%}・{COUNT_FAIL}回")
    else:
        summ = f"2回以上出る画は無い（{len(segs)} カット）"
    return result(cid, title, FAIL if bad else PASS, summ, measured=m, thresholds=th, problems=problems,
                  artifacts=artifacts)
