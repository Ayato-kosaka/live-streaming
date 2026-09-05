import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import { loadSpots, nordicCountry, NORDIC_COUNTRIES } from "@/content/nordic";

/**
 * 通る6カ国。**この面から国のページへ出ていく、ただ1つの入口。**
 *
 * ここは長いあいだ2つに割れていた。「いちばん見たいもの」（161件から選んだ
 * 写真8枚）と「通る6カ国」（旗と名前の行が6つ）が、別々のパネルとして
 * 縦に積まれていて、行き先はどちらも同じ `/nordic/[国]` だった。
 * 2つで 3,300px、`/nordic` ぜんぶの4割をこれが使っていた。
 *
 * **同じ行き先を2回並べない。** 写真のほうが強いので、写真を国の顔にする。
 * 国ごとに1枚、その国でいちばん見たいものを選んで、その1行を添える。
 * 選ばれなかった見どころは消えたわけではなく、国のページに全部ある。
 *
 * 写真は Wikimedia Commons から来る。外から来る絵なので、
 * 高さを先に決めて枠を置いておく（`island-ux.md` 5.13）。
 */

/**
 * 国ごとの顔。
 *
 * 選ぶ基準:
 *   1. ルートで実際に降りる街にあること（寄り道が要るものは選ばない）
 *   2. 写真1枚で伝わること
 *   3. 「なぜ見たいか」が1行で言えること
 */
const FACE: Record<string, { id: string; why: string }> = {
  poland: { id: "poland-krakow-main-square", why: "戦火を逃れた本物の中世が、まるごと残っている" },
  lithuania: { id: "lithuania-s191", why: "十万本の十字架が、丘ひとつを埋めている" },
  latvia: { id: "latvia-s166", why: "通りぜんぶがユーゲントシュティールの彫刻" },
  estonia: { id: "estonia-s144", why: "赤い屋根の海を見下ろす、絵はがきの丘" },
  finland: { id: "finland-s001", why: "岩をくり抜いて、そのまま教会にした" },
  sweden: { id: "sweden-s042", why: "沈んだまま333年、ほぼ原形で引き上げられた軍艦" },
};

export default async function Countries() {
  const cards = await Promise.all(
    NORDIC_COUNTRIES.map(async (c) => {
      const face = FACE[c.slug];
      const spots = await loadSpots(c.slug);
      const spot = face ? spots.find((s) => s.id === face.id) : undefined;
      return { c, spot, why: face?.why };
    }),
  );

  return (
    <div className="ncountries">
      {cards.map(({ c, spot, why }) => (
        <Link key={c.slug} className="ncountry" href={`/nordic/${c.slug}`}>
          <span className="ncountry-img">
            {spot?.img && (
              <img src={spot.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
            )}
            <span className="ncountry-leg">{c.leg}</span>
          </span>
          <span className="ncountry-body">
            {/* 国の名前と、見どころの数を1行に。行を分けるとカードが1段ぶん伸びて、
                6枚で 100px 変わる。 */}
            <span className="ncountry-name">
              <Flag slug={c.slug} size={19} />
              <b>{nordicCountry(c.slug)?.name ?? c.name}</b>
              <span className="ncountry-more">
                {c.spots}件
                <Icon name="right" size={13} />
              </span>
            </span>
            {/* 見どころの名前と、なぜ見たいのか。国の紹介文（`c.catch`）は
                ここでは出さない。写真が言っていることを、字でもう一度言うことになる。 */}
            {spot && <i>{spot.title}</i>}
            {why && <em>{why}</em>}
          </span>
        </Link>
      ))}
    </div>
  );
}
