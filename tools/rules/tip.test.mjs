/**
 * 島の投げ銭の2つの入れ物（#1405）を、本物のルールエンジンに掛けて確かめる。
 *
 * - `islandSiteTips` … **読みも書きも閉じる**（誰がいくら出したか・メッセージ・uid）
 * - `islandAlertFeed` … **`get` だけ開ける。`list` と書きは閉じる**
 *   （`docs/island-standards.md` 29.4。合言葉を知っている OBS だけが1枚を読む）
 *
 * ルールは目で読むと合っているように見える。とくに `read` を `get` と `list` に
 * 割ったところは、片方を書き忘れても読むだけでは気づけない。エミュレータに弾かせる。
 *
 * 回しかたは `here.test.mjs` と同じ（道具はリポジトリに入れない）:
 *
 *   REPO=$(git rev-parse --show-toplevel)
 *   mkdir -p /tmp/rulestest && cd /tmp/rulestest
 *   cp "$REPO/firestore.rules" .
 *   printf '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8181},"ui":{"enabled":false},"singleProjectMode":true}}' > firebase.json
 *   npm i @firebase/rules-unit-testing firebase
 *   npx --yes firebase-tools@13 emulators:start --only firestore --project demo-rules &
 *   cp "$REPO/tools/rules/tip.test.mjs" .   # 道具はこの置き場の node_modules から引くので、写して回す
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 node tip.test.mjs
 *
 * **先に「開いている」ほう（get）を見る。** エミュレータか仕込みが壊れていると、
 * deny の足はどれも「通った」に見えるので、get の2本が通らないかぎり信じない。
 *
 * 2026-11-23 の時点で15本、ぜんぶ通る。`list` を開けた写しで回すと、
 * list の3本だけが NG になる（対照）。
 */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { readFileSync } from "fs";

const env = await initializeTestEnvironment({
  projectId: "demo-rules",
  firestore: { host: "127.0.0.1", port: 8181, rules: readFileSync("firestore.rules", "utf8") },
});

const me = env.authenticatedContext("me").firestore();
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

/** 合言葉。偽の字。 */
const KEY = "a".repeat(32);
const item = { seq: 1, who: "@にせもの", yen: 500, text: "にせの字", at: 1 };

await env.clearFirestore();
/* 仕込みはルールを通さずに置く（書くのは Admin SDK の口だけなので）。 */
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, `islandAlertFeed/${KEY}`), { seq: 1, items: [item], updatedAt: "x" });
  await setDoc(doc(db, "islandSiteTips/cs_test_x"), {
    livemode: false, uid: "u", channelId: "UCxxxxxxxxxxxxxxxxxxxxxx", amount: 500, message: "にせ",
  });
});

/* ---- islandAlertFeed ---- */
// **先に「開いている」ほうを見る。** ここが通らないと、下の deny は何も言っていない
await t("合言葉を知っていれば、ログインなしで1枚読める（get）", "allow", () => getDoc(doc(anon, `islandAlertFeed/${KEY}`)));
await t("ログインしていても1枚読める（get）", "allow", () => getDoc(doc(me, `islandAlertFeed/${KEY}`)));
await t("まとめて引けない（list）", "deny", () => getDocs(collection(anon, "islandAlertFeed")));
await t("ログインしていてもまとめて引けない（list）", "deny", () => getDocs(collection(me, "islandAlertFeed")));
await t("絞っても引けない（list に where）", "deny", () =>
  getDocs(query(collection(anon, "islandAlertFeed"), where("seq", ">", 0), limit(1))));
await t("書けない（作る）", "deny", () => setDoc(doc(anon, `islandAlertFeed/${"b".repeat(32)}`), { seq: 1, items: [] }));
await t("ログインしていても書けない（上書き）", "deny", () => setDoc(doc(me, `islandAlertFeed/${KEY}`), { seq: 2, items: [item] }));
await t("直せない（update）", "deny", () => updateDoc(doc(me, `islandAlertFeed/${KEY}`), { seq: 99 }));
await t("消せない", "deny", () => deleteDoc(doc(me, `islandAlertFeed/${KEY}`)));

/* ---- islandSiteTips ---- */
await t("島の投げ銭の1件は読めない（get・ログインなし）", "deny", () => getDoc(doc(anon, "islandSiteTips/cs_test_x")));
await t("ログインしていても読めない（get）", "deny", () => getDoc(doc(me, "islandSiteTips/cs_test_x")));
await t("まとめて引けない（list）", "deny", () => getDocs(collection(me, "islandSiteTips")));
await t("書けない（作る）", "deny", () => setDoc(doc(me, "islandSiteTips/cs_test_y"), { amount: 1 }));
await t("直せない（update）", "deny", () => updateDoc(doc(me, "islandSiteTips/cs_test_x"), { status: "paid" }));
await t("消せない", "deny", () => deleteDoc(doc(me, "islandSiteTips/cs_test_x")));

await env.cleanup();
console.log(bad === 0 ? "\nぜんぶ通った" : `\n通らなかった: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
