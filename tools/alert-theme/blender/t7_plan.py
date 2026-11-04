#!/usr/bin/env python3
"""1万円の段（段7「ドラキュラ城が本気を出す」）の、秒の割り振り・カメラ・並びと、描くコマの分けかた。

Blender の場面（`castle_t7.py`）も、この箱の書き出し（`t7_pack.py`）も、ワークフロー
（`.github/workflows/alert_blender.yml`）も、ここだけを読む。秒やカメラを1か所で決めるため。
Blender は要らない（素の Python で動く）。

    python3 tools/alert-theme/blender/t7_plan.py shards 20               # ワークフローの matrix（JSON）
    python3 tools/alert-theme/blender/t7_plan.py shards 4 --only intro:0,60,120,165,200 stay:0 outro:20
    python3 tools/alert-theme/blender/t7_plan.py layout                  # 主な場所が画面のどこに写るか

## 動画の3本（`scratchpad/novfx/CONTRACT.md` の約束）

| 本 | 秒 | 中身 |
| --- | --- | --- |
| intro | 0〜7.0 | 前兆（いつもの城が揺れる・窓が灯る・こうもり）→ 暗転 → 夜の城にふくらむ → 門が開く → ピポ・あやと → 金貨 → 門の光（`REVEAL`）→ 落ち着く |
| stay | 3.0 の輪 | 頭と尻がつながる。動くものは全部 3.0 秒で1周する（金貨は 1.5 / 1.0 秒） |
| outro | 1.5 | 城が貯金箱の大きさに戻り、金貨が吸い込まれる。最後のコマは透明 |

intro の最後のコマの次は stay の頭（stay の τ=0 と intro の t=7.0 が同じ姿）、stay の最後の次も stay の頭、
outro の頭は stay の τ=0 の次の姿。継ぎ目が出ないように、全部の動きを1つの関数から出す（`castle_t7.py` の `pose`）。
"""
import json
import math
import sys

FPS = 30
W, H = 720, 1280

# 秒
INTRO = 7.0
STAY = 3.0
OUTRO = 1.5
# 投げた人のキャラ絵が門の光から出る秒（intro の中）
REVEAL = 5.6

CLIPS = {
    "intro": int(round(INTRO * FPS)),
    "stay": int(round(STAY * FPS)),
    "outro": int(round(OUTRO * FPS)),
}
# Blender の時間軸の上で、それぞれの本を置く頭のコマ（動きのぶれの前後の1コマぶん、間を空ける）
BASE = {"intro": 1, "stay": 1001, "outro": 2001}

# 描く層（Blender の view layer）。書き出しで重ねる
#   scene … 城・岩・空・月・木・こうもり・金貨・ピポ・門の光（キャラ絵の後ろ）
#   ayato … 伯爵のあやとだけ（手前を横切る金貨・こうもりは穴になる）。light の版で城を薄くしても、あやとは残すため
#   front … キャラ絵の前に置く光と粒だけ
LAYERS = ("scene", "ayato", "front")

# ---- カメラ（縦の 24mm に対するレンズ。縦を上に保つため、上を向かずに shift で画面を上へずらす） ----
CAM = {
    "loc": (0.0, -31.0, 1.7),
    "pitch_deg": 4.0,
    "lens": 21.0,
    "sensor_h": 24.0,
    "shift_y": 0.155,
    # ピントは門の前（投げた人のキャラ絵が立つ所）
    "focus": (0.0, -2.0, 4.0),
    "fstop": 0.5,
}

# ---- 並び（m）。門の真ん中の床が原点。城は +y の奥、カメラは -y ----
GATE = {"half_w": 3.2, "spring": 4.0, "y": -1.2}  # 門の口の半幅・アーチの付け根の高さ・正面の y
ROCK_TOP = 9.2
# 前兆のあいだのレンズ（そこから寄って CAM["lens"] になる）
LENS_FROM = 19.5
# 貯金箱の城（前兆の絵）を画面のどこに出すか（px）。配信の箱を広げたときの城の大きさに近づけた
BANK_RECT = (360 - 135, 1236 - 226, 270, 226)  # x, y, w, h（絵の 560×470 の中身をこの四角に）


# 試しの絵（preview）で描くコマ。前兆・暗転・ふくらむ・門・ピポ・あやと・金貨・キャラ絵・落ち着く・滞在・締め
PREVIEW = "intro:10,30,44,52,66,80,96,112,132,150,168,190,205 stay:0,45 outro:10,24,34"


def frames():
    """描くコマの一覧: (本, 0 から数えたコマ)"""
    out = []
    for clip, n in CLIPS.items():
        out += [(clip, i) for i in range(n)]
    return out


def clip_time(clip, i):
    """本の中の秒"""
    return i / FPS


def parse_only(items):
    """`intro:0,60 stay:0` → [(intro,0),(intro,60),(stay,0)]"""
    out = []
    for it in items:
        clip, _, rest = it.partition(":")
        if clip not in CLIPS:
            raise SystemExit(f"本の名前が違う: {clip}")
        if not rest:
            out += [(clip, i) for i in range(CLIPS[clip])]
            continue
        for part in rest.split(","):
            if "-" in part:
                a, b = (int(x) for x in part.split("-"))
                out += [(clip, i) for i in range(a, b + 1)]
            else:
                out.append((clip, int(part)))
    return out


def shards(n, only=None):
    """n 本に分ける。重いコマ（城が大きく写る intro の後半・stay）が1本に固まらないよう、順に配る"""
    todo = only if only else frames()
    groups = [[] for _ in range(min(n, len(todo)))]
    for k, f in enumerate(todo):
        groups[k % len(groups)].append(f)
    return [" ".join(f"{c}:{i}" for c, i in g) for g in groups]


# ---- 画面に写す（Blender のカメラと同じ式。shift は画面の高さに対する割合） ----
def project(p):
    cx, cy, cz = CAM["loc"]
    a = math.radians(CAM["pitch_deg"])
    fwd = (0.0, math.cos(a), math.sin(a))
    up = (0.0, -math.sin(a), math.cos(a))
    d = (p[0] - cx, p[1] - cy, p[2] - cz)
    x = d[0]
    y = d[0] * 0 + d[1] * up[1] + d[2] * up[2]
    z = d[1] * fwd[1] + d[2] * fwd[2]
    k = CAM["lens"] / (CAM["sensor_h"] / 2)
    sx = W / 2 + (x / z) * k * (H / 2)
    sy = H / 2 - (y / z) * k * (H / 2) + CAM["shift_y"] * H
    return sx, sy, z


def unproject(sx, sy, depth, lens=None):
    """画面の (sx, sy) に、カメラから前へ depth の所で写る点（世界の座標）。lens を渡すと、そのレンズのとき"""
    cx, cy, cz = CAM["loc"]
    a = math.radians(CAM["pitch_deg"])
    k = (lens or CAM["lens"]) / (CAM["sensor_h"] / 2)
    x = (sx - W / 2) / (k * H / 2) * depth
    y = -(sy - H / 2 - CAM["shift_y"] * H) / (k * H / 2) * depth
    fwd = (0.0, math.cos(a), math.sin(a))
    up = (0.0, -math.sin(a), math.cos(a))
    return (cx + x, cy + fwd[1] * depth + up[1] * y, cz + fwd[2] * depth + up[2] * y)


LAYOUT_POINTS = {
    "門の床": (0, GATE["y"], 0),
    "門のアーチの上": (0, GATE["y"], GATE["spring"] + GATE["half_w"]),
    "門の右の端": (GATE["half_w"], GATE["y"], 0),
    "岩の上": (0, 1.0, ROCK_TOP),
    "広間の軒": (0, 3.0, ROCK_TOP + 5.6),
    "高い塔の先": (3.6, 2.4, ROCK_TOP + 18.2),
    "ピポの露台": (3.6, 0.2, ROCK_TOP + 8.6),
    "左の塔の先": (-7.0, 2.6, ROCK_TOP + 10.6),
    "左の塔の外": (-8.7, 2.6, ROCK_TOP + 2),
    "右の塔の外": (8.8, 3.2, ROCK_TOP + 2),
    "手前の石畳": (0, -14, 0),
}


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    if args[0] == "shards":
        n = int(args[1])
        only = None
        if "--only" in args:
            rest = [a for a in args[args.index("--only") + 1:] if a.strip()]
            if rest == ["preview"]:
                rest = PREVIEW.split()
            only = parse_only(rest) if rest else None
        print(json.dumps(shards(n, only), ensure_ascii=False))
    elif args[0] == "count":
        g = json.loads(args[1])
        print(f"{len(g)} 台・{sum(len(x.split()) for x in g)} コマ")
    elif args[0] == "meta":
        m = json.load(open(args[1]))
        s = sorted(f["sec"] for f in m["frames"])
        print(f"{len(s)} コマ・1コマ 中央値 {s[len(s) // 2]:.1f} 秒・最長 {s[-1]:.1f} 秒・組み立て {m['build_sec']} 秒"
              f"（{m.get('blender')}・{m.get('quality')}・{m.get('view_transform')}・透明 {m.get('alpha_encoding')}）")
    elif args[0] == "layout":
        for name, p in LAYOUT_POINTS.items():
            sx, sy, z = project(p)
            print(f"{name:10s} ({sx:6.0f}, {sy:6.0f})  奥行き {z:5.1f}m")
        print("キャラ絵の枠: x 137〜583 / y 486〜1024、顔は (360, 590) 半径 74")
    else:
        raise SystemExit(f"知らない言いつけ: {args[0]}")


if __name__ == "__main__":
    main()
