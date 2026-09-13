/**
 * 公開している全面の**押しどころ**を、PC の幅で測る（2本目）。
 *
 *   SPORT=5400 node pchit.mjs                  # 390(比べる用) + PC3幅
 *   SPORT=5400 WIDTHS=1440x900 node pchit.mjs
 *   SPORT=5400 PROBE=1 node pchit.mjs          # 仕込みが挙がるかの自己確認
 *
 * **見た目の箱（`getBoundingClientRect`）では測らない。**
 * `::after` で広げた当たり判定はそこに出ないし、隣に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして `elementFromPoint` がまだ自分を返すかで測る
 * （`hitbox.mjs` と同じやり方。あちらは面を手で渡す道具で、こちらは全面を回る）。
 *
 * `hitbox.mjs` が踏んだ穴を全部持ってくる（`docs/island-misses.md` #72 の2件目）。
 * 「当たり 1x1」は4種類が潰れたものだった:
 *   折り返した行内リンクの中心が行間に落ちる／隠した入力を label ではなく
 *   入力の箱で測る／送っても画面に入らない／閉じた畳みの中身。
 * どれも**押せないのではない**ので、理由を出して数から分ける。
 *
 * 出るもの: /tmp/pchit/<幅>.json と、画面に「48px を割った押しどころ」の一覧。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "fs";

const SPORT = process.env.SPORT || "5400";
const OUT = process.env.OUT || "/tmp/pchit";
const MIN = Number(process.env.MIN || 48);
const WIDTHS = (process.env.WIDTHS || "390x844,1440x900,1920x1080,820x1180")
  .split(",")
  .map((s) => s.split("x").map(Number));
const PAGES = readFileSync(
  process.env.LIST || "/home/user/live-streaming/tools/sprites/pcpages.txt",
  "utf8",
).split("\n").map((s) => s.trim()).filter(Boolean);

const SEL = 'a[href],button,[role="button"],input,select,textarea,summary,label,[tabindex]:not([tabindex="-1"])';

/** 仕込み。24x24 の押しどころを1つ置く。**挙がらなければ数え方が届いていない。** */
const PROBE = `(() => {
  const a = document.createElement("a");
  a.id = "pchitprobe"; a.href = "/"; a.textContent = "小";
  a.style.cssText = "position:static;display:block;width:24px;height:24px;font-size:9px;line-height:24px;overflow:hidden;background:#c00;color:#fff";
  document.body.insertBefore(a, document.body.firstChild);
  // 48x48 の合格するほうも1つ。**合格側が落ちない**ことまで見ないと、
  // 「全部小さい」と言う道具になっていても気づけない
  const g = document.createElement("a");
  g.id = "pchitprobe-ok"; g.href = "/"; g.textContent = "大";
  g.style.cssText = "position:static;display:block;width:60px;height:60px;font-size:9px;line-height:60px;overflow:hidden;background:#060;color:#fff";
  document.body.insertBefore(g, document.body.firstChild);
})()`;

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const byWidth = new Map();
for (const [W, H] of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: W < 900, hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  const rows = [];
  for (const path of PAGES) {
    const url = `http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`;
    try {
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      rows.push({ path, measured: false, why: String(e).slice(0, 100) });
      console.log(`測れず ${W} ${path}`);
      continue;
    }
    await p.waitForTimeout(700);
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(700);
    if (process.env.PROBE) await p.evaluate(PROBE);

    const got = await p.evaluate(({ SEL, MIN }) => {
      const nm = (e) => (e ? e.tagName + (e.className && typeof e.className === "string" ? "." + e.className.split(/\s+/)[0] : "") : "なし");
      const small = [], skipped = [];
      let n = 0;
      for (const el of document.querySelectorAll(SEL)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.disabled) continue;
        // label は「その入力の押しどころ」なので、入力側と二重に数えない。
        // 入力のほうを代表にして、label は入力から引く
        if (el.tagName === "LABEL") continue;

        // 押す先を先に決める。見た目を作り直したチェックボックスは <input> を
        // 脇へどけて <label> に絵を描く。入力の真ん中は当たらないが、指は label を押す
        let target = el;
        if (el.tagName === "INPUT" || el.tagName === "SELECT") {
          const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          const lb = byFor || el.closest("label");
          if (lb && (cs.opacity === "0" || cs.position === "absolute" || el.getBoundingClientRect().width < 4)) target = lb;
        }
        // 閉じた畳みの中は、押せなくて当たり前。**押す前に開く面なので数えない**
        const det = el.closest("details");
        if (det && !det.open && !det.querySelector("summary")?.contains(el)) continue;

        target.scrollIntoView({ block: "center" });
        const r = target.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        n++;

        // 始点は外接矩形の中心にしない。折り返した行内リンクの外接矩形の中心は
        // 行と行のすきまに落ちる。行ごとの箱のうち、いちばん大きい行の中心を使う
        const lines = [...target.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        const box = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const t = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 14);

        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
          skipped.push({ t, why: "画面の外（送っても入らない）", box: [Math.round(r.width), Math.round(r.height)] });
          continue;
        }
        const hits = (x, y) => {
          const e = document.elementFromPoint(x, y);
          return e && (e === target || target.contains(e) || e.closest?.("a,button,label,summary") === target);
        };
        if (!hits(cx, cy)) {
          skipped.push({ t, why: `${nm(document.elementFromPoint(cx, cy))} が上にいる`, box: [Math.round(r.width), Math.round(r.height)] });
          continue;
        }
        const grow = (dx, dy) => { let k = 0; while (k < 80 && hits(cx + dx * (k + 1), cy + dy * (k + 1))) k++; return k; };
        const w = grow(-1, 0) + grow(1, 0) + 1, h = grow(0, -1) + grow(0, 1) + 1;
        if (w < MIN || h < MIN)
          small.push({ t, hit: [w, h], box: [Math.round(r.width), Math.round(r.height)], c: nm(el), href: el.getAttribute?.("href") || "" });
      }
      return { n, small, skipped };
    }, { SEL, MIN });

    rows.push({ path, measured: true, ...got });
    if (got.small.length || got.skipped.length)
      console.log(`${W} ${path}  押しどころ${got.n}  ${MIN}px割れ ${got.small.length}  測れず ${got.skipped.length}`);
  }
  writeFileSync(`${OUT}/${W}.json`, JSON.stringify(rows, null, 1));
  byWidth.set(W, rows);
  await ctx.close();
}
await b.close();

console.log("\n===== まとめ =====");
for (const [W, rows] of byWidth) {
  const ok = rows.filter((r) => r.measured);
  const tot = ok.reduce((a, r) => a + r.n, 0);
  const sm = ok.reduce((a, r) => a + r.small.length, 0);
  const sk = ok.reduce((a, r) => a + r.skipped.length, 0);
  const pages = ok.filter((r) => r.small.length).length;
  console.log(`幅 ${W}: 測れた ${ok.length}/${rows.length}面  押しどころ ${tot}個  ${MIN}px割れ ${sm}個（${pages}面）  測れず ${sk}個`);
}
/* **PC 幅でだけ小さいもの**を出す。390 で既に小さいものは「PC の問題」ではない。 */
const base = byWidth.get(390);
if (base) {
  const key = (r, s) => `${r.path} ${s.c} ${s.t} ${s.href}`;
  const b390 = new Set();
  for (const r of base) if (r.measured) for (const s of r.small) b390.add(key(r, s));
  for (const [W, rows] of byWidth) {
    if (W === 390) continue;
    const only = [];
    for (const r of rows) if (r.measured) for (const s of r.small) if (!b390.has(key(r, s))) only.push([r.path, s]);
    console.log(`\n幅 ${W} で**新しく** ${MIN}px を割ったもの: ${only.length}個`);
    for (const [path, s] of only.slice(0, 40))
      console.log(`   ${path}  ${s.c}  「${s.t || "(字なし)"}」  見た目 ${s.box[0]}x${s.box[1]}  当たり ${s.hit[0]}x${s.hit[1]}`);
    if (only.length > 40) console.log(`   … ほか ${only.length - 40}個（json に全部）`);
  }
}
if (process.env.PROBE) {
  let bad = 0, good = 0, miss = 0;
  for (const [, rows] of byWidth)
    for (const r of rows) {
      if (!r.measured) continue;
      if (r.small.some((s) => s.t === "小")) bad++; else miss++;
      if (r.small.some((s) => s.t === "大")) good++;
    }
  console.log(`\n仕込みの確認: 24x24 を「割れ」と挙げた ${bad} / 挙げそこねた ${miss}、60x60 を誤って挙げた ${good}`);
  console.log(`  ${miss === 0 && good === 0 ? "小さいほうだけ挙がった。数え方は届いている" : "!! 数え方が届いていない"}`);
}
