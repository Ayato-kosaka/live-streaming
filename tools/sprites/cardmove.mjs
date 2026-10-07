/**
 * あやと島カードの「立ち位置を動かす」と「あやとも入れる」を、撮って数える。
 *
 *   PORT=4250 OUT=/tmp/claude-0/card node cardmove.mjs
 *
 * 配るのは書き出したもの（`site/.next-<port>`）なので、開くのは `/cards.html`。
 * 差し込みは `asme.mjs`（写真とカードと、入っている人）。住人の絵は
 * `route.mjs` が1人ずつ返す（先に `python3 tools/sprites/avatars.py`）。
 *
 * ## 何を数えるか
 *
 *  1. **指で引きずると動く**（CDP の本物の touch で動かして、前後の画素を比べる）
 *  2. **マウスでも動く**
 *  3. **自分のカード × ログイン済みなら覚える**（`POST /cards/<id>` が飛ぶ）
 *  4. **他人のカードでは飛ばない。動きはする**
 *  5. **ログインしていなければ飛ばない。動きはする**
 *  6. **開き直すと、覚えた場所に立っている**
 *  7. **もとにもどせる**
 *  8. **あやとを入れても、2人が重ならない・両方とも枠の中・足元がそろう**
 *     （焼き上がりの画素から、2人の立っているところを直に測る）
 *  9. **既定（何も触らない）の絵が、分ける前と1pxも変わらない**
 *     （master の `compose` の写しを画面の中で回して、画素を突き合わせる）
 *
 * ## 0件で黙って終わらない
 *
 * 数えるものが1つも見つからなかったら、**0という数字を報告して終わらない。**
 * 何が見つからなかったかを並べて、**終了コード2**で落ちる
 * （0=通った / 1=見つけた / 2=数えるものが無い。`island-standards.md` 10）。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4250";
const OUT = process.env.OUT || "/tmp/claude-0/card";
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

/** 見つからなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];
/** 守れていなかったもの。**空でなければ 1 で落ちる。** */
const broke = [];

const need = (what, n, least = 1) => {
  if (!(Number(n) >= least)) missing.push(`${what}=${n}（${least}以上を待っていた）`);
  return n;
};
const must = (what, ok, why = "") => {
  console.log(`  ${ok ? "ok  " : "NG  "} ${what}${why ? ` — ${why}` : ""}`);
  if (!ok) broke.push(`${what}${why ? `（${why}）` : ""}`);
  return ok;
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/**
 * 画面を1枚ひらく。**差し込みは毎回入れ直す**（context ごとに別物）。
 * @param {object} o どう開くか
 * @return {Promise<object>} 使うもの一式
 */
async function open(o = {}) {
  const ctx = await b.newContext({
    viewport: o.wide ? { width: 1280, height: 900 } : { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: !o.wide,
    hasTouch: !o.wide,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  if (!o.out) await apply(ctx);
  else {
    /* **ログインしていない人**として撮る。`asme.mjs` の `apply` は合言葉まで
       入れてしまうので呼べない。写真とカードだけ、自分で置く。 */
    await ctx.route(/\/island-api\//, (r) => {
      const path = new URL(r.request().url()).pathname.replace("/island-api", "");
      // キャラクターの絵は `route.mjs` が返す。ここで JSON にしない
      if (/^\/characters\//.test(path)) return r.fallback();
      return r.fulfill({status: 200, contentType: "application/json", body: "{}"});
    });
    // 写真の置き場。**CORS を付ける**（付けないと canvas が汚れて焼けない）
    await ctx.route(/firebasestorage\.googleapis\.com.*photos%2F/, (r) => {
      const key = /photos%2F([^.]+)\./.exec(r.request().url())?.[1] ?? "x";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067">` +
        `<rect width="1600" height="1067" fill="#2f5f4a"/>` +
        `<rect y="740" width="1600" height="327" fill="#1e4433"/>` +
        `<text x="800" y="560" text-anchor="middle" fill="#fff" font-size="140" ` +
        `font-family="sans-serif">${key}</text></svg>`;
      return r.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        headers: {"access-control-allow-origin": "*"},
        body: svg,
      });
    });
  }
  /** 飛んだ `POST /cards/<id>`。**覚えたかどうかは、ここの数で見る** */
  const posted = [];
  await ctx.route(/\/island-api\/cards\/[^/]+$/, async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    let body = {};
    try {
      body = JSON.parse(r.request().postData() || "{}");
    } catch {}
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split("/").pop());
    posted.push({ id, body });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id, ...body, moved: true }),
    });
  });
  /* ログインしていない人。**合言葉の置き場を空にする**（`apply` を
     呼んでいないので、そもそも入っていない）。 */
  if (o.cards) {
    await ctx.route(/\/island-api\/cards$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ cards: o.cards }),
      }),
    );
  }
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/cards.html`, { waitUntil: "networkidle" });
  return { ctx, p, posted, errs };
}

/** 紙を開く。写真のマスを photoId で選ぶ（差し込みの `ph1` が自分のぶん）。 */
async function openSheet(p, photoId) {
  /* 探しているマスが出るまで畳みをひらく。**`.longer` は開く／畳むの
     行ったり来たりなので、回数では決めない**（決め打ちで8回押すと、
     奇数回のときだけ畳まれた状態で終わる。実測でそうなった）。 */
  const there = () =>
    p.evaluate(
      (want) =>
        [...document.querySelectorAll(".akd-tile img")].some((i) => i.src.includes(want)),
      photoId,
    );
  for (let i = 0; i < 12 && !(await there()); i++) {
    const got = await p.evaluate(() => {
      const m = document.querySelector(".longer");
      if (!m) return false;
      m.click();
      return true;
    });
    if (!got) break;
    await p.waitForTimeout(250);
  }
  const n = await p.evaluate((want) => {
    const tiles = [...document.querySelectorAll(".akd-tile")];
    const i = tiles.findIndex((t) => (t.querySelector("img")?.src || "").includes(want));
    if (i < 0) return -1;
    tiles[i].click();
    return i;
  }, photoId);
  if (n < 0) return false;
  await p.waitForSelector(".akd-modal .akd-stage img", { timeout: 8000 });
  await p.waitForTimeout(400);
  return true;
}

/** 入れる人を選ぶ。`nth` は「入れない」を除いた何人目か（1から）。 */
async function pick(p, nth) {
  const got = await p.evaluate((k) => {
    const all = [...document.querySelectorAll(".npick")];
    const t = all[k];
    if (!t) return null;
    t.click();
    return t.getAttribute("aria-label") || "";
  }, nth);
  if (got === null) return false;
  await p.waitForTimeout(700);
  return true;
}

/** いま出ている1枚の画素。**焼き上がりそのもの**（`<img>` の中身）。 */
const shotPixels = (p) =>
  p.evaluate(async () => {
    const img = document.querySelector(".akd-modal .akd-stage img");
    if (!img) return null;
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    /* 画素をそのまま持ち出すと重いので、**粗いあらまし**にする。
       動いたかどうかはこれで分かる */
    let sum = 0;
    const marks = [];
    for (let i = 0; i < d.length; i += 4 * 97) {
      sum = (sum + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) % 1000000007;
    }
    for (const q of [0.25, 0.5, 0.75]) {
      const at = (Math.floor(cv.height * q) * cv.width + Math.floor(cv.width * 0.8)) * 4;
      marks.push(d[at], d[at + 1], d[at + 2]);
    }
    return { w: cv.width, h: cv.height, sum, marks };
  });

/** 指で引きずる。**CDP の本物の touch**（pointerType が touch になる） */
async function fingerDrag(p, from, to, steps = 12) {
  const cdp = await p.context().newCDPSession(p);
  const send = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
    });
  await send("touchStart", from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await send(
      "touchMove",
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await p.waitForTimeout(16);
  }
  await send("touchEnd", to.x, to.y);
  await cdp.detach();
  await p.waitForTimeout(500);
}

const stageBox = (p) => p.locator(".akd-modal .akd-stage img").boundingBox();

console.log(`# ${BASE}/cards.html`);

/* ================================================================== 1〜4 */

console.log("\n# スマホ幅。自分のカード × ログイン済み");
const one = await open();
need("写真のマス", await one.p.locator(".akd-tile").count());
must("自分の写真（ph1）の紙が開く", await openSheet(one.p, "ph1"));

// (1) 素の写真。**開いた瞬間は誰も入っていない**
await one.p.screenshot({ path: `${OUT}/1-plain.png` });
const plain = await shotPixels(one.p);
need("素の1枚の大きさ", plain?.w ?? 0, 100);
must("開いた瞬間は、入れる手が1つも出ていない",
  (await one.p.locator(".akd-tune").count()) === 0);

/* ---- (9) 既定の絵が、分ける前と1pxも変わらない ----
   **master の `compose` の写しを画面の中で回して、画素で突き合わせる。**
   式が同じことは `cardplace_selftest.mjs` が見ているが、**描いた結果が
   同じかどうかは絵でしか分からない**（描き順・save/restore・影）。 */
need("入れる人の札", await one.p.locator(".npick").count(), 2);
must("1人目を入れられる", await pick(one.p, 1));
await one.p.screenshot({ path: `${OUT}/2-one.png` });
const one1 = await shotPixels(one.p);
must("入れたら絵が変わる", one1.sum !== plain.sum, `${plain.sum} → ${one1.sum}`);

const sameAsOld = await one.p.evaluate(async () => {
  /* **ここから下は master（2026-10-06）の `compose` の写し。**
     比べるためだけに置いてある。本体はもう `place.ts` を通る。 */
  const STAMP = { byWidth: 0.34, byHeight: 0.2, right: 0.02, bottom: 0.05, tilt: 0 };
  const OUT_LONG = 2048;
  const load = (src) =>
    new Promise((done) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => done(i);
      i.onerror = () => done(null);
      i.src = src;
    });
  function opaqueBox(img) {
    const all = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const step = Math.max(1, Math.floor(Math.max(all.w, all.h) / 256));
    const cw = Math.max(1, Math.round(all.w / step));
    const ch = Math.max(1, Math.round(all.h / step));
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, cw, ch);
    const data = g.getImageData(0, 0, cw, ch).data;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] <= 8) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return all;
    return {
      x: (x0 * all.w) / cw, y: (y0 * all.h) / ch,
      w: ((x1 - x0 + 1) * all.w) / cw, h: ((y1 - y0 + 1) * all.h) / ch,
    };
  }
  function stampBox(pw, ph, cw, ch, place) {
    const aspect = cw / Math.max(1, ch);
    const k = place ? Math.min(2, Math.max(0.4, place.scale || 1)) : 1;
    const w = (ph > pw ? pw * STAMP.byWidth : ph * STAMP.byHeight * aspect) * k;
    const h = w / aspect;
    if (!place) return { x: pw - pw * STAMP.right - w, y: ph - ph * STAMP.bottom - h, w, h };
    const x = Math.min(pw - w, Math.max(0, place.x * pw - w / 2));
    const y = Math.min(ph - h, Math.max(0, place.y * ph - h));
    return { x, y, w, h };
  }
  function groundShadow(g, at) {
    const cx = at.x + at.w / 2;
    const cy = at.y + at.h;
    const rx = at.w * 0.36;
    const ry = at.w * 0.09;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, "rgba(0,0,0,0.28)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.13)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.translate(-cx, -cy);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  function compose(photo, chr) {
    const long = Math.max(photo.naturalWidth, photo.naturalHeight);
    const k = long > OUT_LONG ? OUT_LONG / long : 1;
    const pw = Math.round(photo.naturalWidth * k);
    const ph = Math.round(photo.naturalHeight * k);
    const cv = document.createElement("canvas");
    cv.width = pw;
    cv.height = ph;
    const g = cv.getContext("2d");
    g.drawImage(photo, 0, 0, pw, ph);
    if (!chr) return cv;
    const src = opaqueBox(chr);
    const at = stampBox(pw, ph, src.w, src.h, null);
    groundShadow(g, at);
    g.drawImage(chr, src.x, src.y, src.w, src.h, at.x, at.y, at.w, at.h);
    return cv;
  }
  /* いま出ている1枚と同じ材料を集める。**写真は紙の中の絵、キャラクターは
     選ばれている札の絵**（どちらも画面が使っているのと同じ URL）。 */
  const on = document.querySelector(".npick.is-on img");
  const tile = [...document.querySelectorAll(".akd-tile img")].find(
    (i) => i.closest(".akd-tile") && i.src,
  );
  if (!on || !tile) return { ok: false, why: "材料が見つからない" };
  const [photo, chr] = await Promise.all([
    load(tile.src),
    load(on.src.replace(/plain-\d+/, "plain-640")),
  ]);
  if (!photo || !chr) return { ok: false, why: "絵が読めない" };
  const old = compose(photo, chr);
  const now = document.querySelector(".akd-modal .akd-stage canvas");
  if (!now || now.width !== old.width || now.height !== old.height) {
    return { ok: false, why: `大きさが違う ${now?.width}x${now?.height} / ${old.width}x${old.height}` };
  }
  const a = old.getContext("2d").getImageData(0, 0, old.width, old.height).data;
  const g2 = now.getContext("2d");
  const c = g2.getImageData(0, 0, now.width, now.height).data;
  let off = 0;
  let worst = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]);
    if (d > 0) off += 1;
    if (d > worst) worst = d;
  }
  return { ok: true, off, worst, px: a.length / 4 };
});
must("既定の絵が、分ける前と1画素も違わない",
  sameAsOld.ok && sameAsOld.off === 0,
  sameAsOld.ok ? `違った画素 ${sameAsOld.off}/${sameAsOld.px}（いちばん大きい差 ${sameAsOld.worst}）` : sameAsOld.why);

/* ---- (1) 指で引きずって動く ---- */
const box = await stageBox(one.p);
need("絵の横幅", Math.round(box?.width ?? 0), 100);
await fingerDrag(
  one.p,
  { x: box.x + box.width * 0.82, y: box.y + box.height * 0.82 },
  { x: box.x + box.width * 0.24, y: box.y + box.height * 0.5 },
);
await one.p.screenshot({ path: `${OUT}/5-finger-mobile.png` });
const moved1 = await shotPixels(one.p);
must("指で引きずると、立つところが変わる", moved1.sum !== one1.sum,
  `${one1.sum} → ${moved1.sum}`);
must("自分のカードなので、覚える（POST が飛ぶ）", one.posted.length >= 1,
  `POST ${one.posted.length} 回`);
const savedPlace = one.posted.at(-1)?.body ?? null;
console.log(`       覚えた立ち位置: ${JSON.stringify(savedPlace)}`);
must("覚えた値が 0〜1 に収まっている",
  !!savedPlace && savedPlace.x >= 0 && savedPlace.x <= 1 && savedPlace.y >= 0 && savedPlace.y <= 1);

/* ---- (8) あやとも入れる ---- */
const before = one.posted.length;
await one.p.locator(".akd-mate").click();
await one.p.waitForTimeout(800);
await one.p.screenshot({ path: `${OUT}/4-with-ayato.png` });
const two = await shotPixels(one.p);
must("あやとを入れると、絵が変わる", two.sum !== moved1.sum);
must("あやとを入れても覚えない（手元だけ）", one.posted.length === before,
  `POST が ${one.posted.length - before} 回増えた`);

/* 焼き上がりの画素から、立っている2人を測る。**地（写真）との差で拾う。**
   いま出ているものと、1人も入れていないものを比べれば、**足された画素＝人**。 */
const pair = await one.p.evaluate(async () => {
  const cv = document.querySelector(".akd-modal .akd-stage canvas");
  const g = cv.getContext("2d");
  const now = g.getImageData(0, 0, cv.width, cv.height).data;
  /* 地だけの1枚を、同じ写真から作る */
  const tile = [...document.querySelectorAll(".akd-tile img")].find((i) => i.src);
  const photo = await new Promise((done) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => done(i);
    i.onerror = () => done(null);
    i.src = tile.src;
  });
  const bg = document.createElement("canvas");
  bg.width = cv.width;
  bg.height = cv.height;
  bg.getContext("2d").drawImage(photo, 0, 0, cv.width, cv.height);
  const base = bg.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  /** 列ごとに「人の画素」が何個あるか */
  const col = new Array(cv.width).fill(0);
  /** 列ごとの、いちばん下にある人の画素（足元） */
  const foot = new Array(cv.width).fill(-1);
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      const d =
        Math.abs(now[i] - base[i]) +
        Math.abs(now[i + 1] - base[i + 1]) +
        Math.abs(now[i + 2] - base[i + 2]);
      // 影は薄いので拾わない。**人の形だけ**を見る
      if (d < 90) continue;
      col[x] += 1;
      if (y > foot[x]) foot[x] = y;
    }
  }
  /* 列のかたまりに分ける。**かたまりが2つなら、重なっていない。** */
  const runs = [];
  let at = null;
  for (let x = 0; x < cv.width; x++) {
    if (col[x] >= 3) {
      if (!at) at = { x0: x, x1: x };
      else at.x1 = x;
    } else if (at) {
      // 1〜2列の切れ目は、にじみで繋がったり切れたりする。4列以上で切る
      if (x - at.x1 > 4) {
        runs.push(at);
        at = null;
      }
    }
  }
  if (at) runs.push(at);
  const big = runs.filter((r) => r.x1 - r.x0 >= cv.width * 0.05);
  const feet = big.map((r) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = r.x0; x <= r.x1; x++) {
      if (foot[x] < 0) continue;
      if (foot[x] < lo) lo = foot[x];
      if (foot[x] > hi) hi = foot[x];
    }
    return { x0: r.x0, x1: r.x1, bottom: hi };
  });
  return { w: cv.width, h: cv.height, groups: feet };
});
console.log(`       人のかたまり: ${JSON.stringify(pair.groups)}`);
need("あやとを入れたときの人のかたまり", pair.groups.length, 2);
if (pair.groups.length >= 2) {
  const [a, c] = pair.groups.slice(0, 2);
  must("2人が重なっていない", c.x0 > a.x1, `${a.x1} と ${c.x0}`);
  must("2人とも枠の中",
    a.x0 >= 0 && c.x1 <= pair.w - 1,
    `${a.x0}〜${c.x1} / 幅 ${pair.w}`);
  must("足元の高さがそろっている",
    Math.abs(a.bottom - c.bottom) <= pair.h * 0.02,
    `${a.bottom} と ${c.bottom}（高さ ${pair.h}）`);
}

/* ---- (7) もとにもどす ---- */
await one.p.locator(".akd-mate").click();
await one.p.waitForTimeout(600);
await one.p.locator(".akd-undo").click();
await one.p.waitForTimeout(900);
const back = await shotPixels(one.p);
must("もとのばしょへ戻せる", back.sum === one1.sum, `${one1.sum} / 戻したあと ${back.sum}`);
must("戻したことも覚える", one.posted.length > before, `POST ${one.posted.length} 回`);
const backPlace = one.posted.at(-1)?.body ?? null;
console.log(`       戻した立ち位置: ${JSON.stringify(backPlace)}`);

need("JSエラー（0であるべき）", one.errs.length === 0 ? 1 : 0);
must("JSエラーが出ていない", one.errs.length === 0, one.errs.join(" / "));

/* 覚えた場所を差し込んだ一覧。**開き直して残るか**を見るのに使う */
const allCards = await one.p.evaluate(() =>
  fetch("/island-api/cards").then((r) => r.json()),
);
await one.ctx.close();

/* ================================================================== 6 */

console.log("\n# 開き直すと、覚えた場所に立っている");
{
  const patched = (allCards.cards ?? []).map((c) =>
    c.photoId === "ph1" ? { ...c, ...savedPlace, moved: true } : c,
  );
  const r2 = await open({ cards: patched });
  must("紙が開く", await openSheet(r2.p, "ph1"));
  must("1人目を入れられる", await pick(r2.p, 1));
  await r2.p.screenshot({ path: `${OUT}/6-reopened.png` });
  const re = await shotPixels(r2.p);
  must("既定の場所には立っていない（覚えた場所に立っている）",
    re.sum !== one1.sum, `既定 ${one1.sum} / 開き直し ${re.sum}`);
  must("覚えた場所の絵と同じ", re.sum === moved1.sum,
    `動かした直後 ${moved1.sum} / 開き直し ${re.sum}`);
  await r2.ctx.close();
}

/* ================================================================== 4 */

console.log("\n# 他人のカードは、動くが覚えない");
{
  const r3 = await open();
  /* `ph1` は自分のぶん。**他人しか立っていない写真**（`CARD_SHOTS` の1枚）を開く */
  must("他人の写真の紙が開く", await openSheet(r3.p, "oMXREHFFNMbr37TtIwlE"));
  must("1人目を入れられる", await pick(r3.p, 1));
  const a = await shotPixels(r3.p);
  const bx = await stageBox(r3.p);
  await fingerDrag(
    r3.p,
    { x: bx.x + bx.width * 0.8, y: bx.y + bx.height * 0.85 },
    { x: bx.x + bx.width * 0.3, y: bx.y + bx.height * 0.55 },
  );
  const c = await shotPixels(r3.p);
  must("他人のカードでも、手元では動く", a.sum !== c.sum, `${a.sum} → ${c.sum}`);
  must("他人のカードは覚えない（POST が飛ばない）", r3.posted.length === 0,
    `POST ${r3.posted.length} 回`);
  await r3.p.screenshot({ path: `${OUT}/7-not-mine.png` });
  await r3.ctx.close();
}

/* ================================================================== 5 */

console.log("\n# ログインしていなければ、動くが覚えない");
{
  const r4 = await open({ out: true, cards: allCards.cards ?? [] });
  must("紙が開く", await openSheet(r4.p, "ph1"));
  if (await r4.p.locator(".npick").count()) {
    must("1人目を入れられる", await pick(r4.p, 1));
    const a = await shotPixels(r4.p);
    const bx = await stageBox(r4.p);
    await fingerDrag(
      r4.p,
      { x: bx.x + bx.width * 0.8, y: bx.y + bx.height * 0.85 },
      { x: bx.x + bx.width * 0.3, y: bx.y + bx.height * 0.5 },
    );
    const c = await shotPixels(r4.p);
    must("入っていない人でも、手元では動く", a.sum !== c.sum, `${a.sum} → ${c.sum}`);
    must("入っていない人のぶんは覚えない", r4.posted.length === 0, `POST ${r4.posted.length} 回`);
    await r4.p.screenshot({ path: `${OUT}/8-signed-out.png` });
  } else {
    missing.push("ログインしていない人に、入れる札が1つも出ない");
  }
  await r4.ctx.close();
}

/* ================================================================== 2 */

console.log("\n# PC 幅。マウスでも動く");
{
  const r5 = await open({ wide: true });
  must("紙が開く", await openSheet(r5.p, "ph1"));
  must("1人目を入れられる", await pick(r5.p, 1));
  const a = await shotPixels(r5.p);
  const bx = await stageBox(r5.p);
  await r5.p.mouse.move(bx.x + bx.width * 0.8, bx.y + bx.height * 0.85);
  await r5.p.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await r5.p.mouse.move(
      bx.x + bx.width * (0.8 - 0.05 * i),
      bx.y + bx.height * (0.85 - 0.03 * i),
    );
    await r5.p.waitForTimeout(16);
  }
  await r5.p.mouse.up();
  await r5.p.waitForTimeout(600);
  const c = await shotPixels(r5.p);
  must("マウスでも動く", a.sum !== c.sum, `${a.sum} → ${c.sum}`);
  await r5.p.locator(".akd-mate").click();
  await r5.p.waitForTimeout(800);
  await r5.p.screenshot({ path: `${OUT}/3-moved-desktop.png` });
  await r5.ctx.close();
}

await b.close();

console.log(`\n絵: ${OUT}`);
if (missing.length) {
  console.log("数えるものが見つかりませんでした:");
  missing.forEach((m) => console.log(`  - ${m}`));
  process.exit(2);
}
if (broke.length) {
  console.log("守れていないもの:");
  broke.forEach((m) => console.log(`  - ${m}`));
  process.exit(1);
}
console.log("ぜんぶ通りました。");
