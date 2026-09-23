"""図鑑の1人に、**名乗り（`@…`）を手で入れる。**

ARGS 例:
  {"emoji":"🇬🇧","doc":"<書類ID>","handle":"@example"}
      … 下見。**1バイトも書かない**
  {"emoji":"🇬🇧","doc":"<書類ID>","handle":"@example","apply":true}
      … 入れる

## なぜ要るのか

#553 で、図鑑の18人が名乗りを持っていなかった。あやとが4人ぶんの名乗りを
issue に書いてくれた（2026-09-22）。入れる道は**画面（`/me` の図鑑）しか
無かった**が、あやとの返事はこうだった。

> 自分でやってください。公開ログがでても良い。

だから、こちらから入れる道を1本通す。**1人ずつ、名指しで。**

## 名乗りは ARGS に取る。**書類IDとチャンネルIDは出さない**

あやとが「公開ログが出ても良い」と言ったのは**名乗り**のこと。
書類IDとチャンネルIDはその言葉に入っていないので、ログには
`logsafe.mask()` の指紋しか出さない。
（`run_admin_script.yml` は `@…` と `doc` の値を自分で伏せるので、
入力そのものも実際には伏せ字になる。こちらが出さない理由はそれとは別で、
**伏せ字が効かなくなった日に素通しにしない**ため）

## 書くのは**口に頼む。** 自分で Firestore に書かない

入れたあとの形は、図鑑の画面から入れたときと**1欄も違ってはいけない。**
違うと、`channelKeys` からしか引けない人と `lookupKeys` からしか引けない人が
できて、**どちらか片方の引きかたでだけ当たる**という、いちばん見つけにくい
壊れ方になる。

`functions/src/islandCharacter.ts` が `POST /characters/{id}` の中でやるのは
5つ。

  1. 打たれた字が `@…` なら YouTube を引いて、**表示名を `aliases` に足す**
  2. `channelKeys` = `keysOf([channelName])`
  3. `lookupKeys` = `keysOf([channelName, ...aliases])`
  4. `channelId` が**空なら**引けたIDを入れる（埋まっている人には触らない）
  5. `channelTitleFor` / `editedAt` / `editedBy` / `updatedAt`

これを Python で書き写すと、**作り方が2か所になる。**
`islandCharacter.ts` にもそう書いてある——「鍵はここで作る。画面から
作らせない。作り方が2か所にあると、片方だけ直したときに引けない行が
静かに増える」。

だから**同じ口を叩く**（`_owner.call`。`channel_alias.py` と同じ道）。
口が変わっても、こちらは黙って付いていく。

## 口は `channelName` / `emoji` / `aliases` を**置き換える**

送らなかった欄は空になる。だから**いま入っている値を先に読んで、
そのまま乗せ直す**（`channel_alias.py` `tail_alias.py` と同じ）。
絵は送らない——送られてこなかった役どころに口は触らない。

## `channelId` だけは、口に任せきれない

口は**空のときだけ**入れる（`islandCharacter.ts`「すでに入っている書類には
触らない。IDは名前と違って変わらないものなので、上書きは『別人に付け替える』
のと同じ」）。

ところが #553 の4人には、**機械が当てたID がすでに入っている**
（`characters_name_match` が表示名の完全一致で 2026-09-21 に入れた）。
あやとの名乗りが**正**なので、食い違っていたらそちらへ寄せる必要がある。

**自分で引いて、突き合わせて、違っていたら入れ直す。**
引くのは `characters_link.youtube_finder`（`channels.list` の `forHandle`）。
**写しを作らない。** ハンドルは YouTube が1人に1つしか振らないので、
返るのは0件か1件で、表示名と違って同名の別人がいない。

## 守り（外すと、その足だけが落ちる）

| | 何を見るか | 外れると何が起きるか |
| --- | --- | --- |
| `emoji` | ARGS の絵文字と、書類の絵文字が同じか | **別の人に名乗りが入る。** 図鑑の並びは焼き直すたびに変わるので、番号だけでは照合にならない |
| `yt` | ハンドルが**ちょうど1つ**のIDに決まるか | 見つからない名乗りを、当たったことにして書く |
| `taken` | そのIDを**他の書類が持っていないか** | 同じIDが2人に付いて、カードの絵が入れ替わる |
| `write` | `apply` が無ければ口を1回も叩かない | 下見のつもりで本番が変わる |

`BREAK=emoji|yt|taken|write` でその足を1本ずつ抜ける。
抜いたぶんが落ちることまで見るのが `characters_handle_selftest.py`。

## 入ったかどうかは、**読むだけの口で確かめる**

`GET /characters/lookup?alias=<名乗り>` がその人を返すこと。
入れる前は `{"character":null}` なので、**通るようになることが直った証拠**。
書いた側の言い分（口の返事）だけでは見ない。

実行:
  Actions > 管理スクリプトを実行 > script = characters_handle
"""

import os
import sys

import requests

from _fs import args, db, log, need, readonly
from _owner import API_BASE, call, owner_token

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import characters_link as cl  # noqa: E402

#: 図鑑。`characters_link` と同じものを指す（名前を2か所に置かない）
CHARACTERS = cl.CHARACTERS

#: 絵文字の長さの上限。`islandCharacter.ts` の `clean(q.body.emoji, 16)` と同じ
MAX_EMOJI = 16


def _break(name: str) -> bool:
    """対照で、守りを1本だけ抜く（`BREAK=emoji` など）。

    Args:
        name: 抜く守りの名前

    Returns:
        抜くなら True
    """
    return name in (os.getenv("BREAK") or "").split(",")


def check_emoji(had: dict, want: str) -> None:
    """**この書類で合っているか**を、絵文字で照合する。

    番号（図鑑の並び）では照合できない。並びは `days` の順なので、
    毎晩の焼き直しで動く。実際 #553 の表を作った 2026-09-21 と 2026-09-23 で
    1〜2 ずれている。**絵文字は人が決めたもので、動かない。**

    Args:
        had: いま入っている中身
        want: ARGS で渡された絵文字

    Raises:
        SystemExit: 食い違ったら、何も書かずに 2
    """
    got = str(had.get("emoji") or "")
    if _break("emoji"):
        log.warning("**対照: 絵文字の照合を外しています**")
        return
    if got != want:
        # **絵文字は出してよい**（図鑑の口が誰にでも返している）。
        # どの人の話かが分からないと、打ち間違えを直せない
        log.error("絵文字が合いません。書類のほうは %s で、渡されたのは %s です。"
                  "**何も書きません**", got or "（無し）", want)
        raise SystemExit(2)
    log.info("絵文字が一致しました … %s", got)


def resolve(handle: str) -> str:
    """名乗りから `channelId` を1つに決める。

    引くのは `characters_link.youtube_finder`。**写しを作らない。**

    Args:
        handle: `@…`

    Returns:
        チャンネルID

    Raises:
        SystemExit: 0個か2個以上に当たったら 2
    """
    key = cl.norm(handle)
    if not cl.HANDLE.match(key):
        log.error("名乗りの形になっていません（`@` で始まる3〜30字）。"
                  "**何も書きません**")
        raise SystemExit(2)

    ask, yt = cl.youtube_finder(True)
    ids = ask([key])
    log.info("YouTube: 訊いた %d件 / 見つかった %d件 / 答えが返らなかった %d件",
             yt["訊いた"], yt["見つかった"], yt["訊けなかった"])

    if _break("yt"):
        log.warning("**対照: ハンドルが1つに決まるかの確かめを外しています**")
        return next(iter(ids), "")
    if len(ids) != 1:
        log.error("その名乗りから channelId が %d件 出ました。"
                  "**1件のときしか書きません**", len(ids))
        raise SystemExit(2)
    return next(iter(ids))


def taken_by_other(store, cid: str, self_id: str) -> bool:
    """その `channelId` を、**別の書類がもう持っていないか。**

    同じIDが2人に付くと、カードの絵がもう1人のものになる
    （`islandCharacter.ts` の `channelIdTaken` と同じ決め）。

    Args:
        store: Firestore クライアント（下見では読むだけの写し）
        cid: 入れようとしているID
        self_id: いま触っている書類ID

    Returns:
        別の誰かが持っていれば True
    """
    hits = list(store.collection(CHARACTERS)
                .where("channelId", "==", cid).limit(2).get())
    return any(d.id != self_id for d in hits)


def looks_up(handle: str) -> str:
    """**読むだけの口**で、その名乗りから誰が返るかを見る。

    書いた側の言い分ではなく、引く側から見る。

    Args:
        handle: `@…`

    Returns:
        当たった書類ID。当たらなければ空文字
    """
    res = requests.get(API_BASE + "/characters/lookup",
                       params={"alias": handle}, timeout=60)
    if res.status_code != 200:
        log.warning("引く口が HTTP %d を返しました", res.status_code)
        return ""
    got = (res.json() or {}).get("character") or {}
    return str(got.get("id") or "")


def report(had: dict, handle: str, cid: str) -> str:
    """いまの中身と、これから起きることを並べる。**素性は指紋だけ。**

    Args:
        had: いま入っている中身
        handle: 入れる名乗り
        cid: 名乗りから決まったチャンネルID

    Returns:
        `channelId` をどうするか（`同じ` / `空` / `食い違い`）
    """
    was = str(had.get("channelId") or "")
    log.info("いま入っているもの … 名乗り %s / 呼び名 %d件 / "
             "channelKeys %d件 / lookupKeys %d件 / channelId %s",
             mask(had.get("channelName") or ""),
             len(had.get("aliases") or []),
             len(had.get("channelKeys") or []),
             len(had.get("lookupKeys") or []),
             mask(was) if was else "（空）")
    log.info("入れる名乗り … %s / そこから決まった channelId … %s",
             mask(handle), mask(cid))

    if not was:
        log.info("channelId は空です。**口が入れます**")
        return "空"
    if was == cid:
        log.info("channelId は**すでに同じ**です（機械が当てたものと"
                 "あやとの名乗りが一致しました）")
        return "同じ"
    log.info("**channelId が食い違っています。** あやとの名乗りを正として"
             "入れ直します（機械が当てたほうを捨てます）")
    return "食い違い"


def push(client, doc: str, handle: str, had: dict, cid: str) -> dict:
    """口に頼んで書いてもらい、`channelId` だけ最後に突き合わせる。

    Args:
        client: Firestore クライアント（本物）
        doc: 書類ID
        handle: 入れる名乗り
        had: いま入っている中身
        cid: 名乗りから決まったチャンネルID

    Returns:
        口の返事
    """
    token = owner_token(client)
    body = {
        # **いま入っている値を乗せ直す。** 口は送られたぶんで置き換える
        "channelName": handle,
        "emoji": str(had.get("emoji") or "")[:MAX_EMOJI],
        "aliases": [a for a in (had.get("aliases") or [])
                    if isinstance(a, str) and a],
    }
    got = call("POST", f"/characters/{doc}", token, body)
    named = (got or {}).get("named") or {}
    # **表示名そのものは出さない。** 足せたかどうかだけ
    log.info("口の返事 … 表示名 %s（%s）",
             named.get("state") or "（無し）", named.get("why") or "理由なし")

    ref = client.collection(CHARACTERS).document(doc)
    now = str((ref.get().to_dict() or {}).get("channelId") or "")
    if now != cid:
        # 口は**空のときだけ**入れる。埋まっていたら触らないので、
        # あやとの名乗りと食い違ったままここへ来る。**こちらで寄せる**
        ref.update({"channelId": cid})
        log.info("channelId を、あやとの名乗りから決まったほうへ入れ直しました")
    return got


def verify(client, doc: str, handle: str, cid: str) -> int:
    """入ったかを、**引く側から**確かめる。

    Args:
        client: Firestore クライアント（本物）
        doc: 書類ID
        handle: 入れた名乗り
        cid: 入っているはずのチャンネルID

    Returns:
        外れた数
    """
    bad = 0
    v = client.collection(CHARACTERS).document(doc).get().to_dict() or {}

    keys = cl.src_keys(handle)
    for field in ("channelKeys", "lookupKeys"):
        have = [k for k in (v.get(field) or []) if isinstance(k, str)]
        ok = all(k in have for k in keys)
        log.info("  %s … %s（%d件）", field, "○" if ok else "✕ 足りない",
                 len(have))
        bad += 0 if ok else 1

    ok = str(v.get("channelId") or "") == cid
    log.info("  channelId … %s", "○ 名乗りと同じ" if ok else "✕ 違う")
    bad += 0 if ok else 1

    hit = looks_up(handle)
    ok = hit == doc
    log.info("  GET /characters/lookup?alias=… … %s",
             "○ この人が返りました" if ok
             else ("✕ 誰も返りません" if not hit else "✕ 別の人が返りました"))
    bad += 0 if ok else 1
    return bad


def run(client, doc: str, handle: str, emoji: str, apply: bool) -> int:
    """下見と本番を1本にしたもの。**既定は1バイトも書かない。**

    確かめ（`characters_handle_selftest.py`）が偽の Firestore を渡せるように、
    クライアントは引数で受け取る。`_fs.db()` を中で呼ばない。

    Args:
        client: Firestore クライアント（本物）
        doc: 書類ID
        handle: 入れる名乗り（`@…`）
        emoji: 照合用の絵文字
        apply: 本当に書くか

    Returns:
        0 なら正常
    """
    # 下見では書く口ごと塞ぐ。`if apply:` の書き忘れでも本番は動かない
    store = client if apply else readonly(client)

    snap = store.collection(CHARACTERS).document(doc).get()
    if not snap.exists:
        log.error("その書類はありません。**何も書きません**")
        raise SystemExit(2)
    had = snap.to_dict() or {}

    check_emoji(had, emoji)
    cid = resolve(handle)

    if taken_by_other(store, cid, doc):
        if _break("taken"):
            log.warning("**対照: すでに別の人に付いているかの確かめを"
                        "外しています**")
        else:
            log.error("その channelId は**すでに別の書類が持っています。**"
                      "2人に同じIDが付くとカードの絵が入れ替わります。"
                      "**何も書きません**")
            raise SystemExit(2)

    state = report(had, handle, cid)

    if not apply and not _break("write"):
        log.info('下見で終わりました。入れるには {"apply": true}')
        return 0

    log.info("入れます（%s）", state)
    push(client, doc, handle, had, cid)

    log.info("入ったかを確かめます")
    bad = verify(client, doc, handle, cid)
    if bad:
        log.error("**%d件 外れました。** 画面に出す前に見てください", bad)
        return 1
    log.info("○ 入りました")
    return 0


def main() -> int:
    """エントリポイント。**既定は下見。**"""
    a = args()
    doc, handle, emoji = need(a, "doc", "handle", "emoji")
    apply = bool(a.get("apply", False))
    log.info("%s", "**書きます**" if apply else "下見。**1バイトも書きません**")
    # **名乗りだけは字のまま持つ**（YouTube に訊く鍵なので）が、
    # ログには指紋しか出さない
    return run(db(), str(doc), str(handle).strip(), str(emoji), apply)


if __name__ == "__main__":
    sys.exit(main())
