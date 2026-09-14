/** **引き（島をながめる）で、建物の入口を1つずつ実際に押す。**
 *
 *   node tools/sprites/islereachpress.mjs
 *   ORIGIN=http://127.0.0.1:4290 P=/ node tools/sprites/islereachpress.mjs
 *
 * `islereach.mjs` は「指が届くか」を数えるだけで、**押した先で何が起きるかは見ない。**
 * ここでは押して、**何が開いたか**を出す。引きの押しどころは2種類あって、
 * 起きることが違う。
 *
 *   札を押す     … 板（`.isle-sheet`）が開く。中身の無い建物はそのまま外へ出る
 *   建物を押す   … **板は開かない。** その建物のそばへ降りて、札が1枚だけ開く
 *                  （`IsleStage` の `goTo`）。そこから「みる」でようやく板
 *
 * **建物を押したときに板が開かないのは、壊れているのではない。**
 * 判定を「板が開いたか」だけにすると、正しい動きが落ちる
 * （`docs/island-misses.md` #13）。なので2段目まで押して見る。
 *
 * 1件ごとに読み直す。開いた板を閉じずに次を押すと、以降ぜんぶ同じ板の名前が
 * 出て「全部入れた」に見える（1回そう出した）。
 */
import { chromium } from "playwright-core";
import { at, net, ORIGIN } from "./islereachsite.mjs";
import { offline } from "./route.mjs";

const W = Number(process.env.W || 390);
const P = process.env.P || "/island/caucasus";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
await net(ctx); await offline(ctx);
const pg = await ctx.newPage();

const here = () => pg.evaluate(() => location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, ""));
const shut = async () => {
  for (let i = 0; i < 20; i++) {
    if (!(await pg.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false))) break;
    await pg.mouse.click(4, 4).catch(() => {});
    await pg.waitForTimeout(300);
  }
};
const state = () =>
  pg.evaluate(() => ({
    sheet: document.querySelector(".isle-sheet")
      ? document.querySelector(".isle-sheet").getAttribute("aria-label") ||
        document.querySelector(".isle-sheet h2,.isle-sheet b")?.textContent.trim() ||
        "（名前なし）"
      : "",
    cam: document.querySelector(".isle")?.getAttribute("data-cam") || "-",
    url: location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, ""),
  }));
/** 引きの島まで戻す（毎回読み直す。前の1件を引きずらない） */
const toWide = async () => {
  await pg.goto(at(P), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  await shut();
  await (await pg.$(".isle-view"))?.click();
  await pg.waitForTimeout(2500);
  await shut();
};

/** いま引きで押せる入口の一覧（札 / 当たり） */
const doors = () =>
  pg.evaluate(() => {
    const out = [];
    document.querySelectorAll(".isle-spot").forEach((sp, i) => {
      const name = (sp.querySelector(".isle-hit")?.getAttribute("aria-label") || "").replace(/をみる$/, "");
      const live = (sel) => {
        const el = sp.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) return false;
        const b = el.getBoundingClientRect();
        const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!h && (el.contains(h) || h === el);
      };
      out.push({ i, name, mark: live(".isle-mark"), hit: live(".isle-hit") });
    });
    return out;
  });

await toWide();
const list = await doors();
console.log(`${ORIGIN}${P}  幅${W}px  引きで押す（建物${list.length}軒）`);
for (const d of list) {
  if (!d.mark && !d.hit) {
    console.log(`  ${d.name.padEnd(7)} … 入口が無い（札も当たりも押せない）`);
    continue;
  }
  const via = d.mark ? ".isle-mark" : ".isle-hit";
  await pg.evaluate(([i, sel]) => document.querySelectorAll(".isle-spot")[i].querySelector(sel).click(), [d.i, via]);
  await pg.waitForTimeout(1600);
  const s1 = await state();
  let more = "";
  if (!s1.sheet && s1.url === (await here())) {
    // 建物を押した場合。そばへ降りて札が開いているはずなので、そこまで押す
    /* **着くまで待つ。** 押した瞬間に札は開くが、歩いているあいだは
       「いちばん近い1軒」が入れ替わるので、いったん閉じる。着けばまた開く。
       待たずに見て「札が出ない」と読むと、正しい動きを不具合と数える。 */
    let mk = "";
    for (let k = 0; k < 25 && !mk; k++) {
      await pg.waitForTimeout(400);
      /* 島に降りて9秒すると住人のほうから話しかけてくる（`folk.ts` の CALL_AFTER）。
         話しているあいだ札は `opacity: 0`（`chain.css`）なので、閉じてから見る。
         閉じないと、歩いて着いたあとの札を「出ず」と読む */
      await shut();
      mk = await pg.evaluate((i) => {
        const el = document.querySelectorAll(".isle-spot")[i]?.querySelector(".isle-mark");
        if (!el) return "";
        const cs = getComputedStyle(el);
        if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) return "";
        return el.textContent.trim().slice(0, 18);
      }, d.i);
    }
    if (mk) await pg.evaluate((i) => document.querySelectorAll(".isle-spot")[i].querySelector(".isle-mark").click(), d.i);
    await pg.waitForTimeout(1600);
    const s2 = await state();
    more = ` → ${s1.cam === "close" ? "そばへ降りた" : "引きのまま"} → 札「${mk || "出ず"}」 → ${s2.sheet ? `板「${s2.sheet}」` : `url=${s2.url}`}`;
  }
  console.log(
    `  ${d.name.padEnd(7)} … ${d.mark ? "札" : "建物"}を押した → ${s1.sheet ? `板「${s1.sheet}」` : `url=${s1.url}`}${more}`,
  );
  await toWide();
}
await ctx.close();
await b.close();
