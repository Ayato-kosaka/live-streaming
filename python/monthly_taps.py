"""タップ数の台帳を読む・書く・足りない月を数える。**ここが1か所。**

タップ数は「その月の月末配信アーカイブのリアクション数」（あやと 2026-10-13、#809）。
配信が分割されていたら**合算**する。

## 置き場は `python/data/monthly_taps.json`

**焼き込み（`site/content/months.ts`）に直接書かない。**

- 取る道具（`tools/youtube_taps.py`）が書き戻す先が画面のファイルになると、
  人の書いた字と機械の書いた値が同じファイルで混ざる。
  焼き込みは**作り直せるもの**で、台帳は**作り直せないもの**（取り元が
  YouTube Studio の画面で、過去にさかのぼって自動では取れない月がある）
- 台帳を先に置いておけば、面を焼き直しても値は消えない

## 渡っていない月は、必ず鳴る

手で渡す形が残るかぎり、渡し忘れは起きる。`monthly_taps_selftest.py` が
「月末配信のある月なのに台帳に無い」を数えて、1本でもあれば 1 で落ちる。
**見張りを2本に分けない**——同じことを数える道具が2つあると、
片方だけ CI に繋がって、もう片方が黙って腐る。

## ただし、**これから来る配信には鳴らない**

期間の表は、月末配信の日が決まった時点で先に増える（`build_monthly.FINALS`）。
タップ数はその配信のアーカイブから取るので、**配信が終わるまで存在しない。**
「渡し忘れ」と「まだ来ていない」を混ぜると、日取りを決めた途端に赤くなって、
**1か月ずっと赤い見張り**になる。赤が常態になった見張りは誰も読まない。
分けているのは `due()`。
"""

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "python" / "data" / "monthly_taps.json"

# あやと「毎月5万目指してる」（2026-10-13、#809）
GOAL = 50000

JST = timezone(timedelta(hours=9))

# 月末配信の日から、タップ数を催促しはじめるまでの猶予（日）。
# タップ数はアーカイブが出てリアクションが付いてからでないと取れないので、
# **配信の当日には鳴らさない。** 3日にしてあるのは、
# 配信の晩（0日）・翌朝（1日）には数えきれず、2日では週末に当たると
# 人が YouTube Studio を見に行けない回が出るから。
# 渡し忘れは、遅くとも配信の3日後には鳴る。
GRACE_DAYS = 3


def load(path: Path = LEDGER) -> dict:
    """台帳を読む。無ければ空。

    Args:
        path: 台帳の場所

    Returns:
        `{"2026-01": {"taps": 52874, ...}, …}`
    """
    if not path.exists():
        return {}
    d = json.loads(path.read_text(encoding="utf-8"))
    v = d.get("months")
    return v if isinstance(v, dict) else {}


def save(months: dict, path: Path = LEDGER) -> None:
    """台帳を書き戻す。**説明の行（`_`）は残す。**

    Args:
        months: `{"2026-01": {"taps": …}}`
        path: 台帳の場所
    """
    head = {}
    if path.exists():
        head = json.loads(path.read_text(encoding="utf-8"))
    head["months"] = dict(sorted(months.items()))
    path.write_text(json.dumps(head, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def missing(keys, months: dict) -> list:
    """台帳に渡っていない月を並べる。

    **「0」と「渡っていない」を混ぜない。** 0 タップの月があったら
    それは 0 と書いてあるべきで、欄が無いのとは別のこと。

    Args:
        keys: あるはずの月（`["2026-01", …]`）
        months: `load()` の返り

    Returns:
        足りない月（古い順）
    """
    out = []
    for k in keys:
        v = months.get(k)
        if not isinstance(v, dict) or v.get("taps") is None:
            out.append(k)
    return sorted(out)


def bad(months: dict) -> list:
    """数として読めない欄を並べる。

    Args:
        months: `load()` の返り

    Returns:
        `(月, なぜ)` の並び
    """
    out = []
    for k in sorted(months):
        v = months[k]
        if not isinstance(v, dict):
            out.append((k, "辞書ではない"))
            continue
        t = v.get("taps")
        if t is None:
            continue
        if not isinstance(t, int) or isinstance(t, bool):
            out.append((k, "整数ではない"))
        elif t < 0:
            out.append((k, "負の数"))
    return out


def jst_today(now: datetime = None) -> date:
    """いまの JST の日付。

    **箱の時計の地方時を見ない。** UTC で持ってから JST に寄せる
    （`python/fund_box.py` と同じ `JST`）。配信は日本時間なので、
    UTC のまま「もう過ぎたか」を判定すると、**日本の 10/31 の夜に
    配信があった翌朝、UTC ではまだ 10/31** という窓ができる。

    Args:
        now: いまの時刻（tz 付き）。省略すると UTC の現在時刻

    Returns:
        JST の日付
    """
    n = now or datetime.now(timezone.utc)
    return n.astimezone(JST).date()


def due(periods: list, today: date) -> tuple:
    """タップ数が**もう在るはずの月**と、**まだ配信が来ていない月**に分ける。

    タップ数は月末配信アーカイブのリアクション数なので、
    **配信が終わるまでこの世に無い。** 期間の表（`build_monthly.periods()`）は
    配信の日が決まった時点で先に増えるから、そのままでは
    「これから来る月が渡っていません」と鳴る。

    催促しはじめるのは**月末配信の日から `GRACE_DAYS` 日後**。
    0日だと配信の夜に赤くなる（アーカイブが出てリアクションが付くのが先）。

    Args:
        periods: `{"key", "final"}` を持つ並び（`build_monthly.periods()` の返り）
        today: JST の今日（`jst_today()`）

    Returns:
        `(もう在るはずの月, まだ配信が来ていない月)`。どちらも古い順
    """
    ready, waiting = [], []
    for p in periods:
        y, m, d = (int(x) for x in p["final"].split("-"))
        (ready if today >= date(y, m, d) + timedelta(days=GRACE_DAYS)
         else waiting).append(p["key"])
    return sorted(ready), sorted(waiting)
