"""偽の BigQuery と偽の Firestore で、**名簿の作りかたを実際に動かして確かめる。**

    python python/island_day_people_selftest.py

**本番にも資格情報にも触らない。** BigQuery も Firestore も Google の
ライブラリごと偽物に差し替えてあるので、何も入っていない箱でも走る
（`python/admin/ip_purge_selftest.py` と `python/doneru_supporters_selftest.py`
が手本）。確かめるのは10（番号は走らせたときに出る `[n]` と同じ）:

  1. 日の境目が**日本時間の0時**。23:59 に喋った人はその日、00:01 はその日ではない
  2. 並びが**先に見た順**。同じ入力を2回流しても入れ替わらないし、増えない
  3. **既にある名簿が消えない。** BigQuery 側に居ない人（当日 Firestore だけで
     拾った人）を先に入れておいて、BigQuery ぶんを流したあとも残る
  4. 1,000件の歯止めが効く。**歯止めより先に「消さない」が勝つ**
  5. `--apply` を付けないと**1バイトも書かない**（偽の Firestore で書いた回数 0）
  6. 名前も本文も**持ち帰らない**（Firestore に頼んだ欄と、書いた欄を見る）
  7. BigQuery を**日付で絞り、ジョブに 1GiB の上限を付けて**投げている
  8. 当日ぶんを見に行くのは、**窓の新しい端の数日だけ**（読みを1万件にしない）
  9. **歯止めを1つ外すと落ちる**（3 が本当に見ていることの裏取り）
  10. **公開の場でも手元でも、ログにチャンネルIDが0件**

## 10 の測りかた（0 を信じる前に、探し方が当たることを見る）

このリポジトリは公開で、Actions のログも誰でも読める。
「出していないつもり」ではなく、**出たものを見る。** `sys.stdout` と
`sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを `tools/logident.py`
で数える（数え方を自前で書くと探し方が2つになる。`python/logsafe_selftest.py`
の頭に理由がある）。

**0 件は、探し方が壊れていても同じ顔で返る**（`docs/island-misses.md` #79）。
だから先に、**仕込んだ偽のチャンネルIDをそのまま `logident` に渡して、
ちゃんと当たること**を見てから 0 を読む。

この名簿は入れ物そのものが識別子の集まりなので、**手元で回しても素の
チャンネルIDは出さない**作りにしてある（`island_day_people.log_dropped`）。
`logsafe_selftest.py` のように「公開では0・手元では1件以上」とは対にならない
ので、代わりに上の「仕込んだ字に当たる」で、検査が何も見ていないのではない
ことを示す。

## 偽のデータは本番と同じ形にする

チャンネルIDは `UC` + 22文字。形が違うと、`tools/logident.py` の探し方が
本番では効かないまま通ってしまう（#79 と同じ形）。
"""

import importlib.util
import io
import os
import sys
import types
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

# 実際の出力を溜める袋。**island_day_people（＝basicConfig）を読み込む前に**
# 二股にしておく。logging のハンドラは作られた時点の stream を握るため
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

# `config.py` は BQ_PROJECT_ID が無いと import の時点で落ちる。
# **偽の値を置く。** この検査は BigQuery を1度も触らないので中身は何でもよく、
# 逆に本物を置くと、鍵の要る箱でしか回せない検査になってしまう
os.environ.setdefault("BQ_PROJECT_ID", "island-day-people-selftest")

JST = timezone(timedelta(hours=9))


def ms(text: str) -> int:
    """`2026-09-13 23:59` のような**日本時間**の字を、ミリ秒にする。"""
    return int(
        datetime.strptime(text, "%Y-%m-%d %H:%M").replace(tzinfo=JST).timestamp() * 1000
    )


# ---------------------------------------------------------------- 偽のデータ

# **日付を焼き付けない。** 当日ぶん（Firestore）を見る窓は「今日から数日」で
# 決まる（`island_day_people.FS_DAYS`）ので、固定の日を置くと**日が経った
# だけでこの検査が落ちる。** 昨日と今日を使う
_TODAY = datetime.now(JST).date()
DAY = (_TODAY - timedelta(days=1)).isoformat()
NEXT = _TODAY.isoformat()

# **本番と同じ形**（`UC` + 22文字 = 24文字）
def cid(n: int) -> str:
    v = "UCzzDAY" + str(n).zfill(17)
    assert len(v) == 24, v
    return v


CID_EARLY = cid(1)   # その日いちばん早く来た人
CID_LATE = cid(2)    # そのあとに来た人
CID_EDGE = cid(3)    # 23:59 に喋った人（その日）
CID_NEXT = cid(4)    # 00:01 に喋った人（その日ではない）
CID_LIVE = cid(5)    # **当日 Firestore にしか居ない人**（BigQuery には無い）
CID_BOT = cid(9)     # 集計用の bot

BOT_NAME = "@あやとグルメアプリ"
HANDLE = "@ふしぎな-fake1"
TEXT = "ライ麦パンスープに付けながら食べるのおいしそう"

# BigQuery の `chat_messages` のかわり（前日までの確定ぶん）。
# **わざと順番を混ぜてある。** 早い順に並べ替えているのがスクリプト側だと示すため
BQ_ROWS = [
    {"at": ms(f"{DAY} 22:00"), "channel": CID_LATE, "name": HANDLE},
    {"at": ms(f"{DAY} 10:00"), "channel": CID_EARLY, "name": HANDLE},
    {"at": ms(f"{DAY} 10:30"), "channel": CID_EARLY, "name": HANDLE},
    {"at": ms(f"{DAY} 23:59"), "channel": CID_EDGE, "name": None},
    {"at": ms(f"{NEXT} 00:01"), "channel": CID_NEXT, "name": HANDLE},
    # bot は人ではない。名簿に入れない
    {"at": ms(f"{DAY} 09:00"), "channel": CID_BOT, "name": BOT_NAME},
    # 読めない値。落ちたことだけが指紋で出る
    {"at": ms(f"{DAY} 09:10"), "channel": "   ", "name": HANDLE},
    {"at": ms(f"{DAY} 09:20"), "channel": None, "name": HANDLE},
]

# Firestore の `streamChatMessages` のかわり（当日ぶん）。
# **本文と名前も入れておく。** 持ち帰っていないことを 7 で見る
FS_ROWS = [
    {"at": ms(f"{DAY} 21:00"), "channelId": CID_LIVE, "name": HANDLE, "text": TEXT},
    {"at": ms(f"{NEXT} 00:01"), "channelId": CID_NEXT, "name": HANDLE, "text": TEXT},
    {"at": 0, "channelId": CID_EARLY, "name": HANDLE, "text": TEXT},
]


# ------------------------------------------------------------ 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。"""

    def __init__(self, key, data, fields=None):
        self.id = key
        self._d = None if data is None else {
            k: v for k, v in data.items() if fields is None or k in fields
        }

    @property
    def exists(self):
        return self._d is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class Ref:
    """DocumentReference のかわり。"""

    def __init__(self, client, col, key):
        self.client, self.col, self.key = client, col, key


OPS = {
    ">=": lambda a, b: a >= b,
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
}


class Query:
    """Query のかわり。`where` の重ねがけと `select` の絞りだけ。"""

    def __init__(self, client, col, filters=None, fields=None):
        self.client, self.col = client, col
        self.filters = list(filters or [])
        self.fields = fields

    def where(self, field, op, value):
        return Query(self.client, self.col, self.filters + [(field, op, value)], self.fields)

    def select(self, fields):
        # **何を持ち帰ろうとしたか**を控える（7 で見る）
        self.client.selected.append(list(fields))
        return Query(self.client, self.col, self.filters, list(fields))

    def stream(self):
        for key, data in sorted(self.client.store.get(self.col, {}).items()):
            ok = True
            for field, op, value in self.filters:
                v = data.get(field)
                if v is None or not OPS[op](v, value):
                    ok = False
                    break
            if ok:
                yield Snap(key, data, self.fields)


class Col(Query):
    """CollectionReference のかわり。引くほかに書類を名指しできる。"""

    def document(self, key):
        return Ref(self.client, self.col, key)


class Batch:
    """WriteBatch のかわり。**commit まで1バイトも当てない。**"""

    def __init__(self, client):
        self.client = client
        self.buf = []

    def set(self, ref, data, merge=False):
        self.client.sets += 1
        self.buf.append((ref, data, merge))

    def commit(self):
        self.client.commits += 1
        for ref, data, merge in self.buf:
            cur = self.client.store.setdefault(ref.col, {}).get(ref.key)
            if merge and isinstance(cur, dict):
                cur.update(data)
            else:
                self.client.store[ref.col][ref.key] = dict(data)
        self.buf = []


class FakeFirestore:
    """偽の Firestore。**書いた回数を数える。**"""

    def __init__(self, store):
        self.store = store
        self.sets = 0
        self.commits = 0
        self.selected: list = []

    def collection(self, name):
        return Col(self, name)

    def get_all(self, refs):
        for r in refs:
            yield Snap(r.key, self.store.get(r.col, {}).get(r.key))

    def batch(self):
        return Batch(self)


# ------------------------------------------------------------ 偽の BigQuery


class ScalarQueryParameter:
    def __init__(self, name, type_, value):
        self.name, self.type_, self.value = name, type_, value


class QueryJobConfig:
    def __init__(self, query_parameters=None, maximum_bytes_billed=None):
        self.query_parameters = list(query_parameters or [])
        self.maximum_bytes_billed = maximum_bytes_billed


class Job:
    def __init__(self, rows):
        self.rows = rows

    def result(self):
        return self.rows


class FakeBigQuery:
    """偽の BigQuery。**渡された日付で絞って、日×人にまとめるところまで真似る。**

    ここまで真似るのは、境目（1）を SQL 側の道でも見たいから。
    SQL そのものの字は下の `case_window` が別に見る。
    """

    last_sql = ""
    last_cfg = None

    def __init__(self, project=None):
        self.project = project

    def query(self, sql, job_config=None):
        FakeBigQuery.last_sql = sql
        FakeBigQuery.last_cfg = job_config
        p = {q.name: q.value for q in (job_config.query_parameters if job_config else [])}
        agg: dict = {}
        for r in BQ_ROWS:
            if r["name"] is not None and r["name"] == p.get("bot"):
                continue
            if r["channel"] is None:
                # BigQuery 側では `author_channel_id IS NOT NULL` で落ちる
                continue
            day = datetime.fromtimestamp(r["at"] / 1000, JST).strftime("%Y-%m-%d")
            if not (p["d0"] <= day <= p["d1"]):
                continue
            key = (day, r["channel"])
            if key not in agg or r["at"] < agg[key]:
                agg[key] = r["at"]
        return Job([
            {"day": d, "channel_id": c, "first_ms": at}
            for (d, c), at in sorted(agg.items())
        ])

    def close(self):
        pass


def install_fakes() -> None:
    """Google のライブラリを、名前ごと偽物に差し替える。

    `island_day_people` は取り込みの相手を**関数の中で**読み込むので、
    ここで `sys.modules` に置いておけば本物は1度も呼ばれない。
    """
    google = sys.modules.get("google") or types.ModuleType("google")
    google.__path__ = getattr(google, "__path__", [])
    cloud = types.ModuleType("google.cloud")
    cloud.__path__ = []

    bq = types.ModuleType("google.cloud.bigquery")
    bq.Client = FakeBigQuery
    bq.QueryJobConfig = QueryJobConfig
    bq.ScalarQueryParameter = ScalarQueryParameter

    fs = types.ModuleType("google.cloud.firestore")
    fs.Client = lambda project=None: CURRENT["db"]

    cloud.bigquery, cloud.firestore = bq, fs
    google.cloud = cloud
    sys.modules["google"] = google
    sys.modules["google.cloud"] = cloud
    sys.modules["google.cloud.bigquery"] = bq
    sys.modules["google.cloud.firestore"] = fs


CURRENT: dict = {"db": None}
install_fakes()

import island_day_people as m  # noqa: E402


def _load_logident():
    """`tools/logident.py` を読み込む。数え方はあちら1か所に寄せる。"""
    path = os.path.join(ROOT, "tools", "logident.py")
    spec = importlib.util.spec_from_file_location("logident", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


logident = _load_logident()

# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    print(f"    {'○' if cond else '✕'} {name}: {got}")
    if not cond:
        FAILED.append(name)


def store(day_people=None, chat=True) -> dict:
    """偽の Firestore の中身を作る。"""
    msgs = {}
    if chat:
        for i, r in enumerate(FS_ROWS):
            msgs[f"fakeVideo_{i:03d}"] = dict(r)
    return {
        "islandDayPeople": {k: {"day": k, "channels": list(v), "updatedAt": 1}
                            for k, v in (day_people or {}).items()},
        "streamChatMessages": msgs,
    }


def run(argv: list, st: dict, public: bool = False) -> FakeFirestore:
    """スクリプトを1回流す。**戻ってくるのは偽の Firestore そのもの。**"""
    if public:
        os.environ["GITHUB_ACTIONS"] = "true"
    else:
        os.environ.pop("GITHUB_ACTIONS", None)
    db = FakeFirestore(st)
    CURRENT["db"] = db
    old = sys.argv
    sys.argv = ["island_day_people.py"] + argv
    try:
        code = m.main()
    finally:
        sys.argv = old
    if code != 0:
        FAILED.append(f"終了コードが {code}")
    return db


def people(st: dict, day: str = DAY) -> list:
    doc = st["islandDayPeople"].get(day)
    return list(doc["channels"]) if doc else []


def case_boundary():
    print("\n[1] 日の境目は日本時間の0時（23:59 はその日、00:01 はその日ではない）")
    t0, t1 = m.jst_range(DAY)
    ck("1日ぶんのミリ秒", t1 - t0 == 86400000, t1 - t0)
    ck("始まりは その日の0時", m.jst_day(t0) == DAY, m.jst_day(t0))
    ck("終わりの1ミリ秒前は まだその日", m.jst_day(t1 - 1) == DAY, m.jst_day(t1 - 1))
    ck("終わりは もう翌日（含まない）", m.jst_day(t1) == NEXT, m.jst_day(t1))

    st = store()
    run(["--day", DAY, "--apply"], st)
    got = people(st)
    ck("23:59 の人は入っている", CID_EDGE in got, CID_EDGE in got)
    ck("00:01 の人は入っていない", CID_NEXT not in got, CID_NEXT not in got)
    ck("bot は入っていない", CID_BOT not in got, CID_BOT not in got)
    ck("翌日ぶんの書類は作られていない", NEXT not in st["islandDayPeople"],
       sorted(st["islandDayPeople"]))

    # 翌日を引けば、00:01 の人はそちらに入る（落ちているのではなく**翌日**）
    st2 = store()
    run(["--day", NEXT, "--apply"], st2)
    ck("00:01 の人は翌日の名簿に入る（落ちているのではない）",
       CID_NEXT in people(st2, NEXT), f"{len(people(st2, NEXT))}人")


def case_order():
    print("\n[2] 並びは先に見た順。2回流しても入れ替わらない")
    st = store()
    run(["--day", DAY, "--apply"], st)
    first = people(st)
    ck("早く来た人が先", first.index(CID_EARLY) < first.index(CID_LATE), first.index(CID_EARLY))
    ck("あとから来た人が後ろ", first.index(CID_LATE) < first.index(CID_EDGE),
       first.index(CID_LATE))
    ck("当日ぶん（21:00）は 22:00 より前", first.index(CID_LIVE) < first.index(CID_LATE),
       first.index(CID_LIVE))

    db = run(["--day", DAY, "--apply"], st)
    ck("2回目も同じ並び", people(st) == first, "同じ")
    ck("2回目は1件も増えない", len(people(st)) == len(first), len(people(st)))
    ck("2回目は1バイトも書いていない", db.commits == 0 and db.sets == 0,
       f"set {db.sets} / commit {db.commits}")

    # 出どころの順を入れ替えても答えが変わらないこと（時刻で並べている証拠）
    st3 = store()
    BQ_ROWS.reverse()
    try:
        run(["--day", DAY, "--apply"], st3)
    finally:
        BQ_ROWS.reverse()
    ck("元データの順を逆にしても同じ並び", people(st3) == first, "同じ")


def case_keep():
    print("\n[3] 既にある名簿が消えない（BigQuery 側に居ない人も残る）")
    # 当日 Firestore だけで拾った人が、先に名簿へ入っている状態を作る
    st = store({DAY: [CID_LIVE]}, chat=False)
    db = run(["--day", DAY, "--apply"], st)
    got = people(st)
    ck("BigQuery に居ない人が残っている", CID_LIVE in got, CID_LIVE in got)
    # **ここで生のチャンネルIDを印字しない。** この検査の出力も Actions に残る
    ck("先に入っていた人が先頭のまま", bool(got) and got[0] == CID_LIVE, "先頭のまま")
    ck("BigQuery ぶんが足されている", CID_EARLY in got and CID_LATE in got, len(got))
    ck("書いたのは1日ぶん", db.commits == 1, f"commit {db.commits}")


def case_cap():
    print("\n[4] 1,000件の歯止め")
    many = [(cid(1000 + i), 1000 + i) for i in range(1200)]
    r = m.merge_day([], many)
    ck("入るのは1,000件まで", len(r["after"]) == 1000, len(r["after"]))
    ck("入れなかった件数を数えている", r["capped"] == 200, r["capped"])

    # **歯止めより「消さない」が勝つ。** 既に上限を超えている名簿を削らない
    over = [cid(2000 + i) for i in range(1005)]
    r2 = m.merge_day(over, [(cid(9999), 1)])
    ck("既に上限を超えていても削らない", len(r2["after"]) == 1005, len(r2["after"]))
    ck("そこへは足さない", r2["added"] == 0 and r2["capped"] == 1,
       f"added {r2['added']} / capped {r2['capped']}")


def case_apply():
    print("\n[5] --apply を付けないと1バイトも書かない")
    st = store()
    before = {k: list(v["channels"]) for k, v in st["islandDayPeople"].items()}
    db = run(["--day", DAY], st)
    ck("set が呼ばれていない", db.sets == 0, db.sets)
    ck("commit が呼ばれていない", db.commits == 0, db.commits)
    ck("中身が1文字も変わっていない",
       {k: list(v["channels"]) for k, v in st["islandDayPeople"].items()} == before,
       "変わっていない")

    # --dry-run を付けても同じ（`island_tips.py` の書き方で打ったとき）
    db2 = run(["--day", DAY, "--apply", "--dry-run"], st)
    ck("--dry-run のほうが強い", db2.sets == 0 and db2.commits == 0,
       f"set {db2.sets} / commit {db2.commits}")

    db3 = run(["--day", DAY, "--apply"], st)
    ck("--apply を付けたら書く", db3.commits == 1 and len(people(st)) > 0,
       f"commit {db3.commits} / {len(people(st))}人")


def case_projection():
    print("\n[6] 名前も本文も持ち帰らない")
    st = store()
    db = run(["--day", DAY, "--apply"], st)
    asked = [f for fields in db.selected for f in fields]
    ck("Firestore に頼んだ欄", set(asked) == {"at", "channelId"}, sorted(set(asked)))
    doc = st["islandDayPeople"][DAY]
    ck("名簿の欄は day / channels / updatedAt の3つだけ",
       set(doc) == {"day", "channels", "updatedAt"}, sorted(doc))
    ck("`day` は書類IDと同じ", doc["day"] == DAY, doc["day"])
    ck("`updatedAt` はミリ秒", isinstance(doc["updatedAt"], int) and doc["updatedAt"] > 10**12,
       doc["updatedAt"])


def case_window():
    print("\n[7] BigQuery は日付で絞り、1GB の上限を付けて投げる")
    st = store()
    run(["--days", "3", "--apply"], st)
    sql, cfg = FakeBigQuery.last_sql, FakeBigQuery.last_cfg
    ck("SQL が日本時間で切っている", "DATE(published_at, 'Asia/Tokyo')" in sql, "ある")
    ck("SQL が日付で絞っている",
       "published_at >= TIMESTAMP(@d0, 'Asia/Tokyo')" in sql
       and "published_at < TIMESTAMP(DATE_ADD(@d1, INTERVAL 1 DAY), 'Asia/Tokyo')" in sql,
       "ある")
    ck("引くのは3列だけ（本文も名前も引かない）",
       "message_text" not in sql and "author_name AS" not in sql, "3列")
    # **バイト数をそのまま印字しない。** 1073741824 は10桁なので、
    # `tools/logident.py` が どねID として数える（この検査の出力も公開される）
    ck("上限が 1GiB 以下", 0 < (cfg.maximum_bytes_billed or 0) <= 1024**3,
       f"{(cfg.maximum_bytes_billed or 0) / 1024**3:.2f} GiB")
    names = {q.name for q in cfg.query_parameters}
    ck("日付を引数で渡している", {"d0", "d1"} <= names, sorted(names))
    days = {q.value for q in cfg.query_parameters if q.name in ("d0", "d1")}
    ck("--days 3 は3日ぶん",
       (datetime.strptime(max(days), "%Y-%m-%d")
        - datetime.strptime(min(days), "%Y-%m-%d")).days == 2, sorted(days))


def case_fs_window():
    print("\n[8] 当日ぶんを見に行くのは、窓の新しい端の数日だけ")
    # 1日1,400件ある入れ物を毎晩7日ぶんなぞらないための絞り。
    # **古い日は BigQuery に入っているので、なぞっても名簿は1人も増えない**
    ck("窓が今日までなら、端の3日だけ見る",
       m.fs_window("2026-09-01", "2026-09-15", "2026-09-15") == ("2026-09-13", "2026-09-15"),
       m.fs_window("2026-09-01", "2026-09-15", "2026-09-15"))
    ck("窓のほうが狭ければ、窓のまま",
       m.fs_window("2026-09-14", "2026-09-15", "2026-09-15") == ("2026-09-14", "2026-09-15"),
       m.fs_window("2026-09-14", "2026-09-15", "2026-09-15"))
    ck("古い日だけを埋め直すときは見に行かない",
       m.fs_window("2026-08-01", "2026-08-05", "2026-09-15") is None, "見ない")
    ck("--all でも端の3日だけ",
       m.fs_window("2000-01-01", "2100-01-01", "2026-09-15") == ("2026-09-13", "2026-09-15"),
       m.fs_window("2000-01-01", "2100-01-01", "2026-09-15"))


def case_broken():
    print("\n[9] 歯止めを外すと落ちる（この検査が何も見ていないのではないこと）")

    def broken(existing, seen, cap=m.MAX_CHANNELS):
        """**既にある名簿を見ないで上書きする**、壊した版。"""
        out = [c for c, _ in sorted({c: at for c, at in seen}.items(), key=lambda kv: kv[1])]
        return {"after": out, "before": len(existing), "added": len(out), "capped": 0}

    real = m.merge_day
    m.merge_day = broken
    try:
        st = store({DAY: [CID_LIVE]}, chat=False)
        run(["--day", DAY, "--apply"], st)
        gone = CID_LIVE not in people(st)
    finally:
        m.merge_day = real
    ck("上書きにすると、当日ぶんの人が消える（＝[3] が本当に見ている）", gone,
       "消えた" if gone else "消えなかった")

    st2 = store({DAY: [CID_LIVE]}, chat=False)
    run(["--day", DAY, "--apply"], st2)
    ck("戻したら消えない", CID_LIVE in people(st2), "残った")


def case_log(text_public: str, text_local: str):
    print("\n[10] ログにチャンネルIDが出ない（0 の前に、探し方が当たることを見る）")

    # **仕込んだ字に当たること**を先に見る。0 件は探し方が壊れていても同じ顔で返る
    bait = f"名簿: {CID_EARLY} {CID_LIVE} {HANDLE}"
    hit = logident.count(bait)
    ck("仕込んだチャンネルIDに当たる", hit["channel_id"] == 2, hit["channel_id"])
    ck("仕込んだハンドルに当たる", hit["handle"] >= 1, hit["handle"])

    for label, text in (("公開の場（GITHUB_ACTIONS=true）", text_public), ("手元", text_local)):
        c = logident.count(text)
        total = sum(c.values())
        ck(f"{label}: 個人を指すもの", total == 0,
           "  ".join(f"{k}={c[k]}" for k in logident.KINDS))
        ck(f"{label}: 本文が出ていない", TEXT not in text, "出ていない")
        ck(f"{label}: 日ごとの人数は出ている", "人 → " in text, "出ている")

    # 落とした値は**指紋**で出る（何件が同じ値かを追えるように）
    os.environ["GITHUB_ACTIONS"] = "true"
    mark_public = m.mask(CID_LIVE, public=True)
    os.environ.pop("GITHUB_ACTIONS", None)
    mark_local = m.mask(CID_LIVE, public=True)
    ck("指紋は手元でも指紋のまま", mark_public == mark_local and CID_LIVE not in mark_local,
       mark_local)
    ck("違う人は違う指紋", m.mask(CID_EARLY, public=True) != mark_local, "違う")
    ck("読めなかった値は指紋で出ている", "#" in text_public, "出ている")


def main() -> int:
    print("=== その日いた人の名簿を、偽の BigQuery / Firestore で確かめる ===")
    print("（本番にも資格情報にも1バイトも触りません）")

    # 公開の場として一通り流す。ここまでの出力が 9 の材料になる
    mark = BUF.tell()
    os.environ["GITHUB_ACTIONS"] = "true"
    case_boundary()
    case_order()
    case_keep()
    case_cap()
    case_apply()
    case_projection()
    case_window()
    case_fs_window()
    case_broken()
    public_text = BUF.getvalue()[mark:]

    # 手元（GITHUB_ACTIONS 無し）でも同じところを通す
    mark = BUF.tell()
    os.environ.pop("GITHUB_ACTIONS", None)
    st = store({DAY: [CID_LIVE]})
    run(["--day", DAY, "--apply"], st)
    run(["--day", DAY], st)
    local_text = BUF.getvalue()[mark:]

    case_log(public_text, local_text)

    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
