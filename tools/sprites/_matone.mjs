import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.goto("http://localhost:8904/render.html", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ready);
for (const u of process.argv.slice(2)) {
  const ms = await p.evaluate(async (url) => {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const g = await new GLTFLoader().loadAsync(url);
    const out = []; g.scene.traverse(n => { if (n.isMesh) (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>out.push((m.name||"")+(m.map?"[tex]":"")+" #"+m.color.getHexString())); });
    return out;
  }, u);
  console.log(u, "→", [...new Set(ms)].join(" | "));
}
await b.close();
