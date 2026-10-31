"""ショートの書き出しを GitHub Actions で並べて回す（作業箱 → GCS → ランナー → GCS → 作業箱）。

    # 作業箱で（本番の段: 書き出し・双子・品質チェック20項目・コマ一覧・字の切り抜き・顔の切り抜き・下見）
    python3 tools/shorts/render/remote.py up --name ng-p1-v4 --key <秘密鍵.pem> --out <リポジトリの外> \\
        --detach edit_A.json edit_B.json        # 素材を上げたら手を離す（1〜2分）
    python3 tools/shorts/render/remote.py fetch --name ng-p1-v4 --key <秘密鍵.pem> --out <リポジトリの外>
        # → <out>/<name>/summary.json（担当が読むのはこれ）と、目で見る絵（コマ一覧・字・顔）だけを落とす
    # 下書きの段（縦横半分・双子なし・最低限の検査・下見なし）
    python3 tools/shorts/render/remote.py up --draft --name yk-v2d … edit_A.json edit_B.json edit_C.json

    # Actions の中で（.github/workflows/shorts_render.yml から）
    python3 tools/shorts/render/remote.py prepare | job | report

**担当がすることは「指示書を置く → 要約（summary.json 1つ）と絵を読む」だけ**（#1011。あやと F-044
「Python とかでガリガリ加工できるところは GitHub Actions に寄せて、その結果を読む」）。前は書き出し・検査・
1秒ごとのコマ一覧・字の切り抜き・下見（put.py）を担当が手元（4コア）で順に回し、1本 約2時間かかった。
mp4 と work 一式は既定では落とさない（`fetch --all` で落とす）。

## なぜ

作業箱（4コア）で3本を順に回すと、1本 書き出し4分＋双子4分＋検査5分で、1周 約42分かかった。
ランナーは1台4コアで、公開リポジトリでは何台でも並べられる。3本 × (本体・双子) の6台に分ければ、
1周は「いちばん遅い1本の 書き出し＋検査」になる（あやと 2026-10-16「GitHub actions に汎用並列マシン
作っても良いよ」）。

## 流れ

1. 作業箱: 指示書（edit_*.json）が指している素材・声・BGM を全部集め、中身の sha256 で名前を付け
   （`render/cas/<sha256>`。同じ素材は2回上げない）、指示書の道をその名前に書き換える。
   依頼 `shorts/render/<name>.json`（sha256 と大きさの並び・公開鍵・乱数だけ）を作業枝に積む
2. prepare（1台）: GCS に無いものだけ、上げる署名付き URL（1時間）を作り、公開鍵で包んで
   `shorts/.work/render/<name>/inbox/` に置く。作業箱が上げ終わるまで GCS を見て待つ
3. 作業箱: その URL で GCS に直に上げる（作業箱から storage.googleapis.com へは 25〜45MB/秒出た）
4. job（本数 × 本体・双子）: GCS から読んで書き出す。本体は品質チェック・帯の絵・一覧の絵まで作り、
   出来たもの（mp4・検査の json/md・帯・一覧・時間割・work 一式）を GCS に置く。双子は同じ指示書を
   別のランナーで書き、sha256 だけを置く（同じ指示書から同じバイト列が出るか）
5. report（1台）: 結果を集め、本体の mp4 を Firebase Hosting のプレビューチャンネル（7日）に並べて配り
   （`tools/shorts/preview/host.py` と同じ配り方・確かめ方。下書きは配らない）、見る URL（7日）と要約
   （`summary.json`）を公開鍵で包み、`shorts/.work/render/<name>/` に置く
6. 作業箱（`fetch`）: 開いて、要約と目で見る絵だけを `--out/<name>/<id>/` に落とし、sha256 を確かめる

**artifact は使わない**（公開リポジトリの artifact は誰でも落とせる。作業箱からは取りにも行けない）。
受け渡しは GCS の非公開バケット（`tools/shorts/preview/gcs.py`）だけ。

## 同じものが出るか

ランナーの道具を作業箱にそろえてある（ubuntu-24.04 の apt の ffmpeg 6.1.1・x264 0.164、
Python 3.13、numpy 2.5.3・Pillow 12.3.0・opencv-python-headless 5.0.0.93・budoux 0.9.3、
書体と YuNet は fetch_fonts.sh が sha256 で確かめる）。それでも AMD EPYC のランナーでは x264 だけが
別のバイト列を出したので、Actions の書き出しは x264 の cpu-independent を付ける
（`SHORTS_X264_CPU_INDEPENDENT=1`。job ごとの指紋 `probe_stages` で、どの段が違うかを残す）。
書き出すのは**作業枝に push してある版の render.py**。手元で直した道具は push してから回す。

ランナーの apt が詰まると、ffmpeg は GitHub の静的ビルドに切り替わる（ワークフローの「道具を入れる」が
取り込みの ffmpeg.sh を呼ぶ）。**その版は作業箱と違い、バイト列も変わる。** job が版を控え（`ffmpeg_version`）、
要約に出す。作業箱の版（`WORKBOX_FFMPEG`）でなければ `fetch` が「!! ffmpeg が作業箱と違う版」と言う。
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "preview"))
sys.path.insert(0, str(HERE.parent / "ingest"))
import branch as br  # noqa: E402
import decrypt  # noqa: E402
import seal  # noqa: E402
from req import Bad, compare_files, norm_pem  # noqa: E402

BRANCH = "claude/serene-darwin-sf09tt"
REQ_DIR = "shorts/render/"
CAS = "render/cas/"
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
ID = re.compile(r"^[A-Za-z0-9_-]{1,16}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
MAX_ITEMS = 6
MAX_OBJECTS = 300
MAX_BYTES = 3 * 1024 ** 3
PUT_TTL = dt.timedelta(hours=1)
GET_TTL = dt.timedelta(days=7)
UPLOAD_WAIT = 1500
MEDIA = (".mp4", ".mov", ".mkv", ".m4a", ".wav", ".mp3", ".aac", ".flac", ".png", ".jpg", ".jpeg",
         ".webp", ".json", ".ttf", ".otf")
JST = dt.timezone(dt.timedelta(hours=9))
# 本体の job が GCS に置くもの（work 一式は tar.gz にまとめる）。目で見る絵は proof.py が作る
OUT_FILES = ("{id}.mp4", "{id}.qa.json", "{id}.qa.md", "{id}_strips.jpg", "{id}_strips.json",
             "{id}.sheet.jpg", "{id}.plan.json", "{id}.work.tgz",
             "{id}.sheet1s.jpg", "{id}.texts.jpg", "{id}.faces.jpg", "{id}.proof.json")
# fetch が既定で落とすもの（担当が読む・見るものだけ。mp4 と work 一式は --all のとき）
LIGHT = (".qa.md", ".qa.json", "_strips.jpg", ".sheet1s.jpg", ".texts.jpg", ".faces.jpg", ".proof.json")
# 検査を4つに分けて同時に回す（1本ずつ順だと 200秒あまり。どれも1コアしか使わず、4コアが遊ぶ）。
# 重いもの（安全域 70秒・透かし 60秒・字と顔 40秒・字幕 35秒）を別々の組に置く。
# 元素材のカクつき（42秒の動画で 20秒。元素材を元の大きさで読む）は字幕の組へ、使い回し（5秒）は
# 字と顔の組へ足した（どちらの組も安全域の 70秒を越えない。2026-10-19、zjHZucyfrq8 p2 v2 で測った）。
# カットの選び方の3つ（2026-10-21）は、読むものを分け合う相手と**同じ組**に置く。組ごとに別の子なので、
# 別の組に置くと同じ元素材・同じコマを2度読む: 止め絵はカクつきと同じ元素材の差を、似た見た目の連続は
# 使い回しと同じカットの見本のコマを使う。カットの長さは時間割とつなぎの2コマだけで軽い
QA_GROUPS = (("safe_area",), ("watermark", "black", "frozen"),
             ("text_on_face", "faces", "shot_reuse", "similar_run"),
             ("container", "loudness", "voice_vs_bgm", "subtitle_sync", "text_dup", "silence",
              "clipping", "original_audio", "cut_length", "still_image", "source_stutter", "line_breaks"))
# 作業箱の ffmpeg（ubuntu-24.04 の apt）。ランナーの版がこれで始まらなければ、要約で知らせる
WORKBOX_FFMPEG = "6.1.1"
# report の段で入れる firebase-tools と playwright-core（下見）。ふだん1分かからない。止まったら切って入れ直す
NPM_SEC = 240


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def now() -> float:
    return round(time.time(), 1)


# ---------------------------------------------------------------- 作業箱: 指示書を集める

def bake_narration(edit: dict, base: Path, work: Path) -> dict:
    """速める声（narration.tempo か max_pause_s のある行）を作業箱で作り、行の `file` に差し替えた指示書を返す。

    声を速める Rubber Band（render.py の STRETCH）はランナーに入っていない。作業箱で速めた wav を
    `file`（そのまま使う声）として運べば、ランナーに道具を足さずに済み、作業箱と同じ声のバイト列になる。
    """
    narr = edit.get("narration") or {}
    if abs(float(narr.get("tempo") or 1.0) - 1.0) < 1e-6 and not narr.get("max_pause_s"):
        return edit
    sys.path.insert(0, str(HERE))
    import render as R  # noqa: E402
    lines = []
    for ln in narr.get("lines", []):
        if ln.get("audio") and not ln.get("file"):
            wav = R.narration_wav(ln, narr, base, work)
            # 元の声の道は残さない（残すと collect がそれも運ぶ）。作業箱で速めたことだけ印を付ける
            ln = {k: v for k, v in ln.items() if k != "audio"} | {"file": str(wav), "baked": True}
        lines.append(ln)
    return {**edit, "narration": {**narr, "lines": lines}}


def collect(edit_path: Path, objects: dict[str, Path], work: Path | None = None) -> bytes:
    """指示書が指すファイルを全部 objects（sha256 → 道）に足し、道を `in/<sha256><拡張子>` に書き換える。

    書き出しは指示書の場所から相対の道を解く（render.py の resolve）。ランナーでは指示書と同じ所に
    `in/` を作って並べるので、書き換えた指示書はそのまま読める。様式（style）も指示書の隣にあれば
    同じように運ぶ（無ければランナーのリポジトリの tools/shorts/render/ のものを使う。作業箱と同じ）。
    work があれば、速める声を先にそこで作って運ぶ（bake_narration）。
    """
    base = edit_path.resolve().parent
    edit = json.loads(edit_path.read_text(encoding="utf-8"))
    if work is not None:
        edit = bake_narration(edit, base, work)
    for src in (edit.get("sources") or {}).values():
        if isinstance(src, dict) and isinstance(src.get("path"), str) and "stream" not in src:
            p = Path(src["path"]) if Path(src["path"]).is_absolute() else base / src["path"]
            st = stream_info(p)
            if st:
                src["stream"] = st
    memo: dict[str, str] = {}

    def swap(s: str) -> str:
        if s in memo:
            return memo[s]
        p = Path(s) if Path(s).is_absolute() else base / s
        if Path(s).suffix.lower() in MEDIA and p.is_file():
            h = sha256_file(p)
            objects[h] = p
            memo[s] = f"in/{h}{p.suffix.lower()}"
        else:
            memo[s] = s
        return memo[s]

    def walk(x):
        if isinstance(x, dict):
            return {k: walk(v) for k, v in x.items()}
        if isinstance(x, list):
            return [walk(v) for v in x]
        if isinstance(x, str):
            return swap(x)
        return x

    out = walk(edit)
    return (json.dumps(out, ensure_ascii=False, indent=1) + "\n").encode()


# 国旗の絵文字（地域指示子2つ。🇦🇱）。textlook.FLAG_RE と同じ。textlook は numpy を読むので、
# GCS と requests しか入れない prepare・report の箱でも読めるように、ここでは写して持つ
FLAG_RE = re.compile("[\U0001F1E6-\U0001F1FF]{2}")


def missing_flags(edit: dict) -> list[str]:
    """指示書の字に書いた国旗のうち、ランナーで描けないもの（絵が無い・git に入っていない）。

    ランナーは作業枝を checkout して `flags/<2字>.png` を読む。手元にしか無い絵では、素材を上げきって
    数分待ったあとに書き出しが止まる。上げる前に止める。
    """
    codes = sorted({"".join(chr(ord(c) - 0x1F1E6 + ord("A")) for c in m)
                    for m in FLAG_RE.findall(json.dumps(edit, ensure_ascii=False))})
    out = []
    for code in codes:
        png = HERE / "flags" / f"{code.lower()}.png"
        if not png.is_file():
            out.append(f"{code}: 絵が無い（python3 tools/shorts/render/flags.py add {code}）")
            continue
        r = subprocess.run(["git", "-C", str(HERE), "ls-files", "--error-unmatch", str(png)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            out.append(f"{code}: {png.name} が git に入っていない（コミットして作業枝に push してから回す）")
    return out


def item_id(edit_path: Path) -> str:
    m = re.match(r"^edit_(.+)\.json$", edit_path.name)
    s = m.group(1) if m else edit_path.stem
    return re.sub(r"[^A-Za-z0-9_-]", "_", s)[:16]


def pubkey_of(priv: Path) -> str:
    return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                          capture_output=True, text=True).stdout


def open_sealed(sha: str, rel: str, priv: Path, out: Path) -> Path:
    with tempfile.TemporaryDirectory(dir=out) as td:
        d = br.extract(sha, rel, Path(td))
        ok, msg = decrypt.open_one(d, priv, decrypt.pub_fp(priv), out)
    if not ok:
        raise RuntimeError(f"開けない: {msg}")
    return out / json.loads((br.git("show", f"{sha}:{rel}/manifest.json")))["dest"]


def put_one(path: Path, url: str) -> tuple[int, float]:
    import requests

    t0 = time.time()
    with open(path, "rb") as f:
        r = requests.put(url, data=f, headers={"Content-Type": "application/octet-stream"},
                         timeout=(30, 1800))
    return r.status_code, time.time() - t0


def get_one(url: str, dest: Path) -> tuple[int, str, float]:
    import requests

    t0 = time.time()
    h = hashlib.sha256()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=(30, 1800)) as r:
        if r.status_code != 200:
            return r.status_code, "", time.time() - t0
        with open(dest, "wb") as f:
            for b in r.iter_content(1 << 20):
                f.write(b)
                h.update(b)
    return 200, h.hexdigest(), time.time() - t0


def cmd_up(a) -> int:
    out = Path(a.out)
    for p in (out,):
        g = decrypt.inside_git(p if p.exists() else p.parent)
        if g:
            print(f"!! {p} はリポジトリ（{g}）の中。出来たもの・URL を置かないので断る")
            return 1
    out.mkdir(parents=True, exist_ok=True)
    T: dict[str, float] = {}
    t0 = time.time()
    objects: dict[str, Path] = {}
    items = []
    stage = Path(tempfile.mkdtemp(dir=out, prefix=".edits-"))
    try:
        for e in a.edits:
            miss = missing_flags(json.loads(Path(e).read_text(encoding="utf-8")))
            if miss:
                print(f"!! {e} の国旗をランナーで描けない: " + " / ".join(miss))
                return 1
        for e in a.edits:
            ep = Path(e)
            body = collect(ep, objects, stage / "narration")
            h = hashlib.sha256(body).hexdigest()
            (stage / h).write_bytes(body)
            objects[h] = stage / h
            items.append({"id": item_id(ep), "edit": h})
        if len({i["id"] for i in items}) != len(items):
            print("!! 指示書の名前（edit_<id>.json の id）が重なっている")
            return 1
        objs = [{"sha256": h, "bytes": p.stat().st_size} for h, p in sorted(objects.items())]
        T["collect"] = time.time() - t0
        total = sum(o["bytes"] for o in objs)
        print(f"集めた: 指示書 {len(items)}本・ファイル {len(objs)}個・{total / 1e6:.0f}MB"
              f"（{T['collect']:.0f}秒）")
        nonce = secrets.token_hex(12)
        req = {"name": a.name, "nonce": nonce, "pubkey": pubkey_of(Path(a.key)),
               "draft": bool(a.draft), "twin": not a.draft and not a.no_twin,
               "preview": not a.draft and not a.no_preview,
               "items": items, "objects": objs}
        br.push_change(a.branch, {f"{REQ_DIR}{a.name}.json":
                                  (json.dumps(req, ensure_ascii=False, indent=1) + "\n").encode()}, [],
                       f"ショートの書き出し {a.name} を Actions に頼む（{'下書き' if a.draft else '本番'}・"
                       f"{len(items)}本）\n\n作業箱で3本を順に回すと1周40分かかる。ランナーに並べて回す。"
                       "依頼に置くのは sha256 と大きさ・公開鍵・乱数だけ（中身は GCS の非公開の置き場へ）。")
        T["request"] = time.time() - t0
        print(f"依頼を出した（{T['request']:.0f}秒）。上げる URL を待つ")
        rel = f"shorts/.work/render/{a.name}/inbox"
        sha, _ = br.wait_json(a.branch, f"{rel}/manifest.json", lambda d: d.get("nonce") == nonce,
                              a.timeout)
        dest = open_sealed(sha, rel, Path(a.key), out)
        puts = json.loads((dest / "puts.json").read_text(encoding="utf-8"))
        T["inbox"] = time.time() - t0
        print(f"上げる URL が来た（{T['inbox']:.0f}秒）。GCS に無いもの {len(puts)}個を上げる")
        with cf.ThreadPoolExecutor(4) as ex:
            res = dict(zip(puts, ex.map(lambda h: put_one(objects[h], puts[h]), puts)))
        bad = [h for h, (st, _) in res.items() if st != 200]
        up_mb = sum(objects[h].stat().st_size for h in puts) / 1e6
        T["uploaded"] = time.time() - t0
        print(f"上げた {len(puts) - len(bad)}/{len(puts)}個・{up_mb:.0f}MB"
              f"（{T['uploaded'] - T['inbox']:.0f}秒）。書き出しを待つ")
        if bad:
            print(f"!! 上げられなかった: {len(bad)}個")
            return 1
    finally:
        shutil.rmtree(stage, ignore_errors=True)

    # 手を離しても後から結果を受け取れるように、乱数と時間を控える（リポジトリの外の --out にだけ）
    local = out / a.name / "request.local.json"
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(json.dumps({"name": a.name, "nonce": nonce, "branch": a.branch, "started": t0,
                                 "up": {k: round(v, 1) for k, v in T.items()}}, indent=1), encoding="utf-8")
    if a.detach:
        print(f"手を離した（{T['uploaded']:.0f}秒）。ランナーの書き出し・検査・下見は約10分。結果は:\n"
              f"  python3 tools/shorts/render/remote.py fetch --name {a.name} --key {a.key} --out {a.out}")
        return 0
    return fetch_result(a.name, Path(a.key), out, a.branch, a.timeout, a.all, a.keep_branch)


def fetch_result(name: str, key: Path, out: Path, branch: str, timeout: float, full: bool, keep: bool) -> int:
    """結果（暗号文）が来るのを待って開き、要約（summary.json）と目で見る絵だけを落とす（full なら全部）。

    担当が読むのは `<out>/<name>/summary.json` と、品目ごとの `<id>.sheet1s.jpg`（1秒ごとのコマ）・
    `<id>.texts.jpg`（字の切り抜き）・`<id>.faces.jpg`（顔の切り抜き）。mp4 は下見の URL で見る。
    """
    t_fetch = time.time()
    local = json.loads((out / name / "request.local.json").read_text(encoding="utf-8"))
    nonce, t0 = local["nonce"], local["started"]
    T = dict(local.get("up") or {})
    rel = f"shorts/.work/render/{name}"
    sha, man = br.wait_json(branch, f"{rel}/manifest.json", lambda d: d.get("nonce") == nonce, timeout)
    T["result"] = time.time() - t0
    dest = open_sealed(sha, rel, key, out)
    rep = json.loads((dest / "report.json").read_text(encoding="utf-8"))
    summ = json.loads((dest / "summary.json").read_text(encoding="utf-8")) if (dest / "summary.json").is_file() \
        else None
    print(f"結果が来た（起動から {T['result']:.0f}秒・status={man.get('status')}）")
    got_dir = out / name
    jobs = [(it["id"], f) for it in rep["items"] for f in it.get("files", [])
            if full or f["name"].endswith(LIGHT)]
    with cf.ThreadPoolExecutor(4) as ex:
        dl = list(ex.map(lambda j: (j, get_one(j[1]["get"], got_dir / j[0] / j[1]["name"])), jobs))
    T["downloaded"] = time.time() - t0
    ng = [j[1]["name"] for j, (st, h, _) in dl if st != 200 or h != j[1]["sha256"]]
    if ng:
        print(f"!! 落とし直しの sha256 が合わない: {ng}")
    if summ:
        for it in summ["items"]:
            it["local"] = {f.name: str(f) for f in sorted((got_dir / it["id"]).glob("*")) if f.is_file()} \
                if (got_dir / it["id"]).is_dir() else {}
        T["box_active_s"] = round(float(local["up"].get("uploaded", 0)) + time.time() - t_fetch, 1)
        T["wall_s"] = round(time.time() - t0, 1)
        summ["box_timing"] = {k: round(v, 1) for k, v in T.items()}
        (got_dir / "summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1), encoding="utf-8")
        print_summary(summ)
    if not keep:
        br.push_change(branch, {}, [f"{REQ_DIR}{name}.json", rel],
                       f"ショートの書き出し {name} の暗号文を下ろす\n\n作業箱で開いて使い終えた。作業枝に溜めない。")
    T["total"] = time.time() - t0
    (dest / "timing_box.json").write_text(json.dumps({k: round(v, 1) for k, v in T.items()},
                                                     indent=1), encoding="utf-8")
    print(f"要約: {got_dir / 'summary.json'}")
    print("時間（起動からの秒）: " + "  ".join(f"{k} {v:.0f}" for k, v in T.items()))
    return 1 if ng or any(it.get("status") != "ok" for it in rep["items"]) else 0


def print_summary(summ: dict) -> None:
    """要約を、担当が読む数行にする（検査は合格以外だけ名前を出す）。"""
    pv = summ.get("preview") or {}
    if pv:
        print(f"  下見: {'○' if pv.get('ok') else '!! ' + ' / '.join(pv.get('problems') or [])}"
              f"  {pv.get('playback', '')}（URL は summary.json の preview.page。7日）")
    for it in summ["items"]:
        qa = it.get("qa") or {}
        rest = [f"{c['id']}={c['status']}" for c in qa.get("checks", []) if c["status"] != "pass"]
        bgm = it.get("bgm") or {}
        ends = it.get("end_notes") or []
        print(f"  {it['id']}（{it.get('label')}）: {it.get('status')}  {it.get('seconds')}秒  sha256 {str(it.get('sha256'))[:12]}…"
              + (f"  双子 {'一致' if it.get('twin_same') else '!! 不一致'}" if it.get('twin_same') is not None else ""))
        odd = {k: v for k, v in (it.get("ffmpeg") or {}).items() if v and not str(v).startswith(WORKBOX_FFMPEG)}
        if odd:
            # apt が詰まって静的ビルドで書いた job がある。作業箱で書いた版・双子とバイト列が揃わない
            print(f"    !! ffmpeg が作業箱と違う版（{' / '.join(f'{k} {v}' for k, v in odd.items())}。"
                  f"作業箱は {WORKBOX_FFMPEG}）。同じ指示書でもバイト列が変わる。承認を取る版・出す版にするなら回し直す")
        print(f"    検査 {qa.get('overall')} {json.dumps(qa.get('counts'), ensure_ascii=False)}"
              + (f"  合格以外: {', '.join(rest)}" if rest else ""))
        print(f"    BGM の頭 {bgm.get('head_trim_s')}秒を飛ばした・0コマ目 {bgm.get('mix_first_frame_db')}dBFS"
              f"  終わりの札 " + (" / ".join(f"{e['text']} {e['from']}〜{e['to']}コマ 描かれて{'いる' if e.get('drawn') else 'いない' if e.get('drawn') is False else '?'}"
                                         for e in ends) or "!! 無い"))
        moved = it.get("moved") or []
        if moved:
            # 前の版から道（手元 ↔ Actions）を替えたときは、ここが前の版と同じかを見る（字の置き場が動いていないか）
            print("    顔を避けて動かした字: " + " / ".join(
                f"{m['text'][:12]} {m['from']}コマ〜 y {m['y_from']}→{m['y_to']}" for m in moved))


# ---------------------------------------------------------------- Actions: 依頼を読む

def read_request(req: dict, origin: str) -> dict:
    name = str(req.get("name") or "")
    if not NAME.match(name):
        raise Bad(f"{origin}: name の形が違う")
    pem, fp = norm_pem(req.get("pubkey", ""))
    nonce = str(req.get("nonce") or "")
    if not re.match(r"^[A-Za-z0-9_-]{8,64}$", nonce):
        raise Bad(f"{origin}: nonce が無い")
    items = req.get("items") or []
    objs = req.get("objects") or []
    if not 1 <= len(items) <= MAX_ITEMS or len(objs) > MAX_OBJECTS:
        raise Bad(f"{origin}: 指示書は1〜{MAX_ITEMS}本・ファイルは{MAX_OBJECTS}個まで")
    for it in items:
        if not ID.match(str(it.get("id"))) or not HEX64.match(str(it.get("edit"))):
            raise Bad(f"{origin}: items の形が違う")
    for o in objs:
        if not HEX64.match(str(o.get("sha256"))) or not isinstance(o.get("bytes"), int):
            raise Bad(f"{origin}: objects の形が違う")
    if sum(o["bytes"] for o in objs) > MAX_BYTES:
        raise Bad(f"{origin}: 合計 {MAX_BYTES // 1024 ** 3}GB まで")
    if {it["edit"] for it in items} - {o["sha256"] for o in objs}:
        raise Bad(f"{origin}: 指示書が objects に無い")
    return {"name": name, "nonce": nonce, "pubkey": pem, "pubkey_sha256": fp, "req": origin,
            "draft": bool(req.get("draft")), "twin": bool(req.get("twin")) and not req.get("draft"),
            "preview": bool(req.get("preview")) and not req.get("draft"),
            "items": items, "objects": objs}


def the_request() -> dict:
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
    files = [f for f in compare_files(before, head)
             if f.startswith(REQ_DIR) and f.endswith(".json") and f.count("/") == 2
             and (ROOT / f).is_file()]
    if not files:
        raise Bad("この push に依頼が無い")
    if len(files) > 1:
        print(f"依頼が {len(files)}件。1回に1件だけ回す（{files[0]}）")
    return read_request(json.loads((ROOT / files[0]).read_text(encoding="utf-8")), files[0])


def storage():
    sys.path.insert(0, str(HERE.parent / "preview"))
    import gcs

    client, _ = gcs.client_and_creds()
    return client, client.bucket(gcs.BUCKET)


def out_branch() -> str:
    b = os.environ.get("GITHUB_REF_NAME", "")
    if not b.startswith("claude/"):
        raise Bad(f"結果を置く枝は claude/ で始まる名前にする（{b!r}）")
    return b


def seal_to(req: dict, files: dict[str, bytes], dest_rel: str, tmp: Path, status: str) -> dict:
    src = tmp / "plain"
    if src.exists():
        shutil.rmtree(src)
    src.mkdir(parents=True)
    for n, b in files.items():
        (src / n).write_bytes(b)
    dest = tmp / "sealed"
    if dest.exists():
        shutil.rmtree(dest)
    item = {"key": f"render__{req['name']}", "mode": "render", "dest": dest_rel,
            "pubkey": req["pubkey"], "pubkey_sha256": req["pubkey_sha256"], "req": req["req"]}
    man = seal.seal(item, src, dest, {"stages": {"render": status}})
    man["nonce"] = req["nonce"]
    seal.write_json(dest / "manifest.json", man)
    shutil.rmtree(src)
    return {f"shorts/.work/{dest_rel}/{p.name}": p for p in sorted(dest.iterdir())}


# ---------------------------------------------------------------- Actions: prepare

def cmd_prepare() -> int:
    t0 = time.time()
    req = the_request()
    branch = out_branch()
    name = req["name"]
    print(f"{name}: {'下書き' if req['draft'] else '本番'}・{len(req['items'])}本"
          f"（{', '.join(i['id'] for i in req['items'])}）・双子 {'あり' if req['twin'] else 'なし'}"
          f"・ファイル {len(req['objects'])}個 {sum(o['bytes'] for o in req['objects']) / 1e6:.0f}MB")
    client, bucket = storage()
    have = {b.name[len(CAS):]: b.size for b in client.list_blobs(bucket, prefix=CAS)}
    missing = [o for o in req["objects"] if have.get(o["sha256"]) != o["bytes"]]
    puts = {o["sha256"]: bucket.blob(CAS + o["sha256"]).generate_signed_url(
        version="v4", method="PUT", expiration=PUT_TTL, content_type="application/octet-stream")
        for o in missing}
    print(f"  GCS に在るもの {len(req['objects']) - len(missing)}個・無いもの {len(missing)}個"
          f"（{sum(o['bytes'] for o in missing) / 1e6:.0f}MB）")
    with tempfile.TemporaryDirectory() as td:
        adds = seal_to(req, {"puts.json": json.dumps(puts).encode()},
                       f"render/{name}/inbox", Path(td), "ok")
        br.push_change(branch, adds, [], f"ショートの書き出し {name} の上げる URL を暗号化して置く\n\n"
                       "GCS に無いものだけ。URL は依頼の公開鍵で包む。")
    t_inbox = time.time() - t0
    print(f"  上げる URL を置いた（{t_inbox:.0f}秒）。作業箱が上げ終わるのを待つ")
    want = {o["sha256"]: o["bytes"] for o in missing}
    t1 = time.time()
    while want:
        if time.time() - t1 > UPLOAD_WAIT:
            raise Bad(f"{UPLOAD_WAIT}秒待っても、上がっていないものが {len(want)}個ある")
        time.sleep(3)
        for h in list(want):
            b = bucket.get_blob(CAS + h)
            if b is not None and b.size == want[h]:
                want.pop(h)
    print(f"  全部そろった（{time.time() - t0:.0f}秒）")
    run = os.environ.get("GITHUB_RUN_ID", "local")
    prefix = f"render/{name}/{run}/"
    roles = ["main", "twin"] if req["twin"] else ["main"]
    meta = {"name": name, "prefix": prefix, "started": t0, "ready": now(), "inbox_s": round(t_inbox, 1),
            "uploaded_mb": round(sum(o["bytes"] for o in missing) / 1e6, 1),
            "draft": req["draft"], "twin": req["twin"], "items": req["items"]}
    bucket.blob(prefix + "prepare.json").upload_from_string(json.dumps(meta),
                                                             content_type="application/json")
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        with open(gh, "a", encoding="utf-8") as f:
            # **波括弧を出力に入れない。** サービスアカウントの鍵（複数行の JSON）は1行ずつ伏せ字に
            # 登録されるので、「{」と「}」だけの行も伏せ字になり、JSON の matrix は「秘密を含むかも」と
            # 捨てられた（2026-10-17、render の job が1本も起きなかった）。並びだけ渡し、掛け合わせは
            # Actions の matrix に任せる。指示書の sha256 と下書きかどうかは GCS の prepare.json から読む
            ids = [it["id"] for it in req["items"]]
            f.write(f"ids={json.dumps(ids)}\nroles={json.dumps(roles)}\nprefix={prefix}\n")
    return 0


# ---------------------------------------------------------------- Actions: job

def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, **kw)


def qa_groups(order: list[str], draft_checks: list[str], draft: bool) -> list[tuple[str, ...]]:
    """同時に回す検査の組。**check.py に在って、どの組にも無い検査は、最後の組として回す。**

    組は名指しなので、check.py に検査を足しても、ここに書き足すまで Actions では1度も回らない
    （2026-10-19 に `source_stutter` と `shot_reuse` を足したとき、そうなっていた。報告には
    回らなかった検査の行が無いだけなので、誰も気づかない）。名指しの組に無いものは黙って捨てない。
    """
    if draft:
        groups = [("safe_area",), tuple(c for c in draft_checks if c != "safe_area")]
        want = list(draft_checks)
    else:
        groups = [tuple(c for c in g if c in order) for g in QA_GROUPS]
        want = list(order)
    placed = {c for g in groups for c in g}
    rest = tuple(c for c in want if c not in placed)
    return [g for g in groups if g] + ([rest] if rest else [])


def stream_info(p: Path) -> dict | None:
    """素材が取り込みの clips なら、どの配信の何秒目からか（同じ置き場の index.json）。

    ランナーには素材だけが sha256 の名前で並び、index.json は運ばれない。品質チェックの使い回しの検査は
    「同じ配信の同じ瞬間か」をこれで見て、元素材のカクつきの検査は差し替える区間を配信の時刻で出すので、
    指示書の素材の欄に写して運ぶ（job が `in/index.json` に書き戻す。qa/common.py の stream_of が読む形）。
    """
    try:
        j = json.loads((p.parent / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    for c in j.get("clips", []) if isinstance(j, dict) else []:
        if isinstance(c, dict) and c.get("file") == p.name and j.get("video"):
            return {"video": str(j["video"]), "start": float(c.get("start") or 0.0)}
    return None


def write_stream_index(edit: dict, into: Path) -> int:
    """指示書の素材の欄に写した配信の id と頭の秒を、ランナーの `in/index.json` に書く（書いた数を返す）。"""
    clips = []
    for src in (edit.get("sources") or {}).values():
        st = src.get("stream") if isinstance(src, dict) else None
        if isinstance(st, dict) and str(src.get("path", "")).startswith("in/"):
            clips.append({"file": Path(src["path"]).name, "video": st["video"], "start": st["start"]})
    if clips:
        (into / "index.json").write_text(json.dumps({"clips": clips}, ensure_ascii=False, indent=1),
                                         encoding="utf-8")
    return len(clips)


def run_checks(mp4: Path, work: Path, job: Path, iid: str, draft: bool) -> dict:
    """check.py を組ごとに同時に回し、1つの報告（json と md）にまとめる。並びと判定は check.py のまま。

    check.py はこの道具の中に import しない（あちらの `common` は qa/ のもの、こちらが先に読んだ
    `common` は ingest/ のもので、同じ名前がぶつかる）。並びと md は check.py を子として呼んで作る。
    """
    qa = HERE.parent / "qa"
    severity = {"pass": 0, "not-checkable": 1, "needs-human": 2, "fail": 3}  # qa/common.py の SEVERITY
    info = json.loads(subprocess.run(
        [sys.executable, "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import check; "
         "print(json.dumps({'order': list(check.CHECKS), 'draft': list(check.DRAFT_CHECKS)}))", str(qa)],
        capture_output=True, text=True, check=True).stdout)
    # 顔の検査の YuNet は qa/models/ に無い（fetch_fonts.sh が落とすのは render/models/）
    env = dict(os.environ, SHORTS_QA_YUNET=str(HERE / "models" / "face_detection_yunet_2023mar.onnx"))
    groups = qa_groups(info["order"], info["draft"], draft)
    procs = []
    for k, g in enumerate(groups):
        out = job / f"{iid}.qa{k}.json"
        procs.append((out, subprocess.Popen(
            [sys.executable, str(HERE.parent / "qa/check.py"), str(mp4), str(work), "--only", ",".join(g),
             "--json", str(out), "--crops", str(job / f"{iid}.qa")], cwd=job, env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)))
    checks, notes, errs = {}, [], []
    for out, p in procs:
        _, err = p.communicate()
        try:
            r = json.loads(out.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            errs.append((err or "")[-400:])
            continue
        checks.update({c["id"]: c for c in r["checks"]})
        notes += [n for n in r.get("notes", []) if n not in notes]
        out.unlink()
    ordered = [checks[c] for c in info["order"] if c in checks]
    worst = max((c["status"] for c in ordered), key=lambda s: severity[s], default="not-checkable")
    rep = {"file": str(mp4), "work": str(work), "plate": None, "overall": worst,
           "counts": {s: sum(c["status"] == s for c in ordered) for s in severity},
           "checks": ordered, "notes": notes + [f"検査が止まった組: {e}" for e in errs]}
    pj = job / f"{iid}.qa.json"
    pj.write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    md = subprocess.run([sys.executable, "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); "
                         "import check; print(check.markdown(json.load(open(sys.argv[2]))), end='')",
                         str(qa), str(pj)], capture_output=True, text=True)
    (job / f"{iid}.qa.md").write_text(md.stdout, encoding="utf-8")
    rc = {"pass": 0, "fail": 1, "needs-human": 3, "not-checkable": 3}[worst]
    # 要約に載せる1行ずつ（担当は qa.md を開かずに、合否と測った値の1行だけを読む）
    detail = [{"id": c["id"], "title": c["title"], "status": c["status"], "summary": c["summary"]} for c in ordered]
    return {"overall": worst, "counts": rep["counts"], "rc": rc,
            "checks": {c["id"]: c["status"] for c in ordered}, "detail": detail, "errors": errs}


def probe_stages(edit_path: Path, n: int = 24) -> dict:
    """同じ指示書の頭の n コマを、段ごとに sha256 にする（どの段が CPU で変わるかを突き合わせる）。

    元のコマの復号（ffmpeg）→ 収める（OpenCV の warpAffine ほか）→ 字の絵を重ねずに x264 で符号化 →
    顔の見つけ役（YuNet）。作業箱でも `remote.py probe edit.json` で同じものが出る。
    """
    sys.path.insert(0, str(HERE))
    import numpy as np
    import render as R

    cv2 = R.cv()
    edit, style, base = R.load(edit_path)
    with tempfile.TemporaryDirectory() as td:
        p = R.plan(edit, style, base, Path(td))
        W, H = p["size"]
        c = p["cuts"][0]
        raw, out = hashlib.sha256(), hashlib.sha256()
        frames = []
        for j, img in enumerate(R.decode_cut(c, p["fps"])):
            if j >= n:
                break
            raw.update(img.tobytes())
            fr = R.frame_of(cv2, img, c, j, W, H)
            out.update(fr.tobytes())
            frames.append(fr)
        mp4 = Path(td) / "p.mp4"
        enc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
                                "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-framerate", str(p["fps"]), "-i", "pipe:0",
                                "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+"
                                "full_chroma_int,format=yuv420p", "-c:v", "libx264", "-preset", "medium",
                                "-crf", "20", "-threads", "4", "-x264-params", R.X264_PARAMS,
                                "-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1",
                                str(mp4)], stdin=subprocess.PIPE)
        for fr in frames:
            enc.stdin.write(fr.tobytes())
        enc.stdin.close()
        enc.wait()
        x264_hash = sha256_file(mp4)[:16] if mp4.exists() else None
        yuv = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-f", "rawvideo", "-pix_fmt",
                              "yuv420p", "-"], capture_output=True).stdout
        # 同じ生のコマを、x264 を通さずに yuv420p にしただけのもの（swscale の差を x264 と分ける）
        sws = subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                              "-i", "pipe:0", "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+"
                              "accurate_rnd+full_chroma_int,format=yuv420p", "-f", "rawvideo", "-"],
                             input=b"".join(f.tobytes() for f in frames), capture_output=True).stdout
        det = cv2.FaceDetectorYN.create(str(R.YUNET), "", (W // 2, H // 2), 0.5, 0.3, 5000)
        faces = []
        for fr in frames:
            _, fs = det.detect(cv2.resize(cv2.cvtColor(fr, cv2.COLOR_RGB2BGR), (W // 2, H // 2),
                                          interpolation=cv2.INTER_AREA))
            faces.append([] if fs is None else np.round(fs, 3).tolist())
    return {"frames": len(frames), "decode": raw.hexdigest()[:16], "frame_of": out.hexdigest()[:16],
            "swscale": hashlib.sha256(sws).hexdigest()[:16],
            "x264_mp4": x264_hash,
            "x264_decoded": hashlib.sha256(yuv).hexdigest()[:16],
            "yunet": hashlib.sha256(json.dumps(faces).encode()).hexdigest()[:16], "cpu": cpu_info()}


def cpu_info() -> dict:
    """ランナーの CPU（同じ指示書でもバイト列が変わる元。README の「同じものが出るか」）。"""
    try:
        txt = Path("/proc/cpuinfo").read_text()
    except OSError:
        return {}
    model = next((ln.split(":", 1)[1].strip() for ln in txt.splitlines() if ln.startswith("model name")), "?")
    return {"model": model, "avx512": " avx512f" in txt}


def ffmpeg_version() -> str | None:
    """`ffmpeg -version` の頭の行の版（apt なら 6.1.1-3ubuntu5、静的ビルドなら N-…）。"""
    try:
        line = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.match(r"ffmpeg version (\S+)", line)
    return m.group(1) if m else None


def cmd_job() -> int:
    prefix = os.environ["PREFIX"]
    iid, role = os.environ["ITEM_ID"], os.environ["ROLE"]
    if not ID.match(iid) or role not in ("main", "twin"):
        raise Bad("matrix の形が違う")
    T: dict[str, float] = {"start": now()}
    client, bucket = storage()
    meta = json.loads(bucket.blob(prefix + "prepare.json").download_as_bytes())
    item = next(it for it in meta["items"] if it["id"] == iid)
    draft = bool(meta["draft"])
    job = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())) / "job"
    (job / "in").mkdir(parents=True, exist_ok=True)
    edit = json.loads(bucket.blob(CAS + item["edit"]).download_as_bytes())
    need = sorted(set(re.findall(r"in/([0-9a-f]{64})(\.[a-z0-9]+)", json.dumps(edit))))

    def fetch(h_ext):
        h, ext = h_ext
        p = job / "in" / f"{h}{ext}"
        bucket.blob(CAS + h).download_to_filename(str(p))
        if sha256_file(p) != h:
            raise Bad(f"GCS から読んだものの sha256 が違う（{h[:8]}…）")
        return p.stat().st_size

    with cf.ThreadPoolExecutor(8) as ex:
        sizes = list(ex.map(fetch, need))
    ep = job / f"edit_{iid}.json"
    ep.write_text(json.dumps(edit, ensure_ascii=False, indent=1), encoding="utf-8")
    write_stream_index(edit, job / "in")
    try:
        probe = probe_stages(ep)
    except Exception as e:  # noqa: BLE001  突き合わせの材料。落ちても書き出しは続ける
        probe = {"error": f"{type(e).__name__}: {e}"[:300]}
    print(f"  段ごとの指紋: {json.dumps({k: v for k, v in probe.items() if k != 'cpu'}, ensure_ascii=False)}")
    T["inputs"] = now()
    print(f"{iid}/{role}: 素材 {len(need)}個 {sum(sizes) / 1e6:.0f}MB を読んだ"
          f"（{T['inputs'] - T['start']:.0f}秒）")
    name = f"{iid}.mp4" if role == "main" else f"{iid}_twin.mp4"
    mp4, work = job / name, job / f"{Path(name).stem}.work"
    r = run([sys.executable, str(HERE / "render.py"), str(ep), "--out", str(mp4), "--work", str(work)]
            + (["--draft"] if draft else []), cwd=job, capture_output=True, text=True)
    T["rendered"] = now()
    res = {"id": iid, "role": role, "draft": draft, "timing": T, "cpu": cpu_info(), "probe": probe,
           "ffmpeg": ffmpeg_version(),
           "render_rc": r.returncode, "render_seconds": round(T["rendered"] - T["inputs"], 1),
           # 下見のページの見出し（指示書の id と題の札）。結果は GCS と暗号文にだけ置く（ログには出さない）
           "label": str(edit.get("id") or iid), "title": ((edit.get("title") or {}).get("text") or "").replace("\n", "")}
    print(f"  CPU: {res['cpu'].get('model')}（AVX-512 {'あり' if res['cpu'].get('avx512') else 'なし'}）"
          f"  ffmpeg {res['ffmpeg']}")
    if r.returncode != 0 or not mp4.is_file():
        res["error"] = (r.stderr or "")[-1500:]
        print(f"!! 書き出しが落ちた（{r.returncode}）")
    else:
        res["sha256"] = sha256_file(mp4)
        res["bytes"] = mp4.stat().st_size
        print(f"  書き出した（{res['render_seconds']}秒）sha256 {res['sha256'][:8]}…")
    if role == "main" and "sha256" in res:
        res["qa"] = run_checks(mp4, work, job, iid, draft)
        T["checked"] = now()
        res["qa"]["seconds"] = round(T["checked"] - T["rendered"], 1)
        print(f"  検査 {res['qa'].get('overall')}（{res['qa'].get('seconds')}秒）"
              f" {json.dumps(res['qa'].get('counts'), ensure_ascii=False)}")
        # strips.py の --out は「名前の頭」で、拡張子を付け替える（A.strips → A.jpg）。_ でつなぐ
        st = run([sys.executable, str(HERE.parent / "qa/strips.py"), str(mp4), str(work),
                  "--out", str(job / f"{iid}_strips")], cwd=job, capture_output=True, text=True)
        if st.returncode != 0:
            res["strips_error"] = (st.stderr or "")[-600:]
        run([sys.executable, str(HERE / "contact_sheet.py"), str(mp4), str(work), str(job / f"{iid}.sheet.jpg")],
            cwd=job, capture_output=True)
        # 担当が目で見る絵（1秒ごとのコマ・字の切り抜き・顔の切り抜き）と、頭の BGM・終わりの札の数
        pr = run([sys.executable, str(HERE / "proof.py"), str(mp4), str(work), "--prefix", str(job / iid),
                  "--crops", str(job / f"{iid}.qa")], cwd=job, capture_output=True, text=True)
        if pr.returncode != 0:
            res["proof_error"] = (pr.stderr or "")[-600:]
        elif (job / f"{iid}.proof.json").is_file():
            res["proof"] = json.loads((job / f"{iid}.proof.json").read_text(encoding="utf-8"))
        T["proof"] = now()
        shutil.copy(work / "plan.json", job / f"{iid}.plan.json")
        with tarfile.open(job / f"{iid}.work.tgz", "w:gz", compresslevel=1) as tf:
            tf.add(work, arcname=f"{iid}.work")
            if (job / f"{iid}.qa").is_dir():
                tf.add(job / f"{iid}.qa", arcname=f"{iid}.qa")
        T["extras"] = now()
        files = []
        for pat in OUT_FILES:
            p = job / pat.format(id=iid)
            if p.is_file():
                bucket.blob(f"{prefix}{iid}/{p.name}").upload_from_filename(str(p))
                files.append({"name": p.name, "bytes": p.stat().st_size, "sha256": sha256_file(p)})
        res["files"] = files
        T["uploaded"] = now()
        print(f"  GCS に置いた {len(files)}個（{T['uploaded'] - T['extras']:.0f}秒）")
    bucket.blob(f"{prefix}result_{iid}_{role}.json").upload_from_string(
        json.dumps(res, ensure_ascii=False), content_type="application/json")
    return 0 if "sha256" in res else 1


# ---------------------------------------------------------------- Actions: report

def cmd_report() -> int:
    req = the_request()
    branch = out_branch()
    prefix = os.environ["PREFIX"]
    client, bucket = storage()
    meta = json.loads(bucket.blob(prefix + "prepare.json").download_as_bytes())
    results = {}
    for b in client.list_blobs(bucket, prefix=prefix + "result_"):
        r = json.loads(b.download_as_bytes())
        results[(r["id"], r["role"])] = r
    items, status_all = [], "ok"
    for it in req["items"]:
        m = results.get((it["id"], "main"))
        tw = results.get((it["id"], "twin"))
        out = {"id": it["id"]}
        if not m or "sha256" not in m:
            out.update(status="failed", error=(m or {}).get("error", "本体の結果が無い"))
            status_all = "failed"
            items.append(out)
            continue
        out.update(status="ok", sha256=m["sha256"], bytes=m["bytes"], qa=m.get("qa"),
                   render_seconds=m["render_seconds"], timing=m["timing"], cpu=m.get("cpu"),
                   probe=m.get("probe"), label=m.get("label"), title=m.get("title"), proof=m.get("proof"),
                   ffmpeg=m.get("ffmpeg"),
                   **({"proof_error": m["proof_error"]} if m.get("proof_error") else {}))
        if req["twin"]:
            out["twin"] = {"sha256": (tw or {}).get("sha256"), "same": bool(tw) and tw.get("sha256") == m["sha256"],
                           "render_seconds": (tw or {}).get("render_seconds"), "cpu": (tw or {}).get("cpu"),
                           "probe": (tw or {}).get("probe"), "ffmpeg": (tw or {}).get("ffmpeg")}
            if not out["twin"]["same"]:
                out["status"] = "twin-differs"
        files = []
        for f in m.get("files", []):
            blob = bucket.blob(f"{prefix}{it['id']}/{f['name']}")
            files.append(dict(f, get=blob.generate_signed_url(version="v4", method="GET",
                                                              expiration=GET_TTL)))
        out["files"] = files
        items.append(out)
        if out["status"] != "ok" and status_all == "ok":
            status_all = "partial"
    pv = None
    if req["preview"] and any(it["status"] != "failed" for it in items):
        t_pv = time.time()
        try:
            pv = preview(req, items, bucket, prefix)
        except Exception as e:  # noqa: BLE001  下見が落ちても、書き出しと検査の結果は返す
            pv = {"ok": False, "problems": [f"下見を置けなかった: {type(e).__name__}: {str(e)[:400]}"]}
            # Bad の字は秘密を伏せてある（host.firebase が channels.safe_reason を通す）のでログに出す。
            # ほかの例外は URL が混ざりうるので型だけ（2026-10-31、理由が「落ちた」しか出ず追えなかった）
            pv["why"] = str(e)[:400] if isinstance(e, Bad) else type(e).__name__
        pv["seconds"] = round(time.time() - t_pv, 1)
        print(f"下見: {'できた' if pv.get('ok') else '!! 落ちた'}（{pv['seconds']}秒）"
              + (f": {pv['why']}" if pv.get("why") else ""))
    ends = [r["timing"].get("uploaded") or r["timing"].get("rendered") for r in results.values()]
    timing = {"prepare_ready_s": round(meta["ready"] - meta["started"], 1),
              "jobs_end_s": round(max(ends) - meta["started"], 1) if ends else None,
              "report_s": round(time.time() - meta["started"], 1), "uploaded_mb": meta.get("uploaded_mb")}
    rep = {"name": req["name"], "draft": req["draft"], "twin": req["twin"], "status": status_all,
           "items": items, "timing": timing, "prefix": prefix, "expires": (
               dt.datetime.now(dt.timezone.utc) + GET_TTL).isoformat(),
           "run": f"{os.environ.get('GITHUB_SERVER_URL', '')}/{os.environ.get('GITHUB_REPOSITORY', '')}"
                  f"/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"}
    for it in items:
        tw = it.get("twin")
        print(f"{it['id']}: {it['status']}  {str(it.get('sha256'))[:8]}…"
              + (f"  双子 {'一致' if tw and tw['same'] else '不一致'}" if tw else "")
              + f"  検査 {(it.get('qa') or {}).get('overall')}")
    print(f"時間: {json.dumps(timing, ensure_ascii=False)}")
    rep["preview"] = pv
    summ = summary(rep)
    with tempfile.TemporaryDirectory() as td:
        adds = seal_to(req, {"report.json": json.dumps(rep, ensure_ascii=False, indent=1).encode(),
                             "summary.json": json.dumps(summ, ensure_ascii=False, indent=1).encode()},
                       f"render/{req['name']}", Path(td), "ok" if status_all == "ok" else "failed")
        br.push_change(branch, adds, [f"{REQ_DIR}{req['name']}.json", f"shorts/.work/render/{req['name']}"],
                       f"ショートの書き出し {req['name']} の結果を暗号化して置く（{status_all}・run "
                       f"{os.environ.get('GITHUB_RUN_ID', '?')}）\n\n見る URL は依頼の公開鍵で包む。"
                       "依頼と上げる URL は同じ commit で下ろす。")
    return 0 if status_all == "ok" else 1


def wait_tools(first: subprocess.Popen, again, limit: float = NPM_SEC) -> bool:
    """下見の道具の npm install を上限つきで待ち、止まったら切って1回だけ入れ直す（again() が新しく起こす）。

    ワークフローの「道具を入れる」（retry.sh）と同じ形。上限なしで待つと、npm が止まった回は report の
    job の上限（20分）まで待って落ち、書き出しと検査の結果まで返らない。ここで切れば、下見だけ落として返す。
    """
    p = first
    for n in (1, 2):
        try:
            if p.wait(timeout=limit) == 0:
                return True
            why = f"終了コード {p.returncode}"
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()
            why = f"{limit:.0f}秒で終わらないので切った"
        print(f"::warning::firebase-tools / playwright-core の npm install … {why}（{n}回目）")
        if n == 1:
            p = again()
    return False


def preview(req: dict, items: list[dict], bucket, prefix: str) -> dict:
    """本体の mp4 を Firebase Hosting のプレビューチャンネル（7日）に並べて配り、ランナーから確かめる。

    配り方・確かめ方は下見の道（`tools/shorts/preview/host.py`）と同じ: チャンネル名は `sp-<乱数>`、
    本番の firebase.json・public は使わず一時の場所から配る・落とし直しの sha256・範囲の要求 206・
    スマホ幅の Chrome で再生。違うのは動画の受け取り方だけで、作業箱から作業枝で受け取らず、
    書き出した job が GCS に置いたものを読む（作業箱に mp4 を落として、また上げる往復が無くなる）。
    """
    import host

    tmp = Path(tempfile.mkdtemp(dir=os.environ.get("RUNNER_TEMP")))
    try:
        tools = tmp / "tools"
        npm = host.prewarm(tools)
        got = tmp / "got"
        got.mkdir()
        files, meta = [], []
        for it in items:
            if it["status"] == "failed":
                continue
            name = f"{it['id']}.mp4"
            bucket.blob(f"{prefix}{it['id']}/{name}").download_to_filename(str(got / name))
            if sha256_file(got / name) != it["sha256"]:
                raise Bad(f"{name}: GCS から読んだ mp4 の sha256 が書き出しと違う")
            files.append({"name": name, "bytes": (got / name).stat().st_size, "sha256": it["sha256"]})
            meta.append({"name": name, "label": it.get("label") or it["id"], "title": it.get("title") or "",
                         "duration": (it.get("proof") or {}).get("seconds")})
        preq = {"name": req["name"], "files": files}
        site = host.make_site(preq, got, {"title": f"下見 {req['name']}", "items": meta}, tmp)
        if not wait_tools(npm, lambda: host.prewarm(tools)):
            raise Bad("firebase-tools / playwright-core を入れられなかった（上限で2回切った）")
        # 片づけ（期限切れ・上限が近いときの下書きと古い版）→ 配る → 札、は put.py の道と同じ（host.place）。
        # 2026-10-31 に、版ごとに作ったチャンネルが上限（50本）に当たって、ここが続けて落ちた
        placed = host.place(tools, site, req["name"], tmp / "deploy.log")
        channel, url, expire = placed["channel"], placed["url"], placed["expire"]
        checks = host.verify_http(url, preq)
        play = host.playback(url, tools, tmp)
        play.pop("shot", None)
        bad = [c["name"] for c in checks if not (c["sha256_ok"] and c["range_status"] == 206)]
        if len([v for v in play.get("videos") or [] if v.get("played")]) < len(files):
            bad.append("スマホ幅で再生できないものがある")
        # 確かめが通ったときだけ、同じ回の古い版を消す
        settled = host.settle(placed, req["name"], not bad)
        return {"ok": not bad, "problems": bad, "page": url + "/", "expires": expire,
                "channel_sha256": hashlib.sha256(channel.encode()).hexdigest(),
                "files": {f["name"]: f"{url}/{f['name']}" for f in files}, "checks": checks,
                "channels": {"tidy": placed["tidy"], "labelled": placed["labelled"], "retire": settled},
                "playback": host.summarize_play(play) if "videos" in play else play.get("error")}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def summary(rep: dict) -> dict:
    """担当が読む要約（summary.json）。品目ごとに sha256・長さ・20項目の合否と測った値の1行・BGM の頭・
    終わりの札・下見の URL・目で見る絵の置き場。報告（report.json）から、読むものだけを抜く。"""
    pv = rep.get("preview") or {}
    out = []
    for it in rep["items"]:
        pr = it.get("proof") or {}
        head = pr.get("head") or {}
        qa = it.get("qa") or {}
        files = {f["name"]: f["get"] for f in it.get("files", [])}
        ent = {"id": it["id"], "label": it.get("label"), "status": it["status"], "sha256": it.get("sha256"),
               "bytes": it.get("bytes"), "seconds": pr.get("seconds"), "frames": pr.get("frames"),
               "twin_same": (it.get("twin") or {}).get("same") if it.get("twin") else None,
               "render_seconds": it.get("render_seconds"),
               # 本体と双子の ffmpeg の版。apt が詰まって静的ビルドに切り替わった job は、作業箱と違う版で書いている
               "ffmpeg": {"main": it.get("ffmpeg"), **({"twin": it["twin"].get("ffmpeg")} if it.get("twin") else {})},
               "qa": {"overall": qa.get("overall"), "counts": qa.get("counts"), "checks": qa.get("detail") or [],
                      "seconds": qa.get("seconds"), "errors": qa.get("errors")},
               "bgm": dict(pr.get("bgm") or {}, mix_first_frame_db=(head.get("mix_db") or [None])[0],
                           bgm_first_frame=head.get("bgm_first_frame"), mix_db_first_second=head.get("mix_db")),
               "end_notes": pr.get("end_notes"), "moved": pr.get("moved"),
               "preview": (pv.get("files") or {}).get(f"{it['id']}.mp4"),
               "look": {k: files.get(f"{it['id']}{suf}") for k, suf in
                        (("sheet1s", ".sheet1s.jpg"), ("texts", ".texts.jpg"), ("faces", ".faces.jpg"),
                         ("strips", "_strips.jpg"), ("qa_md", ".qa.md"), ("mp4", ".mp4"), ("work", ".work.tgz"))}}
        if it.get("error") or it.get("proof_error"):
            ent["error"] = it.get("error") or it.get("proof_error")
        out.append(ent)
    return {"format": "shorts-render-summary/1", "name": rep["name"], "status": rep["status"],
            "draft": rep["draft"], "run": rep.get("run"), "expires": rep.get("expires"), "timing": rep.get("timing"),
            "preview": {k: pv.get(k) for k in ("ok", "problems", "page", "expires", "playback", "seconds",
                                                "channel_sha256", "channels")} if pv else None,
            "items": out}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("up")
    p.add_argument("--name", required=True)
    p.add_argument("--key", required=True)
    p.add_argument("--out", required=True, help="出来たものを落とす場所（リポジトリの外）")
    p.add_argument("--branch", default=BRANCH)
    p.add_argument("--draft", action="store_true", help="下書きの段（縦横半分・双子なし・最低限の検査）")
    p.add_argument("--no-twin", action="store_true", help="本番の段で双子を回さない")
    p.add_argument("--timeout", type=float, default=2400)
    p.add_argument("--keep-branch", action="store_true")
    p.add_argument("--no-preview", action="store_true", help="本番の段でも下見（Hosting）を置かない")
    p.add_argument("--detach", action="store_true",
                   help="素材を上げたら手を離す（結果は fetch で受け取る。待つあいだ担当の手が空く）")
    p.add_argument("--all", action="store_true", help="mp4・work 一式も落とす（既定は要約と目で見る絵だけ）")
    p.add_argument("edits", nargs="+")
    f = sub.add_parser("fetch", help="up --detach で頼んだ結果を待って受け取る")
    f.add_argument("--name", required=True)
    f.add_argument("--key", required=True)
    f.add_argument("--out", required=True)
    f.add_argument("--branch", default=BRANCH)
    f.add_argument("--timeout", type=float, default=2400)
    f.add_argument("--keep-branch", action="store_true")
    f.add_argument("--all", action="store_true", help="mp4・work 一式も落とす")
    for n in ("prepare", "job", "report"):
        sub.add_parser(n)
    pp = sub.add_parser("probe", help="指示書の頭のコマを段ごとに sha256 にする（ランナーの job と突き合わせる）")
    pp.add_argument("edit")
    a = ap.parse_args()
    if a.cmd == "probe":
        print(json.dumps(probe_stages(Path(a.edit)), ensure_ascii=False))
        return 0
    if a.cmd == "fetch":
        if not NAME.match(a.name) or not a.branch.startswith("claude/"):
            print("!! name は英数字と . _ -、作業枝は claude/ で始まる名前")
            return 1
        return fetch_result(a.name, Path(a.key), Path(a.out), a.branch, a.timeout, a.all, a.keep_branch)
    if a.cmd == "up":
        if not NAME.match(a.name) or not a.branch.startswith("claude/"):
            print("!! name は英数字と . _ -、作業枝は claude/ で始まる名前")
            return 1
        return cmd_up(a)
    return {"prepare": cmd_prepare, "job": cmd_job, "report": cmd_report}[a.cmd]()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! {e}")
        sys.exit(1)
