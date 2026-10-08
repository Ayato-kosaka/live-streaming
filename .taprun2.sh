#!/usr/bin/env bash
# 小分けにした tapink を1本ずつ。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap2-exit.log"
for only in shots px band hit; do
  PORT=4180 ONLY=$only node tapink.mjs > "$L/.tap2-$only.log" 2>&1
  echo "$only exit=$?" >> "$L/.tap2-exit.log"
done
PORT=4180 node popcheck.mjs > "$L/.popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tap2-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tap2-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tap2-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tap2-exit.log"
echo FINISHED >> "$L/.tap2-exit.log"
