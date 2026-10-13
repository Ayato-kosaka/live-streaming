"""**名乗っただけのチャンネルが、本番に残っていないかを数える。読むだけ。**

ARGS 例:
  {}                … 数えて出す
  {"detail": true}  … **出ない。** 素性は1文字も出さないので、この引数は無い

## なぜ要るか

`POST /me` は長いあいだ、画面が送ってきた `channelId` をそのまま
`islandUsers/{uid}.channelId` に書いていた（2026-10-13 に塞いだ）。
チャンネルIDは公開の値なので、島にログインできる人なら誰でも
他人のIDを名乗れた。名乗った先でできたのは3つ:

  - `GET /cards/mine` … その人のカードが読める（**跡が残らない**）
  - `POST /stampline/mine` … その人の「戻らないことば」を上書きできる
  - `listResidents()` … その人のキャラクターの絵で島に立てる

**ここで数えるのは「跡の残るほう」だけ。** 読んだだけの回は、どこにも
記録が無いので数えようがない。**数えられないものを「0件だった」と
言わない**（`docs/island-standards.md` §15）。

## 何で「嘘」と分かるか — 2つだけ

| | 見かた | なぜ嘘と言えるか |
| --- | --- | --- |
| **かぶり** | 同じ `channelId` を2つ以上の uid が持っている | 1人のチャンネルを2人が名乗っている。**少なくとも片方は嘘** |
| **書いた人** | `islandStampLine/{id}.updatedBy` が、いまその `channelId` を持つ uid と違う | ことばを書いた人と、そのチャンネルの持ち主が別人 |

**「書いた人」のほうが決め手。** `stampLine.ts` が書くたびに
`updatedBy: me.uid` を残しているので、**誰が書いたか**は本番に在る。

**どちらにも当たらない嘘は、ここでは見つからない。**
名乗った人が1人だけで、その相手がまだ島にログインしていなければ、
かぶりも起きないし、書いた跡が本人のものと区別できない。
**だから出すのは「見つかった数」で、「起きた数」ではない。**

## 出すもの

**数だけ。** uid・チャンネルID・名前・ことばは1文字も出さない。
このリポジトリは公開で、Actions のログも誰でも読める。
かぶっている相手がいたら、**何件かだけ**を出して、どれかは出さない。

数は `::notice::` でも出す。**Actions のログは別の置き場から配られていて、
API からは読めない**（`gh` が「他のホストは叩かない」と言って止まる）。
注記（annotation）なら `check-runs/{id}/annotations` から引けるので、
走らせた人が画面を開かなくても数だけ持ち帰れる。
"""

from collections import defaultdict

from _fs import args, db, log


def notice(msg: str) -> None:
    """Actions の注記に1行出す。**数だけ。** ログにも同じものを出す。"""
    log.info("%s", msg)
    print(f"::notice::{msg}", flush=True)


def main() -> None:
    args()
    client = db()

    # ---- islandUsers を読む。**channelId と uid の対応だけ** ----
    pairs: list[tuple[str, str]] = []
    users = 0
    for d in client.collection("islandUsers").select(["channelId"]).stream():
        users += 1
        ch = (d.to_dict() or {}).get("channelId")
        if isinstance(ch, str) and ch:
            pairs.append((d.id, ch))

    by_channel: dict[str, list[str]] = defaultdict(list)
    for uid, ch in pairs:
        by_channel[ch].append(uid)
    uid_of: dict[str, str] = {ch: u[0] for ch, u in by_channel.items()}

    log.info("islandUsers … %d 件（うち channelId を持つ %d 件）", users, len(pairs))
    log.info("結ばれているチャンネル … %d 本", len(by_channel))

    # ---- (1) かぶり ----
    dup = {ch: u for ch, u in by_channel.items() if len(u) > 1}
    if dup:
        log.info("")
        log.info("**かぶり %d 本**（同じチャンネルを %d 人が名乗っている）。"
                 "どれかは出さない", len(dup), sum(len(u) for u in dup.values()))
    else:
        log.info("かぶり … 0 本")

    # ---- (2) スタンプのことばを、持ち主でない人が書いていないか ----
    #
    # **書類の数ではなく、ことばの入っている書類だけ**を分母にする。
    # `lines` が空のままの書類は、誰も書いていないので比べるものが無い。
    wrote = 0
    foreign = 0
    orphan = 0
    for d in client.collection("islandStampLine").stream():
        v = d.to_dict() or {}
        lines = v.get("lines")
        if not isinstance(lines, list) or not lines:
            continue
        wrote += 1
        by = v.get("updatedBy")
        ch = v.get("channelId")
        if not isinstance(by, str) or not by:
            # 書いた人が分からない（移行で置いたぶん）。**嘘とは言えない**
            orphan += 1
            continue
        owner = uid_of.get(ch) if isinstance(ch, str) else None
        if owner is None:
            # そのチャンネルを名乗っている人が、いま1人もいない
            orphan += 1
            continue
        if owner != by:
            foreign += 1

    log.info("")
    log.info("islandStampLine … ことばの入っている書類 %d 件", wrote)
    log.info("  持ち主でない人が書いたもの … %d 件", foreign)
    log.info("  **比べられなかったもの … %d 件**"
             "（書いた人が分からない／いま誰も名乗っていない）", orphan)

    # ---- まとめ ----
    log.info("")
    notice(
        f"islandUsers {users}件 / channelId を持つ {len(pairs)}件 / "
        f"結ばれたチャンネル {len(by_channel)}本 / かぶり {len(dup)}本 / "
        f"ことばの入った書類 {wrote}件（他人が書いた {foreign}件 / "
        f"比べられない {orphan}件）"
    )
    if not dup and foreign == 0:
        notice("跡の残る嘘は 0 件（読んだだけの回は記録が無いので数えられない）")
    else:
        notice(f"見つかった: かぶり {len(dup)}本 / 他人が書いたことば {foreign}件")


main()
