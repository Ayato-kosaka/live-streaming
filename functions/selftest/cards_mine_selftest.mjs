/**
 * `GET /cards/mine` の確かめ。**偽のチャンネルと偽の字だけで回す。**
 *
 * ## 何を見ているか
 *
 * 誰でも読める `GET /cards` は、1枚ごとに `channelId` と `day` を返す。
 * カードは投げ銭の台帳からしか作られないので、**それは「どのチャンネルが、
 * どの日に投げ銭したか」の一覧**と同じもの。`/me` が自分の1枚を出すために
 * 全員ぶんを受け取って手元で絞っていた。絞る場所をサーバーへ寄せたのが
 * `GET /cards/mine` で、ここはその口が本当に絞れているかを見る。
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * チャンネルIDは、それ自体が「投げ銭した人の名簿」**なので、出力に出さない。
 * 出てくるのは仕込んだ `UC_me_0000001` `UC_other_00001` だけ。
 *
 * ## なぜ口（`islandApi.ts`）から叩かないか
 *
 * `islandApi.ts` を読み込むと `onRequest` の登録まで走るし、本番の資格情報は
 * この箱に無い。かわりに `tsc` が書き出した `lib/cards.js` を、**偽の
 * firebase-admin を渡して**読み込む。写しは持たない（写しを置くと、本体を
 * 直したのに確かめが古いまま通る）。`lib/streamEvents.js` と
 * `lib/islandCharacter.js` は**本物をそのまま**通す。
 *
 * ## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）
 *
 * 「他人のカードが0件」は、**カードが1枚も返っていなくても0件**になる。
 * だから先に、同じ偽データを公開の `GET /cards` に通して**他人のカードが
 * ちゃんと出ること**を確かめてから、`/cards/mine` で消えることを見る。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/cards_mine_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");

/** 合否。1つでも落ちたら終了コード1で出る */
let bad = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} ok 通ったか
 * @param {string} [why] 落ちたときに出す中身（**偽の字だけ**）
 */
function check(name, ok, why = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 偽の Firestore ---------------- */

/** 入れ物の中身。コレクション名 → 書類ID → 中身。**ぜんぶ偽の字。** */
const STORE = {
  islandCards: {
    // 自分のぶん2枚
    "img_0000001__UC_me_0000001": {
      channelId: "UC_me_0000001",
      day: "2026-09-11",
      streamEventImageId: "img_0000001",
      earnedAt: 300,
    },
    "img_0000002__UC_me_0000001": {
      channelId: "UC_me_0000001",
      day: "2026-09-12",
      streamEventImageId: "img_0000002",
      earnedAt: 200,
    },
    // 他人のぶん2枚。**これが `/cards/mine` から消えることを見る**
    "img_0000001__UC_other_00001": {
      channelId: "UC_other_00001",
      day: "2026-09-11",
      streamEventImageId: "img_0000001",
      earnedAt: 290,
    },
    "img_0000003__UC_other_00002": {
      channelId: "UC_other_00002",
      day: "2026-09-10",
      streamEventImageId: "img_0000003",
      earnedAt: 100,
    },
  },
  islandStreamEventImage: {
    img_0000001: {
      url: "https://example.invalid/1.jpg",
      w: 4, h: 3, note: "さくら", at: 300, streamEventId: "ev1", role: "card",
    },
    img_0000002: {
      url: "https://example.invalid/2.jpg",
      w: 4, h: 3, note: "さくら", at: 200, streamEventId: "ev1", role: "card",
    },
    img_0000003: {
      url: "https://example.invalid/3.jpg",
      w: 4, h: 3, note: "にせもの", at: 100, streamEventId: "ev2", role: "card",
    },
  },
  islandUsers: {
    // ログインした人。**合言葉が言う channelId とはわざと別の値を置く**
    "uid-me": {channelId: "UC_me_0000001"},
    // チャンネルを結んでいない人
    "uid-nochan": {name: "にせもの"},
  },
  islandChannels: {},
  islandCharacter: {},
};

/** 何回 Firestore を叩いたか。余計に往復していないかを見る */
const hits = {get: 0, query: 0, getAll: 0};

/**
 * 書類1件の姿。`exists` / `data()` / `get(欄)` だけ。
 * @param {string} id 書類ID
 * @param {object|undefined} v 中身
 * @return {object} 書類の姿
 */
const snapOf = (id, v) => ({
  id,
  exists: !!v,
  data: () => v,
  get: (k) => (v ? v[k] : undefined),
});

/**
 * 問い合わせ。`where` / `orderBy` / `limit` だけを繋げられる。
 * @param {string} name コレクション名
 * @param {object} q 積んだ条件
 * @return {object} 問い合わせ
 */
function query(name, q) {
  return {
    where: (f, op, v) => {
      if (op !== "==") throw new Error(`偽の Firestore は == しか持たない: ${op}`);
      return query(name, {...q, where: [...(q.where ?? []), [f, v]]});
    },
    orderBy: (f, dir) => query(name, {...q, order: [f, dir ?? "asc"]}),
    /* **`select` を持たせる。** `iconsOf` の `sharedNames()` が
       `select("name")` で名簿ぜんぶを読む。ここに口が無いと例外になり、
       `iconsOf` はそれを握りつぶして「絵なし」を返す——**この診断は絵を
       見ていないので、そのまま緑で通ってしまう。** 落ちない診断を置かない。 */
    select: (...f) => query(name, {...q, select: f}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      hits.query += 1;
      let rows = Object.entries(STORE[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, v] of q.where ?? []) {
        rows = rows.filter((d) => d.data()[f] === v);
      }
      if (q.order) {
        const [f, dir] = q.order;
        // **欄を持たない書類は落ちる。** 本物の `orderBy` と同じ
        rows = rows.filter((d) => d.data()[f] !== undefined);
        const sign = dir === "desc" ? -1 : 1;
        rows.sort((a, b) => {
          const x = a.data()[f];
          const y = b.data()[f];
          return x === y ? 0 : (x < y ? -1 : 1) * sign;
        });
      }
      if (q.limit !== undefined) rows = rows.slice(0, q.limit);
      return {
        empty: rows.length === 0,
        docs: rows,
        forEach: (f) => rows.forEach(f),
      };
    },
  };
}

/**
 * 偽の Firestore。`collection` と `getAll` だけ。
 * @return {object} db
 */
function fakeDb() {
  return {
    collection: (name) => ({
      ...query(name, {}),
      doc: (id) => ({
        id,
        _c: name,
        get: async () => {
          hits.get += 1;
          return snapOf(id, STORE[name]?.[id]);
        },
      }),
    }),
    getAll: async (...refs) => {
      hits.getAll += 1;
      return refs.map((r) => snapOf(r.id, STORE[r._c]?.[r.id]));
    },
    batch: () => {
      throw new Error("偽の Firestore は書かない");
    },
  };
}

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

console.log("# tsc を回して、いまの src から読み込む");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});

const DB = fakeDb();
const admin = {
  apps: [],
  initializeApp: () => {
    admin.apps.push({});
  },
  firestore: Object.assign(() => DB, {
    Timestamp: {now: () => ({toMillis: () => 0})},
    FieldValue: {serverTimestamp: () => 0},
  }),
  storage: () => {
    throw new Error("偽の admin は置き場を持たない");
  },
  auth: () => {
    throw new Error("偽の admin は合言葉を確かめない（whoIs は差し替えてある）");
  },
};

/** 出たログ。**視聴者さんの素性が出ていないかを、あとで数える** */
const logs = [];
const functions = {
  logger: {
    warn: (...a) => logs.push(a.join(" ")),
    info: (...a) => logs.push(a.join(" ")),
    error: (...a) => logs.push(a.join(" ")),
  },
};

const nodeRequire = createRequire(import.meta.url);
/** 読み込んだ `lib/*.js`。同じものを2度読み込まない（中の db が2つになる） */
const loaded = new Map();

/**
 * `lib/<名前>.js` を、偽の admin を渡して読み込む。
 * @param {string} name 拡張子なしの名前
 * @return {object} その module.exports
 */
function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const file = join(FUNCTIONS, "lib", `${name}.js`);
  const src = readFileSync(file, "utf8");
  const mod = {exports: {}};
  loaded.set(name, mod.exports);
  const req = (id) => {
    if (id === "firebase-admin") return admin;
    if (id === "firebase-functions") return functions;
    if (id.startsWith("./")) return load(id.slice(2));
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  // 中で `exports` を差し替えていることがあるので、読み終わってから入れ直す
  loaded.set(name, mod.exports);
  return mod.exports;
}

const cardsSrc = readFileSync(join(FUNCTIONS, "lib", "cards.js"), "utf8");
const {handleCards} = load("cards");
if (typeof handleCards !== "function") {
  console.error("lib/cards.js から handleCards を取り出せなかった");
  process.exit(1);
}
console.log(`  読み込んだ長さ: ${cardsSrc.length} 字\n`);

/* ---------------- 借りるもの（`islandApi.ts` の代役） ---------------- */

/** 何回 `listResidents` を呼んだか */
let residentCalls = 0;
const deps = {
  /* **合言葉が言う channelId は、わざと嘘にしてある。**
     本物の `whoIs` も `islandUsers` から取るが、ここが「送られてきた値を
     信じていないか」を見る唯一の場所なので、別の値を返させる。 */
  whoIs: async (h) => {
    if (h === "Bearer me") {
      return {uid: "uid-me", name: "さくら", channelId: "UC_liar_000001"};
    }
    if (h === "Bearer nochan") return {uid: "uid-nochan", name: "にせもの"};
    return null;
  },
  ownerUid: async () => null,
  listResidents: async () => {
    residentCalls += 1;
    return [];
  },
};

/**
 * 口を1回叩く。
 * @param {string} method GET / POST
 * @param {string} path パス
 * @param {string} [auth] Authorization ヘッダ
 * @return {Promise<object>} 扱ったか・状態・ヘッダ・返り
 */
async function call(method, path, auth) {
  const out = {handled: false, status: 200, head: {}, body: undefined};
  const res = {
    set: (k, v) => {
      out.head[k] = v;
    },
    status: (n) => {
      out.status = n;
      return res;
    },
    json: (b) => {
      out.body = b;
    },
  };
  out.handled = await handleCards({method, path, auth, body: {}}, res, deps);
  return out;
}

/** 返ってきたカードの持ち主を並べる（**仕込んだIDしか出ない**） */
const owners = (r) => (r.body?.cards ?? []).map((c) => c.channelId).sort();

/** カードのIDを並べたもの。並び順を見るため */
const ids = (r) => (r.body?.cards ?? []).map((c) => c.id).join(",");

/* ---------------- 0. 探し方が当たるか（先に見る・#19） ---------------- */

console.log("# 0. 探し方が当たるか（先に見る）");
{
  const r = await call("GET", "/cards");
  const who = owners(r);
  check("公開の /cards は扱われる", r.handled === true);
  check("公開の /cards は 200", r.status === 200, String(r.status));
  check(
    "偽データに他人のカードが入っている（0件が空振りでない）",
    who.filter((c) => c !== "UC_me_0000001").length === 2,
    who.join(","),
  );
  check("公開の /cards は4枚とも返す", who.length === 4, `${who.length} 枚`);
  check(
    "公開の /cards の掛け値（Cache-Control）は今までどおり",
    r.head["Cache-Control"] ===
      "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    r.head["Cache-Control"],
  );
  check(
    "公開の /cards の並び（day → at → id）が変わっていない",
    ids(r) === [
      "img_0000002__UC_me_0000001",
      "img_0000001__UC_me_0000001",
      "img_0000001__UC_other_00001",
      "img_0000003__UC_other_00002",
    ].join(","),
    ids(r),
  );
}

/* ---------------- 1. 未ログイン ---------------- */

console.log("\n# 1. 未ログインは 401");
for (const [name, auth] of [
  ["ヘッダ無し", undefined],
  ["空", ""],
  ["Bearer でない", "Basic さくら"],
  ["知らない合言葉", "Bearer にせもの"],
]) {
  const r = await call("GET", "/cards/mine", auth);
  check(`${name} → 扱われる`, r.handled === true);
  check(`${name} → 401`, r.status === 401, String(r.status));
  check(`${name} → カードを1枚も返さない`, r.body?.cards === undefined);
  check(
    `${name} → 掛け値は no-store`,
    r.head["Cache-Control"] === "no-store",
    r.head["Cache-Control"],
  );
}

/* ---------------- 2. ログイン済みは自分のぶんだけ ---------------- */

console.log("\n# 2. ログイン済みは、自分のカードだけ");
{
  const before = {...hits};
  const r = await call("GET", "/cards/mine", "Bearer me");
  const who = owners(r);
  check("扱われる", r.handled === true);
  check("200", r.status === 200, String(r.status));
  check("2枚返る", who.length === 2, `${who.length} 枚`);
  check(
    "ぜんぶ自分のぶん",
    who.every((c) => c === "UC_me_0000001"),
    who.join(","),
  );
  check(
    "他人のカードが0件",
    who.filter((c) => c !== "UC_me_0000001").length === 0,
    who.join(","),
  );
  check(
    "合言葉が言う channelId は使わない（islandUsers から取り直す）",
    !who.includes("UC_liar_000001"),
    who.join(","),
  );
  check(
    "掛け値は no-store（CDN にも中間にも置かせない）",
    r.head["Cache-Control"] === "no-store",
    r.head["Cache-Control"],
  );
  check(
    "公開の口の掛け値を付けていない",
    !String(r.head["Cache-Control"]).includes("s-maxage"),
    r.head["Cache-Control"],
  );
  /* **形は公開の口と同じ。** 画面（`MyStuff` / `CardSheet`）を作り替えずに
     寄せ先だけ差し替えられること。欄が1つでも欠けたらここで落ちる */
  const keys = Object.keys(r.body.cards[0] ?? {}).sort().join(",");
  const want = [
    "at", "channelId", "day", "h", "icon", "id", "moved", "name",
    "note", "photoId", "rot", "scale", "streamEventId", "url", "w", "x", "y",
  ].sort().join(",");
  check("1枚の欄が公開の口と同じ", keys === want, keys);
  check(
    "新しい順（公開の口と同じ並べ方）",
    ids(r) === "img_0000002__UC_me_0000001,img_0000001__UC_me_0000001",
    ids(r),
  );
  check(
    "問い合わせは2本まで（枚数ぶん引きに行っていない）",
    hits.query - before.query <= 2,
    `${hits.query - before.query} 本`,
  );
  check("名簿を読んでいる", residentCalls >= 1);
}

/* ---------------- 3. チャンネルを結んでいない人 ---------------- */

console.log("\n# 3. islandUsers にチャンネルの無い人は、空で返る");
{
  const r = await call("GET", "/cards/mine", "Bearer nochan");
  const n = (r.body?.cards ?? []).length;
  check("扱われる", r.handled === true);
  check("200（500 にしない）", r.status === 200, String(r.status));
  check("空の配列が返る（欄ごと無いのではない）", Array.isArray(r.body?.cards));
  check("0枚", n === 0, `${n} 枚`);
  check(
    "掛け値は no-store",
    r.head["Cache-Control"] === "no-store",
    r.head["Cache-Control"],
  );
}

/* ---------------- 4. POST /cards/<id> の正規表現に食われない ---------------- */

console.log("\n# 4. /cards/mine が POST /cards/<id> に食われない");
{
  /* **写しを書かない。** 本体の字から正規表現を切り出して当てる。
     ここに形を書き写すと、本体を直したのに古いものを確かめることになる */
  const m = cardsSrc.match(/\/\^\\\/cards\\\/\([^\n]*?\)\$\//);
  check("本体から正規表現を切り出せた", !!m, m ? "" : "見つからない");
  if (m) {
    const move = new RegExp(m[0].slice(1, -1));
    console.log(`  切り出した形: ${m[0]}`);
    /* 先に「当たるはず」のものに当たることを見る（#19）。ここが外れていると
       「/cards/mine は当たらない」も空振りになる */
    check(
      "本物のカードIDには当たる（探し方が当たる）",
      move.test("/cards/img_0000001__UC_me_0000001"),
    );
    check("/cards/mine には当たらない", !move.test("/cards/mine"));
    check("/cards には当たらない", !move.test("/cards"));
    check("/cards/mine/ にも当たらない", !move.test("/cards/mine/"));
  }
  // 形だけでなく、口の振る舞いでも見る
  const post = await call("POST", "/cards/mine", "Bearer me");
  check(
    "POST /cards/mine は扱わない（下の口へ落ちる）",
    post.handled === false,
    `handled=${post.handled} status=${post.status}`,
  );
  check("POST /cards/mine は何も返さない", post.body === undefined);
  const get = await call("GET", "/cards/mine", "Bearer me");
  check("GET /cards/mine は先に拾われる", get.handled === true);
  check("GET /cards/mine は 200", get.status === 200, String(get.status));
  check(
    "GET /cards/mine は自分のぶんだけ（食われていない証拠）",
    owners(get).every((c) => c === "UC_me_0000001"),
    owners(get).join(","),
  );
}

/* ---------------- 5. ログに素性を出していない ---------------- */

console.log("\n# 5. ログに、視聴者さんの素性が1文字も出ない");
{
  const all = logs.join("\n");
  check("チャンネルIDが出ていない", !all.includes("UC_"), all.slice(0, 120));
  check(
    "名前が出ていない",
    !all.includes("さくら") && !all.includes("にせもの"),
  );
  check("uid が出ていない", !all.includes("uid-"));
  console.log(`  出たログ: ${logs.length} 行`);
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件。`);
  process.exit(1);
}
console.log("ぜんぶ通った。");
