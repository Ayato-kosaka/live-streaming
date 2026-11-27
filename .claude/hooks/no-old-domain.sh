#!/usr/bin/env bash
# **あやとに渡す URL に、古いドメインを入れさせない。**
#
# 島の正しい道は `https://ayato-arigato.com`（`site/content/site.ts` の `url`）。
# `live-streaming-d3cac.web.app` / `.firebaseapp.com` は引っ越す前の道で、
# 開くと別の入口に回ったり、ログインが引き継がれなかったりする。
#
# 2026-11-27、11月の授賞式を出したときに、通知とチャットで古い道を渡した。
# 手引き（SKILL.md）7本が「確かめる先は web.app」と書いたままだったのを、
# そのまま写したのが原因。手引きは直したが、**次に誰かが古い道を書き足せば
# また渡る。** だから渡す口の手前で止める。
#
# 見るところは2つ:
#   PreToolUse … 通知・issue・PR・ほかのセッションへ送る字（tool_input 全体）
#   Stop       … 終わりぎわにチャットへ書いた最後の返事（transcript の最後の assistant）
#
# 古い道そのものを話題にする文（引っ越しの issue など）は、字のどこかに
# `<!-- old-domain-ok -->` を入れれば通す。
#
# 終了コード 2 = 止める（標準エラーがこちらに返る）。
set -uo pipefail
mode=${1:-pre}
payload=$(cat)

hit=$(MODE="$mode" python3 -c '
import json, os, re, sys
OLD = re.compile(r"live-streaming-d3cac\.(web\.app|firebaseapp\.com)")
OK = "<!-- old-domain-ok -->"
try:
    d = json.loads(sys.stdin.read() or "{}")
except Exception:
    raise SystemExit
mode = os.environ["MODE"]
if mode == "pre":
    text = json.dumps(d.get("tool_input") or {}, ensure_ascii=False)
else:
    if d.get("stop_hook_active"):
        raise SystemExit  # 一度止めたあとの言い直しは見逃す（止まらなくなるのを防ぐ）
    path = d.get("transcript_path") or ""
    text = ""
    try:
        for line in open(path, encoding="utf-8"):
            try:
                e = json.loads(line)
            except Exception:
                continue
            m = e.get("message") or {}
            if e.get("type") == "assistant" and m.get("role") == "assistant":
                parts = m.get("content") or []
                t = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text")
                if t:
                    text = t
    except OSError:
        raise SystemExit
if OK in text:
    raise SystemExit
m = OLD.search(text)
if m:
    print(m.group(0))
' <<<"$payload" 2>/dev/null)

[ -z "$hit" ] && exit 0
{
  echo "**古いドメイン（${hit}）が入っています。あやとに渡す道は https://ayato-arigato.com です。**"
  echo
  echo "  例: https://${hit}/202611_monthly_review → https://ayato-arigato.com/202611_monthly_review"
  echo
  echo "正しい道は site/content/site.ts の url。渡す前に curl で 200 を確かめる。"
  echo "古い道そのものが話題なら、字に <!-- old-domain-ok --> を入れる。"
} >&2
exit 2
