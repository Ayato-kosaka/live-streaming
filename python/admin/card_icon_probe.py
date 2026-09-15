"""カードの絵の引き方を替えたら、**いま乗っている絵が何枚残るか**を数える。

ARGS: なし（`{}`）。**読むだけ。1バイトも書かない。**

## なぜ要るか

あやとの決め（2026-09-15）で、カードの絵を**「投げ銭したときに名乗っていた
名前」**から引くように替える。アラートボックスと同じ `lookupKeys` 引き。
匿名で別名を出した人の絵が、公開の面から消えるようにするため。

**狙いどおり消える人のほかに、巻き添えで消える人がいる。**
投げ銭したあとに YouTube のチャンネル名を変えた人は、焼いた名乗りが
古い名前のままなので、いまの `lookupKeys` に当たらない。
**そこが何人いるかを知らずに出すと、黙って絵が消える。**

## 対照を、道具の中に入れてある

いまの引き方（チャンネルID → いま名乗っている名前 → `channelKeys`）を
**この道具でも組み直して**、本番の `/cards` が返している枚数と突き合わせる。

    本番の公開 `/cards`（2026-09-15 18:00 実測）… 51枚ぜんぶに絵が乗っている

**組み直した「いまの引き方」が 51枚にならなければ、この道具は本番と
違うものを見ている。** そのときは数字を出さずに落ちる（`island-standards.md` 15）。
1回目の `characters_freeze` は対照が無くて、名前を1件も読めていないのに
「0人」と答えた。**同じことを繰り返さない。**

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**名前も呼び名も1文字も出さない。** 出すのは枚数と、書類IDの指紋だけ。
"""

import sys

from _fs import args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import keys_of, norm_key  # noqa: E402

CARDS = "islandCards"
TIPS = "islandTips"
CHARACTERS = "islandCharacter"
CHANNELS = "islandChannels"

MAX_CARDS = 600
MAX_TIPS = 5000
MAX_CHARACTERS = 500
MAX_CHANNELS = 10000
# `cards.ts` の MAX_NAME。**正規化より先に切る**のが向こうの順番
MAX_NAME = 80

# **対照。** 本番の公開 `/cards` が返している枚数（2026-09-15 18:00 実測）。
# 51枚ぜんぶに絵が乗っている。組み直した「いまの引き方」がこれと違えば、
# この道具は本番と違うものを見ている
CONTROL_WITH_ICON = 51


def clean(v, n: int) -> str:
    """`streamEvents.ts` の `clean`。trim してから字数で切る。"""
    return v.strip()[:n] if isinstance(v, str) else ""


def pick(keys: dict, names) -> str | None:
    """名前から絵を引く。**当たらなければ None。**

    `iconsOf` と同じで、`keysOf` が作る形のどれかが当たればよい。
    """
    for k in keys_of(names):
        got = keys.get(k)
        if got:
            return got
    return None


def near(day: str) -> list:
    """その日と、前後1日。**0時をまたいだ配信**のため。

    カードの `day` は企画の日、台帳の `day` は投げた日。深夜に投げた人は
    台帳が翌日になる（`mintCards` の注）。その日で当たらなければ前後を見る。
    """
    from datetime import date, timedelta

    try:
        d0 = date.fromisoformat(day)
    except ValueError:
        return [day]
    return [day, str(d0 - timedelta(days=1)), str(d0 + timedelta(days=1))]


def build(snap, field: str) -> dict:
    """鍵 → キャラクターの書類ID。**2人に付いている鍵は捨てる。**

    当てずっぽうに1人選ぶと、別人の絵が配信とカードに乗る
    （`characterKeys` の `twice` と同じ決め方）。
    """
    out: dict = {}
    twice = set()
    for d in snap:
        v = d.to_dict() or {}
        for k in (v.get(field) or []):
            if not isinstance(k, str) or not k:
                continue
            had = out.get(k)
            if had and had != d.id:
                twice.add(k)
            else:
                out[k] = d.id
    for k in twice:
        out.pop(k, None)
    return out


def main() -> None:
    args()
    c = readonly(db())

    chars = list(c.collection(CHARACTERS).limit(MAX_CHARACTERS).get())
    old_keys = build(chars, "channelKeys")   # いまの引き方が見る欄
    new_keys = build(chars, "lookupKeys")    # アラートボックスが見る欄
    log.info("名簿 %d 人（channelKeys の鍵 %d / lookupKeys の鍵 %d）",
             len(chars), len(old_keys), len(new_keys))

    # いまの引き方: チャンネルID → いま名乗っている名前
    now_name: dict = {}
    shared = set()
    owner: dict = {}
    ch_total = 0
    for d in c.collection(CHANNELS).select(["name"]).limit(MAX_CHANNELS).get():
        ch_total += 1
        nm = clean((d.to_dict() or {}).get("name"), MAX_NAME)
        if not nm:
            continue
        now_name[d.id] = nm
        # `sharedNames`。2つ以上が名乗る名前は、いまの引き方では当てない
        for k in keys_of([nm]):
            had = owner.get(k)
            if had and had != d.id:
                shared.add(k)
            else:
                owner[k] = d.id
    log.info("チャンネルの辞書 %d 件（かぶった鍵 %d）", ch_total, len(shared))

    # 投げ銭したときの名乗り。**その人・その日の、いちばん早い1回**
    # （`mintCards` の `first` と同じ採り方）。
    #
    # **1回目はここを間違えた。** 人ごとに「いちばん古い投げ銭」を採って
    # いたので、以前に本名で投げていた人は、あとから別名で投げても
    # 本名のほうが当たって「消えない」と出た。**日で分けないと、
    # 匿名で投げた回を見ていないことになる。**
    snapshot: dict = {}      # (チャンネルID, 日) → 名乗り
    seen_at: dict = {}
    tip_total = 0
    for d in c.collection(TIPS).limit(MAX_TIPS).get():
        tip_total += 1
        v = d.to_dict() or {}
        ch = v.get("channelId")
        day = v.get("day")
        if not isinstance(ch, str) or not ch:
            continue
        if not isinstance(day, str) or not day:
            continue
        key = (ch, day)
        at = v.get("donatedAt") or 0
        if key in seen_at and seen_at[key] <= at:
            continue
        seen_at[key] = at
        snapshot[key] = clean(v.get("displayNameSnapshot"), MAX_NAME)
    log.info("台帳 %d 件 / 名乗りのある（人 × 日）%d 組", tip_total, len(snapshot))

    same = 0        # どちらでも同じ絵
    lost = 0        # いまは乗っているが、新しい引き方では消える
    gained = 0      # いまは乗らないが、新しい引き方で乗る
    changed = 0     # 別の絵に変わる（**これが出たら出してはいけない**）
    none_both = 0
    old_on = 0
    new_on = 0
    total = 0
    slid = 0        # 前後の日から拾ったぶん（0時またぎ）
    lost_ids = []
    changed_ids = []

    for d in c.collection(CARDS).limit(MAX_CARDS).get():
        total += 1
        v = d.to_dict() or {}
        ch = v.get("channelId")
        if not isinstance(ch, str):
            ch = ""

        # いまの引き方
        nm = now_name.get(ch, "")
        mine = keys_of([nm]) if nm else []
        old = None if any(k in shared for k in mine) else pick(old_keys, [nm])

        # 新しい引き方（投げたときの名乗り → lookupKeys）。
        # カードの `day` は**企画の日**で、台帳の `day` は**投げた日**。
        # 0時をまたいだ配信ではずれるので、その日 → 前後1日 の順に見る
        # （`mintCards` は企画に当たる投げ銭を見るので、ここは近似）
        cday = v.get("day") if isinstance(v.get("day"), str) else ""
        snap_name = ""
        for dd in near(cday):
            got = snapshot.get((ch, dd))
            if got:
                snap_name = got
                if dd != cday:
                    slid += 1
                break
        new = pick(new_keys, [snap_name]) if snap_name else None

        if old:
            old_on += 1
        if new:
            new_on += 1
        if old and new and old == new:
            same += 1
        elif old and new:
            changed += 1
            changed_ids.append(d.id)
        elif old and not new:
            lost += 1
            lost_ids.append(d.id)
        elif new and not old:
            gained += 1
        else:
            none_both += 1

    # **対照を先に読む。** ここが割れていたら、下の数字は何も意味しない
    if old_on != CONTROL_WITH_ICON:
        log.error(
            "**対照が合わない。** 組み直した「いまの引き方」で絵が乗るのは"
            " %d枚。本番の公開 /cards は %d枚。**この道具は本番と違うものを"
            "見ている。数字を出さずに止める**",
            old_on, CONTROL_WITH_ICON,
        )
        raise SystemExit(2)
    log.info("対照 合った（いまの引き方で %d枚。本番と同じ）", old_on)

    log.info("カード %d枚", total)
    log.info("  **新しい引き方で絵が乗る: %d枚**", new_on)
    log.info("  どちらでも同じ絵          : %d枚", same)
    log.info("  **消える（狙い＋巻き添え）: %d枚**", lost)
    log.info("  新しく乗る                : %d枚", gained)
    log.info("  **別の絵に変わる          : %d枚**（0でないと出せない）", changed)
    log.info("  どちらでも乗らない        : %d枚", none_both)
    log.info("  （うち前後の日から名乗りを拾った: %d枚。0時またぎ）", slid)
    for w in lost_ids[:20]:
        log.info("    消えるカード: %s", mask(w))
    for w in changed_ids[:20]:
        log.info("    **絵が変わるカード: %s**", mask(w))
    if changed:
        log.info("**別の絵に変わるカードがある。そのまま出してはいけない**")


if __name__ == "__main__":
    main()
