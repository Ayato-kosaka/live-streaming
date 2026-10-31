"""**議事録の道具（`python/stream_notes.py`）が、まだの回を拾い・崩れた議事録を落とし・目次を作れるか。**

    python3 python/stream_notes_selftest.py

ネットワークも鍵も要らない。一時ディレクトリに小さな `streams/`（manifest・字幕・チャット・
議事録）をこしらえて、`--root` で差し替えて当てる。本物の `streams/` には触らない。

## なぜ要るか

`check` が緑を返すと、月末の担当はその議事録を正しいものとして読む。
**`check` が何も見ていなくても、緑は同じ緑に見える。** だから NG の理由を1つずつ、
「その1点だけ崩した議事録」を作って、それが落ちることを確かめる（字数・見出し・投げ銭・時刻）。
投げ銭は chat.txt の行の形（`python/stream_text.py` の `chat_line`）から数えているので、
ふつうの行・メンバーの行・額の無い投げ銭・`$` の投げ銭を混ぜてある。

## 対照

`stream_notes.py` の比較を1つ壊して（例: 字数の幅の `<=` を `<` に、時刻の `>` を `>=` に）、
ここが赤くなることを確かめてある。`python3 python/mutation_drill.py python/stream_notes_selftest.py`
でも当てられる。
"""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_notes as sn  # noqa: E402

ok: list[str] = []
ng: list[str] = []


def check(name: str, got, want) -> None:
    if got == want:
        ok.append(name)
        print(f"  ok  {name}")
    else:
        ng.append(f"{name}: 欲しい {want!r} / 出た {got!r}")
        print(f"  NG  {name}\n       欲しい {want!r}\n       出た   {got!r}")


def run(*argv: str) -> tuple[int, str]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
        rc = sn.main(list(argv))
    return rc, buf.getvalue()


COLS = ["video_id", "start_jst", "stem", "caption", "chars", "chat_count",
        "fetched_at", "tries", "note"]

CHAT = """# 見本の配信
# https://www.youtube.com/watch?v=AAA
# 開始: 2026-10-18 22:02 JST

[-0:00:30] @早い人: 待機
[0:00:34] @aoi: こんばんは
[0:06:30] ¥500 @desora: 元気だったかい？
[0:07:30] ¥1,000 @田中とら:
[0:08:00] （メンバー）@新しい人: 加入
[0:09:00] $2.00 @Jess: hi
[0:10:00] 投げ銭 @額なし: ありがとう
[0:11:00] @数字の名前2: 3:00に寝る
[0:12:00] Channel Name: 名前に空白がある人
"""
PAID = 4  # ¥500 / ¥1,000 / $2.00 / 額なしの投げ銭。メンバー・ふつうの行は数えない

TRANSCRIPT = """# 見本の配信
# https://www.youtube.com/watch?v=AAA
# 開始: 2026-10-18 22:02 JST
# 字幕: 自動
# 行数: 3（30秒ごと）

[0:00:00] こんばんは
[0:30:00] 城塞
[1:00:00] おやすみ
"""


def note(target: int, *, paid: str = f"投げ銭 {PAID}件（¥1,500＋$2.00）", drop: str = "",
         t3: str = "0:30:00", title: str = "# 2026-10-18 22:02 見本の配信",
         gist: str = "城塞を歩いた回。") -> str:
    """形の正しい議事録を、本文ちょうど target 字で作る。引数で1点だけ崩す。"""
    parts = [
        title,
        "- URL: https://www.youtube.com/watch?v=AAA / 長さ 1:00:00",
        "- チャット 9件",
        f"- {paid}",
        "",
        "## ひとことで",
        gist,
        "",
        "## 流れ",
        "### [0:00:00] はじまり",
        "あいさつ。",
        f"### [{t3}] 城塞",
        "@desora「元気だったかい？」",
        "",
        "## 視聴者さん",
        "@desora 投げ銭。",
        "",
        "## 持ち越し・決まったこと",
        "なし",
        "",
    ]
    parts = [p for p in parts if p != drop]
    body = "\n".join(parts)
    pad = target - sn.body_chars(body) - 1
    assert pad >= 0, "見本が目安より長い"
    return body + "あ" * pad + "\n"


def make_root(d: Path) -> Path:
    root = d / "streams"
    rows = [
        # 名前, 開始, 字幕, 字幕の字数, チャット件数
        ("AAA", "2026-10-18 22:02", "ok", 30000, 9),   # 目安 4000
        ("BBB", "2026-10-17 22:00", "ok", 8000, 5),    # 目安 2000（25%）
        ("CCC", "2026-10-16 01:06", "ok", 1000, 3),    # 目安 600（下限）
        ("DDD", "2026-10-15 22:00", "none", 0, 12),    # 字幕なし・チャットあり → 書ける
        ("EEE", "2026-10-14 22:00", "none", 0, 0),     # 字幕もチャットも無い → 書けない
        ("FFF", "2026-10-13 22:00", "error", 0, 40),   # 取れなかった → まだ書かない
        ("GGG", "2026-09-30 22:00", "ok", 20000, 50),  # 先月
    ]
    lines = ["\t".join(COLS)]
    for vid, start, cap, chars, chat in rows:
        d8 = start[:10]
        stem = f"{start[:4]}/{start[5:7]}/{d8}_{start[11:13]}{start[14:16]}_{vid}"
        lines.append("\t".join([vid, start, stem, cap, str(chars), str(chat),
                                "2026-10-20", "1", "note"]))
        base = root / (stem)
        base.parent.mkdir(parents=True, exist_ok=True)
        if cap == "ok":
            (base.parent / (base.name + ".transcript.txt")).write_text(TRANSCRIPT, encoding="utf-8")
        if chat:
            (base.parent / (base.name + ".chat.txt")).write_text(
                CHAT.replace("見本の配信", f"見本の配信{vid}"), encoding="utf-8")
    (root / "manifest.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return root


def md_of(root: Path, vid: str) -> Path:
    return next(root.glob(f"*/*/*_{vid}.chat.txt")).parent / (
        next(root.glob(f"*/*/*_{vid}.chat.txt")).name.replace(".chat.txt", ".md"))


def check_target() -> None:
    check("目安: 長い回は 4000", sn.target_chars(30000), 4000)
    check("目安: 字幕 8,000字なら 25% の 2000", sn.target_chars(8000), 2000)
    check("目安: 字幕 2,000字なら 25% が下限を割るので 600", sn.target_chars(2000), 600)
    check("目安: 短い回は下限 600", sn.target_chars(1000), 600)
    check("目安: 字幕なしは 600", sn.target_chars(0), 600)
    check("目安: 4万字ちょうどは 4000", sn.target_chars(40000), 4000)
    check("目安: 長時間（6.7万字）は 4万字を超えたぶんの5%を足す", sn.target_chars(67000), 5350)
    check("目安: 長時間でも上限 8000", sn.target_chars(200000), 8000)
    check("本文の字数は頭（# と直下の - 行）を除く",
          sn.body_chars("# 題\n- URL: x\n- 投げ銭 なし\n\n## ひとことで\nあ\n- [0:01:00] 本文の箇条\n"),
          len("\n## ひとことで\nあ\n- [0:01:00] 本文の箇条\n"))


def check_paid(root: Path) -> None:
    chat = next(root.glob("*/*/*_AAA.chat.txt"))
    check("投げ銭の行を数える（メンバー・ふつうの行・名前の数字は数えない）", sn.count_paid(chat), PAID)


def check_pending(root: Path) -> None:
    rc, out = run("--root", str(root), "pending", "--month", "2026-10")
    names = [l.split("\t")[0].rsplit("_", 1)[-1] for l in out.splitlines()]
    check("pending: 書ける回だけ、新しい順", names, ["AAA", "BBB", "CCC", "DDD"])
    check("pending: 字数と目安の列", out.splitlines()[1].split("\t")[1:], ["8000", "2000"])
    rc, out = run("--root", str(root), "pending")
    check("pending: 月を外すと先月も", len(out.splitlines()), 5)
    md_of(root, "AAA").write_text(note(4000), encoding="utf-8")
    rc, out = run("--root", str(root), "pending", "--month", "2026-10")
    check("pending: 書いた回は消える", "AAA" in out, False)


def check_cases(root: Path) -> None:
    md = md_of(root, "AAA")
    cases = {
        # 名前: (議事録, OK か, 理由に含む字)
        "形の正しい議事録は OK": (note(4000), True, ""),
        "字数: 目安の -15% ちょうどは OK": (note(3400), True, ""),
        "字数: 目安の +20% ちょうどは OK": (note(4800), True, ""),
        "字数: 短すぎ": (note(3399), False, "本文"),
        "字数: 長すぎ": (note(4801), False, "本文"),
        "字数: 頭が長くても本文が目安内なら OK":
            (note(4000, paid=f"投げ銭 {PAID}件（¥1,500＋$2.00）: " + "名前 ¥500／" * 300), True, ""),
        "見出し: # が無い": (note(4000, title="2026-10-18 見本"), False, "`# `"),
        "見出し: ひとことで が無い": (note(4000, drop="## ひとことで"), False, "ひとことで"),
        "見出し: 流れ が無い": (note(4000, drop="## 流れ"), False, "流れ"),
        "見出し: 視聴者さん が無い": (note(4000, drop="## 視聴者さん"), False, "視聴者さん"),
        "見出し: 持ち越し が無い": (note(4000, drop="## 持ち越し・決まったこと"), False, "持ち越し"),
        "投げ銭: 件数が違う": (note(4000, paid="投げ銭 3件（¥1,500）"), False, "投げ銭 3件"),
        "投げ銭: 書いていない": (note(4000, paid="投げ銭の話は無し"), False, "投げ銭 N件"),
        "投げ銭: 本文にだけ書いてあっても頭に無ければ NG":
            (note(4000, paid="チャット多め", gist=f"投げ銭 {PAID}件の回。"), False, "投げ銭 N件"),
        "時刻: 字幕の最後ちょうどは OK": (note(4000, t3="1:00:00"), True, ""),
        "時刻: 字幕の最後を越える": (note(4000, t3="1:00:01"), False, "1:00:01"),
    }
    for name, (text, want_ok, word) in cases.items():
        md.write_text(text, encoding="utf-8")
        rc, out = run("--root", str(root), "check", md.stem)
        # NG のときは「なぜ NG か」まで当てる（別の理由で落ちて通った、を見逃さない）
        check(name, (rc == 0, want_ok or word in out), (want_ok, True))
    md.write_text(note(4000), encoding="utf-8")


def check_zero_paid(root: Path) -> None:
    # 投げ銭の無い回は「なし」でも「0件」でもよい
    chat = next(root.glob("*/*/*_BBB.chat.txt"))
    chat.write_text("# x\n\n[0:00:10] @aoi: こんばんは\n", encoding="utf-8")
    md = md_of(root, "BBB")
    for paid in ("投げ銭 なし", "投げ銭 0件"):
        md.write_text(note(2000, paid=paid), encoding="utf-8")
        rc, _ = run("--root", str(root), "check", md.stem)
        check(f"投げ銭 0: 「{paid}」は OK", rc, 0)
    md.write_text(note(2000, paid="投げ銭 1件"), encoding="utf-8")
    rc, _ = run("--root", str(root), "check", md.stem)
    check("投げ銭 0: 1件と書けば NG", rc, 1)
    md.write_text(note(2000, paid="投げ銭 なし"), encoding="utf-8")


def check_month_and_exit(root: Path) -> None:
    rc, out = run("--root", str(root), "check", "--month", "2026-10")
    check("check --month: 書いた2本を見る", out.count("OK  "), 2)
    rc, out = run("--root", str(root), "check", "--month", "2026-08")
    check("check: 見るものが無ければ 2（緑にしない）", rc, 2)
    # 1本でも NG があれば 1
    md_of(root, "BBB").write_text(note(2000, drop="## 流れ"), encoding="utf-8")
    rc, out = run("--root", str(root), "check", "--month", "2026-10")
    check("check --month: 1本 NG なら 1", (rc, out.count("NG  ")), (1, 1))
    md_of(root, "BBB").write_text(note(2000, paid="投げ銭 なし"), encoding="utf-8")


def check_index(root: Path) -> None:
    rc, out = run("--root", str(root), "index", "--month", "2026-10")
    text = (root / "2026" / "10.md").read_text(encoding="utf-8")
    items = [l for l in text.splitlines() if l.startswith("- ")]
    check("index: 本数と議事録の本数", "配信 6本 / 議事録 2本" in text, True)
    check("index: 1配信1項目・暦の順", [l.split("**")[1] for l in items],
          ["2026-10-13 22:00", "2026-10-14 22:00", "2026-10-15 22:00",
           "2026-10-16 01:06", "2026-10-17 22:00", "2026-10-18 22:02"])
    check("index: 議事録へ相対リンク・題名・ひとことで", items[-1],
          "- **2026-10-18 22:02** [見本の配信](10/2026-10-18_2202_AAA.md) — 城塞を歩いた回。")
    check("index: まだの回は材料の題名で「議事録まだ」", items[2],
          "- **2026-10-15 22:00** 見本の配信DDD — 議事録まだ")
    check("index: 先月の回は載らない", "GGG" in text, False)


def main() -> int:
    check_target()
    with tempfile.TemporaryDirectory() as d:
        root = make_root(Path(d))
        check_paid(root)
        check_pending(root)
        check_cases(root)
        check_zero_paid(root)
        check_month_and_exit(root)
        check_index(root)
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
