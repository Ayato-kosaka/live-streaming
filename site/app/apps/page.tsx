import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { APPS } from "@/content/apps";

export const metadata: Metadata = {
  title: "アプリ工房",
  description: "旅先で作っている自作アプリ。「なに食べよ」と「なにこれオーディオガイド」の歴史。",
};

export default function AppsPage() {
  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房" }]}>
      <PageHead
        emoji="💻"
        title="アプリ工房"
        lead="旅をしながらアプリを作っています。目標は食べログ超え。設計も文言も、配信でみんなに相談しながら決めてきました。"
      />
      {APPS.map((a) => (
        <Panel key={a.slug}>
          <h2>
            <span aria-hidden>{a.emoji}</span> {a.name}
          </h2>
          <div className="chips" style={{ marginBottom: 10 }}>
            <span className="chip">{a.status}</span>
            <span className="chip">🧱 {a.milestones.length} の節目</span>
          </div>
          <p>{a.tagline}</p>
          <p>{a.summary}</p>
          <div className="tiles" style={{ marginTop: 14 }}>
            <Link className="tile" href={`/apps/${a.slug}`}>
              <span className="tile-emoji" aria-hidden>{a.emoji}</span>
              <span className="tile-text">
                <b>{a.name}の歴史を見る</b>
                <i>作り始めから今日までの全部</i>
              </span>
              <span className="tile-go" aria-hidden>→</span>
            </Link>
            {a.links.map((l) => (
              <a key={l.href} className="tile" href={l.href} target="_blank" rel="noopener noreferrer">
                <span className="tile-emoji" aria-hidden>⬇️</span>
                <span className="tile-text">
                  <b>{l.label}</b>
                  <i>ダウンロード</i>
                </span>
                <span className="tile-go" aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </Panel>
      ))}
    </PageShell>
  );
}
