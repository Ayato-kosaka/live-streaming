/**
 * 「この日に、言う」と「写真を貼る」を、**通信を落として**撮る（#34 の3件目）。
 *
 *   cd site && NEXT_DIST_DIR=.next-fork npx next build
 *   python3 -m http.server 4690 --directory site/.next-fork &
 *   SPORT=4690 OUT=/tmp/fork node tools/sprites/forkshot.mjs
 *
 * 落とし方は3通り（`readbase.mjs`）。**`abort` だけで判定しない。**
 * 本命は「45秒返さない」で、`fetch` は自分では諦めないのでそこが一番出る。
 */
import { mkdirSync } from "node:fs";
import { launch, newCtx, openPage, revive } from "./readbase.mjs";

const OUT = process.env.OUT || "/tmp/fork";
mkdirSync(OUT, { recursive: true });

/** ふつうに読めているときの中身。0票ばかりにすると「読めた」の絵が痩せる */
const FORKS = {
  "nordic-day-4": { trakai: 23, rest: 9 },
  "nordic-kutaisi-katowice": { yes: 14, no: 3 },
  "nordic-katowice-warszawa": { count: 31, no: 9 },
  "nordic-vilnius-riga": { stop: 18, hurry: 7 },
  "nordic-riga-tallinn": { stand: 5, wait: 21 },
  "nordic-helsinki-stockholm": { a: 6, b: 6 },
};
const EVENTS = [
  { id: "ev1", title: "ヒッチハイクで北欧へ", date: "2026-09-11" },
  { id: "ev2", title: "北欧旅の出発", date: "2026-09-11" },
];

/** ふつうのときだけ、本番と同じ形の中身を返す。落としているときは素通し。 */
async function seed(ctx) {
  await ctx.route(/\/island-api\/(fork|streamevents)/, async (r) => {
    if (ctx.__box.mode !== "ok") return r.fallback();
    const u = new URL(r.request().url());
    const json = (body) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname.includes("/streamevents"))
      return json({ day: u.searchParams.get("day"), events: EVENTS });
    const ids = (u.searchParams.get("ids") || "").split(",").filter(Boolean);
    const forks = {};
    for (const id of ids) if (FORKS[id]) forks[id] = FORKS[id];
    return json({ forks });
  });
}

/** その面が何を出しているか。**絵だけでなく、数えて突き合わせる。** */
const peek = (p) =>
  p.evaluate(() => {
    const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    const say = document.querySelector("#say");
    return {
      言う区画: say ? 1 : 0,
      言う見出し: say ? txt("#say h2")[0] : "",
      言う骨: say ? say.querySelectorAll(".wait").length : 0,
      言うよみなおし: txt("#say .blank.is-off > b"),
      言う押しどころ: say ? say.querySelectorAll(".fork-pick").length : 0,
      よみこむ札: txt("#say .blank-go"),
      写真骨: document.querySelectorAll(".nph-ev .wait").length,
      写真よみなおし: txt(".nph-ev .blank.is-off > b"),
      写真の字: txt(".nph-ev-note, .nph-ev-ask, .nph-ev-one b"),
      写真の札: document.querySelectorAll(".nph-ev-pick").length,
      貼る口: document.querySelectorAll(".nph-post-go").length,
      高さ: Math.round(document.body.scrollHeight),
      横あふれ: document.body.scrollWidth > document.documentElement.clientWidth,
    };
  });

const PAGES = [
  ["/nordic/day/4.html", "day4"],
  ["/cards.html", "cards"],
  ["/nordic/photos.html", "photos"],
];

const CASES = [
  { tag: "ふつう", mode: "ok" },
  { tag: "abort", mode: "abort" },
  { tag: "503", mode: "503" },
  { tag: "おそい45秒", mode: "slow" },
];

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const tag = process.env.TAG ? `${process.env.TAG}-` : "";

const b = await launch();
for (const c of CASES) {
  if (only && !only.includes(c.tag)) continue;
  /* 覚えありの端末（あやとのスマホ）。落ちていてもオーナーの道具が出る側 */
  const ctx = await newCtx(b, { admin: true, mode: c.mode, memo: true });
  await seed(ctx);
  for (const [path, name] of PAGES) {
    const p = await openPage(ctx, path, { wait: c.mode === "slow" ? 45000 : 15000 });
    console.log(`${c.tag.padEnd(10)} ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
    if (p.__errs.length)
      console.log(`${" ".repeat(10)} ${name.padEnd(7)} JSエラー: ${p.__errs.join(" / ")}`);
    await p.screenshot({ path: `${OUT}/${tag}${name}-${c.tag}.png`, fullPage: true });
    await p.close();
  }
  await ctx.close();
}

/* ---- 視聴者さん（オーナーではない人）。**書ける口が開いていないこと** ---- */
if (!only) {
  for (const mode of ["ok", "abort", "slow"]) {
    const ctx = await newCtx(b, { admin: false, mode, memo: mode === "ok" ? null : false });
    await seed(ctx);
    for (const [path, name] of [["/nordic/day/4.html", "day4"], ["/cards.html", "cards"]]) {
      const p = await openPage(ctx, path, { wait: mode === "slow" ? 45000 : 15000 });
      console.log(`視聴者-${mode.padEnd(6)} ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
      await p.screenshot({ path: `${OUT}/${tag}視聴者-${name}-${mode}.png`, fullPage: true });
      await p.close();
    }
    await ctx.close();
  }
}

/* ---- 通信が戻ったら、画面を開き直さずに読み直せるか ---- */
if (!only) {
  for (const [path, name, btn] of [
    ["/nordic/day/4.html", "day4", "#say .blank-go"],
    ["/cards.html", "cards", ".nph-ev .blank-go"],
  ]) {
    const ctx = await newCtx(b, { admin: true, mode: "abort", memo: true });
    await seed(ctx);
    const p = await openPage(ctx, path, { wait: 15000 });
    console.log(`もどす前 ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
    await p.screenshot({ path: `${OUT}/${tag}もどす-1-${name}-落ちている.png`, fullPage: true });
    revive(ctx);
    await p.click(btn).catch((e) => console.log(`  押せなかった: ${String(e).slice(0, 90)}`));
    await p.waitForTimeout(6000);
    console.log(`もどした後 ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
    await p.screenshot({ path: `${OUT}/${tag}もどす-2-${name}-押したあと.png`, fullPage: true });
    await p.close();
    await ctx.close();
  }

  /* ---- 押さずに、電波が戻っただけで直るか（`online` の合図） ---- */
  const ctx = await newCtx(b, { admin: true, mode: "abort", memo: true });
  await seed(ctx);
  const p = await openPage(ctx, "/nordic/day/4.html", { wait: 15000 });
  revive(ctx);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await p.waitForTimeout(6000);
  console.log(`ひとりでに day4    ${JSON.stringify(await peek(p))}`);
  await p.screenshot({ path: `${OUT}/${tag}もどす-3-day4-押さずに戻った.png`, fullPage: true });
  await p.close();
  await ctx.close();
}

await b.close();
