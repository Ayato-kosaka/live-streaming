"""**街のガイドの面の見張り（`python/guide_watch.py`）が、崩した面をその足だけで落とすか。**

    python3 python/guide_watch_selftest.py
    BREAK=verify python3 python/guide_watch_selftest.py   # 足を1本抜く（下の表）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

ネットワークも書き出しも要らない。**小さな面（HTML）と facts の行をこしらえて**食わせる。
字は全部こしらえたもの（視聴者さんの名前・チャットの字を見張りに書かない）。
最後の1節だけ、本物の `streams/` の facts を読む（読む道具が置き場を見失って0行になったら、2で落ちること）。

## なぜ要るか

この見張りは「額も一言も口調も0件でした」と言うために回す。**何も見ていなくても、0件は同じ0件に見える。**
だから「その1点だけ崩した面」を足ごとに作って、**その足だけ**が赤くなることを見る。
落ちすぎること（一言の中の「できます」・外の出どころの額・配信の題を拾う）も見る。
落ちすぎる見張りは、面の字を見張りに合わせて曲げる癖を生む。

## 足を1本ずつ抜く（§15「対照は、足の数だけ用意する」）

| `BREAK=` | 抜く守り | 赤くなる所 |
| --- | --- | --- |
| `verify` | 額: 確かめが要る行の額を、確かめの要らない額と区別する | 本文に verify の額 |
| `unbacked` | 額: どの行にも無い額を落とす | 出どころの無い額 |
| `row` | 額: 表の行の額を、その行の場面の facts の額と突き合わせる | 場面と額の取り違え |
| `nolink` | 一言: 吹き出しが場面のリンクの中に在る | リンクの無い一言 |
| `sec` | 一言: リンクの秒が facts の `t` と同じ | 30秒ずれたリンク |
| `chat` | 一言: チャットが出どころの行を引かない | チャットの字を本人の一言に |
| `bare` | 一言: 吹き出しの外に本人の一言を「」で置かない | 地の文の中の「」 |
| `tone` | 口調: 説明口調の語 | 「できます」 |
| `mech` | 口調: 画面の仕組みの説明 | 「配信から抜き出し」 |
| `sep` | 落ちすぎ: 要素の境目で字をくっつけない | 「1:12:40」＋「円は」を 40円 と読む |
| `scope` | 落ちすぎ: 一言と配信の題は案内鳥の字ではない | 一言の中の「できます」 |
| `blind` | 本文（`article.tg`）が無い面を「0件」にしない | 本文の無い面が通る |
| `many` | 節の一言: 本人の一言は節に1つまで（#323） | 1節に一言が2つ |
| `perline` | 場面: 行った話の場面のリンクは1本（一文ごとに付けない） | 話の中に場面が2本 |
| `wentlink` | 場面: 行った話は場面のリンクを持つ | リンクの無い行った話 |
| `extscene` | 場面: 外の事実（`data-src`）の中に配信の場面を置かない | 出どころの事実に場面の札 |
| `nosrc` | 出どころ: 外の事実が、出どころのリンクと見た日を持つ | 出どころの無い外の事実 |
| `sum` | 額: 合計の額を、同じ表に並んだ額の足し算のときだけ通す（ガイドブックの「あやとの1日」） | 内訳の足し算の合計が落ちる |
| `floor` | 数: 窓の数がソフィアの面の数（やりたいこと8・見たいもの22・食べたいもの23）以上 | どれか1つが下限より1少ない |
| `drawn` | 数: やりたいことの札の絵が全部、その街のその札の描いた絵（`do-<id>`） | 借りた写真の札・別の札の絵・数えられない札 |

**12通り当てても、同じ足を折っているなら1通り**（`island-misses.md` #128）。上は全部別の所を折っていて、
それぞれ**その足の確かめだけ**が落ちることまで見る（ほかの足も一緒に落ちるなら、何が効いたのか分からない）。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_facts as gf  # noqa: E402
import guide_watch as gw  # noqa: E402

BREAK = os.environ.get("BREAK", "")
if BREAK:
    gw.BREAK.add(BREAK)
    if BREAK == "sep":
        gw.SEP = ""

ROOT = Path(__file__).resolve().parents[1]
# 抜いたときに赤くなってよい足。落ちすぎの守り（sep・scope）を抜くと、きれいな面（clean）も一緒に赤くなる。
# 合計の通る面（sum）も、境目の字をくっつけて読むと内訳の額が読めなくなるので、sep を抜くと一緒に赤くなる
EXPECT = {"sep": {"sep", "clean", "sum"}, "scope": {"scope", "clean"}}
LEGS = ["verify", "unbacked", "row", "nolink", "sec", "chat", "bare", "tone", "mech", "sep", "scope", "blind",
        "many", "perline", "wentlink", "extscene", "nosrc", "sum", "floor", "drawn"]
FAILED: list[tuple[str, str]] = []   # (足, 確かめの名前)
CHECKED = 0


def ok(leg: str, name: str, got, want) -> None:
    global CHECKED
    CHECKED += 1
    if got == want:
        print(f"  ○ [{leg}] {name}")
        return
    FAILED.append((leg, name))
    print(f"  ✕ [{leg}] {name}: {got!r}（欲しかったのは {want!r}）")


# ---------------------------------------------------------------- こしらえた材料

UNITS = gf.money_units({"money": {"円": ["日本円"], "ユーロ": ["eur", "€"]},
                        "countries": {"xx": {"money": {"デナール": ["mkd"]}}}}, "xx")
V1, V2 = "vidAAAA0001", "vidBBBB0002"


def row(v: str, t: int, kind: str, text: str, *, quote: str | None = None, amounts=None, hold=None, what=None) -> dict:
    it = {"t": t, "kind": kind, "text": text}
    if quote:
        it["quote"] = quote
    if amounts:
        it["amounts"] = [{"value": a, "unit": u, "as": "said"} for a, u in amounts]
    if what:
        it["what"] = what
    return {"v": v, "t": t, "it": it, "hold": hold}


ROWS = [
    row(V1, 60, "move", "バスは7時間かかった。", quote="ながすぎるやろ"),
    row(V1, 1260, "price", "パスタは75円。", amounts=[(75, "円")], what="パスタ"),
    row(V1, 1290, "price", "パンは100円。", amounts=[(100, "円")], what="パン"),
    row(V1, 2130, "price", "クッキーは180円。", amounts=[(180, "円")], what="クッキー", hold="verify"),
    row(V2, 900, "fact", "広い街。", quote="なんかええ街やな"),
    row(V2, 4290, "food", "スープは60デナール。", amounts=[(60, "デナール")], quote="これうまいわ、ほんまにできますって"),
    row(V2, 600, "quote", "チャットが先に言った。", quote="ここ有名やで", hold="chat"),
    row(V1, 4360, "price", "コーラは100円。", amounts=[(100, "円")], what="コーラ"),
]


def at(v: str, t: int) -> str:
    return f'<a class="tg-at" href="https://www.youtube.com/watch?v={v}&amp;t={t}s"><i class="tg-yt"></i><time>10/12</time><span>{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}</span></a>'


def say(q: str, v: str, t: int, *, link: bool = True) -> str:
    inner = f'<span class="tg-say-b"><span class="tg-say-q">「<span data-quote="ayato">{q}</span>」</span></span>'
    if not link:
        return f'<div class="tg-say">{inner}</div>'
    return f'<a class="tg-say" href="https://www.youtube.com/watch?v={v}&amp;t={t}s">{inner}</a>'


def page(answer: str = "道が広く、車はゆっくり走る。", *, extra: str = "", say1: str | None = None,
         table: list[tuple[str, str, int, str]] | None = None, article: bool = True,
         desc: str = "スコピエへ行った記録。パンは100円。", cls: str = "tg") -> str:
    """面1枚。目印は面の部品と同じ形（骨組み `data-src`・行った話 `data-went`。いまは `site/components/guidebook/`、前は `components/travel/Guide.tsx`）"""
    rows = table or [("パスタ", "75円", 1260, V1), ("パン", "100円", 1290, V1)]
    trs = "".join(f'<tr><th scope="row">{w}</th><td>{a}</td><td>{at(v, t)}</td></tr>' for w, a, t, v in rows)
    body = f"""
<section class="tg-sec" id="see"><h2 class="tg-sec-h"><span class="tg-sec-t">見たいもの</span></h2>
<p class="tg-answer">{answer}</p>
<div class="tg-says">{say1 if say1 is not None else say("なんかええ街やな", V2, 900)}</div>
<div class="tg-went" data-went=""><p class="tg-went-t">バスで7時間かかった。 {at(V1, 60)}</p></div>
{extra}
</section>
<section class="tg-sec" id="basics">
<div class="tg-went" data-went=""><p class="tg-went-t">スーパーで買った。 {at(V1, 1260)}</p>
<table class="tg-price"><thead><tr><th>何に</th><th>いくら</th><th>場面</th></tr></thead><tbody>{trs}</tbody></table>
<p class="tg-note">円は、あやとがその場で円に直して言った額。</p></div>
<div class="tg-ext" data-src=""><p>1デナールは約2.7円。</p>
<p class="tg-src"><a href="https://example.org/">中央銀行</a>（<time datetime="2026-10-12">10/12</time>に見た）</p></div>
</section>
<section class="tg-sec" id="eat">
<details class="tg-tile"><summary><b>スープ</b></summary><div class="tg-tile-more">
<div class="tg-went" data-went=""><p class="tg-dish-price">スープ <b>60デナール</b> {at(V2, 4290)}</p></div>
{say("これうまいわ、ほんまにできますって", V2, 4290)}</div></details>
</section>
<figure class="tg-embed"><figcaption><a href="https://www.youtube.com/watch?v={V1}&amp;t=60s"><b data-quote="title">500円でできます！おすすめ旅</b></a></figcaption></figure>
<div class="tg-vids"><a href="https://www.youtube.com/watch?v={V2}">ぜひご覧ください 3,000円</a></div>
"""
    art = f'<article class="{cls}">{body}</article>' if article else f"<main>{body}</main>"
    return (f'<!DOCTYPE html><html><head><title>スコピエ旅行記｜物価・行き方</title>'
            f'<meta name="description" content="{desc}"/></head><body>'
            f'<header>島の看板。できます・おすすめ（島の枠は見ない）</header>{art}</body></html>')


def run(p: str) -> list[str] | None:
    r = gw.check_page("xx/test", p, ROWS, UNITS)
    return None if r is None else r.errors


def legs_of(errors: list[str] | None, leg: str) -> list[str]:
    return [e for e in errors or [] if e.startswith(f"[{leg}]")]


# ---------------------------------------------------------------- 1. きれいな面は0件

print("[1] きれいな面（一言の中の「できます」・配信の題の額と「おすすめ」・外の出どころの額・島の枠）は0件")
ok("clean", "きれいな面は0件", run(page()), [])
ok("scope", "一言の中の「できます」・配信の題の「おすすめ」「ご覧ください」を拾わない",
   [x for x in run(page()) if x.startswith("[口調]")], [])
# 表の最後の行の時刻「1:12:40」の次が、表の下の1行「円は、…」。くっつけて読むと「40円」になる
ok("sep", "表の時刻と、次の行の「円は」をつないで額と読まない",
   [x for x in run(page(table=[("コーラ", "100円", 4360, V1)])) if "40円" in x], [])


# ---------------------------------------------------------------- 2. 額

print("[2] 額")
e = run(page(answer="クッキーは180円だった。"))
ok("verify", "本文に、確かめが要る行（verify）にしか無い額 → 落ちる", len(legs_of(e, "額")) >= 1 and "verify" in " ".join(e), True)
e = run(page(answer="ホテルは4,321円だった。"))
ok("unbacked", "本文に、どの行にも無い額 → 落ちる", any("4321円 が facts のどの行にも無い" in x for x in e), True)
# パンの場面（1290秒）に、パスタの額（75円）。75円そのものは facts に在るので、本文の見張りは通る
e = run(page(table=[("パン", "75円", 1290, V1)]))
ok("row", "表の行の額が、その行の場面の facts の額と違う → 落ちる",
   any("その場面" in x and "合わない" in x for x in e), True)
e = run(page(table=[("パン", "100円", 1290, V1), ("クッキー", "180円", 2130, V1)]))
ok("row", "表の行に、確かめが要る行の額と場面 → 表の見張りでも落ちる", any("表の額「180円」" in x for x in e), True)


def days(total: str) -> str:
    """ガイドブックの「あやとの1日」の形。内訳（場面つき）の下に、合計の行（tfoot）"""
    return (f'<div class="gb-went-box" data-went=""><table><tbody>'
            f'<tr><th>パスタ</th><td>約75円</td><td>{at(V1, 1260)}</td></tr>'
            f'<tr><th>パン</th><td>約100円</td><td>{at(V1, 1290)}</td></tr></tbody>'
            f'<tfoot><tr><th>自炊の日</th><td>約{total}</td></tr></tfoot></table>'
            f'<p>円は、その場で円に直した額。</p>{at(V1, 60)}</div>')


e = run(page(extra=days("175円")))
ok("sum", "合計の行が、同じ表の内訳の足し算（75円＋100円＝175円）→ 通る", legs_of(e, "額"), [])
e = run(page(extra=days("185円")))
ok("unbacked", "合計の行が、内訳の足し算に当たらない（185円）→ 落ちる", any("185円" in x for x in legs_of(e, "額")), True)
e = run(page(extra='<div class="gb-ext" data-src=""><table><tbody><tr><th>市バス1回</th><td>35デナール</td><td>100円</td></tr>'
                   '</tbody></table><p class="gb-src"><a href="https://example.org/">出どころ</a>'
                   '<time datetime="2026-11-15">11/15</time></p></div>'))
ok("clean", "外の出どころの表（data-src）は、場面の表として突き合わせない（落ちすぎない）", legs_of(e, "額"), [])
ok("clean", "ガイドブック型の面（article.gb）も、前の面（article.tg）と同じに読む", run(page(cls="gb")), [])


# ---------------------------------------------------------------- 3. 一言

print("[3] 一言")
e = run(page(say1=say("なんかええ街やな", V2, 900, link=False)))
ok("nolink", "吹き出しが場面のリンクの外 → 落ちる", any("場面のリンクが無い" in x for x in legs_of(e, "一言")), True)
e = run(page(say1=say("なんかええ街やな", V2, 930)))
ok("sec", "リンクの秒が facts の t と30秒ずれている → 落ちる", any("930秒" in x and "900秒" in x for x in e), True)
e = run(page(say1=say("ここ有名やで", V2, 600)))
ok("chat", "チャットが出どころの行の字を、本人の一言に → 落ちる", any("チャット" in x for x in legs_of(e, "一言")), True)
e = run(page(answer="着いてすぐ「なんかええ街やな」と言った。"))
ok("bare", "地の文の中に、本人の一言を「」で → 落ちる", any("吹き出しの外" in x for x in e), True)
e = run(page(say1=say("なんかいい街やな", V2, 900)))
ok("-", "字幕の字と1字違う一言 → 落ちる", any("字が違う" in x for x in e), True)


# ---------------------------------------------------------------- 4. 口調

print("[4] 口調")
e = run(page(answer="スーパーでカードが使えるので、おすすめです。"))
ok("tone", "地の文に「おすすめ」→ 落ちる", any("説明口調「おすすめ」" in x for x in e), True)
e = run(page(answer="宿も予約できます。"))
ok("tone", "地の文に「できます」→ 落ちる", any("説明口調「できます」" in x for x in e), True)
e = run(page(answer="配信から抜き出しました。"))
ok("mech", "地の文に画面の仕組みの説明 → 落ちる", any("仕組みの説明" in x for x in e), True)
e = run(page(desc="確かめが要る額は出していません。"))
ok("mech", "description にも同じ見張り", any(x.startswith("[口調] description") for x in e), True)


# ---------------------------------------------------------------- 4-2. 節の一言・場面・出どころ（#323）

print("[4-2] 節の一言・場面・出どころ")
SRC = '<p class="tg-src"><a href="https://example.org/">出どころ</a>（<time datetime="2026-11-14">11/14</time>に見た）</p>'
e = run(page(extra=say("ながすぎるやろ", V1, 60)))
ok("many", "1つの節に本人の一言が2つ → 落ちる", any(x.startswith("[節の一言]") for x in e), True)
e = run(page(extra=f'<div class="tg-went" data-went=""><p>バスに乗った。{at(V1, 60)} スーパーで買った。{at(V1, 1260)}</p></div>'))
ok("perline", "行った話に場面のリンクが2本（一文ごと）→ 落ちる", any("場面のリンクが2本" in x for x in e), True)
e = run(page(extra='<div class="tg-went" data-went=""><p>リンクの無い話。</p></div>'))
ok("wentlink", "行った話に場面のリンクが無い → 落ちる", any("場面のリンクが無い" in x for x in e), True)
e = run(page(extra=f'<div class="tg-ext" data-src=""><p>城塞は6世紀に建った。{at(V1, 60)}</p>{SRC}</div>'))
ok("extscene", "外の事実の中に配信の場面のリンク → 落ちる", any("外の事実の中に" in x for x in e), True)
e = run(page(extra='<div class="tg-ext" data-src=""><p>城塞は6世紀に建った。</p></div>'))
ok("nosrc", "外の事実に出どころのリンクも見た日も無い → 落ちる", any(x.startswith("[出どころ]") for x in e), True)
e = run(page(extra='<div class="tg-ext" data-src=""><p>城塞は6世紀に建った。</p><p><a href="https://example.org/">出どころ</a></p></div>'))
ok("nosrc", "外の事実に見た日が無い → 落ちる", any("見た日" in x for x in e), True)
# 値段の表の行と、測った値の始まり・終わりは、話の場面に数えない（落ちすぎない）
e = run(page(extra=f'<div class="tg-went" data-went=""><p>着いた。{at(V1, 60)}</p>'
                   f'<details class="tg-meas"><summary>実測</summary><p>{at(V1, 60)}{at(V1, 1260)}</p></details></div>'))
ok("perline", "測った値の始まりと終わりのリンクは、話の場面に数えない", [x for x in e if x.startswith("[場面]")], [])


# ---------------------------------------------------------------- 5. 本文の無い面

print("[5] 本文（article.tg）の無い面")
ok("blind", "本文の無い面は「0件」ではなく、見るものが無い（None）", run(page(article=False)), None)


# ---------------------------------------------------------------- 5b. 数の下限（2026-11-19）

def floor_html(key: str, *, do: int = 8, see: int = 22, eat: int = 23, photo: frozenset = frozenset(),
               swap: bool = False, cards: int | None = None) -> str:
    """数の下限の札と窓（面の部品と同じ形: 札は `a.gb-todo-card`、窓は `<dialog id="do-…">`）。
    `photo` に入れた番号のやりたいことだけ借りた写真の札にする。`swap` は1枚目の札に2枚目の描いた絵を入れる"""
    def src(i: int) -> str:
        if i in photo:
            return f"/guide/{key}/photos/p{i}-960.webp"
        return f"/guide/{key}/do-t{1 if swap and i == 0 else i}-1200.webp"
    li = "".join(f'<li><a class="gb-todo-card" href="#do-t{i}"><span class="gb-pic"><img src="{src(i)}" alt="イラスト"/></span></a></li>'
                 for i in range(do if cards is None else cards))
    dlg = "".join(f'<dialog id="{k}-t{i}" class="gb-dlg"><p>窓</p></dialog>' for k, m in (("do", do), ("see", see), ("eat", eat)) for i in range(m))
    return f"<ol>{li}</ol>{dlg}"


def floor_of(html_: str, key: str = "xx/test") -> list[str]:
    art, _ = gw.parse(f'<html><body><article class="gb"><p>道が広い。</p>{html_}</article></body></html>')
    r = gw.Report(key)
    gw.check_floor(art, key, r)
    return r.errors


print("[5b] 数の下限（ソフィアの面の数）と、やりたいことの札の絵")
ok("clean", "ソフィアの数（8・22・23）で、札が全部描いた絵なら0件", floor_of(floor_html("xx/test")), [])
ok("clean", "下限より多いぶんは落とさない", floor_of(floor_html("xx/test", see=30, eat=40)), [])
for k, low in (("do", 7), ("see", 21), ("eat", 22)):
    e = floor_of(floor_html("xx/test", **{k: low}))
    ok("floor", f"{gw.FLOOR_NAME[k]}が {low}（下限より1つ少ない）→ 落ちる", any(gw.FLOOR_NAME[k] in x and "下限" in x for x in e), True)
e = floor_of(floor_html("xx/test", photo=frozenset({3})))
ok("drawn", "やりたいことの1枚が借りた写真 → 落ちる", any("描いた絵ではない" in x for x in e), True)
e = floor_of(floor_html("xx/test", swap=True))
ok("drawn", "札に別のやりたいことの描いた絵 → 落ちる", any("「t0」の札が描いた絵ではない" in x for x in e), True)
e = floor_of(floor_html("xx/test", cards=0))
ok("drawn", "窓はあるのに札が数えられない（札の形が変わった）→ 落ちる", any("合わない" in x for x in e), True)
e = floor_of(floor_html("other/city"), key="xx/test")
ok("drawn", "ほかの街の描いた絵を入れた札 → 落ちる", any("描いた絵ではない" in x for x in e), True)


def floor_skip(html_: str, skip: dict) -> list[str]:
    art, _ = gw.parse(f'<html><body><article class="gb"><p>道が広い。</p>{html_}</article></body></html>')
    r = gw.Report("xx/test")
    gw.check_floor(art, "xx/test", r, skip)
    return r.errors


# まだ届いていない足だけを外す（FLOOR_BEFORE）。外した足は落とさず、外していない足は落とす
e = floor_skip(floor_html("xx/test", eat=15, do=7), {"eat": "理由"})
ok("floor", "食べたいものだけ外した面: 食べたいもの15は落とさず、やりたいこと7は落とす",
   (any("食べたいもの" in x for x in e), any("やりたいこと" in x and "下限" in x for x in e)), (False, True))
e = floor_skip(floor_html("xx/test", photo=frozenset({1, 2})), {"drawn": "理由"})
ok("drawn", "描いた絵だけ外した面: 借りた写真の札は落とさない", [x for x in e if "描いた絵ではない" in x], [])
e = floor_skip(floor_html("xx/test", photo=frozenset({1}), cards=0), {"drawn": "理由"})
ok("drawn", "描いた絵を外しても、札の数え漏れ（札の形の変化）は落とす", any("合わない" in x for x in e), True)


# ---------------------------------------------------------------- 6. 本物の facts を読む

if not BREAK:
    print("[6] 本物の streams/ を読み、書き出しの置き場ごと回す")
    rows = gw.rows_of("north-macedonia", "skopje", ROOT / "streams")
    ok("-", "スコピエの facts が読める（0行なら置き場を見失っている）", len(rows) > 0, True)
    ok("-", "確かめが要る行も読んでいる（hold が付く）", any(x["hold"] == "verify" for x in rows), True)
    # 面は焼いたものから書き出す。材料か facts を直して焼き直し忘れると、この見張りは古い面を見て緑になる
    ks = gw.keys()
    ok("-", "材料（guidebook.json）のある街が見つかる（0なら置き場を見失っている）", len(ks) > 0, True)
    for key in ks:
        r = subprocess.run([sys.executable, str(ROOT / "python/guidebook_bake.py"), key, "--check"],
                           capture_output=True, text=True, timeout=300)
        ok("-", f"{key} の焼いたものが、いまの材料と組み立てと facts と同じ（guidebook_bake.py --check）", r.returncode, 0)
    q = next((x for x in rows if x["it"].get("quote") and not x["hold"]), None)
    if q:
        with tempfile.TemporaryDirectory() as d:
            dist = Path(d)
            (dist / "travel/north-macedonia").mkdir(parents=True)
            p = dist / "travel/north-macedonia/skopje.html"
            p.write_text(f'<html><head><title>x</title></head><body><article class="tg"><p>行った。</p>'
                         f'{say(q["it"]["quote"], q["v"], q["t"])}{floor_html("north-macedonia/skopje")}</article></body></html>',
                         encoding="utf-8")
            code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "north-macedonia/skopje",
                                   "--dist", d], capture_output=True, text=True, timeout=120).returncode
            ok("-", "本物の一言を本物の秒で置いた面は 0", code, 0)
            p.write_text("<html><body><main>本文が無い</main></body></html>", encoding="utf-8")
            code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "north-macedonia/skopje",
                                   "--dist", d], capture_output=True, text=True, timeout=120).returncode
            ok("-", "本文の無い面は 2（数えるものが無い）", code, 2)
            code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "north-macedonia/nowhere",
                                   "--dist", d], capture_output=True, text=True, timeout=120).returncode
            ok("-", "書き出しに無い面は 2", code, 2)

    # 行く前の街（材料の city.pre_trip）は facts が無いのが正しい。行った街から facts を抜いたときは 2 のまま（分かれること）
    with tempfile.TemporaryDirectory() as d:
        dist, empty = Path(d) / "dist", Path(d) / "streams"
        empty.mkdir()
        (dist / "travel/romania").mkdir(parents=True)
        (dist / "travel/north-macedonia").mkdir(parents=True)
        body = '<html><head><title>x</title></head><body><article class="gb"><p>道が広く、車はゆっくり走る。</p></article></body></html>'
        full = body.replace("</article>", floor_html("romania/bucharest") + "</article>")
        (dist / "travel/romania/bucharest.html").write_text(full, encoding="utf-8")
        (dist / "travel/north-macedonia/skopje.html").write_text(body, encoding="utf-8")
        ok("-", "ブカレストの材料は、行く前の街の印を持つ", gw.pre_trip("romania/bucharest"), True)
        ok("-", "スコピエの材料は、行く前の街の印を持たない", gw.pre_trip("north-macedonia/skopje"), False)
        code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "romania/bucharest", "--dist", str(dist),
                               "--streams", str(empty)], capture_output=True, text=True, timeout=120).returncode
        ok("-", "行く前の街は、facts が無くても 0（「行った」の突き合わせを飛ばす）", code, 0)
        code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "north-macedonia/skopje", "--dist", str(dist),
                               "--streams", str(empty)], capture_output=True, text=True, timeout=120).returncode
        ok("-", "対照: 行った街から facts を抜くと 2（置き場を見失ったのと同じ）", code, 2)
        # 数の下限は面ごとに当たる。札の無いブカレストは 1、下限より前に作ったスコピエは理由つきで外れる
        (dist / "travel/romania/bucharest.html").write_text(body, encoding="utf-8")
        r = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "romania/bucharest", "--dist", str(dist),
                            "--streams", str(empty)], capture_output=True, text=True, timeout=120)
        ok("-", "対照: 札の無いブカレストは、数の下限で 1", (r.returncode, "下限" in r.stdout), (1, True))
        ok("-", "下限より前に作った面には、外した足ごとに理由が書いてある",
           all(legs and all(len(why) > 10 for why in legs.values()) for legs in gw.FLOOR_BEFORE.values()), True)
        ok("-", "外した足は、下限の足（やりたいこと・見たいもの・食べたいもの）か描いた絵だけ",
           all(set(legs) <= set(gw.FLOOR) | {"drawn"} for legs in gw.FLOOR_BEFORE.values()), True)
        ok("-", "下限を外した面は、材料のある街だけ（消えた街の除外を残さない）", set(gw.FLOOR_BEFORE) <= set(gw.keys()), True)
        (dist / "travel/romania/bucharest.html").write_text(full, encoding="utf-8")
        (dist / "travel/romania/bucharest.html").write_text(
            '<html><head><title>x</title></head><body><article class="gb"><p>道が広い。</p>'
            f'{say("ここ安いね", "abcdefghijk", 60)}{floor_html("romania/bucharest")}</article></body></html>', encoding="utf-8")
        code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "romania/bucharest", "--dist", str(dist),
                               "--streams", str(empty)], capture_output=True, text=True, timeout=120).returncode
        ok("-", "対照: 行く前の街に一言を置くと 1", code, 1)
        # 行く前の街の額は、材料の外の事実（出どころつきの字）に在れば通る。無い額は 1
        for amt, want in (("5レイ", 0), ("999レイ", 1)):
            (dist / "travel/romania/bucharest.html").write_text(
                f'<html><head><title>x</title></head><body><article class="gb"><p>地下鉄は1回{amt}。</p>'
                f'{floor_html("romania/bucharest")}</article></body></html>',
                encoding="utf-8")
            code = subprocess.run([sys.executable, str(ROOT / "python/guide_watch.py"), "romania/bucharest", "--dist", str(dist),
                                   "--streams", str(empty)], capture_output=True, text=True, timeout=120).returncode
            ok("-", f"行く前の街の額「{amt}」は、材料の外の事実に{'在るので 0' if want == 0 else '無いので 1'}", code, want)


# ---------------------------------------------------------------- 7. 対照

if not BREAK:
    print("[7] 対照（足を1本ずつ抜くと、その足の確かめだけが赤くなるか）")
    bad = []
    for leg in LEGS:
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=leg), timeout=300, check=False)
        line = next((ln for ln in r.stdout.splitlines() if ln.startswith("FAILED_LEGS=")), "FAILED_LEGS=[]")
        got = set(json.loads(line.split("=", 1)[1]))
        good = r.returncode != 0 and got == EXPECT.get(leg, {leg})
        print(f"  {'○' if good else '✕'} BREAK={leg} → 終了コード {r.returncode}・赤くなった足 {sorted(got)}")
        if not good:
            bad.append(leg)
    CHECKED += len(LEGS)
    if bad:
        FAILED.append(("対照", " / ".join(bad) + " を抜いても、その足だけが赤くならない"))


# ---------------------------------------------------------------- まとめ

print()
print("FAILED_LEGS=" + json.dumps(sorted({leg for leg, _ in FAILED})))
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for leg, n in FAILED:
        print(f"   - [{leg}] {n}")
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
