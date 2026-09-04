/**
 * モデルをまとめてスプライトに焼く。
 *   node tools/sprites/shoot.mjs <出力先> <モデルのルート> <colormap> <model...>
 * 余白を切り詰めて、透過PNGで書き出す。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const [outDir, colormap, ...models] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 800, height: 800 } });
p.on("pageerror", (e) => console.error("ERR", String(e).slice(0, 200)));
await p.goto(`${process.env.BASE ?? "http://localhost:8904"}/render.html`, { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ready, { timeout: 60000 });

for (const m of models) {
  const spec = m.includes("::") ? m.split("::") : [m, "{}"];
  const [url, optJson] = spec;
  const opts = JSON.parse(optJson);
  if (colormap && colormap !== "-") opts.colormap = colormap;
  const data = await p.evaluate(([u, o]) => window.renderModel(u, o), [url, opts]);
  const name = (opts.name ?? path.basename(url).replace(/\.(glb|gltf)$/, "")) + ".png";
  fs.writeFileSync(path.join(outDir, name), Buffer.from(data.split(",")[1], "base64"));
  console.log("焼いた:", name);
}
await b.close();
