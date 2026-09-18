"""**その配信に、チャットの記録（live_chat）がいま在るか**を、ログインせずに見る。

    python3 python/chat_replay_probe.py __Puza5-4q0 zLIQ9yySAas
    python3 python/chat_replay_probe.py --gap 30 <配信ID> ...

終了コード 0=ぜんぶ測れた / 1=測れなかったものがある / 2=対照が通らなかった。

## なぜ要るか

`youtube_chat.videos` が `WAITING` のまま止まっている配信を前にしたとき、
知りたいことは2つある。**拾い直す枠が効いていないのか**（仕組みの話）と、
**そもそもチャットが1行も無いのか**（相手の話）。後者を確かめないまま
「詰まっている」と読むと、直す先を間違える。

`docs/island-misses.md` #123 には「26本のチャットが本当に無いのかは、
この箱からは確かめられない」と書いてあった。**半分は確かめられる。**
yt-dlp は cookie 無しでも `--list-subs` までは通ることがあり、
`live_chat` が一覧に出るかどうかだけなら 1本 1回の要求で分かる。

## 何を見るか

取り込み（`python/youtube_chat/downloader.py`）が取りに行くのは
`--sub-langs live_chat` の字幕トラック1本。**それが一覧に出るかだけ**を見る。
中身は1バイトも落とさないし、視聴者さんの字にも触らない。

## 締め出しを「無い」と書かない

ログインしていない側から立て続けに当てると
`Sign in to confirm you're not a bot`（実質の締め出し）が返る。
**これは「チャットが無い」ではない。** `測れず` として別に数え、
終了コード 1 で落とす。`python/dead_stream_watch.py` と同じ構えで、
間を空け、締め出されたら倍にしながら休んで当て直す。

## 対照

本物の配信を測る前に、**答えの分かっている2本**に当てる。

| | 配信ID | 何が分かっているか |
| --- | --- | --- |
| 在るほう | `fH13PheJneU` | 本番の `chat_messages` に 836行 入っている |
| 無いほう | `_Azl32caALw` | 2026-09-17 の取り込みが cookie 付きで `NO_CHAT_FILE` と判定して `SKIPPED` に落とした |

**在るほうが「在る」と出ないなら、この道具は何も測っていない**ので、
本物の数字を1つも出さずに 2 で落ちる。無いほうは締め出されることが多いので、
`チャット在り` と出たときだけ落とす（`測れず` は対照の失敗にしない——
そのぶん「無いほうを見分けられることまでは確かめていない」と印字する）。
"""

from __future__ import annotations

import random
import re
import subprocess
import sys
import time

# 答えの分かっている対照。**本物の前に必ず当てる。**
CTRL_YES = "fH13PheJneU"
CTRL_NO = "_Azl32caALw"

# 1本ごとに空ける秒数。`dead_stream_watch.py` の PLAY_GAP と同じ考えで、
# 立て続けに当てると締め出される。既定は控えめに置いてある
DEFAULT_GAP = 20.0

# 締め出されたときに当て直す回数と、そのたびに伸ばす休み
RETRIES = 4
COOL_BASE = 120.0

BLOCKED = ("sign in to confirm", "429", "too many requests", "confirm you’re not a bot")


def probe(vid: str, timeout: float = 180.0) -> tuple[str, str]:
    """1本に1回だけ当てる。返すのは（見立て, 理由）。"""
    cmd = [
        "yt-dlp", "--list-subs", "--skip-download", "--no-warnings",
        "--socket-timeout", "30", f"https://www.youtube.com/watch?v={vid}",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return ("測れず", "yt-dlp が入っていません")
    except subprocess.TimeoutExpired:
        return ("測れず", "返事が来ませんでした")
    out = (r.stdout or "") + (r.stderr or "")
    low = out.lower()
    if any(b in low for b in BLOCKED):
        return ("測れず", "締め出し（ログインを求められた）")
    if r.returncode != 0:
        m = re.search(r"ERROR:.*", out)
        # 動画そのものが引けない。非公開・削除・録画なしはこちら
        return ("動画が引けない", (m.group(0) if m else f"yt-dlp 終了コード {r.returncode}")[:160])
    if re.search(r"^live_chat\b", out, re.M):
        return ("チャット在り", "live_chat が一覧に出た")
    if "has no subtitles" in low:
        return ("チャット無し", "字幕トラックが1つも無い")
    return ("チャット無し", "字幕はあるが live_chat が無い")


def probe_with_backoff(vid: str, gap: float) -> tuple[str, str]:
    """締め出されたら休んで当て直す。**当て直しても駄目なら「測れず」のまま返す。**"""
    verdict, why = probe(vid)
    for i in range(RETRIES):
        if verdict != "測れず" or "締め出し" not in why:
            break
        wait = COOL_BASE * (1.5 ** i) * (0.7 + random.random() * 0.6)
        print(f"  締め出されたので {wait:.0f} 秒休みます（{i + 1}/{RETRIES}）", flush=True)
        time.sleep(wait)
        verdict, why = probe(vid)
    time.sleep(gap * (0.7 + random.random() * 0.6))
    return verdict, why


def main(argv: list[str]) -> int:
    gap = DEFAULT_GAP
    if "--gap" in argv:
        i = argv.index("--gap")
        gap = float(argv[i + 1])
        del argv[i:i + 2]
    ids = [a for a in argv if not a.startswith("-")]
    if not ids:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        print("配信IDを1つ以上わたしてください", file=sys.stderr)
        return 2

    print("対照から当てます")
    yes = probe_with_backoff(CTRL_YES, gap)
    print(f"  在るはずの1本  {CTRL_YES}  {yes[0]}  {yes[1]}")
    no = probe_with_backoff(CTRL_NO, gap)
    print(f"  無いはずの1本  {CTRL_NO}  {no[0]}  {no[1]}")

    if yes[0] != "チャット在り":
        print("::error::在るはずの1本が「在る」と出ませんでした。本物の数字は出しません", file=sys.stderr)
        return 2
    if no[0] == "チャット在り":
        print("::error::無いはずの1本が「在る」と出ました。見分けられていません", file=sys.stderr)
        return 2
    if no[0] == "測れず":
        print("  （無いほうは測れませんでした。**見分けられることまでは確かめていません**）")

    print(f"\n本物を {len(ids)} 本みます（1本ごとに {gap:.0f} 秒前後あけます）")
    counts: dict[str, int] = {}
    for vid in ids:
        verdict, why = probe_with_backoff(vid, gap)
        counts[verdict] = counts.get(verdict, 0) + 1
        print(f"  {vid}\t{verdict}\t{why}", flush=True)

    print("\n" + "─" * 60)
    print(f"見た本数 {len(ids)}  " + "  ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    unknown = counts.get("測れず", 0)
    if unknown:
        print(f"::error::{unknown} 本は測れませんでした。**「無かった」ではありません**", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
