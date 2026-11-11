"""**投げ銭アラートのログの写し（BigQuery）を、配信ごとの表にする。**

    python3 python/alert_log_report.py --hours 24          # 直近24時間
    python3 python/alert_log_report.py --since 2026-11-10T13:00:00Z
    python3 python/alert_log_report.py --hours 72 --json /tmp/a.json --md /tmp/a.md
    python3 python/alert_log_report.py --session 1762786800000 --include-probe \\
        --expect mount,initSuccess,fxPlan                  # 1つの回に、その出来事が入ったか
    python3 python/alert_log_report.py --rows rows.jsonl   # 偽の行で回す（BigQuery を引かない）

終了コード **0=異常なし / 1=異常あり（または `--expect` が欠けた）/
2=読めなかった（表が無い・BigQuery に届かない。判定していない）**
（`docs/island-standards.md` §15）。

## なぜ要るか（#1160）

11/6・11/8 の配信で、投げ銭の演出（11月の7段の動画）が出なかった。
面のログはスプレッドシートにしか無く、**システムの側からは読めなかった**ので、
原因を数で追えず、「直った」を本物の配信で確かめることもできなかった。

いまは面が決めた出来事を BigQuery `youtube_chat.alertbox_logs` へも
1行ずつ写している（`functions/src/alertLog.ts`）。ここはそれを読む。

## 何を数えるか（配信 = 面を開いた回 = `session_id` ごと）

| 列 | 中身 |
| --- | --- |
| 受けた | `notificationReceived` のうち、本物の投げ銭（スパチャ・Doneru。試しを除く） |
| 出した | `notificationDisplayed` のうち、本物の投げ銭 |
| 演出が出た | `fxPlan` が動画で出すと決めて、`fxVideoFailed` が来なかったもの |
| 出なかった | `fxPlan` が動画を外した（理由つき）＋動画が止まった（`fxVideoFailed`） |
| 動画の段でない | `fxPlan` が「その額・その日は動画の段ではない」と言ったもの（`off` `still` `noTier`） |
| fxPlan 抜け | 出したのに、その通知の `fxPlan` が無いもの |
| 待った ms | `fxPlan.waitMs` の中央値／最大 |
| 遅れて用意 | `fxPrepLate`（待ちが明けてから用意が終わった） |
| 試し・もう一度 | Doneru の通知テスト（`test: true`）と、机の「もう一度出す」（`replay-…`） |

**どの通知の `fxPlan` か**は、時刻の順に並べて「`notificationDisplayed` の
あと、次の `notificationDisplayed` より前」で結ぶ。アラートはキューで1件ずつ
出るので、あいだに別の通知の記録は挟まらない（`app/alertbox/index.tsx` の
`processNotificationQueue`）。Doneru の通知テストには `id` が無いので、
`id` では結べない。

**異常** は、本物・試し・もう一度のどれでも、演出が出なかった・`fxPlan` 抜け・
`fxVideoFailed`・`fxPrepLate` のどれかが1件でもあったもの。

**`fxPlan` は季節のテーマがある日だけ出る**（`index.tsx`）。季節の外で回すと、
出した投げ銭が全部「抜け」に数えられる——この道具は季節のあいだに使う。

## 出すのは数と段と時刻だけ

このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの名前・
メッセージ・通知の ID は1文字も出さない**（表には入っているが、ここでは
数えるだけ）。合言葉も表に入っていない（`source` はハッシュ）。

## 確かめの回は、既定で数えない

`alert_watch.yml` の確かめ（本番の面を Actions の Chromium で開いて、偽の
Doneru から通知テストを1件流す）は、User-Agent に `alert-log-probe` を付けて
開く。既定では表から外す（`--include-probe` で入れる）。
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

PROJECT = os.getenv("BQ_PROJECT_ID") or "live-streaming-d3cac"
TABLE = "youtube_chat.alertbox_logs"
JST = timezone(timedelta(hours=9))

#: 動画の段ではない、と面が言った理由（`app/alertbox/season/show/useTierVideo.ts` の `ensureFor`）。
#: **ここに無い理由は全部「出なかった」に数える**（新しい理由が増えた日に、黙って合格へ倒さない）
NOT_VIDEO_TIER = {"off", "still", "noTier"}
MONEY = {"donation", "superchat"}
PROBE_MARK = "alert-log-probe"


def _ts(v) -> datetime | None:
    """BigQuery の TIMESTAMP（datetime）か ISO の字を、UTC の datetime にする。"""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def _data(v) -> dict:
    if isinstance(v, dict):
        return v
    if not v:
        return {}
    try:
        d = json.loads(v)
    except (TypeError, ValueError):
        return {}
    return d if isinstance(d, dict) else {}


def kind_of(data: dict) -> str:
    """本物か、試し（Doneru の通知テスト）か、机の「もう一度出す」か。"""
    if str(data.get("id", "")).startswith("replay-"):
        return "replay"
    if data.get("test") is True:
        return "test"
    return "real"


def device_of(ua: str | None) -> str:
    """端末のおおよそ（PRISM のスマホか、PC の OBS か）。"""
    u = ua or ""
    if PROBE_MARK in u:
        return "確かめ"
    for key, name in (("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"),
                      ("Windows", "Windows"), ("Macintosh", "Mac"), ("Linux", "Linux")):
        if key in u:
            return name
    return "?"


@dataclass
class Note:
    """出した通知1件（お金のものだけ）。"""

    kind: str
    yen: int | None
    nid: str | None
    plan: dict | None = None
    prep_late: bool = False
    video_failed: str | None = None

    def outcome(self) -> tuple[str, str | None]:
        """("ok" | "novideo" | "missed" | "noplan", 理由)"""
        if self.plan is None:
            return "noplan", None
        if not self.plan.get("video"):
            why = str(self.plan.get("why") or "unknown")
            return ("novideo", why) if why in NOT_VIDEO_TIER else ("missed", why)
        if self.video_failed is not None:
            return "missed", f"videoFailed:{self.video_failed}"
        return "ok", None

    def bad(self) -> bool:
        return self.outcome()[0] in ("missed", "noplan") or self.prep_late


@dataclass
class Session:
    source: str
    session_id: int
    rows: list = field(default_factory=list)
    notes: list = field(default_factory=list)
    received: Counter = field(default_factory=Counter)
    events: Counter = field(default_factory=Counter)
    commits: set = field(default_factory=set)
    device: str = "?"
    orphan_plans: int = 0
    held_failed: int = 0

    @property
    def probe(self) -> bool:
        return self.device == "確かめ"

    def opened(self) -> datetime:
        return datetime.fromtimestamp(self.session_id / 1000, tz=timezone.utc)

    def real(self) -> list:
        return [n for n in self.notes if n.kind == "real"]

    def others(self) -> list:
        return [n for n in self.notes if n.kind != "real"]

    def money(self) -> bool:
        return bool(self.notes) or sum(self.received.values()) > 0

    def anomalies(self) -> list[str]:
        """異常の印（数だけ）。空なら異常なし。"""
        out = []
        missed = [n for n in self.notes if n.outcome()[0] == "missed"]
        noplan = [n for n in self.notes if n.outcome()[0] == "noplan"]
        if missed:
            out.append(f"演出が出なかった {len(missed)}")
        if noplan:
            out.append(f"fxPlan 抜け {len(noplan)}")
        if self.events["fxVideoFailed"]:
            out.append(f"fxVideoFailed {self.events['fxVideoFailed']}")
        if self.events["fxPrepLate"]:
            out.append(f"fxPrepLate {self.events['fxPrepLate']}")
        return out


def summarize(rows: list[dict]) -> list[Session]:
    """行を配信ごとにまとめ、通知ごとに演出の記録を結ぶ。"""
    by: dict[tuple, Session] = {}
    for r in rows:
        key = (str(r.get("source") or ""), int(r.get("session_id") or 0))
        s = by.get(key)
        if s is None:
            s = by[key] = Session(source=key[0], session_id=key[1])
        s.rows.append(r)
    for s in by.values():
        # 面の時計で並べる。同じ ms なら口が受けた順
        s.rows.sort(key=lambda r: (_ts(r.get("logged_at")) or _ts(r.get("received_at"))
                                   or datetime.min.replace(tzinfo=timezone.utc),
                                   _ts(r.get("received_at")) or datetime.min.replace(tzinfo=timezone.utc)))
        cur: Note | None = None
        for r in s.rows:
            ev = str(r.get("event") or "")
            d = _data(r.get("data"))
            s.events[ev] += 1
            if r.get("git_commit"):
                s.commits.add(str(r["git_commit"])[:7])
            if s.device == "?" and r.get("ua"):
                s.device = device_of(r.get("ua"))
            if ev == "notificationReceived" and d.get("type") in MONEY:
                s.received[kind_of(d)] += 1
            elif ev == "notificationDisplayed":
                if d.get("type") in MONEY:
                    yen = d.get("jpy") if d.get("type") == "superchat" else d.get("amount")
                    cur = Note(kind=kind_of(d), yen=yen if isinstance(yen, (int, float)) else None,
                               nid=str(d["id"]) if d.get("id") is not None else None)
                    s.notes.append(cur)
                else:
                    cur = None
            elif ev == "fxPlan":
                if cur is not None and cur.plan is None:
                    cur.plan = d
                else:
                    # 結ぶ先の「出した」が窓の外（前の窓）にある
                    s.orphan_plans += 1
            elif ev == "fxPrepLate":
                tgt = next((n for n in s.notes if d.get("id") is not None and n.nid == str(d.get("id"))), cur)
                if tgt is not None:
                    tgt.prep_late = True
            elif ev == "fxVideoFailed":
                if cur is not None:
                    cur.video_failed = str(d.get("why") or "?")
            elif ev == "fxHeld":
                try:
                    s.held_failed += int(d.get("failed") or 0)
                except (TypeError, ValueError):
                    pass
    return sorted(by.values(), key=lambda s: (s.session_id, s.source))


def _waits(notes: list) -> list[int]:
    out = []
    for n in notes:
        w = (n.plan or {}).get("waitMs")
        if isinstance(w, (int, float)):
            out.append(int(w))
    return out


def _why_text(notes: list, want: str) -> str:
    c = Counter(n.outcome()[1] for n in notes if n.outcome()[0] == want)
    if not c:
        return "0"
    inner = ", ".join(f"{k}×{v}" for k, v in sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0]))))
    return f"{sum(c.values())}（{inner}）"


def table(sessions: list[Session]) -> str:
    """配信ごとの表（Markdown）。**数と段と時刻だけ。**"""
    head = ("| 開いた（JST） | 端末 | 版 | 受けた | 出した | 演出が出た | 出なかった | 動画の段でない | "
            "fxPlan 抜け | 待った ms（中央/最大） | 遅れて用意 | 動画が止まった | 試し・もう一度 | 異常 |")
    lines = [head, "|" + " --- |" * 14]
    for s in sessions:
        real = s.real()
        waits = _waits(real)
        wait = f"{int(statistics.median(waits))} / {max(waits)}" if waits else "—"
        oth = s.others()
        oth_ok = sum(1 for n in oth if n.outcome()[0] == "ok")
        oth_txt = f"{len(oth)}（出た {oth_ok}）" if oth else "0"
        bad = s.anomalies()
        lines.append(
            f"| {s.opened().astimezone(JST):%m/%d %H:%M} | {s.device} | {', '.join(sorted(s.commits)) or '—'} "
            f"| {s.received['real']} | {len(real)} "
            f"| {sum(1 for n in real if n.outcome()[0] == 'ok')} "
            f"| {_why_text(real, 'missed')} | {_why_text(real, 'novideo')} "
            f"| {sum(1 for n in real if n.outcome()[0] == 'noplan')} | {wait} "
            f"| {s.events['fxPrepLate']} | {s.events['fxVideoFailed']} | {oth_txt} "
            f"| {'あり' if bad else ''} |")
    return "\n".join(lines)


def digest(sessions: list[Session], since: datetime, until: datetime) -> dict:
    """機械が読む要約（`alert_watch.yml` が読む）。**数だけ。**"""
    money = [s for s in sessions if s.money() or s.anomalies()]
    notes = [n for s in sessions for n in s.notes]
    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "opened": len(sessions),
        "init_error": sum(s.events["initError"] for s in sessions),
        "sessions_with_money": len(money),
        "received": sum(s.received["real"] for s in sessions),
        "displayed": sum(1 for n in notes if n.kind == "real"),
        "tests": sum(1 for n in notes if n.kind == "test"),
        "replays": sum(1 for n in notes if n.kind == "replay"),
        "fx_ok": sum(1 for n in notes if n.kind == "real" and n.outcome()[0] == "ok"),
        "missed": sum(1 for n in notes if n.outcome()[0] == "missed"),
        "noplan": sum(1 for n in notes if n.outcome()[0] == "noplan"),
        "fx_prep_late": sum(s.events["fxPrepLate"] for s in sessions),
        "fx_video_failed": sum(s.events["fxVideoFailed"] for s in sessions),
        "anomaly": any(s.anomalies() for s in sessions),
        # 「新しい投げ銭があったか」。試し・もう一度も、確かめたい1件なので入れる
        "new_money": sum(s.received["real"] for s in sessions)
        + sum(1 for n in notes if n.kind != "real"),
    }


def report(sessions: list[Session], since: datetime, until: datetime) -> str:
    """表と1行の結び（Markdown）。"""
    d = digest(sessions, since, until)
    money = [s for s in sessions if s.money() or s.anomalies()]
    span = f"{since.astimezone(JST):%m/%d %H:%M}〜{until.astimezone(JST):%m/%d %H:%M} JST"
    out = [f"**{span}** — 開いた回 {d['opened']}（初期化に失敗 {d['init_error']}）・"
           f"投げ銭のあった回 {len(money)}"]
    if not money:
        out.append("")
        out.append("新しい投げ銭: 無し")
        return "\n".join(out)
    out.append("")
    out.append(table(money))
    out.append("")
    bad = [f"{s.opened().astimezone(JST):%m/%d %H:%M} … " + "・".join(s.anomalies())
           for s in money if s.anomalies()]
    if bad:
        out.append("**異常あり** — " + " / ".join(bad))
    else:
        out.append(f"異常なし — 本物 {d['displayed']} 件中、演出が出た {d['fx_ok']} 件"
                   f"（動画の段でないもの {d['displayed'] - d['fx_ok']} 件）")
    return "\n".join(out)


#: `--detail` で出してよい項目（出来事ごと）。**ここに無い項目は1つも出さない。**
#: 名前・メッセージ・通知の ID・額・URL は入れない（額は段で足りる）。
#: 面に項目を足したら、ここにも足す（足さなければ出ないだけで、漏れはしない）
DETAIL_KEYS: dict[str, tuple[str, ...]] = {
    "mount": ("enabledSources",),
    "notificationReceived": ("type", "test"),
    "notificationDisplayed": ("type", "test"),
    "fxPlan": ("tier", "video", "show", "waitMs", "limitMs", "from", "why", "prepMs", "fetched", "bytes",
               "rigs", "held", "net", "openSec"),
    "fxPrepLate": ("tier", "ok", "from", "why", "ms", "fetched", "bytes"),
    "fxHeld": ("got", "bytes", "failed", "full", "ms", "heldFiles", "heldBytes", "ready", "of"),
    "fxVideoFailed": ("sec", "why", "tier", "from", "openSec", "net", "vis", "hiddenMs", "gapMs", "ticks",
                      "layers", "retried", "nth"),
    "replayPlay": ("type",),
}


def _ua_short(ua: str | None) -> str:
    """UA から、OS の版・Chrome の版・WebView かだけを抜く（機種名は出さない）。"""
    import re

    u = ua or ""
    os_ = re.search(r"Android [0-9.]+|iPhone OS [0-9_]+|Windows NT [0-9.]+|Mac OS X [0-9_]+", u)
    ch = re.search(r"Chrome/([0-9]+)", u)
    return " / ".join(x for x in (os_.group(0) if os_ else device_of(u), f"Chrome {ch.group(1)}" if ch else "",
                                  "WebView" if "; wv)" in u else "") if x)


def _pick(ev: str, d: dict) -> str:
    keys = DETAIL_KEYS.get(ev)
    if keys is None:
        return ""
    got = {k: d[k] for k in keys if k in d}
    if ev in ("notificationReceived", "notificationDisplayed", "replayPlay"):
        got["kind"] = kind_of(d)
    return json.dumps(got, ensure_ascii=False, separators=(",", ":")) if got else ""


def detail(sessions: list[Session]) -> str:
    """回ごとの出来事の並び（`--detail`）。**段・秒・理由・回線だけ。** 名前・メッセージ・ID・額は出さない。

    投げ銭のあった回だけ。時刻は「開いてからの秒」と JST。
    """
    out = []
    for s in sessions:
        if not (s.money() or s.anomalies()):
            continue
        ua = next((r.get("ua") for r in s.rows if r.get("ua")), None)
        out.append(f"## 開いた {s.opened().astimezone(JST):%m/%d %H:%M:%S} JST（session {s.session_id}）"
                   f" — {_ua_short(ua)} — 版 {', '.join(sorted(s.commits)) or '—'}")
        out.append("")
        for i, note in enumerate(s.notes, 1):
            o, why = note.outcome()
            p = note.plan or {}
            out.append(f"- 通知{i}（{note.kind}）段 {p.get('tier', '—')} → {o}{f'（{why}）' if why else ''}")
        out.append("")
        out.append("| 開いてから | JST | 出来事 | 中身 |")
        out.append("| ---: | --- | --- | --- |")
        for r in s.rows:
            ev = str(r.get("event") or "")
            t = _ts(r.get("logged_at")) or _ts(r.get("received_at"))
            rel = f"{(t - s.opened()).total_seconds():.1f}" if t else "?"
            jst = t.astimezone(JST).strftime("%H:%M:%S.%f")[:-3] if t else "?"
            out.append(f"| {rel} | {jst} | {ev} | {_pick(ev, _data(r.get('data')))} |")
        out.append("")
    return "\n".join(out) if out else "（投げ銭のあった回はありません）"


def fetch(since: datetime, until: datetime, session: int | None) -> list[dict]:
    """BigQuery から窓の行を引く。**表が無い・届かないは投げる**（呼ぶ側が 2 にする）。"""
    from google.cloud import bigquery  # 偽の行で回すときは要らないので、ここで読む

    client = bigquery.Client(project=PROJECT)
    where = "received_at > @since AND received_at <= @until"
    params = [bigquery.ScalarQueryParameter("since", "TIMESTAMP", since),
              bigquery.ScalarQueryParameter("until", "TIMESTAMP", until)]
    if session is not None:
        where += " AND session_id = @sid"
        params.append(bigquery.ScalarQueryParameter("sid", "INT64", session))
    sql = f"""
    SELECT received_at, logged_at, session_id, source, event, git_commit,
           notification_id, TO_JSON_STRING(data) AS data, ua
    FROM `{PROJECT}.{TABLE}`
    WHERE {where}
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    return [dict(r) for r in job.result()]


def read_rows(path: str) -> list[dict]:
    """偽の行（1行1件の JSON）を読む。"""
    out = []
    with open(path, encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if ln:
                out.append(json.loads(ln))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--hours", type=float, default=24.0, help="直近何時間（--since が無いとき）")
    ap.add_argument("--since", help="ここより後に受けた行（ISO）")
    ap.add_argument("--until", help="ここまでに受けた行（ISO。既定はいま − --lag-min 分）")
    ap.add_argument("--lag-min", type=float, default=2.0,
                    help="いまから何分前までを読むか（fxPlan は出してから最大8秒あとに来るので、窓の境で割らない）")
    ap.add_argument("--session", type=int, help="この session_id の回だけ")
    ap.add_argument("--include-probe", action="store_true", help="確かめ（alert-log-probe）の回も入れる")
    ap.add_argument("--expect", help="選んだ行に、この出来事（カンマ区切り）がぜんぶ在るか")
    ap.add_argument("--rows", help="BigQuery を引かず、この JSONL を行として読む（試験用）")
    ap.add_argument("--detail", action="store_true",
                    help="投げ銭のあった回ごとに、出来事の並び（段・秒・理由・回線だけ）も出す")
    ap.add_argument("--md", help="表をこのファイルにも書く")
    ap.add_argument("--json", dest="json_out", help="要約をこのファイルに書く")
    a = ap.parse_args(argv)

    now = datetime.now(timezone.utc)
    until = _ts(a.until) if a.until else now - timedelta(minutes=a.lag_min)
    since = _ts(a.since) if a.since else until - timedelta(hours=a.hours)
    if since is None or until is None or since >= until:
        print("窓が読めない（--since / --until）", file=sys.stderr)
        return 2

    try:
        rows = read_rows(a.rows) if a.rows else fetch(since, until, a.session)
    except Exception as e:  # noqa: BLE001 — 何で落ちても「読めなかった」。判定はしない
        # **中身は出さない。** 例外の種類と、表が無いかどうかだけ
        name = type(e).__name__
        hint = "表がまだ無い（口が1行も入れていない）" if "Not found" in str(e) else "BigQuery に届かない"
        print(f"読めませんでした: {hint}（{name}）。**異常なし、という意味ではありません**", file=sys.stderr)
        return 2
    if a.rows:
        rows = [r for r in rows
                if (t := _ts(r.get("received_at"))) is not None and since < t <= until
                and (a.session is None or int(r.get("session_id") or 0) == a.session)]

    sessions = summarize(rows)
    if not a.include_probe:
        sessions = [s for s in sessions if not s.probe]
    text = report(sessions, since, until)
    d = digest(sessions, since, until)
    d["rows"] = len(rows)

    rc = 1 if d["anomaly"] else 0
    if a.expect:
        want = [w.strip() for w in a.expect.split(",") if w.strip()]
        have = Counter(ev for s in sessions for ev, n in s.events.items() if n)
        missing = [w for w in want if not have.get(w)]
        d["expect_missing"] = missing
        text += "\n\n" + ("入っていた出来事: " + ", ".join(f"{w} {have[w]}" for w in want if have.get(w)))
        if missing:
            text += "\n**入っていない出来事: " + ", ".join(missing) + "**"
            rc = 1
    if a.detail:
        text += "\n\n" + detail(sessions)
    print(text)
    if a.md:
        with open(a.md, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    return rc


if __name__ == "__main__":
    sys.exit(main())
