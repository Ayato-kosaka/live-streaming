import type { IconName } from "@/components/ui/Icon";

/**
 * 机（`/me/desk`）に出せる道具。**並びはここ1か所だけ。**
 *
 * ## なぜ別のファイルに出したか
 *
 * 同じ並びが2か所にあった。机の札（`Desk.tsx`）と、`/me` の入口の添え書き
 * （`MyPage.tsx`）。2026-09-10 に「その日」を外して「キャラ」を足したとき、
 * 札のほうだけ直って添え書きが古いまま残り、旅の途中に
 * **いま無い道具を探す1タップ**が生まれていた。
 *
 * 添え書きは札から作る（`TOOL_LINE`）。道具を増やしたり外したりするのは
 * この表だけで、二度とずれない。
 *
 * `IconName` は型だけ連れてくる（書き出しでは消える）ので、
 * `/me` に印の束が降りることはない。
 */
export type Tool =
  | "photo"
  | "place"
  | "video"
  | "sticky"
  | "plan"
  | "donor"
  | "chara"
  | "obs";

/** **並び順は、旅のあいだに開く回数の多い順。** */
export const TOOLS: { id: Tool; label: string; icon: IconName }[] = [
  { id: "photo", label: "写真", icon: "photo" },
  { id: "place", label: "いまどこ", icon: "pin" },
  { id: "video", label: "配信", icon: "live" },
  { id: "sticky", label: "付箋", icon: "pinup" },
  { id: "plan", label: "企画", icon: "checklist" },
  { id: "donor", label: "投げ銭", icon: "coin" },
  /* 投げ銭の下。**紐付けたあとに絵を足す**という順で使うことが多い
     （知らない どねID が来た → つないだ → その人の絵をまだ持っていない）。 */
  { id: "chara", label: "キャラ", icon: "friends" },
  { id: "obs", label: "OBS", icon: "screen" },
];

/** `/me` の入口に出す添え書き。**手で並べない。** */
export const TOOL_LINE = TOOLS.map((t) => t.label).join("・");
