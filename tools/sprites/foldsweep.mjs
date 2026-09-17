/**
 * **畳みを開いてから**、全面の押しどころを測り直す。
 *
 *   SPORT=4240 DIST=site/.next-3240 node foldsweep.mjs
 *   SPORT=4240 PROBE=1 PAGES=/ node foldsweep.mjs      # 道具の自己確認だけ
 *   SPORT=4240 WIDTHS=390x844,1280x800 node foldsweep.mjs
 *
 * ## なぜ作ったか
 *
 * `hitbox.mjs` も `pchit.mjs` も、**閉じた畳み（`<details>` / `Fold`）の中身を
 * 数えていなかった。** 「押す前に開く面だから」という理由だったが、
 * 視聴者さんは**開いてから押す**。開いたあとが 40px なら押せない。
 * つまりこれまでの「48px割れ 0件」は、**畳みの中を見ていない 0件**だった
 * （`docs/island-misses.md` #79 と同じ形）。
 *
 * この道具は**同じ面を2回**測る。
 *   1回目 … 畳みを開く前（＝これまでの数え方）
 *   2回目 … 全部の畳みを開いてから
 * **前後の差が、これまで見えていなかったぶん。** 片方だけ出すと、
 * 直ったことを示せない。
 *
 * ## 実寸として読んではいけない値に印を付ける
 *
 * 伸ばす上限に当たった値（飽和）と、画面の端で止まった値は**実寸ではない**。
 * どちらも `≧` を付けて出す。上限の値を実寸と読んで「合格」と誤判定した例がある。
 *
 * ## かぶり
 *
 * 止めた相手が**別の押しどころ**なら、そこは隣に食われている。
 * `::after` で当たりを広げてある面は、広げたぶんが隣とぶつかる。
 * 数と場所を最後にまとめて出す。
 *
 * 出るもの: /tmp/foldsweep/<幅>.json と、画面のまとめ。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";
import { collect, banner, tally } from "./pages.mjs";
import { openFolds, measure, fmtHit, SEL_ALL, addProbe, isProbe, probeVerdict } from "./hitbox.mjs";

const SPORT = process.env.SPORT || "4240";
const OUT = process.env.OUT || "/tmp/foldsweep";
const MIN = Number(process.env.MIN || 48);
const SEL = process.env.SEL || SEL_ALL;
const WIDTHS = (process.env.WIDTHS || "390x844,1280x800").split(",").map((s) => s.split("x").map(Number));

const C = collect();
const PAGES = C.pages;

/* **自己確認の仕込みは `hitbox.mjs` にある**（`PROBE_JS` / `addProbe`）。
   ここにも同じものが書いてあったが、仕込みを道具ごとに書くと、道具ごとに
   別のものを確かめたことになる。6本が**同じ仕込み**を通す
   （`docs/island-misses.md` #83）。 */

console.log(banner(C) + "\n");
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
    await p.waitForTimeout(600);
    // 畳みを開く前に、いちど下まで送る。遅れて入る中身を先に入れておく
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(300);
    if (process.env.PROBE) await addProbe(p);

    /* 1回目 = これまでの数え方（畳みを開かない） */
    const before = await measure(p, { sel: SEL, min: MIN, fold: "skip" });
    /* 2回目 = 全部開いてから */
    const folds = await openFolds(p);
    const after = await measure(p, { sel: SEL, min: MIN, fold: "open" });

    /* 仕込みの行は、本番の数に混ぜない */
    const drop = (m) => ({ ...m, rows: m.rows.filter((x) => !isProbe(x)), skipped: m.skipped.filter((x) => !isProbe(x)) });
    rows.push({
      path, measured: true, folds,
      before: process.env.PROBE ? drop(before) : before,
      after: process.env.PROBE ? drop(after) : after,
      probeBefore: process.env.PROBE ? before.rows : undefined,
      probeAfter: process.env.PROBE ? after.rows : undefined,
    });
    const s0 = before.rows.filter((r) => r.small).length;
    const s1 = after.rows.filter((r) => r.small).length;
    const inFold = after.rows.filter((r) => r.fold).length;
    if (folds.opened || s1 || s0 || folds.stillClosed)
      console.log(
        `${W} ${path}  畳み ${folds.opened}開いた${folds.stillClosed ? `（開かず ${folds.stillClosed}）` : ""}` +
          `  押しどころ ${before.rows.length}→${after.rows.length}（畳みの中 ${inFold}）` +
          `  ${MIN}px割れ ${s0}→${s1}`,
      );
  }
  writeFileSync(`${OUT}/${W}.json`, JSON.stringify(rows, null, 1));
  byWidth.set(W, rows);
  await ctx.close();
}
await b.close();

/* ============ まとめ ============ */
console.log("\n===== まとめ =====");
console.log(banner(C));

for (const [W, rows] of byWidth) {
  const ok = rows.filter((r) => r.measured);
  const sum = (f) => ok.reduce((a, r) => a + f(r), 0);
  const n0 = sum((r) => r.before.rows.length), n1 = sum((r) => r.after.rows.length);
  const s0 = sum((r) => r.before.rows.filter((x) => x.small).length);
  const s1 = sum((r) => r.after.rows.filter((x) => x.small).length);
  const inFold = sum((r) => r.after.rows.filter((x) => x.fold).length);
  const smallFold = sum((r) => r.after.rows.filter((x) => x.small && x.fold).length);
  const k0 = sum((r) => r.before.skipped.length), k1 = sum((r) => r.after.skipped.length);
  const op = sum((r) => r.folds.opened), st = sum((r) => r.folds.stillClosed);
  console.log(
    `\n幅 ${W}: ${tally(C, ok.length)}` +
      `\n  畳み ${op}個を開いた${st ? `（**開かなかった ${st}個**）` : ""}` +
      `\n  押しどころ  開く前 ${n0}個 → 開いたあと ${n1}個（差 +${n1 - n0}。うち畳みの中 ${inFold}個）` +
      `\n  ${MIN}px割れ 開く前 ${s0}個 → 開いたあと ${s1}個（差 +${s1 - s0}。うち畳みの中 ${smallFold}個）` +
      `\n  測れず    開く前 ${k0}個 → 開いたあと ${k1}個`,
  );
  // 面ごとの上位（新しく挙がった数の多い順）
  const top = ok
    .map((r) => ({
      path: r.path,
      d: r.after.rows.length - r.before.rows.length,
      ds: r.after.rows.filter((x) => x.small).length - r.before.rows.filter((x) => x.small).length,
    }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d);
  console.log(`  新しく数えられるようになった面 ${top.length}面。多い順:`);
  for (const t of top.slice(0, 20)) console.log(`    ${t.path}  +${t.d}個（うち割れ +${t.ds}）`);
  if (top.length > 20) console.log(`    … ほか ${top.length - 20}面（json に全部）`);

  // 48px 未満の一覧。**丸めない。飽和と畳みの内外に印を付ける**
  console.log(`\n  幅 ${W} の ${MIN}px 未満（開いたあと）:`);
  let n = 0;
  for (const r of ok)
    for (const x of r.after.rows.filter((y) => y.small)) {
      n++;
      console.log(
        `    ${r.path}  ${x.c}「${x.t || "(字なし)"}」${x.href ? ` → ${x.href}` : ""}` +
          `  見た目 ${x.box[0]}x${x.box[1]}  当たり ${fmtHit(x)}  ${x.fold ? "畳みの中" : "畳みの外"}` +
          (x.rivals.length ? `  かぶり:${x.rivals.map((v) => `${v.dir}=${v.who}${v.inBox ? "(見た目の中まで)" : ""}`).join(",")}` : ""),
      );
    }
  if (!n) console.log("    （なし）");

  /* かぶり。**隣の押しどころに止められた**方向を持つものを全部数える。
     そのうち「見た目の箱の中まで入り込まれている」ものは、広げた当たりが
     自分の場所を取っている ＝ 直す対象。 */
  const kab = [];
  for (const r of ok)
    for (const x of r.after.rows) if (x.rivals.length) kab.push([r.path, x]);
  const intr = kab.filter(([, x]) => x.rivals.some((v) => v.inBox));
  const kabSmall = kab.filter(([, x]) => x.small);
  console.log(
    `\n  かぶり（隣の押しどころに止められた）: ${kab.length}個` +
      `  うち見た目の箱の中まで入り込まれている ${intr.length}個` +
      `  うち ${MIN}px を割ったもの ${kabSmall.length}個`,
  );
  for (const [path, x] of intr.slice(0, 30))
    console.log(
      `    ${path}  ${x.c}「${x.t || "(字なし)"}」 見た目 ${x.box[0]}x${x.box[1]} 当たり ${fmtHit(x)}` +
        `  ${x.rivals.filter((v) => v.inBox).map((v) => `${v.dir}に ${v.who}「${v.t}」が ${v.at}px まで`).join(" / ")}`,
    );
  if (intr.length > 30) console.log(`    … ほか ${intr.length - 30}個（json に全部）`);

  // 飽和・画面端で止まった数。**実寸として読ませないため、件数を必ず出す**
  const sat = sum((r) => r.after.rows.filter((x) => x.sat[0] || x.sat[1]).length);
  const edge = sum((r) => r.after.rows.filter((x) => x.edge[0] || x.edge[1]).length);
  console.log(`  実寸ではない値: 上限で止まった ${sat}個 / 画面端で止まった ${edge}個（どちらも「≧」付き）`);

  // 数えなかったものの内訳。0 を「測って 0」と読ませないため
  const ex = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.after.excluded)) ex[k] = (ex[k] || 0) + v;
  console.log(`  数えなかったもの: ${Object.entries(ex).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
}

/* ============ 自己確認 ============ */
if (process.env.PROBE) {
  console.log("\n===== 仕込みの確認 =====");
  let bad = 0, seen = 0;
  for (const [W, rows] of byWidth)
    for (const r of rows) {
      if (!r.measured) continue;
      seen++;
      const v = probeVerdict({ after: r.probeAfter || r.after.rows, before: r.probeBefore || r.before.rows });
      if (!v.ok) { bad++; console.log(`  !! ${W} ${r.path}`); }
      if (!v.ok || seen === 1) for (const l of v.lines) console.log("  " + l);
    }
  console.log(bad ? `\n  !! ${bad}/${seen} 面でだめ。この道具の 0 件は証拠にならない` : `\n  ${seen}面ぜんぶ、仕込みはそのとおりに出た`);
}
