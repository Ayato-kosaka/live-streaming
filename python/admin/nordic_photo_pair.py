"""**旧 `nordicPhotos` に在って、新 `islandStreamEventImage` に無い写真**を数える。読むだけ。

ARGS 例:
  {}                … 数えて出す（既定）

終了コード **0=新が旧を覆っている（またはもう旧が空）/ 1=旧にしか無い写真がある /
2=数えられない**（`docs/island-standards.md` §15）。

## なぜ要るか

旅の写真は長いあいだ**2つの入れ物に同じ書類IDで書かれて**いた。
`island-db.md` の責務の表は 2026-10-01 から「**新が正**」と書いていたのに、
**公開の面に出ていたのは旧のほう**（`GET /nordic/photos` が
`nordicPhotos` を読み、カードの壁がその口を土台にしていた）。
宣言と実物が逆だった。

2026-10-13 に**読みも書きも新に寄せた。** 寄せたことで出る危なさは1つだけ:

> **旧にしか無い写真があったら、その日から画面から消える。**

書くほうは `Promise.all` で、**まとめ書きでも取引でもなかった。**
片方だけ失敗した回があれば、そこでずれている。そして**ずれても赤くなる
ものが1本も無かった**ので、「いままで1度もずれていない」と言える材料が無い。

だからここで数える。**向きは1つだけ**——旧 ⊆ 新。

- **旧にしか無い** … 画面から消える。**赤**
- **新にしか無い** … ふつう（2026-10-13 より後に貼った写真は全部こちら）。緑

## 旧が空になったら

このまま 0 を返し続ける。**そのときは入れ物ごと落としてよい**（`collection_drop`）。
落としたあとも、ここは「旧が0件」で緑のまま——**消えたことを赤にしない。**
消したいから消したのに赤くなる見張りは、満たしようがない（§13）。

## 出すもの

**数だけ。** 書類ID・置き場の道・一言・貼った人は1文字も出さない。
旧にしか無いものが在ったら、**何件かと、いちばん古い日と新しい日**まで。
日は写真の `day`（旅程の日付）で、人を指さない。
"""

from _fs import args, db, log


def notice(msg: str) -> None:
    """Actions の注記に1行出す。**数だけ。** ログにも同じものを出す。"""
    log.info("%s", msg)
    print(f"::notice::{msg}", flush=True)


def main() -> int:
    args()
    client = db()

    # **書類IDだけ引く。** 中身は要らないので `select([])` で数える。
    # 日は赤いときだけ要るので、そのときにもう一度引く（ふつうは引かない）。
    old_ids = {d.id for d in client.collection("nordicPhotos").select([]).stream()}
    new_ids = {d.id for d in
               client.collection("islandStreamEventImage").select([]).stream()}

    only_old = old_ids - new_ids
    only_new = new_ids - old_ids

    notice(
        f"旅の写真: 旧 nordicPhotos {len(old_ids)}件 / "
        f"新 islandStreamEventImage {len(new_ids)}件 / "
        f"旧にしか無い {len(only_old)}件 / 新にしか無い {len(only_new)}件"
    )

    if not old_ids and not new_ids:
        # **両方0は「数えるものが無い」。** 0対0を「揃っている」と言わない
        log.error("どちらも0件。**数えられていない**（引けていない可能性がある）")
        return 2

    if not old_ids:
        notice("旧はもう空。入れ物ごと落としてよい（落としてもここは緑のまま）")
        return 0

    if not only_old:
        notice("新が旧を覆っている。**画面から消える写真は無い**")
        return 0

    # 赤いときだけ、日の幅を出す（人を指さない値）
    days = []
    for i in sorted(only_old):
        v = client.collection("nordicPhotos").document(i).get().to_dict() or {}
        d = v.get("day")
        if isinstance(d, str):
            days.append(d)
    span = f"{min(days)}〜{max(days)}" if days else "日の分からないもの"
    log.error("")
    log.error("**旧にしか無い写真が %d件（%s）。**", len(only_old), span)
    log.error("このまま新だけを読むと、その写真は画面から消える。")
    log.error("どれかは出さない。手で引くなら `firestore_read` で book を見る")
    return 1


raise SystemExit(main())
