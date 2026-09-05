/**
 * `firestore.rules` を、本物のルールエンジンに掛けて確かめる。
 *
 * ルールは目で読んでも合っているように見える。**書き込みの回数を縛る条件は
 * とくにそうで、`create` と `update` のどちらに掛かっているかを間違えても、
 * 読むだけでは気づけない。** エミュレータに実際に弾かせる。
 *
 * 道具はリポジトリに入れていない（普段のビルドには要らないので）。
 * 使うときだけ、どこか別の場所に入れて回す。
 *
 *   mkdir -p /tmp/rulestest && cd /tmp/rulestest
 *   cp /home/user/live-streaming/firestore.rules .
 *   printf '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8181},"ui":{"enabled":false},"singleProjectMode":true}}' > firebase.json
 *   npm i @firebase/rules-unit-testing firebase
 *   npx --yes firebase-tools@13 emulators:start --only firestore --project demo-rules &
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 node /home/user/live-streaming/tools/rules/here.test.mjs
 *
 * 2026-09-05 の時点で25本、ぜんぶ通る。
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { readFileSync } from "fs";

const env = await initializeTestEnvironment({
  projectId: "demo-rules",
  firestore: { host: "127.0.0.1", port: 8181, rules: readFileSync("firestore.rules", "utf8") },
});

const me = env.authenticatedContext("me").firestore();
const you = env.authenticatedContext("you").firestore();
const anon = env.unauthenticatedContext().firestore();
const ok = (v) => (v ? "OK  " : "NG  ");
let bad = 0;
async function t(name, want, fn) {
  let passed;
  try {
    await fn();
    passed = want === "allow";
  } catch (e) {
    passed = want === "deny";
  }
  if (!passed) bad++;
  console.log(`${ok(passed)}${want.padEnd(5)} ${name}`);
}
const good = (at = "/board") => ({ at, x: 610, y: 890, seenAt: serverTimestamp() });

await env.clearFirestore();

await t("自分のぶんを作れる", "allow", () => setDoc(doc(me, "islandHere/me"), good()));
await t("他人のぶんは作れない", "deny", () => setDoc(doc(me, "islandHere/you"), good()));
await t("ログインしていないと作れない", "deny", () => setDoc(doc(anon, "islandHere/me"), good()));
await t("ログインしていなくても読める", "allow", () => getDocs(collection(anon, "islandHere")));
await t("他人のぶんも読める", "allow", () => getDoc(doc(you, "islandHere/me")));

await env.clearFirestore();
await t("名前を足せない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { ...good(), name: "にせもの" }));
await t("アイコンを足せない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { ...good(), photo: "https://x/y.png" }));
await t("手元の時計は通らない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { at: "/", x: 1, y: 1, seenAt: Timestamp.fromMillis(Date.now() + 3600e3) }));
await t("seenAt を欠かせない", "deny", () => setDoc(doc(me, "islandHere/me"), { at: "/", x: 1, y: 1 }));
await t("島の外の座標は通らない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { at: "/", x: 99999, y: 1, seenAt: serverTimestamp() }));
await t("at が文字でないと通らない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { at: 1, x: 1, y: 1, seenAt: serverTimestamp() }));
await t("at に長い文字列は通らない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { at: "/" + "a".repeat(80), x: 1, y: 1, seenAt: serverTimestamp() }));
await t("at にスクリプトは通らない", "deny", () =>
  setDoc(doc(me, "islandHere/me"), { at: "/<script>", x: 1, y: 1, seenAt: serverTimestamp() }));

/* --- 書き込みの回数 --- */
await env.clearFirestore();
await t("1回目（作る）", "allow", () => setDoc(doc(me, "islandHere/me"), good()));
await t("すぐの置き直しは通らない", "deny", () => setDoc(doc(me, "islandHere/me"), good("/kitchen")));
await t("すぐの消しも通らない", "deny", () => deleteDoc(doc(me, "islandHere/me")));
await new Promise((r) => setTimeout(r, 1200));
await t("1秒あけたら置き直せる", "allow", () => setDoc(doc(me, "islandHere/me"), good("/kitchen")));
await new Promise((r) => setTimeout(r, 1200));
await t("1秒あけたら消せる", "allow", () => deleteDoc(doc(me, "islandHere/me")));
await t("消したあとは作り直せる", "allow", () => setDoc(doc(me, "islandHere/me"), good()));
await t("作り直した直後の消しは通らない（消して作るの繰り返しを止める）", "deny", () =>
  deleteDoc(doc(me, "islandHere/me")));

/* --- 他のコレクション --- */
await t("island は読めない", "deny", () => getDoc(doc(anon, "island/current")));
await t("nordicPhotos は読めない", "deny", () => getDocs(collection(anon, "nordicPhotos")));
await t("nordicDays は書けない", "deny", () => setDoc(doc(me, "nordicDays/2026-09-12"), { people: [] }));
await t("islandUsers は読めない", "deny", () => getDoc(doc(me, "islandUsers/me")));
await t("知らないコレクションは書けない", "deny", () => setDoc(doc(me, "nanika/x"), { a: 1 }));
await t("monthlyReview は今までどおり書ける", "allow", () => setDoc(doc(anon, "monthlyReview/x"), { a: 1 }));

await env.cleanup();
console.log(bad === 0 ? "\nぜんぶ通った" : `\n通らなかった: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
