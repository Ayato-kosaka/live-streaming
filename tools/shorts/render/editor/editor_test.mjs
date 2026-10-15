// 人が直す画面を、スマホの幅（390x844, dpr3, タッチ）で開いて、実際に直してみる。
//   node editor_test.mjs http://127.0.0.1:4177/?data=bundle.json outdir
import {chromium} from 'playwright-core';
import fs from 'node:fs';

const [url, outdir] = process.argv.slice(2);
fs.mkdirSync(outdir, {recursive: true});
const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
	userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const failed = [];
page.on('requestfailed', (r) => failed.push(r.url() + ' ' + r.failure()?.errorText));
const t0 = Date.now();
await page.goto(url);
await page.waitForSelector('[data-testid=caption-1]');
await page.waitForTimeout(2500);
const loadMs = Date.now() - t0;
await page.screenshot({path: `${outdir}/editor_1_open.png`});

// 字幕を直す（2行目のナレーションの字幕に「！」を足し、改行も変える）
const cap = page.locator('[data-testid=caption-1]');
await cap.tap();
await cap.fill('1台目は\n親切なおっちゃん！');
// カット3本目の入りを +1 コマを 3 回（=3コマ後ろから始める）
for (let i = 0; i < 3; i++) await page.locator('[data-testid=cut-2-in-1]').tap();
// 字幕1の時刻へ（下見で直した字幕が出ているか）
await page.locator('text=0:06.67 から ▶').first().tap().catch(() => {});
await cap.focus();
await page.waitForTimeout(1500);
await page.screenshot({path: `${outdir}/editor_2_edited.png`});
const videoState = await page.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({
	src: v.currentSrc.split("/").pop(), t: v.currentTime, seeking: v.seeking, readyState: v.readyState, w: v.videoWidth, h: v.videoHeight, err: v.error?.code ?? null})));

await page.locator('[data-testid=export]').tap();
await page.waitForSelector('[data-testid=patch]');
const patch = await page.locator('[data-testid=patch]').inputValue();
fs.writeFileSync(`${outdir}/patch.md`, patch);
await page.screenshot({path: `${outdir}/editor_3_export.png`});
console.log(JSON.stringify({loadMs, errors, failed, videoState, patch}, null, 1));
await b.close();
