import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { APPS, appBySlug } from "@/content/apps";
import Icon from "@/components/ui/Icon";

export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = appBySlug(slug);
  if (!a) return {};
  return { title: a.name, description: a.summary };
}

const KIND: Record<string, { label: string; color: string }> = {
  release: { label: "リリース", color: "#f0798d" },
  update: { label: "アップデート", color: "#5bb8e4" },
  build: { label: "作った", color: "#7fd3a2" },
  trouble: { label: "トラブル", color: "#ffa24d" },
  milestone: { label: "節目", color: "#ffc94d" },
};

export default async function AppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = appBySlug(slug);
  if (!a) notFound();
  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房", href: "/apps" }, { label: a.name }]}>
      <PageHead
        icon={a.logo ? undefined : a.icon}
        logo={a.logo}
        title={a.name}
        lead={a.tagline}
        meta={a.links.map((l) => (
          <a key={l.href} className="chip dark" href={l.href} target="_blank" rel="noopener noreferrer">
            <Icon name={l.label.includes("Google") ? "googleplay" : l.label.includes("App Store") ? "appstore" : "external"} size={15} />
            {l.label}
          </a>
        ))}
      />
      <Panel>
        <h2>どんなアプリか</h2>
        <p>{a.summary}</p>
      </Panel>
      <Panel>
        <h2>ここまでの歴史</h2>
        <ol className="tl">
          {a.milestones.map((m) => (
            <li key={m.date + m.title}>
              <span className="tl-dot" style={{ background: KIND[m.kind].color }} aria-hidden />
              <div className="tl-body">
                <div className="tl-head">
                  <time>{m.date.replace(/-/g, "/")}</time>
                  <span className="chip" style={{ borderColor: KIND[m.kind].color }}>
                    {KIND[m.kind].label}
                  </span>
                </div>
                <b>{m.title}</b>
                {m.note && <i>{m.note}</i>}
                {m.videoId && (
                  <a href={`https://www.youtube.com/watch?v=${m.videoId}`} target="_blank" rel="noopener noreferrer">
                    この日の配信
                    <Icon name="external" size={12} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </PageShell>
  );
}
