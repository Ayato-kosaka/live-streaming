import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { COUNTRIES, countryBySlug, isWalkedCountry, type Country } from "@/content/countries";
import { WALKED_DONE, walkingCountries } from "@/content/walked";
import { chapterNow } from "@/content/chapters";
import { RECIPES } from "@/content/recipes";
import { streamsOfCity, type CityStream } from "@/content/cityStreams";
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
  publicCities,
  travelCrumbs,
  travelHref,
  travelPlace,
  travelShare,
  type TravelCity,
} from "@/content/travel";
import { stayWord } from "@/lib/stay";
import { fitTitle, lead, span } from "@/lib/seoText";
import { JsonLd, articleLd } from "@/lib/jsonld";
import { LASTMOD } from "@/lib/lastmod";
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
 * - 一言 … その国に入った日に動いていた旅（`content/chapters.ts`）と、滞在の長さ
 *
 * - この国であったこと … その滞在の配信（`content/cityStreams.ts`。毎晩焼かれる）。押すとその配信へ飛ぶ
 *
 * 「この国であったこと」の見出しと一言（人が選んで書く見どころ）は、歩き終わって `COUNTRIES` へ移すときに書く。
 * それまでは**焼き込みの配信そのもの**を並べる（あやと 2026-11-18「配信へ飛ばすやつも残して。ブルガリアにも欲しい」）。
 * 前はここを空にしていたので、ソフィアの行がガイドのカードになったブルガリアでは、6回の配信がどこにも出ていなかった。
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
  /** 英字の国名・地方。**歩いている最中の国は持たない**（無いものを埋めない） */
  en?: string;
  region?: string;
  /** 面の一言の、字だけの形（題の下・検索の一文・名札） */
  summary: string;
  /** 面の一言。まだ続いている滞在は、長さを画面が出てから数え直す */
  headLead: React.ReactNode;
  stays: { from: string; to: string }[];
  towns: Town[];
  highlights: Highlight[];
  /**
   * 「この国であったこと」に並べる配信（いま歩いている旅の国だけ）。**同じ配信を1つの面に2回出さない**——
   * 街の畳みに出ている配信はここに入れない（ガイドのカードになった街の配信だけが来る）
   */
  stayStreams: CityStream[];
  /**
   * 「ここからの配信」の底。**いま歩いている旅の国だけ**——その滞在の配信は国の名前の欄に
   * 期間ぶん全部が焼かれている（`python/stays.py` の `chapter_stays()`）ので、実在する本数の下限になる。
   * 歩き終わった国の街の欄は題名で拾った代表なので、底には使わない（0）
   */
  streamFloor: number;
  /** スタンプに押す「◯カ国目」。国でない区間（`iran-border`）は無し */
  walkedNo?: number;
  /** 面に出る配信の、いちばん新しい日（名札の `dateModified`） */
  modified?: string;
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

/** 歩き終わった国（`COUNTRIES`）。一言も見どころも、人が書いたもの */
function walkedRecord(c: Country): CountryRecord {
  const ordered = [...COUNTRIES].sort((a, b) => a.order - b.order);
  /**
   * スタンプに押す「◯カ国目」。**`order` ではなく、国だけを数え直した番号。**
   *
   * `order` は表の並び順で、国境までしか行っていない区間（`iran-border`）にも
   * 1つ振ってある。`/travel` の年表は前からそこを避けて数え直していて
   * （`app/travel/page.tsx` の `noOf`）、この面だけが `order` を生で押していた。
   * 同じ面のことを、年表と札が別の数で言うのがいちばん悪い。
   */
  const walkedNo = ordered.filter((x) => isWalkedCountry(x.slug)).findIndex((x) => x.slug === c.slug) + 1;
  return {
    slug: c.slug,
    name: c.name,
    en: c.en,
    region: c.region,
    summary: c.summary,
    headLead: c.summary,
    stays: c.stays,
    towns: [...new Set(c.stays.flatMap((s) => s.cities))].map((name) => town(c.slug, name, streamsOfCity(c.slug, name))),
    highlights: c.highlights,
    stayStreams: [],
    streamFloor: 0,
    walkedNo: isWalkedCountry(c.slug) ? walkedNo : undefined,
    modified: LASTMOD.country(c),
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
  const trip = chapterNow(new Date(`${k.entered}T12:00:00+02:00`)).name;
  const where = names.length === 1 ? `${names[0]}に` : "";
  const summary = k.left
    ? `${trip}のとちゅうに回った国。${where}${stayWord(daysBetween(k.entered, k.left))}いた。`
    : `${trip}のとちゅうに回っている国。${ymdJa(k.entered)}に入った。`;
  const headLead = k.left ? (
    summary
  ) : (
    <>
      {trip}のとちゅうに回っている国。{where ? `${where}来て、` : "入って、"}
      <StayAbout slug={slug} from={k.entered} />。
    </>
  );
  return {
    slug,
    name: k.name,
    summary,
    headLead,
    stays: [{ from: k.entered, to: k.left }],
    towns,
    highlights: [],
    stayStreams: inTown ? [] : all,
    streamFloor: new Set(all.map((v) => v.videoId)).size,
    /* 年表（`/travel` の `TripCountries`）と同じ番号。歩き終わった国の数の続き */
    walkedNo: WALKED_DONE + i + 1,
    modified: all.map((v) => v.date).sort().at(-1),
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

/** 題と一文。**題は「国＋旅の記録＋歩いた街」、一文の頭は「いつ・どの街を」。** 面に並ぶ滞在と同じ事実（#1199 の第2便） */
export function recordMetadata(r: CountryRecord): Metadata {
  /* 北欧の6か国は、前は行く前の案内（`/nordic/<国>`）が別の題と一文を持っていた。
     2枚を1枚に寄せたので、題と一文は歩いた記録のほうに揃える（#1201）。街が多い国は、32字に収まるところまで減らす */
  const cities = r.towns.map((t) => t.name);
  const first = r.stays[0];
  const last = r.stays[r.stays.length - 1];
  const head = `${r.name}旅の記録`;
  const walked = cities.length ? `${cities.join("・")}を配信しながら歩いた。` : `${r.name}を配信しながら歩いた。`;
  /* 一文の終わりは、その面に在る節の一言。ガイドしか無い国に「配信のアーカイブつき」と書かない */
  const tail = r.towns.some((t) => !t.guide && t.streams.length) ? "街ごとの配信のアーカイブつき。" : r.towns.some((t) => t.guide) ? "街のガイドつき。" : "";
  return travelShare(r.slug, {
    title: cities.length ? fitTitle(...[3, 2, 1].map((k) => `${head} — ${cities.slice(0, k).join("・")}`), head) : fitTitle(head),
    description: first ? lead(`${span(first.from, last.to || undefined)}、${walked}`, r.summary, tail) : r.summary,
  });
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
     歩き終わった国は街の欄が代表なので、前どおり `countryStats` だけ（無ければ街の欄の足し算） */
  const lives = Math.max(stat?.lives ?? r.towns.reduce((n, t) => n + t.streams.length, 0), r.streamFloor);
  /* 出国の日が入っていない滞在。書き出した日で数字が止まるので画面が出てから数え直すが、
     **次の島へ渡っていれば、そこで止める**（`./parts.tsx` の `StayLen`）。
     でないと、もう出た国の日数が毎日1ずつ増えつづける。 */
  const staying = r.stays.find((s) => !s.to);
  const days = closedDays(r.stays);
  const isCountry = isWalkedCountry(r.slug);

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
          {/* スタンプは地図の右上に押す。紙に押した印なので、少し傾ける。

              **国でない面には押さない。** 「イラン（国境まで）」は国境まで
              歩いた区間で、入国していない（`content/walked.ts` の
              `isWalkedCountry`）。**数えないと決めたものに順番を振ると、
              押した印だけが別の数を言う。** */}
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
          {r.region && <i>{r.region}</i>}
        </p>

        {/* **国でない面では「入国／出国」と書かない。** 「イラン（国境まで）」は
            国境まで歩いた区間で、入国していない。
            **1か所を直したら、同じことを別の言い方で言っている場所を探す。** */}
        <dl className="apass-log">
          {r.stays.map((st, i) => (
            <div key={i}>
              <dt>{isCountry ? "入国" : "はじまり"}</dt>
              <dd>{fmt(st.from)}</dd>
              <dt>{isCountry ? "出国" : "おわり"}</dt>
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
              if (t.guide) return <CityCard key={t.name} city={t.guide} />;
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
                      />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </Panel>
      )}

      {(r.highlights.length > 0 || r.stayStreams.length > 0) && (
        <Panel>
          <h2>この国であったこと</h2>
          <div className="hlist">
            {/* いま歩いている旅の国は、配信そのもの。畳みの形は人が書いた見どころと同じにして、
                歩き終わって見どころが書かれた日に、見た目を変えずに中身だけが替わるようにする。
                題名は YouTube に実在するもの（絵文字も含めて引用。`data-quote`） */}
            {r.stayStreams.map((v, i) => (
              <Fold
                key={v.videoId}
                title={<span data-quote="title">{v.title}</span>}
                note={fmt(v.date)}
                open={i === 0}
              >
                <div className="scards">
                  <StreamCard videoId={v.videoId} title={v.title} date={v.date} nth={nthOf(v.date, v.videoId, v.title)} />
                </div>
              </Fold>
            ))}
            {r.highlights.map((h, i) => (
              <Fold key={h.title} title={h.title} note={h.date ? fmt(h.date) : undefined} open={i === 0}>
                <p>{h.note}</p>
                {h.videoId && (
                  <div className="scards">
                    <StreamCard
                      videoId={h.videoId}
                      title={h.title}
                      date={h.date}
                      nth={nthOf(h.date, h.videoId, h.title)}
                    />
                  </div>
                )}
              </Fold>
            ))}
          </div>
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
