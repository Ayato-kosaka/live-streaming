"""アラートボックスが使う名簿の口を、**本番で1回通して確かめる。**

  {}    … 叩いて数える（1バイトも書かない）

## なぜ要るか

アラートボックスは Viewers 表（GAS 越しのスプシ）を読むのをやめて、
`GET /island-api/alertbox/{k}/characters` から名簿を取るようにした（#284）。
**今日の配信で試す**ので、その前にここが返ることを確かめる。

配信中に壊れていても直せない（あやとは配信している）ので、
**壊れうるところを全部、先に一度ずつ通しておく。**

  1. 合言葉（`k`）が本当に入っているか
  2. その合言葉で名簿が返るか。何人ぶんか
  3. 名前・絵・動画がそろっているか（数だけ）
  4. **名前から引けるか。** これがいちばん壊れやすい

## 「名前から引けるか」

アラートボックスは、投げ銭の nickname を名簿の名前と突き合わせる
（`app/alertbox/matching.utils.ts`）。いちばん先に見るのは
**そろえた形どうしの完全一致**で、そろえ方は `normalizeName`。

ここではそれを写して、名簿の全部の名前について

  - そろえた形が空になっていないか（空だと誰にも当たらない）
  - 2人が同じ形を持っていないか（**別人の絵が配信に出る**）

を見る。表のときは141行あって、同じ名前が2つあっても気づけなかった。

## 出さないもの

**合言葉も名前も、1文字も出さない。** このリポジトリは公開で、
Actions のログも誰でも読める。出すのは数と、ぶつかった組の**個数**だけ。
"""

import re
import unicodedata

import requests

from _fs import args, db, log
from _owner import API_BASE, admin_uid

#: 目に見えない文字。`app/alertbox/matching.utils.ts` の INVISIBLE_CHARS_RE と同じ
INVISIBLE = re.compile("[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C]")
#: 異体字セレクタ。同上の VARIATION_SELECTOR_RE
VARIATION = re.compile("[\uFE0E\uFE0F]")
WS = re.compile(r"\s+")


def norm(s: str) -> str:
    """`matching.utils.ts` の `normalizeName` と同じ形にそろえる。

    **片方だけ変えない。** 変えると、配信中のアラートだけが人違いを始める。
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = VARIATION.sub("", s)
    s = INVISIBLE.sub("", s)
    return WS.sub(" ", s.strip()).lower()


def main() -> None:
    """エントリポイント。"""
    args()
    client = db()
    uid = admin_uid(client)

    # 1. 合言葉が入っているか。**値は出さない。** 形と長さだけ見る
    doc = client.collection("islandUsers").document(uid).get()
    k = str((doc.to_dict() or {}).get("alertboxId") or "")
    if not re.fullmatch(r"[0-9a-f]{32}", k):
        log.error(
            "合言葉（alertboxId）が入っていません。"
            "あやとが /me の「アラートボックス」を一度開くと入ります。"
        )
        raise SystemExit(1)
    log.info("合言葉: 32桁が入っています")

    # 2. 名簿が返るか
    res = requests.get(f"{API_BASE}/alertbox/{k}/characters", timeout=60)
    if res.status_code != 200:
        log.error("名簿が %d で返りました（本文 %d バイト）", res.status_code, len(res.content))
        raise SystemExit(1)
    chars = res.json().get("characters") or []
    log.info("名簿: %d人（%.1f KB / %.2f 秒）", len(chars), len(res.content) / 1024, res.elapsed.total_seconds())

    # **合言葉なしでは返らないこと。** ここが開いていると名前が漏れる
    ng = requests.get(f"{API_BASE}/alertbox/{'0' * 32}/characters", timeout=60)
    log.info("でたらめな合言葉: %d（403 でないとまずい）", ng.status_code)

    # 3. そろっているか（数だけ）
    names = []
    n_icon = n_video = n_scene = n_noname = 0
    for c in chars:
        plain = c.get("plain") or {}
        if plain.get("url") or plain.get("full") or (plain.get("sizes") or {}):
            n_icon += 1
        if c.get("scene"):
            n_scene += 1
        if c.get("videoUrl"):
            n_video += 1
        mine = [c.get("channelName") or "", *(c.get("aliases") or [])]
        mine = [m for m in mine if m]
        if not mine:
            n_noname += 1
        for m in mine:
            names.append((norm(m), c.get("id")))
    log.info(
        "絵がある %d人 / 背景ありがある %d人 / 動画がある %d人 / **名前がゼロ %d人**",
        n_icon, n_scene, n_video, n_noname,
    )
    log.info("名前の数: %d（表は141行でした）", len(names))

    # 4. 名前から引けるか
    empty = sum(1 for n, _ in names if not n)
    by: dict = {}
    for n, cid in names:
        if not n:
            continue
        by.setdefault(n, set()).add(cid)
    clash = {n: v for n, v in by.items() if len(v) > 1}
    log.info("そろえたら空になる名前: %d（当たりようがない）", empty)
    log.info("**2人が同じ名前を持っている組: %d**（別人の絵が出る）", len(clash))
    if clash:
        # 名前は出さない。**どれくらい深刻か**が分かる数だけ出す
        log.warning("  ぶつかっている人数: %d", len({c for v in clash.values() for c in v}))

    log.info(
        "名前から絵にたどり着ける人: %d / %d",
        len({cid for n, cid in names if n and len(by.get(n, ())) == 1}),
        len(chars),
    )


if __name__ == "__main__":
    main()
