#!/usr/bin/env python3
"""投げ銭アラートの確かめを、Actions（`.github/workflows/alert_check.yml`）と手元で**同じ入口**から回す（#1117）。

    python3 tools/alert-theme/ci/run.py prep            # 書き出し・キャラ絵・地を <work> に用意する
    python3 tools/alert-theme/ci/run.py plan            # 回す組（shard）の名前を JSON の並びで出す
    python3 tools/alert-theme/ci/run.py shard <名前>     # 1組回して <work>/res/<名前>.json に残す
    python3 tools/alert-theme/ci/run.py digest          # <work>/res/ から <work>/digest.md（30行以内）。❌ があれば 1
    python3 tools/alert-theme/ci/run.py all             # 手元で全部を順に（道具を直すときだけ。2時間ほどかかる）
    python3 tools/alert-theme/ci/run.py themes          # 測るテーマ（豚を除く）を JSON で。道具の既定がこれを呼ぶ

置き場は `ALERT_WORK`（既定 /tmp/alert-work）。

## 測るテーマ

**期間がいま効いている、または 60 日以内に始まるテーマ ＋ 豚（`none`）**（日本時間で見る）。終わったテーマは測らない
（終わったハロウィンを毎 PR で数えていた日、ハロウィンの光が字の下を通る秒で割れて、関係の無い PR が赤くなった）。
消してはいないので、来年の日付を themes.ts に足せば 60 日前からひとりでに戻る。
旗は、テーマが動画の段（`fxVideo`）を持てば `full`（配信に出す前の7段も、出したあとの7段も同じに数える）。
`ALERT_THEME`（カンマ区切り）と `ALERT_FX`（`-` で旗なし）で名指しできる。
決めたものは prep が `in/season.json` に書き、どの shard もそれを読む（全部が同じ条件で数える）。

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


SOON_DAYS = 60


def read_themes():
    """themes.ts の THEMES を [{id, from, until, fxVideo}] で。TS を字で読むのは python/ts_read.py だけ"""
    sys.path.insert(0, str(ROOT / "python"))
    from ts_read import array_body, code_only, fields, nested_body, objects  # noqa: PLC0415

    src = code_only((ROOT / "app/alertbox/themes.ts").read_text(encoding="utf-8"))
    out = []
    for o in objects(array_body(src, "THEMES")):
        f = fields(o)
        out.append({"id": f.get("id", ""), "from": f.get("from", ""), "until": f.get("until", ""), "fxVideo": bool(nested_body(o, "fxVideo").strip())})
    if not out:
        raise SystemExit("themes.ts の THEMES が読めない（置き場か形が変わった？）。ALERT_THEME で名指しする")
    return out


def pick_themes(themes, now):
    """期間がいま効いている、または SOON_DAYS 日以内に始まるテーマ（始まりの順）。now は日本時間の naive datetime"""
    from datetime import datetime, timedelta  # noqa: PLC0415

    def at(s):
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            return None

    got = []
    for t in themes:
        frm, until = at(t["from"]), at(t["until"])
        if frm is None:
            continue
        live = frm <= now and (until is None or now < until)
        soon = now < frm <= now + timedelta(days=SOON_DAYS)
        if live or soon:
            got.append(t)
    return sorted(got, key=lambda t: t["from"])


def season(fresh=False):
    p = IN / "season.json"
    if p.exists() and not fresh:
        return json.loads(p.read_text(encoding="utf-8"))
    from datetime import datetime  # noqa: PLC0415
    from zoneinfo import ZoneInfo  # noqa: PLC0415

    named = [x for x in os.environ.get("ALERT_THEME", "").split(",") if x]
    all_themes = read_themes() if not named else []
    if named:
        picked = [{"id": x, "fxVideo": True} for x in named]
    else:
        picked = pick_themes(all_themes, datetime.now(ZoneInfo("Asia/Tokyo")).replace(tzinfo=None))
    fx_env = os.environ.get("ALERT_FX", "")
    themes = []
    for t in picked:
        fx = fx_env or ("full" if t["fxVideo"] else "")
        themes.append({"theme": t["id"], "fx": "" if fx == "-" else fx})
    # いちばん先に始まったもの（いま配信に出ているもの）を、録画と対照に使う。無ければ豚
    first = themes[0] if themes else {"theme": "none", "fx": ""}
    return {"themes": themes, "theme": first["theme"], "fx": first["fx"]}


def ink_label(s):
    """表に出す「何を測ったか」。動画の旗が付けば7段"""
    parts = [f"{t['theme']}・{'7段' if t['fx'] or t['theme'] == 'halloween' else '1段'}" for t in s["themes"]]
    return " ＋ ".join(parts + ["豚"])


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


def overlap_themes(s):
    return s["themes"] or [{"theme": "none", "fx": ""}]


def plan(s=None):
    s = s or season()
    out = [f"overlap-{t['theme']}-{a}-{sz}" for t in overlap_themes(s) for a in AMOUNTS for sz in SIZES]
    return ["controls"]  # 対照の枝: 対照だけ（#1141。マージしない）


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
    s = season(fresh=True)
    info = {"theme": s["theme"], "fx": s["fx"], "themes": s["themes"], "label": ink_label(s), "shards": plan(s), "steps": {}}
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


def any_fx(s):
    """複数のテーマを1本で測る道具（textfit・ink）に渡す旗。どれかが動画の段を持てば full"""
    fx = next((t["fx"] for t in s["themes"] if t["fx"]), "")
    return ["--fx", fx] if fx else []


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
    res = {"shard": name, "theme": s["theme"], "fx": s["fx"], "label": ink_label(s)}
    t0 = time.time()
    try:
        if name == "unit":
            res |= unit(log)
        elif name == "fx":
            res |= fx(s, log, out)
        elif name == "decode":
            res |= decode(s, log, out)
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


def decode(s, log, out):
    """テーマごとに順に（CPU を絞るので並べない）。台本の段も動画の段も、段の頭で用意しきるまで"""
    runs = {}
    code = 0
    for t in overlap_themes(s):
        j = out / f"{t['theme']}.json"
        c, _ = sh(node("alert-decode.mjs", "--dist", DIST, "--theme", t["theme"], *fxargs(t), "--amounts", ",".join(map(str, AMOUNTS)), "--rates", "1,4,6", "--runs", "3", "--json", j), log, cwd=SPRITES)
        runs[t["theme"]] = {"exit": c, "tool": load(j)}
        code = max(code, c)
    tools = [v["tool"] for v in runs.values() if v["tool"]]
    merged = None
    if tools:
        merged = {
            "runs": sum(x["runs"] for x in tools),
            "max": max((x["max"] for x in tools if x["max"] is not None), default=None),
            "limit": tools[0]["limit"],
            "bad": [b for x in tools for b in x["bad"]],
            "errs": [e for x in tools for e in x["errs"]],
            "byTheme": {k: v["tool"]["runs"] for k, v in runs.items() if v["tool"]},
        }
    return {"exit": code, "tool": merged}


def controls(s, base, log, out):
    """壊すと落ちるか（どれも 1 で落ちるのが正しい）。いちばん先のテーマの段4（1,500円）で1本ずつ"""
    t = {"theme": s["theme"], "fx": s["fx"]}
    one = sorted((IN / "chars").glob("*.png"))[0]
    onedir = out / "one"
    onedir.mkdir(parents=True)
    shutil.copy(one, onedir / one.name)
    frames = [] if t["theme"] in OVERLAP_KNOWS else ["--frames", "4.5,6,9"]
    jobs = {
        # 顔の前に手前の層の四角を置く / 主役の顔の枠を字の真ん中に置く / 主役の帯を字の高さに置く
        "face": node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "1500", "--sizes", "436x776", "--texts", "short:3", "--control", "face", *frames),
        "hero": node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "1500", "--sizes", "436x776", "--texts", "short:3", "--control", "hero", *frames),
        "band": node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "1500", "--sizes", "436x776", "--texts", "short:3", "--control", "band", *frames),
        # 字の層を左へずらして縁で切る / 字の色を縁取りに近い暗い赤にする / 展開の上限を 1ms にする
        "textfit": node("alert-textfit.mjs", "--base", base, "--themes", t["theme"], *fxargs(t), "--amounts", "1500", "--sizes", "436x776", "--control", "edge"),
        "ink": node("alert-ink.mjs", "--base", base, "--bg-dir", IN / "bg", "--chars", onedir, "--themes", t["theme"], *fxargs(t), "--amounts", "1500", "--control", "flat"),
        "decode": node("alert-decode.mjs", "--dist", DIST, "--theme", t["theme"], *fxargs(t), "--amounts", "1500", "--rates", "1", "--runs", "1", "--limit", "1"),
    }
    # 札を最初から見せる / `<video>` の poster を外す（#1133）/ 顔の穴を1コマ遅らせる（#1141）/
    # 段7 の札を revealAt より前に出す・元の高さから落とす（主役の顔の箱。#1141）（動画の段のあるテーマのときだけ）
    if t["fx"]:
        jobs["reveal"] = node("alert-reveal.mjs", "--base", base, "--theme", t["theme"], *fxargs(t), "--char", one, "--sizes", "436x776", "--rates", "1", "--nets", "off", "--runs", "1", "--control", "early")
        jobs["poster"] = node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "1500", "--sizes", "436x776", "--texts", "short:3", "--control", "poster", *frames)
        jobs["platehigh"] = node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "10000", "--sizes", "664x1180", "--texts", "long:3", "--control", "platehigh", *frames)
        # 札の対照は、札の背がいちばん高くて顔の箱に掛かりやすい組（664x1180・長い名前・3行）で
        jobs["plateearly"] = node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "10000", "--sizes", "664x1180", "--texts", "long:3", "--control", "plateearly", *frames)
        jobs["holelate"] = node("alert-overlap.mjs", "--base", base, "--chars", one, "--theme", t["theme"], *fxargs(t), "--amounts", "1500", "--sizes", "436x776", "--texts", "short:3", "--control", "holelate", *frames)
    got = {}
    for kind, cmd in jobs.items():
        o = out / kind
        o.mkdir(parents=True)
        if kind not in ("decode", "reveal"):
            cmd = [*cmd, "--out", o]
        code, _ = sh([*cmd, "--json", o / "out.json"], log, cwd=SPRITES)
        got[kind] = {"exit": code, "tool": load(o / "out.json")}
    return {"exit": 0 if all(v["exit"] == 1 for v in got.values()) else 1, "controls": got}


def browser_shard(name, s, base, log, out):
    chars = IN / "chars"
    if name.startswith("overlap-"):
        _, theme, a, size = name.split("-")
        t = next((x for x in overlap_themes(s) if x["theme"] == theme), {"theme": theme, "fx": ""})
        extra = [] if theme in OVERLAP_KNOWS else ["--frames", stay_frames(int(a))]
        cmd = node("alert-overlap.mjs", "--base", base, "--chars", chars, "--theme", theme, *fxargs(t), "--amounts", a, "--sizes", size, "--texts", TEXTS, "--out", out, "--json", out / "out.json", *extra)
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
    if name == "controls":
        return controls(s, base, log, out)
    if name == "reveal":
        # 動画の段で、札が revealAt より前に見えていないか・額が数え上げ前の 0 で見えていないか。毎コマ数える。
        # CPU の絞り × 回線の遅れ × 箱 × 5回（動画が遅れる日に札が先に出る、を当てる）
        vt = [t for t in s["themes"] if t["fx"]]
        if not vt:
            return {"exit": None, "na": "動画の段を持つテーマが無い"}
        info = load(IN / "chars.json") or {}
        ch = IN / "chars" / f"{info.get('typical')}.png"
        if not ch.exists():
            ch = sorted(chars.glob("*.png"))[0]
        code, got = 0, {}
        for t in vt:
            j = out / f"{t['theme']}.json"
            c, _ = sh(node("alert-reveal.mjs", "--base", base, "--theme", t["theme"], *fxargs(t), "--amount", "10000", "--char", ch, "--json", j), log, cwd=SPRITES, timeout=5400)
            got[t["theme"]] = load(j)
            code = max(code, c)
            # 条件ごとの数は job のログにも短く出す（表は落ちた条件しか出さない）
            for k, b in ((got[t["theme"]] or {}).get("by") or {}).items():
                print(f"  reveal {t['theme']} {k}: 動画 {b['video']}/{b['runs']} 札が先 {b['earlyRuns']}回（最大 {b['worst']}秒） 0円 {b['zeroRuns']}回")
        return {"exit": code, "tool": next(iter(got.values())), "tools": got}
    if name == "devices":
        return devices(s, base, log, out)
    if name in REPEATS:
        return repeat(name, s, base, log, out)
    themes = ",".join([t["theme"] for t in s["themes"]] + ["none"])
    if name == "textfit":
        code, _ = sh(node("alert-textfit.mjs", "--base", base, "--themes", themes, *any_fx(s), "--out", out, "--json", out / "out.json"), log, cwd=SPRITES)
        return {"exit": code, "tool": load(out / "out.json")}
    if name == "ink":
        cmd = node("alert-ink.mjs", "--base", base, "--bg-dir", IN / "bg", "--chars", chars, "--themes", themes, *any_fx(s), "--amounts", ",".join(map(str, AMOUNTS)), "--out", out, "--json", out / "out.json")
        code, _ = sh(cmd, log, cwd=SPRITES)
        return {"exit": code, "tool": load(out / "out.json"), "themes": themes}
    if name == "banksize":
        if not s["themes"]:
            return {"exit": None, "na": "季節のテーマが無い（豚だけ）"}
        code, _ = sh(node("alert-banksize.mjs", "--base", base, "--themes", ",".join(t["theme"] for t in s["themes"]), "--json", out / "out.json"), log, cwd=SPRITES)
        return {"exit": code, "tool": load(out / "out.json")}
    if name == "media":
        return media(s, base, log, out)
    raise ValueError(f"知らない shard: {name}")


# 時間切れの組を、同じ条件でくり返す（#1138）。plan には入れない（対照の枝が plan を差し替えて、PR と master で比べる）
REPEATS = {
    "repeat-a": {"amount": 10000, "size": "664x1180", "text": "long:1", "char": "c07-big", "n": 30},
    "repeat-b": {"amount": 100, "size": "664x1180", "text": "long:3", "char": "c03-pad", "n": 30},
}
# 顔に乗った1コマ（#1141。1万円・664x1180・c07-big・long:1 で30回に1回）を、1万円の4組 × 100回で数える。
# 1組100回を1本で回すと 90 分を越えるので、25回ずつ4本に割る（face-a1〜a4 …）
FACE_REPEATS = {
    "a": {"amount": 10000, "size": "664x1180", "text": "long:1", "char": "c07-big"},
    "b": {"amount": 10000, "size": "436x776", "text": "long:1", "char": "c07-big"},
    "c": {"amount": 10000, "size": "664x1180", "text": "short:3", "char": "c01-tall"},
    "d": {"amount": 10000, "size": "664x1180", "text": "long:3", "char": "c03-pad"},
}
REPEATS.update({f"face-{k}{i}": {**v, "n": 25} for k, v in FACE_REPEATS.items() for i in range(1, 5)})


def repeat(name, s, base, log, out):
    """REPEATS の1組を n 回（3本並べて。重なりの shard と同じ混み方）。測れなかった回と、その様子を出す"""
    spec = REPEATS[name]
    t = next((x for x in overlap_themes(s) if x["fx"]), overlap_themes(s)[0])
    ch = IN / "chars" / f"{spec['char']}.png"
    if not ch.exists():
        ch = sorted((IN / "chars").glob("*.png"))[0]
    a = spec["amount"]
    extra = [] if t["theme"] in OVERLAP_KNOWS else ["--frames", stay_frames(a)]
    cmd = node("alert-overlap.mjs", "--base", base, "--chars", ",".join([str(ch)] * spec["n"]), "--theme", t["theme"], *fxargs(t), "--amounts", str(a), "--sizes", spec["size"], "--texts", spec["text"], "--out", out, "--json", out / "out.json", *extra)
    code, _ = sh(cmd, log, cwd=SPRITES, timeout=5400)
    tool = load(out / "out.json") or {}
    inv = tool.get("invalid") or []
    print(f"  {name} {a}円 {spec['size']} {ch.stem} {spec['text']}: {tool.get('runs')}回・測れない {len(inv)}回・重なり {len(tool.get('hits') or [])}組")
    for v in inv[:6]:
        print(f"    {v['why'][:600]}")
    # 顔に乗ったコマ（何秒・どの層・その時の穴）と、描くたびに数えた穴の外れ（#1141）。artifact は作業箱から落とせないので、ログに出す
    for h in (tool.get("hits") or [])[:10]:
        print(f"    重なり {h['t']}s（動画 {json.dumps(h.get('vt'), ensure_ascii=False)}）: front {h['front']} / cover {h['cover']} / 字 {h.get('heroText')}・撮る前の穴 {json.dumps(h.get('hole'), ensure_ascii=False)}・撮った後 {json.dumps(h.get('holeAfter'), ensure_ascii=False)}・箱から {json.dumps(h.get('face'), ensure_ascii=False)}")
    print(f"    顔の穴: {tool.get('faceFrames')}コマ中 外れ {tool.get('faceMiss')}・外れた回 {len(tool.get('faceBad') or [])}/{tool.get('runs')}・箱から(秒) {json.dumps(tool.get('faceLag'), ensure_ascii=False)}")
    if tool.get("heroLine"):
        print(f"    主役の顔の線（段7・描くたび・動画の秒）: {tool.get('heroFrames')}コマ中 字が掛かった {tool.get('heroMiss')}・掛かった回 {len(tool.get('heroBad') or [])}/{tool.get('runs')}")
        for b in (tool.get("heroBad") or [])[:4]:
            print(f"    字 {b['miss']}/{b['frames']}コマ: {json.dumps(b['bad'], ensure_ascii=False)}")
    for b in (tool.get("faceBad") or [])[:4]:
        print(f"    外れ {b['miss']}/{b['frames']}コマ: {json.dumps(b['bad'], ensure_ascii=False)} 穴 {b['hole']}s・中身 {b['content']}s・覆う {b['fit']}s")
    return {"exit": code, "tool": tool, "spec": spec}


# 合図の来ない偽の端末（alert-reveal.mjs の --device。#1137）
DEVICES = ["norvfc", "mutervfc", "rs1", "android"]


def devices(s, base, log, out):
    """合図の来ない偽の端末 4通り × 7段で、動画が出て（段が落ちない）札が revealAt のあとに出るか。
    11/6 の配信（Android の WebView）で7段が1つも出なかった（#1137）。この箱の Chromium はどの合図も来るので、
    来ない形を道具の側で作る。1組1回・箱 436x776・CPU そのまま・回線そのまま"""
    t = next((x for x in s["themes"] if x["fx"]), None)
    if not t:
        return {"exit": None, "na": "動画の段を持つテーマが無い"}
    ch = sorted((IN / "chars").glob("*.png"))[0]
    rows, code = [], 0
    for d in DEVICES:
        for a in AMOUNTS:
            j = out / f"{d}-{a}.json"
            c, _ = sh(node("alert-reveal.mjs", "--base", base, "--theme", t["theme"], *fxargs(t), "--amount", str(a), "--char", ch, "--sizes", "436x776", "--rates", "1", "--nets", "off", "--runs", "1", "--jobs", "1", "--device", d, "--json", j), log, cwd=SPRITES, timeout=600)
            r = load(j) or {}
            rows.append({"device": d, "amount": a, "exit": c, "video": r.get("video", 0), "runs": r.get("runs", 0), "early": r.get("early", 0), "zero": r.get("zero", 0)})
            code = max(code, c)
            print(f"  devices {d} {a}円: 終了 {c}・動画 {r.get('video', 0)}/{r.get('runs', 0)}・札が先 {r.get('early', 0)}・0円 {r.get('zero', 0)}")
    return {"exit": code, "theme": t["theme"], "rows": rows}


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
    have = [t["theme"] for t in s["themes"] if t["fx"] and (ROOT / "public/alert/themes" / t["theme"] / "fx/manifest.json").exists()]
    if not have:
        return {"exit": None, "na": "動画の段を持つテーマが無い"}
    code = 0
    for th in have:
        d = ROOT / "public/alert/themes" / th / "fx"
        c, _ = sh([sys.executable, ROOT / "tools/alert-theme/fx_check.py", d, "--sheet", PUB / f"fx-sheet-{th}.jpg"], log, cwd=ROOT, timeout=3600)
        code = max(code, c)
    d = ROOT / "public/alert/themes" / have[0] / "fx"
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


ROSTER = "app/alertbox/__tests__/roster.test.tsx"


def _jest_fails(j):
    """jest の --json から、落ちた件を (ファイル, 題, 時間切れか) で"""
    out = []
    for f in j.get("testResults", []):
        fname = os.path.relpath(f.get("name", ""), ROOT)
        fails = [x for x in f.get("assertionResults", []) if x.get("status") == "failed"]
        if f.get("status") == "failed" and not fails:
            msg = (f.get("message") or "読み込めない").strip().splitlines()[0][:120]
            out.append((fname, msg, False))
        for x in fails:
            out.append((fname, x.get("title", "")[:60], "Exceeded timeout" in " ".join(x.get("failureMessages") or [])))
    return out


def unit(log):
    """`npx jest app/alertbox` と型。どちらも前から落ちるものがあるので、それだけは数えて分けて出す
    （SKILL.md §5: roster.test.tsx の時間切れ 1〜3件、型は .svg の2件）。

    roster.test.tsx は混み具合で時間切れになり、その巻き添えで次の件も落ちる（2026-11-05 の CI で
    1回目 1件・2回目 4件）。**落ちたのが roster だけなら、それだけを単独でもう1回回す。**
    単独でも時間切れ以外で落ちれば赤。ほかのファイルが落ちたら、回し直さずに赤"""
    jout = TMP / "jest.json"
    jcode, _ = sh(["npx", "jest", "app/alertbox", "--ci", "--json", f"--outputFile={jout}"], log, cwd=ROOT, timeout=1800)
    j = load(jout) or {}
    fails = _jest_fails(j)
    first = len(fails)
    again = None
    if fails and all(f == ROSTER for f, _, _ in fails):
        jout2 = TMP / "jest-roster.json"
        sh(["npx", "jest", ROSTER, "--ci", "--json", f"--outputFile={jout2}"], log, cwd=ROOT, timeout=900)
        j2 = load(jout2) or {}
        fails = _jest_fails(j2)
        again = j2.get("numFailedTests", 0) if j2 else None
    known = [f"{f}: {t}" for f, t, slow in fails if f == ROSTER and slow]
    other = [f"{f}: {t}" for f, t, slow in fails if not (f == ROSTER and slow)]
    # 型は app/alertbox の中だけを数える（リポジトリ全体を include に入れていて、site/ functions/ tools/ は
    # それぞれの tsconfig・依存で別に組む。根から見ると 1,800件出るが、アラートとは関係が無い）
    tlog = TMP / "tsc.log"
    tcode, _ = sh(["npx", "tsc", "--noEmit"], tlog, cwd=ROOT, timeout=1800)
    errs = [x.strip() for x in open(tlog, encoding="utf-8", errors="replace") if re.search(r"error TS\d+", x)]
    mine = [e for e in errs if e.startswith("app/alertbox/")]
    svg = [e for e in mine if ".svg" in e]
    rest = [e for e in mine if ".svg" not in e]
    with open(log, "a", encoding="utf-8") as f:
        f.write(open(tlog, encoding="utf-8", errors="replace").read())
    jest = {"exit": jcode, "total": j.get("numTotalTests", 0), "failed": j.get("numFailedTests", 0), "first": first, "again": again, "known": known, "other": other[:20], "nother": len(other)}
    types = {"exit": tcode, "errors": len(mine), "all": len(errs), "svg": len(svg), "rest": [e[:200] for e in rest[:20]], "nrest": len(rest)}
    return {"exit": 0 if not other and not rest and jest["total"] else 1, "jest": jest, "types": types}


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "prep":
        return prep()
    if cmd == "plan":
        print(json.dumps(plan()))
        return 0
    if cmd == "themes":
        print(json.dumps(season(fresh=True)["themes"]))
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
