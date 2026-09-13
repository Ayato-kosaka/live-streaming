/**
 * `GET /island-api/cards` の絵の引き当てを、**偽の Firestore で動かして見る。**
 *
 *   cd functions && npx tsc -p tsconfig.json    # 先に焼く
 *   node tools/cards/iconcheck.cjs
 *
 * #202 / #204 の作り替えで `icon` が `null` と直に書かれたまま、新しい
 * キャラクターの名簿(`islandCharacter`・#284)につなぎ直されていなかった。
 * つなぎ直したのが `functions/src/cards.ts` の `iconsOf`。ここはその口を
 * **本番と同じ形の値**で叩いて、5つを見る。
 *
 *   1. チャンネル名からキャラクターの書類IDが引けて `icon` に入る
 *   2. 引けなかった人は `icon: null` で、**カードは消えない**
 *   3. `name` は「島に名前を出してよい」と言った人だけ。**絵が入っても漏れない**
 *   4. 名簿の読み込みが落ちても、**カードは今までどおり返る**（`icon` が null になるだけ）
 *   5. **枚数を増やしても往復が増えない**（何枚でも2往復）
 *
 * 本番も Firestore も触らない。`@google-cloud/firestore` の入口を差し替えて、
 * **焼いた口そのもの**を呼ぶ(`tools/fund/asofcheck.cjs` と同じ手)。
 */
process.env.GCLOUD_PROJECT = "live-streaming-d3cac";
process.env.FIREBASE_CONFIG = JSON.stringify({projectId: "live-streaming-d3cac"});

const path = require("path");
const F = path.join(__dirname, "..", "..", "functions", "node_modules");
const {DocumentReference, Query, CollectionReference, Firestore} =
  require(path.join(F, "@google-cloud/firestore"));

/* ---- 差し込む中身。**本番と同じ形にする**（#1 と同じ轍を踏まないため）----

   本番(2026-09-12 の `/island-api/cards`)は、カード8枚・`channelId` は8枚とも
   入っていて・`islandChannels` に名前が8人とも在って・`name` は8人とも null。
   ここもその形にして、そこへ「名前の無い人」「名簿に居ない人」を足す。 */

/** 名簿。鍵は `keysOf`（`islandCharacter.ts`）が保存のときに作る形。 */
const CHARACTERS = {
  icon_yuzu: {channelKeys: ["@yuzutatsu", "yuzutatsu"]},
  icon_aoi: {channelKeys: ["@aoi1685", "aoi1685"]},
  icon_nezumi: {channelKeys: ["@nezumi", "nezumi"]},
  // **絵はあるが、チャンネル名が入っていない人**（本番で98人中15人）
  icon_noname: {channelKeys: []},
  // **同じ鍵が2人に付いている**。どちらも使ってはいけない
  icon_same_a: {channelKeys: ["@futari", "futari"]},
  icon_same_b: {channelKeys: ["@futari", "futari"]},
};

/** チャンネル。`islandChannels/{channelId}.name` は毎晩入れ直る。 */
const CHANNELS = {
  UC_yuzu: {name: "@yuzutatsu"},
  // 名簿の側が `@` を持っていて、こちらが持っていない回
  UC_aoi: {name: "aoi1685"},
  UC_nezumi: {name: "@nezumi"},
  // 名簿に居ない人。**この人のカードが消えてはいけない**
  UC_stranger: {name: "@dokonodareka"},
  // 2人に当たる鍵。**当てずっぽうで1人選んではいけない**
  UC_futari: {name: "@futari"},
  // `islandChannels` に書類が無い人（まだ夜の取り込みが回っていない）
};

/** 島に名前を出してよいと言った人。ケースごとに差し替える。 */
let RESIDENTS = [];
/** 名簿の読み込みが落ちる回 */
let CHARS_DOWN = false;
/** 何枚配ってあるか */
let CARDS = [];

/** 往復の数。コレクションごとに数える */
let hits = {};
const hit = (k) => {
  hits[k] = (hits[k] || 0) + 1;
};

const snap = (id, v) => ({id, exists: true, data: () => v});
const gone = (id) => ({id, exists: false, data: () => undefined});

/** コレクション名を、問い合わせからも参照からも同じように取る */
const colOf = (q) =>
  (q._queryOptions && q._queryOptions.collectionId) || q.id || "";

Query.prototype.get = async function () {
  const col = colOf(this);
  hit(col);
  if (col === "islandCards") {
    const docs = CARDS.map((c) => snap(c.id, c.v));
    return {size: docs.length, empty: !docs.length, docs,
      forEach: (f) => docs.forEach(f)};
  }
  if (col === "islandCharacter") {
    if (CHARS_DOWN) throw new Error("firestore unavailable");
    const docs = Object.entries(CHARACTERS).map(([id, v]) => snap(id, v));
    return {size: docs.length, empty: false, docs, forEach: (f) => docs.forEach(f)};
  }
  if (col === "islandUsers") {
    const docs = RESIDENTS.map((u, i) => snap(`uid${i}`, u));
    return {size: docs.length, empty: !docs.length, docs,
      forEach: (f) => docs.forEach(f)};
  }
  return {size: 0, empty: true, docs: [], forEach: () => {}};
};
CollectionReference.prototype.get = Query.prototype.get;

DocumentReference.prototype.get = async function () {
  hit(`${this.parent.id}#doc`);
  return gone(this.id);
};

Firestore.prototype.getAll = async function (...refs) {
  const list = refs.flat();
  if (!list.length) return [];
  hit(`${list[0].parent.id}#getAll`);
  return list.map((r) => {
    const col = r.parent.id;
    if (col === "islandChannels") {
      return CHANNELS[r.id] ? snap(r.id, CHANNELS[r.id]) : gone(r.id);
    }
    if (col === "islandStreamEventImage") {
      return snap(r.id, {
        streamEventId: "ev1", role: "card", note: "",
        url: `https://example.invalid/${r.id}.jpg`, w: 1200, h: 1600,
        at: 1757600000000,
      });
    }
    return gone(r.id);
  });
};

global.fetch = async (u) => {
  throw new Error(`外に出ようとしました: ${u}`);
};

/** 焼いた口を、毎回新しく読み直す（温かいインスタンスの覚えを持ち越さない） */
function freshHandler() {
  const lib = path.join(__dirname, "..", "..", "functions", "lib");
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(lib)) delete require.cache[k];
  }
  return require(path.join(lib, "islandApi.js")).islandApi;
}

function call(handler) {
  return new Promise((done) => {
    const out = {status: 200, body: null, cache: ""};
    const res = {
      set: (k, v) => {
        if (String(k).toLowerCase() === "cache-control") out.cache = v;
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
      setHeader: () => {}, getHeader: () => undefined, removeHeader: () => {},
      on: () => {}, once: () => {}, emit: () => {},
    };
    handler({
      method: "GET", path: "/island-api/cards", url: "/island-api/cards",
      originalUrl: "/island-api/cards", query: {}, headers: {},
      get: () => undefined, body: {}, rawBody: Buffer.from(""),
      on: () => {}, socket: {},
    }, res);
  });
}

/** その日の n 人ぶんのカードを作る。**同じ人が何日ももらう**形にする */
function cards(days, people) {
  const out = [];
  for (const day of days) {
    for (const [i, ch] of people.entries()) {
      out.push({
        id: `im_${day}__${ch}`,
        v: {
          day, channelId: ch, streamEventImageId: `im_${day}`,
          streamEventId: "ev1", earnedAt: 1757600000000 + i,
          x: 0.8, y: 0.92, rot: 1, scale: 1,
        },
      });
    }
  }
  return out;
}

const PEOPLE = ["UC_yuzu", "UC_aoi", "UC_nezumi", "UC_stranger", "UC_futari",
  "UC_notyet"];

const show = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(" ");

(async () => {
  let bad = 0;
  const ng = (why) => {
    bad++;
    console.log(`   ★ ${why}`);
  };

  /* ---- 1〜3. 本番と同じ形（名前を出してよいと言った人は0人） ---- */
  CARDS = cards(["2026-09-11"], PEOPLE);
  RESIDENTS = [];
  CHARS_DOWN = false;
  hits = {};
  let r = await call(freshHandler());
  let list = r.body.cards;
  console.log("① 本番と同じ形（同意した人0人・カード6枚）");
  console.log("   問い合わせ:", show(hits));
  for (const c of list) {
    console.log(`   ${c.channelId.padEnd(12)} icon=${String(c.icon).padEnd(12)}` +
      ` name=${String(c.name)}`);
  }
  const want = {
    UC_yuzu: "icon_yuzu", UC_aoi: "icon_aoi", UC_nezumi: "icon_nezumi",
    UC_stranger: null, UC_futari: null, UC_notyet: null,
  };
  if (list.length !== PEOPLE.length) ng(`カードが ${list.length}枚になった（6枚のはず）`);
  for (const c of list) {
    if (c.icon !== want[c.channelId]) {
      ng(`${c.channelId} の icon が ${c.icon}（${want[c.channelId]} のはず）`);
    }
    if (c.name !== null) ng(`${c.channelId} の名前が漏れた`);
  }
  if (hits["islandCharacter"] !== 1 || hits["islandChannels#getAll"] !== 1) {
    ng("絵の引き当てが2往復で収まっていない");
  }

  /* ---- 3. 同意した人が1人いる回。**その1人だけ名前が出る** ---- */
  RESIDENTS = [{channelId: "UC_yuzu", name: "ゆずたつ", showName: true},
    {channelId: "UC_aoi", name: "あおい", showName: false, showPhoto: true}];
  hits = {};
  r = await call(freshHandler());
  list = r.body.cards;
  console.log("\n② 「名前を出してよい」と言った人が1人いる回");
  for (const c of list) {
    console.log(`   ${c.channelId.padEnd(12)} icon=${String(c.icon).padEnd(12)}` +
      ` name=${String(c.name)}`);
  }
  for (const c of list) {
    const wantName = c.channelId === "UC_yuzu" ? "ゆずたつ" : null;
    if (c.name !== wantName) ng(`${c.channelId} の名前が ${c.name}`);
    if (c.icon !== want[c.channelId]) ng(`${c.channelId} の icon が変わった`);
  }

  /* ---- 4. 名簿の読み込みが落ちた回 ---- */
  RESIDENTS = [];
  CHARS_DOWN = true;
  hits = {};
  r = await call(freshHandler());
  list = r.body.cards;
  console.log("\n③ キャラクターの名簿が落ちている回");
  console.log("   status:", r.status, "枚数:", list.length,
    "icon が入った枚数:", list.filter((c) => c.icon).length);
  if (r.status !== 200) ng(`status が ${r.status} になった`);
  if (list.length !== PEOPLE.length) ng(`カードが ${list.length}枚に減った`);
  if (list.some((c) => c.icon)) ng("落ちているのに icon が入った");
  if (list.some((c) => !c.url)) ng("写真まで落ちた");

  /* ---- 5. 枚数を変えて、往復が増えないこと ---- */
  CHARS_DOWN = false;
  console.log("\n④ 枚数を変えても往復が増えないか");
  const seen = [];
  for (const days of [["2026-09-11"], ["2026-09-11", "2026-09-10",
    "2026-09-09", "2026-09-08", "2026-09-07", "2026-09-06", "2026-09-05",
    "2026-09-04", "2026-09-03", "2026-09-02"]]) {
    CARDS = cards(days, PEOPLE);
    hits = {};
    r = await call(freshHandler());
    const n = r.body.cards.length;
    const all = Object.values(hits).reduce((a, b) => a + b, 0);
    seen.push(all);
    console.log(`   カード ${String(n).padStart(3)}枚 → 往復 ${all}本 …`,
      show(hits), `/ icon が入った ${r.body.cards.filter((c) => c.icon).length}枚`);
  }
  if (seen[0] !== seen[1]) ng(`枚数で往復が変わった（${seen[0]} → ${seen[1]}）`);

  /* ---- おまけ。**温かいインスタンスは名簿を覚える** ---- */
  console.log("\n⑤ 同じインスタンスで2回目（名簿は覚えている・名前は引き直す）");
  const warm = freshHandler();
  hits = {};
  await call(warm);
  const first = {...hits};
  hits = {};
  await call(warm);
  console.log("   1回目:", show(first), "\n   2回目:", show(hits));
  if (hits["islandCharacter"]) ng("2回目も名簿を読みに行っている");
  if (hits["islandChannels#getAll"] !== 1) ng("2回目に名前を引き直していない");

  console.log(bad === 0 ? "\nぜんぶ思ったとおり" : `\n${bad}件おかしい`);
  process.exit(bad === 0 ? 0 : 1);
})();
