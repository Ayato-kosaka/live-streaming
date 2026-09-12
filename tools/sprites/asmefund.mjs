/**
 * 机（`/me/desk`）を「スパチャ」の札から開くための差し込み口（`SEED=`）。
 *
 * 机は前に開いていた道具を覚えているので、素の `asme.mjs` で開くと
 * 「写真」が出る。**測りたい道具を出さないまま測ると、0件と同じ絵になる。**
 *
 *   PORT=4170 W=390 SEL=".mp-sc-more, .mp-tab" PAGES=/me/desk.html \
 *     SEED=$PWD/tools/sprites/asmefund.mjs node tools/sprites/hitbox.mjs
 *   PORT=4170 W=390 DPR=3 TAG=fund PAGES=/me/desk.html \
 *     SEED=$PWD/tools/sprites/asmefund.mjs node tools/sprites/inkpx.mjs
 *   python3 tools/sprites/inkpx.py fund _me_desk
 */
import { apply as base } from "./asme.mjs";

export async function apply(ctx, opts = {}) {
  await base(ctx, { admin: true, ...opts });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-desk-tool", "fund");
      /* 端末が覚えている「あやとか」の答え。無いと口が返るまで札が出ない */
      localStorage.setItem(
        "ayato-island-owner",
        JSON.stringify({ uid: "fakeuid0001", admin: true }),
      );
    } catch {}
  });
}
