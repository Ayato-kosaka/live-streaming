/**
 * `/board`（掲示板）を、**口が返す中身ごと**撮り分けるための差し込み口。
 *
 *   import { seedBoard } from "./boardseed.mjs";
 *   await seedBoard(ctx, { mode: "ok" });
 *
 * ## なぜ要るのか
 *
 * 静的に配った書き出しには `/island-api/*` が無い。何も差し込まないと
 * 掲示板は**どちらの札も「読みに行けなかった」**になり、企画を書く欄も、
 * 付箋を書く欄も、ハートも、ひとつも出ない。
 * つまり**その形でいくら測っても、視聴者さんが書く場所は1つも測れていない。**
 *
 * `asme.mjs` にも同じ口があるが、あちらは**ログインした人**として開く器で、
 * 「入っていない人が板を読む」がいちばん多い姿なのに、それだけは作れない。
 * ここは**入っていない人＋口は生きている**を作る。
 * 入っている人・あやととして撮るときは `asme.mjs` を使う（この道具は使わない）。
 *
 * mode:
 *   "ok"    企画も付箋も並んでいる（本番に近い）
 *   "empty" 読めた上での0件（空札が出る）
 *   "wait"  返らない（灰色の骨のまま）
 *
 * **値は本番の形に合わせる。** 形が違うと画面が「読めなかった」に倒れて、
 * 測ったつもりの場面が別の場面になる（`docs/island-misses.md` #79）。
 * 場面が作れたかどうかは、呼ぶ側（`boardsweep.mjs`）が印で確かめる。
 */

const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();
const H = 3600000;

/** 出された企画。**溜まった形で置く。** 4件しか置かないと「あと◯件だす」が出ない */
const PLAN_TITLES = [
  "1日だけ、現地の人の家に泊まる",
  "視聴者が決めた道を、ヴィリニュスまで",
  "国境の街で、そこにしかない朝ごはんを食べる",
  "1週間ぶんの服を、現地で全部そろえる",
  "地元のラジオ局に飛び込みで入ってみる",
  "みんなで作った歌を、広場で流す",
  "サウナのあとに湖へ飛び込む回",
  "24時間、島のみんなの指示だけで動く",
  "夜行列車で国をまたぐところを丸ごと",
  "帰りの空港で、この旅をふりかえる",
];
const BY = ["まこも", "のり", "ひめひめ", "", "KURA"];

const plan = (o) => ({
  when: "", date: "", note: "", tags: [],
  place: { name: "", area: "", map: "" },
  about: [], links: [], photos: [], embeds: [],
  hearts: 0, status: "proposed",
  createdAt: ago(3 * 24 * H), updatedAt: ago(3 * 24 * H), ...o,
});

/** 端末の控え（`ayato-island-myplans`）に入れる id。**「じぶんの」の札はこれで出る** */
export const MY_PLAN_ID = "p-mine";

export const PLANS = [
  /* 出したばかりの、自分の1件。**1日以内なので「くわしく書く」が出る**
     （`canEditPlan`）。ここを古い日付にすると、直せない側の字しか出ない */
  plan({ id: MY_PLAN_ID, title: "島に温泉がほしい", by: "ゆずたつ", hearts: 2, createdAt: ago(1 * H), updatedAt: ago(1 * H) }),
  ...PLAN_TITLES.map((title, i) =>
    plan({
      id: `p${i + 1}`,
      title,
      by: BY[i % BY.length],
      hearts: [4, 9, 0, 2, 15, 1, 6, 0, 3, 8][i % 10],
      status: ["proposed", "next", "proposed", "done", "proposed"][i % 5],
      /* 立っているページを結び付ける（「◯◯のページへ」の札が出る）。
         **はじめの4件に入るものへ付ける。** 板は4件だけ出して残りは押して出す
         （`Longer`）ので、段の進んだものにだけ付けると、押して出すまで
         その札が1つも画面に無く、**測ったつもりで測れない。** */
      ...(i === 0 || i % 5 === 1 ? { planId: "nordic" } : {}),
      createdAt: ago((i + 3) * 24 * H),
    }),
  ),
];

/** 島じゅうの付箋。**宛先を散らす。** 1つに寄せると空の棚が作れない */
const NOTE_TEXTS = [
  "北の国はクラクション少ない説を立証する",
  "現地のスーパーで、いちばん謎な物を買って食べる",
  "配信のはじめに、その日の朝ごはんを見せてほしい",
  "夜の市場を、しゃべらずに30分だけ歩く回",
  "その国でいちばん高いところに登って、街を見下ろす",
  "駅の待合室で、隣に座った人に話しかけてみる",
  "1日ぜんぶ、公共交通だけで動く縛り",
  "地元の床屋に入って、おまかせで切ってもらう",
  "コインランドリーで洗濯が終わるまでの雑談回",
  "地図を見ずに、聞いた道だけで宿まで帰る",
];
/* **`nordic` に厚く積む。** 掲示板が最初に開く棚がここなので、
   「あと◯枚だす」も、返信つきの背の高い付箋も、ここでしか出ない。
   `poland` は空のまま残す（空札「いちばんに貼る」を撮るため）。 */
const NOTE_THEMES = ["nordic", "nordic", "nordic", "nordic", "nordic", "nordic", "nordic", "island", "island", "kitchen"];

export const NOTES = NOTE_TEXTS.map((text, i) => ({
  id: `n${i + 1}`,
  theme: NOTE_THEMES[i],
  text,
  by: BY[i % BY.length],
  hearts: [1, 9, 0, 3, 22, 0, 5, 2, 0, 11][i % 10],
  byOwner: i === 0,
  // 3枚に1枚は返事つき。**返事のある付箋がいちばん背が高い**
  ...(i % 3 === 0 ? { reply: "やります。1日目から数えてみる。", repliedAt: ago((i + 1) * 24 * H) } : {}),
  createdAt: ago((i + 1) * 24 * H),
}));

/** 今夜のおたずね。押した控えがあると、掲示板に「その続きから書く」の橋が出る */
export const POLL = {
  id: "poll-1",
  question: "北欧の1日目、どっちを見たい？",
  options: [
    { id: "o1", label: "朝の市場", votes: 12 },
    { id: "o2", label: "夜の路面電車", votes: 7 },
  ],
  total: 19,
  openUntil: null,
};

/**
 * 口を差し込む。**押した結果も返す**（出す・貼る・ハート・段を動かす）。
 * 返さないと、押したあとの場面（「出せました」の下の「くわしく書く」）が作れない。
 */
export async function seedBoard(ctx, opts = {}) {
  const mode = opts.mode ?? "ok";
  const json = (r, body) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  const empty = mode === "empty";

  await ctx.route(/\/island-api\//, async (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/island-api", "");
    const method = r.request().method();

    /* 絵は差し替えない（`route.mjs` の `offline` に任せる）。
       ここで JSON を返すと、島の住人もキャラクターも消える */
    if (/\.(webp|png|jpe?g|svg)$/.test(path)) return r.fallback();

    /* 読む口だけを落とす。**押す口は落とさない。**
       押した結果が出ないのは別の話で、ここでは場面が作れなくなるだけ */
    if (mode === "wait" && method === "GET") {
      await new Promise(() => {});
      return;
    }

    if (path === "/nextplans" && method === "GET") {
      const archived = u.searchParams.get("archived") === "1";
      return json(r, { plans: empty ? [] : archived ? PLANS.slice(0, 2) : PLANS, more: false, next: null });
    }
    if (path === "/stickies" && method === "GET") {
      return json(r, { notes: empty ? [] : NOTES, more: false, next: null });
    }
    if (path === "/poll") return json(r, { poll: opts.poll ? POLL : null });

    // 出す・貼る。返す形は本番と同じ（画面はこれを一覧の頭に足す）
    if (path === "/nextplans" && method === "POST") {
      let body = {};
      try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      return json(r, { plan: plan({ id: "p-new", title: body.title || "出したもの", by: body.by || "", hearts: 0, createdAt: new Date().toISOString() }) });
    }
    if (path === "/stickies" && method === "POST") {
      let body = {};
      try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      return json(r, { note: { id: "n-new", theme: body.theme || "nordic", text: body.text || "貼ったもの", by: body.by || "", hearts: 0, byOwner: false, createdAt: new Date().toISOString() } });
    }
    if (/\/heart$/.test(path)) return json(r, { hearts: 1, on: true });
    if (/\/status$/.test(path)) return json(r, { plan: PLANS[0] });
    if (/\/archive$/.test(path)) return json(r, { id: "p1", archived: true });
    if (/\/reply$/.test(path)) return json(r, { reply: "ありがとう", repliedAt: new Date().toISOString() });

    /* ここに来るのは掲示板の外の口（`/state` など）。**空の JSON を返さない。**
       返すと、島の看板や住人が「読めた上での0件」になって別の面が壊れる */
    return r.fallback();
  });
}
