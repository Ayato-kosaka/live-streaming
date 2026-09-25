/**
 * 豚の貯金箱の出し入れ（`functions/src/fundDesk.ts`）の確かめ。
 * **偽の Firestore に実際に書かせて、書いた中身を見る。**
 *
 * ## 何を見ているか（判定の足）
 *
 * 1. **2回入れても増えない** — 同じ出費・同じ目標・同じスパチャを2回投げて、
 *    件数も合計も1円も動かないこと。書類IDが中身から決まっているか
 * 2. **入れてはいけないものが入らない** — 0円・マイナス・小数・桁あふれ・
 *    空の題・形の違う日付・**暦に無い日**（`2026-02-31`）
 * 3. **消すのは書類IDを指したときだけ** — 一覧を丸ごと消す道が無いこと。
 *    無い書類は 404、`/` を含む字は書類IDとして受けないこと
 * 4. **あやと以外は通らない** — 口の中で `ownerUid` を通らない枝が無いこと
 *    （**本物の合言葉で通す確かめは `fund_owner_selftest.mjs`。**
 *    あちらは `lib/islandApi.js` を丸ごと起こして、本物の `ownerUid` を通す）
 * 5. **焼き直しが `python/fund_daily.py` と同じ数を書く** — スパチャの半分・
 *    支出の符号を反転した起点・いちばん新しい開いている目標。
 *    **ここが違うと、毎晩この口と掃除で額が行ったり来たりする**
 * 6. **手入れのスパチャに `claim` 札が付く** — 付けないと、翌晩の掃除が
 *    BigQuery から同じスパチャを拾って**2件になる**
 * 7. **焼き直しがこけても、書いたことを取り消さない**
 * 8. **ログに素性が1文字も出ない** — 名前・題・額・日付・書類ID
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。出てくるのは
 * 仕込んだ偽の字だけ。**本番には1バイトも書かない**（Firestore は偽物）。
 *
 * ## 対照（足を1本ずつ壊す）
 *
 * `lib/fundDesk.js` の写しを9通りに壊して、**そのたびに、狙った確かめが
 * 名指しで NG になる**ところまで見る。終了コードだけを見ると
 * 「どこか赤くなった」しか分からないので、子の出力からその行を探す。
 *
 * ```bash
 * node functions/selftest/fund_desk_selftest.mjs
 * ```
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い
 */

import {execFileSync, spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync}
  from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** `lib` の置き場。**壊した写しで回すときだけ、ここを差し替える。** */
const LIB = process.env.FUND_LIB_DIR || join(FUNCTIONS, "lib");
/** 写しで回すときは `tsc` を通さない（差し替えた `lib` を焼き直してしまう） */
const BUILD = !process.env.FUND_LIB_DIR;
/** 対照を回すのは、本物の `lib` で回した親だけ（子が孫を起こさないため） */
const CONTROL = !process.env.FUND_LIB_DIR;

let ok = 0;
let bad = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
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
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

/* ---------------- 偽の Firestore ---------------- */

/** `orderBy(FieldPath.documentId())` の印。 */
const DOC_ID = {__docId: true};

/**
 * 1つの筋書き。**入れ物も読み込みも、筋書きごとに作り直す。**
 * @param {object} store コレクション名 → 書類ID → 中身（**ぜんぶ偽の字**）
 * @param {object} [opt] `owner` を null にすると、あやとでない人として叩く。
 *   `breakRebake` を立てると、焼き直しの書き込みだけが落ちる
 * @return {object} 口と、書いたものの控え
 */
function scenario(store, opt = {}) {
  const owner = "owner" in opt ? opt.owner : "ayato-uid";
  /** 書いたもの。**本番には出ない** */
  const writes = [];
  const logs = [];

  const docsOf = (name) => Object.entries(store[name] ?? {});
  const snapOf = (id, v) => ({
    id,
    exists: !!v,
    data: () => v,
    get: (k) => (v ? v[k] : undefined),
  });

  const query = (name, q) => ({
    orderBy: (f, dir) =>
      query(name, {...q, order: [...(q.order ?? []), [f, dir ?? "asc"]]}),
    startAfter: (...v) => query(name, {...q, after: v}),
    limit: (n) => query(name, {...q, limit: n}),
    aggregate: (spec) => ({
      get: async () => {
        const rows = docsOf(name);
        const out = {};
        for (const [k, f] of Object.entries(spec)) {
          if (f.op === "count") out[k] = rows.length;
          else {
            out[k] = rows.reduce((a, [, v]) => {
              const n = Number(v[f.field]);
              return a + (Number.isFinite(n) ? n : 0);
            }, 0);
          }
        }
        return {data: () => out};
      },
    }),
    get: async () => {
      let rows = docsOf(name).map(([id, v]) => snapOf(id, v));
      for (const [f, dir] of [...(q.order ?? [])].reverse()) {
        const key = (d) => (f === DOC_ID ? d.id : String(d.data()[f] ?? ""));
        rows.sort((a, b) =>
          dir === "desc" ? key(b).localeCompare(key(a)) :
            key(a).localeCompare(key(b)));
      }
      if (q.after) {
        const [d0, i0] = q.after;
        rows = rows.filter((d) => {
          const day = String(d.data().day ?? "");
          if (day !== d0) return day < d0;
          return d.id < i0;
        });
      }
      if (q.limit !== undefined) rows = rows.slice(0, q.limit);
      return {
        size: rows.length,
        empty: rows.length === 0,
        docs: rows,
        forEach: (f) => rows.forEach(f),
      };
    },
  });

  const db = {
    collection: (name) => ({
      ...query(name, {}),
      doc: (id) => ({
        id,
        get: async () => snapOf(id, store[name]?.[id]),
        set: async (data, o) => {
          if (opt.breakRebake && name === "island") {
            throw new Error("焼き直しだけ落ちる（偽）");
          }
          writes.push({col: name, id, data, merge: !!(o ?? {}).merge});
          store[name] = store[name] ?? {};
          store[name][id] = (o ?? {}).merge ?
            {...(store[name][id] ?? {}), ...data} :
            {...data};
        },
        delete: async () => {
          writes.push({col: name, id, del: true});
          delete store[name]?.[id];
        },
      }),
    }),
  };

  const admin = {
    apps: [],
    initializeApp: () => {
      admin.apps.push({});
    },
    firestore: Object.assign(() => db, {
      FieldPath: {documentId: () => DOC_ID},
      AggregateField: {
        count: () => ({op: "count"}),
        sum: (field) => ({op: "sum", field}),
      },
    }),
  };

  const functions = {
    logger: {
      warn: (...a) => logs.push(a.join(" ")),
      info: (...a) => logs.push(a.join(" ")),
      error: (...a) => logs.push(a.join(" ")),
    },
  };

  const loaded = new Map();
  const load = (name) => {
    if (loaded.has(name)) return loaded.get(name);
    const file = join(LIB, `${name}.js`);
    const src = readFileSync(file, "utf8");
    const mod = {exports: {}};
    loaded.set(name, mod.exports);
    const req = (id) => {
      if (id === "firebase-admin") return admin;
      if (id === "firebase-functions") return functions;
      if (id.startsWith("./")) return load(id.slice(2));
      // crypto だけは本物（書類IDの sha1）
      return createRequire(import.meta.url)(id);
    };
    new Function(
      "require", "exports", "module", "__filename", "__dirname", src,
    )(req, mod.exports, mod, file, dirname(file));
    loaded.set(name, mod.exports);
    return mod.exports;
  };

  const mod = load("fundDesk");
  for (const f of ["handleFundDesk", "spendId", "manualId", "claimKey"]) {
    if (typeof mod[f] !== "function") {
      console.error(`lib/fundDesk.js から ${f} を取り出せなかった`);
      process.exit(2);
    }
  }

  /**
   * 口を1回叩く。
   * @param {string} method GET / POST / DELETE
   * @param {string} path `/fund/...`
   * @param {object} [body] 本文
   * @param {object} [q] クエリ
   * @return {Promise<object>} 状態・本文・扱ったか
   */
  const call = async (method, path, body = {}, q = {}) => {
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
        return res;
      },
    };
    out.took = await mod.handleFundDesk(
      {method, path, auth: "Bearer x", query: q, body},
      res,
      {
        ownerUid: async () => owner,
        // Doneru は外の API。**見張りから外へは1バイトも出さない**
        doneruNow: async () => 1000,
      },
    );
    return out;
  };

  return {call, writes, logs, store, mod};
}

import {createRequire} from "node:module";

/* ---------------- 仕込む中身（ぜんぶ偽の字） ---------------- */

/** スパチャの控え2件。**名前も額も偽物** */
const CHATS = {
  "AAAAAAAAAAAAAAAAAAAAAAAAAA": {yen: 1001, day: "2026-09-10", who: "さくら"},
  "BBBBBBBBBBBBBBBBBBBBBBBBBB": {yen: 500, day: "2026-09-11", who: "うめ"},
};
/** 出費1件 */
const SPENDS = {"2026-09-01-deadbeef": {day: "2026-09-01", title: "宿代", yen: 400}};
/** 目標1件（開いている） */
const GOALS = {"2026-07-27": {from: "2026-07-27", label: "きたへいきたい", yen: 50000}};

/** 筋書きごとに新しい写しを作る（前の組の書き込みを持ち越さない） */
const seed = () => ({
  islandFundSuperChats: {...CHATS},
  islandFundSpends: {...SPENDS},
  islandFundGoals: {...GOALS},
  island: {},
});

/** 焼き直しの値を取り出す。 */
const boxOf = (s) => s.store.island?.state?.fund?.box ?? null;

console.log("\n# 1. あやと以外は、どの枝も通らない（**先に見る**）");
{
  const ways = [
    ["GET", "/fund/desk"],
    ["GET", "/fund/spends"],
    ["POST", "/fund/spends"],
    ["DELETE", "/fund/spends/2026-09-01-deadbeef"],
    ["POST", "/fund/goals"],
    ["POST", "/fund/goals/2026-07-27/close"],
    ["DELETE", "/fund/goals/2026-07-27"],
    ["POST", "/fund/chats"],
    ["DELETE", "/fund/chats/AAAAAAAAAAAAAAAAAAAAAAAAAA"],
  ];
  let no403 = [];
  let wrote = [];
  for (const [m, p] of ways) {
    const s = scenario(seed(), {owner: null});
    const r = await s.call(m, p, {day: "2026-09-12", title: "宿代", yen: 400});
    if (r.status !== 403) no403.push(`${m} ${p}=${r.status}`);
    if (s.writes.length) wrote.push(`${m} ${p}`);
  }
  check(`9とおりぜんぶ 403（分母 ${ways.length}）`, no403.length === 0,
    no403.join(" / "));
  check("403 の道で1バイトも書いていない", wrote.length === 0, wrote.join(" / "));
}

console.log("\n# 2. 2回入れても増えない");
{
  const s = scenario(seed());
  const one = {day: "2026-09-12", title: "宿代", yen: 4000};
  const a = await s.call("POST", "/fund/spends", one);
  const b = await s.call("POST", "/fund/spends", one);
  check("1回目は 200", a.status === 200, String(a.status));
  check("2回目も 200（断らない）", b.status === 200, String(b.status));
  check("書類IDが同じ", a.body.spend.id === b.body.spend.id,
    `${a.body?.spend?.id} / ${b.body?.spend?.id}`);
  check("1回目は「初めて」、2回目は「既にある」",
    a.body.already === false && b.body.already === true,
    `${a.body?.already} / ${b.body?.already}`);
  check("件数が増えていない（1件足して 2件）",
    boxOf(s).spendCount === 2, `spendCount=${boxOf(s)?.spendCount}`);
  check("合計が増えていない（400 + 4,000）",
    boxOf(s).spend === 4400, `spend=${boxOf(s)?.spend}`);

  const c = scenario(seed());
  const chat = {day: "2026-09-12", yen: 1000, who: "さくら"};
  const c1 = await c.call("POST", "/fund/chats", chat);
  const c2 = await c.call("POST", "/fund/chats", chat);
  check("スパチャも書類IDが同じ", c1.body.chat.id === c2.body.chat.id,
    `${c1.body?.chat?.id} / ${c2.body?.chat?.id}`);
  check("スパチャの件数が増えていない（2件 + 1件）",
    boxOf(c).count === 3, `count=${boxOf(c)?.count}`);
  check("スパチャの合計が増えていない（1001+500+1000）",
    boxOf(c).superchatFull === 2501, `full=${boxOf(c)?.superchatFull}`);

  const g = scenario(seed());
  const goal = {from: "2026-10-01", label: "つぎのたび", yen: 30000};
  await g.call("POST", "/fund/goals", goal);
  await g.call("POST", "/fund/goals", goal);
  check("目標も2件にならない",
    Object.keys(g.store.islandFundGoals).length === 2,
    Object.keys(g.store.islandFundGoals).join(","));
}

console.log("\n# 3. 入れてはいけないものが入らない");
{
  /** [名前, 叩く先, 本文, 断ってほしい理由] */
  const NG = [
    ["0円", "/fund/spends", {day: "2026-09-12", title: "宿代", yen: 0}, "yen"],
    ["マイナス", "/fund/spends", {day: "2026-09-12", title: "宿代", yen: -5}, "yen"],
    ["小数", "/fund/spends", {day: "2026-09-12", title: "宿代", yen: 1.5}, "yen"],
    ["字の額", "/fund/spends", {day: "2026-09-12", title: "宿代", yen: "千円"}, "yen"],
    ["桁あふれ", "/fund/spends",
      {day: "2026-09-12", title: "宿代", yen: 99999999}, "yen"],
    ["空の題", "/fund/spends", {day: "2026-09-12", title: "  ", yen: 400}, "title"],
    ["題が無い", "/fund/spends", {day: "2026-09-12", yen: 400}, "title"],
    ["日付が0埋めでない", "/fund/spends",
      {day: "2026-9-2", title: "宿代", yen: 400}, "day"],
    ["暦に無い日", "/fund/spends",
      {day: "2026-02-31", title: "宿代", yen: 400}, "day"],
    ["日付が字", "/fund/spends", {day: "きょう", title: "宿代", yen: 400}, "day"],
    ["日付が無い", "/fund/spends", {title: "宿代", yen: 400}, "day"],
    ["スパチャの0円", "/fund/chats", {day: "2026-09-12", yen: 0}, "yen"],
    ["スパチャの暦に無い日", "/fund/chats",
      {day: "2026-02-31", yen: 500}, "day"],
    ["目標の0円", "/fund/goals",
      {from: "2026-10-01", label: "たび", yen: 0}, "yen"],
    ["目標の空の名前", "/fund/goals",
      {from: "2026-10-01", label: "", yen: 300}, "label"],
    ["目標の暦に無い日", "/fund/goals",
      {from: "2026-02-31", label: "たび", yen: 300}, "from"],
  ];
  for (const [name, path, body, why] of NG) {
    const s = scenario(seed());
    const r = await s.call("POST", path, body);
    check(`${name} は入らない`,
      r.status === 400 && r.body?.error === why && s.writes.length === 0,
      `${r.status} ${JSON.stringify(r.body)} 書いた回数=${s.writes.length}`);
  }
  // 通ってよいもので落ちないこと（片側だけは対照ではない）
  {
    const s = scenario(seed());
    const r = await s.call("POST", "/fund/spends",
      {day: "2024-02-29", title: "うるう日の宿", yen: 1});
    check("うるう年の 2/29 と1円は通る", r.status === 200,
      `${r.status} ${JSON.stringify(r.body)}`);
  }
  {
    const s = scenario(seed());
    const r = await s.call("POST", "/fund/spends",
      {day: "2026-09-12", title: "上限ちょうど", yen: 10000000});
    check("上限ちょうど（1,000万円）は通る", r.status === 200, String(r.status));
  }
}

console.log("\n# 4. 消すのは、書類IDを指したときだけ");
{
  {
    const s = scenario(seed());
    const r = await s.call("DELETE", "/fund/spends");
    check("行き先を指さない DELETE は、まとめて消さない",
      r.status === 405 && Object.keys(s.store.islandFundSpends).length === 1,
      `${r.status} 残り=${Object.keys(s.store.islandFundSpends).length}`);
  }
  {
    const s = scenario(seed());
    const r = await s.call("DELETE", "/fund/spends/2026-09-01-nosuch");
    check("無い書類は 404（書かない）",
      r.status === 404 && s.writes.length === 0,
      `${r.status} 書いた回数=${s.writes.length}`);
  }
  {
    const s = scenario(seed());
    const r = await s.call("DELETE", "/fund/spends/2026-09-01-deadbeef");
    check("指した1件だけ消える",
      r.status === 200 && Object.keys(s.store.islandFundSpends).length === 0,
      `${r.status} 残り=${Object.keys(s.store.islandFundSpends).length}`);
    check("消したあと、焼き直しが 0 円になっている",
      boxOf(s)?.spend === 0 && boxOf(s)?.start === 0,
      JSON.stringify(boxOf(s)));
  }
  {
    const s = scenario(seed());
    const r = await s.call("DELETE", "/fund/chats/AAAAAAAAAAAAAAAAAAAAAAAAAA");
    check("スパチャも1件だけ消える",
      r.status === 200 &&
      Object.keys(s.store.islandFundSuperChats).length === 1,
      `${r.status} 残り=${Object.keys(s.store.islandFundSuperChats).length}`);
  }
  {
    const s = scenario(seed());
    const r = await s.call("DELETE", "/fund/goals/2026-07-27");
    check("打ち間違えた目標は消せる",
      r.status === 200 && Object.keys(s.store.islandFundGoals).length === 0,
      `${r.status} 残り=${Object.keys(s.store.islandFundGoals).length}`);
  }
}

console.log("\n# 5. 焼き直しが、毎晩の掃除と同じ数を書く");
{
  const s = scenario(seed());
  await s.call("POST", "/fund/spends",
    {day: "2026-09-12", title: "宿代", yen: 4000});
  const b = boxOf(s);
  check("スパチャの半分（1001+500=1501 → 750）", b.superchat === 750,
    `superchat=${b?.superchat}`);
  check("半分にする前も持っている（1501）", b.superchatFull === 1501,
    `full=${b?.superchatFull}`);
  check("起点は支出の合計の符号を反転した負の数（-4400）", b.start === -4400,
    `start=${b?.start}`);
  check("いま走っている目標が入る",
    b.goal?.label === "きたへいきたい" && b.goal?.yen === 50000,
    JSON.stringify(b?.goal));
  check("焼き直した日が `YYYY-MM-DD`", /^\d{4}-\d{2}-\d{2}$/.test(b.updatedAt),
    String(b?.updatedAt));
  check("`fund.box` の下にだけ書いている（`fund.people` を潰さない）",
    s.writes.some((w) => w.col === "island" && w.merge &&
      Object.keys(w.data.fund).join(",") === "box"),
    JSON.stringify(s.writes.filter((w) => w.col === "island").map((w) => w.data)));

  // 目標を閉じたら「いまの目標」は無くなる
  const c = scenario(seed());
  const r = await c.call("POST", "/fund/goals/2026-07-27/close",
    {to: "2026-09-27"});
  check("閉じると 200", r.status === 200, String(r.status));
  check("閉じたら、焼き直しの目標が無くなる", boxOf(c).goal === null,
    JSON.stringify(boxOf(c)?.goal));
  check("閉じても台帳には残る（いつからいつまで、が読める）",
    c.store.islandFundGoals["2026-07-27"].to === "2026-09-27",
    JSON.stringify(c.store.islandFundGoals["2026-07-27"]));

  // いちばん新しい `from` が開いていれば、それが「いまの目標」
  const n = scenario(seed());
  await n.call("POST", "/fund/goals/2026-07-27/close", {to: "2026-09-27"});
  await n.call("POST", "/fund/goals",
    {from: "2026-09-28", label: "つぎのたび", yen: 30000});
  check("次の目標を立てると、そちらが入る",
    boxOf(n).goal?.label === "つぎのたび", JSON.stringify(boxOf(n)?.goal));

  // 閉じる日の形も見る
  const t = scenario(seed());
  const tr = await t.call("POST", "/fund/goals/2026-07-27/close",
    {to: "2026-02-31"});
  check("閉じる日が暦に無ければ断る", tr.status === 400 && tr.body.error === "to",
    `${tr.status} ${JSON.stringify(tr.body)}`);
  const tn = scenario(seed());
  const tnr = await tn.call("POST", "/fund/goals/2026-12-01/close",
    {to: "2026-12-02"});
  check("無い目標は閉じられない（404）", tnr.status === 404, String(tnr.status));
}

console.log("\n# 6. 手入れのスパチャに、二重よけの札が付く");
{
  const s = scenario(seed());
  const r = await s.call("POST", "/fund/chats",
    {day: "2026-09-12", yen: 1000, who: "さくら"});
  const wrote = s.store.islandFundSuperChats[r.body.chat.id];
  check("`claim` が「日付|額」", wrote.claim === "2026-09-12|1000",
    JSON.stringify(wrote.claim));
  check("`claimedBy` は空（まだ誰も使っていない）", wrote.claimedBy === null,
    JSON.stringify(wrote.claimedBy));
  check("`src` が `manual`", wrote.src === "manual", String(wrote.src));
  check("時刻は日の始まり（分からない時刻を作らない）",
    wrote.at === "2026-09-12T00:00:00+09:00", String(wrote.at));
}

console.log("\n# 7. 焼き直しがこけても、書いたことを取り消さない");
{
  const s = scenario(seed(), {breakRebake: true});
  const r = await s.call("POST", "/fund/spends",
    {day: "2026-09-12", title: "宿代", yen: 4000});
  check("200 で返る（書けているので）", r.status === 200, String(r.status));
  check("台帳には入っている",
    !!s.store.islandFundSpends[r.body?.spend?.id],
    Object.keys(s.store.islandFundSpends).join(","));
  check("焼き直しは `null`（0 を作らない）", r.body.box === null,
    JSON.stringify(r.body?.box));
}

console.log("\n# 8. 読む口が、焼き直しと台帳をそのまま返す");
{
  const s = scenario(seed());
  const r = await s.call("GET", "/fund/desk");
  check("200 で返る", r.status === 200, String(r.status));
  check("誰の手元にも焼き付けない", r.headers["cache-control"] === "no-store",
    String(r.headers["cache-control"]));
  check("出費が並ぶ", r.body.spends?.length === 1,
    JSON.stringify(r.body?.spends?.length));
  check("目標が並ぶ（閉じたものも）", r.body.goals?.length === 1,
    JSON.stringify(r.body?.goals?.length));
  check("Doneru の額が入る", r.body.doneru === 1000, String(r.body?.doneru));
  // 続きの位置
  const big = seed();
  for (let i = 0; i < 25; i++) {
    big.islandFundSpends[`2026-08-${String(i + 1).padStart(2, "0")}-aaaaaaaa`] =
      {day: `2026-08-${String(i + 1).padStart(2, "0")}`, title: "x", yen: 1};
  }
  const p = scenario(big);
  const p1 = await p.call("GET", "/fund/desk");
  check("1ページ目は 12件で、続きがあると言う",
    p1.body.spends.length === 12 && p1.body.more === true && !!p1.body.next,
    `${p1.body?.spends?.length} more=${p1.body?.more}`);
  const p2 = await p.call("GET", "/fund/spends", {}, {
    before: p1.body.next, limit: 40,
  });
  check("続きは残り14件で、そこで終わる",
    p2.body.spends.length === 14 && p2.body.more === false,
    `${p2.body?.spends?.length} more=${p2.body?.more}`);
  const ids = new Set([...p1.body.spends, ...p2.body.spends].map((x) => x.id));
  check("2ページで、置いてある26件を1件も落とさず1回ずつ", ids.size === 26,
    `${ids.size}`);
}

console.log("\n# 9. ログに、素性が1文字も出ない");
{
  const s = scenario(seed());
  await s.call("POST", "/fund/spends",
    {day: "2026-09-12", title: "ひみつの宿", yen: 4000});
  await s.call("POST", "/fund/chats",
    {day: "2026-09-12", yen: 1000, who: "ひみつの名前"});
  await s.call("DELETE", "/fund/spends/2026-09-01-deadbeef");
  const text = s.logs.join("\n");
  for (const [what, pat] of [
    ["名前", "ひみつの名前"],
    ["題", "ひみつの宿"],
    ["額", "4000"],
    ["日付", "2026-09-12"],
    ["書類ID", "deadbeef"],
  ]) {
    check(`ログに${what}が出ていない`, !text.includes(pat), text.slice(0, 160));
  }
  console.log(`  （読んだログは ${text.length} 字 / ${s.logs.length} 行）`);
}

/* ---------------- 対照 ---------------- */

/**
 * 壊しかた。[名前, 探す字, 置き換える字, 落ちてほしい確かめ]。
 *
 * **狙った行が名指しで NG になる**ところまで見る。終了コードだけだと
 * 「どこか赤くなった」しか言えないので、壊したのと関係ない行が落ちても
 * 対照が通ってしまう。
 */
const BREAKS = [
  [
    "あやとかを見るのをやめる",
    "if (!(await deps.ownerUid(q.auth))) {",
    "if (false) {",
    "9とおりぜんぶ 403（分母 9）",
  ],
  [
    "書類IDを中身から決めるのをやめる（出費）",
    "const spendId = (day, title, yen) => `${day}-${sha8(`${day}|${title}|${yen}`)}`;",
    "const spendId = (day, title, yen) => `${day}-${Math.random()}`;",
    "書類IDが同じ",
  ],
  [
    "書類IDを中身から決めるのをやめる（スパチャ）",
    "const manualId = (day, yen, who) => `manual-${day.replace(/-/g, \"\")}-${sha8(`${day}|${yen}|${who}`)}`;",
    "const manualId = (day, yen, who) => `manual-${Math.random()}`;",
    "スパチャも書類IDが同じ",
  ],
  [
    "0円を受け口で通す",
    "if (!yen) {",
    "if (false) {",
    "0円 は入らない",
  ],
  [
    "額の検めをやめる（小数も桁あふれも通る）",
    "if (!Number.isInteger(n) || n <= 0 || n > YEN_MAX)",
    "if (false)",
    "小数 は入らない",
  ],
  [
    "空の題を通す",
    "if (!title) {",
    "if (false) {",
    "空の題 は入らない",
  ],
  [
    "暦を見ないで日付を通す",
    "return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;",
    "return true;",
    "暦に無い日 は入らない",
  ],
  [
    "焼き直しで半分にしない",
    "superchat: Math.floor(full / SUPERCHAT_RATE),",
    "superchat: full,",
    "スパチャの半分（1001+500=1501 → 750）",
  ],
  [
    "起点の符号を落とす",
    "start: -spend,",
    "start: spend,",
    "起点は支出の合計の符号を反転した負の数（-4400）",
  ],
  [
    "二重よけの札を付けない",
    "claim: (0, exports.claimKey)(day, yen),",
    "claim: \"\",",
    "`claim` が「日付|額」",
  ],
  [
    "ログに題を出す",
    "firebase_functions_1.logger.info(`fund desk: spend ${had ? \"same\" : \"new\"}`);",
    "firebase_functions_1.logger.info(`fund desk: spend ${title}`);",
    "ログに題が出ていない",
  ],
];

if (CONTROL) {
  console.log("\n# 対照（壊した写しで回して、狙った行が赤くなるか）");
  const src = readFileSync(join(LIB, "fundDesk.js"), "utf8");

  /**
   * `lib` の写しを1つ作る。**`node_modules` を隣に置く**（写しの中の
   * `require("firebase-admin")` が上へ登って見つけられるように）。
   * @param {string|null} broken 壊した `fundDesk.js`。null ならそのまま
   * @return {string} 写しの置き場
   */
  const copyLib = (broken) => {
    const box = mkdtempSync(join(tmpdir(), "fundlib-"));
    cpSync(LIB, box, {recursive: true});
    try {
      symlinkSync(join(FUNCTIONS, "node_modules"), join(box, "node_modules"));
    } catch {
      /* 既に在るなら、そのまま */
    }
    if (broken !== null) writeFileSync(join(box, "fundDesk.js"), broken, "utf8");
    return box;
  };

  /* **まず「壊していない写し」が緑であること。** 写しを作る途中で壊れても
     終了コードは同じなので、ここを見ないと対照にならない（#99） */
  {
    const box = copyLib(null);
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, FUND_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status} / ${(run.stdout ?? "").slice(-200)}`);
  }

  for (const [what, from, to, want] of BREAKS) {
    if (!src.includes(from)) {
      // **壊す字が当たらない＝何も測っていない。** 緑で通さない
      check(`${what}: 壊す字が当たる`, false,
        `lib/fundDesk.js に「${from}」が無い`);
      continue;
    }
    const box = copyLib(src.replace(from, to));
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, FUND_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    const hit = (run.stdout ?? "").includes(`NG   ${want}`);
    check(`${what}: 「${want}」が赤くなる`, run.status === 1 && hit,
      `終了コード ${run.status} / その行が赤い: ${hit}`);
  }
}

console.log(`\n通った ${ok}件 / 落ちた ${bad}件`);
if (ok === 0) {
  console.log("数えるものが1件も無かった。");
  process.exit(2);
}
process.exit(bad ? 1 : 0);
