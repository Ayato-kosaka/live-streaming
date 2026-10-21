"""カットの選び方の検査: 同じカットの長さ（`cut_length`）と、似た見た目の連続（`similar_run`）。

あやと（#959、2026-10-20 23:57 UTC、最安ホステルの回 p2 v9 を見て）:

> また、同じカットを3秒以上使わない約束を守って。
> 同じような見た目のカットも連続3秒以上使わないで欲しい。

v9 は屋上の止め絵を 3.80秒、屋根だけのキッチンの止め絵を 4.83秒続け（どちらも時間割では2カットに分けて
寄せを続けていた）、見学した宿の部屋を、同じ素材の別の時刻の2カットで続けて 5.77秒見せた。
3秒の決めは企画の手引きに「1行は3秒前後。4秒を超える行は…画を切り替える（ただし料理の寄りや景色は長く見せて
よい）」とだけあり、例外つきの目安だった。こちらのレビューは「1つの画が尺の何割か」（`shot_reuse` の 25%）を
数えていて、**続けて何秒か**を数える道具が無かった（`docs/island-misses.md` #294）。

## カット（`cut_length`）

時間割（`plan.json` の `cuts`）の隣どうしのカットを、**絵が変わらないつなぎ**なら1つのカットにまとめる:
同じ素材のファイル・同じ切り出し（crop・fit）で、寄せが続いていて（終わりと次の頭の倍率・寄る先の差が 2% 以内）、
元素材が続いている（次の in が前の out と同じか、1コマ飛ばしただけ）か、つなぎの前後の元素材のコマの差が 0.5 未満
（止め絵を頭からもう1度使っても、絵は変わらない。v9 の2つの止め絵がそれ）。
まとめたカットが **3.0秒以上**なら落とす（あやとの言葉は「3秒以上使わない」なので、ちょうど 3.0秒も落とす）。

寄せが跳ぶつなぎ（同じ区間を続けて使い、寄りの倍率だけ変える）は別のカットと数える。そのかわり、
似た見た目の連続（下）では1つの連続に入る。

## 似た見た目の連続（`similar_run`）

上でまとめたカットを出来上がりの順に並べ、隣どうしが**似た見た目**なら1つの連続とする。見分けは
使い回しの検査と同じ1本（`reuse.alike`）: 同じ配信の同じ瞬間（1秒以内）で色の分布が近い／同じ素材の
ファイルか同じ配信の 10秒以内で、画面の色の分布が近い／pHash の違いが 10ビット以内。
**本人が大きく写る画どうしは、同じ瞬間のときだけ**似た見た目とする（自撮りで話す画は、同じ場所でも毎回ちがう顔と身ぶり）。
2カット以上の連続が合わせて **3.0秒以上**なら落とす。1カットだけの長さは `cut_length` が見る（同じことで2度落とさない）。

**色の分布の線だけは、使い回しより緩い 0.5**（使い回しは 0.6）。v9 の見学した宿の部屋の引きと寄り（同じ素材の
16秒離れた2カット。並べると同じ青緑のソファベッドと白い布）が **0.570** で、使い回しの線では別の画になる。
使い回しは「同じ画を何度も出す」を数えるので、同じ場所の引きと寄りは別の画でよい。続けて並べると
「同じような見た目」になる（あやとの言葉）。線は、同じ素材の隣どうしで目で見て別の見た目だった組
（Hc p2 の自撮りとぼかしたダッシュボード 0.495・yk C のバスの車内と横断歩道 0.426）と、0.570 の間に置いた。
v9 を直した編集の担当も、同じ組から別に 0.50 を出していた（v10 の隣どうしは1組を除いて 0.47 以下）。

### 実測（2026-10-21）

| 動画 | 人の判定 | いちばん長いカット | 似た見た目のいちばん長い連続 |
| --- | --- | --- | --- |
| zjHZucyfrq8 p2 v10（v9 を直した版） | — | 2.83秒（通る） | 無い（隣どうしの重なりは最大 0.526。別の素材で同じ配信の 13秒離れなので同じ場面と読まない） |
| zjHZucyfrq8 p2 v9 | 「同じカットを3秒以上」「似た見た目も連続3秒以上」（あやと） | 屋根だけのキッチンの止め絵 **4.83秒**（2カットを1つに）。ほかに屋上の止め絵 3.80秒・夜の空港 3.20秒・朝のカフェ 3.20秒・宿の近くの通り 3.03秒 | 見学した宿の部屋 **5.77秒**（同じ素材の別の時刻の2カット・色の分布の重なり 0.570） |

出した4本の値は `README.md` の実測の表。あやとの決めは 2026-10-21 からのもので、線は出した本に合わせない。

### 弱いところ

- **色の分布は「同じ場所に見えるか」を半分しか言い当てない。** yk C の同じ通り（黄色い塔の見える交差点）を
  別の時刻で続けた組は、空の明るさと車の色で 0.33〜0.37 と出て、目では似ているのに通る（スーパーの通路と棚 0.472、
  横断歩道と同じ通りの車 0.486 も同じ）。逆に、目で見て別の見た目なのに 0.495（Hc p2 の自撮りとぼかしたダッシュボード）
  の組もあり、線のすぐ下にいる。線の近くは、人の目の検査（`production.md` 3）で帯の絵を見て決める
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

import reuse
import stutter
from common import FAIL, NA, PASS, Ctx, result, segments, where

CUT_MAX = 3.0       # 同じカットはこれ未満（あやと「3秒以上使わない」）
RUN_MAX = 3.0       # 似た見た目のカットの連続も、合わせてこれ未満（あやと「連続3秒以上使わない」）
SIMILAR_LOOK = 0.5  # 続けて並べたカットの色の分布の重なりがこれ以上なら似た見た目（使い回しの 0.6 より緩い。上の説明）
SKIP_FRAMES = 1     # 同じ素材で、これ以下のコマを飛ばしただけのつなぎは見て分からない（同じカットの続き）
SEAM_MAD = 0.5      # つなぎの前後の元素材のコマの差がこれ未満なら、絵が変わっていない（止め絵は 0.02 未満）
ZOOM_TOL = 0.02     # 寄せの倍率（比）と寄る先（0〜1）の差がこれ以内なら、寄せが続いている
SAME_FRAMING = ("fit", "focus_x", "focus_y")   # crop のほかに、絵の切り出しを決める時間割の欄


def _zoom_end(z: dict | None, end: bool) -> tuple:
    """寄せの頭（end=False）か終わり（end=True）の（倍率, 寄る先 x, y, 画面の置き場 sx, sy）。書き出しの zoom_at と同じ読み。"""
    z = z or {}

    def pick(key, default):
        v = z.get(key, default)
        if isinstance(v, (list, tuple)):
            return float(v[1] if end else v[0])
        return None if v is None else float(v)
    scale = float(z.get("to" if end else "from", 1.0)) if z else 1.0
    return scale, pick("x", 0.5), pick("y", 0.5), pick("sx", None), pick("sy", None)


def zoom_continues(za: dict | None, zb: dict | None) -> bool:
    a, b = _zoom_end(za, True), _zoom_end(zb, False)
    if abs(a[0] / b[0] - 1) > ZOOM_TOL:
        return False
    if abs(a[0] - 1) <= ZOOM_TOL and abs(b[0] - 1) <= ZOOM_TOL:
        return True   # 寄せていない（1倍）なら、寄る先が違っても同じ絵
    for p, q in zip(a[1:], b[1:]):
        if (p is None) != (q is None) or (p is not None and abs(p - q) > ZOOM_TOL):
            return False
    return True


_SEAM: dict = {}


def seam_diff(path: str, fa: int, fb: int, fps: float, crop) -> float | None:
    """元素材の fa コマと fb コマの差（白黒の全画素の平均）。同じファイル（大きさと更新の時刻で見る）の同じ組は
    2度読まない（selftest は同じ時間割を何度も測る）。読めなければ None。"""
    st = Path(path).stat()
    key = (path, st.st_size, st.st_mtime_ns, fa, fb, fps, tuple(crop) if crop else None)
    if key not in _SEAM:
        fr = []
        for f in (fa, fb):
            g = stutter.source_gray(path, f, f + 1, fps, crop)
            try:
                fr.append(next(g, None))
            finally:
                g.close()
        _SEAM[key] = None if any(x is None for x in fr) else float(np.abs(fr[0].astype(np.int16) - fr[1]).mean())
    return _SEAM[key]


def picture_continues(ctx: Ctx, a: dict, b: dict, fps: float) -> str | None:
    """出来上がりで隣り合うカット a → b のつなぎで、絵が変わらないなら理由（人に見せる言葉）。変わるなら None。"""
    if a["path"] != b["path"] or b["at"] != a["at"] + a["frames"]:
        return None
    if list(a["crop"] or []) != list(b["crop"] or []):
        return None
    ca, cb = ctx.plan["cuts"][a["k"]], ctx.plan["cuts"][b["k"]]
    if any(ca.get(k) != cb.get(k) for k in SAME_FRAMING):
        return None
    if not zoom_continues(a.get("zoom"), b.get("zoom")):
        return None
    step = b["in"] - a["out"]
    if 0 <= step <= SKIP_FRAMES:
        return "同じ素材の続き" + (f"（{step}コマ飛ばしただけ）" if step else "")
    if not Path(a["path"]).exists():
        return None
    seam = seam_diff(a["path"], a["out"] - 1, b["in"], fps, a["crop"])
    if seam is not None and seam < SEAM_MAD:
        return f"つなぎの前後で元素材の絵が変わらない（差 {seam:.2f}）"
    return None


def shots(ctx: Ctx) -> list[dict]:
    """時間割のカットを、絵が変わらないつなぎでまとめたカット（出来上がりの順）。idx は segments() の番号。"""
    def load():
        segs = segments(ctx.plan)
        if not segs:
            return []
        fps = float(ctx.plan["fps"])
        out: list[dict] = []
        for i in sorted(range(len(segs)), key=lambda i: segs[i]["at"]):
            s = segs[i]
            if out:
                why = picture_continues(ctx, segs[out[-1]["idx"][-1]], s, fps)
                if why:
                    out[-1]["idx"].append(i)
                    out[-1]["why"].append(why)
                    out[-1]["to_s"] = s["to_s"]
                    continue
            out.append({"idx": [i], "why": [], "from_s": s["from_s"], "to_s": s["to_s"]})
        for sh in out:
            parts = [segs[i] for i in sh["idx"]]
            sh["sec"] = round(sh["to_s"] - sh["from_s"], 3)
            # 人が元の配信で探せる言い方（まとめたカットは、使った元の区間の頭から尻まで）
            sh["where"] = where({**parts[0], "from_s": sh["from_s"], "to_s": sh["to_s"],
                                 "src_from": min(p["src_from"] for p in parts),
                                 "src_to": max(p["src_to"] for p in parts)})
        return out
    return ctx.memo("cut_shots", load)


def check_cut_length(ctx: Ctx) -> dict:
    cid, title = "cut_length", "同じカットの長さ"
    th = {"fail_if_cut_sec_ge": CUT_MAX,
          "same_cut_if": (f"同じ素材・同じ切り出しで寄せが続き（差 {ZOOM_TOL:.0%} 以内）、元素材が続く"
                          f"（{SKIP_FRAMES}コマ飛ばしまで）か、つなぎの前後の元素材の差が {SEAM_MAD} 未満")}
    segs = segments(ctx.plan)
    if not segs:
        return result(cid, title, NA, "時間割（plan.json の cuts）が無く、カットの区切りが分からない", thresholds=th)
    sh = shots(ctx)
    rows = [{"from_s": round(x["from_s"], 2), "to_s": round(x["to_s"], 2), "sec": round(x["sec"], 2),
             "plan_cuts": len(x["idx"]), "why": x["why"], "where": x["where"]} for x in sh]
    bad = sorted([r for r in rows if r["sec"] >= CUT_MAX - 1e-6], key=lambda r: -r["sec"])
    longest = max(rows, key=lambda r: r["sec"])
    m = {"plan_cuts": len(segs), "cuts": len(rows), "longest": longest, "over": bad, "rows": rows}
    problems = []
    for r in bad:
        merged = ""
        if r["plan_cuts"] > 1:
            merged = (f"。時間割では {r['plan_cuts']} カットだが、つなぎで絵が変わらない"
                      f"（{'・'.join(dict.fromkeys(r['why']))}）ので1つのカット")
        problems.append(f"{r['where']}: {r['sec']:.2f}秒（線 {CUT_MAX:g}秒未満）{merged} → 3秒未満で切り、続きは別の画にする")
    summ = (f"いちばん長いカット {longest['sec']:.2f}秒（{longest['from_s']:.1f}〜{longest['to_s']:.1f}秒）"
            f"／線 {CUT_MAX:g}秒未満を越えるカット {len(bad)} / {len(rows)}")
    if len(rows) < len(segs):
        summ += f"（時間割の {len(segs)} カットを、絵の変わらないつなぎでまとめて {len(rows)}）"
    return result(cid, title, FAIL if bad else PASS, summ, measured=m, thresholds=th, problems=problems)


def check_similar_run(ctx: Ctx) -> dict:
    cid, title = "similar_run", "似た見た目の連続"
    th = {"fail_if_run_sec_ge": RUN_MAX, "similar_look_hist_ge": SIMILAR_LOOK, "twin_phash_le": reuse.TWIN_PHASH,
          "same_moment_sec": reuse.MOMENT_SEC, "same_scene": f"同じ素材のファイルか、同じ配信の {reuse.NEAR_SEC:g}秒以内",
          "presenter_face_ge": reuse.PRESENTER_FACE}
    L = reuse.looks(ctx)
    if "detector" in L:
        th["detector"] = L["detector"]
    if "na" in L:
        return result(cid, title, NA, L["na"], thresholds=th, problems=L.get("problems"))
    segs, sig, pres = L["segs"], L["sig"], L["pres"]
    sh = shots(ctx)
    runs: list[dict] = []
    for t, x in enumerate(sh):
        why = reuse.alike(segs, sig, pres, sh[t - 1]["idx"][-1], x["idx"][0], look_line=SIMILAR_LOOK) if t else None
        if why:
            runs[-1]["shots"].append(t)
            runs[-1]["why"].append(why)
        else:
            runs.append({"shots": [t], "why": []})
    rows = []
    for r in runs:
        if len(r["shots"]) < 2:
            continue
        a, b = sh[r["shots"][0]], sh[r["shots"][-1]]
        rows.append({"from_s": round(a["from_s"], 2), "to_s": round(b["to_s"], 2), "sec": round(b["to_s"] - a["from_s"], 2),
                     "cuts": len(r["shots"]), "why": r["why"], "where": [sh[t]["where"] for t in r["shots"]],
                     "_shots": r["shots"]})
    bad = sorted([r for r in rows if r["sec"] >= RUN_MAX - 1e-6], key=lambda r: -r["sec"])
    longest = max(rows, key=lambda r: r["sec"], default=None)
    face_h = L["face_h"]
    m = {"cuts": len(sh), "alike_pairs": sum(len(r["why"]) for r in runs),
         "runs": [{k: v for k, v in r.items() if k != "_shots"} for r in rows],
         "longest_run": ({k: longest[k] for k in ("from_s", "to_s", "sec", "cuts", "why")} if longest else None),
         "presenter_cuts": [round(segs[i]["from_s"], 2) for i in sorted(face_h) if face_h[i] >= reuse.PRESENTER_FACE],
         "frames_from": "字なしの書き出し" if L["use_plate"] else "仕上がり（字の箱を除く）"}
    problems, artifacts = [], []
    for k, r in enumerate(bad):
        problems.append(f"{r['from_s']:.2f}〜{r['to_s']:.2f} 秒に、似た見た目のカットが {r['cuts']}つ続いて合わせて"
                        f" {r['sec']:.2f}秒（線 {RUN_MAX:g}秒未満。{'・'.join(dict.fromkeys(r['why']))}）"
                        f" → 間に見た目の違う画を挟むか、どれかを別の画に替える")
        problems += [f"└ {w}" for w in r["where"]]
        mids = [L["small"][sh[t]["idx"][0]][len(L["small"][sh[t]["idx"][0]]) // 2] for t in r["_shots"]]
        artifacts.append(reuse.sheet(ctx, mids, f"similar_{k:02d}.jpg"))
    if longest is None:
        summ = f"似た見た目が続く所は無い（{len(sh)} カット）"
    else:
        top = bad[0] if bad else longest
        summ = (f"似た見た目が続くいちばん長い所 {top['sec']:.2f}秒（{top['from_s']:.1f}〜{top['to_s']:.1f}秒・"
                f"{top['cuts']}カット）／線 {RUN_MAX:g}秒未満を越える所 {len(bad)}")
    return result(cid, title, FAIL if bad else PASS, summ, measured=m, thresholds=th, problems=problems,
                  artifacts=artifacts)
