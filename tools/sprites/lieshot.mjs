/**
 * 「読めなかった」を「無い」に倒していた4か所を、**通信を落として**撮る。
 *
 *   カードの壁（`/cards`）・旅の写真の入口と旅程表の印（`/nordic`）・
 *   企画を書く道具（`/next/new?id=…`）・その日の話（`/nordic/day/4`）
 *
 *   cd site && NEXT_DIST_DIR=.next-lie npx next build
 *   python3 -m http.server 4710 --directory site/.next-lie &
 *   SPORT=4710 OUT=/tmp/lie node tools/sprites/lieshot.mjs
 *
 * 落とし方は3通り（`readbase.mjs`）。**`abort` だけで判定しない。**
 * 本命は「45秒返さない」で、`fetch` は自分では諦めないのでそこが一番出る。
 *
 * **口を1つだけ落とす回を必ず撮る。** カードの壁は口が2つ（写真とカード）
 * あって、前は**2つとも落ちたときだけ**「つながりません」と言い、
 * 片方だけ落ちると「まだ1枚もありません」と言い切っていた。
 * 細い電波でいちばん多いのは片方だけ落ちることなので、
 * **いちばんよく起きる落ち方が、いちばん大きな嘘だった。**
 */
import { mkdirSync } from "node:fs";
import { launch, newCtx, openPage, revive } from "./readbase.mjs";

const OUT = process.env.OUT || "/tmp/lie";
mkdirSync(OUT, { recursive: true });

/* ---------------- ふつうに読めたときの中身 ----------------
   **0件ばかりにすると「読めた」の絵が痩せて、落としたときと見分けがつかない。**
   本番と同じ形（`functions/src/cards.ts` `nordic.ts` `nextplans.ts`）で置く。 */

const UID = "fakeuid0001";
const PHOTO = (n, day) => ({
  id: `ph${n}`,
  day,
  url: `https://firebasestorage.googleapis.com/ph${n}.jpg`,
  w: 1600,
  h: 1200,
  note: `${day} の写真${n}`,
  at: 1757000000000 + n * 1000,
});
const PHOTO_DAYS = [
  { day: "2026-09-12", photos: [PHOTO(1, "2026-09-12"), PHOTO(2, "2026-09-12")], people: [] },
  { day: "2026-09-11", photos: [PHOTO(3, "2026-09-11")], people: [] },
];
/** 名簿の絵に当たる人だけがカードになる（`withIcons`）ので、本物の icon を使う */
const CARDS = [
  {
    id: "c1", day: "2026-09-12", photoId: "ph1",
    url: PHOTO_DAYS[0].photos[0].url, w: 1600, h: 1200, note: "",
    channelId: null, icon: "ayato", name: "あやと",
    x: 0.8, y: 0.9, rot: 0, scale: 1, moved: false, at: 1757000001000,
  },
];
const MY_PLAN = {
  id: "p-mine", title: "ヒッチハイクで北欧へ", when: "2026年9月11日(金) 23:30 出発",
  date: "2026-09-11", note: "陸路はぜんぶヒッチハイクでつなぐ、一方通行の旅。",
  tags: ["北欧", "ヒッチハイク"],
  place: { name: "ムタツミンダ公園", area: "トビリシ・山の上", map: "" },
  about: ["そこで何が起きるのかを書いてある段落。"], links: [], photos: [], embeds: [],
  by: "あやと", byUid: UID, hearts: 3, status: "idea",
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
};
const LOG = [
  { day: "day-1", date: "2026-09-12", body: "2台目で停まってくれた。", at: 1757000002000 },
  { day: "day-4", date: "2026-09-15", body: "国境の手前で降ろされた。\n3時間立った。", at: 1757000003000 },
];

/**
 * `EMPTYCARDS=1` … カードの口が**読めた上で0枚**を返す（旅に出る前がこれ）。
 *
 * **片方だけ落ちる回の本命はここ。** もう片方に中身があると、落ちたことを
 * 黙っていても絵が埋まってしまい、嘘が見えない。
 */
const EMPTY_CARDS = process.env.EMPTYCARDS === "1";

/** ふつうのときの中身。落としている口は素通しして、下の `drop` に任せる。 */
async function seed(ctx) {
  await ctx.route(/\/island-api\//, async (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/island-api", "");
    const json = (body) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/nordic/photos") return json({ days: PHOTO_DAYS });
    if (path === "/cards") return json({ cards: EMPTY_CARDS ? [] : CARDS });
    if (path === "/nordic/log") return json({ log: LOG });
    if (path === "/nextplans") return json({ plans: [MY_PLAN], more: false, next: null });
    if (path.startsWith("/nextplans/")) return json({ plan: MY_PLAN });
    return r.fallback();
  });
}

/**
 * 落とす口を、**名指しで**選ぶ。
 *
 * `newCtx` の落とし方は `/island-api/` ぜんぶに当たるので、
 * 「片方の口だけ落ちる」を作れない。あとから登録したこちらが先に効く。
 */
async function drop(ctx, which, mode) {
  const box = { mode, which };
  await ctx.route(/\/island-api\//, async (r) => {
    const path = new URL(r.request().url()).pathname.replace("/island-api", "");
    if (box.mode === "ok" || !box.which.test(path)) return r.fallback();
    if (box.mode === "abort") return r.abort("failed");
    if (box.mode === "503")
      return r.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
    /* 45秒返さない。**`fetch` は自分では諦めない**ので、ここが本命 */
    await new Promise((s) => setTimeout(s, 45000));
    return r.abort("failed");
  });
  return box;
}

const ALL = /./;
const PHOTOS_ONLY = /^\/nordic\/photos/;
const CARDS_ONLY = /^\/cards/;

/** 何が出ているか。**絵だけでなく、数えて突き合わせる。** */
const peek = (p) =>
  p.evaluate(() => {
    const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    const one = (s) => txt(s)[0] ?? "";
    return {
      よみなおし: txt(".blank.is-off > b"),
      よみこむ札: txt(".blank.is-off .blank-go"),
      からっぽ: txt(".blank:not(.is-off) > b"),
      骨: document.querySelectorAll(".wait").length,
      // カードの壁
      日ぶんの紙: document.querySelectorAll(".akd-day").length,
      写真のマス: document.querySelectorAll(".akd-tile").length,
      // 旅の面
      写真の入口: one(".nph-go .tile-text i"),
      旅程表の印: document.querySelectorAll(".nday[data-log]").length,
      // 企画を書く道具
      書く欄: document.querySelectorAll(".dform textarea, .dform input").length,
      出す押しどころ: txt(".me-save"),
      じぶんの企画: txt(".chip.link"),
      できあがり: document.querySelectorAll(".nx-lead-head").length,
      // その日の話
      その日の話: document.querySelectorAll("#was").length,
      まだ書いていません: txt("#was .muted"),
      書き出しの札: document.querySelectorAll(".nlog-seed").length,
      入れる: txt("#was .nph-post-go"),
      高さ: Math.round(document.body.scrollHeight),
      横あふれ: document.body.scrollWidth > document.documentElement.clientWidth,
    };
  });

/**
 * 面と、**その面で自分が名乗っている名前**。
 *
 * 押す先を `.blank.is-off .blank-go` の1つめにしない。細い電波では、同じ面の
 * 別の部品（写真を貼る口・みんなの答え）の札のほうが上にいることがあり、
 * **他人の札を押して「直った／直らない」を読む**ことになる（判定#13）。
 */
const PAGES = [
  ["/cards.html", "cards", "旅の写真"],
  ["/nordic.html", "nordic", "その日の話"],
  ["/next/new.html?id=p-mine", "next", "この企画"],
  ["/nordic/day/4.html", "day4", "その日の話"],
];

/** 名前で選んで押す。押せなければ、押せなかったと言う（黙って通さない）。 */
async function press(p, word) {
  const hit = await p.evaluate((w) => {
    const box = [...document.querySelectorAll(".blank.is-off")].find((e) =>
      (e.querySelector("b")?.textContent ?? "").includes(w),
    );
    const go = box?.querySelector(".blank-go");
    if (!go) return false;
    go.click();
    return true;
  }, word);
  if (!hit) console.log(`  「${word}」の札が見つからず、押せなかった`);
}

/** 端末が「じぶんが出した企画」を覚えている（ログインしていない人の証） */
async function mkCtx(b, { admin = true, memo = true } = {}) {
  const ctx = await newCtx(b, { admin, mode: "ok", memo });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-myplans", JSON.stringify(["p-mine"]));
    } catch {}
  });
  await seed(ctx);
  return ctx;
}

const CASES = [
  { tag: "ふつう", mode: "ok", which: ALL },
  { tag: "abort-ぜんぶ", mode: "abort", which: ALL },
  { tag: "503-ぜんぶ", mode: "503", which: ALL },
  { tag: "おそい45秒-ぜんぶ", mode: "slow", which: ALL },
  { tag: "abort-写真だけ", mode: "abort", which: PHOTOS_ONLY },
  { tag: "abort-カードだけ", mode: "abort", which: CARDS_ONLY },
  { tag: "おそい45秒-写真だけ", mode: "slow", which: PHOTOS_ONLY },
  { tag: "おそい45秒-カードだけ", mode: "slow", which: CARDS_ONLY },
];

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const tag = process.env.TAG ? `${process.env.TAG}-` : "";
const pages = process.env.PAGES ? process.env.PAGES.split(",") : null;
/** `cases`（落とし方だけ）/ `revive`（戻したときだけ）。既定は両方 */
const part = process.env.PART || "";

const b = await launch();

for (const who of part === "revive" ? [] : [true, false]) {
  for (const c of CASES) {
    if (only && !only.includes(c.tag)) continue;
    /* 片方の口だけ落とす回は、カードの壁でしか意味が無い（他は口が1つ） */
    const some = c.which !== ALL;
    const ctx = await mkCtx(b, { admin: who, memo: who });
    await drop(ctx, c.which, c.mode);
    for (const [path, name] of PAGES) {
      if (some && name !== "cards") continue;
      if (pages && !pages.includes(name)) continue;
      const p = await openPage(ctx, path, { wait: c.mode === "slow" ? 47000 : 15000 });
      const label = `${who ? "あやと" : "視聴者"}-${c.tag}`;
      console.log(`${label.padEnd(26)} ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
      if (p.__errs.length)
        console.log(`${" ".repeat(26)} ${name.padEnd(7)} JSエラー: ${p.__errs.join(" / ")}`);
      await p.screenshot({ path: `${OUT}/${tag}${name}-${label}.png`, fullPage: true });
      await p.close();
    }
    await ctx.close();
  }
}

/* ---- 通信が戻ったら、画面を開き直さずに直るか（押す） ---- */
if (part !== "cases") {
  for (const [path, name, word] of PAGES) {
    if (pages && !pages.includes(name)) continue;
    const ctx = await mkCtx(b, {});
    const box = await drop(ctx, ALL, "abort");
    const p = await openPage(ctx, path, { wait: 15000 });
    console.log(`もどす前 ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
    await p.screenshot({ path: `${OUT}/${tag}もどす-1-${name}-落ちている.png`, fullPage: true });
    box.mode = "ok";
    revive(ctx);
    await press(p, word);
    await p.waitForTimeout(6000);
    console.log(`もどした後 ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
    await p.screenshot({ path: `${OUT}/${tag}もどす-2-${name}-押したあと.png`, fullPage: true });
    await p.close();
    await ctx.close();
  }

  /* ---- 押さずに、電波が戻っただけで直るか（`online` の合図） ---- */
  for (const [path, name] of PAGES) {
    if (pages && !pages.includes(name)) continue;
    const ctx = await mkCtx(b, {});
    const box = await drop(ctx, ALL, "abort");
    const p = await openPage(ctx, path, { wait: 15000 });
    box.mode = "ok";
    revive(ctx);
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await p.waitForTimeout(6000);
    console.log(`ひとりでに ${name.padEnd(7)} ${JSON.stringify(await peek(p))}`);
    await p.screenshot({ path: `${OUT}/${tag}もどす-3-${name}-押さずに戻った.png`, fullPage: true });
    await p.close();
    await ctx.close();
  }
}

await b.close();
