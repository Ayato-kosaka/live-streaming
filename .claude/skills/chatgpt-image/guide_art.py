#!/usr/bin/env python3
"""**街のガイドの絵（表紙の横と縦・エリア地図・料理・土産）を、ChatGPT（EC2 の Chrome）に一括で描かせて面の置き場に出す。**

    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> plan [--all|--only 品…] [--json]
    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> run [--all|--only 品…] --work <スクラッチ>
    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> status
    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> fetch --work <スクラッチ>
    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> finalize --work <スクラッチ> [--out <置き場>]
    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> sheet --work <スクラッチ> [--with <国>/<街>]
    python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> check          # 頼み書きから manifest を作り直して、いまのと比べる
    python3 guide_art.py batch <jobs.json> <置き場>                           # EC2 の上（run が置いて起こす）

品は `cover` `cover_tall` `areamap` `food:<鍵>` `buy:<鍵>`。終了コード: 0=通った / 1=落ちた・違った / 2=見るものが無い。

## なぜ道具にしたか（あやと 2026-11-15「持続可能なトークン消費となるような作戦に」）

ソフィアとスコピエでは、担当が jobs.py・一括・finalize.py を街ごとに写して書き直し、ChatGPT を1枚ずつ見張った
（1人30万〜65万トークン）。スクラッチに置いた道具は次のセッションには無い。街ごとに変わるのは**頼み書き**
（`guide/<国>/<街>.json`。英語の描写・面に出す alt・地図の札の位置）だけなので、そこだけを街ごとに書き、
頼む文の型・EC2 の回しかた・書き出しの形はこの1本に持つ。

## 頼む文の型（ここに持つ。頼み書きには書かない）

- **字を入れない**（`NOTEXT`）。字は面の側で重ねる（`docs/guide-design.md` 4-2）。ChatGPT は札・看板・番号を描きたがる
- **トーン**は水彩・ガッシュ調、輪郭線なし（`PAINT`）。料理と土産は写真風の同じ卓・布巾・光（`FOOD_STYLE` `BUY_STYLE`）
- **手本の1枚を渡す**（`MATCH`）。料理と土産は、ソフィアの1枚目（ショプスカ・サラダ／バラのオイル）を全部の街に渡す。
  街ごとに手本を変えると、並べたときに街ごとにトーンが割れる。手本と同じ料理には別の手本（写し取らせないため）

## 頼み書きの欄（`guide/<国>/<街>.json`。ソフィア・スコピエのを写して書き換える）

- `ja`（会話の題に出す街の名前）・`items`（品をどこから読むか）・`ec2_dir`（EC2 の置き場）・`stitch`（布巾の刺繍の言葉）・`scene`（表紙の景色。英語）
- `cover` `cover_tall`: `alt`・`note`（manifest の prompt_note）・`bias`（16:9 に切るとき、上を 0 下を 1 としてどこを残すか）・`v`
- `areamap`: `prompt`（街の地図の文。目印の番号つき）・`fix`・`layout`（字の無い下敷き。`--work` の中）・`alt`・`note`・
  `areas`（札の位置 x・y は描けた絵を見て決める）・`bbox`・`beyond`（地図の外の行き先）・`base`・`v`
- `food` `buy`: `model`（手本 `<国>/<街>:<名前>`）・`note`・`items.<鍵>` = `desc`（英語の描写）・`alt`・`fix`・`v`・`model`・
  `ref`（見比べの参考写真の URL）か `wiki`（英語版 Wikipedia の記事名）

## 品の一覧と鍵

鍵は面のデータの `Item.id`。`guidebook.json`（eat.items / buy.items の key）か、それが無い街は面の TS（ソフィア）から読む。
頼み書きに描写の無い品があれば止める（黙って描かない品を作らない）。

## 済んだものを飛ばす・描き直す

- EC2 の一括は `<置き場>/<id>-0.png` が在る品を飛ばし、断り・時間切れ（1割ほど出る）を最後にもう1周で埋める
- `run` は既定で **manifest にまだ無い品だけ**を送る。描き直しは頼み書きの品の `v` を1つ上げて `--only` で指す
  （id が `cover2` `areamap4` のように変わるので、EC2 の前の絵に飛ばされない）
- finalize は持ち帰った絵が無い品を **manifest のまま残す**（1枚だけ描き直した日に、ほかを消さない）
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2] if len(HERE.parents) > 2 else HERE
SPECS = HERE / "guide"
EC2_TOOLS = "/home/ubuntu/cdp"
QUEUE = "/usr/local/sbin/ec2-queue"
UA = {"User-Agent": "Mozilla/5.0 (compatible; island-guide-research/1.0)"}

#: 見張りが偽物に差し替える（本物の EC2 に触らない）。None のときは ec2-chrome の ec2.py を読む
EC2 = None

# ---------------------------------------------------------------- 頼む文の型

NOTEXT = ("Absolutely no text anywhere: no letters, no numbers, no words, no labels, no signs with writing, no logos, "
          "no watermark.")
PAINT = ("Style: a warm, hand-painted illustration (gouache and watercolor look), cozy and cheerful like a storybook "
         "or the world of Nintendo's Animal Crossing. No black outlines: shapes are defined by color only. Very strong, "
         "soft ambient light; build volume with brightness differences rather than dark shadows. Colors bright AND "
         "saturated but gentle, never harsh. Smooth gradients and rounded, soft shapes; no hard square edges. Soft contact "
         "shadows under every object so nothing floats.")
# 表紙は面で 16:9・4:5 に切る。ChatGPT は 3:2・2:3 でしか描かないので、切る帯に大事なものを置かせない
WIDE = ("Draw a wide landscape illustration (3:2, 1536x1024). It will be cropped to 16:9, so keep everything important "
        "away from the top and bottom 10% of the image. Leave a calm, simple sky across the top third. ")
TALL = ("Draw a tall portrait illustration (2:3, 1024x1536). It will be cropped to 4:5, so keep everything important "
        "away from the top and bottom 9% of the image. Leave a calm, simple sky across the top third. ")
MAP_STYLE = ("Top-down bird's-eye view with icons gently tilted, like a picture map in a cozy travel guidebook. " + PAINT
             + " " + NOTEXT + " No compass letters, no legend, no title, no frame with writing.")
_TABLE = ("camera at a 45-degree overhead angle; the {what} centered and filling about 60% of the frame; a warm "
          "light-oak wooden table; a folded cream linen napkin with a thin red {stitch} cross-stitch border in the "
          "bottom-left corner")
FOOD_STYLE = ("A square 1:1 food photograph (1024x1024) for a travel guidebook series. Every image in the series uses this "
              "exact setup: " + _TABLE.format(what="food", stitch="{stitch}") + " and nothing else on the table unless "
              "described; soft natural daylight from the upper left, gentle soft shadows, bright and airy, warm cozy color "
              "grading; the far side of the table fades into a soft blur. Plain off-white stoneware dishes unless a "
              "traditional vessel is described. No hands, no people. " + NOTEXT)
BUY_STYLE = ("A square 1:1 product still-life photograph (1024x1024) for a travel guidebook series of souvenirs. Every "
             "image in the series uses this exact setup: " + _TABLE.format(what="objects", stitch="{stitch}") + "; soft "
             "natural daylight from the upper left, gentle soft shadows, bright and airy, warm cozy color grading; the far "
             "side of the table fades into a soft blur. No hands, no people. Bottles, jars, bags and boxes have NO labels "
             "or blank plain labels only. " + NOTEXT)
MATCH = ("The attached image is the reference for the whole series. Match it exactly in camera angle, distance, table, "
         "napkin, lighting and color grading. Only the subject changes: do NOT copy the food or objects from the "
         "reference. ")

#: 品の形。名前（ファイルの頭）・切る比・書き出す幅（大・小）
SHAPE = {"cover": ("cover", 16 / 9, (1600, 800)), "cover_tall": ("cover-tall", 4 / 5, (1600, 800)),
         "areamap": ("areamap", 1.0, (800, 400))}
ITEM_SIZES = (800, 400)
WHAT = {"cover": "表紙・横", "cover_tall": "表紙・縦", "areamap": "エリア地図", "food": "料理", "buy": "土産"}


def die(msg: str, code: int = 2):
    print(f"✕ {msg}")
    sys.exit(code)


# ---------------------------------------------------------------- 頼み書きと品の一覧

def load_spec(city: str, spec_path: str | None = None) -> dict:
    p = Path(spec_path) if spec_path else SPECS / f"{city}.json"
    if not p.is_file():
        die(f"頼み書きが無い: {p}（ソフィアかスコピエのを写して、街の描写に書き換える）")
    spec = json.loads(p.read_text(encoding="utf-8"))
    spec["_city"] = city
    return spec


def ts_slug(s: str) -> str:
    """面（bulgaria-sofia.ts の slug）と同じ形。料理の id は roman の `/` を空白に寄せてから作る"""
    s = " ".join(x.strip() for x in s.split("/"))
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def ts_rows(path: Path, const: str) -> list[dict]:
    """`export const <const> = [ … ] as const;` の1行1品から、字の欄だけを拾う"""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"export const " + re.escape(const) + r" = \[\n(.*?)\n\] as const;", text, re.S)
    if not m:
        die(f"{path} に {const} が無い（面の形が変わった）")
    rows = []
    for line in m.group(1).splitlines():
        if line.strip().startswith("{"):
            rows.append(dict(re.findall(r'(\w+): "((?:[^"\\]|\\.)*)"', line)))
    return rows


def ts_map(path: Path, const: str) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"const " + re.escape(const) + r"[^=]*= \{\n(.*?)\n\};", text, re.S)
    if not m:
        die(f"{path} に {const} が無い（面の形が変わった）")
    return dict(re.findall(r'"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)"', m.group(1)))


def items_of(spec: dict, root: Path) -> dict[str, list[tuple[str, str]]]:
    """{"food": [(鍵, 名前)], "buy": […]}。並びは面のデータの並び（manifest もこの並びで書く）"""
    src = spec["items"]
    if "guidebook" in src:
        g = json.loads((root / src["guidebook"]).read_text(encoding="utf-8"))
        return {"food": [(it["key"], it["name"]) for it in g["eat"]["items"]],
                "buy": [(it["key"], it["name"]) for it in g["buy"]["items"]]}
    out = {}
    for sec in ("food", "buy"):
        s = src[sec]
        rows = ts_rows(root / s["ts"], s["const"])
        if s["id"].startswith("slug:"):
            out[sec] = [(ts_slug(r[s["id"][5:]]), r[s["name"]]) for r in rows]
        else:
            f, _, c = s["id"][4:].partition("#")
            idmap = ts_map(root / f, c)
            missing = [r[s["name"]] for r in rows if r[s["name"]] not in idmap]
            if missing:
                die(f"{f} の {c} に id の無い品: {missing}")
            out[sec] = [(idmap[r[s["name"]]], r[s["name"]]) for r in rows]
    return out


def out_dir(spec: dict, root: Path) -> Path:
    return root / "site/public/guide" / spec["_city"]


def url_dir(spec: dict) -> str:
    return f"/guide/{spec['_city']}/"


def ec2_dir(spec: dict) -> str:
    return spec.get("ec2_dir") or f"/home/ubuntu/chatgpt/{spec['_city'].split('/')[1]}"


def model_file(ref: str, root: Path) -> Path:
    """手本 `<国>/<街>:<名前>` → 面の置き場の大きいほうの webp"""
    city, _, name = ref.partition(":")
    return root / "site/public/guide" / city / f"{name}-{ITEM_SIZES[0]}.webp"


# ---------------------------------------------------------------- 組む

def slots(spec: dict, root: Path) -> list[dict]:
    """描く品を全部。1品＝1つの dict（id・頼む文・渡す絵・面に出す字）"""
    items = items_of(spec, root)
    ja = spec["ja"]
    out = []
    for slot in ("cover", "cover_tall", "areamap"):
        s = spec[slot]
        if slot == "areamap":
            prompt = s.get("fix", "") + s["prompt"] + " " + MAP_STYLE
            files = [("layout", s["layout"])]
        else:
            prompt = s.get("fix", "") + (WIDE if slot == "cover" else TALL) + spec["scene"] + PAINT + " " + NOTEXT
            files = []
        out.append({"slot": slot, "sec": None, "key": slot, "name": SHAPE[slot][0], "base": slot,
                    "v": s.get("v", 1), "prompt": prompt, "refs": files, "label": WHAT[slot],
                    "alt": s["alt"], "note": s["note"], "bias": s.get("bias", 0.5)})
    for sec in ("food", "buy"):
        sp = spec[sec]
        missing = [k for k, _ in items[sec] if k not in sp["items"]]
        if missing:
            die(f"頼み書きの {sec} に描写の無い品: {missing}（面のデータに品が足された。描写と alt を書き足す）")
        style = (FOOD_STYLE if sec == "food" else BUY_STYLE).format(stitch=spec.get("stitch", "Balkan"))
        for k, name in items[sec]:
            it = sp["items"][k]
            model = it.get("model", sp.get("model"))
            if model == f"{spec['_city']}:{sec}-{k}":
                model = None   # 手本そのもの（その街のシリーズの1枚目）には手本を渡さない
            prompt = (MATCH if model else "") + style + " Subject: " + it.get("fix", "") + it["desc"]
            out.append({"slot": f"{sec}:{k}", "sec": sec, "key": k, "name": f"{sec}-{k}", "base": f"{sec}-{k}",
                        "v": it.get("v", 1), "prompt": prompt, "refs": [("model", model)] if model else [],
                        "label": f"{WHAT[sec]} {name.split('（')[0]}", "alt": it["alt"], "note": it.get("note", sp["note"]),
                        "bias": 0.5, "item": it, "item_name": name})
    for s in out:
        s["id"] = s["base"] + (str(s["v"]) if s["v"] > 1 else "")
        s["title"] = f"{time.strftime('%Y-%m-%d')} {'新しく描く' if s['v'] == 1 else '描き直し'}：{ja}の{s['label']}（街のガイドの面）"
    return out


def read_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def drawn(man: dict, s: dict, out: Path) -> bool:
    """manifest に載っていて、絵のファイルも在るか"""
    e = man.get(s["sec"], {}).get(s["key"]) if s["sec"] else man.get(s["key"])
    return bool(e) and (out / Path(e["src"]).name).is_file()


def select(spec: dict, root: Path, work: Path | None, only=None, all_=False) -> list[dict]:
    """送る品。既定は manifest にまだ無い品だけ。渡す絵が手元に無い品は `why` を付けて後回し"""
    out = out_dir(spec, root)
    man = read_manifest(out / "manifest.json")
    picked = []
    names = set(only or [])
    for s in slots(spec, root):
        if names and s["slot"] not in names and s["id"] not in names:
            continue
        if not names and not all_ and drawn(man, s, out):
            continue
        s = dict(s)
        s["files"] = []
        for kind, ref in s["refs"]:
            if kind == "layout":
                local = Path(ref) if os.path.isabs(ref) else (work or Path(".")) / ref
                remote = f"{ec2_dir(spec)}/in/{Path(ref).name}"
            else:
                local = model_file(ref, root)
                remote = f"{ec2_dir(spec)}/in/model-{ref.replace('/', '-').replace(':', '-')}.png"
            if not local.is_file():
                s["why"] = (f"下敷きが無い（{local}）" if kind == "layout"
                            else f"手本がまだ無い（{ref}。手本を finalize してから、もう一度 run）")
            s["files"].append((str(local), remote))
        picked.append(s)
    if names - {s["slot"] for s in picked} - {s["id"] for s in picked}:
        die(f"知らない品: {sorted(names - {s['slot'] for s in picked} - {s['id'] for s in picked})}")
    return picked


def jobs_json(picked: list[dict]) -> list[dict]:
    """EC2 の一括に渡す形（batch が読む）"""
    return [{"id": s["id"], "prompt": s["prompt"], "title": s["title"], "files": [r for _, r in s["files"]]}
            for s in picked if not s.get("why")]


# ---------------------------------------------------------------- EC2

def ec2():
    global EC2
    if EC2 is None:
        sys.path.insert(0, str(HERE.parent / "ec2-chrome"))
        import ec2 as real  # noqa: E402
        EC2 = real
    return EC2


def who(spec: dict) -> str:
    return "guide-art-" + spec["_city"].split("/")[1]


def run(spec: dict, root: Path, work: Path, only=None, all_=False) -> int:
    picked = select(spec, root, work, only, all_)
    later = [s for s in picked if s.get("why")]
    jobs = jobs_json(picked)
    for s in later:
        print(f"後回し {s['slot']}: {s['why']}")
    if not jobs:
        print("送る品が無い（manifest に全部ある。描き直しは頼み書きの v を上げて --only で）")
        return 0 if not later else 2
    e = ec2()
    D = ec2_dir(spec)
    work.mkdir(parents=True, exist_ok=True)
    jf = work / "jobs.json"
    jf.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    e.ensure_running()
    # 道具は毎回置き直す（EC2 の版が古いまま回さない。cdp.py は EC2 のほうが新しければ ec2.put が置かない）
    e.put(str(HERE.parent / "ec2-chrome" / "cdp.py"), f"{EC2_TOOLS}/cdp.py")
    e.put(str(HERE.parent / "chatgpt" / "chatgpt.py"), f"{EC2_TOOLS}/chatgpt.py")
    e.put(str(HERE / "chatgpt_image.py"), f"{EC2_TOOLS}/chatgpt_image.py")
    e.put(str(HERE / "guide_art.py"), f"{EC2_TOOLS}/guide_art.py")
    conv = []
    for s in picked:
        for local, remote in ([] if s.get("why") else s["files"]):
            if remote.endswith(".png") and local.endswith(".webp"):
                # 手本は面の webp を送って EC2 で PNG に直す（PNG で送ると SSM の片が10倍になる）
                e.put(local, remote[:-4] + ".webp")
                conv.append((remote[:-4] + ".webp", remote))
            else:
                e.put(local, remote)
    e.put(str(jf), f"{D}/jobs.json")
    alias = "".join(f"[ -f {D}/{old}-0.png ] && [ ! -f {D}/{new}-0.png ] && cp {D}/{old}-0.png {D}/{new}-0.png\n"
                    for new, old in spec.get("ec2_alias", {}).items())
    sh = (f"mkdir -p {D}/in\n"
          f"python3 -c 'import sys; from PIL import Image; a=sys.argv[1:]; "
          f"[Image.open(a[i]).convert(\"RGB\").save(a[i+1]) for i in range(0, len(a), 2)]' "
          + " ".join(f"{a} {b}" for a, b in conv) + "\n" + alias +
          f"rm -f {D}/DONE-jobs.json\n"
          f"nohup {QUEUE} hold chatgpt --who {who(spec)} --purpose 'guide art {spec['_city']} {len(jobs)}' -- "
          f"python3 {EC2_TOOLS}/guide_art.py batch {D}/jobs.json {D} > {D}/log-jobs.txt 2>&1 &\n"
          f"sleep 8\n{QUEUE} list 2>&1 | tail -3\ntail -3 {D}/log-jobs.txt\n")
    st, out = e.run(sh, 120, quiet=True)
    print(out.strip()[-600:])
    print(f"送った {len(jobs)}件（1件 1.5〜5分）。待つのは send_later で。様子は `status`、終わったら `fetch`")
    return 0 if st == "Success" else 1


STATUS_PY = r'''
import json, os, sys
D = sys.argv[1]
jobs = json.load(open(D + "/jobs.json"))
st = json.load(open(D + "/status.json")) if os.path.exists(D + "/status.json") else {}
print("DONE" if os.path.exists(D + "/DONE-jobs.json") else "RUNNING")
for j in jobs:
    s = st.get(j["id"])
    ok = os.path.exists(f"{D}/{j['id']}-0.png")
    print(j["id"], "ok" if ok else ("ng " + (s.get("error") or s.get("text") or "")[:100].replace("\n", " ") if s else "wait"))
'''


def status(spec: dict) -> int:
    D = ec2_dir(spec)
    st, out = ec2().run(f"python3 - {D} <<'PY'\n{STATUS_PY}\nPY\n", 60, quiet=True)
    lines = out.strip().splitlines()
    if not lines or lines[0] not in ("DONE", "RUNNING"):
        print(out.strip()[-400:])
        return 1
    rows = [ln.split(" ", 2) for ln in lines[1:]]
    n = {k: sum(1 for r in rows if r[1] == k) for k in ("ok", "ng", "wait")}
    print(f"{lines[0]}: 描けた {n['ok']} / 断り・失敗 {n['ng']} / まだ {n['wait']}")
    for r in rows:
        if r[1] == "ng":
            print(f"  ng {r[0]}: {r[2] if len(r) > 2 else ''}")
    return 0


PACK_PY = r'''
import os, sys, tarfile
from PIL import Image
D, ids = sys.argv[1], sys.argv[2:]
os.makedirs(D + "/pack", exist_ok=True)
for f in os.listdir(D + "/pack"):
    os.remove(D + "/pack/" + f)
n = 0
for i in ids:
    p = f"{D}/{i}-0.png"
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGB")
    if not i.startswith("cover"):
        # 料理・土産・地図は 800 角までしか使わない。持ち帰る量を減らすため、ここで真ん中を切って 800 に落とす
        s = min(im.size)
        im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2))
        im = im.resize((800, 800), Image.LANCZOS)
    im.save(f"{D}/pack/{i}-0.webp", "WEBP", quality=92, method=4)
    n += 1
with tarfile.open(D + "/pack.tar", "w") as t:
    for f in sorted(os.listdir(D + "/pack")):
        t.add(D + "/pack/" + f, arcname=f)
print("PACKED", n)
'''


def fetch(spec: dict, root: Path, work: Path, only=None) -> int:
    """EC2 で描けた絵のうち、手元にまだ無いものを持ち帰る。どれを、は --only → この置き場で最後に送った
    jobs.json → manifest にまだ無い品、の順に決める（描き直し1枚のために、描いてある30枚を運び直さない）"""
    raw = work / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    sent = work / "jobs.json"
    if only:
        ids = [s["id"] for s in select(spec, root, work, only)]
    elif sent.is_file():
        ids = [j["id"] for j in json.loads(sent.read_text(encoding="utf-8"))]
    else:
        ids = [s["id"] for s in select(spec, root, work)]
    want = [i for i in ids if not any((raw / f"{i}-0{e}").is_file() for e in (".png", ".webp"))]
    if not want:
        print("持ち帰るものが無い（手元に全部ある）")
        return 0
    D = ec2_dir(spec)
    st, out = ec2().run(f"python3 - {D} {' '.join(want)} <<'PY'\n{PACK_PY}\nPY\n", 300, quiet=True)
    m = re.search(r"PACKED (\d+)", out)
    if not m:
        print(out.strip()[-400:])
        return 1
    if m.group(1) == "0":
        print("EC2 にも、まだ描けた絵が無い")
        return 2
    tar = work / "pack.tar"
    ec2().get(f"{D}/pack.tar", str(tar))
    import tarfile
    with tarfile.open(tar) as t:
        t.extractall(raw, filter="data")
    tar.unlink()
    print(f"持ち帰った {m.group(1)}件 → {raw}")
    return 0


# ---------------------------------------------------------------- 書き出す

def crop(im, ratio: float, bias: float = 0.5):
    w, h = im.size
    if abs(w / h - ratio) < 0.005:
        return im
    if w / h > ratio:
        nw = round(h * ratio)
        x = round((w - nw) * bias)
        return im.crop((x, 0, x + nw, h))
    nh = round(w / ratio)
    y = round((h - nh) * bias)
    return im.crop((0, y, w, y + nh))


def raw_of(work: Path | None, id: str) -> Path | None:
    if work is None:
        return None
    return next((p for e in (".png", ".webp") if (p := work / "raw" / f"{id}-0{e}").is_file()), None)


def entry(s: dict, spec: dict) -> dict:
    """面に出す字の欄（絵の欄は別）。並びは今の manifest と同じ"""
    e = {"alt": s["alt"], "kind": "ai", "prompt_note": s["note"]}
    if s["slot"] == "areamap":
        a = spec["areamap"]
        for k in ("areas", "bbox", "beyond", "base"):
            if k in a:
                e[k] = a[k]
    return e


def finalize(spec: dict, root: Path, work: Path | None, out: Path | None = None) -> tuple[dict, list[str]]:
    from PIL import Image
    out = out or out_dir(spec, root)
    out.mkdir(parents=True, exist_ok=True)
    old = read_manifest(out / "manifest.json")
    man: dict = {}
    missing = []
    for s in slots(spec, root):
        name, ratio, sizes = SHAPE.get(s["slot"], (s["name"], 1.0, ITEM_SIZES))
        src = raw_of(work, s["id"])
        prev = (old.get(s["sec"], {}) if s["sec"] else old).get(s["key"])
        if src is not None:
            im = crop(Image.open(src).convert("RGB"), ratio, s["bias"])
            pics = []
            for w in sizes:
                h = round(im.height * w / im.width)
                p = out / f"{name}-{w}.webp"
                im.resize((w, h), Image.LANCZOS).save(p, "WEBP", quality=84, method=6)
                pics.append((url_dir(spec) + p.name, w, h))
            pic = {"src": pics[0][0], "src_small": pics[1][0], "w": pics[0][1], "h": pics[0][2]}
        elif prev and (out / Path(prev["src"]).name).is_file():
            # 持ち帰った絵が無い品は、いまの絵のまま残す（字の欄だけ頼み書きに合わせる）
            pic = {k: prev[k] for k in ("src", "src_small", "w", "h")}
        else:
            missing.append(s["slot"])
            continue
        e = {**pic, **entry(s, spec)}
        if s["sec"]:
            man.setdefault(s["sec"], {})[s["key"]] = e
        else:
            man[s["key"]] = e
    for sec in ("food", "buy"):
        man.setdefault(sec, {})
    # 鍵の並びは今の形（表紙・縦・地図・料理・土産）にそろえる。面は並びを見ないが、差分を小さくする
    man = {k: man[k] for k in ("cover", "cover_tall", "areamap", "food", "buy") if k in man}
    (out / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return man, missing


def diff(a, b, path="") -> list[str]:
    """2つの manifest の違い（どこが・どう）。値そのものは短く"""
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in list(a) + [k for k in b if k not in a]:
            if k not in b:
                out.append(f"{path}/{k}: 作り直したほうにだけ在る")
            elif k not in a:
                out.append(f"{path}/{k}: いまの manifest にだけ在る")
            else:
                out += diff(a[k], b[k], f"{path}/{k}")
        return out
    if a != b:
        return [f"{path}: {json.dumps(a, ensure_ascii=False)[:60]} ≠ {json.dumps(b, ensure_ascii=False)[:60]}"]
    return []


def check(spec: dict, root: Path, manifest: Path | None = None) -> int:
    """いまの絵（面の置き場の大きいほうの webp）を持ち帰った絵に見立てて finalize し、いまの manifest と比べる。
    頼み書きが manifest を作り直せるか（品の鍵・欄・字）を、EC2 を使わずに見る"""
    src = out_dir(spec, root)
    cur = read_manifest(manifest or src / "manifest.json")
    if not cur:
        print("✕ 比べる manifest が無い")
        return 2
    want = {f"{s['sec']}:{s['key']}" if s["sec"] else s["key"] for s in slots(spec, root)}
    have = {k for k in ("cover", "cover_tall", "areamap") if k in cur}
    have |= {f"{sec}:{k}" for sec in ("food", "buy") for k in cur.get(sec, {})}
    with tempfile.TemporaryDirectory(prefix="guide-art-check-") as tmp:
        work, out = Path(tmp) / "work", Path(tmp) / "out"
        (work / "raw").mkdir(parents=True)
        for s in slots(spec, root):
            e = (cur.get(s["sec"], {}) if s["sec"] else cur).get(s["key"])
            if e and (src / Path(e["src"]).name).is_file():
                shutil.copy(src / Path(e["src"]).name, work / "raw" / f"{s['id']}-0.webp")
        man, missing = finalize(spec, root, work, out)
    bad = [f"品の鍵: 頼み書きにだけ {sorted(want - have)}" if want - have else "",
           f"品の鍵: manifest にだけ {sorted(have - want)}" if have - want else ""]
    bad = [b for b in bad if b] + diff(man, cur)
    print(f"{spec['_city']}: 品 {len(want)}（表紙2・地図・料理 {len(man.get('food', {}))}・土産 {len(man.get('buy', {}))}）"
          f" / 違い {len(bad)}")
    for b in bad[:20]:
        print("  " + b)
    return 1 if bad else 0


# ---------------------------------------------------------------- 見比べの1枚

def ref_url(spec: dict, root: Path, s: dict) -> str | None:
    """参考写真。頼み書きの ref → guidebook.json の photo → 面の写真の表 → Wikipedia の記事の頭の絵"""
    it = s["item"]
    if it.get("ref"):
        return it["ref"]
    src = spec["items"]
    if "guidebook" in src:
        g = json.loads((root / src["guidebook"]).read_text(encoding="utf-8"))
        for x in g["eat" if s["sec"] == "food" else "buy"]["items"]:
            th = (x.get("photo") or {}).get("thumbs") or {}
            if x["key"] == s["key"] and (th.get("500") or th.get("250")):
                return th.get("500") or th.get("250")
    if spec.get("photos"):
        ph = json.loads((root / spec["photos"]).read_text(encoding="utf-8"))
        u = (ph.get(s["sec"], {}).get(s["item_name"]) or {}).get("thumb")
        if u:
            return u
    if it.get("wiki"):
        u = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(it["wiki"].replace(" ", "_"))
        d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
        t = (d.get("thumbnail") or {}).get("source")
        # Wikimedia のサムネイルは決まった幅しか返さない（CLAUDE.md）。500 に寄せる
        return re.sub(r"/(\d+)px-", "/500px-", t) if t else None
    return None


def sheet(spec: dict, root: Path, work: Path, mix: dict | None = None) -> int:
    """参考写真と描いた絵を上下に並べた1枚（sheet-items.png）と、描いた絵だけを並べた1枚（sheet-tone.png）"""
    from PIL import Image
    out = out_dir(spec, root)
    ref, art = work / "cmp" / "ref", work / "cmp" / "art"
    for d in (ref, art):
        d.mkdir(parents=True, exist_ok=True)
    items = [s for s in slots(spec, root) if s["sec"]]
    names = []
    for s in items:
        a = out / f"{s['name']}-{ITEM_SIZES[1]}.webp"
        if not a.is_file():
            continue
        names.append(s["name"])
        Image.open(a).convert("RGB").save(art / f"{s['name']}.png")
        r = work / "ref" / f"{s['name']}.jpg"
        if not r.is_file():
            for i in range(4):
                try:
                    u = ref_url(spec, root, s)
                    if u:
                        r.parent.mkdir(parents=True, exist_ok=True)
                        r.write_bytes(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
                    break
                except OSError:
                    time.sleep(3 + 3 * i)
        if r.is_file():
            Image.open(r).convert("RGB").save(ref / f"{s['name']}.png")
    if not names:
        print("✕ 並べる絵が無い（finalize がまだ）")
        return 2
    one = work / "sheet-items.png"
    subprocess.run([sys.executable, str(root / "tools/sprites/sheet.py"), str(one), f"ref={ref}", f"art={art}",
                    "--", *names], check=True, capture_output=True)
    arts = [out / f"{n}-{ITEM_SIZES[1]}.webp" for n in names]
    if mix:
        # ほかの街と交互に混ぜる（街ごとにトーンが割れていないかを見る）
        mo = out_dir(mix, root)
        others = [mo / f"{s['name']}-{ITEM_SIZES[1]}.webp" for s in slots(mix, root) if s["sec"]]
        others = [p for p in others if p.is_file()]
        arts = [p for pair in zip(arts, others + [None] * len(arts)) for p in pair if p]
    per, c = 8, 220
    tone = Image.new("RGB", (per * c, ((len(arts) + per - 1) // per) * c), (238, 232, 210))
    for i, p in enumerate(arts):
        tone.paste(Image.open(p).convert("RGB").resize((c - 6, c - 6), Image.LANCZOS), ((i % per) * c + 3, (i // per) * c + 3))
    tone.save(work / "sheet-tone.png")
    print(f"見比べ: {one}（{len(names)}品）\nトーン: {work / 'sheet-tone.png'}")
    return 0


# ---------------------------------------------------------------- EC2 の上の一括

def batch(jobs_path: str, out: str, make=None, rounds: int = 2) -> dict:
    """jobs.json を1件ずつ ChatGPT に描かせる。`<out>/<id>-0.png` が在る品は飛ばす。
    様子は `<out>/status.json` に書く（SSM を握ったまま待たない）。最後に `<out>/DONE-<jobs の名前>`"""
    if make is None:
        sys.path.insert(0, EC2_TOOLS)
        from chatgpt_image import make  # noqa: E402
    jobs = json.loads(Path(jobs_path).read_text(encoding="utf-8"))
    os.makedirs(out, exist_ok=True)
    st_path = os.path.join(out, "status.json")
    done = os.path.join(out, "DONE-" + os.path.basename(jobs_path))
    if os.path.exists(done):
        os.remove(done)
    st = json.loads(Path(st_path).read_text()) if os.path.exists(st_path) else {}

    def save():
        Path(st_path + ".new").write_text(json.dumps(st, ensure_ascii=False, indent=1))
        os.replace(st_path + ".new", st_path)

    stop = False
    for rnd in range(rounds):  # 断り・時間切れは1割ほど出る。最後にもう1周して埋める
        for j in jobs:
            pre = os.path.join(out, j["id"])
            if os.path.exists(pre + "-0.png"):
                continue
            try:
                r = make(j["prompt"], pre, j["title"], j.get("files", []), timeout=900)
                st[j["id"]] = {"ok": bool(r["images"]), "url": r["url"], "seconds": r["seconds"],
                               "text": r["text"][:300], "n": len(r["images"]), "round": rnd}
            except SystemExit as e:
                st[j["id"]] = {"ok": False, "error": str(e)[:400], "round": rnd}
                # ログインが切れた・プロジェクトの外、は何件回しても同じ。残りを回さずに止める
                if "ログイン" in str(e) or "プロジェクト" in str(e):
                    stop = True
            except Exception as e:  # noqa: BLE001 — 1件の落ちで一括を止めない
                st[j["id"]] = {"ok": False, "error": repr(e)[:400], "round": rnd}
            save()
            if stop:
                break
        if stop:
            break
    Path(done).write_text(time.strftime("%Y-%m-%dT%H:%M:%S"))
    return st


# ---------------------------------------------------------------- 入口

def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] == ["batch"]:
        if len(argv) != 3:
            die("batch <jobs.json> <置き場>")
        batch(argv[1], argv[2])
        return 0
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("city", help="<国>/<街>（site/public/guide の下の道）")
    ap.add_argument("cmd", choices=["plan", "run", "status", "fetch", "finalize", "sheet", "check"])
    ap.add_argument("--only", nargs="*", help="品（cover・areamap・food:<鍵>…）か id")
    ap.add_argument("--all", action="store_true", help="manifest に在る品も")
    ap.add_argument("--json", action="store_true", help="plan: EC2 に渡す jobs.json をそのまま出す")
    ap.add_argument("--work", help="スクラッチの置き場（下敷き・持ち帰った絵・見比べ）")
    ap.add_argument("--out", help="finalize の書き出し先（既定は site/public/guide/<国>/<街>）")
    ap.add_argument("--with", dest="mix", help="sheet: トーンを見比べるほかの街")
    ap.add_argument("--manifest", help="check: 比べる manifest（既定は面の置き場の）")
    ap.add_argument("--spec", help="頼み書きの道（既定は guide/<国>/<街>.json）")
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args(argv)
    root = Path(a.root)
    spec = load_spec(a.city, a.spec)
    work = Path(a.work) if a.work else None
    if a.cmd in ("run", "fetch", "sheet") and work is None:
        die(f"{a.cmd} には --work（スクラッチの置き場）が要る")
    if a.cmd == "plan":
        picked = select(spec, root, work, a.only, a.all or not a.only)
        if a.json:
            print(json.dumps(jobs_json(picked), ensure_ascii=False, indent=1))
            return 0
        man = read_manifest(out_dir(spec, root) / "manifest.json")
        for s in picked:
            mark = "描いてある" if drawn(man, s, out_dir(spec, root)) else "まだ"
            print(f"{s['slot']:<28} {s['id']:<26} {mark:<6} 文 {len(s['prompt']):>5}字 渡す絵 {len(s['files'])}"
                  + (f"  後回し: {s['why']}" if s.get("why") else ""))
        print(f"{len(picked)}品（料理 {sum(1 for s in picked if s['sec'] == 'food')}・土産 "
              f"{sum(1 for s in picked if s['sec'] == 'buy')}）")
        return 0 if picked else 2
    if a.cmd == "run":
        return run(spec, root, work, a.only, a.all)
    if a.cmd == "status":
        return status(spec)
    if a.cmd == "fetch":
        return fetch(spec, root, work, a.only)
    if a.cmd == "finalize":
        man, missing = finalize(spec, root, work, Path(a.out) if a.out else None)
        print(f"manifest: 表紙・地図 {sum(1 for k in SHAPE if k in man)} / 料理 {len(man['food'])} / 土産 {len(man['buy'])}"
              f" / 無い: {missing or 'なし'}")
        return 0 if not missing else 1
    if a.cmd == "sheet":
        return sheet(spec, root, work, load_spec(a.mix) if a.mix else None)
    return check(spec, root, Path(a.manifest) if a.manifest else None)


if __name__ == "__main__":
    sys.exit(main())
