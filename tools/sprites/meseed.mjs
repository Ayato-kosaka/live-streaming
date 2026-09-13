/**
 * `/me` `/me/desk` を、**空のとき・待っているとき・落ちたとき**で撮るための差し込み口。
 *
 * `asme.mjs` は「本番に近い、うまくいっている日」を返す。ところが
 * `docs/island-standards.md` 10章の決めごと——「20枚貼ってくれた人の画面が、
 * 電波の細い日に『0枚』と言い切る」をやらない——は、**うまくいっている日には
 * 1件も測れない。** 落とした絵と、0件の絵と、待っている絵を**並べて**見て、
 * はじめて見分けがつくかどうかが分かる。
 *
 *   import { seed } from "./meseed.mjs";
 *   await seed(ctx, { admin: true, mode: "down" });
 *
 * mode:
 *   "ok"    そのまま（`asme.mjs` のまま）
 *   "empty" 一覧の口が、ぜんぶ「読めた上での0件」を返す
 *   "wait"  一覧の口が、いつまでも返らない（灰色の骨が出たまま）
 *   "down"  一覧の口が 500 で落ちる
 *
 * **`/me`（自分が誰か）だけは、どの mode でも返す。** ここを落とすと
 * `owner` が unknown になって机ごと1枚に化け、**道具の中の顔が1つも撮れない。**
 * 机そのものが落ちた絵は `mode:"down", meToo:true` で別に撮る。
 *
 * あとから登録した route が先に当たる（Playwright）。だから `asme.apply` の
 * **あとで**包む。順番を逆にすると、asme の受け皿に全部持っていかれる。
 */
import { apply } from "./asme.mjs";

/** 一覧の口が返す「読めた上での0件」。欄の名前は本番の形にそろえる。 */
const EMPTY = {
  "/stickies": { notes: [], more: false, next: null },
  "/nextplans": { plans: [], more: false, next: null },
  "/cards": { cards: [] },
  "/donors": { donors: [] },
  "/characters": { characters: [] },
  "/fund/history": { chats: [], more: false, next: null, count: 0, yen: 0 },
  "/nordic/photos": { days: [] },
};

export async function seed(ctx, opts = {}) {
  const mode = opts.mode ?? process.env.MEMODE ?? "ok";
  await apply(ctx, opts);
  if (mode === "ok") return;

  /* 絵は差し替えない。**落とすのは一覧の口だけ。**
     絵まで落とすと「読めなかった顔」と「絵が出ない」が混ざって、
     どちらを見ているのか分からなくなる（`docs/island-misses.md` #13）。 */
  const isImage = (path) => /\.(webp|png|jpe?g|svg)$/.test(path);

  await ctx.route(/\/island-api\//, async (r) => {
    const path = new URL(r.request().url()).pathname.replace("/island-api", "");
    if (isImage(path)) return r.fallback();
    /* 自分が誰かは返す（上の docstring）。`meToo` のときだけ落とす。 */
    if (path === "/me" && !opts.meToo) return r.fallback();
    /* 書く口（POST / DELETE）はそのまま通す。落とすのは読む口だけで、
       押した結果が出ないのは別に測る話（ここでは絵を撮れなくなるだけ）。

       **ただし POST でも「読みに行っている」口がある。**
       アラートボックスの URL（`/alertbox/session`）は POST で取りに行く。
       ここを通していたせいで、**OBS の道具だけ4つの状態が全部同じ絵**に
       なっていた（高さが4通りとも 1,873px で気づいた）。
       口の名前ではなく、**画面がそれを「読めた／読めなかった」で分けて
       いるかどうか**で決める。 */
    const readishPost = path === "/alertbox/session";
    if (r.request().method() !== "GET" && path !== "/me" && !readishPost) return r.fallback();

    if (mode === "empty") {
      const key = Object.keys(EMPTY).find((k) => path === k || path.startsWith(k));
      if (!key) return r.fallback();
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY[key]),
      });
    }
    if (mode === "wait") {
      /* 返さない。**`withRead` は12秒で見切る**ので、灰色の骨を撮るなら
         それより早く撮る。12秒以上待つと「落ちたとき」に変わる。 */
      await new Promise(() => {});
      return;
    }
    // down
    return r.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "seeded-down" }),
    });
  });
}
