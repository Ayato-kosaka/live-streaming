/**
 * 配信で使う3面（`/roulette` `/me/remote` `/me/roulette`）を撮るための差し込み口。
 *
 * `asme.mjs` の上に**足りないぶんだけ**重ねる。あちらはルーレットの口
 * （`/island-api/roulette/*`）は返すが、**島の遠隔操作（`/remote`）を返さない。**
 * 受け皿の `json(r, {})` に落ちるので `r.session` が `undefined` になり、
 * `/me/remote` は灰色の骨（`WaitingPanel`）のまま何も出ない。
 * そこだけ足す。**あちらは読むだけ**（他の担当が同じ時間に触っている）。
 *
 * route はあとから登録したほうが先に効く（`prod.mjs` の注と同じ）。
 * だから `asme.apply(ctx)` を呼んだ**あとに** `/remote` を登録する。
 *
 *   import { apply } from "./liveseed.mjs";
 *   await apply(ctx);              // 視聴者さんとして
 *   ADMIN=1 ...                    // あやととして（`/me/*` はこれが要る）
 *
 * 値は本番の形に合わせる。`sessionId` は本番と同じ 32 桁
 * （`functions/src/remote.ts`）。ここが短いと、コントローラーが出す
 * OBS 用の URL の**長さが本番と変わって、横あふれを撮り逃がす**。
 */
import { apply as asme } from "./asme.mjs";

/** 本番と同じ 32 桁。`/?remote=<これ>` が OBS に貼る URL になる */
export const REMOTE_ID = "9f1c4a70b23d48e6a5f07c81de29b3a4";

/** 押したものの通し番号。押すたびにサーバーが +1 する */
let seq = 0;

export const remoteState = () => ({
  sessionId: REMOTE_ID,
  at: null,
  view: null,
  scrollTo: null,
  say: "",
  showSay: true,
  seq,
  updatedAt: Date.now(),
  pollMs: 2000,
});

export async function apply(ctx, opts = {}) {
  await asme(ctx, opts);
  /* **`/remote` だけを横取りする。** `/remote/session` も同じ枝でよい
     （どちらも返すのは `{ session }` ひとつ）。 */
  await ctx.route(/\/island-api\/remote(\/|\?|$)/, (r) => {
    if (r.request().method() === "POST") seq += 1;
    let body = {};
    try {
      body = JSON.parse(r.request().postData() || "{}");
    } catch {}
    const s = remoteState();
    /* 押した中身をそのまま返す。**返さないと、入切のボタンが
       押しても戻ってしまう**（画面は返事の値で塗り直す）。 */
    if (typeof body.showSay === "boolean") s.showSay = body.showSay;
    if (body.at) s.at = body.at;
    if (body.view) s.view = body.view;
    if (body.scrollTo) s.scrollTo = body.scrollTo;
    if (body.say) s.say = body.say;
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: s, open: true }),
    });
  });
}
