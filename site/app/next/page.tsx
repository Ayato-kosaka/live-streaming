import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import NextPlans from "@/components/live/NextPlans";
import { Panel } from "@/components/ui/Bits";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { LEGENDS } from "@/content/legends";
import "./next.css";

export const metadata: Metadata = {
  title: "これから",
  description: "次に行くところ、次にやること。付箋でみんなの知恵を貼れます。",
};

/**
 * これから。
 *
 * この面の主役は `NextPlans`（いちばん近い企画の札と、そのあとの飛び石）。
 * ここで持っているのは、その前後の言葉だけ。
 *
 * 一覧と本文を並べて置かないのは `docs/island-ux.md` 5.8 で決めたとおり。
 * 飛び石の段がそのまま開いて中身になる。目次は無い。
 *
 * 下の1枚は「ここに並んでいるものは、どこから来て、どこへ行くのか」。
 * 掲示板（入口）とこの面（いま）と「伝説の企画」（出口）で一周する。
 * 貼ってから出るまでの3歩の図は掲示板の面が持っているので、ここでは繰り返さない。
 */
export default function NextPage() {
  return (
    <PageShell current="next" crumbs={[{ label: "これから" }]}>
      <PageHead
        icon="tent"
        title="これから"
        lead="次に行くところと、やろうとしていること。日にちはあやとが決めますが、中身はみんなで。"
        say={GUIDE.next}
      />
      <NextPlans />
      {/* この面は紙。読むまとまりは紙のパネルにして、押すもの（掲示板へ・企画を作る）
          だけを板のまま残す（`docs/island-world.md` 2.1）。 */}
      <Panel className="paper">
        <h2>企画は、どこから来てどこへ行くのか</h2>
        <p>
          ここに並んでいるものも、ほとんどが誰かの思いつきから始まった。掲示板に貼る、週のはじめの会議で見る、日にちが決まったらこの面のいちばん上に出る。そして終わったものの中で、いつまでも話に出てくるものが伝説になる。
        </p>
        <Link className="tile" href="/board" style={{ marginTop: "var(--sp-4)" }}>
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
          <span className="tile-text">
            <b>企画をだす</b>
            <i>思いついたことを、そのまま貼る</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        {/* 終わった企画の行き先。前はこの一周が掲示板の面の中でしか見えていなかった。 */}
        <Link className="tile" href="/legends">
          <img className="tile-icon" src="/sprites/hall-museum.webp" alt="" />
          <span className="tile-text">
            <b>伝説の企画へ</b>
            <i>いまも話に出てくる、終わった企画が{LEGENDS.length}つ</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link className="tile" href="/next/new">
          <img className="tile-icon" src="/sprites/signpost.webp" alt="" />
          <span className="tile-text">
            <b>企画のページを作る</b>
            <i>いまは、あやとが声をかけた人だけ</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      </Panel>
    </PageShell>
  );
}
