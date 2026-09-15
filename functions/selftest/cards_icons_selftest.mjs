/**
 * `iconsOf()` の確かめ。**偽のチャンネルと偽の字だけで回す。**
 *
 * ## 何を見ているか
 *
 * カードに乗るキャラクターの絵は、**チャンネルID → いま名乗っている名前 →
 * 名簿** の順に引いている。あやとの決めごとは
 *
 * > キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
 * > 変わらないのが正しい。本人にキャラクターを選ばせる口は無い**
 *
 * なのに、表示名は誰でも同じにできる。**他人と同じ名前を名乗れば、その人の絵が
 * 自分のカードに乗る**——「選ばせる口は無い」と決めた、その口が開いていた。
 * ここは、その口が閉じていることを見る。
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * チャンネルIDも表示名も出さない。** 出てくるのは仕込んだ `UC_a_000000001`
 * `さくら` `にせもの` だけ。
 *
 * ## なぜ写しを置かないか
 *
 * `tsc` が書き出した `lib/cards.js` を、**偽の firebase-admin を渡して**
 * そのまま動かす。写しを持つと、本体を直したのに確かめが古いまま通る。
 * `lib/islandCharacter.js`（`normKey` / `keysOf`）と `lib/streamEvents.js` は
 * **本物をそのまま**通す。上限（`MAX_CHANNELS`）も本体の字から読む。
 *
 * ## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）
 *
 * 「絵が当たらない」は、**名簿の引き方ごと壊れていても当たらない。**
 * だから先に、かぶっていない人に**絵がちゃんと当たること**を確かめてから、
 * かぶった人で消えることを見る。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/cards_icons_selftest.mjs
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

/* ---------------- 本体を読み込む土台 ---------------- */

console.log("# tsc を回して、いまの src から読み込む");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});

const cardsSrc = readFileSync(join(FUNCTIONS, "lib", "cards.js"), "utf8");
const nodeRequire = createRequire(import.meta.url);

/** 上限は**本体の字から読む**。ここに書き写すと、変えた日に古いものを測る */
const capMatch = cardsSrc.match(/MAX_CHANNELS\s*=\s*(\d+)/);
if (!capMatch) {
  console.error("lib/cards.js から MAX_CHANNELS を読めなかった");
  process.exit(1);
}
const MAX_CHANNELS = Number(capMatch[1]);
console.log(`  読み込んだ長さ: ${cardsSrc.length} 字 / 上限 ${MAX_CHANNELS} 件\n`);

/**
 * 1つの筋書き。**入れ物も控えも、筋書きごとに作り直す**
 * （`lib/cards.js` は温かいインスタンスに控えを持つので、使い回すと
 * 前の筋書きの控えを見てしまう）。
 * @param {object} store コレクション名 → 書類ID → 中身（**ぜんぶ偽の字**）
 * @param {object} [opts] `fail` に入れたコレクションは読むと落ちる
 * @return {object} `iconsOf` と、叩いた回数と、出たログ
 */
function scenario(store, opts = {}) {
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
    where: (f, op, v) =>
      query(name, {...q, where: [...(q.where ?? []), [f, op, v]]}),
    orderBy: (f, dir) => query(name, {...q, order: [f, dir ?? "asc"]}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      bump(`${name}:scan`);
      if ((opts.fail ?? []).includes(name)) {
        throw new Error(`偽の Firestore: ${name} は読めない`);
      }
      let rows = Object.entries(store[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, op, v] of q.where ?? []) {
        if (op !== "==") throw new Error(`偽の Firestore は == しか持たない`);
        rows = rows.filter((d) => d.data()[f] === v);
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
        get: async () => {
          bump(`${name}:get`);
          return snapOf(id, store[name]?.[id]);
        },
      }),
    }),
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
    loaded.set(name, mod.exports);
    return mod.exports;
  };

  const {iconsOf} = load("cards");
  if (typeof iconsOf !== "function") {
    console.error("lib/cards.js から iconsOf を取り出せなかった");
    process.exit(1);
  }
  return {iconsOf, hits, logs};
}

/* ---------------- 仕込む名簿とチャンネル ----------------

   `channelKeys` は保存のときに `keysOf` が作る形（`normKey` 済み・`@` なしも
   一緒に入る）で置く。本物の保存と同じものを置かないと、当たる当たらないが
   本番と食い違う。 */

/** キャラクターの名簿。3人 */
const CHARACTERS = {
  char_sakura: {channelKeys: ["さくら"]},
  char_abc: {channelKeys: ["@abc", "abc"]},
  char_futatsu: {channelKeys: ["ふたつ"]},
  // 同じ鍵が2人に付いている（`characterKeys` の側の守り。壊していないか見る）
  char_futatsu2: {channelKeys: ["ふたつ"]},
};

console.log("# 0. 探し方が当たるか（先に見る）");
{
  const s = scenario({
    islandCharacter: CHARACTERS,
    islandChannels: {
      UC_a_000000001: {name: "さくら"},
      UC_b_000000002: {name: "にせもの"},
      // 全角・大文字ちがい。`normKey` を通れば当たる
      UC_c_000000003: {name: "ＡＢＣ"},
    },
  });
  const got = await s.iconsOf([
    "UC_a_000000001", "UC_b_000000002", "UC_c_000000003",
  ]);
  check(
    "かぶっていない人には、いままでどおり絵が当たる",
    got.get("UC_a_000000001") === "char_sakura",
    String(got.get("UC_a_000000001")),
  );
  check(
    "全角・大文字ちがいも `normKey` で当たる（引き方が生きている）",
    got.get("UC_c_000000003") === "char_abc",
    String(got.get("UC_c_000000003")),
  );
  check(
    "名簿に無い人は当たらない（当たりすぎていない）",
    !got.has("UC_b_000000002"),
    String(got.get("UC_b_000000002")),
  );
  check("当たったのは2人", got.size === 2, `${got.size} 人`);
  check(
    "同じ鍵が2人のキャラクターに付いていたら、どちらも使わない（既存の守り）",
    !got.has("UC_x_000000009"),
  );
}

console.log("\n# 1. 同じ名前を2つのチャンネルが名乗ったら、どちらにも当てない");
{
  const store = {
    islandCharacter: CHARACTERS,
    islandChannels: {
      // 本来の持ち主
      UC_a_000000001: {name: "さくら"},
      // 名前をまねた人
      UC_z_000000026: {name: "さくら"},
      // 巻き込まれていないことを見るための、関係ない人
      UC_c_000000003: {name: "abc"},
    },
  };
  {
    const s = scenario(store);
    const got = await s.iconsOf([
      "UC_a_000000001", "UC_z_000000026", "UC_c_000000003",
    ]);
    check(
      "まねた人に当たらない",
      !got.has("UC_z_000000026"),
      String(got.get("UC_z_000000026")),
    );
    check(
      "本来の持ち主にも当てない（どちらか分からないので止める）",
      !got.has("UC_a_000000001"),
      String(got.get("UC_a_000000001")),
    );
    check(
      "関係ない人の絵は消えない（全部落としていない）",
      got.get("UC_c_000000003") === "char_abc",
      String(got.get("UC_c_000000003")),
    );
    check("当たったのは1人", got.size === 1, `${got.size} 人`);
  }
  {
    /* **ここが肝。** なりすます側は自分のカードを1枚開けばいいので、
       相手が同じ並びに入ってくるとは限らない。渡された並びの中だけを
       見ていると、この呼び方で素通りする。 */
    const s = scenario(store);
    const got = await s.iconsOf(["UC_z_000000026"]);
    check(
      "まねた人ひとりだけを渡しても当たらない（入れ物ぜんぶを見ている）",
      !got.has("UC_z_000000026"),
      String(got.get("UC_z_000000026")),
    );
    check("1人も当たらない", got.size === 0, `${got.size} 人`);
  }
  {
    const s = scenario(store);
    const got = await s.iconsOf(["UC_a_000000001"]);
    check(
      "本来の持ち主ひとりだけを渡しても当たらない",
      !got.has("UC_a_000000001"),
      String(got.get("UC_a_000000001")),
    );
  }
  {
    /* **落ちているのが守りのせいか、を確かめる**（`docs/island-standards.md` 13）。
       いまの「当たらない」は、引き方ごと壊れていても同じ顔になる。
       **まねた人だけを抜いた同じ入れ物**に同じ呼び方をして、そこでは
       当たることを見る。差はかぶり1件だけなので、これで守りのせいと言える。 */
    const s = scenario({
      islandCharacter: CHARACTERS,
      islandChannels: {
        UC_a_000000001: {name: "さくら"},
        UC_c_000000003: {name: "abc"},
      },
    });
    const got = await s.iconsOf(["UC_a_000000001"]);
    check(
      "まねた人を抜くと、同じ呼び方で当たる（守りが落としている証拠）",
      got.get("UC_a_000000001") === "char_sakura",
      String(got.get("UC_a_000000001")),
    );
  }
}

console.log("\n# 2. `@` のあるなし・全角半角の違いだけの名前も、かぶりに数える");
{
  const s = scenario({
    islandCharacter: CHARACTERS,
    islandChannels: {
      UC_c_000000003: {name: "@abc"},
      UC_d_000000004: {name: "abc"},
      UC_e_000000005: {name: "さくら"},
    },
  });
  const got = await s.iconsOf([
    "UC_c_000000003", "UC_d_000000004", "UC_e_000000005",
  ]);
  check(
    "`@abc` に当たらない",
    !got.has("UC_c_000000003"),
    String(got.get("UC_c_000000003")),
  );
  check(
    "`abc` にも当たらない",
    !got.has("UC_d_000000004"),
    String(got.get("UC_d_000000004")),
  );
  check(
    "巻き込まれていない人には当たる",
    got.get("UC_e_000000005") === "char_sakura",
    String(got.get("UC_e_000000005")),
  );
}
{
  /* 全角のなりすまし。`normKey`(NFKC) を通すので、見た目が違っても同じ鍵 */
  const s = scenario({
    islandCharacter: CHARACTERS,
    islandChannels: {
      UC_c_000000003: {name: "abc"},
      UC_f_000000006: {name: "ＡＢＣ"},
    },
  });
  const got = await s.iconsOf(["UC_c_000000003", "UC_f_000000006"]);
  check("全角でまねた人に当たらない", !got.has("UC_f_000000006"));
  check("半角の本人にも当てない", !got.has("UC_c_000000003"));
  check("1人も当たらない", got.size === 0, `${got.size} 人`);
}

console.log("\n# 3. 入れ物が読めなかったら、投げずに・当てない");
for (const [name, fail] of [
  ["辞書（islandChannels）が読めない", ["islandChannels"]],
  ["名簿（islandCharacter）が読めない", ["islandCharacter"]],
]) {
  const s = scenario({
    islandCharacter: CHARACTERS,
    islandChannels: {UC_a_000000001: {name: "さくら"}},
  }, {fail});
  let threw = "";
  let got = null;
  try {
    got = await s.iconsOf(["UC_a_000000001"]);
  } catch (e) {
    threw = String(e);
  }
  check(`${name} → 投げない`, threw === "", threw);
  check(`${name} → 表は返る（呼ぶ側が落ちない）`, got instanceof Map);
  check(
    `${name} → **当てない側に倒す**（読めなかったから当てる、にしない）`,
    got?.size === 0,
    `${got?.size} 人`,
  );
  check(
    `${name} → ログに素性が出ていない`,
    !s.logs.join("\n").includes("UC_") && !s.logs.join("\n").includes("さくら"),
  );
}

console.log("\n# 4. 上限で切れたときも、当てない");
{
  /* 上限ちょうどまで埋める。**半端に読んだ名簿ではかぶりを見落とす**ので、
     「読み切れなかった」を「かぶっていない」と読み替えないことを見る。 */
  const many = {UC_a_000000001: {name: "さくら"}};
  for (let i = 0; i < MAX_CHANNELS; i += 1) {
    many[`UC_pad_${String(i).padStart(9, "0")}`] = {name: `にせもの${i}`};
  }
  const s = scenario({islandCharacter: CHARACTERS, islandChannels: many});
  let threw = "";
  let got = null;
  try {
    got = await s.iconsOf(["UC_a_000000001"]);
  } catch (e) {
    threw = String(e);
  }
  check("投げない", threw === "", threw);
  check("1人も当たらない", got?.size === 0, `${got?.size} 人`);
  check("切れたことがログに出る", s.logs.some((l) => l.includes("truncated")));
  check(
    "ログに素性が出ていない",
    !s.logs.join("\n").includes("UC_") &&
      !s.logs.join("\n").includes("さくら") &&
      !s.logs.join("\n").includes("にせもの"),
    s.logs.join(" / ").slice(0, 120),
  );
}

console.log("\n# 5. 控えが効いている（呼び出しごとに辞書を読み直さない）");
{
  const s = scenario({
    islandCharacter: CHARACTERS,
    islandChannels: {
      UC_a_000000001: {name: "さくら"},
      UC_c_000000003: {name: "abc"},
    },
  });
  await s.iconsOf(["UC_a_000000001"]);
  const after1 = {...s.hits};
  await s.iconsOf(["UC_c_000000003"]);
  await s.iconsOf(["UC_a_000000001", "UC_c_000000003"]);
  const scans = s.hits["islandChannels:scan"];
  const chars = s.hits["islandCharacter:scan"];
  check(
    "辞書ぜんぶの読み直しは、3回呼んでも1回だけ",
    scans === 1,
    `${scans} 回`,
  );
  check("名簿の読み直しも1回だけ", chars === 1, `${chars} 回`);
  check(
    "1回目で辞書を読んでいる（0回のまま素通りしていない）",
    after1["islandChannels:scan"] === 1,
    `${after1["islandChannels:scan"]} 回`,
  );
  /* 名前そのものは控えない（毎晩入れ直るので）。**1回の呼び出しにつき
     `getAll` 1往復**のまま増えていないことを見る */
  check(
    "名前引きは呼び出しごとに1往復のまま（3回で3往復）",
    s.hits["islandChannels:getAll"] === 3,
    `${s.hits["islandChannels:getAll"]} 往復`,
  );
  check(
    "書類を1件ずつ引きに行っていない",
    (s.hits["islandChannels:get"] ?? 0) === 0,
    `${s.hits["islandChannels:get"] ?? 0} 件`,
  );
}

console.log("\n# 6. 絵が当たる道は、名前だけ（`islandCharacter.channelId` はまだ空）");
{
  /* いまは名前で引いている。**あやとの表の `channelId` で引くのが本来**
     なので、その欄が埋まっても名前だけで壊れないことをここに残しておく。
     欄が埋まっていない今は、当たらないのが正しい。 */
  const s = scenario({
    islandCharacter: {char_only_id: {channelId: "UC_g_000000007"}},
    islandChannels: {UC_g_000000007: {name: "にせもの"}},
  });
  const got = await s.iconsOf(["UC_g_000000007"]);
  check(
    "`channelId` だけのキャラクターには、いまは当たらない（宿題が残っている）",
    got.size === 0,
    `${got.size} 人`,
  );
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
