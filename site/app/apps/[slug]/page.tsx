import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { ALL_APPS, appBySlug, type AppMilestone } from "@/content/apps";
import Icon, { type IconName } from "@/components/ui/Icon";
import { DishArt, HeadphoneArt, PhoneShot } from "@/components/atlas/art";

export function generateStaticParams() {
  // 配信より前に作っていた1本も面を持つ。旅に出た理由がそこにあるので、
  // 「配信が無い＝面が無い」にしてしまうと、話が繋がらない。
  return ALL_APPS.map((a) => ({ slug: a.slug }));
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
 * 節目は20行を超えるので、年ごとに畳んでおく。閉じたままでも、
 * その年でいちばん新しくやったことは見出しの下に1行出る。
 */

/** 節目の種類。5色に塗り分けていたのをやめた。
 *  docs/island-world.md 3.1 で「色で分けていいのは配信の型だけ」と決まっているので、
 *  ここは Icon.tsx の印と言葉で分ける。色は増やさない。 */
const KIND: Record<AppMilestone["kind"], { label: string; icon: IconName }> = {
  release: { label: "リリース", icon: "flag" },
  /* `refresh`（矢印の輪）は板の「もう一度よみこむ」で使っている操作の印で、
     しかも1色。ここは節目の絵が並ぶ列なので、同じ印を別の意味で借りない。
     アップデートは**ストアへ新しい版を出したこと**なので、上げる絵にする。 */
  update: { label: "アップデート", icon: "upload" },
  build: { label: "作った", icon: "laptop" },
  trouble: { label: "トラブル", icon: "alert" },
  milestone: { label: "節目", icon: "medal" },
};

/* 端末の絵は、そのアプリの画面を描き起こしてある2本ぶんしか無い。
   **無い1本に、あるほうの絵を当てない。** 当てると、旅行計画アプリの面に
   グルメアプリの画面が出て、面が嘘をつく。 */
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
    <PageShell current="apps" crumbs={[{ label: "アプリ", href: "/apps" }, { label: a.name }]}>
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

      <Panel>
        <h2>どんなアプリか</h2>
        {/* この面の主役は画面の絵（`docs/island-world.md` 2章の表）。
            工房の一覧からは外したので、端末を出すのはここだけになった。
            そのぶん大きく取る。 */}
        <div className={SHOT[a.slug] ? "aapp-split" : undefined}>
          {SHOT[a.slug] && <PhoneShot width={240} screen={SHOT[a.slug]} />}
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

      <Panel>
        <h2>ここまで、どう作ってきたか</h2>
        <p className="muted">年を押すと開きます。配信のリンクは、その日の回そのものです。</p>
        {/* どの年も畳んでおく。前はいちばん新しい年を開いていたが、
            2026年だけで9件（約990px）あって、この面が3.7画面になっていた。
            閉じていても、その年でいちばん新しくやったことは見出しの下に出る。 */}
        {years.map(([year, list]) => (
          <Fold key={year} title={`${year}年`} lead={list[0].title} note={`${list.length}件`}>
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
        {ALL_APPS.filter((x) => x.slug !== a.slug).map((x) => (
          <Link key={x.slug} href={`/apps/${x.slug}`}>
            {x.name}
            <Icon name="right" size={13} />
          </Link>
        ))}
      </nav>
    </PageShell>
  );
}
