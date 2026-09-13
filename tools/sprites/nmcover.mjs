/**
 * 地図の札が、ほかの要素にどれだけ覆われているかを測る。
 *
 *   PORT=4140 PAGES=/nordic node tools/sprites/nmcover.mjs
 *
 * **見た目の箱の重なり（getBoundingClientRect）で測らない。**
 * 箱どうしが重なっていても、字のあいだの隙間なら何も隠れていない。逆に、
 * 箱が離れていても上に乗った札の影で読めなくなることがある。
 * `hitbox.mjs` と同じ考え方で、**その字がまだ自分を返すか**を画素の位置で見る
 * （`document.elementsFromPoint`）。
 *
 *   1. 札の箱を 0.5px 刻みで突く
 *   2. その点に**字が塗られている**（並びの中に自分がいる）点だけを数に入れる
 *   3. そのうち、自分より上に**絵を持つ**要素がいる点を「覆われている」と数える
 *
 * 透明な当たり判定（`.nm-cc` `.nm-hit`）は、上にいても絵を1画素も変えない。
 * 塗りも線も透明な要素は覆いから外す。外さないと、国のかたちの当たりが
 * 地図ぜんぶに乗っているので「全部 100% 覆われている」と出る。
 *
 * 左だけ食われて「290km」が「0km」に見える、を捕まえるために、
 * 札を横 6 つに割った**いちばん悪い列**も出す。
 *
 * 「いま ここ」の札は、その日いる街にだけ出る。**旅は17日ある**ので、
 * どの街にいる日でも読めないといけない。`HERE=all` で街を1つずつ
 * 立ててぜんぶ測る（`TripNow` が画面で付けるのと同じ class を付ける）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4140";
const PAGES = (process.env.PAGES || "/nordic").split(",");
const W = Number(process.env.W || 390);
const HERE = process.env.HERE || "all";
const SEL =
  process.env.SEL ||
  ".nm-km,.nm-country,.nm-sea-name,.nm-city,.nm-chip text,.nm-scale-t,.nm-compass-t";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 844 },
  deviceScaleFactor: 2,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
// 地図も動く。2回突くあいだに札が動くと、覆いの数が毎回変わる。
await ctx.addInitScript("window.requestAnimationFrame = () => 0;");
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

const measure = async (here, plan) =>
  await p.evaluate(
    ({ sel, here, plan }) => {
      const svg = document.querySelector(".nmap");
      if (!svg) return [];
      const inflate = (r, n) => ({ left: r.left - n, right: r.right + n, top: r.top - n, bottom: r.bottom + n });
      const hits = (a, b2) => a.left < b2.right && a.right > b2.left && a.top < b2.bottom && a.bottom > b2.top;
      // `TripNow` が画面でやっているのと同じことを、手で作る。
      if (here) {
        svg.dataset.here = here;
        if (plan) svg.dataset.plan = "1";
        else delete svg.dataset.plan;
        const seq = Number(svg.querySelector(`[data-id="${here}"]`)?.getAttribute("data-seq") ?? -1);
        svg.querySelectorAll("[data-seq]").forEach((el) => {
          el.classList.toggle("is-done", Number(el.getAttribute("data-seq")) <= seq);
        });
        svg.querySelectorAll(".nmap-pin, .nm-here").forEach((el) => {
          el.classList.toggle("is-now", el.getAttribute("data-id") === here);
        });
      }
      const clear = (c) => !c || c === "none" || /rgba?\([^)]*,\s*0(\.0+)?\s*\)/.test(c);
      /* **薄いものは「覆い」に数えない。** 経緯線は紙の色を 12% だけ乗せた
         髪の毛のような線で、その下の字はふつうに読める。ここを数えると、
         地図じゅうの名前が「半分隠れている」と出る（実測でそうなった）。
         透けて見えなくなるあたり（0.35）で切る。 */
      const alphaOf = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c || "");
        if (!m) return c && c !== "none" ? 1 : 0;
        const v = m[1].split(/[,/]/).map((x) => parseFloat(x));
        return v.length > 3 ? v[3] : 1;
      };
      const paints = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") return false;
        if (Number(cs.opacity) === 0) return false;
        const a = Number(cs.opacity || 1) *
          Math.max(alphaOf(cs.fill) * Number(cs.fillOpacity || 1),
                   alphaOf(cs.stroke) * Number(cs.strokeOpacity || 1));
        if (a < 0.35) return false;
        /* **入れ物は覆いに数えない。** `elementsFromPoint` は当たった要素の
           親もぜんぶ返す。街の `<a>`（`.nmap-pin`）は中に透明な当たり判定
           （`.nm-hit`）を持っていて、そこを突くと `<a>` まで返ってくる。
           `<a>` 自身の `fill` は継承した黒なので、絵を持つものとして数えると
           **押しどころの広さぶん、字が隠れていることになる。**
           実際これで 287km が「44% 隠れている」と出ていた（絵は1画素も
           変わっていない）。入れ物は形を持たないので、ここで落とす。 */
        if (["svg", "g", "a", "defs", "clipPath", "mask", "filter"].includes(el.tagName)) return false;
        /* SVG の外（地図に乗っている HTML の札）は fill で見ない。
           HTML の要素は fill が既定で黒と出るので、全部「絵を持つ」になる。
           見るのは地の色。透明な器（`.mzoom-open`）は絵を1画素も変えない。 */
        if (!el.ownerSVGElement) return !clear(cs.backgroundColor);
        return !(clear(cs.fill) && clear(cs.stroke));
      };
      /* 街を立てた回は、その札のまわりだけを測り直す。
         札は1枚だけ増えるので、離れたところの数は前の回と同じ。
         40枚 × 19通りを全部突くと、1回に数十万点を突くことになって終わらない。 */
      let near = null;
      if (here) {
        const chip = svg.querySelector(".nm-here.is-now .nm-chip:not([style*='none'])");
        const shown = [...svg.querySelectorAll(".nm-here.is-now .nm-chip")].filter(
          (g) => getComputedStyle(g).display !== "none",
        );
        const box = (shown[0] ?? chip)?.getBoundingClientRect();
        if (box) near = inflate(box, 6);
      }
      const out = [];
      for (const el of svg.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (near && !hits(r, near)) continue;
        const STEP = Number(window.__NMSTEP || 1);
        const BIN = 6;
        const ink = new Array(BIN).fill(0);
        const cov = new Array(BIN).fill(0);
        const by = {};
        for (let y = r.top + 0.25; y < r.bottom; y += STEP) {
          for (let x = r.left + 0.25; x < r.right; x += STEP) {
            const stack = document.elementsFromPoint(x, y);
            const i = stack.indexOf(el);
            if (i < 0) continue; // ここに字は塗られていない
            const bin = Math.min(BIN - 1, Math.floor(((x - r.left) / r.width) * BIN));
            ink[bin]++;
            for (let k = 0; k < i; k++) {
              const o = stack[k];
              if (o.contains(el)) continue; // 自分の親
              if (!paints(o)) continue; // 透明な当たり判定
              cov[bin]++;
              const nm = o.getAttribute("class") || o.tagName;
              by[nm] = (by[nm] ?? 0) + 1;
              break;
            }
          }
        }
        const all = ink.reduce((a, c) => a + c, 0);
        if (all < 8) continue;
        const allCov = cov.reduce((a, c) => a + c, 0);
        let worst = 0;
        for (let i = 0; i < BIN; i++) if (ink[i] >= 4) worst = Math.max(worst, cov[i] / ink[i]);
        out.push({
          t: (el.textContent || "").trim().slice(0, 16),
          c: el.getAttribute("class") || "",
          pct: (allCov / all) * 100,
          worst: worst * 100,
          by: Object.entries(by).sort((a, b2) => b2[1] - a[1]).slice(0, 2)
            .map(([k, v]) => `${k}:${Math.round((v / all) * 100)}%`).join(" "),
        });
      }
      return out;
    },
    { sel: SEL, here, plan },
  );

let bad = 0;
for (const path of PAGES) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(400);
  /* 閉じている地図は `inert` が掛かっている（`components/atlas/MapZoom.tsx`）。
     `inert` の中は `elementsFromPoint` が1つも返さないので、外してから突く。
     外しても**絵は1画素も変わらない**（押せるかどうかだけの話）。
     外さずに測ると、どの札も「字が塗られていない」と出て 0 枚になる。 */
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[inert]")) el.removeAttribute("inert");
    document.querySelector(".nmap")?.scrollIntoView({ block: "center" });
  });
  await p.waitForTimeout(200);
  const ids = await p.evaluate(() =>
    [...document.querySelectorAll(".nmap .nmap-pin")].map((e) => e.getAttribute("data-id")),
  );
  const states =
    HERE === "none" ? [[null, false]] : HERE === "all"
      ? [[null, false], ...ids.flatMap((i) => [[i, false], [i, true]])]
      : [[HERE, false], [HERE, true]];
  // 札ごとに、いちばん悪い日を残す
  const worst = new Map();
  for (const [here, plan] of states) {
    for (const row of await measure(here, plan)) {
      const key = `${row.c}|${row.t}`;
      const cur = worst.get(key);
      const day = here ? `${here}${plan ? "(きょう)" : ""}` : "出発前";
      if (!cur || row.pct > cur.pct) worst.set(key, { ...row, day });
    }
  }
  const rows = [...worst.values()].sort((a, b2) => b2.pct - a.pct);
  console.log(`\n=== ${path}  札 ${rows.length} 枚 / ${states.length} 通りの日で ===`);
  console.log(`${"覆い".padStart(6)} ${"最悪の列".padStart(8)}  ${"いる街".padEnd(18)} class / 中身  ← 何に覆われたか`);
  for (const r of rows) {
    if (r.pct < 0.05 && r.worst < 0.05) continue;
    if (r.pct >= 10) bad++;
    console.log(
      `${r.pct.toFixed(1).padStart(5)}% ${r.worst.toFixed(1).padStart(7)}%  ${r.day.padEnd(18)} ${r.c.slice(0, 18).padEnd(18)} «${r.t}»  ← ${r.by}`,
    );
  }
  const over = rows.filter((r) => r.pct >= 10);
  console.log(`-- 10% 以上覆われている札: ${over.length} 枚` + (over.length ? `（${over.map((r) => r.t).join(" / ")}）` : ""));
}
await b.close();
process.exit(bad ? 1 : 0);
