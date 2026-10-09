#!/usr/bin/env bash
# master #708 まで取り込んだ build で、最後にもう一度ぜんぶ測る。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap8-exit.log"
PORT=4180 ONLY=hit node tapink.mjs > "$L/.tap8-hit390.log" 2>&1
echo "hit390 exit=$?" >> "$L/.tap8-exit.log"
PORT=4180 node popcheck.mjs > "$L/.tap8-popcheck.log" 2>&1
echo "popcheck exit=$?" >> "$L/.tap8-exit.log"
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > "$L/.tap8-crawl.log" 2>&1
echo "crawl exit=$?" >> "$L/.tap8-exit.log"
PORT=4180 ONLY=shots node tapink.mjs > "$L/.tap8-shots.log" 2>&1
echo "shots exit=$?" >> "$L/.tap8-exit.log"
PORT=4180 ONLY=px node tapink.mjs > "$L/.tap8-px.log" 2>&1
echo "px exit=$?" >> "$L/.tap8-exit.log"
PORT=4180 ONLY=band node tapink.mjs > "$L/.tap8-band.log" 2>&1
echo "band exit=$?" >> "$L/.tap8-exit.log"
PORT=4180 ONLY=hit W=1000 node tapink.mjs > "$L/.tap8-hit1000.log" 2>&1
echo "hit1000 exit=$?" >> "$L/.tap8-exit.log"
echo FINISHED >> "$L/.tap8-exit.log"
