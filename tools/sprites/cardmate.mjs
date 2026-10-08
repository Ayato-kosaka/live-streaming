/**
 * あやと島カードに入れるあやとを選び替えて、**焼き上がりを画素で数える。**
 *
 *   PORT=4250 node tools/sprites/cardmate.mjs
 *   PORT=4251 OUT=/tmp/mate-base.json node tools/sprites/cardmate.mjs   # 前の版を撮る
 *   PORT=4250 BASE=/tmp/mate-base.json node tools/sprites/cardmate.mjs  # 突き合わせる
 *
 * 0＝通った / 1＝食い違った / 2＝数えるものが無い。
 *
 * ## 何のためにあるか
 *
 * 「あやとも入れますか」が1枚の決め打ち（`/characters/ayato.webp`）から
 * `content/goods.ts` の `STICKERS` を並べる形になった（2026-10-08）。
 * ここでいちばん守らなければならないのは、**いままでと同じ選びかたをした人の
 * カードが1画素も変わらないこと。** 本番で780枚以上が作られている。
 *
 * だから見るのは見た目ではなく、**持って帰る1枚そのもの**——canvas の画素と、
 * 焼いた jpeg のバイト列。両方の sha256 を出す。
 *
 * `BASE=` に前の版の出力（`OUT=` で書いたもの）を渡すと、同じ名前の状態
 * どうしを突き合わせて、**食い違ったものだけ**を並べて 1 で落ちる。
 * 前の版（1枚決め打ちのころ）の札は `.akd-mate` 1つの入り切りなので、
 * **そちらの markup も押せるようにしてある**——そうしないと A と B で
 * 違う道を通ることになり、差が出ても出なくても意味が無い。
 * 状態の名前を**順番で付ける**（「1枚目のあやと」）のも同じ理由で、
 * 札の字が変わっても突き合わせの鍵が外れないようにしている。
 *
 * ## 対照（これが落ちたら、本物の数字を1つも出さずに 2）
 *
 *  1. **入れて・戻して・もう一度撮って、1回目と同じ sha256 になる。**
 *     焼き直しを2回はさんでも同じ値に戻ることまで見る。ここが揺れていたら
 *     「差 0」も「差あり」も読めない
 *  2. **「入れない」と「あやとを入れた」で sha256 が違う。** どの状態を
 *     撮っても同じ値が返るなら、この道具は何も見ていない
 *     （`docs/island-standards.md` 15章）
 *
 * ## つまずきどころ
 *
 * - 焼き上がりは**手が止まって 150ms 後**に入れ替わる。待たずに読むと
 *   前の状態の jpeg を数えて「変わっていない」と出る。`.akd-stage > img`
 *   の `src`（`blob:` なので焼くたび別の値）が変わるのを待ってから読む
 * - 写真と住人の絵は外に出られないので、`asme.mjs` と `route.mjs` で
 *   差し替える。**本番に1バイトも書かない**（口はぜんぶ差し込み側が返す）
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4250";
const BASE = process.env.BASE || "";
const OUT = process.env.OUT || "";
const SHOTS = process.env.SHOTS || "";

/** 見つからなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];
const need = (what, ok, saw) => {
  if (!ok) missing.push(`${what}（見たもの: ${saw}）`);
  return ok;
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
await offline(ctx);
await apply(ctx, {});
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

const stop = async (code, msg) => {
  console.error(msg);
  await b.close();
  process.exit(code);
};

await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1000);

/* いちばん人の多い写真のマスを開く（`cardshot.mjs` と同じ選びかた）。
   人が1人しか立てない写真だと、入れ替えのところが試せない。 */
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
console.log("開くマス:", JSON.stringify(tile));
if (tile.at < 0) {
  await stop(
    2,
    `見つからなかった: 開けるマスが無い（マス=${tile.マス}）。asme.mjs の差し込みを見てください。`,
  );
}

await p.locator(".akd-tile").nth(tile.at).click();
await p.waitForSelector(".akd-modal", { timeout: 5000 });
/* 人を1人入れる。**「入れない」は顔を持たない**ので、顔のある札から1枚目 */
const faces = p.locator(".npick:has(img)");
const 顔 = await faces.count();
if (顔 < 1) await stop(2, `見つからなかった: 候補の顔が0（.npick:has(img)）`);
await faces.first().click();
await p.waitForSelector(".akd-stage > img", { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(800);

/** いま出ている焼き上がりの `blob:` URL。焼き直すたびに別の値になる */
const nowUrl = () => p.getAttribute(".akd-stage > img", "src").catch(() => null);

/**
 * 焼き上がりが入れ替わるのを待ってから、画素とバイト列の sha256 を読む。
 * @param {string|null} was 押す前に出ていた URL
 */
async function readOut(was) {
  if (was) {
    await p
      .waitForFunction(
        (w) => {
          const el = document.querySelector(".akd-stage > img");
          return !!el && el.getAttribute("src") !== w;
        },
        was,
        { timeout: 20000 },
      )
      .catch(() => {});
  }
  await p.waitForTimeout(400);
  return p.evaluate(async () => {
    const hex = async (buf) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    const cv = document.querySelector(".akd-modal .akd-stage > canvas");
    const img = document.querySelector(".akd-modal .akd-stage > img");
    const off = document.querySelector(".akd-modal .nstudio-off");
    if (!cv || !img) return { 止まった: off?.textContent?.trim() ?? "出ていない" };
    const png = cv.toDataURL("image/png");
    const raw = Uint8Array.from(atob(png.slice(png.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    const jpeg = await fetch(img.getAttribute("src")).then((r) => r.arrayBuffer());
    return { 画素: await hex(raw), 焼き: await hex(jpeg), w: cv.width, h: cv.height };
  });
}

/** 撮れた状態。{ 名前: { 画素, 焼き, w, h } } */
const got = {};
/**
 * ひとつの状態を撮る。
 * @param {string} 名前 出力に出る名前（版をまたいで突き合わせる鍵）
 * @param {() => Promise<void>} 押す その状態にする手
 */
async function shoot(名前, 押す) {
  const was = await nowUrl();
  await 押す();
  const r = await readOut(was);
  got[名前] = r.止まった ? { 止まった: r.止まった } : r;
}

/* 札の形を見分ける。**新しい版は「入れない」を持った丸い札の列**、
   前の版は `.akd-mate` 1つの入り切り。 */
const 札 = await p.evaluate(() =>
  [...document.querySelectorAll(".akd-mate")].map((el) => el.textContent?.trim() ?? ""),
);
const 選べる = 札.length > 1;
console.log("あやとの札:", JSON.stringify({ 形: 選べる ? "選ぶ" : "入り切り", 札 }));
if (札.length < 1) {
  await stop(2, "見つからなかった: あやとの札（.akd-mate）が0。CardSheet.tsx を見てください。");
}

/** 選べるあやとの字。前の版は1枚（札そのもの） */
const 名 = 選べる ? 札.slice(1) : [札[0]];

/** 「入れない」にする */
const 入れない = async () => {
  if (選べる) await p.locator(".akd-mate").first().click();
  else if (await p.locator(".akd-mate.is-on").count()) await p.locator(".akd-mate").first().click();
};
/** i 枚目のあやとを入れる */
const 入れる = async (i) => {
  if (選べる) await p.locator(".akd-mate").nth(i + 1).click();
  else if (!(await p.locator(".akd-mate.is-on").count())) await p.locator(".akd-mate").first().click();
};

await 入れない();
await p.waitForTimeout(600);
await shoot("入れない", async () => {});
/* 対照1: 入れて、戻して、もう一度。**焼き直しを2回はさんでも同じ値に戻るか** */
await shoot("入れない（入れて戻した）", async () => {
  await 入れる(0);
  await p.waitForTimeout(800);
  await 入れない();
});

for (let i = 0; i < 名.length; i++) {
  await shoot(`${i + 1}枚目のあやと`, async () => 入れる(i));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/あやと${i + 1}-${名[i]}.png` });
  await 入れない();
  await p.waitForTimeout(500);
}

await b.close();

/* ---- 対照を当てる。**本物の数字を1つも出す前に** ---- */
const 撮れた = Object.entries(got).filter(([, v]) => v.画素);
need("撮れた状態が3つ以上", 撮れた.length >= 3, `撮れた=${撮れた.length} / ${Object.keys(got).length}`);
const 素 = got["入れない"];
const 戻した = got["入れない（入れて戻した）"];
if (素?.画素 && 戻した?.画素) {
  need(
    "対照1: 入れて戻すと、入れる前と同じ絵になる",
    素.画素 === 戻した.画素 && 素.焼き === 戻した.焼き,
    `${素.画素}/${素.焼き} と ${戻した.画素}/${戻した.焼き}`,
  );
} else {
  missing.push("対照1: 「入れない」を2回撮れなかった");
}
const 一枚目 = got["1枚目のあやと"];
if (素?.画素 && 一枚目?.画素) {
  need("対照2: 入れないと入れたで違う絵になる", 素.画素 !== 一枚目.画素, `どちらも ${素.画素}`);
} else {
  missing.push(`対照2: 「1枚目のあやと」を撮れなかった（${一枚目?.止まった ?? "出ていない"}）`);
}

if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  process.exit(2);
}

console.log(`\nあやとの字: ${JSON.stringify(名)}`);
console.log(JSON.stringify(got, null, 1));
console.log(`\n数えたもの: 状態 ${Object.keys(got).length} / 画素の読めたもの ${撮れた.length}`);
if (OUT) {
  writeFileSync(OUT, JSON.stringify(got, null, 1));
  console.log(`書いた: ${OUT}`);
}

if (!BASE) {
  console.log("前の版と突き合わせるには BASE= に、前の版で OUT= した JSON を渡してください。");
  process.exit(0);
}

/* ---- 前の版との突き合わせ ---- */
const was = JSON.parse(readFileSync(BASE, "utf8"));
const 共通 = Object.keys(got).filter((k) => was[k]?.画素 && got[k]?.画素);
if (共通.length === 0) {
  console.error(
    `\n見つからなかった: 突き合わせられる状態が0（前の版の鍵: ${Object.keys(was).join(" / ")}）`,
  );
  process.exit(2);
}
const 違い = 共通.filter((k) => was[k].画素 !== got[k].画素 || was[k].焼き !== got[k].焼き);
console.log(`\n突き合わせ: ${共通.length}状態`);
for (const k of 共通) {
  console.log(
    ` ${違い.includes(k) ? "×" : "○"} ${k}: 前 ${was[k].画素}/${was[k].焼き} → いま ${got[k].画素}/${got[k].焼き}`,
  );
}
if (違い.length) {
  console.error(`\n画素が変わった: ${違い.join(" / ")}`);
  process.exit(1);
}
console.log(`\n${共通.length}状態とも、画素も焼いたバイト列も前の版と同じです。`);
