/**
 * 島の投げ銭を受けるための Firebase の SDK を、**1つの塊**にまとめる入口（`islandSdk.ts` が `import()` する。#1405）。
 *
 * ## なぜ別のファイルで、なぜ `.mjs` か
 *
 * - `import("firebase/app")` と `import("firebase/firestore")` を別々に書くと、書き出し（Metro）は2つの塊が分け合う
 *   `@firebase/app` の芯（約 69KB。FirebaseError・heartbeat など）を**入口の塊（entry）へ引き上げた**（2026-11-23 の
 *   alert-perf の書き出しで、entry が master の 2,095KB から 2,162KB に増えていた）。entry は Expo の面ぜんぶが読む。
 *   ここ1つを `import()` すれば、SDK はまるごと1つの塊に入り、アラートの面で島の投げ銭を受けるときだけ落ちる
 * - `app/` の下の `.ts`・`.js` は、Expo Router が面として**静的に**読み込む（`expo-router/_ctx-shared.js` の
 *   `EXPO_ROUTER_CTX_IGNORE` は `\.[tj]sx?$` を拾う）。ここを `.ts` にすると、SDK が entry に入ってしまう。
 *   `.mjs` は面に数えられず、Metro は読む（`sourceExts` に `mjs` がある）
 */
export { initializeApp, getApps } from "firebase/app";
export { getFirestore, doc, onSnapshot } from "firebase/firestore";
