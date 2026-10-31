#!/usr/bin/env python3
"""**往復を知らない批評役を1人、`claude -p` で回し、合否を `critic_gate.py` で数える。**

    python3 tools/shorts/script/critic.py shorts/videos/<id>/p1/script.txt --ref vJo --video <id> --about "…" --out <scratch>/critic/<名前>
    python3 tools/shorts/script/critic.py <script.txt> --ref HPJ --about "…" --out <dir> --runs <scratch>/critic/runs.jsonl

終了コード: `critic_gate.py` と同じ（0=通る / 1=落ちる / 2=回せない・JSON が読めない）。

## 何を渡し、何を渡さないか

渡すのは `brief.py critic` が作る1枚だけ（`references/critic_prompt.md` の雛形に、作文者と同じ約束のカード（帳面の決まりと直しの全文）・
原稿の表・lint の結果・参考の拍・配信の字幕を差し込んだもの）。批評役は当てたカードの ID を全部 `checked` に並べ、
1行ずつ「その行だけ聞いて意味が通るか」（`alone`）と「画に居ない人の言葉を持ち出したか」（`outsider`）を返す（2026-10-23 #1019、帳面 F-048〜F-050）。
**`--video` を渡す。** 渡さないと1枚に配信の字幕が入らず、批評役は【足】の無い行を「本人が言った言葉」と信じて読むしかない
（2026-10-23 のフォカッチャの下書きは、それで配信に無い・要らないつなぎと決め台詞を素通りした。帳面 F-047）。
`--range` を省くと、spec の why・src に書いた時刻の前後30秒を入れる（作文者が根拠に挙げた所）。
**道具を持たせない**（`--tools ""`）・**MCP も設定も読ませない**・**リポジトリの外の空の置き場で起こす**（CLAUDE.md を拾わせない）。
往復の記録・ほかの批評役の点・作文者の4欄の表と当て表は、1枚に入らないので、見ようがない（7.4 の「往復を知らない」を、字ではなく仕組みで守る）。

Agent で回してもよい（その場合も、この1枚のパスだけを渡し、`SubagentHandback` に JSON だけを返させて、`critic_gate.py` に掛ける）。
ただし Agent は、起こしただけで約6.9万トークン（Claude Code の手引き・道具・CLAUDE.md）を読む。`claude -p` は約2千。

## 控え

`--out` に `prompt.md`（渡した1枚）・`critic.json`（返した JSON）・`raw.json`（`claude -p` の出力そのまま）・`gate.txt` を置く。
`--runs` を渡すと、1回1行で使ったトークンと時間を足す（`tools/shorts/cost/tally.py --runs` で、Agent の批評役と並べて読める）。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import brief  # noqa: E402

SYSTEM = ("あなたは縦型ショートの原稿の批評役。渡された1枚だけを読み、決まった型の JSON だけを返す。"
          "ファイル・道具・往復の記録は使わない。")
MODEL = "claude-opus-5-5"   # これまでの批評役と同じ（Agent で回した批評役は、セッションのモデル）
EFFORT = "high"             # これまでは xhigh（1回の思考で 3〜7万トークン・6〜12分）。high で対照が揃うかを確かめて決めた（7.7）


def usage_of(raw: dict) -> dict:
    """`modelUsage`（モデルごと）を足し上げる。無ければ `usage`。"""
    mu = raw.get("modelUsage") or {}
    if mu:
        tot = {"input_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0, "output_tokens": 0}
        for v in mu.values():
            tot["input_tokens"] += v.get("inputTokens") or 0
            tot["cache_read_input_tokens"] += v.get("cacheReadInputTokens") or 0
            tot["cache_creation_input_tokens"] += v.get("cacheCreationInputTokens") or 0
            tot["output_tokens"] += v.get("outputTokens") or 0
        return tot
    u = raw.get("usage") or {}
    return {k: u.get(k) or 0 for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens")}


def run(prompt: str, model: str, effort: str, timeout: int) -> dict:
    schema = (HERE / "critic_schema.json").read_text(encoding="utf-8")
    cmd = ["claude", "-p", "--system-prompt", SYSTEM, "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
           "--no-session-persistence", "--output-format", "json", "--json-schema", schema, "--model", model]
    if effort:
        cmd += ["--effort", effort]
    with tempfile.TemporaryDirectory(prefix="critic-") as empty:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=empty, check=False)
    try:
        return json.loads(r.stdout)
    except ValueError:
        return {"is_error": True, "result": (r.stdout + r.stderr)[-2000:]}


def main() -> int:
    ap = argparse.ArgumentParser(description="往復を知らない批評役を1人、claude -p で回す")
    ap.add_argument("script")
    ap.add_argument("--spec", help="spec.json（既定は原稿の隣）")
    ap.add_argument("--ref", action="append", default=[], help="写した参考の略号（reference_beats.md の節）")
    ap.add_argument("--about", default="", help="何の動画か・狙い（1〜3行）")
    ap.add_argument("--video", help="配信の videoId（streams/ の字幕を1枚に入れる）")
    ap.add_argument("--range", action="append", default=[], help="字幕の区間 H:MM:SS-H:MM:SS（省くと spec の why・src の時刻の前後30秒）")
    ap.add_argument("--transcript", help="streams/ に無い回の字幕（captions で取って復号した captions.txt。`brief.py --help`）")
    ap.add_argument("--out", required=True, help="控えを置く場所（スクラッチパッドの下）")
    ap.add_argument("--label", default="", help="控えの名前（tally に出る）")
    ap.add_argument("--runs", help="1回1行の控え（.jsonl）に足す")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--effort", default=EFFORT, help="low / medium / high / xhigh（空なら既定）")
    ap.add_argument("--timeout", type=int, default=1500)
    ap.add_argument("--as-of", help="承認済みの原稿を読み直すとき（YYYY-MM-DD:<あやとの返事のコメントID>）。1枚の lint の結果と、"
                                    "critic_gate.py の合否を、その時点の決まりで出す（`critic_gate.py --help`）")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    script = Path(a.script)
    spec = Path(a.spec) if a.spec else None
    try:
        if a.transcript and a.video:
            brief.TRANSCRIPT_FILE[a.video] = Path(a.transcript)
        prompt = brief.build_critic(script, spec, a.ref, a.about, a.video, a.range, a.as_of)
    except (OSError, KeyError, ValueError) as e:
        print(f"1枚を作れない: {e}", file=sys.stderr)
        return 2
    (out / "prompt.md").write_text(prompt, encoding="utf-8")
    start = datetime.now(timezone.utc)
    t0 = time.time()
    try:
        raw = run(prompt, a.model, a.effort, a.timeout)
    except subprocess.TimeoutExpired:
        print(f"批評役が {a.timeout} 秒で返さなかった", file=sys.stderr)
        return 2
    wall = time.time() - t0
    (out / "raw.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
    data = raw.get("structured_output")
    if data is None:
        try:
            data = json.loads(raw.get("result") or "")
        except ValueError:
            data = None
    u = usage_of(raw)
    rec = {"id": out.name, "label": a.label or f"critic {out.name}", "start": start.isoformat(),
           "end": datetime.now(timezone.utc).isoformat(), "model": a.model, "effort": a.effort, "usage": u,
           "duration_ms": raw.get("duration_ms") or round(wall * 1000), "duration_api_ms": raw.get("duration_api_ms"),
           "cost_usd": raw.get("total_cost_usd"), "prompt_chars": len(prompt), "ok": data is not None}
    if a.runs:
        with open(a.runs, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    shown = u["input_tokens"] + u["cache_read_input_tokens"] + u["cache_creation_input_tokens"] + u["output_tokens"]
    print(f"批評役: {a.model}・{a.effort or '既定'}  1枚 {len(prompt):,}字  トークン {shown:,}（出力 {u['output_tokens']:,}）  "
          f"{rec['duration_ms'] / 1000:.0f}秒")
    if data is None:
        print(f"批評役の返事が JSON でない: {str(raw.get('result'))[:300]}", file=sys.stderr)
        return 2
    (out / "critic.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    g = subprocess.run([sys.executable, str(HERE / "critic_gate.py"), str(out / "critic.json"), str(script)]
                       + (["--spec", str(spec)] if spec else []) + (["--as-of", a.as_of] if a.as_of else []),
                       capture_output=True, text=True, timeout=120, check=False)
    (out / "gate.txt").write_text(g.stdout + g.stderr, encoding="utf-8")
    print(g.stdout + g.stderr, end="")
    return g.returncode


if __name__ == "__main__":
    sys.exit(main())
