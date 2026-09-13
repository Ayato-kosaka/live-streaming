/**
 * 公開している全面の**字の濃さ**を、PC の幅で測る（3本目。撮るほう）。
 *
 *   SPORT=5400 node pcink.mjs                      # 既定 1440 と 390（比べる用）
 *   SPORT=5400 WIDTHS=1920x1080 node pcink.mjs
 *   SPORT=5400 PROBE=1 LIST=… node pcink.mjs       # 仕込みが挙がるかの自己確認
 *
 * やり方は `inkpx.mjs` と同じ。**計算値ではなく描かれた画素から測る。**
 * 1枚そのまま撮り、2枚目は字だけ透明にして撮り、差の出た画素を「字」とする。
 * 縁取りも影も字といっしょに消すので、比を水増ししない。
 *
 * `inkpx.mjs` との違いは3つ:
 *   - 面を手で渡すのではなく、109面を回る
 *   - 撮った2枚を**その場で読んで、すぐ消す**（dpr2 の全面の絵を109面ぶん
 *     残すと箱の空きが尽きる）。読むのは `pcink.py`
 *   - **幅ごとに突き合わせて「PC 幅でだけ薄くなるもの」を出す**
 *
 * **dpr は 2 以上で撮る。** dpr1 だと同じ字が 7.02、dpr2 だと 9.25 と、2〜3割低く出る。
 * **合否は中央値で決める。下位10%で決めない**（にじみの画素を測ることになる）。
 *
 * **「幅を変えたら薄くなった」が出たら、まずそれを疑う。**
 * 2026-09-13 にこの道具は、島（`/`）の 1920 で**45か所が新しく 4.5 を割った**と言った。
 * 嘘だった。同じ字の `color` も `opacity` も `font-size` も、その下の地の積み重ねも、
 * 390 / 820 / 1440 / 1920 で**1バイトも違わなかった**（ページの高さまで同じ 4342）。
 * 2枚撮って差を見る作りなので、**2枚のあいだに動くものがあると差が字ではなくなる。**
 * 島は rAF で動くので止めてあるが、それでも揃わない回がある。
 * 階調（`linear-gradient` / `radial-gradient`）の上の字も、
 * 場所が1pxずれるだけで地の色が変わって比が動く。
 * **幅を変えて数が増えたら、まず「その字の色と地が幅で変わっているか」を直に見る。**
 * 変わっていなければ、変わったのは測り方のほう（`docs/island-misses.md` #72）。
 *
 * **これは重い。1面 20〜30秒、109面×4幅で2時間半かかる。**
 * dpr2 の全面の絵を2枚撮って、numpy で1億画素を読むため。
 * **他の重い仕事と同時に回さない。** `pcsweep` と `pchit` と3本並べたら
 * 1面1分半（4倍）まで落ちた。幅は**比べたい順に並べる**——
 * 途中で止めても、先に回した幅は json に残る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { execFileSync } from "child_process";

const SPORT = process.env.SPORT || "5400";
const OUT = process.env.OUT || "/tmp/pcink";
const DPR = Number(process.env.DPR || 2);
const LIM = Number(process.env.LIM || 4.5);
const WIDTHS = (process.env.WIDTHS || "1440x900,390x844")
  .split(",").map((s) => s.split("x").map(Number));
const PAGES = (process.env.PAGES ? process.env.PAGES.split(",") :
  (await import("fs")).readFileSync(
    process.env.LIST || "/home/user/live-streaming/tools/sprites/pcpages.txt", "utf8",
  ).split("\n")).map((s) => s.trim()).filter(Boolean);

/** 仕込み。**地に溶ける字を1つ置く。挙がらなければ数え方が届いていない。**
    合格するほうも1つ置いて、**正しい字を落とさない**ことまで見る。 */
const PROBE = `(() => {
  const d = document.createElement("div");
  d.style.cssText = "position:static;background:#ffffff;padding:8px";
  d.innerHTML =
    '<p class="pcinkprobe-bad" style="color:#eeeeee;font-size:16px;text-shadow:none">うすいじ</p>' +
    '<p class="pcinkprobe-ok" style="color:#111111;font-size:16px;text-shadow:none">こいじ</p>';
  document.body.insertBefore(d, document.body.firstChild);
})()`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const byWidth = new Map();
for (const [W, H] of WIDTHS) {
  const dir = `${OUT}/${W}`;
  mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: DPR,
    isMobile: W < 900, hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  /* 2枚のあいだに動くものがあると、差が嘘になる。歩きかたの案内は 5.6 秒で
     消えるので、2回目以降に来た人として開く（`inkpx.mjs` と同じ鍵）。 */
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  const rows = [];
  for (const path of PAGES) {
    const name = path === "/" ? "_index" : path.replace(/\//g, "_");
    const base = `${dir}/${name}`;
    try {
      await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`,
        { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      rows.push({ path, measured: false, why: String(e).slice(0, 100) });
      console.log(`測れず ${W} ${path}`);
      continue;
    }
    await p.waitForTimeout(900);
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(900);
    if (process.env.PROBE) await p.evaluate(PROBE);
    /* **島を止めてから撮る。** 2枚のあいだに住人が歩きカメラが寄ると、
       差分に字と関係ない画素が混ざる。CSS の animation を止めるだけでは
       足りない。島は rAF で動くので rAF ごと止める。 */
    await p.evaluate(() => {
      window.requestAnimationFrame = () => 0;
      const st = document.createElement("style");
      st.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}";
      document.head.appendChild(st);
    });
    await p.waitForTimeout(400);

    const boxes = await p.evaluate(() => {
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const t = (n.textContent || "").trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        // 親が透明なものは画面に出ていない。自分だけ見ても分からないので上まで見る
        if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true,
          checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        // 畳んである中身は overflow:hidden で切られているだけで箱は残る。
        // そのまま測ると、画面に出ていない字を拾う
        let clipped = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ac = getComputedStyle(a);
          if (ac.overflow === "visible" && ac.overflowY === "visible" && ac.overflowX === "visible") continue;
          const ar = a.getBoundingClientRect();
          if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) { clipped = true; break; }
        }
        if (clipped) continue;
        const svg = el.ownerSVGElement != null || el.tagName === "text";
        out.push({
          t: t.slice(0, 24),
          c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
          tag: el.tagName, color: svg ? cs.fill : cs.color,
          opacity: cs.opacity, size: cs.fontSize,
          x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
        });
        el.setAttribute("data-inkmark", String(out.length - 1));
      }
      return out;
    });

    try {
      await p.screenshot({ path: `${base}.shot.png`, fullPage: true });
      await p.evaluate(() => {
        for (const el of document.querySelectorAll("[data-inkmark]")) {
          el.style.setProperty("color", "transparent", "important");
          el.style.setProperty("text-shadow", "none", "important");
          el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
          // fill / stroke は SVG の字にだけ。ふつうの要素に掛けると中の図まで消える
          if (el.ownerSVGElement || el.tagName === "text") {
            el.style.setProperty("fill", "transparent", "important");
            el.style.setProperty("stroke", "transparent", "important");
          }
        }
      });
      await p.screenshot({ path: `${base}.bg.png`, fullPage: true });
    } catch (e) {
      rows.push({ path, measured: false, why: "撮れず: " + String(e).slice(0, 90) });
      console.log(`撮れず ${W} ${path}  ${String(e).slice(0, 70)}`);
      continue;
    }
    writeFileSync(`${base}.json`, JSON.stringify({ dpr: DPR, boxes }));

    let res;
    try {
      res = JSON.parse(execFileSync("python3",
        ["/home/user/live-streaming/tools/sprites/pcink.py", base, String(LIM)],
        { encoding: "utf8", maxBuffer: 1 << 26 }));
    } catch (e) {
      rows.push({ path, measured: false, why: "読めず: " + String(e).slice(0, 90) });
      console.log(`読めず ${W} ${path}`);
      continue;
    } finally {
      // dpr2 の全面の絵を109面ぶん残すと箱の空きが尽きる。読んだら消す
      for (const f of [`${base}.shot.png`, `${base}.bg.png`]) if (existsSync(f)) unlinkSync(f);
    }
    rows.push({ path, measured: true, ...res });
    console.log(`${W} ${path}  字${res.n}か所  ${LIM}割れ ${res.bad.length}`);
  }
  writeFileSync(`${OUT}/${W}.json`, JSON.stringify(rows, null, 1));
  byWidth.set(W, rows);
  await ctx.close();
}
await b.close();

console.log("\n===== まとめ =====");
for (const [W, rows] of byWidth) {
  const ok = rows.filter((r) => r.measured);
  const spots = ok.reduce((a, r) => a + r.n, 0);
  const bad = ok.reduce((a, r) => a + r.bad.length, 0);
  console.log(`幅 ${W}: 測れた ${ok.length}/${rows.length}面  字 ${spots}か所  ${LIM}割れ ${bad}か所（${ok.filter((r) => r.bad.length).length}面）`);
}
const base = byWidth.get(390);
if (base) {
  const key = (path, s) => `${path} ${s.c} ${s.t}`;
  const b390 = new Set();
  for (const r of base) if (r.measured) for (const s of r.bad) b390.add(key(r.path, s));
  for (const [W, rows] of byWidth) {
    if (W === 390) continue;
    const only = [];
    for (const r of rows) if (r.measured) for (const s of r.bad) if (!b390.has(key(r.path, s))) only.push([r.path, s]);
    console.log(`\n幅 ${W} で**新しく** ${LIM} を割ったもの（390 では通っていた）: ${only.length}か所`);
    for (const [path, s] of only.slice(0, 40))
      console.log(`   ${path}  ${s.c}「${s.t}」 中央 ${s.mid} 暗地 ${s.lo} ${s.size}`);
    if (only.length > 40) console.log(`   … ほか ${only.length - 40}か所（json に全部）`);
  }
}
if (process.env.PROBE) {
  let bad = 0, miss = 0, wrong = 0;
  for (const [, rows] of byWidth) for (const r of rows) {
    if (!r.measured) continue;
    if (r.bad.some((s) => s.c.includes("pcinkprobe-bad"))) bad++; else miss++;
    if (r.bad.some((s) => s.c.includes("pcinkprobe-ok"))) wrong++;
  }
  console.log(`\n仕込みの確認: 白地に #eee の字を「割れ」と挙げた ${bad} / 挙げそこねた ${miss}、白地に #111 を誤って挙げた ${wrong}`);
  console.log(`  ${miss === 0 && wrong === 0 ? "薄いほうだけ挙がった。数え方は届いている" : "!! 数え方が届いていない"}`);
}
