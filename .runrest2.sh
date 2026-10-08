#!/usr/bin/env bash
cd /tmp/claude-0/wt-tapink/tools/sprites
# shots と px が終わるのを待つ
while pgrep -f "ONLY=shots" >/dev/null || pgrep -f "ONLY=px" >/dev/null || pgrep -f selftest_runner >/dev/null || [ ! -f /tmp/claude-0/wt-tapink/.tap-px.log ]; do sleep 15; done
PORT=4180 ONLY=band node tapink.mjs > /tmp/claude-0/wt-tapink/.tap-band.log 2>&1
echo "band exit=$?" >> /tmp/claude-0/wt-tapink/.tap-exit.log
PORT=4180 node popcheck.mjs > /tmp/claude-0/wt-tapink/.popcheck.log 2>&1
echo "popcheck exit=$?" >> /tmp/claude-0/wt-tapink/.tap-exit.log
DIST=/tmp/claude-0/wt-tapink/site/.next-3180 SPORT=4180 node crawl.mjs > /tmp/claude-0/wt-tapink/.crawl.log 2>&1
echo "crawl exit=$?" >> /tmp/claude-0/wt-tapink/.tap-exit.log
