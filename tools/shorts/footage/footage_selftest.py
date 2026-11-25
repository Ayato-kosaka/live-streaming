"""**撮影の素材（#1441・帳面 F-094）の音が書き出しに混ざらないか・元の動画が私有の置き場の外に出ないか。**

    python3 tools/shorts/footage/footage_selftest.py
    BREAK=an python3 tools/shorts/footage/footage_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

あやと（2026-11-25）「今回から動画素材を自分で撮影して、ショートの画質向上作戦とします」「※ルール 動画の音声は
ミュートにすること」。音を消すのを回ごとの手の指定にせず、作業用を作る道具と書き出しの既定にした。

要るのは ffmpeg・numpy・Pillow（書き出しそのもの）。Selftests には無いので、回し役（`python/selftest_runner.py`）の
SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す。書体は本物が無ければ箱の太字を同じ名前で置き、
YuNet は使わない（字の顔よけを切った様式で書く。`bgm_cta_selftest.py` と同じ）。

## 何を見るか

本物の `footage.py`・`render.py`・`remote.py` を写した箱で回す。素材は ffmpeg で作る（色の帯の画・1kHz の音・
位置の付け札つき）。

| 足 | 確かめること |
| --- | --- |
| `strip` | 音と位置の付け札のある動画から作った作業用に、音の流れが0本・画の流れが1本・位置の札が無い |
| `strip_verify` | 作るときに音が残ったら（写しかたを壊した版）、作業用を作らずに止まる |
| `render_audio_db` | 撮影の素材のカットに `audio_db` を書いた指示書を、書き出しが断る |
| `render_audio_stream` | 音の流れの残った撮影の素材を、書き出しが断る |
| `stems_skip` | 時間割に撮影の素材の印と `audio_db` が残っていても、音の束（元の音）が 0 のまま |
| `e2e` | `{"footage": "<ID>"}`（道なし）の指示書を本物の書き出し（下書き）に通すと、画が出て（灰色でも黒でもない）、声の無い所が無音（−80dBFS より下） |
| `ledger_public` | 台帳に書く1行から、位置・Google の ID・URL・元のファイル名が落ちる（書いた台帳の欄が決まった欄だけ） |
| `private_dir` | 手元の置き場をリポジトリの中に向けると断る |
| `remote` | 書き出しの依頼で、撮影の素材は作業箱から上げない（上げる URL を出さない）・私有の置き場から CAS に写す・私有の置き場に無ければ止まる |
| `repo_clean` | 本物のリポジトリに、撮影の素材の動画・絵・アルバムの URL が入っていない・台帳が決まった欄だけ |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

`CUTS` が本物の字を1か所だけ書き換えた写しを作り、足を全部回す。**外した守りの足だけが落ちる**ことを確かめる。
外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHORTS = HERE.parent
REPO = SHORTS.parents[1]
BREAK = os.environ.get("BREAK", "")
SR = 48000
FID = "f0123456789"
_sleep = time.sleep

# 名前: (ファイル, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "an": ("footage/footage.py", 'STRIP = ["-map", "0:v:0", "-an",', 'STRIP = ["-map", "0",',
           {"strip"}, "作業用に元の動画の流れを全部写す（音が残る）"),
    "verify": ("footage/footage.py", "    n = audio_streams(tmp)\n", "    n = 0\n",
               {"strip_verify"}, "作ったあとに音の流れを数えない"),
    "meta": ("footage/footage.py", '"-map_metadata", "-1", ', "",
             {"strip"}, "位置などの付け札を外さない"),
    "audio_db": ("render/render.py", "    if cut.get(\"audio_db\") is not None:\n        sys.exit(",
                 "    if False:\n        sys.exit(", {"render_audio_db"}, "撮影の素材のカットの audio_db を断らない"),
    "stream": ("render/render.py", "    if audio_streams(path):\n", "    if False:\n",
               {"render_audio_stream"}, "音の流れの残った撮影の素材を断らない"),
    "stems": ("render/render.py", '        if c.get("audio_db") is None or c.get("footage"):\n',
              '        if c.get("audio_db") is None:\n', {"stems_skip"}, "音の束が撮影の素材の元の音を読む"),
    "resolve": ("render/render.py", '    if "path" in src_def or not src_def.get("footage"):\n',
                '    if True:\n', {"e2e", "render_audio_db", "render_audio_stream", "stems_skip"},
                "道の無い撮影の素材を手元の置き場から引かない"),
    "public": ("footage/footage.py", "    out = {k: row[k] for k in PUBLIC_KEYS if k in row}\n",
               "    out = dict(row)\n", {"ledger_public"}, "台帳に決まった欄のほか（位置・Google の ID）も書く"),
    "private": ("footage/footage.py", "    if g is not None:\n        sys.exit(f\"!! {p} はリポジトリ",
                "    if False:\n        sys.exit(f\"!! {p} はリポジトリ", {"private_dir"},
                "手元の置き場をリポジトリの中に置ける"),
    "copy": ("render/remote.py", "    copy_footage(req, bucket, have)\n", "", {"remote"},
             "撮影の素材を私有の置き場から CAS に写さない"),
}


# ---------------------------------------------------------------- 箱を作る

def fonts_dir(box: Path) -> Path | None:
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf"]
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(SHORTS / "render" / "fonts")]:
        if d and all((Path(d) / n).exists() for n in names):
            return Path(d)
    cands = []
    for root in ("/usr/share/fonts", "/usr/local/share/fonts"):
        if os.path.isdir(root):
            cands += sorted(Path(root).rglob("*.ttf"))
    pick = next((p for p in cands if "Bold" in p.name), cands[0] if cands else None)
    if pick is None:
        return None
    d = box / "fonts"
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).symlink_to(pick)
    return d


def make_src(box: Path, cut: str | None) -> Path:
    """本物を `box/tools/shorts/` に写す（守りを1つ外すなら、その字だけ書き換える）。"""
    dst = box / "tools" / "shorts"
    for sub in ("render", "qa", "preview", "ingest", "footage"):
        shutil.copytree(SHORTS / sub, dst / sub, ignore=shutil.ignore_patterns(
            "__pycache__", "assets", "fonts", "models", "*.mp4", "node_modules"))
    if cut:
        fname, old, new, _, _ = CUTS[cut]
        p = dst / fname
        text = p.read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        p.write_text(text.replace(old, new), encoding="utf-8")
    return dst


def load(name: str, path: Path):
    sys.modules.pop(name, None)
    sys.path.insert(0, str(path.parent))
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.path.pop(0)


def ff(*a: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *a], check=True)


def make_assets(d: Path) -> None:
    # 撮影の素材の元: 色の帯の画（灰色でも黒でもない）・1kHz の大きな音・位置の付け札（iPhone の形）
    ff("-f", "lavfi", "-i", "smptebars=s=360x640:r=30", "-f", "lavfi", "-i", "sine=f=1000:sample_rate=48000",
       "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
       "-metadata", "location=+42.6977+023.3219/", str(d / "orig.mp4"))
    import numpy as np
    t = np.arange(int(0.8 * SR)) / SR
    v = 0.2 * np.sin(2 * np.pi * 200 * t)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
                    "-i", "-", "-c:a", "pcm_f32le", str(d / "voice.wav")],
                   input=v.astype("<f4").tobytes(), check=True)
    (d / "st.json").write_text(json.dumps({"extends": "style.json", "avoid_faces": {"enabled": False}}),
                               encoding="utf-8")


def edit_of(d: Path, name: str, src: dict, cut: dict | None = None) -> Path:
    e = {"version": 2, "id": f"selftest-{name}", "style": "st.json", "sources": {"f": src},
         "cuts": [{"src": "f", "in": 0, "out": 75, **(cut or {})}],
         "narration": {"engine": "files", "lines": [{"at": 45, "text": "テスト", "caption": "", "file": "voice.wav"}]}}
    p = d / f"edit_{name}.json"
    p.write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return p


def has_location(p: Path) -> bool:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(p)],
                         capture_output=True, text=True, check=True).stdout
    return any("location" in k.lower() for k in (json.loads(out).get("format", {}).get("tags") or {}))


# ---------------------------------------------------------------- 足

def leg_strip(M, d: Path) -> list[tuple[str, bool]]:
    F = M["footage"]
    out = d / "store" / f"{FID}.mp4"
    out.parent.mkdir(exist_ok=True)
    F.strip_audio(d / "orig.mp4", out)
    info = F.ffprobe(out)
    kinds = [s["codec_type"] for s in info["streams"]]
    return [(f"作業用の音の流れが0本（{kinds.count('audio')}）", kinds.count("audio") == 0),
            (f"画の流れが1本（{kinds.count('video')}）", kinds.count("video") == 1),
            ("元の動画には位置の札がある（素材の確かめ）", has_location(d / "orig.mp4")),
            ("作業用に位置の札が無い", not has_location(out))]


def leg_strip_verify(M, d: Path) -> list[tuple[str, bool]]:
    F = M["footage"]
    F.STRIP = ["-map", "0"]  # 写しかたを壊す（音も写る）
    out = d / "verify.mp4"
    stopped = False
    try:
        F.strip_audio(d / "orig.mp4", out)
    except SystemExit:
        stopped = True
    return [("音が残ったら止まる", stopped), ("作業用を置かない", not out.exists())]


def plan_of(R, edit: Path, d: Path):
    ed, style, base = R.load(edit)
    w = d / f"{edit.stem}.work"
    w.mkdir(exist_ok=True)
    return R.plan(ed, style, base, w), style, base, w


def ensure_work(M, d: Path) -> Path:
    out = d / "store" / f"{FID}.mp4"
    if not out.exists():
        out.parent.mkdir(exist_ok=True)
        ff("-i", str(d / "orig.mp4"), "-map", "0:v:0", "-an", "-c:v", "copy", str(out))
    return out


def refused(R, edit: Path, d: Path) -> tuple[bool, str]:
    try:
        plan_of(R, edit, d)
    except SystemExit as e:
        return True, str(e.code)[:80]
    return False, ""


def leg_render_audio_db(M, d: Path) -> list[tuple[str, bool]]:
    ensure_work(M, d)
    ok, why = refused(M["render"], edit_of(d, "adb", {"footage": FID}, {"audio_db": -6}), d)
    return [(f"audio_db を書いた撮影の素材のカットを断る（{why}）", ok and "audio_db" in why)]


def leg_render_audio_stream(M, d: Path) -> list[tuple[str, bool]]:
    (d / "store").mkdir(exist_ok=True)
    shutil.copy(d / "orig.mp4", d / "store" / "f0withaudio.mp4")
    ok, why = refused(M["render"], edit_of(d, "ast", {"footage": "f0withaudio"}), d)
    return [(f"音の流れの残った撮影の素材を断る（{why}）", ok and "音の流れ" in why)]


def leg_stems_skip(M, d: Path) -> list[tuple[str, bool]]:
    import numpy as np
    R = M["render"]
    ensure_work(M, d)
    p, style, base, w = plan_of(R, edit_of(d, "stems", {"footage": FID}), d)
    # 時間割を手で直した回の受け皿: 撮影の素材の印は残したまま、音のある元を指して audio_db を足す
    for c in p["cuts"]:
        c["path"] = str(d / "orig.mp4")
        c["audio_db"] = 0
    _, _, src_p = R.audio_stems(p, style, base, w)
    x = np.fromfile(src_p, dtype="<f4")
    peak = float(np.abs(x).max()) if len(x) else 0.0
    return [(f"時間割に印があれば、元の音の束が 0（山 {peak:.4f}）", len(x) > 0 and peak == 0.0),
            ("時間割に撮影の素材の印が付く", all(c.get("footage") == FID for c in p["cuts"]))]


def leg_e2e(M, d: Path) -> list[tuple[str, bool]]:
    import numpy as np
    R = M["render"]
    ensure_work(M, d)
    edit = edit_of(d, "e2e", {"footage": FID})
    mp4, work = d / "e2e.mp4", d / "e2e.work"
    r = subprocess.run([sys.executable, str(Path(R.__file__)), str(edit), "--draft", "--out", str(mp4),
                        "--work", str(work)], capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not mp4.is_file():
        return [(f"書き出しが落ちた（{r.returncode}）: {(r.stderr or '')[-300:]}", False)]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    a = np.frombuffer(raw, dtype="<f4")
    quiet = a[: int(1.4 * SR)]  # 声は 1.5秒目（45コマ）から。その前は撮影の素材の画だけ
    db = 20 * np.log10(max(float(np.sqrt(np.mean(quiet.astype(np.float64) ** 2))) if len(quiet) else 0, 1e-12))
    loud = a[int(1.6 * SR): int(2.2 * SR)]
    vdb = 20 * np.log10(max(float(np.sqrt(np.mean(loud.astype(np.float64) ** 2))) if len(loud) else 0, 1e-12))
    W, H = 540, 960
    pix = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-vf", "select=eq(n\\,10)", "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    im = np.frombuffer(pix, dtype=np.uint8)[: W * H * 3].reshape(H, W, 3).astype(np.float64)
    spread = float(im.reshape(-1, 3).std(axis=0).mean())
    return [(f"声の無い所が無音（{db:.1f}dBFS。線 −80）", db < -80),
            (f"声の所は鳴っている（{vdb:.1f}dBFS。書き出しが生きている確かめ）", vdb > -40),
            (f"画が出ている（色の帯。画素のばらつき {spread:.0f}。黒・灰一色なら 0 近く）", spread > 30)]


def leg_ledger_public(M, d: Path) -> list[tuple[str, bool]]:
    F = M["footage"]
    row = {"id": FID, "kind": "video", "taken_utc": "2026-11-20T15:31:10+00:00", "seconds": 3.0, "desc": "x",
           "gid": "AF1QipSECRET", "base": "https://lh3.googleusercontent.com/pw/SECRET", "location": "+42.69+023.32/",
           "orig_name": "IMG_0001.MOV", "stream": {"video": "abc", "at": "0:01:00", "url": "https://x"}}
    out = F.public_row(row)
    path = d / "ledger.json"
    F.save_ledger({"items": [row], "streams": {}}, path)
    j = json.loads(path.read_text(encoding="utf-8"))
    keys = set(j["items"][0])
    text = path.read_text(encoding="utf-8")
    return [("1行から位置・Google の ID・URL・元のファイル名が落ちる",
             not ({"gid", "base", "location", "orig_name"} & set(out)) and "url" not in out.get("stream", {})),
            (f"書いた台帳の欄が決まった欄だけ（{sorted(keys - set(F.PUBLIC_KEYS))}）", keys <= set(F.PUBLIC_KEYS)),
            ("台帳の字に SECRET も googleusercontent も無い", "SECRET" not in text and "googleusercontent" not in text)]


def leg_private_dir(M, d: Path) -> list[tuple[str, bool]]:
    F = M["footage"]
    repo = d / "fake_repo"
    (repo / ".git").mkdir(parents=True, exist_ok=True)
    stopped = False
    try:
        F.private_dir(repo / "shorts" / "footage_cache")
    except SystemExit:
        stopped = True
    ok_out = F.private_dir(d / "outside") == (d / "outside").resolve()
    return [("リポジトリの中を置き場に向けると断る", stopped), ("リポジトリの外なら置ける", ok_out)]


class _Blob:
    def __init__(self, bk, name):
        self.bk, self.name = bk, name

    @property
    def size(self):
        return self.bk.store.get(self.name)

    def generate_signed_url(self, **kw):
        self.bk.signed.append((kw.get("method"), self.name))
        return f"https://signed/{self.name}"

    def upload_from_string(self, *a, **kw):
        self.bk.store[self.name] = 1


class _Bucket:
    def __init__(self, store):
        self.store, self.signed, self.copied = dict(store), [], []

    def blob(self, name):
        return _Blob(self, name)

    def get_blob(self, name):
        return _Blob(self, name) if name in self.store else None

    def copy_blob(self, blob, bucket, new_name):
        self.copied.append((blob.name, new_name))
        self.store[new_name] = self.store[blob.name]


class _Client:
    def __init__(self, bk):
        self.bk = bk

    def list_blobs(self, bucket, prefix):
        return [_Blob(self.bk, n) for n in self.bk.store if n.startswith(prefix)]


def leg_remote(M, d: Path) -> list[tuple[str, bool]]:
    Rm = M["remote"]
    h_f, h_n = "a" * 64, "b" * 64
    root = Path(Rm.ROOT)
    led = root / "shorts" / "footage" / "index.json"
    led.parent.mkdir(parents=True, exist_ok=True)
    led.write_text(json.dumps({"items": [{"id": FID, "sha256": h_f, "bytes": 5, "ext": ".mp4"}]}), encoding="utf-8")
    edit = d / "edit_remote.json"
    edit.write_text(json.dumps({"sources": {"f": {"footage": FID}}, "cuts": []}), encoding="utf-8")
    objects, fobj = {}, {}
    body = json.loads(Rm.collect(edit, objects, None, fobj))
    out = [("撮影の素材を作業箱から運ばない（objects が空）", objects == {}),
           ("撮影の素材を私有の置き場の印で運ぶ", fobj == {h_f: 5}),
           ("指示書の道を in/<sha256>.mp4 に書き換える", body["sources"]["f"].get("path") == f"in/{h_f}.mp4")]

    def prepare(store: dict) -> tuple[_Bucket, str]:
        bk = _Bucket(store)
        req = {"name": "t", "draft": True, "twin": False, "items": [{"id": "A", "edit": h_n}], "footage": False,
               "look": [], "objects": [{"sha256": h_n, "bytes": 3}, {"sha256": h_f, "bytes": 5, "store": "footage"}]}
        saved = (Rm.the_request, Rm.out_branch, Rm.storage, Rm.seal_to, Rm.br.push_change, Rm.time.sleep,
                 Rm.UPLOAD_WAIT)
        Rm.UPLOAD_WAIT = 2  # 上がらないものを待ち続けない（守りを外した対照で、写さなかった撮影の素材は来ない）
        Rm.the_request, Rm.out_branch = (lambda: req), (lambda: "claude/x")
        Rm.storage = lambda: (_Client(bk), bk)
        Rm.seal_to = lambda *a, **k: {}
        Rm.br.push_change = lambda *a, **k: None
        Rm.time.sleep = lambda s: (bk.store.update({Rm.CAS + h_n: 3}), _sleep(0.05))  # 作業箱が上げた
        err = ""
        try:
            Rm.cmd_prepare()
        except Exception as e:  # noqa: BLE001
            err = f"{type(e).__name__}: {e}"
        finally:
            (Rm.the_request, Rm.out_branch, Rm.storage, Rm.seal_to, Rm.br.push_change, Rm.time.sleep,
             Rm.UPLOAD_WAIT) = saved
        return bk, err

    bk, err = prepare({Rm.FOOTAGE + h_f: 5})
    puts = [n for m, n in bk.signed if m == "PUT"]
    out += [(f"私有の置き場に在れば通る（{err or '○'}）", not err),
            (f"撮影の素材に上げる URL を出さない（PUT {puts}）", Rm.CAS + h_f not in puts and Rm.FOOTAGE + h_f not in puts),
            ("ふつうの素材には上げる URL を出す", Rm.CAS + h_n in puts),
            ("私有の置き場から CAS へ写す", (Rm.FOOTAGE + h_f, Rm.CAS + h_f) in bk.copied)]
    bk, err = prepare({})
    out.append((f"私有の置き場に無ければ止まる（{err[:60]}）", "私有の置き場に無い" in err))
    Rm.norm_pem = lambda pem: (pem, "fp")
    base = {"name": "footage-x", "nonce": "n" * 12, "pubkey": "k", "footage": True, "items": []}
    for what, objs, want in (("印の無いもの", [{"sha256": h_f, "bytes": 5}], False),
                             ("印のあるものだけ", [{"sha256": h_f, "bytes": 5, "store": "footage"}], True)):
        try:
            Rm.read_request({**base, "objects": objs}, "t")
            got, why = True, ""
        except Exception as e:  # noqa: BLE001
            got, why = False, str(e)
        out.append((f"撮影の素材の依頼: {what}は{'通す' if want else '断る'}（{why[:40] or '通った'}）",
                    got == want and (want or "撮影の素材の依頼" in why)))
    return out


VIDEO_EXT = (".mp4", ".mov", ".m4v", ".mkv", ".webm", ".heic", ".jpg", ".jpeg", ".png")


def leg_repo_clean(M, d: Path) -> list[tuple[str, bool]]:
    """本物のリポジトリ（写しではない）。守りを外す対照は無い（ほかの足が道具の側を見ている）。"""
    F = M["footage"]
    r = subprocess.run(["git", "-C", str(REPO), "ls-files", "shorts/footage", "tools/shorts/footage"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return [("git ls-files が読めない", False)]
    files = [f for f in r.stdout.splitlines() if f]
    media = [f for f in files if f.lower().endswith(VIDEO_EXT)]
    out = [(f"撮影の素材の置き場に動画・絵が入っていない（{media[:3]}）", not media)]
    led = REPO / "shorts" / "footage" / "index.json"
    if led.is_file():
        j = json.loads(led.read_text(encoding="utf-8"))
        bad = sorted({k for it in j.get("items", []) for k in it} - set(F.PUBLIC_KEYS))
        out.append((f"台帳が決まった欄だけ（{bad}）", not bad))
    # アルバムの URL（共有リンク）がどこにも入っていない。字はここで組む（このファイル自身に当たらないように）
    pats = ["photos.app.goo" + ".gl/", "photos.google.com" + "/share/"]
    g = subprocess.run(["git", "-C", str(REPO), "grep", "-l", "-F", *sum((["-e", p] for p in pats), [])],
                       capture_output=True, text=True)
    hits = [f for f in g.stdout.splitlines() if f]
    out.append((f"共有アルバムの URL がリポジトリに無い（{hits[:3]}）", not hits))
    return out


LEGS = {
    "strip": leg_strip,
    "strip_verify": leg_strip_verify,
    "render_audio_db": leg_render_audio_db,
    "render_audio_stream": leg_render_audio_stream,
    "stems_skip": leg_stems_skip,
    "e2e": leg_e2e,
    "ledger_public": leg_ledger_public,
    "private_dir": leg_private_dir,
    "remote": leg_remote,
    "repo_clean": leg_repo_clean,
}


def run_legs(src: Path, d: Path) -> tuple[list[str], int]:
    failed, checked = [], 0
    for name, fn in LEGS.items():
        # 足ごとに読み直す（strip_verify が写しかたを書き換えるので、ほかの足に持ち越さない）
        M = {"footage": load("footage", src / "footage" / "footage.py"),
             "render": load("render", src / "render" / "render.py"),
             "remote": load("remote", src / "render" / "remote.py")}
        try:
            res = fn(M, d)
        except SystemExit as e:
            res = [(f"途中で止まった: {e.code}", False)]
        except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
            res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        print(f"[{name}]")
        for what, ok in res:
            print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def child(name: str | None) -> int:
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        fd = fonts_dir(box)
        if fd is None:
            print("✕ 回せない: 書体が1つも無い（tools/shorts/render/fetch_fonts.sh か、fonts-dejavu-core）")
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        src = make_src(box, name)
        d = box / "case"
        d.mkdir()
        os.environ["SHORTS_FOOTAGE_DIR"] = str(d / "store")
        make_assets(d)
        failed, checked = run_legs(src, d)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=name), timeout=900, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    try:
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow が要る）")
        return 2
    if shutil.which("ffmpeg") is None:
        print("✕ 回せない: ffmpeg が無い")
        return 2
    if BREAK:
        return child(BREAK)
    rc = child(None)
    print()
    bad = drill()
    print()
    if rc == 2:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if rc or bad:
        if rc:
            print("✕ 本物で落ちた足がある（上の ✕）")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
