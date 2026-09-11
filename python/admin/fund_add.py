"""豚の貯金箱に、手で1件足す／消す。

## なぜ手で入れる口が要るのか

自動で入る道が2本あるが、**どちらも取りこぼす。**

  - OBS のアラートボックス … **起動し忘れた晩は1件も入らない**
  - BigQuery … YouTube 側の都合でチャットが消えることがある

両方が落ちた晩のスパチャは、どこからも入らない。そのぶんを入れる口。
支出と目標は、そもそも機械が知りようがないので、ここか画面からしか入らない。

**画面（オーナー画面）はまだ無い。** できたら画面がこの3つを呼ぶ。
それまでの口がここ。

## 2回入れても増えない

書類IDは中身から決まる（`python/fund_box.py`）。

  - スパチャ … `manual-<日付>-<日付・額・名前のハッシュ8桁>`
  - 支出   … `<日付>-<日付・題・額のハッシュ8桁>`
  - 目標   … 開始日そのもの

同じものを2回入れると**同じ書類に上書きされる**ので、件数も合計も増えない。
別人が同じ日に同じ額を出したときは名前で分かれる。

## 使いかた

    script: fund_add
    args: {"kind":"superchat","day":"2026-09-09","yen":500,"who":"（名前）"}
    args: {"kind":"spend","day":"2026-09-11","title":"宿代","yen":4000}
    args: {"kind":"goal","from":"2026-07-27","label":"北欧周りたい","yen":50000}
    args: {"kind":"goal","from":"2026-07-27","to":"2026-09-27"}   … 目標を閉じる

    そのどれかに {"apply": true} を足すと書く。**既定は書かない。**
    消すときは {"kind":"...","doc":"<書類ID>","remove":true,"apply":true}

`who` は入れなくてもよい（空でも書類IDは決まる）。**入れると、あとで
「これは二重登録では？」を人が見分けられる。** 入れたものはログに出さない。

## 足したあと

合計（`island/state.fund.box`）は毎晩の掃除が焼き直す。すぐ反映したいときは
`fund_sync` を `{"apply": true}` で流す。
"""

import os
import sys

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_box as fb  # noqa: E402

KINDS = {"superchat": fb.C_SUPERCHAT, "spend": fb.C_SPEND, "goal": fb.C_GOAL}


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら通った。1 なら入力が足りない
    """
    a = args()
    kind = str(a.get("kind") or "")
    if kind not in KINDS:
        log.error("kind は %s のどれか。もらったのは %r", "/".join(KINDS), kind)
        return 1
    col = KINDS[kind]
    apply = bool(a.get("apply", False))
    client = db()

    # ---- 消す ----
    if a.get("remove"):
        doc = str(a.get("doc") or "")
        if not doc:
            log.error("消すには doc（書類ID）が要ります")
            return 1
        snap = client.collection(col).document(doc).get()
        if not snap.exists:
            log.error("%s/%s がありません", col, doc)
            return 1
        log.info("消すもの: %s/%s（%s円）", col, doc, (snap.to_dict() or {}).get("yen"))
        if not apply:
            log.info("見るだけで終わりました。消すには {\"apply\": true}")
            return 0
        client.collection(col).document(doc).delete()
        log.info("消しました")
        return 0

    # ---- 足す ----
    if kind == "superchat":
        day = str(a.get("day") or "")
        yen = int(a.get("yen") or 0)
        who = str(a.get("who") or "")
        if not day or yen <= 0:
            log.error("day と yen が要ります")
            return 1
        doc = fb.manual_id(day, yen, who)
        # `at` は日の始まりに置く。何時のスパチャかは分からないことが多く、
        # 分からないものに嘘の時刻を入れると、あとで並べたときに騙される
        data = {
            "yen": yen,
            "at": f"{day}T00:00:00+09:00",
            "day": day,
            "who": who,
            "currency": "円",
            "src": "manual",
            # あとで BigQuery から同じものが出てきたときに、二重にしない札
            "claim": fb.claim_key(day, yen),
            "claimedBy": None,
        }
    elif kind == "spend":
        day = str(a.get("day") or "")
        title = str(a.get("title") or "")
        yen = int(a.get("yen") or 0)
        if not day or not title or yen <= 0:
            log.error("day と title と yen が要ります")
            return 1
        doc = fb.spend_id(day, title, yen)
        data = {"day": day, "title": title, "yen": yen}
    else:
        frm = str(a.get("from") or "")
        if not frm:
            log.error("from（開始日）が要ります。書類IDになります")
            return 1
        doc = frm
        data = {"from": frm}
        # 閉じるだけのときは、ラベルも額も送らなくてよい（merge するので消えない）
        if "to" in a:
            data["to"] = a["to"] or None
        if a.get("label"):
            data["label"] = str(a["label"])
        if a.get("yen"):
            data["yen"] = int(a["yen"])

    # **中身はログに出さない。** 名前も題も、公開のログに残す理由が無い
    before = client.collection(col).document(doc).get()
    log.info(
        "%s に %s（%s）: 書類ID %s / %s円",
        col,
        "上書き" if before.exists else "新しく1件",
        kind,
        doc,
        data.get("yen", "—"),
    )
    if before.exists:
        log.info("**既にある書類です。上書きなので件数も合計も増えません**")

    if not apply:
        log.info("見るだけで終わりました。書くには {\"apply\": true}")
        return 0

    client.collection(col).document(doc).set(data, merge=True)
    log.info("書きました。合計は fund_sync（または毎晩の掃除）が焼き直します")
    return 0


sys.exit(main())
