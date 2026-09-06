/**
 * 島を押しつづけて、落ちるか・戻らない数が出るかを見る。
 *
 * あやとの言葉:「ちょっと性能に懸念があって押してると落ちる」。
 * 「たぶんメモリだろう」で直さないための道具。次を全部拾う。
 *
 *   - タブのクラッシュ（`page.on("crash")`）
 *   - JS の例外（`page.on("pageerror")`）と console のエラー
 *   - 押すたびに増えて戻らないもの（CDP `Performance.getMetrics` の
 *     Nodes / JSEventListeners / JSHeapUsedSize）。**測る前に GC を呼ぶ。**
 *     呼ばないと、まだ回収していないだけのものを「漏れ」と読む
 *   - いま出ている DOM の数（`live`）。Nodes だけ増えて live が動かないなら、
 *     外れた DOM を誰かが掴んでいる
 *   - rAF が二重に走っていないか。**累計の平均で見ない。**
 *     測るたびに窓を開けて、その窓のあいだの回数だけを数える
 *
 * 使い方:
 *   SPORT=4141 node mash.mjs                       # スマホ 390×844 dpr3
 *   SPORT=4141 N=2000 node mash.mjs                # 長く
 *   SPORT=4141 PC=1 node mash.mjs                  # PC 1440×900 dpr2
 *   SPORT=4141 URL=/island/nordic.html node mash.mjs
 *   SPORT=4141 TH=4 node mash.mjs                  # CPU を4倍遅くして（実機寄り）
 *
 * ## 測るときに踏んだ穴（どちらも「漏れている」の誤報になる）
 *
 * **1. Playwright のハンドルを残さない。** `page.$()` / `page.$$()` が返す
 * ElementHandle は、その要素を掴んだままにする。React が中身を差し替えると、
 * 外れたほうの木がハンドルに吊られて残る。板を200回開け閉てするあいだ
 * 毎回 `page.$$(".isle-mark")` を呼んでいたら、Nodes が 19,000 まで増えて
 * GC でも減らなかった。**同じ操作を `page.evaluate` の中の click に
 * 書き換えたら、200回まわしても 536 のまま。** 島は無実だった。
 * だからここでは、押す場所も切り替えも全部 evaluate の中でやる。
 *
 * **2. 履歴で戻らない（`goBack`）。** 戻ると前の面が bfcache に残り、
 * そのぶんの Nodes と JSEventListeners が乗る（実測で13ドキュメント・2万ノード）。
 * それは漏れではない。ここではリンクの既定動作を止めて、島から出ない。
 *
 * **速さを測る道具ではない**（`CLAUDE.md`）。落ちるかどうかと、戻らない数だけ。
 * 速さは `framecpu.mjs`、2つの書き出しの比は `_abwide.mjs`。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4321";
const URLPATH = process.env.URL || "/index.html";
const N = Number(process.env.N || 1200);
const PC = !!process.env.PC;
const W = Number(process.env.W || (PC ? 1440 : 390));
const H = Number(process.env.H || (PC ? 900 : 844));
const DPR = Number(process.env.DPR || (PC ? 2 : 3));
/** CPU を何倍遅くするか。実機に寄せるなら 4。既定は絞らない */
const TH = Number(process.env.TH || 0);
const SEED = Number(process.env.SEED || 101);

/** 同じ順番で押せるように、乱数は自前で持つ */
let seed = SEED;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: !PC,
  hasTouch: !PC,
});
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });

const page = await ctx.newPage();
await page.addInitScript(() => {
  // 到着演出は別の話なので飛ばす。ここが見たいのは「降りたあと、押しつづけたら」
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-today", "2026-09-05");
  } catch {
    /* 書けない設定なら、到着演出ごと押すことになるだけ */
  }
  /* リンクの行き先だけ止める。捕捉の段で preventDefault すると Next の <Link> も
     defaultPrevented を見て降りるので、島の側の onClick（歩く・札を開く）は動く。 */
  addEventListener(
    "click",
    (e) => {
      if (e.target?.closest?.("a")) e.preventDefault();
    },
    true,
  );
  window.__raf = { calls: 0 };
  const orig = requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    window.__raf.calls++;
    return orig(cb);
  };
});

const errs = [];
let crashed = false;
page.on("pageerror", (e) => errs.push("JS: " + String(e).slice(0, 250)));
page.on("crash", () => {
  crashed = true;
  errs.push("CRASH: タブが落ちた");
});
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|island-api|501/.test(m.text()))
    errs.push("console: " + m.text().slice(0, 180));
});

const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");
if (TH) await cdp.send("Emulation.setCPUThrottlingRate", { rate: TH });

await page.goto(`http://localhost:${SPORT}${URLPATH}`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(3500);

const rect = await page.evaluate(() => {
  const el = document.querySelector(".stage, .isle");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.x, r.y, r.width, r.height];
});
if (!rect) {
  console.log("島が見つからない:", URLPATH, page.url());
  await b.close();
  process.exit(1);
}

const g = async (name) => {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === name)?.value ?? 0;
};
const snap = async (label) => {
  // 巻き戻してから測る。下まで送ったままだと島が画面の外で、rAF が止まっている
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  for (let q = 0; q < 3; q++) {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(350);
  }
  const raf = await page.evaluate(
    () =>
      new Promise((res) => {
        const a = window.__raf.calls;
        const t = performance.now();
        setTimeout(() => res(Math.round(((window.__raf.calls - a) * 1000) / (performance.now() - t))), 1200);
      }),
  );
  const live = await page.evaluate(() => document.querySelectorAll("*").length);
  console.log(
    `${label.padEnd(6)} ${(+((await g("JSHeapUsedSize")) / 1048576).toFixed(1) + "").padStart(7)} ${String(
      await g("Nodes"),
    ).padStart(7)} ${String(await g("JSEventListeners")).padStart(10)} ${String(live).padStart(6)} ${String(
      raf,
    ).padStart(7)}  ${page.url().split("/").slice(3).join("/")}`,
  );
};

console.log(`■ ${URLPATH} ${W}×${H} dpr${DPR}${TH ? ` CPU${TH}倍遅` : ""} を ${N} 回`);
console.log("回     heapMB   nodes  listeners    live  raf/秒  いる場所");
await snap("0");

for (let i = 1; i <= N && !crashed; i++) {
  const r = rnd();
  const x = rect[0] + 10 + rnd() * (rect[2] - 20);
  const y = rect[1] + 10 + rnd() * (rect[3] - 20);
  if (r < 0.62) {
    // 島のどこかを押す（歩く・札が開く・住人に当たる）
    if (PC) await page.mouse.click(x, y).catch((e) => errs.push("click " + e.message.slice(0, 90)));
    else await page.touchscreen.tap(x, y).catch((e) => errs.push("tap " + e.message.slice(0, 90)));
  } else if (r < 0.72) await page.evaluate(() => document.querySelector(".stage-view, .isle-view")?.click());
  else if (r < 0.8) await page.evaluate(() => document.querySelector(".island-bar button")?.click());
  else if (r < 0.9)
    await page.evaluate(() => {
      const w = [...document.querySelectorAll(".who-hit, .isle-who-hit")];
      w[(Math.random() * w.length) | 0]?.click();
    });
  else await page.evaluate(() => scrollTo(0, Math.random() * document.body.scrollHeight));
  await page.waitForTimeout(30);
  if (i % 300 === 0) await snap(String(i));
}

console.log("\ncrashed:", crashed);
console.log("errors:", errs.length);
for (const e of [...new Set(errs)].slice(0, 20)) console.log("  " + e);

await b.close();
