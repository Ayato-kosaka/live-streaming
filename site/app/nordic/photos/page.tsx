import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import GoTo from "@/components/ui/GoTo";
import Icon from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "旅の写真",
  description: "旅のその日の写真は、あやと島カードにまとまりました。",
  alternates: { canonical: "/cards" },
  robots: { index: false, follow: true },
};

/**
 * 旅の写真。**あやと島カード（`/cards`）へ寄せたので、ここは送るだけ。**
 *
 * あやとの言葉（2026-09-10）:
 *
 * > https://.../nordic/photos のルーティングがおかしい。（略）
 * > そもそもこの画面入らなくて cards に統合すべきでは？
 *
 * ## 面ごと消さない理由
 *
 * `output: "export"` なので、面を消すと `dist` からファイルが消える。
 * Firebase の受け皿（`firebase.json` の `"source": "**"`）は、見つからない
 * URL に**島の玄関を 200 で返す。** 404 にすらならないので、貼られていた
 * URL を踏んだ人は、なぜ違う面が出たのか分からない。**貼られた URL は
 * 生かしたまま送る。**
 *
 * 本筋は Hosting の 301（`firebase.json` の `redirects`）。ここはその
 * 手前で開いた人と、設定が外れたときのための控え。
 */
export default function NordicPhotosPage() {
  return (
    <PageShell
      current="next"
      crumbs={[
        { label: "これから", href: "/next" },
        { label: "北欧ヒッチハイク", href: "/nordic" },
        { label: "旅の写真" },
      ]}
    >
      <GoTo to="/cards" />
      <section className="panel paper">
        <h1>旅の写真</h1>
        <p className="muted">あやと島カードにまとまりました。</p>
        <Link className="tile" href="/cards">
          <span className="tile-mark">
            <Icon name="island" size={24} />
          </span>
          <span className="tile-text">
            <b>あやと島カード</b>
            <i>その日の写真に、キャラクターを1人だけ入れて持って帰れます</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </section>
    </PageShell>
  );
}
