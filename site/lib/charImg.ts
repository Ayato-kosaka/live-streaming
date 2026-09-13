/**
 * キャラクターの絵の URL。
 *
 * ## なぜ口を1枚かませるか
 *
 * 絵は Google ドライブから Firebase Storage へ移した（#284）。置き場の
 * URL は1本 200字あって、しかも**1枚ずつ違う合言葉が付いている。**
 *
 *   - 焼き込めない（95人 × 役どころ2つ × 幅3つで 150KB になる）
 *   - 画面が出た瞬間に要るので、口から名簿を取ってから描くのも遅い
 *
 * そこで、短くて中身の要らない名前を口で受けて、置き場へ送っている
 * （`functions/src/islandCharacter.ts` の「短い名前で絵を返す」）。
 * 呼ぶ側は**絵の id だけ**知っていればよい。
 *
 * ドライブのときと形をそろえてあるので、置き換えは1行ずつで済んだ。
 *
 *   前: https://lh3.googleusercontent.com/d/{icon}=s128
 *   今: /island-api/characters/{icon}/plain-128.webp
 *
 * ## 幅は 128 / 256 / 640 の3つだけ
 *
 * 焼いてあるのがこの3つ（`islandCharacter.ts` の `WIDTHS`）。
 * ほかを頼むと、口が**大きいほうへ上げて**返す（引き伸ばさない）。
 * `=s96` は 128 が、`=s512` は 640 が受ける、というドライブと同じ考え方。
 */
import { API_BASE } from "./api";

/** 絵の役どころ。`plain` が背景なし、`scene` が背景あり。 */
export type CharRole = "plain" | "scene";

/**
 * @param icon 絵の id（`content/residents.ts` の `icon:`）
 * @param size 欲しい幅。`"full"` は縮める前のもの（持ち帰るとき用）
 * @param role 背景なし（既定）か背景あり
 */
export function charImg(
  icon: string,
  size: 128 | 256 | 640 | "full",
  role: CharRole = "plain",
): string {
  return `${API_BASE}/characters/${encodeURIComponent(icon)}/${role}-${size}.webp`;
}
