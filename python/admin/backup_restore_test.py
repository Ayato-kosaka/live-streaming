"""**戻せることを実測する。** 退避 → Firestore エミュレータ → 突き合わせ。

取れているだけでは意味がない。**戻して、件数と中身が合うところまで**を
1回やる。本番には1バイトも書かない（エミュレータを立てて、そこへ戻す）。

ARGS 例:
  {}                            … islandNotes（視聴者さんの書いた字）で試す
  {"collection": "islandDonors"}
  {"port": 8080}

## なぜエミュレータなのか

戻し先が「本番ではない、本物の Firestore」でないと、戻す道が本当に通るか
分からない。書き方を真似た別物に書いても、型が落ちていることに気づけない。
エミュレータは本物と同じ口を持っていて、**本番とは1ミリも繋がっていない。**
"""

import os
import socket
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _fs import args, log  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def wait_port(port: int, sec: int = 180) -> bool:
    end = time.time() + sec
    while time.time() < end:
        with socket.socket() as s:
            s.settimeout(1)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(1)
    return False


def main() -> None:
    a = args()
    col = a.get("collection", "islandNotes")
    port = int(a.get("port", 8080))

    log.info("Firestore エミュレータを立てます（ポート %d）", port)
    emu = subprocess.Popen(
        [
            "npx", "-y", "firebase-tools@13", "emulators:start",
            "--only", "firestore", "--project", "demo-restore",
        ],
        cwd=ROOT,
        env={**os.environ, "FIREBASE_EMULATORS_PATH": "/tmp/fbemu"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        if not wait_port(port):
            out = ""
            if emu.stdout:
                emu.terminate()
                out = emu.stdout.read()[-3000:]
            log.error("エミュレータが立ちませんでした:\n%s", out)
            raise SystemExit(1)
        log.info("立ちました。戻します")

        env = {
            **os.environ,
            "FIRESTORE_EMULATOR_HOST": f"127.0.0.1:{port}",
            # **本番と別の名前にする。** 取り違えを目で防ぐ
            "RESTORE_PROJECT": "demo-restore",
            # エミュレータは資格情報を見ないが、ライブラリが探しにいくと
            # 落ちることがあるので明示で外す
            "GOOGLE_APPLICATION_CREDENTIALS": os.environ.get(
                "GOOGLE_APPLICATION_CREDENTIALS", ""
            ),
        }
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "backup", "restore.py"),
             "--collection", col, "--apply"],
            env=env, cwd=ROOT,
        )
        raise SystemExit(r.returncode)
    finally:
        emu.terminate()
        try:
            emu.wait(timeout=20)
        except subprocess.TimeoutExpired:
            emu.kill()


main()
