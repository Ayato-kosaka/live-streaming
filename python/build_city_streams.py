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
"""

import argparse
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from stays import read_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "site" / "content" / "cityStreams.ts"

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
    """配信の一覧（日付・ID・タイトル）を古い順に取る SQL。"""
    return f"""
    SELECT
      FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS d,
      video_id,
      title
    FROM `{project}.{dataset}.videos`
    WHERE actual_start_time IS NOT NULL
    ORDER BY actual_start_time
    """


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
