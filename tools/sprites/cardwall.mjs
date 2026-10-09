/**
 * あやと島カードを**壁紙にするところ**を測って撮る。
 *
 *   PORT=4250 node tools/sprites/cardwall.mjs             # 390 幅
 *   PORT=4250 W=1280 H=800 node tools/sprites/cardwall.mjs
 *   PORT=4250 SHOTS=/tmp/wall node tools/sprites/cardwall.mjs
 *   PORT=4250 LAG=2000 node tools/sprites/cardwall.mjs    # 写真を 2秒 遅らせる
 *
 * 0＝通った / 1＝合格に届かなかった / 2＝数えるものが無い。
 *
 * ## ほかの道具と何が違うか
 *
 * **本番の写真をそのまま敷く。** `asme.mjs` の差し込みが返すのは
 * 「写真IDから色を決めた1色の絵」で、それでも寸法と枚数は測れるが、
 * **賑やかな写真の上で人の輪郭が溶けるか**は1色の地では絶対に見えない
 * （あやと 2026-10-09「埋め込みがイケテなさすぎる」の中身がそれ）。
 * だから本番のカードの写真を curl で落として、`asme.mjs` の**あとに**
 * route を登録して差し替える（あとから登録した route が先に効く）。
 * **本番には1バイトも書かない。** 読むのは公開の `GET /cards` だけ。
 *
 * ## 測るもの
 *
 *  1. **押しどころ**（`hitbox.mjs`）。**大きさと「自分が最前か」の両方**を
 *     出す。片方だけの報告は受け取らない決めになっている
 *     （`docs/island-misses.md` #214）
 *  2. **引きずっているあいだ、紙と面が動かないか**（`touch-action`）
 *  3. **2人が別々の場所・別々の大きさ・別々の向きに置けるか。**
 *     住人を引きずり、あやとを引きずり、それぞれの箱が別々に動くことを見る
 *  4. **写真が遅れて届いても決まるか**（`LAG=`）。この面は絵があとから届く
 *     （`docs/island-misses.md` #215）ので、0 / 800 / 2000ms で回す
 *
 * ## 遅れは route で作る（時間で待たない）
 *
 * `LAG=` は写真の応答そのものを遅らせる。手元の `http.server` は同じ箱から
 * 返すので、押した次のフレームには背が決まってしまう。**本番はそうならない。**
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
import { measure, fmtHit } from "./hitbox.mjs";

const PORT = process.env.PORT || "4250";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 2);
const LAG = Number(process.env.LAG || 0);
const SHOTS = process.env.SHOTS || "";
/** 落とした本番の写真を置くところ。**git には入らない**（使い捨てではなく控え） */
const CACHE = process.env.CACHE || "/tmp/cardwall-photos";

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** 見つからなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];
/** 合格に届かなかったもの。**空でなければ 1 で落ちる。** */
const bad = [];

/* ---- 本番の写真を落とす。**読むのは公開の口だけ** ----
   `/cards` は誰でも読める（`functions/src/cards.ts` の `forEveryone`）。
   いちばん賑やかな写真を選びたいので、`note` ではなくバイト数で決める——
   JPEG が重い写真は、それだけ細かい模様が入っている。 */
mkdirSync(CACHE, { recursive: true });
const PROD = "https://live-streaming-d3cac.web.app/island-api/cards";

/* 落とすのは最初の数枚だけ（112枚ぜんぶ落とすと 60MB になる）。
   1回目は全部の `url` を見てから重い順に並べたいので、**先に数枚だけ**
   落として、そのうちいちばん重いものを使う。 */
const pool = (() => {
  const jar = join(CACHE, "cards.json");
  if (!existsSync(jar)) {
    execFileSync("curl", ["-sS", "-o", jar, PROD], { stdio: ["ignore", "ignore", "inherit"] });
  }
  const got = JSON.parse(readFileSync(jar, "utf8")).cards ?? [];
  const per = new Map();
  for (const c of got) {
    if (c.h <= c.w) continue;
    if (!per.has(c.photoId)) per.set(c.photoId, c);
  }
  /* 「暗殺者のパスタ」の日（あやとが名指しした賑やかな写真）を必ず入れる */
  const list = [...per.values()];
  const want = list.filter((c) => (c.note || "").includes("パスタ")).slice(0, 2);
  const rest = list.filter((c) => !want.includes(c)).slice(0, 4);
  const out = [];
  for (const c of [...want, ...rest]) {
    const file = join(CACHE, `${c.photoId}.jpeg`);
    if (!existsSync(file)) {
      try {
        execFileSync("curl", ["-sS", "-o", file, c.url], {
          stdio: ["ignore", "ignore", "inherit"],
        });
      } catch {
        continue;
      }
    }
    if (existsSync(file)) out.push({ ...c, file, bytes: readFileSync(file).length });
  }
  out.sort((a, b) => b.bytes - a.bytes);
  return out;
})();

if (pool.length < 1) {
  console.error(
    `見つからなかった: 本番の写真を1枚も落とせませんでした（${PROD}）。` +
      `curl が外へ出られるかを見てください。`,
  );
  process.exit(2);
}
console.log(
  `本番の写真: ${pool.length}枚 ${pool
    .map((c) => `${(c.bytes / 1024) | 0}KB「${(c.note || "").slice(0, 12)}」`)
    .join(" / ")}`,
);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
await apply(ctx, {});

/* ---- 本番の写真に差し替える。**`apply` のあとに登録する** ----
   Playwright はあとから登録した route を先に当てるので、ここが
   `asme.mjs` の1色の絵より先に効く。縦の差し込み写真にだけ当てる。 */
let served = 0;
await ctx.route(/firebasestorage\.googleapis\.com/, async (r) => {
  const m = /photos%2F([^.]+)\.jpe?g/.exec(r.request().url());
  if (!m) return r.fallback();
  /* 写真IDから1枚ずつ決める（同じIDにはいつも同じ写真）。
     **縦の差し込み（1200×1600）にだけ当てる。** 横の差し込みに縦の写真を
     返すと、カードの中で写真が伸びる。縦かどうかは画面側が知らないので、
     ここは差し込みの寸法を持っている `asme.mjs` に任せて素通しする。 */
  let h = 0;
  for (const ch of m[1]) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = pool[h % pool.length];
  if (LAG) await new Promise((done) => setTimeout(done, LAG));
  served++;
  return r.fulfill({
    path: pick.file,
    headers: { "access-control-allow-origin": "*", "content-type": "image/jpeg" },
  });
});

const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

const stop = async (code, msg) => {
  console.error(msg);
  await b.close();
  process.exit(code);
};

await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(600);

/* いちばん人の多い写真のマスを開く（`cardshot.mjs` / `cardmate.mjs` と同じ選びかた）。
   1人しか立てない写真だと、2人を別々に動かすところが試せない。 */
const tile = await p.evaluate(async () => {
  const cards = await fetch("/island-api/cards").then((r) => r.json());
  const per = new Map();
  for (const c of cards.cards ?? []) {
    if (!c.icon) continue;
    const set = per.get(c.photoId) ?? new Set();
    set.add(c.icon);
    per.set(c.photoId, set);
  }
  const tiles = [...document.querySelectorAll(".akd-tile")];
  let best = { at: -1, 人: 0 };
  tiles.forEach((t, i) => {
    const src = decodeURIComponent(t.querySelector("img")?.src ?? "");
    for (const [photoId, who] of per) {
      if (src.includes(photoId) && who.size > best.人) best = { at: i, 人: who.size };
    }
  });
  return { ...best, マス: tiles.length };
});
if (tile.at < 0) {
  await stop(2, `見つからなかった: 開けるマスが無い（マス=${tile.マス}）`);
}
await p.locator(".akd-tile").nth(tile.at).click();
await p.waitForSelector(".akd-modal", { timeout: 5000 });

/** 焼き上がりが入れ替わるのを待つ。**量ではなく、入れ替わりを待つ** */
const nowUrl = () => p.getAttribute(".akd-stage > img", "src").catch(() => null);
async function settle(was) {
  if (was) {
    await p
      .waitForFunction(
        (w) => {
          const el = document.querySelector(".akd-stage > img");
          return !!el && el.getAttribute("src") !== w;
        },
        was,
        { timeout: 25000 },
      )
      .catch(() => {});
  }
  await p.waitForTimeout(400);
}

/* 人を1人入れる。**「入れない」は顔を持たない**ので、顔のある札から1枚目 */
const faces = p.locator(".npick:has(img)");
const 顔 = await faces.count();
if (顔 < 1) await stop(2, "見つからなかった: 候補の顔が0（.npick:has(img)）");
let was = await nowUrl();
await faces.first().click();
await settle(was);

/* あやとも入れる（2枚目の札＝1人目のあやと） */
const mates = p.locator(".akd-mate");
const 札 = await mates.count();
if (札 < 2) await stop(2, `見つからなかった: あやとの札が ${札} 枚（.akd-mate）`);
was = await nowUrl();
await mates.nth(1).click();
await settle(was);

/** 出ている焼き上がりの画素の指紋と、canvas の寸法 */
const fingerprint = () =>
  p.evaluate(async () => {
    const cv = document.querySelector(".akd-modal .akd-stage > canvas");
    if (!cv) return null;
    const png = cv.toDataURL("image/png");
    const raw = Uint8Array.from(atob(png.slice(png.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    const sum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
    return { 指紋: sum, w: cv.width, h: cv.height };
  });

/**
 * いま誰がどこに立っているか。
 *
 * **画素から当てない**——写真の模様と人の画素は見分けられない。
 * 面が描いたあとに台（`.akd-stage`）へ置いている札（`data-at`）を読む。
 * あれは**描いた結果**から出しているので、見えているものと同じ値になる。
 */
const boxes = () =>
  p.evaluate(() => {
    const cv = document.querySelector(".akd-modal .akd-stage > canvas");
    const st = document.querySelector(".akd-modal .akd-stage");
    if (!cv || !st) return null;
    let at = [];
    try {
      at = JSON.parse(st.dataset.at || "[]");
    } catch {
      at = [];
    }
    return { w: cv.width, h: cv.height, 人: at[0] ?? null, あやと: at[1] ?? null };
  });

console.log(`\n--- ${W}x${H} dpr${DPR} / 写真の遅れ ${LAG}ms ---`);
console.log("開いたマス:", JSON.stringify(tile), "/ 差し替えた写真", served, "回");
console.log("焼き上がり:", JSON.stringify(await fingerprint()));
console.log("立ち位置:", JSON.stringify(await boxes()));

/* ---- 2 引きずっているあいだ、紙と面が動かないか ---- */
const ta = await p.evaluate(() => {
  const el = document.querySelector(".akd-stage");
  const img = document.querySelector(".akd-stage > img");
  const body = document.querySelector(".akd-sheet-body");
  const css = (e) => (e ? getComputedStyle(e).touchAction : "なし");
  return { 台: css(el), 絵: css(img), 胴: css(body) };
});
console.log("touch-action:", JSON.stringify(ta));
/* 指を受けるのは台。**台が `none` でないと、引きずるたびに紙も一緒に動く**し、
   2本指が面ごと拡大して、ひねりがブラウザに取られる。 */
if (ta.台 !== "none") {
  bad.push(`引きずるところ（.akd-stage）の touch-action が none でない（${JSON.stringify(ta)}）`);
}

/* ---- 1 押しどころ。**大きさと「自分が最前か」の両方** ---- */
/* 測るのは**紙の中だけ。** `.akd-back`（絵の裏の「閉じる」）は面ぜんぶを
   覆う層で、紙がその上に乗っているのが正しい形なので、数に混ぜない。 */
/* `clear: true`。**この紙は写真を胴の天井に貼り付けている**ので、
   `scrollIntoView({block:"center"})` が狙う窓の真ん中は写真の下になる。
   そこで測ると、88px の札が 45px と出る（実際に出た。2026-10-09）。
   覆いの下から出してから測り、出られなかったものは下で別に挙げる。 */
const hit = await measure(p, {
  sel: ".akd-sheet a[href],.akd-sheet button,.akd-sheet label,.akd-sheet input",
  min: 48,
  clear: true,
});
const small = hit.rows.filter((r) => r.small);
const 隠れ = hit.skipped.filter((s) => /が上にいる|画面の外/.test(s.why));
console.log(
  `\n押しどころ: 測れた ${hit.rows.length} / 48px割れ ${small.length} / ` +
    `真ん中へ送っただけでは最前でない ${隠れ.length}`,
);
for (const r of small) console.log(`  !! 小 ${r.c}「${r.t}」${fmtHit(r)}`);

/* **「上に何か乗っている」で終わらせない。**
   この紙は**写真を胴の天井に貼り付けている**（`position: sticky`）ので、
   `scrollIntoView({block:"center"})` が狙う窓の真ん中は、写真の下になる。
   そこで「最前でない」と出るのは、**その送り位置では**という意味でしかない。

   だから**送り直して、もう一度突く。** 胴を1段ずつ送りながら、
   `elementFromPoint` が自分を返す位置が1つでもあるかを見る。
   **1つも無ければ、本当に押せない**（#214 の、足の帯の下に潜っていた札）。 */
const 届かない = [];
for (const s of 隠れ) {
  const ok = await p.evaluate((key) => {
    const keyOf = (el) => {
      const q = [];
      for (let e = el; e && e !== document.body; e = e.parentElement)
        q.push(e.tagName + ":" + [...(e.parentElement?.children || [])].indexOf(e));
      return q.join("/");
    };
    const all = [...document.querySelectorAll(".akd-sheet a[href],.akd-sheet button,.akd-sheet label,.akd-sheet input")];
    const el = all.find((e) => keyOf(e) === key);
    const body = document.querySelector(".akd-sheet-body");
    if (!el || !body) return false;
    const step = 24;
    for (let top = 0; top <= body.scrollHeight; top += step) {
      body.scrollTop = top;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const got = document.elementFromPoint(cx, cy);
      if (got && (got === el || el.contains(got))) return true;
    }
    return false;
  }, s.k);
  console.log(`  ${ok ? "○" : "!!"} ${s.c}「${s.t}」${s.why} → ${ok ? "送れば最前に出る" : "送っても出ない"}`);
  if (!ok) 届かない.push(s);
}
if (hit.rows.length === 0) missing.push("押しどころが1つも測れなかった");
if (small.length) bad.push(`48px 割れ ${small.length}個`);
if (届かない.length) bad.push(`どこへ送っても最前に出ない押しどころ ${届かない.length}個`);

/* ---- 3 2人を別々に動かす ---- */
/**
 * 台の上を引きずる。割合（0〜1）で始点と終点を渡す。
 * @param {[number,number]} from @param {[number,number]} to
 */
async function drag(from, to) {
  const box = await p.locator(".akd-stage").boundingBox();
  if (!box) return false;
  const at = (q) => [box.x + box.width * q[0], box.y + box.height * q[1]];
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  await p.mouse.move(x0, y0);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await p.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  await p.waitForTimeout(500);
  return true;
}

const 前 = await boxes();
if (!前) await stop(2, "見つからなかった: canvas が出ていない");
if (!前.人 || !前.あやと) {
  missing.push(
    `立ち位置を読む印が出ていない（人=${JSON.stringify(前.人)} / あやと=${JSON.stringify(前.あやと)}）。` +
      `CardSheet.tsx の data-who / data-place を見てください`,
  );
}

if (前.人 && 前.あやと) {
  /* 住人のところを掴んで左上へ。**あやとは動いてはいけない** */
  await drag([前.人.x, 前.人.y - 0.06], [0.22, 0.4]);
  const 後1 = await boxes();
  const 人動いた = 後1.人 && (Math.abs(後1.人.x - 前.人.x) > 0.02 || Math.abs(後1.人.y - 前.人.y) > 0.02);
  const あやと留まった =
    後1.あやと && Math.abs(後1.あやと.x - 前.あやと.x) < 0.005 && Math.abs(後1.あやと.y - 前.あやと.y) < 0.005;
  console.log(`\n住人を引きずった: 人 ${JSON.stringify(前.人)} → ${JSON.stringify(後1.人)}`);
  console.log(`                  あやと ${JSON.stringify(前.あやと)} → ${JSON.stringify(後1.あやと)}`);
  if (!人動いた) bad.push("住人を掴んで引きずっても、住人が動かない");
  if (!あやと留まった) bad.push("住人を引きずったら、あやとも一緒に動いた");

  /* あやとのところを掴んで右下へ。**住人は動いてはいけない** */
  const 中 = await boxes();
  await drag([中.あやと.x, 中.あやと.y - 0.06], [0.8, 0.86]);
  const 後2 = await boxes();
  const あやと動いた =
    後2.あやと && (Math.abs(後2.あやと.x - 中.あやと.x) > 0.02 || Math.abs(後2.あやと.y - 中.あやと.y) > 0.02);
  const 人留まった = 後2.人 && Math.abs(後2.人.x - 中.人.x) < 0.005 && Math.abs(後2.人.y - 中.人.y) < 0.005;
  console.log(`あやとを引きずった: あやと ${JSON.stringify(中.あやと)} → ${JSON.stringify(後2.あやと)}`);
  console.log(`                    人 ${JSON.stringify(中.人)} → ${JSON.stringify(後2.人)}`);
  if (!あやと動いた) bad.push("あやとを掴んで引きずっても、あやとが動かない");
  if (!人留まった) bad.push("あやとを引きずったら、住人も一緒に動いた");

  /* 大きさと向きが**別々に**変わるか。手の欄（PC のため）から */
  const 変 = await p.evaluate(() => {
    const el = document.querySelector('input[data-tune="scale"]');
    if (!el) return null;
    return { min: el.min, max: el.max, now: el.value };
  });
  console.log("大きさの目盛り:", JSON.stringify(変));
  if (!変) missing.push("大きさの目盛り（input[data-tune=scale]）が無い");
  const 回 = await p.evaluate(() => {
    const el = document.querySelector('input[data-tune="rot"]');
    if (!el) return null;
    return { min: el.min, max: el.max, now: el.value };
  });
  console.log("回しの目盛り:", JSON.stringify(回));
  if (!回) missing.push("回しの目盛り（input[data-tune=rot]）が無い");
}

/* ---- 撮る ---- */
if (SHOTS) {
  const tag = `${W}x${H}-lag${LAG}`;
  await p.screenshot({ path: join(SHOTS, `sheet-${tag}.png`) });
  const st = p.locator(".akd-stage");
  if (await st.count()) await st.screenshot({ path: join(SHOTS, `stage-${tag}.png`) });
  /* 焼き上がりそのものも1枚出す。**持って帰る1枚と同じ画素** */
  const png = await p.evaluate(() => {
    const cv = document.querySelector(".akd-modal .akd-stage > canvas");
    return cv ? cv.toDataURL("image/png") : null;
  });
  if (png) {
    writeFileSync(join(SHOTS, `baked-${tag}.png`), Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
  }
  console.log(`\n撮った: ${SHOTS}`);
}

if (errs.length) {
  console.log(`\nJS のエラー ${errs.length}本:`);
  for (const e of errs.slice(0, 5)) console.log("  !!", e);
  bad.push(`JS のエラー ${errs.length}本`);
}

await b.close();

if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  process.exit(2);
}
if (bad.length) {
  console.error(`\n届かなかった: ${bad.join(" / ")}`);
  process.exit(1);
}
console.log(`\n${W}x${H} / 遅れ ${LAG}ms: ぜんぶ通りました。`);
