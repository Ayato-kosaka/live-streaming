/**
 * 島の投げ銭を受けるための Firebase の SDK を、**ここで初めて**取りにいく1か所（決定の記録 0017・#1405）。
 *
 * - `import()` なので、書き出し（Metro）はこの SDK を別の塊に分ける。落ちるのはアラートの面で、島の投げ銭を
 *   受けると決まったとき（`IslandTipConnector.start`）だけ。Expo のほかの面には乗らない
 * - 島のほかの面は SDK を外して REST にした（`site/lib/hereRest.ts`。ログインしない人にも 125KB 乗るから）。
 *   アラートの面は OBS と PRISM しか開かず、段の動画を 23.7MB 持つので、ここでは釣り合う（決定の記録 0017 の理由）
 * - **jest はこのファイルごと差し替える**（`app/alertbox/__tests__/islandTip.test.ts`）。jest は `import()` を
 *   そのまま回せない（`--experimental-vm-modules` が要る）ので、`import()` をここ1か所に閉じ込めてある
 */
export async function loadIslandSdk() {
  /* ルートの tsconfig は `module` を書いていない（expo の既定のまま）ので、tsc は `import()` の書き方そのものを
     TS1323 で断る。型は効いたまま、その1件だけを黙らせる（`module` を足すと Expo の全部の型の読み方が変わる） */
  const [app, firestore] = await Promise.all([
    // @ts-expect-error TS1323（上のとおり。書き出しは `import()` を受けて塊を分ける）
    import("firebase/app"),
    // @ts-expect-error TS1323（同じ）
    import("firebase/firestore"),
  ]);
  return {
    initializeApp: app.initializeApp,
    getApps: app.getApps,
    getFirestore: firestore.getFirestore,
    doc: firestore.doc,
    onSnapshot: firestore.onSnapshot,
  };
}

export type IslandSdk = Awaited<ReturnType<typeof loadIslandSdk>>;
