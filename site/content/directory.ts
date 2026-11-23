import { PLACES } from "@/components/island/layout";
import { ISLE_CHAPTERS, chapterHref } from "@/components/chain/route";
import { ALL_APPS } from "@/content/apps";
import { COUNTRIES } from "@/content/countries";
import { kindOf, routeOf } from "@/content/kinds";
import { tripsOfCountry } from "@/content/stayChapters";
import { TRAVEL_ARTICLES, TRAVEL_CITIES, TRAVEL_PLACES } from "@/content/travel";
import { articleOf } from "@/content/travel/articles";
import { LEGENDS } from "@/content/legends";
import { MONTHS } from "@/content/months";
import { DAY_PAGES, NORDIC_GUIDE_HREF, cityName, dayHref } from "@/content/nordic";
import { RECIPES, kindLabel } from "@/content/recipes";
import { STREAM_TYPES } from "@/content/streamTypes";
import { listedPages, pageAt, type Page } from "@/lib/pages";

/**
 * 島にある紙、ぜんぶ。`/all` がこれを並べる。
 *
 * ## 棚は入口の9つ＋そのほか（`docs/spec/routes.md` R-22。#1279）
 *
 * **棚は入口の表（`components/island/layout.ts` の `PLACES`）から、並べる面は種類の表から引く。**
 * 面がどの棚に並ぶかは、その面の道の型の「入口」（`content/kinds.ts`）で決まる。
 * パンくずの2段目（`lib/pages.ts` の `crumbsOf`）と砂浜の印（`spotOfPath`）も同じ欄から引くので、
 * 「`/all` ではこの棚、パンくずでは別の親」が起きない。
 *
 * 前は13棚が5つの切り口（島のなか・配信の型・月ごと・国ごと・旅ごと…）で並んでいて、
 * 北欧6か国が「歩いた国」と「北欧の旅」の2つの棚に並んでいた。どこに何があるかを探すのに、
 * まず切り口を当てる必要があった。いまは1つの面は1つの棚にしか並ばない（下で止める）。
 *
 * ## ここが持つのは、人が書く字だけ
 *
 * 1行の説明（`note`）と探し言葉（`q`）。行き先と名前は面の一覧（`lib/pages.ts`）が持つ。
 * 字の出どころは中身の表（`content/*.ts`）で、ここで書くのは表の無い単発の面と、街の探し言葉だけ。
 */

export type Dest = {
  href: string;
  /** 行き先の名前。面の h1 と揃える（面の一覧の `name`）。 */
  name: string;
  /** 押す前に中身が分かる1行。 */
  note: string;
  /** 字で絞るときに見る文字。名前・添え書きのほか、slug や英語名も混ぜる。 */
  q: string;
};

export type Shelf = {
  id: string;
  /** 棚の名前。入口の名前そのもの（そのほか の棚だけ別） */
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

type Line = Pick<Dest, "note" | "q">;

/**
 * 表を持たない単発の面の1行。**数も時制も書かない**（`docs/island-standards.md` 16章）。
 * 入口の建物の面（`/about` `/streams` …）は、ここに無ければ建物の一言（`PLACES` の `blurb`）を使う。
 */
const SINGLE: Record<string, Line> = {
  "/": { note: "ここ。建っているものは、ぜんぶ押せば入れる", q: q("島 top home ayato") },
  "/months": {
    note: "ひと月ずつ、ならべて見る",
    q: q("月ごとのふりかえり months 月末 ふりかえり 振り返り 授賞式 タップ 出席 投げ銭 ランキング"),
  },
  "/island": { note: "矢印でとなりの島へ渡れる", q: q("島の地図 atlas island 連なり 章") },
  [NORDIC_GUIDE_HREF]: { note: "お金・通信・服・サウナ・食べもの", q: q("旅のしおり guide 持ち物 サウナ お金 北欧") },
  "/goods": {
    note: "ステッカー・カード・キャラクター・LINEスタンプ・SUZURI",
    q: q(
      "あやとグッズ goods グッズ ステッカー sticker シール LINEスタンプ line stamp " +
        "LINE STORE ちゃす 仲間たち " +
        "スタンプ カレンダー calendar SUZURI suzuri トートバッグ tシャツ 透かし 無料",
    ),
  },
  "/goods/stickers": {
    /* **枚数を書かない**（1枚足した日から嘘になる） */
    note: "落として、好きなところに貼れる1枚",
    q: q("あやとステッカー sticker シール 無料 ダウンロード 落とす 貼る 透過 印刷 グッズ 図鑑 ステッカー帳"),
  },
  "/cards": {
    note: "その日の写真。キャラクターを入れて持って帰れる",
    /* 「旅の写真」で探す人がここへ着くようにする。2026-09-10 に `/nordic/photos` をこの面へ寄せた（#1279 で控えの面も消した） */
    q: q("あやと島カード cards カード コレクション 投げ銭 旅の写真 photos 写真 スタンプ"),
  },
  /* 島を直したところ（2026-10-13）。表紙にも島にも出さない——あやとの言葉「気にしてる人少ないのでさりげなく」。
     探しに来た人が1回で着ければ足りる。棚はやってほしいこと（こうしてほしい を、ここから貼れる） */
  "/updates": {
    note: "どこが変わったか。こうしてほしいも、ここから",
    q: q("島をなおしたところ updates 変わった 直した 要望 改良 お知らせ"),
  },
  "/design": { note: "島で使う印と部品の棚", q: q("デザインの見本 design 部品 アイコン") },
};

/** 街の探し言葉。**人が書く字**（面の中身の見どころ・食べもの）。無い街は名前と slug だけで引く */
const CITY_Q: Record<string, Line> = {
  /* 行った街。探し言葉は面に在る語だけ */
  "armenia/yerevan": {
    note: "どんな街か・やりたいこと8選・見どころ・食べもの・買いもの・ことば",
    q: q(
      "アルメニア armenia エレバン yerevan カスケード kaskad 共和国広場 マテナダラン matenadaran アララト " +
        "ガルニ ゲガルド geghard エチミアジン ホル・ヴィラップ khor virap セヴァン sevanavank ホロヴァツ khorovats ラヴァシュ lavash ドラム コーカサス",
    ),
  },
  /* 2026-11-23 に公開した行く前の街。国の面はまだ無い */
  "serbia/belgrade": {
    note: "どんな街か・やりたいこと8選・見どころ・食べもの・買いもの・ことば",
    q: q(
      "セルビア serbia ベオグラード belgrade 要塞 カレメグダン kalemegdan 聖サヴァ大聖堂 テスラ tesla " +
        "スカダルリヤ skadarlija ゼムン zemun ノヴィ・サド novi sad チェヴァプチチ ćevapi ブレク burek ディナール dinar バルカン",
    ),
  },
  "romania/bucharest": {
    note: "どんな街か・やりたいこと8選・見どころ・食べもの・買いもの・ことば",
    q: q(
      "ルーマニア romania ブカレスト bucharest 国民の館 palace parliament ドラキュラ dracula ブラン城 bran " +
        "ペレシュ城 peles アテネ音楽堂 athenaeum サルマーレ sarmale パパナシ papanasi レイ lei バルカン",
    ),
  },
  "bulgaria/sofia": {
    note: "どんな街か・やりたいこと8選・見どころ・食べもの・買いもの・1日の予算・ことば",
    q: q(
      "ブルガリア bulgaria ソフィア sofia ヨーグルト バラ rose キリル文字 cyrillic " +
        "バニツァ banitsa タラトル tarator ショプスカ shopska ネフスキー nevski " +
        "ボヤナ boyana リラ修道院 rila ヴィトシャ vitosha ユーロ euro レフ lev バルカン",
    ),
  },
  "north-macedonia/skopje": {
    note: "見る・食べる・買う・すること。行った人の話つき",
    q: q("北マケドニア north macedonia スコピエ skopje 観光 見どころ 食べ物 物価 マトカ渓谷 matka 旧市街 石橋 ケバピ ホステル"),
  },
};

/** 中身の表を持つ面の1行。道 → 1行 */
const FROM_TABLES: Record<string, Line> = Object.fromEntries<Line>([
  ...STREAM_TYPES.map((t) => [`/streams/${t.slug}`, { note: t.short, q: q(t.name, t.short, t.lead, t.slug) }] as const),
  ...MONTHS.map(
    (m) => [`/months/${m.key}`, { note: `${m.streams.length}本・${m.people}人`, q: q(`${m.year}年${m.month}月 ${m.key} ふりかえり 月末 授賞式`) }] as const,
  ),
  ...LEGENDS.map((l) => [`/legends/${l.slug}`, { note: l.lead, q: q(l.title, l.lead, l.slug) }] as const),
  ...TRAVEL_PLACES.map((p) => {
    const c = p.country;
    /* 束ねる語彙は旅の名前（「北欧周遊」で探しても国が出る。`docs/spec/model.md` M-5） */
    const trips = tripsOfCountry(p.slug).map((t) => t.name).join(" ");
    const towns = TRAVEL_CITIES.filter((x) => x.country === p.slug).map((x) => `${x.name} ${x.slug}`).join(" ");
    return [
      p.href,
      c ?
        { note: c.summary, q: q(c.name, c.en, c.slug, trips, c.stays.flatMap((s) => s.cities).join(" ")) } :
        /* 歩いている最中の国（記録の面。`app/travel/record.tsx`） */
        { note: "いつ行ったか・配信の数・行った街", q: q(p.name, p.slug, trips, towns, "旅の記録 配信 行った街") },
    ] as const;
  }),
  ...TRAVEL_CITIES.map((c) => {
    const hand = CITY_Q[`${c.country}/${c.slug}`];
    return [c.href, hand ?? { note: "見る・食べる・買う・すること", q: q(c.name, c.slug, "観光 見どころ 食べ物") }] as const;
  }),
  ...TRAVEL_ARTICLES.map((a) => {
    const g = articleOf(a.country, a.city, a.slug);
    return [a.href, { note: g.h1.slice(1).join(""), q: q(g.title, a.slug) }] as const;
  }),
  ...ISLE_CHAPTERS.map((c) => [
    chapterHref(c),
    /* まだ始まっていない章は from が空。**「次の島」と書かない**（始まっていない章は1つとはかぎらない） */
    { note: c.from ? `${c.from.slice(0, 4)}年から。歩ける島` : "これから建っていく島", q: q(c.name, c.slug, "島 歩く 旅") },
  ] as const),
  ...ISLE_CHAPTERS.map((c) => [`${chapterHref(c)}/streams`, { note: "この旅のあいだにやった配信だけ", q: q(c.name, c.slug, "配信 アーカイブ") }] as const),
  ...DAY_PAGES.map((d) => [
    dayHref(d),
    {
      note: d.lead ?? "",
      /* 動かない日（休息日）は区間を持たない。街の名前で引けなくなるので、`city` と「寄るかもしれない街」も混ぜる */
      q: q(
        "北欧",
        d.lead,
        [
          ...(d.legs ?? []).flatMap((l) => [cityName(l.from), cityName(l.to), ...(l.maybe ?? [])]),
          d.city ?? "",
          ...(d.maybe ?? []),
        ].join(" "),
      ),
    },
  ] as const),
  ...RECIPES.map((r) => [
    `/kitchen/${r.slug}`,
    {
      note: `${countryName[r.country] ?? ""}・${kindLabel(r.kind)}／${y(r.date)}${ym(r.date)}`,
      q: q(r.name, r.note, r.slug, countryName[r.country], kindLabel(r.kind)),
    },
  ] as const),
  /* **配信の無いアプリ（`PAST_APPS`）も並べる。** 工房に建っていなくても、紙は書き出されている */
  ...ALL_APPS.map((a) => [`/apps/${a.slug}`, { note: a.tagline, q: q(a.name, a.tagline, a.slug) }] as const),
]);

/** 入口の建物の面（`/about` など）。1行は建物の一言 */
const DOOR_LINES: Record<string, Line> = Object.fromEntries(
  PLACES.map((d) => [d.href, { note: d.blurb, q: q(d.label, d.blurb, d.id, d.href) }]),
);

function destOf(p: Page): Dest {
  const line = SINGLE[p.path] ?? FROM_TABLES[p.path] ?? DOOR_LINES[p.path];
  /* 1行の無い面を、黙って空で並べない。面の種類を足したら、上の表のどれかに1行足す */
  if (!line) throw new Error(`content/directory.ts: ${p.path} の1行（note と探し言葉）が無い`);
  return { href: p.path, name: p.name, ...line, q: q(p.name, line.q) };
}

/**
 * 並びは種類の表の並びのまま、**同じ親の下の面を続けて**並べる（国のすぐ下にその国の街と話題、旅の島のすぐ下にその旅の日）。
 * 種類の表は「国ぜんぶ → 街ぜんぶ」の順なので、そのままだと街が国から離れる。
 */
function grouped(pages: Page[]): Page[] {
  const keyOf = (path: string) => path.split("/").slice(0, 3).join("/") || "/";
  const order: string[] = [];
  const by = new Map<string, Page[]>();
  for (const p of pages) {
    const k = keyOf(p.path);
    if (!by.has(k)) {
      by.set(k, []);
      order.push(k);
    }
    by.get(k)!.push(p);
  }
  return order.flatMap((k) => by.get(k)!);
}

/* **検索には出すが、棚には並べない面。** 理由ごとここに書く（`tools/sprites/prodsweep.mjs` の `ABSENCES` と同じ決め）。
   - `/all` … この面そのもの。自分の中に自分への行を置かない
   - `/privacy` … 読み物ではない。Google の OAuth 審査に URL を出す都合で持っている面なので、
     検索からは引けるようにして、島の索引には並べない（2026-09-19 の決め。2026-11-23 に戻した。#1386） */
const OFF_SHELF = new Set(["/all", "/privacy"]);
/** 検索には出さないが、棚には並べる面（`prodsweep.mjs` の `ABSENCES` で sitemap だけ外してある面）。部品を探すときはここから入る */
const SHELF_ONLY = ["/design"];

const ON_SHELF = [
  ...listedPages().filter((p) => !OFF_SHELF.has(p.path)),
  ...SHELF_ONLY.map((h) => {
    const p = pageAt(h);
    if (!p) throw new Error(`content/directory.ts: 棚に並べる ${h} が、面の一覧（lib/pages.ts）に無い`);
    return p;
  }),
];

const entranceOf = (path: string): string => kindOf(routeOf(path)!).entrance;

export const SHELVES: Shelf[] = [
  ...PLACES.map((d) => ({
    id: d.id,
    title: d.label,
    note: d.blurb,
    items: grouped(ON_SHELF.filter((p) => entranceOf(p.path) === d.label)).map(destOf),
  })),
  {
    id: "misc",
    title: "そのほか",
    /* 入口を持たない面（表紙と、建物の外。種類の表の「表紙」「建物の外」） */
    note: "島そのものと、部品の見本",
    items: ON_SHELF.filter((p) => !PLACES.some((d) => d.label === entranceOf(p.path))).map(destOf),
  },
];

/**
 * 行き先の数。`/all` が「島にある紙、◯枚」と名乗る数。
 *
 * **同じ行き先を2つの棚に並べない**ので、行の数と行き先の数は同じになる。
 * 前は北欧の国が「歩いた国」と「北欧の旅」の2棚に並んでいて、行の数と名乗る枚数がずれないように
 * 行き先で数え直していた（2026-09-19 には画面が「122枚」と名乗って、121枚しか無かった）。
 * いまは2回並んだら書き出しを止める。
 */
const ROWS = SHELVES.flatMap((s) => s.items.map((d) => d.href));
const DEST_HREFS = new Set(ROWS);
if (DEST_HREFS.size !== ROWS.length) {
  const dup = ROWS.filter((h, i) => ROWS.indexOf(h) !== i);
  throw new Error(`content/directory.ts: 同じ行き先が2つの棚に並んでいる（${[...new Set(dup)].join(", ")}）`);
}

/* **棚の行き先と、索引に出す面（種類の表。`lib/pages.ts`）を突き合わせる**（R-22。#1357）。
   - 索引に出す面が、どの棚にも無い → 止める。立て忘れると、索引には在るのに `/all` から行けない面になる
   - 棚の行き先が、面の一覧に無い → 止める。押した先が無い行を並べない */
const offShelf = listedPages()
  .map((p) => p.path)
  .filter((h) => !OFF_SHELF.has(h) && !DEST_HREFS.has(h));
if (offShelf.length) throw new Error(`content/directory.ts: 索引に出す面が /all の棚に無い（${offShelf.join(", ")}）`);
const ghost = [...DEST_HREFS].filter((h) => !pageAt(h));
if (ghost.length) throw new Error(`content/directory.ts: /all の棚の行き先が、面の一覧（lib/pages.ts）に無い（${ghost.join(", ")}）`);
export const DEST_COUNT = DEST_HREFS.size;
