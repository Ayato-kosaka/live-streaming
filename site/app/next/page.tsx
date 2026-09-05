import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import NextPlans from "@/components/live/NextPlans";
import { Panel } from "@/components/ui/Bits";
import Link from "next/link";
import Icon from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "これから",
  description: "次に行くところ、次にやること。付箋でみんなの知恵を貼れます。",
};

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
        <h2>自分も企画を出したい</h2>
        {/* 貼ってから、ここに出るまでの3歩は掲示板の面が図で持っている。
            同じ図をこちらにも置くと、島じゅうで3回同じことを言うことになるので、
            ここでは行き先の側から1行だけ言う。 */}
        <p>
          ここに並んでいるものも、ほとんどが誰かの思いつきから始まった。掲示板に貼る、週のはじめの会議で見る、日にちが決まったらこの面のいちばん上に出る。
        </p>
        <Link className="tile" href="/board" style={{ marginTop: "var(--sp-4)" }}>
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
          <span className="tile-text">
            <b>企画掲示板へ</b>
            <i>思いついたことを、そのまま貼る</i>
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
