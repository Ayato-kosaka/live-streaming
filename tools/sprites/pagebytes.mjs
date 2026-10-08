/**
 * 1枚の画面を開いた人が払う**転送バイト数**を、種類ごとに分けて出す。
 *
 *   SPORT=4160 PAGE=/nordic/finland.html node pagebytes.mjs
 *   SPORT=4160 PAGE=/island/europe/streams.html SCROLL=1 node pagebytes.mjs
 *
 * `loadcost.mjs` は合計だけなので、**何が重いのかが分からない。**
 * 「先読みが 1.5MB」「書体が 950KB」は合計を見ているうちは出てこない。
 *
 * 種類は URL の形で分ける:
 *   先読み  … Next の RSC（`*.txt` / `?_rsc=`）と、それに連れてくる JS
 *   書体    … `/fonts/*.woff2`
 *   JS / CSS / 画像 / その他
 *
 * **外（wikimedia など）は別立てで数える。** `route.mjs` の `offline()` が
 * 1枚に潰して返すので、ここで足したバイトは本番の量ではない。
 * **本数と宛先だけを出す**（本番の量は `--probe` で curl に聞く）。
 * 転送量は混み具合に影響されないので、壁の時計で測ってよい（CLAUDE.md）。
 */
import { chromium } from "playwright-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { offline } from "./route.mjs";

const run = promisify(execFile);
const SPORT = process.env.SPORT || "4160";
const PAGE = process.env.PAGE || "/index.html";
const WIDE = process.env.WIDE === "1";
const SCROLL = process.env.SCROLL === "1";
const WAIT = Number(process.env.WAIT || 6000);
const PROBE = process.argv.includes("--probe");

/** 先読みで来たものか。Next の RSC は `.txt` か `?_rsc=` で来る */
const isPrefetch = (u) => u.search.includes("_rsc") || u.pathname.endsWith(".txt");

function kindOf(u) {
  if (isPrefetch(u)) return "先読み(RSC)";
  if (/\.woff2?$/.test(u.pathname)) return "書体";
  if (/\.css$/.test(u.pathname)) return "CSS";
  if (/\.js$/.test(u.pathname)) return "JS";
  if (/\.(png|jpe?g|webp|gif|svg|ico|avif)$/.test(u.pathname)) return "画像";
  if (/\.html?$/.test(u.pathname) || u.pathname.endsWith("/")) return "HTML";
  return "その他";
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext(
  WIDE
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
);
await offline(ctx);

const local = new Map(); // path -> {kind, bytes}
const far = new Map(); // url -> host
const p = await ctx.newPage();
p.on("response", async (r) => {
  let u;
  try {
    u = new URL(r.url());
  } catch {
    return;
  }
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    far.set(r.url(), u.hostname);
    return;
  }
  try {
    // **同じ道を2回数えない。** ブラウザは2度目を網から出すので、払う量は1回ぶん
    if (!local.has(u.pathname + u.search)) {
      local.set(u.pathname + u.search, { kind: kindOf(u), bytes: (await r.body()).length });
    }
  } catch {
    /* 途中で捨てられた */
  }
});
await p.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(WAIT);
if (SCROLL) {
  // 先読みは「画面に入った Link」から始まるので、下まで送らないと出てこない
  for (let y = 0; y < 40; y++) {
    await p.evaluate((i) => window.scrollTo(0, i * 600), y);
    await p.waitForTimeout(150);
  }
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
}

const byKind = new Map();
for (const { kind, bytes } of local.values()) {
  const t = byKind.get(kind) ?? { n: 0, bytes: 0 };
  t.n += 1;
  t.bytes += bytes;
  byKind.set(kind, t);
}
const total = [...local.values()].reduce((a, v) => a + v.bytes, 0);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

console.log(`■ ${PAGE} ${WIDE ? "PC" : "スマホ"}${SCROLL ? " 下まで送った" : ""}`);
console.log(`  自分のドメイン 合計 ${kb(total)} / ${local.size}本`);
for (const [kind, t] of [...byKind].sort((a, x) => x[1].bytes - a[1].bytes)) {
  console.log(`    ${kind.padEnd(12)} ${kb(t.bytes).padStart(9)} / ${String(t.n).padStart(3)}本`);
}
const hosts = new Map();
for (const h of far.values()) hosts.set(h, (hosts.get(h) ?? 0) + 1);
console.log(`  外 ${far.size}本（宛先ごと: ${[...hosts].map(([h, n]) => `${h} ${n}`).join(" / ") || "なし"}）`);

if (PROBE) {
  // 本番の量だけは curl に聞く。**ブラウザは外に出られない**ので、ここでしか分からない
  let sum = 0;
  const widths = new Map();
  for (const u of far.keys()) {
    if (!/upload\.wikimedia\.org/.test(u)) continue;
    const m = /\/(\d+)px-/.exec(u);
    widths.set(m ? m[1] : "原寸", (widths.get(m ? m[1] : "原寸") ?? 0) + 1);
    try {
      const { stdout } = await run("curl", ["-sIL", "-o", "/dev/null", "-w", "%{size_download}:%{http_code}", u]);
      const [, len] = /^(\d+):/.exec(stdout) ?? [];
      const { stdout: hdr } = await run("curl", ["-sIL", u]);
      const cl = /content-length:\s*(\d+)/i.exec(hdr);
      if (cl) sum += Number(cl[1]);
      void len;
    } catch {}
  }
  console.log(`  うち wikimedia の写真 ${kb(sum)}（幅ごと: ${[...widths].map(([w, n]) => `${w} ${n}枚`).join(" / ")}）`);
}

await ctx.close();
await b.close();
