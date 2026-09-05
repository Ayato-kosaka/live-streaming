"""街ごとの配信を BigQuery から拾って、site/content/cityStreams.ts を作る。

「歩いた国」で「国 → 街 → その街の配信」とたどれるようにするための下ごしらえ。
街の滞在期間は site/content/countries.ts が持っているので、それを読んで
その期間の配信を集め、タイトルに街の名前が入っているものを先に並べる。

実行:
  BQ_PROJECT_ID=... python python/build_city_streams.py
"""

import json
import logging
import re
import sys
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
COUNTRIES_TS = ROOT / "site" / "content" / "countries.ts"
OUT_TS = ROOT / "site" / "content" / "cityStreams.ts"

# 1つの街に出す配信の本数。多すぎるとページが配信一覧になってしまう。
PER_CITY = 6

# タイトルの書き方がぶれる街の言い換え
ALIASES = {
    "モン・サン・ミシェル": ["モンサンミッシェル", "モンサンミシェル", "モン・サン"],
    "アブ・シンベル": ["アブシンベル"],
    "メグリ（国境）": ["メグリ", "イラン"],
    "セヴァン湖": ["セヴァン"],
    "死海": ["死海"],
    "南フランス": ["南フランス", "ニース", "マルセイユ", "プロヴァンス"],
}


def read_stays() -> dict:
    """countries.ts から「国 → 滞在（期間と街）」を読み出す。"""
    src = COUNTRIES_TS.read_text(encoding="utf-8")
    out = {}
    pattern = (
        r'slug: "([a-z-]+)",\n\s*name: "([^"]+)",(?:.|\n)*?'
        r"stays: \[((?:.|\n)*?)\],\n\s*summary"
    )
    for m in re.finditer(pattern, src):
        stays = []
        for sm in re.finditer(
            r'\{ from: "([\d-]*)", to: "([\d-]*)", cities: \[([^\]]*)\] \}', m.group(3)
        ):
            cities = [c.strip().strip('"') for c in sm.group(3).split(",") if c.strip()]
            stays.append({"from": sm.group(1), "to": sm.group(2), "cities": cities})
        out[m.group(1)] = {"name": m.group(2), "stays": stays}
    return out


def fetch_videos() -> list:
    """配信の一覧（日付・ID・タイトル）を新しい順に取る。"""
    sql = f"""
    SELECT
      FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS d,
      video_id,
      title
    FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.videos`
    WHERE actual_start_time IS NOT NULL
    ORDER BY actual_start_time
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    return [dict(r) for r in client.query(sql).result()]


def names_of(city: str) -> list:
    """その街を指すタイトルの書き方。"""
    base = [city]
    base += ALIASES.get(city, [])
    if "・" in city:
        base.append(city.replace("・", ""))
    if "（" in city:
        base.append(city.split("（")[0])
    return base


def pick(videos: list, stay: dict, city: str) -> list:
    """その街の配信を選ぶ。名前が入っているものを先に、次に滞在中のもの。"""
    lo = stay["from"]
    hi = stay["to"] or "9999-12-31"
    window = [v for v in videos if lo <= v["d"] <= hi]
    keys = names_of(city)
    named = [v for v in window if any(k in v["title"] for k in keys)]
    rest = [v for v in window if v not in named]
    return named + rest


def main() -> int:
    countries = read_stays()
    videos = fetch_videos()
    logger.info("配信 %d 本、国 %d カ国", len(videos), len(countries))

    result = {}
    for slug, c in countries.items():
        cities = {}
        for stay in c["stays"]:
            for city in stay["cities"]:
                chosen = pick(videos, stay, city)[:PER_CITY]
                if not chosen:
                    continue
                cities.setdefault(city, [])
                seen = {v["videoId"] for v in cities[city]}
                for v in chosen:
                    if v["video_id"] in seen:
                        continue
                    cities[city].append(
                        {"videoId": v["video_id"], "title": v["title"], "date": v["d"]}
                    )
                cities[city] = cities[city][:PER_CITY]
        if cities:
            result[slug] = cities

    body = json.dumps(result, ensure_ascii=False, indent=2)
    OUT_TS.write_text(
        "/**\n"
        " * 街ごとの配信。python/build_city_streams.py が BigQuery から作る。\n"
        " * 滞在期間中の配信のうち、タイトルにその街の名前が入っているものを先に並べている。\n"
        " * 手で編集せず、スクリプトを流し直すこと。\n"
        " */\n"
        "export type CityStream = { videoId: string; title: string; date: string };\n\n"
        "export const CITY_STREAMS: Record<string, Record<string, CityStream[]>> =\n"
        f"  {body};\n\n"
        "export const streamsOfCity = (country: string, city: string): CityStream[] =>\n"
        "  CITY_STREAMS[country]?.[city] ?? [];\n",
        encoding="utf-8",
    )
    total = sum(len(v) for c in result.values() for v in c.values())
    logger.info("%s に %d 街 / %d 本を書き出した", OUT_TS, sum(len(c) for c in result.values()), total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
