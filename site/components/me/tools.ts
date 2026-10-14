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
  | "dest"
  | "plan"
  | "donor"
  | "chara"
  | "fund"
  | "obs";

/**
 * 道具1つ。`shelf` が `"other"` のものは、机の下の棚（「その他」）に回る。
 *
 * あやと（2026-10-14）:
 *
 * > 島の手入れの「いまどこ」はクロードCodeにお願いするのが基本なので
 * > 「その他」に格下げ。「OBS」もほぼ使わないのでその他に格下げ。
 *
 * **消さずに下ろす。** どちらも月に何度かは使うので、無くすと机から
 * 行き場が消える。上の棚は「旅の途中、片手で何度も開くもの」だけにする。
 */
export type ToolRow = { id: Tool; label: string; icon: IconName; shelf?: "other" };

/** **並び順は、旅のあいだに開く回数の多い順。** */
export const TOOLS: ToolRow[] = [
  /* 「写真」から名前を変えた（あやと 2026-10-14「『写真』は名前が意味不明」）。
     机には絵を扱う道具が2つある（住人の「キャラ」と、ここ）ので、
     どちらの絵の話なのかが4文字では分からなかった。**押したあと何をするか**
     を字にする——ここは、その日の写真を旅の壁に貼るところ。 */
  { id: "photo", label: "写真を貼る", icon: "photo" },
  { id: "video", label: "配信", icon: "live" },
  { id: "sticky", label: "付箋", icon: "pinup" },
  /* 付箋を貼れる先そのものを足す／締め切る（`NoteThemes.tsx`）。
     上の「付箋」が1枚ずつへの返事で、こちらは棚のほう。用事が続くので隣に置く。 */
  { id: "dest", label: "貼る先", icon: "signpost" },
  { id: "plan", label: "企画", icon: "checklist" },
  { id: "donor", label: "投げ銭", icon: "coin" },
  /* 投げ銭の下。**紐付けたあとに絵を足す**という順で使うことが多い
     （知らない どねID が来た → つないだ → その人の絵をまだ持っていない）。 */
  { id: "chara", label: "キャラ", icon: "friends" },
  /* 豚の貯金箱（#292）。**投げ銭のふたつの下。** 誰から来たかを直すのが
     上の2つで、こちらは入ったお金と、その行き先。用事は近いので離さない。

     **「スパチャ」から名前を変えた**（2026-09-24）。中身がスパチャの控え
     だけだったころの名前で、いまは出費と目標もここに入る。財布は1つ（#639）。 */
  { id: "fund", label: "貯金箱", icon: "wallet" },
  /* ここから下は「その他」の棚（あやと 2026-10-14）。 */
  { id: "place", label: "いまどこ", icon: "pin", shelf: "other" },
  { id: "obs", label: "OBS", icon: "screen", shelf: "other" },
];

/** 上の棚。旅のあいだ、片手で何度も開くもの。 */
export const MAIN_TOOLS = TOOLS.filter((t) => t.shelf !== "other");
/** 下の棚（「その他」）。たまに開くもの。 */
export const OTHER_TOOLS = TOOLS.filter((t) => t.shelf === "other");

/**
 * `/me` の入口に出す添え書き。**手で並べない。**
 *
 * 並べるのは上の棚だけ。下の棚まで足すと 10個の読点つなぎになって、
 * 入口の1行が2行に折れる。
 */
export const TOOL_LINE = MAIN_TOOLS.map((t) => t.label).join("・");
