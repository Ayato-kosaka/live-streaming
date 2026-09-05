/**
 * 「地に沈んでいる印」を数で拾う道具。一時のもの。
 *
 * 目で 223 種を見比べると見落とす。だから **絵が下地とどれだけ違うか**を測る。
 *   1. 印を透明な板に描いて、塗られている画素（＝絵の面積）を出す
 *   2. 同じ印を明るい紙・暗い板の上に描いて、画素ごとに下地との差を測る
 *   3. 差が小さい画素（見えていない画素）が絵の何割かを出す = vanish
 *
 * vanish が大きい印は、その下地の上で形が消えている。
 *   node _icweak.mjs [しきい値]   … 既定 0.35（絵の 35% 以上が沈んでいるもの）
 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3016";
const LIMIT = Number(process.argv[2] || 0.35);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
await p.goto(`http://localhost:${PORT}/design`, { waitUntil: "domcontentloaded", timeout: 600000 });
await p.waitForTimeout(1500);

const rows = await p.evaluate(async () => {
  const DAY = [251, 246, 223]; // /design の明るい帯
  const NIGHT = [47, 58, 44]; // 暗い帯
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d", { willReadFrequently: true });

  const load = (svg) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });

  const out = [];
  const cells = [...document.querySelectorAll("main.page section > div > div")];
  for (const cell of cells) {
    const name = cell.querySelector("i")?.textContent;
    const svg = [...cell.querySelectorAll("svg")].find((s) => s.width.baseVal.value > 20);
    if (!name || !svg) continue;
    const s = new XMLSerializer().serializeToString(svg);
    const im = await load(s.replace(/width="\d+"/, `width="${S}"`).replace(/height="\d+"/, `height="${S}"`));
    if (!im) continue;

    // 塗られている画素を拾う
    g.clearRect(0, 0, S, S);
    g.drawImage(im, 0, 0, S, S);
    const al = g.getImageData(0, 0, S, S).data;

    const measure = (bg) => {
      g.globalCompositeOperation = "source-over";
      g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      g.fillRect(0, 0, S, S);
      g.drawImage(im, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S).data;
      let ink = 0;
      let gone = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (al[i + 3] < 160) continue; // 半透明の縁は数えない
        ink++;
        const dist = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
        if (dist < 42) gone++;
      }
      return ink ? gone / ink : 0;
    };

    out.push({ name, day: +measure(DAY).toFixed(3), night: +measure(NIGHT).toFixed(3) });
  }
  return out;
});

const bad = rows
  .map((r) => ({ ...r, worst: Math.max(r.day, r.night) }))
  .filter((r) => r.worst >= LIMIT)
  .sort((a, b) => b.worst - a.worst);

console.log(`測った印: ${rows.length} 種 / 沈んでいるもの: ${bad.length} 種（しきい値 ${LIMIT}）`);
console.log("name".padEnd(16), "紙の上", "板の上");
for (const r of bad) console.log(r.name.padEnd(16), String(r.day).padEnd(6), r.night);
await b.close();
