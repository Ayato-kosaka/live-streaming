/* 元データは自動生成。**`site/content/nordic/shops.json` を手で直さない。**
 * `python3 tools/nordic/shops.py` で焼き直す（出典と焼き方は `docs/nordic-shops.md`）。
 *
 * 街ごとの「お土産と雑貨」。
 *
 * あやとの言葉（2026-09-13・ビャウィストクにて）:
 *
 * > お土産とか雑貨とか行きたかったけど、あやと島みても見つからず行けなかった
 *
 * だからこの表の役目は1つだけ。**その街で、行きたくなって、たどり着けること。**
 * 名前は現地の綴りのまま持つ（看板を探すのは現地の綴り）。
 */

import SHOPS from "./nordic/shops.json";

export type Shop = {
  id: string;
  /** 店の名前。**現地の綴りのまま。** 読みを当てない */
  name: string;
  /** どの区画に置くか */
  kind: ShopKind;
  /** 何の店か。一言 */
  what: string;
  lat: number;
  lon: number;
  /** 街の中心からの距離(km) */
  km: number;
  /** 通りと番地。無い店もある */
  at: string;
  /** 店が書いている営業時間。**空なら「時間はわからない」と出す。埋めない** */
  open: string;
};

export type ShopKind = "gift" | "zakka" | "food" | "market";

export type CityShops = {
  /**
   * 読めたかどうか。**`false` は「0軒」ではなく「読めていない」。**
   * Overpass は混むと空を返すので、同じ絵にすると「無い」と言い切ることになる
   * （`docs/island-misses.md` #79）。
   */
  ok: boolean;
  /** その街の時計。いま開いているかを画面で数えるのに使う */
  tz: string;
  center: number[];
  shops: Shop[];
};

const CITIES = SHOPS.cities as unknown as Record<string, CityShops>;

/** ODbL の表示義務。**消さない。** */
export const OSM_CREDIT = SHOPS.credit as string;
export const OSM_LICENSE = SHOPS.license as string;

export const shopsOf = (city: string): CityShops | undefined => CITIES[city];

/** 区画の名前。**この順に出す。** 可愛い雑貨とお土産が、先に目に入るように。 */
export const SHOP_KINDS: { key: ShopKind; label: string }[] = [
  { key: "gift", label: "おみやげと工芸" },
  { key: "zakka", label: "雑貨とインテリア" },
  { key: "food", label: "食べておみやげ" },
  { key: "market", label: "市場" },
];

/**
 * 地図アプリを開く行き先。
 *
 * **座標で開く。名前で検索させない。** 同じ名前の別の支店に飛ぶことがある。
 * `geo:` は Android では開くが iPhone の Safari は知らない綴りとして落とす。
 * Google マップの `?api=1` の形なら、**入っていればアプリが開き、
 * 入っていなければブラウザの地図が開く**（iPhone / Android のどちらも）。
 */
export const mapHref = (s: Shop) =>
  `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`;
