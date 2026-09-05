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
    g.scene.updateMatrixWorld(true);
    const lines = [];
    const walk = (n, d) => {
      const bb = new THREE.Box3().setFromObject(n);
      const f = (v)=>+v.toFixed(3);
      lines.push(`${"  ".repeat(d)}${n.name||"(無名)"} [${n.type}] pos=${[n.position.x,n.position.y,n.position.z].map(f)} rot=${[n.rotation.x,n.rotation.y,n.rotation.z].map(f)} bb=${[bb.min.y,bb.max.y].map(f)}`);
      n.children.forEach(c=>walk(c,d+1));
    };
    walk(g.scene,0);
    return { lines, anims: g.animations.map(a=>a.name) };
  }, u);
  console.log("=== "+u, "アニメ:", r.anims.join(",")||"なし");
  console.log(r.lines.join("\n"));
}
await b.close();
