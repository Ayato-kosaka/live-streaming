"""封（seal.py）と開け（decrypt.py）の見張り。**YouTube にも GitHub にも触らない。**

    python3 tools/shorts/ingest/decrypt_selftest.py

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは openssl だけ。
ffmpeg は使わない（区間の切り出しそのものは `dryrun.py` が手元で見る）。

## 何を見るか

このリポジトリは公開で、作業枝に置くのは暗号文だけ。clips は暗号文が数百MB になり、
GitHub が 100MB を超えるファイルを断るので、seal.py は 45MB ずつに切って置く。
**切った暗号文を、切った順につないで、壊れていないと確かめてから開けること**が
ここで守るもの。順番を取り違えたり、1つ欠けたまま開いたりすると、CBC は黙って
壊れた tar を返す。

1. 小さく切ると `payload.enc.000, .001 …` になり、どれも切った大きさ以下・順に並ぶ
2. 切れ端からつないで開いたものが、封をする前と1バイトも違わない
3. 切らない形（`payload.enc` 1つ。前からの archive などの形）もそのまま開ける
4. manifest.json と暗号文に、中身（ファイル名・平文の目印）が出ていない
5. 開かないもの: 1バイト壊した切れ端 / sha256 を書き換えて辻褄を合わせた切れ端（HMAC で止まる）/
   欠けた切れ端 / 並びを入れ替えた切れ端 / 違う鍵 / git の中への展開
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

import seal  # noqa: E402
from plan import norm_pem  # noqa: E402

PY = sys.executable
MARK = "平文の目印-clips-selftest"


def keypair(d: Path, name: str) -> Path:
    priv = d / f"{name}.pem"
    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                    "-out", str(priv)], check=True, capture_output=True)
    return priv


def pub_of(priv: Path) -> str:
    return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                          capture_output=True, text=True).stdout


def opened(sealed: Path, priv: Path, out: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(priv), "--out", str(out),
                           str(sealed)], capture_output=True, text=True)


def same_tree(a: Path, b: Path) -> bool:
    fa = sorted(p.relative_to(a) for p in a.rglob("*") if p.is_file())
    fb = sorted(p.relative_to(b) for p in b.rglob("*") if p.is_file())
    return fa == fb and all((a / r).read_bytes() == (b / r).read_bytes() for r in fa)


def main() -> int:
    fails: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"{'ok' if ok else 'NG'}  {what}")
        if not ok:
            fails.append(what)

    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        priv, other = keypair(root, "priv"), keypair(root, "other")
        pem, fp = norm_pem(pub_of(priv))

        # 封をする中身。mp4 の代わりに乱数（縮まないので、暗号文の大きさが読める）
        src = root / "plain"
        (src / "logs").mkdir(parents=True)
        (src / "01_0-13-29_0-14-05.mp4").write_bytes(os.urandom(300_000))
        (src / "index.json").write_text(json.dumps({"note": MARK}, ensure_ascii=False))
        (src / "logs" / "ffmpeg_clips.log").write_text(MARK)
        item = {"key": "selftest000__clips", "mode": "clips", "video": "selftest000",
                "dir": "clips", "dest": "selftest000/clips", "pubkey": pem, "pubkey_sha256": fp}
        st = {"stages": {"download": "ok", "meta": "ok", "clips": "ok"}, "counts": {"clips": 1}}

        # 1. 小さく切る
        seal.PART = 64 * 1024
        multi = root / "sealed-multi" / item["dest"]
        man = seal.seal(item, src, multi, st)
        parts = man["encrypted_files"]
        names = [p["name"] for p in parts]
        check(len(parts) >= 4 and names == [f"payload.enc.{i:03d}" for i in range(len(parts))],
              f"64KB で切ると payload.enc.000 から順に並ぶ（{len(parts)}個）")
        check(all(p["bytes"] == seal.PART for p in parts[:-1]) and 0 < parts[-1]["bytes"] <= seal.PART,
              "最後の1つ以外はちょうど切った大きさ・最後はそれ以下")
        check(sum(p["bytes"] for p in parts) == man["bytes"]["encrypted"],
              "切れ端の合計が暗号文の大きさと同じ")
        check(not (multi / "payload.enc").exists(), "切ったときは payload.enc（1つの形）を置かない")
        check(man["status"] == "ok" and man["counts"].get("clips") == 1, "manifest の状態と数")

        # 4. 中身が平文で出ていない
        leaked = [f.name for f in multi.iterdir()
                  if MARK.encode() in f.read_bytes() or b"0-13-29" in f.read_bytes()]
        check(not leaked, f"manifest と暗号文に、ファイル名も平文の目印も出ていない（{leaked}）")

        # 2. つないで開く
        r = opened(multi, priv, root / "o1")
        check(r.returncode == 0 and same_tree(src, root / "o1" / item["dest"]),
              f"切れ端からつないで開いたものが元と1バイトも違わない（{r.stdout.strip()[:80]}）")

        # 3. 切らない形（前からの形）
        seal.PART = 45 * 1024 * 1024
        single = root / "sealed-single" / item["dest"]
        man1 = seal.seal(item, src, single, st)
        check([p["name"] for p in man1["encrypted_files"]] == ["payload.enc"],
              "45MB に届かなければ payload.enc 1つ（前からの形）")
        r = opened(single, priv, root / "o2")
        check(r.returncode == 0 and same_tree(src, root / "o2" / item["dest"]),
              "1つの形もそのまま開ける")

        # 5. 開かないもの。1つ試すごとに元へ戻す
        def broken(what: str, mutate) -> None:
            saved = {f.name: f.read_bytes() for f in multi.iterdir()}
            try:
                mutate()
                out = root / f"bad-{len(fails)}-{abs(hash(what)) % 10**6}"
                r = opened(multi, priv, out)
                check(r.returncode == 1 and not (out / item["dest"]).exists(),
                      f"{what} は開かない（{r.stdout.strip()[-60:]}）")
            finally:
                for f in list(multi.iterdir()):
                    f.unlink()
                for n, b in saved.items():
                    (multi / n).write_bytes(b)

        def flip(name: str) -> None:
            b = bytearray((multi / name).read_bytes())
            b[len(b) // 2] ^= 1
            (multi / name).write_bytes(bytes(b))

        def flip_and_fix_sha() -> None:
            flip(names[2])
            m = json.loads((multi / "manifest.json").read_text())
            m["encrypted_files"][2]["sha256"] = seal.sha256_file(multi / names[2])
            (multi / "manifest.json").write_text(json.dumps(m))

        def swap() -> None:
            m = json.loads((multi / "manifest.json").read_text())
            ef = m["encrypted_files"]
            ef[1], ef[2] = ef[2], ef[1]
            (multi / "manifest.json").write_text(json.dumps(m))

        broken("真ん中の切れ端を1バイト壊したもの", lambda: flip(names[2]))
        broken("壊して sha256 も書き換えたもの（HMAC で止まる）", flip_and_fix_sha)
        broken("切れ端が1つ欠けたもの", lambda: (multi / names[1]).unlink())
        broken("切れ端の並びを入れ替えたもの", swap)
        r = opened(multi, other, root / "o3")
        check(r.returncode == 1, "違う鍵では開かない")
        fake = root / "fakerepo"
        (fake / ".git").mkdir(parents=True)
        r = opened(multi, priv, fake / "inner")
        check(r.returncode == 2, "git の中へは展開しない（2 で断る）")

    print(f"\nNG  封と開けの見張り {len(fails)}件落ちた" if fails else "\nOK  封と開けの見張り 全部通った")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
