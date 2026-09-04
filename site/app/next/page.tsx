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
        lead="次に行くところと、やろうとしていること。予定はあやとが書きますが、中身はみんなで。知ってることがあったら付箋を貼ってください。"
        say={GUIDE.next}
      />
      <NextPlans />
      <Panel>
        <h2>もっと大きい企画を出したい</h2>
        <p>「こういうことやってほしい」は掲示板のほうへ。投票の多いものから企画会議に上がります。</p>
        <Link className="tile" href="/nordic" style={{ marginBottom: 8 }}>
          <span className="tile-text">
            <b>いちばん大きい企画は「ヒッチハイクで北欧へ」</b>
            <i>9月11日出発。ルートと国ごとの見どころ</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link className="tile" href="/board">
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
          <span className="tile-text">
            <b>企画掲示板へ</b>
            <i>ログインなしで出せます</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      </Panel>
      <Panel>
        <h2>企画のページを一緒に作る</h2>
        <p>
          これからの企画のページは、毎回ちゃんと作りたいと思っています。
          骨組みを書いてくれる人がいると、それだけ良いページになります。
        </p>
        <Link className="tile" href="/next/new">
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
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
