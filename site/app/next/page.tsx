import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import NextPlans from "@/components/live/NextPlans";
import { Panel } from "@/components/ui/Bits";
import Link from "next/link";

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
        lead="次に行くところと、やろうとしていること。予定はあやとが書きますが、中身はみんなで。知ってることがあったら付箋を貼ってください。"
        say={GUIDE.next}
      />
      <NextPlans />
      <Panel>
        <h2>もっと大きい企画を出したい</h2>
        <p>「こういうことやってほしい」は掲示板のほうへ。投票の多いものから企画会議に上がります。</p>
        <Link className="tile" href="/board">
          <span className="tile-emoji" aria-hidden>📋</span>
          <span className="tile-text">
            <b>企画掲示板へ</b>
            <i>ログインなしで出せます</i>
          </span>
          <span className="tile-go" aria-hidden>→</span>
        </Link>
      </Panel>
    </PageShell>
  );
}
