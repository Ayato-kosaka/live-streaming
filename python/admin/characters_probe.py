"""キャラクターの絵を、**#283 の権限なしで**置けるかどうかを本番で確かめる。

ARGS: なし（`{}`）

## 何を確かめるか

「Actions のサービスアカウントに Storage の権限が無くても、Functions に
頼めば絵は置ける」——これを、**言い切る前に1回通す。**

    1. Actions からは書けないことを、その場で測る（testIamPermissions）
    2. あやたと同じ札を作る（`_owner.py`）
    3. 小さな絵を1枚、口に投げる（POST /characters）
    4. 返ってきた URL を叩いて、**画像として返ることを見る**
    5. 消す（DELETE /characters/{id}）

**本番に何も残さない。** 4 まで通ったら必ず消す。

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
札も uid も出さない。出すのは、ステータスとバイト数と種類だけ。
"""

import base64
import zlib

from _fs import db, log
from _owner import call, owner_token, reachable

# 置き場。Functions 側の `BUCKET` と同じ
BUCKET = "live-streaming-d3cac.firebasestorage.app"

# 確かめ用の1人。**ドライブの絵と当たらない形の id** にしてある
PROBE_ID = "zzprobe0000000000000000000000probe"


def png(w: int, h: int) -> bytes:
    """透明を持つ小さな PNG を、その場で組む。

    **画像ファイルをリポジトリに置かない。** 置くと「これは何のファイルか」が
    分からないまま残る。ここで組めば、読めば分かる。
    Functions 側が 256 バイト未満を断るので、それを超える大きさにする。
    """

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            len(data).to_bytes(4, "big")
            + kind
            + data
            + zlib.crc32(kind + data).to_bytes(4, "big")
        )

    # RGBA。**各行の頭に filter type 0 を置く**のが PNG の決まり。
    # 忘れると、読み手は1行ぶんずれた絵として解いて、たいてい落ちる。
    rows = []
    for y in range(h):
        px = bytearray(b"\x00")
        for x in range(w):
            px += bytes([(x * 7) % 256, (y * 11) % 256, 200, 255])
        rows.append(bytes(px))
    raw = b"".join(rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", w.to_bytes(4, "big") + h.to_bytes(4, "big") + b"\x08\x06\x00\x00\x00")
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def can_actions_write() -> bool:
    """Actions のサービスアカウント自身が置き場に書けるか。**測る。**

    ここが False のまま 3〜4 が通れば、「Functions に頼む道は別にある」が
    憶測ではなく実測になる。
    """
    try:
        from google.cloud import storage

        got = set(
            storage.Client(project="live-streaming-d3cac")
            .bucket(BUCKET)
            .test_iam_permissions(["storage.objects.create"])
        )
        return "storage.objects.create" in got
    except Exception as e:  # noqa: BLE001
        log.info("権限を尋ねられませんでした（%s）。書けない側として進みます", type(e).__name__)
        return False


def main() -> None:
    client = db()

    direct = can_actions_write()
    log.info(
        "1) Actions のサービスアカウントは置き場に書けるか: %s",
        "書ける" if direct else "**書けない**（#283 のまま）",
    )

    log.info("2) あやたと同じ札を作ります")
    token = owner_token(client)
    log.info("   取れました")

    body = base64.b64encode(png(64, 64)).decode("ascii")
    log.info("3) 絵を1枚、口に投げます（%d バイトの PNG）", len(body))
    out = call(
        "POST",
        f"/characters/{PROBE_ID}",
        token,
        {
            "channelName": "動作確認（すぐ消します）",
            "emoji": "🧪",
            "aliases": [],
            "plain": {"full": body, "sizes": {"128": body}, "w": 64, "h": 64},
        },
    )
    ch = out.get("character") or {}
    url = ((ch.get("plain") or {}).get("url")) or ""
    if not url:
        raise SystemExit("置いたはずの絵の URL が返ってきませんでした")

    log.info("4) 返ってきた URL を叩きます")
    code, kind, size = reachable(url)
    log.info("   HTTP %s / %s / %d バイト", code, kind, size)

    ok = code == 200 and kind.startswith("image/") and size > 0

    log.info("5) 消します")
    call("DELETE", f"/characters/{PROBE_ID}", token)
    after_code, _, _ = reachable(url)
    log.info("   消したあと: HTTP %s", after_code)

    log.info("")
    if ok and not direct:
        log.info(
            "**通りました。** Actions は置き場に書けないのに、絵は置けて読めました。"
            "キャラクターの移行に #283 は要りません。"
        )
    elif ok and direct:
        log.info(
            "置けましたが、Actions 自身にも権限が付いています。"
            "「#283 が無くても通る」の証明にはなっていません。"
        )
    else:
        raise SystemExit("置いた絵が画像として返りませんでした")


if __name__ == "__main__":
    main()
