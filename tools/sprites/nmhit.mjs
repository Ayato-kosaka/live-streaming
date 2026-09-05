/**
 * 北欧の地図のピンが、実際にどれだけ押せるかを測る。
 *
 *   PORT=4180 W=390 PAGES=/nordic node tools/sprites/nmhit.mjs
 *
 * `hitbox.mjs` は要素の見た目の箱の中心から伸ばすが、地図のピンは
 * 「丸」と「名札」の2つに分かれていて、その真ん中は**どちらでもない空白**。
 * 中心から測ると全部 1x1 と出る。ここでは丸の中心から測る。
 *
 * あわせて押し間違いも数える。ピンの中心のまわり 48x48 を 3px 刻みで押して、
 * **行き先の違うピン**が返ってきたら押し間違い。行き先が同じピン
 * （ポーランドの5つの街はどれも `/nordic/poland`）は、取り違えても
 * 同じ紙に着くので数えない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4180";
const PAGES = (process.env.PAGES || "/nordic").split(",");
const W = Number(process.env.W || 390);
const NEED = Number(process.env.NEED || 48);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 900 },
  deviceScaleFactor: 1,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

for (const path of PAGES) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(400);
  // 地図を画面の中へ入れないと elementFromPoint が届かない
  await p.evaluate(() => document.querySelector(".nmap")?.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(300);
  const rows = await p.evaluate(
    ({ NEED }) => {
      const out = [];
      const pins = [...document.querySelectorAll(".nmap-pin")];
      const centerOf = (pin) => {
        const dot = pin.querySelector(".nm-pin-ring");
        const r = (dot ?? pin).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      };
      const linkAt = (x, y) => {
        const e = document.elementFromPoint(x, y);
        return e?.closest?.(".nmap-pin, .nm-go") ?? null;
      };
      for (const pin of pins) {
        const c = centerOf(pin);
        // 「その街の紙へ行けるか」で伸ばす。国の陸地も同じ紙へ行くので、
        // どちらが返ってきても当たりのうち。要素の同一性ではなく行き先で見る。
        const href = pin.getAttribute("href");
        const grow = (dx, dy) => {
          let n = 0;
          while (n < 200 && linkAt(c.x + dx * (n + 1), c.y + dy * (n + 1))?.getAttribute("href") === href) n++;
          return n;
        };
        const l = grow(-1, 0), r = grow(1, 0), u = grow(0, -1), d = grow(0, 1);
        // 押し間違い。**描いてある丸と名前の上を、1pxずつ全部押す。**
        // 「まわり 48px を押したら隣の国が出た」は数えない。地図の上では、
        // 隣の国の陸を押して隣の国へ行くのは正しいふるまいで、間違いではない。
        // 数えるのは「その街の絵を押したのに、別の紙へ行った」だけ。
        let wrong = 0, blank = 0, total = 0;
        for (const sel of [".nm-pin-ring", ".nm-city"]) {
          const g = pin.querySelector(sel);
          if (!g) continue;
          const b = g.getBoundingClientRect();
          for (let x = Math.ceil(b.left); x < b.right; x++)
            for (let yy = Math.ceil(b.top); yy < b.bottom; yy++) {
              total++;
              const got = linkAt(x, yy);
              if (!got) blank++;
              else if (got.getAttribute("href") !== href) wrong++;
            }
        }
        out.push({
          id: pin.dataset.id,
          href,
          dot: [Math.round(c.w), Math.round(c.h)],
          hit: [l + r + 1, u + d + 1],
          side: [l, r, u, d],
          wrong,
          blank,
          total,
        });
      }
      const svg = document.querySelector(".nmap").getBoundingClientRect();
      return { rows: out, svg: [Math.round(svg.width), Math.round(svg.height)] };
    },
    { NEED }
  );
  console.log(`\n== ${path}  幅${W}  地図 ${rows.svg[0]}x${rows.svg[1]} ==`);
  let ng = 0, wrongAll = 0;
  for (const r of rows.rows) {
    const bad = r.hit[0] < NEED || r.hit[1] < NEED;
    if (bad) ng++;
    wrongAll += r.wrong;
    console.log(
      `${bad ? "NG" : "ok"} ${String(r.id).padEnd(11)} 丸 ${r.dot[0]}x${r.dot[1]}  当たり ${r.hit[0]}x${r.hit[1]} (左${r.side[0]} 右${r.side[1]} 上${r.side[2]} 下${r.side[3]})  ` +
        `絵の上: よそ ${r.wrong}/${r.total} 空 ${r.blank}`
    );
  }
  console.log(`${NEED}px に足りないピン: ${ng}/${rows.rows.length}  押し間違いの点: ${wrongAll}`);
}
await b.close();
