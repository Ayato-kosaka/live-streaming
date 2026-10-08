#!/usr/bin/env bash
cd /tmp/claude-0/wt-tapink/tools/sprites
while pgrep -f "ONLY=hit" >/dev/null || pgrep -f selftest_runner >/dev/null; do sleep 10; done
for only in shots px; do
  PORT=4180 ONLY=$only node tapink.mjs > /tmp/claude-0/wt-tapink/.tap-$only.log 2>&1
  echo "$only exit=$?" >> /tmp/claude-0/wt-tapink/.tap-exit.log
done
