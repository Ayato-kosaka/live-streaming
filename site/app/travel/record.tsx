import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { COUNTRIES, countryBySlug, type Country } from "@/content/countries";
import { WALKED_DONE, chapterCountries, walkingCountries } from "@/content/walked";
import { chapterHref, chapterNow } from "@/content/chapters";
import { tripsOfCountry } from "@/content/stayChapters";
import { legendsOfCountry } from "@/lib/projectsOf";
import { RECIPES } from "@/content/recipes";
import { streamsOfCity, type CityStream } from "@/content/cityStreams";
import { STREAM_DIGEST } from "@/content/streamDigest";
import { countryStat } from "@/content/countryStats";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import CountryMap from "@/components/atlas/CountryMap";
import CityCard from "@/components/travel/CityCard";
import { StayAbout, StayLen, StayOut } from "./parts";
import CountryGuide from "@/components/nordic/CountryGuide";
import { nordicCountry } from "@/content/nordic";
import {
  TRAVEL_CITIES,
  publicArticles,
  publicCities,
  travelCrumbs,
  travelHref,
  travelPlace,
  travelShare,
  type TravelCity,
} from "@/content/travel";
import { articleOf } from "@/content/travel/articles";
import { stayWord } from "@/lib/stay";
import { span } from "@/lib/seoText";
import { JsonLd, abs, articleLd } from "@/lib/jsonld";
import { LASTMOD } from "@/lib/lastmod";
import { SITE } from "@/content/site";
import { countryMapArt } from "@/components/atlas/mapArt";
import Writer from "@/components/travel/article/Writer";
// 料理の印はサイトで1つ。島の小屋の札と同じ絵をそのまま使う
// （docs/island-world.md 4.2「同じ場所に絵を2つ作らない」）。
import { ArtStamp } from "@/components/streams/Art";

/**
 * **国の面（`/travel/<国>`）の型。歩き終わった国も、いま歩いている旅の国も、この1つで描く。**
 *
 * ## なぜ1つにしたか
 *
 * 前は2通りあった。歩き終わった国（`COUNTRIES`）は `[slug]` の面で「パスポート・行った街・あったこと・ごはん」、
 * 歩いている最中の国（`AHEAD_COUNTRIES`）は国ごとに手で書いた面で、ブルガリアは街のガイドの一覧だけ、
 * 北マケドニアは行く前の読みもの（どんな国か・ことば）だけだった。同じ「歩いた国」の段に並ぶのに、
 * 押すと別のものが出る。あやと（2026-11-18）:「イギリスみたいに。国名、いつ、配信の数と人数、行った街。
 * 『どんな国か』は要らない」。**型を1つにして、違うのは中身だけにする。**
 *
 * ## 歩いている最中の国の中身は、もう在る焼き込みから
 *
 * 新しい日付の置き場は作らない（滞在の表は #1275 で1つにする）。
 *
 * - いつ … 入った日は `AHEAD_COUNTRIES` の `entered`、出た日はつぎの国に入った前日（`walkingCountries()`）。
 *   つぎの国がまだ無ければ開いたまま——**日付では終わらない**（#1282。移る日は移るときに分かる）
 * - 配信の数と人数 … `content/countryStats.ts`（毎晩 BigQuery から焼かれる）
 * - 行った街 … 街のガイドの名簿（`content/travel.ts` の `CITIES`。実際に行った街だけが載る）
 * - 一言 … その国に入った日に動いていた旅（`content/chapters.ts`）の何カ国目か（`chapterCountries`）と、滞在の長さ
 *
 * - この国であったこと … その滞在の配信（`content/cityStreams.ts`。毎晩焼かれる）。押すとその配信へ飛ぶ
 *
 * 「この国であったこと」の見出しと一言（人が選んで書く見どころ）は、歩き終わって `COUNTRIES` へ移すときに書く。
 * それまでは**焼き込みの配信そのもの**を並べる（あやと 2026-11-18「配信へ飛ばすやつも残して。ブルガリアにも欲しい」）。
 * 前はここを空にしていたので、ソフィアの行がガイドのカードになったブルガリアでは、6回の配信がどこにも出ていなかった。
 * **歩き終わったあとも、ガイドのカードになった街の配信は見どころのあとに残す**（`walkedRecord`。2026-11-22 に
 * 北マケドニアとブルガリアを移したとき、見どころ6件だけにすると30本の配信がこの面から消えるところだった）。
 */

type Town = {
  name: string;
  /** その街からの配信。ガイドを持つ街ではカードが出るので、ここは描かない */
  streams: CityStream[];
  /** 公開してあるガイド。**公開前の印が付いた街は入らない**（印が外れた日にカードへ替わる） */
  guide?: TravelCity;
};

type Highlight = Country["highlights"][number];

type CountryRecord = {
  slug: string;
  name: string;
  /** 英字の国名。**歩いている最中の国は持たない**（無いものを埋めない） */
  en?: string;
  /**
   * その国に行った旅（本線も枝も。始まった順）。パスポートの下に札で出て、押すと旅の島へ。
   * **滞在から引く**（`content/stayChapters.ts` の `tripsOfCountry`）。前は国の地域（`region`）を字で出していて、
   * 旅の島へ行けるのは北欧の6か国（旅のしおりの部品）だけだった（#1355）
   */
  trips: { slug: string; name: string; href: string }[];
  /**
   * その国でやった伝説の企画。旅の札のとなりに札で出て、押すと企画の面へ。
   * 国の一言（`summary`）は場所の事実だけにしたので（M-20・M-21）、企画の話へはここから辿る
   * （`lib/projectsOf.ts`。札の段ぜんぶは W10 #1357）
   */
  projects: { slug: string; title: string; href: string }[];
  /** 面の一言の、字だけの形（題の下・検索の一文・名札） */
  summary: string;
  /** 面の一言。まだ続いている滞在は、長さを画面が出てから数え直す */
  headLead: React.ReactNode;
  stays: { from: string; to: string }[];
  towns: Town[];
  highlights: Highlight[];
  /**
   * 「この国であったこと」に並べる配信。**同じ配信を1つの面に2回出さない**——
   * 街の畳みに出ている配信と、見どころに出ている配信はここに入れない（ガイドのカードになった街の配信だけが来る）
   */
  stayStreams: CityStream[];
  /**
   * 「ここからの配信」の底。**いま歩いている旅の国だけ**——その滞在の配信は国の名前の欄に
   * 期間ぶん全部が焼かれている（`python/stays.py` の `chapter_stays()`）ので、実在する本数の下限になる。
   * 歩き終わった国の街の欄は題名で拾った代表なので、底には使わない（0）
   */
  streamFloor: number;
  /** スタンプに押す「◯カ国目」 */
  walkedNo?: number;
  /** 面に出る配信の、いちばん新しい日（名札の `dateModified`） */
  modified?: string;
  /** その国を回った旅（章）の名前。題の「〈旅〉で〈長さ〉」に使う */
  trip?: string;
};

/** 街の行。その国の公開してあるガイドと名前が合えば、ガイドへのカードになる */
const town = (country: string, name: string, streams: CityStream[]): Town => ({
  name,
  streams,
  guide: publicCities(country).find((t) => t.name === name),
});

/** 「11月12日」 */
const md = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const ymdJa = (d: string) => `${d.slice(0, 4)}年${md(d)}`;
/** 終わった滞在の日数。`StayLen` と同じく、入った日は0日目 */
const daysBetween = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));

/** その国に行った旅の札。島の道は `chapterHref` から（手で組まない） */
const tripTags = (slug: string) => tripsOfCountry(slug).map((t) => ({ slug: t.slug, name: t.name, href: chapterHref(t) }));

/** その国でやった伝説の企画の札 */
const projectTags = (slug: string) => legendsOfCountry(slug).map((l) => ({ slug: l.slug, title: l.title, href: `/legends/${l.slug}` }));

/** 題に入れる旅の名前。**本線の旅**（枝の旅「イランまで歩く」は題の「〜で〈長さ〉」に続かない）。2回入っていれば、あとの旅 */
const mainTrip = (slug: string) => tripsOfCountry(slug).filter((t) => !t.branchOf).at(-1)?.name;

/** 歩き終わった国（`COUNTRIES`）。一言も見どころも、人が書いたもの */
function walkedRecord(c: Country): CountryRecord {
  const ordered = [...COUNTRIES].sort((a, b) => a.order - b.order);
  /**
   * スタンプに押す「◯カ国目」。**初めてその国に入った順**（`/travel` の年表の番号と同じ）。
   * 国の表には国だけが居るので（M-17）、表の並び（`order`）の順番そのもの
   */
  const walkedNo = ordered.findIndex((x) => x.slug === c.slug) + 1;
  const towns = [...new Set(c.stays.flatMap((s) => s.cities))].map((name) => town(c.slug, name, streamsOfCity(c.slug, name)));
  /* **ガイドのカードになった街の配信は、見どころのあとに並べる。** 街の行がカードになると、その街の配信は
     街の畳みに出ない（`Town` の注）。歩いているあいだは「この国であったこと」に全部並んでいたので
     （あやと 2026-11-18「配信へ飛ばすやつも残して」）、歩き終わって見どころを書いた日に消すと、
     スコピエとソフィアの配信がこの面から辿れなくなる。人が選んだ回は見どころのほうに出ているので、2度出さない */
  const picked = new Set(c.highlights.flatMap((h) => (h.videoId ? [h.videoId] : [])));
  const stayStreams = towns.filter((t) => t.guide).flatMap((t) => t.streams).filter((v) => !picked.has(v.videoId));
  return {
    slug: c.slug,
    name: c.name,
    en: c.en,
    trips: tripTags(c.slug),
    projects: projectTags(c.slug),
    summary: c.summary,
    headLead: c.summary,
    stays: c.stays,
    towns,
    highlights: c.highlights,
    stayStreams,
    streamFloor: 0,
    walkedNo,
    modified: LASTMOD.country(c),
    trip: mainTrip(c.slug),
  };
}

/** いま歩いている旅の国（`AHEAD_COUNTRIES`）。記録はまだ書かれていないので、焼き込みから組む */
function walkingRecord(slug: string): CountryRecord | undefined {
  const rows = walkingCountries();
  const i = rows.findIndex((x) => x.slug === slug);
  if (i < 0) return undefined;
  const k = rows[i];
  /* 街は、街のガイドの名簿に載っている街（実際に行った街だけが載る）。公開前の街も、行ったことは事実なので並べる */
  const names = TRAVEL_CITIES.filter((t) => t.country === slug).map((t) => t.name);
  /* 配信は、滞在ひとつぶんが国の名前の欄に焼かれている（`python/stays.py` の `chapter_stays()`）。
     **街が1つのときだけ、その街に付ける**——「街が1つの滞在は、その期間の配信ぜんぶ」は
     `python/build_city_streams.py` が歩き終わった国にも使っている決まり。街が2つ以上なら、どちらの配信か言えない */
  const all = streamsOfCity(slug, k.name);
  const towns = names.map((n) => town(slug, n, names.length === 1 ? all : []));
  /* 街の畳みに配信が出ていれば（ガイドがまだ公開前の街）、そちらから辿れる。出ていなければ
     （街がガイドのカードになった・街が2つ以上で振り分けられない）、「この国であったこと」に並べる */
  const inTown = towns.some((t) => !t.guide && t.streams.length > 0);
  /* 旅の名前は、その国に入った日に動いていた章（`app/travel/page.tsx` の年表と同じ引き方） */
  const chapter = chapterNow(new Date(`${k.entered}T12:00:00+02:00`));
  const trip = chapter.name;
  /* その旅の何カ国目か。**島（章）が歩いた国を数える式と同じ1つ**（`content/walked.ts` の `chapterCountries`）。
     前は「〈旅〉のとちゅうに回った国」で、旅のどこに置かれた国かが言えていなかった（あやと 2026-11-19
     「北マケドニアのページは、滞在の説明とかない」）。押してあるスタンプは歩いた国ぜんぶの通し番号なので、
     ここは旅の名前を頭に付けて、どちらの数かを字で分ける */
  const nth = chapterCountries(chapter).findIndex((x) => x.slug === slug) + 1;
  const order = nth > 0 ? `${trip}の${nth}カ国目。` : `${trip}のとちゅうに${k.left ? "回った" : "回っている"}国。`;
  const where = names.length === 1 ? `${names[0]}に` : "";
  const summary = k.left
    ? `${order}${where}${stayWord(daysBetween(k.entered, k.left))}いた。`
    : `${order}${ymdJa(k.entered)}に入った。`;
  const headLead = k.left ? (
    summary
  ) : (
    <>
      {order}
      {where ? `${where}来て、` : "入って、"}
      <StayAbout slug={slug} from={k.entered} />。
    </>
  );
  return {
    slug,
    name: k.name,
    trips: tripTags(slug),
    projects: projectTags(slug),
    summary,
    headLead,
    stays: [{ from: k.entered, to: k.left }],
    towns,
    highlights: [],
    stayStreams: inTown ? [] : all,
    streamFloor: new Set(all.map((v) => v.videoId)).size,
    /* 年表（`/travel` の `TripList`）と同じ番号。歩き終わった国の数の続き */
    walkedNo: WALKED_DONE + i + 1,
    modified: all.map((v) => v.date).sort().at(-1),
    trip,
  };
}

/** 国の面の中身。**名簿（`content/travel.ts`）に面を持たない国は返さない** */
export function countryRecord(slug: string): CountryRecord | undefined {
  if (!travelPlace(slug)) return undefined;
  const c = countryBySlug(slug);
  return c ? walkedRecord(c) : walkingRecord(slug);
}

/** 道が固定の面（`app/travel/<国>/page.tsx`）から呼ぶ。在るはずの国が引けなければ書き出しを止める */
export function mustRecord(slug: string): CountryRecord {
  const r = countryRecord(slug);
  if (!r) throw new Error(`app/travel/record.tsx: ${slug} の国の面が組めない（名簿・歩いた国・歩いている国のどれにも無い）`);
  return r;
}

/** その国での配信の本数。**面に並べた配信より少ない数を言わない**（下の `CountryRecordPage` の札と、題の一文で同じ数） */
function livesOf(r: CountryRecord): number {
  const stat = countryStat(r.slug);
  return Math.max(stat?.lives ?? r.towns.reduce((n, t) => n + t.streams.length, 0), r.streamFloor);
}

/**
 * いた日数（面の札「いた日数」と同じ数えかた）と、まだ続いている滞在か。
 *
 * **まだ続いている滞在（いま居る国）の長さは、題と一文に入れない。** 題と一文は `<head>` の字で、画面が出てから
 * 数え直せない。書き出した日の「1週間」は、次の配りまで（配りが止まればいつまでも）そのまま残り、日ごとに嘘になる
 * （`tools/sprites/datebake.mjs` が、時計を進めた書き出しと突き合わせて赤くした。「1週間」→「1年」・【2026年】→【2026〜2027年】）。
 * 画面の札は `./parts.tsx` の `StayLen` が数え直している
 */
function stayDays(r: CountryRecord): { days: number; open: boolean } {
  return { days: closedDays(r.stays), open: r.stays.some((s) => !s.to) };
}

/** 題の「長さ」。1週間に届かなければ日で、それより長ければ週・月・年で丸める（ジョージアの384日は「1年」） */
function lenWord(days: number): string {
  if (days < 7) return `${Math.max(1, days)}日`;
  if (days <= 10) return "1週間";
  if (days <= 17) return "2週間";
  if (days <= 27) return "3週間";
  if (days <= 45) return "1か月";
  if (days <= 330) return `${Math.round(days / 30)}か月`;
  return `${Math.round(days / 365)}年`;
}

const clen = (s: string) => [...s].length;
/** 「｜あやと島」（`app/layout.tsx` の `title.template`） */
const SUFFIX = 6;
/** 題は「｜あやと島」込みで 25〜45字（`python/seo_score.py` の採点表。上位の題の中央は 33〜54字。`docs/seo.md` 6・7章） */
const TITLE_MAX = 45;
/** 一文は 80〜160字（同じ採点表） */
const DESC_MIN = 80;
const DESC_MAX = 160;

/**
 * 題と一文。**頭は国名のまま**（「ブルガリア」で探す人の語を前半に）。
 *
 * - 題: 「〈国〉旅行記【〈年〉】〈旅〉で〈長さ〉・〈街〉」。例「イギリス旅行記【2025年】ヨーロッパ周遊で2か月・ロンドン・エディンバラ」。
 *   いま居る国は長さを言わない（「ブルガリア旅行記【2026年】バルカン諸国周遊・ソフィア」。`stayDays` の注）。
 *   はみ出すなら後ろの街から落とす。前は「〈国〉旅の記録 — 〈街〉」で21字しかなく、何の面か（いつ・どの旅の・どれだけ）が言えていなかった（#1262）
 * - 一文: いつ・何日（いま居る国は「〈入った日〉から」だけ）・どの街を・配信の本数と人数（面の札と同じ数）・面の一言。
 *   80〜160字に収まるように後ろから落とす
 *
 * **足すのは面に見えている事実だけ**（`lib/seoText.ts` の決めごと）。画面に見える見出しは変えない（`<head>` の字だけ）
 */
export function recordMetadata(r: CountryRecord): Metadata {
  const cities = r.towns.map((t) => t.name);
  const first = r.stays[0];
  const last = r.stays[r.stays.length - 1];
  const { days, open } = stayDays(r);
  /* いま居る国は、長さを言わない（`stayDays` の注）。年も入った年だけ（終わりの年は、まだ決まっていない） */
  const len = open ? "" : lenWord(days);
  const y0 = first?.from.slice(0, 4);
  const y1 = open ? y0 : last?.to.slice(0, 4);
  const yr = first ? (y0 === y1 ? `${y0}年` : `${y0}〜${y1}年`) : "";
  /* 「イランまで歩く」は「〜で」が続かないので「イランまで歩いた〈長さ〉」 */
  const tripLen = !r.trip ? len : !len ? r.trip : /歩く$/.test(r.trip) ? `${r.trip.replace(/歩く$/, "歩いた")}${len}` : `${r.trip}で${len}`;
  const head = `${r.name}旅行記${yr ? `【${yr}】` : ""}${tripLen}`;
  const titles = [...cities.map((_, i) => `${head}・${cities.slice(0, cities.length - i).join("・")}`), head, `${r.name}旅行記${yr ? `【${yr}】` : ""}${len}`];
  const title = titles.find((t) => clen(t) + SUFFIX <= TITLE_MAX) ?? titles[titles.length - 1];

  const stat = countryStat(r.slug);
  const when = !first
    ? ""
    : open
      ? `${ymdJa(first.from)}から`
      : r.stays.length === 1
        ? first.from === last.to
          ? `${ymdJa(first.from)}の1日`
          : `${ymdJa(first.from)}〜${first.from.slice(0, 4) === last.to.slice(0, 4) ? md(last.to) : ymdJa(last.to)}の${days.toLocaleString()}日間`
        : `${span(first.from, last.to)}に${r.stays.length}回、あわせて${days.toLocaleString()}日`;
  const nums = [
    `ここからの配信${livesOf(r).toLocaleString()}本`,
    stat?.people ? `来ていた人${stat.people.toLocaleString()}人` : "",
    stat?.msgs ? `飛んだコメント${stat.msgs.toLocaleString()}件` : "",
  ].filter(Boolean);
  /* 一文の終わりは、その面に在る節の一言。ガイドしか無い国に「配信のアーカイブつき」と書かない */
  const tail = r.towns.some((t) => !t.guide && t.streams.length) ? "街ごとの配信のアーカイブつき。" : r.towns.some((t) => t.guide) ? "街のガイドつき。" : "";
  const body = (towns: string[], withNums: string[]) =>
    `${when ? `${when}、` : ""}${r.name}${towns.length ? `の${towns.join("・")}` : ""}を配信しながら${open ? "歩いている" : "歩いた"}旅行記。${withNums.length ? `${withNums.join("・")}。` : ""}`;
  /* 面の一言が、頭の「いつ」と同じ日を言い直しているとき（いま歩いている国の「〈日〉に入った。」）は、先に落とす */
  const says = (x: string) => !!first && x.includes(ymdJa(first.from));
  const sum = says(r.summary) ? "" : r.summary;
  /* 長い順に並べて、80〜160字に収まる最初のもの（一言 → 終わりの一言 → 街の数 → 数の札、の順に落とす） */
  const descs = [
    `${body(cities, nums)}${sum}${tail}`,
    `${body(cities, nums)}${sum}`,
    `${body(cities, nums)}${tail}`,
    ...cities.slice(1).map((_, i) => `${body(cities.slice(0, cities.length - 1 - i), nums)}${tail}`),
    `${body(cities, nums)}${r.summary}${tail}`,
    body(cities.slice(0, 1), nums.slice(0, 2)),
  ];
  const fits = (d: string) => clen(d) >= DESC_MIN && clen(d) <= DESC_MAX;
  const description = descs.find(fits) ?? descs.find((d) => clen(d) <= DESC_MAX) ?? descs[descs.length - 1];
  return travelShare(r.slug, { title, description });
}

const fmt = (d: string) => (d ? d.replace(/-/g, "/") : "いま");

/** この面に出す料理の数。これより多い国は、のこりを「作った料理」へ渡す。 */
const DISHES = 8;

/** 終わった滞在の日数。まだ続いている滞在はここに入れない（画面側で数え直す）。 */
function closedDays(stays: { from: string; to: string }[]) {
  const day = 86400000;
  return stays
    .filter((s) => s.to)
    .reduce((n, s) => n + Math.max(1, Math.round((new Date(s.to).getTime() - new Date(s.from).getTime()) / day)), 0);
}

/**
 * 配信の小さな絵の説明（「2026年10月の北マケドニアの配信: <題>」）。#1262・#332。
 *
 * 前は空で、国の面は main の絵が**ぜんぶ** alt 空になり、検索の機械から見ると「何の絵も名乗らない面」だった
 * （`seo_audit.py` の `img-main-blank`。#1293 でこの型にそろえた北マケドニアで 58 → 59 に増えた）。
 * 題は YouTube に実在するもの（焼き込みの `cityStreams.ts`）をそのまま。年月は配信の日から
 */
const thumbAlt = (country: string, date: string | undefined, title: string) => {
  const m = date?.match(/^(\d{4})-(\d{2})/);
  return `${m ? `${m[1]}年${Number(m[2])}月の` : ""}${country}の配信: ${title}`;
};

/**
 * 国ひとつの面。
 *
 * 上から順に「どこにいたか（地図）・いつ・配信の数 → 行った街 → 何があったか → 作ったごはん」。
 * 出来事は畳んでおいて、見出しだけを並べる。開くと本文と配信が出る。
 * 縦に長い読み物にすると、どの国も同じ壁に見えてしまう。
 *
 * **中身の無い節は出さない。** 料理をしていない国には「作ったごはん」が無い。空の見出しだけを置かない。
 */
export function CountryRecordPage({ r, children }: { r: CountryRecord; children?: React.ReactNode }) {
  /* 前後の国は、面を持つ国だけで並べる（歩いた順 → いま歩いている旅の国）。面の無い国へ送ると行き止まり */
  const seq = [
    ...[...COUNTRIES].sort((a, b) => a.order - b.order).map((c) => ({ slug: c.slug, name: c.name })),
    ...walkingCountries().map((c) => ({ slug: c.slug, name: c.name })),
  ].filter((c) => travelPlace(c.slug));
  const idx = seq.findIndex((x) => x.slug === r.slug);
  const prev = seq[idx - 1];
  const next = seq[idx + 1];
  const cooked = RECIPES.filter((x) => x.country === r.slug);
  /* 行った街の記事（`/travel/<国>/<街>/<話>`）。題の頭（「ソフィアの物価【…】」）を札の字に、残りを添え書きに */
  const articles = publicArticles(r.slug).map((a) => {
    const x = articleOf(a.country, a.city, a.slug);
    return { city: a.city, href: a.href, title: x.h1[0], note: x.h1.slice(1).join(""), icon: x.answer.icon };
  });
  /* 記事は、その街の札の下にまとめる。**「行った街」に街と同じ並びで出さない**——
     あやと（2026-11-20）「これは行った街ではない。流れがおかしい」（docs/island-misses.md #340）。
     街の札に付かない記事（街のガイドを持たない街の記事）だけ、並びの下に残す */
  const guided = new Set(r.towns.flatMap((t) => (t.guide ? [t.guide.slug] : [])));
  const loose = articles.filter((a) => !guided.has(a.city));
  /* 「この国であったこと」は、初めは数本だけ。歩いている国は配信がそのまま並ぶので、北マケドニアで35本になった。
     残りは畳みの中に置く（字は面に残すので、ページ内検索と読み上げには届く。畳んだ中の絵は、開くまで取りに行かれない） */
  const HAPPENED_FIRST = 5;
  /**
   * その国での数（`content/countryStats.ts`）。
   *
   * 前は `cityStreams` の本数を足していたが、あれは**街ごとの代表**なので
   * ジョージアが「ここからの配信 6本」と出ていた。実物は 378本。
   * いちばん長くいた国を、6日いた国と同じ大きさに見せていた。
   */
  const stat = countryStat(r.slug);
  /* **面に並べた配信より少ない数を言わない。** `countryStats` の本数は「コメントが1件でも付いた配信」を
     数えている（チャットから数えるため）。ブルガリアに着いた日の配信（2026-11-12）はコメントが0件で、
     面には7本並ぶのに「ここからの配信 6」と出ていた。滞在ぶんの配信の本数（`streamFloor`）で底を打つ。
     歩き終わった国は街の欄が代表なので、前どおり `countryStats` だけ（無ければ街の欄の足し算）。
     **式は `livesOf` の1つ**（題の一文も同じ数を言う） */
  const lives = livesOf(r);
  /* 出国の日が入っていない滞在。書き出した日で数字が止まるので画面が出てから数え直すが、
     **次の島へ渡っていれば、そこで止める**（`./parts.tsx` の `StayLen`）。
     でないと、もう出た国の日数が毎日1ずつ増えつづける。 */
  const staying = r.stays.find((s) => !s.to);
  const days = closedDays(r.stays);
  const art = countryMapArt(r.slug, r.name);

  /* 同じ日に同じ題名が2本あるぶんだけ、「その日の何本目か」を控える。
     読み上げはリンクの字だけを並べて読むので、日付も題名も同じ2枚は
     1文字も違わずに読まれる（エジプトは 2025-05-10 の1つの題名で6本）。
     題名は YouTube に実在するものなので直せない
     （`docs/island-design.md` 1章の唯一の例外）。
     **ぶつかっていない配信には何も足さない**——どれにも「1本目」が付くと、
     読み上げがうるさいだけで見分けの役に立たない。
     数えるのは**この面に出る全部**（街の畳みと、出来事の畳みをまたぐ）。
     街ごとに数えると、別の街に同じ回が出ている国で取りこぼす
     （`app/island/[chapter]/streams/page.tsx` と同じ形）。 */
  const sameDay = new Map<string, string[]>();
  const seen = (date: string | undefined, videoId: string, title: string) => {
    const key = `${date ?? ""}\u0000${title}`;
    const ids = sameDay.get(key) ?? [];
    if (!ids.includes(videoId)) sameDay.set(key, [...ids, videoId]);
  };
  for (const t of r.towns) if (!t.guide) for (const v of t.streams) seen(v.date, v.videoId, v.title);
  for (const h of r.highlights) if (h.videoId) seen(h.date, h.videoId, h.title);
  for (const v of r.stayStreams) seen(v.date, v.videoId, v.title);
  const nthOf = (date: string | undefined, videoId: string, title: string) => {
    const ids = sameDay.get(`${date ?? ""}\u0000${title}`);
    return ids && ids.length > 1 ? ids.indexOf(videoId) + 1 : undefined;
  };

  return (
    <PageShell crumbs={travelCrumbs(r.name)}>
      {/* 歩いた記録の名札（#1262）。日付は面に並ぶ滞在のはじまりと、面に出る配信のいちばん新しい日（sitemap と同じ） */}
      {r.stays[0] && (
        <JsonLd
          data={articleLd({
            path: travelHref(r.slug),
            headline: r.name,
            description: r.summary,
            datePublished: r.stays[0].from,
            dateModified: r.modified,
          })}
        />
      )}
      {/* 国の地図の絵（`components/atlas/mapArt.ts` が焼いた1枚）の名札。画像検索に「〈国〉の地図」として渡す（#1262・#332）。
          地図の形は Natural Earth（パブリックドメイン）から島が描いたもの */}
      {art && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ImageObject",
            /* 道に日本語が入る（「〈国〉の地図」）。機械に渡す URL は %XX にしておく */
            contentUrl: encodeURI(abs(art.src)),
            url: encodeURI(abs(art.src)),
            name: `${r.name}の地図`,
            caption: art.alt,
            width: art.w,
            height: art.h,
            encodingFormat: "image/webp",
            inLanguage: "ja",
            contentLocation: { "@type": "Place", name: r.name },
            mainEntityOfPage: abs(travelHref(r.slug)),
            creditText: SITE.name,
            creator: { "@type": "Organization", name: SITE.name, url: abs("/") },
            copyrightNotice: "地図のデータ Natural Earth",
          }}
        />
      )}
      {/* 旗はすぐ下のパスポートに出る。見出しにも置くと同じ絵が2つ並ぶので、
          ここは名前と1行だけにする（docs/island-world.md 7.6 の前置きを短く）。 */}
      <PageHead title={r.name} lead={r.headLead} />

      {/* パスポートの1ページ。国の地図・入国のスタンプ・入出国の日付・数字を、
          1枚の紙に罫で割って収める（docs/ac-reference.md 7章）。
          どの国も同じ型で並ぶので、国ごとの違いが中身だけになる。

          **主役は地図ひとつ。** 本物の図鑑の面は、絵が縦の半分以上を占めていて、
          そのまわりに何も載っていない（ac-reference 7章 4）。
          いま歩いている旅の国の地図には線を引かない（あやと 2026-11-18「その国がヨーロッパの
          どのあたりかが分かれば良い。ルートは出さなくていい」。`python/build_world_route.py` の `WALKING`）。

          旗を大きくして主役にするのは試して、やめた。`Flag` は 20〜30px で
          読めるように角丸と縁の線を決めてあるので、186px にすると
          角丸が幅の1割、縁が 7px の灰色の帯になって、旗に見えない。

          日本語の国名はここには出さない。すぐ上の h1 が国名なので、
          同じ字が2回続く。ここに残すのはローマ字名と地方だけ。 */}
      <Panel className="apass">
        <div className="apass-top">
          <CountryMap slug={r.slug} name={r.name} />
          {/* スタンプは地図の右上に押す。紙に押した印なので、少し傾ける。 */}
          {r.walkedNo && (
            <span className="apass-stamp" aria-hidden>
              <b>{r.walkedNo}</b>
              <i>カ国目</i>
            </span>
          )}
        </div>

        <p className="apass-who">
          <span className="apass-flag">
            <Flag slug={r.slug} size={30} />
          </span>
          {r.en && <em>{r.en}</em>}
        </p>

        {/* どの旅で行ったか。押すと、その旅の島へ（2つの旅に入った国は2枚）。
            字は旅の名前だけ（「〈旅〉で行った」と説明を足さない。札の並びで読める） */}
        {(r.trips.length > 0 || r.projects.length > 0) && (
          <p className="apass-trips">
            {r.trips.map((t) => (
              <Link key={t.slug} className="chip" href={t.href} prefetch={false}>
                <Icon name="island" size={20} />
                {t.name}
              </Link>
            ))}
            {/* ここでやった伝説の企画。絵は丘（伝説の企画の建物）の印 */}
            {r.projects.map((pj) => (
              <Link key={pj.slug} className="chip" href={pj.href} prefetch={false}>
                <Icon name="hill" size={20} />
                {pj.title}
              </Link>
            ))}
          </p>
        )}

        <dl className="apass-log">
          {r.stays.map((st, i) => (
            <div key={i}>
              <dt>入国</dt>
              <dd>{fmt(st.from)}</dd>
              <dt>出国</dt>
              {/* 出国の欄が空いているのは「まだいる」とは限らない。
                  次の島へ渡った日で閉じる（`./parts.tsx`） */}
              <dd>{st.to ? fmt(st.to) : <StayOut slug={r.slug} />}</dd>
            </div>
          ))}
        </dl>

        <div className="apass-num">
          <div>
            <b>
              {staying ? <StayLen slug={r.slug} from={staying.from} plus={days} /> : days.toLocaleString()}
            </b>
            <span>いた日数</span>
          </div>
          {/* 街の分からない国で「0」と出さない（0件になりうる数を札に入れない） */}
          {r.towns.length > 0 && (
            <div>
              <b>{r.towns.length}</b>
              <span>回った街</span>
            </div>
          )}
          <div>
            <b>{lives.toLocaleString()}</b>
            <span>ここからの配信</span>
          </div>
          {/* のべではなく、その国にいたあいだに来ていた人。同じ人を何日ぶんも数えない
              （`.claude/skills/monthly-review/SKILL.md` 3章）。個人別は出さない。 */}
          {!!stat?.people && (
            <div>
              <b>{stat.people.toLocaleString()}</b>
              <span>来ていた人</span>
            </div>
          )}
          {!!stat?.msgs && (
            <div>
              <b>{stat.msgs.toLocaleString()}</b>
              <span>飛んだコメント</span>
            </div>
          )}
        </div>
      </Panel>

      {/* 「いちばん人が集まった日」は置かない（あやと 2026-11-18「要らない」）。
          人が集まった配信は、数字（来ていた人）と、下の街の配信・この国であったことから辿れる */}

      {r.towns.length > 0 && (
        <Panel>
          <h2>行った街</h2>
          <div className="cities">
            {r.towns.map((t) => {
              /* 街のガイドを持つ街は、ガイドへ送る（あやと 2026-11-18「ソフィアはガイドへ飛ぶ」）。
                 公開前の印が付いた街は、印が外れた日にここがカードへ替わる */
              if (t.guide) {
                const mine = articles.filter((a) => a.city === t.guide?.slug);
                return (
                  <div key={t.name} className="city-set">
                    <CityCard city={t.guide} />
                    {/* この街の記事（行ったところ・物価）。街の札の下に畳んでぶら下げる。開くまで1行 */}
                    {mine.length > 0 && (
                      <details className="city city-arts">
                        <summary className="city-head">
                          <b>{t.name}の記事</b>
                          <i>{mine.length}本</i>
                        </summary>
                        <div className="city-arts-list">
                          {mine.map((a) => (
                            <Link key={a.href} prefetch={false} className="tile" href={a.href}>
                              <Icon name={a.icon} size={32} className="tile-icon" />
                              <span className="tile-text">
                                <b>{a.title}</b>
                                <i>{a.note}</i>
                              </span>
                              <Icon name="right" size={16} className="tile-go" />
                            </Link>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              }
              if (!t.streams.length) {
                return (
                  <div key={t.name} className="city is-quiet">
                    <span className="city-head">
                      <b>{t.name}</b>
                      <i>配信はのこっていない</i>
                    </span>
                  </div>
                );
              }
              return (
                <details key={t.name} className="city">
                  <summary className="city-head">
                    <b>{t.name}</b>
                    <i>{t.streams.length}本の配信</i>
                  </summary>
                  <div className="scards">
                    {t.streams.map((v) => (
                      <StreamCard
                        key={v.videoId}
                        videoId={v.videoId}
                        title={v.title}
                        date={v.date}
                        nth={nthOf(v.date, v.videoId, v.title)}
                        alt={thumbAlt(r.name, v.date, v.title)}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          {/* 街の札に付かない記事だけ。公開前の印が付いた記事は出さない——印を外した日に、ここにもひとりでに出る */}
          {loose.map((a) => (
            <Link key={a.href} prefetch={false} className="tile" href={a.href} style={{ marginTop: 12 }}>
              <Icon name={a.icon} size={32} className="tile-icon" />
              <span className="tile-text">
                <b>{a.title}</b>
                <i>{a.note}</i>
              </span>
              <Icon name="right" size={16} className="tile-go" />
            </Link>
          ))}
        </Panel>
      )}

      {(r.highlights.length > 0 || r.stayStreams.length > 0) && (
        <Panel>
          <h2>この国であったこと</h2>
          {(() => {
            /* いま歩いている旅の国は、配信そのもの。畳みの形は人が書いた見どころと同じにして、
               歩き終わって見どころが書かれた日に、見た目を変えずに中身だけが替わるようにする。
               題名は YouTube に実在するもの（絵文字も含めて引用。`data-quote`）。
               **両方あるときは見どころが先**（人が選んだ回が、畳まずに見える5本に入る）。開いておくのは頭の1つだけ */
            const nodes = [
              ...r.highlights.map((h, i) => (
                <Fold key={h.title} title={h.title} note={h.date ? fmt(h.date) : undefined} open={i === 0}>
                  <p>{h.note}</p>
                  {h.videoId && (
                    <div className="scards">
                      <StreamCard
                        videoId={h.videoId}
                        title={h.title}
                        date={h.date}
                        nth={nthOf(h.date, h.videoId, h.title)}
                        alt={thumbAlt(r.name, h.date, h.title)}
                      />
                    </div>
                  )}
                </Fold>
              )),
              ...r.stayStreams.map((v, i) => (
                <Fold
                  key={v.videoId}
                  title={<span data-quote="title">{v.title}</span>}
                  note={fmt(v.date)}
                  open={i === 0 && r.highlights.length === 0}
                >
                  {/* その回に何があったかの1〜2行。人が書く見どころの代わりに、議事録の「ひとことで」から焼いたもの
                      （`content/streamDigest.ts`。#1262 で本文が166字しか無かった）。議事録の無い回はカードだけ */}
                  {STREAM_DIGEST[v.videoId] && <p>{STREAM_DIGEST[v.videoId]}</p>}
                  <div className="scards">
                    {/* 絵の説明は街の畳み・見どころと同じ（`thumbAlt`。#1296）。ここだけ空だったので、街の畳みから
                        この節へ配信が移る国（街のガイドを公開した北マケドニア）で、名乗らない絵が35枚増えるところだった */}
                    <StreamCard
                      videoId={v.videoId}
                      title={v.title}
                      date={v.date}
                      nth={nthOf(v.date, v.videoId, v.title)}
                      alt={thumbAlt(r.name, v.date, v.title)}
                    />
                  </div>
                </Fold>
              )),
            ];
            /* 残りが1つだけなら畳まない（畳みの押しどころのほうが場所を取る） */
            const cut = nodes.length > HAPPENED_FIRST + 1 ? HAPPENED_FIRST : nodes.length;
            return (
              <>
                <div className="hlist">{nodes.slice(0, cut)}</div>
                {cut < nodes.length && (
                  <details className="hmore">
                    <summary className="longer">
                      <span className="hmore-open">
                        あと{nodes.length - cut}
                        {r.stayStreams.length ? "本" : "件"}だす
                      </span>
                      <span className="hmore-close">たたむ</span>
                      <Icon name="chevron" size={14} />
                    </summary>
                    <div className="hlist">{nodes.slice(cut)}</div>
                  </details>
                )}
              </>
            );
          })()}
        </Panel>
      )}

      {cooked.length > 0 && (
        <Panel>
          <h2>この国で作ったごはん</h2>
          {/* 押せる札は 48px＋厚み6px なので、1品で1行 48px 使う。
              ジョージアは25品あって、これだけで 1,224px（1.5画面）あった。
              ここは料理の本体ではなく「この国で何を作ったか」を言う場所なので、
              8品まで出して、その先は「作った料理」に渡す。 */}
          <div className="chips">
            {cooked.slice(0, DISHES).map((x) => (
              <Link key={x.slug} className="chip" href={`/kitchen/${x.slug}`} prefetch={false}>
                <img className="mini-icon" src={`/sprites/${x.icon}.webp`} alt="" />
                {x.name}
              </Link>
            ))}
          </div>
          {cooked.length > DISHES && (
            <Link prefetch={false} className="tile" href="/kitchen" style={{ marginTop: 12 }}>
              <ArtStamp size={44} className="tile-icon" />
              <span className="tile-text">
                <b>のこりの{cooked.length - DISHES}品も見る</b>
                <i>作った料理のスタンプ帳に、{r.name}の{cooked.length}品ぜんぶ</i>
              </span>
              <Icon name="right" size={16} className="tile-go" />
            </Link>
          )}
        </Panel>
      )}

      {/* 行く前に調べたこと。**北欧の6か国だけ**、前は別の面（`/nordic/<国>`）に立っていた。
          同じ国が2枚に割れて、互いにリンクも無かったので、歩いた記録の下へ寄せた（#1201）。
          部品は向こうの面のものをそのまま並べている（`components/nordic/CountryGuide.tsx`） */}
      {nordicCountry(r.slug) && <CountryGuide slug={r.slug} />}

      {/* その国だけが持つもの（北マケドニアの付箋の板）。型の外にあるので、面のほうから渡す */}
      {children}

      {/* 書き手の枠（記事・街のガイドと同じ `Writer`）。署名は「あやと島案内鳥」。検索の上位の 7割が書き手を見せていて、
          国の面には無かった（#1262 の採点表）。**面のいちばん下に置く**——上の並び（国名・一言・地図・いつ・数・行った街・
          この国であったこと・ごはん）は変えない */}
      <Writer />

      <nav className="pager">
        {prev ? (
          <Link href={travelHref(prev.slug)} prefetch={false}>
            <Icon name="right" size={13} className="is-flip" />
            <Flag slug={prev.slug} size={20} />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={travelHref(next.slug)} prefetch={false}>
            <Flag slug={next.slug} size={20} />
            {next.name}
            <Icon name="right" size={13} />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageShell>
  );
}
