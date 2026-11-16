/**
 * **ガイドブック型の街の面（`components/guidebook/`）を、書き出したもので確かめる。**（#1228）
 *
 *   tools/build.sh 3130
 *   python3 -m http.server 4130 --directory site/.next-3130 &
 *   DIST=site/.next-3130 SPORT=4130 node tools/sprites/guidebook.mjs                 # ソフィア
 *   DIST=… SPORT=… PAGE=/travel/north-macedonia/skopje node tools/sprites/guidebook.mjs
 *   …  BASE_PORT=4131 BASE_PAGE=/bulgaria node tools/sprites/guidebook.mjs       # 字の量を前の面と比べる
 *   …  BREAK=pins node tools/sprites/guidebook.mjs     # 対照: エリアの札をずらす前の位置へ戻す（ずらした札のある街で落ちる。ソフィアは矢印と重なる）
 *   …  BREAK=arrow node tools/sprites/guidebook.mjs    # 対照: 地図の外の矢印を絵の外へ出す（はみ出して落ちる。地図の外のある街で）
 *   …  BREAK=flat node tools/sprites/guidebook.mjs     # 対照: やりたいことの札を全部同じ大きさにする（1枚目が大きくない・大小が混ざらないで落ちる）
 *   …  BREAK=mymap node tools/sprites/guidebook.mjs    # 対照: 見たいもののマイマップを節の終わりへ動かす（札より上にないで落ちる）
 *   …  BREAK=bignum node tools/sprites/guidebook.mjs   # 対照: どんな街に大きな数の札を1枚差し込む（大きな数の札があるで落ちる）
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
 * | 節の名前と絵 | 「見たいもの」「食べたいもの」「買いたいもの」。やりたいこと＝チェック（`checklist`）・見たいもの＝カメラ（`camera`）（あやと 2026-11-16） |
 * | やりたいこと | 390 と 1440 で、**1枚目が幅いっぱいで画面の高さの 45% 以上**・残りの札の大きさが2通り以上（単調でない）・行の端に穴が無い・札の字が70字まで・絵が描けている（絵の無い札は色の地）（#1228「やりたいこと8選がダサい」） |
 * | どんな街 | 問いと答え（「歴史は？」）が2組以上・問いが「？」で終わる・答えに出どころの行。**大きな数の札（前の `gb-about-num`）と「よく言われること」が無い** |
 * | エリアの札 | 描いたエリア地図の上の名前の札が、**390 と 1440 で互いに重ならず、絵の外にはみ出さない**（ソフィアの「中心・セルディカ」と「ネフスキー大聖堂まわり」が 390px で重なった。2026-11-15） |
 * | どんな街の地図 | 地区の札・地図の外の矢印が、390 と 1440 で**どの2つも重ならず**、絵の外にはみ出さない。当たり 44px 以上（`hitbox.mjs`）。押すと窓が開く（窓の無い矢印は Google マップ）。**写真のピン・番号の一覧が無い**（概要だけ。詳しい場所はマイマップ）。地区のひとことが地区の数だけ在り、行き先の窓が在る。「詳しい場所は」の案内の先（`#see-mymap`）が在る |
 * | 見たいもののマイマップ | マイマップのある街で、`#see-mymap` が見たいものの最初の札より上 |
 * | 写真 | 書き出した HTML に Wikimedia から直に読む絵が0本 |
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
 * **どんな街の地図**（`components/guidebook/SpotMap.tsx`。#1228）。概要だけ——地区の札と地図の外の矢印。
 *
 * - 札と矢印が重ならない（札どうしは `pinCheck` が見る）・矢印が絵の外にはみ出さない（絵は `overflow: hidden`）
 * - **写真のピンと番号の一覧が無い**（あやと 2026-11-16「見どころマップがダサい。マイマップと用途が違う」。
 *   前の形に戻ったら、ここで落ちる）
 * - 地区のひとことが地区（エリアの窓）の数だけ在る
 *
 * 対照: `BREAK=arrow` で、矢印を絵の外（右へ絵の幅ぶん）へ出す。地図の外のある街なら、ここで落ちること
 */
async function mapCheck(p, width) {
  if (process.env.BREAK === "arrow")
    await p.evaluate(() => document.querySelectorAll(".gb-amap-out").forEach((e) => (e.style.left = "110%")));
  const r = await p.evaluate(() => {
    const art = document.querySelector(".gb-amap-art")?.getBoundingClientRect();
    const box = (sel, kind) => [...document.querySelectorAll(sel)].map((e) => ({ t: e.textContent.trim(), kind, b: e.getBoundingClientRect() }));
    const tags = box(".gb-amap-pin", "札");
    const arrows = box(".gb-amap-out", "矢印");
    const over = [];
    for (const a of arrows) {
      for (const q of [...tags, ...arrows])
        if (q !== a && a.b.left < q.b.right && q.b.left < a.b.right && a.b.top < q.b.bottom && q.b.top < a.b.bottom) over.push(`矢印「${a.t}」と${q.kind}「${q.t}」`);
    }
    const out = art
      ? arrows.filter((q) => q.b.left < art.left - 0.5 || q.b.right > art.right + 0.5 || q.b.top < art.top - 0.5 || q.b.bottom > art.bottom + 0.5).map((q) => q.t)
      : [];
    return {
      art: !!art,
      tags: tags.length,
      arrows: arrows.length,
      over: [...new Set(over)],
      out,
      /* 前の形の名残り（写真のピン・引き出し線・番号の一覧） */
      old: document.querySelectorAll(".gb-amap-spot, .gb-amap-lines, .gb-amap-n, .gb-maplg").length,
      lg: document.querySelectorAll(".gb-amap-lg a").length,
      areas: document.querySelectorAll("dialog.gb-dlg[id^='area-']").length,
    };
  });
  if (r.old) fail(`${width}px でどんな街の地図に、写真のピン・番号の一覧が ${r.old} 個ある（概要だけにする。詳しい場所はマイマップ）`);
  if (!r.art) return notes.push(`${width}px: どんな街の地図の絵が無い（色の札の地図。重なりは見ていない）`);
  notes.push(`${width}px: 地区の札 ${r.tags}・地図の外の矢印 ${r.arrows}・地区のひとこと ${r.lg}`);
  if (r.over.length) fail(`${width}px でどんな街の地図の重なり: ${r.over.slice(0, 6).join("／")}`);
  if (r.out.length) fail(`${width}px で矢印が絵の外にはみ出す: ${r.out.join("／")}`);
  if (r.lg !== r.areas) fail(`${width}px で地区のひとこと（${r.lg}）が地区の数（${r.areas}）と合わない`);
}

/** 札と矢印の当たり（44px 以上）と、押した先。ひとことと「詳しい場所は」の行き先。390px で1回だけ */
async function mapPress(p) {
  const { rows, skipped } = await measure(p, { sel: ".gb-amap-pin, .gb-amap-out", min: 44 });
  const small = rows.filter((x) => x.small).map((x) => `${x.t || x.href}（${fmtHit(x)}）`);
  if (skipped.length) fail(`地図の札の真ん中が押せない: ${skipped.map((x) => `${x.t}（${x.why}）`).join("／")}`);
  if (small.length) fail(`当たりが 44px に届かない地図の札: ${small.join("／")}`);
  if (rows.length) notes.push(`地図の札の当たり: いちばん小さい ${Math.min(...rows.map((x) => Math.min(...x.hit)))}px（${rows.length}枚）`);
  /* 押す。窓が開いて、その窓の id が押した札の行き先と同じ */
  const hrefs = await p.$$eval(".gb-amap-pin, .gb-amap-out", (es) => es.map((e) => ({ href: e.getAttribute("href"), cls: e.className, target: e.getAttribute("target") })));
  for (const [i, h] of hrefs.entries()) {
    if (!h.href.startsWith("#")) {
      if (!/^https:\/\/www\.google\.com\/maps\/search\/\?/.test(h.href) || h.target !== "_blank") fail(`地図の外の矢印の行き先が Google マップの検索ではない（${h.href}）`);
      continue;
    }
    const el = p.locator(".gb-amap-pin, .gb-amap-out").nth(i);
    const what = h.cls.includes("out") ? "矢印" : "地区の札";
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
  const lost = await p.$$eval(".gb-amap-lg a, .gb-amap-more a", (es) =>
    es.map((e) => e.getAttribute("href").slice(1)).filter((id) => !document.getElementById(id)),
  );
  if (lost.length) fail(`どんな街の地図のひとこと・案内の行き先が無い: ${lost.join(" ")}`);
}

/**
 * **やりたいこと**（`components/guidebook/Todo.tsx`。あやと 2026-11-16「写真とテキストの均等な並びで単調」）。
 *
 * - 1枚目が幅いっぱい（並びの幅の 95% 以上）で、画面の高さの 45% 以上
 * - 残りの札の大きさ（幅と高さ）が2通り以上（大小が混ざっている）
 * - 行の右の端に穴が無い（どの行も、いちばん右の札が並びの右の端まで届く）
 * - 札の字が70字まで（行き方・お金・コツは窓の中）・どの札にも題
 * - 絵が描けている（絵の無い札は色の地 `is-nopic`）
 *
 * 対照: `BREAK=flat` で、札を全部同じ大きさにする。ここで落ちること
 */
async function todoCheck(p, width) {
  if (process.env.BREAK === "flat")
    await p.addStyleTag({
      content:
        ".gb-todo{grid-template-columns:repeat(2,1fr)!important;grid-auto-rows:auto!important}.gb-todo>li{grid-column:auto!important;grid-row:auto!important}.gb-todo-card{aspect-ratio:1/1!important;height:auto!important}",
    });
  await p.locator(".gb-todo").scrollIntoViewIfNeeded();
  await settle(p, 400);
  const r = await p.evaluate(() => {
    const ol = document.querySelector(".gb-todo");
    if (!ol) return null;
    const L = ol.getBoundingClientRect();
    const cards = [...ol.querySelectorAll(":scope > li > .gb-todo-card")].map((a) => {
      const b = a.getBoundingClientRect();
      const img = a.querySelector("img");
      return {
        w: b.width,
        h: b.height,
        top: Math.round(b.top),
        right: b.right,
        chars: a.innerText.replace(/\s/g, "").length,
        title: a.querySelector(".gb-todo-t")?.textContent.trim() ?? "",
        drawn: a.classList.contains("is-nopic") || (!!img && img.complete && img.naturalWidth > 0),
        id: a.getAttribute("href"),
      };
    });
    return { L: { w: L.width, right: L.right }, vh: window.innerHeight, cards };
  });
  if (!r || !r.cards.length) return fail(`${width}px でやりたいことの札が無い`);
  const [hero, ...rest] = r.cards;
  if (hero.w < r.L.w * 0.95 || hero.h < r.vh * 0.45)
    fail(`${width}px でやりたいことの1枚目が大きくない（${Math.round(hero.w)}x${Math.round(hero.h)}px。並びの幅 ${Math.round(r.L.w)}px・画面の高さ ${r.vh}px）`);
  const sizes = new Set(rest.map((c) => `${Math.round(c.w / 8)}x${Math.round(c.h / 8)}`));
  if (rest.length >= 2 && sizes.size < 2) fail(`${width}px でやりたいことの札が全部同じ大きさ（単調。${[...sizes].join("・")}）`);
  const rows = new Map();
  for (const c of r.cards) rows.set(c.top, Math.max(rows.get(c.top) ?? 0, c.right));
  const holes = [...rows.entries()].filter(([, right]) => right < r.L.right - 2).map(([top]) => top);
  if (holes.length) fail(`${width}px でやりたいことの行の端に穴がある（${holes.length}行）`);
  const wordy = r.cards.filter((c) => c.chars > 70).map((c) => `${c.title}（${c.chars}字）`);
  if (wordy.length) fail(`${width}px でやりたいことの札の字が多い: ${wordy.join("／")}`);
  const untitled = r.cards.filter((c) => !c.title).map((c) => c.id);
  if (untitled.length) fail(`${width}px で題の無いやりたいことの札: ${untitled.join(" ")}`);
  const blank = r.cards.filter((c) => !c.drawn).map((c) => c.title);
  if (blank.length) fail(`${width}px でやりたいことの絵が描けていない: ${blank.join("／")}`);
  notes.push(
    `${width}px: やりたいこと ${r.cards.length}枚（1枚目 ${Math.round(hero.w)}x${Math.round(hero.h)}px・大きさ ${sizes.size}通り・札の字 最大${Math.max(...r.cards.map((c) => c.chars))}字）`,
  );
}

/**
 * **どんな街の問いと答え・節の名前と絵・見たいもののマイマップの位置**。390px で1回。
 *
 * 対照: `BREAK=bignum` で前の大きな数の札を1枚差し込む／`BREAK=mymap` でマイマップを節の終わりへ動かす
 */
async function shapeCheck(p) {
  if (process.env.BREAK === "bignum")
    await p.evaluate(() => {
      const a = document.createElement("a");
      a.className = "gb-about-card";
      a.innerHTML = '<span class="gb-about-num"><b>49</b><i>の温泉</i></span>';
      document.querySelector("#about .gb-qa")?.append(a);
    });
  if (process.env.BREAK === "mymap")
    await p.evaluate(() => {
      const m = document.getElementById("see-mymap");
      if (m) m.parentElement.insertBefore(m, m.parentElement.querySelector(".gb-up"));
    });
  const r = await p.evaluate(() => {
    const qa = [...document.querySelectorAll("#about .gb-qa-one")].map((e) => ({
      q: e.querySelector(".gb-qa-q")?.textContent.trim() ?? "",
      a: e.querySelector(".gb-qa-a")?.textContent.trim() ?? "",
      src: !!e.querySelector(".gb-src a"),
    }));
    const h2 = (id) => document.getElementById(`${id}-h`)?.textContent.trim() ?? "";
    const icon = (id) => document.querySelector(`#${id} .gb-sec-head`)?.getAttribute("data-icon") ?? "";
    const map = document.getElementById("see-mymap");
    const tile = document.querySelector("#see .gb-tile");
    return {
      qa,
      big: document.querySelectorAll("#about .gb-about-num, #about .gb-about-card").length,
      more: (document.getElementById("about")?.innerText ?? "").includes("よく言われること"),
      heads: { todo: h2("todo"), see: h2("see"), eat: h2("eat"), buy: h2("buy") },
      icons: { todo: icon("todo"), see: icon("see") },
      hasMap: !!map,
      mapFirst: !!map && !!tile && !!(map.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING),
      mapInSee: !!map && !!map.closest("#see"),
    };
  });
  if (r.qa.length < 2) fail(`どんな街の問いと答えが ${r.qa.length}組（2組以上）`);
  for (const x of r.qa) {
    if (!x.q.endsWith("？")) fail(`どんな街の問いが「？」で終わっていない（${x.q}）`);
    if (!x.a) fail(`どんな街の問い「${x.q}」に答えが無い`);
    if (!x.src) fail(`どんな街の問い「${x.q}」の答えに出どころの行が無い`);
  }
  if (r.big) fail(`どんな街に大きな数の札が ${r.big}枚ある（問いと答えにする。あやと「AI 臭い」）`);
  if (r.more) fail("どんな街に「よく言われること」が残っている（中身はやりたいことへ）");
  const want = { see: "見たいもの", eat: "食べたいもの", buy: "買いたいもの" };
  for (const [k, v] of Object.entries(want)) if (r.heads[k] !== v) fail(`節の名前が「${r.heads[k]}」（「${v}」にする）`);
  if (!/^やりたいこと\d+選$/.test(r.heads.todo)) fail(`やりたいことの節の名前が「${r.heads.todo}」`);
  if (r.icons.todo !== "checklist") fail(`やりたいことの節の絵が ${r.icons.todo}（チェック＝checklist）`);
  if (r.icons.see !== "camera") fail(`見たいものの節の絵が ${r.icons.see}（カメラ＝camera）`);
  if (r.hasMap && !r.mapInSee) fail("見たいもののマイマップ（#see-mymap）が見たいものの節の外にある");
  if (r.hasMap && !r.mapFirst) fail("見たいもののマイマップ（#see-mymap）が、見たいものの札より上にない");
  notes.push(`どんな街: 問いと答え ${r.qa.length}組（${r.qa.map((x) => x.q).join("・")}）・見たいもののマイマップ ${r.hasMap ? "札より上" : "無し"}`);
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
    await shapeCheck(p);
    await pinCheck(p, 390);
    await mapCheck(p, 390);
    await todoCheck(p, 390);
    await p.evaluate(() => window.scrollTo(0, 0));
    await settle(p, 300);
    for (const id of order) {
      const el = await p.$(`[data-gb="${id}"]`);
      if (el) await el.screenshot({ path: join(OUT, `${String(ORDER.indexOf(id) + 1).padStart(2, "0")}-${id}.png`) });
    }
    await p.locator(".gb-amap").screenshot({ path: join(OUT, "areamap-390.png") });
    await p.locator(".gb-todo > li:first-child").screenshot({ path: join(OUT, "todo-hero-390.png") });
    await mapPress(p);

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
    await mapCheck(p3, 1440);
    await p3.locator(".gb-amap").screenshot({ path: join(OUT, "areamap-1440.png") });
    await todoCheck(p3, 1440);
    await p3.locator("[data-gb='todo']").screenshot({ path: join(OUT, "todo-1440.png") });
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
  console.log("  ✓ 並び・横あふれ・窓（HTML に在る・直に開く・閉じる4通り・元の位置・窓から窓へ）・節の名前と絵・やりたいこと（大きな1枚目・大小・穴・字の量）・どんな街（問いと答え・大きな数なし）・地図（重なり・はみ出し・当たり 44px・押した先・ピンなし）");
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
