"""1人ぶんを**深く掘る**。候補を増やして issue に貼る（#716）。

    python python/admin/stamp_line_dig.py

## なぜ、これが要るのか

あやと（2026-10-11、#716）:

> ここはまだ悩みたい。**もっとその人の特徴になる候補をいっぱいあげて**
>
> 🐟あおちゃん … もっと候補欲しい。**思いやりのある言葉にしたい。**
> ゆずたつ … **「めっちゃ好きやねん」みたいなのなかったっけ？**

`stamp_line_suggest` をもう一度流しても、**同じ10本しか出ない。**
式（らしさ² × ∛回数 × 短さ）も門（島で4人以上が言っている字は落とす）も
変わっていないので、当たり前に同じ答えが返る。**軸を変えないと増えない。**

**「思いやりのある言葉」は点では出ない。** どの語が思いやりかを機械は
知らないし、表を作れば表の外でまた同じことが起きる（`stamp_line_suggest`
の「禁止ワードを作らない」と同じ理由）。だからここは**広く引いて、
人が読んで選ぶ**ための口にする。選ぶのは機械ではない。

## 何を出すか——**3つの方角から**

| | 何を出すか | 何のため |
| --- | --- | --- |
| **その人だけ** | 島でその人しか言っていない字。**門を外し、1回のものまで** | 厳しくした側。`suggest` は10本で切るので、11本目から下が見えない |
| **ほかの人も言っている字** | 2人以上が言っていて、**その人がいちばん言っている**字 | 緩めた側。門（4人）で落ちているぶんがここに出る |
| **語で探した字** | 渡した語が入っている字 | 「めっちゃ好きやねん」のように、**あやとがうろ覚えで覚えている**ぶん |

3つとも **`stamp_line_pick` の数え上げを使い回す**（`tally` / `gate_of` /
`by_word`）。選び方を2か所に書くと、片方だけ直した日に表と中身が黙って
食い違う。

**書かない。** ここは Firestore に1バイトも置かない——`suggested` を
書き替えてよいのは `stamp_line_suggest` と `stamp_line_arrange` だけで、
掘ったものをそのまま置くと**あやとが見ていない字が提案に出る。**

## 出すもの・出さないもの

**公開の Actions ログには1文字も出さない。** 出すのは件数と
`logsafe.mask()` の指紋だけ。名前とことばの行き先は **issue の本文ひとつ**
（`stamp_line_table` と同じ決め。あやと「名前やコメント出しても問題ない」）。

出さないものも同じ——**金額・順位・それを当てられる数**
（`docs/island-money.md`）。並びは名前順で、点は1つも出さない。

## 名前を `workflow_dispatch` の入力に取らない

誰を掘るかは**名前の並び**なので、それ自体が「選ばれた25人の一部」。
名前で指すときは `repository_dispatch` の `client_payload` だけ
（`workflow_dispatch` の入力は公開のログに出る）。

**そのうえで、名前を1つも渡さずに押せる道をつけてある。**
`who` を省くと、**まだ決まっていない人**——`suggested` が2本以上
残っていて、本人も `lines` を書いていない人——を自分で集める。

決まった人は `stamp_line_arrange` が**1本だけ**置くので、
「2本以上残っている＝まだ決めかねている」が入れ物の中だけで分かる。
**名前を入力に取らずに、決めかねている人だけを掘れる**のがこの道の値打ちで、
`workflow_dispatch` から押せるのもそのため。

`words`（探す語）は**名前ではない**ので、入力に取ってよい。
その語で探した結果は、どのみち issue の表に出る。

入力（`client_payload`。`apply` `issue` `top` `wide` `words` は ARGS でもよい）:
  {}                        … **まだ決まっていない人**をぜんぶ掘る
  {"words": ["好き", …]}    … 掘る人ぜんぶに、同じ語で探す
  {"who": [{"name": "<図鑑の呼び名>",
            "words": ["探す語", …],   … 省くと語では探さない
            "pool": false}],          … 省くと「その人だけ」も出す
   "top": 30, "wide": 15,
   "apply": true, "issue": 716, "comment": 0, "days": 0}
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import db, log, notice  # noqa: E402
from stamp_line_suggest import fold_name, payload  # noqa: E402
from stamp_line_table import (  # noqa: E402
    ISSUE,
    SIGN,
    cell,
    chunks,
    fetch_rows,
    island,
    post,
)

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402
from stamp_line_pick import (  # noqa: E402
    MANY_SPEAKERS,
    MIN_SHARE,
    by_word,
    fold,
    gate_of,
    tally,
    usable,
)

# 1人あたり「その人だけ」を何本出すか。**10本では足りない**と言われた
# ところなので、`suggest` の TOP より厚く取る
TOP = 30

# 1人あたり「ほかの人も言っている字」を何本出すか
WIDE = 15

# 1つの語につき、見つかった字を何本出すか
PER_WORD = 8

# 一度に掘れる人数。**暴走を止める栓**（issue のコメントが長くなりすぎる）。
# **決めかねている人だけを掘る口**なので、25人ぜんぶは入らない値にしてある
MAX_PEOPLE = 20

# 1人につき探せる語の数
MAX_WORDS = 12

# **まだ決めかねている人**の見分け。`suggested` がこの本数以上
# 残っていれば、まだ1本に絞れていない（決めた人は1本だけ置かれる）
MIN_LEFT = 2


def shape_words(v) -> list:
    """掘る人ぜんぶに当てる語。

    Args:
        v: 渡されたもの（`words`。並びか、読点・コンマ区切りの1本）

    Returns:
        語の並び
    """
    if isinstance(v, str):
        v = re.split(r"[,、\s]+", v)
    if not isinstance(v, list):
        return []
    return [x.strip() for x in v
            if isinstance(x, str) and x.strip()][:MAX_WORDS]


def left_of(rows: list, words: list) -> list:
    """**まだ決まっていない人**を、入れ物から集める。

    名前を1つも渡されなかったときの相手。`suggested` が2本以上残って
    いて、本人も `lines` を書いていない人が「まだ決めかねている人」。

    **ここが名前を入力に取らずに済ませる唯一の道。** 名簿を渡すと、
    渡した並びそのものが「選ばれた25人の一部」になる。

    Args:
        rows: `stamp_line_table.fetch_rows()` の結果
        words: 掘る人ぜんぶに当てる語

    Returns:
        `[{"name", "words", "pool"}]`（名前順）
    """
    out = []
    for r in sorted(rows, key=lambda r: (r.get("name") or "￿", r["id"])):
        if not r.get("name") or not r.get("channelId"):
            continue
        if r.get("lines"):
            # **本人が決めている人は掘らない。** 本人の字が勝つので、
            # 候補を増やしても出番が無い
            continue
        if len(r.get("suggested") or []) < MIN_LEFT:
            continue
        out.append({"name": r["name"], "words": list(words), "pool": True})
    return out[:MAX_PEOPLE]


def shape(v) -> list:
    """渡されたものを、掘ってよい形にする。

    **値そのものは返り値にしか出さない。** ここでログに出すと、
    形が変だった名前と語が公開のログに出る。

    Args:
        v: 渡されたもの（`who`）

    Returns:
        `[{"name", "words", "pool"}]`
    """
    out = []
    if not isinstance(v, list):
        return out
    for one in v[:MAX_PEOPLE]:
        if not isinstance(one, dict):
            continue
        name = one.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        words = [x.strip() for x in (one.get("words") or [])
                 if isinstance(x, str) and x.strip()]
        out.append({"name": name.strip(), "words": words[:MAX_WORDS],
                    # 既定は「その人だけ」も出す。元の字を探しに来ただけの
                    # ときは `pool: false` で語の結果だけにする
                    "pool": one.get("pool") is not False})
    return out


def match(who: list, rows: list) -> tuple[list, list]:
    """名前を、**入れ物に居る人に当てる。**

    畳みかたは `stamp_line_suggest.fold_name()`（先頭の `@` と前後の
    空白だけ落とす）。**2か所で別々に書かない。**

    **同じ呼び名が2人に付いていたら、どちらにも当てない**
    （`stamp_line_arrange.by_name()` と同じ決め。片方に寄せると
    他人のことばがその人の表に出る）。

    Args:
        who: `shape()` の結果
        rows: `stamp_line_table.fetch_rows()` の結果

    Returns:
        (当たったもの `[(注文, 入れ物の1件)]`, 当たらなかった名前)
    """
    by: dict = {}
    for r in rows:
        key = fold_name(r.get("name") or "")
        if not key:
            continue
        by[key] = None if key in by else r
    ok, lost = [], []
    for one in who:
        r = by.get(fold_name(one["name"]))
        if not r or not r.get("channelId"):
            # **チャンネルIDの無い人は掘れない。** 数えるものが無い
            lost.append(one["name"])
            continue
        ok.append((one, r))
    return ok, lost


def lines_of(own_one: dict, counts, alone: bool) -> list:
    """その人の言った字を、**門を外して**並べる。

    `pick()` との違いは3つ。**点を付けない**（点を付けて並べると、
    それがそのまま「惜しかった順」になって、門を疑う材料になる）。
    **10本で切らない。** **島のほかの人も言っている字を落とさない。**

    Args:
        own_one: その人の `{鍵: {"n", "d", "raw"}}`
        counts: 島ぜんぶの数え上げ
        alone: `True` なら「その人しか言っていない字」、
            `False` なら「ほかの人も言っているが、その人がいちばん言う字」

    Returns:
        `[{"text", "n", "d", "people", "share"}]`。回数の多い順
    """
    out, seen = [], set()
    for k, slot in (own_one or {}).items():
        _ok, _why, one = gate_of(k, slot, counts)
        if not usable(one["text"]):
            continue
        # **切れ端は出さない。** こちらが剥がして作った字を候補に混ぜると、
        # 「その人が1行まるごとそう打った」と言えなくなる
        if not one["whole"]:
            continue
        if alone:
            if one["people"] > 1:
                continue
        else:
            if one["people"] < 2:
                continue
            # 門で落ちたぶんを見たいので人数は見ないが、**その人のもので
            # ないものは出さない**（`pick` と同じ線）
            if one["share"] < MIN_SHARE:
                continue
        f = fold(one["text"])
        if f in seen:
            continue
        seen.add(f)
        out.append(one)
    # **回数の多い順。** 同じ回数なら日数、そのあとは短いほうが先
    out.sort(key=lambda o: (-o["n"], -o["d"], len(o["text"]), o["text"]))
    return out


def mark(r: dict, text: str) -> str:
    """いま出ている候補なら、そう書く。

    **消さずに印を付ける。** 消すと、あやとが「1番のあれは？」と
    指したときに表から消えていることになる。

    Args:
        r: 入れ物の1件
        text: 字

    Returns:
        印（いま候補でなければ空）
    """
    for i, t in enumerate(r.get("suggested") or []):
        if fold(t) == fold(text):
            return f"いまの{i + 1}番"
    return ""


def one_block(one: dict, r: dict, counts, top: int, wide: int) -> list:
    """1人ぶんの区切り。

    Args:
        one: `shape()` の1件
        r: 入れ物の1件
        counts: `tally()` の結果
        top: 「その人だけ」を何本出すか
        wide: 「ほかの人も言っている字」を何本出すか

    Returns:
        markdown の行の一覧
    """
    own = counts.own.get(r["channelId"], {})
    p = [f"#### {r['emoji']} {cell(r['name'] or '（名前が引けません）')}", ""]

    if one["pool"]:
        got = lines_of(own, counts, alone=True)
        if not got:
            # **0 を「0本のうち0本」と書かない。** 数は合っているのに
            # 読めない字になる（`island-standards` §16）
            p.append("**島でその人しか言っていない字は、1本もありません。**")
            p.append("")
        else:
            p.append(f"**島でその人しか言っていない字**"
                     + (f"（{len(got)}本ぜんぶ）" if len(got) <= top else
                        f"（{len(got)}本のうち、回数の多い {top}本）"))
            p.append("")
            p.append("| | ことば | 回数 | 何日 | |")
            p.append("| --: | --- | --: | --: | :-- |")
            for i, o in enumerate(got[:top]):
                p.append(f"| {i + 1} | {cell(o['text'])} | {o['n']} "
                         f"| {o['d']} | {mark(r, o['text'])} |")
            p.append("")

        wider = lines_of(own, counts, alone=False)
        if wider:
            p.append("**ほかの人も言っているが、その人がいちばん言う字**"
                     + (f"（{len(wider)}本ぜんぶ。" if len(wider) <= wide
                        else f"（{len(wider)}本のうち、回数の多い "
                             f"{wide}本。")
                     + f"島で {MANY_SPEAKERS}人以上のものは、"
                       f"いまの門では落ちています）")
            p.append("")
            p.append("| | ことば | 島で何人 | 回数 | 何日 | |")
            p.append("| --: | --- | :-- | --: | --: | :-- |")
            for i, o in enumerate(wider[:wide]):
                p.append(f"| {i + 1} | {cell(o['text'])} | {o['people']}人 "
                         f"| {o['n']} | {o['d']} | {mark(r, o['text'])} |")
            p.append("")

    if one["words"]:
        p.append("**語で探した字**")
        p.append("")
        for w in one["words"]:
            hit = by_word(w, own, counts, top=PER_WORD)
            if not hit:
                # **探して無かったことを、はっきり書く。** 書かないと
                # 「探していない」と同じに読める
                p.append(f"- 「{cell(w)}」 … **1本もありません**")
                continue
            p.append(f"- 「{cell(w)}」 … " + "／".join(
                f"「{cell(h['text'])}」{h['n']}回"
                + ("" if (h["people"] or 0) <= 1 else f"・島で{h['people']}人")
                + (f"（{m}）" if (m := mark(r, h["text"])) else "")
                for h in hit))
        p.append("")
    return p


def body_of(pairs: list, counts, lost: list, top: int, wide: int) -> str:
    """貼る本文。

    Args:
        pairs: `match()` の1つめ
        counts: `tally()` の結果
        lost: 当たらなかった名前
        top: 「その人だけ」の本数
        wide: 「ほかの人も言っている字」の本数

    Returns:
        markdown
    """
    p = ["## 決めかねている5人ぶん、候補を増やしました", ""]
    p.append("あやと（2026-10-11）:")
    p.append("")
    p.append("> ここはまだ悩みたい。"
             "**もっとその人の特徴になる候補をいっぱいあげて**")
    p.append("")
    p.append("**19人ぶんの決定は入れました。** この表は残りの人だけです。")
    p.append("")
    p.append("### 前と何を変えたか")
    p.append("")
    p.append("同じ式（らしさ² × ∛回数 × 短さ）をもう一度流しても、"
             "**同じ10本しか出ません**。軸を変えました。")
    p.append("")
    p.append("| 出しかた | 何が増えるか |")
    p.append("| --- | --- |")
    p.append("| **島でその人しか言っていない字** | "
             "前は点の高い10本で切っていました。**11本目から下**を"
             "ぜんぶ出します（1回しか言っていないものまで） |")
    p.append(f"| **ほかの人も言っている字** | "
             f"島で {MANY_SPEAKERS}人以上が言っている字は門で落として"
             f"いました。**その人がいちばん言っているもの**だけ"
             f"戻します |")
    p.append("| **語で探した字** | "
             "「めっちゃ好きやねん」のように、**言い方の揺れごと**"
             "探します |")
    p.append("")
    p.append("**点は1つも出していません。** 並びは回数の多い順です"
             "（点の順に並べると、それがそのまま協力の順位表になるので）。")
    p.append("")
    p.append("**こちらで作った字は1本もありません。** ぜんぶ、その人が"
             "1行まるごとそう打った字です。")
    p.append("")
    p.append("### 返しかた")
    p.append("")
    p.append("人ごとに、**何番でいくか／この言い方にしてほしいか**を"
             "書いてください。番号でも、字をそのまま書いてもらっても"
             "引けます。**ここに無い字を思いついたら、それをそのまま"
             "書いてもらうのがいちばん早いです**（1本20字まで）。")
    p.append("")
    for one, r in sorted(pairs, key=lambda x: (x[1]["name"] or "￿",
                                               x[1]["id"])):
        p += one_block(one, r, counts, top, wide)
    if lost:
        p.append(f"> **{len(lost)}人は名前から引けませんでした。** "
                 "表に出ている呼び名のとおりに書いてもらえれば引けます。")
        p.append("")
    return "\n".join(p)


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=掘る相手が1人もいない / 2=入力が足りない /
        3=貼れなかった
    """
    a = payload()
    apply = bool(a.get("apply"))
    issue = int(a.get("issue") or ISSUE)
    comment = int(a.get("comment") or 0)
    days = int(a.get("days") or 0)
    top = int(a.get("top") or TOP)
    wide = int(a.get("wide") or WIDE)

    words = shape_words(a.get("words"))
    who = shape(a.get("who"))
    log.info("渡された相手: %d 人 / ぜんぶに当てる語: %d 語",
             len(who), len(words))

    rows = fetch_rows(db())
    if not rows:
        log.error("`islandStampLine` が空です。"
                  "先に stamp_line_seed を流してください")
        return 1
    if not who:
        # **名前を渡されていないなら、まだ決まっていない人を自分で集める。**
        # 名簿を入力に取らずに済ませる道（`workflow_dispatch` から押せる）
        who = left_of(rows, words)
        log.info("名前が渡されていないので、**まだ決まっていない人**を"
                 "入れ物から集めました: %d 人", len(who))
    if not who:
        log.error("掘る相手がいません（まだ決まっていない人が0人）。"
                  "名前で指すなら client_payload の who に渡してください")
        return 2
    pairs, lost = match(who, rows)
    if lost:
        log.warning("名前から引けなかった %d 人（指紋: %s）",
                    len(lost), " ".join(mask(x, public=True) for x in lost))
    if not pairs:
        log.error("掘る相手が1人も引けませんでした")
        return 1

    bqrows = island(days)
    if not bqrows:
        log.error("コメントが1件も引けませんでした")
        return 1
    # **島ぜんぶを数える。** 「その字を島で何人が言ったか」は、
    # 掘る5人ぶんだけ引いても出ない（門が見ているのがそれ）
    counts = tally(bqrows, who=[r["channelId"] for r in rows
                                if r["channelId"]])

    alone = {r["id"]: len(lines_of(counts.own.get(r["channelId"], {}),
                                   counts, alone=True))
             for _o, r in pairs}
    wider = {r["id"]: len(lines_of(counts.own.get(r["channelId"], {}),
                                   counts, alone=False))
             for _o, r in pairs}
    hits = sum(len(by_word(w, counts.own.get(r["channelId"], {}), counts,
                           top=PER_WORD))
               for o, r in pairs for w in o["words"])
    for _o, r in pairs:
        # **1人ずつ数える。** まとめた数だけだと、1人も掘れていない人が
        # ほかの人の本数に隠れる
        log.info("掘れた（指紋 %s）: その人だけ %d本 / ほかの人も %d本",
                 mask(r["id"], public=True), alone[r["id"]],
                 wider[r["id"]])

    body = body_of(pairs, counts, lost, top, wide)
    parts = chunks(body)
    log.info("本文: %d 字 / %d コメント", len(body), len(parts))
    notice(f"深掘り{'（下見）' if not apply else ''}: "
           f"渡された {len(who)}人 / 掘れた {len(pairs)}人 / "
           f"名前が引けない {len(lost)}人 / "
           f"その人だけ {sum(alone.values())}本 / "
           f"ほかの人も {sum(wider.values())}本 / "
           f"語で見つかった {hits}本 / {len(parts)}コメント")

    if not apply:
        log.info("下見なので**1文字も貼っていません**。"
                 '貼るには {"apply": true} を付けてください')
        return 0

    if comment and len(parts) > 1:
        # **切り分けたものを1つのコメントに書き替えられない。**
        # 黙って1本目だけ書き替えると、残りが消える
        log.error("本文が %d つに分かれるので、書き替えられません",
                  len(parts))
        return 3
    ids = []
    for i, part in enumerate(parts):
        tail = SIGN if i == len(parts) - 1 else ""
        head = "" if len(parts) == 1 else f"（{i + 1}/{len(parts)}）\n\n"
        cid = post(issue, head + part + tail, comment)
        if not cid:
            log.error("%d 本目が貼れませんでした。%d 本は貼れています",
                      i + 1, len(ids))
            return 3
        ids.append(cid)
    how = "書き替えました" if comment else "貼りました"
    log.info("%s: #%d に %d コメント", how, issue, len(ids))
    notice(f"深掘り: #{issue} に {len(ids)} コメント{how}")
    return 0


# **自己点検から読み込まれたときは走らない。**
if __name__ == "__main__":
    sys.exit(main())
