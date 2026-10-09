#!/usr/bin/env bash
# master #708 まで取り込んだ build で、最後にもう一度ぜんぶ測る。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tapA-exit.log"
PORT=4180 ONLY=hit node tapink.mjs > "$L/.tapA-hit390.log" 2>&1
echo "hit390 exit=$?" >> "$L/.tapA-exit.log"
PORT=4180 node popcheck.mjs > "$L/.tapA-popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tapA-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.tapA-crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tapA-exit.log"
PORT=4180 ONLY=shots node tapink.mjs > "$L/.tapA-shots.log" 2>&1
echo "shots exit=$?" >> "$L/.tapA-exit.log"
PORT=4180 ONLY=px node tapink.mjs > "$L/.tapA-px.log" 2>&1
echo "px exit=$?" >> "$L/.tapA-exit.log"
PORT=4180 ONLY=band node tapink.mjs > "$L/.tapA-band.log" 2>&1
echo "band exit=$?" >> "$L/.tapA-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tapA-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tapA-exit.log"
echo FINISHED >> "$L/.tapA-exit.log"
