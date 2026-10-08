#!/usr/bin/env bash
# 最後の測り直し（master #699 まで取り込んだ build）。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap5-exit.log"
PORT=4180 ONLY=hit node tapink.mjs > "$L/.tap5-hit390.log" 2>&1
echo "hit390 exit=$?" >> "$L/.tap5-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tap5-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tap5-exit.log"
PORT=4180 node popcheck.mjs > "$L/.tap5-popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tap5-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.tap5-crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tap5-exit.log"
for only in shots px band; do
  PORT=4180 ONLY=$only node tapink.mjs > "$L/.tap5-$only.log" 2>&1
  echo "$only exit=$?" >> "$L/.tap5-exit.log"
done
echo FINISHED >> "$L/.tap5-exit.log"
