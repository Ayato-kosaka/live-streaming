/**
 * 台所（`/kitchen/*`）の「この晩ここにいた人」の絵が、**自分の器から
 * はみ出していないか**を数える。図鑑の `dexfit.mjs` と対になるもの。
 *
 *   tools/build.sh 3200
 *   python3 -m http.server 4300 --directory site/.next-3200 &
 *   SPORT=4300 node tools/sprites/kdfit.mjs      # 0=通った / 1=見つかった / 2=数えるものが無い
 *
 * **4190 を配り先に使わない。** Chrome も node の fetch も「危ない口」として
 * 塞いでいて（ManageSieve）、絵が全部「配られていない」に化ける（#167）。
 *
 * ## なぜ要るか
 *
 * `.kd-folks img`（`site/app/css/streams.css`）は 720px 以上で **66×76px** だった。
 * すぐ上のコメントに「器は正方形にする。`charFit` の寄せは器に対する割合で
 * 書いてあるので、縦横が違うとずれる」と**自分で書いてあるのに、守れていなかった**。
 * 図鑑で同じ形を直した回（#167）の、もう一方。
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
 * どれを1本抜いても対照が落ちる（3通りとも確かめた）。
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
import { INK, MEASURE, bakedSame, judge } from "./fitmeasure.mjs";

const SPORT = process.env.SPORT || "4300";
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

async function open(width) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await offline(ctx);
  const p = await ctx.newPage();
  return { ctx, p };
}

/** その面を開いて、`.kd-folks` の絵が全部届くまで待つ */
async function visit(p, slug) {
  const res = await p.goto(`http://localhost:${SPORT}/kitchen/${slug}.html`, {
    waitUntil: "load",
    timeout: 60000,
  });
  if (!res || res.status() >= 400) return false;
  // 畳んだ中・画面の外の絵は要求されない。全部剥がしてから測る
  await p.evaluate(() => {
    for (const im of document.querySelectorAll(".kd-folks img")) im.loading = "eager";
  });
  await p
    .waitForFunction(
      () => [...document.querySelectorAll(".kd-folks img")].every((im) => im.complete),
      { timeout: 30000 },
    )
    .catch(() => {});
  await p.waitForTimeout(80);
  return true;
}

const die = async (msg) => {
  console.log(`::error::${msg}`);
  await b.close();
  process.exit(2);
};

/** 絵は幅を変えても同じ。1度読んだら使い回す */
const INKS = new Map();

/* ───────── 本物の面（まだ出さない。対照が通ってから出す） ───────── */

let over = 0;
let notSquare = 0;
let seen = 0;
let worstPx = 0;
let paper = [];
let spreadWorst = null;

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
      await die(`幅 ${W}: /kitchen/${pg.slug}.html が開けません（SPORT=${SPORT}）`);
    }
    const rows = await p.evaluate(MEASURE, ".kd-folks > li");
    if (rows.length !== pg.there.length) {
      await ctx.close();
      await die(
        `幅 ${W}: ${pg.slug} に絵が ${rows.length}枚（kitchenTalk.ts は ${pg.there.length}枚）`,
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
  for (const pb of PROBES) {
    if (!(await visit(p, pb.slug))) {
      await ctx.close();
      await die(`対照の面 /kitchen/${pb.slug}.html が開けません`);
    }
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
      [pb.id],
    );
    if (!made) {
      await ctx.close();
      await die(`対照の li を足せませんでした（/kitchen/${pb.slug}.html）`);
    }
    await p
      .waitForFunction(
        () => [...document.querySelectorAll(".kd-folks img")].every((im) => im.complete),
        { timeout: 30000 },
      )
      .catch(() => {});
    await p.waitForTimeout(150);
    const rows = (await p.evaluate(MEASURE, ".kd-folks > li")).filter((r) => r.probe);
    if (rows.length !== 2) {
      await ctx.close();
      await die(`対照の li が ${rows.length}枚しか測れませんでした（2枚要る）`);
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

await b.close();
if (fail.length) {
  for (const line of fail) console.log(`::error::${line}`);
  process.exit(1);
}
console.log("      はみ出し 0件");
process.exit(0);
