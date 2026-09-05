/**
 * 「押せないのに厚みがある」ものを、21面ぶん数える。
 *
 *   PORT=3130 node tools/sprites/popcheck.mjs
 *
 * `docs/island-design.md` 3章は、押せる合図を**厚み1種類だけ**と決めている。
 * だから「厚みがあるのに押せない」ものが1つでもあると、合図が嘘になる。
 *
 * 厚み＝**ぼかし0で下へ出る影**（box-shadow でも filter: drop-shadow でも）。
 * 落ち影（`--shadow-*`）は右下へずれて3pxぼけるので、ここには引っかからない。
 * 一度 `--shadow-1` が `1px 3px 0` で、`--pop-sm` の `0 4px 0` と
 * 横1px・縦1pxしか違わなかったことがある（`docs/island-world.md` 7.8）。
 *
 * 押せるかどうかは、自分か祖先が a/button/summary/label/[role=button]/
 * onclick/tabindex か cursor:pointer かで見る。
 * `<details>` は summary が子なので「押せない」に出る。読むときに差し引く。
 *
 * **数えるのは「押せないのに厚みがある」の一方向だけ。**
 * 逆（押せるのに厚みが無い）はここでは数えない。そちらには例外があるため
 * （`docs/island-design.md` 3章の3 / `docs/island-world.md` 3.5）:
 * 一面に並ぶマスが全部押せるときは、1枚ずつに厚みを付けない。
 * 料理32マス・企画8マス・住人22マスがこれで、違反ではない。
 * こちらの向きには例外が無いので、出た数はそのまま違反の数。
 *
 * 落ち先は /tmp/pop.json。tag と class でまとめて数えるのは読むほうの仕事。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { writeFileSync } from "node:fs";

const PORT = process.env.PORT || "3130";
/* 面が増えたら、ここに足すか PAGES=... で渡す。
   足さないと、新しい面だけ数えないまま「0件」と出る。 */
const PAGES = (
  process.env.PAGES ||
  [
    "/", "/about", "/streams", "/streams/cooking", "/kitchen", "/kitchen/egg-sandwich",
    "/legends", "/legends/iran-walk", "/apps", "/apps/nanitabeyo", "/next", "/next/new",
    "/board", "/map", "/map/france", "/nordic", "/nordic/guide", "/nordic/finland",
    "/nordic/photos", "/all", "/friends", "/now", "/design",
  ].join(",")
).split(",");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

const all = [];
for (const path of PAGES) {
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    try { await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 }); ok = true; }
    catch { await p.waitForTimeout(2000); }
  }
  if (!ok) { console.log(`${path} 取れず`); continue; }
  await p.waitForTimeout(700);
  await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  await p.waitForTimeout(500);
  const rows = await p.evaluate(() => {
    // "0 4px 0 rgb(...)" のような層を拾う。色が先頭に来る形もある。
    const layers = (s) => {
      if (!s || s === "none") return [];
      const parts = [];
      let depth = 0, cur = "";
      for (const ch of s) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      return parts.map((t) => {
        const nums = t.replace(/(rgba?|color|hsla?)\([^)]*\)/g, "").match(/-?[\d.]+px/g) || [];
        const [x, y, blur, spread] = nums.map((n) => parseFloat(n));
        return { raw: t.trim(), x: x || 0, y: y || 0, blur: blur || 0, spread: spread || 0, inset: /inset/.test(t) };
      });
    };
    const clickable = (el) => {
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const t = a.tagName;
        if (t === "A" || t === "BUTTON" || t === "SUMMARY" || t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "LABEL") return true;
        if (a.getAttribute && (a.getAttribute("role") === "button" || a.hasAttribute("onclick") || a.tabIndex >= 0)) return true;
        try { if (getComputedStyle(a).cursor === "pointer") return true; } catch {}
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const bs = layers(cs.boxShadow).filter((l) => !l.inset && l.blur === 0 && l.y > 0);
      const df = (cs.filter && cs.filter !== "none" ? cs.filter.match(/drop-shadow\([^)]*\)/g) || [] : [])
        .map((t) => { const n = (t.match(/-?[\d.]+px/g) || []).map(parseFloat); return { raw: t, x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0 }; })
        .filter((l) => l.blur === 0 && l.y > 0);
      if (!bs.length && !df.length) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className?.baseVal ?? (typeof el.className === "string" ? el.className : "")).slice(0, 50),
        click: clickable(el),
        w: Math.round(r.width), h: Math.round(r.height),
        bs: bs.map((l) => l.raw).join(" | "),
        df: df.map((l) => l.raw).join(" | "),
      });
    }
    return out;
  });
  for (const r of rows) all.push({ page: path, ...r });
  console.log(`${path} ${rows.length}`);
}
await b.close();
writeFileSync("/tmp/pop.json", JSON.stringify(all, null, 1));
const bad = all.filter((r) => !r.click);
const byTag = {};
for (const r of bad) byTag[r.tag] = (byTag[r.tag] || 0) + 1;
console.log("押せないのに厚み:", bad.length, JSON.stringify(byTag));
