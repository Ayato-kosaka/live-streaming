import WIDE from "@/content/heroWide.json";

/**
 * 図鑑の主役の絵（#150）。
 *
 * ## なぜ部品にしたか
 *
 * 主役の絵は4か所で出ている（`/kitchen/[品]`・`/legends/[企画]`・`/legends`・
 * `/streams/[型]`）。どれも `<img src="/sprites/hero/….webp">` を手で書いて
 * いて、**大きいほうを出す条件を4回書くことになる。** 1か所直し忘れると、
 * その面だけぼける。
 *
 * ## 横に長い絵だけ、広い画面で2倍を出す
 *
 * 主役の箱は、高さで止まるか幅で止まるかのどちらか。
 *
 *   正方形に近い絵 … 高さ 300px で止まる → 2倍画面で 600px。640 で足りる
 *   横に長い絵     … 幅 640px で止まる  → 2倍画面で 1280px。**640 では半分**
 *
 * `hero/food-egg-cooked`（卵焼き・2.15:1）が実測 2.0倍だった。
 * 焼くほうで `@2x` を別に書いてある（`tools/sprites/meta.py`）。
 *
 * ## `srcset` ではなく `media` で選ぶ
 *
 * `srcset` の `x` で書くと、**等倍の広い画面が小さいほうを選んでぼける。**
 * `w` で書くと、こんどは**スマホが大きいほうを取ってしまう**
 * （390px の紙でも 2倍画面なら 716px 要ると数えるので、991px のほうを選ぶ）。
 * あやとの視聴者さんはスマホが主なので、そちらを重くして PC を直すのは逆。
 *
 * **画面の広さで切る。** 狭い画面はいままでどおり 640px の1枚だけを取る。
 *
 * どの絵に2倍があるかは `content/heroWide.json`（焼いたときに書き出す）。
 * **画面から推測させない。** 無い絵に `@2x` を書くと 404 を取りにいく。
 */
export default function HeroArt({ icon, alt = "" }: { icon: string; alt?: string }) {
  if (!(WIDE as string[]).includes(icon)) {
    return <img src={`/sprites/hero/${icon}.webp`} alt={alt} />;
  }
  return (
    <picture>
      <source media="(min-width: 900px)" srcSet={`/sprites/hero/${icon}@2x.webp`} />
      <img src={`/sprites/hero/${icon}.webp`} alt={alt} />
    </picture>
  );
}
