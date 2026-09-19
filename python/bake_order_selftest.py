"""焼き込みの**並びが毎晩入れ替わっていないか**と、見張りがそれに騙されないかを見る。

BigQuery も Firestore も引かない。**この箱で回る。**

## なぜ要るか（`docs/island-misses.md` #106）

2026-09-16 の焼き直しで `site/content/` の5本が動いたが、そのうち2本は
**中身が1文字も変わっておらず、並びだけが入れ替わっていた**（空白を除いた
文字の集合が同着）。

困るのは git の差分が汚れることではない。`.github/workflows/rebake.yml` の
step「凍っていないか」が**字面をそのまま比べている**ので、
**並びが毎晩入れ替わるファイルは、中身が何ヶ月凍っていても永遠に `0.0日`** を返す。
`cityStreams.ts` は見張りの表に `(7, ...)` と載っているのに、
**構造上いちども鳴れない見張り**だった。

## 何を見るか

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 1 | `build_city_streams` に同じ行を**別の順で**食わせる | 書き出しが1バイトでも違う |
| 2 | `build_kitchen_talk` に `residents.ts` の並びを**逆で**食わせる | 同上 |
| 3 | 並び替えただけの写しを見張りに食わせる | 見張りが「凍っていない」と言う |
| 4 | 数字を1つ動かした写しを見張りに食わせる | 見張りが「凍っている」と言う |
| 5 | `build_chapter_stats` に住人と明細を**別の順で**食わせる | 書き出しが1バイトでも違う |

## 5 の足（`BREAK=<足>` で1本ずつ抜く）

`docs/island-standards.md` §15 の「対照は、足の数だけ用意する」。
**どれを抜いても同じ1件で落ちるなら、それは1本の足しかない。**

| `BREAK` | 抜くもの | 落ちる項目 |
| --- | --- | --- |
| `nosort` | 住人を並べ直さない（2026-09-19 まで本番がこれ） | 決定的・多い順・同着の順 |
| `notie` | 同着の第2キー（`icon`）だけ外す | 決定的・同着の順 |
| `asc` | 多い順を少ない順にする | 多い順 |
| `nosql` | SQL の `ORDER BY` から第2キーを外す | SQL の字 |
| `nostream` | 明細（`chapterStreams`）の並べ直しを外す | 明細が決定的 |

3 と 4 は**対**で見る。片方だけだと、何でも「凍っている」と言う見張りでも通る。
3 には**直す前の実装**も並べて回す。直す前が `0.0日` と言い、
直したあとが `凍っている` と言うところまで出す（壊し戻し）。

    python3 python/bake_order_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。
"""

from __future__ import annotations

import json
import os
import random
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# `build_chapter_stats` は `config.py` を通るので、`BQ_PROJECT_ID` が無いと
# **import すらできない。** ここは BigQuery を1度も引かない（並びだけを見る）ので、
# 偽の値を置く。他の見張り（`donor_calls_selftest` ほか）と同じ手
os.environ.setdefault("BQ_PROJECT_ID", "bake-order-selftest")

ROOT = Path(__file__).resolve().parent.parent
CITY_TS = ROOT / "site" / "content" / "cityStreams.ts"
RESIDENTS_TS = ROOT / "site" / "content" / "residents.ts"
YML = ROOT / ".github" / "workflows" / "rebake.yml"

# 足を1本ずつ抜くための旗。**当てると対照が落ちる**のを見るためにある
BREAK = os.environ.get("BREAK", "")
LEGS = ("nosort", "notie", "asc", "nosql", "nostream")

fails: list[str] = []


def say(ok: bool, line: str) -> None:
    print(("  OK   " if ok else "  NG   ") + line)
    if not ok:
        fails.append(line)


# ---------------------------------------------------------------- 1. 街の配信


def fake_rows() -> list[dict]:
    """差し込む配信の行。**滞在は本番のもの**（`python/stays.py` が読む表）。

    1つの街につき3本、**同じ日**に置く。うち2本は `st`（開始時刻）まで同着にする。
    同着が残っていると、BigQuery がどちらを先に返すかは回ごとに決まらない——
    それが 2026-09-16 に起きたことなので、そこを差し込みでも再現する。
    """
    from stays import read_all

    rows = []
    seq = 0
    for c in read_all():
        for i, stay in enumerate(c["stays"]):
            if not stay["from"]:
                continue
            for city in stay["cities"]:
                d = stay["from"]
                seq += 1
                for k, hhmm in enumerate(("00:00:00", "05:00:00", "05:00:00")):
                    rows.append(
                        {
                            # 同じ日の中で、1本目だけ早い。2本目と3本目は同着
                            "st": f"{d}T{hhmm}+00:00",
                            "d": d,
                            "video_id": f"{c['slug']}-{i}-{seq:04d}-{k}",
                            "title": f"{city}を歩いた（{k}）",
                        }
                    )
    return rows


def bake_city(rows: list[dict], out: Path, shuffled: bool) -> str:
    """`build_city_streams` を差し込みの行で回して、書き出した字面を返す。"""
    import build_city_streams as m

    keep_out, keep_argv = m.OUT_TS, sys.argv
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
        rowsfile = f.name
    try:
        m.OUT_TS = out
        sys.argv = ["build_city_streams", "--rows", rowsfile]
        m.main()
    finally:
        m.OUT_TS, sys.argv = keep_out, keep_argv
        os.unlink(rowsfile)
    return out.read_text(encoding="utf-8")


def check_city() -> None:
    print("\n1. build_city_streams —— 同じ行を別の順で食わせる")
    rows = fake_rows()
    if not rows:
        print("  数えるものが無い（滞在が1件も読めていない）")
        raise SystemExit(2)
    outs = []
    with tempfile.TemporaryDirectory() as td:
        for seed in (0, 1, 2):
            r = list(rows)
            random.Random(seed).shuffle(r)
            outs.append(bake_city(r, Path(td) / f"o{seed}.ts", True))
        r = sorted(rows, key=lambda v: (v["d"], v["video_id"]), reverse=True)
        outs.append(bake_city(r, Path(td) / "orev.ts", True))
    n = len(set(outs))
    body = json.loads(outs[0][outs[0].index("=\n  {") + 2 : outs[0].rindex("};") + 1])
    streams = sum(len(v) for c in body.values() for v in c.values())
    print(f"  差し込んだ行 {len(rows)} 本 / 4通りの順で焼いた / "
          f"書き出しに出た配信 {streams} 本・{sum(len(c) for c in body.values())} 街")
    say(streams > 0, f"書き出しが空でない（{streams} 本）")
    say(n == 1, f"4通りの順 → 書き出しの種類 {n}（1 なら決定的）")

    # 同じ日の中の並びが「開始時刻 → video_id」になっていること。
    # ただ揃っているだけでなく、**古い順という意味のある並びが保たれている**かを見る
    checked = 0
    bad = 0
    for slug, cities in body.items():
        for city, vids in cities.items():
            for i in range(1, len(vids)):
                a, b = vids[i - 1], vids[i]
                if a["date"] != b["date"]:
                    continue
                checked += 1
                # 差し込みは「（0）が 00:00、（1）と（2）が 05:00 で同着」
                ka = (a["title"][-2], a["videoId"])
                kb = (b["title"][-2], b["videoId"])
                if ka > kb:
                    bad += 1
    print(f"  同じ日どうしの隣り合わせ {checked} 組を見た")
    say(checked > 0, f"同じ日に2本以上ある組が在る（{checked} 組）")
    say(bad == 0, f"古い順のまま、同着は video_id 順（乱れ {bad} 組）")


# ---------------------------------------------------------------- 2. 台所


def bake_kitchen(out: Path, flip: bool) -> str:
    """`build_kitchen_talk` を回す。`flip` で上流の**並びだけ**を裏返す。"""
    import build_kitchen_talk as k

    keep_out, keep_icons, keep_load = k.OUT_TS, k.resident_icons, k.load
    real_icons = keep_icons()

    def icons():
        items = list(real_icons.items())
        return dict(reversed(items)) if flip else dict(items)

    def load(name: str):
        v = keep_load(name)
        if flip and name == "kitchen_residents.json" and isinstance(v, dict):
            return {
                vid: ",".join(reversed(s.split(","))) if isinstance(s, str) else s
                for vid, s in v.items()
            }
        return v

    try:
        k.OUT_TS, k.resident_icons, k.load = out, icons, load
        k.build()
    finally:
        k.OUT_TS, k.resident_icons, k.load = keep_out, keep_icons, keep_load
    return out.read_text(encoding="utf-8")


def check_kitchen() -> None:
    print("\n2. build_kitchen_talk —— residents.ts の並びを裏返して食わせる")
    with tempfile.TemporaryDirectory() as td:
        a = bake_kitchen(Path(td) / "a.ts", flip=False)
        b = bake_kitchen(Path(td) / "b.ts", flip=True)
    folks = re.findall(r"there: \[([^\]]*)\]", a)
    withfolks = [f for f in folks if f.strip()]
    ids = sum(len(f.split(",")) for f in withfolks)
    print(f"  品 {len(folks)} 件 / 住人の出た品 {len(withfolks)} 件 / 住人の id {ids} 個")
    say(len(withfolks) > 0, f"住人の出る品が在る（{len(withfolks)} 件）")
    say(a == b, "上流の並びを裏返しても書き出しが同じ")
    unsorted_ = [f for f in withfolks if [x.strip() for x in f.split(",")] != sorted(x.strip() for x in f.split(","))]
    say(not unsorted_, f"`there` が id 順に並んでいる（並んでいない品 {len(unsorted_)} 件）")


# ---------------------------------------------------------------- 3・4. 見張り


def frozen_py() -> str:
    """rebake.yml に埋めてある step「凍っていないか」を切り出す。

    **step はワークフローの中に埋めてある**（チェックアウトが `ref: master` なので、
    別ファイルにすると枝で試せない）。

    **PyYAML を使わない。** 手元には入っているが、毎晩の焼き直しの箱には入って
    いない（`必要なパッケージのインストール` は BigQuery と Firestore のぶんだけ）。
    ここで `import yaml` していたせいで、手元では通るのに本番で
    `ModuleNotFoundError` を出して落ちた。**この確かめ1つのために、焼き直しへ
    依存を1つ増やさない。** 焼くのを止める係が、関係のない依存で動かなくなる形は
    `bake_down.yml` でも避けている。

    切り出しは字面でやる。`run:` の中のヒアドキュメント（`<<'PY'` 〜 `PY`）を
    そのまま取って、YAML の字下げ（10桁）を落とす。
    """
    text = YML.read_text(encoding="utf-8")
    head = text.index("- name: 凍っていないか")
    lo = text.index("<<'PY'\n", head) + 7
    hi = text.index("\n          PY\n", lo)
    return "\n".join(line[10:] for line in text[lo:hi].split("\n"))


# 直す前の見張り（2026-09-16 まで本番で回っていたもの）。
# **消さずに残す。** 「直った」は、直す前が落ちることまで見て初めて言える
OLD = '''
import re, subprocess, time
STAMP = re.compile(r"^ \\* 数えた日: .*$", re.M)
def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True).stdout
def body(t):
    return STAMP.sub("", t)
def stale_days(path):
    if git("diff", "--name-only", "--", path).strip():
        return 0.0
    cur = body(open(path, encoding="utf-8").read())
    intro = None
    for line in git("log", "-n", "60", "--format=%H %ct", "--", path).splitlines():
        if not line.strip():
            continue
        sha, ts = line.split()
        if body(git("show", f"{sha}:{path}")) != cur:
            break
        intro = int(ts)
    return 0.0 if intro is None else (time.time() - intro) / 86400
import sys
for p in sys.argv[1:]:
    print(f"{p.split('/')[-1]} {stale_days(p):.1f}日")
'''


def city_variant(txt: str, seed: int | None) -> str:
    """`cityStreams.ts` の**並びだけ**を入れ替えた写し。`seed=None` でそのまま。

    入れ替えるのは「同じ街・同じ日」のかたまりの中だけ。
    2026-09-16 に本番で起きた入れ替わりが、57 か所すべてそれだった。
    """
    i = txt.index("=\n  {")
    end = txt.rindex("};")
    obj = json.loads(txt[i + 2 : end + 1])
    if seed is not None:
        rnd = random.Random(seed)
        for cities in obj.values():
            for city, vids in cities.items():
                out, run = [], []
                for v in vids + [None]:
                    if run and (v is None or v["date"] != run[0]["date"]):
                        rnd.shuffle(run)
                        out += run
                        run = []
                    if v is not None:
                        run.append(v)
                cities[city] = out
    return txt[: i + 2] + "  " + json.dumps(obj, ensure_ascii=False, indent=2) + txt[end + 1 :]


def residents_variant(txt: str, seed: int | None) -> str:
    """`residents.ts` の**行の並びだけ**を入れ替えた写し。"""
    lines = txt.split("\n")
    at = [n for n, ln in enumerate(lines) if ln.startswith("  { icon:")]
    if seed is not None and at:
        picked = [lines[n] for n in at]
        random.Random(seed).shuffle(picked)
        for n, ln in zip(at, picked):
            lines[n] = ln
    return "\n".join(lines)


def run_frozen(script: Path, repo: Path, paths: list[str], env_file: Path) -> tuple[str, bool]:
    env = dict(os.environ, GITHUB_ENV=str(env_file))
    env.pop("GITHUB_STEP_SUMMARY", None)
    r = subprocess.run([sys.executable, str(script), *paths], cwd=repo, env=env,
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
        raise SystemExit(f"見張りが落ちた（終了コード {r.returncode}）")
    frozen = "REBAKE_FROZEN=1" in (env_file.read_text() if env_file.exists() else "")
    return r.stdout, frozen


def table(out: str) -> dict[str, str]:
    got = {}
    for line in out.splitlines():
        m = re.match(r"\| (\S+\.ts) \| ([^|]+)\|", line)
        if m:
            got[m.group(1)] = m.group(2).strip()
    return got


def check_watchdog() -> None:
    print("\n3・4. 見張り「凍っていないか」—— 並び替えただけの写しを食わせる")
    city0 = CITY_TS.read_text(encoding="utf-8")
    res0 = RESIDENTS_TS.read_text(encoding="utf-8")

    # **壊していない写しが通ることを先に見る**（`island-misses.md` #99）。
    # 写しを作る途中で壊れても、判定は同じ「変わった」になるので対照にならない
    say(city_variant(city0, None) == city0, "cityStreams.ts の写しが元と1バイトも違わない")
    say(residents_variant(res0, None) == res0, "residents.ts の写しが元と1バイトも違わない")

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        repo, script = td / "repo", td / "frozen.py"
        script.write_text(frozen_py(), encoding="utf-8")
        old = td / "old.py"
        old.write_text(OLD, encoding="utf-8")
        (repo / "site" / "content").mkdir(parents=True)
        subprocess.run(["git", "init", "-q", "-b", "master", str(repo)], check=True)
        for k, v in (("user.email", "a@b.c"), ("user.name", "selftest")):
            subprocess.run(["git", "config", k, v], cwd=repo, check=True)

        days = 12
        for n in range(days):
            (repo / "site/content/cityStreams.ts").write_text(city_variant(city0, n), encoding="utf-8")
            (repo / "site/content/residents.ts").write_text(residents_variant(res0, n), encoding="utf-8")
            when = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - (days - n) * 86400))
            subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-q", "-m", f"焼き直し {n}"], cwd=repo, check=True,
                           env=dict(os.environ, GIT_AUTHOR_DATE=when, GIT_COMMITTER_DATE=when))
        print(f"  {days}晩ぶん、**並び替えただけ**の commit を積んだ（中身は1度も動いていない）")

        paths = ["site/content/cityStreams.ts", "site/content/residents.ts"]

        # 3. いま焼いたぶんも並び替えだけ（commit 前の作業ツリー）
        (repo / paths[0]).write_text(city_variant(city0, 99), encoding="utf-8")
        (repo / paths[1]).write_text(residents_variant(res0, 99), encoding="utf-8")
        diff = subprocess.run(["git", "diff", "--stat", "--", *paths], cwd=repo,
                              capture_output=True, text=True).stdout.strip().splitlines()[-1]
        print(f"  作業ツリーの差分: {diff}")

        oldout = subprocess.run([sys.executable, str(old), *paths], cwd=repo,
                                capture_output=True, text=True).stdout.strip()
        print("  直す前の見張り: " + " / ".join(oldout.splitlines()))
        say(all(x.endswith("0.0日") for x in oldout.splitlines()),
            "直す前は「0.0日」と言う（＝この見張りは構造上いちども鳴れない）")

        out, frozen = run_frozen(script, repo, paths, td / "env1")
        got = table(out)
        print("  直したあとの見張り: " + " / ".join(f"{k} {v}" for k, v in got.items()))
        say(frozen, "直したあとは「凍っている」と言う（REBAKE_FROZEN=1）")
        say(all(float(v.rstrip("日")) >= days - 1.5 for v in got.values()),
            f"最後に中身が変わってから {days - 1} 日以上と読めている")

        # 4. 数字を1つ動かす。**並び替えも同時にかける**（正規化が本物の差まで
        #    潰していないかを見るので、混ぜたほうが厳しい）
        city1 = city_variant(city0, 77)
        before = next(m for m in re.finditer(r'"date": "(\d{4}-\d\d-\d\d)"', city1)
                       if not m.group(1).endswith("9"))
        city1 = city1[: before.start()] + f'"date": "{before.group(1)[:-1]}9"' + city1[before.end():]
        res1 = residents_variant(res0, 77)
        m = re.search(r"^  \{ icon: .*?days: (\d+)", res1, re.M)
        res1 = res1[: m.start(1)] + str(int(m.group(1)) + 1) + res1[m.end(1):]
        (repo / paths[0]).write_text(city1, encoding="utf-8")
        (repo / paths[1]).write_text(res1, encoding="utf-8")
        print(f"  日付を1つ（{before.group(1)} → …9）、日数を1つ（{m.group(1)} → {int(m.group(1)) + 1}）動かした")

        out, frozen = run_frozen(script, repo, paths, td / "env2")
        got = table(out)
        print("  直したあとの見張り: " + " / ".join(f"{k} {v}" for k, v in got.items()))
        say(not frozen, "数字が1つ動いたら「凍っていない」と言う")
        say(all(v == "0.0日" for v in got.values()), "0.0日（この回で変わった）と読めている")


# ------------------------------------------------- 5. 章の住人と、章の配信明細


def fake_resident_rows(chapters: list[dict]) -> tuple[list[dict], dict[str, str]]:
    """差し込む住人の行と、チャンネル → 絵の対応。

    **同着をわざと作る。** 決まっていない同着が残っていることが 2026-09-19 まで
    本番で起きていたことなので、そこを差し込みでも再現する。
    本番の `chapterStats.ts` は住人 149 人のうち 102 人が同着（26 かたまり）で、
    **並びの決まっていない席が 76 あった。**

    絵の名前は、チャンネルIDと**逆の順**になるように付ける。
    同じ並びにすると「チャンネル順でも通ってしまう」ので、
    `icon` を鍵にしていることを確かめられない。
    """
    days_plan = [40, 40, 40, 30, 30, 20, 20, 20, 20, 10, 10, 5]
    n = len(days_plan)
    icon_of = {f"UC{i:09d}": f"icon-{n - 1 - i:02d}" for i in range(n)}
    rows = []
    for c in chapters:
        for i, d in enumerate(days_plan):
            rows.append({"slug": c["slug"], "channel": f"UC{i:09d}", "days": d})
    return rows, icon_of


def fake_stream_rows(chapters: list[dict]) -> list[dict]:
    """差し込む配信明細の行。**同じ日に3本**置いて、同着を残す。"""
    rows = []
    for c in chapters:
        for k in range(3):
            rows.append({
                "slug": c["slug"], "d": c["from"],
                "video_id": f"{c['slug'][:4]}{k}{'x' * (6 - len(str(k)))}"[:11].ljust(11, "z"),
                "title": f"{c['name']}の配信（{k}）", "people": k,
            })
    return rows


def _order_leg():
    """`BREAK` で抜いた住人の並べかた。抜いていなければ `None`（本物を使う）。"""
    if BREAK == "nosort":
        return lambda rs: list(rs)
    if BREAK == "notie":
        return lambda rs: sorted(rs, key=lambda r: -r["days"])
    if BREAK == "asc":
        return lambda rs: sorted(rs, key=lambda r: (r["days"], r["icon"]))
    return None


def bake_stats(rows: list[dict], chapters: list[dict], icon_of: dict[str, str],
               order=None) -> str:
    """`build_chapter_stats` の住人まわりだけを回して、書き出した字面を返す。

    人数と本数は差し込みの定数。**ここで見るのは住人の並びだけ**なので、
    BigQuery も Firestore も引かない。
    """
    import build_chapter_stats as m

    keep = m.order_residents
    if order is not None:
        m.order_residents = order
    try:
        stats = {c["slug"]: {"people": 1, "streams": 2, "residents": []} for c in chapters}
        for slug, rs in m.rows_to_residents(rows, icon_of).items():
            stats[slug]["residents"] = rs
        return m.render(chapters, stats)
    finally:
        m.order_residents = keep


def bake_chapter_streams(rows: list[dict], chapters: list[dict], plain: bool) -> str:
    """明細（`chapterStreams.ts`）を焼いた字面。`plain` で並べ直しを抜く。"""
    import build_chapter_stats as m

    if plain:
        gone = __import__("build_dead_streams").blocked()
        out: dict[str, list] = {c["slug"]: [] for c in chapters}
        for row in rows:
            if row["video_id"] in gone:
                continue
            out[row["slug"]].append([row["d"], row["video_id"], row["title"], int(row["people"])])
        per = out
    else:
        per = m.rows_to_streams(rows, chapters)
    return m.render_streams(per, chapters)


def check_chapter_stats() -> None:
    print("\n5. build_chapter_stats —— 住人と明細を、別の順で食わせる")
    if BREAK:
        print(f"  ** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")
    from build_chapter_stats import read_chapters, residents_sql

    chapters = read_chapters()
    rows, icon_of = fake_resident_rows(chapters)
    if not chapters or not rows:
        print("  数えるものが無い（chapters.ts から章を読めていない）")
        raise SystemExit(2)

    # **分母を出す。** 同着が1組も無ければ、何を並べ替えても差が出ない＝
    # この対照は「何を測っても通る」ものになる（§15）
    tie_seats = 0
    for c in chapters:
        by = {}
        for r in rows:
            if r["slug"] == c["slug"]:
                by.setdefault(r["days"], []).append(r)
        tie_seats += sum(len(v) for v in by.values() if len(v) > 1) - sum(
            1 for v in by.values() if len(v) > 1)
    print(f"  章 {len(chapters)} / 差し込んだ住人 {len(rows)} 人 / "
          f"並びの決まらない席 {tie_seats}")
    if tie_seats == 0:
        print("  数えるものが無い（同着を1組も作れていない）")
        raise SystemExit(2)

    shuffles = []
    for seed in (0, 1, 2):
        r = list(rows)
        random.Random(seed).shuffle(r)
        shuffles.append(r)
    shuffles.append(sorted(rows, key=lambda r: (r["slug"], r["days"], r["channel"]),
                           reverse=True))

    # **壊し戻し。** 直す前（並べ直さない）は、食わせる順で字面が変わる。
    # ここが1通りになるようなら、差し込みのほうが同着を作れていない
    olds = [bake_stats(r, chapters, icon_of, order=lambda rs: list(rs)) for r in shuffles]
    say(len(set(olds)) > 1,
        f"直す前（並べ直さない）は、食わせる順で書き出しが変わる（{len(set(olds))} 通り）")

    outs = [bake_stats(r, chapters, icon_of, order=_order_leg()) for r in shuffles]
    say(len(set(outs)) == 1, f"4通りの順 → 書き出しの種類 {len(set(outs))}（1 なら決定的）")

    # 並びそのものを読む。**「揃っている」だけでなく、意味のある並び**かを見る
    got = re.findall(r'"([a-z-]+)": \{\n    people:.*?residents: \[\n(.*?)\n    \],',
                     outs[0], re.S)
    say(len(got) == len(chapters), f"書き出しに章が {len(got)} 個出ている（{len(chapters)} 個）")
    desc_bad = tie_bad = seen = 0
    for _slug, block in got:
        rs = [(int(d), i) for i, d in
              re.findall(r'icon: "([^"]+)", days: (\d+)', block)]
        seen += len(rs)
        for a, b in zip(rs, rs[1:]):
            if a[0] < b[0]:
                desc_bad += 1
            elif a[0] == b[0] and a[1] > b[1]:
                tie_bad += 1
    print(f"  書き出した住人 {seen} 人 / 隣り合わせ {seen - len(got)} 組を読んだ")
    say(desc_bad == 0, f"多く来た順のまま（乱れ {desc_bad} 組）")
    say(tie_bad == 0, f"同じ日数どうしは icon 順（乱れ {tie_bad} 組）")

    # SQL の字も読む。**Python が並べ直していても、BigQuery の返す順が
    # 回ごとに違えば `--sql` / `--rows` で持ち帰った行が揺れる**
    sql = residents_sql("SELECT 1", ["UCxxxxxxxxxxxxxxxxxxxxxx"])
    if BREAK == "nosql":
        sql = sql.replace("ORDER BY 1, days DESC, channel", "ORDER BY 1, days DESC")
    tail = sql[sql.rindex("ORDER BY"):].strip().split("\n")[0]
    keys = [k.strip() for k in tail[len("ORDER BY"):].split(",")]
    say(len(keys) >= 3, f"SQL の ORDER BY が同着まで決めている（鍵 {len(keys)} 本: {tail}）")

    # 明細のほう（`chapterStreams.ts`）。**`--rows` は渡した順のまま入る**ので、
    # SQL の ORDER BY だけでは足りない
    srows = fake_stream_rows(chapters)
    souts = []
    for seed in (0, 1, 2):
        r = list(srows)
        random.Random(seed).shuffle(r)
        souts.append(bake_chapter_streams(r, chapters, plain=(BREAK == "nostream")))
    ids = len(re.findall(r'^\s*\["', souts[0], re.M))
    print(f"  明細に差し込んだ行 {len(srows)} 本 / 書き出しに出た {ids} 本")
    say(ids > 0, f"明細の書き出しが空でない（{ids} 本）")
    say(len(set(souts)) == 1, f"明細も 3通りの順 → 書き出しの種類 {len(set(souts))}")


def main() -> int:
    if BREAK and BREAK not in LEGS:
        print(f"BREAK={BREAK} は足の名前ではありません。使えるのは {', '.join(LEGS)}")
        return 2
    check_city()
    check_kitchen()
    check_watchdog()
    check_chapter_stats()
    print()
    if fails:
        print(f"落ちた: {len(fails)} 件")
        for f in fails:
            print("  - " + f)
        return 1
    print("通った")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
