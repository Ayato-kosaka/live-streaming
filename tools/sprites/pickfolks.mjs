/**
 * 「だれを入れますか」に、**その日いた人**が出ているかを見る道具。
 *
 *   PORT=4160 node tools/sprites/pickfolks.mjs          # 本番の返事そのまま／people を空にした回
 *   PORT=4160 WS=390 DAYS=2026-09-12 node tools/sprites/pickfolks.mjs
 *
 * ## なぜ要るか
 *
 * 口（`GET /island-api/nordic/photos`）は `days[].people` で
 * 「その日いた人」を返しているのに、画面がそれを1か所も読んでいなかった。
 * 候補はカードの口（`GET /cards`）だけから作られていて、**その日投げ銭した
 * 人しか入れられなかった**（2026-09-13 は5人。68回コメントしてくれた人が
 * 入っていない）。
 *
 * **差し込みは本番の返事をそのまま使う**（`docs/island-misses.md` #2）。
 * 手で作った値を置くと、直っていないものが直って見える。
 * `people` を空にした回も一緒に撮って、**口が落ちた日・古い書き出しの日に
 * 1人も変わらない**ことを同じ道具で見る。
 *
 * ## 絵は1人1枚にする
 *
 * 全員おなじ絵にすると、重複が落ちているのか、同じ人が何度も出ているのかが
 * 見分けられない。本番の絵を icon ごとに落として、1人ずつ返す
 * （この箱のブラウザからは絵の置き場に出られないが、curl では取れる）。
 *
 * ## 押しどころは `hitbox.mjs` で測る
 *
 * `getBoundingClientRect` では、隣に取られている場所が出ない。
 * **仕込み（`addProbe`）を先に通して、道具が当たることを確かめてから**
 * 「割れ0」を読む（#79 #83）。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { measure, openFolds, addProbe, delProbe, isProbe, probeVerdict, fmtHit } from "./hitbox.mjs";

const PORT = process.env.PORT || "4160";
const OUT = process.env.OUT || "/tmp/pickfolks";
const CACHE = `${OUT}/chars`;
const ROOT = "/home/user/live-streaming";
const PROD = "https://live-streaming-d3cac.web.app";
const WS = (process.env.WS || "390,1280").split(",").map(Number);
const DAYS = (process.env.DAYS || "2026-09-13").split(",");
mkdirSync(CACHE, { recursive: true });

/** 本番の返事を curl で取る。**この箱のブラウザからは出られないが curl は通る。** */
const grab = (path) => {
  const raw = execFileSync("curl", ["-sS", "--max-time", "60", `${PROD}/island-api${path}`],
    { maxBuffer: 1 << 26 }).toString();
  return JSON.parse(raw);
};

const photos = grab("/nordic/photos");
const cards = grab("/cards");
console.log(`本番の返事: 写真 ${photos.days.length}日ぶん / カード ${cards.cards.length}枚`);

/**
 * 絵を1枚ずつ落としてくる。**幅は画面が頼む 128 と、焼くときの 640。**
 *
 * 22人ぶんを続けて取ると、ときどき1枚だけ空で返ってくる（実測で2枚）。
 * そこで諦めると**その人だけ ayato.png に落ちて**、1人1枚で撮る意味が
 * 消える。3回まで取り直す。
 */
function chrFile(icon, size) {
  const f = `${CACHE}/${icon}__plain-${size}.webp`;
  if (existsSync(f)) return f;
  for (let i = 0; i < 3; i += 1) {
    try {
      const buf = execFileSync("curl", ["-sS", "--max-time", "60", "--retry", "2",
        `${PROD}/island-api/characters/${encodeURIComponent(icon)}/plain-${size}.webp`],
        { maxBuffer: 1 << 26 });
      // 落ちなかったものは置かない（0バイトを置くと、次から「あるもの」になる）
      if (buf.length >= 200) {
        writeFileSync(f, buf);
        return f;
      }
    } catch { /* 取り直す */ }
  }
  return null;
}

/** その日の写真そのもの。**本番の1枚で撮る**（比が違うと紙の背が変わる）。 */
function shotFile(photo) {
  const f = `${CACHE}/shot__${photo.id}.jpg`;
  if (existsSync(f)) return f;
  for (let i = 0; i < 3; i += 1) {
    try {
      const buf = execFileSync("curl", ["-sS", "--max-time", "90", "--retry", "2", photo.url],
        { maxBuffer: 1 << 26 });
      if (buf.length >= 200) {
        writeFileSync(f, buf);
        return f;
      }
    } catch { /* 取り直す */ }
  }
  return null;
}

/** その日に出るはずの絵を、先に全部落とす。落ちない人がいたら、そこで止める。 */
const wanted = new Set();
for (const d of photos.days) for (const p of d.people) if (p.icon) wanted.add(p.icon);
for (const c of cards.cards) if (c.icon) wanted.add(c.icon);
const gone = [...wanted].filter((i) => !chrFile(i, 128) || !chrFile(i, 640));
if (gone.length) {
  console.error(`絵が落ちてこない人が ${gone.length} 人います: ${gone.join(" ")}\n` +
    "全員おなじ絵で撮っても、重複が落ちているのか壊れているのか分からない");
  process.exit(1);
}
console.log(`絵 ${wanted.size} 人ぶん（${CACHE}）`);

/** その日の中身を、本番の返事から数える。**画面と突き合わせる相手。** */
function expect(day) {
  const d = photos.days.find((x) => x.day === day);
  const pid = d.photos[0].id;
  const mine = cards.cards.filter((c) => c.photoId === pid && c.icon);
  const seenC = new Set(mine.map((c) => c.channelId).filter(Boolean));
  const seenI = new Set(mine.map((c) => c.icon));
  const add = [];
  for (const p of d.people) {
    if (!p.icon) continue;
    if (p.channelId && seenC.has(p.channelId)) continue;
    if (seenI.has(p.icon)) continue;
    seenC.add(p.channelId); seenI.add(p.icon); add.push(p);
  }
  /* カードも持っていて名簿にも居る人。**1マスにしか出ないことを見る相手。** */
  const both = d.people.filter((p) => p.channelId &&
    mine.some((c) => c.channelId === p.channelId));
  return { day, pid, photo: d.photos[0], cards: mine, people: d.people, add, both,
    only: mine.length, all: mine.length + add.length };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

async function run(day, w, withPeople) {
  const e = expect(day);
  const tag = `${day}_${w}_${withPeople ? "people" : "nopeople"}`;
  const body = withPeople ? photos :
    { days: photos.days.map((d) => ({ ...d, people: [] })) };
  const ctx = await b.newContext({
    viewport: { width: w, height: w < 700 ? 844 : 900 },
    deviceScaleFactor: 2,
    isMobile: w < 700, hasTouch: w < 700,
    reducedMotion: "reduce",
  });
  // 口はぜんぶ空。そのうえで見たい2本だけ差し替える（あとに書いたほうが勝つ）
  await ctx.route(/\/island-api\//, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/nordic\/photos$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
  await ctx.route(/\/island-api\/cards$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cards) }));
  // キャラクターの絵。**1人ずつ違うものを返す**
  await ctx.route(/\/island-api\/characters\/[^/]+\/plain-\d+\.webp/, (r) => {
    const m = /\/characters\/([^/]+)\/plain-(\d+)\.webp/.exec(r.request().url());
    const f = m && `${CACHE}/${decodeURIComponent(m[1])}__plain-${m[2]}.webp`;
    if (f && existsSync(f)) {
      r.fulfill({ body: readFileSync(f), contentType: "image/webp",
        headers: { "access-control-allow-origin": "*" } });
      return;
    }
    r.fulfill({ path: `${ROOT}/site/public/characters/ayato.webp`,
      headers: { "access-control-allow-origin": "*" } });
  });
  /* 写真そのもの。**本番の1枚を落として返す。** 代わりの絵で撮ると、
     縦横比が変わって紙の背も送り具合も変わる（本番は 1200x1600 の縦）。
     canvas に焼くので CORS を付ける。 */
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) => {
    const f = shotFile(e.photo);
    if (f) {
      r.fulfill({ body: readFileSync(f), contentType: "image/jpeg",
        headers: { "access-control-allow-origin": "*" } });
      return;
    }
    r.fulfill({ path: `${ROOT}/site/public/og.png`, contentType: "image/png",
      headers: { "access-control-allow-origin": "*" } });
  });

  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (x) => errs.push(String(x)));
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.locator(`.akd-day:has(h2) .akd-tile`).first().waitFor({ timeout: 15000 });
  /* その日の紙を押す。**日付で選ぶ**（新しい順に並ぶので先頭とは限らない） */
  const when = `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
  await p.locator(`.akd-day:has(h2:has-text("${when}")) .akd-tile`).first().click();
  await p.locator(".nstudio-shot img").first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(600);

  /* **道具が当たることを先に見る。** 仕込みを入れて測り、外して測り直す。 */
  await addProbe(p);
  await openFolds(p, { scroll: false });
  const probe = await measure(p, { sel: ".npick, #hbprobe a, #hbprobe-out", min: 48 });
  const v = probeVerdict({ after: probe.rows });
  await delProbe(p);

  const { rows, skipped, excluded } = await measure(p, { sel: ".npick", min: 48 });
  const real = rows.filter((x) => !isProbe(x));

  const view = await p.evaluate(() => {
    const box = document.querySelector(".akd-sheet-body");
    const none = document.querySelector(".npick-none")?.closest(".npick");
    const pick = document.querySelector(".nstudio-pick");
    const win = box.getBoundingClientRect();
    const nb = none?.getBoundingClientRect();
    const hit = (e, x, y) => {
      const t = document.elementFromPoint(x, y);
      return !!t && (t === e || e.contains(t) || t.closest(".npick") === e);
    };
    /* 出ている絵の id。**1マスに1人**かを見るので、URL ではなく id で数える */
    const icons = [...document.querySelectorAll(".nstudio-pick .npick img")]
      .map((i) => (/\/characters\/([^/]+)\//.exec(i.src) || [])[1] || i.src);
    return {
      札: document.querySelectorAll(".npick").length,
      候補: icons.length,
      絵: icons,
      入れないは先頭: !!none && none === document.querySelector(".nstudio-pick > *"),
      入れないの真ん中が押せる: !!nb && hit(none, nb.left + nb.width / 2, nb.top + nb.height / 2),
      横あふれ_body: document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      横あふれ_紙: box.scrollWidth > box.clientWidth + 1,
      横あふれ_札の並び: pick.scrollWidth > pick.clientWidth + 1,
      紙の高さ: Math.round(box.scrollHeight),
      紙の窓: Math.round(box.clientHeight),
      段の背: (() => {
        const rs = new Map();
        for (const el of document.querySelectorAll(".npick")) {
          const r = el.getBoundingClientRect();
          rs.set(Math.round(r.top), Math.round(r.height));
        }
        return [...rs.values()];
      })(),
    };
  });

  /* 測ると1つずつ送られるので、**撮る前に紙をいちばん上へ戻す。** */
  await p.evaluate(() => {
    const box = document.querySelector(".akd-sheet-body");
    if (box) box.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
  const pick = p.locator(".nstudio-pick").first();
  if (await pick.count()) await pick.screenshot({ path: `${OUT}/${tag}_札.png` });

  const want = withPeople ? e.all : e.only;
  const dup = view.絵.length - new Set(view.絵).size;
  /* カードも持っていて名簿にも居る人が、1マスにしか出ていないか */
  const twice = e.both.map((x) => ({
    ch: x.channelId, icon: x.icon,
    出た数: view.絵.filter((i) => i === x.icon).length,
  }));
  const small = real.filter((x) => x.small);
  const minW = real.length ? Math.min(...real.map((x) => x.hit[0])) : 0;
  const minH = real.length ? Math.min(...real.map((x) => x.hit[1])) : 0;
  console.log(
    `\n== ${day} / 幅${w} / people ${withPeople ? "あり" : "空"} ==\n` +
    `  候補 ${view.候補}人（本番の値から出した見込み ${want}人：` +
    `カード ${e.only} ＋ その日いた人 ${withPeople ? e.add.length : 0}）\n` +
    `  同じ絵が2度出た数 ${dup}  カードも名簿にも居る人 ${twice.length}人 → ` +
    `出た数 ${twice.map((t) => t.出た数).join(",") || "-"}\n` +
    `  押しどころ 測れた ${real.length} / 測れず ${skipped.length}  ` +
    `48px割れ ${small.length}  いちばん小さい当たり ${minW}x${minH}\n` +
    `  横あふれ body=${view.横あふれ_body} 紙=${view.横あふれ_紙} 並び=${view.横あふれ_札の並び}\n` +
    `  入れない: 先頭=${view.入れないは先頭} 真ん中が押せる=${view.入れないの真ん中が押せる}\n` +
    `  紙 ${view.紙の高さ}px / 窓 ${view.紙の窓}px  段の背 ${view.段の背.join(" / ")}px\n` +
    `  JSのエラー ${errs.length}`);
  console.log("  道具の仕込み:");
  v.lines.forEach((l) => console.log("  " + l));
  for (const x of small.slice(0, 6)) {
    console.log(`   ← 割れ ${x.t || "(字なし)"} 見た目 ${x.box[0]}x${x.box[1]} 当たり ${fmtHit(x)}`);
  }
  for (const x of skipped.slice(0, 6)) {
    console.log(`   ← 測れず ${x.t || "(字なし)"} 見た目 ${x.box[0]}x${x.box[1]}（${x.why}）`);
  }
  const ex = Object.entries(excluded);
  if (ex.length) console.log("  数えなかったもの: " + ex.map(([k, q]) => `${k} ${q}`).join(" / "));

  await ctx.close();
  const bad =
    !v.ok || view.候補 !== want || dup > 0 || twice.some((t) => t.出た数 !== 1) ||
    small.length > 0 || skipped.length > 0 || real.length !== view.札 ||
    view.横あふれ_body || view.横あふれ_紙 || view.横あふれ_札の並び ||
    !view.入れないは先頭 || !view.入れないの真ん中が押せる ||
    Math.max(...view.段の背) !== Math.min(...view.段の背) ||
    errs.length > 0;
  return { tag, bad };
}

const out = [];
for (const day of DAYS) for (const w of WS) {
  out.push(await run(day, w, true));
  out.push(await run(day, w, false));
}
await b.close();
const bad = out.filter((r) => r.bad);
console.log(`\n撮ったもの: ${OUT}`);
console.log(bad.length === 0 ? "\n全部そろった" : `\nだめだったもの: ${bad.map((r) => r.tag).join(" ")}`);
process.exit(bad.length === 0 ? 0 : 1);
