/**
 * 「Doneru のぶんが止まっている」ほうの島を、測る道具に見せるための差し込み口（#294）。
 *
 *   SEED=/home/user/live-streaming/tools/sprites/asof_seed.mjs \
 *   PORT=4150 PAGES=/nordic TAG=asof node tools/sprites/inkpx.mjs
 *   SEED=.../asof_seed.mjs PORT=4150 URLS=/nordic.html node tools/sprites/popcheck.mjs
 *
 * **足した一行は、ふだんは出ない。** だから巡回や濃さの道具をそのまま回しても、
 * その一行は1回も測られない。**数え方が届いていない場所は、0件ではなく
 * 「数えていない」**（`docs/island-misses.md` #19 #25）。ここを噛ませて測る。
 *
 * 額は本番の `GET /island-api/fund`（2026-09-12）。日付は旅の途中で切れた形。
 */
const PROD = { total: 46980, given: 296626, goal: 50000, people: 53, updatedAt: null };
const STALE_DAY = process.env.ASOF || "2026-09-06";

export async function apply(ctx) {
  await ctx.route(/\/island-api\/fund(\?|$)/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...PROD, doneruAsOf: STALE_DAY }),
    }),
  );
}
