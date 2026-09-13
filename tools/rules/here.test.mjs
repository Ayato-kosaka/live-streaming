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
 * 2026-09-11 の時点で36本、ぜんぶ通る。
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
/* --- 月末配信の進行同期(monthlyReview) ---
   ここは 2026-09-11 まで `read, write: if true` で、**外から実際に書けた**。
   書くのはあやとだけ、読むのは誰でもだが1件ずつ、に変えた。
   9/30 の配信で使うので、**「あやとは今までどおり書ける」を先に確かめる。** */
await env.clearFirestore();
// あやとの印。islandUsers はルール上どこからも書けないので、ルールを外して置く
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "islandUsers/me"), { admin: true });
  await setDoc(doc(ctx.firestore(), "monthlyReview/202609-xxxx"), { scene: 0, step: 0, ts: 1, confetti: 0 });
});
const sync = (n) => ({ scene: n, step: 0, ts: Date.now(), confetti: 0 });
await t("あやとは進行を送れる", "allow", () => setDoc(doc(me, "monthlyReview/202609-xxxx"), sync(1)));
await t("あやとは何度でも送れる(巻き戻り防止は ts で見ている。ルールで縛らない)", "allow", () =>
  setDoc(doc(me, "monthlyReview/202609-xxxx"), sync(2)));
await t("あやとは新しい月の書類を作れる", "allow", () => setDoc(doc(me, "monthlyReview/202610-yyyy"), sync(0)));
await t("ログインしていない人は書けない", "deny", () => setDoc(doc(anon, "monthlyReview/202609-xxxx"), sync(9)));
await t("ログインしていない人は新しい書類も作れない", "deny", () =>
  setDoc(doc(anon, "monthlyReview/_probe"), sync(0)));
await t("ログインしていても、あやとでなければ書けない(印そのものが無い人)", "deny", () =>
  setDoc(doc(you, "monthlyReview/202609-xxxx"), sync(9)));
/* **島にログインした人は `islandUsers/{uid}` を持っている**(`/me` が作る)。
   `admin` が入っていないだけ。いちばんありそうな「視聴者さん」はこの形。 */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "islandUsers/you"), { name: "みてるひと" });
});
await t("島にログインしただけの視聴者さんも書けない", "deny", () =>
  setDoc(doc(you, "monthlyReview/202609-xxxx"), sync(9)));
await t("あやとでない人は消せない", "deny", () => deleteDoc(doc(you, "monthlyReview/202609-xxxx")));
await t("OBS(ログインなし)は1件を読める", "allow", () => getDoc(doc(anon, "monthlyReview/202609-xxxx")));
await t("collection ごとは引けない(IDを知らずに月ごとの書類を集められない)", "deny", () =>
  getDocs(collection(anon, "monthlyReview")));
await t("ログインしていても collection ごとは引けない", "deny", () =>
  getDocs(collection(you, "monthlyReview")));

await env.cleanup();
console.log(bad === 0 ? "\nぜんぶ通った" : `\n通らなかった: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
