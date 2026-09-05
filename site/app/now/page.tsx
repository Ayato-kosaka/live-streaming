import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import NowLive from "@/components/live/NowLive";
import { Panel } from "@/components/ui/Bits";
import { PROFILE, LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Link from "next/link";

export const metadata: Metadata = {
  title: "いま何してる",
  description: "あやとが今どこにいて、今週なにをするか。",
};

export default function NowPage() {
  return (
    <PageShell current="friends" crumbs={[{ label: "あやと島について", href: "/about" }, { label: "いまのポスト" }]}>
      <PageHead
        icon="mailbox"
        title="いま何してる"
        lead="今どこにいて、今週なにをするか。ここは毎日書きかわります。"
        say={GUIDE.now}
      />
      <NowLive />
      <Panel>
        <h2>あやとって誰</h2>
        <p>
          <b>{PROFILE.lead}</b>
        </p>
        {PROFILE.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="tiles" style={{ marginTop: 14 }}>
          {LINKS.filter((l) => l.id === "youtube" || l.id === "app").map((l) => (
            <a key={l.id} className="tile" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.logo ? (
                  <img className="tile-logo" src={l.logo} alt="" />
                ) : (
                  <img className="tile-icon" src={`/sprites/${l.icon}.webp`} alt="" />
                )}
              <span className="tile-text">
                <b>{l.label}</b>
                <i>{l.note}</i>
              </span>
              <Icon name="external" size={15} className="tile-go" />
            </a>
          ))}
        </div>
      </Panel>
      <Panel>
        <h2>もっと先の話</h2>
        <div className="tiles">
          <Link className="tile" href="/next">
            <img className="tile-icon" src="/sprites/tent.webp" alt="" />
            <span className="tile-text">
              <b>これから</b>
              <i>次に行くところ、次にやること</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
          <Link className="tile" href="/map">
            <img className="tile-icon" src="/sprites/canoe.webp" alt="" />
            <span className="tile-text">
              <b>旅の桟橋</b>
              <i>これまでに歩いた国</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
        </div>
      </Panel>
    </PageShell>
  );
}
