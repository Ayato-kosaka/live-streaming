import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { APPS } from "@/content/apps";
import Icon from "@/components/ui/Icon";
import { AnvilArt, DishArt, HeadphoneArt, PhoneShot } from "@/components/atlas/art";

export const metadata: Metadata = {
  title: "アプリ工房",
  description: "旅先で作っている自作アプリ。「なに食べよ」と「なにこれオーディオガイド」。",
};

/**
 * アプリ工房。
 *
 * アプリの棚。1つずつを「箱」として見せる。
 * 名前と一行と画面の絵、中身、そしてダウンロードの札。
 * 節目の年表は中のページに置く（ここに全部出すと、2本のアプリで100行になる）。
 */

/** アプリの画面の絵。本物のスクリーンショットが手元に無いので、作りを絵で描く。 */
const SHOT: Record<string, "food" | "audio"> = {
  nanitabeyo: "food",
  nanikore: "audio",
};

export default function AppsPage() {
  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房" }]}>
      <PageHead
        mark={<AnvilArt size={74} />}
        title="アプリ工房"
        lead="旅をしながらアプリを作っています。目標は食べログ超え。設計も文言も、配信でみんなに相談しながら決めてきました。"
        say={GUIDE.apps}
      />

      <div className="ashelf">
        {APPS.map((a) => (
          <section className="aapp" key={a.slug}>
            <div className="aapp-top">
              {a.logo ? (
                <img className="aapp-logo" src={a.logo} alt="" width={78} height={78} />
              ) : (
                <span className="aapp-logo aapp-logo-art">
                  {a.slug === "nanikore" ? <HeadphoneArt size={58} /> : <DishArt size={58} />}
                </span>
              )}
              <div>
                <h2 className="aapp-name">{a.name}</h2>
                <p className="aapp-line">{a.tagline}</p>
                <div className="chips" style={{ marginTop: 9 }}>
                  <span className="chip">{a.status}</span>
                  <span className="chip">
                    <Icon name="brick" size={13} />
                    {a.milestones.length}の節目
                  </span>
                </div>
              </div>
            </div>

            <PhoneShot className="aapp-shot" width={168} screen={SHOT[a.slug] ?? "food"} />

            <div className="aapp-body">
              <p className="aapp-line" style={{ marginBottom: 12 }}>
                {a.summary}
              </p>
              <div className="afeat">
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

              <div className="aapp-badges">
                {a.links.map((l) => (
                  <a key={l.href} className="abadge" href={l.href} target="_blank" rel="noopener noreferrer">
                    <Icon
                      name={l.label.includes("Google") ? "googleplay" : "appstore"}
                      size={18}
                      tone="color"
                    />
                    {l.label}
                  </a>
                ))}
                <Link className="abadge is-ghost" href={`/apps/${a.slug}`}>
                  <Icon name="book" size={16} />
                  作ってきた記録
                </Link>
              </div>
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
