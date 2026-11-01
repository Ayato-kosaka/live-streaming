# -*- coding: utf-8 -*-
"""月末配信・授賞式のページを組む。

    python3 python/build_review_page.py 2026-10

材料は `python/data/review/<月>/`:

| | |
| --- | --- |
| `base.json` | 配信時間・写真・あやと島カード（島の口から引いたもの） |
| `content.json` | 6分割・名言・付箋大賞・調べもの・はじめまして |
| `quiz.json` | クイズ10問 |
| `buzz.json` | 流行語（`python/buzzwords.py --json` の出力） |

出すのは `public/<YYYYMM>_monthly_review_v2.html`。

## 決め（2026-11-01。あやとの指摘から組み直した）

2026-10 版を測って出た原因は3つ。**「もっと良く」ではなく、ここを直した。**

- 書体が1種（端末標準の丸ゴシック）で、Google Fonts を1つも読んでいなかった
- `clamp()` が**30種類以上**あり、全部 12〜34px の中。**段が無い＝単調**。
  下限 `13px` の指定が多く、縮むと 13px まで落ちる＝**字が小さい**
- 島に写真が92枚あるのに、ページには**1枚も出ていなかった**＝思い出が伝わらない

だから: **書体は3つ組む / 字の段は7つだけ（`--u` ひとつで縮む） /
写真を主役にする / 1画面に1枚**。

**島の写真は全部「縦」**（1200×1600。スマホで撮っている）。16:9 に敷くと
上下が大きく切れるので、**全面には敷かず、縦のまま3枚立てる。**

## 出す先が2つある

**本番は OBS の 1920×1080。** けれどあやとが見るのはスマホで、
16:9 のまま縮めると本文 30px が **4.5px** まで落ちて読めない（実測）。
狭い画面では 16:9 をやめ、**面を縦に伸ばして字の大きさを守る**
（`@media (max-width: 1000px)`）。
"""
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONTH = sys.argv[1] if len(sys.argv) > 1 else "2026-10"
SP = ROOT / "python" / "data" / "review" / MONTH
OUT = ROOT / "public" / ("%s_monthly_review_v2.html" % MONTH.replace("-", ""))
D = json.loads((SP / "base.json").read_text(encoding="utf-8"))
C = json.loads((SP / "content.json").read_text(encoding="utf-8"))
Q = json.loads((SP / "quiz.json").read_text(encoding="utf-8"))
e = html.escape
ICON = "https://live-streaming-d3cac.web.app/island-api/characters/%s/plain-128.webp"
COVER = D["cover"]


def hm(s):
    return "%d<small>時間</small>%d<small>分</small>" % (s // 3600, s % 3600 // 60)


# 写真をコーナーごとに割り当てる。**縦しか無いので、横に3枚並べる**
BY_DAY = {}
for p in D["photos"]:
    BY_DAY.setdefault(p["day"], []).append(p)


def strip(days, n=3):
    """その期間の写真を n 枚。無ければ空（**描いた絵で埋めない**）"""
    got = [p for d in days for p in BY_DAY.get(d, [])]
    return "".join('<img src="%s" alt="">' % p["url"] for p in got[:n])


def days_between(a, b):
    out, cur = [], a
    while cur <= b:
        out.append(cur)
        y, m, d = map(int, cur.split("-"))
        import datetime
        cur = str(datetime.date(y, m, d) + datetime.timedelta(days=1))
    return out


CSS = """
:root {
  --ground:#14110d; --paper:#f7f1e6; --ink:#231d16; --text:#f3ece1;
  --dim:#a2988a; --red:#c8442f; --ochre:#d99a2b; --moss:#4e7a52; --gold:#e0b64e;
  --disp:"Shippori Mincho B1","Hiragino Mincho ProN",serif;
  --body:"Zen Kaku Gothic New","Hiragino Sans",system-ui,sans-serif;
  --num:"Roboto Mono",ui-monospace,monospace;
  /* 字の段は7つだけ（design_spec.md 3章）。段ごとに clamp を生やさない */
  /* 面は 1920×1080 で組むが、画面が狭ければそのぶん全部が縮む。
     段ごとに clamp を書かずに済むのはこれのおかげ（design_spec.md 3章）。
     OBS は 1920 ちょうどなので、上限を 1px に止める */
  --u: min(1px, calc(100vw / 1920));
  --t-hero:calc(92*var(--u)); --t-head:calc(68*var(--u)); --t-sub:calc(40*var(--u));
  --t-body:calc(30*var(--u)); --t-note:calc(24*var(--u)); --t-micro:calc(20*var(--u));
  --t-num:calc(56*var(--u));
}
* { box-sizing:border-box; margin:0; }
body { background:#0b0907; color:var(--text); font-family:var(--body); }
.scene { width:min(1920px, 100vw); aspect-ratio:16/9; position:relative;
         overflow:hidden; background:var(--ground); margin:0 auto; }
/* 面の継ぎ目。スクロールして見るときに、どこで切れているかが分かる */
.scene + .scene { border-top:1px solid rgba(247,241,230,.12); }
html, body { max-width:100%; overflow-x:hidden; }
.strip { position:absolute; right:0; top:0; bottom:0; width:37%; display:flex;
         gap:10px; padding:10px 10px 10px 0; }
.strip img { flex:1; min-width:0; height:100%; object-fit:cover; border-radius:4px;
             display:block; }
.veil { position:absolute; inset:0; background:linear-gradient(90deg,
        rgba(20,17,13,1) 0 58%, rgba(20,17,13,.5) 64%, rgba(20,17,13,0) 72%); }
.pad { position:absolute; inset:0; padding:calc(80*var(--u)) calc(96*var(--u));
       display:flex; flex-direction:column; }
/* 写真は右 37%。字は 60% までに収める。63% まで伸ばすと**写真の下に潜る** */
.pad.half { width:60%; padding-right:24px; }
.kicker { font-size:var(--t-micro); letter-spacing:.34em; color:var(--ochre);
          font-weight:700; }
h1 { font-family:var(--disp); font-weight:800; font-size:calc(86*var(--u));
     line-height:1.14; letter-spacing:.02em; margin-top:16px; }
h2 { font-family:var(--disp); font-weight:800; font-size:var(--t-head);
     line-height:1.2; letter-spacing:.03em; margin-top:10px; }
.lede { font-size:var(--t-body); line-height:1.8; color:#e4dbcc; margin-top:20px; }
.when { font-family:var(--num); font-size:var(--t-note); color:var(--ochre);
        letter-spacing:.06em; margin-top:18px; }
.stats { margin-top:auto; display:grid; grid-template-columns:repeat(3,auto);
         justify-content:start; gap:30px 64px; }
.stat b { display:block; font-family:var(--num); font-weight:700;
          font-size:var(--t-hero); line-height:1; letter-spacing:-.02em;
          font-variant-numeric:tabular-nums; white-space:nowrap; }
.stat b small { font-family:var(--body); font-size:calc(36*var(--u));
                font-weight:700; margin:0 .08em; }
.stat span { display:block; font-size:var(--t-note); color:var(--dim); margin-top:10px; }
.stat.hi b { color:var(--ochre); }
.mid { flex:1; display:flex; flex-direction:column; justify-content:center; }
/* 紙の上の1枚。**1画面に1枚だけ** */
.sheet { background:var(--paper); color:var(--ink); border-radius:12px;
         padding:60px 72px; max-width:1420px; width:100%;
         box-shadow:0 36px 80px rgba(0,0,0,.55); }
.sheet.tilt { transform:rotate(-.5deg); }
.tag { display:inline-block; font-size:var(--t-micro); font-weight:700;
       letter-spacing:.16em; color:#fff; background:var(--moss);
       border-radius:999px; padding:9px 22px; }
.tag.gold { background:var(--gold); color:#2b2209; }
.tag.red { background:var(--red); }
.quote { font-family:var(--disp); font-weight:600; font-size:calc(50*var(--u));
         line-height:1.6; margin-top:26px; white-space:pre-wrap; }
.by { margin-top:24px; font-size:var(--t-note); color:#6b6054; }
.after { margin-top:30px; padding-top:26px; border-top:2px solid #e2d8c8;
         font-size:var(--t-body); line-height:1.7; }
.rows3 { display:grid; gap:22px; margin-top:26px; }
.rows3 div { font-size:var(--t-body); line-height:1.65; }
.rows3 b { color:var(--red); }
/* クイズ */
.qq { font-family:var(--disp); font-weight:600; font-size:calc(46*var(--u));
      line-height:1.55; }
.ch { display:grid; gap:20px; margin-top:40px; }
.ch div { font-size:var(--t-sub); background:rgba(247,241,230,.07); border-radius:14px;
          padding:26px 34px; min-height:96px; display:flex; align-items:center; gap:24px; }
.ch b { font-family:var(--num); color:var(--ochre); }
.ch div.ok { background:rgba(224,182,78,.2); outline:3px solid var(--gold); }
/* 一覧（最後の1面だけ。1行 64px 以上） */
/* 一覧は面の縦の真ん中に置く。上に詰めると下半分が空いて、
   「1枚ずつ大きく見せる」はずの面が寂しく見える */
.list { display:grid; gap:18px; margin:auto 0; }
/* **1行に入るのは4つ**（順位・絵・名前・数）。3列で組むと4つめが次の行へ回り、
   あふれた1列目が1文字ずつ縦に折れる（実測 1行 502px。面が 816px あふれた） */
.li { display:grid; grid-template-columns:auto 96px 1fr auto; gap:28px;
      align-items:center; min-height:88px; background:rgba(247,241,230,.06);
      border-radius:14px; padding:0 32px; font-size:var(--t-sub); }
.li .n, .li .v { white-space:nowrap; }
.li img { width:88px; height:88px; border-radius:50%; object-fit:cover;
          border:4px solid var(--paper); background:var(--paper); }
.li .n { font-family:var(--num); font-weight:700; font-size:var(--t-num);
         color:var(--gold); }
.li .v { font-family:var(--num); font-weight:700; font-size:var(--t-num); }
.card { position:relative; border-radius:calc(18*var(--u)); overflow:hidden;
        box-shadow:0 calc(40*var(--u)) calc(90*var(--u)) rgba(0,0,0,.6);
        aspect-ratio:3/4; max-height:calc(880*var(--u)); margin-left:auto; }
.card img.bg { width:100%; height:100%; object-fit:cover; display:block; }
.pin { position:absolute; width:104px; height:104px; border-radius:50%;
       border:5px solid var(--paper); background:var(--paper);
       box-shadow:0 10px 26px rgba(0,0,0,.45); transform:translate(-50%,-50%); }
.pin img { width:100%; height:100%; border-radius:50%; object-fit:cover; display:block; }
.card-note { position:absolute; left:0; right:0; bottom:0; padding:24px 28px;
             background:linear-gradient(transparent,rgba(10,8,6,.88) 42%);
             font-size:var(--t-sub); font-weight:700; color:var(--text); }
.two { flex:1; display:grid; grid-template-columns:1fr calc(640*var(--u));
       gap:calc(64*var(--u)); align-items:center; }
/* 面の名札は確認用。本番では出さない */
/* ── 段。`data-step` を持つ要素は、その段まで送られたら出る。
   **めくる間（ま）がこのページの本体**で、静止画では良し悪しが分からない */
[data-step] { opacity:0; transform:translateY(calc(14*var(--u)));
              transition:opacity .42s ease, transform .42s ease; }
[data-step].on { opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce) { [data-step] { transition:none; } }
.scene { display:none; }
.scene.live { display:block; }
@media (max-width: 1000px) { .scene.live { display:flex; } }
/* 進みの点。いま何面目かが配信画面の隅に出る */
.dots { position:fixed; right:calc(26*var(--u)); bottom:calc(22*var(--u));
        display:flex; gap:calc(7*var(--u)); z-index:9; }
.dots i { width:calc(9*var(--u)); height:calc(9*var(--u)); border-radius:50%;
          background:rgba(247,241,230,.26); }
.dots i.now { background:var(--ochre); transform:scale(1.5); }
.conf { position:fixed; inset:0; pointer-events:none; z-index:8; overflow:hidden; }
.conf b { position:absolute; width:calc(12*var(--u)); height:calc(18*var(--u));
          animation:fall 2.6s linear forwards; }
@keyframes fall { to { transform:translateY(110vh) rotate(760deg); opacity:0; } }

.tag-scene { position:absolute; left:40px; bottom:26px; font-size:var(--t-micro);
             color:#6b6054; letter-spacing:.2em; }

/* ── 狭い画面（見るとき用）。
   **出す先は OBS の 1920×1080** だが、あやとが見るのはスマホ。
   16:9 のまま縮めると、本文 30px が **4.5px** まで落ちて読めない（実測）。
   なので狭いところでは 16:9 をやめ、**面を縦に伸ばして字の大きさを守る。**
   --u を 1/620 にすると、430px の画面で本文が 20px になる */
@media (max-width: 1000px) {
  :root { --u: calc(100vw / 620); }
  .scene { aspect-ratio:auto; min-height:0; }
  .pad, .pad.half { position:static; width:auto;
                    padding:calc(56*var(--u)) calc(44*var(--u)); }
  /* 写真は右に立てず、字の上に横一列で置く */
  .strip { position:static; width:auto; height:calc(430*var(--u));
           padding:0 0 calc(28*var(--u)); }
  .veil { display:none; }
  .scene { display:flex; flex-direction:column; }
  .two { grid-template-columns:1fr; gap:calc(36*var(--u)); }
  .card { max-height:none; max-width:calc(520*var(--u)); margin:0 auto; }
  .li { grid-template-columns:auto calc(96*var(--u)) 1fr auto;
        gap:calc(18*var(--u)); padding:0 calc(20*var(--u)); }
  .sheet { padding:calc(44*var(--u)) calc(40*var(--u)); }
  .mid { gap:calc(24*var(--u)); }
  .tag-scene { position:static; margin-top:calc(20*var(--u)); }
}
"""

S = []


def scene(body, label, photos="", total=0, confetti=False):
    """1面ぶん。`total` は**段の数**（`data-step="1"` が出るまでに何回送るか）。

    送りの作法は 2026-10 版と同じにしてある（`data-step` を付けた要素が
    段ごとに出る）。**Firestore 越しの遠隔操作をあとから同じ形で挿せる。**
    """
    S.append('<section class="scene" data-total="%d"%s>%s<div class="pad%s">%s</div>'
             '<div class="tag-scene">%s</div></section>'
             % (total, ' data-confetti="1"' if confetti else "",
                ('<div class="strip">%s</div><div class="veil"></div>' % photos)
                if photos else "", " half" if photos else "", body, e(label)))


# ── 0 表紙
scene("""<div class="kicker">2026年10月・9/26 → 10/30</div>
  <h1>10月の<br>ふりかえり授賞式</h1>
  <p class="lede">アルバニアから北マケドニアへ。スマホが消えて戻ってきて、宿を追い出されて、
  チーズケーキもパンも焼いた35日。</p>
  <div class="stats" data-step="1">
    <div class="stat"><b>%d<small>日</small></b><span>配信のあった日</span></div>
    <div class="stat hi"><b>%s</b><span>配信した時間</span></div>
    <div class="stat hi"><b>%s</b><span>1日あたり</span></div>
    <div class="stat"><b>%d<small>人</small></b><span>来てくれた人</span></div>
    <div class="stat"><b>%d<small>人</small></b><span>はじめまして</span></div>
    <div class="stat"><b>%s<small>円</small></b><span>みんなの貢献</span></div>
  </div>""" % (COVER["days"], hm(COVER["seconds"]), hm(COVER["secondsPerDay"]),
               COVER["people"], COVER["newcomers"], "{:,}".format(COVER["tipTotal"])),
      "表紙", strip(["2026-10-15"]), total=1)

# ── 1〜6 6分割ふりかえり（1コマ1面）
for i, r in enumerate(C["recap"], 1):
    scene("""<div class="kicker">ふりかえり %d / 6</div>
      <h2>%s</h2>
      <div class="when">%s → %s</div>
      <p class="lede" data-step="1">%s</p>""" % (i, e(r["head"]),
                                   r["from"][5:].replace("-", "/"),
                                   r["to"][5:].replace("-", "/"), e(r["body"])),
          "ふりかえり%d" % i, strip(days_between(r["from"], r["to"])), total=1)

# ── 7〜9 あやと島カード（大きい1枚ずつ）
by_photo = {}
for c in D["cards"]:
    by_photo.setdefault(c["photoId"], []).append(c)
top = sorted(by_photo.values(), key=lambda v: -len(v))[:3]
def spread(grp):
    """立ち位置が重なっているぶんをほどく。

    **置いたのは本人たち**なので位置は動かしたくないが、既定の置き場
    （`python/island_cards.py` の初期値）のまま動かしていない人が多いと、
    9人が同じところで団子になって誰が居るのか分からなくなる（実測）。
    **動かしていない人だけ**を、その周りへ円く逃がす。
    """
    import math
    out, used = [], []
    for c in grp:
        x, y = (c.get("x") or .5), (c.get("y") or .5)
        if c.get("moved"):              # 自分で動かした人はそのまま
            out.append((x, y, c)); used.append((x, y)); continue
        for k in range(len(grp) + 1):
            if all(abs(x - a) > .085 or abs(y - b) > .085 for a, b in used):
                break
            t = math.radians(32 * k)    # 周りへ円く逃がす
            x = min(.9, max(.1, (c.get("x") or .5) + .17 * math.cos(t)))
            y = min(.88, max(.12, (c.get("y") or .5) + .17 * math.sin(t)))
        out.append((x, y, c)); used.append((x, y))
    return out


for k, grp in enumerate(top):
    pins = "".join('<span class="pin" style="left:%.1f%%;top:%.1f%%"><img src="%s" alt=""></span>'
                   % (x * 100, y * 100, ICON % c["icon"])
                   for x, y, c in spread(grp))
    scene("""<div class="kicker">あやと島カード</div>
      <h2>%s</h2>
      <div class="two">
        <div class="card"><img class="bg" src="%s" alt=""><span data-step="1">%s</span>
          </div>
        <div><div class="when">%s の写真・%d人が立っています</div>
        <p class="lede">この35日であやとが撮った写真は
        <b style="color:var(--ochre);font-family:var(--num)">%d</b> 枚。<br>
        %d日ぶんの写真に、<b style="color:var(--ochre);font-family:var(--num)">%d</b> 人が
        思い思いの場所に立ちました。</p></div>
      </div>""" % (e(grp[0]["note"] or "この日の1枚"), grp[0]["url"], pins,
                   grp[0]["day"][5:].replace("-", "/"), len(grp),
                   len(D["photos"]), len({p["day"] for p in D["photos"]}),
                   len({c["icon"] for c in D["cards"]})),
          "カード%d" % (k + 1), total=1)

# ── クイズ（1問1面 ×10）
for i, q in enumerate(Q, 1):
    ch = "".join('<div class="%s"><b>%s</b>%s</div>'
                 % ("ok ans" if j == q["answer"] else "", "ABC"[j], e(c))
                 for j, c in enumerate(q["choices"]))
    scene("""<div class="kicker">クイズ %d / 10</div>
      <div class="mid"><div class="qq">%s</div>
        <div class="ch" data-step="1">%s</div>
        <div class="after" data-step="2"
             style="color:var(--text);border-top-color:rgba(247,241,230,.2)">%s</div>
      </div>""" % (i, e(q["q"]), ch, e(q.get("note") or "")), "クイズ%d" % i, total=2)

# ── 名言（1つ1面）
for i, m in enumerate(C["meigen"], 1):
    scene("""<div class="kicker">名言・いい話 %d / 5</div>
      <div class="mid"><div class="sheet tilt">
        <span class="tag">%s</span>
        <div class="quote">%s</div>
        <div class="by" data-step="1">%s</div>
      </div></div>""" % (i, e(m.get("when") or ""), e(m["text"]), e(m["who"])),
          "名言%d" % i, total=1)

# ── 付箋大賞（部門賞 → 大賞）
st = C["stickies"]
for i, n in enumerate(st["nominees"], 1):
    after = ('<div class="after" data-step="1">%s</div>' % e(n["after"])) if n.get("after") else ""
    scene("""<div class="kicker">付箋大賞 部門賞 %d</div>
      <div class="mid"><div class="sheet tilt">
        <span class="tag">%s</span>
        <div class="quote">%s</div>
        <div class="by">%s・♥ %s</div>%s
      </div></div>""" % (i, e(n.get("label") or n.get("theme") or ""), e(n["text"]),
                         e(n.get("by") or "名乗らずに貼ってくれた人"),
                         n.get("hearts", 0), after),
          "付箋%d" % i, total=1 if n.get("after") else 0)
pz = st["prize"]
scene("""<div class="kicker">あやと島 付箋大賞</div>
  <div class="mid"><div class="sheet">
    <span class="tag gold">大賞</span>
    <div class="quote">%s</div>
    <div class="by">%s・♥ %s</div>
    <div class="after" data-step="1">%s</div>
  </div></div>""" % (e(pz["text"]), e(pz.get("by") or "名乗らずに貼ってくれた人"),
                     pz.get("hearts", 0), e(pz.get("after") or "")),
      "付箋大賞", total=1, confetti=True)

# ── 調べもの大賞（1件1面。**1ページに収める**ので4件まで）
for i, g in enumerate(C["guides"], 1):
    scene("""<div class="kicker">調べもの大賞 %d / %d</div>
      <div class="mid"><div class="sheet">
        <span class="tag red">%s</span>
        <div class="rows3">
          <div><b>困っていたこと</b>　%s</div>
          <div data-step="1"><b>教えてくれたこと</b>　%s</div>
          <div data-step="2"><b>そのあと</b>　%s</div>
        </div>
      </div></div>""" % (i, len(C["guides"]), e(g["who"]), e(g["stuck"]),
                         e(g["told"]), e(g["moved"])),
          "調べもの%d" % i, total=2)

# ── 流行語大賞（ノミネート5 → グランプリ1）
# **30語ぜんぶは出さない**（SKILL.md §6-2-3）。1行読んで分かるものを選ぶ。
# 地名（北マケドニア・アルバニア）は「どこに居たか」であって流行語ではないので外す
BUZZ = json.loads((SP / "buzz.json").read_text(encoding="utf-8"))
BW = {w["word"]: w for w in BUZZ["words"]}
NOMI = ["ネクストレベル", "コネコネ", "暗殺者のパスタ", "ひげ剃り", "LINEスタンプ"]
GP = "ぼくのくつ"
BUZZ_WHY = {
    "ネクストレベル": "アルバニアの宿で出会った親友の口ぐせ。皿洗いも、スマホを取り返した芝居も「ネクストレベル」。"
                     "LINEスタンプ40種の1枚になった",
    "コネコネ": "パン作りの手つきにチャットが付けた音。生地をさわるたび流れた",
    "暗殺者のパスタ": "ガスが止まって三度延びた一皿。弱いIHで1時間かけて完成し「今まで食べたトマトパスタで一番うまい」",
    "ひげ剃り": "アルバニアで盗られて、北マケドニアで龍の絵の「Geemy T9 Dragon」を1,300レクで買い直すまでの3週間",
    "LINEスタンプ": "島の付箋から始まって、40種のスタンプになった",
}
for i, w in enumerate(NOMI, 1):
    b = BW[w]
    scene("""<div class="kicker">流行語大賞 ノミネート %d / 5</div>
      <div class="mid"><div class="sheet">
        <div class="quote">%s</div>
        <div class="by">%d回・%d人が使った　／　はじめて出たのは %s</div>
        <div class="after" data-step="1">%s</div>
      </div></div>""" % (i, e(w), b["count"], b["speakers"],
                         b["first_day"][5:].replace("-", "/") if b.get("first_day") else "この月",
                         e(BUZZ_WHY[w])),
          "流行語%d" % i, total=1)
g = BW[GP]
scene("""<div class="kicker">流行語大賞</div>
  <div class="mid"><div class="sheet">
    <span class="tag gold">グランプリ</span>
    <div class="quote" style="font-size:var(--t-hero);line-height:1.25">%s</div>
    <div class="by" data-step="1">%d回・%d人が使った　／　10/01 から</div>
    <div class="after">靴屋を3軒まわって、4万円のオンと3万6,000円のHOKAを履き比べて、
    30%%引きのアディダス8,600円に決めた日。@ゆずたつ-q3n さんが
    「月末配信で流行語決まったわ、ぼくのくつ」と書きました。
    <b>賞のほうが、自分で名前を言っていました。</b></div>
  </div></div>""" % (e(GP), g["count"], g["speakers"]),
      "流行語大賞", total=1, confetti=True)

# ── 皆勤賞
KINKIN = [("@dekobokov6229", 3, "18okO58dwMaci-9R1go0Rj1dTqliSWlz3"),
          ("@さおり-k1n", 2, None),
          ("@もっと豆挽けコーヒー商店", 1, "f203e9529b7941c89940a568e03b83b00")]
pod = "".join(
    '<div class="li"><span class="n" style="font-size:var(--t-note)">皆勤</span>%s<span>%s</span>'
    '<span class="v">%s</span></div>'
    % (('<img src="%s" alt="">' % (ICON % ic)) if ic else '<span></span>',
       e(n), "%dヶ月連続" % k if k > 1 else "はじめて")
    for n, k, ic in KINKIN)
scene("""<div class="kicker">皆勤賞</div>
  <h2>35日ぜんぶに来てくれた3人</h2>
  <p class="lede">配信のあった35日、1日も欠かさずコメントをくれました。</p>
  <div class="list">%s</div>
  <p class="when" style="color:var(--dim)">あと1日だったのは @ゆずたつ-q3n さんと
  @清志郎-n1s さん（34日）。</p>""" % pod, "皆勤賞")

# ── はじめまして（2人ずつ）
NEW = C["newcomers"]["people"]
for i in range(0, len(NEW), 2):
    pair = NEW[i:i + 2]
    cards = "".join(
        """<div class="sheet" style="padding:44px 52px">
             <div class="quote" style="font-size:calc(38*var(--u))">%s</div>
             <div class="by">%s・%s</div></div>"""
        % (e(x.get("line") or ""), e(x["name"]),
           e((x.get("day") or "")[5:].replace("-", "/")))
        for x in pair)
    scene("""<div class="kicker">はじめまして %d / %d</div>
      <h2>今月はじめて来てくれた人</h2>
      <div class="mid" style="gap:30px">%s</div>"""
          % (i // 2 + 1, (len(NEW) + 1) // 2, cards), "はじめまして%d" % (i // 2 + 1))

# ── 投げ銭（上位3人は1人1面、4位以下は一覧）
TIPS = json.loads((ROOT / "python" / "data" / "monthly_tips"
                   / ("%s.json" % MONTH)).read_text(encoding="utf-8"))["rows"]
# 低いページから高いほうへ。**いちばん下の一覧 → … → 3位 → 2位 → 1位**
#（あやと 2026-11-01「投げ銭は低いページから高い方に」）。
# 授賞式なので、下から積み上げて最後に1位を出す
rest = [r for r in TIPS if r["rank"] >= 4]
PER = 6   # 1行 88px + すき間。1080 の面に入るのはここまで（10行で 1,211px あふれた）
pages = [rest[k:k + PER] for k in range(0, len(rest), PER)]
for k, page in enumerate(reversed(pages)):
    lo, hi = page[-1]["rank"], page[0]["rank"]
    rows = "".join(
        '<div class="li"><span class="n">%d</span>%s<span>%s</span>'
        '<span class="v">%s</span></div>'
        % (r["rank"], ('<img src="%s" alt="">' % (ICON % r["icon"])) if r.get("icon")
           else '<span></span>', e(r["display"]), "{:,}".format(r["yen"]))
        # 面の中も低いほうを上にする
        for r in reversed(page))
    scene("""<div class="kicker">投げ銭ありがとう %d / %d</div>
      <h2>%d位 〜 %d位</h2><div class="list">%s</div>"""
          % (k + 1, len(pages) + 3, lo, hi, rows),
          "投げ銭一覧%d" % (k + 1))

for n, r in enumerate(reversed(TIPS[:3])):
    scene("""<div class="kicker">投げ銭ありがとう　第%d位</div>
      <div class="mid" style="align-items:center">
        <img src="%s" alt="" data-step="1"
             style="width:calc(260*var(--u));height:calc(260*var(--u));border-radius:50%%;
             border:calc(8*var(--u)) solid var(--paper);background:var(--paper);object-fit:cover">
        <div data-step="1" style="font-family:var(--disp);font-weight:800;
             font-size:calc(64*var(--u));margin-top:calc(32*var(--u))">%s</div>
        <div data-step="2" style="font-family:var(--num);font-weight:700;
             font-size:var(--t-hero);color:var(--gold);margin-top:calc(18*var(--u))">%s<small
             style="font-family:var(--body);font-size:var(--t-sub)">円</small></div>
      </div>""" % (r["rank"], ICON % r["icon"], e(r["display"]),
                   "{:,}".format(r["yen"])),
          "投げ銭%d位" % r["rank"], total=2, confetti=(r["rank"] == 1))

# ── 手紙 → エンディング
scene("""<div class="kicker">あやと島案内鳥 から</div>
  <div class="mid"><div class="sheet">
    <div class="quote" style="font-size:calc(40*var(--u))">この35日で、島に写真が102枚貼られました。
そこに22人が立って、カードは430枚になりました。

付箋は67枚。そのうちの1枚に書いてあった
「ヴォドノ山頂に建つ 大きな十字架」へ、
きょう、ほんとうに登りました。

貼った場所に、配信が行きました。
来月もどこかへ連れていってください。</div>
    <div class="by">あやと島案内鳥</div>
  </div></div>""", "手紙")
scene("""<div class="mid" style="align-items:center;text-align:center">
    <h1 style="font-size:calc(96*var(--u))">また来月</h1>
    <p class="lede" style="margin-top:28px">11月は、北マケドニアのつづきから。</p>
  </div>""", "エンディング", strip(["2026-10-30"]))


ENGINE = """
<div class="conf" id="conf"></div>
<div class="dots" id="dots"></div>
<script>
/* 送り。作法は 2026-10 版と同じにしてある（`data-step` を付けた要素が段ごとに出る）。
   Enter / → / ↓ / Space で進み、Backspace / ← / ↑ で戻る。
   数字キーはコーナーの頭出し（リハーサル用）。
   **Firestore 越しの遠隔操作は、ここに同じ形で挿せる**（gotoScene を呼ぶだけ）。 */
(function () {
  var S = [].slice.call(document.querySelectorAll("section.scene"));
  var conf = document.getElementById("conf"), dots = document.getElementById("dots");
  var i = 0, step = 0;
  var slow = matchMedia("(prefers-reduced-motion: reduce)").matches;

  S.forEach(function () { var b = document.createElement("i"); dots.appendChild(b); });
  var CORNER = S.map(function (s) {
    return (s.querySelector(".kicker") || {}).textContent || "";
  });

  function total(n) { return Number(S[n].dataset.total || 0); }

  function paint() {
    S.forEach(function (s, n) { s.classList.toggle("live", n === i); });
    [].forEach.call(dots.children, function (b, n) { b.classList.toggle("now", n === i); });
    S[i].querySelectorAll("[data-step]").forEach(function (el) {
      el.classList.toggle("on", Number(el.dataset.step) <= step);
    });
    if (S[i].dataset.confetti && step >= total(i)) burst();
  }
  function goto_(n, st) {
    i = Math.max(0, Math.min(S.length - 1, n));
    step = Math.max(0, Math.min(total(i), st || 0));
    paint();
  }
  function fwd() {
    if (step < total(i)) { step++; paint(); }
    else if (i < S.length - 1) { goto_(i + 1, 0); }
  }
  function back() {
    if (step > 0) { step--; paint(); }
    else if (i > 0) { goto_(i - 1, total(i - 1)); }
  }
  /* 紙吹雪。**賞の面だけ。** 毎面で降らせると、頂点が頂点に見えなくなる */
  function burst() {
    if (conf.childElementCount || slow) return;
    var c = ["#e0b64e", "#c8442f", "#4e7a52", "#f7f1e6"];
    for (var k = 0; k < 90; k++) {
      var b = document.createElement("b");
      b.style.left = (Math.random() * 100) + "vw";
      b.style.top = (-10 - Math.random() * 20) + "vh";
      b.style.background = c[k % c.length];
      b.style.animationDelay = (Math.random() * 0.8) + "s";
      conf.appendChild(b);
    }
    setTimeout(function () { conf.innerHTML = ""; }, 4200);
  }

  addEventListener("keydown", function (ev) {
    var k = ev.key;
    if (k === "Enter" || k === " " || k === "ArrowRight" || k === "ArrowDown") {
      ev.preventDefault(); fwd();
    } else if (k === "Backspace" || k === "ArrowLeft" || k === "ArrowUp") {
      ev.preventDefault(); back();
    } else if (/^[0-9]$/.test(k)) {
      /* コーナーの頭出し。同じ見出しが続くぶんは、その先頭へ */
      var seen = [], at = -1;
      for (var n = 0; n < S.length; n++) {
        if (CORNER[n] && CORNER[n] !== CORNER[n - 1]) seen.push(n);
      }
      if (seen[Number(k)] != null) goto_(seen[Number(k)], 0);
    }
  });
  addEventListener("pointerdown", function (ev) { if (ev.button !== 2) fwd(); });
  addEventListener("contextmenu", function (ev) { ev.preventDefault(); back(); });

  /* 確かめ用の口。2026-10 版と同じ名前にしてある */
  window.__jump = function (n, st) { goto_(n, st == null ? 0 : st); };
  window.__sceneCount = S.length;
  window.__state = function () { return { scene: i, step: step, total: total(i) }; };

  /* **狭い画面は読むためのもの。** 送りを使わず、全部出して縦に並べる */
  if (matchMedia("(max-width: 1000px)").matches) {
    S.forEach(function (s) {
      s.classList.add("live");
      s.querySelectorAll("[data-step]").forEach(function (el) { el.classList.add("on"); });
    });
    dots.style.display = "none";
  } else { goto_(0, 0); }
})();
</script>
"""

doc = ('<!doctype html><meta charset="utf-8"><title>10月のふりかえり授賞式（組み直し）</title>'
       '<link rel="preconnect" href="https://fonts.googleapis.com">'
       '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
       '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
       'family=Shippori+Mincho+B1:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900'
       '&family=Roboto+Mono:wght@700&display=swap">'
       '<style>%s</style>%s%s' % (CSS, "".join(S), ENGINE))
out = OUT
out.write_text(doc, encoding="utf-8")
print("書いた", out, "%.0f KB / %d面" % (out.stat().st_size / 1024, len(S)))
