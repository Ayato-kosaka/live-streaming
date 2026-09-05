/**
 * manifest.mjs を読んで、島で使うスプライトを全部焼く。
 *   node tools/sprites/bake.mjs [出力先] [名前の一部で絞り込み]
 * 事前に tools/sprites で静的サーバを立てておくこと(既定 http://localhost:8904)。
 *
 * 焼く数が増えると、途中でブラウザが落ちることがある(並列で他の作業が
 * 走っていて、メモリが足りなくなる)。落ちたら開き直して続きから焼く。
 * 全部やり直すと数十分かかるので、ここは諦めずに粘る。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { SPRITES } from "./manifest.mjs";

const outDir = process.argv[2] ?? "../../site/public/sprites";
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

// 絞り込みはカンマ区切りで複数渡せる。直したものだけ焼き直して見比べるため
const keys = only ? only.split(",").filter(Boolean) : null;
let list = keys ? SPRITES.filter((s) => keys.some((k) => s.name.includes(k))) : SPRITES;
// RESUME=1 で、まだ .png が無いものだけ焼く。
// meta.py は webp に変えたあと .png を消すので、「.png が残っている」＝
// 「この回で焼き終えた」の印になる。落ちても同じコマンドで続きから焼ける
if (process.env.RESUME) {
  const before = list.length;
  list = list.filter((s) => !fs.existsSync(path.join(outDir, `${s.name}.png`)));
  console.log(`焼き済みを飛ばす: ${before - list.length} 点`);
}
console.log(`焼く数: ${list.length}`);

const BASE = process.env.BASE ?? "http://localhost:8904";
let browser = null;
let page = null;

/**
 * ブラウザを開いて、焼く準備ができるまで待つ。
 * 混んでいるとブラウザが立ち上がるだけで数分かかるので、待ち時間は切らない。
 */
async function open() {
  for (let attempt = 1; ; attempt++) {
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        args: [
          "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
          // 同居している他の作業とメモリを取り合うので、使う量を絞る
          "--disable-dev-shm-usage", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=384",
        ],
        timeout: 0,
      });
      page = await browser.newPage({ viewport: { width: 820, height: 820 } });
      page.on("pageerror", (e) => console.error("\nERR", String(e).slice(0, 300)));
      await page.goto(`${BASE}/render.html`, { waitUntil: "networkidle", timeout: 0 });
      await page.waitForFunction(() => window.__ready, { timeout: 0 });
      return;
    } catch (e) {
      console.error(`\nブラウザを開けなかった(${attempt}回目): ${String(e).slice(0, 160)}`);
      try { await browser?.close(); } catch { /* もう死んでいる */ }
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
}

/** 開き直す。落ちたあとの後始末も含む。 */
async function reopen() {
  try {
    await browser?.close();
  } catch { /* もう死んでいる */ }
  await open();
}

await open();

let n = 0;
let failed = [];
for (const s of list) {
  const parts = s.parts.map((x) => (typeof x === "string" ? { url: x } : x));
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      const data = await page.evaluate(
        ([pp, oo]) => window.renderScene(pp, oo),
        [parts, s.opts ?? {}],
      );
      // 名前に `/` が入っているもの(hero/ の大きい絵)は、その下に掘ってから書く
      const file = path.join(outDir, `${s.name}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
      ok = true;
    } catch (e) {
      console.error(`\n${s.name} で落ちた(${attempt + 1}回目): ${String(e).slice(0, 160)}`);
      await reopen();
    }
  }
  if (!ok) failed.push(s.name);
  process.stdout.write(`\r焼いた ${++n}/${list.length}  ${s.name}            `);
}
console.log(failed.length ? `\n焼けなかった: ${failed.join(", ")}` : "\n完了");
await browser.close();
