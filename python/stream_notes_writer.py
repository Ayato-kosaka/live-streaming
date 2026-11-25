"""**議事録（`streams/YYYY/MM/<stem>.md`）を、`claude -p` に1本ずつ1枚だけ渡して書かせる。`stream_notes.py check` を通ったものだけ置く。**

    python3 python/stream_notes_writer.py <stem> [<stem> ...] --out <scratch>/notes [--jobs 3] [--runs <scratch>/notes/runs.jsonl]
    python3 python/stream_notes_writer.py --pending [--month 2026-11] --out <scratch>/notes --jobs 3
    python3 python/stream_notes_writer.py <stem> --prompt-only --out <dir>      # 1枚を組んで控えに置くだけ（呼ばない）

形と決まりの正は `.claude/skills/stream-notes/SKILL.md` §2、確かめるのは `python/stream_notes.py`（ここは import して使う）。

終了コード: 0=指した回を全部置いた / 1=置けなかった回が在る（呼べなかった・直させても check を通らなかった）/
**2=見るものが無い・素性が残った**（材料が無い・1枚か返事に視聴者さんの素性が残った。`docs/island-standards.md` §15）。

## なぜ道具にしたか（あやと 2026-11-15「持続可能なトークン消費となるような作戦に」）

議事録は1本につき1人の担当（Agent）に配っていた。Agent は起こしただけで前置き（手引き・道具・CLAUDE.md）を読み、
字幕とチャットを `Read` で何十回にも分けて読む。書く仕事そのものは「決まり・見本・字幕・チャット」を読んで
Markdown を返すだけなので、**その1枚だけを `claude -p` に渡す**（`guide_extract.py` と同じ形。道具も MCP も
持たせず、リポジトリの外の空の置き場で起こす）。2026-11-15 に15本をこの形で書いて約9.7ドル。

## 2回目の呼び出しを減らす（同じ日の15本で、9本が字数の上限越えで2回目を呼んだ）

- **頼む字数を目安より下げる**（`ASK`）。返事は頼んだ字数より2〜4割長く出る。目安ちょうどで頼むと上限を越える
- **頭の5行は機械で組み、返事の頭を差し替える**（場所の行だけ返事のを使う）。投げ銭の件数の食い違いで落とさない
- **上限越え・形の崩れ・素性は、下書きだけを渡す軽い1回で直させる**（字幕とチャットを渡し直さない。削るのに材料は要らない）。
  足りないときだけ、同じ会話の続き（`--resume`。字幕とチャットは cache から読まれる）で足させる

直させるのは1回まで（`FIXES`）。2回目も通らない回は置かずに終了 1 で返し、§3 の依頼文で担当に配る。

## 字幕に無い名前（作り話の見張り。`unknown_names`）

返ってきた議事録のカタカナ・英字の名前を、その回の字幕・チャット・前後の回・島の場所の名前と突き合わせる。
1つでも無ければ、その名前を添えて直させる（札には数だけ。名前は直しの1枚と控えの `.names.txt` にだけ）。

## 視聴者さんの素性（`guide_extract.py` の `mask_text` と `leaks` と同じ二重の守り）

議事録には名前（チャットの表記）と投げ銭は書く決まりなので、名前は伏せない。伏せるのは **素性**——
SKILL.md §2 の「生年月日・本名・住んでいる所・学校・年齢・職場」。このリポジトリは公開。

1. **渡す前に伏せる**（`mask_identity`）: チャットの本文と字幕の、年齢・生年月日・本名・連絡先は `〇〇` に。
   チャットの本文はさらに学年・住んでいる所・勤め先と、自分の学校を言っている行の学校名も
   （字幕は配信者本人の話が大半なので、住んでいる所・学校は伏せない。本人が配信でいつも言っている話を消さないため）
2. **組んだ1枚を、別の見かたでもう一度探す**（`identity_leaks`。空白と記号を落として探す）。1つでも残っていれば呼ばない
3. **返ってきた議事録も探す**（`note_leaks`。`@名前` から文の切れ目までに素性の形が在るか）。在れば軽い1回で消させ、
   消えなければ置かない

出すのは札だけで、字は出さない（出力は公開のログに残りうる）。
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_notes as sn  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MODEL = "sonnet"   # 2026-11-23 に Haiku と同じ3本で比べ、Haiku は話題の落ちが1割を越えた（16〜23%。Sonnet 12%）。SKILL.md §5
FIXES = 1          # 直させるのは1回まで。それでも通らない回は置かずに報告へ回す（担当に配る）
JOBS_MAX = 3       # 並べて回すのは3本まで（箱と API の混み具合）
# 頼む字数は目安のこの割合。2026-11-15 の15本で、目安ちょうどで頼むと1回目の本文は目安の 1.04〜2.3倍
# （9本が上限 1.2倍を越えた）。0.88 なら、1.3倍まで長く出ても上限に収まり、頼んだとおりに書く回
# （1.05倍前後）も下限 0.85 を割らない。足りない直しは字幕を読み直させるので、削る直しより高くつく
ASK = 0.88
NEAR = 5           # 前後の回を何本ずつ添えるか（誤変換の地名・人名を読み直す手がかり）
MASK = "〇〇"
SAMPLE = "streams/2026/10/2026-10-18_2202_TDArug_te90.md"
SYSTEM = ("あなたは配信アーカイブの議事録を書く係。渡された1枚（決まり・見本・字幕・チャット）だけを読み、"
          "議事録の Markdown だけを返す。前置き・後書き・コードの囲みは付けない。ファイルや道具は使わない。")

PAID = re.compile(r"^\[(\d+:\d\d:\d\d)\] (投げ銭|(?:[A-Z]{2,3} )?[^\s:\d]{0,4}\d[\d,.]*) (.+?):(.*)$")
CHAT = re.compile(r"^(\[-?\d+:\d\d:\d\d\] (?:(?:投げ銭|(?:[A-Z]{2,3} )?[^\s:\d]{0,4}\d[\d,.]*) )?(.+?): )(.*)$")

# ---------------------------------------------------------------- 素性を伏せる

_W = r"[^\s、。,.!?！？「」『』()（）\[\]:：]"
# 「2◯歳」のように1桁を丸で隠した書きかたも年齢（2026-11-15、過去のチャットに実際に在った）
AGE = re.compile(r"\d[\d◯○〇xX×]{0,2}\s*(?:歳|才)|\d0\s*代|(?:十|二十|三十|四十|五十|六十|七十|八十)代")
BIRTH = re.compile(r"生年月日\s*[はがを:：]?\s*" + _W + r"{0,14}|\d{2,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*(?:生まれ|産まれ|生)"
                   r"|\d{2,4}\s*年\s*(?:生まれ|産まれ)|誕生日\s*[はがを:：]?\s*\d{1,2}\s*月\s*\d{1,2}\s*日"
                   r"|(?<!\d)\d{4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2}(?!\d)")
# 「本名が出る」「日本名」は名前を言っていない。言うときの形は「本名は」「本名：」
REALNAME = re.compile(r"((?<!日)本名\s*(?:は|:|：)\s*)" + _W + r"{1,12}")
CONTACT = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+|(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|〒\s*\d{3}-?\d{4}")
GRADE = re.compile(r"(?<![最])(?:小|中|高)\s*[1-6](?![\d万千百位倍度%])|(?:小学|中学|高校|大学)\s*[1-6一二三四五六]\s*年生?"
                   r"|(?<!\d)[1-6一二三四五六]\s*年生|(?:小学|中学|高校|大学|専門学校)生")
SCHOOL = re.compile(_W + r"{1,12}?(?:小学校|中学校|高等学校|高校|高専|大学|専門学校)")
SELF = re.compile(r"通って|通う|在学|卒業|入学|受験|うちの|母校|生です|年生|の学生|の生徒|受かっ|合格")
LIVE = re.compile("(" + _W + r"{1,12}?)(\s*(?:に住んで|に住む|に住み|に住ん|在住|住まい|に引っ越))")
WORK = re.compile("(" + _W + r"{1,12}?)(\s*(?:で働いて|で働く|に勤めて|で勤めて|に勤務|勤務|の社員|で正社員))")


def norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "")


def mask_identity(s: str, chat: bool) -> str:
    """素性を `〇〇` に。chat=True はチャットの本文（視聴者さんが書いた字）、False は字幕"""
    s = norm(s)
    s = AGE.sub(lambda m: MASK + ("代" if m.group().endswith("代") else "歳"), s)
    s = BIRTH.sub(MASK, s)
    s = REALNAME.sub(lambda m: m.group(1) + MASK, s)
    s = CONTACT.sub(MASK, s)
    if chat:
        s = GRADE.sub(MASK, s)
        if SELF.search(s):
            s = SCHOOL.sub(MASK, s)
        s = LIVE.sub(lambda m: MASK + m.group(2), s)
        s = WORK.sub(lambda m: MASK + m.group(2), s)
    return s


def mask_chat(text: str) -> tuple[str, list[str]]:
    """chat.txt の1行ずつ、本文だけを伏せる（時刻・額・名前は議事録に要るので残す）。(伏せた全文, 伏せた本文だけ)"""
    out, bodies = [], []
    for line in text.splitlines():
        m = CHAT.match(line)
        if m:
            b = mask_identity(m.group(3), chat=True)
            out.append(m.group(1) + b)
            bodies.append(b)
        else:
            out.append(line)
    return "\n".join(out) + "\n", bodies


STAMP = re.compile(r"^\[-?\d+:\d\d:\d\d\]\s*")


def mask_transcript(text: str) -> tuple[str, list[str]]:
    out, bodies = [], []
    for line in text.splitlines():
        if STAMP.match(line):
            b = mask_identity(STAMP.sub("", line), chat=False)
            out.append(STAMP.match(line).group(0) + b)
            bodies.append(b)
        else:
            out.append(line)
    return "\n".join(out) + "\n", bodies


def _squash(s: str) -> str:
    """比べる形。空白と記号を落とす（`1 7 歳` `本名：` のような崩しも当たるように。伏せる側とは別の見かた）"""
    return "".join(c for c in norm(s) if unicodedata.category(c)[0] not in "PSZC" or c in "@〒-/.:")


def identity_leaks(text: str) -> list[str]:
    """伏せた材料（字幕の行とチャットの本文。時刻と名前は外したもの）の伏せ残し。出すのは札だけ。
    1行ずつ見る（つなげて記号を落とすと、前の行の末尾の数字と次の行の頭の「歳」がくっつく）"""
    out = []
    pats = (("年齢", r"\d{1,3}[歳才]"),
            ("生年月日", r"\d{2,4}年\d{1,2}月\d{1,2}日(?:生まれ|産まれ)|\d{2,4}年(?:生まれ|産まれ)|誕生日[はが]?\d{1,2}月\d{1,2}日"),
            ("本名", r"(?<!日)本名[は:](?!" + MASK + ")"),
            ("連絡先", r"[\w.+-]+@[\w-]+\.[a-z]{2,}|0\d{1,4}-\d{1,4}-\d{3,4}|〒\d{3}"))
    for line in text.splitlines():
        q = _squash(line)
        for tag, pat in pats:
            if tag not in out and re.search(pat, q):
                out.append(tag)
    return out


AT = re.compile(r"[@＠][^\s「」、。（）()：:・/／]+")
# 議事録の側は「自分のこと」として言った形だけを見る。渡す前の伏せかた（AGE など）で見ると、ふつうの話
# （「20代の票」「3歳から習って」「月に住む未来」）まで当たる——いまの議事録357本で 63か所当たり、ほとんどがそれだった
_ME = r"(?:私|わたし|僕|ぼく|俺|おれ|うち|自分)\s*(?:は|も|が)?\s*"
_NOTQ = r"(?![^」]{0,6}[?？])"
NOTE_PATS = (
    ("年齢", re.compile(r"(?:今日で|今年で|誕生日で|もうすぐ|ついに|やっと)\s*\d{1,3}\s*[歳才]|" + _ME + r"\d{1,3}\s*[歳才]"
                      r"|\d{1,3}\s*[歳才]\s*(?:です|だよ|でした|になりました|になった|になります|の(?:学生|高校生|中学生|大学生|社会人|会社員|主婦))"
                      r"|「\s*\d{1,3}\s*[歳才]\s*[!！]?\s*」")),
    ("生年月日", BIRTH),
    ("本名", REALNAME),
    ("連絡先", CONTACT),
    ("学年", re.compile(r"(?<![最])(?:小|中|高)\s*[1-6]\s*(?:です|だよ|でした|になり)|(?:小学|中学|高校|大学)\s*[1-6一二三四五六]\s*年生?\s*(?:です|だよ|になり)"
                      r"|(?:小学|中学|高校|大学|専門学校)生\s*(?:です|だよ|でした|になり)" + _NOTQ)),
    ("住んでいる所", re.compile(r"に住んで(?:ます|います|いる|る)" + _NOTQ + "|在住" + _NOTQ)),
    ("勤め先", re.compile(r"(?:で|に)(?:働いて|勤めて)(?:ます|います)" + _NOTQ + r"|勤務(?:です|してます|しています)" + _NOTQ)),
)


def note_leaks(md: str) -> list[str]:
    """議事録の `@名前` から文の切れ目（。・→・改行）までに、自分の素性を言った形が在るか。札だけ返す"""
    out = []
    for m in AT.finditer(md):
        span = norm(re.split(r"[。\n→]", md[m.end():], maxsplit=1)[0])
        for tag, pat in NOTE_PATS:
            if pat.search(span) and tag not in out:
                out.append(tag)
        if SELF.search(span) and SCHOOL.search(span) and "学校" not in out:
            out.append("学校")
    return out


# ---------------------------------------------------------------- 字幕に無い名前（作り話の見張り）
#
# 名前らしい字（カタカナ3字以上・英字3字以上）を議事録から拾い、その回の字幕・チャット・前後の回・島の場所の名前・
# 1枚の決まりと見本のどれかに在るかを見る。漢字の名前は見ない（ふつうの語と見分けられない）。
# 自動字幕は同じ語をひらがなでも書くので、かな・小さい字・長音・中黒を揃えてから比べる（`fold`）。
# 決まりは「誤変換を読み直す」なので、字幕にそのままは無い名前も出る。読み直しは1字違い（「オールセンツ」→
# 「オールセインツ」）か、ふつうの語のつなぎ（「グーグル」＋「マップ」）までを在るとみなす（`unknown_names`）。
# それでも、いまの議事録740本で数えると残りが0の回は3割（中央値1・9割の回で4以下）。作った名前（2026-11-23 に
# Haiku が「バーバリー」「プリティ・ウーマン」を書いた）も1本に1つで紛れるので、1つでも在れば、その名前を添えて
# 「消すか名前を使わない言いかたに」で直させる。直しは下書きだけを渡す軽い1回。
NAME_TOKEN = re.compile(r"[ァ-ヺー]{3,}|[A-Za-z][A-Za-z0-9'&.-]*[A-Za-z0-9]")
COMMON_DF = 20     # 字幕とチャットに出た回の数がこれ以上の語はふつうの語（スマホ・カメラ・クイズ）。名前として数えない
NAMES_MAX = 0      # 字幕に無い名前を、1本にいくつまで許すか。作った名前は1本に1つだけ紛れることがある（SKILL.md §5）ので0
_FOLD = str.maketrans("ぁぃぅぇぉゃゅょっゎゕゖ", "あいうえおやゆよつわかけ")


_VU = (("ゔぁ", "ば"), ("ゔぃ", "び"), ("ゔぇ", "べ"), ("ゔぉ", "ぼ"), ("ゔ", "ぶ"))


def fold(s: str) -> str:
    """比べる形。カタカナをひらがなに・ヴァ行をバ行に・小さい字を大きく・長音と中黒と空白を落とす・英字は小文字。
    字幕は「コベントガーデン」、議事録は「コヴェントガーデン」と書く（2025-01-07 で実際に在った）"""
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in norm(s)).lower()
    for a, b in _VU:
        s = s.replace(a, b)
    return re.sub(r"[\s・ー\-]", "", s.translate(_FOLD))


def name_tokens(text: str) -> set[str]:
    return {m.group() for m in NAME_TOKEN.finditer(norm(text)) if len(m.group()) >= 3}


_VOCAB: dict[str, set[str]] = {}


def common_words(root: Path) -> set[str]:
    """streams/ の字幕とチャットのうち、COMMON_DF 回以上に出た語（揃えた形）。1回の呼び出しで1度だけ数える"""
    key = str(root)
    if key not in _VOCAB:
        df: Counter = Counter()
        for p in (root / "streams").glob("*/*/*.transcript.txt"):
            seen = name_tokens(p.read_text(encoding="utf-8"))
            ch = p.with_name(p.name.replace(".transcript.txt", ".chat.txt"))
            if ch.exists():
                seen |= name_tokens(ch.read_text(encoding="utf-8"))
            df.update({fold(t) for t in seen})
        _VOCAB[key] = {w for w, k in df.items() if k >= COMMON_DF}
    return _VOCAB[key]


class Known(str):
    """在ってよい所を揃えてつないだ字。tokens はそこに出た名前（揃えた形）の集まり"""
    tokens: frozenset = frozenset()


def known_text(root: Path, stem: str, rows: dict) -> Known:
    """名前が在ってよい所を1本につないで揃えたもの（伏せる前の字幕とチャット・前後の回・場所の名前・決まりと見本）"""
    tr, ch, _ = paths(root, stem)
    parts = [p.read_text(encoding="utf-8") for p in (tr, ch) if p.exists()]
    parts += [context(root, stem, rows), places(root), rules(root)]
    if (root / SAMPLE).exists():
        parts.append((root / SAMPLE).read_text(encoding="utf-8"))
    raw = "\n".join(parts)
    k = Known(fold(raw))
    k.tokens = frozenset(fold(t) for t in name_tokens(raw))
    return k


def _one_edit(a: str, b: str) -> bool:
    """a と b が1字の置き換え・足し・抜きまでで同じか"""
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) <= 1
    if len(a) > len(b):
        a, b = b, a
    return any(b[:i] + b[i + 1:] == a for i in range(len(b)))


def _near(f: str, known: str) -> bool:
    """5字以上の名前は、字幕のどこかと1字違いまでなら在るとみなす（「オールセンツ」→「オールセインツ」の読み直し）。
    1字違いなら頭の2字か尻の2字のどちらかは合うので、そこから窓を切って比べる（全部の窓を比べると遅い）"""
    if len(f) < 5:
        return False
    for i in _positions(known, f[:2]):
        if any(_one_edit(f, known[i:i + n]) for n in (len(f) - 1, len(f), len(f) + 1)):
            return True
    for j in _positions(known, f[-2:]):
        end = j + 2
        if any(_one_edit(f, known[max(0, end - n):end]) for n in (len(f) - 1, len(f), len(f) + 1)):
            return True
    return False


def _positions(s: str, sub: str):
    i = s.find(sub)
    while i >= 0:
        yield i
        i = s.find(sub, i + 1)


def _have(f: str, known: str, common: set[str]) -> bool:
    return f in common or f in known or (len(f) >= 4 and (f[1:] in known or f[:-1] in known)) or _near(f, known)


def unknown_names(draft: str, known: str, common: set[str]) -> list[str]:
    """議事録の名前のうち、在ってよい所のどこにも無いもの。頭の機械の4行と @名前 は見ない（場所の行は見る）。
    4字以上は端の1字が欠けても（字幕が語尾を落とす・延ばす）、5字以上は1字違いまで（読み直し）在るとみなす。
    6字以上は、2つに切ってどちらも材料かふつうの語に出た名前そのものなら在るとみなす（「グーグル」＋「マップ」。
    切った片方を字の一部として探すと、3字のかなはたいてい字幕のどこかに在るので、名前の集まりで見る）"""
    head, sep, rest = draft.partition("\n## ")
    body = "\n".join(l for l in head.splitlines() if l.startswith("- 場所:")) + "\n" + sep + rest
    out = []
    for t in sorted(name_tokens(AT.sub(" ", body))):
        f = fold(t)
        if not f or _have(f, known, common):
            continue
        words = common | getattr(known, "tokens", frozenset())
        if len(f) >= 6 and any(f[:i] in words and f[i:] in words for i in range(3, len(f) - 2)):
            continue
        out.append(t)
    return out


# ---------------------------------------------------------------- 材料と1枚

def paths(root: Path, stem: str) -> tuple[Path, Path, Path]:
    d = root / "streams" / stem[:4] / stem[5:7]
    return d / (stem + ".transcript.txt"), d / (stem + ".chat.txt"), d / (stem + ".md")


def rows_of(root: Path) -> dict:
    return {r["name"]: r for r in sn.read_manifest(root / "streams")}


def header(root: Path, stem: str, row: dict) -> tuple[list[str], list, int | None]:
    """頭の5行（機械で組む）・チャットの多い人・字幕の最後の秒"""
    tr, ch, _ = paths(root, stem)
    chat = ch.read_text(encoding="utf-8").splitlines() if ch.exists() else []
    t = tr.read_text(encoding="utf-8") if tr.exists() else ""
    first = re.search(r"^# (.+)$", t or "\n".join(chat[:3]), re.M)
    title = first.group(1).strip() if first else stem
    vid = row.get("video_id") or stem.split("_", 2)[-1]
    start = (row.get("start_jst") or stem[:10]).strip()
    end = sn.last_time(tr)
    if end is None:
        times = [sn.sec(*m.groups()) for l in chat if (m := sn.LINE_TIME_RE.match(l))]
        end = max(times) if times else 0
    lines = [l for l in chat if re.match(r"^\[-?\d", l)]
    paid = [l for l in chat if sn.PAID_RE.match(l)]
    by: OrderedDict = OrderedDict()
    yen, other = 0, Counter()
    for l in paid:
        m = PAID.match(l)
        if not m:
            continue
        amt, name = m.group(2), m.group(3).lstrip("@")
        by.setdefault(name, []).append(amt)
        if amt.startswith("¥"):
            yen += int(amt[1:].replace(",", ""))
        elif amt != "投げ銭":
            cur = re.match(r"^([^\d]+)", amt).group(1)
            other[cur] += float(re.sub(r"[^\d.]", "", amt))
    if paid:
        tot = ([f"¥{yen:,}"] if yen else []) + [f"{c}{v:,.2f}" for c, v in other.items()]
        lst = "／".join(f"{n} {'・'.join(v)}" for n, v in by.items())
        don = f"- 投げ銭 {len(paid)}件（{'＋'.join(tot) or '額不明'}）: {lst}"
    else:
        don = "- 投げ銭 なし"
    who = Counter(m.group(2) for l in lines if (m := CHAT.match(l)))
    head = [f"# {start} {title}",
            f"- URL: https://www.youtube.com/watch?v={vid} / 長さ {sn.hms(end)}",
            "- 場所: （ここを埋める）",
            f"- チャット {len(lines)}件",
            don]
    return head, who.most_common(15), sn.last_time(tr)


def context(root: Path, stem: str, rows: dict) -> str:
    """前後の回の題名と「ひとことで」（旅の流れ。この回のことは字幕とチャットからだけ書かせる）"""
    order = sorted(rows.values(), key=lambda r: (r.get("start_jst") or "", r["name"]))
    names = [r["name"] for r in order]
    i = names.index(stem) if stem in names else len(names)
    out = []
    for r in order[max(0, i - NEAR):i] + order[i + 1:i + 1 + NEAR]:
        md = paths(root, r["name"])[2]
        text = md.read_text(encoding="utf-8") if md.exists() else ""
        title = sn.title_of(text) or r.get("start_jst") or r["name"]
        one = sn.section(text, "## ひとことで")[:160] if text else ""
        out.append(f"- {title}" + (f" — {one}" if one else ""))
    return "\n".join(out) or "（なし）"


def places(root: Path) -> str:
    p = root / "python/data/guide/cities.json"
    if not p.exists():
        return "（なし）"
    cities = json.loads(p.read_text(encoding="utf-8"))
    out = []
    for c in cities.get("countries", {}).values():
        for cv in c.get("cities", {}).values():
            out += list(cv.get("places", {}))
    return "、".join(out) or "（なし）"


def rules(root: Path) -> str:
    skill = (root / ".claude/skills/stream-notes/SKILL.md").read_text(encoding="utf-8")
    return skill.split("## 2. 議事録の形", 1)[1].split("## 3. ", 1)[0]


def limits(row: dict) -> tuple[int, int, int, int]:
    """(目安, 下限, 上限, 頼む字数)。下限・上限は stream_notes.check_one と同じ決めかた"""
    c = row["chars_i"]
    tgt = sn.target_chars(c)
    lo, hi = int(tgt * sn.LOW), int(tgt * sn.HIGH)
    if c * 0.25 < 600:
        lo = 0
    return tgt, lo, hi, max(lo, int(round(tgt * ASK, -1)))


def build(root: Path, stem: str, row: dict, rows: dict) -> tuple[str, list[str], str]:
    """1枚（字幕とチャットは伏せたもの）・頭の5行・伏せた材料だけ（伏せ残しを探す先）"""
    tr, ch, _ = paths(root, stem)
    head, who, _ = header(root, stem, row)
    tgt, lo, hi, ask = limits(row)
    t, tb = mask_transcript(tr.read_text(encoding="utf-8")) if tr.exists() else ("（字幕なし。チャットだけから短く書く）", [])
    c, cb = mask_chat(ch.read_text(encoding="utf-8")) if ch.exists() else ("（チャットなし）", [])
    sample = (root / SAMPLE).read_text(encoding="utf-8") if (root / SAMPLE).exists() else ""
    p = f"""# 議事録の決まり（これに従う）
{rules(root)}

# 見本（形と密度をこれに合わせる。中身は別の回）
{sample}

# この回の前後（旅の流れ。誤変換の地名・人名を読み直す手がかり。この回のことは字幕とチャットからだけ書く）
{context(root, stem, rows)}

# 島で使っている場所の名前（字幕の崩れた地名を読み直すとき）
{places(root)}

# この回の字幕（{len(t)}字。全部読む。〇〇 は伏せた字）
{t}

# この回のチャット（全部読む。〇〇 は伏せた字）
{c}

# 書くもの
この回の議事録を Markdown で1本。頭の5行は次のとおり**そのまま写す**（「場所」の行だけ、その日に回った場所を「国・街（回った所を順に）」で埋める）:

{chr(10).join(head)}

チャットの件数の多い人（参考。「視聴者さん」の欄に使ってよい）: {"、".join(f"{n} {k}件" for n, k in who) or "なし"}

- 見出しは `## ひとことで` `## 流れ` `## 視聴者さん` `## 持ち越し・決まったこと` の4つ。流れの中は `### [h:mm:ss] 見出し` と `- [h:mm:ss] …` の箇条
- **本文（頭の `# ` の行と `- ` の5行を除いた全部）は、およそ {ask}字。{lo}字より短くしない・{tgt}字を越えない**（{hi}字を越えると書き直しになる。迷ったら短く）
- 時刻は字幕の時刻。最後は {sn.hms(sn.last_time(tr) or 0)} を越えない
- 投げ銭は頭に全部並べてある。本文で触れるときは @名前 ¥額
- 視聴者さんの素性（生年月日・本名・住んでいる所・学校・年齢・職場）は、本人が言っていても書かない。〇〇 を書かない。歌詞を写さない
- 字幕に無いことを書かない。推し量ったことは「〜らしい」。誤変換は文脈・チャット・地名で読み直し、読めない語は書かない
- 店・場所・料理・人の名前は、字幕かチャットか上の場所の名前に在るものだけ。自分の知識で名前を足さない（道具が字幕と突き合わせる）
"""
    return p, head, "\n".join(tb + cb)


def fix_prompt(draft: str, why: list[str], row: dict, names: list[str] | None = None) -> str:
    """下書きだけで直せる直し（削る・形・素性・字幕に無い名前）。字幕とチャットは渡さない"""
    tgt, lo, hi, ask = limits(row)
    n = sn.body_chars(draft)
    msg = [f"# 直すこと（{'／'.join(why)}）"]
    if n > hi:
        msg.append(f"本文がいま {n}字で、{hi}字を越えている。{ask}字前後まで、約 {n - ask}字を削る。"
                   "同じ話の繰り返し・細かい言い回し・相づちのコメントを詰める（企画・約束・事件・初めて来た人は残す）。")
    if names:
        msg.append(f"次の名前は、この回の字幕・チャット・前後の回・島の場所の名前のどこにも無い: {'、'.join(names)}。"
                   "字幕に無い名前は書かない決まり。消すか、名前を使わない言いかた（「駅前の店」など）に替える。"
                   "前後の文はそのまま残す。")
    msg.append("下書きに無いことを足さない。時刻・名前・額は下書きのまま。視聴者さんの素性（生年月日・本名・住んでいる所・"
               "学校・年齢・職場）が書いてあれば消す。〇〇 は書かない。")
    msg.append("直した議事録の全体を、頭の5行から返す。前置きは付けない。")
    return "\n".join(msg) + "\n\n# 下書き\n" + draft


def more_prompt(n: int, row: dict, names: list[str] | None = None) -> str:
    """足りないとき（同じ会話の続きで。字幕とチャットが要る）"""
    tgt, lo, hi, ask = limits(row)
    drop = (f"また、次の名前は字幕とチャットに無いので、消すか名前を使わない言いかたに替える: {'、'.join(names)}。"
            if names else "")
    return (f"本文がいま {n}字で、{lo}字に届かない。{ask}字前後まで、約 {ask - n}字を足す。字幕とチャットから漏れている"
            f"出来事を時刻つきで足す（膨らませるための字は入れない）。{drop}直した議事録の全体を、頭の5行から返す。前置きは付けない。")


def tidy(txt: str, head: list[str]) -> str:
    """囲みと前置きを落とし、頭を機械で組んだ5行に差し替える（場所の行だけ返事のを使う）"""
    txt = re.sub(r"^```(?:markdown|md)?\s*|\s*```\s*$", "", txt.strip())
    lines = txt.splitlines()
    # 題の行（`# ` で始まる1行目）より前は前置き。題の行が無ければ、頭の `- ` の行か最初の `## ` から
    i = next((n for n, l in enumerate(lines) if l.startswith("# ")), None)
    if i is None:
        i = next((n for n, l in enumerate(lines) if l.startswith(("- ", "## "))), 0)
        lines = lines[i:]
    else:
        lines = lines[i + 1:]
    j = 0
    got = []
    while j < len(lines) and lines[j].startswith("- "):
        got.append(lines[j])
        j += 1
    place = next((l for l in got if l.startswith("- 場所:")), head[2])
    return "\n".join([head[0], head[1], place, head[3], head[4]] + lines[j:]).rstrip() + "\n"


# ---------------------------------------------------------------- 呼ぶ

def usage_of(raw: dict) -> dict:
    mu = raw.get("modelUsage") or {}
    keys = ("inputTokens", "cacheReadInputTokens", "cacheCreationInputTokens", "outputTokens")
    return {k: sum(v.get(k) or 0 for v in mu.values()) for k in keys}


def call_model(prompt: str, model: str, timeout: int, cwd: str, resume: str | None = None, keep: bool = True) -> dict:
    """`claude -p` を1回。道具・MCP・スラッシュコマンドを持たせず、リポジトリの外の空の置き場で起こす
    （CLAUDE.md を拾わせない。続きを頼むときは同じ置き場が要る）。見張りはここを偽物に差し替える"""
    cmd = ["claude", "-p", "--system-prompt", SYSTEM, "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
           "--output-format", "json", "--model", model]
    if resume:
        cmd += ["--resume", resume]
    if not keep:
        cmd += ["--no-session-persistence"]
    r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=cwd, check=False)
    try:
        return json.loads(r.stdout)
    except ValueError:
        return {"is_error": True, "result": (r.stdout + r.stderr)[-1500:]}


def place_ng(draft: str) -> list[str]:
    """頭の「場所」の行が在って、埋まっているか（tidy は返事に場所の行が無ければ「（ここを埋める）」を置く）"""
    head = draft.partition("\n## ")[0]
    line = next((l for l in head.splitlines() if l.startswith("- 場所:")), "")
    return [] if line.removeprefix("- 場所:").strip() not in ("", "（ここを埋める）") else ["頭の「場所」が埋まっていない"]


def judge(draft: str, stem: str, row: dict, root: Path, known: str = "", common: set[str] | None = None
          ) -> tuple[list[str], list[str]]:
    """(NG の札, 字幕に無い名前)。check_one（字幕・チャットの隣に置いて数える）・場所の行・素性・字幕に無い名前"""
    tr, ch, _ = paths(root, stem)
    with tempfile.TemporaryDirectory(prefix="notes-judge-") as d:
        for p in (tr, ch):
            if p.exists():
                (Path(d) / p.name).symlink_to(p.resolve())
        md = Path(d) / (stem + ".md")
        md.write_text(draft, encoding="utf-8")
        ng = sn.check_one(md, row["chars_i"])
    ng += place_ng(draft)
    ng += [f"素性（{t}）" for t in note_leaks(draft)]
    names = unknown_names(draft, known, common or set()) if known else []
    if len(names) > NAMES_MAX:
        # 札には数だけ（名前は直しの1枚にだけ渡す。出力は公開のログに残りうる）
        ng.append(f"字幕に無い名前 {len(names)}個（{NAMES_MAX}個まで）")
    return ng, names


def write_one(root: Path, stem: str, a, rows: dict) -> dict:
    rec = {"stem": stem, "calls": [], "note": "", "rc": 0}
    row = rows.get(stem)
    tr, ch, md = paths(root, stem)
    if row is None or not (tr.exists() or ch.exists()):
        rec.update(note="材料が無い", rc=2)
        return rec
    if md.exists() and not a.force and not a.prompt_only:
        rec.update(note="もう在る（--force で書き直す）")
        return rec
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    prompt, head, material = build(root, stem, row, rows)
    (out / f"{stem}.prompt.txt").write_text(prompt, encoding="utf-8")
    leak = identity_leaks(material)
    if leak:
        rec.update(note=f"1枚に素性が残った（{'・'.join(leak)}）。呼ばない", rc=2)
        return rec
    if a.prompt_only:
        rec.update(note=f"組んだ（{len(prompt):,}字）: {out / (stem + '.prompt.txt')}")
        return rec
    known, common = known_text(root, stem, rows), common_words(root)
    t0 = time.time()
    with tempfile.TemporaryDirectory(prefix="notes-writer-") as cwd:
        raw = call_model(prompt, a.model, a.timeout, cwd)
        sid = raw.get("session_id")
        draft, ng = "", ["呼べなかった"]
        for k in range(1 + FIXES):
            u = usage_of(raw)
            rec["calls"].append({"usage": u, "tokens": sum(u.values()), "cost": raw.get("total_cost_usd") or 0,
                                 "secs": (raw.get("duration_ms") or 0) / 1000})
            if raw.get("is_error") or not isinstance(raw.get("result"), str):
                rec.update(note="呼べなかった: " + str(raw.get("result"))[-200:].replace("\n", " "), rc=1)
                break
            draft = tidy(raw["result"], head)
            (out / f"{stem}.draft{k}.md").write_text(draft, encoding="utf-8")
            ng, names = judge(draft, stem, row, root, known, common)
            # 控えには名前の数と NG の札だけ（名前そのものは控えの .names.txt に。git にも出力にも入れない）
            rec["calls"][-1].update(body=sn.body_chars(draft), names=len(names), ng=list(ng))
            (out / f"{stem}.draft{k}.names.txt").write_text("\n".join(names) + "\n", encoding="utf-8")
            if not ng or k == FIXES:
                break
            n = sn.body_chars(draft)
            _, lo, _, _ = limits(row)
            over = names if len(names) > NAMES_MAX else None
            if n < lo and sid:
                raw = call_model(more_prompt(n, row, over), a.model, a.timeout, cwd, resume=sid)
            else:
                raw = call_model(fix_prompt(draft, ng, row, over), a.model, a.timeout, cwd, keep=False)
    rec["secs"] = round(time.time() - t0)
    rec["body"] = sn.body_chars(draft) if draft else 0
    if rec["rc"]:
        return rec
    if ng:
        leaked = any(x.startswith("素性") for x in ng)
        rec.update(note=("置かない: " + "／".join(ng))[:300], rc=2 if leaked else 1)
        return rec
    if not a.no_write:
        md.write_text(draft, encoding="utf-8")
        # 置いた場所でも数え直す（stream_notes.py check と同じ関数）
        again = sn.check_one(md, row["chars_i"])
        if again:
            md.unlink()
            rec.update(note="置いた場所で check が落ちた: " + "／".join(again), rc=1)
            return rec
    rec["note"] = "置いた" if not a.no_write else "通った（置かない）"
    return rec


def summary(rec: dict) -> str:
    calls = rec["calls"]
    if not calls:
        return f"{rec['stem']}  {rec['note']}"
    tok = sum(c["tokens"] for c in calls)
    cost = sum(c["cost"] for c in calls)
    return (f"{rec['stem']}  {rec['note']}  呼んだ {len(calls)}回  本文 {rec.get('body', 0):,}字  "
            f"{tok:,}トークン  {cost:.2f}ドル  {rec.get('secs', 0)}秒")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("stems", nargs="*")
    ap.add_argument("--pending", action="store_true", help="まだ議事録の無い回を全部（--month で絞る）")
    ap.add_argument("--month", type=sn.month_arg)
    ap.add_argument("--out", required=True, help="控え（渡した1枚・下書き）を置く場所。スクラッチパッドの下")
    ap.add_argument("--runs", help="1回1行の控え（.jsonl）に足す（トークンと時間）")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--jobs", type=int, default=1, help=f"並べて回す本数（{JOBS_MAX}まで）")
    ap.add_argument("--force", action="store_true", help="もう在る議事録を書き直す")
    ap.add_argument("--no-write", action="store_true", help="streams/ に置かない（控えだけ）")
    ap.add_argument("--prompt-only", action="store_true", help="1枚を組んで控えに置くだけ（呼ばない）")
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args(argv)
    root = Path(a.root)
    rows = rows_of(root)
    stems = list(a.stems) + ([n for n, _, _ in sn.pending(root / "streams", a.month)] if a.pending else [])
    if not stems:
        print("::error::書く回が無い")
        return 2
    jobs = max(1, min(a.jobs, JOBS_MAX))
    with cf.ThreadPoolExecutor(max_workers=jobs) as ex:
        recs = list(ex.map(lambda s: write_one(root, s, a, rows), stems))
    for rec in recs:
        print(summary(rec))
        if a.runs:
            with open(a.runs, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    calls = [c for r in recs for c in r["calls"]]
    if calls:
        n = sum(1 for r in recs if r["calls"])
        print(f"\n{len(recs)}本 / 置いた {sum(1 for r in recs if r['note'] == '置いた')}本 / 呼んだ {len(calls)}回"
              f" / 1本あたり {sum(c['tokens'] for c in calls) // n:,}トークン・{sum(c['cost'] for c in calls) / n:.2f}ドル"
              f"・{sum(r.get('secs', 0) for r in recs) / n:.0f}秒")
    rcs = {r["rc"] for r in recs}
    return 2 if 2 in rcs else (1 if 1 in rcs else 0)


if __name__ == "__main__":
    sys.exit(main())
