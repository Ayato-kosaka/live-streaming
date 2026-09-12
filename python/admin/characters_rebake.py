"""図鑑の絵のうち、**webp で焼かれていないもの**を webp に焼き直す。

**既定では1バイトも書かない。** 誰の何枚がどの形で入っているかを出すだけ。
書くときは `{"apply": true}`。

## なぜ要るか

絵を画面（`/me` の図鑑）から足すとき、幅ごとの版は**ブラウザが焼いている**
（`site/components/me/Characters.tsx` の `bake`）。canvas から webp を
書き出せない端末では、そこが

    背景なし → png（透明が残るので jpeg には落とせない）
    背景あり → jpeg

に落ちる。2026-09-11 に画面から入った1人が実際にそれで、
`plain-128.png` / `scene-128.jpg` として置き場に入っていた。

絵そのものは正しく置かれているので、**口さえ拡張子を決め打ちしなければ
図鑑には出る**（`functions/src/islandCharacter.ts`。そちらが本筋の直し）。
ここは「1人だけ形が違う」を揃えるほう。webp にすると実測で 2分の1になる。

## 元の1枚（`full`）には触らない

送るのは幅ごとの版だけ。`full` は**視聴者さんが持ち帰るもの**で、
縮めたものを配らない決まりだから、焼き直しの対象ではない。

口は `full` が送られてこなければ前のものを残す（`saveRole`）。
**その直しが本番に出ている必要がある。** 出ていない口に投げると `full` が
消えるので、書く前に本番の口を1回叩いて、新しくなっていることを確かめる
（`preflight`）。確かめられなければ1バイトも書かずに止まる。

## 古い png を消さない

置き場の `plain-128.png` はそのまま残る。書類が指す先が webp に変わるだけ。
口は同じ幅が2つあれば webp を採るので、残っていても悪さをしない。

ARGS 例:
  {}                                  … 数えるだけ（1バイトも書かない）
  {"apply": true}                     … 焼き直す
  {"apply": true, "only": "f203…b00"} … その1人だけ
"""

import base64
import io
import json
import re
import sys
import urllib.request

from _fs import args, db, log
from _owner import API_BASE, call, owner_token, reachable

#: 焼く幅。`functions/src/islandCharacter.ts` の WIDTHS と同じ並び。
WIDTHS = (128, 256, 640)

#: 役どころ。
ROLES = ("plain", "scene")

UA = {"User-Agent": "Mozilla/5.0 (island-character-rebake)"}


def ext_of(url: str) -> str:
    """置き場の URL から、実物の拡張子を取る。

    URL は `…%2Fplain-128.png?alt=media&token=…` の形。合言葉の付いた
    うしろを落としてから見る。
    """
    head = str(url or "").split("?", 1)[0]
    m = re.search(r"\.([A-Za-z0-9]+)$", head)
    return (m.group(1) if m else "").lower()


def get(url: str) -> bytes:
    """1枚落とす。"""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def kind_of(buf: bytes):
    """**中身の頭を見て**、何の絵かを決める。名乗りでは決めない。"""
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if buf[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return None


def bake(buf: bytes) -> list:
    """幅ごとの webp を焼く。**引き伸ばさない。**

    Args:
        buf: 元の絵

    Returns:
        [(幅, バイト列), ...]。元より大きい幅は入らない
    """
    from PIL import Image

    im = Image.open(io.BytesIO(buf))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    out = []
    for w in WIDTHS:
        if w >= im.width:
            continue
        h = max(1, round(im.height * w / im.width))
        b = io.BytesIO()
        im.resize((w, h), Image.LANCZOS).save(b, "WEBP", quality=88, method=6)
        out.append((w, b.getvalue()))
    return out


def public_characters() -> list:
    """図鑑の口。**札を付けない。名前は返らない。**

    数えるだけのときは Firestore もオーナーの札も要らない。
    """
    return json.loads(get(f"{API_BASE}/characters")).get("characters") or []


def find(chars: list, only: str) -> list:
    """webp でない幅を持っている人を拾う。

    Args:
        chars: 図鑑の口が返した並び
        only: 書類ID。空なら全員

    Returns:
        [(書類ID, 役どころ, {幅: 拡張子}), ...]
    """
    out = []
    for c in chars:
        if only and c.get("id") != only:
            continue
        for role in ROLES:
            p = c.get(role) or {}
            bad = {
                w: ext_of(u)
                for w, u in (p.get("sizes") or {}).items()
                if ext_of(u) != "webp"
            }
            if bad:
                out.append((c.get("id"), role, bad))
    return out


def preflight(cid: str, role: str) -> None:
    """**口が新しくなっているかを、書く前に確かめる。**

    拡張子を決め打ちしていた頃の口は、webp 以外で入っている人に 404 を返す。
    その口に「幅だけ」を投げると `full` が消える（`saveRole` の説明）。
    **404 なら1バイトも書かずに止まる。**
    """
    url = f"{API_BASE}/characters/{cid}/{role}-128.webp"
    status, kind, size = reachable(url)
    if status != 200 or not kind.startswith("image/"):
        log.error(
            "本番の口がまだ古いままです（%s-128.webp が %d / %s）。"
            "Functions を出してから流してください",
            role,
            status,
            kind or "型なし",
        )
        sys.exit(1)
    log.info("口は新しくなっています（%s-128 が %s %dバイトで返る）", role, kind, size)


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    only = str(a.get("only") or "").strip()
    limit = int(a.get("limit") or 0)

    chars = public_characters()
    log.info("図鑑 %d人", len(chars))
    todo = find(chars, only)
    if limit:
        todo = todo[:limit]
    if not todo:
        log.info("webp でない幅を持っている人はいません。やることはありません")
        return
    for cid, role, bad in todo:
        log.info(
            "%s の %s … %s",
            cid,
            role,
            "、".join(f"{w}px が {e}" for w, e in sorted(bad.items())),
        )

    if not apply:
        log.info(
            "空回しです（1バイトも書いていません）。"
            '焼き直すには {"apply": true} を付けてください'
        )
        return

    # **書く前に、口が新しくなっているかを見る。** 古い口に投げると
    # 元の1枚が消える。1人目の役どころで1回だけ確かめれば足りる。
    preflight(todo[0][0], todo[0][1])

    token = owner_token(db())
    log.info("口に頼む札を取りました")

    # 名前と呼び名は**そのまま送り返す。** 口は送られてきたぶんで
    # 上書きするので、付けずに投げると名前が空になる。
    full = {
        c["id"]: c
        for c in (call("GET", "/characters", token).get("characters") or [])
    }

    done = 0
    for cid, role, bad in todo:
        had = full.get(cid)
        if not had:
            log.warning("%s が名簿にいません。飛ばします", cid)
            continue
        pic = had.get(role) or {}
        # **元の1枚から焼き直す。** いちばん大きい版から焼くと、縮めた
        # ものをさらに縮めることになる。
        src = pic.get("full") or (pic.get("sizes") or {}).get("640")
        if not src:
            log.warning("%s の %s に元の絵がありません。飛ばします", cid, role)
            continue
        buf = get(src)
        if not kind_of(buf):
            log.warning(
                "%s の %s が画像ではありません（%dバイト、先頭 %r）",
                cid,
                role,
                len(buf),
                buf[:8],
            )
            continue
        baked = bake(buf)
        if not baked:
            log.warning("%s の %s は元が小さすぎて焼けません", cid, role)
            continue
        out = call(
            "POST",
            f"/characters/{cid}",
            token,
            {
                "channelName": had.get("channelName") or "",
                "emoji": had.get("emoji") or "",
                "aliases": had.get("aliases") or [],
                # **`full` は送らない。** 元の1枚には触らない
                role: {
                    "sizes": {
                        str(w): base64.b64encode(b).decode("ascii")
                        for w, b in baked
                    }
                },
            },
        )
        got = (out.get("character") or {}).get(role) or {}
        # **元の1枚が残っているかを、その場で見る。** 消えていたら
        # そこで止める（残りを同じように消さないため）。
        if not got.get("full"):
            log.error("%s の %s で元の1枚が消えました。ここで止めます", cid, role)
            sys.exit(1)
        log.info(
            "%s の %s を焼き直しました（%s / 合計 %.0fKB）",
            cid,
            role,
            "、".join(f"{w}px→{ext_of(u)}" for w, u in sorted(
                (got.get("sizes") or {}).items())),
            sum(len(b) for _, b in baked) / 1024,
        )
        done += 1

    log.info("%d件を焼き直しました", done)


if __name__ == "__main__":
    main()
