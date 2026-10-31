// 下見のページを、スマホの幅のヘッドレスの Chrome で開いて、動画が全部再生できるかを見る。
//
//   node playcheck.mjs <ページの URL> <絵を置く場所>
//
// Actions のランナーで `host.py` が回す（作業箱からは *.web.app に届かない）。
// **標準出力に出すのは最後の1行の JSON だけ**で、URL は入れない（ファイル名だけ）。
// 撮った絵（phone.jpg）は顔が写るので、暗号化した結果にだけ入れる。
//
// ブラウザはランナーにある Google Chrome（/usr/bin/google-chrome）。Playwright の
// Chromium は H.264 を再生できないので、それで測ると「全部再生できない」と出てしまう。
import { chromium } from "playwright-core";

const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const resp = await page.goto(url, { waitUntil: "load", timeout: 60000 });
const n = await page.locator("video").count();
const videos = [];
for (let i = 0; i < n; i++) {
  const r = await page.evaluate(async (i) => {
    const v = document.querySelectorAll("video")[i];
    v.scrollIntoView({ block: "center" });
    v.muted = true;
    const base = { i, file: (v.currentSrc || v.src).split("/").pop().split("#")[0] };
    try {
      await Promise.race([
        v.play(),
        new Promise((_, ng) => setTimeout(() => ng(new Error("play が20秒で始まらない")), 20000)),
      ]);
    } catch (e) {
      return { ...base, played: false, error: String(e).slice(0, 200) };
    }
    const t0 = v.currentTime;
    await new Promise((ok) => setTimeout(ok, 2500));
    const b = v.getBoundingClientRect();
    const res = {
      ...base,
      played: v.currentTime - t0 > 1.0 && !v.error,
      advanced: +(v.currentTime - t0).toFixed(2),
      duration: +(v.duration || 0).toFixed(2),
      w: v.videoWidth,
      h: v.videoHeight,
      readyState: v.readyState,
      mediaError: v.error ? v.error.code : null,
      playsinline: v.playsInline,
      controls: v.controls,
      box: { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) },
    };
    v.pause();
    v.currentTime = 0.5;
    return res;
  }, i);
  videos.push(r);
}
const layout = await page.evaluate(() => ({
  scrollW: document.scrollingElement.scrollWidth,
  innerW: window.innerWidth,
  h1: (document.querySelector("h1") || {}).textContent ? true : false,
}));
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/phone.jpg`, type: "jpeg", quality: 60, fullPage: true });
console.log(JSON.stringify({ status: resp ? resp.status() : 0, videos, layout, errors }));
await browser.close();
