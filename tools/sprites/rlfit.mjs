/**
 * `/roulette` の**輪の札**を、件数ちがいで撮って数える。
 *
 *   SPORT=4700 TAG=before node tools/sprites/rlfit.mjs
 *   SPORT=4700 TAG=after  node tools/sprites/rlfit.mjs
 *
 * 出るもの: `/tmp/rl/<TAG>/n<件数>-<幅>.png` と、その場での数。
 *
 * ## `livecheck.mjs` と何が違うか
 *
 * あちらの「扇に入る幅」は **`2 × 178 × tan(180/n)`** の決め打ちで、
 * 札を半径と直角に置いていた頃の式。札の置きかたを変えると、
 * あの式は**新しい絵に当たらない**（直したのに落ちる／落ちていないのに通る）。
 * ここでは**画面に描かれた札そのもの**から測る。
 *
 * 1. **扇からはみ出していないか** — **描かれた画素**で見る。札を出した絵と、
 *    札だけ透明にした絵の2枚を撮って、差の出た画素が字の画素
 *    （`inkpx.mjs` と同じやり方）。その画素の角度が、扇のまん中から
 *    半扇ぶんの中にいるかを測る。**置きかたを知らなくても測れる**ので、
 *    直したあとの絵にもそのまま当たる。
 *    （`getBBox` は字の下駄（em 箱）まで入っていて、実際の 1.3 倍に出る。
 *    あれで測ると、入っているものが「はみ出し」と出る）
 * 2. **上下さかさま** — `getScreenCTM` の回転角。95〜265度なら読めない
 * 3. **実寸** — `font-size × 画面までの倍率`。
 *    **外接矩形の高さで測らない**（回してあるので「回した字の幅」になる）
 *
 * 件数は 5・6・12・36 の4通り。36 は `content/roulette.ts` の `MAX_ITEMS`。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.SPORT || "4700";
const TAG = process.env.TAG || "now";
const OUT = `/tmp/rl/${TAG}`;
mkdirSync(OUT, { recursive: true });

/** 本番に来る長さの候補。短いのも長いのも混ぜる（`liveraw.mjs` と同じ並び） */
const POOL = [
  "トビリシの温泉", "ヒッチハイクで隣の国", "24時間クッキング",
  "視聴者の家に泊まる", "深夜の市場めぐり", "サウナ",
  "朝までラーメン", "山のてっぺんで配信", "ドミトリーで自炊",
  "古着屋めぐり", "地元の市場で買い出し", "夜行バスで移動",
];
/** 件数ぶんの候補。足りなくなったら番号を足して伸ばす */
const pick = (n) =>
  Array.from({ length: n }, (_, i) =>
    i < POOL.length ? POOL[i] : `${POOL[i % POOL.length]}${Math.floor(i / POOL.length) + 1}`,
  );

const COUNTS = [5, 6, 12, 36];
const SIZES = [[1920, 1080], [1280, 720]];

/* ------------------------------------------------------------------ */
/* 面の中で測る。**外の変数は使えない**                                  */
/* ------------------------------------------------------------------ */
const MEASURE = (n) => {
  const px = (v) => Math.round(v * 100) / 100;
  const svg = document.querySelector(".rl-wheel");
  if (!svg) return { labels: [], n: 0 };
  const box = svg.getBoundingClientRect();
  const ctm = svg.getScreenCTM();
  /* 輪の中心と、viewBox 1単位が画面の何 px になるか */
  const scale = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const labels = [...svg.querySelectorAll(".rl-label")].map((el) => {
    const m = el.getScreenCTM();
    const deg = ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    /* **字の四隅**。SVG の中の箱を画面の座標へ移す。
       `getBBox` は回す前の箱なので、4隅を1つずつ ctm に通す。 */
    const bb = el.getBBox();
    const pt = svg.createSVGPoint();
    const corners = [
      [bb.x, bb.y], [bb.x + bb.width, bb.y],
      [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height],
    ].map(([x, y]) => {
      pt.x = x; pt.y = y;
      const q = pt.matrixTransform(m);
      return { x: q.x, y: q.y };
    });
    /* 中心から見た、四隅の角度と距離（画面の px で）。
       角度は 12時を 0 として時計回り。扇 i は
       [i*360/n - 180/n, i*360/n + 180/n] を占める。 */
    const polar = corners.map((q) => {
      const dx = q.x - cx, dy = q.y - cy;
      return {
        r: Math.hypot(dx, dy) / scale,
        a: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360,
      };
    });
    /* **どの扇の札か**は、置きかたを知らなくても決められる。
       字の箱のまん中が、どの扇のまん中にいちばん近いかで見る。
       （`data-*` を当てにすると、直す前の作りでは測れない） */
    const mx = corners.reduce((s, q) => s + q.x, 0) / 4 - cx;
    const my = corners.reduce((s, q) => s + q.y, 0) / 4 - cy;
    const mine = ((Math.atan2(mx, -my) * 180) / Math.PI + 360) % 360;
    const step = 360 / n;
    const idx = Math.round(mine / step) % n;
    const half = 180 / n;
    const mid = (idx * step) % 360;
    /* 扇のまん中からの角度のずれ。いちばん外れた隅で見る */
    const off = Math.max(
      ...polar.map((p) => {
        let d = Math.abs(p.a - mid);
        if (d > 180) d = 360 - d;
        return d;
      }),
    );
    return {
      t: (el.textContent || "").trim(),
      i: idx,
      /** 画面に何 px で描かれているか（外接矩形の高さでは測らない） */
      painted: px(fs * scale),
      /** 上下さかさまか */
      flipped: deg > 95 && deg < 265,
      /** 扇のまん中から、いちばん外れた隅までの角度 ÷ 扇の半分。1.00 以下なら中 */
      spread: px(off / half),
      /** いちばん外の隅の半径（輪の縁は 246） */
      rMax: px(Math.max(...polar.map((p) => p.r))),
      rMin: px(Math.min(...polar.map((p) => p.r))),
    };
  });

  const de = document.documentElement;
  return {
    n,
    /** 輪の中心（画面の px）と、viewBox 1単位が何 px か。画素で測るのに使う */
    cx: px(cx), cy: px(cy),
    labels,
    /** 輪に載っているのが番号だけか（数字1〜2桁しか出ていない） */
    numbers: labels.length > 0 && labels.every((x) => /^\d{1,2}$/.test(x.t)),
    legend: document.querySelectorAll(".rl-legend li").length,
    list: document.querySelectorAll(".rl-list li").length,
    over: de.scrollWidth - de.clientWidth,
    scale: px(scale),
  };
};

/* ------------------------------------------------------------------ */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = {};
for (const n of COUNTS) {
  const q = encodeURIComponent(pick(n).join(","));
  for (const [W, H] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
    await p.goto(`http://localhost:${PORT}/roulette.html?candidates=${q}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    // 書体が届いてから測る。届く前だと控えの字幅で測ることになる
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1200);
    /* **2枚のあいだに動くものがあってはいけない。** 「TAP TO SPIN」は
       opacity 0.8〜1 で息をしているので、止めずに撮ると差分に字と関係ない
       画素が混ざる（実測で輪から 599 単位のところに 1,783 画素出た）。
       その場で止める。**頭に巻き戻さない**（`docs/island-standards.md` 13）。 */
    await p.evaluate(() => {
      for (const a of document.getAnimations?.() || []) a.pause();
      window.requestAnimationFrame = () => 0;
    });
    await p.waitForTimeout(200);
    const r = await p.evaluate(MEASURE, n);
    r.errs = errs;
    await p.screenshot({ path: `${OUT}/n${n}-${W}.png` });
    /* 2枚目。**札だけ透明にする。** 差の出た画素が字の画素になる */
    await p.addStyleTag({
      content: ".rl-label{fill:transparent !important;stroke:transparent !important}",
    });
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/n${n}-${W}.bg.png` });
    report[`${n}-${W}`] = r;
    await ctx.close();
  }
}
await b.close();
writeFileSync(`${OUT}/fit.json`, JSON.stringify(report, null, 1));

/* ------------------------------ 読む ------------------------------ */
console.log(`■ /roulette の輪の札  [${TAG}]  絵は ${OUT}/`);
let ngFit = 0, ngFlip = 0;
for (const n of COUNTS) {
  for (const [W] of SIZES) {
    const r = report[`${n}-${W}`];
    const flip = r.labels.filter((x) => x.flipped);
    const sizes = r.labels.map((x) => x.painted);
    ngFlip += flip.length;
    console.log(
      `\n── ${n}件 / ${W}px  （札 ${r.labels.length}枚${r.numbers ? "・番号" : ""}` +
        `${r.legend ? `・控え ${r.legend}件` : ""}${r.list ? `・一覧 ${r.list}件` : ""}）`,
    );
    console.log(`   さかさま ${flip.length}枚 / 横あふれ ${r.over}px`);
    console.log(
      `   実寸 ${Math.min(...sizes).toFixed(1)}〜${Math.max(...sizes).toFixed(1)}px` +
        `（viewBox 1単位 = ${r.scale}px）`,
    );
    if (r.errs.length) console.log(`   ! JSエラー ${r.errs.length}件: ${r.errs[0]}`);
  }
}
console.log(`\n───── まとめ ───── さかさま ${ngFlip}枚`);
console.log(`  扇からはみ出していないかは、撮った2枚から画素で測る:`);
console.log(`    python3 tools/sprites/rlspill.py ${TAG}`);
void ngFit;
