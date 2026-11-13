"""**配信1本から「実際に行った」を、`claude -p` に1枚だけ渡して抜く。`check` を通ったものだけを置く。**

    python3 python/guide_extract.py <stem> [<stem> ...] --out <scratch>/guide [--runs <scratch>/guide/runs.jsonl]
    python3 python/guide_extract.py --pending --country north-macedonia --out <scratch>/guide --jobs 3
    python3 python/guide_extract.py <stem> --no-write --out <dir> --model opus   # 置かずに控えだけ（完成形と比べるとき）
    python3 python/guide_extract.py <stem> --prompt-only --out <dir>              # 1枚を組むだけ（呼ばない）

形と決まりの正は `.claude/skills/guide-facts/SKILL.md`、確かめるのは `python/guide_facts.py`（この道具はそれを import して使う）。

終了コード: 0=指した回を全部置いた / 1=置けなかった回が在る（呼べなかった・返事が JSON でない）/
**2=見るものが無い回が在る**（材料が無い・1枚に名前が残った・項目が0件になった。`docs/island-standards.md` §15）。

## なぜ道具にしたか（#1203）

試作の3本は、1本につき1人の担当（Agent）が読んで抜いた。Agent は起こしただけで約6.9万トークンの前置き
（Claude Code の手引き・道具・CLAUDE.md）を読み、`read` と `check` を10回前後往復する。抜く仕事そのものは
「議事録の流れ・字幕の要る所・同じ時刻のチャット」を読んで JSON を書くだけなので、**その1枚だけを
`claude -p` に渡す**（`tools/shorts/script/critic.py` と同じ形。道具も MCP も持たせず、リポジトリの外の空の置き場で起こす）。

## 置き場を `guide_facts.py` と分けた理由

`guide_facts.py` は判定器で、標準ライブラリだけで CI の上でも動く。こちらは `claude -p` を呼ぶ作り手で、
CI では動かない。**作り手と判定器を1つのファイルにすると、作り手の都合で判定をゆるめる手が近くなる**ので分けた。
判定は `guide_facts.check_file` をそのまま呼ぶ（写さない）。見張りは `python/guide_facts_selftest.py` が
この道具を import して、`claude -p` を偽物に差し替えて当てる。

## 1枚に入れるもの・入れないもの

- 入れる: 抜く決まり（SKILL.md §2・§3 の要点）・議事録の「## 流れ」・字幕の要る所・その行に付いたチャットの本文・
  寄せる表のその街の欄（場所・遠出・通貨の言いかた）・完成形の例（別の回から6項目まで）
- **字幕は全部は入れない。** 長い回は、まず流れだけを渡して「街の事実が在る窓」を選ばせ（`pick`）、その窓だけを入れる。
  短い回（`SMALL` 字以下）は全部入れる（選ばせるほうが高くつく）
- **視聴者さんの素性は伏せる**（`mask_text`）: チャットは本文だけ（投稿者名・投げ銭の額は出さない）、
  字幕と議事録の @名前・チャットの投稿者名・呼びかけ（〜さん、こんばんは）・「名前 ¥額」は `〇〇` に。
  組んだあとに **`leaks` が独立にもう一度探し、1つでも残っていれば呼ばない**（終了 2）

## 直させかた・落としかた

返ってきたものを `check` に掛け、NG の行（`[札] #番号: 何が`）だけを添えて**同じ1枚で1回まで**直させる（`FIXES`）。
2回目も NG の付いた項目は落として、残りを置く（落とすと隣の項目の「近くの額」が変わるので、NG が無くなるまで繰り返す）。
落とした数は札ごとに出す。**項目が0件になった回は置かない**（`check` の終了 2 を合格にしない）。
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_facts as gf  # noqa: E402
import stream_notes as sn  # noqa: E402

MODEL = "sonnet"     # 3本の完成形と同じ回で比べて決めた（SKILL.md §5）
FIXES = 1            # 直させる回数。2回目も落ちたものは落とす
JOBS_MAX = 3         # 並べて回すのは3本まで（箱と API の混み具合）
SMALL = 6000         # 字幕がこれ以下の回は、窓を選ばせずに全部入れる
PICK_SHARE = 0.5     # 長い回で選ばせる窓の合計（配信の長さに対する割合）
PICK_MAX = 60 * 60   # その上限（秒）
PAD_BEFORE, PAD_AFTER = 30, 60   # 選んだ窓の前後に足す幅（根拠の行の前後を check が±90秒見るので、端を切らない）
CHAT_CUT = 80        # チャットの本文を何字で切るか
EXAMPLE_N = 6
MASK = "〇〇"

SYSTEM = ("あなたは配信の文字起こしから事実を抜き出す係。渡された1枚だけを読み、決まった型の JSON だけを返す。"
          "ファイル・道具・往復の記録は使わない。")

ORDER = ["kind", "about", "text", "t", "src", "what", "amounts", "other_amounts", "verify", "via",
         "measured", "trip", "place", "quote"]

# ---------------------------------------------------------------- 返させる形

_AMOUNT = {"type": "object", "required": ["value", "unit", "as"], "additionalProperties": False,
           "properties": {"value": {"type": "number"}, "unit": {"type": ["string", "null"]},
                          "as": {"enum": ["said", "converted"]},
                          "from": {"type": "object", "properties": {"value": {"type": "number"},
                                                                    "unit": {"type": ["string", "null"]}}},
                          "rate": {"type": "number"}}}
ITEM_SCHEMA = {
    "type": "object", "required": ["kind", "text", "t", "src"], "additionalProperties": False,
    "properties": {
        "kind": {"enum": list(gf.KINDS)},
        "about": {"enum": [k for k in gf.KINDS if k != "quote"]},
        "text": {"type": "string"},
        "t": {"type": "integer"},
        "src": {"type": "object", "required": ["lines", "notes"], "additionalProperties": False,
                "properties": {"lines": {"type": "array", "items": {"type": "string"}}, "notes": {"type": "string"}}},
        "what": {"type": "string"},
        "amounts": {"type": "array", "items": _AMOUNT},
        "other_amounts": {"type": "array", "items": {
            "type": "object", "required": ["value", "unit", "what"], "additionalProperties": False,
            "properties": {"value": {"type": "number"}, "unit": {"type": ["string", "null"]}, "what": {"type": "string"}}}},
        "verify": {"type": "string"},
        "via": {"enum": ["chat"]},
        "measured": {"type": "object", "required": ["what", "from", "to"], "additionalProperties": False,
                     "properties": {"what": {"type": "string"}, "from": {"type": "string"}, "to": {"type": "string"}}},
        "trip": {"type": "string"},
        "place": {"type": "object", "required": ["name", "heard"], "additionalProperties": False,
                  "properties": {"name": {"type": "string"}, "heard": {"type": "array", "items": {"type": "string"}}}},
        "quote": {"type": "string"},
    },
}
SCHEMA = {"type": "object", "required": ["items"], "additionalProperties": False,
          "properties": {"items": {"type": "array", "items": ITEM_SCHEMA},
                         "new_trips": {"type": "array", "items": {"type": "string"}}}}
PICK_SCHEMA = {"type": "object", "required": ["windows"], "additionalProperties": False,
               "properties": {"windows": {"type": "array", "items": {
                   "type": "object", "required": ["from", "to"], "additionalProperties": False,
                   "properties": {"from": {"type": "string"}, "to": {"type": "string"}}}}}}

RULES = """あなたは、配信の文字起こしから「実際に行った」（行った場所・払った額・移動・食べたもの・宿・本人の言い回し・失敗談）を抜き出す係。
読み手は、行った街のガイドの面を作る担当と、確かめの道具。下の決まりは道具が機械で確かめ、外れた項目は落ちる。

## 抜くもの
配信者（あやと。一人称で話している本人）が、この街で実際にした・見た・払った・乗った・食べた・泊まった・しくじったこと。
1項目＝1つの事実。屋内の回（料理・雑談・アプリ作り）は街の事実がほとんど無い。食材の値段・宿の様子だけ抜いて、無理に増やさない。

## 項目の形
- kind: move（どう行く・どう動く）/ price（いくらかかる）/ place（どこへ行った）/ food（食べたもの）/ stay（泊まる）/
  fact（そのほかの事実）/ caution（気をつけること・失敗談）/ quote（本人の言い回しそのものが主役。about に、どの問いの話かを前の7つから）
- text: 短い事実の1文。こちらの言葉でよいが、言っていないことを足さない
- t: その場面の秒（整数）。根拠の行の中（いちばん早い行の秒 〜 いちばん遅い行の秒+29）に置く
- src.lines: 根拠にした字幕の行の時刻（下の字幕の [h:mm:ss] をそのまま）。いちばん早い行から遅い行まで5分以内
- src.notes: 下の「見出し」から1つを一字も変えずに写す。t がその見出しの時刻から次の見出しの時刻までの中に在ること
- place: {name, heard}。name は読める正の名前（下の「場所の表」に在る場所なら、その名前）。heard はこの配信の字幕に在る形
  （崩れたまま。字幕に無ければ []）。kind が place の項目には必ず付ける
- quote: 本人の言い回し。字幕の字のまま（句読点・空白は違ってよい）。直してよいのは2つだけ——誤字のすぐあとに [正しい字] を足す
  （字幕の字は消さない）、途中を飛ばすときは …。崩れがひどい所は言い回しにしない
- 額が在るとき: what（何の額か）と amounts [{value, unit, as}]。as は "said"（配信で言ったまま）。unit は言ったままの単位
  （下の「通貨の言いかた」の正の名前）。単位を言っていなければ null。こちらで換算しない
- other_amounts [{value, unit, what}]: 根拠の行の前後1行に在るが、この項目の品ではない額
- verify: 確かめが要るときだけ、何を確かめるかを字で。付けた項目は面に出ない山に回る。本当にそうであるときだけ付ける
- via: "chat" … チャットが先に言い、本人はその場で認めただけの話。quote は付けない。面には出ない
- measured {what, from, to}: 乗った行と降りた行のように、始まりと終わりの両方が字幕ではっきりしている移動・待ちだけ。
  from と to は字幕の行の時刻。途中で寄り道した・どこで終わったか分からない、は測らない
- trip: 日帰りの遠出の札（下の「遠出の札」に在るものだけ）。題名・場所の行・流れから、この回が札の在る遠出の回だと分かるなら、
  **遠出先へ向かう移動と、遠出先での項目には全部**その札を付ける（泊まっている街の中の話には付けない）。札の無い遠出は付けず、
  new_trips に名前を書く
- どこの話か分かる項目には、kind が place でなくても place を付ける（店で食べた・その場所で払った・その場所でしくじった）

外を歩いた回は、字幕の窓の中の事実（見たもの・値段・乗りかた・待った時間・気をつけること・本人の一言）を場面ごとに漏れなく抜く。

## 決まり
1. 正は字幕。議事録の「流れ」は地図（機械が書いた要約で、チャットの話も混ざっている）。字幕で確かめられないことは抜かない
2. text に書く算用数字は全部、根拠の行の前後90秒の字幕に在る数字であること。言っていない数（こちらで数えた数・換算した額・
   「1泊」と言っていないのに 1）は書かない。時刻も text に書かない
3. 1項目に、同じ単位の額は1つ。2つ言っているなら、割れている（両方を amounts に入れて verify）か、別の品（other_amounts か別の項目）
4. amounts に単位の無い額（unit が null）が在るなら verify を付ける。根拠の行の前後1行に、挙げていない額（数字＋円・デナール など）が
   在るなら、同じ品なら amounts に、別の品なら other_amounts に入れる
5. 本人はチャットを声に出して読む。字幕では本人の発話に見える。下の字幕には、その行に付いたチャットの本文を並べてある
   (1) チャットが言っただけ → 抜かない
   (2) チャットが先に言い、本人がその場で認めた → 抜くなら via: "chat"。quote にしない
   (3) 本人が自分の言葉で、自分の体験として言った → ふつうに抜く
   quote は、その前3分のチャットの文と重ならないこと。数字も、本人が言う前にチャットに在るなら、本人が先に言った行を根拠にするか verify
6. 視聴者さんのことは1字も書かない（名前・呼びかけ・チャットの文・投げ銭・メンバーシップ）。〇〇 は伏せた名前
7. 第三者（宿の人・同宿の人・店の人・通りがかりの人）の名前は書かない。その人が特定できる話（宿のオーナーの事情・
   同宿の人とのもめごと）と、特定できる店・宿・施設への悪い評判（汚れ・口コミの点数・接客への文句）は抜かない
8. [音楽] の行と、外国語の行（周りの人の声）は根拠にしない
"""

PICK_RULES = """次は、配信1本の議事録の「流れ」。この配信の字幕から、街で実際にしたこと（行った場所・払った額・乗り物・
食べたもの・宿・しくじり・その場の本人の感想）を抜くために、字幕を読む窓を選ぶ。
- 窓は {"from": "h:mm:ss", "to": "h:mm:ss"}。合計 {budget} 分まで。時刻の早い順に
- 視聴者さんとの雑談・グッズ・企画・投げ銭へのお礼だけの所は選ばない
- 外を歩いた・店に入った・買った・食べた・乗った・宿の話の所を選ぶ。屋内の回は、食材の値段と宿の話の所だけ
JSON {"windows": [...]} だけを返す。
"""


# ---------------------------------------------------------------- 伏せる

def _pat(form: str) -> str:
    """名前の形（比べる形）を、字のあいだに空白・句読点が挟まっても当たる正規表現に。"""
    return r"[\s、。・,.!?！？\-_]*".join(re.escape(c) for c in form)


GREET_WORDS = r"(?:こんばんは|こんにちは|おはよう|ありがとう|ようこそ|いらっしゃい|おかえり|初見|久しぶり|おやすみ|はじめまして)"
GREET_M = re.compile(r"([^\s、。]{1,12}?)(" + gf.HONOR + r"[、,。 ]?" + GREET_WORDS + ")")
# 敬称の無い呼びかけ（「ジェッシーこんばんは」「お豆、こんばんは」）。字幕では本人があだ名で呼ぶので、
# チャットの表記からは拾えない。挨拶の直前の語を伏せる（ふつうの語を伏せすぎても、1枚が少し読みにくくなるだけ）
GREET_BARE = re.compile(r"([^\s、。!?！？\[\]「」]{2,10}?)([、,]?\s?(?:こんばんは|こんにちは|おはよう|はじめまして))")
PAID_NAME = re.compile(r"([^\s、。「」（）()\[\]：:]{1,16})\s*[¥￥]\s?\d[\d,]*")
YEN = re.compile(r"[¥￥]\s?\d[\d,]*")
EMOJI = re.compile(r":[A-Za-z0-9_\-+]{2,}:")


def mask_text(s: str, names) -> str:
    """視聴者さんの素性を `〇〇` に。names は `gf.name_forms` の（長い形, 敬称つきだけの短い形）。"""
    long, short = names
    s = gf.norm(s)
    s = gf.AT_NAME.sub("@" + MASK, s)
    s = PAID_NAME.sub(MASK + "（投げ銭）", s)
    s = YEN.sub("（投げ銭）", s)
    if long:
        s = re.sub("|".join(_pat(f) for f in sorted(long, key=len, reverse=True)), MASK, s, flags=re.I)
    if short:
        s = re.sub("(?:" + "|".join(_pat(f) for f in sorted(short, key=len, reverse=True)) + r")(?=\s*" + gf.HONOR + ")",
                   MASK, s, flags=re.I)
    s = GREET_M.sub(lambda m: m.group(0) if m.group(1).endswith(MASK) else MASK + m.group(2), s)
    return GREET_BARE.sub(lambda m: MASK + m.group(2), s)


def leaks(text: str, names) -> list[str]:
    """伏せ残し（`mask_text` とは別の見かたで探す）。1つでも在れば、その1枚は渡さない。

    出すのは札だけで、字は出さない（出力は公開のログに残りうる）。
    """
    long, short = names
    n = gf.norm(text)
    sq = gf.squash(text.replace(MASK, "／"))
    out = []
    if any(m.group() != "@" + MASK for m in gf.AT_NAME.finditer(n)):
        out.append("@名前")
    if YEN.search(n):
        out.append("投げ銭の額")
    if any(f in sq for f in long):
        out.append("チャットの投稿者の名前")
    if any(re.search(re.escape(f) + gf.HONOR, sq) for f in short):
        out.append("チャットの投稿者の名前（敬称つき）")
    if any(not re.search(MASK + gf.HONOR, m.group()) for m in gf.GREET.finditer(n)):
        out.append("呼びかけ")
    return out


def chat_line(c: dict, names) -> str:
    """チャット1件。**本文だけ**（投稿者名と投げ銭の額は出さない。読み上げかどうかは本文で分かる）。"""
    # 絵文字の名前（:hand_orange_covering_eyes:）は落とす。読み上げの見分けに要らないうえ、記号を外して
    # つなぐと「eyes」「hand」の境に名前の形ができて、伏せ残しの見張りが空振りで止まる（2026-11 に1回）
    body = mask_text(EMOJI.sub("", c["body"]), names)[:CHAT_CUT]
    return f"    チャット {sn.hms(c['t'])}{'（投げ銭）' if c['paid'] else ''}: {body}"


# ---------------------------------------------------------------- 材料

class Material:
    def __init__(self, base: Path, table: dict):
        self.base, self.name = base, base.name
        for ext in ("transcript.txt", "chat.txt", "md"):
            if not Path(f"{base}.{ext}").exists():
                raise FileNotFoundError(ext)
        self.title, self.lines = gf.read_transcript(Path(f"{base}.transcript.txt"))
        if not self.lines:
            raise FileNotFoundError("transcript.txt（行が無い）")
        self.chat = gf.read_chat(Path(f"{base}.chat.txt"))
        self.md = Path(f"{base}.md").read_text(encoding="utf-8")
        self.notes = gf.read_notes(Path(f"{base}.md"))
        head = gf.head_from_material(self.name, self.notes, table)
        self.how = head.pop("_how")
        if head["country"] is None or head["city"] is None:
            raise LookupError(f"議事録の場所を寄せられない（{self.how}）")
        self.head = {"schema": 1, **head}
        country = table["countries"][head["country"]]
        self.country, self.city = country, country["cities"][head["city"]]
        self.units = gf.money_units(table, head["country"])
        self.names = gf.name_forms({c["name"] for c in self.chat} | self.notes["names"])
        self.chars = sum(len(s) for _, s in self.lines)
        self.last = self.lines[-1][0]

    def restore(self, items: list) -> list:
        """src.notes を、伏せた見出しから議事録の見出しそのものへ戻す（check は一字ずつ突き合わせる）。

        見出しには視聴者さんの名前が入っていることがある（「先生は @名前」）。1枚には伏せて見せ、
        返ってきたものを見出しの時刻で引き当てて戻す。見出しの時刻は1本の中で重ならない。
        """
        by_time = {h.split("]", 1)[0]: h for _, h in self.notes["heads"]}
        out = []
        for it in items:
            src = it.get("src") if isinstance(it, dict) else None
            if isinstance(src, dict) and isinstance(src.get("notes"), str):
                key = gf.norm(src["notes"]).strip().split("]", 1)[0]
                if key in by_time:
                    it = {**it, "src": {**src, "notes": by_time[key]}}
            out.append(it)
        return out

    def flow(self) -> str:
        """議事録の「## 流れ」を、行の形のまま（見出しと、時刻つきの箇条）。"""
        out, on = [], False
        for raw in self.md.splitlines():
            if raw.startswith("## "):
                if on:
                    break
                on = raw.strip() == "## 流れ"
                continue
            if on and raw.strip():
                out.append(raw.rstrip())
        return mask_text("\n".join(out), self.names)


def parse_t(s) -> int | None:
    m = re.fullmatch(sn.TIME, str(s).strip())
    return sn.sec(*m.groups()) if m else None


def merge_windows(wins, last: int, budget: int) -> list[tuple[int, int]]:
    """選ばせた窓を、前後に幅を足して重なりを畳む。読めない窓は捨てる。合計が budget の1.25倍を超えたら尻を切る。"""
    spans = []
    for w in wins or []:
        a, b = parse_t((w or {}).get("from")), parse_t((w or {}).get("to"))
        if a is None or b is None or b < a:
            continue
        spans.append((max(0, a - PAD_BEFORE), min(last, b + PAD_AFTER)))
    out: list[list[int]] = []
    for a, b in sorted(spans):
        if out and a <= out[-1][1] + gf.BIN:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    kept, total = [], 0
    for a, b in out:
        if total + (b - a) > budget * 1.25:
            break
        kept.append((a, b))
        total += b - a + gf.BIN
    return kept


def transcript_block(m: Material, spans: list[tuple[int, int]]) -> str:
    out, prev = [], None
    for t, s in m.lines:
        if not any(a <= t <= b for a, b in spans):
            continue
        if prev is not None and t - prev > gf.BIN:
            out.append("…")
        prev = t
        out.append(f"[{sn.hms(t)}] {mask_text(s, m.names)}")
        for c in m.chat:
            if t <= c["t"] < t + gf.BIN and not c["auto"] and EMOJI.sub("", c["body"]).strip():
                out.append(chat_line(c, m.names))
    return "\n".join(out)


def example_block(root: Path, m: Material) -> str:
    """別の回の完成形から、形の違う項目を6つまで（額と確かめ・測った値・ほかの額・言い回し・チャットが出どころ・場所）。"""
    for p in sorted(root.glob("*/*/*.facts.json")):
        if p.name == f"{m.name}.facts.json":
            continue
        d = gf.head_of(p)
        if d.get("country") != m.head["country"] or not d.get("items"):
            continue
        items = d["items"]
        want = [lambda x: x.get("amounts") and x.get("verify"), lambda x: x.get("measured"),
                lambda x: x.get("other_amounts"), lambda x: x.get("kind") == "quote",
                lambda x: x.get("via"), lambda x: x.get("kind") == "place"]
        pick = []
        for f in want:
            hit = next((x for x in items if f(x) and x not in pick), None)
            if hit:
                pick.append(hit)
        pick += [x for x in items if x not in pick][: max(0, EXAMPLE_N - len(pick))]
        return "\n".join(json.dumps(x, ensure_ascii=False) for x in pick[:EXAMPLE_N])
    return ""


def table_block(m: Material) -> str:
    places = "／".join(f"{k}（{'・'.join(v)}）" if v else k for k, v in m.city.get("places", {}).items()) or "（まだ無い）"
    trips = "／".join(f"{k}（{v.get('name', k)}）" for k, v in m.city.get("trips", {}).items()) or "（無い）"
    money: dict[str, list[str]] = {}
    for form, canon in m.units.items():
        money.setdefault(canon, []).append(form)
    cur = "／".join(f"{k}（{'・'.join(f for f in v if f != gf.norm(k).casefold())}）" for k, v in money.items())
    return f"- 場所の表: {places}\n- 遠出の札: {trips}\n- 通貨の言いかた（正の名前（字幕での形））: {cur}"


def build(root: Path, m: Material, spans: list[tuple[int, int]]) -> str:
    heads = "\n".join(mask_text(h, m.names) for _, h in m.notes["heads"])
    ex = example_block(root, m)
    parts = [RULES,
             f"## この配信\n- 題名: {mask_text(m.title, m.names)}\n- 現地の日付: {m.head['date_local']}\n"
             f"- 国・街: {m.country['name']}・{m.city['name']}（議事録の場所の行: {mask_text(m.head['place_line'], m.names)}）\n"
             f"- 字幕は {sn.hms(m.last + gf.BIN)} まで",
             f"## 見出し（src.notes に一字も変えずに写す）\n{heads}",
             f"## 寄せる表（この街の欄）\n{table_block(m)}",
             f"## 議事録の「流れ」（地図。名前は {MASK} に伏せてある）\n{m.flow()}",
             "## 字幕（[h:mm:ss] は30秒ごとの行。「チャット」の行はその30秒に付いたチャットの本文で、本人の発話ではない。"
             f"… は読ませない区間）\n{transcript_block(m, spans)}"]
    if ex:
        parts.append(f"## 見本（別の回の完成形から。形だけ写す。中身はこの回の字幕から）\n{ex}")
    parts.append('## 返す形\n{"items": [項目, ...], "new_trips": [札の無い遠出の名前, ...]} だけを返す。')
    return "\n\n".join(parts) + "\n"


def pick_prompt(m: Material, budget: int) -> str:
    return (PICK_RULES.replace("{budget}", str(budget // 60))
            + f"\n配信の長さ: {sn.hms(m.last + gf.BIN)}\n\n## 流れ\n{m.flow()}\n")


def fix_prompt(base: str, items: list, ng: list[str]) -> str:
    listed = "\n".join(f"#{i} {json.dumps(x, ensure_ascii=False)}" for i, x in enumerate(items))
    return (base + "\n## 直し\n前回あなたが返した items（#番号は0から数えた位置）:\n" + listed
            + "\n\n道具が出した NG:\n" + "\n".join(ng)
            + "\n\nNG の付いた項目を、字幕に合わせて直すか、直せなければ items から外す。NG の無い項目はそのまま残す。"
              "split と chatfirst は、本当に額が割れている・チャットが先に言った数字なら verify を付けてよい。全体を同じ形で返す。\n")


# ---------------------------------------------------------------- 呼ぶ

def usage_of(raw: dict) -> dict:
    """`modelUsage`（モデルごと）を足し上げる。無ければ `usage`。"""
    keys = ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens")
    mu = raw.get("modelUsage") or {}
    if mu:
        camel = ("inputTokens", "cacheReadInputTokens", "cacheCreationInputTokens", "outputTokens")
        return {k: sum(v.get(c) or 0 for v in mu.values()) for k, c in zip(keys, camel)}
    u = raw.get("usage") or {}
    return {k: u.get(k) or 0 for k in keys}


def call_model(prompt: str, model: str, schema: dict, timeout: int, effort: str | None = None) -> dict:
    """`claude -p` を1回。道具・MCP・スラッシュコマンドを持たせず、リポジトリの外の空の置き場で起こす
    （CLAUDE.md を拾わせない）。見張りはここを偽物に差し替える。"""
    cmd = ["claude", "-p", "--system-prompt", SYSTEM, "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
           "--no-session-persistence", "--output-format", "json", "--json-schema", json.dumps(schema, ensure_ascii=False),
           "--model", model]
    if effort:
        cmd += ["--effort", effort]
    with tempfile.TemporaryDirectory(prefix="guide-extract-") as empty:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=empty, check=False)
    try:
        return json.loads(r.stdout)
    except ValueError:
        return {"is_error": True, "result": (r.stdout + r.stderr)[-2000:]}


def data_of(raw: dict):
    data = raw.get("structured_output")
    if data is None and isinstance(raw.get("result"), str):
        txt = raw["result"].strip()
        txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt)
        try:
            data = json.loads(txt)
        except ValueError:
            data = None
    return data if isinstance(data, dict) else None


# ---------------------------------------------------------------- 確かめる・落とす

def clean(it):
    """欄の並びを揃え、空の欄と知らない欄を落とす。about は言い回しの項目だけ。"""
    if not isinstance(it, dict):
        return it
    out = {}
    for k in ORDER:
        v = it.get(k)
        if v is None or v == "" or (v == [] and k != "place"):
            continue
        if k == "about" and it.get("kind") != "quote":
            continue
        if k in ("amounts", "other_amounts") and isinstance(v, list):
            v = [{**a, "value": int(a["value"])} if isinstance(a, dict) and isinstance(a.get("value"), float)
                 and a["value"] == int(a["value"]) else a for a in v]
        if k == "place" and isinstance(v, dict):
            v = {"name": v.get("name"), "heard": v.get("heard") or []}
        out[k] = v
    return out


def check_items(m: Material, table: dict, items: list) -> gf.Result:
    """材料の隣ではなく、一時の置き場（材料へのリンク）で check に掛ける。途中のものを streams/ に置かない。"""
    with tempfile.TemporaryDirectory(prefix="guide-check-") as d:
        for ext in ("transcript.txt", "chat.txt", "md"):
            os.symlink(f"{m.base}.{ext}", Path(d) / f"{m.name}.{ext}")
        p = Path(d) / f"{m.name}.facts.json"
        p.write_text(json.dumps({**m.head, "items": items}, ensure_ascii=False), encoding="utf-8")
        return gf.check_file(p, table)


def ng_lines(r: gf.Result) -> list[str]:
    return [f"[{c}] {'頭' if i is None else f'#{i}'}: {msg}" for i, c, msg in r.ng]


def drop_ng(m: Material, table: dict, items: list) -> tuple[list, Counter, gf.Result]:
    """NG の付いた項目を落とす。落とすと隣の項目の「近くの額」が変わるので、NG が無くなるまで繰り返す。"""
    dropped: Counter = Counter()
    r = check_items(m, table, items)
    while r.ng and items and not r.blind:
        bad: dict[int, str] = {}
        for i, c, _ in r.ng:
            if i is None:
                return items, dropped, r      # 頭の NG は項目を落としても直らない
            bad.setdefault(i, c)
        dropped.update(bad.values())
        items = [x for k, x in enumerate(items) if k not in bad]
        r = check_items(m, table, items)
    return items, dropped, r


def verdict(r: gf.Result) -> int:
    """置いてよいか。0=置く / 1=NG が残る / 2=見るものが無い（項目0件。合格にしない）。"""
    if r.blind:
        return 2
    return 1 if r.ng else 0


# ---------------------------------------------------------------- 1本

def extract_one(root: Path, table: dict, stem: str, a) -> dict:
    rec = {"stem": stem, "rc": 2, "calls": [], "dropped": Counter(), "items": 0, "note": ""}
    t0 = time.time()
    base = gf.base_of(root, stem)
    try:
        if not base:
            raise FileNotFoundError("transcript.txt")
        m = Material(base, table)
    except (FileNotFoundError, LookupError) as e:
        rec["note"] = f"材料が無い・寄せられない: {e}"
        return rec
    out = Path(a.out) / m.name
    out.mkdir(parents=True, exist_ok=True)
    dest = Path(f"{m.base}.facts.json")
    if dest.exists() and not a.no_write and not a.force and not a.prompt_only:
        rec.update(rc=0, note="もう在る（--force で作り直す）", skipped=True)
        return rec

    def ask(prompt: str, schema: dict, stage: str):
        (out / f"{stage}.prompt.md").write_text(prompt, encoding="utf-8")
        s = time.time()
        try:
            raw = call_model(prompt, a.model, schema, a.timeout, a.effort)
        except subprocess.TimeoutExpired:
            raw = {"is_error": True, "result": f"{a.timeout}秒で返らなかった"}
        (out / f"{stage}.raw.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
        u = usage_of(raw)
        call = {"stage": stage, "model": a.model, "usage": u, "tokens": sum(u.values()),
                "sec": round((raw.get("duration_ms") or (time.time() - s) * 1000) / 1000, 1),
                "cost_usd": raw.get("total_cost_usd"), "prompt_chars": len(prompt)}
        rec["calls"].append(call)
        if a.runs:
            with open(a.runs, "a", encoding="utf-8") as f:
                f.write(json.dumps({"stem": m.name, "at": datetime.now(timezone.utc).isoformat(), **call},
                                   ensure_ascii=False) + "\n")
        return data_of(raw)

    # 窓
    if m.chars <= SMALL:
        spans = [(0, m.last)]
    else:
        budget = min(PICK_MAX, int((m.last + gf.BIN) * PICK_SHARE))
        pp = pick_prompt(m, budget)
        if leaks(pp, m.names):
            rec["note"] = f"窓を選ばせる1枚に伏せ残し（{'・'.join(leaks(pp, m.names))}）。呼ばない"
            return rec
        if a.prompt_only:
            spans = [(0, m.last)]
        else:
            got = ask(pp, PICK_SCHEMA, "pick")
            spans = merge_windows((got or {}).get("windows"), m.last, budget)
            if not spans:
                rec.update(rc=1, note="窓を選ばせた返事が読めない")
                return rec
    rec["window_chars"] = sum(len(s) for t, s in m.lines if any(a_ <= t <= b for a_, b in spans))
    prompt = build(root, m, spans)
    bad = leaks(prompt, m.names)
    if bad:
        rec["note"] = f"1枚に伏せ残し（{'・'.join(bad)}）。呼ばない"
        return rec
    (out / "prompt.md").write_text(prompt, encoding="utf-8")
    if a.prompt_only:
        rec.update(rc=0, note=f"1枚 {len(prompt):,}字（字幕 {rec['window_chars']:,}/{m.chars:,}字）")
        return rec

    data = ask(prompt, SCHEMA, "extract")
    if data is None:
        rec.update(rc=1, note="返事が JSON でない")
        return rec
    # 返ってきた形（見出しは伏せたまま）と、check に掛ける形（見出しを戻したもの）を分けて持つ。
    # 直しの1枚には返ってきた形のほうを載せる（戻した見出しには名前が入りうる）
    said = [clean(x) for x in data.get("items") or []]
    items = m.restore(said)
    rec["new_trips"] = sorted(set(data.get("new_trips") or []))
    rec["first"] = len(items)
    r = check_items(m, table, items)
    rec["first_ng"] = len(r.ng)
    for k in range(FIXES):
        if not r.ng:
            break
        fp = fix_prompt(prompt, said, [mask_text(s, m.names) for s in ng_lines(r)])
        if leaks(fp, m.names):
            rec["note"] = "直しの1枚に伏せ残し。直させずに落とす"
            break
        got = ask(fp, SCHEMA, f"fix{k + 1}")
        if got is None:
            break
        said = [clean(x) for x in got.get("items") or []]
        items = m.restore(said)
        rec["new_trips"] = sorted(set(rec["new_trips"]) | set(got.get("new_trips") or []))
        r = check_items(m, table, items)
    rec["fixed_ng"] = len(r.ng)
    items, rec["dropped"], r = drop_ng(m, table, items)
    rc = verdict(r)
    rec.update(rc=rc, items=len(items), kinds=dict(r.kinds), verify=r.verify, via=r.via, measured=r.measured,
               off_table=sorted(r.off_table), sec=round(time.time() - t0, 1))
    (out / "facts.json").write_text(json.dumps({**m.head, "items": items}, ensure_ascii=False, indent=1) + "\n",
                                    encoding="utf-8")
    if rc != 0:
        rec["note"] = "項目が0件になった（置かない）" if rc == 2 else "NG が残った（置かない）"
        return rec
    if not a.no_write:
        dest.write_text(json.dumps({**m.head, "items": items}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        rec["note"] = "置いた"
    return rec


def summary(rec: dict) -> str:
    tok = sum(c["tokens"] for c in rec["calls"])
    out_tok = sum(c["usage"]["output_tokens"] for c in rec["calls"])
    sec = sum(c["sec"] for c in rec["calls"])
    if "first" not in rec:
        return f"  {'ok' if rec['rc'] == 0 else 'NG'}  {rec['stem']}: {rec['note']}"
    kd = " ".join(f"{k}{rec['kinds'][k]}" for k in gf.KINDS if rec.get("kinds", {}).get(k))
    dr = "・".join(f"{k}{v}" for k, v in rec["dropped"].most_common()) or "0"
    s = (f"  {'ok' if rec['rc'] == 0 else 'NG'}  {rec['stem']}: 項目 {rec['items']}件（{kd}）確かめが要る {rec['verify']}"
         f"・チャットが出どころ {rec['via']}・測った値 {rec['measured']} / 1回目 {rec['first']}件 NG {rec['first_ng']}"
         f" → 直し後 NG {rec['fixed_ng']} → 落とした {dr} / 呼んだ {len(rec['calls'])}回 {tok:,}トークン（出力 {out_tok:,}）"
         f" {sec:.0f}秒 / 字幕 {rec.get('window_chars', 0):,}字を渡した / {rec['note']}")
    if rec.get("off_table"):
        s += f"\n        （寄せる表に無い場所の名前: {'／'.join(rec['off_table'])}）"
    if rec.get("new_trips"):
        s += f"\n        （札の無い遠出: {'／'.join(rec['new_trips'])}）"
    return s


def pending_stems(root: Path, table: dict, country: str | None, city: str | None) -> list[str]:
    out = []
    for md in sorted(root.glob("*/*/*.md")):
        name = md.name[:-3]
        if not gf.stem_head(name) or Path(f"{md.parent / name}.facts.json").exists():
            continue
        if not Path(f"{md.parent / name}.transcript.txt").exists():
            continue
        c, ci, _ = gf.resolve_place(gf.read_notes(md)["place"], table)
        if c and ci and (not country or c == country) and (not city or ci == city):
            out.append(name)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("stems", nargs="*")
    ap.add_argument("--pending", action="store_true", help="まだ抜いていない回を全部（--country で絞る）")
    ap.add_argument("--country")
    ap.add_argument("--city")
    ap.add_argument("--out", required=True, help="控え（渡した1枚・返事・途中の facts）を置く場所。スクラッチパッドの下")
    ap.add_argument("--runs", help="1回1行の控え（.jsonl）に足す（トークンと時間）")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--effort", default=None, help="low / medium / high（省くと既定）")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--jobs", type=int, default=1, help=f"並べて回す本数（{JOBS_MAX}まで）")
    ap.add_argument("--no-write", action="store_true", help="streams/ に置かない（控えだけ）")
    ap.add_argument("--force", action="store_true", help="もう在る .facts.json を作り直す")
    ap.add_argument("--prompt-only", action="store_true", help="1枚を組んで控えに置くだけ（呼ばない）")
    ap.add_argument("--root", default=str(gf.STREAMS))
    ap.add_argument("--table", default=str(gf.TABLE))
    a = ap.parse_args(argv)
    root = Path(a.root)
    try:
        table = gf.load_table(Path(a.table))
    except (OSError, ValueError) as e:
        print(f"::error::寄せる表が読めない（{type(e).__name__}）")
        return 2
    stems = list(a.stems) + (pending_stems(root, table, a.country, a.city) if a.pending else [])
    if not stems:
        print("::error::抜く回が無い")
        return 2
    jobs = max(1, min(a.jobs, JOBS_MAX))
    with cf.ThreadPoolExecutor(max_workers=jobs) as ex:
        recs = list(ex.map(lambda s: extract_one(root, table, s, a), stems))
    for rec in recs:
        print(summary(rec))
    calls = [c for r in recs for c in r["calls"]]
    if calls:
        tok = sum(c["tokens"] for c in calls)
        n = sum(1 for r in recs if r["calls"])
        print(f"\n{len(recs)}本 / 置いた {sum(1 for r in recs if r['note'] == '置いた')}本 / 項目 {sum(r['items'] for r in recs)}件"
              f" / 落とした {sum(sum(r['dropped'].values()) for r in recs)}件 / 呼んだ {len(calls)}回"
              f" / 1本あたり {tok // max(1, n):,}トークン・{sum(c['sec'] for c in calls) / max(1, n):.0f}秒")
    rcs = {r["rc"] for r in recs}
    return 2 if 2 in rcs else (1 if 1 in rcs else 0)


if __name__ == "__main__":
    sys.exit(main())
