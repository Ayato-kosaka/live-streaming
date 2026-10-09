"""SUZURI のグッズで、どこから触っても同じになるもの（大きさ・絵の下ごしらえ・透過・題と本文）。

読む側は2つ:
  - `.claude/skills/suzuri/suzuri_ops.py`（EC2 の Chrome から触る。EC2 には /home/ubuntu/cdp/ に置く）
  - `python/suzuri_api.py`（GitHub Actions から公式の API で触る）

**ここを2か所に写さない。** 大きさの決め方は3回外して直した（`.claude/skills/suzuri/ops.md` 5章）。
写すと、次に直した日に片方だけ古いまま残る。
"""

# 品目の名前 → SUZURI の itemId と、見本にする型（色・大きさ）。
# 型は `data-items` の variants から。Acrylic Panel は 100x148mm のクリア1種、Mug は白 M の1種
ITEM_IDS = {"sticker": 11, "acrylic-keychain": 147, "can-badge": 17, "mug": 3, "acrylic-panel": 766}
# 見本に出す型。缶バッジは今までどおり 44mm（849）。ほかは1種しか無いか、透明の 50mm
SAMPLE_VARIANT = {"sticker": 606, "acrylic-keychain": 1952, "can-badge": 849, "mug": 82, "acrylic-panel": 4938}


def badge_scale(path, margin=0.80):
    """缶バッジの大きさ。既定（scale=1）は正方形の絵が丸い面を**覆う**大きさで、
    四隅がはみ出して切れる（🦄 で、たてがみと脚が切れた）。
    中心からいちばん遠い「描いてある画素」までの距離を測り、それが丸の中に
    収まる大きさにする。缶バッジは縁が側面へ回り込むので、`margin` ぶん内側に置く。
    **ここで返すのは 1255px の絵（🦄）で合わせた値。** 画素数の違う絵は `layout()` が
    割り戻す（下の MM_PER_PX の注を読む）。直接 set_items に渡さない。"""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    small = im.resize((200, 200 * im.height // im.width))
    a = small.getchannel("A")
    w, h = small.size
    cx, cy = w / 2, h / 2
    px = a.load()
    rmax = max(((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 for y in range(h) for x in range(w) if px[x, y] >= 16)
    return round(min(1.0, (min(w, h) / 2) / rmax * margin), 3)


# **SUZURI の scale は「絵の画素数 × 倍率」で効く**（埋める大きさに対する倍率ではない）。
# 同じ 0.73 でも、783px の絵は 1255px の絵の 6割の大きさに刷られる。前から上がっていた絵
# （644〜1044px）だけ缶バッジもパネルも小さく出て気づいた（2026-10-09）。
# 見本で測ると、刷られる大きさ ≈ MM_PER_PX × scale × 画素数（縦横とも）:
#   🦄 1255px・0.64 で中身 1114px → 89mm、🪽 1562px・0.632 で 1236px → 94mm、
#   🐈‍⬛ 1362px・0.788 で縦 1310px → 約 130mm。どれも 0.12〜0.126
MM_PER_PX = 0.123
# 缶バッジの大きさを合わせた基準の絵（🦄）の画素数。これより大きい絵は scale を小さく
REF_PX = 1255


def panel_fit(path, max_w=86, max_h=115):
    """アクリルパネル（100x148mm の縦長）の大きさと縦の位置。
    中身（描いてある外接矩形）が幅 max_w・高さ max_h mm（下はスタンドのぶん空ける）に
    収まるいちばん大きい scale を取り、正方形の真ん中をパネルの高さの 47% に置く。
    既定では絵の上端がパネルの上端に付き、offsetY はパネルの高さに対する割合で下へ動く
    （🦄 で 0.1 → 約 1割）。
    縦は横より少し大きく出る（島にいるあやと 0.806 で中身が約 128mm。見積もりは 122mm）。
    max_h=122 では縦長の絵の頭がパネルの上端すれすれになったので 115 にしてある。"""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v >= 16 else 0).getbbox()
    side = max(im.size)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    s = min(max_w / (MM_PER_PX * w), max_h / (MM_PER_PX * h))
    return {"scale": round(s, 3), "offsetY": round((148 * 0.47 - MM_PER_PX * s * side / 2) / 148, 3)}


def _side(path):
    from PIL import Image
    return max(Image.open(path).size)


def layout(path):
    """5品目の並びと大きさ（`.claude/skills/suzuri/ops.md` 5章）。
    ステッカー・キーホルダーは絵の形に沿って切られ、マグは高さいっぱいで片面に収まるので既定のまま。
    缶バッジとパネルは `badge_scale` / `panel_fit` で決め、**画素数で割り戻す**。

    **offsetY だけ渡すと横に動く。** 見本の URL は `scale+offsetX±offsetY` で組まれていて、
    offsetX が空だと offsetY の値が横の位置として読まれた（2026-10-09 に踏んだ）。
    縦を動かすときは offsetX=0.0 を必ず一緒に渡す。"""
    return [
        {"item": "sticker"},
        {"item": "acrylic-keychain"},
        {"item": "can-badge", "scale": round(badge_scale(path) * REF_PX / _side(path), 3), "offsetX": 0.0, "offsetY": 0.0},
        {"item": "mug"},
        dict({"item": "acrylic-panel", "offsetX": 0.0}, **panel_fit(path)),
    ]


TITLE = "カサ・アヤトの住人 {emoji}"
# あやとの指定（2026-10-09）。字の間の空きも、そのまま
DESCRIPTION = (
    "あやと（YouTube@あやとグルメアプリ）のライブ配信のコンセプトである、「あやと島」の住人として"
    "配信を盛り上げてくれる視聴者さんのオリジナルアイコン（{emoji}）が、ついに グッズ化 しました！\n"
    "配信を通じて生まれた、個性あふれるアイコンを いつでも、どこでも持ち歩けるグッズ に！\n"
    "デザインが気に入った方は、ぜひ手に取ってみてください🏡✨"
)


ORDER = ["sticker", "acrylic-keychain", "can-badge", "mug", "acrylic-panel"]


def prep(src, dst, pad=1.04):
    """余白を落として正方形に置き直す。**どの品目の大きさも、絵の外接矩形で決まる**ので、
    余白の広い絵（SUZURI に前から上がっていた絵の多く）は缶バッジもマグも小さく出る。
    alpha が 8 未満の点は塵として落とす（描き直しの絵に alpha 1〜7 の点が散っていて、
    外接矩形がそこまで伸びた: tools/characters/charbake.py と同じ理由）。"""
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 0 if v < 8 else v)
    im.putalpha(a)
    im = im.crop(a.getbbox())
    side = int(max(im.size) * pad)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.save(dst, optimize=True)
    return dst


def transparent(path):
    """背景が抜けているか。**毎回、上げる前に確かめる**（あやと 2026-10-09）。
    島の「背景なし」の絵でも、🃏 は透過が無く白い四角の地が付いていた。そのまま上げると
    ステッカーもキーホルダーも四角に切られる。

    見るのは**ふち（外周1px）の2割以上が透明か**と、**全体の 5% 以上が透明か**。
    四隅だけで見ると、足元が下の角まで届く絵（🎃）を「抜けていない」と誤って落とす。
    ⛰️ は山の裾が3辺にかかっていて、ふちの透明は半分に届かない。地が焼き付いた絵なら
    ふちの透明はほぼ 0 なので、2割で分かれる"""
    from PIL import Image
    im = Image.open(path)
    if im.mode not in ("RGBA", "LA", "PA") and "transparency" not in im.info:
        return False
    a = im.convert("RGBA").getchannel("A")
    w, h = a.size
    px = a.load()
    edge = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    edge_clear = sum(1 for v in edge if v < 8) / len(edge)
    clear = a.histogram()[0] / (w * h)
    return edge_clear >= 0.2 and clear >= 0.05


# あやとの絵のグッズの本文（ayato.md）。1行目だけ絵ごとに書き、これを後ろに足す
AYATO_COMMON = (
    "\nあやと（YouTube@あやとグルメアプリ）のライブ配信「あやと島」から、あやと本人がグッズになりました！"
    "\n配信のおともに、旅のおともに。いつでも、どこでも、あやとと一緒に🏝️✨"
)
