"""街ごとの配信を BigQuery から拾って、site/content/cityStreams.ts を作る。

「歩いた国」で「国 → 街 → その街の配信」とたどれるようにするための下ごしらえ。
街の滞在期間は `python/stays.py` が持っているので、それを読んでその期間の配信を集める。

**滞在は countries.ts だけでは足りない。** あれは旅から帰った本人が書く表なので、
旅のあいだは1行も増えない。北欧へ発ったあと、ワルシャワもヴィリニュスも
街の欄そのものが立たなかった。いま歩いている旅のぶんは `content/nordic.ts` の
旅程から出す（まとめているのが `python/stays.py`）。

実行:
  BQ_PROJECT_ID=... python python/build_city_streams.py

## 街の配信をどう決めるか（2026-09-10 に組み直した）

前は「名前の入っているものを先に、足りなければ滞在中のものを頭から詰める」だった。
これだと**滞在が9ヶ月ある国で、その街と何の関係もない配信がその街の欄に並ぶ**。
ジョージアのゴリス欄に「アルメニアでございます」が入っていたのがそれ。

いまは滞在の形で分ける。

- **街が2つ以上ある滞在** … 題名にその街の名前（`ALIASES` 込み）が出るものだけ。
  どの街にいたかは題名でしか分からないので、分からないものは足さない
- **街が1つだけの滞在** … その期間の配信は全部その街のもの。旅の前半は題名が
  「ハンガリー最高だぜ」のように**国名**で書かれていて街の名前が一度も出ない。
  名前で絞ると0本になり、画面が「配信はのこっていない」と嘘をつく。
  ただし**他の国の名前が出ている配信は外す**（滞在の最終日は、次の国へ移った日と
  重なっていることがある。「チェコに着いたので」がブラチスラバの欄に入っていた）

本数の上限は置かない。画面は `<details>` で畳んであって、閉じている間の背は
本数で変わらない。上限で切ると、畳んだ札に出る「N本の配信」が実物より少ない数を
名乗ることになる（`docs/island-standards.md` 10「読めていないことを、値0と同じ絵にしない」）。

## 押しても見られない配信は、並べない（2026-09-18）

消えた配信（404）と、録画そのものが残らなかった配信へは**送らない。**
カードは絵が出るので生きて見えるが、押すと行き止まりになる——YouTube は
サムネイルが 404 でも灰色の板を返す（`docs/island-misses.md` #139）。

外す相手は `python/data/dead_streams.json`。**人が書く一覧ではなく、
`python/build_dead_streams.py` が測って写したもの**で、**戻らないものしか
入っていない**（403 の非公開は、あやとが公開に戻せばひとりでに島へ戻るので隠さない）。

**日ごと消すわけではない。** 街の欄には隣に生きた配信が並んでいるので、
1枚抜けても街も日付も残る。

## 非公開に戻された配信も、並べない（2026-09-18）

`dead_streams.json` が隠すのは**戻らないもの**（404・録画なし）だけで、
**403（非公開）はわざと入っていない**——あやとが公開に戻した日に、島が知らない
まま隠し続けることになるため（`docs/island-misses.md` #139 の決めごと2）。
**あの考え方は正しい。穴はこちら側の抽出条件だった。**

ここは長いこと `WHERE actual_start_time IS NOT NULL` しか書いていなかったので、
非公開に戻された配信がそのまま街の欄に並んでいた。2026-09-18 の実測で、
`/map/azerbaijan` のバクーは37本中13本、`/map/uae` のアブダビは5本中2本が
**オリーブ色の空箱＋絵の壊れた印**で、押しても開かない。バクーは3分の1が穴。

同じ表から焼いている `chapterStreams.ts` にこれが1本も出ていないのは、
あちらが `WHERE v.status = 'SUCCEEDED'` で引いているから。
**同じ守りが2か所に要るのに、片方にしか入れていなかった。**

### `status = 'SUCCEEDED'` は写さない

写すと、**いま公開されている配信まで消える**（2026-09-18 の本番）。

    SUCCEEDED 691本
    SKIPPED    42本  ← チャットを取らないと決めたぶん。**動画は公開されている**
    FAILED     37本  ← 37本とも 403（非公開）
    WAITING     7本  ← これから取り込むぶん。**公開されている**

`status` が言っているのは「**チャットを取り込めたか**」であって
「**いま見られるか**」ではない。数えているものが違う。

### 見るのは「最後に当てたとき、YouTube が何と言ったか」

yt-dlp の返した字が `last_error_detail` にそのまま残っている
（37本とも `Video unavailable. This video is private`）。`status` と違って、
これは**動画そのものに当てた結果**。字は `python/admin/failed_terminate.py` の
`PRIVATE` から写した——**判定器を2つ持たない**ため、ずれたら見張りが赤くなる
（`python/viewable_streams_selftest.py`）。

隠すのは、その字が在って、**しかも、もう一度当てる予定が無い**行だけ。

    COALESCE(last_error_detail, '') LIKE '%This video is private%'
      AND status NOT IN ('PENDING', 'WAITING')

`PENDING` / `WAITING` を外してあるのが、**戻り道との折り合い**。

### 戻ってきたら、ひとりでに戻る

| 起きたこと | 表 | 島 |
| --- | --- | --- |
| あやとが公開に戻す | `FAILED` ＋ 非公開の字 | まだ出ない |
| `failed_reentry` が**押せることを測って** `WAITING` に返す | `WAITING` ＋ 非公開の字 | **次の焼き直しで出る** |
| 翌晩の取り込みが通る | `SUCCEEDED`（`mark_video_succeeded` が字を消す） | 出たまま |
| 取り込んだら、まだ非公開だった | `FAILED` / `SKIPPED` ＋ 非公開の字 | また引っ込む |

**島は一覧を1つも持たない。** 隠す相手を書いた表はどこにも無く、毎晩 BigQuery に
聞き直す。表の言うことが変われば、その晩の焼き直しで島の言うことも変わる
（#139 の決めごと3「隠す相手を、人が書いた一覧で持たない。毎晩測り直して、
そのときの答えだけを持つ」）。ここが `dead_streams` の「403 は隠さない」と
折り合うところ——**あちらが持たないのと同じ理由で、こちらも持たない。**

**ただし `failed_reentry` は人が押す。** 7日を過ぎた `FAILED` は取り込みの
どちらの枠にも入らない（`python/admin/failed_reentry.py` の1章）ので、
あやとが公開に戻しただけでは表は動かない。**そこだけは繋がっていない。**

### 数は減る。減るほうが正しい

街の札の「N本の配信」は**その街で見られる配信の本数**。押せないものを数に入れると、
畳みを開いた人が、数の合わない一覧を見ることになる。
「その街で何本配信したか」を数えているのは `countryStats.ts` の `lives` のほうで、
あちらは**外さない**（配信が1本見られないことと、そこで配信したことは別）。
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build_dead_streams import blocked, check_written  # noqa: E402
from stays import read_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "site" / "content" / "cityStreams.ts"

# ============================================================================
# いま見られるか（**取り込めたかではない**。頭の docstring を読む）
# ============================================================================

# yt-dlp が動画そのものに当たって書き残す字。**本番から写した**（2026-09-18 実測）:
#   ERROR: [youtube] <id>: Video unavailable. This video is private
# `python/admin/failed_terminate.py` の `PRIVATE` と同じ字でないといけない。
# ずれたら `python/viewable_streams_selftest.py` が赤くなる（判定器を2つ持たない）
PRIVATE_MARK = "This video is private"

# **もう一度当てる予定のある行**。ここに居るあいだは隠さない。
# `failed_reentry` は「押せば見られる」ことを測ってから `WAITING` に返すので、
# **`WAITING` に非公開の字が残っていることが「戻ってきた」の印**になる
# （あちらは字を消さない。消すのは取り込みが通ったときの `mark_video_succeeded`）
RETRYING = ("PENDING", "WAITING")

# 足の名前。**知らない名前を渡したら落とす**（書き間違いで対照が黙らないように）
LEGS = ("private", "retry")


def leg() -> str:
    """いま抜いている足。`BREAK=` で渡す。ふだんは空。

    対照は足の数だけ要る（`docs/island-standards.md` §15）。
    `private` を抜くと非公開が素通りし、`retry` を抜くと戻ってきた回が出てこない。
    """
    b = (os.getenv("BREAK") or "").strip()
    if b and b not in LEGS:
        raise SystemExit(f"BREAK に使えるのは {', '.join(LEGS)} だけです: {b}")
    return b


def sql_public(
    col: str,
    project: str = "live-streaming-d3cac",
    dataset: str = "youtube_chat",
) -> str:
    """SQL に差す `AND <col> NOT IN (...)`。**いま見られない回を外す1行。**

    `col` は配信IDの列（別名つきでよい）。`build_dead_streams.sql_not_in()` と
    同じ形にしてあるのは、**差す側が2つの守りを同じ顔で並べられる**ようにするため。

    **SQL の側で外す。** 「1年前の今日」も「国の代表」も1本しか焼かないので、
    引いてきてから落とすとその日・その国が丸ごと消える。SQL で外せば次点が繰り上がる
    （`build_dead_streams.sql_not_in` の注と同じ理由）。

    `COALESCE` を噛ませてあるのは、**三値論理を読ませないため。**
    取り込めた691本は `last_error_detail` が `NULL` で、`NULL LIKE '%…%'` は
    `TRUE` でも `FALSE` でもなく `NULL` になる。ここ（隠す側を選ぶ内側の `WHERE`）
    では結果的に正しく落ちるが、**同じ字を「見られるほうを選ぶ」向きに書き写した
    日に、691本が黙って全部消える。** 向きを変えても意味が変わらない字にしておく。
    """
    if leg() == "private":
        # 守りを丸ごと抜いた写し。**本番が 2026-09-18 までこれだった**
        return ""
    where = f"COALESCE(last_error_detail, '') LIKE '%{PRIVATE_MARK}%'"
    if leg() != "retry":
        # 抜くと、戻ってきた回（`WAITING` に返ったぶん）まで隠れたままになる
        where += " AND status NOT IN (" + ", ".join(f"'{s}'" for s in RETRYING) + ")"
    return (
        f"AND {col} NOT IN (SELECT video_id "
        f"FROM `{project}.{dataset}.videos` WHERE {where})"
    )


# タイトルの書き方がぶれる街の言い換え。
# ローマ字（Tatev / Goris / Glasgow）は、歩く企画の題名がそう書いていたもの。
# 入れないとタテフとゴリスが0本になって「配信はのこっていない」と出る。
# ピラミッドはカイロの目印。目印で街を指す書き方は死海・セヴァン湖と同じ扱い。
ALIASES = {
    "モン・サン・ミシェル": ["モンサンミッシェル", "モンサンミシェル", "モン・サン"],
    "アブ・シンベル": ["アブシンベル"],
    "メグリ（国境）": ["メグリ", "イラン"],
    "セヴァン湖": ["セヴァン"],
    "死海": ["死海"],
    "南フランス": ["南フランス", "ニース", "マルセイユ", "プロヴァンス"],
    "タテフ": ["Tatev"],
    "ゴリス": ["Goris"],
    "グラスゴー": ["Glasgow"],
    "カイロ": ["ピラミッド"],
    # 旅の題名が「リトアニアヴィリュニュス観光日」と綴っている（本人の書き方）。
    # 題名は引用なので直さない。こちら側で当てる
    "ヴィリニュス": ["ヴィリュニュス"],
}


def read_stays() -> dict:
    """「国 → 滞在（期間と街）」。中身は `python/stays.py` が持っている。

    **ここで countries.ts を読まない。** 前はこのファイルと
    `build_on_this_day.py` が同じ正規表現をそれぞれ持っていて、片方だけ直した
    ことが2回ある（`docs/island-misses.md` #45）。読み落としの止め金も
    向こうに置いてある。
    """
    return {c["slug"]: {"name": c["name"], "stays": c["stays"]} for c in read_all()}


def sql_of(project: str = "live-streaming-d3cac", dataset: str = "youtube_chat") -> str:
    """配信の一覧（開始時刻・日付・ID・タイトル）を古い順に取る SQL。

    **開始時刻そのもの（`st`）を持って帰る。** 前はここで `ORDER BY` にだけ使って
    捨てていた。捨てると、書き出しに残るのは日付（`d`）だけになり、
    **同じ日の中の並びは「行が返ってきた順」でしか決まらない。**
    その順は毎晩ちがう（下の `order_key` の注を見る）。

    `ORDER BY` にも `video_id` を足して、**同着の無い並び**にする。
    """
    return f"""
    SELECT
      actual_start_time AS st,
      FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS d,
      video_id,
      title
    FROM `{project}.{dataset}.videos`
    WHERE actual_start_time IS NOT NULL
      -- いま見られない回は、街の欄に並べる前に外す（頭の docstring）
      {sql_public("video_id", project, dataset)}
    ORDER BY actual_start_time, video_id
    """


def order_key(v: dict) -> tuple:
    """書き出しの並び。**行が返ってきた順に頼らない。**

    2026-09-16 の焼き直しで、`cityStreams.ts` が 107 行入れ替わったのに
    **中身は1文字も変わっていなかった**（空白を除いた文字の集合が同じ）。
    動いた 57 か所は**すべて同じ日どうし**の入れ替わりで、直近5回の焼き直しでも
    「同じ街・同じ日に2本以上ある」56 かたまりのうち **44 かたまり**が
    2通り以上の並びで焼かれていた。

    日をまたぐ並びは毎回同じなのに、日の中だけが毎回ちがう。つまり
    **`ORDER BY actual_start_time` が同着を残していて**、同着の行が
    どの順で返るかは回ごとに決まっていない。書き出しには日付しか
    残っていないので、**どちらが正しいのかを後から決められない**のが根っこ。

    だから並べ替えをこちらに持つ。日（`d`）→ 開始時刻（`st`）→ `video_id` の順。
    **日付順・古い順は画面の並びそのものなので保つ**（`/map/<国>` の街の札は
    この順にカードを出す）。決まっていないのは同じ時刻どうしだけなので、
    そこだけ `video_id` で決める。

    `d` を先に見るのは、`st` が無い行（`--rows` に古い書き出しを渡したとき）でも
    画面に出る並びが崩れないようにするため。
    """
    return (v["d"], str(v.get("st") or ""), v["video_id"])


def fetch_videos() -> list:
    from google.cloud import bigquery  # BQ を使うときだけ要る

    from config import BQ_DATASET, BQ_PROJECT_ID

    client = bigquery.Client(project=BQ_PROJECT_ID)
    return [dict(r) for r in client.query(sql_of(BQ_PROJECT_ID, BQ_DATASET)).result()]


def names_of(city: str) -> list:
    """その街を指すタイトルの書き方。"""
    base = [city]
    base += ALIASES.get(city, [])
    if "・" in city:
        base.append(city.replace("・", ""))
    if "（" in city:
        base.append(city.split("（")[0])
    return base


def pick(videos: list, stay: dict, city: str, country: str, others: set) -> list:
    """その街の配信を選ぶ。決め方は冒頭の docstring にある。"""
    lo = stay["from"]
    hi = stay["to"] or "9999-12-31"
    window = [v for v in videos if lo <= v["d"] <= hi]
    keys = names_of(city)
    named = [v for v in window if any(k in v["title"] for k in keys)]
    if len(stay["cities"]) > 1:
        return named
    # 街が1つの滞在。名前で当たったものは無条件で残し、残りは
    # 「他の国の名前が出ていない」ものだけ足す（移動日を隣の国から借りない）。
    #
    # **旅程から出した滞在（`exact`）は、その絞りをかけない。** 日どりが日単位で
    # 確かなので、題名を見る必要がない。かけると逆に落ちる——旅の題名は毎回
    # 「親友に会いにスウェーデンまで」と**行き先**を名乗るので、
    # ヴィリニュスの2本がスウェーデンの名前に取られて0本になった。
    if stay.get("exact"):
        return window
    hit = {v["video_id"] for v in named}
    return [
        v
        for v in window
        if v["video_id"] in hit or not any(n in v["title"] for n in others)
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sql", action="store_true", help="流す SQL を出すだけ")
    ap.add_argument("--rows", help="BigQuery の代わりに読む JSON（--sql の結果の行）")
    a = ap.parse_args()
    if a.sql:
        print(sql_of())
        return 0

    countries = read_stays()
    videos = (
        json.loads(Path(a.rows).read_text(encoding="utf-8")) if a.rows else fetch_videos()
    )
    # **押しても見られない配信を、ここで落とす。** 選ぶ前に落とすので、
    # 「その街の配信」の数え方は変わらない（1枚少なくなるだけ）。
    # 落とすのは戻らないものだけ（`python/build_dead_streams.py`）
    gone = blocked()
    left = [v for v in videos if v["video_id"] not in gone]
    if len(left) != len(videos):
        logger.info("押しても見られない配信 %d 本を外した（取り置き %d 本）",
                    len(videos) - len(left), len(gone))
    videos = left
    # **ここで並べ直す。** SQL の ORDER BY は同着を残すので、そのまま使うと
    # 同じ日の配信が毎晩入れ替わって焼ける（`order_key` の注）
    videos = sorted(videos, key=order_key)
    logger.info("配信 %d 本、国 %d カ国", len(videos), len(countries))

    names = {c["name"] for c in countries.values()}
    # 街の欄が0本になると画面は「配信はのこっていない」と言い切る。
    # 本当に0なのか、拾えていないだけなのかは目で見ないと分からないので、必ず残す。
    empty = []
    result = {}
    for slug, c in countries.items():
        cities = {}
        for stay in c["stays"]:
            for city in stay["cities"]:
                chosen = pick(videos, stay, city, c["name"], names - {c["name"]})
                if not chosen:
                    empty.append(f"{slug}/{city}")
                    continue
                cities.setdefault(city, [])
                seen = {v["videoId"] for v in cities[city]}
                for v in chosen:
                    if v["video_id"] in seen:
                        continue
                    seen.add(v["video_id"])
                    cities[city].append(
                        {"videoId": v["video_id"], "title": v["title"], "date": v["d"]}
                    )
        if cities:
            result[slug] = cities

    body = json.dumps(result, ensure_ascii=False, indent=2)
    # 出口でもう一度見る。入力の形が変わって落としが効かなくなっても、ここで止まる
    check_written(body, OUT_TS.name)
    OUT_TS.write_text(
        "/**\n"
        " * 街ごとの配信。python/build_city_streams.py が BigQuery から作る。\n"
        " * 街が2つ以上ある滞在は、題名にその街の名前が出る配信だけ。\n"
        " * 街が1つの滞在は、その期間の配信ぜんぶ（題名が国名で書かれている時期があるため）。\n"
        " * 手で編集せず、スクリプトを流し直すこと。\n"
        " */\n"
        "export type CityStream = { videoId: string; title: string; date: string };\n\n"
        "export const CITY_STREAMS: Record<string, Record<string, CityStream[]>> =\n"
        f"  {body};\n\n"
        "export const streamsOfCity = (country: string, city: string): CityStream[] =>\n"
        "  CITY_STREAMS[country]?.[city] ?? [];\n",
        encoding="utf-8",
    )
    still = [e for e in empty if e.split("/")[1] not in result.get(e.split("/")[0], {})]
    if still:
        logger.warning("配信0本の街が %d ある（画面は「配信はのこっていない」と出す）: %s", len(still), ", ".join(still))
    total = sum(len(v) for c in result.values() for v in c.values())
    logger.info("%s に %d 街 / %d 本を書き出した", OUT_TS, sum(len(c) for c in result.values()), total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
