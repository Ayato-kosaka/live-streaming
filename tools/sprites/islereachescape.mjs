/** **寄り（降り立った画面）で引っ込んだ建物に、逃げ道があるかを実際に押して確かめる。**
 *
 *   node tools/sprites/islereachescape.mjs
 *   ORIGIN=http://127.0.0.1:4290 P=/ node tools/sprites/islereachescape.mjs
 *
 * `plates.ts` の `fitHit` は 48px を取れない当たりを引っ込める。そこには
 * 「引っ込んでも札から入れる」と書いてあったが、**寄りでは札は出ていない**
 * （`chain.css` の `.isle-spot:not(.is-on) .isle-mark { opacity: 0 }`。
 * 名前が出るのは近づいた1軒だけ）。だから寄りの逃げ道は札ではなく、次の3つ:
 *
 *   歩く          … 建物のそばの地面を押す → あやとが歩く → 近づけば札が開く
 *   島をながめる  … 引きへ切り替える → そこで押せる
 *   下の紙        … 島の下の紙に同じ行き先の道がある
 *
 * **3つとも実際に押して、板（`.isle-sheet`）が開くか・同じ行き先へ着くかを見る。**
 * 数えるだけでは「逃げ道がある」は確かめられない。
 *
 * ## 1回の結果を判定に使わない（2026-09-14 に実測）
 *
 * **島は動く。** あやとが歩き、カメラが追う。だから「押して、どこへ着いたか」は
 * 押した瞬間の位置で変わる。**同じ幅・同じ建物・同じ道で、2回続けて回したら
 * 答えが違った。**
 *
 *   幅1280「これから」の 歩く  … 1回目 url=/      2回目 url=/next
 *
 * 1回目だけを見て「これからは表紙へ戻ってしまう」と読みかけた。**嘘になる。**
 * `islereach.mjs` が「のべ／いつも／1回ぶん」に分けているのと同じ理由で、
 * ここも**何度か回して、揃ったときだけ**ものを言うこと。
 *
 * **いまの版は1回しか回さない。** 何度か手で回して、答えが揃うかを見ること。
 * 揃わなければ、それは「その道が壊れている」ではなく「**まだ分かっていない**」。
 * （回数を重ねて出す形にするのは、これからの宿題）
 */
import { chromium } from "playwright-core";
import { at, net, ORIGIN } from "./islereachsite.mjs";
import { offline } from "./route.mjs";

const W = Number(process.env.W || 390);
const P = process.env.P || "/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
await net(ctx); await offline(ctx);
const pg = await ctx.newPage();
const shut = async () => {
  for (let i = 0; i < 20; i++) {
    if (!(await pg.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false))) break;
    await pg.mouse.click(4, 4).catch(() => {});
    await pg.waitForTimeout(300);
  }
};
const load = async () => {
  await pg.goto(at(P), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  await shut();
};
/** いま寄りで「押しどころが無い」建物（当たりが指を受けず、札も出ていない） */
const stuck = () =>
  pg.evaluate(() => {
    const out = [];
    document.querySelectorAll(".isle-spot").forEach((sp, i) => {
      const hit = sp.querySelector(".isle-hit");
      const mk = sp.querySelector(".isle-mark");
      const dead = (el) => {
        if (!el) return true;
        const cs = getComputedStyle(el);
        return cs.pointerEvents === "none" || Number(cs.opacity) === 0;
      };
      if (dead(hit) && dead(mk)) {
        const r = sp.getBoundingClientRect();
        out.push({ i, name: hit?.getAttribute("aria-label") || "", x: r.left, y: r.top });
      }
    });
    return out;
  });
const state = () =>
  pg.evaluate(() => ({
    sheet: document.querySelector(".isle-sheet")
      ? document.querySelector(".isle-sheet").getAttribute("aria-label") ||
        document.querySelector(".isle-sheet h2,.isle-sheet b")?.textContent.trim() ||
        "（名前なし）"
      : "開かなかった",
    cam: document.querySelector(".isle")?.getAttribute("data-cam"),
    url: location.pathname,
  }));

await load();
const list = await stuck();
console.log(`${ORIGIN}${P}  幅${W}px  寄りで押しどころの無い建物 ${list.length}軒`);
for (const s of list) console.log(`  ${s.name}（足元 ${Math.round(s.x)},${Math.round(s.y)}）`);

for (const s of list) {
  console.log(`\n== ${s.name} の逃げ道 ==`);

  // 1) 歩く。建物の足元のすぐ下の地面を押して、近づくまで待つ
  await load();
  /* 押す先は**島の地面**。下ふちには「今日の島」の板（背 52px ＋ 下ふち 10px）が
     いるので、そこは避ける。建物が画面の外にいるときは、その向きのいちばん端を
     押して、あやとが歩いて画面に入ってくるのを待つ（歩いている間、何度か押し直す）。 */
  const gx = Math.min(Math.max(s.x, 24), W - 24);
  const gy = Math.min(Math.max(s.y - 8, 70), 720);
  let walked = "";
  for (let k = 0; k < 24; k++) {
    if (k % 6 === 0) await pg.mouse.click(gx, gy).catch(() => {});
    await pg.waitForTimeout(400);
    const on = await pg.evaluate((i) => {
      const sp = document.querySelectorAll(".isle-spot")[i];
      const mk = sp?.querySelector(".isle-mark");
      if (!sp || !mk) return null;
      const cs = getComputedStyle(mk);
      return cs.pointerEvents !== "none" && Number(cs.opacity) > 0 ? mk.textContent.trim().slice(0, 20) : null;
    }, s.i);
    if (on) { walked = on; break; }
  }
  if (walked) {
    await pg.evaluate((i) => document.querySelectorAll(".isle-spot")[i].querySelector(".isle-mark").click(), s.i);
    await pg.waitForTimeout(1600);
    const st = await state();
    console.log(`  歩く          … 札「${walked}」が開いた → 押すと 板「${st.sheet}」 url=${st.url}`);
  } else {
    console.log("  歩く          … 近づいても札が出なかった");
  }

  // 2) 島をながめる
  await load();
  await (await pg.$(".isle-view"))?.click();
  await pg.waitForTimeout(2500);
  await shut();
  const wide = await pg.evaluate((i) => {
    const sp = document.querySelectorAll(".isle-spot")[i];
    for (const sel of [".isle-hit", ".isle-mark"]) {
      const el = sp?.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) continue;
      const b = el.getBoundingClientRect();
      const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (h && (el.contains(h) || h === el)) return sel;
    }
    return "";
  }, s.i);
  if (wide) {
    await pg.evaluate(([i, sel]) => document.querySelectorAll(".isle-spot")[i].querySelector(sel).click(), [s.i, wide]);
    await pg.waitForTimeout(1800);
    /* **引きで建物を押すと、板は開かない。** 押した建物のそばへ降りて、
       その1軒の札が開く（`IsleStage` の `goTo`）。逃げ道として通ったかは、
       そこから「みる」まで押して見る。 */
    const st1 = await state();
    const opened = await pg.evaluate((i) => {
      const mk = document.querySelectorAll(".isle-spot")[i]?.querySelector(".isle-mark");
      if (!mk) return "";
      const cs = getComputedStyle(mk);
      if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) return "";
      mk.click();
      return mk.textContent.trim().slice(0, 20);
    }, s.i);
    await pg.waitForTimeout(1600);
    const st2 = await state();
    console.log(
      `  島をながめる  … ${wide === ".isle-hit" ? "建物" : "札"}が押せた → ${st1.cam === "close" ? "そばへ降りた" : "引きのまま"}` +
        ` → 札「${opened || "出ず"}」 → 板「${st2.sheet}」 url=${st2.url}`,
    );
  } else console.log("  島をながめる  … 引きでも押せなかった");

  // 3) 下の紙。島の下に同じ行き先の道があるか
  await load();
  const href = await pg.evaluate((i) => {
    const sp = document.querySelectorAll(".isle-spot")[i];
    return sp?.querySelector(".isle-go")?.getAttribute("href") || "";
  }, s.i);
  const paper = await pg.evaluate((name) => {
    const hits = [...document.querySelectorAll("main a, footer a, .hero ~ * a")].filter(
      (a) => a.textContent.trim().includes(name) || (a.getAttribute("href") || "").includes("/atlas"),
    );
    return hits.slice(0, 3).map((a) => `${a.textContent.trim().slice(0, 14)}→${a.getAttribute("href")}`);
  }, s.name.replace(/をみる$/, ""));
  console.log(`  下の紙        … ${paper.length ? paper.join(" / ") : "同じ行き先の道は見つからなかった"}（札の行き先 ${href || "-"}）`);
}
await ctx.close();
await b.close();
