#!/usr/bin/env python3
"""`guide_art.py`（街のガイドの絵の一括）の見張り。**本物の EC2 にも ChatGPT にもネットワークにも触らない。**

    python3 .claude/skills/chatgpt-image/guide_art_selftest.py

空の置き場に、街を1つ（guidebook.json の街）と面の TS から品を読む街を1つこしらえ、EC2 は偽物に差し替えて回す。
本物の頼み書き（`guide/<国>/<街>.json`）といまの manifest の突き合わせは、ここでは見ない——面のデータに品が
足された日に、関係の無い PR が赤くなるから。そちらは `guide_art.py <国>/<街> check` で見る。

見る足:
 1. 組む: 品の id・版（v2 → `cover2`）・字を入れない・料理と土産に布を描かせない・手本を渡す品にだけ MATCH・手本そのものには渡さない・題
 2. 面の TS から品を読む（roman の slug・BUY_ID の表）。描写の無い品・id の無い品は止める
 3. 送る品の選び: 既定は manifest に無い品だけ・--only・手本や下敷きが無い品は後回し・知らない品は止める
 4. run: 道具と渡す絵を置き、手本の webp を PNG に直し、札（ec2-queue hold chatgpt）の中で一括を起こす。後回しは送らない
 5. status / fetch: EC2 の答えを数える。手元に在るものは取りに行かない
 6. finalize: 寸法・切りかた・鍵と欄の並び・持ち帰っていない品は manifest のまま残す・無い品を数える
 7. check: 作り直した manifest が同じなら 0、字が1つ違えば 1
 8. EC2 の一括: 済んだ品を飛ばす・落ちた品を2周目で埋める・ログイン切れで止める・DONE を書く
 9. 見比べの1枚: 参考写真と描いた絵を並べる（参考写真は手元に置いたもの。取りに行かない）
10. やりたいこと（do）: 見出しは横と縦を別々に・ほかは1枚を 4:3 と 1:1 に・表紙の手本と建物の写真の渡しかた・
    EC2 で切らずに持ち帰る・欄の形・持ち帰っていない形を残す・欠けた品は載せない・check・見比べ
"""
from __future__ import annotations

import importlib.util
import io
import json
import shutil
import sys
import tarfile
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
spec_ = importlib.util.spec_from_file_location("guide_art", HERE / "guide_art.py")
ga = importlib.util.module_from_spec(spec_)
spec_.loader.exec_module(ga)

from PIL import Image  # noqa: E402

FAILS: list[str] = []
N = 0


def ok(cond, what):
    global N
    N += 1
    if not cond:
        FAILS.append(what)
        print(f"  ✕ {what}")


def quiet(fn, *a, **k):
    """標準出力を握って呼ぶ。止めた（SystemExit）ときは (None, 終了コード, 出力)"""
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            return fn(*a, **k), None, buf.getvalue()
    except SystemExit as e:
        return None, e.code, buf.getvalue()


def png(path: Path, size, color=(200, 120, 60)):
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", size, color)
    # 切りかたが分かるように、左上に印を置く。高さは 3:2 → 16:9 で上下に切る帯（1/12 ずつ）より低くする
    im.paste((10, 10, 10), (0, 0, size[0] // 8, size[1] // 16))
    im.save(path)


class FakeEC2:
    def __init__(self, root: Path):
        self.root = root
        self.calls: list[tuple] = []
        self.answers: list[str] = []
        self.tar: list[str] = []

    def ensure_running(self):
        self.calls.append(("start",))

    def put(self, local, remote):
        self.calls.append(("put", local, remote))
        return True

    def run(self, script, timeout=600, quiet=False):
        self.calls.append(("run", script))
        return "Success", (self.answers.pop(0) if self.answers else "")

    def get(self, remote, local):
        self.calls.append(("get", remote, local))
        with tarfile.open(local, "w") as t:
            for name in self.tar:
                b = io.BytesIO()
                Image.new("RGB", (800, 800), (90, 160, 90)).save(b, "WEBP")
                info = tarfile.TarInfo(name)
                info.size = len(b.getvalue())
                b.seek(0)
                t.addfile(info, b)


def town(root: Path) -> dict:
    """guidebook.json から品を読む街（料理3・土産2）と、手本の置き場"""
    gb = {"eat": {"items": [{"key": "soup", "name": "スープ（温かい）"}, {"key": "pie", "name": "パイ"},
                            {"key": "tea", "name": "お茶"}]},
          "buy": {"items": [{"key": "jam", "name": "ジャム"}, {"key": "cup", "name": "カップ"}]}}
    p = root / "python/data/guide/xx/town/guidebook.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(gb, ensure_ascii=False), encoding="utf-8")
    for n in ("food-a", "buy-b", "food-c"):
        png(root / f"site/public/guide/xx/model/{n}-800.webp", (800, 800))
    return {
        "ja": "テスト町", "items": {"guidebook": "python/data/guide/xx/town/guidebook.json"},
        "stitch": "Testish", "scene": "Scene: a small town. ",
        "ec2_alias": {"food-pie": "food-pie-old"},
        "cover": {"v": 2, "bias": 0.0, "alt": "表紙の字", "note": "表紙の注"},
        "cover_tall": {"alt": "縦の字", "note": "縦の注"},
        "areamap": {"v": 3, "layout": "layout.png", "fix": "FIX! ", "prompt": "Paint a map.", "alt": "地図の字",
                    "note": "地図の注", "areas": [{"id": "a", "name": "Aの区", "x": 0.2, "y": 0.3}],
                    "bbox": {"west": 1, "east": 2, "south": 3, "north": 4},
                    "beyond": [{"id": "far", "x": 0.9, "y": 0.5, "dir": "e"}], "base": {"by": "OSM"}},
        "food": {"model": "xx/model:food-a", "note": "料理の注", "items": {
            "soup": {"desc": "A soup.", "alt": "スープの字"},
            "pie": {"desc": "A pie.", "alt": "パイの字", "v": 2, "fix": "PIE FIX ", "ref": "https://example.invalid/pie.jpg"},
            "tea": {"desc": "Tea.", "alt": "お茶の字", "model": "xx/model:food-c", "note": "お茶だけの注"}}},
        "buy": {"model": "xx/town:buy-jam", "note": "土産の注", "items": {
            "jam": {"desc": "Jam.", "alt": "ジャムの字"},
            "cup": {"desc": "A cup.", "alt": "カップの字"}}},
    }


def tscity(root: Path) -> dict:
    """面の TS から品を読む街（ソフィアの形）"""
    c = root / "site/content"
    c.mkdir(parents=True, exist_ok=True)
    (c / "land.ts").write_text(
        'export const BG_FOOD = [\n'
        '  { jp: "チーズ2種", cyr: "с / к", roman: "sirene / kashkaval", rank: 2 },\n'
        '  { jp: "ゆでとうもろこし", roman: "varena tsarevitsa", rank: 3 },\n'
        '] as const;\n\n'
        'export const BG_BUY = [\n'
        '  { what: "バラのオイル／水", cyr: "р" },\n'
        '] as const;\n', encoding="utf-8")
    (c / "land-city.ts").write_text('const BUY_ID: Record<string, string> = {\n  "バラのオイル／水": "rose-oil",\n};\n',
                                    encoding="utf-8")
    return {"ja": "TS町", "items": {
        "food": {"ts": "site/content/land.ts", "const": "BG_FOOD", "name": "jp", "id": "slug:roman"},
        "buy": {"ts": "site/content/land.ts", "const": "BG_BUY", "name": "what", "id": "map:site/content/land-city.ts#BUY_ID"}},
        "scene": "S. ", "cover": {"alt": "a", "note": "n"}, "cover_tall": {"alt": "a", "note": "n"},
        "areamap": {"layout": "l.png", "prompt": "M.", "alt": "a", "note": "n"},
        "food": {"note": "n", "items": {"sirene-kashkaval": {"desc": "d", "alt": "a"}, "varena-tsarevitsa": {"desc": "d", "alt": "a"}}},
        "buy": {"note": "n", "items": {"rose-oil": {"desc": "d", "alt": "a"}}}}


def with_city(spec, city):
    s = json.loads(json.dumps(spec))
    s["_city"] = city
    return s


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="guide-art-selftest-"))
    try:
        root = tmp / "repo"
        work = tmp / "work"
        work.mkdir(parents=True)
        sp = with_city(town(root), "xx/town")

        print("1. 組む")
        ss = {s["slot"]: s for s in ga.slots(sp, root)}
        ok(list(ss) == ["cover", "cover_tall", "areamap", "food:soup", "food:pie", "food:tea", "buy:jam", "buy:cup"],
           f"品の並びが 表紙・縦・地図・料理・土産（面のデータの並び）でない: {list(ss)}")
        ok(ss["cover"]["id"] == "cover2" and ss["cover_tall"]["id"] == "cover_tall" and ss["areamap"]["id"] == "areamap3",
           "版の付いた品の id が <品><版> にならない（描き直しが EC2 の前の絵に飛ばされる）")
        ok(ss["food:pie"]["id"] == "food-pie2" and ss["food:soup"]["id"] == "food-soup", "料理の id が food-<鍵>[版] でない")
        ok(all(ga.NOTEXT in s["prompt"] for s in ss.values()), "字を入れない（NOTEXT）が入っていない品がある")
        ok(ss["cover"]["prompt"].startswith(ga.WIDE) and ss["cover_tall"]["prompt"].startswith(ga.TALL),
           "表紙の横と縦で、切る帯の頼みが入れ替わっている")
        ok(ga.PAINT in ss["cover"]["prompt"] and ga.PAINT in ss["areamap"]["prompt"], "絵のトーン（PAINT）が無い")
        ok(ss["areamap"]["prompt"].startswith("FIX! Paint a map.") and ss["areamap"]["prompt"].endswith(ga.MAP_STYLE),
           "地図の頼みが 直し → 街の文 → 型 の順でない")
        ok(ss["food:soup"]["prompt"].startswith(ga.MATCH), "料理に手本の頼み（MATCH）が入っていない")
        # 布を描かせない（あやと 2026-11-19「全部ハンカチ（布）が写っていて AI 生成っぽい」）。料理と土産の全部に
        # 「布を描かない」が入り、前の布巾の言葉（刺繍の布・ナプキンを置く）が残っていないこと
        fb = [s for s in ss.values() if s["sec"] in ("food", "buy")]
        ok(fb and all(ga.NOCLOTH in s["prompt"] for s in fb), "料理か土産に、布を描かない頼み（NOCLOTH）が入っていない品がある")
        ok(not any(w in s["prompt"].replace(ga.NOCLOTH, "").replace(ga.MATCH, "") for s in fb
                   for w in ("napkin", "cross-stitch", "linen", "Testish")),
           "料理か土産の頼みに、布巾を置かせる言葉が残っている")
        ok("do NOT copy any napkin" in ga.MATCH and "napkin, lighting" not in ga.MATCH,
           "手本に合わせる頼み（MATCH）が、手本の布巾まで写させる")
        ok(ss["food:pie"]["prompt"].endswith("Subject: PIE FIX A pie."), "品の直し（fix）が描写の前に付かない")
        ok(ss["food:tea"]["refs"] == [("model", "xx/model:food-c")], "品ごとの手本（model）が街の手本より先に効かない")
        ok(ss["buy:jam"]["refs"] == [] and not ss["buy:jam"]["prompt"].startswith(ga.MATCH),
           "手本そのもの（シリーズの1枚目）に手本を渡している")
        ok(ss["buy:cup"]["refs"] == [("model", "xx/town:buy-jam")], "土産に街の手本が渡らない")
        ok("描き直し：テスト町の表紙・横" in ss["cover"]["title"] and "新しく描く：テスト町の料理 スープ" in ss["food:soup"]["title"],
           f"会話の題の形が違う: {ss['cover']['title']} / {ss['food:soup']['title']}")
        bad = json.loads(json.dumps(sp))
        del bad["food"]["items"]["tea"]
        _, code, out = quiet(ga.slots, bad, root)
        ok(code == 2 and "tea" in out, "描写の無い品を黙って通した")

        print("2. 面の TS から品を読む")
        ts = with_city(tscity(root), "yy/ts")
        got = ga.items_of(ts, root)
        ok(got["food"] == [("sirene-kashkaval", "チーズ2種"), ("varena-tsarevitsa", "ゆでとうもろこし")],
           f"roman から作る料理の id が面（slug）と違う: {got['food']}")
        ok(got["buy"] == [("rose-oil", "バラのオイル／水")], f"BUY_ID の表から土産の id を引けない: {got['buy']}")
        (root / "site/content/land-city.ts").write_text('const BUY_ID: Record<string, string> = {\n  "x": "y",\n};\n')
        _, code, _ = quiet(ga.items_of, ts, root)
        ok(code == 2, "BUY_ID に無い土産を黙って通した")

        print("3. 送る品の選び")
        out = root / "site/public/guide/xx/town"
        out.mkdir(parents=True, exist_ok=True)
        png(out / "food-soup-800.webp", (800, 800))
        (out / "manifest.json").write_text(json.dumps({"food": {"soup": {
            "src": "/guide/xx/town/food-soup-800.webp", "src_small": "/guide/xx/town/food-soup-400.webp", "w": 800, "h": 800,
            "alt": "古い字", "kind": "ai", "prompt_note": "古い注"}}}, ensure_ascii=False))
        picked = {s["slot"]: s for s in ga.select(sp, root, work)}
        ok("food:soup" not in picked and "food:pie" in picked, "既定で、manifest に在る品まで送っている")
        ok("why" in picked["areamap"] and "下敷き" in picked["areamap"]["why"], "下敷きが無い地図を後回しにしない")
        ok("why" in picked["buy:cup"] and "手本" in picked["buy:cup"]["why"], "手本（まだ描いていない1枚目）が無い品を後回しにしない")
        ok("why" not in picked["food:pie"] and "why" not in picked["buy:jam"], "渡す絵の揃った品を後回しにした")
        only = ga.select(sp, root, work, only=["food:soup", "cover2"])
        ok([s["slot"] for s in only] == ["cover", "food:soup"], "--only で品の名前か id を指せない")
        _, code, _ = quiet(ga.select, sp, root, work, only=["food:nope"])
        ok(code == 2, "知らない品を黙って飛ばした")

        print("4. run（偽の EC2）")
        png(work / "layout.png", (1024, 1024))
        fake = FakeEC2(root)
        ga.EC2 = fake
        fake.answers = ["queue ok"]
        rc, _, _ = quiet(ga.run, sp, root, work)
        puts = [c for c in fake.calls if c[0] == "put"]
        jobs = json.loads((work / "jobs.json").read_text(encoding="utf-8"))
        ok(rc == 0 and fake.calls[0] == ("start",), "EC2 を起こしてから置いていない")
        ok({Path(c[2]).name for c in puts} >= {"cdp.py", "chatgpt.py", "chatgpt_image.py", "guide_art.py", "jobs.json"},
           "道具と jobs.json を EC2 に置いていない")
        ok([j["id"] for j in jobs] == ["cover2", "cover_tall", "areamap3", "food-pie2", "food-tea", "buy-jam"],
           f"送った品が違う（後回しの品まで送った・manifest に在る品を送った）: {[j['id'] for j in jobs]}")
        sh = next(c[1] for c in fake.calls if c[0] == "run")
        ok("ec2-queue hold chatgpt" in sh and "guide_art.py batch" in sh, "一括を札（列 chatgpt）の中で起こしていない")
        ok("food-pie-old-0.png" in sh, "EC2 で先に描いた名前（ec2_alias）を今の id に写していない")
        model_puts = [c for c in puts if "model-" in c[2]]
        ok(model_puts and all(c[2].endswith(".webp") for c in model_puts) and ".png" in sh,
           "手本を webp で送って EC2 で PNG に直していない")
        ok(all(f.endswith(".png") for j in jobs for f in j["files"]), "ChatGPT に渡す絵の道が PNG でない")
        ok("STALE" in sh and "cover2-0.png" in sh and "food-pie-0.png" not in sh.split("mkdir")[0],
           "一括を起こす前に、EC2 に前の絵が在る品を見ていない（別名の品まで見ている）")
        fake.calls.clear()
        fake.answers = ["STALE: areamap3(2026-11-15)"]
        rc, _, out_ = quiet(ga.run, sp, root, work)
        ok(rc == 1 and "v を上げて" in out_, "EC2 に前の絵が在る品を送って、古い絵を持ち帰る道を開けた")
        fake.calls.clear()
        rc, _, out_ = quiet(ga.run, sp, root, work, only=["buy:cup"])
        ok(rc == 2 and not fake.calls, "後回しの品だけのとき、EC2 に触った・0 で終わった")

        print("5. status / fetch（偽の EC2）")
        fake.answers = ["RUNNING\ncover2 ok\nfood-pie2 ng 画像生成でエラー\nfood-tea wait"]
        rc, _, out_ = quiet(ga.status, sp)
        ok(rc == 0 and "描けた 1 / 断り・失敗 1 / まだ 1" in out_ and "food-pie2" in out_,
           f"status の数えかたが違う: {out_.strip()}")
        fake.answers = ["Traceback: ..."]
        rc, _, _ = quiet(ga.status, sp)
        ok(rc == 1, "EC2 の答えが壊れているのに status が 0")
        png(work / "raw/cover2-0.png", (1536, 1024))
        fake.answers = ["PACKED 2"]
        fake.tar = ["areamap3-0.webp", "food-pie2-0.webp"]
        fake.calls.clear()
        rc, _, _ = quiet(ga.fetch, sp, root, work)
        pack_sh = next(c[1] for c in fake.calls if c[0] == "run")
        ok(rc == 0 and (work / "raw/areamap3-0.webp").is_file() and (work / "raw/food-pie2-0.webp").is_file(),
           "持ち帰った絵が raw に入らない")
        ok(" cover2 " not in pack_sh + " " and "food-pie2" in pack_sh, "手元に在る絵まで EC2 に取りに行った")
        ok("buy-cup" not in pack_sh and "food-soup" not in pack_sh, "最後に送っていない品（描いてある品）まで EC2 に取りに行った")
        fake.answers = ["PACKED 1"]
        fake.tar = []
        fake.calls.clear()
        quiet(ga.fetch, sp, root, work, ["food:soup"])
        ok(next(c[1] for c in fake.calls if c[0] == "run").split("<<")[0].split()[3:] == ["food-soup"],
           "--only で指した品だけを取りに行かない")
        fake.answers = ["PACKED 0"]
        rc, _, _ = quiet(ga.fetch, sp, root, work)
        ok(rc == 2, "EC2 にまだ1枚も無いのに fetch が 0")

        print("6. finalize")
        png(work / "raw/cover_tall-0.png", (1024, 1536))
        png(work / "raw/food-tea-0.png", (1024, 1024))
        png(work / "raw/buy-jam-0.webp", (900, 700))
        man, missing = ga.finalize(sp, root, work)
        disk = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        ok(man == disk, "書いた manifest と返した manifest が違う")
        ok(list(man) == ["cover", "cover_tall", "areamap", "food", "buy"], f"manifest の鍵の並びが違う: {list(man)}")
        ok((man["cover"]["w"], man["cover"]["h"]) == (1600, 900) and (man["cover_tall"]["w"], man["cover_tall"]["h"]) == (1600, 2000),
           "表紙を 16:9（1600×900）・4:5（1600×2000）に書き出していない")
        ok(Image.open(out / "cover-800.webp").size == (800, 450) and Image.open(out / "cover-tall-800.webp").size == (800, 1000),
           "表紙の小さいほうの寸法が違う")
        ok(Image.open(out / "buy-jam-400.webp").size == (400, 400) and man["buy"]["jam"]["src_small"] == "/guide/xx/town/buy-jam-400.webp",
           "正方形でない絵を 800・400 の正方形に切っていない")
        # 横の表紙は bias 0 → 上から切る。左上の黒い印（高さ 1/8）が残る
        ok(Image.open(out / "cover-1600.webp").convert("RGB").getpixel((5, 5))[0] < 60, "表紙の bias（どこで切るか）が効かない")
        ok(list(man["areamap"]) == ["src", "src_small", "w", "h", "alt", "kind", "prompt_note", "areas", "bbox", "beyond", "base"],
           f"地図の欄（areas・bbox・beyond・base）の並びが今の形と違う: {list(man['areamap'])}")
        ok(man["areamap"]["beyond"] == sp["areamap"]["beyond"] and man["areamap"]["areas"] == sp["areamap"]["areas"],
           "地図の札・外の行き先が頼み書きのまま入らない")
        ok(man["food"]["soup"]["src"] == "/guide/xx/town/food-soup-800.webp" and man["food"]["soup"]["alt"] == "スープの字",
           "持ち帰っていない品を manifest のまま残していない（か、字が頼み書きに合っていない）")
        ok(man["food"]["tea"]["prompt_note"] == "お茶だけの注" and man["food"]["pie"]["prompt_note"] == "料理の注",
           "品ごとの注が街の注より先に効かない")
        ok(list(man["food"]) == ["soup", "pie", "tea"] and missing == ["buy:cup"],
           f"料理の並び・無い品の数えかたが違う: {list(man['food'])} / {missing}")
        ok(set(man["food"]["tea"]) == {"src", "src_small", "w", "h", "alt", "kind", "prompt_note"},
           "料理の欄が今の形と違う")

        print("7. check")
        png(work / "raw/buy-cup-0.png", (1024, 1024))
        ga.finalize(sp, root, work)
        rc, _, out_ = quiet(ga.check, sp, root)
        ok(rc == 0 and "違い 0" in out_, f"作り直して同じ manifest なのに違いが出た: {out_.strip()}")
        cur = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        cur["food"]["pie"]["alt"] = "手で直した字"
        alt_m = tmp / "alt.json"
        alt_m.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
        rc, _, out_ = quiet(ga.check, sp, root, alt_m)
        ok(rc == 1 and "/food/pie/alt" in out_, "manifest の字が頼み書きと違うのに check が通った")
        cur["food"]["pie"]["alt"] = "パイの字"
        cur["buy"]["extra"] = cur["buy"]["jam"]
        alt_m.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
        rc, _, out_ = quiet(ga.check, sp, root, alt_m)
        ok(rc == 1 and "buy:extra" in out_, "manifest にだけ在る品を check が数えない")
        rc, _, _ = quiet(ga.check, sp, root, tmp / "none.json")
        ok(rc == 2, "比べる manifest が無いのに 2 で落ちない")

        print("8. EC2 の一括（偽の ChatGPT）")
        bdir = tmp / "ec2"
        bdir.mkdir()
        bj = bdir / "jobs.json"
        bj.write_text(json.dumps([{"id": i, "prompt": "p", "title": "t", "files": []} for i in ("a", "b", "c")]))
        png(bdir / "a-0.png", (8, 8))
        (bdir / "DONE-jobs.json").write_text("old")
        tries: list[str] = []

        def make(prompt, pre, title, files, timeout):
            tries.append(Path(pre).name)
            if Path(pre).name == "b" and tries.count("b") == 1:
                raise RuntimeError("画像生成でエラー")
            png(Path(pre + "-0.png"), (8, 8))
            return {"images": [1], "url": "u", "seconds": 1, "text": ""}

        st = ga.batch(str(bj), str(bdir), make=make)
        ok(tries == ["b", "c", "b"], f"済んだ品を飛ばし、落ちた品を2周目で埋める、になっていない: {tries}")
        ok(st["b"]["ok"] and st["b"]["round"] == 1 and json.loads((bdir / "status.json").read_text())["c"]["ok"],
           "status.json に様子が書かれない")
        ok((bdir / "DONE-jobs.json").read_text() != "old", "DONE を書き直していない（前の一括の DONE が残る）")
        for f in ("b-0.png", "c-0.png"):
            (bdir / f).unlink()
        tries.clear()

        def logout(prompt, pre, title, files, timeout):
            tries.append(Path(pre).name)
            raise SystemExit("ログインしていない")

        st = ga.batch(str(bj), str(bdir), make=logout)
        ok(tries == ["b"] and "ログイン" in st["b"]["error"], f"ログインが切れているのに残りも回した: {tries}")

        print("9. 見比べの1枚")
        # 写すのは並べる道具1本だけ。名前だけで "sheet.py" と書くと、同じ名前が3か所にあって
        # 見張りの数え役（watch_census）がどれを呼んでいるか決められないので、置き場の道ごと書く
        keep = Path("tools/sprites/sheet.py").name
        shutil.copytree(REPO / "tools/sprites", root / "tools/sprites", ignore=lambda d, n: [x for x in n if x != keep])
        for n in ("food-soup", "food-pie", "food-tea", "buy-jam", "buy-cup"):
            png(work / "ref" / f"{n}.jpg", (500, 375))
        rc, _, _ = quiet(ga.sheet, sp, root, work)
        ok(rc == 0 and Image.open(work / "sheet-items.png").size[0] > 0 and (work / "sheet-tone.png").is_file(),
           "見比べの1枚とトーンの1枚が作られない")
        empty = with_city(sp, "xx/empty")
        rc, _, _ = quiet(ga.sheet, empty, root, tmp / "w2")
        ok(rc == 2, "並べる絵が1枚も無いのに sheet が 0")

        print("10. やりたいこと（do）")
        dsp = with_city(town(root), "xx/dotown")
        png(root / "photos/bath.webp", (500, 375))
        dsp["do"] = {"model": "xx/model:food-a", "note": "やりたいことの注", "items": {
            "eat": {"ja": "食べる", "shape": "hero", "desc": "Eating.", "alt": "食べる字", "note": "見出しの注", "v_tall": 2},
            "bath": {"ja": "湯", "desc": "A bath.", "alt": "湯の字", "photos": ["photos/bath.webp"], "ref": ["photos/bath.webp"]},
            "walk": {"ja": "歩く", "desc": "Walking.", "alt": "歩く字", "photos": ["photos/none.webp"]}}}
        ds = {s["slot"]: s for s in ga.slots(dsp, root) if s["sec"] == "do"}
        ok(list(ds) == ["do:eat", "do:eat-tall", "do:bath", "do:walk"],
           f"やりたいことの品が 頼み書きの並び・見出しは横と縦の2枚 になっていない: {list(ds)}")
        ok(ds["do:eat"]["id"] == "do-eat" and ds["do:eat-tall"]["id"] == "do-eat-tall2",
           "縦の版（v_tall）が縦の id にだけ付かない（縦だけ描き直せない）")
        ok(ga.HERO_WIDE in ds["do:eat"]["prompt"] and ga.HERO_TALL in ds["do:eat-tall"]["prompt"]
           and ga.CARD in ds["do:bath"]["prompt"], "見出しの横・縦と、4:3/1:1 に切る1枚とで、構図の頼みが入れ替わっている")
        ok(all(s["prompt"].startswith(ga.SCENE_MATCH) and ga.NOTEXT in s["prompt"] and ga.PEOPLE in s["prompt"]
               and ga.PAINT in s["prompt"] for s in ds.values()),
           "やりたいことに 表紙の手本・字を入れない・人の頼み・絵のトーン のどれかが入っていない")
        ok(ga.PHOTO_NOTE in ds["do:bath"]["prompt"] and ga.PHOTO_NOTE not in ds["do:eat"]["prompt"],
           "建物の写真を渡す品にだけ、写真の扱い（PHOTO_NOTE）を書く、になっていない")
        ok(ds["do:bath"]["refs"] == [("model", "xx/model:food-a"), ("photo", "photos/bath.webp")],
           "手本（1枚目）と建物の写真の渡しかたが違う")
        picked = {s["slot"]: s for s in ga.select(dsp, root, work, only=list(ds))}
        ok("why" in picked["do:walk"] and "写真" in picked["do:walk"]["why"] and "why" not in picked["do:bath"],
           "建物の写真が無い品を後回しにしない（か、在る品を後回しにした）")
        ok(picked["do:bath"]["files"][1][1].endswith("/in/photo-bath.png"), "建物の写真を EC2 で PNG に直して渡していない")
        # EC2 の上の詰めかたを、手元で本当に回す（やりたいことは描けたまま・料理は 800 角）
        pk = tmp / "pack"
        png(pk / "do-x-0.png", (1536, 1024))
        png(pk / "food-y-0.png", (1024, 1024))
        import subprocess
        subprocess.run([sys.executable, "-", str(pk), "do-x", "food-y"], input=ga.PACK_PY, text=True, check=True,
                       capture_output=True)
        ok(Image.open(pk / "pack/do-x-0.webp").size == (1536, 1024) and Image.open(pk / "pack/food-y-0.webp").size == (800, 800),
           "やりたいことの絵まで EC2 で正方形に切って持ち帰る（か、料理を切らない）")
        dw, dout = tmp / "dwork", root / "site/public/guide/xx/dotown"
        for i in ("cover2", "cover_tall", "areamap3", "food-soup", "food-pie2", "food-tea", "buy-jam", "buy-cup"):
            png(dw / f"raw/{i}-0.png", (1536, 1024) if i.startswith("cover") else (1024, 1024))
        png(dw / "raw/do-eat-0.png", (1536, 1024))
        png(dw / "raw/do-eat-tall2-0.png", (1024, 1536))
        png(dw / "raw/do-bath-0.png", (1536, 1024))
        man, missing = ga.finalize(dsp, root, dw)
        d = man["do"]
        ok(list(man)[-1] == "do" and list(d) == ["eat", "bath"] and missing == ["do:walk"],
           f"やりたいことの鍵の並び・無い品の数えかたが違う: {list(man)} / {list(d)} / {missing}")
        ok(list(d["eat"]) == ["src", "src_small", "w", "h", "alt", "kind", "prompt_note", "variants"],
           f"やりたいことの欄が決めた形と違う: {list(d['eat'])}")
        ok(d["eat"]["variants"]["16:9"] == {"src": "/guide/xx/dotown/do-eat-1600.webp",
                                            "src_small": "/guide/xx/dotown/do-eat-800.webp", "w": 1600, "h": 900}
           and d["eat"]["src"] == "/guide/xx/dotown/do-eat-1600.webp", "見出しの横（16:9）の書き出しか、いちばん目の形の写しが違う")
        ok((d["eat"]["variants"]["4:5"]["w"], d["eat"]["variants"]["4:5"]["h"]) == (1000, 1250)
           and Image.open(dout / "do-eat-tall-500.webp").size == (500, 625), "見出しの縦（4:5）の寸法が違う")
        ok(list(d["bath"]["variants"]) == ["4:3", "1:1"] and Image.open(dout / "do-bath-600.webp").size == (600, 450)
           and Image.open(dout / "do-bath-square-400.webp").size == (400, 400), "1枚から 4:3 と 1:1 に切っていない")
        ok(d["eat"]["prompt_note"] == "見出しの注" and d["bath"]["prompt_note"] == "やりたいことの注" and d["bath"]["alt"] == "湯の字",
           "品ごとの注・字が頼み書きのまま入らない")
        sel = [s["slot"] for s in ga.select(dsp, root, dw) if s["sec"] == "do"]
        ok(sel == ["do:walk"], f"既定で、形のそろった品まで送っている: {sel}")
        rc, _, out_ = quiet(ga.check, dsp, root)
        ok(rc == 1 and "do:walk" in out_, "まだ描いていないやりたいことを check が数えない")
        png(dw / "raw/do-walk-0.png", (1536, 1024))
        ga.finalize(dsp, root, dw)
        rc, _, out_ = quiet(ga.check, dsp, root)
        ok(rc == 0 and "違い 0" in out_ and "やりたいこと 3" in out_, f"作り直して同じなのに check が通らない: {out_.strip()}")
        for f in ("do-eat-0.png", "do-eat-tall2-0.png", "do-bath-0.png"):
            (dw / "raw" / f).unlink()
        png(dw / "raw/do-eat-0.png", (1536, 1024))
        man2, missing2 = ga.finalize(dsp, root, dw)
        ok(man2["do"]["eat"]["variants"]["4:5"] == d["eat"]["variants"]["4:5"] and man2["do"]["bath"] == d["bath"],
           "持ち帰っていない形を manifest のまま残さない（横だけ描き直した日に縦が消える）")
        (dout / "do-eat-tall-1000.webp").unlink()
        sel = [s["slot"] for s in ga.select(dsp, root, dw) if s["sec"] == "do"]
        ok(sel == ["do:eat-tall"], f"manifest に在っても絵のファイルが無い形を、描いてあることにした: {sel}")
        man3, missing3 = ga.finalize(dsp, root, dw)
        ok("eat" not in man3["do"] and "do:eat-tall" in missing3, "形が欠けた品を manifest に載せた（面が無い絵を読みに行く）")
        png(dw / "raw/do-eat-tall2-0.png", (1024, 1536))
        ga.finalize(dsp, root, dw)
        cur = json.loads((dout / "manifest.json").read_text(encoding="utf-8"))
        cur["do"]["bath"]["variants"]["1:1"]["w"] = 1
        alt_m.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
        rc, _, out_ = quiet(ga.check, dsp, root, alt_m)
        ok(rc == 1 and "/do/bath/variants/1:1/w" in out_, "やりたいことの形が頼み書きと違うのに check が通った")
        rc, _, _ = quiet(ga.sheet, dsp, root, dw, None, ["do"])
        ok(rc == 0 and Image.open(dw / "sheet-do.png").size[0] > 0, "やりたいことの見比べの1枚が作られない")
        rc, _, out_ = quiet(ga.check, sp, root)
        ok(rc == 0, f"やりたいことの無い街の check に、やりたいことが混ざった: {out_.strip()}")

        print("11. 地区の名前を焼いた地図（#1262）")
        # 札の字は面と同じ丸ゴシック（控えに無ければ落とす）。焼く前の1枚は頼み書きの隣ではなく、ここの置き場へ
        bsp = with_city(town(root), "xx/baked")
        bsp["areamap"].update({"file": "町-見どころマップ", "ratio": 0.8, "sizes": [1200, 800], "areas": [
            {"id": "a", "name": "Aの駅周辺", "label": ["Aの駅", "周辺"], "color": "#bdb8f2", "x": 0.3, "y": 0.3},
            {"id": "b", "name": "B・C通り周辺", "label": ["B・", "C通り周辺"], "color": "#ffd76e", "x": 0.6, "y": 0.7}]})
        bw, base = tmp / "bwork", tmp / "base.webp"
        png(bw / "raw/areamap3-0.png", (1024, 1536), (240, 235, 225))
        bman, _ = ga.finalize(bsp, root, bw, base=base)
        am = bman["areamap"]
        bout = root / "site/public/guide/xx/baked"
        ok(am["src"] == "/guide/xx/baked/町-見どころマップ-1200.webp" and (am["w"], am["h"]) == (1200, 1500)
           and Image.open(bout / "町-見どころマップ-800.webp").size == (800, 1000),
           f"地図の名前・形（4:5）・大きい版（1200）が頼み書きのとおりでない: {am['src']} {am['w']}x{am['h']}")
        ok(am.get("baked") is True and all(x.get("w") and x.get("h") for x in am["areas"]),
           "名前を焼いた地図に baked と札の箱（w・h）が載らない（面が押しどころを重ねられない）")
        big = Image.open(bout / "町-見どころマップ-1200.webp").convert("RGB")
        a = am["areas"][0]
        ok(sum(big.getpixel((round(a["x"] * 1200), round(a["y"] * 1500 + dy)))[0] < 140 for dy in range(-30, 31)) > 0,
           "札の真ん中に字の画素が無い（焼けていない）")
        ok(Image.open(base).size == (1200, 1500), "焼く前の1枚を残していない（名前だけ直した日に焼き直せない）")
        bsp["areamap"]["areas"][0]["label"] = ["Aの駅周辺"]
        bman2, _ = ga.finalize(bsp, root, tmp / "nowork", base=base)
        ok(bman2["areamap"]["areas"][0]["h"] < am["areas"][0]["h"], "持ち帰った絵が無い日に、焼く前の1枚から焼き直さない")
        # 描いたあとで足した地区の色（`paint`）は、その範囲にだけ重なる。範囲の外の画素は変えない
        bsp["areamap"]["bbox"] = {"west": 21.42, "east": 21.45, "south": 41.98, "north": 42.01}
        bsp["areamap"]["districts"] = [{"id": "c", "color": "#ff3080", "paint": True,
                                        "poly": [[42.004, 21.421], [42.004, 21.427], [42.000, 21.427], [42.000, 21.421]]}]
        before = Image.open(bout / "町-見どころマップ-1200.webp").convert("RGB")
        ga.finalize(bsp, root, tmp / "nowork", base=base)
        after = Image.open(bout / "町-見どころマップ-1200.webp").convert("RGB")
        inside, far = (round(1200 * 0.13), round(1500 * 0.30)), (1100, 1400)
        ok(after.getpixel(inside)[1] < before.getpixel(inside)[1] - 20 and
           sum(abs(x - y) for x, y in zip(after.getpixel(far), before.getpixel(far))) < 12,
           f"足した地区の色が、範囲の中に重ならない・外まで変えた: {before.getpixel(inside)}→{after.getpixel(inside)} / {before.getpixel(far)}→{after.getpixel(far)}")
        # 題の帯と目印の名前（#332。画像検索の上位の地図の形）。帯は絵のいちばん上、名前は頼み書きの置き場に
        bsp["areamap"]["districts"] = []
        bsp["areamap"]["title"] = {"name": "町", "label": "見どころマップ"}
        bsp["areamap"]["names"] = [{"id": "tower", "label": ["塔"], "x": 0.8, "y": 0.45}]
        ga.finalize(bsp, root, tmp / "nowork", base=base)
        big = Image.open(bout / "町-見どころマップ-1200.webp").convert("RGB")
        band = [big.getpixel((x, 20)) for x in (30, 1170)]
        ok(all(p[0] > 235 and p[1] > 235 for p in band) and min(big.getpixel((x, 63))[0] for x in range(300, 900, 4)) < 140,
           f"題の帯（紙の色の地と字）が絵のいちばん上に焼けていない: 端 {band}")
        ok(min(big.getpixel((round(0.8 * 1200) + dx, round(0.45 * 1500)))[0] for dx in range(-16, 17)) < 140
           and big.getpixel((round(0.8 * 1200), round(0.45 * 1500) - 40))[0] < 245,
           "目印の名前の札が頼み書きの置き場に焼けていない")
        for what, change in (("目印の名前が地区の札に", {"x": 0.3, "y": 0.3}), ("目印の名前が題の帯に", {"x": 0.5, "y": 0.03})):
            bsp["areamap"]["names"][0].update(change)
            try:
                ga.finalize(bsp, root, tmp / "nowork", base=base)
                ok(False, f"{what}重なるのに黙って焼いた")
            except ValueError as e:
                ok("重なる" in str(e), f"{what}重なるときの止めかたが違う: {e}")
        bsp["areamap"]["names"] = []
        bsp["areamap"]["areas"][0].update({"y": 0.06})
        try:
            ga.finalize(bsp, root, tmp / "nowork", base=base)
            ok(False, "地区の札が題の帯に重なるのに黙って焼いた")
        except ValueError as e:
            ok("題の帯" in str(e), f"地区の札が題の帯に重なるときの止めかたが違う: {e}")
        bsp["areamap"]["areas"][0].update({"y": 0.3})
        del bsp["areamap"]["title"]
        bsp["areamap"]["areas"][1].update({"x": 0.32, "y": 0.32})
        try:
            ga.finalize(bsp, root, tmp / "nowork", base=base)
            ok(False, "札が重なるのに黙って焼いた")
        except ValueError as e:
            ok("重なる" in str(e), f"札が重なるときの止めかたが違う: {e}")

        print("12. 題を焼いた表紙（#1228）")
        # 画像検索で押してもらうために、表紙の絵に街の名前・「観光ガイド」・キャッチを焼く。焼く前の1枚は仮の置き場へ
        tsp = with_city(town(root), "xx/titled")
        tsp["title"] = {"name": "テスト町", "label": "観光ガイド", "catch": "港の見える町", "kicker": "テスト国"}
        tsp["cover"].update({"file": "テスト町-観光ガイド", "title": {"x": 0.96, "y": 0.05, "anchor": "tr", "scale": 0.85}})
        tsp["cover_tall"].update({"file": "テスト町-観光ガイド-縦", "title": {"x": 0.5, "y": 0.955, "anchor": "bc", "scale": 1.2}})
        tw, tb = tmp / "twork", tmp / "tbases"
        png(tw / "raw/cover2-0.png", (1536, 1024), (40, 90, 160))
        png(tw / "raw/cover_tall-0.png", (1024, 1536), (40, 90, 160))
        tman, _ = ga.finalize(tsp, root, tw, base=tmp / "tbase.webp", bases=tb)
        tout = root / "site/public/guide/xx/titled"
        c, ct = tman["cover"], tman["cover_tall"]
        ok(c["src"] == "/guide/xx/titled/テスト町-観光ガイド-1600.webp" and ct["src"] == "/guide/xx/titled/テスト町-観光ガイド-縦-1600.webp",
           f"題を焼いた表紙の名前が頼み書きの file でない: {c['src']} / {ct['src']}")
        ok(c.get("titled") is True and ct.get("titled") is True and c["alt"].startswith("テスト町観光ガイド「港の見える町」。"),
           f"題を焼いた表紙に titled と、焼いた字で始まる alt が載らない: {c.get('titled')} {c['alt'][:30]}")
        ok(c.get("og", {}).get("src") == "/guide/xx/titled/titled-cover-1200x630.jpg"
           and Image.open(tout / "titled-cover-1200x630.jpg").size == (1200, 630) and "og" not in ct,
           f"og の 1200x630 の JPEG が横の表紙にだけ付かない: {c.get('og')} / {ct.get('og')}")
        big = Image.open(tout / "テスト町-観光ガイド-1600.webp").convert("RGB")
        # 札は右上（紙の色）。左下は元の絵の色のまま
        ok(big.getpixel((930, 300))[0] > 200 and big.getpixel((100, 800))[0] < 80,
           f"札が頼み書きの置き場（右上）に焼けていない: 右上 {big.getpixel((930, 300))} 左下 {big.getpixel((100, 800))}")
        # 貼られたときの絵と記事の絵は、**字の無い**表紙から切る（#332 の決めごと3。Google は og:image と構造化データの絵に
        # 字の多い絵を避けるよう言っている）。焼いた表紙で紙の色になる右上が、元の絵の色のまま
        og = Image.open(tout / "titled-cover-1200x630.jpg").convert("RGB")
        ok(og.getpixel((1000, 120))[0] < 80 and c["og"].get("alt") == "表紙の字",
           f"og が題を焼いた絵から切られている（右上 {og.getpixel((1000, 120))}）か、alt が焼いた字のまま: {c['og'].get('alt')}")
        ld = c.get("ld") or []
        sizes = [(x["w"], x["h"]) for x in ld]
        ok(sizes == [(1200, 675), (1200, 900), (1200, 1200)]
           and all(Image.open(tout / Path(x["src"]).name).size == (x["w"], x["h"]) for x in ld),
           f"記事の絵が 16:9・4:3・1:1（横 1200px）の3枚でない: {sizes}")
        ok(all(Image.open(tout / Path(x["src"]).name).convert("RGB").getpixel((x["w"] - 60, 40))[0] < 80 for x in ld),
           "記事の絵のどれかが、題を焼いた絵から切られている（右上が紙の色）")
        ok(ga.cover_base(tsp, "cover", tb).is_file() and Image.open(ga.cover_base(tsp, "cover", tb)).size == (1600, 900),
           "焼く前の表紙を残していない（キャッチだけ直した日に焼き直せない）")
        # 持ち帰った絵が無い日は、焼く前の1枚から焼き直す（焼いた絵にもう1度焼かない）
        before = Image.open(tout / "テスト町-観光ガイド-1600.webp").convert("RGB").getpixel((100, 800))
        tsp["title"]["catch"] = "港の見える古い町"
        tman2, _ = ga.finalize(tsp, root, tmp / "nowork", base=tmp / "tbase.webp", bases=tb)
        ok(tman2["cover"]["alt"].startswith("テスト町観光ガイド「港の見える古い町」") and
           Image.open(tout / "テスト町-観光ガイド-1600.webp").convert("RGB").getpixel((100, 800)) == before,
           "キャッチだけ直した日に、焼く前の1枚から焼き直さない")
        tsp["cover"]["title"]["scale"] = 2.0
        try:
            ga.finalize(tsp, root, tmp / "nowork", base=tmp / "tbase.webp", bases=tb)
            ok(False, "題の札が絵の外へはみ出すのに黙って焼いた")
        except ValueError as e:
            ok("外へ出る" in str(e), f"題の札がはみ出すときの止めかたが違う: {e}")
    finally:
        ga.EC2 = None
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{N - len(FAILS)}/{N} 通った")
    if N == 0:
        return 2
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
