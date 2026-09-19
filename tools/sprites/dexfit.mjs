/**
 * 図鑑（`/friends`）の絵が、**自分のマスからはみ出していないか**を数える。
 *
 *   tools/build.sh 3190
 *   python3 -m http.server 4290 --directory site/.next-3190 &
 *   SPORT=4290 node tools/sprites/dexfit.mjs      # 0=通った / 1=見つかった / 2=数えるものが無い
 *
 *   ORIGIN=https://live-streaming-d3cac.web.app node tools/sprites/dexfit.mjs
 *
 * **4190 は使わない。** Chrome も node の fetch も「危ない口」として塞いでいて
 * （ManageSieve）、node からは `bad port` で1本も取りに行けない。
 * 絵が全部「配られていない」に化ける（`crawl.mjs` で実際に踏んだ）。
 *
 * ## 出したあとは、本番の画素で数える（`ORIGIN=`）
 *
 * 手元の書き出しで 0件になっても、それは**出す前のもの**でしか言えていない。
 * 「直したと言う前に、本番の値で確かめる」（`island-misses.md` #1）ので、
 * `ORIGIN` を渡したら localhost ではなく**出したバイト列**を開く。
 *
 * **この箱のブラウザは本番に直接届かない**（proxy が ERR_CONNECTION_RESET）。
 * なので `prod.mjs` の `viaCurl(ctx)` に要求を横取りさせて curl から取る。
 * 絵の置き場（`firebasestorage.googleapis.com`）は `prod.mjs` の `PASS` に
 * 入っているので通る。**通らない先があると、面は壊れているのではなく飢える。**
 * 飢えを壊れと読んだことが3回あるので（`prod.mjs` の `PASS` のコメント）、
 * 止めた先・たどった先・小さすぎた本文を**撮るたびに表に出して、止めた先が
 * 1つでもあれば数字を出さずに落ちる。**
 *
 * 本番モードでは名簿も**本番の口から**その場で取る（`/tmp/ch.json` に
 * 頼らない）。古い写しを分母に置くと、増減したときに「マスが足りない」で
 * 落ちるか、悪ければ**測れていないものを 0件として通す**（#157）。
 *
 * 差し替え（`route.mjs` の `offline`）は本番モードでは**掛けない。**
 * 手元の絵を返してしまうと、見ているのは本番の画素ではなくなる。
 *
 * ## なぜ要るか
 *
 * 一覧のマスの `<img>` に `height: 86%` を当てると、Chrome は絵の本来の高さを
 * 先に立ててから 86% を取る。128×192 の絵で 40.1 × 51.7px の**縦長の器**になり、
 * 「器は正方形」を前提に寄せを決めている `charFit`（`site/content/characterBox.ts`）が
 * そのまま当たって、絵がマスの下へ 16.1px（マスの約1/3）はみ出していた。
 * **マスは `overflow: visible`** なので、はみ出したぶんは隣の人の場所に描かれる。
 *
 * 目で見ても気づきにくい。1枚だけ 1/3 下に出ている絵は、103枚の格子の中では
 * 「そういう絵」に見える。**数える。**
 *
 * ## 見るもの（どれも分母を出す）
 *
 *   器の形   … 変形をかける前の `<img>` の箱が正方形か。`charFit` の前提そのもの。
 *              ここが崩れると、下の「はみ出し」は**原因ではなく結果**として出る
 *   はみ出し … 描かれた画素の外接矩形が、マスの矩形から出ていないか
 *   ばらつき … 描かれた大きさ（幅と高さの相乗平均）が、中央値から ±10% に収まるか。
 *              **0人にはならない。** `charFit` は背丈に頭打ち（0.85〜1.25）を
 *              持っていて、平たい絵・細長い絵はそこに当たる。**減ったかを見る**
 *   紙のまま … 透過を1画素も持たない絵。焼いた箱（alpha の外接矩形）が
 *              「枠いっぱい」としか言えないので、**白い紙が人として数えられる**。
 *              絵を描き直せるのは本人だけなので、見つけたら**マスの番号で名指しする**
 *
 * ## 描かれた範囲は、焼いた表からではなく**画素から**取る
 *
 * `content/characterBox.ts` の `BOX` を読むと、透過を持たない絵で
 * 「枠いっぱい」という嘘の答えが返る。**その1人こそ見たい相手**なので、
 * ここでは絵を1枚ずつ canvas に落として、自分で外接矩形を測る
 * （透過があれば alpha、無ければ地の色との差）。
 * 幅を変えても絵は同じなので、測るのは1回だけで使い回す。
 *
 * ## 対照（`island-standards.md` 15）
 *
 * 本物の数字を出す前に、格子の末尾へ**わざと作った2マス**を足して測る。
 *
 *   はみ出す1マス  … 守りを外した姿（`aspect-ratio` を戻して `height: 86%`）。
 *                    **ここで落ちなければ、この道具は何も見ていない**
 *   収まる1マス    … 出してよい姿。**ここで落ちたら、通した数字も信じられない**
 *
 * 片側だけでは対照にならない。どちらか1つでも外れたら、本物の面の数字を
 * **1つも出さずに 2 で落ちる。**
 *
 *   BREAK=ink    描かれた画素ではなく `<img>` の箱で測る（前の測りかた）
 *   BREAK=cell   マスの矩形ではなく画面ぜんぶと比べる
 *   BREAK=square 器の形を見ない
 *
 * 本番モードには足がもう1本ある。**通していない先があると面は飢える**ので、
 * そこに気づけるかを `STARVE=` で確かめる。
 *
 *   STARVE='plain-128' ORIGIN=… node tools/sprites/dexfit.mjs
 *
 * 絵を止めた状態。ここで落ちなければ、飢えた面を 0件で通すということ。
 *
 * **図鑑の絵は置き場を直に指していない。** 名簿（`/island-api/characters`）が
 * 返す URL は `firebasestorage.googleapis.com` だが、面が実際に読んでいるのは
 * 同じ生まれの `/island-api/characters/<id>/plain-128.webp` のほう（実測）。
 * だから `STARVE='firebasestorage'` は**何も止めない。** 止めた気になって
 * 「落ちなかった＝大丈夫」と読まないこと。
 *
 * **足の数だけ用意する**（`island-standards.md` 15）。どれを1本抜いても
 * 対照が落ちる。落ちなければ、その足は最初から何も見ていない。
 *
 * ## 焼き直しで消えないこと
 *
 * `charFit` は `tools/sprites/charbox.py` が `characterBox.ts` ごと焼き直す。
 * 雛形が古いままだと、**次に焼いた晩に黙って元へ戻る。赤くならない。**
 * だからブラウザを立てる前に、2つの `charFit` が1文字まで同じかを見る。
 *
 * ## 測りかたは `fitmeasure.mjs` に置いてある
 *
 * 同じ前提を台所（`/kitchen/*`）でも外していた（#169）ので、器の箱・
 * 描かれた画素・はみ出しの測りかたは**1か所**に寄せた。ここに残るのは
 * 「図鑑ではどれが器で、何枚あるはずで、対照をどう作るか」と、本番モードだけ。
 * 台所の側は `tools/sprites/kdfit.mjs`。
 */
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { offline } from "./route.mjs";
import { blocked, fetchProd, redirects, thin, viaCurl } from "./prod.mjs";
import { INK, MEASURE, bakedSame, judge } from "./fitmeasure.mjs";

const SPORT = process.env.SPORT || "4290";
/** 渡されたら本番モード。空なら今までどおり localhost の書き出しを見る */
const ORIGIN = (process.env.ORIGIN || "").replace(/\/$/, "");
/* 静的に配ったものは `.html` を付けないと引けないが、本番の Hosting は
   拡張子なしで配る。**既定を分ける。** ここを間違えると 404 を掴んで
   「マスが0枚」になり、直っているものが壊れて見える */
const PAGE = process.env.PAGE || (ORIGIN ? "/friends" : "/friends.html");
const AT = ORIGIN ? `本番 ${ORIGIN}${PAGE}` : `手元 http://localhost:${SPORT}${PAGE}`;
/** 対照。本番モードでこの先を止めて、**飢えに気づくか**を見る
 *  （`STARVE='plain-128' ORIGIN=… node …` で落ちなければ、その足は何も見ていない） */
const STARVE = process.env.STARVE || "";
const WIDTHS = (process.env.WIDTHS || "320,390,640,1000").split(",").map(Number);
/** 手元モードで差し込む名簿。`curl -sSL .../island-api/characters > /tmp/ch.json`。
 *  **`-L` を付ける**（付けないとリダイレクトの本文21バイトを掴む。#164）。
 *  本番モードでは読まない——その場で本番の口から取る */
const CHJSON = process.env.CHJSON || "/tmp/ch.json";
const BREAK = process.env.BREAK || "";
/** ±何%を「そろっている」とするか */
const TOL = 0.1;

const fail = [];
const note = [];

/* ───────── 焼き直しで消えないか（ブラウザの前に、字で） ───────── */

const baked = bakedSame();
if (!baked.ok) {
  console.log(`::error::${baked.why}`);
  process.exit(2);
}
note.push(baked.note);

/* 測りかたは `fitmeasure.mjs`（台所の `kdfit.mjs` と同じものを使う）。
   面ごとに書き写すと、片方だけ直った測りかたができる（#160） */
const { drawn, flat, out } = judge(BREAK);

/* ───────── ブラウザ ───────── */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let CH = null;
if (ORIGIN) {
  /* **本番モードの名簿は、その場で本番の口から取る。** 手元の写しを分母に
     置くと、名簿が増減した晩に「マスが足りない」で落ちるか、悪ければ
     測れていないものを 0件として通す（#157）。`fetchProd` は `-L` 付きなので
     リダイレクトの本文21バイトを掴まない（#164） */
  try {
    const { body } = await fetchProd(`${ORIGIN}/island-api/characters`);
    CH = body.toString("utf8");
    JSON.parse(CH);
  } catch (e) {
    console.log(`::error::本番の名簿が取れません（${ORIGIN}/island-api/characters）: ${e.message}`);
    await b.close();
    process.exit(2);
  }
} else {
  try {
    CH = readFileSync(CHJSON, "utf8");
  } catch {
    console.log(`::error::本番の名簿がありません（${CHJSON}）。`);
    console.log("  curl -sSL https://live-streaming-d3cac.web.app/island-api/characters > /tmp/ch.json");
    await b.close();
    process.exit(2);
  }
}
const PEOPLE = (JSON.parse(CH).characters || []).filter((c) => c.plain?.sizes?.["128"]).length;

/** curl 経由は1本ずつ順に取るので、本番は待ちを長く取る */
const TMO = ORIGIN ? 180000 : 30000;

/**
 * 止めた先・たどった先・小さすぎた本文を表に出す。**止めた先が1つでもあれば false。**
 *
 * 通していない先があると、面は壊れているのではなく**飢えている。**
 * 見分けがつかないまま「本番の不具合」と読んだことが3回ある（`prod.mjs`）。
 * ここは絵を数える道具なので、飢えはそのまま「はみ出し」の嘘の数字になる。
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
  return ok;
}

async function open(width) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  if (ORIGIN) {
    /* **差し替えは掛けない。** 手元の絵を返したら、見ているのは本番の画素で
       なくなる。置き場は `PASS` に入っているので curl 経由で本物が来る */
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
    // 名簿は本番のものを返す。**あとから登録した route が先に効く**
    await ctx.route(/\/island-api\/characters(\?|$)/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: CH }),
    );
  }
  const p = await ctx.newPage();
  const url = ORIGIN ? `${ORIGIN}${PAGE}` : `http://localhost:${SPORT}${PAGE}`;
  /* 本番は絵を curl で1本ずつ取るので `load` まで待つと届かない。
     面そのものが来たかだけを見て、絵は下の待ちで数える */
  const res = await p
    .goto(url, { waitUntil: ORIGIN ? "domcontentloaded" : "load", timeout: TMO })
    .catch(() => null);
  if (!res || res.status() >= 400) return { ctx, p, ok: false };
  await p
    .waitForFunction((n) => document.querySelectorAll(".rzk-cell img").length >= n, PEOPLE, {
      timeout: TMO,
    })
    .catch(() => {});
  // 畳んだ中・画面の外の絵は要求されない。全部剥がしてから測る
  await p.evaluate(() => {
    for (const im of document.querySelectorAll(".rzk-cell img")) im.loading = "eager";
  });
  await p
    .waitForFunction(
      () => [...document.querySelectorAll(".rzk-cell img")].every((im) => im.complete),
      { timeout: TMO },
    )
    .catch(() => {});
  await p.waitForTimeout(600);
  return { ctx, p, ok: true };
}

/** 絵は幅を変えても同じ。1度読んだら使い回す */
const INKS = new Map();

/* ───────── 対照 ───────── */

{
  const { ctx, p, ok } = await open(390);
  if (!ok) {
    console.log(`::error::${AT} が開けません`);
    await b.close();
    process.exit(2);
  }
  /* **飢えは、絵を1枚読む前に見る。** 取れなかった絵は描かれないので
     はみ出しようがなく、そのまま「0件」という合格に化ける（#157） */
  if (!fed(ctx, "対照")) {
    console.log("::error::外に出られなかった先があります。飢えた面では数えません");
    await b.close();
    process.exit(2);
  }
  /* 格子の末尾に、**同じ絵で守りの有無だけ違う**マスを足す。
     縦長の絵でないと「器が縦に伸びる」が再現しないので、そこから選ぶ */
  const made = await p.evaluate(() => {
    const cells = [...document.querySelectorAll(".rzk-cell")];
    const tall = cells
      .filter((c) => {
        const im = c.querySelector("img");
        return im && im.naturalWidth > 0 && im.naturalHeight >= im.naturalWidth * 1.4;
      })
      .slice(0, 6);
    if (!tall.length) return 0;
    const grid = tall[0].parentElement;
    for (const kind of ["bad", "good"]) {
      for (const t of tall) {
        const c = t.cloneNode(true);
        c.dataset.probe = kind;
        c.classList.remove("is-on", "is-here");
        const im = c.querySelector("img");
        if (kind === "bad") {
          // 守りを外した姿（直す前の CSS。器が縦に伸びる）
          im.style.aspectRatio = "auto";
          im.style.height = "86%";
        } else {
          // 出してよい姿。**面の CSS に頼らない**。この道具は直す前の
          // 書き出しに対しても回るので、守りは対照の中で自分で立てる
          im.style.aspectRatio = "1 / 1";
          im.style.height = "auto";
        }
        grid.appendChild(c);
      }
    }
    return tall.length;
  });
  if (!made) {
    console.log("::error::対照に使える縦長の絵が1枚もありません");
    await b.close();
    process.exit(2);
  }
  await p.waitForTimeout(300);
  const rows = await p.evaluate(MEASURE, ".rzk-cell");
  const probes = rows.filter((r) => r.probe);
  if (probes.length !== made * 2) {
    console.log(`::error::対照のマスが ${probes.length}枚しか測れませんでした（${made * 2}枚要る）`);
    await b.close();
    process.exit(2);
  }
  for (const r of probes) {
    if (!INKS.has(r.src)) INKS.set(r.src, await p.evaluate(INK, r.src));
  }
  const blind = probes.filter((r) => !INKS.get(r.src));
  if (blind.length) {
    console.log(`::error::対照の絵を ${blind.length}枚 読めませんでした（画素が取れない）`);
    await b.close();
    process.exit(2);
  }
  const side = (kind) => probes.filter((r) => r.probe === kind);
  const overOf = (kind) => side(kind).filter((r) => out(r, INKS.get(r.src)) > 1).length;
  const flatOf = (kind) => side(kind).filter((r) => flat(r) > 1).length;
  const badOver = overOf("bad");
  const goodOver = overOf("good");
  const badFlat = flatOf("bad");
  const goodFlat = flatOf("good");
  const bal = [];
  if (badOver < 1) bal.push(`守りを外した ${made}マスが1枚も落ちない`);
  if (goodOver > 0) bal.push(`出してよい ${made}マスのうち ${goodOver}枚が落ちる`);
  if (badFlat < 1) bal.push(`守りを外した ${made}マスの器が、1枚も縦長に見えていない`);
  if (goodFlat > 0) bal.push(`出してよい ${made}マスのうち ${goodFlat}枚の器が正方形でない`);
  await ctx.close();
  if (bal.length) {
    console.log("::error::対照が外れました。本物の面の数字は出しません");
    for (const line of bal) console.log(`::error::  ${line}`);
    await b.close();
    process.exit(2);
  }
  note.push(
    `対照 ${made * 2}件（守りを外した ${made}マス: はみ出し ${badOver}枚・縦長の器 ${badFlat}枚 / ` +
      `出してよい ${made}マス: はみ出し ${goodOver}枚・縦長の器 ${goodFlat}枚）`,
  );
}

/* ───────── 本物の面 ───────── */

let paper = [];
let starved = false;
let over = 0;
let notSquare = 0;
let seen = 0;
let spreadWorst = null;

for (const W of WIDTHS) {
  const { ctx, p, ok } = await open(W);
  if (!ok) {
    console.log(`::error::幅 ${W} で ${AT} が開けません`);
    await ctx.close();
    await b.close();
    process.exit(2);
  }
  const rows = (await p.evaluate(MEASURE, ".rzk-cell")).filter((r) => !r.probe);
  if (rows.length !== PEOPLE) {
    console.log(`::error::幅 ${W}: マスが ${rows.length}枚（名簿は ${PEOPLE}人）`);
    await ctx.close();
    await b.close();
    process.exit(2);
  }
  for (const r of rows) {
    if (INKS.has(r.src)) continue;
    INKS.set(r.src, await p.evaluate(INK, r.src));
  }
  const unread = rows.filter((r) => !INKS.get(r.src));
  if (unread.length) {
    console.log(`::error::幅 ${W}: 画素を読めなかった絵が ${unread.length}枚（マス ${unread.map((r) => r.n).join(" ")}）`);
    await ctx.close();
    await b.close();
    process.exit(2);
  }

  const bad = [];
  const flats = [];
  const sizes = [];
  for (const r of rows) {
    const ink = INKS.get(r.src);
    seen++;
    const o = out(r, ink);
    if (o > 1) bad.push({ n: r.n, o });
    if (flat(r) > 1) flats.push({ n: r.n, w: r.boxW, h: r.boxH });
    const d = drawn(r, ink);
    sizes.push({ n: r.n, size: Math.sqrt(d.w * d.h) });
    if (W === WIDTHS[0] && !ink.clear) paper.push(r.n);
  }
  const sorted = [...sizes].sort((a, c) => a.size - c.size);
  const mid = sorted[Math.floor(sorted.length / 2)].size;
  const off = sizes.filter((s) => Math.abs(s.size / mid - 1) > TOL);
  over += bad.length;
  notSquare += flats.length;
  if (!spreadWorst || sorted[sorted.length - 1].size / sorted[0].size > spreadWorst.r) {
    spreadWorst = { W, r: sorted[sorted.length - 1].size / sorted[0].size };
  }

  console.log(
    `■ 幅 ${W}  マス ${rows.length}枚  器 ${rows[0].cell.w.toFixed(2)}px  ` +
      `描かれた大きさ 中央値 ${mid.toFixed(1)}px（${sorted[0].size.toFixed(1)}〜${sorted[sorted.length - 1].size.toFixed(1)}）`,
  );
  console.log(
    `   器が正方形でない ${flats.length}枚 / はみ出し ${bad.length}枚 / ±${TOL * 100}% を外れる ${off.length}人`,
  );
  for (const x of flats.slice(0, 8)) console.log(`   ★ マス${x.n} 器 ${x.w.toFixed(1)}×${x.h.toFixed(1)}`);
  for (const x of bad.slice(0, 8)) console.log(`   ★ マス${x.n} が ${x.o.toFixed(1)}px はみ出している`);
  if (off.length) {
    console.log(
      `      ±${TOL * 100}% 外: ` +
        off.map((s) => `マス${s.n} ${(s.size / mid).toFixed(3)}倍`).join(" / "),
    );
  }
  if (!fed(ctx, `幅 ${W}`)) starved = true;
  await ctx.close();
}

if (over) fail.push(`マスからはみ出している絵が ${over}件`);
if (notSquare) fail.push(`器が正方形でないマスが ${notSquare}件`);
/* **飢えたまま出た 0件は、合格ではない。** 取れなかった絵はそもそも
   描かれないので、はみ出しようがない（#157 の「測れていないものを 0 で出す」） */
if (starved) fail.push("外に出られなかった先がある。この数字は当てにならない");

console.log("");
console.log(`   見たもの: ${AT}`);
for (const line of note) console.log(`   ${line}`);
console.log(
  `合計  幅 ${WIDTHS.length}とおり / 名簿 ${PEOPLE}人 / 数えたマス ${seen}枚 / ` +
    `画素を読んだ絵 ${INKS.size}枚`,
);
console.log(
  `      いちばんばらつく幅 ${spreadWorst.W}px で 最大÷最小 ${spreadWorst.r.toFixed(3)}倍`,
);
if (paper.length) {
  // **名前も id も出さない。** 直せる人に伝わるのはマスの番号で足りる
  console.log(
    `      透過を1画素も持たない絵 ${paper.length}人（マス ${paper.join(" ")}）` +
      ` … 絵そのものの話なので、焼き直しでは直らない`,
  );
}

await b.close();
if (fail.length) {
  for (const line of fail) console.log(`::error::${line}`);
  process.exit(1);
}
console.log("      はみ出し 0件");
process.exit(0);
