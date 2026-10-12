"""キャラクター1人の「背景なし」（plain）を、こちらで用意した**透過の PNG** に差し替える。

**既定では1バイトも書かない。** 何を送るか・いまの plain の形と寸法・
新しい絵の寸法と透過の割合を出すだけ。書くときは `{"apply": true}`。

ARGS 例:
  {"char": "<書類ID か ドライブの icon id>",
   "src": "python/admin/plain_swap/<書類ID>.png"}   … 数えるだけ
  {"char": "…", "src": "…", "apply": true}           … 送る

絵の置き場と、終わったあとの片づけは `python/admin/plain_swap/README.md`。

## なぜ要るか

🃏 の plain は、透過の無い 1600×1200 の RGB で入っていた（#733）。
島では白い四角を背負って立ち、SUZURI のグッズも四角に切られる。
画面（`/me` の図鑑）から選び直せば入るが、**旅先のスマホから
2MB の PNG を選ばせる手間をあやとに渡さない。** 透過版を作った側が
リポジトリに置いて、ここから流す。

## 焼き直し（`characters_rebake.py`）と違うところ

あちらは**幅ごとの版だけ**を送り、元の1枚（`full`）には触らない。
こちらは**`full` ごと差し替える。** 透過の無い元を、透過のある元に
置き換えるのが目的だから。視聴者さんが持ち帰るのも `full` なので、
そこが古いままだと持ち帰った絵だけ四角いままになる。

## 焼き方は画面の `bake` と同じ

`site/components/me/Characters.tsx` の `bake` に合わせる。
**別の焼き方で入れると、画面から入った人とこの1人だけ形が違う**
（2026-09-11 に1人だけ png で入っていて、図鑑が 404 になった）。

  - `full` … 長辺を 2048 で抑える（`FULL_LONG`）。小さければそのまま
  - 幅ごとの版 … 128 / 256 / 640（`WIDTHS`）。**元の幅以下の版は焼かない**
  - 形 … webp、質 0.92（`cv.toDataURL("image/webp", 0.92)`）
  - 高さ … `Math.round(元の高さ × 幅 / 元の幅)`。Python の `round` は
    偶数への丸めで、x.5 のときに1px ずれるので使わない

**webp が焼けない箱では止まる。** 画面は png に落とすが、ここで png を
置くと、置き場に前の `plain-128.webp` が残っている人では**短い名前の口が
古い webp のほうを返す**（`islandCharacter.ts`「同じ幅が2つあれば webp を採る」）。
差し替えたつもりで、島には古い絵が出続ける。

## 送る前に、透過を持っているかを見る

判定は SUZURI と同じ1本（`python/suzuri_common.py` の `transparent()`。
外周1pxの2割以上が透明 かつ 全体の5%以上が透明）。**ここに写さない。**
持っていなければ、数えるだけのときも `apply` のときも 1 で止まる。

## 送ったあとに、本番から読み直す

口の返事ではなく、**オーナーの名簿（`GET /characters`。キャッシュしない）を
引き直して**確かめる。

  - plain の `full` と各幅の指す先が、送る前と変わったこと
  - `full` が webp で、寸法（`w` / `h`）が新しい絵のものになったこと
  - `full` を落とすと、その寸法の、透過を持った絵が返ること
  - **背景あり（scene）が1文字も変わっていないこと**

どれか1つでも外れたら 1 で落ちる。

## 島の短い名前は、すぐには変わらない

`/island-api/characters/{id}/plain-128.webp` は手前（CDN）で1時間、
ブラウザで10分覚える。だから**ここでは合否に使わない。** 返ってきた
大きさを1行出すだけにする。

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。**名前も呼び名も
出さない。** 書類IDは島の絵の id としてすでに公開されているので出す。
"""

import base64
import io
import json
import math
import re
import sys
import urllib.request
from pathlib import Path

from _fs import args, db, log, readonly
from _owner import API_BASE, call, owner_token, reachable

# 判定は SUZURI と同じ1本を借りる（写すと、次に直した日に片方だけ古くなる）
from suzuri_common import transparent

#: 幅ごとの版。`Characters.tsx` / `islandCharacter.ts` の WIDTHS と同じ並び。
WIDTHS = (128, 256, 640)

#: `full` の長辺の上限。`Characters.tsx` の FULL_LONG と同じ。
FULL_LONG = 2048

#: webp の質。`Characters.tsx` の `cv.toDataURL("image/webp", 0.92)`。
WEBP_QUALITY = 92

#: 口が受ける1枚の大きさ。`islandCharacter.ts` の `putImage`（256B〜8MB）。
MIN_BYTES = 256
MAX_BYTES = 8 * 1024 * 1024

ROLE = "plain"

#: `src` を探す根元。**リポジトリの外の絵は送らない。**
#: ワークフローは `python/admin` で走るので、相対の道はここから解く。
REPO = Path(__file__).resolve().parents[2]

UA = {"User-Agent": "Mozilla/5.0 (island-character-plain-swap)"}

#: ドライブの画像IDか、口が振った書類ID（`islandCharacter.ts` の CHARACTER_ID）。
CHAR_ID = re.compile(r"^[A-Za-z0-9_-]{10,64}$")


class Stop(Exception):
    """ここで止める。理由を1行で持つ。"""


# ---------------------------------------------------------------- 外へ出るところ
#
# 見張り（`characters_plain_swap_selftest.py`）がここを差し替える。
# **外へ出る口は、ここの `get` / `public_characters` / `webp_ok` と、
# `call` / `owner_token` / `reachable` / `db` だけ。**


def get(url: str) -> bytes:
    """1枚落とす。"""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def public_characters() -> list:
    """図鑑の口。**札を付けない。名前は返らない。** 数えるだけのときに使う。"""
    return json.loads(get(f"{API_BASE}/characters")).get("characters") or []


def webp_ok() -> bool:
    """この箱の Pillow が webp を書けるか。"""
    from PIL import features

    return bool(features.check("webp"))


# ---------------------------------------------------------------- 小さな道具


def js_round(x: float) -> int:
    """JavaScript の `Math.round`。**x.5 は上へ。** Python の `round` は偶数へ寄せる。"""
    return int(math.floor(x + 0.5))


def ext_of(url) -> str:
    """置き場の URL から拡張子を取る（`…%2Fplain-full.png?alt=media&token=…`）。"""
    head = str(url or "").split("?", 1)[0]
    m = re.search(r"\.([A-Za-z0-9]+)$", head)
    return (m.group(1) if m else "").lower()


def kind_of(buf: bytes):
    """**中身の頭を見て**、何の絵かを決める（`islandCharacter.ts` の `putImage` と同じ見方）。"""
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if buf[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return None


def alpha_stats(buf: bytes) -> dict:
    """寸法と透過の割合。**合否はここで決めない**（`transparent()` が決める）。

    出すための数字。基準は `transparent()` と同じ（ふちは不透明度 8 未満、
    全体は 0 ちょうどを透明と数える）。
    """
    from PIL import Image

    im = Image.open(io.BytesIO(buf))
    out = {"w": im.width, "h": im.height, "mode": im.mode,
           "edge": 0.0, "clear": 0.0}
    if im.mode not in ("RGBA", "LA", "PA") and "transparency" not in im.info:
        return out
    a = im.convert("RGBA").getchannel("A")
    w, h = a.size
    px = a.load()
    edge = ([px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)]
            + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)])
    out["edge"] = sum(1 for v in edge if v < 8) / len(edge)
    out["clear"] = a.histogram()[0] / (w * h)
    return out


def is_clear(buf: bytes) -> bool:
    """透過を持っているか。**判定は `suzuri_common.transparent()` の1本だけ。**"""
    return bool(transparent(io.BytesIO(buf)))


def plan(sw: int, sh: int) -> dict:
    """画面の `bake` が、この寸法の絵から何を焼くか。

    Returns:
        {"full": (幅, 高さ), "sizes": {幅: (幅, 高さ)}}

    `Characters.tsx` の `one(targetW)` と同じ式:
        k = sw > targetW ? targetW / sw : 1
        w = Math.round(sw * k); h = Math.round(sh * k)
    `full` は targetW = Math.round(sw * fullK)（長辺を FULL_LONG で抑える）。
    幅ごとの版は `if (sw <= w) continue;`（元の幅以下は焼かない）。
    """

    def one(target_w: int):
        k = target_w / sw if sw > target_w else 1
        return (max(1, js_round(sw * k)), max(1, js_round(sh * k)))

    long_side = max(sw, sh)
    full_k = FULL_LONG / long_side if long_side > FULL_LONG else 1
    full = one(max(1, js_round(sw * full_k)))
    sizes = {w: one(w) for w in WIDTHS if not sw <= w}
    return {"full": full, "sizes": sizes}


def bake(buf: bytes) -> dict:
    """`full` と幅ごとの版を webp で焼く。

    Returns:
        {"full": bytes, "w": int, "h": int, "sizes": {幅: bytes},
         "dims": {幅: (幅, 高さ)}}
    """
    from PIL import Image

    im = Image.open(io.BytesIO(buf))
    im.load()
    # 透過を持ったまま縮める。Pillow は RGBA の縮小を内側で
    # 乗算済みにして行うので、ふちに黒いにじみは出ない
    im = im.convert("RGBA")
    p = plan(im.width, im.height)

    def enc(size) -> bytes:
        one = im if size == im.size else im.resize(size, Image.LANCZOS)
        b = io.BytesIO()
        one.save(b, "WEBP", quality=WEBP_QUALITY, method=6)
        return b.getvalue()

    return {
        "full": enc(p["full"]),
        "w": p["full"][0],
        "h": p["full"][1],
        "sizes": {w: enc(d) for w, d in p["sizes"].items()},
        "dims": dict(p["sizes"]),
    }


def describe(pic) -> str:
    """いまの絵1枚ぶんを1行で（形と寸法）。"""
    if not pic:
        return "入っていません"
    sizes = pic.get("sizes") or {}
    return "full %s %s×%s / 幅 %s" % (
        ext_of(pic.get("full")) or "なし",
        pic.get("w") or "?",
        pic.get("h") or "?",
        "、".join(f"{w}px {ext_of(u)}" for w, u in sorted(
            sizes.items(), key=lambda kv: int(kv[0]))) or "なし",
    )


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


# ---------------------------------------------------------------- 引く


def resolve(char: str, chars: list, store) -> str:
    """書類IDを決める。**手で書かない。** `store` は Firestore を返す関数（要るときだけ開く）。

    移行した人の書類IDは、ドライブの画像ID（`characters_migrate.py`
    「書類IDは、いまのドライブの画像ID」）。だからまず名簿の `id` と突き合わせる。
    当たらなければ、移行が残した `drivePlainId` で Firestore を引く
    （書類IDとドライブのIDが別になった人のため）。**2人に当たったら決めない。**
    """
    ids = {str(c.get("id")) for c in chars}
    if char in ids:
        log.info("書類ID %s（名簿の id と一致）", char)
        return char
    hits = [s.id for s in store().collection("islandCharacter")
            .where("drivePlainId", "==", char).stream()]
    if len(hits) == 1 and hits[0] in ids:
        log.info("書類ID %s（drivePlainId から引きました）", hits[0])
        return hits[0]
    if len(hits) > 1:
        raise Stop(f"drivePlainId が {len(hits)}人に当たりました。決めずに止めます")
    raise Stop("その char の人が名簿にいません")


def load_src(src: str) -> bytes:
    """差し替える絵を読む。**リポジトリの中の PNG だけ。**"""
    if not src:
        raise Stop("src（リポジトリの中の PNG の道）が要ります")
    p = Path(src)
    if not p.is_absolute():
        p = REPO / p
    p = p.resolve()
    root = REPO.resolve()
    if root not in p.parents:
        raise Stop("src がリポジトリの外を指しています")
    if not p.is_file():
        raise Stop(f"src が見つかりません（{p.relative_to(root)}）")
    buf = p.read_bytes()
    if kind_of(buf) != "png":
        raise Stop(f"src が PNG ではありません（先頭 {buf[:8]!r}）")
    log.info("新しい絵: %s（%.0fKB）", p.relative_to(root), len(buf) / 1024)
    return buf


def check_baked(baked: dict) -> None:
    """焼いたものが口に断られない大きさか、透過が残っているかを、送る前に見る。"""
    for name, b in [("full", baked["full"])] + [
            (f"{w}px", b) for w, b in baked["sizes"].items()]:
        if kind_of(b) != "webp":
            raise Stop(f"{name} が webp になっていません")
        if not MIN_BYTES <= len(b) <= MAX_BYTES:
            raise Stop(f"{name} が {len(b)}バイトで、口の受ける大きさ（256B〜8MB）の外です")
    if not is_clear(baked["full"]):
        raise Stop("焼いた full から透過が抜けました。送りません")


# ---------------------------------------------------------------- 確かめる


def verify(cid: str, before: dict, after: dict, baked: dict) -> list:
    """送る前と後の1人を比べる。**外れたものの説明を返す**（空なら合格）。"""
    bad = []
    was = before.get(ROLE) or {}
    now = after.get(ROLE) or {}
    if not now.get("full") or now.get("full") == was.get("full"):
        bad.append("plain の full の指す先が変わっていません")
    if ext_of(now.get("full")) != "webp":
        bad.append(f"plain の full が webp ではありません（{ext_of(now.get('full'))}）")
    if (now.get("w"), now.get("h")) != (baked["w"], baked["h"]):
        bad.append("plain の寸法が新しい絵のものになっていません"
                   f"（{now.get('w')}×{now.get('h')}、送ったのは {baked['w']}×{baked['h']}）")
    want = {str(w) for w in baked["sizes"]}
    got = {str(w) for w in (now.get("sizes") or {})}
    if got != want:
        bad.append(f"plain の幅がそろっていません（入っている {sorted(got)} / 送った {sorted(want)}）")
    for w in sorted(want & got, key=int):
        u = now["sizes"][w]
        if u == (was.get("sizes") or {}).get(w):
            bad.append(f"plain の {w}px の指す先が変わっていません")
        if ext_of(u) != "webp":
            bad.append(f"plain の {w}px が webp ではありません（{ext_of(u)}）")
    # **背景ありには触らない。** 口は送られてこなかった役どころを残す決まりで、
    # そこが崩れていたらこの1人の背景ありが消えている
    if (before.get("scene") or None) != (after.get("scene") or None):
        bad.append("背景あり（scene）が変わっています")
    if bad:
        return bad
    # 指す先が変わっただけでは、中身が新しい絵かは分からない。落として見る
    try:
        buf = get(now["full"])
    except Exception as e:  # noqa: BLE001 落とせないことも外れとして数える
        return [f"新しい full が落とせません（{type(e).__name__}）"]
    if kind_of(buf) != "webp":
        return [f"新しい full の中身が webp ではありません（先頭 {buf[:8]!r}）"]
    st = alpha_stats(buf)
    if (st["w"], st["h"]) != (baked["w"], baked["h"]):
        bad.append(f"新しい full の中身が {st['w']}×{st['h']} です"
                   f"（送ったのは {baked['w']}×{baked['h']}）")
    if not is_clear(buf):
        bad.append("新しい full に透過がありません")
    return bad


NO_CLEAR = ("新しい絵に透過がありません（ふちの2割以上・全体の5%以上が透明、"
            "の両方が要ります）。送りません")
NO_WEBP = "この箱では webp が焼けません。png で置くと古い webp が島に出続けるので止めます"


def find(chars: list, cid: str) -> dict:
    for c in chars:
        if c.get("id") == cid:
            return c
    raise Stop(f"{cid} が名簿にいません")


# ---------------------------------------------------------------- 本体


def run(a: dict) -> None:
    apply = a.get("apply") is True
    char = str(a.get("char") or "").strip()
    src = str(a.get("src") or "").strip()
    if not char:
        raise Stop("char（書類ID か ドライブの icon id）が要ります")
    if not CHAR_ID.match(char):
        raise Stop(f"char の形が違います（{len(char)}文字）")

    buf = load_src(src)
    st = alpha_stats(buf)
    clear = is_clear(buf)
    can_webp = webp_ok()
    # **送るときは、札を取る前に止める。** 透過の無い絵のために本番の札を作らない
    if apply and not clear:
        raise Stop(NO_CLEAR)
    if apply and not can_webp:
        raise Stop(NO_WEBP)

    # Firestore は、名簿の id で当たらなかったときと、札を取るときだけ要る。
    # **数えるだけのときは、書く口ごと塞いで読む。** `if apply:` を書き忘れても止まる
    held = {}

    def store():
        if "c" not in held:
            held["c"] = db() if apply else readonly(db())
        return held["c"]

    token = None
    if apply:
        token = owner_token(store())
        log.info("口に頼む札を取りました")
        # オーナーの名簿はキャッシュしない。名前と呼び名も入っている（送り返すのに要る）
        chars = call("GET", "/characters", token).get("characters") or []
    else:
        # 数えるだけなら、札を付けない図鑑の口で足りる（名前は返らない）
        chars = public_characters()
    log.info("図鑑 %d人", len(chars))
    cid = resolve(char, chars, store)
    before = find(chars, cid)
    log.info("いまの plain: %s", describe(before.get(ROLE)))
    log.info("いまの scene: %s（触りません）", describe(before.get("scene")))

    # いまの full が本当に透過なしかを、中身で見る（書類の w/h は名乗り）
    cur = (before.get(ROLE) or {}).get("full")
    if cur:
        try:
            cb = get(cur)
            cs = alpha_stats(cb)
            log.info(
                "いまの plain の中身: %s %d×%d（%s）／ふちの透明 %s・全体の透明 %s → %s",
                kind_of(cb) or "画像でない", cs["w"], cs["h"], cs["mode"],
                pct(cs["edge"]), pct(cs["clear"]),
                "透過あり" if is_clear(cb) else "透過なし",
            )
        except Exception as e:  # noqa: BLE001 数えるための読みなので、落ちても先へ進む
            log.warning("いまの plain の中身が読めませんでした（%s）", type(e).__name__)

    log.info(
        "新しい絵の寸法 %d×%d（%s）／ふちの透明 %s・全体の透明 %s → %s",
        st["w"], st["h"], st["mode"], pct(st["edge"]), pct(st["clear"]),
        "透過あり" if clear else "透過なし",
    )
    if not clear:
        raise Stop(NO_CLEAR)
    if not can_webp:
        raise Stop(NO_WEBP)

    baked = bake(buf)
    check_baked(baked)
    total = len(baked["full"]) + sum(len(b) for b in baked["sizes"].values())
    log.info(
        "送るもの: full webp %d×%d %.0fKB ＋ %s（合計 %.0fKB）",
        baked["w"], baked["h"], len(baked["full"]) / 1024,
        "、".join(f"{w}px webp {d[0]}×{d[1]} {len(baked['sizes'][w]) / 1024:.1f}KB"
                 for w, d in sorted(baked["dims"].items())) or "幅ごとの版なし",
        total / 1024,
    )

    if not apply:
        log.info('空回しです（1バイトも書いていません）。送るには {"apply": true} を付けてください')
        return

    # 名前と呼び名は**そのまま送り返す。** 口は送られてきたぶんで上書きするので、
    # 付けずに投げると名前も呼び名も空になる（`characters_rebake.py` と同じ）
    out = call(
        "POST",
        f"/characters/{cid}",
        token,
        {
            "channelName": before.get("channelName") or "",
            "emoji": before.get("emoji") or "",
            "aliases": before.get("aliases") or [],
            # **送るのは plain だけ。** scene を付けないので、口は scene に触らない
            ROLE: {
                "full": base64.b64encode(baked["full"]).decode("ascii"),
                "sizes": {
                    str(w): base64.b64encode(b).decode("ascii")
                    for w, b in baked["sizes"].items()
                },
                "w": baked["w"],
                "h": baked["h"],
            },
        },
    )
    if not ((out.get("character") or {}).get(ROLE) or {}).get("full"):
        raise Stop("口の返事に plain の full がありません")
    log.info("送りました。本番の名簿から読み直します")

    # **口の返事ではなく、キャッシュしない名簿から読み直す**
    after = find(call("GET", "/characters", token).get("characters") or [], cid)
    bad = verify(cid, before, after, baked)
    if bad:
        for b in bad:
            log.error("%s", b)
        raise Stop(f"差し替えを確かめられませんでした（{len(bad)}件）")
    log.info("いまの plain: %s", describe(after.get(ROLE)))
    log.info("確かめました: plain の指す先が変わり、full が webp %d×%d・透過あり。scene はそのまま",
             baked["w"], baked["h"])

    # 島の短い名前は手前で最長1時間覚えるので、合否には使わない（冒頭の説明）
    if 128 in baked["sizes"]:
        status, kind, size = reachable(f"{API_BASE}/characters/{cid}/{ROLE}-128.webp")
        log.info(
            "島の短い名前 %s-128: %d %s %dバイト（送った 128px は %dバイト。"
            "違っていれば手前の覚えで、1時間以内に入れ替わります）",
            ROLE, status, kind or "型なし", size, len(baked["sizes"][128]),
        )


def main() -> None:
    try:
        run(args())
    except Stop as e:
        log.error("%s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
