/**
 * 11月の城の貯金箱の**なめらかさ**を、PRISM の条件で数える（#1078）。とくに**アラートが明けて金貨が城に入るところ**。
 *
 *   cd tools/sprites
 *   node alert-bankperf.mjs --base http://127.0.0.1:4610                 # 金貨が入るところ・そのあとのピポ（3 回）
 *   node alert-bankperf.mjs --base ... --perf-page                       # /alert/perf?theme=castle も流し、「貯金箱」の行を出す
 *
 * ## なぜ要るか
 *
 * `/alert/perf`（`public/alert/perf.html`）は貯金箱を `?preview=bank` で 8 秒流すだけで、**アラートの終わりから
 * 金貨が入るところ**は流していない（試し表示の投げ銭のあとは、アラートの面を測っている）。2版目で足した金貨の
 * 動き（`season/bank/CastleBank.tsx` の `coins`）のカクつきを、ここで数える。
 *
 * ## 数え方
 *
 * - `/alertbox/?preview=1&amount=<円>&theme=castle&at=1` を PRISM の条件（箱 436×776・`visualViewport.scale` 0.5・
 *   密度 3。`/alert/perf` を撮ったときと同じ）で開く。投げ銭のアラート（30 秒）が明けると貯金箱が出直し、
 *   金貨が入る（`data-castle-phase` が coins → rise → idle と替わる）
 * - ページの requestAnimationFrame の時刻を全部控え、次の2つの窓でコマの間隔を数える
 *   - **金貨**: アラートの面が消え始める 1 秒前（coins の 1.5 秒前）から、coins の 3.5 秒後まで
 *     （面が薄れて消える → 貯金箱が出る → 金貨が飛ぶ → バンザイ → 灯りが上がる）
 *   - **そのあと**: idle に戻って 0.5 秒後から 8 秒（ピポが歩き出す）
 * - カクつき = コマの間が 50ms を超えた回数（`/alert/perf` と同じ）
 * - **この箱の合成はソフトウェア（SwiftShader）**。数は比べ合いとして読む（SKILL.md 4「重さの決まり」）。
 *   ほかの担当が書き出しを回していると落ちるので、`--runs`（既定 3）回流して中央値を出す
 *
 * 終了コード: 0 = どの窓もカクつき 0 / 1 = カクついた / 2 = 測れなかった
 */
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote, PRISM_SCALE } from "./prism.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://127.0.0.1:4610").replace(/\/$/, "");
const amount = Number(arg("amount", "500"));
const runs = Math.max(1, Number(arg("runs", "3")));
const DPR = Number(arg("dpr", "3"));
const STUTTER = 50;
const exe = chromePath() ?? "/opt/pw-browsers/chromium";

/** ページの rAF の時刻と、貯金箱の場面の替わり目を控える（ページを開く前に入れる） */
const RECORDER = () => {
  window.__raf = [];
  window.__phase = [];
  let last = "absent";
  const tick = (t) => {
    window.__raf.push(t);
    const el = document.querySelector("[data-castle-phase]");
    const ph = el ? el.getAttribute("data-castle-phase") : "absent";
    if (ph !== last) {
      window.__phase.push({ t, ph });
      last = ph;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

function gaps(raf, a, b) {
  const ts = raf.filter((t) => t >= a && t <= b);
  const g = [];
  for (let i = 1; i < ts.length; i++) g.push(ts[i] - ts[i - 1]);
  const sec = (b - a) / 1000;
  return { fps: ts.length / sec, stutter: g.filter((x) => x > STUTTER).length, max: g.length ? Math.max(...g) : 0 };
}

async function once(browser) {
  const ctx = await browser.newContext({ viewport: { width: 436, height: 776 }, deviceScaleFactor: DPR });
  try {
    await prism(ctx, { scale: PRISM_SCALE });
    await ctx.addInitScript(RECORDER);
    const page = await ctx.newPage();
    const q = new URLSearchParams({ preview: "1", amount: String(amount), theme: "castle", at: "1", fill: "40" });
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "load", timeout: 30000 });
    // アラートが明けて金貨が入り、ピポが歩き出して 8 秒たつまで
    await page.waitForFunction(
      () => {
        const ph = window.__phase;
        const coins = ph.findIndex((p, i) => p.ph === "coins" && i > 0);
        if (coins < 0) return false;
        const idle = ph.slice(coins).find((p) => p.ph === "idle");
        return idle && performance.now() > idle.t + 8600;
      },
      null,
      { timeout: 90000, polling: 500 }
    );
    const { raf, phase } = await page.evaluate(() => ({ raf: window.__raf, phase: window.__phase }));
    const coins = phase.find((p, i) => p.ph === "coins" && i > 0);
    const idle = phase.slice(phase.indexOf(coins)).find((p) => p.ph === "idle");
    return {
      coin: gaps(raf, coins.t - 1500, coins.t + 3500),
      after: gaps(raf, idle.t + 500, idle.t + 8500),
      coinToIdle: idle.t - coins.t,
    };
  } finally {
    await ctx.close();
  }
}

async function perfPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 436, height: 776 }, deviceScaleFactor: DPR });
  try {
    await prism(ctx, { scale: PRISM_SCALE });
    const page = await ctx.newPage();
    await page.goto(`${base}/alert/perf.html?theme=castle`, { waitUntil: "load" });
    await page.waitForFunction(() => Array.isArray(window.__perf), null, { timeout: 600000, polling: 1000 });
    return await page.evaluate(() => window.__perf);
  } finally {
    await ctx.close();
  }
}

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  console.log(prismNote(false, PRISM_SCALE));
  console.log(`箱 436×776・密度 ${DPR}。${amount} 円の試し表示のアラートが明けたところを ${runs} 回。カクつき = コマの間 ${STUTTER}ms 超`);
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  let bad = 0;
  try {
    const rs = [];
    for (let i = 0; i < runs; i++) {
      const r = await once(browser);
      rs.push(r);
      console.log(
        `  ${i + 1} 回目: 金貨（明け 1.5 秒前〜金貨の 3.5 秒後） ${r.coin.fps.toFixed(1)} コマ/秒・カクつき ${r.coin.stutter}・最長 ${r.coin.max.toFixed(0)}ms` +
          ` ／ そのあと 8 秒 ${r.after.fps.toFixed(1)} コマ/秒・カクつき ${r.after.stutter}・最長 ${r.after.max.toFixed(0)}ms（金貨から歩き出すまで ${(r.coinToIdle / 1000).toFixed(1)} 秒）`
      );
    }
    for (const k of ["coin", "after"]) {
      const s = med(rs.map((r) => r[k].stutter));
      console.log(`  中央値 ${k === "coin" ? "金貨" : "そのあと"}: ${med(rs.map((r) => r[k].fps)).toFixed(1)} コマ/秒・カクつき ${s}・最長 ${med(rs.map((r) => r[k].max)).toFixed(0)}ms`);
      if (s > 0) bad++;
    }
    if (process.argv.includes("--perf-page")) {
      console.log("\n/alert/perf?theme=castle（全場面。この箱の数）:");
      for (const row of await perfPage(browser)) {
        console.log(`  ${row.name.padEnd(16)} ${row.fps.toFixed(1)} コマ/秒・カクつき ${row.stutter}・最長 ${row.max.toFixed(0)}ms`);
      }
    }
  } finally {
    await browser.close();
  }
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
