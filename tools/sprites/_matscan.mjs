import { chromium } from "playwright-core";
import { SPRITES } from "./manifest.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.goto("http://localhost:8904/render.html", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ready);
await p.evaluate(() => { window.__mats = async (url) => {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const l = new GLTFLoader(); const g = await l.loadAsync(url);
  const s = new Set(); g.scene.traverse(n => { if (n.isMesh) (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>s.add((m.name||"").toLowerCase())); });
  return [...s];
}; });
const hit = [];
for (const s of SPRITES) {
  if (s.opts?.plain) continue;
  for (const part of s.parts) {
    const url = typeof part === "string" ? part : part.url;
    if (!url) continue;
    const ms = await p.evaluate((u) => window.__mats(u), url).catch(()=>[]);
    if (ms.some(m => m.startsWith("leafs"))) { hit.push(s.name); break; }
  }
}
console.log(hit.join(","));
console.log("計", hit.length);
await b.close();
