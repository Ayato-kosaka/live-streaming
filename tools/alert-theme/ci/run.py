#!/usr/bin/env python3
"""投げ銭アラートの確かめを、Actions（`.github/workflows/alert_check.yml`）と手元で**同じ入口**から回す（#1117）。

    python3 tools/alert-theme/ci/run.py prep            # 書き出し・キャラ絵・地を <work> に用意する
    python3 tools/alert-theme/ci/run.py plan            # 回す組（shard）の名前を JSON の並びで出す
    python3 tools/alert-theme/ci/run.py shard <名前>     # 1組回して <work>/res/<名前>.json に残す
    python3 tools/alert-theme/ci/run.py digest          # <work>/res/ から <work>/digest.md（30行以内）。❌ があれば 1
    python3 tools/alert-theme/ci/run.py all             # 手元で全部を順に（道具を直すときだけ。2時間ほどかかる）

置き場は `ALERT_WORK`（既定 /tmp/alert-work）。テーマは `ALERT_THEME`（空なら `app/alertbox/themes.ts` の
いちばん新しい `from` のテーマ）、旗は `ALERT_FX`（空ならテーマが動画の段 `fxVideo` を持つとき `full`、
`-` で旗なし）。決めたものは prep が `in/season.json` に書き、どの shard もそれを読む（全部が同じ条件で数える）。

## なぜ Actions に置くか

書き出し・録画・重なりの検査を作業箱で回すと、長い出力と大量の絵を読むことになり、1件で 30万〜80万トークン
食っていた。Actions は無料なので、重い処理と長い出力は全部そちらに置き、こちらは digest の表1枚だけを読む。
**道具の合否と既定値は変えない**（ここは呼ぶ順番と、終了コード・`--json` を表にするところだけ）。

各 shard は道具の終了コードをそのまま残し、ここでは赤くしない（1つ落ちても他の shard は最後まで数える）。
赤くするのは digest（`report` の job）。
"""

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SPRITES = ROOT / "tools" / "sprites"
WORK = Path(os.environ.get("ALERT_WORK") or "/tmp/alert-work")
DIST = WORK / "dist"
IN = WORK / "in"
RES = WORK / "res"
PUB = WORK / "pub"
TMP = WORK / "tmp"

AMOUNTS = [100, 300, 700, 1500, 3000, 7000, 10000]
SIZES = ["436x776", "664x1180"]
TEXTS = "short:none,short:3,long:1,long:3"
# 台本の秒を道具が知っているテーマ（`alert-overlap.mjs` の SHOWS）。ほかは滞在を 1.5 秒おきに撮る秒をこちらで渡す
OVERLAP_KNOWS = {"halloween"}

sys.path.insert(0, str(HERE))


def season():
    p = IN / "season.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    src = (ROOT / "app/alertbox/themes.ts").read_text(encoding="utf-8")
    body = src[src.index("export const THEMES") :]
    themes = []
    for m in re.finditer(r'^    id: "([\w-]+)"', body, re.M):
        nxt = re.search(r'^    id: "', body[m.end() :], re.M)
        block = body[m.end() : m.end() + (nxt.start() if nxt else len(body))]
        frm = re.search(r'^    from: "([^"]+)"', block, re.M)
        themes.append({"id": m.group(1), "from": frm.group(1) if frm else "", "fxVideo": bool(re.search(r"^    fxVideo:", block, re.M))})
    theme = os.environ.get("ALERT_THEME") or max(themes, key=lambda t: t["from"])["id"]
    fx = os.environ.get("ALERT_FX", "")
    if not fx:
        fx = "full" if any(t["id"] == theme and t["fxVideo"] for t in themes) else ""
    if fx == "-":
        fx = ""
    return {"theme": theme, "fx": fx}


def alert_sec(a):
    return 30 + (30 if a >= 10000 else 15 if a >= 1000 else 0)


def stay_frames(a):
    """台本を道具が知らないテーマの撮る秒。登場（0.6〜）から締め（尻の 0.6 秒前）まで 1.5 秒おき"""
    d = alert_sec(a)
    ts = [0.6, 1.2]
    t = 2.0
    while t < d - 1.0:
        ts.append(round(t, 2))
        t += 1.5
    ts.append(round(d - 0.6, 2))
    return ",".join(str(x) for x in ts)


def plan():
    s = [f"overlap-{a}-{sz}" for a in AMOUNTS for sz in SIZES]
    return s + ["overlap-control", "textfit", "ink-a", "ink-b", "banksize", "decode", "fx", "media"]


# ---------------------------------------------------------------- 支度


def sh(cmd, log, cwd=None, env=None, timeout=None):
    """道具を1本回す。出力はログに全部書き、こちらには何も流さない（長い出力を読まない）"""
    t0 = time.time()
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"\n$ {' '.join(str(c) for c in cmd)}\n")
        f.flush()
        try:
            r = subprocess.run([str(c) for c in cmd], cwd=cwd, env=env, stdout=f, stderr=subprocess.STDOUT, timeout=timeout)
            code = r.returncode
        except subprocess.TimeoutExpired:
            f.write(f"\n（{timeout} 秒で打ち切った）\n")
            code = 124
    return code, round(time.time() - t0, 1)


def tail(log, n=4):
    try:
        lines = [x.rstrip() for x in open(log, encoding="utf-8", errors="replace") if x.strip()]
    except OSError:
        return []
    return [x[:200] for x in lines[-n:]]


def prep():
    import inputs

    for d in (RES, PUB, TMP):
        d.mkdir(parents=True, exist_ok=True)
    log = RES / "prep.log"
    s = season()
    info = {"theme": s["theme"], "fx": s["fx"], "steps": {}}
    if not (DIST / "alertbox").exists():
        inputs.clear(DIST)
        code, sec = sh(["npx", "expo", "export", "--platform", "web", "--output-dir", DIST], log, cwd=ROOT)
        info["steps"]["export"] = {"exit": code, "sec": sec}
        # 本番と同じく public/ を重ねる（`npm run copy-public`。段の絵と動画は public/alert にある）
        shutil.copytree(ROOT / "public", DIST, dirs_exist_ok=True)
    info["steps"]["dist"] = (DIST / "alertbox").exists()
    code, sec = sh([sys.executable, SPRITES / "avatars.py"], log, cwd=ROOT, timeout=900)
    roster = None
    for line in open(log, encoding="utf-8", errors="replace"):
        m = re.match(r"(\d+)/(\d+) 枚 -> /tmp/avatars$", line.strip())
        if m:
            roster = int(m.group(2))
    info["steps"]["avatars"] = {"exit": code, "sec": sec}
    inputs.clear(IN)
    IN.mkdir(parents=True)
    inputs.backgrounds(IN / "bg")
    fallback = sorted((ROOT / "site/public/characters").glob("*.webp")) + [ROOT / "site/public/goods/ayato-walk.png"]
    chars = inputs.characters("/tmp/avatars", IN / "chars", 12, [str(p) for p in fallback])
    chars["roster"] = roster
    (IN / "chars.json").write_text(json.dumps(chars, ensure_ascii=False, indent=1), encoding="utf-8")
    (IN / "season.json").write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")
    info["chars"] = {k: chars[k] for k in ("roster", "roster_found", "got", "used", "ok", "typical")}
    info["chars"]["shapes"] = [{k: c[k] for k in ("name", "aspect", "fill", "alpha", "colors")} for c in chars["chars"]]
    (RES / "prep.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: info[k] for k in ("theme", "fx")} | {"chars": info["chars"]["used"], "dist": info["steps"]["dist"]}, ensure_ascii=False))
    return 0 if info["steps"]["dist"] else 2


class Server:
    """書き出したものを静的に配る（開発サーバーでは測らない。`CLAUDE.md`）"""

    def __enter__(self):
        with socket.socket() as so:
            so.bind(("127.0.0.1", 0))
            self.port = so.getsockname()[1]
        self.p = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(self.port), "--bind", "127.0.0.1", "--directory", str(DIST)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.base = f"http://127.0.0.1:{self.port}"
        for _ in range(60):
            try:
                urllib.request.urlopen(f"{self.base}/alertbox/", timeout=2).read(1)
                return self
            except Exception:  # noqa: BLE001 立ち上がるまで待つ
                time.sleep(0.5)
        raise RuntimeError("書き出しを配れなかった（/alertbox/ が返らない）")

    def __exit__(self, *a):
        self.p.kill()


def node(tool, *args):
    return ["node", SPRITES / tool, *args]


def fxargs(s):
    return ["--fx", s["fx"]] if s["fx"] else []


def load(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def shard(name):
    for d in (RES, PUB, TMP):
        d.mkdir(parents=True, exist_ok=True)
    s = season()
    log = RES / f"{name}.log"
    log.write_text("", encoding="utf-8")
    out = TMP / name
    inputs_clear(out)
    res = {"shard": name, "theme": s["theme"], "fx": s["fx"]}
    t0 = time.time()
    try:
        if name == "unit":
            res |= unit(log)
        elif name == "fx":
            res |= fx(s, log, out)
        elif name == "decode":
            code, _ = sh(node("alert-decode.mjs", "--dist", DIST, "--amounts", ",".join(map(str, AMOUNTS)), "--rates", "1,4,6", "--runs", "3", "--json", out / "out.json"), log, cwd=SPRITES)
            res |= {"exit": code, "tool": load(out / "out.json")}
        else:
            with Server() as srv:
                res |= browser_shard(name, s, srv.base, log, out)
    except Exception as e:  # noqa: BLE001 測れなかったことを表に出す（黙って抜けない）
        res |= {"exit": 2, "error": str(e)[:300]}
    res["sec"] = round(time.time() - t0)
    if res.get("exit") not in (0, None) or res.get("error"):
        res["tail"] = tail(log)
    (RES / f"{name}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}: exit {res.get('exit')}（{res['sec']} 秒）")
    return 0


def inputs_clear(p):
    if p.exists():
        shutil.rmtree(p)
    p.mkdir(parents=True)


def browser_shard(name, s, base, log, out):
    chars = IN / "chars"
    if name.startswith("overlap-") and name != "overlap-control":
        _, a, size = name.split("-")
        extra = [] if s["theme"] in OVERLAP_KNOWS else ["--frames", stay_frames(int(a))]
        cmd = node("alert-overlap.mjs", "--base", base, "--chars", chars, "--theme", s["theme"], *fxargs(s), "--amounts", a, "--sizes", size, "--texts", TEXTS, "--out", out, "--json", out / "out.json", *extra)
        code, _ = sh(cmd, log, cwd=SPRITES)
        tool = load(out / "out.json")
        # 落ちたコマの絵を3枚まで、録画の枝に載せる（ほかの絵は捨てる）
        if tool:
            (PUB / "fail").mkdir(parents=True, exist_ok=True)
            for h in [h for h in tool.get("hits", []) if h.get("png")][:3]:
                dst = PUB / "fail" / f"{name}-{Path(h['png']).name}"
                shutil.copy(h["png"], dst)
                h["png"] = f"fail/{dst.name}"
        return {"exit": code, "tool": tool}
    if name == "overlap-control":
        first = sorted(chars.glob("*.png"))[0]
        got = {}
        for kind in ("face", "hero"):
            o = out / kind
            o.mkdir(parents=True)
            extra = [] if s["theme"] in OVERLAP_KNOWS else ["--frames", "4.5,6,9"]
            cmd = node("alert-overlap.mjs", "--base", base, "--chars", first, "--theme", s["theme"], *fxargs(s), "--amounts", "1500", "--sizes", "436x776", "--texts", "short:3", "--control", kind, "--out", o, "--json", o / "out.json", *extra)
            code, _ = sh(cmd, log, cwd=SPRITES)
            got[kind] = {"exit": code, "tool": load(o / "out.json")}
        # 対照は 1（顔に乗った）で落ちるのが正しい
        return {"exit": 0 if all(v["exit"] == 1 for v in got.values()) else 1, "controls": got}
    if name == "textfit":
        code, _ = sh(node("alert-textfit.mjs", "--base", base, "--out", out, "--json", out / "out.json"), log, cwd=SPRITES)
        return {"exit": code, "tool": load(out / "out.json")}
    if name in ("ink-a", "ink-b"):
        themes = "halloween" if name == "ink-a" else ",".join(dict.fromkeys(["halloween", s["theme"], "none"]))
        amounts = "100,300,700,1500" if name == "ink-a" else "3000,7000,10000"
        cmd = node("alert-ink.mjs", "--base", base, "--bg-dir", IN / "bg", "--chars", chars, "--themes", themes, "--amounts", amounts, "--out", out, "--json", out / "out.json")
        code, _ = sh(cmd, log, cwd=SPRITES)
        return {"exit": code, "tool": load(out / "out.json")}
    if name == "banksize":
        code, _ = sh(node("alert-banksize.mjs", "--base", base, "--themes", s["theme"], "--json", out / "out.json"), log, cwd=SPRITES)
        return {"exit": code, "tool": load(out / "out.json")}
    if name == "media":
        return media(s, base, log, out)
    raise ValueError(f"知らない shard: {name}")


def media(s, base, log, out):
    info = load(IN / "chars.json") or {}
    ch = IN / "chars" / f"{info.get('typical')}.png"
    if not ch.exists():
        ch = sorted((IN / "chars").glob("*.png"))[0]
    scene = IN / "bg" / "scene.jpg"
    recs = []
    for a in AMOUNTS:
        mp4 = out / f"t{a}.mp4"
        cmd = node(
            "alert-record.mjs", "--base", base, "--portrait", "--ui", "--also-small", "--sheet", "6", "--amount", str(a),
            "--frame", "401,722,607,1082", "--zoom", "1.39", "--theme", s["theme"], *fxargs(s), "--backdrop", scene, "--character", ch, "--out", mp4,
        )
        code, sec = sh(cmd, log, cwd=SPRITES, timeout=600)
        files = []
        # 枝に載せるのは 720×1280 の版（スマホでそのまま再生できる大きさ）と一覧
        for src, dst in ((out / f"t{a}-small.mp4", f"t{a}.mp4"), (out / f"t{a}-sheet.png", f"t{a}-sheet.png")):
            if src.exists():
                shutil.copy(src, PUB / dst)
                files.append(dst)
        recs.append({"amount": a, "exit": code, "sec": sec, "files": files, "probe": probe(PUB / f"t{a}.mp4")})
    code, _ = sh(node("alert-compare.mjs", "--base", base, "--bg", scene, "--char", ch, "--theme", s["theme"], *fxargs(s), "--out", PUB / "compare.png"), log, cwd=SPRITES, timeout=900)
    ok = all(r["exit"] == 0 and r["probe"] for r in recs) and code == 0 and (PUB / "compare.png").exists()
    return {"exit": 0 if ok else 1, "records": recs, "compare": {"exit": code, "file": "compare.png" if (PUB / "compare.png").exists() else None}, "char": ch.stem}


def probe(p):
    if not p.exists():
        return None
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=duration", "-of", "json", str(p)], capture_output=True, text=True)
    try:
        j = json.loads(r.stdout)
        st = j["streams"][0]
        return {"w": st["width"], "h": st["height"], "codec": st["codec_name"], "sec": round(float(j["format"]["duration"]), 1)}
    except (ValueError, KeyError, IndexError):
        return None


def fx(s, log, out):
    d = ROOT / "public/alert/themes" / s["theme"] / "fx"
    if not (d / "manifest.json").exists():
        return {"exit": None, "na": f"{s['theme']} は動画の段を持たない"}
    code, _ = sh([sys.executable, ROOT / "tools/alert-theme/fx_check.py", d, "--sheet", PUB / "fx-sheet.jpg"], log, cwd=ROOT, timeout=3600)
    text = open(log, encoding="utf-8", errors="replace").read()
    tiers = re.findall(r"^== 段(\d+)", text, re.M)
    bad, tier = [], "?"
    for line in text.splitlines():
        m = re.match(r"^== 段(\d+)", line)
        if m:
            tier = m.group(1)
        m = re.match(r"^\s+✗ (.+)$", line)
        if m:
            bad.append(f"段{tier} {m.group(1).strip()}")
    videos = len(list(d.glob("*.webm")))
    return {"exit": code, "tiers": len(tiers), "videos": videos, "bad": bad[:20], "nbad": len(bad)}


def unit(log):
    """`npx jest app/alertbox` と型。どちらも前から落ちるものがあるので、それだけは数えて分けて出す
    （SKILL.md §5: roster.test.tsx の時間切れ 1〜3件、型は .svg の2件）"""
    jout = TMP / "jest.json"
    jcode, _ = sh(["npx", "jest", "app/alertbox", "--ci", "--json", f"--outputFile={jout}"], log, cwd=ROOT, timeout=1800)
    j = load(jout) or {}
    known, other = [], []
    for f in j.get("testResults", []):
        fname = os.path.relpath(f.get("name", ""), ROOT)
        fails = [x for x in f.get("assertionResults", []) if x.get("status") == "failed"]
        if f.get("status") == "failed" and not fails:
            other.append(f"{fname}: {(f.get('message') or '').strip().splitlines()[0][:120] if f.get('message') else '読み込めない'}")
        for x in fails:
            msg = " ".join(x.get("failureMessages") or [])
            row = f"{fname}: {x.get('title', '')[:60]}"
            (known if fname.endswith("roster.test.tsx") and "Exceeded timeout" in msg else other).append(row)
    tlog = TMP / "tsc.log"
    tcode, _ = sh(["npx", "tsc", "--noEmit"], tlog, cwd=ROOT, timeout=1800)
    errs = [x.strip() for x in open(tlog, encoding="utf-8", errors="replace") if re.search(r"error TS\d+", x)]
    svg = [e for e in errs if ".svg" in e]
    rest = [e for e in errs if ".svg" not in e]
    with open(log, "a", encoding="utf-8") as f:
        f.write(open(tlog, encoding="utf-8", errors="replace").read())
    jest = {"exit": jcode, "total": j.get("numTotalTests", 0), "failed": j.get("numFailedTests", 0), "known": known, "other": other[:20], "nother": len(other)}
    types = {"exit": tcode, "errors": len(errs), "svg": len(svg), "rest": [e[:200] for e in rest[:20]], "nrest": len(rest)}
    return {"exit": 0 if not other and not rest and jest["total"] else 1, "jest": jest, "types": types}


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "prep":
        return prep()
    if cmd == "plan":
        print(json.dumps(plan()))
        return 0
    if cmd == "shard" and len(argv) > 2:
        return shard(argv[2])
    if cmd == "pushed" and len(argv) > 2:
        # 録画の枝に置いたもの（alert_check.yml の media の job が、push のあとに呼ぶ）
        RES.mkdir(parents=True, exist_ok=True)
        num = lambda f: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", f)]  # noqa: E731 t300 を t1500 より先に
        files = sorted((str(p.relative_to(PUB)) for p in PUB.rglob("*") if p.is_file() and ".git" not in p.parts), key=num)
        mb = sum((PUB / f).stat().st_size for f in files) / 1e6
        err = argv[3] if len(argv) > 3 else ""
        (RES / "push.json").write_text(json.dumps({"branch": None if err else argv[2], "error": err, "files": files, "mb": mb}, ensure_ascii=False), encoding="utf-8")
        print(f"{argv[2]}: {len(files)} 本・{mb:.1f}MB{'・' + err if err else ''}")
        return 0
    if cmd == "digest":
        import digest

        return digest.main(RES, WORK / "digest.md")
    if cmd == "all":
        prep()
        for name in plan() + ["unit"]:
            shard(name)
        import digest

        return digest.main(RES, WORK / "digest.md")
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
