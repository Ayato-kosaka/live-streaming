import Link from "next/link";
import { ROUTE, HITCH_KM, nordicCountry, type Leg } from "@/content/nordic";

const MOVE: Record<Leg["move"], { icon: string; label: string; cls: string }> = {
  fly: { icon: "✈", label: "飛行機", cls: "is-fly" },
  hitch: { icon: "👍", label: "ヒッチハイク", cls: "is-hitch" },
  ferry: { icon: "⛴", label: "フェリー", cls: "is-ferry" },
  walk: { icon: "🥾", label: "歩き", cls: "is-walk" },
};

/**
 * ルート。
 *
 * 地図の絵ではなく、縦につながった1本の線にした。
 * スマホで見る人がほとんどなので、横に広い地図は結局読めない。
 * それに、この企画で大事なのは「どこにあるか」ではなく
 * 「どうやってそこまで行くか」なので、区間ごとの手段と距離を主役にする。
 */
export default function RouteMap({ here }: { here?: string }) {
  return (
    <div className="route">
      <p className="route-sum">
        陸路は全部ヒッチハイク。つなぐ距離は<b>{HITCH_KM.toLocaleString()}km</b>。
        バスに乗れば2日で終わる道を、親指1本で行く。
      </p>
      <ol className="route-list">
        {ROUTE.map((l, i) => {
          const m = MOVE[l.move];
          const c = l.enters ? nordicCountry(l.enters) : undefined;
          const isHere = here && l.to === here;
          return (
            <li key={i} className={`rleg ${m.cls}${isHere ? " is-here" : ""}`}>
              <span className="rleg-line" aria-hidden />
              <span className="rleg-dot" aria-hidden>
                {m.icon}
              </span>
              <div className="rleg-body">
                <b className="rleg-to">
                  {l.to}
                  {c && (
                    <Link className="rleg-flag" href={`/nordic/${c.slug}`}>
                      {c.flag} {c.name}へ
                    </Link>
                  )}
                  {isHere && <em className="rleg-here">いま ここ</em>}
                </b>
                <i className="rleg-how">
                  {l.from} から {m.label}
                  {l.km ? ` ${l.km.toLocaleString()}km` : ""}
                  {l.time ? ` / ${l.time}` : ""}
                </i>
                {l.fixed && <span className="rleg-fixed">{l.fixed}</span>}
                {l.note && <p className="rleg-note">{l.note}</p>}
                {l.stay && <span className="rleg-stay">泊まる: {l.stay}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
