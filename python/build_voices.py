"""視聴者さんによる「他己紹介」を、配信のコメントから拾って site/content/voices.ts を作る。

`/about` の「島のみんなから見た、あやと」に出るのがこれ。
**こちらで書いた紹介文は1つも混ぜない。** 混ぜると、どれが本当の声なのか分からなくなって、
全部が疑わしくなる。出るのは視聴者さんが書いた文章だけで、絵文字が入っていてもそのまま出す。

**名前とアイコンを出す。** アカウント名（YouTube の表示名）と、そのときのアイコン。
アイコンの URL は列になっていないので、コメントの生データ（`raw_item_json`）から拾う。
どちらも手では書かない。取れなかった人はアイコンが空になり、画面は頭文字の丸に落ちる。

## 使いかた

1. 候補を引く（**BigQuery を叩くのはここだけ。1回で全部引く**）

       BQ_PROJECT_ID=live-streaming-d3cac python python/build_voices.py --dump /tmp/voices.json --since 2026-08-20

   `--since` から先だけを新しく読む。いま出しているものは、日付によらず必ず1行返る
   （選び直すためではなく、**名前とアイコンを取り直すため**）。
   同じクエリで、取り込みが何日まで届いているかも返る（`k` が `d` の行）。

   BigQuery に繋げない環境（この開発箱がそう）は、SQL（`CANDIDATE_SQL`）を
   別の口から流して、返ってきた行を JSON で渡す:

       python python/build_voices.py --dump /tmp/voices.json --rows /tmp/rows.json

2. `/tmp/voices.json` を**全部読んで**、出すものを選び、`python/voices_picks.json` に並べる。
   並べた順が、そのまま画面に出る順になる。選びかたの決まりは下の「選ぶときの決まり」。

3. 焼く

       python python/build_voices.py --build

## 課金

`chat_messages` の全走査で1回およそ 125MB（アイコンのために生データの列まで読むので増えた。
それでも1回1円に届かない）。**回数を増やさない**のが決まりなので、
候補は広めに引いて、絞り込みはローカルでやる（`.claude/skills/monthly-review/SKILL.md` 2章）。

## 選ぶときの決まり

- **書いてある文章をそのまま出す。** 誤字も全角カンマも直さない。直したら引用ではない
- 悪口・いじり（見た目や身長をからかうもの）は採らない
- 内輪すぎるもの、その日の流れが分からないと意味が通らないものは採らない
- **はじめて来た人が読んで、あやとがどんな人か分かるもの**を採る
- 同じ人の言葉ばかりにしない。言っていることが重なるものは1つにする。
  **名前が出るようになったので、ここは前より効く。** 同じ名前が並ぶと、
  「みんなから見た」ではなく「その人から見た」になってしまう
"""

import argparse
import json
import logging
import re
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
PICKS = Path(__file__).resolve().parent / "voices_picks.json"
OUT_TS = ROOT / "site" / "content" / "voices.ts"

BOT_NAME = "@あやとグルメアプリ"

# あやとを名指ししている呼び方。二人称（「優しいなあ」）は主語が無くて、
# 切り出すと誰の話なのか分からなくなるので、名前が入っているものだけを候補にする。
NAME_RE = r"あやと|アヤト|Ayato|ayato|あやちゃん|あやくん"

# ほめている言葉。広めに取る。ここで漏らすと二度目のクエリを叩くことになる。
GOOD_RE = (
    r"優し|やさし|尊敬|努力|真面目|まじめ|素敵|すてき|かっこ|カッコ|天才|すご|凄|面白|おもろ|"
    r"おもしろ|楽し|大好き|好きです|好きだ|癒|元気|勇気|救わ|励ま|感謝|ありがた|人柄|愛さ|純粋|"
    r"前向き|ポジティブ|行動力|挑戦|毎日|継続|続け|ブレな|誠実|素直|正直|熱い|情熱|才能|センス|"
    r"えらい|偉い|感動|尊い|強い|明る|自由|夢|本気|かわいい|可愛い|信頼|安心|癒し|幸せ|勉強になる|"
    r"参考になる|見習|人間力|器|度胸|根性|さすが|流石|才|羨ま|うらやま|憧れ|あこがれ"
)

# 悪口といじり。ここで落としても通読はする（言い回しで抜けるものがあるため）。
BAD_RE = (
    r"死ね|しね|きも|キモ|うざ|ウザ|ブス|ハゲ|バカ|馬鹿|アホ|嫌い|しょぼ|ダサ|デブ|太っ|老け|"
    r"貧乏|クズ|くそ|クソ|下手|http"
)

CANDIDATE_SQL = f"""
WITH base AS (
  SELECT video_id, event_id, published_at, author_channel_id,
         TRIM(message_text) AS t
  FROM `{{project}}.youtube_chat.chat_messages`
  WHERE event_type = 'TEXT'
    AND author_name != '{BOT_NAME}'
    AND message_text IS NOT NULL
), names AS (
  -- 表示名は変わるので最新のものを1つ取る。これが画面に出る名前になる
  SELECT author_channel_id,
         ARRAY_AGG(author_name ORDER BY published_at DESC LIMIT 1)[OFFSET(0)] AS author
  FROM `{{project}}.youtube_chat.chat_messages`
  WHERE event_type = 'TEXT' AND author_channel_id IS NOT NULL
  GROUP BY author_channel_id
), pics AS (
  -- アイコンの URL は列になっていない。生データ（raw_item_json）の中の
  -- authorPhoto に入っているので、JSON の道をたどらずに URL そのものを拾う。
  -- 道（liveChatTextMessageRenderer.authorPhoto...）は YouTube 側の都合で変わるが、
  -- ggpht / googleusercontent の URL が1件目に出てくることは変わらない。
  SELECT author_channel_id,
         ARRAY_AGG(u IGNORE NULLS ORDER BY pa DESC LIMIT 1)[SAFE_OFFSET(0)] AS pic
  FROM (
    SELECT author_channel_id, published_at AS pa,
           REGEXP_EXTRACT(
             TO_JSON_STRING(raw_item_json),
             r'https://(?:yt[0-9]*[.]ggpht[.]com|lh3[.]googleusercontent[.]com)/[^"]+'
           ) AS u
    FROM `{{project}}.youtube_chat.chat_messages`
    WHERE event_type = 'TEXT' AND author_channel_id IS NOT NULL
  )
  GROUP BY author_channel_id
), hit AS (
  -- 日付は UTC で切る。日本時間の朝9時が境目になるので、22時開始の枠と
  -- 0時をまたいだ続きが同じ1日に入る（.claude/skills/monthly-review/SKILL.md 3章）
  SELECT 'v' AS k, b.video_id AS v, b.event_id AS e,
         FORMAT_TIMESTAMP('%Y-%m-%d', b.published_at, 'UTC') AS d,
         n.author AS a, p.pic AS i, b.t AS m
  FROM base b
  LEFT JOIN names n USING (author_channel_id)
  LEFT JOIN pics p USING (author_channel_id)
  -- いま出している13件は、選び直すためではなく**名前とアイコンを取り直すため**に引く。
  -- 新しく読むのは {{window}} から先だけ。全期間を毎回持ってくると、
  -- 読み手（人でも Claude でも）が1600件を読み返すことになって、選び直す手が止まる
  WHERE b.event_id IN ({{picked}})
     OR ({{window}}
    AND CHAR_LENGTH(b.t) BETWEEN 10 AND 90
    AND REGEXP_CONTAINS(b.t, r'{NAME_RE}')
    AND REGEXP_CONTAINS(b.t, r'{GOOD_RE}')
    AND NOT REGEXP_CONTAINS(b.t, r'{BAD_RE}'))
), days AS (
  -- 取り込みがどこまで届いているか。同じ1回のクエリで見る（2回叩かないため）。
  -- k='d' の行は候補ではない。v=その日の動画、e=件数、a=最後のコメント、i=取り込み時刻
  SELECT 'd' AS k,
         STRING_AGG(DISTINCT video_id ORDER BY video_id) AS v,
         CAST(COUNT(*) AS STRING) AS e,
         FORMAT_TIMESTAMP('%Y-%m-%d', published_at, 'UTC') AS d,
         FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', MAX(published_at), 'UTC') AS a,
         FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', MAX(ingested_at), 'UTC') AS i,
         '' AS m
  FROM `{{project}}.youtube_chat.chat_messages`
  WHERE published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
  GROUP BY d
)
SELECT * FROM (SELECT * FROM hit ORDER BY d LIMIT 1600)
UNION ALL
SELECT * FROM days
ORDER BY k, d
"""


def picked_ids() -> list[str]:
    """いま出しているもののイベントID。名前とアイコンを取り直すために引き当てる。"""
    if not PICKS.exists():
        return []
    return [p["e"] for p in json.loads(PICKS.read_text(encoding="utf-8"))["picks"]]


def sql(project: str, since: str) -> str:
    """候補を引く SQL。`since` から先だけを新しく読む（UTC の日付）。"""
    ids = ", ".join("'" + i.replace("'", "") + "'" for i in picked_ids()) or "''"
    return CANDIDATE_SQL.format(
        project=project,
        picked=ids,
        window=f"b.published_at >= TIMESTAMP('{since} 00:00:00+00')",
    )


def fetch_rows(project: str, since: str) -> list[dict]:
    """BigQuery から候補を引く。**1回で全部引く。**"""
    from google.cloud import bigquery  # 繋げない環境でも --rows で動くよう、ここで読む

    client = bigquery.Client(project=project)
    job = client.query(sql(project, since))
    rows = [dict(r) for r in job.result()]
    logger.info("候補 %s件 / 課金 %.1fMB", len(rows), (job.total_bytes_billed or 0) / 1e6)
    client.close()
    return rows


# アイコンは 32px の丸で出している。網膜の画面で2倍になるので 64px を頼む。
# YouTube から返ってくる URL は `=s32-c-k-...` のように寸法が付いているので、
# そこだけ差し替える（`docs/island-design.md`「アイコンの寸法は画面に出る大きさから決める」）
ICON_PX = 64


def icon_url(u: str | None) -> str:
    """チャットの生データから拾ったアイコンの URL を、出す大きさに直す。"""
    if not u:
        return ""
    u = u.split("?")[0]
    # 末尾の指定（=s32-c-k-c0x00ffffff-no-rj）を、欲しい寸法の指定に置き換える
    base = u.split("=")[0]
    return f"{base}=s{ICON_PX}-c-k-c0x00ffffff-no-rj"


def esc(s: str) -> str:
    """TypeScript の文字列に入れる。改行は空白に潰す（1行の引用として出すので）。"""
    return re.sub(r"\s*\n\s*", " ", s).replace("\\", "\\\\").replace('"', '\\"')


def build() -> int:
    """`voices_picks.json` を `site/content/voices.ts` に焼く。"""
    picks = json.loads(PICKS.read_text(encoding="utf-8"))["picks"]
    lines = []
    for p in picks:
        icon = icon_url(p.get("i"))
        lines.append(
            f'  {{ date: "{p["d"]}", videoId: "{p["v"]}", eventId: "{p["e"]}", '
            f'name: "{esc(p.get("a") or "")}", icon: "{icon}", '
            f'text: "{esc(p["m"])}" }},'
        )
    body = "\n".join(lines)
    ts = f'''/**
 * 視聴者さんによる「他己紹介」。**手で書かない。**
 *
 * `python/build_voices.py` が配信のチャット（BigQuery）から候補を引いて、
 * `python/voices_picks.json` で選んだものを、このファイルに焼いている。
 * 直すときは元の2つを直して焼き直す（`docs/island-design.md` 「自動生成ファイル」）。
 *
 * **文章は1文字も直っていない。** 誤字も、全角カンマも、絵文字も、書かれたまま。
 * 島で絵文字を出していいのは、配信のタイトルの引用と、この文章だけ。
 *
 * **名前とアイコンを出す。** チャットに出ている表示名と、そのときのアイコン。
 * どちらもコメントの生データ（`raw_item_json`）から引いたもので、手では書かない。
 * アイコンが取れなかった人は `icon` が空になる。画面は頭文字の丸に落とす。
 */
export type Voice = {{
  /** 配信の日（UTC で切った配信日） */
  date: string;
  /** その配信 */
  videoId: string;
  /** チャットのイベントID。書いた人を引き直すための鍵 */
  eventId: string;
  /** YouTube の表示名 */
  name: string;
  /** YouTube のアイコン。取れなかったときは空 */
  icon: string;
  /** 書かれたままの本文 */
  text: string;
}};

export const VOICES: Voice[] = [
{body}
];
'''
    OUT_TS.write_text(ts, encoding="utf-8")
    logger.info("%s に %s件 書き出した", OUT_TS.relative_to(ROOT), len(picks))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", help="候補の書き出し先（JSON）")
    ap.add_argument("--rows", help="BigQuery に繋げないとき、引いてきた行の JSON")
    ap.add_argument("--build", action="store_true", help="picks を voices.ts に焼く")
    ap.add_argument("--sql", action="store_true", help="候補を引く SQL を出すだけ")
    ap.add_argument(
        "--since",
        default="2026-08-20",
        help="この日（UTC）から先を新しく読む。前に選んだものは日付によらず引き当てる",
    )
    a = ap.parse_args()

    if a.sql:
        import os

        print(sql(os.getenv("BQ_PROJECT_ID", "live-streaming-d3cac"), a.since))
        return 0

    if a.dump:
        if a.rows:
            rows = json.loads(Path(a.rows).read_text(encoding="utf-8"))
        else:
            import os

            project = os.getenv("BQ_PROJECT_ID")
            if not project:
                logger.error("BQ_PROJECT_ID が要る（または --rows で行を渡す）")
                return 1
            rows = fetch_rows(project, a.since)
        Path(a.dump).write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        logger.info("%s に %s件", a.dump, len(rows))

    if a.build:
        return build()

    if not a.dump:
        ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
