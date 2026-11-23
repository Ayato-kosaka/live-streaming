/**
 * **街の名簿。街の名前と slug を書くのは、ここ1か所**（`docs/spec/model.md` M-6・M-15・M-20）。
 *
 * 載るのは、面（街のガイド `/travel/<国>/<街>`）を持つ街。道と公開前の印の扱いは `content/travel.ts` の
 * `TravelCity` の注。
 *
 * ## なぜ `travel.ts` から分けたか
 *
 * 滞在の表（`content/stays.ts`）が、行った街を**この名簿の slug で**指すため（#1357）。
 * 前は国の面の「行った街」が、滞在の街の名前とガイドの名前が**同じ字かどうか**で結んでいて（M-6 が禁じる結びかた）、
 * 片方の表記を変えた日にカードが黙って外れる形だった。`travel.ts` は国の表を読むので、滞在の表がそこを読むと
 * 輪になる。だから、何も読まないこの1枚に名簿だけを置く。
 *
 * ## 街を足すとき
 *
 * 1. ここに1行（`country` は国の slug、`slug` は道に入る名前、`name` は面の h1 と同じ字）
 * 2. 滞在の表（`content/stays.ts`）の、その街に居た行の `cities` に、**名前ではなく slug** を書く
 *    （名前のまま残すと、読み込んだときに書き出しが止まる。`stays.ts` の下の確かめ）
 * 3. 面（`app/travel/<国>/<街>/page.tsx`）
 *
 * 毎晩の焼き直し（Python）は、滞在の表の slug をこの名簿で名前に開いてから読む（`python/ts_read.py` の `read_stays`）。
 * 配信の欄（`content/cityStreams.ts`）の名前は変わらない。
 */
export type CityRow = {
  /** 国の slug */
  country: string;
  slug: string;
  /** 面の名前（パンくずの最後・h1 と同じ字） */
  name: string;
  /** 公開前（`content/travel.ts` の `TravelCity` の注） */
  draft?: true;
};

export const CITIES: CityRow[] = [
  /* あやとが読んで OK（2026-11-19「いい感じ。結構綺麗」）。公開前の印を外した */
  { country: "north-macedonia", slug: "skopje", name: "スコピエ" },
  { country: "bulgaria", slug: "sofia", name: "ソフィア" },
  /* あやとは 2026-11-21 に着いた（`content/countries.ts` の `AHEAD_COUNTRIES`）。国の面は着いた日に建てた（`GUIDE_ONLY`）。
     あやと 2026-11-20「割といい感じ」「どんどん公開していいよ。あなたの裁量の範囲内」で公開前の印を外した */
  { country: "romania", slug: "bucharest", name: "ブカレスト" },
  /* 行く前の街（移る日は未定）。国の面はまだ無い（`CITY_ONLY`）。
     2026-11-23 に、運営が本番の390幅・型の数・見張りを見て公開前の印を外した */
  { country: "serbia", slug: "belgrade", name: "ベオグラード" },
  /* 行った街（2026-09-28〜10-11）。骨組みを先に置き、行った担当が facts から肉付けする。
     運営が確かめ表（`.claude/skills/city-guide/review.md`）で見てから印を外す */
  { country: "albania", slug: "tirana", name: "ティラナ", draft: true },
  /* 行った街（2026-04-19〜04-28・05-10〜05-23）。運営が確かめ表（`.claude/skills/city-guide/review.md`）で見て、公開前の印を外した */
  { country: "armenia", slug: "yerevan", name: "エレバン" },
];

/** 名簿の街。無ければ `undefined` */
export const cityRow = (country: string, slug: string) => CITIES.find((c) => c.country === country && c.slug === slug);
