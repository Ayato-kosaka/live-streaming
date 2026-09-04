import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const shots = JSON.parse(process.argv[2]);
for (const s of shots) {
  const p = await b.newPage({ viewport: s.vp, deviceScaleFactor: 1 });
  await p.goto(s.url, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(s.wait ?? 2500);
  await p.screenshot({ path: s.out, fullPage: !!s.full });
  await p.close();
  console.log(s.out);
}
await b.close();
