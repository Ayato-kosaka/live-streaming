"""台帳（`islandFundSuperChats`）と GAS の `SuperChats` 表の差を、1件残らず説明する。

## なぜ要るか

豚の貯金箱を GAS から台帳へ移す（#305）と、**読む先が変わった瞬間に額が動く。**
2026-09-23 の実測で、件数が GAS 481 / 台帳 509 で **28件ずれていた。**
そのうち25件は 2026-09-21 に `fund_sync --sweep` で BigQuery から入れたぶん
（#292 で承認済み）だと分かっていたが、**残りの正体が分かっていなかった。**

**正体の分からない差を抱えたまま切り替えると、貯金箱が説明のつかない
動き方をする。** ここはその差を、出どころごとに数えるためだけの道具。

## 出すのは数字と日付だけ

**このリポジトリは公開で、Actions のログは誰でも読める。**
名前もチャンネルIDも本文も出さない。書類IDそのものも出さない
（26文字の item id は YouTube の中で1件を名指しできる）。
正体の分からない1件を指すときは、**sha1 の頭8桁の指紋**で呼ぶ。

## 1バイトも書かない

読むのは GAS の表・Firestore の2つのコレクション・BigQuery の3つで、
**どれも読むだけ。** 何度流しても本番は1ミリも動かない。

## 補正の当てになる数まで出す

差が分かっただけでは切り替えられない。**切り替えた瞬間に豚と同じ額に
なる**ところまで出す。出すのは3つ。

  - いまの目標（`islandFundGoals`）の開始日
  - 28件を、ある日で切ったときの前後の件数と円
  - 「目標の開始日で切る」「支出で補正を1行入れる」を採ったときの、
    切り替え後の `total`（本番の `GET /island-api/fund` と並べる）

実行:
  Actions > 管理スクリプトを実行 > script = fund_diff
  args: {}                     … 全期間（BigQuery は 1000日ぶん遡る）
  args: {"days": 400}          … BigQuery を何日ぶん見るか
  args: {"cut": "2026-07-26"}  … 前後に分けて数える日（既定 2026-07-26）
"""

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_box as fb  # noqa: E402
from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402


# 本番がいま返している額。**鍵は要らない**（`fund_check` と同じ口）
PROD_FUND = "https://live-streaming-d3cac.web.app/island-api/fund"


def prod_fund() -> dict:
    """本番の `GET /island-api/fund` を1回だけ読む。

    Returns:
        返ってきた JSON。読めなければ空の辞書
    """
    try:
        with urllib.request.urlopen(PROD_FUND, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        log.warning("本番の /fund が読めません: %s", type(e).__name__)
        return {}


# 豚が読んでいる Goals の1件。**この id は `functions/src/islandApi.ts` と同じ。**
GAS_GOAL_ID = "2025-10-24"


def gas_goal() -> dict:
    """GAS の `Goals` から、豚が読んでいる1件を取る。

    Returns:
        その行。無ければ空の辞書
    """
    for r in fb.gas_table("Goals"):
        if str(r.get("id") or "") == GAS_GOAL_ID:
            return r
    return {}


def split(rows: list, cut: str) -> tuple:
    """ある日を境に2つに分ける。**境の日そのものは「以降」に入れる。**

    Args:
        rows: `(書類ID, 中身)` の配列
        cut: `2026-07-26` の形

    Returns:
        `(より前, 以降)`
    """
    before = [(d, v) for d, v in rows if str(v.get("day") or "") < cut]
    after = [(d, v) for d, v in rows if str(v.get("day") or "") >= cut]
    return before, after


def fp(doc: str) -> str:
    """書類IDの指紋。**IDそのものはログに出さない。**

    Args:
        doc: 書類ID

    Returns:
        sha1 の頭8桁
    """
    return hashlib.sha1(doc.encode("utf-8")).hexdigest()[:8]


def days_of(rows: list) -> str:
    """日付をまとめて1行にする。件数の多い日から並べる。

    Args:
        rows: `(書類ID, 中身)` の配列

    Returns:
        `2026-09-19×5, 2026-09-13×3` の形。空なら `-`
    """
    n = {}
    for _, v in rows:
        n[str(v.get("day") or "（日付なし）")] = n.get(str(v.get("day") or "（日付なし）"), 0) + 1
    if not n:
        return "-"
    return ", ".join(f"{d}×{c}" for d, c in sorted(n.items()))


def yen_of(rows: list) -> int:
    """満額の合計。

    Args:
        rows: `(書類ID, 中身)` の配列

    Returns:
        円
    """
    return sum(int(v.get("yen") or 0) for _, v in rows)


def line(label: str, rows: list) -> None:
    """表の1行を出す。**件数・満額・貯金箱ぶん・どの日**だけ。

    貯金箱ぶんは **この塊だけを足して半分**にした数ではなく、
    `満額 // 2` を出す。全体は「全部足してから半分」なので、
    塊ごとの半分を足したものとは奇数円のぶんだけずれる。**そこも出す。**

    Args:
        label: 出どころの名前
        rows: `(書類ID, 中身)` の配列
    """
    y = yen_of(rows)
    log.info("  %-34s %3d件 / %8d円 / 半分 %7d円 / %s", label, len(rows), y, y // 2, days_of(rows))


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら正体不明が1件も無い。1 なら残った
    """
    a = args()
    days = int(a.get("days", 1000))
    # あやとが挙げた線（2026-09-23）。「2026/07/26 を開始日付にしたら
    # 昔分のズレは解消できると思う」が数で成り立つかを見るための境
    cut = str(a.get("cut", "2026-07-26"))

    # ---- GAS の表 ----
    gas = fb.gas_superchats()
    gas_ids = {doc for doc, _ in gas}
    raw = fb.gas_table("SuperChats")
    log.info("GAS の SuperChats: 表の行 %d / 控えに入る形になったもの %d件 / %d円",
             len(raw), len(gas), yen_of(gas))
    if len(gas_ids) != len(gas):
        log.warning("  **GAS の中で書類IDが重なっているものが %d件あります**",
                    len(gas) - len(gas_ids))

    # ---- 台帳 ----
    client = db()
    ledger = []
    for d in client.collection(fb.C_SUPERCHAT).stream():
        ledger.append((d.id, d.to_dict() or {}))
    led_ids = {doc for doc, _ in ledger}
    log.info("台帳（%s）: %d件 / %d円", fb.C_SUPERCHAT, len(ledger), yen_of(ledger))

    # ---- BigQuery（円のぶんだけ。外貨はもともと足していない） ----
    bq = fb.bq_superchats(BQ_PROJECT_ID, BQ_DATASET, days)
    bq_ids = {doc for doc, _ in bq}
    log.info("BigQuery（直近%d日 / 円のみ）: %d件 / %d円", days, len(bq), yen_of(bq))

    # ---- 差 ----
    only_led = [(doc, v) for doc, v in ledger if doc not in gas_ids]
    only_gas = [(doc, v) for doc, v in gas if doc not in led_ids]
    log.info("")
    log.info("台帳にだけ在る: %d件 / %d円（半分 %d円）",
             len(only_led), yen_of(only_led), yen_of(only_led) // 2)
    log.info("GAS にだけ在る: %d件 / %d円", len(only_gas), yen_of(only_gas))
    if only_gas:
        log.warning("  **GAS にしか無いものがあります。**移行が通っていない可能性")
        line("GAS にだけ在る", only_gas)

    # ---- 台帳にだけ在るぶんを、出どころで分ける ----
    in_bq = [(doc, v) for doc, v in only_led if doc in bq_ids]
    manual = [(doc, v) for doc, v in only_led if doc not in bq_ids and doc.startswith("manual-")]
    rest = [(doc, v) for doc, v in only_led
            if doc not in bq_ids and not doc.startswith("manual-")]
    log.info("")
    log.info("台帳にだけ在る %d件の内訳:", len(only_led))
    line("BigQuery にだけ在った", in_bq)
    line("手入力（manual-…）", manual)
    line("そのほか（正体不明）", rest)

    # **境の日で前後に分ける。** ここが「目標の開始日で切れば揃う」かどうか
    log.info("")
    log.info("台帳にだけ在る %d件を %s で分けると:", len(only_led), cut)
    for name, rows in (("BigQuery にだけ在った", in_bq),
                       ("手入力（manual-…）", manual),
                       ("そのほか（正体不明）", rest)):
        b, af = split(rows, cut)
        log.info("  %-26s より前 %3d件 / %7d円   以降 %3d件 / %7d円",
                 name, len(b), yen_of(b), len(af), yen_of(af))

    # 正体不明は1件ずつ。**書類IDは出さない**（指紋と、中身の欄だけ）
    for doc, v in rest:
        log.info(
            "    指紋 %s / %s / %d円 / src=%s / from=%s / currency=%s / "
            "26文字か=%s / claim=%s",
            fp(doc),
            v.get("day") or "（日付なし）",
            int(v.get("yen") or 0),
            v.get("src") or "-",
            v.get("from") or "-",
            v.get("currency") or "-",
            bool(fb.ITEM_ID.match(doc)),
            "あり" if v.get("claim") else "なし",
        )

    # ---- 台帳そのものの健康 ----
    log.info("")
    bad_cur = [(d, v) for d, v in ledger
               if str(v.get("currency") or "") not in ("円", "", "JPY")]
    bad_yen = [(d, v) for d, v in ledger if int(v.get("yen") or 0) <= 0]
    unclaimed = [(d, v) for d, v in ledger
                 if str(d).startswith("manual-") and v.get("claim") and not v.get("claimedBy")]
    log.info("台帳の健康: 円以外 %d件 / 0円以下 %d件 / 札の残った手入力 %d件",
             len(bad_cur), len(bad_yen), len(unclaimed))
    if bad_cur:
        line("円以外", bad_cur)
    if bad_yen:
        line("0円以下", bad_yen)

    # ---- いまの目標 ----
    goal = fb.read_goal(client)
    log.info("")
    if goal:
        log.info("いまの目標（%s）: from=%s / to=%s / label=%s / yen=%s",
                 fb.C_GOAL, goal.get("from"), goal.get("to") or "（開いている）",
                 goal.get("label"), goal.get("yen"))
    else:
        log.info("いまの目標（%s）: **1件も入っていません**", fb.C_GOAL)

    # ---- 支出と、切り替え後の額 ----
    s = fb.read_sums(client)
    log.info("")
    log.info("台帳の合計: スパチャ %d円（半分 %d円） / 支出 %d円（%d件） / 起点 %d円",
             s["superchatFull"], s["superchat"], s["spend"], s["spendCount"],
             fb.start_amount(s["spend"]))
    gas_full = yen_of(gas)
    log.info("GAS の合計: スパチャ %d円（半分 %d円）", gas_full, gas_full // 2)
    log.info("切り替えで動く額（Doneru と支出が同じなら）: %+d円",
             s["superchat"] - gas_full // 2)

    # ---- 本番と並べて、合わせかたを数で出す ----
    prod = prod_fund()
    g = gas_goal()
    log.info("")
    gas_sc = fb.to_yen(g.get("superChatAmount"))
    gas_start = fb.to_yen(g.get("startAmount"))
    log.info("GAS の Goals: startAmount=%d / superChatAmount=%d / targetAmount=%d",
             gas_start, gas_sc, fb.to_yen(g.get("targetAmount")))
    if gas_sc != gas_full // 2:
        log.warning("  **Goals の superChatAmount と表の合計の半分が合いません**"
                    "（%d ≠ %d）。表を読んだ時刻と Goals を読んだ時刻のあいだに"
                    "投げ銭が入ると1件ぶんずれる", gas_sc, gas_full // 2)
    if not prod.get("total") or not gas_sc:
        log.warning("本番の額か GAS の Goals が読めないので、合わせかたの数は出せません")
        return 1 if rest else 0
    prod_total = int(prod["total"])

    # Doneru は口が持っている累計。**こちらは控えを持たない**ので、いま本番が
    # 返している額から逆算する（`fund_box` の「Doneru はここに入れない」）。
    # **逆算に台帳の支出を使わない。** 本番の額は GAS の起点でできているので、
    # 台帳の支出に補正を1行足したとたんに、逆算した Doneru が同じだけ太る
    doneru = prod_total - gas_sc - gas_start
    log.info("本番の /island-api/fund: total=%s / given=%s / goal=%s / people=%s",
             prod_total, prod.get("given"), prod.get("goal"), prod.get("people"))
    log.info("  逆算した Doneru の累計: %d円", doneru)

    # ---- 案0: そのまま切り替える ----
    plain = fb.box(s["superchatFull"], doneru, s["spend"])
    need = plain - prod_total
    log.info("")
    log.info("案0 そのまま切り替える: total=%d円（いまとの差 %+d円）", plain, need)

    # **差の内訳。** 「台帳にだけ在る」と「台帳がまだ拾っていない」は別もので、
    # 後者は fund_sync が回れば自分で消える。**補正に入れてよいのは前者だけ。**
    led_only = yen_of(only_led) // 2
    gas_only = yen_of(only_gas) // 2
    spend_gap = -s["spend"] - gas_start
    log.info("  差の内訳: 台帳にだけ在る半分 %+d / 台帳がまだ拾っていない半分 %+d / "
             "支出と起点の差 %+d", led_only, -gas_only, spend_gap)
    if led_only - gas_only + spend_gap != need:
        log.warning("  **内訳を足しても差にならない**（%d ≠ %d）。"
                    "奇数円の切り捨ての位置が違う",
                    led_only - gas_only + spend_gap, need)

    # ---- 案1: 目標の開始日より前のスパチャを数えない ----
    for name, day in (("あやとの挙げた線", cut), ("目標の from", str(goal.get("from") or ""))):
        if not day:
            continue
        before, after_cut = split(ledger, day)
        cut_total = fb.box(yen_of(after_cut), doneru, s["spend"])
        log.info("案1 %s（%s）より前を数えない: 落ちるのが %d件 / %d円、"
                 "total=%d円（いまとの差 %+d円）",
                 name, day, len(before), yen_of(before), cut_total,
                 cut_total - prod_total)

    # ---- 案2: 支出に補正を1行足す ----
    # **台帳が追いついたあとに要る額**を出す。いま要る額（need）には、
    # BigQuery にまだ入っていない今日ぶんが混ざっているので、そちらを入れると
    # 明日そのぶんだけ足りなくなる
    settled = led_only + spend_gap
    fixed = fb.box(s["superchatFull"], doneru, s["spend"] + settled)
    log.info("案2 支出に補正を1行足す: 入れるのは %d円"
             "（台帳にだけ在る %d件の半分）。台帳が今日ぶんを拾い終わったあとの "
             "total=%d円（いまとの差 %+d円）",
             settled, len(only_led), fixed + gas_only, fixed + gas_only - prod_total)
    log.info("  いまこの瞬間に合わせるだけなら %d円 だが、**そちらは入れない**"
             "（今日ぶん %d円 が BigQuery に入った晩に、そのぶん足りなくなる）",
             need, gas_only * 2)
    log.info("")
    log.info("**出すときの合格条件**: fund_sync を apply で回してから この道具を"
             "回し直して、案0 の差が +0円 になること")

    if rest:
        log.error("**正体の分からないものが %d件 残っています。**"
                  "ここが埋まるまで、読む先を台帳へ切り替えない", len(rest))
        return 1
    log.info("台帳にだけ在るものは、1件残らず説明がつきました")
    return 0


sys.exit(main())
