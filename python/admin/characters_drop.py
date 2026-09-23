"""図鑑から**1人だけ**消す。**既定は1バイトも消さない。**

ARGS 例:
  {"emoji":"🇸🇻","doc":"<書類ID>"}               … 下見。**消さない**
  {"emoji":"🇸🇻","doc":"<書類ID>","apply":true}  … 消す

## なぜ `firestore_delete.py` ではないのか

あちらには **`DELETABLE` という表**があって、載っているのは4本だけ。
載せる条件は3つで、そのうち2つを `islandCharacter` は満たさない。

- 「消えて失われる中身が、その日限り／その場限り」 … **違う。**
  呼び名も並び順も人が手で入れたもので、絵は視聴者さんが描いて送ってくれた
- 「人の書いた字が1文字も入っていない」 … **違う。** 全部それ

だから `DELETABLE` に足さない。**あの表を歪めるほうが高くつく**
（別の目的で決めた表をそのまま持ってくると外す・`docs/island-misses.md` #14）。
キャラクターを消す用事はここにしかないので、**ここだけに道を作る。**

## 消してよいと判断した理由（2026-09-22）

あやとが #553 でそう言った。

> 🇸🇻
> 削除で。

18人のうち、あやとが「残す」と言ったのは 🌞 🍌 🥨 の3人。🇸🇻 は
**機械が表示名の完全一致で当てただけ**で、あやとには心当たりが無かった。

## 戻せるようにしてから消す

**毎晩の退避（`python/backup/`）が、この入れ物を取っている**
（`plan.py` の `KEEP` に `islandCharacter` がある。理由もそこに書いてある——
「絵の実体へ辿る合言葉つき URL がここにしか無い」）。

だから消す前に、**退避に、いま消そうとしているのと同じ中身が入っているか**を
見る。見るのは件数ではなく **`codec.digest()`（書類IDと中身から出る指紋）が
一致すること。** 「取れている」だけでは足りない——最後に取ったのが3日前で、
そのあと呼び名を足していたら、戻しても同じものにはならない。

**一致しなければ消さない。** 今夜の退避を待てばよい。

## 置き場の絵は消さない

口（`DELETE /characters/{id}`）は Storage の実体も一緒に落とすが、
**ここは落とさない。** 理由は2つ。

1. **戻せなくなる。** 書類だけなら退避から戻るが、絵の実体は
   `python/backup/photos.py` が**書類の `url` 欄を鍵束として**取っている。
   書類を消したあとで「やっぱり戻して」と言われたとき、絵まで消えていると
   視聴者さんが描いて送ってくれたものが**どこからも出てこない**
2. **どのみち消せない。** Actions のサービスアカウントには
   `storage.objects.delete` が無い（#283。2026-09-12 に測り直して、
   いまも無いことを確かめてある・`bucket_purge.py`）

残るのは、**書類IDを知っている人にだけ返る絵1人ぶん**
（`GET /characters/{id}/plain-128.webp` は Firestore を読まない）。
図鑑にも島にも出なくなる。畳むと決めたら `bucket_purge.py` の側の話になる。

## 守り（外すと、その足だけが落ちる）

| | 何を見るか | 外れると何が起きるか |
| --- | --- | --- |
| `emoji` | ARGS の絵文字と、書類の絵文字が同じか | **別の人が消える。** 並び順は焼き直すたびに動くので、番号では照合にならない |
| `one` | これから消えるのが**ちょうど1人**か | 打ち間違えが2人以上に当たる |
| `backup` | 退避に**同じ指紋**の写しがあるか | 戻せないものを消す |
| `write` | `apply` が無ければ1件も消さない | 下見のつもりで消える |

`BREAK=emoji|one|backup|write` でその足を1本ずつ抜ける。
抜いたぶんが落ちることまで見るのが `characters_drop_selftest.py`。

## ログに中身を出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは絵文字（図鑑の口が誰にでも返している値）と、欄がいくつあったか、
`logsafe.mask()` の指紋だけ（`firestore_delete.py` と同じ線）。

実行:
  Actions > 管理スクリプトを実行 > script = characters_drop
"""

import os
import sys

from _fs import args, db, log, need, readonly

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backup import codec, sink  # noqa: E402
from logsafe import mask  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import characters_link as cl  # noqa: E402

#: 図鑑。`characters_link` と同じものを指す（名前を2か所に置かない）
CHARACTERS = cl.CHARACTERS


def _break(name: str) -> bool:
    """対照で、守りを1本だけ抜く（`BREAK=emoji` など）。

    Args:
        name: 抜く守りの名前

    Returns:
        抜くなら True
    """
    return name in (os.getenv("BREAK") or "").split(",")


def book(store) -> dict:
    """図鑑を**1回だけ**全件読む。

    人数を数えるのと、同じ絵文字の人が何人いるかを見るのに、同じ1回を使う。

    Args:
        store: Firestore クライアント（下見では読むだけの写し）

    Returns:
        書類ID → 中身
    """
    return {d.id: (d.to_dict() or {})
            for d in store.collection(CHARACTERS).stream()}


def targets(all_docs: dict, doc: str, emoji: str) -> list:
    """**これから消すものを、数えて並べる。**

    1人ぶんしか指していないことを、消す前に数字で出す。

    数えるのは**その絵文字を持っている人**。書類IDだけで照合すると、
    打ち間違えが黙って別の人に当たる。絵文字は図鑑の口が誰にでも返して
    いる値なので、**あやとが issue に書いた字とそのまま突き合わせられる。**

    Args:
        all_docs: 図鑑ぜんぶ
        doc: 書類ID
        emoji: 照合用の絵文字

    Returns:
        消す書類の一覧（0件か1件）

    Raises:
        SystemExit: 絵文字が食い違ったら 2 / 1人に決まらなければ 2
    """
    if doc not in all_docs:
        log.info("その書類はありません。消すものはありません")
        return []
    had = all_docs[doc]

    got = str(had.get("emoji") or "")
    if _break("emoji"):
        log.warning("**対照: 絵文字の照合を外しています**")
    elif got != emoji:
        log.error("絵文字が合いません。書類のほうは %s で、渡されたのは %s です。"
                  "**何も消しません**", got or "（無し）", emoji)
        raise SystemExit(2)
    else:
        log.info("絵文字が一致しました … %s", got)

    # **その絵文字を持っている人を、図鑑ぜんぶから数える。**
    # 2人いたら、あやとが書いた絵文字ではどちらか決められない。
    # 数えるのは**書類のほうの絵文字**（`got`）。照合が通っていれば
    # ARGS と同じ字で、通っていなければ照合の側が先に止める
    same = [k for k, v in all_docs.items() if str(v.get("emoji") or "") == got]
    log.info("**これから消すのは %d人です**（絵文字 %s の人は図鑑に %d人 / "
             "指紋 %s / 欄 %d個）",
             1, got or "（無し）", len(same), mask(doc), len(had))
    if _break("one"):
        log.warning("**対照: 1人に決まるかの確かめを外しています**")
    elif len(same) != 1 or same[0] != doc:
        log.error("その絵文字の人が %d人います。1人に決まりません。"
                  "**何も消しません**", len(same))
        raise SystemExit(2)
    return [{"id": doc, "emoji": got, "data": had}]


def images(had: dict) -> tuple:
    """置き場に何枚残るかを数える。**URL は出さない。**

    Args:
        had: 書類の中身

    Returns:
        （役どころの数, 実体の URL の数）
    """
    im = had.get("images")
    im = im if isinstance(im, dict) else {}
    files = 0
    for role in ("plain", "scene"):
        v = im.get(role)
        if not isinstance(v, dict):
            continue
        if isinstance(v.get("url"), str) and v["url"]:
            files += 1
        sizes = v.get("sizes")
        if isinstance(sizes, dict):
            files += sum(1 for u in sizes.values()
                         if isinstance(u, str) and u)
    return len(
        [r for r in ("plain", "scene") if isinstance(im.get(r), dict)]), files


def backed_up(doc: str, had: dict, query=None) -> bool:
    """**退避に、いま消そうとしているのと同じ中身が入っているか。**

    件数ではなく指紋で見る。`codec.digest()` は書類IDと中身から出るので、
    呼び名が1つ増えていれば違う字になる。

    Args:
        doc: 書類ID
        had: いま入っている中身
        query: 退避に問い合わせる関数（確かめが差し替える）

    Returns:
        同じ指紋の写しがあれば True
    """
    want = codec.digest(doc, had)
    rows = (query or _ask_backup)(doc)
    if not rows:
        log.error("退避にこの書類が1件もありません")
        return False
    newest = rows[0]
    same = [r for r in rows if r.get("digest") == want]
    log.info("退避 … %d世代 / いちばん新しいのは %s / 同じ指紋 %d世代",
             len(rows), newest.get("taken_at"), len(same))
    if not same:
        log.error("退避にはありますが、**中身が違います。**"
                  "消す前に今夜の退避を待ってください")
        return False
    return True


def _ask_backup(doc: str) -> list:
    """退避（BigQuery の `island_backup.firestore_docs`）を引く。

    Args:
        doc: 書類ID

    Returns:
        新しい順の世代。`taken_at` と `digest` を持つ
    """
    client = sink.client()
    rows = client.query(
        f"SELECT `taken_at`, digest FROM `{sink.FS_TABLE}`"
        " WHERE collection = @col AND doc_id = @doc"
        " ORDER BY `taken_at` DESC LIMIT 10",
        job_config=_params(doc),
        location=sink.LOCATION,
    ).result()
    return [{"taken_at": r["taken_at"], "digest": r["digest"]} for r in rows]


def _params(doc: str):
    """問い合わせの差し込み。**字をつなげない**（書類IDは人を指す）。

    Args:
        doc: 書類ID

    Returns:
        `QueryJobConfig`
    """
    from google.cloud import bigquery

    return bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("col", "STRING", CHARACTERS),
        bigquery.ScalarQueryParameter("doc", "STRING", doc),
    ])


def run(client, doc: str, emoji: str, apply: bool, query=None) -> int:
    """下見と本番を1本にしたもの。**既定は1バイトも消さない。**

    確かめ（`characters_drop_selftest.py`）が偽の Firestore を渡せるように、
    クライアントは引数で受け取る。`_fs.db()` を中で呼ばない。

    Args:
        client: Firestore クライアント（本物）
        doc: 書類ID
        emoji: 照合用の絵文字
        apply: 本当に消すか
        query: 退避に問い合わせる関数（確かめが差し替える）

    Returns:
        0 なら正常
    """
    # 下見では書く口ごと塞ぐ。`if apply:` の書き忘れでも本番は動かない
    store = client if apply else readonly(client)

    all_docs = book(store)
    before = len(all_docs)
    log.info("図鑑（%s）… いま %d人", CHARACTERS, before)

    found = targets(all_docs, doc, emoji)
    if not found:
        return 0
    had = found[0]["data"]

    roles, files = images(had)
    log.info("置き場に残る絵 … 役どころ %d / 実体 %d件"
             "（**消しません。**退避が書類の URL 欄を鍵束にしているため）",
             roles, files)

    ok = backed_up(doc, had, query)
    if _break("backup"):
        log.warning("**対照: 退避の確かめを外しています**")
    elif not ok:
        log.error("**戻せないので消しません**")
        raise SystemExit(2)

    if not apply and not _break("write"):
        log.info('下見で終わりました（1人ぶん消していません）。'
                 '消すには {"apply": true}')
        return 0

    client.collection(CHARACTERS).document(doc).delete()

    # **「消したつもり」を作らない**（`firestore_delete.py` と同じ）。
    # 同じ実行の中でもう一度引いて、本当に無くなったかを見る
    if client.collection(CHARACTERS).document(doc).get().exists:
        log.error("**消えていません。** 消したはずの書類がまだあります")
        return 1
    after = len(book(client))
    log.info("1人 消しました … 図鑑 %d人 → %d人", before, after)
    if after != before - 1:
        log.error("**人数が合いません。** 1人だけ減るはずです")
        return 1
    return 0


def main() -> int:
    """エントリポイント。**既定は下見。**"""
    a = args()
    doc, emoji = need(a, "doc", "emoji")
    apply = bool(a.get("apply", False))
    log.info("%s", "**消します**" if apply else "下見。**1バイトも消しません**")
    return run(db(), str(doc), str(emoji), apply)


if __name__ == "__main__":
    sys.exit(main())
