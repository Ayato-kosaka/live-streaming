"""`islandChannels.photo` を入れ直す。YouTube のプロフィール写真。#202

## カードの絵とは別物

**混ぜないこと。** アイコンは2つあって、出どころも意味も違う。

| | 何 | どこが正 |
| --- | --- | --- |
| キャラクター | カードに乗る絵（ひめひめさんのハリネズミ） | あやとのスプレッドシート（`site/content/residents.ts` に焼いてある） |
| プロフィール写真 | YouTube のアイコン | **ここ**（`islandChannels.photo`） |

キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
変わらないのが正しい**。ここが入れるのは後者だけで、マイページの
アイコンが古くならないようにするためのもの。

## 毎日ぜんぶは引かない

辞書には 2,200人以上いる。`channels.list` は `id` を**50件まとめて**渡せる
（1回＝1ユニット）ので、全員でも45ユニットで済む。1日の枠 10,000 の
0.45% でしかない。**それでも毎日ぜんぶは引かない。**

- 枠は他の口と分け合っている。Discovery（配信の探索。`search.list` は
  1回100ユニット）と、どねID の紐付け（`forHandle`）が同じ枠を食う。
  こちらが毎日45ユニット固定で乗ると、**枠が足りなくなった日に
  真っ先に困るのは配信の探索のほう**
- プロフィール写真は、そう毎日変わるものではない。全員を毎日引いても、
  変わるのは月に数人

だから**上限を決めて、要る人から順に引く。** 既定 500人＝10ユニット。

| 順 | 誰から | なぜ |
| --- | --- | --- |
| 1 | ログインしたことがある人（`islandUsers.channelId`） | **これが本来の用事。** マイページに出るのはこの人たちの写真だけ |
| 2 | まだ写真が無くて、最近来た人 | 新しく来た人がいちばん「古い」 |
| 3 | 写真を入れてから長い人 | 順に回す |

2と3は**最近来た人（既定90日）に絞る**。何年も来ていない人の写真を
入れ直しても、どこにも出ない。

500人ずつなら、2,200人を5日で1周する。**1周の速さより、
ログインした人が毎日入ることのほうが大事。**

実行:
  DONERU_ALERTBOX_KEY=… BQ_PROJECT_ID=… python python/island_channel_photos.py
  python python/island_channel_photos.py --max 100 --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from google.cloud import firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_PROJECT_ID  # noqa: E402
from youtube_api.client import execute_api_request, get_youtube_client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 1回の `channels.list` に渡せる id の数。YouTube 側の上限。
PER_CALL = 50

# 1日に引く人数の既定。10ユニット。上の表の理由でここを大きくしない。
DEFAULT_MAX = 500

# 「最近来た人」の窓（日）。ここを過ぎた人の写真は、入れ直しても出ない。
RECENT_DAYS = 90

# Firestore の1回のまとめ書きに入る上限。
BATCH = 400


def pick_photo(thumbs: dict) -> str:
    """`snippet.thumbnails` から1枚選ぶ。

    大きいほうから見る。マイページのアイコンは小さく出るが、
    **端末の画素密度は2倍3倍がふつう**なので、88px を選ぶと粗くなる。
    URL の長さは高々200字なので、大きいほうを持って損はない。

    Args:
        thumbs: `snippet.thumbnails`

    Returns:
        画像の URL。無ければ空
    """
    for key in ("high", "medium", "default"):
        url = ((thumbs or {}).get(key) or {}).get("url")
        if url:
            return str(url)
    return ""


def order(had: Dict[str, dict], users: set, recent_from: str, turn: int) -> List[str]:
    """引く順を決める。**要る人から。**

    3つめ（もう写真がある人）を **`photoAt` の古い順にしない。**
    写真が変わらなかった人には `photoAt` を書かない（変わっていない
    500件ぶんの書き込みを毎日払わないため）ので、古い順にすると
    **同じ500人を毎日引き続けて、残りに永久に届かない。**

    かわりに、チャンネルIDで並べたところを**日ごとにずらして**窓を取る。
    置き場に何も書かずに順に回せる。

    Args:
        had: チャンネルID -> `islandChannels` の中身
        users: ログインしたことがある人のチャンネルID
        recent_from: この時刻より後に喋っていれば「最近来た人」
        turn: 何日目か。窓をずらす量に使う

    Returns:
        引く順のチャンネルID
    """
    signed_in, fresh, rest = [], [], []
    for cid, v in had.items():
        if cid in users:
            signed_in.append(cid)
            continue
        if str(v.get("lastAt") or "") < recent_from:
            # 最近来ていない人。写真を入れ直してもどこにも出ない
            continue
        (fresh if not v.get("photo") else rest).append(cid)
    # 新しく来た人が先（同じ「写真が無い」でも、来たばかりの人のほうが出る）
    fresh.sort(key=lambda c: str(had[c].get("lastAt") or ""), reverse=True)
    rest.sort()
    if rest:
        at = turn % len(rest)
        rest = rest[at:] + rest[:at]
    return signed_in + fresh + rest


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=DEFAULT_MAX, help="1回に引く人数")
    ap.add_argument("--days", type=int, default=RECENT_DAYS, help="「最近来た人」の窓")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    db = firestore.Client(project=BQ_PROJECT_ID)
    col = db.collection("islandChannels")
    had = {d.id: (d.to_dict() or {}) for d in col.stream()}
    logger.info("辞書: %d人", len(had))

    users = set()
    for d in db.collection("islandUsers").stream():
        cid = (d.to_dict() or {}).get("channelId")
        if isinstance(cid, str) and cid:
            users.add(cid)
    logger.info("ログインしたことがある人: %d人", len(users))
    # 辞書に居ない人も引く。ログインしただけで、コメントしたことが無い人
    for cid in users:
        had.setdefault(cid, {})

    recent_from = (
        datetime.now(timezone.utc) - timedelta(days=max(1, a.days))
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    # 何日目か。窓をずらす量に使う（置き場に順番を持たずに回すため）
    turn = (datetime.now(timezone.utc).date() - datetime(1970, 1, 1).date()).days
    want = order(had, users, recent_from, turn * max(1, a.max))[: max(1, a.max)]
    logger.info(
        "引くのは %d人（%dユニット）", len(want), -(-len(want) // PER_CALL)
    )
    if not want:
        return 0

    if a.dry_run:
        for cid in want[:20]:
            v = had[cid]
            logger.info(
                "  %s  %s  photo=%s",
                cid,
                v.get("name") or "（辞書に無い）",
                "あり" if v.get("photo") else "なし",
            )
        logger.info("--dry-run なので引いても書いてもいません")
        return 0

    yt = get_youtube_client(logger)
    stamp = datetime.now(timezone.utc).isoformat()
    found: Dict[str, str] = {}
    for i in range(0, len(want), PER_CALL):
        part = want[i : i + PER_CALL]
        try:
            r = execute_api_request(
                yt.channels().list(part="snippet", id=",".join(part)),
                logger=logger,
            )
        except Exception as e:  # noqa: BLE001
            # **引けなくても落とさない。** 写真が古いままなだけで、
            # このジョブの後ろ（カード作り）を止める理由が無い
            logger.warning("channels.list が失敗しました: %s", str(e)[:200])
            continue
        for item in r.get("items", []):
            url = pick_photo((item.get("snippet") or {}).get("thumbnails"))
            if url:
                found[str(item.get("id"))] = url

    logger.info("YouTube から取れた: %d人", len(found))

    changed = [(c, u) for c, u in found.items() if had.get(c, {}).get("photo") != u]
    logger.info("写真が変わった / 新しく入る: %d人", len(changed))

    wrote = 0
    batch = db.batch()
    n = 0
    for cid, url in changed:
        batch.set(
            col.document(cid),
            {"photo": url, "photoAt": stamp, "updatedAt": stamp},
            merge=True,
        )
        n += 1
        wrote += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    if n:
        batch.commit()

    # 変わらなかった人にも `photoAt` を置きたくなるが、**置かない。**
    # 置くと、変わっていない 500件ぶんの書き込みを毎日払うことになる。
    # 順に回すのは `order` の窓ずらしがやる。
    logger.info("islandChannels.photo を %d件 更新しました", wrote)
    return 0


if __name__ == "__main__":
    sys.exit(main())
