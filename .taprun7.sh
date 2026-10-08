#!/usr/bin/env bash
# 濃さの直しのあと、濃さを2とおりとも全面で測り直す。使い捨て
cd /tmp/claude-0/wt-tapink/tools/sprites || exit 1
L=/tmp/claude-0/wt-tapink
: > "$L/.tap7-exit.log"
PORT=4180 ONLY=px node tapink.mjs > "$L/.tap7-px.log" 2>&1
echo "px exit=$?" >> "$L/.tap7-exit.log"
PORT=4180 ONLY=band node tapink.mjs > "$L/.tap7-band.log" 2>&1
echo "band exit=$?" >> "$L/.tap7-exit.log"
PORT=4180 ONLY=shots node tapink.mjs > "$L/.tap7-shots.log" 2>&1
echo "shots exit=$?" >> "$L/.tap7-exit.log"
PORT=4180 ONLY=hit node tapink.mjs > "$L/.tap7-hit390.log" 2>&1
echo "hit390 exit=$?" >> "$L/.tap7-exit.log"
echo FINISHED >> "$L/.tap7-exit.log"
