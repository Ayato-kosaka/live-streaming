"""紐付け待ちの行に、候補がほんとうに出るかを**本番で1回確かめる**（#299 とは別件）。

ARGS: なし（`{}`）

## なぜ要るか

`GET /island-api/donors` の候補（`hints`）は、辞書（`islandChannels`）を
**前方一致の範囲**で引いている。同じ1つのフィールドの範囲なので複合索引は
要らない——というのが設計の前提だが、**それを本番で確かめていない。**

引けなかったときは `logger.warn` を出して `hints: []` に落ちる作りなので、
**索引で落ちていても画面は静かに「候補なし」になるだけ。**
黙って何も出ない状態と、候補が本当に0件の状態が、見分けられない。

しかも `/donors` は**あやとだけが読める口**で、あやとは 9/27 までつながらない。
壊れていたら旅から帰るまで誰も気づかない（`fund_history_probe.py` と同じ理由）。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
`islandDonors` は **どねID と YouTube のアカウントの対応表**で、
投げ銭してくれた人が誰かを指している。#289 と同じ性質のもの。

だから出すのは**件数と、状態の内訳と、候補が何件返ったかだけ。**
どねID も、呼び名も、チャンネルIDも、候補の名前も出さない。

    script: donor_hints_probe
    args:   {}
"""

from _fs import args, db, log  # noqa: F401
from _owner import call, owner_token


def main() -> None:
    args()
    client = db()
    token = owner_token(client)

    got = call("GET", "/donors", token)
    rows = got.get("donors")
    if not isinstance(rows, list):
        # **返る欄を推測しない**（island-misses #72 でこれをやった）
        log.error("donors が配列で返っていません。返った欄: %s", sorted(got))
        raise SystemExit(1)

    by_state: dict[str, int] = {}
    for r in rows:
        s = str(r.get("state"))
        by_state[s] = by_state.get(s, 0) + 1
    log.info("対応表: %d行  内訳: %s", len(rows), by_state)

    waiting = [r for r in rows if r.get("state") == "new"]
    if not waiting:
        log.info("紐付け待ちが1行もありません。候補の出番はいま無い状態です")
        return

    # **`hints` という欄が在るかどうかから見る。** 口が古いままなら欄ごと無い
    missing = [r for r in waiting if "hints" not in r]
    if missing:
        log.error("紐付け待ち %d行のうち %d行に hints の欄がありません。",
                  len(waiting), len(missing))
        log.error("Functions が古いままです（デプロイを確かめてください）。")
        raise SystemExit(1)

    empty = 0
    for r in waiting:
        n = len(r.get("hints") or [])
        log.info("  紐付け待ちの1行 → 候補 %d件", n)
        if n == 0:
            empty += 1

    if empty == len(waiting):
        # **「0件」と「引けなかった」は違う。** ここでは区別できないので、
        # そう言って落ちる。Functions のログに `donor hints failed` が
        # 出ていれば索引で落ちている（`functions_log.py`）
        log.error("")
        log.error("紐付け待ち %d行すべてで候補が0件でした。", len(waiting))
        log.error("**本当に近い名前の人が居ない**のか、**辞書が引けていない**のか、")
        log.error("ここでは分かりません。Functions のログに")
        log.error("`donor hints failed` が出ていないか見てください。")
        raise SystemExit(1)

    log.info("")
    log.info("候補は返っています。前方一致は本番で通りました（索引は要りませんでした）")


main()
