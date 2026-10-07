"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui/PageShell";
import { Stat } from "@/components/ui/Bits";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import WorldRoute from "@/components/atlas/WorldRoute";
import { stayClosedOn, stayNow, travelNow, type StayNow, type TravelNow } from "@/lib/stay";
import { tripDate } from "@/content/chapters";
import { BUILT_AT } from "@/lib/builtAt";
import { tripPageOf } from "@/content/trip";

/**
 * 「歩いた国」のうち、**いまどこにいるか**を言っているところ。
 *
 * この面は静的書き出し（`output: "export"`）なので、ビルドした日の答えが
 * HTML に焼かれる。「いま」と書いてあるものを焼くと、その日から嘘になる。
 * 旅に出た1週間後の本番が、前置きで「いまはコーカサスにいます」と言い、
 * 札で「滞在 126日目」と数え、年表のジョージアに「いまここ」を付けていた。
 *
 * **焼いた字をまず出して、画面が出てから引き直す**（`components/atlas/Days.tsx`
 * と同じ形）。旅に出る前は、引き直しても同じ字になる。
 */

/** 前置きのうち、動かないところ。旅がどこまで進んでも本当のこと。 */
const LEAD =
  "2024年10月28日、パリで「日本語を話したい」と言いながら配信を始めました。そこからヨーロッパを回って、中東に降りて、";

/**
 * 面の頭。**最後の1文だけが「いま」を言う。**
 *
 * @param region いちばん新しく歩いた国の地方（「コーカサス」）
 */
export function MapHead({ region }: { region: string }) {
  /* 最初の描画は**焼いた時刻**で引く（`docs/island-misses.md` #30）。
     引数なしで呼ぶと、焼いた HTML とブラウザの最初の描画で答えが変わる。 */
  const [trip, setTrip] = useState<TravelNow | null>(() => travelNow(BUILT_AT));
  /* **「いまどこ」を名乗れない日がある。** 旅から帰って、次の島がまだ始まって
     いない日がそれ。前はそこで「いまはコーカサスにいます」に落ちていて、
     もう居ない国を「いま」と言っていた（`docs/island-misses.md` #24 と同じ形）。
     言えない日は、言わない。 */
  const [stay, setStay] = useState<StayNow | null>(() => stayNow(BUILT_AT));
  /* **旅の名前から、その旅の面へ送る。** ここは「いまは北欧周遊のとちゅうです」と
     書きながら、そこへ行く道を1本も持っていなかった。名前を出しておいて
     行けないのは、書いていないより悪い（`docs/island-misses.md` #12）。
     旅の面を持たない章もあるので、無ければ字のまま出す。
     **この字が出ているあいだは、旅が終わっていても押せる。** 名前と行き先を
     別の条件で出しわけると、名前だけ残って行けない日がまた来る。 */
  const [dest, setDest] = useState<string | null>(() => tripPageOf(travelNow(BUILT_AT)?.slug));
  useEffect(() => {
    const now = new Date();
    setTrip(travelNow(now));
    setStay(stayNow(now));
    setDest(tripPageOf(travelNow(now)?.slug));
  }, []);
  const lead = trip ? (
    <>
      {LEAD}
      {region}まで来ました。いまは
      {dest ? (
        <Link prefetch={false} className="phead-go" href={dest}>
          {trip.name}
        </Link>
      ) : (
        trip.name
      )}
      のとちゅうです。
    </>
  ) : stay ? (
    `${LEAD}いまは${region}にいます。`
  ) : (
    // 旅にも出ていないし、いる国も引けない日。**「いま」を名乗らない**
    `${LEAD}${region}まで来ました。`
  );
  return <PageHead icon="signpost-flags" title="歩いた国" lead={lead} />;
}

/**
 * 4つめの札。**いまどこにいて、そこで何日目か。**
 *
 * 国の名前は数ヶ月変わらないので、添え字を日数にして
 * 「旅が止まっていない」がここに出るようにしてある（`docs/island-play.md` 仕掛け10）。
 * 旅に出たら、まだ `content/countries.ts` に無い国を歩いているので、
 * 国ではなく旅そのものを出す。
 */
export function HereStat({ slug, name }: { slug: string; name: string }) {
  const [trip, setTrip] = useState<TravelNow | null>(() => travelNow(BUILT_AT));
  const [stay, setStay] = useState<StayNow | null>(() => stayNow(BUILT_AT));
  /** その国を出た日。旅から帰って、次の島がまだ始まっていない日に出す */
  const [left, setLeft] = useState<string | null>(() => stayClosedOn(slug, BUILT_AT));
  useEffect(() => {
    const now = new Date();
    setTrip(travelNow(now));
    setStay(stayNow(now));
    setLeft(stayClosedOn(slug, now));
  }, [slug]);

  if (trip)
    return (
      <Stat
        /* **印を `<svg>` に入れて渡す。** この札だけ桃色に敷かれるのは
           「数ではなく、いま」の印で、その出しわけが `.stat:has(svg)`
           （`app/css/pages.css`）。旗のかわりに絵を置くと札の色が落ちて、
           4つのうちどれが「いま」なのか言えなくなる。
           枠は旗のために引いてある線なので、絵には引かない。 */
        value={
          <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden style={{ border: 0 }}>
            <image href="/sprites/tent.webp" width="36" height="36" />
          </svg>
        }
        label={trip.name}
        sub={`旅に出て ${trip.days.toLocaleString()}日目`}
      />
    );
  return (
    <Stat
      value={<Flag slug={slug} size={34} />}
      label={name}
      /* **その国にいない日は「いまここ」と書かない。** 旅から帰って次の島が
         まだ始まっていない日は、出た日を出す。数えられない日だけ黙る */
      sub={
        stay
          ? `滞在 ${stay.days.toLocaleString()}日目`
          : left
            ? `${left.replace(/-/g, "/")} まで`
            : "いまここ"
      }
    />
  );
}

/**
 * 年表の「いまここ」。
 *
 * 付ける行はビルド時に決まる（いちばん新しく歩いた国）。
 * その国を出たかどうかだけを、画面が出てから見る。
 *
 * **最初の描画も、焼いた時刻で引く**（`docs/island-misses.md` #30）。
 * ここは `useState(true)` で始めていたので、**焼いた HTML には必ず
 * 「いまここ」が入っていた。** 出発したあとは画面が出た瞬間に消えるが、
 * 消えるまでのあいだ——回線の細いところでは数秒——年表のジョージアが
 * 「いまここ」に見える。同じ面の `MapHead` も `HereStat` も `TripCountries` も
 * 焼いた時刻で引いているので、ここだけが揃っていなかった。
 */
export function HereTag({ slug }: { slug: string }) {
  const [on, setOn] = useState(() => stayNow(BUILT_AT)?.slug === slug);
  useEffect(() => setOn(stayNow(new Date())?.slug === slug), [slug]);
  return on ? <span className="atrip-here">いまここ</span> : null;
}

/**
 * パスポートの「出国」。**まだ書き入れられていないだけの空欄を、「まだ、いる」にしない。**
 *
 * 出国の日は旅から帰ったあやとが手で入れる欄だが、旅の17日間は入らない。
 * そのあいだ、もう出た国のページが「出国：まだ、いる」と言い続ける。
 * 次の島へ渡った日が、そのまま出国の日（`lib/stay.ts` の `stayClosedOn`）。
 */
export function StayOut({ slug }: { slug: string }) {
  /* 焼いた HTML に出る1回目も、**焼いた日**で引く（`lib/builtAt.ts`）。
     ここは問答無用で「まだ、いる」から始めていたので、**もう出た国の
     パスポートにも、焼いた HTML には必ず「まだ、いる」が入っていた。**
     JS の動かない読み手——OGP・検索の下見——には、それしか見えない */
  const [out, setOut] = useState<string | null>(() => stayClosedOn(slug, BUILT_AT));
  useEffect(() => setOut(stayClosedOn(slug, new Date())), [slug]);
  return <>{out ? out.replace(/-/g, "/") : "まだ、いる"}</>;
}

/**
 * その国にいた日数。**出国したら、そこで止まる。**
 *
 * 数えかたは `components/atlas/Days.tsx` と同じ（入った日は0日目）。
 * この面のほかの日数——終わった滞在ぶん（`closedDays`）——がその数えかたなので、
 * 足し合わせるこちらだけ1日目から数えると、合計が1日ずれる。
 *
 * @param plus 終わった滞在ぶんの日数
 */
export function StayLen({ slug, from, plus }: { slug: string; from: string; plus: number }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const out = stayClosedOn(slug, new Date());
    const end = out ? Date.parse(`${out}T00:00:00Z`) : Date.now();
    /* 引き直したほうも 0 で止める。先の日付から始まる国を足したときに
       マイナスの日数を出さないため */
    setN(Math.max(0, Math.floor((end - new Date(from).getTime()) / 86400000) + plus));
  }, [slug, from, plus]);
  /* 画面が出るまでのあいだ出す数。`Days.tsx` と**同じ基準日**——焼いた日
     （`BUILT_AT`）——で引く。ここには日付を直に書いた `new Date` が置いて
     あった。焼き直しても動かない日付なので、**その日より後に入った国は
     必ずマイナスになる。** 本番の `/map/sweden` が「いた日数 -15」を
     焼いていた（`docs/island-misses.md` #5 #6）。
     出国済みならそこで止めるのも、引き直したあとと揃える。
     0 で止めるのは、開発サーバで `BUILT_AT` が1970年になるため
     （`Days.tsx` と同じ理由）。**日数にマイナスは無い** */
  const bakedOut = stayClosedOn(slug, BUILT_AT);
  const bakedEnd = bakedOut ? Date.parse(`${bakedOut}T00:00:00Z`) : BUILT_AT.getTime();
  const baked = Math.max(0, Math.floor((bakedEnd - new Date(from).getTime()) / 86400000) + plus);
  return <>{(n ?? baked).toLocaleString()}</>;
}

/**
 * 世界地図。**「いまここ」の輪と、名札を別のものにする。**
 *
 * 輪（`is-here`）は「この国にいる」と言う印なので、旅に出て、この地図に無い国を
 * 歩いているあいだは**どこにも出さない。** 本番では、北欧を歩いている日に
 * コーカサスの群れが桃色に脈打っていた。
 *
 * 名札（`is-named`）のほうは残す。世界ぜんぶの引きでは名前を1つしか置けないので、
 * 消すと地図から国名が1つも消える。指しているのは「いちばん新しく歩いた国」で、
 * これは日付で動かない。
 */
export function HereRoute({ slug }: { slug: string }) {
  /* **最初の描画も、焼いた時刻で引く**（`docs/island-misses.md` #30）。
     ここは渡された国をそのまま輪にして始めていたので、**焼いた HTML には
     必ずコーカサスの桃色の輪が入っていた。** 開いた瞬間に消えるとはいえ、
     消えるまでのあいだ、北欧を走っている晩の地図がジョージアで脈打つ。 */
  const [ring, setRing] = useState(() => stayNow(BUILT_AT)?.slug ?? "");
  useEffect(() => setRing(stayNow(new Date())?.slug ?? ""), []);
  return <WorldRoute here={ring} focus={slug} />;
}

/** いま歩いている旅の国1つ（組み立ては `./page.tsx`）。 */
export type TripStep = {
  slug: string;
  name: string;
  /** 英字の国名。**旅程を持たない旅では無い。** 無いものを埋めない */
  en?: string;
  /** 入った日（YYYY-MM-DD） */
  from: string;
  /** 出た日。まだ先の日付でも入っている（出すかどうかは今日と見比べて決める）。無ければ空 */
  to: string;
  /** 通った街と、その日。旅程を持たない旅では空 */
  towns: { name: string; date: string }[];
  /** その国を歩いた章の slug。ここで見出しを分ける */
  chapter: string;
  /** その章の名前（`content/chapters.ts` が正本）。そのまま見出しになる */
  chapterName: string;
  /** その国の面。**持たない旅もある**ので、無ければ空（押せない札にする） */
  href: string;
};

/** 「2026/09/11」。年表の他の行（`./page.tsx` の `span`）と同じ並びで、日まで出す。 */
const ymd = (d: string) => `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`;

/**
 * いま歩いている旅の国。**`content/countries.ts` に記録が入るまでのあいだ、ここが受ける。**
 *
 * 出すのは**今日までに入った国だけ。** 国境を越えた日に1行増えて、次の国に入った日に
 * 前の国の「出た日」が入る。**焼いた日の答えを出さない**——旅は9/27まで毎日動くので、
 * 焼いたまま出すと、次の国境を越えた日から古くなる。
 */
export function TripCountries({
  steps,
  start,
  open,
}: {
  steps: TripStep[];
  /** 通し番号の続き。`COUNTRIES` の最後の番号 */
  start: number;
  open: boolean;
}) {
  /* 最初の描画は焼いた日で。本物の今日で引き直すのは画面が出てから
     （`docs/island-misses.md` #30）。旅の日付は現地の暦で切る（`tripDate`）。 */
  const [day, setDay] = useState(() => tripDate(BUILT_AT));
  const [live, setLive] = useState(false);
  useEffect(() => {
    const now = new Date();
    setDay(tripDate(now));
    setLive(travelNow(now) != null);
  }, []);

  const walked = steps.filter((x) => x.from <= day);
  if (!walked.length) return null;

  /* **畳みは旅ごとに分ける。** 旅がひとつ終わって次が始まっても、まだどちらの国も
     `COUNTRIES` に移っていない日がありうる。1枚にまとめると、見出しの章名が
     どちらか片方の嘘になる。見出しの名前は `chapterName`（`content/chapters.ts`）。 */
  const groups: { chapter: string; label: string; steps: TripStep[] }[] = [];
  for (const x of walked) {
    const g = groups[groups.length - 1];
    if (g && g.chapter === x.chapter) g.steps.push(x);
    else groups.push({ chapter: x.chapter, label: x.chapterName, steps: [x] });
  }
  // 通し番号は旅をまたいで続ける。畳みが分かれても「◯カ国目」は1本の列
  const noOf = new Map(walked.map((x, i) => [x.slug, start + i + 1]));
  /** いちばん新しく入った国。「いまここ」はここにしか付かない */
  const latest = walked[walked.length - 1];

  return (
    <>
      {groups.map((g, gi) => (
        <Fold
          key={g.chapter}
          title={g.label}
          /* **見出しと同じ語を、その下でもう一度言わない。** 旅の名前がそのまま
             国名の章（アルバニア）は、1カ国のあいだ「アルバニア／アルバニアから」と
             2段で同じ字が並ぶ。回る国が増えれば「アルバニアから◯◯まで」になって
             ひとりでに意味を持つので、消すのは重なっているあいだだけ。 */
          lead={
            g.steps.length > 1
              ? `${g.steps[0].name}から${g.steps[g.steps.length - 1].name}まで`
              : g.label === g.steps[0].name
                ? ""
                : `${g.steps[0].name}から`
          }
          note={`${g.steps.length}カ国`}
          // 開けておくのはいちばん新しい旅ひとつ。2枚開くと、どこまで来たかが読みにくい
          open={open && gi === groups.length - 1}
        >
          <ol className="atrip">
            {g.steps.map((x) => {
              const towns = [...new Set(x.towns.filter((t) => t.date <= day).map((t) => t.name))];
              const out = x.to && x.to <= day ? x.to : "";
              const body = (
                <>
                  <span className="atrip-flag">
                    <Flag slug={x.slug} size={34} />
                  </span>
                  <span className="atrip-body">
                    <span className="atrip-name">
                      <b>{x.name}</b>
                      {/* 旅程を持たない旅には英字の国名が無い。**空の欄を置かない** */}
                      {x.en && <em>{x.en}</em>}
                    </span>
                    <span className="atrip-when">
                      {/* 同じ日に入って出た国（ヘルシンキ乗り継ぎ）は、日付ひとつ。
                          `./page.tsx` の `span` が同じ月をまとめるのと同じ決まり */}
                      {!out
                        ? `${ymd(x.from)} –`
                        : out === x.from
                          ? ymd(x.from)
                          : `${ymd(x.from)} – ${ymd(out).slice(5)}`}
                      {/* 「いまここ」は**国に付く**印で、街に付く印ではない。
                          下の街の列の末尾に置くと、列の最後の街の隣に並ぶので
                          「その街にいる」と読める（実際そう読み違えた）。
                          日付の「09/11 –」の隣なら、「その日からこの国にいる」に
                          しか読めない。**まだ出ていない国だけ**に付ける。 */}
                      {live && !out && x === latest && <span className="atrip-here">いまここ</span>}
                    </span>
                    {/* 街が分かっていない国では、列ごと出さない。空の列は隙間になるだけ */}
                    {towns.length > 0 && (
                      <span className="atrip-tags">
                        {towns.slice(0, 5).map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                        {towns.length > 5 && <span>ほか{towns.length - 5}</span>}
                      </span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={x.slug}>
                  <span className="atrip-rail" aria-hidden />
                  <span className="atrip-no" aria-hidden>
                    {noOf.get(x.slug)}
                  </span>
                  {/* **行き先を持たない国は、押せる形にしない。** 旅程の無い旅には
                      国ごとの面が無い。矢印（`tile-go`）は「押すと進む」の印なので、
                      行き先が無い札には出さない（`docs/island-misses.md` #12）。

                      厚み（`0 6px 0` の台）と浮き上がりも外す。島では**厚みが
                      「押せる」の合図ひとつ**と決まっているので、押せない札に
                      残すと合図が嘘になる（`docs/island-design.md` 3章。
                      数えているのは `tools/sprites/popcheck.mjs`）。
                      落ち影だけ残して、札としての形は同じにする。 */}
                  {x.href ? (
                    <Link className="atrip-card" href={x.href} prefetch={false}>
                      {body}
                      <Icon name="right" size={15} className="tile-go" />
                    </Link>
                  ) : (
                    <span
                      className="atrip-card"
                      style={{ boxShadow: "var(--shadow-1)", transform: "none" }}
                    >
                      {body}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Fold>
      ))}
    </>
  );
}
