"""Doneru の どねID と YouTube のアカウントの対応表を、Firestore に入れる。

## なぜ表が要るのか

Doneru の投げ銭は BigQuery の `doneru_donations` に入るが、**YouTube の
チャンネルIDを持っていない**（あるのは `donor_name` と `viewer_pk` だけ）。
名前で突き合わせると、別の人にカードを渡す事故が起きる。

そこで **どねID（`viewer_pk`）→ YouTube のアカウント** の対応表を持つ。
元は `python/donors_seed.json`（あやとが手で作ったもの）。ここが正で、
Firestore の `islandDonors` はその写し。

## 3つの状態

| state | 意味 | カードを渡せるか |
| --- | --- | --- |
| `linked`   | チャンネルIDまで分かっている | **渡せる** |
| `unlinked` | 表にはあるが、YouTube のアカウントが分からない | 渡せない |
| `new`      | **表に無い どねID が投げ銭してきた** | 渡せない。**あやとの紐付け待ち** |

`new` を見つけるのがこの仕組みの目的。`python/nordic_supporters.py` が
その日の投げ銭を見て、表に無い どねID を `new` として置く。

## チャンネルIDの引き方

表が持っているのは `@ひめひめ-r9z` のような**表示名**なので、そこから
`chat_messages.author_channel_id` を引く。**同じ名前が2つのチャンネルに
付いていたら、引かない**（どちらか分からないまま渡すほうが悪い）。

名前は変わる。だから表の鍵は どねID で、名前は引くための手がかりでしかない。

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: donors_import
    args:   {}                … 何が入るか出すだけ（既定）
    args:   {"force": true}   … 塗り直したら何人ぶん消えるかを、書かずに見る
    args:   {"apply": true}   … Firestore に書く
    args:   {"apply": true, "force": true}
                              … 画面から直したぶんも種で塗り直す

**既定は書かない。** `apply` を付けたときだけ流れる。
何度流しても同じ結果になる（どねID が鍵）。

**下見も Firestore を読む。** 読むだけつないで、書く口は塞いである
（`_fs.readonly`）。つながずに数えていたころは「画面のぶんを残した」が
いつでも 0人で、`force` を付けても下見の字が1文字も変わらなかった。
`force` で何人ぶんの手作業が消えるかが、流す前に分からなかったということ。

**正は Firestore、この JSON は種。** `/me` から直したもの（`editedAt` が
入っているもの）は触らない。逆にすると、紐付けた翌朝の取り込みで元に戻る。
"""

import io
import json
import os
import sys
from datetime import datetime, timezone

from _fs import args, db, log, readonly

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 表示名からチャンネルIDを引くところは、毎朝の取り込み
# （`python/doneru_supporters.py`）と共通。**引き方を2か所に書かない。**
from donor_channels import channels  # noqa: E402
from logsafe import detail_lines  # noqa: E402

SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "donors_seed.json",
)

def run(store, seed, found, apply: bool, force: bool) -> dict:
    """種を1行ずつ Firestore と突き合わせる。**書くのは apply のときだけ。**

    Args:
        store: Firestore クライアント。下見のときは書く口を塞いだもの
        seed: 種の行（`donors_seed.json` の `donors`）
        found: 表示名 → チャンネルID
        apply: 実際に書くか
        force: 画面から直した行も種で塗り直すか

    Returns:
        紐付いた・まだの・画面のぶんを残した・force で塗り直した の人数
    """
    now = datetime.now(timezone.utc).isoformat()
    tally = {"linked": 0, "unlinked": 0}
    kept = 0
    wiped = 0

    for d in seed:
        handle = d.get("handle")
        cid = found.get(handle) if handle else None
        state = "linked" if cid else "unlinked"
        tally[state] += 1
        row = {
            "viewerPk": d["viewerPk"],
            "handle": handle,
            "label": d.get("label"),
            "channelId": cid,
            # あやと本人。表には載せるが、カードは渡さない
            "isOwner": bool(d.get("isOwner")),
            "state": state,
            "updatedAt": now,
        }
        ref = store.collection("islandDonors").document(d["viewerPk"])
        cur = ref.get().to_dict()
        edited = bool(cur and cur.get("editedAt"))

        # **画面から直した内容を、種で上書きしない。**
        # Firestore が正で、この JSON は種（最初の1回と、消えたときの戻し先）。
        # 逆にすると、あやとが `/me` で紐付けた翌朝の取り込みで元に戻る。
        # 種のほうを通したいときだけ force を付ける。
        if edited and not force:
            # **公開の場では1人ずつ出さない**（`python/logsafe.py`）。
            # このリポジトリは公開で、Actions のログも誰でも読める
            for line in detail_lines([(
                f'{d["viewerPk"]:<22}', f'{cur.get("state") or "?":<8}',
                cur.get("handle") or f"（{cur.get('label')}）",
                "（画面から直してあるので触りません）",
            )]):
                log.info("%s", line)
            kept += 1
            continue
        if edited:
            wiped += 1

        for line in detail_lines([(
            f'{d["viewerPk"]:<22}', f'{state:<8}',
            handle or f"（{d.get('label')}）",
        )]):
            log.info("%s", line)
        if not apply:
            continue
        # 新規で見つけた日は、種に無いので消さない
        if cur and cur.get("firstSeenAt"):
            row["firstSeenAt"] = cur["firstSeenAt"]
        ref.set(row, merge=True)

    return {"linked": tally["linked"], "unlinked": tally["unlinked"],
            "kept": kept, "wiped": wiped}


def main() -> None:
    a = args()
    apply = bool(a.get("apply", False))
    # 画面から直したぶんも種で塗り直す。ふだんは使わない
    force = bool(a.get("force", False))

    seed = json.load(io.open(SEED, encoding="utf-8"))["donors"]
    log.info("表: %d行", len(seed))

    names = sorted({d["handle"] for d in seed if d.get("handle")})
    found = channels(names)
    log.info("表示名 %d件のうち、チャンネルIDが引けたのは %d件",
             len(names), len(found))

    # **下見でも読むだけつなぐ。** つながずに数えると、上書きせずに残す行を
    # 数える機会そのものが無くなって、いつでも 0 に出る。読む人には、その 0 が
    # 「そういう行が無い」のか「見ていない」のか見分けがつかない
    # （2026-09-13 に実際に、下見 0人 → apply 6人 になった）。
    # 書く側は口ごと塞ぐので、下見の途中に書き込みが紛れても例外で止まる。
    client = db()
    got = run(client if apply else readonly(client), seed, found, apply, force)

    log.info("紐付いた %d人 / まだの %d人 / 画面のぶんを残した %d人",
             got["linked"], got["unlinked"], got["kept"])
    if force and apply:
        log.info("force で %d人を種で塗り直しました", got["wiped"])
    elif force:
        log.info("force で塗り直す %d人（force を外せば、この %d人は残ります）",
                 got["wiped"], got["wiped"])
    if apply:
        log.info("Firestore islandDonors を更新しました")
    else:
        log.info("読んで数えただけで、1バイトも書いていません。"
                 '流すなら args に {"apply": true} を入れてください')


if __name__ == "__main__":
    main()
