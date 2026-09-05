// 字と地の色を計算値から拾って比を出す。画素は読まない（前の版は canvas で固まった）。
import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
for (const path of (process.env.PAGES||"/map").split(",")) {
  await p.goto(`http://localhost:3022${path}`, { waitUntil:"domcontentloaded" });
  await p.waitForTimeout(1500);
  const out = await p.evaluate((sels) => {
    const px = (c) => (c.match(/[\d.]+/g)||[0,0,0]).slice(0,3).map(Number);
    const L = (c) => { const f=(v)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4}; return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
    const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return px(c); n = n.parentElement; } return [255,255,255]; };
    const r = [];
    for (const s of sels) {
      const el = document.querySelector(s); if (!el) continue;
      const cs = getComputedStyle(el);
      const fg = px(cs.color), bg = bgOf(el);
      const l1 = L(fg), l2 = L(bg);
      r.push(`${s}  ${((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2)} : 1  ${cs.fontSize}  字${cs.color} 地rgb(${bg})`);
    }
    return r;
  }, (process.env.SELS||".amap-key,.amap-key em,.atrip-here,.atrip-when,.atrip-name em,.apass-log dt,.anote-year,.aline-when,.astep-head time,.tile-text i,.chip,.aapp-line").split(","));
  console.log("== " + path); out.forEach(x=>console.log("  "+x));
}
await b.close();
