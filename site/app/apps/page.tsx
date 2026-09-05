import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { APPS } from "@/content/apps";
import Icon from "@/components/ui/Icon";
import { AnvilArt, DishArt, HeadphoneArt } from "@/components/atlas/art";

export const metadata: Metadata = {
  title: "アプリ工房",
  description: "旅先で作っている自作アプリ。「なに食べよ」と「なにこれオーディオガイド」。",
};

/**
 * アプリ工房。**2本を見くらべる作業台。**
 *
 * ## この面から端末の絵を外した理由
 *
 * `docs/island-world.md` 2章の表は、この面の主役を「アプリ2つ」、
 * `/apps/[アプリ]` の主役を「画面の絵」と分けている。
 * どちらの面も端末の絵（`PhoneShot` 393px）を出していて、
 * この面ではそれが縦の 37%（2,137px 中 786px）を取っていた。
 *
 * そのうえ端末の絵は、2本とも同じ作りの当てもの（本物の画面は手元に無い）。
 * **いちばん大きいものが、2本の違いを何も言っていない。**
 * 端末はアプリ1本の面に譲って、ここはアプリそのもの（アイコン）と、
 * 2本を見くらべられる数だけにする。
 *
 * ## ここにしか無いもの
 *
 * **いちばん新しくやったこと。** 節目は `/apps/[アプリ]` に21件と4件あるが、
 * 畳んであるので「いま動いているのはどっちか」がこの面から見えなかった。
 * 2本を並べて最新の1件ずつを出すと、片方が毎月動いていて、
 * 片方が1年止まっていることがその場で分かる。
 */

const fmt = (d: string) => d.replace(/-/g, "/");

export default function AppsPage() {
  return (
    <PageShell current="apps" crumbs={[{ label: "アプリ工房" }]}>
      <PageHead
        mark={<AnvilArt size={74} />}
        title="アプリ工房"
        lead="旅をしながらアプリを作っています。目標は食べログ超え。設計も文言も、配信でみんなに相談しながら決めてきました。"
      />

      {/* 広い画面では2本を横に並べる。この面の用事は見くらべることなので、
          縦に積むと、2本目を見るころには1本目が画面から出ている。 */}
      <div className="aworks">
        {APPS.map((a) => {
          // 増えた順。作った順に読むから「増えていった」ことが分かる。
          const grown = [...a.milestones].sort((x, y) => x.date.localeCompare(y.date));
          const latest = grown[grown.length - 1];
          const videos = a.milestones.filter((m) => m.videoId).length;
          return (
            <Panel key={a.slug} className="awork">
              <h2>{a.name}</h2>

              <div className="awork-id">
                {a.logo ? (
                  <img className="aapp-logo" src={a.logo} alt="" width={72} height={72} />
                ) : (
                  <span className="aapp-logo aapp-logo-art">
                    {a.slug === "nanikore" ? <HeadphoneArt size={52} /> : <DishArt size={52} />}
                  </span>
                )}
                <div>
                  <p className="aapp-line">{a.tagline}</p>
                  {/* 状態は、できることの札と同じ形にしない。
                      前は「運営中」と「気分から絞る」が同じオリーブの札で並んでいて、
                      印が付いているかどうかでしか区別が付かなかった。 */}
                  <span className="awork-state">{a.status}</span>
                </div>
              </div>

              {/* できることは平らな札で。押せないものに厚みは付けない
                  （`docs/ac-reference.md` 7章 5）。1つずつの説明は中のページにある。 */}
              <div className="chips">
                {a.features.map((f) => (
                  <span className="chip" key={f.title}>
                    <Icon name="check" size={13} />
                    {f.title}
                  </span>
                ))}
              </div>

              {/* 2本を見くらべる数。ぜんぶ `content/apps.ts` に書いてある日付と件数で、
                  画面が出てから数え直すものは無い（`docs/island-world.md` 4.3 ④）。 */}
              <dl className="awork-num">
                <div>
                  <dt>はじめた日</dt>
                  <dd>{fmt(grown[0].date)}</dd>
                </div>
                <div>
                  <dt>節目</dt>
                  <dd>
                    {a.milestones.length}
                    <i>件</i>
                  </dd>
                </div>
                <div>
                  <dt>残っている配信</dt>
                  <dd>
                    {videos}
                    <i>本</i>
                  </dd>
                </div>
              </dl>

              {/* 作業台の上に、いま何が載っているか。
                  節目は中のページで年ごとに畳んであるので、この1件だけ外に出す。 */}
              <a
                className="awork-now"
                href={`https://www.youtube.com/watch?v=${latest.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="awork-now-t">いちばん新しくやったこと</span>
                <b>{latest.title}</b>
                <span className="awork-now-go">
                  {fmt(latest.date)} の配信
                  <Icon name="external" size={13} />
                </span>
              </a>

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

              {/* 中のページへは、何が読めるのかを言って渡す。
                  「作ってきた記録」だけだと、節目と配信が付いていることが分からない。 */}
              <Link className="tile" href={`/apps/${a.slug}`}>
                <span className="tile-mark">
                  <Icon name="log" size={24} />
                </span>
                <span className="tile-text">
                  <b>作ってきた記録</b>
                  <i>
                    {a.milestones.length}の節目と、その日の配信。アプリの画面も
                  </i>
                </span>
                <Icon name="right" size={16} className="tile-go" />
              </Link>
            </Panel>
          );
        })}
      </div>
    </PageShell>
  );
}
