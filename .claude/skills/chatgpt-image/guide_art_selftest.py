#!/usr/bin/env python3
"""`guide_art.py`（街のガイドの絵の一括）の見張り。**本物の EC2 にも ChatGPT にもネットワークにも触らない。**

    python3 .claude/skills/chatgpt-image/guide_art_selftest.py

空の置き場に、街を1つ（guidebook.json の街）と面の TS から品を読む街を1つこしらえ、EC2 は偽物に差し替えて回す。
本物の頼み書き（`guide/<国>/<街>.json`）といまの manifest の突き合わせは、ここでは見ない——面のデータに品が
足された日に、関係の無い PR が赤くなるから。そちらは `guide_art.py <国>/<街> check` で見る。

見る足:
 1. 組む: 品の id・版（v2 → `cover2`）・字を入れない・手本を渡す品にだけ MATCH・手本そのものには渡さない・題
 2. 面の TS から品を読む（roman の slug・BUY_ID の表）。描写の無い品・id の無い品は止める
 3. 送る品の選び: 既定は manifest に無い品だけ・--only・手本や下敷きが無い品は後回し・知らない品は止める
 4. run: 道具と渡す絵を置き、手本の webp を PNG に直し、札（ec2-queue hold chatgpt）の中で一括を起こす。後回しは送らない
 5. status / fetch: EC2 の答えを数える。手元に在るものは取りに行かない
 6. finalize: 寸法・切りかた・鍵と欄の並び・持ち帰っていない品は manifest のまま残す・無い品を数える
 7. check: 作り直した manifest が同じなら 0、字が1つ違えば 1
 8. EC2 の一括: 済んだ品を飛ばす・落ちた品を2周目で埋める・ログイン切れで止める・DONE を書く
 9. 見比べの1枚: 参考写真と描いた絵を並べる（参考写真は手元に置いたもの。取りに行かない）
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
        ok(ss["food:soup"]["prompt"].startswith(ga.MATCH) and "Testish cross-stitch" in ss["food:soup"]["prompt"],
           "料理に手本の頼み（MATCH）か布巾の刺繍の言葉が入っていない")
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
        shutil.copytree(REPO / "tools/sprites", root / "tools/sprites", ignore=lambda d, n: [x for x in n if x != "sheet.py"])
        for n in ("food-soup", "food-pie", "food-tea", "buy-jam", "buy-cup"):
            png(work / "ref" / f"{n}.jpg", (500, 375))
        rc, _, _ = quiet(ga.sheet, sp, root, work)
        ok(rc == 0 and Image.open(work / "sheet-items.png").size[0] > 0 and (work / "sheet-tone.png").is_file(),
           "見比べの1枚とトーンの1枚が作られない")
        empty = with_city(sp, "xx/empty")
        rc, _, _ = quiet(ga.sheet, empty, root, tmp / "w2")
        ok(rc == 2, "並べる絵が1枚も無いのに sheet が 0")
    finally:
        ga.EC2 = None
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{N - len(FAILS)}/{N} 通った")
    if N == 0:
        return 2
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
