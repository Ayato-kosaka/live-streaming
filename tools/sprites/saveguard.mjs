/**
 * **読めていないのに保存できてしまわないか**を、島の値そのもので確かめる。
 *
 *   cd site && NEXT_DIST_DIR=.next-save npx next build
 *   python3 -m http.server 4790 --directory site/.next-save &
 *   SPORT=4790 node tools/sprites/saveguard.mjs
 *
 * ## なぜ「落としたまま押す」では足りないか
 *
 * 通信を落としたまま押しても、送るほうも落ちるので**何も壊れない。**
 * 本当に壊れるのは、
 *
 *   1. 開いたときの**読みだけ**が落ちて（電波の細いところ）
 *   2. そのあと電波が戻り
 *   3. 中身が古い／空の顔のまま「保存」を押す
 *
 * という順のとき。`POST /island-api/me` は読みも書きも同じ口なので、
 * **はじめの1本だけ落として、そのあとを通す**と、その順が作れる。
 *
 * ここで見るのは画面の字ではなく、**島に入っている値**（この道具が
 * 覚えている `store`）。押す前と押したあとで突き合わせて、
 * 本人が決めた `showName` / `showPhoto` / `nickname` が消えていないことを見る。
 */
import { mkdirSync } from "node:fs";
import { launch, newCtx, openPage } from "./readbase.mjs";

const OUT = process.env.OUT || "/tmp/save";
mkdirSync(OUT, { recursive: true });

/** 本人が決めてある値。**これが消えたら失格。** */
const START = {
  uid: "fakeuid0001",
  name: "@ゆずたつ",
  nickname: "ゆず",
  showName: true,
  showPhoto: true,
  admin: true,
};

/**
 * `POST /me` を、本番と同じように**送られてきた欄だけ**上書きして覚える
 * （`functions/src/islandApi.ts` の `patch` と同じ merge）。
 */
async function serveMe(ctx, box) {
  await ctx.route(/\/island-api\/me$/, async (r) => {
    if (box.down) return r.abort("failed");
    let body = {};
    try {
      body = JSON.parse(r.request().postData() || "{}");
    } catch {}
    if (body.nickname !== undefined) box.store.nickname = body.nickname;
    if (body.showName !== undefined) box.store.showName = !!body.showName;
    if (body.showPhoto !== undefined) box.store.showPhoto = !!body.showPhoto;
    box.wrote.push(JSON.stringify(body));
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(box.store),
    });
  });
}

/** 「これでいく」を押す。無ければ、無かったと言う（黙って通さない）。 */
async function press(p, word) {
  const hit = await p.evaluate((w) => {
    const go = [...document.querySelectorAll("button")].find(
      (e) => (e.textContent ?? "").trim().includes(w) && !e.disabled,
    );
    if (!go) return false;
    go.click();
    return true;
  }, word);
  console.log(`  「${word}」… ${hit ? "押せた" : "出ていない（押せない）"}`);
  return hit;
}

const look = (p) =>
  p.evaluate(() => {
    const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    return {
      よみなおし: txt(".blank.is-off > b"),
      見え方の欄: document.querySelectorAll(".me .me-check").length,
      印: [...document.querySelectorAll(".me-check input")].map((e) => e.checked),
      保存の押しどころ: [...document.querySelectorAll(".me-save")].map(
        (e) => `${e.textContent.trim()}${e.disabled ? "（押せない）" : ""}`,
      ),
    };
  });

const b = await launch();

/* 1本目だけ落として、そのあと通す。**電波が戻ってから押す**のを作る */
const box = { down: true, store: { ...START }, wrote: [] };
const ctx = await newCtx(b, { admin: true, mode: "ok", memo: true });
await serveMe(ctx, box);

const p = await openPage(ctx, "/me.html", { wait: 15000 });
console.log(`読めなかったとき ${JSON.stringify(await look(p))}`);
await p.screenshot({ path: `${OUT}/1-読めなかった.png`, fullPage: true });

// 電波が戻る。**画面はそのまま**（開き直さない）
box.down = false;
console.log(`押す前の島の値 ${JSON.stringify(box.store)}`);
await press(p, "これでいく");
await p.waitForTimeout(4000);
console.log(`押したあとの島の値 ${JSON.stringify(box.store)}`);
console.log(`送った中身 ${JSON.stringify(box.wrote)}`);
await p.screenshot({ path: `${OUT}/2-戻って押したあと.png`, fullPage: true });

const same =
  box.store.nickname === START.nickname &&
  box.store.showName === START.showName &&
  box.store.showPhoto === START.showPhoto;
console.log(same ? "OK 本人の決めたものは消えていない" : "NG 本人の決めたものが消えた");

/* 読み直したあとなら、ちゃんと保存できること（塞ぎすぎていないか） */
await press(p, "もう一度よみこむ");
await p.waitForTimeout(4000);
console.log(`読み直したあと ${JSON.stringify(await look(p))}`);
await p.evaluate(() => {
  const c = document.querySelectorAll(".me-check input");
  if (c[1]) c[1].click(); // アイコンを出すのを外す（本人が決め直す）
});
await press(p, "これでいく");
await p.waitForTimeout(4000);
console.log(`決め直したあとの島の値 ${JSON.stringify(box.store)}`);
await p.screenshot({ path: `${OUT}/3-読み直して決め直した.png`, fullPage: true });

await p.close();
await ctx.close();
await b.close();
