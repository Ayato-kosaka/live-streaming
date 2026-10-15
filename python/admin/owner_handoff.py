"""口の札を**1枚だけ**作って、渡された公開鍵で封をして返す（#785）。

    script: owner_handoff
    args:   {"pubkey": "<SPKI DER の base64>"}

**1バイトも書かない。** `islandUsers` を1行読んで、札を2枚作って、
封をして注記に出すだけ。

## なぜ要るか

視聴者さんの絵と「ハンドル↔絵」の対応表は、**公開リポジトリに入れない。**
枝でも、一時的でも入れない（枝は、この箱からは落とせない。#785）。

残る道は2つに1つ——**絵を実行まで運ぶ**か、**実行が持っている札のほうを
手元へ運ぶ**か。運ぶのは札のほうにした。札は1.5KBで封に収まるが、
絵は数MBあって公開の場（入力・ログ・注記）には載らないからで、
しかも**札を運べば絵はどこへも出ていかない**——手元から島の口へ直に行く。

    手元: 使い捨ての鍵を作る → 公開鍵だけを入力に載せる
    実行: 札を2枚作る → 公開鍵で封をする → 注記に出す
    手元: 注記を読んでほどく → **実行を消す** → 絵は手元から口へ直に送る

## 返す札2枚

| 欄 | 何に使うか | 寿命 |
| --- | --- | --- |
| `id` | 島の口（`/island-api/*`）に付ける Bearer。`_owner.owner_token()` と同じもの | 1時間 |
| `fs` | Firestore だけに届く Google の札（`auth/datastore`）。書類IDを振るのと `channelId` の1欄に要る | 1時間 |

**`fs` に `cloud-platform` を付けない。** 要るのは Firestore だけなので、
BigQuery も置き場も触れない札にしておく。

## 増える権限は無い

これを押せるのは、**このリポジトリに書ける人だけ**（`workflow_dispatch`）。
その人はもともと `firestore_write` も `characters_migrate` も押せるので、
ここが札を渡すことで新しくできるようになることは1つも無い。変わるのは
**どこから叩くか**だけ（Actions の中からか、押した人の手元からか）。

## 公開の場に出るもの

入力に載る**公開鍵**と、注記に出る**封**だけ。どちらも、ほどける秘密鍵が
手元にしか無いので読めない。それでも、呼ぶ側（`_handoff.py`）は
**ほどいたら実行をその場で消す。** 封が1時間そこに在る理由も無い。
"""

import gzip
import json
import time

from _fs import args, db, log, need, notice, readonly
from _owner import owner_token
from _seal import chunks, pack, seal

#: Firestore だけに届く札。**広げない**
FS_SCOPE = "https://www.googleapis.com/auth/datastore"


def fs_token() -> str:
    """Firestore に届く Google の札。**値はログに出さない。**"""
    from google.auth import default as google_default
    from google.auth.transport.requests import Request

    creds, _ = google_default(scopes=[FS_SCOPE])
    creds.refresh(Request())
    if not creds.token:
        raise SystemExit("Firestore の札が空で返ってきました")
    return creds.token


def main() -> None:
    a = args()
    (pubkey,) = need(a, "pubkey")

    client = readonly(db())
    payload = {
        "id": owner_token(client),
        "fs": fs_token(),
        # 手元で「もう切れている」を先に言えるように。札そのものではない
        "exp": int(time.time()) + 3600,
    }
    # **平文はここまで。** 以降、ログにも注記にも暗号文しか出ない。
    # 畳んでから包む（札は base64 の字が続くのでよく縮む。注記の行数が減る）
    plain = gzip.compress(json.dumps(payload).encode())
    blob = pack(seal(plain, pubkey))
    lines = chunks(blob)
    log.info("札を2枚、封にして %d 行で出します（封 %d 字）", len(lines), len(blob))
    for line in lines:
        notice(line)


main()
