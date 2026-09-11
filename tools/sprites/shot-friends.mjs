/**
 * 図鑑（`/friends`）を撮る。**95人ぶんが本番と同じ絵で並ぶ。**
 *
 *   node tools/sprites/shot-friends.mjs [ポート]
 *
 * 先に、本番の返事と絵を落としておく:
 *   curl -s https://live-streaming-d3cac.web.app/island-api/characters > /tmp/ch.json
 *   curl -s https://live-streaming-d3cac.web.app/island-api/state      > /tmp/state.json
 *   curl -s https://live-streaming-d3cac.web.app/island-api/cards      > /tmp/cards.json
 *   python3 tools/sprites/chars.py
 *
 * 出るもの（/tmp/shots/）:
 *   friends-390.png       スマホ幅の全体
 *   friends-390-top.png   1画面目
 *   friends-390-grid.png  一覧のマス（大きさが揃っているか）
 *   friends-1280.png      PC
 * 数字は標準出力に出す（面の高さ・マスの押しどころ・図鑑の人数）。
 */
import { chromium } from "playwright-core";

import { offline } from "./route.mjs";
import { mkdirSync, existsSync, readFileSync } from "fs";

const PORT = process.argv[2] || "4130";
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync("/tmp/shots", { recursive: true });

/** 口の返事。**本番の中身をそのまま返す。** 作り物を返すと、人数も
    絵の揃いかたも本番と違うものを見て合格にしてしまう。 */
const api = async (ctx) => {
  const json = (r, path) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: existsSync(path) ? readFileSync(path, "utf8") : "{}",
    });
  await ctx.route(/\/island-api\/characters/, (r) => json(r, "/tmp/ch.json"));
  await ctx.route(/\/island-api\/state/, (r) => json(r, "/tmp/state.json"));
  await ctx.route(/\/island-api\/cards/, (r) => json(r, "/tmp/cards.json"));
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const [w, h, tag] of [[390, 844, "390"], [1280, 900, "1280"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await offline(ctx);
  await api(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/friends.html`, { waitUntil: "networkidle" });
  // 一覧のマスが出そろうまで待つ（口から引いているので、描くのは画面が出たあと）
  await p.waitForSelector(".rzk-cell:not(.is-wait)", { timeout: 15000 });
  await p.waitForTimeout(1200);
  // **いちばん下まで送ってから測る。** 畳んだまま測ると 68px で返る（CLAUDE.md）
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(600);

  const m = await p.evaluate(() => {
    const cells = [...document.querySelectorAll(".rzk-cell")];
    const r0 = cells[0]?.getBoundingClientRect();
    const imgs = [...document.querySelectorAll(".rzk-cell img")];
    // 中に描かれた figure の見た目の大きさ。**揃っているかはこれで見る**
    const sizes = imgs.map((i) => {
      const s = getComputedStyle(i).transform;
      const k = s === "none" ? 1 : Number(/matrix\(([-\d.]+)/.exec(s)?.[1] ?? 1);
      return Math.round(i.getBoundingClientRect().width * k);
    });
    sizes.sort((a, z) => a - z);
    return {
      高さ: document.body.scrollHeight,
      マス: cells.length,
      マスの幅: r0 ? Math.round(r0.width) : 0,
      マスの高さ: r0 ? Math.round(r0.height) : 0,
      落とす札: document.querySelectorAll(".rzk-get").length,
      絵の大きさ最小: sizes[0],
      絵の大きさ中央: sizes[Math.floor(sizes.length / 2)],
      絵の大きさ最大: sizes[sizes.length - 1],
      題名: document.querySelector(".rzk-tag")?.textContent?.trim(),
      よこあふれ: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  console.log(tag, JSON.stringify(m, null, 1));
  if (errs.length) console.log(tag, "JSエラー:", errs);

  /* 送りで何人か開いて、**落とす札が役どころのぶんだけ出るか**を見る。
     背景ありを持っているのは95人中65人なので、1人目だけ見て
     「1つしか出ない」と決めない。 */
  const gets = [];
  for (let i = 0; i < 8; i++) {
    await p.click(".rzk-pager > button:last-child");
    await p.waitForTimeout(120);
    gets.push(await p.$$eval(".rzk-get", (b) => b.map((x) => x.textContent.trim())));
  }
  console.log(tag, "落とす札（2人目から9人目）:", JSON.stringify(gets));
  /* **本当に落ちるかを見る。** 置き場は別のドメインなので `<a download>` は
     効かない。取ってから blob にして落としている（`lib/saveFile.ts`）ので、
     そこが通っているかは実際に落として名前を見るしかない。 */
  const dl = await Promise.all([
    p.waitForEvent("download", { timeout: 10000 }).catch(() => null),
    p.click(".rzk-get"),
  ]);
  console.log(tag, "落ちた名前:", dl[0] ? dl[0].suggestedFilename() : "落ちなかった");

  await p.click(".rzk-cell:first-child");
  await p.waitForTimeout(200);

  await p.screenshot({ path: `/tmp/shots/friends-${tag}.png`, fullPage: true });
  await p.screenshot({ path: `/tmp/shots/friends-${tag}-top.png` });
  const grid = await p.$(".rzk-grid");
  if (grid) await grid.screenshot({ path: `/tmp/shots/friends-${tag}-grid.png` });
  const page1 = await p.$(".rzk-page");
  if (page1) await page1.screenshot({ path: `/tmp/shots/friends-${tag}-page.png` });
  await ctx.close();
}
await b.close();
