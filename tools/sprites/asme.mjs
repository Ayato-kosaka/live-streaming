/**
 * ログインした人として撮るための差し込み口（`SEED=` に渡す）。
 *
 *   SEED=/home/user/live-streaming/tools/sprites/asme.mjs \
 *   PORT=4510 PAGES=/me.html TAG=me node tools/sprites/inkpx.mjs
 *   ADMIN=1 SEED=.../asme.mjs PORT=4510 URLS=/me.html node tools/sprites/popcheck.mjs
 *
 * **この箱では本物のログインができない。** Google の同意画面にも
 * `identitytoolkit.googleapis.com` にも出られないので、じぶんのこと（`/me`）は
 * 測ろうとすると「ここは、入った人のところ」しか写らない。**面の9割が測れない。**
 *
 * かわりに、Firebase が持ち帰る「前に入った人」の控え（IndexedDB の
 * `firebaseLocalStorageDb`）を、開く前に自分で置く。SDK はそれを見て
 * 「入っている人」として始まるので、そこから先は本番と同じ道を通る。
 * 島の API（`/island-api/...`）は、この箱から本番に書かせないためにも
 * ぜんぶここで差し替える。
 *
 * `ADMIN=1` を付けると、あやと（`admin`）として撮る。旅の道具が出る。
 *
 * ルーレット（#164）の口もここで返す。**表示側（`/roulette?s=…`）は
 * ログインが要らない**ので、`apply` を呼ぶだけで撮れる。
 * `RLSPIN=1` を付けると、開いた 1.2 秒あとに回りだすところから撮れる。
 */
const KEY = "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM";
const UID = "fakeuid0001";
const NAME = "ゆずたつ";
/** 本番と同じ形の絵。`route.mjs` の `offline` が /tmp/avatars から1人ずつ返す */
const PHOTO = "https://lh3.googleusercontent.com/d/1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47=s96";
/** 上の絵に割り当ててあるチャンネル（`site/content/residents.ts`） */
const CHANNEL = "UCyct2GK_RiW5Ji3Y0gd9MMg";

const now = Date.now();
const ago = (d) => new Date(now - d * 86400000).toISOString();

const MINE = {
  notes: [
    { id: "a1", theme: "nordic", text: "北の国はクラクション少ない説を立証する", by: NAME, hearts: 3, byOwner: false, reply: "やります。1日目から数えてみる。", repliedAt: ago(1), createdAt: ago(2) },
    { id: "a2", theme: "island", text: "島に温泉がほしい", by: NAME, hearts: 0, byOwner: false, createdAt: ago(5) },
  ],
  more: false,
  next: null,
};
const ALL = {
  notes: [
    { id: "b1", theme: "nordic", text: "友達へのプレゼントを決める", by: "まこも", hearts: 2, byOwner: false, createdAt: ago(1) },
    { id: "b2", theme: "island", text: "LINEのグループを作ってほしい", by: "のり", hearts: 1, byOwner: false, createdAt: ago(2) },
    { id: "b3", theme: "kitchen", text: "現地の粉でおやき", by: "", hearts: 0, byOwner: false, createdAt: ago(3) },
  ],
  more: false,
  next: null,
};
const plan = (o) => ({
  when: "", date: "", note: "", tags: [], place: { name: "", area: "", map: "" },
  about: [], links: [], photos: [], embeds: [], hearts: 0, status: "proposed",
  createdAt: ago(3), updatedAt: ago(3), ...o,
});
const PLANS = {
  plans: [
    plan({ id: "p1", title: "1日だけ、現地の人の家に泊まる", by: NAME, byUid: UID, hearts: 4 }),
    plan({ id: "p2", title: "視聴者が決めた道を、ヴィリニュスまで", by: "まこも", hearts: 9, status: "next", planId: "nordic", createdAt: ago(9) }),
  ],
  more: false,
  next: null,
};

/** ルーレットのセッション（#164）。id は本番と同じ 32 桁。 */
const RL_ID = "0123456789abcdef0123456789abcdef";
const rlItem = (id, label, name, byHand = false) => ({
  id, label, name: byHand ? "" : name, icon: byHand ? "" : PHOTO, byHand,
});
let RL_ITEMS = [
  rlItem("c1", "トビリシの温泉", "まこも"),
  rlItem("c2", "ヒッチハイクで隣の国", "のり"),
  rlItem("c3", "24時間クッキング", "ゆずたつ"),
  rlItem("c4", "視聴者の家に泊まる", "まこも"),
  rlItem("c5", "深夜の市場めぐり", "", true),
];
const RL_LINES = [
  { id: "m1", name: "まこも", text: "山に登るのはどう", icon: PHOTO, channelId: "c", at: now },
  { id: "m2", name: "のり", text: "地元の市場で買い物", icon: PHOTO, channelId: "c", at: now },
  { id: "m3", name: "ゆずたつ", text: "ワイン作りを見にいく", icon: PHOTO, channelId: "c", at: now },
  { id: "m4", name: "まこも", text: "温泉！", icon: PHOTO, channelId: "c", at: now },
];

export async function apply(ctx, opts = {}) {
  const admin = opts.admin ?? process.env.ADMIN === "1";
  const json = (r, body) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  // 前に入った人を読み直すところ。**本番には出さない**（この箱から出られない）
  await ctx.route(/identitytoolkit\.googleapis\.com/, (r) =>
    json(r, {
      users: [{
        localId: UID, displayName: NAME, photoUrl: PHOTO, email: "a@example.com",
        emailVerified: true, providerUserInfo: [], validSince: "0",
        lastLoginAt: "1600000000000", createdAt: "1600000000000",
      }],
    }),
  );
  await ctx.route(/securetoken\.googleapis\.com/, (r) =>
    json(r, {
      access_token: "FAKE", expires_in: "3600", token_type: "Bearer",
      refresh_token: "FAKE_REFRESH", id_token: "FAKE", user_id: UID,
      project_id: "291182823114",
    }),
  );
  await ctx.route(/\/island-api\//, (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/island-api", "");
    if (path === "/me") {
      return json(r, {
        uid: UID, name: NAME, channelId: CHANNEL, photo: PHOTO,
        nickname: null, showName: true, showPhoto: true, admin,
      });
    }
    if (path === "/stickies") {
      return json(r, u.searchParams.get("mine") === "1" ? MINE : ALL);
    }
    if (path === "/nextplans") return json(r, PLANS);
    if (path === "/nordic/log") return json(r, { log: [] });
    if (path.startsWith("/roulette")) {
      const spin = opts.spin ?? process.env.RLSPIN === "1";
      const at = Date.now() + 1200;
      const ses = {
        id: RL_ID, status: spin ? "回っている" : "準備中", items: RL_ITEMS,
        wait: 10, duration: 15, turns: 10, theme: "classic", sound: false,
        result: spin ? RL_ITEMS[1].id : null, resultIndex: spin ? 1 : null,
        spunAt: spin ? at : null, postAt: spin ? at + 25000 : null,
        posted: false, updatedAt: spin ? 1 : 2,
      };
      if (path.endsWith("/comments")) {
        // 2回目からは空。撮るたびに増えると、撮った絵が毎回変わる
        const first = !ctx.__rlSeen;
        ctx.__rlSeen = true;
        return json(r, { lines: first ? RL_LINES : [], wait: 600000, live: true });
      }
      if (path.endsWith("/items")) {
        try {
          RL_ITEMS = JSON.parse(r.request().postData() || "{}").items ?? RL_ITEMS;
        } catch {}
        return json(r, { session: { ...ses, items: RL_ITEMS } });
      }
      if (path.endsWith("/start")) return json(r, { session: ses, live: true });
      return json(r, { session: ses, now: Date.now() });
    }
    if (path === "/state") {
      return json(r, {
        current: { place: "ジョージア・トビリシ", theme: "georgia", word: "トビリシにいます。", week: [], updatedAt: "2026-09-04" },
        stats: {}, ideas: [], notes: [], residents: [], nordic: {},
      });
    }
    return json(r, {});
  });

  await ctx.addInitScript(
    ({ KEY, user }) => {
      try {
        localStorage.setItem("ayato-island-signedin", "1");
      } catch {}
      const req = indexedDB.open("firebaseLocalStorageDb", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("firebaseLocalStorage", "readwrite");
        tx.objectStore("firebaseLocalStorage").put({
          fbase_key: `firebase:authUser:${KEY}:[DEFAULT]`,
          value: user,
        });
      };
    },
    {
      KEY,
      user: {
        uid: UID,
        email: "a@example.com",
        emailVerified: true,
        displayName: NAME,
        isAnonymous: false,
        photoURL: PHOTO,
        providerData: [
          { providerId: "google.com", uid: "1", displayName: NAME, email: "a@example.com", phoneNumber: null, photoURL: PHOTO },
        ],
        // 期限を先にしておくと、開いた瞬間に取り直しにいかない
        stsTokenManager: { refreshToken: "FAKE_REFRESH", accessToken: "FAKE_ACCESS", expirationTime: now + 3600000 },
        createdAt: "1600000000000",
        lastLoginAt: "1600000000000",
        apiKey: KEY,
        appName: "[DEFAULT]",
      },
    },
  );
}
