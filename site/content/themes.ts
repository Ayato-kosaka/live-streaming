/**
 * 付箋の宛先（テーマ）の表。
 *
 * ## なぜ表が要るのか
 *
 * 本番のデータを見ると、`islandNotes` は0件で、`islandIdeas` の8件のうち
 * 7件が「新しい企画の提案」ではなく、すでに決まっている北欧旅への注文だった。
 * 入力欄に宛先が無かったので、人が `【ポーランド】` を自分で発明していて、
 * こちらはその `【】` を正規表現で読んで棚に仕分けていた。**回避策の上に建っていた。**
 *
 * 宛先を正式な欄（`islandNotes.theme`）にして、その欄に入れてよい値を
 * ここで決める。運営者（Claude Code）が書いて、個別ページが埋め込む。
 * 掲示板の付箋一覧は、この表を読んでテーマの札を並べる。
 *
 * ## なぜ Git に置くのか
 *
 * テーマの表示名は**こちらが書く字**なので、レビューを通ってから出るほうがよい。
 * サーバー（`functions/src/islandApi.ts`）は `theme` の形しか見ていない。
 * 表と突き合わせないのは、表に1行足すたびに Functions のデプロイが要ると、
 * 画面だけ先に出た日の付箋がまるごと 400 で消えるため。
 *
 * ## どこまで細かく作るか
 *
 * あやとの指示（2026-09-06）:
 *
 * > まず国と企画どまりで始めて、付箋が集まった日だけ日のテーマを足す
 *
 * だから「2日目」のような日のテーマは、いまは作らない。
 * 区間も、実際に付箋が付いているものだけ置く。
 */

import { BUILT_AT, planById, planPhase } from "./plans";

/** 付箋の宛先ひとつ。 */
export type Theme = {
  /**
   * 宛先の id。`islandNotes.theme` にそのまま入る。
   * **変えない。** 変えると、それまでに貼られた付箋が行方不明になる。
   * 形は `[a-z][a-z0-9-]{1,39}`（サーバー側の `THEME_ID` と同じ）。
   */
  id: string;
  /** 札に出る名前。島の画面に id は出さない */
  name: string;
  /**
   * 札を束ねる見出し。同じ字のものが1行にまとまる。
   *
   * **`PLAN_GROUP` を書いたものだけは、ここで決まりきらない。**
   * 企画は日が来れば終わるので、画面が出てから日付で
   * 「これから」と「行ってきた」に分け直す（`shelves`）。
   */
  group: string;
  /**
   * この宛先の話をしている面。押すとそこへ行ける。
   * 掲示板は島じゅうの付箋が集まる場所なので、
   * 「もっと読むならここ」ではなく「その話をしているのはここ」を指す。
   */
  href?: string;
  /** 書く欄の上に出す一行。**何を書けばいいか**だけを言う */
  lead: string;
  /** 書く欄の見本。実際に書けそうなものにする */
  placeholder: string;
};

/** 旅の宛先を束ねる見出し。島の面（`components/isle/spec.ts`）もこの字で引く。 */
export const NORDIC_GROUP = "北欧の旅";

/**
 * 企画あての札を束ねる見出し。**日で行き先が変わるのは、この2つだけ。**
 *
 * ここに置いた宛先は `content/plans.ts` の企画と id が同じなので、
 * その企画が終わったかどうかを日付で聞ける。聞かずに字で持っていたころ、
 * 9月6日に終わったフード＆ワイン祭りが、9月9日になっても
 * 「これからの企画」に並んでいた（あやとが見つけた）。
 */
export const PLAN_GROUP = "これからの企画";
export const PLAN_DONE_GROUP = "行ってきた企画";

/**
 * 宛先の一覧。**並びはここで決まる。**
 *
 * 枚数の多い順にはしない（`docs/island-play.md` の「順位表を作らない」）。
 * 中身が増えても札の並びが動かないので、「いつもの3つ目」で覚えたところに、
 * 次も同じものがある。
 */
export const THEMES: Theme[] = [
  {
    id: "nordic",
    name: "北欧旅ぜんぶ",
    group: NORDIC_GROUP,
    href: "/nordic",
    lead: "旅ぜんぶに言いたいこと。国が決まっていなくていい。",
    placeholder: "例）現地のお祭りに参加してほしい。地元の人しか来ないやつ",
  },
  {
    id: "poland",
    name: "ポーランド",
    group: NORDIC_GROUP,
    href: "/nordic/poland",
    lead: "ポーランドで見てきてほしいもの、行ってほしい場所。",
    placeholder: "例）ヴァヴェル城と、火を吹く龍の像が見たい",
  },
  {
    id: "lithuania",
    name: "リトアニア",
    group: NORDIC_GROUP,
    href: "/nordic/lithuania",
    lead: "リトアニアで見てきてほしいもの、行ってほしい場所。",
    placeholder: "例）赤煉瓦の城と、十字架の丘が見たいです",
  },
  {
    id: "latvia",
    name: "ラトビア",
    group: NORDIC_GROUP,
    href: "/nordic/latvia",
    lead: "ラトビアで見てきてほしいもの、行ってほしい場所。",
    placeholder: "例）リガの中央市場で、地元の人が買うものを見たい",
  },
  {
    id: "estonia",
    name: "エストニア",
    group: NORDIC_GROUP,
    href: "/nordic/estonia",
    lead: "エストニアで見てきてほしいもの、行ってほしい場所。",
    placeholder: "例）タリンの旧市街を、朝いちばんに歩いてほしい",
  },
  {
    id: "finland",
    name: "フィンランド",
    group: NORDIC_GROUP,
    href: "/nordic/finland",
    lead: "フィンランドで見てきてほしいもの、行ってほしい場所。",
    placeholder: "例）ヘルシンキの市場で、朝ごはんを食べてほしい",
  },
  {
    id: "sweden",
    name: "スウェーデン",
    group: NORDIC_GROUP,
    href: "/nordic/sweden",
    lead: "スウェーデンで見てきてほしいもの、行ってほしい場所。",
    placeholder: "例）ストックホルムの島を、歩いて渡ってほしい",
  },
  {
    /* 区間の宛先。**付箋が付いているものだけ置く。**
       10区間ぶん先に並べると、札が10枚増えて、そのうち9枚が空になる。
       付いたら1行足す（`【区間:kutaisi-katowice】` に1件来ている）。 */
    id: "leg-kutaisi-katowice",
    name: "クタイシ → カトヴィツェ",
    group: NORDIC_GROUP,
    href: "/nordic/day/depart",
    lead: "唯一の飛行機の日。深夜1時5分に着いて、始発まで数時間あります。",
    placeholder: "例）空港のなかを探検してほしい",
  },
  /* ---- 企画（`content/plans.ts` の `PLANS`）----
     **企画の id を、そのままテーマの id にする。** 対応表を別に持つと、
     どちらかを直し忘れた日に、企画の面から貼った付箋が誰にも読めない棚に入る。
     `/next` の面は `themeById(plan.id)` で引くだけなので、ここに1行足せば
     その企画に付箋の欄が出る。**足さなければ欄そのものが出ない。**

     あやとの指示（2026-09-06）「まず国と企画どまりで始めて」のとおり、
     いま動いている企画は3つとも置く。区間（`leg-`）と違って、
     `/next` にその企画の面があり、そこに書く欄が出るので、空の棚にはならない。

     **終わった企画の行を消さないこと。** 消すと `/board` から棚が消えて、
     貼られた付箋がどこからも読めなくなる（消えてはいないが、届かない）。 */
  {
    id: "food-wine-fest",
    name: "フード＆ワイン祭り",
    group: PLAN_GROUP,
    href: "/next#food-wine-fest",
    lead: "ムタツミンダ公園のお祭りで、食べるもの・飲むもの。",
    placeholder: "例）クヴェヴリ仕込みの赤を、3種類ならべて飲み比べてほしい",
  },
  {
    id: "georgia-bye",
    name: "ジョージアバイバイ",
    group: PLAN_GROUP,
    href: "/next#georgia-bye",
    /* **思い出を集める欄。注文を集める欄ではない。** あやとの指示（2026-09-06）
       「ジョージア1年の方は、1年の思い出を書いて欲しい」。
       見本を「〜してほしい」にしていたころ、書かれるものが全部注文になった。
       **見本の文の形が、そのまま集まるものの形になる。** */
    lead: "ジョージアで過ごした1年の、思い出を書いてください。",
    placeholder: "例）バトゥミの夕日の回が忘れられない。あの海をずっと見ていた",
  },
  {
    id: "japan-2years",
    name: "海外出発二周年",
    group: PLAN_GROUP,
    href: "/next#japan-2years",
    /* あやとの指示（2026-09-06）「二周年の方は、付箋に 二周年に対する想い を
       書いて欲しい」。**節目に思うことを集める。** 3年目への注文は
       「まだ決まっていないこと」のほうで聞いているので、ここでは聞かない。 */
    lead: "日本を出て2年。この2年に思うことを書いてください。",
    placeholder: "例）3ヶ月で帰るはずが2年。よくここまで来たなと思う",
  },
  {
    /* どの旅にも紐づかない要望の置き場。**1つだけ作っておく。**
       「LINEグループを作ってほしい」がこれで、いまは北欧旅あての札が
       付いたまま貼られている（宛先が無かったので、いちばん近いものを選んだ）。 */
    id: "island",
    name: "あやと島へ",
    group: "そのほか",
    href: "/",
    lead: "旅の話じゃないこと。サイトへの要望も、配信への注文も、ここへ。",
    placeholder: "例）配信のあとに見返せる場所がほしい",
  },
];

/** id から1つ引く。知らない id は undefined。 */
export const themeById = (id: string): Theme | undefined =>
  THEMES.find((t) => t.id === id);

/** 札の一行ぶん。見出しと、そこに並ぶ宛先。 */
export type Shelf = { group: string; themes: Theme[] };

/**
 * 見出しの並び。**ここに書いた順に出る。**
 *
 * 「行ってきた企画」は、これからのものより下。終わったものが上に来ると、
 * 次に何があるのかを探すのに、済んだものを読み飛ばすことになる。
 */
const ORDER = [NORDIC_GROUP, PLAN_GROUP, PLAN_DONE_GROUP];

/**
 * 宛先の札を、見出しごとに束ねる。
 *
 * **`now` は画面が出てから渡す。** `output: "export"` なので、ここで
 * `new Date()` を呼ぶとビルドした日が焼き込まれる（`CLAUDE.md`）。
 * 渡すまでは**焼いた日**（`BUILT_AT`）で仕分ける。分からないからと
 * 「全部これから」にすると、**終わった企画がいつまでも棚に居座る。**
 * 焼いた日なら、古くなるのは焼いてから終わった企画だけで、
 * しかも画面が出た時点で本物の今日に直る。
 *
 * @param list 並べる宛先
 * @param now 画面が出てからの今。まだ分からないときは null
 */
export function shelves(list: Theme[], now: Date | null): Shelf[] {
  const out: Shelf[] = [];
  for (const t of list) {
    const g = groupOf(t, now);
    const shelf = out.find((s) => s.group === g);
    if (shelf) shelf.themes.push(t);
    else out.push({ group: g, themes: [t] });
  }
  /* 見出しの並びは `ORDER`。表に出てこない見出し（「そのほか」）は、
     `THEMES` に出てきた順のまま後ろへ回す。 */
  return out.sort((a, b) => rank(a.group) - rank(b.group));
}

const rank = (g: string) => {
  const i = ORDER.indexOf(g);
  return i < 0 ? ORDER.length : i;
};

/**
 * その宛先が、いまどの見出しの下にいるか。
 *
 * 企画あて（`PLAN_GROUP`）だけ、同じ id の企画に日付を聞く。
 * **`planPhase` に合わせる。** `/next` が「もう行ってきた」に置いたものが
 * 掲示板では「これから」に並ぶ、という食い違いを作らないため。
 */
function groupOf(t: Theme, now: Date | null): string {
  if (t.group !== PLAN_GROUP) return t.group;
  const p = planById(t.id);
  if (!p) return t.group;
  /* 画面が出る前は、**焼いた日**で仕分ける（`content/plans.ts` の `BUILT_AT`）。
     ここを「分からないから、これから」にしていたので、9月6日に終わった
     フード＆ワイン祭りが、9月10日に配られた HTML でも
     「これからの企画」の棚に並んでいた（あやと 2026-09-10）。 */
  return planPhase(p, now ?? BUILT_AT) === "after" ? PLAN_DONE_GROUP : PLAN_GROUP;
}
