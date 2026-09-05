"""1年前の今日を引けるように、配信を日めくりにして site/content/onThisDay.ts を作る。

島の「今日の島」の板に「1年前の今日はボルジョミにいました」と出すためのもの。
静的書き出しなので日付の判定はブラウザ側でやる。ここは 366日ぶんの引き当て表を焼くだけ。

**1日1本にしぼる。** 同じ配信が電波切れで何本にも分かれている日があって
（2025-06-24 は同じタイトルが8本）、そのまま並べると板が同じ文字で埋まる。
その日のうちコメントがいちばん多かった1本を、その日の代表とする。
「よく見られた配信」を選ぶことになるので、思い出として出すのにも都合がいい。

居た場所は countries.ts の滞在期間から引く。タイトルに街の名前が入っていれば街、
入っていなければ国の名前にする。ここを推測で埋めると嘘の場所を出すことになるので、
根拠のあるものだけを使う。

実行:
  BQ_PROJECT_ID=... python python/build_on_this_day.py

BigQuery に繋げない環境では、あらかじめ吸い出した行を渡せる:
  python python/build_on_this_day.py --rows /tmp/otd_rows.json
  （[{"d","v","t","n"}, ...] の JSON。SQL は fetch_videos() のものと同じ）
"""

import argparse
import json
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
COUNTRIES_TS = ROOT / "site" / "content" / "countries.ts"
OUT_TS = ROOT / "site" / "content" / "onThisDay.ts"

# タイトルでの街の書き方のゆれ。build_city_streams.py と同じ考え方。
ALIASES = {
    "モン・サン・ミシェル": ["モンサンミッシェル", "モンサンミシェル", "モン・サン"],
    "アブ・シンベル": ["アブシンベル"],
    "メグリ（国境）": ["メグリ"],
    "セヴァン湖": ["セヴァン"],
    "カズベキ": ["カズヘキ", "ゲルゲティ"],
    "バクー": ["アゼバイ"],
}


def read_countries() -> list:
    """countries.ts から「国 → 滞在（期間と街）」を読み出す。

    build_city_streams.py の正規表現は1行に書かれた stays しか拾えず、
    イギリスとジョージア（複数行に折り返してある）を取りこぼす。
    ここでは国の塊を切り出してから、その中の from/to/cities を拾う。
    """
    src = COUNTRIES_TS.read_text(encoding="utf-8")
    out = []
    # 国の塊は slug から次の slug（または配列の終わり）まで
    heads = [m for m in re.finditer(r'\n    slug: "([a-z-]+)",\n    name: "([^"]+)",', src)]
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(src)
        block = src[m.start():end]
        stays_m = re.search(r"stays: \[((?:.|\n)*?)\],\n    summary", block)
        if not stays_m:
            continue
        stays = []
        for sm in re.finditer(
            r'from: "([\d-]*)",\s*\n?\s*to: "([\d-]*)",\s*\n?\s*cities: \[((?:.|\n)*?)\]',
            stays_m.group(1),
        ):
            cities = [c.strip().strip('"') for c in sm.group(3).split(",") if c.strip()]
            stays.append({"from": sm.group(1), "to": sm.group(2), "cities": cities})
        out.append({"slug": m.group(1), "name": m.group(2), "stays": stays})
    return out


def fetch_videos() -> list:
    """その日の代表になる配信を、JSTの日付ごとに1本ずつ取る。"""
    from google.cloud import bigquery  # BQ を使うときだけ要る

    from config import BQ_DATASET, BQ_PROJECT_ID

    sql = f"""
    WITH v AS (
      SELECT video_id, title,
             FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS d,
             actual_start_time AS st
      FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.videos`
      WHERE actual_start_time IS NOT NULL
    ),
    c AS (
      SELECT video_id, COUNT(*) AS n
      FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
      GROUP BY video_id
    ),
    j AS (SELECT v.*, IFNULL(c.n, 0) AS n FROM v LEFT JOIN c USING (video_id)),
    r AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY d ORDER BY n DESC, st ASC) AS rk FROM j
    )
    SELECT d, video_id AS v, title AS t, n FROM r WHERE rk = 1 ORDER BY d
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    return [dict(r) for r in client.query(sql).result()]


def names_of(city: str) -> list:
    """その街を指すタイトルの書き方。"""
    base = [city] + ALIASES.get(city, [])
    if "・" in city:
        base.append(city.replace("・", ""))
    if "（" in city:
        base.append(city.split("（")[0])
    return base


def place_of(countries: list, date: str, title: str) -> tuple:
    """その日どこに居たか。(見せる場所, 国のslug) を返す。

    国は滞在期間から確実に決まる。街はタイトルに名前が出ているときだけ。
    出ていなければ国の名前でとどめる。推測で街を書かない。
    """
    for c in countries:
        for stay in c["stays"]:
            hi = stay["to"] or "9999-12-31"
            if not (stay["from"] <= date <= hi):
                continue
            for city in stay["cities"]:
                if any(k in title for k in names_of(city)):
                    return city, c["slug"]
            return c["name"], c["slug"]
    return "", ""


def build(rows: list, countries: list) -> dict:
    """月日（MM-DD）ごとに、新しい順で並べる。"""
    by_md = defaultdict(list)
    for r in rows:
        date = r["d"]
        # タイトルに改行が入っているものがある（イラン徒歩企画）。板は1行で出すので潰す
        title = " ".join(str(r["t"]).split())
        place, slug = place_of(countries, date, title)
        by_md[date[5:]].append(
            {"d": date, "v": r["v"], "t": title, "p": place, "c": slug, "n": int(r["n"])}
        )
    for md in by_md:
        by_md[md].sort(key=lambda x: x["d"], reverse=True)
    return dict(sorted(by_md.items()))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", help="BigQuery の代わりに読む JSON")
    args = ap.parse_args()

    countries = read_countries()
    if not countries:
        logger.error("countries.ts から国を読めなかった")
        return 1
    rows = (
        json.loads(Path(args.rows).read_text(encoding="utf-8"))
        if args.rows
        else fetch_videos()
    )
    logger.info("配信 %d 本、国 %d カ国", len(rows), len(countries))

    table = build(rows, countries)
    unknown = [e["d"] for v in table.values() for e in v if not e["p"]]
    if unknown:
        logger.warning("居た場所が引けなかった日: %d (%s ...)", len(unknown), unknown[:5])

    body = json.dumps(table, ensure_ascii=False, separators=(",", ":"))
    # 焼き込みの終わりの日。ここから先は「配信が無かった」ではなく「まだ焼いていない」
    latest = max(e["d"] for v in table.values() for e in v)
    OUT_TS.write_text(
        "/**\n"
        " * 1年前の今日、あやとがどこで何を配信していたか。\n"
        " * python/build_on_this_day.py が BigQuery から作る。**手で編集しない。**\n"
        " *\n"
        " * 月日(MM-DD)で引くと、その日にあった配信が新しい順に出る。\n"
        " * 1日につき1本だけ。その日いちばんコメントが多かった配信を代表にしてある。\n"
        " *\n"
        " * 静的書き出しなので、今日が何日かはビルド時に決められない。\n"
        " * 引くのは画面が出てから（`site/lib/nightly.ts` の `jstNow`）。\n"
        " */\n\n"
        "export type PastStream = {\n"
        "  /** 配信のあった日。JST の YYYY-MM-DD */\n"
        "  d: string;\n"
        "  /** YouTube の動画ID */\n"
        "  v: string;\n"
        "  /** 配信のタイトル。引用なのでそのまま出す（絵文字が入っていてもよい） */\n"
        "  t: string;\n"
        "  /** そのとき居た街。街まで分からない日は国の名前 */\n"
        "  p: string;\n"
        "  /** 国の slug。国旗を出すのに使う */\n"
        "  c: string;\n"
        "  /** その配信に付いたコメントの数 */\n"
        "  n: number;\n"
        "};\n\n"
        "const ON_THIS_DAY: Record<string, PastStream[]> =\n"
        f"  {body};\n\n"
        "/** その月日にあった配信。新しい順。 */\n"
        "export const pastOn = (md: string): PastStream[] => ON_THIS_DAY[md] ?? [];\n\n"
        "/**\n"
        " * ちょうど1年前の今日の配信。無ければ、それより前の年でいちばん近いもの。\n"
        " * 「1年前」と言い切れるのは1年ぶんだけなので、何年前かも返す。\n"
        " */\n"
        "export function lastYearOn(md: string, year: number): { s: PastStream; ago: number } | null {\n"
        "  for (const s of pastOn(md)) {\n"
        "    const ago = year - Number(s.d.slice(0, 4));\n"
        "    if (ago >= 1) return { s, ago };\n"
        "  }\n"
        "  return null;\n"
        "}\n\n"
        "/**\n"
        " * この表に入っている、いちばん新しい配信の日。\n"
        " *\n"
        " * **焼き込みなので、書き出した日から先は入っていない。**\n"
        " * 「前に来てから何があったか」を数えるときは、ここより後ろを数えてはいけない。\n"
        " * 数えると、まだ焼かれていないだけの日を「配信が無かった日」と言うことになる。\n"
        " */\n"
        f'export const LATEST_DAY = \"{latest}\";\n\n'
        "/** 日付だけを並べたもの。数えるときにしか要らないので、最初に聞かれてから作る。 */\n"
        "let days: string[] | null = null;\n\n"
        "/**\n"
        " * after（含まない）から until（含む）までに、配信のあった日が何日あったか。\n"
        " *\n"
        " * **本数ではなく日数。** この表は1日1本にしぼってあるので\n"
        " * （電波切れで分かれた配信を数え上げない）、返せるのは日数のほう。\n"
        " */\n"
        "export function streamDaysBetween(after: string, until: string): number {\n"
        "  if (!days) days = Object.values(ON_THIS_DAY).flatMap((v) => v.map((s) => s.d));\n"
        "  return days.filter((d) => d > after && d <= until).length;\n"
        "}\n",
        encoding="utf-8",
    )
    total = sum(len(v) for v in table.values())
    logger.info("%s に %d 日 / %d 本を書き出した", OUT_TS, len(table), total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
