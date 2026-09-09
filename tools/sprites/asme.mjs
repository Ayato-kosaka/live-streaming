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

/**
 * Doneru の対応表（#190）。**あやとの画面でしか出ない。**
 *
 * 本番の口は名前からチャンネルIDを引くが（島の名簿 → YouTube）、
 * この箱からはどちらにも出られない。**打った字で返事を決める。**
 *   `@ふたご`   … 2人に使われている（決めない）
 *   `@いない…`  … 見つからない
 *   それ以外     … つながる
 */
let DONORS = [
  { viewerPk: "117763460062995449096", label: "きのう来た人", handle: null, channelId: null, channelName: null, state: "new", isOwner: false, note: null, firstSeenAt: ago(1), editedAt: null, canDelete: false },
  { viewerPk: "115344581653245733797", label: "KURA ekisu", handle: null, channelId: null, channelName: null, state: "new", isOwner: false, note: null, firstSeenAt: ago(4), editedAt: null, canDelete: false },
  { viewerPk: "114910762433928193967", label: "信州檸檬", handle: null, channelId: null, channelName: null, state: "unlinked", isOwner: false, note: null, firstSeenAt: null, editedAt: ago(20), canDelete: false },
  { viewerPk: "101760203751954301886", label: null, handle: "@ひめひめ-r9z", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", channelName: "@ひめひめ-r9z", state: "linked", isOwner: false, note: null, firstSeenAt: null, editedAt: null, canDelete: false },
  { viewerPk: "103311111111111111111", label: null, handle: "@まーさん7286", channelId: "UCbbbbbbbbbbbbbbbbbbbbbb", channelName: "@まーさん7286", state: "linked", isOwner: false, note: null, firstSeenAt: null, editedAt: null, canDelete: false },
];

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

/* ---------------- あやと島カード（#173 / #202） ----------------
   **本番の形をそのまま置く。** 本番はいま1枚の写真に4人ぶんだが、旅に出れば
   1日に写真が何枚も貼られて、投げてくれた人ぶんカードが増える
   （写真3枚 × 12人 = 36枚）。**一覧が散らかるのはそこから**なので、
   撮るときは増えた側の形で撮る。

   持ち主は `site/content/residents.ts` にある実在のチャンネルから採る。
   絵に結びつかない人のカードは画面に出ない（`components/cards/cards.ts`）ので、
   でたらめな ID を並べると1枚も写らない。 */
const CARD_CHANNELS = [
  "UCNTxy7hXktoG4V6jT6A3M9A", "UCTXgxriwnTlJ0y1tff0yU5A", "UCEw49OqT87MZEDQJVkjWNRA",
  "UCJPDZ4SQYonw3vZvyxVKrjg", "UCHdRx9BTg6q_SF5y-4Wg5WQ", "UCfhX-rOzBe-QhWPPv03FtQA",
  "UCbz2F3GGD_EpBzrWb8WM-cg", "UCceC2uQXoN9wt2POovos37Q", "UCsBjGz8D3lLxUhV_eNxN0CQ",
  "UCaHTatQmUMV4TEkSDIeSzHw", "UCn4EuDFdAfeYGhuFOxpj-NA", CHANNEL,
];
/** 名前を出してよいと言った人だけ名前が返る。全員ぶん返すと本番と違う */
const CARD_NAMES = { [CHANNEL]: NAME, "UCTXgxriwnTlJ0y1tff0yU5A": "まこも" };
const SHOT = (id) =>
  `https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app/o/nordic%2Fphotos%2F${id}.jpeg?alt=media`;
/** 本番の3枚ぶん。縦と横を混ぜる（カードの絵の載せ方が向きで変わるため） */
const CARD_SHOTS = [
  { id: "oMXREHFFNMbr37TtIwlE", day: "2026-09-06", ev: "food-wine-fest", w: 1200, h: 1600, note: "ジョージア最後の街歩きの夜景" },
  { id: "kQ2rTn5wY8bLxA1cVdEf", day: "2026-09-11", ev: "nordic-day-depart", w: 1600, h: 1200, note: "クタイシ空港へ向かう朝" },
  { id: "p7XsWq0ZmB4nCtL9hRyU", day: "2026-09-11", ev: "georgia-bye", w: 1200, h: 1600, note: "トビリシの部屋、最後の荷造り" },
];
/** 置き方は本番と同じ式（`functions/src/streamEvents.ts` の `defaultPlace`）で散らす */
const spread = (id, k) => {
  let h = (0x811c9dc5 ^ (k * 0x9e3779b9)) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 100000) / 100000;
};
const CARDS = CARD_SHOTS.flatMap((s) =>
  CARD_CHANNELS.map((chan, n) => {
    const id = `${s.id}__${chan}`;
    return {
      id, day: s.day, photoId: s.id, url: SHOT(s.id), w: s.w, h: s.h, note: s.note,
      channelId: chan, icon: null, name: CARD_NAMES[chan] ?? null,
      x: 0.62 + spread(id, 0) * 0.26,
      y: 0.88 + spread(id, 1) * 0.08,
      rot: -4 + spread(id, 2) * 8,
      scale: 0.92 + spread(id, 3) * 0.16,
      moved: false, at: 1788724247800 - n, streamEventId: s.ev,
    };
  }),
);

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
  /* カードの写真は Firebase Storage にある。**この箱からは出られない。**
     1枚に潰すと3枚が同じ絵で写って、写真ごとにまとまっているかが見えないので、
     写真のIDから色を決めて1枚ずつ違う絵を返す。`crossOrigin="anonymous"` で
     読むので、CORS のヘッダを付けないと絵が出ない。 */
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) => {
    const m = /photos%2F([^.]+)\.jpe?g/.exec(r.request().url());
    const key = m ? m[1] : "x";
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
      <rect width="1200" height="1600" fill="hsl(${h},42%,38%)"/>
      <rect y="1100" width="1200" height="500" fill="hsl(${(h + 24) % 360},38%,26%)"/>
      <circle cx="900" cy="320" r="150" fill="hsl(${(h + 40) % 360},60%,72%)"/>
    </svg>`;
    r.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: svg,
    });
  });

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
    if (path.startsWith("/donors")) {
      if (r.request().method() === "GET") return json(r, { donors: DONORS });
      const pk = decodeURIComponent(path.slice("/donors/".length));
      if (r.request().method() === "DELETE") {
        DONORS = DONORS.filter((d) => d.viewerPk !== pk);
        return json(r, { deleted: pk });
      }
      let body = {};
      try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      const typed = String(body.handle || "").trim();
      if (!body.clear && typed === "@ふたご") {
        return r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "duplicate", typed }) });
      }
      if (!body.clear && typed.startsWith("@いない")) {
        return r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "notfound", typed }) });
      }
      const had = DONORS.find((d) => d.viewerPk === pk);
      const via = body.clear ? null : /^UC[\w-]{22}$/.test(typed) ? "id" : "dict";
      const donor = {
        ...(had || { viewerPk: pk, label: null, isOwner: false, note: null, firstSeenAt: null, canDelete: true }),
        handle: body.clear ? null : typed,
        channelId: body.clear ? null : "UCcccccccccccccccccccccc",
        channelName: body.clear ? null : typed,
        state: body.clear ? "unlinked" : "linked",
        editedAt: new Date().toISOString(),
      };
      DONORS = had ? DONORS.map((d) => (d.viewerPk === pk ? donor : d)) : [donor, ...DONORS];
      return json(r, { donor, via });
    }
    if (path === "/cards") return json(r, { cards: CARDS });
    if (path === "/nordic/log") return json(r, { log: [] });
    /* アラートボックスの合言葉（#180）。**本物の32桁と同じ形にする。**
       画面は `?k=` を貼る URL を組み立てて出すだけなので、形が違うと
       出てくる URL が本番と別物になり、押しどころも幅も測れない。 */
    if (path === "/alertbox/session") {
      return json(r, {
        id: "0123456789abcdef0123456789abcdef",
        doneru: { set: true, tail: "7f3a" },
      });
    }
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
