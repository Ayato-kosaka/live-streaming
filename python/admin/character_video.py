"""投げ銭のアラートで、絵のかわりに**短い動画**を流す人を決める。

ARGS 例:
  {"alias": "あお"}                                   … 下見。**1バイトも書かない**
  {"alias": "あお", "file": "_incoming/aoi.mp4", "apply": true}
                                                      … 置き場に置いて、入れる
  {"alias": "あお", "url": "https://…", "apply": true} … 置いてある1本を指す
  {"alias": "あお", "url": "", "apply": true}          … 外す（絵に戻る）

## どこに入るか

    islandCharacter/{書類ID}
      videos:
        alert: {url, bytes, seconds, w, h, at}   ← **ここが本体**
      videoUrl: "…"                              ← 旧い欄。**同じ値を入れる**

**役どころ（`alert`）で鍵を切ってある。** あやとの決め（2026-09-15）:

> 今は一人一本で良いです。（略）将来的には一人2本とかになるかも
> しれないので、拡張性は持てるようにしてほしいです。

2本目が要るようになったら、`functions/src/islandCharacter.ts` の
`VIDEO_ROLES` に役どころを1語足すだけで通る。**欄を増やす形にしない。**

**旧い `videoUrl` にも同じ値を入れる。** OBS（`app/alertbox/`）はいま
そちらしか見ていないので、片方だけにすると**その晩の配信でアラートが
絵に戻る。** 画面が `videos` を見るようになったら、こちらを畳む。

## なぜ画面から打てないようにしてあるか

ここに入れた URL は、**そのまま配信に映る。** 画面（`/me` の図鑑）から
打てるようにすると、配信に出るものを外から差し替える口になる。
`donors.ts` が「どちらか分からないまま保存しない」で止めているのと
同じ理由で、**入り口を1つに絞ってある。** 入れるのはあやとか、こちら。

## 置き場には、ここから書かない

Actions のサービスアカウントには `storage.objects.create` が無い（#283）。
置き場に書けるのは Functions のサービスアカウントなので、**口に頼む**
（`POST /characters/{id}` の `videos`。`characters_add.py` と同じ道）。
口は中身の頭を見て、mp4 でないもの・目次が末尾のもの・大きすぎるものを断る。

`url` で渡す道も残してある。すでにどこかに置いてある1本を指すときと、
**外して絵に戻すとき**に使う。島（`public/alert/`）に置いたものは
`/alert/…` で指せる（`npm run build:web` が `public/` を `dist/` に重ねる）。

## 動画の作り方（これを外すと、出るまでに間が空く）

    ffmpeg -i もと.mov -c:v libx264 -profile:v main -pix_fmt yuv420p \\
      -vf "scale=-2:960" -crf 26 -preset slow \\
      -c:a aac -b:a 96k -movflags +faststart できあがり.mp4

**`-movflags +faststart` が要る。** これが無いと目次（`moov`）が末尾に付くので、
**最後まで落とし終わるまで再生が始まらない。** アラートは投げ銭の直後に
出るものなので、そこで数秒待たされると用をなさない。
**口はこれを断る**（下の `probe_mp4` と同じことを口でも見ている）。

## 音は出ない

OBS は `muted` で再生する（`app/alertbox/index.tsx`）。ブラウザが
音付きの自動再生を止めるため。**音の要る演出はここでは作れない。**

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**名前も呼び名も1文字も出さない。** 出すのは書類IDの指紋と、URL と、
当たった人数と、動画の大きさだけ。
"""

import base64
import os
import struct
import sys
from datetime import datetime, timezone

from _fs import args, db, log, need, readonly
from _owner import call, owner_token, reachable

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import norm_key  # noqa: E402

COLLECTION = "islandCharacter"

# `functions/src/islandCharacter.ts` の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500

# URL の長さ。書類に入れるものなので、ほどほどで切る
MAX_URL = 500

#: いまの役どころ。**2本目はここではなく口の `VIDEO_ROLES` に足す**
ROLE = "alert"

#: 口の `MAX_VIDEO_BYTES` と同じ値。**先にこちらで言う**ため
#: （口に投げてから 400 を読むより、手元で理由を出したほうが直しやすい）
MAX_VIDEO_BYTES = 4 * 1024 * 1024

#: 箱を辿る本数の上限。壊れた中身で回り続けないための止まり木
MAX_BOXES = 64


def boxes_of(buf: bytes, start: int, end: int) -> list:
    """mp4 の箱を頭から並べる。**見出しだけ辿る。**

    mp4 は `[大きさ4][名前4][中身]` の箱が並んだだけの形。
    **1MB の動画でも読むのは数十バイトで済む。**

    Args:
        buf: 動画そのもの
        start: どこから
        end: どこまで

    Returns:
        [(名前, 中身の頭, 箱の終わり), ...]。形が壊れていたらそこで打ち切る
    """
    out = []
    at = start
    while at + 8 <= end and len(out) < MAX_BOXES:
        name = buf[at + 4:at + 8].decode("latin1", "replace")
        if not all(0x20 <= ord(c) <= 0x7E for c in name):
            break
        size = struct.unpack(">I", buf[at:at + 4])[0]
        body = at + 8
        if size == 1:
            if at + 16 > end:
                break
            size = struct.unpack(">Q", buf[at + 8:at + 16])[0]
            body = at + 16
        elif size == 0:
            size = end - at  # 「ここから終わりまで」。最後の箱だけが名乗れる
        if size < body - at:
            break
        out.append((name, body, min(end, at + size)))
        at += size
    return out


def probe_mp4(buf: bytes):
    """**投げ銭の直後に出せる mp4 か**を見る。口と同じ決まり。

    Args:
        buf: 動画そのもの

    Returns:
        通れば {"seconds": 秒}、だめなら断る理由の文字列
    """
    top = boxes_of(buf, 0, len(buf))
    names = [n for n, _, _ in top]
    if not names or names[0] != "ftyp":
        return "mp4 ではありません（頭が `ftyp` ではない）"
    if "moov" not in names:
        return "目次（`moov`）がありません"
    if "mdat" in names and names.index("mdat") < names.index("moov"):
        return (
            "**目次（`moov`）が末尾にあります。** これだと最後まで落とし"
            "終わるまで再生が始まりません。`-movflags +faststart` を付けて"
            "焼き直してください"
        )
    seconds = None
    _, body, end = top[names.index("moov")]
    for name, b, e in boxes_of(buf, body, end):
        if name != "mvhd" or b + 4 > e:
            continue
        # 版0 は4バイト、版1 は8バイト（作った時刻・直した時刻・長さ）
        v = buf[b]
        at = b + 4 + (16 if v == 1 else 8)
        if at + (12 if v == 1 else 8) > e:
            continue
        scale = struct.unpack(">I", buf[at:at + 4])[0]
        ticks = (
            struct.unpack(">Q", buf[at + 4:at + 12])[0] if v == 1
            else struct.unpack(">I", buf[at + 4:at + 8])[0]
        )
        if scale:
            seconds = round(ticks / scale, 2)
    return {"seconds": seconds}


def find_one(src, want: str):
    """呼び名から1人だけ引く。**2人に当たったら決めない。**

    Args:
        src: Firestore クライアント（下見のときは書く口を塞いだ写し）
        want: そろえた呼び名

    Returns:
        (書類ID, 中身)
    """
    # **`lookupKeys` で引く。** 口（`GET /characters/lookup`）と同じ欄。
    # ここだけ別の欄で引くと、配信で当たる人と、ここで直す人がずれる
    hit = []
    for d in src.collection(COLLECTION).limit(MAX_CHARACTERS).get():
        v = d.to_dict() or {}
        keys = {k for k in (v.get("lookupKeys") or []) if isinstance(k, str)}
        if want in keys:
            hit.append((d.id, v))

    log.info("当たった人数: %d", len(hit))
    if len(hit) == 0:
        log.error("その呼び名で当たる人がいません。**何も書いていません**")
        raise SystemExit(2)
    if len(hit) > 1:
        # 2人に当たるなら、どちらを直すかはこちらでは決められない。
        # 決めずに書くと、別の人の配信の絵が差し替わる
        log.error("**2人以上に当たりました。決められないので書きません**")
        for i, _ in hit:
            log.error("  当たった: %s", mask(i))
        raise SystemExit(2)
    return hit[0]


def read_file(rel: str) -> bytes:
    """手元の動画を読む。**リポジトリの外は見ない。**

    Args:
        rel: リポジトリの根からの道（`/` 始まりなら、そのまま）

    Returns:
        中身
    """
    root = __file__.rsplit("/", 3)[0]
    path = rel if os.path.isabs(rel) else os.path.join(root, rel)
    if not os.path.isfile(path):
        # `python/admin/` からの道でも受ける（`characters_add` の `dir` と同じ形）
        alt = os.path.join(os.path.dirname(os.path.abspath(__file__)), rel)
        if not os.path.isfile(alt):
            raise SystemExit(f"{rel} が見つかりません")
        path = alt
    with open(path, "rb") as f:
        return f.read()


def main() -> None:
    a = args()
    (alias,) = need(a, "alias")
    want = norm_key(alias)
    src_file = str(a.get("file") or "").strip()
    url = str(a.get("url") or "").strip()[:MAX_URL]
    drop = "url" in a and not url and not src_file
    apply = a.get("apply") is True

    if src_file and url:
        log.error("`file` と `url` は、どちらか一方にしてください")
        raise SystemExit(1)
    if url and not (url.startswith("/") or url.startswith("https://")):
        log.error("url は `/` 始まり（島と同じ出どころ）か https:// にしてください")
        raise SystemExit(1)

    client = db()
    # **下見のあいだは書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる
    src = client if apply else readonly(client)

    doc_id, v = find_one(src, want)
    had = ((v.get("videos") or {}).get(ROLE) or {}) if isinstance(
        v.get("videos"), dict) else {}
    log.info("相手: %s", mask(doc_id))
    log.info(
        "いま入っているもの: videos.%s=%s / videoUrl=%s",
        ROLE,
        had.get("url") or "（無し）",
        v.get("videoUrl") or "（無し。絵が出ている）",
    )

    # ---- 手元の動画を置き場に入れる（口に頼む） ----
    if src_file:
        buf = read_file(src_file)
        probe = probe_mp4(buf)
        if isinstance(probe, str):
            log.error("%s", probe)
            log.error("**何も書いていません**")
            raise SystemExit(1)
        log.info(
            "読みました: %.2fMB / %s秒（目次は先頭にあります）",
            len(buf) / 1048576, probe["seconds"],
        )
        if len(buf) > MAX_VIDEO_BYTES:
            # 口も同じ値で断る。**先にこちらで理由を出す**
            log.error(
                "大きすぎます（上限 %.1fMB）。`-crf` を上げるか短く切ってください",
                MAX_VIDEO_BYTES / 1048576,
            )
            raise SystemExit(1)
        if not apply:
            log.info("---- 下見です。1バイトも書いていません ----")
            log.info('置くには {"apply": true} を付けてください')
            return

        token = owner_token(client)
        out = call(
            "POST", f"/characters/{doc_id}", token,
            # **名前は送らない。** 口は送られてこなかった名前に触らない
            {"videos": {ROLE: {"data": base64.b64encode(buf).decode("ascii")}}},
        )
        ch = out.get("character") or {}
        got = ((ch.get("videos") or {}).get(ROLE) or {}).get("url")
        if not got or ch.get("videoUrl") != got:
            raise SystemExit(
                "口が `videos` と `videoUrl` を揃えて返しませんでした"
            )
        log.info("置きました: %s", got)
        # **状態番号だけで判断しない**（種類とバイト数まで見る）
        code, mime, size = reachable(got)
        log.info("  HTTP %s %s %d バイト", code, mime, size)
        if code != 200 or not mime.startswith("video/") or size != len(buf):
            raise SystemExit("置いたものが動画として返りませんでした")
        log.info("**OBS の名簿は10分ごとに取り直します**ので、"
                 "すぐ見たいならブラウザソースを開き直してください")
        return

    # ---- すでに置いてある1本を指す / 外す ----
    if not url and not drop:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('入れるには {"file": "…mp4", "apply": true} か '
                 '{"url": "…", "apply": true} を付けてください')
        return

    log.info("入れるもの: %s", url or "（空。絵に戻す）")
    if had.get("url") == url and (v.get("videoUrl") or "") == url:
        log.info("同じものが既に入っています。**何も書きません**")
        return
    if not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('書くには {"apply": true} を付けてください')
        return

    from google.cloud import firestore

    now = datetime.now(timezone.utc).isoformat()
    # **動画の欄だけを触る。** 名前も鍵も絵も、1つも書き換えない
    patch = (
        # 大きさや長さは名乗らない。**置き場に置いたときだけ、口が中身から入れる**
        {f"videos.{ROLE}": {"url": url, "at": now}, "videoUrl": url}
        if url else
        {f"videos.{ROLE}": firestore.DELETE_FIELD, "videoUrl": None}
    )
    src.collection(COLLECTION).document(doc_id).update(patch)
    log.info("書きました。**OBS の名簿は10分ごとに取り直します**ので、"
             "すぐ見たいならブラウザソースを開き直してください")
    log.info("元に戻すには、同じ呼び名で url を空にして、もう一度回してください")


if __name__ == "__main__":
    main()
