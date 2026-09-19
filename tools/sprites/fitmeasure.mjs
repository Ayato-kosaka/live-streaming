/**
 * `charFit`（`site/content/characterBox.ts`）の**前提が守られているか**を
 * 数えるための、測りかた1式。**面ごとの道具はここを import する。**
 *
 *   図鑑（`/friends`）   … `tools/sprites/dexfit.mjs`
 *   台所（`/kitchen/*`） … `tools/sprites/kdfit.mjs`
 *
 * （`charfit.mjs` は別物。あちらは看板・島・図鑑の絵を**撮って**見る古い道具で、
 * `/tmp/avatars/box.json` を読む。ここは焼いた `BOX` も撮った絵も使わない）
 *
 * ## なぜ1か所に寄せるか
 *
 * `charFit` は「器は正方形」という前提を持っている。前提が外れたときに
 * 鳴るものが無かったので、図鑑（#167）と台所（#169）で**同じ形の外し方が
 * 2回出た。** 数える側を面ごとに書き写すと、**片方だけ直った測りかた**が
 * できあがる（`docs/island-misses.md` #160 がその形）。
 *
 * 測りかたそのものは面に依らない——器の箱・描かれた画素・はみ出しの px。
 * 面ごとに違うのは「どれが器か（セレクタ）」「何枚あるはずか（分母）」
 * 「対照をどう作るか」の3つだけなので、そこだけ呼ぶ側に残す。
 *
 * ## 判定の足を1本ずつ抜けるようにしてある
 *
 * `judge(BREAK)` に文字列を渡すと、足を抜いた測りかたが返る。
 * 抜くたびに対照が落ちることを見て、はじめて「この足は何かを見ている」と言える
 * （`docs/island-standards.md` 15）。
 *
 *   ink    描かれた画素ではなく `<img>` の箱で測る
 *   cell   器の矩形ではなく画面ぜんぶと比べる
 *   square 器の形を見ない
 */
import { readFileSync } from "fs";
import { repoPath } from "./repo.mjs";

/* ───────── 焼き直しで消えないか（ブラウザの前に、字で） ───────── */

/** 2つのファイルから `charFit` の本文だけを切り出す */
function cutFit(src) {
  const i = src.indexOf("export function charFit(");
  if (i < 0) return null;
  const j = src.indexOf("\n}", i);
  return j < 0 ? null : src.slice(i, j + 2);
}

/**
 * `charFit` は `tools/sprites/charbox.py` が `characterBox.ts` ごと焼き直す。
 * 雛形が古いままだと、**次に焼いた晩に黙って元へ戻る。赤くならない。**
 * だからブラウザを立てる前に、2つの `charFit` が1文字まで同じかを見る。
 *
 * @returns 通ったら知らせの1行、駄目なら理由（呼ぶ側が 2 で落ちる）
 */
export function bakedSame() {
  const ts = cutFit(readFileSync(repoPath("site/content/characterBox.ts"), "utf8"));
  const py = cutFit(readFileSync(repoPath("tools/sprites/charbox.py"), "utf8"));
  if (!ts || !py) return { ok: false, why: "charFit が見つかりません（characterBox.ts / charbox.py）" };
  if (ts !== py) {
    return {
      ok: false,
      why:
        "charbox.py の雛形が characterBox.ts と違います。" +
        "次に焼き直した晩に、直したものが黙って元へ戻ります",
    };
  }
  return { ok: true, note: "charFit は characterBox.ts と charbox.py で同じ" };
}

/* ───────── 測りかた（ページの中で動く） ───────── */

/**
 * 器1つぶんの寸法を DOM から取る。引数はセレクタ（器の側）。
 *
 * `getComputedStyle` の width / height は**変形をかける前**の使われた値なので、
 * これが `charFit` の言う「器」。`getBoundingClientRect` は変形の後。
 * 2つの比が、その器に掛かっている倍率。
 *
 * **器そのものが `<img>` のこともある**（台所の `.kd-folks > li` は
 * 中の絵と同じ大きさ）。自分が `<img>` ならそれを使う。
 */
export const MEASURE = (sel) => {
  const out = [];
  for (const [i, c] of [...document.querySelectorAll(sel)].entries()) {
    const im = c.tagName === "IMG" ? c : c.querySelector("img");
    if (!im) continue;
    const cs = getComputedStyle(im);
    const rc = c.getBoundingClientRect();
    const ri = im.getBoundingClientRect();
    const W = parseFloat(cs.width);
    const H = parseFloat(cs.height);
    const pos = cs.objectPosition.split(" ").map((v) => parseFloat(v) / 100);
    out.push({
      n: i + 1,
      src: im.currentSrc || im.src,
      probe: c.dataset.probe || "",
      cell: { x: rc.x, y: rc.y, w: rc.width, h: rc.height },
      img: { x: ri.x, y: ri.y, w: ri.width, h: ri.height },
      boxW: W, boxH: H,
      fit: cs.objectFit,
      px: Number.isFinite(pos[0]) ? pos[0] : 0.5,
      py: Number.isFinite(pos[1]) ? pos[1] : 0.5,
      nat: [im.naturalWidth, im.naturalHeight],
      blend: cs.mixBlendMode,
      done: im.complete && im.naturalWidth > 0,
    });
  }
  return out;
};

/**
 * 絵の中で、**描かれている画素**の外接矩形（元の絵に対する割合）。
 * 透過があれば alpha、無ければ四隅の色との差で見る。
 *
 * 焼いた表（`BOX`）を読むと、透過を持たない絵で「枠いっぱい」という
 * 嘘の答えが返る。**その1人こそ見たい相手**なので、画素から取る。
 */
export const INK = (url) => new Promise((res) => {
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onerror = () => res(null);
  im.onload = () => {
    const w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) return res(null);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, w, h).data; } catch { return res(null); }
    let clear = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { clear = true; break; }
    const at = (x, y) => (y * w + x) * 4;
    const c0 = at(0, 0);
    const bg = [d[c0], d[c0 + 1], d[c0 + 2]];
    const ink = (i) => clear
      ? d[i + 3] > 8
      : Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > 12;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ink(at(x, y))) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) return res(null);
    res({ clear, ar: w / h, box: [x0 / w, y0 / h, (x1 + 1 - x0) / w, (y1 + 1 - y0) / h] });
  };
  im.src = url;
});

/**
 * 判定3つ。`BREAK` に足の名前を入れると、その足を抜いた判定が返る。
 *
 * @param {string} BREAK `""` / `"ink"` / `"cell"` / `"square"`
 */
export function judge(BREAK = "") {
  /** 描かれた画素が、画面のどこに来るか。`m` は MEASURE の1行、`ink` は INK の答え */
  function drawn(m, ink) {
    const s = m.boxW > 0 ? m.img.w / m.boxW : 1;
    const ar = ink && !BREAK.includes("ink") ? ink.ar : m.nat[0] / m.nat[1];
    // object-fit: contain は器の短いほうに合わせる
    const cw = m.fit === "contain" ? Math.min(m.boxW, m.boxH * ar) : m.boxW;
    const ch = m.fit === "contain" ? cw / ar : m.boxH;
    const cx = m.img.x + s * (m.boxW - cw) * m.px;
    const cy = m.img.y + s * (m.boxH - ch) * m.py;
    const [bx, by, bw, bh] = BREAK.includes("ink") ? [0, 0, 1, 1] : ink.box;
    return {
      L: cx + bx * s * cw,
      T: cy + by * s * ch,
      w: bw * s * cw,
      h: bh * s * ch,
    };
  }

  /** その器が正方形からどれだけ離れているか（px）。`charFit` の前提そのもの */
  function flat(m) {
    return BREAK.includes("square") ? 0 : Math.abs(m.boxW - m.boxH);
  }

  /** その絵が、自分の器からどれだけ外へ出ているか（px） */
  function out(m, ink) {
    const d = drawn(m, ink);
    const c = BREAK.includes("cell") ? { x: -1e6, y: -1e6, w: 2e6, h: 2e6 } : m.cell;
    return (
      Math.max(0, c.x - d.L) +
      Math.max(0, d.L + d.w - (c.x + c.w)) +
      Math.max(0, c.y - d.T) +
      Math.max(0, d.T + d.h - (c.y + c.h))
    );
  }

  return { drawn, flat, out };
}
