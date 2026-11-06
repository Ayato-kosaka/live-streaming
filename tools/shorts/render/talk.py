"""対談系の切り抜き（帳面 F-065・制作 #1104）の、話し手ごとの字幕の色。

あやと（2026-11-05、#1104）「対談系切り抜きショートなのでいままでとスタイル違いますよ」。対談系は、2人の会話を
本人たちの元の声だけで切り抜き、**話している人と言葉が分かる字幕**で見せる（参考19本のうち、番組でない会話の7本は
7本とも、色・名前・顔の丸で話し手を分けていた。`reference_shorts_2026-11_talk.md` の前提4）。

**既定は使わない**（様式の `talk.enabled: false`）。使わない回は `config` が None を返し、字幕に話し手の印が
1つも無ければ書き出しはここを1つも通らない（字の絵も時間割も変わらない）。だから対談系の前の回は、書き出しが
1バイトも変わらない。

## 使いかた

- spec の行に `speaker`（話し手の印。`"A"` `"W"` など）を書く → `build_edit.py` が指示書の声の行に運ぶ
- 回の様式に `talk.enabled: true` と、印ごとの字の色 `talk.speakers.<印>.fill` を書く
- 印を書いたのに、様式が対談系でない・様式に無い印は、書き出さずに止まる（白い字のまま黙って出さない）
- 色を変えるのは**ふつうの字幕の行だけ**（【大】・感情の字幕・頁を分ける行に印を書いたら止まる。見た目の決まりが別にある）

## 色の変えかた

字幕の見た目（look）の塗り（`fill`）を話し手の色にする。縁のうち塗りと同じ色の層（p3 の字幕は字を太らせる
0.75px の白い縁）も同じ色にする（白いふちが残ると、色の字が白く滲んで見える）。黒い縁はそのまま。
強調（`highlight`）は様式どおり（話し手の色と同じ色の強調は、色が変わらないので使わない）。

品質チェックの側（`qa/check.py`）は、`talk.enabled` の回で、対談系に当てない検査（3秒のカット・BGM の無い回の
声と BGM の差）を対象外にする。
"""
from __future__ import annotations

import copy
import sys


def config(style: dict) -> dict | None:
    """様式の talk。使わない回は None。"""
    tk = style.get("talk") or {}
    if not tk.get("enabled"):
        return None
    return tk


def speaker_of(ln: dict, style: dict, where: str) -> str | None:
    """声の行の話し手の印。書いていなければ None。書いたのに色が決まらなければ止まる。"""
    spk = ln.get("speaker")
    if spk is None:
        return None
    spk = str(spk)
    tk = config(style)
    if tk is None:
        sys.exit(f"{where}: 話し手（speaker: {spk!r}）を書いたが、様式が対談系ではない（talk.enabled が true でない）")
    sp = (tk.get("speakers") or {}).get(spk)
    if not sp or not sp.get("fill"):
        sys.exit(f"{where}: 話し手 {spk!r} の字の色が様式の talk.speakers に無い（{', '.join(tk.get('speakers') or {}) or 'なし'}）")
    return spk


def caption_style(cap_st: dict, style: dict, speaker: str | None) -> dict:
    """話し手の色にした字幕の様式の写し。話し手が無ければ cap_st そのもの（写さない）。"""
    if speaker is None:
        return cap_st
    fill = style["talk"]["speakers"][speaker]["fill"]
    st = copy.deepcopy(cap_st)
    if isinstance(st.get("look"), dict):
        lk = st["look"]
        old = lk.get("fill", st.get("fill", st.get("color", "#FFFFFF")))
        lk["fill"] = fill
        if isinstance(old, str):
            for o in lk.get("outline") or []:
                if str(o.get("color", "")).upper() == old.upper():
                    o["color"] = fill
    else:
        # 古い書き方（color・stroke）の様式
        st["color"] = fill
        st.pop("fill", None)
    return st
