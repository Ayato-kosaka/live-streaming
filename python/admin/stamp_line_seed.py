"""LINE スタンプのことばを決めてもらう**25人を、Firestore へ移す**（#716）。

    python python/admin/stamp_line_seed.py

## なぜ「移す」なのか

25人はあやとが選んだ名簿で、いまはそれを選んだ画面の中にしか無い。
**公開のリポジトリに置けない。** 選ばれかたが「協力してくれた人」なので、
名簿が git に残った時点で**投げ銭の順位表が git に残る**
（`docs/island-money.md`「実額は視聴者には一切見せない」）。

だから置き場は Firestore（`islandStampLine`）で、`firestore.rules` で
閉じてあり、口は本人のぶんしか返さない（`docs/island-api.md` 11章）。

## 名簿をどうやって渡すか

**ARGS には取らない。** ARGS は実行ステップの env として**公開のログに出る**
（`run_admin_script.yml` にそう書いてある）。

渡すのは **`repository_dispatch` の `client_payload`**。

    gh api -X POST repos/<owner>/<repo>/dispatches \\
      -f event_type=stamp-line --input payload.json

出来事の中身（`$GITHUB_EVENT_PATH`）はジョブの中からしか読めず、どの REST の
口にも UI にも出てこない。**そのうえで**、ワークフローの頭で1件ずつ
`::add-mask::` に入れて、万一どこかで字になっても伏せ字になるようにしてある
（`.github/workflows/stamp_line.yml`）。

**このスクリプトは、名簿を1文字も出さない。** 出すのは件数と、
`logsafe.mask()` の指紋（`#a3f9`）だけ。

## 何をするか

1. 渡された図鑑の書類ID（`islandCharacter` の書類ID）を1件ずつ引く
2. **図鑑に居ない id は飛ばす。** 打ち間違いで知らない書類を作らない
3. その人の `channelId` を**写して** `islandStampLine/{同じ書類ID}` に置く
4. **すでに在る書類の `lines` と `suggested` には触らない**
   （本人がもう決めていたら、流し直しで消える）

## 既定では1バイトも書かない

`{"apply": true}` を付けたときだけ書く。下見のときは
`_fs.readonly()` を通すので、書きに行ったら例外で止まる。

入力（`client_payload`。`apply` だけは ARGS でもよい）:
  {"picks": ["<図鑑の書類ID>", …]}                 … 下見
  {"picks": [...], "apply": true}                  … 書く
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, readonly  # noqa: E402

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402

# 図鑑の書類IDの形。ドライブから移した id（33字）と、移行で作った
# 32桁の指紋の両方が本番に居る。**形で弾くのは、打ち間違いを落とすため**
DOC_ID = re.compile(r"^[A-Za-z0-9_-]{6,120}$")

# 一度に移せる人数の上限。**暴走を止める栓で、人数を絞る値ではない。**
# 25人に対して余裕を取ってある
MAX_PICKS = 200


def payload() -> dict:
    """入力。**名簿は公開ログに出る ARGS からは取らない。**

    `repository_dispatch` の `client_payload`、`workflow_dispatch` の
    `inputs` の順に見て、どちらも無ければ ARGS に落ちる（手元で回すとき）。

    Returns:
        入力の辞書
    """
    ev = os.getenv("GITHUB_EVENT_PATH") or ""
    if ev and os.path.exists(ev):
        try:
            with open(ev, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            # **読めなかったら止める。** 空の辞書に落とすと「名簿が
            # 渡っていない」と同じ顔になって、0件が成功に見える
            log.error("出来事の中身が読めません: %s", e)
            sys.exit(2)
        for k in ("client_payload", "inputs"):
            v = d.get(k)
            if isinstance(v, dict) and v:
                return v
    return args()


def shape_picks(v) -> tuple[list, int]:
    """渡された名簿を、置いてよい形にする。

    **値そのものは返り値にしか出さない。** ここでログに出すと、
    形が変だった id が公開のログに出る。

    Args:
        v: 渡されたもの

    Returns:
        (使える書類ID の一覧, 落とした件数)
    """
    if not isinstance(v, list):
        return [], 0
    out, bad = [], 0
    for x in v:
        s = x.strip() if isinstance(x, str) else ""
        if not s or not DOC_ID.match(s):
            bad += 1
            continue
        if s in out:
            bad += 1
            continue
        out.append(s)
    return out[:MAX_PICKS], bad + max(0, len(out) - MAX_PICKS)


def plan(client, picks: list) -> dict:
    """1件ずつ、何をするかを決める。**読むだけ。**

    Args:
        client: Firestore クライアント
        picks: 図鑑の書類ID の一覧

    Returns:
        `{"new": [...], "same": [...], "missing": n, "nochannel": [...]}`
    """
    chars = client.collection("islandCharacter")
    lines = client.collection("islandStampLine")
    out = {"new": [], "same": [], "missing": 0, "nochannel": []}
    for doc_id in picks:
        c = chars.document(doc_id).get()
        if not c.exists:
            # **図鑑に居ない id は飛ばす。** どの id かはログに出さない
            out["missing"] += 1
            continue
        ch = (c.to_dict() or {}).get("channelId") or ""
        ch = ch.strip() if isinstance(ch, str) else ""
        if not ch:
            # **channelId が空の人は、口から自分のぶんを引けない**
            # （`docs/island-db.md` 3.4。本番に18人いる）。
            # 書類は作るが、**見られないことを数えて出す**
            out["nochannel"].append(doc_id)
        had = lines.document(doc_id).get()
        (out["same"] if had.exists else out["new"]).append((doc_id, ch))
    return out


def write(client, rows: list, now: int) -> int:
    """書く。**`lines` と `suggested` には触らない。**

    Args:
        client: Firestore クライアント
        rows: `(書類ID, channelId)` の一覧
        now: いまの時刻（ミリ秒）

    Returns:
        書いた件数
    """
    lines = client.collection("islandStampLine")
    n = 0
    for doc_id, ch in rows:
        # **merge で置く。** まるごと置き換えると、本人が決めたことばが消える
        lines.document(doc_id).set(
            {"channelId": ch, "pickedAt": now, "seededAt": now},
            merge=True,
        )
        n += 1
    return n


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=使える id が1つも無い / 2=入力が足りない
    """
    a = payload()
    # `apply` だけは ARGS から拾ってもよい（真偽値なので素性を持たない）
    apply = bool(a.get("apply") or args().get("apply"))
    picks, bad = shape_picks(a.get("picks"))
    if not picks:
        log.error("picks がありません（形で落ちたのは %d 件）", bad)
        return 2
    log.info("渡された名簿: %d 件（形で落ちた %d 件）", len(picks), bad)

    client = db()
    p = plan(readonly(client), picks)
    log.info(
        "新しく置く %d 件 / すでに在る %d 件 / 図鑑に居ない %d 件",
        len(p["new"]), len(p["same"]), p["missing"],
    )
    if p["nochannel"]:
        # **黙って通さない。** この人たちは画面で自分のぶんを見られない
        log.warning(
            "図鑑に channelId が無い %d 件。**この人は /me で自分のぶんを"
            "見られない**（指紋: %s）",
            len(p["nochannel"]),
            # **`public=True` を渡す。** 手元で回しても指紋にする——
            # 書類IDは人が読んで意味の分かるものではないし、ここは
            # 「誰が選ばれたか」そのものなので、出す理由が1つも無い
            " ".join(mask(x, public=True) for x in p["nochannel"]),
        )
    rows = p["new"] + p["same"]
    if not rows:
        log.error("置けるものが1件もありません")
        return 1

    if not apply:
        log.info("下見なので**1バイトも書いていません**。"
                 '書くには {"apply": true} を付けてください')
        return 0

    n = write(client, rows, _now())
    log.info("置きました: %d 件", n)
    # **置いたことを数え直す。** 書いたつもりで入っていない日に気づけない
    after = len(list(client.collection("islandStampLine").list_documents()))
    log.info("入れ物にある書類: %d 件", after)
    return 0


def _now() -> int:
    """いまの時刻（ミリ秒）。口（`stampLine.ts`）と同じ単位。

    Returns:
        エポックからのミリ秒
    """
    import time

    return int(time.time() * 1000)


# **自己点検から読み込まれたときは走らない。**
if __name__ == "__main__":
    sys.exit(main())
