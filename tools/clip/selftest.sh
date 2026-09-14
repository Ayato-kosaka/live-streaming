#!/usr/bin/env bash
#
# tools/clip/make.sh を、YouTube に繋がらない箱で確かめる。
#
# **この箱から YouTube は引けない。** どの player_client を試しても
# 「Sign in to confirm you're not a bot」で弾かれる（2026-09-11 に実測）。
# なので Cookie が要る部分だけは Actions でしか通せないが、**それ以外**
# ——区間の読み取り・切り出す位置・ファイル名・出来たものの判定——は
# 手元の mp4 を配れば本番と同じ道を通る。
#
#   bash tools/clip/selftest.sh
#
# 見るのは3つ:
#   1. 頼んだ区間の長さのものが出来る
#   2. **切り出した頭が、元の動画のその秒と同じ絵**（ずれていない）
#   3. 配信の終わりを越えた区間は NG になって、終了コードが 1 になる
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${TMPDIR:-/tmp}/clip-selftest.$$"
PORT="${PORT:-4779}"
mkdir -p "$WORK"
trap 'kill "${SRV_PID:-0}" 2>/dev/null || true; rm -rf "$WORK"' EXIT

for cmd in yt-dlp ffmpeg ffprobe python3; do
  command -v "$cmd" >/dev/null || { echo "$cmd がありません"; exit 1; }
done

echo "1) 5分の試験用の動画を作る"
ffmpeg -v error -y \
  -f lavfi -i "testsrc=size=640x360:rate=25:duration=300" \
  -f lavfi -i "sine=frequency=440:duration=300" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 50 -c:a aac -shortest \
  "$WORK/src.mp4"

echo "2) Range に答える配り口を立てる"
# python -m http.server は Range を無視する。無視されると ffmpeg が
# 頭からしか読めず、**切り出しが空のまま「出来た」ように見える**
cat >"$WORK/serve.py" <<'PYEOF'
import os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
PATH, PORT = sys.argv[1], int(sys.argv[2])
SIZE = os.path.getsize(PATH)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _range(self):
        h = self.headers.get("Range")
        if not h or not h.startswith("bytes="):
            return 0, SIZE - 1
        a, _, b = h[6:].split(",")[0].partition("-")
        return max(0, int(a) if a else 0), min(int(b) if b else SIZE - 1, SIZE - 1)

    def _send(self, head_only=False):
        start, end = self._range()
        length = end - start + 1
        partial = not (start == 0 and end == SIZE - 1)
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if partial:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, SIZE))
        self.end_headers()
        if head_only:
            return
        # ffmpeg は要るところまで読むと途中で切る。**その切断は異常ではない**
        # ので、握りつぶす（拾わないと画面が Traceback で埋まって読めない）
        try:
            with open(PATH, "rb") as f:
                f.seek(start)
                left = length
                while left > 0:
                    chunk = f.read(min(65536, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self):
        self._send(head_only=True)

    def do_GET(self):
        self._send()


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
PYEOF
python3 "$WORK/serve.py" "$WORK/src.mp4" "$PORT" &
SRV_PID=$!
sleep 2

export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1
export CLIP_SOURCE_URL="http://127.0.0.1:${PORT}/src.mp4"

echo ""
echo "3) 2本を切り出す（0:00:30-0:01:00 と 2:10-2:40）"
VIDEO=kyzCpe5Znyk RANGES="0:00:30-0:01:00,2:10-2:40" HEIGHT=360 OUT="$WORK/out" \
  bash "$HERE/make.sh" 2>&1 | sed -n '/出来たもの/,$p'

echo ""
echo "4) 切り出した頭が、元の 2:10 の絵と同じかを見る"
ffmpeg -v error -y -i "$WORK/out/kyzCpe5Znyk_0-02-10_0-02-40.mp4" \
  -frames:v 1 -f image2 "$WORK/cut.png"
ffmpeg -v error -y -ss 130 -i "$WORK/src.mp4" -frames:v 1 -f image2 "$WORK/want.png"
ffmpeg -v error -y -ss 60 -i "$WORK/src.mp4" -frames:v 1 -f image2 "$WORK/other.png"
a="$(sha256sum "$WORK/cut.png" | cut -d' ' -f1)"
b="$(sha256sum "$WORK/want.png" | cut -d' ' -f1)"
c="$(sha256sum "$WORK/other.png" | cut -d' ' -f1)"
if [ "$a" != "$b" ]; then
  echo "   NG  切り出した頭が 2:10 の絵と違います（ずれている）"
  exit 1
fi
if [ "$a" = "$c" ]; then
  # 全部同じ絵なら、上の一致は何も証明していない
  echo "   NG  1:00 の絵とも同じです。この確かめかたでは何も分かりません"
  exit 1
fi
echo "   OK  2:10 の絵と一致し、1:00 の絵とは違いました"

echo ""
echo "5) 配信の終わりを越えた区間は NG になるか"
set +e
VIDEO=kyzCpe5Znyk RANGES="6:00-6:30" HEIGHT=360 OUT="$WORK/out2" \
  bash "$HERE/make.sh" >"$WORK/over.log" 2>&1
code=$?
set -e
sed -n '/出来たもの/,$p' "$WORK/over.log" | sed 's/^/   /'
if [ "$code" -eq 0 ]; then
  echo "   NG  短いものが出来たのに、終了コードが 0 でした"
  exit 1
fi
echo "   OK  終了コード $code で止まりました"

echo ""
echo "ぜんぶ通りました"
