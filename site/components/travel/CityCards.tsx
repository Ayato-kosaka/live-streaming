import Link from "next/link";

import Icon from "@/components/ui/Icon";
import { guidebookOf } from "@/content/guidebook";
import type { Guidebook } from "@/content/guidebook/types";
import { publicCities } from "@/content/travel";

import "./cities.css";

/**
 * 街のガイドへのカード。国の面の「どの街へ行った？」と、`/travel` の「街のガイド」（国を渡さないと全部の国）。
 *
 * **公開前の印（`draft`）が付いた街は出さない**（`content/travel.ts` の `publicCities`）。
 * 1枚も無ければ何も描かない（空の見出しを置かない。`docs/guide-design.md` 2-0）。
 * 印を外した日に、ここへひとりでにカードが出る。
 *
 * ## 押すところの字は、その面に在るものの名前
 *
 * 前は「ガイドを読む」だけだった。押す先に何が在るか（やりたいこと◯選・見どころマップ）を言うと、
 * 読む人には押した先が分かり、検索の読み手にはリンクの字が面の中身の名前になる（#1262 の3手の3）。
 * 数は中身から数える。無いものは言わない。
 */
export default function CityCards({ country, title = "どの街へ行った？" }: { country?: string; title?: string }) {
  const cities = publicCities(country);
  if (!cities.length) return null;
  return (
    <section className="tg-cities" aria-labelledby="cities-h">
      <h2 id="cities-h" className="tg-cities-h">
        <Icon name="pin" size={24} />
        {title}
      </h2>
      <ul>
        {cities.map((c) => {
          /* 街の中身はガイドブック（`content/guidebook/`）。**名簿に在るのに中身が無い街は書き出しを止める** */
          const g = guidebookOf(c.country, c.slug);
          if (!g) throw new Error(`components/travel/CityCards.tsx: ${c.country}/${c.slug} の中身が content/guidebook/ に無い`);
          return (
            <li key={c.href}>
              <Link href={c.href} prefetch={false} className="tg-city">
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
                  {/* 国を渡さない一覧（`/travel`）では、どの国の街かも名前に添える（`/all` の棚と同じ「国・街」） */}
                  <b>{country ? c.name : `${g.kicker}・${c.name}`}</b>
                  <span>{g.lead}</span>
                  <em>
                    {holds(g)}
                    <Icon name="right" size={14} />
                  </em>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 押す先に在るもの。やりたいことの数と、見たいものの地図（マイマップ）。どちらも無ければ「ガイドを読む」 */
function holds(g: Guidebook) {
  const parts = [g.todo.length ? `やりたいこと${g.todo.length}選` : "", g.see.map ? "見どころマップ" : ""].filter(Boolean);
  return parts.length ? parts.join("と") : "ガイドを読む";
}
