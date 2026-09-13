/**
 * `/me` の一覧の**足元**（`.mp-note-foot`）を撮って、測る。
 *
 *   tools/build.sh 3200
 *   node tools/sprites/mefootpage.mjs 3200
 *   python3 -m http.server 4200 --directory site/.next-3200 &
 *   TAG=before node tools/sprites/mefoot.mjs
 *
 * 出るもの（/tmp/mefoot/<TAG>/）:
 *   w360.png / w390.png … 面ぜんぶ（dpr 3）
 *   w360-<区画>.png      … 足元を持つ紙ごとの切り出し
 *   report.json          … 下の measure() が返した数
 *
 * 測るのは4つ:
 *   1. 足元1本の高さと、それを持つ行（li）ぜんぶの高さ。
 *      **札を足したせいで行が伸びていないか**をここで見る
 *   2. 中黒（・）が出ている場所。`.mp-note-foot > span + span::before` は
 *      `.chip` にも当たるので、札を入れると「札・札・札」になる
 *   3. 横あふれ。`getBoundingClientRect` ではなく
 *      `documentElement.scrollWidth > clientWidth` で見る（#72）
 *   4. 足元の中に押しどころ（a / button）が混ざっていないか。
 *      足元は押しどころではないので、0 でなければならない
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.SPORT || "4200";
const TAG = process.env.TAG || "now";
const DPR = Number(process.env.DPR || 3);
const OUT = `/tmp/mefoot/${TAG}`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const measure = () => {
  const px = (n) => Math.round(n * 100) / 100;
  const foots = [...document.querySelectorAll(".mp-note-foot, .mp-plan-t > i")].map((f, i) => {
    const li = f.closest("li");
    const sp = [...f.children];
    // 中黒は擬似要素で入る。**擬似要素は DOM に出ない**ので、当たっている
    // 規則を読む。`::before`（後ろの字の頭）と `::after`（前の字の後ろ）の
    // **両方**を見る。片方しか見ないと、付け替えたときに「中黒 0」と出て、
    // 消えていないものが消えたように読める。
    const seen = (s, where) => {
      const c = getComputedStyle(s, where).content;
      return c && c !== "none" && c !== "normal" ? `${where}:${c.replace(/"/g, "")}` : null;
    };
    const dots = sp.flatMap((s) => [seen(s, "::before"), seen(s, "::after")]).filter(Boolean);
    return {
      i,
      panel: f.closest("section")?.id || "",
      list: f.closest("ul")?.id || f.closest("ul")?.className || "",
      // 何が入っているか。札なのか素の字なのか
      kind: sp.map((s) => (s.className ? `${s.tagName.toLowerCase()}.${s.className}` : s.tagName.toLowerCase())),
      text: sp.map((s) => (s.textContent || "").trim()),
      dots,
      footH: px(f.getBoundingClientRect().height),
      footLines: px(f.getBoundingClientRect().height / parseFloat(getComputedStyle(f).lineHeight || "1")),
      liH: li ? px(li.getBoundingClientRect().height) : null,
      // 足元の中の押しどころ。0 でなければならない
      taps: f.querySelectorAll("a,button,input,select,textarea").length,
    };
  });
  const de = document.documentElement;
  return {
    w: window.innerWidth,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    over: de.scrollWidth - de.clientWidth,
    // 紙ごとの背。足元の直しで面がどれだけ縮んだかを見る
    panels: [...document.querySelectorAll("section.panel")].map((s) => ({
      id: s.id,
      h: px(s.getBoundingClientRect().height),
    })),
    foots,
  };
};

const report = {};
for (const W of [360, 390]) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/mefoot.html`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(900);
  report[W] = await p.evaluate(measure);
  await p.screenshot({ path: `${OUT}/w${W}.png`, fullPage: true });
  for (const id of ["s-donor", "s-care", "s-mine"]) {
    await p.locator(`#${id}`).screenshot({ path: `${OUT}/w${W}-${id}.png` }).catch(() => {});
  }
  await ctx.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await b.close();

for (const W of [360, 390]) {
  const r = report[W];
  console.log(`\n=== ${W}px ===  横あふれ ${r.over}px (scrollW ${r.scrollW} / clientW ${r.clientW})`);
  for (const s of r.panels) console.log(`  紙 ${s.id}  ${s.h}px`);
  for (const f of r.foots) {
    console.log(
      `  [${f.panel}/${f.list}] 足元 ${f.footH}px  行 ${f.liH}px  中黒 ${f.dots.length}  押しどころ ${f.taps}\n` +
        `      ${f.kind.join(" | ")}\n      ${f.text.join(" ▸ ")}`,
    );
  }
}
