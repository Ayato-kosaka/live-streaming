"""提案のことばを、**手で直したものに差し替える**（#716）。

    python python/admin/stamp_line_arrange.py

## なぜ、これが要るのか

あやとの言葉（2026-10-09）:

> **その人いいそう！！！ってならば良いから少しアレンジしてもいいよ。**

機械（`python/stamp_line_pick.py` の `tidy()`）が触ってよいのは**末尾の
句読点だけ**。「長い実況を、その人の言い方のまま短くする」「配信の中でしか
意味のない部分だけ削って残りを生かす」は、**その人いいそうか**で決まるので
機械には決められない。**人が決めて、ここから入れる。**

**こちらの言葉に置き換えたら負け。** 丁寧語の人を砕けさせない、関西弁を
標準語にしない、絵文字の癖も含めて考える。**無理に直さない**——そのままで
使えるものはそのまま（全部に手を入れたら、それはあやと島の言葉であって
その人の言葉ではない）。

## 元の字を必ず一緒に渡す

`{"text": 出す字, "from": 元の字}` の組で渡す。**元の字が無いものは置かない。**

元の字を落とすと、表で「直したもの」と「直していないもの」が見分けられず、
あやとが「それは言わない」と言えなくなる（あやと「元の字と、直した字の
両方を表に出す」）。`suggestedFrom` に入るのがその元の字。

## 字をどうやって渡すか

**ARGS には取らない。** ARGS は実行ステップの env として**公開のログに出る**。
ことばは本人のコメントから取った字なので、並べれば「誰が何を言っているか」。

渡すのは **`repository_dispatch` の `client_payload`**（`stamp_line_seed` と
同じ道）。出来事の中身（`$GITHUB_EVENT_PATH`）はジョブの中からしか読めない。
**そのうえで**ワークフローの頭で1件ずつ `::add-mask::` に入れてある。

**このスクリプトは、ことばも書類IDも1文字も出さない。** 出すのは件数と、
`logsafe.mask()` の指紋だけ。

## 本人が決めたことばは、絶対に触らない

触るのは `suggested` と `suggestedFrom` と `suggestedAt` の3つだけ。
`lines` は人の字なので、消したら戻らない。

入力（`client_payload`。`apply` だけは ARGS でもよい）:
  {"fix": [{"id": "<図鑑の書類ID>",
            "lines": [{"text": "出す字", "from": "元の字"}, …]}]}
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, notice, readonly  # noqa: E402

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402
from stamp_line_pick import clean, usable  # noqa: E402

# 図鑑の書類IDの形。**`stamp_line_seed` と同じ**（打ち間違いを落とす）
DOC_ID = re.compile(r"^[A-Za-z0-9_-]{6,120}$")

# 1人ぶんの本数。**画面は3つ並べる**（390px 幅に畳まずに置ける数。#716）。
# ここを増やすと、押しどころ 48px を取ったときに縦に積む
MAX_LINES = 3

# 一度に直せる人数の上限。**暴走を止める栓**で、人数を絞る値ではない
MAX_PEOPLE = 50


def payload() -> dict:
    """入力。**ことばは公開ログに出る ARGS からは取らない。**

    Returns:
        入力の辞書
    """
    ev = os.getenv("GITHUB_EVENT_PATH") or ""
    if ev and os.path.exists(ev):
        try:
            with open(ev, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            # **読めなかったら止める。** 空に落とすと「渡っていない」と
            # 同じ顔になって、0件が成功に見える
            log.error("出来事の中身が読めません: %s", e)
            sys.exit(2)
        for k in ("client_payload", "inputs"):
            v = d.get(k)
            if isinstance(v, dict) and v:
                return v
    return args()


def shape(v) -> tuple[list, dict]:
    """渡されたものを、置いてよい形にする。

    **値そのものは返り値にしか出さない。** ここでログに出すと、
    形が変だった字が公開のログに出る。

    Args:
        v: 渡されたもの（`fix`）

    Returns:
        (`[(書類ID, [(出す字, 元の字), …])]`, 落とした理由の数え上げ)
    """
    bad = {"形": 0, "長さ": 0, "元の字なし": 0, "本数": 0, "空": 0}
    if not isinstance(v, list):
        return [], bad
    out = []
    for one in v[:MAX_PEOPLE]:
        if not isinstance(one, dict):
            bad["形"] += 1
            continue
        doc_id = one.get("id")
        doc_id = doc_id.strip() if isinstance(doc_id, str) else ""
        if not doc_id or not DOC_ID.match(doc_id):
            bad["形"] += 1
            continue
        got = []
        for ln in (one.get("lines") or []):
            if not isinstance(ln, dict):
                bad["形"] += 1
                continue
            text = clean(ln.get("text") if isinstance(ln.get("text"), str)
                         else "")
            src = (ln.get("from") or "").strip() \
                if isinstance(ln.get("from"), str) else ""
            if not text:
                bad["空"] += 1
                continue
            if not usable(text):
                # **口（`stampLine.ts`）が切る長さと同じ線で落とす。**
                # ここを通すと、画面で切れた字が提案として出る
                bad["長さ"] += 1
                continue
            if not src:
                # **元の字が無いものは置かない。** 置くと、直したのか
                # そのままなのかが表で見分けられなくなる
                bad["元の字なし"] += 1
                continue
            if any(text == t for t, _ in got):
                bad["空"] += 1
                continue
            got.append((text, src))
        if not got:
            bad["本数"] += 1
            continue
        if len(got) > MAX_LINES:
            bad["本数"] += len(got) - MAX_LINES
            got = got[:MAX_LINES]
        out.append((doc_id, got))
    if isinstance(v, list) and len(v) > MAX_PEOPLE:
        bad["本数"] += len(v) - MAX_PEOPLE
    return out, bad


def plan(client, fix: list) -> tuple[list, list]:
    """1件ずつ、何をするかを決める。**読むだけ。**

    Args:
        client: Firestore クライアント
        fix: `shape()` の結果

    Returns:
        (置けるもの `[(書類ID, [(出す字, 元の字)])]`, 入れ物に居ない書類ID)
    """
    lines = client.collection("islandStampLine")
    ok, missing = [], []
    for doc_id, got in fix:
        # **入れ物に無い人には置かない。** 打ち間違いで知らない書類を
        # 作ると、その人は画面から自分のぶんを引けないまま提案だけ持つ
        if not lines.document(doc_id).get().exists:
            missing.append(doc_id)
            continue
        ok.append((doc_id, got))
    return ok, missing


def write(client, rows: list, now: int) -> int:
    """書く。**`lines` には1バイトも書かない。**

    Args:
        client: Firestore クライアント
        rows: `plan()` の1つめ
        now: いまの時刻（ミリ秒）

    Returns:
        書いた件数
    """
    lines = client.collection("islandStampLine")
    n = 0
    for doc_id, got in rows:
        # **merge で置く。** まるごと置き換えると、本人が決めたことばと
        # `channelId` が消える。2つの並びは**同じ長さ・同じ順**
        lines.document(doc_id).set(
            {
                "suggested": [t for t, _ in got],
                "suggestedFrom": [s for _, s in got],
                "suggestedAt": now,
            },
            merge=True,
        )
        n += 1
    return n


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=置けるものが1件も無い / 2=入力が足りない
    """
    a = payload()
    # `apply` だけは ARGS から拾ってもよい（真偽値なので素性を持たない）
    apply = bool(a.get("apply") or args().get("apply"))
    fix, bad = shape(a.get("fix"))
    dropped = " / ".join(f"{k} {v}" for k, v in bad.items() if v)
    if not fix:
        log.error("fix がありません（形で落ちた: %s）", dropped or "0")
        return 2
    touched = sum(1 for _, got in fix for t, s in got if t != s)
    kept = sum(1 for _, got in fix for t, s in got if t == s)
    log.info("渡された: %d 人ぶん / 直した字 %d 本 / そのままの字 %d 本"
             "（形で落ちた: %s）",
             len(fix), touched, kept, dropped or "0")

    client = db()
    ok, missing = plan(readonly(client), fix)
    if missing:
        # **黙って通さない。** 打ち間違いか、種まきがまだ
        log.warning(
            "入れ物に居ない %d 件（指紋: %s）。**この人には置かない**"
            "——先に stamp_line_seed を流してください",
            len(missing), " ".join(mask(x, public=True) for x in missing))
    notice(
        f"手直し{'（下見）' if not apply else ''}: 渡された {len(fix)} 人 / "
        f"置ける {len(ok)} 人 / 入れ物に居ない {len(missing)} 人 / "
        f"直した字 {touched} 本 / そのままの字 {kept} 本")
    if not ok:
        log.error("置けるものが1件もありません")
        return 1

    if not apply:
        log.info("下見なので**1バイトも書いていません**。"
                 '書くには {"apply": true} を付けてください')
        return 0

    n = write(client, ok, _now())
    log.info("置きました: %d 人ぶん", n)
    notice(f"手直し: 置いた {n} 人ぶん")
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
