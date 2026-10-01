/**
 * **カードは、何枚あっても1枚も落ちない。**
 *
 * ## 何を見ているか
 *
 * 公開の口（`GET /cards`）は新しい順に **600枚**で切っていた。カードは
 * 「写真1枚 × その日投げてくれた人」なので、**写真96枚でカード617枚**になる。
 * 600は写真の枚数ではなく、本番ではとっくに超えていて、**いちばん古い17枚**
 * （9/06・9/11・9/12 と 9/13 の一部）が口から取れていなかった
 * （`docs/island-card-data.md` 4.2 と 6-7）。あやとの言葉（2026-10-01）:
 *
 * > カードは600が上限とかやめて欲しい。大昔のカードも取得できないとおかしい。
 * > カードは写真とは別だよね？ 写真は600も絶対にアップしてない。
 *
 * **切れていることが、どこにも出ていなかった**のがいちばん悪い。応答は 200 で、
 * 画面は「それで全部」の顔をする（`docs/island-standards.md` 10・13）。
 *
 * 見るのは6つ。
 *
 * 1. 1,000枚仕込んで、公開の口が **1,000枚**返す（600で切れていない）
 * 2. 写真700枚ぶんの引き当てが**全部当たる**。`getAll` は **300件ずつ**に
 *    割って投げている（割りをまたいだ写真のカードが落ちない）
 * 3. **いちばん古いカード**が応答に入っている（これが本番で消えていたもの）
 * 4. 名乗りが **600種類を超えても**、絵が最後まで当たる（`iconsOf` の切りも外した）
 * 5. `/cards/mine` も切れない（**700枚**返す）
 * 6. 栓（`CARDS_HARD_CAP`）に当たったときは、**`logger.error` を出してから**
 *    切る。黙って切らない
 *
 * ## 写しを持たない
 *
 * `tsc` が書き出した `lib/cards.js` を、**偽の firebase-admin を渡して**
 * そのまま動かす（`cards_public_selftest.mjs` と同じ土台）。写しを置くと、
 * 本体を直したのに確かめが古いまま通る。
 *
 * ## わざと壊して、赤くなるかを見る
 *
 * `CARDS_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通らない）。
 *
 * ```bash
 * cp -r functions/lib /tmp/brokenlib
 * # 上限を600に戻す（＝直す前の姿）
 * sed -i 's/CARDS_HARD_CAP = 20000/CARDS_HARD_CAP = 600/' /tmp/brokenlib/cards.js
 * CARDS_LIB_DIR=/tmp/brokenlib node functions/selftest/cards_bulk_selftest.mjs
 * ```
 *
 * ## 本番のデータを引かない
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * チャンネルIDは、それ自体が「投げ銭した人の名簿」**なので、出てくるのは
 * 仕込んだ `UC_v_000001` `なまえ_1` だけ。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/cards_bulk_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";

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

/* ---------------- 仕込む入れ物 ----------------

   **ぜんぶ偽の字。** 本番のチャンネルIDも表示名も1文字も置かない。

   | | 数 | 何のため |
   | --- | --- | --- |
   | 写真 | 700 | `getAll` の300の割りを**2回またぐ**。旧 `MAX_IMAGES`(600) も超える |
   | カード | 1,000 | 旧 `MAX_CARDS`(600) を超える |
   | 名乗りの種類 | 700 | `iconsOf` の旧 600 を超える |

   カードの持ち主は2通り。**絵の当たり方を両方通す**（`pickIcon`）。

   - 700人の「寄った人」…… 名簿に `channelId` が無いので、**名乗りで当たる**
   - あやと（`UC_me_0000001`）…… 名簿に `channelId` があるので、そちらで当たる */

/** 写真の枚数。300 の割りを2回またぐ */
const PHOTOS = 700;
/** あやとのカードが乗っている写真の枚数（第1幕） */
const MINE_FIRST = 300;

/** 連番を4桁にそろえる
 * @param {number} i 連番
 * @return {string} 0 埋めした4桁
 */
const pad = (i) => String(i).padStart(4, "0");

/** 写真の書類ID
 * @param {number} i 連番
 * @return {string} 書類ID
 */
const photoId = (i) => `img_${pad(i)}`;

/* **URL の長さと中身を、本番に寄せる。** 転送量を測るのがこの診断の
   仕事の1つなので、`https://example.invalid/1.jpg` のような短い字で測ると
   実際よりずっと軽く見える。本番は `photoUrl`（`islandApi.ts`）が作る
   `firebasestorage` の URL で、合言葉つきで 190字前後。

   **合言葉を1枚ずつ散らす。** 全部同じ字にすると gzip がまとめて畳んで
   しまい、**圧縮後が本番の何分の一かに出る**（同じ字を並べただけの
   700本は、ほぼ 0 バイトに潰れる）。本番の合言葉は1枚ごとに別の
   でたらめな字なので、そこは畳めない。 */

/**
 * 連番から、でたらめに見える16進を作る（毎回同じ値が出る）。
 * @param {number} i 連番
 * @param {number} n 欲しい桁数
 * @return {string} 16進の字
 */
function hex(i, n) {
  let out = "";
  let x = (i * 2654435761) >>> 0;
  while (out.length < n) {
    x = (x * 1103515245 + 12345) >>> 0;
    out += x.toString(16).padStart(8, "0");
  }
  return out.slice(0, n);
}

/** 本番と同じ形・同じ長さの URL を作る
 * @param {number} i 連番
 * @return {string} 画像の URL
 */
const photoUrl = (i) =>
  "https://firebasestorage.googleapis.com/v0/b/" +
  "island-selftest.firebasestorage.app/o/" +
  `streamEvents%2Fev_selftest%2F${hex(i, 8)}-${hex(i + 1, 4)}-4` +
  `${hex(i + 2, 3)}-8${hex(i + 3, 3)}-${hex(i + 4, 12)}.jpg` +
  `?alt=media&token=${hex(i + 5, 8)}-${hex(i + 6, 4)}-4${hex(i + 7, 3)}` +
  `-8${hex(i + 8, 3)}-${hex(i + 9, 12)}`;

/** 写真の日。新しいほうから1日ずつさかのぼる
 * @param {number} i 連番
 * @return {string} YYYY-MM-DD
 */
const dayOf = (i) =>
  new Date(Date.UTC(2026, 8, 30) - (i - 1) * 86400000)
    .toISOString().slice(0, 10);

/** 添え書き。**本番の字は1文字も置かない。**長さだけ寄せる */
const NOTES = [
  "ベルゲンの朝ごはん", "トロムソの夜の空", "フィヨルドの船のうえ",
  "ヘルシンキの古本屋", "サウナのあとのアイス", "白夜のさんぽみち",
];

const STORE = {
  islandCards: {},
  islandStreamEventImage: {},
  islandUsers: {"uid-me": {channelId: "UC_me_0000001"}},
  /* **名簿は3人。** 1人に鍵を700本持たせる（`lookupKeys` は1人が何本も
     持つ——呼び名ぶん）。人数で切ると当たらなくなるところを作っておく。 */
  islandCharacter: {
    char_me: {channelId: "UC_me_0000001", lookupKeys: ["さくら"]},
    char_many: {lookupKeys: []},
    char_nobody: {lookupKeys: ["だれでもない"]},
  },
};

for (let i = 1; i <= PHOTOS; i += 1) {
  STORE.islandStreamEventImage[photoId(i)] = {
    url: photoUrl(i),
    w: 1600,
    h: 1200,
    /* 添え書きも1枚ずつ変える。同じ字だと、ここも gzip に畳まれる */
    note: `${NOTES[i % NOTES.length]}（${i}まいめ）`,
    at: 2_000_000 - i,
    streamEventId: "ev_selftest",
    role: "card",
  };
  /* 寄った人。**名簿に `channelId` が無い**ので、絵は名乗りから当てる */
  STORE.islandCards[`${photoId(i)}__UC_v_${pad(i)}`] = {
    channelId: `UC_v_${pad(i)}`,
    day: dayOf(i),
    streamEventImageId: photoId(i),
    earnedAt: 2_000_000 - i * 10,
    nameSnapshot: `なまえ_${i}`,
  };
  STORE.islandCharacter.char_many.lookupKeys.push(`なまえ_${i}`);
  if (i <= MINE_FIRST) {
    STORE.islandCards[`${photoId(i)}__UC_me_0000001`] = {
      channelId: "UC_me_0000001",
      day: dayOf(i),
      streamEventImageId: photoId(i),
      earnedAt: 2_000_000 - i * 10 + 1,
      nameSnapshot: "さくら",
    };
  }
}

/** 第1幕のカードの枚数 */
const FIRST = PHOTOS + MINE_FIRST;

/* ---------------- 偽の Firestore ---------------- */

const snapOf = (id, v) => ({
  id,
  exists: !!v,
  data: () => v,
  get: (k) => (v ? v[k] : undefined),
});

/** `getAll` に渡された数。**300 の割りで投げているかを、ここで数える** */
let getAllSizes = [];
/** `islandCards` の問い合わせに積まれた `limit`。栓の値を見るのに使う */
let lastLimit = 0;
/**
 * **栓に当たった形を作る切り替え。** 0 でなければ `islandCards` の
 * 問い合わせが、**頼まれた数ちょうど**を返す（＝もっとあるのに切れた形）。
 * 2万枚を本当に並べると重いので、問い合わせの側で作る。
 */
let overflow = false;

/**
 * 問い合わせ。`where` / `orderBy` / `select` / `limit` だけ。
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
    /* `select` の口は残しておく。**無いと、引く側が `select` を足した日に
       例外になり、`iconsOf` がそれを握りつぶして「絵なし」を返す。** */
    select: (...f) => query(name, {...q, select: f}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      if (name === "islandCards") lastLimit = q.limit ?? 0;
      /* **栓に当たった形。** 頼まれた数ちょうど返す＝まだ先がある */
      if (name === "islandCards" && overflow) {
        const rows = [];
        for (let i = 0; i < (q.limit ?? 0); i += 1) {
          rows.push(snapOf(`ovf_${pad(i)}__UC_v_0001`, {
            channelId: "UC_v_0001",
            day: "2026-09-11",
            streamEventImageId: photoId(1),
            earnedAt: 9_000_000 - i,
            nameSnapshot: "なまえ_1",
          }));
        }
        return {
          size: rows.length,
          empty: rows.length === 0,
          docs: rows,
          forEach: (f) => rows.forEach(f),
        };
      }
      let rows = Object.entries(STORE[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, v] of q.where ?? []) {
        rows = rows.filter((d) => d.data()[f] === v);
      }
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
  };
}

const DB = {
  collection: (name) => ({
    ...query(name, {}),
    doc: (id) => ({
      id,
      _c: name,
      get: async () => snapOf(id, STORE[name]?.[id]),
    }),
  }),
  getAll: async (...refs) => {
    /* **Firestore の `getAll` には上限がある。** 本物は 1,000件を超えると
       突っぱねる。偽物が黙って返すと、割らずに投げても通ってしまう。 */
    if (refs.length > 1000) {
      throw new Error(`偽の Firestore：getAll に ${refs.length} 件は渡せない`);
    }
    getAllSizes.push(refs.length);
    return refs.map((r) => snapOf(r.id, STORE[r._c]?.[r.id]));
  },
  batch: () => {
    throw new Error("偽の Firestore は書かない");
  },
};

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

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
    throw new Error("偽の admin は合言葉を確かめない");
  },
};

/** 出たログ。**視聴者さんの素性が出ていないかを、あとで数える** */
const logs = [];
const functions = {
  logger: {
    warn: (...a) => logs.push(`warn ${a.join(" ")}`),
    info: (...a) => logs.push(`info ${a.join(" ")}`),
    error: (...a) => logs.push(`error ${a.join(" ")}`),
  },
};

const nodeRequire = createRequire(import.meta.url);
const loaded = new Map();

/**
 * `lib/<名前>.js` を、偽の admin を渡して読み込む。
 * @param {string} name 拡張子なしの名前
 * @return {object} その module.exports
 */
function load(name) {
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
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  loaded.set(name, mod.exports);
  return mod.exports;
}

/** いま使っている `lib/cards.js`。**控えごと入れ替えられるように持つ** */
let cards = load("cards");

/** 控え（`characterBook` の5分）を捨てて、冷えた1回目に戻す */
function reloadCards() {
  loaded.clear();
  cards = load("cards");
}

if (typeof cards.handleCards !== "function") {
  console.error("lib/cards.js から handleCards を取り出せなかった");
  process.exit(1);
}

const deps = {
  whoIs: async (h) =>
    (h === "Bearer me" ? {uid: "uid-me", name: "さくら"} : null),
  ownerUid: async () => null,
  listResidents: async () => [
    {uid: "uid-me", channelId: "UC_me_0000001", name: "さくら"},
  ],
};

/**
 * 口を1回叩く。**`getAll` の数え直しもここでやる。**
 * @param {string} method GET / POST
 * @param {string} path パス
 * @param {string} [auth] Authorization ヘッダ
 * @return {Promise<object>} 状態と返り
 */
async function call(method, path, auth) {
  getAllSizes = [];
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
  out.handled = await cards.handleCards(
    {method, path, auth, body: {}}, res, deps,
  );
  return out;
}

/* ---------------- 0. 探し方が当たるか（先に見る・#19） ---------------- */

console.log("# 0. 探し方が当たるか（先に見る）");

check(
  `仕込んだカードが ${FIRST} 枚（旧 600 を超えている）`,
  Object.keys(STORE.islandCards).length === FIRST && FIRST > 600,
  `${Object.keys(STORE.islandCards).length} 枚`,
);
check(
  `仕込んだ写真が ${PHOTOS} 枚（300 の割りを2回またぐ）`,
  Object.keys(STORE.islandStreamEventImage).length === PHOTOS,
  `${Object.keys(STORE.islandStreamEventImage).length} 枚`,
);
check(
  "名乗りの種類が 600 を超えている（`iconsOf` の旧上限の先を見る）",
  STORE.islandCharacter.char_many.lookupKeys.length > 600,
  `${STORE.islandCharacter.char_many.lookupKeys.length} 種`,
);

const pub = await call("GET", "/cards");
const pubCards = pub.body?.cards ?? [];
const pubSizes = getAllSizes;

check("公開の /cards は扱われる", pub.handled === true);
check("公開の /cards は 200", pub.status === 200, String(pub.status));

/* ---------------- 1. 600枚を超えても、1枚も落ちない ---------------- */

console.log("\n# 1. 600枚を超えても、1枚も落ちない");

check(
  `公開の /cards が ${FIRST} 枚ぜんぶ返す`,
  pubCards.length === FIRST,
  `${pubCards.length} / ${FIRST} 枚`,
);
check(
  "600 枚で切られていない（直す前はここで止まっていた）",
  pubCards.length > 600,
  `${pubCards.length} 枚`,
);
{
  /* **url の無いカードは出ない**（`listCards` の `continue`）。
     つまり「画像を引けなかった」は、枚数が減る形でしか出てこない。 */
  const noUrl = pubCards.filter((c) => !c.url).length;
  check("url の欠けたカードが0枚", noUrl === 0, `${noUrl} 枚`);
  const photos = new Set(pubCards.map((c) => c.photoId));
  check(
    `写真が ${PHOTOS} 枚ぶんぜんぶ出ている`,
    photos.size === PHOTOS,
    `${photos.size} / ${PHOTOS} 枚`,
  );
}

/* ---------------- 2. `getAll` を300で割っている ---------------- */

console.log("\n# 2. 写真の引き当ては、300件ずつに割って投げる");
{
  const most = Math.max(...pubSizes);
  const total = pubSizes.reduce((a, b) => a + b, 0);
  console.log(`  割り: ${pubSizes.join(" + ")} = ${total}`);
  check("1回に 300件を超えて渡していない", most <= 300, `最大 ${most} 件`);
  check("2回以上に割れている（割りをまたいでいる）", pubSizes.length >= 2,
    `${pubSizes.length} 回`);
  check(
    `渡した合計が写真の枚数ちょうど（${PHOTOS}）。同じ写真を2度引いていない`,
    total === PHOTOS,
    `${total} 件`,
  );
  /* **割りの境目**。301枚目の写真はここから落ちていた（旧 `.slice`）。 */
  const photos = new Set(pubCards.map((c) => c.photoId));
  check(
    "300枚目の写真が出ている",
    photos.has(photoId(300)),
  );
  check(
    "301枚目の写真が出ている（割りをまたいだ先）",
    photos.has(photoId(301)),
  );
  check(
    "601枚目の写真が出ている（旧 MAX_IMAGES の先）",
    photos.has(photoId(601)),
  );
}

/* ---------------- 3. いちばん古いカードが残っている ---------------- */

console.log("\n# 3. いちばん古いカードが、応答に入っている");
{
  /* 本番で消えていたのがこれ。`earnedAt` のいちばん小さいカードは
     `orderBy("earnedAt","desc")` のいちばん後ろ＝上限で最初に切られる。 */
  const oldest = Object.entries(STORE.islandCards)
    .sort((a, b) => a[1].earnedAt - b[1].earnedAt)[0];
  const photos = new Set(pubCards.map((c) => c.photoId));
  check(
    `いちばん古いカードの写真（${oldest[1].day}）が出ている`,
    photos.has(oldest[1].streamEventImageId),
    oldest[1].streamEventImageId,
  );
  const days = pubCards.map((c) => c.day);
  check(
    `いちばん古い日（${dayOf(PHOTOS)}）のカードがある`,
    days.includes(dayOf(PHOTOS)),
  );
  check(
    `いちばん新しい日（${dayOf(1)}）のカードもある`,
    days.includes(dayOf(1)),
  );
}

/* ---------------- 4. 名乗りが600種類を超えても、絵が当たる ---------------- */

console.log("\n# 4. 名乗りが600種類を超えても、絵が最後まで当たる");
{
  const noIcon = pubCards.filter((c) => !c.icon).length;
  check("絵の当たらないカードが0枚（空振りでない）", noIcon === 0,
    `${noIcon} 枚`);
  /* 旧 `iconsOf` は名乗りを 600 で切っていた。並びは新しい順なので、
     切られるのは**いちばん古い名乗り**——つまり 700人目。 */
  const last = pubCards.find((c) => c.photoId === photoId(PHOTOS));
  check(
    `${PHOTOS}人目（いちばん古い名乗り）にも絵が乗っている`,
    last?.icon === "char_many",
    `${last?.icon}`,
  );
  const kinds = new Set(pubCards.map((c) => c.icon));
  check(
    "`channelId` からの絵も出ている（引き方を両方通している）",
    kinds.has("char_me") && kinds.has("char_many"),
    [...kinds].join(","),
  );
}

/* ---------------- 5. 転送量 ---------------- */

console.log("\n# 5. 転送量（スマホで開く面なので、数えておく）");
{
  const body = JSON.stringify({cards: pubCards});
  const raw = Buffer.byteLength(body);
  const gz = gzipSync(body).length;
  console.log(
    `  ${pubCards.length} 枚 … 生 ${(raw / 1024).toFixed(0)}KB` +
    ` / gzip ${(gz / 1024).toFixed(0)}KB` +
    ` （1枚あたり 生 ${(raw / pubCards.length).toFixed(0)}B` +
    ` / gzip ${(gz / pubCards.length).toFixed(0)}B）`,
  );
  /* **数えるだけで、落とさない。** いくつなら重すぎるかは画面の側の話で、
     ここで線を引くと「転送量が増えた」だけで赤が出る。 */
}

/* ---------------- 6. `/cards/mine` も切れない ---------------- */

console.log("\n# 6. /cards/mine も、600 枚で切れない");
{
  const before = await call("GET", "/cards/mine", "Bearer me");
  check(
    `先に ${MINE_FIRST} 枚返る（探し方が当たっている）`,
    (before.body?.cards ?? []).length === MINE_FIRST,
    `${(before.body?.cards ?? []).length} 枚`,
  );
  /* **あやとのカードを 700 枚まで増やす。** 第1幕で 300 枚にしてあるのは、
     増やす前後の差で「切れていない」を見るため。 */
  for (let i = MINE_FIRST + 1; i <= PHOTOS; i += 1) {
    STORE.islandCards[`${photoId(i)}__UC_me_0000001`] = {
      channelId: "UC_me_0000001",
      day: dayOf(i),
      streamEventImageId: photoId(i),
      earnedAt: 2_000_000 - i * 10 + 1,
      nameSnapshot: "さくら",
    };
  }
  const got = await call("GET", "/cards/mine", "Bearer me");
  const mine = got.body?.cards ?? [];
  check(`/cards/mine が ${PHOTOS} 枚返す`, mine.length === PHOTOS,
    `${mine.length} / ${PHOTOS} 枚`);
  check("600 枚で切られていない", mine.length > 600, `${mine.length} 枚`);
  check(
    "ぜんぶ自分のカード（絞りが外れていない）",
    mine.every((c) => c.channelId === "UC_me_0000001"),
  );
  check(
    "url の欠けたカードが0枚（写真の引き当ても切れていない）",
    mine.every((c) => c.url),
  );
  /* 公開の口も、増えたぶんそのまま返る */
  const all = await call("GET", "/cards");
  check(
    `公開の /cards も ${PHOTOS * 2} 枚に増える（1,000 でも止まらない）`,
    (all.body?.cards ?? []).length === PHOTOS * 2,
    `${(all.body?.cards ?? []).length} 枚`,
  );
}

/* ---------------- 7. 栓に当たったら、黙らずに出る ---------------- */

console.log("\n# 7. 栓に当たったときは、黙って切らない");
{
  /* **際限なく読むのも駄目**なので栓は残してある。残すなら、当たったことが
     どこかに出ないといけない——出ないのが、600 で切っていたときの姿
     （`docs/island-standards.md` 10・13）。 */
  check(
    "栓は 600 より大きい（旧 MAX_CARDS に戻っていない）",
    lastLimit > 601,
    `limit=${lastLimit}`,
  );
  console.log(`  栓: ${lastLimit - 1} 枚（問い合わせは +1 枚で投げている）`);
  const quiet = logs.filter((l) => l.startsWith("error ")).length;
  check("ここまでの応答では error ログが1行も出ていない", quiet === 0,
    logs.filter((l) => l.startsWith("error ")).join(" / ").slice(0, 120));

  reloadCards();
  overflow = true;
  const over = await call("GET", "/cards");
  overflow = false;
  const cap = lastLimit - 1;
  check("栓に当たっても 200 で返る（カードは出す）", over.status === 200,
    String(over.status));
  check(
    `返すのは栓ちょうど（${cap} 枚。+1 枚めは捨てる）`,
    (over.body?.cards ?? []).length === cap,
    `${(over.body?.cards ?? []).length} / ${cap} 枚`,
  );
  const shout = logs.filter((l) => l.startsWith("error ") &&
    l.includes("cards hard cap hit"));
  check("切ったことが error で出る（黙っていない）", shout.length === 1,
    `${shout.length} 行`);
  check(
    "出たログに栓の数が入っている（どこで切れたか分かる）",
    shout[0]?.includes(String(cap)),
    shout[0]?.slice(0, 120),
  );
  // **対照**：栓に当たらなければ、error は増えない
  reloadCards();
  await call("GET", "/cards");
  const again = logs.filter((l) => l.includes("cards hard cap hit")).length;
  check("当たらない回には出ない（鳴りっぱなしでない）", again === 1,
    `${again} 行`);
}

/* ---------------- 8. ログに素性が出ていない ---------------- */

console.log("\n# 8. ログに、視聴者さんの素性が1文字も出ない");
{
  const all = logs.join("\n");
  check("チャンネルIDが出ていない", !all.includes("UC_"), all.slice(0, 120));
  check("名乗りが出ていない", !all.includes("なまえ_"), all.slice(0, 120));
  console.log(`  出たログ: ${logs.length} 行`);
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
