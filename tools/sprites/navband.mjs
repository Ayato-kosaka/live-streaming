/**
 * **頭のバー（`.ih`）を、幅ごとに撮って数える。**
 *
 *   SPORT=5600 node navband.mjs                    # 7幅ぜんぶ
 *   SPORT=5600 TAG=after node navband.mjs          # 直したあとを別の場所に置く
 *   SPORT=5600 PROBE=1 node navband.mjs            # 数え方が届くかの自己確認だけ
 *   SPORT=5600 W=820 node navband.mjs              # 1幅だけ
 *
 * なぜ要るか。820px（タブレットの縦）で頭のバーを見ると「あやと島」1枚しか
 * 無くて、帯の 83% が空のまま 69px ぶん場所を取っていた。1440 では同じ帯に
 * 7つ並ぶ。**どちらが正しいのかは、まず「島の入口がどこに出ているか」を
 * 数えないと決まらない**（`docs/island-misses.md` #72「壊れていると読んだものが、
 * 3回とも測り方の間違いだった」）。
 *
 * 数えるもの:
 *
 *  1. **帯の埋まり具合（字と札）** … 帯の中の**札**（`.ih-home` `.ih-link` `.ih-me`）と
 *     **描かれた字**（テキストノードの行の箱）を、**横の軸で重ね合わせて**、
 *     画面の幅のどれだけを占めるか。面積ではなく横幅で見るのは、帯が1段の行で、
 *     空いて見えるのが**横の余り**だから。
 *
 *     **入れ物の箱では測らない。** `.ih-here` は `flex: 1 1 0` なので、
 *     「いま 水餃子」の7文字しか無くても**箱は帯の残り全部**を取る。
 *     子の箱を足すと 820px で「96% 埋まっている」と出る。埋まっているのは
 *     箱で、見えているのは木の地のままなので、**直っていないものが直って見える**
 *     （`pcsweep.mjs` が同じ形で4回はまっている。`docs/island-misses.md` #72）。
 *
 *     **`.ih-in`（max-width 1080 の内側）ではなく画面の幅で割る。**
 *     内側で割ると、1920 では「内側の 1080 を 100% 使っています」と出て、
 *     左右に 420px ずつ空いているのが数から消える。
 *  2. **島の入口（`SPOTS` の6つ）が、どこに何個出ているか** … 頭の帯の中 /
 *     画面に貼りついた下のバー / 紙の足元 / それ以外。
 *     **見えていて、押せる大きさのあるものだけ**を数える。
 *  3. **押しどころ** … 中心から1pxずつ外へ伸ばして `elementFromPoint` が
 *     まだ自分を返すかで測る（`hitbox.mjs` と同じやり方。見た目の箱では測らない）。
 *  4. 横あふれ … `documentElement.scrollWidth > clientWidth`。
 *     `getBoundingClientRect` では見ない（SVG の中の `<path>` が外へ出ていても
 *     ページは横に動かない）。
 *
 * 撮るもの:
 *   /tmp/navband/<TAG>/<幅>-band.png   帯だけ（上から帯の高さ+16px）
 *   /tmp/navband/<TAG>/<幅>-where.png  入口に赤い枠を描いた全面（どこにあるかを絵で示す）
 *   /tmp/navband/<TAG>/<幅>.json
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";

const SPORT = process.env.SPORT || "5600";
const PAGE = process.env.PAGE || "/kitchen/gyoza";
const TAG = process.env.TAG || "before";
const OUT = `/tmp/navband/${TAG}`;
const WIDTHS = (process.env.W || "390,600,820,898,900,1200,1920").split(",").map(Number);
mkdirSync(OUT, { recursive: true });

/** 看板を出す6つ（`site/components/island/layout.ts` の `SPOTS`）と、島そのもの。
    **島（`/`）を入れておく。** 「島の入口へ行く道があるか」は、6軒へ行けるかと、
    島そのものへ戻れるかの両方。帯から札が消える幅では、戻り道のほうが先に効く。 */
const SIGNS = [
  ["/", "島じたい"],
  ["/about", "あやとのこと"],
  ["/streams", "配信"],
  ["/apps", "アプリ"],
  ["/next", "これから"],
  ["/board", "企画をだす"],
  ["/map", "歩いた国"],
];

/** 仕込み。**数え方が届いているかを毎回出す**（`docs/island-misses.md` #19）。
    帯の中に幅 200px の赤い板を1枚足して、
      ・帯の埋まり具合が 200px ぶん増えるか
      ・入口の数え方が「頭の帯」として1つ増やすか
    を見る。挙がらなければ、この道具の 0件 は「無い」ではなく「届いていない」。 */
const PROBE = `(() => {
  const bar = document.querySelector(".ih .ih-in");
  if (!bar) return { ok: false, why: ".ih-in が無い" };
  const a = document.createElement("a");
  a.href = "/about";
  a.id = "navprobe";
  a.className = "ih-link";   // 「札」として数えられるか（数え方は札の種類で拾っている）
  a.textContent = "しかけ";
  a.style.cssText = "display:inline-flex;align-items:center;width:200px;height:48px;background:#c00;color:#fff";
  bar.appendChild(a);
  return { ok: true };
})()`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const rows = [];
for (const W of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 2, // 字を読める絵にする。dpr1 だと帯の札が潰れて見分けられない
    // 900 未満はタブレットの縦・半分にした窓。指で触る幅なのでそちらに寄せる
    isMobile: W < 900,
    hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  /* 2回目以降に来た人の画面で測る。初回の案内（5.6秒で消える）が出ていると、
     その下の中身が動く（`inkpx.mjs` と同じ鍵）。 */
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}${PAGE === "/" ? "/index" : PAGE}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.waitForTimeout(700);
  // 足元まで送ってから戻す。畳み（content-visibility）は送らないと 68px のまま
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let i = 0, y = 0; i < 60 && y < h; i++, y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);

  let probe = null;
  if (process.env.PROBE) probe = await p.evaluate(PROBE);

  const info = await p.evaluate((SIGNS) => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const vis = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    };

    // ---- 1. 帯の埋まり具合 -------------------------------------------------
    const bar = document.querySelector(".ih");
    let band = null;
    if (bar) {
      const br = bar.getBoundingClientRect();
      const inner = bar.querySelector(".ih-in") || bar;
      /* **札**（押せる板と丸）と**描かれた字**だけを数える。
         入れ物（`.ih-in` `.ih-nav` `.ih-here`）の箱は数えない。 */
      const kids = [];
      for (const el of bar.querySelectorAll(".ih-home, .ih-link, .ih-me")) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        kids.push({ t: "札:" + (el.className.split(/\s+/)[0]), x: Math.round(r.left), w: Math.round(r.width) });
      }
      // 字。**要素の箱ではなく、行の箱**（`pcsweep.mjs` と同じ理由）
      const walk = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const txt = (n.textContent || "").trim();
        if (!txt) continue;
        const el = n.parentElement;
        if (!el || !vis(el)) continue;
        // 読み上げ用に clip で隠してある字（狭い画面の「あやと島」）は、見えていない
        const cs = getComputedStyle(el);
        if (cs.clipPath && cs.clipPath !== "none") continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width < 1 || q.height < 1) continue;
          kids.push({ t: "字:" + txt.slice(0, 6), x: Math.round(q.left), w: Math.round(q.width) });
        }
        rg.detach?.();
      }
      // 横の軸で重ね合わせる（重なっても二重に数えない）
      const segs = kids
        .map((k) => [Math.max(0, k.x), Math.min(vw, k.x + k.w)])
        .filter(([a, b2]) => b2 > a)
        .sort((a, b2) => a[0] - b2[0]);
      let filled = 0, cur = null;
      for (const s of segs) {
        if (!cur || s[0] > cur[1]) { if (cur) filled += cur[1] - cur[0]; cur = [...s]; }
        else cur[1] = Math.max(cur[1], s[1]);
      }
      if (cur) filled += cur[1] - cur[0];
      band = {
        h: Math.round(br.height),
        sticky: ["fixed", "sticky"].includes(getComputedStyle(bar).position),
        filled,
        vw,
        pct: +((filled / vw) * 100).toFixed(1),
        kids,
      };
    }

    // ---- 2. 島の入口が、どこに何個 -----------------------------------------
    const stuck = (el) => {
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const q = getComputedStyle(a).position;
        if (q === "fixed" || q === "sticky") return true;
      }
      return false;
    };
    const doors = [];
    for (const [href, label] of SIGNS) {
      const found = [];
      for (const a of document.querySelectorAll(`a[href="${href}"]`)) {
        if (!vis(a)) continue;
        const r = a.getBoundingClientRect();
        const y = Math.round(r.top + window.scrollY);
        let where = "本文";
        if (a.closest(".ih")) where = "頭の帯";
        else if (a.closest("footer,.ifoot")) where = "足元";
        else if (stuck(a)) where = r.top < innerHeight / 2 ? "頭に貼りつき" : "下に貼りつき";
        found.push({ where, y, box: [Math.round(r.width), Math.round(r.height)] });
      }
      doors.push({ href, label, found });
    }

    // ---- 3. 押しどころ（中心から伸ばす） -----------------------------------
    const nm = (e) => (e ? e.tagName + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/)[0] : "") : "なし");
    const hitOf = (el) => {
      el.scrollIntoView({ block: "center" });
      const lines = [...el.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
      const r = el.getBoundingClientRect();
      const box = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight)
        return { why: "画面の外（送っても入らない）", box: [Math.round(r.width), Math.round(r.height)] };
      const hits = (x, y) => {
        const e = document.elementFromPoint(x, y);
        return e && (e === el || el.contains(e) || e.closest?.("a,button,label") === el);
      };
      if (!hits(cx, cy))
        return { why: `${nm(document.elementFromPoint(cx, cy))} が上にいる`, box: [Math.round(r.width), Math.round(r.height)] };
      const grow = (dx, dy) => { let n = 0; while (n < 60 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
      const l = grow(-1, 0), rr = grow(1, 0), u = grow(0, -1), dn = grow(0, 1);
      return { hit: [l + rr + 1, u + dn + 1], box: [Math.round(r.width), Math.round(r.height)] };
    };
    const hits = [];
    for (const [href, label] of SIGNS) {
      for (const a of document.querySelectorAll(`a[href="${href}"]`)) {
        if (!vis(a)) continue;
        const where = a.closest(".ih") ? "頭の帯" : a.closest("footer,.ifoot") ? "足元" : stuck(a) ? "貼りつき" : "本文";
        hits.push({ label, where, ...hitOf(a) });
      }
    }
    window.scrollTo(0, 0);

    // ---- 4. 横あふれ --------------------------------------------------------
    const over = de.scrollWidth - de.clientWidth;

    return { band, doors, hits, over, vw, height: Math.round(de.scrollHeight) };
  }, SIGNS);

  // ---- 撮る ----------------------------------------------------------------
  const bandH = info.band ? info.band.h : 80;
  await p.screenshot({ path: `${OUT}/${W}-band.png`, clip: { x: 0, y: 0, width: W, height: Math.min(900, bandH + 16) } });
  // 入口に赤い枠。**どこにあるかを絵で示す**ため
  await p.evaluate((SIGNS) => {
    for (const [href] of SIGNS)
      for (const a of document.querySelectorAll(`a[href="${href}"]`))
        a.style.outline = "3px solid #e01b1b";
  }, SIGNS);
  await p.screenshot({ path: `${OUT}/${W}-where.png`, fullPage: true });

  rows.push({ W, probe, ...info });
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/all.json`, JSON.stringify(rows, null, 1));

console.log(`${PAGE} — 幅ごとの頭のバー（${TAG}）`);
console.log("| 幅 | 帯の高さ | 貼りつき | 帯の埋まり | 空き | 頭の帯の入口 | 足元の入口 | 入口の最小当たり | 横あふれ |");
console.log("| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: |");
for (const r of rows) {
  const head = r.doors.reduce((n, d) => n + d.found.filter((f) => f.where === "頭の帯" || f.where === "頭に貼りつき").length, 0);
  const foot = r.doors.reduce((n, d) => n + d.found.filter((f) => f.where === "足元" || f.where === "下に貼りつき").length, 0);
  const none = r.doors.filter((d) => d.found.length === 0).map((d) => d.label);
  const sized = r.hits.filter((h) => h.hit);
  const minHit = sized.length ? Math.min(...sized.map((h) => Math.min(h.hit[0], h.hit[1]))) : "—";
  const bad = r.hits.filter((h) => h.why);
  console.log(
    `| ${r.W} | ${r.band ? r.band.h : "—"} | ${r.band && r.band.sticky ? "する" : "しない"} | ${r.band ? r.band.filled + "px(" + r.band.pct + "%)" : "—"} | ${r.band ? (100 - r.band.pct).toFixed(1) + "%" : "—"} | ${head} | ${foot} | ${minHit}px${bad.length ? "（測れず" + bad.length + "）" : ""} | ${r.over > 1 ? "+" + r.over : "0"} |`,
  );
  if (none.length) console.log(`     !! ${r.W}px でどこにも出ていない入口: ${none.join(" ")}`);
  if (bad.length) console.log(`     測れず: ${bad.map((h) => `${h.label}(${h.where}: ${h.why})`).join(" / ")}`);
}
console.log("\n帯の中身（札と、描かれた字）:");
for (const r of rows) {
  if (!r.band) { console.log(`  ${r.W}px  帯なし`); continue; }
  const plates = r.band.kids.filter((k) => k.t.startsWith("札:"));
  const ink = r.band.kids.filter((k) => k.t.startsWith("字:"));
  console.log(
    `  ${r.W}px  札 ${plates.length}枚(${plates.map((k) => k.w).join("+")}px)  字 ${ink.length}かたまり(${ink.reduce((n, k) => n + k.w, 0)}px) ${ink.map((k) => k.t.slice(2)).join("/") || "なし"}`,
  );
}
if (process.env.PROBE) {
  console.log("\n仕込みの確認（帯に幅200pxの赤い板を1枚足した）:");
  for (const r of rows) {
    const got = r.band ? r.band.kids.find((k) => k.w >= 195 && k.w <= 205) : null;
    const counted = r.doors.find((d) => d.href === "/about")?.found.filter((f) => f.where === "頭の帯").length || 0;
    console.log(`  ${r.W}px  仕込み ${r.probe?.ok ? "置けた" : "置けず(" + (r.probe?.why || "?") + ")"}  帯の埋まりに出た ${got ? "はい" : "いいえ"}  頭の帯の「あやとのこと」${counted}個`);
  }
  console.log("  ※ 全幅で「置けた／はい／1個以上」なら、帯の埋まりと入口の数え方はどちらも届いている");
}
