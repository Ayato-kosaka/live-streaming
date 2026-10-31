"""**外貨を、その日の円に直す。** 鍵の要らない ECB の口から引く。

    python3 python/fx_rate.py CAD 2.79 2026-01-09   # 手元で1件だけ試す

## どこから引くか

`https://api.frankfurter.dev/v1/<YYYY-MM-DD>?base=<通貨>&symbols=JPY`
ECB（欧州中央銀行）が毎営業日に出している値。**鍵が要らない・無料・
過去の日付が引ける。**

```
$ curl -s "https://api.frankfurter.dev/v1/2026-01-09?base=CAD&symbols=JPY"
{"amount":1.0,"base":"CAD","date":"2026-01-09","rates":{"JPY":113.54}}
```

## **頼んだ日ではなく、返ってきた日を持つ**

**土日のレートは存在しない。** ECB は営業日しか出さないので、
土曜の日付で頼むと**直前の営業日の値**が返る（`date` がその日になる）。

```
2026-10-18（土）に USD を頼む → {"date": "2026-10-16", "rates": {"JPY": 158.02}}
```

だから保存するのは**返事の `date`**。頼んだ日を保存すると、あとで
検算したときに「10/18 のレートなんて無い」になって、合わなくなる。

## 対応していない通貨がある

`python/island_tips.py` の `CURRENCY_MARKS` 14個のうち、**TWD（NT$）だけ
この口が持っていない**（404 が返る。2026-10-18 に実測）。
残り13個（USD CAD ILS EUR GBP KRW PHP INR BRL AUD NZD HKD JPY）は在る。

**表を写して持たない。** 持つと、あちらが増やした日に片方だけ古くなる。
**引いてみて、JPY が返らなければ「引けなかった」**として扱う。

## 引けなかったら、**0円にしない**

返すのは `yen: None` と理由。**黙って 0 にすると、出してくれた人が
出していない人と同じ絵になる**（`docs/island-standards.md` 10）。
足さずに残して、issue のほうで知らせる（`python/fx_tips_watch.py`）。

## 丸め

**四捨五入して1円単位。** ここは「その日いくらだったか」という**実額**の
側なので、いちばん近い円にする。`÷2`（貢献額）の切り捨ては
`python/fund_box.py` の `viewer_yen()` が**そのあとに**かける。
2026-10-18 に実測した3件（CAD 2.79→317 / ILS 6.00→323 / USD 2.00→316）と
同じ数になる丸め方。
"""

import json
import logging
import math
import sys
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

# 引く先。**鍵を持たない**（公開の口。入れるものが無いので漏らしようがない）
API = "https://api.frankfurter.dev/v1/{day}?base={base}&symbols=JPY"

# 直す先の通貨。島の額は全部これ
TARGET = "JPY"

# 口を待つ秒数。取り込みの途中で呼ぶので、長く待たない
TIMEOUT = 10

# **名乗り。省くと 403 で断られる**（2026-10-18 に実測）。
# Python の既定の名乗り（`Python-urllib/3.11`）だけが断られて、
# curl も、名乗りを付けた同じ要求も 200 で返る。
# **落ち方が「口に届かなかった」なので、黙って 0円 にはならない**が、
# 外すと**1件も換算できなくなる**（毎晩 issue が立つ）。
UA = "ayato-island (+https://github.com/Ayato-kosaka/live-streaming)"

# なぜ直せなかったか。**短い符丁で持って、人に見せるときに訳す**
# （Firestore にも issue にも載るので、字が変わると過去の行と食い違う）
WHY = {
    "": "円に直した",
    "unsupported": "この口がその通貨（かその日）を持っていない",
    "unreachable": "口に届かなかった",
    "shape": "返事の形が違う",
    "amount": "額が読めない",
    # **換算を入れる前に台帳へ入った行。** 理由ではなく「まだやっていない」。
    # `python/admin/fx_backfill.py` を流せば消える（#951 の埋め直し）
    "pending": "まだ円に直していない",
}

# 同じ（通貨, 日）を2度引かない。1回の実行のあいだだけ覚える
_SEEN: dict = {}


def _get(url: str) -> dict:
    """口を1回叩いて、返事を辞書で返す。**差し替えられるのはここだけ。**

    Args:
        url: 引く先

    Returns:
        返事の中身

    Raises:
        urllib.error.HTTPError: 404 など（通貨も日付もここで落ちる）
        OSError / ValueError: 届かない・読めない
    """
    req = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read())


def rate_of(currency: str, day: str, get=None) -> tuple:
    """その通貨の、その日のレートを引く。**返ってきた日ごと返す。**

    Args:
        currency: `CAD` のような通貨コード
        day: 頼む日（YYYY-MM-DD）
        get: 口を叩く関数（確かめで差し替える）

    Returns:
        (レート, **返ってきた日**, 理由)。引けなければ (None, None, 理由)
    """
    key = (currency, day)
    if key in _SEEN:
        return _SEEN[key]
    url = API.format(day=day, base=currency)
    try:
        got = (get or _get)(url)
    except urllib.error.HTTPError as e:
        # 404 は「その通貨（かその日）を持っていない」。TWD がこれ
        why = "unsupported" if e.code == 404 else "unreachable"
        out = (None, None, why)
    except (urllib.error.URLError, OSError, ValueError) as e:
        logger.warning("レートを引けませんでした（%s %s）: %s",
                       currency, day, str(e)[:120])
        out = (None, None, "unreachable")
    else:
        rate = ((got or {}).get("rates") or {}).get(TARGET)
        back = (got or {}).get("date")
        if not isinstance(rate, (int, float)) or not isinstance(back, str):
            out = (None, None, "shape")
        else:
            # **頼んだ日ではなく、返ってきた日。** 土日は直前の営業日が返る
            out = (float(rate), back, "")
    _SEEN[key] = out
    return out


def to_jpy(amount, currency: str, day: str, get=None) -> dict:
    """外貨を、その日の円に直す。**直せなければ 0 ではなく None。**

    Args:
        amount: 元の額（`2.79`）
        currency: 元の通貨（`CAD`）
        day: 投げてくれた日（YYYY-MM-DD。日本時間で切ったもの）
        get: 口を叩く関数（確かめで差し替える）

    Returns:
        {"yen": 円（int）か None, "rate": レートか None,
         "date": **レートの日**（返ってきた日）か None, "why": 符丁}
    """
    if amount is None or not isinstance(amount, (int, float)):
        return {"yen": None, "rate": None, "date": None, "why": "amount"}
    cur = str(currency or "").upper()
    if cur == TARGET:
        # 円は引きに行かない（口を無駄に叩かない）
        return {"yen": int(amount), "rate": 1.0, "date": day, "why": ""}
    rate, back, why = rate_of(cur, day, get=get)
    if rate is None:
        return {"yen": None, "rate": None, "date": None, "why": why}
    # **四捨五入。** 実額の側なので、いちばん近い円にする（docstring の「丸め」）
    return {"yen": int(math.floor(amount * rate + 0.5)), "rate": rate,
            "date": back, "why": ""}


def row_yen(doc) -> tuple:
    """台帳の1行から、**足してよい円**を取り出す。**足す側はここだけを見る。**

    円に直した値を持っているのは台帳（`islandTips`）で、**直すのは
    取り込みのとき1回きり**（`python/island_tips.py` の `yen_of`）。
    足すたびにレートを引き直すと、同じ投げ銭が**焼いた日によって別の額**に
    なる——図鑑（`python/build_residents.py`）と月末
    （`python/admin/monthly_tips_run.py`）で順位が割れるのがそれ。

    **だから足す側は2つとも、この1本を通す。** 片方に `amount` を直に
    足す行を書いた時点で割れる。

    Args:
        doc: 台帳の1行（`amount` / `currency` / `amountJpy`）

    Returns:
        (足してよい円, 理由の符丁)。足せないときは (None, 符丁)。
        **0 は返さない**——出してくれた人を、出していない人と同じ数にしない
        （`docs/island-standards.md` 10）
    """
    v = doc or {}
    amount = v.get("amount")
    if amount is None or not isinstance(amount, (int, float)):
        return (None, "amount")
    if str(v.get("currency") or TARGET).upper() == TARGET:
        return (int(amount), "")
    jpy = v.get("amountJpy")
    if isinstance(jpy, (int, float)):
        return (int(jpy), "")
    # **直っていない。0 にしない。** 理由が残っていなければ「まだやっていない」
    # （換算を入れる前に入った行）。どちらも `fx_tips_watch` が issue にする
    return (None, str(v.get("fxWhy") or "") or "pending")


def main() -> int:
    """手元で1件だけ試す。`python3 python/fx_rate.py CAD 2.79 2026-01-09`"""
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    if len(sys.argv) != 4:
        print(__doc__.strip().splitlines()[2])
        return 2
    cur, amount, day = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    got = to_jpy(amount, cur, day)
    print(f"{amount} {cur}（{day}）→ {got['yen']}円 "
          f"/ レート {got['rate']} / レートの日 {got['date']} "
          f"/ {WHY.get(got['why'], got['why'])}")
    return 0 if got["yen"] is not None else 1


if __name__ == "__main__":
    sys.exit(main())
