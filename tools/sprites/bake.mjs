/**
 * manifest.mjs を読んで、島で使うスプライトを全部焼く。
 *   node tools/sprites/bake.mjs [出力先] [名前の一部で絞り込み]
 * 事前に tools/sprites で静的サーバを立てておくこと(既定 http://localhost:8904)。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { SPRITES } from "./manifest.mjs";

const outDir = process.argv[2] ?? "../../site/public/sprites";
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

const list = only ? SPRITES.filter((s) => s.name.includes(only)) : SPRITES;
console.log(`焼く数: ${list.length}`);

const b = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 820, height: 820 } });
p.on("pageerror", (e) => console.error("ERR", String(e).slice(0, 300)));
await p.goto(`${process.env.BASE ?? "http://localhost:8904"}/render.html`, { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ready, { timeout: 60000 });

let n = 0;
for (const s of list) {
  const parts = s.parts.map((x) => (typeof x === "string" ? { url: x } : x));
  const data = await p.evaluate(([pp, oo]) => window.renderScene(pp, oo), [parts, s.opts ?? {}]);
  fs.writeFileSync(path.join(outDir, `${s.name}.png`), Buffer.from(data.split(",")[1], "base64"));
  process.stdout.write(`\r焼いた ${++n}/${list.length}  ${s.name}            `);
}
console.log("\n完了");
await b.close();
