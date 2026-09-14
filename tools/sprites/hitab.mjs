/**
 * 直した面の**押しどころを全部**測って、直す前と後を同じ回の中で突き合わせる。
 *
 * 同じ書き出し・同じブラウザ・同じ時刻のまま、直した1行だけを `!important` で
 * 打ち消した姿（＝直す前）と、そのままの姿（＝直した後）を交互に測る。
 * **変えたのはその1行だけ**なので、これで前後が揃う。
 * 1条件ずつ別に測ると、住人が歩いているぶん前後がひっくり返る。
 *
 *   SPORT=4210 W=390 node tools/sprites/hitab.mjs
 *   SPORT=4210 W=1440 UNDO=".chain-foot a{padding-block:16px!important}" node tools/sprites/hitab.mjs
 *   SPORT=4210 FOLD=skip node tools/sprites/hitab.mjs   # 前の数え方（畳みの中を飛ばす）
 *   SPORT=4210 PROBE=1 PAGES=/atlas node tools/sprites/hitab.mjs   # 自己確認
 *
 * **押しどころを広げたときは、必ずこれを通す。** 広げた先が隣の押しどころなら、
 * こちらが 48px になったぶん、あちらが削れる。`pchit.mjs` は 48px を割ったものしか
 * 出さないので、**56px が 50px になったことは出ない。** ここは全部の寸法を
 * 前後で突き合わせるので、減ったものが1個でもあれば名前で出る。
 *
 * **測るところは自分で書かない。`hitbox.mjs` を呼ぶ。**
 * ここにも `hitbox.mjs` の写しが置いてあって、「閉じた畳みの中は飛ばす」まで
 * 一緒に写っていた。写しがあるかぎり、直した数だけ漏れが残る
 * （`docs/island-misses.md` #83）。突き合わせの鍵（`k`）も `hitbox.mjs` が返す。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { openFolds, measure, SEL_ALL, addProbe, delProbe, isProbe, probeVerdict } from "./hitbox.mjs";

/** 既定で見る面。旅の連なりまわり（`.chain-foot` / `.chap-note` を持つ面） */
export const CHAIN_PAGES =
  "/atlas,/island/albania,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east,/island/nordic," +
  "/island/caucasus/streams,/island/europe/streams,/island/iran-walk/streams,/island/middle-east/streams";

/**
 * 前後を1回ずつ測って突き合わせる。
 *
 *   undo … 「直す前」に戻す CSS。**これ以外は何も変えない**
 *   fold … "open"（既定・畳みの中も数える）/ "skip"（前の数え方）
 */
export async function abhit({
  undo,
  sport = process.env.SPORT || "4210",
  w = Number(process.env.W || 390),
  h = Number(process.env.H || 900),
  pages = (process.env.PAGES || CHAIN_PAGES).split(","),
  sel = process.env.SEL || SEL_ALL,
  fold = process.env.FOLD || "open",
  min = Number(process.env.MIN || 48),
  out = process.env.OUT || `/tmp/backreport/abhit-${process.env.W || 390}.json`,
  probe = !!process.env.PROBE,
} = {}) {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
    isMobile: w < 900, hasTouch: w < 900, reducedMotion: "reduce" });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {}
  });
  const p = await ctx.newPage();
  console.log(`幅 ${w} / 畳み ${fold === "skip" ? "開かない（前の数え方）" : "先に開く"} / 戻す1行: ${undo}`);
  const all = [];
  for (const path of pages) {
    await p.goto(`http://localhost:${sport}${path === "/" ? "/index" : path}.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(700);
    /* 住人は歩く。2回測るあいだに動くと、前後の差が「島の住人が動いた」になる。
       rAF を止めてから測る（`docs/island-misses.md` #80）。 */
    await p.evaluate(() => {
      window.requestAnimationFrame = () => 0;
      const st = document.createElement("style");
      st.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}";
      document.head.appendChild(st);
    });
    if (probe) await addProbe(p);
    /* **畳みは前後の測定より先に、1回だけ開く。** 前後で開き直すと、
       開く動きの途中を測ることになる */
    let folds = { opened: 0, stillClosed: 0 };
    if (fold === "skip") {
      await p.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
        window.scrollTo(0, 0);
      });
      await p.waitForTimeout(400);
    } else {
      folds = await openFolds(p);
    }

    // 直す前（打ち消した姿）
    await p.evaluate((css) => {
      const st = document.createElement("style"); st.id = "undo"; st.textContent = css; document.head.appendChild(st);
    }, undo);
    const B = await measure(p, { sel, min, fold });
    // 直した後（そのまま）
    await p.evaluate(() => document.getElementById("undo")?.remove());
    const A = await measure(p, { sel, min, fold });
    if (probe) {
      const v = probeVerdict({ after: A.rows, min });
      console.log(`  仕込み: ${v.ok ? "そのとおりに出た" : "!! だめ。この回の数は読まない"}`);
      for (const l of v.lines) console.log("  " + l);
      await delProbe(p);
    }

    const rowsOf = (m) => [...m.rows, ...m.skipped].filter((r) => !isProbe(r));
    const before = rowsOf(B), after = rowsOf(A);
    const bm = new Map(before.map((r) => [r.k, r]));
    const shrunk = [], grew = [], gone = [];
    for (const a of after) {
      const b0 = bm.get(a.k);
      if (!b0) { gone.push({ side: "後だけ", k: a.k, t: a.t, fold: a.fold }); continue; }
      bm.delete(a.k);
      if (b0.why || a.why) { if (b0.why !== a.why) gone.push({ k: a.k, t: a.t, b: b0.why || "測れた", a: a.why || "測れた" }); continue; }
      if (a.hit[0] < b0.hit[0] || a.hit[1] < b0.hit[1]) shrunk.push({ t: a.t, c: a.c, fold: a.fold, b: b0.hit, a: a.hit });
      else if (a.hit[0] > b0.hit[0] || a.hit[1] > b0.hit[1]) grew.push({ t: a.t, c: a.c, fold: a.fold, b: b0.hit, a: a.hit });
    }
    for (const [, r] of bm) gone.push({ side: "前だけ", k: r.k, t: r.t, fold: r.fold });
    const inFold = after.filter((r) => r.fold).length;
    const small = A.rows.filter((r) => !isProbe(r) && r.small);
    all.push({ path, n: after.length, inFold, folds, small: small.length, shrunk, grew, gone });
    console.log(
      `${path}  押しどころ ${before.length}→${after.length}（畳みの中 ${inFold}）` +
        `  ${min}px割れ ${small.length}  減った ${shrunk.length}  増えた ${grew.length}  片方だけ ${gone.length}`,
    );
    for (const s of shrunk) console.log(`   ** 減った ** 「${s.t}」 ${s.c}${s.fold ? "[畳みの中]" : ""}  ${s.b[0]}x${s.b[1]} → ${s.a[0]}x${s.a[1]}`);
    for (const s of grew) console.log(`      増えた  「${s.t}」 ${s.c}${s.fold ? "[畳みの中]" : ""}  ${s.b[0]}x${s.b[1]} → ${s.a[0]}x${s.a[1]}`);
    for (const s of gone) console.log(`      片方だけ ${JSON.stringify(s)}`);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(all, null, 1));
  const S = all.reduce((a, r) => a + r.shrunk.length, 0), G = all.reduce((a, r) => a + r.grew.length, 0);
  console.log(
    `\n幅 ${w}: ${all.length}面 / 押しどころ ${all.reduce((a, r) => a + r.n, 0)}個` +
      `（うち畳みの中 ${all.reduce((a, r) => a + r.inFold, 0)}個）` +
      `  ${min}px割れ ${all.reduce((a, r) => a + r.small, 0)}個  減った ${S}個  増えた ${G}個`,
  );
  await b.close();
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  /** 直す前に戻す1行。別の値を試すときは `UNDO=` で渡す */
  await abhit({ undo: process.env.UNDO || ".chain-foot a,.chap-note a{padding-block:0!important}" });
}
