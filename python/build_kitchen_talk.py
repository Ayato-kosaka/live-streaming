"""作った料理の1枚に出す「その日の台所」を焼く（`site/content/kitchenTalk.ts`）。

料理の1枚は、名前と絵と一行の添え書きしか持っていなかった。
32枚ぜんぶが同じ形で、面の9割が「よその料理へ行く格子」だった。
足りないのは飾りではなく**その日そこで何があったか**なので、
配信のチャット（BigQuery）から3つだけ引いてくる。

1. **その日、台所にいた人の数**（`people`）とコメントの数（`msgs`）と長さ（`mins`）
2. **その日いた住人**（`there`）。`content/residents.ts` に絵のある人だけ。
   島を歩いているキャラクターが、そのまま料理の面に出る
3. **その日の声**（`talk`）。書かれたままの引用。手で選ぶ

**3 だけは手で選ぶ。** 機械で選ぶと「こんばんは」と「おいしそう」が並ぶ。
料理の話として、初めて読む人にも意味の通るものだけを採る
（`python/kitchen_talk_picks.json`。選びかたはそのファイルの `_note`）。

## この箱から BigQuery に繋げない

`build_voices.py` と同じで、application default credentials が無い。
SQL は別の口（MCP など）から流して、返ってきた行を `python/data/*.json` に
置いてある。**焼き直すときは、その3つを取り直してから `--build` する。**

    python/data/kitchen_video_stats.json   動画ごとの msgs / people / paid / mins
    python/data/kitchen_residents.json     動画ごとの、住人のチャンネルID（カンマ区切り）
    python/data/kitchen_icons.json         引用した人の YouTube アイコン

取り直す SQL は `SQL_STATS` `SQL_RESIDENTS` `SQL_ICONS` に置いてある。

    python python/build_kitchen_talk.py --build
"""

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
PICKS = HERE / "kitchen_talk_picks.json"
RECIPES_TS = ROOT / "site" / "content" / "recipes.ts"
RESIDENTS_TS = ROOT / "site" / "content" / "residents.ts"
OUT_TS = ROOT / "site" / "content" / "kitchenTalk.ts"

BOT = "@あやとグルメアプリ"

# 引用のアイコンは 32px の丸で出す。網膜の画面のぶんで2倍を頼む
# （`.avoice-face` と同じ寸法。`build_voices.py` の ICON_PX と揃えてある）
ICON_PX = 64

SQL_STATS = f"""
-- 料理に紐づく配信ぜんぶ。{{vids}} は recipes.ts の videoId を並べたもの
SELECT video_id,
  COUNTIF(event_type='TEXT') AS msgs,
  COUNT(DISTINCT IF(event_type='TEXT', author_channel_id, NULL)) AS people,
  COUNTIF(event_type='PAID') AS paid,
  TIMESTAMP_DIFF(MAX(published_at), MIN(published_at), MINUTE) AS mins
FROM `live-streaming-d3cac.youtube_chat.chat_messages`
WHERE video_id IN ({{vids}}) AND author_name != '{BOT}'
GROUP BY video_id
"""

SQL_RESIDENTS = """
-- その配信にコメントした人のうち、島に絵のある人だけ。{chans} は residents.ts の channel
SELECT video_id, STRING_AGG(DISTINCT author_channel_id ORDER BY author_channel_id) AS chans
FROM `live-streaming-d3cac.youtube_chat.chat_messages`
WHERE event_type='TEXT' AND video_id IN ({vids}) AND author_channel_id IN ({chans})
GROUP BY video_id
"""

SQL_ICONS = """
-- 引用した人のアイコン。列になっていないので生データから URL を拾う（build_voices.py と同じ道）
SELECT author_name,
  ARRAY_AGG(u IGNORE NULLS ORDER BY pa DESC LIMIT 1)[SAFE_OFFSET(0)] AS pic
FROM (
  SELECT author_name, published_at AS pa,
    REGEXP_EXTRACT(TO_JSON_STRING(raw_item_json),
      r'https://(?:yt[0-9]*[.]ggpht[.]com|lh3[.]googleusercontent[.]com)/[^"]+') AS u
  FROM `live-streaming-d3cac.youtube_chat.chat_messages`
  WHERE event_type='TEXT' AND author_name IN ({names})
)
GROUP BY author_name
"""


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def recipes() -> list[dict]:
    """recipes.ts から slug と配信の対応だけを読む。TS を1つの正にするため、写しを作らない。"""
    src = RECIPES_TS.read_text(encoding="utf-8")
    out = []
    for block in src.split('\n  {\n    slug: "')[1:]:
        slug = block[: block.index('"')]
        streams = [
            {"label": m[0], "date": m[1], "v": m[2]}
            for m in re.findall(
                r'\{ label: "([^"]+)", date: "([^"]+)", videoId: "([^"]+)"', block
            )
        ]
        out.append({"slug": slug, "streams": streams})
    return out


def resident_icons() -> dict[str, str]:
    """チャンネルID → キャラクターの絵の id（residents.ts）。"""
    src = RESIDENTS_TS.read_text(encoding="utf-8")
    return {
        m[1]: m[0]
        for m in re.findall(r'icon: "([^"]+)".*?channel: "([^"]+)"', src)
    }


def icon_url(u: str) -> str:
    """アイコンの URL を、画面に出す大きさに直す（寸法の指定を差し替える）。"""
    return f"{u.split('=')[0]}=s{ICON_PX}-c-k-c0x00ffffff-no-rj" if u else ""


def ts_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def build() -> None:
    stats = {r["v"]: r for r in load("kitchen_video_stats.json")}
    res_by_video = load("kitchen_residents.json")
    icons = load("kitchen_icons.json")
    picks = json.loads(PICKS.read_text(encoding="utf-8"))["picks"]
    char_of = resident_icons()

    rows = []
    for r in recipes():
        slug = r["slug"]
        # 「その日」は調理の日。企画会議や買い出しは別の日なので混ぜない
        cook = [s for s in r["streams"] if s["label"] in ("調理", "リベンジ")]
        day = cook[0]["v"] if cook else (r["streams"][0]["v"] if r["streams"] else None)
        st = stats.get(day, {})
        # 島に絵のある人だけ。順番は residents.ts の並び（よく来ている人が先）
        chans = [c for c in (res_by_video.get(day) or "").split(",") if c]
        there = [char_of[c] for c in char_of if c in chans]
        talk = [
            {
                "v": q["v"],
                "name": q["name"],
                "icon": icon_url(icons.get(q["name"], "")),
                "text": q["t"],
            }
            for q in picks.get(slug, [])
        ]
        if not (st or there or talk):
            continue
        rows.append(
            {
                "slug": slug,
                "people": st.get("people", 0),
                "msgs": st.get("msgs", 0),
                "mins": st.get("mins", 0),
                "there": there,
                "talk": talk,
            }
        )

    body = []
    for x in rows:
        talk = ", ".join(
            "{ v: %s, name: %s, icon: %s, text: %s }"
            % (ts_str(t["v"]), ts_str(t["name"]), ts_str(t["icon"]), ts_str(t["text"]))
            for t in x["talk"]
        )
        there = ", ".join(ts_str(t) for t in x["there"])
        body.append(
            "  %s: { people: %d, msgs: %d, mins: %d, there: [%s], talk: [%s] },"
            % (ts_str(x["slug"]), x["people"], x["msgs"], x["mins"], there, talk)
        )

    OUT_TS.write_text(HEADER + "\n".join(body) + FOOTER, encoding="utf-8")
    print(
        f"{OUT_TS} … {len(rows)}品 / 引用 {sum(len(x['talk']) for x in rows)}件 / "
        f"住人の出た品 {sum(1 for x in rows if x['there'])}"
    )


HEADER = '''/**
 * 作った料理の1枚に出す「その日の台所」。**手で直さない。**
 * `python/build_kitchen_talk.py` が BigQuery のチャットから焼く。
 *
 * `people` `msgs` `mins` は、その品を**作った日**の配信の数字
 * （企画会議や買い出しは別の日なので混ぜない）。
 * `there` はその日コメントしていた人のうち、島に絵のある人のキャラクター。
 * `talk` は書かれたままの引用。**1文字も直さない**（`docs/island-design.md` 1章の例外）。
 */
export type KitchenTalkQuote = {
  /** その言葉が出た配信 */
  v: string;
  /** YouTube の表示名 */
  name: string;
  /** YouTube のアイコン。取れなかったときは空 */
  icon: string;
  /** 書かれたままの本文 */
  text: string;
};

export type KitchenTalk = {
  /** その日、チャットに書いた人の数 */
  people: number;
  /** その日のコメントの数 */
  msgs: number;
  /** 最初と最後のコメントの間（分）。配信のおおよその長さ */
  mins: number;
  /** その日いた住人のキャラクター（`content/residents.ts` の icon） */
  there: string[];
  /** その日の声 */
  talk: KitchenTalkQuote[];
};

const KITCHEN_TALK: Record<string, KitchenTalk> = {
'''

FOOTER = """};

export const kitchenTalk = (slug: string): KitchenTalk | undefined => KITCHEN_TALK[slug];
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--sql", action="store_true", help="取り直す SQL を出す")
    a = ap.parse_args()
    if a.sql:
        print(SQL_STATS, SQL_RESIDENTS, SQL_ICONS)
    else:
        build()
