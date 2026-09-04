import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const p = await b.newPage({viewport:{width:390,height:844}});
p.on("console",m=>{ const t=m.text(); if((m.type()==="error"||m.type()==="warning") && !/Failed to load resource/.test(t)) console.log(m.type().toUpperCase(), t.slice(0,500)); });
p.on("pageerror",e=>console.log("PAGEERR",String(e).slice(0,500)));
await p.route(/fonts\.googleapis\.com/, r=>r.fulfill({status:200,contentType:"text/css",body:""}));
await p.route(/lh3\.googleusercontent\.com|i\.ytimg\.com|fonts\.gstatic\.com/, r=>r.abort());
await p.goto("http://localhost:3111/",{waitUntil:"load"});
await p.waitForTimeout(4000);
console.log(await p.evaluate(()=>({
  pins: document.querySelectorAll(".spot-pin").length,
  bar: document.querySelectorAll(".island-bar").length,
  labels: document.querySelectorAll(".spot-label").length,
  stageW: document.querySelector(".stage")?.getBoundingClientRect().width,
  imgs: document.querySelectorAll(".stage-svg image").length,
  vb: document.querySelector(".stage-svg")?.getAttribute("viewBox"),
})));
await b.close();
