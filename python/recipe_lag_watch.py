"""**作ったのに図鑑に入っていない料理を見つけて、題名から名前を読んでみせる。**

    python3 python/recipe_lag_watch.py
    python3 python/recipe_lag_watch.py --days 3     何日たったら鳴らすか
    python3 python/recipe_lag_watch.py --json       機械で読む形

終了コード 0=遅れていない / 1=入っていない料理がある / **2=数えるものが無い**。

## なぜ要るか（#808）

2026-10-06 に「暗殺者のパスタ」、10-09 に「チョコチーズケーキ」を作ったが、
**8日たっても図鑑に1品も入らなかった。** しかも、こちらから

> 【あやとに質問】料理2品の名前（10/06・10/09）

と issue で聞いていた。あやとの返事（2026-10-13）:

> 10/06 → 暗殺者のパスタ 10/09 → チョコチーズケーキ
> **これ、わたし打つの面倒なので仕組みを見直してください。最低でもあなたは知ってるはずだし**

そのとおりで、**10/06 の配信の題は「遂に遂に…遂に暗殺者のパスタ」。**
料理の名前は題名に書いてあった。聞く必要は無かった。

だからこの見張りは2つやる。

1. **入っていない料理を数える**（誰も見ていなかったのが、そもそもの穴）
2. **題名から名前の候補を出す**（聞くとしても、打たせない）

## 題名から名前を当てられないときは、当てたふりをしない

`/island-fresh` に **「題名から料理名は決まらない。推測で埋めない」** と書いてある。
これは正しい。「北欧旅まであと２日！トトロクッキング！」で何を作ったかは分からない。

**だからここは「埋める」道具ではなく「候補を出す」道具。** 読めたら候補を出し、
読めなければ `候補なし` と出す。**どちらの場合も、決めるのは人。**
`recipes.ts` に書き込みはしない。

## 出どころは `cityStreams.ts`（毎晩ひとりでに焼ける）

BigQuery はこの箱から引けないが、`cityStreams.ts` は `rebake.yml` が毎晩
焼き直していて、**いまの旅のぶんも題名ごと入っている**（`chapterStreams.ts` は
終わった章だけなので使えない）。だから**この見張りはネットに出ない。**
"""

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import ts_read as TS  # noqa: E402

ROOT = HERE.parent
RECIPES = ROOT / "site" / "content" / "recipes.ts"
STREAMS = ROOT / "site" / "content" / "cityStreams.ts"

#: 何日たったら鳴らすか。**実測から**: 2026年に入ってからの料理38品で、
#: 配信の日から `recipes.ts` に入るまでの遅れは中央値1日・最長3日だった
#: （それ以上かかったのは、いま鳴らそうとしている10月の2品だけ）。
#: 3日 = その最長。これを超えたら「いつもと違う」。
DEFAULT_DAYS = 3

#: 題名がこれに当たったら「料理をした配信かもしれない」。
#:
#: **広く取ると使いものにならない。** 最初は `ご飯|ごはん|料理` まで入れていて、
#: イラン歩き旅（「一緒に**ご飯食べ**にイランまで歩く」19本）を丸ごと拾った。
#: 20件中19件が外れで、**毎晩赤いまま誰も読まない見張り**になる
#: （`docs/island-standards.md` §13 の「満たしようのない見張り」の裏返し）。
#:
#: 実測で3通り比べた（`cityStreams.ts` の341本。図鑑が名指ししている10本が正解）:
#:
#: | 当てかた | 拾えた | 取りこぼし | **外れ** |
#: | --- | ---: | ---: | ---: |
#: | `ご飯`・`料理` まで入れる | 5 | 5 | **26** |
#: | 料理名（`パスタ` `ケーキ` …）も見る | 8 | 2 | **9** |
#: | **作る動きと「材料買」だけ** | **7** | 3 | **0** |
#:
#: 外れ0を取った。**鳴ったら必ず本物**でないと、見張りとして死ぬ。
COOK = re.compile(r"クッキング|(?:作|つく)(?:ろ|りま|ってみ|った|る[!！\s]*$)|自炊|材料買")

#: **拾えない回があることを、隠さない。**
#: 取りこぼした3本は、題名に作る動きが1つも無い:
#:
#:   2026-10-06 「遂に遂に…遂に暗殺者のパスタ」      ← #808 を起こした、まさにその回
#:   2026-08-07 「カズベキでアクアパッツァつくるぞー！」（`つくるぞ` は活用の外）
#:   2025-02-03 「…卵サンド食べてみた」
#:
#: いちばん上が痛い。**この見張りは、自分が作られる原因になった回を拾えない。**
#: 料理名だけの題を拾おうとすると外れが9件出る（上の表）ので、そちらは取らなかった。
#:
#: **だから「0件＝料理は全部入っている」とは言っていない。** 言っているのは
#: 「**題名から分かるぶんは**入っている」だけ。10/06 のような回は、
#: 同じ週に買い出し（`材料買`）か別の調理回があればそちらが鳴るので、
#: 鳴った週は**その週ぜんぶ**を見る——という使い方で補う。
#: 1本だけで完結する料理回は、いまのところ人しか気づけない。

#: 題名から料理の名前を読むときに、前後から削るもの。
#: 「アルバニアで」「北欧旅まであと2日！」のような枕と、
#: 「作ろか！」「つくります」のような結び。
HEAD = re.compile(r"^(?:【[^】]*】|[^\s!！]*?(?:まで)?あと\d+日[!！]*|[ぁ-んァ-ヶ一-龠ー]+?[でにの])\s*")
TAIL = re.compile(r"\s*(?:を?(?:作|つく)(?:ろ|る|りま|ります|ってみ|った)[^\s]*|配信|回|[!！?？\s]+)$")
#: 「遂に」「ついに」のような、同じ字のくり返しだけの枕
REPEAT = re.compile(r"^(遂に|ついに|やっと|いよいよ)+")


def guess(title: str) -> str:
    """題名から、料理の名前の**候補**。読めなければ空。

    当てずっぽうは返さない。削ったあとに残るのが2〜20字で、
    くり返しの枕と記号を落としても何か残っているときだけ返す。
    """
    t = title.strip()
    t = REPEAT.sub("", t)
    for _ in range(3):  # 枕が重なっている題がある（「【速報】アルバニアで…」）
        n = HEAD.sub("", t)
        if n == t:
            break
        t = n
    t = TAIL.sub("", t).strip("！!？?、。 　")
    # くり返しの枕を落としたあとに、もう一度
    t = REPEAT.sub("", t).strip()
    return t if 2 <= len(t) <= 20 else ""


def recipe_videos(src: str) -> set[str]:
    """`recipes.ts` が名指ししている videoId ぜんぶ。"""
    body = TS.array_body(src, "RECIPES")
    out = set()
    for obj in TS.objects(body):
        for st in TS.objects(TS.nested_body(obj, "streams")):
            v = TS.fields(st).get("videoId", "").strip('"')
            if v:
                out.add(v)
    return out


def streams(src: str) -> list[tuple[str, str, str]]:
    """`cityStreams.ts` の `(日, videoId, 題名)` ぜんぶ。

    **TS を自分の正規表現で読まない**（`python/ts_readers_selftest.py` が
    見ている。`docs/island-misses.md` #248 で、読み手を1本に寄せたのに
    `.mjs` 側に自前の読み手が20か所あった、という前がある）。

    `cityStreams.ts` は `build_city_streams.py` が焼いた自動生成で、
    **`=` の右はそのまま JSON**（鍵まで引用符つき）。だから位置だけ
    `ts_read` に出してもらって、中身は `json.loads` に渡す。
    `ts_read.fields()` は引用符の付かない鍵しか読めないので、
    ここに通すと空の表が返る（通して、空が返ることを見た）。
    """
    a, b = TS.object_span(src, "CITY_STREAMS")
    out = []
    for _chapter, cities in json.loads(src[a : b + 1]).items():
        for _city, rows in cities.items():
            for r in rows:
                if r.get("videoId") and r.get("date"):
                    out.append((r["date"], r["videoId"], r.get("title", "")))
    return out


def lagging(days: int, today: date | None = None) -> list[dict]:
    """まだ図鑑に入っていない、料理っぽい配信。"""
    today = today or date.today()
    cut = today - timedelta(days=days)
    have = recipe_videos(RECIPES.read_text(encoding="utf-8"))
    out = []
    seen = set()
    for d, vid, title in streams(STREAMS.read_text(encoding="utf-8")):
        if vid in have or vid in seen or not COOK.search(title):
            continue
        try:
            when = date.fromisoformat(d)
        except ValueError:
            continue
        if when > cut:
            continue  # まだ待ってよい
        seen.add(vid)
        out.append({"date": d, "videoId": vid, "title": title, "guess": guess(title)})
    return sorted(out, key=lambda r: r["date"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    # **数えるものが無ければ 2。** 焼き込みが空のまま「遅れ 0件」と言うと、
    # 焼けていないことが「片づいている」に見える（`docs/island-standards.md` §15）
    try:
        total = len(streams(STREAMS.read_text(encoding="utf-8")))
        known = len(recipe_videos(RECIPES.read_text(encoding="utf-8")))
    except OSError as e:
        print(f"✕ 読めなかった: {e}", file=sys.stderr)
        return 2
    if not total or not known:
        print(f"✕ 数えられない（配信 {total}本 / 図鑑の名指し {known}本）", file=sys.stderr)
        return 2

    late = lagging(a.days)
    if a.json:
        print(json.dumps(late, ensure_ascii=False, indent=2))
    else:
        print(f"配信 {total}本 / 図鑑が名指ししている {known}本 / {a.days}日より前で入っていない料理 {len(late)}件")
        for r in late:
            g = r["guess"] or "**題名からは読めない。配信を見る**"
            print(f"  {r['date']}  {r['videoId']}  題名から読めるのは「{g}」")
            print(f"      {r['title']}")
    if late:
        print(
            f"\n{len(late)}件が図鑑に入っていません。`/island-fresh` の2章で足してください。"
            "\n**あやとに名前を聞く前に、上の候補を見る**（題名に書いてあることが多い。#808）",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
