/**
 * 「読めなかった」の顔を、**落とし方3通り × 端末2通り**で撮って数える。
 *
 *   cd site && NEXT_DIST_DIR=.next-read npx next build
 *   python3 -m http.server 4660 --directory site/.next-read &
 *   SPORT=4660 node tools/sprites/readshot.mjs
 *
 * 端末2通りというのは、
 *   - 覚えあり … 前に一度でも `POST /me` が返ったことのある端末（あやとのスマホ）
 *   - まっさら … 一度も返ったことがない端末
 * **視聴者さん（`admin=false`）でも同じ3通りを撮る。** 通信が細いときに
 * オーナーの道具が出ていないことを、こちらで確かめるため。
 */
import { mkdirSync } from "node:fs";
import { launch, newCtx, openPage, look, revive } from "./readbase.mjs";

const OUT = process.env.OUT || "/tmp/read";
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["/me.html", "me"],
  ["/me/desk.html", "desk"],
  ["/me/remote.html", "remote"],
  ["/me/roulette.html", "roulette"],
  ["/nordic/day/4.html", "day4"],
];

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

const CASES = [
  { tag: "ふつう", mode: "ok", memo: null, admin: true },
  { tag: "abort-覚えあり", mode: "abort", memo: true, admin: true },
  { tag: "503-覚えあり", mode: "503", memo: true, admin: true },
  { tag: "おそい-覚えあり", mode: "slow", memo: true, admin: true },
  { tag: "abort-まっさら", mode: "abort", memo: null, admin: true },
  { tag: "視聴者-ふつう", mode: "ok", memo: null, admin: false },
  { tag: "視聴者-abort-覚えあり", mode: "abort", memo: false, admin: false },
  { tag: "視聴者-abort-まっさら", mode: "abort", memo: null, admin: false },
];

const b = await launch();
for (const c of CASES) {
  if (only && !only.includes(c.tag)) continue;
  const ctx = await newCtx(b, { admin: c.admin, mode: c.mode, memo: c.memo });
  for (const [path, name] of PAGES) {
    /* この箱では、ログインの引き継ぎが決まるまで 11秒かかる面がある
       （`/me`）。**短く待って「入っていない人」と読まない**（判定#13）。 */
    const p = await openPage(ctx, path, { wait: c.mode === "slow" ? 45000 : 15000 });
    const r = await look(p);
    console.log(`${c.tag.padEnd(22)} ${name.padEnd(9)} ${JSON.stringify(r)}`);
    if (p.__errs.length) console.log(`${" ".repeat(22)} ${name.padEnd(9)} JSエラー: ${p.__errs.join(" / ")}`);
    await p.screenshot({ path: `${OUT}/${name}-${c.tag}.png`, fullPage: true });
    await p.close();
  }
  await ctx.close();
}

/* ---- 通信が戻ったら、画面を開き直さずに読み直せるか ---- */
for (const [path, name, btn] of [
  ["/me.html", "me", ".blank.is-off .blank-go"],
  ["/me/desk.html", "desk", ".blank.is-off .blank-go"],
  ["/me/remote.html", "remote", ".blank.is-off .blank-go"],
  ["/me/roulette.html", "roulette", ".blank.is-off .blank-go"],
]) {
  const ctx = await newCtx(b, { admin: true, mode: "abort", memo: null });
  const p = await openPage(ctx, path, { wait: 15000 });
  console.log(`もどす前 ${name.padEnd(9)} ${JSON.stringify(await look(p))}`);
  await p.screenshot({ path: `${OUT}/もどす-1-${name}-落ちている.png`, fullPage: true });
  revive(ctx);
  await p.click(btn).catch((e) => console.log(`  押せなかった: ${String(e).slice(0, 80)}`));
  await p.waitForTimeout(5000);
  console.log(`もどした後 ${name.padEnd(9)} ${JSON.stringify(await look(p))}`);
  await p.screenshot({ path: `${OUT}/もどす-2-${name}-押したあと.png`, fullPage: true });
  await p.close();
  await ctx.close();
}

/* ---- 押さずに、電波が戻っただけで直るか（`online` の合図） ---- */
{
  const ctx = await newCtx(b, { admin: true, mode: "abort", memo: null });
  const p = await openPage(ctx, "/me/desk.html", { wait: 15000 });
  revive(ctx);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await p.waitForTimeout(5000);
  console.log(`ひとりでに desk    ${JSON.stringify(await look(p))}`);
  await p.screenshot({ path: `${OUT}/もどす-3-desk-押さずに戻った.png`, fullPage: true });
  await p.close();
  await ctx.close();
}

await b.close();
