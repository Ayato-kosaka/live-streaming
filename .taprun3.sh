#!/usr/bin/env bash
# master を取り込んだあとの、全面の測り直し。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap3-exit.log"
for only in hit shots px band; do
  PORT=4180 ONLY=$only node tapink.mjs > "$L/.tap3-$only.log" 2>&1
  echo "$only exit=$?" >> "$L/.tap3-exit.log"
done
PORT=4180 node popcheck.mjs > "$L/.tap3-popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tap3-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.tap3-crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tap3-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tap3-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tap3-exit.log"
echo FINISHED >> "$L/.tap3-exit.log"
