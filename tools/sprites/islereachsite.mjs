/** **島の押しどころを測る道具の「どこを開くか」を1か所にまとめる。**
 *
 * `islereach*.mjs` は既定で本番（`prod.mjs` の `ORIGIN`）を開く。
 * 直している最中は**手元の書き出し**を同じ道具で見たいので、
 * `ORIGIN=http://127.0.0.1:4290` を渡したら curl の横取りをやめて素通しにする。
 *
 *   ORIGIN=http://127.0.0.1:4290 node tools/sprites/islereach.mjs
 *
 * 手元は `python3 -m http.server` で静的に配るだけなので、`/island/x` のような
 * 拡張子なしの道は 404 になる。**`.html` を足すのはここだけの都合**なので、
 * 呼ぶ側は本番と同じ道（`/island/caucasus`）を渡せばよい。
 */
import { viaCurl, ORIGIN } from "./prod.mjs";

/** 手元の書き出しを見ているか */
export const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(ORIGIN);

export { ORIGIN };

/** 開く先。手元のときだけ `.html` を足す */
export function at(path) {
  if (!LOCAL) return ORIGIN + path;
  const p = path === "/" ? "/index.html" : /\.[a-z]+$/.test(path) ? path : path + ".html";
  return ORIGIN + p;
}

/** 通信の差し替え。手元のときは横取りしない（curl は本番しか通さない） */
export async function net(ctx) {
  if (!LOCAL) await viaCurl(ctx);
}
