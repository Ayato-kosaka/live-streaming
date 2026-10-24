#!/bin/bash
# 土台は .claude/skills/ec2-chrome/ec2_exec.sh（EC2 を起こす → 列の札を取る → SSM で実行 → 札を返す → 止めてよければ止める）。
# ここに残してあるのは、.claude/settings.json の allow がこのパスに対して書いてあるから。
# 中身をここに書き足さない。直すのは土台のほう。列は Doneru の Chrome の束（cdp.py の up("doneru")）と同じ名前
EC2_QUEUE_LANE="${EC2_QUEUE_LANE:-doneru}" exec bash "$(dirname "$0")/../ec2-chrome/ec2_exec.sh" "$@"
