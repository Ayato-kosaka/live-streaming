import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { Panel } from "@/components/ui/Bits";
import { APPS } from "@/content/apps";
import Icon from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "アプリ工房",
  description: "旅先で作っている自作アプリ。「なに食べよ」と「なにこれオーディオガイド」の歴史。",
};

export default function AppsPage() {
  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房" }]}>
      <PageHead
        icon="hut-workshop"
        title="アプリ工房"
        lead="旅をしながらアプリを作っています。目標は食べログ超え。設計も文言も、配信でみんなに相談しながら決めてきました。"
        say={GUIDE.apps}
      />
      {APPS.map((a) => (
        <Panel key={a.slug}>
          <h2>
            <img className={a.logo ? "h2-logo" : "h2-icon"} src={a.logo ?? `/sprites/${a.icon}.webp`} alt="" /> {a.name}
          </h2>
          <div className="chips" style={{ marginBottom: 10 }}>
            <span className="chip">{a.status}</span>
            <span className="chip">🧱 {a.milestones.length} の節目</span>
          </div>
          <p>{a.tagline}</p>
          <p>{a.summary}</p>
          <div className="tiles" style={{ marginTop: 14 }}>
            <Link className="tile" href={`/apps/${a.slug}`}>
              <img className={a.logo ? "tile-logo" : "tile-icon"} src={a.logo ?? `/sprites/${a.icon}.webp`} alt="" />
              <span className="tile-text">
                <b>{a.name}の歴史を見る</b>
                <i>作り始めから今日までの全部</i>
              </span>
              <Icon name="right" size={15} className="tile-go" />
            </Link>
            {a.links.map((l) => (
              <a key={l.href} className="tile" href={l.href} target="_blank" rel="noopener noreferrer">
                <img className={a.logo ? "tile-logo" : "tile-icon"} src={a.logo ?? "/sprites/food-plate-dinner.webp"} alt="" />
                <span className="tile-text">
                  <b>{l.label}</b>
                  <i>ダウンロード</i>
                </span>
                <Icon name="external" size={15} className="tile-go" />
              </a>
            ))}
          </div>
        </Panel>
      ))}
    </PageShell>
  );
}
