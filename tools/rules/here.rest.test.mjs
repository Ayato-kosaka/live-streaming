/**
 * 「いる人」を **REST だけ**で読み書きできるかを、エミュレータに確かめさせる。
 *
 * `site/lib/hereRest.ts` は firebase/firestore を落とさない（縮めて 125KB、
 * ほとんどの時間帯は0人なのに全員が払う）。その代わり REST を直に叩くので、
 * **送っている JSON の形が1文字でも違うと、本番でだけ静かに落ちる。**
 * とくに `seenAt` は `updateTransforms` の `REQUEST_TIME` で送っていて、
 * これが `request.resource.data.seenAt == request.time` を満たしている。
 * 目で読んでも合っているように見えるので、実際に弾かせる。
 *
 * ルールそのものの確かめは `here.test.mjs`（SDK 経由）。こちらは
 * **REST の形**の確かめで、両方あって初めて「置ける」と言える。
 *
 *   mkdir -p /tmp/rt && cd /tmp/rt
 *   cp /home/user/live-streaming/firestore.rules .
 *   printf '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8181},"ui":{"enabled":false},"singleProjectMode":true}}' > firebase.json
 *   npx --yes firebase-tools@13 emulators:start --only firestore --project demo-rules &
 *   node /home/user/live-streaming/tools/rules/here.rest.test.mjs
 *
 * 2026-09-05 の時点で13本、ぜんぶ通る。
 */
const HOST = "http://127.0.0.1:8181";
const PID = "demo-rules";
const BASE = `${HOST}/v1/projects/${PID}/databases/(default)/documents`;

/** エミュレータは署名を見ないので、形だけ合った JWT を作る */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (uid) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${PID}`,
    aud: PID,
    sub: uid,
    user_id: uid,
    auth_time: Math.floor(Date.now() / 1000),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: "google.com", identities: {} },
  })}.`;

let bad = 0;
async function t(name, want, fn) {
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { status: 0, body: String(e) };
  }
  const okNow = want === "ok" ? r.status === 200 : r.status === 403 || r.status === 400;
  if (!okNow) bad++;
  console.log(
    `${okNow ? "OK " : "NG "} ${want.padEnd(4)} ${name}  [${r.status}] ${JSON.stringify(r.body).slice(0, 180)}`,
  );
  return r;
}

const call = async (url, init) => {
  const res = await fetch(url, init);
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

/** 置く。seenAt はサーバー時刻(transform)でなければルールが通さない */
const put = (uid, at, x, y, tok) =>
  call(`${BASE}:commit`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `projects/${PID}/databases/(default)/documents/islandHere/${uid}`,
            fields: {
              at: { stringValue: at },
              x: { integerValue: String(x) },
              y: { integerValue: String(y) },
            },
          },
          updateTransforms: [{ fieldPath: "seenAt", setToServerValue: "REQUEST_TIME" }],
        },
      ],
    }),
  });

/** 消す */
const del = (uid, tok) =>
  call(`${BASE}:commit`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify({
      writes: [{ delete: `projects/${PID}/databases/(default)/documents/islandHere/${uid}` }],
    }),
  });

/** 読む。60秒より新しい人だけ、新しい順に */
const read = (sinceMs, tok) =>
  call(`${BASE}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "islandHere" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "seenAt" },
            op: "GREATER_THAN",
            value: { timestampValue: new Date(sinceMs).toISOString() },
          },
        },
        orderBy: [{ field: { fieldPath: "seenAt" }, direction: "DESCENDING" }],
        limit: 60,
      },
    }),
  });

const me = idToken("me");
const you = idToken("you");

console.log("--- 置く ---");
await t("ログインして自分のぶんを置ける", "ok", () => put("me", "/board", 610, 890, me));
await t("ログインしていないと置けない", "deny", () => put("nobody", "/", 1, 1, null));
await t("他人のぶんは置けない", "deny", () => put("you", "/", 1, 1, me));
await t("手元の時計(transform なし)は通らない", "deny", () =>
  call(`${BASE}:commit`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${me}` },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `projects/${PID}/databases/(default)/documents/islandHere/me`,
            fields: {
              at: { stringValue: "/" },
              x: { integerValue: "1" },
              y: { integerValue: "1" },
              seenAt: { timestampValue: new Date(Date.now() + 3600e3).toISOString() },
            },
          },
        },
      ],
    }),
  }));
await t("名前を足せない", "deny", () =>
  call(`${BASE}:commit`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${me}` },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `projects/${PID}/databases/(default)/documents/islandHere/me`,
            fields: {
              at: { stringValue: "/" },
              x: { integerValue: "1" },
              y: { integerValue: "1" },
              name: { stringValue: "にせもの" },
            },
            },
          updateTransforms: [{ fieldPath: "seenAt", setToServerValue: "REQUEST_TIME" }],
        },
      ],
    }),
  }));

console.log("--- 1秒しばりが REST にも効くか ---");
await t("すぐの置き直しは通らない", "deny", () => put("me", "/kitchen", 330, 730, me));
await new Promise((r) => setTimeout(r, 1200));
await t("1秒あけたら置き直せる", "ok", () => put("me", "/kitchen", 330, 730, me));

console.log("--- 読む ---");
await put("you", "/streams", 520, 620, you);
const r1 = await t("ログインしていなくても読める", "ok", () => read(Date.now() - 60_000, null));
const got = (r1.body ?? []).filter((x) => x.document);
console.log(
  "   取れた人:",
  got.map((x) => ({
    uid: x.document.name.split("/").pop(),
    at: x.document.fields.at.stringValue,
    x: Number(x.document.fields.x.integerValue ?? x.document.fields.x.doubleValue),
    y: Number(x.document.fields.y.integerValue ?? x.document.fields.y.doubleValue),
    seenAt: x.document.fields.seenAt.timestampValue,
  })),
);
const r2 = await t("60秒より古い人は返らない", "ok", () => read(Date.now() + 60_000, null));
console.log("   0人のときの返り:", JSON.stringify(r2.body).slice(0, 120));

console.log("--- 消す ---");
await new Promise((r) => setTimeout(r, 1200));
await t("自分のぶんは消せる", "ok", () => del("me", me));
await t("他人のぶんは消せない", "deny", () => del("you", me));

console.log(bad === 0 ? "\nREST だけで足りる" : `\n通らなかった: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
