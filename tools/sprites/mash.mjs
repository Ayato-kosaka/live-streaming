/**
 * 島を押しつづけて落ちるかを見る。
 *
 * あやとの言葉:「ちょっと性能に懸念があって押してると落ちる」。
 * 何が落ちるのかを推測で決めないための道具。次を全部拾う。
 *
 *   - タブのクラッシュ（`page.on("crash")`）
 *   - JS の例外（`page.on("pageerror")`）と console のエラー
 *   - 押すたびに増えて戻らないもの（CDP `Performance.getMetrics` の
 *     Nodes / JSEventListeners / JSHeapUsedSize）
 *   - rAF が二重に走っていないか。**累計の平均で見ない。**
 *     測るたびに 1.2 秒の窓を開けて、その窓のあいだの回数だけを数える
 *
 * 使い方:
 *   SPORT=4140 STAY=1 TAPS=400 node mash.mjs   # 島から出ないで押しつづける
 *   SPORT=4140 TAPS=300 node mash.mjs          # 出たら開き直す
 *   SPORT=4140 PC=1 node mash.mjs              # PC（1440x900・dpr2）
 *   SPORT=4140 URL=/island/nordic.html node mash.mjs
 *
 * **戻るのに `goBack` を使わない。** 履歴で戻ると前の面が bfcache に残り、
 * Nodes と JSEventListeners がそのぶん増えて「漏れている」に見える
 * （実測で 300回のうち13ドキュメントぶん、2万ノード）。それは漏れではない。
 *
 * **壁の時計で速さを測る道具ではない**（`CLAUDE.md`）。落ちるかどうかと、
 * 戻らない数だけを見る。速さは `framecpu.mjs` で測る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4321";
const URLPATH = process.env.URL || "/index.html";
const TAPS = Number(process.env.TAPS || 300);
const PC = !!process.env.PC;
const W = Number(process.env.W || (PC ? 1440 : 390));
const H = Number(process.env.H || (PC ? 900 : 844));
const DPR = Number(process.env.DPR || (PC ? 2 : 3));
const SEED = Number(process.env.SEED || 7);
/** 島から出ない。リンクの既定動作だけ止めて、同じドキュメントを押しつづける */
const STAY = !!process.env.STAY;
/** 寄り引きを何回に1回切り替えるか。0 で切り替えない */
const FLIP = Number(process.env.FLIP ?? 20);

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
await offline(ctx);

const page = await ctx.newPage();

/* rAF を包んで、呼ばれた回数を数える。ループが二重に立てば、
   同じ 60fps でも1秒あたりの回数が倍になる。 */
await page.addInitScript(() => {
  const w = window;
  w.__raf = { calls: 0 };
  const orig = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => {
    w.__raf.calls++;
    return orig(cb);
  };
});

if (STAY) {
  /* リンクの行き先だけ止める。捕捉の段で preventDefault すると
     Next の <Link> も defaultPrevented を見て降りるので、
     島の側の onClick（歩く・札を開く）はそのまま動く。 */
  await page.addInitScript(() => {
    addEventListener(
      "click",
      (e) => {
        if (e.target?.closest?.("a")) e.preventDefault();
      },
      true,
    );
  });
}

const errs = [];
let crashed = false;
page.on("pageerror", (e) => errs.push("JS: " + String(e).slice(0, 300)));
page.on("crash", () => {
  crashed = true;
  errs.push("CRASH: タブが落ちた");
});
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|island-api/.test(m.text()))
    errs.push("console: " + m.text().slice(0, 200));
});

const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
const metrics = async () => {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  const g = (n) => m.find((x) => x.name === n)?.value ?? 0;
  return {
    heapMB: +(g("JSHeapUsedSize") / 1048576).toFixed(1),
    nodes: g("Nodes"),
    listeners: g("JSEventListeners"),
    docs: g("Documents"),
  };
};

await page.goto(`http://localhost:${SPORT}${URLPATH}`, { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(2500);

const stage = await page.$(".stage, .isle");
if (!stage) {
  console.log("島が見つからない:", URLPATH, page.url());
  await b.close();
  process.exit(1);
}
const box = await stage.boundingBox();
// 到着演出（カモメの名乗り）を閉じる。島の左上の隅なら、押しても入口に当たらない
if (!PC) await page.touchscreen.tap(box.x + 12, box.y + 12);
else await page.mouse.click(box.x + 12, box.y + 12);
await page.waitForTimeout(700);

let navs = 0;
const rows = [];
const snap = async (label) => {
  const raf = await page.evaluate(
    () =>
      new Promise((res) => {
        const a = window.__raf.calls;
        const t = performance.now();
        setTimeout(
          () => res(Math.round(((window.__raf.calls - a) * 1000) / (performance.now() - t))),
          1200,
        );
      }),
  );
  rows.push({ label, ...(await metrics()), navs, raf });
};
await snap("0");

/** 「島ぜんぶ」と「島にもどる」の切り替え */
const toggleView = async () => {
  const t = await page.$(".stage-view, .isle-view");
  if (t) await t.click({ timeout: 2000 }).catch(() => {});
};

let done = 0;
for (let i = 1; i <= TAPS && !crashed; i++) {
  const x = box.x + 10 + rnd() * (box.width - 20);
  const y = box.y + 10 + rnd() * (box.height - 20);
  if (!page.url().endsWith(URLPATH)) {
    navs++;
    await page.goto(`http://localhost:${SPORT}${URLPATH}`, { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(700);
  }
  if (!PC) await page.touchscreen.tap(x, y).catch((e) => errs.push("tap: " + e.message.slice(0, 120)));
  else await page.mouse.click(x, y).catch((e) => errs.push("click: " + e.message.slice(0, 120)));
  if (FLIP && i % FLIP === 0) await toggleView();
  await page.waitForTimeout(40);
  done = i;
  if (i % 50 === 0) await snap(String(i));
}
await page.waitForTimeout(1200);
if (!crashed) await snap("end");

console.log(
  `\n${URLPATH}  ${W}x${H} dpr${DPR}  taps=${done}/${TAPS}  ${STAY ? "島から出ない" : "出たら開き直す"}`,
);
console.log("tap   heapMB   nodes  listeners  docs  出入り  raf/秒");
for (const r of rows)
  console.log(
    `${r.label.padEnd(5)} ${String(r.heapMB).padStart(6)} ${String(r.nodes).padStart(7)} ${String(
      r.listeners,
    ).padStart(10)} ${String(r.docs).padStart(5)} ${String(r.navs).padStart(7)} ${String(
      r.raf,
    ).padStart(7)}`,
  );
console.log("\ncrashed:", crashed);
console.log("errors:", errs.length);
for (const e of [...new Set(errs)].slice(0, 30)) console.log("  " + e);

await b.close();
