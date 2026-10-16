"""字の重なりの検査: 強調の字（テロップ）が、同じときに出ている字幕やタイトルの言い直しになっていないか。

1本目（yk-by7R7iPA）の6本は12項目を全部通ったのに、人の目で落ちた。強調の字の半分が
ナレーション（＝字幕）の言い直しで、0秒目に「25分」が3回並んでいた（タイトル・強調・字幕）。
強調の字は「その行のナレーションにもタイトルにも無いことを足すときだけ」と決めた
（`.claude/skills/viral-shorts-creator/references/production.md` の 2）。それを機械で見る。

字は時間割（plan.json）の `overlays[].text` から読む（2026-10-16 の render.py が書く）。
無ければ `titles[].lines` / `captions[].lines` / `telops[].text`。どれも無ければ not-checkable。
plan.json は編集指示書の置き場を持っていないので、指示書からは読まない
（指示書は書き出したあとにも直されるので、読めても今の動画の字とは限らない）。

## 線

- 1. 強調の字 T について、T と同じときに出ている字幕のページ（T の間にページがめくれたら、
  その全部）を S とし、T の字のうち、S のどれかと共通の「4字以上続く並び」で覆える字が
  **6割以上**なら落とす。タイトルとも同じように比べる。T が4字より短ければ、T がまるごと
  入っていたら落とす。
  （6割にしたのは、本人の元の声の言葉「今から揚げんの？」が、字幕「これから揚げるらしい」と
  「から揚げ」の4字だけ重なる——7字中 57%——のを、言い直しとは数えないため。
  ページをまとめて見るのは、「クッキー1袋 約200円」が「クッキー1袋で」「約200円」の
  2ページにまたがって言い直されていたため。1ページずつだと 60% と 40% に割れる）
- 2. はじめの3秒に、タイトル・強調の字・字幕の3つが同時に出ていて、同じ **3字**以上の並びが
  3つ全部に入っていたら落とす。0秒目に「25分」（3字）が3つ並んだのを拾うため。
  2つの間の偶然の3字（「でした」「ている」）はよく起きるので 1. は4字にしたが、
  3つが同時に同じ3字を持つ偶然はまず無い

## そろえ方（比べる前に）

NFKC（全角・半角をそろえる）→ 小文字 → 空白・句読点・括弧・記号（「」『』（）→ ＝ ≒ ～ など）を消す
→「約」を消す（「約550円」と「550円」を同じに読む）。
"""
from __future__ import annotations

import unicodedata

from common import FAIL, NA, PASS, Ctx, result

RATIO = 0.6       # 強調の字のうち、字幕・タイトルと共通の並びで覆える割合がこれ以上なら言い直し
MIN_RUN = 4       # 共通とみなす並びの長さ（これより短い一致は偶然でも起きる）
TRIPLE_RUN = 3    # はじめの3秒に、3つ全部に同じ並びがあるとみなす長さ
OPENING_SEC = 3.0  # 3つ並びを見るはじめの秒
DROP_CHARS = set("約")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").casefold()
    out = []
    for ch in s:
        cat = unicodedata.category(ch)
        # P*: 句読点・括弧（「」『』（）など）、S*: 記号（→ ＝ ≒ ～ ＋ など）、Z*: 空白、C*: 制御
        if cat[0] in "PSZC" or ch in DROP_CHARS:
            continue
        out.append(ch)
    return "".join(out)


def covered(t: str, srcs: list[str], min_run: int = MIN_RUN) -> tuple[int, list[str]]:
    """t の字のうち、srcs のどれか1つと共通の min_run 字以上の並びで覆える字の数と、その並び
    （長いものから取る。1つの並びは1つの字の中に続いていること）。"""
    used = [False] * len(t)
    runs = []

    def found(x: str) -> bool:
        return any(x in s for s in srcs)
    while True:
        best = (0, 0)  # (長さ, t の中の始まり)
        for i in range(len(t)):
            if used[i]:
                continue
            j = i
            while j < len(t) and not used[j] and found(t[i:j + 1]):
                j += 1
            if j - i > best[0]:
                best = (j - i, i)
        n, i = best
        if n < min_run:
            break
        runs.append(t[i:i + n])
        for k in range(i, i + n):
            used[k] = True
    return sum(used), runs


def repeats(t: str, srcs: list[str]) -> tuple[bool, float, list[str]]:
    """強調の字 t が、字 srcs（同時に出ているもの）の言い直しか（どれも norm 済み）。"""
    if not t or not srcs:
        return False, 0.0, []
    if len(t) < MIN_RUN:
        hit = any(t in s for s in srcs)
        return hit, (1.0 if hit else 0.0), ([t] if hit else [])
    n, runs = covered(t, srcs)
    return n / len(t) >= RATIO, n / len(t), runs


def items(plan: dict) -> list[dict]:
    """字の重ね物を（種類, 字, from, to）で。「ポン」の数コマに分かれた同じテロップは1つにまとめる。"""
    raw = []
    if isinstance(plan.get("overlays"), list) and any("text" in o for o in plan["overlays"]):
        for o in plan["overlays"]:
            raw.append((o.get("kind"), o.get("text") or "", int(o["from"]), int(o["to"])))
    else:
        for kind, key in (("title", "titles"), ("caption", "captions"), ("telop", "telops")):
            for it in plan.get(key, []) or []:
                text = it.get("text") or "／".join(it.get("lines") or [])
                raw.append((kind, text, int(it["from"]), int(it["to"])))
    merged: list[dict] = []
    for kind, text, a, b in sorted(raw, key=lambda r: (r[0] or "", r[1], r[2])):
        last = merged[-1] if merged else None
        if last and last["kind"] == kind and last["text"] == text and a <= last["to"]:
            last["to"] = max(last["to"], b)
        else:
            merged.append({"kind": kind, "text": text, "from": a, "to": b, "n": norm(text)})
    return sorted(merged, key=lambda r: (r["from"], r["kind"] or ""))


def check(ctx: Ctx) -> dict:
    title = "字の重なり（強調の字の言い直し）"
    th = {"ratio": RATIO, "min_run": MIN_RUN, "triple_run": TRIPLE_RUN, "opening_sec": OPENING_SEC}
    plan = ctx.plan
    if not plan:
        return result("text_dup", title, NA, "時間割（plan.json）が無い", thresholds=th)
    its = items(plan)
    if not any(i["text"] for i in its):
        return result("text_dup", title, NA, "時間割に字の中身が無い（overlays[].text も lines も無い）",
                      thresholds=th)
    fps = float(plan.get("fps") or ctx.fps or 30)
    telops = [i for i in its if i["kind"] == "telop"]
    titles = [i for i in its if i["kind"] == "title"]
    caps = [i for i in its if i["kind"] == "caption"]

    def sec(f):
        return round(f / fps, 2)

    def during(t, xs):
        return [x for x in xs if max(t["from"], x["from"]) < min(t["to"], x["to"])]

    hits, rows = [], []
    for t in telops:
        # 字幕は、強調の字が出ている間にめくれたページを全部まとめて比べる。タイトルは別に比べる
        for kind, xs in (("caption", during(t, caps)), ("title", during(t, titles))):
            if not xs:
                continue
            dup, share, runs = repeats(t["n"], [x["n"] for x in xs])
            a = max(t["from"], min(x["from"] for x in xs))
            b = min(t["to"], max(x["to"] for x in xs))
            other = " ＋ ".join(x["text"] for x in xs)
            rows.append({"telop": t["text"], "with": kind, "other": other, "from_s": sec(a),
                         "to_s": sec(b), "share": round(share, 2), "runs": runs, "dup": dup})
            if dup:
                hits.append(f"{sec(a)}〜{sec(b)}秒: 強調「{t['text']}」が{('字幕' if kind == 'caption' else 'タイトル')}"
                            f"「{other}」の言い直し（{share:.0%} が {'・'.join(runs)}）")
    # はじめの3秒: タイトル・強調・字幕の3つに同じ並び
    lim = OPENING_SEC * fps
    triple = []
    for t in telops:
        for ti in titles:
            for c in caps:
                a = max(t["from"], ti["from"], c["from"])
                b = min(t["to"], ti["to"], c["to"])
                if a >= b or a >= lim:
                    continue
                k = min(TRIPLE_RUN, len(t["n"]), len(ti["n"]), len(c["n"]))
                if k == 0:
                    continue
                seen = sorted({t["n"][i:i + k] for i in range(len(t["n"]) - k + 1)
                               if t["n"][i:i + k] in ti["n"] and t["n"][i:i + k] in c["n"]})
                if seen:
                    triple.append({"from_s": sec(a), "to_s": sec(b), "run": seen, "title": ti["text"],
                                   "telop": t["text"], "caption": c["text"]})
                    hits.append(f"{sec(a)}〜{sec(b)}秒: 「{'・'.join(seen)}」がタイトル「{ti['text']}」・"
                                f"強調「{t['text']}」・字幕「{c['text']}」の3つに同時に出る")
    m = {"source": "overlays[].text" if any("text" in o for o in plan.get("overlays") or []) else "titles/captions/telops",
         "telops": len(telops), "captions": len(caps), "titles": len(titles), "pairs": rows, "triples": triple}
    worst = max((r["share"] for r in rows), default=0.0)
    return result("text_dup", title, FAIL if hits else PASS,
                  f"強調の字 {len(telops)} 個・同時に出る字との組 {len(rows)}・いちばん重なる {worst:.0%}"
                  + (f"・言い直し {len(hits)}" if hits else ""),
                  measured=m, thresholds=th, problems=hits)
