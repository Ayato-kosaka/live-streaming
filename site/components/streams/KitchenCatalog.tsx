"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import type { Recipe } from "@/content/recipes";

/**
 * 料理のカタログ。
 *
 * `output: "export"` の静的書き出しなので、絞り込みは全部ブラウザ側でやる。
 * 開いた瞬間から全部の札が入っていて、押すと減るだけ。読み込みが挟まらない。
 *
 * 並びかたを覚えさせない（localStorage を使わない）のはわざと。
 * 次に来たときも「新しい順」から始まったほうが、何が最近作られたか分かる。
 */

type Country = { slug: string; name: string };
type Order = "new" | "old" | "work";

/** 3日構成のどの日か。点の色で内わけが見えるようにしてある。 */
const STEP_CLASS: Record<string, string> = {
  企画会議: "is-plan",
  買い出し: "is-buy",
  調理: "is-cook",
  リベンジ: "is-again",
  配信: "is-cook",
};

const ORDERS: { id: Order; label: string }[] = [
  { id: "new", label: "新しい順" },
  { id: "old", label: "古い順" },
  { id: "work", label: "手間のかかった順" },
];

export default function KitchenCatalog({
  recipes,
  countries,
}: {
  recipes: Recipe[];
  countries: Country[];
}) {
  const [country, setCountry] = useState<string>("all");
  const [order, setOrder] = useState<Order>("new");

  /** 国ごとの数。札に出すので、絞り込む前の数で数える。 */
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    recipes.forEach((r) => m.set(r.country, (m.get(r.country) ?? 0) + 1));
    return m;
  }, [recipes]);

  const shown = useMemo(() => {
    const list = recipes.filter((r) => country === "all" || r.country === country);
    return list.sort((a, b) => {
      if (order === "work" && a.streams.length !== b.streams.length) return b.streams.length - a.streams.length;
      return order === "old" ? (a.date < b.date ? -1 : 1) : a.date < b.date ? 1 : -1;
    });
  }, [recipes, country, order]);

  const used = countries.filter((c) => counts.has(c.slug));

  return (
    <>
      <div className="kt-bar">
        <div className="kt-row">
          <b>どこで作った</b>
          <button type="button" className={`kt-pick${country === "all" ? " is-on" : ""}`} onClick={() => setCountry("all")}>
            ぜんぶ<em>{recipes.length}</em>
          </button>
          {used.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`kt-pick${country === c.slug ? " is-on" : ""}`}
              onClick={() => setCountry(c.slug)}
            >
              <Flag slug={c.slug} size={18} />
              {c.name}
              <em>{counts.get(c.slug)}</em>
            </button>
          ))}
        </div>
        <div className="kt-row">
          <b>ならびかた</b>
          {ORDERS.map((o) => (
            <button key={o.id} type="button" className={`kt-pick${order === o.id ? " is-on" : ""}`} onClick={() => setOrder(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kt-shelf pat">
        {shown.length === 0 ? (
          <p className="kt-none">この国のスタンプは、まだ押されていない。</p>
        ) : (
          <div className="kt-grid">
            {shown.map((r) => (
              <Dish key={r.slug} r={r} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** 1品のカード。皿に乗せて、その下に「何日がかりだったか」を出す。 */
export function Dish({ r }: { r: Recipe }) {
  return (
    <Link className="dish" href={`/kitchen/${r.slug}`}>
      <span className="dish-plate">
        {r.streams.length > 1 && (
          <span className="dish-days">
            <Icon name="calendar" size={11} />
            {r.streams.length}日がかり
          </span>
        )}
        <img src={`/sprites/${r.icon}.webp`} alt="" loading="lazy" />
      </span>
      <span className="dish-b">
        <b>{r.name}</b>
        <span className="dish-m">
          <Flag slug={r.country} size={17} />
          {r.date.replace(/-/g, "/")}
          {/* 1本しかない品に点を1つ置くと、汚れにしか見えない。2日以上のときだけ出す */}
          {r.streams.length > 1 && (
            <span className="dish-dots" aria-hidden>
              {r.streams.map((s, i) => (
                <i key={i} className={STEP_CLASS[s.label] ?? ""} />
              ))}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
