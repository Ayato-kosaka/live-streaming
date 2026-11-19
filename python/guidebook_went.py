"""**手で組んだ街のガイドブック（いまはソフィア）に、配信の「行った」を焼く。**（#1228）

    python3 python/guidebook_went.py bulgaria/sofia            # 焼く（site/content/guidebook/bulgaria-sofia-went.ts）
    python3 python/guidebook_went.py bulgaria/sofia --check    # 焼かずに、焼いてあるものが今の組み立てと facts と同じかだけ（違えば 1）
    python3 python/guidebook_went.py bulgaria/sofia --photos   # 組み立てのカードの写真を本番の口から取って置く（外に出る）

終了コード 0=焼けた・同じ / 1=組み立てに食い違いがある（何も書かない）/ 2=組み立てか facts が無い。

## なぜ `guidebook_bake.py` と別の道具か

ソフィアの面は手で組んだ TS（`site/content/guidebook/bulgaria-sofia.ts`）で、骨組みの材料（`guidebook.json`）が無い。
スコピエの焼く道具は材料ごと焼くので、そのままでは使えない。そこで**行った箱だけ**を、スコピエと同じ決まりで焼き、
面の側（`bulgaria-sofia.ts`）が項目の id で当てる（無い id を指したら書き出しを止める）。

決まりはスコピエと同じもの（`guidebook_bake.Book` の確かめをそのまま使う）:

- 場面の秒・日付・一言の字は **facts から写す**。組み立て（`went.json`）には、どの行かしか書かない
- 話の数は**結んだ行に在るものだけ**（`guide_bake.Baker.allowed_numbers`。言っていない数を足さない）
- 確かめが要る行（verify）とチャットの行は結ばない
- **場面のリンクは箱に1つ**（`scene`。項目の行のうちの1つ。`docs/island-misses.md` #323）
- **一言は節に1つまで**（`say`）。場面の行に本人の一言（`quote`）が無ければ止める
- **カードの日が、その項目の行った日のどれかでないと止める**（行った日の写真だけを、行った項目に）
- 行った日は、結んだ行のいちばん早い日（面の書き手の枠「◯年◯月◯日〜に行った街」もここから数える）

## 最終更新

中身が変わったときだけ `updated` を進める（頭に中身の指紋。`guide_bake.fingerprint`）。面の「最終更新」は、
手で書いた日とこの日の遅いほう（`bulgaria-sofia.ts`）。

対照は `python/guidebook_went_selftest.py`。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_bake as gb  # noqa: E402  facts の読みかた・指紋・カードの写真の口
import guidebook_bake as gbb  # noqa: E402  行の引きかた・数の確かめ・カードの確かめは、スコピエと同じものを使う

ROOT = gb.ROOT
CONTENT = ROOT / "site/content/guidebook"
SECS = ("todo", "see", "eat", "buy")
SCRIPT = "went.json"


class Went(gbb.Book):
    """組み立て（`went.json`）1本を facts と突き合わせる。行の引きかた・数・カードは `Book` のまま"""

    def __init__(self, key: str, root: Path = ROOT, streams: Path | None = None, script: Path | None = None):
        self.key = key
        self.country, self.city = key.split("/")
        self.root = root
        self.path = script or root / "python/data/guide" / key / SCRIPT
        if not self.path.exists():
            raise gbb.Stop(f"{key} の組み立てが無い（{self.path}）")
        self.c = json.loads(self.path.read_text(encoding="utf-8"))
        try:
            self.b = gb.Baker(key, root=root, streams=streams, script=self.path)
        except gb.Stop as e:
            raise gbb.Stop(str(e)) from e
        self.rows = {f"{x['v']}@{x['t']}#{x['it']['kind']}": x for x in self.b.rows}
        self.errors: list[str] = []
        self.used_cards: set[str] = set()
        self.said: dict[str, str] = {}

    def build(self) -> dict:
        say = self.c.get("say") or {}
        for sec in say:
            if sec not in SECS:
                self.err("say", f"節「{sec}」が無い（{'・'.join(SECS)}）")
        items: dict[str, dict] = {}
        for key, x in (self.c.get("items") or {}).items():
            sec, _, iid = key.partition("/")
            if sec not in SECS or not iid:
                self.err(key, f"鍵は「節/項目の id」（節は {'・'.join(SECS)}）")
                continue
            fs = x.get("facts") or []
            rows = self.rows_of(fs, key)
            if not rows or len(rows) != len(fs):
                if not fs:
                    self.err(key, "行った行（facts）が無い")
                continue
            sc = x.get("scene")
            if sc not in fs:
                self.err(key, f"場面「{sc}」がこの項目の行（facts）に無い（場面は項目の行のうちの1つ）")
                continue
            at = self.rows[sc]
            story: list[str] = []
            for i, s in enumerate(x.get("story") or []):
                where = f"{key}.story[{i}]"
                extra = [f for f in s.get("facts") or [] if f not in fs]
                if extra:
                    self.err(where, f"話の行 {extra} が、この項目の行（facts）に無い")
                xs = self.rows_of(s.get("facts"), where)
                if not xs:
                    self.err(where, "話に結んだ行が無い（言っていないことを言ったことにしない）")
                    continue
                self.check_numbers(s["text"], xs, where)
                story.append(s["text"])
            w: dict = {"date": min(r["date"] for r in rows), "scene": self.scene(at)}
            if story:
                w["story"] = story
            if x.get("short"):
                w["short"] = x["short"]
            if say.get(sec) == iid:
                q = at["it"].get("quote")
                if not q:
                    self.err(key, f"一言に選んだのに、場面の行（{sc}）に本人の一言（quote）が無い")
                else:
                    w["say"] = q
            # その日のカードは、札の絵ではなく窓の中の行った箱に（あやと 2026-11-19「やりたいことの札の絵は、
            # あやと島カードの写真に替えなくていい。窓の中の『行った』の所に出す」）
            if x.get("card"):
                pic = self.card(x["card"], key, {r["date"] for r in rows})
                if pic:
                    w["pic"] = pic
            items[key] = {"went": w}
        for sec, iid in say.items():
            if f"{sec}/{iid}" not in items:
                self.err("say", f"一言に選んだ「{sec}/{iid}」が items に無い")
        unused = set(self.c.get("cards") or {}) - self.used_cards
        if unused:
            self.err("cards", f"使っていないカード {sorted(unused)}（組み立てに残すと、どこに出たかが追えない）")
        return {"items": items}

    def report(self, g: dict) -> str:
        its = g["items"]
        by = {s: sum(1 for k in its if k.startswith(f"{s}/")) for s in SECS}
        return (f"行った {len(its)}（" + "・".join(f"{s} {n}" for s, n in by.items()) + "）"
                f"・話 {sum(len(v['went'].get('story', [])) for v in its.values())}"
                f"・場面 {sum(1 for v in its.values() if v['went'].get('scene'))}"
                f"・ショート {sum(1 for v in its.values() if v['went'].get('short'))}"
                f"・一言 {sum(1 for v in its.values() if v['went'].get('say'))}"
                f"・カード {sum(1 for v in its.values() if v['went'].get('pic'))}"
                f"・いちばん早い日 {min((v['went']['date'] for v in its.values()), default='—')}")


def out_path(key: str, content: Path = CONTENT) -> Path:
    return content / f"{key.replace('/', '-')}-went.ts"


def const_of(key: str) -> str:
    return gbb.const_of(key) + "_WENT"


def render(key: str, g: dict) -> str:
    return (
        "/**\n"
        f" * `/travel/{key}` の「行った」（行った項目の印・その日のカードの写真・話・場面・一言）。**自動生成。手で直さない。**\n"
        " *\n"
        f" * 元は `python/data/guide/{key}/{SCRIPT}`（組み立て）と `streams/YYYY/MM/*.facts.json`。\n"
        f" * 直すならそちらを直して、`python3 python/guidebook_went.py {key}` で焼き直す。\n"
        " * 鍵は「節/項目の id」。面の中身（手で組んだ TS）が、項目の id で当てる。\n"
        " */\n"
        'import type { Went } from "./types";\n\n'
        f"export const {const_of(key)}: {{ updated: string; hash: string; items: Record<string, {{ went: Went }}> }} = {gb.BEGIN}\n"
        + json.dumps(g, ensure_ascii=False, indent=1)
        + f"\n{gb.END};\n"
    )


def bake(key: str, *, check: bool = False, today: str | None = None, root: Path = ROOT, content: Path = CONTENT,
         streams: Path | None = None, script: Path | None = None) -> int:
    try:
        b = Went(key, root=root, streams=streams, script=script)
        g = b.build()
    except gbb.Stop as e:
        print(f"::error::{e}")
        return 2
    if b.errors:
        for e in b.errors:
            print(f"::error::{e}")
        print(f"止めた: {len(b.errors)}件。何も書いていない")
        return 1
    p = out_path(key, content)
    old = gb.read_baked(p)
    fp = gb.fingerprint(g)
    g = {"updated": (old or {}).get("updated") if old and old.get("hash") == fp else (today or gb.today_jst()),
         "hash": fp, **g}
    text = render(key, g)
    rel = p.relative_to(root) if p.is_relative_to(root) else p
    if check:
        same = p.exists() and p.read_text(encoding="utf-8") == text
        print(("同じ" if same else "焼き直しが要る") + f": {rel}")
        print(b.report(g))
        return 0 if same else 1
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print(f"焼いた: {rel}（指紋 {fp}・最終更新 {g['updated']}）")
    print(b.report(g))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("key", help="<国>/<街>（例: bulgaria/sofia）")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--photos", action="store_true", help="組み立てのカードの写真を本番の口から取って置く（外に出る）")
    ap.add_argument("--today", help="今日の日付（見張りが差し替える）")
    a = ap.parse_args(argv)
    if a.photos:
        return gbb.fetch_cards(a.key, script=SCRIPT)
    return bake(a.key, check=a.check, today=a.today)


if __name__ == "__main__":
    sys.exit(main())
