import { chromium } from "playwright-core";
import fs from "node:fs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 820, height: 820 } });
p.on("pageerror", e=>console.log("ERR", String(e).slice(0,200)));
await p.goto("http://localhost:8904/render.html", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ready);
const specs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const s of specs) {
  const d = await p.evaluate(([pp,oo]) => window.renderScene(pp,oo), [s.parts, s.opts ?? {}]);
  fs.writeFileSync(`/tmp/try-${s.name}.png`, Buffer.from(d.split(",")[1], "base64"));
  console.log("→ /tmp/try-"+s.name+".png");
}
// 寸法も測る
for (const u of (process.env.MEASURE ?? "").split(",").filter(Boolean)) {
  console.log(u, JSON.stringify(await p.evaluate((x)=>window.__measure(x), u)));
}
await b.close();
