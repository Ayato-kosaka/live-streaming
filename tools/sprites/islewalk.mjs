/**
 * **歩ける島の「基本原則」を4つ、数で見張る。**
 *
 *   ORIGIN=http://127.0.0.1:4150 node tools/sprites/islewalk.mjs
 *   node tools/sprites/islewalk.mjs                 # 既定は本番（prod.mjs）
 *   W=1280 node tools/sprites/islewalk.mjs
 *   PAGES=/ node tools/sprites/islewalk.mjs
 *   BREAK=1 ORIGIN=... node tools/sprites/islewalk.mjs   # 仕込みを当てて、赤くなることを見る
 *
 * 終了コード: 0＝通った / 1＝破れがあった / 2＝測れなかった（対照が落ちた・島が無い）
 *
 * ## 何を見るか
 *
 * あやとの言葉（2026-10-14・本番のスマホ）:
 * 「あやと島の寄りの時の歩く操作性がとても悪い。…基本原則が守られてない印象」
 *
 * そこで決めた原則を、そのまま4つの判定にした。
 *
 *   (A) **四方に歩ける。** 地面を押して、上・下・左・右へ world 座標が動く
 *   (B) **主人公は画面の決まった場所に居る。** 歩いているあいだ、あやとの
 *       足元が枠の同じ高さ・同じ横位置から動かない。**例外は島の端だけ**で、
 *       そこは `.isle[data-rim]` が立っている回として別に数える
 *   (C) **建物を押しても面は変わらない。** `.isle-hit` を押して、行き先
 *       （`location.pathname`）も板（`.isle-sheet`）も変わらないこと
 *   (D) **字は画面の上にだけ出る。** 札（`.isle-going`）と吹き出し
 *       （`.isle-talk`）の上辺が、出ているあいだ**1か所から動かない**こと
 *   (E) **札が、左上の道具を覆わない。** 札は画面の幅いっぱいに置くので、
 *       上へ寄せすぎると「島をながめる」「島の地図」をまるごと隠す。
 *       **札は指を取る**ので、覆ったら押せない。2026-10-14 に実際にそうした
 *
 * ## ほかの道具と仕事が重ならないか
 *
 * | 道具 | 見ているもの |
 * | --- | --- |
 * | `islereach.mjs` | 降り立った位置で、入口に**指が届くか** |
 * | `islecover.mjs` | 入口が**ほかの読みものに覆われていないか** |
 * | `islenav.mjs` | 隅の道具の重なり・引きの札6枚・**南の地面に指が届くか** |
 * | ここ | **カメラと主人公の約束**（歩ける向き・定位置・面が変わらない・字の場所） |
 *
 * `islenav.mjs` の (C) と近いが、あちらは「南の地面に**指が届くか**」で、
 * 届いたあと世界がどう動くかは見ていない（1点でも南へ動けば通す）。
 * ここは**四方ぶん、どこまで動いたかを world 座標で出す。**
 *
 * ## 測りかたの決め
 *
 * - **world 座標は `g.ayato` の `transform` から読む。** 画面の見た目から
 *   逆算しない。カメラが止まっているときと動いているときで答えが変わる
 * - **押すのは地面だけ。** `[data-ui]` の上を押すと歩かずに札が開く
 * - **喋っていたら閉じてから測る。** 喋っているあいだはどこを押しても
 *   閉じるだけで、あやとは1歩も歩かない（`islereach.mjs` が同じ罠を踏んだ）
 * - **1回押して決めない。** 1回のタップは「押した点まで」なので、
 *   その向きの限界は出ない。同じ向きを何度も押して、動かなくなるまで見る
 */
import { chromium } from "playwright-core";
import { at, net } from "./islereachsite.mjs";
import { ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";
import { AYATO_BOX_FN } from "./ayatobox.mjs";

const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const PAGES = (process.env.PAGES || "/,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east")
  .split(",")
  .filter(Boolean);
/** 1方向あたり、何回押すか */
const PUSH = Number(process.env.PUSH || 7);
/** その向きへ「歩けた」と言える最小の移動量（ワールド単位）。あやとの背丈の半分 */
const MIN_STEP = Number(process.env.MIN_STEP || 30);
/** 定位置からのずれを、どこまで許すか（画面px）。ease の行き過ぎぶん */
const HOLD_TOL = Number(process.env.HOLD_TOL || 14);
/** 「みる」を押して入れることまで見る軒数。1軒ごとに開き直すので全軒は高い */
const GO_CHECK = Number(process.env.GO_CHECK || 3);
/** 字の出る場所が動いてよい量（画面px） */
const SAY_TOL = Number(process.env.SAY_TOL || 2);
/** 仕込みを当てて、判定が赤くなることを見る */
const BREAK = process.env.BREAK === "1";

/* ---- 島の中を読む ------------------------------------------------------- */

/** あやとの world 座標・画面での居場所・字の箱・端で止めているか、を1回ぶん */
const READ = `(() => {
  ${AYATO_BOX_FN}
  const isle = document.querySelector(".isle");
  if (!isle) return null;
  const ib = isle.getBoundingClientRect();
  const g = document.querySelector("g.ayato");
  if (!g) return null;
  const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(g.getAttribute("transform") || "");
  /* 見えている箱。g の箱は、歩くときの窓の外（シートの残り11コマ）まで含む（ayatobox.mjs） */
  const mb = ayatoBox(g);
  const say = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) return null;
    return { top: Math.round(b.top - ib.top), bottom: Math.round(b.bottom - ib.top) };
  };
  return {
    wx: m ? Number(m[1]) : null,
    wy: m ? Number(m[2]) : null,
    /* 足元＝絵の下辺。あやとの絵は足元で地面に接している（y=-AYATO_H から描く） */
    footY: Math.round(mb.bottom - ib.top),
    midX: Math.round(mb.left + mb.width / 2 - ib.left),
    isleH: Math.round(ib.height),
    isleW: Math.round(ib.width),
    meH: Math.round(mb.height),
    meW: Math.round(mb.width),
    rim: isle.getAttribute("data-rim") || "",
    talking: isle.classList.contains("is-talking"),
    sheet: !!document.querySelector(".isle-sheet"),
    going: say(".isle-going .isle-mark"),
    talk: say(".isle-talk"),
    /* (E) 左上の道具（島をながめる／島の地図）が、札に隠れていないか。
       札（.isle-going）は画面の幅いっぱいに置くので、上へ寄せすぎると
       道具をまるごう覆う。2026-10-14 に実際にそうした
       （札 上10〜60 / 道具 上12〜60 でちょうど重なった）。
       あやとの指摘:「あなたの対応だと、左上のボタンが押せなくなって困るのよ」。

       当たりでは拾えない。札は指を通す設定（pointer-events:none）なので
       elementFromPoint は道具を返す——押せてはいる。隠れているだけ。
       見えないものは押せないので、絵の重なりで見る。 */
    tools: (() => {
      const card = document.querySelector(".isle-going .isle-mark");
      if (!card) return [];
      const cs = getComputedStyle(card);
      if (cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return [];
      const c = card.getBoundingClientRect();
      if (c.width < 4 || c.height < 4) return [];
      const zOf = (x) => { let n = x, z = 0; while (n && n !== document.body) {
        const v = getComputedStyle(n).zIndex; if (v !== "auto") { z = Number(v); break; } n = n.parentElement; } return z; };
      const zc = zOf(card);
      return [[".isle-view", "島をながめる"], [".isle-atlas", "島の地図"]].map((pair) => {
        const el = document.querySelector(pair[0]);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        if (b.width < 4 || b.height < 4) return null;
        const ix = Math.min(c.right, b.right) - Math.max(c.left, b.left);
        const iy = Math.min(c.bottom, b.bottom) - Math.max(c.top, b.top);
        if (ix <= 0 || iy <= 0) return null;
        if (zc <= zOf(el)) return null;
        const 割 = Math.round((ix * iy) / (b.width * b.height) * 100);
        return pair[1] + " の " + 割 + "% を札が隠している";
      }).filter(Boolean);
    })(),
    /** 島の上に浮いている札。**寄りでは1枚も出ない約束**（字は上の帯だけ） */
    onIsle: [...document.querySelectorAll(".isle-spot .isle-mark")].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && Number(cs.opacity) > 0.02;
    }).length,
  };
})()`;

/** 喋っていたら閉じる。閉じないと、押しても歩かない */
async function shut(p) {
  for (let i = 0; i < 3; i++) {
    const on = await p.evaluate(() => !!document.querySelector(".isle.is-talking")).catch(() => false);
    if (!on) return;
    await p.mouse.click(5, 5).catch(() => {});
    await p.waitForTimeout(250);
  }
}

/** その向きの端を押す。押せる地面が無ければ false */
async function pushGround(p, dir) {
  const pt = await p.evaluate((d) => {
    const isle = document.querySelector(".isle");
    if (!isle) return null;
    const b = isle.getBoundingClientRect();
    /* 向きごとに、枠のその側を内から外へ探す。**[data-ui] の上は押さない**
       （押すと歩かずに札が開く。`islecover.mjs` の GROUND と同じ見かた） */
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const tries = [];
    for (let k = 46; k >= 8; k -= 6) {
      const f = k / 100;
      if (d === "d") for (const ox of [0, -0.22, 0.22]) tries.push([cx + b.width * ox, cy + b.height * f]);
      if (d === "u") for (const ox of [0, -0.22, 0.22]) tries.push([cx + b.width * ox, cy - b.height * f]);
      if (d === "l") for (const oy of [0, -0.18, 0.18]) tries.push([cx - b.width * f, cy + b.height * oy]);
      if (d === "r") for (const oy of [0, -0.18, 0.18]) tries.push([cx + b.width * f, cy + b.height * oy]);
    }
    for (const [x, y] of tries) {
      if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
      const el = document.elementFromPoint(x, y);
      if (!el || !isle.contains(el)) continue;
      if (el.closest("[data-ui]")) continue;
      return { x: Math.round(x), y: Math.round(y) };
    }
    return null;
  }, dir);
  if (!pt) return false;
  await p.mouse.click(pt.x, pt.y);
  return true;
}

/* ---- 仕込み（対照）------------------------------------------------------
   **「なんでも緑と言う道具」になっていないことまで見る。**
   4つの判定それぞれに、その判定だけが落ちるはずの仕込みを当てる。
   ------------------------------------------------------------------------ */
const PLANT = `(() => {
  /* (A) 地面を押しても歩かない。**建物（[data-ui]）の押しどころは残す**
     ——残さないと (C) の仕込みまで効かなくなる */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("[data-ui]")) return;
    e.stopPropagation();
  }, true);
  /* (B) 主人公が画面の上で揺れる。CSS の animation は inline style より強いので、
     島が毎フレーム書いている transform を上書きできる */
  const st = document.createElement("style");
  st.textContent =
    "@keyframes isleWalkPlant { from { transform: translateY(0) } to { transform: translateY(90px) } }" +
    ".isle-svg { animation: isleWalkPlant 0.9s linear infinite alternate !important }" +
    /* (D) 字が下に出る */
    ".isle-going, .isle-talk { top: auto !important; bottom: 20px !important }" +
    /* (E) 札が左上の道具を覆う（上へ寄せすぎた日の姿） */
    ".isle-going { top: 10px !important; bottom: auto !important }" +
    ".isle-going .isle-mark { max-width: none !important; width: 94vw !important }";
  document.head.appendChild(st);
  /* (C) 建物を押すと面が変わる */
  document.querySelectorAll(".isle-hit").forEach((b) => {
    b.addEventListener("click", () => { location.href = "/about.html"; });
  });
  return true;
})()`;

/* ---- 1面ぶん ------------------------------------------------------------ */

async function run(ctx, path) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));
  await p.goto(at(path), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2200);
  if (!(await p.$(".isle"))) {
    await p.close();
    return { skip: "島が出ていない" };
  }
  const start = await p.evaluate(READ);
  if (!start || start.wx === null) {
    await p.close();
    return { skip: "あやとの居場所が読めない" };
  }
  if (BREAK) await p.evaluate(PLANT);
  await shut(p);

  const samples = [];
  const take = async () => {
    const r = await p.evaluate(READ).catch(() => null);
    if (r && !r.sheet) samples.push(r);
    return r;
  };
  await take();

  /* --- (C) 建物を押しても面は変わらない --------------------------------- */
  const keep = [];
  /** 「みる」を押したら入れたか。**裏返しの見張り**（下の `GO_CHECK`） */
  const went = [];
  const n = await p.evaluate(() => document.querySelectorAll(".isle-spot .isle-hit").length);
  const path0 = new URL(at(path)).pathname;
  for (let i = 0; i < n; i++) {
    await shut(p);
    const hit = await p.evaluate((k) => {
      const sp = document.querySelectorAll(".isle-spot")[k];
      const el = sp?.querySelector(".isle-hit");
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === "none") return null;
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width / 2);
      const y = Math.round(b.top + b.height / 2);
      if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return null;
      const top = document.elementFromPoint(x, y);
      if (!top || !(top === el || el.contains(top))) return null;
      return { x, y, name: (el.getAttribute("aria-label") || "?").replace(/をみる$/, "") };
    }, i);
    if (!hit) continue;
    await p.mouse.click(hit.x, hit.y);
    await p.waitForTimeout(520);
    const now = await p.evaluate(() => ({
      path: location.pathname,
      sheet: !!document.querySelector(".isle-sheet"),
      said: document.querySelector(".isle-going .isle-mark b")?.textContent || "",
    })).catch(() => null);
    if (!now) continue;
    keep.push({
      name: hit.name,
      moved: now.path !== path0 || now.sheet,
      said: now.said,
    });
    if (now.path !== path0) {
      // 出ていってしまった。戻して続ける（残りの建物も見る）
      await p.goto(at(path), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(1800);
      if (BREAK) await p.evaluate(PLANT);
      await take();
      continue;
    }
    if (now.sheet) {
      await p.keyboard.press("Escape").catch(() => {});
      await p.waitForTimeout(400);
    }
    await take();

    /* --- 裏返しも見る。「みる」を押したら、ちゃんと入れること ------------
       **「押しても何も起きない」だけを見る見張りは、全部が死んでいても緑。**
       行き先が1つも無くなった島は、建物を押しても面が変わらない。
       最初の数軒だけ、札の「みる」を押して**入れること**まで確かめる
       （1軒ごとに開き直すので、全軒ぶんは高い）。 */
    if (went.length < GO_CHECK) {
      const go = await p.evaluate(() => {
        const el = document.querySelector(".isle-going .isle-go");
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const x = Math.round(b.left + b.width / 2);
        const y = Math.round(b.top + b.height / 2);
        if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return null;
        return { x, y, name: document.querySelector(".isle-going .isle-mark b")?.textContent || "?" };
      });
      if (go) {
        await p.mouse.click(go.x, go.y);
        await p.waitForTimeout(700);
        const after = await p.evaluate(() => ({
          path: location.pathname,
          sheet: !!document.querySelector(".isle-sheet"),
        })).catch(() => ({ path: path0, sheet: false }));
        went.push({ name: go.name, in: after.path !== path0 || after.sheet });
        await p.goto(at(path), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
        await p.waitForTimeout(1800);
        if (BREAK) await p.evaluate(PLANT);
        await take();
      }
    }
  }

  /* --- (A) 四方（建物を見たあと。カメラの位置は問わない）---------------
     1方向ずつ、押して → 測って を繰り返す。**毎回いちばん端を押し直す**
     （カメラが動くので、前に押した点はもう端ではない） */
  const reach = {};
  /* **順は 上 → 右 → 下 → 左。** あやとは浜の船着き場に降りるので、
     いきなり下を試すと「島の南のふち」に当たって 0 と出る（世界が尽きたのを
     「歩けない」と読むのは、#85 の「測れないものを、届かないものと混ぜない」
     と同じ間違い）。先に北へ上がってから、南を試す */
  for (const dir of ["u", "r", "d", "l"]) {
    const from = await p.evaluate(READ);
    if (!from) break;
    let best = 0;
    for (let i = 0; i < PUSH; i++) {
      await shut(p);
      if (!(await pushGround(p, dir))) break;
      await p.waitForTimeout(430);
      const now = await take();
      if (!now || now.wx === null) continue;
      const d =
        dir === "d" ? now.wy - from.wy
        : dir === "u" ? from.wy - now.wy
        : dir === "l" ? from.wx - now.wx
        : now.wx - from.wx;
      best = Math.max(best, Math.round(d));
    }
    reach[dir] = best;
    /* 次の向きへ行く前に、押した向きとは逆へ戻しておく必要は無い。
       どの向きも「いまいる所から、その向きへ動けるか」を見るので */
  }

  await p.close();

  /* --- まとめ ----------------------------------------------------------- */
  const free = samples.filter((s) => !s.rim); // 島の端で止めていない回だけ
  const pinned = samples.filter((s) => s.rim);
  const foot = free.map((s) => s.footY);
  const midx = free.map((s) => s.midX);
  const says = samples.flatMap((s) => [s.going, s.talk].filter(Boolean));
  /* (E) どの場面でも、取られていたら挙げる */
  const toolsBad = samples.flatMap((s) => s.tools || []);
  const sayTops = says.map((q) => q.top);
  const isleH = samples[0]?.isleH ?? 0;
  const isleW = samples[0]?.isleW ?? 0;
  return {
    reach,
    me: { w: samples[0]?.meW ?? 0, h: samples[0]?.meH ?? 0 },
    across: samples[0]?.meW ? +(isleW / samples[0].meW).toFixed(2) : 0,
    isleH,
    hold: foot.length
      ? { n: foot.length, loY: Math.min(...foot), hiY: Math.max(...foot), loX: Math.min(...midx), hiX: Math.max(...midx) }
      : null,
    pinned: pinned.length,
    pinnedFoot: pinned.length ? { lo: Math.min(...pinned.map((s) => s.footY)), hi: Math.max(...pinned.map((s) => s.footY)) } : null,
    say: sayTops.length ? { n: sayTops.length, lo: Math.min(...sayTops), hi: Math.max(...sayTops) } : null,
    tools: toolsBad,
    onIsle: Math.max(0, ...samples.map((s) => s.onIsle)),
    keep,
    went,
    errs,
    looked: samples.length,
  };
}

/* ---- 回す --------------------------------------------------------------- */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`${ORIGIN}  幅${W}px${BREAK ? "  ★仕込みあり（赤くなるのが正しい）" : ""}`);
let 破れ = 0;
let 測れた面 = 0;
const 飛ばした = [];
for (const path of PAGES) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await net(ctx);
  await offline(ctx);
  const r = await run(ctx, path).catch((e) => ({ skip: String(e).slice(0, 80) }));
  await ctx.close();
  if (r.skip) {
    飛ばした.push(`${path}：${r.skip}`);
    continue;
  }
  測れた面++;
  const 言 = [];
  // (A)
  const dirName = { d: "下", u: "上", l: "左", r: "右" };
  const 足りない = Object.entries(r.reach).filter(([, v]) => v < MIN_STEP);
  if (足りない.length) 言.push(`歩けない向き ${足りない.map(([k, v]) => `${dirName[k]}(${v})`).join("・")}`);
  // (B)
  if (!r.hold) 言.push("定位置を1回も測れていない");
  else {
    const dy = r.hold.hiY - r.hold.loY;
    const dx = r.hold.hiX - r.hold.loX;
    if (dy > HOLD_TOL || dx > HOLD_TOL) 言.push(`主人公が動く 縦${dy}px 横${dx}px（端で止めた回は除く）`);
  }
  // (C)
  const 出た = r.keep.filter((k) => k.moved);
  if (出た.length) 言.push(`押したら面が変わった ${出た.map((k) => k.name).join("・")}`);
  // (D)
  if (r.say && r.say.hi - r.say.lo > SAY_TOL) 言.push(`字の出る場所が動く ${r.say.lo}〜${r.say.hi}px`);
  if (r.say && r.say.hi > r.isleH * 0.45) 言.push(`字が上に無い（上辺 ${r.say.hi}px / 島 ${r.isleH}px）`);
  if (r.onIsle) 言.push(`寄りなのに島の上に札が ${r.onIsle}枚`);
  // (E) 左上の道具。**札を出したあとの回で1度でも取られていたら赤**
  if (r.tools && r.tools.length) 言.push(`左上の道具が札に隠れている ${[...new Set(r.tools)].join("・")}`);
  // 裏返し。**「みる」で入れなくなっていたら、(C) の緑は意味が無い**
  if (!r.went.length) 言.push("「みる」を1回も押せていない（札が出ていない）");
  else {
    const 入れない = r.went.filter((k) => !k.in);
    if (入れない.length) 言.push(`「みる」を押しても入れない ${入れない.map((k) => k.name).join("・")}`);
  }
  if (r.errs.length) 言.push(`JSエラー${r.errs.length}`);

  if (言.length) 破れ += 言.length;
  console.log(
    `  ${path.padEnd(20)} 四方 下${String(r.reach.d ?? "-").padStart(4)} 上${String(r.reach.u ?? "-").padStart(4)}` +
      ` 左${String(r.reach.l ?? "-").padStart(4)} 右${String(r.reach.r ?? "-").padStart(4)}（ワールド単位）` +
      `  主人公 ${r.me.w}x${r.me.h}px＝横に${r.across}人` +
      `  定位置 ${r.hold ? `縦${r.hold.loY}〜${r.hold.hiY} 横${r.hold.loX}〜${r.hold.hiX}` : "-"}` +
      `  端で止めた${r.pinned}回${r.pinnedFoot ? `（足元 ${r.pinnedFoot.lo}〜${r.pinnedFoot.hi}）` : ""}` +
      `  字 ${r.say ? `上辺${r.say.lo}〜${r.say.hi}px ${r.say.n}回` : "出なかった"}` +
      `  左上の道具 ${r.tools.length ? "**" + r.tools.length + "件 隠れている**" : "ぜんぶ見えている"}` +
      `  建物${r.keep.length}軒 面が変わった${出た.length}軒` +
      `  みるで入れた${r.went.filter((k) => k.in).length}/${r.went.length}軒` +
      `  ${r.looked}回見た`,
  );
  if (言.length) for (const s of 言) console.log(`    ！ ${s}`);
}
await b.close();

if (飛ばした.length) {
  console.log(`  測れなかった面 ${飛ばした.length}:`);
  for (const s of 飛ばした) console.log(`    - ${s}`);
}
console.log(`  ${測れた面}面を測って、破れ ${破れ}件${BREAK ? "（仕込みを当てているので、0件なら道具が壊れている）" : ""}`);

if (!測れた面) {
  console.log("！ 1面も測れていない。「破れ0」ではない（docs/island-standards.md §15）");
  process.exit(2);
}
if (BREAK) {
  /* 仕込みの回は、**赤くならないほうが異常。** 4つの判定が全部落ちることまで見る */
  if (破れ < 4 * 測れた面) {
    console.log("！ 仕込みを当てたのに、拾えていない判定がある");
    process.exit(2);
  }
  console.log("対照：仕込みを当てたら、4つとも赤くなった");
  process.exit(0);
}
process.exit(破れ ? 1 : 0);
