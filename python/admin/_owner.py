"""Actions から、島の口（`/island-api/*`）をオーナーとして叩くための札。

## なぜ要るか

Cloud Storage に絵を置けるのは **Functions のサービスアカウントだけ**で、
Actions のサービスアカウントには `storage.objects.create` がない（#283）。
だから「Actions から直に置き場へ書く」道は塞がっている。

**塞がっていないのは、Functions に頼む道。** 旅の写真（`islandApi.ts` の
`/nordic/photos`）は最初からその形で動いていて、置き場に書けている。
キャラクターの移行も同じ道を通す。それには、あやとと同じ札が要る。

## 札の作りかた

Firebase の「カスタムトークン」は、**サービスアカウントの秘密鍵で署名した
ただの JWT**。`FIREBASE_SERVICE_ACCOUNT` はその秘密鍵ごと入っているので、
外に何も聞かずにここで作れる（`firebase-admin` は要らない。
`google-auth` の signer で足りる）。

作った JWT を Identity Toolkit に渡すと、口が受け取る ID トークンになる。

    サービスアカウントの秘密鍵で署名した JWT
      → accounts:signInWithCustomToken
      → ID トークン
      → Authorization: Bearer …

## 増える権限は無い

このスクリプトは元から Firestore を管理者として読み書きできる。
札で新しくできるようになるのは **Functions に頼むこと**だけで、
Functions は自分のサービスアカウントの範囲でしか動かない。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
カスタムトークンも ID トークンも uid も、ログに出さない。
"""

import json
import time

import requests

from _fs import log

# Firebase の Web API キー。**秘密ではない。**
# `site/lib/firebase.ts` に書いてあり、書き出した JS にも入って公開されている
# （Firebase の設計上そういうもの）。ここに置いても増える危険は無い。
WEB_API_KEY = "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM"

# カスタムトークンの宛先。Firebase が決めている固定の文字列
CUSTOM_TOKEN_AUD = (
    "https://identitytoolkit.googleapis.com/"
    "google.identity.identitytoolkit.v1.IdentityToolkit"
)

API_BASE = "https://live-streaming-d3cac.web.app/island-api"


def admin_uid(client) -> str:
    """`islandUsers` で `admin` が立っている人の uid。

    **決め打ちしない。** あやとの uid を書いておくと、入り直して uid が
    変わった日に、ここだけが古いまま静かに 403 を返しはじめる。
    """
    hits = list(client.collection("islandUsers").where("admin", "==", True).stream())
    if not hits:
        raise SystemExit(
            "islandUsers に admin が1人もいません。"
            "あやとが一度 /me を開くと入ります。"
        )
    if len(hits) > 1:
        # 増えているのは異常。**件数だけ出す**（uid は人を指すので出さない）
        log.warning("admin が %d 人います。いちばん先のものを使います", len(hits))
    return hits[0].id


def owner_token(client) -> str:
    """口に付ける ID トークン。**値はログに出さない。**"""
    from google.auth import jwt
    from google.auth import default as google_default

    creds, _ = google_default()
    signer = getattr(creds, "signer", None)
    email = getattr(creds, "service_account_email", None)
    if signer is None or not email:
        raise SystemExit(
            "サービスアカウントの秘密鍵が要ります。"
            "FIREBASE_SERVICE_ACCOUNT で認証されているか確かめてください。"
        )

    uid = admin_uid(client)
    now = int(time.time())
    custom = jwt.encode(
        signer,
        {
            "iss": email,
            "sub": email,
            "aud": CUSTOM_TOKEN_AUD,
            "iat": now,
            # 1時間が上限。移行は数分で終わるので短くする理由も無い
            "exp": now + 3600,
            "uid": uid,
        },
    )

    res = requests.post(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken",
        params={"key": WEB_API_KEY},
        json={"token": custom.decode("ascii"), "returnSecureToken": True},
        timeout=30,
    )
    if res.status_code != 200:
        # **返事の本文を出さない。** 断られた理由に uid が混じることがある
        raise SystemExit(f"札を取れませんでした（HTTP {res.status_code}）")
    tok = res.json().get("idToken")
    if not tok:
        raise SystemExit("札が空で返ってきました")
    return tok


def call(method: str, path: str, token: str, body: dict | None = None) -> dict:
    """口を1回叩く。**落ちた本文は、長さだけ出す。**"""
    res = requests.request(
        method,
        API_BASE + path,
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
        },
        data=json.dumps(body) if body is not None else None,
        timeout=120,
    )
    if res.status_code >= 400:
        raise SystemExit(
            f"{method} {path} が {res.status_code} で返りました"
            f"（本文 {len(res.content)} バイト）"
        )
    return res.json() if res.content else {}


def reachable(url: str) -> tuple[int, str, int]:
    """置いた絵が本当に返るか。(ステータス, 種類, バイト数)。

    **ステータスだけで判断しない。** Hosting は無いものにも 200 と HTML を
    返す（`docs/island-misses.md`）。種類とバイト数まで見る。
    """
    res = requests.get(url, timeout=60)
    return (
        res.status_code,
        res.headers.get("content-type", ""),
        len(res.content),
    )
