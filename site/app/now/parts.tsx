"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getState } from "@/lib/api";
import { COUNTRIES, countryBySlug, type Country } from "@/content/countries";
import { placeCountry, type PlaceCountry } from "@/content/place";
import { NOW_FALLBACK } from "@/content/site";
import Icon from "@/components/ui/IconCore";
import Flag from "@/components/ui/Flag";
import { stayClosedOn, stayDays, travelNow, tripAsPlace, tripDayWord, type TravelNow } from "@/lib/stay";

/**
 * 「いまどこ」の中身のうち、「いる国」に関わるところ。
 *
 * この面は「いま、どこにいるか」の面なのに、下半分が
 * 「あやとって誰」（`/about` の名乗りと同じ4段落）と
 * 「もっと先は」（`/next` と `/map` への札）でできていた。
 * **どちらもこの面のものではない。** 2.33画面のうち半分が、よその面の写しだった。
 *
 * 代わりに置いたのがこの2つ。どちらも「いま」からしか出てこない。
 *   いまいる国   … 何日目か・どの街か・ここで何を見たか
 *   ここまでの道 … 直前にどこにいたか。押すとその国の面へ
 *
 * 国は Firestore の `current.place`（人が打った「いまどこ」）から引く。
 * 焼き込みだと、あやとが国境を越えた日から次のビルドまで嘘をつく。
 *
 * **島の景色（`current.theme`）からは引かない。** 景色に入れてよいのは
 * `georgia` / `nordic` / `desert` の3つで、`nordic` は国ではない。
 * 旅の途中に景色を替えると国が引けなくなって、焼き込みのジョージアに落ちていた
 * （実測 2026-09-15：リトアニアにいるのに「いまいる国のこと ジョージア」）。
 *
 * ## 旅に出たら、国ではなく旅を出す
 *
 * 北欧の6カ国は `content/countries.ts` にまだ無い（歩いてから足す決まり）。
 * だから国は引けても、その国でやったことは1つも書けない。
 * 書けるのは名前と旗と、旅に出て何日目かまで。**数えられないものを埋めない。**
 */

/**
 * いまいる国と、その便りをいつ書いたか。
 *
 * 日付まで持つのは、**上の帯（`components/live/NowLive.tsx`）と同じ答えを
 * 出すため。** 上が「いまどこ」を旅で言っている日に、下でもう一度旅のことを
 * 書くと、1つの面が同じことを2回言う。
 */
function useCurrent(): {
  /** 記録のある国（歩いた国）。まだ歩いていない国は `undefined` */
  country: Country | undefined;
  /** 打った字から引いた国。国旗と名前はこちらから出す */
  here: PlaceCountry | null;
  updatedAt: string | undefined;
} {
  const [place, setPlace] = useState<string>(NOW_FALLBACK.place);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(NOW_FALLBACK.updatedAt);
  useEffect(() => {
    getState()
      .then((s) => {
        if (typeof s.current?.place === "string" && s.current.place) setPlace(s.current.place);
        if (typeof s.current?.updatedAt === "string") setUpdatedAt(s.current.updatedAt);
      })
      .catch(() => {
        /* 読めないときは焼き込みの場所のまま。国は月ごとにしか変わらないので害が小さい */
      });
  }, []);
  const here = placeCountry(place);
  return { country: here ? countryBySlug(here.slug) : undefined, here, updatedAt };
}

/**
 * その滞在で何日目か。
 *
 * **数えかたは `lib/stay.ts` に1つだけ置いてある。** 上の帯の
 * 「◯◯に来て 119日目」と同じ関数を見る。前はこちらだけ
 * `components/atlas/Days.tsx`（経過日数。入った日は0日目）だったので、
 * **同じ面の中で1日ずれていた**（119日目と118日目が並んでいた）。
 *
 * 静的書き出しなので、画面が出てから数える。焼いた日数は出さない。
 */
function StayDay({ slug, from }: { slug: string; from: string }) {
  const [n, setN] = useState<number | null>(null);
  /* **出国した国の日数は、出さない。** 滞在の `to` は帰ってから手で入れる欄なので、
     旅に出ても止まらない（`lib/stay.ts` の `stayClosedOn`）。上の帯の
     「ジョージアに来て ◯日目」は出国した日に消えるのに、ここだけ
     旅から帰ったあとも増えつづけていた。 */
  useEffect(() => {
    const now = new Date();
    setN(stayClosedOn(slug, now) ? null : stayDays(from, now));
  }, [slug, from]);
  if (n === null) return null;
  return <span className="nowc-day">この滞在で {n.toLocaleString()} 日目</span>;
}

/** いまいる国のこと。旅に出ているあいだは、国ではなく旅のこと。 */
export function NowCountry() {
  const { country: c, here, updatedAt } = useCurrent();
  /* 旅に出たかどうかは日付で変わる。静的書き出しに焼くと、出発の日をまたいでも
     ビルドした日の答えのままになるので、画面が出てから引き直す。 */
  const [trip, setTrip] = useState<TravelNow | null>(null);
  /** 上の帯が「いまどこ」を旅で言っている日。ここでは繰り返さない */
  const [above, setAbove] = useState(false);
  useEffect(() => {
    setTrip(travelNow(new Date()));
    setAbove(Boolean(tripAsPlace(updatedAt, new Date())));
  }, [updatedAt]);

  /* 上が旅を言っているなら、ここは黙る。**1つの面で同じことを2回言わない。** */
  if (above) return null;
  if (trip) return <NowTrip trip={trip} here={here} />;
  if (!c) return here ? <NowTrip trip={null} here={here} /> : null;
  // いまの滞在はいちばん新しいもの。同じ国に2回入っていることがある
  const stay = c.stays[c.stays.length - 1];
  const spots = c.highlights.filter((h) => h.videoId).slice(0, 3);

  return (
    <section className="pap-sec">
      <h2 className="pap-h">いまいる国のこと</h2>
      <p className="nowc-head">
        <Flag slug={c.slug} size={30} />
        <b>{c.name}</b>
        {stay && <StayDay slug={c.slug} from={stay.from} />}
      </p>
      <p>{c.summary}</p>

      {!!stay?.cities.length && (
        <p className="nowc-cities">
          <span>まわった街</span>
          {stay.cities.map((city) => (
            <em key={city}>{city}</em>
          ))}
        </p>
      )}

      {spots.length > 0 && (
        <>
          <p className="pap-note">この国でいちばん喋られた回。</p>
          <ul className="nowc-spots">
            {spots.map((h) => (
              <li key={h.videoId}>
                <a href={`https://youtu.be/${h.videoId}`} target="_blank" rel="noopener noreferrer">
                  <b>{h.title}</b>
                  <i>{h.note}</i>
                  <Icon name="external" size={13} />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link className="pap-go" href={`/map/${c.slug}`} style={{ marginTop: "var(--sp-3)" }}>
        <img src="/sprites/signpost.webp" alt="" />
        <span>
          <b>{c.name}でやったこと、ぜんぶ</b>
          <i>{c.highlights.length}の見どころと、通った街</i>
        </span>
        <Icon name="right" size={14} />
      </Link>
    </section>
  );
}

/**
 * いま歩いている旅のこと。
 *
 * 出発してから、その国の記録が `content/countries.ts` に入るまでのあいだ。
 * 出せるのは章が持っているものだけ——旅の名前、何日目か、どんな旅か。
 * **数えられないものを埋めない。** まわった街も、見どころも、まだ無い。
 */
function NowTrip({ trip, here }: { trip: TravelNow | null; here: PlaceCountry | null }) {
  /* 国が分かっていれば、その国の名前と旗を先に出す。**この面でいちばん
     知りたいのがそこ**で、旅の名前（「北欧周遊」）は6カ国のどこにいても同じ字。
     国の記録（`content/countries.ts`）はまだ無いので、出せるのは名前と旗まで。 */
  const title = here?.name ?? trip?.name ?? "";
  return (
    <section className="pap-sec">
      <h2 className="pap-h">いま歩いているところ</h2>
      <p className="nowc-head">
        {here && <Flag slug={here.slug} size={30} />}
        <b>{title}</b>
        {/* 数え方も言い方も `lib/stay.ts` に1つ（`tripDayWord`）。**上の帯と
            旅程表と、同じ日には同じ番号を出す。** 前はここだけ別に書いてあって、
            9/13 に上の帯が「3日目」、`/nordic` の旅程表が「2日目」と出ていた。 */}
        {trip && <span className="nowc-day">{tripDayWord(trip.days)}</span>}
      </p>
      {trip && <p>{trip.note}。</p>}

      {trip && (
        <Link className="pap-go" href={trip.href} style={{ marginTop: "var(--sp-3)" }} prefetch={false}>
          <img src="/sprites/tent.webp" alt="" />
          <span>
            <b>{trip.name}の島へ</b>
            <i>この旅のこと、旅の6カ国、旅のしおり</i>
          </span>
          <Icon name="right" size={14} />
        </Link>
      )}
    </section>
  );
}

/**
 * ここまでの道。直前にいた国を、新しい順に。
 *
 * 「いま」だけを出しても、それが旅の途中なのかどうかが分からない。
 * 3つ手前まで見えていれば、この人がどっちへ動いているかが1目で出る。
 * 17カ国ぜんぶ並べるのは `/map` の仕事なので、ここは4つで止める。
 */
export function NowTrail() {
  const { country: c } = useCurrent();
  /* 旅に出たら、直前までいた国も「その前は」に並ぶ。上が旅の話になっているので、
     ここで外すと**いちばん長くいた国だけが、どこにも出てこない**。 */
  const [trip, setTrip] = useState<TravelNow | null>(null);
  useEffect(() => setTrip(travelNow(new Date())), []);
  const now = trip ? undefined : c?.slug;
  const before = [...COUNTRIES]
    .sort((a, b) => b.order - a.order)
    .filter((x) => x.slug !== now)
    .slice(0, 4);
  if (!before.length) return null;

  return (
    <section className="pap-sec">
      <h2 className="pap-h">その前は、どこにいたんだろう</h2>
      <ul className="nowt">
        {before.map((x) => {
          const stay = x.stays[x.stays.length - 1];
          return (
            <li key={x.slug}>
              <Link href={`/map/${x.slug}`} prefetch={false}>
                <Flag slug={x.slug} size={22} />
                <b>{x.name}</b>
                {stay && <i>{stay.from.slice(0, 7).replace("-", "/")}</i>}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/map" prefetch={false} className="is-all">
            <b>17カ国ぜんぶ</b>
            <Icon name="right" size={13} />
          </Link>
        </li>
      </ul>
    </section>
  );
}
