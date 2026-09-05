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
