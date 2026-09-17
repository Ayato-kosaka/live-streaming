"""偽のデータで、**公開のログに個人が出ないこと**を実際に動かして確かめる。

    python python/logsafe_selftest.py

**BigQuery にも Firestore にも1バイトも出ない。ネットワークも認証も要らない。**
明細を出す関数だけを、偽のデータで呼ぶ。

## 何を見るか

1つのスクリプトにつき、**両方向**を見る。

- `GITHUB_ACTIONS=1` のとき … `tools/logident.py` の当たりが **0件**
- `GITHUB_ACTIONS` 無しのとき … 明細が **ちゃんと出る**（1件以上）

**片方だけでは合格にしない。** 公開の場で 0 件なのは、明細をまるごと
消してしまっても同じ顔で通る。それだと、手元で回したときに
「誰を取りこぼしたか」が見えなくなって、直しようがなくなる。
消したのではなく**振り分けた**ことまで見る。

## 偽のデータは本番と同じ形にする

チャンネルIDは `UC` + 22文字、どねID は10桁、ハンドルは `@…`。
形が違うと、`tools/logident.py` の探し方が本番では効かないまま通ってしまう
（`docs/island-misses.md` #79 と同じ形）。

## 数えるのは自前の正規表現ではなく `tools/logident.py`

この検査が自前の探し方を持つと、**探し方が2つになる。**
片方を直してもう片方を直し忘れたら、毎晩のログで 0 が出ているのに
検査は通る、という食い違いが起きる。数えるのは1か所だけにする。

## 「公開の場 0件」を、**見ていないから0件**と区別する（対照）

ここがいちばん大事なところ。守っているのが「素性が漏れる側に倒れるもの」
なので、**この検査が寝ていても出力は満点と同じ顔**になる
（`docs/island-standards.md` §15、`docs/island-misses.md` #125）。

だから最後に [4] を回す。両側から当てる。片側だけでは対照にならない。

  1. **守りを外したら、口が1つ残らず落ちること。** `logsafe.public_log()` を
     「いつも手元」に差し替えて、登録してある口を端から公開の場で回す。
     ここで 0件 のままの口は、**何も見ていない口**
  2. **人を指さないもの（指紋 `#a3f9`・形だけの写し `str(24)`・件数だけの行・
     絵文字・版の指定）では落ちないこと。** ここに当たる探し方だと
     「0件」がそもそも出せず、毎晩の赤に本当の漏れが埋もれる
  3. **源を読むほう（`_scan_source`）も両側から。** こしらえた2行——
     素通しの行と `mask()` を通した行——を食わせて、前だけを拾うこと
  4. 差し替えを戻せていること（戻し忘れると、次から素通しの写しを見て
     「0件」と言い続ける）

仕込みは**全部こしらえもの**。本番の値は1つも置かない。この検査の出力も
公開のログに積まれるので、ここが漏れ口になっては本末転倒（だから
件数しか出さない。値は1文字も印字しない）。

## ファイルごと壊した写しで落ちることも見られる

[4] は読み込んである `logsafe` を差し替えるので、**呼ぶ側まで含めて**
当たる（呼ぶ側は `from logsafe import detail_lines` で関数を掴んでいるが、
その中の `public_log()` は差し替わる）。ファイルの側を壊して確かめたいときは、
写しを別の場所に作って回す。リポジトリのファイルは1つも変わらない。

    cp -r python /tmp/broken/ && ln -s "$PWD/tools" /tmp/broken/tools
    # /tmp/broken/python/logsafe.py の public_log() を `return False` にする
    python3 /tmp/broken/python/logsafe_selftest.py   # 終了コード 1

## 終了コード

0=通った / 1=落ちた / **2=見る口が1つも無い**（§15）
"""

import importlib.util
import io
import logging
import os
import sys
import types

# `config.py` は BQ_PROJECT_ID が無いと読み込めない。
# **偽の値を置く。** この検査は BigQuery を1度も触らないので中身は何でもよく、
# 逆に本物を置くと、鍵の要る箱でしか回せない検査になってしまう
os.environ.setdefault("BQ_PROJECT_ID", "fake-project-for-selftest")
os.environ.setdefault("YOUTUBE_CHANNEL_ID", "UCzzFAKE0000000000000009")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "admin"))


def _load_logident():
    """`tools/logident.py` を読み込む。数え方はあちら1か所に寄せる。"""
    path = os.path.join(ROOT, "tools", "logident.py")
    spec = importlib.util.spec_from_file_location("logident", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


logident = _load_logident()

# 取り込みの相手（YouTube の口・Firestore）は、この検査では1度も触らない。
# 入っていない箱でも動くように、名前だけの偽物を置いておく。
# **明細を出す関数はこれらを1つも使わない**ので、偽物で足りる。
# 本物が入っている箱では本物がそのまま使われる（`try` が通る）
def _stub(name: str, package: bool = False, **attrs) -> None:
    """取り込めない相手を、名前だけの偽物で埋める。"""
    try:
        importlib.import_module(name)
        return
    except Exception:  # noqa: BLE001
        pass
    mod = types.ModuleType(name)
    if package:
        # 下に `.http` などを持てるようにする。これが無いと
        # 「'googleapiclient' is not a package」で落ちる
        mod.__path__ = []
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    if "." in name:
        parent, child = name.rsplit(".", 1)
        if parent in sys.modules:
            setattr(sys.modules[parent], child, mod)


_stub("googleapiclient", package=True)
_stub("googleapiclient.discovery", build=None)
_stub("googleapiclient.errors", HttpError=Exception)
_stub("googleapiclient.http", HttpRequest=object)
_stub("google.cloud.firestore", Client=object)


# ------------------------------------------------------------ 偽のデータ

# **本番と同じ形**（`UC` + 22文字 / 10桁 / `@…`）
CID_A = "UCzzFAKE0000000000000001"
CID_B = "UCzzFAKE0000000000000002"
HANDLE_A = "@ふしぎな-fake1"
HANDLE_B = "@fake_person2"
PK = "1000000001"
NAME = "ふしぎな視聴者さん"

# Firestore の書類まるごと。**本番の `streamChatMessages` と同じ形**にする
# （実際に公開のログへ 120 件並んだのがこの形）。書類IDも本番と同じ
# `<videoId>_<messageId>` の組み立てにしておかないと、IDを出す枝が
# 「ここは人を指さない」の顔で通ってしまう
DOC = {
    "at": 1789131531316,
    "messageId": "LCC.EhwKGkNKNkho",
    "kind": "textMessageEvent",
    "text": "ライ麦パンスープに付けながら食べるのおいしそう",
    "videoId": "kyzCpe5Znyk",
    "channelId": CID_A,
    "name": HANDLE_A,
}
DOC_ID = "kyzCpe5Znyk_LCC.EhwKGkNKNkho"

FAILED: list = []

# 見た確かめを1つずつ溜めておく。**対照はここを端から回す。**
#
# 溜めずに対照を別に書くと、確かめが2つに割れる——本体で見ている口と、
# 対照で壊してみせる口が別物になり、**本体にだけ在る口は対照のかからない
# まま**になる（`docs/island-misses.md` #125 の「繋いだ1本しか見ていない」と
# 同じ形）。ここに登録した口は、必ず両側から当たる。
#
# 中身は `(名前, emit)`。`emit(public: bool) -> str` は、その口を1回動かして
# **出た字をそのまま返す**。
PROBES: list = []

# そのうち、**壊していない写しで「公開の場 0件」だった口**の名前。
# 対照の最後で「差し替えを戻せているか」を見るとき、0 と比べると
# **壊れた写しを食わせた回に、戻し忘れと同じ顔の✕が出る**（実際に出た）。
# 比べる相手は 0 ではなく「さっき通っていた口」。
CLEAN: list = []


class Catch(logging.Handler):
    """出た字をそのまま溜める。**画面ではなく、出力そのものを見る。**"""

    def __init__(self):
        super().__init__()
        self.buf = io.StringIO()

    def emit(self, record):
        self.buf.write(record.getMessage() + "\n")


def run(target_logger, fn, public: bool) -> str:
    """明細を出す関数を1回呼んで、出た字をぜんぶ返す。

    Args:
        target_logger: そのスクリプトの logger
        fn: 引数なしで呼べる、明細を出す手続き
        public: 公開の場（Actions）として動かすか

    Returns:
        出た字
    """
    if public:
        os.environ["GITHUB_ACTIONS"] = "true"
    else:
        os.environ.pop("GITHUB_ACTIONS", None)
    h = Catch()
    target_logger.addHandler(h)
    old = target_logger.level, target_logger.propagate
    target_logger.setLevel(logging.DEBUG)
    target_logger.propagate = False
    try:
        fn()
    finally:
        target_logger.removeHandler(h)
        target_logger.setLevel(old[0])
        target_logger.propagate = old[1]
    return h.buf.getvalue()


def check(label: str, target_logger, fn) -> None:
    """1つのスクリプトについて、両方向を見る。"""
    def emit(public: bool) -> str:
        return run(target_logger, fn, public=public)

    PROBES.append((label, emit))

    pub = emit(True)
    hand = emit(False)

    n_pub = sum(logident.count(pub).values())
    n_hand = sum(logident.count(hand).values())

    ok_pub = n_pub == 0
    # 手元では**出ていないといけない。** 消したのではなく振り分けたことの証明
    ok_hand = n_hand > 0

    if ok_pub:
        CLEAN.append(label)
    mark = "○" if (ok_pub and ok_hand) else "✕"
    print(f"  {mark} {label}: 公開の場 {n_pub}件 / 手元 {n_hand}件")
    if not ok_pub:
        print(f"      ✕ 公開の場に {n_pub} 件出ています")
        FAILED.append(f"{label}（公開の場に出た）")
    if not ok_hand:
        print("      ✕ 手元でも出ていません。**消してしまっています**")
        FAILED.append(f"{label}（手元でも出ない）")


def check_masked(label: str, mod, sample: str) -> None:
    """文の途中に識別子を出すスクリプト。`mask()` を通しているかを見る。

    行ごと落とすわけにいかない（「チャンネル %s が見つかりません」の行を
    消すと、何が起きたのか分からなくなる）ので、こちらは `mask()` を使う。
    **そのスクリプトが持っている `mask`** を呼ぶので、
    import し忘れや自前の書き直しがあれば落ちる。
    """
    def emit(public: bool) -> str:
        if public:
            os.environ["GITHUB_ACTIONS"] = "true"
        else:
            os.environ.pop("GITHUB_ACTIONS", None)
        try:
            return f"チャンネル {mod.mask(sample)} を引きました"
        finally:
            os.environ.pop("GITHUB_ACTIONS", None)

    PROBES.append((label, emit))

    pub = emit(True)
    hand = emit(False)

    n_pub = sum(logident.count(pub).values())
    n_hand = sum(logident.count(hand).values())
    ok = n_pub == 0 and n_hand > 0
    if n_pub == 0:
        CLEAN.append(label)
    print(f"  {'○' if ok else '✕'} {label}: 公開の場 {n_pub}件 / 手元 {n_hand}件")
    if not ok:
        FAILED.append(label)


def _scan_source(path: str, names) -> list:
    """字を読んで、裸の識別子がログに渡っている行を拾う。

    **対照もここを通す。** 判定を `check_source` の中に書いてしまうと、
    対照は「同じことをするつもりで書いた別の判定」を当てることになり、
    本番の判定が寝ていても対照だけ元気、という形になる。

    Args:
        path: 見るファイル（`ROOT` からの相対でも、絶対でもよい）
        names: ログに裸で渡ってはいけない変数の書き方

    Returns:
        `(行番号, 変数名)` の一覧
    """
    bad = []
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if "log" not in line and "print" not in line:
                continue
            for n in names:
                # `{名前}` が f 文字列にそのまま入っている＝素通し。
                # `{mask(名前)}` なら直前が `(` なので当たらない
                if "{" + n + "}" in line:
                    bad.append((i, n))
    return bad


def check_source(label: str, path: str, names) -> None:
    """源を読んで、**裸の識別子がログに渡っていない**ことを見る。

    `mask()` を通す書き方は、あとから1行足したときに素通しへ戻りやすい。
    動かす検査は「いま呼んだ枝」しか見ないので、ここだけは字を読む。

    Args:
        label: 出す名前
        path: 見るファイル
        names: ログに裸で渡ってはいけない変数の書き方
    """
    bad = _scan_source(path, names)
    print(f"  {'○' if not bad else '✕'} {label}: 裸で渡っている箇所 {len(bad)}")
    for i, n in bad:
        print(f"      ✕ {path}:{i} に {n} が素通しで入っています")
    if bad:
        FAILED.append(label)


# ------------------------------------------------------------ 各スクリプト


def case_logsafe():
    print("\n[1] logsafe そのもの")
    import logsafe

    check("logsafe.detail_lines", logging.getLogger("t1"),
          lambda: [logging.getLogger("t1").info("%s", x)
                   for x in logsafe.detail_lines([(CID_A, HANDLE_A), (PK, NAME)])])

    os.environ["GITHUB_ACTIONS"] = "true"
    pub = logsafe.mask(CID_A)
    same = logsafe.mask(CID_A)
    other = logsafe.mask(CID_B)
    os.environ.pop("GITHUB_ACTIONS", None)
    ok = (sum(logident.count(pub).values()) == 0 and pub == same and pub != other
          and logsafe.mask(CID_A) == CID_A)
    print(f"  {'○' if ok else '✕'} logsafe.mask: "
          f"公開では指紋（同じ値は同じ字 / 違う値は違う字）、手元ではそのまま")
    if not ok:
        FAILED.append("logsafe.mask")


def case_sketch():
    """書類まるごとを出す道（`logsafe.sketch` → `admin/_fs.show`）。

    **`show()` を通る側ではなく、`show()` そのものを見る。**
    Firestore の書類をログに出すスクリプトは十数本あって、
    1本ずつ検査を書いても書き忘れた1本から漏れる。
    通る1か所を見ておけば、あとから増えた呼び出しも同じ守りに入る。
    """
    import logsafe

    check("logsafe.sketch（書類まるごと）", logging.getLogger("t_sketch"),
          lambda: logging.getLogger("t_sketch").info("%s", logsafe.sketch(DOC)))

    # 呼ぶ側が実際に通る口。ここが素通しなら上が直っていても漏れる
    import _fs

    check("admin/_fs.show（書類まるごと）", logging.getLogger("t_show"),
          lambda: logging.getLogger("t_show").info("%s", _fs.show(DOC)))

    # 書類ID。値を伏せてもIDが人を指していたら同じこと
    check("admin/firestore_read（書類ID）", logging.getLogger("t_id"),
          lambda: logging.getLogger("t_id").info(
              "  %s  %s", logsafe.mask(DOC_ID), _fs.show(DOC)))

    # 手元では**中身がそのまま読めること**まで見る。件数だけだと、
    # 「型と長さの写し」を手元にも返してしまう直し方が通ってしまう
    os.environ.pop("GITHUB_ACTIONS", None)
    hand = _fs.show(DOC)
    ok = DOC["text"] in hand and HANDLE_A in hand and CID_A in hand
    print(f"  {'○' if ok else '✕'} admin/_fs.show（手元では中身が読める）")
    if not ok:
        FAILED.append("admin/_fs.show（手元で中身が読めない）")

    # 公開の場では**欄の名前と型と長さは残ること。** 全部消してしまうと、
    # 「読めたが空だった」と「そもそも欄が無い」が見分けられなくなる
    os.environ["GITHUB_ACTIONS"] = "true"
    pub = _fs.show(DOC)
    os.environ.pop("GITHUB_ACTIONS", None)
    ok = ("channelId" in pub and f"str({len(CID_A)})" in pub
          and DOC["text"] not in pub)
    print(f"  {'○' if ok else '✕'} admin/_fs.show（公開でも欄の名前と型と長さは残る）")
    if not ok:
        FAILED.append("admin/_fs.show（形まで消えている）")


def case_island_channels():
    import island_channels as m

    changed = [
        (CID_A, {"name": HANDLE_A, "days": 5}, {"name": HANDLE_B, "days": 4}),
        (CID_B, {"name": NAME, "days": 1}, None),
    ]
    check("island_channels.log_changed", m.logger, lambda: m.log_changed(changed))


def case_island_channel_photos():
    import island_channel_photos as m

    had = {CID_A: {"name": HANDLE_A, "photo": "x"}, CID_B: {"name": NAME}}
    check("island_channel_photos.log_want", m.logger,
          lambda: m.log_want([CID_A, CID_B], had))


def case_island_tips():
    import island_tips as m

    rows = [
        {"day": "2026-09-13", "source": "youtube", "channelId": CID_A, "amount": 500},
        {"day": "2026-09-13", "source": "doneru", "channelId": CID_B, "amount": 1000},
    ]
    check("island_tips.log_changed", m.logger, lambda: m.log_changed(rows))


def case_donor_channels():
    import donor_channels as m

    check("donor_channels.log_ambiguous", m.logger,
          lambda: m.log_ambiguous([(HANDLE_A, 2), (NAME, 3)]))


def case_doneru_viewers():
    import doneru_viewers as m

    rows = [{"pk": PK, "name": NAME, "n": 3,
             "d0": "2026-06-01", "d1": "2026-09-13"}]
    known = {PK: {"handle": HANDLE_A}}
    check("admin/doneru_viewers.log_viewers", m.log,
          lambda: m.log_viewers(rows, known))


def case_youtube_api():
    import youtube_api.discovery as d
    import youtube_api.oauth as o

    check_masked("youtube_api/discovery（mask）", d, CID_A)
    check_masked("youtube_api/oauth（mask）", o, CID_A)
    check_source("youtube_api/discovery（源）", "python/youtube_api/discovery.py",
                 ["YOUTUBE_CHANNEL_ID"])
    check_source("youtube_api/oauth（源）", "python/youtube_api/oauth.py",
                 ["self._cached_channel"])


# ------------------------------------------------------------ 対照

# **拾ってはいけないもの。** 毎晩の Actions のログに必ず並ぶ字で、どれも人を指さない。
# ここに当たってしまう探し方だと「公開の場 0件」が**そもそも出せない。**
# 毎晩赤が鳴って、誰も読まなくなって、本当に漏れた晩も同じ赤に埋もれる。
#
# **中身は全部こしらえもの。本番の値は1つも置かない**（この検査の出力も
# 公開のログに積まれるので、ここが漏れ口になっては本末転倒）。
SAFE_LINES = [
    "紐付け待ちが 2 件あります。/me の「投げ銭を、YouTube につなぐ」から",
    "3人ぶん書き足しました（新しく入ったのは 1 人）",
    "きょうの釣果 5 件 🐟 きのうは 4 件でした 🎣",
    "actions/checkout@v4 / setup-python@v5 / google-github-actions/auth@v2",
    "2026-09-17 ぶんの焼き直し（attempt 1）",
    "islandDonors: new 1 / linked 12 / ignored 0",
]


def case_control() -> None:
    """**この検査そのものが効いているか**を、両側から当てる。

    上の [1]〜[3] は「壊していない写し」を見ている。ここはその外側——

      1. **守りを外した写しで、口が1つ残らず落ちること**（＝寝ていない）
      2. **人を指さない字では落ちないこと**（＝狼少年でない）

    片側だけでは対照にならない（`docs/island-misses.md` #125 の決めごと1）。
    1 だけだと、何にでも当たる探し方が満点で通る。2 だけだと、
    何も見ていない探し方が満点で通る。
    """
    import logsafe

    print("\n[4] 対照（この検査そのものが効いているか）")
    print(f"  見ている口: {len(PROBES)} 口"
          f"（[1]〜[3] はこの {len(PROBES)} 口を、壊していない写しで見た）")
    if not PROBES:
        print("      ✕ 口が1つも登録されていません。**数えるものがありません**")
        return

    # --- 1. 守りを外したら、どの口も落ちること
    #
    # 外すのは `public_log()` ひとつ。`detail_lines` / `mask` / `sketch` は
    # どれもここを見ているので、**1行外すだけで3本まとめて素通し**になる。
    # #180（Doneru の鍵）・#217（API キー）・#379（公開ログの名簿 1,065実行ぶん）が
    # 起きていたときの姿がこれ。
    #
    # **写しを作らず、いま読み込んである本物を差し替える。** 写しを別名で
    # 読み込むと、呼ぶ側（`island_channels` など）は `from logsafe import …` で
    # 本物を掴んだままなので、**呼ぶ側まで含めて壊れたことにならない。**
    # ここを差し替えると、呼ぶ側が掴んでいる関数の中の `public_log()` も
    # 差し替わる——つまり**毎晩ほんとうに通る道**で対照が当たる。
    real = logsafe.public_log
    logsafe.public_log = lambda: False
    try:
        blind = []
        for label, emit in PROBES:
            n = sum(logident.count(emit(True)).values())
            if n == 0:
                blind.append(label)
            print(f"      {'○ 落ちた  ' if n else '✕ 落ちない'} {label}: {n}件")
    finally:
        # 戻し忘れると、この先の確かめが全部素通しの写しで回る
        logsafe.public_log = real

    if blind:
        print(f"      ✕ 守りを外しても落ちない口が {len(blind)} 件: {', '.join(blind)}")
        print("         その口は**何も見ていません**（0件は「漏れていない」ではない）")
        FAILED.append(f"対照・守りを外しても落ちない（{len(blind)}口）")
    else:
        print(f"  ○ 守りを外すと、{len(PROBES)} 口ぜんぶ落ちる")

    # --- 2. 人を指さない字では落ちないこと
    #
    # 指紋（`#a3f9`）・形だけの写し（`str(24)`）・件数だけの行・絵文字・
    # 版の指定。**どれも公開の場に出してよいもの**で、ここに当たるなら
    # 「0件」が出せない探し方になっている。
    safe = list(SAFE_LINES)
    os.environ["GITHUB_ACTIONS"] = "true"
    safe.append(f"チャンネル {logsafe.mask(CID_A)} と {logsafe.mask(CID_B)} を引きました")
    safe.append(f"どね {logsafe.mask(PK)} / 名前 {logsafe.mask(NAME)}")
    safe.append(logsafe.sketch(DOC))
    safe.append(f"書類 {logsafe.mask(DOC_ID)} を読みました")
    os.environ.pop("GITHUB_ACTIONS", None)

    hit = []
    for line in safe:
        n = sum(logident.count(line).values())
        if n:
            hit.append(n)
    print(f"  {'○' if not hit else '✕'} 人を指さない字 {len(safe)} 行では落ちない"
          f"（当たった行 {len(hit)}）")
    if hit:
        # **行そのものは出さない。** 出すと、当たった字（＝人を指しうる字）を
        # 公開のログへ写すことになる
        print("      ✕ 公開の場に出してよいはずの字に当たっています。"
              "探し方が広すぎるか、mask / sketch が伏せていません")
        FAILED.append("対照・人を指さない字に当たった")

    # --- 3. 字を読むほう（`_scan_source`）も両側から当てる
    #
    # こちらは動かす検査ではないので、上の差し替えが当たらない。
    # **こしらえた2行を食わせて、素通しの行だけを拾うこと**を見る。
    import tempfile

    d = tempfile.mkdtemp(prefix="logsafe-control-")
    bare = os.path.join(d, "bare.py")
    with open(bare, "w", encoding="utf-8") as f:
        f.write('logger.info(f"チャンネル {FAKE_CHANNEL} を引きました")\n')
    safe_py = os.path.join(d, "safe.py")
    with open(safe_py, "w", encoding="utf-8") as f:
        f.write('logger.info(f"チャンネル {mask(FAKE_CHANNEL)} を引きました")\n')

    n_bare = len(_scan_source(bare, ["FAKE_CHANNEL"]))
    n_safe = len(_scan_source(safe_py, ["FAKE_CHANNEL"]))
    ok = n_bare == 1 and n_safe == 0
    print(f"  {'○' if ok else '✕'} 源を読むほう: 素通しの行 {n_bare}件（1であること） / "
          f"mask を通した行 {n_safe}件（0であること）")
    if not ok:
        FAILED.append("対照・源を読むほう")

    # --- 4. 守りを戻したことの確認
    #
    # 差し替えたまま終わると、この検査は次から**素通しの写しを見て**
    # 「0件」と言い続ける。戻っていることを数で見る
    left = [lb for lb, em in PROBES
            if lb in CLEAN and sum(logident.count(em(True)).values())]
    print(f"  {'○' if not left else '✕'} 差し替えを戻したあと、"
          f"さっき通っていた {len(CLEAN)} 口のうち出ている口 {len(left)} 件")
    if left:
        FAILED.append("対照・差し替えが戻っていない")


def main() -> int:
    print("=== 公開のログに個人が出ないかを、偽のデータで動かして確かめる ===")
    print("（BigQuery にも Firestore にも1バイトも出ません）")
    case_logsafe()
    case_sketch()
    print("\n[2] 毎晩の取り込み（schedule_fetch_chat.yml）")
    case_island_channels()
    case_island_channel_photos()
    case_island_tips()
    case_youtube_api()
    print("\n[3] 管理スクリプト（run_admin_script.yml）")
    case_donor_channels()
    case_doneru_viewers()
    case_control()

    print()
    # **「0件」を、見ていないから0件と区別する**（`docs/island-standards.md` §15）。
    # 口が1つも登録されていなければ、上の [1]〜[3] は何も見ずに通っている
    if not PROBES:
        print("✕ 見る口が1つもありませんでした（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print(f"○ {len(PROBES)} 口を両方向から見て、ぜんぶ通りました"
          f"（守りを外すと {len(PROBES)} 口とも落ちるところまで見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
