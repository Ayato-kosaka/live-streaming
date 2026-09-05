/**
 * スクショを撮るときの「外に出られない先」の差し替えを、1か所にまとめる。
 *
 * これまでは各スクリプトが自前で page.route を書いていて、住人12人ぶんを
 * まとめて `ayato.png` に差し替えていた。そのせいで**島の上の12人が
 * 全員そっくり同じ**に写り、「住人が生きているか」を見ても何も分からなかった。
 *
 * ブラウザからは lh3.googleusercontent.com に出られないが、curl では取れる。
 * `python3 tools/sprites/avatars.py` で先に落としておくと、ここが
 * **本番と同じ絵を1人ずつ**返す。落としていなければ ayato.png に落ちる。
 *
 * 使い方:
 *   import { offline } from "./route.mjs";
 *   const ctx = await b.newContext({ ... });
 *   await offline(ctx);
 */
import { existsSync } from "fs";

const ROOT = "/home/user/live-streaming";
const AVATARS = "/tmp/avatars";

export async function offline(ctx, opts = {}) {
  const fallback = opts.avatar ?? `${ROOT}/site/public/characters/ayato.png`;
  const photo = opts.photo ?? `${ROOT}/site/public/og.png`;

  // 住人のキャラクター画像。URL の /d/<id> から1人ずつ引く
  await ctx.route(/lh3\.googleusercontent\.com/, (r) => {
    const m = /\/d\/([^=?/]+)/.exec(r.request().url());
    const local = m && `${AVATARS}/${m[1]}.png`;
    r.fulfill({ path: local && existsSync(local) ? local : fallback });
  });

  // 外から借りている写真。中身は問わないので1枚で足りる
  await ctx.route(/upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, (r) =>
    r.fulfill({ path: photo }),
  );

  // 書体は next/font で自分のドメインから配るが、古い書き出しが残っていると叩きにいく
  await ctx.route(/fonts\.googleapis\.com/, (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
}
