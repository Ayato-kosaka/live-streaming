"""YouTube の**コメント欄**を動画ごとに取って、1本の JSON にまとめる。

**この箱からは取れない。Actions で走らせる**（`.github/workflows/yt_comments_pull.yml`）。
Cookie 無しで叩くと `Sign in to confirm you're not a bot` で門前払いになる
（`docs/clip-download.md` の実測。81回すべて同じ文句）。

ライブチャット（`--sub-langs live_chat`）とは**別もの**。あちらは配信中の流れで、
こちらは配信が終わったあとに書き込まれた**あとからの言葉**。
北欧旅のふりかえりで要るのは「その日ごとの心境」なので、後者が材料になる。

## 持ち帰るもの／捨てるもの

**欄を1つずつ選んで詰める。yt-dlp が返したものを丸ごと写さない。**
写す形にすると、あちらが欄を1つ足した日に、こちらは何もしていないのに
**素性がそのまま artifact に乗る。**

| 持ち帰る | 捨てる |
| --- | --- |
| videoId / 投稿者の表示名 / 本文 / いいね数 / 投稿時刻 / 返信かどうか | `author_id`（チャンネルID）・`author_url`・`author_thumbnail`・`channel_id`・`uploader_id` |

**チャンネルIDを落とすのは、あれが `youtube.com/channel/UC…` を開くだけで
本人の顔と名前に直結するから**（`docs/island-incident-2026-09-14-cards.md` 8-2。
公開の口が「誰がどの日に投げ銭したか」を返していた事故と、同じ根っこ）。
本文の中に貼られたチャンネルIDも伏せる——欄を選んで詰めても、
**本文に `UC…` が1つ混ざれば同じ一覧ができてしまう。**

## ログに何も出さない

このリポジトリは公開で、**Actions のログも誰でも読める。**
だからこの道具は、**本文も表示名も1文字も出さない。** 出すのは
「何本目 / 全何本、取れた件数」と、最後に取れなかった videoId の並びだけ。

`python/logsafe.py` のように「公開の場かどうかで分ける」ことはしていない。
ここは手元で回しても本文を出す理由が無いので、**分岐そのものを置かない**
（旗の立て忘れで漏れる形にしない。`docs/island-standards.md` §15）。

## 1本落ちても止まらない

23本を1本ずつ取る。途中で落ちたものは**その場で諦めて次へ進み**、
最後にまとめて並べる。429（混んでいる）のときだけ、待って撃ち直す——
待ちかたは毎晩の取り込みと同じ `python/utils/throttle.py` を借りる。
**同じことを2通りに書かない**（あちらの上限を直したときに、こちらだけ
古い秒数で粘り続けることになる）。

    python3 python/admin/comments_pull.py --out out/comments.json
    python3 python/admin/comments_pull.py --videos W3aJzjav7fk,pHTAZeclZnQ --out /tmp/c.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/admin
sys.path.insert(0, str(HERE.parent))            # python/ の中を import する

# **`from utils.throttle import sleep` で取り込まない。** 見張りが
# `throttle.sleep` を差し替えて「何秒待つつもりだったか」だけを数えるので、
# 名前で取り込むと差し替えが届かない（`python/fetch_chat_data.py` と同じ作り）
from utils import throttle  # noqa: E402


# ============================================================================
# 取る先
# ============================================================================

# ショート4本。北欧旅のふりかえりで、いちばんコメントが付いている側
SHORTS = (
    "W3aJzjav7fk", "pHTAZeclZnQ", "3LFOVakss68", "7kdy1Mwh3ms",
)

# 当時のライブのアーカイブ19本（2026-09-11〜09-20）
ARCHIVES = (
    "kyzCpe5Znyk", "lzJshROVAl4", "tXlQDwZQRBE", "hrXYXcu9IDE", "HCI2IKaVEuQ",
    "sxIz_bKd7SQ", "Mzf_LgF6Cxc", "f3W2JxAHsQs", "ZuzHKyDfocw", "wB9ntPJ5_h8",
    "7puIEFev1a4", "Xvdk_P4gKoU", "k4DxGQlkD6U", "oBN2tNEj3wA", "kunXt2sXnFQ",
    "VwUgzKblYyM", "WuA1ZykNUWk", "d2q2XuA7ss0", "GBYHxJQGlCY",
)

DEFAULT_VIDEOS = SHORTS + ARCHIVES


# ============================================================================
# 上限
# ============================================================================

# **1本あたり 500件まで。**
#
# 上限を置くのは、23本ぜんぶを「全件」で叩くと**何往復になるか事前に読めない**
# から。yt-dlp はコメントを20件ほどずつ繰り返し取りに行くので、500件で25往復、
# 23本で最大575往復。全件だと1本で数千件のものが混ざった瞬間に往復が跳ね、
# 429 を自分で呼び込む（毎晩の取り込みが同じ Cookie で 429 に当たっている。
# `python/utils/throttle.py` の実測）。
#
# 大きさの見当も置いておく: 1件 200バイトとして 500 × 23本 ＝ **約2.3MB**。
# artifact で手元に落とす前提なので、ここが数十MBになると受け取りづらい。
#
# **500件で足りるか**は中身の側から見ても妥当で、要るのは「その日ごとの心境」。
# いちばん付いているショートでも、上位500件まで読めば言われていることは尽きる。
# 足りなければ `--max-comments` で上げられる（決め打ちにしない）。
MAX_COMMENTS_PER_VIDEO = 500

# **1スレッドの返信は10件まで。** 返信は「その日の心境」ではなく
# やりとりになりがちで、長い言い合いを丸ごと持ち帰っても材料にならない。
# ただし**返信そのものは捨てない**——本人（あやと）の返しが混ざるのは
# たいてい最初の数件なので、そこは拾う。
MAX_REPLIES_PER_THREAD = 10

# 1本にかける上限（秒）。500件なら数十秒で終わる。ここまで返らないものは
# 「遅い」ではなく「詰まっている」なので、次へ進んだほうが全体が早く終わる
YTDLP_TIMEOUT_SECONDS = 600

# 本文に貼られたチャンネルID。`UC` ＋ 22文字（YouTube の決め）
CHANNEL_ID_RE = re.compile(r"UC[0-9A-Za-z_-]{22}")

# 伏せたあとに残す字。**消すのではなく、伏せた跡を残す**
# （本文が途中で切れているのか、伏せたのかが読む側で分かるように）
CHANNEL_ID_MASK = "（チャンネルID省略）"


def scrub(text):
    """本文からチャンネルIDを伏せる。

    欄を選んで詰めていても、**本文に `UC…` が1つ混ざれば
    「誰が・いつ・何を書いたか」の一覧が同じようにできてしまう。**
    """
    if not isinstance(text, str):
        return ""
    return CHANNEL_ID_RE.sub(CHANNEL_ID_MASK, text)


# ============================================================================
# yt-dlp を叩く
# ============================================================================

def info_json_path(video_id: str, workdir: Path) -> Path:
    """yt-dlp が書く場所。`-o` に渡す形と1か所で揃える。"""
    return workdir / f"{video_id}.info.json"


def run_ytdlp(video_id: str, workdir: Path, max_comments: int,
              max_replies: int, cookies: str = "") -> tuple[bool, str | None]:
    """コメント欄だけを取りに行く。動画そのものは落とさない。

    **見張りはこの関数を丸ごと差し替える**（`comments_pull.run_ytdlp = …`）。
    ネットに出る口をここ1つに閉じ込めてあるので、差し替えれば
    yt-dlp にもネットにも1バイトも出ない。

    Returns:
        (成功フラグ, エラーメッセージ)。`download_chat_data` と同じ形
    """
    # `--write-comments` はコメントを info.json に積むだけなので、
    # `--write-info-json` が無いと**何も書かれずに終わる**（終了コードは 0）
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--write-comments",
        "--write-info-json",
        "--no-warnings",
        "--no-progress",
        # 返信も含める。並びは `top`（いいねの多い順）——上限を切るので、
        # 切るなら下からにしたい。`new` だと新しいだけの1行が上に来る
        "--extractor-args",
        f"youtube:comment_sort=top;max_comments={max_comments},all,"
        f"{max_comments},{max_replies}",
        "-o", str(workdir / "%(id)s"),
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    if cookies:
        cmd += ["--cookies", cookies]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=YTDLP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return False, f"yt-dlp がタイムアウトした（{YTDLP_TIMEOUT_SECONDS}秒）"
    except OSError as e:
        return False, f"yt-dlp を動かせない: {type(e).__name__}"

    if r.returncode == 0:
        return True, None
    return False, f"yt-dlp 終了コード {r.returncode}\n{(r.stderr or '').strip()}"


def pull_with_backoff(video_id: str, workdir: Path, max_comments: int,
                      max_replies: int, cookies: str, budget) -> tuple[bool, str | None, list]:
    """1本叩く。**「混んでいる」で落ちたときだけ、待って撃ち直す。**

    撃ち直すのは 429 系だけ（`utils.throttle.is_rate_limited`）。
    動画が消えた・Cookie が切れた、は何度叩いても通らないし、
    叩くほど嫌われるので1回で諦める。

    Returns:
        (成功フラグ, エラーメッセージ, 粘りの記録)。記録は
        `[(何回目, 何秒待ったか), …]` で、**ログに1行だけ出すため**に返す
    """
    ok, err = run_ytdlp(video_id, workdir, max_comments, max_replies, cookies)
    if ok or not throttle.is_rate_limited(err):
        return ok, err, []

    started = throttle.clock()
    shots: list[tuple[int, int]] = []

    retry_no = 1
    while not ok and throttle.is_rate_limited(err):
        wait, _why = budget.next_wait(retry_no, throttle.clock() - started)
        if wait is None:
            break
        throttle.sleep(wait)
        shots.append((retry_no + 1, wait))      # 1発目を「1回目」と数える
        ok, err = run_ytdlp(video_id, workdir, max_comments, max_replies, cookies)
        retry_no += 1

    budget.spend(throttle.clock() - started)
    return ok, err, shots


# ============================================================================
# 取れたものを、欄を選んで詰め直す
# ============================================================================

def to_record(video_id: str, raw: dict) -> dict:
    """コメント1件を、持ち帰ってよい欄だけの形にする。

    **`raw` の中身をここから外へ持ち出さない。** 新しい欄が欲しくなったら
    この関数に1つ足す——そうしておけば、素性が乗るかどうかの判断が
    毎回ここ1か所を通る。
    """
    ts = raw.get("timestamp")
    published = None
    if isinstance(ts, (int, float)) and ts > 0:
        published = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()

    return {
        "videoId": video_id,
        # 表示名。**`author_id`（チャンネルID）は入れない**
        "author": scrub(raw.get("author") or ""),
        "text": scrub(raw.get("text") or ""),
        "likeCount": int(raw.get("like_count") or 0),
        # yt-dlp の `timestamp` は「3日前」の表記から起こした概算。
        # 元の表記も残しておく（概算だと分かるように）
        "publishedAt": published,
        "publishedAtText": scrub(raw.get("_time_text") or ""),
        # 返信かどうか。yt-dlp は親コメントに `parent="root"` を入れる
        "isReply": (raw.get("parent") or "root") != "root",
    }


def read_info(video_id: str, path: Path) -> tuple[dict, list[dict]]:
    """yt-dlp が書いた info.json から、欄を選んで取り出す。

    Returns:
        (その動画の見出し, コメントの並び)
    """
    with open(path, encoding="utf-8") as f:
        info = json.load(f)

    comments = info.get("comments") or []
    records = [to_record(video_id, c) for c in comments if isinstance(c, dict)]

    # **見出しも欄を選ぶ。** `channel_id` `uploader_id` `uploader_url` は入れない
    head = {
        "videoId": video_id,
        "title": scrub(info.get("title") or ""),
        "uploadDate": info.get("upload_date") or "",
        "commentCount": len(records),
        "replyCount": sum(1 for r in records if r["isReply"]),
    }
    return head, records


# ============================================================================
# 23本を1本ずつ
# ============================================================================

def pull_all(video_ids, workdir: Path, max_comments: int, max_replies: int,
             cookies: str = "", budget=None, log=print) -> dict:
    """1本ずつ取って、1つの塊にまとめる。**1本落ちても止まらない。**

    落ちたものは `failed` に積んで次へ進む。**途中で例外を投げない**——
    23本目で落ちたときに、22本ぶんの取れたものまで捨てることになる。
    """
    budget = budget or throttle.RetryBudget()
    videos: list[dict] = []
    comments: list[dict] = []
    failed: list[dict] = []

    total = len(video_ids)
    for i, vid in enumerate(video_ids, 1):
        try:
            ok, err, shots = pull_with_backoff(
                vid, workdir, max_comments, max_replies, cookies, budget)
            if shots:
                # **粘ったことは1行だけ出す。** 出さないと、外から
                # 「粘ったのか、一発で通ったのか」が分からない
                seq = " / ".join(f"{n}回目は{w}秒待って" for n, w in shots)
                log(f"  混雑（429）で撃ち直した: {seq}")
            if not ok:
                raise RuntimeError(err or "理由の分からない失敗")

            path = info_json_path(vid, workdir)
            if not path.exists():
                # yt-dlp は終了コード 0 のまま何も書かないことがある
                # （`--write-info-json` を外したときなど）。**0 を「取れた」と読まない**
                raise RuntimeError("info.json が書かれていない")

            head, records = read_info(vid, path)
            videos.append(head)
            comments += records
            log(f"[{i}/{total}] {vid}: {len(records)}件")
        except Exception as e:
            # **理由も1行に丸める。** yt-dlp の stderr をそのまま流すと
            # 長いうえに、貼られた URL がログに出る
            why = str(e).replace("\n", " ")[:200]
            failed.append({"videoId": vid, "reason": scrub(why)})
            log(f"[{i}/{total}] {vid}: 取れなかった")

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "maxCommentsPerVideo": max_comments,
        "maxRepliesPerThread": max_replies,
        "videoCount": len(videos),
        "commentCount": len(comments),
        "videos": videos,
        "comments": comments,
        "failed": failed,
    }


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--videos", default="",
                    help="videoId をカンマ区切りで（既定は北欧旅の23本）")
    ap.add_argument("--out", default="out/comments.json", help="書き出す先")
    ap.add_argument("--max-comments", type=int, default=MAX_COMMENTS_PER_VIDEO,
                    help=f"1本あたりの上限（既定 {MAX_COMMENTS_PER_VIDEO}）")
    ap.add_argument("--max-replies", type=int, default=MAX_REPLIES_PER_THREAD,
                    help=f"1スレッドの返信の上限（既定 {MAX_REPLIES_PER_THREAD}）")
    ap.add_argument("--cookies", default="",
                    help="Cookie のファイル。**中身は1文字も出さない**")
    a = ap.parse_args()

    ids = [v.strip() for v in a.videos.split(",") if v.strip()] or list(DEFAULT_VIDEOS)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"コメント欄を取る: {len(ids)}本 / 1本あたり {a.max_comments}件まで")

    # 作業場は使い捨て。**info.json を持ち帰らない**——あちらには
    # `channel_id` も `uploader_id` も入っているので、artifact に混ぜない
    with tempfile.TemporaryDirectory() as tmp:
        payload = pull_all(ids, Path(tmp), a.max_comments, a.max_replies,
                           cookies=a.cookies)

    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    print(f"書いた: {out}（{payload['videoCount']}本 / {payload['commentCount']}件）")

    if payload["failed"]:
        # **最後にまとめて並べる。** 走っている途中の1行は流れて読めない
        print(f"取れなかった {len(payload['failed'])}本:")
        for f_ in payload["failed"]:
            print(f"  - {f_['videoId']}: {f_['reason']}")
        # 1本も取れていないなら、それは「取れた」ではない
        if not payload["videos"]:
            print("1本も取れていない")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
