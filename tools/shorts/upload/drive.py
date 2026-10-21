"""Google Drive の共有フォルダ（リンクを知っている人は閲覧可）を、ショートの素材として受け取る（Actions 側）。

`serve.py` の action `drive` から呼ぶ。作業箱からは drive.google.com に届かない（プロキシが 403）ので、
ランナーで落とし、書き出しにそのまま渡せる形（SDR・H.264・30fps 以下・回転を焼いた縦横）に揃えて、
非公開バケットに置き、署名付き GET の URL を作る。URL・ファイル名・中身はログに出さない
（このリポジトリは公開で、Actions のログも誰でも読める）。結果は serve.py が依頼の公開鍵で包む。

iPhone の動画は HLG（Dolby Vision 8.4 の土台）が多い。そのまま 8bit に落とすと色が白ちゃけるので、
zscale + tonemap で SDR に寄せる。zscale が無い ffmpeg では素直に縮めるだけにして、そのことを結果に書く。
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import secrets
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

FOLDER = re.compile(r"^[A-Za-z0-9_-]{10,80}$")
VIDEO_EXT = {".mov", ".mp4", ".m4v", ".mkv", ".avi", ".mts", ".3gp", ".webm"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
SIGN_TTL = dt.timedelta(days=3)
HDR_TRC = {"arib-std-b67", "smpte2084"}
# HLG/PQ → BT.709。npl=100 と hable は iPhone の HLG で白飛びしにくかった組み合わせ
TONEMAP = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
           "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p")


def _run(args: list[str], timeout: int = 3600) -> subprocess.CompletedProcess:
    # 出力は捨てる（ファイル名や URL が混ざる）。落ちたときも末尾だけを、伏せて持つ
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def fetch_folder(folder: str, dest: Path) -> dict:
    """gdown で落とす。落ちたら embeddedfolderview の一覧から1本ずつ落とす。"""
    dest.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    url = f"https://drive.google.com/drive/folders/{folder}"
    r = _run(["gdown", "--folder", "--quiet", "--remaining-ok", url, "-O", str(dest)], 3000)
    got = [p for p in dest.rglob("*") if p.is_file()]
    if r.returncode == 0 and got:
        return {"via": "gdown", "sec": round(time.time() - t0, 1), "files": len(got)}
    note = f"gdown rc={r.returncode} files={len(got)}"
    # 予備の道: 埋め込み用の一覧（認証なし）→ drive.usercontent から1本ずつ
    html = urllib.request.urlopen(
        f"https://drive.google.com/embeddedfolderview?id={folder}", timeout=60).read().decode("utf-8", "replace")
    ids = list(dict.fromkeys(re.findall(r"/file/d/([A-Za-z0-9_-]{20,})", html)))
    for fid in ids:
        out = dest / f"{fid}.bin"
        if out.exists():
            continue
        req = urllib.request.Request(
            f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t",
            headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=600) as resp:
            cd = resp.headers.get("Content-Disposition") or ""
            m = re.search(r"filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)", cd)
            name = urllib.parse.unquote(m.group(1) or m.group(2)) if m else out.name
            target = dest / Path(name).name
            with open(target, "wb") as f:
                while True:
                    b = resp.read(8 << 20)
                    if not b:
                        break
                    f.write(b)
    got = [p for p in dest.rglob("*") if p.is_file()]
    return {"via": "embeddedfolderview", "note": note, "ids": len(ids),
            "sec": round(time.time() - t0, 1), "files": len(got)}


def probe(p: Path) -> dict | None:
    r = _run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(p)], 300)
    if r.returncode != 0:
        return None
    ff = json.loads(r.stdout)
    (ff.get("format") or {}).pop("filename", None)
    return ff


def has_zscale() -> bool:
    r = _run(["ffmpeg", "-hide_banner", "-filters"], 60)
    return " zscale " in r.stdout and " tonemap " in r.stdout


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(8 << 20), b""):
            h.update(b)
    return h.hexdigest()


def to_proxy(src: Path, out: Path, summ: dict, zs: bool) -> dict:
    """書き出しに渡す形へ。回転は ffmpeg の既定（autorotate）で焼く。長い辺 1920・30fps 以下。"""
    v = summ.get("video") or {}
    trc = (v.get("color") or {}).get("color_transfer")
    hdr = trc in HDR_TRC
    fps = v.get("avg_fps") or v.get("fps") or 30
    # 先に間引いて縮めてから色を寄せる（4K60 のまま浮動小数で tonemap すると1本数分かかる）
    chain = []
    if fps and fps > 31:
        chain.append("fps=30")
    chain.append("scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'")
    if hdr and zs:
        chain.append(TONEMAP)
    chain.append("format=yuv420p")
    args = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", ",".join(chain), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart",
            "-map_metadata", "-1", str(out)]
    t0 = time.time()
    r = _run(args, 3000)
    return {"ok": r.returncode == 0 and out.is_file(), "hdr": hdr, "tonemapped": hdr and zs,
            "sec": round(time.time() - t0, 1),
            "error": None if r.returncode == 0 else (r.stderr or "")[-400:].replace(str(src), "<src>")}


def to_jpeg(src: Path, out: Path) -> bool:
    if src.suffix.lower() in (".heic", ".heif"):
        for tool in (["heif-convert", "-q", "92", str(src), str(out)], ["heif-dec", str(src), "-o", str(out)]):
            try:
                if _run(tool, 300).returncode == 0 and out.is_file():
                    return True
            except FileNotFoundError:
                continue
    r = _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-frames:v", "1", "-q:v", "2", str(out)], 300)
    return r.returncode == 0 and out.is_file()


def sheet(proxy: Path, out_pat: Path) -> int:
    """2秒おき・時刻入りのコマ一覧（1枚 6×5＝60秒ぶん）。"""
    vf = ("fps=0.5,scale=240:-2,drawtext=text='%{pts\\:hms}':x=4:y=4:fontsize=18:"
          "fontcolor=white:box=1:boxcolor=black@0.6,tile=6x5")
    _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(proxy), "-vf", vf, str(out_pat)], 1200)
    return len(list(out_pat.parent.glob(out_pat.name.replace("%02d", "*"))))


def do_drive(req: dict, tmp: Path, out: Path) -> dict:
    """落として揃え、置いて署名する。out/sheets/ にコマ一覧を書き、結果の dict を返す。"""
    import gcs
    import store

    T: dict[str, float] = {}
    t0 = time.time()
    raw = tmp / "raw"
    fetched = fetch_folder(req["folder"], raw)
    T["fetched"] = time.time() - t0
    print(f"  落とした: {fetched['files']}本（{fetched['via']}・{fetched['sec']}秒）")
    zs = has_zscale()
    client, _ = gcs.client_and_creds()
    b = client.bucket(gcs.BUCKET)
    prefix = f"{store.PREFIX}{req['name']}/{secrets.token_hex(8)}/"
    (out / "sheets").mkdir(parents=True, exist_ok=True)
    prox = tmp / "proxy"
    prox.mkdir(parents=True, exist_ok=True)
    files = []
    srcs = sorted([p for p in raw.rglob("*") if p.is_file()], key=lambda p: str(p.relative_to(raw)))
    for i, p in enumerate(srcs, 1):
        tag = f"{i:02d}"
        rec: dict = {"idx": tag, "name": str(p.relative_to(raw)), "bytes": p.stat().st_size,
                     "sha256": sha256(p)}
        ext = p.suffix.lower()
        ff = probe(p)
        summ = store.summarize(ff) if ff else {}
        rec["summary"] = summ
        is_video = bool(summ.get("video")) and (summ.get("duration") or 0) > 0.5 and ext not in IMAGE_EXT
        if is_video:
            rec["kind"] = "video"
            dst = prox / f"{tag}.mp4"
            rec["proxy"] = to_proxy(p, dst, summ, zs)
            if rec["proxy"]["ok"]:
                pf = probe(dst)
                rec["proxy"]["summary"] = store.summarize(pf) if pf else {}
                rec["proxy"]["sha256"] = sha256(dst)
                rec["proxy"]["bytes"] = dst.stat().st_size
                rec["sheets"] = sheet(dst, out / "sheets" / f"{tag}_%02d.jpg")
                blob = b.blob(prefix + f"{tag}.mp4")
                blob.upload_from_filename(str(dst), content_type="video/mp4")
                rec["proxy"]["url"] = blob.generate_signed_url(version="v4", method="GET",
                                                               expiration=SIGN_TTL)
        elif ext in IMAGE_EXT or summ.get("video"):
            rec["kind"] = "image"
            dst = prox / f"{tag}.jpg"
            ok = to_jpeg(p, dst)
            rec["image"] = {"ok": ok}
            if ok:
                pf = probe(dst)
                rec["image"]["summary"] = store.summarize(pf) if pf else {}
                rec["image"]["sha256"] = sha256(dst)
                # 小さい見本を一覧にも入れる
                _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(dst), "-vf", "scale=480:-2",
                      str(out / "sheets" / f"{tag}_img.jpg")], 120)
                blob = b.blob(prefix + f"{tag}.jpg")
                blob.upload_from_filename(str(dst), content_type="image/jpeg")
                rec["image"]["url"] = blob.generate_signed_url(version="v4", method="GET",
                                                               expiration=SIGN_TTL)
        else:
            rec["kind"] = "other"
        v = (summ.get("video") or {})
        print(f"  {tag}: {rec['kind']}  {rec['bytes'] / 1e6:.1f}MB  {v.get('width')}x{v.get('height')}"
              f"  回転 {v.get('rotation')}  {v.get('avg_fps')}fps  {(v.get('color') or {}).get('color_transfer')}"
              f"  {summ.get('duration')}秒"
              + (f"  → 揃えた {'○' if rec.get('proxy', {}).get('ok') else '✕'}"
                 f"（{rec.get('proxy', {}).get('sec')}秒・HDR {'寄せた' if rec.get('proxy', {}).get('tonemapped') else 'なし'}）"
                 if is_video else ""))
        files.append(rec)
    T["done"] = time.time() - t0
    bad = [f["idx"] for f in files if f["kind"] == "video" and not f["proxy"]["ok"]]
    return {"format": "shorts-upload/1", "action": "drive", "name": req["name"],
            "bucket": b.name, "prefix": prefix, "fetched": fetched, "zscale": zs,
            "expires": (dt.datetime.now(dt.timezone.utc) + SIGN_TTL).isoformat(),
            "files": files, "ok": bool(files) and not bad,
            "problems": ([f"{x} を揃えられない" for x in bad] + ([] if files else ["1本も落ちてこない"])),
            "timing": {k: round(v, 1) for k, v in T.items()}}
