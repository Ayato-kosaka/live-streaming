import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
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
 * アプリ1本を紙1枚にする。いちばん大きく出すのは**アプリの画面**で、
 * 言葉はそのまわりに置く（docs/ac-reference.md 7章「主役の絵は大きく」）。
 *
 * 節目は「機能が増えた順」に畳んで置く。増えていく様子がこのアプリの中身なので、
 * 中のページまで行かないと見えない、という置きかたにはしない。
 */

/** アプリの画面の絵。本物のスクリーンショットが手元に無いので、作りを絵で描く。 */
const SHOT: Record<string, "food" | "audio"> = {
  nanitabeyo: "food",
  nanikore: "audio",
};

/** 節目の種類。色では分けない（docs/island-world.md 3.1）。印と言葉で分ける。 */
const KIND = {
  release: { icon: "flag", label: "出した" },
  update: { icon: "refresh", label: "更新" },
  build: { icon: "laptop", label: "作った" },
  trouble: { icon: "alert", label: "つまずいた" },
  milestone: { icon: "medal", label: "節目" },
} as const;

const fmt = (d: string) => d.replace(/-/g, "/");

export default function AppsPage() {
  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房" }]}>
      <PageHead
        mark={<AnvilArt size={74} />}
        title="アプリ工房"
        lead="旅をしながらアプリを作っています。目標は食べログ超え。設計も文言も、配信でみんなに相談しながら決めてきました。"
      />

      {APPS.map((a) => {
        // 増えた順。作った順に読むから「増えていった」ことが分かる。
        const grown = [...a.milestones].sort((x, y) => x.date.localeCompare(y.date));
        return (
          <Panel className="paper" key={a.slug}>
            <h2>{a.name}</h2>

            <div className="aapp-hero">
              <PhoneShot className="aapp-shot" width={210} screen={SHOT[a.slug] ?? "food"} />
              <div className="aapp-said">
                <div className="aapp-id">
                  {a.logo ? (
                    <img className="aapp-logo" src={a.logo} alt="" width={56} height={56} />
                  ) : (
                    <span className="aapp-logo aapp-logo-art">
                      {a.slug === "nanikore" ? <HeadphoneArt size={42} /> : <DishArt size={42} />}
                    </span>
                  )}
                  <p className="aapp-line">{a.tagline}</p>
                </div>
                <p className="aapp-sum">{a.summary}</p>
                <div className="chips">
                  <span className="chip">{a.status}</span>
                  <span className="chip">
                    <Icon name="brick" size={13} />
                    {a.milestones.length}の節目
                  </span>
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
            </div>

            <h3>いま、これができる</h3>
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

            {/* 21行を素で並べると、2本のアプリでこの面が100行になる。畳んで置く。 */}
            <div className="hlist" style={{ marginTop: 14 }}>
              <Fold title="機能が増えた順" note={`${grown.length}件`}>
                <ol className="agrow">
                  {grown.map((m) => (
                    <li key={m.date + m.title}>
                      <span className="agrow-mark" aria-hidden>
                        <Icon name={KIND[m.kind].icon} size={14} />
                      </span>
                      <time>{fmt(m.date)}</time>
                      <b>{m.title}</b>
                      {m.note && <i>{m.note}</i>}
                    </li>
                  ))}
                </ol>
              </Fold>
            </div>
          </Panel>
        );
      })}
    </PageShell>
  );
}
