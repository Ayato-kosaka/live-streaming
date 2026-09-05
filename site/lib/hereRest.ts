/**
 * 「いま島にいる人」を、**Firestore の REST だけ**で読み書きする。
 *
 * ## なぜ SDK を使わないか
 *
 * `firebase/firestore` を落とすと、**JS が 590KB(縮めて 125KB)増える。**
 * 実測で、島を開いて12秒までの CPU も +140ms。しかもこれは
 * **ログインしていない人にも乗る**（いる人が見えるのは全員なので）。
 *
 * ここは「誰々さんがオンラインだと見えたら面白い」という飾りで、
 * しかも**ほとんどの時間帯は0人**。0人のために全員が 125KB を払うのは
 * 釣り合わない。この島は数十KB を何日もかけて削っている場所なので、
 * ここだけ 590KB を黙って積むわけにいかない。
 *
 * ## 動いて見えるか
 *
 * **見える。** 居場所が変わるのは2秒に1回（書く側がそう間引いている）なので、
 * 2秒ごとに読めば**届く中身は onSnapshot とまったく同じ**。違うのは
 * 遅れだけで、平均1秒。絵のほうは届いた点へ0.4秒かけて寄せていくので
 * （`IslandStage` の rAF）、滑らかさは変わらない。
 *
 * ## ルールは SDK 用と同じものが効く
 *
 * REST も同じセキュリティルールを通る。サーバー時刻の `seenAt` は
 * `updateTransforms` の `REQUEST_TIME` で送る。これが
 * `request.resource.data.seenAt == request.time` を満たす。
 * エミュレータで、置く・消す・1秒しばり・なりすまし・手元の時計を
 * 全部確かめてある（`tools/rules/here.rest.test.mjs`）。
 */

import { FIREBASE } from "./firebase";

const DOCS =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}` +
  "/databases/(default)/documents";

/** ログインしていない人も読む。鍵が無いと 403 になる（秘密ではない識別子） */
const KEY = `key=${FIREBASE.apiKey}`;

const docPath = (uid: string) =>
  `projects/${FIREBASE.projectId}/databases/(default)/documents/islandHere/${uid}`;

/** 届いた1人ぶん。名前とアイコンはここには入らない（`docs/island-here.md` 3章）。 */
export type HereRow = { uid: string; at: string; x: number; y: number; seenAt: number };

type Val = { stringValue?: string; integerValue?: string; doubleValue?: number; timestampValue?: string };

const num = (v?: Val) =>
  v?.integerValue !== undefined ? Number(v.integerValue) : Number(v?.doubleValue);

/**
 * いま居る人を読む。**ログインしていなくても読める。**
 *
 * @param staleMs これより古い人は取ってこない（読む数を抑える）
 * @param signal 途中でやめるとき
 * @returns 新しい順の名簿。読めなかったら null（**空配列と区別する**。
 *   圏外のときに「誰も居ない」と描くと、居た人が消える）
 */
export async function readHere(staleMs: number, signal?: AbortSignal): Promise<HereRow[] | null> {
  try {
    const res = await fetch(`${DOCS}:runQuery?${KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "islandHere" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "seenAt" },
              op: "GREATER_THAN",
              // **毎回いまの時刻で引き直す。** ここを一度だけ作って使い回すと、
              // 開きっぱなしの画面では下限が置いてきぼりになって、
              // 古い人まで取ってくるようになる
              value: { timestampValue: new Date(Date.now() - staleMs).toISOString() },
            },
          },
          // **新しい順。** limit で切れるとき、落とすなら古いほうから。
          // 昇順だと、いちばん最近来た人から消えることになる
          orderBy: [{ field: { fieldPath: "seenAt" }, direction: "DESCENDING" }],
          limit: 60,
        },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { document?: { name: string; fields: Record<string, Val> } }[];
    if (!Array.isArray(body)) return null;
    const out: HereRow[] = [];
    for (const r of body) {
      // 0人のときは {readTime, done} だけが返る。document を持つものだけ拾う
      const d = r.document;
      if (!d) continue;
      const f = d.fields ?? {};
      const x = num(f.x);
      const y = num(f.y);
      const seenAt = Date.parse(f.seenAt?.timestampValue ?? "");
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(seenAt)) continue;
      out.push({ uid: d.name.split("/").pop() ?? "", at: f.at?.stringValue ?? "/", x, y, seenAt });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 自分の居場所を置く。
 *
 * `seenAt` は送らない。**サーバーに入れてもらう**（`REQUEST_TIME`）。
 * 手元の時計を送るとルールが弾く。弾かれるだけでなく、そこを通せたら
 * ずっと「オンライン」でいられてしまう。
 */
export async function putHere(
  uid: string,
  at: string,
  x: number,
  y: number,
  token: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${DOCS}:commit?${KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        writes: [
          {
            // updateMask を付けないので、まるごと置き換わる（setDoc と同じ）。
            // 知らない項目が前に残っていても、ここで消える
            update: {
              name: docPath(uid),
              fields: {
                at: { stringValue: at },
                x: { integerValue: String(x) },
                y: { integerValue: String(y) },
              },
            },
            updateTransforms: [{ fieldPath: "seenAt", setToServerValue: "REQUEST_TIME" }],
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 置いてきたものを消す。
 *
 * ページを閉じるときにも呼ぶので `keepalive` を付ける。付けないと、
 * 画面が消えた時点で通信ごと捨てられる。届かなくても60秒で
 * 読む側が出さなくなるので、そこは保険が効いている。
 */
export async function dropHere(uid: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${DOCS}:commit?${KEY}`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ writes: [{ delete: docPath(uid) }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
