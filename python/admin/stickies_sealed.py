"""ある宛先の付箋を、**本文つきで・封をして**出す。

    script: stickies_sealed
    args:   {"theme": "north-macedonia", "pubkey": "<SPKI DER の base64>"}

**1バイトも書かない。** Firestore を読んで、封をして出すだけ。
`pubkey` は押す側（`python/sealed_run.py`）が足すので、手で書かない。

## なぜ要るのか

付箋の宛先を付け替えたい（`sticky_move`）が、**どれを動かすかは本文を読まないと
決まらない。** ところが Actions のログは誰でも読めるので、本文も名乗りも
`_fs.show()` を通した「伏せた形」でしか出せない（長さしか出ない）。

封をすれば、**ほどける鍵は手元にしかない**ので、押した人だけが読める。
包み方と返し方は `_seal` に置いてある（`owner_handoff`・`doneru_msgs_sealed` と同じ）。

## 出すもの（封の中）

| 欄 | 中身 |
| --- | --- |
| `id` | 書類のID。`sticky_move` に渡すのはこれ |
| `text` | 本文 |
| `by` | 名乗り |
| `reply` | あやとの返事（あれば） |
| `createdAt` | 貼られた時刻 |

**動かすのは宛先だけ**なので、ここで読むのも「どれを動かすか」を決めるためだけ。
"""

import gzip
import json

from _fs import args, db, log, need, notice, readonly
from _seal import chunks, pack, seal

#: 本文の上限。長い本文で注記が溢れると、封が10行で打ち切られて
#: **ほどけなくなる**（`_seal` の冒頭）
MAX_TEXT = 400


def main() -> None:
    a = args()
    theme, pubkey = need(a, "theme", "pubkey")
    client = readonly(db())

    # 索引を作る権限が無い（#168）ので `where` は使わず、引いてから選り分ける
    rows = []
    for d in client.collection("islandNotes").limit(1000).stream():
        v = d.to_dict() or {}
        if v.get("theme") != theme:
            continue
        rows.append({
            "id": d.id,
            "text": str(v.get("text") or "")[:MAX_TEXT],
            "by": str(v.get("by") or ""),
            "reply": str(v.get("reply") or "")[:MAX_TEXT],
            "createdAt": v.get("createdAt"),
        })

    # **件数だけログに出す。** 名前も本文も出さない
    log.info("宛先 %s の付箋 %d 件", theme, len(rows))

    plain = gzip.compress(json.dumps({"theme": theme, "rows": rows},
                                     ensure_ascii=False).encode())
    # **平文はここまで。** 以降、ログにも注記にも暗号文しか出ない
    blob = pack(seal(plain, pubkey))
    lines = chunks(blob)
    log.info("封を %d 行で出します（封 %d 字）", len(lines), len(blob))
    if len(lines) > 10:
        # 注記は1つの step で10件までしか見せない。**足りないまま返さない**
        log.error("注記は10行までしか読めません。件数を絞ってください")
    for line in lines:
        notice(line)


main()
