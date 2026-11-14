import Link from "next/link";

import Icon from "@/components/ui/Icon";
import { publicCities } from "@/content/travel";
import { guideOf } from "@/content/travel/guides";

import { Pic } from "./Guide";

import "./cities.css";

/**
 * 国の面の「どの街へ行った？」——街のガイドへのカード。
 *
 * **公開前の印（`draft`）が付いた街は出さない**（`content/travel.ts` の `publicCities`）。
 * 1枚も無ければ何も描かない（空の見出しを置かない。`docs/guide-design.md` 2-0）。
 * 印を外した日に、ここへひとりでにカードが出る。
 */
export default function CityCards({ country }: { country: string }) {
  const cities = publicCities(country);
  if (!cities.length) return null;
  return (
    <section className="tg-cities" aria-labelledby="cities-h">
      <h2 id="cities-h" className="tg-cities-h">
        <Icon name="pin" size={24} />
        どの街へ行った？
      </h2>
      <ul>
        {cities.map((c) => {
          const g = guideOf(c.country, c.slug);
          return (
            <li key={c.href}>
              <Link href={c.href} prefetch={false} className="tg-city">
                {g.cover && (
                  <span className="tg-city-ph">
                    <Pic p={g.cover} sizes="(min-width: 720px) 420px, 92vw" />
                  </span>
                )}
                <span className="tg-city-b">
                  <b>{c.name}</b>
                  <span>{g.lead}</span>
                  <em>
                    ガイドを読む
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
