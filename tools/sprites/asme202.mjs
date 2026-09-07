/**
 * #202 の画面を撮るための差し込み口。
 *
 * `tools/sprites/asme.mjs` に乗せて、新しい口だけを足す。
 *   - GET  /streamevents?day=…       その日の企画（1本 / 4本 / 0本）
 *   - GET  /nextplans?events=1       運営側の企画も混ぜた一覧
 *   - POST /nextplans/{id}/videos    送った一覧で置き換わる
 *   - POST /me                       islandChannels.photo（channelPhoto）
 *
 * **本番の Firestore には触らせない。** ここで全部返す。
 */
import { apply as base } from "./asme.mjs";

const UID = "fakeuid0001";
const NAME = "ゆずたつ";
const PHOTO = "https://lh3.googleusercontent.com/d/1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47=s96";
const CHANNEL = "UCyct2GK_RiW5Ji3Y0gd9MMg";

/** 本番の 2026-09-11（4本）・09-06（1本）・09-08（0本）そのまま。 */
const DAYS = {
  "2026-09-11": [
    { id: "georgia-bye", title: "ジョージアバイバイ", date: "2026-09-11" },
    { id: "japan-2years", title: "海外出発二周年記念日", date: "2026-09-11" },
    { id: "nordic", title: "ヒッチハイクで北欧へ", date: "2026-09-11" },
    { id: "nordic-day-depart", title: "北欧旅 出発 — トビリシからクタイシ、夜の便でポーランドへ", date: "2026-09-11" },
  ],
  "2026-09-06": [
    { id: "food-wine-fest", title: "Food & Wine Fest @ ムタツミンダ公園", date: "2026-09-06" },
  ],
};

const plan = (o) => ({
  when: "", date: "", note: "", tags: [], place: { name: "", area: "", map: "" },
  about: [], links: [], photos: [], embeds: [], hearts: 0, status: "next",
  videoIds: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...o,
});

/** 本番の 16件（企画14 + 提案2）。`food-wine-fest` に配信が2本。 */
let EVENTS = [
  plan({ id: "food-wine-fest", title: "Food & Wine Fest @ ムタツミンダ公園", date: "2026-09-06", videoIds: ["q30MlzefQ8c", "2eQ9F-vml24"] }),
  plan({ id: "georgia-bye", title: "ジョージアバイバイ", date: "2026-09-11" }),
  plan({ id: "japan-2years", title: "海外出発二周年記念日", date: "2026-09-11" }),
  plan({ id: "nordic", title: "ヒッチハイクで北欧へ", date: "2026-09-11" }),
  plan({ id: "nordic-day-depart", title: "北欧旅 出発 — トビリシからクタイシ、夜の便でポーランドへ", date: "2026-09-11" }),
  plan({ id: "nordic-day-1", title: "北欧旅 1日目 — カトヴィツェからワルシャワへ", date: "2026-09-12" }),
  plan({ id: "nordic-day-2", title: "北欧旅 2日目 — ワルシャワからビャウィストクへ", date: "2026-09-13" }),
  plan({ id: "nordic-day-3", title: "北欧旅 3日目 — ビャウィストクからヴィリニュスへ", date: "2026-09-14" }),
  plan({ id: "nordic-day-4", title: "北欧旅 4日目 — ヴィリニュスで休息日", date: "2026-09-15" }),
  plan({ id: "nordic-day-5", title: "北欧旅 5日目 — ヴィリニュスからリガへ", date: "2026-09-16" }),
  plan({ id: "nordic-day-6", title: "北欧旅 6日目 — リガからタリンへ", date: "2026-09-17" }),
  plan({ id: "nordic-day-7", title: "北欧旅 7日目 — タリンからヘルシンキへ", date: "2026-09-18" }),
  plan({ id: "nordic-day-8", title: "北欧旅 8日目 — ヘルシンキからトゥルク、夜行フェリー", date: "2026-09-19" }),
  plan({ id: "nordic-day-9", title: "北欧旅 9日目 — ストックホルム到着", date: "2026-09-20" }),
  plan({ id: "nU5CtD9pWp97KeGtgK09", title: "ジョージアバイバイ", date: "2026-09-11", status: "proposed", by: "まこも" }),
  plan({ id: "V1ec66X2kj3p2ZqlX0Gt", title: "海外出発二周年記念日", date: "2026-09-11", status: "proposed", by: "のり" }),
];

/** 本番の3枚（ひめひめ / aoi / たぃ）と同じ形。9/11 の4本を見るために1枚足す。 */
const IMG = "https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app/o/x.jpeg";
const card = (id, chan, day, ev) => ({
  id, day, photoId: id.split("__")[0], url: IMG, w: 1200, h: 1600,
  note: "ジョージア最後の街歩きの夜景", channelId: chan, icon: null, name: null,
  x: 0.82, y: 0.92, rot: 2.4, scale: 1.0, moved: false, at: 1788724247800,
  streamEventId: ev,
});
const CARDS = [
  card("depart01__UCyct2GK_RiW5Ji3Y0gd9MMg", CHANNEL, "2026-09-11", "nordic-day-depart"),
  card("oMXREHFFNMbr37TtIwlE__UCyct2GK_RiW5Ji3Y0gd9MMg", CHANNEL, "2026-09-06", "food-wine-fest"),
];

export async function apply(ctx, opts = {}) {
  await base(ctx, opts);
  const admin = opts.admin ?? process.env.ADMIN === "1";
  const json = (r, body) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await ctx.route(/\/island-api\//, (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/island-api", "");
    const method = r.request().method();
    if (path === "/me") {
      return json(r, {
        uid: UID, name: NAME, channelId: CHANNEL, photo: PHOTO,
        // 日次で入れ直る YouTube のプロフィール写真（#202）
        channelPhoto: PHOTO,
        nickname: null, showName: true, showPhoto: true, admin,
      });
    }
    if (path === "/streamevents") {
      const day = u.searchParams.get("day") || "";
      return json(r, { day, events: DAYS[day] ?? [] });
    }
    if (path === "/nextplans" && u.searchParams.get("events") === "1") {
      return json(r, { plans: EVENTS, more: false, next: null });
    }
    const vid = /^\/nextplans\/([A-Za-z0-9_-]+)\/videos$/.exec(path);
    if (vid && method === "POST") {
      let body = {};
      try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      const ids = (body.videoIds || []).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x));
      EVENTS = EVENTS.map((p) => (p.id === vid[1] ? { ...p, videoIds: ids } : p));
      return json(r, { plan: EVENTS.find((p) => p.id === vid[1]) });
    }
    if (path === "/cards") return json(r, { cards: CARDS });
    return r.fallback();
  });
}
