import type { IconName } from "@/components/ui/Icon";

/**
 * 島の管理（`/me/desk`）に出せる道具。**並びはここ1か所だけ。**
 *
 * ## なぜ別のファイルに出したか
 *
 * 同じ並びが2か所にあった。机の札（`Desk.tsx`）と、`/me` の入口の添え書き
 * （`MyPage.tsx`）。2026-09-10 に「その日」を外して「キャラ」を足したとき、
 * 札のほうだけ直って添え書きが古いまま残り、旅の途中に
 * **いま無い道具を探す1タップ**が生まれていた。
 *
 * 添え書きは表から作る（`TOOL_LINE`）。撮る道具（`tools/sprites/hitspan.mjs`
 * `mesweep.mjs`）も、この表を字のまま読む（`tsread.mjs`）。道具を増やしたり
 * 外したりするのはこの表だけで、二度とずれない。
 *
 * `IconName` は型だけ連れてくる（書き出しでは消える）ので、
 * `/me` に印の束が降りることはない。
 */
export type Tool =
  | "sticky"
  | "dest"
  | "photo"
  | "video"
  | "donor"
  | "chara"
  | "fund"
  | "roulette"
  | "obs";

/**
 * 用事。**道具を、何のために開くかで分ける**（#1280）。
 *
 * あやと（2026-11-18）「分類もあまり綺麗じゃない」。前は「上の棚」と
 * 「その他」の2段で、上の棚に7つが開く回数の順で並んでいた。付箋への返事と
 * お題の棚、写真と動画、投げ銭の名前とキャラが、隣どうしでも離れていても
 * 同じ顔をしていたので、**どこに何があるかを毎回読んで探す**ことになった。
 *
 * `fold` の用事は畳んでおく（あやと 2026-10-14「OBS もほぼ使わないので
 * その他に格下げ」）。ルーレットもここ（2026-11-18「ルーレットは、その他の
 * 中に入れるべきでは」）。**消さずに下ろす。** どちらも配信の日には開く。
 */
export type Errand = "reply" | "day" | "people" | "money" | "stream";

/**
 * 用事の見出し。**何をするところかだけ。** 中で何がどう動くかは書かない
 * （`CLAUDE.md`「画面で、システムの仕様を説明しない」）。
 */
export const ERRANDS: Record<Errand, { title: string; fold?: true }> = {
  reply: { title: "視聴者さんに返す" },
  day: { title: "その日の記録" },
  people: { title: "人" },
  money: { title: "お金" },
  stream: { title: "配信の道具", fold: true },
};

export type ToolRow = { id: Tool; label: string; icon: IconName; errand: Errand };

/**
 * **用事の並びも、道具の並びも、この表の上から順。** 用事は、その用事の
 * 道具がはじめて出てきたところに並ぶ。
 *
 * 札の名前は**押したあと何をするか**を字にする（あやと 2026-10-14「『写真』は
 * 名前が意味不明」・2026-11-18「投げ銭、という名前もわかりにくい」）。
 */
export const TOOLS: ToolRow[] = [
  /* 1枚ずつへの返事。待っている数が札に出る（`Desk.tsx`）。 */
  { id: "sticky", label: "付箋に返事", icon: "pinup", errand: "reply" },
  /* 付箋のお題（貼れる先）そのものを足す／締め切る（`NoteThemes.tsx`）。前の名前は「貼る先」で、
     何を貼る先なのかが字から読めなかった。 */
  { id: "dest", label: "お題", icon: "signpost", errand: "reply" },
  /* その日の写真を旅の壁に貼る。机には絵を扱う道具が2つある（ここと「キャラ」）ので、
     どちらの絵の話かを字で分ける。 */
  { id: "photo", label: "写真を貼る", icon: "photo", errand: "day" },
  /* その日の出来事に YouTube の動画を結ぶ（`PlanVideos.tsx`）。前の名前は「配信」で、
     下の「配信の道具」と取り違える。 */
  { id: "video", label: "動画を結ぶ", icon: "live", errand: "day" },
  /* どねる の名前と YouTube のチャンネルをつなぐ（`DonorLinks.tsx`）。前の名前は「投げ銭」。 */
  { id: "donor", label: "名前をつなぐ", icon: "link", errand: "people" },
  /* **つないだあとに絵を足す**という順で使うことが多い
     （知らない どねID が来た → つないだ → その人の絵をまだ持っていない）。 */
  { id: "chara", label: "キャラ", icon: "friends", errand: "people" },
  /* 豚の貯金箱（#292）。入ったお金と、その行き先。財布は1つ（#639）。 */
  { id: "fund", label: "貯金箱", icon: "wallet", errand: "money" },
  /* 配信していない方の端末で開く面（`/me/roulette`）への入口。
     前は机の下に別の1本で立っていた。 */
  { id: "roulette", label: "ルーレット", icon: "poll", errand: "stream" },
  /* 「いまどこ」はここに在ったが外した（#1278）。居場所は滞在の表（`content/stays.ts`）1か所で、
     机から打つ欄は残さない（`docs/adr/0006-fold-next-and-now.md`）。 */
  { id: "obs", label: "OBS", icon: "screen", errand: "stream" },
];

/** 用事ごとに束ねた並び。机はこれを上から描く。 */
export const SHELVES: { errand: Errand; title: string; fold: boolean; tools: ToolRow[] }[] = [
  ...new Set(TOOLS.map((t) => t.errand)),
].map((e) => ({
  errand: e,
  title: ERRANDS[e].title,
  fold: !!ERRANDS[e].fold,
  tools: TOOLS.filter((t) => t.errand === e),
}));

/**
 * `/me` の入口に出す添え書き。**手で並べない。**
 *
 * 並べるのは用事の見出しで、畳んである用事は入れない。道具9つを並べると
 * 30字を超えて、390px の入口の1行が2行に折れる。
 */
export const TOOL_LINE = SHELVES.filter((s) => !s.fold)
  .map((s) => s.title)
  .join("・");
