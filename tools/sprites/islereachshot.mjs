/** **届く／届かないを、絵にする。** `islereach.mjs` が出した数を目で確かめるための道具。
 *
 *   node tools/sprites/islereachshot.mjs
 *   P=/island/caucasus CAM=wide node tools/sprites/islereachshot.mjs
 *
 * 当たりの箱を、状態ごとに色を変えて囲う。
 *   緑 … 届く ／ 朱 … 取られている・引っ込んでいる ／ 橙 … 画面の外（測れない）
 * 画面の外にいるものは、いる向きの縁に橙の札を出して「どっちに何軒いるか」を書く。
 * **数字だけで「届かない」と言わないための絵**（`docs/island-standards.md` 1・4）。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

const W = Number(process.env.W || 390);
const P = process.env.P || "/island/caucasus";
const CAM = process.env.CAM || "close";
const OUT = process.env.OUT || `/tmp/reach-${P.replace(/\W+/g, "-")}-${CAM}.png`;

const DRAW = `() => {
  document.querySelectorAll(".reach-mark").forEach((e) => e.remove());
  const box = (b, color, text, dashed) => {
    const d = document.createElement("div");
    d.className = "reach-mark";
    d.style.cssText = \`position:fixed;left:\${b.left}px;top:\${b.top}px;width:\${b.width}px;height:\${b.height}px;
      border:2px \${dashed ? "dashed" : "solid"} \${color};border-radius:10px;z-index:99999;pointer-events:none;\`;
    const t = document.createElement("span");
    t.textContent = text;
    t.style.cssText = \`position:absolute;left:0;top:-15px;font:700 10px/13px system-ui;color:#fff;background:\${color};
      padding:0 4px;border-radius:5px;white-space:nowrap;\`;
    d.appendChild(t);
    document.body.appendChild(d);
  };
  const edge = (x, y, color, text) => {
    const d = document.createElement("div");
    d.className = "reach-mark";
    d.style.cssText = \`position:fixed;left:\${x}px;top:\${y}px;transform:translate(-50%,-50%);z-index:99999;
      pointer-events:none;font:800 10px/14px system-ui;color:#fff;background:\${color};padding:2px 6px;border-radius:8px;
      border:2px solid #fff;white-space:nowrap;\`;
    d.textContent = text;
    document.body.appendChild(d);
  };
  /* **突く先は中心から 23px。24px ではない。**
     札の見えない当たり（chain.css の .isle-mark::before）は max(100%, 48px) で
     **ちょうど 48px**。中心から 24px はその境目そのものなので、丸めしだいで
     下の地面が返る。実測で /island/middle-east の引きは、札4枚のうち2枚が
     (0,+24) だけで落ちて「入口が無い」と出ていた（23px にすると4枚とも通る）。
     plates.ts が TAP_FIT = 49（48ではなく49）を取っているのと同じ理由。 */
  const D = 23;
  const reach = (el) => {
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return "out";
    for (const [dx, dy] of [[0,0],[-D,0],[D,0],[0,-D],[0,D]]) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
      const h = document.elementFromPoint(px, py);
      if (!h || (!el.contains(h) && h !== el)) return "taken";
    }
    return "ok";
  };
  const st = (el, host) => {
    if (!el) return "none";
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return "out";
    if (host && host.getAttribute("data-hit") === "off") return "off";
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) return "off";
    return reach(el);
  };
  const COL = { ok: "#1f9d55", taken: "#d0021b", off: "#d0021b", out: "#e08000" };
  const JA = { ok: "届く", taken: "取られている", off: "引っ込んでいる", out: "画面の外" };
  const tally = { ok: 0, taken: 0, off: 0, out: 0, none: 0 };
  document.querySelectorAll(".isle-spot").forEach((host, i) => {
    const hit = host.querySelector(".isle-hit");
    const mark = host.querySelector(".isle-mark");
    const sh = st(hit, host), sm = st(mark, null);
    const name = (hit?.getAttribute("aria-label") || "").replace(/^この島(で|の)?/, "").replace(/をみる$/, "");
    const s = sh === "ok" || sm === "ok" ? "ok" : sh;
    tally[s] = (tally[s] || 0) + 1;
    if (sh !== "none" && sh !== "out") box(hit.getBoundingClientRect(), COL[sh] || "#888", \`\${name}／当たり:\${JA[sh] || sh}\`);
    if (sm === "ok") box(mark.getBoundingClientRect(), COL.ok, \`\${name}／札:届く\`, true);
    if (sh === "out") {
      const b = hit.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      edge(Math.min(Math.max(cx, 46), innerWidth - 46), Math.min(Math.max(cy, 20), innerHeight - 20),
        COL.out, \`\${name} ←画面の外(\${Math.round(cx)},\${Math.round(cy)})\`);
    }
  });
  const wt = { ok: 0, taken: 0, off: 0, out: 0, none: 0 };
  document.querySelectorAll(".isle-who").forEach((host) => {
    const el = host.querySelector(".isle-who-hit");
    const s = st(el, host);
    wt[s] = (wt[s] || 0) + 1;
    if (s === "none") return;
    if (s === "out") {
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      edge(Math.min(Math.max(cx, 30), innerWidth - 30), Math.min(Math.max(cy, 20), innerHeight - 20), COL.out, "住人 ←外");
      return;
    }
    box(el.getBoundingClientRect(), COL[s] || "#888", "住人:" + (JA[s] || s));
  });
  const legend = document.createElement("div");
  legend.className = "reach-mark";
  legend.style.cssText = \`position:fixed;left:8px;bottom:8px;z-index:99999;font:700 11px/16px system-ui;color:#fff;
    background:rgba(0,0,0,.78);padding:6px 9px;border-radius:9px;pointer-events:none;\`;
  legend.textContent = \`建物 届く\${tally.ok} 取られ\${tally.taken} 引っ込み\${tally.off} 画面外\${tally.out}／\` +
    \`住人 届く\${wt.ok} 取られ\${wt.taken} 引っ込み\${wt.off} 画面外\${wt.out} 未描画\${wt.none}\`;
  document.body.appendChild(legend);
  return { 建物: tally, 住人: wt, cam: document.querySelector(".isle")?.getAttribute("data-cam") };
}`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
await viaCurl(ctx);
await offline(ctx);
const pg = await ctx.newPage();
await pg.goto(ORIGIN + P, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(2500);
const shut = async () => {
  for (let i = 0; i < 20; i++) {
    const t = await pg.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false);
    if (!t) break;
    await pg.mouse.click(4, 4).catch(() => {});
    await pg.waitForTimeout(300);
  }
};
if (process.env.TALK === "keep") {
  /* **喋りが出るまで待って、そのまま撮る。** 島に降りて9秒すると住人のほうから
     声をかけてきて（folk.ts の CALL_AFTER）、そのあいだ押しどころが全部止まる。
     「12秒のうち後半が丸ごと 0 になる」のを絵で見せるための撮り方。 */
  for (let i = 0; i < 30; i++) {
    const t = await pg.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false);
    if (t) break;
    await pg.waitForTimeout(500);
  }
} else await shut();
if (CAM === "wide") { await (await pg.$(".isle-view"))?.click(); await pg.waitForTimeout(2500); await shut(); }
/* 島は rAF で動く。撮るあいだ止めないと、囲った箱と絵が1フレームずれる
   （`docs/island-misses.md` の「島を止めてから撮る」） */
await pg.evaluate(() => { window.requestAnimationFrame = () => 0; });
await pg.waitForTimeout(300);
console.log(P, CAM, JSON.stringify(await pg.evaluate((src) => eval(src)(), DRAW)));
await pg.screenshot({ path: OUT });
console.log("→", OUT);
await ctx.close();
await b.close();
