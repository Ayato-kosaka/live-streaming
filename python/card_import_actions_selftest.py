"""偽の Firestore・偽の置き場で、`card_import_actions` の約束だけを回す。

    python3 python/card_import_actions_selftest.py

**Firestore にも GCS にも Functions にも1バイトも触らない。** 資格情報も要らない。
URL を包む確かめだけは、手元の openssl で本物の鍵を作って包んで開く。

終了コード 0=ぜんぶ通った / 1=落ちた / 2=確かめられない（openssl が無い等）。

## 確かめるもの（`docs/card-import.md` 2章）

| | |
| --- | --- |
| 1 | 正しい tar → candidate / calib が書かれ、回の記録（範囲・数）が入る |
| 2 | **`excluded` `registered` `registering` の書類に、取り込みが1文字も触らない** |
| 3 | calib を取り込み直しても `calibAnswer` が残る。failed は candidate に戻る |
| 4 | 同じ回で新しい manifest から消えた候補は `withdrawn`。別の回・守る状態は落とさない |
| 5 | 断る tar: sha の形・webp でない・日付・リンク・`../`・知らない名前・位置の欄・batch 違い・一覧用が無い・余分な写真・2回出る sha。**断ったら1バイトも書かない** |
| 6 | 置き場に置けなかった1枚は、候補として書かない |
| 7 | labels は `{sha: yes/no/excluded}` だけ。status の表に sha が出ない |
| 8 | **URL がログに出ない。** 作業枝に置くのは `shorts/.work/` の暗号文だけで、秘密鍵で開くと同じ URL が出る |

## わざと壊して落ちるところまで見る

`CARD_IMPORT_ACTIONS_PY` に壊した写しの道を渡すと、そちらを読み込む。
引数なしで回すと、写しを7通り作って、狙った行が赤くなるかを最後に見る。
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TARGET = os.environ.get("CARD_IMPORT_ACTIONS_PY") or str(HERE / "card_import_actions.py")
CONTROL = not os.environ.get("CARD_IMPORT_ACTIONS_PY")

ok = bad = 0


def check(name: str, good: bool, why: str = "") -> None:
    global ok, bad
    if good:
        ok += 1
        print(f"  ok   {name}")
    else:
        bad += 1
        print(f"  NG   {name}{' — ' + why if why else ''}")


if not shutil.which("openssl"):
    print("確かめられません: openssl が無い")
    sys.exit(2)

spec = importlib.util.spec_from_file_location("card_import_actions", TARGET)
cia = importlib.util.module_from_spec(spec)
sys.modules["card_import_actions"] = cia
spec.loader.exec_module(cia)


# ---------------------------------------------------------------- 偽物

class FakeStore:
    def __init__(self, items=None, runs=None):
        self.items = {k: dict(v) for k, v in (items or {}).items()}
        self.runs_ = {k: dict(v) for k, v in (runs or {}).items()}
        self.writes = 0

    def get_many(self, shas):
        return {s: (dict(self.items[s]) if s in self.items else None) for s in shas}

    def by_batch(self, batch):
        return {s: dict(d) for s, d in self.items.items() if d.get("batch") == batch}

    def all_items(self):
        return {s: dict(d) for s, d in self.items.items()}

    def runs(self):
        return {k: dict(v) for k, v in self.runs_.items()}

    def write(self, sets, withdraw, now):
        for s, f in sets.items():
            self.writes += 1
            self.items[s] = {**self.items.get(s, {}), **f}
        for s in withdraw:
            self.writes += 1
            self.items[s] = {**self.items[s], "status": "withdrawn", "updatedAt": now}

    def set_run(self, batch, fields):
        self.writes += 1
        self.runs_[batch] = {**self.runs_.get(batch, {}), **fields}

    def get_run(self, batch):
        return dict(self.runs_[batch]) if batch in self.runs_ else None


def webp(n: int, fill: int) -> bytes:
    b = bytearray([fill]) * n
    b[0:4] = b"RIFF"
    b[4:8] = (n - 8).to_bytes(4, "little")
    b[8:12] = b"WEBP"
    return bytes(b)


def sha(c: str) -> str:
    return c * 64


def item(s: str, kind="candidate", day="2026-09-12", **kw) -> dict:
    return {"sha": s, "day": day, "takenAt": f"{day}T10:00:00+02:00", "w": 1600, "h": 1200,
            "tw": 400, "th": 300, "category": "food", "score": 0.7, "group": "g1",
            "kind": kind, "ambiguous": False, "reasons": ["ok"], **kw}


def manifest(items, batch="b1") -> dict:
    return {"batch": batch, "source": "takeout",
            "range": {"from": "2026-09-01", "to": "2026-09-30"},
            "missing": [{"from": "2026-09-05", "to": "2026-09-06", "why": "zip が壊れていた"}],
            "counts": {"scanned": 10, "selected": len(items)}, "items": items}


def make_tar(path: Path, man: dict, shas, *, skip_thumb=(), extra=(), raw=None) -> Path:
    """tar を作る。raw は (名前, バイト列 or ("link", 先)) を足す。"""
    with tarfile.open(path, "w") as tf:
        def add(name, data):
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            tf.addfile(ti, io.BytesIO(data))
        if man is not None:
            add("manifest.json", json.dumps(man).encode())
        for s in shas:
            add(f"{s}.webp", webp(2048, 1))
            if s not in skip_thumb:
                add(f"{s}.t.webp", webp(200, 2))
        for s in extra:
            add(f"{s}.webp", webp(2048, 1))
            add(f"{s}.t.webp", webp(200, 2))
        for name, data in raw or []:
            if isinstance(data, tuple):
                ti = tarfile.TarInfo(name)
                ti.type = tarfile.SYMTYPE
                ti.linkname = data[1]
                tf.addfile(ti)
            else:
                add(name, data)
    return path


UPLOADED: list[str] = []


def uploader(fail=()):
    def up(s, cand, thumb):
        if s in fail:
            return False
        UPLOADED.append(s)
        return cia.is_webp(cand) and cia.is_webp(thumb)
    return up


TMP = Path(tempfile.mkdtemp(prefix="cia-selftest-"))
NOW = 1_800_000_000_000

# ---------------------------------------------------------------- 1〜4 状態の決まり

print("# 取り込みと状態の決まり")
A, B, C, D, E, F, G, H, I = (sha(c) for c in "abcdef012")
before = {
    A: {"batch": "b0", "status": "excluded", "day": "2026-09-12", "updatedAt": 1},
    B: {"batch": "b0", "status": "registered", "imageId": "img-b", "updatedAt": 1},
    C: {"batch": "b0", "status": "registering", "updatedAt": 1},
    D: {"batch": "b1", "status": "calib", "calibAnswer": "yes", "updatedAt": 1},
    E: {"batch": "b1", "status": "failed", "error": "no file", "updatedAt": 1},
    # 同じ回で消えるもの
    F: {"batch": "b1", "status": "candidate", "updatedAt": 1},
    # 同じ回で消えるが、守る状態
    G: {"batch": "b1", "status": "excluded", "updatedAt": 1},
    # 別の回の候補（触らない）
    H: {"batch": "b9", "status": "candidate", "updatedAt": 1},
}
store = FakeStore(before)
man = manifest([item(A), item(B), item(C), item(D, kind="calib"), item(E), item(I)])
tar = make_tar(TMP / "ok.tar", man, [A, B, C, D, E, I])
UPLOADED.clear()
res = cia.ingest_core(tar, "b1", store, uploader(), NOW)
it = store.items
check("新しい1枚は candidate で入る（manifest の欄と batch・createdAt つき）",
      it[I]["status"] == "candidate" and it[I]["batch"] == "b1" and it[I]["day"] == "2026-09-12"
      and it[I]["createdAt"] == NOW and it[I]["w"] == 1600, json.dumps(it.get(I)))
check("excluded の書類に取り込みが触らない", it[A] == before[A], json.dumps(it[A]))
check("registered / registering の書類に取り込みが触らない",
      it[B] == before[B] and it[C] == before[C])
check("calib を取り込み直しても calibAnswer が残る",
      it[D]["status"] == "calib" and it[D]["calibAnswer"] == "yes")
check("failed は candidate に戻り、理由は消える",
      it[E]["status"] == "candidate" and it[E]["error"] is None)
check("同じ回で消えた候補は withdrawn", it[F]["status"] == "withdrawn")
check("消えても守る状態（excluded）は落とさない・別の回には触らない",
      it[G] == before[G] and it[H] == before[H])
check("置き場へは、登録済み・登録中のほかを置く（外したものは戻せるように置く）",
      sorted(UPLOADED) == sorted([A, D, E, I]), str(len(UPLOADED)))
run = store.runs_.get("b1", {})
check("回の記録に範囲・抜け・数が入る",
      run.get("range") == {"from": "2026-09-01", "to": "2026-09-30"} and run.get("items") == 6
      and run.get("createdAt") == NOW and run.get("missing", [{}])[0].get("why"),
      json.dumps(run, ensure_ascii=False))
check("結果の数", res["written"] == {"candidate": 2, "calib": 1} and res["withdrawn"] == 1
      and res["kept"] == {"excluded": 1, "registered": 1, "registering": 1},
      json.dumps(res))
store.set_run("b1", {"createdAt": 5})
cia.ingest_core(tar, "b1", store, uploader(), NOW + 1)
check("2回目の取り込みでは回の createdAt を書き換えない", store.runs_["b1"]["createdAt"] == 5)

# ---------------------------------------------------------------- 5 断る tar

print("\n# 断る tar")
J = sha("9")
BAD = [
    ("sha が64桁でない manifest は断る",
     lambda p: make_tar(p, manifest([item("Z" * 64)]), [],
                        raw=[("Z" * 64 + ".webp", webp(2048, 1)), ("Z" * 64 + ".t.webp", webp(200, 2))])),
    ("webp でない中身は断る",
     lambda p: make_tar(p, manifest([item(J)]), [], raw=[(f"{J}.webp", b"\xff\xd8\xff" + b"0" * 2000),
                                                        (f"{J}.t.webp", webp(200, 2))])),
    ("ありえない日付は断る", lambda p: make_tar(p, manifest([item(J, day="2026-02-30")]), [J])),
    ("リンクの入った tar は断る",
     lambda p: make_tar(p, None, [J], raw=[("manifest.json", ("link", "/etc/passwd"))])),
    ("../ の名前は断る",
     lambda p: make_tar(p, manifest([item(J)]), [J], raw=[(f"../{J}.webp", webp(2048, 1))])),
    ("知らない名前のファイルは断る",
     lambda p: make_tar(p, manifest([item(J)]), [J], raw=[("IMG_0001.jpg", b"0" * 100)])),
    ("位置の欄がある manifest は断る",
     lambda p: make_tar(p, manifest([item(J, lat=35.6)]), [J])),
    ("batch が頼んだものと違えば断る", lambda p: make_tar(p, manifest([item(J)], batch="b2"), [J])),
    ("一覧用が無ければ断る", lambda p: make_tar(p, manifest([item(J)]), [J], skip_thumb=[J])),
    ("manifest に無い写真が入っていれば断る",
     lambda p: make_tar(p, manifest([item(J)]), [J], extra=[sha("8")])),
    ("同じ sha が2回出れば断る", lambda p: make_tar(p, manifest([item(J), item(J)]), [J])),
    ("kind が candidate / calib でなければ断る",
     lambda p: make_tar(p, manifest([item(J, kind="registered")]), [J])),
]
for i, (name, mk) in enumerate(BAD):
    s = FakeStore({F: {"batch": "b1", "status": "candidate"}})
    UPLOADED.clear()
    try:
        cia.ingest_core(mk(TMP / f"bad{i}.tar"), "b1", s, uploader(), NOW)
        check(name, False, "通ってしまった")
    except cia.Bad as e:
        check(name, s.writes == 0 and not UPLOADED, f"書いた {s.writes} / 置いた {len(UPLOADED)} ({e})")
    except Exception as e:  # noqa: BLE001  断りかたが違う（約束の外の落ち方）
        check(name, False, f"Bad でなく {type(e).__name__} で落ちた")

# ---------------------------------------------------------------- 6 置けなかった1枚

print("\n# 置き場に置けなかった1枚")
s = FakeStore()
K, L = sha("7"), sha("6")
res = cia.ingest_core(make_tar(TMP / "fail.tar", manifest([item(K), item(L)]), [K, L]), "b1", s,
                      uploader(fail={K}), NOW)
check("置けなかった1枚は候補として書かない",
      K not in s.items and s.items.get(L, {}).get("status") == "candidate"
      and res["uploadFailed"] == 1, json.dumps(res))

# ---------------------------------------------------------------- 7 labels / status

print("\n# labels / status")
docs = {
    A: {"batch": "b1", "status": "excluded"},
    D: {"batch": "b1", "status": "calib", "calibAnswer": "yes", "day": "2026-09-12"},
    E: {"batch": "b1", "status": "calib", "calibAnswer": "no"},
    F: {"batch": "b1", "status": "calib"},
    I: {"batch": "b1", "status": "candidate", "category": "food"},
}
lab = cia.labels_of(docs)
check("labels は sha → yes / no / excluded だけ",
      lab == {A: "excluded", D: "yes", E: "no"}, json.dumps(lab))
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    os.environ.pop("GITHUB_STEP_SUMMARY", None)
    cia.mode_labels("b1", FakeStore(docs))
out = buf.getvalue()
check("labels の出力に日付も種類も出ない", "2026-09-12" not in out and "food" not in out
      and D in out)
md = cia.status_md({"b1": {"range": {"from": "2026-09-01", "to": "2026-09-30"}, "items": 5,
                           "createdAt": 2, "registeredAt": NOW}}, docs)
check("status の表に回・範囲・内訳が出て、sha は出ない",
      "| b1 | 2026-09-01 〜 2026-09-30 | 5 |" in md and A not in md and "| 1 | 3 | 1 |" in md, md)

# ---------------------------------------------------------------- 8 URL を包む

print("\n# 受け取り口の URL")
SECRET = "https://storage.googleapis.com/x/transfer/cardimport/b1.tar?X-Goog-Signature=" + "f" * 64
priv = TMP / "priv.pem"
subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                "-out", str(priv)], check=True, capture_output=True)
pub = subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                     capture_output=True, text=True).stdout
sys.path.insert(0, str(ROOT / "tools/shorts/preview"))
sys.path.insert(0, str(ROOT / "tools/shorts/ingest"))
import branch as real_branch  # noqa: E402
import decrypt  # noqa: E402

PUSHED: dict = {}
fake = types.ModuleType("branch")
fake.fetch = lambda b: "0" * 40
fake.git = lambda *a, **k: ""


def _push(branch, adds, removes, message, tries=8):
    for path, v in adds.items():
        real_branch.check_path(path, v.stat().st_size)
    PUSHED.update({p: v.read_bytes() for p, v in adds.items()})
    PUSHED["__branch"] = branch
    return "c" * 40


fake.push_change = _push
sys.modules["branch"] = fake
nonce = "nonce_" + "x" * 16
buf = io.StringIO()
try:
    with contextlib.redirect_stdout(buf):
        rc = cia.mode_url("b1", pub.replace("\n", " "), nonce, "claude/card-import-inbox",
                          sign=lambda b: {"batch": b, "put": SECRET, "put_expires": "x"})
except Exception as e:  # noqa: BLE001
    rc = f"{type(e).__name__}: {e}"
sys.modules["branch"] = real_branch
log = buf.getvalue()
check("url: 1で終わらず、作業枝に置いた", rc == 0 and PUSHED.get("__branch") == "claude/card-import-inbox",
      str(rc))
check("URL がログに出ない", SECRET not in log and "X-Goog-Signature" not in log, log[-200:])
files = {k: v for k, v in PUSHED.items() if k != "__branch"}
check("作業枝に置くのは shorts/.work/cardimport/<nonce>/ の暗号文と manifest だけ",
      files and all(k.startswith(f"shorts/.work/cardimport/{nonce}/") for k in files)
      and {Path(k).name for k in files} == {"manifest.json", "key.enc", "payload.enc"},
      str(sorted(files)))
check("置いたものに URL が平文で入っていない",
      all(SECRET.encode() not in v and b"X-Goog-Signature" not in v for v in files.values()))
out_root = TMP / "open"
out_root.mkdir()
(TMP / "open2").mkdir()
src = TMP / "sealed" / "shorts/.work/cardimport" / nonce
src.mkdir(parents=True)
for k, v in files.items():
    (src / Path(k).name).write_bytes(v)
opened, msg = decrypt.open_one(src, priv, decrypt.pub_fp(priv), out_root)
got = (json.loads((out_root / "cardimport" / nonce / "inbox.json").read_text())
       if opened else {})
check("秘密鍵で開くと同じ URL が出る", opened and got.get("put") == SECRET, msg)
other = TMP / "other.pem"
subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                "-out", str(other)], check=True, capture_output=True)
opened2, _ = decrypt.open_one(src, other, decrypt.pub_fp(other), TMP / "open2")
check("別の鍵では開けない", not opened2)
for bad_nonce, bad_branch in (("../x", "claude/a"), (nonce, "master")):
    try:
        cia.mode_url("b1", pub, bad_nonce, bad_branch, sign=lambda b: {"put": SECRET})
        check(f"変な nonce / 枝は断る（{bad_nonce} {bad_branch}）", False)
    except cia.Bad:
        check(f"変な nonce / 枝は断る（{bad_nonce} {bad_branch}）", True)

shutil.rmtree(TMP, ignore_errors=True)

# ---------------------------------------------------------------- 対照

BREAKS = [
    ("excluded を守る状態から外す",
     [('PROTECTED = ("registered", "registering", "excluded")',
       'PROTECTED = ("registered", "registering")')],
     "excluded の書類に取り込みが触らない"),
    # sha の形は2か所で見ている（tar の名前と manifest）。片方だけ外しても、もう片方が止める
    ("sha の形を見ない（tar の名前と manifest の両方）",
     [("if not isinstance(sha, str) or not SHA.match(sha):", "if not isinstance(sha, str):"),
      ('MEMBER = re.compile(r"^([0-9a-f]{64})', 'MEMBER = re.compile(r"^([0-9A-Za-z]{64})')],
     "sha が64桁でない manifest は断る"),
    ("リンクを通す", [("if not m.isreg():", "if False:")], "リンクの入った tar は断る"),
    ("位置の欄を通す", [("if bad_keys:", "if False:")], "位置の欄がある manifest は断る"),
    ("消えた候補を取り下げない", [("if s not in shas and", "if False and s not in shas and")],
     "同じ回で消えた候補は withdrawn"),
    ("URL をログに出す", [("    body = sign(batch)\n", "    body = sign(batch)\n    log(str(body))\n")],
     "URL がログに出ない"),
    ("置けなかった1枚も書く",
     [('sets = {s: f for s, f in p["sets"].items() if s not in failed}', 'sets = dict(p["sets"])')],
     "置けなかった1枚は候補として書かない"),
]

if CONTROL:
    print("\n# 対照（壊した写しで回して、狙った行が赤くなるか）")
    orig = Path(TARGET).read_text(encoding="utf-8")
    box = Path(tempfile.mkdtemp(prefix="cia-drill-"))
    try:
        def run_with(text: str) -> subprocess.CompletedProcess:
            # 写しの名前は本物と同じにする（mode_url が自分の置き場から道具を探すので、置き場は本物の隣を指す）
            p = box / hashlib.sha1(text.encode()).hexdigest()[:8] / "card_import_actions.py"
            p.parent.mkdir()
            p.write_text(text.replace("HERE = Path(__file__).resolve().parent",
                                      f"HERE = Path({str(HERE)!r})"), encoding="utf-8")
            return subprocess.run([sys.executable, __file__], capture_output=True, text=True,
                                  env={**os.environ, "CARD_IMPORT_ACTIONS_PY": str(p),
                                       "PYTHONDONTWRITEBYTECODE": "1"})
        r = run_with(orig)
        check("壊していない写しは緑のまま", r.returncode == 0, r.stdout[-400:])
        for what, pairs, want in BREAKS:
            broken = orig
            miss = [frm for frm, _ in pairs if frm not in orig]
            if miss:
                check(f"{what}: 壊す字が当たる", False, f"「{miss[0]}」が無い")
                continue
            for frm, to in pairs:
                broken = broken.replace(frm, to, 1)
            r = run_with(broken)
            hit = f"NG   {want}" in r.stdout
            check(f"{what}: 「{want}」が赤くなる", r.returncode == 1 and hit,
                  f"終了コード {r.returncode} / その行が赤い: {hit}")
    finally:
        shutil.rmtree(box, ignore_errors=True)

print(f"\n通った {ok}件 / 落ちた {bad}件")
if ok == 0:
    sys.exit(2)
sys.exit(1 if bad else 0)
