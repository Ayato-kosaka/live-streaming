/**
 * **ガイドブック型の街の面（`components/guidebook/`）を、書き出したもので確かめる。**（#1228）
 *
 *   tools/build.sh 3130
 *   python3 -m http.server 4130 --directory site/.next-3130 &
 *   DIST=site/.next-3130 SPORT=4130 node tools/sprites/guidebook.mjs                 # ソフィア
 *   DIST=… SPORT=… PAGE=/travel/north-macedonia/skopje node tools/sprites/guidebook.mjs
 *   …  BASE_PORT=4131 BASE_PAGE=/bulgaria node tools/sprites/guidebook.mjs       # 字の量を前の面と比べる
 *   …  BREAK=pins node tools/sprites/guidebook.mjs     # 対照: エリアの札をずらす前の位置へ戻す（ずらした札のある街で落ちる。ソフィアは矢印と重なる）
 *   …  BREAK=spots node tools/sprites/guidebook.mjs    # 対照: 写真のピンを本当の位置へ戻す（引き出し線をやめる。固まった所で重なって落ちる。両方の街で落ちる）
 *   …  BREAK=lead node tools/sprites/guidebook.mjs     # 対照: 線のあるピンを、本当の位置から絵の幅の3割先へ動かす（線が長くて落ちる）
 *   …  BREAK=photo node tools/sprites/guidebook.mjs    # 対照: ピンの写真の道を壊す（描けていなくて落ちる）
 *   …  BREAK=label node tools/sprites/guidebook.mjs    # 対照: 地図の外の札の名前を狭くする（名前が折れて落ちる。地図の外のある街で）
 *
 * 終了コード 0＝通った / 1＝見つかった / 2＝数えるものが無い（面が開けない・窓が1つも無い）。
 *
 * ## 見るもの
 *
 * | | |
 * | --- | --- |
 * | 節の並び | #1228 の表の順（表紙 → 目次 → どんな街 → やりたいこと → 見たい → 食べたい → 買いたい → 基本情報 → この街の動画） |
 * | 横あふれ | 390 と 1440 で 0。**窓を開いた状態でも** |
 * | 窓の中身が HTML に在る | 書き出した HTML（JS を動かす前）に、窓の数だけ `<dialog>` があり、題の字が入っている |
 * | ハッシュで直に開く | `#do-<id>` で着くと、その窓が開いていて、フォーカスが窓の中 |
 * | Esc・閉じる・背景・戻る | どれでも閉じて、URL からハッシュが消える |
 * | 元の位置に戻る | 札から開いて閉じると、開く前の高さ（±4px）と、押した札にフォーカス |
 * | 窓から窓へ | 窓の中の札で別の窓に入れ替わり、戻る1回で面に戻る |
 * | 字の量 | 最初に開いた状態（窓と畳みは閉じたまま）で `main` に見えている字の数。前の面と比べる |
 * | エリアの札 | 描いたエリア地図の上の名前の札が、**390 と 1440 で互いに重ならず、絵の外にはみ出さない**（ソフィアの「中心・セルディカ」と「ネフスキー大聖堂まわり」が 390px で重なった。2026-11-15） |
 * | 見どころマップ | 写真のピン・地区の札・地図の外の矢印が、390 と 1440 で**どの2つも重ならず**、ピンと矢印が絵の外にはみ出さない。どのピンも当たり 44px 以上（`hitbox.mjs`）。ピンと矢印を押すと窓が開く（窓の無い矢印は Google マップ）。一覧と札の行き先の窓が在る（#1228） |
 * | 写真と線 | 書き出した HTML に Wikimedia から直に読む絵が0本。ピンの写真が全部描けている。引き出し線が上限（絵の幅の 72/340）より長くない。地図の外の札の名前が1行。ピンの無い地区は並べて出す（落とさない） |
 *
 * 撮った絵は `OUT`（既定 `/tmp/guidebook-shots`）に節ごとに置く（390px・dpr 2）。
 *
 * ## 借りた写真は、本物を返す
 *
 * この箱のブラウザからは `upload.wikimedia.org` に届かない（`CLAUDE.md`）。撮った絵が空の枠だらけだと、
 * 見ても何も分からない。**curl では届く**ので、1枚ずつ落として置き場（`WM_CACHE`）に溜め、同じ道で返す。
 * 落とせなかった絵の数は終わりに出す。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { fmtHit, measure } from "./hitbox.mjs";

const SPORT = process.env.SPORT || "4130";
const PAGE = process.env.PAGE || "/travel/bulgaria/sofia";
const OUT = process.env.OUT || "/tmp/guidebook-shots";
const WM = process.env.WM_CACHE || "/tmp/guidebook-wm";
const EXE = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ORDER = ["cover", "toc", "about", "todo", "see", "eat", "buy", "basics", "videos"];
const url = (port, path, hash = "") => `http://127.0.0.1:${port}${path}.html${hash}`;

mkdirSync(OUT, { recursive: true });
mkdirSync(WM, { recursive: true });

const bad = [];
const notes = [];
const fail = (what) => bad.push(what);
let wmHit = 0;
let wmMiss = 0;

/** 借りた写真を curl で落として返す（同じ道は1回だけ落とす） */
async function wikimedia(route) {
  const u = route.request().url();
  const f = join(WM, createHash("sha1").update(u).digest("hex"));
  /* **続けて落とすと 429（混んでいる）が HTML で返る。** それを絵として溜めると、撮った絵に壊れた枠が出て
     「写真が壊れている」と読み違える（本番では読む人ごとに別の口から取るので起きない）。
     `-f` で失敗にして、間を空けて取り直す。溜めた中身が絵でなければ捨てる */
  const isPic = () => {
    if (!existsSync(f) || statSync(f).size === 0) return false;
    const head = readFileSync(f).subarray(0, 16).toString("latin1");
    return !/^\s*</.test(head);
  };
  for (let i = 0; i < 5 && !isPic(); i++) {
    try {
      execFileSync("curl", ["-sS", "-f", "-L", "-m", "30", "-A", "ayatojima-guidebook-check/1.0", "-o", f, u], { stdio: "ignore" });
    } catch {
      execFileSync("sleep", [String(2 + i * 3)]);
    }
  }
  if (isPic()) {
    wmHit++;
    const ext = u.split("?")[0].split(".").pop().toLowerCase();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(f) });
  }
  wmMiss++;
  return route.abort();
}

async function ctxOf(b, width) {
  const ctx = await b.newContext({
    viewport: { width, height: width < 720 ? 844 : 900 },
    deviceScaleFactor: 2,
    isMobile: width < 720,
    hasTouch: width < 720,
  });
  await ctx.route(/^https:\/\/(upload\.wikimedia\.org|i\.ytimg\.com)\//, wikimedia);
  /* 島の外へは出さない。**地図の埋め込み（Google）も止める**——半分だけ読めた埋め込みが投げる例外
     （`_startApp is not defined`）が、面の JS の例外に混ざる。地図はこの道具の見る物ではない */
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|upload\.wikimedia\.org|i\.ytimg\.com)/, (r) => r.abort());
  return ctx;
}

/**
 * エリア地図の札の重なり。札の箱（`getBoundingClientRect`）を2つずつ比べ、1px でも重なれば落とす。
 * 絵（`.gb-amap-art`）は `overflow: hidden` なので、はみ出した札は切れて読めない——それも落とす。
 * 絵が無い面（色の札の地図）は数えるものが無いので、数だけ出す
 */
async function pinCheck(p, width) {
  /* 対照: `BREAK=pins` で、札を manifest の元の位置（ずらす前）へ戻す。重なる絵なら、ここで落ちること */
  if (process.env.BREAK === "pins")
    await p.evaluate(() =>
      document.querySelectorAll(".gb-amap-pin").forEach((e) => {
        e.style.left = `${Number(e.dataset.x) * 100}%`;
        e.style.top = `${Number(e.dataset.y) * 100}%`;
      }),
    );
  const r = await p.evaluate(() => {
    const art = document.querySelector(".gb-amap-art");
    const pins = [...document.querySelectorAll(".gb-amap-pin")].map((e) => ({ t: e.textContent.trim(), r: e.getBoundingClientRect() }));
    const a = art?.getBoundingClientRect();
    const over = [];
    for (let i = 0; i < pins.length; i++)
      for (let j = i + 1; j < pins.length; j++) {
        const x = pins[i].r;
        const y = pins[j].r;
        if (x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom) over.push(`${pins[i].t} と ${pins[j].t}`);
      }
    const out = a ? pins.filter((q) => q.r.left < a.left - 0.5 || q.r.right > a.right + 0.5 || q.r.top < a.top - 0.5 || q.r.bottom > a.bottom + 0.5).map((q) => q.t) : [];
    return { n: pins.length, over, out };
  });
  if (!r.n) {
    notes.push(`${width}px: エリア地図の絵が無い（札の重なりは見ていない）`);
    return;
  }
  notes.push(`${width}px: エリアの札 ${r.n}枚`);
  if (r.over.length) fail(`${width}px でエリアの札が重なる: ${r.over.join("／")}`);
  if (r.out.length) fail(`${width}px でエリアの札が絵の外にはみ出す: ${r.out.join("／")}`);
}

/**
 * **見どころマップ**（`components/guidebook/SpotMap.tsx`。#1228）。写真のピン・地区の札・地図の外の矢印を、
 * 書き出したもので測る:
 *
 * - どの2つも重ならない（ピンは丸で測る。ピンどうしは中心の距離、ピンと札・矢印は丸から長方形まで）
 * - ピン・矢印が絵の外にはみ出さない（絵は `overflow: hidden` なので、はみ出したぶんは切れて押せない）
 * - どのピンも当たりが 44px 以上（`hitbox.mjs` の測りかた。見た目の箱ではなく、中心から1pxずつ外へ）
 * - ピンを押すとその見たいものの窓が開く・矢印は窓か Google マップ・一覧の札の行き先の窓が在る
 *
 * 対照: `BREAK=spots` で、ピンを本当の位置（引き出し線でずらす前）へ戻す。固まった所のある街なら、ここで落ちること
 */
async function spotCheck(p, width) {
  if (process.env.BREAK === "spots")
    await p.evaluate(() =>
      document.querySelectorAll(".gb-amap-spot").forEach((e) => {
        e.style.left = `${Number(e.dataset.tx) * 100}%`;
        e.style.top = `${Number(e.dataset.ty) * 100}%`;
      }),
    );
  if (process.env.BREAK === "lead")
    await p.evaluate(() =>
      document.querySelectorAll(".gb-amap-spot").forEach((e) => {
        e.style.left = `${Math.min(Number(e.dataset.tx) + 0.3, 0.9) * 100}%`;
      }),
    );
  if (process.env.BREAK === "label") await p.addStyleTag({ content: ".gb-lg-out > span:first-child { max-width: 4em; }" });
  if (process.env.BREAK === "photo") {
    await p.evaluate(() => document.querySelectorAll(".gb-amap-spot img").forEach((i) => i.setAttribute("src", `${i.getAttribute("src")}.nothing`)));
    await settle(p, 800);
  }
  const r = await p.evaluate(() => {
    const art = document.querySelector(".gb-amap-art")?.getBoundingClientRect();
    const box = (sel, kind) =>
      [...document.querySelectorAll(sel)].map((e) => {
        const b = e.getBoundingClientRect();
        return { t: (e.querySelector(".sr-only") ?? e).textContent.trim() || e.getAttribute("href"), kind, b, cx: b.left + b.width / 2, cy: b.top + b.height / 2, r: b.width / 2 };
      });
    const spots = box(".gb-amap-spot", "ピン");
    const rects = [...box(".gb-amap-pin", "札"), ...box(".gb-amap-out", "矢印")];
    const toRect = (c, b) => Math.hypot(Math.max(b.left - c.cx, 0, c.cx - b.right), Math.max(b.top - c.cy, 0, c.cy - b.bottom));
    const over = [];
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++)
        if (Math.hypot(spots[i].cx - spots[j].cx, spots[i].cy - spots[j].cy) < spots[i].r + spots[j].r) over.push(`ピン${spots[i].t} とピン${spots[j].t}`);
      for (const q of rects) if (toRect(spots[i], q.b) < spots[i].r) over.push(`ピン${spots[i].t} と${q.kind}「${q.t}」`);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const x = rects[i].b;
        const y = rects[j].b;
        if (rects[i].kind === "札" && rects[j].kind === "札") continue; // 札どうしは pinCheck が見る
        if (x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom) over.push(`${rects[i].kind}「${rects[i].t}」と${rects[j].kind}「${rects[j].t}」`);
      }
    const out = art
      ? [...spots, ...rects.filter((q) => q.kind === "矢印")]
          .filter((q) => q.b.left < art.left - 0.5 || q.b.right > art.right + 0.5 || q.b.top < art.top - 0.5 || q.b.bottom > art.bottom + 0.5)
          .map((q) => `${q.kind}${q.t}`)
      : [];
    /* 引き出し線の長さ。並べる側の上限（`content/guidebook/spotmap.ts` の SPOT_REACH。いちばん狭い絵 340px で 72px）を
       絵の幅の割合で見る。ソフィアの聖ソフィア教会が 390px で 87px の線の先に立った（2026-11-15） */
    const long = art
      ? [...document.querySelectorAll(".gb-amap-spot")]
          .map((e) => {
            const b = e.getBoundingClientRect();
            const len = Math.hypot(b.left + b.width / 2 - (art.left + Number(e.dataset.tx) * art.width), b.top + b.height / 2 - (art.top + Number(e.dataset.ty) * art.height));
            return { t: e.querySelector(".sr-only")?.textContent.trim(), len, ratio: len / art.width };
          })
          .filter((x) => x.ratio > 72 / 340 + 0.01)
          .map((x) => `${x.t}（${Math.round(x.len)}px）`)
      : [];
    /* ピンの写真が、本当に描けているか（読めなかった絵は白い丸になる） */
    const blank = [...document.querySelectorAll(".gb-amap-spot img")]
      .filter((i) => !i.complete || !i.naturalWidth)
      .map((i) => i.closest("a").querySelector(".sr-only")?.textContent.trim() || i.getAttribute("src"));
    /* ピンの無い地区（札はあるのに、一覧に番号が1つも無い）。見たいものもやりたいことも無い地区はありうるので、落とさず並べる */
    const bare = [...document.querySelectorAll(".gb-lg")]
      .filter((g) => g.querySelector("a.gb-lg-h") && !g.querySelector(".gb-amap-n"))
      .map((g) => g.querySelector(".gb-lg-h b")?.firstChild?.textContent.trim());
    /* 地図の外の一覧の札は、名前を1行に（「シュト・／オリザリ マップで見る」と、名前の途中で折れた。2026-11-15） */
    const broken = [...document.querySelectorAll(".gb-lg-out > span:first-child")]
      .filter((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1;
      })
      .map((e) => e.textContent.trim());
    return { art: !!art, spots: spots.length, arrows: rects.filter((q) => q.kind === "矢印").length, over, out, long, blank, bare, broken };
  });
  if (!r.art) return notes.push(`${width}px: 見どころマップの絵が無い（ピンは見ていない）`);
  notes.push(`${width}px: 写真のピン ${r.spots}本・地図の外の矢印 ${r.arrows}`);
  if (!r.spots) fail(`${width}px で見どころマップに写真のピンが1本も無い`);
  if (r.over.length) fail(`${width}px で見どころマップの重なり: ${r.over.slice(0, 6).join("／")}`);
  if (r.out.length) fail(`${width}px で絵の外にはみ出す: ${r.out.join("／")}`);
  if (r.long.length) fail(`${width}px で引き出し線が長いピン: ${r.long.join("／")}`);
  if (r.blank.length) fail(`${width}px でピンの写真が描けていない: ${r.blank.join("／")}`);
  if (r.broken.length) fail(`${width}px で地図の外の札の名前が折れている: ${r.broken.join("／")}`);
  if (r.bare.length) notes.push(`${width}px: ピンの無い地区 ${r.bare.join("・")}`);
}

/** ピンの当たり（44px 以上）と、ピン・矢印・一覧を押した先。390px で1回だけ */
async function spotPress(p) {
  const { rows, skipped } = await measure(p, { sel: ".gb-amap-spot", min: 44 });
  const small = rows.filter((x) => x.small).map((x) => `${x.t || x.href}（${fmtHit(x)}）`);
  if (skipped.length) fail(`ピンの真ん中が押せない: ${skipped.map((x) => `${x.t}（${x.why}）`).join("／")}`);
  if (small.length) fail(`当たりが 44px に届かないピン: ${small.join("／")}`);
  if (rows.length) notes.push(`ピンの当たり: いちばん小さい ${Math.min(...rows.map((x) => Math.min(...x.hit)))}px（${rows.length}本）`);
  /* 押す。窓が開いて、その窓の id が押した札の行き先と同じ */
  const hrefs = await p.$$eval(".gb-amap-spot, .gb-amap-out", (es) => es.map((e) => ({ href: e.getAttribute("href"), cls: e.className, target: e.getAttribute("target") })));
  for (const [i, h] of hrefs.entries()) {
    if (!h.href.startsWith("#")) {
      if (!/^https:\/\/www\.google\.com\/maps\/search\/\?/.test(h.href) || h.target !== "_blank") fail(`地図の外の矢印の行き先が Google マップの検索ではない（${h.href}）`);
      continue;
    }
    const el = p.locator(".gb-amap-spot, .gb-amap-out").nth(i);
    const what = h.cls.includes("spot") ? "ピン" : "矢印";
    await el.scrollIntoViewIfNeeded();
    /* 指の届く所を押す（隠れていれば、Playwright は押さずに待ち続ける。そこで止めずに「押せない」と数える） */
    const ok = await el.click({ timeout: 3000 }).then(
      () => true,
      () => false,
    );
    if (!ok) {
      fail(`${what} ${h.href} が、ほかのものに隠れて押せない`);
      continue;
    }
    await settle(p);
    const got = await openId(p);
    if (got !== h.href.slice(1)) fail(`${what}を押しても ${h.href} が開かない（開いたのは ${got}）`);
    await p.keyboard.press("Escape");
    await settle(p);
  }
  const lost = await p.$$eval(".gb-maplg a[href^='#'], .gb-amap-pin", (es) =>
    es.map((e) => e.getAttribute("href").slice(1)).filter((id) => !document.getElementById(id)),
  );
  if (lost.length) fail(`見どころマップの一覧・札の行き先の窓が無い: ${lost.join(" ")}`);
}

const openId = (p) => p.evaluate(() => document.querySelector("dialog.gb-dlg[open]")?.id ?? null);
const hashOf = (p) => p.evaluate(() => location.hash);
const settle = (p, ms = 350) => p.waitForTimeout(ms);

async function main() {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  try {
    // ---- 0. 書き出した HTML（JS を動かす前）に、窓の中身が在るか
    const raw = await fetch(url(SPORT, PAGE)).then((r) => (r.ok ? r.text() : ""));
    if (!raw) {
      console.error(`開けなかった: ${url(SPORT, PAGE)}`);
      return 2;
    }
    const rawDialogs = [...raw.matchAll(/<dialog id="([^"]+)"[^>]*class="gb-dlg[^"]*"[\s\S]*?<\/dialog>/g)];
    if (!rawDialogs.length) {
      console.error("書き出した HTML に窓（dialog.gb-dlg）が1つも無い");
      return 2;
    }
    const empty = rawDialogs.filter((m) => m[0].replace(/<[^>]+>/g, "").replace(/\s/g, "").length < 20).map((m) => m[1]);
    if (empty.length) fail(`中身の無い窓: ${empty.slice(0, 5).join(" ")}`);
    const todoIds = rawDialogs.map((m) => m[1]).filter((id) => id.startsWith("do-"));
    notes.push(`書き出した HTML の窓 ${rawDialogs.length}（やりたいこと ${todoIds.length}）`);
    /* 借りた写真は島の置き場から配る（`python/guide_photos.py`）。Wikimedia から直に読むと、混んだ日に 429 で
       断られてピンが白い丸になった（2026-11-15）。作者のページへのリンク（commons.wikimedia.org）は数えない */
    const wmImg = (raw.match(/(?:src|srcSet|srcset)="[^"]*upload\.wikimedia\.org/g) ?? []).length;
    if (wmImg) fail(`書き出した HTML に Wikimedia から直に読む絵が ${wmImg} 本ある（python/guide_photos.py で置き場に落として焼き直す）`);
    if (!todoIds.length) fail("やりたいことの窓（#do-…）が無い");
    if (todoIds.length > 8) fail(`やりたいことが ${todoIds.length}（最大8）`);

    // ---- 1. 390px: 並び・横あふれ・字の量・撮る
    const ctx = await ctxOf(b, 390);
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await p.goto(url(SPORT, PAGE), { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle").catch(() => {});
    await settle(p, 800);
    const chars = await p.evaluate(() => document.querySelector("main").innerText.replace(/\s/g, "").length);
    const order = await p.evaluate(() => [...document.querySelectorAll("[data-gb]")].map((e) => e.getAttribute("data-gb")));
    const seq = order.filter((x) => ORDER.includes(x));
    if (JSON.stringify(seq) !== JSON.stringify(ORDER)) fail(`節の並びが違う: ${seq.join(" → ")}`);
    const domDialogs = await p.evaluate(() => document.querySelectorAll("dialog.gb-dlg").length);
    if (domDialogs !== rawDialogs.length) fail(`窓の数が HTML（${rawDialogs.length}）と画面（${domDialogs}）で違う`);

    /* 下まで送って、遅れて読む絵を呼ぶ */
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForLoadState("networkidle").catch(() => {});
    await settle(p, 600);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) fail(`390px で横あふれ ${over}px`);
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    await pinCheck(p, 390);
    await spotCheck(p, 390);
    for (const id of order) {
      const el = await p.$(`[data-gb="${id}"]`);
      if (el) await el.screenshot({ path: join(OUT, `${String(ORDER.indexOf(id) + 1).padStart(2, "0")}-${id}.png`) });
    }
    await p.locator(".gb-amap").screenshot({ path: join(OUT, "areamap-390.png") });
    await spotPress(p);

    // ---- 2. 札から開いて、閉じるボタンで閉じる → 元の位置
    const first = todoIds[0];
    const card = p.locator(`main a[href="#${first}"]`).first();
    await card.scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, -120));
    await settle(p);
    const y0 = await p.evaluate(() => window.scrollY);
    await card.click();
    await settle(p);
    if ((await openId(p)) !== first) fail(`札を押しても ${first} が開かない`);
    if ((await hashOf(p)) !== `#${first}`) fail(`開いたのに URL が #${first} にならない（${await hashOf(p)}）`);
    const overOpen = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overOpen > 0) fail(`窓を開くと横あふれ ${overOpen}px`);
    const dlgOver = await p.evaluate((id) => {
      const d = document.getElementById(id).querySelector(".gb-dlg-in");
      return d.scrollWidth - d.clientWidth;
    }, first);
    if (dlgOver > 0) fail(`窓の中で横あふれ ${dlgOver}px（${first}）`);
    await p.locator(`#${first}`).screenshot({ path: join(OUT, "modal-todo.png") });
    await p.locator(`#${first} .gb-dlg-x`).click();
    await settle(p, 600);
    if (await openId(p)) fail("閉じるボタンで閉じない");
    if ((await hashOf(p)) !== "") fail(`閉じたのに URL にハッシュが残る（${await hashOf(p)}）`);
    const y1 = await p.evaluate(() => window.scrollY);
    if (Math.abs(y1 - y0) > 4) fail(`閉じたあと元の位置に戻らない（${y0} → ${y1}）`);
    const focused = await p.evaluate((id) => document.activeElement?.getAttribute("href") === `#${id}`, first);
    if (!focused) fail("閉じたあと、押した札にフォーカスが戻らない");

    // ---- 3. Esc
    await card.click();
    await settle(p);
    await p.keyboard.press("Escape");
    await settle(p, 600);
    if (await openId(p)) fail("Esc で閉じない");
    if ((await hashOf(p)) !== "") fail("Esc で閉じたのに URL にハッシュが残る");

    // ---- 4. 背景を押す（狭い画面の窓は下から立ち上がる1枚なので、いちばん上の帯が背景）
    await card.click();
    await settle(p);
    await p.mouse.click(195, 8);
    await settle(p, 600);
    if (await openId(p)) fail("背景を押しても閉じない");

    // ---- 5. ブラウザの戻る
    await card.click();
    await settle(p);
    await p.goBack();
    await settle(p, 600);
    if (await openId(p)) fail("戻るで閉じない");
    if (!p.url().includes(PAGE)) fail(`戻ると面から出てしまう（${p.url()}）`);

    // ---- 6. 窓から窓へ（戻る1回で面に戻る）
    await card.click();
    await settle(p);
    const inner = p.locator(`#${first} a[href^="#see-"]`).first();
    if (await inner.count()) {
      const to = (await inner.getAttribute("href")).slice(1);
      await inner.click();
      await settle(p);
      if ((await openId(p)) !== to) fail(`窓の中の札で ${to} に入れ替わらない`);
      await p.locator(`#${to}`).screenshot({ path: join(OUT, "modal-see.png") });
      await p.goBack();
      await settle(p, 600);
      if (await openId(p)) fail("窓から窓へ入れ替えたあと、戻る1回で面に戻らない");
    } else {
      notes.push(`${first} の窓に見たいものへの札が無い（窓から窓へは見ていない）`);
    }

    // ---- 7. 食べたいものの窓を撮る
    /* 面の上の札だけ（やりたいことの窓の中にも食べたいものへの札がある。閉じた窓の中の札は押せない） */
    const eat = p.locator('main a.gb-tile[href^="#eat-"]').first();
    if (await eat.count()) {
      await eat.scrollIntoViewIfNeeded();
      await eat.click();
      await settle(p, 600);
      const eid = await openId(p);
      if (eid) await p.locator(`#${eid}`).screenshot({ path: join(OUT, "modal-eat.png") });
      await p.keyboard.press("Escape");
      await settle(p);
    }
    const guide = p.locator('main a[href^="#guide-"]').first();
    if (await guide.count()) {
      await guide.scrollIntoViewIfNeeded();
      await guide.click();
      await settle(p, 600);
      const gid = await openId(p);
      if (gid) await p.locator(`#${gid}`).screenshot({ path: join(OUT, "modal-guide.png") });
      await p.keyboard.press("Escape");
      await settle(p);
    }
    if (errors.length) fail(`JS の例外: ${errors.slice(0, 3).join(" / ")}`);
    await ctx.close();

    // ---- 8. ハッシュで直に開く（新しい窓で）
    const ctx2 = await ctxOf(b, 390);
    const p2 = await ctx2.newPage();
    const last = todoIds[todoIds.length - 1];
    await p2.goto(url(SPORT, PAGE, `#${last}`), { waitUntil: "domcontentloaded" });
    await settle(p2, 1500);
    if ((await openId(p2)) !== last) fail(`#${last} で直に着いても、その窓が開かない（開いているのは ${await openId(p2)}）`);
    const inside = await p2.evaluate((id) => !!document.activeElement?.closest(`#${id}`), last);
    if (!inside) fail("直に開いた窓に、フォーカスが入っていない");
    await p2.keyboard.press("Escape");
    await settle(p2, 600);
    if (await openId(p2)) fail("直に開いた窓が Esc で閉じない");
    const near = await p2.evaluate((id) => {
      const a = document.querySelector(`main a[href="#${id}"]`);
      const r = a?.getBoundingClientRect();
      return r ? r.bottom > 0 && r.top < window.innerHeight : false;
    }, last);
    if (!near) fail("直に開いた窓を閉じても、その札の所に着かない");
    await ctx2.close();

    // ---- 9. 1440px の横あふれ
    const ctx3 = await ctxOf(b, 1440);
    const p3 = await ctx3.newPage();
    await p3.goto(url(SPORT, PAGE), { waitUntil: "domcontentloaded" });
    await settle(p3, 800);
    const over3 = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over3 > 0) fail(`1440px で横あふれ ${over3}px`);
    await p3.evaluate(async () => {
      document.querySelector(".gb-amap")?.scrollIntoView();
      await new Promise((r) => setTimeout(r, 300));
    });
    await pinCheck(p3, 1440);
    await spotCheck(p3, 1440);
    await p3.locator(".gb-amap").screenshot({ path: join(OUT, "areamap-1440.png") });
    await p3.locator(`main a[href="#${first}"]`).first().click();
    await settle(p3, 600);
    await p3.locator(`#${first}`).screenshot({ path: join(OUT, "modal-todo-1440.png") });
    await ctx3.close();

    // ---- 10. 字の量を、前の面と比べる
    let base = null;
    if (process.env.BASE_PORT && process.env.BASE_PAGE) {
      const ctx4 = await ctxOf(b, 390);
      const p4 = await ctx4.newPage();
      const r = await p4.goto(url(process.env.BASE_PORT, process.env.BASE_PAGE), { waitUntil: "domcontentloaded" }).catch(() => null);
      if (r?.ok()) {
        await settle(p4, 800);
        base = await p4.evaluate(() => ({
          chars: document.querySelector("main").innerText.replace(/\s/g, "").length,
          height: document.documentElement.scrollHeight,
        }));
      } else notes.push(`前の面（${process.env.BASE_PAGE}）が開けない`);
      await ctx4.close();
    }
    console.log(`面 ${PAGE}（390px）: 最初に見える字 ${chars}字・高さ ${height}px${base ? `／前の面 ${process.env.BASE_PAGE}: ${base.chars}字・${base.height}px（${Math.round((chars / base.chars) * 100)}%）` : ""}`);
    if (base && chars >= base.chars) fail(`最初に見える字が前の面より減っていない（${base.chars} → ${chars}）`);
  } finally {
    await b.close();
  }
  for (const n of notes) console.log(`  — ${n}`);
  console.log(`  — 借りた写真: 本物で返した ${wmHit}・落とせなかった ${wmMiss}`);
  console.log(`  — 撮った絵: ${OUT}`);
  if (bad.length) {
    for (const x of bad) console.log(`  ✗ ${x}`);
    return 1;
  }
  console.log("  ✓ 並び・横あふれ・窓（HTML に在る・直に開く・閉じる4通り・元の位置・窓から窓へ）・エリアの札の重なり・見どころマップ（重なり・はみ出し・当たり 44px・押した先）");
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
