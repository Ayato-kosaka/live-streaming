/**
 * `GET /island-api/fund/history` を、**オーナー以外が叩いたときに中身が
 * 返らないこと**だけを確かめる。本番も Firestore も触らない。
 *
 *   cd functions && npx tsc -p tsconfig.json    # 先に焼く
 *   node tools/fund/ownercheck.cjs
 *
 * 控えは**他人の個人情報**（名前と額）なので、口が開いていないことを
 * 画面ごしではなく**口そのものを叩いて**確かめる。画面の出し分けは
 * 出すか出さないかを決めているだけで、止めているのは口のほう。
 *
 * 合言葉の検算（`admin.auth().verifyIdToken`）と、`islandUsers/{uid}.admin`
 * の読み取りを差し替えて、口そのものを呼ぶ。**画面ではなく口を叩く。**
 */
process.env.GCLOUD_PROJECT = "live-streaming-d3cac";
process.env.FIREBASE_CONFIG = JSON.stringify({projectId: "live-streaming-d3cac"});

/* firebase-admin も Firestore も、**焼いた口が使っているのと同じもの**を
   掴む（別の写しを掴むと prototype の差し替えが向こうに届かない）。 */
const F = require("path").join(__dirname, "..", "..", "functions", "node_modules");
const admin = require(require("path").join(F, "firebase-admin"));
const {DocumentReference, Query, CollectionReference} =
  require(require("path").join(F, "@google-cloud/firestore"));

/* 誰の合言葉か。`null` は「検算に落ちる（にせもの）」 */
let TOKEN_UID = null;
/* その uid が `islandUsers` で admin かどうか */
let IS_ADMIN = false;
/* Firestore を1回でも引いたか。**403 の道で引いていたら、それは漏れ** */
let READS = 0;

DocumentReference.prototype.get = async function () {
  READS++;
  if (this.parent.id === "islandUsers") {
    return {exists: true, data: () => ({admin: IS_ADMIN}), get: () => undefined};
  }
  return {exists: false, data: () => ({}), get: () => undefined};
};
/* 控えの1ページぶん。**403 の道でここに来たら、そこで落とす。** */
const FAKE = [
  {id: "aaa", day: "2026-09-10", at: "2026-09-10T23:50:03+09:00", yen: 1000, who: "ひみつの名前", src: "alertbox"},
  {id: "bbb", day: "2026-09-09", at: null, yen: 500, who: "", src: "manual"},
];
const snap = {
  size: FAKE.length,
  empty: false,
  docs: FAKE.map((v) => ({
    id: v.id,
    data: () => v,
    get: (k) => v[k],
  })),
};
Query.prototype.get = async function () {
  READS++;
  return snap;
};
CollectionReference.prototype.get = Query.prototype.get;
Query.prototype.aggregate = function () {
  return {get: async () => {
    READS++;
    return {data: () => ({count: 415, yen: 238072})};
  }};
};
CollectionReference.prototype.aggregate = Query.prototype.aggregate;

const {islandApi} = require(
  require("path").join(__dirname, "..", "..", "functions", "lib", "islandApi.js"),
);
const handler = islandApi;

/* **合言葉の検算を差し替える。** TypeScript の `import * as admin` は
   名前空間の**写し**になるので、`admin.auth` に代入しても向こうには届かない。
   クラスの prototype は1つしかないので、そちらを差し替える。 */
Object.getPrototypeOf(admin.auth()).constructor.prototype.verifyIdToken =
  async function () {
    if (!TOKEN_UID) throw new Error("bad token");
    return {uid: TOKEN_UID};
  };

function call(headers) {
  return new Promise((done) => {
    const out = {status: 200, body: null, headers: {}};
    const res = {
      set: (k, v) => {
        out.headers[String(k).toLowerCase()] = v;
        return res;
      },
      status: (s) => {
        out.status = s;
        return res;
      },
      json: (b) => {
        out.body = b;
        done(out);
      },
      send: (b) => {
        out.body = b;
        done(out);
      },
      end: () => done(out),
      setHeader: (k, v) => {
        out.headers[String(k).toLowerCase()] = v;
      },
      getHeader: () => undefined,
      removeHeader: () => {},
      on: () => {},
      once: () => {},
      emit: () => {},
    };
    const req = {
      method: "GET",
      path: "/island-api/fund/history",
      url: "/island-api/fund/history",
      originalUrl: "/island-api/fund/history",
      query: {},
      headers,
      get: (k) => headers[String(k).toLowerCase()],
      body: {},
      rawBody: Buffer.from(""),
      on: () => {},
      socket: {},
    };
    handler(req, res);
  });
}

/* `[名前, ヘッダ, 合言葉の中の uid, その人は admin か]`。
   **admin だけが中身を受け取ってよい。** ほかは1件も返ってはいけない。 */
const CASES = [
  ["合言葉なし", {}, null, false],
  ["Bearer でない", {authorization: "Basic zzz"}, null, false],
  ["にせの合言葉", {authorization: "Bearer nope"}, null, false],
  ["本物だが admin でない", {authorization: "Bearer ok"}, "viewer-uid", false],
  ["あやと（admin）", {authorization: "Bearer ok"}, "ayato-uid", true],
];

(async () => {
  let bad = 0;
  for (const [tag, headers, uid, isAdmin] of CASES) {
    TOKEN_UID = uid;
    IS_ADMIN = isAdmin;
    READS = 0;
    const r = await call(headers);
    const got = JSON.stringify(r.body ?? "").includes("ひみつの名前");
    const ok = got === isAdmin;
    if (!ok) bad++;
    console.log(
      tag.padEnd(22),
      String(r.status).padEnd(4),
      "cache=" + (r.headers["cache-control"] ?? "（付いていない）"),
      "中身=" + (got ? "返った" : "返っていない"),
      "件数=" + (r.body && r.body.chats ? r.body.chats.length : 0),
      "控えを引いた回数=" + READS,
      ok ? "" : "★そうであってはいけない★",
    );
  }
  console.log(bad === 0 ? "\nぜんぶ思ったとおり" : `\n${bad}件おかしい`);
  process.exit(bad === 0 ? 0 : 1);
})();
