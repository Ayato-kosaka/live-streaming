import type { Draw } from "./bits";
import { nav } from "./nav";
import { brand } from "./brand";
import { place } from "./place";
import { scene } from "./scene";
import { travel } from "./travel";
import { food } from "./food";
import { stream } from "./stream";
import { feel } from "./feel";
import { nature } from "./nature";
import { misc } from "./misc";

/**
 * 使える印の名前。
 *
 * **消さない・改名しない。** 他のページが文字列で持っている。
 * 増やすときは、絵を足してからここに1行足す。
 */
export type IconName =
  // 操作
  | "right" | "left" | "up" | "chevron" | "close" | "plus" | "minus" | "menu"
  | "check" | "external" | "download" | "search" | "share" | "play"
  // ブランド
  | "appstore" | "googleplay" | "instagram" | "youtube"
  // 島の場所
  | "campfire" | "friends" | "tower" | "workshop" | "tent" | "board" | "pier"
  | "kitchen" | "hill" | "mailbox" | "island" | "home"
  // 旅先の景色
  | "mountain" | "sea" | "forest" | "bridge" | "castle" | "church" | "museum"
  | "station" | "hotel" | "market" | "hotspring" | "bench" | "windmill" | "lighthouse"
  // 旅
  | "backpack" | "sleepingbag" | "compass" | "map" | "passport" | "ticket"
  | "thumb" | "road" | "signpost" | "camper" | "train" | "bus" | "ferry"
  | "plane" | "bike" | "walk" | "suitcase" | "pin" | "tram" | "taxi" | "boat" | "fuel"
  // 料理
  | "pot" | "pan" | "knife" | "cuttingboard" | "chopsticks" | "cup" | "stove"
  | "plate" | "bowl" | "basket" | "veg" | "meat" | "fish" | "bread" | "egg"
  | "spice" | "oil" | "eat" | "coffee" | "rice" | "noodle" | "soup" | "fruit"
  | "cheese" | "drink" | "timer"
  // 配信
  | "camera" | "mic" | "headphone" | "comment" | "tip" | "subscribe" | "clock"
  | "calendar" | "live" | "book" | "wifi" | "screen" | "photo" | "link" | "chart"
  | "people"
  // 気持ち
  | "heart" | "star" | "clap" | "idea" | "question" | "alert" | "crown"
  | "medal" | "trophy" | "talk" | "bell" | "gift" | "coin" | "smile" | "sad"
  | "sparkle" | "music" | "hourglass" | "ribbon"
  // 天気と火
  | "sun" | "moon" | "cloud" | "rain" | "snow" | "flame" | "light" | "tree"
  | "wind" | "rainbow" | "aurora" | "thermometer" | "night"
  // そのほか
  | "shirt" | "sauna" | "brick" | "see" | "do" | "buy" | "flag";

export const GLYPHS = {
  ...nav,
  ...brand,
  ...place,
  ...scene,
  ...travel,
  ...food,
  ...stream,
  ...feel,
  ...nature,
  ...misc,
} as Record<IconName, Draw>;

/**
 * 単色で描く印。
 *
 * 文章の行に混ざるものと、CSS で `color` を変えている場所（`.rleg-h .ic` など）は
 * 色を持たせない。色付きの絵にすると、その CSS が効かなくなって崩れる。
 */
export const FLAT = new Set<string>([...Object.keys(nav), ...Object.keys(brand)]);

/** `/design` の並び。書いた順に見本ページへ出る。 */
export const GROUPS: { title: string; note: string; names: string[] }[] = [
  {
    title: "操作",
    note: "行の中に置く印。ここだけ単色（currentColor）で、CSS 側の色に従う。",
    names: Object.keys(nav),
  },
  {
    title: "ブランド",
    note: "本物の形を写したもの。角を丸めたり色を足したりしない。",
    names: Object.keys(brand),
  },
  {
    title: "島の場所",
    note: "入口ごとに別の絵。同じ絵を2か所で使い回さない。",
    names: Object.keys(place),
  },
  {
    title: "旅先の景色",
    note: "国のページで「何がある場所か」を1つの絵で言うためのもの。屋根の形だけで種類を分ける。",
    names: Object.keys(scene),
  },
  { title: "旅", note: "道具と乗り物。", names: Object.keys(travel) },
  { title: "料理", note: "クッキング配信の道具と材料。", names: Object.keys(food) },
  { title: "配信", note: "配信まわりの道具。", names: Object.keys(stream) },
  { title: "気持ち", note: "反応の印。絵文字の代わりに使う。", names: Object.keys(feel) },
  { title: "天気と火", note: "時間帯と、あかり。", names: Object.keys(nature) },
  { title: "そのほか", note: "旅のしおりの「見る・する・買う」など。", names: Object.keys(misc) },
];
