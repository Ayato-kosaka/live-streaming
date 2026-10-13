"""**タップ数の見張りが、ちゃんと落ちられるか**を見る。

    python3 python/monthly_taps_selftest.py
    # 0=通った / 1=見張りが鳴るべきところで鳴らない / 2=数えるものが無い

## なぜ対照から見るのか（`docs/island-standards.md` §15）

タップ数は**人が渡す**ので、渡し忘れが必ず起きる。その受け皿が
ここだが、**見張りそのものが鳴らなくなっていたら
何も守っていない。** 本物の台帳を見る前に、偽の台帳をこしらえて
「足りなければ 1、揃っていれば 0」が出ることを確かめる。

揃っている本番の台帳だけを見ていると、**どんな壊れ方をしても 0 が出る**
見張りと区別がつかない。

## 見るもの

| 偽の台帳 | 出てほしい |
| --- | --- |
| ぜんぶ揃っている | 足りない 0件 |
| 1ヶ月ぶん欠けている | その月だけ 1件 |
| 欄はあるが `taps` が無い | その月だけ 1件（**「0」と「無い」は別**） |
| `taps` が数ではない / 負の数 | 壊れとして拾う |
| 月末配信の無い月が台帳にある | 余りとして拾う |

対照が1つでも外れたら、本物の台帳は1行も見ずに 2 で帰る。
"""

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_monthly import periods  # noqa: E402
from monthly_taps import bad, load, missing, save  # noqa: E402

KEYS = ["2026-01", "2026-02", "2026-03"]


def drill() -> list:
    """偽の台帳で、数えるほうが正しく数えるかを見る。

    Returns:
        外れたことの一覧（空なら通った）
    """
    bads = []

    full = {k: {"taps": 1000} for k in KEYS}
    if missing(KEYS, full) != []:
        bads.append("揃っているのに足りないと言った")

    gone = {k: v for k, v in full.items() if k != "2026-02"}
    if missing(KEYS, gone) != ["2026-02"]:
        bads.append("欠けている月を拾えない")

    # **「0」と「渡っていない」は別。** 0 タップの月は 0 と書いてあるべき
    none = dict(full, **{"2026-03": {"src": "hand"}})
    if missing(KEYS, none) != ["2026-03"]:
        bads.append("taps の欄が無い月を拾えない")
    zero = dict(full, **{"2026-03": {"taps": 0}})
    if missing(KEYS, zero) != []:
        bads.append("0 タップを「渡っていない」と読んだ")

    if [k for k, _ in bad(dict(full, **{"2026-01": {"taps": "52874"}}))] != ["2026-01"]:
        bads.append("数でない taps を拾えない")
    if [k for k, _ in bad(dict(full, **{"2026-01": {"taps": -1}}))] != ["2026-01"]:
        bads.append("負の taps を拾えない")
    if bad(full) != []:
        bads.append("まともな台帳を壊れていると言った")

    # 読み書きがひと回りするか。**書いて読んで同じ**でないと、
    # 取る道具が書き戻した値が次に消える
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "t.json"
        p.write_text(json.dumps({"_": "のこる", "months": {}}), encoding="utf-8")
        save({"2026-01": {"taps": 7}}, p)
        back = json.loads(p.read_text(encoding="utf-8"))
        if back.get("_") != "のこる":
            bads.append("書き戻しで説明の行が消える")
        if load(p) != {"2026-01": {"taps": 7}}:
            bads.append("書いた値が読み戻せない")
    return bads


def main() -> int:
    bads = drill()
    if bads:
        for b in bads:
            print("NG 対照: %s" % b)
        return 2
    print("対照 OK")

    keys = [p["key"] for p in periods()]
    if not keys:
        print("NG 数える月が1つもありません")
        return 2
    months = load()
    gone = missing(keys, months)
    broken = bad(months)
    extra = sorted(set(months) - set(keys))
    for k in gone:
        print("NG %s のタップ数が渡っていません" % k)
    for k, why in broken:
        print("NG %s のタップ数が読めません（%s）" % (k, why))
    for k in extra:
        print("NG %s は月末配信の無い月なのに台帳にあります" % k)
    print("タップ数 %d / %d ヶ月" % (len(keys) - len(gone), len(keys)))
    return 1 if (gone or broken or extra) else 0


if __name__ == "__main__":
    sys.exit(main())
