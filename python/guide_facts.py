"""**配信から抜いた「実際に行った」（`streams/YYYY/MM/<stem>.facts.json`）を、確かめる・街ごとに束ねる道具。**

    python3 python/guide_facts.py new   <stem>                    # 頭だけ埋めた空のファイルを置く（議事録の見出しを地図として出す）
    python3 python/guide_facts.py read  <stem> 0:17:00 0:24:00    # 文字起こしをその窓だけ。--chat で同じ時刻のチャットを並べる（名前は伏せる）
    python3 python/guide_facts.py check [stem ...] [--month 2026-10] [--country north-macedonia [--city skopje]]
    python3 python/guide_facts.py city  --country north-macedonia --city skopje [--out streams/guide/north-macedonia/skopje.md]

手順と結果の形の正は `.claude/skills/guide-facts/SKILL.md`。標準ライブラリだけで動く。

## なぜ要るか

行った街のガイドは「行った日・払った額・本人の一言・その場面の時刻つきリンク」で答える（#1196）。
材料は配信の文字起こしで、**抜くのは1本につき1人の担当**（議事録と同じ分担。`python/stream_notes.py`）。
人が読んで抜いたものは、黙って次のことが起きる（`docs/seo-2026-11/E_content.md` §4 が実測）。

- **言っていない数字が入る**: 議事録は機械が書いたもの。数字は1分のあいだに割れる（180円とも108円とも）
- **視聴者さんの文が、本人の一言として入る**: 本人はチャットを声に出して読むので、字幕では本人の発話になる
- **視聴者さんの素性が入る**: 字幕には呼びかけ（名前）が、議事録には @名前 が山ほど在る
- **辿れない**: 「どの回のどこで言ったか」が無いと、面に時刻つきリンクを張れないし、あとから確かめられない

だから「字幕に在るか」「チャットと重ならないか」「名前が無いか」「時刻へ辿れるか」は人に見させず、ここで見る。

## 置き場を材料の隣にした理由

`<stem>.facts.json` は `<stem>.transcript.txt` の読みかたの1つなので、同じ stem で隣に置く。
別の置き場に集めると、配信が消えた・字幕を取り直した、のときに片方だけ残る。
街ごとに束ねたものは作り直せるので、正にしない（`city` が毎回ここから組む）。

## 確かめるもの（NG の札）

| 札 | 何を見るか |
| --- | --- |
| `form` | 形（種類・要る欄・型） |
| `head` | 頭（video_id・開始・現地の日付・国と街）が、stem と議事録の `- 場所:` と寄せる表から出る値と同じか |
| `time` | 時刻が文字起こしの範囲に在る。根拠の行が実在する。`t` が根拠の行の中に在る |
| `notes` | 根拠の見出しが議事録に在り、`t` がその節の中に在る |
| `number` | 本文の算用数字と、言ったままの額が、根拠の行の前後 ±90秒の字幕に在る |
| `quote` | 言い回しが、根拠の行の前後 ±90秒の字幕に在る（空白・句読点・`[ ]` の補いは除いて比べる） |
| `readaloud` | 言い回しが、その前後のチャットの文と重ならない（読み上げ） |
| `identity` | 視聴者さんの素性（@名前・チャットの投稿者名・呼びかけ・投げ銭の額と語）が無い |
| `music` | 歌詞の印の付いた行（`[音楽]`。#969）に掛からない |
| `split` | 根拠の行の近くに、この項目が挙げていない同じ単位の額が在る／単位が言われていない／本人が言う前にチャットに同じ額が在る——のに「確かめが要る」（`verify`）が無い |
| `place` | 場所の名前の「字幕での形」がその配信の字幕に在る（無ければ、名前が議事録か題名に在る） |

終了コード: 0=通った / 1=NG がある / **2=見るものが無い**（ファイルが無い・項目が0件・材料が読めない。
緑に見えて何も見ていない、を避ける。`docs/island-standards.md` §15）。
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_notes as sn  # noqa: E402  時刻の読みかた・投げ銭の行の形は議事録の道具と同じものを使う

ROOT = Path(__file__).resolve().parents[1]
STREAMS = ROOT / "streams"
TABLE = ROOT / "python/data/guide/cities.json"

# 種類 → 下書きの節。並びは「問いに答える順」（どう行く → いくら → どこ → 食べる → 泊まる → 様子 → 注意）
KINDS = {
    "move": "どう行く・どう動く",
    "price": "いくらかかる",
    "place": "どこへ行った",
    "food": "食べたもの",
    "stay": "泊まる",
    "fact": "街のようす",
    "caution": "気をつけること",
    "quote": "本人の言い回し",
}

WIN = 90          # 数字・言い回しを探す幅（根拠の行の前後、秒）
BIN = 30          # 字幕は30秒きざみ。行 [T] の中身は T〜T+30 秒の発話
SPAN_MAX = 300    # 根拠の行の、頭から尻までの幅の上限。広く取れば何でも通ってしまうので
NEAR = 30         # 「近い時刻」の額を探す幅（根拠の行の前後1行）
CHAT_BEFORE = 180  # 読み上げは、チャットが付いてから何分かあとのこともある
CHAT_AFTER = BIN   # 行 [T] の発話は T+30 まで続くので、その中に付いたチャットも読み上げうる
# チャットは話より10秒以上遅れて付く（streams/README.md）。行の頭から10秒以内に在る額は、
# 本人の話を聞いて書いたものではありえない＝チャットが先
CHAT_LEAD = 10

OWN = {"あやと", "ayato", "あやと島", "あやとグルメアプリ", "あやと島案内鳥"}
HONOR = r"(?:さん|ちゃん|くん|氏|ニキ|ネキ|様|さま)"
# 呼びかけ。字幕には「〜さん、こんばんは」がそのまま入る。チャットの表記と違う呼び名（あだ名）は
# 名前の突き合わせでは拾えないので、形で落とす
GREET = re.compile(
    r"[^\s、。]{1,12}" + HONOR + r"[、,。 ]?(?:こんばんは|こんにちは|おはよう|ありがとう|ようこそ|いらっしゃい|おかえり|初見|久しぶり)")
PAID_WORDS = re.compile(r"投げ銭|スパチャ|スーパーチャット|どねる|ドネル|doneru|メンバーシップ", re.I)
AT_NAME = re.compile(r"[@＠][^\s「」、。（）()：:・/／]+")

ANNOT = re.compile(r"\[[^\]\d]{1,8}\]")           # 字幕の中の [笑い] [咳払い] [音楽]
SUPPL = re.compile(r"\[[^\]]*\]")                 # 言い回しの中の補い [ ]
ELLIPSIS = re.compile(r"…+|‥+|\.{3,}")            # 言い回しの中略
NUM = re.compile(r"\d+(?:,\d{3})*(?:\.\d+)?(?:万(?:\d+(?:,\d{3})*)?)?")
PAID_HEAD = re.compile(r"^(投げ銭|(?:[A-Z]{2,3} )?[^\s:\d]{0,4}\d[\d,.]*) (?=\S)")
MUSIC_LINE = "[音楽]"


# ---------------------------------------------------------------- 字の寄せかた

def norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "")


def squash(s: str) -> str:
    """比べるための形。空白・句読点・記号・字幕の注記（[笑い]）を落とす。字そのものは変えない。"""
    s = ANNOT.sub("", norm(s))
    return "".join(c for c in s if unicodedata.category(c)[0] not in "PSZC").casefold()


def numval(tok: str) -> str:
    """「1,500」「1万5000」「2万」を、比べられる1つの書きかたに。"""
    tok = tok.replace(",", "")
    if "万" in tok:
        a, b = tok.split("万")
        v = float(a) * 10000 + (float(b) if b else 0.0)
    else:
        v = float(tok)
    return str(int(v)) if v == int(v) else repr(v)


def numbers_in(s: str) -> set[str]:
    return {numval(m.group()) for m in NUM.finditer(norm(s))}


def as_num(v) -> str | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return str(int(v)) if v == int(v) else repr(float(v))


def lcs(a: str, b: str) -> int:
    """いちばん長い、続いた共通の字の数。"""
    best, prev = 0, [0] * (len(b) + 1)
    for ca in a:
        cur = [0] * (len(b) + 1)
        for j, cb in enumerate(b, 1):
            if ca == cb:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best:
                    best = cur[j]
        prev = cur
    return best


def overlap_need(q: str) -> int:
    """何字続けて同じなら「同じ文」と見るか。短い言い回しは7割、長いものは8字。"""
    return max(4, min(8, math.ceil(len(q) * 0.7)))


# ---------------------------------------------------------------- 材料を読む

def read_transcript(p: Path) -> tuple[str, list[tuple[int, str]]]:
    """（題名, [(秒, その30秒の発話)]）。頭の `# ` はヘッダ。"""
    title, lines = "", []
    for raw in p.read_text(encoding="utf-8").splitlines():
        if raw.startswith("# ") and not lines:
            title = title or raw[2:].strip()
            continue
        m = sn.LINE_TIME_RE.match(raw)
        if m:
            lines.append((sn.sec(*m.groups()), raw[m.end():].strip()))
    return title, lines


def read_chat(p: Path) -> list[dict]:
    """[{t, paid, name, body}]。行の形は `python/stream_text.py` の chat_line。"""
    out = []
    for raw in p.read_text(encoding="utf-8").splitlines():
        m = sn.LINE_TIME_RE.match(raw)
        if not m:
            continue
        rest, paid = raw[m.end():].strip(), None
        pm = PAID_HEAD.match(rest)
        if pm:
            paid, rest = pm.group(1), rest[pm.end():]
        rest = rest.removeprefix("（メンバー）")
        name, sep, body = rest.partition(": ")
        if not sep:
            name, body = rest.rstrip(":"), ""
        # 配信者の側が自動で流す定期の告知（アプリの宣伝に額が入っている）。視聴者さんの文ではない
        auto = body.startswith("【") and "定期】" in body[:40]   # 頭に絵文字の名前（:hammer_and_wrench:）が挟まる
        out.append({"t": sn.sec(*m.groups()), "paid": paid, "name": name.strip(), "body": body, "auto": auto})
    return out


def read_notes(p: Path) -> dict:
    """議事録から、場所の行の頭・見出し（時刻つき）・@名前 を。"""
    text = p.read_text(encoding="utf-8")
    place, heads = "", []
    for raw in text.splitlines():
        if raw.startswith("- 場所:") and not place:
            place = re.split(r"[（(]", raw[len("- 場所:"):], maxsplit=1)[0].strip()
        m = sn.H3_TIME_RE.match(raw)
        if m:
            heads.append((sn.sec(*m.groups()), raw[4:].strip()))
    return {"place": place, "heads": heads, "text": text,
            "names": {m.group()[1:] for m in AT_NAME.finditer(text)}}


def name_forms(names) -> tuple[set[str], set[str]]:
    """名前を、探す形に。（そのまま探すもの, 敬称が続くときだけ見るもの）。

    チャットの表記は `@まこも-z3i` `Omacha_おまっちゃ` のように尻尾や区切りが付く。
    本人が呼ぶときは頭だけなので、区切って頭も探す。短い切れ端（英字3字以下・かな2字）は
    ふつうの語に当たる（「ラン」→ランチ）ので、敬称が続くときだけ名前と見る。
    """
    long, short = set(), set()
    for n in names:
        n0 = norm(n).lstrip("@").strip().casefold()
        base = re.sub(r"-[a-z0-9]{2,6}$", "", n0)
        forms = {n0, base, re.sub(r"\d+$", "", base)} | set(re.split(r"[_\-\s・.]+", base))
        for f in forms:
            f = squash(f)
            if not f or f in OWN:
                continue
            need = 4 if f.isascii() else 3
            if len(f) >= need:
                long.add(f)
            elif len(f) >= 2:
                short.add(f)
    return long, short


# ---------------------------------------------------------------- 寄せる表

def load_table(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def resolve_place(head: str, table: dict) -> tuple[str | None, str | None, str]:
    """議事録の `- 場所:` の頭（括弧の前）→（国, 街, どう決めたか）。

    頭は「国・街」。街が書かれていない回（宿からの配信・街の名が字幕に出ない回）は、
    その国に拠点（`base`）が1つ決めてあればそこへ寄せる。**表に無い街の名は寄せない**
    （黙って拠点に入れると、別の街の回が混ざっても赤くならない）。
    """
    head = norm(head).strip()
    c_part, _, rest = head.partition("・")
    c_part, rest = c_part.strip(), rest.strip()
    for slug, c in table.get("countries", {}).items():
        if c_part not in [norm(h) for h in c.get("heads", [])]:
            continue
        for cslug, city in c.get("cities", {}).items():
            if rest and rest in [norm(h) for h in city.get("heads", [])]:
                return slug, cslug, "名前"
        if (not rest or rest in [norm(h) for h in c.get("no_city", [])]) and c.get("base"):
            return slug, c["base"], "拠点"
        return slug, None, "表に無い街"
    return None, None, "表に無い国"


def money_units(table: dict, country: str | None) -> dict[str, str]:
    """字幕での言いかた → 正の単位。"""
    out = {}
    src = dict(table.get("money", {}))
    src.update(table.get("countries", {}).get(country or "", {}).get("money", {}))
    for canon, forms in src.items():
        for f in [canon] + list(forms):
            out[norm(f).casefold()] = canon
    return out


def money_in(s: str, units: dict[str, str]) -> list[tuple[str, str]]:
    """[(額, 正の単位)]。数字のすぐあとに単位が来る形だけを拾う。"""
    if not units:
        return []
    alt = "|".join(re.escape(u) for u in sorted(units, key=len, reverse=True))
    pat = re.compile("(" + NUM.pattern + r")\s*(" + alt + ")", re.I)
    return [(numval(m.group(1)), units[m.group(2).casefold()]) for m in pat.finditer(norm(s))]


def local_date(start_jst: str, tz: str) -> str:
    from zoneinfo import ZoneInfo
    dt = datetime.strptime(start_jst, "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Asia/Tokyo"))
    return dt.astimezone(ZoneInfo(tz)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------- 1本を確かめる

STEM_RE = re.compile(r"^(\d{4}-\d\d-\d\d)_(\d\d)(\d\d)_(.+)$")


def stem_head(name: str) -> tuple[str, str] | None:
    m = STEM_RE.match(name)
    return (m.group(4), f"{m.group(1)} {m.group(2)}:{m.group(3)}") if m else None


def head_from_material(name: str, notes: dict, table: dict) -> dict:
    """頭の欄を、stem・議事録・寄せる表から機械で出す（`new` が書き、`check` が同じ値かを見る）。"""
    vid, start = stem_head(name) or ("", "")
    country, city, how = resolve_place(notes["place"], table)
    tz = table.get("countries", {}).get(country or "", {}).get("tz")
    return {"video_id": vid, "start_jst": start,
            "date_local": local_date(start, tz) if (start and tz) else None,
            "country": country, "city": city, "place_line": notes["place"], "_how": how}


class Result:
    def __init__(self, name: str):
        self.name = name
        self.ng: list[tuple[int | None, str, str]] = []
        self.blind = ""          # 見るものが無かった理由（在れば終了 2）
        self.items = 0
        self.untraceable = 0
        self.kinds: Counter = Counter()
        self.with_amount = 0
        self.verify = 0
        self.off_table: set[str] = set()

    def add(self, i, code, msg):
        self.ng.append((i, code, msg))


def strings_of(x) -> list[str]:
    if isinstance(x, str):
        return [x]
    if isinstance(x, dict):
        return [s for v in x.values() for s in strings_of(v)]
    if isinstance(x, list):
        return [s for v in x for s in strings_of(v)]
    return []


def window(lines: list[tuple[int, str]], a: int, b: int) -> tuple[str, list[tuple[int, int]]]:
    """a〜b 秒に頭の在る行をつないだ字（比べる形）と、[(字の位置, その行の秒)]。"""
    text, offs = "", []
    for t, s in lines:
        if a <= t <= b and s != MUSIC_LINE:
            offs.append((len(text), t))
            text += squash(s)
    return text, offs


def line_at(offs: list[tuple[int, int]], pos: int) -> int:
    t = offs[0][1]
    for o, lt in offs:
        if o <= pos:
            t = lt
    return t


def find_quote(quote: str, text: str) -> tuple[int, int] | None:
    """言い回しを、中略（…）で切った切れ端の順に探す。（頭の位置, 尻の位置）。"""
    frags = [squash(SUPPL.sub("", norm(f))) for f in ELLIPSIS.split(quote)]
    frags = [f for f in frags if f]
    if not frags or sum(len(f) for f in frags) < 4:
        return None
    pos, start = 0, None
    for f in frags:
        k = text.find(f, pos)
        if k < 0:
            return None
        start = k if start is None else start
        pos = k + len(f)
    return start, pos - 1


def check_item(i: int, it, ctx: dict, r: Result, spans: list) -> None:
    lines, last = ctx["lines"], ctx["last"]
    by_t = dict(lines)
    if not isinstance(it, dict):
        r.add(i, "form", "項目が辞書でない")
        return
    kind, text, t = it.get("kind"), it.get("text"), it.get("t")
    src = it.get("src") if isinstance(it.get("src"), dict) else {}
    amounts = it.get("amounts") or []
    others = it.get("other_amounts") or []
    quote, place = it.get("quote"), it.get("place")
    verify = it.get("verify")

    # --- 形
    bad = []
    if kind not in KINDS:
        bad.append(f"種類 {kind!r} は {'/'.join(KINDS)} のどれでもない")
    if not isinstance(text, str) or not text.strip():
        bad.append("本文（text）が無い")
    if isinstance(t, bool) or not isinstance(t, int):
        bad.append("時刻（t）が秒の整数でない")
    if not isinstance(src.get("lines"), list) or not src.get("lines") or not isinstance(src.get("notes"), str):
        bad.append("根拠（src.lines と src.notes）が無い")
    if kind == "quote" and (not quote or it.get("about") not in KINDS or it.get("about") == "quote"):
        bad.append("言い回しの項目には quote と、どの問いの話か（about）が要る")
    if quote is not None and not isinstance(quote, str):
        bad.append("quote が字でない")
    if verify is not None and (not isinstance(verify, str) or not verify.strip()):
        bad.append("verify は「何を確かめるか」を字で書く")
    if (kind == "place" or it.get("about") == "place") and not (isinstance(place, dict) and place.get("name")):
        bad.append("場所の項目には place.name が要る")
    if place is not None and not (isinstance(place, dict) and isinstance(place.get("name"), str)
                                  and isinstance(place.get("heard", []), list)):
        bad.append("place は {name, heard[]}")
    for a in list(amounts) + list(others):
        if not isinstance(a, dict) or as_num(a.get("value")) is None:
            bad.append("額は {value, unit, as}")
            break
    for a in amounts if not bad else []:
        if a.get("as") not in ("said", "converted"):
            bad.append("額の as は said（配信で言ったまま）か converted（換算）")
        elif a.get("unit") is not None and a.get("unit") not in ctx["canon_units"]:
            bad.append(f"単位 {a.get('unit')!r} が寄せる表に無い")
        elif a["as"] == "converted" and not (isinstance(a.get("from"), dict)
                                              and as_num(a["from"].get("value")) is not None
                                              and isinstance(a.get("rate"), (int, float))):
            bad.append("換算の額には、元の額（from）と掛けた数（rate）が要る")
        elif a["as"] == "converted" and abs(a["from"]["value"] * a["rate"] - a["value"]) > max(1, abs(a["value"]) * 0.01):
            bad.append("換算の額が、元の額×rate と合わない")
    if amounts and not it.get("what"):
        bad.append("額の在る項目には、何の額か（what）が要る")
    for b in bad:
        r.add(i, "form", b)
    if bad:
        r.untraceable += 1
        return

    r.kinds[kind] += 1
    if amounts:
        r.with_amount += 1
    if verify:
        r.verify += 1

    # --- 時刻と根拠（辿れるか）
    traced = True
    ts = []
    for s in src["lines"]:
        m = re.fullmatch(sn.TIME, str(s))
        lt = sn.sec(*m.groups()) if m else None
        if lt is None or lt not in by_t:
            r.add(i, "time", f"根拠の行 [{s}] が文字起こしに無い")
            traced = False
        else:
            ts.append(lt)
    if not (0 <= t <= last + BIN):
        r.add(i, "time", f"t={t} が文字起こしの範囲（0〜{last + BIN}秒）の外")
        traced = False
    if ts:
        first, end = min(ts), max(ts)
        if end - first > SPAN_MAX:
            r.add(i, "time", f"根拠の行の幅が {end - first}秒（上限 {SPAN_MAX}秒）。その場面の行だけを挙げる")
            traced = False
        elif not (first <= t < end + BIN):
            r.add(i, "time", f"t={t}（{sn.hms(t)}）が根拠の行 [{sn.hms(first)}]〜[{sn.hms(end)}] の中に無い")
            traced = False
    heads = ctx["notes"]["heads"]
    hit = [k for k, (_, h) in enumerate(heads) if h == src["notes"]]
    if not hit:
        r.add(i, "notes", f"見出し「{src['notes']}」が議事録に無い")
        traced = False
    else:
        k = hit[0]
        a = heads[k][0]
        b = heads[k + 1][0] if k + 1 < len(heads) else last + BIN
        # 見出しの時刻は、書いた人が字幕の行に合わせたもの。前後1行ぶんのずれは許す
        if not (a - BIN <= t < b + BIN):
            r.add(i, "notes", f"t={sn.hms(t)} が見出し「{src['notes']}」の節（{sn.hms(a)}〜{sn.hms(b)}）の外")
            traced = False
    if not traced:
        r.untraceable += 1
    if not ts:
        return
    first, end = min(ts), max(ts)

    # --- 歌詞の印
    for lt in sorted(set(ts + [t // BIN * BIN])):
        if by_t.get(lt) == MUSIC_LINE:
            r.add(i, "music", f"[{sn.hms(lt)}] は曲の区間（伏せてある行）。ここからは抜かない")

    # --- 数字
    raw_win = " ".join(s for lt, s in lines if first - WIN <= lt <= end + WIN)
    have = numbers_in(raw_win)
    said = [a for a in amounts if a["as"] == "said"]
    claimed = set(numbers_in(text))
    claimed |= {as_num(a["value"]) for a in said}
    claimed |= {as_num(a["from"]["value"]) for a in amounts if a["as"] == "converted"}
    for n in sorted(claimed - have):
        r.add(i, "number", f"数字 {n} が [{sn.hms(first)}] の前後 {WIN}秒の字幕に無い")
    for a in amounts:
        if a["as"] == "converted" and as_num(a["value"]) in numbers_in(text):
            r.add(i, "number", f"換算の額 {as_num(a['value'])} が本文に在る（本文は配信で言った数字だけ）")

    # --- 言い回し
    win_text, offs = window(lines, first - WIN, end + WIN)
    if quote:
        pos = find_quote(quote, win_text) if offs else None
        if pos is None:
            r.add(i, "quote", f"言い回し「{quote}」が [{sn.hms(first)}] の前後 {WIN}秒の字幕に無い")
        else:
            qa, qb = line_at(offs, pos[0]), line_at(offs, pos[1])
            q = squash(SUPPL.sub("", norm(quote)))
            need = overlap_need(q)
            for c in ctx["chat"]:
                if not (qa - CHAT_BEFORE <= c["t"] <= qb + CHAT_AFTER):
                    continue
                if lcs(q, squash(c["body"])) >= need:
                    r.add(i, "readaloud",
                          f"言い回し「{quote}」が [{sn.hms(c['t'])}] のチャットの文と重なる（読み上げ）")
                    break

    # --- 視聴者さんの素性
    # src.notes は議事録の見出しの写し（上で一字ずつ突き合わせてある）なので、ここでは見ない
    long, short = ctx["names"]
    for s in strings_of({k: v for k, v in it.items() if k != "src"}):
        if AT_NAME.search(s):
            r.add(i, "identity", "@名前 が在る")
        if PAID_WORDS.search(s):
            r.add(i, "identity", "投げ銭の話は抜かない")
        if GREET.search(norm(s)):
            r.add(i, "identity", "呼びかけ（〜さん、こんばんは）が在る")
        sq = squash(s)
        if any(n in sq for n in long) or any(re.search(re.escape(n) + HONOR, sq) for n in short):
            r.add(i, "identity", "チャットの投稿者の名前が在る")
    for c in ctx["chat"]:
        if c["paid"] and first - CHAT_BEFORE <= c["t"] <= end + CHAT_AFTER + BIN:
            if numbers_in(c["paid"]) & claimed:
                r.add(i, "identity", f"[{sn.hms(c['t'])}] の投げ銭と同じ額が在る")

    # --- 額の割れ・確かめの印
    units = {a["unit"] for a in said if a["unit"] is not None}
    why = []
    if any(a["unit"] is None for a in said):
        why.append("単位が言われていない額が在る")
    if units:
        mine = {(as_num(a["value"]), a["unit"]) for a in amounts}
        mine |= {(as_num(a["value"]), a.get("unit")) for a in others}
        for (a, b, their) in spans:
            if a <= end + NEAR and first - NEAR <= b:
                mine |= their
        near = [(v, u) for lt, s in lines if first - NEAR <= lt <= end + NEAR
                for v, u in money_in(s, ctx["units"]) if u in units]
        left = sorted({f"{v}{u}" for v, u in near if (v, u) not in mine})
        if left:
            why.append(f"[{sn.hms(first)}] の近くに、挙げていない額が在る: {'・'.join(left)}"
                       "（同じ品なら amounts に、別の品なら other_amounts に）")
        for c in ctx["chat"]:
            if c["auto"]:
                continue
            if first - CHAT_BEFORE <= c["t"] <= first + CHAT_LEAD:
                if {(as_num(a["value"]), a["unit"]) for a in said} & set(money_in(c["body"], ctx["units"])):
                    why.append(f"本人が言う前に、[{sn.hms(c['t'])}] のチャットに同じ額が在る（読み上げかもしれない）")
                    break
    if why and not verify:
        for w in why:
            r.add(i, "split", w + "。確かめが要る（verify）の印が無い")

    # --- 場所の名前
    if place:
        full = squash(" ".join(s for _, s in lines))
        for h in place.get("heard", []):
            if squash(str(h)) not in full:
                r.add(i, "place", f"字幕での形「{h}」が、この配信の字幕に無い")
        if not place.get("heard") and squash(place["name"]) not in squash(ctx["notes"]["text"] + ctx["title"]):
            r.add(i, "place", f"場所の名前「{place['name']}」が、字幕にも議事録にも題名にも無い")
        if place["name"] not in ctx["places"]:
            r.off_table.add(place["name"])


def check_file(path: Path, table: dict) -> Result:
    name = path.name[: -len(".facts.json")]
    r = Result(name)
    base = path.parent / name
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        r.blind = f"読めない（{type(e).__name__}）"
        return r
    mats = {}
    for ext in ("transcript.txt", "chat.txt", "md"):
        p = Path(f"{base}.{ext}")
        if not p.exists():
            r.blind = f"材料が無い（{ext}）"
            return r
        mats[ext] = p
    title, lines = read_transcript(mats["transcript.txt"])
    if not lines or all(s == MUSIC_LINE or not s for _, s in lines):
        r.blind = "文字起こしが読めない（行が無い）"
        return r
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list) or not items:
        r.blind = "項目が0件"
        return r
    chat = read_chat(mats["chat.txt"])
    notes = read_notes(mats["md"])

    want = head_from_material(name, notes, table)
    how = want.pop("_how")
    if want["country"] is None or want["city"] is None:
        r.add(None, "head", f"議事録の場所「{notes['place']}」を寄せられない（{how}）。寄せる表に足す")
    for k, v in want.items():
        if data.get(k) != v:
            r.add(None, "head", f"{k}: 在るべき値 {v!r} / 書いてある値 {data.get(k)!r}")

    country = table.get("countries", {}).get(want["country"] or "", {})
    city = country.get("cities", {}).get(want["city"] or "", {})
    units = money_units(table, want["country"])
    ctx = {
        "lines": lines, "last": lines[-1][0], "title": title, "chat": chat, "notes": notes,
        "names": name_forms({c["name"] for c in chat} | notes["names"]),
        "units": units, "canon_units": set(units.values()),
        "places": set(city.get("places", {})),
    }
    # ほかの項目が名乗っている額（同じ行に2つの品の値段が並ぶのはふつうなので、互いに引く）
    spans = []
    for it in items:
        try:
            ts = [sn.sec(*re.fullmatch(sn.TIME, s).groups()) for s in it["src"]["lines"]]
            their = {(as_num(a["value"]), a.get("unit"))
                     for a in (it.get("amounts") or []) + (it.get("other_amounts") or [])}
            spans.append((min(ts), max(ts), their))
        except (KeyError, TypeError, AttributeError, ValueError):
            spans.append((-1, -1, set()))
    for i, it in enumerate(items):
        rest = spans[:i] + spans[i + 1:]
        check_item(i, it, ctx, r, rest)
    r.items = len(items)
    return r


# ---------------------------------------------------------------- どれを見るか

def find_files(root: Path, stems: list[str], month: str | None) -> list[Path]:
    if stems:
        out = []
        for s in stems:
            name = Path(s).name
            for suf in (".facts.json", ".transcript.txt", ".chat.txt", ".md"):
                name = name.removesuffix(suf)
            hit = sorted(root.glob(f"*/*/{name}.facts.json"))
            out += hit or [root / "0000" / "00" / f"{name}.facts.json"]   # 無いものは「無い」と言わせる
        return out
    pat = f"{month[:4]}/{month[5:7]}/*.facts.json" if month else "*/*/*.facts.json"
    return sorted(root.glob(pat))


def head_of(p: Path) -> dict:
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def cmd_check(args, root: Path, table: dict) -> int:
    files = find_files(root, args.stems, args.month)
    if args.country:
        files = [p for p in files if head_of(p).get("country") == args.country
                 and (not args.city or head_of(p).get("city") == args.city)]
    if not files:
        print("::error::確かめる .facts.json が1本も無い")
        return 2
    blind = ng = items = untraceable = 0
    kinds: Counter = Counter()
    for p in files:
        if not p.exists():
            print(f"  --  {p.name[:-len('.facts.json')]}: ファイルが無い")
            blind += 1
            continue
        r = check_file(p, table)
        if r.blind:
            print(f"  --  {r.name}: {r.blind}")
            blind += 1
            continue
        items += r.items
        untraceable += r.untraceable
        kinds += r.kinds
        mark = "NG" if r.ng else "ok"
        kd = " ".join(f"{k}{r.kinds[k]}" for k in KINDS if r.kinds[k])
        print(f"  {mark}  {r.name}: 項目 {r.items}件（{kd}）額つき {r.with_amount}・確かめが要る {r.verify}"
              f"・辿れない {r.untraceable}")
        for i, code, msg in r.ng:
            where = "頭" if i is None else f"#{i}"
            print(f"        [{code}] {where}: {msg}")
        if r.off_table:
            print(f"        （寄せる表に無い場所の名前 {len(r.off_table)}件: {'／'.join(sorted(r.off_table))}）")
        ng += len(r.ng)
    kd = " ".join(f"{KINDS[k]} {kinds[k]}" for k in KINDS if kinds[k])
    print(f"\n{len(files)}本 / 項目 {items}件（{kd}）/ 辿れない項目 {untraceable}件 / NG {ng}件 / 見られなかった {blind}本")
    if blind:
        print("::error::見るものが無いファイルが在る（項目0件・材料が読めない）")
        return 2
    return 1 if ng else 0


# ---------------------------------------------------------------- 街ごとに束ねる

def link(vid: str, t: int) -> str:
    return f"[{sn.hms(t)}](https://www.youtube.com/watch?v={vid}&t={t}s)"


def amount_text(it: dict) -> str:
    out = []
    for a in it.get("amounts") or []:
        v = as_num(a["value"])
        v = f"{int(v):,}" if v.isdigit() else v
        s = f"{v}{a['unit'] or '（単位は言っていない）'}"
        if a["as"] == "converted":
            s += f"（{as_num(a['from']['value'])}{a['from'].get('unit') or ''} からの換算）"
        out.append(s)
    return "・".join(out)


def cmd_city(args, root: Path, table: dict) -> int:
    country = table.get("countries", {}).get(args.country)
    city = (country or {}).get("cities", {}).get(args.city)
    if not city:
        print(f"::error::寄せる表に {args.country}/{args.city} が無い")
        return 2
    files = [p for p in find_files(root, [], None)
             if head_of(p).get("country") == args.country and head_of(p).get("city") == args.city]
    if not files:
        print(f"::error::{args.country}/{args.city} の .facts.json が1本も無い")
        return 2
    # 確かめを通っていない材料で組まない
    for p in files:
        r = check_file(p, table)
        if r.blind or r.ng:
            print(f"::error::{r.name} が check を通っていない（先に check を回す）")
            return 2 if r.blind else 1
    canon = {}
    for name, forms in city.get("places", {}).items():
        for f in [name] + list(forms):
            canon[f] = name
    rows = []   # (種類, 場所, 日付, 秒, video_id, 項目)
    for p in files:
        d = head_of(p)
        for it in d["items"]:
            sect = it.get("about") if it["kind"] == "quote" else it["kind"]
            pl = canon.get((it.get("place") or {}).get("name"), (it.get("place") or {}).get("name"))
            rows.append((sect, pl, d["date_local"], it["t"], d["video_id"], it))
    rows.sort(key=lambda x: (x[2], x[3]))
    dates = sorted({x[2] for x in rows})

    def tail(x) -> str:
        return f"（{x[2]} {link(x[4], x[3])}）"

    def line(x) -> str:
        it = x[5]
        s = it["text"]
        if it["kind"] == "quote":
            s = f"「{it['quote']}」— {s}"
        elif it.get("quote"):
            s += f" 「{it['quote']}」"
        if it.get("verify"):
            s += f" 〔要確認: {it['verify']}〕"
        return f"- {s}{tail(x)}"

    out = [f"# {city['name']}（{country['name']}）— 配信から抜いた「実際に行った」の下書き", "",
           f"> `python3 python/guide_facts.py city --country {args.country} --city {args.city}` が作る。**手で直さない**"
           "（元は `streams/YYYY/MM/<stem>.facts.json`）。",
           f"> 材料: 配信 {len(files)}本（{'・'.join(dates)}）／項目 {len(rows)}件。",
           "> 額は本人が配信で口にしたまま。**円の額は、本人がその場で値札を円に直して言ったもの。**"
           "「要確認」の付いた行は、動画か外の出どころで確かめてから面に載せる。", ""]
    body = []
    for kind, title in KINDS.items():
        if kind == "quote":
            continue
        mine = [x for x in rows if x[0] == kind]
        priced = [x for x in rows if x[5].get("amounts")] if kind == "price" else []
        if not mine and not priced:
            continue
        body += [f"## {title}", ""]
        if kind == "price":
            body += ["| 何に | いくら | いつ | 場面 | 確かめ |", "| --- | --- | --- | --- | --- |"]
            for x in priced:
                it = x[5]
                body.append(f"| {it['what']} | {amount_text(it)} | {x[2]} | {link(x[4], x[3])} | "
                            f"{'要確認: ' + it['verify'] if it.get('verify') else ''} |")
            body.append("")
            mine = [x for x in mine if not x[5].get("amounts")]
        if kind == "place":
            names = []
            for x in mine:
                if x[1] not in names:
                    names.append(x[1])
            for n in names:
                body += [f"### {n}", ""] + [line(x) for x in mine if x[1] == n] + [""]
        elif mine:
            body += [line(x) for x in mine] + [""]
    out += body
    text = "\n".join(out).rstrip() + "\n"
    n_lines = sum(1 for s in body if s.startswith("- ") or (s.startswith("| ") and "---" not in s and "何に" not in s))
    n_num = sum(1 for x in rows if numbers_in(x[5]["text"]) or x[5].get("amounts"))
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    print(f"下書き: 配信 {len(files)}本 / 項目 {len(rows)}件 / 行 {n_lines}行（うち数字つきの項目 {n_num}件）", file=sys.stderr)
    return 0


# ---------------------------------------------------------------- 書きはじめ・読む

def base_of(root: Path, stem: str) -> Path | None:
    name = Path(stem).name
    for suf in (".facts.json", ".transcript.txt", ".chat.txt", ".md"):
        name = name.removesuffix(suf)
    hit = sorted(root.glob(f"*/*/{name}.transcript.txt"))
    return Path(str(hit[0])[: -len(".transcript.txt")]) if hit else None


def cmd_new(args, root: Path, table: dict) -> int:
    base = base_of(root, args.stem)
    if not base or not Path(f"{base}.md").exists():
        print("::error::文字起こしか議事録が無い（議事録が先。/stream-notes）")
        return 2
    out = Path(f"{base}.facts.json")
    notes = read_notes(Path(f"{base}.md"))
    head = head_from_material(base.name, notes, table)
    how = head.pop("_how")
    if head["country"] is None or head["city"] is None:
        print(f"::error::議事録の場所「{notes['place']}」を寄せられない（{how}）。寄せる表 {TABLE.name} に足してから")
        return 1
    if out.exists():
        print(f"もう在る: {out}")
    else:
        out.write_text(json.dumps({"schema": 1, **head, "items": []}, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        print(f"置いた: {out}（街は「{how}」で決めた）")
    _, lines = read_transcript(Path(f"{base}.transcript.txt"))
    print(f"字幕 {sum(len(s) for _, s in lines)}字・最後の行 [{sn.hms(lines[-1][0])}]。議事録の見出し（src.notes にそのまま写す）:")
    for _, h in notes["heads"]:
        print(f"  {h}")
    return 0


def cmd_read(args, root: Path) -> int:
    base = base_of(root, args.stem)
    if not base:
        print("::error::文字起こしが無い")
        return 2
    m1, m2 = re.fullmatch(sn.TIME, args.start), re.fullmatch(sn.TIME, args.end)
    if not (m1 and m2):
        print("::error::時刻は h:mm:ss")
        return 2
    a, b = sn.sec(*m1.groups()), sn.sec(*m2.groups())
    _, lines = read_transcript(Path(f"{base}.transcript.txt"))
    chat = read_chat(Path(f"{base}.chat.txt")) if args.chat and Path(f"{base}.chat.txt").exists() else []
    n = 0
    for t, s in lines:
        if not (a <= t <= b):
            continue
        n += 1
        print(f"[{sn.hms(t)}] {s}")
        # 名前は出さない（読む側に素性を持ち帰らせない）。読み上げかどうかは本文で分かる
        for c in chat:
            if t <= c["t"] < t + BIN:
                print(f"      チャット {sn.hms(c['t'])}{'（投げ銭）' if c['paid'] else ''}: {c['body']}")
    return 0 if n else 2


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(STREAMS), help="streams/ の場所（見張りが差し替える）")
    ap.add_argument("--table", default=str(TABLE), help="寄せる表（見張りが差し替える）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("stems", nargs="*")
    c.add_argument("--month")
    c.add_argument("--country")
    c.add_argument("--city")
    y = sub.add_parser("city")
    y.add_argument("--country", required=True)
    y.add_argument("--city", required=True)
    y.add_argument("--out")
    n = sub.add_parser("new")
    n.add_argument("stem")
    rd = sub.add_parser("read")
    rd.add_argument("stem")
    rd.add_argument("start")
    rd.add_argument("end")
    rd.add_argument("--chat", action="store_true")
    args = ap.parse_args(argv)
    root = Path(args.root)
    if args.cmd == "read":
        return cmd_read(args, root)
    try:
        table = load_table(Path(args.table))
    except (OSError, ValueError) as e:
        print(f"::error::寄せる表が読めない（{type(e).__name__}）")
        return 2
    if args.cmd == "check":
        return cmd_check(args, root, table)
    if args.cmd == "city":
        return cmd_city(args, root, table)
    return cmd_new(args, root, table)


if __name__ == "__main__":
    sys.exit(main())
