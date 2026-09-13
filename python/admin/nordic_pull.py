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
下見も名簿を読むので（読むだけつないで、書く口は塞いである）、
**もう名簿にいる人と、新しく増える人が分かれて出る。**

## 手で足したぶんは消えない

Doneru で出してくれた人は BigQuery に乗らないので
`python/admin/nordic_supporter.py` から手で入っている。ここは
`merge()` を通すので、翌日の取り込みでその人が消えることはない。
"""

import sys
from datetime import datetime, timedelta, timezone

from _fs import args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from nordic_supporters import fetch, merge  # noqa: E402
from logsafe import detail_lines  # noqa: E402


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

    # **下見でも読むだけつなぐ。** つながないと、もう名簿にいる人と
    # 新しく増える人を分けられず、「その日 5人」が全員増えるように読める。
    # 書く側は口ごと塞いである（`_fs.readonly`）
    client = db()
    store = client if apply else readonly(client)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    for day, people in sorted(found.items()):
        log.info("%s: %d人", day, len(people))
        # **公開の場では1人ずつ出さない**（`python/logsafe.py`）。
        # このリポジトリは公開で、Actions のログも誰でも読める
        for line in detail_lines([(p["channelId"], p["name"]) for p in people]):
            log.info("%s", line)
        ref = store.collection("nordicDays").document(day)
        old = (ref.get().to_dict() or {}).get("people", [])
        after = merge(old, people)
        if apply:
            ref.set({"day": day, "people": after, "updatedAt": now}, merge=True)
        log.info("  → 名簿は %d人（いま %d人 / %s %d人）",
                 len(after), len(old),
                 "増えた" if apply else "増える", len(after) - len(old))

    if not apply:
        log.info("読んで数えただけで、1バイトも書いていません。"
                 '流すなら args に {"apply": true} を入れてください')


main()
