import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const p = await b.newPage({viewport:{width:390,height:844}});
p.on("console",m=>{ const t=m.text(); if(t.includes("[auth]") || ((m.type()==="error") && !/Failed to load resource/.test(t))) console.log(m.type().toUpperCase(), t.slice(0,500)); });
p.on("pageerror",e=>console.log("PAGEERR",String(e).slice(0,500)));
await p.route(/fonts\.googleapis\.com/, r=>r.fulfill({status:200,contentType:"text/css",body:""}));
await p.route(/lh3\.googleusercontent\.com|i\.ytimg\.com|fonts\.gstatic\.com/, r=>r.abort());
await p.goto("http://localhost:3111/board",{waitUntil:"load"});
await p.waitForTimeout(6000);
console.log(await p.evaluate(()=>({
  signin: document.querySelectorAll(".signin").length,
  signed: document.querySelectorAll(".signed").length,
  hasBoard: document.querySelectorAll(".bin").length,
  authState: String(window.__authState),
})));
await b.close();
