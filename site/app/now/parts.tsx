"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getState } from "@/lib/api";
import { COUNTRIES, countryBySlug, type Country } from "@/content/countries";
import { NOW_FALLBACK } from "@/content/site";
import Icon from "@/components/ui/IconCore";
import Flag from "@/components/ui/Flag";
import Days from "@/components/atlas/Days";

/**
 * いまのポストの中身のうち、「いる国」に関わるところ。
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
 * 国は Firestore の `current.theme`（国の slug）から引く。
 * 焼き込みだと、あやとが国境を越えた日から次のビルドまで嘘をつく。
 */

/** 場所のテーマが国の slug かどうか。文章としては出さない符丁なので、絵と引きにだけ使う。 */
const SLUG = /^[a-z0-9-]+$/;

function useCurrentCountry(): Country | undefined {
  const [slug, setSlug] = useState<string>(NOW_FALLBACK.theme);
  useEffect(() => {
    getState()
      .then((s) => {
        const t = s.current?.theme;
        if (typeof t === "string" && SLUG.test(t) && countryBySlug(t)) setSlug(t);
      })
      .catch(() => {
        /* 読めないときは焼き込みの国のまま。国は月ごとにしか変わらないので害が小さい */
      });
  }, []);
  return countryBySlug(slug);
}

/** いまいる国のこと。 */
export function NowCountry() {
  const c = useCurrentCountry();
  if (!c) return null;
  // いまの滞在はいちばん新しいもの。同じ国に2回入っていることがある
  const stay = c.stays[c.stays.length - 1];
  const spots = c.highlights.filter((h) => h.videoId).slice(0, 3);

  return (
    <section className="pap-sec">
      <h2 className="pap-h">いまいる国のこと</h2>
      <p className="nowc-head">
        <Flag slug={c.slug} size={30} />
        <b>{c.name}</b>
        {stay && (
          <span className="nowc-day">
            この滞在で <Days from={stay.from} /> 日目
          </span>
        )}
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
          <p className="pap-note">この国でいちばん喋られた回。押すとその配信に飛びます。</p>
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
 * ここまでの道。直前にいた国を、新しい順に。
 *
 * 「いま」だけを出しても、それが旅の途中なのかどうかが分からない。
 * 3つ手前まで見えていれば、この人がどっちへ動いているかが1目で出る。
 * 17カ国ぜんぶ並べるのは `/map` の仕事なので、ここは4つで止める。
 */
export function NowTrail() {
  const c = useCurrentCountry();
  const before = [...COUNTRIES]
    .sort((a, b) => b.order - a.order)
    .filter((x) => x.slug !== c?.slug)
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
