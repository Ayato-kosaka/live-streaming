/**
 * `/roulette` の**字の濃さ**を測る（1/2。撮るほう）。
 *
 *   SPORT=4700 node tools/sprites/rlink.mjs
 *   python3 tools/sprites/inkpx.py rl <出た名前>
 *
 * ## 2通りに分けて測る
 *
 * **(A) 輪の札は、計算で出す。** 札は白い字に黒いふちなので、描かれた画素を
 * 測ると芯の白しか拾えず、明るい扇では必ず落ちる。あの札は
 * **「白かふちのどちらかが 4.5 に届けばよい」**という作りなので、
 * 扇の色に対して `fill` と `stroke` の比を両方出して、**大きいほう**を見る。
 * 色は決め打ちではなく、**その場の DOM から読む**（扇の `fill`、札の
 * computed `fill`／`stroke`）。**4つのテーマ全部**で回す。
 *
 * **(B) 結果の札まわりは、描かれた画素で出す。** 地が
 * （`.rl-card::after` の白い光・後ろの光・パステルの背景）場所で変わるので、
 * 計算では出ない。`inkpx.mjs` と同じ2枚（そのまま／字だけ透明）を撮って、
 * `inkpx.py` に読ませる。**輪の札は (A) で見るので、ここからは外す。**
 *
 * ## 動くものは、その場で止める
 *
 * 「TAP TO SPIN」は opacity 0.8〜1 で息をしている。2枚のあいだに値が変われば
 * 差が嘘になるので、**いちばん薄いところ**に合わせてから止める（worst case）。
 * 終わっているもの（結果の札の `rl-pop` / `rl-burst`）は**その場で止める。
 * 頭に巻き戻さない**（`docs/island-standards.md` 13）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";
import { apply as liveseed } from "./liveseed.mjs";

const PORT = process.env.SPORT || "4700";
const OUT = "/tmp/ink/rl";
mkdirSync(OUT, { recursive: true });

const SIX = encodeURIComponent(
  "トビリシの温泉,ヒッチハイクで隣の国,24時間クッキング,視聴者の家に泊まる,深夜の市場めぐり,サウナ",
);
const MANY = encodeURIComponent(
  Array.from({ length: 36 }, (_, i) => `${["トビリシの温泉", "ヒッチハイクで隣の国", "24時間クッキング", "視聴者の家に泊まる", "深夜の市場めぐり", "サウナ"][i % 6]}${i < 6 ? "" : Math.floor(i / 6) + 1}`).join(","),
);
/* **扇の色は全部出す。** classic は11色あるので、6件で撮ると5色を
   一度も測らないまま「4.5割れ 0件」と出る（`docs/island-misses.md` #19
   「数え方が届いていない場所は 0件に見える」）。いちばん多い色数に合わせて12件。 */
const ALL = encodeURIComponent(
  ["温泉", "ヒッチハイク", "クッキング", "民泊", "市場めぐり", "サウナ",
   "ラーメン", "山で配信", "自炊", "古着屋", "買い出し", "夜行バス"].join(","),
);
const THEMES = ["classic", "ocean", "berry", "sunset"];

/* 配信に出るのは 1080p か 720p。**そこで読めるかが答え**なので、
   390 では測らない（`liveink.mjs` と同じ方針）。 */
const SCENES = [
  ...THEMES.map((t) => ({ id: `rl-wheel-${t}`, url: `/roulette.html?candidates=${ALL}&theme=${t}`, w: 1920, h: 1080 })),
  ...THEMES.map((t) => ({
    // 押さずに回って、結果の札が出たところ。`auto` は写した元からある口
    id: `rl-card-${t}`,
    url: `/roulette.html?candidates=${SIX}&theme=${t}&auto=1&duration=1&turns=2&sound=0`,
    w: 1920, h: 1080, wait: 4500,
  })),
  { id: "rl-card-1280", url: `/roulette.html?candidates=${SIX}&auto=1&duration=1&turns=2&sound=0`, w: 1280, h: 720, wait: 4500 },
  // 「のり」（誰のコメントか）は、コントローラーから回したときにしか出ない
  { id: "rl-by", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: { spin: true }, w: 1920, h: 1080, wait: 19000 },
  // これから回すものの一覧
  { id: "rl-list", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: {}, w: 1920, h: 1080 },
  { id: "rl-list-1280", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: {}, w: 1280, h: 720 },
  // 番号の輪の控え
  { id: "rl-legend", url: `/roulette.html?candidates=${MANY}`, w: 1920, h: 1080 },
  { id: "rl-legend-1280", url: `/roulette.html?candidates=${MANY}`, w: 1280, h: 720 },
];

/* ------------------------------------------------------------------ */

/** 動くものを止める。ずっと息をしているものは、いちばん薄いところで。 */
const FREEZE = () => {
  const stopped = [];
  for (const a of document.getAnimations?.() || []) {
    const tm = a.effect?.getTiming?.() || {};
    let at = "その場";
    if (tm.iterations === Infinity) {
      const kf = a.effect.getKeyframes?.() || [];
      const dim = kf
        .filter((k) => k.opacity !== undefined)
        .reduce((m, k) => (m === null || Number(k.opacity) < Number(m.opacity) ? k : m), null);
      if (dim) {
        a.currentTime = (Number(tm.duration) || 0) * (dim.offset ?? 0);
        at = `いちばん薄いところ（opacity ${dim.opacity}）`;
      }
    }
    a.pause();
    stopped.push(`${a.animationName || "?"}${a.effect?.pseudoElement || ""} … ${at}`);
  }
  window.requestAnimationFrame = () => 0;
  return [...new Set(stopped)];
};

/** (A) 輪の札。扇の色・字の色・ふちの色を、その場の DOM から読む。 */
const WHEEL = () => {
  const svg = document.querySelector(".rl-wheel");
  if (!svg) return [];
  const wedges = [...svg.querySelectorAll(".rl-wedge")].map((p) => p.getAttribute("fill"));
  const groups = [...(svg.querySelector("[data-place]")?.children || [])];
  return groups.map((g, i) => {
    const t = g.querySelector("text");
    const cs = t ? getComputedStyle(t) : null;
    return {
      i,
      t: [...g.children].map((x) => x.textContent).join(""),
      wedge: wedges[i] || wedges[0],
      fill: cs?.fill || "",
      stroke: cs?.stroke || "",
      strokeW: cs?.strokeWidth || "",
    };
  });
};

/** (B) 画素で測るぶん。**輪の札は外す**（計算で見るので）。 */
const COLLECT = () => {
  const out = [];
  const SEL =
    ".rl-card strong, .rl-kicker, .rl-by, .rl-list b, .rl-list i, .rl-more," +
    " .rl-legend b, .rl-legend span, .rl-hint, .rl-hub span, .rl-standby-name," +
    " .rl-card-flat p, .rl-card-flat code, .rl-mark";
  for (const el of document.querySelectorAll(SEL)) {
    const t = (el.textContent || "").trim();
    if (!t) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    el.setAttribute("data-inkmark", String(out.length));
    out.push({
      t: t.slice(0, 24),
      c: typeof el.className === "string" ? el.className : "",
      tag: el.tagName,
      color: cs.color,
      opacity: cs.opacity,
      size: cs.fontSize,
      x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* 色の計算（4.5 の比を出す）                                           */
/* ------------------------------------------------------------------ */
const parse = (c) => {
  c = (c || "").trim();
  if (c.startsWith("#")) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join("") : c.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) return m[1].split(/[,/\s]+/).slice(0, 3).map(Number);
  return null;
};
const lum = (rgb) =>
  rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ------------------------------------------------------------------ */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const wheelRows = [];
const shots = [];
for (const sc of SCENES) {
  const dpr = 2;
  const ctx = await b.newContext({ viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: dpr });
  await offline(ctx);
  if (sc.seed) await liveseed(ctx, sc.seed);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}${sc.url}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(sc.wait ?? 2200);
  const stopped = await p.evaluate(FREEZE);
  await p.waitForTimeout(300);

  if (sc.id.startsWith("rl-wheel-")) {
    const rows = await p.evaluate(WHEEL);
    for (const r of rows) wheelRows.push({ theme: sc.id.replace("rl-wheel-", ""), ...r });
  }

  const boxes = await p.evaluate(COLLECT);
  if (boxes.length) {
    await p.screenshot({ path: `${OUT}/${sc.id}.shot.png` });
    await p.evaluate(() => {
      for (const el of document.querySelectorAll("[data-inkmark]")) {
        el.style.setProperty("color", "transparent", "important");
        el.style.setProperty("text-shadow", "none", "important");
      }
    });
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/${sc.id}.bg.png` });
    writeFileSync(`${OUT}/${sc.id}.json`, JSON.stringify({ dpr, boxes }, null, 1));
    shots.push(sc.id);
  }
  console.log(
    `${sc.id.padEnd(18)} 画素で測るところ ${String(boxes.length).padStart(3)}か所  止めた動き ${stopped.length}` +
      (stopped.length ? `（${stopped.join(" / ")}）` : ""),
  );
  await ctx.close();
}
await b.close();

/* --------------------------- (A) を読む --------------------------- */
console.log("\n■ 輪の札（白かふちの、どちらかが 4.5 に届けばよい）");
let ng = 0;
for (const th of THEMES) {
  const rows = wheelRows.filter((r) => r.theme === th);
  const scored = rows.map((r) => {
    const w = parse(r.wedge), f = parse(r.fill), s = parse(r.stroke);
    const rf = w && f ? ratio(w, f) : 0;
    const rs = w && s ? ratio(w, s) : 0;
    return { ...r, rf, rs, best: Math.max(rf, rs) };
  });
  const bad = scored.filter((r) => r.best < 4.5);
  ng += bad.length;
  const min = scored.reduce((a, c) => (c.best < a.best ? c : a));
  console.log(
    `  ${bad.length ? "✗" : "○"} ${th.padEnd(8)} 4.5割れ ${bad.length}/${scored.length}` +
      `  いちばん低い扇 ${min.wedge}「${min.t.slice(0, 10)}」 白 ${min.rf.toFixed(2)} / ふち ${min.rs.toFixed(2)}` +
      ` → ${min.best.toFixed(2)}`,
  );
  for (const r of bad) {
    console.log(`      扇 ${r.wedge}「${r.t.slice(0, 10)}」 白 ${r.rf.toFixed(2)} / ふち ${r.rs.toFixed(2)}`);
  }
}
console.log(`  ── 4つのテーマで 4.5 を割った扇 ${ng}件`);
console.log("\n■ 画素で測るぶん（結果の札・一覧・控え・TAP TO SPIN）");
for (const id of shots) console.log(`  python3 tools/sprites/inkpx.py rl ${id}`);
