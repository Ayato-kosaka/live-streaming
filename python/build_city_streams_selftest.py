"""**街が2つ以上ある滞在で、配信を議事録の場所で街に割り振れているか**を見る。

    python3 python/build_city_streams_selftest.py

BigQuery も YouTube も引かない。**この箱で回る。**
終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（差し込みから1本も焼けなかった）。

## なぜ要るか（#1400）

`site/content/cityStreams.ts` は、街が2つ以上ある滞在（アルメニアは6街を1行で持つ）を
**題名の字**で街に割り振っていた。題名は「アルメニア最終日やぁぁ」のように街を名乗らないので、
議事録の場所がエレバンの27本のうち一覧に入っていたのは5本。カスケード・虐殺記念碑・市場の回が
ガイドの記事から引けなかった（記事は一覧に無い回を引くと書き出しを止める）。
いまは議事録の `- 場所:` で決める（読み方は `python/build_city_streams.py` の頭）。

## 判定の足

| 足 | 何を見るか | 外すとどうなるか |
| --- | --- | --- |
| `place` | 議事録（無ければ facts）の場所で街が決まる | 題名だけに戻り、街を名乗らない回が街の欄から消える |
| `title` | 議事録も facts も無い回は、題名で決まる | 議事録の無い古い回が、街の欄から黙って消える |
| `elsewhere` | 場所の頭が別の国の回は、この国のどの街にも入れない | 「ロンドンから飛行機で着いた」パリの回がロンドンに入る |
| `outside` | 括弧の中の「〜行き」「〜から」の街は数えない | 「トビリシ行きのバス乗り場」でトビリシに入る |
| `last` | 頭が国の名前だけの回は、着いた街1つ | 「ゴリスの宿→…→タテヴ」がゴリスにも入る |
| `single` | 街が1つの滞在は、前と同じ（期間の配信ぜんぶ） | 「ジョージア（街の名前は出ず）」の回がソロの街から消える |

`BREAK=<足>` を当てると、その足を外した形で同じ差し込みを焼く。**対照**として、
足を外すたびにどれかの判定が落ちることを、ここで毎回確かめる（`docs/island-standards.md` §15）。

議事録の置き場から1本も読めない晩は、題名に戻って焼かずに止まる（ここも毎回当てる）。

最後の「本物の議事録」は、いまあるガイドの記事が引く回を本物の議事録・滞在の表で当てる。
エレバンの記事（`claude/yerevan-guide`）がセヴァン湖の欄から2本を引き、
「明日は13時からセヴァン湖」の回はエレバンで撮ったもの、という実物。
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_city_streams as bcs  # noqa: E402

logging.disable(logging.WARNING)

# 差し込みの国。`others`（別の国の名前）を作るために、隣の国も1つ置く
COUNTRIES = {
    "test": {"name": "テスト国", "stays": [
        {"from": "2026-01-01", "to": "2026-01-31", "cities": ["ミナト", "エキ", "ヤマ湖"], "exact": False}]},
    "solo": {"name": "ソロ国", "stays": [
        {"from": "2026-02-01", "to": "2026-02-10", "cities": ["ソロ市"], "exact": False}]},
    "next": {"name": "トナリ国", "stays": [
        {"from": "2026-03-01", "to": "2026-03-05", "cities": ["ミヤコ"], "exact": False}]},
}
# 議事録の綴りのゆれ（本物の「タテフ／タテヴ」と同じ形）
ALIASES = {"ヤマ湖": ["ヤマ"]}

# (video_id, 日, 題名, 議事録の場所 or None, facts の場所 or None, 入るはずの街, 何を見るか)
ROWS = [
    ("aaaaaaaaaa1", "2026-01-02", "テスト国でございます", "テスト国・ミナト（港→市場）", None,
     {"ミナト"}, "題名が街を名乗らなくても、議事録の街に入る"),
    ("bbbbbbbbbb1", "2026-01-03", "明日はミナトへ", "テスト国・エキ（駅前のベンチ）", None,
     {"エキ"}, "題名の予告（ミナト）より、議事録の居た街（エキ）"),
    ("cccccccccc1", "2026-01-04", "ミナトを歩く", None, None,
     {"ミナト"}, "議事録も facts も無い回は、題名で決まる"),
    ("dddddddddd1", "2026-01-05", "雑談", None, None,
     set(), "どれでも決まらない回は、どの街にも入れない"),
    ("eeeeeeeeee1", "2026-01-06", "湖へ行きます",
     "テスト国・ミナト（バス停）→市バス→ヤマの湖畔の町→湖沿いの修道院", None,
     {"ミナト", "ヤマ湖"}, "日帰りの回は、括弧の外に出る街ぜんぶ（綴りのゆれも当てる）"),
    ("ffffffffff1", "2026-01-07", "歩く旅3日目", "テスト国（ミナトの宿→峠→ヤマの手前→エキのゲストハウス）", None,
     {"エキ"}, "頭が国の名前だけの回は、着いた街1つ"),
    ("gggggggggg1", "2026-01-08", "ミナトから飛びます", "トナリ国・ミヤコ（ミナトから飛行機で着いたところ）", None,
     set(), "頭が別の国の回は、題名が名乗ってもこの国の街に入れない"),
    ("hhhhhhhhhh1", "2026-01-09", "雑談", None, "テスト国・エキ",
     {"エキ"}, "議事録が無ければ facts の場所で決まる"),
    ("kkkkkkkkkk1", "2026-01-10", "雑談", "テスト国・ミナト（エキ行きのバス乗り場→公園）", None,
     {"ミナト"}, "括弧の中の「エキ行き」は数えない"),
    ("nnnnnnnnnn1", "2026-01-11", "エキで雑談", "テスト国（街の名前は出ず）", None,
     {"エキ"}, "議事録に滞在の街が1つも出ない回は、題名で決まる"),
    ("pppppppppp1", "2026-01-12", "雑談", "テスト国・エキ（ホステル）", "テスト国・ミナト",
     {"エキ"}, "議事録と facts が両方あれば、議事録が先"),
    # 街が1つの滞在。議事録が何を言っていても、期間の配信ぜんぶ（他の国の名前が題名に出る回だけ外す）
    ("ssssssssss1", "2026-02-02", "ソロ国最高", "ソロ国（宿。街の名前は出ず）", None,
     {"ソロ市"}, "街が1つの滞在は、議事録に街が無くても入る"),
    ("ssssssssss2", "2026-02-03", "雑談", "ソロ国・どこかの村（ミナトの話）", None,
     {"ソロ市"}, "街が1つの滞在は、議事録が別の地名を言っても入る"),
    ("ssssssssss3", "2026-02-04", "トナリ国へ移動", None, None,
     set(), "街が1つの滞在で、題名が別の国を名乗る回は前と同じく外す"),
]

LEGS = ("place", "title", "elsewhere", "outside", "last", "single")


@contextlib.contextmanager
def broken(legs: set[str]):
    """足を外した形に差し替える。抜けるときに必ず戻す。"""
    keep = {k: getattr(bcs, k) for k in ("read_places", "named_in_title", "elsewhere", "outside",
                                         "last_named", "pick")}
    try:
        if "place" in legs:
            # 空にすると「1本も読めない」の止め金が先に止めるので、どの回にも当たらない1行だけ返す
            bcs.read_places = lambda root=None: {"（どの回でもない）": "テスト国・ミナト"}
        if "title" in legs:
            bcs.named_in_title = lambda title, cities: []
        if "elsewhere" in legs:
            bcs.elsewhere = lambda line, others: False
        if "outside" in legs:
            bcs.outside = lambda line: line
        if "last" in legs:
            bcs.last_named = lambda line, cities: [c for c in cities
                                                   if any(k in line for k in bcs.names_of(c))]
        if "single" in legs:
            pick = keep["pick"]
            # 街が1つの滞在にも議事録の読み方を当てる（ダミーの街を足して、2つ以上の道へ通す）
            bcs.pick = lambda videos, stay, *a, **k: pick(
                videos, {**stay, "cities": stay["cities"] + ["（ダミー）"]} if len(stay["cities"]) == 1 else stay,
                *a, **k)
        yield
    finally:
        for k, v in keep.items():
            setattr(bcs, k, v)


def bake(td: Path) -> dict:
    """差し込みの行・国・議事録で `build_city_streams.main()` を1回回して、書き出しを読む。"""
    streams = td / "streams"
    for vid, d, title, md, facts, _, _ in ROWS:
        base = streams / d[:4] / d[5:7] / f"{d}_2200_{vid}"
        base.parent.mkdir(parents=True, exist_ok=True)
        if md is not None:
            base.with_suffix(".md").write_text(
                f"# {d} 22:00 {title}\n- URL: https://www.youtube.com/watch?v={vid}\n- 場所: {md}\n\n## ひとことで\nx\n",
                encoding="utf-8")
        if facts is not None:
            (base.parent / f"{base.name}.facts.json").write_text(
                json.dumps({"video_id": vid, "place_line": facts}, ensure_ascii=False), encoding="utf-8")
    rows = td / "rows.json"
    rows.write_text(json.dumps([{"st": f"{d}T13:00:00+00:00", "d": d, "video_id": vid, "title": t}
                                for vid, d, t, *_ in ROWS], ensure_ascii=False), encoding="utf-8")
    out = td / "cityStreams.ts"
    keep = (bcs.OUT_TS, bcs.STREAMS, bcs.read_stays, bcs.ALIASES, sys.argv)
    try:
        bcs.OUT_TS, bcs.STREAMS = out, streams
        bcs.read_stays = lambda: COUNTRIES
        bcs.ALIASES = {**bcs.ALIASES, **ALIASES}
        sys.argv = ["build_city_streams", "--rows", str(rows)]
        bcs.main()
    finally:
        bcs.OUT_TS, bcs.STREAMS, bcs.read_stays, bcs.ALIASES, sys.argv = keep
    text = out.read_text(encoding="utf-8")
    return json.loads(text[text.index("=\n  {") + 2: text.rindex("};") + 1])


def judge(body: dict) -> list[tuple[str, bool, str]]:
    """1行ずつ、入るはずの街と入った街を比べる。→ [(何を見るか, 通ったか, 一言)]"""
    where: dict[str, set] = {}
    for cities in body.values():
        for city, vs in cities.items():
            for v in vs:
                where.setdefault(v["videoId"], set()).add(city)
    out = []
    for vid, _, _, _, _, want, why in ROWS:
        got = where.get(vid, set())
        out.append((why, got == want, f"入るはず {sorted(want) or 'なし'} / 入った {sorted(got) or 'なし'}"))
    return out


def run(legs: set[str]) -> list[tuple[str, bool, str]]:
    with tempfile.TemporaryDirectory() as td, broken(legs):
        return judge(bake(Path(td)))


def empty() -> list[tuple[str, bool, str]]:
    """議事録の置き場が空なら、題名に戻って焼かずに止まる（エレバンの欄が27本から5本へ静かに縮む形）。"""
    with tempfile.TemporaryDirectory() as td:
        keep = (bcs.STREAMS, bcs.OUT_TS, sys.argv)
        rows = Path(td) / "rows.json"
        rows.write_text(json.dumps([{"st": "", "d": "2026-01-02", "video_id": "aaaaaaaaaa1", "title": "x"}]),
                        encoding="utf-8")
        try:
            bcs.STREAMS, bcs.OUT_TS = Path(td) / "streams", Path(td) / "out.ts"
            sys.argv = ["build_city_streams", "--rows", str(rows)]
            bcs.main()
            return [("議事録が1本も読めないときは止まる", False, "焼けてしまった")]
        except ValueError as e:
            return [("議事録が1本も読めないときは止まる", "1本も読めない" in str(e), str(e)[:40])]
        finally:
            bcs.STREAMS, bcs.OUT_TS, sys.argv = keep


def real() -> list[tuple[str, bool, str]]:
    """本物の議事録と滞在の表で、記事が引く回の街を当てる（行は議事録の頭の題名から組む）。"""
    countries = bcs.read_stays()
    arm = countries.get("armenia")
    if not arm:
        return [("本物の滞在の表にアルメニアが在る", False, "読めない")]
    stay = next((s for s in arm["stays"] if len(s["cities"]) > 1), None)
    if not stay:
        return [("アルメニアの滞在が街を2つ以上持つ", False, "1街になった（この見張りは要らなくなった）")]
    places = bcs.read_places()
    others = {c["name"] for c in countries.values()} - {arm["name"]}
    out = []
    for vid, want, why in (
        ("haHAczqMooM", {"エレバン", "セヴァン湖"}, "エレバンからセヴァン湖へ日帰りした回（記事 yerevan/sevan が引く）"),
        ("JJdPN0ozwZI", {"エレバン", "セヴァン湖"}, "セヴァン湖からヒッチハイクで戻った回（記事 yerevan/sevan が引く）"),
        ("2u4HfAvQdsI", {"エレバン"}, "題名「明日は13時からセヴァン湖」はエレバンで撮った回"),
        ("YFxoJhKOasQ", {"エレバン"}, "題名「アルメニア最終日」のカスケードの回"),
    ):
        hit = list(bcs.STREAMS.glob(f"*/*/*_{vid}.md"))
        if not hit or vid not in places:
            out.append((why, False, f"{vid} の議事録が無い"))
            continue
        title = hit[0].read_text(encoding="utf-8").splitlines()[0]
        got = set(bcs.city_of({"video_id": vid, "title": title}, stay["cities"], others, places))
        out.append((why, got == want, f"入るはず {sorted(want)} / 入った {sorted(got) or 'なし'}"))
    return out


def show(title: str, rows: list[tuple[str, bool, str]]) -> int:
    print(title)
    for why, ok, note in rows:
        print(f"  {'○' if ok else '✕'} {why}（{note}）")
    return sum(1 for _, ok, _ in rows if not ok)


def main() -> int:
    want = {x.strip() for x in os.environ.get("BREAK", "").split(",") if x.strip()}
    odd = want - set(LEGS)
    if odd:
        raise SystemExit(f"BREAK に知らない足があります: {' '.join(sorted(odd))}（在るのは {' '.join(LEGS)}）")

    rows = run(want)
    if not rows:
        print("数えるものが無い（差し込みから1本も焼けなかった）")
        return 2
    bad = show(f"1. 差し込みの行で焼く{'（BREAK=' + ','.join(sorted(want)) + '）' if want else ''}", rows)
    if want:
        # 対照として呼ばれた。足を外した形の結果だけ返す
        return 1 if bad else 0

    bad += show("2. 本物の議事録で、記事が引く回", real() + empty())

    # 3. 対照。足を1本ずつ外して、どれかの判定が落ちること
    print("3. 対照（足を1本ずつ外すと落ちる）")
    for leg in LEGS:
        fell = [why for why, ok, _ in run({leg}) if not ok]
        print(f"  {'○' if fell else '✕'} BREAK={leg} → 落ちた判定 {len(fell)}"
              + (f"（{fell[0]} ほか）" if fell else "（**外しても緑のまま**）"))
        bad += 0 if fell else 1

    print("\n通った" if not bad else f"\n落ちた: {bad} 件")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
