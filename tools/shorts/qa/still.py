"""止め絵の検査: カットの元素材が、1枚の絵（写真・画面の写し・止めたコマ）になっていないか。

あやと（#959、2026-10-20 23:57 UTC、最安ホステルの回 p2 v9 を見て）:

> 静止画はやめて欲しい。カクカクじゃないところで良さそうな映像探して。
> なければカクカクでも良い。

v9 はカクつく区間を直すのに、いちばんくっきりした1コマを止め絵にして、書き出しでゆっくり寄せた
（19カットのうち 10カット）。寄せが毎コマ全部の画素を動かすので、出来上がりを見る `frozen` にも
1秒1コマの一覧にも「止まっている」とは出ない。元素材のカクつきの検査（`source_stutter`）は、
止まった画を「繰り返してもカクつかない」として数えない側に倒していた。**止め絵を落とす検査が無かった**
（`docs/island-misses.md` #294）。

## 何を止め絵とするか

カットごとに、次のどれかなら止め絵。

1. **時間割の印**: 素材が画像のファイル（.png・.jpg ほか）か、カットに `still` / `image` が書いてある
2. **取り込みの台帳の印**: 素材の置き場の `index.json` のその行に、元の絵（`source_png` / `source_image`）か
   `still` が書いてある（Hc-z52fs108 p2 の App Store の画面は `source_png` を持つ）
3. **元素材の画素**: 使った区間 [in, out) を、元の大きさ・寄せる前の絵（透かしを切った crop の中）で読み、
   隣のコマとの差（白黒の全画素の平均）が **0.5 以上**の対が **5% 未満**。寄せは書き出しが後から掛けるので、
   元素材を読めば寄せに関係なく測れる（「止めた絵をゆっくり寄せて動いて見せる」もこれで落ちる）

**カクつく映像は止め絵ではない。** あやとは「なければカクカクでも良い」と言っている。カクつく区間は同じ絵が
4〜7コマ続いてから跳ぶので、跳んだ対が 2〜3割ある（実質 5.6fps でも 19%）。線（5%）はその4分の1より下に置いた。

### 実測（2026-10-21。カットごとの「絵が変わった対」の割合）

| 動画 | 止め絵（人の判定） | 動く映像 |
| --- | --- | --- |
| zjHZucyfrq8 p2 v9 | 10カットとも **0%**（隣との差のいちばん大きい所でも 0.017） | 9カットで 59〜100% |
| Hc-z52fs108 p2 | App Store の画面 6カットとも **0%**（差の最大 0.002。台帳の `source_png` でも落ちる） | 20カットで 44〜100%（ダッシュボードの画面の録画は差の中央値 0.27〜0.43 と小さいが、0.5 以上の対は 4割を超える） |
| yk-by7R7iPA A・B・C | 無い | 79カットで 76〜100%（2コマのカット1つは数えない） |
| p2 v2 のカクつく区間（`source_stutter` の実測） | — | 繰り返し 71〜81% ＝ 絵が変わった対 19〜29% |

## 弱いところ

- **寄せを元素材のファイルに焼き込んだ止め絵は、画素では見分けない。** 1枚の絵を ffmpeg の zoompan などで動かして
  mp4 にすると、隣のコマとの差が出て「動いている」と読む。拡大と平行移動で合わせてから差を見る道も試したが、
  寄せの大きい止め絵（1.0→1.3倍で残りの差 2.0）と、静かな部屋の寄り（同じく 2.2）が分けられず、1カット 1秒かかった。
  止め絵を作る道具は、焼き込まずに書き出しの寄せ（時間割の `zoom`）を使い、台帳に元の絵を書き残すこと（2. で落ちる）
"""
from __future__ import annotations

import os
from pathlib import Path

import stutter
from common import FAIL, NA, PASS, Ctx, clip_entry, result, segments, where

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".avif"}
CHANGE_MAD = 0.5      # 隣のコマとの差がこれ以上なら「絵が変わった」（止め絵は 0.02 未満、動く映像の中央値は 0.27 以上）
STILL_SHARE = 0.05    # 絵が変わった対がこれ未満のカットは止め絵（カクつく映像でも 19% はある）
MIN_PAIRS = 5         # 隣どうしの対がこれに満たないカット（6コマ未満）は、画素では決めない


def plan_mark(ctx: Ctx, s: dict) -> str | None:
    """時間割と取り込みの台帳に、止め絵の印があれば、その言い方。"""
    if Path(s["path"]).suffix.lower() in IMAGE_EXT:
        return f"素材が画像のファイル（{Path(s['path']).suffix.lower()}）"
    cut = (ctx.plan or {}).get("cuts", [])[s["k"]]
    for key in ("still", "image"):
        if cut.get(key):
            return f"時間割のカットに `{key}` の印"
    ent = clip_entry(Path(s["path"]))
    for key in ("source_png", "source_image"):
        if ent.get(key):
            return f"取り込みの台帳に元の絵（{key}: {ent[key]}）"
    if ent.get("still"):
        return "取り込みの台帳に `still` の印"
    return None


def check(ctx: Ctx) -> dict:
    cid, title = "still_image", "止め絵"
    th = {"changed_if_diff_ge": CHANGE_MAD, "still_if_changed_share_lt": STILL_SHARE, "min_pairs": MIN_PAIRS,
          "image_ext": sorted(IMAGE_EXT)}
    segs = segments(ctx.plan)
    if not segs:
        return result(cid, title, NA, "時間割（plan.json の cuts）が無く、カットの元素材に戻れない", thresholds=th)
    fps = float(ctx.plan["fps"])
    rows, missing = [], []
    for s in segs:
        row = {k: s[k] for k in ("k", "from_s", "to_s", "file", "in", "out")}
        row.update({"sec": round(s["frames"] / fps, 2), "where": where(s), "zoom": stutter.zooming(s.get("zoom")),
                    "mark": plan_mark(ctx, s), "pairs": 0, "changed_share": None})
        exists = os.path.exists(s["path"])
        if exists and Path(s["path"]).suffix.lower() not in IMAGE_EXT:
            # 元素材のカクつきの検査と同じ読みかた・同じ覚え（1回の検査で元素材を2度読まない）。
            # 印で止め絵と分かっているカットも測る（印と画素が食い違えば、報告の数字で分かる）
            d = stutter.source_diffs(s["path"], s["in"], s["out"], fps, s["crop"])
            row["pairs"] = int(len(d))
            if len(d) >= MIN_PAIRS:
                row["changed_share"] = round(float((d >= CHANGE_MAD).mean()), 3)
                row["diff_max"] = round(float(d.max()), 3)
        elif not exists and row["mark"] is None:
            missing.append(s)
        row["still"] = bool(row["mark"]) or (row["changed_share"] is not None and row["changed_share"] < STILL_SHARE)
        rows.append(row)
    by_k = {s["k"]: s for s in segs}
    stills = [r for r in rows if r["still"]]
    moving = [r for r in rows if not r["still"] and r["changed_share"] is not None]
    least = min(moving, key=lambda r: r["changed_share"], default=None)
    m = {"cuts": len(rows), "measured_cuts": sum(r["changed_share"] is not None for r in rows),
         "stills": [{k: r[k] for k in ("from_s", "to_s", "sec", "file", "mark", "changed_share", "zoom")} for r in stills],
         "still_seconds": round(sum(r["sec"] for r in stills), 2),
         "least_moving": ({k: least[k] for k in ("from_s", "to_s", "file", "changed_share")} if least else None),
         "missing_sources": sorted({s["path"] for s in missing}), "rows": rows}
    problems = []
    for r in stills:
        s = by_k[r["k"]]
        how = r["mark"] or f"元素材の絵が変わったのは {r['pairs']} 対のうち {r['changed_share']:.0%}（隣との差の最大 {r['diff_max']}）"
        zoom = f"。止めた絵を書き出しで寄せて（{s['zoom']['from']}→{s['zoom']['to']}）動いて見せている" if r["zoom"] else ""
        ent = clip_entry(Path(s["path"]))
        src = f"。元の絵: {ent['range']}" if ent.get("range") else ""
        problems.append(f"{r['where']}: 止め絵（{how}）{zoom}{src} → カクつかない別の区間の映像に替える"
                        f"（無ければカクつく映像でもよい）")
    for s in missing:
        problems.append(f"{where(s)}: 元素材が無い（{s['path']}）")
    if stills:
        status = FAIL
        summ = f"止め絵 {len(stills)} カット・合わせて {m['still_seconds']:.1f}秒（{len(rows)} カット中）"
    elif missing:
        status = NA
        summ = f"元素材が {len(missing)} カットぶん無い"
    else:
        status = PASS
        summ = f"止め絵は無い（{len(rows)} カット）"
        if least:
            summ += f"。絵が変わる対がいちばん少ないカット {least['changed_share']:.0%}（線 {STILL_SHARE:.0%} 未満で止め絵）"
    return result(cid, title, status, summ, measured=m, thresholds=th, problems=problems)
