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
**帳面の決まりのうち、字で拾えるものだけ**を規則にしてある。
ただし、あやとの指摘ではなく**出した本の数字から決めた規則**（L-WIDE）は、帳面ではなく仮説の台帳
（`references/playbook.md` の N 番号）を `hypo` に持つ。帳面には足さない（あやとが言っていない決まりを、言ったことにしない）。
台帳の行には規則の名前（`lint.py` の L-WIDE）を書いて、名前から行き来できるようにする（`lint_selftest.py` の `hypo_link`）。
**研究から決めた規則**（L-RUN・L-ANSNEXT。出した37本の維持率と跳ねた回の構成、#1403）は、帳面にも台帳にも足さず、出どころの issue を
`src` に持つ。どれも △ で、spec の行に種類（`kind`）がある原稿だけに当たる。2026-11-25 に、温泉 v5・ボザ v9 で磨いた形を全部の回へ
広げた（#1441、帳面 F-093）ので、同じ研究から L-CLIFF（✕。題の直後の前置き）・T-HOOK・L-NUM38・L-VOICE0・L-BANG（△）を足した。面白いか・テンポ・「？」が残るか・映像の枠の外でも
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
import statistics
import sys
import unicodedata
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
MAX_CHARS = 390   # 2026-11-13 実測: 上限 1.4 倍で、行の間を含めて毎秒6.7字（378字が 56.4秒）

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
    persona: str | None = None                       # spec の persona（誰に向けてか。F-099）
    baseline: list | None = None                     # spec の baseline（その回で実際にした行動の流れ。F-099）
    plan: str | None = None                          # 隣の plan.md の字（3案の比べ。F-022）。無ければ None
    option: str | None = None                        # 案の字（script_A.txt なら A）。script.txt なら None
    no_price: str | None = None                      # spec の no_price（買った物の値段を配信で言っていない訳。F-102）
    shape: str | None = None                         # spec の shape（回の型。「配信」か、別の型の名前。F-052）

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
    hypo: tuple = ()   # 帳面の代わりに持つ、仮説の台帳（`playbook.md`）の番号。出した本の数字から決めた規則だけ
    src: tuple = ()    # 帳面でも台帳でもない出どころ（研究の issue。"#1403"）。研究から決めた規則だけ
    until: str = ""    # この日から当てない（新しい頼む文と食い違う規則を退かせた日）。as_of がこの日より前なら当てる


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

DEST = "行き"


def t_flag(c: Ctx):
    """F-030 題の札に、国の名前の前に、その国の国旗。"""
    if c.title_card is None:
        return None
    card = c.title_card.replace("\n", "")
    # 「ルーマニア行きのバス」の行き先は、乗り物の名前の一部で題の場所ではない（あやとの題 #1446「🇧🇬ブルガリアからルーマニア行きのバス移動してみた！」。F-099）
    where = [p for p in places_in(card) if p[1] != HOME and not card.startswith(DEST, p[0] + len(p[1]))]
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
FEEL = re.compile(r"みたいな|のような")   # 「天国みたいな世界だった」。前に本当にした行動があれば、気持ちのたとえとして △
DID = re.compile(r"(た|だ)ら[、,]?")


def t_metaphor(c: Ctx):
    """F-031 題を比喩・見立てで作らない。"""
    t = c.title
    if not t:
        return None
    m = METAPHOR.search(t)
    if not m:
        return []
    if FEEL.match(m.group(0)) and DID.search(t[:m.start()]):
        # 本当にした行動（〜に行ったら）のあとの、気持ちのたとえ。作った見立てとは別（あやとの題 #1451「…本屋さんに行ったら天国みたいな世界だった！」）
        return [Hit("T-METAPHOR", 0, t, f"題のたとえ（「{m.group(0)}」）は、本人がその場で言った気持ちか。作った見立てなら、本当に起きたことで言い切る"
                    "（F-031・F-099）", look=True)]
    return [Hit("T-METAPHOR", 0, t, f"題が見立て（「{m.group(0)}」）。本当に起きたことで言い切る")]


# 題が結果を伏せる言い方。✕ にしないのは、あやと本人が「まさかの事態に」を決まりにしているから（F-071・#1171）。
# F-031（言い切る）と F-071（伏せる）は「落ちを言うと見る理由が消えるか」で分かれる。字では見分けられないので △ で人に渡す。
HIDE = re.compile(r"まさかの|事態|衝撃の|驚きの|予想外の|(し|た|だ)結果[！!？?…]*$|結果は[…？?]")


def t_hide(c: Ctx):
    """F-031・F-071 題が結果を伏せている（△）。伏せてよいのは、落ちを言うと見る理由が消える回だけ。"""
    t = c.title
    if not t:
        return None
    m = HIDE.search(t.replace("\n", ""))
    if not m:
        return []
    return [Hit("T-HIDE", 0, t, f"題が結果を伏せている（「{m.group(0)}」）。落ちを言うと見る理由が消える回なら F-071 の伏線のまま、"
                "そうでなければ本当に起きたこと（出来事・数）で言い切る（F-031）", look=True)]


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
    """F-032・F-091 最後の行は、問いか、アーカイブへの1行か、次の配信への誘い——でなければ △ で批評役に回す。

    **△ にした（2026-11-23 #1403）。** あやとが「終わりは型をガチっと決めるんじゃなくて臨機応変に」と答えた（F-091）。
    落ちで切る・本人の一言で切って0秒目に戻す輪も、回によっては合う。字ではそれと挨拶・まとめ・別の話の終わりを
    見分けられないので、落とさずに批評役が読む。

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
                "（落ちで切る・0秒目に戻す輪ならよい。挨拶・まとめ・別の話で終えていないか）", look=True)]


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


# 語の途中の「です」「でした」「ます」は拾わない（2026-11-04）。クラムチャウダーの回の「別茹でする」「別茹でした」（茹で＋する・した）、
# バゲットの回の「僕ですら」（で＋すら）に △ が出ていた。「で」で終わる動詞（茹で・撫で・奏で・愛で・詣で・秀で）のあとの「です・でした」、
# 「です」のあとが「る・ら」（〜でする・〜ですら）、「ますます」は、です・ます調ではない。「茹でます」の「ます」は拾う
DESU = re.compile(r"(?<![茹撫奏愛詣秀])で(?:す(?![るら])|した|しょう)|(?<!ます)ます(?!ます)|ました|ません")


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


# 本人が人の動画・投稿に「コメントした」のは、配信の内輪ではない（2026-11-04、ワルテミスさんとの対談の回。
# 本人がワルテミスさんの動画に書き込んだのがきっかけの話で、作文者が ✕ を避けて「書いたら」に言い換えていた）。
# 本人がした「コメントした」だけを通す。書いたのが本人でないもの（コメントしてくれた・コメントした人・みんながコメントした）、
# 頼む形（コメントしてね）、名詞の「コメント」（コメントで・コメントくれた）は今までどおり拾う
SELF_COMMENT = re.compile(r"コメントした(?!人|ひと|方|かた|子|奴|やつ)")
OTHERS = re.compile(r"(みんな|皆|誰か|だれか|人|視聴者|リスナー|常連|フォロワー|ファン)(さん|ら|たち)?(が|も|は)?、?$")


def self_comment(ln: str, m) -> bool:
    """INNER の当たり m が、本人がした「コメントした」か（書いた人を、すぐ前の字で見る）。"""
    return bool(SELF_COMMENT.match(ln, m.start())) and not OTHERS.search(ln[: m.start()])


def l_inner(c: Ctx):
    """F-048 配信の内輪（コメント・チャット・視聴者の書き込み）を持ち出さない。題の札も見る。"""
    out = []
    targets = card_and_lines(c)
    for i, ln in targets:
        m = next((x for x in INNER.finditer(ln) if not self_comment(ln, x)), None)
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


# 前の回・ほかの日の事情の補足（F-008 の5回目・2026-11-13 #1186）。字で拾えるのは、前の回を名指す言葉だけ。
# 「昨日」「前に」は、その日の話の中でも言う（「昨日こねた生地」）ので数えない
PREV = re.compile(r"先週|前回|リベンジ|この前の(?:配信|動画)|前の(?:配信|動画)|(?:昨日|先日|おととい)の(?:配信|動画)")


def l_prev(c: Ctx):
    """F-008 前の回・ほかの日の事情（「先週は雨で流れたリベンジや！」）を、題と締めのあいだに挟まない。

    あやとは #1186 で「何回も言ってるけど、こういう唐突な補足がすごく話の腰を折って初見からすると「？」となり、離脱する」と書き、
    その行ごと消して、すぐ前の行を「街のどこからでも見える十字架まで歩きたい！」（いまやること）に替えた。
    **締めの行は見ない**（あやと #1014「リベンジにワンパンピザを本日22時から作るので配信見にきてね！」は、次の配信への誘い）。
    **題が同じ言葉を言っている回も見ない**（題の約束が「リベンジ」なら、それは前提で、唐突な補足ではない）。
    """
    if not c.lines:
        return None
    said = {m.group(0) for m in PREV.finditer(c.title)}
    end = closing_index(c.lines)
    out = []
    for i, ln in enumerate(c.lines[1:end - 1], 2):
        m = next((x for x in PREV.finditer(ln) if x.group(0) not in said), None)
        if m:
            out.append(Hit("L-PREV", i, ln, f"前の回・ほかの日の事情（「{m.group(0)}」）。初見には何の話か分からず、話の腰を折る。"
                           "この行が無くても次の行に渡れるなら消す。要るなら、いまやることを言う1行に"
                           "（あやとの直し: 行を消し、前の行を「街のどこからでも見える十字架まで歩きたい！」に）"))
    return out



# 選んだ訳（F-056）。1行の中で、訳（〜から・〜ので）を言ってから選んだ物（〜にした）を言う形だけを見る。
# 行の頭の「だから、」「やから、」は前の行を受けるつなぎなので見ない（「だから、全部を歩ける島にした。」は話の筋）
PICKWHY = re.compile(r"(から|ので)、?[^。！？]{0,20}?(?<!こと)(にした|にしました|にしてん|にする|に決定|に決めた|に決めました|を選んだ|を選びました|に変えた|に変えました)")
HEAD_CONJ = re.compile(r"^(だから|やから|なので|ほんで|それで)、?")


def l_pickwhy(c: Ctx):
    """F-056 選んだ訳（「ヌテラは全部ヌテラ味になるから、蜂蜜ナッツにした。」）を、題と締めのあいだに置かない。

    あやとは #1447 で、企画の A を選んだ返事にこの行を引いて「いらない」と書いた。作文者は「あとの『結局、蜂蜜の味しかせえへん』の
    前ふりになる」と残していた。**前ふりになることは、残す訳にならない。** 頼んだ物は、次の出来事の行と画で分かれば足りる。
    題（1行目）と締めの行は見ない。行の頭のつなぎ（だから・やから）の「から」は数えない。
    """
    if not c.lines:
        return None
    end = closing_index(c.lines)
    out = []
    for i in range(2, end):
        ln = c.lines[i - 1]
        head = HEAD_CONJ.match(ln)
        m = next((x for x in PICKWHY.finditer(ln) if not head or x.start() >= head.end()), None)
        if m:
            out.append(Hit("L-PICKWHY", i, ln, f"選んだ訳（「{m.group(0)}」）。題の答えに要らない説明で、前ふりになっても残さない。"
                           "行ごと消し、頼んだ物は次の出来事の行と画で見せる（あやと #1447「→いらない」）"))
    return out

TENKI = re.compile(r"天気(やから|だから|やし|やろ|やん)")
TENKI_OK = ("良い", "いい", "ええ", "悪い", "いい", "な", "晴れの")


def l_tenki(c: Ctx):
    """F-103 「天気やから」（関西の口語で＝晴れ）を書かない。AI の声では晴れの意味が落ちる。

    あやとは #1450 で「今日は天気やから、外に出ることにした！」を「良い天気だから」に直した。
    前に「良い・いい・ええ・悪い」などが付いていれば通す。
    """
    out = []
    for i, ln in enumerate(c.lines, 1):
        for m in TENKI.finditer(ln):
            if any(ln[:m.start()].endswith(w) for w in TENKI_OK):
                continue
            out.append(Hit("L-TENKI", i, ln, f"「{m.group(0)}」は晴れか雨かが耳で分からない。「良い天気やから」のように言う（あやと #1450「→良い天気だから」）"))
            break
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


# ---------- 2026-11-11（#1173、`docs/shorts-analytics-2026-11.md` 8章の論点9）: あやとの指摘ではなく、出した本の数字から ----------
# 1行の字数の中央値が15字以下の7本は、24時間のエンゲージビューの比が 1.51、16字以上の18本は 0.93。行を畳んだぶん1行が伸びていた
# （1本の字数は約300字のまま）。仮説 N5 として次の本から全部に当てる。**落とさない**（数字の向きで、あやとの決まりではない）

WIDE_MAX = 15   # 1行の読み上げる字の目安（仮説 N5）


def spoken_chars(text: str) -> int:
    """喋る速さの物差しにする字数（`tools/shorts/plan/build_edit.py` の `spoken_chars` と同じ数えかた）。

    句読点・記号・空白・国旗は数えず、長音の「ー」と数字・英字は数える。L-SEC の `chars` とは別物で、8章の数字が
    この数えかたなので、比べる物差しを揃える。あちらを読み込まないのは、本編集の道具の書きかけで原稿の検査まで
    止めないため（揃っているかは `lint_selftest.py` の `wide` が見る）。
    """
    return sum(1 for ch in unicodedata.normalize("NFKC", text) if unicodedata.category(ch)[0] in "LN")


def own_voice(r) -> bool:
    """spec の行が、配信の本人の声を流す行か（`orig_voice`、声だけ別の秒から取る `voice_src`。F-051）。"""
    return isinstance(r, dict) and bool(r.get("orig_voice") or r.get("voice_src"))


def read_lines(c: Ctx) -> list:
    """AI の声が読む行 [(行, 字数)]。本人の声の行は外す。叫びは配信で言ったままの1息で、行を分けて縮める所ではない。"""
    rows = c.rows or []
    return [(i, spoken_chars(ln)) for i, ln in enumerate(c.lines, 1) if not (i <= len(rows) and own_voice(rows[i - 1]))]


def l_wide(c: Ctx):
    """N5 1行の読み上げる字が16字以上の行を △ で出す（1本の字数は変えずに、行を分けて15字以下にできるか）。

    **1行目は見ない。** 題の札をそのまま読む行（T-READ）で、題は14〜31字ある。割ると札の字と変わり、T-READ が ✕ にする。
    """
    got = read_lines(c)
    if not got:
        return None
    return [Hit("L-WIDE", i, c.lines[i - 1], f"{n}字。1本の字数は変えずに、行を分けて{WIDE_MAX}字以下にできるか"
                "（分けると意味が切れるなら残してよい。仮説 N5）", look=True)
            for i, n in got if i > 1 and n > WIDE_MAX]


def width_line(c: Ctx) -> str | None:
    """行の字数の中央値の1行。題の1行目も入れる（8章の数字と同じ数えかた）。読み上げる行が無ければ None。

    `--as-of` で L-WIDE を当てない日でも出す。10/29 以前の原稿と比べるのに使う（8章の論点9）。
    """
    ns = [n for _, n in read_lines(c)]
    if not ns:
        return None
    return f"1行の字数: 中央値 {statistics.median(ns):g}字（読み上げる{len(ns)}行。数えるだけ。1文を割って15字に揃えない。#1457）"


# ---------- 2026-11-23（#1403）: あやとの指摘でも、出した本の仮説でもなく、研究（出した37本の維持率を原稿の行に重ねた・
# 跳ねた回20本の構成。`references/diagnosis_2026-11-23.md`）から。帳面の ID も台帳の番号も持たず、出どころの issue を `src` に持つ ----------
# 行の種類（spec の rows の `kind`）と問いの開け閉め（`turn`）は、作文者が6欄の表で書く（`writer_prompt.md` 4）。
# 種類の名前は診断の 1.1 と付録A の物差しと同じ。**どの行にも kind が無い spec は見ない**（「見ていない」。前からの原稿は今までどおり通る）

KINDS = ("題", "出来事", "引っ張り", "数", "前置き", "説明", "反応", "味", "締め")
KIND_ALIAS = {"題読み": "題", "値段・数": "数", "値段": "数", "締めの問い": "締め", "配信へ": "締め"}   # 付録A の書きかたでも読む
TURNS = ("o", "c", "oc", "-")
TURN_ALIAS = {"ー": "-", "－": "-", "−": "-", "–": "-", "—": "-", "なし": "-", "co": "oc"}
RUN_KEEP = ("出来事", "引っ張り", "数")   # 続きを切る種類。ほかの種類が RUN_MAX 行続いたら、その行から △（L-RUN）
RUN_MAX = 3
OPENS = ("出来事", "引っ張り")   # 次を開く種類（L-ANSNEXT）。turn に o があれば、種類を問わず開いたに数える
ANS_WINDOW = 3.0   # 題の答えの行が終わってから、次を開く行が始まるまでの秒（診断 1.1 の「答」と同じ物差し）


def est_sec(ln: str) -> float:
    """1行の声の秒と、次の行までの間の見積もり（`brief.py` の `seconds` と同じ: 上限の速さで読んで最短 1.2秒＋間 0.3秒）。"""
    return max(1.2, chars(ln) / CPS) + 0.3


def kind_of(r) -> str | None:
    """spec の行の種類（付録A の書きかたは畳む）。書いていなければ None。決まりに無い字はそのまま返す（L-RUN が △ で出す）。"""
    k = str(r.get("kind") or "").strip() if isinstance(r, dict) else ""
    return KIND_ALIAS.get(k, k) or None


def turn_of(r) -> str | None:
    """spec の行の問いの開け閉め（o・c・oc・-）。書いていなければ None。"""
    t = str(r.get("turn") or "").strip().lower() if isinstance(r, dict) else ""
    return TURN_ALIAS.get(t, t) or None


def row_at(c: Ctx, i: int) -> dict:
    """spec の i 行目（1から）。spec が無い・行が足りなければ空の辞書。"""
    rows = c.rows or []
    return rows[i - 1] if 0 < i <= len(rows) and isinstance(rows[i - 1], dict) else {}


def kinds(c: Ctx) -> list | None:
    """行ごとの種類（原稿の行の数に揃える）。spec が無い・どの行にも kind が無ければ None（L-RUN・L-ANSNEXT は見ない）。"""
    ks = [kind_of(r) for r in (c.rows or [])]
    if not any(ks):
        return None
    return (ks + [None] * len(c.lines))[:len(c.lines)]


def close_at(c: Ctx, ks: list) -> int:
    """締めの行（1から）。最後の問い（`closing_index`）と、2行目より後で種類が「締め」の最初の行の、早いほう。

    問い → 次の配信への誘い、で終える原稿は、`closing_index` が誘いの行を締めに数えるので、問いの行を種類で拾う。
    """
    first = next((i for i, k in enumerate(ks, 1) if i > 1 and k == "締め"), len(c.lines) + 1)
    return min(closing_index(c.lines), first)


def l_run(c: Ctx):
    """#1403 出来事・引っ張り・数の無い行が3行続いたら、3行目から △。題の1行目と締めの行は数えない。

    出した37本では、前置き・説明・反応・味だけの行が3行続くと、そこから余計に落ちた（1秒に0.28点。4行に1行が大きく落ちる）。
    跳ねた回の最長は中央値3行、同じチャンネルのふつうの回は5行。直近18本では15本・53行がこれに当たった（診断 1.2）。
    欄の抜け（種類の無い行）・決まりに無い種類・開け閉めの字も △ で出す。黙って読み飛ばすと、規則が効いていないのに緑になる。
    """
    ks = kinds(c)
    if ks is None:
        return None
    out = []
    for i, (k, ln) in enumerate(zip(ks, c.lines), 1):
        t = turn_of(row_at(c, i))
        if k is None:
            out.append(Hit("L-RUN", i, ln, f"種類（spec の kind）が無い。全部の行に1つ書く（{'・'.join(KINDS)}）", look=True))
        elif k not in KINDS:
            out.append(Hit("L-RUN", i, ln, f"種類「{k}」は決まりの字でない（{'・'.join(KINDS)} のどれか）", look=True))
        if t is not None and t not in TURNS:
            out.append(Hit("L-RUN", i, ln, f"開け閉め（spec の turn）「{t}」は決まりの字でない（{'・'.join(TURNS)} のどれか）", look=True))
    run = 0
    for i in range(2, close_at(c, ks)):
        if ks[i - 1] in RUN_KEEP or ks[i - 1] not in KINDS:   # 分からない種類では数えない（上で △ にしてある）
            run = 0
            continue
        run += 1
        if run >= RUN_MAX:
            out.append(Hit("L-RUN", i, c.lines[i - 1], f"出来事・引っ張り・数の無い行が{run}行続いた（{i - run + 1}〜{i}行目）。"
                           "この行を出来事か「〜たら……」か数の行にする（要らない説明・反応なら消す。#1403）", look=True))
    return out


def l_ansnext(c: Ctx):
    """#1403 題の答え（【答】）の次の行が、問いも出来事も開かない（味・反応・説明・前置き・数）なら、その行を △。

    出した37本では、答えの行で落ち、そのあと次を開かない行でも落ち続けた。跳ねた回は16本中12本が、答えのあと1〜3秒で
    次の問いか出来事を開いていた（ふつうの回は4本中0本）。**答えの次がすぐ締めなら当てない。** 短い反応を1つ挟んでも、
    答えの行が終わって3秒のうちに開く行が始まれば当てない（診断の「答」の物差し。クリスマスの回の「わお、人がいっぱい！」）。
    開いたかは、行の種類（出来事・引っ張り）か turn の o で見る。種類の無い行・決まりに無い種類で止まったら見ない（L-RUN が出す）。
    答えのあとに行を足すかどうかは帳面 F-037 のまま（L-AFTER が見る）。
    """
    ks = kinds(c)
    if ks is None or not c.answer_marked:
        return None
    end = close_at(c, ks)
    out = []
    for a in sorted(c.answer_marked):
        nxt = a + 1
        if nxt in c.answer_marked or nxt >= end:
            continue
        t, j = 0.0, nxt
        while j < end and t <= ANS_WINDOW:
            if ks[j - 1] not in KINDS or ks[j - 1] in OPENS or "o" in (turn_of(row_at(c, j)) or ""):
                break
            t += est_sec(c.lines[j - 1])
            j += 1
        else:
            out.append(Hit("L-ANSNEXT", nxt, c.lines[nxt - 1], f"題の答え（{a}行目）の次が{ks[nxt - 1]}の行で、{ANS_WINDOW:g}秒のうちに"
                           "次の問いも出来事も開かない。要らない行なら消して締めへ渡し、残すなら次の問いか出来事を開く行にする（#1403）",
                           look=True))
    return out


# ---------- 2026-11-25（#1403・#1441、帳面 F-093）: 温泉 v5・ボザ v9 で磨いた作りかたを全部の回へ ----------
# 診断（`references/diagnosis_2026-11-23.md` 4.5）の案のうち、まだ当てていなかった5つ。あやとの答え（#1403 の Q2〜Q5）と
# 「ブラッシュアップ完璧」（#1441）のあとなので、L-CLIFF だけを ✕ にし、ほかは △（数えたいが、字だけでは良し悪しが決まらない）。
# 帳面には足さない（F-093 は進め方の項目で、カードにすると当て表の欄が1つ増える）。出どころの issue を `src` に持つ

# 題の直後の行の前置きの決まり文句。出した37本の2行目で、当たった17行は全部が前置きだった（診断 4.5。外れ0。37本で作った並びなので、
# 次の本で外れが出たら △ に下げる）。頭の決まり文句（まずは・今日は…）は、行が「〜たら……」で終わる引っ張りなら当てない
# （温泉 v5 の「まずは嗅いでみたら……」の形。ほかの前置きの字は、引っ張りで終わっても当てる）
CLIFF = re.compile(r"やってきた|移動[！!。]|(へ|に)(バス|電車|歩いて)?移動|楽しみにしてた|気になってた|^材料は|住んで|旅中|旅して(る|いる)"
                   r"|おいら|に着いて、|^首都から|^(日本|海外)では|^人気と噂|スタート[！!]|(買い|見|食べ)に行く[！!。]$")
CLIFF_HEAD = re.compile(r"^(今日は|明日|今回|最近|まずは|ということで|って訳で|てことで)")
PULL_END = re.compile(r"(たら|ったら)[、…。！？!?]*$")
# 0秒目の画が「何かが起きている最中・答え・作る手元」でない字（spec の題の行の visual の頭。診断 1.1 の「0画」）
HOOK_STILL = re.compile(r"景色|風景|建物|外観|正面|街並|街なみ|写真|カード|地図|看板|横断歩道|青空|夕日|全景|俯瞰|空撮")
HOOK_OK = ("最中", "答え", "手元")   # spec の題の行に `hook` を書いたら、その字で決める
# 数（値段でなくてよい。時間・人数・量・温度）。診断の数えかたと同じ
NUM_ANY = re.compile(r"[0-9０-９]|[一二三四五六七八九十百千万]+(円|倍|回|人|日|年|体|泊|時間|分|秒|個|杯|位|度|°|キロ|グラム|ミリ)")
EARLY = 8.0        # 題の直後の数・本人の声を探す秒（見込みの秒で、この秒より前に始まる行）
BANG_MAX = 5       # 山でない行の「！」の上限（1本に。診断 2.1: 跳ねた回の AI の語りは山に取っておく）


def starts(c: Ctx) -> list:
    """行ごとの始まりの秒の見込み（`est_sec` を足していく。題の行は 0）。"""
    t, out = 0.0, []
    for ln in c.lines:
        out.append(t)
        t += est_sec(ln)
    return out


def l_cliff(c: Ctx):
    """#1403 Q2・F-093 題の直後の行（2行目）が、前置きの決まり文句（やってきた・〜へ移動・最近・〜に着いて、…）なら ✕。

    出した37本で、2行目が前置きの本は3→8秒に30点、「〜たら……」の本は18点が去った（いちばん深い崖。診断 1.3.1）。
    街の名前と「なぜ」は、題の札と国旗・出来事の行の中・最初の出来事のあとで言う（帳面 F-057・F-070 の置き換わった字）。
    """
    if len(c.lines) < 2:
        return []
    ln = c.lines[1]
    m = CLIFF.search(ln) or (None if PULL_END.search(ln) else CLIFF_HEAD.search(ln))
    if not m:
        return []
    return [Hit("L-CLIFF", 2, ln, f"題の直後が前置き（「{m.group(0)}」）。出来事・「〜たら……」・数のどれかにし、場所と「なぜ」は"
                "題の札・出来事の行の中・最初の出来事のあとへ（#1403 Q2）")]


def t_hook(c: Ctx):
    """#1403 Q4・F-093 題の行の画（0秒目）が、景色・建物・写真・カード・地図で始まるなら △。

    跳ねた回は0秒目に出来事（最中・答えの画・作る手元）が写る回が20本中12本、同じチャンネルのふつうの回は15本中1本（診断 1.1）。
    見るのは spec の題の行の `visual` の頭（最初の「→」「／」まで）。`hook` に 最中・答え・手元 を書けば、その字で通す。
    """
    r = row_at(c, 1)
    hook, vis = str(r.get("hook") or "").strip(), str(r.get("visual") or "")
    if not (hook or vis):
        return None
    if hook in HOOK_OK:
        return []
    head = re.split(r"→|／", vis, maxsplit=1)[0]
    m = HOOK_STILL.search(head) if not hook else None
    if not hook and not m:
        return []
    what = f"hook「{hook}」" if hook else f"画の頭が「{m.group(0)}」"
    return [Hit("T-HOOK", 1, c.lines[0] if c.lines else "", f"0秒目の{what}。何かが起きている最中・答えの画・作る手元から始め、"
                "景色・写真・高画質の絵は1.5秒目から（#1403 Q4）", look=True)]


def l_num38(c: Ctx):
    """#1403 Q5・F-093 題の直後から8秒（見込み）までに、数（値段でなくてよい）が1つも無ければ △。"""
    if len(c.lines) < 2:
        return []
    st = starts(c)
    if any(NUM_ANY.search(ln) for i, ln in enumerate(c.lines[1:], 2) if st[i - 1] < EARLY):
        return []
    return [Hit("L-NUM38", 2, c.lines[1], f"題の直後から{EARLY:g}秒までに数が無い。時間・人数・量・温度など、数を1つ置けるか（#1403 Q5）",
                look=True)]


def l_voice0(c: Ctx):
    """#1403 0〜8秒（見込み）に、本人の声（spec の orig_voice・voice_src）の行が無ければ △。候補が無い回はそのままでよい。"""
    if not c.has_spec:
        return None
    st = starts(c)
    if any(own_voice(row_at(c, i)) for i in range(1, len(c.lines) + 1) if st[i - 1] < EARLY):
        return []
    return [Hit("L-VOICE0", None, f"0〜{EARLY:g}秒", f"0〜{EARLY:g}秒に本人の声の行が無い。その場で漏れた一言が録れていれば、1つ置けるか"
                "（無ければ置かない。#1403）", look=True)]


PERSONAS = ("ハプニング", "情報", "グルメ")   # F-099 のペルソナ3つ（`highlight_rubric.md`「誰に見せるか」）を名指す語
BASE_MIN, BASE_MAX = 5, 7


def l_base(c: Ctx):
    """F-099 書く前に、誰に向けてか（spec の persona）と基本線（baseline。その回で実際にした行動の流れ5〜7行）を書いたか。"""
    if not c.has_spec:
        return None
    out = []
    who = str(c.persona or "").strip()
    if not who or not any(k in who for k in PERSONAS):
        out.append(Hit("L-BASE", 0, who or "（persona が無い）", "誰に向けてか（spec の persona）が無い・ペルソナ3つ（海外ハプニングを面白おかしく見たい人／"
                       "将来の海外旅の情報として見たい人／海外グルメに興味がある人）のどれも名指していない。書く前に1つ選ぶ（F-099）"))
    base = c.baseline if isinstance(c.baseline, list) else []
    base = [str(b).strip() for b in base if str(b).strip()]
    if not BASE_MIN <= len(base) <= BASE_MAX:
        out.append(Hit("L-BASE", None, f"基本線 {len(base)}行", f"基本線（spec の baseline）が{BASE_MIN}〜{BASE_MAX}行でない。"
                       "その回で実際にした行動の流れを配信の順に書き、そこへハプニング・気持ち・海外の情報を散らす（F-099）"))
    return out


VOICE_MIN = 3


# ---------- 2026-11-27: 控え（unguarded.txt）に残っていた2つを、字で数える ----------
# F-093「温泉・ボザで磨いた形を全部の回に」: 行の種類（kind）と問いの開け閉め（turn）を全部の行に書く。前は L-RUN・L-ANSNEXT が
# 「kind の無い spec は見ない」で、書かなかった回は新しい作りかたを1つも当てられずに通った。いまは書いていない行を ✕ にする。
# F-052「型の違うショートに配信の回の型を持ち込まない」: spec の shape に回の型を書く。「配信」でない回には、配信の回の型の規則
# （関西弁・最後の問い・最後の札・題の札・次の配信の誘い。STREAM_IDS の帳面の項目だけを持つ規則）を当てない。✕ を消すために
# 型の違う回へ問いや札を足す、をさせない（F-052 の「しない」）。

STREAM_SHAPE = "配信"
STREAM_IDS = {"F-004", "F-015", "F-032", "F-042", "F-047", "F-091"}   # 配信の回の型の決まり（帳面 F-052 の決まりが名指すもの）


def stream_only(r) -> bool:
    """配信の回の型の決まりだけを持つ規則か（型の違う回には当てない）。"""
    return bool(r.ledger) and set(r.ledger) <= STREAM_IDS


def l_kind(c: Ctx):
    """F-093 spec の全部の行に、種類（kind）と問いの開け閉め（turn）が決まりの字で書いてあるか（✕）。

    欄ごとに1つの当たりにまとめる（行ごとに出すと、書いていない spec の lint の結果が行の数の2倍に膨らむ）。行は最初の1行。"""
    if not c.has_spec:
        return None
    bad_k, bad_t = [], []
    for i in range(1, len(c.lines) + 1):
        r = row_at(c, i)
        k, t = kind_of(r), turn_of(r)
        if k is None or k not in KINDS:
            bad_k.append((i, k))
        if t is None or t not in TURNS:
            bad_t.append((i, t))
    out = []
    for bad, what, field_, allowed in ((bad_k, "種類", "kind", KINDS), (bad_t, "問いの開け閉め", "turn", TURNS)):
        if not bad:
            continue
        rows = "・".join(f"{i}" + (f"「{v}」" if v else "") for i, v in bad[:12]) + ("…" if len(bad) > 12 else "")
        out.append(Hit("L-KIND", bad[0][0], c.lines[bad[0][0] - 1],
                       f"{what}（spec の {field_}）が無い・決まりの字でない行: {rows}行目（{len(bad)}行）。"
                       f"全部の行に {'・'.join(allowed)} のどれかを書く（F-093。温泉・ボザで磨いた作りかたを全部の回に）"))
    return out


def l_shape(c: Ctx):
    """F-052 spec に回の型（shape）が書いてあるか（✕）。「配信」でない型の回は、配信の回の型の規則を当てない（`lint` が外す）。"""
    if not c.has_spec:
        return None
    if str(c.shape or "").strip():
        return []
    return [Hit("L-SHAPE", None, "（shape が無い）", f"回の型（spec の shape）が無い。配信アーカイブを本人の声で語る回は「{STREAM_SHAPE}」、"
                "曲に写真を合わせる回・小説のように語る回など型の違う回はその型の名前を書く。型が違えば、関西弁・最後の問い・札など"
                "配信の回の型の規則は当てない（F-052。✕ を消すために問いや札を足さない）")]


def l_voicen(c: Ctx):
    """F-078 本人の声（spec の orig_voice・voice_src）の行が1本に3つ未満なら △（あやと #1445「もうちょっと生のセリフ多い方が良い」）。"""
    if not c.has_spec:
        return None
    n = sum(1 for i in range(1, len(c.lines) + 1) if own_voice(row_at(c, i)))
    if n >= VOICE_MIN:
        return []
    return [Hit("L-VOICEN", None, f"本人の声 {n}行", f"本人の声の行が{n}つ。食べた・見た直後の感想や驚いた所で、"
                f"{VOICE_MIN}〜4か所にできるか（F-078 の2回目）", look=True)]


def l_bang(c: Ctx):
    """#1403 「！」で終わる行が、山（題・【答】・【大】・本人の声）と締めの行を除いて1本に5行を越えたら △。

    跳ねた回の AI の語りは「！」を山に取っておき、起きたことは「〜た。」で言う（診断 2）。こちらの37本では「！」の多さと
    中盤の落ちは結びつかなかったので、確かめ用（当てる前後で比べ、向きが無ければ消す）。
    """
    got = []
    for i, ln in enumerate(c.lines, 1):
        r = row_at(c, i)
        if i == 1 or i in c.answer_marked or own_voice(r) or r.get("big") or "【大】" in str(r.get("why") or ""):
            continue
        if "アーカイブ" in ln or invites(ln):
            continue
        if re.search(r"[！!]$", ln):
            got.append(i)
    if len(got) <= BANG_MAX:
        return []
    return [Hit("L-BANG", None, f"「！」{len(got)}行", f"山でない行の「！」が{len(got)}行（{'・'.join(map(str, got))}行目）。"
                f"{BANG_MAX}行までにし、起きたことは「〜た。」で言う（#1403）", look=True)]


# ---------- 2026-11-27（あやと「同じ指摘がないように永続化してください」）: 2回以上言われたのに人の目だけだった項目 ----------
# 帳面の決まりのうち字で決まる所だけ。中身（店の空気が伝わるか・初見に通じるか）は批評役の (h) と視聴者役（`critic_viewer.py`）が数える。
# どの規則も、あやとが通した7本（①〜④と p5 の3本）に今日の決まりで当てて ✕ が出ないことを確かめた（`lint_selftest.py` の `passed7`）

def _title_line(c: Ctx) -> int:
    """題の当たりを置く行（題の札があれば 0、無ければ読み上げる1行目）。"""
    return 0 if c.title_card is not None else 1


GOURMET = re.compile(r"食べ|料理|グルメ|食堂|レストラン|屋台|店")
AI_MENU = re.compile(r"AI(に|で|が)(聞|訊|調べ|言)")
EVAL_ONLY = re.compile(r"大当たり|大ハズレ|当たり(やった|だった)[！!]*$")


def l_gourmet(c: Ctx):
    """F-055 グルメの回（題に 食べ・料理・食堂・店…）で、題が評価の言葉（大当たり）で閉じる・メニューの話を AI に聞いた話で埋める、を ✕。

    店の空気（行列・相席・目の前で焼いている物）が入っているかは字では決まらないので、批評役の (h) で当てる。
    """
    t = c.title
    if not t:
        return None
    if not GOURMET.search(t):
        return []
    out = []
    m = EVAL_ONLY.search(t)
    if m:
        out.append(Hit("L-GOURMET", _title_line(c), t, f"グルメの回の題が評価の言葉（「{m.group(0)}」）で閉じる。"
                       "場所と何を食べたかを「〇〇食べてみた」で言う（あやとの直し:「北マケドニアの行列店のファーストフード食べてみた！」）"))
    for i, ln in enumerate(c.lines[1:], 2):
        m = AI_MENU.search(ln)
        if m:
            out.append(Hit("L-GOURMET", i, ln, f"メニューの話を AI に聞いた話（「{m.group(0)}」）で埋めている。"
                           "何を食べたくなって何を頼んだかを、焼いている所・出てきた所の画で言う（F-055 の2回目）"))
    return out


# 題の主役にしてよい、日本でも知られている街（F-057「知られていない街の名前で題を引かない」の外）
WELL_KNOWN = {"パリ", "ロンドン", "ローマ", "ニューヨーク", "ドバイ", "イスタンブール", "ベルリン", "アムステルダム", "ウィーン",
              "プラハ", "バルセロナ", "ミラノ", "ヴェネツィア", "ソウル", "バンコク", "台北", "香港", "シンガポール",
              "モン・サン・ミシェル", "ペトラ", "死海", "南フランス", "カイロ"}
FOOD_TITLE = re.compile(r"食べ|料理|グルメ|名物|本場|ティー|飲み|飲ん|カフェ|店|食堂|スイーツ")
PUTOFF = re.compile(r"内臓|臓物|胃袋|脳みそ|血の")


def _countries() -> set:
    try:
        return {e.get("name") for e in json.loads(FLAGS.read_text(encoding="utf-8")).values() if e.get("name")}
    except (OSError, ValueError):
        return set()


COUNTRY_NAMES = _countries()


def t_town(c: Ctx):
    """F-057 題を、知られていない街の名前（ヨーク・エディンバラ）や引く言葉（内臓）で引かない。国と「本場」「めちゃくちゃ美味しい」の大きい枠で。

    グルメ・名物の題（食べ・料理・本場・ティー…）に知られていない街があれば ✕、ほかの題（街を1日で回る回）は △。
    「エディンバラを1日で回った」（nxWncbFtsSU p2）は、あやとが通した街歩きの題なので落とさない。
    """
    t = c.title
    if not t:
        return None
    out = []
    food = bool(FOOD_TITLE.search(t))
    for _, name, _ in places_in(t):
        if name in COUNTRY_NAMES or name == HOME or name in WELL_KNOWN:
            continue
        out.append(Hit("T-TOWN", _title_line(c), t, f"題に知られていない街の名前（「{name}」）。国と「本場」「めちゃくちゃ美味しい」の大きい枠で引き、"
                       "街の名前は題の札の国旗・出来事の行の中で出す（F-057）", look=not food))
    m = PUTOFF.search(t)
    if m:
        out.append(Hit("T-TOWN", _title_line(c), t, f"題が引く言葉（「{m.group(0)}」）を言う。名物は食べたくなる言葉で題にし、"
                       "中身の説明は本文へ（あやとの直し:「イギリスのめちゃくちゃ美味しい料理、ハギスを食べてみた！」）"))
    return out


FAIL_WORD = re.compile(r"最悪|失敗|潰れ|焦げ|焦が|こぼし|こぼれ|やらかし")
RECIPE_NUM = re.compile(r"[0-9０-９一二三四五六七八九十百]+\s*(℃|度|分|時間|g|グラム|cc|ml|ミリ|個|杯|cm|回)")


def t_easy(c: Ctx):
    """F-061 題が「簡単」の回で、失敗を山にした行と、温度・時間・分量の数が1つも無い原稿を ✕。"""
    if "簡単" not in c.title:
        return []
    out = []
    for i, ln in enumerate(c.lines[1:], 2):
        m = FAIL_WORD.search(ln)
        if m:
            out.append(Hit("T-EASY", i, ln, f"題が「簡単」なのに失敗（「{m.group(0)}」）の行。山は膨らんだ・焼き上がったの変化で作る（F-061）"))
    if not any(RECIPE_NUM.search(ln) for ln in c.lines[1:]):
        out.append(Hit("T-EASY", None, "原稿ぜんぶ", "題が「簡単」なのに、温度・時間・分量の数が1つも無い。"
                       "手順を数字つきで並べ、見た人が真似できるレシピにする（F-061 の2回目: 粉300g・塩4g・230℃で30分）"))
    return out


PITCH = re.compile(r"挑戦[！!。]|チャレンジ[！!。]|を感じたくて")


def l_pitch(c: Ctx):
    """F-070 企画の都合の言い回し（「日本を感じたくて、宿で一から挑戦！」）を ✕。題と締めの行は見ない。

    「なぜやるのか」は見る人が自分のこととして分かる気持ち（日本が恋しい）で言う。初見に通じるか・次が気になるかは
    視聴者役（`critic_viewer.py`）と批評役の (h) が数える。
    """
    out = []
    for i in range(2, closing_index(c.lines)):
        ln = c.lines[i - 1]
        m = PITCH.search(ln)
        if m:
            out.append(Hit("L-PITCH", i, ln, f"企画の都合の言い回し（「{m.group(0)}」）。見る人が共感できる気持ちで言う"
                           "（あやとの直し:「海外に住んで二年になるけど、そろそろ日本が恋しい！」。F-070）"))
    return out


WISH = re.compile(r"(食べ|飲み|見|行き|乗り)た(かった|い)|欲し(かった|い)")
SURPRISE = re.compile(r"まさかの")
WORDS = re.compile(r"[ァ-ヴー]{2,}|[一-龥]{2,}")


def l_setup(c: Ctx):
    """F-095 「まさかの〜」の落ちに出る物を、それより前の行で「〜が食べたかった」と前ふりしている行を ✕。

    お任せ・偶然で出てきた物を落ちにする回は、注文の前に願いを言わせない（ago-a-v4 の「名物のムサカ、食べたかったんよ。」）。
    「伝統料理が食べたい」のように、落ちの物を名指さない願いは見ない（聖ソフィア教会の回 A。あやとが通した形）。
    """
    out = []
    for j, ln in enumerate(c.lines[1:], 2):
        m = SURPRISE.search(ln)
        if not m:
            continue
        words = set(WORDS.findall(ln[m.end():]))
        for i in range(2, j):
            prev = c.lines[i - 1]
            if not WISH.search(prev):
                continue
            shared = sorted(w for w in words if w in prev)
            if shared:
                out.append(Hit("L-SETUP", i, prev, f"{j}行目の「まさかの」の落ち（「{shared[0]}」）を、先に願いで前ふりしている。"
                               "その時点の本人がしない前ふりは消し、出てきた時点の驚きで言う（F-095）"))
    return out


BOUGHT = re.compile(r"買(った|うた|って(?!(ない|へん|なかった)))|購入(?!せ|しな)")
YEN = re.compile(r"[0-9０-９一二三四五六七八九十百千万]+\s*円")


def l_buy(c: Ctx):
    """F-102 原稿に買った物（買った・買って・購入）があるのに、円の値段が1つも無ければ ✕。買った物が無い回（買わなかった）は見ない。

    帳面の決まりは「配信で言っていたら」。言っていない回は、spec の `no_price` にその訳（どの時刻の字幕を見たか）を書けば通す。
    """
    if c.no_price:
        return []
    got = next(((i, ln, m) for i, ln in enumerate(c.lines, 1) for m in [BOUGHT.search(ln)] if m), None)
    if not got or any(YEN.search(ln) for ln in c.lines):
        return []
    i, ln, m = got
    return [Hit("L-BUY", i, ln, f"買った物（「{m.group(0)}」）の値段が無い。配信で言っていた値段を円で1つ入れる"
                "（あやとの直し:「ボザも購入！」→ 500mlで80円ぐらい。F-102）")]


PILLARS = ("土台", "山", "結末", "終わり")
PILLAR_ALIAS = {"問い": "終わり", "締め": "終わり", "終わりかた": "終わり", "オチ": "結末", "落ち": "結末"}   # 前の書きかた（F-022 の1回目は「土台 → 山 → 結末 → 問い」）
EMPTY = {"", "—", "-", "なし", "無し", "無い"}


def _cells(ln: str) -> list:
    return [x.strip() for x in ln.strip().strip("|").split("|")]


def _letter(cell: str) -> str | None:
    m = re.match(r"^[*\s]*(?:案\s*)?([A-Z])(?![A-Za-z])", cell)
    return m.group(1) if m else None


def _put(got: dict, name: str, text: str) -> None:
    """表の1つの欄を、柱（土台・山・結末・終わり）に振る。「土台・山・結末」の欄は「土台 …／山 …／結末 …」を分ける。"""
    name = PILLAR_ALIAS.get(name, name)
    if name in PILLARS:
        got.setdefault(name, text)
        return
    if all(p in name for p in ("土台", "山", "結末")):
        for part in re.split(r"[／/]", text):
            p = part.strip()
            for k in ("土台", "山", "結末"):
                if p.startswith(k):
                    got.setdefault(k, p[len(k):].strip())


def plan_pillars(plan: str, opt: str) -> dict | None:
    """plan.md の「3案の比べ」と案の節から、案 opt の 土台・山・結末・終わり の字。比べの表に案の列（行）が無ければ None。"""
    sec = re.search(r"^## 3案の比べ\s*$(.*?)(?=^## |\Z)", plan, re.M | re.S)
    if not sec:
        return None
    rows = [_cells(ln) for ln in sec.group(1).splitlines() if ln.strip().startswith("|")]
    rows = [r for r in rows if not all(re.fullmatch(r":?-+:?", x) for x in r if x)]
    if not rows:
        return None
    head, got, found = rows[0], {}, False
    if any(_letter(h) == opt for h in head[1:]):            # 案が列（行は柱）
        j = next(k for k, h in enumerate(head) if k and _letter(h) == opt)
        found = True
        for r in rows[1:]:
            if j < len(r):
                _put(got, r[0], r[j])
    else:                                                   # 案が行（列は柱）
        for r in rows[1:]:
            if r and _letter(r[0]) == opt:
                found = True
                for k, h in enumerate(head):
                    if k < len(r):
                        _put(got, h, r[k])
    if not found:
        return None
    one = re.search(rf"^## (?:{opt}案|案{opt})\b.*?$(.*?)(?=^## |\Z)", plan, re.M | re.S)
    for ln in (one.group(1).splitlines() if one else []):
        if ln.strip().startswith("|"):
            r = _cells(ln)
            if len(r) >= 2:
                _put(got, r[0], r[1])
    return got


def l_four(c: Ctx):
    """F-022 3案の企画で、この案の 土台・山・結末・終わり のどれかが plan.md の「3案の比べ」に無ければ ✕（案ごとに強みを分けない）。"""
    if not c.plan or not c.option:
        return None
    got = plan_pillars(c.plan, c.option)
    if got is None:
        return None
    miss = [p for p in PILLARS if got.get(p, "").strip().strip("*") in EMPTY]
    if not miss:
        return []
    return [Hit("L-FOUR", None, f"plan.md の案{c.option}", f"案{c.option}に{'・'.join(miss)}が無い。どの案にも土台・山・結末・終わりを持たせ、"
                "違えるのは入りかた・山の置きかた・見せかた（F-022）")]


MOOD_FAMILIES = ("tense_", "up_")   # 2系統（張りつめる＝白に濃紺の縁／上がる＝黄に茶の縁。`style_v3.json` の moods）
# 感情の字の行の割合の上限（越えたら ✕）。あやとが通した回の多いほうは 0.45（城塞 p1 の 9/20・ジョージアの犬 7/16）、
# 「AI 臭い」と返された地下鉄 p1 は 9/17（0.53）。帳面の決まりは「感情が動く行だけ」で、行の数そのものは言われていないので、通した回を落とさない線
MOOD_SHARE = 0.5


def l_mood(c: Ctx):
    """F-011 感情の字（spec の mood）が行の半分を越えたら ✕。2系統（tense_・up_）の外の名前は △（様式に無く、plain で出る）。"""
    if not c.has_spec:
        return None
    moved = [(i, str(row_at(c, i).get("mood") or "")) for i in range(1, len(c.lines) + 1)]
    moved = [(i, m) for i, m in moved if m and m != "plain"]
    out = [Hit("L-MOOD", i, c.lines[i - 1], f"感情の字「{m}」が2系統（張りつめる tense_・上がる up_）のどちらでもない。"
               "様式（style_v3.json）に無い名前は普通の字で出る。感情を出すなら2系統のどちらかに（F-011）", look=True)
           for i, m in moved if not m.startswith(MOOD_FAMILIES)]
    if len(moved) > len(c.lines) * MOOD_SHARE:
        out.append(Hit("L-MOOD", None, f"感情の字 {len(moved)}行", f"感情の字が{len(moved)}/{len(c.lines)}行で半分を越える。"
                       "感情が動く行だけに付け、ほかは plain（F-011）"))
    return out


SHOUT = re.compile(r"^[…\s]*(う[わぁ]+ー*|ああ+っ?|ぎゃ|ひゃ|やば[いっ]?|おお+っ?|まじ[かで]|え[えっ]+|すげ|すご[いっ])[ー〜]*[！!、。？?…]")


def l_shout(c: Ctx):
    """F-051 叫び・驚きの声（うわー・やばい・ああっ）で始まる行を AI の声で読む（spec に orig_voice・voice_src が無い）なら ✕。"""
    if not c.has_spec:
        return None
    out = []
    for i, ln in enumerate(c.lines[1:], 2):
        m = SHOUT.match(ln)
        if m and not own_voice(row_at(c, i)):
            out.append(Hit("L-SHOUT", i, ln, f"叫び・驚き（「{m.group(1)}」）を AI の声で読む。その秒の本人の声（spec の orig_voice）を流す"
                           "（あやとの直し:「ああっ！沼にはまった！」→ 配信 0:10:20 前後の本人の叫び。F-051）"))
    return out


# 規則の since。同じ日の決まりは、あやとのコメントID で前後を分ける（`--as-of 2026-10-23:6354242835` なら、朝の
# フォカッチャの添削の時点。夕方の滝の回の直しでできた規則は当てない）
S1019 = "2026-10-23:6370959237"


# 2026-11-26（#1457、帳面 F-100・F-101）: 作文者の頼む文を固定の1本（`writer_prompt.md`）にしたとき、それと食い違う4つを退かせた。
# 当て表（L-ATE）はやめた。「8秒までに数を1つ」（L-NUM38）は「数は気持ちが乗るときだけ」と、「1行15字以下に割る」（L-WIDE）は
# 「1文で意味を閉じ、片割れの行を作らない」と、2行目の前置きの ✕（L-CLIFF）は「最初の2行で、いまどこで何をしている人かを渡す」と食い違う。
# 消さずに until を付け、承認の時点（--as-of）で当て直すときは前の決まりのまま当てる
RETIRE = "2026-11-26"

RULES = (
    Rule("L-NARRATOR", ("F-004",), "2026-10-16", "外の語り手の説明口調（あやとは・本人いわく・だそうです）", l_narrator),
    Rule("L-PHRASE", ("F-006",), "2026-10-16", "ふだん言わない言い回し（国を出る・人に払う）", l_phrase),
    Rule("L-YEN", ("F-007",), "2026-10-16", "現地の通貨を読む", l_yen),
    Rule("L-LENGTH", ("F-019",), "2026-10-18", f"原稿が {MAX_CHARS} 字を越える（早送りになる）", l_length),
    Rule("T-FLAG", ("F-030",), "2026-10-21", "題の札の国旗（無い・違う国・国の名前の後ろ）", t_flag),
    Rule("T-REAL", ("F-031",), "2026-10-21", "題に場所も数字も無い", t_real),
    Rule("T-METAPHOR", ("F-031",), "2026-10-21", "題が見立て（〜に見えて・みたいな・のような）", t_metaphor),
    Rule("T-HIDE", ("F-031", "F-071"), "2026-11-25", "題が結果を伏せている（まさかの・事態・衝撃の。△。落ちを言うと見る理由が消えるか）", t_hide),
    Rule("L-END", ("F-032", "F-091"), "2026-10-21", "最後の行が、問いでもアーカイブへの1行でもない（△。落ち・輪ならよい）", l_end),
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
    Rule("L-ATE", ("F-050",), S1019, "当て表（spec の promises）に約束のカードの ID が欠ける・中身が空", l_ate, until=RETIRE),
    # ---- 2026-11-11（#1173、8章の論点9）: あやとの指摘ではなく、出した本の数字から。帳面ではなく仮説の台帳（playbook.md）の番号を持つ ----
    Rule("L-WIDE", (), "2026-11-11", f"1行の読み上げる字が{WIDE_MAX + 1}字以上（△。1行目の題と本人の声の行は見ない）", l_wide,
         hypo=("N5",), until=RETIRE),
    # ---- 2026-11-13（#1186、F-008 の5回目）: 十字架の登山の原稿 A の「先週は雨で流れたリベンジや！」 ----
    Rule("L-PREV", ("F-008",), "2026-11-13:6850736486", "前の回・ほかの日の事情の補足（先週・前回・リベンジ。題と締めの行は見ない）", l_prev),
    # ---- 2026-11-23（#1403）: 研究の決まり。帳面にも台帳にも足さず、出どころの issue を持つ。どれも △（落とさない） ----
    Rule("L-RUN", (), "2026-11-23", f"出来事・引っ張り・数の無い行が{RUN_MAX}行続く（△。spec に kind がある原稿だけ。欄の抜け・字の揺れも △）",
         l_run, src=("#1403",)),
    Rule("L-ANSNEXT", (), "2026-11-23", "題の答え（【答】）の次の行が、問いも出来事も開かない（△。kind がある原稿だけ。次がすぐ締めなら見ない）",
         l_ansnext, src=("#1403",)),
    # ---- 2026-11-25（#1403・#1441、帳面 F-093）: 温泉 v5・ボザ v9 の作りかたを全部の回へ。L-CLIFF だけ ✕ ----
    Rule("L-CLIFF", (), "2026-11-25", "題の直後の行（2行目）が前置きの決まり文句（やってきた・〜へ移動・最近・〜に着いて、…）", l_cliff,
         src=("#1403",), until=RETIRE),
    Rule("T-HOOK", (), "2026-11-25", "題の行の画（spec の visual の頭）が景色・建物・写真・カード・地図（△。hook に最中・答え・手元を書けば通す）",
         t_hook, src=("#1403",)),
    Rule("L-NUM38", (), "2026-11-25", f"題の直後から{EARLY:g}秒（見込み）までに数が無い（△）", l_num38, src=("#1403",), until=RETIRE),
    Rule("L-VOICE0", (), "2026-11-25", f"0〜{EARLY:g}秒（見込み）に本人の声の行が無い（△。spec がある原稿だけ）", l_voice0, src=("#1403",)),
    Rule("L-BANG", (), "2026-11-25", f"山でない行の「！」が1本に{BANG_MAX}行を越える（△。確かめ用）", l_bang, src=("#1403",)),
    # ---- 2026-11-25（#1447、F-056）: 揚げパンの回 A の「ヌテラは全部ヌテラ味になるから、蜂蜜ナッツにした。」→「いらない」 ----
    Rule("L-PICKWHY", ("F-056",), "2026-11-25:7173925743", "選んだ訳（1行の中の「〜から、…にした」。題・締め・行の頭の「だから」は見ない）", l_pickwhy),
    # ---- 2026-11-26（#1450、F-103）: 「今日は天気やから」→「良い天気だから」 ----
    Rule("L-TENKI", ("F-103",), "2026-11-26:7202917751", "「天気やから」（良し悪しの無い天気）", l_tenki),
    # ---- 2026-11-26（#1446・#1445、F-099・F-078）: 誰に向けてか・基本線・本人の声の数 ----
    Rule("L-BASE", ("F-099",), "2026-11-26:7192063851", "spec に誰に向けてか（persona）・基本線（baseline 5〜7行）が無い", l_base),
    Rule("L-VOICEN", ("F-078",), "2026-11-26:7191788789", f"本人の声の行が{VOICE_MIN}つ未満（△。spec がある原稿だけ）", l_voicen),
    # ---- 2026-11-27（あやと「同じ指摘がないように永続化してください」）: 2回以上言われたのに人の目だけだった項目。since は言われた日 ----
    Rule("L-GOURMET", ("F-055",), "2026-10-28:6467902838", "グルメの回の題が評価の言葉（大当たり）で閉じる・メニューを AI に聞いた話で埋める", l_gourmet),
    Rule("T-TOWN", ("F-057",), "2026-10-29:6495119160", "題に知られていない街（グルメ・名物の題は ✕、ほかは △）・引く言葉（内臓）", t_town),
    Rule("T-EASY", ("F-061",), "2026-10-31:6550407728", "題が「簡単」の回の失敗の行・温度・時間・分量の数が無い", t_easy),
    Rule("L-PITCH", ("F-070",), "2026-11-11:6800754106", "企画の都合の言い回し（〜を感じたくて・挑戦！。題と締めは見ない）", l_pitch),
    Rule("L-SETUP", ("F-095",), "2026-11-26:7188503464", "「まさかの〜」の落ちの物を、前の行の願い（〜が食べたかった）で前ふり", l_setup),
    Rule("L-BUY", ("F-102",), "2026-11-26:7202945549", "買った物（買った・購入）があるのに、円の値段が1つも無い", l_buy),
    Rule("L-FOUR", ("F-022",), "2026-10-18", "3案の企画で、この案の土台・山・結末・終わりのどれかが plan.md の比べに無い", l_four),
    Rule("L-MOOD", ("F-011",), "2026-10-16:6219894353", "感情の字（mood）の行が半分を越える（✕）・2系統の外の名前（△）", l_mood),
    Rule("L-SHOUT", ("F-051",), "2026-10-23:6372556052", "叫び・驚き（うわー・やばい・ああっ）で始まる行を AI の声で読む", l_shout),
    # ---- 2026-11-27: 控えの F-093・F-052 を字で数える ----
    Rule("L-KIND", ("F-093",), "2026-11-27", "spec の行に種類（kind）・問いの開け閉め（turn）が無い・決まりの字でない", l_kind),
    Rule("L-SHAPE", ("F-052",), "2026-11-27", "spec に回の型（shape）が無い（「配信」でない型には配信の回の型の規則を当てない）", l_shape),
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
    has_spec, promises, persona, baseline, no_price = False, None, None, None, None
    shape = None
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
        persona, baseline = s.get("persona"), s.get("baseline")
        no_price = str(s.get("no_price") or "").strip() or None
        if s.get("title_card"):
            card, came = s["title_card"], f"{sp.name} の title_card"
        secs = s.get("title_card_seconds")
        nxt = s.get("next_stream") or None
        shape = str(s.get("shape") or "").strip() or None
        for i, r in enumerate(rows or [], 1):
            if "【答】" in (r.get("why") or ""):
                answer.add(i)
    if title is not None:
        card, came = title, "--title"
    if next_stream is not None:
        nxt = next_stream
    stem = script.stem
    option = stem[len("script_"):] if stem.startswith("script_") else None
    pl = script.with_name("plan.md")
    plan = pl.read_text(encoding="utf-8") if pl.exists() else None
    return Ctx(lines=lines, title_card=card, title_from=came, rows=rows, ashi_marked=ashi, answer_marked=answer,
               card_seconds=secs, next_stream=nxt, has_spec=has_spec, promises=promises, persona=persona, baseline=baseline,
               plan=plan, option=option, no_price=no_price, shape=shape)


AS_OF = re.compile(r"20\d\d-\d\d-\d\d(:\d+)?")


def when(s: str) -> tuple:
    """「2026-10-23」「2026-10-23:6370959237」→（日付, コメントID か None）。"""
    day, _, cid = s.partition(":")
    return day, (int(cid) if cid else None)


def in_force(since: str, as_of: str | None, until: str = "") -> bool:
    """規則（since）が as_of の時点で在ったか。同じ日なら、両方にコメントID があるときだけ前後を比べる
    （どちらかが日付だけなら、その日に在ったことにする。落とす側に倒す）。until（退かせた日）の当日からは当てない。"""
    if until and when(as_of or date.today().isoformat())[0] >= until:
        return False
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
        blind は入力が無くて見ていない規則、later は as_of より後にできた規則、retired は as_of の時点で退いた規則、
        off は回の型（spec の shape）が「配信」でないので当てない配信の回の型の規則（F-052）
    """
    hits, ran, blind, later, retired, off = [], [], [], [], [], []
    for r in RULES:
        if c.shape and c.shape != STREAM_SHAPE and stream_only(r):
            off.append(r.id)
            continue
        if r.until and not in_force(r.since, as_of, r.until) and in_force(r.since, as_of):
            retired.append(r.id)
            continue
        if not in_force(r.since, as_of):
            later.append(r.id)
            continue
        got = r.run(c)
        if got is None:
            blind.append(r.id)
            continue
        ran.append(r.id)
        hits.extend(got)
    return {"hits": hits, "ran": ran, "blind": blind, "later": later, "retired": retired, "off": off}


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
    "L-WIDE": "読み上げる行が無い（全部が本人の声の行）",
    "L-RUN": "spec の rows に行の種類（kind）が無い",
    "L-ANSNEXT": "spec の rows に行の種類（kind）が無い・【答】の印が無い",
    "T-HOOK": "spec の題の行に visual も hook も無い",
    "L-VOICE0": "spec が無い（本人の声は spec の orig_voice・voice_src で見る）",
    "L-BASE": "spec が無い（誰に向けてか・基本線は spec の persona・baseline に書く）",
    "L-VOICEN": "spec が無い（本人の声は spec の orig_voice・voice_src で見る）",
    "L-GOURMET": "題が空", "T-TOWN": "題が空",
    "L-FOUR": "隣に plan.md の「3案の比べ」が無い・案の列が無い・原稿が script_<案>.txt でない",
    "L-MOOD": "spec が無い（感情の字は spec の mood で見る）",
    "L-SHOUT": "spec が無い（本人の声は spec の orig_voice・voice_src で見る）",
    "L-KIND": "spec が無い（行の種類と開け閉めは spec の kind・turn に書く）",
    "L-SHAPE": "spec が無い（回の型は spec の shape に書く）",
}


def report(path: str, c: Ctx, res: dict, as_of: str | None) -> str:
    rules = {r.id: r for r in RULES}
    n = sum(chars(ln) for ln in c.lines)
    out = [f"原稿: {path}（{len(c.lines)}行・{n}字）  題: {c.title_from}"
           + (f"  決まり: {as_of} までにできたもの" if as_of else "")]
    for h in sorted(res["hits"], key=lambda h: (h.look, h.line if h.line is not None else 999)):
        mark = "△" if h.look else "✕"
        where = "題の札" if h.line == 0 else ("原稿ぜんぶ" if h.line is None else f"{h.line}行目")
        ids = "/".join(rules[h.rule].ledger + rules[h.rule].hypo + rules[h.rule].src)
        out.append(f"{mark} {ids} {h.rule} {where}「{h.text}」 {h.note}")
    for rid in res["blind"]:
        out.append(f"見ていない: {rid}（{BLIND_WHY.get(rid, '入力が無い')}）")
    if res["later"]:
        out.append(f"{as_of} より後の決まりなので当てていない: {'・'.join(res['later'])}")
    if res.get("off"):
        out.append(f"回の型が「{c.shape}」（配信の回でない）ので当てていない配信の回の型の規則: {'・'.join(res['off'])}（F-052）")
    if res.get("retired"):
        out.append(f"退かせた決まり（{RETIRE}。頼む文と食い違う）: {'・'.join(res['retired'])}")
    wl = width_line(c)
    if wl:
        out.append(wl)
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
            print(f"{r.id:11s} {'/'.join(r.ledger + r.hypo + r.src):13s} {r.since}  {r.what}")
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
