"""企画に貼られた古い付箋に、宛先（theme）を後から入れる。

## なぜ要るのか

`/next` の付箋は `planId` だけを持っていて、掲示板が読む `theme` を
持っていなかった。だから**書いた場所にしか出ない付箋**になっていた
（#171）。画面のほうは掲示板と同じ口（`/stickies`）に寄せたので、
すでに貼られているぶんにも `theme` を入れてやらないと、
移した先から消えたように見える。

**`planId` はそのまま残す。** 消すと、まだ配り終えていない古い画面から
6枚が消える。足すだけなら、しくじっても元に戻せる。

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: notes_theme
    args:   {}                 … 何を書くかを出すだけ（既定）
    args:   {"apply": true}    … 実際に書く

**既定は書かない。** 本番のデータなので、先に中身を見てから流す。

`theme` は `planId` をそのまま使う。`site/content/themes.ts` が
企画の id をそのままテーマの id にしているので、対応表は要らない。
"""

from _fs import args, db, log, show

# 一覧の口（`stickyShape`）が読む欄。欠けていても 0 / false に落ちるが、
# `POST /stickies` が書く形にそろえておくほうが、あとで見て分かる。
DEFAULTS = {"hearts": 0, "byOwner": False, "archived": False}


def who(client, uid):
    """いまのこの人の名前。`islandApi.ts` の whoIs と同じ順で決める。"""
    if not uid:
        return None
    snap = client.collection("islandUsers").document(uid).get()
    if not snap.exists:
        return None
    v = snap.to_dict() or {}
    return v.get("handle") or v.get("name") or None


def main() -> None:
    a = args()
    apply = bool(a.get("apply", False))
    client = db()

    # 索引を作る権限が無い(#168)ので `where` は使わず、引いてから選り分ける
    docs = list(client.collection("islandNotes").limit(500).stream())
    # `snapshot.get("欄")` は欄が無いと KeyError を投げる（JS の版と違う）。
    # 欠けているものを探すのがここの仕事なので、辞書にしてから見る
    todo = [
        d for d in docs
        if (d.to_dict() or {}).get("planId") and not (d.to_dict() or {}).get("theme")
    ]
    log.info("islandNotes %d 件のうち、宛先の無い企画の付箋は %d 件",
             len(docs), len(todo))

    for d in todo:
        v = d.to_dict()
        data = dict(DEFAULTS)
        data["theme"] = v["planId"]
        # 名乗った名前。**書いてある `name` をそのまま使わない。**
        # 旧来の口は Google の表示名（`ayato_arigato`）を焼いていて、
        # いまの島は `islandUsers.handle`（`あやとグルメアプリ`）を名前と
        # 決めている（`islandApi.ts` の whoIs）。同じ人の付箋が、貼った
        # 時期で違う名前になるのを避けるため、いまの名前を引き直す。
        by = who(client, v.get("uid")) or v.get("name")
        if by:
            data["by"] = by
        log.info("  %s  %s", d.id, show(data))
        if apply:
            client.collection("islandNotes").document(d.id).set(data, merge=True)

    if not apply:
        log.info('書いていません。流すなら args に {"apply": true} を入れてください')
        return

    # 書けたことを、引き直して確かめる
    for d in todo:
        after = client.collection("islandNotes").document(d.id).get().to_dict()
        log.info("  後: %s theme=%s by=%s text=%s",
                 d.id, after.get("theme"), after.get("by"),
                 str(after.get("text"))[:20])


main()
