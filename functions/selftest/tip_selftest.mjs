/**
 * 島で受ける投げ銭（`functions/src/tip.ts`。#1405）の確かめ。**鍵もネットも使わない。**
 *
 * ## 本物のルータを動かす
 *
 * `api_trust_selftest.mjs` と同じ手。`onRequest` を差し替えて `islandApi.ts` が
 * 登録した関数を掴み、Firestore は手元の Map、Stripe は**窓口だけ偽物**にする。
 *
 *     onRequest(opts, handler) → handler を持って帰る
 *     admin.firestore()        → 手元の Map（取引・`increment`・深い merge まで）
 *     admin.auth()             → 決め打ちの合言葉
 *     require("stripe")        → 支払い画面を作る・支払いを引くところだけ偽物。
 *                                **署名の確かめ（`Stripe.webhooks`）は本物**
 *     require("googleapis")    → YouTube の窓口（鍵・配信を探す・チャットに書く）だけ偽物。
 *                                **探すと、その鍵の持ち主の配信だけが返る**（本物と同じ）
 *     globalThis.fetch         → Doneru の累計（豚の額を測るため）
 *
 * 知らせの署名は `Stripe.webhooks.generateTestHeaderString` で作る。
 * 鍵は `whsec_selftest…` の偽物で、**本物の Stripe には1回も届かない。**
 * YouTube の鍵も偽の字で、**本番の配信のチャットには1回も書かない。**
 *
 * ## 先に「通る」を見る（`docs/island-standards.md` §15）
 *
 * 偽の置き場が壊れていると、どの口も 500 で落ちて「全部断られた」に見える。
 * 支払い画面が作れること・正しい知らせが書けることを先に見て、
 * どちらかが通らなければ数字を出さずに 2 で落ちる。
 *
 * ## 対照（§13）
 *
 * 守りを1本ずつ外した写しで自分をもう一度回し、**狙った足だけが**赤くなるかを見る。
 * 外したのに何も赤くならなければ、その守りは最初から効いていない。
 *
 * | `TIP_BREAK=` | 何を外すか | 赤くなるはずの足 |
 * | --- | --- | --- |
 * | `sig` | 署名を確かめずに本文を読む | 署名違い |
 * | `dup` | 「もう在るか」を見ない（前の安い門と、取引の中の門の両方） | 同じ知らせ2回 |
 * | `ng` | 禁止ワードを見ない | 禁止ワードの3本（当たらない足は通ったまま） |
 * | `live` | テストの支払いを本番として扱う | テストの支払いの2本＋チャットのテストの支払い |
 * | `chatlive` | テストの支払いでもチャットの1行を作る | チャットのテストの支払い |
 * | `chatdup` | `written` でなくてもチャットに書く | 同時に2通 |
 * | `chatkey` | 案内鳥の鍵が空でも窓口を作る | 鍵なし |
 * | `chatoff` | 配信していなくても書きに行く | 配信していない |
 * | `chatwho` | 書くのにあやとの鍵を使う | 配信中・本番 |
 * | `chatcatch` | YouTube が投げたものを飲まない | 例外でも 200 |
 * | `chatcap` | 待つ上限を外す | 上限まで |
 *
 * `dup` と `ng` も、チャットの足を赤くする（同じ守りに乗っているので）。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/tip_selftest.mjs
 * ```
 *
 * 0=ぜんぶ通った / 1=抜けたものがある / 2=確かめられなかった
 */

import {execFileSync, spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const LIB = join(FUNCTIONS, "lib");
const SELF = fileURLToPath(import.meta.url);
/** 外す守り。**親（対照を回す側）では空。** */
const BREAK = process.env.TIP_BREAK ?? "";

let ok = 0;
let bad = 0;
/** 落ちた足の名前。対照は子の出力からこれを拾う */
const fell = [];

/**
 * 1本の確かめ。
 * @param {string} name 足の名前（対照はこの名前で突き合わせる）
 * @param {boolean} good 通ったか
 * @param {string} [why] 落ちたときに出す中身（**偽の字だけ**）
 */
function check(name, good, why = "") {
  if (good) {
    ok += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  fell.push(name);
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/** 確かめようがない。**数字を1つも出さずに落ちる。** */
const blind = (why) => {
  console.error(`確かめられなかった: ${why}`);
  process.exit(2);
};

/* ================= 偽の Firestore ================= */

/** コレクション名 → 書類ID → 中身。**ぜんぶ偽の字。** */
const store = new Map();
/** 起きた書き込み（`{col, id}` だけ） */
let writes = [];
/**
 * 次の1回だけ、この書類（`col/id`）を「無い」と読ませる。**同じ知らせが同時に
 * 2通来て、2通とも取引の手前の安い門をすり抜けた**形を作るため。
 */
let hideOnce = "";
/** 出たログ。**素性が出ていないかを最後に数える。** */
const logs = [];

/** `FieldValue.increment` の印 */
const INC = Symbol("increment");

const isPlain = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) && !v[INC];

/**
 * 書く中身を、いまの中身に当てる。**深い merge と `increment` まで。**
 * @param {unknown} cur いまの値
 * @param {unknown} v 書く値
 * @param {boolean} merge merge するか
 * @return {unknown} 当てたあとの値
 */
function apply(cur, v, merge) {
  if (v && typeof v === "object" && v[INC] !== undefined) {
    return (typeof cur === "number" ? cur : 0) + v[INC];
  }
  if (!isPlain(v)) return v;
  const base = merge && isPlain(cur) ? {...cur} : {};
  for (const [k, x] of Object.entries(v)) {
    base[k] = apply(base[k], x, merge);
  }
  return base;
}

function seed(col, id, v) {
  if (!store.has(col)) store.set(col, new Map());
  store.get(col).set(id, v);
}
const read = (col, id) => store.get(col)?.get(id);
const count = (col) => store.get(col)?.size ?? 0;

const snapOf = (col, id, v) => ({
  id,
  exists: v !== undefined,
  data: () => (v === undefined ? undefined : structuredClone(v)),
  get: (k) => (v === undefined ? undefined : v[k]),
  ref: refOf(col, id),
});

function refOf(col, id) {
  return {
    id,
    path: `${col}/${id}`,
    get: async () => {
      if (hideOnce === `${col}/${id}`) {
        hideOnce = "";
        return snapOf(col, id, undefined);
      }
      return snapOf(col, id, read(col, id));
    },
    set: async (v, opt) => {
      writes.push({col, id});
      seed(col, id, apply(read(col, id), v, !!opt?.merge));
    },
    update: async (v) => {
      writes.push({col, id});
      seed(col, id, apply(read(col, id), v, true));
    },
    delete: async () => {
      writes.push({col, id});
      store.get(col)?.delete(id);
    },
    collection: (sub) => query(`${col}/${id}/${sub}`),
  };
}

function query(col, q = {where: [], lim: 0}) {
  const next = (patch) => query(col, {...q, ...patch});
  return {
    doc: (id) => refOf(col, id),
    where: (f, op, v) => {
      if (!["==", "!=", "<", ">=", "in"].includes(op)) {
        blind(`偽の Firestore が知らない演算子: ${op}`);
      }
      return next({where: [...q.where, [f, op, v]]});
    },
    orderBy: () => next({}),
    limit: (n) => next({lim: n}),
    select: () => next({}),
    startAfter: () => next({}),
    get: async () => {
      let rows = [...(store.get(col) ?? new Map()).entries()].filter(
        ([, v]) => q.where.every(([f, op, want]) => {
          const x = v?.[f];
          if (op === "==") return x === want;
          if (op === "!=") return x !== want && x !== undefined;
          if (op === "<") return x < want;
          if (op === ">=") return x >= want;
          return Array.isArray(want) && want.includes(x);
        }),
      );
      if (q.lim) rows = rows.slice(0, q.lim);
      const docs = rows.map(([id, v]) => snapOf(col, id, v));
      return {empty: !docs.length, size: docs.length, docs,
        forEach: (f) => docs.forEach(f)};
    },
  };
}

const fakeDb = {
  collection: (name) => query(name),
  doc: (p) => {
    const i = p.indexOf("/");
    return refOf(p.slice(0, i), p.slice(i + 1));
  },
  getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
  runTransaction: async (fn) =>
    fn({
      get: async (x) => x.get(),
      set: (r, v, o) => r.set(v, o),
      update: (r, v) => r.update(v),
      delete: (r) => r.delete(),
    }),
};

/** 合言葉。**ぜんぶ偽の字。** */
const TOKENS = {
  "tok-ayato": {uid: "uid-ayato", name: "おーなー"},
  "tok-a": {uid: "uid-a", name: "ひとりめ"},
  "tok-b": {uid: "uid-b", name: "ふたりめ"},
};

const fakeAdmin = {
  apps: [],
  initializeApp: () => {
    fakeAdmin.apps.push({});
  },
  firestore: Object.assign(() => fakeDb, {
    FieldValue: {
      serverTimestamp: () => 0,
      delete: () => null,
      increment: (n) => ({[INC]: n}),
    },
    FieldPath: {documentId: () => "__name__"},
    Timestamp: {now: () => ({toMillis: () => Date.now()})},
    AggregateField: {count: () => ({}), sum: () => ({})},
  }),
  storage: () => {
    throw new Error("偽の admin は置き場を持たない");
  },
  auth: () => ({
    verifyIdToken: async (t) => {
      const who = TOKENS[t];
      if (!who) throw new Error("bad token");
      return who;
    },
  }),
};

const say = (a) =>
  a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
const fakeFunctions = {
  logger: {
    warn: (...a) => logs.push(`warn ${say(a)}`),
    info: (...a) => logs.push(`info ${say(a)}`),
    error: (...a) => logs.push(`error ${say(a)}`),
    debug: () => {},
  },
};

/* ================= 偽の Stripe（窓口だけ） ================= */

const nodeRequire = createRequire(join(FUNCTIONS, "package.json"));
/** 本物。**署名の確かめと、知らせの署名づくりはこちら。** */
const RealStripe = nodeRequire("stripe");
/** 支払い画面を作ったときに渡された中身 */
let created = [];
/** 支払いを引きに来たら、しくじるか */
let retrieveFails = false;

/**
 * 窓口の偽物。`new Stripe(key)` の形で作られる。
 * @param {string} key 鍵（使わない）
 */
function FakeStripe(key) {
  if (!(this instanceof FakeStripe)) return new FakeStripe(key);
  this.checkout = {sessions: {create: async (p) => {
    created.push(structuredClone(p));
    return {id: "cs_test_selftest", url: "https://checkout.invalid/c/pay/x"};
  }}};
  this.paymentIntents = {retrieve: async () => {
    if (retrieveFails) throw Object.assign(new Error("x"), {type: "Err"});
    return {latest_charge: {balance_transaction: {net: 745}}};
  }};
}
FakeStripe.webhooks = RealStripe.webhooks;

/* ================= 偽の YouTube（googleapis の窓口だけ） ================= */

/** あやとの鍵と案内鳥の鍵。**偽の字。** 窓口は、どちらの鍵で作られたかを覚える */
const RT_AYATO = "rt-ayato-selftest";
const RT_GUIDE = "rt-guide-selftest";
/** いま配信中のチャット。**偽の字。** */
const LIVE_CHAT = "chat-selftest-live";
/**
 * 偽の YouTube の様子。`setup()` で毎回入れ直す。
 * live: あやとが配信しているか / fails: 書くと断る / hangMs: 書くのにかかる時間
 * lists: 配信を探した鍵 / inserts: 書いた鍵・チャット・1行
 */
let yt = {};
const ytReset = () => {
  yt = {live: true, fails: false, hangMs: 0, lists: [], inserts: []};
};
ytReset();

/** `new google.auth.OAuth2(…)` の偽物。鍵（refresh token）だけを覚える。 */
class FakeOAuth2 {
  constructor() {
    this.rt = "";
  }
  setCredentials(c) {
    this.rt = String(c?.refresh_token ?? "");
  }
  async getAccessToken() {
    return {token: "at-selftest"};
  }
}

/** 断りの形（googleapis が投げるものと同じ欄）。**中身は偽の字。** */
const ytRefusal = (status, reason) =>
  Object.assign(new Error(`selftest refused ${status}`),
    {status, errors: [{reason}]});

/**
 * `google.youtube({auth})` の偽物。**探すと、その鍵の持ち主の配信だけが返る**
 * （`broadcastStatus` は本物でも持ち主の配信に絞る）。配信しているのはあやとだけ。
 * @param {object} o `{auth}`
 * @return {object} 窓口
 */
const fakeYoutube = ({auth}) => ({
  liveBroadcasts: {list: async (p) => {
    yt.lists.push({who: auth.rt, status: p?.broadcastStatus});
    const mine = auth.rt === RT_AYATO && yt.live &&
      p?.broadcastStatus === "active";
    return {data: {items: mine ?
      [{id: "b-selftest", snippet: {liveChatId: LIVE_CHAT}}] : []}};
  }},
  liveChatMessages: {
    insert: async (p) => {
      const sn = p?.requestBody?.snippet ?? {};
      /* **書きに来た時点で数える。** 待たせて返す回も、数は1回 */
      yt.inserts.push({who: auth.rt, chat: sn.liveChatId ?? null,
        text: sn.textMessageDetails?.messageText});
      if (!sn.liveChatId) throw ytRefusal(400, "liveChatNotFound");
      if (yt.fails) throw ytRefusal(403, "forbidden");
      if (yt.hangMs) await new Promise((r) => setTimeout(r, yt.hangMs));
      return {data: {}};
    },
    list: async () => ({data: {items: []}}),
  },
});

const RealGoogleapis = nodeRequire("googleapis");
/** 窓口と鍵だけ差し替える。ほかの口が使う `google.auth.GoogleAuth` などは本物のまま */
const fakeGoogle = Object.create(RealGoogleapis.google);
fakeGoogle.auth = Object.create(RealGoogleapis.google.auth);
fakeGoogle.auth.OAuth2 = FakeOAuth2;
fakeGoogle.youtube = fakeYoutube;
const fakeGoogleapis = {google: fakeGoogle};
/* あやとの窓口は読み込んだときに作られるので、読み込む前に鍵を入れる */
process.env.YOUTUBE_REFRESH_TOKEN = RT_AYATO;

/* ================= lib を読み込む ================= */

if (!BREAK) {
  console.log("# tsc を回して、いまの src から読み込む");
  try {
    execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"],
      {cwd: FUNCTIONS});
  } catch (e) {
    blind(`tsc が通らない: ${String(e).slice(0, 200)}`);
  }
}

/**
 * `TIP_BREAK=` → `lib/` のどのファイルの、どこをどう外すか。
 * [ファイル, 探す字, 置き換える字]
 */
const BREAKS = {
  sig: [["tip",
    "stripe_1.default.webhooks.constructEvent(raw, sig, secret)",
    "JSON.parse(raw.toString(\"utf8\"))",
  ]],
  dup: [["tip", "if (before.exists)", "if (false)"],
    ["tip", "if (cur.exists)", "if (false)"]],
  ng: [["tip", "return words.some((w) => m.includes(w));", "return false;"]],
  live: [["tip",
    "const livemode = event.livemode === true;",
    "const livemode = true;",
  ]],
  chatlive: [["tip",
    "const chat = livemode ? (0, exports.tipChatLine)(name, yen, shown) : \"\";",
    "const chat = (0, exports.tipChatLine)(name, yen, shown);",
  ]],
  chatdup: [["tip", "if (outcome === \"written\" && chat)", "if (chat)"]],
  chatkey: [["youtubeClient", "if (!token)\n        return null;", ""]],
  chatoff: [["liveChat", "if (!chat)\n        return \"not-live\";", ""]],
  chatwho: [["liveChat",
    "await yt.liveChatMessages.insert(",
    "await youtubeClient_1.youtube.liveChatMessages.insert(",
  ]],
  chatcatch: [["tip",
    ", (e) => ({ said: \"failed\", why: whyOf(e) })",
    "",
  ]],
  chatcap: [["tip", "Promise.race([said, late])", "said"]],
};
if (BREAK && !BREAKS[BREAK]) blind(`知らない TIP_BREAK: ${BREAK}`);
/** 当たった細工の数。**読み込みのあとで、全部当たったかを見る** */
let broke = 0;

let handler = null;
const loaded = new Map();

function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const file = join(LIB, `${name}.js`);
  let src = readFileSync(file, "utf8");
  for (const [where, from, to] of BREAKS[BREAK] ?? []) {
    if (where !== name) continue;
    /* **当たらなかった細工を、黙って見逃さない。** 当たらなければ、
       壊していない字を測ることになる。 */
    if (!src.includes(from)) blind(`TIP_BREAK=${BREAK} が当たらなかった`);
    src = src.split(from).join(to);
    broke += 1;
  }
  const mod = {exports: {}};
  loaded.set(name, mod.exports);
  const req = (id) => {
    if (id === "firebase-admin") return fakeAdmin;
    if (id === "firebase-functions") return fakeFunctions;
    if (id === "firebase-functions/v2/https") {
      return {onRequest: (_o, h) => {
        handler = h;
        return h;
      }};
    }
    if (id === "stripe") return FakeStripe;
    if (id === "googleapis") return fakeGoogleapis;
    if (id.startsWith("./")) return load(id.slice(2));
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  loaded.set(name, mod.exports);
  return mod.exports;
}

/** Doneru の累計。**豚の額を測るためだけ。** 本物の Doneru には届かない。 */
const DONERU = 1000;
globalThis.fetch = async (url) => {
  if (String(url).includes("doneru")) {
    return {ok: true, status: 200, json: async () => ({amount: DONERU})};
  }
  return {ok: true, status: 200, json: async () => ({items: []})};
};
process.env.DONERU_GOAL_KEY = "d".repeat(32);

try {
  load("islandApi");
} catch (e) {
  blind(`lib/islandApi.js を読み込めなかった: ${String(e).slice(0, 300)}`);
}
if (typeof handler !== "function") blind("onRequest から本体を取り出せなかった");
if (BREAK && broke !== BREAKS[BREAK].length) {
  blind(`TIP_BREAK=${BREAK} の細工が ${broke}/${BREAKS[BREAK].length} しか当たらなかった`);
}
/** 配信のチャットを待つ上限。**口の数をそのまま読む**（ここに数を写さない） */
const CHAT_WAIT = loaded.get("tip")?.TIP_CHAT_WAIT_MS;
if (!Number.isInteger(CHAT_WAIT) || CHAT_WAIT <= 0) {
  blind("tip.ts の TIP_CHAT_WAIT_MS が読めない");
}

/* ================= 叩く ================= */

const SK = "sk_test_selftest";
const WHSEC = "whsec_selftest_aaaaaaaaaaaaaaaa";
/** あやとの合言葉と、テスト用の合言葉。**偽の字。** */
const OWNER_KEY = "a".repeat(32);
const TEST_KEY = "e".repeat(32);
const CH_A = "UCaaaaaaaaaaaaaaaaaaaaaa";
const CH_B = "UCbbbbbbbbbbbbbbbbbbbbbb";

/** 仕込み。**ぜんぶ偽の字。** 鍵も毎回入れ直す。 */
function setup() {
  store.clear();
  created = [];
  retrieveFails = false;
  hideOnce = "";
  ytReset();
  process.env.STRIPE_SECRET_KEY = SK;
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  process.env.YOUTUBE_GUIDE_REFRESH_TOKEN = RT_GUIDE;
  seed("islandUsers", "uid-ayato", {admin: true, alertboxId: OWNER_KEY,
    channelId: "UCzzzzzzzzzzzzzzzzzzzzzz", name: "おーなー"});
  seed("islandUsers", "uid-a", {channelId: CH_A, handle: "@hitorime",
    name: "ひとりめ"});
  // チャンネルを結んでいない人
  seed("islandUsers", "uid-b", {name: "ふたりめ"});
  seed("islandFundConfig", "tip", {testAlertboxId: TEST_KEY,
    ngWords: ["ばかもの", "ＮＧワード"]});
  seed("island", "state", {fund: {box: {superchat: 5000, start: -2000,
    goal: {yen: 50000, label: "にせの目標"}}}});
}

/**
 * 1回叩く。**その回の書き込みの数を添えて返す。**
 * @param {object} c method / path / body / token / headers / raw
 * @return {Promise<object>} code / body / wrote
 */
async function call(c) {
  writes = [];
  const res = {
    code: 200, body: null, headers: {},
    status(n) {
      this.code = n;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
    set(k, v) {
      this.headers[String(k).toLowerCase()] = v;
      return this;
    },
    send(v) {
      this.body = v;
      return this;
    },
  };
  const headers = {...(c.headers ?? {})};
  if (c.token) headers.authorization = `Bearer ${c.token}`;
  const req = {
    path: `/island-api${c.path}`,
    method: c.method,
    headers,
    body: c.body ?? {},
    rawBody: c.raw,
    query: {},
  };
  try {
    await handler(req, res);
  } catch (e) {
    return {code: 599, body: {error: String(e).slice(0, 120)},
      wrote: writes.length};
  }
  return {code: res.code, body: res.body, wrote: writes.length};
}

const checkout = (body, token = "tok-a", headers = {}) =>
  call({method: "POST", path: "/tip/checkout", body, token, headers});

/** 島の口が作る metadata と同じ形（**この口が作った支払い**の印つき）。 */
const MD = {src: "island-tip", uid: "uid-a", channelId: CH_A,
  name: "@hitorime", message: "にせのメッセージ"};

/**
 * 払い終わった知らせ1通。
 * @param {object} o 変えるところ
 * @return {object} Stripe の Event の形
 */
function paidEvent(o = {}) {
  const livemode = o.livemode ?? true;
  return {
    id: o.evt ?? "evt_selftest_1",
    object: "event",
    type: "checkout.session.completed",
    livemode,
    created: Math.floor(Date.now() / 1000) - 5,
    data: {object: {
      id: o.session ?? (livemode ? "cs_live_selftest1" : "cs_test_selftest1"),
      object: "checkout.session",
      amount_total: o.yen ?? 777,
      currency: "jpy",
      payment_status: o.status ?? "paid",
      payment_intent: o.pi ?? "pi_selftest_1",
      livemode,
      metadata: {...MD, ...(o.md ?? {})},
    }},
  };
}

/**
 * 知らせを送る。**署名は本物の道具で作る。**
 * @param {object} event 中身
 * @param {object} [o] secret（署名の鍵）/ tamper（署名のあとで本文を変える）/ nosig
 * @return {Promise<object>} 返り
 */
function deliver(event, o = {}) {
  const payload = JSON.stringify(event);
  const sig = RealStripe.webhooks.generateTestHeaderString({
    payload, secret: o.secret ?? WHSEC,
  });
  const body = o.tamper ? payload.replace("777", "778") : payload;
  return call({
    method: "POST",
    path: "/stripe/webhook",
    headers: o.nosig ? {} : {"stripe-signature": sig},
    body: JSON.parse(body),
    raw: Buffer.from(body, "utf8"),
  });
}

const feedOf = (key) => read("islandAlertFeed", key);
const islandBox = () => read("island", "state")?.fund?.box?.island;

/* ================= 1. 先に「通る」を見る ================= */

console.log("\n# 1. 正しい頼みは通って、ちゃんと書かれる（先に見る）");
let passed = 0;
{
  setup();
  const r = await checkout({yen: 500, message: "がんばって"});
  const p = created[0] ?? {};
  const good = r.code === 200 && typeof r.body?.url === "string" && p.mode;
  check("支払い画面が作れる", !!good, `${r.code} ${JSON.stringify(r.body)}`);
  if (good) passed += 1;
}
{
  setup();
  const r = await deliver(paidEvent());
  const good = r.code === 200 && count("islandSiteTips") === 1 &&
    feedOf(OWNER_KEY)?.items?.length === 1;
  check("正しい知らせ → islandSiteTips 1件＋アラートの1枚に1件", good,
    `${r.code} ${JSON.stringify(r.body)} tips=${count("islandSiteTips")}`);
  if (good) passed += 1;
}
if (passed < 2) blind("通るはずの頼みが通らない（偽の置き場か読み込みが壊れている）");

/* ================= 2. 知らせ ================= */

console.log("\n# 2. Stripe からの知らせ");
{
  /* 鍵が違う・署名のあとで本文を変えた・署名が無い。**3つとも 400 と書き込み0。** */
  const seen = [];
  for (const o of [{secret: "whsec_wrong"}, {tamper: true}, {nosig: true}]) {
    setup();
    const r = await deliver(paidEvent(), o);
    seen.push(`${r.code}/${r.wrote}/${count("islandSiteTips")}`);
  }
  check("署名違い → 400 で何も書かない",
    seen.every((x) => x === "400/0/0"), seen.join(" "));
}
{
  setup();
  await deliver(paidEvent());
  const t = read("islandSiteTips", "cs_live_selftest1") ?? {};
  const item = feedOf(OWNER_KEY)?.items?.[0] ?? {};
  check("台帳の元に Stripe の値で書く（額・時刻・本番の印・支払いの ID）",
    t.amount === 777 && t.currency === "JPY" && t.livemode === true &&
      t.status === "paid" && t.paymentIntentId === "pi_selftest_1" &&
      t.channelId === CH_A && t.uid === "uid-a" &&
      t.displayNameSnapshot === "@hitorime" && t.settlementAmount === 745 &&
      Number.isInteger(t.paidAt) && t.paidAt % 1000 === 0,
    JSON.stringify({...t, uid: "…", channelId: "…"}));
  check("アラートの1件は {seq, who, yen, text, at} だけ（チャンネルも uid も入れない）",
    JSON.stringify(Object.keys(item).sort()) ===
      JSON.stringify(["at", "seq", "text", "who", "yen"]) &&
      item.seq === 1 && item.who === "@hitorime" && item.yen === 777 &&
      item.text === "にせのメッセージ" && feedOf(OWNER_KEY).seq === 1,
    JSON.stringify(item));
}
{
  /* **画面から来た額は使わない。** 支払い画面は 500円で作り、Stripe が 777円と
     知らせてきた（クーポン・作り直しなど）。入るのは 777円。 */
  setup();
  await checkout({yen: 500});
  await deliver(paidEvent({yen: 777}));
  const t = read("islandSiteTips", "cs_live_selftest1") ?? {};
  check("額は Stripe の知らせの値（作るときの 500 ではなく 777）",
    created[0]?.line_items?.[0]?.price_data?.unit_amount === 500 &&
      t.amount === 777 && feedOf(OWNER_KEY)?.items?.[0]?.yen === 777 &&
      islandBox() === 777,
    `${t.amount} / ${islandBox()}`);
}
{
  setup();
  const a = await deliver(paidEvent());
  const b = await deliver(paidEvent());
  const f = feedOf(OWNER_KEY) ?? {};
  check("同じ知らせ2回 → 1件のまま・seq も豚も1回だけ",
    a.code === 200 && b.code === 200 && count("islandSiteTips") === 1 &&
      f.seq === 1 && f.items?.length === 1 && islandBox() === 777,
    `seq=${f.seq} items=${f.items?.length} box=${islandBox()}`);
}
{
  setup();
  const r = await deliver(paidEvent({livemode: false}));
  const t = read("islandSiteTips", "cs_test_selftest1") ?? {};
  check("テストの支払い → テストの合言葉の1枚だけ。本番の1枚と豚は動かない",
    r.code === 200 && t.livemode === false &&
      feedOf(TEST_KEY)?.items?.length === 1 && feedOf(OWNER_KEY) === undefined &&
      islandBox() === undefined,
    `test=${feedOf(TEST_KEY)?.items?.length} owner=${!!feedOf(OWNER_KEY)} ` +
      `box=${islandBox()}`);
}
{
  /* テスト用の合言葉に、本番の合言葉が入っていた。**本番のアラートに出さない。** */
  setup();
  seed("islandFundConfig", "tip", {testAlertboxId: OWNER_KEY, ngWords: []});
  await deliver(paidEvent({livemode: false}));
  check("テスト用の合言葉が本番と同じなら、どの1枚にも書かない",
    feedOf(OWNER_KEY) === undefined && islandBox() === undefined &&
      count("islandSiteTips") === 1,
    `owner=${!!feedOf(OWNER_KEY)}`);
}
{
  setup();
  retrieveFails = true;
  const r = await deliver(paidEvent());
  const t = read("islandSiteTips", "cs_live_selftest1") ?? {};
  check("手数料が引けなくても受ける（settlementAmount は null）",
    r.code === 200 && t.amount === 777 && t.settlementAmount === null,
    String(t.settlementAmount));
}
{
  /* 支払い画面を作ったあとで禁止ワードが足された。払われたお金は受けるが、
     **配信には名前と額だけ**を出す。 */
  setup();
  await deliver(paidEvent({md: {message: "この ばかもの め"}}));
  const t = read("islandSiteTips", "cs_live_selftest1") ?? {};
  const item = feedOf(OWNER_KEY)?.items?.[0] ?? {};
  check("知らせを受けたときも禁止ワードを見る → アラートの字は空",
    item.text === "" && item.yen === 777 && t.message === "この ばかもの め",
    JSON.stringify(item));
}
{
  setup();
  await deliver(paidEvent());
  const before = JSON.stringify(feedOf(OWNER_KEY));
  const ref = await deliver({id: "evt_r", object: "event", type: "charge.refunded",
    livemode: true, created: 1, data: {object: {object: "charge", amount: 777,
      amount_refunded: 777, payment_intent: "pi_selftest_1"}}});
  const s1 = read("islandSiteTips", "cs_live_selftest1")?.status;
  const dis = await deliver({id: "evt_d", object: "event",
    type: "charge.dispute.created", livemode: true, created: 1,
    data: {object: {object: "dispute", payment_intent: "pi_selftest_1"}}});
  const s2 = read("islandSiteTips", "cs_live_selftest1")?.status;
  check("返金・払い戻し請求は status を直すだけ（アラートも豚も動かない）",
    ref.code === 200 && dis.code === 200 && s1 === "refunded" &&
      s2 === "disputed" && JSON.stringify(feedOf(OWNER_KEY)) === before &&
      islandBox() === 777,
    `${s1} / ${s2}`);
}
{
  /* この口が作っていない支払い（印が無い）・払われていない完了は書かない。 */
  setup();
  const a = await deliver(paidEvent({md: {src: ""}}));
  const b = await deliver(paidEvent({status: "unpaid", session: "cs_live_x2"}));
  check("この口の印が無い・払われていない知らせは書かない（200 で受ける）",
    a.code === 200 && b.code === 200 && count("islandSiteTips") === 0 &&
      feedOf(OWNER_KEY) === undefined,
    `${a.body?.outcome} / ${b.body?.outcome}`);
}
{
  setup();
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const r = await deliver(paidEvent());
  check("署名の鍵が無い → 503・書き込み0",
    r.code === 503 && r.body?.error === "tip not configured" && r.wrote === 0,
    `${r.code} ${r.wrote}`);
}

/* ================= 3. 支払い画面 ================= */

console.log("\n# 3. 支払い画面を作る口");
{
  setup();
  const r = await call({method: "POST", path: "/tip/checkout",
    body: {yen: 500}});
  check("未ログイン → 401・書き込み0", r.code === 401 && r.wrote === 0,
    `${r.code}`);
}
{
  setup();
  const r = await checkout({yen: 500}, "tok-b");
  check("チャンネルを結んでいない → 403 channel required・書き込み0",
    r.code === 403 && r.body?.error === "channel required" && r.wrote === 0,
    `${r.code} ${JSON.stringify(r.body)}`);
}
{
  setup();
  const seen = [];
  for (const yen of [99, 100000000, 100.5, "500", null, -100]) {
    const r = await checkout({yen});
    seen.push(`${JSON.stringify(yen)}:${r.code}/${r.wrote}`);
  }
  const edge = [await checkout({yen: 100}), await checkout({yen: 99999999})];
  check("yen 99・1億・小数・文字列・空・負 → 400・書き込み0（100 と 99,999,999 は通る）",
    seen.every((x) => x.endsWith(":400/0")) &&
      edge.every((r) => r.code === 200) && created.length === 2,
    seen.join(" "));
}
{
  setup();
  const long = await checkout({yen: 500, message: "あ".repeat(71)});
  const just = await checkout({yen: 500, message: "あ".repeat(70)});
  const notStr = await checkout({yen: 500, message: 12345});
  check("message 71字・文字列でない → 400（70字は通る）",
    long.code === 400 && long.wrote === 0 && notStr.code === 400 &&
      just.code === 200 && created[0]?.metadata?.message === "あ".repeat(70),
    `${long.code} / ${just.code} / ${notStr.code}`);
}
{
  /* **送ってきた channelId と名前は見ない。** 入るのは islandUsers のもの。 */
  setup();
  const r = await checkout({yen: 500, message: "やあ", channelId: CH_B,
    name: "にせもの", uid: "uid-ayato"});
  const md = created[0]?.metadata ?? {};
  check("body の channelId・名前・uid は見ない",
    r.code === 200 && md.channelId === CH_A && md.uid === "uid-a" &&
      md.name === "@hitorime",
    JSON.stringify({...md, uid: "…"}));
}
{
  setup();
  await checkout({yen: 1000, message: "やあ"},
    "tok-a", {"x-forwarded-host": "live-streaming-d3cac.web.app"});
  await checkout({yen: 1000}, "tok-a", {"host": "evil.invalid"});
  const [a, b] = created;
  const pd = a?.line_items?.[0]?.price_data ?? {};
  check("支払い画面の中身（payment・jpy・品名・戻り先・印）",
    a?.mode === "payment" && pd.currency === "jpy" && pd.unit_amount === 1000 &&
      pd.product_data?.name === "メッセージをあやとの配信のアラートに出す" &&
      !/寄付|ドネーション/.test(JSON.stringify(a)) &&
      a.success_url === "https://live-streaming-d3cac.web.app/tip?done=1" &&
      a.cancel_url === "https://live-streaming-d3cac.web.app/tip" &&
      b?.success_url === "https://ayato-arigato.com/tip?done=1" &&
      a.metadata?.src === "island-tip" &&
      a.payment_intent_data?.metadata?.message === "やあ",
    JSON.stringify({mode: a?.mode, success: a?.success_url,
      evil: b?.success_url}));
}
{
  setup();
  const hit = await checkout({yen: 500, message: "この ばかもの め"});
  check("禁止ワードが当たる → 400 ng word・書き込み0",
    hit.code === 400 && hit.body?.error === "ng word" && hit.wrote === 0 &&
      created.length === 0,
    `${hit.code} ${JSON.stringify(hit.body)}`);
}
{
  setup();
  /* 語の側は「ＮＧワード」（全角・大文字）で入れてある。打つ側は半角小文字。
     もう1語「ばかもの」は、打つ側を全角の空白なし・カタカナ混じりにしない形で見る。 */
  const a = await checkout({yen: 500, message: "これは ngワード です"});
  const b = await checkout({yen: 500, message: "これは ＮＧﾜｰﾄﾞ です"});
  check("全角・大文字・半角カナでも当たる → 400",
    a.code === 400 && b.code === 400 && created.length === 0,
    `${a.code} / ${b.code}`);
}
{
  setup();
  const r = await checkout({yen: 500, message: "ばかうけ おいしい"});
  check("禁止ワードに当たらない → 通る", r.code === 200 && created.length === 1,
    `${r.code}`);
}
{
  /* 設定が読めない・無い日は止めない（語が無いものとして通す）。 */
  setup();
  store.get("islandFundConfig").delete("tip");
  const r = await checkout({yen: 500, message: "この ばかもの め"});
  check("禁止ワードの設定が無くても止めない", r.code === 200, `${r.code}`);
}
{
  setup();
  seed("islandRate", `tip_${new Date().toISOString().slice(0, 10)}_uid-a`,
    {n: 100});
  const r = await checkout({yen: 500});
  check("1人1日100枚を超えたら 429", r.code === 429 && created.length === 0,
    `${r.code}`);
}
{
  setup();
  delete process.env.STRIPE_SECRET_KEY;
  const a = await checkout({yen: 500});
  const b = await call({method: "POST", path: "/tip/checkout", body: {}});
  check("鍵が無い → 503 tip not configured（未ログインでも）・書き込み0",
    a.code === 503 && b.code === 503 &&
      a.body?.error === "tip not configured" && a.wrote === 0 && b.wrote === 0,
    `${a.code} / ${b.code}`);
}

/* ================= 4. 豚と字の長さ ================= */

console.log("\n# 4. 豚の額と、画面に配る字の長さ");
{
  setup();
  const r = await call({method: "GET", path: "/state"});
  const l = r.body?.limits ?? {};
  check("GET /state の limits に tipYenMin・tipYenMax・tipMessageMax",
    l.tipYenMin === 100 && l.tipYenMax === 99999999 && l.tipMessageMax === 70,
    JSON.stringify(l));
}
const abFund = () =>
  call({method: "GET", path: `/alertbox/${OWNER_KEY}/fund`});
const fund = () => call({method: "GET", path: "/fund"});
{
  /* 焼き直しに `island` の欄がまだ無い日。本番の支払いが1件も無ければ 0 が正しい。 */
  setup();
  const a = await abFund();
  const f = await fund();
  const want = -2000 + 5000 + DONERU;
  check("欄が無く、本番の支払いも無い → 0 として足す（豚も /fund も同じ額）",
    a.code === 200 && a.body?.currentAmount === want &&
      f.code === 200 && f.body?.total === want,
    `${a.code} ${a.body?.currentAmount} / ${f.code} ${f.body?.total}`);
}
{
  setup();
  await deliver(paidEvent());
  const a = await abFund();
  const f = await fund();
  const want = -2000 + 5000 + 777 + DONERU;
  check("本番の支払いで豚が伸びる（豚・/fund の total・given が同じだけ）",
    a.body?.currentAmount === want && f.body?.total === want &&
      f.body?.given === 5000 + 777 + DONERU,
    `${a.body?.currentAmount} / ${f.body?.total} / ${f.body?.given}`);
}
{
  /* 欄が無いのに本番の支払いが在る（焼き直しが欄を落とした）。**0 を作らない。** */
  setup();
  seed("islandSiteTips", "cs_live_old", {livemode: true, amount: 300});
  const a = await abFund();
  const f = await fund();
  check("欄が無いのに本番の支払いが在る → 豚も /fund も 503（0 を作らない）",
    a.code === 503 && f.code === 503, `${a.code} / ${f.code}`);
}
{
  /* テストの支払いしか無いなら、0 が正しい（テストは豚に入れない）。 */
  setup();
  seed("islandSiteTips", "cs_test_old", {livemode: false, amount: 300});
  const a = await abFund();
  check("テストの支払いしか無い → 0 として足す",
    a.code === 200 && a.body?.currentAmount === -2000 + 5000 + DONERU,
    `${a.code} ${a.body?.currentAmount}`);
}

/* ================= 5. 配信のチャット ================= */

console.log("\n# 5. 配信していれば、案内鳥としてチャットに1行（決定の記録 0019）");
/** その足のあいだに出た「tip chat:」のログ */
const chatLogsSince = (at) =>
  logs.slice(at).filter((l) => l.includes("tip chat:"));
/** 決めた形の1行（あやと 2026-11-23。**一字一句この字**） */
const LINE_1000 =
  "@hitorimeさん ¥1,000 島の投げ銭ありやと！「にせのメッセージ」";
{
  setup();
  const at = logs.length;
  const r = await deliver(paidEvent({yen: 1000}));
  const w = yt.inserts[0] ?? {};
  check("配信中・本番 → 案内鳥として1回だけ・字が決めた形と一字一句同じ（探すのはあやとの鍵）",
    r.code === 200 && r.body?.outcome === "written" &&
      yt.inserts.length === 1 && w.text === LINE_1000 &&
      w.who === RT_GUIDE && w.chat === LIVE_CHAT &&
      yt.lists.length === 1 && yt.lists[0].who === RT_AYATO &&
      JSON.stringify(chatLogsSince(at)) ===
        JSON.stringify(["info tip chat: said"]),
    JSON.stringify({n: yt.inserts.length, who: w.who, text: w.text,
      lists: yt.lists, logs: chatLogsSince(at)}));
}
{
  setup();
  const got = [];
  for (const [yen, sid] of [[100, "cs_live_c1"], [1000, "cs_live_c2"],
    [12345678, "cs_live_c3"]]) {
    await deliver(paidEvent({yen, session: sid}));
  }
  for (const w of yt.inserts) got.push(String(w.text).split(" ")[1]);
  check("額は3桁区切り（¥100・¥1,000・¥12,345,678）",
    JSON.stringify(got) === JSON.stringify(["¥100", "¥1,000", "¥12,345,678"]),
    JSON.stringify(got));
}
{
  setup();
  yt.live = false;
  const at = logs.length;
  const r = await deliver(paidEvent());
  check("配信していない → チャット0回（探すのは1回だけ）・200",
    r.code === 200 && r.body?.outcome === "written" &&
      count("islandSiteTips") === 1 && yt.inserts.length === 0 &&
      yt.lists.length === 1 &&
      JSON.stringify(chatLogsSince(at)) ===
        JSON.stringify(["info tip chat: not-live"]),
    JSON.stringify({n: yt.inserts.length, lists: yt.lists.length,
      logs: chatLogsSince(at)}));
}
{
  setup();
  const at = logs.length;
  const r = await deliver(paidEvent({livemode: false}));
  check("テストの支払い → チャット0回（配信も探さない）",
    r.code === 200 && r.body?.outcome === "written" &&
      yt.inserts.length === 0 && yt.lists.length === 0 &&
      chatLogsSince(at).length === 0,
    JSON.stringify({n: yt.inserts.length, lists: yt.lists.length}));
}
{
  setup();
  const a = await deliver(paidEvent());
  const b = await deliver(paidEvent());
  check("同じ知らせ2回 → チャット1回",
    a.body?.outcome === "written" && b.body?.outcome === "already" &&
      yt.inserts.length === 1,
    `${a.body?.outcome} / ${b.body?.outcome} / ${yt.inserts.length}`);
}
{
  /* 2通とも、取引の手前の安い門（「もう在るか」）をすり抜けた。
     取引の中で `written` になるのは1通だけで、2通目は `already`。 */
  setup();
  const a = await deliver(paidEvent());
  hideOnce = "islandSiteTips/cs_live_selftest1";
  const b = await deliver(paidEvent());
  check("同じ知らせが同時に2通（手前の門をすり抜けた）→ 2通目は already・チャット1回",
    hideOnce === "" && a.body?.outcome === "written" &&
      b.body?.outcome === "already" && count("islandSiteTips") === 1 &&
      yt.inserts.length === 1,
    `${a.body?.outcome} / ${b.body?.outcome} / ${yt.inserts.length} ` +
      `hide=${hideOnce === "" ? "used" : "unused"}`);
}
{
  setup();
  await deliver(paidEvent({md: {message: ""}}));
  check("メッセージなし → 「」ごと出さない",
    yt.inserts.length === 1 &&
      yt.inserts[0].text === "@hitorimeさん ¥777 島の投げ銭ありやと！",
    String(yt.inserts[0]?.text));
}
{
  setup();
  await deliver(paidEvent({md: {message: "この ばかもの め"}}));
  check("禁止ワードに当たる → 「」ごと出さない（名前と額は出す）",
    yt.inserts.length === 1 &&
      yt.inserts[0].text === "@hitorimeさん ¥777 島の投げ銭ありやと！",
    String(yt.inserts[0]?.text));
}
{
  setup();
  await deliver(paidEvent({md: {name: ""}}));
  check("名前が無い → 名無しさん（さんを重ねない）",
    yt.inserts[0]?.text ===
      "名無しさん ¥777 島の投げ銭ありやと！「にせのメッセージ」",
    String(yt.inserts[0]?.text));
}
{
  setup();
  delete process.env.YOUTUBE_GUIDE_REFRESH_TOKEN;
  const at = logs.length;
  const r = await deliver(paidEvent());
  check("鍵なし → チャット0回・配信も探さない・ログ1行・200",
    r.code === 200 && r.body?.outcome === "written" &&
      count("islandSiteTips") === 1 && yt.inserts.length === 0 &&
      yt.lists.length === 0 &&
      JSON.stringify(chatLogsSince(at)) ===
        JSON.stringify(["warn tip chat: no-key"]),
    JSON.stringify({code: r.code, n: yt.inserts.length,
      lists: yt.lists.length, logs: chatLogsSince(at)}));
}
{
  setup();
  yt.fails = true;
  const at = logs.length;
  const r = await deliver(paidEvent());
  check("書くのが例外を投げても 200（台帳は入っている）",
    r.code === 200 && r.body?.outcome === "written" &&
      count("islandSiteTips") === 1 && yt.inserts.length === 1 &&
      JSON.stringify(chatLogsSince(at)) ===
        JSON.stringify(["warn tip chat: failed (403 forbidden)"]),
    JSON.stringify({code: r.code, logs: chatLogsSince(at)}));
}
{
  /* YouTube が上限より3秒長く黙る。**返事は上限で返る。** */
  setup();
  yt.hangMs = CHAT_WAIT + 3000;
  const at = logs.length;
  const t0 = Date.now();
  const r = await deliver(paidEvent());
  const ms = Date.now() - t0;
  check("書くのが返ってこなくても、待つのは上限まで・200",
    r.code === 200 && r.body?.outcome === "written" &&
      ms >= CHAT_WAIT - 50 && ms < CHAT_WAIT + 1500 &&
      yt.inserts.length === 1 &&
      JSON.stringify(chatLogsSince(at)) ===
        JSON.stringify(["warn tip chat: timeout"]),
    `${r.code} ${ms}ms (上限 ${CHAT_WAIT}ms) ${JSON.stringify(chatLogsSince(at))}`);
  console.log(`  待った時間: ${ms}ms（上限 ${CHAT_WAIT}ms）`);
}

/* ================= 6. ログ ================= */

console.log("\n# 6. ログに素性・額・メッセージ・Stripe の ID・チャットの1行が出ない");
{
  const text = logs.join("\n");
  const leaked = [
    ["uid", /uid-(a|b|ayato)/], ["チャンネルID", /UC[A-Za-z0-9_-]{22}/],
    ["名前", /hitorime|ひとりめ|名無しさん/],
    ["メッセージ", /にせのメッセージ|ばかもの/],
    ["額", /\b777\b|¥\d|12,345,678/], ["Stripe の ID", /\b(cs|pi|evt)_[A-Za-z0-9_]+/],
    ["チャットの1行", /ありやと/],
  ].filter(([, re]) => re.test(text)).map(([n]) => n);
  check("ログに素性・額・メッセージ・Stripe の ID・チャットの1行が出ない",
    leaked.length === 0 && logs.length > 0, leaked.join(" / "));
  console.log(`  出たログ: ${logs.length} 行`);
}

/* ================= 対照 ================= */

/** 外した守り → 赤くなってほしい足（**これと1本も違ってはいけない**） */
const C_TEST = "テストの支払い → チャット0回（配信も探さない）";
const C_RACE =
  "同じ知らせが同時に2通（手前の門をすり抜けた）→ 2通目は already・チャット1回";
const WANT = {
  sig: ["署名違い → 400 で何も書かない"],
  dup: [
    "同じ知らせ2回 → 1件のまま・seq も豚も1回だけ",
    "同じ知らせ2回 → チャット1回",
    C_RACE,
  ],
  ng: [
    "知らせを受けたときも禁止ワードを見る → アラートの字は空",
    "禁止ワードが当たる → 400 ng word・書き込み0",
    "全角・大文字・半角カナでも当たる → 400",
    "禁止ワードに当たる → 「」ごと出さない（名前と額は出す）",
  ],
  live: [
    "テストの支払い → テストの合言葉の1枚だけ。本番の1枚と豚は動かない",
    "テスト用の合言葉が本番と同じなら、どの1枚にも書かない",
    C_TEST,
  ],
  chatlive: [C_TEST],
  chatdup: [C_RACE],
  chatkey: ["鍵なし → チャット0回・配信も探さない・ログ1行・200"],
  chatoff: ["配信していない → チャット0回（探すのは1回だけ）・200"],
  chatwho: [
    "配信中・本番 → 案内鳥として1回だけ・字が決めた形と一字一句同じ（探すのはあやとの鍵）",
  ],
  chatcatch: ["書くのが例外を投げても 200（台帳は入っている）"],
  chatcap: ["書くのが返ってこなくても、待つのは上限まで・200"],
};

if (!BREAK) {
  console.log("\n# 対照: 守りを1本ずつ外して、狙った足だけが赤くなる");
  for (const [name, want] of Object.entries(WANT)) {
    const r = spawnSync(process.execPath, [SELF], {
      env: {...process.env, TIP_BREAK: name}, encoding: "utf8",
    });
    const got = (r.stdout ?? "").split("\n")
      .filter((l) => l.startsWith("  NG   "))
      .map((l) => l.slice(7).split(" — ")[0]);
    const same = r.status === 1 && got.length === want.length &&
      want.every((w) => got.includes(w));
    check(`TIP_BREAK=${name} → 赤いのは狙った ${want.length} 本だけ`, same,
      `終了 ${r.status} / 赤 [${got.join(" | ")}]` +
        (r.status === 2 ? ` / ${String(r.stderr).slice(0, 160)}` : ""));
  }
}

console.log(`\n通った ${ok} / 落ちた ${bad}`);
if (bad) console.log(`落ちた足: ${fell.join(" / ")}`);
process.exit(bad ? 1 : 0);
