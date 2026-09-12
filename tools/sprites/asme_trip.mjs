/**
 * 旅が始まったあとの本番の値で、入っている人として撮るための差し込み口。
 *
 * `asme.mjs` の `/state` は出発前（ジョージア・トビリシ）のまま止まっている。
 * 旅の道具（`/me/desk` の「いまどこ」）は **島にいま何が出ているか**を
 * 読んで出す欄なので、古い値で撮ると「いまは ジョージア・トビリシ」と写って、
 * 旅が始まったあとの姿を見たことにならない。
 *
 * `/tmp/prodstate.json`（本番の `/island-api/state`）を、あれば使う。
 *
 *   SEED=.../asme_trip.mjs ADMIN=1 PORT=4360 PAGES=/me/desk node tools/sprites/hitbox.mjs
 *
 * `DOWN=1` を付けると、`/island-api/*` を**落とした**状態にする（電波が細い日）。
 * 読み書きの口だけを落とし、キャラクターの絵は通す（絵まで落とすと
 * 「読めなかった」ではなく「絵が無い」を見ることになる）。
 */
import { existsSync, readFileSync } from "node:fs";
import { apply as base } from "./asme.mjs";

const PROD = "/tmp/prodstate.json";

export async function apply(ctx, opts = {}) {
  await base(ctx, opts);
  const down = opts.down ?? process.env.DOWN === "1";

  /* あとに登録したものから当たる。ここで本番の値に差し替える。 */
  if (existsSync(PROD)) {
    const state = JSON.parse(readFileSync(PROD, "utf8"));
    await ctx.route(/\/island-api\/state(\?|$)/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state),
      }),
    );
  }

  /* 0件のほう。**「読めなかった」と並べて見るために要る。**
     これが無いと、落ちた絵だけ撮って「見分けられる」と言うことになる。 */
  if (opts.empty ?? process.env.EMPTY === "1") {
    const none = {
      "/stickies": { notes: [], more: false, next: null },
      "/nextplans": { plans: [], more: false, next: null },
      "/cards": { cards: [] },
      "/donors": { donors: [] },
      "/nordic/photos": { days: [] },
      "/characters": { characters: [] },
    };
    await ctx.route(/\/island-api\//, (r) => {
      const path = new URL(r.request().url()).pathname.replace("/island-api", "");
      if (/^\/characters\/[^/]+\/(plain|scene)-\d+\.webp$/.test(path)) return r.fallback();
      const body = none[path.split("?")[0]];
      if (!body) return r.fallback();
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
  }

  /* 送りの口だけを落とす。**読めてはいるが、送れない日。**
     `DOWN=1` は面ごと「読めなかった」に倒れるので、
     「送れませんでした。」の1行を見るにはこちらが要る。 */
  if (opts.postdown ?? process.env.POSTDOWN === "1") {
    await ctx.route(/\/island-api\/current(\?|$)/, (r) =>
      r.request().method() === "POST" ? r.abort("connectionfailed") : r.fallback(),
    );
  }

  if (down) {
    await ctx.route(/\/island-api\//, (r) => {
      const path = new URL(r.request().url()).pathname;
      // 絵は落とさない。落ちているのは「読み書きの口」だけ、という日を作る
      if (/\/characters\/[^/]+\/(plain|scene)-\d+\.webp$/.test(path)) return r.fallback();
      return r.abort("connectionfailed");
    });
  }
}
