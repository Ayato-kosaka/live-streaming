/**
 * 書き出した面を一通り歩いて、**出す前に落とす。**
 *
 *   tools/build.sh 4410
 *   python3 -m http.server 4321 --directory site/.next-4410 &
 *   DIST=site/.next-4410 SPORT=4321 node tools/sprites/crawl.mjs
 *
 *   BREAK=oldimg node tools/sprites/crawl.mjs   # わざと盲点を戻す（対照が落ちる）
 *   ONLY=/kitchen/karaage.html   面を絞る（リンクの行き先は**島ぜんぶ**と突き合わせる）
 *   LIST=1                       見た絵の URL と、要求されなかった <img> を並べる
 *
 * 131面で4分半。**`| tail` を挟まない**（終了コードが消える）。
 *
 * 見るもの: **絵の生死**・h1・JS の例外・横あふれ・島の中のリンク切れ。
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い（対照が落ちた・面が0枚・
 * 開けなかった面がある）。**`bad: 0` を目で読んで合格と言わずに、終了コードで判定する。**
 *
 * ## 絵を見るようになった経緯
 *
 * 2026-09-17 まで、この道具は**絵の生死を一度も見ていなかった**（`naturalWidth` も
 * `complete` も出てこない）。そのうえ console の `Failed to load resource` を
 * **名指しで捨てていた。** 落ちた絵が出す音はそれなので、**主役の絵が焼かれて
 * いない面が `bad: 0` を素通りする**（`docs/island-misses.md` #122）。
 * `bad: 0` は「絵が出ている」の証拠ではなく、**絵を見ていない**という意味だった。
 *
 * ## 「見た」と「見ていない」を分ける
 *
 * この箱からは出られない宛先がある（`CLAUDE.md`「このサンドボックスから
 * 出られない先」）。そこは差し替えているので**常に 200 で返る。**
 * 生死を見ても意味がないので、**判定しない。「見ていない」として数を出す。**
 * 混ぜると「落ちた絵 0件」が、**見ていないから0件**と区別できなくなる
 * （`docs/island-standards.md` §15）。差し替える先（`STUB`）と、判定しない先は
 * **同じ1本の正規表現**にしてある。片方だけ増やせない。
 *
 * ## 何を「絵」と呼ぶか
 *
 * `<img>` の `src` と **`srcset` の候補ぜんぶ**、`<source srcset>`、SVG の
 * `<image>`、`<video poster>`、`<link rel=icon>` と `rel=preload as=image`、
 * CSS の `background-image` / `mask-image` / `border-image-source` /
 * `content:url()`（`::before` `::after` も）。
 *
 * **`srcset` の候補を1つずつ見るのが要。** #122 は「1x は在るが 2x が無い」で、
 * dpr1 で描かれた絵を見るだけでは出ない（描けているのは 1x のほう）。
 *
 * 生死は**配っているサーバに直に聞く**（node から fetch して先頭バイトを見る）。
 * 描かれたかどうかに頼らないので、**畳みの中の遅れ読み（`loading="lazy"`）を
 * 「落ちた」と誤って数えない。** ブラウザは畳んだままでは一度も要求しないが、
 * 要素は DOM に在るので URL は拾える（`CLAUDE.md`「畳んだ中の絵を数えない」）。
 * 描画のほうも見たいので、畳みは開いていちばん下まで送ってから数える。
 *
 * ## 数える前に対照を通す
 *
 * `tools/sprites/crawlcheck/` に、壊し方を1枚に1つずつ植えた面が置いてある。
 * **本物の面に当てる前にそこを1周して、拾ってほしい8件を拾い、拾ってはいけない
 * 2件を拾わないことを見る。** 1つでも外したら、**数字を1つも出さずに** 2 で落ちる。
 * 「壊していない写しが通ること」も対照に入れてある（§15）。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる。
 *
 *   oldimg   絵を見ない＋`Failed to load resource` を名指しで捨てる（#122 当時の姿）
 *   nosrcset 描かれた絵だけ見て、`srcset` の候補を見ない（#122 の形が出ない）
 *   nofetch  サーバに聞かず、描かれたかどうかだけで決める（畳みの中が見えない）
 *   noh1 / nojs / noover / nolink   その1つを見ない
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { fromRoot, repoPath } from "./repo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 書き出したものを配る静的サーバのポート。並列作業では別々にする。 */
const SPORT = process.env.SPORT || "4321";
const BASE = `http://localhost:${SPORT}`;
/* 根は `repo.mjs` が1か所で決める。ここで `join(HERE,"..","..")` と
   書いていたころは、道具を `tools/` の外へ写すと黙って別の段を根にした（#131）。
   `DIST` は絶対で渡されたらそのまま通る（`fromRoot`）。 */
const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const WIDTH = parseInt(process.env.WIDTH || "390", 10);
/** わざと壊す。何が効いているかを見るためのもの（上の一覧） */
const BREAK = process.env.BREAK || "";
/** 面を絞る（`ONLY=/kitchen/karaage.html`）。直す前と後を突き合わせるときに使う */
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);

/** この箱から出られない宛先。**差し替える先と、生死を判定しない先は同じ。**
 *  1本にまとめてあるので、差し替えだけ増やして判定を忘れる、が起きない。
 *  1人ずつ別の絵を返したいとき（顔が全員同じに写ると見て分からない）は
 *  `tools/sprites/route.mjs` の `offline()` を使う。ここは生死を見ないので潰す */
const STUB = /googleusercontent\.com|ggpht\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com|storage\.googleapis\.com/;
/** 手元の書き出しに口は無い。`/island-api/*` の 404 は本物の欠けではない */
const API = /\/island-api\//;

const skip = {
  img: BREAK === "oldimg",
  srcset: BREAK === "oldimg" || BREAK === "nosrcset",
  fetch: BREAK === "oldimg" || BREAK === "nofetch",
  h1: BREAK === "noh1",
  js: BREAK === "nojs",
  over: BREAK === "noover",
  link: BREAK === "nolink",
};

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

/** リンクと面を同じ綴りに揃える。`/about.html` も `/about/` も `/about` */
const norm = (s) => {
  let x = String(s).split("#")[0].split("?")[0];
  x = x.replace(/\.html$/, "").replace(/\/index$/, "").replace(/\/$/, "");
  return x || "/";
};

/* ── 絵の生死は、配っているサーバに直に聞く ───────────────────────────
   Content-Type には頼らない。`python3 -m http.server` は拡張子で名前を付けるので、
   知らない拡張子だと `application/octet-stream` を返す。**先頭バイトを見る。** */
const MAGIC = [
  ["png", (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["gif", (b) => b.slice(0, 4).toString("latin1") === "GIF8"],
  ["webp", (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP"],
  ["ico", (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0],
  ["avif/heif", (b) => b.slice(4, 8).toString("latin1") === "ftyp"],
  ["svg", (b) => /<svg[\s>]|<\?xml/.test(b.slice(0, 400).toString("utf8"))],
];
/** 一度聞いた URL は覚える。131面ぶんで同じ絵が何度も出てくる */
const asked = new Map();
async function alive(url) {
  if (asked.has(url)) return asked.get(url);
  let got;
  try {
    const r = await fetch(url);
    if (!r.ok) got = { ok: false, why: `HTTP ${r.status}` };
    else {
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) got = { ok: false, why: "0バイト" };
      else if (!MAGIC.some(([, f]) => f(buf))) got = { ok: false, why: "画像として読めない" };
      else got = { ok: true, why: "" };
    }
  } catch (e) {
    got = { ok: false, why: "取りに行けない: " + String(e).slice(0, 60) };
  }
  asked.set(url, got);
  return got;
}

/* ── 面の中から絵の URL を集める（ブラウザの中で走る） ───────────────── */
const COLLECT = (withSrcset) => {
  const urls = [];
  /** 同じ面の中を指している参照（`mask="url(#im-signpost)"` など）。絵ではない */
  let frag = 0;
  const here = location.pathname.replace(/\.html$/, "");
  const put = (raw, where, el) => {
    if (!raw) return;
    const s = String(raw).trim();
    if (!s || /^(data:|blob:|about:)/.test(s)) return;
    let u;
    try {
      u = new URL(s, location.href);
    } catch {
      return;
    }
    if (!/^https?:/.test(u.protocol)) return;
    /* SVG の `mask` は `url(#id)` で**同じ面の中**を指す。ブラウザはそれを
       面の URL に解決して返してくるので（`/about.html#im-globe`）、素直に
       取りに行くと HTML が返ってきて「画像として読めない」になる。131面で
       688本がこれで赤くなった。**面そのものを指す参照は絵ではない。** */
    if (u.hash && u.pathname.replace(/\.html$/, "") === here) {
      frag++;
      return;
    }
    urls.push({ u: u.href, where, at: el });
  };
  const srcset = (v, where, el) => {
    if (!withSrcset) return;
    for (const part of String(v || "").split(",")) put(part.trim().split(/\s+/)[0], where, el);
  };
  const tag = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : "");

  const els = [];
  for (const im of document.querySelectorAll("img")) {
    put(im.getAttribute("src"), "img", tag(im));
    srcset(im.getAttribute("srcset"), "srcset", tag(im));
    els.push({
      src: im.currentSrc || im.src || "",
      complete: im.complete,
      w: im.naturalWidth,
      lazy: im.getAttribute("loading") === "lazy",
      folded: im.dataset.crawlFolded === "1",
      alt: (im.getAttribute("alt") || "").slice(0, 30),
    });
  }
  for (const s of document.querySelectorAll("source")) srcset(s.getAttribute("srcset"), "source", tag(s.parentElement || s));
  for (const g of document.querySelectorAll("image"))
    put(g.getAttribute("href") || g.getAttribute("xlink:href"), "svg", "svg image");
  for (const v of document.querySelectorAll("video[poster]")) put(v.getAttribute("poster"), "poster", tag(v));
  // タブの絵と、先読みさせている絵。落ちても画面には何も出ないので、
  // **目で見ていて気づけない**。ここでしか拾えない
  for (const l of document.querySelectorAll("link[rel~='icon'],link[rel='apple-touch-icon'],link[rel='preload'][as='image']"))
    put(l.getAttribute("href"), "link:" + l.getAttribute("rel"), "head");

  // CSS 側。`::before` `::after` にも絵は置かれる
  const PROPS = ["backgroundImage", "maskImage", "webkitMaskImage", "borderImageSource", "content"];
  const seen = new Set();
  for (const el of document.querySelectorAll("*")) {
    for (const pseudo of [null, "::before", "::after"]) {
      let cs;
      try {
        cs = getComputedStyle(el, pseudo);
      } catch {
        continue;
      }
      for (const prop of PROPS) {
        const v = cs[prop];
        if (!v || v === "none" || v === "normal" || !v.includes("url(")) continue;
        const key = v + "|" + prop;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const m of v.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) put(m[2], "css:" + prop + (pseudo || ""), tag(el) + (pseudo || ""));
      }
    }
  }
  return { urls, els, frag };
};

/* ── 面を1枚見る ──────────────────────────────────────────────────── */
async function visit(p, base, path) {
  const errs = [];
  const res404 = [];
  const onErr = (e) => errs.push({ kind: "JS", t: "JS: " + String(e).slice(0, 200) });
  const onCon = (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    const u = m.location()?.url || "";
    if (API.test(t) || API.test(u) || STUB.test(t) || STUB.test(u)) return;
    // 資源が落ちた音は、絵の側で URL ごとに数える。ここでは控えだけ取る
    if (/Failed to load resource/.test(t)) {
      res404.push({ u, t });
      return;
    }
    errs.push({ kind: "JS", t: "console: " + t.slice(0, 160) });
  };
  p.on("pageerror", onErr);
  p.on("console", onCon);

  let status = 0;
  let why = "";
  for (let i = 0; i < 2; i++) {
    try {
      const r = await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = r ? r.status() : 0;
      break;
    } catch (e) {
      why = String(e).slice(0, 80);
      if (i === 0) await p.waitForTimeout(1200);
    }
  }
  if (status !== 200) {
    p.off("pageerror", onErr);
    p.off("console", onCon);
    return { open: false, why: why || `HTTP ${status}` };
  }
  await p.waitForTimeout(900);

  const info = await p.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
    // `//example.com` は島の中ではなく外。島のリンク切れに混ぜない
    links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")).filter((h) => !h.startsWith("//")),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));

  // 畳みを開いて、いちばん下まで送ってから絵を数える。
  // 畳んだままだと遅れ読みが一度も要求されず、「落ちた」に見える（`CLAUDE.md`）
  const fold = await p.evaluate(() => {
    let n = 0;
    let notReq = 0;
    for (const im of document.querySelectorAll("details:not([open]) img")) {
      n++;
      if (!im.complete) notReq++;
      im.dataset.crawlFolded = "1";
    }
    for (const d of document.querySelectorAll("details")) d.open = true;
    window.scrollTo(0, document.body.scrollHeight);
    return { n, notReq };
  });
  await p.waitForTimeout(700);
  const { urls, els, frag } = await p.evaluate(
    ({ src, withSrcset }) => new Function("withSrcset", "return (" + src + ")(withSrcset)")(withSrcset),
    { src: COLLECT.toString(), withSrcset: !skip.srcset },
  );

  p.off("pageerror", onErr);
  p.off("console", onCon);
  return { open: true, status, info, fold, urls, els, frag, errs, res404 };
}

/** 集めた URL を「見た／見ていない」に仕分けて、見たぶんだけ生死を聞く。 */
async function judge(seen, base) {
  const out = { checked: 0, dead: [], stub: 0, api: 0, out: 0, frag: 0, painted: 0, blank: [], notReq: 0, waiting: [], folded: 0, foldedNotReq: 0 };
  const uniq = new Map();
  for (const s of seen) for (const u of s.urls) if (!uniq.has(u.u)) uniq.set(u.u, { ...u, page: s.page });
  for (const [u, at] of uniq) {
    if (STUB.test(u)) {
      out.stub++;
      continue;
    }
    if (API.test(u)) {
      out.api++;
      continue;
    }
    if (!u.startsWith(base)) {
      out.out++;
      continue;
    }
    // `nofetch` は、描かれたかどうかだけで決める昔ながらのやり方。
    // 畳みの中も `srcset` の 2x も見えないので、対照が落ちる
    if (skip.fetch) continue;
    out.checked++;
    const a = await alive(u);
    if (!a.ok) out.dead.push({ u, why: a.why, where: at.where, at: at.at, page: at.page });
  }
  for (const s of seen) {
    out.frag += s.frag;
    out.folded += s.fold.n;
    out.foldedNotReq += s.fold.notReq;
    for (const e of s.els) {
      if (STUB.test(e.src) || API.test(e.src)) continue;
      if (!e.complete) {
        out.notReq++;
        out.waiting.push({ page: s.page, src: e.src, lazy: e.lazy, folded: e.folded });
        continue;
      }
      if (e.w > 0) out.painted++;
      else out.blank.push({ page: s.page, src: e.src, alt: e.alt, folded: e.folded });
    }
  }
  return out;
}

/** 面1枚ぶんの「見つかったもの」を並べる。絵の落ちは judge のあとで足す */
function findings(v) {
  const f = [];
  if (!skip.h1 && !v.info.h1) f.push({ kind: "h1", t: "h1 が無い" });
  if (!skip.over && v.info.overflow) f.push({ kind: "横あふれ", t: "横にあふれている" });
  if (!skip.js) f.push(...v.errs);
  return f;
}

/* ── 対照が先。落ちたら本物の面の数字は出さない ────────────────────── */
const FIXTURES = [
  ["/ok.html", []],
  ["/deadimg.html", ["絵"]],
  ["/deadsrcset.html", ["絵"]],
  ["/deadbg.html", ["絵"]],
  ["/deadsvg.html", ["絵"]],
  ["/noh1.html", ["h1"]],
  ["/jserr.html", ["JS"]],
  ["/wide.html", ["横あふれ"]],
  ["/deadlink.html", ["リンク切れ"]],
  ["/stub.html", []],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

async function makeCtx() {
  const ctx = await b.newContext({ viewport: { width: WIDTH, height: 844 }, isMobile: true, hasTouch: true });
  // このサンドボックスからは外の絵に出られないので差し替える。**差し替えたものは
  // 常に 200 で返るので、生死を判定しない**（同じ `STUB` で仕分ける）
  await ctx.route(STUB, (r) => r.fulfill({ path: repoPath("site/public/og.png") }));
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  /* 時計を進めて回れるようにしてある。日付で中身の変わる面（島の連なり・表紙・
     配信の時刻の言い方）は、**その日を過ぎた形で見ないと壊れているか分からない**
     （`docs/island-misses.md` #21 #22）。ISO を渡さなければ、いまの時計のまま。 */
  const ISO = process.env.ISO;
  if (ISO)
    await ctx.addInitScript(`(() => {
  const FAKE = ${Date.parse(ISO)};
  const RealDate = Date;
  const start = RealDate.now();
  function shift() { return FAKE + (RealDate.now() - start); }
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
    static now() { return shift(); }
    static parse(...a) { return RealDate.parse(...a); }
    static UTC(...a) { return RealDate.UTC(...a); }
  }
  Object.defineProperty(FakeDate, "name", { value: "Date" });
  globalThis.Date = FakeDate;
})();`);
  return ctx;
}

/** 面をひと組み歩いて、面ごとの「見つかったもの」を返す。対照にも本番にも同じものを当てる */
async function sweep(base, pages, { quiet = false, known = null } = {}) {
  const ctx = await makeCtx();
  const p = await ctx.newPage();
  const seen = [];
  const unseen = [];
  const per = new Map();
  for (const page of pages) {
    const v = await visit(p, base, page);
    if (!v.open) {
      unseen.push(`${page}（${v.why}）`);
      continue;
    }
    seen.push({ page, urls: v.urls.map((u) => ({ ...u, base })), els: v.els, fold: v.fold, frag: v.frag, links: v.info.links });
    per.set(page, { v, f: findings(v) });
  }
  await ctx.close();

  const tally = skip.img
    ? { checked: 0, dead: [], stub: 0, api: 0, out: 0, frag: 0, painted: 0, blank: [], notReq: 0, waiting: [], folded: 0, foldedNotReq: 0 }
    : await judge(seen, base);
  // 絵の落ちは URL ごとに1度だけ聞くので、その URL を載せている面すべてに配り直す
  if (!skip.img) {
    const onPages = new Map();
    for (const s of seen)
      for (const u of s.urls) {
        if (!onPages.has(u.u)) onPages.set(u.u, new Set());
        onPages.get(u.u).add(s.page);
      }
    for (const d of tally.dead)
      for (const page of onPages.get(d.u) || [])
        per.get(page)?.f.push({ kind: "絵", t: `絵が配られていない（${d.why}）: ${d.u.replace(base, "")} ← ${d.where} ${d.at}` });
    for (const bl of tally.blank)
      per.get(bl.page)?.f.push({
        kind: "絵",
        t: `描けていない（naturalWidth 0）: ${bl.src.replace(base, "") || "src が空"}${bl.alt ? " alt=" + bl.alt : ""}`,
      });
  }

  // 島の中のリンク切れ
  // `ONLY=` で面を絞っても、**リンクの行き先は島ぜんぶ**と突き合わせる。
  // 絞った側だけを表にすると、残りが全部「島の中に無い先」になる
  const all = new Set((known || pages).map(norm));
  const broken = [];
  if (!skip.link) {
    for (const s of seen)
      for (const l of new Set(s.links.map(norm)))
        if (!all.has(l)) {
          broken.push({ page: s.page, l });
          per.get(s.page)?.f.push({ kind: "リンク切れ", t: `島の中に無い先: ${l}` });
        }
  }

  if (!quiet)
    for (const page of pages) {
      const e = per.get(page);
      if (!e) continue;
      const f = e.f;
      console.log(
        `${f.length ? "NG" : "ok"} ${page} [${e.v.status}] h1=${e.v.info.h1}` + (f.length ? "\n      " + f.map((x) => x.t).join("\n      ") : ""),
      );
    }
  return { per, tally, unseen, broken, seenPages: seen.length };
}

function fail(msg) {
  console.log(msg);
  return b.close().then(() => process.exit(2));
}

/* 対照。`crawlcheck/` を自前で配る（外のポートに頼らない） */
{
  const dir = join(HERE, "crawlcheck");
  const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".md": "text/plain" };
  const srv = createServer(async (req, res) => {
    const name = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    try {
      const body = await readFile(join(dir, name));
      res.writeHead(200, { "content-type": TYPES[extname(name)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no");
    }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const cbase = `http://127.0.0.1:${srv.address().port}`;
  const got = await sweep(
    cbase,
    FIXTURES.map(([f]) => f),
    { quiet: true },
  );
  console.log("── 対照（わざと壊した面を、拾えるか／拾わずにいられるか）");
  let miss = 0;
  for (const [page, want] of FIXTURES) {
    const e = got.per.get(page);
    const kinds = [...new Set((e?.f || []).map((x) => x.kind))].sort();
    const ok = e && kinds.join(",") === [...want].sort().join(",");
    if (!ok) miss++;
    console.log(
      `  ${ok ? "○" : "×"} ${page.padEnd(18)} 拾ってほしい[${want.join(",") || "なし"}] / 拾った[${kinds.join(",") || "なし"}]` +
        (e ? "" : ` ← 開けなかった`),
    );
  }
  // 「見ていない」を数えているか。ここが0だと、差し替えたものを黙って合格に混ぜている
  if (!skip.img && got.tally.stub < 2) {
    miss++;
    console.log(`  × 差し替えた絵を「見ていない」に数えていない（${got.tally.stub}本。2本のはず）`);
  } else if (!skip.img) {
    console.log(`  ○ 差し替えた絵を「見ていない」に数えた（${got.tally.stub}本）`);
  }
  srv.close();
  console.log(`  対照 ${FIXTURES.length}件中 ${FIXTURES.length - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (got.unseen.length) console.log(`  開けなかった対照: ${got.unseen.join(" , ")}`);
  if (miss) await fail("\n対照が " + miss + "件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）");
}

/* ── 本物の面 ─────────────────────────────────────────────────────── */
const everyPage = walk(DIST).sort();
const pages = everyPage.filter((x) => !ONLY.length || ONLY.includes(x));
if (!pages.length) await fail(`\n${DIST} に面が無い。先に書き出してください（tools/build.sh）。`);

const { per, tally, unseen, broken, seenPages } = await sweep(BASE, pages, { known: everyPage });
await b.close();

const bad = [...per.values()].filter((e) => e.f.length).length;

// **開けなかった面があるなら、数字より先に言う。**「0件」は見ていないから0件かもしれない（§15）
if (unseen.length) {
  console.log(`\n開けなかった面が ${unseen.length} 件あります。**下の数字は当てになりません**:`);
  for (const u of unseen) console.log("  - " + u);
}
console.log(`\n── 数えたもの（幅 ${WIDTH}px）`);
console.log(`  見た面                      ${seenPages} / ${pages.length}`);
if (skip.img) {
  console.log(`  絵                          **見ていない**（BREAK=${BREAK}）`);
} else {
  console.log(`  見た絵（URL・重複を除く）    ${tally.checked}本 — そのうち配られていない ${tally.dead.length}本`);
  console.log(`  差し替えて見ていない絵       ${tally.stub}本（この箱から出られない宛先）`);
  console.log(`  口が要るので見ていない絵     ${tally.api}本（/island-api/*。手元に口は無い）`);
  console.log(`  その他の外の宛先            ${tally.out}本（見ていない）`);
  console.log(`  同じ面の中への参照           ${tally.frag}本（SVG の mask など。絵ではないので数えない）`);
  console.log(`  <img> 要素                  描けた ${tally.painted} / 描けていない ${tally.blank.length} / 要求されなかった ${tally.notReq}`);
  console.log(`  畳みの中にあった絵           ${tally.folded}枚（到着時に未要求 ${tally.foldedNotReq}枚。**畳みを開いてから数えた**）`);
  console.log(`  見ていないもの: <canvas> に描く絵・CSS の未計算の宣言・口ごしの絵の中身`);
  if (process.env.LIST) {
    console.log(`\n  ── 要求されなかった <img>（URL は上で聞いてある。落ちた扱いにはしない）`);
    for (const w of tally.waiting)
      console.log(`    ${w.page} ${w.src.replace(BASE, "")}${w.lazy ? " loading=lazy" : ""}${w.folded ? " 畳みの中" : ""}`);
    console.log(`  ── 生死を聞いた絵 ${tally.checked}本`);
    for (const u of asked.keys()) if (u.startsWith(BASE)) console.log(`    ${u.replace(BASE, "")}`);
  }
}
console.log(`  面の NG                     ${bad} / ${seenPages}`);
console.log(`  島の中のリンク切れ           ${broken.length ? [...new Set(broken.map((x) => x.l))].join(", ") : "none"}`);

if (unseen.length) process.exit(2);
if (!seenPages) {
  console.log("\n面を1枚も見られませんでした。数えるものがありません。");
  process.exit(2);
}
if (bad) {
  console.log(`\nだめ: ${bad}面で見つかりました。`);
  process.exit(1);
}
console.log(`\n${seenPages}面、見つかりませんでした。`);
process.exit(0);
