"""配信アーカイブの文字起こしとチャットを、`streams/` に置く文字の形へ整える。

取ってくる側（`python/stream_transcripts.py`）から切り離してあるのは、ここが
**ネットワークも鍵も要らない**ので、見張り（`python/stream_text_selftest.py`）が
小さな見本だけで当てられるから。

## 形

- 文字起こし: `[h:mm:ss] 発話` を **30秒ごとに1行**。発話の無い30秒は行を作らない。
  `[音楽]` / `♪` のある30秒は `[h:mm:ss] [音楽]` だけにする（歌詞を公開しない。#969）
- チャット: `[h:mm:ss] 名前: 本文`。投げ銭は `[h:mm:ss] ¥500 名前: 本文`
- どちらも冒頭に `# ` で始まるヘッダを数行

AI が読む前提なので、1行を短く・時刻を必ず頭に、にしてある。時刻が頭にあれば
文字起こしとチャットを同じ時刻で突き合わせられる。
"""

from __future__ import annotations

import csv
import datetime as dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 字幕ファイルの読み方はショートの材料と共有する（2か所に持たない）
sys.path.insert(0, str(ROOT / "tools/shorts/ingest"))
from captions import parse_json3, parse_vtt  # noqa: E402

JST = dt.timezone(dt.timedelta(hours=9))
BIN_SEC = 30

# 一覧の列。**足すときは後ろに。** 前の列の位置で読んでいる人がいるかもしれないので
MANIFEST_COLS = ["video_id", "start_jst", "stem", "caption", "chars", "chat_count",
                 "fetched_at", "tries", "note"]
# 字幕が ok にならなかったものを、何回まで取りに行くか。
# 自動字幕は配信が終わってから数時間〜1日あとに付くことがあるので、1回で諦めない
MAX_TRIES = 3


# ---------------------------------------------------------------- 時刻

def hms(sec: float) -> str:
    """`1:02:03`。配信の前に書かれたチャットは負になるので `-0:00:30` と出す。"""
    neg = sec < 0
    t = int(round(abs(sec)))
    s = f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}"
    return "-" + s if neg and t else s


def parse_clock(text: str | None) -> float | None:
    """チャットの `timestampText`（`1:23:45` / `12:34` / `-0:30`）を秒にする。読めなければ None。"""
    if not text:
        return None
    m = re.fullmatch(r"\s*(-)?(\d+(?::\d{1,2}){0,2})\s*", text)
    if not m:
        return None
    sec = 0
    for p in m.group(2).split(":"):
        sec = sec * 60 + int(p)
    return float(-sec if m.group(1) else sec)


def chat_offset(offset_msec, clock_text, published_at: dt.datetime | None,
                start: dt.datetime | None) -> tuple[float | None, str]:
    """チャット1件が配信の何秒目か。どこから出したか（msec / clock / diff / none）も返す。

    1. `videoOffsetTimeMsec`（アーカイブのチャットが持つ、動画の中の時刻そのもの）
    2. `timestampText`（YouTube がチャットの横に出している配信内の時刻。秒まで）
    3. 書かれた時刻 − 配信の開始時刻（動画の 0 秒と開始時刻が少しずれることがある）
    """
    if offset_msec not in (None, ""):
        try:
            return int(offset_msec) / 1000, "msec"
        except (TypeError, ValueError):
            pass
    c = parse_clock(clock_text)
    if c is not None:
        return c, "clock"
    if published_at is not None and start is not None:
        return (published_at - start).total_seconds(), "diff"
    return None, "none"


def stem_for(video_id: str, start: dt.datetime) -> str:
    """`2026-10-18_2003_<videoId>`（開始時刻は JST）。"""
    return f"{start.astimezone(JST):%Y-%m-%d_%H%M}_{video_id}"


def rel_dir(start: dt.datetime) -> str:
    return f"{start.astimezone(JST):%Y/%m}"


# ---------------------------------------------------------------- 文字起こし

def _cjk(ch: str) -> bool:
    return ord(ch) > 0x2E7F


def join_text(a: str, b: str) -> str:
    """日本語どうしは詰めて、英数字が接するところだけ空白を入れる。"""
    if not a:
        return b
    if not b:
        return a
    sep = "" if (_cjk(a[-1]) or _cjk(b[0])) else " "
    return a + sep + b


# 重なりとみなす最短の字数。短くすると「そうそう」「そうだね」の「そう」のような
# 本当に2回言った言葉まで落とす。流れる字幕の重なりは行まるごとなので、長めでよい
OVERLAP_MIN = 5
CONTAINED_MIN = 8


def strip_overlap(prev: str, new: str, min_len: int = OVERLAP_MIN) -> str:
    """`new` の頭が `prev` の尻と同じなら、その重なりを落とした残りを返す。

    流れる字幕（vtt の自動字幕・手動字幕の2行表示）は、前の行をもう一度書いてから
    続きを足してくる。同じ字が2回並ぶと、読む側（AI）は2回言ったと読む。
    直前に丸ごと出ている行（CONTAINED_MIN 字以上）は空を返す。
    """
    p, n = prev.replace(" ", ""), new.replace(" ", "")
    if not n:
        return ""
    if len(n) >= CONTAINED_MIN and n in p[-max(len(n) * 2, 40):]:
        return ""
    for k in range(min(len(p), len(n)), min_len - 1, -1):
        if p.endswith(n[:k]):
            # 空白を詰めた位置から元の文字列の位置へ戻す
            cut, seen = 0, 0
            while cut < len(new) and seen < k:
                if new[cut] != " ":
                    seen += 1
                cut += 1
            return new[cut:].strip()
    return new


def bin_captions(rows: list[dict], width: int = BIN_SEC) -> list[tuple[int, str]]:
    """字幕の行を `width` 秒ごとにまとめる。重なりは落とす。（秒の頭, 発話）の並び。"""
    bins: dict[int, str] = {}
    prev = ""
    for r in sorted(rows, key=lambda r: r["start"]):
        t = strip_overlap(prev, r["text"].strip())
        if not t:
            continue
        prev = (prev + t)[-200:]
        k = int(max(0, r["start"]) // width) * width
        bins[k] = join_text(bins.get(k, ""), t)
    return sorted(bins.items())


def read_captions(path: Path) -> list[dict]:
    return parse_json3(path) if path.suffix == ".json3" else parse_vtt(path)


# ---------------------------------------------------------------- 曲の区間を伏せる（#969）
#
# 自動字幕は、配信で流した曲の歌詞まで字に起こすことがある。このリポジトリは公開なので、
# そのまま置くと歌詞を公開することになる。歌詞と話を字の上で見分ける手は無い
# （混ざって1行になる）ので、**印のある30秒は話ごと捨てる。** 話が少し欠けるのは、
# 議事録の材料としては許せる損。歌詞を1行でも残すほうが許せない。
MUSIC_MARKS = ("[音楽]", "[歌声]", "♪")
MUSIC_LINE = "[音楽]"
# ヘッダには印そのもの（`[音楽]` / `♪`）を書かない。書くと「♪ が0件か」「[音楽] の行が
# 全部伏せた形か」を grep で確かめるときに、ヘッダが引っかかって数えられなくなる
MUSIC_HEADER = f"# 曲の区間（音楽の印のある{BIN_SEC}秒）は伏せてある"


def has_music(text: str) -> bool:
    return any(m in text for m in MUSIC_MARKS)


def mask_music(bins: list[tuple[int, str]]) -> tuple[list[tuple[int, str]], int]:
    """印のある行を `[音楽]` だけにする。（伏せたあとの並び, 曲の区間の行数）。

    数は「中身を捨てた行」ではなく「曲の区間の行」。もともと `[音楽]` だけの行も数える。
    同じファイルに2回かけても数が変わらない（一覧の note を書き直しても揺れない）ように。
    """
    out, n = [], 0
    for t, s in bins:
        if has_music(s):
            out.append((t, MUSIC_LINE))
            n += 1
        else:
            out.append((t, s))
    return out, n


def music_note(note: str, n: int) -> str:
    """一覧の note に「曲の区間 N行を伏せた」を足す（列は増やさない）。前の数は差し替える。"""
    base = re.sub(r"・?曲の区間 \d+行を伏せた", "", note or "").strip("・ ")
    if not n:
        return base
    tag = f"曲の区間 {n}行を伏せた"
    return f"{base}・{tag}" if base else tag


_LINE_RE = re.compile(r"(\[-?\d+:\d{2}:\d{2}\]) ?(.*)")


def mask_transcript(text: str) -> tuple[str, int]:
    """置いてある transcript.txt の本文に同じ伏せをかける。（新しい本文, 曲の区間の行数）。

    ヘッダに伏せた旨の1行が無ければ `# 行数:` の下に足す。何度かけても同じものになる。
    """
    head, body, n = [], [], 0
    for line in text.splitlines():
        m = _LINE_RE.fullmatch(line)
        if not m:
            (head if not body else body).append(line)
            continue
        s = m.group(2)
        if has_music(s):
            s, n = MUSIC_LINE, n + 1
        body.append(f"{m.group(1)} {s}")
    if MUSIC_HEADER not in head:
        at = next((i + 1 for i, l in enumerate(head) if l.startswith("# 行数:")), None)
        if at is None:
            at = next((i for i, l in enumerate(head) if not l.startswith("# ")), len(head))
        head.insert(at, MUSIC_HEADER)
    return "\n".join(head + body) + "\n", n


def transcript_text(head: dict, bins: list[tuple[int, str]]) -> str:
    """bins は伏せたあとのもの（`mask_music` を通す）。ここでも通すのは、通し忘れた
    呼び手がいても歌詞を書き出さないため。2回通しても同じになる。"""
    bins, _ = mask_music(bins)
    lines = [f"[{hms(t)}] {s}" for t, s in bins]
    out = header(head) + [f"# 字幕: {head.get('caption_desc', '?')}",
                          f"# 行数: {len(lines)}（{BIN_SEC}秒ごと）",
                          MUSIC_HEADER, ""]
    return "\n".join(out + lines) + "\n"


# ---------------------------------------------------------------- チャット

def one_line(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def chat_line(offset: float, event_type: str, name: str | None, text: str | None,
              amount: str | None) -> str | None:
    """1件を1行に。本文も額も無いもの（中身の無い通知）は None。"""
    who = one_line(name) or "?"
    body = one_line(text)
    amt = one_line(amount)
    if event_type == "PAID":
        return f"[{hms(offset)}] {amt or '投げ銭'} {who}: {body}".rstrip()
    if event_type == "MEMBERSHIP":
        return f"[{hms(offset)}] （メンバー）{who}: {body}".rstrip()
    if not body:
        return None
    return f"[{hms(offset)}] {who}: {body}"


def chat_lines(msgs: list[dict], start: dt.datetime | None) -> tuple[list[str], dict]:
    """BQ の行（offset_msec / clock / published_at / event_type / author_name /
    message_text / purchase_amount_text）を時刻順の行にする。出どころの内訳も返す。"""
    rows, src = [], {"msec": 0, "clock": 0, "diff": 0, "none": 0}
    for i, m in enumerate(msgs):
        off, how = chat_offset(m.get("offset_msec"), m.get("clock"), m.get("published_at"), start)
        src[how] += 1
        if off is None:
            continue
        line = chat_line(off, m.get("event_type") or "", m.get("author_name"),
                         m.get("message_text"), m.get("purchase_amount_text"))
        if line:
            rows.append((off, i, line))
    rows.sort()
    return [r[2] for r in rows], src


def chat_text(head: dict, lines: list[str], src: dict) -> str:
    how = "・".join(f"{k} {v}" for k, v in src.items() if v)
    out = header(head) + [f"# 件数: {len(lines)}",
                          f"# 時刻の出どころ: {how or 'なし'}"
                          "（msec=動画内の時刻 / clock=チャット横の時刻 / diff=書いた時刻−開始）", ""]
    return "\n".join(out + lines) + "\n"


# ---------------------------------------------------------------- ヘッダと一覧

def header(head: dict) -> list[str]:
    start = head.get("start")
    when = f"{start.astimezone(JST):%Y-%m-%d %H:%M} JST" if start else "?"
    return [f"# {one_line(head.get('title')) or '(題名なし)'}",
            f"# https://www.youtube.com/watch?v={head['video_id']}",
            f"# 開始: {when}"]


def read_manifest(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        return {r["video_id"]: r for r in csv.DictReader(f, delimiter="\t") if r.get("video_id")}


def write_manifest(path: Path, rows: dict[str, dict]) -> None:
    """開始の新しい順に並べて書く（差分が新しい配信の行だけになるように）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=MANIFEST_COLS, delimiter="\t", extrasaction="ignore",
                           lineterminator="\n")
        w.writeheader()
        for r in sorted(rows.values(), key=lambda r: (r.get("start_jst", ""), r["video_id"]),
                        reverse=True):
            w.writerow({k: one_line(str(r.get(k, ""))) for k in MANIFEST_COLS})


def wanted(row: dict | None) -> bool:
    """この配信をまだ取りに行くか。字幕が ok なら済み。ほかは MAX_TRIES 回まで。"""
    if row is None:
        return True
    if row.get("caption") == "ok":
        return False
    try:
        return int(row.get("tries") or 0) < MAX_TRIES
    except ValueError:
        return True
