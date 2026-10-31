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
6. clips の見る用の小さな封（#1011）: manifest.json・sheets.key.enc・sheets.enc の3つだけ
   （mp4 の暗号文は無い）で `--sheets` が開き、出てくるのはシートと一覧だけ（mp4 もログも無い）・
   元と1バイトも違わない。壊したもの・違う鍵・小さな封の無い回（archive）は開かない。
   `--branch` の取りかた（fetch_remote / remote_dests）を偽の GitHub で回し、
   **取りに行くのが manifest と小さな封だけ**（payload.enc を1つも頼まない）こと、
   ほかの鍵の置き場は manifest だけ読んで飛ばすことを見る
7. `--branch` が GitHub に化かされない（2026-10-23）。contents の raw は、乱数のファイルを
   UTF-16BE の文字と見立てて UTF-8 に書き換えて返すことがある（dRXae0mJw8M の key.enc が
   384→571バイトになり、openssl が開けなかった）。偽の GitHub に同じ書き換えをさせて、
   [対照] 前の取りかた（contents の raw）では key.enc が化けて開けない（＝偽の GitHub が本当に化かしている）/
   直した取りかた（blob の raw）では大きいほうまで元のまま開く /
   [対照] blob まで化けたら git の hash の突き合わせで止める /
   main ごと回して、化けた置き場だけ NG・終了コード 1・ほかの置き場は開く、を見る
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import shutil
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


def files_of(d: Path) -> list[str]:
    return sorted(p.relative_to(d).as_posix() for p in d.rglob("*") if p.is_file())


def light_leg(root: Path, src: Path, item: dict, st: dict, priv: Path, other: Path,
              check, light_want: list[str]) -> None:
    """6. clips の見る用の小さな封（sheets.key.enc・sheets.enc）だけで、シートに届く。"""
    import decrypt

    seal.PART = 45 * 1024 * 1024
    full = root / "sealed-light" / item["dest"]
    man = seal.seal(item, src, full, st)
    lt = man.get("sheets") or {}
    lnames = [lt.get("key_file"), *[f["name"] for f in lt.get("encrypted_files") or []]]
    check(lnames == ["sheets.key.enc", "sheets.enc"] and all((full / n).is_file() for n in lnames),
          f"clips の封に見る用の小さな封が並ぶ（{lnames}）")
    check(lt.get("sheets") == 2 and lt.get("files") == len(light_want),
          f"manifest の sheets に枚数とファイル数（{lt.get('sheets')}枚・{lt.get('files')}）")
    check(0 < lt.get("bytes", {}).get("encrypted", 0) < man["bytes"]["encrypted"] / 3,
          "見る用の封は mp4 の入った封よりずっと小さい")
    if not lt:
        check(False, "小さな封が無いので、ここから先（--sheets で開く・--branch）は回せない")
        return

    # mp4 の暗号文を持たない置き場（manifest と小さな封の3つだけ）
    only = root / "light-only" / item["dest"]
    only.mkdir(parents=True)
    for n in ["manifest.json", *lnames]:
        (only / n).write_bytes((full / n).read_bytes())
    out = root / "o-light"
    r = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(priv), "--out", str(out),
                        "--sheets", str(only)], capture_output=True, text=True)
    got = out / item["dest"]
    check(r.returncode == 0 and got.is_dir() and files_of(got) == light_want
          and all((got / f).read_bytes() == (src / f).read_bytes() for f in light_want),
          f"payload.enc が無くても --sheets で開け、シートと一覧だけが元のまま出る（{r.stdout.strip()[-70:]}）")

    def refused(what: str, d: Path, key: Path = priv) -> None:
        o = root / f"o-light-bad-{abs(hash(what)) % 10**6}"
        r = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(key), "--out", str(o),
                            "--sheets", str(d)], capture_output=True, text=True)
        check(r.returncode == 1 and not (o / item["dest"] / "sheets").exists(),
              f"{what} は --sheets でも開かない（{r.stdout.strip()[-50:]}）")

    bad = root / "light-bad" / item["dest"]
    shutil.copytree(only, bad)
    b = bytearray((bad / "sheets.enc").read_bytes())
    b[len(b) // 2] ^= 1
    (bad / "sheets.enc").write_bytes(bytes(b))
    m = json.loads((bad / "manifest.json").read_text())
    m["sheets"]["encrypted_files"][0]["sha256"] = seal.sha256_file(bad / "sheets.enc")
    (bad / "manifest.json").write_text(json.dumps(m))
    refused("壊して sha256 も書き換えた小さな封（HMAC で止まる）", bad)
    refused("違う鍵", only, other)
    arch = root / "sealed-archive" / "selftest000/archive"
    seal.seal(dict(item, mode="archive", key="selftest000__archive", dir="archive",
                   dest="selftest000/archive"), src, arch, st)
    check(not (arch / "sheets.enc").exists() and "sheets" not in json.loads(
        (arch / "manifest.json").read_text()), "archive には小さな封を作らない")
    refused("小さな封の無い回（archive）", arch)

    # --branch の取りかた。偽の GitHub（commit → tree → 置き場の一覧 → blob）で回す
    asked: list[str] = []
    mine, theirs = "aaaaaaaaaaa/clips", "bbbbbbbbbbb/clips"
    m2 = json.loads((full / "manifest.json").read_text())
    m2["pubkey_sha256"] = "0" * 64
    places = {mine: {p.name: p.read_bytes() for p in full.iterdir()},
              theirs: {"manifest.json": json.dumps(m2).encode(), "sheets.enc": b"x"}}
    get = fake_hub(places, asked)

    dests = decrypt.remote_dests("o/r", "SHA", get=get)
    check(dests == [mine, theirs], f"--branch: 小さな封を持つ置き場だけを並べる（{dests}）")
    into = root / "o-remote" / ".sealed"
    fp = decrypt.pub_fp(priv)
    d1, _ = decrypt.fetch_remote("o/r", "SHA", mine, into, fp, True, get=get)
    d2, why2 = decrypt.fetch_remote("o/r", "SHA", theirs, into, fp, True, get=get)
    name_of = {gitsha(c): n for fs in places.values() for n, c in fs.items()}
    names = [name_of.get(a.rsplit("/", 1)[1], a) for a in asked if "/git/blobs/" in a]
    check(sorted(names) == sorted(["manifest.json", "sheets.key.enc", "sheets.enc", "manifest.json"]),
          f"--branch: 取りに行くのは manifest と小さな封だけ（payload.enc を頼まない。{names}）")
    check(d2 is None and "鍵が違う" in why2, "--branch: ほかの鍵の置き場は manifest だけ読んで飛ばす")
    ok, msg = decrypt.open_one(d1, priv, fp, root / "o-remote", sheets=True)
    check(ok and files_of(root / "o-remote" / item["dest"]) == light_want,
          f"--branch: 取った3つだけで開ける（{msg[-40:]}）")

    garble_leg(root, src, full, item, st, priv, check)


def gitsha(b: bytes) -> str:
    """git の blob の sha（`git hash-object` と同じ）。"""
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


def as_text(b: bytes) -> bytes:
    """GitHub の contents の raw がしたこと（2026-10-23）: UTF-8 でない中身を UTF-16BE の文字と
    見立てて、UTF-8 に書き直して返す。dRXae0mJw8M の key.enc 384バイトが 571バイトになった"""
    try:
        b.decode("utf-8")
        return b
    except UnicodeDecodeError:
        return b.decode("utf-16-be", errors="replace").encode("utf-8")


def fake_hub(places: dict[str, dict[str, bytes]], asked: list[str],
             garbled: frozenset[str] = frozenset()):
    """偽の GitHub。contents の raw は本物と同じく文字に書き換える。
    blob の raw はそのまま返す（garbled に挙げた置き場だけ、blob も書き換えて返す＝対照）"""
    where = {gitsha(c): (rel, c) for rel, fs in places.items() for c in fs.values()}

    def get(api: str, to: Path | None = None, raw: bool = False) -> bytes:
        asked.append(api)
        if "/commits/" in api:
            return json.dumps({"sha": "SHA", "commit": {"tree": {"sha": "t0"}}}).encode()
        trees = {"t0": [{"path": "shorts", "type": "tree", "sha": "t1"}],
                 "t1": [{"path": ".work", "type": "tree", "sha": "t2"}]}
        for t, rows in trees.items():
            if api.endswith(f"/git/trees/{t}"):
                return json.dumps({"tree": rows}).encode()
        if api.endswith("/git/trees/t2?recursive=1"):
            rows = [{"path": f"{d}/{n}", "type": "blob"} for d, fs in places.items() for n in fs]
            rows.append({"path": "ccccccccccc/archive/payload.enc", "type": "blob"})
            return json.dumps({"tree": rows}).encode()
        if "/git/blobs/" in api:
            rel, body = where[api.rsplit("/", 1)[1]]
            body = as_text(body) if rel in garbled else body
        else:
            tail = api.split("/contents/shorts/.work/")[1].split("?ref=")[0]
            if tail in places:  # 置き場の一覧（JSON。raw ではない）
                body = json.dumps([{"name": n, "type": "file", "sha": gitsha(c), "size": len(c)}
                                   for n, c in places[tail].items()]).encode()
            else:  # 前の取りかた（contents の raw）。本物の GitHub と同じく書き換える
                rel, name = tail.rsplit("/", 1)
                body = as_text(places[rel][name])
        if to is None:
            return body
        to.parent.mkdir(parents=True, exist_ok=True)
        to.write_bytes(body)
        return b""

    return get


def garble_leg(root: Path, src: Path, full: Path, item: dict, st: dict, priv: Path,
               check) -> None:
    """7. GitHub が乱数を文字と見立てて書き換えても、化けたものは開かず、枝の中身どおりに取る。"""
    import decrypt

    fp = decrypt.pub_fp(priv)
    place = "ddddddddddd/clips"
    places = {place: {p.name: p.read_bytes() for p in full.iterdir()}}
    man = json.loads(places[place]["manifest.json"])
    need = ["manifest.json", "key.enc", *[p["name"] for p in man["encrypted_files"]]]

    # 対照: 前の取りかた（contents の raw）で取ると、key.enc が化けて届き、開けない。
    # ここが「開けた」なら、偽の GitHub が化かしていない（この足は何も見ていない）
    old = root / "o-garble-old" / ".sealed" / place
    get = fake_hub(places, [])
    for n in need:
        get(f"repos/o/r/contents/shorts/.work/{place}/{n}?ref=SHA", old / n, raw=True)
    k_was, k_got = len(places[place]["key.enc"]), (old / "key.enc").stat().st_size
    try:
        ok_old, why_old = decrypt.open_one(old, priv, fp, root / "o-garble-old")
    except subprocess.CalledProcessError:
        ok_old, why_old = False, "openssl が包んだ鍵を開けない（CalledProcessError）"
    check(k_got != k_was and not ok_old,
          f"[対照] 前の取りかた（contents の raw）では key.enc が {k_was}→{k_got}バイトに化けて"
          f"開けない（{why_old[:40]}）")

    # 直した取りかた（blob の raw）。mp4 の入った大きいほうも、元と1バイトも違わず開く
    asked: list[str] = []
    got, _ = decrypt.fetch_remote("o/r", "SHA", place, root / "o-garble" / ".sealed", None, False,
                                  get=fake_hub(places, asked))
    ok, msg = decrypt.open_one(got, priv, fp, root / "o-garble")
    by_contents = [a for a in asked if "/contents/" in a and a.split("?")[0].rsplit("/", 1)[1] in need]
    check(ok and same_tree(src, root / "o-garble" / item["dest"]) and not by_contents,
          f"--branch: 中身は blob で取り、化かされずに大きいほうまで元のまま開く"
          f"（contents の raw で取ったもの {len(by_contents)}個。{msg[-30:]}）")

    # 対照: blob まで化けて届いたら、突き合わせで止まり、何も開かない
    try:
        decrypt.fetch_remote("o/r", "SHA", place, root / "o-garble-bad" / ".sealed", None, False,
                             get=fake_hub(places, [], garbled=frozenset({place})))
        stopped, why = False, "止まらずに取り終えた"
    except decrypt.Garbled as e:
        stopped, why = True, str(e)
    # manifest.json は文字なので化けない。止まるのは乱数の key.enc のところ
    check(stopped and why.startswith("key.enc"),
          f"[対照] blob が化けて届いたら、git の hash の突き合わせで止める（{why[:50]}）")

    # main ごと: 化けた置き場は NG と数えて終了コード 1、化けていない置き場はそのまま開く。
    # 中身が同じだと blob の sha が重なるので、化けない側は封をし直した別物にする
    good = "eeeeeeeeeee/clips"
    full2 = root / "sealed-light-2" / item["dest"]
    seal.seal(item, src, full2, st)
    places2 = {good: {p.name: p.read_bytes() for p in full2.iterdir()}, place: places[place]}
    out = root / "o-garble-main"
    argv, saved = sys.argv, decrypt.gh_get
    buf = io.StringIO()
    try:
        decrypt.gh_get = fake_hub(places2, [], garbled=frozenset({place}))
        sys.argv = ["decrypt.py", "--key", str(priv), "--out", str(out), "--sheets",
                    "--branch", "b", f"shorts/.work/{good}", f"shorts/.work/{place}"]
        with contextlib.redirect_stdout(buf):
            rc = decrypt.main()
    finally:
        sys.argv, decrypt.gh_get = argv, saved
    text = buf.getvalue()
    check(rc == 1 and f"NG  {place}" in text and (out / item["dest"] / "sheets").is_dir(),
          f"--branch: 化けた置き場だけ NG にして終了コード 1、ほかは開く（rc={rc}）")


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
        # 見る用の小さな封に入るもの（seal.LIGHT）。シートは乱数で代える
        (src / "sheets").mkdir()
        (src / "sheets" / "01_01.jpg").write_bytes(os.urandom(20_000))
        (src / "sheets" / "01_02.jpg").write_bytes(os.urandom(15_000))
        (src / "sheets.csv").write_text("clip,file\n1,sheets/01_01.jpg\n1,sheets/01_02.jpg\n")
        (src / "meta.json").write_text(json.dumps({"title": MARK}, ensure_ascii=False))
        light_want = ["index.json", "meta.json", "sheets.csv", "sheets/01_01.jpg",
                      "sheets/01_02.jpg"]
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

        # 6. 見る用の小さな封だけで開く
        light_leg(root, src, item, st, priv, other, check, light_want)

    print(f"\nNG  封と開けの見張り {len(fails)}件落ちた" if fails else "\nOK  封と開けの見張り 全部通った")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
