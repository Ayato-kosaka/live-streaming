/**
 * `GET /island-api/fund` を、**取り込みの札を10通りに差し替えて**叩く（#294）。
 *
 *   cd functions && npx tsc -p tsconfig.json    # 先に焼く
 *   node tools/fund/asofcheck.cjs
 *
 * 見るのは2つだけ。
 *
 *   1. **いままでの4欄（`total` `given` `goal` `people`）が、
 *      10通りのどれでも1つも変わらないこと。** 豚の貯金箱は旅の最中に
 *      動いている本番の数字で、ここを壊すと出してくれた人の額が出なくなる
 *   2. `doneruAsOf` が**止まっている日だけ**乗ること。札が無い・空・形が違う・
 *      日付が未来・Firestore が落ちている、は**ぜんぶ黙る側へ倒れること**
 *
 * 画面ごしでは (2) を確かめたことにならない。画面は来たものを出しているだけで、
 * 出す出さないを決めているのは口のほう。だから口そのものを叩く。
 *
 * 本番も Firestore も触らない。Firestore と外への fetch を差し替えて、
 * **焼いた口そのもの**を呼ぶ（`tools/fund/ownercheck.cjs` と同じ手）。
 */
process.env.GCLOUD_PROJECT = "live-streaming-d3cac";
process.env.FIREBASE_CONFIG = JSON.stringify({projectId: "live-streaming-d3cac"});
/* 鍵を GAS まで取りに行かせない。**本番の鍵をこの箱に落とさない。** */
process.env.DONERU_GOAL_KEY = "0".repeat(32);

const path = require("path");
const F = path.join(__dirname, "..", "..", "functions", "node_modules");
const {DocumentReference, Query, CollectionReference} =
  require(path.join(F, "@google-cloud/firestore"));

/* ---- 本番と同じ額を入れる（2026-09-12 の `GET /island-api/fund`）----
   `{"total":46980,"given":296626,"goal":50000,"people":53,"updatedAt":null}`

   起点は `total - given = -249,646`（`docs/nordic-fund.md` 9.10 と同じ）。
   スパチャと Doneru の内訳は口が返さないので、足して `given` になる
   ところまでを本番から取っている。**合計は1円まで本番と同じ。** */
const START = -249646;
const DONERU = 175020;
const SUPERCHAT = 296626 - DONERU;
const PEOPLE = 53;
const GOAL = 50000;

/** いまの札（ケースごとに差し替える）。`null` は「札が無い」 */
let HEALTH = null;
/** Firestore そのものが落ちている回 */
let FS_DOWN = false;

DocumentReference.prototype.get = async function () {
  const col = this.parent.id;
  if (col === "islandDoneruHealth") {
    if (FS_DOWN) throw new Error("firestore unavailable");
    if (HEALTH === null) return {exists: false, data: () => ({})};
    return {exists: true, data: () => HEALTH};
  }
  if (col === "island") {
    return {
      exists: true,
      data: () => ({fund: {people: PEOPLE, total: 1, superchat: 1, start: -1}}),
    };
  }
  return {exists: false, data: () => ({})};
};
Query.prototype.get = async function () {
  return {size: 0, empty: true, docs: []};
};
CollectionReference.prototype.get = Query.prototype.get;

/* 外へは出さない。GAS の1件と Doneru の合計を、その場で返す。 */
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes("api.doneru.jp")) {
    return {ok: true, status: 200, json: async () => ({amount: DONERU})};
  }
  if (u.includes("script.google.com")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          doneruGoalKey: "0".repeat(32),
          startAmount: START,
          superChatAmount: SUPERCHAT,
          targetAmount: GOAL,
        },
      }),
    };
  }
  throw new Error(`外に出ようとしました: ${u}`);
};

const {islandApi: handler} = require(
  path.join(__dirname, "..", "..", "functions", "lib", "islandApi.js"),
);

function call() {
  return new Promise((done) => {
    const out = {status: 200, body: null};
    const res = {
      set: () => res,
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
      setHeader: () => {},
      getHeader: () => undefined,
      removeHeader: () => {},
      on: () => {},
      once: () => {},
      emit: () => {},
    };
    const req = {
      method: "GET",
      path: "/island-api/fund",
      url: "/island-api/fund",
      originalUrl: "/island-api/fund",
      query: {},
      headers: {},
      get: () => undefined,
      body: {},
      rawBody: Buffer.from(""),
      on: () => {},
      socket: {},
    };
    handler(req, res);
  });
}

/** 日本時間の今日から N 日前の日。札に入る `okDay` はこの形。 */
const jstAgo = (n) =>
  new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000)
    .toISOString()
    .slice(0, 10);

/* `[名前, 札, 日付が乗ってよいか]` */
const CASES = [
  ["今朝入った（0日）", {okDay: jstAgo(0)}, false],
  ["ゆうべ入った（1日）", {okDay: jstAgo(1)}, false],
  ["1晩とばした（2日）", {okDay: jstAgo(2)}, false],
  ["2晩とばした（3日）", {okDay: jstAgo(3)}, true],
  ["6日ぶん止まった", {okDay: jstAgo(6)}, true],
  ["16日ぶん止まった", {okDay: jstAgo(16)}, true],
  ["札がまだ無い", null, false],
  ["札はあるが日付が空", {okDay: ""}, false],
  ["日付が壊れている", {okDay: "きのう"}, false],
  ["日付が未来", {okDay: jstAgo(-2)}, false],
];

(async () => {
  let bad = 0;
  const cols = ["total", "given", "goal", "people", "updatedAt"];
  const want = {
    total: START + SUPERCHAT + DONERU,
    given: SUPERCHAT + DONERU,
    goal: GOAL,
    people: PEOPLE,
    updatedAt: null,
  };
  console.log("いままでの4欄（本番と同じ）:", JSON.stringify(want), "\n");
  for (const [tag, health, wantAsOf] of [
    ...CASES,
    ["Firestore が落ちている", {okDay: jstAgo(9)}, false, true],
  ]) {
    HEALTH = health;
    FS_DOWN = tag === "Firestore が落ちている";
    const r = await call();
    const b = r.body ?? {};
    const same = cols.every((k) => b[k] === want[k]);
    const gotAsOf = Object.prototype.hasOwnProperty.call(b, "doneruAsOf");
    const asOfOk = gotAsOf === wantAsOf &&
      (!wantAsOf || b.doneruAsOf === health.okDay);
    if (!same || !asOfOk) bad++;
    console.log(
      tag.padEnd(24),
      String(r.status).padEnd(4),
      "4欄=" + (same ? "そのまま" : "★変わった★ " + JSON.stringify(b)),
      "doneruAsOf=" + (gotAsOf ? b.doneruAsOf : "（出ていない）"),
      asOfOk ? "" : "★そうであってはいけない★",
    );
  }
  console.log(bad === 0 ? "\nぜんぶ思ったとおり" : `\n${bad}件おかしい`);
  process.exit(bad === 0 ? 0 : 1);
})();
