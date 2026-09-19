"""**島が名指ししている配信を、押したら本当に見られるかを1本ずつ確かめる。**

    python3 python/dead_stream_watch.py                 島ぜんぶ（既定）
    python3 python/dead_stream_watch.py --no-deep       oembed だけで済ませる（速い）
    python3 python/dead_stream_watch.py --ids AAA BBB   渡した id だけ見る（対照用）
    python3 python/dead_stream_watch.py --dir 写し      別の置き場を見る
    python3 python/dead_stream_watch_selftest.py         ネットに出ない側の対照

終了コード 0=ぜんぶ見られる / 1=見られないものがあった / **2=数えるものが無い**。

**2 を出すのは「0件でした」と言えないとき。** 見られないものが1本でも見つかったら、
測れなかったぶんが混ざっていても **1**（見つかった本数は本物で、直す相手がいる）。
0件のまま測れなかったぶんが残っていたら **2**——「見つからなかった」のか
「届かなかった」のかが分けられないので、**0件とは言わない。**

## なぜ要るか

issue #339 は**サムネイルが 403/404 で返る**ことを 401本ぶん数えたもので、
**「押したら見られるか」は誰も測っていなかった。** 分母も違う（401 対 719）。
サムネイルは YouTube が 404 でも灰色の板を返すので、**絵としては描けてしまう。**
絵が出ているかどうかと、押した人がその配信を見られるかどうかは、別のこと。

実測（2026-09-17、719本。測れなかった 0本）:

| | 件数 | 戻るか |
| --- | --- | --- |
| 押せば見られる | 695 | |
| 非公開（403） | 15 | **あやとが戻せる** |
| ログインが要る（401） | 2 | 戻せる見込み |
| 消えている（404） | 4 | 戻らない |
| **oembed は 200 を返すのに、押すと見られない** | **3** | 戻らない |
| 合わせて、押しても見られない | **24** | 戻せる 17 / 戻らない 7 |

いちばん下が、この見張りを作った理由。**oembed だけでは見えない。**
`LfUJ25h2f44`（年越し24時間配信）は oembed が題まで返すのに、押すと
「このライブ ストリームの記録は、ご覧いただけません」と出る。
配信が終わったあと録画が残らなかったぶんで、**oembed から見ると生きている。**
しかもこの1本は `legends.ts`（語り継がれている企画）に出ている。

## 戻るものと、戻らないものを分ける

ここがこの見張りのいちばん大事なところ。件数をひとまとめにしない。

| 種類 | 戻るか | 島が何をすべきか |
| --- | --- | --- |
| `PRIVATE`（403） | **あやとが戻せる**（限定公開・メンバー限定） | 戻るまで待てる。隠すなら**戻したらひとりでに戻る形**で |
| `LOGIN`（401） | あやとが戻せる見込み | 同上 |
| `GONE`（404） | **戻らない。** 誰にもどうにもできない | 島から外すか、見られないと分かる形にする |
| `NO_REC` | 戻らない（録画そのものが無い） | 同上 |

**403 と 404 を同じ扱いにしない。** 同じ「灰色のカード」にすると、
あやとが公開に戻した日に、島がそれを知らないまま隠し続ける。

## どうやって測るか（2段）

1. **oembed**（`https://www.youtube.com/oembed?...`）を1本ずつ。
   200 / 401 / 403 / 404 がそのまま返る。速い（1本 0.3 秒）
2. 200 だったものだけ **`youtubei/v1/player` の `playabilityStatus`**。
   ここで初めて「録画が無い」が見える

**2段目が言ってよいのは3つだけ**——「押せる」「録画が無い」「分からない」。
「消えている」「非公開」は**1段目の仕事**で、2段目がそう言い出したら
1段目と食い違っている＝こちらが測れていない、と読む。
これを分けていなかったせいで、**1度 148本を「消えている」と報告しかけた**
（`classify_player` の頭）。

**2段目は2回作り直した。**

| | どうだったか |
| --- | --- |
| `yt-dlp` | この箱では**4割**が「ロボットではないことを確かめさせて」で返る |
| watch の頁（1.3MB） | 文面は読めるが、**719回ぶら下げると 429** で箱ごと止まる |
| **`youtubei/v1/player`（数KB）** | 頁が中で叩いている口。**同じ文面が返って、軽い** |

1つめは 20本を当てて ok=12 / bot=8。4本ずつ 719本を当てたら、途中から
生きた配信まで8回とも断られた。2つめは 429 のあと10分ほど何も返らなくなった。

3つとも答えは同じで、違うのは**どれだけ重いか**だけ。
鍵は要らない（付けても付けなくても同じ答え。**鍵は書かない**）。
**外の道具に頼らない**ぶん、YouTube が組み立てを変えたら読めなくなるが、
そのときは `OK` ではなく `BLIND`（測れなかった）に落ちる。

**軽くしても、速く当てれば締め出される。** 2本ずつ・1本 3秒
（`PLAY_WORKERS` / `PLAY_GAP`。毎秒 0.7本、719本で 18分）。
**速くしようとすると、速くなるのではなく測れなくなる。**

**429 が来たら、全員で休む**（`_cool_down`）。締め出しは1本ごとではなく
**箱ごと**にかかるので、自分だけ下がって他が当て続けたら解けない。
1度めは2分、来るたび倍にして10分で頭打ち。

**ログインしていない側から見る。** cookie も鍵も渡さない。渡すと、あやとにだけ
見えるメンバー限定が「見られる」に化ける。**測りたいのは、視聴者さんが
押したときに見えるか。**

## 対照（測る前に、両側から当てる）

本物の面を測る前に、必ず**対照を先に回す**。
`--no-control` で外せるが、外した run は印字の頭に「根拠にならない」と出る
（対照そのものを手で確かめるとき用で、ふだん使うものではない）。

- **死んだ側**: 存在しない11字の id を当てて、`GONE` として拾えること
- **生きた側**: あやとの配信の中から選んだ id を当てて、**1件も出ないこと**
- **2段目の側**: oembed が 200 を返すのに録画の無い配信（`LfUJ25h2f44`）を当てて、
  `NO_REC` として拾えること。**ここが黙ると「698本ぜんぶ見られます」になる**

**どれか1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。**
ネットに届かない箱で回すと生きた側が落ちるので、**「0件でした」とは言えない。**
「見つからなかった」と「数えられなかった」は別のもの（`docs/island-standards.md` §15）。

## 印字に入れないもの

このリポジトリは公開で、Actions のログも誰でも読める。
出すのは**配信ID・日付・件数・ファイル名**だけ。
**視聴者さんの名前・チャンネルID・コメント本文・鍵の値は1文字も出さない。**
配信の題も出さない（あやとのものだが、出しても分かることが増えないため）。
"""

from __future__ import annotations

import json
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from unicodedata import east_asian_width

REPO = Path(__file__).resolve().parent.parent
CONTENT = REPO / "site" / "content"

# 焼き込みの中で配信を名指ししている鍵。**名前で分かるぶん。**
# ここは形を見ない——`videoId` と書いてあるものは配信IDだと信じてよい
VIDEO_RE = re.compile(r'"?(?:videoId|v|video)"?:\s*"([A-Za-z0-9_-]{11})"')

# **名前で分からない書きかた**（2026-09-19）。ここを見ていなかったので、
# `chapterStreams.ts` の 717本・`shorts.ts` の 83本・`streamPeaks.ts` の 267本が
# **1本も数えられていなかった。** 見張りは毎晩「9本の焼き込みを見ました」と
# 言っていて、そこに一度も出てこなかった（`docs/island-misses.md` #168）。
#
# | 書きかた | どこ |
# | --- | --- |
# | `["日付", "ID", …]` | `chapterStreams.ts` `legendDays.ts` `countryStats.ts` |
# | `"ID": { … }` | `streamPeaks.ts` |
# | `id: "ID"` | `shorts.ts` |
#
# **形を見ないと拾えない。** `"middle-east": {` も `id: "app-android"` も
# 同じ11字なので、素直に広げると分母のほうが膨らむ（実測で偽物 10 件）。
LOOSE_RE = re.compile(
    r'\[\s*"\d{4}-\d\d-\d\d",\s*"([A-Za-z0-9_-]{11})"'  # ["日付", "ID", …]
    r'|"([A-Za-z0-9_-]{11})"\s*:\s*\{'                     # "ID": {…}
    r'|\bid:\s*"([A-Za-z0-9_-]{11})"'                       # id: "ID"
)

# YouTube の id の11字目に立てる字。**16通りしかない**——64ビットを6ビットずつ
# 11字に載せるので、最後の字は4ビットぶんしか使わない。
# `dead_stream_watch_selftest.py` の `TAIL_OK` と同じ（あちらは対照の id を作るため）
TAIL_OK = frozenset("AEIMQUYcgkosw048")


def looks_like_video(v: str) -> bool:
    """名前で分からない11字が、配信IDの形をしているか。

    2つ見る。**どちらも本番の 813本ぜんぶが通ることを確かめてある**（2026-09-19）
    （`dead_stream_watch_selftest.py` の「本物がぜんぶ形の規則を通る」）。

    1. 11字目が `TAIL_OK` にある（`middle-east` の `t`、`app-android` の `d`、
       `newyear-24h` の `h`、`latvia-s167` の `7` はここで落ちる）
    2. 大文字か数字を1つ以上もつ。小文字と `-` だけの11字は slug のほう
       （`netherlands` `french-toas` `okonomiyaki` がここで落ちる。
       1 だけでは通ってしまう）

    **`VIDEO_RE` には当てない。** 名前で分かっているものを形で落とすと、
    落ちたことに誰も気づけない。ここは「名前が無いぶんを、形で補う」側だけ。
    """
    return v[10] in TAIL_OK and any(c.isupper() or c.isdigit() for c in v)


DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
# 配信IDの形。**`-` や `_` で始まるものもある**
ID_RE = re.compile(r"[A-Za-z0-9_-]{11}")

# 同じ塊の中にある日付を拾う窓（文字数）。
# 日付は「その配信の日」で、あやとがどれを戻すかを決めるときの手がかりになる
# （issue #339 は13本が8日間に固まっていることで、まとめて片付くと分かった）
DATE_WINDOW = 240

# --- 見られない種類。**戻るものと戻らないものを混ぜない** ---
OK = "OK"  # 押せば見られる
PRIVATE = "PRIVATE"  # 403。非公開・限定公開・メンバー限定。**あやとが戻せる**
LOGIN = "LOGIN"  # 401。ログインが要る。**あやとが戻せる見込み**
GONE = "GONE"  # 404。消えている。**戻らない**
NO_REC = "NO_REC"  # oembed は 200 だが、録画が無い。**戻らない**
OTHER = "OTHER"  # 上のどれでもない返り（新しい形が来たら、黙って OK に畳まない）
BLIND = "BLIND"  # 測れなかった（届かない・判断がつかない）。**0件と言わない**

# 戻せる見込みのあるもの（あやとの操作で公開に戻る）
CURABLE = (PRIVATE, LOGIN)
# 誰にもどうにもできないもの
FOREVER = (GONE, NO_REC)

LABEL = {
    OK: "押せば見られる",
    PRIVATE: "非公開（403。あやとが戻せる）",
    LOGIN: "ログインが要る（401。あやとが戻せる見込み）",
    GONE: "消えている（404。戻らない）",
    NO_REC: "録画が無い（押すと見られない。戻らない）",
    OTHER: "見たことのない返り",
    BLIND: "測れなかった",
}

# 焼き込み1本ずつの「どの面に出るか」。**重さが違う。**
# `legends.ts` に出ている1本と `onThisDay.ts` にしか出ていない1本は、
# 同じ1件でも島の見え方がまるで違う。件数だけ出すと、そこが消える。
# **面の名前は人が書く。** 取り込み元から導けるのは「どのファイルに在るか」までで、
# それがどの画面のどこに出るかは import の網からは決まらない（1本が何面からも読まれる）
PAGES: dict[str, str] = {
    "legends.ts": "語り継がれている企画（/legends, /streams, 島の棚）",
    "countries.ts": "歩いた国（/map/<国>）と、その話の出てくる配信",
    "recipes.ts": "台所の品（/kitchen/<品>）",
    "apps.ts": "作ったアプリ（/apps/<名前>）",
    "voices.ts": "島の声（/about）",
    "streamTypes.ts": "配信の種類（/streams, /kitchen, /about）",
    "cityStreams.ts": "街ごとの配信一覧（/map/<国>）",
    "onThisDay.ts": "1年前の今日（島のトップ）",
    "kitchenTalk.ts": "料理のときのコメント（/kitchen/<品>。40本、どれも他の面にも出る）",
    # ここから下は、名前で分からない書きかたで名指ししていた面（2026-09-19）
    "countryStats.ts": "国ごとの「いちばん人が集まった配信」（/map/<国>）",
    "nordic.ts": "北欧の旅の、その日の配信（/nordic/day/<n>, /nordic/<国>）",
    "chapterStreams.ts": "過去の島の配信一覧（/island/<章>/streams）",
    "legendDays.ts": "語り継がれている企画の、日ごとの配信（/legends/<名前>）",
    "shorts.ts": "ショート動画の棚（/map, 島の棚）",
    "streamPeaks.ts": "コメントがいちばん重なった秒（配信カードの押しどころ）",
}

# **島が1件ずつ選んで押し出している面。ここの死にリンクは重い。**
# 分け目は「一覧に流し込んでいるか、1件を選んで送り出しているか」。
# 語り継がれている企画・国の見どころ・料理・アプリ・他己紹介は、
# **その1件の行き先がその配信しかない。** 押して見られなければ、
# その品・そのアプリ・その言葉が、行き止まりになる。
# 一覧（`SIDE`）は「並んでいるうちの1枚」で、隣に生きた配信がある
# `countryStats.ts` と `nordic.ts` は**1件を選んで押し出す側**。
# 国の代表配信も、旅のその日の配信も、行き先はその1本しかない
FRONT = ("legends.ts", "countries.ts", "recipes.ts", "apps.ts", "voices.ts",
         "countryStats.ts", "nordic.ts")
SIDE = ("streamTypes.ts", "cityStreams.ts", "onThisDay.ts", "kitchenTalk.ts",
        "chapterStreams.ts", "legendDays.ts", "shorts.ts", "streamPeaks.ts")

# 対照の生きた側。**あやとの配信から選んだ、いまのところ公開のもの。**
# 3本並べてあるのは、1本が非公開になった日に見張りごと止まらないため。
# **3本とも落ちたら、それは「ネットに届いていない」と読んで 2 で止まる**
# （3本が同じ晩に非公開になる目はあるが、そのときは島も大事になっているので
# 止まって困らない）
LIVE_CONTROL = ("K6OnRFxE6xg", "0yjsa9Rd7sY", "G9xQx9sDi8Q")

# 対照の死んだ側。**存在しない11字。** YouTube の id の形は満たすので、
# 「形が違うから落とした」ではなく「当てに行って 404 だった」ことが見える。
# **11字目は限られた字しか取れない**（`A E I M Q U Y c g k o s w 0 4 8`）。
# ここを外すと oembed が 404 ではなく **400** を返して、対照が「拾えなかった」に化ける
# （`XxXxWwW1111` で実際にそうなった）
DEAD_CONTROL = ("ZzZzQqQ000A", "dEaDdEaD00A")

# **2段目の対照。** oembed は 200 を返すのに、押すと見られない配信。
# この見張りが在る理由そのもので、`NO_REC` で返らなければ2段目が死んでいる。
# **戻ることは無い**（録画が残らなかった配信なので、公開に戻すという話がない）ので、
# 対照として据え置ける。島の `onThisDay.ts` に実際に出ている本物
PLAY_CONTROL = ("LfUJ25h2f44",)

# 2段目で当て直す回数。**締め出し（429）は待てば解ける**ので、1本ずつ下がりながら
# 当て直す。**失敗したときしか当て直さないので、回数を増やしても待ち時間は増えない。**
# ここで諦めたぶんは `BLIND`＝測れなかったに積む。**`OK` に畳まない**
PLAY_TRIES = 8

# 2段目を何本ずつ当てるか。**多くすると、そのぶん断られる。**
# 4本ずつ間を置かずに 719本を回したら、途中から**生きた配信まで8回とも断られる**
# ところまで締められた（そのとき対照が落ちて、数字を出さずに 2 で止まった＝
# 作りは効いていた）。**ここを上げると、速くなるのではなく測れなくなる**
PLAY_WORKERS = 2

# 2段目の1本と1本のあいだ（秒）。**締め出しは「どれだけ速く当てたか」で決まる。**
# 間を置かずに当てたら **429 Too Many Requests** になり、そのあと10分ほど
# 何も返ってこなくなった。1.2秒おきに順番に当てても、たまに 429 が出る。
# 2本 × 3秒＝毎秒 0.7本。719本で 18分
PLAY_GAP = 3.0

# 429（Too Many Requests）が返ってきたときに、**全員で**休む秒数。
# 締め出しは1本ごとではなく**箱ごと**にかかる。自分だけ休んで他の担当が
# 当て続けたら、休んだ意味が無い。実測では 10分ほどで解けたので、
# 1度めは2分、来るたび倍にして 10分で頭打ちにする
COOL_FIRST = 120.0
COOL_MAX = 600.0

# いつまで全員で休むか。**測る側の共有の状態はここだけ**
_cool_until = 0.0
_cool_span = COOL_FIRST
_cool_lock = threading.Lock()


def _cool_down() -> float:
    """429 を受けた。**全員で**休む刻限を先に延ばして、休む秒数を返す。"""
    global _cool_until, _cool_span
    with _cool_lock:
        _cool_until = max(_cool_until, time.monotonic() + _cool_span)
        _cool_span = min(COOL_MAX, _cool_span * 2)
        return _cool_until - time.monotonic()


def _wait_cool() -> None:
    """休む刻限が来ていたら、そこまで待つ。当てに行く前に必ず通る。"""
    while True:
        with _cool_lock:
            left = _cool_until - time.monotonic()
        if left <= 0:
            return
        time.sleep(min(left, 5.0))


OEMBED = "https://www.youtube.com/oembed?url=https%3A//www.youtube.com/watch%3Fv%3D{}&format=json"


@dataclass
class Sighting:
    """1本の配信が、どの焼き込みのどこに出ているか。"""

    files: set[str] = field(default_factory=set)
    dates: set[str] = field(default_factory=set)


@dataclass
class Probe:
    """1本ぶんの見立て。`why` は人が読む1行（機械の判定には使わない）。"""

    vid: str
    kind: str
    why: str = ""


@dataclass
class Verdict:
    seen: dict[str, Sighting] = field(default_factory=dict)
    probes: dict[str, Probe] = field(default_factory=dict)
    files: list[str] = field(default_factory=list)
    blind: list[str] = field(default_factory=list)  # 止める理由。空でなければ 2


def _pad(text: str, width: int) -> str:
    """表の桁をそろえる。**`:<34` では揃わない。**

    Python の書式は「字の数」で埋めるが、端末では全角が2つぶんの幅を取る。
    日本語の見出しを並べると桁がぐしゃぐしゃになって、読む人が数字を拾えない
    """
    w = sum(2 if east_asian_width(c) in "WFA" else 1 for c in text)
    return text + " " * max(0, width - w)


def _near_date(text: str, at: int) -> str:
    """配信IDのそばにある日付。塊の中に無ければ空。

    1本ぶんの塊（`{ "videoId": ..., "date": ... }`）は 240字に収まるので、
    前後をその幅だけ見て、いちばん近いものを取る。**当てずっぽうなので、
    印字では「近くにある日付」と断る。** 無理に埋めて嘘の日を出すより、
    空のほうがまし
    """
    lo = max(0, at - DATE_WINDOW)
    hits = [(abs(m.start() - at), m.group(0)) for m in DATE_RE.finditer(text, lo, at + DATE_WINDOW)]
    return min(hits)[1] if hits else ""


def scan_dir(d: Path) -> tuple[dict[str, Sighting], list[str]]:
    """焼き込みから配信IDを集める。返すのは「ID → どこに出ているか」と、見たファイル。"""
    seen: dict[str, Sighting] = {}
    files: list[str] = []
    for p in sorted(d.rglob("*.ts")):
        text = p.read_text(encoding="utf8", errors="replace")
        rel = p.name
        found = False
        for rx in (VIDEO_RE, LOOSE_RE):
            for m in rx.finditer(text):
                vid = next(g for g in m.groups() if g)
                # 名前で分からない書きかたは、**形まで見てから**拾う
                if rx is LOOSE_RE and not looks_like_video(vid):
                    continue
                found = True
                s = seen.setdefault(vid, Sighting())
                s.files.add(rel)
                got = _near_date(text, m.start())
                if got:
                    s.dates.add(got)
        if found:
            files.append(rel)
    return seen, files


def probe_oembed(vid: str, timeout: float = 20.0, tries: int = 3) -> Probe:
    """oembed を当てる。**届かなかったら `BLIND`。`GONE` に畳まない。**

    届かないことを「消えている」と読むと、電波の弱い日に島から配信が
    ごっそり消えることになる（`docs/island-standards.md` §10）。
    """
    last = ""
    for _ in range(tries):
        try:
            req = urllib.request.Request(OEMBED.format(vid), headers={"User-Agent": "island-watch"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status == 200:
                    return Probe(vid, OK, "oembed 200")
                return Probe(vid, OTHER, f"oembed {r.status}")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return Probe(vid, GONE, "oembed 404")
            if e.code == 403:
                return Probe(vid, PRIVATE, "oembed 403")
            if e.code == 401:
                return Probe(vid, LOGIN, "oembed 401")
            if e.code in (429, 500, 502, 503, 504):
                last = f"oembed {e.code}"
                continue  # 混んでいるだけ。もう一度当てる
            return Probe(vid, OTHER, f"oembed {e.code}")
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            last = f"届かない: {type(e).__name__}"
            time.sleep(1.0)  # 立て続けに当て直しても、混んでいるものは混んでいる
    return Probe(vid, BLIND, last or "届かない")


# --- 2段目の読みかた ---------------------------------------------------------
#
# **2段目が言ってよいのは3つだけ。** 「押せる」「録画が無い」「分からない」。
# 1段目（oembed）が 200 と言った配信にしか当てないので、ここで
# 「消えている」「非公開」と言い出したら、それは**1段目と食い違っている**——
# つまり YouTube がこちらを機械と見て、別の答えを返しているということ。
#
# **これで1度、148本を「消えている」と報告しかけた。**
# `youtubei/v1/player` は、締め出しているあいだ生きている配信にも
# `UNPLAYABLE / Video unavailable` を返す。本当に消えた配信の
# `ERROR / Video unavailable` と**文面が同じで、status だけ違う。**
# 文面から先に読んでいたので、4日前の配信まで「消えている」に入った。
# 1段目は同じ配信に 200 を返していた（`docs/island-standards.md` §13）。
#
# 実測（2026-09-17）:
#
# | 何の配信か | status | reason |
# | --- | --- | --- |
# | 生きている | `LOGIN_REQUIRED` | `Sign in to confirm you're not a bot` |
# | 生きているが、締め出されている | **`UNPLAYABLE`** | `Video unavailable` |
# | 録画が無い | `UNPLAYABLE` | `This live stream recording is not available.` |
# | 始まらなかった | `LIVE_STREAM_OFFLINE` | `This live event will begin in a few moments.` |
# | 消えている（1段目で捕まるので、ここには来ない） | `ERROR` | `Video unavailable` |

# 「録画が無い」。**戻らない。** ここだけが、1段目には見えない本物の発見
PLAYER_NO_REC = (
    "live stream recording is not available",
    "ライブ ストリームの記録",
    "live event will begin",  # 予告だけして始まらなかった配信
)

# 「実体を機械に渡さないだけ」＝**押せる。** 配信そのものには文句が無い
PLAYER_PASS = ("not a bot", "ロボットではない")


def is_throttled(status: str, reason: str) -> bool:
    """**締め出されている返り。** 島の不具合ではないので、休んで当て直す。

    `UNPLAYABLE / Video unavailable` は、本当に消えた配信の
    `ERROR / Video unavailable` と**文面が同じ。** status で分ける。
    """
    return status == "UNPLAYABLE" and "ideo unavailable" in reason


def classify_player(status: str, reason: str) -> str:
    """2段目の答え。**`OK` か `NO_REC` か `BLIND` のどれか。**

    「消えている」「非公開」は返さない。**それは1段目の仕事**で、
    ここでそう言い出したら1段目と食い違っている＝こちらが測れていない。
    知らない返りも `BLIND`。**黙って `OK` に畳まない。**
    """
    if not status:
        return BLIND  # 答えは来たが、見かたが分からない
    if status == "OK":
        return OK
    if any(sign in reason for sign in PLAYER_NO_REC):
        return NO_REC
    if status == "LOGIN_REQUIRED" and any(sign in reason for sign in PLAYER_PASS):
        return OK
    return BLIND


# 2段目に叩く口。**watch の頁（1.3MB）ではなく、頁が中で叩いている口**（数KB）。
# 頁を 719回ぶら下げると **429** を食らって箱ごと10分止まるが、こちらは軽い。
# 鍵は要らない（付けても付けなくても同じ答えが返る。**鍵を書かない**）
PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
PLAYER_CLIENT = {
    "clientName": "WEB",
    "clientVersion": "2.20240726.00.00",
    # 断りの文面を英語で受け取る。**日本語で受けると、YouTube の言い回しが
    # 変わるたびに読めなくなる**（英語の文面のほうが長く変わらない）
    "hl": "en",
    "gl": "US",
}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0"


def _text(v) -> str:
    """`reason` は字のときと、`simpleText` / `runs` の入れ物のときがある。"""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        if isinstance(v.get("simpleText"), str):
            return v["simpleText"]
        return "".join(x.get("text", "") for x in v.get("runs", []) if isinstance(x, dict))
    return ""


def _fetch_status(vid: str, timeout: float) -> tuple[str, str]:
    """`playabilityStatus` の status と、断りの文面。読めなければ空。

    **空を `OK` に読み替えない。** 呼ぶ側が `BLIND`（測れなかった）に積む。
    """
    body = json.dumps({"videoId": vid, "context": {"client": PLAYER_CLIENT}}).encode("utf8")
    req = urllib.request.Request(
        PLAYER_URL, data=body,
        headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        got = json.loads(r.read().decode("utf8", "replace"))
    ps = got.get("playabilityStatus")
    if not isinstance(ps, dict):
        return "", ""
    reason = _text(ps.get("reason"))
    if not reason:
        # 理由が本文ではなく、下の画面のほうに入っていることがある
        screen = ps.get("errorScreen") or {}
        for box in screen.values():
            if isinstance(box, dict):
                reason = _text(box.get("reason")) or _text(box.get("subreason"))
                if reason:
                    break
    return str(ps.get("status") or ""), reason


def probe_play(vid: str, timeout: float = 30.0, tries: int = PLAY_TRIES) -> Probe:
    """**押したら見られるか。** oembed が 200 と言ったものだけに当てる。

    **ログインしていない側から見る。** cookie も鍵も渡さない。あやとの手元で
    だけ見えるメンバー限定を「見られる」と数えたら、測っている意味が無い。

    はじめは `yt-dlp` で見ていた。同じ答えは出るが、**この箱では4割が
    「ロボットではないことを確かめさせて」で返り**、719本を当てると途中から
    生きた配信まで8回とも断られ、しまいに **429** で10分止まった。
    watch ページなら1本1回で、しかも**断りの文面そのもの**が読める。
    """
    last = ""
    for i in range(tries):
        _wait_cool()  # 箱ごと締め出されているあいだは、誰も当てに行かない
        time.sleep(PLAY_GAP * random.random() * 2)  # 同時に出発したぶんをばらす
        try:
            status, reason = _fetch_status(vid, timeout)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # **箱ごと締め出された。** 自分だけ下がっても、他の担当が
                # 当て続けたら解けない。全員で休む
                last = "429（箱ごと締め出された）"
                _cool_down()
                continue
            if e.code in (500, 502, 503, 504):
                last = f"player {e.code}"
                time.sleep(min(60.0, PLAY_GAP * 2 ** (i + 2)) * (0.5 + random.random()))
                continue
            return Probe(vid, GONE if e.code == 404 else OTHER, f"player {e.code}")
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            last = f"届かない: {type(e).__name__}"
            time.sleep(min(30.0, PLAY_GAP * 2 ** i))
            continue
        if is_throttled(status, reason):
            # **島の不具合ではない。** 生きている配信にもこれが返る。
            # 429 と同じで箱ごとかかるので、全員で休んでから当て直す
            last = "締め出されている（UNPLAYABLE / Video unavailable）"
            _cool_down()
            continue
        kind = classify_player(status, reason)
        if kind != BLIND:
            return Probe(vid, kind, f"{status} / {reason[:80]}")
        last = f"読めない返り（{status} / {reason[:60]}）"
    return Probe(vid, BLIND, last or "playabilityStatus が読めなかった")


def _tick(label: str, done: int, total: int, quiet: bool) -> None:
    """どこまで進んだかを**標準エラー**へ。2段目は10分かかるので、黙っていると
    「止まったのか、まだ数えているのか」が分からない。**数字は出さない**——
    途中の数を読まれると、測り終える前に結論を書く相手が出る"""
    if quiet or done % 50 or not done:
        return
    print(f"  ...{label} {done}/{total}", file=sys.stderr, flush=True)


def probe_all(vids: list[str], deep: bool, workers: int = 8,
              quiet: bool = True, deep_pick=None) -> dict[str, Probe]:
    """1本ずつ当てる。oembed が 200 のものだけ、2段目へ送る。

    `deep_pick` は「1段目が 200 と言った一覧から、**今夜2段目に当てるぶん**を
    選ぶ」呼び出し先。毎晩回すときは島の名指しぜんぶ（2026-09-19 で 813本）に
    2段目を当てると何十分もかかって YouTube に締め出されるので、増えたぶんだけに絞る
    （選びかたは `python/build_dead_streams.py` が持つ。**ここは選ばない**）。

    渡さなければ今までどおり 200 のものぜんぶに当てる。

    **選んだ結果が、渡した一覧の中に収まっていることを確かめる。**
    選ぶ側が別の id を混ぜたら、1段目を通していないものに2段目を当てることに
    なる（#139 の決めごと7「渡したものと測ったものの数を、道具に言わせる」）。
    """
    got: dict[str, Probe] = {}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for p in ex.map(probe_oembed, vids):
            got[p.vid] = p
            _tick("oembed", len(got), len(vids), quiet)
    if not deep:
        return got
    live = [v for v, p in got.items() if p.kind == OK]
    if deep_pick is not None:
        picked = list(deep_pick(list(live)))
        odd = sorted(set(picked) - set(live))
        if odd:
            raise ValueError(
                f"2段目に、1段目を通っていない配信が混ざっています: {' '.join(odd[:5])}")
        live = [v for v in live if v in set(picked)]
    if live:
        done = 0
        with ThreadPoolExecutor(max_workers=PLAY_WORKERS) as ex:
            for p in ex.map(probe_play, live):
                got[p.vid] = p
                done += 1
                _tick("押せるか", done, len(live), quiet)
    return got


def run_control(deep: bool) -> tuple[bool, list[str]]:
    """**本物を測る前に、両側から当てる。**

    生きた側が1本も通らないなら、それは「島が壊れた」ではなく
    「こちらが測れていない」。数字を出さずに止める。
    """
    lines: list[str] = []
    dead = probe_all(list(DEAD_CONTROL), deep=False)
    caught = [v for v in DEAD_CONTROL if dead[v].kind == GONE]
    lines.append(f"  死んだ側 {len(DEAD_CONTROL)}本中 {len(caught)}本を拾えた")
    live = probe_all(list(LIVE_CONTROL), deep=deep)
    passed = [v for v in LIVE_CONTROL if live[v].kind == OK]
    lines.append(f"  生きた側 {len(LIVE_CONTROL)}本中 {len(passed)}本が「見られる」で通った")
    for v in LIVE_CONTROL:
        if live[v].kind != OK:
            lines.append(f"    {v}: {LABEL.get(live[v].kind, live[v].kind)}（{live[v].why}）")
    ok = len(caught) == len(DEAD_CONTROL) and len(passed) > 0

    # **2段目は、1段目では見えないものを見るためにある。**
    # ここが黙ると「698本ぜんぶ見られます」という、いちばん言ってはいけない嘘になる。
    # 1段目（oembed）が 200 を返す配信で試すので、**2段目が効いていなければ落ちる**
    if deep:
        rec = probe_all(list(PLAY_CONTROL), deep=True)
        got = [v for v in PLAY_CONTROL if rec[v].kind == NO_REC]
        lines.append(f"  押すと見られない側 {len(PLAY_CONTROL)}本中 {len(got)}本を拾えた"
                     "（oembed は 200 を返す配信）")
        for v in PLAY_CONTROL:
            if rec[v].kind != NO_REC:
                lines.append(f"    {v}: {LABEL.get(rec[v].kind, rec[v].kind)}（{rec[v].why}）")
        ok = ok and len(got) == len(PLAY_CONTROL)
    else:
        lines.append("  押すと見られない側: --no-deep なので当てていない")
    return ok, lines


def judge(seen: dict[str, Sighting], probes: dict[str, Probe], files: list[str]) -> Verdict:
    """**口もファイルも持たない。** 仕込んだ値だけで両側から確かめられるように。"""
    v = Verdict(seen=seen, probes=probes, files=files)
    if not seen:
        v.blind.append("配信IDが1本も見つかりません")
        return v
    missing = [x for x in seen if x not in probes]
    if missing:
        v.blind.append(f"当てていない配信が {len(missing)}本あります")
    blind = [x for x, p in probes.items() if p.kind == BLIND]
    if blind:
        v.blind.append(f"測れなかった配信が {len(blind)}本あります（{', '.join(sorted(blind)[:5])}）")
    return v


def _counts(v: Verdict) -> dict[str, int]:
    n: dict[str, int] = {k: 0 for k in LABEL}
    for vid in v.seen:
        p = v.probes.get(vid)
        n[p.kind if p else BLIND] += 1
    return n


def decide(v: Verdict) -> int:
    """終了コード。**口もファイルも持たない**ので、仕込んだ値で確かめられる。

    **見つかったものがあるなら 1。** 測れなかったぶんが混ざっていても、
    見つかった21本は本物で、直す相手がいる。そこを 2 に畳むと
    「数えられなかった」と読まれて、**本物の21本が誰にも届かない。**

    **2 を出すのは「見つからなかった」と言えないとき**——0件のまま
    測れなかったぶんが残っているときだけ（`docs/island-standards.md` §15）。
    """
    if any(p.kind not in (OK, BLIND) for p in v.probes.values()):
        return 1
    return 2 if v.blind else 0


def report(v: Verdict) -> None:
    total = len(v.seen)
    n = _counts(v)
    bad = {vid for vid in v.seen if v.probes.get(vid) and v.probes[vid].kind not in (OK, BLIND)}
    print(f"島が名指ししている配信 {total}本を見ました"
          f"（焼き込み {len(v.files)}本から集めた: {', '.join(v.files)}）")
    print()
    for kind in (OK, PRIVATE, LOGIN, GONE, NO_REC, OTHER, BLIND):
        print(f"  {_pad(LABEL[kind], 44)} {n[kind]:>4}本 / {total}本")
    print()
    print(f"  押しても見られない: {total}本中 {len(bad)}本")
    curable = sum(n[k] for k in CURABLE)
    forever = sum(n[k] for k in FOREVER)
    print(f"    うち あやとが戻せる見込み {curable}本 / 誰にも戻せない {forever}本")
    print()

    if bad:
        print("見られない配信（配信ID / 種類 / 近くにある日付 / 出ている焼き込み）")
        for vid in sorted(bad, key=lambda x: (v.probes[x].kind, x)):
            s = v.seen[vid]
            day = ",".join(sorted(s.dates)) or "-"
            print(f"  {vid}  {_pad(LABEL[v.probes[vid].kind], 44)}"
                  f" {day:<12} {','.join(sorted(s.files))}")
        print()

    print(f"面ごとの内訳（1本が何面にも出るので、足しても {total} にはならない）")
    for rel in v.files:
        here = [x for x, s in v.seen.items() if rel in s.files]
        hurt = [x for x in here if x in bad]
        # **戻るぶんと戻らないぶんを、面ごとにも分ける。**
        # 「この面は5本」だけでは、あやとに頼めば片付くのか、
        # 島が引き受けるしかないのかが決められない
        back = len([x for x in hurt if v.probes[x].kind in CURABLE])
        never = len([x for x in hurt if v.probes[x].kind in FOREVER])
        mark = "★" if rel in FRONT and hurt else " "
        print(f" {mark}{_pad(rel, 18)} {len(here):>4}本中 {len(hurt):>3}本が見られない"
              f"（戻せる {back} / 戻らない {never}）  {PAGES.get(rel, '(面の説明がまだ無い)')}")
    if any(rel in FRONT for rel in v.files):
        print("  ★ = 島がすすんで見せている面。ここの1本は、一覧の1本より重い")


def main() -> int:
    argv = sys.argv[1:]
    d = CONTENT
    deep = "--no-deep" not in argv
    control = "--no-control" not in argv
    if "--dir" in argv:
        at = argv.index("--dir") + 1
        if at >= len(argv):
            print("--dir のあとに置き場を渡してください", file=sys.stderr)
            return 2
        d = Path(argv[at])

    if "--ids" in argv:
        # 対照を手で回すための入口。**本物の面と同じ判定器を通す**
        # （別の判定器で対照を回したら、対照になっていない）。
        # **`-` で始まるものを旗と見なして捨てない。** 配信IDは `-` で始まりうる
        # （`-BsqaHWdUpI` が実際にそれ）。黙って捨てると、**渡した本数より
        # 少ない本数を測って、それを分母として出す**
        rest = argv[argv.index("--ids") + 1:]
        vids = [x for x in rest if ID_RE.fullmatch(x)]
        odd = [x for x in rest if not ID_RE.fullmatch(x)]
        if odd:
            print(f"配信IDの形（11字）でないものが混ざっています: {' '.join(odd)}",
                  file=sys.stderr)
            return 2
        if not vids:
            print("--ids のあとに配信IDを並べてください", file=sys.stderr)
            return 2
        seen = {x: Sighting(files={"--ids"}) for x in vids}
        files = ["--ids"]
    else:
        if not d.is_dir():
            print(f"置き場がありません: {d}", file=sys.stderr)
            return 2
        seen, files = scan_dir(d)
        if not seen:
            print(f"数えるものがありません（{d} の *.ts に配信IDが1本もない）", file=sys.stderr)
            return 2

    if control:
        ok, lines = run_control(deep)
        print("対照（本物を測る前に、両側から当てる）")
        for line in lines:
            print(line)
        print()
        if not ok:
            print("::error::対照が外れました。本物の数字は出しません"
                  "（届いていないのか、見つからなかったのかが分けられない）", file=sys.stderr)
            return 2
    else:
        print("※ --no-control。対照を回していないので、この数字は根拠になりません")
        print()

    probes = probe_all(sorted(seen), deep=deep, quiet=False)
    v = judge(seen, probes, files)
    report(v)
    if not deep:
        print()
        print("※ --no-deep。oembed が 200 と言っただけで、**押して見られるかは見ていない**")
    if v.blind:
        print()
        for line in v.blind:
            print(f"::error::{line}", file=sys.stderr)
    return decide(v)


if __name__ == "__main__":
    sys.exit(main())
