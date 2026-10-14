/**
 * LINE スタンプの、住人のことば(#716)。**口は閉じてある**(#860)。
 *
 * 住人が `/me` で自分のことばを言い直せる口だった
 * (`GET` で自分のぶんを読み、`POST` で書き直す)。
 * スタンプは 2026-10-13 に LINE へ申請し、もう書き直しても絵に入らない。
 * あやとの決定(#860、2026-10-14)は「欄を全員から消す」。
 *
 * ## 閉じたまま、道は残す
 *
 * 道ごと消すと、送ってきたものは島の口の最後の 404 に落ちる。
 * それだと「閉じた」のか「配り替えの途中で道が無い」のかが外から見分けられない。
 * **410(もう無い)を返す道として残す。** 再び開く予定は無いので、
 * 付箋の締め切り(409。宛先の状態しだいで変わりうる)とは分けてある。
 *
 * **合言葉を見るより前に返す。** あとに置くと、本番で閉じたことを
 * 確かめるのに本物のログインが要る——つまり書く側を叩かないと確かめられない
 * (`POST /me` が言い値を 400 で断るのと同じ形。`islandApi.ts`)。
 * ここで出るのは「この口はもう無い」だけで、誰が選ばれたかは1文字も出ない。
 * 選ばれた人にも、外した人にも、選ばれていない人にも、同じ返事になる。
 *
 * ## 書類は消さない
 *
 * `islandStampLine` の書類は**記録として残す**(本人が書いた字は戻らない。
 * `docs/island-db.md` 3.1)。ここが閉じても、読み書きは管理の道具
 * (`python/admin/stamp_line_*.py`)からだけ残る。
 */

/** 口が受け取るもの。Express の req から要るものだけ。 */
export type StampReq = {
  method: string;
  path: string;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type StampRes = {
  set(k: string, v: string): unknown;
  status(n: number): StampRes;
  json(b: unknown): unknown;
};

/**
 * 閉じたスタンプのことばの口。**扱った URL なら true を返す。**
 * @param {StampReq} q 受け取ったもの
 * @param {StampRes} res 返す先
 * @return {boolean} ここで扱ったかどうか
 */
export function handleStampLine(q: StampReq, res: StampRes): boolean {
  if (q.path !== "/stampline/mine") return false;
  if (q.method !== "GET" && q.method !== "POST") return false;

  /* 閉じた返事は誰にでも同じだが、**中間には置かせないまま**にする。
     人によって中身が違う返事を返していた道なので、いつか開け直したときに
     `no-store` を付け忘れると、他人のことばが誰かの手元に届く */
  res.set("Cache-Control", "no-store");
  res.status(410).json({error: "closed"});
  return true;
}
