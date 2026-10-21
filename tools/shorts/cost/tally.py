#!/usr/bin/env python3
"""**担当（エージェント）ごとに、使ったトークンと時間を数え、段ごとの表にする。** 要るのは Python だけ。

    python3 tools/shorts/cost/tally.py                          # いちばん新しいセッション。今日（UTC）の担当
    python3 tools/shorts/cost/tally.py --since 2026-10-21       # その日から
    python3 tools/shorts/cost/tally.py --match 'critic|批評'     # 説明の字で絞る
    python3 tools/shorts/cost/tally.py --runs <critic.py の控え.jsonl>   # `claude -p` で回した批評役も並べる
    python3 tools/shorts/cost/tally.py --json                   # 表ではなく1担当1行の JSON

終了コード 0=数えた / 2=数えるものが無い（0 を答えにしない）。

## どこを読むか

- **担当の記録**: `~/.claude/projects/<作業場所>/<セッション>/subagents/agent-<id>.jsonl`（と `.meta.json` の説明の字）。
  `/tmp/claude-0/<作業場所>/<セッション>/tasks/<id>.output` はこれへの symlink なので、実体で1つに数える
- **まとめ役**: セッション本体の `<セッション>.jsonl`
- **担当の終わりの数**: 本体に届く `<task-notification>` の `<usage>`（`subagent_tokens`・`duration_ms`）

## 数えかた（読み違えやすい所）

- **1回の呼び出しは、記録では中身の塊ごとに何行にも分かれる**（思考・本文・道具で3行など）。どの行も同じ `usage` を
  持つので、`message.id` で1つにまとめる。まとめないと入力が2〜3倍に数わる
- **記録の `output_tokens` は、書き始めの値（多くは 1〜16）で、書き終わりの数ではない。** だから出力は見積もる。
  思考は暗号の署名（`signature`）だけが残り、その長さが思考の量に比例する。**担当の終わりの数**
  （`subagent_tokens` − 最後の呼び出しの入力 = 最後の呼び出しの本当の出力）で、署名の字数と見える字数（本文・道具の入力）
  からの換算を、その場で最小二乗で合わせる（`calibrate`。合わせた係数と外れの中央値を表の下に出す）
- **「表示のトークン」**は `subagent_tokens`（Claude Code が担当の終わりに「N tokens」と出す数）。最後の呼び出しの
  入力＋出力で、**その担当の文脈がどこまで膨らんだか**。払った量はキャッシュ読みの合計のほうが近い
- **生成の時間**: 呼び出しごとに「直前の行（道具の結果など）→ その呼び出しの最後の塊」を足したもの。
  残りは道具を待っていた時間。批評役は、ほぼ全部が生成（1回の思考で 11分、など）

## 段の分けかた

担当の説明の字（`.meta.json` の `description`）を `STAGES` の順に当て、最初に当たった段にする。
当たらなければ「その他」。説明は英語のことが多いので、英語と日本語の両方を並べてある。
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import statistics
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HOME = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
PROJECTS = HOME / "projects"

# 段の名前 → 説明の字に当てる正規表現（上から順に当てる。批評役を原稿より先に見る）
STAGES = (
    ("批評", re.compile(r"critic|批評|関所|gate", re.I)),
    ("原稿", re.compile(r"script|editor|編集長|作文|原稿|story|pattern|draft", re.I)),
    ("書き出し", re.compile(r"render|build|cut|caption|bgm|cta|check|still|similar|voice|clip|ingest|frame|"
                         r"書き出し|声|検査|取り込み", re.I)),
    ("投稿", re.compile(r"post|schedule|upload|public|tiktok|youtube|投稿|予約", re.I)),
)
MAIN = "まとめ役"
CLI = "批評（claude -p）"

TS = re.compile(r'"timestamp":"([^"]+)"')
NOTE = re.compile(r"<task-id>(a[0-9a-f]+)</task-id>.*?<status>(\w+)</status>.*?"
                  r"<subagent_tokens>(\d+)</subagent_tokens><tool_uses>(\d+)</tool_uses><duration_ms>(\d+)</duration_ms>",
                  re.S)

# 頼まれるのを待っていたとみなす、新しい頼みの前のあいだ（秒）
IDLE = 600

# 校正の材料が足りないときの係数（2026-10-21 のセッションで、批評役ほか 99人から合わせた値）
FALLBACK = (0.30, 0.70)


@dataclass
class Call:
    id: str
    inp: int = 0
    cr: int = 0
    cw: int = 0
    sig: int = 0       # 思考の署名の字数
    vis: int = 0       # 本文と道具の入力の字数
    t0: str = ""       # 直前の行（道具の結果など）の時刻
    gen: float = 0.0   # 生成の秒（直前の行 → この呼び出しの最後の塊）
    out: float = 0.0   # 出力の見積もり（あとで入れる）

    @property
    def prompt(self) -> int:
        return self.inp + self.cr + self.cw


@dataclass
class Agent:
    id: str
    desc: str
    stage: str
    calls: list = field(default_factory=list)
    start: str = ""
    end: str = ""
    shown: int | None = None        # subagent_tokens（表示のトークン）
    dur_ms: int | None = None       # 担当の終わりの数の時間（続きを送られた担当では、最後の1回ぶんだけ）
    active: float = 0.0             # 動いていた秒（read_calls）
    models: set = field(default_factory=set)
    out_true_last: int | None = None

    def total(self, k: str) -> int:
        return sum(getattr(c, k) for c in self.calls)

    @property
    def out(self) -> int:
        return round(sum(c.out for c in self.calls))

    @property
    def seconds(self) -> float:
        """動いていた秒。記録から数えられないときだけ、終わりの数の時間。"""
        if self.active:
            return self.active
        if self.dur_ms is not None:
            return self.dur_ms / 1000
        return _secs(self.start, self.end)

    @property
    def gen(self) -> float:
        return sum(c.gen for c in self.calls)

    @property
    def last_ctx(self) -> int:
        """表示のトークン。通知が無ければ、最後の呼び出しの入力＋見積もりの出力。"""
        if self.shown is not None:
            return self.shown
        if not self.calls:
            return 0
        return round(self.calls[-1].prompt + self.calls[-1].out)


def _dt(s: str) -> datetime | None:
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    # `--until 2026-10-21T15:00` のような時差の無い字は UTC として読む（記録の時刻は全部 Z 付き）
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _secs(a: str, b: str) -> float:
    x, y = _dt(a), _dt(b)
    return (y - x).total_seconds() if x and y else 0.0


def stage_of(desc: str) -> str:
    for name, pat in STAGES:
        if pat.search(desc or ""):
            return name
    return "その他"


def read_calls(path: Path, since: str = "", until: str = "") -> tuple:
    """記録を読み、呼び出し（message.id で1つ）・最初と最後の時刻・使ったモデル・動いていた秒を返す。

    大きな行（道具の結果）は JSON として読まない。時刻だけ正規表現で拾う（本体は 100MB を超える）。
    **呼び出しの行かどうかは、行ぜんぶの字で見てから JSON で確かめる。** 行の頭だけを見ると、道具の入力
    （`wireToolInputs`）が前に長く付いた行を取りこぼす（批評役の 11分の思考が、それで1回消えた）。

    動いていた秒: 行と行のあいだを足す。ただし **次の行が新しい頼み（道具の結果でない user の行）で、
    あいだが IDLE 秒を越えるところ**は、頼まれるのを待っていた時間なので足さない（続きを送られた担当・まとめ役）。
    思考の長い呼び出し（次の行が assistant）は、何分でも足す。
    """
    calls: dict = {}
    order: list = []
    first = last = ""
    prev_ts = ""          # 直前の、呼び出しでない行の時刻
    active = 0.0          # since〜until の中だけ足す（まとめ役は1日じゅう動いているので、窓で切る）
    models: set = set()
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = TS.search(line[:4000]) or TS.search(line[-4000:])
            ts = m.group(1) if m else ""
            is_call = '"type":"assistant"' in line
            d = None
            if is_call:
                try:
                    d = json.loads(line)
                except ValueError:
                    d = None
                is_call = isinstance(d, dict) and d.get("type") == "assistant"
            inside = bool(ts) and (not since or ts >= since) and (not until or ts < until)
            if ts:
                if last and inside:
                    gap = _secs(last, ts)
                    # 続きの頼み（SendMessage・まとめ役からの知らせ）は isMeta の user の行で届く。それも「頼み」に数える
                    prompt = not is_call and '"type":"user"' in line[:3000] and '"tool_use_id"' not in line
                    if gap > 0 and not (prompt and gap > IDLE):
                        active += gap
                first = first or ts
                last = ts
            if not is_call:
                if ts:
                    prev_ts = ts
                continue
            if ts and not inside:
                continue
            msg = d.get("message") or {}
            mid = msg.get("id")
            if not mid:
                continue
            if mid not in calls:
                u = msg.get("usage") or {}
                calls[mid] = Call(mid, u.get("input_tokens") or 0, u.get("cache_read_input_tokens") or 0,
                                  u.get("cache_creation_input_tokens") or 0, t0=prev_ts or ts)
                order.append(mid)
                if msg.get("model"):
                    models.add(msg["model"])
            c = calls[mid]
            for b in msg.get("content") or []:
                t = b.get("type")
                if t == "thinking":
                    c.sig += len(b.get("signature") or "") + len(b.get("thinking") or "")
                elif t == "text":
                    c.vis += len(b.get("text") or "")
                elif t == "tool_use":
                    c.vis += len(json.dumps(b.get("input"), ensure_ascii=False))
            if ts:
                c.gen = max(c.gen, _secs(c.t0, ts))
    return [calls[i] for i in order], first, last, models, active


def _first_ts(path: Path) -> str:
    """記録の最初の時刻（日付で切るのに、ぜんぶ読まずに済ませる）。"""
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = TS.search(line[:4000])
            if m:
                return m.group(1)
    return ""


def read_notes(session: Path) -> dict:
    """本体に届いた担当の終わりの数。同じ担当に何通も来たら、completed の最後を採る。"""
    out: dict = {}
    if not session.exists():
        return out
    with open(session, encoding="utf-8", errors="replace") as f:
        for line in f:
            if "<subagent_tokens>" not in line:
                continue
            for m in NOTE.finditer(line.replace("\\n", "\n")):
                aid, status = m.group(1), m.group(2)
                rec = (status, int(m.group(3)), int(m.group(4)), int(m.group(5)))
                if status == "completed" or aid not in out or out[aid][0] != "completed":
                    out[aid] = rec
    return out


def calibrate(agents: list) -> tuple:
    """最後の呼び出しの本当の出力で、出力 ≈ a×署名の字数 + b×見える字数 を最小二乗で合わせる。

    Returns:
        (a, b, 使った人数, 外れの中央値（比）)。材料が3人未満なら FALLBACK
    """
    pts = [(a.calls[-1].sig, a.calls[-1].vis, a.out_true_last) for a in agents
           if a.calls and a.out_true_last is not None and a.out_true_last > 0]
    if len(pts) < 3:
        return FALLBACK[0], FALLBACK[1], len(pts), None
    sxx = sum(x * x for x, _, _ in pts)
    syy = sum(y * y for _, y, _ in pts)
    sxy = sum(x * y for x, y, _ in pts)
    sxz = sum(x * z for x, _, z in pts)
    syz = sum(y * z for _, y, z in pts)
    det = sxx * syy - sxy * sxy
    if det == 0:
        return FALLBACK[0], FALLBACK[1], len(pts), None
    a = (sxz * syy - syz * sxy) / det
    b = (syz * sxx - sxz * sxy) / det
    errs = [abs(a * x + b * y - z) / z for x, y, z in pts]
    return a, b, len(pts), statistics.median(errs)


def project_dir(cwd: str) -> Path:
    return PROJECTS / re.sub(r"[^A-Za-z0-9]", "-", cwd)


def newest_session(pdir: Path) -> Path | None:
    cands = sorted(pdir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    return cands[0] if cands else None


def load(session: Path, since: str = "", until: str = "", match: str = "", main: bool = True) -> list:
    """セッション1つぶんの担当とまとめ役を読む（`since`・`until` は担当の始まりで切る）。"""
    sid = session.stem
    sub = session.parent / sid / "subagents"
    tasks = Path(f"/tmp/claude-{os.getuid()}") / session.parent.name / sid / "tasks"
    paths: dict = {}
    for p in list(sub.glob("agent-*.jsonl")) + list(tasks.glob("a*.output")):
        try:
            real = p.resolve()
        except OSError:
            continue
        if real.exists():
            paths.setdefault(str(real), p)
    notes = read_notes(session)
    pat = re.compile(match, re.I) if match else None
    agents = []
    for real in sorted(paths):
        aid = re.sub(r"^agent-", "", Path(real).stem)
        meta = Path(real).with_name(Path(real).stem + ".meta.json")
        desc, kind = aid, ""
        try:
            mj = json.loads(meta.read_text(encoding="utf-8"))
            desc, kind = mj.get("description") or aid, mj.get("agentType") or ""
        except (OSError, ValueError):
            pass
        if pat and not pat.search(desc):
            continue
        head = _first_ts(Path(real))
        if (since and head < since) or (until and head >= until):
            continue
        calls, first, last, models, active = read_calls(Path(real))
        if not calls:
            continue
        a = Agent(aid, desc, stage_of(desc), calls, first, last, models=models, active=active)
        n = notes.get(aid)
        # 通知の数が最後の呼び出しの入力より小さいなら、途中（裏の仕事を待つあいだ）の通知。表示にも校正にも使わない
        if n and n[0] == "completed" and 0 < n[1] - calls[-1].prompt < 128000:
            a.shown, a.dur_ms = n[1], n[3]
            a.out_true_last = n[1] - calls[-1].prompt
        agents.append(a)
    if main and not pat:
        calls, first, last, models, active = read_calls(session, since, until)
        if calls:
            agents.append(Agent(sid[:8], "まとめ役（セッション本体）", MAIN, calls, calls[0].t0 or first, last,
                                models=models, active=active))
    return agents


def load_runs(path: Path) -> list:
    """`tools/shorts/script/critic.py` の控え（1行1回）を、担当と同じ形にする。"""
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(line)
        except ValueError:
            continue
        u = r.get("usage") or {}
        c = Call(r.get("id", "run"), u.get("input_tokens") or 0, u.get("cache_read_input_tokens") or 0,
                 u.get("cache_creation_input_tokens") or 0)
        c.out = u.get("output_tokens") or 0
        c.gen = (r.get("duration_api_ms") or 0) / 1000
        a = Agent(r.get("id", "run"), r.get("label", "claude -p"), CLI, [c], r.get("start", ""), r.get("end", ""),
                  models={r.get("model", "")})
        a.shown = c.prompt + round(c.out)
        a.dur_ms = r.get("duration_ms")
        out.append(a)
    return out


def fmt_n(n: float) -> str:
    return f"{round(n):,}"


def fmt_t(s: float) -> str:
    s = round(s)
    return f"{s // 3600}時間{s % 3600 // 60:02d}分" if s >= 3600 else f"{s // 60}分{s % 60:02d}秒"


def table(agents: list, cal: tuple, title: str) -> str:
    out = [f"## {title}", ""]
    order = [MAIN, "原稿", "批評", CLI, "書き出し", "投稿", "その他"]
    out += ["| 段 | 担当 | 呼び出し | 入力 | キャッシュ読み | キャッシュ書き | 出力（見積もり） | 1人の表示のトークン 中央値（最小〜最大） | 1人の出力 中央値 | 時間の計 | 1人の時間 中央値（最小〜最大） | うち生成 |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |"]
    for st in order:
        g = [a for a in agents if a.stage == st]
        if not g:
            continue
        shown = [a.last_ctx for a in g]
        secs = [a.seconds for a in g]
        gen = sum(a.gen for a in g)
        out.append(f"| {st} | {len(g)} | {sum(len(a.calls) for a in g):,} | {fmt_n(sum(a.total('inp') for a in g))} | "
                   f"{fmt_n(sum(a.total('cr') for a in g))} | {fmt_n(sum(a.total('cw') for a in g))} | "
                   f"{fmt_n(sum(a.out for a in g))} | {fmt_n(statistics.median(shown))}（{fmt_n(min(shown))}〜{fmt_n(max(shown))}） | "
                   f"{fmt_n(statistics.median([a.out for a in g]))} | "
                   f"{fmt_t(sum(secs))} | {fmt_t(statistics.median(secs))}（{fmt_t(min(secs))}〜{fmt_t(max(secs))}） | {fmt_t(gen)} |")
    out += ["", "| 始め（UTC） | 段 | 担当 | 呼び出し | 入力＋キャッシュ | 出力（見積もり） | 表示のトークン | 時間 | うち生成 |",
            "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for a in sorted(agents, key=lambda a: a.start):
        out.append(f"| {a.start[5:16].replace('T', ' ')} | {a.stage} | {a.desc[:60]} | {len(a.calls):,} | "
                   f"{fmt_n(a.total('inp') + a.total('cr') + a.total('cw'))} | {fmt_n(a.out)} | {fmt_n(a.last_ctx)} | "
                   f"{fmt_t(a.seconds)} | {fmt_t(a.gen)} |")
    a_, b_, n_, err = cal
    out += ["", f"出力の見積もり: 出力 ≈ {a_:.3f}×思考の署名の字数 ＋ {b_:.3f}×本文と道具の入力の字数"
                f"（{n_}人の最後の呼び出しで合わせた。外れの中央値 {err:.0%}）" if err is not None else
            f"出力の見積もり: 既定の係数（{a_}・{b_}）。合わせる材料が {n_}人しか無い"]
    return "\n".join(out)


def session_cwd() -> str:
    """記録の置き場の名前になる作業場所。担当の worktree（`.claude/worktrees/<名>`）から回しても、
    記録はまとめ役のセッションを始めた本体の場所の名前で置かれるので、そこまで戻す。"""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "sprites"))
    from repo import repo_root
    return str(repo_root()).split("/.claude/worktrees/")[0]


def main() -> int:
    ap = argparse.ArgumentParser(description="担当ごとのトークンと時間を、段ごとの表にする")
    ap.add_argument("--session", help="セッション本体の .jsonl（既定は、この作業場所のいちばん新しいもの）")
    ap.add_argument("--cwd", default=session_cwd(), help="作業場所（記録の置き場の名前になる）")
    ap.add_argument("--since", help="この時刻（UTC、ISO）以降に始まった担当。既定は今日の 00:00 UTC")
    ap.add_argument("--until", help="この時刻（UTC、ISO）より前に始まった担当")
    ap.add_argument("--all", action="store_true", help="日付で切らない")
    ap.add_argument("--match", default="", help="説明の字の正規表現で絞る（絞ったときは、まとめ役を数えない）")
    ap.add_argument("--no-main", action="store_true", help="まとめ役を数えない")
    ap.add_argument("--runs", action="append", default=[], help="critic.py の控え（.jsonl）。何回でも渡せる")
    ap.add_argument("--json", action="store_true", help="1担当1行の JSON")
    a = ap.parse_args()

    since = "" if a.all else (a.since or datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00"))
    until = a.until or ""
    session = Path(a.session) if a.session else newest_session(project_dir(a.cwd))
    agents: list = []
    if session and session.exists():
        agents = load(session, since, until, a.match, main=not a.no_main)
    for r in a.runs:
        agents += [x for x in load_runs(Path(r)) if (not a.match or re.search(a.match, x.desc, re.I))]
    if not agents:
        print(f"数える担当が無い（セッション: {session}・{since or '日付なし'}〜{until}）", file=sys.stderr)
        return 2
    cal = calibrate([x for x in agents if x.stage != CLI])
    for x in agents:
        if x.stage == CLI:
            continue
        for i, c in enumerate(x.calls):
            last = i == len(x.calls) - 1
            c.out = x.out_true_last if (last and x.out_true_last is not None) else max(0.0, cal[0] * c.sig + cal[1] * c.vis)
    if a.json:
        for x in sorted(agents, key=lambda x: x.start):
            print(json.dumps({"id": x.id, "desc": x.desc, "stage": x.stage, "start": x.start, "calls": len(x.calls),
                              "input": x.total("inp"), "cache_read": x.total("cr"), "cache_write": x.total("cw"),
                              "output_est": x.out, "shown": x.last_ctx, "seconds": round(x.seconds),
                              "gen_seconds": round(x.gen), "models": sorted(m for m in x.models if m)},
                             ensure_ascii=False))
        return 0
    span = f"{since or '始め'}〜{until or 'いま'}"
    print(table(agents, cal, f"担当ごとのトークンと時間（{session.stem[:8] if session else '-'}・{span}）"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
