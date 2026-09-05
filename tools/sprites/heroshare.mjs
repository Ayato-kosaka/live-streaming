/**
 * 図鑑の面で「1画面目のいちばん大きい絵」がどれだけを占めているかを測る。
 *
 * `docs/ac-reference.md` 7章4 が「図鑑の面は絵が縦の半分以上」と決めている。
 * その物差しを1本にするために置いた。目で見て「大きい気がする」では
 * 前と後を比べられない。
 *
 * 数え方:
 *   絵 = <img> / インライン <svg> / <canvas> / background-image を持つ箱
 *   1画面目に**見えている**ぶんだけを面積に数える（下に切れたぶんは数えない）
 *   面積の割合 = 見えている面積 ÷ (幅 × 高さ)
 *   縦の割合   = 見えている高さ ÷ 高さ   ← 7章4 の「縦の半分以上」はこちら
 *
 * 面の高さも一緒に出す。**いちばん下まで送ってから測る。**
 * `content-visibility: auto` の畳みは、画面の外にいるあいだ 68px と答える。
 *
 *   node tools/sprites/heroshare.mjs 390 844
 *   SPORT=4140 node tools/sprites/heroshare.mjs 1440 900
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4140";
const W = Number(process.argv[2] || 390);
const H = Number(process.argv[3] || 844);
const PAGES = (process.env.PAGES ||
  "/apps/nanitabeyo,/map/georgia,/kitchen/tamagoyaki,/nordic/sweden,/legends/iran-walk,/streams/cooking,/nordic/day/1,/friends,/now"
).split(",");

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  isMobile: W < 700,
  hasTouch: W < 700,
  deviceScaleFactor: 2,
});
await offline(ctx);
const p = await ctx.newPage();

console.log(`# ${W}x${H}`);
console.log("| 面 | 面積% | 縦% | いちばん大きい絵 | 高さ | 画面 |");
console.log("| --- | --- | --- | --- | --- | --- |");

for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path}.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(900);

  const top = await p.evaluate((vh) => {
    const seen = [];
    const push = (el, kind) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return;
      // **箱ではなく、描かれている絵そのものを測る。**
      // object-fit: contain の <img> は、箱いっぱいに絵があるとは限らない。
      // 卵焼き（495x230）を 292x250 の箱に入れると、絵は 292x136 しかない。
      // 箱で数えると 22% だが、目に入る絵は 12% しかなかった。
      let w = r.width;
      let h = r.height;
      let top = r.top;
      if (kind === "img" && el.naturalWidth && cs.objectFit === "contain") {
        const s = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
        const dw = el.naturalWidth * s;
        const dh = el.naturalHeight * s;
        // object-position は上下だけ見る（この面で使うのは center と bottom）
        top = r.top + (/bottom/.test(cs.objectPosition) ? r.height - dh : (r.height - dh) / 2);
        w = dw;
        h = dh;
      }
      const vis = Math.max(0, Math.min(top + h, vh) - Math.max(top, 0));
      if (vis <= 2 || w <= 2) return;
      seen.push({
        kind,
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").slice(0, 40),
        src: (el.getAttribute("src") || "").split("/").pop() || "",
        w: Math.round(w),
        h: Math.round(h),
        vh: Math.round(vis),
        area: Math.round(w * vis),
      });
    };
    document.querySelectorAll("img,canvas").forEach((el) => push(el, el.tagName.toLowerCase()));
    // 入れ子の svg は外側だけ数える
    document.querySelectorAll("svg").forEach((el) => {
      if (el.parentElement?.closest("svg")) return;
      push(el, "svg");
    });
    document.querySelectorAll("*").forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && /url\(/.test(bg)) push(el, "bg");
    });
    seen.sort((a, b) => b.area - a.area);
    return seen[0] || null;
  }, H);

  // 高さは、いちばん下まで送ってから測る（畳みが 68px と答えるのを避ける）
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
  });
  const doc = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.evaluate(() => window.scrollTo(0, 0));

  const area = top ? ((top.area / (W * H)) * 100).toFixed(1) : "0.0";
  const tall = top ? ((top.vh / H) * 100).toFixed(1) : "0.0";
  const what = top ? `${top.kind} ${top.cls || top.src} ${top.w}x${top.h}` : "（絵なし）";
  console.log(`| ${path} | ${area}% | ${tall}% | ${what} | ${doc} | ${(doc / H).toFixed(2)} |`);
}

await b.close();
