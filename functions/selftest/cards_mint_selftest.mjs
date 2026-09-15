/**
 * カードを焼くところ（`streamEvents.ts` の `mintCards` / `mintForImage`）の
 * 確かめ。**偽の Firestore に実際に書かせて、書いた中身を見る。**
 *
 * ## 何を見ているか
 *
 * 1. **投げたときの名乗りが、カードの書類に焼き込まれる**
 *    （台帳の `displayNameSnapshot` → カードの `nameSnapshot`）。
 *    公開の面に乗る絵はこれだけから決まる（`cards.ts` の `iconsOf`）ので、
 *    焼けていないと**いま絵が出ている人が全員消える**
 * 2. **写しを持たない古い書類にも、あとから足される**（本番の51枚がこれ）
 * 3. **`x` / `y` / `rot` / `scale` を1つも書き換えない。**
 *    書き換えると、視聴者さんが動かしたカードが元に戻る
 * 4. 何も変わっていない書類には、**1バイトも書かない**（毎晩の空回しで
 *    全枚数を書き直さない）
 * 5. 名乗りを持たない投げ銭（Doneru の無記名）でも落ちず、`null` が入る
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。出てくるのは
 * 仕込んだ `UC_a_000000001` `さくら` だけ。**本番には1バイトも書かない**
 * （Firestore は偽物で、`commit()` は袋に入れるだけ）。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * ```bash
 * node functions/selftest/cards_mint_selftest.mjs
 * CARDS_LIB_DIR=/tmp/brokenlib node functions/selftest/cards_mint_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** `lib` の置き場。**落ちることを確かめる写しだけ、ここを差し替えて回す。** */
const LIB = process.env.CARDS_LIB_DIR || join(FUNCTIONS, "lib");
/** 写しで回すときは `tsc` を通さない（差し替えた `lib` を焼き直してしまう） */
const BUILD = !process.env.CARDS_LIB_DIR;

/** 置き方の欄。**ここが書き込みに1つでも出たら落とす。** */
const PLACE = ["x", "y", "rot", "scale"];

let bad = 0;
let ok = 0;

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
const nodeRequire = createRequire(import.meta.url);

/**
 * 1つの筋書き。**入れ物も読み込みも、筋書きごとに作り直す。**
 * @param {object} store コレクション名 → 書類ID → 中身（**ぜんぶ偽の字**）
 * @return {object} `streamEvents` の中身と、書いたものの控え
 */
function scenario(store) {
  /** 書いたもの。`{id, data, merge}` の並び。**本番には出ない** */
  const writes = [];
  /** `commit()` を呼んだ回数。0 なら1バイトも書いていない */
  let commits = 0;

  const snapOf = (id, v) => ({
    id,
    exists: !!v,
    data: () => v,
    get: (k) => (v ? v[k] : undefined),
  });

  const query = (name, q) => ({
    select: (...f) => query(name, {...q, select: f}),
    where: (f, op, v) =>
      query(name, {...q, where: [...(q.where ?? []), [f, op, v]]}),
    orderBy: (f, dir) => query(name, {...q, order: [f, dir ?? "asc"]}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      let rows = Object.entries(store[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, op, v] of q.where ?? []) {
        if (op === "==") rows = rows.filter((d) => d.data()[f] === v);
        else if (op === "in") rows = rows.filter((d) => v.includes(d.data()[f]));
        else throw new Error(`偽の Firestore は ${op} を持たない`);
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
        _c: name,
        get: async () => snapOf(id, store[name]?.[id]),
      }),
    }),
    getAll: async (...refs) =>
      refs.map((r) => snapOf(r.id, store[r._c]?.[r.id])),
    batch: () => ({
      set: (ref, data, opts) =>
        writes.push({id: ref.id, data, merge: !!(opts ?? {}).merge}),
      delete: (ref) => writes.push({id: ref.id, data: null, merge: false}),
      commit: async () => {
        commits += 1;
      },
    }),
  };

  const admin = {
    apps: [],
    initializeApp: () => {
      admin.apps.push({});
    },
    firestore: Object.assign(() => db, {
      Timestamp: class {},
      FieldValue: {serverTimestamp: () => 0},
    }),
    storage: () => {
      throw new Error("偽の admin は置き場を持たない");
    },
  };

  const logs = [];
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
      return nodeRequire(id);
    };
    new Function(
      "require", "exports", "module", "__filename", "__dirname", src,
    )(req, mod.exports, mod, file, dirname(file));
    loaded.set(name, mod.exports);
    return mod.exports;
  };

  const ev = load("streamEvents");
  for (const f of [
    "mintCards", "mintForImage", "tipRef", "loadEvents", "channelsOfDay",
  ]) {
    if (typeof ev[f] !== "function") {
      console.error(`lib/streamEvents.js から ${f} を取り出せなかった`);
      process.exit(1);
    }
  }
  return {ev, writes, logs, commits: () => commits};
}

/* ---------------- 仕込む中身（ぜんぶ偽の字） ---------------- */

/** カードになる画像1枚 */
const IMAGE = {
  id: "img_0000001",
  streamEventId: "ev1",
  role: "card",
  url: "https://example.invalid/1.jpg",
  w: 4,
  h: 3,
  note: "",
  at: 300,
};

/** 投げてくれた人のチャンネルID。**偽の字** */
const CH_A = "UC_a_000000001";

/** 台帳3件。**名乗りは、投げたその瞬間のもの** */
const TIPS = {
  tip_a: {
    channelId: CH_A,
    day: "2026-09-11",
    videoId: "vid00000001",
    donatedAt: 1000,
    // スパチャ。そのときのチャンネル名（`python/island_tips.py:301`）
    displayNameSnapshot: "さくら",
  },
  tip_b: {
    channelId: "UC_b_000000002",
    day: "2026-09-11",
    videoId: "vid00000001",
    donatedAt: 1100,
    /* **Doneru に別名で投げた人**（`python/island_tips.py:356`）。
       紐付け（どねID → チャンネルID）はしてあるので `channelId` は入る。
       焼き込むのは**名乗ったほう**で、こちらの絵は当たらない */
    displayNameSnapshot: "ななしのごんべえ",
  },
  tip_c: {
    channelId: "UC_c_000000003",
    day: "2026-09-11",
    videoId: "vid00000001",
    donatedAt: 1200,
    // 名乗りを持たない投げ銭。`null` が入るだけで、落ちない
  },
};

const EVENTS = {ev1: {date: "2026-09-11", videoIds: ["vid00000001"]}};

/** 書いた1件を取り出す */
const writeOf = (writes, id) => writes.find((w) => w.id === id);

console.log("\n# 0. 新しいカードに、名乗りが焼き込まれる（先に見る・#19）");
{
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: TIPS,
    islandCards: {},
  });
  const got = await s.ev.mintForImage(IMAGE);
  check("3枚できた（空振りでない）", got.made === 3, JSON.stringify(got));
  const a = writeOf(s.writes, "img_0000001__UC_a_000000001");
  const b = writeOf(s.writes, "img_0000001__UC_b_000000002");
  const c = writeOf(s.writes, "img_0000001__UC_c_000000003");
  check(
    "スパチャの名乗りが `nameSnapshot` に入る",
    a?.data.nameSnapshot === "さくら",
    JSON.stringify(a?.data.nameSnapshot),
  );
  check(
    "**Doneru の別名は、別名のまま入る**（いまの名前を引き直していない）",
    b?.data.nameSnapshot === "ななしのごんべえ",
    JSON.stringify(b?.data.nameSnapshot),
  );
  check(
    "名乗りを持たない投げ銭は `null`（欄ごと欠けさせない）",
    c && "nameSnapshot" in c.data && c.data.nameSnapshot === null,
    JSON.stringify(c?.data.nameSnapshot),
  );
  check(
    "新しい書類には置き方が入る（`defaultPlace`）",
    PLACE.every((k) => typeof a?.data[k] === "number"),
    JSON.stringify(a?.data),
  );
  check(
    "台帳の欄の名前をそのまま持ち込んでいない",
    !("displayNameSnapshot" in (a?.data ?? {})),
    Object.keys(a?.data ?? {}).join(","),
  );
}

console.log("\n# 1. 写しを持たない古い書類に、あとから足される（本番の51枚）");
{
  /* 素性（`streamEventImageId`）はそろっていて、**`nameSnapshot` だけ無い**
     書類。ここが埋まらないと `iconsOf` の引く元が無く、いま絵が出ている人が
     全員消える。**置き方は本人が動かしたもの**を置いてある。 */
  const moved = {
    channelId: "UC_a_000000001",
    streamEventId: "ev1",
    streamEventImageId: "img_0000001",
    day: "2026-09-11",
    earnedAt: 1000,
    x: 0.111, y: 0.222, rot: 33.3, scale: 0.44,
    movedAt: 9999,
  };
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: {tip_a: TIPS.tip_a},
    islandCards: {"img_0000001__UC_a_000000001": moved},
  });
  const got = await s.ev.mintForImage(IMAGE);
  check("作り直していない（made 0）", got.made === 0, JSON.stringify(got));
  check("素性を足した扱い（fixed 1）", got.fixed === 1, JSON.stringify(got));
  const w = writeOf(s.writes, "img_0000001__UC_a_000000001");
  check("1件だけ書いた", s.writes.length === 1, `${s.writes.length} 件`);
  check(
    "名乗りが足された",
    w?.data.nameSnapshot === "さくら",
    JSON.stringify(w?.data),
  );
  check("`merge: true` で足している", w?.merge === true, JSON.stringify(w));
  /* **ここがいちばん大事。** 置き方を1つでも書くと、視聴者さんが動かした
     カードが元に戻る。書いた中身に `x/y/rot/scale` が出てはいけない。 */
  check(
    "置き方（x / y / rot / scale）を1つも書いていない",
    PLACE.every((k) => !(k in (w?.data ?? {}))),
    Object.keys(w?.data ?? {}).join(","),
  );
  check(
    "書いたのは名乗りと時刻だけ",
    Object.keys(w?.data ?? {}).sort().join(",") === "nameSnapshot,updatedAt",
    Object.keys(w?.data ?? {}).sort().join(","),
  );
}

console.log("\n# 2. 旧来の「動かしたぶんだけ」の書類にも、置き方を書かない");
{
  /* `streamEventImageId` すら無い、いちばん古い形。素性を丸ごと足す道を
     通るが、**それでも置き方には触らない。** */
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: {tip_a: TIPS.tip_a},
    islandCards: {
      "img_0000001__UC_a_000000001": {
        x: 0.111, y: 0.222, rot: 33.3, scale: 0.44, movedAt: 9999,
      },
    },
  });
  const got = await s.ev.mintForImage(IMAGE);
  check("素性を足した扱い（fixed 1）", got.fixed === 1, JSON.stringify(got));
  const w = writeOf(s.writes, "img_0000001__UC_a_000000001");
  check(
    "名乗りも一緒に入る",
    w?.data.nameSnapshot === "さくら",
    JSON.stringify(w?.data.nameSnapshot),
  );
  check(
    "置き方（x / y / rot / scale）を1つも書いていない",
    PLACE.every((k) => !(k in (w?.data ?? {}))),
    Object.keys(w?.data ?? {}).join(","),
  );
  check("`merge: true`", w?.merge === true, JSON.stringify(w?.merge));
}

console.log("\n# 3. もうそろっている書類には、1バイトも書かない");
{
  const done = {
    channelId: "UC_a_000000001",
    streamEventId: "ev1",
    streamEventImageId: "img_0000001",
    day: "2026-09-11",
    earnedAt: 1000,
    nameSnapshot: "さくら",
    x: 0.111, y: 0.222, rot: 33.3, scale: 0.44,
  };
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: {tip_a: TIPS.tip_a},
    islandCards: {"img_0000001__UC_a_000000001": done},
  });
  const got = await s.ev.mintForImage(IMAGE);
  check("そのまま（kept 1）", got.kept === 1, JSON.stringify(got));
  check("書き込みが0件", s.writes.length === 0, `${s.writes.length} 件`);
  check("`commit()` も呼んでいない", s.commits() === 0, `${s.commits()} 回`);
}
{
  /* 名乗りを持たない投げ銭 × 名乗りの欄が無い書類。**`undefined` と `null` を
     同じものとして畳まないと、毎晩ここで全枚数を書き直す。** */
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: {tip_c: TIPS.tip_c},
    islandCards: {
      "img_0000001__UC_c_000000003": {
        channelId: "UC_c_000000003",
        streamEventId: "ev1",
        streamEventImageId: "img_0000001",
        day: "2026-09-11",
        earnedAt: 1200,
        x: 0.7, y: 0.9, rot: 0, scale: 1,
      },
    },
  });
  const got = await s.ev.mintForImage(IMAGE);
  check(
    "名乗りの無い者どうしは、そのまま（空回しで書き直さない）",
    got.kept === 1 && s.writes.length === 0,
    `${JSON.stringify(got)} / ${s.writes.length} 件`,
  );
}

console.log("\n# 4. 台帳の欄から名乗りを読めている（`tipRef`）");
{
  const s = scenario({});
  const got = s.ev.tipRef("tip_a", {
    channelId: "UC_a_000000001",
    day: "2026-09-11",
    donatedAt: 1000,
    displayNameSnapshot: "  さくら  ",
  });
  check(
    "`displayNameSnapshot` を `nameSnapshot` として読む",
    got.nameSnapshot === "さくら",
    JSON.stringify(got.nameSnapshot),
  );
  check(
    "前後の空白を落としている（鍵の作り方とそろえる）",
    got.nameSnapshot === "さくら",
  );
  const none = s.ev.tipRef("tip_c", {channelId: "UC_c", donatedAt: 1});
  check("欄が無ければ `null`", none.nameSnapshot === null, String(none.nameSnapshot));
  const long = s.ev.tipRef("tip_l", {
    channelId: "UC_l",
    donatedAt: 1,
    displayNameSnapshot: "あ".repeat(200),
  });
  check(
    "長すぎる名乗りは 80字で切る（`islandCharacter` の鍵と同じ長さ）",
    long.nameSnapshot.length === 80,
    `${long.nameSnapshot.length} 字`,
  );
}

console.log("\n# 5. その日投げてくれた人にも、名乗りが付いてくる");
{
  /* `/nordic/photos` の `people[]` は `channelsOfDay` から出る。カードと
     同じ引き方にしないと、**こちらだけ「別名で投げた人の本体が出る」面**が
     残る（`docs/island-misses.md` #5 の横展開）。 */
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: {
      ...TIPS,
      // **同じ人が同じ日に2回。** 2回目の名乗りは別。カードは1枚なので、
      // 名札も「いちばん早い1回」にそろっていないと絵が食い違う
      tip_a2: {
        channelId: CH_A,
        day: "2026-09-11",
        videoId: "vid00000001",
        donatedAt: 1500,
        displayNameSnapshot: "あとから別名",
      },
    },
    islandCards: {},
  });
  const events = await s.ev.loadEvents();
  const got = await s.ev.channelsOfDay(events, "2026-09-11");
  check("3人（同じ人は畳んである）", got.length === 3, `${got.length} 人`);
  const a = got.find((p) => p.channelId === CH_A);
  const b = got.find((p) => p.channelId === "UC_b_000000002");
  check(
    "**いちばん早い1回の名乗り**（カードと同じものを採っている）",
    a?.nameSnapshot === "さくら",
    JSON.stringify(a),
  );
  check(
    "Doneru の別名は、別名のまま返る",
    b?.nameSnapshot === "ななしのごんべえ",
    JSON.stringify(b),
  );
  check(
    "返すのは `channelId` と名乗りだけ（金額などを持ち出していない）",
    got.every((p) => Object.keys(p).sort().join(",") === "channelId,nameSnapshot"),
    Object.keys(got[0] ?? {}).join(","),
  );
  check(
    "名乗りを持たない人は空の字（欄ごと欠けさせない）",
    got.find((p) => p.channelId === "UC_c_000000003")?.nameSnapshot === "",
    JSON.stringify(got.find((p) => p.channelId === "UC_c_000000003")),
  );
}

console.log("\n# 6. ログに、視聴者さんの素性が1文字も出ない");
{
  const s = scenario({
    islandStreamEvent: EVENTS,
    islandTips: TIPS,
    islandCards: {},
  });
  await s.ev.mintForImage(IMAGE);
  const all = s.logs.join("\n");
  check("チャンネルIDが出ていない", !all.includes("UC_"), all.slice(0, 120));
  check(
    "名乗りが出ていない",
    !all.includes("さくら") && !all.includes("ななしのごんべえ"),
    all.slice(0, 120),
  );
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
