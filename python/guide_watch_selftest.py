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
# 抜いたときに赤くなってよい足。落ちすぎの守り（sep・scope）を抜くと、きれいな面（clean）も一緒に赤くなる
EXPECT = {"sep": {"sep", "clean"}, "scope": {"scope", "clean"}}
LEGS = ["verify", "unbacked", "row", "nolink", "sec", "chat", "bare", "tone", "mech", "sep", "scope", "blind"]
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
         desc: str = "スコピエへ行った記録。パンは100円。") -> str:
    """面1枚。並びは `site/components/travel/Guide.tsx` の部品と同じ形"""
    rows = table or [("パスタ", "75円", 1260, V1), ("パン", "100円", 1290, V1)]
    trs = "".join(f'<tr><th scope="row">{w}</th><td>{a}</td><td>{at(v, t)}</td></tr>' for w, a, t, v in rows)
    body = f"""
<section class="tg-sec" id="about"><h2 class="tg-sec-h"><span class="tg-sec-t">どんな街？</span></h2>
<p class="tg-answer">{answer}</p>
<div class="tg-says">{say1 if say1 is not None else say("なんかええ街やな", V2, 900)}</div>
<ul class="tg-lines"><li><p>バスで7時間。 {at(V1, 60)}</p>{say("ながすぎるやろ", V1, 60)}</li></ul>
{extra}
</section>
<section class="tg-sec" id="money">
<div class="tg-prices"><table class="tg-price"><caption>スーパー</caption>
<thead><tr><th>何に</th><th>いくら</th><th>いつ・場面</th></tr></thead><tbody>{trs}</tbody></table>
<p class="tg-note">円は、あやとがその場で円に直して言った額。</p></div>
<aside class="tg-key"><p class="tg-key-t">値札の数字、円にすると？</p>
<p class="tg-ext">1デナールは約2.7円（2026年10月12日・<a href="https://example.org/">中央銀行</a>）</p></aside>
</section>
<section class="tg-sec" id="food">
<details class="tg-dish"><summary><h3>スープ</h3></summary><div class="tg-dish-more">
<p class="tg-dish-price">スープ <b>60デナール</b> {at(V2, 4290)}</p>
{say("これうまいわ、ほんまにできますって", V2, 4290)}</div></details>
</section>
<figure class="tg-embed"><figcaption><a href="https://www.youtube.com/watch?v={V1}&amp;t=60s"><b data-quote="title">500円でできます！おすすめ旅</b></a></figcaption></figure>
<div class="tg-vids"><a href="https://www.youtube.com/watch?v={V2}">ぜひご覧ください 3,000円</a></div>
"""
    art = f'<article class="tg">{body}</article>' if article else f"<main>{body}</main>"
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


# ---------------------------------------------------------------- 5. 本文の無い面

print("[5] 本文（article.tg）の無い面")
ok("blind", "本文の無い面は「0件」ではなく、見るものが無い（None）", run(page(article=False)), None)


# ---------------------------------------------------------------- 6. 本物の facts を読む

if not BREAK:
    print("[6] 本物の streams/ を読み、書き出しの置き場ごと回す")
    rows = gw.rows_of("north-macedonia", "skopje", ROOT / "streams")
    ok("-", "スコピエの facts が読める（0行なら置き場を見失っている）", len(rows) > 0, True)
    ok("-", "確かめが要る行も読んでいる（hold が付く）", any(x["hold"] == "verify" for x in rows), True)
    # 面は焼いたものから書き出す。台本か facts を直して焼き直し忘れると、この見張りは古い面を見て緑になる
    for key in gw.keys():
        r = subprocess.run([sys.executable, str(ROOT / "python/guide_bake.py"), key, "--check"],
                           capture_output=True, text=True, timeout=300)
        ok("-", f"{key} の焼いたものが、いまの台本と facts と同じ（guide_bake.py --check）", r.returncode, 0)
    q = next((x for x in rows if x["it"].get("quote") and not x["hold"]), None)
    if q:
        with tempfile.TemporaryDirectory() as d:
            dist = Path(d)
            (dist / "travel/north-macedonia").mkdir(parents=True)
            p = dist / "travel/north-macedonia/skopje.html"
            p.write_text(f'<html><head><title>x</title></head><body><article class="tg"><p>行った。</p>'
                         f'{say(q["it"]["quote"], q["v"], q["t"])}</article></body></html>', encoding="utf-8")
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
