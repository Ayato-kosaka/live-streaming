/**
 * `/roulette` を**素で**開けるか確かめる。差し込みを1つも使わない。
 *
 * 表示側は Firestore の session を Functions ごしに読むだけで、ログインは
 * 要らない作り（`components/roulette/Display.tsx`）。**なら、器も口も
 * 差し替えずに開けるはず。** 開けるなら、それがいちばん本番に近い絵になる。
 *
 *   python3 -m http.server 4500 --directory site/.next-3500 &
 *   SPORT=4500 node tools/sprites/liveraw.mjs
 *
 * 出るもの: /tmp/live/raw/*.png と、画面に出た字・JSエラー・横あふれ。
 *
 * **差し込みを使わないことが、この道具の値打ち。** ここで開ければ
 * 「見本を組んだから見えた絵」ではなく「本番がそう出る絵」になる。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const PORT = process.env.SPORT || "4500";
const OUT = "/tmp/live/raw";
mkdirSync(OUT, { recursive: true });

/* 素で開く3通り。**古い URL を落としていないか**も、ここで一緒に見る
   （`Display.tsx` は `candidates` `duration` `turns` `theme` `sound`
   `auto` `resultDuration` の7つを、写した元と同じに読む約束）。 */
const CASES = [
  ["bare", "/roulette.html"],
  ["cand", "/roulette.html?candidates=" + encodeURIComponent("トビリシの温泉,ヒッチハイクで隣の国,24時間クッキング,視聴者の家に泊まる,深夜の市場めぐり,サウナ")],
  ["sess", "/roulette.html?s=0123456789abcdef0123456789abcdef"],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const [tag, path] of CASES) {
  const ctx = await b.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    return {
      text: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200),
      over: de.scrollWidth - de.clientWidth,
      wheel: !!document.querySelector(".rl-wheel"),
      flat: !!document.querySelector(".rl-card-flat"),
      slices: document.querySelectorAll(".rl-wheel path, .rl-wheel text").length,
    };
  });
  await p.screenshot({ path: `${OUT}/${tag}.png` });
  console.log(
    `${tag.padEnd(5)} ${path}\n` +
      `      輪 ${r.wheel ? "出た" : "なし"} / 平札 ${r.flat ? "出た" : "なし"} / 切片 ${r.slices}\n` +
      `      横あふれ ${r.over}px  JSエラー ${errs.length}\n` +
      `      字「${r.text}」`,
  );
  for (const e of errs.slice(0, 4)) console.log(`      ! ${e}`);
  await ctx.close();
}
await b.close();
console.log(`\n絵は ${OUT}/`);
