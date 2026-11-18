import Link from "next/link";

import Icon from "@/components/ui/Icon";
import { guidebookOf } from "@/content/guidebook";
import type { Guidebook } from "@/content/guidebook/types";
import type { TravelCity } from "@/content/travel";

import "./cities.css";

/**
 * 街のガイドへのカード1枚。国の面の「行った街」で、ガイドを持つ街だけがこの形になる
 * （ガイドの無い街は、その街からの配信を畳んだ行。`app/travel/record.tsx`）。
 *
 * **公開前の印（`draft`）が付いた街は、呼ぶ側で渡さない**（`content/travel.ts` の `publicCities`）。
 * 印を外した日に、国の面の行がひとりでにこのカードへ替わる。
 *
 * ## `/travel` には置かない
 *
 * 前は `/travel` にも「街のガイド」の節があって、ソフィアが国の一覧の中に混ざっていた。
 * 国の一覧に街を並べると粒度が揃わない（あやと 2026-11-18）。街へは 国 → 行った街 → ガイド、の1本で入る。
 *
 * ## 押すところの字は、その面に在るものの名前
 *
 * 押す先に何が在るか（やりたいこと◯選・見どころマップ）を言うと、読む人には押した先が分かり、
 * 検索の読み手にはリンクの字が面の中身の名前になる（#1262 の3手の3）。数は中身から数える。無いものは言わない。
 */
export default function CityCard({ city }: { city: TravelCity }) {
  /* 街の中身はガイドブック（`content/guidebook/`）。**名簿に在るのに中身が無い街は書き出しを止める** */
  const g = guidebookOf(city.country, city.slug);
  if (!g) throw new Error(`components/travel/CityCard.tsx: ${city.country}/${city.slug} の中身が content/guidebook/ に無い`);
  return (
    <Link href={city.href} prefetch={false} className="tg-city">
      <span className="tg-city-ph">
        <img
          src={g.cover.src}
          srcSet={g.cover.small ? `${g.cover.small} 480w, ${g.cover.src} 960w` : undefined}
          sizes="(min-width: 720px) 420px, 92vw"
          width={g.cover.w}
          height={g.cover.h}
          alt={g.cover.alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </span>
      <span className="tg-city-b">
        <b>{city.name}</b>
        <span>{g.lead}</span>
        <em>
          {holds(g)}
          <Icon name="right" size={14} />
        </em>
      </span>
    </Link>
  );
}

/** 押す先に在るもの。やりたいことの数と、見たいものの地図（マイマップ）。どちらも無ければ「ガイドを読む」 */
function holds(g: Guidebook) {
  const parts = [g.todo.length ? `やりたいこと${g.todo.length}選` : "", g.see.map ? "見どころマップ" : ""].filter(Boolean);
  return parts.length ? parts.join("と") : "ガイドを読む";
}
