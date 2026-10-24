"""字の改行: どこで行を割ってよいか。**書き出し（render.py）と品質チェックが、同じこの1本を読む。**

    python3 tools/shorts/qa/linebreak.py "1回700円やって！" "作りすぎやろ！"   # 割ってよい所を見る

2026-10-21、あやとに見せる前の試写（1秒ごとのコマ一覧）で、大きい字が語の中で割れていた:
地下鉄の回 p1「1回700｜円やって！」「船も乗れる｜ねん！」、銅像の回 p2「作りす｜ぎやろ！」
「1ミリも貢献して｜へんて！」「北マケドニア｜さん、すいません」。原因は3つあった。

- 書き出しが、文節の切れ目だけで大きく出せないとき「いちばん長い文節を真ん中の字で割る」最後の手を
  持っていた（`halve_longest`。「1回700円やって！」は budoux では1つの文節）
- 書き出しが budoux の文節を、節の終わり（〜たら・〜から）とカタカナの語の後ろでもう一段割っていた
  （`fine_chunks`。「北マケドニア｜さん」「中身スカスカ｜やないかい」「銅像だら｜けに」）
- budoux そのものが、関西の打ち消し・言い切りの前を文節の切れ目と言う（「貢献して｜へんて」
  「乗れる｜ねん」）。budoux は標準語で学んだ型なので、「へん」「ねん」を新しい文節の頭と読む

だから「割ってよい所」をここ1か所で決め、書き出しはここで割った文節より細かく割らず、品質チェック
（`check.py` の `line_breaks`）は、書き出しが実際に選んだ行の割れ目をここと突き合わせる。
同じ決めを2か所に書くと、片方だけ直されて「書き出しは割ってよいと読んだのに、チェックは落とす」が起きる
（顔の式を `qa/faces.py` から書き出しが読むのと同じ形）。

## 割ってよい所

budoux（日本語の既定の型）の文節の切れ目のうち、下の「割らない所」に当たらないもの。
ほかに、句読点（、。！？）の直後（字幕の頁は文と「、」で分けるので、そこは必ず割れる。閉じ括弧が続くときは
budoux に任せる）と、書いた人が入れた空白・改行。

## 割らない所（budoux が切れ目と言っても）

1. **数と単位・数の中**: 数字の直後（「700｜円」「30｜体」「2000｜年」）・「1,｜200」・「約｜200」「第｜1」・
   「3分の｜1」。日本語の数は、すぐ後ろの単位・助数詞・助詞と1つの文節
2. **関西の打ち消し・言い切りの前**: へん・ひん・やん・やろ・ねん・やで・やわ で始まる所（「貢献して｜へんて」
   「すぎる｜やろ」「乗れる｜ねん」「抜ける｜やん」）。句読点・空白の直後は除く
3. **仮名どうしで、budoux の点が弱い切れ目**（点 < `WEAK_KANA`）。budoux が仮名の並びの中で語を割るのはここ
   （「下手す｜ぎて」32・「もら｜おか」47・「まず｜そう」282・「絵はが｜き」451）。shorts/ の字 460本・切れ目 1,317 で、
   仮名どうしの 500 未満は 29か所。語を割ったものが 16、割っても読める所（「やめて｜やめて」67・「なって｜もうた」225）が
   13。後者をつないでも行が少し長くなるだけなので、500 で切った
4. **仮名1字だけの文節**は隣とつなぐ（「て｜ことで」「う｜まっ」「いや｜あ、」「乗っちゃ｜お！」）。
   句読点で終わる1字（「あ、」「お！」）は前へ、そうでなければ後ろへ。文の頭の「え、」はそのまま
5. **行の頭に来てはいけない字の前**（、。！？）」』ー・小さい仮名）と、**開き括弧の後ろ**・「…｜…」。
   「……」は行の頭に来てよい（字幕の頁が「……乗っちゃお！」で始まるのはふつう）
6. **国旗の中と直後**（「🇸🇪｜ストックホルム」。国旗は後ろの国の名前と1つの塊。間に空白があっても）
7. **語の帳面 `NO_SPLIT` の語の中**。budoux が高い点で語を割った実例（「日の｜入り」3551・「間に｜合う」1773・
   「追い｜払って」1678・「は｜しご」1293・「飼い｜主」597）。新しく見つけたらここに足す

## 人が決めた割れ目（【大】の字だけ）

budoux は「1回700円やって！」「中身スカスカやないかい！」を1つの文節と読むので、上の決めだけだと割れず、
1行で小さくなる（試写で 123px → 73px、74px → 54px）。そこで【大】の行に限り、人が `｜` で割れ目を決められる
（指示書の行・頁の `split`、spec の行の `big_split`・`caption_parts` の頁の `split`。例「1回｜700円やって！」）。
人の割れ目は budoux の切れ目でなくてよく、仮名どうしの点（3）も見ない。**ほかの固い決まり（1・2・4〜7）に
当たる割れ目は、書き出しが止まり（`manual_problems`）、品質チェックも落とす**（「1回7｜00円やって！」）。
時間割には `captions[].manual_breaks`（元の字の中の位置）として残る。

点の数は budoux 0.9.3（書き出しの Actions と作業箱の版）で測った。budoux の型が変わって、ここで数えた点が
budoux の `parse` の切れ目と食い違ったら、点を使う決め（3）を飛ばして `parse` の切れ目だけで割る（`measured` に出る）。
"""
from __future__ import annotations

import re
import sys
from functools import lru_cache

WEAK_KANA = 500
# 点の数（WEAK_KANA）と下の実例は、この版の budoux で測った。版が変わると文節の切れ目が変わる
# （0.10.0 は「あり？なし？」「手間すぎるやろ」の切れ目が 0.9.3 と違った）。書き出しの Actions・自己テストの CI・
# 作業箱を全部この版に揃える（違う版で回すと、品質チェックの要約に版の食い違いが出る）
BUDOUX_PIN = "0.9.3"
MARK = "｜"   # 人が決めた割れ目の印（【大】の字の split）
# budoux が高い点で語の中を切れ目と言った実例（shorts/ の字を全部 budoux に通して、目で拾った）
NO_SPLIT = ("日の入り", "日の出", "間に合", "追い払", "絵はがき", "正々堂々", "もうちょい", "はしご", "飼い主")

DIGIT = re.compile(r"[0-9０-９]")
HIRA = re.compile(r"[ぁ-ゖー]")
KANA = re.compile(r"[ぁ-ゖァ-ヺ]")
KANSAI = re.compile(r"へん|ひん|やん|やろ|ねん|やで|やわ")
FRACTION = re.compile(r"[0-9０-９]分の$")
FLAG_RE = re.compile("[\U0001F1E6-\U0001F1FF]{2}")
NUM_PREFIX = set("約第¥￥$＄#＃〜～~")
NUM_JOIN = set(",.，．")
SENT_END = set("、。！？!?")
CLOSE = set("」』）)】〕〉》")
OPEN = set("（(「『【〔〈《")
# 「……」は行の頭に来てよい（字幕の頁が「……乗っちゃお！」「……え、銅像て」で始まるのはふつう）。「…｜…」だけ割らない
HEAD_NG = set("、。，．,.！？!?ー・：；々ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ") | CLOSE
ELLIPSIS = set("…‥")
SPACE = set(" 　\t")
# 行の端で落ちる字（書き出しは行末の「、」「。」と空白を落とす。改行は書いた人の割れ目）
DROP = set("、。\n") | SPACE
EDGE = SENT_END | CLOSE | OPEN | SPACE | set("…‥・")


@lru_cache(maxsize=1)
def _parser():
    try:
        import budoux
    except ImportError:
        return None
    return budoux.load_default_japanese_parser()


def available() -> bool:
    return _parser() is not None


def budoux_version() -> str | None:
    try:
        from importlib.metadata import version
        return version("budoux")
    except Exception:  # noqa: BLE001
        return None


@lru_cache(maxsize=1)
def _model():
    P = _parser()
    m = P.model
    g = {k: m.get(k, {}) for k in ("UW1", "UW2", "UW3", "UW4", "UW5", "UW6", "BW1", "BW2", "BW3",
                                   "TW1", "TW2", "TW3", "TW4")}
    return g, -sum(sum(v.values()) for v in m.values()) * 0.5


def _score(s: str, i: int) -> float:
    """budoux の Parser.parse と同じ足し算（s[i-1] と s[i] の間が文節の切れ目らしい度合い。0 より大きいと切れ目）。"""
    g, sc = _model()
    n = len(s)
    if i > 2:
        sc += g["UW1"].get(s[i - 3], 0) + g["TW1"].get(s[i - 3:i], 0)
    if i > 1:
        sc += g["UW2"].get(s[i - 2], 0) + g["BW1"].get(s[i - 2:i], 0) + g["TW2"].get(s[i - 2:i + 1], 0)
    sc += g["UW3"].get(s[i - 1], 0) + g["UW4"].get(s[i], 0) + g["BW2"].get(s[i - 1:i + 1], 0)
    if i + 1 < n:
        sc += g["UW5"].get(s[i + 1], 0) + g["BW3"].get(s[i:i + 2], 0) + g["TW3"].get(s[i - 1:i + 2], 0)
    if i + 2 < n:
        sc += g["UW6"].get(s[i + 2], 0) + g["TW4"].get(s[i:i + 3], 0)
    return sc


_SCORE_OK = {"ok": True}  # 点の足し算が parse と食い違ったことがあるか（measured に出す）


def _budoux(s: str) -> dict[int, float | None]:
    """budoux の文節の切れ目（位置 → 点）。位置 p は s[p-1] と s[p] の間。"""
    cuts, pos = set(), 0
    for ch in _parser().parse(s)[:-1]:
        pos += len(ch)
        cuts.add(pos)
    sc = {i: _score(s, i) for i in range(1, len(s))}
    if {i for i, v in sc.items() if v > 0} != cuts:
        # budoux の型の作りが変わった。点は使わず、parse の切れ目だけで割る
        _SCORE_OK["ok"] = False
        return {p: None for p in cuts}
    return {p: sc[p] for p in cuts}


def _flag_ng(s: str, p: int) -> str:
    for m in FLAG_RE.finditer(s):
        if m.start() < p < m.end():
            return "国旗の中"
        if s[:p].rstrip(" 　").endswith(m.group(0)) and len(s[:p].rstrip(" 　")) == m.end():
            return "国旗の直後（国旗は後ろの国の名前と1つ）"
    return ""


def rule(s: str, p: int, score: float | None = None) -> str:
    """s[p-1] と s[p] の間で割ってはいけない決め（割ってよければ ""）。budoux の切れ目かどうかは見ない。"""
    a, c = s[p - 1], s[p]
    if c in HEAD_NG:
        return "行の頭に来ない字（句読点・閉じ括弧・小さい仮名・ー）の前"
    if a in ELLIPSIS and c in ELLIPSIS:
        return "「……」の中"
    if a in OPEN:
        return "開き括弧の後ろ"
    if DIGIT.match(a) and c not in SPACE:
        return "数と単位の間（数字の直後）"
    if a in NUM_JOIN and p >= 2 and DIGIT.match(s[p - 2]) and DIGIT.match(c):
        return "数の中（1,200 の区切りのあと）"
    if a in NUM_PREFIX and DIGIT.match(c):
        return "数の頭（約・第・¥ と数字の間）"
    if FRACTION.search(s[:p]) and DIGIT.match(c):
        return "分数の中（3分の1）"
    if KANSAI.match(s, p) and a not in SPACE and a not in SENT_END:
        return "関西の打ち消し・言い切り（へん・やろ・ねん…）の前"
    fl = _flag_ng(s, p)
    if fl:
        return fl
    for w in NO_SPLIT:
        k = s.find(w)
        while k >= 0:
            if k < p < k + len(w):
                return f"語の帳面の「{w}」の中"
            k = s.find(w, k + 1)
    if score is not None and score < WEAK_KANA and HIRA.match(a) and HIRA.match(c):
        return f"仮名どうしで budoux の点が弱い（{score:.0f} < {WEAK_KANA}）"
    return ""


def _single_kana(s: str, keep: set[int]) -> tuple[set[int], dict[int, str]]:
    """仮名1字だけの文節を隣とつなぐ（つないだ切れ目と理由も返す）。"""
    keep = set(keep)
    why: dict[int, str] = {}
    changed = True
    while changed:
        changed = False
        b = [0] + sorted(keep) + [len(s)]
        for k in range(len(b) - 1):
            a0, a1 = b[k], b[k + 1]
            ch = s[a0:a1]
            body = "".join(x for x in ch if x not in EDGE)
            if len(body) != 1 or not KANA.match(body):
                continue
            tail = ch.rstrip(" 　")
            ends_punct = bool(tail) and tail[-1] in SENT_END | CLOSE
            if ends_punct:
                cut = a0 if a0 > 0 else None          # 「あ、」「お！」は前へ。文の頭の「え、」はそのまま
            else:
                cut = a1 if a1 < len(s) else (a0 if a0 > 0 else None)   # 「て」「う」は後ろへ
            if cut is not None and cut in keep:
                keep.discard(cut)
                why[cut] = f"仮名1字だけの文節（「{ch.strip()}」）を隣から離す"
                changed = True
                break
    return keep, why


def _para(s: str) -> tuple[set[int], dict[int, str]]:
    """1つの段（改行を含まない）の、割ってよい位置と、割ってはいけない位置の理由。"""
    if len(s) < 2:
        return set(), {}
    bx = _budoux(s)
    cand = dict(bx)
    for i, ch in enumerate(s[:-1]):
        # 句読点の直後（頁を文と「、」で分けるので、そこは必ず割れる）。閉じ括弧が続くとき（「スパイシー？」に）は
        # 括弧の中の文の終わりで、後ろの助詞まで1つの文節なので、足さない（budoux に任せる）
        if ch in SENT_END and s[i + 1] not in CLOSE:
            cand.setdefault(i + 1, None)
        if ch in SPACE:
            if i > 0:
                cand.setdefault(i, None)
            cand.setdefault(i + 1, None)
    why: dict[int, str] = {}
    keep = set()
    for p in range(1, len(s)):
        # 理由は、当たった決めを先に言う（「1回700｜円」は「数と単位の間」のほうが、直す人に分かる）
        r = rule(s, p, cand.get(p))
        if r:
            why[p] = r
        elif p not in cand:
            why[p] = "budoux の文節の切れ目ではない（語の中）"
        else:
            keep.add(p)
    keep, w2 = _single_kana(s, keep)
    why.update(w2)
    return keep, why


@lru_cache(maxsize=4096)
def _analyse(text: str) -> tuple[frozenset, tuple]:
    ok: set[int] = set()
    why: dict[int, str] = {}
    off = 0
    for k, para in enumerate(text.split("\n")):
        keep, w = _para(para)
        ok |= {off + p for p in keep}
        why.update({off + p: r for p, r in w.items()})
        if k:
            ok |= {off - 1, off}   # 書いた人の改行の前後
        off += len(para) + 1
    return frozenset(ok), tuple(sorted(why.items()))


def allowed(text: str) -> frozenset:
    """text の中で、行を割ってよい位置（p は text[p-1] と text[p] の間）。"""
    if not available():
        raise RuntimeError("budoux が無い（pip install budoux）")
    return _analyse(text)[0]


def reason(text: str, p: int) -> str:
    """位置 p で割ってはいけない理由（割ってよければ ""）。"""
    if p in allowed(text):
        return ""
    return dict(_analyse(text)[1]).get(p, "割ってよい所ではない")


# ---------------------------------------------------------------- 人が決めた割れ目（【大】の字だけ）

def parse_marked(marked: str) -> tuple[str, list[int]]:
    """「1回｜700円やって！」→（「1回700円やって！」, [2]）。｜は人が決めた割れ目の印。"""
    text, pos = "", []
    for ch in marked:
        if ch == MARK:
            pos.append(len(text))
        else:
            text += ch
    return text, pos


def manual_problems(text: str, positions: list[int]) -> list[dict]:
    """人が決めた割れ目のうち、**固い決まり**に当たるもの。

    budoux の切れ目かどうかと、仮名どうしの点（WEAK_KANA）は見ない（budoux が見落とす切れ目
    「1回｜700円やって！」「中身｜スカスカやないかい！」を人が足すための道なので）。
    見るのは、数と単位・関西の打ち消しと言い切り・行頭行末の禁則・「……」の中・国旗・語の帳面と、
    仮名1字だけの行を作らないこと。
    """
    out = []
    ps = sorted(set(positions))
    for p in ps:
        if not 0 < p < len(text):
            out.append({"pos": p, "shown": text, "why": "字の端（割れ目にならない）"})
            continue
        r = rule(text, p, None)
        if r:
            out.append({"pos": p, "shown": f"{text[:p][-6:]}｜{text[p:][:6]}", "why": r})
    b = [0] + [p for p in ps if 0 < p < len(text)] + [len(text)]
    for k in range(len(b) - 1):
        seg = text[b[k]:b[k + 1]]
        body = "".join(x for x in seg if x not in EDGE)
        if len(body) == 1 and KANA.match(body):
            p = b[k + 1] if b[k + 1] < len(text) else b[k]
            out.append({"pos": p, "shown": f"{text[:p][-6:]}｜{text[p:][:6]}", "why": f"仮名1字だけの行（「{seg.strip()}」）"})
    return out


def chunks(text: str) -> list[str]:
    """text を、割ってよい位置だけで切った塊（書き出しはこれより細かく割らない）。"""
    if not text:
        return []
    cuts = sorted(p for p in allowed(text) if 0 < p < len(text))
    b = [0] + cuts + [len(text)]
    return [text[b[k]:b[k + 1]] for k in range(len(b) - 1) if text[b[k]:b[k + 1]]]


# ---------------------------------------------------------------- 描いた行を、元の字に当てる

def placed(src: str, lines: list[str]) -> list[tuple[int, int]] | None:
    """描いた行（行の端の「、」「。」と空白は落ちている）が、元の字 src のどこからどこか。当てられなければ None。"""
    spans, j = [], 0
    for ln in lines:
        if not ln:
            continue
        k = src.find(ln, j)
        if k < 0 or any(ch not in DROP for ch in src[j:k]):
            return None
        spans.append((k, k + len(ln)))
        j = k + len(ln)
    if any(ch not in DROP for ch in src[j:]):
        return None
    return spans


def bad_breaks(src: str, lines: list[str], manual: list[int] | None = None) -> tuple[list[dict], int] | None:
    """描いた行の割れ目のうち、割ってよい所でないもの（と、見た割れ目の数）。行を元の字に当てられなければ None。

    manual は人が決めた割れ目（【大】の字の split。src の中の位置）。固い決まりに当たらなければ割ってよい所に足し、
    当たれば（描いていなくても）落とす。
    """
    sp = placed(src, lines)
    if sp is None:
        return None
    ok = set(allowed(src))
    man_bad = {m["pos"]: m for m in manual_problems(src, manual)} if manual else {}
    ok |= {p for p in (manual or []) if p not in man_bad}
    bad = []
    for (a0, a1), (b0, b1) in zip(sp, sp[1:]):
        gap = src[a1:b0]
        if "\n" in gap:
            continue
        if any(p in ok for p in range(a1, b0 + 1)):
            continue
        p = b0 if gap else a1
        why = f"人の指定（{MARK}）が固い決まりに当たる: {man_bad[p]['why']}" if p in man_bad else reason(src, p)
        bad.append({"pos": p, "shown": f"{src[a0:a1]}｜{src[b0:b1]}", "why": why})
    seen = {b["pos"] for b in bad}
    for p, m in man_bad.items():
        if p not in seen:
            bad.append({"pos": p, "shown": m["shown"], "why": f"人の指定（{MARK}）が固い決まりに当たる: {m['why']}"})
    return bad, max(0, len(sp) - 1)


# ---------------------------------------------------------------- 品質チェック（check.py の line_breaks）

def plan_items(plan: dict) -> list[dict]:
    """時間割の、画面に出る字のかたまりごとに（元の字・描いた行・出るコマ・種類）。

    字幕は1つのナレーションの行（parts の行は頁の見た目ごと）が何枚かの頁に分かれるので、同じ元の字の頁を
    つないで1つにする（頁の切り替えも、行の割れ目と同じに見る）。書き出しが元の字（`src`）を書いていない
    古い時間割は、頁の行をつないだ字を元の字とみなす（行の端で落ちた句読点のぶん budoux の切れ目が少し変わりうる）。
    """
    out = []
    groups: list[dict] = []
    for c in plan.get("captions") or []:
        legacy = "src" not in c
        attr = (c.get("big"), c.get("mood"))
        key = (c.get("line"), c["src"] if not legacy else attr)
        if groups and groups[-1]["key"] == key and groups[-1]["legacy"] == legacy:
            groups[-1]["caps"].append(c)
        else:
            groups.append({"key": key, "legacy": legacy, "caps": [c]})
    for g in groups:
        caps = g["caps"]
        lines = [ln for c in caps for ln in (c.get("lines") or [])]
        c0 = caps[0]
        if g["legacy"]:
            src = c0.get("text") if c0.get("big") and len(caps) == 1 else "".join(lines)
        else:
            src = c0["src"]
        kind = "【大】" if c0.get("big") else ("感情の字幕" if c0.get("mood") else "字幕")
        out.append({"kind": kind, "src": src, "lines": lines, "from": c0.get("from", 0), "line": c0.get("line"),
                    "legacy": g["legacy"], "manual": c0.get("manual_breaks")})
    for t in plan.get("titles") or []:
        rows = t.get("lines") or []
        src = t.get("src") or "\n".join(rows)
        out.append({"kind": "題の札" if t.get("look") == "card" else "タイトル", "src": src,
                    "lines": t.get("drawn") or rows, "from": t.get("from", 0), "legacy": "drawn" not in t
                    and t.get("look") == "card"})
    for n in plan.get("notes") or []:
        out.append({"kind": "注", "src": n.get("text", ""), "lines": n.get("lines") or [n.get("text", "")],
                    "from": n.get("from", 0), "legacy": "lines" not in n})
    for t in plan.get("telops") or []:
        out.append({"kind": "強調の字", "src": t.get("text", ""), "lines": t.get("lines") or [t.get("text", "")],
                    "from": t.get("from", 0), "legacy": "lines" not in t})
    return [i for i in out if i["src"]]


def check(ctx) -> dict:
    from common import FAIL, NA, PASS, result
    title = "字の改行（語の途中で割れていないか）"
    th = {"weak_kana": WEAK_KANA, "no_split": list(NO_SPLIT),
          "rule": "budoux の文節の切れ目（句読点の直後・空白・改行を含む）のうち、数と単位・関西の打ち消しと言い切り・"
                  "弱い仮名どうし・仮名1字・行頭行末の禁則・国旗・語の帳面に当たらない所だけで割る（qa/linebreak.py）"}
    plan = ctx.plan
    if not plan:
        return result("line_breaks", title, NA, "時間割（plan.json）が無い", thresholds=th)
    if not available():
        return result("line_breaks", title, NA, "budoux が無い（pip install budoux）。割ってよい所を決められない",
                      thresholds=th)
    fps = float(plan.get("fps") or ctx.fps or 30)
    its = plan_items(plan)
    if not its:
        return result("line_breaks", title, NA, "時間割に画面の字が1つも無い", thresholds=th)
    problems, rows, n_breaks, n_multi = [], [], 0, 0
    for it in its:
        r = bad_breaks(it["src"], it["lines"], it.get("manual"))
        at = round(it["from"] / fps, 2)
        if r is None:
            problems.append(f"{at}秒 {it['kind']}「{'／'.join(it['lines'])}」: 描いた行を元の字「{it['src']}」に当てられない")
            rows.append({"kind": it["kind"], "at_s": at, "src": it["src"], "lines": it["lines"], "placed": False})
            continue
        bad, nb = r
        n_breaks += nb
        n_multi += nb > 0
        rows.append({"kind": it["kind"], "at_s": at, "src": it["src"], "lines": it["lines"], "breaks": nb,
                     "bad": bad, **({"legacy": True} if it.get("legacy") else {}),
                     **({"manual": it["manual"]} if it.get("manual") else {})})
        for b in bad:
            problems.append(f"{at}秒 {it['kind']}「{b['shown']}」: {b['why']}")
    legacy = sum(1 for it in its if it.get("legacy"))
    manual = sum(1 for it in its if it.get("manual"))
    ver = budoux_version()
    m = {"budoux": ver, "budoux_pin": BUDOUX_PIN, "items": len(its), "items_with_breaks": n_multi,
         "breaks": n_breaks, "manual_items": manual, "bad": len(problems), "legacy_items": legacy,
         "score_matches_parse": _SCORE_OK["ok"], "rows": rows}
    summ = (f"字のかたまり {len(its)}・割れ目 {n_breaks}（{n_multi} かたまり）・語の途中の割れ {len(problems)}"
            + (f"・人が割れ目を決めた【大】 {manual}" if manual else "")
            + (f"・元の字を書いていない古い時間割 {legacy}" if legacy else "")
            + (f"・budoux {ver}（決めた版は {BUDOUX_PIN}。割れ目が書き出しと違う版で決まっているかもしれない）"
               if ver != BUDOUX_PIN else ""))
    return result("line_breaks", title, FAIL if problems else PASS, summ, measured=m, thresholds=th, problems=problems)


def main() -> int:
    if not available():
        print("budoux が無い（pip install budoux）")
        return 2
    for s in sys.argv[1:]:
        ok = allowed(s)
        print(s)
        print("  文節:", "｜".join(chunks(s)))
        for p, r in _analyse(s)[1]:
            if p not in ok and not r.startswith("budoux の文節の切れ目ではない"):
                print(f"  割らない: {s[max(0, p - 4):p]}｜{s[p:p + 4]} … {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
