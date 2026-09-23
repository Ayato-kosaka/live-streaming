"""豚の貯金箱の控えを、毎晩ひとりでに写す（`goal_migrate` の薄い口）。

## なぜ要るか（GitHub #614）

`islandGoal/2025-10-24` は、GAS の `Goals` が消えた／読めなくなったときに
本番（`functions/src/islandApi.ts` の `goalRecord()`）が落ちてくる先。
**そこが 2026-09-12 に写したきりで、9日ぶん古かった。**

#604（PR #613）で「GAS がこけた回に控えへ落ちない」ようになったので、
残っている壊れ方は**冷たいインスタンスの初回に GAS がこける**ときだけ。
手元にキャッシュが1件も無いので、そこしか行き先がない。
そのとき**9日前の額が豚の貯金箱に出る。**

控えが毎晩新しければ、同じことが起きても**ずれは最大1日**で済む。
直すのは「古さ」であって、落ちる先そのものではない。

## なぜ `goal_migrate.py` を直接ぶら下げないのか

`goal_migrate.py` は**本番の額と1円まで一致しないと、1行も書かずに落ちる。**
これは「間違ったものを控えにしない」ための止め金で、正しい。
**この口はそこを1バイトも変えていない**——書く/書かないを決めるのは
いまも向こうで、こちらは**何回試すかと、落ちたときに赤くするか**だけを決める。

そのまま毎晩ぶら下げると、**投げ銭の直後に走った晩は必ず赤くなる。**
本番は5分ぶん寝かせた値を返す（`FUND_TTL_MS` と CDN）ので、
GAS のほうが先に伸びる。**毎晩赤い見張りは、誰も読まなくなる**（#521）。
そして読まれない赤の中で、本物の赤——「見ている表が本番の元ではない」——が
埋もれる。

だから、この口はこうする:

1. まず1回流す。**書けたら緑**（ふつうの晩はここで終わる）
2. 合わなかったら **`RETRY_WAIT_SEC` おいて、もう1回だけ**。
   本番が寝ているだけなら、ここで追いつく
3. それでも合わなければ **1行も書かずに緑で終える**（warn は残す）。
   控えは前の日のまま——1日古くなるだけで、壊れてはいない
4. **`MISS_LIMIT` 晩続けて書けなかったときだけ赤にする。**
   そこまで続くのは「本番が寝ている」では説明がつかない

## 「何晩続けて書けていないか」を、どこに覚えておくか

**Firestore に札を1枚置く**（`islandGoalHealth/last`）。
`islandDoneruHealth`（`python/doneru_health.py`）と `islandFundHealth` に
合わせた形で、置き場も読み方も同じにしてある。

GitHub Actions 側に覚えさせる道（`actions/cache`・成果物・run の履歴を引く）
も採れるが、どれも**「前の晩がどうだったか」を run の外から引く**ことになる。
キャッシュは7日で消えるし、履歴は API の権限が増える。
**控えの古さを見張る札なのだから、控えと同じところに置く**のがいちばん短い。

    islandGoalHealth/last
      at          この札を書いた時刻（ISO8601 UTC）
      lastOutcome 直近の結果（"ok" / "mismatch"）
      okAt        最後に控えを写せた時刻（ISO8601 UTC）
      okDay       同じものを日本時間の日で（"2026-09-23"）
      missStreak  **続けて書けなかった晩の数**
      missDay     最後に「書けなかった」と数えた日（日本時間）
      missSince   その連続の1晩目（日本時間）

**数えるのは「晩」であって「回」ではない。** 同じ日に2回走っても
`missStreak` は増えない（`missDay` が同じなら数えない）。手で押した回や、
繋ぎ元が2回発火した晩に、3晩ぶんが1日で溜まって赤くなるのを避ける。

**書けた晩に 0 へ戻す。** 戻し忘れると、いつか必ず赤くなって、
そのときには何晩ぶんなのか誰にも分からない。

## 下見（`{}`）では札に触らない

下見は「いま合うか」をその場で見るためのもので、**晩の数え方には入れない。**
待ち時間も置かない（押した人を6分待たせない）。合わなければ warn で緑。

## ログに出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**この口からは額も鍵も1文字も出さない。** 出すのは、合ったかどうか・
何晩続けて書けていないか・日付だけ。
（`goal_migrate.py` 側は合計と目標額を出す。あれは本番の `/island-api/fund`
が誰にでも返している値で、向こうの頭に理由が書いてある。**鍵は向こうも
出さない**。）

## 使いかた

ワークフロー「豚の貯金箱の控えを写す」から。手で回すなら:

    cd python/admin
    ARGS='{}'              python goal_backup.py   # 下見（1行も書かない）
    ARGS='{"apply": true}' python goal_backup.py   # 写す

終了コード 0=写せた／書かずに緑 / 1=**赤**（3晩続けて書けない、または
控えが壊れている）。

## 対照（`BREAK=`）

`BREAK=retry|green|streak|reset|sameday` を渡すと守りを1つだけ外せる。
見張り（`goal_backup_selftest.py`）が、外すたびに**その足だけ**が落ちることを
実測する。ふだんは空。
"""

import os
import sys
import time
from datetime import datetime, timedelta, timezone

from _fs import args, db, log

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import goal_migrate as gm  # noqa: E402

# 札の置き場。**画面からは読めない**（`islandDoneruHealth` と同じ扱い）。
COLLECTION = "islandGoalHealth"
DOCUMENT = "last"

# 何晩続けて書けなかったら赤にするか。
# 1晩・2晩は「本番がまだ寝ている」で説明がつく（配信のあった晩の翌朝など）。
# 3晩続くと、控えは**3日ぶん古い**——#604 が残した「冷たい初回に GAS がこける」
# を引いたときの落差がそこまで開く前に、人に見てもらう。
MISS_LIMIT = 3

# 合わなかったときに、もう1回試すまでの待ち。
# 本番は `FUND_TTL_MS`（5分）＋ CDN ぶん寝かせた値を返すので、**5分より長く**取る。
# 6分にしてあるのは、5分ちょうどだと境目に当たった回が毎晩そのまま落ちるから。
RETRY_WAIT_SEC = 360

# 日本時間。晩を数える境目をここに合わせる（取り込みは日本時間の朝に走る）
JST = timezone(timedelta(hours=9))

# 対照で抜ける足
LEGS = ("retry", "green", "streak", "reset", "sameday")


def broken(leg: str) -> bool:
    """いまその足を抜いているか。`BREAK=` で渡す。ふだんは空。

    Args:
        leg: 足の名前

    Returns:
        抜いていれば True
    """
    b = (os.getenv("BREAK") or "").strip()
    if b and b not in LEGS:
        raise SystemExit(f"BREAK に使えるのは {', '.join(LEGS)} だけです: {b}")
    return b == leg


def jst_day(now: datetime) -> str:
    """日本時間の日（"2026-09-23"）。

    Args:
        now: いまの時刻（timezone つき）

    Returns:
        日本時間の日付
    """
    return now.astimezone(JST).strftime("%Y-%m-%d")


def utc_iso(now: datetime) -> str:
    """ISO8601 の UTC（`islandDoneruHealth` と同じ形）。

    Args:
        now: いまの時刻（timezone つき）

    Returns:
        "2026-09-23T03:30:00Z"
    """
    return now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_note(client) -> dict:
    """いまの札を読む。無ければ空の辞書。

    Args:
        client: Firestore クライアント

    Returns:
        札の中身
    """
    snap = client.collection(COLLECTION).document(DOCUMENT).get()
    if not snap.exists:
        return {}
    return dict(snap.to_dict() or {})


def save_note(client, note: dict) -> None:
    """札を書く。

    **まるごと置き換える（merge しない）。** 書くのはこの口だけなので、
    残しておきたい欄は `note` が全部持っている。merge にすると
    「連続が切れたので消したい欄」（`missSince`）が消えず、
    **次に1晩落ちたときに古い日付が復活して、何晩ぶんなのか読み違える。**
    `islandDoneruHealth` も同じく置き換えで書いている。

    Args:
        client: Firestore クライアント
        note: 札の中身
    """
    client.collection(COLLECTION).document(DOCUMENT).set(note)


def clear(note: dict, now: datetime) -> dict:
    """写せた晩の札。**連続を 0 に戻す。**

    Args:
        note: いまの札
        now: いまの時刻

    Returns:
        書き込む札
    """
    out = dict(note)
    out.update({
        "at": utc_iso(now),
        "lastOutcome": "ok",
        "okAt": utc_iso(now),
        "okDay": jst_day(now),
        "missStreak": 0,
    })
    # 連続が切れたので、いつから続いていたかは要らない。
    # **残すと、次に1晩落ちたときに古い日付が復活して読み違える**
    out.pop("missSince", None)
    out.pop("missDay", None)
    if broken("reset"):
        # 対照: 書けた晩に連続を戻さない（いつか必ず、理由のない赤になる）
        out["missStreak"] = int(note.get("missStreak") or 0)
    return out


def bump(note: dict, now: datetime) -> dict:
    """書けなかった晩の札。**同じ日に2回走っても増やさない。**

    Args:
        note: いまの札
        now: いまの時刻

    Returns:
        書き込む札
    """
    day = jst_day(now)
    streak = int(note.get("missStreak") or 0)
    same_day = note.get("missDay") == day and not broken("sameday")
    if not same_day:
        streak += 1
    out = dict(note)
    out.update({
        "at": utc_iso(now),
        "lastOutcome": "mismatch",
        "missStreak": streak,
        "missDay": day,
    })
    out.setdefault("missSince", day)
    return out


def attempt(apply: bool) -> int:
    """`goal_migrate` を1回流す。**判断は向こうのまま。**

    ここは ARGS を渡し直すだけ。書く／書かないの止め金は
    `goal_migrate.main()` が持っている。

    Args:
        apply: 書く回なら True

    Returns:
        `goal_migrate` の終了コード（0 / 1 / `gm.EXIT_MISMATCH`）
    """
    keep = os.environ.get("ARGS")
    os.environ["ARGS"] = '{"apply": true}' if apply else "{}"
    try:
        return gm.main()
    finally:
        if keep is None:
            os.environ.pop("ARGS", None)
        else:
            os.environ["ARGS"] = keep


def main(now=None, sleep=None, client=None) -> int:
    """エントリポイント。

    Args:
        now: いまの時刻を返すもの（見張りが差し替える）
        sleep: 待つもの（見張りが差し替える）
        client: Firestore クライアント（見張りが差し替える）

    Returns:
        0=写せた／書かずに緑 / 1=赤
    """
    a = args()
    apply = bool(a.get("apply", False))
    now = now or (lambda: datetime.now(timezone.utc))
    sleep = sleep or time.sleep

    # ---- 1回目 ----
    code = attempt(apply)

    # 合わなかった回だけ、もう1回。**それ以外の落ちかたは、その場で赤。**
    # （表が読めない・鍵の形が違う・書いたあとがずれている。どれも
    #  数分おいて直るものではないので、待つだけ無駄で、しかも赤くしたい）
    if code == gm.EXIT_MISMATCH and apply and not broken("retry"):
        log.warning(
            "本番の額と合いませんでした。**1行も書いていません。**"
            "本番は5分ぶん寝かせた値を返すので、%d 秒おいてもう1回だけ試します",
            RETRY_WAIT_SEC,
        )
        sleep(RETRY_WAIT_SEC)
        code = attempt(apply)

    if code not in (0, gm.EXIT_MISMATCH):
        log.error(
            "控えを写せませんでした（終了コード %s）。"
            "**合わなかったのとは違う落ちかたです**"
            "（表が読めない／鍵の形が違う／書いたあとがずれている）。"
            "札は書き替えません",
            code,
        )
        return 1

    # ---- 下見は、晩の数え方に入れない ----
    if not apply:
        if code == 0:
            log.info("下見: いまの本番と1円まで合っています（1行も書いていません）")
        else:
            log.warning(
                "下見: いまの本番とは合いません（1行も書いていません）。"
                "投げ銭の直後なら数分おいてもう一度"
            )
        return 0

    fs = client or db()
    note = load_note(fs)
    before = int(note.get("missStreak") or 0)

    # ---- 写せた ----
    if code == 0:
        save_note(fs, clear(note, now()))
        if before:
            log.info("控えを写しました（%d 晩ぶりに書けました）", before + 1)
        else:
            log.info("控えを写しました")
        return 0

    # ---- 2回とも合わなかった ----
    note = bump(note, now())
    save_note(fs, note)
    streak = int(note["missStreak"])
    if streak < MISS_LIMIT and not broken("green"):
        # **赤くしない。** 控えは前の晩のまま——1日古くなるだけで壊れてはいない。
        # ここを赤にすると、投げ銭のあった晩は毎回赤くなり、読まれなくなる（#521）
        log.warning(
            "2回とも本番の額と合いませんでした。**1行も書いていません。**"
            "控えは前の晩のままです（続けて書けていない晩: %d / %d）",
            streak, MISS_LIMIT,
        )
        return 0

    if broken("streak"):
        # 対照: 何晩続いても赤くしない（古い控えのまま、誰も気づかない）
        return 0
    log.error(
        "**%d 晩続けて控えを写せていません**（%s から）。"
        "控えはその日数ぶん古いままです。"
        "本番が寝ているだけなら、ここまで続きません。"
        "**見ている GAS の表が、本番の元ではなくなっているかもしれない**",
        streak, note.get("missSince") or "（不明）",
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
