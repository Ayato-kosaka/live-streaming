import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { APPS, appBySlug, type AppMilestone } from "@/content/apps";
import Icon, { type IconName } from "@/components/ui/Icon";
import { DishArt, HeadphoneArt, PhoneShot } from "@/components/atlas/art";

export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = appBySlug(slug);
  if (!a) return {};
  return { title: a.name, description: a.summary };
}

/**
 * アプリ1本のページ。
 *
 * 上は「いま何ができるアプリか」、下は「どうやってここまで来たか」。
 * 節目は20行を超えるので、年ごとに畳んでおく。いちばん新しい年だけ開く。
 */

/** 節目の種類。5色に塗り分けていたのをやめた。
 *  docs/island-world.md 3.1 で「色で分けていいのは配信の型だけ」と決まっているので、
 *  ここは Icon.tsx の印と言葉で分ける。色は増やさない。 */
const KIND: Record<AppMilestone["kind"], { label: string; icon: IconName }> = {
  release: { label: "リリース", icon: "flag" },
  update: { label: "アップデート", icon: "refresh" },
  build: { label: "作った", icon: "laptop" },
  trouble: { label: "トラブル", icon: "alert" },
  milestone: { label: "節目", icon: "medal" },
};

const SHOT: Record<string, "food" | "audio"> = { nanitabeyo: "food", nanikore: "audio" };

export default async function AppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = appBySlug(slug);
  if (!a) notFound();

  // 節目を年ごとにまとめる。新しい年が上。
  const years: [string, AppMilestone[]][] = [];
  for (const m of [...a.milestones].sort((x, y) => y.date.localeCompare(x.date))) {
    const y = m.date.slice(0, 4);
    if (years[years.length - 1]?.[0] !== y) years.push([y, []]);
    years[years.length - 1][1].push(m);
  }
  const released = a.milestones.find((m) => m.kind === "release");

  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房", href: "/apps" }, { label: a.name }]}>
      <PageHead
        logo={a.logo}
        mark={a.slug === "nanikore" ? <HeadphoneArt size={62} /> : <DishArt size={62} />}
        title={a.name}
        lead={a.tagline}
        meta={
          <>
            <span className="chip dark">{a.status}</span>
            {released && (
              <span className="chip dark">
                <Icon name="calendar" size={13} />
                {released.date.replace(/-/g, "/")} から
              </span>
            )}
          </>
        }
      />

      <Panel className="paper">
        <h2>どんなアプリか</h2>
        <div className="aapp-split">
          <PhoneShot width={200} screen={SHOT[a.slug] ?? "food"} />
          <div>
            <p>{a.summary}</p>
            <div className="afeat" style={{ marginTop: 12 }}>
              {a.features.map((f) => (
                <div key={f.title}>
                  <Icon name="check" size={18} />
                  <span>
                    <b>{f.title}</b>
                    <i>{f.note}</i>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {a.links.length > 0 && (
          <div className="aapp-badges">
            {a.links.map((l) => (
              <a key={l.href} className="abadge" href={l.href} target="_blank" rel="noopener noreferrer">
                <Icon name={l.label.includes("Google") ? "googleplay" : "appstore"} size={18} tone="color" />
                {l.label}
              </a>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="paper">
        <h2>ここまで、どう作ってきたか</h2>
        <p className="muted">年を押すと開きます。配信のリンクは、その日の回そのものです。</p>
        {years.map(([year, list], i) => (
          <Fold key={year} title={`${year}年`} note={`${list.length}件`} open={i === 0}>
            <div className="anote">
              {list.map((m) => (
                <div className="astep" key={m.date + m.title}>
                  <span className="astep-mark" aria-hidden>
                    <Icon name={KIND[m.kind].icon} size={17} />
                  </span>
                  <div className="astep-body">
                    <div className="astep-head">
                      <time>{m.date.replace(/-/g, "/")}</time>
                      <span className="astep-kind">{KIND[m.kind].label}</span>
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
                </div>
              ))}
            </div>
          </Fold>
        ))}
      </Panel>

      <nav className="pager">
        {APPS.filter((x) => x.slug !== a.slug).map((x) => (
          <Link key={x.slug} href={`/apps/${x.slug}`}>
            {x.name}
            <Icon name="right" size={13} />
          </Link>
        ))}
      </nav>
    </PageShell>
  );
}
