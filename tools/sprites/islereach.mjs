/** **島の住人と建物に、指が届くかを本番で数える。**
 *
 *   node tools/sprites/islereach.mjs
 *   W=1280 node tools/sprites/islereach.mjs
 *   SEC=20 node tools/sprites/islereach.mjs      # 見る秒数（既定 12）
 *
 * ## 1回突いて数えない
 *
 * **住人は歩く。** ある瞬間に建物の裏へ回り込んでいれば届かないし、
 * 次の瞬間には出てくる。1回だけ測って「5人届いた」と言っても、
 * それは**その瞬間の数**でしかない（実際、本番の表紙を5回引いて 1〜2 と揺れた）。
 *
 * なので**一定の時間ぶん、何度も突く**。出すのは3つ:
 *
 *   のべ    … 見ているあいだに一度でも届いた人数（**これが「押せる人がいるか」**）
 *   いつも  … 毎回届いた人数（歩いても隠れない場所にいる人）
 *   1回ぶん … 1回の測定あたりの人数（前の測り方と比べるため。最小〜最大）
 *
 * ## 喋っているあいだは測らない
 *
 * `chain.css` の `.isle.is-talking .isle-hit { pointer-events: none }` で、
 * **島が喋っているあいだは押しどころが全部止まる。** その最中に測ると
 * 全部 0 と出て、壊れているのと見分けが付かない（実際に1回そう読みかけた）。
 * 黙るまで閉じてから測り、閉じたことは結果に出す。
 *
 * ## 見た目の箱では測らない
 *
 * 中心と上下左右 24px を突いて、**自分が返るか**を見る。
 * `getBoundingClientRect` には、上に乗ったものに取られている場所が出ない。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

const W = Number(process.env.W || 390);
const SEC = Number(process.env.SEC || 12);
const PAGES = (process.env.PAGES || "/,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east").split(",");

/** 中心と上下左右 24px を突いて、自分が返るか。画面の外は数えない。 */
const REACH = `(el) => {
  const b = el.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
  for (const [dx, dy] of [[0,0],[-24,0],[24,0],[0,-24],[0,24]]) {
    const h = document.elementFromPoint(cx + dx, cy + dy);
    if (!h || (!el.contains(h) && h !== el)) return false;
  }
  return true;
}`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`${ORIGIN}  幅${W}px  ${SEC}秒ぶん`);
for (const path of PAGES) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
  await viaCurl(ctx);
  await offline(ctx);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
  await pg.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  // 喋りを閉じる。閉じきれなければ、そう書いて出す（黙って 0 を出さない）
  let closed = 0;
  for (let i = 0; i < 40; i++) {
    const t = await pg.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false);
    if (!t) break;
    closed++;
    await pg.mouse.click(4, 4).catch(() => {});
    await pg.waitForTimeout(400);
  }
  const talking = await pg.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false);

  const seen = { who: new Set(), hit: new Set() };
  const always = { who: null, hit: null };
  const per = { who: [], hit: [] };
  let total = { who: 0, hit: 0 };
  const end = Date.now() + SEC * 1000;
  let rounds = 0;
  while (Date.now() < end) {
    const r = await pg.evaluate((reachSrc) => {
      const reach = eval(reachSrc);
      const out = { who: [], hit: [], whoN: 0, hitN: 0 };
      /* **鍵は「並び順＋名前」。名前だけにしない。**
         住人の aria-label は全員おなじ（「話しかける」）なので、名前だけを
         鍵にすると11人が1人に潰れる。実際それで「のべ 1人」と出て、
         同じ回の「1回ぶん 3人」と食い違った（累計が1回ぶんを下回るのは
         あり得ないので、そこで測り方の側が壊れていると分かる）。 */
      document.querySelectorAll(".isle-who-hit").forEach((el, i) => {
        out.whoN++; if (reach(el)) out.who.push(i + ":" + (el.getAttribute("aria-label") || ""));
      });
      document.querySelectorAll(".isle-hit").forEach((el, i) => {
        out.hitN++; if (reach(el)) out.hit.push(i + ":" + (el.getAttribute("aria-label") || ""));
      });
      return out;
    }, REACH);
    total = { who: r.whoN, hit: r.hitN };
    r.who.forEach((k) => seen.who.add(k));
    r.hit.forEach((k) => seen.hit.add(k));
    always.who = always.who === null ? new Set(r.who) : new Set([...always.who].filter((k) => r.who.includes(k)));
    always.hit = always.hit === null ? new Set(r.hit) : new Set([...always.hit].filter((k) => r.hit.includes(k)));
    per.who.push(r.who.length); per.hit.push(r.hit.length);
    rounds++;
    await pg.waitForTimeout(300);
  }
  const rng = (a) => (a.length ? `${Math.min(...a)}〜${Math.max(...a)}` : "-");
  console.log(
    `  ${path.padEnd(22)} 住人 のべ${String(seen.who.size).padStart(2)}/${total.who}` +
    ` いつも${String(always.who?.size ?? 0).padStart(2)} 1回ぶん${rng(per.who).padStart(6)}` +
    ` ／ 建物 のべ${String(seen.hit.size).padStart(2)}/${total.hit}` +
    ` いつも${String(always.hit?.size ?? 0).padStart(2)} 1回ぶん${rng(per.hit).padStart(6)}` +
    `  ${rounds}回  JSエラー${errs.length}` +
    (closed ? `  ※喋りを${closed}回閉じた` : "") +
    (talking ? "  ※まだ喋っている（数は当てにならない）" : ""),
  );
  await ctx.close();
}
await b.close();
