#!/bin/bash
# 土台は .claude/skills/ec2-chrome/ec2_exec.sh（EC2 を起こす → SSM で実行 → 必ず止める）。
# ここに残してあるのは、.claude/settings.json の allow がこのパスに対して書いてあるから。
# 中身をここに書き足さない。直すのは土台のほう。
exec bash "$(dirname "$0")/../ec2-chrome/ec2_exec.sh" "$@"
