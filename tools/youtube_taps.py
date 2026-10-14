"""タップ数（月末配信アーカイブのリアクション数）を取ってきて、台帳に入れる。

    python3 tools/youtube_taps.py --month 2026-10            # 取って台帳へ
    python3 tools/youtube_taps.py --month 2026-10 --dry      # 何を取りに行くかだけ
    python3 tools/youtube_taps.py --missing                  # 渡っていない月を全部

終了コード 0=入った / 1=取れなかった / 2=仕掛けが整っていない。

## 何をする道具か

あやと（2026-10-13、#809）:

> タップ数は YouTube Studio の、その月の月末配信アーカイブのリアクション数。
> 分割されていたら合算。次回からはこちらが取る

**この箱から YouTube Studio には届かない。** EC2 のログイン済み Chrome ごしに
しか読めない（`/ec2-chrome` と `/youtube-studio`）。だからこの道具がするのは、
**EC2 へ道具を置いて、走らせて、出た JSON を持ち帰って、台帳に書く**まで。
数えるところは `.claude/skills/youtube-studio/yt_taps.py` が EC2 でやる。

**パスワードは1文字も打たない。** EC2 の Chrome はもうログインしてある。

## 月末配信の日は `python/build_monthly.py` の `FINALS` が持っている

暦から当てない（実測で「その月の最終日」だったのは9回に1回）。
新しい月を取りに行く前に、まず `FINALS` にその月の月末配信の日を足す。

## 取れなかったら、台帳に書かない

アナリティクスの口は Studio の版で名前が変わる。`yt_taps.py` は
**決められなければ数を出さずに落ちる。** こちらもそのまま落ちて、
台帳には1行も書かない。当てずっぽうの数を入れると、
**その月の記録として島の面に何年も残る。**
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from build_monthly import periods  # noqa: E402
from monthly_taps import load, missing, save  # noqa: E402

EC2 = ROOT / ".claude" / "skills" / "ec2-chrome" / "ec2.py"
CDP = ROOT / ".claude" / "skills" / "ec2-chrome" / "cdp.py"
STUDIO = ROOT / ".claude" / "skills" / "youtube-studio" / "yt_studio.py"
TAPS = ROOT / ".claude" / "skills" / "youtube-studio" / "yt_taps.py"
# **ここから下の2つは EC2 の中の道で、手元には無い。** `repo_path()` は
# このリポジトリの中しか指せないので、よその機械の道は書き下すしかない。
# 正は `.claude/skills/ec2-chrome/cdp.py` の `HOME = "/home/ubuntu"`。
# あちらを変えたらここも変える（直書き点検: 記録）
REMOTE = "/home/ubuntu/cdp"  # 直書き点検: 記録（EC2 の中。手元の道ではない）
OUT = "/home/ubuntu/shots/taps.json"  # 直書き点検: 記録（EC2 の中。手元の道ではない）


def finals() -> dict:
    """`{月: 月末配信の日}`。`FINALS` から作る。"""
    return {p["key"]: p["final"] for p in periods()}


def run(cmd: list, secs: int = 300) -> str:
    """手元のコマンドを回して、標準出力を返す。落ちたらそのまま投げる。"""
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=secs)
    if r.returncode != 0:
        raise RuntimeError("%s\n%s" % (" ".join(cmd[:3]), (r.stderr or r.stdout)[-600:]))
    return r.stdout


def push() -> None:
    """EC2 に道具を置き直す。**毎回置く**（あちらが古いまま走るほうが怖い）。"""
    for p, name in ((CDP, "cdp.py"), (STUDIO, "yt_studio.py"), (TAPS, "yt_taps.py")):
        run([sys.executable, str(EC2), "put", str(p), f"{REMOTE}/{name}"], 180)


def fetch(day: str) -> dict:
    """EC2 で数えて、JSON を持ち帰る。

    Args:
        day: 月末配信の日（JST）

    Returns:
        `yt_taps.taps_for_day()` の返り
    """
    with tempfile.TemporaryDirectory() as d:
        sh = Path(d) / "taps.sh"
        sh.write_text(
            "cd %s && timeout 280 python3 yt_taps.py %s %s\n" % (REMOTE, day, OUT),
            encoding="utf-8")
        run([sys.executable, str(EC2), "run", str(sh), "300"], 360)
        got = Path(d) / "taps.json"
        run([sys.executable, str(EC2), "get", OUT, str(got)], 180)
        return json.loads(got.read_text(encoding="utf-8"))


def take(keys: list, dry: bool) -> int:
    fin = finals()
    unknown = [k for k in keys if k not in fin]
    if unknown:
        print("NG 月末配信の日が分かりません: %s" % "・".join(unknown))
        print("   python/build_monthly.py の FINALS に、その月の月末配信の日を足す")
        return 2
    if dry:
        for k in keys:
            print("%s … %s の配信を見にいく（分割されていたら合算）" % (k, fin[k]))
        return 0

    push()
    months = load()
    bad = []
    for k in keys:
        got = fetch(fin[k])
        if not got.get("ok"):
            bad.append(k)
            print("NG %s（%s）のリアクション数を決められませんでした" % (k, fin[k]))
            for p in got.get("parts", []):
                print("   %s %s … %s" % (p["id"], p.get("title", "")[:28], p.get("how")))
            print("   拾った候補は EC2 の %s に残っています" % OUT)
            continue
        months[k] = {"taps": int(got["taps"]), "src": "studio", "at": fin[k],
                     "parts": [p["id"] for p in got["parts"]]}
        print("%s … %d タップ（%d本を合算）" % (k, got["taps"], len(got["parts"])))
    save(months)
    print("台帳を書きました: python/data/monthly_taps.json")
    print("**焼き直しを忘れない**: python3 python/build_monthly.py --build")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", help="2026-10 のような月。いくつでも（カンマ区切り）")
    ap.add_argument("--missing", action="store_true", help="台帳に渡っていない月を全部")
    ap.add_argument("--dry", action="store_true", help="取りに行かず、見にいく先だけ出す")
    a = ap.parse_args()

    if a.missing:
        keys = missing([p["key"] for p in periods()], load())
        if not keys:
            print("渡っていない月はありません")
            return 0
    elif a.month:
        keys = [x.strip() for x in a.month.split(",") if x.strip()]
    else:
        ap.error("--month か --missing が要ります")
    return take(keys, a.dry)


if __name__ == "__main__":
    sys.exit(main())
