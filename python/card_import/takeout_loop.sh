#!/bin/sh
# ドライブの Takeout の zip を、1つずつ「落とす → 数える → 消す」。EC2 の上で、札 gphotos を持って回す:
#   nohup /usr/local/sbin/ec2-queue hold gphotos --who card-import --purpose 'Takeout を数える' -- \
#     sh /home/ubuntu/cardimport/app/card_import/takeout_loop.sh 2024-09-11 2026-09-10 > ~/cardimport/loop.log 2>&1 &
# 済んだ zip の名前は zips_done.txt に控える。途中で止まっても、同じ命令で続きから。
# 一覧は最後にもう一度取り直す（ドライブの検索は、送っても全部を描かないことがある。2026-11-15 に 18個中2個が抜けた）。
set -u
FROM=${1:-2024-09-11}; TO=${2:-2026-09-10}
R=/home/ubuntu/cardimport; MEMO=$R/drive_zips.json; Z=$R/zips; DONE=$R/zips_done.txt
DL="python3 /home/ubuntu/cdp/takeout_dl.py"
RUN="sudo -u ubuntu -H sh -c 'cd $R/app && ../venv/bin/python -m card_import.run --from $FROM --to $TO"
touch "$DONE"; mkdir -p "$Z"; chown ubuntu:ubuntu "$Z" "$DONE"
pass() {
  n=$(python3 -c "import json;print(len(json.load(open('$MEMO'))))")
  i=0
  while [ "$i" -lt "$n" ]; do
    name=$(python3 -c "import json;print(json.load(open('$MEMO'))[$i]['name'])")
    if ! grep -qx "$name" "$DONE"; then
      echo "$(date -u +%H:%M) get $i"
      out=$($DL drive-get "$MEMO" "$i" "$Z"); rc=$?
      if [ $rc -ne 0 ]; then echo "get $i failed rc=$rc $out"; [ $rc -eq 3 ] && exit 3; i=$((i+1)); continue; fi
      eval "$RUN scan --delete $Z/$name'" && echo "$name" >> "$DONE" || echo "scan $i failed"
    fi
    i=$((i+1))
  done
}
$DL drive-list "$MEMO" && pass
$DL drive-list "$MEMO" && pass
echo "$(date -u +%H:%M) scanned all"
eval "$RUN existing'" && eval "$RUN status'"
echo LOOP_DONE
