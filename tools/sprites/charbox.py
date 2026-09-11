#!/usr/bin/env python3
"""キャラクターの絵の中で、**実際に描かれている範囲**を測って焼く。

キャラクターの絵はどれも正方形の枠だが、中に描かれた figure の大きさは
人によって違う（幅 47% しか使っていない人もいれば、高さ 59% の人もいる）。
枠で置くと、枠は同じでも**島に立ったときの大きさが人によって倍近く違う**。

島のスプライト（`content/sprites.json`）と同じ考え方で、
「絵の中で物体がどこにあるか」を先に測っておく。置くほうはこれを見て、
どの人も同じ大きさに見えるように寸法を決める（`components/island/Sprite.tsx`）。

  python3 tools/sprites/charbox.py

## どこから絵を取るか

**`/island-api/characters` が返す 640px の webp。** ドライブではない。

前は `residents.ts` に載っている22人ぶんを `/tmp/avatars`（ドライブから
落としたもの）から測っていた。いまは絵の原本が Firebase Storage にあり、
島に立たない人も含めて全員ぶんある。**図鑑（`/friends`）は全員を並べる**
ので、22人ぶんしか無いと、残りが「枠いっぱい」の既定値で置かれて
大きさが不揃いになる。あやとが 2026-09-10 に指摘したのがまさにそれ。

`full` ではなく 640 の webp を使う。`full` は1枚 2MB あって全員ぶんで
190MB になるうえ、測るのは**透明でない画素の外接矩形**なので、
640px あれば 0.15% きざみで足りる。640 が無い人（元の絵が 640px より
小さくて焼かれなかった人）は 256、128 と落ちる。

## 減ったら書かない

口が落ちていたり、返ってくる人数が減っていたりしたときに黙って
焼き直すと、**島の全員が「枠いっぱい」に戻る。** 赤くならず、
島の大きさだけが不揃いになるので気づけない。いま入っている人数より
減る焼き直しは断る。
"""
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

API = os.getenv("ISLAND_API") or "https://live-streaming-d3cac.web.app/island-api"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "site", "content", "characterBox.ts")


def fetch(url: str, timeout: int = 90) -> bytes:
    """落とす。**中身までは見ない**（呼ぶ側が Pillow に通して確かめる）。"""
    req = urllib.request.Request(url, headers={"User-Agent": "island-charbox"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main() -> None:
    """エントリポイント。"""
    j = json.loads(fetch(f"{API}/characters"))
    chars = j.get("characters") or []
    print(f"口が返した {len(chars)}人")

    rows = []
    for c in chars:
        cid = c.get("id") or ""
        # 測るのは**背景なし**。背景ありは四隅まで塗ってあるので外接矩形が
        # 必ず枠いっぱいになり、測る意味が無い
        sizes = (c.get("plain") or {}).get("sizes") or {}
        # 640 が無い人がいる。**元が 640px より小さいと焼かれない**
        # （引き伸ばさない決まり。`characters_migrate.py`「大きさは、こちらで焼く」）。
        # その人だけ既定値に落とすと、図鑑でその人だけ大きさが揃わない。
        # 大きいほうから、あるものを使う
        src = next((sizes[k] for k in ("640", "256", "128") if sizes.get(k)), "")
        if not cid or not src:
            print(f"  背景なしの絵が無い: {cid}", file=sys.stderr)
            continue
        try:
            im = Image.open(io.BytesIO(fetch(src))).convert("RGBA")
        except Exception as e:  # noqa: BLE001 — 1人こけても残りは焼く
            print(f"  絵が開けない: {cid} {e}", file=sys.stderr)
            continue
        bb = im.split()[3].getbbox()
        if not bb:
            print(f"  中身が空: {cid}", file=sys.stderr)
            continue
        x0, y0, x1, y1 = bb
        w, h = im.size
        rows.append((
            cid,
            round(x0 / w, 4), round(y0 / h, 4),
            round((x1 - x0) / w, 4), round((y1 - y0) / h, 4),
            round(w / h, 4),
        ))

    # 減る焼き直しは断る（先頭の説明「減ったら書かない」）
    had = len(re.findall(r'^\s{2}"[^"]+":\s\[', open(OUT, encoding="utf-8").read(), re.M)) if os.path.exists(OUT) else 0
    if len(rows) < had:
        print(f"いま {had}人ぶん入っているのに {len(rows)}人しか測れなかったので書きません", file=sys.stderr)
        raise SystemExit(1)

    body = "\n".join(
        f'  "{i}": [{x}, {y}, {ww}, {hh}, {ar}],' for i, x, y, ww, hh, ar in rows
    )
    open(OUT, "w", encoding="utf-8").write(HEAD + body + TAIL)
    print(f"{len(rows)}人ぶん焼いた（前は {had}人）→ {OUT}")


HEAD = """/**
 * キャラクターの絵の中で、**実際に描かれている範囲**。
 *
 * **自動生成。手で直さない。** 作り直す:
 *   python3 tools/sprites/charbox.py
 *
 * 枠はどれも正方形だが、中の figure は人によって幅 47%〜100%、
 * 高さ 59%〜100% とばらばら。枠で置くと、島に立った大きさが倍近く違う
 * （あやと「大きさも不揃い」2026-09-10）。島のスプライトが
 * `content/sprites.json` に物体の範囲を持っているのと同じ理由で、
 * ここに測った値を持っておいて、置くほうがそれを見て寸法を決める。
 *
 * **島に立つ22人だけでなく、図鑑に並ぶ全員ぶん入っている。**
 * 図鑑（`/friends`）は口から取った全員を同じ大きさで並べるので、
 * 22人ぶんしか無いと残りが既定値（枠いっぱい）になって不揃いになる。
 *
 * 値は元の絵に対する割合 `[左, 上, 幅, 高さ]` と、元の絵の縦横比 `ar`（幅÷高さ）。
 */
export type CharBox = readonly [x: number, y: number, w: number, h: number, ar: number];

const BOX: Record<string, CharBox> = {
"""

TAIL = """
};

/**
 * その絵の、描かれている範囲。測っていない絵は「枠いっぱい」として返す。
 *
 * **測っていない人を、誰かの値で埋めない。** 埋めると、その人だけ
 * 別人の形で置かれることになる。枠いっぱいなら、少なくとも嘘はつかない。
 */
export function charBox(icon: string): CharBox {
  return BOX[icon] ?? [0, 0, 1, 1, 1];
}

/**
 * 島に立てるときの寸法。**どの人も同じ大きさに見えるようにそろえる。**
 *
 * 高さでそろえると、寝そべった絵（描かれた高さが枠の 59%）が横に 1.7 倍へ
 * 伸びて巨大になる。幅でそろえると、細長い絵（幅 47%）が背だけ高くなる。
 * **見た目の大きさは面積で決まる**ので、描かれた部分の幅と高さの
 * 相乗平均が `figure` になるようにそろえる。
 * それでも背丈が極端に離れないよう、高さに上下の頭打ちを付ける。
 *
 * @param icon    どの絵か
 * @param figure  そろえたい「描かれた部分」の大きさ（ワールド単位）
 * @returns 貼る矩形。足元の中央が (0, 0) に来る。元の絵の比のままなので
 *          `preserveAspectRatio` は効かせなくてよい。
 */
export function charPlace(icon: string, figure: number) {
  const [bx, by, bw, bh, ar] = charBox(icon);
  /* 描かれた部分の相乗平均を figure にそろえる枠の高さ。
     描かれた幅 = bw*h*ar、高さ = bh*h なので、
     √(幅×高さ) = h√(bw·bh·ar) = figure から逆算する。 */
  let h = figure / Math.sqrt(Math.max(0.05, bw * bh * ar));
  // 背丈の頭打ち。面積をそろえきると、細長い人だけ頭ひとつ抜ける
  const hi = (figure * 1.25) / bh;
  const lo = (figure * 0.85) / bh;
  h = Math.min(hi, Math.max(lo, h));
  const w = h * ar;
  return {
    /** 貼る矩形（足元の中央が原点） */
    x: -(bx + bw / 2) * w,
    y: -(by + bh) * h,
    w,
    h,
    /** 描かれた部分の見た目の幅・高さ。影と当たり判定はこちらに合わせる */
    fw: bw * w,
    fh: bh * h,
  };
}

/**
 * 島の外（`<img>` で出すところ）で、同じそろえ方をする。
 *
 * 器いっぱいに `object-fit: contain` で置いたものを、拡げたり寄せたりする
 * `transform` を返す。**器は正方形にしておくこと**（正方形でないと、
 * 絵の描かれる位置と % のもとになる箱がずれる）。
 *
 * @param icon   どの絵か
 * @param want   器に対して、描かれた部分をどれくらいの大きさにしたいか
 * @param bottom 足元を器の底に合わせる（地面に立たせるとき）
 */
export function charFit(icon: string, want: number, bottom = false): { transform: string } {
  const [bx, by, bw, bh, ar] = charBox(icon);
  let k = want / Math.sqrt(Math.max(0.05, bw * bh * ar));
  k = Math.min((want * 1.25) / bh, Math.max((want * 0.85) / bh, k));
  /* `translate(t) scale(k)` は「拡大してから動かす」ので、中心から c にある点は
     k·c へ動く。t = ねらい − k·c。単位は**拡大前の器**に対する割合。 */
  const cx = (bx + bw / 2 - 0.5) * ar;
  const cy = bottom ? by + bh - 0.5 : by + bh / 2 - 0.5;
  const tx = -k * cx;
  const ty = (bottom ? 0.5 : 0) - k * cy;
  return { transform: `translate(${(tx * 100).toFixed(1)}%, ${(ty * 100).toFixed(1)}%) scale(${k.toFixed(3)})` };
}
"""

main()
