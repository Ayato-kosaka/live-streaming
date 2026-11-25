/**
 * 島のワールド定義。
 * 絵・当たり判定・カメラ・歩行が全部この座標系(WORLD x WORLD)を共有する。
 */

import { say } from "@/content/nights";
import { courseOf } from "@/content/projects";
/* 入口の名前と、道の型ごとの入口。種類の表（`content/kinds.ts`）は何も読まない軽い1枚なので、ここから読んでよい */
import { KINDS, kindOf, routeOf } from "@/content/kinds";

export const WORLD = 1200;

/** 島(砂浜)の中心と輪郭 */
export const ISLAND = {
  cx: 600,
  cy: 640,
  squash: 0.9,
  /** 16方位の半径。上(北)から時計回り。 */
  radii: [352, 372, 404, 432, 442, 428, 400, 388, 406, 434, 448, 428, 396, 368, 350, 344],
};

/** 草地は砂浜より内側 */
export const GRASS_INSET = 34;
/** 高台(2段目)。島の縁に寄せすぎると画面外に出るので、内側に置く。 */
export const PLATEAU = {
  cx: 726,
  cy: 486,
  squash: 0.78,
  radii: [128, 138, 148, 152, 144, 132, 122, 118, 124, 136, 148, 150, 140, 130, 122, 120],
  /** 崖の高さ(見た目の落差) */
  drop: 34,
};

/**
 * 軒の鍵。**行き先の道と同じ言葉にそろえる**（`about` は `/about`、`friends` は `/friends`）。
 * 前は `friends` が `/about`（あやとのこと）、`fellows` が `/friends`（住んでる人）を指していて、
 * 鍵を読んだ人が逆の軒を思い浮かべた（#1279）。`map` だけは前の道（`/map`。いまは `/travel` へ 301）の名残。
 */
export type SpotId =
  | "about"
  | "streams"
  | "legends"
  | "map"
  | "apps"
  | "kitchen"
  | "friends"
  | "goods"
  | "board";

/** 入口の名前。**種類の表（`content/kinds.ts`）の「入口」欄に在る字だけ**が書ける（`表紙`・`建物の外`・`—` は入口ではない） */
export type Entrance = Exclude<(typeof KINDS)[number]["entrance"], "表紙" | "建物の外" | "—">;

/**
 * 島に建っている物。
 *
 * **建っているものは全部押せる**（`docs/island-design.md` 6章）。
 * 建物の形をしていて押せないものを置くと、人は押して、何も起きなくて
 * 「壊れている」と思う。景色が要るなら木・岩・花・柵を置く。
 *
 * 押せることと、案内することは別。看板（島の「！」の札と下のバー）に
 * 出すのは `sign` の付いたものだけ（6つまで）。残りは静かに建っていて、
 * 近づいた人にだけ名前が出る。
 */
export type Place = {
  id: SpotId;
  /** 建物の足元 */
  x: number;
  y: number;
  /** 建物の名前。**入口の名前そのもの**（種類の表の「入口」欄と同じ字。型で縛る） */
  label: Entrance;
  /** スプライト名。バーの小さな絵にも同じものを使う。 */
  icon: string;
  /** 絵の高さ(ワールド単位)。押せる範囲もこの大きさから作るので、絵と一致させる。 */
  size: number;
  /** 押すと行く先 */
  href: string;
  /** 名札に添える、そこで分かることの一言 */
  blurb: string;
  /** 看板を出す軒（6つまで）。島の「！」の札と、下のバーに出るのはこれだけ。 */
  sign?: true;
};

/**
 * 島に建っている物、ぜんぶ。
 * 座標はここが唯一の出どころ。飾りの配置も明かりも絵も、これを見て置く。
 *
 * **並びは入口の並び**（`docs/spec/routes.md` R-20。あやと 2026-11-18 の9つの順）。
 * 下のボタン・表紙の島・`/all` の棚・表紙の棚は、この並びのまま引く（R-22）。
 *
 * 前は足元の y の順（奥から手前）に並べていて、その並びがそのまま下のボタンの並びになっていた。
 * 名札を手前ほど上に重ねたい所（手で作った島）は、y の順に並べ直したほうを使う（下の `BY_DEPTH`）。
 */
export const PLACES: Place[] = [
  {
    id: "about",
    x: 886,
    y: 574,
    label: "あやとのこと",
    // たき火は「あやと本人」を指さない。人のことを知りたければ、その人の家へ行く。
    // 台所・工房と間違えないように、間口を1マス広げた家にしてある
    icon: "hut-ayato",
    size: 78,
    href: "/about",
    blurb: "どんな人で、なぜ旅してるか",
    sign: true,
  },
  {
    id: "streams",
    x: 520,
    y: 600,
    label: "配信",
    icon: "tower-studio",
    size: 128,
    href: "/streams",
    blurb: say("types"),
    sign: true,
  },
  {
    id: "legends",
    x: 736,
    y: 462,
    label: "伝説の企画",
    icon: "hall-museum",
    size: 74,
    href: "/legends",
    /* 距離は企画の表から（`content/projects.ts`。数の持ち主は企画。M-20） */
    blurb: `イラン${courseOf("iran-walk").km}km、年越し24時間`,
    /* 島を引いたときに名前の出る6つのうちの1つ（あやと 2026-11-18 の9つの3番目。#1279）。
       前は名前を出していなかったので、引きの島に「伝説の企画」の札が無かった */
    sign: true,
  },
  {
    id: "map",
    x: 262,
    y: 846,
    label: "歩いた国",
    // 桟橋は「船で出ていく」の絵で、中身（歩いた国）を指していなかった。
    // 国旗を何枚も掛けた道しるべにして、名前と絵を同じことにする
    icon: "signpost-flags",
    size: 64,
    /* 旅のガイドの区画（#1201）。道の字は `content/travelPath.ts` の `TRAVEL` と同じ
       （食い違うと `content/travel.ts` が書き出しを止める）。前の道 `/map` は 301 でここへ */
    href: "/travel",
    // **終点の街を書かない。** 旅は毎日進むので、書いた翌日から嘘になる。
    // 出発した日は動かないので、そこだけ言う（`app/travel/page.tsx` の同じ注）。
    blurb: "日本を出てから、歩いた国ぜんぶ",
    sign: true,
  },
  {
    id: "apps",
    x: 812,
    y: 700,
    label: "アプリ",
    icon: "hut-workshop",
    size: 78,
    href: "/apps",
    blurb: "旅先で作ってるグルメアプリ",
    sign: true,
  },
  {
    id: "kitchen",
    x: 330,
    y: 706,
    label: "作った料理",
    icon: "hut-kitchen",
    size: 78,
    href: "/kitchen",
    blurb: "その土地のものを、買い出しから",
  },
  {
    id: "friends",
    x: 770,
    y: 800,
    label: "住んでる人",
    icon: "tent-small",
    size: 56,
    href: "/friends",
    blurb: "毎晩集まる人と、そのキャラクター",
  },
  {
    id: "goods",
    /* 手で作った島での置き場所。**道ばたの1軒**にしてある——屋台は
       人の通るところに出すもので、奥に引っ込めると店に見えない。
       配信（やぐら）と アプリ（工房）を結ぶ道の北がわで、建物からも道からも
       離れている空きがここだけだった（建物まで 169、道の芯まで 52）。 */
    x: 688,
    y: 612,
    /* **持って帰れるものの入口は、島にここ1つだけ。**
       あやと（2026-10-09、#701）:「グッズの動線ってありますか？？？見当たらなかった」。
       トップの紙には1本あったが、**島には1つも無かった**。島を歩いて建物に
       入る人から見れば、島に無い＝道が無い。

       `/cards` は `/goods` の中から行けるので、ここには建てない。
       持って帰れるものの入口が2か所あると、どちらが本体か分からなくなる。

       名前は行き先の h1・パンくずと同じ字にする（`docs/island-design.md` 6章）。
       「グッズ」と短くすると、同じ `/goods` を指す札が島とトップで2種類に
       なって、人は別の部屋だと思う（`tools/sprites/navtruth.mjs`）。 */
    label: "あやとグッズ",
    /* 屋根のある屋台。**台や荷車では「物を配っている所」に見えない**
       （`stall` `stall-bench` `stall-stool` `cart` は、どれも板と脚だけ）。
       緑の日よけが付いている1枚だけが、遠目でも店に見える。
       絵と名前は同じことを言う（`docs/island-design.md` 6章） */
    icon: "stall-green",
    size: 66,
    href: "/goods",
    /* **数も時制も書かない。** 「3つは無料」「2つは検討中」は、品が1つ
       増えた日から嘘になる。書くのは、いつ読んでも本当のことだけ——
       落とせることと、書けること。 */
    blurb: "ステッカーを落とす。ほしい形も書ける",
  },
  {
    id: "board",
    x: 610,
    y: 872,
    /* **看板・ナビ・パンくず・面の題を、全部この字にそろえる**（`app/board/page.tsx`）。
       「企画をだす」だと、面の名前と中の札1枚（企画）が同じ字になって、
       付箋がその枝に見えていた。板が受けるのは注文で、企画はそこから育つもの。 */
    label: "やってほしいこと",
    icon: "signboard",
    size: 62,
    href: "/board",
    blurb: "誰でも出せる。通ったらやる",
    sign: true,
  },
];

export type Spot = Place;

/**
 * 押せる建物ぜんぶ。島の当たり判定と名札は、これを見て作る。
 *
 * `SPOTS`（看板を出す軒）と分けてあるのは、島の外のページの
 * ヘッダーが「行き先」を並べるところで使っているから。
 * ヘッダーに10個並べると、そちらが行き先を選べない列になる。
 */
export const DOORS: Spot[] = PLACES;

/**
 * 看板を出す軒。**6つまで。** 企画の軒は畳んだ（#1277。企画の面 `/next` を `/board` へ寄せた）。
 *
 * 島の「！」の札、下のバー、島の外のページのヘッダーに出るのはこれだけ。
 * 増やしたくなったら、どれかの中に入れる。6つを超えない。
 */
export const SPOTS: Spot[] = PLACES.filter((p) => p.sign);

/**
 * 同じ軒ぜんぶを、足元の y の順（奥から手前）に。**名札を重ねる順だけに使う**（手で作った島の札）。
 * 下のボタンや棚の並びには使わない——あちらは入口の並び（`PLACES` のまま）。
 */
export const BY_DEPTH: Spot[] = [...PLACES].sort((a, b) => a.y - b.y);

export const placeById = (id: SpotId) => PLACES.find((p) => p.id === id)!;

/* **入口の表と種類の表を、読み込んだときに突き合わせる**（R-20・R-23）。
   種類の表の「入口」欄に在る字ぜんぶに軒が1つずつ建っていて、軒の名前はどれも入口の字。
   型は軒の名前を入口の字に縛るが、「入口の字なのに軒が無い」は型では止まらないので、ここで止める */
{
  const want = new Set<string>(KINDS.map((k) => k.entrance as string).filter((e) => e !== "表紙" && e !== "建物の外" && e !== "—"));
  const have = new Set<string>(PLACES.map((p) => p.label));
  const lost = [...want].filter((e) => !have.has(e));
  if (lost.length || have.size !== PLACES.length || want.size !== have.size) {
    throw new Error(`components/island/layout.ts: 入口の表（PLACES）と種類の表（content/kinds.ts）の入口が合わない（軒の無い入口: ${lost.join(", ") || "なし"}）`);
  }
}

/**
 * 道を、島のかたちにそろえる。
 *
 * **`.html` と終わりのスラッシュを落とす。** 本番は `/nordic` で配るが
 * （`firebase.json` の `trailingSlash: false`）、書き出したものを手元で
 * そのまま配ると `/nordic.html` になる。落とさずに比べると、
 * **手元でだけ印が消えて「直っていない」と読む**（`TripDoor` が同じ所で
 * 1度つまずいている）。
 */
export const tidyPath = (path: string | null | undefined) =>
  (path ?? "").replace(/\.html$/, "").replace(/\/+$/, "") || "/";

/**
 * **いま開いている道が、島のどの軒か。** 軒の外なら `undefined`。
 *
 * ## なぜ、面に名乗らせないのか
 *
 * 砂浜（`components/ui/PlaceList.tsx`）は島の面ぜんぶの終わりに出て、
 * 軒を全部ならべる（数は `PLACES` が持っている。**ここに書き写さない**）。
 * **いま居る軒に印が付かないと、板はどの面でも同じ絵**で、自分がどこに
 * 立っているか読めない。そのうえ、いま居る軒の板は
 * 押しても同じ紙が出てくる——厚みが「どこかへ行ける」と嘘をつく
 * （`docs/island-design.md` 3-3）。
 *
 * 印そのものは前からあった（`.ifoot-door.is-here`）。**渡す側が無かった。**
 * 2026-10-09 に数えたら**軒の半分以上**が渡しておらず、面を1枚ずつ直しても
 * **次に面を建てた人がまた忘れる**（島に建てるのは `PLACES` の1か所で済むのに、
 * 印は面の側が渡すものだったから）。だから**砂浜が自分で引く。**
 * 渡す口を消したので、渡し忘れようがない。
 *
 * ## 決めかた
 *
 * **種類の表（`content/kinds.ts`）の、その道の型の「入口」**（R-23）。パンくずの2段目
 * （`lib/pages.ts` の `crumbsOf`）と同じ表から引くので、砂浜の印とパンくずが別のことを言わない。
 * 前は「軒の道の下に居るか」で決めていて、道の名前が軒とそろっていない面（`/months`）を
 * 軒ごとに書き足していた（`under`）。書き足していない `/island/**` `/cards` `/updates` は、どの軒でもなかった。
 *
 * @param path いま開いている道（`usePathname()` の値）
 */
export function spotOfPath(path: string | null | undefined): SpotId | undefined {
  const route = routeOf(tidyPath(path));
  if (!route) return undefined;
  const entrance: string = kindOf(route).entrance;
  return PLACES.find((p) => p.label === entrance)?.id;
}

/**
 * パンくずの1段。**札を手で書き写さない。**
 *
 * 「これから」は、`/nordic` とその下の4面のパンくずに**手書きで5つ**
 * 複製されていた。島の札を「企画」に直しても、そこだけ古い字が残る——
 * 実際に残って、見張り（`navtruth.mjs`）が拾った（2026-10-01）。
 *
 * **名簿・一覧を手で作らない**（`docs/island-standards.md` 8章）の、
 * 導線版。ここを通せば、札を1か所直せば島じゅうのパンくずが揃う。
 */
export const crumbOf = (id: SpotId) => {
  const p = placeById(id);
  return { label: p.label, href: p.href };
};

/** あやとの立ち位置(初期) */
export const AYATO_HOME = { x: 646, y: 790 };
