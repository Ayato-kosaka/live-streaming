import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** 焼くときに測った「影を除いた物体の範囲」。ズレは絵ではなくこれで測る。 */
const META = JSON.parse(fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../site/content/sprites.json"), "utf8"));

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
let bad = 0;
for (const [label, wide] of [["寄り", false], ["引き", true]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  /* カメラが止まるまで待つ。
   * 起動直後は島ぜんぶの引きから寄りまで数秒かけて詰めていく。
   * 途中で測ると、同じ島なのに押せる範囲が 48x48 だったり 88x90 だったりして、
   * ズレの許容(20px)を倍率のぶん超え、直していないものが NG で出る。 */
  const settle = async () => {
    // 動き出す前に測ってしまわないよう、まず必ず待つ
    await p.waitForTimeout(2500);
    let last = "";
    let same = 0;
    for (let i = 0; i < 60; i++) {
      await p.waitForTimeout(250);
      const vb = await p.getAttribute(".stage-svg", "viewBox") ?? "";
      same = vb && vb === last ? same + 1 : 0;
      // 3回続けて同じなら止まったとみなす。1回では、寄せている途中の
      // ゆっくりな区間をつかまえて「止まった」と誤判定する
      if (same >= 3) return;
      last = vb;
    }
  };
  await settle();
  if (wide) { const z = await p.$(".stage-view") ?? await p.$(".bar-zoom"); if (z) await z.click({ force: true }); await settle(); }

  const rows = await p.evaluate(([names, meta]) => {
    const imgs = [...document.querySelectorAll(".stage-svg image")];
    const spots = [...document.querySelectorAll(".spot")];
    const out = [];
    for (const [file, jp] of Object.entries(names)) {
      const img = imgs.find(i => i.getAttribute("href")?.includes(`/${file}.webp`));
      const hit = spots.map(s => s.querySelector(".spot-hit")).find(h => h && h.getAttribute("aria-label")?.startsWith(jp));
      if (!img || !hit) { out.push({ jp, err: !img ? "絵がない" : "押せる場所がない" }); continue; }
      const ir = img.getBoundingClientRect();
      const hr = hit.getBoundingClientRect();
      /* 比べるのは「絵」ではなく「物体」。
       * スプライトには接地影が焼き込んであって、右下へはみ出している。
       * 絵の中心と下端で測ると、影のぶんだけ必ずズレて出る。
       * 影の量は物によって 8〜15% と違うので、許容を広げてごまかすと
       * 本当のズレまで通ってしまう。sprites.json に入れてある
       * 「物体そのものの範囲」に直してから比べる。 */
      const m = meta[file];
      const ox = m ? ir.x + (m.ox / m.w) * ir.width : ir.x;
      const oy = m ? ir.y + (m.oy / m.h) * ir.height : ir.y;
      const ow = m ? (m.ow / m.w) * ir.width : ir.width;
      const oh = m ? (m.oh / m.h) * ir.height : ir.height;
      out.push({
        jp,
        dx: Math.round(hr.x + hr.width / 2 - (ox + ow / 2)),
        dy: Math.round(hr.y + hr.height - (oy + oh)),
        hit: `${Math.round(hr.width)}x${Math.round(hr.height)}`,
        small: hr.width < 44 || hr.height < 44,
      });
    }
    return out;
  }, [NAMES, META]);

  console.log(`--- ${label}`);
  for (const r of rows) {
    // 影を除いた物体どうしで比べているので、許容は狭くてよい
    const ng = r.err || Math.abs(r.dx) > 12 || Math.abs(r.dy) > 12 || r.small;
    if (ng) bad++;
    console.log(`${ng ? "NG" : "ok"} ${r.jp.padEnd(7)} ${r.err ?? `dx=${String(r.dx).padStart(4)} dy=${String(r.dy).padStart(4)} 押せる範囲=${r.hit}`}`);
  }
  await ctx.close();
}
console.log(bad ? `\nズレ ${bad} 件` : "\nズレなし");
await b.close();
process.exit(bad ? 1 : 0);
