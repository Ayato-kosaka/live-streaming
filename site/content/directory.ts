import { DOORS } from "@/components/island/layout";
import { ISLE_CHAPTERS, ISLE_STREAM_CHAPTERS } from "@/components/chain/route";
import { ALL_APPS } from "@/content/apps";
import { COUNTRIES } from "@/content/countries";
import { TRAVEL_LABEL, TRAVEL_PLACES, publicCities, travelHref, travelPage } from "@/content/travel";
import { LEGENDS } from "@/content/legends";
import { MONTHS } from "@/content/months";
import { DAY_PAGES, NORDIC_COUNTRIES, cityName, dayHref, dayName } from "@/content/nordic";
import { RECIPES, kindLabel } from "@/content/recipes";
import { STREAM_TYPES } from "@/content/streamTypes";
import { say } from "@/content/nights";

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
    /* **軒数を書かない。** 「10軒」と焼いてあったので、島に1軒足した日から
       `/all` だけが古い数を名乗ることになる（`docs/island-standards.md` 8章）。
       数は下の一覧が持っていて、そこは `DOORS` から作られている。 */
    note: "島に建っているものと、島そのもの",
    items: [
      { href: "/", name: "島", note: "ここ。建っているものは、ぜんぶ押せば入れる", q: q("島 top home ayato") },
      /* 建物ではないが、島の直下にある面（#173）。`/about` と `/friends` と
         `/me` の3か所から見えるので、どれかの子にはしていない。 */
      {
        href: "/cards",
        name: "あやと島カード",
        note: "その日の写真。キャラクターを入れて持って帰れる",
        /* 「旅の写真」で探す人がここへ着くようにする。2026-09-10 に
           `/nordic/photos` をこの面へ寄せたので、探し言葉も引き取る */
        q: q("あやと島カード cards カード コレクション 投げ銭 旅の写真 photos 写真 スタンプ"),
      },
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
    note: say("typesLong"),
    items: STREAM_TYPES.map((t) => ({
      href: `/streams/${t.slug}`,
      name: t.name,
      note: t.short,
      q: q(t.name, t.short, t.lead, t.slug),
    })),
  },
  {
    id: "months",
    title: "月ごとのふりかえり",
    /* **数も時制も書かない**（`docs/island-standards.md` 16章）。
       月は毎月1つ増えるので、ここに数を焼くと翌月から嘘になる。
       数は `/months` の中身が数える。 */
    note: "ひと月ずつの記録。出席・投げ銭・タップ",
    items: [
      {
        href: "/months",
        name: "月ごとのふりかえり",
        note: "ひと月ずつ、ならべて見る",
        q: q("月ごとのふりかえり months 月末 ふりかえり 振り返り 授賞式 タップ 出席 投げ銭 ランキング"),
      },
      ...MONTHS.map((m) => ({
        href: `/months/${m.key}`,
        name: `${m.year}年${m.month}月のふりかえり`,
        note: `${m.streams.length}本・${m.people}人`,
        q: q(`${m.year}年${m.month}月 ${m.key} ふりかえり 月末 授賞式`),
      })),
    ],
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
    title: TRAVEL_LABEL,
    // 終点の街を書かない（旅は毎日進む）。数は `COUNTRIES` から数える
    note: `行った順に${COUNTRIES.length}カ国`,
    /* 国の面の名簿（`content/travel.ts`）から。歩いた記録を持つ国だけ——行く前の案内だけの国は
       下に自分の棚を持っている（混ぜると「行った順に◯カ国」と数が合わない） */
    items: TRAVEL_PLACES.flatMap((p) => (p.country ? [{ ...p, c: p.country }] : [])).map(({ href, c }) => ({
      href,
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
    title: "北欧の旅",
    /* **「次の旅」と書かない。** 旅は 2026-09-27 に終わっている。
       ここは焼き込みなので、時点を言う字を置くとその日から嘘になる
       （`content/chapters.ts` の同じ決まり）。何の旅だったかだけを言う。 */
    note: "ポーランドからスウェーデンまで、ぜんぶ人の車で",
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
          // 動かない日（休息日）は区間を持たない。街の名前で引けなくなるので、
          // `city` と「寄るかもしれない街」も混ぜる
          [
            ...(d.legs ?? []).flatMap((l) => [cityName(l.from), cityName(l.to), ...(l.maybe ?? [])]),
            d.city ?? "",
            ...(d.maybe ?? []),
          ].join(" "),
        ),
      })),
      {
        href: "/nordic/guide",
        name: "旅のしおり",
        note: "お金・通信・服・サウナ・食べもの",
        q: q("旅のしおり guide 持ち物 サウナ お金"),
      },
      /* 国の行は、歩いた記録の面へ（2026-11-13 に `/nordic/<国>` を寄せた。#1201）。
         上の「歩いた国」の棚と同じ紙を指すが、**行は消さない**——北欧の旅から国を探す人は
         ここを見る。紙の数は行き先で数えるので、2回は数えない（下の `DEST_COUNT`） */
      ...NORDIC_COUNTRIES.map((c) => ({
        href: travelHref(c.slug),
        name: c.name,
        note: c.catch,
        q: q(c.name, c.en, c.slug, c.catch, c.cities.join(" ")),
      })),
    ],
  },
  {
    /* ブルガリア。**北マケドニアと同じ棚にしない。** 同じ周遊の中の国だが、
       棚は「どの国の話か」で分ける——混ぜると、ソフィアの紙がスコピエの
       中の1行に見える（北マケドニアの棚を立てたときと同じ理由）。 */
    id: "bulgaria",
    title: "ブルガリア",
    /* **時点を言わない**（`docs/island-standards.md` 16章） */
    note: "ローマの遺跡と、ただで湧く温泉の首都。首都はソフィア",
    items: [
      {
        href: "/bulgaria",
        name: "ブルガリア・ソフィア",
        note: "どんな街か・したいこと・基本情報・歩くコース・見どころ・食べもの・買いもの・ことば",
        q: q(
          "ブルガリア bulgaria ソフィア sofia ヨーグルト バラ rose キリル文字 cyrillic " +
            "バニツァ banitsa タラトル tarator ショプスカ shopska ネフスキー nevski " +
            "ボヤナ boyana リラ修道院 rila ヴィトシャ vitosha ユーロ euro レフ lev バルカン",
        ),
      },
    ],
  },
  {
    /* 北マケドニア。**面は1枚だが、棚を立てる。**
       北欧の棚に混ぜると「北欧の旅」の中の1行になって、別の国の話だと読めない。
       歩き終わったら、記録と案内は同じ1枚（`/travel/<国>`）に育つ（#1201）。 */
    id: "north-macedonia",
    title: "北マケドニア",
    /* **時点を言わない**（`docs/island-standards.md` 16章）。
       「これから行く国」と書くと、着いた日から嘘になる。 */
    note: "海に出ない、山と湖の国。首都はスコピエ",
    items: [
      {
        href: travelPage("north-macedonia").href,
        name: "北マケドニア",
        note: "どんな国か・スコピエ・食べもの・ことば",
        q: q(
          "北マケドニア north macedonia スコピエ skopje オフリド ohrid マトカ matka " +
            "タヴチェグラフチェ アイヴァル ajvar デナル denar キリル文字 バルカン",
        ),
      },
      /* 街のガイド。**公開前の印（`draft`）が付いた街は並べない**（`content/travel.ts` の `publicCities`）。
         印を外した日に、ここへひとりでに1行増える */
      ...publicCities("north-macedonia").map((c) => ({
        href: c.href,
        name: c.name,
        note: "実際に行った記録。物価・行き方・マトカ渓谷",
        q: q(c.name, c.slug, "スコピエ skopje 旅行記 物価 行き方 マトカ渓谷 matka チェバピ 旧市街 ホステル"),
      })),
    ],
  },
  {
    id: "atlas",
    title: "島の連なり",
    note: "これまで渡ってきた島、ぜんぶ",
    items: [
      { href: "/atlas", name: "島の地図", note: "矢印でとなりの島へ渡れる", q: q("島の地図 atlas 連なり 章") },
      ...ISLE_CHAPTERS.map((c) => ({
        href: `/island/${c.slug}`,
        name: c.name,
        /* まだ始まっていない章は from が空。年を出すと「年から」になる。
           **「次の島」と書かない。** 始まっていない章は1つとはかぎらないし
           （行き先だけ決まっている島がうしろに並ぶ）、この字は焼かれるので
           出発した日から「まだ建っていない」が嘘になる。島の面と同じ言い方にそろえる。 */
        note: c.from ? `${c.from.slice(0, 4)}年から。歩ける島` : "これから建っていく島",
        q: q(c.name, c.slug, "島 歩く"),
      })),
      // 配信の一覧は、配信のある章だけ。無い章に口を出すと、押した先が無い
      ...ISLE_STREAM_CHAPTERS.map((c) => ({
        href: `/island/${c.slug}/streams`,
        name: `${c.name}の配信`,
        note: "この章のあいだにやった配信だけ",
        q: q(c.name, c.slug, "配信 アーカイブ"),
      })),
    ],
  },
  {
    /* グッズ（2026-10-08）。**「そのほか」に混ぜずに、棚を立てる。**
       「そのほか」に混ぜると、デザインの見本と同じ段に見える。あちらは
       作る側の棚で、こちらは持って帰る人の棚。用事がまるごと違う。
       **ステッカーは自分の面を持った**（2026-10-13、`/goods/stickers`）。
       増えるのはその面の中なので、棚に並ぶ行き先はこれ以上増えない。 */
    id: "goods",
    title: "グッズ",
    /* **時点を言わない**（`docs/island-standards.md` 16章）。
       「いま3つ」と書くと、1つ増えた日から嘘になる。 */
    note: "島から持って帰れるものと、お店で買えるもの",
    items: [
      {
        href: "/goods",
        name: "あやとグッズ",
        note: "ステッカー・カード・キャラクター・LINEスタンプ・SUZURI",
        q: q(
          "あやとグッズ goods グッズ ステッカー sticker シール LINEスタンプ line stamp " +
            "スタンプ カレンダー calendar SUZURI suzuri トートバッグ tシャツ 透かし 無料",
        ),
      },
      {
        href: "/goods/stickers",
        name: "あやとステッカー",
        /* **枚数を書かない**（`docs/island-standards.md` 16章）。
           1枚足した日から嘘になる */
        note: "落として、好きなところに貼れる1枚",
        q: q(
          "あやとステッカー sticker シール 無料 ダウンロード 落とす 貼る 透過 " +
            "印刷 グッズ 図鑑 ステッカー帳",
        ),
      },
    ],
  },
  {
    id: "misc",
    title: "そのほか",
    note: "書くところと、部品の見本",
    items: [
      /* 「企画のページを作る」（`/next/new`）は、ここから外した（2026-10-01）。
         視聴者さんが企画を出す道を畳んだので、面は `/board` へ送るだけの
         1枚になっている。索引から名指しで呼ぶと、押した先で送り返される。 */
      /* 島を直したところ（2026-10-13）。**入口はここと、掲示板の
         「あやと島へ」の札だけ**（`content/themes.ts`）。表紙にも島にも
         出さない——あやとの言葉「気にしてる人少ないのでさりげなく」。
         探しに来た人が1回で着ければ足りる。 */
      {
        href: "/updates",
        name: "島をなおしたところ",
        note: "どこが変わったか。こうしてほしいも、ここから",
        q: q("島をなおしたところ updates 変わった 直した 要望 改良 お知らせ"),
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

/**
 * 行き先の数。`/all` が「島にある紙、◯枚」と名乗る数。
 *
 * **行の数ではなく、行き先の数を数える。** 名乗っているのは「紙」なので、
 * 同じ紙へ行く行が2つあれば1枚。
 *
 * 章の島の行は、**いまいる島のぶんだけ `/` に化ける**——いまいる島は
 * `/island/<章>` ではなくトップそのもので（`components/chain/route.ts` の
 * `chapterHref`）、`/all` はその1行だけ画面が出てから行き先を引き直す
 * （`components/chain/AllIsleRow.tsx`）。`/` は「島」の行としてもう並んでいるから、
 * その1行は**すでに数えた紙**を指すことになる。
 *
 * **どれが化けるかは日付で変わるが、化けるのは必ず1つ**なので、この数は
 * 日付によらない。だから焼いてよい（焼いた数が翌日ずれる、が起きない）。
 * 2026-09-19 まではここが行の数（122）で、本番の `/all` に並んでいる行き先は
 * 121 だった。**画面が「122枚」と名乗って、121枚しか無かった。**
 */
const DEST_HREFS = new Set(SHELVES.flatMap((s) => s.items.map((d) => d.href)));

/* **国の面は、ここに並んでいないと書き出しを止める。** 歩いた国は名簿から棚に並ぶが、
   行く前の案内だけの国（`content/travel.ts` の `GUIDE_ONLY`）は棚を手で立てる（探し言葉は人が書く）。
   立て忘れると、索引には在るのに `/all` から行けない面になる——前は配ったあとの
   `prodsweep.mjs` で初めて分かった（#1201） */
const offShelf = [...TRAVEL_PLACES, ...publicCities()].filter((p) => !DEST_HREFS.has(p.href)).map((p) => p.href);
if (offShelf.length) throw new Error(`content/directory.ts: 国の面が /all の棚に無い（${offShelf.join(", ")}）`);
/** いまいる島の行が `/` に化けるぶん。**必ず1つ**（`chapterHref`） */
const ISLE_NOW_ROWS = 1;
export const DEST_COUNT = DEST_HREFS.size - ISLE_NOW_ROWS;
