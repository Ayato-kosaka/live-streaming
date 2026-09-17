"""**毎晩の「戻せるか試す」が、本当に落ちられるのかを見る。**

    python3 python/backup_drill_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

BigQuery も Firestore も資格情報も要らない。**偽の置き場だけで回る。**

## なぜ要るか

`.github/workflows/backup.yml` の `drill` は、**「取れているだけでは退避では
ない」**という正しい考えで置いてある。ところが 2026-09-17 に棚卸ししたら、
その演習は**落ちられなかった。**

1. `restore.py --photo` は、置き場に写真が**1枚も無い晩**を `::warning::` と
   終了コード 0 で通していた。**0枚で緑**は「戻せた」ではなく
   「**何も戻していない**」で、いちばん見張ってほしい晩に黙る形
2. `drill` の `if: ${{ !inputs.dry_run }}` は、cron のとき `inputs.dry_run` が
   空文字になるのに賭けていた。同じ書きかたが当てにならないと `rebake.yml` に
   自分で書いてあるのに、ここだけ手当てが無かった
3. **19 run 走って、一度も捕まえたことがない。** それが「退避が健全」なのか
   「演習が何も見ていない」のかを、走った回数からは決められない

3 を決めるのがこのファイル。**演習自身に、落ちられることを証明させる。**

## 何を見るか

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 1 | **演習の step が `run:` に在るか**（分母） | 書いただけで繋がっていない（#125） |
| 2 | **押しかたが、押した人のいない回でも決まるか** | cron の空文字に賭けている |
| 3 | **壊していない写しが先に通る** | 何にでも赤を出す演習になっている |
| 4 | **壊した写真で落ちる**（5通り） | 寝ている演習。緑が何も言っていない |
| 5 | **戻したのに中身が違うコレクションで落ちる** | 件数だけ見て通している |
| 6 | **本番へ書く道に、合言葉の関所が立っている** | 演習が本番を上書きしうる |

3 と 4・5 は**対**で見る。片方だけだと、何にでも赤を出す演習も通る
（`docs/island-standards.md` §15、`docs/island-misses.md` #125）。

## 壊しかたを5通りにしてある理由

大きさと指紋だけでは足りない。`size` も `sha256` も**取ったときの実体から
計算して一緒に書いている**ので、**行の中で辻褄が合ったまま壊れた**実体が
入りうる。

- **1バイト違う** / **欠けた** … 置き場の中で腐った形。指紋と大きさで出る
- **空っぽ**（0 バイト・`sha256` は空のそれ）… 辻褄は合っている。
  **指紋だけ見ていると素通りする**
- **絵ではない**（合言葉の切れた URL から返った HTML）… これも辻褄が合う。
  戻した先に絵は無いのに、突き合わせは一致と出る
- **置き場が0枚** … 演習そのものが何も見ていない晩

## ログに何を出さないか

置き場の名前（`nordic/photos/<日>/<書類ID>…`）は貼った人を指しうる。
このリポジトリは公開で Actions のログも誰でも読めるので、**偽物のぶんも
含めて名前は出さない。** 出すのは枚数と 〇✕ だけ。
"""

from __future__ import annotations

import base64
import contextlib
import datetime as dt
import hashlib
import io
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

YML = ROOT.parent / ".github" / "workflows" / "backup.yml"

fails: list[str] = []
checks = 0


def say(ok: bool, line: str) -> None:
    global checks
    checks += 1
    print(("  OK   " if ok else "  NG   ") + line)
    if not ok:
        fails.append(line)


# ---------------------------------------------------------------- 切り出し


def yml_text() -> str:
    return YML.read_text(encoding="utf-8")


def run_lines() -> str:
    """ワークフローの `run:` だけを、**注釈を落として**繋いだ字。

    注釈を落とすのが要。名前がコメントにだけ出ているものを「走る」と読んで、
    1晩見のがしたことがある（`docs/island-misses.md` #125 の数えかた）。
    """
    return "\n".join(re.sub(r"\s#.*", "", ln) for ln in yml_text().split("\n"))


def shell_of(step: str) -> str:
    """step の `run: |` の中身を取り出す（**PyYAML を使わない**）。

    この演習は、ワークフローの `pip install` より前でも回せるようにしてある。
    毎晩の箱に何が入っているかに寄りかからない。
    """
    text = yml_text()
    head = text.index(f"- name: {step}")
    lo = text.index("run: |\n", head) + len("run: |\n")
    out = []
    for ln in text[lo:].split("\n"):
        if ln.strip() and not ln.startswith(" " * 10):
            break
        out.append(ln[10:] if len(ln) > 10 else "")
    return "\n".join(out)


# ---------------------------------------------------------------- 1. 繋ぎ（分母）

# **毎晩の演習が呼ぶもの。** ここに並べたものが `run:` に無ければ、
# それは「書いてあるだけ」（`docs/island-misses.md` #125）
WIRED = [
    ("戻す本体（コレクション）", "backup_restore_test.py"),
    ("戻す本体（写真）", "restore.py --photo"),
    ("この対照そのもの", "backup_drill_selftest.py"),
    ("取るほうの対照", "photos_selftest.py"),
]


def check_admin_verify() -> None:
    """手で押す側（`{"verify": true}`）も、毎晩と同じ見かたを通るか。

    出る口が2つあるなら見張りも2つ要る、と同じ話で、**見かたが2つあると
    片方だけ古いまま残る。** 実際に `restore_photo`（大きさと指紋だけ）が
    こちらに残っていた。
    """
    src = (ROOT / "admin/backup_photos.py").read_text(encoding="utf-8")
    body = "\n".join(ln for ln in src.split("\n") if not ln.strip().startswith("#"))
    say("restore.drill_photos(" in body,
        "手で押す `verify` が、毎晩と同じ `drill_photos` を通る")
    say("restore.restore_photo(" not in body,
        "大きさと指紋だけを見る古い口（`restore_photo`）が残っていない")


def check_wiring() -> None:
    print("\n1. 演習の step が、ワークフローの `run:` に在るか（分母）")
    text = run_lines()
    for label, needle in WIRED:
        say(needle in text, f"{label}: `{needle}` が `run:` に在る")

    # **`if:` に `inputs.dry_run` を直に書かない。** cron の空文字に賭ける形
    # **job の `drill:` を取る。** `take` の outputs にも `drill:` が在るので、
    # 字面の最初の当たりを拾うと、そちらを見てしまう（実際に1回はまった）
    drill = text[re.search(r"^  drill:$", text, re.M).start():]
    cond = [ln for ln in drill.split("\n")[:14] if ln.strip().startswith("if:")]
    say(bool(cond), f"`drill` に `if:` が在る（{cond or 'なし'}）")
    say(all("inputs.dry_run" not in c for c in cond),
        "`drill` の `if:` が `inputs.dry_run` を直に見ていない"
        f"（いま: {' '.join(c.strip() for c in cond)}）")


# ---------------------------------------------------------------- 2. 押しかた

# (イベント, inputs.dry_run の来かた, 取るか, 戻す試しをするか)
#
# **cron と workflow_run は `inputs.*` が空文字で来る。** そこを「false と
# 読まれるから大丈夫」で済ませない、というのがこの表の全部
PUSHES = [
    ("schedule", "", "0", "1"),
    ("workflow_run", "", "0", "1"),
    ("workflow_dispatch", "true", "1", "0"),
    ("workflow_dispatch", "false", "0", "1"),
    ("workflow_dispatch", "", "0", "1"),
]


def check_mode() -> None:
    print("\n2. 押しかたが、押す人のいない回でも決まるか")
    src = shell_of("今回の押しかたを決める")
    print(f"  backup.yml の step「今回の押しかたを決める」を切り出した"
          f"（{len(src.splitlines())} 行）")
    for event, dry_in, want_dry, want_drill in PUSHES:
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "out"
            env = Path(td) / "env"
            out.write_text("")
            env.write_text("")
            r = subprocess.run(
                ["bash", "-c", src],
                env={**os.environ, "EVENT": event, "IN_DRY": dry_in,
                     "GITHUB_OUTPUT": str(out), "GITHUB_ENV": str(env)},
                capture_output=True, text=True,
            )
            got = dict(ln.split("=", 1) for ln in out.read_text().split("\n") if "=" in ln)
            shown = f"{event} / dry_run={dry_in or '（空文字）'}"
            ok = (r.returncode == 0 and got.get("dry") == want_dry
                  and got.get("drill") == want_drill)
            say(ok, f"{shown} → 取る {want_dry == '0'} ・戻す試し "
                    f"{want_drill == '1'}（実際: dry={got.get('dry')} "
                    f"drill={got.get('drill')} 終了コード {r.returncode}）")


# ---------------------------------------------------------------- 偽の置き場

# 頭が本物の JPEG になっている実体。**中身が絵かどうかまで見るので、
# ここを `FAKE-JPEG-` のような字にすると、壊していない写しが落ちる**
JPEG_HEAD = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
PNG_HEAD = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"


def photo_body(i: int) -> bytes:
    head = PNG_HEAD if i % 3 == 0 else JPEG_HEAD
    return head + (f"-{i:04d}-".encode() * 400)


def photo_row(i: int, body: bytes | None = None, size: int | None = None,
              sha: str | None = None) -> dict:
    b = photo_body(i) if body is None else body
    return {
        # 名前は出さないが、形は本番と同じにしておく
        "path": f"nordic/photos/2026-09-1{i % 9}/doc{i:04d}.jpg",
        "taken_at": f"2026-09-1{i % 9}T02:00:00+00:00",
        "size": len(b) if size is None else size,
        "sha256": hashlib.sha256(b).hexdigest() if sha is None else sha,
        "content_type": "image/jpeg",
        "body": b,
    }


def fake_store(rows: list[dict]):
    """`photos.stats_bq` / `photos.read_sample_bq` / `photos.read_row_bq` の代わり。

    **1行も外へ出ない。** 引く順は本番と同じく「salt で並べ替え」に寄せて、
    枚数だけ本物と同じ形で返す。
    """
    def stats(_c):
        return {"n": len(rows), "paths": len({r["path"] for r in rows}),
                "bytes": sum(int(r["size"]) for r in rows)}

    def sample(_c, n, salt):
        order = sorted(rows, key=lambda r: hashlib.sha256((r["path"] + salt).encode()).digest())
        return order[:n]

    def read_row(_c):
        def read(path):
            for r in rows:
                if path is None or r["path"] == path:
                    return r
            return None
        return read

    return stats, sample, read_row


def run_photo_drill(rows: list[dict], n: int = 5) -> tuple[int, str]:
    """`restore.py --photo` を、偽の置き場に当てて1回回す。"""
    from backup import photos, restore  # noqa: PLC0415

    stats, sample, read_row = fake_store(rows)
    keep = (photos.stats_bq, photos.read_sample_bq, photos.read_row_bq, sys.argv)
    buf = io.StringIO()
    # **logging は `redirect_stdout` では拾えない。** ハンドラは作られた時点の
    # `sys.stdout` を握っているので、袋にも流す枝を1本足す。
    # ここを足さずに「分母がログに在る」を見ると、**いつも空の袋を grep する
    # ことになって、対照が何も言わなくなる**（`docs/island-standards.md` §15）
    tap = logging.StreamHandler(buf)
    tap.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
    try:
        photos.stats_bq, photos.read_sample_bq, photos.read_row_bq = stats, sample, read_row
        restore.sink.client = lambda: "偽の置き場"
        restore.log.addHandler(tap)
        sys.argv = ["restore.py", "--photo", "--photo-n", str(n)]
        with contextlib.redirect_stdout(buf):
            code = restore.main()
    finally:
        restore.log.removeHandler(tap)
        photos.stats_bq, photos.read_sample_bq, photos.read_row_bq, sys.argv = keep
    return code, buf.getvalue()


# ---------------------------------------------------------------- 3・4. 写真


def check_photo_clean(n: int) -> None:
    print("\n3. 壊していない写しが、先に通る（写真）")
    rows = [photo_row(i) for i in range(n)]
    code, out = run_photo_drill(rows)
    say(code == 0, f"終了コード 0（実際: {code}）")
    say(f"{n} 枚" in out, f"**分母を出す**——置き場の枚数（{n} 枚）がログに在る")
    say("大きさ一致 5 ・指紋一致 5 ・中身が絵 5 ・空 0" in out,
        "何枚を大きさ・指紋・中身まで見たかを出す")
    for ln in out.splitlines():
        if "置き場の写真" in ln or "戻した" in ln or "バイト列が記録" in ln:
            print("       " + ln.split("INFO - ")[-1])


# 壊しかた。(名前, 行を壊す関数, 期待する終了コード)
#
# **どれも「行の中では辻褄が合う」ものを混ぜてある。** 空っぽと HTML は
# `size` も `sha256` もその中身どおりなので、指紋だけ見ていると素通りする
BREAKS = [
    # **真ん中の1バイト。** 頭を潰すと「絵ではない」でも落ちるので、
    # 指紋だけで捕まえられるかが見えない
    ("1バイト違う（頭は絵のまま）",
     lambda r: {**r, "body": r["body"][:600] + bytes([r["body"][600] ^ 0xFF])
                + r["body"][601:]}, 1),
    ("欠けた（途中で切れている）",
     lambda r: {**r, "body": r["body"][: len(r["body"]) // 2]}, 1),
    ("空っぽ（0 バイト・大きさも指紋もそれに合わせてある）",
     lambda r: {**r, "body": b"", "size": 0,
                "sha256": hashlib.sha256(b"").hexdigest()}, 1),
    ("絵ではない（合言葉の切れた URL から返った HTML）",
     lambda r: (lambda b: {**r, "body": b, "size": len(b),
                           "sha256": hashlib.sha256(b).hexdigest()})(
         b"<!doctype html><html><body>403 Forbidden</body></html>"), 1),
]


def check_photo_broken(n: int) -> None:
    print("\n4. 壊した写しで、落ちるか（写真）")
    print(f"     {n} 枚のうち**1枚だけ**を壊す。全部壊すと、"
          "1枚でも見ていれば通ってしまう")
    for label, break_it, want in BREAKS:
        rows = [photo_row(i) for i in range(n)]
        # **いちばん最後に引かれる1枚**を壊す。先頭だけ見て打ち切る作りを弾く
        _, sample, _ = fake_store(rows)
        victim = sample(None, n, dt.date.today().isoformat())[-1]
        rows = [break_it(r) if r is victim else r for r in rows]
        code, out = run_photo_drill(rows)
        hit = [ln for ln in out.splitlines() if ln.startswith("::error::戻せない写真")]
        say(code == want and len(hit) == 1,
            f"{label} → 終了コード {want}（実際: {code} / ::error:: {len(hit)} 行）")
        if hit:
            print("       " + hit[0].replace("::error::", "→ "))

    print("\n4e. 置き場が0枚の晩")
    code, out = run_photo_drill([])
    err = [ln for ln in out.splitlines() if ln.startswith("::error::")]
    say(code == 2, f"0枚は**緑にしない**——終了コード 2（実際: {code}）")
    say(bool(err), f"何が無かったかを言う（{err[:1] or 'なし'}）")
    say("::warning::" not in out, "警告で済ませていない")


# ---------------------------------------------------------------- 偽の Firestore


class FakeDoc:
    def __init__(self, doc_id, data):
        self.id, self._d = doc_id, data

    def to_dict(self):
        return self._d


class FakeRef:
    def __init__(self, col, doc_id):
        self.col, self.id = col, doc_id


class FakeCollection:
    def __init__(self, store):
        self.store = store

    def stream(self):
        return [FakeDoc(k, v) for k, v in sorted(self.store.items())]

    def document(self, doc_id):
        return FakeRef(self, doc_id)


class FakeBatch:
    """戻し先の Firestore。`twist` で、**書いたつもりの書き損じ**を作れる。"""

    def __init__(self, store, twist=None):
        self.store, self.twist, self.pending = store, twist, []

    def set(self, ref, data):
        self.pending.append((ref.id, data))

    def commit(self):
        for doc_id, data in self.pending:
            keep, data = (self.twist or (lambda i, d: (True, d)))(doc_id, data)
            if keep:
                self.store[doc_id] = data
        self.pending = []


class FakeFirestore:
    def __init__(self, store, twist=None):
        self.store, self.twist = store, twist

    def collection(self, _name):
        return FakeCollection(self.store)

    def batch(self):
        return FakeBatch(self.store, self.twist)

    def document(self, path):
        return FakeRef(None, path)


def fake_firestore_module(store, twist=None):
    """`from google.cloud import firestore` に差し込む偽物。"""
    m = types.ModuleType("google.cloud.firestore")
    m.Client = lambda project=None, **_kw: FakeFirestore(store, twist)
    return m


def snapshot_rows(n: int) -> list[dict]:
    from backup import codec  # noqa: PLC0415

    rows = []
    for i in range(n):
        data = {"text": f"島のひとこと {i}", "n": i, "blob": b"\x01\x02"}
        rows.append({
            "doc_id": f"note{i:03d}",
            "doc_json": codec.data_json(data),
            "digest": codec.digest(f"note{i:03d}", data),
            "taken_at": _FakeTs(),
        })
    return rows


class _FakeTs:
    def isoformat(self):
        return "2026-09-17T02:00:00+00:00"


def run_collection_drill(rows, twist=None, env=None) -> tuple[int, str]:
    """`restore.py --collection islandNotes --apply` を、偽の戻し先に当てる。

    引いてくる側（BigQuery）と戻す側（Firestore）の**両方**が偽物。
    見るのは**突き合わせの判定**そのもの——「件数だけ合っていて中身が違う」を
    通さないか。
    """
    from backup import restore  # noqa: PLC0415

    store: dict = {}
    keep_read, keep_argv = restore.read_snapshot, sys.argv
    keep_mod = sys.modules.get("google.cloud.firestore")
    keep_env = {k: os.environ.get(k) for k in ("FIRESTORE_EMULATOR_HOST",
                                               "RESTORE_TO_PRODUCTION")}
    buf = io.StringIO()
    try:
        sys.modules["google.cloud.firestore"] = fake_firestore_module(store, twist)
        restore.read_snapshot = lambda c, col, at: rows
        restore.sink.client = lambda: "偽の置き場"
        os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:9"
        os.environ.pop("RESTORE_TO_PRODUCTION", None)
        for k, v in (env or {}).items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        sys.argv = ["restore.py", "--collection", "islandNotes", "--apply"]
        with contextlib.redirect_stdout(buf):
            try:
                code = restore.main()
            except SystemExit as e:                      # target() の関所
                code = e.code
    finally:
        restore.read_snapshot, sys.argv = keep_read, keep_argv
        if keep_mod is None:
            sys.modules.pop("google.cloud.firestore", None)
        else:
            sys.modules["google.cloud.firestore"] = keep_mod
        for k, v in keep_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    return code, buf.getvalue()


# ---------------------------------------------------------------- 5・6. コレクション


def check_collection(n: int) -> None:
    print("\n5. 戻したのに中身が違うコレクションで、落ちるか")
    rows = snapshot_rows(n)

    code, _ = run_collection_drill(rows)
    say(code == 0, f"壊していない写しが**先に**通る（終了コード {code}）")

    # 件数は合うが、1件だけ中身が違う。**いちばん通しやすい壊れかた**
    def bend(doc_id, data):
        return True, ({**data, "n": -999} if doc_id.endswith("2") else data)
    code, _ = run_collection_drill(rows, twist=bend)
    say(code == 1, f"件数は合うが1件だけ中身が違う → 落ちる（終了コード {code}）")

    # 1件が書けていない
    def drop(doc_id, data):
        return (not doc_id.endswith("3")), data
    code, _ = run_collection_drill(rows, twist=drop)
    say(code == 1, f"1件だけ書けていない → 落ちる（終了コード {code}）")

    print("\n6. 本番へ書く道に、合言葉の関所が立っているか")
    code, _ = run_collection_drill(
        rows, env={"FIRESTORE_EMULATOR_HOST": None, "RESTORE_TO_PRODUCTION": None})
    say(code == 2, f"エミュレータでも合言葉でもないと、書く前に止まる（終了コード {code}）")
    code, _ = run_collection_drill(
        rows, env={"FIRESTORE_EMULATOR_HOST": None,
                   "RESTORE_TO_PRODUCTION": "yes-i-mean-it"})
    say(code == 0, f"合言葉を渡したときだけ通る（終了コード {code}）")


# ---------------------------------------------------------------- 回す


def main() -> int:
    if not YML.exists():
        print(f"::error::{YML} が見つかりません。数えるものがありません")
        return 2
    os.environ.setdefault("BQ_PROJECT_ID", "demo-drill-selftest")

    check_wiring()
    check_admin_verify()
    check_mode()

    n = 5
    check_photo_clean(n)
    check_photo_broken(n)
    check_collection(6)

    print()
    if not checks:
        print("::error::1件も見ていません（数えるものが無い）")
        return 2
    if fails:
        print(f"{checks} 件みて、落ちたのは {len(fails)} 件")
        for f in fails:
            print("  - " + f)
        return 1
    print(f"{checks} 件みて、落ちたのは 0 件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
