import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import NextPlans from "@/components/live/NextPlans";
import { Panel } from "@/components/ui/Bits";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { Stone } from "@/components/live/art";

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
        <p>
          ここに並んでいるものも、ほとんどが誰かの思いつきから始まった。掲示板からこのページまで、3歩。
        </p>
        {/* どこへ届くのかが見えないと、書いても意味がない気がして手が止まる。
            掲示板と同じ3歩を、行き先の側からも見せておく。 */}
        <ol className="bd-flow">
          {[
            { t: "掲示板に貼る", n: "ログインも名前も要りません" },
            { t: "週のはじめの会議", n: "票の集まったものから見ます" },
            { t: "このページに出る", n: "日にちが決まったら、いちばん上に" },
          ].map((f, i) => (
            <li key={f.t}>
              <span className="nx-stone">
                <Stone tone={i === 2 ? "now" : "stone"} />
                <b>{i + 1}</b>
              </span>
              <span>
                <b>{f.t}</b>
                <i>{f.n}</i>
              </span>
            </li>
          ))}
        </ol>
        <Link className="tile" href="/board" style={{ marginTop: "var(--sp-4)" }}>
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
          <span className="tile-text">
            <b>企画掲示板へ</b>
            <i>思いついたことを、そのまま貼る</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <p className="muted" style={{ marginTop: "var(--sp-4)" }}>
          企画のページも、骨組みから一緒に作っている。書いてくれる人がいるほど、中身が濃くなる。
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
