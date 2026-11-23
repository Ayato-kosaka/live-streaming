"""全部の口が Video unavailable のとき、締め出しと「消された」を見分ける（download.find_client）の見張り。
**YouTube には行かない**（`clip.probe_client` を偽物に差し替える）。

    python3 tools/shorts/ingest/unavailable_selftest.py

- ① 全部 unavailable・対照も駄目 → 締め出し（FINAL でない。その run は落ちて出し直せる）
- ② 全部 unavailable・対照は見える → 動画が見られない（FINAL。粘らない）
- ③ 1つの口だけ unavailable → 粘って、ほかの口で見えれば通る
- 対照の確かめを抜くと①が落ちる（守りの対照）
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import download  # noqa: E402

UNAV = "ERROR: [youtube] xxxxxxxxxxx: Video unavailable"
FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'OK ' if cond else 'NG '} {name}")
    if not cond:
        FAILS.append(name)


def run(fake) -> tuple:
    """fake(url, client) -> (ok, why, dt)。粘りは1周にして sleep を避ける。"""
    old = download.clip.probe_client
    download.clip.probe_client = fake
    try:
        return download.find_client("https://www.youtube.com/watch?v=REFVIDEO001", None, rounds=1, pause=0)
    finally:
        download.clip.probe_client = old


def main() -> int:
    def all_dead(url, c):
        return 0, UNAV, 0.1

    def only_ref_dead(url, c):
        return (1, "ok", 0.1) if url == download.CONTROL_URL else (0, UNAV, 0.1)

    def one_client_dead(url, c):
        return (0, UNAV, 0.1) if c == download.clip.CLIENTS[0] else (1, "ok", 0.1)

    c, why = run(all_dead)
    check("① 対照も駄目 → 取れない", c is None)
    check("① 締め出しの理由で、FINAL ではない", why == download.LOCKOUT_WHY and not why.startswith(download.FINAL))

    c, why = run(only_ref_dead)
    check("② 対照は見える → 動画が見られない（FINAL）", c is None and why.startswith(download.FINAL))

    c, why = run(one_client_dead)
    check("③ 1つの口だけ unavailable → ほかの口で通る", c == download.clip.CLIENTS[1] and why == "")

    # 守りの対照: 対照の確かめを抜くと、①が「消された」に化ける
    old = download._control_visible
    download._control_visible = lambda client: True
    try:
        c, why = run(all_dead)
    finally:
        download._control_visible = old
    check("対照: 確かめを抜くと①が FINAL に化ける（見張りが効いている）", why.startswith(download.FINAL))

    print("緑" if not FAILS else f"赤 {FAILS}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
