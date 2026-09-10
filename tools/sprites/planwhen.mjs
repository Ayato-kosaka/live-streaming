/**
 * 終わった企画が「これから」に残っていないかを、**未来・当日・過去の3通り**で見る。
 *
 *   SPORT=4502 node planwhen.mjs
 *
 * 静的書き出しなのでビルドした日の答えが焼かれている（`CLAUDE.md`）。
 * 画面が出てから数え直しているかどうかは、**時計を進めないと分からない。**
 * 見るのは `/next`（企画の一覧）と `/board`（付箋の宛先の棚）の2枚で、
 * どちらも同じ `planPhase` を見ているはずのところ。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4502";
/** 見る企画。題名と、その日 */
const PLAN = process.env.PLAN || "フード＆ワイン";
const DATES = (process.env.DATES || "2026-09-05T12:00:00+09:00,2026-09-06T12:00:00+09:00,2026-09-10T12:00:00+09:00").split(",");

const clock = (iso) => `(() => {
  const FAKE = ${0}; })();`;
function clockScript(iso) {
  return `(() => {
    const FAKE = ${Date.parse(iso)};
    const RealDate = Date;
    const start = RealDate.now();
    function shift() { return FAKE + (RealDate.now() - start); }
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
      static now() { return shift(); }
      static parse(...a) { return RealDate.parse(...a); }
      static UTC(...a) { return RealDate.UTC(...a); }
    }
    Object.defineProperty(FakeDate, "name", { value: "Date" });
    globalThis.Date = FakeDate;
  })();`;
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const iso of DATES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await offline(ctx);
  await ctx.addInitScript(clockScript(iso));
  const p = await ctx.newPage();
  console.log(`■ ${iso.slice(0, 10)}`);
  for (const [name, path, sel] of [
    ["/next  企画の一覧", "/next.html", null],
    ["/board 付箋の棚", "/board.html", null],
  ]) {
    await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(3500);
    const r = await p.evaluate((word) => {
      const out = [];
      // 見出し（h2 / 棚のラベル）ごとに、その下に企画の題名があるか
      for (const h of document.querySelectorAll("h2, .nb-glabel, .nx-h")) {
        const sec = h.closest("section, .nb-group") ?? h.parentElement;
        if (!sec) continue;
        if ((sec.innerText || "").includes(word)) out.push(h.textContent.trim());
      }
      // 主役の札（いちばん近い企画）
      const lead = document.querySelector(".pcard, .plan-card, .nx-lead");
      return { heads: [...new Set(out)], lead: lead ? lead.innerText.split("\n").slice(0, 3).join(" / ") : null };
    }, PLAN);
    console.log(`   ${name}  「${PLAN}」が入っている見出し: ${r.heads.length ? r.heads.join(" / ") : "（どこにも出ていない）"}`);
    if (r.lead) console.log(`      主役の札: ${r.lead}`);
  }
  await ctx.close();
}
await b.close();
