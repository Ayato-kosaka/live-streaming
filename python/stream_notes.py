"""**配信の議事録（`streams/YYYY/MM/<stem>.md`）を、埋める・確かめる・目次にする道具。**

    python3 python/stream_notes.py pending [--month 2026-10]
    python3 python/stream_notes.py check [--month 2026-10] [stem ...]
    python3 python/stream_notes.py index --month 2026-10

手順と議事録の形の正は `.claude/skills/stream-notes/SKILL.md`。ここはその §1 の
1・3・4 段を機械にしたもの。標準ライブラリだけで動く（毎晩の箱でも、手元でも回せるように）。

## なぜ要るか

議事録はエージェントが1本ずつ手で書く。手で書くものは、黙って次の3つが起きる。

- **書き漏れ**: どの配信がまだかを人が覚えていると、月末に「無い回」に気づく
- **形の崩れ**: 見出しが違うと、目次を作る側・読む側（月末の担当）が拾えない
- **数の食い違い**: 投げ銭の件数を数え違える。時刻が字幕の外に出る（推し量りの印）

だから「まだの回」「形」「数」は人に数えさせず、ここで数える。
目次（`streams/YYYY/MM.md`）も手で書くと議事録とずれるので、議事録から作る。

終了コード: pending / index は 0。check は NG が1件でもあれば 1、
**確かめるものが1件も無ければ 2**（緑に見えて何も見ていない、を避ける）。
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STREAMS = ROOT / "streams"

# 目安字数（SKILL.md §2）。ふつうの回は約4,000字、字幕が短い回は字幕の25%（600字は割らない）。
# 長時間の回は 4万字を超えたぶんの5%を足す（上限8,000字）。4,000字に押し込むと漏れが出るから
TARGET_MAX = 4000
TARGET_RATIO = 0.25
TARGET_MIN = 600
LONG_FROM = 40000
LONG_RATIO = 0.05
LONG_MAX = 8000
# 目安からの許し幅。4,000字で 3,400〜4,800字（SKILL.md §2 の幅）になるように決めてある
LOW, HIGH = 0.85, 1.20

HEADINGS = ["## ひとことで", "## 流れ", "## 視聴者さん", "## 持ち越し・決まったこと"]

TIME = r"(-?\d+):(\d\d):(\d\d)"
# chat.txt の投げ銭の行は `[h:mm:ss] ¥500 @名前: 本文`、額が取れないときは `投げ銭`
# （python/stream_text.py の chat_line）。ふつうの行は時刻の直後に名前が来て、
# 名前のあとに `:` が付く。額は「数字を含み、`:` を含まない最初の語」で見分ける。
# 名前の頭は `@` とは限らない（チャンネル名のままの人もいる）ので、`@` では切らない。
# `PHP 100.00` のように通貨が字で前に付く形も拾えるように、頭の英大文字を許す
PAID_RE = re.compile(r"^\[" + TIME + r"\] (?:投げ銭|(?:[A-Z]{2,3} )?[^\s:\d]{0,4}\d[\d,.]*) \S")
LINE_TIME_RE = re.compile(r"^\[" + TIME + r"\]")
H3_TIME_RE = re.compile(r"^### \[" + TIME + r"\]")
# 頭の「- 投げ銭 11件（…）」。0件なら「投げ銭 なし」「投げ銭 0件」のどちらでもよい
DONATION_RE = re.compile(r"投げ銭\s*(?:(\d+)\s*件|(なし))")


def sec(h: str, m: str, s: str) -> int:
    neg = h.startswith("-")
    t = abs(int(h)) * 3600 + int(m) * 60 + int(s)
    return -t if neg else t


def hms(t: int) -> str:
    return f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}"


def target_chars(transcript_chars: int) -> int:
    """目安字数（議事録の本文の字数）。c は字幕の字数。"""
    c = transcript_chars
    if c > LONG_FROM:
        t = min(LONG_MAX, TARGET_MAX + (c - LONG_FROM) * LONG_RATIO)
    else:
        t = min(TARGET_MAX, max(TARGET_MIN, c * TARGET_RATIO))
    return int(round(t))


def body_chars(text: str) -> int:
    """頭（`# ` の題の行と、その直下に続く `- ` の行）を除いた本文の字数。

    頭は URL・場所・投げ銭の一覧で、回の中身と関係なく200字ほどになる。
    これを含めて数えると、目安600字の短い回は頭だけで上限を越えてしまう。
    """
    lines = text.splitlines(keepends=True)
    i = 0
    if i < len(lines) and lines[i].startswith("# "):
        i += 1
        while i < len(lines) and lines[i].startswith("- "):
            i += 1
    return len("".join(lines[i:]))


# ---------------------------------------------------------------- 一覧

def read_manifest(root: Path) -> list[dict]:
    """manifest.tsv を新しい順に。列は名前で読む（列が後ろに足されても崩れないように）。"""
    p = root / "manifest.tsv"
    if not p.exists():
        return []
    with p.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    out = []
    for r in rows:
        rel = (r.get("stem") or "").strip()
        if not rel:
            continue
        r["rel"] = rel                       # 2026/10/2026-10-18_2202_xxx
        r["name"] = rel.rsplit("/", 1)[-1]   # 2026-10-18_2202_xxx
        r["chars_i"] = _int(r.get("chars"))
        r["chat_i"] = _int(r.get("chat_count"))
        out.append(r)
    out.sort(key=lambda r: (r.get("start_jst") or "", r["name"]), reverse=True)
    return out


def _int(s) -> int:
    try:
        return int(str(s).strip())
    except (TypeError, ValueError):
        return 0


def in_month(r: dict, month: str | None) -> bool:
    return not month or (r.get("start_jst") or "").startswith(month)


def md_path(root: Path, r: dict) -> Path:
    return root / (r["rel"] + ".md")


def has_material(r: dict) -> bool:
    """議事録を書ける材料があるか。字幕が無くても、チャットがあればチャットだけから書く（SKILL.md §3）。"""
    cap = (r.get("caption") or "").strip()
    return cap == "ok" or (cap == "none" and r["chat_i"] > 0)


# ---------------------------------------------------------------- pending

def pending(root: Path, month: str | None) -> list[tuple[str, int, int]]:
    out = []
    for r in read_manifest(root):
        if in_month(r, month) and has_material(r) and not md_path(root, r).exists():
            out.append((r["name"], r["chars_i"], target_chars(r["chars_i"])))
    return out


# ---------------------------------------------------------------- check

def count_paid(chat: Path) -> int:
    if not chat.exists():
        return 0
    n = 0
    for line in chat.read_text(encoding="utf-8").splitlines():
        # メンバー加入の行（`（メンバー）名前:`）は額の語を持たないので PAID_RE に掛からない
        if PAID_RE.match(line):
            n += 1
    return n


def last_time(transcript: Path) -> int | None:
    if not transcript.exists():
        return None
    last = None
    for line in transcript.read_text(encoding="utf-8").splitlines():
        m = LINE_TIME_RE.match(line)
        if m:
            t = sec(*m.groups())
            last = t if last is None else max(last, t)
    return last


def header_block(text: str) -> str:
    """最初の `## ` より上（題名と、頭の箇条）。投げ銭の件数はここに書く決まり。"""
    return text.split("\n## ", 1)[0]


def check_one(md: Path, transcript_chars: int | None = None) -> list[str]:
    """議事録1本の NG の理由を並べる。空なら OK。"""
    base = md.with_suffix("")  # …/<stem>
    transcript = base.parent / (base.name + ".transcript.txt")
    chat = base.parent / (base.name + ".chat.txt")
    if not md.exists():
        return ["議事録が無い"]
    text = md.read_text(encoding="utf-8")
    why = []

    # (a) 字数
    if transcript_chars is None:
        transcript_chars = len(transcript.read_text(encoding="utf-8")) if transcript.exists() else 0
    tgt = target_chars(transcript_chars)
    lo, hi = int(tgt * LOW), int(tgt * HIGH)
    # 下限600字に引き上げられた回（字幕の25%が600に届かない）は、材料そのものが
    # 薄いので下を見ない。3分・チャット1件の回を600字に膨らませると決まりに反する
    if transcript_chars * 0.25 < 600:
        lo = 0
    n = body_chars(text)
    if not lo <= n <= hi:
        why.append(f"本文 {n}字 が目安 {tgt}（{lo}〜{hi}）の外")

    # (b) 見出し
    lines = text.splitlines()
    if not any(l.startswith("# ") for l in lines):
        why.append("見出し `# ` が無い")
    for h in HEADINGS:
        if not any(l.strip() == h for l in lines):
            why.append(f"見出し `{h}` が無い")

    # (c) 投げ銭の件数
    paid = count_paid(chat)
    m = DONATION_RE.search(header_block(text))
    if not m:
        why.append(f"頭に「投げ銭 N件」が無い（chat.txt は {paid}件）")
    else:
        said = 0 if m.group(2) else int(m.group(1))
        if said != paid:
            why.append(f"投げ銭 {said}件 と書いてあるが chat.txt の額付きの行は {paid}件")

    # (d) 時刻が字幕の外に出ていないか（出ていれば、字幕に無いことを書いた印）
    end = last_time(transcript)
    if end is not None:
        over = [hms(sec(*mm.groups())) for l in lines if (mm := H3_TIME_RE.match(l))
                and sec(*mm.groups()) > end]
        if over:
            why.append(f"見出しの時刻 {', '.join(over)} が字幕の最後 {hms(end)} を越える")
    return why


def resolve(root: Path, arg: str, by_name: dict[str, dict]) -> tuple[Path, int | None]:
    """stem でも、.md / 材料のパスでも受ける。"""
    name = Path(arg).name
    for suf in (".md", ".transcript.txt", ".chat.txt"):
        if name.endswith(suf):
            name = name[: -len(suf)]
    r = by_name.get(name)
    if r:
        return md_path(root, r), r["chars_i"]
    p = Path(arg)
    if p.suffix == ".md":
        return p, None
    # 一覧に無い stem は、日付から置き場を組み立てる（YYYY-MM-DD_…）
    m = re.match(r"(\d{4})-(\d{2})-", name)
    if m:
        return root / m.group(1) / m.group(2) / (name + ".md"), None
    return p.with_suffix(".md"), None


def check(root: Path, month: str | None, stems: list[str]) -> int:
    rows = read_manifest(root)
    by_name = {r["name"]: r for r in rows}
    targets: list[tuple[str, Path, int | None]] = []
    if stems:
        for s in stems:
            p, c = resolve(root, s, by_name)
            targets.append((p.with_suffix("").name, p, c))
    else:
        for r in rows:
            p = md_path(root, r)
            if in_month(r, month) and p.exists():
                targets.append((r["name"], p, r["chars_i"]))
    if not targets:
        print("確かめる議事録が1件も無い", file=sys.stderr)
        return 2
    bad = 0
    for name, p, c in targets:
        why = check_one(p, c)
        if why:
            bad += 1
            print(f"NG  {name}")
            for w in why:
                print(f"      - {w}")
        else:
            print(f"OK  {name}（本文 {body_chars(p.read_text(encoding='utf-8'))}字）")
    print(f"\n{len(targets)}件中 OK {len(targets) - bad} / NG {bad}")
    return 1 if bad else 0


# ---------------------------------------------------------------- index

def section(text: str, heading: str) -> str:
    out, on = [], False
    for l in text.splitlines():
        if l.startswith("## "):
            if on:
                break
            on = l.strip() == heading
            continue
        if on and l.strip():
            out.append(l.strip())
    return " ".join(out)


def title_of(text: str) -> str:
    for l in text.splitlines():
        if l.startswith("# "):
            return l[2:].strip()
    return ""


def material_title(root: Path, r: dict) -> str:
    """議事録が無い回の題名は、材料の頭の `# ` 行（題名）から。"""
    for suf in (".chat.txt", ".transcript.txt"):
        p = root / (r["rel"] + suf)
        if p.exists():
            with p.open(encoding="utf-8") as f:
                first = f.readline()
            if first.startswith("# "):
                return first[2:].strip()
    return r.get("video_id") or r["name"]


def index_text(root: Path, month: str) -> str:
    yyyy, mm = month.split("-")
    rows = [r for r in read_manifest(root) if in_month(r, month)]
    # 月の目次は暦の順（古い→新しい）。月を頭から読むときにその順で追うから
    rows.sort(key=lambda r: (r.get("start_jst") or "", r["name"]))
    items, done = [], 0
    for r in rows:
        when = r.get("start_jst") or r["name"][:10]
        p = md_path(root, r)
        if p.exists():
            done += 1
            text = p.read_text(encoding="utf-8")
            title = title_of(text) or material_title(root, r)
            # 議事録の題は「日付 時刻 題名」なので、前に出す日付と重ねない
            if title.startswith(when):
                title = title[len(when):].strip()
            gist = section(text, "## ひとことで") or "（ひとことで が空）"
            items.append(f"- **{when}** [{title}]({mm}/{r['name']}.md) — {gist}")
        else:
            items.append(f"- **{when}** {material_title(root, r)} — 議事録まだ")
    head = [
        f"# {int(yyyy)}年{int(mm)}月の配信",
        "",
        f"配信 {len(rows)}本 / 議事録 {done}本",
        "",
        f"<!-- python3 python/stream_notes.py index --month {month} が作る。手で直さない -->",
        "",
    ]
    return "\n".join(head + items) + "\n"


def index(root: Path, month: str) -> Path:
    yyyy, mm = month.split("-")
    out = root / yyyy / f"{mm}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(index_text(root, month), encoding="utf-8")
    return out


# ---------------------------------------------------------------- 入口

def month_arg(s: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}", s):
        raise argparse.ArgumentTypeError("YYYY-MM で")
    return s


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="配信の議事録を埋める・確かめる・目次にする")
    ap.add_argument("--root", type=Path, default=STREAMS, help="streams/ の場所（見張りが差し替える）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pending")
    p.add_argument("--month", type=month_arg)
    c = sub.add_parser("check")
    c.add_argument("--month", type=month_arg)
    c.add_argument("stems", nargs="*")
    i = sub.add_parser("index")
    i.add_argument("--month", type=month_arg, required=True)
    a = ap.parse_args(argv)
    root = a.root

    if a.cmd == "pending":
        for name, chars, tgt in pending(root, a.month):
            print(f"{name}\t{chars}\t{tgt}")
        return 0
    if a.cmd == "check":
        return check(root, a.month, a.stems)
    out = index(root, a.month)
    print(f"書いた: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
