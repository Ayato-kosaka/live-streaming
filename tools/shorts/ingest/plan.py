"""依頼ファイルを読んで、何を何本回すか（matrix）を決める。

    python3 tools/shorts/ingest/plan.py            # Actions の中で。GITHUB_OUTPUT に書く
    python3 tools/shorts/ingest/plan.py --check shorts/requests/x.json   # 手元で形だけ見る

## どの依頼を拾うか

push のときは、**その push で足された・書き換えられた** `shorts/requests/*.json` だけ。
置いてある依頼を全部拾うと、1件足すたびに過去の依頼が全部走り直す。
workflow_dispatch のときは入力から依頼を1件こしらえる（形は同じ）。

## ここで落とすもの

- 動画IDの形が違う・mode が知らない語・区間が読めない
- clips の区間が多すぎる・長すぎる（暗号文は作業枝に積もるので、量に上限を置く）
- 公開鍵が RSA 2048bit 以上の `PUBLIC KEY` として読めない
  （**鍵が読めないまま落としに行くと、1時間計算したあとで暗号化できずに捨てる**）
- 毎晩の取り込みの時間帯（common.in_no_go）
- 結果を置く枝が `claude/` で始まらない（**master に平文も暗号文も入れない**）

ログに出すのは「何本・どの動画・どの mode」だけ。鍵の中身は出さない
（公開鍵なので漏れても困らないが、出す理由もない）。
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import VIDEO_ID, in_no_go, secs  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
REQ_DIR = "shorts/requests/"
MODES = ("archive", "reference", "zoom", "channel", "clips")
TABS = ("shorts", "videos", "streams")
# @ハンドルか UC で始まるチャンネルID。置き場の道にそのまま使うので ASCII に絞る
CHANNEL = re.compile(r"^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$")
BRANCH_OK = re.compile(r"^claude/[A-Za-z0-9._/-]+$")
# 走らせてよい whisper の名前。**知らない名前を HF へそのまま投げない**
# （typo で別人の重いモデルを数GB落としに行くのを防ぐ）
MODELS = ("tiny", "base", "small", "medium", "large-v3", "large-v3-turbo", "turbo",
          "distil-large-v3", "distil-large-v3.5")
MAX_ITEMS = 40
ZOOM_MAX_SEC = 900
ZOOM_MAX_FRAMES = 1200
# clips は「編集に使う実物」を切り出す。1区間はショート1本の素材として長くて数分、
# 合計は暗号文が作業枝に積もる量で決めた（720x1280・CRF 18 で 1秒 0.5MB 前後。
# 1800秒なら 1GB 近くになり、1回の push と手元の復号がそのあたりで重くなる）
CLIPS_MAX_SEC = 600
CLIPS_MAX_TOTAL = 1800
CLIPS_MAX_COUNT = 60


class Bad(Exception):
    pass


def norm_pem(s: str) -> tuple[str, str]:
    """公開鍵を PEM に整え直して、(PEM, DER の sha256) を返す。

    workflow_dispatch の入力欄は1行なので、貼ると改行が空白に化ける。
    **見出しと本体を切り出して、64字ごとに折り直す**ところまでここでやる。
    """
    s = (s or "").strip()
    if not s:
        raise Bad("pubkey が空")
    m = re.search(r"-----BEGIN ([A-Z ]+)-----(.*?)-----END \1-----", s, re.S)
    kind, body = (m.group(1), m.group(2)) if m else ("PUBLIC KEY", s)
    if kind != "PUBLIC KEY":
        raise Bad(f"pubkey は `openssl pkey -pubout` の形（PUBLIC KEY）で渡す（来たのは {kind}）")
    body = re.sub(r"\s+", "", body)
    try:
        der = base64.b64decode(body, validate=True)
    except (binascii.Error, ValueError):
        raise Bad("pubkey の本体が base64 として読めない") from None
    pem = "-----BEGIN PUBLIC KEY-----\n" + "\n".join(
        body[i:i + 64] for i in range(0, len(body), 64)) + "\n-----END PUBLIC KEY-----\n"
    p = subprocess.run(["openssl", "pkey", "-pubin", "-noout", "-text"],
                       input=pem, capture_output=True, text=True)
    bits = re.search(r"Public-Key: \((\d+) bit\)", p.stdout or "")
    if p.returncode != 0 or not bits:
        raise Bad("pubkey を openssl が読めない")
    if "Modulus" not in p.stdout or int(bits.group(1)) < 2048:
        raise Bad("pubkey は RSA 2048bit 以上にする")
    return pem, hashlib.sha256(der).hexdigest()


def parse_range(r: str) -> tuple[float, float]:
    try:
        a, b = str(r).split("-")
        s, e = secs(a), secs(b)
    except ValueError:
        raise Bad(f"range が読めない: {r!r}（例 0:12:00-0:14:00）") from None
    if not (0 <= s < e):
        raise Bad(f"range の前後が逆か空: {r!r}")
    return s, e


def items_of(req: dict, origin: str) -> list[dict]:
    mode = req.get("mode")
    if mode not in MODES:
        raise Bad(f"{origin}: mode は {MODES} のどれか（来たのは {mode!r}）")
    if mode == "channel":
        return channel_items(req, origin)
    vids = req.get("videos") or ([req["video"]] if req.get("video") else [])
    if isinstance(vids, str):
        vids = [v for v in re.split(r"[,\s]+", vids) if v]
    if not vids:
        raise Bad(f"{origin}: videos が空")
    for v in vids:
        if not VIDEO_ID.match(str(v)):
            raise Bad(f"{origin}: 動画IDの形が違う: {v!r}")
    pem, fp = norm_pem(req.get("pubkey", ""))

    w = dict(req.get("whisper") or {})
    w.setdefault("model", "large-v3-turbo")
    w.setdefault("batch", 8)
    w.setdefault("beam", 5)
    # 配信はあやとの日本語なので ja に決め打つ。参考ショートは英語の話者も混ざる
    # （ja に決め打ったら英語の声を「見るのを見るのを…」と繰り返して返した。2026-10-15）
    w.setdefault("language", "ja" if mode == "archive" else "auto")
    if w["model"] not in MODELS:
        raise Bad(f"{origin}: whisper.model は {MODELS} のどれか")
    w["batch"] = max(1, min(int(w["batch"]), 16))
    w["beam"] = max(1, min(int(w["beam"]), 5))

    bench = req.get("bench")
    if bench:
        bs, be = parse_range(bench.get("range", "0:10:00-0:15:00"))
        if be - bs > 900:
            raise Bad(f"{origin}: bench.range は15分まで")
        models = [m for m in bench.get("models", []) if m in MODELS]
        bench = {"range": [bs, be], "models": models[:4]}

    # zoom は区間を1つ（range）でも、いくつも（ranges）でも受ける。1区間が1本の job
    # clips も同じ読みかた。`range` に1行で「a-b,c-d,…」と並べてもよい
    # （workflow_dispatch の入力欄は1つなので）。空なら parse_range が断る
    ranges = [None]
    if mode in ("zoom", "clips"):
        rs = req.get("ranges") or req.get("range", "")
        if isinstance(rs, str):
            rs = [x for x in re.split(r"\s*[,/]\s*", rs) if x.strip()] or [""]
        ranges = [parse_range(r) for r in rs]
    out = []
    for v in vids:
        if mode == "clips":
            # **clips は動画1本で1つの job。** 区間ごとに job を分けると、同じ配信を
            # 区間の数だけ取り直すことになる（取るのは Cookie を握る1本の列なので遅い）。
            # 1回取って、そこから全部の区間を切る
            out.append({"video": v, "mode": "clips", "req": origin, "pubkey": pem,
                        "pubkey_sha256": fp, "whisper": w, "bench": None,
                        "ranges": clips_ranges(ranges, origin),
                        "dir": "clips", "key": f"{v}__clips", "dest": f"{v}/clips"})
            continue
        for rg in ranges:
            it = {"video": v, "mode": mode, "req": origin, "pubkey": pem, "pubkey_sha256": fp,
                  "whisper": w, "bench": bench if mode == "archive" else None}
            if mode == "zoom":
                s, e = rg
                fps = float(req.get("fps", 1))
                if not (0 < fps <= 5):
                    raise Bad(f"{origin}: fps は 0〜5")
                if e - s > ZOOM_MAX_SEC or (e - s) * fps > ZOOM_MAX_FRAMES:
                    raise Bad(f"{origin}: zoom は {ZOOM_MAX_SEC}秒・{ZOOM_MAX_FRAMES}コマまで")
                it.update(range=[s, e], fps=fps, dir=f"zoom-{int(s)}-{int(e)}-{fps:g}fps",
                          **zoom_look(req, origin))
            else:
                it["dir"] = mode
            sub = it["dir"]
            it["key"] = f"{v}__{sub}"
            it["dest"] = f"{v}/{sub}"
            out.append(it)
    return out


def clips_ranges(ranges: list, origin: str) -> list[list[float]]:
    """clips の区間を確かめて、頼まれた順のまま返す。

    **並べ替えない・まとめない。** 出来た mp4 の番号（01, 02 …）は依頼に書いた順で、
    企画の絵コンテはその順で素材を指す。重なっていても、それぞれ1本として切る
    （同じ場面を別の長さで使いたいことがある）。
    """
    if not ranges:
        raise Bad(f"{origin}: clips は ranges（H:MM:SS-H:MM:SS を並べたもの）が要る")
    if len(ranges) > CLIPS_MAX_COUNT:
        raise Bad(f"{origin}: clips は {CLIPS_MAX_COUNT}区間まで（来たのは {len(ranges)}）")
    total = 0.0
    for s, e in ranges:
        if e - s > CLIPS_MAX_SEC:
            raise Bad(f"{origin}: clips の1区間は {CLIPS_MAX_SEC}秒まで（{s:g}-{e:g}）")
        total += e - s
    if total > CLIPS_MAX_TOTAL:
        raise Bad(f"{origin}: clips の合計は {CLIPS_MAX_TOTAL}秒まで（来たのは {total:g}秒）。"
                  "依頼を分ける")
    return [[s, e] for s, e in ranges]


def zoom_look(req: dict, origin: str) -> dict:
    """zoom のシートの格子とコマの大きさ。看板やメニューの字を読みたいときに大きくする。

    `grid` は縦長のときの「横×縦」（横長なら入れ替える）。`tile` はコマの長辺の画素。
    既定は 4×3・長辺480（ショートの字幕が読める大きさ）。
    """
    out = {}
    if req.get("grid"):
        m = re.match(r"^(\d)x(\d)$", str(req["grid"]))
        if not m or not (1 <= int(m.group(1)) <= 6 and 1 <= int(m.group(2)) <= 6):
            raise Bad(f"{origin}: grid は 2x2 のような形（1〜6）")
        out["grid"] = [int(m.group(1)), int(m.group(2))]
    if req.get("tile"):
        t = int(req["tile"])
        if not 240 <= t <= 1280:
            raise Bad(f"{origin}: tile（コマの長辺）は 240〜1280")
        out["tile"] = t
    return out


def channel_items(req: dict, origin: str) -> list[dict]:
    """チャンネルのタブ（既定 shorts）の一覧。置き場は `channels/<@を外した名前>/<タブ>/`。"""
    chs = req.get("channels") or ([req["channel"]] if req.get("channel") else [])
    if isinstance(chs, str):
        chs = [c for c in re.split(r"[,\s]+", chs) if c]
    if not chs:
        raise Bad(f"{origin}: channels が空")
    tab = req.get("tab", "shorts")
    if tab not in TABS:
        raise Bad(f"{origin}: tab は {TABS} のどれか")
    limit = max(1, min(int(req.get("limit", 200)), 1000))
    # 1本ずつ引き直すのは重い（1本数秒）。既定は再生数の上位50本まで
    details = max(0, min(int(req.get("details", 50)), limit, 200))
    pem, fp = norm_pem(req.get("pubkey", ""))
    out = []
    for c in chs:
        if not CHANNEL.match(str(c)):
            raise Bad(f"{origin}: チャンネルの形が違う（@ハンドル か UC…）: {c!r}")
        slug = c.lstrip("@")
        out.append({"mode": "channel", "channel": c, "tab": tab, "limit": limit,
                    "details": details, "req": origin, "pubkey": pem, "pubkey_sha256": fp,
                    "dir": f"channels/{slug}/{tab}", "dest": f"channels/{slug}/{tab}",
                    "key": f"channels__{slug}__{tab}"})
    return out


def compare_files(base: str, head: str) -> list[str]:
    """既定の枝と比べて、足された・書き換えられたファイル（GitHub の compare）。"""
    import urllib.request

    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/compare/{base}...{head}"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    tok = os.environ.get("GH_TOKEN")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    return [f["filename"] for f in d.get("files") or []
            if f.get("status") in ("added", "modified", "renamed", "copied")]


def changed_requests() -> list[str]:
    """この push で足された・書き換えられた依頼ファイル。"""
    # **push の `commits[]` から added / modified を読まない。** Actions に届く
    # push のペイロードでは、そこから依頼が1件も拾えなかった（2026-10-15 に2回実測。
    # 枝を作った push では commits そのものが空、ふつうの push でも 0件）。
    # だから毎回 compare（push の前 → 後）で引く。枝を作った push は「前」が
    # 0000… なので、既定の枝と比べる
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
        print(f"枝を作った push。{before} と比べる")
    files = compare_files(before, head)
    seen: list[str] = []
    for f in files:
        if f.startswith(REQ_DIR) and f.endswith(".json") and f not in seen:
            seen.append(f)
    return [f for f in seen if (ROOT / f).is_file()]


def dispatch_request() -> dict:
    g = os.environ.get
    req = {"mode": g("IN_MODE", ""), "videos": g("IN_VIDEOS", ""), "pubkey": g("IN_PUBKEY", "")}
    if req["mode"] == "channel":
        # 入力欄は1つで足りる。channel のときは `videos` にチャンネルを並べる
        req["channels"] = req.pop("videos")
    if g("IN_RANGE"):
        req["range"] = g("IN_RANGE")
    if g("IN_FPS"):
        req["fps"] = g("IN_FPS")
    return req


def out_branch() -> str:
    b = (os.environ.get("IN_BRANCH") or "").strip() or os.environ.get("GITHUB_REF_NAME", "")
    if not BRANCH_OK.match(b):
        raise Bad(f"結果を置く枝は claude/ で始まる名前にする（来たのは {b!r}）。"
                  "master に暗号文を積まない")
    return b


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        for f in sys.argv[2:]:
            its = items_of(json.loads(Path(f).read_text(encoding="utf-8")), f)
            for it in its:
                print(f"ok  {it['key']}  鍵 {it['pubkey_sha256'][:16]}…")
        return 0

    if in_no_go():
        print("!! いまは毎晩の取り込みの時間帯（21:15〜23:59 UTC）。Cookie を握らないので走らせない。"
              "00:00 UTC を過ぎてから依頼を push し直す")
        return 1

    ev_name = os.environ.get("GITHUB_EVENT_NAME", "")
    items: list[dict] = []
    if ev_name == "workflow_dispatch":
        items += items_of(dispatch_request(), "workflow_dispatch")
    else:
        files = changed_requests()
        print(f"この push で来た依頼: {len(files)}件")
        for f in files:
            items += items_of(json.loads((ROOT / f).read_text(encoding="utf-8")), f)

    # 同じ置き場が2回来たら、あとのほうを使う
    uniq = {}
    for it in items:
        uniq[it["key"]] = it
    items = list(uniq.values())
    if len(items) > MAX_ITEMS:
        raise Bad(f"1回に {MAX_ITEMS}本まで（来たのは {len(items)}本）。依頼を分ける")
    branch = out_branch()

    for it in items:
        print(f"  {it['key']}  ← {it['req']}")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"matrix={json.dumps({'include': items}, ensure_ascii=False)}\n")
            # 取る job には鍵を渡さない（使わないうえ、env の見出しに37本ぶん並ぶ）
            light = [{k: v for k, v in it.items() if k != "pubkey"} for it in items]
            f.write(f"fetch={json.dumps({'include': light}, ensure_ascii=False)}\n")
            f.write(f"count={len(items)}\n")
            f.write(f"branch={branch}\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! 依頼を受けられない: {e}")
        sys.exit(1)
