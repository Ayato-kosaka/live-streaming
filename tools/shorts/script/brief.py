#!/usr/bin/env python3
"""**作文者と批評役に渡す「1枚」を作る。** 帳面・参考・7.4 節・配信の書き起こしを、担当が自分で全部読みに行かないように。

    # 作文者へ（書く前）: 配信の区間・帳面の要約・写す参考の拍・3列の表の雛形
    python3 tools/shorts/script/brief.py writer --video TDArug_te90 --range 2:38:00-3:00:30 --ref vJo --ref HPJ \\
        --about "城塞の夕日に間に合うか → 野良犬" --lines 20 -o <scratch>/brief_writer.md

    # 批評役へ（関所）: 雛形（references/critic_prompt.md）に、原稿の表・lint の結果・帳面の要約・参考の拍を差し込む
    python3 tools/shorts/script/brief.py critic shorts/videos/TDArug_te90/p1/script.txt --ref vJo \\
        --about "…" -o <scratch>/critic_prompt.md

終了コード 0=書けた / 2=原稿・配信の書き起こし・参考の節が見つからない。

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
STREAMS = ROOT / "streams"
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


def fill(tmpl: str, values: dict) -> str:
    body = tmpl.split("<!-- ここから下が、担当に渡る字 -->", 1)[-1].lstrip("\n")
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


def main() -> int:
    ap = argparse.ArgumentParser(description="作文者・批評役に渡す1枚を作る")
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
    for p in (w, c):
        p.add_argument("--ref", action="append", default=[], help="写す参考の略号（reference_beats.md の節。何回でも）")
        p.add_argument("--about", default="", help="何の動画か・狙い（1〜3行）")
        p.add_argument("-o", "--out", help="書き出す先（無ければ標準出力）")
    a = ap.parse_args()
    try:
        if a.who == "critic":
            text = build_critic(Path(a.script), Path(a.spec) if a.spec else None, a.ref, a.about)
        else:
            text = build_writer(a.video, a.range, a.ref, a.about, a.lines, a.chat, a.extra)
    except (OSError, KeyError, ValueError) as e:
        print(f"作れない: {e}", file=sys.stderr)
        return 2
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print(f"{a.out}（{len(text):,}字）")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
