"""**何を取って、何を取らないか。1件ずつ理由つき。**

## 決め方

取るのは「失ったら取り戻せないもの」だけ。3つに分けて考える。

1. **人が書いたもの** — 視聴者さんの付箋・企画・旅の日記・あやとが手で紐付けた
   対応表。**どこからも作り直せない。** 必ず取る
2. **機械が焼き直せるもの** — 毎晩 BigQuery から作り直しているもの。
   **取らない。** 一晩で戻るものに毎晩の代金を払わない
3. **外から二度と取れないもの** — `chat_messages`。YouTube のアーカイブが
   消えたら終わり。重いが取る（増えたぶんだけ）

## 「念のため全部」にしない

`islandChannels` は 2,260件で Firestore の書類の6割を占めるが、
`python/island_channels.py` が**毎晩ぜんぶ作り直している。** 取っても
一晩で同じものが戻るだけなので、取らない。

## 知らない入れ物が出てきたら

**取る。そして知らせる。** 分類していないものを黙って落とすと、
新しく作った入れ物が誰にも気づかれないまま退避から漏れる。
「分類し忘れ」で失うより、余分に取るほうが安い（Firestore は全部で 1MB）。
"""

# ---------------------------------------------------------------- Firestore

# **取る。** 名前 → なぜ取るか
KEEP = {
    "islandNotes": "視聴者さんの書いた字（付箋）。どこからも作り直せない",
    "islandIdeas": "視聴者さんの書いた字（企画の種）。#162 で付箋へ移したあとも印を付けて残す決め",
    "islandStreamEvent": "企画。視聴者さんの提案が入っている。人の字",
    "islandNextPlans": "旧の企画。#288 の 2-d で移し切れていないので、まだ人の字が残っている",
    "islandPolls": "問いと票。人が立てた問い",
    "islandDonors": "どねID ↔ YouTube の対応表。**あやとが手で紐付けたもの。**人の作業は戻らない",
    "islandUsers": "名前と写真を出してよいという本人の意思表示。**同意は作り直せない**（鍵は作り直せる）",
    "island": "あやとが手で書く「いまどこ」。旅のあいだ毎日変わる",
    "nordicLog": "旅の日記。**人しか書けない。旅の17日で毎日増える**",
    "islandStreamEventImage": "写真の実体への参照。これが無いと、置き場に実体があっても辿れない",
    "nordicPhotos": "同上の旧。#288 の 2-c でまだ読んでいる",
    "islandTips": (
        "投げ銭の台帳。BigQuery から作り直せる**ことになっている**が、"
        "毎晩の再実行は7日ぶんだけで、しかも islandDonors の紐付けを通す。"
        "**お金の記録を「たぶん戻る」に賭けない**"
    ),
    "islandFundSuperChats": (
        "豚の貯金箱のスパチャの控え。**手で入れたぶん（`manual-…`）と、GAS から"
        "移した16件が混ざっている。** BigQuery から作り直せるのは片方だけで、"
        "**しかもその BigQuery 側が YouTube 側のバグで消えることがある**"
        "（あやとの言・2026-09-11）。消えたら「いくら集まったか」が分からなくなる"
    ),
    "islandFundSpends": "貯金箱から出したお金。**あやとが手で入れる。**どこからも作り直せない",
    "islandFundGoals": "貯金箱の目標。人が決めた数字",
    "islandVisits": "1日1書類の訪問者数。**BigQuery から出せない**（#291 の実測）。過去は数え直せない",
    "islandHearts": "誰が押したかの重複よけ。失うと押し直せて、付箋のハートの数が壊れる。31件しかない",
    "islandPollVotes": "同上（票の重複よけ）",
}

# **取らない。** 名前 → なぜ取らないか
SKIP = {
    "islandChannels": (
        "**毎晩ぜんぶ作り直している**（python/island_channels.py の「2,243人いる。"
        "毎日ぜんぶ書き直すと〜」）。一晩で戻る。**書類の6割がこれ**"
    ),
    "islandCards": "islandTips × islandStreamEventImage からの導出（python/island_cards.py）。焼き直せる",
    "nordicDays": "#202 で islandTips へ移した旧。もう読んでいない（islandApi.ts:100）",
    "islandRate": "その日限りの回数カウンタ。日付が変わればどのみちリセットされる（#291 の 3-a）",
    "islandRemote": "遠隔操作のつなぎ。その場限り",
    "rouletteSessions": "ルーレット1回ぶん。その場限り",
    "monthlyReview": "OBS 同期のその場限り。次の月末配信で作り直る",
    "streamChatHealth": "取り込みの健康状態。次の晩に戻る",
    "islandFundHealth": "毎晩の掃除が通ったかの札（`last` 1書類）。次の晩に書き替わる",
    # **自分が置いた札を、自分で取らない。** 取ると、退避の中に
    # 「その退避が通ったか」が入る入れ子になって、読むときに混乱する
    "islandBackupHealth": "この退避そのものの札（`last` 1書類）。次の晩に書き替わる",
    "islandHere": "いま島にいる人。60秒で消える入れ物",
    "islandVotes": "#171 で口を畳んだ。本番に0件（collection_drop.py の DEAD）",
    "islandDrafts": "本番に0件。入れ物そのものが無い",
    "streamChatMessages": "配信中だけ溜める。翌日 BigQuery の chat_messages に入る",
    "streamChatRuns": "配信1本ぶんの栞。配信が終われば用済み",
}

# ---------------------------------------------------------------- BigQuery

# 名前 → (取り方, なぜ)
#   "inc"  … 増えたぶんだけ（ingested_at を栞にする）
#   "full" … 毎回まるごと（小さいので分ける意味が無い）
BQ = {
    "chat_messages": (
        "inc",
        "**外から二度と取れない。** 配信のアーカイブが消えたら終わり。"
        "135,427行 / 161MB。**JSON にすると 269MB あるので、まるごとは毎晩取らない。**"
        "追記しかされない表（MERGE の鍵が video_id + event_id）で、"
        "取り込んだ時刻 ingested_at が1行ずつ入っているので、そこを栞にできる。"
        "直近の増えかたは1晩 450〜800行（1.7MB）",
    ),
    "doneru_donations": (
        "full",
        "974行 / JSON 676KB。Doneru の口から取り直せるが、**どこまで遡れるかの保証が無い。**"
        "まるごとでも1MB を切るので分けない",
    ),
    "videos": (
        "full",
        "763行 / JSON 292KB。動画そのものは YouTube から引き直せるが、"
        "**取り込みのリトライ状態（last_error_code・次にいつ試すか）は引き直せない。**"
        "事故のあと取り込みを再開するのに要る",
    ),
    "doneru_ingest_runs": (
        "full",
        "14行 / 2KB。**cookie のセッションが何日持ったかの記録**（python/config.py）。"
        "過ぎた時間は測り直せない。ただ同然なので取る",
    ),
}

# ---------------------------------------------------------------- 置き場

# 旅の写真の実体。**増えたぶんだけ。**
#
# パスに書類IDが入っていて、貼り直しでも上書きしない作り（islandApi.ts の
# `nordic/photos/<日>/<id>.<拡張子>`・cacheControl は immutable）。
# **一度置かれた実体は変わらない**ので、まだ写していないものだけ写せばよい。
# 毎晩まるごと写すと、17日目には17日ぶんを17回写すことになる。
PHOTO_BUCKET_SUFFIX = ".firebasestorage.app"
PHOTO_PREFIX = "nordic/photos/"


def classify(name: str) -> tuple[bool, str, bool]:
    """コレクション名 → (取るか, 理由, 分類済みか)。"""
    if name in KEEP:
        return True, KEEP[name], True
    if name in SKIP:
        return False, SKIP[name], True
    # 分類していないものは取る。取りこぼすより余分に取るほうが安い
    return True, "**まだ分類していない入れ物。** 取りこぼさないよう取ってある", False
