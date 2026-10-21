#!/usr/bin/env python3
"""**原稿を、あやとの指摘の帳面に機械で当てる。** 書いた人が、編集長に渡す前に通す。

    python3 tools/shorts/script/lint.py <script.txt>                    # 隣の spec.json（script_A.txt なら spec_A.json）も読む
    python3 tools/shorts/script/lint.py <script.txt> --title "🇸🇪 ストックホルム来たら、地下鉄が高すぎた！"
    python3 tools/shorts/script/lint.py <script.txt> --as-of 2026-10-19  # その日に在った決まりだけで（承認済みの原稿を読み直すとき）
    python3 tools/shorts/script/lint.py --rules                          # 規則と、帳面の ID の一覧

終了コード **0=落とす規則に1つも当たらない / 1=当たった / 2=原稿が読めない・空**。

## 何を見て、何を見ないか

規則はどれも、帳面（`.claude/skills/viral-shorts-creator/references/ayato_feedback.md`）の項目を1つ以上持つ。
**帳面の決まりのうち、字で拾えるものだけ**を規則にしてある。面白いか・テンポ・「？」が残るか・映像の枠の外でも
正しいか、は字では決まらない。そこは批評役の (h) で当てる（`script_writing.md` 7.4）。
**ここが緑でも「字で拾える指摘には当たっていない」だけ**で、原稿が良いという意味ではない。

印は2つ。✕ は落とす。△ は落とさないが、批評役が必ず読む行——【足】の行（配信で本人が言っていない言葉）は
全部出す。2026-10-21 の地下鉄 p1 は、【足】の2文が2文ともあやとに直された（F-035・F-036）。

## 「いつからの決まりか」を持つ

規則ごとに、帳面の項目の日付（あやとが言った日）を持つ。`--as-of` を渡すと、その日までに在った規則だけを当てる。
承認済みの原稿を読み直すときに、**承認より後にできた決まりで落ちたものを、原稿の誤りと取り違えない**ため
（最安ホステルの p2 は 10-19 に承認され、題の札の国旗は 10-21 からの決まり）。

## 新しい規則を足すとき

あやとの指摘を帳面に足したら、字で拾えるかを見る。拾えるなら `RULES` に1つ足し、その項目の「当てる場所」に
`lint:<規則>` を書き、`lint_selftest.py` に当たる例と当たらない例を足す。帳面と規則の食い違いは
`tools/shorts/feedback/ledger_selftest.py` が見る（規則の ID が帳面に無い・帳面が名指す規則が無い、のどちらも落ちる）。
**拾えないものを無理に規則にしない。** 外れの多い規則は、書く人に無視されるようになる。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools/shorts/plan"))
sys.path.insert(0, str(ROOT / "python"))
from readtime import chars  # noqa: E402  尺の見積もりと同じ数えかた（記号を除いた字数）
from ts_read import entries, read_map  # noqa: E402

FLAGS = ROOT / "tools/shorts/render/flags/SOURCES.json"
CITIES = ROOT / "site/content/cityStreams.ts"

# 街の名前（`cityStreams.ts`）が属する国。あちらは国を英語の slug で持っている
SLUG_CODE = {
    "france": "FR", "netherlands": "NL", "belgium": "BE", "hungary": "HU", "austria": "AT",
    "slovakia": "SK", "czech": "CZ", "germany": "DE", "uk": "GB", "turkey": "TR", "cyprus": "CY",
    "egypt": "EG", "jordan": "JO", "uae": "AE", "azerbaijan": "AZ", "georgia": "GE", "armenia": "AM",
    "iran-border": "AM", "poland": "PL", "lithuania": "LT", "latvia": "LV", "estonia": "EE",
    "finland": "FI", "sweden": "SE", "albania": "AL", "north-macedonia": "MK",
}
# `cityStreams.ts` は街が1つの滞在を国の名前で持つ（アルバニア・北マケドニア）。題に出る街を足しておく
EXTRA_CITIES = {
    "ティラナ": "AL", "ドゥラス": "AL", "ベラト": "AL", "サランダ": "AL", "シュコドラ": "AL",
    "スコピエ": "MK", "オフリド": "MK", "ビトラ": "MK",
}
HOME = "日本"   # 比べる物差しとして題に出る。題の札に国旗を求める国ではない

# 「〜まで」の上限。尺: 声を上限の倍率 1.4 で読んで毎秒7字・喋る50秒（`script_writing.md` 6）
MAX_CHARS = 350

FLAG_PAIR = re.compile("[\U0001F1E6-\U0001F1FF]{2}")
MARK = re.compile(r"【(大|足)】")


@dataclass
class Hit:
    rule: str
    line: int | None   # 原稿の行（1から。題の札は 0、原稿ぜんぶなら None）
    text: str
    note: str
    look: bool = False   # True なら △（落とさない）


@dataclass
class Ctx:
    lines: list
    title_card: str | None      # 題の札の字（国旗つき。無ければ None）
    title_from: str             # どこから取った題か
    rows: list | None           # spec の行（無ければ None）
    ashi_marked: set = field(default_factory=set)   # 原稿の字に【足】の印があった行

    @property
    def title(self) -> str:
        """題の言葉（国旗と空白を除く）。題の札が無ければ原稿の1行目（読み上げる題）。"""
        src = self.title_card if self.title_card is not None else (self.lines[0] if self.lines else "")
        return FLAG_PAIR.sub("", src).replace("\n", "").strip()


@dataclass
class Rule:
    id: str
    ledger: tuple
    since: str
    what: str
    run: Callable


# ---------- 場所 ----------

def _places_table() -> dict:
    """場所の名前 → 国の2字（分からなければ None）。国は国旗の控え、街は `cityStreams.ts` から。"""
    out: dict = {}
    try:
        for code, e in json.loads(FLAGS.read_text(encoding="utf-8")).items():
            if e.get("name"):
                out[e["name"]] = code
    except (OSError, ValueError):
        pass
    # 焼き込み（`site/content/*.ts`）は、共通の読み口 `python/ts_read.py` で読む。字を自前の正規表現で読むと、
    # 注釈を1行挟んだだけで1件が黙って落ちる（`python/ts_readers_selftest.py` が読み手の数を見張っている）
    try:
        for slug, cities in read_map(CITIES.read_text(encoding="utf-8"), "CITY_STREAMS"):
            for city, _ in entries(cities):
                out.setdefault(city, SLUG_CODE.get(slug))
    except OSError:
        pass
    for k, v in EXTRA_CITIES.items():
        out.setdefault(k, v)
    out[HOME] = "JP"
    return out


PLACES = _places_table()


def places_in(text: str) -> list:
    """字の中の場所を、長い名前から順に重ならないように拾う（「南フランス」の中の「フランス」を2度数えない）。

    Returns:
        [(始まり, 名前, 国の2字か None)] を出てくる順に
    """
    taken = [False] * len(text)
    found = []
    for name in sorted(PLACES, key=len, reverse=True):
        start = 0
        while True:
            i = text.find(name, start)
            if i < 0:
                break
            j = i + len(name)
            if not any(taken[i:j]):
                for k in range(i, j):
                    taken[k] = True
                found.append((i, name, PLACES[name]))
            start = j
    return sorted(found)


def emoji(code: str) -> str:
    """2字 → 国旗の絵文字（`tools/shorts/render/flags.py` の `emoji` と同じ）。"""
    return "".join(chr(0x1F1E6 + ord(ch) - ord("A")) for ch in code.upper())


def flags_in(text: str) -> list:
    """字の中の国旗を、(位置, 2字) で。"""
    return [(m.start(), "".join(chr(ord(ch) - 0x1F1E6 + ord("A")) for ch in m.group(0)))
            for m in FLAG_PAIR.finditer(text)]


# ---------- 規則 ----------

def t_flag(c: Ctx):
    """F-030 題の札に、国の名前の前に、その国の国旗。"""
    if c.title_card is None:
        return None
    card = c.title_card.replace("\n", "")
    where = [p for p in places_in(card) if p[1] != HOME]
    if not where:
        return []
    flags = flags_in(card)
    if not flags:
        names = "・".join(p[1] for p in where)
        return [Hit("T-FLAG", 0, card, f"題の札に国旗が無い（{names}）。`python3 tools/shorts/render/flags.py emoji <国>` の字を国の名前の前に")]
    out = []
    codes = {f[1] for f in flags}
    for _, name, code in where:
        if code and code not in codes:
            have = " ".join(emoji(f[1]) for f in flags)
            out.append(Hit("T-FLAG", 0, card, f"題の場所は{name}（{emoji(code)}）なのに、札の旗は {have}"))
    if flags[0][0] > where[0][0]:
        out.append(Hit("T-FLAG", 0, card, f"国旗が「{where[0][1]}」の後ろにある。国の名前の前に置く"))
    return out


REAL_NUM = re.compile(r"[0-9０-９]|[一二三四五六七八九十百千万億]+(円|倍|回|人|日|年|体|泊|時間|分|秒|個|杯|位)")


def t_real(c: Ctx):
    """F-031 題に、現実の手がかり（場所か数字）がある。"""
    t = c.title
    if not t:
        return None
    if places_in(t) or REAL_NUM.search(t):
        return []
    return [Hit("T-REAL", 0, t, "題に場所も数字も無い。「〈場所〉に来たら／行ったら、〈本当に起きたこと〉」で言い切る"
                "（あやとの直し:「🇲🇰 北マケドニアに来たら、銅像に1,200億円かけてる国だった」）")]


METAPHOR = re.compile(r"見えて(き|く)|みたい[なだにや]|のような|ように見え|と化し|気分(だ|や|に)")


def t_metaphor(c: Ctx):
    """F-031 題を比喩・見立てで作らない。"""
    t = c.title
    if not t:
        return None
    m = METAPHOR.search(t)
    if not m:
        return []
    return [Hit("T-METAPHOR", 0, t, f"題が見立て（「{m.group(0)}」）。本当に起きたことで言い切る")]


MIETE = re.compile(r"に(見え|思え)て(き|く)")


def l_miete(c: Ctx):
    """F-035 作った見立て「〇〇に見えてきた」を言わない。"""
    out = []
    for i, ln in enumerate(c.lines, 1):
        m = MIETE.search(ln)
        if m:
            out.append(Hit("L-MIETE", i, ln, f"作った見立て（「{m.group(0)}」）。比べるなら見る人の物差しと数字で言い切る"
                                             "（あやとの直し:「日本の三倍や！」）"))
    return out


NARRATOR = re.compile(r"あやと(は|が|の|も)|本人(いわく|曰く)|だそうです|とのことです")


def l_narrator(c: Ctx):
    """F-004 外の語り手の説明口調にしない。"""
    out = []
    for i, ln in enumerate(c.lines, 1):
        m = NARRATOR.search(ln)
        if m:
            out.append(Hit("L-NARRATOR", i, ln, f"外からの説明（「{m.group(0)}」）。本人の一人称で、本人の言葉で"))
    return out


# あやとが直した言い回し → 直した後（F-006）。足すときは、あやとが直した字のときだけ
PHRASES = (
    (re.compile(r"国を出(る|た|て|よ|ん|へ)"), "出国"),
    (re.compile(r"人に払(う|っ|い|え|わ)"), "対面払い"),
)


def l_phrase(c: Ctx):
    """F-006 ふだん人が言わない言い回し（あやとが直したもの）。"""
    out = []
    for i, ln in enumerate(c.lines, 1):
        for pat, good in PHRASES:
            m = pat.search(ln)
            if m:
                out.append(Hit("L-PHRASE", i, ln, f"「{m.group(0)}」はふだん言わない（あやとの直し:「{good}」）"))
    return out


# 数字のすぐ後ろの通貨だけを見る（「アイドル」「リラックス」を拾わない）
CURRENCY = re.compile(r"([0-9０-９][0-9０-９,，.]*|[〇一二三四五六七八九十百千万]+)\s*(レク|デナル|ディナール|クローナ|クローネ|ユーロ|ドル|ポンド|"
                      r"リラ|フォリント|ズウォティ|ズロチ|コルナ|ラリ|ドラム|マナト|ディルハム|レイ|レウ|レフ|ルーブル|フラン)")


def l_yen(c: Ctx):
    """F-007 お金は円だけで言う。"""
    out = []
    for i, ln in enumerate(c.lines, 1):
        m = CURRENCY.search(ln)
        if m:
            both = "。円と2回言っている" if "円" in ln else ""
            out.append(Hit("L-YEN", i, ln, f"現地の通貨（「{m.group(0)}」）を読んでいる{both}。円だけで1回"))
    return out


def l_length(c: Ctx):
    """F-019 早送りにしない（上限 1.4 で読んで60秒に入る量）。"""
    n = sum(chars(MARK.sub("", ln)) for ln in c.lines)
    if n <= MAX_CHARS:
        return []
    return [Hit("L-LENGTH", None, f"{len(c.lines)}行・{n}字",
                f"{n}字は上限 1.4 倍で読んでも60秒に入らない見込み（{MAX_CHARS}字まで）。倍率ではなく字を {n - MAX_CHARS} 字減らす")]


def l_end(c: Ctx):
    """F-032 最後の行は、問いか、アーカイブへの1行。

    **問いを必ず置く、ではない。** あやとは #977 で問いのあとにアーカイブの1行を足し、#975 では問いの行ごと消して
    アーカイブの1行で終えた。見るのは最後の行だけ（途中の「どっち？」は終わりの問いではない）。
    """
    if not c.lines:
        return None
    last = c.lines[-1]
    if "アーカイブ" in last:
        return []
    if "？" in last or "?" in last:
        return []
    return [Hit("L-END", len(c.lines), last, "最後の行が、「みんな」への問いでも、アーカイブへの1行でもない（挨拶・まとめ・別の話で終えない）")]


def l_ashi(c: Ctx):
    """F-035・F-036 【足】の行（配信で本人が言っていない言葉）を、全部 △ で批評役に回す。

    **数では落とさない。** 【足】の良し悪しは字では決まらない（ツッコミの多くは【足】で、それで通った原稿もある）。
    あやとが直した2文（「地下鉄1回に見えてきた」「乗れたんこの2回」）は、どちらも【足】だった。
    だから1行も見落とさずに、人の目（7.4 の (h)）へ回す。
    """
    if c.rows is None and not c.ashi_marked:
        return None
    rows = set(c.ashi_marked)
    for i, r in enumerate(c.rows or [], 1):
        if "【足】" in (r.get("why") or ""):
            rows.add(i)
    out = []
    for i in sorted(rows):
        text = c.lines[i - 1] if 0 < i <= len(c.lines) else ""
        out.append(Hit("L-ASHI", i, text, "【足】: 本人の言い方か（見立て・言いまとめになっていないか）・映像の枠の外でも正しいか", look=True))
    return out


RULES = (
    Rule("L-NARRATOR", ("F-004",), "2026-10-16", "外の語り手の説明口調（あやとは・本人いわく・だそうです）", l_narrator),
    Rule("L-PHRASE", ("F-006",), "2026-10-16", "ふだん言わない言い回し（国を出る・人に払う）", l_phrase),
    Rule("L-YEN", ("F-007",), "2026-10-16", "現地の通貨を読む", l_yen),
    Rule("L-LENGTH", ("F-019",), "2026-10-18", f"原稿が {MAX_CHARS} 字を越える（早送りになる）", l_length),
    Rule("T-FLAG", ("F-030",), "2026-10-21", "題の札の国旗（無い・違う国・国の名前の後ろ）", t_flag),
    Rule("T-REAL", ("F-031",), "2026-10-21", "題に場所も数字も無い", t_real),
    Rule("T-METAPHOR", ("F-031",), "2026-10-21", "題が見立て（〜に見えて・みたいな・のような）", t_metaphor),
    Rule("L-END", ("F-032",), "2026-10-21", "最後の行が、問いでもアーカイブへの1行でもない", l_end),
    Rule("L-MIETE", ("F-035",), "2026-10-21", "作った見立て「〜に見えてきた」", l_miete),
    Rule("L-ASHI", ("F-035", "F-036"), "2026-10-21", "【足】の行（全部 △。数では落とさない）", l_ashi),
)


# ---------- 読む ----------

def read_script(path: Path) -> tuple:
    """原稿の行（空行と # の行は飛ばす。`readtime.lines` と同じ）と、字に【足】の印があった行。"""
    lines, ashi = [], set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        if "【足】" in s:
            ashi.add(len(lines) + 1)
        lines.append(MARK.sub("", s).strip())
    return lines, ashi


def spec_for(script: Path) -> Path:
    """script.txt → spec.json、script_A.txt → spec_A.json。"""
    stem = script.stem
    suffix = stem[len("script"):] if stem.startswith("script") else ""
    return script.with_name(f"spec{suffix}.json")


def build(script: Path, title: str | None = None, spec: Path | None = None, use_spec: bool = True) -> Ctx:
    lines, ashi = read_script(script)
    rows, card, came = None, None, "原稿の1行目（国旗は見ていない）"
    sp = spec or spec_for(script)
    if use_spec and sp.exists():
        s = json.loads(sp.read_text(encoding="utf-8"))
        rows = s.get("rows")
        if s.get("title_card"):
            card, came = s["title_card"], f"{sp.name} の title_card"
    if title is not None:
        card, came = title, "--title"
    return Ctx(lines=lines, title_card=card, title_from=came, rows=rows, ashi_marked=ashi)


def lint(c: Ctx, as_of: str | None = None) -> dict:
    """規則を全部当てる。

    Returns:
        {"hits": [Hit], "ran": [規則], "blind": [(規則, 理由)], "later": [規則]}
        blind は入力が無くて見ていない規則、later は as_of より後にできた規則
    """
    hits, ran, blind, later = [], [], [], []
    for r in RULES:
        if as_of and r.since > as_of:
            later.append(r.id)
            continue
        got = r.run(c)
        if got is None:
            blind.append(r.id)
            continue
        ran.append(r.id)
        hits.extend(got)
    return {"hits": hits, "ran": ran, "blind": blind, "later": later}


BLIND_WHY = {
    "T-FLAG": "題の札が無い（--title か spec の title_card を渡す）",
    "L-ASHI": "spec が無く、原稿の字にも【足】の印が無い",
    "T-REAL": "題が空", "T-METAPHOR": "題が空", "L-END": "原稿が空",
}


def report(path: str, c: Ctx, res: dict, as_of: str | None) -> str:
    rules = {r.id: r for r in RULES}
    n = sum(chars(ln) for ln in c.lines)
    out = [f"原稿: {path}（{len(c.lines)}行・{n}字）  題: {c.title_from}"
           + (f"  決まり: {as_of} までにできたもの" if as_of else "")]
    for h in sorted(res["hits"], key=lambda h: (h.look, h.line if h.line is not None else 999)):
        mark = "△" if h.look else "✕"
        where = "題の札" if h.line == 0 else ("原稿ぜんぶ" if h.line is None else f"{h.line}行目")
        ids = "/".join(rules[h.rule].ledger)
        out.append(f"{mark} {ids} {h.rule} {where}「{h.text}」 {h.note}")
    for rid in res["blind"]:
        out.append(f"見ていない: {rid}（{BLIND_WHY.get(rid, '入力が無い')}）")
    if res["later"]:
        out.append(f"{as_of} より後の決まりなので当てていない: {'・'.join(res['later'])}")
    fails = sum(1 for h in res["hits"] if not h.look)
    looks = sum(1 for h in res["hits"] if h.look)
    out.append(f"結果: ✕ {fails}・△ {looks}（当てた規則 {len(res['ran'])}/{len(RULES)}）"
               + ("。✕ が残っているうちは編集長に渡さない" if fails else "。字で拾える指摘には当たっていない（面白いかは批評役の (h) で）"))
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description="原稿を、あやとの指摘の帳面に機械で当てる")
    ap.add_argument("script", nargs="?", help="原稿（1行1文。1行目は読み上げる題）")
    ap.add_argument("--title", help="題の札の字（国旗つき）。無ければ隣の spec の title_card")
    ap.add_argument("--spec", help="spec.json の在りか（既定は原稿の隣）")
    ap.add_argument("--no-spec", action="store_true", help="spec を読まない")
    ap.add_argument("--as-of", help="この日（YYYY-MM-DD）までにできた決まりだけを当てる")
    ap.add_argument("--rules", action="store_true", help="規則の一覧")
    a = ap.parse_args()

    if a.rules:
        for r in RULES:
            print(f"{r.id:11s} {'/'.join(r.ledger):13s} {r.since}  {r.what}")
        return 0
    if not a.script:
        ap.error("原稿の在りかが要る")
    if a.as_of:
        try:
            date.fromisoformat(a.as_of)
        except ValueError:
            ap.error("--as-of は YYYY-MM-DD")
    p = Path(a.script)
    try:
        c = build(p, a.title, Path(a.spec) if a.spec else None, not a.no_spec)
    except (OSError, ValueError) as e:
        print(f"原稿か spec を読めない: {e}", file=sys.stderr)
        return 2
    if not c.lines:
        print(f"原稿が空: {p}", file=sys.stderr)
        return 2
    res = lint(c, a.as_of)
    print(report(str(p), c, res, a.as_of))
    return 1 if any(not h.look for h in res["hits"]) else 0


if __name__ == "__main__":
    sys.exit(main())
