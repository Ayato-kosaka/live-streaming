"""案内鳥のチャンネルとして配信のチャットに書く鍵を、**Actions の中で**作って封をして返す（#1405）。

    script: guide_token
    args:   {"code": "<同意で出たコード>", "pubkey": "<SPKI DER の base64>"}

同意（EC2 の Chrome で「あやと島案内鳥」の行を選ぶ）で出たコードを、島の OAuth
クライアント（`YOUTUBE_CLIENT_ID`・`YOUTUBE_CLIENT_SECRET`）で refresh token に
替える。替えた鍵で `channels.list?mine=true` を1回叩き、**返ったチャンネルが
「あやと島案内鳥」の1つだけのときだけ**、渡された公開鍵で封をして注記に出す。
それ以外は何も返さずに 1 で終わる。**1バイトも書かない。**

## なぜ Actions の中で替えるか

client secret は Google Cloud の画面ではもう読めない（「Viewing and downloading
client secrets is no longer available」）。持っているのは GitHub Secrets だけなので、
コードのほうを Actions へ運ぶ。コードは使い切りで、client secret 無しには
替えられないので、入力（公開の実行）に一瞬載るのは受け入れる。呼ぶ側は
**ほどいたら実行を消す**（`owner_handoff` と同じ形）。

リダイレクト先は、いまの `YOUTUBE_REFRESH_TOKEN` を取ったときと同じ
`https://developers.google.com/oauthplayground`（`functions/src/youtubeClient.ts`）。
コードを替えるときのリダイレクト先は、同意のときと1字違わず同じでないと通らない。

## 名前が違えば、封をしない

同意の画面で別のチャンネル（あやとの本人のチャンネルなど）を選んでしまうと、
その鍵で書いた字は**そのチャンネルの名で**配信に出る。だから鍵を作った直後に
本番と同じ使いかた（refresh token から取り直した札）で `channels.list` を叩き、
名前が「あやと島案内鳥」の1つだけでなければ捨てる。

**捨てるだけで、取り消し（revoke）はしない。** Google の取り消しは
「その人とこのクライアントの許可」ごと消すので、あやとの本人のチャンネルを
選んでいた場合、いま本番で動いている `YOUTUBE_REFRESH_TOKEN` まで止まる。

## ログに出すもの

鍵・コード・client の値は1文字も出さない。チャンネルの名前も、**合っていたときの
「あやと島案内鳥」だけ**を出す（違っていたときは件数だけ。ほかのチャンネルの
名前は公開のログに出さない）。
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from _fs import args, log, notice
from _seal import chunks, pack, seal

TOKEN_URL = "https://oauth2.googleapis.com/token"
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
#: いまの鍵と同じ道（`functions/src/youtubeClient.ts` の第3引数）
REDIRECT = "https://developers.google.com/oauthplayground"
GUIDE = "あやと島案内鳥"


def _post(url: str, form: dict) -> dict:
    """フォームを POST して JSON を返す。**失敗の中身は Google の error の名前だけ。**"""
    req = urllib.request.Request(url, data=urllib.parse.urlencode(form).encode())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e).get("error")
        except Exception:  # noqa: BLE001
            err = None
        raise RuntimeError(f"HTTP {e.code} {err if isinstance(err, str) else ''}".strip()) from None


def _get(url: str, bearer: str) -> dict:
    """札を付けて GET して JSON を返す。"""
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + bearer})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from None


def main() -> int:
    a = args()
    code, pub = a.get("code"), a.get("pubkey")
    # **`need()` を使わない。** あちらは足りないときに ARGS を丸ごとログに出す
    if not isinstance(code, str) or not code or not isinstance(pub, str) or not pub:
        log.error("入力の code と pubkey が要ります（値は出しません）")
        return 1
    cid = os.getenv("YOUTUBE_CLIENT_ID") or ""
    sec = os.getenv("YOUTUBE_CLIENT_SECRET") or ""
    if not cid or not sec:
        log.error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET が渡っていません")
        return 1

    try:
        tok = _post(TOKEN_URL, {
            "code": code, "client_id": cid, "client_secret": sec,
            "redirect_uri": REDIRECT, "grant_type": "authorization_code",
        })
    except RuntimeError as e:
        log.error("コードを鍵に替えられませんでした（%s）。コードは約10分で切れます", e)
        return 1
    rt = tok.get("refresh_token") or ""
    if not rt:
        log.error("refresh token が返ってきませんでした（同意を prompt=consent でやり直す）")
        return 1

    # 本番と同じ使いかた: refresh token から札を取り直して叩く
    try:
        at = _post(TOKEN_URL, {
            "refresh_token": rt, "client_id": cid, "client_secret": sec,
            "grant_type": "refresh_token",
        }).get("access_token") or ""
        if not at:
            raise RuntimeError("札が空")
        items = _get(CHANNELS_URL, at).get("items") or []
    except RuntimeError as e:
        log.error("鍵で channels.list を叩けませんでした（%s）", e)
        return 1
    names = [((i or {}).get("snippet") or {}).get("title") for i in items]
    if names != [GUIDE]:
        log.error("鍵のチャンネルが「%s」の1つではありません（%d件）。封をせずに捨てます",
                  GUIDE, len(names))
        return 1
    log.info("channels.list mine=true の名前: %s", GUIDE)

    # **平文はここまで。** 以降、ログにも注記にも暗号文しか出ない
    blob = pack(seal(rt.encode(), pub))
    lines = chunks(blob)
    log.info("鍵を封にして %d 行で出します（封 %d 字）", len(lines), len(blob))
    for line in lines:
        notice(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
