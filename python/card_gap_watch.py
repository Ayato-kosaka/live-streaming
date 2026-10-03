"""**写真はあるのに、カードが0枚の日**を数えて赤くする。

    python3 python/card_gap_watch.py
    python3 python/card_gap_watch.py --url ''        # 公開の口は見ない

終了コード 0=問題なし / 1=写真はあるのにカードが0枚の日がある /
**2=元データが読めない（＝判定が出ていない）**（`docs/island-standards.md` §15）。

## なぜ要るか — 11日間、毎晩「緑」だった

カードは 2026-09-20 で止まり、**9/21 から 10/01 まで11日間0枚**だった。
原因は `island_cards.py` が「企画 → その企画の画像」で当てていたことで、
企画の表（手書き）が 9/20 までしか無かったから
（`docs/island-card-rfc.md` 0章）。

**気づけなかったのはそこではない。** 毎晩のジョブは11日間ずっと
「あるべき617枚／新しく作る0枚」と出して、**一度も赤くならなかった。**
`island_cards.py` から見れば、当たる投げ銭が無いのだから0枚は正しい答えで、
**自分の当たり方が壊れていることは、自分の当たり方では分からない。**

だからここは **`island_cards.py` の当たり方に1行も頼らない。**
生の `islandTips.day` で「その日投げてくれた人」を数え、`role: "card"` の
画像の枚数を数えて、**期待 = 写真 × 人** を自分で出す。
当たり方が壊れても、期待は壊れない。

## 色の決め（`judge_day`）

| 何が起きているか | 色 |
| --- | --- |
| 期待が1枚以上あるのに、カードが0枚 | **赤**（終了コード 1） |
| 0 < カード < 期待（足りない） | 黄色（ログに出すだけ） |
| カード ≧ 期待 | 緑 |
| 写真はあるが、投げ銭が0人 | **緑。** 0枚が正しい |

**足りない日を赤にしない。** 同じ人が複数の配信にまたがって投げた日や、
`videoIds` で別の日の写真に当たった日は、ふつうに期待とずれる
（本番の 9/17 は期待119に対して136枚。`docs/island-card-data.md` 4.2）。
そこを赤にすると、毎晩赤いものを誰も読まなくなる。

## 0時またぎの逃げ道（`ABSENCES`）

生の `day` で数えるので、**22時に始まった配信に 00:23 で投げてくれた人**は
翌日に数えられる。その翌日に写真があれば「人がいるのにカード0」に見えるが、
本当に0枚が正しい。そういう日は `ABSENCES` に**日付と理由**を書いて外す。

**2026-10-01 から、この形はほとんど出なくなった。** 組み立ての側に
「**その日を配信日とする投げ銭が0件の日の写真は、その日に（生の日付で）
届いた人に渡す**」という決めが入った（`docs/island-cards.md` 2章）ので、
配信の無い日はカードが出るようになった。つまり**生の `day` で人がいる日に
カードが0枚なら、いまはたいてい本当に壊れている。**
**数え方はここでは1行も変えていない**——変えると「組み立てに頼らず数える」
というこの見張りの存在理由が消える。逃げ道は残してある。

書きかたは `tools/sprites/prodsweep.mjs` の `ABSENCES` と同じ
（**12文字以上・書いた日の `YYYY-MM-DD` 入り**）。`excuse_ok` が見る。
形の足りない理由は**受け付けない＝その日は赤のまま。** 黙って外せる逃げ道を
作ると、次に本当に止まった日にそこへ書いて終わりになる。

使わなくなった逃げ道（もうカードが出ている日）は**黄色で出す。**
赤にしないのは、消し忘れ1件で毎晩赤くするほどの話ではないから。

## 公開の口が、持っているぶんを全部返しているか

あやと（2026-10-01）:

> カードは600が上限とかやめて欲しい。大昔のカードも取得できないとおかしい。

`GET /island-api/cards` は新しい順 600枚で切っている（`functions/src/cards.ts`
の `MAX_CARDS`）。本番は617枚なので、**いちばん古い17枚が公開の口から取れない。**
**切れていること自体が、どこにも出ていなかった。** 上限を外しても、次に別の
理由で切れたらまた黙る。だからここで毎晩突き合わせる。

| | |
| --- | --- |
| 口が返した枚数 < `islandCards` の総枚数 | **赤** |
| 応答が 500KB を超えた | 黄色 |
| 口に届かなかった | **2（測れなかった）。緑を返さない** |

**届かなかったときに緑を返さない**のがここの肝で、判定が出ていないのに
緑を返す道具は、無いより悪い（`docs/island-standards.md` 13章）。

### 500KB の根拠

転送量。`/cards` はスマホで開く面で、**2026-10-01 の実測で 343,892 バイト**
（600枚）。上限を外すと617枚ぶんで約 354KB、このまま1日10枚増えると
**半年で 500KB を超える**（1枚あたり約573バイト × 増分）。
そこが「写真ごとに分けて配る」形へ作り直す合図なので、超えた晩に字を出す。
赤にしないのは、重いことは壊れていることではないから。

## ログ

このリポジトリは公開で、Actions のログも誰でも読める。
**日付と件数だけを出す。** 誰が取りこぼされたかの明細（チャンネルID）は
`python/logsafe.py` を通すので、公開の場では1行も出ない。
**公開の口の応答の中身も出さない**（枚数とバイト数だけ）。
"""

import argparse
import logging
import re
import sys
from typing import Dict, Iterable, List, Optional, Tuple

from google.cloud import firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_PROJECT_ID  # noqa: E402
# 日本時間の日付に切るところは台帳・カードと同じものを使う。**3か所に書かない**
from island_tips import jst_day  # noqa: E402
from logsafe import detail_lines  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 公開の口。**読むだけ**なので本番を汚さない。鍵も要らない
CARDS_URL = "https://live-streaming-d3cac.web.app/island-api/cards"

# 応答がこれを超えたら黄色。根拠は上の docstring（2026-10-01 の実測 343,892B）
BIG_BYTES = 500 * 1024

RED = "red"
YELLOW = "yellow"
GREEN = "green"
EXCUSED = "excused"
UNMEASURED = "unmeasured"

# 色 -> ログに出す字
LABEL = {
    RED: "赤",
    YELLOW: "黄",
    GREEN: "緑",
    EXCUSED: "逃",
    UNMEASURED: "？",
}

# **「写真も人もいるのにカード0枚」で正しい日。**
#
# 日付 -> 理由。理由は **12文字以上**で、**書いた日（YYYY-MM-DD）**を入れる
# （`excuse_ok`）。形が足りないものは受け付けない＝その日は赤のまま。
#
# いまは空。ここに足すのは、生の `day` では人がいるのに、その人たちが
# **前日の配信**の人だったと確かめた日だけ。
ABSENCES: Dict[str, str] = {}


def excuse_ok(why: object) -> bool:
    """逃げ道の理由として通る形か。

    `tools/sprites/prodsweep.mjs` の `excuseOk` と**同じ決め**。
    空・短い・日付が無いのどれかなら通さない。「0時またぎ」だけで
    外せると、次に本当に止まった日もそう書いて終わりになる。

    Args:
        why: 書いてある理由

    Returns:
        通る形なら True
    """
    w = str(why or "").strip()
    if len(w) < 12:
        return False
    return bool(re.search(r"20\d\d-\d\d-\d\d", w))


def image_day_raw(im: dict) -> str:
    """画像が「何日の写真か」を、**生の欄だけ**で出す。

    `island_cards.image_day` と違って**企画を見ない。** 当たり方の側が
    企画を引けなくなっても、こちらの数が一緒に0にならないようにするため。

    Args:
        im: 画像1件（`day` / `at`）

    Returns:
        YYYY-MM-DD。分からなければ空文字
    """
    if isinstance(im.get("day"), str) and im["day"]:
        return im["day"]
    if im.get("at"):
        return jst_day(int(im["at"]))
    return ""


def tally(images: Iterable[dict],
          tips: Iterable[dict],
          cards: Iterable[dict]) -> dict:
    """生のデータを日ごとに数える。**当たり方には一切頼らない。**

    Args:
        images: `islandStreamEventImage` の中身（`role` / `url` / `day` / `at`）
        tips: `islandTips` の中身（`channelId` / `day`）
        cards: `islandCards` の中身（`day` / `channelId`）

    Returns:
        `rows`（日ごと・新しい順）と、日の分からなかった件数、カードの総数
    """
    photos: Dict[str, int] = {}
    no_day_images = 0
    for im in images:
        if (im.get("role") or "card") != "card" or not im.get("url"):
            continue
        day = image_day_raw(im)
        if not day:
            # 日の分からない写真。**0に畳まず、数えて出す**
            no_day_images += 1
            continue
        photos[day] = photos.get(day, 0) + 1

    # **生の `day` で数える。** `videoStartedAt` の補正をここで真似ると、
    # 当たり方と同じ式を2か所に置くことになって、同じ日に一緒に壊れる
    people: Dict[str, set] = {}
    no_day_tips = 0
    for t in tips:
        ch = t.get("channelId")
        if not ch:
            continue
        day = t.get("day") if isinstance(t.get("day"), str) else ""
        if not day:
            no_day_tips += 1
            continue
        people.setdefault(day, set()).add(ch)

    made: Dict[str, int] = {}
    total_cards = 0
    no_day_cards = 0
    for c in cards:
        total_cards += 1
        day = c.get("day") if isinstance(c.get("day"), str) else ""
        if not day:
            no_day_cards += 1
            continue
        made[day] = made.get(day, 0) + 1

    rows = []
    for day in sorted(set(photos) | set(people) | set(made), reverse=True):
        n_photo = photos.get(day, 0)
        n_people = len(people.get(day, ()))
        rows.append({
            "day": day,
            "photos": n_photo,
            "people": n_people,
            "cards": made.get(day, 0),
            "expected": n_photo * n_people,
        })
    return {
        "rows": rows,
        "noDayImages": no_day_images,
        "noDayTips": no_day_tips,
        "noDayCards": no_day_cards,
        "totalCards": total_cards,
    }


def judge_day(row: dict, absences: Optional[Dict[str, str]] = None) -> Tuple[str, str]:
    """1日ぶんの色を決める。

    Args:
        row: `tally` が返す1行
        absences: 逃げ道の表（省略すると `ABSENCES`）

    Returns:
        (色, ひとこと)
    """
    if absences is None:
        absences = ABSENCES
    want = row["expected"]
    got = row["cards"]
    if want >= 1 and got == 0:
        why = absences.get(row["day"])
        if why is None:
            return RED, f"写真{row['photos']}枚・{row['people']}人いるのにカード0枚"
        if not excuse_ok(why):
            # **黙って外さない。** 形の足りない逃げ道は無かったことにする
            return RED, "逃げ道の書き方が足りない（12文字以上・日付つき）"
        return EXCUSED, why
    if 0 < got < want:
        return YELLOW, f"期待{want}枚に対して{got}枚"
    return GREEN, ""


def stale_excuses(rows: List[dict],
                  verdicts: Dict[str, str],
                  absences: Optional[Dict[str, str]] = None) -> List[str]:
    """もう要らない逃げ道。**腐った表を黙って持たない。**

    赤くならない日に書いてある逃げ道は、次に本当に止まった日に効いてしまう。
    赤にはしない（消し忘れ1件で毎晩赤くするほどの話ではない）が、字には出す。

    Args:
        rows: `tally` が返した行
        verdicts: 日 -> 色
        absences: 逃げ道の表（省略すると `ABSENCES`）

    Returns:
        もう要らない日付
    """
    if absences is None:
        absences = ABSENCES
    seen = {r["day"] for r in rows}
    out = []
    for day in sorted(absences):
        if day not in seen or verdicts.get(day) not in (RED, EXCUSED):
            out.append(day)
    return out


def judge_reach(total: int,
                served: Optional[int],
                size: Optional[int]) -> Tuple[str, str]:
    """公開の口が、持っているぶんを全部返しているか。

    Args:
        total: `islandCards` の総枚数
        served: 公開の口が返した枚数。測れなかったら None
        size: 応答のバイト数。測れなかったら None

    Returns:
        (色, ひとこと)
    """
    if served is None:
        # **緑を返さない。** 判定が出ていないのに緑を返す道具は、無いより悪い
        return UNMEASURED, "公開の口が読めなかった（持っているぶんを返せているか不明）"
    if served < total:
        return RED, f"口が返したのは{served}枚。{total - served}枚が取れていない"
    if size is not None and size > BIG_BYTES:
        return YELLOW, f"応答が{size:,}バイト（{BIG_BYTES:,} を超えた）"
    return GREEN, f"{served}枚 / {size if size is not None else '?'}バイト"


def exit_code(day_verdicts: Iterable[str], reach: str) -> int:
    """終了コードを決める。

    **測れなかった（2）が、赤（1）より強い。** 赤は「こう壊れている」と
    言えているが、2は何も言えていない。言えていないほうを先に直す。

    Args:
        day_verdicts: 日ごとの色
        reach: 公開の口の色

    Returns:
        0 / 1 / 2
    """
    colors = list(day_verdicts)
    if reach == UNMEASURED or UNMEASURED in colors:
        return 2
    if reach == RED or RED in colors:
        return 1
    return 0


def read_public(url: str, timeout: int = 60) -> Tuple[Optional[int], Optional[int]]:
    """公開の口を1回叩く。**応答の中身はどこにも出さない。**

    Args:
        url: 口の URL。空なら叩かない
        timeout: 秒

    Returns:
        (返ってきた枚数, バイト数)。読めなければ (None, None)
    """
    if not url:
        return None, None
    try:
        # **ここで取り込む。** 頭で取り込むと、`requests` の入っていない箱では
        # 判定の規則まで読み込めなくなる（自己点検が回らない）
        import requests

        r = requests.get(url, timeout=timeout)
        size = len(r.content)
        if r.status_code != 200:
            logger.warning("公開の口が %d を返しました（%dバイト）", r.status_code, size)
            return None, size
        body = r.json()
        cards = body.get("cards") if isinstance(body, dict) else None
        if not isinstance(cards, list):
            logger.warning("公開の口の応答に `cards` の一覧がありません（%dバイト）", size)
            return None, size
        return len(cards), size
    except Exception as e:  # noqa: BLE001
        # **例外の字そのものは出す。** URL と型しか入らないので素性は乗らない
        logger.warning("公開の口に届きませんでした: %s", type(e).__name__)
        return None, None


def read_firestore(db: firestore.Client) -> dict:
    """生のデータを読む。

    Args:
        db: Firestore クライアント

    Returns:
        `tally` に渡す3つ
    """
    images = [d.to_dict() or {} for d in
              db.collection("islandStreamEventImage").stream()]
    tips = [d.to_dict() or {} for d in db.collection("islandTips").stream()]
    cards = [d.to_dict() or {} for d in db.collection("islandCards").stream()]
    return {"images": images, "tips": tips, "cards": cards}


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=CARDS_URL,
                    help="公開の口。空にすると叩かない")
    ap.add_argument("--timeout", type=int, default=60)
    a = ap.parse_args()

    try:
        db = firestore.Client(project=BQ_PROJECT_ID)
        raw = read_firestore(db)
    except Exception as e:  # noqa: BLE001
        logger.error("元データが読めませんでした: %s", type(e).__name__)
        return 2

    t = tally(raw["images"], raw["tips"], raw["cards"])
    rows = t["rows"]
    if not rows:
        # **0件を緑にしない。** 読めたのに1日も無いのは、読む先が
        # 変わったか権限が外れたかで、判定が出ていないのと同じ
        logger.error("数える日が1日もありません（読む先が変わった可能性）")
        return 2

    logger.info("日 %d / 写真 %d枚 / 投げ銭 %d件 / カード %d枚",
                len(rows), sum(r["photos"] for r in rows),
                len(raw["tips"]), t["totalCards"])
    if t["noDayImages"] or t["noDayTips"] or t["noDayCards"]:
        logger.info("日の分からないもの: 写真 %d / 投げ銭 %d / カード %d",
                    t["noDayImages"], t["noDayTips"], t["noDayCards"])

    verdicts: Dict[str, str] = {}
    reds, yellows = [], []
    for r in rows:
        color, note = judge_day(r)
        verdicts[r["day"]] = color
        # **日付と件数だけ。** 誰かを指す字は1つも無いので公開の場でも出す
        logger.info("  %s %s  写真%2d × %2d人 = 期待%3d / カード%3d  %s",
                    LABEL[color], r["day"], r["photos"], r["people"],
                    r["expected"], r["cards"], note)
        if color == RED:
            reds.append(r)
        elif color == YELLOW:
            yellows.append(r)

    for day in stale_excuses(rows, verdicts):
        logger.info("  %s %s  もう要らない逃げ道（消す）", LABEL[YELLOW], day)

    # **誰が取りこぼされたか**は素性なので、公開の場では1行も出さない。
    # 手元で回したときだけ出る（`python/logsafe.py`）
    if reds:
        miss = []
        for r in reds:
            for t2 in raw["tips"]:
                if t2.get("day") == r["day"] and t2.get("channelId"):
                    miss.append((r["day"], t2["channelId"]))
        for line in detail_lines(miss[:40]):
            logger.info("%s", line)

    served, size = read_public(a.url, a.timeout)
    reach, reach_note = judge_reach(t["totalCards"], served, size)
    logger.info("公開の口: %s %s", LABEL[reach], reach_note)

    code = exit_code(verdicts.values(), reach)
    logger.info("赤 %d日 / 黄 %d日 / 見た %d日 → 終了コード %d",
                len(reds), len(yellows), len(rows), code)
    if reds:
        logger.error("写真はあるのにカードが0枚の日: %s",
                     ", ".join(r["day"] for r in reds))
    return code


if __name__ == "__main__":
    sys.exit(main())
