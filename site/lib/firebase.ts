/**
 * Firebase の初期化。ログインだけに使う。
 *
 * ここに出てくる値は公開前提の識別子で、秘密ではない。
 * （Firebase Hosting は同じ内容を /__/firebase/init.json で配っている）
 * 実際の権限は Firestore のルールと Cloud Functions 側で見ている。
 *
 * **読み込みは押されてから。** firebase/app と firebase/auth を静的に取り込むと、
 * ログインを一度も使わない人にも 85KB（縮めて 23KB）が全ページで乗る。実測で
 * この塊は 20% しか走っていなかった。import() にして、要るときだけ取りにいく。
 */

import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

const config = {
  apiKey: "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM",
  authDomain: "live-streaming-d3cac.firebaseapp.com",
  projectId: "live-streaming-d3cac",
  storageBucket: "live-streaming-d3cac.firebasestorage.app",
  messagingSenderId: "291182823114",
  appId: "1:291182823114:web:84e7d7c52c8d3ca7d39633",
};

let ready: Promise<Auth> | null = null;

/**
 * ログインの土台。**ブラウザでだけ、押されてから呼ぶ。**
 *
 * 2回目からは同じ約束を返すので、取りにいくのは1回きり。
 */
export function firebaseAuth(): Promise<Auth> {
  if (!ready) {
    ready = (async () => {
      const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
      ]);
      return getAuth(getApps()[0] ?? initializeApp(config));
    })();
  }
  return ready;
}

let store: Promise<Firestore> | null = null;

/**
 * Firestore。**「いま島にいる人」だけがここを直接触る**（`docs/island-here.md`）。
 *
 * 島の読み書きは全部 `/island-api` 経由で、Firestore のルールは全部 deny になっている。
 * 例外は `islandHere` の1つだけ。他の人の動きを「動いて見える」速さで出すのに、
 * 数秒ごとに Function へ聞きにいくのでは足りないので、そこだけ `onSnapshot` で受ける。
 *
 * **これも押されてから／島が落ち着いてから読む。** firebase/firestore は
 * firebase/auth よりさらに大きい。島を開いた瞬間に取りにいくと、
 * 誰も居ない時間帯でも全員がその代金を払うことになる。
 * 呼ぶ側（`lib/here.ts` を使う2つ）が、暇になってから呼ぶ。
 */
export function firebaseDb(): Promise<Firestore> {
  if (!store) {
    store = (async () => {
      const [{ initializeApp, getApps }, { getFirestore }] = await Promise.all([
        import("firebase/app"),
        import("firebase/firestore"),
      ]);
      return getFirestore(getApps()[0] ?? initializeApp(config));
    })();
  }
  return store;
}
