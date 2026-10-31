"""依頼ファイルの読みかた（plan.py）の見張り。**YouTube にも GitHub にも触らない。**

    python3 tools/shorts/ingest/plan_selftest.py

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは openssl だけ
（公開鍵を読むため。Actions のランナーにも入っている）。

## 何を見るか

plan.py は「Cookie を握って取りに行く前に、依頼を断れる最後の場所」。ここが緩むと、
読めない区間や多すぎる区間のまま YouTube に取りに行き、1時間かけてから落ちる。
逆にきつくなりすぎると、正しい依頼が黙って0件になる（`zoom` の区間を空で受けて
0本の job にする、を書きかけて止めた）。だから「通るべきもの」と「断るべきもの」を両方当てる。

- clips: 18区間（あやと島のショート3本ぶん）が**1本の job** になり、区間は**頼んだ順のまま**
- clips: 区間をカンマ区切りの1行で渡しても同じ（workflow_dispatch の入力欄は1行）
- clips: 区間が無い・前後が逆・1区間が長すぎる・合計が長すぎる・多すぎる、を断る
- zoom: 区間ごとに1本の job（clips を足したことで変わっていない）・区間が空なら断る
- archive: 動画ごとに1本・置き場は `<id>/archive`
- 公開鍵が無い依頼は断る
- captions（字幕だけの道）: 動画ごとに1本・置き場は `<id>/captions`・whisper も区間も持たない。
  **fetch / analyze の列（matrix / fetch / count）に入れず、captions / captions_count に分ける**。
  字幕だけの依頼では count が 0、captions の無い依頼では captions_count が 0
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import plan  # noqa: E402

# 2026-10-15 に実際に頼んだ区間（yk-by7R7iPA。541秒）
RANGES = ("0:13:29-0:14:05,0:14:10-0:14:38,0:15:42-0:16:23,0:16:43-0:17:44,0:41:08-0:41:18,"
          "0:45:28-0:45:38,0:46:18-0:47:13,0:48:38-0:48:48,0:50:43-0:51:08,0:53:00-0:53:16,"
          "0:56:19-0:57:30,0:58:03-0:58:13,0:59:20-1:00:20,1:02:39-1:03:25,1:07:18-1:07:28,"
          "1:08:38-1:08:48,1:09:41-1:10:13,1:25:08-1:25:18").split(",")


def pubkey() -> str:
    with tempfile.TemporaryDirectory() as td:
        priv = Path(td) / "k.pem"
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                        "rsa_keygen_bits:2048", "-out", str(priv)], check=True,
                       capture_output=True)
        return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                              capture_output=True, text=True).stdout


def refused(req: dict) -> bool:
    try:
        plan.items_of(req, "selftest")
    except plan.Bad:
        return True
    return False


def main() -> int:
    pem = pubkey()
    fails: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"{'ok' if ok else 'NG'}  {what}")
        if not ok:
            fails.append(what)

    base = {"mode": "clips", "videos": ["yk-by7R7iPA"], "pubkey": pem}
    its = plan.items_of(dict(base, ranges=RANGES), "selftest")
    it = its[0] if its else {}
    check(len(its) == 1, f"clips 18区間が1本の job になる（{len(its)}本）")
    check(it.get("key") == "yk-by7R7iPA__clips" and it.get("dest") == "yk-by7R7iPA/clips",
          f"clips の置き場が <id>/clips（{it.get('dest')}）")
    want = [[plan.secs(a), plan.secs(b)] for a, b in (r.split("-") for r in RANGES)]
    check(it.get("ranges") == want, "clips の区間が頼んだ順・頼んだ秒のまま")
    check(it.get("ranges", [[0]])[0] == [809.0, 845.0], "0:13:29-0:14:05 が 809〜845秒")
    total = sum(e - s for s, e in it.get("ranges") or [])
    check(total == 541, f"clips の合計が 541秒（{total:g}）")
    check(it.get("pubkey_sha256") and "BEGIN PUBLIC KEY" in it.get("pubkey", ""),
          "clips の job に公開鍵と指紋が載る")

    one = plan.items_of(dict(base, range=",".join(RANGES)), "selftest")
    check(len(one) == 1 and one[0]["ranges"] == want, "区間をカンマ区切りの1行で渡しても同じ")
    two = plan.items_of(dict(base, videos=["yk-by7R7iPA", "hK0SwIeAxg0"], ranges=RANGES[:2]),
                        "selftest")
    check([i["key"] for i in two] == ["yk-by7R7iPA__clips", "hK0SwIeAxg0__clips"],
          "動画が2本なら job も2本")

    check(refused(dict(base)), "clips で区間が無いのを断る")
    check(refused(dict(base, ranges=["0:14:05-0:13:29"])), "clips で前後が逆の区間を断る")
    check(refused(dict(base, ranges=["0:00:00-0:10:01"])),
          f"clips で1区間 {plan.CLIPS_MAX_SEC}秒を越えるのを断る")
    check(not refused(dict(base, ranges=["0:00:00-0:10:00"])),
          f"clips で1区間ちょうど {plan.CLIPS_MAX_SEC}秒は通す")
    check(refused(dict(base, ranges=["0:00:00-0:10:00", "0:10:00-0:20:00", "0:20:00-0:30:00",
                                     "0:30:00-0:30:01"])),
          f"clips で合計 {plan.CLIPS_MAX_TOTAL}秒を越えるのを断る")
    many = [f"0:{m:02d}:00-0:{m:02d}:05" for m in range(plan.CLIPS_MAX_COUNT + 1)]
    check(refused(dict(base, ranges=many)), f"clips で {plan.CLIPS_MAX_COUNT}区間を越えるのを断る")
    check(not refused(dict(base, ranges=many[:-1])), f"clips で {plan.CLIPS_MAX_COUNT}区間ちょうどは通す")
    check(refused(dict(base, ranges=RANGES, pubkey="")), "clips で公開鍵が無いのを断る")

    z = plan.items_of({"mode": "zoom", "video": "yk-by7R7iPA", "pubkey": pem,
                       "ranges": ["0:48:10-0:49:10", "0:50:25-0:51:45"]}, "selftest")
    check([i["dest"] for i in z] == ["yk-by7R7iPA/zoom-2890-2950-1fps",
                                     "yk-by7R7iPA/zoom-3025-3105-1fps"],
          "zoom は区間ごとに1本の job のまま")
    check(refused({"mode": "zoom", "video": "yk-by7R7iPA", "pubkey": pem}),
          "zoom で区間が無いのを断る（0本の job にしない）")
    a = plan.items_of({"mode": "archive", "videos": ["yk-by7R7iPA"], "pubkey": pem}, "selftest")
    check(len(a) == 1 and a[0]["dest"] == "yk-by7R7iPA/archive" and "ranges" not in a[0],
          "archive は動画ごとに1本・置き場は <id>/archive")
    check(refused({"mode": "clip", "videos": ["yk-by7R7iPA"], "pubkey": pem}),
          "知らない mode（clip）を断る")

    # 字幕だけの道（#1014）。fetch / analyze の列に入れず、captions / captions_count に分ける
    c = plan.items_of({"mode": "captions", "videos": ["VusdZVyjgjQ", "yk-by7R7iPA"],
                       "pubkey": pem}, "selftest")
    check([i["dest"] for i in c] == ["VusdZVyjgjQ/captions", "yk-by7R7iPA/captions"]
          and [i["key"] for i in c] == ["VusdZVyjgjQ__captions", "yk-by7R7iPA__captions"],
          "captions は動画ごとに1本・置き場は <id>/captions")
    check(all("whisper" not in i and "ranges" not in i and i.get("pubkey_sha256") for i in c),
          "captions は whisper も区間も持たず、公開鍵の指紋を持つ")
    check(refused({"mode": "captions", "videos": ["VusdZVyjgjQ"], "pubkey": ""}),
          "captions で公開鍵が無いのを断る")
    check(refused({"mode": "captions", "videos": ["VusdZVyjgjQ!"], "pubkey": pem}),
          "captions で動画IDの形が違うのを断る")

    def outputs(items: list) -> dict:
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "out"
            p.write_text("")
            old = os.environ.get("GITHUB_OUTPUT")
            os.environ["GITHUB_OUTPUT"] = str(p)
            try:
                plan.write_outputs(items, "claude/selftest")
            finally:
                if old is None:
                    os.environ.pop("GITHUB_OUTPUT")
                else:
                    os.environ["GITHUB_OUTPUT"] = old
            return dict(ln.split("=", 1) for ln in p.read_text().splitlines())

    o = outputs(c + a)
    mat = json.loads(o.get("matrix", "{}")).get("include", [])
    fet = json.loads(o.get("fetch", "{}")).get("include", [])
    cap = json.loads(o.get("captions", "{}")).get("include", [])
    check(o.get("count") == "1" and [i["mode"] for i in mat] == ["archive"]
          and [i["mode"] for i in fet] == ["archive"],
          f"captions を fetch / analyze の列に入れない（count={o.get('count')}）")
    check(o.get("captions_count") == "2" and [i["key"] for i in cap] == [i["key"] for i in c]
          and all("BEGIN PUBLIC KEY" in i.get("pubkey", "") for i in cap),
          f"captions は captions に鍵つきで並ぶ（captions_count={o.get('captions_count')}）")
    check(all("pubkey" not in i for i in fet), "取る列（fetch）には鍵を渡さないまま")
    o = outputs(c)
    check(o.get("count") == "0" and o.get("captions_count") == "2",
          "字幕だけの依頼では count が 0（空の fetch を起こさない）")
    o = outputs(a)
    check(o.get("count") == "1" and o.get("captions_count") == "0",
          "captions の無い依頼では captions_count が 0（字幕の job を起こさない）")

    print(f"\nNG  plan の見張り {len(fails)}件落ちた" if fails else "\nOK  plan の見張り 全部通った")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
