"""街ごとの配信を BigQuery から拾って、site/content/cityStreams.ts を作る。

「歩いた国」で「国 → 街 → その街の配信」とたどれるようにするための下ごしらえ。
街の滞在期間は site/content/countries.ts が持っているので、それを読んで
その期間の配信を集める。

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
}


def _bracket(src: str, start: int) -> str:
    """`src[start]` の `[` から対応する `]` までを返す。"""
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "[":
            depth += 1
        elif src[i] == "]":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
    raise ValueError("閉じていない [")


def read_stays() -> dict:
    """countries.ts から「国 → 滞在（期間と街）」を読み出す。

    **正規表現ひと息で国のかたまりを取らない。** 前はこう書いてあった:

        r'slug: "([a-z-]+)",\\n\\s*name: "([^"]+)",(?:.|\\n)*?stays: \\[(...)\\],\\n\\s*summary'

    これが2ヶ所で黙って落ちていた。

    1. 滞在が**複数行**で書いてある国（イギリスとジョージア）は、
       `{ from: "...", to: "...", cities: [...] }` を1行で探す内側の式に当たらない。
       イギリスの2ヶ月とジョージアの9ヶ月が**まるごと消えて**、
       イギリスは8街ぜんぶ、ジョージアは7街のうち5街が「配信はのこっていない」になった
    2. `stays` と `summary` の間に注釈のある国では `\\],\\n\\s*summary` が当たらず、
       **次の国の stays まで飲み込む**（ジョージアがアルメニアの滞在を持っていた）

    どちらも例外を出さずに件数だけ減るので、焼き直しても気づけない。
    括弧を数えて切り出す。
    """
    src = COUNTRIES_TS.read_text(encoding="utf-8")
    src = src[src.index("export const COUNTRIES") :]
    out = {}
    for m in re.finditer(r'slug: "([a-z-]+)",\s*\n\s*name: "([^"]+)",', src):
        tail = src[m.end() :]
        head = tail.find("stays:")
        if head < 0:
            continue
        arr = _bracket(tail, tail.index("[", head))
        stays = []
        for sm in re.finditer(
            r'from:\s*"([\d-]*)",\s*to:\s*"([\d-]*)",\s*cities:\s*\[([^\]]*)\]', arr, re.S
        ):
            cities = [c.strip().strip('"') for c in sm.group(3).split(",") if c.strip()]
            stays.append({"from": sm.group(1), "to": sm.group(2), "cities": cities})
        out[m.group(1)] = {"name": m.group(2), "stays": stays}

    # **止め金。** 上の読み落としは例外を出さず、街が黙って減るだけだった。
    # countries.ts に書いてある `cities:` の数と、読めた滞在の数が合わなければ落とす。
    # 合わないまま焼くと、拾えなかった街が画面で「配信はのこっていない」を名乗る。
    want = len(re.findall(r"cities:\s*\[", src))
    got = sum(len(c["stays"]) for c in out.values())
    if want != got:
        raise ValueError(f"countries.ts の滞在 {want} 件のうち {got} 件しか読めていない")
    return out


def fetch_videos() -> list:
    """配信の一覧（日付・ID・タイトル）を古い順に取る。"""
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
    hit = {v["video_id"] for v in named}
    return [
        v
        for v in window
        if v["video_id"] in hit or not any(n in v["title"] for n in others)
    ]


def main() -> int:
    countries = read_stays()
    videos = fetch_videos()
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
