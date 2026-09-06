/**
 * 引き（島ぜんぶ）で、名前の出ている札が何枚あるかを数える。
 *
 * `docs/island-design.md` 6章と `docs/island-atlas.md` 4章は
 * **「案内するのは6つだけ」「どの島も最大6つ」**と決めている。
 * ここが一度 10 枚に増えて、あやとに「引きで出てくる項目がめちゃくちゃ多くて、
 * すっごい見にくい」と言われた。**目で数えると見落とす**ので数にする。
 *
 * 数えるのは「名前が読める札」だけ。`visibility: hidden` も `opacity: 0` も、
 * 中の `<b>` が出ていないものも数えない（引きの札は名前だけで、
 * 一言と「はいる」は `display: none` で入っている）。
 *
 *   SPORT=4141 node signcount.mjs          スマホ 390×844
 *   SPORT=4141 PC=1 node signcount.mjs     PC 1440×900
 *   SPORT=4141 URLS=/index.html node signcount.mjs
 *
 * 住人の名札も数える。**引きでは0でなければならない**
 * （あやと「引きのとき、キャラクターと会話できなくて良い」）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4321";
const PC = !!process.env.PC;
const URLS = (
  process.env.URLS ||
  "/index.html,/island/europe.html,/island/middle-east.html,/island/iran-walk.html,/island/caucasus.html,/island/nordic.html"
).split(",");
/** 引きで出してよい札の数（`docs/island-atlas.md` 4章） */
const MAX = 6;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: PC ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  deviceScaleFactor: PC ? 2 : 3,
  isMobile: !PC,
  hasTouch: !PC,
});
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
const p = await ctx.newPage();
await p.addInitScript(() => {
  // 到着演出を飛ばす。カモメの吹き出しが出ていると、引きへの切り替えが1回食われる
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-today", "2026-09-05");
  } catch {
    /* 書けなければ、下のループが空押しで吸収する */
  }
});

const count = () =>
  p.evaluate(() => {
    const vis = (e) => {
      const c = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return c.visibility !== "hidden" && c.display !== "none" && +c.opacity > 0 && r.width > 4 && r.height > 4;
    };
    const nameOf = (e) =>
      [...e.querySelectorAll("b")]
        .filter(vis)
        .map((x) => x.textContent.trim())
        .join("");
    const marks = [...document.querySelectorAll(".spot-mark, .isle-mark")].filter((e) => vis(e) && nameOf(e));
    return {
      cam: document.querySelector(".stage, .isle")?.getAttribute("data-cam"),
      names: marks.map(nameOf),
      who: [...document.querySelectorAll(".who-name, .isle-who-name")].filter(vis).length,
    };
  });

let bad = 0;
for (const u of URLS) {
  await p.goto(`http://localhost:${SPORT}${u}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2600);
  const near = await count();
  /* 引きへ。**1回で切り替わるとは限らない**（吹き出しが出ていると、
     どこを押しても閉じるだけになる。`IslandStage` の onStageClick）。 */
  for (let k = 0; k < 3; k++) {
    if ((await p.getAttribute(".stage, .isle", "data-cam")) === "wide") break;
    await p.evaluate(() => document.querySelector(".stage-view, .isle-view")?.click());
    await p.waitForTimeout(1800);
  }
  const far = await count();
  const ng = far.cam !== "wide" || far.names.length > MAX || far.who > 0;
  if (ng) bad++;
  console.log(
    `${ng ? "NG" : "ok"} ${u}\n   寄り ${near.names.length}枚  ${near.names.join(" / ")}\n   引き ${
      far.names.length
    }枚  ${far.names.join(" / ")}${far.who ? `  住人の名札 ${far.who}枚` : ""}`,
  );
}
console.log(`\n面 ${URLS.length}  上限 ${MAX}枚  超えた面 ${bad}`);
await b.close();
