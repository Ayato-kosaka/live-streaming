#!/usr/bin/env python3
"""**原稿を、あやとの指摘の帳面に機械で当てる。** 書いた人が、批評役に回す前に通す。

    python3 tools/shorts/script/lint.py <script.txt>                    # 隣の spec.json（script_A.txt なら spec_A.json）も読む
    python3 tools/shorts/script/lint.py <script.txt> --title "🇸🇪 ストックホルムに来たら、地下鉄が高すぎた！"
    python3 tools/shorts/script/lint.py <script.txt> --next "本日22時"    # 最後の行で言う次の配信の時刻（spec の next_stream と同じ）
    python3 tools/shorts/script/lint.py <script.txt> --as-of 2026-10-19  # その日に在った決まりだけで（承認済みの原稿を読み直すとき）
    python3 tools/shorts/script/lint.py <script.txt> --as-of 2026-10-23:6354242835   # その日の、あやとのそのコメントの時点で
    python3 tools/shorts/script/lint.py --rules                          # 規則と、帳面の ID の一覧

終了コード **0=落とす規則に1つも当たらない / 1=当たった / 2=原稿が読めない・空・spec の形が違う**。

**spec に `rows`（行ごとの字・根拠・画）が無いとき・行の数が原稿と違うときは、当てずに 2 で止まる。** 2026-10-23 の滝の回 p1 は、
作文者が spec を `lines` の鍵で書き、ここと `brief.py` が黙って読み飛ばした。【足】【答】の印も、批評役の1枚の画の列も、空のまま通った。
spec を直すか、原稿だけを当てるなら `--no-spec`。

## 何を見て、何を見ないか

規則はどれも、帳面（`.claude/skills/viral-shorts-creator/references/ayato_feedback.md`）の項目を1つ以上持つ。
**帳面の決まりのうち、字で拾えるものだけ**を規則にしてある。面白いか・テンポ・「？」が残るか・映像の枠の外でも
正しいか、は字では決まらない。そこは批評役の (h) で当てる（`script_writing.md` 7.4）。
**ここが緑でも「字で拾える指摘には当たっていない」だけ**で、原稿が良いという意味ではない。

印は2つ。✕ は落とす。△ は落とさないが、批評役が必ず読む行——【足】の行（配信で本人が言っていない言葉）は
全部出す。2026-10-21 の地下鉄 p1 は、【足】の2文が2文ともあやとに直された（F-035・F-036）。
【足】は「その出来事が配信に無い行」の印で、言い方を組み直しただけの行には付けない（F-050）。だから【足】の数・割合では何も言わない。

## 「いつからの決まりか」を持つ

規則ごとに、帳面の項目の日付（あやとが言った日）を持つ。`--as-of` を渡すと、その日までに在った規則だけを当てる。
同じ日に決まりが2つできることがあるので、日付のあとに `:<コメントID>` を付けて、その時点で切れる（`critic_gate.py --as-of` と同じ形）。
2026-10-23 は、朝のフォカッチャの添削（6354242835）で T-READ・L-NEXT が、夕方の滝の回の直し（6370959237）で L-INNER・L-NICK・L-PARTICLE・L-ATE ができた。
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
MARK = re.compile(r"【(大|足|答)】")


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
    answer_marked: set = field(default_factory=set)  # 原稿の字に【答】の印があった行（題の答え。F-037）
    card_seconds: float | None = None                # spec の title_card_seconds（題の札を消す秒）
    next_stream: str | None = None                   # spec の next_stream（最後の行で言う次の配信。F-047）
    has_spec: bool = False                           # spec を読んだか（--no-spec・spec が無いなら False）
    promises: dict | None = None                     # spec の promises（作文者の当て表。F-050）。spec に鍵が無ければ None

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
# 国や街の名前ではないが、あやとが題の場所に使った言葉（#1014「海外キッチンでワンパンチーズフォカッチャ作ったらまさかの事態に！」）。
# 国旗を求める場所ではないので、PLACES（T-FLAG も読む）には入れない
REAL_PLACE = re.compile(r"海外")


def t_real(c: Ctx):
    """F-031 題に、現実の手がかり（場所か数字）がある。"""
    t = c.title
    if not t:
        return None
    if places_in(t) or REAL_NUM.search(t) or REAL_PLACE.search(t):
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
    # 次の配信への誘いも終わりの形（あやと #1014「リベンジにワンパンピザを本日22時から作るので配信見にきてね！」）。時刻は L-NEXT が見る
    if invites(last):
        return []
    return [Hit("L-END", len(c.lines), last, "最後の行が、「みんな」への問いでも、アーカイブへの1行でも、次の配信への誘いでもない"
                "（挨拶・まとめ・別の話で終えない）")]


# 次の配信へ誘う言いかた。「配信のアーカイブ見てね」は誘いではない（アーカイブは先に見て外す）
INVITE = re.compile(r"配信.{0,4}(見に|観に|来て|きて|遊びに|待って|待っと|おいで|見てね|見てな)")
# 時刻（22時・夜10時・22:00・二十二時）。「10分発酵」「3時間」は時刻ではない
TIME = re.compile(r"(?<![0-9０-９])[0-9０-９]{1,2}\s*時(?!間)|(?<![0-9])[0-9]{1,2}:[0-5][0-9]|[一二三四五六七八九十]+時(?!間)")


def invites(line: str) -> bool:
    return "アーカイブ" not in line and bool(INVITE.search(line))


def l_next(c: Ctx):
    """F-047 最後の行で次の配信に誘うなら、時刻まで言う。spec の next_stream（`--next`）があれば、その時刻を言う。

    **指定が無く、誘ってもいない終わり（問い・アーカイブ）は見ない。** 問いで終える回に、時刻を求める決まりではない。
    あやとは #1014 で「明日はワンパンピザ作るので配信見にきてね！」を「リベンジにワンパンピザを本日22時から作るので
    配信見にきてね！」に直した。時刻の無い誘いは、見た人が「いつ？」で止まる。
    """
    if not c.lines:
        return None
    n, last = len(c.lines), c.lines[-1]
    if c.next_stream:
        want = [norm_time(t) for t in TIME.findall(c.next_stream)] or [c.next_stream]
        have = {norm_time(t) for t in TIME.findall(last)}
        miss = [t for t in want if t not in have and t not in last]
        if miss:
            return [Hit("L-NEXT", n, last, f"spec の next_stream「{c.next_stream}」の時刻（{'・'.join(miss)}）を、最後の行で言っていない")]
        return []
    if invites(last) and not TIME.search(last):
        return [Hit("L-NEXT", n, last, "次の配信に誘うのに、時刻が無い（「本日22時から」のように、いつかまで言う）")]
    return []


def norm_time(t: str) -> str:
    """「22時」「２２時」「22 時」→「22時」。"""
    return re.sub(r"\s", "", t).translate(str.maketrans("０１２３４５６７８９", "0123456789"))


# 題の札と1行目を比べるときに外すもの: 国旗・空白・改行・句読点・記号（札は改行と句読点の置きかたが1行目と違う）
TITLE_NOISE = re.compile(r"[\s、。，．,.!！?？…‥・「」『』（）()【】〜～~：:]")


def norm_title(s: str) -> str:
    return TITLE_NOISE.sub("", FLAG_PAIR.sub("", s or ""))


def t_read(c: Ctx):
    """F-047 1行目は、題の札の字をそのまま読む（題の札が分かるときだけ見る）。

    F-043 の「札と1行目は別の字でよい」より、こちらを原則にした（あやと #1014「原則冒頭お題を読む」）。
    国旗・改行・句読点は札と1行目で置きかたが違ってよいので、外して比べる。
    """
    if c.title_card is None or not c.lines:
        return None
    card, first = norm_title(c.title_card), norm_title(c.lines[0])
    if card == first:
        return []
    shown = c.title_card.replace("\n", "")
    return [Hit("T-READ", 1, c.lines[0], f"1行目が題の札の字と違う。札「{shown}」をそのまま読む（句読点と改行は変えてよい）")]


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


SORRY = re.compile(r"すいません|すみません|ごめん|申し訳")


def l_sorry(c: Ctx):
    """F-040 謝る行を、全部 △ で批評役に回す（謝って、言い切ったことを引っ込めていないか）。

    **落とさない。** 謝っても向きを変えない行は、参考にもある（qumq「…ほんまごめんやけど…聞くにはおもんないサマス！」は、
    言い過ぎを認めたうえで結論を言い直して残す）。銅像 p2 の「北マケドニアさん、すいません。」は、前の行の取り消しに続けて謝り、
    「手抜きです」を引っ込めた（同じ話題で2回目の取り消し。あやと #976「二転三転するくらいならない方が良い」）。
    どちらなのかは字では決まらないので、`script_writing.md` 7.4 の (i) で読む。
    """
    out = []
    for i, ln in enumerate(c.lines, 1):
        m = SORRY.search(ln)
        if m:
            out.append(Hit("L-SORRY", i, ln, f"謝る行（「{m.group(0)}」）: 前の行までに言い切ったことを、謝って引っ込めていないか"
                                            "（引っ込めるなら取り消しの段ごと消す。言い過ぎを認めて結論を残すならよい）", look=True))
    return out


# ---------- 2026-10-21（#1011）: 批評役が毎回当てていて、字で決まるもの ----------
# 足したのは、関所の批評役が「離れる行」「(h)」「(i)」で繰り返し挙げ、しかも字で決まる所。批評役はここを見なくてよくなる
# （`references/critic_prompt.md` の「lint の結果」）。字で決まらないもの（跳ぶか・取消か）は △ で行だけ指し、読むのは批評役

CARD_MAX = 4.0     # 題の札を消す秒（F-015「開始4秒だけで良い」）
CPS = 6.8          # 声を上限の倍率 1.4 で読んだ毎秒の字（`script_writing.md` 6）
LINE_HARD = 35     # 1行の字の上限（`script_writing.md` 2「長くても35字」）
LINE_SOFT = 4.0    # 1行の秒の目安。越えた行は、関所で「離れる行」に挙がってきた（フランスの 4.1〜4.9秒の行）
AFTER_HARD = 3     # 【答】から締めまでに挟む行がこれ以上なら ✕（F-037）


def t_card(c: Ctx):
    """F-015 題の札は開始4秒まで（spec の title_card_seconds）。"""
    if c.card_seconds is None:
        return None
    if c.card_seconds <= CARD_MAX:
        return []
    return [Hit("T-CARD", 0, f"題の札 {c.card_seconds}秒", f"題の札が {c.card_seconds}秒まで出る。{CARD_MAX:.0f}秒で消す"
                "（1行目の声が長いなら、札を消したあとは字幕に替える）")]


def l_sec(c: Ctx):
    """F-034 1行は約2秒・14字前後、長くても35字。4秒を越える行は △。"""
    out = []
    for i, ln in enumerate(c.lines, 1):
        n = chars(ln)
        sec = n / CPS
        if n > LINE_HARD:
            out.append(Hit("L-SEC", i, ln, f"{n}字（{sec:.1f}秒）。1行は長くても{LINE_HARD}字。2行に割るか削る"))
        elif sec > LINE_SOFT:
            out.append(Hit("L-SEC", i, ln, f"{n}字（{sec:.1f}秒）。{LINE_SOFT:.0f}秒を越える行は、関所で離れる行に挙がりやすい",
                           look=True))
    return out


def closing_index(lines: list) -> int:
    """締めの行（最後の問い。最後がアーカイブの1行で、その前が問いなら問いの行）。1から。"""
    n = len(lines)
    if n >= 2 and "アーカイブ" in lines[-1] and ("？" in lines[-2] or "?" in lines[-2]):
        return n - 1
    return n


def l_after(c: Ctx):
    """F-037 題の答え（【答】）が出たら、すぐ締める。【答】から締めまでに挟む行を数える。"""
    if not c.answer_marked:
        return None
    ans = max(c.answer_marked)
    end = closing_index(c.lines)
    between = list(range(ans + 1, end))
    if not between:
        return []
    if len(between) >= AFTER_HARD:
        return [Hit("L-AFTER", ans, c.lines[ans - 1], f"答えのあと、締めまでに{len(between)}行（{between[0]}〜{between[-1]}行目）。"
                    f"{AFTER_HARD - 1}行までにして、無くても話が通じる行は消す")]
    return [Hit("L-AFTER", i, c.lines[i - 1], "答えのあとの行: この行が無いと話が通じないか（通じるなら消す。「最後にもう一笑い」は足さない）",
                look=True) for i in between]


KANJI_NUM = {"〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
KANJI_UNIT = {"十": 10, "百": 100, "千": 1000}


def to_int(s: str) -> int | None:
    """「101」「１０１」「百一」「1,200」→ 数。万・億は序数に出ないので見ない。"""
    s = s.replace(",", "").replace("，", "")
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    if s.isdigit():
        return int(s)
    total, cur = 0, 0
    for ch in s:
        if ch in KANJI_NUM:
            cur = KANJI_NUM[ch]
        elif ch in KANJI_UNIT:
            total += (cur or 1) * KANJI_UNIT[ch]
            cur = 0
        else:
            return None
    return total + cur


NUM = re.compile(r"[0-9０-９][0-9０-９,，]*|[〇一二三四五六七八九十百千]+")
ORDINAL = re.compile(r"([0-9０-９][0-9０-９,，]*|[〇一二三四五六七八九十百千]+)(体|回|日|人|個|杯|番|軒|か国|カ国|ヶ国|泊|本|枚|度|台|匹)目")


def l_num(c: Ctx):
    """F-039 あとで拾う数は、拾う行より前に声で言う。序数（〜体目・〜回目）の手前の数が前の行の声に無いのを △ で出す。

    **△ にする。** 「人生3回目のフランス」のように、その行の中で言って出す数は、前に要らない。
    拾う前提として要ったかどうかは字では決まらないので、読むのは批評役の (i)（`script_writing.md` 0.8 の決まり4）。
    """
    out = []
    said: set = set()
    for i, ln in enumerate(c.lines, 1):
        for m in ORDINAL.finditer(ln):
            v = to_int(m.group(1))
            if v is not None and v >= 2 and v - 1 not in said and v not in said:
                out.append(Hit("L-NUM", i, ln, f"「{m.group(0)}」の手前の数（{v - 1}）が、前の行の声に無い。拾う数なら前の行で言う",
                               look=True))
        for m in NUM.finditer(ln):
            v = to_int(m.group(0))
            if v is not None:
                said.add(v)
    return out


QUOTE = re.compile(r"「([^」]*)」")
# 誰の言葉か・どこで見た話かの印（`script_writing.md` 0.8 の決まり3。返事・看板のように「どこに書いてあったか」を言うのも印）。
# 「コメント」は印に数えない。視聴者の書き込みは、印を付けても持ち出さない（F-048。前はここが「コメントで」を足せと言っていた）
ATTR = re.compile(r"って|言われ|言うて|言うた|言った|言わ|言う|言い|ゆうて|聞い|聞か|らしい|書いて|書いと|"
                  r"返事|メール|メッセージ|看板|張り紙|貼り紙|いわく|曰く|教えて|呼ばれ|叫")


def l_quote(c: Ctx):
    """F-039 人の言葉は「」に、誰の言葉かの印を声で（同じ行か、1つ前の行に）。印の無い「」の行を △ で出す。

    **△ にする。** 札の字（「1A」）や自分の一言の「」もある。どちらかを読むのは批評役の (i)。
    """
    out = []
    for i, ln in enumerate(c.lines, 1):
        qs = [q for q in QUOTE.findall(ln) if chars(q) >= 3]
        if not qs:
            continue
        rest = QUOTE.sub("", ln)
        prev = c.lines[i - 2] if i >= 2 else ""
        if ATTR.search(rest) or ATTR.search(prev):
            continue
        out.append(Hit("L-QUOTE", i, ln, f"「{qs[0][:12]}」が誰の言葉か・どこの字かの印が、声に無い（〜って・言われて。画に居る人の言葉か）",
                       look=True))
    return out


def l_ask(c: Ctx):
    """F-032 最後の問いは「みんな」に向ける。「みんな」の無い終わりの問いを △ で出す。"""
    if not c.lines:
        return None
    end = closing_index(c.lines)
    ln = c.lines[end - 1]
    if not ("？" in ln or "?" in ln) or "アーカイブ" in ln or "みんな" in ln:
        return []
    return [Hit("L-ASK", end, ln, "終わりの問いに「みんな」が無い（「みんなやったら、〜？」「みんなは〜？」で、見る人に向ける）", look=True)]


DESU = re.compile(r"です|ます|でした|ました|ません|でしょう")


def l_desu(c: Ctx):
    """F-004 です・ます調は、ふざけるとき以外使わない（`script_writing.md` 2）。「」の中は人の言葉なので見ない。"""
    out = []
    for i, ln in enumerate(c.lines, 1):
        m = DESU.search(QUOTE.sub("", ln))
        if m:
            out.append(Hit("L-DESU", i, ln, f"です・ます調（「{m.group(0)}」）。ふざけている所か（説明口調・振り返り口調になっていないか）",
                           look=True))
    return out


# ---------- 2026-10-23（#1019、F-048・F-049・F-050）: 滝の回 p1 で、あやとに直された所のうち字で決まるもの ----------
# 帳面が `lint:L-INNER`・`lint:L-PARTICLE` を名指したのに、規則が無かった（1枚は「lint が見る」と、無い守りを約束していた）

LEDGER_DIR = ROOT / "tools/shorts/feedback"
_LED: list = []   # 読んだ帳面（1回だけ読む）。読めなければ [None]


def _ledger():
    """帳面（`ledger.py` の Ledger と、その読み手）。読めなければ (None, None)。L-NICK と L-ATE は「見ていない」になる。"""
    if not _LED:
        try:
            if str(LEDGER_DIR) not in sys.path:
                sys.path.insert(0, str(LEDGER_DIR))
            import ledger as ledger_mod
            _LED.append((ledger_mod, ledger_mod.load()))
        except (OSError, ImportError):
            _LED.append((None, None))
    return _LED[0]


# 視聴者の書き込み・配信の内輪で話を動かす言葉（F-048）。「配信」だけでは拾わない（締めの「配信のアーカイブ見てね」
# 「本日22時から配信見にきてね」は内輪ではない。あやとが自分で書いた終わりの形）
INNER = re.compile(r"コメント|コメ欄|チャット|リスナー|視聴者|スパチャ|スーパーチャット|投げ銭|配信で言われ|みんなに言われ")


def card_and_lines(c: Ctx) -> list:
    """[(行, 字)]。題の札（行 0。読まない字でも、見る人の目に入る）と、声の行。"""
    return ([(0, c.title_card.replace("\n", ""))] if c.title_card else []) + list(enumerate(c.lines, 1))


def l_inner(c: Ctx):
    """F-048 配信の内輪（コメント・チャット・視聴者の書き込み）を持ち出さない。題の札も見る。"""
    out = []
    targets = card_and_lines(c)
    for i, ln in targets:
        m = INNER.search(ln)
        if m:
            out.append(Hit("L-INNER", i, ln, f"配信の内輪（「{m.group(0)}」）。ショートはほとんど初見。視聴者の書き込みで話を動かさず、"
                                             "その行ごと消すか、本人・画に居る人（地元の人・宿の人・店の人）・起きた出来事で言う"))
    return out


# 帳面の「直す前 → 直した後」に書いた呼び名の直し。あやとに直されるたびに帳面に足すと、ここが増える（手で辞書を持たない）
NICK_PAIR = re.compile(r"呼び名「([^」]+)」→「([^」]+)」")


def nicknames(led=None) -> dict:
    """帳面の呼び名の直し {配信の中の呼び名: 誰でも分かる言葉}。帳面が読めなければ空。"""
    if led is None:
        led = _ledger()[1]
    if led is None:
        return {}
    out = {}
    for it in led.items.values():
        for bad, good in NICK_PAIR.findall(it.fields.get("直す前 → 直した後", "")):
            out.setdefault(bad, good)
    return out


def nick_at(text: str, nick: str):
    """字の中の呼び名（長い片仮名語の一部・「ポチる」「ポチっと」のような動きの言葉は数えない）。"""
    return re.search(r"(?<![ァ-ヶー])" + re.escape(nick) + r"(?![ァ-ヶーっッるりらろれゃャ])", text)


def l_nick(c: Ctx):
    """F-048・F-008 配信の中の呼び名（ポチ）を、初見に通じる言葉に替える。題の札も見る。"""
    d = nicknames()
    if not d:
        return None
    out = []
    targets = card_and_lines(c)
    for i, ln in targets:
        for bad, good in d.items():
            if nick_at(ln, bad):
                out.append(Hit("L-NICK", i, ln, f"配信の中の呼び名「{bad}」。初見には何の話か分からない（あやとの直し:「{good}」）"))
    return out


# 助詞の抜け（F-049）。詰めた言い方のうち、字で決まる3つだけを見る。関西の話し言葉で自然に抜く所もある
# （あやとは「路線バス乗るの今日が初めて」を通した）ので、行は △、題の札だけ ✕
# 1) 名詞のすぐあとの「見に／観に（行く・来る）」。「花見」「下見」のように、1語の名詞になっているものは外す
SEE = re.compile(r"(?<=[一-龥々ァ-ヶー])(?<!花)(?<!月)(?<!雪)(?<!下)(?<!味)(?<!脇)(?<!夢)(?<!形)(?<!様子)(見|観)に(行|来|い|き|く)")
# 2) 地名のすぐあとの「来たら・行ったら」（「に」が無い）。「パリ行きのバス」は見ない
# 「き」（かな）は数えない。「ジョージアきれい」を拾う
PLACE_GO = re.compile(r"来(た|て|る|ま|れ)|行(った|って|く|こ|け)")
# 3) 名詞のすぐあとの「乗る・乗った」（「乗り放題」「乗り換え」は見ない）
RIDE = re.compile(r"(?<=[一-龥々ァ-ヶー])乗(る|った|って|ろ|ら|れ|ん)")


NOUN_TAIL = re.compile(r"[一-龥々ァ-ヶー]+$")


def particle_drops(text: str) -> list:
    """字の中の助詞の抜け。[(抜けている字, 直すなら)]。"""
    out = []

    def noun(m):
        return NOUN_TAIL.search(text[:m.start()]).group(0)
    for m in SEE.finditer(text):
        out.append((noun(m) + m.group(0), f"{noun(m)}を{m.group(0)}"))
    for i, name, _ in places_in(text) + [(m.start(), m.group(0), None) for m in REAL_PLACE.finditer(text)]:
        rest = text[i + len(name):]
        if PLACE_GO.match(rest):
            out.append((name + rest[:3], f"{name}に{rest[:3]}"))
    for m in RIDE.finditer(text):
        out.append((noun(m) + m.group(0), f"{noun(m)}に{m.group(0)}"))
    return out


def l_particle(c: Ctx):
    """F-049 題も原稿も、助詞を抜いた詰めた日本語にしない。題（札。無ければ1行目）は ✕、ほかの行は △。"""
    if not c.lines:
        return None
    out = []
    title_line = 0 if c.title_card is not None else 1
    title = c.title_card.replace("\n", "") if c.title_card is not None else c.lines[0]
    for got, fix in particle_drops(title):
        out.append(Hit("L-PARTICLE", title_line, title, f"題に助詞の抜け（「{got}」→「{fix}」）。あやとの題でも札ごと直し、"
                                                       "1行目も直した字で読む（直したことを提出に書く）"))
    for i, ln in enumerate(c.lines, 1):
        if i == 1 and norm_title(ln) == norm_title(title):
            continue    # 1行目が題そのもの（上で見た）
        for got, fix in particle_drops(ln):
            out.append(Hit("L-PARTICLE", i, ln, f"助詞の抜け（「{got}」→「{fix}」）。声だけで一度で分かるか", look=True))
    return out


NOTE_MIN = 8   # 当て表の1枚ぶんの字の下限。「なし」「OK」「当たらない」だけでは、当てたかどうかが読めない


def l_ate(c: Ctx):
    """F-050 約束のカード1枚ずつに、当たる行とどう直したか／当たらない理由を書いた当て表（spec の promises）が無いと渡せない。

    **中身の正しさは見ない。** 見るのは、カードの ID が全部あるか・行の番号が原稿の中か・字が空でないか、だけ。
    2026-10-23 の棚卸しで、約束26個のうち10個が作文者に中身ごと届いていなかった。届いても当てたかは誰も見ていなかった。
    """
    if not c.has_spec:
        return None
    led_mod, led = _ledger()
    if led is None:
        return None
    want = [it.id for it in led_mod.script_items(led)]
    if c.promises is None:
        return [Hit("L-ATE", None, "spec に promises が無い", f"当て表が無い。約束のカード {len(want)} 枚の ID ごとに、"
                    "{\"lines\": [当たる行], \"note\": \"どう直したか／当たらない理由\"} を spec の promises に書く")]
    if not isinstance(c.promises, dict):
        return [Hit("L-ATE", None, "spec の promises", "当て表は ID → {lines, note} の形で書く")]
    out = []
    miss = [i for i in want if i not in c.promises]
    if miss:
        out.append(Hit("L-ATE", None, f"当て表 {len(want) - len(miss)}/{len(want)}", f"当てていない約束: {'・'.join(miss)}"))
    n = len(c.lines)
    for fid in want:
        e = c.promises.get(fid)
        if e is None:
            continue
        lines = e.get("lines") if isinstance(e, dict) else None
        note = (e.get("note") or "").strip() if isinstance(e, dict) else ""
        if not isinstance(lines, list) or not all(isinstance(x, int) and not isinstance(x, bool) and 0 <= x <= n for x in lines):
            out.append(Hit("L-ATE", None, fid, f"{fid} の lines は、当たる行の番号の並び（題の札は 0。当たらないなら []）"))
        if len(note) < NOTE_MIN:
            out.append(Hit("L-ATE", None, fid, f"{fid} の note が空か短い（当たる行をどう直したか、当たらないならその理由を書く）"))
    for fid in sorted(set(c.promises) - set(want)):
        out.append(Hit("L-ATE", None, fid, f"{fid} は約束のカードに無い ID", look=True))
    return out


# 規則の since。同じ日の決まりは、あやとのコメントID で前後を分ける（`--as-of 2026-10-23:6354242835` なら、朝の
# フォカッチャの添削の時点。夕方の滝の回の直しでできた規則は当てない）
S1019 = "2026-10-23:6370959237"


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
    Rule("L-SORRY", ("F-040",), "2026-10-21", "謝る行（全部 △。謝って言い切りを引っ込めていないか）", l_sorry),
    Rule("T-CARD", ("F-015",), "2026-10-16", "題の札が4秒を越えて出る（spec の title_card_seconds）", t_card),
    Rule("L-SEC", ("F-034",), "2026-10-21", f"1行が{LINE_HARD}字を越える（✕）・{LINE_SOFT:.0f}秒を越える（△）", l_sec),
    Rule("L-AFTER", ("F-037",), "2026-10-21", f"【答】から締めまでに{AFTER_HARD}行以上（✕）・1〜2行（△）", l_after),
    Rule("L-NUM", ("F-039",), "2026-10-21", "序数の手前の数が、前の行の声に無い（△）", l_num),
    Rule("L-QUOTE", ("F-039",), "2026-10-21", "「」の言葉に、誰の言葉かの印が無い（△）", l_quote),
    Rule("L-ASK", ("F-032",), "2026-10-21", "終わりの問いに「みんな」が無い（△）", l_ask),
    Rule("L-DESU", ("F-004",), "2026-10-16", "です・ます調の行（△。「」の中は見ない）", l_desu),
    # ---- 2026-10-23（#1014、F-047）: フォカッチャの下書きを、関所の批評役が落とせなかった所のうち、字で決まるもの ----
    Rule("T-READ", ("F-047",), "2026-10-23", "1行目が題の札の字と違う（札があるときだけ。句読点・改行・国旗は見ない）", t_read),
    Rule("L-NEXT", ("F-047",), "2026-10-23", "次の配信に誘う最後の行に時刻が無い・spec の next_stream の時刻を言っていない", l_next),
    # ---- 2026-10-23（#1019、F-048・F-049・F-050）: 字幕を写した滝の回 p1 を、あやとが直した所のうち字で決まるもの ----
    Rule("L-INNER", ("F-048",), S1019, "配信の内輪（コメント・チャット・リスナー・視聴者・スパチャ・投げ銭・配信で言われ）", l_inner),
    Rule("L-NICK", ("F-048", "F-008"), S1019, "配信の中の呼び名（辞書は帳面の `呼び名「…」→「…」`）", l_nick),
    Rule("L-PARTICLE", ("F-049",), S1019, "助詞の抜け（名詞＋見に行く・地名＋来たら・名詞＋乗った）。題は ✕・行は △", l_particle),
    Rule("L-ATE", ("F-050",), S1019, "当て表（spec の promises）に約束のカードの ID が欠ける・中身が空", l_ate),
)


# ---------- 読む ----------

def read_script(path: Path) -> tuple:
    """原稿の行（空行と # の行は飛ばす。`readtime.lines` と同じ）と、字に【足】・【答】の印があった行。"""
    lines, ashi, answer = [], set(), set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        if "【足】" in s:
            ashi.add(len(lines) + 1)
        if "【答】" in s:
            answer.add(len(lines) + 1)
        lines.append(MARK.sub("", s).strip())
    return lines, ashi, answer


def spec_for(script: Path) -> Path:
    """script.txt → spec.json、script_A.txt → spec_A.json。"""
    stem = script.stem
    suffix = stem[len("script"):] if stem.startswith("script") else ""
    return script.with_name(f"spec{suffix}.json")


def build(script: Path, title: str | None = None, spec: Path | None = None, use_spec: bool = True,
          next_stream: str | None = None) -> Ctx:
    lines, ashi, answer = read_script(script)
    rows, card, came, secs, nxt = None, None, "原稿の1行目（国旗は見ていない）", None, None
    sp = spec or spec_for(script)
    has_spec, promises = False, None
    if use_spec and sp.exists():
        s = json.loads(sp.read_text(encoding="utf-8"))
        rows = s.get("rows")
        if not isinstance(rows, list):
            other = [k for k in ("lines", "rows_A", "items") if k in s]
            raise ValueError(f"{sp.name} に rows が無い" + ("（" + "・".join(other) + " で書いてある）" if other else "")
                             + "。行ごとの字・根拠・画は rows に書く（読み飛ばすと【足】【答】と画が空のまま通る）。原稿だけを当てるなら --no-spec")
        if len(rows) != len(lines):
            raise ValueError(f"{sp.name} の rows が {len(rows)} 行で、原稿は {len(lines)} 行（spec を原稿に合わせて直す）")
        has_spec, promises = True, s.get("promises")
        if s.get("title_card"):
            card, came = s["title_card"], f"{sp.name} の title_card"
        secs = s.get("title_card_seconds")
        nxt = s.get("next_stream") or None
        for i, r in enumerate(rows or [], 1):
            if "【答】" in (r.get("why") or ""):
                answer.add(i)
    if title is not None:
        card, came = title, "--title"
    if next_stream is not None:
        nxt = next_stream
    return Ctx(lines=lines, title_card=card, title_from=came, rows=rows, ashi_marked=ashi, answer_marked=answer,
               card_seconds=secs, next_stream=nxt, has_spec=has_spec, promises=promises)


AS_OF = re.compile(r"20\d\d-\d\d-\d\d(:\d+)?")


def when(s: str) -> tuple:
    """「2026-10-23」「2026-10-23:6370959237」→（日付, コメントID か None）。"""
    day, _, cid = s.partition(":")
    return day, (int(cid) if cid else None)


def in_force(since: str, as_of: str | None) -> bool:
    """規則（since）が as_of の時点で在ったか。同じ日なら、両方にコメントID があるときだけ前後を比べる
    （どちらかが日付だけなら、その日に在ったことにする。落とす側に倒す）。"""
    if not as_of:
        return True
    (sd, sc), (ad, ac) = when(since), when(as_of)
    if sd != ad:
        return sd < ad
    return sc is None or ac is None or sc <= ac


def lint(c: Ctx, as_of: str | None = None) -> dict:
    """規則を全部当てる。

    Returns:
        {"hits": [Hit], "ran": [規則], "blind": [(規則, 理由)], "later": [規則]}
        blind は入力が無くて見ていない規則、later は as_of より後にできた規則
    """
    hits, ran, blind, later = [], [], [], []
    for r in RULES:
        if not in_force(r.since, as_of):
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
    "T-READ": "題の札が無い（--title か spec の title_card を渡す）",
    "L-ASHI": "spec が無く、原稿の字にも【足】の印が無い",
    "T-REAL": "題が空", "T-METAPHOR": "題が空", "L-END": "原稿が空",
    "T-CARD": "spec に title_card_seconds が無い",
    "L-AFTER": "【答】の印が無い（原稿の字か spec の why に【答】を付ける）",
    "L-ASK": "原稿が空",
    "L-NICK": "帳面に呼び名の直し（`呼び名「…」→「…」`）が無い・帳面が読めない",
    "L-ATE": "spec が無い（当て表は spec の promises に書く）・帳面が読めない",
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
               + ("。✕ が残っているうちは批評役に回さない" if fails else "。字で拾える指摘には当たっていない（面白いかは批評役の (h) で）"))
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description="原稿を、あやとの指摘の帳面に機械で当てる")
    ap.add_argument("script", nargs="?", help="原稿（1行1文。1行目は読み上げる題）")
    ap.add_argument("--title", help="題の札の字（国旗つき）。無ければ隣の spec の title_card")
    ap.add_argument("--spec", help="spec.json の在りか（既定は原稿の隣）")
    ap.add_argument("--next", help="最後の行で言う次の配信（「本日22時」）。無ければ隣の spec の next_stream")
    ap.add_argument("--no-spec", action="store_true", help="spec を読まない")
    ap.add_argument("--as-of", help="この日（YYYY-MM-DD）か、その日のあやとのコメントの時点（YYYY-MM-DD:<コメントID>）までにできた決まりだけを当てる")
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
            if not AS_OF.fullmatch(a.as_of):
                raise ValueError(a.as_of)
            date.fromisoformat(when(a.as_of)[0])
        except ValueError:
            ap.error("--as-of は YYYY-MM-DD か YYYY-MM-DD:<コメントID>")
    p = Path(a.script)
    try:
        c = build(p, a.title, Path(a.spec) if a.spec else None, not a.no_spec, a.next)
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
