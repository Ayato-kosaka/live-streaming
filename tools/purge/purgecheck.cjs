/**
 * 公開バケットの片づけの口（`/island-api/public-purge`。#289）を、
 * **偽の置き場を差し込んで実際に動かす。** 本番も Storage も触らない。
 *
 *   cd functions && npx tsc -p tsconfig.json    # 先に焼く
 *   node tools/purge/purgecheck.cjs
 *
 * 見たいのは「たぶんこう動く」ではなく、**呼ばれたメソッドの並び。**
 *
 *   1. 下見は、書き込み系（copy / delete）を1回も呼ばない
 *   2. apply したら **copy → delete の順**で呼ばれる
 *   3. copy が落ちたら **delete を呼ばない**（消してから写す、にしない）
 *   4. `viewer-video/…` は名前で渡しても弾かれて、置き場に手が付かない
 *   5. あやと以外（合言葉なし・にせもの・admin でない）は 403 で、
 *      **そのとき置き場を1回も掴んでいない**
 *   6. 取り付けが、ほかの `path` を横取りしていない
 *
 * 差し替えているのは3つだけ。**口そのものは本物を呼ぶ。**
 *
 * - 合言葉の検算（`admin.auth().verifyIdToken`）
 * - `islandUsers/{uid}.admin` の読み取り
 * - 置き場（`handlePublicPurge` の `deps.storage`）
 */
process.env.GCLOUD_PROJECT = "live-streaming-d3cac";
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: "live-streaming-d3cac",
});

const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const F = path.join(ROOT, "functions", "node_modules");

/* firebase-admin も Firestore も、**焼いた口が使っているのと同じもの**を
   掴む（別の写しを掴むと prototype の差し替えが向こうに届かない）。 */
const admin = require(path.join(F, "firebase-admin"));
const {DocumentReference, Query, CollectionReference} = require(
  path.join(F, "@google-cloud/firestore"),
);

/* 誰の合言葉か。`null` は「検算に落ちる（にせもの）」 */
let TOKEN_UID = null;
/* その uid が `islandUsers` で admin かどうか */
let IS_ADMIN = false;

DocumentReference.prototype.get = async function () {
  if (this.parent.id === "islandUsers") {
    return {
      exists: true,
      data: () => ({admin: IS_ADMIN}),
      get: () => undefined,
    };
  }
  return {exists: false, data: () => ({}), get: () => undefined};
};
const EMPTY = {size: 0, empty: true, docs: [], forEach: () => {}};
Query.prototype.get = async function () {
  return EMPTY;
};
CollectionReference.prototype.get = Query.prototype.get;
Query.prototype.aggregate = function () {
  return {get: async () => ({data: () => ({count: 0, yen: 0})})};
};
CollectionReference.prototype.aggregate = Query.prototype.aggregate;

const PUBLIC_BUCKET = "live-streaming-d3cac-public";
const PRIVATE_BUCKET = "live-streaming-d3cac.firebasestorage.app";

/** 置き場を変えるメソッド。**下見でこれが1つでも出たら失格。** */
const WRITES = new Set(["copy", "delete"]);

/** 本番と同じ中身（#289 に書いてある実測値。2026-09-12）。 */
function publicNow() {
  return new Map([
    [
      "202601_donation_ceremony.json",
      {size: 1997, updated: "2026-01-26T00:00:00.000Z"},
    ],
    [
      "credits_notifications.json",
      {size: 21770, updated: "2025-12-29T00:00:00.000Z"},
    ],
    [
      "viewer-video/\u{1F41F}_v202603142018.mp4",
      {size: 12345678, updated: "2026-03-14T00:00:00.000Z"},
    ],
    [
      "viewer-video/\u{1F41F}_v202603150912.mp4",
      {size: 9876543, updated: "2026-03-15T00:00:00.000Z"},
    ],
    [
      "viewer-video/\u{1F41F}_v202604021130.mp4",
      {size: 5555555, updated: "2026-04-02T00:00:00.000Z"},
    ],
    [
      "viewer-video/\u{1F41F}_v202604190001.mp4",
      {size: 4444444, updated: "2026-04-19T00:00:00.000Z"},
    ],
  ]);
}

/**
 * 偽の置き場。**呼ばれたメソッドを順番に控える。**
 * `fail` に "copy" / "delete" を入れると、そこで 403 を投げる。
 */
function fakeStorage(fail) {
  const calls = [];
  const stores = {
    [PUBLIC_BUCKET]: publicNow(),
    [PRIVATE_BUCKET]: new Map(),
  };
  const tag = (b) => (b === PUBLIC_BUCKET ? "公開" : "私用");

  const makeBucket = (name) => {
    const store = stores[name];
    return {
      name,
      iam: {
        testPermissions: async (perms) => {
          calls.push({op: "iam.testPermissions", on: tag(name)});
          const out = {};
          /* Functions のサービスアカウントがこの置き場で何をできるかは
             **まだ誰も測っていない。** ここは偽物なので、口の返し方を
             見るために「読めて書ける」を置いているだけ。 */
          for (const p of perms) out[p] = p !== "storage.buckets.setIamPolicy";
          return [out];
        },
      },
      getFiles: async () => {
        calls.push({op: "getFiles", on: tag(name)});
        return [
          [...store.entries()].map(([n, m]) => ({name: n, metadata: m})),
        ];
      },
      file: (n) => ({
        name: n,
        metadata: store.get(n),
        getMetadata: async () => {
          calls.push({op: "getMetadata", on: tag(name), name: n});
          const m = store.get(n);
          if (!m) {
            const e = new Error("No such object");
            e.code = 404;
            throw e;
          }
          return [m];
        },
        copy: async (dst) => {
          calls.push({op: "copy", on: tag(name), name: n, to: dst.name});
          if (fail === "copy") {
            const e = new Error("forbidden");
            e.code = 403;
            throw e;
          }
          dst.__put(store.get(n));
        },
        delete: async () => {
          calls.push({op: "delete", on: tag(name), name: n});
          if (fail === "delete") {
            const e = new Error("forbidden");
            e.code = 403;
            throw e;
          }
          store.delete(n);
        },
        __put: (m) => store.set(n, {...m}),
      }),
    };
  };
  return {
    calls,
    stores,
    storage: {
      bucket: (name) => {
        calls.push({op: "bucket", on: tag(name)});
        return makeBucket(name);
      },
    },
  };
}

/* ---- 焼いた口を掴む ---- */
const pp = require(path.join(ROOT, "functions", "lib", "publicPurge.js"));

/* **合言葉の検算を差し替える。** `import * as admin` は名前空間の**写し**に
   なるので `admin.auth` への代入は向こうに届かない。クラスの prototype は
   1つしかないので、そちらを差し替える。**口を1本 require したあとで行う**
   （それまで既定のアプリが無い）。 */
Object.getPrototypeOf(admin.auth()).constructor.prototype.verifyIdToken =
  async function () {
    if (!TOKEN_UID) throw new Error("bad token");
    return {uid: TOKEN_UID};
  };

const realHandle = pp.handlePublicPurge;

/* `islandApi.js` 経由で叩くときも、置き場は偽物に差し替える。
   **口そのものは本物。** 差すのは `deps.storage` 1つだけ。 */
let MOUNTED = null; // 取り付け経由で使う偽の置き場
let HANDLED = null; // その呼び出しで、この口が扱ったかどうか
pp.handlePublicPurge = async function (q, res, deps) {
  const took = await realHandle(q, res, {
    ...deps,
    storage: MOUNTED ? () => MOUNTED.storage : deps.storage,
  });
  HANDLED = took;
  return took;
};

const {islandApi} = require(
  path.join(ROOT, "functions", "lib", "islandApi.js"),
);

/** 返す先の偽物。ステータス・ヘッダ・本文を控える。 */
function recorder(done) {
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
      return res;
    },
    send: (b) => {
      out.body = b;
      done(out);
      return res;
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
  return {out, res};
}

/** 口を直に叩く（取り付けを通さない）。 */
function direct(method, body, fake, auth) {
  return new Promise((done) => {
    const {res} = recorder(done);
    realHandle(
      {method, path: "/public-purge", auth, body: body || {}},
      res,
      {
        ownerUid: async (h) => (h === "Bearer ayato" ? "ayato-uid" : null),
        storage: () => fake.storage,
      },
    ).then((took) => {
      if (!took) done({status: 0, body: null, headers: {}, took: false});
    });
  });
}

/** `islandApi` の入口から叩く（取り付けを通す）。 */
function mounted(method, urlPath, headers, body) {
  return new Promise((done) => {
    const {res} = recorder(done);
    const h = headers || {};
    const req = {
      method,
      path: urlPath,
      url: urlPath,
      originalUrl: urlPath,
      query: {},
      headers: h,
      get: (k) => h[String(k).toLowerCase()],
      body: body || {},
      rawBody: Buffer.from(""),
      on: () => {},
      socket: {},
    };
    islandApi(req, res);
  });
}

const line = (s) => console.log(s);
const seq = (calls) =>
  calls
    .map((c) => (c.name ? `${c.op}(${c.name})` : c.op))
    .join(" → ") || "（1回も呼んでいない）";

let bad = 0;
/** 合否を1行で出す。 */
function check(label, ok) {
  if (!ok) bad++;
  line(`   ${ok ? "OK  " : "★NG "} ${label}`);
}

(async () => {
  /* ===== 1. 下見 ===== */
  line("\n== 1. 下見（GET）。1バイトも書かない ==");
  {
    const fake = fakeStorage();
    const r = await direct("GET", {}, fake, "Bearer ayato");
    line(`   HTTP ${r.status}  cache=${r.headers["cache-control"]}`);
    line(`   呼ばれた順: ${seq(fake.calls)}`);
    line(
      `   返り: 置き場=${r.body.bucket} 件数=${r.body.count} ` +
        `合計=${r.body.bytes}バイト 消せる名前=${JSON.stringify(
          r.body.allowed,
        )}`,
    );
    line(`   できること: ${JSON.stringify(r.body.can)}`);
    for (const f of r.body.files) {
      line(
        `     ${f.name.padEnd(34)} ${String(f.bytes).padStart(9)}バイト ` +
          `${f.updatedAt} 消せる=${f.purgeable} 触らない=${f.keep}`,
      );
    }
    const writes = fake.calls.filter((c) => WRITES.has(c.op));
    check("HTTP 200", r.status === 200);
    check("Cache-Control: no-store", r.headers["cache-control"] === "no-store");
    check("書き込み系を1回も呼んでいない", writes.length === 0);
    check("一覧が6件返った", r.body.count === 6);
    check(
      "消せる名前は表の2つだけ",
      JSON.stringify(r.body.allowed) ===
        JSON.stringify([
          "credits_notifications.json",
          "202601_donation_ceremony.json",
        ]),
    );
  }

  /* ===== 2. apply（写す → 消す） ===== */
  line("\n== 2. credits_notifications.json を apply ==");
  {
    const fake = fakeStorage();
    const r = await direct(
      "POST",
      {names: ["credits_notifications.json"], apply: true},
      fake,
      "Bearer ayato",
    );
    line(`   HTTP ${r.status}`);
    line(`   呼ばれた順: ${seq(fake.calls)}`);
    line(`   done: ${JSON.stringify(r.body.done)}`);
    line(`   failed: ${JSON.stringify(r.body.failed)}`);
    line(`   消したあと残っていたもの: ${JSON.stringify(r.body.still)}`);
    const ops = fake.calls.map((c) => c.op);
    const iCopy = ops.indexOf("copy");
    const iDel = ops.indexOf("delete");
    const priv = fake.stores[PRIVATE_BUCKET];
    check("copy が呼ばれた", iCopy >= 0);
    check("delete が呼ばれた", iDel >= 0);
    check("copy → delete の順", iCopy >= 0 && iDel > iCopy);
    check(
      "公開バケットから消えた",
      !fake.stores[PUBLIC_BUCKET].has("credits_notifications.json"),
    );
    check("私用の置き場に写っている", priv.size === 1);
    line(`   写した先: ${[...priv.keys()][0]}`);
    check(
      "写した先は合言葉の無い置き場",
      String([...priv.keys()][0]).startsWith("purged/public-bucket/"),
    );
    check("still が空（残っていない）", (r.body.still || []).length === 0);
  }

  /* ===== 3. 写すのに失敗したら消さない ===== */
  line("\n== 3. copy が 403 で落ちる場合 ==");
  {
    const fake = fakeStorage("copy");
    const r = await direct(
      "POST",
      {names: ["credits_notifications.json"], apply: true},
      fake,
      "Bearer ayato",
    );
    line(`   HTTP ${r.status}`);
    line(`   呼ばれた順: ${seq(fake.calls)}`);
    line(`   done: ${JSON.stringify(r.body.done)}`);
    line(`   failed: ${JSON.stringify(r.body.failed)}`);
    const ops = fake.calls.map((c) => c.op);
    check("delete を1回も呼んでいない", !ops.includes("delete"));
    check(
      "公開バケットに残っている",
      fake.stores[PUBLIC_BUCKET].has("credits_notifications.json"),
    );
    check("done は空", r.body.done.length === 0);
    check(
      "failed が copy で止まったと言っている",
      r.body.failed.length === 1 && r.body.failed[0].step === "copy",
    );
  }

  /* ===== 4. viewer-video は名前で渡しても弾く ===== */
  line("\n== 4. viewer-video/\u{1F41F}_v202603142018.mp4 を渡す ==");
  {
    const fake = fakeStorage();
    const name = "viewer-video/\u{1F41F}_v202603142018.mp4";
    const r = await direct(
      "POST",
      {names: [name], apply: true},
      fake,
      "Bearer ayato",
    );
    line(`   HTTP ${r.status}`);
    line(`   呼ばれた順: ${seq(fake.calls)}`);
    line(`   返り: ${JSON.stringify(r.body)}`);
    const ops = fake.calls.map((c) => c.op);
    check("HTTP 400 で断った", r.status === 400);
    check("copy も delete も呼んでいない", !ops.some((o) => WRITES.has(o)));
    check("弾いた名前を返している", (r.body.refused || [])[0] === name);
    check("置き場に残っている", fake.stores[PUBLIC_BUCKET].has(name));
    check("私用の置き場へも写していない", fake.stores[PRIVATE_BUCKET].size === 0);
  }

  /* ===== 4b. 表に載っているものと混ぜても、1件も手を付けない ===== */
  line("\n== 4b. 表の2つと viewer-video を混ぜて渡す ==");
  {
    const fake = fakeStorage();
    const name = "viewer-video/\u{1F41F}_v202603150912.mp4";
    const r = await direct(
      "POST",
      {
        names: ["credits_notifications.json", name],
        apply: true,
      },
      fake,
      "Bearer ayato",
    );
    line(`   HTTP ${r.status}  返り: ${JSON.stringify(r.body)}`);
    line(`   呼ばれた順: ${seq(fake.calls)}`);
    check("HTTP 400", r.status === 400);
    check(
      "1件も消していない",
      fake.stores[PUBLIC_BUCKET].size === 6 &&
        !fake.calls.some((c) => WRITES.has(c.op)),
    );
  }

  /* ===== 4c. 空回し（apply なし） ===== */
  line("\n== 4c. apply を付けない（空回し） ==");
  {
    const fake = fakeStorage();
    const r = await direct(
      "POST",
      {names: ["credits_notifications.json", "202601_donation_ceremony.json"]},
      fake,
      "Bearer ayato",
    );
    line(`   HTTP ${r.status}  返り: ${JSON.stringify(r.body)}`);
    line(`   呼ばれた順: ${seq(fake.calls)}`);
    check("apply=false と言っている", r.body.apply === false);
    check(
      "書き込み系を1回も呼んでいない",
      !fake.calls.some((c) => WRITES.has(c.op)),
    );
    check("置き場は6件のまま", fake.stores[PUBLIC_BUCKET].size === 6);
  }

  /* ===== 5. あやと以外は 403。そのとき置き場を1回も掴まない ===== */
  line("\n== 5. あやと以外（取り付け経由で islandApi から叩く） ==");
  {
    const CASES = [
      ["合言葉なし", {}, null, false],
      ["Bearer でない", {authorization: "Basic zzz"}, null, false],
      ["にせの合言葉", {authorization: "Bearer nope"}, null, false],
      ["本物だが admin でない", {authorization: "Bearer ok"}, "viewer", false],
      ["あやと（admin）", {authorization: "Bearer ok"}, "ayato-uid", true],
    ];
    for (const [tag, headers, uid, isAdmin] of CASES) {
      TOKEN_UID = uid;
      IS_ADMIN = isAdmin;
      MOUNTED = fakeStorage();
      const r = await mounted("GET", "/island-api/public-purge", headers);
      const touched = MOUNTED.calls.length;
      line(
        `   ${tag.padEnd(22)} HTTP ${String(r.status).padEnd(4)} ` +
          `cache=${r.headers["cache-control"]} ` +
          `置き場を触った回数=${touched} ` +
          `中身=${r.body && r.body.files ? "返った" : "返っていない"}`,
      );
      if (isAdmin) {
        check(`${tag}: 200 で返る`, r.status === 200);
        check(`${tag}: 取り付けが効いている`, HANDLED === true);
      } else {
        check(`${tag}: 403`, r.status === 403);
        check(`${tag}: 置き場を1回も触っていない`, touched === 0);
      }
    }
    MOUNTED = null;
  }

  /* ===== 6. ほかの path を横取りしていない ===== */
  line("\n== 6. ほかの口を横取りしていないか ==");
  {
    TOKEN_UID = "ayato-uid";
    IS_ADMIN = true;
    const OTHERS = [
      ["GET", "/island-api/state"],
      ["GET", "/island-api/notes"],
      ["GET", "/island-api/fund"],
      ["GET", "/island-api/nextplans"],
      ["GET", "/island-api/donors"],
      ["GET", "/island-api/characters"],
      ["GET", "/island-api/public-purge/extra"],
      ["DELETE", "/island-api/public-purge"],
    ];
    for (const [method, p] of OTHERS) {
      HANDLED = null;
      MOUNTED = fakeStorage();
      const r = await mounted(method, p, {authorization: "Bearer ok"});
      const took = HANDLED === true;
      line(
        `   ${method.padEnd(6)} ${p.padEnd(34)} HTTP ` +
          `${String(r.status).padEnd(4)} 片づけの口が扱った=${took} ` +
          `置き場を触った回数=${MOUNTED.calls.length}`,
      );
      check(`${p} を横取りしていない`, !took);
      MOUNTED = null;
    }
  }

  line(bad === 0 ? "\nぜんぶ思ったとおり" : `\n${bad}件おかしい`);
  process.exit(bad === 0 ? 0 : 1);
})();
