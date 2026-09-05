/**
 * 旅の写真の合成を、書き出したもので確かめる（`docs/nordic-photos.md`）。
 *
 * 旅はまだ始まっていないので、本物の写真も、その日いた人の名簿もまだ無い。
 * ここでは `/island-api/nordic/photos` の返事を差し替えて、
 * **縦の写真と横の写真**をそれぞれ開き、キャラクターを入れて焼いた1枚を
 * ファイルに書き出す。目で見て、寸法の表（仕様5章）と合っているかを見る。
 *
 * キャラクターの絵は、先に `python3 tools/sprites/avatars.py` で
 * `/tmp/avatars/` に落としておく。落としていないと全員おなじ絵で写る。
 *
 *   tools/build.sh 3170
 *   cp <写真> site/.next-3170/testphotos/{tall,wide}.webp
 *   python3 -m http.server 4170 --directory site/.next-3170 &
 *   cd tools/sprites && SPORT=4170 node nphoto.mjs /tmp/nphoto
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4170";
const out = process.argv[2] || "/tmp/nphoto";
mkdirSync(out, { recursive: true });

/** ネズミ（見本と同じ）と、もう1人。 */
const MOUSE = "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47";
const OTHER = "18okO58dwMaci-9R1go0Rj1dTqliSWlz3";

const DAYS = [
  {
    day: "2026-09-12",
    photos: [
      { id: "p1", day: "2026-09-12", url: "/testphotos/tall.webp", w: 960, h: 1441, note: "オーロラが出た夜", at: 1 },
      { id: "p2", day: "2026-09-12", url: "/testphotos/wide.webp", w: 960, h: 654, note: "", at: 2 },
    ],
    people: [
      { channelId: "UCyct2GK_RiW5Ji3Y0gd9MMg", icon: null, name: "ねずみさん" },
      { channelId: "UCNTxy7hXktoG4V6jT6A3M9A", icon: null, name: null },
      { channelId: null, icon: OTHER, name: null },
    ],
  },
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await offline(ctx);
await ctx.route(/\/island-api\/nordic\/photos/, (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ days: DAYS }) }),
);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("JS:", String(e).slice(0, 200)));

await p.goto(`http://localhost:${SPORT}/nordic/photos.html`, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".nph", { timeout: 15000 });
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/wall.png`, fullPage: true });

/** いま出ている絵を、焼き上がりのまま書き出す。 */
async function grab(name) {
  const b64 = await p.evaluate(async () => {
    const img = document.querySelector(".nstudio-shot img");
    if (!img) return null;
    const r = await fetch(img.src);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  });
  if (!b64) return console.log("NG 焼き上がりが取れない", name);
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(b64, "base64"));
  console.log("ok", `${out}/${name}.jpg`);
}

/** 1枚ひらいて、そのまま／キャラクター入りの両方を撮る。 */
async function shoot(i, tag) {
  await p.locator(".nph").nth(i).click();
  await p.waitForSelector(".nstudio-shot img", { timeout: 15000 });
  await p.waitForTimeout(300);
  await grab(`${tag}-plain`);
  await p.locator(".npick").nth(1).click();
  await p.waitForTimeout(700);
  await grab(`${tag}-stamp`);
  await p.screenshot({ path: `${out}/${tag}-studio.png` });
  // 押しどころ。48px あるか
  const hits = await p.evaluate(() =>
    [...document.querySelectorAll(".npick, .nstudio-go, .nstudio-close, .nstudio-tab")].map((el) => {
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const at = document.elementFromPoint(x, y);
      return [
        el.className.split(" ")[0],
        Math.round(r.width),
        Math.round(r.height),
        el.contains(at) ? "hit" : "TAKEN",
      ].join(" ");
    }),
  );
  console.log(tag, "の押しどころ:", hits.join(" / "));
  await p.locator(".nstudio-close").click();
  await p.waitForTimeout(200);
}

await shoot(0, "tall");
await shoot(1, "wide");

await b.close();
