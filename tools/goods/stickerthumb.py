"""あやとステッカーの、**升目に出すぶんの小さい写し**を焼く。

    python3 tools/goods/stickerthumb.py            # 名簿ぜんぶぶん焼く
    python3 tools/goods/stickerthumb.py isle walk  # 名前を渡せば、その何枚かだけ
    python3 tools/goods/stickerthumb.py --check    # 焼かずに、置いてある写しが合っているか
    python3 tools/goods/stickerthumb.py --drill    # 対照だけ回して帰る

焼いた先は `site/public/goods/thumb/<id>.webp`。面の側は道を手で書かず、
`content/goods.ts` の `stickerThumb()` が `id` から組み立てる。

## なぜ要るか

図鑑（`/goods/stickers`）は、**40px のマスに 480px の絵をそのまま**
出していた。13枚で 623.8KB——**その面がスマホの最初の1画面で運ぶ量
（903.3KB）の 69%** がこれだった（2026-10-15 実測。`tools/sprites/firstload.mjs`）。
縦横で12倍なので、12倍のうち11倍ぶんは**1画素も使われずに捨てられる。**

手本は住民図鑑（`components/live/FriendsWall.tsx`）。あちらは前から
**一覧のマスは 128px、開いている1枚だけ 640px**で取っている。
ステッカーだけが「どちらも 480px」だった。

## なぜ 160px か

**枠は実測で決めた。** マスは 390px の画面で 48.7px、中の絵はその 86% で
**40.1px**（`app/css/live.css` の `.rzk-cell`）。430px の画面で 45.9px。
あやと島カードの選び札（`.akd-mate`）が **52px**。いちばん大きいほうに
dpr3 を掛けて 156px なので、**160px あれば手に持つ画面では引き伸ばさない。**

820px まで広げるとマスの絵は 69.9px になり、dpr3 では 210px 要る（1.31倍に
伸びる）。**そこは住民図鑑と同じ扱い**——あちらは同じ `.rzk-cell` に 128px を
出している（`components/live/FriendsWall.tsx`）ので、160 はそれより厚い。
820px・dpr3 で前後を撮って引き比べ、粗は出ていない。

## 元絵は、名簿の `art`（長辺480）

ここは**抜く道具ではない**。地を抜いて 480px を焼くのは
`tools/goods/stickercut.py` で、9枚ぶんしか持っていない（残り4枚は
描き起こしのまま `site/public` に置いてある）。小さい写しは**13枚ぜんぶ**に
要るので、「名簿が指している `art` を読んで縮める」1本に分けてある。
`art` が焼き直された日は、ここを回し直せば写しも付いてくる。

## 伸ばさない

長辺が 160px より小さい絵は、**そのまま写す。** 引き伸ばした写しは
元絵より重くなるうえ、ぼやける。いまの13枚はどれも 480px 近いので
通らない道だが、**小さい1枚が名簿に入った日に黙って悪くなる**ので足してある。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python"))

from PIL import Image  # noqa: E402

import ts_read  # noqa: E402

#: 焼く絵の長辺。**`site/content/goods.ts` の `THUMB_LONG` と同じ数**。
#: 食い違ったら `site/selftest/sticker_selftest.mjs` の7章が赤くする
THUMB_LONG = 160

#: webp の質。480px のほう（`stickercut.py`）とそろえる
QUALITY = 86

GOODS_TS = Path(os.environ.get("STK_GOODS_TS") or (REPO / "site" / "content" / "goods.ts"))
PUBLIC = Path(os.environ.get("STK_PUBLIC") or (REPO / "site" / "public"))
#: 焼いた写しの置き場。**`stickerThumb()` が組み立てる道と同じ**
OUT = Path(os.environ.get("STK_THUMB_OUT") or (PUBLIC / "goods" / "thumb"))


def half_up(x: float) -> int:
    """`.5` を**大きいほうへ**丸める。

    Python の `round()` は偶数へ寄せる（`round(110.5) == 110`）が、
    面の側の `Math.round` は**必ず上**（`111`）。`isle` が
    442×640 → 110.5 でちょうどそこに当たっていて、**絵は 110px、
    場所取りは 111px** とずれる。式を1文字そろえるには、こちらを寄せる。
    """
    return int(x + 0.5)


def box(w: int, h: int, long_side: int = THUMB_LONG) -> tuple[int, int]:
    """長辺を `long_side` に落としたときの寸法。**伸ばさない。**

    `content/goods.ts` の `stickerThumb()` と**同じ式**（丸めかたまで）。
    どちらかだけ直すと、場所を先に取る寸法と絵の実寸がずれる。
    """
    longest = max(w, h)
    if longest <= long_side:
        return w, h
    r = long_side / longest
    return max(1, half_up(w * r)), max(1, half_up(h * r))


def roster() -> list[dict]:
    """名簿（`STICKERS`）の `id` と `art`。**字は自分で拾わない**（`ts_read` 1本）。

    読み落としがあれば、その場で止める（`python/ts_read.py` の決め）。
    """
    got = ts_read.read_array(
        GOODS_TS.read_text(encoding="utf-8"), "STICKERS", keys=("id", "art"), id_key="id",
    )
    if got.missed:
        raise SystemExit(f"名簿を {got.missed}件 読み落とした（{GOODS_TS}）")
    return got.rows


def src_of(art: str) -> Path:
    """公開の道（`/goods/x.webp`）を、配る前のファイルに直す。"""
    return PUBLIC / art.lstrip("/")


def dst_of(ident: str) -> Path:
    return OUT / f"{ident}.webp"


def bake(row: dict) -> int:
    src = src_of(row["art"])
    if not src.is_file():
        print(f"  NG  {row['id']:11s} 元の絵が無い: {row['art']}")
        return 1
    im = Image.open(src).convert("RGBA")
    w, h = box(*im.size)
    out = im if (w, h) == im.size else im.resize((w, h), Image.LANCZOS)

    OUT.mkdir(parents=True, exist_ok=True)
    dst = dst_of(row["id"])
    out.save(dst, "WEBP", quality=QUALITY, method=6)
    print(
        f"  ok  {row['id']:11s} {im.width}x{im.height} "
        f"({src.stat().st_size / 1024:6.1f}KB) → {w}x{h} "
        f"({dst.stat().st_size / 1024:5.1f}KB)"
    )
    return 0


def check() -> int:
    """焼かずに、**置いてある写しが名簿と合っているか**だけ見る。

    見るのは「在るか」と「寸法が式どおりか」。**元絵を写しの名前で
    置いただけ**も、寸法で落ちる（元絵は長辺480、式は160を返す）。
    元絵が無い1枚は、写しが在っても落とす——**比べる相手がいないものを、
    合っていることにしない**（`docs/island-standards.md` §15）。
    """
    bad = 0
    for row in roster():
        dst = dst_of(row["id"])
        src = src_of(row["art"])
        if not dst.is_file():
            print(f"  NG  {row['id']:11s} 写しが無い: {dst.relative_to(PUBLIC)}")
            bad += 1
            continue
        if not src.is_file():
            print(f"  NG  {row['id']:11s} 元の絵が無い: {row['art']}")
            bad += 1
            continue
        want = box(*Image.open(src).size)
        got = Image.open(dst).size
        if got != want:
            print(f"  NG  {row['id']:11s} 写しが {got[0]}x{got[1]}（{want[0]}x{want[1]} のはず）")
            bad += 1
            continue
        print(
            f"  ok  {row['id']:11s} {got[0]}x{got[1]} "
            f"({dst.stat().st_size / 1024:5.1f}KB ← {src.stat().st_size / 1024:6.1f}KB)"
        )
    return 1 if bad else 0


def drill() -> bool:
    """**本物を1枚も焼く前に、判定の足を折る。**

    足は3本。縮める式・名簿の読み・`--check` の目。
    1本でも折れなければ、数字を出さずに 2 で落ちる
    （`docs/island-standards.md` §15）。
    """
    import contextlib
    import io
    import tempfile

    ng = []
    #: 対照の中で焼いたり数えたりした字は**飲む。** 本物の「NG」と混ざると、
    #: 通っている回の出力が落ちた回に見える
    hush = contextlib.redirect_stdout(io.StringIO())

    def want(label, got, exp):
        if str(got) != str(exp):
            ng.append(f"{label}: 出た={got} ほしい={exp}")

    # 足1: 縮める式。**四捨五入と、伸ばさないことの両方**
    want("正方形", box(480, 480), (160, 160))
    want("横長", box(480, 319), (160, 106))
    # **ちょうど .5**。Python の素の `round()` だと 110 になって、
    # 面の `Math.round`（111）とずれる。ここが揃わないと場所取りがずれる
    want("縦長（ちょうど .5 は上へ）", box(442, 640), (111, 160))
    want("端数の切り上げ", box(480, 475), (160, 158))
    want("もう小さい絵は伸ばさない", box(100, 40), (100, 40))
    want("ちょうど 160 も伸ばさない", box(160, 80), (160, 80))
    want("潰れない（1px は残る）", box(1600, 3), (160, 1))

    # 足2: 名簿の読み。**注釈を挟んでも落とさない**（`ts_read.py` の決め）
    toy = """export const STICKERS: Sticker[] = [
  {
    id: "alpha",
    /* ここに注釈が
       何行あっても */
    art: "/goods/alpha.webp",
  },
  { id: "beta", art: "/goods/beta.webp" },
];
"""
    got = ts_read.read_array(toy, "STICKERS", keys=("id", "art"), id_key="id")
    want("名簿を2件読む", len(got.rows), 2)
    want("読み落としが無い", got.missed, 0)
    want("注釈を跨いで art を拾う", got.rows[0]["art"], "/goods/alpha.webp")

    # 足3: `--check` の目。**揃っているものを通し、崩したものを落とす**
    with tempfile.TemporaryDirectory() as box_dir:
        root = Path(box_dir)
        pub = root / "public"
        (pub / "goods").mkdir(parents=True)
        Image.new("RGBA", (480, 480), (10, 20, 30, 255)).save(pub / "goods" / "alpha.webp")
        ts = root / "goods.ts"
        ts.write_text(
            'export const STICKERS: Sticker[] = [\n'
            '  { id: "alpha", art: "/goods/alpha.webp" },\n];\n',
            encoding="utf-8",
        )
        here = sys.modules[__name__]
        keep = (here.GOODS_TS, here.PUBLIC, here.OUT)
        try:
            here.GOODS_TS, here.PUBLIC = ts, pub
            here.OUT = pub / "goods" / "thumb"
            hush.__enter__()
            want("焼く前は落ちる（写しが無い）", check(), 1)
            bake(roster()[0])
            want("焼いたら通る", check(), 0)
            # 寸法を崩す。**在るだけでは通さない**
            Image.new("RGBA", (99, 99), (10, 20, 30, 255)).save(here.OUT / "alpha.webp")
            want("寸法が違えば落ちる", check(), 1)
            # 元絵をそのまま写しの名前で置く。**縮めていないので落ちる**
            Image.open(pub / "goods" / "alpha.webp").save(here.OUT / "alpha.webp")
            want("縮めていなければ落ちる", check(), 1)
            # 元絵のほうを消す。**比べる相手がいないものを通さない**
            bake(roster()[0])
            (pub / "goods" / "alpha.webp").unlink()
            want("元絵が無ければ落ちる", check(), 1)
        finally:
            hush.__exit__(None, None, None)
            here.GOODS_TS, here.PUBLIC, here.OUT = keep

    if ng:
        print("対照 外れ:\n  " + "\n  ".join(ng))
        return False
    print("対照 通った（縮める式7通り（.5 の寄せを含む） / 名簿の読み / --check の目5通り）")
    return True


def main(argv: list[str]) -> int:
    if "--drill" in argv:
        return 0 if drill() else 2
    if not drill():
        return 2
    if "--check" in argv:
        print(f"# 置いてある写しを見る（{OUT.relative_to(REPO) if OUT.is_relative_to(REPO) else OUT}）")
        return check()

    rows = roster()
    want = [a for a in argv if not a.startswith("-")]
    if want:
        rows = [r for r in rows if r["id"] in want]
        if not rows:
            print(f"そんな名前は無い: {want}")
            return 2
    print(f"# {len(rows)}枚を長辺 {THUMB_LONG}px に焼く")
    return 1 if sum(bake(r) for r in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
