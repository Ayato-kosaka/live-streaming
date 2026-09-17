/**
 * 「入った人として」かつ「島を止めて」開くための差し込み（`SEED=` に渡す）。
 *
 * `SEED=` は1本しか渡せないので、`asme.mjs`（入っている人の控えを置く）と
 * `freeze.mjs`（rAF を止める）の両方が要る面のために、2つをここで繋ぐ。
 * じぶんのこと（`/me`）を**2枚撮って差を見る**道具（`inkpx.mjs`）は、
 * 入っていないと面の9割が出ないうえ、動くものが混ざると差が嘘になる。
 *
 *   SEED=tools/sprites/frozenme.mjs PAGES=/me node tools/sprites/inkpx.mjs
 */
import { apply as asMe } from "./asme.mjs";
import { apply as freeze } from "./freeze.mjs";

export async function apply(ctx) {
  await asMe(ctx);
  await freeze(ctx);
}
