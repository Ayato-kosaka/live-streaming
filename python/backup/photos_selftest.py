"""偽の置き場で、写真の退避の**振る舞いを実際に動かして確かめる。**

    python python/backup/photos_selftest.py

**本番にも、置き場にも、網の外にも1バイトも出ない。** HTTP も BigQuery も
Firestore も差し替えてある（`photos.dump()` の `list_refs` / `list_chars` /
`fetch` / `read_idx` / `write`）。確かめるのは9つ:

  1. 初回に**上限まで取って、続きが残る**ことが分かる形で終わる
  2. 2回目が**続きから**始まり、1回目に取ったものを取り直さない
  3. 1枚が 404 で返っても止まらず、**残りを取り切って落ちた枚数を報告する**
  4. `url` を持っていない書類を飛ばして、**その数を報告する**
  5. **ログに URL も合言葉もファイル名も出ていない**（出力を grep して0件）
  6. 戻して、**バイト列が一致する**
  7. 合言葉つき URL から**置き場の名前を取り出せる**（`%2F` をほどく）
  8. **旅の写真が先、住人の絵が後**に取られ、2回目は続きから拾う
  9. **片方の索引が引けなくても、もう片方は取れる**（赤くならず警告が出る）

## 7 がなぜ要るか（ほどき忘れると、毎晩ぜんぶ取り直す）

住人の絵には、写真の `storagePath` にあたる欄が無い。名前は URL から
ほどくしかなく、URL の中では区切りが `%2F` に化けている。ほどき忘れると、
置き場の表の名前（`island/characters/…`）と1文字も突き合わない。
**落ちも赤くもならず、「まだ 533件」と言いながら毎晩 337MB を取り直す。**
数字だけ見ていると気づけないので、名前の取り出しそのものを確かめる。

## 8 がなぜ要るか（並びは、上限に当たる回だけ効く）

2つの索引を混ぜて名前順にすると `island/…` が `nordic/…` より前に来る。
上限に当たらない回は結果が同じなので、**上限に当たる回**で見る。

## なぜ「呼ばれた回数」を数えるのか

「2回目は取り直さない」は、出てくる数字（取った枚数）だけでは言えない。
取り直したうえで捨てていても、枚数は同じに見える。**偽の HTTP に、
どの URL が何回来たかを数えさせて**、1回目に取ったものが2回目に
1本も来ていないことで言う。

## 5 の測りかた

このリポジトリは公開で、Actions のログも誰でも読める。
合言葉つきの URL が1文字でも出たら、写真が誰でも落とせるようになる。
`sys.stdout` を二股にして出力を丸ごと溜め、**最後にそこを grep する。**
「出していないつもり」ではなく、出たものを見る。
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 実際の出力を溜める袋。**photos.py を読み込む前に**二股にしておく
# （logging のハンドラは作られた時点の sys.stdout を握るため）
BUF = io.StringIO()
REAL = sys.stdout


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


sys.stdout = Tee(REAL, BUF)

from backup import photos  # noqa: E402

# ---------------------------------------------------------------- 偽の置き場

# **本番と同じ形の名前と URL を使う。** 形の違うもので試すと、
# 「ログに出ていない」の grep が本番では効かない字を探すことになる
HOST = "https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app"
TOKEN = "11111111-2222-3333-4444-555555555555"


def fake_url(path: str) -> str:
    from urllib.parse import quote

    return f"{HOST}/o/{quote(path, safe='')}?alt=media&token={TOKEN}"


class Bucket:
    """偽の置き場。**HTTP の代わり。** どの URL が何回来たかを数える。"""

    def __init__(self, bodies: dict[str, bytes], dead: set[str] | None = None):
        self.bodies = bodies
        self.dead = dead or set()
        self.calls: list[str] = []

    def fetch(self, url: str) -> photos.Got:
        self.calls.append(url)
        for path, body in self.bodies.items():
            if fake_url(path) != url:
                continue
            if path in self.dead:
                # 合言葉が作り直された1枚。**本番でも起こりうる**
                return photos.Got(404, b"", "", "")
            return photos.Got(200, body, "image/jpeg", "")
        return photos.Got(404, b"", "", "")

    def hit(self, path: str) -> int:
        u = fake_url(path)
        return sum(1 for c in self.calls if c == u)


def no_chars():
    """住人の絵の索引の代わり。**空を返す。**

    写真だけを見る確かめに渡す。渡さないと `photos.dump()` が既定の
    `refs_from_characters` を呼び、**本番の Firestore を触りにいく。**
    """
    return [], {}


class Sink:
    """偽の BigQuery。置き場の表の代わり。"""

    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.writes = 0

    def read_idx(self):
        return {p: (int(r["size"]), str(r["sha256"])) for p, r in self.rows.items()}

    def write(self, rows):
        self.writes += 1
        for r in rows:
            self.rows[r["path"]] = r

    def read_row(self, path):
        if path:
            return self.rows.get(path)
        return next(iter(self.rows.values())) if self.rows else None


class FakeDoc:
    """偽の書類。`to_dict()` しか使われない。"""

    def __init__(self, d):
        self._d = d

    def to_dict(self):
        return self._d


class FakeCol:
    def __init__(self, docs):
        self._docs = docs

    def stream(self):
        return iter(self._docs)


class FakeFs:
    """偽の Firestore。**索引を引くところ（読む側）を通すために要る。**"""

    def __init__(self, by_col):
        self.by_col = by_col

    def collection(self, name):
        return FakeCol([FakeDoc(d) for d in self.by_col.get(name, [])])


def photo(i: int) -> bytes:
    """1MB の偽の写真。**中身は1枚ずつ違う**（指紋が同じになると比較にならない）。"""
    return (f"FAKE-JPEG-{i:04d}-".encode() * 70000)[: 1024 * 1024]


def make(n: int, with_url=True, day="2026-09-12"):
    """偽の書類 n 件。名前のかたちは本番と同じ。"""
    refs, bodies, no_url = [], {}, 0
    for i in range(n):
        path = f"nordic/photos/{day}/fakeDocId{i:04d}.jpg"
        bodies[path] = photo(i)
        if with_url:
            refs.append(photos.Ref(path, fake_url(path), 1757000000000 + i))
        else:
            no_url += 1
    return refs, bodies, no_url


def make_chars(n: int):
    """偽の住人の絵 n 件。名前のかたちは本番と同じ
    （`island/characters/<書類ID>/<役どころ>-<幅>.webp`）。

    **2件で1人ぶん**（原寸と 128 の版）。1人が何件も持つところまで
    同じにしないと、「同じ人がまとまって並ぶ」が試せない。
    """
    refs, bodies = [], {}
    for i in range(n):
        cid = f"fakeChar{i // 2:04d}"
        path = f"island/characters/{cid}/plain-{'full' if i % 2 == 0 else '128'}.webp"
        bodies[path] = photo(1000 + i)
        refs.append(photos.Ref(path, fake_url(path), 1757100000000 + i))
    refs.sort(key=lambda r: r.path)
    return refs, bodies


# ---------------------------------------------------------------- 確かめる

FAILED: list[str] = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def case1_and_2():
    print("\n[1] 初回は上限まで取って、続きが残る　[2] 2回目は続きから")
    refs, bodies, _ = make(10)
    b, s = Bucket(bodies), Sink()

    # 上限 4MB。1枚 1MB なので4枚で当たる
    r1 = photos.dump(None, False, list_refs=lambda: (refs, {"docs": 10}),
                     list_chars=no_chars,
                     fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                     budget_bytes=4 * 1024 * 1024, budget_count=1000)
    ck("1回目に取った枚数", r1["n"] == 4, r1["n"])
    ck("1回目に残った枚数", r1["left"] == 6, r1["left"])
    ck("HTTP を叩いた本数", len(b.calls) == 4, len(b.calls))
    ck("置き場に入った枚数", len(s.rows) == 4, len(s.rows))

    first4 = [r.path for r in refs[:4]]
    before = len(b.calls)
    r2 = photos.dump(None, False, list_refs=lambda: (refs, {"docs": 10}),
                     list_chars=no_chars,
                     fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                     budget_bytes=4 * 1024 * 1024, budget_count=1000)
    ck("2回目に取ってあると数えた枚数", r2["have"] == 4, r2["have"])
    ck("2回目に取った枚数", r2["n"] == 4, r2["n"])
    ck("2回目に残った枚数", r2["left"] == 2, r2["left"])
    ck("2回目に叩いた本数", len(b.calls) - before == 4, len(b.calls) - before)
    # **枚数だけでは「取り直していない」は言えない。** 取り直して捨てても
    # 枚数は同じに見える。2回目に来た URL の中に、1回目の4枚がいないことで言う
    again = sum(1 for u in b.calls[before:] if u in {fake_url(p) for p in first4})
    ck("2回目に1回目の4枚を取り直した本数", again == 0, again)

    r3 = photos.dump(None, False, list_refs=lambda: (refs, {"docs": 10}),
                     list_chars=no_chars,
                     fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                     budget_bytes=4 * 1024 * 1024, budget_count=1000)
    ck("3回目で取り切る", (r3["n"], r3["left"]) == (2, 0), (r3["n"], r3["left"]))
    ck("全部で叩いた本数（10 のはず）", len(b.calls) == 10, len(b.calls))
    ck("置き場に入った枚数（10 のはず）", len(s.rows) == 10, len(s.rows))
    return s, bodies


def case3():
    print("\n[3] 1枚が 404 でも止まらない")
    refs, bodies, _ = make(5)
    dead = {refs[2].path}
    b, s = Bucket(bodies, dead=dead), Sink()
    r = photos.dump(None, False, list_refs=lambda: (refs, {"docs": 5}),
                    list_chars=no_chars, fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                    budget_bytes=100 * 1024 * 1024, budget_count=1000)
    ck("取った枚数", r["n"] == 4, r["n"])
    ck("落ちた枚数", r["failed"] == 1, r["failed"])
    ck("落ちた理由の内訳", r["fails"] == {"404": 1}, r["fails"])
    ck("残り", r["left"] == 0, r["left"])
    ck("落ちたあとも最後まで叩いた", len(b.calls) == 5, len(b.calls))
    ck("置き場に入ったのは 4 枚", len(s.rows) == 4, len(s.rows))


def case4():
    print("\n[4] url を持っていない書類を飛ばして、その数を報告する")
    ok_refs, bodies, _ = make(3)
    # 5件のうち2件に url が無い、という索引を返す
    b, s = Bucket(bodies), Sink()
    r = photos.dump(None, False,
                    list_refs=lambda: (ok_refs, {"docs": 5, "no_url": 2, "no_path": 0}),
                    list_chars=no_chars, fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                    budget_bytes=100 * 1024 * 1024, budget_count=1000)
    ck("url 無しとして報告した数", r["no_url"] == 2, r["no_url"])
    ck("実体を取りにいった枚数", r["n"] == 3, r["n"])
    ck("HTTP を叩いた本数（url 無しには叩かない）", len(b.calls) == 3, len(b.calls))

    # 索引を作るところ（Firestore を読む側）も、偽の書類で1回通す
    p0 = "nordic/photos/2026-09-12/aaaa.jpg"
    p1 = "nordic/photos/2026-09-12/bbbb.jpg"
    p2 = "nordic/photos/2026-09-12/cccc.jpg"
    fs = FakeFs({
        # 2つの入れ物は**同じ実体を指している**。名前で1本にまとまるか
        "islandStreamEventImage": [
            {"storagePath": p0, "url": fake_url(p0), "at": 1757000000000},
            {"storagePath": p1, "at": 1757000000001},          # url 無し（本当に取れない）
            {"url": fake_url(p0)},                              # 置き場の名前 無し
            {"storagePath": p2, "url": fake_url(p2), "at": 1757000000002},
        ],
        "nordicPhotos": [
            {"path": p0, "url": fake_url(p0), "at": 1757000000000},
            # **片方に url が無いだけ。** 実体は上から取れるので、
            # これを「取れない1枚」と数えてはいけない
            {"path": p2, "at": 1757000000002},
        ],
    })
    refs2, stats = photos.refs_from_firestore(fs)
    ck("読んだ書類の数", stats["docs"] == 6, stats["docs"])
    ck("url が無くて本当に取れない実体", stats["no_url"] == 1, stats["no_url"])
    ck("置き場の名前が無い書類", stats["no_path"] == 1, stats["no_path"])
    ck("名前で1本にまとまった実体の数", len(refs2) == 2, len(refs2))
    # **名前そのものは出さない**（ここで出すと [5] の grep が引っかかる）
    ck("並びは名前順（古い日から）", [r.path for r in refs2] == sorted([p0, p2]), "順序どおり")


def case7():
    print("\n[7] 合言葉つき URL から置き場の名前を取り出せる（%2F をほどく）")
    cid = "fakeChar9999"
    path = f"island/characters/{cid}/plain-128.webp"
    url = fake_url(path)
    # **ほどき忘れが、ここで捕まる。** URL の中では区切りが %2F に化けている
    ck("URL の中で区切りが化けている数（名前の `/` の数だけある）",
       url.count("%2F") == path.count("/"), url.count("%2F"))
    ck("ほどくと置き場の名前に戻る", photos.storage_path(url) == path, "戻った")
    ck("ほどかないと突き合わない（毎晩取り直しになる形）",
       url.split("/o/", 1)[1].split("?", 1)[0] != path, "食い違う")
    ck("形の違う URL からは名前を取らない",
       photos.storage_path("https://example.test/x.png") == "", "空")
    ck("空でも落ちない", photos.storage_path(None) == "", "空")

    # **時刻の形が入れ物ごとに違う。** 写真はミリ秒の数、住人の絵は ISO の字
    ck("ミリ秒の数はそのまま", photos._at_ms(1757000000000) == 1757000000000, "そのまま")
    ck("ISO の字も読める", photos._at_ms("2026-09-01T00:00:00.000Z") > 0, "読めた")
    ck("読めない時刻は 0（`_iso` が現在時刻へ落とす）", photos._at_ms("きのう") == 0, 0)

    # 索引を作るところ（Firestore を読む側）を、偽の書類で1回通す
    a = f"island/characters/{cid}"
    fs = FakeFs({
        "islandCharacter": [
            {
                "createdAt": "2026-09-01T00:00:00.000Z",
                "images": {
                    # 原寸と、幅ごとの版2つ
                    "plain": {
                        "url": fake_url(f"{a}/plain-full.webp"),
                        "sizes": {
                            "128": fake_url(f"{a}/plain-128.webp"),
                            "256": fake_url(f"{a}/plain-256.webp"),
                        },
                    },
                    # 原寸だけの枠
                    "scene": {"url": fake_url(f"{a}/scene-full.jpg")},
                },
            },
            # **絵を1枚も入れていない人。** 98人中30枠がこれ。
            # 「取れない1枚」と数えると、直しようのない警告が毎晩出る
            {"createdAt": "2026-09-02T00:00:00.000Z", "images": {}},
            # url は入っているのに、置き場の名前が取れない形
            {"images": {"plain": {"url": "https://example.test/nope.png"}}},
        ],
    })
    refs, st = photos.refs_from_characters(fs)
    ck("読んだ書類の数", st["docs"] == 3, st["docs"])
    ck("絵のある枠の数", st["roles"] == 2, st["roles"])
    ck("原寸の数", st["full"] == 2, st["full"])
    ck("幅ごとの版の数", st["sizes"] == 2, st["sizes"])
    ck("実体の数（原寸2＋幅ごと2）", len(refs) == 4, len(refs))
    ck("名前の取れない url を数えた", st["no_path"] == 1, st["no_path"])
    # **絵の無い人を「取れない」に数えない。** 数えると毎晩警告が出る
    ck("絵の無い人は取れない扱いにしない", st["no_url"] == 0, st["no_url"])
    ck("並びは名前順（同じ人がまとまる）",
       [r.path for r in refs] == sorted(r.path for r in refs), "順序どおり")
    ck("書類の時刻が実体に付く",
       photos._iso(refs[0].at_ms).startswith("2026-09-01"), "2026-09-01")


def case8():
    print("\n[8] 旅の写真が先、住人の絵が後　／　2回目は続きから")
    ph_refs, ph_bodies, _ = make(3)
    ch_refs, ch_bodies = make_chars(4)
    b, s = Bucket({**ph_bodies, **ch_bodies}), Sink()
    ph_urls = {r.url for r in ph_refs}

    def run():
        # 上限 4MB。1件 1MB なので4件で当たる＝**並びが効く回**
        return photos.dump(
            None, False,
            list_refs=lambda: (ph_refs, {"docs": 3}),
            list_chars=lambda: (ch_refs, {"docs": 2, "chars": 2, "roles": 2,
                                          "full": 2, "sizes": 2}),
            fetch=b.fetch, read_idx=s.read_idx, write=s.write,
            budget_bytes=4 * 1024 * 1024, budget_count=1000)

    r1 = run()
    ck("索引が数えた実体（写真 / 絵）",
       (r1["n_photo"], r1["n_char"]) == (3, 4), (r1["n_photo"], r1["n_char"]))
    ck("あわせた実体の数", r1["n_all"] == 7, r1["n_all"])
    ck("1回目に取った件数", r1["n"] == 4, r1["n"])
    # **枚数では並びは言えない。** 叩いた順を見る
    first3 = sum(1 for u in b.calls[:3] if u in ph_urls)
    ck("はじめの3本は旅の写真", first3 == 3, f"{first3}/3")
    ck("住人の絵に飛んだのは1本",
       sum(1 for u in b.calls if u not in ph_urls) == 1,
       sum(1 for u in b.calls if u not in ph_urls))
    ck("1回目に残った件数", r1["left"] == 3, r1["left"])

    took = set(b.calls)
    before = len(b.calls)
    r2 = run()
    ck("2回目に取ってあると数えた件数", r2["have"] == 4, r2["have"])
    ck("2回目に取った件数", r2["n"] == 3, r2["n"])
    ck("2回目に残った件数", r2["left"] == 0, r2["left"])
    # **「取り直していない」は枚数では言えない**（[1][2] と同じ理由）
    again = sum(1 for u in b.calls[before:] if u in took)
    ck("2回目に1回目の4件を取り直した本数", again == 0, again)
    ck("全部で叩いた本数（7のはず）", len(b.calls) == 7, len(b.calls))
    ck("置き場に入った件数", len(s.rows) == 7, len(s.rows))


def case9():
    print("\n[9] 片方の索引が引けなくても、もう片方は取れる")
    ph_refs, ph_bodies, _ = make(3)
    ch_refs, ch_bodies = make_chars(4)
    bodies = {**ph_bodies, **ch_bodies}

    def boom():
        raise RuntimeError("索引が引けない")

    def run(list_refs, list_chars):
        b, s = Bucket(bodies), Sink()
        r = photos.dump(None, False, list_refs=list_refs, list_chars=list_chars,
                        fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                        budget_bytes=100 * 1024 * 1024, budget_count=1000)
        return r, b, s

    r, b, _ = run(lambda: (ph_refs, {"docs": 3}), boom)
    ck("絵の索引が落ちても、写真は取れる", r["ok"] and r["n"] == 3, (r["ok"], r["n"]))
    ck("落ちた索引を返り値で言う", r["broken"] == ["char"], r["broken"])
    ck("落ちたほうは0件と数える", r["n_char"] == 0, r["n_char"])

    r, b, _ = run(boom, lambda: (ch_refs, {"docs": 2}))
    ck("写真の索引が落ちても、絵は取れる", r["ok"] and r["n"] == 4, (r["ok"], r["n"]))
    ck("落ちた索引を返り値で言う", r["broken"] == ["photo"], r["broken"])

    r, b, s = run(boom, boom)
    ck("両方落ちたら ok は False", r["ok"] is False, r["ok"])
    ck("両方落ちたら HTTP を1本も叩かない", len(b.calls) == 0, len(b.calls))
    ck("両方落ちたら1行も書かない", len(s.rows) == 0, len(s.rows))

    # **赤くしない**（写真以外は取れている）。warning は出る、が [5] で
    # 名前も URL も出ていないことを見る
    ck("警告は出ている（::warning:: の数）",
       BUF.getvalue().count("索引（Firestore）が引けませんでした") == 4,
       BUF.getvalue().count("索引（Firestore）が引けませんでした"))


def case6(s: Sink, bodies: dict):
    print("\n[6] 戻して、バイト列が一致する")
    path = sorted(s.rows)[0]
    out = os.path.join(os.getenv("TMPDIR", "/tmp"), "backup-photo-selftest.bin")
    r = photos.restore_one(s.read_row, path, out, against=bodies[path])
    ck("置き場から見つかった", r["found"], r["found"])
    ck("大きさが一致", r["size_ok"], r["bytes"])
    ck("指紋（sha256）が一致", r["sha_ok"], r["sha_ok"])
    ck("**バイト列そのものが一致**", r["same_bytes"] is True, r["same_bytes"])
    ck("書き出したファイルも一致",
       open(out, "rb").read() == bodies[path], os.path.getsize(out))
    os.remove(out)

    # **毎晩の drill が呼ぶ口（`restore.py --photo`）そのものを通す。**
    # ここを通さないと、道具は動くのに毎晩の口が動かない、が起こる
    from backup import restore  # noqa: PLC0415

    ck("restore.py --photo と同じ口が 0 で返る",
       restore.restore_photo(s.read_row, path, None) == 0, "終了コード 0")
    # 中身を1バイト書き換えた行を戻すと、**落ちる**こと（判定の向きの確認）
    broken = dict(s.rows[path])
    broken["sha256"] = "0" * 64
    ck("指紋が違う行は 1 で返る",
       restore.restore_photo(lambda _p: broken, path, None) == 1, "終了コード 1")
    ck("1枚も入っていないときは 0 で返る（警告だけ）",
       restore.restore_photo(lambda _p: None, None, None) == 0, "終了コード 0")


def case5():
    """**出力を grep する。** ここだけは袋を読むので、最後に回す。"""
    print("\n[5] ログに URL も合言葉もファイル名も出ていない")
    text = BUF.getvalue()
    # このケースの見出しより前だけを見る（ここから先は grep の結果を出す行）
    text = text.split("[5] ログに")[0]
    checks = {
        "合言葉（token）": TOKEN,
        "ダウンロードの口（firebasestorage.googleapis.com）": "firebasestorage.googleapis.com",
        "?alt=media": "alt=media",
        "置き場の名前の頭（nordic/photos/）": "nordic/photos/",
        "ファイル名（fakeDocId0000.jpg）": "fakeDocId0000.jpg",
        "拡張子（.jpg）": ".jpg",
        # **住人の絵のぶん。** 写真だけ見ていると、こちらが漏れる
        "住人の絵の置き場の名前の頭（island/characters/）": "island/characters/",
        "住人の絵の書類ID（fakeChar…）": "fakeChar",
        "住人の絵のファイル名（plain-128）": "plain-128",
        "拡張子（.webp）": ".webp",
    }
    for label, needle in checks.items():
        n = text.count(needle)
        ck(f"{label} の出現回数", n == 0, n)
    print(f"    （grep した出力は {len(text)} 文字）")


def main() -> int:
    print("=== 偽の置き場で、写真の退避を動かす（本番には1バイトも出ない） ===")
    s, bodies = case1_and_2()
    case3()
    case4()
    case7()
    case8()
    case9()
    case6(s, bodies)
    case5()
    sys.stdout = REAL
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
