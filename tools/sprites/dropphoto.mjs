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
 * 見るのは6つ。
 *
 *   1. あやとには消す道が出る／**あやとでない人には1つも出ない**
 *   2. 1回では消えない（押すと文が出て、そこでもう1度押す）
 *   3. 飛ぶ要求が `DELETE /island-api/nordic/photos/{id}` で、**押した写真の
 *      ID そのもの**に飛んでいて、`Authorization: Bearer …` を持っている
 *   4. 消えたら、その場で棚から落ちる（**読み直しに行かない**）
 *   5. その日の最後の1枚を消すと、**日ごと落ちる**（棚は日で数えている）
 *   6. 消せなかったとき（403）、**「消えました」と言わない**。
 *      写真は棚に残ったまま、断られたことが字で出る
 *
 * 4 と 6 が要る理由は `docs/island-misses.md` #34。落ちたのに落ちて
 * いないふりをするのが、この島でいちばん多い壊れ方。
 *
 * ## 「消えた」を、**タイルの総数で数えない**（2026-09-15）
 *
 * ここは長いあいだ `棚のタイルが before - 1 になる` で見ていて、**3 → 5** と
 * 出して NG を立てていた。**画面のほうは正しかった。**
 *
 * 棚は `Longer items={days} first={3}` で、**「3日ぶん」を出す作り**
 * （`components/cards/CardWall.tsx`）。数えているのはタイルではなく**日**で、
 * 1日に写真は何枚でも貼る。だから
 *
 *   - 消した写真がその日のただ1枚なら、**その日ごと消える**
 *   - 4日目が3日目の位置へ繰り上がる
 *   - 繰り上がった日に写真が3枚あれば、**見えているタイルは増える**
 *
 * これは仕様どおりで、実測でも「9日12枚」が「8日11枚」に減っていた
 * （見えていたのは 3日3枚 → 3日5枚）。**総数は、畳みの窓が動くと意味を持たない。**
 *
 * かわりに見るのは3つ。**消したその写真が棚から消えたか**、**日ごとの枚数が
 * その日だけ1減ったか**、**畳みの残りが1日ぶん減ったか**。
 * 総数を見るときは、先に畳みを全部ひらいて窓を止めてから見る。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";

/* 差し替える絵は、**自分の居場所から引く。** ここに別の worktree の絵の道を
   直に書いていたせいで、その worktree が消えた日から ENOENT で即死していた
   （1本目の `ctx.route` で落ちるので、判定は1つも出ない）。 */
const OGPNG = join(dirname(fileURLToPath(import.meta.url)), "../../site/public/og.png");

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
    (r) => r.fulfill({ path: OGPNG }),
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

/**
 * 棚の形を、**日ごとに**読む。総数だけ見ていると、畳みの窓が動いたのを
 * 「消えていない」と読み違える（このファイルの頭の話）。
 *
 * @param {import("playwright-core").Page} p 面
 * @returns {Promise<{longer: string|null, days: {day: string, tiles: string[]}[]}>}
 */
const shelf = (p) =>
  p.evaluate(() => ({
    /* 「あと◯日ぶんだす」。**残りの日数**が出ているので、日が1つ落ちたことを
       棚の外からも確かめられる */
    longer: document.querySelector(".longer")?.innerText.replace(/\s+/g, " ") ?? null,
    days: [...document.querySelectorAll(".akd-day")].map((s) => ({
      day: s.querySelector("h2")?.textContent ?? "",
      // ひとことが aria-label。**写真1枚につき1マス**なので、これが枚数になる
      tiles: [...s.querySelectorAll(".akd-tile")].map((t) => t.getAttribute("aria-label") ?? ""),
    })),
  }));

/** 日ごとの枚数を、報告に出せる1行にする。 */
const line = (s) => s.days.map((d) => `${d.day}:${d.tiles.length}`).join(" ");
/** 見えているタイルの総数。**畳みを全部ひらいたときだけ意味がある。** */
const total = (s) => s.days.reduce((n, d) => n + d.tiles.length, 0);

/**
 * 畳みを全部ひらく。**総数で見るなら、先に窓を止める。**
 * @param {import("playwright-core").Page} p 面
 */
async function openAll(p) {
  const more = p.locator(".longer");
  for (let i = 0; i < 12; i++) {
    if ((await more.count()) === 0) return;
    if (!/だす/.test(await more.innerText())) return;
    await more.click();
    await p.waitForTimeout(400);
  }
}

/**
 * そのマスが指している写真の ID。**画像の URL から取る。**
 * 消す要求の行き先を「長さが6文字以上か」で見ると、ID の形が変わっただけで
 * 落ちる。**押した1枚と同じところへ飛んだか**を見る。
 * @param {import("playwright-core").Locator} tile マス
 * @returns {Promise<string|null>} 写真のID
 */
async function idOf(tile) {
  const src = (await tile.locator("img").getAttribute("src")) || "";
  return /nordic\/photos\/([^/.?]+)\./.exec(decodeURIComponent(src))?.[1] ?? null;
}

/**
 * 消す（開いてから、2回押すまで）。
 * @param {import("playwright-core").Page} p 面
 */
async function drop(p) {
  await dropOpen(p).click();
  await p.waitForTimeout(300);
  await p.locator(".akd-drop-yes").click();
  await p.waitForTimeout(900);
}

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

/* ---------------- 2〜4. あやとが消す ----------------
   **畳みを全部ひらいてから測る。** はじめの3日ぶんだけ出ている状態で総数を
   数えると、日が1つ落ちて次の日が繰り上がったぶんが混ざる（頭の話）。
   消すのは**その日に3枚あるうちの1枚**にして、日そのものは残す。 */
{
  const { ctx, p, sent } = await open(true);
  await openAll(p);
  const before = await shelf(p);
  say(before.days.length >= 2, `棚は ${before.days.length}日ぶん・${total(before)}枚（${line(before)}）`);

  /* 消す1枚は**名指しで選ぶ。** 「1枚目」にすると、種の並び順が変わっただけで
     別の写真を消すことになる。本番と同じ形のID（`nordicPhotos` にも
     `islandStreamEventImage` にもあるもの）を持つ1枚を選ぶ。 */
  const LABEL = "クタイシ空港へ向かう朝";
  const tile = p.locator(`.akd-tile[aria-label='${LABEL}']`).first();
  say((await tile.count()) === 1, `消す1枚を名指しで引ける（${LABEL}）`);
  const pid = await idOf(tile);
  say(!!pid, `その1枚の写真ID=${pid}`);
  /** その写真が乗っている日。**この日は消えない**（同じ日に3枚ある） */
  const theDay = before.days.find((d) => d.tiles.includes(LABEL));
  say(
    !!theDay && theDay.tiles.length >= 2,
    `その日には ${theDay?.tiles.length}枚ある（日ごとは消えない）`,
  );

  await tile.click();
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
  /* **押した1枚と同じ ID へ飛んだか**を見る。長さで見ると、ID の形が変わった
     だけで落ちるし、隣の写真へ飛んでいても通ってしまう。 */
  const path = (q.url || "").replace(/^https?:\/\/[^/]+/, "");
  say(path === `/island-api/nordic/photos/${pid}`, `URL=${path}`);
  say(/^Bearer .+/.test(q.auth || ""), `Authorization=${(q.auth || "").slice(0, 12)}…`);

  say((await p.locator(".akd-sheet").count()) === 0, "消えたら、ひらいていた紙が閉じる");

  /* **消えたかどうかは、消したその1枚で見る。** 総数は畳みを全部ひらいて
     あるときだけ意味があるので、ここでは両方見る。 */
  const after = await shelf(p);
  say(
    !after.days.some((d) => d.tiles.includes(LABEL)),
    `消した1枚が棚から消える（${LABEL}）`,
  );
  const now = after.days.find((d) => d.day === theDay?.day);
  say(
    now && now.tiles.length === theDay.tiles.length - 1,
    `その日だけ1枚減る（${theDay?.day} ${theDay?.tiles.length} → ${now?.tiles.length}）`,
  );
  say(
    after.days.length === before.days.length,
    `日は減らない（${before.days.length} → ${after.days.length}日ぶん）`,
  );
  say(
    total(after) === total(before) - 1,
    `全部ひらいた総数が1枚減る（${total(before)} → ${total(after)}）`,
  );
  await ctx.close();
}

/* ---------------- 5. その日の最後の1枚を消すと、日ごと落ちる ----------------
   **棚は日で数えている**（`Longer items={days} first={3}`）。ここが、総数で
   見ていたころ「3 → 5 に増えた」と NG を立てていた当のところ。増えたのは
   **4日目が繰り上がった**からで、画面は正しい。見るのはこの3つ。

     - 消した日の見出しが、棚から消える
     - 畳みの「あと◯日ぶんだす」が**1日ぶん減る**
     - 見えている3日ぶんが、**次の3日**に入れ替わる（総数は増えてよい） */
{
  const { ctx, p } = await open(true);
  /* 畳みを開かない。**はじめの3日ぶんのまま**でないと、窓が動くところが見えない */
  const before = await shelf(p);
  const all = await (async () => {
    const q = await open(true);
    await openAll(q.p);
    const s = await shelf(q.p);
    await q.ctx.close();
    return s;
  })();
  say(
    before.days.length === 3 && all.days.length > 3,
    `はじめは3日ぶん（ぜんぶで ${all.days.length}日ぶん・${total(all)}枚）`,
  );
  const gone = before.days[0];
  say(gone.tiles.length === 1, `1日目はその日ただ1枚（${gone.day} ${gone.tiles.length}枚）`);
  say(/あと\d+日ぶんだす/.test(before.longer || ""), `畳み: ${before.longer}`);

  await p.locator(".akd-tile").first().click();
  await p.waitForTimeout(500);
  await drop(p);

  const after = await shelf(p);
  say(
    !after.days.some((d) => d.day === gone.day),
    `その日ごと棚から落ちる（${gone.day}）`,
  );
  const rest = (s) => Number(/あと(\d+)日ぶんだす/.exec(s.longer || "")?.[1] ?? -1);
  say(
    rest(after) === rest(before) - 1,
    `畳みの残りが1日ぶん減る（あと${rest(before)}日 → あと${rest(after)}日）`,
  );
  /* **繰り上がった先が、ぜんぶ出したときの2〜4日目と同じか。**
     ここが合っていれば、増えたタイルは「出るはずだったものが上がってきた」だけ。 */
  const want = all.days.slice(1, 4).map((d) => `${d.day}:${d.tiles.length}`).join(" ");
  say(line(after) === want, `次の3日が繰り上がる（${line(after)}）`);
  /* 見えている枚数は**増えてよい。** 合否にはしない（上の3つで足りる）が、
     読み違えの元になった数字なので、そのまま出しておく。 */
  console.log(`   見えている枚数 ${total(before)} → ${total(after)}枚（日は ${before.days.length} → ${after.days.length}）`);
  await ctx.close();
}

/* ---------------- 6. 断られたとき ---------------- */
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

/* ---------------- 7. 絵に結びつかない人のぶんも数える ----------------
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

/* ---------------- 8. 390px での寸法 ----------------
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
