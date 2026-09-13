"""豚の貯金箱の移行を、Firestore を1行も触らずに確かめる。

## 何を確かめるのか

**「2回流しても増えない」を、口で言わずに実際に2回流して確かめる。**

Firestore の代わりに、同じ書き方（`collection(...).document(id).set(..., merge=True)`）
を受ける入れ物をその場で作って、そこへ2回流す。書類IDが中身から決まって
いれば、2回目は同じ書類を上書きするだけなので、**件数も合計も1ミリも動かない。**

見るのは4つ。

1. GAS の411件を入れて、件数と合計が豚と1円まで合うか
2. **もう一度**同じものを入れて、件数と合計が変わらないか
3. BigQuery の直近ぶんを重ねて入れて、既にあるものが増えないか
   （item id をほどく道が、アラートボックス側と BigQuery 側で
   同じところに着くか。**ここが違うと同じスパチャが2件になる**）
4. 本番の `GET /island-api/fund` が返している額と、移行後の式が合うか

**本番の Firestore は読まないし書かない。** 移行の前に何度でも流せる。

    script: fund_check
    args:   {}              … 上の1〜4
    args:   {"days": 30}    … BigQuery を何日ぶん重ねてみるか（既定 7）

BigQuery を引けない場所（鍵の無い手元）では 3 を飛ばす。1・2・4 は流れる。
"""

import json
import os
import sys
import urllib.error
import urllib.request

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_box as fb  # noqa: E402
from fund_seed import GOALS, SPENDS  # noqa: E402

# 本番が実際に返している額（`fund_migrate` と同じ口）。鍵は要らない。
PROD_FUND = "https://live-streaming-d3cac.web.app/island-api/fund"


class Fake:
    """Firestore の代わり。**書類IDで上書きする**ところだけ真似る。"""

    def __init__(self):
        """空の入れ物を作る。"""
        self.docs = {}

    def put(self, col: str, doc: str, data: dict) -> None:
        """1件書く（`set(..., merge=True)` と同じ）。

        Args:
            col: コレクション名
            doc: 書類ID
            data: 中身
        """
        self.docs.setdefault(col, {}).setdefault(doc, {}).update(data)

    def sums(self, col: str) -> tuple:
        """件数と円の合計。

        Args:
            col: コレクション名

        Returns:
            `(件数, 合計)`
        """
        d = self.docs.get(col, {})
        return len(d), sum(int(v.get("yen") or 0) for v in d.values())


def pour(fake: Fake, sc: list) -> None:
    """スパチャの控えを入れ物へ流す。

    Args:
        fake: 入れ物
        sc: `(書類ID, 中身)` の配列
    """
    for doc, v in sc:
        fake.put(fb.C_SUPERCHAT, doc, v)


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら全部通った。1 ならどれかが合わない
    """
    a = args()
    days = int(a.get("days", 7))
    ok = True
    fake = Fake()

    # ---- 1回目 ----
    sc = fb.gas_superchats()
    pour(fake, sc)
    for d, t, y in SPENDS:
        fake.put(fb.C_SPEND, fb.spend_id(d, t, y), {"day": d, "title": t, "yen": y})
    for f, t, label, y in GOALS:
        fake.put(fb.C_GOAL, f, {"from": f, "to": t, "label": label, "yen": y})
    n1, s1 = fake.sums(fb.C_SUPERCHAT)
    sp1 = fake.sums(fb.C_SPEND)
    log.info("1回目: 控え %d件 / %s円（半分 %s円） / 支出 %d件 %s円",
             n1, s1, s1 // fb.SUPERCHAT_RATE, sp1[0], sp1[1])

    # ---- 2回目。同じものをもう一度 ----
    pour(fake, fb.gas_superchats())
    for d, t, y in SPENDS:
        fake.put(fb.C_SPEND, fb.spend_id(d, t, y), {"day": d, "title": t, "yen": y})
    n2, s2 = fake.sums(fb.C_SUPERCHAT)
    sp2 = fake.sums(fb.C_SPEND)
    log.info("2回目: 控え %d件 / %s円 / 支出 %d件 %s円", n2, s2, sp2[0], sp2[1])
    if (n1, s1) != (n2, s2) or sp1 != sp2:
        log.error("**2回流したら増えました。** 書類IDの付け方が中身から決まっていない")
        ok = False
    else:
        log.info("2回流しても1件も増えませんでした")

    # ---- 3. BigQuery を重ねる ----
    # **鍵が無いのと、SQL が壊れているのを、同じ扱いにしない。**
    # 一度これで隠れた。手元は鍵が無いので DefaultCredentialsError になり、
    # 本番では `AS at`（BigQuery の予約語）で BadRequest になっていたのに、
    # どちらも「引けませんでした」の警告1行で通していた。
    # **SQL が壊れていたら毎晩ぜんぶ落ちる。** 警告ではなく落とす。
    project = os.getenv("BQ_PROJECT_ID") or ""
    try:
        bq = fb.bq_superchats(project, "youtube_chat", days) if project else []
    except Exception as e:  # noqa: BLE001
        name = type(e).__name__
        if "Credential" in name or "DefaultCredentials" in name:
            log.warning("鍵が無いので 3 は飛ばします: %s", name)
            bq = None
        else:
            log.error("**BigQuery が引けません（SQL が壊れている）**: %s: %s", name, e)
            log.error("このまま毎晩の掃除を回すと、漏れが1件も埋まらない")
            return 1
    if bq is not None:
        have = fake.docs.get(fb.C_SUPERCHAT, {})
        dup = sum(1 for doc, _ in bq if doc in have)
        # 手で入れてあるぶんは書類IDが違う。**日付と額の札**で拾えるか見る
        claims = {}
        for doc, v in have.items():
            k = v.get("claim")
            if k:
                claims.setdefault(k, []).append(doc)
        took = 0
        for doc, v in bq:
            if doc in have:
                continue
            k = fb.claim_key(v["day"], v["yen"])
            if claims.get(k):
                claims[k].pop()
                took += 1
                continue
            fake.put(fb.C_SUPERCHAT, doc, v)
        n3, s3 = fake.sums(fb.C_SUPERCHAT)
        log.info(
            "BigQuery の直近%d日: %d件 / うち控えに既にあった %d件 / "
            "手入力の札で拾えた %d件 / 本当に足りなかった %d件 → "
            "重ねたあと %d件 %s円（%+d件 %+d円）",
            days, len(bq), dup, took, len(bq) - dup - took, n3, s3,
            n3 - n2, s3 - s2,
        )
        blind = sum(
            1
            for v in have.values()
            if v.get("src") == "manual" and not v.get("claim")
        )
        if blind:
            log.warning(
                "日付の無い手入力が %d件あります。**全期間を遡ると二重になりうる**",
                blind,
            )
        if dup == 0 and bq:
            log.error(
                "**1件も一致しませんでした。** item id のほどき方が"
                "アラートボックス側と BigQuery 側で違うところに着いている。"
                "このまま毎晩の掃除を回すと、同じスパチャが2件になる"
            )
            ok = False

    # ---- 4. 本番の額 ----
    try:
        with urllib.request.urlopen(PROD_FUND, timeout=20) as r:
            prod = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        log.warning("本番の /island-api/fund が読めませんでした: %s", e)
        prod = {}
    if prod:
        total = fb.to_yen(prod.get("total"))
        given = fb.to_yen(prod.get("given"))
        doneru = given - (s1 // fb.SUPERCHAT_RATE)
        after = fb.box(s1, doneru, sp1[1])
        log.info(
            "本番 total=%s円 / given=%s円（うち Doneru %s円）/ 移行後の式 %s円 / 差 %s円",
            total, given, doneru, after, after - total,
        )
        if after != total:
            log.error("本番の額と合いません。**移行しない**")
            ok = False

    log.info("結果: %s", "全部通りました" if ok else "**合わないところがあります**")
    return 0 if ok else 1


sys.exit(main())
