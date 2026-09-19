"""**偽の BigQuery と偽の測りで、`failed_reentry` の振る舞いを実際に動かして確かめる。**

    python3 python/admin/failed_reentry_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**本番にも資格情報にも触らない。ネットにも出ない。** 本物の SQL
（`select_sql()` / `update_sql()`）をそのまま sqlite に当てるので、確かめて
いるのは「字面が正しそうか」ではなく**その SQL が本番と同じ形の表から何を選び、
何を書き換えるか。**

## 何を見るか

| | 見るもの | 落ちたら |
| --- | --- | --- |
| 1 | 非公開の印を持つ `FAILED` と **`SKIPPED`** を拾い、他の理由は拾わない | 1 |
| 2 | **下見は1バイトも書かない**（口に `SELECT` 以外が来ない・表が前後で同一） | 1 |
| 3 | ぜんぶ測れて戻すものが無ければ **0**、測れなかったぶんが残れば **2** | 1 |
| 4 | 戻すのは「押せば見られる」ものだけ（非公開・録画なし・消えた・測れずは戻さない） | 1 |
| 5 | 書き換わるのは `status` と `next_retry_at` **だけ**（試行回数も理由も動かない） | 1 |
| 6 | **枠が埋まっている晩は1行も書かない。** 空きが3本なら3本 | 1 |
| 7 | 空いていても**1回 `MAX_PER_RUN` 本まで** | 1 |
| 8 | 二度流すと、戻したものはもう候補に居ない | 1 |
| 9 | **枠が測れなかった回は1行も書かない**（「空いていた」と読まない） | 1 |
| 10 | 測る側の対照が落ちたら、**表を1行も引かずに 2** | 1 |
| 11 | 枠の混み具合を、**本物の `QUERY_SELECT_TARGET_VIDEOS` に聞いている** | 1 |
| 12 | 対照（`drill()`）が通る。`BREAK=` で足を抜くと、**その足の対照が落ちる** | 1 |
| 13 | 知らない足の名前は落とす | 1 |
| 14 | **毎晩ぶんの口**（`failed_reentry_nightly.yml` が渡す ARGS）で回すと、実際に書く | 1 |
| 15 | その口で回しても、**1回 `MAX_PER_RUN` 本まで**（上限を外すと12本入る＝対照） | 1 |
| 16 | その口で回しても、**枠が埋まっている晩は1行も書かない** | 1 |

**6 と 7 がこの道具のいちばん危ないところ。** 戻した古い配信は
`late` の枠（1晩 20本）の**先頭に並ぶ**ので、一度に戻すと本物の取りこぼしが
何晩も後ろへ回る（`docs/island-misses.md` #149）。

**12 は「6つ当てた」を「6つの足を見た」と読まないため**（#128 の決めごと1）。
見るのは**抜いた足に対応する対照が落ちること**で、「それだけが落ちること」では
ない（足を抜くと巻き添えで落ちる対照もある）。

## 14〜16 — **繋ぎかたの側**（2026-09-19。毎晩ひとりでに走る形にした回）

1〜13 は「この道具を `{"apply": true}` で呼んだら正しく動くか」。
**呼ぶ側が正しく呼んでいるかは、そこには出ない。** 毎晩の
`.github/workflows/failed_reentry_nightly.yml` が下見のまま回っていても、
`{"limit": 1}` を足していても、1〜13 はぜんぶ通る。

だから 14〜16 は**ワークフローの `run:` から ARGS の字をそのまま取り出して**、
その字で本物の `main()` を回す。繋ぎが `{}` に戻った日も、上限が外れた日も、
ここで落ちる。

**両側から当てる**（`docs/island-standards.md` §15）。

| | 守りを外したら落ちること | 出してよいもので落ちないこと |
| --- | --- | --- |
| 14 | 下見の枝の `{}` では**1行も書かない** | 毎晩ぶんの口では `MAX_PER_RUN` 本書く |
| 15 | `MAX_PER_RUN` を外すと **12本**入る | 外さなければ `MAX_PER_RUN` 本で止まる |
| 16 | — | 枠が埋まっていれば**0本**（`{"apply": true}` でも書かない） |

繋ぎそのもの（`workflow_run` の相手・既定・cron の保険）は
`python/failed_reentry_nightly_selftest.py` の受け持ち。
ここが見るのは**渡している ARGS が本物に何をさせるか**だけ。
"""

import json
import os
import re
import sqlite3
import subprocess
import sys
import types
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# 毎晩ひとりでに回す側。**ここから ARGS の字をそのまま取り出す**（写経しない）
NIGHTLY = (Path(HERE).parent.parent / ".github" / "workflows"
           / "failed_reentry_nightly.yml")

# `config.py` は、この環境変数が無いと読み込みの時点で落ちる。
# 下で作るクライアントは偽物なので**本物の名前は要らない**が、
# 無いと確かめそのものが起動できない。**手元の値は上書きしない**
os.environ.setdefault("BQ_PROJECT_ID", "failed-reentry-selftest")
os.environ.pop("BREAK", None)
os.environ.pop("ARGS", None)

import failed_reentry as fr  # noqa: E402
import dead_stream_watch as watch  # noqa: E402
from bq.queries import QUERY_SELECT_TARGET_VIDEOS  # noqa: E402

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
    def __init__(self, rows, affected=None):
        self._rows = rows
        self.num_dml_affected_rows = affected

    def result(self):
        return self._rows


class FakeClient:
    """本物の SQL を受け取って sqlite で回す。**来た問い合わせを全部覚える。**

    枠を数える問い合わせ（`LANE_SQL`）だけは、`COUNTIF` も `TIMESTAMP_SUB` も
    差し込みも sqlite では回らないので、**仕込んだ答え**を返す。
    枠の本数をどう使うかは `plan()` の側で見る（対照 C と、下の 6 / 7）。
    """

    def __init__(self, rows: list[tuple], late_n: int = 0, all_n: int = 0,
                 lane_raises: bool = False):
        self.con = sqlite3.connect(":memory:")
        self.con.execute("CREATE TABLE videos (" + ", ".join(fr.COLUMNS) + ")")
        self.con.executemany(
            "INSERT INTO videos VALUES (" + ", ".join("?" * len(fr.COLUMNS)) + ")",
            rows,
        )
        self.seen: list[str] = []
        self.lane: list[tuple] = []
        self.late_n = late_n
        self.all_n = all_n
        self.lane_raises = lane_raises

    def query(self, sql, *a, **k):
        self.seen.append(sql)
        if "COUNTIF" in sql:
            self.lane.append((sql, k.get("job_config")))
            if self.lane_raises:
                raise RuntimeError("枠が数えられない（仕込み）")
            return _Job([{"late_n": self.late_n, "all_n": self.all_n}])
        s = fr.to_sqlite(sql)
        cur = self.con.execute(s)
        if s.strip().upper().startswith("SELECT"):
            names = [d[0] for d in cur.description]
            return _Job([dict(zip(names, r)) for r in cur.fetchall()])
        self.con.commit()
        return _Job([], cur.rowcount)

    # -- 確かめる側が使うもの ------------------------------------------------

    def dump(self) -> list[tuple]:
        return list(self.con.execute(
            "SELECT " + ", ".join(fr.COLUMNS) + " FROM videos ORDER BY video_id"))

    def writes(self) -> list[str]:
        return [q for q in self.seen
                if "COUNTIF" not in q and not q.strip().upper().startswith("SELECT")]


def run(rows: list[tuple], kinds: dict, apply: bool = False, late_n: int = 0,
        lane_raises: bool = False, control_ok: bool = True,
        args: dict | None = None) -> tuple[int, FakeClient]:
    """偽の BigQuery と偽の測りを差し込んで `main()` を最後まで動かす。"""
    fake = FakeClient(rows, late_n=late_n, all_n=late_n, lane_raises=lane_raises)

    # `from google.cloud import bigquery` を偽物に向ける。
    # **本物が入っていない箱でも回る**（毎 PR で走るので、そこは要らない）
    mod = types.ModuleType("google.cloud.bigquery")
    mod.Client = lambda project=None: fake
    mod.QueryJobConfig = lambda query_parameters=None: {"params": query_parameters}
    mod.ScalarQueryParameter = lambda name, kind, value: (name, kind, value)
    cloud = sys.modules.get("google.cloud") or types.ModuleType("google.cloud")
    cloud.bigquery = mod
    sys.modules["google.cloud"] = cloud
    sys.modules["google.cloud.bigquery"] = mod

    # **ネットに出ない。** 測る側は仕込みで置き換える
    fr.measure = lambda vids: {v: watch.Probe(v, kinds.get(v, watch.BLIND), "（仕込み）")
                               for v in vids if v in kinds}
    fr.control = lambda: (control_ok, ["  （仕込みの対照）"])

    a = dict(args or {})
    if apply:
        a["apply"] = True
    os.environ["ARGS"] = repr(a).replace("'", '"').replace("True", "true")
    try:
        code = fr.main()
    finally:
        os.environ.pop("ARGS", None)
    return code, fake


# ============================================================================
# 仕込み
# ============================================================================

def rows_mixed() -> list[tuple]:
    """本番と同じ形。非公開の `FAILED` 4本・`SKIPPED` 1本と、拾わない4本。"""
    rows, _ = fr.fixture()
    return rows


def rows_many(n: int = 12) -> list[tuple]:
    """非公開の `FAILED` を n 本。**`first_seen_at` は全部同じ値**（#149 の組）。"""
    return [fr._row(f"BACK{i:07d}", "FAILED", "private",
                    seen="2026-05-30 10:05:41", tried=None) for i in range(n)]


def by_id(dump: list[tuple]) -> dict[str, tuple]:
    return {r[0]: r for r in dump}


def nightly_args() -> dict:
    """毎晩ひとりでに回す側が渡す ARGS を、**ワークフローの字から取り出す。**

    写経すると、あちらを直した日にここが古いまま通る。
    **取り出せなかったら 2 で落とす**（「渡していない」と同じ顔にしない）。
    """
    if not NIGHTLY.exists():
        die(f"{NIGHTLY} がありません。毎晩ぶんの口を確かめられません")
    text = NIGHTLY.read_text(encoding="utf-8")
    # 実行の step の、`else`（＝下見でない枝）に在る ARGS。
    # コメント行は落としてから探す（説明の中の同じ字を拾わない）
    body = "\n".join(ln for ln in text.splitlines()
                      if not ln.lstrip().startswith("#"))
    found = re.findall(r"ARGS='(\{[^']*\})'\s+python failed_reentry\.py", body)
    if len(found) != 2:
        die(f"実行の枝が2本見つかりません（{len(found)} 本）。"
            "下見の枝と書く枝の ARGS を取り出せません")
    dry_raw, wet_raw = found
    try:
        dry, wet = json.loads(dry_raw), json.loads(wet_raw)
    except ValueError as e:
        die(f"ARGS が JSON として読めません（{e}）: {dry_raw} / {wet_raw}")
    if not isinstance(dry, dict) or not isinstance(wet, dict):
        die(f"ARGS が辞書ではありません: {dry_raw} / {wet_raw}")
    return {"dry": dry, "wet": wet}


def die(why: str) -> None:
    """**数えるものが無い。** 判定を1つも出さずに 2。"""
    print(f"✕ 数えるものがありません: {why}")
    raise SystemExit(2)


# ============================================================================

def main() -> int:
    print("[failed_reentry の見張り] 偽の BigQuery と偽の測りで動かす")

    # 1 / 2 / 4: 下見。拾う相手と、1バイトも書かないこと
    mixed = rows_mixed()
    kinds = {
        "PRIV0000000": watch.OK,
        "PRIV0000001": watch.PRIVATE,
        "PRIV0000002": watch.NO_REC,
        "PRIV0000003": watch.GONE,
        "PRIVSKIP00A": watch.OK,
    }
    code, fake = run(mixed, kinds)
    ck("1 非公開の FAILED と SKIPPED だけを拾う（他の理由は拾わない）",
       code == 1 and len(fake.writes()) == 0, f"終了コード {code}")
    ck("2 下見は口に SELECT 以外を1つも出さない", fake.writes() == [],
       f"書きに行った回数 {len(fake.writes())}")
    ck("2 下見のあと、表が1行も変わっていない",
       by_id(fake.dump()) == by_id(FakeClient(mixed).dump()), "前後で一致")

    # 3: ぜんぶ測れて戻すものが無ければ 0 ／ 測れなかったぶんが残れば 2
    code, _ = run(mixed, {v: watch.PRIVATE for v in kinds})
    ck("3 ぜんぶ測れて戻すものが無ければ 0", code == 0, f"終了コード {code}")
    code, _ = run(mixed, {v: watch.BLIND for v in kinds})
    ck("3 測れなかったぶんが残れば 2（0本と言わない）", code == 2, f"終了コード {code}")

    # 4 / 5: apply。戻すのは OK のものだけで、動くのは status と next_retry_at だけ
    code, fake = run(mixed, kinds, apply=True)
    after = by_id(fake.dump())
    before = by_id(FakeClient(mixed).dump())
    back = sorted(v for v, r in after.items() if r[1] == "WAITING" and before[v][1] != "WAITING")
    ck("4 戻したのは「押せば見られる」2本だけ", back == ["PRIV0000000", "PRIVSKIP00A"],
       f"{len(back)} 本 / 終了コード {code}")
    ck("4 非公開・録画なし・消えた行は1つも動かない",
       all(after[v] == before[v] for v in
           ("PRIV0000001", "PRIV0000002", "PRIV0000003", "NOCHAT0000A",
            "NOREC00000A", "PRIVWAIT00A", "SUCCEEDED0A")),
       "動かず")
    moved = [v for v in back
             if after[v][2:] != before[v][2:] or after[v][3] is not None]
    ck("5 動いたのは status と next_retry_at だけ（試行回数も理由も残る）",
       not moved and all(after[v][4] == before[v][4] and after[v][6] == before[v][6]
                         and after[v][7] == before[v][7] for v in back),
       f"よけいに動いた {len(moved)} 行")

    # 6: 枠が埋まっている晩は1行も書かない／空きが3本なら3本
    many = rows_many()
    allok = {f"BACK{i:07d}": watch.OK for i in range(12)}
    code, fake = run(many, allok, apply=True, late_n=fr.LATE_LANE_MAX_VIDEOS)
    ck("6 枠が埋まっている晩は1行も書かない",
       fake.writes() == [] and code == 1, f"書いた回数 {len(fake.writes())} / 終了コード {code}")
    code, fake = run(many, allok, apply=True, late_n=fr.LATE_LANE_MAX_VIDEOS - 3)
    got = [v for v, r in by_id(fake.dump()).items() if r[1] == "WAITING"]
    ck("6 空きが3本なら3本だけ戻す", len(got) == 3, f"{len(got)} 本")

    # 7: 空いていても1回 MAX_PER_RUN 本まで
    code, fake = run(many, allok, apply=True, late_n=0)
    got = sorted(v for v, r in by_id(fake.dump()).items() if r[1] == "WAITING")
    ck("7 空いていても1回 %d 本まで" % fr.MAX_PER_RUN,
       len(got) == fr.MAX_PER_RUN and code == 0, f"{len(got)} 本 / 終了コード {code}")

    # 8: 二度流すと、戻したものはもう候補に居ない
    left = [r for r in fake.dump()]
    code2, fake2 = run(left, allok, apply=True, late_n=0)
    again = sorted(v for v, r in by_id(fake2.dump()).items() if r[1] == "WAITING")
    ck("8 二度流しても、前に戻したものは二度戻さない",
       set(got) < set(again) and len(again) == fr.MAX_PER_RUN * 2,
       f"のべ {len(again)} 本")

    # 9: 枠が測れなかった回は1行も書かない
    code, fake = run(many, allok, apply=True, lane_raises=True)
    ck("9 枠が測れなかった回は1行も書かない",
       fake.writes() == [] and code == 1,
       f"書いた回数 {len(fake.writes())} / 終了コード {code}")

    # 10: 測る側の対照が落ちたら、表を1行も引かずに 2
    code, fake = run(many, allok, apply=True, control_ok=False)
    ck("10 測る側の対照が落ちたら、表を1行も引かずに 2",
       code == 2 and fake.seen == [], f"終了コード {code} / 問い合わせ {len(fake.seen)} 回")

    # 11: 枠の混み具合を、本物のクエリに聞いている
    _, fake = run(many, allok, late_n=0)
    lane = fake.lane[0][0] if fake.lane else ""
    ck("11 枠の混み具合を、本物の QUERY_SELECT_TARGET_VIDEOS に聞いている",
       QUERY_SELECT_TARGET_VIDEOS.strip() in lane,
       f"枠を数えた回数 {len(fake.lane)} / 本物のまま {QUERY_SELECT_TARGET_VIDEOS.strip() in lane}")
    names = [p[0] for p in ((fake.lane[0][1] or {}).get("params") or [])] if fake.lane else []
    ck("11 枠の上限を、両方とも差し込んでいる",
       sorted(names) == ["max_late_videos", "max_videos"], names)

    # 12 / 13: 対照の足
    ck("12 対照（drill）が通る", fr.drill(), "通った")
    want = {"select": "A", "kind": "B", "cap": "C", "blind": "D", "order": "E", "dry": "F"}
    for name, tag in want.items():
        env = dict(os.environ, BREAK=name)
        out = subprocess.run(
            [sys.executable, "-c", "import failed_reentry as fr; fr.drill()"],
            cwd=HERE, env=env, capture_output=True, text=True)
        ng = [ln for ln in (out.stdout + out.stderr).splitlines() if " NG " in ln]
        mine = [ln for ln in ng if f" {tag} " in ln]
        ck(f"12 足 {name} を抜くと、対照 {tag} が落ちる", bool(mine) and bool(ng),
           f"落ちた対照 {len(ng)} 件")
    env = dict(os.environ, BREAK="nosuchleg")
    out = subprocess.run(
        [sys.executable, "-c", "import failed_reentry as fr; fr.drill()"],
        cwd=HERE, env=env, capture_output=True, text=True)
    ck("13 知らない足の名前は落とす",
       out.returncode != 0 and "BREAK に使えるのは" in (out.stdout + out.stderr),
       f"終了コード {out.returncode}")

    # 14 / 15 / 16: **毎晩ひとりでに回す側の口**で、本物を動かす。
    # 1〜13 は「正しく呼べば正しく動くか」で、**呼ぶ側が正しいか**はそこに出ない
    lanes = nightly_args()
    print(f"  --   毎晩ぶんの口: 下見の枝 {lanes['dry']} / 書く枝 {lanes['wet']}"
          f"（{NIGHTLY.name} から取り出した字）")

    _, fake = run(many, allok, args=lanes["dry"], late_n=0)
    ck("14 下見の枝の ARGS では1行も書かない（対照）",
       fake.writes() == [], f"書きに行った回数 {len(fake.writes())}")

    code, fake = run(many, allok, args=lanes["wet"], late_n=0)
    got = sorted(v for v, r in by_id(fake.dump()).items() if r[1] == "WAITING")
    ck("14 毎晩ぶんの ARGS で回すと、実際に WAITING へ返す",
       len(got) > 0 and code == 0, f"{len(got)} 本 / 終了コード {code}")
    ck("15 毎晩ぶんの ARGS でも、1回 %d 本まで" % fr.MAX_PER_RUN,
       len(got) == fr.MAX_PER_RUN, f"{len(got)} 本 / 候補 {len(many)} 本")

    # 15 の対照。**上限を外したら、同じ口で候補ぜんぶが選ばれる。**
    # 外して何も変わらないなら、上の「5本だった」は上限が効いた証拠にならない。
    #
    # ここだけ `main()` ではなく `plan()` に当てる。`MAX_PER_RUN` を差し替えると
    # **`drill()` の対照 C がそれ自体で落ちて**、本物の表を1行も引かずに 2 で
    # 帰ってしまう（つまり「書かれなかった」の理由が2つになって、
    # 上限が効いたのかどうかが読めなくなる）。選ぶところだけを見る
    lim = lanes["wet"].get("limit")
    rows12 = fr.run_sqlite(many)
    probes12 = fr._probes({r["video_id"]: watch.OK for r in rows12})
    tight, _, _ = fr.plan(rows12, probes12, lane_busy=0, limit=lim)
    keep = fr.MAX_PER_RUN
    try:
        fr.MAX_PER_RUN = 99
        loose, _, _ = fr.plan(rows12, probes12, lane_busy=0, limit=lim)
    finally:
        fr.MAX_PER_RUN = keep
    ck("15 同じ口で選ばれるのは %d 本" % fr.MAX_PER_RUN,
       len(tight) == fr.MAX_PER_RUN, f"{len(tight)} 本")
    ck("15 上限を外すと、同じ口で候補ぜんぶ（%d 本）が選ばれる（対照）" % len(many),
       len(loose) == len(many), f"{len(loose)} 本")

    code, fake = run(many, allok, args=lanes["wet"],
                     late_n=fr.LATE_LANE_MAX_VIDEOS)
    ck("16 毎晩ぶんの ARGS でも、枠が埋まっている晩は1行も書かない",
       fake.writes() == [] and code == 1,
       f"書いた回数 {len(fake.writes())} / 終了コード {code}")

    print("─" * 68)
    if not CHECKS:
        print("**数えるものがありませんでした**")
        return 2
    if FAILED:
        print(f"落ちました: {len(FAILED)} / {CHECKS} 件")
        for name in FAILED:
            print(f"  - {name}")
        return 1
    print(f"通りました: {CHECKS} 件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
