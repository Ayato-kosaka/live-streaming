/**
 * 配信で使う2面（`/roulette` `/me/roulette`）を撮るための差し込み口。
 *
 * `asme.mjs` をそのまま呼ぶ。**島の遠隔操作（`/me/remote`）を消した**
 * （2026-10-14）ので、ここで足すものはもう無い。
 * 呼び出し側（`livecheck.mjs` `liveink.mjs` `livecpu.mjs` `rlcpu.mjs`
 * `rlink.mjs`）は5本ともこの名前で呼んでいるので、**入口は残す。**
 * 配信の面に差し込みが要るようになったら、またここに足す。
 *
 *   import { apply } from "./liveseed.mjs";
 *   await apply(ctx);              // 視聴者さんとして
 *   ADMIN=1 ...                    // あやととして（`/me/*` はこれが要る）
 */
import { apply as asme } from "./asme.mjs";

export async function apply(ctx, opts = {}) {
  await asme(ctx, opts);
}
