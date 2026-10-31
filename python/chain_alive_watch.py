"""**繋ぎ（`workflow_run`）が生きているかを、名前と実績の両方から当てる。**

    python3 python/chain_alive_watch.py             # 5つぜんぶ（GitHub の API を読む）
    python3 python/chain_alive_watch.py --offline   # ネットに出ない2つだけ
    python3 python/chain_alive_watch.py --days 3    # 「走っていない」と言うまでの日数

終了コード 0=通った / 1=見つかった / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

## なぜ要るか

`CLAUDE.md` にこう書いてある。

> **繋ぎはワークフローの `name:` で解決される。** あちらの名前を変えると
> 黙って切れる。**赤くならない。走らなくなるだけ。**

`python/workflow_link_selftest.py` が、**名前の side** を毎 PR で当てている。
ここはその続き——**名前が合っていても死ぬ3通り**を足す。

| 切れかた | 名前の見張りで止まるか | ここで止まるか |
| --- | --- | --- |
| 繋ぎ先の `name:` を書き換えた | ○ | ○（借りて出す） |
| 繋ぎ先そのものが**走らなくなった**（止めた・消した・鍵が切れた） | ✕ 名前は在る | ○ [3] |
| 繋ぎは在るのに、こちらが**一度も起きていない** | ✕ | ○ [4] |
| `conclusion` で絞ってしまい、**赤い晩だけ落ちる** | ✕ | ○ [2] |
| **受け皿は起きるので、1本目の繋ぎが死んでも緑に見える** | ✕ | ○ [5] |

4つ目がいちばん見つからない。繋ぎ先は毎晩走り、こちらも**ほとんどの晩は**
起きるので、一覧を見ても何もおかしくない。`schedule_fetch_chat.yml` は
**「表に無い どねID が投げ銭してきた」晩だけ** 最後の step が `exit 1` で
終わる——あれは失敗ではなく**呼び出し**で、BigQuery には入っている。
`conclusion == 'success'` で絞ると、**呼び出しの出た晩だけ焼かれない。**
月に何度かしか起きないので、気づくのは数字が古いと言われたとき。

## 「走っていない」と言うまでの日数（既定 3日）

**実測から決めた**（2026-10-14。GitHub の API から数えた）。

| 数えたもの | n | 中央の間隔 | **いちばん空いた間隔** |
| --- | ---: | ---: | ---: |
| 繋ぎ先5本の、連続する run の間隔 | 824 | 0.04〜1.00日 | **1.22日**（`Fetch YouTube Chat Data`） |
| 繋ぎを持つ13本の、**繋ぎで起きた回**の間隔 | 661 | 0.03〜0.99日 | **1.10日** |

いちばん空いたところで 1.22日。定時そのものの遅れは**最長 8.0時間**
（= 0.33日）で、上の間隔はその遅れを含んだ値。
**3日は、いちばん空いた間隔の 2.5倍。** 1日ぶん落としても赤くならず、
2晩つづけて落ちたら赤くなる。

**短くしない。** このリポジトリの定時は「もう来ないはず」と判断するまで
**最低5時間**みる決まりで（`CLAUDE.md`）、2日にすると
「遅れている晩」と「切れている」の区別がつかなくなる。

## [5] 繋ぎ1本ずつ（2026-10-15 に足した。#865）

[4] は「このファイルが**何かの**繋ぎで起きたか」しか見ない。だから
**受け皿を持つものは、1本目の繋ぎが死んでいても緑になる。**

実例がこの issue（#865）。`ship_down.yml` の1本目は `Firebase Hosting Deploy`
で、コメントにも「読む元は1本目の run」と書いてあるのに、**毎晩の配りに
対しては一度も発火していなかった**——毎晩の配りは `rebake.yml` の中から
`GITHUB_TOKEN` で押していて、GitHub の再帰よけでその完了が次を起こさないから。
それでもチャットとどねるの受け皿が毎晩起こすので、[4] は通ってしまう。

[5] は**どの上流の完了と時刻がそろったか**を寄せる。見るのは
**無人で終わった上流だけ**——そこが #865 の芯で、2026-10-15 に run を
1本ずつ寄せたら（`ship_down.yml` が在った期間・3分窓・1対1・帰属不明0件）

| 誰が押した配りか | 下流を起こした | 起こさなかった |
| --- | ---: | ---: |
| `Ayato-kosaka`（手で押した） | **90回** | 0回 |
| `github-actions[bot]`（毎晩のぶん） | **0回** | **72回** |

だった。**手押しを混ぜて平均すると、半分が生きているので生きて見える。**

上流が `PAIR_MIN` 本に満たない繋ぎは判定しない（0/0 を「死んでいる」と
読むのがいちばん悪い嘘。§15）。1本も判定できなければ **2 に倒す。**

**赤くするのは 0件のときだけ。そのために窓を詰めてある。** 窓を 10分 に
すると、死んでいる繋ぎでも受け皿が起こした下流がたまたま入って **4/12** に
なり、0件の判定をすり抜ける。窓を 3分 に詰めると **0/12** まで落ちて、
健全な 22本は満点のまま（上の `PAIR_AFTER` の表）。
**窓の幅が、この判定の足そのもの。**

## 対照

`python/chain_alive_watch_selftest.py` が、**作り物の run の表**を差し込んで
毎 PR で回している（ネットには出ない）。ここが落ちられることは、
本物の数字を見る前に向こうで確かめてある。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **名前の突き合わせは借りる。** ここに書き写すと、`on:` の読み方
# （PyYAML が `on:` を `True` にする癖）が2か所に散って、片方だけ直した日に
# 黙ってずれる。あちらが読み方と対照を持っていて、ここは結果を使うだけ
from workflow_link_selftest import audit, name_of, triggers, wanted  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
WFDIR = REPO / ".github" / "workflows"
API = "https://api.github.com"

# 既定の日数。上の表のとおり、実測のいちばん空いた間隔（1.22日）の 2.5倍
DAYS = 3

# 繋ぎ先1本につき API を2回まで。13本＋5本で 36回に届かない
PER_PAGE = 1

# [5]（繋ぎ1本ずつ）で使う窓。**上流が終わってから下流が出来るまで。**
#
# 前にもはみ出させてあるのは、**下流が先に出来ることが実際にあるから**。
# 配りは `workflow_run` では毎晩のぶんが届かないので、自分の最後の job から
# `gh workflow run` で押している（#865）。押した時点では配りはまだ走っていて、
# 下流のほうが**2分ほど先に**出来る（押したあと run が増えたかを見ている）。
#
# **うしろの幅は実測で決めた**（2026-10-15。直近3日の本物の run に、幅を
# 1/2/3/5/10/15分 と振って当てた）:
#
# | うしろの幅 | 満点の繋ぎ | 欠けた繋ぎ |
# | --- | ---: | --- |
# | 1・2・3分 | **22本** | 配り → `ship_down` が **0/12** |
# | 5分 | 22本 | 1/12 |
# | 10・15分 | 22本 | **4/12** |
#
# 健全な繋ぎは `workflow_run` が数秒で run を作るので、**3分でも満点のまま。**
# 広げると、受け皿（チャット・どねる）が起こした下流がたまたま窓に入って、
# **死んでいる繋ぎが 4/12 に見える。** 広い窓は、見たいものを隠す側に倒れる。
PAIR_BEFORE = timedelta(minutes=3)
PAIR_AFTER = timedelta(minutes=3)

# 1本の繋ぎを判定するのに要る、上流の完了の数。
# **0本や1本で「死んでいる」と言わない**（`docs/island-standards.md` §15）
PAIR_MIN = 2

# **赤くするのは 0件のときだけ。** 1回でも起きていれば緑。
#
# 「満点でなければ赤」にしない理由は2つ。
#
# 1. **直した翌朝に、master が赤いまま残る。** 窓は3日あるので、繋ぎ直しても
#    古い取りこぼしが2日ぶら下がる。**毎回出る赤は、本物の赤を埋める**
# 2. **半端に効かない壊れ方は、ここより先に出る。** 配りは下流を押したあと
#    run が増えたかまで見て、増えなければ**その場で赤くなる**。ここが受け持つ
#    のは「**静かに、まるごと走らなくなった**」ほうだけ
#
# 割合そのものは `seen["rates"]` に残して毎回印字する。満点を割った繋ぎは
# 目で見える（実測では、健全な 22本がぜんぶ満点だった）
PAIR_DEAD = 0

# [5] で一度に引く run の本数。3日ぶんを覆えればよい
PAIR_PAGE = 100

# **「無人で終わった」上流とみなす event。** `ship_down.py` と同じ決め
BOT = "github-actions[bot]"
UNATTENDED_EVENTS = ("schedule", "workflow_run")


def repo_name() -> str:
    """どのリポジトリを読むか。Actions の中では環境が教えてくれる。"""
    return os.environ.get("GITHUB_REPOSITORY") or "Ayato-kosaka/live-streaming"


def token() -> str:
    return os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""


def load_docs() -> dict[str, dict]:
    """`.github/workflows/*.yml` を全部読む。読めない1本で 2 に倒す。"""
    wfs = sorted(WFDIR.glob("*.yml")) + sorted(WFDIR.glob("*.yaml"))
    docs: dict[str, dict] = {}
    for wf in wfs:
        rel = wf.relative_to(REPO).as_posix()
        docs[rel] = yaml.safe_load(wf.read_text(encoding="utf-8")) or {}
    return docs


def conclusion_gates(doc: dict) -> list[str]:
    """**`conclusion` で絞っている `if:` を挙げる。**

    拾うのは job と step の `if:` だけ。`run:` の中の字は拾わない
    ——`ticket_stock.yml` のように**ログに出すだけ**のものが在って、
    あれは絞っていない（出すのは正しい。何がこの run を起こしたかが残る）。

    `if:` に出たら、それは**走るか走らないかを決めている。**
    繋ぎ先の `conclusion` でそれを決めてよい理由はこのリポジトリには無い。
    """
    out: list[str] = []
    jobs = doc.get("jobs") if isinstance(doc, dict) else None
    if not isinstance(jobs, dict):
        return out
    for jname, job in jobs.items():
        if not isinstance(job, dict):
            continue
        cond = job.get("if")
        if isinstance(cond, str) and "workflow_run.conclusion" in cond:
            out.append(f"job「{jname}」の if:")
        for i, step in enumerate(job.get("steps") or []):
            if not isinstance(step, dict):
                continue
            cond = step.get("if")
            if isinstance(cond, str) and "workflow_run.conclusion" in cond:
                label = step.get("name") or step.get("uses") or f"{i + 1}本目"
                out.append(f"job「{jname}」の step「{label}」の if:")
    return out


def ts(s: str) -> datetime:
    """GitHub の時刻を読む。**2通りの形で返ってくる。**

    run は `2026-10-13T23:49:36Z`、ワークフローそのものは
    `2026-09-11T04:06:25.000+02:00`（**UTC ですらない**）。`%Y-…Z` だけで
    読むと、新顔を数えないところで落ちて、**本物の数字を1つも出さずに
    終わる**（実際に踏んだ）。どちらも `fromisoformat` が読む。
    """
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


class Gh:
    """GitHub を読む口。**読むだけ**（1バイトも書かない）。"""

    def __init__(self, repo: str, tok: str):
        self.repo = repo
        self.tok = tok

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(API + path)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        if self.tok:
            req.add_header("Authorization", f"Bearer {self.tok}")
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
        return json.loads(raw) if raw else {}

    def latest(self, wf_file: str, event: str = "") -> dict | None:
        """そのワークフローの、いちばん新しい run を1本。無ければ None。

        **ファイル名で引く**（`name:` は人が変える。変えられたことを
        ここで見たいのに、変えられる側で引いたら意味がない）。
        """
        f = urllib.parse.quote(Path(wf_file).name)
        q = f"/repos/{self.repo}/actions/workflows/{f}/runs?per_page={PER_PAGE}"
        if event:
            q += f"&event={urllib.parse.quote(event)}"
        got = self._get(q)
        runs = got.get("workflow_runs") or [] if isinstance(got, dict) else []
        return runs[0] if runs else None

    def recent(self, wf_file: str) -> list[dict]:
        """そのワークフローの run を、新しい順に `PAIR_PAGE` 本。

        [5] は**時刻を寄せる**ので、1本では足りない。引くのは
        `created_at` / `updated_at` / `status` / `event` / 押した主だけ。
        """
        f = urllib.parse.quote(Path(wf_file).name)
        got = self._get(f"/repos/{self.repo}/actions/workflows/{f}"
                        f"/runs?per_page={PAIR_PAGE}")
        return got.get("workflow_runs") or [] if isinstance(got, dict) else []

    def made_on(self) -> dict[str, str]:
        """**ワークフローが GitHub に出来た日を、1回で全部**。新顔を赤くしないため。

        1本ずつ引くと13回になる。ここは一覧で1回（この箱で、丸ごと 20秒 → 12秒）。
        返す鍵は `.github/workflows/xxx.yml`（API が `path` で返す形そのまま）。
        """
        got = self._get(f"/repos/{self.repo}/actions/workflows?per_page=100")
        out: dict[str, str] = {}
        for w in (got.get("workflows") or [] if isinstance(got, dict) else []):
            path, made = w.get("path"), w.get("created_at")
            if isinstance(path, str) and isinstance(made, str):
                out[path] = made
        return out


def live_table(docs: dict[str, dict], gh: Gh) -> dict[str, dict]:
    """本物の GitHub から、判定に要るぶんだけ引いてくる。

    返すのは `{ワークフローのファイル: {...}}`。**ここだけが外に出る。**
    下の `judge()` は表を受け取るだけなので、対照は作り物の表を差せる。
    """
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    targets = sorted({w for p in linked for w in wanted(docs[p]) if w in names})

    made = gh.made_on()
    table: dict[str, dict] = {}
    # 繋ぎ先は「いつでもいいから最後に走ったのはいつか」。手で押した回も数える
    # ——**生きているか**を見ているので、何が起こしたかは問わない
    for want in targets:
        path = names[want]
        row = table.setdefault(path, {})
        if path not in made:
            # **GitHub がまだ知らないワークフロー**（この PR で足したばかり）。
            # 引きにいくと 404 で落ちて、**本物の数字を1つも出さずに 2** になる
            row["absent"] = True
            continue
        last = gh.latest(path)
        row["last"] = last.get("created_at") if last else None
    # こちらは「**繋ぎで**起きたのはいつか」。手押しや cron の回を数えると、
    # 保険の cron が毎朝拾っているぶんで、切れた繋ぎが隠れる
    for path in linked:
        row = table.setdefault(path, {})
        row["created"] = made.get(path)
        if path not in made:
            row["absent"] = True
            continue
        bychain = gh.latest(path, event="workflow_run")
        row["by_chain"] = bychain.get("created_at") if bychain else None
    return table


def unattended_run(r: dict) -> bool:
    """その run を起こしたのに、**押した人がいなかったか。**

    `ship_down.py` と同じ決め。event で分かるものと、`github-actions[bot]` が
    押したもの。**配りには `workflow_dispatch` しか無い**ので、event だけ見ると
    毎晩のぶんが全部「手押し」に化ける。
    """
    if r.get("event") in UNATTENDED_EVENTS:
        return True
    who = (r.get("triggering_actor") or r.get("actor") or {}).get("login")
    return who == BOT


def live_pairs(docs: dict[str, dict], gh: Gh) -> dict:
    """[5] のために、**上流の完了**と**下流の run 作成**を引いてくる。

    返すのは
    `{"ups": {繋ぎ先の name: [{"end":…, "nobody": bool}]},
      "downs": {下流のファイル: {"at": [...], "oldest": …}}}`。
    **ここだけが外に出る。** `judge_pairs()` は表を受け取るだけ。
    """
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    targets = sorted({w for p in linked for w in wanted(docs[p]) if w in names})

    made = gh.made_on()

    ups: dict[str, list[dict]] = {}
    for want in targets:
        if names[want] not in made:
            continue          # GitHub がまだ知らない。下で「新顔」に落ちる
        rows = []
        for r in gh.recent(names[want]):
            if r.get("status") != "completed":
                continue
            end = r.get("updated_at")
            if end:
                rows.append({"end": end, "nobody": unattended_run(r)})
        ups[want] = rows

    downs: dict[str, dict] = {}
    for p in linked:
        if p not in made:
            downs[p] = {"at": [], "oldest": None, "absent": True}
            continue
        at = [r.get("created_at") for r in gh.recent(p) if r.get("created_at")]
        downs[p] = {"at": at, "oldest": min(at) if at else None}
    # **新顔を赤くしないための材料。** [4] と同じ決めを [5] にも効かせる
    # （`judge_pairs` が使う。作り物の表を差すときは省いてよい＝ぜんぶ古株）
    return {"ups": ups, "downs": downs, "made": made}


def judge_pairs(docs: dict[str, dict], pairs: dict, days: int,
                now: datetime) -> tuple[list[str], dict]:
    """**繋ぎ1本ずつ**が生きているかを、時刻を寄せて当てる。→ (挙がった行, 数)

    [4]（このファイルが**何かの**繋ぎで起きたか）では届かないところを埋める。
    受け皿を持つものは、1本目が死んでいても受け皿が毎晩起こすので
    [4] は緑になる——`ship_down.yml` が実際にそうだった（#865）。

    **判定するのは「無人で終わった上流」だけ。** 手で押した回は、押した人が
    その場で見ている。そして #865 の芯がまさにそこで、**人が押した配りは
    90/90 で下流を起こし、bot が押した配りは 0/72** だった。
    手押しを混ぜて平均すると、**半分が生きているので生きて見える。**

    数が足りない繋ぎ（上流が `PAIR_MIN` 本に満たない）は**判定しない。**
    0/0 を「死んでいる」と読むのがいちばん悪い嘘（§15）。

    Args:
        docs: ワークフローの YAML
        pairs: `live_pairs()` の形の表
        days: さかのぼる日数
        now: いまの時刻

    Returns:
        (挙がった1行たち, {"judged": 判定した繋ぎ, "thin": 数が足りず判定しなかった繋ぎ,
                          "missing": 答えの返らなかった繋ぎ, "ok": 生きていた繋ぎ,
                          "rates": [(下流, 上流, 起きた数, 上流の数)]})
    """
    rows: list[str] = []
    seen = {"judged": 0, "thin": 0, "missing": 0, "ok": 0, "new": 0, "rates": []}
    limit = now - timedelta(days=days)
    ups_t = (pairs or {}).get("ups") or {}
    downs_t = (pairs or {}).get("downs") or {}
    # **新顔は数えない。** [4] に在る決めが、ここには無かった——
    # だから繋ぎを1本足した PR は、[4] を通っても [5] で必ず赤くなった
    # （足した当日は、無人の上流が終わったのに下流がまだ1回も起きていない）。
    # 作り物の表を差すときは省いてよい（＝ぜんぶ古株とみなす）
    made_t = (pairs or {}).get("made") or {}
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}

    for p in linked:
        down = downs_t.get(p)
        born = made_t.get(p)
        # `absent` は **GitHub がまだ知らないファイル**（`created_at` すら
        # 返ってこないので、`born` では拾えない）
        if (down and down.get("absent")) or (born and ts(born) > limit):
            # 繋ぎの本数ぶん「見ていない」に数える（0 に混ぜない。§15）
            seen["new"] += len(wanted(docs[p]))
            continue
        for want in wanted(docs[p]):
            if want not in names:
                continue          # 名前の切れは [1] の仕事
            up = ups_t.get(want)
            # **表に行が無いのと、行が在って run が 0本なのは別物。**
            # GitHub が空を返した朝に「ぜんぶ切れている」と言わない
            if up is None or down is None:
                seen["missing"] += 1
                continue

            # 下流の引きが3日ぶんを覆っていなければ、覆っているところまでで見る
            # （100本で足りない繋ぎが出ても、黙って 0/0 にしない）
            floor = limit
            oldest = down.get("oldest")
            if oldest and ts(oldest) > floor:
                floor = ts(oldest)

            ends = [ts(u["end"]) for u in up
                    if u.get("nobody") and floor <= ts(u["end"]) <= now]
            if len(ends) < PAIR_MIN:
                seen["thin"] += 1
                continue

            at = sorted(ts(x) for x in down.get("at") or [])
            hit = sum(1 for e in ends
                      if any(e - PAIR_BEFORE <= d <= e + PAIR_AFTER for d in at))
            seen["judged"] += 1
            seen["rates"].append((p, want, hit, len(ends)))
            if hit <= PAIR_DEAD:
                rows.append(
                    f"繋ぎ「{want}」→ {p} は、無人の上流が {len(ends)}回 終わって"
                    f"**一度も起きていない**（{days}日）。`workflow_run` は"
                    f"GITHUB_TOKEN が起こした run からは連鎖しない"
                    f"——そこが切れていないか")
            else:
                seen["ok"] += 1
    return rows, seen


def judge(docs: dict[str, dict], table: dict[str, dict], days: int,
          now: datetime) -> tuple[list[str], dict]:
    """表を当てる。→ (挙がった1行たち, 数えたものの数)

    **数も返す。** 0件が「ぜんぶ通った」なのか「1本も見ていない」なのかは、
    挙がった側からは区別できない（`docs/island-standards.md` §15）。
    """
    rows: list[str] = []
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    targets = sorted({w for p in linked for w in wanted(docs[p]) if w in names})
    limit = now - timedelta(days=days)
    seen = {"links": 0, "targets": 0, "downstream": 0, "new": 0, "missing": 0}

    for p in linked:
        seen["links"] += len(wanted(docs[p]))

    # [3] 繋ぎ先が、直近◯日に走っているか
    for want in targets:
        path = names[want]
        row = table.get(path)
        # **表に行が無いのと、行が在って run が 0 本なのは別物。**
        # 前者は「GitHub から答えが返らなかった」で、**数えられていない**。
        # ここを一緒にすると、API が空を返した朝に **23本ぜんぶ切れている**と
        # 言う——いちばん悪い嘘（対照 [5] がこれを毎回当てている）
        if row is None:
            seen["missing"] += 1
            continue
        if row.get("absent"):
            # **GitHub がまだ知らない**（同じ PR で足した繋ぎ先）。
            # 足した当日に赤くすると「足したから赤い」が常態になって、
            # 本物の切れが埋もれる（[4] の「新顔は数えない」と同じ決め）
            seen["new"] += 1
            continue
        last = row.get("last")
        seen["targets"] += 1
        who = ", ".join(sorted(p for p in linked if want in wanted(docs[p])))
        if not last:
            rows.append(f"繋ぎ先「{want}」（{path}）は run が1本も無い。"
                        f"ここに繋いでいる {len(who.split(', '))}本は一度も起きない: {who}")
            continue
        when = ts(last)
        if when < limit:
            age = (now - when).total_seconds() / 86400
            rows.append(f"繋ぎ先「{want}」（{path}）が {age:.1f}日 走っていない"
                        f"（{days}日まで）。繋いでいるのは: {who}")

    # [4] 繋ぎを持つ側が、**繋ぎで**起きているか
    for p in linked:
        row = table.get(p)
        if row is None:
            seen["missing"] += 1
            continue
        made = row.get("created")
        # **新顔は数えない。** 足した当日の PR で赤くなると、
        # 「足したから赤い」が常態になって、本物の切れが埋もれる。
        # **GitHub がまだ知らないもの**（この PR で足したファイル）も新顔——
        # あちらは `created_at` すら返ってこないので、`made` では拾えない
        if row.get("absent") or (made and ts(made) > limit):
            seen["new"] += 1
            continue
        seen["downstream"] += 1
        by = row.get("by_chain")
        if not by:
            rows.append(f"{p} は `workflow_run` で起きた run が1本も無い"
                        f"（繋ぎ先: {' / '.join(wanted(docs[p]))}）")
            continue
        when = ts(by)
        if when < limit:
            age = (now - when).total_seconds() / 86400
            rows.append(f"{p} が繋ぎで起きたのは {age:.1f}日前（{days}日まで）"
                        f"。繋ぎ先: {' / '.join(wanted(docs[p]))}")

    return rows, seen


def main() -> int:
    ap = argparse.ArgumentParser(description="繋ぎ（workflow_run）が生きているか")
    ap.add_argument("--days", type=int, default=DAYS,
                    help=f"「走っていない」と言うまでの日数（既定 {DAYS}）")
    ap.add_argument("--offline", action="store_true",
                    help="ネットに出ない2つ（名前・conclusion）だけ見る")
    args = ap.parse_args()

    if not WFDIR.is_dir():
        print("!! .github/workflows が無い。数えるものが無い")
        return 2
    try:
        docs = load_docs()
    except yaml.YAMLError as e:
        print(f"!! ワークフローが読めない: {e}")
        return 2
    if not docs:
        print("!! ワークフローが1本も無い。数えるものが無い")
        return 2

    linked = sorted(p for p in docs if wanted(docs[p]))
    name_rows, links = audit(docs)
    if links == 0:
        print("!! 繋ぎ（workflow_run）が1本も無い。**数えるものが無い**")
        return 2

    print(f"ワークフロー {len(docs)}本 / 繋ぎを持つもの {len(linked)}本 / 繋ぎ {links}本")
    for p in linked:
        print(f"   {p} → {' / '.join(wanted(docs[p]))}")
    print()

    ng = 0

    # [1] 名前。`workflow_link_selftest.py` から借りて、同じ画面に出す
    if name_rows:
        print(f"[1] ✕ 行き先の無い繋ぎが {len(name_rows)}件")
        for r in name_rows:
            print(f"      {r['row']}")
        ng += 1
    else:
        print(f"[1] ○ 繋ぎ {links}本、ぜんぶ実在する name: を指している")

    # [2] `conclusion` で絞っていないか
    gated = []
    for p in linked:
        for where in conclusion_gates(docs[p]):
            gated.append(f"{p} の {where} が繋ぎ先の conclusion を見ている")
    if gated:
        print(f"[2] ✕ `conclusion` で絞っている繋ぎが {len(gated)}件")
        for g in gated:
            print(f"      {g}")
        print("      繋ぎ先の最後の step は『表に無い どねID が投げ銭してきた』晩に")
        print("      exit 1 で終わる。あれは失敗ではなく呼び出しで、数字は入っている")
        ng += 1
    else:
        print(f"[2] ○ 繋ぎを持つ {len(linked)}本、どれも conclusion で絞っていない")

    if args.offline:
        print()
        print("（--offline。実績は見ていない）")
        return 1 if ng else 0

    tok = token()
    if not tok:
        print("!! GITHUB_TOKEN が無い。実績を数えられない")
        return 2
    gh = Gh(repo_name(), tok)
    try:
        table = live_table(docs, gh)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as e:
        print(f"!! GitHub が読めない: {e}。**実績を数えられない**")
        return 2

    now = datetime.now(timezone.utc)
    try:
        rows, seen = judge(docs, table, args.days, now)
    except ValueError as e:
        # 時刻が読めないなら**数えられていない。** ここを 1 で返すと、
        # 「切れている」と「読めなかった」が同じ赤になる
        print(f"!! GitHub が返した時刻が読めない: {e}。**実績を数えられない**")
        return 2
    if seen["missing"] or seen["targets"] == 0 or seen["downstream"] == 0:
        print(f"!! 数えられた繋ぎ先 {seen['targets']}本 / 繋ぎを持つ側 "
              f"{seen['downstream']}本 / 答えの返らなかったもの {seen['missing']}本。"
              "**0件を通さない**")
        return 2

    live = [r for r in rows if r.startswith("繋ぎ先")]
    down = [r for r in rows if not r.startswith("繋ぎ先")]
    if live:
        print(f"[3] ✕ 直近{args.days}日に走っていない繋ぎ先が {len(live)}件")
        for r in live:
            print(f"      {r}")
        ng += 1
    else:
        print(f"[3] ○ 繋ぎ先 {seen['targets']}本、ぜんぶ直近{args.days}日に走っている")
        for want in sorted({w for p in linked for w in wanted(docs[p])}):
            path = next((q for q, d in docs.items() if name_of(q, d) == want), None)
            last = (table.get(path) or {}).get("last") if path else None
            if last:
                age = (now - ts(last)).total_seconds() / 86400
                print(f"      {want}: {last}（{age:.2f}日前）")

    if down:
        print(f"[4] ✕ 直近{args.days}日に**繋ぎで**起きていないものが {len(down)}件")
        for r in down:
            print(f"      {r}")
        ng += 1
    else:
        print(f"[4] ○ 繋ぎを持つ {seen['downstream']}本、ぜんぶ直近{args.days}日に"
              f"繋ぎで起きている" + (f"（新顔 {seen['new']}本は数えていない）"
                                     if seen["new"] else ""))
        for p in linked:
            made = (table.get(p) or {}).get("created")
            fresh = "（新顔。数えていない）" if made and ts(made) > now - timedelta(
                days=args.days) else ""
            by = (table.get(p) or {}).get("by_chain")
            if by:
                age = (now - ts(by)).total_seconds() / 86400
                print(f"      {p}: {by}（{age:.2f}日前）{fresh}")
            else:
                print(f"      {p}: 繋ぎで起きた run はまだ無い{fresh}")

    # [5] **繋ぎ1本ずつ。** [4] は受け皿に隠れる（#865 がそれ）
    try:
        pairs = live_pairs(docs, gh)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as e:
        print(f"!! GitHub が読めない: {e}。**繋ぎ1本ずつを数えられない**")
        return 2
    try:
        prows, pseen = judge_pairs(docs, pairs, args.days, now)
    except ValueError as e:
        print(f"!! GitHub が返した時刻が読めない: {e}。**繋ぎ1本ずつを数えられない**")
        return 2
    if pseen["judged"] == 0:
        print(f"!! 繋ぎ1本ずつを1本も判定できなかった"
              f"（数が足りない {pseen['thin']}本 / 新顔 {pseen['new']}本 / "
              f"答えの返らなかったもの {pseen['missing']}本）。**0件を通さない**")
        return 2
    if prows:
        print(f"[5] ✕ 無人の上流に対して死んでいる繋ぎが {len(prows)}件")
        for r in prows:
            print(f"      {r}")
        ng += 1
    else:
        print(f"[5] ○ 繋ぎ {pseen['judged']}本、無人の上流が終わったあとに"
              f"ちゃんと起きている"
              + (f"（数が足りず見ていない {pseen['thin']}本）"
                 if pseen["thin"] else "")
              + (f"（新顔なので数えていない {pseen['new']}本）"
                 if pseen["new"] else ""))
    for p, want, hit, tot in sorted(pseen["rates"]):
        print(f"      {want} → {p}: {hit}/{tot}")

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ 繋ぎはぜんぶ生きている")
    return 0


if __name__ == "__main__":
    sys.exit(main())
