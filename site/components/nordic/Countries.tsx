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
 * 国ごとの顔に選ぶ見どころ。**id だけを持つ。**
 *
 * 題名も「ここが面白い」（`point`）も、見どころのデータがもう持っている。
 * ここで文を書き直すと、`python/build_nordic.py` が作り直したときに
 * こちらだけ古い文が残るし、実際に書いてみると題名の言い換えにしかならなかった
 * （フィンランドで「岩をくり抜いた光の教会」と「岩をくり抜いて、そのまま教会にした」）。
 *
 * 選ぶ基準:
 *   1. ルートで実際に降りる街にあること（寄り道が要るものは選ばない）
 *   2. 写真1枚で伝わること
 */
const FACE: Record<string, string> = {
  poland: "poland-krakow-main-square",
  lithuania: "lithuania-s191",
  latvia: "latvia-s166",
  estonia: "estonia-s144",
  finland: "finland-s001",
  sweden: "sweden-s042",
};

export default async function Countries() {
  const cards = await Promise.all(
    NORDIC_COUNTRIES.map(async (c) => {
      const id = FACE[c.slug];
      const spots = await loadSpots(c.slug);
      const spot = id ? spots.find((s) => s.id === id) : undefined;
      return { c, spot };
    }),
  );

  return (
    <div className="ncountries">
      {cards.map(({ c, spot }) => (
        <Link key={c.slug} className="ncountry" href={`/nordic/${c.slug}`} prefetch={false}>
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
            {/* 見どころの名前だけ。街と「ここが面白い」の行は落とした。
                押した先の国のページに全部あるし、6枚で 170px 使っていた。
                国の紹介文（`c.catch`）も出さない。
                写真が言っていることを、字でもう一度言うことになる。 */}
            {spot && <i>{spot.title}</i>}
          </span>
        </Link>
      ))}
    </div>
  );
}
