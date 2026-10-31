/**
 * **ビルド中の「いま」を差し替える。**
 *
 *   FAKE_NOW=2027-11-18T00:00:00Z \
 *     NODE_OPTIONS="--require $PWD/tools/sprites/buildclock.cjs" \
 *     NEXT_PUBLIC_BUILT_AT=2027-11-18T00:00:00Z tools/build.sh 3202
 *
 * `tools/sprites/datebake.mjs` が「日を変えて2回焼く」ために使う。
 *
 * **`NEXT_PUBLIC_BUILT_AT` だけでは足りない。** 焼いた日を読むべきところが
 * 素の `new Date()` を見ていたら、その字は環境変数を変えても動かない——
 * つまり**いちばん見つけたい焼き込みが、2回の書き出しで同じ字になって消える。**
 * 壁の時計ごと進めれば、どちらの道で焼いた字も日で変わる。
 *
 * `class D extends Date` にすると Next の書き出しが
 * `TypeError: Date.parse is not a function` で落ちる（実測）。
 * ふつうの関数にして、`parse` と `UTC` を手で移す。
 */
const iso = process.env.FAKE_NOW;
if (iso && !global.__buildclock) {
  global.__buildclock = true;
  const FAKE = Date.parse(iso);
  if (!Number.isFinite(FAKE)) throw new Error(`FAKE_NOW が日付として読めません: ${iso}`);
  const Real = Date;
  const t0 = Real.now();
  const shift = () => FAKE + (Real.now() - t0);
  function D(...a) {
    if (!new.target) return Real();
    return a.length === 0 ? new Real(shift()) : new Real(...a);
  }
  D.prototype = Real.prototype;
  D.parse = Real.parse.bind(Real);
  D.UTC = Real.UTC.bind(Real);
  D.now = shift;
  Object.defineProperty(D, "name", { value: "Date" });
  global.Date = D;
  globalThis.Date = D;
}
