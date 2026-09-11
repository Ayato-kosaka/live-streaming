"""豚の貯金箱の元（GAS の `Goals` 1行）を Firestore へ移す。

## 何を移すのか

| 何を | どこから | どこへ |
| --- | --- | --- |
| 鍵と額 | GAS の `Goals`（id `2025-10-24`） | `islandGoal/2025-10-24` |

移すのは**4つだけ**。`functions/src/islandApi.ts` の `goalRecord()` が
読んでいるのと同じ4つで、これがサイトの豚の貯金箱
（`GET /island-api/fund`）の元になっている。

    doneruGoalKey    … Doneru の goal key
    startAmount      … この企画の起点（負の数）
    superChatAmount  … スパチャの積み上がり（合計してから半分）
    targetAmount     … 目標額（バーの高さ）

**`label` は移さない。** いま読んでいるのは配信の OBS（`app/alertbox`）だけで、
そちらは #305 の別の回で一緒に移す。ここで先に置くと、正が2か所になる。

## 移して狂わないこと

**貯金箱の額が1円でも動いたら移行しない。**

本番の `GET /island-api/fund` は

    total = doneruAmount + superChatAmount + startAmount
    given = doneruAmount + superChatAmount
    goal  = targetAmount

を返している。**Doneru の累計は別に読む**（`api.doneru.jp` の同じ口を
本番の Functions と同じように叩く）。読まずに `given - superChatAmount` で
逆算すると、**superChatAmount が違っていても差が Doneru に吸われて
気づけない。** 別に読んで初めて3つとも独立に突き合わせられる。

合わなければ1行も書かずに 1 で落ちる。

`goalRecord()` は **Firestore → 無ければ GAS** の順に読むので、
本番は「Firestore に書く前は GAS の値」「書いたあとは Firestore の値」を
出している。どちらの側とも合わなければ、こちらが見ている表が
本番の元ではないということなので、書かない。

**本番は5分ぶん寝かせた値を返す**（`FUND_TTL_MS` と CDN）。配信中や
投げ銭が入った直後は、こちらが読む GAS と本番の返り値がずれる。
**配信していない時間帯に流す。** ずれたら数分おいて流し直す。

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: goal_migrate
    args:   {}                … 並べて出すだけ（**既定。1行も書かない**）
    args:   {"apply": true}   … Firestore に書いて、読み直して確かめる

**何度流しても同じ結果になる。** 書類IDが `2025-10-24` で固定なので、
2回目は同じ書類を上書きするだけ。

## ログに出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。

**鍵（`doneruGoalKey`）そのものは1文字も出さない。** 長さと、形が合って
いるかと、両側で同じかだけを出す。

**個人の名前と個人の額も出さない。** この表は合計しか持っていないが、
念のため書いておく。合計と目標額は本番の口が誰にでも返しているので出す。
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_box as fb  # noqa: E402

# 移す先。**書類IDは GAS の表の id と同じ文字にする。**
# `functions/src/islandApi.ts` の GOAL_ID と揃っていること。
COLLECTION = "islandGoal"
GOAL_ID = "2025-10-24"

# 移す4つ。**この順で並べて出す。**
FIELDS = ("doneruGoalKey", "startAmount", "superChatAmount", "targetAmount")
# 額の3つ（鍵だけは扱いが違うので分けておく）
YEN_FIELDS = ("startAmount", "superChatAmount", "targetAmount")

# 本番が実際に返している額。鍵は要らない（誰でも読める口）。
PROD_FUND = "https://live-streaming-d3cac.web.app/island-api/fund"
# Doneru の累計。**ここを別に読まないと、突き合わせが円環になる。**
# 本番の返り値からは `given - superChatAmount` でしか Doneru を出せないので、
# superChatAmount が間違っていても差が Doneru に吸われて気づけない。
DONERU_GOAL = "https://api.doneru.jp/widget/goal/data"


def mask(key: str) -> str:
    """鍵を、中身を出さずに言い表す。

    Args:
        key: `doneruGoalKey`

    Returns:
        ログに出してよい説明
    """
    if not key:
        return "（無い）"
    ok = "形は合っている" if fb_key_ok(key) else "**形が違う**"
    return f"{len(key)}文字 / {ok}"


def fb_key_ok(key: str) -> bool:
    """`goalRecord()` が通す鍵の形かどうか。

    Functions 側の `/^[0-9a-f]{16,64}$/` と同じ判定。ここで弾いておかないと、
    書けたのに本番が「鍵が読めない」で GAS に落ち続ける。

    Args:
        key: `doneruGoalKey`

    Returns:
        通るなら True
    """
    return 16 <= len(key) <= 64 and all(c in "0123456789abcdef" for c in key)


def gas_goal() -> dict:
    """GAS の `Goals` から、移す4つを取る。

    Returns:
        4つの辞書。行が無ければ空の辞書
    """
    rows = fb.gas_table("Goals")
    row = {}
    for r in rows:
        if str(r.get("id") or "") == GOAL_ID:
            row = r
    if not row and rows:
        # id の付いていない表なら1行しか無いので、それを使う
        row = rows[0]
    if not row:
        return {}
    return {
        "doneruGoalKey": str(row.get("doneruGoalKey") or ""),
        "startAmount": fb.to_yen(row.get("startAmount")),
        "superChatAmount": fb.to_yen(row.get("superChatAmount")),
        "targetAmount": fb.to_yen(row.get("targetAmount")),
    }


def fs_goal(client) -> dict:
    """Firestore のいまの `islandGoal/{id}` を取る。

    Args:
        client: Firestore クライアント

    Returns:
        4つの辞書。書類が無ければ空の辞書
    """
    snap = client.collection(COLLECTION).document(GOAL_ID).get()
    if not snap.exists:
        return {}
    v = snap.to_dict() or {}
    return {
        "doneruGoalKey": str(v.get("doneruGoalKey") or ""),
        "startAmount": fb.to_yen(v.get("startAmount")),
        "superChatAmount": fb.to_yen(v.get("superChatAmount")),
        "targetAmount": fb.to_yen(v.get("targetAmount")),
    }


def prod_fund() -> dict:
    """本番の `GET /island-api/fund` が返している額。

    Returns:
        返り値の辞書。読めなければ空の辞書
    """
    try:
        with urllib.request.urlopen(PROD_FUND, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        log.warning("本番の /island-api/fund が読めませんでした: %s", e)
        return {}


def doneru_now(key: str):
    """Doneru の累計を、本番の Functions と同じ口から取る。

    Args:
        key: `doneruGoalKey`（**ログには出さない**）

    Returns:
        円。読めなければ None
    """
    url = f"{DONERU_GOAL}?key={urllib.parse.quote(key)}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            j = json.loads(r.read().decode("utf-8"))
        n = fb.to_yen(j.get("amount"))
        return n if n >= 0 else None
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        # 鍵は URL に入っているので、例外の中身をそのまま出さない
        log.warning("Doneru が読めませんでした: %s", type(e).__name__)
        return None


def show(name: str, gas: dict, fs: dict) -> None:
    """移す前の値と、いま Firestore にある値を並べて出す。

    Args:
        name: 見出し
        gas: GAS 側の4つ
        fs: Firestore 側の4つ
    """
    log.info("---- %s ----", name)
    log.info("%-16s %-24s %s", "欄", "GAS（いまの正）", "Firestore（移す先）")
    log.info(
        "%-16s %-24s %s",
        "doneruGoalKey",
        mask(gas.get("doneruGoalKey", "")),
        mask(fs.get("doneruGoalKey", "")) if fs else "（書類が無い）",
    )
    same = (
        "同じ"
        if fs and gas.get("doneruGoalKey") == fs.get("doneruGoalKey")
        else "**違う**"
    )
    log.info("%-16s %s", "  鍵の一致", same if fs else "（比べられない）")
    for f in YEN_FIELDS:
        log.info(
            "%-16s %-24s %s",
            f,
            f"{gas.get(f, 0)}円",
            f"{fs.get(f, 0)}円" if fs else "（書類が無い）",
        )


def matches_prod(v: dict, prod: dict, doneru) -> bool:
    """本番がいま出している額が、この4つから出たものかどうか。

    Doneru の累計が読めていれば、3つとも突き合わせる。

        given = doneru + superChatAmount
        total = doneru + superChatAmount + startAmount
        goal  = targetAmount

    読めていなければ Doneru を `given - superChatAmount` で逆算するしかなく、
    **superChatAmount が違っていても差が Doneru に吸われて気づけない。**
    その場合は起点と目標額だけを見る（弱い突き合わせ）。

    Args:
        v: 4つの辞書
        prod: 本番の `/island-api/fund` の返り値
        doneru: Doneru の累計。読めなければ None

    Returns:
        合っていれば True
    """
    if not v or not prod:
        return False
    total = fb.to_yen(prod.get("total"))
    given = fb.to_yen(prod.get("given"))
    goal = fb.to_yen(prod.get("goal"))
    if doneru is None:
        return (
            total - given == v["startAmount"]
            and goal == v["targetAmount"]
            and given - v["superChatAmount"] >= 0
        )
    return (
        given == doneru + v["superChatAmount"]
        and total == doneru + v["superChatAmount"] + v["startAmount"]
        and goal == v["targetAmount"]
    )


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら合っている。1 なら書いていない（か、書いたあとがずれている）
    """
    a = args()
    apply = bool(a.get("apply", False))

    # ---- 1. 移す中身（GAS）----
    gas = gas_goal()
    if not gas:
        log.error("GAS の Goals に行がありません。移行しません")
        return 1
    if not fb_key_ok(gas["doneruGoalKey"]):
        log.error(
            "GAS の doneruGoalKey が、Functions の通す形（16〜64桁の16進）に "
            "なっていません（%s）。書いても本番は GAS に落ち続けます",
            mask(gas["doneruGoalKey"]),
        )
        return 1

    # ---- 2. いま Firestore に何があるか ----
    client = db()
    before = fs_goal(client)
    show("移す前", gas, before)

    # ---- 3. 本番がいま出している額と突き合わせる ----
    # **ここが「間違った表を移さない」の担保。** 本番は
    # Firestore → 無ければ GAS の順に読むので、本番の額はどちらか片方から
    # 出ているはず。**両方と違うなら、こちらが見ている表は本番の元ではない。**
    prod = prod_fund()
    if not prod:
        log.error("本番と突き合わせられませんでした。**この状態で書かない**")
        return 1
    log.info(
        "本番の /island-api/fund: total=%s円 / given=%s円 / goal=%s円 / "
        "people=%s人",
        fb.to_yen(prod.get("total")),
        fb.to_yen(prod.get("given")),
        fb.to_yen(prod.get("goal")),
        prod.get("people"),
    )
    doneru = doneru_now(gas["doneruGoalKey"])
    if doneru is None:
        log.warning(
            "Doneru が読めないので、突き合わせが弱くなります"
            "（スパチャの額だけ独立に確かめられません）"
        )
    else:
        log.info("Doneru の累計: %s円", doneru)
    from_gas = matches_prod(gas, prod, doneru)
    from_fs = matches_prod(before, prod, doneru) if before else False
    log.info(
        "本番の額の出どころ: GAS と一致=%s / Firestore と一致=%s",
        from_gas,
        from_fs,
    )
    if not from_gas and not from_fs:
        log.error(
            "本番が出している額が、GAS の表からも Firestore からも出て "
            "きません。**移す表を間違えている可能性があるので書かない。**"
            "投げ銭が入った直後なら数分おいて流し直す"
            "（本番は5分ぶん寝かせた値を返す）"
        )
        return 1

    if before and before == gas:
        log.info("Firestore は既に同じ4つを持っています（やることなし）")
        return 0

    # ---- 3.5 移行そのものか、あとからの追いつきか ----
    if not before:
        # **初回。ここは1円も動いてはいけない。** 本番はいま GAS を見て
        # いるので、GAS と一致していなければ、書いた瞬間に額が変わる。
        if not from_gas:
            log.error(
                "Firestore が空なのに、本番の額が GAS から出ていません。"
                "**書くと額が動くので書かない**"
            )
            return 1
        log.info("初回の移行。本番がいま出している額と1円まで一致しています")
    else:
        # 2回目以降。**配信のあいだ、スパチャは GAS 側だけが増える**
        # （OBS の書き込み先を移すのは #305 の次の回）。だから額が動くのは
        # 正しい。動いてよいのは「増える」方向だけで、減るのは表が
        # 読めていないときの形なので止める。
        for f in YEN_FIELDS:
            if gas[f] != before[f]:
                log.info(
                    "追いつき: %s が %s円 → %s円（%+d円）",
                    f, before[f], gas[f], gas[f] - before[f],
                )
        if gas["superChatAmount"] < before["superChatAmount"]:
            log.error(
                "スパチャの積み上がりが減っています。"
                "**表が読めていないときの形なので書かない**"
            )
            return 1
        if gas["doneruGoalKey"] != before["doneruGoalKey"]:
            log.warning("鍵が変わります（GAS 側の鍵で上書きします）")

    # ---- 4. 書く ----
    if not apply:
        log.info(
            "見るだけで終わりました（**1行も書いていません**）。"
            "書くには {\"apply\": true}"
        )
        return 0

    # merge=True。**ここが持っていない欄を消さない**（`label` を後から
    # 足す回があるので、そのとき書いた欄をこちらが落とさないようにする）
    client.collection(COLLECTION).document(GOAL_ID).set(
        {f: gas[f] for f in FIELDS}, merge=True
    )
    log.info("書きました: %s/%s", COLLECTION, GOAL_ID)

    # ---- 5. 読み直して、4つとも一致するか ----
    after = fs_goal(client)
    show("書いたあと", gas, after)
    bad = [f for f in FIELDS if after.get(f) != gas.get(f)]
    if bad:
        log.error("読み直したら合いません: %s。**このまま本番を切り替えない**", bad)
        return 1
    log.info("4つとも一致しました。Firestore が正になれます")
    return 0


sys.exit(main())
