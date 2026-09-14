"""その日のあやと島カードに、この人が候補として出てこないのはなぜかを引く。

    ARGS='{"day":"2026-09-12"}' python python/admin/card_why.py

## 何を出すか

1人1行の表と、まとめの数字だけ。行の頭は**指紋**（`#a3f9`）で、
同じ人は同じ字になるので「この行とこの行は同じ人」までは追える。
残りは件数と yes / no しかない。

    #a3f9  tips=1  card=yes  chat_paid=2  chat_all=17  char=yes
    #7b21  tips=1  card=NO   chat_paid=1  chat_all=4   char=no

## 何を出さないか

**公開の場（`GITHUB_ACTIONS`）では、素のチャンネルIDを1文字も出さない。**
名前・ハンドル・チャット本文・金額は、**公開かどうかに関わらず1文字も出さない**
（読みもするが、数えるためだけに使って捨てる）。指紋にするのは
`python/logsafe.py` の `mask()` で、手元で回したときだけ素の値が出る。

素が出る／出ないの分かれ目は `--dry-run` ではなく **`GITHUB_ACTIONS`** ひとつ。
dry-run を Actions から回してもログは公開のまま残るから（`logsafe` の頭）。

## 何を見ているか

カードの「だれを入れますか」の候補は `functions/src/streamEvents.ts` の
`channelsOfDay()` が返す。中身は **`islandTips` をその日で引いて `channelId` を
集めるだけ**で、`if (c) out.add(c)` なので **`channelId` が空の行は黙って落ちる。**

落ちるのはたいてい Doneru の寄付。`python/island_tips.py` は Doneru の行を
`islandDonors`（どねID → ハンドルの対応表）を通してからチャンネルIDに直すので、
**紐付いていない人は `channelId: null` のまま台帳に入る。** 台帳には居るのに
カードは渡らない、という形になる。

もう1つの外れ方が **BigQuery の遅れ**。台帳は BigQuery の `chat_messages` /
`doneru_donations` から作るが、取り込みは前の晩まで。当日ぶんは Firestore の
`streamChatMessages`（`collectLiveChat` が5分おきに溜めている）にしか無い。
だから **`chat_paid` が立っているのに `tips=0`** なら、それは紐付けの話ではなく
「まだ台帳に来ていない」ほう。

| 列 | 何 |
| --- | --- |
| `tips` | その日の `islandTips` に、その人の行が何件あるか |
| `card` | カードの候補に入るか（＝`tips` が1件以上。`channelsOfDay` と同じ条件） |
| `chat_paid` | その日の `streamChatMessages` のうち、有料の行（スパチャ・ステッカー・メンバー） |
| `chat_all` | その日の `streamChatMessages` のうち、その人の行の総数 |
| `char` | `islandCharacter` にその人がいるか |

行に並ぶのは、その日の `streamChatMessages` に出てくる人と、その日の
`islandTips` に出てくる人の**和集合**。`tips=0` の人は前者だけに居た人で、
`chat_all=0` の人は台帳にだけ居た人（＝配信中に何も書かなかった投げ銭）。

## 1バイトも書かない

`_fs.readonly()` で包んだクライアントしか触らない。書く口を叩いたら
その場で `ReadOnly` で止まる。

## 手元で振る舞いを確かめる

`python/admin/card_why_selftest.py`（偽の Firestore。資格情報も要らない）。
"""

import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, need, readonly  # noqa: E402
from logsafe import mask  # noqa: E402

# 日本時間。配信日の境目はここ（`python/island_tips.py` の `jst_day` と同じ）。
# 日本は夏時間を持たないので固定でよい
JST = timezone(timedelta(hours=9))

DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# `collectLiveChat` が溜める `kind` のうち、**お金かメンバーシップが動いたもの。**
# ふつうのコメント（`textMessageEvent`）と、配信の終わりやモデレーションの
# 知らせ（`chatCapture.ts` の `NOISE`。そもそも溜まらない）はここに入らない
PAID_KINDS = frozenset({
    "superChatEvent",
    "superStickerEvent",
    "newSponsorEvent",
    "memberMilestoneChatEvent",
    "membershipGiftingEvent",
    "giftMembershipReceivedEvent",
})


def is_paid(kind) -> bool:
    """この `kind` は有料の行か。

    表に載っていない名前も拾う。YouTube はメンバーシップまわりの種別を
    あとから増やすことがあって、そのたびここが黙って 0 を返すと
    **「その人は何もしていない」に見えてしまう。**
    `sponsorOnlyModeStartedEvent` のような紛らわしい名前は `chatCapture.ts` が
    溜める手前で捨てているので、ここまで来ない。

    Args:
        kind: `streamChatMessages` の `kind`

    Returns:
        有料の行なら True
    """
    k = str(kind or "")
    if k in PAID_KINDS:
        return True
    low = k.lower()
    return "member" in low or "sponsor" in low


def clean(v) -> str:
    """`functions/src/streamEvents.ts` の `clean(v, 64)` と同じ落とし方。

    **本番と同じ手で落とす**ために写してある。ここで空になる行が、
    `channelsOfDay` の `if (c)` で落ちている行そのもの。
    """
    return v.strip()[:64] if isinstance(v, str) else ""


def jst_range(day: str) -> tuple:
    """その日の日本時間 0時から翌0時までを、ミリ秒で返す。

    `islandTips` は `day` という字を持っているが、`streamChatMessages` は
    時刻（`at`。ミリ秒）しか持っていない。**同じ日の切り方で数えないと、
    台帳とチャットで別の日を見比べることになる。**

    Args:
        day: YYYY-MM-DD

    Returns:
        (始まり, 終わり)。終わりは含まない
    """
    d0 = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=JST)
    return int(d0.timestamp() * 1000), int((d0 + timedelta(days=1)).timestamp() * 1000)


def name_norm():
    """名前をそろえる決まりを**借りてくる。**

    同じ決まりの実装は既に2つある（`characters_migrate.py` の `norm` と
    `app/alertbox/matching.utils.ts` の `normalizeName`）。3つ目を書くと、
    片方だけ直した日に**ここだけが人違いを始める。**

    借りられなければ諦めて、チャンネルIDだけで当てる。`char` が実際より
    少なく出るので、そのことはまとめに書く（黙って少なく出すと、
    「キャラクターが無い」と読み違える）。

    Returns:
        名前をそろえる関数。借りられなければ None
    """
    try:
        from characters_migrate import norm

        return norm
    except Exception as e:  # noqa: BLE001
        log.info("名前で当てるぶんは使えません（%s）", type(e).__name__)
        return None


def characters(client) -> tuple:
    """`islandCharacter` から、当てるための鍵だけ取る。

    **絵も名前も持ち帰らない**（`select` で欄を絞る）。要るのは
    「その人が居るか」だけなので、余計なものを手元に置かない。

    Args:
        client: 読むだけの Firestore クライアント

    Returns:
        (チャンネルIDの集合, 引くための鍵の集合)
    """
    ids, keys = set(), set()
    q = client.collection("islandCharacter").select(
        ["channelId", "channelKeys", "lookupKeys"]
    )
    for d in q.stream():
        v = d.to_dict() or {}
        c = clean(v.get("channelId"))
        if c:
            ids.add(c)
        for field in ("channelKeys", "lookupKeys"):
            for k in v.get(field) or []:
                if isinstance(k, str) and k:
                    keys.add(k)
    return ids, keys


def blank() -> dict:
    """1人ぶんの数え箱。

    `names` は**数えるためだけに持つ。**（キャラクターを名前で当てるのに要る）
    表にも、まとめにも、1文字も出さない。
    """
    return {"tips": 0, "chat_paid": 0, "chat_all": 0, "names": set()}


def collect(client, day: str) -> dict:
    """その日ぶんを数える。**1バイトも書かない。**

    Args:
        client: 読むだけの Firestore クライアント
        day: YYYY-MM-DD

    Returns:
        表とまとめに要る数字ひとそろい
    """
    per: dict = {}

    # --- 台帳（`channelsOfDay` が見ているもの） ---------------------------
    # 企画の `videoIds` から拾うぶんは足さない。**あれは人が手で足した
    # 逃げ道**（0時をまたいだ後半）で、足されていない日に候補が増えて
    # 見えると「日付で引けている」と読み違える
    tips_total = tips_blank = 0
    for d in client.collection("islandTips").where("day", "==", day).stream():
        v = d.to_dict() or {}
        tips_total += 1
        c = clean(v.get("channelId"))
        if not c:
            # ここが `channelsOfDay` の `if (c)` で落ちている行
            tips_blank += 1
            continue
        row = per.setdefault(c, blank())
        row["tips"] += 1
        n = (v.get("displayNameSnapshot") or "").strip()
        if n:
            row["names"].add(n)

    # --- 配信中に溜めたぶん（BigQuery がまだ持っていない当日ぶん） -------
    # 同じ欄への範囲2つなので**単一フィールドの索引で足りる。**
    # 複合索引は作れない（#168）ので、ここに2つ目の欄を足さないこと。
    # `at` が 0 の行（時刻を持たない）は落ちる。どの日のものか決めようがない
    t0, t1 = jst_range(day)
    chat_total = chat_blank = 0
    q = (
        client.collection("streamChatMessages")
        .where("at", ">=", t0)
        .where("at", "<", t1)
    )
    for d in q.stream():
        v = d.to_dict() or {}
        chat_total += 1
        c = clean(v.get("channelId"))
        if not c:
            chat_blank += 1
            continue
        row = per.setdefault(c, blank())
        row["chat_all"] += 1
        if is_paid(v.get("kind")):
            row["chat_paid"] += 1
        n = (v.get("name") or "").strip()
        if n:
            row["names"].add(n)

    # --- キャラクターが居るか --------------------------------------------
    ids, keys = characters(client)
    norm = name_norm()
    for c, row in per.items():
        hit = c in ids
        if not hit and norm:
            hit = any(norm(n) in keys or norm(n.lstrip("@")) in keys
                      for n in row["names"])
        row["char"] = hit
        row["card"] = row["tips"] > 0

    return {
        "day": day,
        "per": per,
        "tips_total": tips_total,
        "tips_blank": tips_blank,
        "chat_total": chat_total,
        "chat_blank": chat_blank,
        "cards": sum(1 for r in per.values() if r["card"]),
        "by_name": norm is not None,
    }


def lines(res: dict) -> list:
    """表とまとめを、そのまま流せる行にする。

    **出す字を作るのはここ1か所だけ。** 呼ぶ側に「この値は出してよいか」を
    書かせると、書き忘れた1か所から漏れる（`logsafe` の `detail_lines` と同じ考え）。

    Args:
        res: `collect()` が返したもの

    Returns:
        流す行の一覧
    """
    out = []
    # 指紋で並べる。**件数順にしない。** 多い人から並べると、
    # 「いちばん上が誰か」が回すたびに変わって、前の回と見比べられない
    rows = sorted(
        ((mask(c), r) for c, r in res["per"].items()), key=lambda x: x[0]
    )
    for key, r in rows:
        out.append(
            f"{key}  "
            + f"tips={r['tips']}".ljust(8)
            + ("card=yes" if r["card"] else "card=NO").ljust(10)
            + f"chat_paid={r['chat_paid']}".ljust(13)
            + f"chat_all={r['chat_all']}".ljust(14)
            + ("char=yes" if r["char"] else "char=no")
        )
    out.append("")
    out.append(f"[まとめ] {res['day']}")
    out.append(
        f"  islandTips         {res['tips_total']:>6}件"
        f"（うち channelId が空 {res['tips_blank']}件 ＝ カードが渡らない行）"
    )
    out.append(
        f"  streamChatMessages {res['chat_total']:>6}件"
        f" / {sum(1 for r in res['per'].values() if r['chat_all']):>4}人"
        f"（うち channelId が空 {res['chat_blank']}件）"
    )
    out.append(f"  カードの候補       {res['cards']:>6}人")
    out.append(f"  表に並んだ人       {len(res['per']):>6}人")
    if not res["by_name"]:
        out.append("  ※ char はチャンネルIDだけで当てています（実際より少なく出ます）")
    return out


def run(client, day: str) -> int:
    """数えて、流す。

    Args:
        client: 読むだけの Firestore クライアント
        day: YYYY-MM-DD

    Returns:
        終了コード。**数字を見に来る道具なので、中身が何であれ 0**
    """
    for line in lines(collect(client, day)):
        # `log` ではなく `print`。log は stderr へ出るので、表と混ぜると
        # Actions のログで行の順が崩れて、表として読めなくなる
        print(line)
    return 0


def main() -> int:
    a = args()
    (day,) = need(a, "day")
    day = str(day).strip()
    if not DAY_RE.match(day):
        log.error("day は YYYY-MM-DD で渡してください: %r", day)
        return 1
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        log.error("day がその形の日付になっていません: %r", day)
        return 1
    return run(readonly(db()), day)


if __name__ == "__main__":
    sys.exit(main())
