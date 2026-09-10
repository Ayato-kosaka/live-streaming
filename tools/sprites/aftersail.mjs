/** **島が入れ替わったあとの表紙**から、常設の入口ぜんぶに行けるかを、押して確かめる。
 *
 *   PORT=4590 node aftersail.mjs
 *
 * あやと（2026-09-10）:
 *   「配信とか、歩いた国、あやとのこと、アプリ、企画を出す、これからとかっていうのは、
 *     次の島でもデフォルトの島には常に引き継がないと、新しく入ってきた人からすると困る」
 *
 * ## `a[href]` を数えない
 *
 * 最初はそうしていて、**6件ぜんぶ「ない」と出た。判定のほうが間違っていた。**
 * 島の入口は `<a href>` ではなく `<button aria-label="…をみる">` で、
 * 中で `router.push` する（`IsleStage.tsx` 925行）。
 * 手で作った島だけが `<a>` を使っているので、そちらでは通っていた。
 * **押しどころの形を決め打ちにすると、形の違う実装を「無い」と読む**
 * （`docs/island-standards.md` 13）。
 *
 * なので**実際に押す。** 1回目で歩き、着いたら2回目で入る。
 * 板が開くもの（中に一覧が出るもの）は、板の中のリンクを見る。
 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || 4590;
const WHEN = process.env.WHEN || "2026-09-15T09:00:00Z";
/** 常設。ここへ行けなくなったら不合格 */
const MUST = [
  ["あやとのこと", "/about"],
  ["配信", "/streams"],
  ["アプリ", "/apps"],
  ["歩いた国", "/map"],
  ["企画をだす", "/board"],
  ["これから", "/next"],
];

const clock = `(() => {
  const F = ${Date.parse(WHEN)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(clock);
const p = await ctx.newPage();

const open = async () => {
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(3500); // 島の入れ替えは画面が出てから（Cover.tsx）
};
await open();

const hero = await p.evaluate(() => {
  const h = document.querySelector(".hero");
  return {
    高さ: Math.round(document.body.scrollHeight),
    島: Math.round(h?.getBoundingClientRect().height ?? 0),
    建物: [...document.querySelectorAll(".isle-hit")].map((e) => e.getAttribute("aria-label")),
  };
});
console.log(`時計 ${WHEN}   表紙 ${hero.高さ}px   島 ${hero.島}px   建っているもの ${hero.建物.length}軒`);
console.log("   " + hero.建物.map((s) => String(s).replace(/をみる$/, "")).join(" / ") + "\n");

let bad = 0;
for (const [label, want] of MUST) {
  const sel = `.isle-hit[aria-label="${label}をみる"]`;
  let how = "";
  /* **島は2種類ある。** 手で作った島（出発まで）は `<a href>` の建物、
     章の島（`IsleStage`）は `<button>` + `router.push`。
     形で決め打ちにすると、片方を「無い」と読む（1度そうなった）。 */
  const hand = await p.$(`.hero a[href="${want}"]`);
  if (hand) {
    how = "島の中のリンク";
  } else if (!(await p.$(sel))) {
    how = "★建っていない";
  } else {
    /* **座標で押さない。** 1回目で島が歩き出すので、2回目のときには
       建物が動いていて**隣の建物に取られる**（あやとのことを押したら
       /streams に着いた）。ここで見たいのは押しどころの位置ではなく
       「入口として働くか」なので、その要素の click() を直に呼ぶ。
       位置のほうは `tools/sprites/hitbox.mjs` が別に見ている。 */
    await p.$eval(sel, (el) => el.click());
    await p.waitForSelector(`${sel}`, { timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(1600); // 歩き終わるまで
    await p.$eval(sel, (el) => el.click()).catch(() => {});
    await p.waitForTimeout(1400);
    const now = new URL(p.url()).pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    if (now === want) how = "押したら着いた";
    else {
      // 板が開くもの。開いた板の中にその行き先があるか
      const inSheet = await p.evaluate(
        (w) => [...document.querySelectorAll("a[href]")].some((a) => a.getAttribute("href") === w),
        want,
      );
      how = inSheet ? "板が開いて、その中から行ける" : `★行けない（いま ${now}）`;
    }
  }
  if (how.startsWith("★")) bad++;
  console.log(`  ${label.padEnd(7, "　")} ${want.padEnd(9)} ${how}`);
  await open();
}

console.log(bad ? `\n★ 島から行けないもの ${bad}件` : "\n常設ぜんぶ、島の中から行ける");
await b.close();
process.exit(bad ? 1 : 0);
