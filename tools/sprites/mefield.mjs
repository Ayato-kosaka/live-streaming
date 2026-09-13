/**
 * `/me` の見本（`mefootpage.mjs` が組む `mefoot.html`）に並ぶ**書く欄**を、
 * 1つずつ測る。
 *
 *   tools/build.sh 3210
 *   node tools/sprites/mefootpage.mjs 3210
 *   python3 -m http.server 4210 --directory site/.next-3210 &
 *   SPORT=4210 TAG=after node tools/sprites/mefield.mjs
 *
 * 出るもの（/tmp/mefield/<TAG>/）:
 *   w360-<区画>.png … 書く欄を持つ紙ごとの切り出し（dpr 3）
 *   field.json      … 下の measure() が返した数
 *
 * **なぜ `mefoot.mjs` と分けたか。** あちらは足元（`.mp-note-foot`）だけを
 * 見に行く道具で、欄は「行の背が伸びていないか」の材料にしか出てこない。
 * 欄そのものが島の見た目から外れているかどうかは、あちらの数字には出ない。
 *
 * 測るのは4つ:
 *   1. **字**。`font-family` の先頭が島の丸ゴシックか。ブラウザ既定の
 *      システムフォント（`-apple-system` / `system-ui` / `Arial`…）が
 *      1つでも混ざっていたら、そこは島の外にいる
 *   2. **地**。`background-color` が白（`rgb(255,255,255)`）でないか。
 *      白い箱は、素の `<input>` `<select>` がそのまま出ている印
 *   3. **押しどころの高さ**。見た目の箱ではなく、中心から上下へ1pxずつ
 *      伸ばして `elementFromPoint` が自分を返すかで測る（`hitbox.mjs` と同じ）。
 *      `docs/island-design.md` 3-2 の 48px を割ったら否
 *   4. **横あふれ**。`documentElement.scrollWidth > clientWidth`（#72）。
 *      `<select>` は中の字で幅が決まるので、**いちばん長い段の名前を
 *      選んだ状態**を見本に入れてある（`mefootpage.mjs`）
 *
 * 字の濃さは `inkpx.py` に渡す形（`/tmp/ink/<TAG>/_mefield.*`）でも書き出す。
 *
 *   SPORT=4210 TAG=after node tools/sprites/mefield.mjs
 *   python3 tools/sprites/inkpx.py after _mefield
 *
 * **`inkpx.mjs` は欄の中の字を測れない。** あちらは文字ノードを辿るので、
 * 閉じた `<select>` の中の `<option>`（箱が 0x0）と、文字ノードですらない
 * placeholder が、どちらも拾われずに落ちる。欄を直したのに欄の中の字だけ
 * 測っていない、という穴が開く。ここで欄そのものを1箱として撮って渡す。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.SPORT || "4210";
const TAG = process.env.TAG || "now";
const DPR = Number(process.env.DPR || 3);
const OUT = `/tmp/mefield/${TAG}`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const measure = () => {
  const px = (n) => Math.round(n * 100) / 100;
  /* 島の字。**並びの先頭だけを見る。**
     島の字は `"Maru Island", system-ui, …, sans-serif` と、最後に必ず
     ブラウザの既定を控えに置いている。並び全体で探すと、正しく島の字が
     当たっている欄まで「システムの字」と出て、28件が否になった（実際に出た）。
     素の `<input>` は先頭がいきなり `Arial` なので、先頭で分かる。 */
  const SYS = /^(system-ui|-apple-system|BlinkMac|Segoe|Arial|Helvetica|sans-serif|serif|monospace)$/i;

  const hit = (el) => {
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
    const mine = (x, y) => {
      const e = document.elementFromPoint(x, y);
      return e === el || el.contains(e);
    };
    if (!mine(cx, cy)) return null;
    let up = 0;
    while (up < 200 && cy - up - 1 >= 0 && mine(cx, cy - up - 1)) up++;
    let down = 0;
    while (down < 200 && cy + down + 1 < innerHeight && mine(cx, cy + down + 1)) down++;
    return up + down + 1;
  };

  const fields = [...document.querySelectorAll("input, select, textarea")]
    // 隠してある file の欄（`.nph-post-file`）は指で押すものではない
    .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed")
    .map((el) => {
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      const r = el.getBoundingClientRect();
      return {
        panel: el.closest("section")?.id || "",
        list: el.closest("ul")?.id || "",
        what: `${el.tagName.toLowerCase()}${el.className ? "." + el.className.split(/\s+/).join(".") : ""}`,
        label: (el.closest("label")?.querySelector("span")?.textContent || "").trim(),
        /* 台（`.dform`）の上に乗っているか。
           **`.nph-post-row` は台の上でしか成り立たない**（添えの字を上に積むのも、
           欄を彫るのもあちらの規則）。台の外にいたらそれだけで否。
           `.bin`（付箋の返事）は台を要らない欄なので、ここでは数えない。 */
        needsForm: !!el.closest(".nph-post-row"),
        onForm: !!el.closest(".dform"),
        font: fam,
        sysFont: SYS.test(fam),
        bg: cs.backgroundColor,
        white: /^rgba?\(255,\s*255,\s*255/.test(cs.backgroundColor),
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderTopLeftRadius,
        boxH: px(r.height),
        boxW: px(r.width),
        hitH: hit(el),
      };
    });

  const de = document.documentElement;
  return {
    w: window.innerWidth,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    over: de.scrollWidth - de.clientWidth,
    fields,
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
  for (const id of ["s-donor", "s-care"]) {
    await p.locator(`#${id}`).screenshot({ path: `${OUT}/w${W}-${id}.png` }).catch(() => {});
  }
  // 企画の行だけの寄り。**隣の付箋の返事（`.bin`）と並べて撮る。**
  // 同じ面で欄の顔が揃っているかは、1件だけ切り出しても分からない。
  await p.locator("#u-careplan").screenshot({ path: `${OUT}/w${W}-careplan.png` }).catch(() => {});

  /* 欄の中の字の濃さ。2枚撮って差を見る（`inkpx.py` に渡す）。
     測るのは 360 のときだけ。狭いほうが地も字も同じで、2幅ぶん撮っても
     同じ数が2回出るだけ。 */
  if (W === 360) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
    const boxes = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("input, select, textarea")) {
        if (el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        out.push({
          t: (el.tagName === "SELECT" ? el.value : el.value || el.placeholder || "").slice(0, 24),
          c: el.className || el.tagName.toLowerCase(),
          tag: el.tagName,
          color: cs.color,
          opacity: cs.opacity,
          size: cs.fontSize,
          x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
        });
      }
      return out;
    });
    mkdirSync(`/tmp/ink/${TAG}`, { recursive: true });
    await p.screenshot({ path: `/tmp/ink/${TAG}/_mefield.shot.png`, fullPage: true });
    /* 字だけ消す。**欄は `visibility` で消さない。** 消すと地（彫った溝）まで
       消えて、字が乗っている地を取り違える。色だけ透明にする。
       placeholder は文字ノードではないので、規則のほうで透明にする。 */
    await p.addStyleTag({
      content:
        "input,select,textarea{color:transparent !important;text-shadow:none !important}" +
        "input::placeholder,textarea::placeholder{color:transparent !important}",
    });
    await p.waitForTimeout(200);
    await p.screenshot({ path: `/tmp/ink/${TAG}/_mefield.bg.png`, fullPage: true });
    writeFileSync(`/tmp/ink/${TAG}/_mefield.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  }
  await ctx.close();
}
writeFileSync(`${OUT}/field.json`, JSON.stringify(report, null, 1));
await b.close();

let bad = 0;
for (const W of [360, 390]) {
  const r = report[W];
  console.log(`\n=== ${W}px ===  横あふれ ${r.over}px (scrollW ${r.scrollW} / clientW ${r.clientW})`);
  if (r.over > 0) bad++;
  for (const f of r.fields) {
    const ng = [
      f.sysFont ? "システムの字" : null,
      f.white ? "白い箱" : null,
      f.needsForm && !f.onForm ? "台の外（.nph-post-row なのに .dform が無い）" : null,
      f.hitH === null || f.hitH < 48 ? `押しどころ ${f.hitH}px` : null,
    ].filter(Boolean);
    if (ng.length) bad++;
    console.log(
      `  [${f.panel}/${f.list}] ${f.what}  「${f.label}」\n` +
        `      字 ${f.font}  地 ${f.bg}  枠 ${f.border}  角 ${f.radius}\n` +
        `      箱 ${f.boxW}x${f.boxH}  当たり ${f.hitH}px  ${ng.length ? "✗ " + ng.join(" / ") : "○"}`,
    );
  }
}
console.log(`\n否 ${bad}`);
process.exit(bad ? 1 : 0);
