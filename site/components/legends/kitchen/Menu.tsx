import { Picture, jpDate } from "@/components/guidebook/parts";
import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import FoodCompare from "./FoodCompare";
import MenuSim from "./MenuSim";
import { KcSec, SceneLink } from "./Sec";

/**
 * 2 売るもの。**第1〜第3（食べ物の絵）→ なぜたい焼きか（行）と決まった場面 → メニューの候補（視聴者さんの案の印。名前は出さない）
 * → メニュー開発のシミュレーション → 食べ物ごとの比較**（build-plan ①の3・あやとの答えの Q3）。
 * 食べ物の絵が無いあいだは枠を出さない
 */
export default function Menu({ b, drawn }: { b: KitchenCarBook; drawn: KitchenDrawn }) {
  const food = (id: string) => b.foods.find((f) => f.id === id);
  return (
    <KcSec b={b} s="menu">
      <ol className="kc-picks">
        {b.menu.picks.map((p) => {
          const f = food(p.food);
          if (!f) throw new Error(`components/legends/kitchen/Menu.tsx: 第${p.rank}の食べ物 "${p.food}" が焼いた中身に無い`);
          return (
            <li key={p.food} className={`kc-pick is-${p.rank}`}>
              {drawn.foods[f.id] && <Picture pic={drawn.foods[f.id]} sizes="(min-width: 640px) 200px, 30vw" ratio="1 / 1" />}
              <b className="kc-rank">{b.ui.picks[p.rank]}</b>
              <span className="kc-pick-n">{f.name}</span>
            </li>
          );
        })}
      </ol>
      <h3 className="gb-sub">{b.ui.why}</h3>
      <ul className="kc-why">
        {b.menu.why.map((x) => (
          <li key={x.id}>{x.text}</li>
        ))}
      </ul>
      <p className="kc-scene-row">
        <SceneLink s={b.menu.decided} of={b.ui.why} />
      </p>
      <h3 className="gb-sub">{b.ui.ideas}</h3>
      <ul className="kc-ideas">
        {b.menu.ideas.map((x) => (
          <li key={x.id}>
            <b>{x.name}</b>
            {x.from === "viewer" && <span className="kc-mark">{b.ui.viewer}</span>}
            <time dateTime={x.date}>{jpDate(x.date)}</time>
          </li>
        ))}
      </ul>
      <MenuSim b={b} />
      <h3 className="gb-sub" id="food-compare">
        {b.subs.foodCompare}
      </h3>
      <FoodCompare b={b} />
    </KcSec>
  );
}
