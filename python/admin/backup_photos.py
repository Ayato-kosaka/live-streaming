"""旅の写真と住人の絵の実体だけを、退避する／戻せるか確かめる。

**なぜ `backup_now.py` に足さず、1本分けたか。**
あちらは退避を丸ごと1回まわす（Firestore 全部＋BigQuery 4表＋突き合わせ）。
1回で **BigQuery を 490MB 読む。** 実体は1回に 128MB までで区切ってあって、
溜まっている 340MB（そのうち 337MB が住人の絵）を流し切るには
何回か続けて押すことになる。
そのたびに 490MB を読み直すのは、**取る必要のないものの代金**。
外へ HTTP を叩くのも、上限を押し上げたいのもここだけなので、口を分ける。

ARGS 例:
  {}                                … 下見。**1バイトも書かない**
                                       （何件あって、何件取ってあって、何件残りか）
  {"apply": true}                   … 上限（既定 128MB / 400件）ぶん取る
  {"apply": true, "budget_mb": 400} … 上限を押し上げて取る（溜まったぶんを流すとき）
  {"verify": true}                  … 置き場から1枚戻して、バイト列が一致するか見る
  {"selftest": true}                … 偽の置き場で振る舞いを動かす（外に1バイトも出ない）

**既定は書かない。** 外の口を叩くものなので、何件取りにいくのかを先に出す。

**`_fs` を通さない。** あちらは import した時点で logging.basicConfig を張るので、
backup 側のログと二重に出る（`backup_now.py` の頭に同じことが書いてある）。
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backup import photos, restore, sink  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
log = photos.log


def main() -> None:
    a = json.loads(os.getenv("ARGS") or "{}")

    if a.get("selftest"):
        # **本番にも置き場にも触らない。** 偽の HTTP と偽の置き場で回す
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "backup", "photos_selftest.py")],
            cwd=ROOT,
        )
        raise SystemExit(r.returncode)

    c = sink.client()

    if a.get("verify"):
        # 置き場から読むだけ。**Firestore も Storage も触らない**
        raise SystemExit(
            restore.restore_photo(photos.read_row_bq(c), a.get("path"), None)
        )

    kw = {}
    if a.get("budget_mb"):
        kw["budget_bytes"] = int(a["budget_mb"]) * 1024 * 1024
    if a.get("max"):
        kw["budget_count"] = int(a["max"])

    apply_ = bool(a.get("apply", False))
    log.info("%s（上限 %d MB / %d 件）",
             "取ります" if apply_ else "下見です。1バイトも書きません",
             kw.get("budget_bytes", photos.BUDGET_BYTES) // (1024 * 1024),
             kw.get("budget_count", photos.BUDGET_COUNT))
    r = photos.dump(c, not apply_, **kw)
    if not r.get("ok"):
        raise SystemExit(1)
    # **出すのは数だけ。** 名前も URL も出さない
    log.info("実体 %s 件（旅の写真 %s・住人の絵 %s）/ 取ってある %s 件 /"
             " この回に取った %s 件 / 残り %s 件 / 落ちた %s 件",
             r.get("n_all"), r.get("n_photo"), r.get("n_char"),
             r.get("have"), r.get("n"), r.get("left"), r.get("failed", 0))
    if r.get("broken"):
        # **片方の索引が引けなかった回。** 取れたぶんは入っているが、
        # 「全部取れた」と読まれないように、ここでも言う
        log.warning("索引を引けなかったものがあります（この回は取っていません）")
    if r.get("left"):
        log.info("**まだ残っています。** もう一度押すか、毎晩の退避が続きから拾います")


main()
