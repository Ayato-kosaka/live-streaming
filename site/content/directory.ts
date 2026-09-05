import { DOORS } from "@/components/island/layout";
import { PAST_CHAPTERS } from "@/components/chain/route";
import { ALL_APPS } from "@/content/apps";
import { COUNTRIES } from "@/content/countries";
import { LEGENDS } from "@/content/legends";
import { DAY_PAGES, NORDIC_COUNTRIES, cityName, dayHref, dayName } from "@/content/nordic";
import { RECIPES, kindLabel } from "@/content/recipes";
import { STREAM_TYPES } from "@/content/streamTypes";

/**
 * 島にある紙、ぜんぶ。
 *
 * ## なぜ要るか
 *
 * 島の外の面は94ある。上の帯に出るのは6つ、パンくずは「島 › ○○」の2段だけで、
 * 残りは**どこかの面の中まで入らないと名前も見えない**。
 * 「あの話どこだっけ」から始めると、当てずっぽうで面を1枚ずつ開くことになる。
 *
 * ここは行き先を1か所に集めた表で、`/all` がこれを並べる。
 * **帯を増やして解こうとしない。** 帯は6つのままにする決まりがあり
 * （`site/components/island/layout.ts` の `DOORS`）、そこへ94を並べたら
 * 帯そのものが読めなくなる。器を別に立てて、帯からはその器へ1つ足す。
 *
 * ## 手で書かない
 *
 * 行き先は全部、元のデータ（`content/*.ts`）から作る。
 * ここに直接パスを書き並べると、料理が1品増えたときに黙って落ちる。
 * 手で書いてよいのは、データを持たない単発の面（`/design` など）だけ。
 */

export type Dest = {
  href: string;
  /** 行き先の名前。面の h1 と揃える。 */
  name: string;
  /** 押す前に中身が分かる1行。 */
  note: string;
  /** 字で絞るときに見る文字。名前・添え書きのほか、slug や英語名も混ぜる。 */
  q: string;
};

export type Shelf = {
  id: string;
  /** 棚の名前。 */
  title: string;
  /** その棚が何の集まりか。 */
  note: string;
  items: Dest[];
};

const q = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(" ").toLowerCase();

/** 日付を「2025年2月」まで。棚に並べたときの手がかりにする。 */
const ym = (d: string) => (d ? `${Number(d.slice(5, 7))}月` : "");
const y = (d: string) => (d ? `${d.slice(0, 4)}年` : "");

const countryName = Object.fromEntries(COUNTRIES.map((c) => [c.slug, c.name]));

export const SHELVES: Shelf[] = [
  {
    id: "island",
    title: "島のなか",
    note: "島に建っている10軒と、島そのもの",
    items: [
      { href: "/", name: "島", note: "ここ。10軒とも押せば入れる", q: q("島 top home ayato") },
      ...DOORS.map((d) => ({
        href: d.href,
        name: d.label,
        note: d.blurb,
        q: q(d.label, d.blurb, d.id, d.href),
      })),
    ],
  },
  {
    id: "streams",
    title: "配信の型",
    note: "毎晩22時。5つのうちどれかをやっている",
    items: STREAM_TYPES.map((t) => ({
      href: `/streams/${t.slug}`,
      name: t.name,
      note: t.short,
      q: q(t.name, t.short, t.lead, t.slug),
    })),
  },
  {
    id: "kitchen",
    title: "作った料理",
    note: `買い出しから作った${RECIPES.length}品`,
    items: RECIPES.map((r) => ({
      href: `/kitchen/${r.slug}`,
      name: r.name,
      note: `${countryName[r.country] ?? ""}・${kindLabel(r.kind)}／${y(r.date)}${ym(r.date)}`,
      q: q(r.name, r.note, r.slug, countryName[r.country], kindLabel(r.kind)),
    })),
  },
  {
    id: "map",
    title: "歩いた国",
    note: `パリからトビリシまで、${COUNTRIES.length}カ国`,
    items: [...COUNTRIES]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        href: `/map/${c.slug}`,
        name: c.name,
        note: c.summary,
        q: q(c.name, c.en, c.slug, c.region, c.stays.flatMap((s) => s.cities).join(" ")),
      })),
  },
  {
    id: "legends",
    title: "伝説の企画",
    note: "いまでも話に出てくる回",
    items: LEGENDS.map((l) => ({
      href: `/legends/${l.slug}`,
      name: l.title,
      note: l.lead,
      q: q(l.title, l.lead, l.slug),
    })),
  },
  {
    id: "apps",
    title: "アプリ",
    note: "配信で作って、配信で直しているもの",
    /* **`APPS` ではなく `ALL_APPS`。** 工房（`/apps`）に並べているのは
       配信のある2本だけだが、Spelieve の紙も書き出されている。
       ここに載せないと、その1枚だけ2回では着かない（工房を通って3回になる）。
       ここは「島にある紙、ぜんぶ」なので、建っていないものも入れる。 */
    items: ALL_APPS.map((a) => ({
      href: `/apps/${a.slug}`,
      name: a.name,
      note: a.tagline,
      q: q(a.name, a.tagline, a.slug),
    })),
  },
  {
    id: "nordic",
    title: "北欧へ",
    note: "次の旅。ポーランドからスウェーデンまでヒッチハイク",
    items: [
      {
        href: "/nordic",
        name: "北欧ヒッチハイク",
        note: "会いに行く理由と、通る道ぜんぶ",
        q: q("北欧ヒッチハイク nordic 旅 スウェーデン"),
      },
      /* 1日ぶんのページ。**ここに載せないと、旅程表を通らないと着けない。**
         どこからでも2タップの決まりは、面を足すたびにここへ1行足して守る。 */
      ...DAY_PAGES.map((d) => ({
        href: dayHref(d),
        name: `北欧 ${dayName(d)}`,
        note: d.lead ?? "",
        q: q(
          "北欧",
          dayName(d),
          d.lead,
          (d.legs ?? []).flatMap((l) => [cityName(l.from), cityName(l.to)]).join(" "),
        ),
      })),
      {
        href: "/nordic/guide",
        name: "旅のしおり",
        note: "お金・通信・服・サウナ・食べもの",
        q: q("旅のしおり guide 持ち物 サウナ お金"),
      },
      {
        href: "/nordic/photos",
        name: "旅の写真",
        note: "その日に撮った写真。持って帰れる",
        q: q("旅の写真 photos 写真 スタンプ"),
      },
      ...NORDIC_COUNTRIES.map((c) => ({
        href: `/nordic/${c.slug}`,
        name: c.name,
        note: c.catch,
        q: q(c.name, c.en, c.slug, c.catch, c.cities.join(" ")),
      })),
    ],
  },
  {
    id: "atlas",
    title: "島の連なり",
    note: "旅の章ごとに島が1つ建っている",
    items: [
      { href: "/atlas", name: "島の地図", note: "章ごとの島が、日付順に並ぶ", q: q("島の地図 atlas 連なり 章") },
      ...PAST_CHAPTERS.flatMap((c) => [
        {
          href: `/island/${c.slug}`,
          name: c.name,
          note: `${c.from.slice(0, 4)}年から。この章のあいだの島`,
          q: q(c.name, c.slug, "過去の島"),
        },
        {
          href: `/island/${c.slug}/streams`,
          name: `${c.name}の配信`,
          note: "この章のあいだにやった配信だけ",
          q: q(c.name, c.slug, "配信 アーカイブ"),
        },
      ]),
    ],
  },
  {
    id: "misc",
    title: "そのほか",
    note: "書くところと、部品の見本",
    items: [
      {
        href: "/next/new",
        name: "企画のページを作る",
        note: "通った企画を、自分でページにする",
        q: q("企画のページを作る 下書き draft new"),
      },
      {
        href: "/design",
        name: "デザインの見本",
        note: "島で使う印と部品の棚",
        q: q("デザインの見本 design 部品 アイコン"),
      },
    ],
  },
];

/** 行き先の数。`/all` の見出しに出す。 */
export const DEST_COUNT = SHELVES.reduce((n, s) => n + s.items.length, 0);
