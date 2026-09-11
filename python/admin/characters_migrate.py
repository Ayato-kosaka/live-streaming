"""キャラクターの絵を Google ドライブから Firebase Storage へ移し、
`islandCharacter` に名前と絵文字と呼び名を入れる。(#284 の C 群)

**既定では1バイトも書かない。** 何人ぶん・何枚・合計何バイトかを出すだけ。
書くときは `{"apply": true}`。

## いまの原本は3つに割れている

| 何を持っているか | どこ | 実測 |
| --- | --- | --- |
| 名前 ↔ 絵の ID ↔ 絵文字 | Viewers 表（GAS 越しのスプシ） | 141行 / 絵 133 / 絵文字 136 |
| 背景なしの絵そのもの | ドライブのフォルダ（`site/content/site.ts` の `CHARACTER_DRIVE`） | 101ファイル |
| 背景ありの絵そのもの | ドライブの別フォルダ | 69ファイル |

**3つを結ぶ鍵は絵文字。** 背景なしフォルダのファイル名は97件すべてが
表の `Emoji` と一致した（実測 97/97）。背景ありフォルダも同じ名前の付け方
なので、絵文字で突き合わせる。ファイル名の並びや順番は当てにしない。

## ログインは要らない

フォルダの一覧は `drive.google.com/embeddedfolderview?id=…` がログイン無しで
返す（`drive/folders/…` のほうは「Sign in」を返す）。絵そのものは
`lh3.googleusercontent.com/d/{id}` が同じくログイン無しで返す。
**クローム操作は要らなかった。**

## 大きさは、こちらで焼く

ドライブは `=s96` `=s128` `=s256` `=s512` `=s640` を勝手に作ってくれていた。
**Storage はやってくれない。** ここで焼いておく。

- 表示用は **webp**。実測で 256px が 19.5KB（ドライブの `=s256` は 88.8KB）
- 元のファイルは**そのまま**置く。視聴者さんが持って帰るのはこれ
  （「両方ダウンロードできて欲しい」）。縮めたものを配らない

`=s96` は 128 を、`=s512` は 640 を使う。**引き伸ばさない。**

## 中身を見てから置く

ドライブは権限が無いと HTML を返す。**状態番号（200）では分からない。**
先頭のバイトが PNG / JPEG / WebP のどれかであることを見てから置く。
違ったものは置かずに数える。

## 置き場には、ここから書かない

Actions のサービスアカウントには `storage.objects.create` が無い。
**無いままでよい。** 置き場に書けるのは Functions のサービスアカウントで、
そちらは旅の写真（`islandApi.ts` の `/nordic/photos`）で前から書けている。
ここは口（`POST /characters/{id}`）に頼むだけにする。

はじめは「Actions に権限を付けてもらう」で止めていた（#283）が、
**あれはこちらの設計ミスだった。** 通ることは `characters_probe` を本番で
1回通して確かめてある（権限が無いことを測ったうえで、置いて・読んで・消した）。

## 消した人を、流し直しで生き返らせない

2026-09-11 の朝、あやとが図鑑の画面から**2人を意図して消した**（05:10 に
97人 → 08:37 に 95人。消す口はオーナーだけが叩けて、画面には確認も出る）。
表のほうにはその2行が残っているので、**このまま流し直すと戻ってくる。**

    1WK2dg3Xt5Yvs1VpCjcgZgXVmmB624WTC
    1_SGdtZ-SgCohboJDbSc-X703ZsVSoYGN

いまは表そのものを畳もうとしているところなので墓標は作っていない。
**流し直すときは、この2つを消してから流すこと。**

## 画面から直した行は、流し直しても戻らない

口は書くたびに `editedAt` を押す。あれは**人が画面から直した印**なので、
機械が移しただけの行では消す。消さないと、次に流したとき全員が
「画面から直されている」判定に当たって、**1人も直らなくなる。**

ARGS 例:
  {}                             … 数えるだけ（1バイトも書かない）
  {"limit": 3}                   … 3人ぶんだけ試す
  {"apply": true}                … 口に頼んで Storage と Firestore に書く
  {"apply": true, "only": "🐟"}  … 絵文字で1人だけ
  {"apply": true, "redo": true}  … 済んでいる人もやり直す（ふだんは要らない）
"""

import base64
import hashlib
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

from _fs import args, db, log
from _owner import call, owner_token

# ---- 出どころ ----------------------------------------------------------

#: 背景なしの絵。`site/content/site.ts` の `CHARACTER_DRIVE` と同じフォルダ。
FOLDER_PLAIN = "1S-EFPuayr8p73_Yi6mRf4OkN91qHdzXn"
#: 背景ありの絵。あやとから 2026-09-11 にもらったフォルダ。
FOLDER_SCENE = "1f2y7EmDinA726epfTq_jNX_rbkpKeP-6"

#: 名前と絵文字の表。**URL は公開リポジトリに書かない。**
#: 本番の書き出しに焼かれてはいるが、こちらから足す理由はない。
VIEWERS_URL = os.getenv("EXPO_PUBLIC_GAS_API_URL") or os.getenv("VIEWERS_TABLE_URL")

COLLECTION = "islandCharacter"

#: 表示用に焼く幅。画面が使っているのは 96/128/256/512/640 の5つ。
#: 96 は 128 で、512 は 640 で足りる（引き伸ばさない）。
WIDTHS_PLAIN = (128, 256, 640)
#: 背景ありは図鑑の一覧に小さく出るぶんだけ。主用途は持ち帰り。
WIDTHS_SCENE = (640,)

UA = {"User-Agent": "Mozilla/5.0 (island-character-migrate)"}


# ---- 取ってくる --------------------------------------------------------


def get(url: str, timeout: int = 60) -> bytes:
    """1回だけ取る。落ちたら例外。"""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_retry(url: str, tries: int = 3) -> bytes:
    """1回の失敗で全部やり直さない。

    絵は数十MB落とすので、途中で1枚こけただけで最初からになると辛い。
    表（GAS 越しのスプシ）も同じ扱いにしてある。**あちらは混むと 503 を
    返す**ので、素通しだと入口で落ちる。`HTTPError` は `URLError` の
    仲間なので、下の except で受かる。
    """
    last = None
    for i in range(tries):
        try:
            return get(url)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last  # type: ignore[misc]


def folder(fid: str) -> list:
    """ドライブのフォルダを、ログイン無しで一覧する。

    `embeddedfolderview` は公開フォルダなら合言葉なしで中身を返す
    （`drive/folders/…` は「Sign in」を返すので使えない）。

    Args:
        fid: フォルダの ID

    Returns:
        [{"id": ファイルID, "title": ファイル名}, ...]
    """
    html = get(f"https://drive.google.com/embeddedfolderview?id={fid}#list").decode(
        "utf-8", "replace"
    )
    ents = re.findall(
        r'<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)".*?'
        r'<div class="flip-entry-title">(.*?)</div>',
        html,
        re.S,
    )
    return [{"id": a, "title": b} for a, b in ents]


def viewers() -> list:
    """Viewers 表を読む。**読むだけ。1行も書かない。**"""
    if not VIEWERS_URL:
        log.error(
            "Viewers 表の URL がありません。"
            "EXPO_PUBLIC_GAS_API_URL を環境変数で渡してください"
        )
        sys.exit(1)
    # **1回で諦めない。** スプシは GAS 越しなので、混んでいると 503 を返す。
    # 2026-09-11 の移行が実際にここで落ちた（8分前の下見は通っていたので、
    # 中身の問題ではなく、そのときの混み具合）。絵の取得は前から
    # `get_retry` を通していたのに、**入口のここだけ素通しだった。**
    j = json.loads(get_retry(VIEWERS_URL + "?table=Viewers"))
    if not j.get("ok"):
        log.error("Viewers 表が読めません: %s", j.get("error"))
        sys.exit(1)
    return j.get("data") or []


# ---- 突き合わせ --------------------------------------------------------


def emoji_key(s) -> str:
    """絵文字を突き合わせる形にそろえる。

    異体字セレクタ（U+FE0F）が付いたり付かなかったりするので落とす。
    ここで揃えないと、同じ絵文字が別物として並ぶ。
    """
    return str(s or "").replace("️", "").strip()


def norm(s) -> str:
    """名前を引く形にそろえる。

    **`app/alertbox/matching.utils.ts` の `normalizeName` と同じ決まり。**
    片方だけ変えると、配信中のアラートだけが人違いを始める。
    NFKC で幅と大小を吸収 → 見えない文字を落とす → 空白を1つに → 小文字。
    """
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = re.sub(r"[︎️​-‍﻿⁠᠎­͏؜]", "", s)
    return re.sub(r"\s+", " ", s.strip()).lower()


def keys_of(names) -> list:
    """引くための鍵を作る。**@ なしを自動で足す。**

    保存するときに作って持つ（引くときに作らない）。理由は2つ。

    1. **引くのは配信中のアラートで、1件に1回。** 保存は年に数回。
       手間を安いほうへ寄せる
    2. Firestore は「入っている配列に、この値があるか」しか引けない
       （`array-contains`）。引くときに変形すると、変形した数だけ
       往復が要る。**うちは複合索引を作れない**（#168）ので、
       単一フィールドの1発で当たる形にしておく
    """
    out = []
    for n in names:
        for v in (norm(n), norm(str(n or "").lstrip("@"))):
            if v and v not in out:
                out.append(v)
    return out


def kind_of(buf: bytes):
    """**中身の頭を見て**、何の絵かを決める。名乗りでは決めない。

    ドライブは権限が無いと HTML を返す。状態番号は 200 のままなので、
    そこで見分けようとすると「取れた」と誤診する。
    """
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if buf[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return None


# ---- 焼く --------------------------------------------------------------


def bake(buf: bytes, widths) -> list:
    """表示用の webp を、幅ごとに焼く。**引き伸ばさない。**

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


def put_roles(token: str, cid: str, doc: dict, send: dict) -> dict:
    """1人ぶんを口へ渡す。**役どころは1つずつ送る。**

    ## なぜ置き場へ直に書かないか

    Actions のサービスアカウントには `storage.objects.create` が無い。
    **無いままでよい**（#283 は取り下げた）。置き場に書けるのは Functions の
    サービスアカウントで、そちらは旅の写真（`islandApi.ts` の `/nordic/photos`）
    で前から書けている。こちらは口に頼むだけにする。
    通ることは `characters_probe` で本番で1回確かめてある。

    ## なぜ役どころを1つずつ送るか

    背景ありの元は実測で最大4MB弱ある。base64 にすると5MB を超えるので、
    背景なしと一緒に投げると1回の本体が10MB を回る。口は**送ったぶんだけ**
    差し替えるので、分けて送っても触っていないほうは消えない。

    Args:
        token: オーナーの札（`_owner.owner_token`）
        cid: 書類ID（ドライブの画像ID）
        doc: 名前・絵文字・呼び名
        send: 役どころ -> {"full": base64, "sizes": {幅: base64}}

    Returns:
        口が返した最後の1人ぶん
    """
    roles = [r for r in ("plain", "scene") if r in send]
    if not roles:
        # 絵が1枚も無い人。名前と呼び名だけ入れる
        return call("POST", f"/characters/{cid}", token, doc)
    out = {}
    for r in roles:
        out = call("POST", f"/characters/{cid}", token, {**doc, r: send[r]})
    return out


# ---- 本体 --------------------------------------------------------------


def build(rows: list, plain: dict, scene: dict, log_gaps: bool = True) -> list:
    """表とフォルダ2つを突き合わせて、1人ぶんずつに組み立てる。

    Args:
        rows: Viewers 表の行
        plain: 絵文字 -> 背景なしのファイル（1件）
        scene: 絵文字 -> 背景ありのファイル（1件）
        log_gaps: 欠けているものを数えてログに出すか

    Returns:
        キャラクター1人ぶんの辞書の並び
    """
    groups: dict = {}
    noicon = 0
    for r in rows:
        icon = str(r.get("Icon") or "").strip()
        if not icon:
            noicon += 1
            continue
        g = groups.setdefault(icon, {"icon": icon, "emoji": "", "names": []})
        if r.get("Emoji") and not g["emoji"]:
            g["emoji"] = str(r["Emoji"])
        name = str(r.get("name") or "").strip()
        if name and name not in g["names"]:
            g["names"].append(name)

    out = []
    two_at = 0
    no_at = 0
    for g in groups.values():
        ats = [n for n in g["names"] if n.startswith("@")]
        if len(ats) > 1:
            two_at += 1
        if not ats:
            no_at += 1
        # **チャンネル名は @ で始まる名前。** 無ければ空にしておく。
        # 当てずっぽうで1つ選ぶと、スパチャが別人の絵を出す。
        channel_name = ats[0] if ats else ""
        aliases = [n for n in g["names"] if n != channel_name]
        ek = emoji_key(g["emoji"])
        out.append(
            {
                # **書類IDは、いまのドライブの画像ID。**
                # `site/content/residents.ts` も `characterBox.ts` も
                # `python/residents_map.json` も、もう全部これを鍵にしている。
                # ここで別のIDを振ると、3つとも同じ日に書き換えないと島が壊れる。
                # 意味のある値としては使わない（新しく足す人には無い）。
                "id": g["icon"],
                "channelName": channel_name,
                "emoji": g["emoji"],
                "aliases": aliases,
                "channelKeys": keys_of([channel_name] if channel_name else []),
                "lookupKeys": keys_of(g["names"]),
                "drivePlain": g["icon"],
                "driveScene": (scene.get(ek) or {}).get("id", ""),
            }
        )
    out.sort(key=lambda c: (not c["driveScene"], c["id"]))
    if log_gaps:
        log.info(
            "Viewers 表 %d行 → キャラクター %d人（絵の無い行 %d、"
            "@付きの名前が無い人 %d、@付きが2つある人 %d）",
            len(rows),
            len(out),
            noicon,
            no_at,
            two_at,
        )
        miss_plain = sum(1 for c in out if emoji_key(c["emoji"]) not in plain)
        log.info(
            "背景なしの絵: %d人ぶん / 背景ありの絵: %d人ぶん（背景ありが無い %d人）",
            len(out) - miss_plain,
            sum(1 for c in out if c["driveScene"]),
            sum(1 for c in out if not c["driveScene"]),
        )
    return out


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    only = emoji_key(a.get("only") or "")
    # 済んでいる人もやり直す。**ふだんは要らない**（元が変わっていなければ
    # 同じものが入るだけ）。絵を差し替えたのに反映されないときだけ使う
    redo = bool(a.get("redo"))
    limit = int(a.get("limit") or 0)

    log.info("フォルダを一覧します（ログイン無し）")
    plain = {}
    for e in folder(FOLDER_PLAIN):
        plain.setdefault(emoji_key(re.sub(r"\.[A-Za-z0-9]+$", "", e["title"])), e)
    scene = {}
    for e in folder(FOLDER_SCENE):
        scene.setdefault(emoji_key(re.sub(r"\.[A-Za-z0-9]+$", "", e["title"])), e)
    log.info("背景なし %dファイル / 背景あり %dファイル", len(plain), len(scene))

    chars = build(viewers(), plain, scene)
    if only:
        chars = [c for c in chars if emoji_key(c["emoji"]) == only]
    if limit:
        chars = chars[:limit]

    client = db() if apply else None
    token = None
    if apply:
        # **置き場には、ここから書かない。** 口に頼む（`put_roles` の説明）。
        # 札が取れなければ1件も書かずに止まる。半分だけ移すのがいちばん悪い
        # （絵の入っていない行が97件できると、画面が空の枠を並べる）。
        token = owner_token(client)
        log.info("口に頼む札を取りました")

    n_img = 0
    n_bad = 0
    n_bytes = 0
    n_baked = 0
    n_baked_bytes = 0
    done = 0
    skipped = 0
    for c in chars:
        # **済んだ人は、絵を落とす前に飛ばす。** 落ちたところから続けられる
        # ようにするため。97人ぶんで25分かかり、時間のほとんどはドライブから
        # 落とすところ。1人こけただけで最初からやり直すと、その25分ぶん
        # ドライブと置き場を無駄に叩く（2026-09-11 に65人目で落ちた）。
        #
        # **元が同じかどうかで見る。** ドライブの画像IDが両方とも前と同じ
        # なら、もう一度落として置き直しても同じものになる。
        # `redo` を付けると、済んでいても全部やり直す。
        if apply and not redo:
            was = (client.collection(COLLECTION).document(c["id"]).get().to_dict()
                   or {}).get("migratedFrom") or {}
            same = (
                (was.get("plain") or {}).get("driveId") == (c["drivePlain"] or None)
                and (was.get("scene") or {}).get("driveId") == (c["driveScene"] or None)
            )
            if was and same:
                skipped += 1
                continue

        images = {}
        # 口へ渡すぶん（apply のときだけ溜まる）
        send: dict = {}
        for role, fid, widths in (
            ("plain", c["drivePlain"], WIDTHS_PLAIN),
            ("scene", c["driveScene"], WIDTHS_SCENE),
        ):
            if not fid:
                continue
            try:
                buf = get_retry(f"https://lh3.googleusercontent.com/d/{fid}")
            except Exception as e:  # noqa: BLE001 ここで止めない。何枚落ちたかを数える
                log.warning("%s %s が落とせません: %s", c["emoji"], role, type(e).__name__)
                n_bad += 1
                continue
            kind = kind_of(buf)
            if not kind:
                # ドライブは権限が無いと HTML を返す。状態番号では分からない
                log.warning(
                    "%s %s は画像ではありません（%dバイト、先頭 %r）",
                    c["emoji"],
                    role,
                    len(buf),
                    buf[:8],
                )
                n_bad += 1
                continue
            n_img += 1
            n_bytes += len(buf)
            baked = bake(buf, widths)
            n_baked += len(baked)
            n_baked_bytes += sum(len(b) for _, b in baked)
            digest = hashlib.sha256(buf).hexdigest()[:12]
            rec = {"kind": kind, "bytes": len(buf), "sha": digest, "driveId": fid}
            if apply:
                # 口へ渡す形（`islandCharacter.ts` の `saveRole`）。
                # **置き場の道も URL も、向こうが決める。** こちらで組み立てて
                # Firestore に書くと、置いた実体と食い違ったときに気づけない
                send[role] = {
                    "full": base64.b64encode(buf).decode("ascii"),
                    "sizes": {
                        str(w): base64.b64encode(b).decode("ascii") for w, b in baked
                    },
                }
            rec["sizes"] = {str(w): len(b) for w, b in baked}
            images[role] = rec

        # 空回しのときに何が入るかを読むための形。**書くのはこれではない**
        # （名前も鍵も絵も口が入れる。下の `put_roles`）。
        doc = {
            "channelName": c["channelName"],
            "emoji": c["emoji"],
            "aliases": c["aliases"],
            "channelKeys": c["channelKeys"],
            "lookupKeys": c["lookupKeys"],
            "images": images,
        }
        if apply:
            from google.cloud import firestore

            ref = client.collection(COLLECTION).document(c["id"])
            # **1回だけ引く。** 前は同じ書類を2回引いていた（97人ぶんで194回）
            had = ref.get().to_dict() or {}

            # **画面から直した行を、移行で戻さない。** あやとが旅先で
            # 絵を入れ替えたあとにこれを流し直しても、そこは元に戻らない。
            #
            # **ただし `migratedFrom` が無い行は、人が直したのではない。**
            # 口は書くたびに `editedAt` を押す。役どころを1つずつ送るので、
            # 背景なしが通って背景ありで落ちると、押された印だけが残って
            # 出どころは書かれない。それを人の手だと読むと、**次に流しても
            # 永久に飛ばされる。**
            #
            # 2026-09-11 に実際に起きた。🍑 が背景ありの POST で 500 を受け、
            # 印だけ残って、続きを流したときに「画面から直されている」と
            # 判定されて飛ばされた。97人のうち1人だけ背景ありが欠けていた
            # （表では32人が持っていないはずが、本番では33人だった）。
            if had.get("editedAt") and had.get("migratedFrom"):
                log.info("%s は画面から直されているので飛ばします", c["emoji"])
                continue

            put_roles(
                token,
                c["id"],
                {
                    "channelName": c["channelName"],
                    "emoji": c["emoji"],
                    "aliases": c["aliases"],
                },
                send,
            )

            # 出どころだけ、こちらで足す。**口が持っていない欄**なので、
            # 口に足させるより、移行の側で持つほうが後始末しやすい
            # （突き合わせが終わったら、この3欄ごと消せばいい）。
            #
            # `editedAt` / `editedBy` は口が押していく。あれは**人が画面から
            # 直した印**で、機械が移しただけの行に付いていてはいけない。
            # 付いたままにすると、上の「飛ばす」判定が次から全員に当たって、
            # **流し直しても1人も直らない**状態になる。
            ref.set(
                {
                    "migratedFrom": {
                        r: {
                            "driveId": v["driveId"],
                            "sha": v["sha"],
                            "bytes": v["bytes"],
                        }
                        for r, v in images.items()
                    },
                    "drivePlainId": c["drivePlain"],
                    "driveSceneId": c["driveScene"],
                    "source": "viewers-sheet",
                    "editedAt": firestore.DELETE_FIELD,
                    "editedBy": firestore.DELETE_FIELD,
                },
                merge=True,
            )
        done += 1

    log.info(
        "%s %d人ぶん（済んでいて飛ばした %d人）/ "
        "元の絵 %d枚 %.1fMB / 焼いた webp %d枚 %.1fMB / 画像でなかった %d枚",
        "書きました" if apply else "空回しです（1バイトも書いていません）",
        done,
        skipped,
        n_img,
        n_bytes / 1048576,
        n_baked,
        n_baked_bytes / 1048576,
        n_bad,
    )
    if not apply:
        log.info('書くには {"apply": true} を付けてください')


if __name__ == "__main__":
    main()
