"""投げ銭のときに流す**動画**の URL を、表から `islandCharacter` へ移す。

ARGS 例:
  {}                  … 何人ぶんあるかを出すだけ（1行も書かない）
  {"apply": true}     … islandCharacter に `videoUrl` を書く

## なぜ抜けていたか

移行（`characters_migrate.py`）が運んだのは **名前・絵文字・呼び名・絵**
だけで、`videoUrl` の列を見ていなかった。あの列を使っているのは
アラートボックス1か所（`app/alertbox/index.tsx`）で、投げ銭が来たとき
その人ぶんの動画があればキャラクターの絵の代わりに流している。

表を畳んだあともアラートが同じに動くには、この列も移しておく必要がある。
**移さないまま表を消すと、動画の人だけ静かに絵に戻る**（赤くならない）。

## 誰の URL か

列に入っているのはリンクだけで、名前は出さない。ログにも出さない
（このリポジトリは公開で、Actions のログも誰でも読める）。
数と、置き場のドメインだけを出す。
"""

import json
import os
import sys
import urllib.parse
import urllib.request

from _fs import args, db, log

COLLECTION = "islandCharacter"
VIEWERS_URL = os.getenv("EXPO_PUBLIC_GAS_API_URL") or os.getenv("VIEWERS_TABLE_URL")
UA = {"User-Agent": "Mozilla/5.0 (island-character-video)"}


def viewers() -> list:
    """Viewers 表を読む。**読むだけ。**"""
    if not VIEWERS_URL:
        log.error("EXPO_PUBLIC_GAS_API_URL がありません")
        sys.exit(1)
    req = urllib.request.Request(VIEWERS_URL + "?table=Viewers", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read())
    if not j.get("ok"):
        log.error("Viewers 表が読めません: %s", j.get("error"))
        sys.exit(1)
    return j.get("data") or []


def main() -> None:
    """エントリポイント。"""
    a = args()
    apply = bool(a.get("apply"))
    rows = viewers()

    # 同じ人が何行も持つ（名前が複数）。**どの行に入っていても拾う。**
    # 行ごとに違う URL が入っていたら、先に出てきたほうを採る
    by_icon: dict = {}
    for r in rows:
        icon = str(r.get("Icon") or "").strip()
        url = str(r.get("videoUrl") or "").strip()
        if not icon or not url or icon in by_icon:
            continue
        if not url.startswith("https://"):
            log.info("  https で始まらないので飛ばします: %s", icon)
            continue
        by_icon[icon] = url

    hosts: dict = {}
    for u in by_icon.values():
        h = urllib.parse.urlparse(u).netloc
        hosts[h] = hosts.get(h, 0) + 1
    log.info("動画を持っている %d人 / 置き場: %s", len(by_icon), hosts)

    client = db()
    have = {d.id for d in client.collection(COLLECTION).stream()}
    hit = {k: v for k, v in by_icon.items() if k in have}
    log.info("そのうち島にいる %d人 / 島に無い %d人", len(hit), len(by_icon) - len(hit))

    if not apply:
        log.info('空回しです（1行も書いていません）。書くには {"apply": true}')
        return

    batch = client.batch()
    for cid, url in hit.items():
        batch.set(client.collection(COLLECTION).document(cid), {"videoUrl": url}, merge=True)
    batch.commit()
    log.info("videoUrl を %d人ぶん書きました", len(hit))


if __name__ == "__main__":
    main()
