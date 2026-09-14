/**
 * 公開している全面の**押しどころ**を、PC の幅で測る。
 *
 *   SPORT=5400 node pchit.mjs                  # 390(比べる用) + PC3幅
 *   SPORT=5400 WIDTHS=1440x900 node pchit.mjs
 *   SPORT=5400 PROBE=1 node pchit.mjs          # 仕込みが挙がるかの自己確認
 *   SPORT=5400 FOLD=skip node pchit.mjs        # 前の数え方（畳みの中を飛ばす）
 *
 * **測るところは自分で書かない。`hitbox.mjs` を呼ぶ。**
 * ここには長いあいだ、`hitbox.mjs` と同じ測り方が**写して**置いてあった。
 * 2026-09-14 に `hitbox.mjs` の「閉じた畳みの中を飛ばす」を直したとき、
 * **写しのほうは直らなかった。** 写しがあるかぎり、直した数だけ漏れが残る
 * （`docs/island-misses.md` #83）。この道具の仕事は
 * 「**どの面を・どの幅で**回るか」と「読ませ方」だけ。
 *
 * 回る面は `pages.mjs` が**書き出しを歩いて**集める。手で書いた一覧は、面が
 * 増えても増えないので、**測られていないことが数に出ない**（#79）。
 *
 * 出るもの: /tmp/pchit/<幅>.json と、画面に「48px を割った押しどころ」の一覧。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";
import { collect, banner, tally } from "./pages.mjs";
import { openFolds, measure, fmtHit, SEL_ALL, addProbe, delProbe, isProbe, probeVerdict } from "./hitbox.mjs";

const SPORT = process.env.SPORT || "5400";
const OUT = process.env.OUT || "/tmp/pchit";
const MIN = Number(process.env.MIN || 48);
const FOLD = process.env.FOLD || "open";
const SEL = process.env.SEL || SEL_ALL;
const WIDTHS = (process.env.WIDTHS || "390x844,1440x900,1920x1080,820x1180")
  .split(",")
  .map((s) => s.split("x").map(Number));
/* 面は**書き出しを歩いて**集める（`pages.mjs`）。手で書いた一覧（`pcpages.txt`）は
   109行で止まっていて、書き出しは130面あった。21面が一度も測られないまま
   「48px割れ 0」に数えられていた（`docs/island-misses.md` #79）。 */
const C = collect();
const PAGES = C.pages;

console.log(banner(C));
console.log(`畳み ${FOLD === "skip" ? "開かない（前の数え方）" : "先に開く"}\n`);

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const byWidth = new Map();
for (const [W, H] of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: W < 900, hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  const rows = [];
  for (const path of PAGES) {
    const url = `http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`;
    try {
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      rows.push({ path, measured: false, why: String(e).slice(0, 100) });
      console.log(`測れず ${W} ${path}`);
      continue;
    }
    await p.waitForTimeout(700);
    // 遅れて入る中身を先に入れておく。畳みを開く前に1回下まで送る
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(700);
    /* 仕込みは**畳みを開く前**に入れる。閉じた畳みごと入れないと、
       「開いてはじめて挙がる」ほうを確かめられない */
    if (process.env.PROBE) await addProbe(p);

    let folds = { opened: 0, stillClosed: 0, folds: 0 };
    if (FOLD !== "skip") folds = await openFolds(p);
    const got = await measure(p, { sel: SEL, min: MIN, fold: FOLD });

    const all = got.rows.filter((r) => !isProbe(r));
    const small = all.filter((r) => r.small);
    rows.push({
      path, measured: true, folds,
      n: all.length,
      inFold: all.filter((r) => r.fold).length,
      small: small.map((r) => ({ k: r.k, t: r.t, c: r.c, href: r.href, box: r.box, hit: r.hit, sat: r.sat, edge: r.edge, fold: r.fold, rivals: r.rivals })),
      skipped: got.skipped.filter((r) => !isProbe(r)).map((r) => ({ t: r.t, why: r.why, box: r.box, fold: r.fold })),
      excluded: got.excluded,
      probe: process.env.PROBE ? probeVerdict({ after: got.rows, min: MIN }) : null,
    });
    const r0 = rows[rows.length - 1];
    if (r0.small.length || r0.skipped.length)
      console.log(`${W} ${path}  押しどころ${r0.n}（畳みの中 ${r0.inFold}）  ${MIN}px割れ ${r0.small.length}  測れず ${r0.skipped.length}`);
    if (process.env.PROBE) await delProbe(p);
  }
  writeFileSync(`${OUT}/${W}.json`, JSON.stringify(rows, null, 1));
  byWidth.set(W, rows);
  await ctx.close();
}
await b.close();

console.log("\n===== まとめ =====");
console.log(banner(C));
for (const [W, rows] of byWidth) {
  const ok = rows.filter((r) => r.measured);
  const sum = (f) => ok.reduce((a, r) => a + f(r), 0);
  const tot = sum((r) => r.n);
  const sm = sum((r) => r.small.length);
  const sk = sum((r) => r.skipped.length);
  const inFold = sum((r) => r.inFold);
  const smFold = sum((r) => r.small.filter((s) => s.fold).length);
  const op = sum((r) => r.folds.opened), st = sum((r) => r.folds.stillClosed);
  const pages = ok.filter((r) => r.small.length).length;
  /* **「48px割れ 0」の前に、何面を測ったのかを出す。** 面の数が無いと、
     0 が「測って0」なのか「見ていない」のか読めない（#79）。 */
  console.log(
    `幅 ${W}: ${tally(C, ok.length)}  押しどころ ${tot}個（畳みの中 ${inFold}）` +
      `  ${MIN}px割れ ${sm}個（${pages}面。うち畳みの中 ${smFold}）  測れず ${sk}個` +
      (FOLD === "skip" ? "  ※前の数え方" : `  畳み ${op}個を開いた${st ? `（**開かなかった ${st}個**）` : ""}`),
  );
  // 数えなかったものの内訳。0 を「測って 0」と読ませないため
  const ex = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.excluded || {})) ex[k] = (ex[k] || 0) + v;
  console.log(`   数えなかったもの: ${Object.entries(ex).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
}
/* **PC 幅でだけ小さいもの**を出す。390 で既に小さいものは「PC の問題」ではない。 */
const base = byWidth.get(390);
if (base) {
  const key = (r, s) => `${r.path} ${s.k}`;
  const b390 = new Set();
  for (const r of base) if (r.measured) for (const s of r.small) b390.add(key(r, s));
  for (const [W, rows] of byWidth) {
    if (W === 390) continue;
    const only = [];
    for (const r of rows) if (r.measured) for (const s of r.small) if (!b390.has(key(r, s))) only.push([r.path, s]);
    console.log(`\n幅 ${W} で**新しく** ${MIN}px を割ったもの: ${only.length}個`);
    for (const [path, s] of only.slice(0, 40))
      console.log(`   ${path}  ${s.c}  「${s.t || "(字なし)"}」  見た目 ${s.box[0]}x${s.box[1]}  当たり ${fmtHit(s)}${s.fold ? "  畳みの中" : ""}`);
    if (only.length > 40) console.log(`   … ほか ${only.length - 40}個（json に全部）`);
  }
  console.log(`\n幅 390 の ${MIN}px 未満:`);
  let n = 0;
  for (const r of base)
    if (r.measured)
      for (const s of r.small) {
        n++;
        console.log(`   ${r.path}  ${s.c}「${s.t || "(字なし)"}」${s.href ? ` → ${s.href}` : ""}  見た目 ${s.box[0]}x${s.box[1]}  当たり ${fmtHit(s)}  ${s.fold ? "畳みの中" : "畳みの外"}`);
      }
  if (!n) console.log("   （なし）");
}
if (process.env.PROBE) {
  console.log("\n===== 仕込みの確認 =====");
  let bad = 0, seen = 0;
  for (const [W, rows] of byWidth)
    for (const r of rows) {
      if (!r.measured || !r.probe) continue;
      seen++;
      if (!r.probe.ok) { bad++; console.log(`  !! ${W} ${r.path}`); for (const l of r.probe.lines) console.log("  " + l); }
    }
  const one = [...byWidth.values()][0]?.find((r) => r.probe);
  if (one) for (const l of one.probe.lines) console.log(l);
  console.log(bad ? `\n  !! ${bad}/${seen} 面でだめ。この回の 0 件は証拠にならない` : `\n  ${seen}面ぜんぶ、仕込みはそのとおりに出た`);
}
