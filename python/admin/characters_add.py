"""キャラクターを**手元の絵から1人ずつ足す**（#284 の C 群の追加口）。

**これは手元から回す道具。** Actions からは回らない（下の「回しかた」）。

    export BQ_PROJECT_ID=live-streaming-d3cac      # 手元では自分で渡す
    ARGS='{}'               python3 python/admin/characters_add.py  … 下見。**1バイトも書かない**
    ARGS='{"apply":true}'   python3 python/admin/characters_add.py  … 置き場と Firestore に書く
    ARGS='{"dir":"/…/x"}'   … 置き場所を変える（**絶対パスだけ。git の外**）
    ARGS='{"apply":true,"keep":true}'  … 足したあとも手元の絵を残す

## なぜ移行の道具と別に要るか

`characters_migrate` は **Viewers 表とドライブ**が出どころで、そこに無い人は
1人も足せない。表はもう畳む方向だし、今日はじめてコメントした人は
そもそも載っていない。**新しい人を足す道が、画面（`/me` の図鑑）以外に無かった。**

画面は親指1本で足せるのが取り柄だが、**あやとしか開けない。** こちらが
預かった絵を入れるには、口（`POST /characters/{id}`）に頼む道が要る。
それがここ。**やっていることは画面と同じ**（幅を焼いて、役どころごとに送る）。

## 置き場には、ここから書かない

Actions のサービスアカウントには `storage.objects.create` が無い（#283）。
置き場に書けるのは Functions のサービスアカウントなので、口に頼む。
通ることは `characters_probe` が本番で1回通して確かめてある。

## 絵と名前は、**公開リポジトリに1バイトも入れない**（#785）

**このリポジトリは公開。** 誰の絵が誰のものかは、図鑑が公開していない
（`islandCharacter.ts`「名前は、誰にでも見せるものではない」）。

前の手順は「流すときだけ枝に載せて、流し終えたら枝を落とす」だった。
**落とせなかった。** このセッションの GitHub プロキシは
`git push --delete` も `DELETE /git/refs/*` も 403 で断る。結果、絵2枚と
ハンドル入りの manifest を載せた commit が公開のリポジトリに残り、
その SHA が公開の実行ページに出た（#785）。

**落とせない前提で組み直した。絵はリポジトリに入れない。**
入れる代わりに、**札のほうを Actions から手元へ持ってくる**（`_handoff.py`）。

    手元: 使い捨ての鍵を作り、公開鍵だけを入力に載せて `owner_handoff` を押す
    実行: 札を2枚作り、公開鍵で封をして注記に出す
    手元: ほどく → **その実行を消す** → 絵は手元から島の口へ直に送る

公開の場に出るのは**公開鍵と暗号文だけ**。絵もハンドルもチャンネルIDも、
入力にもログにも注記にも1文字も出ない。

### 置き場は、リポジトリの外（既定 `~/island-char-intake`）

    <dir>/manifest.json   [{channelName, emoji, aliases, channelId,
                            plain: "…png", scene: "…png"}, …]
    <dir>/*.png           絵そのもの

**git の中にある置き場は、引数で渡しても断る**（`check_outside_git`）。
手引きに「置かないこと」と書くだけでは、置ける道が在るかぎりいつか置かれる。
**通らないようにしてある。**

**流し終えたら、手元の絵も消す**（`{"keep": true}` で残せる）。
預かったものを置きっぱなしにしない。

**ログにも名前を出さない。** 出すのは絵文字と書類IDと、置けたバイト数。
絵文字と書類IDは図鑑が誰にでも返している値なので、出してよい。

## 回しかた

- **下見（`apply` なし）は札が要らない。** 読むのは公開の口2つ
  （`GET /characters` と `GET /characters/lookup`）だけなので、手元だけで通る
- **書くとき（`apply`）だけ** `_handoff.fetch()` が Actions を1回押して、
  札をほどいて、その実行を消す

## 足すだけ。上書きしない

同じチャンネル名で誰かが既に入っていたら、**その人には触らずに止める。**
書類IDは口と同じ形（`[A-Za-z0-9_-]{33}`）の乱数を振る。ドライブの画像ID
とぶつからないよう、振る前に空いていることを見る。

## 途中で落ちたら、置いたものを消す

役どころは1つずつ送るので、背景なしが通って背景ありで落ちると
**絵が半分だけの人**が本番に残る（2026-09-11 に 🍑 で実際に起きた）。
この道具は、その場で `DELETE /characters/{id}` まで戻す。
"""

import base64
import io
import json
import os
import re
import unicodedata
import uuid

import requests

from _fs import args, log
from _handoff import fetch, firestore
from _owner import API_BASE, call, reachable

COLLECTION = "islandCharacter"

#: 既定の置き場。**リポジトリの外**（#785）
DEFAULT_DIR = os.path.join(os.path.expanduser("~"), "island-char-intake")

#: 表示用に焼く幅。`islandCharacter.ts` の `WIDTHS` と同じ並び。
#: **背景ありも3つとも焼く。** 画面（`me/Characters.tsx`）がそうしている
WIDTHS = (128, 256, 640)

ROLES = ("plain", "scene")

#: 見えない文字と異体字セレクタ。名前に紛れ込むと、同じ字なのに当たらない
INVISIBLE = re.compile(
    "[︎️​-‍﻿⁠᠎­͏؜]"
)


def norm(s) -> str:
    """引く形にそろえる。

    **`islandCharacter.ts` の `normKey` と同じ決まり。** ここでは
    「もう入っていないか」を見るためだけに使う（鍵を作るのは口の仕事）。
    """
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = INVISIBLE.sub("", s)
    return re.sub(r"\s+", " ", s.strip()).lower()


def check_outside_git(path: str) -> str:
    """置き場が **git の中でない**ことを見る（#785）。

    手引きに「リポジトリに置かないこと」と書くだけでは、同じことが起きる。
    置けてしまう道が在るかぎり、いつか置かれる。**通らないようにする。**

    Args:
        path: 置き場

    Returns:
        絶対パスに直した置き場

    Raises:
        SystemExit: git の中にある
    """
    p = os.path.realpath(path)
    cur = p
    while True:
        # worktree では `.git` はファイル。`exists` でどちらも見る
        if os.path.exists(os.path.join(cur, ".git")):
            raise SystemExit(
                f"置き場が git の中にあります（{cur}）。"
                "絵とハンドルはリポジトリに入れません（#785）。"
                f"{DEFAULT_DIR} のような、git の外に置いてください"
            )
        nxt = os.path.dirname(cur)
        if nxt == cur:
            return p
        cur = nxt


def wipe(base: str, people: list) -> None:
    """預かったものを手元からも消す。**名前は1つも出さない。**"""
    gone = 0
    for p in people:
        for role in ROLES:
            fn = p.get(role)
            if not fn:
                continue
            try:
                os.remove(os.path.join(base, fn))
                gone += 1
            except FileNotFoundError:
                pass
    os.remove(os.path.join(base, "manifest.json"))
    log.info("手元の置き場を片づけました（絵 %d枚と manifest）", gone)


def bake(buf: bytes, widths=WIDTHS) -> list:
    """表示用の webp を幅ごとに焼く。**引き伸ばさない。**

    Args:
        buf: 元の絵
        widths: 焼く幅

    Returns:
        [(幅, バイト列), ...]。元より大きい幅は入らない
    """
    from PIL import Image

    im = Image.open(io.BytesIO(buf))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    out = []
    for w in widths:
        if w >= im.width:
            continue
        h = max(1, round(im.height * w / im.width))
        b = io.BytesIO()
        im.resize((w, h), Image.LANCZOS).save(b, "WEBP", quality=88, method=6)
        out.append((w, b.getvalue()))
    return out


def kind_of(buf: bytes):
    """**中身の頭で**種類を決める。拡張子では決めない。"""
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if buf[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return None


def new_id(client) -> str:
    """空いている書類ID。**口が振るのと同じ形**（33字）。"""
    for _ in range(20):
        cid = uuid.uuid4().hex + "0"
        if not client.collection(COLLECTION).document(cid).get().exists:
            return cid
    raise SystemExit("書類IDが振れませんでした")


def taken(channel_name: str) -> bool:
    """そのチャンネル名で、もう誰か入っていないか。**上書きしないため。**

    **手元には Firestore の札が無い**（下見は札を取りに行かない）ので、
    口に聞く。`GET /characters/lookup` は配信の画面がスパチャの絵を引くのに
    使っているのと同じ道で、別名（`lookupKeys`）まで見てくれる。

    **落ちたら「空いている」と答えない。** 読めなかっただけの回に人を足すと、
    上書きへ向かって進む（`docs/island-misses.md` の決めごと9）。
    """
    if not norm(channel_name):
        return False
    r = requests.get(
        f"{API_BASE}/characters/lookup",
        params={"channel": channel_name},
        timeout=60,
    )
    r.raise_for_status()
    return bool((r.json() or {}).get("character"))


def total() -> tuple:
    """図鑑の口が返す人数と、書類IDの一覧。

    **前後で数えて、誰も消えていないことを見る。**

    `?cb=` を付けているのは、**手前（CDN）が30分ためこむ**から
    （`islandCharacter.ts` の `s-maxage=1800`）。素で叩くと、足したあとにも
    足す前の返事が返ってきて、「増えていない」と読み違える。

    Returns:
        (人数, 書類IDの集合)
    """
    r = requests.get(
        f"{API_BASE}/characters", params={"cb": uuid.uuid4().hex}, timeout=60
    )
    r.raise_for_status()
    j = r.json()
    return int(j.get("total") or 0), {c.get("id") for c in (j.get("characters") or [])}


def check_images(cid: str, ch: dict, roles) -> bool:
    """置いた絵が**画像として返るか**を、役どころと幅ぜんぶで見る。

    置き場の長い URL（持ち帰り用）と、焼き込みから呼ぶ短い名前
    （`/characters/{id}/{role}-{w}.webp`）の両方を叩く。
    **状態番号だけで判断しない**（種類とバイト数まで見る）。

    Args:
        cid: 書類ID
        ch: 口が返した1人ぶん
        roles: 見る役どころ（送っていないものは見ない）

    Returns:
        ぜんぶ画像として返ったか
    """
    ok = True
    for role in roles:
        pic = ch.get(role) or {}
        urls = [("full", pic.get("full"))]
        urls += [(str(w), (pic.get("sizes") or {}).get(str(w))) for w in WIDTHS]
        for name, url in urls:
            if not url:
                log.error("   %s %s の URL が返っていません", role, name)
                ok = False
                continue
            code, mime, size = reachable(url)
            good = code == 200 and mime.startswith("image/") and size > 0
            log.info(
                "   %s %-4s HTTP %s %s %d バイト %s",
                role, name, code, mime, size, "" if good else "← だめ",
            )
            ok = ok and good
        for w in WIDTHS:
            code, mime, size = reachable(
                f"{API_BASE}/characters/{cid}/{role}-{w}.webp"
            )
            good = code == 200 and mime.startswith("image/") and size > 0
            log.info(
                "   %s 短い名前 %-3d HTTP %s %s %d バイト %s",
                role, w, code, mime, size, "" if good else "← だめ",
            )
            ok = ok and good
    return ok


def main() -> None:
    if os.getenv("GITHUB_ACTIONS"):
        # **Actions からは回さない。** 回すには絵をリポジトリに載せることに
        # なり、それが #785 そのもの
        raise SystemExit(
            "これは手元から回す道具です（絵をリポジトリに載せないため。#785）。"
            "ARGS='{}' python3 python/admin/characters_add.py"
        )
    a = args()
    apply = a.get("apply") is True
    want = a.get("dir") or DEFAULT_DIR
    if not os.path.isabs(want):
        raise SystemExit(f"dir は絶対パスで渡してください（既定は {DEFAULT_DIR}）")
    base = check_outside_git(want)
    if not os.path.isdir(base):
        raise SystemExit(f"{base} がありません。絵と manifest.json を置いてください")
    with open(os.path.join(base, "manifest.json"), encoding="utf-8") as f:
        people = json.load(f)
    if not isinstance(people, list) or not people:
        raise SystemExit("manifest.json は [{…}, …] の形で書いてください")

    before, before_ids = total()
    log.info("いま図鑑に出ているのは %d人", before)

    # 先に全部読んで焼く。**1人でも欠けていたら、1バイトも書かずに止める。**
    plans = []
    for p in people:
        emoji = str(p.get("emoji") or "")
        channel = str(p.get("channelName") or "")
        if not channel or not emoji:
            raise SystemExit("channelName と emoji は要ります")
        if taken(channel):
            # **名前は出さない。** 絵文字だけで、どの行かは分かる
            raise SystemExit(f"{emoji} のチャンネル名は、もう誰かが持っています")
        send = {}
        for role in ROLES:
            fn = p.get(role)
            if not fn:
                continue
            with open(os.path.join(base, fn), "rb") as f:
                buf = f.read()
            kind = kind_of(buf)
            if not kind:
                raise SystemExit(f"{emoji} の {role} が画像ではありません")
            baked = bake(buf)
            log.info(
                "%s %s: 元 %s %.2fMB → webp %s",
                emoji, role, kind, len(buf) / 1048576,
                " ".join(f"{w}px {len(b) // 1024}KB" for w, b in baked),
            )
            send[role] = {
                # **元のファイルはそのまま置く。** 視聴者さんが持って帰るのはこれ
                "full": base64.b64encode(buf).decode("ascii"),
                "sizes": {
                    str(w): base64.b64encode(b).decode("ascii") for w, b in baked
                },
            }
        if not send:
            raise SystemExit(f"{emoji} に絵が1枚もありません")
        plans.append({
            "emoji": emoji,
            "doc": {
                "channelName": channel,
                "emoji": emoji,
                "aliases": [str(x) for x in (p.get("aliases") or [])],
            },
            "channelId": str(p.get("channelId") or ""),
            "send": send,
        })

    if not apply:
        log.info("下見です（1バイトも書いていません）。%d人ぶん読めました", len(plans))
        log.info('書くには {"apply": true} を付けてください')
        return

    # **ここで初めて札を取りに行く。** 取れたら、押した実行はその場で消える
    tok = fetch()
    token = tok["id"]
    client = firestore(tok)

    made = []
    try:
        for p in plans:
            cid = new_id(client)
            made.append(cid)
            log.info("%s を %s として足します", p["emoji"], cid)
            out = {}
            # **役どころは1つずつ。** 一緒に送ると本体が10MBを回る
            for role in ROLES:
                if role not in p["send"]:
                    continue
                out = call(
                    "POST", f"/characters/{cid}", token,
                    {**p["doc"], role: p["send"][role]},
                )
            if p["channelId"]:
                # **口が持っていない欄。** 図鑑は返すのに、入れる道が無い
                # （`islandCharacter.ts` の POST は channelName と aliases しか
                # 見ない）。名寄せの手がかりなので、こちらから足しておく
                client.collection(COLLECTION).document(cid).set(
                    {"channelId": p["channelId"]}, merge=True
                )
            if not check_images(cid, out.get("character") or {}, p["send"]):
                raise SystemExit(f"{p['emoji']} の絵が画像として返りませんでした")

            # **スパチャの引き当て。** ここが通らないと、配信の画面に出ない
            r = requests.get(
                f"{API_BASE}/characters/lookup",
                params={"channel": p["doc"]["channelName"]},
                timeout=60,
            )
            hit = (r.json() or {}).get("character") or {}
            if hit.get("id") != cid:
                raise SystemExit(f"{p['emoji']} が引けませんでした")
            log.info("   引き当て: 通りました")
    except BaseException:
        # **半分だけ残さない。** 置いた絵ごと戻す
        log.error("落ちたので、置いたものを消します（%d人ぶん）", len(made))
        for cid in made:
            try:
                call("DELETE", f"/characters/{cid}", token)
            except BaseException as e:  # noqa: BLE001
                log.error("   %s が消せません: %s", cid, type(e).__name__)
        raise

    after, after_ids = total()
    log.info("図鑑: %d人 → %d人（足したのは %d人）", before, after, len(made))
    # **足した人数だけ増えて、前からいた人が1人も欠けていないこと。**
    # 人数だけ見ると、1人消えて2人増えたときに気づけない
    lost = before_ids - after_ids
    if after != before + len(made) or lost:
        raise SystemExit(f"人数が合いません（欠けた書類 {len(lost)}件）")
    log.info("足した書類ID: %s", " ".join(made))
    # **預かったものを置きっぱなしにしない。** 絵はもう島の置き場にある
    if a.get("keep") is True:
        log.info("手元の置き場はそのままにします（keep）")
    else:
        wipe(base, people)


if __name__ == "__main__":
    main()
