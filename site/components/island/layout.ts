/**
 * 島のワールド定義。
 * 絵・当たり判定・カメラ・歩行が全部この座標系(WORLD x WORLD)を共有する。
 */

import { say } from "@/content/nights";

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

export type SpotId =
  | "streams"
  | "map"
  | "kitchen"
  | "apps"
  | "legends"
  | "now"
  | "next"
  | "board"
  | "friends"
  | "fellows"
  | "goods";

/**
 * 島に建っている物。
 *
 * **建っているものは全部押せる**（`docs/island-design.md` 6章）。
 * 建物の形をしていて押せないものを置くと、人は押して、何も起きなくて
 * 「壊れている」と思う。景色が要るなら木・岩・花・柵を置く。
 *
 * 押せることと、案内することは別。看板（島の「！」の札と下のバー）に
 * 出すのは `sign` の付いた6つだけ。残りは静かに建っていて、
 * 近づいた人にだけ名前が出る。
 */
export type Place = {
  id: SpotId;
  /** 建物の足元 */
  x: number;
  y: number;
  /** 建物の名前 */
  label: string;
  /** スプライト名。バーの小さな絵にも同じものを使う。 */
  icon: string;
  /** 絵の高さ(ワールド単位)。押せる範囲もこの大きさから作るので、絵と一致させる。 */
  size: number;
  /** 押すと行く先 */
  href: string;
  /** 名札に添える、そこで分かることの一言 */
  blurb: string;
  /** 看板を出す6つ。島の「！」の札と、下のバーに出るのはこれだけ。 */
  sign?: true;
  /** 出発までの日数を出す入口。いちばん気にされるところなので目立たせる。 */
  countdown?: true;
  /**
   * その軒の中だが、**道の名前が軒とそろっていない面**の頭。
   *
   * 砂浜の「いま居る場所」は、いま開いている道から決める（`spotOfPath`）。
   * `/kitchen/…` `/map/…` のように軒の道の下に居る面は、それだけで決まる。
   * 決まらないのは「中身としてはその軒のものなのに、別の道に立っている面」——
   * 北欧ヒッチハイクと北マケドニアは企画だが `/nordic` `/north-macedonia` に
   * 立っている。**そこだけここに書く。**
   *
   * **長いほうが勝つ。** `/next/new` は `/next` の下にあるが、中身は
   * 掲示板へ送るだけの1枚なので、掲示板の側に書いてそちらが取る。
   */
  under?: string[];
};

/**
 * 島に建っている物、ぜんぶ。
 * 座標はここが唯一の出どころ。飾りの配置も明かりも絵も、これを見て置く。
 *
 * 並びは足元の y の順（奥から手前）。名札が重なるときに、
 * 手前のものが上に来るようにするため。
 */
export const PLACES: Place[] = [
  {
    id: "legends",
    x: 736,
    y: 462,
    label: "伝説の企画",
    icon: "hall-museum",
    size: 74,
    href: "/legends",
    blurb: "イラン380km、年越し24時間",
  },
  {
    id: "next",
    x: 296,
    y: 548,
    /* **時制を名乗らない。** 「これから」にしていたので、これから分が
       0件になった日から半月、空の部屋へ案内し続けていた（あやと 2026-10-01
       「ルーティングが下手すぎ」／`docs/island-standards.md` 16章）。
       0件になりうる時制は、入口の札に入れない。時制は中身の側が言う。 */
    label: "企画",
    icon: "tent",
    size: 66,
    href: "/next",
    /* 添え書きにも時制を入れない。看板の字は丸ごと `<a>` の中に入るので、
       ここに「これから」と書くと札を直した意味が無くなる（見張りが拾う） */
    blurb: "日にちの決まった企画と、その記録",
    sign: true,
    countdown: true,
    /* 企画そのものの面。道の名前は企画ごとに違うので、ここで引き受ける。
       増やすのは「企画1つにつき面を1枚作った」ときだけ。 */
    under: ["/nordic", "/north-macedonia"],
  },
  {
    id: "now",
    x: 452,
    y: 556,
    label: "いまどこ",
    // 郵便受けは「知らせが届く」の絵で、「いま居る場所」を指していなかった。
    // 地球にピンが1本立っていれば、名前と絵が同じことを言う
    icon: "globe-stand",
    size: 48,
    href: "/now",
    /* **添え書きに「今週」を入れない。** 中身は旅先から打たれる欄で、
       何日も打ち直せない日がある。島の看板は焼いた字なので、札が
       「今週」と言い、中身が2週間前、という形が必ずいつか起きる
       （`docs/island-standards.md` 16章 / `docs/island-misses.md` #228）。
       「いまどこ」は、いつ読んでも「いま」があるのでよい。 */
    blurb: "いまいる国と、あやとの島だより",
  },
  {
    id: "friends",
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
    /* 月ごとのふりかえり（`/months`）。道の名前が軒とそろっていないが、
       降りてくるのは `/streams/monthly` からで、パンくずも配信から生えている。
       砂浜だけ別のことを言うと、同じ面の上と下で食い違う（`/next/new` と同じ形）。 */
    under: ["/months"],
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
    id: "fellows",
    x: 770,
    y: 800,
    label: "住んでる人",
    icon: "tent-small",
    size: 56,
    href: "/friends",
    blurb: "毎晩集まる人と、そのキャラクター",
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
    href: "/map",
    // **終点の街を書かない。** 旅は毎日進むので、書いた翌日から嘘になる。
    // 出発した日は動かないので、そこだけ言う（`app/map/page.tsx` の同じ注）。
    blurb: "日本を出てから、歩いた国ぜんぶ",
    sign: true,
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
    /* `/next/new` は企画の道の下にあるが、中身は掲示板へ送るだけの1枚で、
       パンくずも掲示板から生えている（`app/next/new/page.tsx`）。
       砂浜だけ「企画」と言うと、同じ面の上と下で違うことを言う。 */
    under: ["/next/new"],
  },
];

export type Spot = Place;

/**
 * 押せる建物ぜんぶ。島の当たり判定と名札は、これを見て作る。
 *
 * `SPOTS`（看板を出す6つ）と分けてあるのは、島の外のページの
 * ヘッダーが「行き先6つ」を並べるところで使っているから。
 * ヘッダーに10個並べると、そちらが行き先を選べない列になる。
 */
export const DOORS: Spot[] = PLACES;

/**
 * 看板を出す6つ。
 *
 * 島の「！」の札、下のバー、島の外のページのヘッダーに出るのはこれだけ。
 * 増やしたくなったら、どれかの中に入れる。ここは6つのまま。
 */
export const SPOTS: Spot[] = PLACES.filter((p) => p.sign);

export const placeById = (id: SpotId) => PLACES.find((p) => p.id === id)!;

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
 * その軒の道と同じか、その下に居れば、その軒。**いちばん長く一致した軒が勝つ**
 * （`/next/new` は `/next` と `/next/new` の両方に当たるので、後者）。
 * 道の名前が軒とそろっていない面は `Place.under` が引き受ける。
 *
 * @param path いま開いている道（`usePathname()` の値）
 */
export function spotOfPath(path: string | null | undefined): SpotId | undefined {
  const here = tidyPath(path);
  let best: SpotId | undefined;
  let bestLen = 0;
  for (const p of PLACES) {
    for (const root of [p.href, ...(p.under ?? [])]) {
      if (here !== root && !here.startsWith(`${root}/`)) continue;
      if (root.length <= bestLen) continue;
      best = p.id;
      bestLen = root.length;
    }
  }
  return best;
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
