import Icon, { type IconName } from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import ShopRows, { type Row } from "./ShopRows";
import { hoursJa } from "./hours";
import { SHOP_KINDS, mapHref, shopsOf, OSM_LICENSE, type ShopKind } from "@/content/nordicShops";

/** 区画の印。**絵文字は使わない**（`docs/island-design.md` 1章）。 */
const MARK: Record<ShopKind, IconName> = {
  gift: "souvenir",
  zakka: "gift",
  food: "honey",
  market: "market",
};

/**
 * その街の、おみやげと雑貨。
 *
 * あやとの言葉（2026-09-13・ビャウィストクにて）:
 *
 * > ビャウィストク Białystok つきました。お土産とか雑貨とか行きたかったけど、
 * > あやと島みても見つからず行けなかった
 *
 * 9/6 の企画会議で @まこも-z3i さんが言っていたことでもある:
 *
 * > ポ−ランドに行ったらアウシュビッツは行きたいな! あとは雑貨とか家具もみたい
 *
 * **付箋に書き留めただけで、現地で使える形にしていなかった。**
 *
 * ## 名簿ではなく、行き先
 *
 * ここは一覧を出す場所ではない。**押したら地図アプリが開いて、
 * 歩き出せること**がぜんぶ。だから1行が持つのは4つだけ——
 * 名前（現地の綴り）・何の店か・中心からどれだけ・何時にやっているか。
 *
 * 種類ごとに分けるのは、**あやとが言った2つ**（可愛い雑貨／その土地のお土産）が
 * そのまま区画になるから。混ぜると、みやげを探しに来た人が布屋の前で止まる。
 *
 * ## サーバで描き切る
 *
 * 焼いた JSON（8街 496軒）を読むのはここ。押しどころの中身だけを
 * `ShopRows`（`"use client"`）へ渡す。ここに `"use client"` を付けると、
 * 1街しか出さない面に**全街ぶんの JSON** が乗る（`DailyFood.tsx` と同じ）。
 */
export default function Shops({
  city,
  date,
  fold = false,
}: {
  city: string;
  /** この面が指している日。`ShopRows` が「今日かどうか」を見るのに使う */
  date?: string;
  /**
   * 畳んで置くか。**国の面は `true`。**
   *
   * ポーランドは降りる街が3つあるので、開いたまま並べると
   * お店だけで 48行になる（`docs/island-standards.md` 7「溜まっても背が変わらない形」）。
   * 日ごとの面は街が1つで、しかも**その街に立っている人が開く面**なので開いたまま。
   */
  fold?: boolean;
}) {
  const data = shopsOf(city);
  if (!data) return null;

  /* **読めていないときは、0軒の顔をしない**（`docs/island-misses.md` #79）。
     「無い」と読まれると、あやとは探しに行かない。 */
  if (!data.ok) {
    return (
      <section className="panel paper nshop" id={`shop-${city}`}>
        <h2>{city}で、買う</h2>
        <p className="nshop-none">{city}のお店は、まだ調べられていない。</p>
      </section>
    );
  }

  const groups = SHOP_KINDS.map((k) => ({
    ...k,
    rows: data.shops
      .filter((s) => s.kind === k.key)
      .map(
        (s): Row => ({
          id: s.id,
          name: s.name,
          what: s.what,
          km: s.km,
          at: s.at,
          open: s.open,
          // 日本語にするのはここ（サーバ）。ブラウザで組み直すと、
          // 出た瞬間に字が入れ替わって読んでいる途中で動く
          hours: hoursJa(s.open),
          href: mapHref(s),
        }),
      ),
  })).filter((g) => g.rows.length > 0);

  const body = (
    <>
      {/* **押すと何が起きるか**だけを言う。仕組みの説明はしない
          （`docs/island-design.md` 6章・`docs/island-misses.md` 決めごと7）。
          畳んだ国の面でも要るので、畳みの中に入れてある。
          **押すものが1つも無い日は出さない**（押せないものの押し方を言わない）。 */}
      {groups.length > 0 && <p className="nshop-lead">押すと、地図アプリがその店を出す。</p>}

      {groups.length === 0 && (
        <p className="nshop-none">この街のお店は、地図にまだ1軒も載っていない。</p>
      )}

      {groups.map((g) => (
        <div key={g.key} className="nshop-g">
          <h3>
            <Icon name={MARK[g.key]} size={22} />
            {g.label}
          </h3>
          <ShopRows items={g.rows} tz={data.tz} date={date} />
        </div>
      ))}

      {/* 出どころ。**ODbL の表示義務なので消さない**（`docs/nordic-shops.md`）。
          この面の街地図も同じところから来ているので、1行で両方を受け持つ。 */}
      <p className="nshop-osm">
        地図とお店 —{" "}
        <a href={OSM_LICENSE} target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
      </p>
    </>
  );

  if (fold) {
    return (
      <section className="panel paper nshop" id={`shop-${city}`}>
        <div className="folds">
          <Fold
            title={`${city}で、買う`}
            lead={groups.map((g) => g.label).join("・")}
            note={`${data.shops.length}軒`}
          >
            {body}
          </Fold>
        </div>
      </section>
    );
  }

  return (
    <section className="panel paper nshop" id={`shop-${city}`}>
      <h2>{city}で、買う</h2>
      {body}
    </section>
  );
}
