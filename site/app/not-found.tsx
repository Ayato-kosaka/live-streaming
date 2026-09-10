import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";

/**
 * 無い面に来たとき。
 *
 * Next の既定は "404: This page could not be found." の英語1行で、
 * 島から出る道も、戻る道も無い。**115面のうちここだけ別の国の紙**だった。
 *
 * 出すのは3つだけ。ここが無いこと・島にもどる道・探しものを探す道。
 * なぜ無いのか（消えたのか、綴りが違うのか）は言わない。読む人にできることが
 * 何も変わらない（`docs/island-misses.md` 決めごと7）。
 */
export default function NotFound() {
  return (
    <PageShell crumbs={[{ label: "みつからない" }]}>
      <PageHead
        icon="signpost"
        title="この道の先には、なにも無い"
        lead="押した先が島から外れているみたい。"
      />
      <div className="tiles">
        <Link className="tile" href="/">
          <img className="tile-icon" src="/sprites/hut-ayato.webp" alt="" />
          <span className="tile-text">
            <b>島にもどる</b>
            <i>建っているものを、ぜんぶ見る</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link className="tile" href="/all">
          <img className="tile-icon" src="/sprites/signpost.webp" alt="" />
          <span className="tile-text">
            <b>島のなか ぜんぶ</b>
            <i>名前を打って、探しものを見つける</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      </div>
    </PageShell>
  );
}
