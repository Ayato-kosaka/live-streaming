/** 読み込んだファイルを大きい順に並べる。 */
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3014";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const rows = [];
p.on("response", async (r) => {
  try {
    const h = r.headers();
    const len = +(h["content-length"] || 0);
    rows.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ""), len, type: h["content-type"] || "" });
  } catch {}
});
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(3000);
rows.sort((a, c) => c.len - a.len);
let total = 0;
for (const r of rows) total += r.len;
console.log("TOTAL", (total / 1024).toFixed(0), "KB in", rows.length, "requests");
const byType = {};
for (const r of rows) { const t = (r.type.split(";")[0]||"?"); byType[t] = (byType[t]||0) + r.len; }
console.log(Object.entries(byType).sort((a,c)=>c[1]-a[1]).map(([k,v])=>`${k} ${(v/1024).toFixed(0)}KB`).join("\n"));
console.log("--- top 40 ---");
for (const r of rows.slice(0, 40)) console.log((r.len/1024).toFixed(1).padStart(8), r.url.slice(0, 90));
const counts = await p.evaluate(() => ({
  dom: document.querySelectorAll("*").length,
  svg: document.querySelectorAll("svg *").length,
  img: document.querySelectorAll("image,img").length,
}));
console.log("counts", JSON.stringify(counts));
await b.close();
