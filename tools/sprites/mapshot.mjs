import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const p = await b.newPage({ viewport: { width: 820, height: 1000 } });
await p.goto("file:///tmp/mapcheck.html");
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/shots/map.png" });
await b.close();
