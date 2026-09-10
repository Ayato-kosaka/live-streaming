/** ログインしていない人が、はじめて来たときの本番を見る。
 *
 *   cd tools/sprites && node guest.mjs
 *
 * **差し込みを一切しない。** これまでの道具（`asme.mjs`）は「入っている人」として
 * 撮るので、面の9割はそちらでしか測れない。けれど**旅の最中に配信から来る人は、
 * ほとんど入っていない。** そちらは誰も見ていなかった。
 *
 * **通す先を削らない。** 本番が使っている置き場（Firebase Storage・YouTube の顔・
 * Wikimedia）を止めたまま撮ると「画像が落ちた」と出て、**本番は 200 なのに
 * 不具合だと報告することになる**（2026-09-10 に1回やりかけた。`island-standards.md` 13）。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
const O="https://live-streaming-d3cac.web.app";
const PASS=/live-streaming-d3cac\.web\.app|googleusercontent\.com|upload\.wikimedia\.org|yt3\.ggpht\.com|ytimg\.com|firebasestorage\.googleapis\.com/;
const T={js:"application/javascript",css:"text/css",html:"text/html",json:"application/json",svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",ico:"image/x-icon",woff2:"font/woff2"};
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
for (const path of ["/","/nordic","/nordic/day/1","/cards","/me","/board","/friends"]) {
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  // **本番の島の API はそのまま通す。** 差し込むと「ログインしていない人」ではなくなる
  await ctx.route("**/*",(r)=>{const u=r.request().url(); if(!PASS.test(u)) return r.abort();
    try{const body=execFileSync("curl",["-sS","--retry","2","--max-time","40",u],{maxBuffer:1<<28});
      const e=(u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1]||"html").toLowerCase();
      r.fulfill({status:200,contentType:T[e]||"text/html",body});}catch{r.abort();}});
  const p=await ctx.newPage();
  const errs=[];
  p.on("pageerror",e=>errs.push(String(e).slice(0,70)));
  await p.goto(O+path,{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(9000);
  const r=await p.evaluate(()=>{
    window.scrollTo(0,document.body.scrollHeight);
    return new Promise(res=>setTimeout(()=>{
      const de=document.documentElement;
      const imgs=[...document.querySelectorAll("img")];
      const t=document.body.innerText;
      res({h:de.scrollHeight, yoko:de.scrollWidth>de.clientWidth,
        img:imgs.length, ochi:imgs.filter(i=>i.complete&&i.naturalWidth===0).length,
        h1:document.querySelector("h1")?.textContent?.slice(0,18),
        yomi:/読み込|よみこみ|しばらく|エラー|失敗|取得できません/.test(t),
        kara:t.trim().length<200});
    },1500));
  });
  console.log(`${path.padEnd(16)} 縦${String(r.h).padStart(5)} 横あふれ${r.yoko?"あり":"なし"} 画像${r.img}(落ち${r.ochi}) JSエラー${errs.length} 読込中の字${r.yomi?"あり":"なし"} h1=${r.h1}`);
  if (errs.length) console.log("     ", errs[0]);
  await p.screenshot({path:`/tmp/guest${path.replace(/\//g,"_")||"_top"}.png`});
  await ctx.close();
}
await b.close();
