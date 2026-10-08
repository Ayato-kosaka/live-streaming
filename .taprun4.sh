#!/usr/bin/env bash
# 2つの CSS を直したあとの、押しどころの測り直し（390px と 1000px）。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap4-exit.log"
PORT=4180 ONLY=hit node tapink.mjs > "$L/.tap4-hit390.log" 2>&1
echo "hit390 exit=$?" >> "$L/.tap4-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tap4-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tap4-exit.log"
PORT=4180 node popcheck.mjs > "$L/.tap4-popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tap4-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.tap4-crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tap4-exit.log"
for only in shots px band; do
  PORT=4180 ONLY=$only node tapink.mjs > "$L/.tap4-$only.log" 2>&1
  echo "$only exit=$?" >> "$L/.tap4-exit.log"
done
echo FINISHED >> "$L/.tap4-exit.log"
