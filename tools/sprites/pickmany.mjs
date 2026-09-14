/**
 * 開いたカードの「だれを入れますか」を、**候補が何人でも**見る道具。
 *
 *   PORT=4140 node tools/sprites/pickmany.mjs            # 5人と18人を、390 と 1280 で
 *   PORT=4140 NS=5,18,40 WS=390 node tools/sprites/pickmany.mjs
 *
 * ## なぜ要るか
 *
 * 候補はいままで「その日**投げてくれた**人」だった。「その日**いた**人」に
 * 広げたので、**5人から十数人になる**（2026-09-13 は5人 → 13人）。
 * 札が増えたときに潰れないか・押しどころが 48px を割らないか・
 * 「入れない」が埋もれないかは、**その人数で開いてみないと出ない。**
 * 先に `pickfit.mjs` が「札と帯の重なり」を測っているので、こちらは
 * **1枚ずつの押しどころと、並びの見た目**を受け持つ。
 *
 * ## 押しどころは `hitbox.mjs` で測る
 *
 * `getBoundingClientRect` では、隣に取られている場所が出ない
 * （`CLAUDE.md`「押しどころは、見た目の箱で測らない」）。測る所は
 * `hitbox.mjs` 1か所だけ、という決めに従ってそこを呼ぶ。
 * **仕込み（`addProbe`）を先に通して、道具が当たることを確かめてから**
 * 「割れ0」を読む（`docs/island-misses.md` #79 #83）。
 *
 * ## 絵は1人ずつ違うものを出す
 *
 * 全員おなじ絵にすると「18人ぶん並んでいる」ことしか分からない。
 * `python3 tools/sprites/chars.py` で落としてある本番の絵を、1人ずつ返す。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { measure, openFolds, addProbe, delProbe, isProbe, probeVerdict, fmtHit } from "./hitbox.mjs";

const PORT = process.env.PORT || "4140";
const OUT = process.env.OUT || "/tmp/pickmany";
const CHARS = "/tmp/chars";
const ROOT = "/home/user/live-streaming";
mkdirSync(OUT, { recursive: true });

/** 落としてある絵の id。**1人ずつ違うものを配るため**に集める。 */
const ICONS = existsSync(CHARS) ?
  [...new Set(readdirSync(CHARS)
    .filter((f) => f.includes("__plain-128.webp"))
    .map((f) => f.replace(/^island__characters__/, "").replace(/__plain-128\.webp$/, "")))] :
  [];
if (ICONS.length < 20) {
  console.error(
    `絵が ${ICONS.length} 枚しか落ちていない。` +
    "先に `python3 tools/sprites/chars.py` を回す（全員おなじ絵で撮っても何も分からない）",
  );
  process.exit(1);
}

/** 差し込む名前。**仕込みの字だが、長さは本番と同じくらいにそろえてある。** */
const NAMES = (process.env.NAMES || [
  "ゆき", "あやと島だいすきマン", "T.K", "ねこすけ", "hitchhike_traveler",
  "もふもふぱんだ2号", "りん", "ジョージアだいすき人間", "ひろ", "さくらもち",
].join(",")).split(",");

const DAY = "2026-09-13";
const PHOTO = "https://firebasestorage.googleapis.com/v0/b/x/o/pickmany.jpg?alt=media";

/** その日の写真1枚。**カードの口が落ちても並ぶ**ように、写真の口も返す。 */
const photosBody = JSON.stringify({
  days: [{
    day: DAY,
    photos: [{ id: "p-pickmany", day: DAY, url: PHOTO, w: 1600, h: 1067, note: "", at: 1 }],
    people: [],
  }],
});

/** n人ぶんの候補が出るカードを作る。**絵は1人ずつ違う。** */
const cardsBody = (n) => JSON.stringify({
  cards: Array.from({ length: n }, (_, i) => ({
    id: `p-pickmany__UC-t${i}`,
    day: DAY,
    photoId: "p-pickmany",
    url: PHOTO,
    w: 1600,
    h: 1067,
    note: "",
    channelId: `UC-t${i}`,
    icon: ICONS[i % ICONS.length],
    /* 名前は**出してよいと言った人だけ**付く。だから半分は null にする。
       付けるほうは**本番と同じ長さ**の字にする（`docs/island-standards.md` 4）。
       「しまびと1」のような短い名前だけで撮ると、2行3行に折れる名前が
       1つも出ず、**段の背が揃って見える。** 実際の名前は折れる。 */
    name: i % 2 === 0 ? NAMES[(i / 2) % NAMES.length] : null,
    x: 0.7, y: 0.9, rot: 0, scale: 1, moved: false,
    at: 1,
    streamEventId: "",
  })),
});

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

async function run(n, w) {
  const tag = `${String(n).padStart(2, "0")}人_${w}`;
  const ctx = await b.newContext({
    viewport: { width: w, height: w < 700 ? 844 : 900 },
    deviceScaleFactor: 2,
    isMobile: w < 700, hasTouch: w < 700,
    reducedMotion: "reduce",
  });
  // 口はぜんぶ空で返す。**そのうえで見たい2本だけ差し替える**（あとに書いたほうが勝つ）
  await ctx.route(/\/island-api\//, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/nordic\/photos$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: photosBody }));
  await ctx.route(/\/island-api\/cards$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: cardsBody(n) }));
  // キャラクターの絵。**1人ずつ**返す
  await ctx.route(/\/island-api\/characters\/[^/]+\/(plain|scene)-\d+\.webp/, (r) => {
    const m = /\/characters\/([^/]+)\/((?:plain|scene)-\d+\.webp)/.exec(r.request().url());
    const local = m && `${CHARS}/island__characters__${decodeURIComponent(m[1])}__${m[2]}`;
    if (local && existsSync(local)) {
      r.fulfill({ path: local, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    r.fulfill({ path: `${ROOT}/site/public/characters/ayato.webp`,
      headers: { "access-control-allow-origin": "*" } });
  });
  // 写真そのもの。canvas に焼くので CORS を付けて返す
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) =>
    r.fulfill({ path: `${ROOT}/site/public/og.png`,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" } }));

  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.locator(".akd-tile").first().click();
  // 焼き上がりの絵が出るまで待つ（出る前に測ると紙の背が違う）
  await p.locator(".nstudio-shot img").first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(600);

  /* **道具が当たることを先に見る。** 仕込みを入れて測り、外して測り直す。 */
  await addProbe(p);
  /* **仕込みの畳みは開いてから測る。** 開かずに測ると「小」も「奥」も
     そこに無いことになって、道具が当たるかを見たはずの回が素通りする。
     送りは止める（紙を送ると測る位置が変わる）。 */
  await openFolds(p, { scroll: false });
  const probe = await measure(p, { sel: ".npick, #hbprobe a, #hbprobe-out", min: 48 });
  const v = probeVerdict({ after: probe.rows });
  await delProbe(p);

  const { rows, skipped, excluded } = await measure(p, { sel: ".npick", min: 48 });
  const real = rows.filter((x) => !isProbe(x));

  /* 並びと埋もれ。**「入れない」が見えているか**は、矩形ではなく
     いちばん上に何が居るかで見る（紙の外へ出ていても矩形は返る）。 */
  const view = await p.evaluate(() => {
    const box = document.querySelector(".akd-sheet-body");
    const none = document.querySelector(".npick-none")?.closest(".npick");
    const pick = document.querySelector(".nstudio-pick");
    const cols = pick ?
      getComputedStyle(pick).gridTemplateColumns.split(" ").filter(Boolean).length : 0;
    const win = box.getBoundingClientRect();
    const nb = none?.getBoundingClientRect();
    const hit = (e, x, y) => {
      const t = document.elementFromPoint(x, y);
      return !!t && (t === e || e.contains(t) || t.closest(".npick") === e);
    };
    return {
      札: document.querySelectorAll(".npick").length,
      列: cols,
      段: Math.ceil(document.querySelectorAll(".npick").length / (cols || 1)),
      入れないは先頭: !!none && none === document.querySelector(".nstudio-pick > *"),
      入れないが窓の中: !!nb && nb.top >= win.top - 1 && nb.bottom <= win.bottom + 1,
      入れないの真ん中が押せる: !!nb &&
        hit(none, nb.left + nb.width / 2, nb.top + nb.height / 2),
      入れないを送らずに見える: !!nb && nb.bottom <= win.bottom + 1,
      横あふれ_body: document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      横あふれ_紙: box.scrollWidth > box.clientWidth + 1,
      横あふれ_札の並び: pick.scrollWidth > pick.clientWidth + 1,
      紙の高さ: Math.round(box.scrollHeight),
      紙の窓: Math.round(box.clientHeight),
      写真の高さ: Math.round(
        document.querySelector(".nstudio-shot img")?.getBoundingClientRect().height ?? 0),
      名前の折り返し: [...document.querySelectorAll(".npick i")]
        .filter((e) => e.getBoundingClientRect().height > 40).length,
      /* **段ごとの背のばらつき。** 名前の長さで札の背が変わると、段が
         そろわずに絵を目で追えなくなる。0 でなければ揃っていない。 */
      段の背: (() => {
        const rows = new Map();
        for (const e of document.querySelectorAll(".npick")) {
          const r = e.getBoundingClientRect();
          rows.set(Math.round(r.top), Math.round(r.height));
        }
        return [...rows.values()];
      })(),
    };
  });

  /* **測ったあとは、紙をいちばん上へ戻してから撮る。** `measure` は
     1つずつ `scrollIntoView` するので、そのまま撮ると送った途中の絵になり、
     「写真が切れている」と読めてしまう（見ているのは測りかすです）。 */
  await p.evaluate(() => {
    const box = document.querySelector(".akd-sheet-body");
    if (box) box.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
  /* 札の並びだけを寄って撮る。全体だけだと、潰れているかが読めない */
  const pick = await p.locator(".nstudio-pick").first();
  if (await pick.count()) await pick.screenshot({ path: `${OUT}/${tag}_札.png` });

  const small = real.filter((x) => x.small);
  const minW = Math.min(...real.map((x) => x.hit[0]));
  const minH = Math.min(...real.map((x) => x.hit[1]));
  console.log(
    `\n== 候補${n}人 / 幅${w} ==\n` +
    `  札 ${view.札}（${view.列}列 × ${view.段}段）  写真 ${view.写真の高さ}px  ` +
    `紙 ${view.紙の高さ}px / 窓 ${view.紙の窓}px\n` +
    `  押しどころ 測れた ${real.length} / 測れず ${skipped.length}  ` +
    `48px割れ ${small.length}  いちばん小さい当たり ${minW}x${minH}\n` +
    `  横あふれ body=${view.横あふれ_body} 紙=${view.横あふれ_紙} 並び=${view.横あふれ_札の並び}\n` +
    `  入れない: 先頭=${view.入れないは先頭} 窓の中=${view.入れないが窓の中} ` +
    `真ん中が押せる=${view.入れないの真ん中が押せる} 送らずに見える=${view.入れないを送らずに見える}\n` +
    `  名前が3行以上に折れた札 ${view.名前の折り返し}\n` +
    `  段の背 ${view.段の背.join(" / ")}px  ばらつき ` +
    `${Math.max(...view.段の背) - Math.min(...view.段の背)}px`,
  );
  console.log("  道具の仕込み:");
  v.lines.forEach((l) => console.log("  " + l));
  if (small.length) {
    for (const x of small.slice(0, 6)) {
      console.log(`   ← 割れ ${x.t || "(字なし)"} 見た目 ${x.box[0]}x${x.box[1]} 当たり ${fmtHit(x)}` +
        (x.rivals.length ? ` かぶり: ${x.rivals.map((r2) => `${r2.dir}=${r2.who}`).join(" ")}` : ""));
    }
  }
  if (skipped.length) {
    for (const x of skipped.slice(0, 6)) {
      console.log(`   ← 測れず ${x.t || "(字なし)"} 見た目 ${x.box[0]}x${x.box[1]}（${x.why}）`);
    }
  }
  const ex = Object.entries(excluded);
  if (ex.length) console.log("  数えなかったもの: " + ex.map(([k, q]) => `${k} ${q}`).join(" / "));

  await ctx.close();
  const bad =
    !v.ok ||
    small.length > 0 ||
    skipped.length > 0 ||
    real.length !== view.札 ||
    view.横あふれ_body || view.横あふれ_紙 || view.横あふれ_札の並び ||
    !view.入れないは先頭 || !view.入れないの真ん中が押せる ||
    Math.max(...view.段の背) !== Math.min(...view.段の背);
  return { tag, bad, view, small: small.length };
}

const NS = (process.env.NS || "5,18").split(",").map(Number);
const WS = (process.env.WS || "390,1280").split(",").map(Number);
const out = [];
for (const w of WS) for (const n of NS) out.push(await run(n, w));
await b.close();

const bad = out.filter((r) => r.bad);
console.log(`\n撮ったもの: ${OUT}`);
try {
  console.log(execFileSync("ls", ["-1", OUT]).toString().trim().split("\n").map((s) => "  " + s).join("\n"));
} catch { /* 一覧が出せなくても判定は変わらない */ }
console.log(bad.length === 0 ?
  "\n割れ0・あふれ0・測れず0" :
  `\nだめだったもの: ${bad.map((r) => r.tag).join(" ")}`);
process.exit(bad.length === 0 ? 0 : 1);
