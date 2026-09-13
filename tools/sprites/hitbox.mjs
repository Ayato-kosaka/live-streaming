/**
 * 押しどころの実寸を測る。
 *
 *   PORT=3130 SEL=".crumbs a" PAGES=/nordic/finland,/map/france node tools/sprites/hitbox.mjs
 *   PORT=3130 W=1000 SEL=".ih-link" PAGES=/about node tools/sprites/hitbox.mjs
 *
 * **見た目の箱（getBoundingClientRect）では測らない。**
 * `::after` で広げてある当たり判定はそこに出ないし、
 * 隣の要素に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして、`elementFromPoint` がまだ自分を返すかで測る。
 *
 * `docs/island-design.md` 3-2 は「指で押せる最小 48px」。
 * パンくずの「島」は見た目 13x21px で、当たり 22x46px だった
 * （`docs/island-world.md` 7.10）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3130";
const SEL = process.env.SEL || ".crumbs a";
const PAGES = (process.env.PAGES || "/nordic/finland").split(",");
const W = Number(process.env.W || 390);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
await offline(ctx);
/* ログインした人にしか出ない面（じぶんのこと）を測るための差し込み口。
   `SEED=tools/sprites/asme.mjs` を渡すと、入っている人として開く。 */
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
for (const path of PAGES) {
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    try { await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 }); ok = true; } catch { await p.waitForTimeout(2000); }
  }
  if (!ok) { console.log(path, "取れず"); continue; }
  await p.waitForTimeout(600);
  const rows = await p.evaluate((sel) => {
    const out = [];
    const nm = (e) => (e ? e.tagName + (e.className && typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/)[0] : "") : "なし");
    for (const el of document.querySelectorAll(sel)) {
      // 画面の外にあるものは elementFromPoint が届かない。砂浜の一覧のように
      // ページの終わりにあるものを測ると、全部 1x1 と出る。先に送っておく。
      /* **指が押すものを先に決める。** 見た目を作り直したチェックボックスは、
         `<input>` を脇へどけて `<label>` に絵を描く。入力の真ん中を突いても
         当たらないが、指は label を押している。入力の箱で測ると、
         押せるものが「押せない」と出る（`/me` の2つが実際にそうだった）。 */
      let target = el;
      if (el.tagName === "INPUT") {
        const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        target = byFor || el.closest("label") || el;
      }
      /* **畳みの中は、押せなくて当たり前。** 閉じた `<details>`（`Fold`）の
         中身は、畳まれていても箱を持っている。そこを突くと畳みの外の何かが
         返るので、押せるものが「押せない」と挙がる。`/me` の名前の欄が
         まさにそれだった。**押す前に開く面なので、数えない。** */
      const det = el.closest("details");
      if (det && !det.open && !det.querySelector("summary")?.contains(el)) continue;

      target.scrollIntoView({ block: "center" });
      const r = target.getBoundingClientRect();
      if (r.width < 1) continue;

      /* **始点は、外接矩形の中心にしない。**
         折り返した行内リンク（`<p>` の中で2行になった `<a>`）の外接矩形は
         2行を囲む1つの箱なので、その中心は**行と行のすきま**に落ちる。
         そこを突くと親の `<p>` が返り、押せるリンクが「当たり 1x1」と出る。
         実際に `/me` のプライバシーポリシーがそれで挙がった。
         `getClientRects()` は行ごとの箱を返すので、いちばん大きい行の中心を使う。 */
      const lines = [...target.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
      const box = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

      /* **送っても画面に入らないことがある。** 中でスクロールする箱に
         入っていたり、ページがそれ以上送れなかったりすると、始点が画面の
         外に残る。`elementFromPoint` は画面の外に何も返さないので、
         「何にも覆われていない」と「画面の外」が同じ 1x1 に見える。分ける。 */
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
        out.push({ t: (el.textContent || "").trim().slice(0, 12), box: [Math.round(r.width), Math.round(r.height)], why: "画面の外（送っても入らない）" });
        continue;
      }

      /* **字だけ隠してある入力は、押せないのではない。**
         見た目を作り直したチェックボックスは、`<input>` を隠して `<label>` に
         絵を描く。入力そのものを突けば当然当たらないが、指は label を押す。
         label があるなら、そちらを測る。 */
      const hits = (x, y) => {
        const e = document.elementFromPoint(x, y);
        return e && (e === target || target.contains(e) || e.closest?.("a,button,label") === target);
      };
      if (!hits(cx, cy)) {
        // 覆われている。**誰に覆われているかまで出す。** そこまで出ないと、
        // 直す側が探すところからやり直すことになる。
        const top = document.elementFromPoint(cx, cy);
        out.push({ t: (el.textContent || "").trim().slice(0, 12), box: [Math.round(r.width), Math.round(r.height)], why: `${nm(top)} が上にいる` });
        continue;
      }
      const grow = (dx, dy) => { let n = 0; while (n < 60 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
      const l = grow(-1, 0), rr = grow(1, 0), u = grow(0, -1), dn = grow(0, 1);
      out.push({ t: (el.textContent || "").trim().slice(0, 12), box: [Math.round(r.width), Math.round(r.height)], hit: [l + rr + 1, u + dn + 1] });
    }
    return out;
  }, SEL);
  for (const r of rows) {
    if (r.why) console.log(`${path}  ${r.t || "(字なし)"}  見た目 ${r.box[0]}x${r.box[1]}  当たり 測れず（${r.why}）`);
    else console.log(`${path}  ${r.t}  見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit[0]}x${r.hit[1]}`);
  }
}
await b.close();
