/**
 * 台所（`/kitchen/*`）の「この晩ここにいた人」の絵が、**自分の器から
 * はみ出していないか**を数える。図鑑の `dexfit.mjs` と対になるもの。
 *
 *   tools/build.sh 3200
 *   python3 -m http.server 4300 --directory site/.next-3200 &
 *   SPORT=4300 node tools/sprites/kdfit.mjs      # 0=通った / 1=見つかった / 2=数えるものが無い
 *
 *   ORIGIN=https://live-streaming-d3cac.web.app node tools/sprites/kdfit.mjs
 *
 * **4190 を配り先に使わない。** Chrome も node の fetch も「危ない口」として
 * 塞いでいて（ManageSieve）、絵が全部「配られていない」に化ける（#167）。
 *
 * ## 出したあとは、本番の画素で数える（`ORIGIN=`）
 *
 * 手元の書き出しで 0件になっても、それは**出す前のもの**でしか言えていない。
 * 「直したと言う前に、本番の値で確かめる」（`island-misses.md` #1）ので、
 * `ORIGIN` を渡したら localhost ではなく**出したバイト列**を開く。
 * `dexfit.mjs` と同じ形にしてある（**本番に向けられない見張りは、出したあとの
 * 確認に使えない**。台所だけ手元しか見られない、という差を残さない）。
 *
 * **この箱のブラウザは本番に直接届かない**（proxy が ERR_CONNECTION_RESET）。
 * なので `prod.mjs` の `viaCurl(ctx)` に要求を横取りさせて curl から取る。
 * 止めた先・たどった先・小さすぎた本文は**表に出して、止めた先が1つでもあれば
 * 数字を出さずに落ちる。** 通っていない先があると、面は壊れているのではなく
 * **飢える**。ここは絵を数える道具なので、飢えはそのまま「はみ出し 0件」という
 * 嘘の合格になる（#157）。
 *
 * 差し替え（`route.mjs` の `offline`）は本番モードでは**掛けない。**
 * 手元の絵を返してしまうと、見ているのは本番の画素ではなくなる。
 *
 * **面の名前は拡張子で分かれる。** 静的に配ったものは `.html` を付けないと
 * 引けないが、本番の Hosting は拡張子なしで配る。間違えると 404 を掴んで
 * 「絵が0枚」になり、直っているものが壊れて見える。
 *
 * **分母は本番モードでも手元の焼き込み**（`site/content/kitchenTalk.ts`）から取る。
 * 台所の人数を返す口は無いので、ここだけは持ってこられない。ということは
 * **出した中身とこの枝の焼き込みがずれていたら、枚数が合わずに 2 で落ちる。**
 * それでよい——ずれているのに数字を出すほうが悪い。
 *
 * **時間がかかる。** 1面あたり79本を curl 越しに取るので、本番で4幅を回すと
 * 35面 × 4 = 140回の読み込みになる（実測 1面 4秒・全体で10分前後）。
 * 急ぐときは `WIDTHS=1000` だけにする——**壊れるのは 720px 以上だけ**なので、
 * 器の形を見るぶんにはそれで足りる（4幅ぜんぶは「他の幅を壊していないか」）。
 *
 * ## なぜ要るか
 *
 * `.kd-folks img`（`site/app/css/streams.css`）は 720px 以上で **66×76px** だった。
 * すぐ上のコメントに「器は正方形にする。`charFit` の寄せは器に対する割合で
 * 書いてあるので、縦横が違うとずれる」と**自分で書いてあるのに、守れていなかった**。
 * 図鑑で同じ形を直した回（#167）の、もう一方（`docs/island-misses.md` #170）。
 *
 * 縦長の器に `object-fit: contain` で絵を入れると、**どちらの辺で頭打ちに
 * なるかが絵ごとに入れ替わる。** `charFit` は「器は正方形」として置き場所を
 * 決めているので、平たく描かれた人ほど横へ押し出される。実測で、器 66×76 では
 * いちばん平たい1枚が **2.46px** 外に出ていた（器 66×66 では 0.04px）。
 *
 * 目で見て気づけない。187枚の中の1枚が 2px 横へずれていても「そういう絵」に見える。
 * **数える。**
 *
 * ## 見るもの
 *
 *   器の形   … 変形をかける前の `<img>` の箱が正方形か。`charFit` の前提そのもの。
 *              ここが崩れると、下の「はみ出し」は**原因ではなく結果**として出る
 *   はみ出し … 描かれた画素の外接矩形が、その人の `li` から出ていないか。
 *              `li` は絵の箱そのものなので、出たぶんは**隣の人の場所**に描かれる
 *   ばらつき … 描かれた大きさ（幅と高さの相乗平均）が中央値から ±10% に収まるか。
 *              **0人にはならない**（`charFit` の背丈の頭打ち 0.85〜1.25）。減ったかを見る
 *   紙のまま … 透過を1画素も持たない絵。焼いた箱が「枠いっぱい」としか言えない
 *
 * **絵の id も視聴者さんの名前も出さない。** 面（料理の slug）と、その面の
 * 何人目か、だけで名指しできる。
 *
 * ## 数える前に、まず対照
 *
 * 本物の数字を出す前に、`.kd-folks` の末尾へ**同じ絵で守りの有無だけ違う**
 * li を足して測る。
 *
 *   守りを外した … 直す前の器（66×76）。**ここで落ちなければ、この道具は
 *                  何も見ていない**
 *   出してよい   … 直したあとの器（66×66）。**ここで落ちたら、通した数字も
 *                  信じられない**
 *
 * 対照に使う絵は**いちばん平たく描かれている3人**を自分で選ぶ。平たい絵ほど
 * 縦長の器で横へ押し出されるので、そこが再現しなければ守りは効いていない。
 * 選ぶ物差し（描かれた幅÷高さ）は判定とは別物——器の形も倍率も見ていない、
 * **絵そのものの比**なので、判定で判定を確かめることにはならない。
 *
 *   BREAK=ink    描かれた画素ではなく `<img>` の箱で測る
 *   BREAK=cell   器の矩形ではなく画面ぜんぶと比べる
 *   BREAK=square 器の形を見ない
 *
 * どれを1本抜いても対照が落ちる（3通りとも確かめた。手元でも本番でも）。
 *
 * 本番モードには足がもう1本ある。**通していない先があると面は飢える**ので、
 * そこに気づけるかを `STARVE=` で確かめる。
 *
 *   STARVE='plain-256' ORIGIN=… node tools/sprites/kdfit.mjs
 *
 * **台所の絵がどこから来ているかは、測って決めた。** 本番の
 * `/kitchen/karaage-teishoku` を開いて、`.kd-folks img` の `currentSrc` を
 * 読んだ実測がこれ:
 *
 *   https://live-streaming-d3cac.web.app/island-api/characters/<id>/plain-256.webp
 *
 * **置き場を直に指していない。** 同じ生まれでも、面が読んでいるのは島の口の
 * ほう（リダイレクトも無く 200 が返る。curl のヘッダで確かめた）。だから
 * `STARVE='storage.googleapis'` も `STARVE='firebasestorage'` も**何も止めない。**
 * 止めた気になって「落ちなかった＝大丈夫」と読まないこと（`dexfit.mjs` が
 * 図鑑で1度踏んでいる）。**幅も違う。** 図鑑は `plain-128`、台所は `plain-256` を
 * 読んでいるので、`STARVE='plain-128'` でも台所は1枚も止まらない。
 *
 * ## 出す順番
 *
 * 対照に使う絵を選ぶには、先に絵の画素を読む必要がある。だから**測ってから
 * 対照を回し、対照が通ったときだけ数字を出す**（落ちたら1行も出さない）。
 * 数える順番と、見せる順番は別でよい。
 */
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { offline } from "./route.mjs";
import { repoPath } from "./repo.mjs";
import { blocked, redirects, thin, viaCurl } from "./prod.mjs";
import { INK, MEASURE, bakedSame, judge } from "./fitmeasure.mjs";

const SPORT = process.env.SPORT || "4300";
/** 渡されたら本番モード。空なら今までどおり localhost の書き出しを見る */
const ORIGIN = (process.env.ORIGIN || "").replace(/\/$/, "");
/* 静的に配ったものは `.html` が要るが、本番の Hosting は拡張子なしで配る。
   **ここを間違えると 404 を掴んで「絵が0枚」になり、直っているものが壊れて見える** */
const href = (slug) => (ORIGIN ? `${ORIGIN}/kitchen/${slug}` : `http://localhost:${SPORT}/kitchen/${slug}.html`);
const AT = ORIGIN ? `本番 ${ORIGIN}/kitchen/*` : `手元 http://localhost:${SPORT}/kitchen/*.html`;
/** 対照。本番モードでこの先を止めて、**飢えに気づくか**を見る
 *  （`STARVE='plain-256' ORIGIN=… node …` で落ちなければ、その足は何も見ていない） */
const STARVE = process.env.STARVE || "";
/** curl 経由は本数ぶん時間がかかるので、本番は待ちを長く取る */
const TMO = ORIGIN ? 180000 : 30000;
const WIDTHS = (process.env.WIDTHS || "320,390,640,1000").split(",").map(Number);
const BREAK = process.env.BREAK || "";
/** 何も見つからなかった面も1行ずつ出す */
const ALL = process.env.KDALL === "1";
/** ±何%を「そろっている」とするか */
const TOL = 0.1;
/** 何px 出たら「はみ出し」と数えるか（`dexfit.mjs` と同じ） */
const EDGE = 1;

const { drawn, flat, out } = judge(BREAK);
const say = [];
const fail = [];
const note = [];

/* ───────── 焼き直しで消えないか（ブラウザの前に、字で） ───────── */

const baked = bakedSame();
if (!baked.ok) {
  console.log(`::error::${baked.why}`);
  process.exit(2);
}
note.push(baked.note);

/* ───────── 何面あって、何枚あるはずか（分母） ───────── */

/**
 * 焼き込み（`site/content/kitchenTalk.ts`）から、面ごとの人数を読む。
 * **画面から数えた枚数を分母にしない。** 絵が1枚も出ていない日があっても
 * 「0枚ぜんぶ通った」で緑になる（`island-standards.md` 13）。
 *
 * `KitchenDay` は `people` が 0 の日は何も描かないので、そこは数えない。
 */
const TALK = readFileSync(repoPath("site/content/kitchenTalk.ts"), "utf8");
const PAGES = [];
for (const m of TALK.matchAll(/^\s*"([a-z0-9-]+)":\s*\{\s*people:\s*(\d+),[^\n]*?there:\s*\[([^\]]*)\]/gm)) {
  const there = [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (Number(m[2]) > 0 && there.length) PAGES.push({ slug: m[1], there });
}
const WANT = PAGES.reduce((a, p) => a + p.there.length, 0);
if (!PAGES.length) {
  console.log("::error::kitchenTalk.ts から面を1つも読めませんでした");
  process.exit(2);
}

/* ───────── ブラウザ ───────── */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/**
 * 取りに行って**返ってこなかった要求**（ctx ごと）。
 *
 * `prod.mjs` の `blocked()` は**ホスト名しか持たない。** 本番は要求の 98% が
 * 同じホスト（`live-streaming-d3cac.web.app`）なので、1本こけたときに
 * 「`live-streaming-d3cac.web.app(取れず) ×1`」としか出ず、**絵なのか
 * 束ねた JS なのか書体なのかが分からない。** 直すにも、もう一度回すかを
 * 決めるにも、どれが落ちたかが要る。ここで URL ごと控えておく。
 *
 * **`net::ERR_ABORTED` は数えない。** ここは1つの page で35面を続けて開くので、
 * 次の面へ行った時点で、まだ来ていない要求はブラウザが自分で取り消す。
 * それを数えると**1幅あたり数百本の「落ちた」**が出る（実際に出した。
 * 束ねた JS も書体も並ぶので、読むと本番が壊れているように見える）。
 * 止めたぶん（`r.abort()`）と取れなかったぶんは `net::ERR_FAILED` で来るので、
 * そちらだけ残す。
 */
const MISSED = new WeakMap();

async function open(width) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  MISSED.set(ctx, []);
  if (ORIGIN) {
    ctx.on("requestfailed", (r) => {
      const why = r.failure()?.errorText || "?";
      if (why.includes("ABORTED")) return; // 面を次へ送ったときの取り消し。落ちてはいない
      MISSED.get(ctx).push(`${why}  ${r.resourceType()}  ${r.url()}`);
    });
    /* **差し替えは掛けない。** 手元の絵を返したら、見ているのは本番の画素で
       なくなる。島の口も置き場も `prod.mjs` の `PASS` に入っているので、
       curl 経由で本物が来る */
    await viaCurl(ctx);
    if (STARVE) {
      /* 対照の足。**`viaCurl` が使っているのと同じ数えもの**に足す（`blocked()` は
         写しではなく本体を返す）。別の数えものを立てると、通してあるのに
         気づかない穴をそのまま残すことになる。あとから登録した route が先に効く */
      await ctx.route(new RegExp(STARVE), (r) => {
        const m = blocked(ctx);
        const h = (() => { try { return new URL(r.request().url()).host; } catch { return STARVE; } })();
        m.set(h, (m.get(h) || 0) + 1);
        return r.abort();
      });
    }
  } else {
    await offline(ctx);
  }
  const p = await ctx.newPage();
  return { ctx, p };
}

/** その面を開いて、`.kd-folks` の絵が全部届くまで待つ */
async function visit(p, slug) {
  /* 本番は絵を curl で取るので `load` まで待つと届かないことがある。
     面そのものが来たかだけを見て、絵は下の待ちで数える */
  const res = await p
    .goto(href(slug), { waitUntil: ORIGIN ? "domcontentloaded" : "load", timeout: TMO })
    .catch(() => null);
  if (!res || res.status() >= 400) return false;
  // 畳んだ中・画面の外の絵は要求されない。全部剥がしてから測る
  await p.evaluate(() => {
    for (const im of document.querySelectorAll(".kd-folks img")) im.loading = "eager";
  });
  await p
    .waitForFunction(
      () => [...document.querySelectorAll(".kd-folks img")].every((im) => im.complete),
      { timeout: TMO },
    )
    .catch(() => {});
  await p.waitForTimeout(80);
  return true;
}

/**
 * 止めた先・たどった先・小さすぎた本文を表に出す。**止めた先が1つでもあれば false。**
 *
 * 通していない先があると、面は壊れているのではなく**飢えている。**
 * 取れなかった絵はそもそも描かれないので、はみ出しようがない——
 * **そのまま「はみ出し 0件」という合格に化ける**（#157）。
 */
function fed(ctx, label) {
  if (!ORIGIN) return true;
  let ok = true;
  for (const [from, to] of redirects(ctx)) console.log(`   ⇢ ${label} たどった ${from} → ${to}`);
  for (const [u, n] of thin(ctx)) {
    ok = false;
    console.log(`::error::${label} 本文が ${n}B しかない: ${u}`);
  }
  for (const [host, n] of blocked(ctx)) {
    ok = false;
    console.log(`::error::${label} 外に出られなかった先: ${host} ×${n}（prod.mjs の PASS を見る）`);
  }
  // ホスト名だけでは、絵が落ちたのか束ねた JS が落ちたのかが分からない
  for (const u of MISSED.get(ctx) || []) console.log(`::error::${label}   ↳ ${u}`);
  return ok;
}

const die = async (msg) => {
  console.log(`::error::${msg}`);
  await b.close();
  process.exit(2);
};

/** 絵は幅を変えても同じ。1度読んだら使い回す */
const INKS = new Map();

/* ───────── 飢えていないか（本番モードだけ。絵を1枚読む前に） ───────── */

/* **順番が要る。** 取れなかった絵は描かれないので、はみ出しようがない。
   先に画素を読みに行くと「画素が読めません」で落ちて、飢えが
   「絵が壊れている」に化ける。だから1面だけ開いて、通っているかを先に見る。
   （幅ごとの終わりにも見る。面によって要求する先が増えることがあるので） */
if (ORIGIN) {
  const { ctx, p } = await open(WIDTHS[0]);
  const first = PAGES[0].slug;
  if (!(await visit(p, first))) {
    await ctx.close();
    await die(`${ORIGIN}/kitchen/${first} が開けません`);
  }
  const ok = fed(ctx, "下見");
  await ctx.close();
  if (!ok) await die("外に出られなかった先があります。飢えた面では数えません");
}

/* ───────── 本物の面（まだ出さない。対照が通ってから出す） ───────── */

let over = 0;
let notSquare = 0;
let seen = 0;
let worstPx = 0;
let paper = [];
let spreadWorst = null;
let starved = false;

for (const W of WIDTHS) {
  const { ctx, p } = await open(W);
  let wOver = 0;
  let wFlat = 0;
  let wSeen = 0;
  let boxSay = "";
  const sizes = [];
  const lines = [];
  for (const pg of PAGES) {
    if (!(await visit(p, pg.slug))) {
      await ctx.close();
      await die(`幅 ${W}: ${href(pg.slug)} が開けません`);
    }
    const rows = await p.evaluate(MEASURE, ".kd-folks > li");
    if (rows.length !== pg.there.length) {
      await ctx.close();
      await die(
        `幅 ${W}: ${pg.slug} に絵が ${rows.length}枚（kitchenTalk.ts は ${pg.there.length}枚）` +
          (ORIGIN
            ? "。**出したものとこの枝の焼き込みがずれています。**"
              + "先に焼き直しを出すか、出したときの枝で回すこと"
            : ""),
      );
    }
    for (const r of rows) {
      if (INKS.has(r.src)) continue;
      INKS.set(r.src, await p.evaluate(INK, r.src));
    }
    const unread = rows.filter((r) => !INKS.get(r.src));
    if (unread.length) {
      await ctx.close();
      await die(`幅 ${W}: ${pg.slug} で画素を読めなかった絵が ${unread.length}枚`);
    }
    const bad = [];
    const flats = [];
    for (const r of rows) {
      wSeen++;
      if (!boxSay) boxSay = `${r.boxW.toFixed(0)}×${r.boxH.toFixed(0)}px`;
      const ink = INKS.get(r.src);
      const o = out(r, ink);
      if (o > worstPx) worstPx = o;
      if (o > EDGE) bad.push({ n: r.n, o });
      if (flat(r) > EDGE) flats.push({ n: r.n, w: r.boxW, h: r.boxH });
      const d = drawn(r, ink);
      sizes.push({ slug: pg.slug, n: r.n, size: Math.sqrt(d.w * d.h) });
      // 透過を持たない絵は、幅によらず同じ。最初の幅でだけ拾う
      if (W === WIDTHS[0] && !ink.clear) paper.push(`${pg.slug} の${r.n}人目`);
    }
    wOver += bad.length;
    wFlat += flats.length;
    if (ALL || bad.length || flats.length) {
      lines.push(
        `   ${pg.slug} ${rows.length}枚 … 器が正方形でない ${flats.length} / はみ出し ${bad.length}` +
          (flats.length ? `（器 ${flats[0].w.toFixed(1)}×${flats[0].h.toFixed(1)}）` : "") +
          (bad.length ? `　★ ${bad.map((x) => `${x.n}人目 ${x.o.toFixed(2)}px`).join(" / ")}` : ""),
      );
    }
  }
  const sorted = [...sizes].sort((a, c) => a.size - c.size);
  const mid = sorted[Math.floor(sorted.length / 2)].size;
  const off = sizes.filter((s) => Math.abs(s.size / mid - 1) > TOL);
  const ratio = sorted[sorted.length - 1].size / sorted[0].size;
  if (!spreadWorst || ratio > spreadWorst.r) spreadWorst = { W, r: ratio };
  over += wOver;
  notSquare += wFlat;
  seen += wSeen;
  say.push(
    `■ 幅 ${W}  ${PAGES.length}面 ${wSeen}枚  器 ${boxSay}  ` +
      `描かれた大きさ 中央値 ${mid.toFixed(1)}px（${sorted[0].size.toFixed(1)}〜${sorted[sorted.length - 1].size.toFixed(1)}）`,
  );
  say.push(
    `   器が正方形でない ${wFlat}枚 / はみ出し ${wOver}枚 / ±${TOL * 100}% を外れる ${off.length}枚`,
  );
  say.push(...lines);
  if (!fed(ctx, `幅 ${W}`)) starved = true;
  await ctx.close();
}

/* ───────── 対照 ───────── */

/**
 * いちばん平たく描かれている絵から順に3枚。**器の形も倍率も見ていない**、
 * 絵そのものの比（描かれた幅÷高さ）で選ぶ。
 *
 * **絵を差し替えた写しは対照に使えない。** `charFit` の `transform` は絵ごとに
 * 違う値が `style` に焼かれているので、写しの `src` だけ替えると「別の人の
 * 寄せで置かれた絵」になる。守りを外しても押し出されず、対照が黙って通る
 * （実際にそうなった）。だから**その絵がもともと居る面**から写す。
 */
const FLATNESS = [...INKS.entries()]
  .filter(([, ink]) => ink)
  .map(([src, ink]) => ({ src, r: (ink.box[2] * ink.ar) / ink.box[3] }))
  .sort((a, c) => c.r - a.r);
if (!FLATNESS.length || FLATNESS[0].r < 1.25) {
  await die(
    "対照に使える平たい絵がありません（描かれた幅÷高さ が 1.25 を超えるものが1枚もない）。" +
      "縦長の器でも押し出されないので、この道具は守りを確かめられません",
  );
}
/** 絵の置き場の名前（`/island-api/characters/<ここ>/plain-256.webp`） */
const idOf = (src) => (src.split("/characters/")[1] || "").split("/")[0];
/**
 * 平たい順に3枚。**それぞれ、その絵がもともと居る面へ出かけて写す。**
 * 1つの面に3枚とも居るとは限らないので、面のほうを絵に合わせる。
 */
const PROBES = [];
for (const f of FLATNESS) {
  const id = idOf(f.src);
  if (PROBES.some((x) => x.id === id)) continue;
  const pg = PAGES.find((q) => q.there.includes(id));
  if (!pg) continue;
  PROBES.push({ id, slug: pg.slug, r: f.r });
  if (PROBES.length === 3) break;
}
if (!PROBES.length) await die("対照に使う平たい絵が、どの面にも居ません");

{
  // 直っていれば 720px 以上でしか壊れないので、対照もそこで回す
  const { ctx, p } = await open(1000);
  const bal = [];
  const seenPairs = [];
  /** 写しを2枚足して測る。**足せなかった・届かなかったら空**を返す */
  const probe = async (id0) => {
    const made = await p.evaluate(
      ([id]) => {
        const ul = document.querySelector(".kd-folks");
        if (!ul) return 0;
        const base = [...ul.querySelectorAll("li")].find(
          (li) => (((li.querySelector("img") || {}).src || "").split("/characters/")[1] || "").split("/")[0] === id,
        );
        if (!base) return 0;
        for (const kind of ["bad", "good"]) {
          const li = base.cloneNode(true);
          li.dataset.probe = kind;
          const im = li.querySelector("img");
          im.loading = "eager";
          // **面の CSS に頼らない。** この道具は直す前の書き出しに対しても
          // 回るので、守りの有無は対照の中で自分で立てる
          im.style.width = "66px";
          im.style.height = kind === "bad" ? "76px" : "66px";
          ul.appendChild(li);
        }
        return 1;
      },
      [id0],
    );
    if (!made) return [];
    await p
      .waitForFunction(
        () => [...document.querySelectorAll(".kd-folks img")].every((im) => im.complete),
        { timeout: TMO },
      )
      .catch(() => {});
    await p.waitForTimeout(150);
    return (await p.evaluate(MEASURE, ".kd-folks > li")).filter((r) => r.probe);
  };

  for (const pb of PROBES) {
    /* **面が来ないことが、本番では 150回に1回ある。** curl 越しに79本
       取ってくるので、どれか1本の取りこぼしで `.kd-folks` の無い形が残る。
       そのまま進むと「対照の li が 0枚」という、**守りとは関係のない理由**で
       落ちる（実際に1度出した。読んだ人は判定のほうが壊れたと思う）。
       開き直しは**届いたかどうか**だけを変えるもので、判定は1文字も変えない。
       だからここだけ2回まで開く。2回とも来なければ、そのまま落とす。 */
    let rows = [];
    for (let n = 1; n <= 2; n++) {
      if (await visit(p, pb.slug)) rows = await probe(pb.id);
      if (rows.length === 2) break;
      if (n === 2) {
        await ctx.close();
        await die(
          `対照の li が ${rows.length}枚しか測れませんでした（2枚要る。${href(pb.slug)}）`,
        );
      }
    }
    const bad = rows.find((r) => r.probe === "bad");
    const good = rows.find((r) => r.probe === "good");
    for (const r of rows) if (!INKS.has(r.src)) INKS.set(r.src, await p.evaluate(INK, r.src));
    const ink = INKS.get(bad.src);
    const bo = out(bad, ink);
    const go = out(good, ink);
    // **置き場所そのものが器の形で動いているか。** はみ出しは平たい絵でしか
    // 1px を超えないので、そこだけ見ると残り2枚は何も確かめていないことになる。
    // 写しは同じ面・同じ絵・同じ並びなので、器の形以外に動く理由が無い
    // **器の中での位置**で比べる。2つの写しは並びの別々の場所に置かれるので、
    // 画面の座標で引くと「行が変わったぶん」が出るだけになる（70px そろって出た）
    const rel = (m) => {
      const d = drawn(m, ink);
      return { L: d.L - m.cell.x, T: d.T - m.cell.y, R: m.cell.x + m.cell.w - (d.L + d.w), B: m.cell.y + m.cell.h - (d.T + d.h) };
    };
    const db = rel(bad);
    const dg = rel(good);
    const move = Math.max(
      Math.abs(db.L - dg.L),
      Math.abs(db.T - dg.T),
      Math.abs(db.R - dg.R),
      Math.abs(db.B - dg.B),
    );
    seenPairs.push({ ...pb, bo, go, move, badFlat: flat(bad) > EDGE, goodFlat: flat(good) > EDGE });
    if (!(flat(bad) > EDGE)) bal.push(`${pb.slug}: 守りを外した器（66×76）が、縦長に見えていない`);
    if (flat(good) > EDGE) bal.push(`${pb.slug}: 出してよい器（66×66）が正方形でない`);
    if (go > EDGE) bal.push(`${pb.slug}: 出してよい器なのに ${go.toFixed(2)}px 落ちる`);
    if (move <= EDGE) bal.push(`${pb.slug}: 器の形を変えても、絵の置き場所が ${move.toFixed(2)}px しか動かない`);
  }
  const worstBad = Math.max(...seenPairs.map((x) => x.bo));
  if (worstBad <= EDGE) {
    bal.push(`守りを外した ${seenPairs.length}枚が1枚も器から出ない（最大 ${worstBad.toFixed(2)}px）`);
  }
  if (!fed(ctx, "対照")) bal.push("対照の面が飢えている（外に出られなかった先がある）");
  await ctx.close();
  if (bal.length) {
    console.log("::error::対照が外れました。本物の面の数字は出しません");
    for (const line of bal) console.log(`::error::  ${line}`);
    await b.close();
    process.exit(2);
  }
  note.push(`対照 ${seenPairs.length * 2}件（守りを外した器 66×76 ／ 出してよい器 66×66）`);
  for (const x of seenPairs) {
    note.push(
      `  ${x.slug} の平たい絵（描かれた幅÷高さ ${x.r.toFixed(2)}）… ` +
        `はみ出し 守り無し ${x.bo.toFixed(2)}px → 守り有り ${x.go.toFixed(2)}px / ` +
        `置き場所の動き ${x.move.toFixed(2)}px`,
    );
  }
}

/* ───────── 出す ───────── */

for (const line of say) console.log(line);
console.log("");
console.log(`   見たもの: ${AT}`);
for (const line of note) console.log(`   ${line}`);
console.log(
  `合計  幅 ${WIDTHS.length}とおり / ${PAGES.length}面 ${WANT}枚 / 数えた ${seen}枚 / ` +
    `画素を読んだ絵 ${INKS.size}枚`,
);
console.log(
  `      いちばんばらつく幅 ${spreadWorst.W}px で 最大÷最小 ${spreadWorst.r.toFixed(3)}倍 / ` +
    `いちばん外へ出ている絵 ${worstPx.toFixed(2)}px`,
);
if (paper.length) {
  // **絵の id も名前も出さない。** 直せる人には面と並び順で足りる
  console.log(
    `      透過を1画素も持たない絵 ${paper.length}枚（${paper.join(" / ")}）` +
      " … 絵そのものの話なので、焼き直しでは直らない",
  );
}

if (over) fail.push(`器からはみ出している絵が ${over}件`);
if (notSquare) fail.push(`器が正方形でない絵が ${notSquare}件`);
/* **飢えたまま出た 0件は、合格ではない。** 取れなかった絵はそもそも
   描かれないので、はみ出しようがない（#157 の「測れていないものを 0 で出す」） */
if (starved) fail.push("外に出られなかった先がある。この数字は当てにならない");

await b.close();
if (fail.length) {
  for (const line of fail) console.log(`::error::${line}`);
  process.exit(1);
}
console.log("      はみ出し 0件");
process.exit(0);
