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
      <Panel>
        <h2>自分も企画を出したい</h2>
        <p>
          「こういうことやってほしい」は掲示板のほうへ。ログインも名前も要りません。
          票の集まったものから、週のはじめの会議に上がります。
        </p>
        <Link className="tile" href="/board">
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
          <span className="tile-text">
            <b>企画掲示板へ</b>
            <i>思いついたことを、そのまま貼る</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <p className="muted" style={{ marginTop: 16 }}>
          ここに並ぶ企画のページも、骨組みから一緒に作っています。書いてくれる人がいると、それだけ良いページになります。
        </p>
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
