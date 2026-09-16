/**
 * **あやと島（`/` の島＝`components/isle/IsleStage.tsx`）の、歩ける／読めるを見張る。**
 *
 *   node tools/sprites/islenav.mjs                       # 本番を見る
 *   ORIGIN=http://127.0.0.1:4321 node tools/sprites/islenav.mjs   # 手元の書き出しを見る
 *
 * ## なぜ道具にしたか
 *
 * **同じ壊れ方が3回目だから。** 2026-09-15 のあやとの言葉:
 * 「あやと島、3日ぶりに触ったら、全体的に歩きづらくなってる。画像①下部押しても
 * マップが下にいかないので下に進めない。広げると、島に降りると島の地図が被ってる。
 * 代表6件のボタン無くなってる（この仕様毎回消すのそろそろやめろや）」
 *
 * 毎回同じ3つが戻ってくるのは、**目で見て気づくしかない形でしか確かめていない**から。
 * 島は幅と寄り引きで組み替わるので、1つの幅を1回見ても、隣の幅が壊れたことは出ない。
 * 数で落ちるようにして、出す前に回す。
 *
 * ## 見張る3つ
 *
 * - (A) 隅の道具（`.isle-view` / `.isle-atlas`）と看板ロゴが重なっていないこと。
 *   `chain.css` の `.isle-atlas { left: 68px }` は「道具は 48px の丸2つ」を前提に
 *   しているが、引きでは `.tool-label` が戻って `.isle-view` が 105px に太る。
 *   **前提が幅と寄り引きで変わるので、3幅×2状態を全部見る。**
 * - (B) 引きで、代表の札（`spec.ts` の `sign: true`）が6枚見えていること。
 *   `docs/island-design.md` 3-4／6章で引きに出せる札は6つまで。
 *   **DOM に在るかでは数えない。** 消える壊れ方はいつも `data-far` と `opacity` で、
 *   要素はそのまま残る。だから描かれた寸法と見え方で数える。
 * - (C) 島の下半分で、地面を押して南へ歩けること。「下に進めない」の正体は
 *   世界でもカメラでもなく（矢印キーでは普通に南へ歩ける）、**指が地面に届いて
 *   いない**こと。地面の空き具合と、実際に南へ進むかの2つを見る。
 *
 * ## 押しどころは、測った直後に押す
 *
 * 島は動いている。住人が歩くので、空いていた点が 0.1 秒後には住人の当たりに
 * なっている。1点だけ試して落とすと、住人にぶつかっただけの日に赤くなる。
 * **下から順に何点か試して、1点でも南へ歩けたら通す。**
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

/** 見る幅。スマホ・タブレット・PC で島の組み替わりかたが違う。
    直している最中は `WIDTHS=390` で1幅だけに絞れる（3幅で1分半かかる） */
const ALL = [
  { w: 390, h: 844, mobile: true },
  { w: 768, h: 1024, mobile: false },
  { w: 1280, h: 800, mobile: false },
];
const PICK = (process.env.WIDTHS || "").split(",").filter(Boolean).map(Number);
const SIZES = PICK.length ? ALL.filter((s) => PICK.includes(s.w)) : ALL;
/** 引きに出ていてほしい代表の札の数（`docs/island-design.md` 3-4／6章） */
const SIGNS = Number(process.env.SIGNS || 6);
/** 島の下半分で、地面に届く点がこれを切ったら落とす */
const FREE = Number(process.env.FREE || 0.3);
/** 南へ進んだと認める量（島の座標）。カメラの揺り戻しを拾わない大きさ */
const SOUTH = Number(process.env.SOUTH || 60);
/** 島は curl 経由で1本ずつ取るので、描き終わるまで待つ */
const DRAW = 9000;

/* 手元に立てた静的サーバを見るときは curl の横取りを使わない。
   `viaCurl` が通すのは本番の名前だけなので、そのまま使うと手元の
   127.0.0.1 が1本残らず abort されて、真っ白の画面を測ることになる。
   かわりに外（住人の絵）だけ `offline` で差し替える。 */
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(ORIGIN);

const bad = [];
/** いま見ている幅。落ちた理由がどの幅のものか分からないと直しに行けない */
let W = "";
/* 中で回す関数は文字で持つ。**Playwright に文字を渡すときは「式」なので、
   `() => {…}` をそのまま渡すと関数そのものが返って undefined になる。**
   ここで呼び出しの形にしてから渡す */
const run = (p, fn) => p.evaluate(`(${fn})()`);
const ng = (m) => { bad.push(`${W} ${m}`); console.log(`  ← だめ: ${m}`); };
const px = (n) => `${Math.round(n)}px`;

/* ---- 判定 (A) 隅の道具どうし・看板ロゴの重なり ---------------------------- */

/** 画面の上の道具と看板の矩形を、**見えているものだけ**返す */
const CORNERS = `() => {
  const vis = (e) => {
    const s = getComputedStyle(e), b = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05
      && b.width > 4 && b.height > 4;
  };
  const box = (e) => { const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  /* **候補は順に見る。** querySelectorAll は書いた順ではなく文書の順で返すので、
     1本のセレクタに並べると入れ物（.hero-logo）が先に当たる。絵より先に */
  const one = (sels, name) => {
    for (const sel of sels) {
      const e = [...document.querySelectorAll(sel)].find(vis);
      if (e) return { name, ...box(e) };
    }
    return null;
  };
  /* 看板ロゴは **中の img を測る。** 入れ物（.hero-logo）は右寄せの箱なので
     幅いっぱい（358px）あり、絵が右上にしか無い寄りでも「重なっている」と出る。
     読む人が見ているのは絵のほうなので、絵で判定する。 */
  return [
    one([".isle-view"], "島をながめる／島におりる"),
    one([".isle-atlas"], "島の地図"),
    one([".hero-logo img", ".ih-logo img", ".ih-logo", ".hero-logo"], "看板ロゴ"),
  ].filter(Boolean);
}`;

function checkCorners(tag, rects) {
  const say = rects.map((r) => `${r.name} x${Math.round(r.x)}..${Math.round(r.x + r.w)} y${Math.round(r.y)}..${Math.round(r.y + r.h)}`);
  console.log(`  ${tag} 隅の道具: ${say.join(" / ")}`);
  if (rects.length < 3) ng(`${tag} 見えている道具／看板が ${rects.length} 個しかない（3個必要）`);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ow > 0 && oh > 0) ng(`${tag} ${a.name} と ${b.name} が重なっている（横 ${px(ow)} × 縦 ${px(oh)}）`);
    }
  }
}

/* ---- 判定 (B) 引きで代表の札が6枚 ---------------------------------------- */

const MARKS = `() => {
  const vis = (e) => {
    const s = getComputedStyle(e), b = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05
      && b.width > 4 && b.height > 4;
  };
  return [...document.querySelectorAll(".isle-spot.is-sign")].map((sp) => {
    const m = sp.querySelector(".isle-mark");
    const name = m?.querySelector("b")?.textContent?.trim()
      || m?.textContent?.trim().slice(0, 14) || "(名前なし)";
    /* data-far は「画面の外に出たので引っ込めた」印。引きは島ぜんぶが
       写っているはずなので、ここが付いていたら札が1枚消えている */
    return { name, far: sp.hasAttribute("data-far"), vis: !!m && vis(m) };
  });
}`;

function checkMarks(marks) {
  const on = marks.filter((m) => m.vis && !m.far);
  const off = marks.filter((m) => !(m.vis && !m.far));
  console.log(`  [引き] 代表の札: 見えている ${on.length}枚 / DOM に ${marks.length}枚`);
  console.log(`         出ている: ${on.map((m) => m.name).join("・") || "(なし)"}`);
  if (off.length) console.log(`         消えている: ${off.map((m) => `${m.name}（${m.far ? "data-far" : "見えない"}）`).join("・")}`);
  if (on.length < SIGNS) ng(`[引き] 代表の札が ${on.length}枚しか見えていない（${SIGNS}枚必要）。消えているのは ${off.map((m) => m.name).join("・")}`);
}

/* ---- 判定 (C) 下半分の地面の空きと、南へ歩けるか -------------------------- */

/** 島の枠の下半分（高さ 50%〜95%）を 9×12 で突いて、地面に届く点を返す */
const GROUND = `() => {
  const isle = document.querySelector(".isle");
  if (!isle) return null;
  const b = isle.getBoundingClientRect();
  const free = [], taken = {};
  for (let c = 0; c < 9; c++) for (let r = 0; r < 12; r++) {
    const x = Math.round(b.left + b.width * (c + 0.5) / 9);
    const y = Math.round(b.top + b.height * (0.5 + 0.45 * (r + 0.5) / 12));
    const el = document.elementFromPoint(x, y);
    /* 地面に届く＝島の中で、かつ [data-ui] にも板にも取られていないこと。
       IsleStage の onStageClick が closest("[data-ui]") で降りるので、
       そこと同じ見かたにしておく。島の外の要素が上に乗っている場合も
       クリックは島まで来ないので、ここで落ちる */
    if (el && isle.contains(el) && !el.closest("[data-ui]") && !el.closest(".panel")) free.push([x, y]);
    else {
      const k = el ? (el.closest("[data-ui]")?.className || el.className || el.tagName) : "(何も無い)";
      const key = String(k).trim().split(/\\s+/)[0].slice(0, 28) || "(名前なし)";
      taken[key] = (taken[key] || 0) + 1;
    }
  }
  const cx = b.left + b.width / 2;
  // 下から順に、横は真ん中に近いものから。人が「南へ行きたい」と押す場所の順
  free.sort((p, q) => (q[1] - p[1]) || (Math.abs(p[0] - cx) - Math.abs(q[0] - cx)));
  return { free, total: 108, taken };
}`;

const AYATO = `() => {
  const t = document.querySelector("g.ayato")?.getAttribute("transform") || "";
  return Number(t.match(/translate\\(([-\\d.]+) ([-\\d.]+)\\)/)?.[2] ?? NaN);
}`;

async function checkGround(p) {
  const g = await run(p, GROUND);
  if (!g) return ng("[寄り] 島（.isle）が無い");
  const rate = g.free.length / g.total;
  const who = Object.entries(g.taken).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" ");
  console.log(`  [寄り] 下半分の地面の空き: ${g.free.length}/${g.total}点（${(rate * 100).toFixed(0)}%）  取られている内訳: ${who || "なし"}`);
  if (rate < FREE) ng(`[寄り] 下半分で地面に届く点が ${(rate * 100).toFixed(0)}% しかない（${FREE * 100}% 必要）。押しても歩けない`);
  if (!g.free.length) return ng("[寄り] 下半分に地面へ届く点が1つも無い");

  /* **押す前に吹き出しを閉じる。** 吹き出しが出ているあいだは、どこを押しても
     閉じるだけ、という作り（onStageClick の頭）。閉じずに測ると必ず落ちる */
  const shut = async () => {
    if (await p.$(".isle-talk")) {
      await p.mouse.click(8, 8);
      await p.waitForTimeout(400);
    }
  };
  /* 島は動いている。住人が歩いて、さっき空いていた点が当たりになっていることが
     ある。**下から順に3点まで試して、1点でも南へ歩けたら通す。** */
  const tries = g.free.slice(0, 3);
  const log = [];
  for (const [x, y] of tries) {
    await shut();
    const before = await run(p, AYATO);
    await p.mouse.click(x, y);
    await p.waitForTimeout(2500);
    const after = await run(p, AYATO);
    const d = after - before;
    log.push(`(${x},${y}) y ${before.toFixed(0)}→${after.toFixed(0)}（${d >= 0 ? "+" : ""}${d.toFixed(0)}）`);
    if (d >= SOUTH) {
      console.log(`  [寄り] 南へ歩けた: ${log.join(" / ")}`);
      return;
    }
  }
  console.log(`  [寄り] 押した記録: ${log.join(" / ")}`);
  ng(`[寄り] 下半分を ${tries.length}点押しても、あやとが南へ ${SOUTH} 進まない（${log.join(" / ")}）。指が地面に届いていない`);
}

/* ---- 回す ---------------------------------------------------------------- */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`見るところ: ${ORIGIN}/`);
for (const s of SIZES) {
  W = `${s.w}px`;
  console.log(`\n── ${W} ─────────────────────────────────`);
  const ctx = await b.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    // 指で触る幅は指として開く。押しどころの当たりが mouse と変わる
    isMobile: s.mobile,
    hasTouch: s.mobile,
  });
  if (LOCAL) await offline(ctx);
  else await viaCurl(ctx);
  await apply(ctx, {});
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(DRAW);

  if (!(await p.$(".isle"))) {
    ng("島（.isle）が出ていない。ここから先は測れない");
    await ctx.close();
    continue;
  }

  // 寄り（島に降りている状態）
  await p.screenshot({ path: `/tmp/islenav-${s.w}-寄り.png` });
  checkCorners("[寄り]", await run(p, CORNERS));

  /* 引きへ。**(B) と引きの (A) は、歩かせる前に測る。** 歩くとカメラが動いて
     data-far の付きかたが変わるので、開いた直後の島とは別のものを測ることになる */
  await p.click(".isle-view");
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `/tmp/islenav-${s.w}-引き.png` });
  checkCorners("[引き]", await run(p, CORNERS));
  checkMarks(await run(p, MARKS));

  // 寄りに戻して、地面を押して歩けるかを見る
  await p.click(".isle-view");
  await p.waitForTimeout(2500);
  await checkGround(p);

  await ctx.close();
}
await b.close();

console.log("");
if (bad.length) {
  console.log(`だめ ${bad.length}件`);
  for (const m of bad) console.log(`  ・${m}`);
  console.log("スクショ: /tmp/islenav-<幅>-<寄り|引き>.png");
  process.exit(1);
}
console.log("島：隅の道具は重なっていない・引きに代表の札が6枚・下半分を押せば南へ歩ける");
process.exit(0);
