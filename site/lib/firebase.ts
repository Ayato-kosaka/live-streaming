/**
 * Firebase の初期化。ログインだけに使う。
 *
 * ここに出てくる値は公開前提の識別子で、秘密ではない。
 * （Firebase Hosting は同じ内容を /__/firebase/init.json で配っている）
 * 実際の権限は Firestore のルールと Cloud Functions 側で見ている。
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const config = {
  apiKey: "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM",
  authDomain: "live-streaming-d3cac.firebaseapp.com",
  projectId: "live-streaming-d3cac",
  storageBucket: "live-streaming-d3cac.firebasestorage.app",
  messagingSenderId: "291182823114",
  appId: "1:291182823114:web:84e7d7c52c8d3ca7d39633",
};

let app: FirebaseApp | null = null;

/** ブラウザでだけ使う。書き出し時には呼ばれない。 */
export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}
