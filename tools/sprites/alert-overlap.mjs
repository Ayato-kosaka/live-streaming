/**
 * 投げ銭アラート（`app/alertbox`）で、**演出の主役・粒・光がその人のキャラ絵の顔の前を通って
 * いないか**を、画素で数える。
 *
 *   cd tools/sprites
 *   node alert-overlap.mjs --base http://localhost:4335 --chars /path/to/chars \
 *        --theme halloween --amounts 100,300,700,1500,3000,7000,10000 \
 *        --sizes 436x776,664x1180 --texts short:none,short:3,long:1,long:3 \
 *        --out /tmp/overlap --sheet
 *   node alert-overlap.mjs ... --control face    # 対照: 顔の前に手前の層の四角を置く → 1 で落ちる
 *   node alert-overlap.mjs ... --control hero    # 対照: 主役の顔の枠を字の真ん中に置く → 1 で落ちる
 *
 * ## 決まり（オーナー、2026-10-24。厳禁扱い）
 *
 * 演出の粒・光・主役（かぼちゃ坊や・魔法使い・ドラキュラなど）は、滞在中（キャラ絵が出たあと）
 * キャラ絵の顔（中身の外接矩形の上 45%）の前を通さない。登場の数秒（キャラ絵が出る前）は
 * 画面を使ってよい。
 *
 * 字（名前・額・メッセージ）は**キャラ絵の上下中央に重ねる仕様**（同じ日に元の仕様へ戻した）
 * なので、字とキャラ絵の重なりは数えない。字の読みやすさは `alert-ink.mjs` が測る。
 *
 * ## 数えるもの（1コマごと。全部 0 で合格）
 *
 * - `front` … キャラ絵より手前の演出の層（zIndex 2 以上）だけを描いた絵で、顔の矩形に色が乗った画素数
 * - `cover` … 顔の矩形のうち、キャラ絵が不透明な画素で、演出の層を全部消すと色が変わる画素数
 *   （手前の層がキャラ絵を塗っている）。字の矩形の中は数えない（字は2枚のどちらにも描かれていて、
 *   出てくる途中は2枚で数画素ずれることがある。字の前を通る演出は front に出る）
 * - `字`（主役の顔 × 字）… あやと（主役のポーズ絵）の顔の枠（`data-hero-face`。poses.json の face）と、
 *   見えている字の行の矩形が重なった面積（画素）。**登場中も数える**（字が出る瞬間に主役の顔が
 *   字の上端より上にいること。オーナーの決まり: 主役の顔は字で隠さない）
 *
 * キャラ絵の中身の外接矩形は、画面の `data-char="content"` の印（`CharFit` が置く）から読む。
 * 動画は中身を測れないので、`<video>` の枠に contain で収めた矩形を中身とみなす。
 *
 * ## 止めて撮る
 *
 * 1コマを4回撮る（そのまま / 演出の層を消す / キャラ絵だけ / 手前の演出の層だけ）。
 * あいだに動くと差が出るので、撮るあいだは時計を止める: Web Animations を一時停止し、
 * `requestAnimationFrame` と `setTimeout` を預かり、`performance.now` / `Date.now` も止める。
 * 撮り終えたら止めていたぶんを引いて再開する（台本の時刻はずれない）。
 *
 * ## 「何も見ていない緑」を出さない
 *
 * 中身の矩形が無い・キャラ絵の画素が中身の 1 割に満たない・演出のある段で演出の層が無い、
 * 滞在のコマが1つも無い、のどれかなら「測れていない」で 2 で抜ける。
 *
 * 終了コード: 0 = 全部 0 / 1 = 顔に乗った（対照ではこれが正しい） / 2 = 測れなかった
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { chromePath } from "./chrome.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://localhost:4335").replace(/\/$/, "");
const theme = arg("theme", "halloween");
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const sizes = arg("sizes", "436x776,664x1180")
  .split(",")
  .map((s) => s.split("x").map(Number));
const out = resolve(arg("out", "/tmp/alert-overlap"));
const jobs = Math.max(1, Number(arg("jobs", "3")));
const control = arg("control", "");
if (control && control !== "face" && control !== "hero") die(`--control は face か hero（${control}）`);

/* 名前とメッセージ。長い名前は全角 12 字（本物の視聴者さんの名前）。
   3行は本物の配信で届いたメッセージ（いまの字の大きさで 3〜4 行に折り返す） */
const NAMES = { short: "aoi", long: "もっと豆挽けコーヒー商店" };
const MSGS = {
  none: "",
  1: "ハッピーハロウィン！",
  3: "今日はマジ緊急の緊急で疲れてしもたな！パンパンでパンと豆挽こうぜ！！broの食ってる姿見せてくれや！まめまめキューーーン",
};
const texts = arg("texts", "short:none,short:3,long:1,long:3")
  .split(",")
  .map((t) => {
    const [n, m] = t.split(":");
    if (!(n in NAMES) || !(m in MSGS)) die(`--texts は 名前(short|long):メッセージ(none|1|3)（${t}）`);
    return { key: `${n}-${m}`, name: NAMES[n], msg: MSGS[m] };
  });

/* キャラ絵。置き場（png を全部）か、絵の並び（カンマ区切り） */
function listChars(spec) {
  const files = [];
  for (const p of spec.split(",")) {
    const r = resolve(p);
    if (!existsSync(r)) die(`キャラ絵が無い: ${r}`);
    if (statSync(r).isDirectory()) {
      for (const f of readdirSync(r).sort()) if (/\.(png|webp|jpe?g)$/i.test(f)) files.push(join(r, f));
    } else files.push(r);
  }
  if (!files.length) die("キャラ絵が1枚も無い（--chars）");
  return files;
}
const chars = listChars(arg("chars", "../../site/public/goods/ayato-walk.png")).map((f) => ({
  id: basename(f, extname(f)),
  file: f,
  type: f.toLowerCase().endsWith(".png") ? "image/png" : f.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg",
}));
/* 動画の人（`--video 絵の名前=動画.webm`）。試し表示の名簿に「その名前の人は動画を持つ」として渡す */
const videos = new Map(
  String(arg("video", ""))
    .split(",")
    .filter(Boolean)
    .map((s) => {
      const [id, f] = s.split("=");
      if (!existsSync(resolve(f))) die(`動画が無い: ${f}`);
      return [id, resolve(f)];
    })
);

/* 滞在中のコマ（キャラ絵が出てからの秒）。台本のある段（段7）は、キャラ絵が出る 6.5 秒＋
   ふくらむ 0.85 秒までが登場で、終わりの 4 秒が締め。締めもキャラ絵は出ているので数える */
const alertSec = (a) => 30 + (a >= 10000 ? 30 : a >= 1000 ? 15 : 0);
/* 台本のある段（themes.ts）。段1 はちびおばけ・段2 は札を吊るすこうもり・段3 は行進
   （段1〜3 はキャラ絵が最初から出ている）、段4 は魔法使い、段5 は死神、段6 はゾンビ、段7 はドラキュラ */
const SHOWS = {
  halloween: [
    [0, 200, "ghost"],
    [200, 500, "broom"],
    [500, 1000, "march"],
    [1000, 2000, "wizard"],
    [2000, 5000, "reaper"],
    [5000, 10000, "zombie"],
    [10000, Infinity, "dracula"],
  ],
};
const showOf = (a) => (SHOWS[theme] ?? []).find(([lo, hi]) => a >= lo && a < hi)?.[2] ?? null;
const showTier = (a) => !!showOf(a);
/* 滞在のあいだを 1.5 秒おきに撮る。小芸は 5〜8 秒おきにでたらめな順で出るので、まばらに撮ると
   1つも写らない（行進を 6 秒の1コマだけで見ていたときがそれ） */
const every = (from, to, step = 1.5) => {
  const out = [];
  for (let t = from; t < to; t += step) out.push(+t.toFixed(2));
  return out;
};
function framesFor(a) {
  const given = arg("frames", "");
  if (given) return given.split(",").map(Number);
  const d = alertSec(a);
  // ドラキュラ: キャラ絵は 6.5 秒から 0.85 秒でふくらむ。滞在、締めはマントで包んでこうもりの群れに
  if (showOf(a) === "dracula") return [1, 2, 3, ...every(3.6, 7.4, 0.3), ...every(7.5, d - 4), d - 3.4, d - 2.6, d - 1.6];
  // 魔法使い: キャラ絵は 4.3 秒から 0.85 秒でふくらむ。そこから滞在、締めは右上へ飛び去るところ
  // 登場中（字を書く・ドン・退く）も、主役の顔 × 字を数えるために細かく撮る
  if (showOf(a) === "wizard") return [0.6, 1.2, 1.8, ...every(2.2, 5.3, 0.25), 5.3, ...every(6, d - 3), d - 2.6, d - 2.0, d - 1.4, d - 0.8];
  // 行進: キャラ絵は最初から出ているので、行進の途中も数える。締めは右へ去るところ
  if (showOf(a) === "march") return [0.4, 0.9, 1.4, 1.8, 2.1, 2.4, ...every(3, d - 3), d - 2.6, d - 1.8, d - 1.0];
  // ちびおばけ: ランタンが降りる・ふたが鳴る・「ばあ！」・字が出る・落ち着く。締めはランタンに戻る
  if (showOf(a) === "ghost") return [0.3, 0.6, 0.8, 1.0, 1.3, ...every(1.6, d - 2.8), d - 2.4, d - 1.8, d - 1.2, d - 0.6];
  // こうもり: 札を吊るして右上から来る・3匹目がとまる。締めは札ごと左上へ
  if (showOf(a) === "broom") return [0.4, 0.8, 1.2, 1.5, 1.9, ...every(2.2, d - 2.8), d - 2.4, d - 1.8, d - 1.2, d - 0.6];
  // 死神: キャラ絵は 4.97 秒から 0.85 秒でふくらむ。滞在（左上の角で鬼火が回る・小芸）と、締めの霧に消えるところ
  if (showOf(a) === "reaper") return [0.6, 1.2, ...every(1.6, 5.9, 0.25), 5.9, ...every(7, d - 3), d - 2.8, d - 2.2, d - 1.6, d - 0.8];
  // ゾンビ: キャラ絵は 6.36 秒から。滞在（右上の角でゆらゆら・決めポーズ・潜る）と、締めの墓へ戻るところ
  if (showOf(a) === "zombie") return [0.6, 1.4, 2.2, ...every(2.8, 7.3, 0.25), 7.3, ...every(8, d - 3), d - 2.8, d - 2.2, d - 1.6, d - 0.8];
  // 札がぽんっと出て膨らみきった瞬間（0.8 秒から 0.45 秒の 65%）・収まったところ・出たあと
  return [1.09, 1.4, 4.5];
}

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

/* 時計を止める仕掛け。アラートの面が読み込まれる前に差し込む */
const FREEZE = `(() => {
  const W = window;
  const pNow = performance.now.bind(performance);
  const dNow = Date.now.bind(Date);
  let frozen = false, frozenAt = 0, shift = 0;
  const off = () => (frozen ? pNow() - frozenAt : shift);
  performance.now = () => pNow() - off();
  Date.now = () => dNow() - off();
  const vnow = () => pNow() - off();

  const nRAF = W.requestAnimationFrame.bind(W), nCAF = W.cancelAnimationFrame.bind(W);
  let rid = 0; const rmap = new Map(); let heldR = [];
  W.requestAnimationFrame = (cb) => {
    const id = ++rid;
    const run = (t) => {
      if (frozen) { heldR.push(id); return; }
      rmap.delete(id);
      cb(t - off());
    };
    rmap.set(id, { run, nid: nRAF(run) });
    return id;
  };
  W.cancelAnimationFrame = (id) => { const e = rmap.get(id); if (e) { nCAF(e.nid); rmap.delete(id); } };

  const nST = W.setTimeout.bind(W), nCT = W.clearTimeout.bind(W);
  let tid = 5e8; const tmap = new Map();
  W.setTimeout = (cb, ms, ...args) => {
    if (typeof cb !== "function") return nST(cb, ms, ...args);
    const id = ++tid;
    const due = vnow() + Math.max(0, Number(ms) || 0);
    const run = () => {
      const e = tmap.get(id);
      if (!e) return;
      if (frozen) { e.held = true; return; }
      tmap.delete(id);
      cb(...args);
    };
    tmap.set(id, { run, due, nid: nST(run, Math.max(0, Number(ms) || 0)), held: false });
    return id;
  };
  W.clearTimeout = (id) => { const e = tmap.get(id); if (e) { nCT(e.nid); tmap.delete(id); } else nCT(id); };

  let paused = [], pausedMedia = [];
  W.__ovl = {
    t0: null,
    freeze() {
      if (frozen) return;
      frozenAt = pNow() - shift;
      frozen = true;
      paused = document.getAnimations().filter((a) => a.playState === "running");
      paused.forEach((a) => a.pause());
      pausedMedia = [...document.querySelectorAll("video")].filter((v) => !v.paused);
      pausedMedia.forEach((v) => v.pause());
    },
    unfreeze() {
      if (!frozen) return;
      shift = pNow() - frozenAt;
      frozen = false;
      /* 止めたときに終わりぎわにいたアニメは、play() で頭から巻き戻る（終わりにいるアニメの play() は
         0 へ戻す決まり）。1字ずつ弾む字が、次のコマで遅れ(delay)の頭に戻って消えた（「100円」が
         「10 円」に写った）。終わりにいるものは finish() で終わらせる */
      paused.forEach((a) => {
        try {
          const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
          if (Number.isFinite(end) && Number(a.currentTime) >= Number(end) - 1) a.finish();
          else a.play();
        } catch {}
      });
      pausedMedia.forEach((v) => v.play().catch(() => {}));
      const r = heldR; heldR = [];
      r.forEach((id) => { const e = rmap.get(id); if (e) e.nid = nRAF(e.run); });
      // 預かっていた setTimeout は、止めていたぶん後ろへずらして掛け直す
      for (const e of tmap.values()) { nCT(e.nid); e.held = false; e.nid = nST(e.run, Math.max(0, e.due - vnow())); }
    },
  };
  // キャラ絵の箱が置かれた時刻（止めた時計で）。滞在中のコマはここから数える
  new MutationObserver((_, mo) => {
    if (W.__ovl.t0 == null && document.querySelector('[data-char="box"]')) { W.__ovl.t0 = performance.now(); mo.disconnect(); }
  }).observe(document, { childList: true, subtree: true });
})();`;

/* 撮る前に、見せるものだけを残す。`only` に当てたものとその中身・その祖先だけを残し、
   ほかは visibility で消す（並び方は変えない）。祖先の地・枠も消す */
const CSS_ONLY = `html{background:transparent!important}
[data-ovl="hide"],[data-ovl="hide"] *{visibility:hidden!important}
[data-ovl="anc"]{background:transparent!important;box-shadow:none!important;border-color:transparent!important;outline:none!important}`;
const CSS_NOSHOW = `[data-show],[data-show] *{visibility:hidden!important}`;

async function setMode(page, mode) {
  await page.evaluate(
    ({ mode, CSS_ONLY, CSS_NOSHOW }) => {
      document.querySelectorAll("[data-ovl]").forEach((e) => e.removeAttribute("data-ovl"));
      let st = document.getElementById("__ovl_css");
      if (!st) {
        st = document.createElement("style");
        st.id = "__ovl_css";
        document.head.appendChild(st);
      }
      st.textContent = "";
      if (mode === "all") return;
      if (mode === "noshow") {
        st.textContent = CSS_NOSHOW;
        return;
      }
      let keep = [];
      if (mode === "char") keep = [...document.querySelectorAll('[data-char="box"]')];
      if (mode === "plate") keep = [...document.querySelectorAll('[data-plate="slot"]')];
      if (mode === "front") {
        keep = [...document.querySelectorAll("[data-show]")].filter((e) => {
          const z = Number(getComputedStyle(e).zIndex);
          return Number.isFinite(z) && z >= 2;
        });
      }
      const inKeep = (el) => keep.some((k) => k.contains(el));
      const anc = new Set();
      for (const k of keep) for (let p = k.parentElement; p; p = p.parentElement) anc.add(p);
      for (const el of document.body.querySelectorAll("*")) {
        if (el.id === "__ovl_css" || inKeep(el)) continue;
        el.setAttribute("data-ovl", anc.has(el) ? "anc" : "hide");
      }
      document.body.setAttribute("data-ovl", "anc");
      st.textContent = CSS_ONLY;
    },
    { mode, CSS_ONLY, CSS_NOSHOW }
  );
}

/* 札の矩形・中身の矩形を読む（止めた状態で） */
async function readRects(page) {
  return page.evaluate(() => {
    const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    const union = (a, b) => (a ? { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) } : b);
    const slot = document.querySelector('[data-plate="slot"]');
    let plate = null;
    // 祖先の overflow で切られている部分は描かれない（回る数字の列は 1 桁ぶんの窓から覗いている）
    // from から上へ、overflow で切る祖先の矩形を重ねる（要素なら親から、字ならその字を持つ要素から）
    const clipOf = (from) => {
      let c = null;
      for (let p = from; p && p !== slot.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const r = R(p.getBoundingClientRect());
          c = c ? { l: Math.max(c.l, r.l), t: Math.max(c.t, r.t), r: Math.min(c.r, r.r), b: Math.min(c.b, r.b) } : r;
        }
      }
      return c;
    };
    const clipped = (r, c) => (c ? { l: Math.max(r.l, c.l), t: Math.max(r.t, c.t), r: Math.min(r.r, c.r), b: Math.min(r.b, c.b) } : r);
    if (slot) {
      for (const el of slot.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const c = clipOf(el.parentElement);
        for (const r0 of el.getClientRects()) {
          const r = clipped(R(r0), c);
          if (r.r - r.l > 0 && r.b - r.t > 0) plate = union(plate, r);
        }
      }
      // 字の行（要素の箱より字がはみ出すとき）。回る数字の列のように窓で切られた字は、窓の中だけ
      const range = document.createRange();
      const walk = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const pe = n.parentElement;
        if (!pe || !n.textContent.trim()) continue;
        const cs = getComputedStyle(pe);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        range.selectNodeContents(n);
        const c = clipOf(pe);
        for (const r0 of range.getClientRects()) {
          const r = clipped(R(r0), c);
          if (r.r - r.l > 0 && r.b - r.t > 0) plate = union(plate, r);
        }
      }
    }
    const box = document.querySelector('[data-char="box"]');
    let content = null;
    let kind = "none";
    const mark = box?.querySelector('[data-char="content"]');
    const video = box?.querySelector("video");
    if (video && getComputedStyle(video).opacity !== "0" && video.videoWidth > 0) {
      /* 動画は枠に contain・真ん中（index.tsx の objectPosition 50% 50%）。中身はその矩形。
         上寄せのつもりで測っていたころは、横長の動画で顔の矩形が枠の上へはみ出し、帯の中の
         ランタンやこうもりを「顔に乗った」と数えていた */
      const r = video.getBoundingClientRect();
      const s = Math.min(r.width / video.videoWidth, r.height / video.videoHeight);
      const w = video.videoWidth * s;
      const h = video.videoHeight * s;
      content = { l: r.left + (r.width - w) / 2, t: r.top + (r.height - h) / 2, r: r.left + (r.width + w) / 2, b: r.top + (r.height + h) / 2 };
      kind = "video";
    } else if (mark) {
      content = R(mark.getBoundingClientRect());
      kind = "image";
    }
    const boxOpacity = box ? Number(getComputedStyle(box).opacity) : 0;
    const boxTransform = box ? getComputedStyle(box).transform : "none";
    const showLayers = document.querySelectorAll('[data-show="layer"]').length;
    /* 見えている度合い（祖先の opacity の積）。出る前の字（opacity 0 で待っている）や、
       消えていく途中の主役を数えないため */
    const seen = (el) => {
      let o = 1;
      for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden") return 0;
        o *= Number(cs.opacity);
      }
      return o;
    };
    /* 主役の顔の枠（振付けが置く印 `data-hero-face`。ポーズ絵と一緒に出し入れされる） */
    const heroes = [];
    for (const el of document.querySelectorAll("[data-hero-face]")) {
      if (seen(el) < 0.05) continue;
      const r = R(el.getBoundingClientRect());
      if (r.r - r.l > 0 && r.b - r.t > 0) heroes.push(r);
    }
    /* 見えている字の矩形（字の行ごと。opacity 0 で待っている字は入れない） */
    const texts = [];
    if (slot) {
      const range2 = document.createRange();
      const walk2 = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
      for (let n = walk2.nextNode(); n; n = walk2.nextNode()) {
        const pe = n.parentElement;
        if (!pe || !n.textContent.trim() || seen(pe) < 0.05) continue;
        range2.selectNodeContents(n);
        const c = clipOf(pe);
        for (const r0 of range2.getClientRects()) {
          const r = clipped(R(r0), c);
          if (r.r - r.l > 0 && r.b - r.t > 0) texts.push(r);
        }
      }
    }
    return { plate, content, kind, boxOpacity, boxTransform, showLayers, slotH: slot?.offsetHeight ?? 0, heroes, texts };
  });
}

const shot = async (page) => PNG.sync.read(await page.screenshot({ omitBackground: true, animations: "allow" }));

/* 矩形を画素の格子へ外向きに丸める（重なりを甘く数えない） */
const grid = (r, w, h) =>
  r && {
    l: Math.max(0, Math.floor(r.l)),
    t: Math.max(0, Math.floor(r.t)),
    r: Math.min(w, Math.ceil(r.r)),
    b: Math.min(h, Math.ceil(r.b)),
  };
const area = (r) => (r ? Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t) : 0);
const inter = (a, b) => (a && b ? { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) } : null);

function count(img, rect, test) {
  let n = 0;
  if (!rect) return 0;
  for (let y = rect.t; y < rect.b; y++)
    for (let x = rect.l; x < rect.r; x++) {
      const i = (y * img.width + x) * 4;
      if (test(i)) n++;
    }
  return n;
}

async function measureFrame(page, W, H, wantShow) {
  const rects = await readRects(page);
  const plate = grid(rects.plate, W, H);
  const content = grid(rects.content, W, H);
  const face = content && { l: content.l, t: content.t, r: content.r, b: content.t + Math.ceil((content.b - content.t) * 0.45) };
  await setMode(page, "all");
  let A = await shot(page);
  await setMode(page, "noshow");
  const B = await shot(page);
  await setMode(page, "char");
  const C = await shot(page);
  await setMode(page, "front");
  const E = await shot(page);
  await setMode(page, "all");

  /* 乗った画素を覚えておく（残す絵に印を付けて、どこに何が乗ったかを目で追えるように） */
  const hits = [];
  const front = count(E, face, (i) => {
    const on = E.data[i + 3] > 16;
    if (on) hits.push(i);
    return on;
  });
  /* 字の矩形の中は cover に数えない。字は演出の層ではなく、2枚（全部・演出なし）のどちらにも描かれて
     いるのに、出てくる途中の字は2枚で数画素ずれることがある（同じコマを撮り直すと 0 に戻る。
     2026-10-24、段1 の「円」で 19 画素）。字の前を演出が通れば、手前の層なので front に出る */
  const inPlate = (i) => {
    if (!plate) return false;
    const x = (i / 4) % A.width;
    const y = Math.floor(i / 4 / A.width);
    return x >= plate.l && x < plate.r && y >= plate.t && y < plate.b;
  };
  const cover = count(A, face, (i) => {
    if (C.data[i + 3] < 250 || inPlate(i)) return false;
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > 24) hits.push(i);
    return d > 24;
  });
  if (hits.length) {
    // 乗った画素を桃色にし、まわりを 12px の枠で囲む（数画素でも見つかるように）
    const M = new PNG({ width: A.width, height: A.height });
    A.data.copy(M.data);
    const put = (x, y) => {
      if (x < 0 || y < 0 || x >= M.width || y >= M.height) return;
      const j = (y * M.width + x) * 4;
      M.data[j] = 255;
      M.data[j + 1] = 0;
      M.data[j + 2] = 200;
      M.data[j + 3] = 255;
    };
    for (const i of hits.slice(0, 2000)) {
      const x = (i / 4) % M.width;
      const y = Math.floor(i / 4 / M.width);
      put(x, y);
      for (let k = -12; k <= 12; k++) {
        put(x + k, y - 12);
        put(x + k, y + 12);
        put(x - 12, y + k);
        put(x + 12, y + k);
      }
    }
    A = M;
  }
  /* 主役の顔 × 字（オーナーの決まり: 主役の顔は字で隠さない）。登場中も数える。
     字の行の矩形と顔の枠の重なりの面積（画素） */
  let heroText = 0;
  for (const h of rects.heroes) for (const t of rects.texts) {
    const w = Math.min(h.r, t.r) - Math.max(h.l, t.l);
    const hh = Math.min(h.b, t.b) - Math.max(h.t, t.t);
    if (w > 0 && hh > 0) heroText += Math.round(w * hh);
  }
  // 測れているか（何も見ていない緑を出さない）
  const charPx = count(C, content, (i) => C.data[i + 3] > 16);
  const why = [];
  /* 登場（キャラ絵がまだ出きっていない）のコマは数えるが、合否には入れない。
     キャラ絵がふくらみ終わったら滞在 */
  const entrance = !(rects.boxOpacity >= 0.99 && (rects.boxTransform === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(rects.boxTransform)));
  if (entrance) {
    // 何も言わない（合否に入れない）
  } else if (!content || area(content) === 0) why.push("中身の矩形が無い");
  else if (charPx < area(content) * 0.1) why.push(`キャラ絵の画素が少ない(${charPx}/${area(content)})`);
  if (wantShow && rects.showLayers === 0) why.push("演出の層が無い");
  return {
    front,
    cover,
    heroText,
    heroes: rects.heroes.length,
    plate,
    content,
    face,
    kind: rects.kind,
    charOpacity: rects.boxOpacity,
    charTransform: rects.boxTransform,
    charShare: content ? +((area(content) / (W * H)) * 100).toFixed(1) : 0,
    invalid: why,
    entrance,
    A,
  };
}

/* 対照: わざと重ねる */
async function applyControl(page, kind) {
  await page.evaluate((kind) => {
    const mark = document.querySelector('[data-char="content"]') || document.querySelector('[data-char="box"] video');
    const c = mark.getBoundingClientRect();
    if (kind === "hero") {
      // 主役の顔の枠を、字のブロックの真ん中に置く（字が主役の顔に乗った形）
      const box = document.querySelector('[data-plate="box"]').getBoundingClientRect();
      const d = document.createElement("div");
      d.setAttribute("data-hero-face", "");
      Object.assign(d.style, {
        position: "fixed",
        left: `${box.left + box.width / 2 - 30}px`,
        top: `${box.top + box.height / 2 - 30}px`,
        width: "60px",
        height: "60px",
        pointerEvents: "none",
      });
      document.body.appendChild(d);
    }
    if (kind === "face") {
      const host = document.querySelector('[data-plate="slot"]').parentElement;
      const d = document.createElement("div");
      d.setAttribute("data-show", "control");
      Object.assign(d.style, {
        position: "absolute",
        left: `${c.left + c.width / 2 - 20}px`,
        top: `${c.top + c.height * 0.2}px`,
        width: "40px",
        height: "40px",
        background: "#ff00aa",
        zIndex: "5",
      });
      host.appendChild(d);
    }
  }, kind);
}

function pngFile(img, path) {
  writeFileSync(path, PNG.sync.write(img));
}

async function runOne(browser, job) {
  const { ch, amount, size, text } = job;
  const [W, H] = size;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(FREEZE);
  const charBody = readFileSync(ch.file);
  const vfile = videos.get(ch.id);
  const external = [];
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    /* キャラ絵。本番の置き場（Firebase Storage）と同じく、よそからでも画素を読ませる
       （CharFit が中身を測る）。CDN の既定の絵の口に、選んだ絵を差す */
    if (url.includes("cloudfront.net")) {
      return route.fulfill({ contentType: ch.type, body: charBody, headers: { "access-control-allow-origin": "*" } });
    }
    if (url.startsWith(`${base}/__ovl__/video`)) {
      return route.fulfill({ contentType: "video/webm", body: readFileSync(vfile), headers: { "accept-ranges": "none" } });
    }
    if (url.startsWith(base) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    external.push(url);
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const q = new URLSearchParams({ preview: "1", theme, amount: String(amount), name: text.name, msg: text.msg });
  if (vfile) q.set("video", `${base}/__ovl__/video.webm`);
  const res = { char: ch.id, amount, size: `${W}x${H}`, text: text.key, frames: [], errors, video: !!vfile };
  try {
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__ovl && window.__ovl.t0 != null, null, { timeout: 20000, polling: 50 });
    let controlled = false;
    for (const s of framesFor(amount)) {
      await page.waitForFunction((s) => performance.now() - window.__ovl.t0 >= s * 1000, s, { timeout: (s + 30) * 1000, polling: 30 });
      await page.evaluate(() => window.__ovl.freeze());
      if (control && !controlled) {
        await applyControl(page, control);
        controlled = true;
      }
      const m = await measureFrame(page, W, H, showTier(amount));
      await page.evaluate(() => window.__ovl.unfreeze());
      const { A, ...rest } = m;
      rest.t = s;
      rest.png = null;
      res.frames.push(rest);
      rest._A = A;
    }
    if (!res.frames.some((f) => !f.entrance)) res.fatal = "滞在のコマが1つも無い（キャラ絵が出ていない）";
  } catch (e) {
    res.fatal = String(e).slice(0, 300);
  }
  if (external.length) res.external = [...new Set(external)];
  await ctx.close();
  return res;
}

/* front・cover は滞在中だけ（登場中はキャラ絵がまだ出ていない）。主役の顔 × 字は登場中も数える */
function bad(f) {
  return (f.entrance ? 0 : f.front + f.cover) + (f.heroText ?? 0);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const queue = [];
  for (const ch of chars) for (const amount of amounts) for (const size of sizes) for (const text of texts) queue.push({ ch, amount, size, text });
  // 長いもの（台本のある段）から先に回す（最後に1本だけ長いのが残らないように）
  queue.sort((a, b) => alertSec(b.amount) - alertSec(a.amount));
  console.log(`${queue.length} 本（キャラ ${chars.length} × 段 ${amounts.length} × 大きさ ${sizes.length} × 字 ${texts.length}）を ${jobs} 本ずつ`);
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
  const results = [];
  let done = 0;
  const t0 = Date.now();
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const r = await runOne(browser, job);
      // 絵を残す: 重なりのあったコマと、一覧に使う代表のコマ（滞在のまんなか）
      const pickAt = { dracula: 15, march: 6, wizard: 9, ghost: 4.6, broom: 5.2, reaper: 10, zombie: 11 }[showOf(r.amount)] ?? null;
      const pick = r.frames.find((f) => f.t === pickAt) ?? r.frames.at(-1) ?? null;
      for (const f of r.frames) {
        if (f === pick || bad(f) > 0) {
          const p = join(out, "frames", `${r.char}_${r.amount}_${r.size}_${r.text}_t${String(f.t).replace(".", "_")}.png`);
          mkdirSync(join(out, "frames"), { recursive: true });
          pngFile(f._A, p);
          f.png = p;
        }
        delete f._A;
      }
      r.pick = pick ? pick.t : null;
      results.push(r);
      done++;
      const worst = r.frames.reduce((m, f) => Math.max(m, bad(f)), 0);
      const inval = r.fatal ? `測れない: ${r.fatal}` : r.frames.some((f) => f.invalid.length) ? `測れない: ${[...new Set(r.frames.flatMap((f) => f.invalid))].join("・")}` : "";
      console.log(
        `[${done}] ${r.char} ${r.amount}円 ${r.size} ${r.text}${r.video ? " 動画" : ""}  ` +
          (inval || (worst ? `顔に乗った ${r.frames.map((f) => `${f.t}s:${f.front}/${f.cover}${f.heroText ? `/字${f.heroText}` : ""}`).join(" ")}` : "0")) +
          `  (${((Date.now() - t0) / 1000).toFixed(0)}s)`
      );
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  await browser.close();

  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 1));
  const all = results.flatMap((r) => r.frames);
  const frames = all.filter((f) => !f.entrance);
  const ent = all.filter((f) => f.entrance);
  if (ent.length) {
    const s = (k) => ent.reduce((a, f) => a + f[k], 0);
    console.log(`登場中のコマ ${ent.length}（合否に入れない）: front ${s("front")} / cover ${s("cover")}`);
  }
  const invalid = results.filter((r) => r.fatal || r.frames.some((f) => f.invalid.length) || r.frames.length === 0);
  const sum = (k) => frames.reduce((s, f) => s + f[k], 0);
  const hit = results.filter((r) => r.frames.some((f) => bad(f) > 0));
  console.log(`\n滞在中のコマ ${frames.length}（${results.length} 本）`);
  console.log(`  手前の演出が顔に乗った(front) ${sum("front")} / 演出が顔の画素を塗った(cover) ${sum("cover")}`);
  const heroAll = all.reduce((s, f) => s + (f.heroText ?? 0), 0);
  const heroSeen = all.filter((f) => f.heroes > 0).length;
  console.log(`  主役の顔に字が乗った(登場中も) ${heroAll}（主役の顔が見えていたコマ ${heroSeen} / ${all.length}）`);
  const shares = results.map((r) => ({ r, s: r.frames.at(-1)?.charShare ?? 0 }));
  if (shares.length) {
    const lo = shares.reduce((a, b) => (b.s < a.s ? b : a));
    console.log(`  キャラ絵の中身が面に占める割合: いちばん小さい ${lo.s}%（${lo.r.char} ${lo.r.amount}円 ${lo.r.size} ${lo.r.text}）`);
  }
  if (hit.length) {
    console.log(`重なりのあった組 ${hit.length}:`);
    for (const r of hit.slice(0, 40)) console.log(`  ${r.char} ${r.amount}円 ${r.size} ${r.text}`);
  }
  if (invalid.length) {
    console.log(`測れなかった組 ${invalid.length}:`);
    for (const r of invalid.slice(0, 20)) console.log(`  ${r.char} ${r.amount}円 ${r.size} ${r.text}: ${r.fatal ?? [...new Set(r.frames.flatMap((f) => f.invalid))].join("・")}`);
  }
  const errs = [...new Set(results.flatMap((r) => r.errors))];
  if (errs.length) console.log("JS の例外:", errs.slice(0, 5));

  if (flag("sheet")) await sheet(results);
  if (invalid.length) process.exit(2);
  process.exit(hit.length ? 1 : 0);
}

/* 一覧の絵: 行 = キャラ、列 = 段（大きさ・字ごとに1枚ずつ）。字のブロック（水色）・中身の矩形（桃）・
   顔の矩形（黄）を重ねて描き、数を下に添える */
async function sheet(results) {
  const groups = new Map();
  for (const r of results) {
    const k = `${r.size}_${r.text}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  for (const [k, rs] of groups) {
    const ids = [...new Set(rs.map((r) => r.char))];
    const ams = [...new Set(rs.map((r) => r.amount))].sort((a, b) => a - b);
    const [W, H] = rs[0].size.split("x").map(Number);
    const cw = 150;
    const s = cw / W;
    const ch = Math.round(H * s);
    const cell = (r) => {
      if (!r) return `<td></td>`;
      const f = r.frames.find((x) => x.t === r.pick) ?? r.frames[0];
      if (!f || !f.png) return `<td class="x">${r.fatal ? "測れない" : "—"}</td>`;
      const box = (q, c) =>
        q ? `<i style="left:${q.l * s}px;top:${q.t * s}px;width:${(q.r - q.l) * s}px;height:${(q.b - q.t) * s}px;border-color:${c}"></i>` : "";
      const worst = r.frames.reduce((m, x) => m + bad(x), 0);
      return `<td><div class="c" style="width:${cw}px;height:${ch}px"><img src="file://${f.png}">${box(f.plate, "#00e5ff")}${box(
        f.content,
        "#ff4fd8"
      )}${box(f.face, "#ffe600")}</div><b class="${worst ? "ng" : "ok"}">${worst ? `重なり ${worst}` : "0"} ・ ${f.charShare}%</b></td>`;
    };
    const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:12px;background:#1d1d24;color:#eee;font:12px/1.4 "IPAPGothic","Noto Sans CJK JP",sans-serif}
h1{font-size:15px;margin:0 0 8px}table{border-collapse:collapse}td,th{padding:4px;vertical-align:top;text-align:center}
th{font-weight:600}.c{position:relative;overflow:hidden;background:repeating-conic-gradient(#3a3a46 0 25%,#2c2c36 0 50%) 0 0/16px 16px}
.c img{position:absolute;left:0;top:0;width:100%;height:100%}.c i{position:absolute;border:1.5px solid;box-sizing:border-box}
b{display:block;font-weight:600}.ok{color:#7fffa0}.ng{color:#ff6b6b}.x{color:#aaa}
</style><h1>${k.replace("_", "・")}（滞在中のコマ。水色=字のブロック / 桃=キャラ絵の中身 / 黄=顔(上45%)。数は全コマで顔に乗った画素の合計・中身が面に占める割合）</h1>
<table><tr><th></th>${ams.map((a) => `<th>${a.toLocaleString()}円</th>`).join("")}</tr>
${ids
  .map((id) => `<tr><th>${id}</th>${ams.map((a) => cell(rs.find((r) => r.char === id && r.amount === a))).join("")}</tr>`)
  .join("\n")}</table>`;
    const hp = join(out, `sheet-${k}.html`);
    writeFileSync(hp, html);
    const pg = await browser.newPage({ viewport: { width: 200 + ams.length * (cw + 8), height: 400 } });
    await pg.goto(`file://${hp}`);
    await pg.waitForLoadState("load");
    const p = join(out, `sheet-${k}.png`);
    await pg.screenshot({ path: p, fullPage: true });
    await pg.close();
    console.log("一覧", p);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
