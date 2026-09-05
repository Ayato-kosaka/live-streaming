import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";

/**
 * 建物の絵と、押せる範囲・札の位置がズレていないか測る。
 *
 * 「見た目がズレている」を目視で通さないための検査（docs/island-design.md）。
 * 島を触ったら必ず回す。
 */
// 島に建っているものは全部押せる（docs/island-design.md 6章）。看板の有無に関わらず全部見る。
const NAMES = { "tower-studio": "配信やぐら", "hut-workshop": "アプリ工房", "signpost": "旅の桟橋",
  "tent": "これから", "signboard": "企画掲示板", "campfire": "たき火広場",
  "hut-kitchen": "キッチン小屋", "hall-museum": "伝説の丘", "mailbox": "いまのポスト",
  "tent-small": "仲間のテント" };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
let bad = 0;
for (const [label, wide] of [["寄り", false], ["引き", true]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(3000);
  if (wide) { const z = await p.$(".stage-view") ?? await p.$(".bar-zoom"); if (z) await z.click({ force: true }); await p.waitForTimeout(2500); }

  const rows = await p.evaluate((names) => {
    const imgs = [...document.querySelectorAll(".stage-svg image")];
    const spots = [...document.querySelectorAll(".spot")];
    const out = [];
    for (const [file, jp] of Object.entries(names)) {
      const img = imgs.find(i => i.getAttribute("href")?.includes(`/${file}.webp`));
      const hit = spots.map(s => s.querySelector(".spot-hit")).find(h => h && h.getAttribute("aria-label")?.startsWith(jp));
      if (!img || !hit) { out.push({ jp, err: !img ? "絵がない" : "押せる場所がない" }); continue; }
      const ir = img.getBoundingClientRect();
      const hr = hit.getBoundingClientRect();
      out.push({
        jp,
        dx: Math.round(hr.x + hr.width / 2 - (ir.x + ir.width / 2)),
        dy: Math.round(hr.y + hr.height - (ir.y + ir.height)),
        hit: `${Math.round(hr.width)}x${Math.round(hr.height)}`,
        small: hr.width < 44 || hr.height < 44,
      });
    }
    return out;
  }, NAMES);

  console.log(`--- ${label}`);
  for (const r of rows) {
    // 絵の中心には焼き込んだ影が入るぶんの寄りがあるので、20px までは許す
    const ng = r.err || Math.abs(r.dx) > 20 || Math.abs(r.dy) > 20 || r.small;
    if (ng) bad++;
    console.log(`${ng ? "NG" : "ok"} ${r.jp.padEnd(7)} ${r.err ?? `dx=${String(r.dx).padStart(4)} dy=${String(r.dy).padStart(4)} 押せる範囲=${r.hit}`}`);
  }
  await ctx.close();
}
console.log(bad ? `\nズレ ${bad} 件` : "\nズレなし");
await b.close();
process.exit(bad ? 1 : 0);
