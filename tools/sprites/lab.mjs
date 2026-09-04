/**
 * 絵づくりを試すための道具。JSON で受け取ったスプライト定義を焼いて
 * 1枚の並べ画像にする。 node lab.mjs spec.json out.png
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = process.argv[3] ?? "/tmp/lab";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const p = await b.newPage({viewport:{width:820,height:820}});
p.on("pageerror",e=>console.error("ERR",String(e).slice(0,400)));
p.on("console",m=>{ if(m.type()==="error") console.error("C:",m.text().slice(0,300)); });
await p.goto("http://localhost:8904/render.html",{waitUntil:"networkidle"});
await p.waitForFunction(()=>window.__ready,{timeout:60000});
for (const s of spec) {
  const parts = s.parts.map(x => typeof x === "string" ? { url: x } : x);
  const data = await p.evaluate(([pp,oo])=>window.renderScene(pp,oo), [parts, s.opts ?? {}]);
  fs.writeFileSync(`${out}/${s.name}.png`, Buffer.from(data.split(",")[1],"base64"));
  process.stdout.write(`${s.name} `);
}
console.log("\ndone");
await b.close();
