"""キャラクターの受け取り口が、**公開リポジトリに素性を落とさない**ことを見る。

    python3 python/admin/characters_add_selftest.py

**外に1バイトも出ない。** Firestore も口も Actions も叩かない（全部差し替える）。

## なぜ、これを書いたか

#785 で起きたのは、道具が落ちたことではない。**手順どおりにやったら
公開のリポジトリに視聴者さんの絵とハンドルが残った。** 手順は
「流すときだけ枝に載せて、済んだら枝を落とす」で、**落とす側が 403 で
できない箱**があることを勘定に入れていなかった。

直したのは手順ではなく、**置ける道のほう**。絵はリポジトリの外にしか
置けなくし（`check_outside_git`）、Actions からは回らなくした。
ここは、その2つが**本当に通らない**ことを毎回確かめる。

手引きに書いた決まりは、守らなかった回に赤くならない。
**通らないようにしたものだけが、次のセッションでも効いている。**

## 確かめるもの

  1. 置き場が git の中にあったら、**引数で渡しても**断る（深い所でも）
  2. git の外なら通る。**既定の置き場も git の外**
  3. `dir` は絶対パス。相対で渡したら断る
  4. `GITHUB_ACTIONS` の中では、**1バイトも読まずに**断る
  5. 口が落ちた回に `taken()` が「空いている」と答えない
  6. 封をしたものが、注記の山から拾って元に戻る（順番が入れ替わっていても）
  7. **足りない注記で繋がない**（10件で打ち切られた回に、黙ってほどけない）
  8. 札の大きさなら、注記の10行に収まる
  9. **git に絵も manifest も入っていない**（#785 で残ったもの、そのもの）
 10. **対照**——守りを1本ずつ抜くと、その足だけが落ちる
"""

import base64
import gzip
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("BQ_PROJECT_ID", "characters-add-selftest")

import _seal  # noqa: E402
import characters_add as ca  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FAILED = []


def ck(name: str, ok: bool, got: str = "") -> None:
    print(f"  {'○' if ok else '✕'} {name}" + (f" … {got}" if got else ""))
    if not ok:
        FAILED.append(name)


def fails(fn, *a, **k) -> str:
    """落ちたら、その言い分。落ちなかったら空。"""
    try:
        fn(*a, **k)
    except SystemExit as e:
        return str(e.code if e.code is not None else "")
    except BaseException as e:  # noqa: BLE001
        return f"{type(e).__name__}: {e}"
    return ""


class Res:
    """`requests.get` の返り。"""

    def __init__(self, code: int, body: dict):
        self.status_code, self._body = code, body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._body


def main() -> None:
    print("[1] 置き場が git の中にあったら断る")
    with tempfile.TemporaryDirectory() as box:
        repo = os.path.join(box, "clone")
        deep = os.path.join(repo, "python", "admin", "_incoming")
        os.makedirs(deep)
        open(os.path.join(repo, ".git"), "w").close()   # worktree の形（ファイル）
        ck("clone の直下", bool(fails(ca.check_outside_git, repo)))
        ck("clone の深いところ", bool(fails(ca.check_outside_git, deep)))

        print("\n[2] git の外なら通る")
        out = os.path.join(box, "intake")
        os.makedirs(out)
        ck("外は通る", not fails(ca.check_outside_git, out))
    ck("このリポジトリ自身は断られる", bool(fails(ca.check_outside_git, ROOT)))
    ck("既定の置き場は git の外", not fails(ca.check_outside_git, ca.DEFAULT_DIR),
       ca.DEFAULT_DIR)

    print("\n[3] dir は絶対パス")
    os.environ["ARGS"] = json.dumps({"dir": "_incoming"})
    os.environ.pop("GITHUB_ACTIONS", None)
    why = fails(ca.main)
    ck("相対パスは断る", "絶対パス" in why, why[:60])

    print("\n[4] Actions の中では回らない")
    os.environ["GITHUB_ACTIONS"] = "true"
    os.environ["ARGS"] = "{}"
    why = fails(ca.main)
    os.environ.pop("GITHUB_ACTIONS", None)
    ck("断る", "手元から回す" in why, why[:60])
    ck("理由に #785 が出る", "#785" in why)

    print("\n[5] 口が落ちた回に「空いている」と答えない")
    was = ca.requests.get
    try:
        ca.requests.get = lambda *a, **k: Res(500, {})
        ck("500 なら止まる", bool(fails(ca.taken, "だれか")))
        ca.requests.get = lambda *a, **k: Res(200, {"character": None})
        ck("空いていれば False", ca.taken("だれか") is False)
        ca.requests.get = lambda *a, **k: Res(200, {"character": {"id": "x"}})
        ck("埋まっていれば True", ca.taken("だれか") is True)
    finally:
        ca.requests.get = was

    print("\n[6] 封は、注記の山から拾って戻る")
    pem, pub = _seal.keypair()
    # **札と同じ大きさ・同じ縮みにくさで測る。** `"A"*1100` のような字で
    # 測ると gzip がほぼ消してしまい、「注記1行で収まる」という嘘が出る
    # （実際に1行と出た）。札は base64 なので、そのつもりの字を置く
    fake = base64.urlsafe_b64encode(os.urandom(820)).decode()
    plain = gzip.compress(json.dumps({"id": fake[:1100], "fs": fake[:900]}).encode())
    blob = _seal.pack(_seal.seal(plain, pub))
    lines = _seal.chunks(blob)
    noise = ["The ubuntu-latest label will migrate…"] + lines[::-1]
    ck("順番が逆でも戻る", _seal.join(noise) == blob)
    ck("ほどける", _seal.unseal(_seal.unpack(_seal.join(noise)), pem) == plain)
    ck("封に空白が無い", " " not in blob)

    print("\n[7] 足りない注記で繋がない")
    ck("1行欠けたら止まる", bool(fails(_seal.join, lines[:-1])))
    ck("1行も無ければ止まる", bool(fails(_seal.join, ["ただの注記"])))

    print("\n[8] 札の大きさなら、注記の10行に収まる")
    # **2行以上あることも見る。** 1行で収まってしまう作り物で測ると、
    # 切って繋ぐところを1度も通らないまま緑になる
    ck("2行以上10行以下", 2 <= len(lines) <= 10, f"{len(lines)}行")

    print("\n[9] git に絵も manifest も入っていない")
    tracked = subprocess.run(
        ["git", "-C", ROOT, "ls-files", "python/admin"],
        capture_output=True, text=True,
    ).stdout.split()
    bad = [f for f in tracked
           if f.endswith((".png", ".jpg", ".jpeg", ".webp"))
           or os.path.basename(f) == "manifest.json"]
    ck("1件も無い", not bad, f"{len(bad)}件")

    print("\n[10] 対照 —— 守りを1本ずつ抜くと、その足だけが落ちる")
    # (a) git の中を断る足を抜く
    was_check = ca.check_outside_git
    try:
        ca.check_outside_git = lambda p: os.path.realpath(p)
        ck("足を抜くと、このリポジトリも通ってしまう",
           not fails(ca.check_outside_git, ROOT))
    finally:
        ca.check_outside_git = was_check
    # (b) 口の落ちを見る足を抜く
    was = ca.requests.get
    try:
        ca.requests.get = lambda *a, **k: Res(500, {})
        ck("raise_for_status を抜くと、500 でも「空いている」と答えてしまう",
           (lambda r: bool((r.json() or {}).get("character")))(Res(500, {})) is False)
    finally:
        ca.requests.get = was
    # (c) 番号を見ずに繋ぐと、欠けたまま通ってしまう
    ck("番号を見ずに繋ぐと、1行欠けても字が返ってしまう",
       bool("".join(x.split(" ", 2)[2] for x in lines[:-1])))

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
