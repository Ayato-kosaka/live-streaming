"""タップ数が渡っていない月があったら鳴らす。

    python3 python/monthly_taps_watch.py

終了コード 0=ぜんぶ渡っている / 1=足りない月がある /
**2=数えるものが無い**（`docs/island-standards.md` §15）。

## なぜ要るか

タップ数の取り元は **YouTube Studio の画面**で、この箱からは直接届かない
（EC2 のログイン済み Chrome ごし。`/youtube-studio`）。つまり
**人か、人が押した道具が渡す形**が残る。手で渡す形が残るかぎり、
渡し忘れは必ず起きる——しかも**面は出てしまう。** タップの段が
1か月ぶん黙って消えるだけなので、見ている人にも、出した側にも分からない。

だから「あるはずの月」と「台帳にある月」を引き算して、1本でも足りなければ落とす。

## 「あるはずの月」はどこから来るか

**`python/build_monthly.py` の `FINALS`。** 月末配信の日が1行足されたら、
その月のタップは渡っているべき。焼き込み（`site/content/months.ts`）から
数えると、**焼く前に鳴らない**ので遅い。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_monthly import periods  # noqa: E402
from monthly_taps import bad, load, missing  # noqa: E402


def main() -> int:
    keys = [p["key"] for p in periods()]
    if not keys:
        print("NG 数える月が1つもありません（build_monthly.py の FINALS が空）")
        return 2
    months = load()
    if not months:
        print("NG 台帳が空です（python/data/monthly_taps.json）")
        return 1

    broken = bad(months)
    for k, why in broken:
        print("NG %s のタップ数が読めません（%s）" % (k, why))

    gone = missing(keys, months)
    for k in gone:
        print("NG %s のタップ数が渡っていません" % k)
        print("   取りかた: python3 tools/youtube_taps.py --month %s" % k)

    # 台帳にあるのに、月末配信の無い月。**こちらも鳴らす。**
    # 期間を1つ消したときに、古い値だけが残って面に出続ける
    extra = sorted(set(months) - set(keys))
    for k in extra:
        print("NG %s は月末配信の無い月なのに、台帳にタップ数があります" % k)

    n = len(gone) + len(broken) + len(extra)
    print("タップ数 %d / %d ヶ月" % (len(keys) - len(gone), len(keys)))
    if n:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
