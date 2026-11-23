/**
 * **面の一覧。種類の表（`content/kinds.ts`）の道の型ごとに、その型の面ぜんぶ**（R-22・R-23。#1357）。
 *
 * 索引（`app/sitemap.ts`）・島のなか ぜんぶ（`/all`、`content/directory.ts`）・パンくず（と、その名札
 * `BreadcrumbList`）は、どれもここから引く。前は3つが別々の手書きの並びで、面を1枚足すと3か所を直していた
 * （`app/sitemap.ts` の頭に「面を1枚増やす仕事は3か所ある」と書いてあって、それでも2回足し忘れた。#872）。
 *
 * ## 面を1枚足す仕事は、種類ごとに1か所
 *
 * - **中身の表を持つ種類**（料理・企画・月・国・街・旅…）は、その表に1行足すだけ。下の `MEMBERS` が表を読む
 * - **道の型を足す**ときは、仕様の道の表（`docs/spec/routes.md` 2章）と種類の表に1行、ここに1行。
 *   `MEMBERS` は道の型ぜんぶを鍵に持つ形なので、足し忘れると型が通らない
 *
 * `/all` の棚の添え書き（1行の説明・探し言葉）は、人が書く字なので `content/directory.ts` が持つ。
 * 棚に並ぶ行き先は、ここの索引に出す面と**ちょうど同じ**でないと書き出しが止まる（あちらの下の確かめ）。
 *
 * ## 読み込んだときには組まない
 *
 * ここは中身の表をぜんぶ読むが、`content/travel.ts` のパンくずの口もここを呼ぶので、読み込んだときに組むと輪になる。
 * 初めて呼ばれたときに1度だけ組む（`all()`）。
 */
import { DOORS } from "@/components/island/layout";
import { ISLE_CHAPTERS, ISLE_STREAM_CHAPTERS, chapterHref } from "@/components/chain/route";
import { countryMapArt } from "@/components/atlas/mapArt";
import { ALL_APPS } from "@/content/apps";
import { ISLAND_LABEL } from "@/content/chapters";
import { guidebookOf } from "@/content/guidebook";
import { readDrawn } from "@/content/guidebook/manifest";
import { KINDS, kindOf, routeOf, type Route } from "@/content/kinds";
import { LEGENDS } from "@/content/legends";
import { MONTHS } from "@/content/months";
import { BOOK_PROJECTS } from "@/content/projects";
import { DAY_PAGES, NORDIC_GUIDE_HREF, dayHref, dayName } from "@/content/nordic";
import { RECIPES } from "@/content/recipes";
import { SITE } from "@/content/site";
import { STREAM_TYPES } from "@/content/streamTypes";
import { TRAVEL, TRAVEL_ARTICLES, TRAVEL_CITIES, TRAVEL_LABEL, TRAVEL_PLACES } from "@/content/travel";
import { articleOf } from "@/content/travel/articles";
import { LASTMOD } from "@/lib/lastmod";

/** 面1枚 */
export type Page = {
  path: string;
  /** 面の名前（h1 と揃える） */
  name: string;
  /** パンくずに出す字。無ければ `name` */
  crumb?: string;
  /** 中身が変わった日（分かる面だけ。`lib/lastmod.ts`） */
  lastmod?: string;
  /** 画像のサイトマップに載せる絵（面の主役の、島が描いた絵だけ） */
  images?: string[];
  /** 面は書き出すが、索引には出さない（公開前の印の付いた街と記事・下書きの企画） */
  unlisted?: boolean;
};

/** 道の型ごとの面。`listed` は索引（sitemap と `/all`）に出すか——道具・送るだけの面・公開前の面は出さない（R-25） */
type Member = { listed: boolean; pages: () => Page[] };

const one = (path: string, name: string, o: Omit<Page, "path" | "name"> = {}): Page[] => [{ path, name, ...o }];
const art = (src: string) => encodeURI(`${SITE.url}${src}`);

const MEMBERS: Record<Route, Member> = {
  "/": { listed: true, pages: () => one("/", "島") },
  "/about": { listed: true, pages: () => one("/about", "あやとのこと") },
  "/streams": { listed: true, pages: () => one("/streams", "配信") },
  "/streams/<型>": {
    listed: true,
    pages: () => STREAM_TYPES.map((t) => ({ path: `/streams/${t.slug}`, name: t.name, lastmod: LASTMOD.streamType(t) })),
  },
  "/months": {
    listed: true,
    /* パンくずも見出しと同じ字（前はパンくずだけ「ふりかえり」だった。#1279） */
    pages: () => one("/months", "月ごとのふりかえり", { lastmod: LASTMOD.months(MONTHS) }),
  },
  "/months/<月>": {
    listed: true,
    pages: () =>
      MONTHS.map((m) => ({
        path: `/months/${m.key}`,
        name: `${m.year}年${m.month}月のふりかえり`,
        crumb: `${m.year}年${m.month}月`,
        lastmod: LASTMOD.month(m),
      })),
  },
  "/legends": { listed: true, pages: () => one("/legends", "伝説の企画", { lastmod: LASTMOD.legends() }) },
  "/legends/<企画>": {
    listed: true,
    /* 伝説の企画と、面の印の付いた企画（M-8。始まる前から面を持つ）。**下書きの企画は、面は在るが索引に出さない**（M-33。`unlisted`） */
    pages: () => [
      ...LEGENDS.map((l) => ({ path: `/legends/${l.slug}`, name: l.title, lastmod: LASTMOD.legend(l) })),
      ...BOOK_PROJECTS.map((p) => ({ path: `/legends/${p.slug}`, name: p.title, unlisted: p.draft })),
    ],
  },
  "/travel": { listed: true, pages: () => one(TRAVEL, TRAVEL_LABEL) },
  "/travel/<国>": {
    listed: true,
    /* 国の面の名簿（`content/travel.ts`）から。国の地図の絵（「〈国〉の地図」）を画像のサイトマップに（#1262・#332）。
       焼いた絵が古い・無い国は面が SVG を直に描くので載せない（`components/atlas/mapArt.ts`） */
    pages: () =>
      TRAVEL_PLACES.map((p) => {
        const a = countryMapArt(p.slug, p.name);
        return { path: p.href, name: p.name, lastmod: p.country ? LASTMOD.country(p.country) : undefined, images: a ? [art(a.src)] : undefined };
      }),
  },
  "/travel/<国>/<街>": {
    listed: true,
    /* 街のガイド。**公開前の印（`draft`）が付いた街は出さない**（`publicCities`）。中身の無い街は書き出しを止める。
       （名簿の印の付いた街は、面の一覧には在るが索引に出さない。`unlisted`）。面に出ている描いた絵をぜんぶ画像のサイトマップに（見どころマップを先頭に）。**見たいもの（実在の場所）の写真は載せない**
       ——借りた写真で、島の絵ではない */
    pages: () =>
      TRAVEL_CITIES.map((c) => {
        if (c.draft) return { path: c.href, name: c.name, unlisted: true };
        const g = guidebookOf(c.country, c.slug);
        if (!g) throw new Error(`lib/pages.ts: ${c.country}/${c.slug} の中身が content/guidebook/ に無い`);
        const d = readDrawn(c.country, c.slug);
        const pics = [
          d.areamap?.baked ? d.areamap.src : undefined,
          d.cover?.src,
          ...[d.do, d.food, d.buy].flatMap((m) => Object.values(m).map((x) => x.src)),
        ].filter((s): s is string => !!s);
        return { path: c.href, name: c.name, lastmod: g.updated, images: pics.length ? [...new Set(pics)].map(art) : undefined };
      }),
  },
  "/travel/<国>/<街>/<話題>": {
    listed: true,
    pages: () =>
      TRAVEL_ARTICLES.map((a) => {
        const g = articleOf(a.country, a.city, a.slug);
        return { path: a.href, name: g.h1[0], crumb: a.crumb, lastmod: g.updated, unlisted: a.draft };
      }),
  },
  "/island": { listed: true, pages: () => one("/island", ISLAND_LABEL) },
  "/island/<旅>": { listed: true, pages: () => ISLE_CHAPTERS.map((c) => ({ path: chapterHref(c), name: c.name })) },
  "/island/<旅>/day/<日>": { listed: true, pages: () => DAY_PAGES.map((d) => ({ path: dayHref(d), name: `北欧 ${dayName(d)}`, crumb: dayName(d) })) },
  "/island/<旅>/guide": { listed: true, pages: () => one(NORDIC_GUIDE_HREF, "旅のしおり") },
  "/island/<旅>/streams": {
    listed: true,
    pages: () =>
      ISLE_STREAM_CHAPTERS.map((c) => ({ path: `/island/${c.slug}/streams`, name: `${c.name}の配信`, crumb: "配信", lastmod: LASTMOD.chapterStreams(c.slug) })),
  },
  "/kitchen": { listed: true, pages: () => one("/kitchen", "作った料理", { lastmod: LASTMOD.kitchen() }) },
  "/kitchen/<料理>": {
    listed: true,
    pages: () => RECIPES.map((r) => ({ path: `/kitchen/${r.slug}`, name: r.name, lastmod: LASTMOD.recipe(r) })),
  },
  "/apps": { listed: true, pages: () => one("/apps", "アプリ", { lastmod: LASTMOD.apps() }) },
  /* **配信の無いアプリ（`PAST_APPS`）も並べる。** 前は索引が `APPS` だけを見ていて、書き出されている面が1枚落ちていた */
  "/apps/<アプリ>": { listed: true, pages: () => ALL_APPS.map((a) => ({ path: `/apps/${a.slug}`, name: a.name, lastmod: LASTMOD.app(a) })) },
  "/friends": { listed: true, pages: () => one("/friends", "住んでる人") },
  "/goods": { listed: true, pages: () => one("/goods", "あやとグッズ") },
  "/goods/stickers": { listed: true, pages: () => one("/goods/stickers", "あやとステッカー") },
  "/cards": { listed: true, pages: () => one("/cards", "あやと島カード") },
  "/board": { listed: true, pages: () => one("/board", "やってほしいこと") },
  /* 島をなおしたところ（#851）。表紙に帯を立てないことと、検索から探せないことは別 */
  "/updates": { listed: true, pages: () => one("/updates", "島をなおしたところ", { lastmod: LASTMOD.updates() }) },
  "/all": { listed: true, pages: () => one("/all", "島のなか ぜんぶ") },
  /* 読み物ではないが、Google の OAuth 審査に URL を出す都合で索引に持つ */
  "/privacy": { listed: true, pages: () => one("/privacy", "プライバシーポリシー") },
  /* ここから下の道具は、索引に出さない（R-25。面も自分で `robots: index: false` を言っている） */
  "/design": { listed: false, pages: () => one("/design", "デザインの見本") },
  "/me": { listed: false, pages: () => one("/me", "じぶんのこと") },
  "/me/desk": { listed: false, pages: () => one("/me/desk", "島の管理") },
  "/me/roulette": { listed: false, pages: () => one("/me/roulette", "ルーレットの操作") },
  "/cards/import": { listed: false, pages: () => one("/cards/import", "写真をまとめて登録") },
  "/roulette": { listed: false, pages: () => one("/roulette", "ルーレット") },
  /* 島の投げ銭（#1405）。**公開するまで、島のどこからも繋がない**（面は `robots: index: false`） */
  "/tip": { listed: false, pages: () => one("/tip", "あやとに投げ銭") },
  /* `/next` と `/next/new` は #1277 で畳んだ（`/board` へ 301）。`/now` は #1278 で畳んだ（`/` へ 301）。
     `/nordic/photos` は #1279 で面を消した（`/cards` へ 301。`firebase.json`）。廃止予定の道は、もう無い */
};

type Built = { pages: (Page & { route: Route; listed: boolean })[]; byPath: Map<string, Page & { route: Route; listed: boolean }> };
let BUILT: Built | undefined;

/** 初めて呼ばれたときに1度だけ組む（上の「読み込んだときには組まない」） */
function all(): Built {
  if (BUILT) return BUILT;
  const pages = KINDS.flatMap((k) => {
    const m = MEMBERS[k.route];
    return m.pages().map((p) => {
      /* 面の道が、自分の道の型に当たらないものを並べない（名簿の道の組み立てが、仕様の型とずれた日に止める） */
      if (routeOf(p.path) !== k.route) throw new Error(`lib/pages.ts: ${p.path} は ${k.route} の面として並んでいるが、道の型が ${routeOf(p.path) ?? "どれにも当たらない"}`);
      return { ...p, route: k.route as Route, listed: m.listed };
    });
  });
  const byPath = new Map<string, (typeof pages)[number]>();
  for (const p of pages) {
    /* **同じ道を2回並べない。黙って1つに畳まず、止める**（前は `/updates` が sitemap に2回載っていた） */
    if (byPath.has(p.path)) throw new Error(`lib/pages.ts: ${p.path} が2回並んでいる`);
    byPath.set(p.path, p);
  }
  BUILT = { pages, byPath };
  return BUILT;
}

/** その道の型の面ぜんぶ */
export const pagesOf = (route: Route): Page[] => all().pages.filter((p) => p.route === route);

/** 索引（sitemap と `/all`）に出す面ぜんぶ。種類の表の並びで */
export const listedPages = (): Page[] => all().pages.filter((p) => p.listed && !p.unlisted);

/** その道の面。無ければ `undefined` */
export const pageAt = (path: string): Page | undefined => all().byPath.get(path);

type Crumb = { label: string; href?: string };

/**
 * その面のパンくず（島の段は `PageShell` が頭に付ける）。**入口と、道の上の段から組む**（R-23）。
 *
 * - 2段目は、種類の表の入口（その入口の建物の面）。道の上の段がその建物なら、二重にしない
 * - そのあと、道の上の段のうち面の在るもの（`/travel/bulgaria` が在れば ブルガリア）
 * - 最後はその面（押せない）
 *
 *     crumbsOf("/months/2026-10")   // 配信 › ふりかえり › 2026年10月
 *     crumbsOf("/travel/bulgaria/sofia/prices") // 歩いた国 › ブルガリア › ソフィア › 物価
 *
 * 面の無い道を渡すと投げる（押した先の無いパンくずを作らない）。
 */
export function crumbsOf(path: string, last?: string): Crumb[] {
  const here = pageAt(path);
  if (!here) throw new Error(`lib/pages.ts: ${path} の面が、面の一覧に無い（crumbsOf）`);
  const route = routeOf(path)!;
  const door = DOORS.find((d) => d.label === kindOf(route).entrance);
  const segs = path.split("/").filter(Boolean);
  const ups: Crumb[] = [];
  for (let i = 1; i < segs.length; i++) {
    const p = pageAt(`/${segs.slice(0, i).join("/")}`);
    if (p) ups.push({ label: p.crumb ?? p.name, href: p.path });
  }
  const head = door && door.href !== path && !ups.some((u) => u.href === door.href) ? [{ label: door.label, href: door.href }] : [];
  return [...head, ...ups, { label: last ?? here.crumb ?? here.name }];
}
