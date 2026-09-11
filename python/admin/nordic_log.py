"""北欧旅の「その日に起きたこと」を、外から読む・書く・消す。

ふだんは、あやとがその日あったことを一言おくって、それを整えてここから入れる。
**画面から書く欄は無い**（2026-09-10 に外した。`docs/nordic-depart.md` 2章）。
旅が終わったあと、Git へ焼き戻すために全部を吐き出すのもここ。

「管理スクリプトを実行」（`.github/workflows/run_admin_script.yml`）から
`script: nordic_log` で呼ぶ。入力はほかの管理スクリプトと同じ ARGS。

ARGS 例:
  {}                                        いま入っているものを全部出す
  {"day": "day-3", "body": "2台目で停まってくれた。", "date": "2026-09-14"}
  {"day": "day-3", "video": "dQw4w9WgXcQ"}  その日の配信だけ足す
  {"day": "day-3", "op": "remove"}          その日ぶんを消す
  {"op": "export"}                          Git に貼る形（TypeScript）で出す

`day` は旅程表の行の id（`site/content/nordic.ts` の `DAYS`）。
**区間の id ではない。** 使えるのはこの17個だけ。

    day-depart  9/11  クタイシを発つ
    day-1 … day-9     9/12 〜 9/20（ポーランド → ストックホルム）
    day-10 … day-16   9/21 〜 9/27（ストックホルムの7泊）

**day-10 以降は 2026-09-11 に足した。** それまでは7泊ぶんが `day-stay` と
いう1行にまとまっていて、あの行には面が無かった。**そこに書いても、
旅程表に印が付くだけで本文はどこにも出なかった。** 9/21 以降のぶんを
`day-9` に入れると、9/20 に書いたものが消える（1つの行に1件しか持てない）。
日付ぶんの id へそれぞれ入れること。

無い id を渡すと、書けてしまうが**どの面にも出ない。** 上の表に無いものは
使わない。

## 旅が終わったら

`{"op":"export"}` の出したものを `site/content/nordic.ts` の
`NORDIC_LOG` に貼って、静的に配る。読み返されるのは旅のあとのほうが
長いので、そのころには API に頼らないほうがいい
（`docs/nordic-depart.md`「旅が終わったあと」）。
"""

import json

from _fs import args, db, log, need, show

#: 面のある日。**`site/content/nordic.ts` の `DAY_PAGES` と同じ並び。**
#:
#: ここに無い id にも書けてしまうが、**書いてもどの面にも出ない。**
#: 旅程表の行に印が付くだけで、本文を出す面が無い。旅の途中に
#: 「入れたのに出ない」を追いかける羽目になるので、先に断る。
#:
#: 手で並べてあるのは、`nordic.ts` から正規表現で拾うと、書き方が少し
#: 変わっただけで黙って減るため（2026-09-10 に `countries.ts` で実際に
#: ジョージアが丸ごと落ちかけた）。**減ったことに気づけない拾い方をしない。**
#: 日を足したら、あちらとここの両方を直す。
DAY_IDS = (
    "day-depart",
    *(f"day-{n}" for n in range(1, 17)),
)

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
    if str(day) not in DAY_IDS:
        log.error(
            "その id の面はありません: %s\n"
            "  使えるのは: %s\n"
            "  9/21〜9/27（ストックホルムの7泊）は day-10 〜 day-16 です。\n"
            "  **day-9 に入れ直さないこと。** 1つの行に1件しか持てないので、\n"
            "  9/20 に書いたものが消えます。",
            day,
            " ".join(DAY_IDS),
        )
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
