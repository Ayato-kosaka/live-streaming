"""あやとが自分で撮った素材（Google フォトの共有アルバム）を、ショートの書き出しで使える形にする（#1441・帳面 F-094）。

    F=tools/shorts/footage/footage.py
    python3 $F scan  --album <URL を1行書いたファイル>      # アルバムに何本あり、台帳に無いのが何本か
    python3 $F pull  --album <同じ>                          # 無いものだけ落とし、音を外した作業用と一覧の絵を作り、台帳に足す
    python3 $F link  [--ref origin/master]                   # 撮った時刻を、どの配信のどの時間帯かに結び直す
    python3 $F desc  <ID> '<何が写っているか1行>'            # 1行の説明を書く（絵を見て、こちらが書く）
    python3 $F table <配信の id>                             # その配信の時間帯に撮った素材の表（制作の担当が読むのはこれ）
    python3 $F stash --key <秘密鍵.pem> --out <リポジトリの外> # 作業用と一覧の絵を、私有の置き場（GCS の footage/）へ上げる
    python3 $F look  <配信の id> --key … --out …             # その回の1枚の一覧の絵を、私有の置き場から落とす

あやと（2026-11-25）「今回から動画素材を自分で撮影して、ショートの画質向上作戦とします」
「※ルール 動画の音声はミュートにすること」。

## 守ること（見張りは `footage_selftest.py`）

- **作業用の動画には音の流れを入れない**（無音の流れも付けない）。作ったあと ffprobe で数え、1本でもあれば
  消して止まる（`strip_audio` と `audio_streams`）。書き出しの側でも、撮影の素材のカットに `audio_db` を書いた指示書と、
  音の流れのある撮影の素材を断る（`render.py` の `footage_guard`）
- **元の動画・作業用・一覧の絵（顔が写る）は、私有の置き場にしか置かない。** 手元はリポジトリの外
  （既定 `~/.cache/shorts/footage`。`SHORTS_FOOTAGE_DIR`）、残すのは GCS の非公開バケットの `footage/`（寿命の決まりの
  掛からない道。`tools/shorts/preview/gcs.py`）。リポジトリの中を置き場に指すと断る（`private_dir`）
- **台帳（`shorts/footage/index.json`。公開）に書くのは、時刻・長さ・縦横・1行の説明・ID・中身の sha256 と、
  どの配信の何分目か だけ。** 位置・Google の写真の ID・アルバムの URL・元のファイル名は書かない（`public_row` が
  決まった欄のほかを落とす）。**アルバムの URL はリポジトリにも issue にも書かない**（取り直しは手元のファイルから読む）
- 作業用は 30コマ/秒・縦 1080x1920（横なら 1920x1080）に収める。元がそのまま収まり 30コマ/秒で揃っていれば、
  **画は符号化し直さずに写す**（画を落とさない）。位置などの付け札（metadata）は全部外す

## ID と差分

ID は Google の写真の ID の sha256 の頭9桁に `f` を付けたもの（`f3a9c21b0`）。台帳に同じ ID があれば取らない
（取り直しで前に取った物は取らない）。Google の ID そのものは公開しない。
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
LEDGER = ROOT / "shorts" / "footage" / "index.json"
JST = dt.timezone(dt.timedelta(hours=9))
FPS = 30
# 縦の作業用の箱（横の素材は向きを変えて 1920x1080 に収める）
BOX = (1080, 1920)
# 台帳（公開）に書いてよい欄。ほかは public_row が落とす。位置・Google の ID・URL・元のファイル名はここに無い
PUBLIC_KEYS = ("id", "kind", "taken_utc", "taken_local", "tz", "taken_jst", "seconds", "w", "h", "desc",
               "sha256", "bytes", "ext", "sheet", "stream", "added")
STREAM_KEYS = ("video", "title", "at", "at_s", "start_jst", "seconds", "note")
# 私有の置き場（GCS の非公開バケットの道。寿命の決まりの掛からない道）
GCS_PREFIX = "footage/"


def default_dir() -> Path:
    return Path(os.environ.get("SHORTS_FOOTAGE_DIR") or "~/.cache/shorts/footage").expanduser()


def inside_git(p: Path) -> Path | None:
    p = p.resolve()
    for a in [p, *p.parents]:
        if (a / ".git").exists():
            return a
    return None


def private_dir(p: Path) -> Path:
    """元の動画・作業用・一覧の絵を置く手元の置き場。リポジトリの中なら断る（公開のリポジトリに入りうる）。"""
    p = p.expanduser().resolve()
    near = next(a for a in [p, *p.parents] if a.exists())
    g = inside_git(near)
    if g is not None:
        sys.exit(f"!! {p} はリポジトリ（{g}）の中。撮影の素材はリポジトリの外（{default_dir()}）にだけ置く")
    p.mkdir(parents=True, exist_ok=True)
    return p


def fid(gid: str) -> str:
    return "f" + hashlib.sha256(gid.encode()).hexdigest()[:9]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


# ---------------------------------------------------------------- 台帳（公開）

def public_row(row: dict) -> dict:
    """台帳に書く1行。決まった欄のほか（位置・Google の ID・URL・元のファイル名）は落とす。"""
    out = {k: row[k] for k in PUBLIC_KEYS if k in row}
    if isinstance(out.get("stream"), dict):
        out["stream"] = {k: out["stream"][k] for k in STREAM_KEYS if k in out["stream"]}
    return out


def load_ledger(path: Path = LEDGER) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        d = {}
    d.setdefault("version", 1)
    d.setdefault("items", [])
    d.setdefault("streams", {})
    return d


def save_ledger(d: dict, path: Path = LEDGER) -> None:
    items = sorted((public_row(r) for r in d["items"]), key=lambda r: (r.get("taken_utc", ""), r["id"]))
    streams = {k: {kk: v[kk] for kk in ("title", "start_jst", "seconds", "ids", "sheet") if kk in v}
               for k, v in sorted(d.get("streams", {}).items())}
    out = {"version": 1,
           "_note": "あやとが撮った素材の台帳（#1441）。公開してよい欄だけ。動画と絵は私有の置き場（tools/shorts/footage/README.md）",
           "items": items, "streams": streams}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def by_id(d: dict) -> dict[str, dict]:
    return {r["id"]: r for r in d["items"]}


# ---------------------------------------------------------------- アルバムを読む

def read_album_url(f: Path) -> str:
    u = f.expanduser().read_text(encoding="utf-8").strip().split()[0]
    if not re.match(r"^https://(photos\.app\.goo\.gl|photos\.google\.com)/", u):
        sys.exit("!! アルバムの URL の形が違う（photos.app.goo.gl か photos.google.com の共有リンク）")
    return u


def fetch(url: str, dest: Path | None = None) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "ja"})
    with urllib.request.urlopen(req, timeout=120) as r:
        if dest is None:
            return r.read()
        with open(dest, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
    return None


def parse_album(html: str) -> list[dict]:
    """共有アルバムのページに埋まった一覧（AF_initDataCallback の ds:1）を読む。続きがあれば止まる（黙って欠けない）。"""
    m = re.search(r"AF_initDataCallback\(\{key: 'ds:1'.*?data:(.*?), sideChannel", html, re.S)
    if not m:
        sys.exit("!! アルバムの一覧が読めない（ページの形が変わった・ログインを求められた）")
    d = json.loads(m.group(1))
    if len(d) > 2 and d[2]:
        sys.exit(f"!! アルバムに続きのページがある（{len(d[1])}本で切れている）。続きの読み方を足してから回す")
    out = []
    for it in d[1]:
        ext = it[-1] if isinstance(it[-1], dict) else {}
        vid = ext.get("76647426")
        out.append({"gid": it[0], "base": it[1][0], "w": it[1][1], "h": it[1][2], "ts_ms": it[2],
                    "tz_ms": it[4] if len(it) > 4 and isinstance(it[4], int) else 0,
                    "kind": "video" if vid is not None else "photo"})
    return out


def album(url_file: Path) -> list[dict]:
    html = fetch(read_album_url(url_file)).decode("utf-8", "replace")
    return parse_album(html)


# ---------------------------------------------------------------- 作業用を作る（音を外す）

def ffprobe(p: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(p)],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def audio_streams(p: Path) -> int:
    return sum(1 for s in ffprobe(p).get("streams", []) if s.get("codec_type") == "audio")


def fit_box(w: int, h: int) -> tuple[int, int]:
    bw, bh = BOX if h >= w else BOX[::-1]
    s = min(1.0, bw / w, bh / h)
    return (int(round(w * s / 2)) * 2, int(round(h * s / 2)) * 2)


def video_plan(info: dict) -> dict:
    """写すだけで済むか（30コマ/秒で揃い・箱に収まり・回転の札が無く・h264 の 8bit）、符号化し直すか。"""
    v = next(s for s in info["streams"] if s.get("codec_type") == "video")
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    rot = rot or int((v.get("tags") or {}).get("rotate", 0) or 0)
    if rot % 180:
        w, h = h, w
    num, den = (v.get("r_frame_rate") or "0/1").split("/")
    anum, aden = (v.get("avg_frame_rate") or "0/1").split("/")
    fps = int(num) / max(1, int(den))
    afps = int(anum) / max(1, int(aden))
    fw, fh = fit_box(w, h)
    copy = (v.get("codec_name") == "h264" and v.get("pix_fmt") == "yuv420p" and abs(fps - FPS) < 1e-6
            and abs(afps - FPS) < 1e-3 and (fw, fh) == (w, h) and rot % 360 == 0)
    return {"copy": copy, "w": fw, "h": fh, "src_w": w, "src_h": h, "fps": fps, "avg_fps": afps,
            "codec": v.get("codec_name"), "pix_fmt": v.get("pix_fmt"), "rotate": rot}


# 作業用に写すのは画の流れ1本だけ。音・字幕・データの流れと付け札（位置・機種）・章は外す
STRIP = ["-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1"]


def strip_audio(src: Path, dst: Path) -> dict:
    """音の流れを外した作業用を作る（無音の流れも付けない・付け札は全部外す）。作ったあと音の流れを数えて確かめる。"""
    info = ffprobe(src)
    plan = video_plan(info)
    tmp = dst.with_suffix(".part.mp4")
    common = [*STRIP, "-movflags", "+faststart"]
    if plan["copy"]:
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), *common, "-c:v", "copy", str(tmp)]
    else:
        vf = f"fps={FPS},scale={plan['w']}:{plan['h']}:flags=lanczos,format=yuv420p"
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), *common, "-vf", vf, "-c:v", "libx264",
               "-preset", "slow", "-crf", "14", "-profile:v", "high", "-color_primaries", "bt709",
               "-color_trc", "bt709", "-colorspace", "bt709", str(tmp)]
    subprocess.run(cmd, check=True)
    n = audio_streams(tmp)
    if n:
        tmp.unlink(missing_ok=True)
        sys.exit(f"!! 作業用に音の流れが {n}本残った（{src.name}）。作業用は作らない")
    tmp.replace(dst)
    return plan


def seconds_of(p: Path) -> float:
    return float(ffprobe(p)["format"]["duration"])


def strip_sheet(mp4: Path, out: Path, secs: float) -> None:
    """1秒ごとのコマを横に並べた1枚（私有。顔が写る）。"""
    n = max(1, int(secs) + (1 if secs - int(secs) > 0.3 else 0))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vf",
                    f"fps=1,scale=180:-2,tile={n}x1:padding=4:color=white", "-frames:v", "1",
                    "-q:v", "4", str(out)], check=True)


def photo_work(src: Path, dst: Path) -> tuple[int, int]:
    from PIL import Image, ImageOps

    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = fit_box(*im.size)
    if (w, h) != im.size:
        im = im.resize((w, h), Image.LANCZOS)
    im.save(dst, "JPEG", quality=92)  # EXIF（位置）は書かない
    return w, h


# ---------------------------------------------------------------- 配信に結ぶ

def git_text(ref: str | None, rel: str) -> str | None:
    if ref is None:
        p = ROOT / rel
        return p.read_text(encoding="utf-8") if p.is_file() else None
    r = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{rel}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


TS = re.compile(r"^\[(\d+):(\d\d):(\d\d)\]", re.M)


def stream_windows(ref: str | None) -> dict[str, dict]:
    """streams/manifest.tsv の開始と、文字起こし・チャットのいちばん遅い時刻（無ければ議事録の「長さ」）から配信の窓。"""
    tsv = git_text(ref, "streams/manifest.tsv") or ""
    out = {}
    for ln in tsv.splitlines()[1:]:
        f = ln.split("\t")
        if len(f) < 3 or not re.match(r"^\d{4}-\d\d-\d\d \d\d:\d\d$", f[1]):
            continue
        vid, start, stem = f[0], f[1], f[2]
        secs = 0
        for ext in (".transcript.txt", ".chat.txt"):
            t = git_text(ref, f"streams/{stem}{ext}") or ""
            for h, m, s in TS.findall(t):
                secs = max(secs, int(h) * 3600 + int(m) * 60 + int(s))
        title = ""
        md = git_text(ref, f"streams/{stem}.md") or ""
        mm = re.search(r"長さ (\d+):(\d\d):(\d\d)", md)
        if mm:
            secs = max(secs, int(mm.group(1)) * 3600 + int(mm.group(2)) * 60 + int(mm.group(3)))
        mt = re.match(r"^# \S+ \S+ (.+)$", md.splitlines()[0]) if md else None
        if mt:
            title = mt.group(1)
        else:
            for ext in (".transcript.txt", ".chat.txt"):
                tr = git_text(ref, f"streams/{stem}{ext}") or ""
                if tr.startswith("# "):
                    title = tr.splitlines()[0][2:]
                    break
        st = dt.datetime.strptime(start, "%Y-%m-%d %H:%M").replace(tzinfo=JST)
        out[vid] = {"video": vid, "title": title, "start": st, "seconds": secs}
    return out


def hms(s: float) -> str:
    s = int(round(s))
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def link_one(t: dt.datetime, wins: dict[str, dict], slack_s: int = 60) -> dict:
    """撮った時刻が入る配信の窓（開始の分の丸めぶん、前後に slack_s の幅）。無ければ近い配信を注に書く。"""
    for w in wins.values():
        a = (t - w["start"]).total_seconds()
        if w["seconds"] and -slack_s <= a <= w["seconds"] + slack_s:
            return {"video": w["video"], "title": w["title"], "at": hms(max(0, a)), "at_s": int(max(0, a)),
                    "start_jst": w["start"].strftime("%Y-%m-%d %H:%M")}
    before = [w for w in wins.values() if w["start"] <= t]
    after = [w for w in wins.values() if w["start"] > t]
    note = "配信の外"
    if before:
        b = max(before, key=lambda w: w["start"])
        note += f"（{b['video']} の終わりから {hms((t - b['start']).total_seconds() - b['seconds'])} 後"
        if after:
            a = min(after, key=lambda w: w["start"])
            note += f"・{a['video']} の始まりの {hms((a['start'] - t).total_seconds())} 前"
        note += "）"
    return {"video": None, "note": note}


def relink(d: dict, ref: str | None) -> dict[str, dict]:
    wins = stream_windows(ref)
    streams: dict[str, dict] = {}
    for r in d["items"]:
        t = dt.datetime.fromisoformat(r["taken_utc"])
        r["stream"] = link_one(t, wins)
        v = r["stream"].get("video")
        if v:
            w = wins[v]
            s = streams.setdefault(v, {"title": w["title"], "start_jst": w["start"].strftime("%Y-%m-%d %H:%M"),
                                       "seconds": w["seconds"], "ids": []})
            s["ids"].append(r["id"])
    old = d.get("streams", {})
    for v, s in streams.items():
        if old.get(v, {}).get("ids") == s["ids"] and old[v].get("sheet"):
            s["sheet"] = old[v]["sheet"]
    d["streams"] = streams
    return wins


# ---------------------------------------------------------------- 一覧の絵（回ごとに1枚）

def font(size: int):
    from PIL import ImageFont
    for p in (ROOT / "tools/shorts/render/fonts/MPLUSRounded1c-ExtraBold.ttf",
              Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")):
        if p.is_file():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def stream_sheet(d: dict, vid: str, store: Path, out: Path) -> Path:
    """その回に撮った素材を、1本1行（ID・日本時間・配信の何分目・長さ ＋ 1秒ごとのコマ）で積んだ1枚。"""
    from PIL import Image, ImageDraw

    rows = [r for r in d["items"] if (r.get("stream") or {}).get("video") == vid]
    strips = [Image.open(store / f"{r['id']}.sheet.jpg").convert("RGB") for r in rows]
    label_w, pad = 300, 8
    W = label_w + max(s.width for s in strips) + pad
    H = sum(s.height + pad for s in strips) + pad
    im = Image.new("RGB", (W, H), "white")
    dr = ImageDraw.Draw(im)
    f1, f2 = font(30), font(24)
    y = pad
    for r, s in zip(rows, strips):
        im.paste(s, (label_w, y))
        dr.text((pad, y + 8), r["id"], fill="black", font=f1)
        dr.text((pad, y + 52), r["taken_jst"][11:16] + " JST", fill="black", font=f2)
        dr.text((pad, y + 84), f"配信 {r['stream']['at']}", fill="black", font=f2)
        dr.text((pad, y + 116), f"{r['seconds']:.1f}秒", fill="black", font=f2)
        y += s.height + pad
    im.save(out, "JPEG", quality=85)
    return out


# ---------------------------------------------------------------- コマンド

def cmd_scan(a) -> int:
    d = load_ledger()
    have = set(by_id(d))
    items = album(Path(a.album))
    new = [it for it in items if fid(it["gid"]) not in have]
    kinds = {k: sum(1 for it in items if it["kind"] == k) for k in ("video", "photo")}
    print(f"アルバム {len(items)}本（動画 {kinds['video']}・写真 {kinds['photo']}）・台帳に無いもの {len(new)}本")
    return 0


def cmd_pull(a) -> int:
    store = private_dir(Path(a.dir))
    d = load_ledger()
    have = set(by_id(d))
    items = album(Path(a.album))
    new = [it for it in items if fid(it["gid"]) not in have]
    print(f"アルバム {len(items)}本・台帳に在る {len(items) - len(new)}本・取るもの {len(new)}本")
    today = dt.datetime.now(JST).strftime("%Y-%m-%d")
    for it in new:
        i = fid(it["gid"])
        t = dt.datetime.fromtimestamp(it["ts_ms"] / 1000, dt.timezone.utc)
        loc = t.astimezone(dt.timezone(dt.timedelta(milliseconds=it["tz_ms"])))
        row = {"id": i, "kind": it["kind"], "taken_utc": t.isoformat(timespec="seconds"),
               "taken_local": loc.strftime("%Y-%m-%d %H:%M:%S"), "tz": loc.strftime("%z"),
               "taken_jst": t.astimezone(JST).strftime("%Y-%m-%d %H:%M:%S"), "desc": "", "added": today}
        with tempfile.TemporaryDirectory(dir=store) as td:
            raw = Path(td) / "orig"
            fetch(it["base"] + ("=dv" if it["kind"] == "video" else "=d"), raw)
            if it["kind"] == "video":
                work = store / f"{i}.mp4"
                plan = strip_audio(raw, work)
                row.update(w=plan["w"], h=plan["h"], seconds=round(seconds_of(work), 3), ext=".mp4")
                strip_sheet(work, store / f"{i}.sheet.jpg", row["seconds"])
                how = "写した" if plan["copy"] else f"符号化し直した（{plan['codec']} {plan['fps']:.3f}fps → h264 30fps）"
            else:
                work = store / f"{i}.jpg"
                w, h = photo_work(raw, work)
                row.update(w=w, h=h, seconds=0, ext=".jpg")
                shutil.copy(work, store / f"{i}.sheet.jpg")
                how = "縮めた"
        row.update(sha256=sha256_file(work), bytes=work.stat().st_size,
                   sheet=sha256_file(store / f"{i}.sheet.jpg"))
        d["items"].append(row)
        print(f"  {i} {row['kind']} {row['taken_jst']} JST {row.get('seconds')}秒 {row['w']}x{row['h']}（{how}）")
    relink(d, a.ref)
    fresh = {fid(it["gid"]) for it in new}
    for s in d["streams"].values():
        if fresh & set(s["ids"]):
            s.pop("sheet", None)
    make_sheets(d, store)
    save_ledger(d)
    return 0


def make_sheets(d: dict, store: Path) -> None:
    for vid, s in d["streams"].items():
        if s.get("sheet") and (store / f"stream_{vid}.jpg").is_file():
            continue
        p = stream_sheet(d, vid, store, store / f"stream_{vid}.jpg")
        s["sheet"] = sha256_file(p)


def cmd_link(a) -> int:
    d = load_ledger()
    relink(d, a.ref)
    store = default_dir()
    if all((store / f"{r['id']}.sheet.jpg").is_file() for r in d["items"]):
        make_sheets(d, store)
    save_ledger(d)
    for r in d["items"]:
        s = r["stream"]
        print(f"  {r['id']} {r['taken_jst']} JST → " + (f"{s['video']} {s['at']}" if s.get("video") else s["note"]))
    return 0


def cmd_desc(a) -> int:
    d = load_ledger()
    rows = by_id(d)
    if a.id not in rows:
        sys.exit(f"!! 台帳に {a.id} が無い")
    text = " ".join(a.text.split())
    if len(text) > 60:
        sys.exit(f"!! 1行（60字まで）にする（{len(text)}字）")
    rows[a.id]["desc"] = text
    save_ledger(d)
    return 0


# 配信の外で撮った素材のうち、その回の表に「前後に撮ったもの」として並べる幅（同じ街・同じ日の画として使える）
NEAR_H = 12


def table(video: str, d: dict | None = None) -> str:
    """その配信の時間帯に撮った素材の表（Markdown）。制作の担当が読むのはこれと、その回の1枚の一覧の絵だけ。
    配信の前後 NEAR_H 時間に配信の外で撮ったものも、下に別の表で並べる（配信の何分目は無い）。"""
    d = d or load_ledger()
    rows = [r for r in d["items"] if (r.get("stream") or {}).get("video") == video]
    s = d["streams"].get(video, {})
    near = []
    if s.get("start_jst"):
        st = dt.datetime.strptime(s["start_jst"], "%Y-%m-%d %H:%M").replace(tzinfo=JST)
        en = st + dt.timedelta(seconds=s.get("seconds") or 0)
        for r in d["items"]:
            t = dt.datetime.fromisoformat(r["taken_utc"])
            if not (r.get("stream") or {}).get("video") and \
                    st - dt.timedelta(hours=NEAR_H) <= t <= en + dt.timedelta(hours=NEAR_H):
                near.append(r)
    if not rows and not near:
        return ""
    out = [f"撮影の素材（{len(rows)}本・音なし。指示書の素材に `{{\"footage\": \"<ID>\"}}` と書く。"
           f"一覧の絵: `python3 tools/shorts/footage/footage.py look {video} --key … --out …`）",
           ""]
    out += (["| ID | 日本時間 | 配信の | 長さ | 縦横 | 何が写っているか |", "| --- | --- | --- | --- | --- | --- |"]
            if rows else ["この配信の時間帯に撮った素材は無い"])
    for r in rows:
        out.append(f"| {r['id']} | {r['taken_jst'][5:16]} | {r['stream']['at']} | {r['seconds']:.1f}秒 | "
                   f"{r['w']}x{r['h']} | {r.get('desc') or '（未記入）'} |")
    if near:
        out += ["", f"配信の外で、前後{NEAR_H}時間に撮ったもの（一覧の絵には入っていない）", "",
                "| ID | 日本時間 | 長さ | 縦横 | 何が写っているか |", "| --- | --- | --- | --- | --- |"]
        out += [f"| {r['id']} | {r['taken_jst'][5:16]} | {r['seconds']:.1f}秒 | {r['w']}x{r['h']} | "
                f"{r.get('desc') or '（未記入）'} |" for r in near]
    if s.get("seconds"):
        out.append(f"\n配信 {s.get('start_jst')} JST 開始・{hms(s['seconds'])}")
    return "\n".join(out) + "\n"


def brief_section(video: str) -> str:
    """brief.py edit の1枚に差し込む節（その回に撮影の素材が無ければ空）。"""
    t = table(video)
    return f"## 撮影の素材（あやとが撮った・音なし）\n\n{t}" if t else ""


def cmd_table(a) -> int:
    t = table(a.video)
    print(t or f"{a.video} の時間帯に撮った素材は無い")
    return 0


# ---------------------------------------------------------------- 私有の置き場へ（GCS の footage/）

def _remote():
    sys.path.insert(0, str(ROOT / "tools/shorts/render"))
    import remote  # noqa: E402
    return remote


def objects_of(d: dict, store: Path) -> dict[str, Path]:
    objs: dict[str, Path] = {}
    for r in d["items"]:
        for name, h in ((f"{r['id']}{r['ext']}", r["sha256"]), (f"{r['id']}.sheet.jpg", r["sheet"])):
            p = store / name
            if p.is_file():
                objs[h] = p
    for vid, s in d["streams"].items():
        p = store / f"stream_{vid}.jpg"
        if s.get("sheet") and p.is_file():
            objs[s["sheet"]] = p
    for h, p in objs.items():
        if sha256_file(p) != h:
            sys.exit(f"!! {p.name} の中身が台帳の sha256 と違う")
    return objs


def footage_request(R, a, objs: dict[str, Path] | None, look: list[str] | None) -> tuple[dict, Path]:
    out = private_dir(Path(a.out))
    nonce = secrets.token_hex(12)
    name = f"footage-{a.name or dt.datetime.now(JST).strftime('%m%d%H%M%S')}"
    req = {"name": name, "nonce": nonce, "pubkey": R.pubkey_of(Path(a.key)), "footage": True, "items": [],
           "objects": [{"sha256": h, "bytes": p.stat().st_size, "store": "footage"} for h, p in sorted((objs or {}).items())],
           "look": sorted(set(look or []))}
    R.br.push_change(a.branch, {f"{R.REQ_DIR}{name}.json": (json.dumps(req, indent=1) + "\n").encode()}, [],
                     f"撮影の素材 {name} を私有の置き場へ{'上げる' if objs else '見る'}（#1441）\n\n"
                     "依頼に置くのは sha256 と大きさ・公開鍵・乱数だけ。中身は GCS の非公開の footage/ へ直に上げる。")
    rel = f"shorts/.work/render/{name}/inbox"
    sha, _ = R.br.wait_json(a.branch, f"{rel}/manifest.json", lambda j: j.get("nonce") == nonce, a.timeout)
    return json.loads((R.open_sealed(sha, rel, Path(a.key), out) / "footage.json").read_text(encoding="utf-8")), out


def cmd_stash(a) -> int:
    R = _remote()
    d = load_ledger()
    objs = objects_of(d, private_dir(Path(a.dir)))
    print(f"上げる候補 {len(objs)}個・{sum(p.stat().st_size for p in objs.values()) / 1e6:.0f}MB")
    got, _ = footage_request(R, a, objs, None)
    puts = got.get("puts", {})
    import concurrent.futures as cf
    with cf.ThreadPoolExecutor(4) as ex:
        res = dict(zip(puts, ex.map(lambda h: R.put_one(objs[h], puts[h]), puts)))
    bad = [h for h, (st, _) in res.items() if st != 200]
    print(f"私有の置き場に在った {len(objs) - len(puts)}個・上げた {len(puts) - len(bad)}/{len(puts)}個")
    return 1 if bad else 0


def cmd_look(a) -> int:
    R = _remote()
    d = load_ledger()
    s = d["streams"].get(a.video)
    if not s or not s.get("sheet"):
        print(f"{a.video} の時間帯に撮った素材は無い")
        return 0
    want = [s["sheet"]] + ([r["sha256"] for r in d["items"] if r["id"] in s["ids"]] if a.videos else [])
    got, out = footage_request(R, a, None, want)
    gets = got.get("gets", {})
    dest = out / "footage"
    dest.mkdir(parents=True, exist_ok=True)
    names = {s["sheet"]: f"stream_{a.video}.jpg", **{r["sha256"]: f"{r['id']}{r['ext']}" for r in d["items"]}}
    for h in want:
        if h not in gets:
            print(f"!! 私有の置き場に無い: {names[h]}")
            continue
        st, got_h, _ = R.get_one(gets[h], dest / names[h])
        print(f"  {'○' if st == 200 and got_h == h else '✕'} {dest / names[h]}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("scan")
    p.add_argument("--album", required=True)
    p = sub.add_parser("pull")
    p.add_argument("--album", required=True)
    p.add_argument("--dir", default=str(default_dir()))
    p.add_argument("--ref", default=None, help="streams/ を読む git の ref（作業枝が古いときは origin/master）")
    p = sub.add_parser("link")
    p.add_argument("--ref", default=None)
    p = sub.add_parser("desc")
    p.add_argument("id")
    p.add_argument("text")
    p = sub.add_parser("table")
    p.add_argument("video")
    for n in ("stash", "look"):
        p = sub.add_parser(n)
        if n == "look":
            p.add_argument("video")
            p.add_argument("--videos", action="store_true", help="一覧の絵だけでなく作業用の動画も落とす")
        p.add_argument("--key", required=True)
        p.add_argument("--out", required=True)
        p.add_argument("--dir", default=str(default_dir()))
        p.add_argument("--name", default=None)
        p.add_argument("--branch", default=None)
        p.add_argument("--timeout", type=float, default=1800)
    a = ap.parse_args()
    if getattr(a, "branch", "x") is None:
        a.branch = _remote().BRANCH
    return {"scan": cmd_scan, "pull": cmd_pull, "link": cmd_link, "desc": cmd_desc, "table": cmd_table,
            "stash": cmd_stash, "look": cmd_look}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
