"""Firestore の書類を JSON に落として、**同じ型で戻せる**ようにする。

## なぜ素の JSON ではいけないか

Firestore の値には JSON に無い型がある（時刻・バイト列・座標・別の書類への参照）。
`json.dumps(..., default=str)` で落とすと**文字列になって戻らない。**
「取れている」のに戻すと型が違う、が一番たちが悪い（戻した本人も気づかない）。

なので、JSON に無い型だけ札を付けて包む。

  時刻      {"__ts__": "2026-09-11T01:02:03.000004+00:00"}
  バイト列  {"__bytes__": "<base64>"}
  座標      {"__geo__": [緯度, 経度]}
  参照      {"__ref__": "islandNotes/xxxx"}

Firestore の**欄の名前は `__` で始められない**（予約されている）ので、
この札が本物の欄とぶつかることはない。それでも念のため、包むときに
札と同じ形の辞書が出てきたら止める（黙って壊すより落ちるほうがよい）。
"""

import base64
import datetime as dt
import hashlib
import json

TS = "__ts__"
BYTES = "__bytes__"
GEO = "__geo__"
REF = "__ref__"
TAGS = (TS, BYTES, GEO, REF)


def enc(v):
    """Firestore の値 → JSON にできる値。"""
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, dt.datetime):
        # tz を持たない時刻は Firestore から返ってこないが、念のため UTC 扱い
        if v.tzinfo is None:
            v = v.replace(tzinfo=dt.timezone.utc)
        return {TS: v.isoformat()}
    if isinstance(v, (bytes, bytearray)):
        return {BYTES: base64.b64encode(bytes(v)).decode()}
    if isinstance(v, list):
        return [enc(x) for x in v]
    if isinstance(v, dict):
        for k in v:
            if k in TAGS:
                raise ValueError(f"欄の名前が札とぶつかっています: {k}")
        return {k: enc(x) for k, x in v.items()}
    # 座標と参照は import を遅らせる（この2つを使わない場面のほうが多い）
    lat = getattr(v, "latitude", None)
    if lat is not None and getattr(v, "longitude", None) is not None:
        return {GEO: [v.latitude, v.longitude]}
    path = getattr(v, "path", None)
    if path is not None and hasattr(v, "id"):
        return {REF: path}
    raise ValueError(f"落とし方の分からない型です: {type(v).__name__}")


def dec(v, client=None):
    """JSON にした値 → Firestore の値。`client` は参照を戻すときだけ要る。"""
    if isinstance(v, list):
        return [dec(x, client) for x in v]
    if not isinstance(v, dict):
        return v
    if TS in v and len(v) == 1:
        return dt.datetime.fromisoformat(v[TS])
    if BYTES in v and len(v) == 1:
        return base64.b64decode(v[BYTES])
    if GEO in v and len(v) == 1:
        from google.cloud.firestore_v1._helpers import GeoPoint

        return GeoPoint(v[GEO][0], v[GEO][1])
    if REF in v and len(v) == 1:
        if client is None:
            # 参照は戻し先が決まらないと作れない。文字列のまま返すと
            # 型が変わるので、ここは黙らずに落とす
            raise ValueError("参照を戻すには戻し先の client が要ります")
        return client.document(v[REF])
    return {k: dec(x, client) for k, x in v.items()}


def data_json(data: dict) -> str:
    """書類の中身だけを JSON の字にする。

    **キーを並べ替えて、余分な空白を入れずに書く。** 同じ中身なら必ず同じ字に
    なるので、戻したものと突き合わせるときに字のまま比べられる。
    """
    return json.dumps(
        enc(data or {}), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def line(doc_id: str, data: dict) -> str:
    """JSONL の1行（書類IDつき）。"""
    return json.dumps(
        {"id": doc_id, "data": enc(data or {})},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def digest(doc_id: str, data: dict) -> str:
    """書類1件ぶんの指紋。**戻したものと突き合わせるのに使う。**

    値そのものを持ち出さずに「同じか違うか」だけ言えるので、
    公開のログにも出せる。
    """
    return hashlib.sha256(line(doc_id, data).encode()).hexdigest()
