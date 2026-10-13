"""**定時実行が、予定からどれだけ遅れて走っているかを数える。**

    python3 python/cron_lag.py                  # cron を持つワークフロー全部
    python3 python/cron_lag.py --by-month       # 月ごとに切る（悪化しているかを見る）
    python3 python/cron_lag.py --days 90        # 直近90日だけ
    python3 python/cron_lag.py --json           # 機械で読む形
    python3 python/cron_lag.py --offline run.json  # 落としてある run で回す（確かめ用）

終了コード 0=数えた / **2=数えるものが無い**（`docs/island-standards.md` §15）。
**1 は返さない。** これは判定器ではなく、数を出す道具なので、
「遅い」と決めるのは読む人の仕事。

## なぜ、道具にしたか（2026-10-13）

`CLAUDE.md` に遅れの表が**数字で焼き込んで**あった。2026-10-07 に 57回で測って
「中央値 2.2時間」と書いたもの。**6日後に測り直したら 3.6時間だった。**

さらに月ごとに切ると、**単調に悪化している**ことが分かった。

| 月 | チャット取り込みの中央値 |
| --- | --- |
| 2026-03 | 0.1時間 |
| 2026-06 | 0.7時間 |
| 2026-08 | 0.6時間 |
| 2026-09 | 2.3時間 |
| 2026-10 | 3.6時間 |

**数を紙に書くかぎり、来月また外れる。** しかも外れかたが「古い数字のほうが
小さい」なので、**「遅すぎる」と誤って騒ぐ側に倒れる**（2026-10-07 の晩に、
3.9時間で「遅すぎる」と疑いかけて、数え直してふつうだと分かっている）。

だから紙から道具へ移した。**手引きには、この道具の名前だけを書く。**

## 予定の時刻は、手で書かない

`.github/workflows/*.yml` の `on.schedule.cron` から読む。
**cron を動かした日に、こちらを直さなくても追いつく。**
曜日つき（`0 3 * * 1` の週1）も、きちんと前の発火時刻を出す。

## 「もう来ないはず」と判断するまでの待ち時間

これも数から出す。出すのは2つ:

  - **p95** … 20回に19回はここまでに来る
  - **いちばん遅い** … 見た範囲での最悪

**判断に使うのは「いちばん遅い」のほう**を切り上げた値。
p95 で切ると、**20回に1回は無実のものを疑う**ことになる。
夜ごとの話なので、20日に1回の誤報は多すぎる。

## 取ってくるところ

`gh api` を呼ぶ。**外に出るので、見張り（`cron_lag_selftest.py`）からは呼ばない**
——あちらは落としてある run を食わせて、数えるところだけを当てている。
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORKFLOWS = REPO / ".github" / "workflows"

# GitHub が1ページで返す上限。これ以上は page を繰る
PER_PAGE = 100

# 「4時間超が何回」の4。**ここを動かすと過去の報告と比べられなくなる**ので、
# 変えるときは報告のほうにも断りを書く
LATE_HOURS = 4.0


# ---- cron を読む ------------------------------------------------------

def _field(spec: str, lo: int, hi: int) -> set[int]:
    """cron の1欄を、当たる数の集合にする。`*` `a` `a,b` `a-b` `*/n` に対応。"""
    out: set[int] = set()
    for part in spec.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/", 1)
            step = int(s)
        if part in ("*", "?"):
            a, b = lo, hi
        elif "-" in part.lstrip("-"):
            a, b = (int(x) for x in part.split("-", 1))
        else:
            a = b = int(part)
        out |= {n for n in range(a, b + 1) if (n - a) % step == 0}
    return {n for n in out if lo <= n <= hi}


class Cron:
    """5欄の cron 1本。**前の発火時刻**が出せればよい。"""

    def __init__(self, spec: str) -> None:
        f = spec.split()
        if len(f) != 5:
            raise ValueError(f"cron の欄が5つではない: {spec!r}")
        self.spec = spec
        self.minute = _field(f[0], 0, 59)
        self.hour = _field(f[1], 0, 23)
        self.dom = _field(f[2], 1, 31)
        self.month = _field(f[3], 1, 12)
        # cron の曜日は 0=日曜。7 も日曜として扱う
        self.dow = {d % 7 for d in _field(f[4], 0, 7)}
        self.dom_any = f[2] in ("*", "?")
        self.dow_any = f[4] in ("*", "?")

    def _day_ok(self, d: datetime) -> bool:
        if d.month not in self.month:
            return False
        dom = d.day in self.dom
        dow = ((d.weekday() + 1) % 7) in self.dow
        # cron の決まり: 日と曜日の両方が指定されていれば **or**
        if self.dom_any and self.dow_any:
            return True
        if self.dom_any:
            return dow
        if self.dow_any:
            return dom
        return dom or dow

    def prev_fire(self, t: datetime, back_days: int = 400) -> datetime | None:
        """`t` 以前で、いちばん近い予定の時刻。無ければ None。"""
        times = sorted(((h, m) for h in self.hour for m in self.minute), reverse=True)
        if not times:
            return None
        day = t.replace(hour=0, minute=0, second=0, microsecond=0)
        for _ in range(back_days):
            if self._day_ok(day):
                for h, m in times:
                    c = day.replace(hour=h, minute=m)
                    if c <= t:
                        return c
            day -= timedelta(days=1)
        return None


def crons_of(text: str) -> list[str]:
    """ワークフローの字から `on.schedule.cron` を拾う。

    **YAML として読まない。** `on:` を YAML で読むと、素の `on` が真偽値の
    `True` に化ける罠がある（`python/workflow_link_selftest.py` の [5] が
    その足を抜いて当てている）。ここは字面で足りる。
    """
    out = []
    for m in re.finditer(r'^\s*-\s*cron:\s*["\']([^"\']+)["\']', text, re.M):
        out.append(m.group(1).strip())
    return out


def name_of(text: str) -> str | None:
    m = re.search(r"^name:\s*(.+)$", text, re.M)
    return m.group(1).strip().strip("\"'") if m else None


def scheduled() -> list[dict]:
    """cron を持つワークフローを、ファイルから拾う。"""
    out = []
    for f in sorted(WORKFLOWS.glob("*.yml")):
        t = f.read_text(encoding="utf-8")
        cs = crons_of(t)
        if cs:
            out.append({"file": f.name, "name": name_of(t), "crons": cs})
    return out


# ---- 数える ----------------------------------------------------------

def lag_hours(created_at: str, crons: list[Cron]) -> float | None:
    """1回ぶんの遅れ（時間）。どの cron からも出せなければ None。"""
    t = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ")
    best = None
    for c in crons:
        p = c.prev_fire(t)
        if p is None:
            continue
        d = (t - p).total_seconds() / 3600
        if best is None or d < best:
            best = d
    return best


def summarize(lags: list[float]) -> dict | None:
    """回数・いちばん早い・中央値・p95・いちばん遅い・LATE_HOURS 超の回数。"""
    if not lags:
        return None
    s = sorted(lags)
    # p95 は「20回に19回はここまで」。小さい標本でも端に寄らない取り方
    idx = min(len(s) - 1, int(round(0.95 * (len(s) - 1))))
    return {
        "n": len(s),
        "min": s[0],
        "median": statistics.median(s),
        "p95": s[idx],
        "max": s[-1],
        "over": sum(1 for x in s if x > LATE_HOURS),
    }


def patience(lags: list[float]) -> float | None:
    """**「もう来ないはず」と判断するまで、何時間待つか。**

    見た範囲でいちばん遅かったものを、30分単位で切り上げる。
    p95 で切ると 20回に1回は無実のものを疑うことになるので、そちらは使わない。
    """
    if not lags:
        return None
    return ((max(lags) * 2) // 1 + 1) / 2


def group_by_month(rows: list[tuple[datetime, float]]) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    for t, d in rows:
        out.setdefault(t.strftime("%Y-%m"), []).append(d)
    return out


# ---- 取ってくる ------------------------------------------------------

def gh_runs(wf_file: str, pages: int) -> list[dict]:
    """`gh api` で `event=schedule` の run を取る。**外に出る。**"""
    out: list[dict] = []
    for page in range(1, pages + 1):
        url = (f"repos/Ayato-kosaka/live-streaming/actions/workflows/{wf_file}"
               f"/runs?event=schedule&per_page={PER_PAGE}&page={page}")
        r = subprocess.run(["gh", "api", url], capture_output=True, text=True,
                           check=False, timeout=120)
        if r.returncode != 0:
            print(f"::warning::{wf_file} の run が取れなかった: "
                  f"{r.stderr.strip()[:120]}", file=sys.stderr)
            break
        try:
            got = json.loads(r.stdout).get("workflow_runs", [])
        except json.JSONDecodeError:
            break
        out += got
        if len(got) < PER_PAGE:
            break
    return out


# ---- 出す ------------------------------------------------------------

def _line(label: str, s: dict) -> str:
    return (f"{label:<32}{s['n']:>5}{s['min']:>8.1f}{s['median']:>8.1f}"
            f"{s['p95']:>8.1f}{s['max']:>8.1f}{s['over']:>8}")


HEAD = (f"{'ワークフロー':<32}{'回数':>5}{'早い':>8}{'中央値':>8}"
        f"{'p95':>8}{'遅い':>8}{int(LATE_HOURS):>5}h超")


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--days", type=int, default=0,
                    help="直近この日数だけ数える（既定: 全部）")
    ap.add_argument("--pages", type=int, default=3,
                    help=f"1本あたり何ページ取るか（1ページ {PER_PAGE} 回）")
    ap.add_argument("--by-month", action="store_true", help="月ごとに切って出す")
    ap.add_argument("--json", action="store_true", help="機械で読む形で出す")
    ap.add_argument("--offline", default=None,
                    help="落としてある run の JSON で回す（{ファイル名: [run,…]}）")
    a = ap.parse_args()

    wfs = scheduled()
    if not wfs:
        print("✕ cron を持つワークフローを1本も見つけられなかった"
              f"（見に行った先: {WORKFLOWS}）。**数字は1つも出さない**")
        return 2

    canned = json.loads(Path(a.offline).read_text(encoding="utf-8")) if a.offline else None
    cut = (datetime.utcnow() - timedelta(days=a.days)) if a.days else None

    rows, out = [], {}
    for w in wfs:
        cs = [Cron(c) for c in w["crons"]]
        runs = canned.get(w["file"], []) if canned is not None \
            else gh_runs(w["file"], a.pages)
        seen, lags = set(), []
        for r in runs:
            if r.get("id") in seen:
                continue
            seen.add(r.get("id"))
            t = datetime.strptime(r["created_at"], "%Y-%m-%dT%H:%M:%SZ")
            if cut and t < cut:
                continue
            d = lag_hours(r["created_at"], cs)
            # 24時間を超える「遅れ」は、予定の取り違え（手で押した回が
            # event=schedule に混ざるなど）。数に入れない
            if d is not None and d < 24:
                lags.append((t, d))
        s = summarize([d for _, d in lags])
        out[w["file"]] = {"name": w["name"], "crons": w["crons"],
                          "summary": s,
                          "patience": patience([d for _, d in lags]),
                          "by_month": {k: summarize(v) for k, v in
                                       group_by_month(lags).items()}}
        if s:
            rows.append((w, s, lags))

    if not rows:
        print(f"✕ 予定実行の run を1回も拾えなかった（cron を持つのは {len(wfs)}本）。"
              "**「遅れていません」とは言わない**")
        return 2

    if a.json:
        print(json.dumps(out, ensure_ascii=False, sort_keys=True, indent=1))
        return 0

    rows.sort(key=lambda r: -r[1]["n"])
    print(f"[定時実行の遅れ] cron を持つ {len(wfs)}本 / 数えられた {len(rows)}本"
          + (f" / 直近 {a.days}日" if a.days else " / 全履歴"))
    print("（遅れ＝run の created_at − その前の予定時刻。単位は時間）")
    print()
    print(HEAD)
    for w, s, _ in rows:
        print(_line(f"{w['name'][:28]}", s))

    print()
    print("[もう来ないはず、と判断するまで待つ時間]")
    print("（見た範囲でいちばん遅かったものを30分単位で切り上げ。"
          "p95 で切ると20回に1回は無実を疑う）")
    for w, s, lags in rows:
        p = patience([d for _, d in lags])
        print(f"  {w['name'][:28]:<30} **{p:.1f}時間**"
              f"（p95 {s['p95']:.1f} / いちばん遅い {s['max']:.1f}）")

    if a.by_month:
        print()
        print("[月ごと]（悪化しているかを見る。中央値／いちばん遅い／回数）")
        for w, _, lags in rows:
            bm = group_by_month(lags)
            if len(bm) < 2:
                continue
            print(f"  {w['name']}")
            for k in sorted(bm):
                m = summarize(bm[k])
                print(f"    {k}  中央値 {m['median']:>5.1f}h  "
                      f"いちばん遅い {m['max']:>5.1f}h  （{m['n']}回）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
