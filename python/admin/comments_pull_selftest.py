"""**コメント欄の持ち帰り（`comments_pull.py`）が、素性を落とし・1本落ちても続き・
429 で撃ち直すか**を、実際に動かして見る。

    python3 python/admin/comments_pull_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**ネットにも yt-dlp にも出ない。** 叩く口（`comments_pull.run_ytdlp`）と、
待つ口（`utils.throttle.sleep`）と、時計（`utils.throttle.clock`）を差し替えて、
本物の `pull_all` を最後まで回す。**待ちは実際に眠らせない。**
何秒待つつもりだったかを数えるだけなので、1回 0.1 秒で終わる。

## なぜ要るか

持ち帰る側は**黙って壊れる。** どれも赤くならない。

- yt-dlp が欄を1つ足した日に、写し取る作りだと**素性がそのまま artifact に乗る**
  （`docs/island-incident-2026-09-14-cards.md` 8-2 と同じ根っこ。チャンネルIDは
  `youtube.com/channel/UC…` を開くだけで本人の顔と名前に直結する）
- 23本目で落ちたときに例外が抜ければ、**22本ぶんの取れたものまで捨てる**
- 粘りを自前の秒数で書き直すと、毎晩の取り込みの上限を直しても**こちらだけ古い**
- ログに本文が1行混ざれば、**公開の Actions ログに視聴者さんの言葉が積まれる**
- 配線は**赤くならずに壊れる。** cron が生えても、`concurrency` の名前が
  ずれても、走ってしまってから分かる。Cookie を2本が書き戻すと
  **どちらが最新か誰も知らなくなり、毎晩の取り込みごと締め出される**

## 見るもの（足は4本）

| | 足 | 見るもの |
| --- | --- | --- |
| 1 | `素性` | 出力にチャンネルIDが1つも無い。欄は選んだものだけ。本文に貼られた `UC…` も伏せる |
| 2 | `落ちても続く` | 真ん中の1本が落ちても、前後は取れて `failed` に1件積まれる |
| 3 | `撃ち直し` | 429 のときだけ撃ち直す。秒数は `utils.throttle` のものを借りている |
| 4 | `ログ` | 本文も表示名も1文字も出ない。「何本目 / 全何本、取れた件数」は出る |
| 5 | `配線` | cron を持たない・毎晩の取り込みと同じ `concurrency`・Cookie を書き戻さない |

## 対照（本物の判定を1つも出す前に、毎回）

**足を1本ずつ抜いて、そのたび対応する足が落ちること**まで見る
（§15「対照は、足の数だけ用意する」）。抜くのは**直す前の姿**で、
どれも「そう書いてしまいがちな実装」そのもの。

| 抜くもの | 何を再現しているか |
| --- | --- |
| `写し`         | yt-dlp が返した欄を丸ごと写す（`author_id` が乗る） |
| `本文そのまま` | 本文に貼られたチャンネルIDを伏せない |
| `止まる`       | 1本落ちたらそこで投げる（後ろを取りに行かない） |
| `撃たない`     | 429 でも1回で諦める（直す前の毎晩の取り込みと同じ姿） |
| `見境`         | 何で落ちても撃ち直す（消えた動画を何度も叩く） |
| `垂れ流し`     | 進み具合に本文と表示名を混ぜる |
| `cron足す`     | 定時実行を付ける（遅れて来る毎晩の取り込みといつ重なるか読めない） |
| `別グループ`   | `concurrency` を別の名前にする（同時に走れてしまう） |
| `書き戻し`     | この口からも Cookie を Secret へ書き戻す（どちらが最新か分からなくなる） |
| `他所でも書き戻し` | 別のワークフローからも書き戻す（持ち回りの責任が散る） |

対照が1つでも外れたら、本物の判定を1つも出さずに **2** で落ちる。
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/admin
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))            # python/

import yaml  # noqa: E402

import comments_pull as cp  # noqa: E402
from utils import throttle  # noqa: E402


# ============================================================================
# 仕込み
# ============================================================================

# **本物の yt-dlp が返す形をまねる。** ここに素性の欄をわざと全部入れておく
# （`author_id` が持ち帰られていないことを、入っている状態から確かめる）。
SEED_CHANNEL_ID = "UCabcdefghijklmnopqrstuv"      # UC ＋ 22文字（本物と同じ形）
SEED_OTHER_ID = "UCzyxwvutsrqponmlkjihgfe"       # 本文に貼られたほう
SEED_AUTHOR = "まつりさん"
SEED_TEXT = "ここだけの本文。到着日はほんとうに泣きそうだった"

RAW_COMMENTS = [
    {
        "id": "Ugx0000000000000000aaaa",
        "parent": "root",
        "text": SEED_TEXT,
        "like_count": 12,
        "author": SEED_AUTHOR,
        "author_id": SEED_CHANNEL_ID,
        "author_url": f"https://www.youtube.com/channel/{SEED_CHANNEL_ID}",
        "author_thumbnail": "https://yt3.ggpht.com/ytc/xxxx=s48",
        "author_is_uploader": False,
        "timestamp": 1757000000,
        "_time_text": "1 週間前",
    },
    {
        "id": "Ugx0000000000000000aaaa.bbbb",
        "parent": "Ugx0000000000000000aaaa",
        "text": f"この人 youtube.com/channel/{SEED_OTHER_ID} だよ",
        "like_count": 0,
        "author": "あやと",
        "author_id": "UC1111111111111111111111",
        "author_url": "https://www.youtube.com/channel/UC1111111111111111111111",
        "timestamp": 1757003600,
        "_time_text": "1 週間前",
    },
]

# 見出しの側にも素性が入っている
RAW_INFO = {
    "id": "（下で入れ替える）",
    "title": "北欧旅 1日目",
    "upload_date": "20260911",
    "channel_id": "UC2222222222222222222222",
    "uploader_id": "@ayato",
    "uploader_url": "https://www.youtube.com/@ayato",
    "comments": RAW_COMMENTS,
}

ERR_429 = ("yt-dlp 終了コード 1\n"
           "ERROR: Unable to download video comments: HTTP Error 429: Too Many Requests")
ERR_GONE = "yt-dlp 終了コード 1\nERROR: [youtube] xxx: Video unavailable"

# 持ち帰ってよい欄。**ここを増やすときは、増やしてよい理由を考えるところ**
WANT_KEYS = {"videoId", "author", "text", "likeCount",
             "publishedAt", "publishedAtText", "isReply"}

CHANNEL_ID_RE = re.compile(r"UC[0-9A-Za-z_-]{22}")

LEGS = ("素性", "落ちても続く", "撃ち直し", "ログ", "配線")

# 配線を見る先
REPO = HERE.parent.parent                       # リポジトリの直下
WF_DIR = REPO / ".github" / "workflows"
NEW_WF = "yt_comments_pull.yml"                 # この道具が守るワークフロー
NIGHTLY_WF = "schedule_fetch_chat.yml"          # 毎晩の取り込み（Cookie を書き戻す1本）

# 書き戻しの口。**リポジトリ全体でここを呼んでよいのは毎晩の取り込みだけ**
UPDATE_ACTION = "cookies/update"

# 定時実行は既定の枝で走るので、あちらの `${{ github.ref }}` はこう評価される
REF_ON_SCHEDULE = "refs/heads/master"

FAILED: list[str] = []
CHECKS = 0


def say(name: str, ok: bool, saw) -> None:
    global CHECKS
    CHECKS += 1
    print(f"  {'OK  ' if ok else 'NG  '} {name}（{saw}）")
    if not ok:
        FAILED.append(name)


def die(why: str) -> None:
    """**数えるものが無い。** 判定を1つも出さずに 2。"""
    print(f"✕ 数えるものがありません: {why}")
    raise SystemExit(2)


# ============================================================================
# 直す前の姿（対照で差し込むもの）
# ============================================================================

def naive_pull_once(video_id, workdir, max_comments, max_replies, cookies, budget):
    """`撃たない`。429 でも1回で諦める——直す前の毎晩の取り込みと同じ姿。"""
    ok, err = cp.run_ytdlp(video_id, workdir, max_comments, max_replies, cookies)
    return ok, err, []


def naive_pull_all_stop(video_ids, workdir, max_comments, max_replies,
                        cookies="", budget=None, log=print):
    """`止まる`。1本落ちたらそこで投げる（後ろを取りに行かない）。"""
    budget = budget or throttle.RetryBudget()
    videos, comments = [], []
    total = len(video_ids)
    for i, vid in enumerate(video_ids, 1):
        ok, err, _ = cp.pull_with_backoff(
            vid, workdir, max_comments, max_replies, cookies, budget)
        if not ok:
            raise RuntimeError(err or "失敗")
        head, records = cp.read_info(vid, cp.info_json_path(vid, workdir))
        videos.append(head)
        comments += records
        log(f"[{i}/{total}] {vid}: {len(records)}件")
    return {"generatedAt": "", "maxCommentsPerVideo": max_comments,
            "maxRepliesPerThread": max_replies, "videoCount": len(videos),
            "commentCount": len(comments), "videos": videos,
            "comments": comments, "failed": []}


def naive_pull_all_loud(video_ids, workdir, max_comments, max_replies,
                        cookies="", budget=None, log=print):
    """`垂れ流し`。進み具合に本文と表示名を混ぜる。"""
    out = _REAL["pull_all"](video_ids, workdir, max_comments, max_replies,
                            cookies=cookies, budget=budget, log=log)
    for c in out["comments"]:
        log(f"  {c['author']}: {c['text']}")
    return out


def workflow_texts(brk: str = "") -> dict:
    """ワークフローの字を読む。対照のときは**そこに手を入れた写し**を返す。

    ファイルそのものは1文字も書き換えない（書き換える対照は、落ちた回に
    リポジトリを壊したまま残る）。
    """
    # **`.yaml` も拾う。** いまは1本も無いが、拡張子違いで置かれた日に
    # 「書き戻しているのは毎晩の取り込みだけ」が黙って通ってしまう
    texts = {p.name: p.read_text(encoding="utf-8")
             for p in sorted(WF_DIR.glob("*.y*ml"))}
    if brk == "cron足す":
        texts[NEW_WF] = texts[NEW_WF].replace(
            "on:\n  workflow_dispatch:",
            "on:\n  schedule:\n    - cron: \"0 20 * * *\"\n  workflow_dispatch:")
    if brk == "別グループ":
        texts[NEW_WF] = texts[NEW_WF].replace(
            "group: fetch-chat-", "group: yt-comments-")
    if brk == "書き戻し":
        texts[NEW_WF] += ("\n      - uses: AnimMouse/setup-yt-dlp/"
                          "cookies/update@v3\n")
    if brk == "他所でも書き戻し":
        other = next(n for n in texts if n not in (NEW_WF, NIGHTLY_WF))
        texts[other] += ("\n      - uses: AnimMouse/setup-yt-dlp/"
                         "cookies/update@v3\n")
    return texts


def group_of(text: str) -> str:
    """`concurrency` のグループを、**評価したあとの字**で取り出す。

    `fetch-chat-${{ github.ref }}` と `fetch-chat-refs/heads/master` を
    別物として数えると、**同じグループなのに「ずれている」と言う。**
    定時実行は既定の枝でしか走らないので、そこだけ埋めて比べる。
    """
    try:
        doc = yaml.safe_load(text) or {}
    except yaml.YAMLError as e:
        return f"（読めない: {type(e).__name__}）"
    group = ((doc.get("concurrency") or {}) or {}).get("group") or ""
    return group.replace("${{ github.ref }}", REF_ON_SCHEDULE)


def uses_of(text: str) -> list:
    """そのワークフローが呼んでいる action を全部並べる。

    **字で探さない。** この頭にも `cookies/update@v3` と書いてあるとおり、
    **説明に出てくる名前を「呼んでいる」と読むと、書いていないものが
    書いてあることになる**（`python/watch_census_selftest.py` が
    `run:` で同じ穴を踏んでいる）。YAML として読んで `uses:` の位置だけ見る。
    読めない字は**呼んでいる側に倒す**——読めないものを「呼んでいない」に
    するほうが危ない。
    """
    try:
        doc = yaml.safe_load(text) or {}
    except yaml.YAMLError:
        return ["（読めない）"]

    found: list[str] = []

    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get("uses"), str):
                found.append(node["uses"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc)
    return found


def triggers_of(text: str) -> list:
    """`on:` に並んでいるもの。**`on` は YAML が True に読む**ので、そこも見る。"""
    try:
        doc = yaml.safe_load(text) or {}
    except yaml.YAMLError as e:
        return [f"（読めない: {type(e).__name__}）"]
    on = doc.get("on", doc.get(True)) or {}
    return sorted(on) if isinstance(on, dict) else [str(on)]


def passthru(video_id, raw):
    """`写し`。yt-dlp が返した欄を丸ごと写す。"""
    out = dict(raw)
    out["videoId"] = video_id
    return out


_REAL = {}


# ============================================================================
# 測り
# ============================================================================

class Run:
    """1回ぶんの測り。"""

    def __init__(self) -> None:
        self.attempts: dict[str, int] = {}   # videoId ごとに何回叩いたか
        self.waits: list[float] = []         # 何秒待つつもりだったか
        self.lines: list[str] = []           # ログの行
        self.payload: dict = {}
        self.raised = ""                     # 途中で例外が抜けたら、その字


def measure(script: dict, brk: str = "", waits=None) -> Run:
    """偽の yt-dlp と偽の時計で、本物の `pull_all` を回す。

    Args:
        script: videoId ごとの `[(成功, メッセージ), …]`。足りなければ最後を繰り返す
        brk: 足を1本抜く（対照）
        waits: 財布の待ち時間を差し替える（秒数を財布から取っているかを見る）
    """
    rec = Run()
    now = [0.0]

    saved = {n: getattr(cp, n) for n in
             ("run_ytdlp", "pull_all", "pull_with_backoff", "to_record", "scrub")}
    saved_sleep, saved_clock = throttle.sleep, throttle.clock
    saved_rl = throttle.is_rate_limited

    def fake_run(video_id, workdir, max_comments, max_replies, cookies=""):
        n = rec.attempts.get(video_id, 0) + 1
        rec.attempts[video_id] = n
        now[0] += 5.4                       # 本番で 429 が返るまでの実測（2026-09-20）
        steps = script.get(video_id) or [(True, None)]
        ok, err = steps[min(n - 1, len(steps) - 1)]
        if ok:
            info = dict(RAW_INFO, id=video_id)
            path = cp.info_json_path(video_id, Path(workdir))
            path.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        return ok, err

    try:
        cp.run_ytdlp = fake_run
        throttle.sleep = lambda s: (rec.waits.append(s), now.__setitem__(0, now[0] + s))
        throttle.clock = lambda: now[0]

        if brk == "写し":
            cp.to_record = passthru
        if brk == "本文そのまま":
            cp.scrub = lambda t: t if isinstance(t, str) else ""
        if brk == "止まる":
            cp.pull_all = naive_pull_all_stop
        if brk == "垂れ流し":
            cp.pull_all = naive_pull_all_loud
        if brk == "撃たない":
            cp.pull_with_backoff = naive_pull_once
        if brk == "見境":
            throttle.is_rate_limited = lambda msg: True

        with tempfile.TemporaryDirectory() as tmp:
            try:
                # **財布は外から渡す。** `RetryBudget` は待ち時間を
                # 引数の既定値で受け取る（＝定義した時点で束ねられる）ので、
                # `throttle.RETRY_WAITS_SECONDS` を差し替えても新しい財布には
                # 届かない。秒数の出どころを試すときは財布ごと入れ替える
                kw = {"waits": waits} if waits is not None else {}
                rec.payload = cp.pull_all(
                    list(script), Path(tmp), 500, 10,
                    cookies="", budget=throttle.RetryBudget(**kw),
                    log=rec.lines.append)
            except Exception as e:
                # **例外が抜けたことも測りの1つ。** 抜けた回を「落ちた」と
                # 同じ顔にすると、`止まる` の対照が読めない
                rec.raised = f"{type(e).__name__}: {e}"[:80]
    finally:
        for n, v in saved.items():
            setattr(cp, n, v)
        throttle.sleep, throttle.clock = saved_sleep, saved_clock
        throttle.is_rate_limited = saved_rl

    return rec


# ============================================================================
# 足（本物の判定も、対照も、ここを通る）
# ============================================================================

def leg_identity(brk: str = "") -> list[tuple[str, bool, str]]:
    """1. 出力に素性が残らない。"""
    r = measure({"aaaaaaaaaaa": [(True, None)], "bbbbbbbbbbb": [(True, None)]}, brk=brk)
    dumped = json.dumps(r.payload, ensure_ascii=False)
    hits = CHANNEL_ID_RE.findall(dumped)
    recs = r.payload.get("comments") or []
    keys = set().union(*[set(c) for c in recs]) if recs else set()
    return [
        ("チャンネルIDが1つも無い", not hits,
         f"{len(hits)}件（{sorted(set(hits))[:2]}）"),
        ("素性の欄が1つも無い",
         not any(k in dumped for k in
                 ("author_id", "author_url", "author_thumbnail",
                  "channel_id", "uploader_id", "uploader_url")),
         "author_id / author_url / channel_id ほかを探した"),
        ("持ち帰る欄は選んだものだけ", keys == WANT_KEYS,
         f"{sorted(keys)}"),
        ("本文に貼られたIDは伏せた跡が残る",
         cp.CHANNEL_ID_MASK in dumped, f"「{cp.CHANNEL_ID_MASK}」を探した"),
        ("数えた", len(recs) == 4, f"コメント {len(recs)}件（2本 × 2件）"),
    ]


def leg_resume(brk: str = "") -> list[tuple[str, bool, str]]:
    """2. 真ん中の1本が落ちても、前後は取れる。"""
    r = measure({
        "aaaaaaaaaaa": [(True, None)],
        "xxxxxxxxxxx": [(False, ERR_GONE)],
        "ccccccccccc": [(True, None)],
    }, brk=brk)
    p = r.payload
    got = [v["videoId"] for v in (p.get("videos") or [])]
    bad = [f["videoId"] for f in (p.get("failed") or [])]
    return [
        ("途中で投げない", not r.raised, r.raised or "抜けた例外なし"),
        ("前後の2本が取れた", got == ["aaaaaaaaaaa", "ccccccccccc"], f"{got}"),
        ("落ちた1本が並ぶ", bad == ["xxxxxxxxxxx"], f"{bad}"),
        ("落ちた理由が残る",
         bool((p.get("failed") or [{}])[0].get("reason")),
         (p.get("failed") or [{}])[0].get("reason", "")[:40]),
    ]


def leg_retry(brk: str = "") -> list[tuple[str, bool, str]]:
    """3. 429 のときだけ、`utils.throttle` の秒数で撃ち直す。"""
    want = list(throttle.RETRY_WAITS_SECONDS)
    hot = measure({"aaaaaaaaaaa": [(False, ERR_429), (False, ERR_429), (True, None)]},
                  brk=brk)
    gone = measure({"xxxxxxxxxxx": [(False, ERR_GONE)]}, brk=brk)
    # **秒数を借りているか**は、借り元を差し替えて確かめる。
    # 自前の数字を書いていたら、ここが動かない
    lent = measure({"aaaaaaaaaaa": [(False, ERR_429), (True, None)]},
                   brk=brk, waits=(7, 11, 13))
    return [
        ("429 で撃ち直す", hot.attempts.get("aaaaaaaaaaa") == 3,
         f"{hot.attempts.get('aaaaaaaaaaa')} 回叩いた"),
        ("待ち時間は決めどおり", hot.waits == want[:2], f"{hot.waits} 秒（決め: {want[:2]}）"),
        ("429 以外は1回で諦める", gone.attempts.get("xxxxxxxxxxx") == 1,
         f"{gone.attempts.get('xxxxxxxxxxx')} 回叩いた"),
        ("秒数は throttle の財布から出ている", lent.waits == [7],
         f"財布を 7 秒にしたら {lent.waits} 秒待った"),
        ("撃ち直したら通る", bool(hot.payload.get("videos")),
         f"{len(hot.payload.get('videos') or [])}本ぶん取れた"),
    ]


def leg_log(brk: str = "") -> list[tuple[str, bool, str]]:
    """4. ログに本文も表示名も出ない。分母は出る。"""
    r = measure({"aaaaaaaaaaa": [(True, None)], "bbbbbbbbbbb": [(True, None)]}, brk=brk)
    joined = "\n".join(r.lines)
    return [
        ("本文が出ない", SEED_TEXT not in joined, f"ログ {len(r.lines)}行"),
        ("表示名が出ない", SEED_AUTHOR not in joined, f"ログ {len(r.lines)}行"),
        ("チャンネルIDが出ない", not CHANNEL_ID_RE.search(joined), "ログを探した"),
        ("何本目 / 全何本 が出る", "[1/2]" in joined and "[2/2]" in joined,
         joined.splitlines()[0][:40] if r.lines else "（1行も出ていない）"),
        ("取れた件数が出る", "2件" in joined, "件数の字を探した"),
    ]


def leg_wiring(brk: str = "") -> list[tuple[str, bool, str]]:
    """5. Cookie を巻き込まない配線になっているか。"""
    texts = workflow_texts(brk)
    new = texts.get(NEW_WF, "")
    nightly = texts.get(NIGHTLY_WF, "")
    if not new or not nightly:
        die(f"{NEW_WF} か {NIGHTLY_WF} が見つからない")

    trig = triggers_of(new)
    mine, theirs = group_of(new), group_of(nightly)
    writers = sorted(n for n, t in texts.items()
                     if any(UPDATE_ACTION in u for u in uses_of(t)))
    runs = [n for n, t in texts.items() if "python/admin/comments_pull.py" in t]
    watches = [n for n, t in texts.items() if "comments_pull_selftest.py" in t]

    return [
        ("押したときだけ走る", trig == ["workflow_dispatch"], f"{trig}"),
        ("毎晩の取り込みと同じグループ", bool(mine) and mine == theirs,
         f"こちら {mine!r} / あちら {theirs!r}"),
        ("Cookie を書き戻さない",
         not any(UPDATE_ACTION in u for u in uses_of(new)),
         f"呼んでいる action {len(uses_of(new))}本を見た"),
        ("書き戻すのは毎晩の取り込みだけ", writers == [NIGHTLY_WF],
         f"{writers}（全 {len(texts)}本を見た）"),
        ("走る道がある", runs == [NEW_WF], f"{runs}"),
        ("見張りも同じ job で走る", watches == [NEW_WF], f"{watches}"),
    ]


ALL_LEGS = {
    "素性": leg_identity,
    "落ちても続く": leg_resume,
    "撃ち直し": leg_retry,
    "ログ": leg_log,
    "配線": leg_wiring,
}

DRILLS = {
    "写し": "素性",
    "本文そのまま": "素性",
    "止まる": "落ちても続く",
    "撃たない": "撃ち直し",
    "見境": "撃ち直し",
    "垂れ流し": "ログ",
    "cron足す": "配線",
    "別グループ": "配線",
    "書き戻し": "配線",
    "他所でも書き戻し": "配線",
}


# ============================================================================
# 対照 → 本物
# ============================================================================

def drill() -> bool:
    """**本物の判定を1つも出す前に**、足を1本ずつ抜いて対照が落ちることを見る。"""
    print("■ 対照（足を1本ずつ抜く）")
    ok = True

    # まず、**壊していない写しが通ること**（`island-misses.md` #99）。
    # 写しを作る途中で壊れても終了コードは同じなので、ここを見ないと対照にならない
    for name, fn in ALL_LEGS.items():
        if not all(o for _, o, _ in fn("")):
            print(f"  ✕ 壊していないのに「{name}」が落ちる")
            ok = False

    for brk, leg in DRILLS.items():
        fell = [n for n, o, _ in ALL_LEGS[leg](brk) if not o]
        if fell:
            print(f"  ○ 「{brk}」を抜くと「{leg}」が落ちる（{len(fell)}件）")
        else:
            print(f"  ✕ 「{brk}」を抜いても「{leg}」が落ちない")
            ok = False
    return ok


def main() -> int:
    _REAL["pull_all"] = cp.pull_all

    if set(ALL_LEGS) != set(LEGS) or set(DRILLS.values()) != set(LEGS):
        die("足の表と対照の表が食い違っている")
    if not throttle.RETRY_WAITS_SECONDS:
        die("撃ち直しの待ち時間が1つも決まっていない")
    if len(cp.DEFAULT_VIDEOS) != len(set(cp.DEFAULT_VIDEOS)):
        die("取りに行く videoId に重複がある")

    if not drill():
        print("\n✕ 対照が外れた。**本物の判定は1つも出していない**")
        return 2

    print(f"\n■ 本物（足 {len(LEGS)}本）")
    for name, fn in ALL_LEGS.items():
        print(f"□ {name}")
        for label, ok, saw in fn(""):
            say(label, ok, saw)

    print()
    print(f"見た {CHECKS}件 / 足 {len(LEGS)}本 / 落ちた {len(FAILED)}件")
    print(f"決め: 1本 {cp.MAX_COMMENTS_PER_VIDEO}件まで / "
          f"返信は1スレッド {cp.MAX_REPLIES_PER_THREAD}件まで / "
          f"既定の取り先 {len(cp.DEFAULT_VIDEOS)}本")
    if FAILED:
        for n in FAILED:
            print(f"  ✕ {n}")
        return 1
    print("○ 通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
