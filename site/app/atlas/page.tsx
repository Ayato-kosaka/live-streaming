import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Chain from "@/components/chain/Chain";

export const metadata: Metadata = {
  title: "島の地図",
  description:
    "ヨーロッパ、中東、コーカサス、そして北欧。旅の章ごとに島が1つ建っています。島の大きさは、そこにいた日数そのもの。",
};

/**
 * 島の地図。**旅そのものを見せる、たった1枚の画面**（`docs/island-atlas.md`）。
 *
 * ## なぜトップにしないか
 *
 * 毎日来る人に、島へ入るための1タップを増やさない、とオーナーが決めている
 * （同 7章）。`/` はいままでどおり「いまの島」に降り立つ。
 * ここへは島の右上の「島の地図」から来る。
 *
 * ## 出しているもの
 *
 * 島の大きさ・かたち・草木は、全部その章の事実から引いている
 * （`components/chain/shapes.ts`）。手で「この島は大きめ」と決めた島はひとつも無い。
 * 数字（人数・本数）は BigQuery から焼いた `content/chapterStats.ts`。
 */
export default function AtlasPage() {
  return (
    <PageShell crumbs={[{ label: "島の地図" }]}>
      <PageHead
        icon="signpost-flags"
        title="島の地図"
        lead="旅の章ごとに、島が1つ建っています。島の大きさは、そこにいた日数そのもの。長くいた島ほど大きい。"
        say="押すと、その島へ渡れるよ。いまいるのはコーカサスの島。"
      />

      <div className="chain-sea">
        <Chain />
      </div>

      <p className="chain-foot">
        島の中に建っているものは、その章のときにやっていたことだけ。
        いまの島の6つを、過去の島に写してはいません。
        <Link href="/" prefetch={false}>
          いまの島にもどる
        </Link>
      </p>
    </PageShell>
  );
}
