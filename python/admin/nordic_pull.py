"""その日スパチャしてくれた人を、BigQuery から名簿に取り込む。

## なぜ手で回す道具が要るのか

`python/nordic_supporters.py` は書いてあるのに、**どのワークフローからも
呼ばれていなかった。** そのせいで `nordicDays.people` がずっと空で、
写真を開いても選べる人が1人も出なかった（2026-09-06 に気づいた）。

名簿が空だと、`site/components/nordic/PhotoStudio.tsx` の「その日そこに
いた人のキャラクターを入れる」がまるごと死ぬ。**あの画面の芯なので、
名簿が無いと写真を貼っても何も起きない。**

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: nordic_pull
    args:   {"day": "2026-09-06"}                 … 誰が取れるか見るだけ（既定）
    args:   {"day": "2026-09-06", "apply": true}  … 名簿に書く
    args:   {"days": 3, "apply": true}            … 直近3日ぶん

**既定は書かない。** 本番の名簿なので、誰が入るかを先に出す。

## 手で足したぶんは消えない

Doneru で出してくれた人は BigQuery に乗らないので
`python/admin/nordic_supporter.py` から手で入っている。ここは
`merge()` を通すので、翌日の取り込みでその人が消えることはない。
"""

import sys
from datetime import datetime, timedelta, timezone

from _fs import args, db, log

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from nordic_supporters import fetch, merge  # noqa: E402


def main() -> None:
    a = args()
    apply = bool(a.get("apply", False))

    if a.get("day"):
        d0 = d1 = str(a["day"])
    else:
        today = datetime.now(timezone.utc).date()
        n = max(1, int(a.get("days", 1)))
        d1 = today.isoformat()
        d0 = (today - timedelta(days=n - 1)).isoformat()

    found = fetch(d0, d1)
    if not found:
        log.info("%s〜%s にスパチャはありませんでした", d0, d1)
        return

    client = db() if apply else None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    for day, people in sorted(found.items()):
        log.info("%s: %d人", day, len(people))
        for p in people:
            log.info("    %s  %s", p["channelId"], p["name"])
        if client is None:
            continue
        ref = client.collection("nordicDays").document(day)
        cur = ref.get()
        old = (cur.to_dict() or {}).get("people", []) if cur.exists else []
        after = merge(old, people)
        ref.set({"day": day, "people": after, "updatedAt": now}, merge=True)
        log.info("  → 名簿は %d人になりました（手で足したぶんを含む）", len(after))

    if client is None:
        log.info('書いていません。流すなら args に {"apply": true} を入れてください')


main()
