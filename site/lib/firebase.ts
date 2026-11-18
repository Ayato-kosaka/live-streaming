/**
 * Firebase の初期化。ログインだけに使う。
 *
 * ここに出てくる値は公開前提の識別子で、秘密ではない。
 * （Firebase Hosting は同じ内容を /__/firebase/init.json で配っている）
 * 実際の権限は Firestore のルールと Cloud Functions 側で見ている。
 *
 * **読み込みは、ログインのボタンが画面に出てから。** firebase/app と firebase/auth を
 * 静的に取り込むと、ログインを一度も使わない人にも 85KB（縮めて 23KB）が全ページで乗る。
 * 実測でこの塊は 20% しか走っていなかった。import() にして、要るときだけ取りにいく。
 * 「押されてから」ではないのは、押されてから取りに行くとポップアップが塞がれるから
 * （`lib/auth.tsx` の `readySignIn`）。
 */

import type { Auth } from "firebase/auth";

/**
 * 公開前提の識別子。**秘密ではない**（Firebase Hosting が同じものを
 * `/__/firebase/init.json` で配っている）。
 *
 * 「いま島にいる人」は SDK を落とさず REST で読み書きするので、
 * そちらからも `projectId` と `apiKey` が要る（`lib/hereRest.ts`）。
 * この2つを別々に書き写すと、片方だけ直したときに黙って壊れる。
 *
 * `authDomain` は手元とプレビューのための既定。本番のドメインで開かれた面は、
 * 初期化のときに `authDomainFor` が面のドメインへ替える（下）。
 */
export const FIREBASE = {
  apiKey: "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM",
  authDomain: "live-streaming-d3cac.firebaseapp.com",
  projectId: "live-streaming-d3cac",
  storageBucket: "live-streaming-d3cac.firebasestorage.app",
  messagingSenderId: "291182823114",
  appId: "1:291182823114:web:84e7d7c52c8d3ca7d39633",
};

/**
 * ログインの戻り先（`authDomain`）に、**面と同じドメイン**を使うところ。
 *
 * 戻り先が面と違う（`firebaseapp.com`）と、Safari などの「よそのサイトの保存を塞ぐ」
 * 働きで、ポップアップやリダイレクトの結果が面へ戻らないことがある。Firebase の
 * 「Best practices for using signInWithRedirect on browsers that block third-party
 * storage access」のいちばん目の直しがこれ。Firebase Hosting は繋いだどのドメインでも
 * `/__/auth/handler` を配っているので、面のドメインをそのまま戻り先にできる。
 *
 * **並べてよいのは、Google Cloud の OAuth のクライアントに
 * `https://<そのドメイン>/__/auth/handler` を足し終えたドメインだけ。**
 * 足す前に並べると、Google が戻り先の食い違いでログインを断る。
 * プレビュー（`…--pr-….web.app`）と手元の書き出しは並べない——今までの
 * `FIREBASE.authDomain` のまま動く。`www.` は面を配らず 301 で apex へ送るので要らない。
 */
export const SAME_SITE_AUTH: readonly string[] = [
  "ayato-arigato.com",
  "live-streaming-d3cac.web.app",
];

/**
 * そのホストで開かれた面が使う `authDomain`。
 *
 * **書き出しの時点では決まらない**（同じ書き出しを2つのドメインで配っている）ので、
 * ブラウザで初期化するときに `location.hostname` を渡して決める。
 */
export function authDomainFor(host: string): string {
  const h = host.trim().toLowerCase();
  return SAME_SITE_AUTH.some((d) => d === h) ? h : FIREBASE.authDomain;
}

let ready: Promise<Auth> | null = null;

/**
 * ログインの土台。**ブラウザでだけ、ログインに要るときだけ呼ぶ。**
 *
 * 2回目からは同じ約束を返すので、取りにいくのは1回きり。
 * 取りに行けなかったときは約束を捨てて、次に呼ばれたらもう一度取りに行く
 * （電波の細い日に1回落ちただけで、その面ではもう押せなくなるのを避ける）。
 */
export function firebaseAuth(): Promise<Auth> {
  if (!ready) {
    const p = (async () => {
      const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
      ]);
      return getAuth(
        getApps()[0] ??
          initializeApp({ ...FIREBASE, authDomain: authDomainFor(location.hostname) }),
      );
    })();
    p.catch(() => {
      if (ready === p) ready = null;
    });
    ready = p;
  }
  return ready;
}

/* Firestore の SDK はもう落とさない。
   「いま島にいる人」がここを使っていたが、`firebase/firestore` は
   縮めて 125KB（生 590KB）あって、**ログインしていない人にも乗っていた**
   （いる人が見えるのは全員なので）。居場所が変わるのは2秒に1回なので、
   REST で2秒ごとに読めば届く中身は onSnapshot と同じだった。
   いまは `lib/hereRest.ts` が REST で読み書きしている。 */
