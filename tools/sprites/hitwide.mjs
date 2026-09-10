/**
 * 引き（島ぜんぶ）の札の押しどころを測る。
 *
 * `hitbox.mjs` は面を開いてそのまま測るので、**引きに移ってからの札**が測れない。
 * ここは「島をながめる」を押してから、同じやり方（中心から1pxずつ外へ伸ばして
 * `elementFromPoint` が自分を返すか）で測る。見た目の箱では測らない。
 *
 *   SPORT=4730 DAY=2026-09-13T12:00:00+09:00 W=390 node _hitwide.mjs
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const W = Number(process.env.W || 390);
const DAY = process.env.DAY || "";
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:W,height:900}, deviceScaleFactor:1, isMobile:W<700, hasTouch:W<700, reducedMotion:"reduce" });
await offline(ctx);
if (DAY) await ctx.addInitScript(`(() => { const F=${Date.parse(DAY)}, R=Date, s=R.now();
  class D extends R { constructor(...a){ if(!a.length) super(F+(R.now()-s)); else super(...a);} static now(){return F+(R.now()-s);} static parse(...a){return R.parse(...a);} static UTC(...a){return R.UTC(...a);} }
  Object.defineProperty(D,"name",{value:"Date"}); globalThis.Date=D; })();`);
await ctx.addInitScript(() => localStorage.setItem("ayato-island-arrived","1"));
const p = await ctx.newPage();
await p.goto(`http://localhost:${process.env.SPORT || 4730}/index.html`, { waitUntil:"networkidle", timeout:60000 });
await p.waitForTimeout(3500);
const v = await p.$(".isle-view, .stage-view"); if (v) await v.click({ force:true });
await p.waitForTimeout(1800);
console.log(await p.evaluate(() => {
  const grow = (el) => {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.x + r.width/2), cy = Math.round(r.y + r.height/2);
    const mine = (x,y) => { const t = document.elementFromPoint(x,y); return t && (t===el || el.contains(t) || t.closest(".isle-mark,.spot-mark")===el); };
    if (!mine(cx,cy)) return "中心が取られている";
    let l=0,rr=0,u=0,d=0;
    while (l<80 && mine(cx-l-1,cy)) l++;
    while (rr<80 && mine(cx+rr+1,cy)) rr++;
    while (u<80 && mine(cx,cy-u-1)) u++;
    while (d<80 && mine(cx,cy+d+1)) d++;
    return `${l+rr+1}x${u+d+1}`;
  };
  return [...document.querySelectorAll(".isle-spot.is-sign, .spot.is-sign")].map((sp) => {
    const m = sp.querySelector(".isle-mark,.spot-mark");
    const cs = getComputedStyle(m);
    if (cs.visibility === "hidden" || cs.opacity === "0") return null;
    return `${(m.textContent||"").trim().slice(0,8)}  当たり ${grow(m)}`;
  }).filter(Boolean).join("\n");
}));
await b.close();
