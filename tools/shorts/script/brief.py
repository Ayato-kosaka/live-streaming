#!/usr/bin/env python3
"""**作文者と批評役に渡す「1枚」を作る。** 帳面・参考・7.4 節・配信の書き起こしを、担当が自分で全部読みに行かないように。

    # 作文者へ（書く前）: 配信の区間・帳面の要約・写す参考の拍・3列の表の雛形
    python3 tools/shorts/script/brief.py writer --video TDArug_te90 --range 2:38:00-3:00:30 --ref vJo --ref HPJ \\
        --about "城塞の夕日に間に合うか → 野良犬" --lines 20 -o <scratch>/brief_writer.md

    # 批評役へ（関所）: 雛形（references/critic_prompt.md）に、原稿の表・lint の結果・帳面の要約・参考の拍を差し込む
    python3 tools/shorts/script/brief.py critic shorts/videos/TDArug_te90/p1/script.txt --ref vJo \\
        --about "…" -o <scratch>/critic_prompt.md

    # 本編集の担当へ: 雛形（references/editor_prompt.md）に、原稿の表・素材の表・帳面の画・音・投稿の項目・企画の節の地図を差し込む
    python3 tools/shorts/script/brief.py edit --episode shorts/videos/france-2025 --pattern A \\
        --about "…" --scratch <scratch> -o <scratch>/brief_edit.md
    python3 tools/shorts/script/brief.py edit --episode … --voice-lines shorts/videos/<回>/p1/voice_lines_A.json   # 声に渡す字の雛形

終了コード 0=書けた / 2=原稿・配信の書き起こし・参考の節が見つからない（edit は、雛形の呼び出しが道具と食い違うときも）。

## なぜ1枚にするか（#1011、帳面 F-044）

2026-10-21 のフランス周遊では、批評役1人が毎回、帳面の全文（44項目）・参考の書き起こし全文（2本で約4万字）・7.4 節を読み、
1人 約14〜19万トークン・6〜12分を使った（`tools/shorts/cost/tally.py`）。点は批評役ごとに揺れた。
読む量の大半は、その原稿に効かない項目と、写さない言い回しだった。ここで**原稿の段に効く所だけ**を1枚に寄せる。

## 何を入れるか

- **帳面の要約**: 分類が「題・言い回し・事実・構成」の項目を、題（決まりの1行）＋直す前 → 直した後の最初の1組で1〜2行ずつ。
  帳面から毎回作り直すので、項目が増えても手で直さない。批評役には「機械が見る項目」（当てる場所が `lint:` だけ）を名前だけにして、
  読んで当てる項目（批評役 (h)・(i)）を全文で渡す
- **参考の拍**: `references/reference_beats.md` の節（他人の台本の全文は公開リポジトリに置かない。要約だけ）
- **配信の書き起こし**: `streams/` の自動字幕（30秒ごと）の、指定の区間だけ。チャットは名前を落として本文だけ（`--chat`）
- **3列の表の雛形**（`script_writing.md` 0.8）

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
import re
import subprocess
import sys
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

# 原稿の段に効く分類（画・音・投稿・進め方は、書き出しと投稿の段で当てる）
SCRIPT_CATS = ("題", "言い回し", "事実", "構成")
CPS = 6.8      # 上限の倍率 1.4 で読んだ毎秒の字（`script_writing.md` 6・`storyboard.py`）
GAP = 0.3      # 行の間（秒）
CARD = 4.0     # 題の札を消す秒（帳面 F-015）
# あやとが書いた字・決めた字（spec の why）。関所はこの行を落とす理由にしない（`script_writing.md` 7.3。まとめ役が裁く）
AYATO = re.compile(r"あやとの(題|書き足し|字)|あやと\s*#\d+\s*「")
TIME = re.compile(r"^\[(\d+):(\d\d):(\d\d)\]\s*(.*)$")


# ---------- 帳面 ----------

def first_pair(text: str, width: int = 90) -> str:
    """「直す前 → 直した後」の最初の1組を、width 字までに。"""
    # 組と組のあいだは「 ／ 」（前後に空白）。引用の中の「／」（行の区切り）では切らない
    s = re.split(r"\s+／\s+", text.strip())[0]
    s = re.sub(r"\s+", " ", s)
    return s if len(s) <= width else s[: width - 1] + "…"


def ledger_items(led=None, cats=SCRIPT_CATS) -> list:
    led = led or ledger_mod.load()
    return [it for it in led.items.values() if it.category in cats]


def machine_only(it) -> bool:
    """当てる場所が `lint:` だけ（批評役も人の目も名指していない）。"""
    return bool(it.lint) and "批評役" not in it.place and ledger_mod.HUMAN not in it.place


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


def ledger_block(for_critic: bool, led=None, avoid: list | None = None) -> str:
    """帳面の要約。`avoid`（いま見る原稿の行）を引いている例は、題だけ残して例を落とす。

    **その原稿の行が帳面に「ダメな例」として載っていると、批評役は決まりではなく例との一致で落とす。**
    対照（銅像 p2 は帳面 F-039・F-040 の例そのもの）が答えを見て落ちるので、雛形の良し悪しを測れなくなる。
    同じ原稿を二度見ることは本番では無いので、落としても失うものは無い。
    """
    items = ledger_items(led)
    out = []
    machine = [it for it in items if machine_only(it)] if for_critic else []
    for it in items:
        if it in machine:
            continue
        times = f"（{it.times}回）" if it.times > 1 else ""
        lint = f" ［lint: {'・'.join(sorted(it.lint))}］" if it.lint else ""
        raw = it.fields.get("直す前 → 直した後", "")
        if avoid and quotes_script(raw, avoid):
            out.append(f"- **{it.id}**（{it.category}）{it.title}{times}{lint}")
            continue
        out.append(f"- **{it.id}**（{it.category}）{it.title}{times}{lint}\n  例: {first_pair(raw)}")
    if machine:
        out.append("- 機械だけが見る（lint の結果に出る。読んで当てなくてよい）: "
                   + "・".join(f"{it.id} {it.title[:18]}…" for it in machine))
    return "\n".join(out)


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


def stream_file(video: str, kind: str) -> Path:
    hits = sorted(STREAMS.rglob(f"*_{video}.{kind}.txt"))
    if not hits:
        raise FileNotFoundError(f"streams/ に {video} の {kind} が無い")
    return hits[0]


def cut(path: Path, ranges: list, step: int = 30, chat: bool = False) -> list:
    """`[h:mm:ss] 文` の行のうち、区間に掛かるものだけ。チャットは名前を落として本文だけにする。"""
    out = []
    for ln in path.read_text(encoding="utf-8").splitlines():
        m = TIME.match(ln)
        if not m:
            continue
        t = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        if not any(a - step < t <= b for a, b in ranges):
            continue
        body = m.group(4)
        if chat:
            # `名前: 本文` / `¥500 名前: 本文`。視聴者さんの名前は、どこにも出さない（SKILL.md 2）
            money = re.match(r"^([¥$€£][\d,]+)\s+", body)
            rest = body[money.end():] if money else body
            rest = rest.split(": ", 1)[1] if ": " in rest else rest
            body = (money.group(1) + " " if money else "") + rest
        out.append(f"[{m.group(1)}:{m.group(2)}:{m.group(3)}] {body}")
    return out


# ---------- 原稿の表 ----------

def rows_of(script: Path, spec: Path | None) -> tuple:
    """原稿の行と、spec の行（無ければ空の辞書）。"""
    c = lint_mod.build(script, spec=spec)
    rows = c.rows or [{} for _ in c.lines]
    if len(rows) != len(c.lines):
        rows = [{} for _ in c.lines]
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
    return "".join(m)


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


def lint_block(script: Path, spec: Path | None) -> str:
    r = subprocess.run([sys.executable, str(HERE / "lint.py"), str(script)] + (["--spec", str(spec)] if spec else []),
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


def build_critic(script: Path, spec: Path | None, refs: list, about: str) -> str:
    c, rows = rows_of(script, spec)
    sp = spec or lint_mod.spec_for(script)
    return fill(CRITIC_TMPL.read_text(encoding="utf-8"), {
        "about": about.strip() or "（まとめ役が1〜3行で書く: 誰の何の配信か・この案の狙い）",
        "n": str(len(c.lines)),
        "table": script_table(c, rows),
        "lint": lint_block(script, sp if sp.exists() else None),
        "ledger": ledger_block(for_critic=True, avoid=c.lines),
        "refs": beats(refs) if refs else "（参考の指定なし）",
    })


def table_template(n: int, lines: list | None = None) -> str:
    head = ["| # | 原稿 | つなぎ | 聞いた直後の頭の中 | 向き |", "| ---: | --- | --- | --- | --- |"]
    rows = []
    for i in range(1, n + 1):
        ln = lines[i - 1] if lines and i <= len(lines) else ""
        tsu = "題" if i == 1 else ""
        rows.append(f"| {i} | {ln} | {tsu} |  |  |")
    return "\n".join(head + rows)


def build_writer(video: str | None, ranges: list, refs: list, about: str, n: int, chat: bool,
                 extra: list) -> str:
    parts = []
    if video and ranges:
        rs = parse_ranges(ranges)
        tr = stream_file(video, "transcript")
        parts.append(f"自動字幕（{tr.relative_to(ROOT)}、30秒ごと）:\n\n```\n" + "\n".join(cut(tr, rs)) + "\n```")
        if chat:
            ch = stream_file(video, "chat")
            parts.append("チャット（名前は落とした。出来事の15〜35秒あとに付く）:\n\n```\n" + "\n".join(cut(ch, rs, 0, chat=True)) + "\n```")
    for p in extra:
        parts.append(f"{Path(p).name}:\n\n```\n" + Path(p).read_text(encoding="utf-8").strip() + "\n```")
    return fill(WRITER_TMPL.read_text(encoding="utf-8"), {
        "about": about.strip() or "（まとめ役が1〜3行で書く: どの配信のどの出来事か・企画の型・伝えたいこと）",
        "source": "\n\n".join(parts) or "（区間の指定なし。`--video` と `--range` を渡す）",
        "ledger": ledger_block(for_critic=False),
        "refs": beats(refs) if refs else "（参考の指定なし。`references/reference_beats.md` の頭の選びかたで決める）",
        "table": table_template(n),
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
    """この回が使う配信の videoId（回の置き場の名前・spec の `_note`・行の video / src_video）。"""
    cand = [vdir.parent.name]
    if spec:
        cand.append(str(spec.get("_note", "")))
        cand += [json.dumps(r.get(k), ensure_ascii=False) for r in spec.get("rows", []) for k in ("video", "src_video") if r.get(k)]
    out = []
    for s in cand:
        out += [v for v in VID.findall(s) if v not in out]
    return out


def material_block(vdir: Path, spec: dict | None, excerpt: str, scratch: str | None) -> str:
    parts = []
    if spec and spec.get("_note"):
        parts.append(f"- 時間軸（spec の `_note`）: {short(str(spec['_note']), 700)}")
    ids = stream_ids(vdir, spec)
    if ids:
        have = [v for v in ids if (WORK / v / "clips/manifest.json").exists()]
        parts.append(f"- 配信: {'・'.join(ids)}。作業枝の暗号文（`shorts/.work/<videoId>/clips/`）: "
                     + (f"在る {'・'.join(have)}" if have else "無い（下ろしてある。下の表の clips のコミットの木から開く）"))
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
    parts.append("- コマ一覧: 開いた clips の `sheets/`（取り込みが作る、区間ごとの2秒おきの一覧）。まだ無ければ下の 1 の ffmpeg で作る")
    return "\n".join(parts) + "\n\n" + excerpt


# 声

def voice_lines(spec: dict) -> list:
    """声に渡す字の雛形（`tools/shorts/voice/` の lines_in の形）。かなに直すのは担当が `tts_text` を書き換えて。"""
    sid = spec.get("id") or "A"
    out = []
    for n, r in enumerate(spec["rows"], 1):
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


def suggest_name(vdir: Path, sid: str, qa: Path) -> str:
    """書き出しの名前の案（回の頭3字-案-次の版）。版は検査の記録に出てくる v<数> のいちばん大きいものの次。"""
    base = re.sub(r"[^a-z0-9]", "", vdir.parent.name.lower())[:3] or "sh"
    vs = [int(x) for x in re.findall(r"(?<![A-Za-z0-9])v(\d+)(?![0-9])", qa.read_text(encoding="utf-8"))] if qa.exists() else []
    return f"{base}-{re.sub(r'[^a-z0-9]', '', sid.lower())}-v{max(vs, default=0) + 1}"


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
    S = scratch or "<スクラッチパッド>"
    bgm = ((spec or {}).get("bgm") or {}).get("path") or f"{S}/bgm/pocket_csikos.mp3"

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
        where.append("- あやとの決定（企画の頭）:\n" + "\n".join("  " + ln for ln in dec.splitlines()))
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
        "scratch": S, "key": f"{S}/keys/ref_private.pem", "bgm": bgm, "name": name, "sid": sid,
        "ep": rel(vdir), "pat_arg": f" --pattern {pattern}" if pattern else "",
        "spec": rel(files["spec"]), "ov": rel(files["上書き"]), "edit": rel(files["指示書"]),
        "vl": rel(files["声の字"]), "qa": rel(files["検査の記録"]),
    })


def main() -> int:
    ap = argparse.ArgumentParser(description="作文者・批評役・本編集の担当に渡す1枚を作る")
    sub = ap.add_subparsers(dest="who", required=True)
    w = sub.add_parser("writer", help="作文者へ（書く前）")
    w.add_argument("--video", help="配信の videoId（streams/ の書き起こしから切る）")
    w.add_argument("--range", action="append", default=[], help="H:MM:SS-H:MM:SS（何回でも）")
    w.add_argument("--chat", action="store_true", help="同じ区間のチャットも（名前は落とす）")
    w.add_argument("--extra", action="append", default=[], help="足す書き起こし（復号した whisper など、[H:MM:SS] 形式）")
    w.add_argument("--lines", type=int, default=18, help="3列の表の雛形の行数")
    c = sub.add_parser("critic", help="批評役へ（関所）")
    c.add_argument("script")
    c.add_argument("--spec", help="spec.json（既定は原稿の隣）")
    ed = sub.add_parser("edit", help="本編集の担当へ（声 → spec → 書き出し → 直す → 下見）")
    ed.add_argument("--episode", required=True, help="回の置き場（shorts/videos/<回> か、その版 p1）")
    ed.add_argument("--pattern", help="案（script_A.txt の A。案が1つの回は付けない）")
    ed.add_argument("--name", help="書き出しの名前（remote.py の --name。既定は検査の記録の版の次）")
    ed.add_argument("--scratch", help="作業の置き場（スクラッチパッド）。手元に開いた素材を探し、鍵・BGM の道を埋める")
    ed.add_argument("--voice-lines", help="1枚は作らず、声に渡す字の雛形を spec の tts_text からこの道に書く")
    for p in (w, c):
        p.add_argument("--ref", action="append", default=[], help="写す参考の略号（reference_beats.md の節。何回でも）")
    for p in (w, c, ed):
        p.add_argument("--about", default="", help="何の動画か・狙い（1〜3行）")
        p.add_argument("-o", "--out", help="書き出す先（無ければ標準出力）")
    a = ap.parse_args()
    try:
        if a.who == "critic":
            text = build_critic(Path(a.script), Path(a.spec) if a.spec else None, a.ref, a.about)
        elif a.who == "edit" and a.voice_lines:
            vdir, _, sfx = pick(Path(a.episode), a.pattern)
            items = voice_lines(json.loads((vdir / f"spec{sfx}.json").read_text(encoding="utf-8")))
            Path(a.voice_lines).write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"{a.voice_lines}（{len(items)}文・{sum(x['bytes'] for x in items):,}バイト）")
            return 0
        elif a.who == "edit":
            text = build_edit_brief(Path(a.episode), a.pattern, a.about, a.name, a.scratch)
        else:
            text = build_writer(a.video, a.range, a.ref, a.about, a.lines, a.chat, a.extra)
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
