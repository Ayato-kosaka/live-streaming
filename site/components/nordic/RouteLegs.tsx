import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import { ROUTE, nordicCountry, type Leg } from "@/content/nordic";

const MOVE: Record<Leg["move"], { icon: IconName; label: string; cls: string }> = {
  fly: { icon: "plane", label: "飛行機", cls: "is-fly" },
  hitch: { icon: "thumb", label: "ヒッチハイク", cls: "is-hitch" },
  ferry: { icon: "ferry", label: "フェリー", cls: "is-ferry" },
  walk: { icon: "walk", label: "歩き", cls: "is-walk" },
};

/**
 * 区間ごとの話。
 *
 * 地図が「どこを通るか」を受け持つので、こちらは「その区間で何が起きるか」だけを持つ。
 * 全部開いたまま並べると縦に長くなりすぎるので、畳んでおく。
 * 閉じていても、手段と距離だけは見えるようにしてある。
 */
export default function RouteLegs() {
  return (
    <div className="folds">
      {ROUTE.map((l, i) => {
        const m = MOVE[l.move];
        const c = l.enters ? nordicCountry(l.enters) : undefined;
        return (
          <Fold
            key={i}
            title={
              <span className={`rleg-h ${m.cls}`}>
                <Icon name={m.icon} size={17} />
                {l.from} → {l.to}
              </span>
            }
            lead={`${m.label}${l.km ? ` ${l.km.toLocaleString()}km` : ""}${l.time ? ` / ${l.time}` : ""}`}
            note={c ? `${c.name}へ` : undefined}
            open={i === 0}
          >
            {l.fixed && <p className="rleg-fixed">{l.fixed}</p>}
            {l.note && <p>{l.note}</p>}
            {l.stay && <p className="rleg-stay">泊まる: {l.stay}</p>}
            {c && (
              <Link className="rleg-go" href={`/nordic/${c.slug}`}>
                {c.name}で行くところを見る
                <Icon name="right" size={14} />
              </Link>
            )}
          </Fold>
        );
      })}
    </div>
  );
}
