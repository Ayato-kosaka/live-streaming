import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const PAGES = (process.env.PAGES||"/map,/map/france,/apps,/about").split(",");
const SELS = (process.env.SELS||".amap-key,.atrip-here,.atrip-when,.apass-who i,.chip,.aapp-line,.fold-n,.tile-text i,.muted").split(",");
const lum = (c)=>{const [r,g,bb]=c;const f=(v)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bb)};
for (const path of PAGES) {
  await p.goto(`http://localhost:3022${path}`, { waitUntil:"networkidle" });
  await p.waitForTimeout(700);
  for (const sel of SELS) {
    const el = await p.$(sel); if (!el) continue;
    // 要素を撮って、いちばん多い色を地、暗いほうの3%を字とする
    let buf; try { buf = await el.screenshot(); } catch { continue; }
    const png = buf;
    const r = await p.evaluate(async (d)=>{
      const img = new Image(); img.src = "data:image/png;base64,"+d;
      await img.decode();
      const cv = document.createElement("canvas"); cv.width=img.width; cv.height=img.height;
      const cx = cv.getContext("2d"); cx.drawImage(img,0,0);
      const px = cx.getImageData(0,0,cv.width,cv.height).data;
      const m = new Map(); const arr=[];
      for (let i=0;i<px.length;i+=4){const k=(px[i]>>2)+","+(px[i+1]>>2)+","+(px[i+2]>>2); m.set(k,(m.get(k)||0)+1); arr.push([px[i],px[i+1],px[i+2]]);}
      let bestK=null,bestN=0; for(const [k,n] of m) if(n>bestN){bestN=n;bestK=k;}
      const L=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
      arr.sort((a,b)=>L(a)-L(b));
      const ink = arr[Math.floor(arr.length*0.03)];
      const bg = bestK.split(",").map(v=>v*4+2);
      return { ink, bg };
    }, png.toString("base64"));
    const l1 = lum(r.ink), l2 = lum(r.bg);
    const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const fs = await el.evaluate(e=>getComputedStyle(e).fontSize);
    console.log(`${path} ${sel}  ${ratio.toFixed(2)} : 1  字=rgb(${r.ink})  地=rgb(${r.bg})  ${fs}`);
  }
}
await b.close();
