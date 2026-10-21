"""YouTube に行かずに、解析 → 暗号化 → 復号を一周させて確かめる（手元用）。

    python3 tools/shorts/ingest/dryrun.py /path/outside/repo

ffmpeg で「場面の変わりめの時刻が分かっている」縦長の動画を作り、download.py が
置くのと同じ形（src.mkv / src.info.json / src.ja.json3 / fetch.json）に並べて、
analyze.py → seal.py → decrypt.py を通す。whisper はモデルを落とせない箱でも
回るように外す（`whisper` の段は skipped / failed になってよい）。

見ること（どれか外れたら 1 で終わる）:

1. 作った変わりめ（20秒・45秒・70秒）が scenes.csv に ±0.3秒で出る
2. 10秒刻みのコマの数とシートの枚数が長さから計算した数と合う
3. シートの1コマ目の時刻の帯が 0:00:00 で、2コマ目が 0:00:10
4. 復号して出てきたファイルの一覧と中身が、暗号化する前と1バイトも違わない
5. 鍵を取り違えると開かない・暗号文を1バイト壊すと開かない
6. clips: コマ番号を縞で焼いた動画（キーフレーム5秒おき）から区間を切り、
   **各 mp4 の1コマ目が「頼んだ秒のコマ」で、そこから1コマも抜けず・重ならずに続く**。
   縦横・fps・音・長さ・index.json の sha256 が合う。動画の外の区間は NG になり、
   残りは使える（段は failed、manifest は partial）
7. clips の暗号文を小さく切っても（payload.enc.000 …）、つないで元に戻る。
   切れ端が1つ欠けたら開かない
8. clips の見る用のシート: 合格した mp4 ごとに2秒に1コマ・コマの数と枚数が長さから
   計算した数と合う・**各コマに写っている縞（コマ番号）が「区間の頭＋2秒×k」のコマ**で、
   sheets.csv の from / to が配信の秒。横長の長い区間（65.5秒・頭に端数）は横長の格子で
   2枚に均して分かれる。はみ出した区間（mp4 が無い）にはシートを作らない
9. 見る用の小さな封（sheets.key.enc・sheets.enc）だけを別の置き場に写して
   `decrypt.py --sheets` で開ける（mp4 の暗号文が手元に無くても開く）。開いたものは
   シートと一覧だけで、元と1バイトも違わない。先に開いた mp4 は消さない
"""

from __future__ import annotations

import filecmp
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable


def sh(*a, **kw):
    return subprocess.run(list(a), check=True, **kw)


def make_media(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)
    # 4つの場面（0-20, 20-45, 45-70, 70-90 秒）。縦長 360x640。音は場面ごとに大きさを変える
    srcs = ["testsrc2=s=360x640:r=30:d=20", "smptebars=s=360x640:r=30:d=25",
            "mandelbrot=s=360x640:r=30,trim=duration=25", "rgbtestsrc=s=360x640:r=30:d=20"]
    args = ["ffmpeg", "-v", "error", "-y"]
    for s in srcs:
        args += ["-f", "lavfi", "-i", s]
    for vol, dur in [(0.1, 20), (0.5, 25), (0.02, 25), (0.8, 20)]:
        args += ["-f", "lavfi", "-i", f"sine=f=440:d={dur},volume={vol}"]
    fc = "".join(f"[{i}:v]setpts=PTS-STARTPTS,format=yuv420p[v{i}];" for i in range(4))
    fc += "".join(f"[v{i}][{i + 4}:a]" for i in range(4)) + "concat=n=4:v=1:a=1[v][a]"
    sh(*args, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264",
       "-preset", "veryfast", "-c:a", "aac", str(d / "src.mkv"))
    (d / "src.info.json").write_text(json.dumps({
        "id": "dryrun00000", "title": "dry run", "duration": 90, "view_count": 1,
        "automatic_captions": {"ja": []}, "subtitles": {},
        "heatmap": [{"start_time": 0, "end_time": 45, "value": 0.2},
                    {"start_time": 45, "end_time": 90, "value": 1.0}]}))
    (d / "src.ja.json3").write_text(json.dumps({"events": [
        {"tStartMs": 0, "dDurationMs": 5000, "id": 1},
        {"tStartMs": 1000, "dDurationMs": 4000, "segs": [{"utf8": "こんにちは"},
                                                          {"utf8": "テスト", "tOffsetMs": 600}]},
        {"tStartMs": 3000, "aAppend": 1, "segs": [{"utf8": "\n"}]},
        {"tStartMs": 3500, "dDurationMs": 4000, "segs": [{"utf8": "二行目"}]}]}))
    (d / "fetch.json").write_text(json.dumps({"ok": True, "sec": 0, "finished_at": "x",
                                              "tries": [{"client": "dryrun"}]}))


# clips の確かめに使う「コマ番号の縞」。1本の幅をマクロブロック（16px）に揃え、
# 白=1・黒=0 の12本でコマ番号（4096まで）を焼く。CRF 18 で符号化し直しても
# 縞の真ん中は潰れないので、切った mp4 の各コマが元の何コマ目かを読み戻せる
BAR, BITS, CH = 16, 12, 320
CW = BAR * BITS


def make_counter(d: Path, sec: int = 40, ch: int = CH, vid: str = "dryrun00000") -> None:
    """コマ番号を縞で焼いた動画を src.mkv として置く（download.py の clips と同じ形）。

    キーフレームは5秒おき・B フレームあり。YouTube の配信と同じく疎らにして、
    頭を合わせるのに「手前のキーフレームから復号して、頼んだ秒より前を捨てる」道を通らせる。
    音は PCM（AAC のように頭に詰め物が入らず、時刻の起点が映像と揃う）。
    `ch` を幅（192）より小さくすると横長になる（シートの格子が入れ替わるのを見る）。
    """
    d.mkdir(parents=True, exist_ok=True)
    p = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{CW}x{ch}", "-r", "30", "-i", "-",
         "-f", "lavfi", "-i", f"sine=f=440:d={sec}",
         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
         "-g", "150", "-bf", "2", "-c:a", "pcm_s16le", str(d / "src.mkv")],
        stdin=subprocess.PIPE)
    chroma = bytes([128]) * ((CW // 2) * (ch // 2) * 2)
    for k in range(sec * 30):
        row = b"".join(bytes([235 if (k >> b) & 1 else 16]) * BAR for b in range(BITS))
        p.stdin.write(row * ch + chroma)
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError("縞の動画が作れない")
    (d / "src.info.json").write_text(json.dumps({"id": vid, "duration": sec,
                                                 "format_id": "dryrun"}))
    (d / "fetch.json").write_text(json.dumps({"ok": True, "sec": 0, "finished_at": "x",
                                              "tries": [{"client": "dryrun"}]}))


def read_counter(mp4: Path) -> list[int]:
    """mp4 の全部のコマから、焼いたコマ番号を読み戻す（縞の真ん中の行・各縞の中央の画素）。"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-map", "0:v:0",
                          "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "yuv420p",
                          "-"], capture_output=True, check=True).stdout
    size = CW * CH * 3 // 2
    ids = []
    for i in range(len(raw) // size):
        mid = raw[i * size + (CH // 2) * CW: i * size + (CH // 2 + 1) * CW]
        ids.append(sum(1 << b for b in range(BITS) if mid[b * BAR + BAR // 2] > 125))
    return ids


def sheet_counters(jpg: Path, cells: int, src_wh: tuple[int, int]) -> list[int]:
    """シート1枚の各コマから、縞のコマ番号を読み戻す（make_sheets と同じ並びで当てる）。"""
    from PIL import Image

    from analyze import CLIP_SHEET
    from media import sheet_cell, tile_size

    w, h = src_wh
    tw, th = tile_size(w, h, CLIP_SHEET["long"])
    g = CLIP_SHEET["grid"]
    grid = g if h >= w else (g[1], g[0])
    # 縮めたときの倍率と、余りを埋めた黒の幅（_fit と同じ）
    sc = min(tw / w, th / h)
    ox, oy = (tw - round(w * sc)) // 2, (th - round(h * sc)) // 2
    with Image.open(jpg) as im:
        px = im.convert("L").load()
        ids = []
        for i in range(cells):
            x, y = sheet_cell(i, grid, (tw, th))
            yc = y + oy + int(h * sc / 2)
            ids.append(sum(1 << b for b in range(BITS)
                           if px[x + ox + int((b * BAR + BAR / 2) * sc), yc] > 125))
    return ids


def check_sheets(out: Path, fails: list[str], what: str, every: float = 2.0) -> dict:
    """8. 合格した mp4 ごとのシート。コマの数・枚数・from / to・写っている縞を当てる。"""
    import csv

    from analyze import CLIP_SHEET

    idx = json.loads((out / "index.json").read_text())
    if not (out / "sheets.csv").exists():
        fails.append(f"{what}: sheets.csv が無い（シートの段が回っていない）")
        return {}
    rows = list(csv.DictReader(open(out / "sheets.csv")))
    cap = CLIP_SHEET["grid"][0] * CLIP_SHEET["grid"][1]
    seen = {}
    for c in idx["clips"]:
        mine = [r for r in rows if int(r["clip"]) == c["n"]]
        if not c.get("width"):
            if mine:
                fails.append(f"{what} {c['n']:02d}: mp4 が無い区間にシートがある")
            continue
        # 2秒ごとのコマは mp4 のコマ数（30fps）÷60 の切り上げだけある
        n_want = -(-int(c["frames"]) // round(every * 30))
        pages = -(-n_want // cap)
        got = [int(r["frames"]) for r in mine]
        if sum(got) != n_want or len(mine) != pages or (got and max(got) - min(got) > 1):
            fails.append(f"{what} {c['n']:02d}: シート {got}（欲しいのは {n_want}コマを "
                         f"{pages}枚に均す）")
            continue
        if [r["file"] for r in mine] != [f"sheets/{c['n']:02d}_{k + 1:02d}.jpg"
                                         for k in range(pages)]:
            fails.append(f"{what} {c['n']:02d}: シートの名前 {[r['file'] for r in mine]}")
        k0, n0 = 0, round(c["start"] * 30)
        for r in mine:
            fr, to = float(r["from"]), float(r["to"])
            want_from = c["start"] + every * k0
            want_to = c["start"] + every * (k0 + int(r["frames"]) - 1)
            if abs(fr - want_from) > 0.02 or abs(to - want_to) > 0.02:
                fails.append(f"{what} {r['file']}: from/to {fr}/{to}（欲しいのは配信の "
                             f"{want_from:g}/{want_to:g}秒）")
            ids = sheet_counters(out / r["file"], int(r["frames"]), (c["width"], c["height"]))
            want = [n0 + round(every * 30) * (k0 + i) for i in range(int(r["frames"]))]
            if ids != want:
                fails.append(f"{what} {r['file']}: 写っているコマ {ids[:4]}…（欲しいのは "
                             f"{want[:4]}…＝区間の頭から2秒ずつ）")
            k0 += int(r["frames"])
        seen[c["n"]] = got
    return seen


def landscape_leg(root: Path, media: Path, pub: Path, fails: list[str]) -> None:
    """8 の横長・長い区間。65.5秒（頭に端数）→ 33コマを横長の格子で 17＋16 に均す。"""
    from plan import items_of

    it = items_of({"mode": "clips", "videos": ["dryrunland0"], "pubkey": pub.read_text(),
                   "ranges": ["0:00:01.5-0:01:07"]}, "dryrun")[0]
    make_counter(media / it["key"], sec=70, ch=108, vid="dryrunland0")
    (root / "litem.json").write_text(json.dumps(it))
    lout = root / "lout"
    subprocess.run([PY, str(HERE / "analyze.py"), str(root / "litem.json"), str(media),
                    str(lout)], env={**os.environ, "RUNNER_TEMP": str(root)},
                   capture_output=True)
    st = json.loads((root / f"stages-{it['key']}.json").read_text())
    if st["stages"].get("clips") != "ok" or st["stages"].get("sheets") != "ok":
        fails.append(f"横長: 段が ok でない {st['stages']}")
        return
    got = check_sheets(lout, fails, "横長")
    if got.get(1) != [17, 16]:
        fails.append(f"横長の65.5秒が 17＋16 に均されていない: {got}")
    from PIL import Image
    with Image.open(lout / "sheets" / "01_01.jpg") as im:
        # 横長は格子が入れ替わる（縦長 6×5 → 横長 5×6）。1コマは 320×180
        if im.width != 5 * 320 + 6 * 4:
            fails.append(f"横長のシートの幅 {im.width}（5列×320 のはず）")


def clips_leg(root: Path, media: Path, pub: Path, priv: Path, fails: list[str]) -> None:
    """clips を一周させる（6・7）。"""
    import seal as seal_mod
    from plan import items_of

    req = {"mode": "clips", "videos": ["dryrun00000"], "pubkey": pub.read_text(),
           "ranges": ["0:00:02.5-0:00:07", "0:00:10-0:00:12.4", "0:00:33.3-0:00:36.9",
                      "0:00:05-0:00:08",  # 1本目と重なる区間も、それぞれ1本として切る
                      "0:00:38-0:00:45"]}  # 動画（40秒）の外にはみ出す → NG
    items = items_of(req, "dryrun")
    if len(items) != 1 or items[0]["dest"] != "dryrun00000/clips":
        fails.append(f"clips の依頼が1本の job にならない: {[i['key'] for i in items]}")
        return
    it = items[0]
    make_counter(media / it["key"])
    (root / "kitem.json").write_text(json.dumps(it))
    kout = root / "kout"
    subprocess.run([PY, str(HERE / "analyze.py"), str(root / "kitem.json"), str(media),
                    str(kout)], env={**os.environ, "RUNNER_TEMP": str(root)})
    st = json.loads((root / f"stages-{it['key']}.json").read_text())
    if st["stages"].get("clips") != "failed" or st["counts"].get("clips_ok") != 4:
        fails.append(f"clips の段（はみ出し1本で failed・合格4本のはず）: {st}")
    idx = json.loads((kout / "index.json").read_text())
    if [c["ok"] for c in idx["clips"]] != [True, True, True, True, False]:
        fails.append(f"clips の合否が違う: {[(c['n'], c['ok'], c.get('why')) for c in idx['clips']]}")
    for c in idx["clips"][:4]:
        p = kout / c["file"]
        if not p.exists():
            fails.append(f"clips {c['n']:02d} の mp4 が無い: {c['file']}")
            continue
        n0, want = round(c["start"] * 30), round((c["end"] - c["start"]) * 30)
        ids = read_counter(p)
        # 1コマ目が頼んだ秒のコマで、そこから1コマずつ続く（抜け・重なりが無い）
        if not ids or ids[0] != n0 or ids != list(range(n0, n0 + len(ids))) \
                or abs(len(ids) - want) > 1:
            fails.append(f"clips {c['n']:02d} のコマが違う: 頭 {ids[:3]}… {len(ids)}コマ"
                         f"（欲しいのは {n0} から {want}コマ）")
        if (c["width"], c["height"]) != (CW, CH) or abs(c["fps"] - 30) > 0.01 \
                or not c.get("audio_duration") or abs(c["duration"] - c["want_sec"]) > 0.1:
            fails.append(f"clips {c['n']:02d} の形が違う: {c}")
        if c["sha256"] != seal_mod.sha256_file(p):
            fails.append(f"clips {c['n']:02d} の sha256 が index.json と合わない")

    # 8. 見る用のシート（縦長・短い区間。はみ出した 05 には作らない）
    if st["stages"].get("sheets") != "ok":
        fails.append(f"シートの段が ok でない: {st['stages'].get('sheets')}")
    seen = check_sheets(kout, fails, "縦長")
    if sorted(seen) != [1, 2, 3, 4]:
        fails.append(f"縦長: シートのある mp4 が {sorted(seen)}（01〜04 のはず）")

    # 7. 小さく切って封をし、つないで開く。切れ端が欠けたら開かない
    seal_mod.PART = 256 * 1024
    ksealed = root / "ksealed" / it["dest"]
    man = seal_mod.seal(it, kout, ksealed, st)
    names = [f["name"] for f in man["encrypted_files"]]
    # 切れ端の数は暗号文の大きさから決まる（合成の素材は小さいので2つで済むこともある）
    want_parts = -(-sum(f["bytes"] for f in man["encrypted_files"]) // seal_mod.PART)
    if len(names) < 2 or len(names) != want_parts or names[0] != "payload.enc.000" \
            or man["status"] != "partial" \
            or any(f["bytes"] > seal_mod.PART for f in man["encrypted_files"]):
        fails.append(f"clips の封の切り方が違う: {names} status={man['status']}")
    if ".mp4" in (ksealed / "manifest.json").read_text():
        fails.append("manifest.json に clips のファイル名が平文で出ている")
    r = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(priv), "--out",
                        str(root / "kopened"), str(ksealed)], capture_output=True, text=True)
    print(r.stdout.strip())
    got = root / "kopened" / it["dest"]
    same = r.returncode == 0 and all(
        (got / q.relative_to(kout)).is_file()
        and (got / q.relative_to(kout)).read_bytes() == q.read_bytes()
        for q in kout.rglob("*") if q.is_file())
    if not same:
        fails.append("clips を切れ端から開いたものが元と違う")

    # 9. 見る用の小さな封だけを別の置き場に写して開く（mp4 の暗号文は手元に無い）
    light = man.get("sheets") or {}
    lnames = ["manifest.json", light.get("key_file", "?")] + [
        f["name"] for f in light.get("encrypted_files") or []]
    only = root / "klight" / it["dest"]
    only.mkdir(parents=True)
    for nm in lnames:
        if (ksealed / nm).is_file():
            shutil.copy(ksealed / nm, only / nm)
    r6 = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(priv), "--sheets", "--out",
                         str(root / "klopened"), str(only)], capture_output=True, text=True)
    print(r6.stdout.strip())
    lgot = root / "klopened" / it["dest"]
    want = sorted(q.relative_to(kout) for q in kout.rglob("*") if q.is_file()
                  and (q.parts[len(kout.parts)] in ("sheets", "sheets.csv", "index.json",
                                                    "index.md", "meta.json")))
    have = sorted(q.relative_to(lgot) for q in lgot.rglob("*") if q.is_file()) \
        if lgot.exists() else []
    if r6.returncode != 0 or not light or have != want or not any(
            str(q).startswith("sheets/") for q in have) or any(
            (lgot / q).read_bytes() != (kout / q).read_bytes() for q in have):
        fails.append(f"見る用の封だけでシートが開けない: rc={r6.returncode} "
                     f"開いた {[str(q) for q in have][:6]}…")
    if light and light.get("sheets") != len(list((kout / "sheets").glob("*.jpg"))):
        fails.append(f"manifest の sheets.sheets {light.get('sheets')} がシートの枚数と違う")
    if light and any(f["bytes"] > 5 * 1024 * 1024 for f in light["encrypted_files"]):
        fails.append("見る用の封が大きい（mp4 が混ざった？）")
    # 先に全部開いた置き場に、あとからシートだけを開いても mp4 は消えない
    r7 = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(priv), "--sheets", "--out",
                         str(root / "kopened"), str(only)], capture_output=True, text=True)
    if r7.returncode != 0:
        fails.append(f"全部開いた置き場に、シートだけを開き直せない（{r7.stdout.strip()[-60:]}）")
    elif len(list(got.glob("*.mp4"))) != 4:
        fails.append("シートだけを開き直したら、先に開いた mp4 が消えた")
    (ksealed / names[1]).unlink()
    r5 = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(priv), "--out",
                         str(root / "kopened2"), str(ksealed)], capture_output=True, text=True)
    if r5.returncode == 0:
        fails.append("切れ端が1つ欠けたのに開いてしまった")


def main() -> int:
    root = Path(sys.argv[1]).resolve()
    if root.exists():
        shutil.rmtree(root)
    media, out, sealed, opened = (root / x for x in ("media", "out", "sealed", "opened"))
    item = {"key": "dryrun00000__archive", "video": "dryrun00000", "mode": "archive",
            "dir": "archive", "dest": "dryrun00000/archive", "req": "dryrun",
            "whisper": {"model": "tiny", "batch": 1, "beam": 1, "language": "ja"},
            "bench": None}
    make_media(media / item["key"])
    keys = root / "keys"
    keys.mkdir()
    sh("openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072",
       "-out", str(keys / "priv.pem"), stderr=subprocess.DEVNULL)
    sh("openssl", "pkey", "-in", str(keys / "priv.pem"), "-pubout", "-out", str(keys / "pub.pem"))
    sh("openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
       "-out", str(keys / "other.pem"), stderr=subprocess.DEVNULL)
    sys.path.insert(0, str(HERE))
    from plan import norm_pem
    item["pubkey"], item["pubkey_sha256"] = norm_pem((keys / "pub.pem").read_text())
    (root / "item.json").write_text(json.dumps(item))

    subprocess.run([PY, str(HERE / "analyze.py"), str(root / "item.json"), str(media), str(out)],
                   env={**__import__("os").environ, "RUNNER_TEMP": str(root)})
    stages = root / f"stages-{item['key']}.json"
    sh(PY, str(HERE / "seal.py"), str(root / "item.json"), str(out), str(sealed / item["dest"]),
       str(stages))
    fails = []
    st = json.loads(stages.read_text())["stages"]
    for k in ("meta", "captions", "audio", "visual", "timeline10"):
        if st.get(k) != "ok":
            fails.append(f"段 {k} が {st.get(k)}")

    import csv
    cuts = [float(r["t"]) for r in csv.DictReader(open(out / "scenes.csv"))]
    for want in (20, 45, 70):
        if not any(abs(c - want) <= 0.3 for c in cuts):
            fails.append(f"変わりめ {want}秒 が見つからない（出たのは {cuts}）")
    sheets = list(csv.DictReader(open(out / "sheets.csv")))
    frames = sum(int(s["frames"]) for s in sheets)
    if not (9 <= frames <= 10) or len(sheets) != 1:
        fails.append(f"コマ {frames}・シート {len(sheets)}枚（欲しいのは 9〜10コマ・1枚）")
    if sheets and (sheets[0]["from_hms"] != "0:00:00"):
        fails.append(f"1コマ目の時刻が {sheets[0]['from_hms']}")

    r = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(keys / "priv.pem"),
                        "--out", str(opened), str(sealed / item["dest"])],
                       capture_output=True, text=True)
    print(r.stdout.strip())
    cmp = filecmp.dircmp(out, opened / item["dest"])

    def diff(c):
        bad = c.left_only + c.right_only + c.diff_files + c.funny_files
        for sub in c.subdirs.values():
            bad += diff(sub)
        return bad

    if r.returncode != 0 or diff(cmp):
        fails.append(f"復号したものが元と違う: {diff(cmp)}")
    r2 = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(keys / "other.pem"),
                         "--out", str(root / "o2"), str(sealed / item["dest"])],
                        capture_output=True, text=True)
    if r2.returncode == 0:
        fails.append("違う鍵で開けてしまった")
    p = sealed / item["dest"] / "payload.enc"
    b = bytearray(p.read_bytes())
    b[len(b) // 2] ^= 1
    p.write_bytes(bytes(b))
    r3 = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(keys / "priv.pem"),
                         "--out", str(root / "o3"), str(sealed / item["dest"])],
                        capture_output=True, text=True)
    if r3.returncode == 0:
        fails.append("壊した暗号文を開けてしまった")
    r4 = subprocess.run([PY, str(HERE / "decrypt.py"), "--key", str(keys / "priv.pem"),
                         "--out", str(HERE / "_should_not_exist"), str(sealed / item["dest"])],
                        capture_output=True, text=True)
    if r4.returncode != 2:
        fails.append("リポジトリの中へ展開するのを断らなかった")
    shutil.rmtree(HERE / "_should_not_exist", ignore_errors=True)

    # zoom: 落とした動画そのものが区間（30〜50秒）。焼く秒は区間の頭から足す
    zitem = dict(item, key="dryrun00000__zoom", mode="zoom", dir="zoom-30-50-1fps",
                 dest="dryrun00000/zoom-30-50-1fps", range=[30, 50], fps=1)
    zd = media / zitem["key"]
    zd.mkdir(parents=True)
    sh("ffmpeg", "-v", "error", "-y", "-ss", "30", "-t", "20", "-i",
       str(media / item["key"] / "src.mkv"), "-an", "-c:v", "libx264", "-preset", "veryfast",
       str(zd / "src.mp4"))
    (zd / "fetch.json").write_text(json.dumps({"ok": True, "sec": 0}))
    (root / "zitem.json").write_text(json.dumps(zitem))
    subprocess.run([PY, str(HERE / "analyze.py"), str(root / "zitem.json"), str(media),
                    str(root / "zout")], env={**__import__("os").environ, "RUNNER_TEMP": str(root)},
                   capture_output=True)
    zs = list(csv.DictReader(open(root / "zout" / "sheets.csv")))
    if not zs or zs[0]["from_hms"] != "0:00:30" or sum(int(s["frames"]) for s in zs) not in (20, 21):
        fails.append(f"zoom のシートが違う: {zs}")
    if not any(abs(float(r["t"]) - 45) <= 0.3 for r in csv.DictReader(open(root / "zout" / "scenes.csv"))):
        fails.append("zoom で 45秒の変わりめが元の時刻で出ない")

    # channel: 一覧と、上位だけ詳しく引いたもの
    citem = {"key": "channels__dryrun__shorts", "mode": "channel", "channel": "@dryrun",
             "tab": "shorts", "limit": 3, "details": 2, "dir": "channels/dryrun/shorts",
             "dest": "channels/dryrun/shorts", "req": "dryrun"}
    cd = media / citem["key"]
    cd.mkdir(parents=True)
    (cd / "flat.json").write_text(json.dumps({"channel": "Dry", "channel_id": "UCx", "entries": [
        {"id": "aaaaaaaaaaa", "title": "a", "view_count": 100},
        {"id": "bbbbbbbbbbb", "title": "b", "view_count": 5000},
        {"id": "ccccccccccc", "title": "c", "view_count": 300}]}))
    (cd / "details.jsonl").write_text(json.dumps(
        {"id": "bbbbbbbbbbb", "view_count": 5123, "duration": 31, "upload_date": "20260901"}) + "\n")
    (cd / "fetch.json").write_text(json.dumps({"ok": True, "sec": 0, "finished_at": "x"}))
    (root / "citem.json").write_text(json.dumps(citem))
    subprocess.run([PY, str(HERE / "analyze.py"), str(root / "citem.json"), str(media),
                    str(root / "cout")], env={**__import__("os").environ, "RUNNER_TEMP": str(root)},
                   capture_output=True)
    rows = list(csv.DictReader(open(root / "cout" / "channel.csv")))
    if [r["id"][0] for r in rows] != ["b", "c", "a"] or rows[0]["view_count"] != "5123":
        fails.append(f"channel の並びか数が違う: {[(r['id'], r['view_count']) for r in rows]}")

    clips_leg(root, media, keys / "pub.pem", keys / "priv.pem", fails)
    landscape_leg(root, media, keys / "pub.pem", fails)

    man = json.loads((sealed / item["dest"] / "manifest.json").read_text())
    print(json.dumps({k: man[k] for k in ("status", "stages", "counts", "bytes")},
                     ensure_ascii=False))
    for f in fails:
        print("NG", f)
    print("OK 一周した" if not fails else f"NG {len(fails)}件")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
