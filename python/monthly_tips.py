"""月末配信の投げ銭ランキングを組む。**外に出ない。数えるだけ。**

BigQuery も Firestore も自分では開かない。行を渡されて、名寄せして、
`fund_box.viewer_yen()` で貢献額にして、順位を付けて返すだけ。
本番の値を作るのは `python/admin/monthly_tips_run.py`。
（台帳を読む口 `read_ledger()` だけは、**開いたクライアントを渡されたときに**
読む。月末と実額の表 `admin/tips_sealed.py` が同じ1本を通すため）

## ランキングに出る額は「貢献額」

あやとの言葉（2026-09-26）:

> ランキングの仕様 = 豚の貯金箱の仕様 = いくら配信の企画や
> 私の夢への応援に貢献してくれたか。……で、今回の投げ銭目標は
> 「北欧周りたい」で、ランキングの表彰はそれに貢献してくれた人を
> 表彰します。なので当然スパチャは÷２です。
> **実額は視聴者には一切見せない仕様整理です。**

だから式は `fund_box.viewer_yen()` ひとつ。**ここで割り算を書かない。**
2026-09 の授賞式は実額のまま出して、1位が入れ替わっていた
（`docs/island-misses.md` #191）。

## 円以外のスパチャも入る（#951）

**円に直した額で足す。** 直すのは取り込みのとき1回きりで
（`python/island_tips.py` の `yen_of`）、ここは台帳（`islandTips`）に
入っている `amountJpy` を読むだけ（`fx_rate.row_yen()`）。
**集計のたびに引き直さない**——同じ投げ銭が焼いた日によって別の額になり、
図鑑（`python/build_residents.py`）と順位が割れる。

**直っていない行は足さない。0 にもしない。** そのぶんは `fx_stuck()` が
名指しで返して、呼ぶ側がログに出す。

## 名寄せは図鑑（islandCharacter）が正

**名前の似ている度合いでは当てない。** 当てるのは2つだけ。

| 出どころ | 引く鍵 | 当てる欄 |
| --- | --- | --- |
| スパチャ | `author_channel_id` | `islandCharacter.channelId` |
| Doneru | 名乗り（`normKey` 済み） | `islandCharacter.lookupKeys` |
| 島の投げ銭 | 台帳の `channelId`（口が `islandUsers` から引いたもの） | `islandCharacter.channelId` |

**島の投げ銭はスパチャと同じ側で寄せる**（`docs/island-money.md` 3章）。
YouTube のチャンネルを結んだ人しか投げられないので、名乗りで当てる段が無い。
図鑑に当たらなくても、**同じチャンネルのスパチャとは1行にまとまる**
（同じ鍵 `("s", channelId)` に落ちる）。

Doneru 側が `lookupKeys` なのは、**アラートボックスと配信中のカードが
同じ欄で引いているから**（`functions/src/cards.ts` の `iconsOf`、
`islandCharacter.ts` の `findBy`）。あだ名を図鑑に入れた人は、
そこで同じキャラクターに落ちる。別の突き合わせ方をここだけ自作すると、
**画面に出ている絵と、ランキングの並びが食い違う。**
2026-09 は自作して、「ひー」が @スカイライン と1人にならなかった。

**ちょうど1人に当たったときだけ寄せる。** 0人でも2人以上でも寄せない
（`findBy` の `limit(2)` と同じ決め方）。呼び名は誰でも同じにできるので、
当てずっぽうで1人選ぶと**別人が公開の面で表彰される。**

寄らなかった人は消さない。**その人ひとりで1行**として残す
（あやと 2026-09-25「名前で突合して合わないなら無視で良い」——
無視するのは突き合わせであって、出してくれた人ではない）。
"""

import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fund_box import SOURCE_ISLAND, viewer_yen  # noqa: E402

# 台帳。**円に直した額（`amountJpy`）と島の投げ銭が入っているのはここだけ**
TIPS = "islandTips"

# 見えない字と異体字セレクタ。**口の `normKey` の写し**
# （`functions/src/islandCharacter.ts`）。向こうを直したらこちらも直す。
_INVISIBLE = "".join(chr(c) for c in (
    0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF,
))
_VARIATION = "".join(chr(c) for c in range(0xFE00, 0xFE10))


def norm_key(v) -> str:
    """引くための鍵の形に直す。**口の `normKey` と同じ順番で。**

    NFKC → 異体字を落とす → 見えない字を落とす → 前後の空白を落とす
    → 続く空白を1つに → 小文字。

    **空白は残す**（潰さない）。潰しているのは OBS の Collator だけで、
    Doneru が通る道には無い（`functions/src/islandCharacter.ts` の
    `channel_alias` の項）。

    Args:
        v: 打たれた名前

    Returns:
        鍵。空なら空文字
    """
    if not isinstance(v, str):
        return ""
    s = unicodedata.normalize("NFKC", v)
    for ch in _VARIATION + _INVISIBLE:
        s = s.replace(ch, "")
    return " ".join(s.split()).lower()


class Roster:
    """図鑑（`islandCharacter`）の写し。**引くだけ。**

    `channelId` と `lookupKeys` の2つの引き方を持つ。どちらも
    **ちょうど1人のときしか答えない**（`findBy` の `limit(2)` と同じ）。
    """

    def __init__(self, chars):
        """図鑑の書類から引き表を作る。

        Args:
            chars: `{"id", "channelId", "channelName", "lookupKeys"}` の並び
        """
        self.by_id = {}
        self._ch = {}       # channelId -> [id, …]
        self._key = {}      # lookupKeys の鍵 -> [id, …]
        for c in chars:
            cid = str(c.get("id") or "")
            if not cid:
                continue
            self.by_id[cid] = c
            ch = str(c.get("channelId") or "")
            if ch:
                self._ch.setdefault(ch, []).append(cid)
            for k in (c.get("lookupKeys") or []):
                if isinstance(k, str) and k:
                    self._key.setdefault(k, []).append(cid)

    def by_channel(self, channel_id):
        """チャンネルIDで引く。ちょうど1人のときだけ返す。"""
        got = self._ch.get(str(channel_id or ""), [])
        return got[0] if len(got) == 1 else None

    def by_alias(self, name):
        """名乗りで引く。**`lookupKeys` に完全一致。** 1人のときだけ返す。"""
        k = norm_key(name)
        if not k:
            return None
        got = self._key.get(k, [])
        return got[0] if len(got) == 1 else None


def merge(superchats, doneru, roster, *, island):
    """スパチャと Doneru と島の投げ銭を、同じ人ごとに1行へまとめる。

    **`island` は省略できない**（`fund_box.viewer_yen()` と同じ決め。
    `docs/island-standards.md` 30.4）。島の投げ銭が無い月も `[]` を渡す。
    省略できると、渡し忘れた月に島の投げ銭が黙って順位から消える。

    Args:
        superchats: `{"channelId", "handle", "yen"}` の並び
        doneru: `{"name", "yen"}` の並び（どねIDは見ない。名前で引く）
        roster: `Roster`
        island: 島の投げ銭。`{"channelId", "handle", "yen"}` の並び
            （`island_rows()` が返す形。スパチャと同じ側で寄せる）

    Returns:
        `{"char", "handle", "display", "sc", "dn", "il"}` の並び（順位はまだ無い）
    """
    rows = {}

    def slot(key, handle, display, char):
        r = rows.get(key)
        if r is None:
            r = rows[key] = {
                "char": char, "handle": handle, "display": display,
                "sc": 0, "dn": 0, "il": 0,
            }
        # 図鑑に当たった行が後から来たら、そちらの名前とキャラクターを採る
        if char and not r["char"]:
            r["char"], r["display"] = char, display
        if handle and not r["handle"]:
            r["handle"] = handle
        return r

    def by_channel(s):
        """チャンネルで寄せる行（スパチャと島の投げ銭）の、入れ先。"""
        handle = str(s.get("handle") or "")
        char = roster.by_channel(s.get("channelId"))
        key = ("c", char) if char else ("s", str(s.get("channelId") or handle))
        name = (roster.by_id.get(char, {}).get("channelName") or handle
                if char else handle)
        return slot(key, handle, name, char)

    for s in superchats:
        by_channel(s)["sc"] += int(s.get("yen") or 0)

    # **スパチャと同じ寄せ方**（同じ `by_channel`）。別の当て方を作らない
    for s in island:
        by_channel(s)["il"] += int(s.get("yen") or 0)

    for d in doneru:
        name = str(d.get("name") or "")
        char = roster.by_alias(name)
        # 当たらなければ、その人ひとりで1行。**別の当て方に逃げない**
        key = ("c", char) if char else ("d", norm_key(name) or name)
        shown = roster.by_id.get(char, {}).get("channelName") or name
        slot(key, "", shown, char)["dn"] += int(d.get("yen") or 0)

    return list(rows.values())


def rank(rows):
    """貢献額を出して、多い順に並べて、同額は同じ順位にする。

    **額は `fund_box.viewer_yen()` を通す。** ここで割り算をしない。

    Args:
        rows: `merge()` が返した並び

    Returns:
        `yen` と `rank` の付いた並び（貢献額 0 の人は落とす）
    """
    out = []
    for r in rows:
        # 島の投げ銭は割らない（式の中で足す）。`r["il"]` が無ければ KeyError で
        # 落ちる——`merge()` を通っていない行を黙って 0円 で数えない
        yen = viewer_yen(int(r["sc"]), int(r["dn"]), island_yen=int(r["il"]))
        if yen <= 0:
            continue
        out.append({**r, "yen": yen})
    # 同額の中の並びは名前で決める。**実行するたびに入れ替わらないように**
    out.sort(key=lambda r: (-r["yen"], r["display"]))
    for i, r in enumerate(out):
        r["rank"] = out[i - 1]["rank"] if i and out[i - 1]["yen"] == r["yen"] \
            else i + 1
    return out


def total(rows) -> int:
    """画面に出す合計。**貢献額の足し算。実額の合計ではない。**"""
    return sum(int(r["yen"]) for r in rows)


def read_ledger(client, d0: str, d1: str) -> list:
    """その期間の台帳（`islandTips`）を読む。**読むだけ。**

    **範囲の下だけ Firestore に投げる**（`day` 1本の並べ替えなので、
    自動でできる索引だけで引ける）。上は手元で切る——`build_residents.py` の
    `fetch_tips` と同じ引き方。

    月末（`admin/monthly_tips_run.py`）と実額の表（`admin/tips_sealed.py`）が
    **同じ1本を通す。** 円に直した額（`amountJpy`）と島の投げ銭は、
    台帳にしか無い。

    Args:
        client: 読み専用のクライアント（`admin/_fs.py` の `readonly(db())`）
        d0: 始まりの日（この日を含む）
        d1: 終わりの日（この日を含む）

    Returns:
        1行ずつの辞書
    """
    out = []
    for doc in client.collection(TIPS).where("day", ">=", d0).stream():
        v = doc.to_dict() or {}
        if d0 <= str(v.get("day") or "") <= d1:
            out.append(v)
    return out


def island_rows(ledger) -> tuple:
    """台帳の行から、**島の投げ銭**（`source: island`）を `merge()` の形にする。

    台帳に入っているのは、本番で払われ、いまも `paid` のものだけ
    （`python/island_tips.py` が `fund_box.island_counts()` で絞り、返金や
    払い戻しの請求になったものは外している）。ここでは絞り直さない。

    **額は `fx_rate.row_yen()` を通す**（`docs/island-money.md` 6章。
    `amount` を直に足さない）。島の投げ銭は円だけなので、そのまま返る。

    **足せない行は 0 にしない。** 額が読めない行・チャンネルの無い行は
    `merge()` に渡さず、件数だけ返す（呼ぶ側がログに出す）。

    Args:
        ledger: `read_ledger()` が返した台帳の行

    Returns:
        (`{"channelId", "handle", "yen", "day"}` の並び, 足せなかった件数)。
        `day` は投げた日（日本時間）。`merge()` は見ない。キャラクターの
        洗い出し（`admin/characters_gap.py`）が「最後に投げた日」に使う
    """
    import fx_rate

    out = []
    stuck = 0
    for d in (ledger or []):
        d = d or {}
        if d.get("source") != SOURCE_ISLAND:
            continue
        yen, _why = fx_rate.row_yen(d)
        cid = str(d.get("channelId") or "")
        if yen is None or not cid:
            stuck += 1
            continue
        out.append({"channelId": cid,
                    "handle": str(d.get("displayNameSnapshot") or ""),
                    "yen": int(yen),
                    "day": str(d.get("day") or "")})
    return out, stuck


def standings(superchats, doneru, fx, ledger, roster) -> dict:
    """1つの期間の順位を、**出どころ3つ**から組む。**月末も卓上カレンダーもこの1本。**

    組み方は月末（`admin/monthly_tips_run.py`）が決めたものそのまま:

    1. 円以外のスパチャを台帳の換算に当てる（`fx_detail()`）。直せた行だけ
       円のスパチャと同じ土俵に足す（`fx_superchats()`）。÷2 は `rank()` の
       `viewer_yen()` が**足したあとの合計**にかける
    2. 台帳から島の投げ銭を拾う（`island_rows()`）
    3. 図鑑で名寄せして（`merge()`）、貢献額で並べる（`rank()`）

    **ここ以外で、この順番を組まない。** 卓上カレンダーの上位7人は、前は
    BigQuery の中に式（`DIV(sc, 2) + dn`）ごと写した SQL で数えていて、
    島の投げ銭・円以外のスパチャが入った日にそこだけ抜けた（#1405）。

    Args:
        superchats: 円のスパチャ。`{"channelId", "handle", "yen"}` の並び
        doneru: `{"name", "yen"}` の並び
        fx: 円で始まらないスパチャの行（`fx_detail()` の `fx` と同じ形）
        ledger: 同じ期間の台帳（`read_ledger()` が返した行）
        roster: `Roster`

    Returns:
        `rows`（`rank()` の返り値）・`fx`（`fx_detail()` の返り値）・
        `fx_added`（足した円以外の行）・`fx_stuck`（直っていない行）・
        `island`（足した島の行）・`island_stuck`（足せなかった島の件数）
    """
    fxd = fx_detail(fx, superchats, ledger)
    add = fx_superchats(fxd)
    isl, isl_stuck = island_rows(ledger)
    rows = rank(merge(list(superchats) + add, doneru, roster, island=isl))
    return {"rows": rows, "fx": fxd, "fx_added": add, "fx_stuck": fx_stuck(fxd),
            "island": isl, "island_stuck": isl_stuck}


def currency_of(text) -> str:
    """スパチャの表記（`CA$2.79`）から通貨コードを読む。

    **読み方は `python/island_tips.py` の `CURRENCY_MARKS` ひとつ。**
    ここに表を写すと、新しい通貨が来た日に片方だけ直る。

    取り込みを関数の中に置いてあるのは、あちらが `google.cloud` と
    `config`（`BQ_PROJECT_ID` が要る）を読み込むから。**この文書の頭に
    書いてあるとおり、ここは行を渡されて数えるだけの場所**なので、
    外を読む取り込みを上には置かない。

    Args:
        text: `¥1,000` `CA$2.79` のような表記

    Returns:
        `CAD` のような通貨コード。読めなければ `?`
    """
    from island_tips import parse_amount

    return parse_amount(text)[1] or "?"


def ledger_key(video_id, event_id) -> str:
    """台帳（`islandTips`）の `sourceEventId` を組む。**向こうの写し。**

    組み方は `python/island_tips.py` の `fetch_youtube`（`yt:{動画}:{イベント}`）。
    **当てるのはこの鍵ひとつ。** 日付とチャンネルIDで当てると、同じ人が
    同じ日に2回投げた回にどちらが当たるか決まらない。

    Args:
        video_id: 動画ID
        event_id: スパチャのイベントID

    Returns:
        `yt:xxx:yyy`
    """
    return f"yt:{video_id or ''}:{event_id or ''}"


def fx_detail(fx, superchats, ledger=None) -> list:
    """**円以外のスパチャ**を、台帳の換算と突き合わせて1件ずつ並べる。

    ## なぜ台帳から取るのか（2026-10-18。#951）

    円に直すのは**取り込みのとき1回きり**（`python/island_tips.py` の
    `yen_of`）。集計のたびにレートを引き直すと、同じ投げ銭が**焼いた日に
    よって別の額**になり、図鑑（`python/build_residents.py`）と月末で
    順位が割れる。だから取り出しは `fx_rate.row_yen()` 1本に寄せて、
    **向こうも同じ1本を通す。**

    ## 円のスパチャ（`SQL_SC`）と二重に数えない

    当てるのは `sourceEventId`（`ledger_key()`）。BigQuery の円以外の行と
    台帳の行が1対1で当たるので、**円の行をここから足すことはない。**

    ## 直っていない行は、足さずに名指しする

    台帳に `amountJpy` が無い行（対応していない通貨・口が落ちた日・
    まだ埋め直していない日）は `yen` が None。**0 にしない。**
    足らないぶんが誰のものかは呼ぶ側がログに出す
    （`python/admin/monthly_tips_run.py`。公開の場では指紋）。

    ## 誰だかは、呼ぶ側が伏せる

    `cid` をそのまま持つ。**出すときに伏せるのは呼ぶ側の仕事**で、
    公開の Actions ログでは指紋になる（`python/logsafe.py` の `mask`）。
    元の表記（実額）は公開の場に出さない（`docs/island-money.md` 2章）。

    Args:
        fx: 円で始まらないスパチャの行
            （`cid` / `handle` / `day` / `amt` / `video_id` / `event_id`）
        superchats: 同じ期間の**円の**スパチャ（`merge()` に渡すのと同じ並び）
        ledger: 同じ期間の台帳（`islandTips`）の行。省くと**全件が未換算**

    Returns:
        日付順の並び。1件につき
        `{"cid", "handle", "day", "amt", "currency", "src",
          "yen", "why", "yen_too"}`。
        `yen` は円に直せた額（直っていなければ None）、`why` はその理由の符丁。
        `yen_too` は**同じ期間に円のスパチャも出しているか**
    """
    import fx_rate

    with_yen = {str(s.get("channelId") or "")
                for s in (superchats or []) if s.get("channelId")}
    by_src = {str((d or {}).get("sourceEventId") or ""): (d or {})
              for d in (ledger or [])}
    out = []
    for r in (fx or []):
        r = r or {}
        cid = str(r.get("cid") or "")
        amt = str(r.get("amt") or "")
        src = ledger_key(r.get("video_id"), r.get("event_id"))
        # 台帳に無い行＝取り込みがまだ届いていない。**0 にしない**
        doc = by_src.get(src)
        yen, why = fx_rate.row_yen(doc) if doc else (None, "pending")
        out.append({
            "cid": cid,
            "handle": str(r.get("handle") or ""),
            "day": str(r.get("day") or ""),
            "amt": amt,
            "currency": currency_of(amt),
            "src": src,
            "yen": yen,
            "why": why,
            "yen_too": cid in with_yen,
        })
    # 日付順。**実行のたびに入れ替わらないように**、同じ日は鍵で決める
    out.sort(key=lambda r: (r["day"], r["src"], r["cid"]))
    return out


def fx_superchats(rows) -> list:
    """`fx_detail()` の並びから、**ランキングに足す**スパチャ行を作る。

    足すのは**円に直せて、誰のものか読める行だけ。** 返す形は `SQL_SC` と
    同じ（`merge()` がそのまま食える）ので、**÷2 は `rank()` の
    `viewer_yen()` が円に直したあとの額にかける**——1件ずつ半分にしない
    （`docs/island-money.md` 1章「足してから半分にする」）。

    Args:
        rows: `fx_detail()` の返り値

    Returns:
        `{"channelId", "handle", "yen"}` の並び
    """
    return [{"channelId": r["cid"], "handle": r["handle"], "yen": int(r["yen"])}
            for r in (rows or [])
            if r.get("yen") is not None and r.get("cid")]


def fx_stuck(rows) -> list:
    """`fx_detail()` のうち、**円に直せていない行**だけ。

    ここが空でなければ、その月のランキングは**そのぶん足りない。**

    Args:
        rows: `fx_detail()` の返り値

    Returns:
        同じ形の並び
    """
    return [r for r in (rows or []) if r.get("yen") is None]
