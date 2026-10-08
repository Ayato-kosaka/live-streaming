#!/usr/bin/env bash
cd /tmp/claude-0/wt-tapink/tools/sprites
while ! grep -q crawl /tmp/claude-0/wt-tapink/.tap-exit.log 2>/dev/null; do sleep 20; done
PORT=4180 ONLY=hit W=1000 node tapink.mjs > /tmp/claude-0/wt-tapink/.tap-hit1000.log 2>&1
echo "hit1000 exit=$?" >> /tmp/claude-0/wt-tapink/.tap-exit.log
