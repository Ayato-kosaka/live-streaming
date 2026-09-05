import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.goto("http://localhost:8904/render.html", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ready);
for (const u of process.argv.slice(2)) {
  const r = await p.evaluate(async (url) => {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const g = await new GLTFLoader().loadAsync(url);
    const out = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(n => { if (n.isMesh) {
      const bb = new THREE.Box3().setFromObject(n);
      const mats = Array.isArray(n.material)?n.material:[n.material];
      out.push({ m: mats.map(x=>x.name).join("+"), min:[+bb.min.x.toFixed(3),+bb.min.y.toFixed(3),+bb.min.z.toFixed(3)], max:[+bb.max.x.toFixed(3),+bb.max.y.toFixed(3),+bb.max.z.toFixed(3)], groups: n.geometry.groups?.length ?? 0 });
    }});
    return out;
  }, u);
  console.log(u); console.log(JSON.stringify(r, null, 1));
}
await b.close();
