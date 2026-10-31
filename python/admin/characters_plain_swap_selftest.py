"""偽の Firestore と**口のそっくりさん**で、`characters_plain_swap` を動かして確かめる。

    python3 python/admin/characters_plain_swap_selftest.py

**本番には1バイトも出ない。ネットにも出ない。** Firestore も資格情報も要らない。
外へ出る口（`get` / `public_characters` / `call` / `owner_token` / `reachable` /
`db`）は全部ここで差し替える。

## 確かめるもの

  1. **`apply` 無しでは、書き込みの口（`POST`）を1回も呼ばない。** 札も取らない。
     Firestore にも書かない
  2. 透過の無い絵は、数えるだけでも `apply` でも **1 で止まる**（`apply` は札を取る前）
  3. 送る版の幅・寸法・形式が、画面の `bake`（`Characters.tsx`）の式と一致する。
     x.5 の丸めで Python の `round` とずれる寸法も当てる
  4. 送るのは **plain だけ**（scene を付けない）。名前・絵文字・呼び名は送り返す
  5. 送ったあとの読み直しが、**口が崩れたときに本当に落ちる**
     （`full` を残す口・scene を落とす口・中身が古いままの口）。
     **その前に、崩れていない口で通ることを見る**（`island-misses.md` #99）
  6. 書類IDは名簿の id、無ければ `drivePlainId` から引く。2人に当たれば止まる
  7. リポジトリの外の絵・PNG でない絵・webp が焼けない箱は止まる
  8. 出力に**名前も呼び名も1文字も出ない**
"""

import base64
import copy
import io
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 出力を丸ごと溜める袋。**`_fs` の basicConfig を読み込む前に**二股にする
BUF = io.StringIO()
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr


class Tee:
    """画面にも出しつつ、袋にも同じものを入れる。"""

    def __init__(self, *ws):
        self.ws = ws

    def write(self, s):
        for w in self.ws:
            w.write(s)
        return len(s)

    def flush(self):
        for w in self.ws:
            try:
                w.flush()
            except Exception:  # noqa: BLE001
                pass


sys.stdout = Tee(REAL_OUT, BUF)
sys.stderr = Tee(REAL_ERR, BUF)

os.environ.setdefault("BQ_PROJECT_ID", "characters-plain-swap-selftest")

from PIL import Image, ImageDraw  # noqa: E402

import characters_plain_swap as ps  # noqa: E402
from _fake_fs import FakeCollection, FakeDb, FakeSnap  # noqa: E402
from suzuri_common import transparent  # noqa: E402

# ---------------------------------------------------------------- 偽の中身
#
# **本物の名前もハンドルも使わない。** 書類IDも形だけ似せてある。

CID = "1fakeplainswap000000000000000000A"
OTHER = "1fakeplainswap000000000000000000B"
# 書類IDとドライブのIDが別になった人（`drivePlainId` から引く）
DRIVE_ONLY = "1fakedriveonly000000000000000000C"
# 2人に当たる drivePlainId
TWICE = "1faketwice00000000000000000000000D"
NAME = "@himitsu-no-namae-0001"
ALIAS = "ひみつのよびな"

BUCKET = "https://firebasestorage.googleapis.com/v0/b/fake/o/"


def png(size, mode, bg, blob=None, noise=False) -> bytes:
    """絵を1枚作る。`blob` は真ん中に描く不透明の楕円の色。"""
    im = Image.new(mode, size, bg)
    d = ImageDraw.Draw(im)
    w, h = size
    if blob is not None:
        d.ellipse((w * 0.2, h * 0.15, w * 0.8, h * 0.9), fill=blob)
    if noise:
        # 小さい絵でも webp が口の下限（256B）を割らないように模様を付ける
        for x in range(0, w, 3):
            d.line((x, h * 0.3, x, h * 0.7), fill=blob if x % 2 else (10, 200, 90, 255))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def webp(size, mode="RGB") -> bytes:
    b = io.BytesIO()
    Image.new(mode, size, (250, 250, 250)).save(b, "WEBP", quality=80)
    return b.getvalue()


CLEAR_1600 = png((1600, 1200), "RGBA", (0, 0, 0, 0), (200, 60, 60, 255))
OPAQUE_1600 = png((1600, 1200), "RGB", (255, 255, 255), (200, 60, 60))
# RGBA だが全部不透明（形だけ透過を名乗る絵）
FAKE_RGBA = png((1600, 1200), "RGBA", (255, 255, 255, 255), (200, 60, 60, 255))
# 寸法を問わない確かめ（崩れた口・ID の引き方・出どころ）に使う軽い絵。
# 1600×1200 を毎回 webp に焼くと、それだけで見張りが30秒になる
CLEAR_MID = png((700, 525), "RGBA", (0, 0, 0, 0), (200, 60, 60, 255))
CLEAR_WIDE = png((3000, 1001), "RGBA", (0, 0, 0, 0), (60, 60, 200, 255))
CLEAR_SMALL = png((200, 150), "RGBA", (0, 0, 0, 0), (60, 160, 60, 255), noise=True)
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 400
# 置き場に入っている「いまの plain」。透過の無い RGB（#733 の形）
OLD_1600 = webp((1600, 1200))
OLD_640 = webp((640, 640), "RGBA")
OLD_800 = webp((800, 800))


# ------------------------------------------------------- 偽の Firestore


class Query:
    def __init__(self, store, name, field, value):
        self._s, self._n, self._f, self._v = store, name, field, value

    def stream(self):
        for k, v in self._s.data.get(self._n, {}).items():
            if v.get(self._f) == self._v:
                yield FakeSnap(k, v)


class WhereCollection(FakeCollection):
    """`where(…, "==", …)` だけ足した入れ物。**`==` 以外は使わせない。**"""

    def where(self, field, op, value):
        assert op == "==", op
        return Query(self._store, self._name, field, value)


class WhereDb(FakeDb):
    def collection(self, name):
        return WhereCollection(self, name)


def make_db() -> WhereDb:
    return WhereDb({"islandCharacter": {
        CID: {"drivePlainId": CID},
        OTHER: {"drivePlainId": OTHER},
        "1fakemigrated0000000000000000000E": {"drivePlainId": DRIVE_ONLY},
        "1faketwiceA00000000000000000000F": {"drivePlainId": TWICE},
        "1faketwiceB00000000000000000000G": {"drivePlainId": TWICE},
    }})


# ------------------------------------------------------- 口のそっくりさん


class FakeApi:
    """`islandCharacter.ts` の `POST /characters/{id}` と `saveRole` を真似る。

    - 送られてきた役どころだけ差し替える。**送られてこなかった役どころには触らない**
    - 役どころの中は `sizes` を**送られたぶんだけで作り直す**。`full` / `w` / `h` は
      送られてこなければ前のものを残す
    - 1枚ごとに中身の頭を見て拡張子を決め、合言葉（token）を毎回振り直す
    - 256B 未満・8MB 超・画像でないものは 400

    `brk` で、わざと崩した口にする（読み直しが落ちられるかを見るため）。
    """

    def __init__(self, brk=""):
        self.brk = brk
        self.calls = []
        self.tokens = 0
        self.blobs = {}
        self.n = 0
        self.chars = {}
        self._put_person(CID, plain_full=OLD_1600, plain_ext="png", scene=True)
        self._put_person(OTHER, plain_full=OLD_640, plain_ext="webp", scene=False)
        self._put_person("1fakemigrated0000000000000000000E",
                         plain_full=OLD_800, plain_ext="webp", scene=False)

    def _url(self, cid, role, name, ext, buf) -> str:
        self.n += 1
        u = (f"{BUCKET}island%2Fcharacters%2F{cid}%2F{role}-{name}.{ext}"
             f"?alt=media&token=t{self.n}")
        self.blobs[u] = buf
        return u

    def _put_person(self, cid, plain_full, plain_ext, scene):
        p = {"full": self._url(cid, "plain", "full", plain_ext, plain_full),
             "sizes": {str(w): self._url(cid, "plain", str(w), "webp", b"x")
                       for w in (128, 256, 640)},
             "w": 1600, "h": 1200}
        s = None
        if scene:
            s = {"full": self._url(cid, "scene", "full", "jpg", b"y"),
                 "sizes": {"640": self._url(cid, "scene", "640", "webp", b"z")},
                 "w": 1200, "h": 1200}
        self.chars[cid] = {"id": cid, "emoji": "🃏", "channelName": NAME,
                           "aliases": [ALIAS], "plain": p, "scene": s,
                           "order": 3, "createdAt": None}

    # ---- 外へ出る口の代わり

    def owner_token(self, client):
        self.tokens += 1
        # 札を作るのに Firestore を読む（`_owner.admin_uid`）。書く口は使わない
        assert hasattr(client, "collection")
        return "TOKEN"

    def public(self):
        self.calls.append(("GET-public", "/characters"))
        return [{k: copy.deepcopy(v) for k, v in c.items()
                 if k in ("id", "emoji", "plain", "scene", "order", "createdAt")}
                for c in self.chars.values()]

    def get(self, url):
        if url not in self.blobs:
            raise OSError("404")
        return self.blobs[url]

    def reachable(self, url):
        return (200, "image/webp", 1234)

    def call(self, method, path, token, body=None):
        self.calls.append((method, path, copy.deepcopy(body)))
        assert token == "TOKEN", "札を付けずに口を叩いた"
        if method == "GET" and path == "/characters":
            return {"characters": copy.deepcopy(list(self.chars.values()))}
        if method == "POST" and path.startswith("/characters/"):
            cid = path.rsplit("/", 1)[1]
            had = self.chars[cid]
            had["channelName"] = body.get("channelName") or ""
            had["emoji"] = body.get("emoji") or ""
            had["aliases"] = list(body.get("aliases") or [])
            for role in ("plain", "scene"):
                sent = body.get(role)
                if not isinstance(sent, dict):
                    continue
                had[role] = self._save_role(cid, role, sent, had.get(role) or {})
            if self.brk == "drop_scene":
                had["scene"] = None
            return {"character": copy.deepcopy(had)}
        raise AssertionError(f"知らない口 {method} {path}")

    def _save_role(self, cid, role, b, was):
        def put(name, raw):
            buf = base64.b64decode(raw)
            if not 256 <= len(buf) <= 8 * 1024 * 1024:
                raise SystemExit("400 bad size")
            kind = ps.kind_of(buf)
            if not kind:
                raise SystemExit("400 not an image")
            ext = "jpg" if kind == "jpeg" else kind
            if self.brk == "stale_bytes" and name == "full":
                # 指す先は変わったのに、中身は前のまま（いちばん見つけにくい崩れ）
                buf = self.blobs[was["full"]]
            return self._url(cid, role, name, ext, buf)

        out = {"sizes": {}}
        if b.get("full") and self.brk != "keep_full":
            out["full"] = put("full", b["full"])
        elif was.get("full"):
            out["full"] = was["full"]
        for w in ("128", "256", "640"):
            if (b.get("sizes") or {}).get(w):
                out["sizes"][w] = put(w, b["sizes"][w])
        out["w"] = (b.get("w") if self.brk != "keep_full" else None) or was.get("w")
        out["h"] = (b.get("h") if self.brk != "keep_full" else None) or was.get("h")
        return out

    def posts(self):
        return [c for c in self.calls if c[0] == "POST"]


# ------------------------------------------------------- 回す


ROOT = Path(tempfile.mkdtemp(prefix="plain-swap-repo-"))
OUTSIDE = Path(tempfile.mkdtemp(prefix="plain-swap-outside-"))
for name, buf in {
    "clear.png": CLEAR_1600, "opaque.png": OPAQUE_1600, "fake.png": FAKE_RGBA,
    "wide.png": CLEAR_WIDE, "mid.png": CLEAR_MID, "small.png": CLEAR_SMALL, "notpng.png": JPEG,
}.items():
    (ROOT / "art").mkdir(exist_ok=True)
    (ROOT / "art" / name).write_bytes(buf)
(OUTSIDE / "clear.png").write_bytes(CLEAR_MID)
ps.REPO = ROOT

# **焼くのは本物のまま、同じ絵を2回焼かない。** webp の method=6 は1枚0.7秒かかり、
# 同じ絵を何度も送る見張りでは、それだけで30秒になる。焼いた中身は変わらない
_real_bake = ps.bake
_baked = {}


def _bake_once(buf):
    if buf not in _baked:
        _baked[buf] = _real_bake(buf)
    return _baked[buf]


ps.bake = _bake_once

FAILS = []


def check(ok, what):
    print(("  ok   " if ok else "  FAIL ") + what, file=REAL_OUT, flush=True)
    if not ok:
        FAILS.append(what)


class Run:
    """1回ぶんの結果。"""

    def __init__(self, a, brk="", webp=True):
        self.api = FakeApi(brk)
        self.db = make_db()
        self.dbs = 0

        def fake_db():
            self.dbs += 1
            return self.db

        ps.get = self.api.get
        ps.public_characters = self.api.public
        ps.call = self.api.call
        ps.owner_token = self.api.owner_token
        ps.reachable = self.api.reachable
        ps.db = fake_db
        ps.webp_ok = lambda: webp
        os.environ["ARGS"] = json.dumps(a)
        start = BUF.tell()
        self.code = 0
        try:
            ps.main()
        except SystemExit as e:
            self.code = e.code if isinstance(e.code, int) else 1
        self.out = BUF.getvalue()[start:]


def section(t):
    print(f"\n── {t}", file=REAL_OUT, flush=True)


def no_write(r, what):
    check(r.api.posts() == [], f"{what}: 書き込みの口（POST）を1回も呼ばない")
    check(r.api.tokens == 0, f"{what}: 札を取らない")
    check(r.db.writes == [], f"{what}: Firestore に書かない")


def decode(b64):
    buf = base64.b64decode(b64)
    im = Image.open(io.BytesIO(buf))
    return ps.kind_of(buf), im.size


def main():
    # ---- 3. 寸法の式（画面の bake）
    section("画面の bake と同じ寸法を出すか")
    # 手で書いた期待値。`Characters.tsx` の `one()` と `FULL_LONG` から1件ずつ計算した
    table = {
        (1600, 1200): {"full": (1600, 1200),
                       "sizes": {128: (128, 96), 256: (256, 192), 640: (640, 480)}},
        (3000, 1001): {"full": (2048, 683),
                       "sizes": {128: (128, 43), 256: (256, 85), 640: (640, 214)}},
        # 縦長。長辺（高さ）で抑える。幅は 2048 に届かない
        (1200, 3000): {"full": (819, 2048),
                       "sizes": {128: (128, 320), 256: (256, 640), 640: (640, 1600)}},
        # 元の幅ちょうどの版は焼かない（`if (sw <= w) continue;`）
        (640, 640): {"full": (640, 640), "sizes": {128: (128, 128), 256: (256, 256)}},
        (128, 128): {"full": (128, 128), "sizes": {}},
        # 5 × 128 / 256 = 2.5。JS は 3、Python の round は 2
        (256, 5): {"full": (256, 5), "sizes": {128: (128, 3)}},
    }
    for (sw, sh), want in table.items():
        got = ps.plan(sw, sh)
        check(got == want, f"{sw}×{sh} → {got}")
    check(round(2.5) == 2 and ps.js_round(2.5) == 3,
          "x.5 の丸めが Python と JS で違う寸法を当てている（256×5 の 128px は高さ 3）")
    baked = ps.bake(png((256, 5), "RGBA", (0, 0, 0, 0), (1, 2, 3, 255)))
    check(Image.open(io.BytesIO(baked["sizes"][128])).size == (128, 3),
          "焼いた 128px の中身が 128×3（式だけでなく実物も）")

    # ---- 判定が SUZURI と同じ1本か
    section("透過の判定")
    for name, buf, want in (("clear", CLEAR_1600, True), ("opaque", OPAQUE_1600, False),
                            ("fake", FAKE_RGBA, False), ("wide", CLEAR_WIDE, True),
                            ("small", CLEAR_SMALL, True)):
        got = ps.is_clear(buf)
        st = ps.alpha_stats(buf)
        edge, whole = ps.pct(st["edge"]), ps.pct(st["clear"])
        same = (st["edge"] >= 0.2 and st["clear"] >= 0.05) == got
        verdict = "あり" if got else "なし"
        check(got == want and got == transparent(io.BytesIO(buf)) and same,
              f"{name}: 透過{verdict}（ふち {edge}・全体 {whole}。出す数字と判定が食い違わない）")

    # ---- 1. 数えるだけ
    section("数えるだけ（apply 無し）")
    r = Run({"char": CID, "src": "art/clear.png"})
    check(r.code == 0, f"終わりの番号 0（{r.code}）")
    no_write(r, "数えるだけ")
    check("空回しです" in r.out, "空回しだと言う")
    check("いまの plain: full png 1600×1200" in r.out, "いまの plain の形と寸法を出す")
    check("いまの plain の中身: webp 1600×1200（RGB）" in r.out and "→ 透過なし" in r.out,
          "いまの plain の中身（透過なし）を出す")
    check("新しい絵の寸法 1600×1200（RGBA）" in r.out and "→ 透過あり" in r.out,
          "新しい絵の寸法と透過の割合を出す")
    check("送るもの: full webp 1600×1200" in r.out and "640px webp 640×480" in r.out,
          "何を送るかを出す")
    check("いまの scene:" in r.out and "触りません" in r.out, "scene に触らないと言う")
    check(r.dbs == 0, "名簿の id で当たれば Firestore も開かない")

    # 「書いていない」が数えられることを、先に書けたほうで見ておく
    r2 = Run({"char": CID, "src": "art/mid.png", "apply": True})
    check(len(r2.api.posts()) == 1, "対照: apply なら POST が1回数えられる（上の 0 は数え損ねではない）")

    # ---- 2. 透過の無い絵
    section("透過の無い絵は止まる")
    for src in ("art/opaque.png", "art/fake.png"):
        r = Run({"char": CID, "src": src})
        check(r.code == 1, f"{src} 数えるだけ: 1 で止まる（{r.code}）")
        no_write(r, f"{src} 数えるだけ")
        check("新しい絵に透過がありません" in r.out, f"{src}: 理由を言う")
        r = Run({"char": CID, "src": src, "apply": True})
        check(r.code == 1, f"{src} apply: 1 で止まる（{r.code}）")
        no_write(r, f"{src} apply")
        check(r.api.calls == [] and r.dbs == 0,
              f"{src} apply: 札を取る前に止まる（口も Firestore も触らない）")

    # ---- 4. 送る
    section("送る（崩れていない口）")
    r = Run({"char": CID, "src": "art/clear.png", "apply": True})
    check(r.code == 0, f"終わりの番号 0（{r.code}）")
    posts = r.api.posts()
    check(len(posts) == 1 and posts[0][1] == f"/characters/{CID}", "POST はその1人に1回だけ")
    body = posts[0][2] if posts else {}
    check(set(body) == {"channelName", "emoji", "aliases", "plain"},
          f"送るのは名前・絵文字・呼び名と plain だけ（scene を付けない）: {sorted(body)}")
    check(body.get("channelName") == NAME and body.get("aliases") == [ALIAS]
          and body.get("emoji") == "🃏", "名前・絵文字・呼び名を、入っていたまま送り返す")
    pl = body.get("plain") or {}
    check(set(pl) == {"full", "sizes", "w", "h"}, f"plain に full・幅・寸法: {sorted(pl)}")
    check(decode(pl["full"]) == ("webp", (1600, 1200)) and (pl["w"], pl["h"]) == (1600, 1200),
          "full は webp 1600×1200、w/h も同じ")
    want = {"128": (128, 96), "256": (256, 192), "640": (640, 480)}
    got = {w: decode(b) for w, b in (pl.get("sizes") or {}).items()}
    check(got == {w: ("webp", d) for w, d in want.items()}, f"幅ごとの版は webp で {want}")
    check(transparent(io.BytesIO(base64.b64decode(pl["full"]))), "送った full に透過が残っている")
    after = r.api.chars[CID]
    check(after["scene"] == FakeApi().chars[CID]["scene"], "scene は1文字も変わっていない")
    check("確かめました" in r.out, "読み直して確かめたと言う")
    check(r.api.tokens == 1, "札は1回だけ取る")

    section("寸法の違う絵")
    r = Run({"char": CID, "src": "art/wide.png", "apply": True})
    pl = (r.api.posts() or [(0, 0, {})])[0][2].get("plain") or {}
    check(r.code == 0 and decode(pl["full"]) == ("webp", (2048, 683))
          and (pl["w"], pl["h"]) == (2048, 683), "3000×1001 → full は長辺 2048 の 2048×683")
    r = Run({"char": CID, "src": "art/small.png", "apply": True})
    pl = (r.api.posts() or [(0, 0, {})])[0][2].get("plain") or {}
    check(r.code == 0 and set(pl.get("sizes") or {}) == {"128"},
          "200×150 → 幅ごとの版は 128 だけ")
    check("plain の幅がそろっていません" not in r.out,
          "前に 256/640 があっても、口は送ったぶんで作り直すので読み直しは通る")

    # ---- 5. 読み直しが落ちられるか
    section("読み直しが、崩れた口で落ちるか")
    for brk, says in (("keep_full", "plain の full の指す先が変わっていません"),
                      ("drop_scene", "背景あり（scene）が変わっています"),
                      ("stale_bytes", "新しい full に透過がありません")):
        r = Run({"char": CID, "src": "art/mid.png", "apply": True}, brk=brk)
        check(r.code == 1, f"{brk}: 1 で落ちる（{r.code}）")
        check(says in r.out, f"{brk}: 外れた理由を言う（{says}）")
        check("確かめました" not in r.out, f"{brk}: 確かめたとは言わない")

    # ---- 6. 書類IDを引く
    section("書類IDを引く")
    r = Run({"char": DRIVE_ONLY, "src": "art/mid.png"})
    check(r.code == 0 and "drivePlainId から引きました" in r.out and r.dbs == 1,
          "名簿に無いドライブのIDは drivePlainId から引く")
    no_write(r, "drivePlainId から引いた数えるだけ")
    r = Run({"char": TWICE, "src": "art/mid.png", "apply": True})
    check(r.code == 1 and r.api.posts() == [], "2人に当たったら決めずに止まる（POST なし）")
    r = Run({"char": "1nobodyhere0000000000000000000000", "src": "art/mid.png", "apply": True})
    check(r.code == 1 and r.api.posts() == [] and "名簿にいません" in r.out, "居ない人は止まる")
    r = Run({"char": "../x", "src": "art/mid.png"})
    check(r.code == 1 and r.api.calls == [], "形の違う char は口を叩く前に止まる")

    # ---- 7. 絵の出どころと箱
    section("絵の出どころと箱")
    r = Run({"char": CID, "src": str(OUTSIDE / "clear.png"), "apply": True})
    check(r.code == 1 and r.api.calls == [] and "リポジトリの外" in r.out, "リポジトリの外の絵は止まる")
    r = Run({"char": CID, "src": "art/../../" + OUTSIDE.name + "/clear.png", "apply": True})
    check(r.code == 1 and r.api.calls == [], "`..` で外へ出る道も止まる")
    r = Run({"char": CID, "src": "art/notpng.png", "apply": True})
    check(r.code == 1 and r.api.calls == [] and "PNG ではありません" in r.out, "PNG でない絵は止まる")
    r = Run({"char": CID, "src": "art/nothere.png"})
    check(r.code == 1 and "見つかりません" in r.out, "無い絵は止まる")
    r = Run({"char": CID, "src": "art/mid.png", "apply": True}, webp=False)
    check(r.code == 1 and r.api.calls == [] and "webp が焼けません" in r.out,
          "webp が焼けない箱では、札を取る前に止まる")
    r = Run({"char": CID, "src": "art/mid.png"}, webp=False)
    check(r.code == 1 and r.api.posts() == [], "webp が焼けない箱では、数えるだけでも 1")

    # ---- 8. 素性
    section("出力に名前が出ない")
    whole = BUF.getvalue()
    check(NAME not in whole and NAME.lstrip("@") not in whole, "名前が1文字も出ない")
    check(ALIAS not in whole, "呼び名が1文字も出ない")

    print(file=REAL_OUT)
    if FAILS:
        print(f"落ちた {len(FAILS)}件", file=REAL_OUT)
        for f in FAILS:
            print("  - " + f, file=REAL_OUT)
        sys.exit(1)
    print("characters_plain_swap: 全部通りました", file=REAL_OUT)


if __name__ == "__main__":
    main()
