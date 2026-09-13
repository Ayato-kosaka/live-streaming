/**
 * 開いたカードの「だれを入れますか」が、**送らずにどこまで見えているか**を測る。
 *
 *   PORT=4160 node pickfold.mjs            # 札 2・4・5・6・9・13枚
 *   PORT=4160 REAL=1 node pickfold.mjs     # 本番の9月11日
 *   PORT=4160 NS=6 node pickfold.mjs       # 枚数を絞る
 *
 * ## 重なりだけ見ても足りない
 *
 * 帯を足に出して重なりは 0px² になったが、**窓の下に落ちた札は「重なって
 * いない」と出る。** 9月11日の5人目——直してはじめて出るようになった人——が
 * そこに落ちていた。**見えない札は、消えている札と同じ。**
 *
 * だから測るのは2つ。
 *
 *   1. **送らない状態で**、札が何枚まるごと見えているか／欠けているか
 *   2. 次の段が**縦に何%**見えているか（＝続きがあると分かるか）
 *
 * 重なり（`pickfit.mjs` と同じ総当たり）も続けて見る。片方だけ直すと
 * もう片方が壊れる関係なので、同じ1回で両方出す。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const PORT = process.env.PORT || "4160";
const OUT = process.env.OUT || "/tmp/pickfold";
mkdirSync(OUT, { recursive: true });

const PROD = "https://live-streaming-d3cac.web.app";
const ICONS = JSON.parse(readFileSync("/tmp/pickicons.json", "utf8"));
/** 本番の返事。写真も日付も本番のもの（`icon` だけ直した口が入れる値） */
const REALCARDS = JSON.parse(readFileSync("/tmp/cards-after.json", "utf8"));
const PHOTOS = readFileSync("/tmp/photos.json", "utf8");

/** 9月11日の写真に、n人ぶんのカードを作る。**札は n+1 枚**（「入れない」） */
function cardsOf(n) {
  const base = REALCARDS.cards.find((c) => c.day === "2026-09-11");
  return {
    cards: Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `${base.photoId}__UCtest${i}`,
      channelId: `UCtest${i}`,
      icon: ICONS[i % ICONS.length],
      name: null,
    })),
  };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const viaCurl = (r, type) => {
  const was = r.request().url();
  const url = was.startsWith("http://localhost") ?
    was.replace(/^https?:\/\/[^/]+/, PROD) : was;
  try {
    const body = execFileSync("curl",
      ["-sS", "--retry", "2", "--max-time", "40", url], { maxBuffer: 1 << 28 });
    r.fulfill({ status: 200, contentType: type, body,
      headers: { "access-control-allow-origin": "*" } });
  } catch {
    r.abort();
  }
};

const HELPERS = `{
  clip: (a, b) => {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top ? {left, right, top, bottom} : null;
  },
  area: (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? Math.round(w * h) : 0;
  },
}`;

async function run(tag, body) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    reducedMotion: "reduce",
  });
  await ctx.route(/\/island-api\//, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/cards$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body }));
  await ctx.route(/\/island-api\/nordic\/photos$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: PHOTOS }));
  await ctx.route(/\/island-api\/characters\/[^/]+\/(plain|scene)-\d+\./, (r) =>
    viaCurl(r, "image/webp"));
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) =>
    viaCurl(r, "image/jpeg"));

  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator(".akd-day", { hasText: "9月11日" })
    .locator(".akd-tile").first().click();
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async (src) => {
    const H = eval("(" + src + ")");
    const box = document.querySelector(".akd-sheet-body") ||
      document.querySelector(".akd-sheet");
    const wait = () =>
      new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));

    // ---- 1. **送らない状態**で、どこまで見えているか ----
    box.scrollTop = 0;
    await wait();
    const win = box.getBoundingClientRect();
    const ps = [...document.querySelectorAll(".npick")];
    const seen = ps.map((e) => {
      const b = e.getBoundingClientRect();
      const v = H.clip(b, win);
      return { top: Math.round(b.top), h: Math.round(b.height),
        pct: v ? Math.round((v.bottom - v.top) / b.height * 100) : 0 };
    });
    // 段は上端でまとめる
    const rows = [];
    for (const s of seen) {
      const row = rows.find((x) => Math.abs(x.top - s.top) < 4);
      if (row) row.pct.push(s.pct);
      else rows.push({ top: s.top, pct: [s.pct] });
    }
    const rowPct = rows.map((x) => Math.max(...x.pct));
    // 「次の段」= まるごと見えていない最初の段
    const nextRow = rowPct.findIndex((x) => x < 100);

    // ---- 2. 重なり（送りながら総当たり） ----
    const foot = [
      [".nstudio-go", document.querySelector(".nstudio-go")],
      [".nstudio-tab", document.querySelector(".nstudio-tab")],
      [".nstudio-tip", document.querySelector(".nstudio-tip")],
      [".nstudio-save", document.querySelector(".nstudio-save")],
      [".akd-close", document.querySelector(".akd-close")],
    ].filter(([, e]) => e);
    const covers = foot.map(([, e]) => e)
      .concat([document.querySelector(".akd-sheet-head")].filter((e) => e));
    let worst = 0;
    let pairs = 0;
    let covered = 0;
    const stops = [];
    for (let y = 0; y <= box.scrollHeight; y += 120) stops.push(y);
    stops.push(box.scrollHeight);
    for (const y of stops) {
      box.scrollTop = y;
      await wait();
      const w2 = box.getBoundingClientRect();
      for (const pk of document.querySelectorAll(".npick")) {
        const vis = H.clip(pk.getBoundingClientRect(), w2);
        if (!vis) continue;
        for (const [, e] of foot) {
          const a = H.area(vis, e.getBoundingClientRect());
          if (a > 0) {
            pairs++;
            worst = Math.max(worst, a);
          }
        }
        for (let x = vis.left + 4; x < vis.right; x += 12) {
          for (let v = vis.top + 4; v < vis.bottom; v += 12) {
            const top = document.elementFromPoint(x, v);
            if (top && covers.some((e) => e === top || e.contains(top))) covered++;
          }
        }
      }
    }
    box.scrollTop = 0;
    await wait();

    const img = document.querySelector(".nstudio-shot img");
    return {
      札: ps.length,
      まるごと見えている: seen.filter((s) => s.pct >= 100).length,
      欠けている: seen.filter((s) => s.pct > 0 && s.pct < 100).length,
      見えていない: seen.filter((s) => s.pct === 0).length,
      次の段: nextRow < 0 ? null : rowPct[nextRow],
      段: rowPct,
      交差した組: pairs,
      いちばん広い交差: worst,
      覆われた点: covered,
      写真: img ? Math.round(img.getBoundingClientRect().height) : 0,
      窓: Math.round(win.height),
      胴の中身: box.scrollHeight,
      横あふれ_body: document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      横あふれ_紙: box.scrollWidth > box.clientWidth + 1,
    };
  }, HELPERS);

  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  console.log(
    `${tag.padEnd(9)} 札${String(r.札).padStart(3)}` +
    `  見えている ${String(r.まるごと見えている).padStart(2)}` +
    `  欠け ${r.欠けている}  見えない ${r.見えていない}` +
    `  次の段 ${r.次の段 === null ? "なし" : r.次の段 + "%"}` +
    `  交差 ${r.いちばん広い交差}px²(${r.交差した組}組)  覆われた点 ${r.覆われた点}` +
    `  写真 ${r.写真}px  窓 ${r.窓}px  胴 ${r.胴の中身}px` +
    `  横あふれ ${r.横あふれ_body || r.横あふれ_紙}`);
  console.log(`          段ごとに見えている割合: ${JSON.stringify(r.段)}`);
  await ctx.close();
  return r;
}

let bad = 0;
/** 合格の線。**送らずに** 5枚までは全部見える／6枚以上は次の段が半分見える */
const ok = (r) => {
  if (r.いちばん広い交差 || r.覆われた点) return "重なっている";
  if (r.横あふれ_body || r.横あふれ_紙) return "横にあふれている";
  /* **隠れている札が1枚も無ければ、そこで通す。** 「次の段が見えているか」は
     続きがあるときの話で、続きが無いのに「次の段が無い＝だめ」と読むと、
     ぜんぶ見えている絵を落とす（判定の向きの間違い。6枚で1回やった）。 */
  if (r.見えていない === 0 && r.欠けている === 0) return "";
  if (r.札 <= 5) return "5枚までなのに欠けている";
  return (r.次の段 ?? 0) >= 50 ? "" : "次の段が半分も見えていない";
};

if (process.env.REAL === "1") {
  const r = await run("本番9月11日", JSON.stringify(REALCARDS));
  const why = ok(r);
  if (why) {
    bad++;
    console.log("   ★", why);
  }
} else {
  const ns = (process.env.NS || "2,4,5,6,9,13").split(",").map(Number);
  for (const n of ns) {
    const r = await run(`札${String(n).padStart(2, "0")}枚`, JSON.stringify(cardsOf(n - 1)));
    const why = ok(r);
    if (why) {
      bad++;
      console.log("   ★", why);
    }
  }
}
await b.close();
console.log(bad === 0 ? "\nぜんぶ通った" : `\n${bad}通りでだめ`);
process.exit(bad === 0 ? 0 : 1);
