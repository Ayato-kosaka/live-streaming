#!/usr/bin/env python3
"""**作文者と批評役に渡す「1枚」を作る。** 帳面・参考・7.4 節・配信の書き起こしを、担当が自分で全部読みに行かないように。

    # 作文者へ（書く前）: 約束のカード（帳面の決まりと直しの全文）→ 方針 → 書く形 → 当て表 → 材料（配信の字幕）
    python3 tools/shorts/script/brief.py writer --video LdgTh1DC3Jk --range 0:00:00-0:21:30 --ref IhF --ref f8t \\
        --title "🇬🇪ジョージアで滝を観に行こうと思ったら大惨事に！" --about "…" -o <scratch>/brief_writer.md

    # 回をまたぐ原稿: --video を回の数だけ。区間は <videoId>@H:MM:SS-H:MM:SS（回を書かない区間は最初の --video の回）
    python3 tools/shorts/script/brief.py writer --video Xvdk_P4gKoU --video kunXt2sXnFQ \\
        --range Xvdk_P4gKoU@0:00:00-0:45:00 --range kunXt2sXnFQ@0:03:00-0:20:00 --ref OEF -o <scratch>/brief_writer.md

    # 批評役へ（関所）: 雛形（references/critic_prompt.md）に、同じ約束のカード・原稿の表・lint の結果・参考の拍・配信の字幕を差し込む
    python3 tools/shorts/script/brief.py critic shorts/videos/TDArug_te90/p1/script.txt --ref vJo \\
        --video TDArug_te90 --about "…" -o <scratch>/critic_prompt.md     # --range を省くと、spec の why・src の時刻の前後30秒
    # 回をまたぐ原稿は --video を回の数だけ（spec の why・src の「videoId H:MM:SS」から回ごとに切る）。前日の回の写しは
    # --extra <videoId>=<道>（その回のチャットで伏せる）

    # 本編集の担当へ: 雛形（references/editor_prompt.md）に、原稿の表・素材の表・帳面の画・音・投稿の項目・企画の節の地図を差し込む
    python3 tools/shorts/script/brief.py edit --episode shorts/videos/france-2025 --pattern A \\
        --about "…" --scratch <scratch> -o <scratch>/brief_edit.md
    python3 tools/shorts/script/brief.py edit --episode … --voice-lines shorts/videos/<回>/p1/voice_lines_A.json   # 声に渡す字の雛形

終了コード 0=書けた / 2=原稿・配信の書き起こし・参考の節が見つからない・spec の形が違う（rows が無い・行の数が違う）
（edit は、雛形の呼び出しが道具と食い違うときも）。

## 作文者の1枚を、ゼロから作り直した（#1019、帳面 F-048〜F-050）

2026-10-23 の滝の回 p1 は、17行のうち13行が配信の字幕をほぼそのまま写していて、あやとに「字幕をつなげてるだけ」「約束が漏れすぎ」と
言われた。棚卸し（2026-10-23）で数えると、原稿に効く約束26個のうち10個が、この1枚に中身ごと入っていなかった。

- **前の1枚は、帳面を「題＋直しの最初の1組（90字で切る）」に縮めていた。** 決まり（する／しない）は全項目で0字。
  2回目に言われて中身が増えても、題が同じなら1枚は変わらなかった。分類で選んだので、字に効く F-014（画）・F-019（音）・F-050（進め方）が落ちた
- **1枚の6割が字幕とチャットの生の文で、その真上に「まずここから拾う」と書いてあった。** 作文者は材料の側に引っ張られた
- だから今は、**約束のカード（帳面の決まりと直しを、1字も切らずに）を先頭に**置き、字幕は**いちばん後ろの「材料」**に下げる。
  **チャットの本文は入れない**（視聴者の書き込みで話を動かさない。F-048）。カードは帳面から毎回組む（`ledger.py` の `script_items`）

作文者は1行ずつ「元の出来事（配信の時刻）／見る人に届く文／残した本人の言葉／選んだ理由」の4欄で書き、カード1枚ずつに当て表
（spec の `promises`）を付ける。当て表の欠けは lint の L-ATE が ✕ にする（渡せない）。

## 批評役の1枚

作文者と**同じカード**を入れる。批評役は当てた ID を全部 `checked` に並べ、欠けたら `critic_gate.py` が ✕ にする。
いま見ている原稿の行を引いている直しの例だけは、伏せる（例との一致で落とす・通すのを避ける。`quotes_script`）。
`--video` で配信の字幕を入れる（#1014、帳面 F-047。作文者が根拠に挙げた時刻の前後30秒か `--range`）。
画が「確認中」の行（1次の原稿）には【画は確認中】の印を付ける（`critic_gate.py` が F-014 の当たりを △ にする。その回に無い画を当てにした行は ✕）。

## 字幕の中の、本人が読み上げた書き込み

作文者・批評役の字幕からは、本人が読み上げた視聴者さんの書き込みを〔コメントの読み上げ〕に伏せる（帳面 F-048）。
字を畳んで比べ、6字から当てる。かな ↔ 漢字・長音・句読点・絵文字の名前の違いは、合いかたの度合いで吸う。
書き込みから読み上げまでの近さ（短い書き込みは −10〜80秒・長い書き込みは −20〜120秒）で当て、本人が先に言った字は伏せない
（窓と下限を測った数は `mask_read` の上）。

**spec に `rows` が無い・行の数が原稿と違うときは、作らずに止まる**（`lint.build` が止める）。滝の回 p1 は spec が `lines` の鍵で書かれていて、
批評役の1枚の画の列が空のまま回っていた。

## 本編集の担当の1枚（edit）

フランス周遊 A の本編集の担当（2026-10-21）は、最初の5分で手引きと道具のソースを読み、文脈が 7万 → 21万トークンに膨らんだ。
以後の約200回の呼び出しが毎回それを読み直した（キャッシュ読みの約4割）。使いかたが1か所に無かったから、ソースを読んだ。
1枚には、その回の原稿（行・秒・素材の時刻・画）・企画の取り込みの表・帳面の画・音・投稿（と題の札）の項目・企画の節の
どこを読むかの地図・道具の呼び出しの形（雛形）を入れる。**検査（`check.py`）が落とす項目は名前だけ**にする。
雛形に書いた道具と引数が今の道具に在るかを毎回見て、無ければ作らない（古い呼び出しを渡すと、担当はソースを読みに行く）。
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import unicodedata
from difflib import SequenceMatcher
from itertools import pairwise
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REFS = ROOT / ".claude/skills/viral-shorts-creator/references"
BEATS = REFS / "reference_beats.md"
CRITIC_TMPL = REFS / "critic_prompt.md"
WRITER_TMPL = REFS / "writer_prompt.md"
EDIT_TMPL = REFS / "editor_prompt.md"
STREAMS = ROOT / "streams"
WORK = ROOT / "shorts/.work"
sys.path.insert(0, str(ROOT / "tools/shorts/feedback"))
sys.path.insert(0, str(HERE))
import ledger as ledger_mod  # noqa: E402
import lint as lint_mod  # noqa: E402

CPS = 6.8      # 上限の倍率 1.4 で読んだ毎秒の字（`script_writing.md` 6・`storyboard.py`）
GAP = 0.3      # 行の間（秒）
CARD = 4.0     # 題の札を消す秒（帳面 F-015）
# あやとが書いた字・決めた字（spec の why）。関所はこの行を落とす理由にしない（`script_writing.md` 7.3。まとめ役が裁く）
AYATO = re.compile(r"あやとの(題|書き足し|字|添削)|あやと\s*#\d+\s*「")
TIME = re.compile(r"^\[(\d+):(\d\d):(\d\d)\]\s*(.*)$")


# ---------- 約束のカード ----------

def _norm(s: str) -> str:
    return re.sub(r"[\s「」『』（）()…、。！？!?・ー〜,，【】]", "", s)


def quotes_script(example: str, lines: list, k: int = 8) -> bool:
    """例が、いま見る原稿の行を k 字以上そのまま引いているか。"""
    ex = _norm(example)
    for ln in lines:
        n = _norm(ln)
        if any(n[i:i + k] in ex for i in range(0, max(1, len(n) - k + 1))) and len(n) >= k:
            return True
    return False


def flat(s: str) -> str:
    """欄の字を1段落に（改行と字下げを空白1つに）。**切らない**。"""
    return re.sub(r"\s+", " ", s or "").strip()


def card_ids(led=None) -> list:
    """約束のカードの ID（帳面の原稿の段の項目と、帳面の外の約束）。当て表と批評役の `checked` は、これを全部埋める。"""
    return [it.id for it in ledger_mod.script_items(led)]


def cards(led=None, avoid: list | None = None) -> str:
    """約束のカード。帳面の決まり（する／しない）と直す前 → 直した後を、**1字も切らずに**入れる。

    `avoid`（いま見る原稿の行）を引いている直しの例は、批評役の1枚では伏せる。
    **その原稿の行が帳面に「ダメな例」として載っていると、批評役は決まりではなく例との一致で落とす。**
    対照（銅像 p2 は帳面 F-039・F-040 の例そのもの）が答えを見て落ちるので、雛形の良し悪しを測れなくなる。
    """
    out = []
    for it in ledger_mod.script_items(led):
        own = it.id in {o.id for o in ledger_mod.OWN}   # 帳面の外の約束
        times = f"・{it.times}回言われた" if it.times > 1 else ""
        head = f"### {it.id} {it.title}（{it.category}{times}{'・帳面の外の約束' if own else ''}）"
        fix = flat(it.fields.get("直す前 → 直した後", ""))
        if avoid and quotes_script(fix, avoid):
            fix = "（いま見る原稿の行を引いているので、この1枚では伏せた。決まりで当てる）"
        body = [head, "", f"- **決まり**: {flat(it.fields.get('決まり', ''))}",
                f"- **{'直した例' if own else 'あやとの直し'}**: {fix}"]
        if it.lint:
            body.append(f"- **機械の守り**: lint の {'・'.join(sorted(it.lint))}（lint の結果に出る）")
        out.append("\n".join(body))
    return "\n\n".join(out)


def ids_line(led=None) -> str:
    ids = card_ids(led)
    return f"{'・'.join(ids)}（{len(ids)}枚）"


# ---------- 参考の拍 ----------

def beats(codes: list) -> str:
    text = BEATS.read_text(encoding="utf-8")
    secs = re.split(r"(?m)^## ", text)
    found = {}
    for s in secs[1:]:
        code = s.split(None, 1)[0]
        found[code] = "### " + s.strip()
    miss = [c for c in codes if c not in found]
    if miss:
        raise KeyError(f"参考の節が無い: {miss}（{BEATS.name} にあるのは {sorted(found)}）")
    return "\n\n".join(found[c] for c in codes)


# ---------- 配信の書き起こし ----------

def hms(s: str) -> int:
    p = [int(x) for x in s.split(":")]
    while len(p) < 3:
        p.insert(0, 0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def parse_ranges(rs: list) -> list:
    out = []
    for r in rs:
        a, b = r.split("-", 1)
        out.append((hms(a), hms(b)))
    return out


# `--transcript` で渡した字幕。streams/ に無い回（毎晩の取り込みが拾っていない回。2025-01-09〜19 など）を、
# 字幕だけの道（shorts_ingest の captions）で取って復号したもので書くため
TRANSCRIPT_FILE: dict = {}


def use_transcripts(items: list, videos: list) -> None:
    """`--transcript [<videoId>=]<道>` を TRANSCRIPT_FILE に。回を書かなければ最初の --video の回。"""
    for it in items:
        vid, sep, p = it.partition("=")
        if not (sep and re.fullmatch(r"[A-Za-z0-9_-]{11}", vid)):
            if not videos:
                raise ValueError("--transcript には --video が要る（か、<videoId>=<道> で回を書く）")
            vid, p = videos[0], it
        TRANSCRIPT_FILE[vid] = Path(p)


def stream_file(video: str, kind: str) -> Path:
    if kind == "transcript" and video in TRANSCRIPT_FILE:
        return TRANSCRIPT_FILE[video]
    hits = sorted(STREAMS.rglob(f"*_{video}.{kind}.txt"))
    if not hits:
        raise FileNotFoundError(f"streams/ に {video} の {kind} が無い")
    return hits[0]


def cut(path: Path, ranges: list, step: int = 30) -> list:
    """`[h:mm:ss] 文` の行のうち、区間に掛かるものだけ。"""
    out = []
    for ln in path.read_text(encoding="utf-8").splitlines():
        m = TIME.match(ln)
        if not m:
            continue
        t = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        if not any(a - step < t <= b for a, b in ranges):
            continue
        out.append(f"[{m.group(1)}:{m.group(2)}:{m.group(3)}] {m.group(4)}")
    return out


# ---------- 本人が読み上げた視聴者さんの書き込みを伏せる（F-048） ----------
#
# 本人が配信でコメントを読み上げると、視聴者さんの書き込みの字が自動字幕に入り、作文者は本人の言葉として拾う
# （2026-10-23 の滝の回の1枚には、チャットを入れなくても、同じ区間のチャットの本文が2行、字幕の側から入っていた）。
#
# 2026-11-04 まで伏せていたのは「8字以上の書き込みが、字幕にそのまま入っている所」だけだった。クラムチャウダーの回（E2oGYjnVQSA）の
# 1:11:29・1:16:48 の書き込みは、6字だったのと、かなと漢字の違う聞き取り・絵文字の名前（`:sparkles:` の形）が付いていたので素通りし、
# 作文者が本人の言葉として原稿に入れた。いまは字を畳んで（句読点・記号・空白・長音・絵文字の名前を落とし、カタカナをひらがなに）比べ、
# **字の合いかた**と**書き込みから読み上げまでの近さ**の両方で当てる。
#
# 窓と下限は、2026-09・10 の配信77本で測った（書き込みの時刻 → 字幕の行の中の位置から見積もった読み上げの時刻）:
# - 10字以上の書き込み（ほぼ確かに読み上げ）の遅れは 0〜70秒に集まり、120秒でほぼ尽きる。行の中の位置の見積もりの誤差で −20秒まで出る
# - 6〜7字の一致は、0〜70秒に10秒あたり60件前後、その外は2〜3件。ただしこれは「本人が先に言った字」を除いたあとで、
#   除く前はその外が15件前後あった（本人の口ぐせを視聴者さんが返した字）→ 本人が先に言った字は伏せない
# - 5字以下で当たるのは、挨拶・相づち・擬音（こんばんは・すごいね・わくわく）がほとんど。伏せると本人の反応まで消えるので、下限は6字
READ_MIN = 6        # 畳んだ字で数える。挨拶を除いてこれに満たない書き込みは当てない
READ_LONG = 8       # これより短い書き込みは、字幕に切れ目なくそのまま入っているときだけ当てる
READ_COVER = 0.75   # 長い書き込みは、字の 3/4 が合えば当てる（かな ↔ 漢字・聞き違いの分）
READ_PART = 12      # 長い書き込みの一部だけを読んだとき: 切れ目なく12字合えば、その所だけ伏せる
READ_GAP = 3        # 合った字の塊どうしの間に挟まってよい字（かな ↔ 漢字の置き換わり）
READ_LAG = ((-10, 80), (-20, 120))   # 書き込みから読み上げまでの窓（秒）: 短い書き込み / 長い書き込み
READ_EDGE = 4       # 書き込みの端の合わなかった字（「ひとり」↔「一人」）のぶん、字幕の側を伸ばしてよい字の上限
READ_STEP = 30      # 字幕の1行の幅（秒）。次の行の時刻が分かれば、その差
READ_MARK = "〔コメントの読み上げ〕"
EMOJI_NAME = re.compile(r":[A-Za-z0-9_+\-]+:")
# 挨拶は本人も視聴者さんも同じ字を言う。挨拶を除いて6字に満たない書き込みは当てない（畳んだ字＝ひらがなと漢字で書く）
GREET = re.compile(r"こんばんは|こんにちは|おはよう(?:ございます)?|お(?:やすみ|休み)(?:なさい)?|お(?:つかれ|疲れ)(?:さま|様)?(?:でした|です)?|"
                   r"(?:いって|行って)(?:らっしゃい|きます)|(?:いただ|頂)きます|ごちそうさま(?:でした)?|ありがとう(?:ございます)?|"
                   r"おかえり(?:なさい)?|ただいま|はじめまして|初めまして|よろしく|お(?:願|ねが)いします")
BOUND = set("。、，,．.！!？?…‥「」『』（）()[]【】〔〕 　\t")   # 伏せる所を端で伸ばすとき、越えない字


def fold(text: str) -> list:
    """比べる字の並び [(字, 元の位置)]。句読点・記号・空白・長音・`[鼻息]` の注を落とし、カタカナをひらがなに、全角を半角に。"""
    out, depth = [], 0
    for i, ch in enumerate(text):
        if ch == "[":
            depth += 1
            continue
        if ch == "]":
            depth = max(0, depth - 1)
            continue
        if depth:
            continue
        for c in unicodedata.normalize("NFKC", ch).lower():
            if unicodedata.category(c)[0] in "PSZC" or c == "ー":
                continue
            if "ァ" <= c <= "ヶ":
                c = chr(ord(c) - 0x60)
            out.append((c, i))
    return out


def folded(text: str) -> str:
    return "".join(c for c, _ in fold(text))


def post_body(raw: str) -> str:
    """チャットの1行の本文を、畳んだ字で（投げ銭の額・名前・絵文字の名前を落とす）。"""
    body = re.sub(r"^[¥$€£][\d,.]+\s+", "", raw)
    body = body.split(": ", 1)[1] if ": " in body else body
    return folded(EMOJI_NAME.sub("", body))


def comment_posts(video: str) -> list:
    """その回のチャット [(秒, 畳んだ本文)]。挨拶を除いて6字に満たないものは落とす。字はここで比べるだけで、どこにも出さない。"""
    try:
        ch = stream_file(video, "chat")
    except FileNotFoundError:
        return []
    out = []
    for ln in ch.read_text(encoding="utf-8").splitlines():
        m = TIME.match(ln)
        if not m:
            continue
        b = post_body(m.group(4))
        if len(GREET.sub("", b)) >= READ_MIN:
            out.append((int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)), b))
    return out


def timed(lines: list) -> list:
    """`[h:mm:ss] 字` の行ごとに（始めの秒, 幅, 字）。時刻の無い行は None。幅は次の行までの秒（READ_STEP まで）。"""
    out = []
    for ln in lines:
        m = TIME.match(ln)
        out.append([int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)), READ_STEP, m.group(4)] if m else None)
    rows = [r for r in out if r]
    for a, b in pairwise(rows):
        a[1] = min(READ_STEP, max(1, b[0] - a[0]))
    return [tuple(r) if r else None for r in out]


def _clusters(blocks: list) -> list:
    groups = []
    for m in blocks:
        p = groups[-1][-1] if groups else None
        if p and m.a - (p.a + p.size) <= READ_GAP and m.b - (p.b + p.size) <= READ_GAP:
            groups[-1].append(m)
        else:
            groups.append([m])
    return groups


def read_spans(b: str, s: str) -> list:
    """畳んだ字幕 s の中で、畳んだ書き込み b を読んだ所。[(始め, 終わり, b の頭で合わなかった字数, お尻で合わなかった字数)]。何度読んでも全部。

    短い書き込み（READ_LONG 未満）は、切れ目なくそのまま入っているときだけ。長い書き込みは、字の READ_COVER が合うか
    （合った塊どうしの間は READ_GAP 字まで）、一部だけ読んでも切れ目なく READ_PART 字合えば、その塊だけ。
    """
    n, out, work = len(b), [], s
    short_ = n < READ_LONG
    need = n if short_ else max(READ_MIN, math.ceil(n * READ_COVER))
    while True:
        blocks = [m for m in SequenceMatcher(None, b, work, autojunk=False).get_matching_blocks() if m.size >= 2]
        best = None
        for g in _clusters(blocks):
            got, top = sum(m.size for m in g), max(m.size for m in g)
            whole = top == n if short_ else (got >= need and top >= 4)
            part = not short_ and top >= READ_PART
            if (whole or part) and (best is None or got > best[0]):
                best = (got, g if whole else [max(g, key=lambda m: m.size)], whole)
        if best is None:
            return out
        _, g, whole = best
        s0, s1 = g[0].b, g[-1].b + g[-1].size
        out.append((s0, s1, g[0].a if whole else 0, n - (g[-1].a + g[-1].size) if whole else 0))
        work = work[:s0] + "\0" * (s1 - s0) + work[s1:]


def _kanji(ch: str) -> bool:
    return "一" <= ch <= "鿿" or ch in "々〆"


def _widen(text: str, o0: int, o1: int, left: int, right: int) -> tuple:
    """書き込みの端の合わなかった字（かな ↔ 漢字）のぶん、字幕の側を句読点を越えずに伸ばす。漢字1字はかな2字に数える。"""
    budget, j = min(left, READ_EDGE), o0 - 1
    while budget > 0 and j >= 0 and text[j] not in BOUND:
        budget -= 2 if _kanji(text[j]) else 1
        o0, j = j, j - 1
    budget, j = min(right, READ_EDGE), o1
    while budget > 0 and j < len(text) and text[j] not in BOUND:
        budget -= 2 if _kanji(text[j]) else 1
        o1, j = j + 1, j + 1
    return o0, o1


def mask_read(lines: list, posts: list, hist: list | None = None) -> tuple:
    """字幕の行（`[h:mm:ss] 字`）の中の、本人が読み上げた視聴者さんの書き込みを伏せる。（伏せた行, 伏せた所の数）。

    posts は `comment_posts` の [(秒, 畳んだ本文)]。hist は「本人が先に言った字」を探す行（その回の字幕まるごと。既定は lines）。
    書き込みより前に終わった行に本人がもう言っている字は、本人の言葉（視聴者さんが本人の口ぐせを返した字）なので伏せない。
    """
    said = [(t + w, folded(x)) for t, w, x in filter(None, timed(hist if hist is not None else lines))]
    first: dict = {}   # 書き込みごとに「本人が先に言ったか」（行ごとに数え直さない）
    out, n = [], 0
    for ln, row in zip(lines, timed(lines)):
        if not row:
            out.append(ln)
            continue
        t, w, text = row
        pairs = fold(text)
        s = "".join(c for c, _ in pairs)
        spans = []
        for k, (c, b) in enumerate(posts):
            lo, hi = READ_LAG[len(b) >= READ_LONG]
            if not (t - hi < c < t + w - lo):
                continue
            if k not in first:
                first[k] = any(end <= c and b in x for end, x in said)
            if first[k]:
                continue
            got = []
            for s0, s1, left, right in read_spans(b, s):
                lag = t + w * s0 / max(1, len(s)) - c   # 行の中の位置から見積もった、読み上げの秒 − 書き込みの秒
                got.append((lag, s0, s1, left, right))
            if any(lag < lo for lag, *_ in got):
                first[k] = True   # 同じ行の中で、書き込みより前に本人がもう言っている（画に映った物の名前など）
                continue
            spans += [_widen(text, pairs[s0][1], pairs[s1 - 1][1] + 1, left, right) for lag, s0, s1, left, right in got if lag < hi]
        merged = []
        for a, b2 in sorted(spans):
            if merged and a <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], b2))
            else:
                merged.append((a, b2))
        for a, b2 in reversed(merged):
            text = text[:a] + READ_MARK + text[b2:]
        n += len(merged)
        out.append(ln[: len(ln) - len(row[2])] + text if merged else ln)
    return out, n


def masked_note(n: int) -> str:
    return f"本人が読み上げた視聴者さんのコメント {n} か所は{READ_MARK}に伏せた。F-048" if n else ""


def masked_lines(video: str, ranges: list) -> tuple:
    """その回の字幕のうち区間に掛かる行を、読み上げた書き込みを伏せて。（字幕の置き場, 行, 伏せた数）。"""
    tr = stream_file(video, "transcript")
    got, n = mask_read(cut(tr, ranges), comment_posts(video), tr.read_text(encoding="utf-8").splitlines())
    return tr, got, n


# ---------- 2本以上の回をまたぐ原稿（2026-11-04） ----------
#
# 夫婦の車の回は 5日目（Xvdk_P4gKoU）と7日目の朝（kunXt2sXnFQ）をまたいだ。`--video` が1本しか取れず、担当はスクラッチの包みで
# 2本目を切って伏せていた（バゲットの回は4本）。いまは `--video` を何回でも渡せ、区間は `<videoId>@H:MM:SS-H:MM:SS` で回を名指す
# （回を書かない区間は、最初の `--video` の回）。どの回の字幕にも、その回のチャットで伏せ字が効く。

VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")   # 区間の頭・`--transcript` の頭に書く回（大文字の無い videoId もあるので、形だけ見る）


def videos_of(video) -> list:
    """`--video` の1本（字）か何本か（並び）を、重ねずに並びで。"""
    if not video:
        return []
    out = []
    for v in [video] if isinstance(video, str) else video:
        if v not in out:
            out.append(v)
    return out


def video_ranges(videos: list, ranges: list) -> dict:
    """`--range` を回ごとに {videoId: [(始め, 終わり)]}。`<videoId>@` の無い区間は最初の `--video` の回。"""
    out = {v: [] for v in videos}
    for r in ranges:
        vid, sep, rest = r.rpartition("@")
        if sep and not VIDEO_ID.fullmatch(vid):
            raise ValueError(f"区間の頭の回が videoId の形でない: {r}（<videoId>@H:MM:SS-H:MM:SS）")
        if not sep:
            if not videos:
                raise ValueError(f"区間 {r} の回が分からない（--video を渡すか、<videoId>@{r} と書く）")
            vid, rest = videos[0], r
        out.setdefault(vid, []).extend(parse_ranges([rest]))
    return out


def stream_title(path: Path) -> str:
    """字幕の頭の `# 題` の行（配信の題）。"""
    for ln in path.read_text(encoding="utf-8").splitlines()[:3]:
        if ln.startswith("# ") and not ln.startswith("# http"):
            return ln[2:].strip()
    return ""


def extra_block(arg: str) -> tuple:
    """`--extra` の1本（`[H:MM:SS] 文` の写し。復号した whisper など）。`<videoId>=<道>` と書けば、その回のチャットで伏せる。

    （見出しと本文, 時刻のある行）。回を書かない写しはチャットと突き合わせられないので、伏せていないと書く。
    """
    vid, sep, p = arg.partition("=")
    if not (sep and VIDEO_ID.fullmatch(vid)):
        vid, p = "", arg
    text = Path(p).read_text(encoding="utf-8").strip()
    lines = text.splitlines()
    if vid:
        lines, n = mask_read(lines, comment_posts(vid))
        note = f"（{vid} の写し。{masked_note(n)}）" if n else f"（{vid} の写し。読み上げた書き込みは見つからなかった）"
    else:
        note = "（どの回の写しか書いていないので、読み上げた書き込みは伏せていない。`<videoId>=<道>` で渡す）"
    return f"{Path(p).name}{note}:\n\n```\n" + "\n".join(lines) + "\n```", [ln for ln in lines if TIME.match(ln)]


def labeled(video: str, lines: list) -> list:
    """回をまたぐとき、時刻の頭に回を付ける（`[kunXt2sXnFQ 0:14:00] …`。watch_block が時刻と一緒に名指す）。"""
    return [f"[{video} {ln[1:]}" if TIME.match(ln) else ln for ln in lines]


# ---------- 原稿の表 ----------

def rows_of(script: Path, spec: Path | None) -> tuple:
    """原稿の行と、spec の行（無ければ空の辞書）。spec に rows が無い・行の数が違えば、`lint.build` が止める（ValueError）。"""
    c = lint_mod.build(script, spec=spec)
    rows = c.rows or [{} for _ in c.lines]
    for i, r in enumerate(rows, 1):
        r.setdefault("_ashi", i in c.ashi_marked)
    return c, rows


def seconds(lines: list) -> list:
    out, t = [], 0.0
    for ln in lines:
        d = max(1.2, lint_mod.chars(ln) / CPS)
        out.append((t, t + d))
        t += d + GAP
    return out


def marks(r: dict) -> str:
    why = r.get("why") or ""
    m = []
    if "【足】" in why or r.get("_ashi"):
        m.append("【足】")
    if AYATO.search(why):
        m.append("【あやと】")
    if "【答】" in why:
        m.append("【答】")
    if r.get("orig_voice"):
        m.append("【元の声】")   # AI の声で読まず、配信の本人の声（叫び）を流す行（帳面 F-051）
    if pending_visual(r):
        m.append("【画は確認中】")
    return "".join(m)


# 1次の原稿は、画を「画は確認中」と書いて出してよい（`planning.md` 0 の3。素材は、あやとの返事を待つあいだに取り込む）。
# 2026-11-04、批評役がその行を F-014（写っていない画）の ✕ に当て、まだ取り込んでいない素材のせいで関所が落ちた。
# 表の画の列は70字で切るので、「確認中」が後ろにあると批評役に見えない。印の列に出す
PENDING = "確認中"


def pending_visual(r: dict) -> bool:
    """spec の行の画（visual）が、まだ素材で確かめていない狙い（「画は確認中」）か。"""
    return PENDING in str(r.get("visual") or "")


def short(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", (s or "").replace("|", "／")).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def script_table(c, rows: list) -> str:
    secs = seconds(c.lines)
    head = ["| # | 秒 | 声（原稿） | 画 | 読まない字（札・隅の字） | 印 |", "| ---: | --- | --- | --- | --- | --- |"]
    out = []
    for i, (ln, r, (a, b)) in enumerate(zip(c.lines, rows, secs), 1):
        telop = r.get("telop") or ""
        if i == 1 and c.title_card:
            telop = f"題の札 0.0–{CARD:.1f}秒「{c.title_card.replace(chr(10), ' ')}」" + (f"・{telop}" if telop and "題の札" not in telop else "")
        out.append(f"| {i} | {a:.1f}–{b:.1f} | {ln} | {short(r.get('visual', ''), 70)} | {short(telop, 60)} | {marks(r)} |")
    return "\n".join(head + out)


def lint_block(script: Path, spec: Path | None, as_of: str | None = None) -> str:
    r = subprocess.run([sys.executable, str(HERE / "lint.py"), str(script)] + (["--spec", str(spec)] if spec else [])
                       + (["--as-of", as_of] if as_of else []),
                       capture_output=True, text=True, timeout=60, check=False)
    return "\n".join(ln for ln in r.stdout.splitlines() if not ln.startswith("原稿: "))


MARK = "<!-- ここから下が、担当に渡る字 -->"


def fill(tmpl: str, values: dict) -> str:
    body = tmpl.split(MARK, 1)[-1].lstrip("\n")
    for k, v in values.items():
        body = body.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{(\w+)\}\}", body)
    if left:
        raise KeyError(f"雛形に埋めていない所がある: {left}")
    return body


# spec の why（「2:39:30「…」」「2:30:00〜2:30:30」）と src（「2:49:53.7」）に書いた配信の時刻
CITED = re.compile(r"(?<![\d:])(\d{1,2}:\d{2}:\d{2})(?:\.\d+)?(?![\d:])")
PAD = 30       # 書いた時刻の前後に足す秒（字幕は30秒ごとの行なので、前後の1行ずつが入る）


# why・src の中の回の名前（`Xvdk_P4gKoU 0:38:00`・`kunXt2sXnFQ@0:15:00`）と時刻
TOKEN = re.compile(r"(?P<vid>(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{11}(?![A-Za-z0-9_-]))|"
                   r"(?<![\d:])(?P<t>\d{1,2}:\d{2}:\d{2})(?:\.\d+)?(?![\d:])")


def cited_points(rows: list, videos: list | None) -> dict:
    """spec の行の why・src に書いた時刻（秒）を回ごとに {回: [秒]}。

    時刻は、その欄（why・src の1つずつ）で前に書いた回のもの（`Xvdk_P4gKoU 0:38:00`・`kunXt2sXnFQ@0:15:00`）。
    回をまだ書いていない時刻は最初の回のもの。videos が None なら回を見ない（全部を None の回に）。
    """
    pts = {}
    for r in rows:
        for field in [str(r.get("why") or "")] + [str(x) for x in (r.get("src") or [])]:
            cur = videos[0] if videos else None
            for m in TOKEN.finditer(field):
                v = m.group("vid")
                if v:
                    if videos and (v in videos or VID.fullmatch(v)):
                        cur = v
                    continue
                pts.setdefault(cur, []).append(hms(m.group("t")))
    return pts


def merge_ranges(pts: list, pad: int = PAD) -> list:
    """時刻の前後 pad 秒を、重なりをまとめて（始め, 終わり）で。"""
    out = []
    for t in sorted(set(pts)):
        a, b = max(0, t - pad), t + pad
        if out and a <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def cited_ranges(rows: list, pad: int = PAD) -> list:
    """spec の行の why・src に書いた時刻の前後 pad 秒を、重なりをまとめて（始め, 終わり）で（回を見ない）。

    **作文者が根拠に挙げた所を、そのまま批評役に見せる。** 挙げた時刻に、その言葉が無ければ、批評役は「配信に無い」と読める。
    """
    return merge_ranges(cited_points(rows, None).get(None, []), pad)


def cited_by_video(rows: list, videos: list, pad: int = PAD) -> dict:
    """回ごとの cited_ranges {回: [(始め, 終わり)]}。why・src で名指した、videos の外の回も入る。"""
    return {v: merge_ranges(p, pad) for v, p in cited_points(rows, videos).items()}


def critic_source(video, ranges: list, rows: list, extra: list | tuple = ()) -> str:
    """批評役に見せる配信の字幕（`--video` が無ければ、無いと書く）。回をまたぐときは回ごとに切る。"""
    videos = videos_of(video)
    if not videos and not extra:
        return "（配信の字幕は渡していない。【足】の印と表の画だけで読み、(h) F-047 の「配信に無い言葉」「言い換えた説明」は当てない）"
    given = video_ranges(videos, ranges) if ranges else {}
    videos += [v for v in given if v not in videos]
    cited = cited_by_video(rows, videos) if videos else {}
    named = [v for v in cited if v not in videos]   # `--video` に無いが、作文者が why・src で根拠に名指した回（前日の回など）
    blocks = []
    for v in videos + named:
        rs = given.get(v) or cited.get(v) or []
        if not rs:
            blocks.append((v, None, "（字幕の区間が決まらない。`--range` を渡すか、spec の why に配信の時刻を書く）"))
            continue
        try:
            tr, got, n = masked_lines(v, rs)
        except FileNotFoundError:
            if v not in named:
                raise
            blocks.append((v, None, "（why・src で名指した回だが、streams/ に字幕が無い）"))
            continue
        how = "まとめ役が渡した区間" if given.get(v) else f"spec の why・src に書いた時刻の前後{PAD}秒"
        note = f"。{masked_note(n)}" if n else ""
        blocks.append((v, tr, f"自動字幕（{rel(tr)}、30秒ごと。{how}{note}）:\n\n```\n" + "\n".join(got) + "\n```"))
    if len(blocks) == 1 and not extra:
        return blocks[0][2]
    parts = [f"### {v}" + (f"（{stream_title(tr)}）" if tr else "") + "\n\n" + body for v, tr, body in blocks]
    parts += [extra_block(e)[0] for e in extra]
    head = ("回をまたぐ。字幕は回ごとに切ってある（時刻はそれぞれの回の中の時刻。spec の why・src の「videoId H:MM:SS」で回を名指す）。\n\n"
            if len(blocks) > 1 else "")
    return head + "\n\n".join(parts)


FIXTURES = HERE / "fixtures"
# 終わりの形の言い回し。雛形が「最後の行の形」として書くもので、対照の行を引いたのではない
FORMS = ("アーカイブ見てね", "配信見にきてね")


def leaks(text: str, k: int = 8) -> list:
    """雛形の字が、対照の原稿（`fixtures/`）の行を k 字以上そのまま引いている所。[(控えの名前, 行)]。

    **対照の行を雛形の例に書くと、批評役は決まりではなく例との一致で落とす・通す**（`references/critic_prompt.md` の
    「雛形を直すとき」）。対照（`script_writing.md` 7.7）が答えを見て揃うので、雛形の良し悪しを測れなくなる。
    """
    def strip(s):
        s = _norm(s)
        for f in FORMS:
            s = s.replace(_norm(f), "／")
        return s
    body, out = strip(text), []
    for f in sorted(FIXTURES.glob("*/*/script*.txt")):
        for ln in f.read_text(encoding="utf-8").splitlines():
            n = strip(lint_mod.MARK.sub("", ln.strip()))
            if ln.strip().startswith("#") or len(n) < k:
                continue
            if any(n[i:i + k] in body for i in range(len(n) - k + 1)):
                out.append((f.parent.name, ln.strip()))
    return out


def build_critic(script: Path, spec: Path | None, refs: list, about: str, video=None,
                 ranges: list | None = None, as_of: str | None = None, extra: list | None = None) -> str:
    """video は1本（字）か何本か（並び）。extra は足す写し（`[<videoId>=]<道>`。前日の回の whisper など）。"""
    c, rows = rows_of(script, spec)
    sp = spec or lint_mod.spec_for(script)
    tmpl = CRITIC_TMPL.read_text(encoding="utf-8")
    bad = leaks(tmpl.split(MARK, 1)[-1])
    if bad:
        raise KeyError("雛形（critic_prompt.md）が対照の原稿の行を引いている（例は参考から取る）: "
                       + " / ".join(f"{n}「{ln}」" for n, ln in bad[:4]))
    return fill(tmpl, {
        "about": about.strip() or "（まとめ役が1〜3行で書く: 誰の何の配信か・この案の狙い）",
        "n": str(len(c.lines)),
        "table": script_table(c, rows),
        "lint": lint_block(script, sp if sp.exists() else None, as_of),
        "cards": cards(avoid=c.lines),
        "ids": ids_line(),
        "refs": beats(refs) if refs else "（参考の指定なし）",
        "source": critic_source(video, ranges or [], rows, extra or []),
    })


# ---------- 作文者へ ----------

def fixed_block(title: str | None, nxt: str | None) -> str:
    """作文者に、決まっている字（題の札・次の配信）を渡す。1行目と最後の行は、ここから書く（帳面 F-047・F-049）。"""
    out = []
    if title:
        t = title.replace("\n", "")
        out.append(f"- **題の札**: 「{title.replace(chr(10), ' ／ ')}」。**1行目は、この札の字をそのまま読む**（句読点と改行の置きかただけ変えてよい。lint の T-READ が見る）")
        drops = lint_mod.particle_drops(t)
        if drops:
            out.append("  - **ただし、この札には助詞の抜けがある**: " + "・".join(f"「{g}」→「{f}」" for g, f in drops)
                       + "。あやとの札でも、札ごと直して spec の `title_card` と1行目に同じ字を書き、直したことを返すときに書く（F-049。lint の L-PARTICLE が見る）")
    if nxt:
        out.append(f"- **次の配信**: {nxt}。最後の行で次の配信に誘うなら、**この時刻まで言う**（lint の L-NEXT が見る）")
    return "\n".join(out) or "（指定なし。題の札が決まったら、1行目はその字をそのまま読む。最後の行で次の配信に誘うなら、時刻まで言う）"


def watch_block(lines: list) -> str:
    """この回の字幕で、約束に当たりやすい所（機械で見つけたもの）。字幕の本文は写さず、時刻と言葉だけ。"""
    out = []
    for bad, good in lint_mod.nicknames().items():
        at = [ln.split("]", 1)[0].lstrip("[") for ln in lines if lint_mod.nick_at(ln, bad)]
        if at:
            out.append(f"- 字幕に、配信の中の呼び名「{bad}」が {len(at)} か所（{'・'.join(at[:6])}{' ほか' if len(at) > 6 else ''}）。"
                       f"声では「{good}」のように、初見に通じる言葉で言う（F-048・F-008。lint の L-NICK が見る）")
    inner = []
    for ln in lines:
        at = ln.split("]", 1)[0].lstrip("[")
        m = lint_mod.INNER.search(ln.replace(READ_MARK, ""))   # 伏せた印の中の「コメント」は数えない
        if m:
            inner.append((at, m.group(0)))
        elif READ_MARK in ln:
            inner.append((at, "読み上げ"))
    if inner:
        out.append(f"- 字幕で、本人がコメント・チャットに触れている所が {len(inner)} か所（"
                   + "・".join(f"{t}「{w}」" for t, w in inner[:6]) + "）。"
                   "そこで向きが変わる話は、視聴者の書き込みで動いている。持ち出さず、その段ごと外すか、本人・画に居る人・起きた出来事で渡す（F-048）")
    return "\n".join(out) or "（字幕からは、呼び名・内輪の言葉は見つからなかった。それでも全部のカードを当てる）"


def table_template(n: int, title: str | None = None) -> str:
    """1行ずつ4欄（元の出来事／見る人に届く文／残した本人の言葉／選んだ理由）の雛形。

    選んだ理由は、あやとの返事（#1019「なぜそれを選んだか理由付きで」、帳面 F-051）から。
    """
    head = ["| # | 元の出来事（配信の時刻） | 見る人に届く文（読み上げる字） | 残した本人の言葉 | 選んだ理由 |",
            "| ---: | --- | --- | --- | --- |"]
    rows = []
    for i in range(1, n + 1):
        if i == 1 and title:
            rows.append(f"| 1 | 題の札をそのまま読む | {title.replace(chr(10), '')} |  |  |")
        else:
            rows.append(f"| {i} |  |  |  |  |")
    return "\n".join(head + rows)


def ate_template(led=None) -> str:
    """当て表の雛形（カードの ID を全部）と、spec の promises に書く形。"""
    items = ledger_mod.script_items(led)
    head = ["| ID | 約束 | 当たる行 | どう直したか／当たらない理由 |", "| --- | --- | --- | --- |"]
    rows = [f"| {it.id} | {short(it.title, 40)} |  |  |" for it in items]
    skel = ",\n".join(f'  "{it.id}": {{"lines": [], "note": ""}}' for it in items)
    return "\n".join(head + rows) + "\n\nspec.json の `promises`（同じ中身。lint の L-ATE が、ID の欠け・空の note・原稿の外の行の番号を ✕ にする）:\n\n```json\n\"promises\": {\n" + skel + "\n}\n```"


def build_writer(video, ranges: list, refs: list, about: str, n: int, chat: bool,
                 extra: list, title: str | None = None, nxt: str | None = None) -> str:
    """video は1本（字）か何本か（並び）。区間は `[<videoId>@]H:MM:SS-H:MM:SS`（回を書かなければ最初の回）。"""
    if chat:
        raise ValueError("作文者の1枚にチャットの本文は入れない（視聴者の書き込みで話を動かさない。帳面 F-048）。--chat を外す")
    per = video_ranges(videos_of(video), ranges) if ranges else {}
    bare = [v for v, rs in per.items() if not rs]
    if bare:
        raise ValueError(f"区間の無い回がある: {'・'.join(bare)}（--range {bare[0]}@H:MM:SS-H:MM:SS で渡す）")
    multi = len(per) > 1
    parts, got = [], []
    for v, rs in per.items():
        # 伏せた数は k に（n は表の行の数。2026-11-04 まで、ここで n を上書きしていて、伏せた数の行の表になっていた）
        tr, lines, k = masked_lines(v, rs)
        note = f"。{masked_note(k)}" if k else ""
        body = f"自動字幕（{rel(tr)}、30秒ごと{note}）:\n\n```\n" + "\n".join(lines) + "\n```"
        parts.append(f"### {v}（{stream_title(tr)}）\n\n{body}" if multi else body)
        got += labeled(v, lines) if multi else lines
    if multi:
        parts.insert(0, "回をまたぐ。字幕は回ごとに切ってある（時刻はそれぞれの回の中の時刻。元の出来事の欄と spec の why には"
                        "「videoId H:MM:SS」で回を名指して書く）")
    for p in extra:
        block, lines = extra_block(p)
        parts.append(block)
        got += lines
    return fill(WRITER_TMPL.read_text(encoding="utf-8"), {
        "about": about.strip() or "（まとめ役が1〜3行で書く: どの配信のどの出来事か・企画の型・伝えたいこと）",
        "cards": cards(),
        "n_cards": str(len(card_ids())),
        "fixed": fixed_block(title, nxt),
        "watch": watch_block(got),
        "refs": beats(refs) if refs else "（参考の指定なし。上の方針と、あやとの直しを手本にする）",
        "table": table_template(n, title),
        "ate": ate_template(),
        "source": "\n\n".join(parts) or "（区間の指定なし。`--video` と `--range` を渡す）",
    })


# ---------- 本編集の担当へ（edit） ----------

# 本編集の段に効く分類。題のうち「札」（書き出しで焼く題の札）の決まりも、ここで当てる（F-015・F-030・F-043）
EDIT_CATS = ("画", "音", "投稿")
CARD_WORD = "札"
EDIT_MAX = 20000   # 1枚の字数の上限（#1011）。越えたら雛形か抜き出しを削る。担当が毎回の呼び出しで読み直す量
# 企画の節のうち、本編集で読む小節の見出し。ほかは原稿の段の記録（拍の写し・【足】・確かめた事実）と往復の記録
EDIT_HEADS = re.compile(r"本編集|書き出し|取り込み|似た見た目|(?<!企)画|0秒目|冒頭|決めごと|決定|あやとの直し|気をつけ|素材|カット|^声$|投稿")
PAT_HEAD = re.compile(r"^## ([A-Z])[\s　]")
HEAD = re.compile(r"^(#{1,4}) (.+)$")
# 配信の videoId（11字・大文字と小文字が混ざる）。「france-2025」のような回の名前は拾わない
VID = re.compile(r"(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9_-]{11}(?![A-Za-z0-9_-])")
TOOL_REF = re.compile(r"(?<![\w./-])((?:[\w.-]+/)*[\w-]+\.py)\b")
FLAG = re.compile(r"(?<![\w-])(--[a-z][a-z0-9-]*)")


def rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(ROOT))
    except ValueError:
        return str(p)


def pick(episode: Path, pattern: str | None) -> tuple:
    """回の置き場と案 →（版の置き場, 原稿, 接尾辞）。置き場が版（p1）でなければ、原稿のある いちばん新しい版。"""
    ep = episode if episode.is_absolute() else ROOT / episode
    if not ep.is_dir():
        raise FileNotFoundError(f"{episode} が無い（shorts/videos/ の下の回の置き場）")
    if not list(ep.glob("script*.txt")):
        vers = [d for d in ep.iterdir() if d.is_dir() and re.fullmatch(r"p\d+", d.name) and list(d.glob("script*.txt"))]
        if vers:
            ep = max(vers, key=lambda d: int(d.name[1:]))
    sfx = f"_{pattern}" if pattern else ""
    sc = ep / f"script{sfx}.txt"
    if not sc.exists():
        have = sorted(p.name for p in ep.glob("script*.txt"))
        raise FileNotFoundError(f"{rel(sc)} が無い（在るのは {'・'.join(have) or 'なし'}。案は --pattern で）")
    return ep, sc, sfx


def files_of(vdir: Path, sfx: str, sid: str) -> dict:
    """その案の記録の置き場（名前の決まりは、案の印 `_A` か、版の id `p2` か）。"""
    return {"原稿": vdir / f"script{sfx}.txt", "spec": vdir / f"spec{sfx}.json", "上書き": vdir / f"overrides{sfx}.json",
            "指示書": vdir / f"edit_{sid}.json", "声の字": vdir / f"voice_lines{sfx}.json",
            "検査の記録": vdir / f"qa_{sid}.md", "投稿の文": vdir / f"post_{sid}.json"}


# 帳面

def edit_items(led=None) -> list:
    led = led or ledger_mod.load()
    return [it for it in led.items.values()
            if it.category in EDIT_CATS or (it.category == "題" and CARD_WORD in it.title)]


def check_only(it) -> bool:
    """当てる場所が `check:` だけ（人の目も批評役も名指していない）。書き出しの検査が落とすので、名前だけでよい。"""
    return bool(it.checks) and ledger_mod.HUMAN not in it.place and "批評役" not in it.place


def rule_do(it, width: int = 120) -> str:
    """決まりの「する」の側（「しない —」より前）を width 字まで。"""
    s = re.split(r"[。\s]*しない\s*[—―-]", it.fields.get("決まり", ""))[0]
    s = re.sub(r"\s+", " ", re.sub(r"^\s*する\s*[—―-]\s*", "", s)).strip()
    return s if len(s) <= width else s[: width - 1] + "…"


def edit_ledger_block(led=None) -> str:
    """帳面の画・音・投稿（と題の札）の項目。検査が落とす項目は名前だけ、人が当てる項目は「する」の1行つき。"""
    items = edit_items(led)
    machine = [it for it in items if check_only(it)]
    out = []
    for it in items:
        if it in machine:
            continue
        times = f"（{it.times}回）" if it.times > 1 else ""
        out.append(f"- **{it.id}**（{it.category}）{it.title}{times}\n  する: {rule_do(it)}")
    if machine:
        out.append("- 検査が見る（`check.py` が落とす。`summary.json` の合否を読むだけ）: "
                   + "・".join(f"{it.id} {'/'.join(sorted(it.checks))}" for it in machine))
    return "\n".join(out)


# 原稿の表

def edit_rows(edit: Path, n: int):
    """書き出した指示書の、行ごとの（始め秒, 終わり秒, カット）。行の数が原稿と違えば None（前の原稿で組んだもの）。"""
    if not edit.exists():
        return None
    m = json.loads(edit.read_text(encoding="utf-8")).get("meta") or {}
    rs, fps = m.get("rows") or [], float(m.get("fps") or 30)
    if len(rs) != n:
        return None
    return [(r["from"] / fps, (r["from"] + r["frames"]) / fps, r.get("cuts") or []) for r in rs]


def text_cell(r: dict, card: str | None) -> str:
    m = []
    if r.get("card") and card:
        m.append(f"題の札「{card.replace(chr(10), ' ')}」")
    if r.get("big"):
        m.append("【大】")
    if r.get("corner_note"):
        m.append(f"注「{r['corner_note']}」")
    if r.get("mood") and r["mood"] != "plain":
        m.append(r["mood"])
    if r.get("telop") and not r.get("card"):
        m.append(r["telop"])
    return "・".join(m)


def edit_table(c, rows: list, real, card: str | None) -> str:
    est = seconds(c.lines)
    head = ["| # | 秒 | 声（原稿） | 素材の時刻 | 画（spec の狙い） | 字（札・【大】・注・感情） |",
            "| ---: | --- | --- | --- | --- | --- |"]
    out = []
    for i, (ln, r) in enumerate(zip(c.lines, rows), 1):
        a, b, src = real[i - 1] if real else (est[i - 1][0], est[i - 1][1], r.get("src") or [])
        out.append(f"| {i} | {a:.1f}–{b:.1f} | {ln} | {short(' ・ '.join(src), 60)} | {short(r.get('visual', ''), 70)}"
                   f" | {short(text_cell(r, card), 50)} |")
    return "\n".join(head + out)


def mismatch(c, spec: dict | None) -> list:
    """原稿（決まった字）と spec の行の食い違い。spec が前の原稿のままだと、違う字で声と字幕を作る。"""
    rs = (spec or {}).get("rows")
    if not rs:
        return []
    if len(rs) != len(c.lines):
        return [f"spec の行 {len(rs)} と原稿の行 {len(c.lines)} が合わない（spec を原稿に合わせて直す）"]
    return [f"{i}行目: spec の字「{short(r.get('line', ''), 24)}」が原稿と違う" for i, (ln, r) in enumerate(zip(c.lines, rs), 1)
            if _norm(r.get("line", "")) != _norm(ln)]


# 企画の節

def plan_heads(lines: list, pattern: str | None) -> list:
    """企画の見出し（始め・終わりの行・深さ・字・字数）のうち、その案の節と、どの案にも属さない節のもの。"""
    heads = [(i, len(m.group(1)), m.group(2).strip()) for i, ln in enumerate(lines) if (m := HEAD.match(ln))]
    out, owner = [], None
    for k, (i, lv, text) in enumerate(heads):
        if lv <= 2:
            m = PAT_HEAD.match(lines[i])
            owner = m.group(1) if m else None
        if pattern and owner and owner != pattern:
            continue
        j = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        out.append((i, j, lv, text, sum(len(x) + 1 for x in lines[i:j])))
    return out


def decision(lines: list) -> str:
    """企画の頭（最初の ## より前）の、最初の引用（あやとの決定を置く所）。"""
    out = []
    for ln in lines:
        if ln.startswith("## "):
            break
        if ln.startswith(">"):
            out.append(ln)
        elif out:
            break
    s = "\n".join(out)
    return s if len(s) <= 900 else s[:899] + "…"


def ingest_excerpt(lines: list, heads: list, plan: Path, cap: int = 3200) -> tuple:
    """企画の取り込みの節（どの配信のどの区間を、どの行に当てるために取ったか）。無ければ (None, 案内)。"""
    for i, j, _lv, text, _n in heads:
        if "取り込み" not in text:
            continue
        body = "\n".join(ln for ln in lines[i + 1:j] if ln.strip() != "---").strip()
        if len(body) > cap:
            body = body[:cap].rsplit("\n", 1)[0] + f"\n…（続きは {rel(plan)} の L{i + 1}–{j}）"
        return i, f"企画の「{text}」（{rel(plan)} L{i + 1}–{j}）:\n\n{body}"
    return None, "企画に取り込みの節が無い。素材の時刻は上の原稿の表の「素材の時刻」（spec の `src`）"


def plan_map(heads: list, plan: Path, have_spec: bool, inlined) -> str:
    read, skip, skip_n = [], 0, 0
    for i, j, lv, text, n in heads:
        if lv == 1:
            continue
        if i == inlined:
            read.append(f"  - L{i + 1}–{j}（{n:,}字）{text} … 下の「素材」に入れた")
        elif EDIT_HEADS.search(text) or (not have_spec and text.startswith("原稿")):
            read.append(f"  - L{i + 1}–{j}（{n:,}字）{text}")
        else:
            skip += 1
            skip_n += n
    return (f"- 企画の節（`{rel(plan)}`）で読むのは次の小節だけ。ほかの {skip} 小節（計 {skip_n:,}字）は原稿の段の記録・往復の記録で、読まない:\n"
            + ("\n".join(read) or "  - （本編集に効く小節が無い）"))


# 素材

def stream_ids(vdir: Path, spec: dict | None) -> list:
    """この回が使う配信の videoId（回の置き場の名前・行の video / src_video・spec の `_note`）。

    `_note` に時間軸の割り当て（`2:=Lmk2lp9iFQ8`）があれば、それだけを使う。`_note` には「使わない配信」も書いてある。
    """
    note = str((spec or {}).get("_note", ""))
    axis = re.findall(r"\d+:=(" + VID.pattern + ")", note)
    cand = [vdir.parent.name] + ([" ".join(axis)] if axis else [note])
    cand += [json.dumps(r.get(k), ensure_ascii=False) for r in (spec or {}).get("rows", []) for k in ("video", "src_video")
             if r.get(k)]
    out = []
    for s in cand:
        for v in VID.findall(s):
            if v not in out:
                out.append(v)
    return out


SHEETS = re.compile(r"/sheets\.enc(\.\d{3})?$")


def clips_state(vid: str) -> str:
    """その配信の clips の暗号文が作業枝に在るか・コマ一覧の小さな封（`sheets.enc`。62c63c0e から）を持つか。

    封のある clips は `decrypt.py --sheets` で約1MB だけ取ればコマ一覧が読める。無い（前に頼んだ）clips は、
    mp4 の封（数十〜数百MB）を開いて手元で作るしかない。担当が開いてから分かるのでは遅いので、先に書く。
    """
    rel_ = f"shorts/.work/{vid}/clips"
    d = ROOT / rel_
    if (d / "manifest.json").exists():
        return "作業枝に在る・" + ("コマ一覧の封あり" if any(SHEETS.search("/" + p.name) for p in d.iterdir()) else "古い形")
    try:
        c = subprocess.run(["git", "-C", str(ROOT), "log", "-1", "--full-history", "--format=%H", "--diff-filter=AM", "--",
                            f"{rel_}/manifest.json"], capture_output=True, text=True, timeout=30, check=False).stdout.strip()
        if not c:
            return "取り込みの記録が無い"
        ls = subprocess.run(["git", "-C", str(ROOT), "ls-tree", "--name-only", c, f"{rel_}/"],
                            capture_output=True, text=True, timeout=30, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return "?"
    return f"下ろしてある（{c[:8]} の木に在る・" + ("コマ一覧の封あり）" if any(SHEETS.search(p) for p in ls.splitlines())
                                                else "古い形）")


def material_block(vdir: Path, spec: dict | None, excerpt: str, scratch: str | None) -> str:
    parts = []
    if spec and spec.get("_note"):
        parts.append(f"- 時間軸（spec の `_note`）: {short(str(spec['_note']), 700)}")
    ids = stream_ids(vdir, spec)
    if ids:
        parts.append("- 配信と clips の暗号文（`shorts/.work/<videoId>/clips/`。開きかたは下の 1）: "
                     + "・".join(f"{v}（{clips_state(v)}）" for v in ids))
    if scratch and ids:
        found = []
        for v in ids:
            for pat in (f"*/{v}/clips/index.json", f"*/*/{v}/clips/index.json", f"*/*/*/{v}/clips/index.json"):
                found += [p for p in Path(scratch).glob(pat) if p not in found]
        if found:
            parts.append("- 手元に開いた素材（`index.json`。開き直さずに使う）: "
                         + "・".join(f"`{p}`" + ("（`sheets/` あり）" if (p.parent / "sheets").is_dir() else "") for p in found[:12]))
        else:
            parts.append(f"- 手元に開いた素材は無い（`{scratch}` の3段下まで探した）。下の 1 で開く")
    parts.append("- コマ一覧: 「コマ一覧の封あり」の配信は `decrypt.py --sheets` で `<videoId>/clips/sheets/` だけ取る（下の 1）。"
                 "「古い形」（62c63c0e より前に頼んだ clips）は mp4 を開いて手元で作る")
    return "\n".join(parts) + "\n\n" + excerpt


# 声

def voice_lines(spec: dict) -> list:
    """声に渡す字の雛形（`tools/shorts/voice/` の lines_in の形）。かなに直すのは担当が `tts_text` を書き換えて。"""
    sid = spec.get("id") or "A"
    out = []
    for n, r in enumerate(spec["rows"], 1):
        if r.get("orig_voice"):  # 元の声の行（帳面 F-051）
            # 声は作らず、配信の本人の声を流す（build_edit.py が元の音を置く）。key の番号は行の番号のまま（その番号だけ欠ける）
            continue
        t = r.get("tts_text") or r["line"]
        out.append({"key": f"{sid}/{n:02d}", "plan": sid, "n": n, "caption": r["line"], "tts_text": t,
                    "bytes": len(t.encode("utf-8"))})
    return out


# 雛形の呼び出しと、いまの道具

def tool_path(ref: str):
    p = ROOT / ref
    if "/" in ref and p.is_file():
        return p
    hits = sorted((ROOT / "tools/shorts").glob(f"*/{Path(ref).name}"))
    return hits[0] if hits else None


def check_tools(text: str) -> None:
    """雛形に書いた道具（*.py）が在り、同じ行の `--引数` がその行のどれかの道具に在るか。無ければ止める。

    担当はこの1枚だけを読む。引数の名前が変わったのに雛形が古いままだと、担当は落ちてからソースを読みに行く（#1011 の元）。
    """
    stale = []
    for ln in text.splitlines():
        refs = TOOL_REF.findall(ln)
        if not refs:
            continue
        srcs = []
        for ref in refs:
            p = tool_path(ref)
            if p is None:
                stale.append(f"道具が無い: {ref}")
            else:
                srcs.append(p.read_text(encoding="utf-8"))
        for f in FLAG.findall(ln):
            if srcs and not any(f'"{f}"' in s for s in srcs):
                stale.append(f"{'・'.join(Path(r).name for r in refs)} に {f} が無い")
    if stale:
        raise KeyError("雛形（editor_prompt.md）の呼び出しが道具と食い違う: " + " / ".join(sorted(set(stale))))


def render_names() -> set:
    """作業枝に頼んだことのある書き出しの名前（`shorts/render/<名前>.json`。いま在るものと、下ろしたもの）。"""
    names = {p.stem for p in (ROOT / "shorts/render").glob("*.json")}
    # --full-history: 担当の枝で足して下ろした依頼は、merge の片側で消えて見えるので、既定の省略だと数えない
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "log", "--full-history", "--format=", "--name-only", "--",
                              "shorts/render/"],
                             capture_output=True, text=True, timeout=60, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        out = ""
    return names | {Path(p).stem for p in out.split() if re.fullmatch(r"shorts/render/[^/]+\.json", p)}


def suggest_name(vdir: Path, sid: str, qa: Path) -> str:
    """書き出しの名前の案（回の頭3字-案-版）。版は検査の記録に出てくる v<数> の次から、頼んだことのある名前を飛ばす。

    同じ名前で頼むと、下見の置き場と前の版の結果が重なる（F-010）。フランス A の v3 は、記録（qa_A.md）には
    v2 までしか無いのに、作業枝ではもう fra-a-v3 で頼まれていた。
    """
    base = re.sub(r"[^a-z0-9]", "", vdir.parent.name.lower())[:3] or "sh"
    vs = [int(x) for x in re.findall(r"(?<![A-Za-z0-9])v(\d+)(?![0-9])", qa.read_text(encoding="utf-8"))] if qa.exists() else []
    used, v = render_names(), max(vs, default=0) + 1
    head = f"{base}-{re.sub(r'[^a-z0-9]', '', sid.lower())}-v"
    while f"{head}{v}" in used:
        v += 1
    return f"{head}{v}"


def build_edit_brief(episode: Path, pattern: str | None, about: str, name: str | None, scratch: str | None) -> str:
    vdir, script, sfx = pick(episode, pattern)
    spec_p = vdir / f"spec{sfx}.json"
    spec = json.loads(spec_p.read_text(encoding="utf-8")) if spec_p.exists() else None
    sid = (spec or {}).get("id") or pattern or vdir.name
    files = files_of(vdir, sfx, sid)
    c, rows = rows_of(script, spec_p if spec else None)
    real = edit_rows(files["指示書"], len(c.lines))
    plan = vdir / "plan.md"
    lines = plan.read_text(encoding="utf-8").splitlines() if plan.exists() else []
    heads = plan_heads(lines, pattern)
    at, excerpt = ingest_excerpt(lines, heads, plan)
    name = name or suggest_name(vdir, sid, files["検査の記録"])
    S = scratch.rstrip("/") if scratch else "<スクラッチパッド>"
    bgm = ((spec or {}).get("bgm") or {}).get("path") or "$S/bgm/pocket_csikos.mp3"
    if bgm.startswith(S + "/"):
        bgm = "$S" + bgm[len(S):]

    have = [f"`{p.name}`" + (f"（{len(c.lines)}行）" if k == "原稿" else "") for k, p in files.items() if p.exists()]
    make = [f"`{p.name}`" for k, p in files.items() if not p.exists() and k not in ("投稿の文", "原稿")]
    where = ["## この回の置き場", "",
             f"- 回: `{rel(vdir)}`・案 `{pattern or '—'}`（spec の id `{sid}`）・書き出しの名前 `{name}`（版ごとに変える。F-010）",
             f"- 在る: {'・'.join(have)}" + (f" ／ 無い（この段で作る）: {'・'.join(make)}" if make else "")]
    if real:
        where.append(f"- 前の版の指示書がある（`{files['指示書'].name}`）。直すときは spec と上書きを直して組み直す。前の版の検査は `{files['検査の記録'].name}`")
    for w in mismatch(c, spec):
        where.append(f"- !! {w}")
    dec = decision(lines)
    if dec:
        where.append("- 企画の頭の引用（あやとの決定・頼み）:\n" + "\n".join("  " + ln for ln in dec.splitlines()))
    if lines:
        where.append(plan_map(heads, plan, spec is not None, at))
    else:
        where.append(f"- 企画（`{rel(plan)}`）が無い")

    tmpl = EDIT_TMPL.read_text(encoding="utf-8")
    check_tools(tmpl.split(MARK, 1)[-1])
    return fill(tmpl, {
        "about": about.strip() or "（まとめ役が1〜3行で書く: 何の回のどの案か・この版で何をするか（初めての本編集／前の版の直し）・期限）",
        "where": "\n".join(where),
        "secs_from": (f"書き出した指示書 `{files['指示書'].name}` の実際の秒" if real
                      else "声を上限の倍率で読んだ見積もり（毎秒6.8字。声ができたら実物で測り直す）"),
        "table": edit_table(c, rows, real, c.title_card),
        "material": material_block(vdir, spec, excerpt, scratch),
        "ledger": edit_ledger_block(),
        "scratch": S, "bgm": bgm, "name": name, "sid": sid,
        "ep": rel(vdir), "pat_arg": f" --pattern {pattern}" if pattern else "",
        "spec": "$V/" + files["spec"].name, "ov": "$V/" + files["上書き"].name, "edit": "$V/" + files["指示書"].name,
        "vl": "$V/" + files["声の字"].name, "qa": "$V/" + files["検査の記録"].name,
    })


def main() -> int:
    ap = argparse.ArgumentParser(description="作文者・批評役・本編集の担当に渡す1枚を作る")
    sub = ap.add_subparsers(dest="who", required=True)
    w = sub.add_parser("writer", help="作文者へ（書く前）")
    w.add_argument("--video", action="append", default=[],
                   help="配信の videoId（streams/ の書き起こしから切る）。回をまたぐ原稿は何回でも")
    w.add_argument("--range", action="append", default=[],
                   help="[<videoId>@]H:MM:SS-H:MM:SS（何回でも）。回を書かなければ最初の --video の回")
    w.add_argument("--chat", action="store_true", help="使わない（作文者の1枚にチャットの本文は入れない。帳面 F-048）。渡すと止まる")
    w.add_argument("--lines", type=int, default=18, help="4欄の表の雛形の行数")
    w.add_argument("--title", help="題の札の字（決まっていれば。1行目でそのまま読む・表の1行目に入れる。助詞の抜けがあれば1枚に書く）")
    w.add_argument("--next", help="最後の行で言う次の配信（「本日22時」。決まっていれば）")
    c = sub.add_parser("critic", help="批評役へ（関所）")
    c.add_argument("script")
    c.add_argument("--spec", help="spec.json（既定は原稿の隣）")
    c.add_argument("--video", action="append", default=[],
                   help="配信の videoId（streams/ の字幕を1枚に入れる。配信に無い言葉を批評役が当てるため）。回をまたぐ原稿は何回でも")
    c.add_argument("--range", action="append", default=[],
                   help="[<videoId>@]H:MM:SS-H:MM:SS（何回でも）。区間の無い回は、spec の why・src にその回で書いた時刻の前後30秒")
    c.add_argument("--as-of", help="承認済みの原稿を読み直すとき（lint の結果をその時点の決まりで出す。`lint.py --help`）")
    ed = sub.add_parser("edit", help="本編集の担当へ（声 → spec → 書き出し → 直す → 下見）")
    ed.add_argument("--episode", required=True, help="回の置き場（shorts/videos/<回> か、その版 p1）")
    ed.add_argument("--pattern", help="案（script_A.txt の A。案が1つの回は付けない）")
    ed.add_argument("--name", help="書き出しの名前（remote.py の --name。既定は検査の記録の版の次）")
    ed.add_argument("--scratch", help="作業の置き場（スクラッチパッド）。手元に開いた素材を探し、鍵・BGM の道を埋める")
    ed.add_argument("--voice-lines", help="1枚は作らず、声に渡す字の雛形を spec の tts_text からこの道に書く")
    for p in (w, c):
        p.add_argument("--ref", action="append", default=[], help="写す参考の略号（reference_beats.md の節。何回でも）")
        p.add_argument("--transcript", action="append", default=[],
                       help="[<videoId>=]<道>: streams/ に無い回の字幕（`[H:MM:SS] 文` の行。captions で取って復号した captions.txt）。"
                       "回を書かなければ最初の --video の回。streams/ にその回のチャットが無ければ、読み上げたコメントは伏せられない")
        p.add_argument("--extra", action="append", default=[],
                       help="[<videoId>=]<道>: 足す書き起こし（復号した whisper・前日の回など、[H:MM:SS] 形式）。"
                       "回を書くと、その回のチャットで読み上げを伏せる")
    for p in (w, c, ed):
        p.add_argument("--about", default="", help="何の動画か・狙い（1〜3行）")
        p.add_argument("-o", "--out", help="書き出す先（無ければ標準出力）")
    a = ap.parse_args()
    try:
        use_transcripts(getattr(a, "transcript", None) or [], getattr(a, "video", None) or [])
        if a.who == "critic":
            text = build_critic(Path(a.script), Path(a.spec) if a.spec else None, a.ref, a.about, a.video, a.range, a.as_of,
                                a.extra)
        elif a.who == "edit" and a.voice_lines:
            vdir, _, sfx = pick(Path(a.episode), a.pattern)
            items = voice_lines(json.loads((vdir / f"spec{sfx}.json").read_text(encoding="utf-8")))
            Path(a.voice_lines).write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"{a.voice_lines}（{len(items)}文・{sum(x['bytes'] for x in items):,}バイト）")
            return 0
        elif a.who == "edit":
            text = build_edit_brief(Path(a.episode), a.pattern, a.about, a.name, a.scratch)
        else:
            text = build_writer(a.video, a.range, a.ref, a.about, a.lines, a.chat, a.extra, a.title, a.next)
    except (OSError, KeyError, ValueError) as e:
        print(f"作れない: {e}", file=sys.stderr)
        return 2
    if a.who == "edit" and len(text) > EDIT_MAX:
        print(f"注意: 1枚が {len(text):,}字で、上限 {EDIT_MAX:,}字を越えた（雛形か抜き出しを削る）", file=sys.stderr)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print(f"{a.out}（{len(text):,}字）")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
