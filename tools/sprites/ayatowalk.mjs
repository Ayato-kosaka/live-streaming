/**
 * **島を歩くあやとのぱらぱら漫画（3向き×4コマ）が、歩いているあいだ正しく動いているか。**
 *
 *   tools/build.sh 3171
 *   python3 -m http.server 4171 --directory site/.next-3171 &
 *   ORIGIN=http://127.0.0.1:4171 node tools/sprites/ayatowalk.mjs
 *   PAGES=/index.html ORIGIN=... node tools/sprites/ayatowalk.mjs
 *   OUT=/tmp/walk ORIGIN=... node tools/sprites/ayatowalk.mjs     # 撮った連続の絵を置く先
 *
 * 終了コード: 0＝通った / 1＝破れがあった / 2＝測れなかった（島が無い・シートが読めない）
 *
 * ## なぜ止まった1枚で見ないのか
 *
 * コマ送りは**動いているあいだにしか無い。** 止まった絵を撮ると1枚目しか写らず、
 * 送られていなくても通る（`docs/island-standards.md` 出す前のチェック「動くものは
 * 動かして確かめた」）。ここは歩かせているあいだ、**毎フレーム**どのコマ・どの段が
 * 出ているかを記録して、順番と切り替わりを数で読む。
 *
 * ## 見ているもの（#895）
 *
 *  1. **島を開いただけではシートを要求しない**（route で数える。#876）。歩いたあとは1回だけ
 *  2. 歩いているあいだ、**4コマが順に**出る（0→1→2→3→0…。飛ばさない・戻らない）
 *  3. 向きの段: 左右＝横（右は反転）・下＝正面・上＝背中。正面・背中は反転しない
 *  4. **斜めで段がちらつかない**（斜めに押し続けて、段の切り替わりが 0 回か 1 回）
 *  5. 止まったら**その向きのまま**、段の「立つコマ」で止まる（4方向それぞれ）
 *  6. 影（反転しない楕円）と体の中心がずれない（向きごと）
 *  6b. 体の弾み（`AYATO_WALK_LIFT`）が、両足のそろったコマ（奇数）でだけ上がる
 *     （＝コマと同じ時計で動いている）。止まったら 0
 *  7. **止まった瞬間・歩き出した瞬間に、大きさ・足の位置が跳ばない。**
 *     ここだけは DOM の箱ではなく**描かれた画素**で見る。島の絵を消して
 *     あやとだけを白地に撮り、色のついた画素の外接矩形を読む。箱は数式どおりに
 *     置かれていて当たり前なので、絵の中の人の背と足を見ないと分からない
 *  8. **動きを減らす設定**では、シートを読まない・コマを送らない・弾まない
 *
 * 撮った連続の絵（歩いているあいだの8枚・向きごとの立ち姿）は `OUT` に置く。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ORIGIN } from "./prod.mjs";
import { repoPath } from "./repo.mjs";
import { readConst } from "./tsread.mjs";

const PAGES = (process.env.PAGES || "/index.html,/island/caucasus.html").split(",").filter(Boolean);
const OUT = process.env.OUT || "";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
/** 1つの向きへ歩かせる長さ（ms）。1周 0.5秒なので、2周以上は見える */
const WALK_MS = Number(process.env.WALK_MS || 1300);

/* 段の並びは `lib/ayatoArt.ts` の表を読む（字は `tsread.mjs` で。自前の正規表現で読まない）。
   立つコマと弾みの高さは、**島が実際に描いた値**をページから読む
   （シートの `--ayato-rest` と `data-frames`、弾みの `<g>` の `data-lift`）。 */
const ROW = Object.fromEntries(
  Object.entries(readConst(readFileSync(repoPath("site/lib/ayatoArt.ts"), "utf8"), "AYATO_WALK_ROW")).map(([k, v]) => [k, Number(v)]),
);
if (!("side" in ROW && "front" in ROW && "back" in ROW)) {
  console.log(`lib/ayatoArt.ts の AYATO_WALK_ROW が読めない（${JSON.stringify(ROW)}）`);
  process.exit(2);
}

let BAD = 0;
let OK = 0;
const ng = (m) => {
  BAD++;
  console.log(`  NG   ${m}`);
};
const ok = (m) => {
  OK++;
  console.log(`  ok   ${m}`);
};
const check = (name, good, why = "") => (good ? ok(name) : ng(`${name}${why ? ` — ${why}` : ""}`));

/* ---- 島の中を読む（毎フレーム） ----------------------------------------- */
const PROBE = `() => {
  const g = document.querySelector("g.ayato");
  if (!g) return null;
  const still = g.querySelector(".ayato-still");
  const walk = g.querySelector(".ayato-walk");
  const sheet = g.querySelector(".ayato-walk-sheet");
  const row = g.querySelector(".ayato-walk-row");
  const shadow = g.previousElementSibling;
  const showWalk = walk && getComputedStyle(walk).display !== "none";
  const vis = showWalk ? walk : still;
  /* 窓（入れ子の svg）の箱は getBoundingClientRect では取れない。**中のシートぜんぶ
     （切り抜かれて見えていない3コマぶん）まで含めた箱**が返る。窓の x/y/幅/高さを
     外の <g> の行列で画面に写して出す */
  let r;
  if (showWalk) {
    const m = g.getScreenCTM();
    const x = walk.x.baseVal.value, y = walk.y.baseVal.value;
    const w = walk.width.baseVal.value, h = walk.height.baseVal.value;
    const a = new DOMPoint(x, y).matrixTransform(m);
    const c = new DOMPoint(x + w, y + h).matrixTransform(m);
    const left = Math.min(a.x, c.x), top = Math.min(a.y, c.y);
    r = { left, top, width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y) };
  } else r = vis.getBoundingClientRect();
  const sr = shadow ? shadow.getBoundingClientRect() : null;
  const n = Number(sheet?.dataset.frames || 0);
  const fw = sheet ? Number(sheet.getAttribute("width")) / (n || 1) : 0;
  /* 段の高さは窓（viewBox）からではなくシートから出す。窓は縁を1画素切ってある */
  const fh = sheet ? Number(sheet.getAttribute("height")) / ${Object.keys(ROW).length} : 0;
  const m = sheet ? new DOMMatrix(getComputedStyle(sheet).transform === "none" ? undefined : getComputedStyle(sheet).transform) : null;
  const ry = /translate\\(\\s*[-\\d.]+[ ,]+([-\\d.]+)\\)/.exec(row?.getAttribute("transform") || "");
  const sc = /scale\\(\\s*([-\\d.]+)/.exec(g.getAttribute("transform") || "");
  const bob = g.querySelector(".ayato-bob");
  const bt = bob ? getComputedStyle(bob).transform : "none";
  return {
    t: performance.now(),
    walking: g.classList.contains("walking"),
    ready: g.classList.contains("walk-ready"),
    dir: g.dataset.dir || "",
    scale: sc ? Number(sc[1]) : NaN,
    kind: showWalk ? "sheet" : "still",
    frame: m && fw ? Math.round(-m.e / fw) : -1,
    row: ry && fh ? Math.round(-Number(ry[1]) / fh) : -1,
    frames: n,
    /* 体の弾み（世界座標。上がるとき負）と、止まった1枚の背（世界座標） */
    lift: bt === "none" ? 0 : new DOMMatrix(bt).f,
    liftAt: bob ? Number(bob.dataset.lift) : NaN,
    rest: sheet && n ? Math.round((-parseFloat(sheet.style.getPropertyValue("--ayato-rest")) / 100) * n) : -1,
    bodyCx: r.left + r.width / 2,
    box: { x: r.left, y: r.top, w: r.width, h: r.height },
    shadowCx: sr ? sr.left + sr.width / 2 : NaN,
    shadowRx: shadow ? shadow.rx.baseVal.value : NaN,
    shadowRy: shadow ? shadow.ry.baseVal.value : NaN,
    stillAnim: still ? getComputedStyle(still).animationName : "",
    sheetAnim: sheet ? sheet.getAnimations().length : 0,
    href: sheet ? sheet.getAttribute("href") : null,
  };
}`;

/* 毎フレーム記録する。**撮る道具のほうが遅い**ので（1枚 50〜150ms）、
   コマ（125ms ごと）の順番は画面の写しではなくこちらで読む */
const REC_ON = `() => {
  window.__rec = [];
  window.__recOn = true;
  const probe = (${PROBE});
  const tick = () => {
    if (!window.__recOn) return;
    try {
      const p = probe();
      if (p) window.__rec.push(p);
    } catch (e) {
      window.__recErr = String(e);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}`;
const REC_OFF = `() => {
  window.__recOn = false;
  if (window.__recErr) throw new Error("記録の途中で落ちた: " + window.__recErr);
  return window.__rec;
}`;

/**
 * 画素から、あやと（白でも影の色でもない画素）と影（あざやかな紫に塗り替えた楕円）の
 * 外接矩形を読む。読むのは同じブラウザの canvas。
 *
 * **影も同じ1枚から読む。** 箱の位置（DOM）と画素（撮った絵）を別々の時刻に取ると、
 * カメラがあやとを追って動く島では、そのあいだに画面がずれて「足が跳んだ」に見える
 * （手で作った島で、歩き出した瞬間に 12px と出た）。
 */
async function inkBox(dec, png, dsf) {
  return await dec.evaluate(
    async ({ src, dsf }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const box = () => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 });
      const me = box();
      const sh = box();
      const put = (b, i, y) => {
        b.n++;
        if (i < b.x0) b.x0 = i;
        if (i > b.x1) b.x1 = i;
        if (y < b.y0) b.y0 = y;
        if (y > b.y1) b.y1 = y;
      };
      for (let y = 0; y < c.height; y++)
        for (let i = 0; i < c.width; i++) {
          const k = (y * c.width + i) * 4;
          const r = d[k], g = d[k + 1], b = d[k + 2];
          if (r >= 235 && g >= 235 && b >= 235) continue;
          // 紫（とその白とのにじみ）は影。灰色は g が r・b と同じなので混ざらない
          if ((r > 200 && b > 200 && g < Math.min(r, b) - 40) || (r >= 235 && b >= 235)) put(sh, i, y);
          else put(me, i, y);
        }
      if (!me.n || !sh.n) return null;
      return {
        top: me.y0 / dsf,
        bottom: (me.y1 + 1) / dsf,
        cx: (me.x0 + me.x1 + 1) / 2 / dsf,
        h: (me.y1 + 1 - me.y0) / dsf,
        n: me.n,
        sh: { left: sh.x0 / dsf, right: (sh.x1 + 1) / dsf, bottom: (sh.y1 + 1) / dsf },
      };
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, dsf },
  );
}

/** 撮った絵を横に並べて1枚にする（ラベルつき）。 */
async function strip(dec, shots, file) {
  if (!OUT || !shots.length) return;
  const data = await dec.evaluate(async (list) => {
    const imgs = [];
    for (const s of list) {
      const im = new Image();
      im.src = s.src;
      await im.decode();
      imgs.push(im);
    }
    const pad = 6;
    const lab = 30;
    const w = imgs.reduce((a, im) => a + im.width + pad, pad);
    const h = Math.max(...imgs.map((im) => im.height)) + lab + pad * 2;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.fillStyle = "#222";
    x.fillRect(0, 0, w, h);
    let at = pad;
    x.font = "bold 18px sans-serif";
    imgs.forEach((im, i) => {
      x.drawImage(im, at, pad);
      x.fillStyle = "#fff";
      x.fillText(list[i].label, at + 2, pad + im.height + 22);
      at += im.width + pad;
    });
    return c.toDataURL("image/png");
  }, shots.map((s) => ({ label: s.label, src: `data:image/png;base64,${s.png.toString("base64")}` })));
  writeFileSync(join(OUT, file), Buffer.from(data.split(",")[1], "base64"));
  console.log(`  # 絵: ${join(OUT, file)}（${shots.length}枚）`);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const DSF = 2;
if (OUT) mkdirSync(OUT, { recursive: true });

/** 1面ぶん。`reduce` は動きを減らす設定で開く */
async function onePage(path, reduce) {
  const tag = `${path}${reduce ? "（動きを減らす）" : ""}`;
  console.log(`\n■ ${tag}`);
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: DSF,
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  /* **`offline()`（route の差し替え）は使わない。** Playwright は route を張ると
     HTTP のキャッシュを切るので、`new Image()` で読んだシートを `<image>` が
     もう一度取りにいき、本番では1回のものが**2回に数えられる**（実測）。
     ここで見るのはあやとだけなので、住人の絵が外へ出られず空でも困らない */
  /* 画素を読む面は**別の窓（context）**に置く。同じ窓に2面あると、あとから開いた
     ほうが前に出て、島の面の rAF が間引かれる（1.3秒で 1〜4 フレームしか来なかった） */
  const dctx = await b.newContext();
  const dec = await dctx.newPage();
  await dec.goto("about:blank");
  const p = await ctx.newPage();
  let asked = 0;
  p.on("request", (r) => {
    if (r.url().includes("/characters/ayato-walk.webp")) asked++;
  });
  await p.addInitScript(() => {
    // 到着演出を飛ばす（`framecpu.mjs` と同じ鍵）。見たいのは降りたあと
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
      localStorage.setItem("ayato-island-today", "2026-09-05");
    } catch {}
  });
  const res = await p.goto(ORIGIN + path, { waitUntil: "load", timeout: 60000 });
  if (!res || res.status() >= 400) {
    console.log(`  開けなかった（${res?.status()}）`);
    await ctx.close();
    await dctx.close();
    return false;
  }
  try {
    await p.waitForSelector("g.ayato .ayato-walk-sheet", { state: "attached", timeout: 20000 });
  } catch {
    console.log("  島のあやと（g.ayato と、その中のシート）が無い");
    await ctx.close();
    await dctx.close();
    return false;
  }
  await p.waitForTimeout(3500);
  const probe = async () => await p.evaluate(`(${PROBE})()`);
  const clip = async (q0) => {
    const q = q0 ?? (await probe());
    const bx = q.box;
    return {
      x: Math.max(0, bx.x - 40),
      y: Math.max(0, bx.y - 30),
      width: Math.min(W, bx.w + 80),
      height: Math.min(H, bx.h + 50),
    };
  };
  /* 白地に、あやとだけ。`visibility` は子が `visible` で戻せるので、あやとの <g> だけ戻す。
     島の絵・夜の色かぶせ・札はぜんぶ隠れる */
  const clean = async (on) =>
    await p.evaluate((on) => {
      let s = document.getElementById("__clean");
      if (on && !s) {
        s = document.createElement("style");
        s.id = "__clean";
        s.textContent = `html, body { background: #fff !important; } body * { visibility: hidden !important; } g.ayato, g.ayato * { visibility: visible !important; } ellipse:has(+ g.ayato) { visibility: visible !important; fill: #ff00ff !important; opacity: 1 !important; }`;
        document.head.appendChild(s);
      } else if (!on && s) s.remove();
    }, on);
  /* 足と中心は**影からの距離**で読む。影は反転も弾みもしない、あやとの本当の居場所。
     カメラがあやとを追って画面が動く島（手で作った島）では、画面の y だけを
     比べると、歩いたぶんカメラがずれたことを「足が跳んだ」と読む。
     影は同じ1枚の絵から読む（`inkBox`） */
  /* 撮るあいだはコマ送りと弾みを止める（ページの時計の速さを 0 に）。止めないと、
     コマを読んでから撮るまでの 100ms あまりでコマが進み、撮った絵と読んだコマが食い違う */
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Animation.enable");
  const inkNow = async () => {
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
    await clean(true);
    const q = await probe();
    const c = await clip(q);
    const png = await p.screenshot({ clip: c });
    await clean(false);
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    const box = await inkBox(dec, png, DSF);
    if (!box) return null;
    /* 影の楕円の中心。横は左右の端のまん中、縦は下の端から ry ぶん上
       （上半分は足に隠れている）。倍率は楕円の幅と rx から出す */
    const k = (box.sh.right - box.sh.left) / (2 * q.shadowRx);
    const scx = (box.sh.left + box.sh.right) / 2;
    const scy = box.sh.bottom - q.shadowRy * k;
    const bottom = box.bottom + c.y;
    const cx = box.cx + c.x;
    return { ...box, top: box.top + c.y, bottom, cx, foot: box.bottom - scy, off: box.cx - scx, k, q };
  };
  const shotNow = async (label, region) => ({ label, png: await p.screenshot({ clip: region ?? (await clip()) }) });
  const hold = async (keys, ms, during) => {
    await p.bringToFront();
    for (const k of keys) await p.keyboard.down(k);
    await p.evaluate(`(${REC_ON})()`);
    const t0 = Date.now();
    if (during) await during();
    const left = ms - (Date.now() - t0);
    if (left > 0) await p.waitForTimeout(left);
    const rec = await p.evaluate(`(${REC_OFF})()`);
    for (const k of keys) await p.keyboard.up(k);
    return rec;
  };
  /* 止まったあとは1回読むだけ。止まっているあいだは記録（rAF）に頼らない——
     撮るほうが続くと、その面の rAF が数百 ms 来ないことがある（実測で 0 フレーム） */
  const settle = async (ms = 500) => {
    await p.waitForTimeout(ms);
    return [await probe()];
  };

  // ---- 1. 開いただけ ----
  const q0 = await probe();
  check(`開いただけでは、シートを要求しない（${asked}回）`, asked === 0);
  check("開いただけでは、シートの href が空", !q0.href, `href=${q0.href}`);
  check("開いただけでは、止まった1枚を出している", q0.kind === "still" && !q0.ready);
  const ink0 = await inkNow();
  if (!ink0) {
    console.log("  白地に撮ったあやとに、色のついた画素が無い（撮れていない）");
    await ctx.close();
    await dctx.close();
    return false;
  }
  console.log(`  # 立ち姿（1枚）: 背 ${ink0.h.toFixed(1)}px  足 y=${ink0.bottom.toFixed(1)}  中心 x=${ink0.cx.toFixed(1)}  影の中心 x=${q0.shadowCx.toFixed(1)}`);
  check(`立ち姿（1枚）の体の中心と影の中心が揃う（${ink0.off.toFixed(1)}px）`, Math.abs(ink0.off) <= 1.5);

  if (reduce) {
    const rec = await hold(["ArrowLeft"], WALK_MS);
    await settle(300);
    const walking = rec.filter((r) => r.walking);
    console.log(`  # 記録 ${rec.length}フレーム / 歩いている ${walking.length} / x ${rec[0]?.bodyCx.toFixed(0)}→${rec.at(-1)?.bodyCx.toFixed(0)}`);
    check(`動きを減らす設定: 歩いた（${walking.length}フレーム）`, walking.length > 5);
    check(`動きを減らす設定: シートを要求しない（${asked}回）`, asked === 0);
    check("動きを減らす設定: シートに切り替わらない", walking.every((r) => r.kind === "still" && !r.ready));
    check("動きを減らす設定: コマ送りが始まっていない", walking.every((r) => r.sheetAnim === 0));
    check(
      "動きを減らす設定: 弾まない（hop が当たっていない）",
      walking.every((r) => r.stillAnim === "none"),
      [...new Set(walking.map((r) => r.stillAnim))].join(","),
    );
    await ctx.close();
    await dctx.close();
    return true;
  }

  // ---- 2. 初めて歩く。読み終わるまで歩き続ける ----
  const first = await hold(["ArrowLeft"], 600);
  check("歩き出したら .walking が付く", first.some((r) => r.walking));
  await p.keyboard.down("ArrowLeft");
  let readyAt = -1;
  for (let i = 0; i < 40 && readyAt < 0; i++) {
    if ((await probe()).ready) readyAt = i;
    else await p.waitForTimeout(100);
  }
  await p.keyboard.up("ArrowLeft");
  if (readyAt < 0) {
    console.log("  4秒歩いても .walk-ready にならない（シートが読めていない）");
    await ctx.close();
    await dctx.close();
    return false;
  }
  check(`歩いたあと、シートを要求した（${asked}回）`, asked === 1);
  await settle(400);

  /** 1つの向きを歩いて、記録を読む */
  const strips = [];
  /* 撮るのと数えるのは**別の歩きで**やる。撮っているあいだはその面の rAF が
     間引かれて（1.3秒で 40 フレームほど）、コマの記録が飛んで「順に送られていない」
     に見える。数えるほうの歩きでは1枚も撮らない */
  const photo = async (name, keys) => {
    const region = await clip();
    const shots = [];
    await hold(keys, WALK_MS, async () => {
      await p.waitForTimeout(250);
      for (let i = 0; i < 8; i++) {
        const q = await probe();
        shots.push(await shotNow(`${q.dir}${q.frame}`, region));
      }
    });
    await p.waitForTimeout(500);
    const q = await probe();
    shots.push(await shotNow(`立ち:${q.dir}${q.frame}`, region));
    strips.push([name, shots]);
  };
  const leg = async (name, keys, want, flip) => {
    const rec = await hold(keys, WALK_MS);
    /* 曲がりはじめは前の向きのまま（部品が新しい向きを 90ms 待ってから曲がる。
       `AyatoSprite.tsx` の TURN_MS）。最初の 150ms は数えない */
    const walk = rec.filter((r) => r.walking && r.kind === "sheet" && r.t - rec[0].t > 150);
    if (walk.length < 10) {
      const kinds = rec.map((r) => `${r.walking ? "w" : "-"}${r.kind[1]}`).join("").slice(0, 80);
      return ng(`${name}: 歩いているフレームが ${walk.length} しか無い（記録 ${rec.length}: ${kinds}）`);
    }
    const dirs = [...new Set(walk.map((r) => r.dir))];
    check(`${name}: 段は ${want}（${walk.length}フレーム）`, dirs.length === 1 && dirs[0] === want, dirs.join("→"));
    check(
      `${name}: 段の絵（row=${ROW[want]}）が出ている`,
      walk.every((r) => r.row === ROW[want]),
      [...new Set(walk.map((r) => r.row))].join(","),
    );
    check(`${name}: 反転は ${flip}`, walk.every((r) => r.scale === flip), [...new Set(walk.map((r) => r.scale))].join(","));
    // コマの順番（同じコマが続くのは畳む）
    const seq = walk.map((r) => r.frame).filter((f, i, a) => i === 0 || f !== a[i - 1]);
    const span = walk.at(-1).t - walk[0].t;
    const flips = rec.filter((r, i) => i > 0 && r.walking !== rec[i - 1].walking).length;
    console.log(`  # ${name}: 記録 ${rec.length}フレーム / 歩いている窓 ${walk.length}（${span.toFixed(0)}ms）/ 歩く⇄止まるの切り替わり ${flips}回`);
    const n = walk[0].frames;
    const skip = seq.slice(1).filter((f, i) => f !== (seq[i] + 1) % n).length;
    check(
      `${name}: ${n}コマが順に送られている（${seq.slice(0, 12).join("")}… 切り替わり ${seq.length - 1}回）`,
      new Set(seq).size === n && skip === 0 && seq.length - 1 >= n,
      `飛び・戻り ${skip}回`,
    );
    /* 弾みがコマと同じ時計で動いているか。両足のそろったコマ（奇数）だけ LIFT ぶん上がる */
    /* 歩き出しは立つコマの次（弾まないコマ）から */
    const first = rec.find((r) => r.walking && r.kind === "sheet");
    check(
      `${name}: 歩き出しのコマが、立つコマ（${first?.rest}）の次`,
      !!first && first.frame === (first.rest + 1) % first.frames,
      `frame=${first?.frame}`,
    );
    const up = walk[0].liftAt;
    const miss = walk.filter((r) => Math.abs(r.lift - (r.frame % 2 === 1 ? -up : 0)) > 0.01);
    check(
      `${name}: 弾みがコマとそろう（奇数コマで ${up.toFixed(2)} 上がる。ずれたフレーム ${miss.length}/${walk.length}）`,
      up > 0 && miss.length === 0,
      miss.slice(0, 3).map((r) => `frame=${r.frame} lift=${r.lift.toFixed(2)}`).join(" / "),
    );
    const off = Math.max(...walk.map((r) => Math.abs(r.bodyCx - r.shadowCx)));
    check(`${name}: 影と体（窓）の中心がずれない（最大 ${off.toFixed(2)}px）`, off <= 1);
    // 止まる
    const after = await settle(500);
    const last = after.at(-1);
    check(`${name}で止まる: 向きのまま（${last.dir}）`, last.dir === want && last.row === ROW[want] && last.scale === flip);
    check(`${name}で止まる: 立つコマ（${last.rest}）で止まる`, !last.walking && last.rest >= 0 && last.frame === last.rest && last.kind === "sheet", `frame=${last.frame} ${last.kind}`);
    check(`${name}で止まる: 弾みが残っていない（${last.lift}）`, last.lift === 0);
    const ink = await inkNow();
    const dh = ink.h - ink0.h;
    const db = ink.foot - ink0.foot;
    const dc = ink.off;
    console.log(`  # ${name}の立ち姿: 背 ${ink.h.toFixed(1)}px（1枚との差 ${dh.toFixed(1)}）  足の差 ${db.toFixed(1)}px  影との差 ${dc.toFixed(1)}px`);
    check(`${name}で止まる: 背が1枚と同じ（差 ${dh.toFixed(1)}px）`, Math.abs(dh) <= Math.max(1.5, ink0.h * 0.03));
    check(`${name}で止まる: 足の位置が1枚と同じ（差 ${db.toFixed(1)}px）`, Math.abs(db) <= 1.5);
    check(`${name}で止まる: 体の中心と影の中心が揃う（差 ${dc.toFixed(1)}px）`, Math.abs(dc) <= 1.5);
    return { rec, after };
  };

  // 歩き出した瞬間（止まった立ちコマ → 歩く1コマ目）で足が跳ばないか
  const startJump = async (keys) => {
    const before = await inkNow();
    for (const k of keys) await p.keyboard.down(k);
    await p.waitForFunction(() => document.querySelector("g.ayato")?.classList.contains("walking"), null, { timeout: 3000 });
    const at = await inkNow();
    for (const k of keys) await p.keyboard.up(k);
    await settle(400);
    /* 撮ったときのコマが弾むコマ（奇数）なら、そのぶん上がっているのが正しい */
    const want = at.q.frame % 2 === 1 ? -at.q.liftAt * at.k : 0;
    const db = at.foot - before.foot;
    const dh = at.h - before.h;
    check(
      `歩き出した瞬間: 足が跳ばない（コマ ${at.q.frame}・差 ${db.toFixed(1)}px / 弾みのぶん ${want.toFixed(1)}px）`,
      at.q.kind === "sheet" && Math.abs(db - want) <= 1.5,
    );
    check(`歩き出した瞬間: 背が変わらない（差 ${dh.toFixed(1)}px）`, Math.abs(dh) <= Math.max(1.5, before.h * 0.03));
  };

  await leg("左へ", ["ArrowLeft"], "side", 1);
  await leg("右へ", ["ArrowRight"], "side", -1);
  await startJump(["ArrowRight"]);
  await leg("下へ", ["ArrowDown"], "front", 1);
  await startJump(["ArrowUp"]);
  await leg("上へ", ["ArrowUp"], "back", 1);

  // ---- 斜め。ちょうど斜めは、いまの向きから動かない ----
  const diag = async (name, keys, from, want) => {
    const rec = await hold(keys, WALK_MS);
    const ds = rec.filter((r) => r.walking).map((r) => r.dir);
    const changes = ds.filter((d, i) => i > 0 && d !== ds[i - 1]).length;
    const end = ds.at(-1);
    check(
      `${name}（${from}から）: 段は ${want}、切り替わり ${changes}回`,
      end === want && changes <= (from === want ? 0 : 1),
      `${[...new Set(ds)].join("→")}`,
    );
    await settle(400);
  };
  await diag("斜め左上", ["ArrowUp", "ArrowLeft"], "back", "back");  // 上が先
  await diag("斜め右下", ["ArrowDown", "ArrowRight"], "back", "front");
  await leg("左へ（斜めの前）", ["ArrowLeft"], "side", 1);
  /* 押す順は「いまの向きのキーが先」。2つのキーのあいだに1フレーム挟まると、
     その1フレームは片方だけを押した向きになる（人が押しても同じ）。見たいのは
     **両方押したあとに揺れないか**なので、先に今の向きを押しておく */
  await diag("斜め左下", ["ArrowLeft", "ArrowDown"], "side", "side");
  await diag("斜め右上", ["ArrowRight", "ArrowUp"], "side", "side");

  if (OUT) {
    await photo("左へ", ["ArrowLeft"]);
    await photo("右へ", ["ArrowRight"]);
    await photo("下へ", ["ArrowDown"]);
    await photo("上へ", ["ArrowUp"]);
  }
  check(`歩きまわったあとも、シートの要求は1回（${asked}回）`, asked === 1);
  const slug = path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "top";
  for (const [name, shots] of strips) await strip(dec, shots, `${slug}-${name.replace(/[^\p{L}\p{N}]/gu, "")}.png`);
  await ctx.close();
  await dctx.close();
  return true;
}

let seen = 0;
for (const path of PAGES) {
  if (await onePage(path, false)) seen++;
  if (await onePage(path, true)) seen++;
}
await b.close();
console.log(`\n見た面 ${seen}/${PAGES.length * 2}  通った ${OK} / 落ちた ${BAD}`);
if (seen < PAGES.length * 2) process.exit(2);
process.exit(BAD ? 1 : 0);
