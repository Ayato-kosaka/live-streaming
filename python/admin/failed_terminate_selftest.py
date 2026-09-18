"""**偽の BigQuery で、`failed_terminate` の振る舞いを実際に動かして確かめる。**

    python3 python/admin/failed_terminate_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**本番にも資格情報にも触らない。** 本物の SQL（`select_sql()` / `update_sql()`）を
そのまま sqlite に当てるので、確かめているのは「字面が正しそうか」ではなく
**その SQL が本番と同じ形の表から何を選び、何を書き換えるか**。

## 何を見るか

| | 見るもの | 落ちたら |
| --- | --- | --- |
| 1 | 落とすべき26本を拾う（id まで一致） | 1 |
| 2 | **非公開37本を1本も拾わない**（`has been removed` の字が混ざった1行を含む） | 1 |
| 3 | 本物の `UPDATE` を当てたあと、26本だけが `SKIPPED`。**非公開37本は `FAILED` のまま** | 1 |
| 4 | `last_error_code` / `last_error_detail` / `attempt_count` が**1行も変わらない** | 1 |
| 5 | 数が合わない表（21本／知らない理由）では、**1行も書かずに 2** | 1 |
| 6 | **下見は1バイトも書かない**（表を前後で突き合わせ、口にも `UPDATE` が来ない） | 1 |
| 7 | 二度流すと 2 で止まる（もう26本が居ない） | 1 |
| 8 | 対照（`drill()`）が通る。`BREAK=` で足を1本抜くと、**その足の対照だけが落ちる** | 1 |
| 9 | 知らない足の名前は落とす | 1 |

**2 がいちばん危ない取り違え。** 非公開はあやとが公開に戻せるので、
終端に落とすと戻した日に島が知らないまま隠し続けることになる。

**8 は「4つ当てた」を「4つの足を見た」と読まないため**
（`docs/island-misses.md` #128 の決めごと1）。足は
`private` / `count` / `other` / `dry` の4本で、**1本抜くたびに、
落ちる対照が1つだけ入れ替わる**ところまで見る。
"""

import os
import re
import sqlite3
import subprocess
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# `config.py` は、この環境変数が無いと読み込みの時点で落ちる。
# 下で作るクライアントは偽物なので**本物の名前は要らない**が、
# 無いと確かめそのものが起動できない。**手元の値は上書きしない**
os.environ.setdefault("BQ_PROJECT_ID", "failed-terminate-selftest")
os.environ.pop("BREAK", None)
os.environ.pop("ARGS", None)

import failed_terminate as ft  # noqa: E402

FAILED: list[str] = []
CHECKS = 0


def ck(name: str, ok: bool, saw) -> None:
    global CHECKS
    CHECKS += 1
    print(f"  {'OK  ' if ok else 'NG  '} {name}（{saw}）")
    if not ok:
        FAILED.append(name)


# ============================================================================
# 偽の BigQuery。**本物の SQL を sqlite に当てるだけ**
# ============================================================================

class _Job:
    def __init__(self, rows, affected):
        self._rows = rows
        self.num_dml_affected_rows = affected

    def result(self):
        return self._rows


class FakeClient:
    """本物の SQL を受け取って sqlite で回す。**来た問い合わせを全部覚える。**"""

    def __init__(self, rows: list[tuple]):
        self.con = sqlite3.connect(":memory:")
        self.con.execute("CREATE TABLE videos (" + ", ".join(ft.COLUMNS) + ")")
        self.con.executemany(
            "INSERT INTO videos VALUES (" + ", ".join("?" * len(ft.COLUMNS)) + ")",
            rows,
        )
        self.seen: list[str] = []

    def query(self, sql, *a, **k):
        self.seen.append(sql)
        s = ft.to_sqlite(sql)
        cur = self.con.execute(s)
        if s.strip().upper().startswith("SELECT"):
            names = [d[0] for d in cur.description]
            return _Job([dict(zip(names, r)) for r in cur.fetchall()], None)
        self.con.commit()
        return _Job([], cur.rowcount)

    # -- 確かめる側が使うもの ------------------------------------------------

    def dump(self) -> list[tuple]:
        return list(self.con.execute(
            "SELECT " + ", ".join(ft.COLUMNS) + " FROM videos ORDER BY video_id"))

    def writes(self) -> list[str]:
        return [q for q in self.seen
                if not q.strip().upper().startswith("SELECT")]


def run(rows: list[tuple], apply: bool = False) -> tuple[int, FakeClient]:
    """偽の BigQuery を差し込んで `main()` を最後まで動かす。"""
    fake = FakeClient(rows)

    # `from google.cloud import bigquery` を偽物に向ける。
    # **本物が入っていない箱でも回る**（毎 PR で走るので、そこは要らない）
    mod = types.ModuleType("google.cloud.bigquery")
    mod.Client = lambda project=None: fake
    cloud = sys.modules.get("google.cloud") or types.ModuleType("google.cloud")
    google = sys.modules.get("google") or types.ModuleType("google")
    keep = (sys.modules.get("google"), sys.modules.get("google.cloud"),
            sys.modules.get("google.cloud.bigquery"), getattr(cloud, "bigquery", None))
    cloud.bigquery = mod
    sys.modules["google"] = google
    sys.modules["google.cloud"] = cloud
    sys.modules["google.cloud.bigquery"] = mod
    os.environ["ARGS"] = '{"apply": true}' if apply else "{}"
    try:
        code = ft.main()
    finally:
        os.environ.pop("ARGS", None)
        for name, m in zip(("google", "google.cloud", "google.cloud.bigquery"), keep):
            if m is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = m
        if keep[3] is None:
            if hasattr(cloud, "bigquery"):
                del cloud.bigquery
        else:
            cloud.bigquery = keep[3]
    return code, fake


# ============================================================================

def case_pick() -> None:
    """1・2 落とすべき26本を拾い、非公開は1本も拾わない。"""
    print("\n[1・2] 本番と同じ形の表から、何を拾うか")
    for label, mixed in (("そのまま", False), ("非公開に消された字が混ざる1行", True)):
        rows, want = ft.fixture(mixed=mixed)
        got = {r["video_id"] for r in ft.rows_selected(rows)}
        ck(f"{label}: 26本ちょうど（id まで一致）", got == want and len(got) == 26,
           f"{len(got)} 本")
        priv = sorted(v for v in got if v.startswith("PRIV"))
        ck(f"{label}: 非公開を1本も拾わない", not priv, f"拾った非公開 {len(priv)} 本")


def case_write() -> None:
    """3・4 本物の `UPDATE` を当てたあとの表。"""
    print("\n[3・4] 本物の UPDATE を当てたあと、表がどうなるか")
    rows, want = ft.fixture(mixed=True)
    code, fake = run(rows, apply=True)
    ck("終了コード 0", code == 0, code)

    after = {r[0]: r for r in fake.dump()}
    before = {r[0]: r for r in rows}
    moved = sorted(v for v, r in after.items() if r[1] == "SKIPPED"
                   and before[v][1] != "SKIPPED")
    ck("SKIPPED に落ちたのは、落とすべき26本だけ", set(moved) == want,
       f"{len(moved)} 本")
    still = sorted(v for v, r in after.items()
                   if v.startswith("PRIV") and r[1] == "FAILED")
    ck("非公開37本は FAILED のまま", len(still) == 37, f"{len(still)} 本")
    ck("FAILED に残ったのは非公開37本だけ",
       sorted(v for v, r in after.items() if r[1] == "FAILED") == still,
       f"{sum(1 for r in after.values() if r[1] == 'FAILED')} 本")
    ck("FAILED 以外（SUCCEEDED / WAITING / SKIPPED）は1行も動かない",
       all(after[v][1] == before[v][1]
           for v in ("SUCC0000", "WAIT0000", "SKIP0000")), "動かない")

    # 4: 理由と試行回数は残っている（消すと、また測り直しになる）
    keep_cols = [ft.COLUMNS.index(c) for c in
                 ("attempt_count", "last_attempt_at", "last_error_code",
                  "last_error_detail", "first_seen_at")]
    changed = [v for v in after
               if any(after[v][i] != before[v][i] for i in keep_cols)]
    ck("理由・試行回数・日付は1行も変えない", not changed,
       f"変わった行 {len(changed)}")


def case_stop() -> None:
    """5 数が合わない表では、1行も書かずに 2。"""
    print("\n[5] 数が合わない表では、1行も書かない")
    cases = {
        "NO_CHAT_FILE が21本（表が動いた）": ft.fixture(nochat=21)[0],
        "知らない理由が1行ある": ft.fixture(extra=[ft._row(
            "UNKNOWN0", "FAILED", None, "yt-dlp 終了コード 1\n見たことのない字\n")])[0],
        "落とすものが1本も無い": [r for r in ft.fixture()[0]
                                  if r[1] != "FAILED" or r[0].startswith("PRIV")],
    }
    for label, rows in cases.items():
        code, fake = run(rows, apply=True)
        ck(f"{label}: 終了コード 2", code == 2, code)
        ck(f"{label}: 書く問い合わせが1本も出ない", not fake.writes(),
           f"{len(fake.writes())} 本")
        ck(f"{label}: 表が1行も変わらない",
           fake.dump() == sorted(rows, key=lambda r: r[0]), "変わらない")


def case_dry() -> None:
    """6・7 下見は1バイトも書かない／二度流すと止まる。"""
    print("\n[6] 下見（既定）で、表が1行も変わらないか")
    rows, _ = ft.fixture()
    code, fake = run(rows, apply=False)
    ck("終了コード 0", code == 0, code)
    ck("書く問い合わせが口に1本も来ない", not fake.writes(), f"{len(fake.writes())} 本")
    ck("表が1行も変わらない", fake.dump() == sorted(rows, key=lambda r: r[0]),
       "変わらない")
    ck("状態ごとの本数も同じ",
       [r[1] for r in fake.dump()] == [r[1] for r in sorted(rows, key=lambda r: r[0])],
       "同じ")

    print("\n[7] 二度流したら（もう26本が居ない）")
    rows, _ = ft.fixture()
    code, fake = run(rows, apply=True)
    ck("1回目は 0", code == 0, code)
    code2, fake2 = run(fake.dump(), apply=True)
    ck("2回目は 2（1行も書かない）", code2 == 2 and not fake2.writes(), code2)


def case_drill() -> None:
    """8・9 対照そのものと、足の抜きかた。"""
    print("\n[8] 対照が通る／足を1本抜くと、その足の対照だけが落ちる")
    ck("そのままなら通る", ft.drill(), "通る")

    # 足ごとに、**どの対照が落ちるはずか**
    want = {"private": "B", "count": "C", "other": "D", "dry": "E"}
    for legname, letter in want.items():
        out = drill_out(legname)
        fell = sorted({m[0] for m in re.findall(r"NG\s+([A-E]) ", out)})
        ck(f"BREAK={legname} で落ちるのは {letter} だけ", fell == [letter], fell or "1つも落ちない")

    print("\n[9] 知らない足の名前")
    p = subprocess.run(
        [sys.executable, "-c", "import failed_terminate as f; f.drill()"],
        cwd=HERE, env={**os.environ, "BREAK": "zzz"},
        capture_output=True, text=True)
    ck("BREAK=zzz は落ちる", p.returncode != 0, p.returncode)
    ck("何が使えるかを言う", "private" in (p.stdout + p.stderr), "言う")


def drill_out(legname: str) -> str:
    """足を1本抜いて対照を回し、出たものを返す。

    **別のプロセスで回す。** `BREAK` は SQL の作りかたを変えるので、
    同じプロセスで切り替えると、前の足の結果を引きずっていないかが言えない。
    """
    p = subprocess.run(
        [sys.executable, "-c",
         "import sys, failed_terminate as f; sys.exit(0 if f.drill() else 1)"],
        cwd=HERE, env={**os.environ, "BREAK": legname},
        capture_output=True, text=True)
    if p.returncode == 0:
        ck(f"BREAK={legname} で対照が落ちる", False, "通ってしまった")
    return p.stdout + p.stderr


def main() -> int:
    print("=== 偽の BigQuery で failed_terminate を動かす（本番には1行も出ない） ===")
    case_pick()
    case_write()
    case_stop()
    case_dry()
    case_drill()
    print()
    if CHECKS == 0:
        print("✕ 数えるものがありませんでした")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} / {CHECKS} 件: {', '.join(FAILED)}")
        return 1
    print(f"○ {CHECKS} 件ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
