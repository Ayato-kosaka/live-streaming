import { AHEAD_COUNTRIES, COUNTRIES } from "./countries";
import { chapterNow, tripDate, type Chapter } from "./chapters";
import { chapterCountrySlugs } from "./stayChapters";

/**
 * 「これまで歩いた国」の数。**画面が出てから数え直す。**
 *
 * ## なぜ焼き込みではだめか
 *
 * この数は `content/countryStats.ts` の `COUNTRIES_WALKED` に毎晩焼かれていた。
 * 焼くほう（`python/build_country_stats.py` の `walked()`）は**旅程を今日で切って**
 * 数えるので、**日付が変われば答えが変わる数**を、日に1度だけ焼いていたことになる。
 * 国境を越えた日の 00:00 から、その晩の焼き直しが配られるまでのあいだ、
 * 表紙と `/now` が1つ少ない数を言う。CLAUDE.md の「あと何日」「いちばん近い企画」
 * 「配信本数」と同じ組——**画面が出てから計算し直すもの**だった。
 *
 * ## 何を正にしたか
 *
 * **「歩いた国」の面（`/map`）に並んでいて、数えられる国**を正とした。
 * 島の住人が「『歩いた国』から、これまで歩いた◯カ国をたどれるよー」と言う以上、
 * 行った先で数えられる数と違ってはいけない。
 *
 * その並びは2つでできている。**両方ともここで数える。**
 *
 *   1. 歩き終わった国（`content/countries.ts` の `COUNTRIES`）
 *   2. いま歩いている旅のうち、**今日までに入った国**（`AHEAD_COUNTRIES`）
 *
 * 国の表には国だけが居る（`docs/spec/model.md` M-17）。前は国境まで歩いた区間（`iran-border`）が
 * 国の行として居て、ここで「国境は数えない」と外していた（#1355 で国の表から出した）。
 *
 * ## 日付は旅の土地の暦で切る
 *
 * `tripDate`（中央ヨーロッパ夏時間）。日本時間で切ると、日本の夜のあいだじゅう
 * 翌日の国を数える（`components/nordic/where.ts`）。
 *
 * ## 旅程は「予定」であることを承知で使う
 *
 * `AHEAD_COUNTRIES` の `entered` は旅程の日付なので、ヒッチハイクが進まなければ
 * 実際の入国はずれる。**それでも `/map` の並びと同じ数**になるほうを取った。
 * 面の中で数が2つあるほうが悪い（`docs/island-standards.md` 8章）。
 * 歩き終わった国が `COUNTRIES` に書き込まれたら、そちらが勝つ（下の `known`）。
 */
export function countriesWalked(now: Date = new Date()): number {
  const day = tripDate(now);
  /* 歩いている最中の国は `walkingCountries()` が1本で持つ。**ここで絞り直さない**
     ——`/map` の年表も島の札も同じものを読むので、式が増えると数が割れる */
  return WALKED_DONE + walkingCountries().filter((c) => c.entered <= day).length;
}

/**
 * 歩き終わった国の数。**旅の国は入らない。**
 *
 * `/travel` の年表で、旅の国に振る通し番号の起点に使う。
 */
export const WALKED_DONE = COUNTRIES.length;

/** その日の前日。国の切れ目を引くためだけなので、暦は UTC で足りる */
const prevDay = (d: string) =>
  new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);

/**
 * いま歩いている最中の国。**`AHEAD_COUNTRIES` のうち、まだ記録の無いもの。**
 *
 * 出どころを1本にするために、ここが持つ。前は `/map` の年表と `/island/<章>` の
 * 札が、同じことをそれぞれ別の式で出していた。
 *
 * **出た日（`left`）は、つぎの国に入った前日。** 人は2つの国に同時には居ない。
 * `python/stays.py` の `chapter_stays()` が焼き込みをそう区切っている（`_prev_day`）
 * ので、画面だけ開いたままにすると、2カ国に同時に居るように読める。
 * つぎの国がまだ無い（いまいる国）なら、開いたままが事実。
 */
export type WalkingCountry = {
  slug: string;
  name: string;
  /** 入った日（YYYY-MM-DD） */
  entered: string;
  /** 出た日。まだその国にいれば空 */
  left: string;
};

export function walkingCountries(): WalkingCountry[] {
  const known = new Set(COUNTRIES.map((c) => c.slug));
  const rows = AHEAD_COUNTRIES.filter((c) => !known.has(c.slug))
    .slice()
    .sort((a, b) => a.entered.localeCompare(b.entered));
  return rows.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    entered: c.entered,
    left: rows[i + 1] ? prevDay(rows[i + 1].entered) : "",
  }));
}

/**
 * その島（章）で歩いた国。**歩き終わった国と、歩いている最中の国の両方。**
 *
 * ## なぜ `chapterCountrySlugs` だけでは足りないか
 *
 * あちら（`content/stayChapters.ts`）が返すのは**国の記録のある国**だけで、記録は
 * **歩き終わるまで書けない**（見どころと紹介が要る）。それだけを数えると、バルカン
 * 諸国周遊はアルバニアを歩いて北マケドニアに居る日に島が「**0カ国 歩いた**」と言う。
 * 歩いているのに0は嘘（`docs/island-standards.md` 16章）。だから記録の無い国
 * （`AHEAD_COUNTRIES`）を、その国に入った日に動いていた章へ足す——`python/stays.py` の
 * `chapter_stays()` も `/map` の年表も同じ決めかた。
 */
export type ChapterCountry = {
  slug: string;
  name: string;
  stays: { from: string; to: string; cities: string[] }[];
  /** その国の面。まだ記録が無い国は、年表のある「歩いた国」へ送る */
  href: string;
};

export function chapterCountries(c: Chapter, now: Date = new Date()): ChapterCountry[] {
  const done: ChapterCountry[] = chapterCountrySlugs(c).flatMap((slug) => {
    const k = COUNTRIES.find((x) => x.slug === slug);
    return k ? [{ slug: k.slug, name: k.name, stays: k.stays, href: `/travel/${k.slug}` }] : [];
  });
  const known = new Set(done.map((k) => k.slug));
  const day = tripDate(now);
  /* 章は**その国に入った日に動いていた章**で引く（`app/travel/page.tsx` の年表と
     同じ決めかた）。日付だけで決まるので、焼き込んでも答えは動かない。 */
  const walking = walkingCountries()
    .filter((k) => !known.has(k.slug) && k.entered <= day)
    .filter((k) => chapterNow(new Date(`${k.entered}T12:00:00+02:00`)).slug === c.slug)
    .map((k) => ({
      slug: k.slug,
      name: k.name,
      // 街はまだ書けない（歩き終わってから `COUNTRIES` に書く決まり）。**推測で埋めない**
      stays: [{ from: k.entered, to: k.left, cities: [] }],
      href: "/travel",
    }));
  return [...done, ...walking];
}
