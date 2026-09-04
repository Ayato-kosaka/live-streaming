import { chromium } from "playwright-core";
import fs from "node:fs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const shots = JSON.parse(process.argv[2]);
for (const s of shots) {
  const p = await b.newPage({ viewport: s.vp, deviceScaleFactor: 1 });
  // この環境では外向きの通信が詰まることがある。フォントは空で返し、
  // 画像は落として、撮影が待たされないようにする。
  await p.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.route(/lh3\.googleusercontent\.com|accounts\.google\.com|i\.ytimg\.com|fonts\.gstatic\.com|www\.google\.com/, (r) => r.abort());
  await p.goto(s.url, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(s.wait ?? 2500);
  try {
    await p.screenshot({ path: s.out, fullPage: !!s.full, timeout: 8000 });
  } catch {
    // フォントの読み込み待ちで詰まることがあるので、CDP で直接撮る
    const cdp = await p.context().newCDPSession(p);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!s.full });
    fs.writeFileSync(s.out, Buffer.from(data, "base64"));
  }
  await p.close();
  console.log(s.out);
}
await b.close();
