import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Isles from "@/components/chain/Isles";
import { atlasIsles } from "@/components/chain/isles";

export const metadata: Metadata = {
  title: "島の地図",
  description:
    "ヨーロッパ、中東、コーカサス、そして北欧。旅の章ごとに、島が1つ建っています。",
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
 * ## 一列に並べるのをやめた
 *
 * あやとの言葉:「島のマップを押すと、今の島が3Dモデル風に出てきて、
 * 左右上矢印が出てきて、押すとその島が出てきて、その島を押すとその島に
 * 移動できるUXがどう森っぽいと思うけどどうだろう？」
 *
 * 縦に5つ並べると一覧としては読めるが、**島が模型に見えない。**
 * いま出るのは1つだけ。左右にとなりの島、上に枝の島がはみ出していて、
 * 押すとそれがまん中に来る。まん中の島を押すと、その島へ渡る。
 *
 * ## 建てるものは、ここ（サーバ）で決める
 *
 * 模型に建っているのは、渡った先の島に本当に建っているもの
 * （`components/isle/world.ts` が決めた並びをそのまま縮めてある）。
 * あの計算は配信240本や企画の表を読むので、**ブラウザには絵と位置だけを渡す**
 * （`components/chain/isles.ts`）。
 */
export default function AtlasPage() {
  return (
    <PageShell crumbs={[{ label: "島の地図" }]}>
      <PageHead
        icon="signpost-flags"
        title="島の地図"
        lead="旅の章ごとに、島が1つ建っています。"
        /* **島の名前を焼き込まない。** 「いまいるのはコーカサスの島」と書いてあると、
           北欧へ出発した日から嘘になる（いまいる島は日付で決まる）。
           かわりに、ここでしか言えないこと——**この画面の遊びかた**——を言う。 */
        say="矢印でとなりの島へ。島を押すと、その島に渡れるよ。"
      />

      <Isles isles={atlasIsles()} />

      {/* 何が建っているかの決めごとは書かない（`docs/island-standards.md` 6章）。
          ここに要るのは、帰り道の1本だけ。 */}
      <p className="chain-foot">
        <Link href="/" prefetch={false}>
          いまの島にもどる
        </Link>
      </p>
    </PageShell>
  );
}
