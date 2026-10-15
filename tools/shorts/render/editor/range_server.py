"""Range 要求に応える静的サーバー（python の http.server は Range を返さず、動画の頭出しができない）。

    python3 range_server.py PORT DIR
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class H(SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else size - 1
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remain = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remain = getattr(self, "_remain", None)
        if remain is None:
            return super().copyfile(source, outputfile)
        while remain > 0:
            buf = source.read(min(65536, remain))
            if not buf:
                break
            outputfile.write(buf)
            remain -= len(buf)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port, root = int(sys.argv[1]), sys.argv[2]
    ThreadingHTTPServer(("127.0.0.1", port), partial(H, directory=root)).serve_forever()
