/**
 * uid を、突き合わせの鍵に潰す。**サーバーと同じ式**
 * （`functions/src/islandApi.ts` の `hereKey`。sha256 の先頭16字）。
 *
 * ## なぜ潰すのか
 *
 * `/state` は uid を返さなくなった（`docs/island-misses.md` #133）。
 * 返していたころは、uid を返す他の口（`/nextplans` の `byUid`）と
 * 突き合わせるだけで「この企画を出したのはこの人」が分かった。
 *
 * 居場所（`islandHere/{uid}`）の書類IDは uid のままなので——ルールが
 * `request.auth.uid` と書類IDを見ているので、ここは変えられない——
 * **読む側で同じように潰して**名前と顔に結ぶ（`lib/hereRest.ts`）。
 *
 * **片方だけ変えない。** ここを変えるならサーバーも同じ日に変える。
 * 食い違うと、島に人は立つが名前が1つも出なくなる（絵も出ない）。
 *
 * ## ここを1つのファイルにしてある理由
 *
 * `lib/here.ts` に置くと、島の間取り（`components/island/layout`）まで
 * 一緒に付いてくる。潰す式を使うのは住人の名簿を読むところ
 * （`lib/liveStats.tsx`。**島の外の面でも読む**）なので、
 * そこに島の間取りを持ち込まない。
 */

/** 潰した鍵の控え。同じ uid を何度も潰さない（読むたびに60件ぶん出る） */
const keyed = new Map<string, string>();

/**
 * @param uid 潰すもの（居場所の書類ID、または自分の uid）
 * @returns 16字の16進。潰せない箱では `null`（**空文字にしない**。
 *   空文字どうしが当たって、全員が同じ人になる）
 */
export async function hereKey(uid: string): Promise<string | null> {
  const had = keyed.get(uid);
  if (had) return had;
  try {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(uid),
    );
    const hex = [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
    keyed.set(uid, hex);
    return hex;
  } catch {
    /* `crypto.subtle` は安全な文脈でしか無い（`http://` の LAN 越しなど）。
       そのときは突き合わせを諦める。**島に人は立つ。名前が出ないだけ。** */
    return null;
  }
}
