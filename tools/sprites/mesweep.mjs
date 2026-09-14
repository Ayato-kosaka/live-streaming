/**
 * `/me`（じぶんのこと）と `/me/desk`（島の手入れ）を、**道具1つずつ**撮って数える。
 *
 * `docs/island-misses.md` #77 のあと。あの日に絵で見たのは足元の札2種類だけで、
 * **道具9つの中身は1枚も撮っていなかった。** ここは、机の札を1つずつ押して
 * 開いた中身まで撮る。
 *
 *   tools/build.sh 3600
 *   python3 -m http.server 4600 --directory site/.next-3600 &
 *   SPORT=4600 node tools/sprites/mesweep.mjs                 # うまくいっている日
 *   SPORT=4600 MEMODE=empty node tools/sprites/mesweep.mjs    # 0件の日
 *   SPORT=4600 MEMODE=down  node tools/sprites/mesweep.mjs    # 読めなかった日
 *   SPORT=4600 MEMODE=wait  node tools/sprites/mesweep.mjs    # 取りに行っている最中
 *
 * 出るもの（/tmp/mesweep/<MEMODE>/）:
 *   <場面>-390.png … 面ぜんぶ（dpr 2、下まで送ってから）
 *   report.json    … 下の measure() が返した数
 *
 * ## 数えるもの
 *
 * 1. **島の外の顔**（ブラウザ既定のまま出ている `input` / `select` / `textarea` /
 *    `button`）。判定は**同じ親に素の部品を1つ置いて、見た目を突き合わせる。**
 *    クラス名や `.dform` の中にいるかでは決めない。`.nph-post-row` を `.dform`
 *    の外に置いた件（#77）は「入れ物の外にいる」で捕まるが、**入れ物の中に
 *    いても規則が当たっていない**ものは、それでは捕まらない。
 *    素の部品と同じ顔なら、どこにいても島の外にいる。
 *    **この素の部品は、そのまま「道具が効いているか」の校正にもなる**
 *    （`docs/island-misses.md` #19。捕まえられない道具は、いつでも0件と出る）。
 * 2. **押しどころ 48px**（`docs/island-design.md` 3-2）。見た目の箱では測らない。
 *    **測るところは自分で書かない。`hitbox.mjs` の `measure()` を呼ぶ。**
 *    ここには長いあいだ `hitbox.mjs` の写しが置いてあって、「閉じた畳みの
 *    中は飛ばす」まで一緒に写っていた。2026-09-14 に `hitbox.mjs` を
 *    直しても、**写しのほうは直らなかった**（`docs/island-misses.md` #83）。
 *    **同じ面を2回測って、前の数え方と並べて出す。**
 *      1回目 … 畳みを開く前（＝これまでの数え方）
 *      2回目 … 全部の畳みを開いてから。/me の「島に出す名前」の欄は
 *              `Fold`（畳み）の中にあるので、ここではじめて数に入る
 * 3. **横あふれ**。`documentElement.scrollWidth > clientWidth`（#72）。360 と 390。
 * 4. 字の濃さは別の道具（`inkpx.mjs` → `inkpx.py`）。ここでは撮るだけ。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";
import { openFolds, measure as hitMeasure, SEL_ALL, addProbe, delProbe, isProbe, probeVerdict } from "./hitbox.mjs";

const PORT = process.env.SPORT || "4600";
const MODE = process.env.MEMODE || "ok";
const DPR = Number(process.env.DPR || 2);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
/* `OPENALL=1` は要らなくなった。畳みは**毎回開いて測る**（開く前の数も
   同じ回に出る）ので、置き場を分ける理由が無い。 */
const OUT = `/tmp/mesweep/${MODE}`;
mkdirSync(OUT, { recursive: true });

/** 撮る場面。机の道具は `tools.ts` の並びそのまま（9つ）。 */
const SCENES = [
  { id: "me-note", page: "/me.html", tab: "付箋" },
  { id: "me-plan", page: "/me.html", tab: "企画" },
  { id: "me-card", page: "/me.html", tab: "カード" },
  // 名前とアイコンを出すか（畳みの中の `IslandMe`）。開かないと欄が出ない
  { id: "me-islandme", page: "/me.html", open: true },
  { id: "desk-photo", page: "/me/desk.html", tab: "写真" },
  { id: "desk-place", page: "/me/desk.html", tab: "いまどこ" },
  { id: "desk-video", page: "/me/desk.html", tab: "配信" },
  { id: "desk-sticky", page: "/me/desk.html", tab: "付箋" },
  { id: "desk-plan", page: "/me/desk.html", tab: "企画" },
  { id: "desk-donor", page: "/me/desk.html", tab: "投げ銭" },
  { id: "desk-chara", page: "/me/desk.html", tab: "キャラ" },
  { id: "desk-fund", page: "/me/desk.html", tab: "スパチャ" },
  { id: "desk-obs", page: "/me/desk.html", tab: "OBS" },
];

/* ------------------------------------------------------------------ */
/* 画面の中で回すもの。**ブラウザの中で完結させる**（外に持ち出すのは数だけ） */
/* ------------------------------------------------------------------ */

const faceMeasure = (probe) => {
  const px = (n) => Math.round(n * 100) / 100;

  /* ---- 1. 島の外の顔 ----------------------------------------------
     同じ親に素の部品を1つ置いて、顔（字・地・枠・角・厚み）を突き合わせる。
     素の部品は `position:absolute; visibility:hidden` で置く。どちらも
     字や地や枠の計算には効かないので、見ている値は動かない。 */
  const FACE = [
    "fontFamily", "fontSize", "fontWeight",
    "backgroundColor", "backgroundImage",
    "borderTopWidth", "borderTopStyle", "borderTopColor",
    "borderTopLeftRadius", "boxShadow", "color", "paddingTop",
  ];
  const faceOf = (el) => {
    const cs = getComputedStyle(el);
    return FACE.map((k) => cs[k]).join(" | ");
  };
  /**
   * ブラウザ既定の顔。**素の部品を、規則の当たらないところ（`<body>` の直下）
   * に置いて読む。**
   *
   * 最初はこれを「その部品と同じ親」に置いて突き合わせていた。**それだと
   * 逆のことを測る。** `.dform input` は子孫に当たる規則なので、`.dform` の
   * 中に置いた素の部品にも同じ規則が当たり、**正しく島の顔をしている欄が
   * ぜんぶ「素の部品と同じ」= 否**と出た（27件。全部まちがい）。
   * 比べる相手は「同じ場所に置いた素の部品」ではなく、**どこの規則も
   * 当たっていない素の部品**。
   */
  const uaCache = new Map();
  const uaFace = (tag, type) => {
    const key = `${tag}:${type || ""}`;
    if (uaCache.has(key)) return uaCache.get(key);
    const box = document.createElement("div");
    box.className = "me-probe-ua";
    box.style.cssText = "position:absolute;left:-9999px;top:0";
    const e = document.createElement(tag);
    if (type) e.setAttribute("type", type);
    if (tag === "select") e.appendChild(new Option("あ"));
    if (tag === "button") e.textContent = "あ";
    box.appendChild(e);
    document.body.appendChild(box);
    const f = faceOf(e);
    box.remove();
    uaCache.set(key, f);
    return f;
  };

  const name = (el) =>
    `${el.tagName.toLowerCase()}${
      el.className && typeof el.className === "string"
        ? "." + el.className.split(/\s+/).filter(Boolean).join(".")
        : ""
    }`;

  /* 校正用。**道具が本物を捕まえるかを、毎回その場で確かめる**
     （`docs/island-misses.md` #19「数え方が届いていない場所は0件に見える」）。
     2つ置く。どちらも挙がらなければ、この報告の「0件」は信じてはいけない。

       A) 紙の上の素の部品4つ … いちばん素朴な形
       B) `.nph-post-row` を `.dform` の外に置いたもの … **#77 でみつかった
          本物と同じ形。** 「入れ物の中に見えるのに規則が当たっていない」
          ほうを捕まえられるかは、A だけでは分からない */
  if (probe) {
    const box = document.createElement("div");
    box.id = "me-probe";
    box.innerHTML =
      '<input type="text" placeholder="校正A"><select><option>校正A</option></select>' +
      "<textarea></textarea><button>校正A</button>";
    document.body.appendChild(box);
    const panel = document.querySelector("section.panel");
    if (panel) {
      const row = document.createElement("div");
      row.id = "me-probe2";
      row.innerHTML =
        '<label class="nph-post-row"><span>校正B</span>' +
        "<select><option>校正B</option></select></label>";
      panel.appendChild(row);
    }
  }

  /* **読み上げにだけ残してあるものを、押せないものとして数えない。**
     パンくずは狭い画面で `clip-path: inset(50%)` の 1x1 に畳んである
     （`app/css/pages.css` の `.crumbs:not(:has(> span + span))`）。
     中の `<a>` は自分の箱（13x21）を持ったままなので、そのまま測ると
     「押しどころ 13x21 で否」と出る。**画面に出ていないものは数えない。**
     最初に書いたときこれで `/me` の「島」が否に挙がった（#72 と同じ形）。 */
  const hiddenForEyes = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ac = getComputedStyle(a);
      const ar = a.getBoundingClientRect();
      if ((ar.width <= 1 || ar.height <= 1) && (ac.overflow === "hidden" || ac.clipPath !== "none"))
        return true;
    }
    return false;
  };

  const faces = [];
  /* 顔を見るのは欄だけ（`a` と `summary` に「ブラウザ既定の顔」は無い）。
     **畳みの中も見る。** ここは `openFolds()` のあとに回すので、
     畳みを開いた先の欄も同じ目で見られる。前は閉じた畳みの中を飛ばしていて、
     `/me` の「島に出す名前」の欄が**顔の検品にも入っていなかった。** */
  for (const el of document.querySelectorAll("input, select, textarea, button")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.offsetParent === null && cs.position !== "fixed") continue;
    if (hiddenForEyes(el)) continue;
    /* **指が触れないものは、押しどころではない。** 写真の file の欄
       （`.nph-post-file`）は `opacity: 0` と `pointer-events: none` で
       脇へどけてあり、指が押すのは「写真を選ぶ」のほう。
       **隠してあるものを、押せないものとして数えない**（#72）。 */
    if (cs.opacity === "0" || cs.pointerEvents === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    {
      const my = faceOf(el);
      const why = [];
      if (my === uaFace(tag, type)) why.push("ブラウザ既定の顔そのまま");
      /* 印（チェック・ラジオ）は、`appearance` を戻していなければ**OS が描く。**
         島の絵柄のとなりに、端末ごとに形の変わる四角が混ざる
         （`docs/island-design.md` 1・2章）。顔の突き合わせでは捕まらない
         （大きさや accent-color だけ当てていると別の顔に見える）ので、別に見る。 */
      if ((type === "checkbox" || type === "radio") && getComputedStyle(el).appearance !== "none")
        why.push("OS が描く印（appearance が戻っていない）");
      /* 選ぶ欄の**矢印**も OS が描く。地も枠も字も島のものに替えてあっても、
         右端の ∨ だけはブラウザのもので、端末で形も位置も変わる
         （島の印は `components/ui/Icon.tsx` の自前 SVG。`island-design.md` 1章）。
         **顔の突き合わせでは出てこない**ので、別に見る。
         `.dform input.dday`（日を選ぶ欄）だけは `appearance: none` に戻して
         あるので、やればできることは分かっている。 */
      if (tag === "select" && getComputedStyle(el).appearance !== "none")
        why.push("OS が描く矢印（select の appearance が戻っていない）");
      if (why.length) {
        faces.push({
          what: name(el) + (type ? `[${type}]` : ""),
          why,
          label: (
            el.closest("label")?.querySelector("span")?.textContent ||
            el.closest("label")?.textContent ||
            ""
          ).trim().slice(0, 30),
          text: (el.textContent || el.value || el.placeholder || "").trim().slice(0, 24),
          onForm: !!el.closest(".dform"),
          face: my,
          probe: el.closest("#me-probe") || el.closest("#me-probe2") ? true : undefined,
        });
      }
    }
  }

  document.getElementById("me-probe")?.remove();
  document.getElementById("me-probe2")?.remove();

  const de = document.documentElement;
  return {
    w: innerWidth,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    over: de.scrollWidth - de.clientWidth,
    height: de.scrollHeight,
    faces,
  };
};

/** `hitbox.mjs` が返す行を、この道具の読み上げの形にそろえる */
const asTap = (r) => ({
  what: r.c, text: r.t, box: r.box,
  hit: r.hit || null, why: r.why, fold: !!r.fold,
});

/* ------------------------------------------------------------------ */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = {};
for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  report[sc.id] = {};
  for (const W of [360, 390]) {
    const ctx = await b.newContext({
      viewport: { width: W, height: 844 },
      deviceScaleFactor: DPR,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await seed(ctx, { admin: true, mode: MODE });
    await offline(ctx).catch(() => {});
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
    /* **待っているところを撮るときは、読み込みの終わりを待たない。**
       返らない口を `networkidle` で待つと、そのまま時間切れになる。 */
    await p
      .goto(`http://localhost:${PORT}${sc.page}`, {
        waitUntil: MODE === "wait" ? "domcontentloaded" : "networkidle",
        timeout: 60000,
      })
      .catch(() => {});
    await p.waitForTimeout(MODE === "wait" ? 2500 : 1500);

    if (sc.tab) {
      /* 机の札も、じぶんのものの札も `.mp-tab`。**字で押す**
         （並びが変わっても同じ道具が開く）。 */
      await p
        .locator(".mp-tab", { hasText: new RegExp(`^${sc.tab}`) })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await p.waitForTimeout(MODE === "wait" ? 2000 : 1600);
    }
    /* 絵は**畳みをさわる前に**撮る。撮る目的は「その場面がどう見えるか」で、
       測る都合で開いた姿ではない。`open` の付いた場面だけ、開いた姿を撮る。 */
    if (sc.open) {
      await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
      await p.waitForTimeout(700);
    }

    /* 下まで送ってから測る。`content-visibility: auto` の畳みは、画面の外に
       いるあいだ `contain-intrinsic-size` の値で高さを答える（`CLAUDE.md`）。 */
    const toBottom = async () => {
      for (let i = 0; i < 40; i++) {
        const before = await p.evaluate(() => {
          window.scrollBy(0, 2000);
          return document.documentElement.scrollHeight;
        });
        await p.waitForTimeout(60);
        const after = await p.evaluate(() => document.documentElement.scrollHeight);
        if (before === after && i > 2) break;
      }
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(400);
    };
    await toBottom();

    if (W === 390) await p.screenshot({ path: `${OUT}/${sc.id}-390.png`, fullPage: true });

    /* 仕込みは**畳みを開く前**に入れる。閉じた畳みごと入れないと、
       「開いてはじめて挙がる」ほうを確かめられない（#83） */
    if (process.env.PROBE) await addProbe(p);

    /* **1回目 … これまでの数え方。** 閉じた畳みの中を飛ばす。
       前後で数が変わることが、当てた証拠になる（`docs/island-misses.md` #83）。 */
    const before = await hitMeasure(p, { sel: SEL_ALL, min: 48, fold: "skip" });
    /* **2回目 … 畳みを全部開いてから。** `/me` の「島に出す名前」の欄は
       `Fold` の中にあるので、ここではじめて数に入る。 */
    const folds = await openFolds(p);
    await toBottom();
    const after = await hitMeasure(p, { sel: SEL_ALL, min: 48, fold: "open" });

    const r = await p.evaluate(faceMeasure, true);
    if (process.env.PROBE) {
      r.probe = probeVerdict({ after: after.rows, before: before.rows, min: 48 });
      await delProbe(p);
    }
    r.errs = errs;
    r.folds = folds;
    r.taps = after.rows.concat(after.skipped).filter((x) => !isProbe(x)).map(asTap);
    r.tapsBefore = before.rows.concat(before.skipped).filter((x) => !isProbe(x)).map(asTap);
    r.excluded = after.excluded;
    report[sc.id][W] = r;
    await ctx.close();
  }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await b.close();

/* ---- 読み上げ ---------------------------------------------------- */
let ngFace = 0;
let ngTap = 0;
let ngOver = 0;
for (const [id, byW] of Object.entries(report)) {
  console.log(`\n=== ${id} ===`);
  for (const W of [360, 390]) {
    const r = byW[W];
    if (!r) continue;
    const probe = r.faces.filter((f) => f.probe).length;
    const real = r.faces.filter((f) => !f.probe);
    const isSmall = (t) => !t.hit || t.hit[0] < 48 || t.hit[1] < 48;
    const small = r.taps.filter(isSmall);
    const small0 = r.tapsBefore.filter(isSmall);
    const inFold = r.taps.filter((t) => t.fold).length;
    if (r.over > 0) ngOver++;
    if (W === 390) {
      ngFace += real.length;
      ngTap += small.length;
    }
    /* **前の数え方と並べて出す。** 片方だけ出すと、畳みの中を見るように
       なったことを示せない（`docs/island-misses.md` #83）。 */
    console.log(
      `  ${W}px  高さ ${r.height}px  横あふれ ${r.over}px  ` +
        `島の外の顔 ${real.length}（校正 ${probe}/5）\n` +
        `        押しどころ  畳みを開く前 ${r.tapsBefore.length}個 → 開いたあと ${r.taps.length}個` +
        `（うち畳みの中 ${inFold}個。畳み ${r.folds.opened}個を開いた` +
        `${r.folds.stillClosed ? `／**開かなかった ${r.folds.stillClosed}個**` : ""}）\n` +
        `        48px割れ    開く前 ${small0.length}個 → 開いたあと ${small.length}個` +
        (r.errs.length ? `  JSエラー ${r.errs.length}` : ""),
    );
    if (probe < 5) console.log(`    ※ 校正が ${probe}/5。**この面の「島の外の顔」は信じない**`);
    for (const f of real)
      console.log(`    外の顔 ${f.what}「${f.label || f.text}」 台の上=${f.onForm} ${f.why.join(" / ")}`);
    for (const t of small)
      console.log(`    小さい ${t.what}「${t.text}」 箱 ${t.box.join("x")} 当たり ${t.hit ? t.hit.join("x") : t.why}${t.fold ? "  [畳みの中]" : ""}`);
    if (r.excluded)
      console.log(`    数えなかったもの: ${Object.entries(r.excluded).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
    if (r.probe) {
      console.log(`    仕込み: ${r.probe.ok ? "そのとおりに出た" : "!! だめ。この面の 0 件は証拠にならない"}`);
      for (const l of r.probe.lines) console.log("    " + l);
    }
    for (const e of r.errs) console.log(`    JS ${e}`);
  }
}
/* 場面ぜんぶを足した数。**旧と新を並べる。** */
let t0 = 0, t1 = 0, s0 = 0, s1 = 0, fd = 0;
for (const byW of Object.values(report)) {
  const r = byW[390];
  if (!r) continue;
  const isSmall = (t) => !t.hit || t.hit[0] < 48 || t.hit[1] < 48;
  t0 += r.tapsBefore.length; t1 += r.taps.length;
  s0 += r.tapsBefore.filter(isSmall).length; s1 += r.taps.filter(isSmall).length;
  fd += r.taps.filter((t) => t.fold).length;
}
console.log(
  `\n[${MODE}] 390px・${Object.keys(report).length}場面ぶん\n` +
    `  押しどころ  畳みを開く前 ${t0}個 → 開いたあと ${t1}個（差 +${t1 - t0}。うち畳みの中 ${fd}個）\n` +
    `  48px割れ    開く前 ${s0}個 → 開いたあと ${s1}個（差 +${s1 - s0}）\n` +
    `  島の外の顔 ${ngFace} / 横あふれの出た幅 ${ngOver}`,
);
