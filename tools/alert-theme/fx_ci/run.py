#!/usr/bin/env python3
"""段の動画（透明つき WebM）を Actions で焼いて確かめる入口（`.github/workflows/alert_fx_render.yml`。#1117）。

作業箱で絵を重ねて焼いて確かめると、1段の直しで1人 55万トークンかかった（11月の段2〜4）。
焼く・確かめる・一覧の絵を作るは Actions（無料）に寄せ、作業箱は「台本を直して push → 短い表を読む」だけにする。

    python3 tools/alert-theme/fx_ci/run.py plan                       # どの段を焼くか・どこへ戻すか（環境変数から。GITHUB_OUTPUT へ）
    python3 tools/alert-theme/fx_ci/run.py chars --out <置き場>        # キャラ絵（本物10人＋形の見本3つ）と、合成した配信画面の地
    python3 tools/alert-theme/fx_ci/run.py tier --theme castle --tier 2 --quality final --chars <置き場> --work <置き場> --res <置き場>
    python3 tools/alert-theme/fx_ci/run.py place --theme castle --art <fx-tier-* の置き場>   # 通った段だけ public へ・manifest を足す
    python3 tools/alert-theme/fx_ci/run.py digest --res <fx-res-* の置き場> --out <表.md>    # 20行以内の表。❌があれば終了コード 1

段1つの中身（tier）:
1. `fx_stage.py all` で焼く。書き出し先は public の fx の写し（ほかの段の manifest を残すため）。public そのものには書かない
2. `fx_check.py`（約束。final は焼く前の連番の絵と PSNR も）・`fx_motion.py`（今の public と比べた動きの倍率。合否には使わない）・
   `fx_hero.py`（本物のキャラ絵 10人＋形の見本で、主役が隠れないか。--min 1.0 は SKILL.md §4 の決まり）
3. 今の public の同じ名前の動画と、バイトで同じか・違えば画素の差（PSNR・最大の差）
4. 一覧の絵（fx_check の紫と緑の地）・主役の一覧（形の見本だけ）・縦の短い録画（合成の地・形の見本だけ）

**本物のキャラ絵（住人の絵）は合否を数えるだけに使い、絵にも録画にも入れない**（それらは git の枝に置くので）。
配信画面の写真（本人の顔が写る）も使わない。録画の地は `synth_bg()` が作る。
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time

# numpy と PIL は焼く・確かめる job にだけ入れる（place・report の job は入れない）ので、使う関数の中で読む

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(TOOLS))
sys.path.insert(0, TOOLS)

# 主役の見えの下限。SKILL.md §4 の fx_hero の決まり（--min 1.0）と同じ。下げると「少しなら隠れてよい」になる
HERO_MIN = 1.0
# 本物のキャラ絵が何人いれば数えてよいか（SKILL.md §5「形と画風を散らして10人以上」）
REAL_MIN = 10
MARK = "<!-- alert-fx-render -->"


def out(**kv):
    """GITHUB_OUTPUT へ（無ければ画面へ）"""
    path = os.environ.get("GITHUB_OUTPUT")
    lines = [f"{k}={v}" for k, v in kv.items()]
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def gh_api(path):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout)


# ------------------------------------------------------------------ 台本の在りか
def scripts_of(theme):
    """{段: 台本}。テーマ専用の置き場（fx_tiers/<theme>/）があればそちら、無ければ fx_tiers/ の直下（いまは城だけ）"""
    base = os.path.join(TOOLS, "fx_tiers")
    d = os.path.join(base, theme) if os.path.isdir(os.path.join(base, theme)) else base
    got = {}
    for p in sorted(glob.glob(os.path.join(d, "t*_*.py"))):
        m = re.match(r"t(\d+)_", os.path.basename(p))
        if m:
            got[int(m.group(1))] = os.path.relpath(p, ROOT)
    return got


def headroom_of(theme, tier):
    """キャラ絵の箱の上の空き。再生の側（app/alertbox/themes.ts の fxVideo.tiers の video.headroom）から読む"""
    sys.path.insert(0, os.path.join(ROOT, "python"))
    try:
        from ts_read import array_body, fields, nested_body, objects
        src = open(os.path.join(ROOT, "app/alertbox/themes.ts"), encoding="utf-8").read()
        i = src.find(f'id: "{theme}"')
        j = src.find('id: "', i + 1)
        part = src[i:j if j > 0 else len(src)]
        m = re.search(r"fxVideo:\s*\{[^}]*?tiers:\s*([A-Z_][A-Z0-9_]*)", part)
        if i >= 0 and m:
            for o in objects(array_body(src, m.group(1))):
                v = fields(nested_body(o, "video"))
                if v.get("tier") == str(tier):
                    return float(v["headroom"])
    except Exception as e:  # noqa: BLE001
        print("themes.ts から headroom を読めなかった:", e)
    import fx_review
    print(f"headroom は fx_review.HEADROOM の写しを使う（段{tier}）")
    return fx_review.HEADROOM.get(tier, 0.2)


# ------------------------------------------------------------------ plan
def cmd_plan(o):
    ev = os.environ.get("EVENT", "")
    repo = os.environ["GITHUB_REPOSITORY"]
    theme = os.environ.get("IN_THEME") or "castle"
    quality = os.environ.get("IN_QUALITY") or "final"
    sha = os.environ["SHA"]
    have = scripts_of(theme)
    notes = []
    if ev == "push":
        ref = os.environ["REF_NAME"]
        before = os.environ.get("BEFORE", "")
        base = before if before and set(before) != {"0"} else "master"
        cmp = gh_api(f"repos/{repo}/compare/{base}...{sha}")
        files = [f["filename"] for f in (cmp or {}).get("files", [])]
        changed = [f for f in files if f.startswith("tools/alert-theme/fx_tiers/")]
        tiers = set()
        for f in changed:
            m = re.match(r"t(\d+)_", os.path.basename(f))
            if m and int(m.group(1)) in have:
                tiers.add(int(m.group(1)))
            elif f.endswith(".py"):
                tiers |= set(have)  # 台本どうしで使う部品が動いた（段の名前の無い .py）。全部焼く
        if cmp is None:
            notes.append(f"差分が取れなかった（{base}...{sha[:7]}）ので全部焼く")
            tiers = set(have)
        target = ref if ref != "master" else ""
    else:
        ref = os.environ.get("IN_REF") or "master"
        want = (os.environ.get("IN_TIERS") or "all").strip()
        if want in ("", "all"):
            tiers = set(have)
        else:
            tiers = set()
            for t in re.split(r"[,\s]+", want):
                if not t:
                    continue
                if int(t) in have:
                    tiers.add(int(t))
                else:
                    notes.append(f"段{t} の台本が無い（段7 は Blender の alert_blender.yml）")
        is_branch = gh_api(f"repos/{repo}/branches/{ref}") is not None
        target = ref if (is_branch and ref != "master") else ""
    if quality != "final":
        target = ""
    pr = ""
    if target:
        owner = repo.split("/")[0]
        got = gh_api(f"repos/{repo}/pulls?state=open&head={owner}:{target}")
        if got:
            pr = str(got[0]["number"])
    slug = re.sub(r"[^A-Za-z0-9._-]", "-", ref)
    for n in notes:
        print("::notice::" + n)
    out(tiers=json.dumps([str(t) for t in sorted(tiers)]), theme=theme, quality=quality, target=target, pr=pr,
        media=f"review-media/fx-{slug}", ref=ref, notes=" / ".join(notes), start=int(time.time()))


# ------------------------------------------------------------------ chars（キャラ絵と地）
def content_box(a):
    import numpy as np
    ys, xs = np.nonzero(a > 24)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def shape_name(w, h):
    return "tall" if h > w * 1.15 else ("wide" if w > h * 1.15 else "square")


def synth_chars(d):
    """形の見本（自分で描いたもの。git の枝に置く絵・録画にはこちらだけを使う）。
    縦長で箱の高さいっぱいになる四角・横長・大きい頭（fx_hero.py の見本の決まり）"""
    from PIL import Image, ImageDraw
    os.makedirs(d, exist_ok=True)
    im = Image.new("RGBA", (400, 1300), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((10, 10, 390, 1290), 40, fill=(214, 120, 160, 255), outline=(60, 20, 40, 255), width=12)
    im.save(os.path.join(d, "s-tallbox.png"))
    im = Image.new("RGBA", (1200, 460), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((10, 10, 1190, 450), 120, fill=(110, 170, 220, 255), outline=(20, 40, 70, 255), width=12)
    im.save(os.path.join(d, "s-wide.png"))
    im = Image.new("RGBA", (900, 1000), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((300, 640, 600, 990), 50, fill=(150, 200, 120, 255), outline=(30, 60, 20, 255), width=10)
    dr.ellipse((40, 10, 860, 740), fill=(240, 200, 120, 255), outline=(80, 50, 10, 255), width=12)
    im.save(os.path.join(d, "s-bighead.png"))


def synth_bg(d):
    """縦の録画の地（1080×1920）。fx_review.py は <bg>/prism-street.jpg と prism-face.jpg を読むので、その名前で置く。
    中身は合成: 明るい昼の街（空・建物・窓・道）と、暗い部屋（明かりの塊）。本物の配信画面は使わない"""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    os.makedirs(d, exist_ok=True)
    W, H = 1080, 1920
    R = np.random.default_rng(1117)
    y = np.linspace(0, 1, H)[:, None, None]
    sky = (1 - y) * np.array([150, 200, 245]) + y * np.array([235, 225, 210])
    im = Image.fromarray(np.broadcast_to(sky, (H, W, 3)).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    x = -40
    while x < W:
        w = int(R.integers(140, 300))
        top = int(R.integers(420, 1100))
        col = tuple(int(c) for c in R.integers(90, 220, 3))
        dr.rectangle((x, top, x + w, 1640), fill=col)
        for wy in range(top + 40, 1600, 70):
            for wx in range(x + 20, x + w - 30, 50):
                lit = R.random() < 0.5
                dr.rectangle((wx, wy, wx + 26, wy + 38), fill=(255, 240, 180) if lit else (60, 70, 90))
        x += w + int(R.integers(10, 40))
    dr.rectangle((0, 1640, W, H), fill=(70, 70, 75))
    for k in range(0, W, 160):
        dr.rectangle((k, 1770, k + 90, 1790), fill=(240, 240, 230))
    im.save(os.path.join(d, "prism-street.jpg"), quality=88)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    base = np.dstack([np.full((H, W), 28.0), np.full((H, W), 24.0), np.full((H, W), 34.0)])
    for cx, cy, r, col in ((540, 900, 420, (150, 110, 90)), (880, 260, 160, (255, 230, 170)), (160, 1500, 260, (60, 80, 140))):
        g = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r))[..., None]
        base = base + g * np.array(col, np.float32)
    dark = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
    dark.save(os.path.join(d, "prism-face.jpg"), quality=88)


def cmd_chars(o):
    """本物のキャラ絵（tools/sprites/avatars.py が /tmp/avatars に落とした住人の絵）から、形と余白が散るように選ぶ"""
    import numpy as np
    from PIL import Image
    real = os.path.join(o.out, "real")
    os.makedirs(real, exist_ok=True)
    info = []
    for p in sorted(glob.glob(os.path.join(o.src, "*.png"))):
        try:
            im = Image.open(p).convert("RGBA")
        except Exception:  # noqa: BLE001
            continue
        a = np.asarray(im)[..., 3]
        b = content_box(a)
        if b is None:
            continue
        w, h = b[2] - b[0], b[3] - b[1]
        info.append((h / w, (w * h) / a.size, p, im))
    picks = []
    if info:
        info.sort(key=lambda r: r[0])
        k = min(o.n, len(info))
        idx = sorted({round(i * (len(info) - 1) / max(1, k - 1)) for i in range(k)})
        # 余白のいちばん多い絵（中身が小さい）も入れる。縮めて置くと箱いっぱいに広がるので、主役を隠しやすい
        roomy = min(range(len(info)), key=lambda i: info[i][1])
        if roomy not in idx:
            idx.append(roomy)
        picks = [info[i] for i in idx]
    shapes = {}
    for n, (ar, fill, p, im) in enumerate(picks):
        b = content_box(np.asarray(im)[..., 3])
        sh = shape_name(b[2] - b[0], b[3] - b[1])
        shapes[sh] = shapes.get(sh, 0) + 1
        im.save(os.path.join(real, f"r{n + 1:02d}-{sh}.png"))
    synth_chars(os.path.join(o.out, "synth"))
    synth_bg(os.path.join(o.out, "bg"))
    meta = {"real": len(picks), "pool": len(info), "shapes": shapes}
    json.dump(meta, open(os.path.join(o.out, "chars.json"), "w"), ensure_ascii=False)
    print(f"本物のキャラ絵 {len(picks)}人（落とせた {len(info)}人から。形 {shapes}）・形の見本 3つ・合成の地 2枚")


# ------------------------------------------------------------------ tier（1段を焼いて確かめる）
def run_tool(args, log):
    t = time.time()
    with open(log, "w", encoding="utf-8") as f:
        r = subprocess.run(args, stdout=f, stderr=subprocess.STDOUT, text=True, cwd=ROOT)
    txt = open(log, encoding="utf-8").read()
    print(f"$ {' '.join(os.path.relpath(a, ROOT) if a.startswith(ROOT) else a for a in args)}  → {r.returncode}（{time.time() - t:.0f}秒）")
    print(txt[-6000:])
    return r.returncode, time.time() - t, txt


def tail(txt, n=6):
    return [s for s in txt.strip().splitlines() if s.strip()][-n:]


def load(p):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def compare_to(old_dir, new_dir, names):
    """今の public の同じ名前の動画と比べる。返す: (要約, 本ごと)"""
    import numpy as np
    import fx_check
    rows = {}
    for nm in names:
        a, b = os.path.join(old_dir, nm), os.path.join(new_dir, nm)
        if not os.path.exists(a):
            rows[nm] = {"state": "new"}
            continue
        if open(a, "rb").read() == open(b, "rb").read():
            rows[nm] = {"state": "same"}
            continue
        fa, fb = fx_check.decode(a), fx_check.decode(b)
        if len(fa) != len(fb):
            rows[nm] = {"state": "frames", "old": len(fa), "new": len(fb)}
            continue
        mse, mx, moved = 0.0, 0, 0.0
        for x, y in zip(fa, fb):
            px, py = fx_check.premul(x), fx_check.premul(y)
            d = np.abs(px - py)
            mse += float((d ** 2).mean())
            mx = max(mx, int(round(float(d.max()) * 255)))
            moved += float((d.max(-1) > 2 / 255).mean())
        mse /= len(fa)
        rows[nm] = {"state": "diff", "psnr": round(min(99.0, 10 * np.log10(1 / max(mse, 1e-12))), 2), "max": mx,
                    "moved_pct": round(moved / len(fa) * 100, 3)}
    st = [r["state"] for r in rows.values()]
    if all(s == "same" for s in st):
        summ = "同じ"
    elif all(s == "new" for s in st):
        summ = "新しい段"
    else:
        diffs = [r for r in rows.values() if r["state"] == "diff"]
        if any(s == "frames" for s in st):
            summ = "コマ数が違う"
        elif diffs:
            w = min(diffs, key=lambda r: r["psnr"])
            summ = f"差 {w['psnr']:.1f}dB・最大 {w['max']}/255"
        else:
            summ = "一部が新しい"
    return summ, rows


def cmd_tier(o):
    t_all = time.time()
    tier = int(o.tier)
    script = scripts_of(o.theme)[tier]
    pub = os.path.join(ROOT, "public/alert/themes", o.theme, "fx")
    work = os.path.abspath(o.work)
    res = os.path.abspath(o.res)
    media = os.path.join(res, "media")
    place = os.path.join(res, "place")
    logs = os.path.join(res, "logs")
    for d in (media, place, logs):
        os.makedirs(d, exist_ok=True)
    stage = os.path.join(work, "stage")
    frames = os.path.join(work, "frames")
    shutil.rmtree(stage, ignore_errors=True)
    if os.path.isdir(pub):
        shutil.copytree(pub, stage)
    else:
        os.makedirs(stage)
    final = o.quality == "final"
    r = {"tier": tier, "theme": o.theme, "quality": o.quality, "script": script, "reasons": [], "ok": False, "placeable": False}
    py = sys.executable
    tools = lambda n: os.path.join(TOOLS, n)  # noqa: E731
    ffv = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[:1]
    r["ffmpeg"] = ffv[0].split(" Copyright")[0].replace("ffmpeg version ", "") if ffv else "?"

    # 1. 焼く（public の写しへ）
    jobs = str(os.cpu_count() or 2)
    bake = [py, os.path.abspath(__file__), "_bake", o.quality, "all", os.path.join(ROOT, script), "--work", frames,
            "--out", stage, "--jobs", jobs] + (["--keep"] if final else [])
    code, secs, txt = run_tool(bake, os.path.join(logs, "bake.txt"))
    r["secs"] = {"bake": round(secs)}
    if code != 0:
        r["reasons"].append("焼けなかった: " + " / ".join(tail(txt, 2)))
        return finish(r, res, t_all)
    names = []
    man = load(os.path.join(stage, "manifest.json")) or {}
    entry = man.get("tiers", {}).get(str(tier))
    if entry:
        for v in entry["variants"].values():
            for layer in ("back", "front"):
                if v.get(layer):
                    names += list(v[layer].values())

    # 2. 確かめる
    t = time.time()
    chk = [py, tools("fx_check.py"), stage, "--tiers", str(tier), "--script", f"{tier}={os.path.join(ROOT, script)}",
           "--work", f"{tier}={frames}", "--sheet", os.path.join(media, f"t{tier}-sheet.jpg"), "--json", os.path.join(res, "check.json")]
    code_c, _, txt_c = run_tool(chk, os.path.join(logs, "check.txt"))
    c = load(os.path.join(res, "check.json")) or {}
    ct = (c.get("tiers") or {}).get(str(tier), {})
    r["check"] = {"code": code_c, "bad": ct.get("bad", []), "bytes": ct.get("bytes", {}), "psnr": ct.get("psnr", {}),
                  "unchecked": c.get("unchecked")}
    if code_c != 0:
        r["reasons"] += ["fx_check: " + b for b in ct.get("bad", [])] or ["fx_check: " + (c.get("unchecked") or " / ".join(tail(txt_c, 2)))]

    old_has = str(tier) in ((load(os.path.join(pub, "manifest.json")) or {}).get("tiers") or {})
    if old_has:
        mot = [py, tools("fx_motion.py"), stage, "--old", pub, "--tiers", str(tier), "--min", "0", "--json", os.path.join(res, "motion.json")]
        run_tool(mot, os.path.join(logs, "motion.txt"))
        m = load(os.path.join(res, "motion.json")) or {}
        r["motion"] = (m.get("tiers") or {}).get(str(tier))

    hr = headroom_of(o.theme, tier)
    meta = load(os.path.join(o.chars, "chars.json")) or {}
    reals = sorted(glob.glob(os.path.join(o.chars, "real", "*.png")))
    synth = sorted(glob.glob(os.path.join(o.chars, "synth", "*.png")))
    hero = [py, tools("fx_hero.py"), os.path.join(ROOT, script), "--headroom", str(hr), "--chars", *reals, *synth,
            "--min", str(HERO_MIN), "--json", os.path.join(res, "hero.json")]
    code_h, _, txt_h = run_tool(hero, os.path.join(logs, "hero.txt"))
    h = load(os.path.join(res, "hero.json")) or {}
    r["hero"] = {"code": code_h, "visible": h.get("visible_min"), "chars": h.get("chars"), "real": len(reals),
                 "worst": h.get("worst"), "bad_frames": h.get("bad_frames"), "headroom": hr, "unchecked": h.get("unchecked")}
    if code_h != 0:
        r["reasons"] += ["fx_hero: " + b for b in (h.get("bad") or [])[:3]] or ["fx_hero: " + (h.get("unchecked") or " / ".join(tail(txt_h, 2)))]
        if (h.get("bad_frames") or 0) > 3:
            r["reasons"].append(f"fx_hero: ほか {h['bad_frames'] - 3} コマ")
    if len(reals) < REAL_MIN:
        r["reasons"].append(f"本物のキャラ絵が {len(reals)}人しか落とせなかった（{REAL_MIN}人から。落とせた {meta.get('pool', 0)}人）")
    r["secs"]["check"] = round(time.time() - t)

    # 3. 今の public と比べる
    if names:
        try:
            r["vs_public"], r["vs_public_files"] = compare_to(pub, stage, names)
        except Exception as e:  # noqa: BLE001
            r["vs_public"] = f"比べられなかった: {e}"

    # 4. 見る絵（形の見本だけ。本物のキャラ絵は git の枝に置かない）
    t = time.time()
    run_tool([py, tools("fx_hero.py"), os.path.join(ROOT, script), "--headroom", str(hr), "--chars", *synth, "--min", "0",
              "--sheet", os.path.join(media, f"t{tier}-hero.jpg")], os.path.join(logs, "hero-sheet.txt"))
    if entry:
        run_tool([py, tools("fx_review.py"), stage, "--tier", str(tier), "--bg", os.path.join(o.chars, "bg"), "--char", *synth,
                  "--reps", "1", "--out", os.path.join(media, f"t{tier}.mp4")], os.path.join(logs, "review.txt"))
    r["secs"]["media"] = round(time.time() - t)

    r["ok"] = not r["reasons"]
    if r["ok"] and final and entry:
        for nm in names:
            shutil.copy(os.path.join(stage, nm), os.path.join(place, nm))
        json.dump({"tier": str(tier), "entry": entry}, open(os.path.join(place, f"t{tier}-entry.json"), "w"), ensure_ascii=False)
        r["placeable"] = True
    return finish(r, res, t_all)


def finish(r, res, t_all):
    r["secs"] = {**r.get("secs", {}), "total": round(time.time() - t_all)}
    json.dump(r, open(os.path.join(res, f"result-t{r['tier']}.json"), "w"), ensure_ascii=False, indent=1)
    mark = "✅" if r["ok"] else "❌"
    print(f"段{r['tier']} {mark}  {r['secs']}")
    for x in r["reasons"]:
        print("  ✗", x)
    return 0


def cmd_bake(argv):
    """fx_stage.py をこの中で呼ぶ。preview は libvpx を速い設定にする（画質の段の探し方は同じ。public には置かない）"""
    quality, rest = argv[0], argv[1:]
    import fx_stage as fs
    if quality != "final":
        real_ff = fs.ff

        def fast(*args):
            a = list(args)
            for k, v in (("-deadline", "realtime"), ("-cpu-used", "6")):
                if k in a:
                    a[a.index(k) + 1] = v
            return real_ff(*a)
        fs.ff = fast
    sys.argv = ["fx_stage.py", *rest]
    fs.main()
    return 0


# ------------------------------------------------------------------ place（通った段だけ public へ）
def cmd_place(o):
    pub = os.path.join(ROOT, "public/alert/themes", o.theme, "fx")
    os.makedirs(pub, exist_ok=True)
    mp = os.path.join(pub, "manifest.json")
    man = load(mp) or {"tiers": {}}
    man.setdefault("tiers", {})
    placed, same = [], []
    for ej in sorted(glob.glob(os.path.join(o.art, "**", "t*-entry.json"), recursive=True)):
        e = load(ej)
        d = os.path.dirname(ej)
        changed = man["tiers"].get(e["tier"]) != e["entry"]
        for f in sorted(os.listdir(d)):
            if f.endswith(".webm"):
                dst = os.path.join(pub, f)
                if not (os.path.exists(dst) and open(dst, "rb").read() == open(os.path.join(d, f), "rb").read()):
                    changed = True
                    shutil.copy(os.path.join(d, f), dst)
        man["tiers"][e["tier"]] = e["entry"]
        (placed if changed else same).append(int(e["tier"]))
    man["tiers"] = dict(sorted(man["tiers"].items(), key=lambda kv: int(kv[0])))
    if placed:
        with open(mp, "w", encoding="utf-8") as f:
            json.dump(man, f, ensure_ascii=False, indent=2)
            f.write("\n")
    out(placed=",".join(str(t) for t in sorted(placed)), same=",".join(str(t) for t in sorted(same)))


# ------------------------------------------------------------------ digest（20行以内の表）
def fmt_secs(s):
    s = int(s or 0)
    return f"{s // 60}分{s % 60:02d}秒" if s >= 60 else f"{s}秒"


def cmd_digest(o):
    env = os.environ
    want = json.loads(env.get("TIERS") or "[]")
    rs = {}
    for p in glob.glob(os.path.join(o.res, "**", "result-t*.json"), recursive=True):
        x = load(p)
        if x:
            rs[str(x["tier"])] = x
    placed = set((env.get("PLACED") or "").split(",")) - {""}
    commit = env.get("COMMIT", "")
    same_only = set((env.get("SAME") or "").split(",")) - {""}
    total = int(time.time()) - int(env.get("START") or time.time())
    sha = (env.get("SHA") or "")[:7]
    head = (f"**段の動画を Actions で焼いた**（{env.get('THEME', '?')}・{env.get('QUALITY', '?')}・`{sha}`・"
            f"所要 {fmt_secs(total)}）[run]({env.get('RUN_URL', '')})")
    lines = [MARK, head, "",
             "| 段 | 判定 | 大きさ | PSNR | 動き | キャラ絵の見え | 今の public と | 置いた |",
             "|:-:|:-:|--:|--:|--:|--:|:--|:-:|"]
    fails = []
    bad_any = False
    for t in want:
        x = rs.get(str(t))
        if x is None:
            bad_any = True
            lines.append(f"| {t} | ❌ | — | — | — | — | — | — |")
            fails.append(f"- ❌ 段{t}: 結果が無い（焼く job が落ちた。run の頁の render-{t} の最後の step）")
            continue
        ok = x["ok"]
        bad_any |= not ok
        mb = sum((x.get("check") or {}).get("bytes", {}).values()) / 1e6
        ps = [v["median"] for v in (x.get("check") or {}).get("psnr", {}).values()]
        psnr = f"{min(ps):.1f}dB" if ps else "—"
        mo = x.get("motion")
        mov = f"{mo['ratio_pixels']:.2f}×" if mo else "—"
        h = x.get("hero") or {}
        real = h.get("real") or 0
        vis = (f"{h['visible'] * 100:.0f}%（本物{real}＋見本{(h.get('chars') or real) - real}）"
               if h.get("visible") is not None else "—")
        if str(t) in placed:
            pl = "✅"
        elif str(t) in same_only:
            pl = "同じ"
        else:
            pl = "—"
        lines.append(f"| {t} | {'✅' if ok else '❌'} | {mb:.2f}MB | {psnr} | {mov} | {vis} | {x.get('vs_public', '—')} | {pl} |")
        if not ok:
            rsn = x["reasons"]
            more = f"（ほか {len(rsn) - 1}件）" if len(rsn) > 1 else ""
            fails.append(f"- ❌ 段{t}: {rsn[0][:160]}{more}")
    # 表・外れの並び・下の2行のあいだは空けておく（空けないと、下の行が並びの最後の項目に吸われる）
    room = 20 - len(lines) - 1 - 1 - 2
    if len(fails) > room:
        fails = fails[:room - 1] + [f"- ほか {len(fails) - room + 1}段も❌（run の頁の render-<段> を見る）"]
    lines += [""] + fails + ([""] if fails else [])
    secs = "・".join(f"段{t} {fmt_secs((rs.get(str(t)) or {}).get('secs', {}).get('total'))}" for t in want if str(t) in rs)
    ffm = next((x.get("ffmpeg") for x in rs.values() if x.get("ffmpeg")), "?")
    media = env.get("MEDIA", "")
    where = f"一覧と録画: 枝 `{media}`（`t<段>-sheet.jpg`・`t<段>-hero.jpg`・`t<段>.mp4`）" if env.get("MEDIA_OK") == "1" else "一覧と録画: 置けなかった"
    put = f"・置いたコミット `{commit[:7]}`" if commit else ""
    lines.append(f"{where}{put}")
    lines.append(f"<sub>段ごとの所要 {secs or '—'}・ffmpeg {ffm}{('・' + env['NOTES']) if env.get('NOTES') else ''}</sub>")
    lines = lines[:20]
    txt = "\n".join(lines) + "\n"
    open(o.out, "w", encoding="utf-8").write(txt)
    print(txt)
    return 1 if bad_any or not want else 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "_bake":
        return cmd_bake(sys.argv[2:])
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("plan")
    c = sub.add_parser("chars")
    c.add_argument("--src", default="/tmp/avatars")
    c.add_argument("--out", required=True)
    c.add_argument("--n", type=int, default=12)
    t = sub.add_parser("tier")
    t.add_argument("--theme", required=True)
    t.add_argument("--tier", required=True)
    t.add_argument("--quality", default="final")
    t.add_argument("--chars", required=True)
    t.add_argument("--work", required=True)
    t.add_argument("--res", required=True)
    p = sub.add_parser("place")
    p.add_argument("--theme", required=True)
    p.add_argument("--art", required=True)
    d = sub.add_parser("digest")
    d.add_argument("--res", required=True)
    d.add_argument("--out", required=True)
    o = ap.parse_args()
    return {"plan": cmd_plan, "chars": cmd_chars, "tier": cmd_tier, "place": cmd_place, "digest": cmd_digest}[o.cmd](o) or 0


if __name__ == "__main__":
    sys.exit(main())
