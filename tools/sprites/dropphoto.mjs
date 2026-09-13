/**
 * 貼った写真を消す導線（`components/cards/DropPhoto.tsx`）を、
 * **押して確かめる。**
 *
 *   PORT=4610 node tools/sprites/dropphoto.mjs
 *
 * この箱のブラウザは本番に届かないので、書き出したものを静的に配って、
 * `asme.mjs` であやと（`admin:true`）として開く。**消す口だけは
 * こちらで受け止めて、飛んできた要求そのものを読む。**
 *
 * 見るのは5つ。
 *
 *   1. あやとには消す道が出る／**あやとでない人には1つも出ない**
 *   2. 1回では消えない（押すと文が出て、そこでもう1度押す）
 *   3. 飛ぶ要求が `DELETE /island-api/nordic/photos/{id}` で、
 *      `Authorization: Bearer …` を持っている
 *   4. 消えたら、その場で棚から落ちる（**読み直しに行かない**）
 *   5. 消せなかったとき（403）、**「消えました」と言わない**。
 *      写真は棚に残ったまま、断られたことが字で出る
 *
 * 4 と 5 が要る理由は `docs/island-misses.md` #34。落ちたのに落ちて
 * いないふりをするのが、この島でいちばん多い壊れ方。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";

const PORT = process.env.PORT || "4610";
const AT = `http://localhost:${PORT}/cards.html`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let bad = 0;
const say = (ok, m) => {
  if (!ok) bad++;
  console.log(`${ok ? "ok" : "NG"} ${m}`);
};

/**
 * 面をひらく。
 *
 * @param {boolean} admin あやととして開くか
 * @param {"ok"|"deny"} how 消す口が返すもの
 * @returns 使う道具ひとそろい
 */
async function open(admin, how = "ok", cards = null) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  // 外の絵。この箱からは出られないので差し替える（写真も顔も）
  await ctx.route(
    /googleusercontent\.com|firebasestorage\.googleapis\.com|ytimg\.com|yt3\.ggpht\.com/,
    (r) => r.fulfill({ path: "/home/user/pdel-wt/site/public/og.png" }),
  );
  await apply(ctx, { admin });

  /* **消す口だけは、あとから登録して横取りする。**
     Playwright はあとに登録した route が先に効くので、`asme` の
     `/island-api/` より確実にこちらが受ける。 */
  /* カードの口を差し替えたいとき（絵に結びつかない人を混ぜて数えるため）。
     こちらもあとから登録するので `asme` より先に効く。 */
  if (cards) {
    await ctx.route(/\/island-api\/cards$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ cards }),
      }),
    );
  }

  const sent = [];
  await ctx.route(/\/island-api\/nordic\/photos\/[^/?]+$/, (r) => {
    const q = r.request();
    if (q.method() !== "DELETE") return r.fallback();
    sent.push({
      url: q.url(),
      method: q.method(),
      auth: q.headers()["authorization"] || "",
    });
    if (how === "deny") {
      return r.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "not allowed" }),
      });
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: q.url().split("/").pop() }),
    });
  });

  const p = await ctx.newPage();
  await p.goto(AT, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  return { ctx, p, sent };
}

const tiles = (p) => p.locator(".akd-tile");
const dropOpen = (p) => p.locator(".akd-drop-open");

/* ---------------- 1. あやとでない人 ---------------- */
{
  const { ctx, p } = await open(false);
  const n = await tiles(p).count();
  say(n > 0, `あやとでない人にも写真は並ぶ（${n}枚）`);
  await tiles(p).first().click();
  await p.waitForTimeout(500);
  const sheet = await p.locator(".akd-sheet").count();
  say(sheet === 1, "写真をひらける");
  const seen = await p.locator(".akd-drop, .akd-drop-open, .akd-drop-yes").count();
  say(seen === 0, `あやとでない人に、消す道が1つも出ない（${seen}）`);
  await ctx.close();
}

/* ---------------- 2〜4. あやとが消す ---------------- */
{
  const { ctx, p, sent } = await open(true);
  const before = await tiles(p).count();
  await tiles(p).first().click();
  await p.waitForTimeout(500);

  say((await dropOpen(p).count()) === 1, "あやとには、消す道が1本出る");
  // 押しどころ。字1本でも 44px 以上（高さで取る）
  const box = await dropOpen(p).boundingBox();
  say(box && box.height >= 44, `消す道の押しどころ ${Math.round(box?.height ?? 0)}px`);

  await dropOpen(p).click();
  await p.waitForTimeout(300);
  say((await p.locator(".akd-drop.is-ask").count()) === 1, "1回では消えない。文が出る");
  const asked = (await p.locator(".akd-drop-say").innerText()).replace(/\s+/g, " ");
  say(/戻せません/.test(asked), `文に「戻せません」がある: ${asked.slice(0, 60)}`);
  say(sent.length === 0, "文が出た時点では、まだ何も飛んでいない");

  // カードの枚数。種は写真1枚に12人ぶん置いてある（asme.mjs の CARD_CHANNELS）
  say(/カードが\d+枚あります/.test(asked), `カードの枚数を先に言う: ${asked.slice(0, 90)}`);

  await p.locator(".akd-drop-yes").click();
  await p.waitForTimeout(900);

  say(sent.length === 1, `飛んだ要求は1本（${sent.length}）`);
  const q = sent[0] || {};
  say(q.method === "DELETE", `method=${q.method}`);
  say(
    /\/island-api\/nordic\/photos\/[A-Za-z0-9_-]{6,}$/.test(q.url || ""),
    `URL=${(q.url || "").replace(/^https?:\/\/[^/]+/, "")}`,
  );
  say(/^Bearer .+/.test(q.auth || ""), `Authorization=${(q.auth || "").slice(0, 12)}…`);

  say((await p.locator(".akd-sheet").count()) === 0, "消えたら、ひらいていた紙が閉じる");
  const after = await tiles(p).count();
  say(after === before - 1, `棚から1枚落ちる（${before} → ${after}）`);
  await ctx.close();
}

/* ---------------- 5. 断られたとき ---------------- */
{
  const { ctx, p, sent } = await open(true, "deny");
  const before = await tiles(p).count();
  await tiles(p).first().click();
  await p.waitForTimeout(500);
  await dropOpen(p).click();
  await p.waitForTimeout(200);
  await p.locator(".akd-drop-yes").click();
  await p.waitForTimeout(900);

  say(sent.length === 1, "断られても、飛んだのは1本");
  say((await p.locator(".akd-sheet").count()) === 1, "**紙を閉じない**（消えていないので）");
  const err = await p.locator(".akd-drop .err").count();
  say(err === 1, "断られたことが字で出る");
  const msg = err ? (await p.locator(".akd-drop .err").innerText()).replace(/\s+/g, " ") : "";
  say(/消せませんでした/.test(msg), `文面: ${msg.slice(0, 70)}`);
  say(!/消えました|消しました/.test(msg), "「消えました」と言っていない");

  await p.locator(".akd-close").click();
  await p.waitForTimeout(300);
  const after = await tiles(p).count();
  say(after === before, `棚から落ちていない（${before} → ${after}）`);
  await ctx.close();
}

/* ---------------- 6. 絵に結びつかない人のぶんも数える ----------------
   カードは「写真 × 投げてくれた人」で、**画面に並ぶのは島の絵がある人だけ**
   （`cards.ts` の `withIcons`）。サーバーは絵の有無に関わらず全部消すので、
   絞ったあとの数を言うと、消える枚数を少なく伝えることになる。 */
{
  /* 写真は `asme` の 2026-09-11 の1枚。カードは4枚だけ返し、
     **そのうち絵に結びつくのは1枚**（残り3枚は住人の表に無いチャンネル）。 */
  const PID = "kQ2rTn5wY8bLxA1cVdEf";
  const SHOT =
    "https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app" +
    `/o/nordic%2Fphotos%2F${PID}.jpeg?alt=media`;
  const one = (chan, n) => ({
    id: `${PID}__${chan}`, day: "2026-09-11", photoId: PID, url: SHOT,
    w: 1600, h: 1200, note: "クタイシ空港へ向かう朝",
    channelId: chan, icon: null, name: null,
    x: 0.8, y: 0.9, rot: 0, scale: 1, moved: false,
    at: 1788724247800 - n, streamEventId: "nordic-day-depart",
  });
  const cards = [
    one("UCTXgxriwnTlJ0y1tff0yU5A", 0), // 住人の表にいる（絵が付く）
    one("UCzzzzzzzzzzzzzzzzzzzz01", 1), // いない（絵が付かない＝画面に出ない）
    one("UCzzzzzzzzzzzzzzzzzzzz02", 2),
    one("UCzzzzzzzzzzzzzzzzzzzz03", 3),
  ];
  const { ctx, p } = await open(true, "ok", cards);
  // その写真のマスを名指しで開く（ひとことで引く）
  await p.locator(".akd-tile[aria-label='クタイシ空港へ向かう朝']").first().click();
  await p.waitForTimeout(500);
  const picks = await p.locator(".npick").count();
  // 「入れない」＋絵の付いた1人 ＝ 2つ。絵の無い3人は選べない
  say(picks === 2, `画面に立てるのは絵のある人だけ（選べるマス ${picks}）`);
  await dropOpen(p).click();
  await p.waitForTimeout(300);
  const asked = (await p.locator(".akd-drop-say").innerText()).replace(/\s+/g, " ");
  say(/カードが4枚あります/.test(asked), `絞る前の枚数で言う（4枚）: ${asked.slice(0, 90)}`);
  say(!/カードが1枚あります/.test(asked), "画面に出ている数（1枚）で言っていない");
  await ctx.close();
}

/* ---------------- 7. 390px での寸法 ----------------
   **押しどころは見た目の箱で測らない**（`CLAUDE.md`）。`::after` で広げた
   当たりも、隣に取られている場所も `getBoundingClientRect` には出ない。
   中心から1pxずつ外へ伸ばして `elementFromPoint` が自分を返すかで測る
   （`tools/sprites/hitbox.mjs` と同じやり方。あちらは押して開く面を
   測れないので、ここに同じものを置いている）。 */
{
  const { ctx, p } = await open(true);
  await tiles(p).first().click();
  await p.waitForTimeout(400);
  await dropOpen(p).click();
  await p.waitForTimeout(400);

  const m = await p.evaluate(() => {
    const hitOf = (el) => {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hits = (x, y) => {
        const e = document.elementFromPoint(x, y);
        return e && (e === el || el.contains(e) || e.closest?.("a,button") === el);
      };
      const grow = (dx, dy) => {
        let n = 0;
        while (n < 80 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
        return n;
      };
      return [grow(-1, 0) + grow(1, 0) + 1, grow(0, -1) + grow(0, 1) + 1];
    };
    const out = {};
    for (const sel of [".akd-drop-no", ".akd-drop-yes"]) {
      const el = document.querySelector(sel);
      if (el) out[sel] = hitOf(el);
    }
    /* 横あふれ。**畳みを開いた状態で、いちばん下まで送ってから測る**
       （`CLAUDE.md`。送らずに測ると畳みが 68px で報告される） */
    const sheet = document.querySelector(".akd-sheet");
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
    out.over = document.documentElement.scrollWidth - window.innerWidth;
    out.sheetOver = sheet ? sheet.scrollWidth - sheet.clientWidth : 0;
    return out;
  });

  for (const sel of [".akd-drop-no", ".akd-drop-yes"]) {
    const h = m[sel];
    say(h && h[0] >= 44 && h[1] >= 44, `${sel} の当たり ${h?.[0]}x${h?.[1]}px`);
  }
  say(m.over <= 1, `390px で横あふれ ${m.over}px`);
  say(m.sheetOver <= 1, `ひらいた紙の中の横あふれ ${m.sheetOver}px`);
  await ctx.close();
}

console.log(`\nNG ${bad}`);
await b.close();
process.exit(bad ? 1 : 0);
