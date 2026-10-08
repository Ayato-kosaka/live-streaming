#!/usr/bin/env bash
# 最後の測り直し（master #700 まで取り込んだ build）。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap6-exit.log"
PORT=4180 ONLY=hit node tapink.mjs > "$L/.tap6-hit390.log" 2>&1
echo "hit390 exit=$?" >> "$L/.tap6-exit.log"
PORT=4180 node popcheck.mjs > "$L/.tap6-popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tap6-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.tap6-crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tap6-exit.log"
PORT=4180 ONLY=shots node tapink.mjs > "$L/.tap6-shots.log" 2>&1
echo "shots exit=$?" >> "$L/.tap6-exit.log"
PORT=4180 ONLY=px node tapink.mjs > "$L/.tap6-px.log" 2>&1
echo "px exit=$?" >> "$L/.tap6-exit.log"
PORT=4180 ONLY=band node tapink.mjs > "$L/.tap6-band.log" 2>&1
echo "band exit=$?" >> "$L/.tap6-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tap6-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tap6-exit.log"
echo FINISHED >> "$L/.tap6-exit.log"
