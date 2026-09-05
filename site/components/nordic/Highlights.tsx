import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import { loadSpots, nordicCountry } from "@/content/nordic";

/**
 * この旅でいちばん見たいもの。
 *
 * 161件を全部並べても、初めて来た人には多すぎて何も残らない。
 * ルート上にあって、写真1枚で「行きたい」と思えるものだけを、通る順に8つ選んである。
 * ここから先は国のページへ。
 *
 * 選ぶ基準:
 *   1. ルートで実際に降りる街にあること（寄り道が要るものは選ばない）
 *   2. 写真1枚で伝わること
 *   3. 6カ国それぞれから少なくとも1つ
 */
const PICKS: { country: string; id: string; why: string }[] = [
  { country: "poland", id: "poland-krakow-main-square", why: "戦火を逃れた本物の中世が、まるごと残っている" },
  { country: "poland", id: "poland-auschwitz", why: "壊さず、飾らず、そのまま残されている" },
  { country: "lithuania", id: "lithuania-s191", why: "十万本の十字架が、丘ひとつを埋めている" },
  { country: "lithuania", id: "lithuania-s189", why: "芸術家が勝手に独立を宣言した、憲法のある一区画" },
  { country: "latvia", id: "latvia-s166", why: "通りぜんぶがユーゲントシュティールの彫刻" },
  { country: "estonia", id: "estonia-s144", why: "赤い屋根の海を見下ろす、絵はがきの丘" },
  { country: "finland", id: "finland-s001", why: "岩をくり抜いて、そのまま教会にした" },
  { country: "sweden", id: "sweden-s042", why: "沈んだまま333年、ほぼ原形で引き上げられた軍艦" },
];

export default async function Highlights() {
  const bySlug = new Map<string, Awaited<ReturnType<typeof loadSpots>>>();
  for (const c of new Set(PICKS.map((p) => p.country))) {
    bySlug.set(c, await loadSpots(c));
  }
  const items = PICKS.map((p) => {
    const spot = bySlug.get(p.country)?.find((s) => s.id === p.id);
    return spot ? { ...p, spot, c: nordicCountry(p.country)! } : null;
  }).filter(Boolean) as { country: string; why: string; spot: NonNullable<ReturnType<typeof Array.prototype.find>>; c: NonNullable<ReturnType<typeof nordicCountry>> }[];

  return (
    <div className="nhi">
      {items.map(({ spot, why, c, country }) => (
        <Link key={spot.id} className="nhi-card" href={`/nordic/${country}#${spot.id}`}>
          <span className="nhi-img">
            <img src={spot.img} alt={spot.title} loading="lazy" referrerPolicy="no-referrer" />
            <span className="nhi-where">
              <Flag slug={c.slug} size={18} />
              {spot.city}
            </span>
          </span>
          <span className="nhi-body">
            <b>{spot.title}</b>
            <i>{why}</i>
            <em>
              くわしく
              <Icon name="right" size={12} />
            </em>
          </span>
        </Link>
      ))}
    </div>
  );
}
