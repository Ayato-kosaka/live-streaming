#!/usr/bin/env python3
"""11月の授賞式のオープニングの4つの数を、streams/ の chat.txt から数える。

    python3 tools/monthly_review/count_2026-11.py                    # 2026-10-31 〜 2026-11-27
    python3 tools/monthly_review/count_2026-11.py --from 2026-09-26 --to 2026-10-30   # 10月版で物差しを確かめる

数えるもの（`2026-11.content.json` の opening.stats の4つ）:
- 配信のあった日 … 配信の始まりを 6:00 JST で切った日（0時をまたいだ続き枠は前日）
- 枠            … 期間内に始まった配信の本数（chat.txt の本数。コメント0件の回も1枠）
- コメント       … 案内の固定コメント（@あやとグルメアプリ）を除いた行の数
- しゃべった人   … その行の名前の重なりを除いた数

あわせて「はじめまして」（`.claude/skills/monthly-review/SKILL.md` §6-4）の閾値も数える:
- はじめて … streams/ にある全部の chat.txt で、初めてのコメントが期間内の人（総数はそのまま出す）
- 札に並べる … (1) 期間内に投げ銭した人、または
  (2) 初コメントの日から期間の終わりまでの配信日（コメントの残っている日）の半分以上に来た人。
  (2) は初コメントの日を含めて数える。来た日が1日だけの人は (2) では選ばない（11/22 に初めて来た人が「1/2日」で通ってしまうため）

11/25〜11/27 の chat.txt が streams/ に入ったら、もう一度流すだけでよい。
読みかたは python/buzzwords.py の read_chat / cut_day をそのまま使う（数え直しの式を増やさない）。
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from buzzwords import chat_files, read_chat, start_of, cut_day  # noqa: E402
from stream_notes import PAID_RE  # noqa: E402
from build_monthly import BOT_NAME  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="d0", default="2026-10-31")
    ap.add_argument("--to", dest="d1", default="2026-11-27")
    a = ap.parse_args()
    days, frames, comments, people, empty = set(), 0, 0, set(), []
    for p in chat_files():
        d = cut_day(start_of(p))
        if not (a.d0 <= d <= a.d1):
            continue
        frames += 1
        days.add(d)
        _, rows = read_chat(p)
        rows = [r for r in rows if r[1] != BOT_NAME]
        if not rows:
            empty.append(p.name)
        comments += len(rows)
        people.update(r[1] for r in rows)
    print(f"期間 {a.d0} 〜 {a.d1}")
    print(f"配信のあった日 {len(days)}日 / 枠 {frames}枠 / コメント {comments:,} / しゃべった人 {len(people)}人")
    print(f"最後の配信日 {max(days)}")
    if empty:
        print("コメント0件の枠: " + ", ".join(empty))
    newcomers(a.d0, a.d1)


def newcomers(d0: str, d1: str) -> None:
    first: dict[str, str] = {}
    seen: dict[str, set] = {}
    paid: set[str] = set()
    live_days: set[str] = set()      # コメントの残っている配信日（期間内）
    for p in chat_files():
        _, rows = read_chat(p)
        lines = [l for l in p.read_text(encoding="utf-8").splitlines() if not l.startswith("#")]
        for day, who, _body in rows:
            if who == BOT_NAME or day > d1:
                continue
            first.setdefault(who, day)
            if day >= d0:
                seen.setdefault(who, set()).add(day)
                live_days.add(day)
        if cut_day(start_of(p)) >= d0 and cut_day(start_of(p)) <= d1:
            for l in lines:
                if PAID_RE.match(l):
                    rest = l.split("] ", 1)[1].partition(" ")[2]
                    paid.add(rest.partition(":")[0].strip())
    new = sorted((w for w, d in first.items() if d0 <= d <= d1), key=lambda w: first[w])
    print(f"はじめて {len(new)}人")
    for w in new:
        denom = sorted(d for d in live_days if d >= first[w])
        came = len(seen.get(w, ()))
        why = []
        if w in paid:
            why.append("投げ銭")
        if len(denom) >= 2 and came >= 2 and came * 2 >= len(denom):
            why.append("よく来る")
        if why:
            print(f"  札 {w}  初 {first[w]}  {came}/{len(denom)}日  {'・'.join(why)}")


if __name__ == "__main__":
    main()
