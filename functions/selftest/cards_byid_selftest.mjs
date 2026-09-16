/**
 * **カードの絵を `channelId` で引く道**の確かめ（#429 の A）。
 * 偽の名簿と偽の字だけで回す。
 *
 * ## 何を見ているか
 *
 * カードの書類は最初から `channelId` を持っているのに、そこに乗る絵は
 * **投げたときの名乗り**(`nameSnapshot`)からしか決まっていなかった。
 * だから視聴者さんが YouTube の名前を変えた日と、Doneru の表示名に
 * タイポがあった日に、**カードから絵が消えていた。**
 *
 * あやとの決めごと(`docs/island-db.md` 2章):
 *
 * > キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
 * > 変わらないのが正しい。本人にキャラクターを選ばせる口は無い**
 *
 * ここで見るのは6つ。
 *
 * 1. **`channelId` で当たれば、その絵になる**（名乗りが1文字も当たらなくても）
 * 2. 名簿が `channelId` を1つも持っていなければ、**いまどおり名乗りで当たる**
 * 3. **同じ `channelId` が2人に付いていたら、どちらも当てない**
 *    （名乗りへも落ちない。どちらか選べないのは `channelId` の段で確定している）
 * 4. **`channelId` で当たり、かつ名乗りでは別人に当たる → `channelId` を採る**
 * 5. **名前を出す人が1人も増えていない。** 絵の乗る枚数は増えるのに、
 *    名前の出る枚数は名乗りで引いていたころと同じ
 * 6. 名簿は**1回しか読まない**（`channelId` の表を別に引きに行っていない）。
 *    `islandChannels` には**触りもしない**
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * 名乗りもチャンネルIDも出さない。** 出てくるのは仕込んだ `UC_byid_000001`
 * `たいぷみす` だけ。
 *
 * ## 写しを持たない
 *
 * `tsc` が書き出した `lib/cards.js` を、**偽の firebase-admin を渡して**
 * そのまま動かす。写しを置くと、本体を直したのに確かめが古いまま通る。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * `CARDS_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通らない）。
 *
 * ```bash
 * node functions/selftest/cards_byid_selftest.mjs
 * cp -r functions/lib /tmp/brokenlib && vi /tmp/brokenlib/cards.js
 * CARDS_LIB_DIR=/tmp/brokenlib node functions/selftest/cards_byid_selftest.mjs
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

/** 合否。1つでも落ちたら終了コード1で出る */
let bad = 0;
/** 通った数。報告に出すので数えておく */
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

/* ---------------- 仕込む名簿 ----------------

   **ぜんぶ偽の字。** `lookupKeys` は保存のときに `keysOf` が作る形
   （`normKey` 済み）で置く。本物の保存と同じものを置かないと、当たる
   当たらないが本番と食い違う。 */

const CHARACTERS = {
  /** `channelId` だけを持つ人。**名乗りでは1文字も当たらない** */
  char_byid: {channelId: "UC_byid_000001", lookupKeys: []},
  /** `channelId` を持たない人。**受け皿（名乗り）でしか当たらない** */
  char_name: {lookupKeys: ["さくら"]},
  // 同じ `channelId` が2人に付いている（どちらか選べない）
  char_dupe1: {channelId: "UC_dupe_000001", lookupKeys: ["だぶりいち"]},
  char_dupe2: {channelId: "UC_dupe_000001", lookupKeys: ["だぶりに"]},
  /** 「よくあるなまえ」を名乗りに持っている**別人** */
  char_wrong: {lookupKeys: ["よくあるなまえ"]},
  /** その「よくあるなまえ」で投げた人の、**本当のキャラクター** */
  char_right: {channelId: "UC_both_000001", lookupKeys: ["ほんにん"]},
};

/** `channelId` を全部抜いた名簿。**受け皿だけになった世界の対照。** */
const CHARACTERS_NO_ID = Object.fromEntries(
  Object.entries(CHARACTERS).map(([id, v]) => {
    const {channelId, ...rest} = v;
    return [id, rest];
  }),
);

/* ---------------- 仕込むカード ----------------

   写真を1枚ずつ分けてあるのは、**公開の応答に `channelId` が無い**から。
   `photoId` でどのカードかを指せるようにしておかないと、どの1枚の絵を
   見ているのか言えなくなる。 */

const CARDS = {
  /** 1. 名乗りにタイポ。**`channelId` で当たってほしい** */
  "img_0000001__UC_byid_000001": {
    channelId: "UC_byid_000001",
    day: "2026-09-11",
    streamEventImageId: "img_0000001",
    earnedAt: 400,
    nameSnapshot: "たいぷみす",
  },
  /** 2. 名簿が `channelId` を持たない人。**受け皿で当たる** */
  "img_0000002__UC_name_000001": {
    channelId: "UC_name_000001",
    day: "2026-09-11",
    streamEventImageId: "img_0000002",
    earnedAt: 390,
    nameSnapshot: "さくら",
  },
  /** 3. 同じ `channelId` が2人に付いている。**どちらも当てない** */
  "img_0000003__UC_dupe_000001": {
    channelId: "UC_dupe_000001",
    day: "2026-09-11",
    streamEventImageId: "img_0000003",
    earnedAt: 380,
    nameSnapshot: "だぶりいち",
  },
  /** 4. `channelId` でも名乗りでも当たるが、**別人に当たる** */
  "img_0000004__UC_both_000001": {
    channelId: "UC_both_000001",
    day: "2026-09-11",
    streamEventImageId: "img_0000004",
    earnedAt: 370,
    nameSnapshot: "よくあるなまえ",
  },
};

const IMAGES = Object.fromEntries(
  [1, 2, 3, 4].map((n) => [
    `img_000000${n}`,
    {
      url: `https://example.invalid/${n}.jpg`,
      w: 4, h: 3, note: "", at: 300 - n, streamEventId: "ev1", role: "card",
    },
  ]),
);

/** **4人とも「島に名前を出してよい」と言っている。** 増えないことを見る面なので */
const RESIDENTS = [
  {uid: "u1", channelId: "UC_byid_000001", name: "ひとり"},
  {uid: "u2", channelId: "UC_name_000001", name: "ふたり"},
  {uid: "u3", channelId: "UC_dupe_000001", name: "さんにん"},
  {uid: "u4", channelId: "UC_both_000001", name: "よにん"},
];

/* ---------------- 偽の Firestore と、本体の読み込み ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

const nodeRequire = createRequire(import.meta.url);
console.log(
  `  読み込んだ長さ: ${readFileSync(join(LIB, "cards.js"), "utf8").length} 字\n`,
);

/**
 * 1つの筋書き。**入れ物も控えも、筋書きごとに作り直す**
 * （`lib/cards.js` は温かいインスタンスに控えを持つので、使い回すと
 * 前の筋書きの控えを見てしまう）。
 * @param {object} store コレクション名 → 書類ID → 中身（**ぜんぶ偽の字**）
 * @return {object} 本体の口と、叩いた回数と、出たログ
 */
function scenario(store) {
  /** 何回・どこを読んだか。余計に往復していないかを見る */
  const hits = {};
  const bump = (k) => {
    hits[k] = (hits[k] ?? 0) + 1;
  };
  const snapOf = (id, v) => ({
    id,
    exists: !!v,
    data: () => v,
    get: (k) => (v ? v[k] : undefined),
  });

  const query = (name, q) => ({
    select: (...f) => query(name, {...q, select: f}),
    where: (f, op, v) => {
      if (op !== "==") throw new Error(`偽の Firestore は == しか持たない: ${op}`);
      return query(name, {...q, where: [...(q.where ?? []), [f, v]]});
    },
    orderBy: (f, dir) => query(name, {...q, order: [f, dir ?? "asc"]}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      bump(`${name}:scan`);
      let rows = Object.entries(store[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, v] of q.where ?? []) rows = rows.filter((d) => d.data()[f] === v);
      if (q.order) {
        const [f, dir] = q.order;
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
        size: rows.length,
        empty: rows.length === 0,
        docs: rows,
        forEach: (f) => rows.forEach(f),
      };
    },
  });

  const db = {
    collection: (name) => {
      /* **`islandChannels` は、触った瞬間に落とす。** 「いま名乗っている
         名前の辞書」へ戻ったら、絵がまた表示名で動き出す。 */
      if (name === "islandChannels") {
        bump("islandChannels:touch");
        throw new Error("偽の Firestore: islandChannels には触れない");
      }
      return {
        ...query(name, {}),
        doc: (id) => ({
          id,
          _c: name,
          get: async () => {
            bump(`${name}:get`);
            return snapOf(id, store[name]?.[id]);
          },
        }),
      };
    },
    getAll: async (...refs) => {
      bump(`${refs[0]?._c}:getAll`);
      return refs.map((r) => snapOf(r.id, store[r._c]?.[r.id]));
    },
  };

  const admin = {
    apps: [],
    initializeApp: () => {
      admin.apps.push({});
    },
    firestore: Object.assign(() => db, {
      Timestamp: {now: () => ({toMillis: () => 0})},
      FieldValue: {serverTimestamp: () => 0},
    }),
    storage: () => {
      throw new Error("偽の admin は置き場を持たない");
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

  const loaded = new Map();
  const load = (name) => {
    if (loaded.has(name)) return loaded.get(name);
    const file = join(LIB, `${name}.js`);
    const mod = {exports: {}};
    loaded.set(name, mod.exports);
    const req = (id) => {
      if (id === "firebase-admin") return admin;
      if (id === "firebase-functions") return functions;
      if (id.startsWith("./")) return load(id.slice(2));
      return nodeRequire(id);
    };
    new Function(
      "require", "exports", "module", "__filename", "__dirname",
      readFileSync(file, "utf8"),
    )(req, mod.exports, mod, file, dirname(file));
    loaded.set(name, mod.exports);
    return mod.exports;
  };

  const cards = load("cards");
  for (const n of ["handleCards", "iconsOf", "pickIcon", "peopleForEveryone"]) {
    if (typeof cards[n] !== "function") {
      console.error(`lib/cards.js から ${n} を取り出せなかった`);
      process.exit(1);
    }
  }

  /**
   * 公開の `GET /cards` を1回叩く。
   * @return {Promise<object>} 状態と返り
   */
  const listPublic = async () => {
    const out = {status: 200, body: undefined};
    const res = {
      set: () => {},
      status: (n) => {
        out.status = n;
        return res;
      },
      json: (b) => {
        out.body = b;
      },
    };
    await cards.handleCards(
      {method: "GET", path: "/cards", body: {}}, res,
      {
        whoIs: async () => null,
        ownerUid: async () => null,
        listResidents: async () => RESIDENTS,
      },
    );
    return out;
  };

  return {...cards, listPublic, hits, logs};
}

/** 写真IDごとの絵。**公開の応答には `channelId` が無いので `photoId` で指す** */
const byPhoto = (list) => new Map(list.map((c) => [c.photoId, c]));

/* ---------------- 0. 探し方が当たるか（先に見る・#19） ---------------- */

console.log("# 0. 仕込みが効いているか（先に見る）");
const base = scenario({
  islandCharacter: CHARACTERS,
  islandCards: CARDS,
  islandStreamEventImage: IMAGES,
});
const pub = await base.listPublic();
check("公開の /cards は 200", pub.status === 200, String(pub.status));
const got = pub.body?.cards ?? [];
check("4枚返っている（空振りでない）", got.length === 4, `${got.length} 枚`);
const P = byPhoto(got);
check(
  "4枚とも写真が別（どの1枚か指せる）",
  P.size === 4,
  [...P.keys()].join(","),
);

/* ---------------- 1. `channelId` で当たる ---------------- */

console.log("\n# 1. `channelId` で当たれば、その絵になる");
check(
  "名乗りが1文字も当たらなくても、絵が乗る",
  P.get("img_0000001")?.icon === "char_byid",
  String(P.get("img_0000001")?.icon),
);
{
  /* **対照。** 同じ名乗り・同じカードのまま、名簿から `channelId` だけを
     抜くと絵が消える。消えることまで見ないと、「たまたま名乗りで当たって
     いた」と区別がつかない。 */
  const noid = scenario({
    islandCharacter: CHARACTERS_NO_ID,
    islandCards: CARDS,
    islandStreamEventImage: IMAGES,
  });
  const q = byPhoto((await noid.listPublic()).body?.cards ?? []);
  check(
    "名簿から `channelId` を抜くと、その絵は消える（当てているのが `channelId` の証拠）",
    q.get("img_0000001")?.icon === null,
    String(q.get("img_0000001")?.icon),
  );
}

/* ---------------- 2. `channelId` が無ければ、いまどおり名乗り ---------------- */

console.log("\n# 2. `channelId` を持たない人は、いまどおり名乗りで当たる");
check(
  "受け皿（`lookupKeys`）で絵が乗る",
  P.get("img_0000002")?.icon === "char_name",
  String(P.get("img_0000002")?.icon),
);
{
  const noid = scenario({
    islandCharacter: CHARACTERS_NO_ID,
    islandCards: CARDS,
    islandStreamEventImage: IMAGES,
  });
  const q = byPhoto((await noid.listPublic()).body?.cards ?? []);
  check(
    "名簿が `channelId` を1つも持たなくても、名乗りの道は生きている",
    q.get("img_0000002")?.icon === "char_name",
    String(q.get("img_0000002")?.icon),
  );
}

/* ---------------- 3. 同じ `channelId` が2人に付いている ---------------- */

console.log("\n# 3. 同じ `channelId` が2人に付いていたら、どちらも当てない");
check(
  "どちらの絵も乗らない",
  P.get("img_0000003")?.icon === null,
  String(P.get("img_0000003")?.icon),
);
check(
  "**名乗りへも落ちない**（名乗りは `char_dupe1` に当たる形で仕込んである）",
  P.get("img_0000003")?.icon !== "char_dupe1",
  String(P.get("img_0000003")?.icon),
);
{
  // 対照。かぶっている片方を抜けば、同じカードに絵が乗る
  const alone = {...CHARACTERS};
  delete alone.char_dupe2;
  const one = scenario({
    islandCharacter: alone,
    islandCards: CARDS,
    islandStreamEventImage: IMAGES,
  });
  const q = byPhoto((await one.listPublic()).body?.cards ?? []);
  check(
    "かぶりを抜くと、同じカードに絵が乗る（守りが落としている証拠）",
    q.get("img_0000003")?.icon === "char_dupe1",
    String(q.get("img_0000003")?.icon),
  );
}

/* ---------------- 4. 食い違ったら `channelId` ---------------- */

console.log("\n# 4. `channelId` と名乗りが別人を指したら、`channelId` を採る");
check(
  "`channelId` の側の絵が乗る",
  P.get("img_0000004")?.icon === "char_right",
  String(P.get("img_0000004")?.icon),
);
check(
  "名乗りの側の別人は乗らない",
  P.get("img_0000004")?.icon !== "char_wrong",
  String(P.get("img_0000004")?.icon),
);
{
  /* **対照。** 名乗りの側にも本当に当たる仕込みであることを見る。
     当たらない名乗りで「`char_wrong` でない」を見ても、何も言えない。 */
  const noid = scenario({
    islandCharacter: CHARACTERS_NO_ID,
    islandCards: CARDS,
    islandStreamEventImage: IMAGES,
  });
  const q = byPhoto((await noid.listPublic()).body?.cards ?? []);
  check(
    "`channelId` を抜くと、名乗りの側の別人に当たる（食い違いが実在する）",
    q.get("img_0000004")?.icon === "char_wrong",
    String(q.get("img_0000004")?.icon),
  );
}

/* ---------------- 5. 名前を出す人は、1人も増えていない ---------------- */

console.log("\n# 5. 絵の乗る人は増えるが、名前の出る人は1人も増えない");
{
  /* **同じカード・同じ住人のまま、名簿から `channelId` だけを抜いた世界**と
     突き合わせる。人数の合計ではなく**1枚ずつ**見る——合計だと、1枚増えて
     1枚減ったときに「変わっていない」と読めてしまう。 */
  const noid = scenario({
    islandCharacter: CHARACTERS_NO_ID,
    islandCards: CARDS,
    islandStreamEventImage: IMAGES,
  });
  const before = byPhoto((await noid.listPublic()).body?.cards ?? []);
  const diff = (f) => {
    const up = [];
    const down = [];
    for (const [id, c] of P) {
      const was = f(before.get(id) ?? {});
      const now = f(c);
      if (!was && now) up.push(id);
      if (was && !now) down.push(id);
    }
    return {up, down};
  };
  const icon = diff((c) => c.icon);
  const name = diff((c) => c.name);
  console.log(
    `  絵   増えた: [${icon.up}] 減った: [${icon.down}]\n` +
    `  名前 増えた: [${name.up}] 減った: [${name.down}]`,
  );
  check(
    "4人とも「名前を出してよい」と言っている（増える余地のある仕込み）",
    RESIDENTS.length === 4 && RESIDENTS.every((r) => r.name),
  );
  check(
    "絵の乗る人は増えている（名乗りにタイポのあった1枚）",
    icon.up.join(",") === "img_0000001",
    icon.up.join(","),
  );
  check(
    "**名前の出る人は1人も増えていない**",
    name.up.length === 0,
    name.up.join(","),
  );
  check(
    "**`channelId` でだけ絵が当たった人に、名前は出ていない**",
    P.get("img_0000001")?.icon === "char_byid" &&
      P.get("img_0000001")?.name === null,
    JSON.stringify([P.get("img_0000001")?.icon, P.get("img_0000001")?.name]),
  );
  check(
    "名乗りで当たっていた人の名前は、そのまま残っている",
    P.get("img_0000002")?.name === "ふたり" &&
      P.get("img_0000004")?.name === "よにん",
    JSON.stringify([P.get("img_0000002")?.name, P.get("img_0000004")?.name]),
  );
  /* **減るところは1枚ある。** かぶった `channelId` の人は「誰か決められない」
     ので絵を出さず、絵が出ない以上その1枚には名前も出さない
     （`cards.ts` の `pickIcon`）。**増えていないことと別に、減ったことも数えて出す。** */
  check(
    "減るのは、かぶった `channelId` の1枚だけ（絵も名前も）",
    icon.down.join(",") === "img_0000003" &&
      name.down.join(",") === "img_0000003",
    `絵 [${icon.down}] 名前 [${name.down}]`,
  );
}

/* ---------------- 6. 読みが増えていない ---------------- */

console.log("\n# 6. 名簿は1回しか読まない／`islandChannels` に触らない");
{
  const s = scenario({
    islandCharacter: CHARACTERS,
    islandCards: CARDS,
    islandStreamEventImage: IMAGES,
    // 読みに行けば当たってしまう中身を、わざと置いておく
    islandChannels: {UC_byid_000001: {name: "さくら"}},
  });
  await s.listPublic();
  check(
    "名簿の読みは1回（`channelId` の表を別に引きに行っていない）",
    s.hits["islandCharacter:scan"] === 1,
    `${s.hits["islandCharacter:scan"]} 回`,
  );
  await s.listPublic();
  check(
    "2回叩いても名簿は1回（控えが効いている）",
    s.hits["islandCharacter:scan"] === 1,
    `${s.hits["islandCharacter:scan"]} 回`,
  );
  check(
    "`islandChannels` を1度も掴んでいない",
    (s.hits["islandChannels:touch"] ?? 0) === 0,
    `${s.hits["islandChannels:touch"] ?? 0} 回`,
  );
  check(
    "名簿を1件ずつ引きに行っていない",
    (s.hits["islandCharacter:get"] ?? 0) === 0,
    `${s.hits["islandCharacter:get"] ?? 0} 件`,
  );
}

/* ---------------- 7. `/nordic/photos` も同じ引き方 ---------------- */

console.log("\n# 7. `/nordic/photos` の people も、同じ引き方");
{
  const s = scenario({islandCharacter: CHARACTERS});
  const icons = await s.iconsOf(["さくら", "よくあるなまえ", "たいぷみす"]);
  check("読めている（`null` で返っていない）", icons !== null, String(icons));
  const named = new Map(RESIDENTS.map((r) => [r.channelId, r.name]));
  const people = s.peopleForEveryone(
    [
      {channelId: "UC_byid_000001", nameSnapshot: "たいぷみす"},
      {channelId: "UC_name_000001", nameSnapshot: "さくら"},
      {channelId: "UC_dupe_000001", nameSnapshot: "だぶりいち"},
      {channelId: "UC_both_000001", nameSnapshot: "よくあるなまえ"},
    ],
    icons,
    named,
  );
  check(
    "`channelId` で当たる／受け皿で当たる／かぶりは当てない／食い違いは `channelId`",
    JSON.stringify(people.map((p) => p.icon)) ===
      JSON.stringify(["char_byid", "char_name", null, "char_right"]),
    JSON.stringify(people.map((p) => p.icon)),
  );
  check(
    "名前が出るのは、名乗りでも当たった2人だけ（`channelId` だけの人には出ない）",
    JSON.stringify(people.map((p) => p.name)) ===
      JSON.stringify([null, "ふたり", null, "よにん"]),
    JSON.stringify(people.map((p) => p.name)),
  );
  check(
    "`channelId` の欄は返っていない",
    people.every((p) => !("channelId" in p)),
    Object.keys(people[0] ?? {}).join(","),
  );
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
