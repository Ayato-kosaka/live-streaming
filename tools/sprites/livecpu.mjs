/**
 * `/roulette` の**結果が出ているあいだ**の CPU を、A と B を**交互に**測る。
 *
 * `CLAUDE.md`:「島の SVG の中で動かしたものは、その形の外接矩形ぶんが
 * 毎フレーム描き直される。要素の数でも、画素の数でも、ぼかしでもない。
 * **形の大きさ**で決まる」。ここで動いているのは結果の札の後ろで回る光
 * （`.rl-card::before` の `rl-rays`）で、外接矩形は**画面の 35〜41%**。
 * `livecheck.mjs` がその大きさを測る。**それがいくらの代金なのか**を
 * 見るのがこちら。
 *
 * **1条件ずつ順に測らない。** この箱は混むので、A→A→B→B だと
 * 前後がひっくり返る（`CLAUDE.md`／`_ab.mjs`）。A と B を交互に測って、
 * **比だけを読む。**
 *
 *   SPORT=4500 node tools/sprites/livecpu.mjs
 *
 * 止めるのは `rl-rays` だけ。札も字も背景もそのまま出る（絵は変わらない）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { apply as liveseed } from "./liveseed.mjs";

const PORT = process.env.SPORT || "4500";
const URL = `http://localhost:${PORT}/roulette.html?s=0123456789abcdef0123456789abcdef`;
const ROUNDS = Number(process.env.ROUNDS || 3);
/** OBS の実寸。1080p で測る（配信に出るのはこの大きさ） */
const W = Number(process.env.W || 1920);
const H = Number(process.env.H || 1080);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const metrics = async (cdp) =>
  Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

/** 1回ぶん。回り終わって札が出たところから6秒ぶんの CPU を取る。 */
async function once(off) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await offline(ctx);
  await liveseed(ctx, { spin: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  await p.addInitScript(
    ({ css }) => {
      if (css)
        document.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = css;
          document.head.appendChild(s);
        });
      window.__f = 0;
      const tick = () => { window.__f++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    },
    { css: off ? ".rl-card::before{animation:none !important}" : "" },
  );
  await p.goto(URL, { waitUntil: "load", timeout: 60000 });
  // 回り始め +1.2 秒、回る 15 秒。終わって札が出るまで待つ
  await p.waitForTimeout(18500);
  const a = await metrics(cdp);
  const f0 = await p.evaluate(() => window.__f);
  await p.waitForTimeout(6000);
  const z = await metrics(cdp);
  const f1 = await p.evaluate(() => window.__f);
  const shown = await p.evaluate(() => !!document.querySelector(".rl-card"));
  await ctx.close();
  const frames = Math.max(1, f1 - f0);
  return {
    shown,
    frames,
    /** 6秒のあいだに描画プロセスが使った CPU（ms）。混み具合で動かない */
    cpu6: (z.ProcessTime - a.ProcessTime) * 1000,
    main6: (z.ThreadTime - a.ThreadTime) * 1000,
  };
}

const on = [], offs = [];
for (let i = 0; i < ROUNDS; i++) {
  on.push(await once(false));
  offs.push(await once(true));
}
await b.close();

const med = (rs, k) => {
  const s = rs.map((r) => r[k]).sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
/* **1秒あたりの CPU と fps を併記する。**
   「1フレームあたりの CPU」だけで読むと、遅くなるほど大きく出るので、
   速くしたのに悪化して見える（`CLAUDE.md`）。 */
const line = (nm, rs) =>
  `  ${nm}  1秒あたり CPU ${(med(rs, "cpu6") / 6).toFixed(1)} ms/s` +
  `（うちメイン ${(med(rs, "main6") / 6).toFixed(1)}）` +
  `  fps ${(med(rs, "frames") / 6).toFixed(1)}\n` +
  `          CPU 3回 [${rs.map((r) => r.cpu6.toFixed(0)).join(" / ")}] ms` +
  `   フレーム 3回 [${rs.map((r) => r.frames).join(" / ")}]`;

console.log(`■ /roulette の結果の札  ${W}x${H}  札が出たか ${on[0].shown ? "出た" : "出ていない（測り直し）"}`);
console.log(line("光あり", on));
console.log(line("光なし", offs));
const r = med(on, "cpu6") / Math.max(1, med(offs, "cpu6"));
console.log(`  比 ${r.toFixed(2)} 倍  ← 1に近ければ、回る光は代金を取っていない`);
console.log("  ※ 壁の時計（フレーム数）は混み具合で動く。読むのは CPU と比だけ（CLAUDE.md）");
