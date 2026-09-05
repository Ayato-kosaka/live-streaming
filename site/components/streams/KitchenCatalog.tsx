"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Flag from "@/components/ui/Flag";
import { KINDS, kindLabel, recipeNo, type Recipe, type RecipeKind } from "@/content/recipes";
import { H } from "./Sheet";
import { ArtShelf } from "./Art";

/**
 * 料理のカタログ。図鑑の見開きに並べる。
 *
 * `output: "export"` の静的書き出しなので、絞り込みは全部ブラウザ側でやる。
 * 開いた瞬間から全部のマスが入っていて、押すと減るだけ。読み込みが挟まらない。
 *
 * 絞る軸は2つ。国だけだと25品がジョージアに固まっていて絞る意味がないので、
 * 「どんな料理か」を足してある。粉ものが7品続いた時期のようなかたよりは、
 * 国ではなくこちらの軸に出る。
 *
 * 並びかたを覚えさせない（localStorage を使わない）のはわざと。
 * 次に来たときも「新しい順」から始まったほうが、何が最近作られたか分かる。
 */

type Country = { slug: string; name: string };
type Order = "new" | "old" | "work";

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
  const [kind, setKind] = useState<RecipeKind | "all">("all");
  const [order, setOrder] = useState<Order>("new");

  /** 軸ごとの数。絞り込む前の数で数える。押す前に「何品あるか」が見えるように。 */
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    recipes.forEach((r) => m.set(r.country, (m.get(r.country) ?? 0) + 1));
    return m;
  }, [recipes]);
  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    recipes.forEach((r) => m.set(r.kind, (m.get(r.kind) ?? 0) + 1));
    return m;
  }, [recipes]);

  const shown = useMemo(() => {
    const list = recipes.filter(
      (r) => (country === "all" || r.country === country) && (kind === "all" || r.kind === kind),
    );
    return list.sort((a, b) => {
      if (order === "work" && a.streams.length !== b.streams.length) return b.streams.length - a.streams.length;
      return order === "old" ? (a.date < b.date ? -1 : 1) : a.date < b.date ? 1 : -1;
    });
  }, [recipes, country, kind, order]);

  const used = countries.filter((c) => byCountry.has(c.slug));
  const reset = country === "all" && kind === "all";

  return (
    <>
      <div className="zk-zone is-tight">
        {/* カモメがすぐ上で「押すと3日ぶんが出てくる」と言っている。
            同じことを2行つづけて読ませないよう、ここは絞り込みの軸だけを言う。 */}
        <H art={<ArtShelf size={32} />} note={`${recipes.length}品を、国と種類でしぼる`}>
          どれから見る
        </H>
        <div className="kt-tools">
          <div className="zk-picks">
            <b className="zk-picks-t">どこで</b>
            <button type="button" className={`zk-pick${country === "all" ? " is-on" : ""}`} onClick={() => setCountry("all")}>
              ぜんぶ<em>{recipes.length}</em>
            </button>
            {used.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`zk-pick${country === c.slug ? " is-on" : ""}`}
                onClick={() => setCountry(c.slug)}
              >
                <Flag slug={c.slug} size={17} />
                {c.name}
                <em>{byCountry.get(c.slug)}</em>
              </button>
            ))}
          </div>

          <div className="zk-picks">
            <b className="zk-picks-t">なにを</b>
            <button type="button" className={`zk-pick${kind === "all" ? " is-on" : ""}`} onClick={() => setKind("all")}>
              ぜんぶ
            </button>
            {KINDS.filter((k) => byKind.has(k.id)).map((k) => (
              <button key={k.id} type="button" className={`zk-pick${kind === k.id ? " is-on" : ""}`} onClick={() => setKind(k.id)}>
                {k.label}
                <em>{byKind.get(k.id)}</em>
              </button>
            ))}
          </div>

          <div className="zk-picks">
            <b className="zk-picks-t">ならび</b>
            {ORDERS.map((o) => (
              <button key={o.id} type="button" className={`zk-pick${order === o.id ? " is-on" : ""}`} onClick={() => setOrder(o.id)}>
                {o.label}
              </button>
            ))}
          </div>

          <p className="kt-count">
            <b>{shown.length}</b> 品ならんでる
            {/* 0品のときは空っぽの枠のほうが「ぜんぶ出す」を出す。
                同じボタンが1画面に2つ並ばないようにする。 */}
            {!reset && shown.length > 0 && (
              <button
                type="button"
                className="kt-clear"
                onClick={() => {
                  setCountry("all");
                  setKind("all");
                }}
              >
                ぜんぶ出す
              </button>
            )}
          </p>
        </div>
      </div>

      <div className="zk-zone is-flush">
        {shown.length === 0 ? (
          /* 空っぽの形は島に1つしかない（`docs/island-world.md` 4.1）。
             ここだけ自前の1行にしていたので、他の面と同じ枠に寄せる。
             次にする一手（絞り込みを外す）を板で1つ置く。 */
          <div className="blank">
            <b>この組み合わせは、まだ押されていない</b>
            <p>ほかの国か、ほかの種類なら押してあるかも。</p>
            <button
              type="button"
              className="blank-go"
              onClick={() => {
                setCountry("all");
                setKind("all");
              }}
            >
              ぜんぶ出す
            </button>
          </div>
        ) : (
          <div className="kt-grid-wrap">
            <div className="kt-grid">
              {shown.map((r) => (
                <Dish key={r.slug} r={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 1品のマス。
 *
 * 図鑑と同じで、マスは板ではなく紙の上の区画。
 * 番号・絵・名前・どこで・いつ、が上から順に必ず同じ位置に来る。
 */
export function Dish({ r }: { r: Recipe }) {
  return (
    // 一覧の30枚が画面に入っただけで行き先を先読みすると、この面だけで 228KB になる。
    // prefetch={false} は「読まない」ではなく「指が乗ってから読む」なので、押した速さは変わらない。
    <Link className="dish" href={`/kitchen/${r.slug}`} prefetch={false}>
      <span className="dish-no">No.{String(recipeNo(r.slug)).padStart(2, "0")}</span>
      {r.streams.length > 1 && <span className="dish-days">{r.streams.length}日がかり</span>}
      <span className="dish-art">
        <img src={`/sprites/${r.icon}.webp`} alt="" loading="lazy" />
      </span>
      <b className="dish-name">{r.name}</b>
      <span className="dish-m">
        <Flag slug={r.country} size={16} />
        {r.date.replace(/-/g, "/")}
        <span className="zk-chip is-soft">{kindLabel(r.kind)}</span>
      </span>
    </Link>
  );
}
