/**
 * 配信で使う3面を数える。**直さない。数えて絵を残すだけ。**
 *
 *   /roulette     … OBS に入れる表示。**視聴者さん全員が見る**
 *   /me/remote    … 島の遠隔操作。**配信中にあやとが片手で押す**
 *   /me/roulette  … ルーレットの操作。同上
 *
 *   tools/build.sh 3500
 *   python3 -m http.server 4500 --directory site/.next-3500 &
 *   SPORT=4500 node tools/sprites/livecheck.mjs
 *
 * 出るもの: /tmp/live/<場面>/w<幅>.png と /tmp/live/report.json
 *
 * ## 数えるもの
 *
 * 1. **島の外の顔** — ブラウザ既定のまま出ている `<input>` `<select>`
 *    `<textarea>` `<button>`。`.dform` の外に置かれた `.nph-post-row` が
 *    `/me` で実際に1件あった（`docs/island-misses.md` #77）。同じ形を探す
 * 2. **押しどころ 48px**（`docs/island-design.md` 3-2）。**見た目の箱では
 *    測らない。** 中心から1pxずつ外へ伸ばして `elementFromPoint` が
 *    まだ自分を返すかで測る（`hitbox.mjs` と同じ）
 * 3. **横あふれ** — `documentElement.scrollWidth > clientWidth`
 *    （`getBoundingClientRect` では見ない。`docs/island-misses.md` #72）
 * 4. 字の濃さは `inkpx.mjs` / `inkpx.py` と `livefield.mjs` が別に測る
 * 5. `/roulette` だけ — 背景が透けるか・動くものの外接矩形
 *
 * ## 数え方が当たっていることを、先に確かめる
 *
 * 「数え方が届いていない場所は、0件に見える」（#19）。だから**測る前に、
 * 素の `<input> <select> <textarea> <button>` を4つその面に仕込んで**、
 * 検出が4つとも拾うかを見る。拾えなければ、その回の「素の欄 0件」は
 * 信用しない（`canary` の行に出る）。仕込みは測ったあとに取り除く。
 *
 * このリポジトリの CSS には素の `input` / `button` を整える規則が1行も
 * 無い（`app/globals.css` に form の規則なし）ので、仕込んだ4つは
 * ブラウザ既定のまま出る。**それが検出できるかどうかの物差しになる。**
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";
import { apply as liveseed } from "./liveseed.mjs";

const PORT = process.env.SPORT || "4500";
const OUT = "/tmp/live";
const DPR = Number(process.env.DPR || 2);

/* 場面の表。`seed` が要るものだけ差し込む。**`/roulette` の2つは素で開く。**
   素で開けるならそれがいちばん本番に近い（`liveraw.mjs` で確かめた）。 */
const CAND = encodeURIComponent(
  "トビリシの温泉,ヒッチハイクで隣の国,24時間クッキング,視聴者の家に泊まる,深夜の市場めぐり,サウナ",
);
/* **いっぱいまで入れたところも撮る。**（`docs/island-standards.md` 7）
   コントローラーは 36 件で満杯（`content/roulette.ts` の `MAX_ITEMS`）。
   5〜6件でだけ撮ると、配信で実際に起きる「36件の輪」を見ずに通す。 */
const CAND36 = encodeURIComponent(
  Array.from({ length: 36 }, (_, i) => `候補${i + 1}のながい案`).join(","),
);
const SCENES = [
  { id: "rl-bare", url: "/roulette.html", seed: null, widths: [[1920, 1080], [1280, 720], [390, 844]] },
  { id: "rl-cand36", url: `/roulette.html?candidates=${CAND36}`, seed: null, widths: [[1920, 1080], [1280, 720]] },
  { id: "rl-cand", url: `/roulette.html?candidates=${CAND}`, seed: null, widths: [[1920, 1080], [1280, 720], [390, 844]] },
  { id: "rl-sess", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: {}, widths: [[1920, 1080], [1280, 720], [390, 844]] },
  /* 回っている**最中**。針の刻み（`rl-tick`）はここでしか動いていない */
  { id: "rl-mid", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: { spin: true }, wait: 7000, widths: [[1920, 1080]] },
  { id: "rl-spin", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: { spin: true }, wait: 19000, widths: [[1920, 1080], [1280, 720]] },
  { id: "me-remote", url: "/me/remote.html", seed: { admin: true }, open: true, widths: [[360, 844], [390, 844]] },
  { id: "me-roulette", url: "/me/roulette.html", seed: { admin: true }, open: true, widths: [[360, 844], [390, 844]] },
];

/* ------------------------------------------------------------------ */
/* 面の中で走らせるもの。**ブラウザの中なので、外の変数は使えない。**   */
/* ------------------------------------------------------------------ */

/**
 * 仕込み。**検出が届いているかの物差し**（`docs/island-misses.md` #19。
 * 数え方が届いていない場所は、数えていないだけで「0件」に見える）。
 *
 * 6つ入れる。
 *
 *   1〜4 … 素の `<input> <select> <textarea> <button>`
 *   5   … `.nph-post-row` を `.dform` の**外**に置いたもの。
 *          `/me` の `OwnerCare.tsx` で実際に起きていた形そのまま（#77）
 *   6   … 20x20 の押しどころ。48px の物差しが効いているか
 *
 * **素の `<button>` だけは、既定の顔にならない。**
 * `app/css/tokens.css` 564行に `button { font: inherit; color: inherit;
 * background: none; border: 0; cursor: pointer }` があって、島じゅうの
 * ボタンをそこで丸裸に戻している。つまり「ブラウザ既定のボタン」は
 * この島には出得ない。かわりに**その reset のまま板になっていない**
 * ボタン（地も枠も厚みも無い）を数える枝を1本足してある。
 * 仕込みの 4 が拾えないのは正しい（拾えたら CSS が当たっていない印）。
 */
const CANARY = () => {
  const d = document.createElement("div");
  d.id = "live-canary";
  d.style.cssText = "position:absolute;left:0;top:0;z-index:99999;opacity:1";
  d.innerHTML =
    '<input placeholder="素の入力"><select><option>素の選び</option></select>' +
    "<textarea>素の書き込み</textarea><button>素の押しどころ</button>" +
    '<label class="nph-post-row"><span>台の外</span><input placeholder="台の外の欄"></label>' +
    '<button style="width:20px;height:20px;padding:0;overflow:hidden">小</button>';
  document.body.appendChild(d);
};
const UNCANARY = () => document.getElementById("live-canary")?.remove();

const MEASURE = () => {
  const px = (n) => Math.round(n * 100) / 100;
  const de = document.documentElement;

  /* --- 押しどころ。中心から1pxずつ外へ伸ばす（`hitbox.mjs` と同じ） --- */
  const hit = (el) => {
    let target = el;
    if (el.tagName === "INPUT") {
      const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      target = byFor || el.closest("label") || el;
    }
    target.scrollIntoView({ block: "center" });
    const r = target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { why: "箱が 0" };
    /* 折り返した行内リンクの外接矩形の中心は、行と行のすきまに落ちる。
       いちばん大きい行の箱の中心を使う（`hitbox.mjs` の注）。 */
    const lines = [...target.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    const box = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return { why: "画面の外（送っても入らない）" };
    const mine = (x, y) => {
      const e = document.elementFromPoint(x, y);
      return !!e && (e === target || target.contains(e) || e.closest?.("a,button,label") === target);
    };
    if (!mine(cx, cy)) {
      const top = document.elementFromPoint(cx, cy);
      const nm = top ? top.tagName + (typeof top.className === "string" && top.className ? "." + top.className.split(/\s+/)[0] : "") : "なし";
      return { why: `${nm} が上にいる` };
    }
    /* 伸ばす上限。48px を見るだけなら 60 で足りるが、`/roulette` の台は
       760px あるので、低い上限のままだと「当たり 161x161」と出て
       **打ち切った数を実寸として読む**ことになる。打ち切ったら印を付ける。 */
    const CAP = 200;
    const grow = (dx, dy) => { let n = 0; while (n < CAP && mine(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    const l = grow(-1, 0), rr = grow(1, 0), u = grow(0, -1), dn = grow(0, 1);
    return { w: l + rr + 1, h: u + dn + 1, capped: l === CAP || rr === CAP || u === CAP || dn === CAP };
  };

  const sel = (el) => {
    const c = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return el.tagName.toLowerCase() + c;
  };
  const seen = (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed";
  /* 閉じた畳みの中身は、畳まれていても箱を持っている。押す前に開く面なので
     数えない（`hitbox.mjs` の注と同じ）。 */
  const folded = (el) => {
    const d = el.closest("details");
    return !!d && !d.open && !d.querySelector("summary")?.contains(el);
  };

  /* --- 1. 島の外の顔 ------------------------------------------------- */
  /* 島の字は `"Maru Island", system-ui, …` と控えを後ろに置く並びなので、
     **並びの先頭だけ**を見る（`mefield.mjs` の注。全体で探すと正しい欄も
     「システムの字」と出る）。 */
  const SYS = /^(system-ui|-apple-system|BlinkMac|Segoe|Arial|Helvetica|sans-serif|serif|monospace|ui-|Times|Courier)/i;
  const controls = [...document.querySelectorAll("input, select, textarea, button")]
    .filter((el) => seen(el) && !folded(el))
    .map((el) => {
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      const r = el.getBoundingClientRect();
      const h = hit(el);
      const isBtn = el.tagName === "BUTTON";
      /* ブラウザ既定の顔。Chromium の素の `<button>` は
         地 rgb(239,239,239)・枠 outset 2px・字 system-ui。
         素の `<input>`/`<select>`/`<textarea>` は地が白・枠 inset。
         **どれか1つでも当たれば疑う**（当たった名前を並べて出す）。 */
      const marks = [
        SYS.test(fam) ? `字=${fam}` : null,
        /^rgba?\(255,\s*255,\s*255/.test(cs.backgroundColor) && !isBtn ? "地=白" : null,
        /^rgb\(239,\s*239,\s*239\)/.test(cs.backgroundColor) ? "地=既定のボタン色" : null,
        cs.borderTopStyle === "outset" || cs.borderTopStyle === "inset" ? `枠=${cs.borderTopStyle}` : null,
        cs.appearance === "auto" && el.tagName === "SELECT" ? "つまみ=既定" : null,
        /* **reset のまま、島の板になっていないボタン。**
           `tokens.css` が全部のボタンから地と枠を落としているので、
           そのあと何も着せていないものは、押せるのに平らなただの字になる
           （`docs/island-design.md` 3-3「押せるは厚みで伝える」）。
           地も枠も厚みも無く、字の色も継いだままのものだけを挙げる。 */
        isBtn &&
        /rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor) &&
        parseFloat(cs.borderTopWidth) === 0 &&
        cs.boxShadow === "none" &&
        cs.backgroundImage === "none"
          ? "reset のまま（地も枠も厚みも無い）"
          : null,
      ].filter(Boolean);
      return {
        canary: !!el.closest("#live-canary"),
        disabled: !!el.disabled,
        what: sel(el),
        panel: el.closest("section")?.querySelector("h2")?.textContent?.trim() || "",
        text: (el.value || el.placeholder || el.textContent || "").trim().slice(0, 22),
        /* `.nph-post-row` は `.dform` の上でしか成り立たない（#77）。
           台の外にいたらそれだけで否。 */
        needsForm: !!el.closest(".nph-post-row"),
        onForm: !!el.closest(".dform"),
        font: fam, bg: cs.backgroundColor,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderTopLeftRadius,
        appearance: cs.appearance,
        box: [px(r.width), px(r.height)],
        hit: h,
        marks,
      };
    });

  /* --- 2. 押しどころ（欄以外も。リンク・畳みの頭・役が button のもの） -- */
  const taps = [...document.querySelectorAll('a[href], button, summary, [role="button"], input, select, textarea')]
    .filter((el) => seen(el) && !folded(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { canary: !!el.closest("#live-canary"), what: sel(el), text: (el.textContent || el.value || el.placeholder || "").trim().slice(0, 20), box: [px(r.width), px(r.height)], hit: hit(el) };
    });

  /* --- 5. 動くもの。**外接矩形の大きさで決まる**（`CLAUDE.md`） ------- */
  const anims = (document.getAnimations?.() || [])
    .filter((a) => a.playState === "running" || a.playState === "paused")
    .map((a) => {
      const t = a.effect?.target;
      if (!t || !t.getBoundingClientRect) return null;
      const ps = a.effect.pseudoElement || "";
      const cs = getComputedStyle(t, ps || undefined);
      const r = t.getBoundingClientRect();
      // 擬似要素は DOM に無いので、使われた幅と高さを computed から取る
      const w = ps ? parseFloat(cs.width) || r.width : r.width;
      const h = ps ? parseFloat(cs.height) || r.height : r.height;
      return {
        name: a.animationName || a.effect?.getKeyframes?.().length ? (a.animationName || "(不明)") : "(不明)",
        on: sel(t) + ps,
        iter: a.effect?.getTiming?.().iterations ?? 1,
        box: [px(w), px(h)],
        // 画面ぜんぶに対する割合。1に近いほど、1フレームで画面ぜんぶを描き直す
        cover: px((w * h) / (innerWidth * innerHeight)),
      };
    })
    .filter(Boolean);
  const smil = document.querySelectorAll("animate, animateTransform, animateMotion").length;

  /* --- 5(b). 配信の絵で字が読めるか。**実寸を出す。**
     SVG の中の字は `font-size` が viewBox の単位なので、computed の値を
     そのまま読むと嘘になる（輪は 600 の viewBox を 0.5 倍前後で出している）。
     画面に実際に何 px で描かれているかを、外接矩形の高さから出す。 */
  const inch = [...document.querySelectorAll(".rl-label, .rl-card strong, .rl-kicker, .rl-by, .rl-list b, .rl-list i, .rl-more, .rl-hint, .rl-standby-name, .rl-hub span, .rl-card-flat p, .rl-card-flat code")]
    .filter((el) => el.getBoundingClientRect().width > 1)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const svg = el.ownerSVGElement != null;
      /* **SVG の字は、外接矩形の高さで測らない。**
         輪の札は扇に沿って回してあるので、外接矩形の高さは
         「回した字の**幅**」になる。6本のうち4本が 100〜240px と出て、
         いかにも大きく読めた（実際は 36〜48px）。
         `font-size`（viewBox の単位）に、画面までの倍率を掛ける。 */
      let painted = px(Math.min(r.height, parseFloat(cs.fontSize)));
      let flipped = null;
      if (svg) {
        const m = el.getScreenCTM?.();
        if (m) {
          const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
          painted = px(parseFloat(cs.fontSize) * scale);
          // 上下が逆さなら、字が出ていても読めない
          const deg = ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
          flipped = deg > 95 && deg < 265;
        }
      }
      /* **この式はもう当たらない。数字を信じないこと**（2026-09-13）。

         札は半径 178 に半径と直角で置いてあった。その頃は、扇の境が
         中心から出る2本の半径なので、直線が扇の中にいられる長さは
         **2 × 178 × tan(180/n)** だった。

         **置きかたを変えたので、この式は別のものを測っている。**
         直したあとの輪でも「27件はみ出し」と出るが、**嘘**。
         `getComputedTextLength` も字の下駄（em 箱＝実寸の 1.38倍）を含む。

         正しいのは `tools/sprites/rlspill.py`（+ `rlfit.mjs`）。
         **描かれた画素**で測るので、置きかたを知らずに前後を比べられる。
         ここは前の値との突き合わせのために残してあるだけ。 */
      let textW = null, fitW = null;
      if (svg && el.classList.contains("rl-label") && el.getComputedTextLength) {
        const n = el.ownerSVGElement.querySelectorAll(".rl-label").length;
        textW = px(el.getComputedTextLength());
        fitW = px(2 * 178 * Math.tan(Math.PI / n));
      }
      return { what: sel(el), t: (el.textContent || "").trim().slice(0, 16), declared: cs.fontSize, painted, flipped, textW, fitW };
    });

  /* --- 5(a). 背景が透けるか。**根から順に、最初に塗っているものを探す** */
  const opaque = (c) => c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(c);
  const stack = [document.documentElement, document.body, document.querySelector(".rl-page")]
    .filter(Boolean)
    .map((el) => {
      const cs = getComputedStyle(el);
      return { on: sel(el), bg: cs.backgroundColor, img: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 60), paints: opaque(cs.backgroundColor) || cs.backgroundImage !== "none" };
    });

  return {
    w: innerWidth, h: innerHeight,
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    over: de.scrollWidth - de.clientWidth,
    docH: px(de.scrollHeight),
    controls, taps, anims, smil, stack, inch,
    text: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160),
  };
};

/* ------------------------------------------------------------------ */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = {};
for (const sc of SCENES) {
  report[sc.id] = {};
  for (const [W, H] of sc.widths) {
    const ctx = await b.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: DPR,
      isMobile: W < 700,
      hasTouch: W < 700,
      /* **動くものを止めない。** 外接矩形を数えるのが仕事なので、
         `reducedMotion: reduce` を渡すと `@media` で切ってある
         `rl-rays` と `rl-tick` が消えて「動くもの 0」と出る。 */
    });
    await offline(ctx);
    if (sc.seed) await liveseed(ctx, sc.seed);
    const p = await ctx.newPage();
    const errs = [];
    const fails = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
    p.on("requestfailed", (r) => fails.push(r.url().slice(-70)));
    p.on("response", (r) => r.status() >= 400 && fails.push(`${r.status()} ${r.url().slice(-70)}`));
    await p.goto(`http://localhost:${PORT}${sc.url}`, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(sc.wait ?? 2200);
    if (sc.open) {
      await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
      await p.waitForTimeout(700);
    }
    const dir = `${OUT}/${sc.id}`;
    mkdirSync(dir, { recursive: true });
    await p.screenshot({ path: `${dir}/w${W}.png`, fullPage: W < 700 });

    await p.evaluate(CANARY);
    await p.waitForTimeout(250);
    const withCanary = await p.evaluate(MEASURE);
    await p.evaluate(UNCANARY);
    await p.waitForTimeout(150);
    const r = await p.evaluate(MEASURE);
    /* 仕込みの結果。**4つの素の欄**と、**台の外の `.nph-post-row`**と、
       **20x20 の押しどころ**が、それぞれ検出に引っかかったか。 */
    const cc = withCanary.controls.filter((c) => c.canary);
    r.canary = cc.slice(0, 4).map((c) => ({ what: c.what, marks: c.marks }));
    r.canaryForm = cc.some((c) => c.needsForm && !c.onForm);
    const ctaps = withCanary.taps.filter((t) => t.what === "button" && t.box[0] <= 24);
    r.canaryTap = ctaps.some((t) => !t.hit.w || t.hit.w < 48 || t.hit.h < 48);
    r.errs = errs;
    r.fails = [...new Set(fails)];
    report[sc.id][W] = r;
    await ctx.close();
  }
}
await b.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));

/* ------------------------------ 読む ------------------------------ */
const LIM = 48;
let n1 = 0, n2 = 0, n3 = 0;
for (const sc of SCENES) {
  for (const [W] of sc.widths) {
    const r = report[sc.id][W];
    console.log(`\n════ ${sc.id}  ${W}x${r.h}  ════`);
    /* 仕込みが拾えたか。**素の `<button>` は既定の顔にならない**
       （`tokens.css` が全ボタンを丸裸に戻す）ので、あれは
       「reset のまま」の枝で拾えているのが正しい。 */
    const c1 = r.canary.filter((c) => c.marks.length).length;
    const c2 = r.canaryForm ? "○" : "✗";
    const c3 = r.canaryTap ? "○" : "✗";
    console.log(
      `  仕込み … 素の欄 ${c1}/4 拾えた（${r.canary.map((c) => c.what + (c.marks.length ? "○" : "✗")).join(" ")}）\n` +
        `           台の外の .nph-post-row ${c2} / 20x20 の押しどころ ${c3}`,
    );
    console.log(`  横あふれ ${r.over}px (scrollW ${r.scrollW} / clientW ${r.clientW})  面の高さ ${r.docH}px`);
    if (r.over > 0) n3++;
    console.log(`  欄と押しどころ ${r.controls.length}個 / 押しどころぜんぶ ${r.taps.length}個  JSエラー ${r.errs.length}`);

    const bare = r.controls.filter((c) => c.marks.length || (c.needsForm && !c.onForm));
    for (const c of bare) {
      n1++;
      console.log(`  ✗1 素の顔 [${c.panel}] ${c.what} 「${c.text}」\n       ${c.marks.join(" / ")}${c.needsForm && !c.onForm ? " / 台の外(.nph-post-row なのに .dform が無い)" : ""}\n       字 ${c.font} 地 ${c.bg} 枠 ${c.border}`);
    }
    if (!bare.length) console.log("  ○1 素の顔 0件");

    const small = r.taps.filter((t) => !t.canary && (!t.hit.w || t.hit.w < LIM || t.hit.h < LIM));
    for (const t of small) {
      n2++;
      console.log(`  ✗2 押しどころ ${t.what} 「${t.text}」 見た目 ${t.box[0]}x${t.box[1]}  当たり ${t.hit.why ? "測れず（" + t.hit.why + "）" : t.hit.w + "x" + t.hit.h}`);
    }
    if (!small.length) console.log(`  ○2 ${LIM}px 割れ 0件（${r.taps.length}個ぜんぶ）`);
    /* **通ったものの中で、いちばん細いものを出す。** 全部○だけを見て
       終わると、48.5px で通っているものが1つも見えない。 */
    const thin = r.taps.filter((t) => !t.canary && t.hit.w).sort((a, b) => Math.min(a.hit.w, a.hit.h) - Math.min(b.hit.w, b.hit.h)).slice(0, 3);
    for (const t of thin) console.log(`     細い順 ${t.what}「${t.text}」 当たり ${t.hit.w}x${t.hit.h}${t.hit.capped ? "（打ち切り。これ以上）" : ""}`);

    if (sc.id.startsWith("rl-")) {
      for (const s of r.stack) console.log(`  地 ${s.on} … ${s.paints ? "塗っている" : "透ける"}  ${s.bg} ${s.img}`);
      for (const a of r.anims) {
        const inf = a.iter === Infinity || a.iter === null;
        console.log(`  動 ${a.name} on ${a.on}  ${inf ? "ずっと" : a.iter + "回"}  外接矩形 ${a.box[0]}x${a.box[1]}  画面の ${(a.cover * 100).toFixed(0)}%`);
      }
      if (!r.anims.length) console.log("  動 0");
      console.log(`  SMIL(<animate>) ${r.smil}`);
      const flip = r.inch.filter((x) => x.flipped).length;
      const spill = r.inch.filter((x) => x.fitW && x.textW > x.fitW).length;
      console.log(`  字の実寸（画面に何pxで描かれているか）／上下さかさま ${flip}件／扇からはみ出し ${spill}件 ← **この数は当てにならない。rlspill.py を見ること**`);
      for (const x of r.inch) {
        const over = x.fitW ? `  字幅 ${x.textW} / 扇に入る幅 ${x.fitW}${x.textW > x.fitW ? ` ← ${(x.textW / x.fitW).toFixed(2)}倍 はみ出し` : ""}` : "";
        console.log(`     ${String(x.painted).padStart(6)}px  ${x.what}「${x.t}」${x.flipped ? "  ← 上下さかさま" : ""}${over}`);
      }
    }
    if (r.errs.length) for (const e of r.errs.slice(0, 3)) console.log(`  ! ${e}`);
  }
}
console.log(`\n───────── まとめ ─────────\n 1 素の顔 ${n1}件 / 2 48px割れ ${n2}件 / 3 横あふれの出た場面 ${n3}\n 絵と数は ${OUT}/`);
