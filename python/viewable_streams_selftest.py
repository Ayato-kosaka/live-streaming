"""**焼き込みに並ぶのが「いま見られる配信」だけになっているか**を見る。

BigQuery も YouTube も引かない。**この箱で回る。**

    python3 python/viewable_streams_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（対照が落ちた。
`docs/island-standards.md` §15）。**2 のときは本物の数字を1つも出さない。**

## なぜ要るか（`docs/island-misses.md` #160）

`site/content/cityStreams.ts` は `WHERE actual_start_time IS NOT NULL` だけで
引いていたので、**非公開に戻された配信が街の欄に並んでいた**（バクーは37本中13本が
押しても開かない空箱）。同じ表から焼く `chapterStreams.ts` は
`WHERE v.status = 'SUCCEEDED'` で引いていて1本も出ていない。
**同じ守りが2か所に要るのに、片方にしか入れていなかった。**

## 続き（`docs/island-misses.md` #165）

`chapterStreams.ts` の `status = 'SUCCEEDED'` は、**落としすぎているほうの
食い違い**だった。`status` は「チャットを取り込めたか」なので、
**公開されている44本**（チャットだけ取れなかった回）が章の一覧から消えていて、
うち34本は街の地図には並んでいた。**地図から辿れる配信が、一覧に無い。**

なのでこの見張りは、いま4本ぜんぶを見る。

| 焼くもの | 条件 | なぜ |
| --- | --- | --- |
| `cityStreams.ts` | `actual_start_time` ＋ `sql_public()` | 街から押せる一覧 |
| `chapterStreams.ts` | **同じ2つ** | 章から押せる一覧。**街と id で突き合わせられる形にする** |
| `countryStats.ts` / `onThisDay.ts` | `sql_public()`（代表を選ぶところ） | 押せる1本を選ぶ |
| `streamPeaks.ts` | `sql_not_in()` ＋ `sql_public()` | 押せる1本の中の1点 |

**数（`chapterStats.ts` の `streams`）だけは `status = 'SUCCEEDED'` のまま。**
ここも見る——うっかり一覧と同じ条件に寄せていないことを、毎回確かめる。

守りは `python/build_dead_streams.py` の `sql_public()` **1つだけ**。
**置き場所は `blocked()` / `sql_not_in()` とそろえてある**——差す側が2つの守りを
同じ顔で並べられるように（`from build_dead_streams import sql_not_in, sql_public`）。
2026-09-18 の朝までは `build_city_streams.py` の中にあって、他の3本がそこから
借りていた。**焼くスクリプトから焼くスクリプトへ借りる形**だったので、
どちらが守りの持ち主か読めなかった。

ここはその1つを**本物の字のまま** sqlite に当てて、8とおりの行がどちらへ
落ちるかを見る。

| 行 | 期待 |
| --- | --- |
| `FAILED` ＋ 非公開の字 | **落ちる** |
| `SKIPPED` ＋ 非公開の字（取り込み直してまだ非公開だった） | **落ちる** |
| `SKIPPED` ＋ チャットが無いだけ | 残る（**動画は公開されている**） |
| `WAITING`（これから取り込む） | 残る |
| `WAITING` ＋ 非公開の字（`failed_reentry` が返したばかり） | **残る**（戻ってきた） |
| `PENDING` ＋ 非公開の字 | 残る（もう一度当てる） |
| `SUCCEEDED` | 残る |
| `SKIPPED` ＋ 録画が無い | 残る（**ここでは落とさない**。`dead_streams.json` の仕事） |

## 対照（`docs/island-standards.md` §15）

**足の数だけ用意する。** 守りは2枚重なっているので、1枚ずつ抜いて、
**そのたび別の行が向こう側へ動く**ことまで見る（`BREAK=`）。

| 抜く足 | 動くもの |
| --- | --- |
| `private` | 非公開の2行が**素通りする** |
| `retry` | 戻ってきた `WAITING` と `PENDING` が**出てこなくなる** |

取り置き（`dead_streams.json`）のほうも、**焼き込みまで通して**見る——
`cityStreams` / `chapterStreams` / `streamPeaks` の3本に、生きた1本と
取り置きの1本を流して、後者だけが落ちること。**片側だけは対照ではない**
（`docs/island-standards.md` §15）。

**壊していない写しが先に通ること**も見る（#99 の追記）。通らなければ、
本物を1行も測らずに 2 で落ちる。

## 字を2か所に持たない

隠す印（`This video is private`）は `python/admin/failed_terminate.py` の
`PRIVATE` から写したもの。**片方だけ直した日に黙って外れる**ので、
ここで突き合わせる。あちらは「非公開を絶対に終端へ落とさない」ために、
こちらは「非公開を並べない」ために、**同じ字を逆向きに使っている。**
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# `config.py` は BQ_PROJECT_ID が無いと読み込めない。**偽の値を置く。**
# `python/admin/failed_terminate.py` がそこを通る（BigQuery には1度も繋がない）
os.environ.setdefault("BQ_PROJECT_ID", "viewable-streams-selftest")

import build_city_streams as bcs  # noqa: E402
import build_dead_streams as bds  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# sqlite に立てる表の名前。**本物の SQL がそのまま当たる**ように、
# バッククォートごと同じ字にする（sqlite はバッククォートを名前の囲みとして読む）
TABLE = "live-streaming-d3cac.youtube_chat.videos"

# 差し込む行。`last_error_detail` は**本番から写した字**（id だけ差し替え）
ROWS: tuple[tuple[str, str, str | None, bool], ...] = (
    # video_id, status, last_error_detail, 残るか
    ("priv0FAILED", "FAILED",
     "ERROR: [youtube] priv0FAILED: Video unavailable. This video is private", False),
    ("priv0SKIPPD", "SKIPPED",
     "ERROR: [youtube] priv0SKIPPD: Video unavailable. This video is private (7日超過)",
     False),
    ("nochat0SKIP", "SKIPPED", "チャットファイルが生成されませんでした (7日超過)", True),
    ("waiting0new", "WAITING", None, True),
    ("back0WAITIN", "WAITING",
     "ERROR: [youtube] back0WAITIN: Video unavailable. This video is private", True),
    ("back0PENDIN", "PENDING",
     "ERROR: [youtube] back0PENDIN: Video unavailable. This video is private", True),
    ("plain0SUCCE", "SUCCEEDED", None, True),
    ("norec0SKIPP", "SKIPPED",
     "ERROR: [youtube] norec0SKIPP: This live stream recording is not available", True),
)

fails: list[str] = []


def say(ok: bool, line: str) -> None:
    print(("  OK   " if ok else "  NG   ") + line)
    if not ok:
        fails.append(line)


def stop(why: str) -> None:
    """数えられない。**本物の数字を1つも出さずに落ちる。**"""
    print(f"\n数えるものが無い: {why}")
    raise SystemExit(2)


def survivors(break_leg: str = "") -> set[str]:
    """`sql_public()` の**本物の字**を sqlite に当てて、残る id を返す。"""
    keep = os.environ.get("BREAK")
    if break_leg:
        os.environ["BREAK"] = break_leg
    else:
        os.environ.pop("BREAK", None)
    try:
        where = bds.sql_public("video_id")
    finally:
        if keep is None:
            os.environ.pop("BREAK", None)
        else:
            os.environ["BREAK"] = keep
    con = sqlite3.connect(":memory:")
    con.execute(f"CREATE TABLE `{TABLE}` (video_id TEXT, status TEXT, last_error_detail TEXT)")
    con.executemany(f"INSERT INTO `{TABLE}` VALUES (?, ?, ?)", [r[:3] for r in ROWS])
    got = con.execute(f"SELECT video_id FROM `{TABLE}` WHERE 1 = 1 {where}").fetchall()
    con.close()
    return {r[0] for r in got}


# ------------------------------------------------------------------ 1. 対照


def drill() -> None:
    """**本物を測る前に、答えの分かっている写しで自分を試す。**"""
    print("\n■ 対照（ここが外れたら、本物の数字を1つも出さずに 2）")

    whole = survivors()
    if len(whole) == len(ROWS):
        stop("守りが1行も落としていない（写しが壊れている）")
    if not whole:
        stop("守りが全部落とした（写しが壊れている）")
    print(f"  壊していない写し: {len(ROWS)} 行 → 残った {len(whole)} 行")

    # 足を1枚ずつ抜く。**そのたび、別の行が向こう側へ動くこと**
    loose = survivors("private")
    moved = loose - whole
    if moved != {"priv0FAILED", "priv0SKIPPD"}:
        stop(f"BREAK=private で素通りしたのが非公開の2行ではない: {sorted(moved)}")
    print(f"  BREAK=private  → 素通りした {len(moved)} 行（非公開）")

    tight = survivors("retry")
    lost = whole - tight
    if lost != {"back0WAITIN", "back0PENDIN"}:
        stop(f"BREAK=retry で消えたのが戻ってきた2行ではない: {sorted(lost)}")
    print(f"  BREAK=retry    → 出てこなくなった {len(lost)} 行（戻ってきたぶん）")

    # 知らない足の名前は落とす（書き間違いで対照が黙らないように）
    try:
        survivors("nosuchleg")
    except SystemExit:
        print("  知らない BREAK は落とす")
    else:
        stop("BREAK に知らない名前を渡しても止まらない")


# --------------------------------------------------- 2. どちらへ落ちるか


def check_rows() -> None:
    print("\n1. 8とおりの行が、どちらへ落ちるか")
    got = survivors()
    for vid, status, detail, want in ROWS:
        mark = "非公開" if detail and bds.PRIVATE_MARK in detail else "—"
        say((vid in got) == want,
            f"{status:<9} / {mark:<6} → {'残る' if want else '落ちる'}（{vid}）")
    print(f"  見た行 {len(ROWS)} / 残った {len(got)} / 落ちた {len(ROWS) - len(got)}")


# ------------------------------------------------- 3. 字を2か所に持たない


def check_mark() -> None:
    print("\n2. 隠す印が、終端の道具と同じ字か")
    sys.path.insert(0, str(ROOT / "python" / "admin"))
    try:
        import failed_terminate as ft
    except Exception as e:  # noqa: BLE001
        stop(f"python/admin/failed_terminate.py を読めない: {e}")
    say(bds.PRIVATE_MARK in ft.PRIVATE,
        f"`{bds.PRIVATE_MARK}` が failed_terminate.PRIVATE に在る")
    say("last_error_detail" in ft.PRIVATE,
        "どちらも last_error_detail を見ている")


# ----------------------------------------- 4. 守りが4本とも差さっているか


def check_wired() -> None:
    print("\n3. 焼くスクリプトに、守りが差さっているか")
    sub = "COALESCE(last_error_detail, '') LIKE"
    say(sub in bcs.sql_of(), "build_city_streams の SQL に在る（街の一覧）")

    import build_country_stats as bcst
    say(sub in bcst.sql_of(), "build_country_stats の SQL に在る（国の代表）")

    import build_stream_peaks as bsp
    peaks = bsp.sql_of()
    say(sub in peaks, "build_stream_peaks の SQL に在る（山）")
    # 山のほうは取り置きの守りも要る。**こちらは2枚とも無かった**（#165）
    say("video_id NOT IN ('" in peaks or not bds.blocked(),
        "build_stream_peaks の SQL に取り置きの守りも在る")

    import build_chapter_stats as bch
    lst = bch.streams_sql("SELECT 'x' AS slug, DATE '2024-01-01' AS f, DATE '2024-12-31' AS t")
    say(sub in lst, "build_chapter_stats の**明細**の SQL に在る（章の一覧）")
    say("actual_start_time IS NOT NULL" in lst,
        "明細は、街の一覧と同じ「始まった回だけ」になっている")

    # `build_on_this_day` の SQL は `fetch_videos()` の中（BigQuery を import する）
    # ので呼べない。**差し込みの字があることだけ見る**
    src = (ROOT / "python" / "build_on_this_day.py").read_text(encoding="utf-8")
    say('{sql_public("video_id"' in src, "build_on_this_day の SQL に在る（1年前の今日）")


def chapter_counts(stats_text: str, streams_text: str) -> tuple[dict, dict]:
    """焼いた2つの `.ts` から、章ごとの「数」と「一覧の件数」を読む。

    **字から読む。** import して数えると、焼き込みではなくスクリプトを試すことになる
    （見たいのは「master に入る字が食い違っていないか」）。
    """
    num: dict[str, int] = {}
    slug = None
    for line in stats_text.splitlines():
        m = re.match(r'^  "([a-z0-9-]+)": \{$', line)
        if m:
            slug = m.group(1)
        elif slug and line.startswith("    streams: "):
            num[slug] = int(line.strip()[len("streams: "):].rstrip(","))
            slug = None
    listed: dict[str, int] = {}
    slug = None
    for line in streams_text.splitlines():
        m = re.match(r'^  "([a-z0-9-]+)": \[$', line)
        if m:
            slug = m.group(1)
            listed[slug] = 0
        elif slug and re.match(r'^    \[', line):
            listed[slug] += 1
    return num, listed


def gaps(num: dict, listed: dict) -> list[str]:
    """食い違っている章を並べる。**一覧を持っている章だけ**を見る。

    いまの島（まだ閉じていない章）は一覧を焼かない（`/island/<章>/streams` が
    無いので誰も読まない）。**そこは比べようがないので比べない。**
    かわりに「一覧に在るのに数に居ない章」は必ず落とす。
    """
    out = []
    for slug, n in sorted(listed.items()):
        if slug not in num:
            out.append(f"{slug}: 一覧に在るのに chapterStats.ts に居ない")
        elif num[slug] != n:
            out.append(f"{slug}: 数 {num[slug]} / 一覧 {n}")
    return out


def check_count_side() -> None:
    """**焼いた「数」と「一覧」が、章ごとに1件残らず一致するか。**

    `chapterStats.ts` の `streams`（島の表紙・ふりかえりの「配信した N本」）と、
    `chapterStreams.ts` の行数（`/island/<章>/streams` の「この島にいたあいだの N本」）は、
    **1クリックで隣り合う面に出る同じ数**。食い違ったら、どちらかが嘘になる。

    2026-09-18 まで、この2つは別々の SQL で数えていた。条件がそろっていた3章は
    たまたま合っていて、**コーカサスだけ 449 / 448 と1本ずれていた**
    （一覧だけが `dead_streams.json` を引いていたため）。**赤くなるものが無かった。**
    いまは `fetch()` が一覧の長さを数えるので、**構造上ずれない**
    （`docs/island-misses.md` #160 の決めごと1 / #165）。ここはその裏を取る。
    """
    print("\n4. 焼いた「数」と「一覧」が、章ごとに一致するか")
    stats_text = (ROOT / "site" / "content" / "chapterStats.ts").read_text(encoding="utf-8")
    streams_text = (ROOT / "site" / "content" / "chapterStreams.ts").read_text(encoding="utf-8")
    num, listed = chapter_counts(stats_text, streams_text)
    if not num or not listed:
        stop(f"焼き込みから章を読めない（数 {len(num)} / 一覧 {len(listed)}）")

    # **対照が先**（#99 の追記）。壊していない写しが通ることと、
    # 1本ずらした写しが落ちることの両方を見る
    if gaps(num, listed):
        pass  # 本物が食い違っているときは、下の say が落とす。対照はそれでも回す
    broken = dict(num)
    victim = sorted(listed)[0]
    broken[victim] = listed[victim] + 1
    if not gaps(broken, listed):
        stop("数を1本ずらしても気づかない（この見張りは何も見ていない）")
    lost = {k: v for k, v in num.items() if k != victim}
    if not gaps(lost, listed):
        stop("章が1つ数から消えても気づかない")
    print(f"  対照: {victim} を +1本 → 拾った / 数から外す → 拾った")

    for slug in sorted(listed):
        say(num.get(slug) == listed[slug],
            f"{slug}: 数 {num.get(slug)} / 一覧 {listed[slug]}")
    print(f"  見た章 {len(listed)}（一覧を持つ章）／ chapterStats.ts の章 {len(num)}")

    # **数える口を2つ持たない。** 本数の SQL を書き戻したら落とす
    src = (ROOT / "python" / "build_chapter_stats.py").read_text(encoding="utf-8")
    say("AS streams" not in src,
        "build_chapter_stats に本数を数える SQL が戻っていない（一覧を数える）")
    say("per_chapter" in src and "len(per_chapter" in src,
        "本数は一覧（per_chapter）の長さから出ている")


# ------------------------------------- 5. これまでの守り（dead_streams）


def bake_city(rowsfile: Path, out: Path) -> str:
    """`build_city_streams` を1回走らせて、書いた字を返す。"""
    keep_out, keep_argv = bcs.OUT_TS, sys.argv
    try:
        bcs.OUT_TS = out
        sys.argv = ["build_city_streams", "--rows", str(rowsfile)]
        bcs.main()
    finally:
        bcs.OUT_TS, sys.argv = keep_out, keep_argv
    return out.read_text(encoding="utf-8")


def bake_chapter(rows: list, out: Path) -> str:
    """`build_chapter_stats` の**明細**を1回焼いて、書いた字を返す。"""
    import build_chapter_stats as bch

    chapters = [{"slug": "x", "name": "写しの章", "from": "2024-01-01", "to": "2024-12-31"}]
    keep = bch.OUT_STREAMS_TS
    try:
        bch.OUT_STREAMS_TS = out
        bch.bake_streams(bch.rows_to_streams(rows, chapters), chapters)
    finally:
        bch.OUT_STREAMS_TS = keep
    return out.read_text(encoding="utf-8")


def bake_peaks(rowsfile: Path, out: Path) -> str:
    """`build_stream_peaks` を1回焼いて、書いた字を返す。"""
    import build_stream_peaks as bsp

    keep_out, keep_argv = bsp.OUT_TS, sys.argv
    try:
        bsp.OUT_TS = out
        sys.argv = ["build_stream_peaks", "--rows", str(rowsfile)]
        bsp.main()
    finally:
        bsp.OUT_TS, sys.argv = keep_out, keep_argv
    return out.read_text(encoding="utf-8")


def without_guard(modname: str, fn, *a):
    """取り置きの守りを**抜いた**まま焼かせて、止まったかどうかを返す。

    **対照は足の数だけ**（`docs/island-standards.md` §15）。3本とも、
    入口（`blocked()` で落とす）と出口（`check_written`）の2枚を持っている。
    入口を抜いて呼ぶと、出口が `SystemExit` で止める——**そこまで見る。**
    止まらなければ、その焼き込みは取り置きの回を入れて出せるということ。
    """
    mod = sys.modules[modname]
    keep = mod.blocked
    try:
        mod.blocked = lambda *_a, **_k: set()
        try:
            fn(*a)
        except SystemExit:
            return True
        return False
    finally:
        mod.blocked = keep


def check_dead_still() -> None:
    """**既存の守りを壊していない。** 3本とも焼き込みまで通して見る。"""
    print("\n5. dead_streams.json に在る回は、焼き込みまで通しても落ちる")
    from stays import read_all

    gone = sorted(bds.blocked())
    if not gone:
        stop("dead_streams.json が空（落ちるはずのものが無い）")
    stays = read_all()
    if not stays:
        stop("滞在を1件も読めていない（countries.ts / nordic.ts）")

    # 街が1つだけの滞在を1件借りて、そこへ「生きた1本」と「取り置きの1本」を置く
    spot = next(
        (c, s) for c in stays for s in c["stays"] if s["from"] and len(s["cities"]) == 1
    )
    day = spot[1]["from"]
    city_rows = [
        {"d": day, "st": f"{day}T00:00:00", "video_id": "alive000000", "title": "生きている回"},
        {"d": day, "st": f"{day}T01:00:00", "video_id": gone[0], "title": "取り置きの回"},
    ]
    # 章の明細。**写しの章**（2024年）に、生きた1本と取り置きの1本を置く
    chap_rows = [
        {"slug": "x", "d": "2024-06-01", "video_id": "alive000000",
         "title": "生きている回", "people": 3},
        {"slug": "x", "d": "2024-06-01", "video_id": gone[0],
         "title": "取り置きの回", "people": 3},
    ]
    # 山。焼く条件（n >= MIN_PEAK / r >= MIN_RATIO）を満たす値を置く
    peak_rows = [
        {"v": "alive000000", "k": 600, "n": 30, "r": 40},
        {"v": gone[0], "k": 600, "n": 30, "r": 40},
    ]

    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / "city.json").write_text(json.dumps(city_rows, ensure_ascii=False), encoding="utf-8")
        (d / "peaks.json").write_text(json.dumps(peak_rows, ensure_ascii=False), encoding="utf-8")

        for name, modname, text in (
            ("cityStreams", "build_city_streams", bake_city(d / "city.json", d / "city.ts")),
            ("chapterStreams", "build_chapter_stats", bake_chapter(chap_rows, d / "chap.ts")),
            ("streamPeaks", "build_stream_peaks", bake_peaks(d / "peaks.json", d / "peaks.ts")),
        ):
            say("alive000000" in text, f"{name}: 生きている回は焼き込みに入る")
            say(gone[0] not in text, f"{name}: 取り置きの回は入らない（{gone[0]}）")

        # 対照。**守りを抜いたら、3本とも別々に止まる**
        print("  対照（取り置きの守りを抜く）")
        stopped = {
            "cityStreams": without_guard(
                "build_city_streams", bake_city, d / "city.json", d / "city2.ts"),
            "chapterStreams": without_guard(
                "build_chapter_stats", bake_chapter, chap_rows, d / "chap2.ts"),
            "streamPeaks": without_guard(
                "build_stream_peaks", bake_peaks, d / "peaks.json", d / "peaks2.ts"),
        }
    for name, ok in stopped.items():
        if not ok:
            stop(f"{name}: 取り置きの守りを抜いても止まらない（対照にならない）")
        print(f"    {name}: 抜いたら止まった")


def main() -> int:
    drill()
    check_rows()
    check_mark()
    check_wired()
    check_count_side()
    check_dead_still()
    print()
    if fails:
        print(f"落ちた: {len(fails)} 件")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("通った")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
