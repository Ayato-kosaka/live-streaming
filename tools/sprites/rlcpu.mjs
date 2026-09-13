/**
 * `/roulette` の**結果の札が出ているあいだ**の CPU を、A と B を交互に測る。
 *
 * `livecpu.mjs` と同じ測りかただが、止める相手が違う。あちらは
 * `.rl-card::before`（写した元の、ずっと回る光）を止めていた。
 * いまは光が `.rl-result::before` に移って**有限**になっているので、
 * あの選び手はもう何にも当たらない（A と B が同じものになる）。
 *
 *   SPORT=4700 node tools/sprites/rlcpu.mjs
 *   SPORT=4700 W=1280 H=720 node tools/sprites/rlcpu.mjs
 *
 * 「光あり」は**いまの本番の姿**、「光なし」は光を丸ごと消したもの。
 * 比が1に近ければ、札が出たあとに光は代金を取っていない。
 *
 * **1条件ずつ順に測らない。** この箱は混むので A→A→B→B だと前後が
 * ひっくり返る（`CLAUDE.md`／`_ab.mjs`）。交互に測って比だけを読む。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { apply as liveseed } from "./liveseed.mjs";

const PORT = process.env.SPORT || "4700";
const URL = `http://localhost:${PORT}/roulette.html?s=0123456789abcdef0123456789abcdef`;
const ROUNDS = Number(process.env.ROUNDS || 3);
const W = Number(process.env.W || 1920);
const H = Number(process.env.H || 1080);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const metrics = async (cdp) =>
  Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

/** 1回ぶん。回り終わって札が出たところから6秒ぶんの CPU と、動くものの外接矩形。 */
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
    { css: off ? ".rl-result::before,.rl-result::after{display:none !important}" : "" },
  );
  await p.goto(URL, { waitUntil: "load", timeout: 60000 });
  // 回り始め +1.2 秒、回る 15 秒。終わって札が出るまで待つ
  await p.waitForTimeout(18500);
  const a = await metrics(cdp);
  const f0 = await p.evaluate(() => window.__f);
  await p.waitForTimeout(6000);
  const z = await metrics(cdp);
  const f1 = await p.evaluate(() => window.__f);
  /* **測った窓の中で、まだ動いているものを数える。**
     「有限にしたから止まっている」を、止まっている絵で確かめる */
  const r = await p.evaluate(() => {
    const px = (v) => Math.round(v * 100) / 100;
    const live = (document.getAnimations?.() || [])
      .filter((x) => x.playState === "running")
      .map((x) => {
        const t = x.effect?.target;
        const ps = x.effect?.pseudoElement || "";
        const cs = t ? getComputedStyle(t, ps || undefined) : null;
        const q = t ? t.getBoundingClientRect() : { width: 0, height: 0 };
        const w = ps && cs ? parseFloat(cs.width) || q.width : q.width;
        const h = ps && cs ? parseFloat(cs.height) || q.height : q.height;
        return {
          name: x.animationName || "?",
          on: (t?.className?.baseVal ?? t?.className ?? t?.tagName ?? "?") + ps,
          box: `${px(w)}x${px(h)}`,
          cover: px(((w * h) / (innerWidth * innerHeight)) * 100),
        };
      });
    return { shown: !!document.querySelector(".rl-card"), live };
  });
  await ctx.close();
  return {
    ...r,
    frames: Math.max(1, f1 - f0),
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
const line = (nm, rs) =>
  `  ${nm}  1秒あたり CPU ${(med(rs, "cpu6") / 6).toFixed(1)} ms/s` +
  `（うちメイン ${(med(rs, "main6") / 6).toFixed(1)}）  fps ${(med(rs, "frames") / 6).toFixed(1)}\n` +
  `          CPU 3回 [${rs.map((r) => r.cpu6.toFixed(0)).join(" / ")}] ms` +
  `   フレーム 3回 [${rs.map((r) => r.frames).join(" / ")}]`;

console.log(`■ /roulette の結果の札  ${W}x${H}  札が出たか ${on[0].shown ? "出た" : "出ていない（測り直し）"}`);
console.log(line("光あり（いまの姿）", on));
console.log(line("光なし（丸ごと消す）", offs));
console.log(`  比 ${(med(on, "cpu6") / Math.max(1, med(offs, "cpu6"))).toFixed(2)} 倍  ← 1に近ければ、光は代金を取っていない`);
const live = on[0].live;
console.log(`  測った窓の中でまだ動いているもの ${live.length}件`);
for (const a of live) console.log(`    ${a.name} on .${a.on}  外接矩形 ${a.box}  画面の ${a.cover}%`);
