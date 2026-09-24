"""Doneru の鍵を、島にひとつの置き場（`islandFundConfig/doneru`）へ移す（#639）。

## なぜ動かすのか

豚の貯金箱の額は #305 で台帳（`islandFundSuperChats` → `island/state.fund.box`）へ
移った。**移りきらずに残ったのが Doneru の鍵**で、いまも
`islandGoal/2025-10-24` ——GAS の表を写しただけの書類——から読んでいる。

その書類には、もう誰も使っていない欄が2つ（`startAmount` / `superChatAmount`）
古い値のまま凍っている。**次に読む人が「こっちが正かな」と思う形**なので畳む。

## どこへ置くか

**`islandFundConfig/doneru` の `goalKey`。島にひとつ。目標ごとではない。**
理由は `python/fund_box.py` の `C_CONFIG` のところに書いた——ひとことで言うと、
目標に紐づけると **次の目標を作った瞬間に Doneru のぶん（194,820円）が消える。**

## 順番（ここを飛ばすと貯金箱が 194,820円 減る）

    1. この口を `{"apply": true}` で押して、新しい置き場へ写す ← まだ誰も読まない
    2. この口をもう一度、入力なしで押して「同じ鍵が出る」ことを見る
    3. 読む側（`functions/src/islandApi.ts`）を切り替えて配る
    4. 旧い書類を畳む

**1 と 2 を飛ばして 3 をしない。** 鍵が引けないと `doneruNow()` が null になり、
合計が 86,510 → −108,310 になって `GET /fund` が 503 を返す。

## 使いかた

    script: doneru_key
    args: {}                 … 見るだけ（**1バイトも書かない**）
    args: {"apply": true}    … 旧い書類から新しい置き場へ写す

新しい鍵に取り替えたくなったとき（Doneru 側で目標を作り直したとき）は、
**ARGS に鍵を書かない。ARGS は公開の Actions ログに出る。**
`DONERU_GOAL_KEY_NEW` という環境変数に入れて押す（Secret から渡す）。

## ログに出るもの

**鍵の値は1文字も出ない。** 出るのは長さ・形（32桁の16進か）・
**旧と新が一致したかどうか**だけ。

## 終了コード

    0 … 見たかぎり問題なし（写した／もう写してある／下見が通った）
    1 … 写せなかった・旧と新が食い違っている
    2 … 数えるものが無い（旧も新も鍵を持っていない）
"""

import os
import sys

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_box as fb  # noqa: E402

# 旧い置き場。**GAS の表を写しただけの書類**（#305 でここから額が抜けた）。
OLD_COLLECTION = "islandGoal"
OLD_DOC = "2025-10-24"
OLD_FIELD = "doneruGoalKey"

# 数えるものが無い（`docs/island-standards.md` §15）
NOTHING = 2


def shape(v: str) -> str:
    """鍵の姿を、値を1文字も出さずに言う。

    Args:
        v: 鍵（空文字でもよい）

    Returns:
        ログに出してよい1行
    """
    if not v:
        return "無し"
    ok = "32桁の16進" if fb.DONERU_KEY.match(v) else "**形が違う**"
    return f"{len(v)}文字 / {ok}"


def read_raw(client, collection: str, doc: str, field: str) -> str:
    """書類から鍵を1つ読む。**形は見ない**（形を見るのは呼んだ側）。

    Args:
        client: Firestore クライアント
        collection: 入れ物の名前
        doc: 書類ID
        field: 欄の名前

    Returns:
        入っていた字。書類が無い・欄が無ければ空文字
    """
    snap = client.collection(collection).document(doc).get()
    if not snap.exists:
        return ""
    return str((snap.to_dict() or {}).get(field) or "")


def main(client=None) -> int:
    """エントリポイント。

    Args:
        client: Firestore クライアント。渡さなければ本番につなぐ
            （**見張り（`doneru_key_selftest.py`）が偽物を差し込むためだけ**に
            開けてある。本番から呼ぶときは渡さない）

    Returns:
        0 なら通った。1 なら食い違い。2 なら数えるものが無い
    """
    a = args()
    apply = bool(a.get("apply", False))
    # **ARGS からは受け取らない。** ARGS は公開の Actions ログに出る
    if "key" in a or "goalKey" in a:
        log.error(
            "鍵を ARGS に書かないでください（ARGS は公開のログに出ます）。"
            "取り替えるときは環境変数 DONERU_GOAL_KEY_NEW に入れて押してください"
        )
        return 1
    if client is None:
        client = db()

    old = read_raw(client, OLD_COLLECTION, OLD_DOC, OLD_FIELD)
    new = read_raw(client, fb.C_CONFIG, fb.DONERU_DOC, "goalKey")
    fresh = str(os.getenv("DONERU_GOAL_KEY_NEW") or "")

    log.info("旧 %s/%s の %s: %s", OLD_COLLECTION, OLD_DOC, OLD_FIELD, shape(old))
    log.info("新 %s/%s の goalKey: %s", fb.C_CONFIG, fb.DONERU_DOC, shape(new))
    if fresh:
        log.info("環境変数で渡された取り替え用の鍵: %s", shape(fresh))

    # **`GET /fund` の 503 の足が、本当に立っているか。**
    # 鍵が引けなかったとき、合計は負になって `island/state.fund.total` へ
    # 落ちる。そこに古い正の数が残っていると **503 ではなく古い額が 200 で
    # 出る。** 誰も書いていないはずの欄なので、無いことをここで数えておく
    state = client.collection("island").document("state").get()
    f = ((state.to_dict() or {}).get("fund") or {}) if state.exists else {}
    if "total" in f:
        log.warning(
            "island/state.fund.total が残っています。"
            "**鍵が引けない回に 503 ではなく古い額が 200 で出ます**"
        )
    else:
        log.info("island/state.fund.total: 無し（鍵が引けない回は 503 に落ちる）")
    log.info("island/state.fund.box.goal: %s", "有り" if (f.get("box") or {}).get("goal") else "**無し**")

    # ---- 何を書くか決める ----
    want = fresh or old
    if not want:
        if new:
            log.info("旧い書類に鍵がありません。新しい置き場にはあります（移し終わり）")
            return 0
        log.error("旧にも新にも鍵がありません。**写す元がありません**")
        return NOTHING

    if not fb.DONERU_KEY.match(want):
        # **形が違うものを新しい置き場に置かない。** 置くと、読む側が
        # 弾いた結果 Doneru のぶんが黙って消える
        log.error("写そうとした鍵の形が違います（%s）。1バイトも書きません", shape(want))
        return 1

    if new and new == want:
        log.info("**一致しました。** 新しい置き場の鍵は、写す元と同じものです")
        return 0
    if new and new != want:
        log.warning("新しい置き場に、**別の鍵**が入っています（%s）", shape(new))
        if not apply:
            log.info("見るだけで終わりました。上書きするには {\"apply\": true}")
            return 1

    if not apply:
        log.info(
            "見るだけで終わりました。写すには {\"apply\": true}（%s へ1書類）",
            f"{fb.C_CONFIG}/{fb.DONERU_DOC}",
        )
        return 0

    client.collection(fb.C_CONFIG).document(fb.DONERU_DOC).set(
        {"goalKey": want}, merge=True
    )
    # **書いたあと、読み直して確かめる。** 書けたことと、読めることは別
    back = fb.read_doneru_key(client)
    if back != want:
        log.error("書いたはずの鍵が読み直せません（%s）", shape(back))
        return 1
    log.info("写しました。読み直しても**一致**します（%s）", shape(back))
    return 0


if __name__ == "__main__":
    sys.exit(main())
