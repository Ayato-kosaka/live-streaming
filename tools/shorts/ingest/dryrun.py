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
"""

from __future__ import annotations

import filecmp
import json
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

    man = json.loads((sealed / item["dest"] / "manifest.json").read_text())
    print(json.dumps({k: man[k] for k in ("status", "stages", "counts", "bytes")},
                     ensure_ascii=False))
    for f in fails:
        print("NG", f)
    print("OK 一周した" if not fails else f"NG {len(fails)}件")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
