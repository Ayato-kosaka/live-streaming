/**
 * `.panel p` に柱（max-width）を入れると**何が狭くなるのか**を、入れる前に数える。
 *
 *   SPORT=4140 CAP=575 node navwide.mjs
 *
 * 読む字だけを数える `navch.mjs` と違って、**字でない `<p>`** まで出す。
 * 段落の中に絵や棒グラフや板が入っていると、箱を狭めた時点で絵が縮む。
 * 「読む行が短くなった」ではなく「絵が壊れた」になるので、先に見つける。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { readFileSync } from "fs";

const SPORT = process.env.SPORT || "4140";
const CAP = Number(process.env.CAP || 575);
const SEL = process.env.SEL || ".panel p";
const W = Number(process.env.W || 1440);
const PAGES = readFileSync("/tmp/pclen.txt", "utf8").split("\n").map((x) => x.trim()).filter(Boolean);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
await offline(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();
const rows = [];
for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(250);
  const got = await p.evaluate(([SEL, CAP]) => {
    const out = [];
    for (const el of document.querySelectorAll(SEL)) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const w = el.getBoundingClientRect().width;
      if (w <= CAP + 0.5) continue;             // 柱より狭いものは、入れても何も起きない
      // 中に「行に流れないもの」が入っているか
      const blocks = [...el.children].filter((c) => {
        const d = getComputedStyle(c).display;
        return !d.startsWith("inline") && d !== "ruby" && d !== "contents";
      });
      const imgs = el.querySelectorAll("img,svg,canvas,video,progress,input,button").length;
      out.push({
        w: Math.round(w),
        c: typeof el.className === "string" ? el.className : "",
        blocks: blocks.map((x) => x.tagName.toLowerCase() + (x.className && typeof x.className === "string" ? "." + x.className.split(/\s+/)[0] : "")),
        imgs,
        chars: (el.textContent || "").trim().length,
        t: (el.textContent || "").trim().slice(0, 22),
      });
    }
    return out;
  }, [SEL, CAP]);
  for (const g of got) rows.push({ ...g, path });
}
await b.close();
console.log(`@${W}px — \`${SEL}\` のうち、いま ${CAP}px より広いもの ${rows.length}件`);
console.log("| 面 | いまの幅 | class | 中の板 | 絵/入力 | 字数 | 中身 |");
console.log("| --- | ---: | --- | --- | ---: | ---: | --- |");
for (const r of rows.sort((a, c) => c.w - a.w))
  console.log(`| ${r.path} | ${r.w}px | ${r.c || "(なし)"} | ${r.blocks.join(",") || "無し"} | ${r.imgs} | ${r.chars} | ${r.t} |`);
