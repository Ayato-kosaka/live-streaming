/**
 * 図鑑（`/friends`）の絵が、**自分のマスからはみ出していないか**を数える。
 *
 *   tools/build.sh 3190
 *   python3 -m http.server 4290 --directory site/.next-3190 &
 *   SPORT=4290 node tools/sprites/dexfit.mjs      # 0=通った / 1=見つかった / 2=数えるものが無い
 *
 * **4190 は使わない。** Chrome も node の fetch も「危ない口」として塞いでいて
 * （ManageSieve）、node からは `bad port` で1本も取りに行けない。
 * 絵が全部「配られていない」に化ける（`crawl.mjs` で実際に踏んだ）。
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
 * **足の数だけ用意する**（`island-standards.md` 15）。どれを1本抜いても
 * 対照が落ちる。落ちなければ、その足は最初から何も見ていない。
 *
 * ## 焼き直しで消えないこと
 *
 * `charFit` は `tools/sprites/charbox.py` が `characterBox.ts` ごと焼き直す。
 * 雛形が古いままだと、**次に焼いた晩に黙って元へ戻る。赤くならない。**
 * だからブラウザを立てる前に、2つの `charFit` が1文字まで同じかを見る。
 */
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { offline } from "./route.mjs";
import { repoPath } from "./repo.mjs";

const SPORT = process.env.SPORT || "4290";
const PAGE = process.env.PAGE || "/friends.html";
const WIDTHS = (process.env.WIDTHS || "320,390,640,1000").split(",").map(Number);
/** 本番の名簿。`curl .../island-api/characters > /tmp/ch.json` で落としておく */
const CHJSON = process.env.CHJSON || "/tmp/ch.json";
const BREAK = process.env.BREAK || "";
/** ±何%を「そろっている」とするか */
const TOL = 0.1;

const fail = [];
const note = [];

/* ───────── 焼き直しで消えないか（ブラウザの前に、字で） ───────── */

/** 2つのファイルから `charFit` の本文だけを切り出す */
function cutFit(src) {
  const i = src.indexOf("export function charFit(");
  if (i < 0) return null;
  const j = src.indexOf("\n}", i);
  return j < 0 ? null : src.slice(i, j + 2);
}

const tsFit = cutFit(readFileSync(repoPath("site/content/characterBox.ts"), "utf8"));
const pyFit = cutFit(readFileSync(repoPath("tools/sprites/charbox.py"), "utf8"));
if (!tsFit || !pyFit) {
  console.log("::error::charFit が見つかりません（characterBox.ts / charbox.py）");
  process.exit(2);
}
if (tsFit !== pyFit) {
  console.log(
    "::error::charbox.py の雛形が characterBox.ts と違います。" +
      "次に焼き直した晩に、直したものが黙って元へ戻ります",
  );
  process.exit(2);
}
note.push("charFit は characterBox.ts と charbox.py で同じ");

/* ───────── 測りかた（ページの中で動く） ───────── */

/**
 * マス1枚ぶんの寸法を DOM から取る。
 *
 * `getComputedStyle` の width / height は**変形をかける前**の使われた値なので、
 * これが `charFit` の言う「器」。`getBoundingClientRect` は変形の後。
 * 2つの比が、そのマスに掛かっている倍率。
 */
const MEASURE = (sel) => {
  const out = [];
  for (const [i, c] of [...document.querySelectorAll(sel)].entries()) {
    const im = c.querySelector("img");
    if (!im) continue;
    const cs = getComputedStyle(im);
    const rc = c.getBoundingClientRect();
    const ri = im.getBoundingClientRect();
    const W = parseFloat(cs.width);
    const H = parseFloat(cs.height);
    const pos = cs.objectPosition.split(" ").map((v) => parseFloat(v) / 100);
    out.push({
      n: i + 1,
      src: im.currentSrc || im.src,
      probe: c.dataset.probe || "",
      cell: { x: rc.x, y: rc.y, w: rc.width, h: rc.height },
      img: { x: ri.x, y: ri.y, w: ri.width, h: ri.height },
      boxW: W, boxH: H,
      fit: cs.objectFit,
      px: Number.isFinite(pos[0]) ? pos[0] : 0.5,
      py: Number.isFinite(pos[1]) ? pos[1] : 0.5,
      nat: [im.naturalWidth, im.naturalHeight],
      blend: cs.mixBlendMode,
      done: im.complete && im.naturalWidth > 0,
    });
  }
  return out;
};

/**
 * 絵の中で、**描かれている画素**の外接矩形（元の絵に対する割合）。
 * 透過があれば alpha、無ければ四隅の色との差で見る。
 */
const INK = (url) => new Promise((res) => {
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onerror = () => res(null);
  im.onload = () => {
    const w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) return res(null);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, w, h).data; } catch { return res(null); }
    let clear = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { clear = true; break; }
    const at = (x, y) => (y * w + x) * 4;
    const c0 = at(0, 0);
    const bg = [d[c0], d[c0 + 1], d[c0 + 2]];
    const ink = (i) => clear
      ? d[i + 3] > 8
      : Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > 12;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ink(at(x, y))) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) return res(null);
    res({ clear, ar: w / h, box: [x0 / w, y0 / h, (x1 + 1 - x0) / w, (y1 + 1 - y0) / h] });
  };
  im.src = url;
});

/** 描かれた画素が、画面のどこに来るか。`m` は MEASURE の1行、`ink` は INK の答え */
function drawn(m, ink) {
  const s = m.boxW > 0 ? m.img.w / m.boxW : 1;
  const ar = ink && !BREAK.includes("ink") ? ink.ar : m.nat[0] / m.nat[1];
  // object-fit: contain は器の短いほうに合わせる
  const cw = m.fit === "contain" ? Math.min(m.boxW, m.boxH * ar) : m.boxW;
  const ch = m.fit === "contain" ? cw / ar : m.boxH;
  const cx = m.img.x + s * (m.boxW - cw) * m.px;
  const cy = m.img.y + s * (m.boxH - ch) * m.py;
  const [bx, by, bw, bh] = BREAK.includes("ink") ? [0, 0, 1, 1] : ink.box;
  return {
    L: cx + bx * s * cw,
    T: cy + by * s * ch,
    w: bw * s * cw,
    h: bh * s * ch,
  };
}

/** その器が正方形からどれだけ離れているか（px）。`charFit` の前提そのもの */
function flat(m) {
  return BREAK.includes("square") ? 0 : Math.abs(m.boxW - m.boxH);
}

/** そのマスが、自分の枠からどれだけ外へ出ているか（px） */
function out(m, ink) {
  const d = drawn(m, ink);
  const c = BREAK.includes("cell") ? { x: -1e6, y: -1e6, w: 2e6, h: 2e6 } : m.cell;
  return (
    Math.max(0, c.x - d.L) +
    Math.max(0, d.L + d.w - (c.x + c.w)) +
    Math.max(0, c.y - d.T) +
    Math.max(0, d.T + d.h - (c.y + c.h))
  );
}

/* ───────── ブラウザ ───────── */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let CH = null;
try {
  CH = readFileSync(CHJSON, "utf8");
} catch {
  console.log(`::error::本番の名簿がありません（${CHJSON}）。`);
  console.log("  curl -s https://live-streaming-d3cac.web.app/island-api/characters > /tmp/ch.json");
  await b.close();
  process.exit(2);
}
const PEOPLE = (JSON.parse(CH).characters || []).filter((c) => c.plain?.sizes?.["128"]).length;

async function open(width) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await offline(ctx);
  // 名簿は本番のものを返す。**あとから登録した route が先に効く**
  await ctx.route(/\/island-api\/characters(\?|$)/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: CH }),
  );
  const p = await ctx.newPage();
  const res = await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
  if (!res || res.status() >= 400) return { ctx, p, ok: false };
  await p
    .waitForFunction((n) => document.querySelectorAll(".rzk-cell img").length >= n, PEOPLE, {
      timeout: 30000,
    })
    .catch(() => {});
  // 畳んだ中・画面の外の絵は要求されない。全部剥がしてから測る
  await p.evaluate(() => {
    for (const im of document.querySelectorAll(".rzk-cell img")) im.loading = "eager";
  });
  await p
    .waitForFunction(
      () => [...document.querySelectorAll(".rzk-cell img")].every((im) => im.complete),
      { timeout: 30000 },
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
    console.log(`::error::${PAGE} が開けません（SPORT=${SPORT}）`);
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
let over = 0;
let notSquare = 0;
let seen = 0;
let spreadWorst = null;

for (const W of WIDTHS) {
  const { ctx, p, ok } = await open(W);
  if (!ok) {
    console.log(`::error::幅 ${W} で ${PAGE} が開けません`);
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
  await ctx.close();
}

if (over) fail.push(`マスからはみ出している絵が ${over}件`);
if (notSquare) fail.push(`器が正方形でないマスが ${notSquare}件`);

console.log("");
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
