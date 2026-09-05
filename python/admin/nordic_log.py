"""北欧旅の「その日に起きたこと」を、外から読む・書く・消す。

ふだんはあやとが**その日のページの中から**書く
（`site/components/nordic/DayLog.tsx`）。旅の途中でスマホから打てる形は
あちらで、ここは**そちらが使えないときの逃げ道**。

  - ログインが通らない（トークンが切れた・電波が細い）
  - 打ち間違いを、あとから Claude Code に直してもらう
  - **旅が終わったあと、Git へ焼き戻すために全部を吐き出す**

「管理スクリプトを実行」（`.github/workflows/run_admin_script.yml`）から
`script: nordic_log` で呼ぶ。入力はほかの管理スクリプトと同じ ARGS。

ARGS 例:
  {}                                        いま入っているものを全部出す
  {"day": "day-3", "body": "2台目で停まってくれた。", "date": "2026-09-14"}
  {"day": "day-3", "video": "dQw4w9WgXcQ"}  その日の配信だけ足す
  {"day": "day-3", "op": "remove"}          その日ぶんを消す
  {"op": "export"}                          Git に貼る形（TypeScript）で出す

`day` は旅程表の行の id（`site/content/nordic.ts` の `DAYS`）。
`day-depart` `day-1` … `day-7`。**区間の id ではない。**

## 旅が終わったら

`{"op":"export"}` の出したものを `site/content/nordic.ts` の
`NORDIC_LOG` に貼って、静的に配る。読み返されるのは旅のあとのほうが
長いので、そのころには API に頼らないほうがいい
（`docs/nordic-depart.md`「旅が終わったあと」）。
"""

import json

from _fs import args, db, log, need, show

COL = "nordicLog"
MAX_BODY = 400


def dump(rows: list[tuple[str, dict]]) -> None:
    """Git に貼る形で出す。`site/content/nordic.ts` の NORDIC_LOG がこの形。"""
    print("export const NORDIC_LOG: Record<string, DayLog> = {")
    for day, v in rows:
        print(f"  {json.dumps(day, ensure_ascii=False)}: {{")
        if v.get("date"):
            print(f"    date: {json.dumps(v['date'], ensure_ascii=False)},")
        print(f"    body: {json.dumps(v.get('body', ''), ensure_ascii=False)},")
        if v.get("video"):
            print(f"    video: {json.dumps(v['video'], ensure_ascii=False)},")
        print("  },")
    print("};")


def main() -> None:
    """エントリポイント。"""
    a = args()
    col = db().collection(COL)
    op = a.get("op") or ""

    # 書く先を指定していなければ、いま入っているものを出すだけ
    if not a.get("day"):
        rows = sorted(
            ((d.id, d.to_dict() or {}) for d in col.stream()),
            key=lambda r: r[1].get("at", 0),
        )
        if op == "export":
            dump(rows)
            return
        log.info("%s: %d日ぶん", COL, len(rows))
        for day, v in rows:
            log.info("  %s %s", day, show(v))
        return

    (day,) = need(a, "day")
    if not str(day).startswith("day-"):
        log.error("day は旅程表の行の id です（day-depart / day-1 …）: %s", day)
        raise SystemExit(1)
    ref = col.document(str(day))

    if op == "remove":
        ref.delete()
        log.info("%s/%s を消しました", COL, day)
        return

    patch: dict = {}
    if a.get("body"):
        # 画面から書くときと同じ長さで切る（functions の MAX_LOG_BODY）
        patch["body"] = str(a["body"])[:MAX_BODY]
    if a.get("date"):
        patch["date"] = str(a["date"])
    if "video" in a:
        patch["video"] = str(a["video"]) or None
    if not patch:
        cur = ref.get()
        log.info("%s/%s: %s", COL, day, show(cur.to_dict() or {}))
        return

    # 並び順は書いた時刻で決まる（islandApi の GET /nordic/log）。
    # 直しただけで順番が変わらないよう、初めて書くときだけ入れる。
    if not ref.get().exists:
        import time

        patch["at"] = int(time.time() * 1000)
    ref.set(patch, merge=True)
    log.info("%s/%s: %s", COL, day, show(ref.get().to_dict() or {}))


main()
