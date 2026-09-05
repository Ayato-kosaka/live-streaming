import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
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
 * ## この面と `/apps/[アプリ]` の分けかた
 *
 * 前はこの2面がほとんど同じものだった。どちらも
 * 端末の絵・長い紹介文・できること4行・節目の一覧を持っていて、
 * 中へ入っても新しく分かることが無かった。
 *
 * ここは**2本を見くらべる場所**にする。絵・一言・できることの名前・出しているところ。
 * 紹介文と、21件の節目と、そのときの配信は中のページが持つ。
 *
 * できることは、行ではなく平らな札で並べる。押せないものなので厚みは付けない
 * （ac-reference 7章 5）。4行の説明つきで置くと、それだけで 264px あって、
 * 主役の端末より場所を取っていた。
 */

/** アプリの画面の絵。本物のスクリーンショットが手元に無いので、作りを絵で描く。 */
const SHOT: Record<string, "food" | "audio"> = {
  nanitabeyo: "food",
  nanikore: "audio",
};

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
          <Panel key={a.slug}>
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
                {/* 状態と、できることの名前。1つずつの説明は中のページにある。
                    印が付いているほうが「できること」、無いほうが「いまどうなっているか」。 */}
                <div className="chips">
                  <span className="chip">{a.status}</span>
                  {a.features.map((f) => (
                    <span className="chip" key={f.title}>
                      <Icon name="check" size={13} />
                      {f.title}
                    </span>
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
                </div>
              </div>
            </div>

            {/* 中のページへは、何が読めるのかを言って渡す。
                「作ってきた記録」だけだと、21件の配信が付いていることが分からない。 */}
            <Link className="tile" href={`/apps/${a.slug}`}>
              <span className="tile-mark">
                <Icon name="book" size={24} />
              </span>
              <span className="tile-text">
                <b>作ってきた記録</b>
                <i>
                  {a.name}を {fmt(grown[0].date)} から。{a.milestones.length}の節目と、その日の配信
                </i>
              </span>
              <Icon name="right" size={16} className="tile-go" />
            </Link>
          </Panel>
        );
      })}
    </PageShell>
  );
}
