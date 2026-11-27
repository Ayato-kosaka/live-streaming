#!/usr/bin/env python3
"""授賞式の出席（`2026-11.kinkin.json`）を、島の `/months` と同じ値から作る。

    python3 tools/monthly_review/kinkin_from_months.py 2026-11

**数え直さない。** 出席の日数・分母は `python/build_monthly.py` が焼いた
`site/content/months.ts` をそのまま読む（`/monthly-review` 3章「ここで数え直さない」）。
ここでやるのは並べ替えと、皆勤が何ヶ月続いているかを数えることだけ。

- 皆勤 = その月の分母と同じ日数来た人
- 連続 = 当月から遡って、皆勤が途切れずに続いている月の数（1 は画面で「はじめての皆勤賞」）
- 一覧（others）= 皆勤以外で、分母の4分の1以上来た人（10月版は 35日で 8日まで載せていた）
- 皆勤の人のひとこと（word）は人が書く。`<月>.content.json` の `kinkinWords`（名前 → 文）から引く。
  無い人がいたら止まる——空のまま出さない
- オープニングの4つの数・はじめましての人数・エンディングの1行も、同じ `months.ts` の値で
  `<月>.content.json` に書き戻す。手元のチャットで数えると、取り込みでチャットが空の枠
  （2026-11 は 11/1・11/12 夜・11/23）のぶん少なく出て、`/months` と食い違う
"""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def months() -> list[dict]:
    src = (ROOT / "site/content/months.ts").read_text()
    out = []
    for blk in re.split(r"\n  \{\n", src)[1:]:
        key = re.search(r'key: "(\d{4}-\d{2})"', blk)
        denom = re.search(r"denom: (\d+)", blk)
        att = re.search(r"attend: \[(.*?)\],\n", blk, re.S)
        if not (key and denom and att):
            continue
        people = [
            {"name": n, "d": int(d)}
            for n, d in re.findall(r'\{n:"((?:[^"\\]|\\.)*)",d:(\d+)', att.group(1))
        ]
        out.append({"key": key.group(1), "denom": int(denom.group(1)), "attend": people})
    return out


def main() -> None:
    key = sys.argv[1] if len(sys.argv) > 1 else "2026-11"
    ms = {m["key"]: m for m in months()}
    order = sorted(ms, reverse=True)
    if key not in ms:
        sys.exit(f"{key} が months.ts に無い（FINALS と焼き直しを先に）")
    cur = ms[key]
    denom = cur["denom"]
    full = [p["name"] for p in cur["attend"] if p["d"] == denom]

    def streak(name: str) -> int:
        n = 0
        for k in order[order.index(key):]:
            m = ms[k]
            if any(p["name"] == name and p["d"] == m["denom"] for p in m["attend"]):
                n += 1
            else:
                break
        return n

    words = json.loads((HERE / f"{key}.content.json").read_text()).get("kinkinWords", {})
    missing = [n for n in full if n not in words]
    if missing:
        sys.exit(f"皆勤の人のひとことが無い: {missing}（content.json の kinkinWords に足す）")

    floor = max(5, math.ceil(denom / 4))
    winners = sorted(
        ({"name": n, "streak": streak(n), "word": words[n]} for n in full),
        key=lambda w: -w["streak"],
    )
    others = [{"name": p["name"], "d": p["d"]} for p in cur["attend"] if p["d"] < denom and p["d"] >= floor]
    others.sort(key=lambda p: -p["d"])
    y, mo = key.split("-")
    frm = next(m for m in months() if m["key"] == key)
    src = (ROOT / "site/content/months.ts").read_text()
    period = re.search(rf'key: "{key}".*?from: "(\d{{4}})-(\d\d)-(\d\d)", to: "(\d{{4}})-(\d\d)-(\d\d)"', src, re.S)
    f = f"{int(period.group(2))}/{int(period.group(3))}"
    t = f"{int(period.group(5))}/{int(period.group(6))}"
    out = {
        "denom": denom,
        "winners": winners,
        "others": others,
        "note": f"{f}〜{t} に配信のあった{denom}日が分母。同じ日に何枠あっても1日で、朝6時より前に始まった続きの枠は前の日に数えています。",
    }
    blk = src[src.index(f'key: "{key}"'):]
    blk = blk[: blk.index("\n  },")]
    people = int(re.search(r"people: (\d+)", blk).group(1))
    newcomers = int(re.search(r"newcomers: (\d+)", blk).group(1))
    frames = len(re.findall(r"\{d:\"", re.search(r"streams: \[(.*?)\],\n", blk, re.S).group(1)))
    cpath = HERE / f"{key}.content.json"
    c = json.loads(cpath.read_text())
    c["opening"]["stats"] = [
        {"n": str(denom), "unit": "日", "label": "配信のあった日"},
        {"n": str(frames), "unit": "枠", "label": "朝4時の到着も入れて"},
        {"n": str(newcomers), "unit": "人", "label": "はじめましての人"},
        {"n": str(people), "unit": "人", "label": "しゃべってくれた人"},
    ]
    c["newcomers"]["count"] = newcomers
    c["newcomers"]["note"] = f"今月はじめてコメントしてくれたのは{newcomers}人でした。"
    c["ending"]["sub"] = re.sub(r"　.*$", f"　{denom}日・{frames}枠・{people}人", c["ending"]["sub"])
    cpath.write_text(json.dumps(c, ensure_ascii=False, indent=1) + "\n")
    print(f"content.json: 日 {denom} / 枠 {frames} / はじめまして {newcomers} / しゃべった人 {people}")

    dst = HERE / f"{key}.kinkin.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"{dst.relative_to(ROOT)}: 分母 {denom} / 皆勤 {[(w['name'], w['streak']) for w in winners]} / 一覧 {len(others)}人（{floor}日以上）")


if __name__ == "__main__":
    main()
