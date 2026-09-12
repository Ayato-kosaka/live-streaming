"""偽の置き場で、写真の退避の**振る舞いを実際に動かして確かめる。**

    python python/backup/photos_selftest.py

**本番にも、置き場にも、網の外にも1バイトも出ない。** HTTP も BigQuery も
Firestore も差し替えてある（`photos.dump()` の `list_refs` / `fetch` /
`read_idx` / `write`）。確かめるのは6つ:

  1. 初回に**上限まで取って、続きが残る**ことが分かる形で終わる
  2. 2回目が**続きから**始まり、1回目に取ったものを取り直さない
  3. 1枚が 404 で返っても止まらず、**残りを取り切って落ちた枚数を報告する**
  4. `url` を持っていない書類を飛ばして、**その数を報告する**
  5. **ログに URL も合言葉もファイル名も出ていない**（出力を grep して0件）
  6. 戻して、**バイト列が一致する**

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
                     fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                     budget_bytes=4 * 1024 * 1024, budget_count=1000)
    ck("1回目に取った枚数", r1["n"] == 4, r1["n"])
    ck("1回目に残った枚数", r1["left"] == 6, r1["left"])
    ck("HTTP を叩いた本数", len(b.calls) == 4, len(b.calls))
    ck("置き場に入った枚数", len(s.rows) == 4, len(s.rows))

    first4 = [r.path for r in refs[:4]]
    before = len(b.calls)
    r2 = photos.dump(None, False, list_refs=lambda: (refs, {"docs": 10}),
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
                    fetch=b.fetch, read_idx=s.read_idx, write=s.write,
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
                    fetch=b.fetch, read_idx=s.read_idx, write=s.write,
                    budget_bytes=100 * 1024 * 1024, budget_count=1000)
    ck("url 無しとして報告した数", r["no_url"] == 2, r["no_url"])
    ck("実体を取りにいった枚数", r["n"] == 3, r["n"])
    ck("HTTP を叩いた本数（url 無しには叩かない）", len(b.calls) == 3, len(b.calls))

    # 索引を作るところ（Firestore を読む側）も、偽の書類で1回通す
    class FakeDoc:
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
        def __init__(self, by_col):
            self.by_col = by_col

        def collection(self, name):
            return FakeCol([FakeDoc(d) for d in self.by_col.get(name, [])])

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
