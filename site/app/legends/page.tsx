import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { Panel } from "@/components/ui/Bits";
import { LEGENDS } from "@/content/legends";
import Icon from "@/components/ui/Icon";
import { Fig } from "@/components/streams/Vid";
import { ArtMedal } from "@/components/streams/Art";

export const metadata: Metadata = {
  title: "伝説の丘",
  description: "イランまで12日間歩いた話、GWエジプト祭り、年越し24時間配信。語り継がれている企画たち。",
};

export default function LegendsPage() {
  const [top, ...rest] = LEGENDS;
  /** 古い順に並べ直す。丘を登っていくように、下から積み上がった順で見せる。 */
  const wall = [...rest].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <PageShell current="streams" crumbs={[{ label: "配信やぐら", href: "/streams" }, { label: "伝説の丘" }]}>
      <PageHead
        icon="hall-museum"
        title="伝説の丘"
        lead="いまでも話に出てくる、大きい企画と大きい日。だいたいは企画会議から生まれています。"
        say={GUIDE.legends}
      />

      {/* いちばん語られている1つだけ、額に入れて壁の真ん中に掛ける */}
      <Link className="lg-top" href={`/legends/${top.slug}`}>
        <span className="lg-top-tag">
          <ArtMedal size={24} />
          いちばん語られている
        </span>
        <img className="lg-top-sprite" src={`/sprites/${top.icon}.webp`} alt="" />
        <div style={{ marginTop: 6 }}>
          <Fig f={top.figure} />
        </div>
        <h3>{top.title}</h3>
        <p>{top.lead}</p>
        {top.facts && (
          <div className="figs">
            {top.facts.map((f) => (
              <Fig key={f.cap} f={f} />
            ))}
            <div>
              <span className="fig">
                <b>{top.streams.length}</b>
                <i>本</i>
              </span>
              <span className="fig-cap">残っている配信</span>
            </div>
          </div>
        )}
        <span className="ty-go" style={{ marginTop: 18, ["--ty" as string]: "var(--gold)" }}>
          この12日間を読む
          <Icon name="right" size={15} />
        </span>
      </Link>

      <Panel>
        <h2>
          <ArtMedal size={30} /> 丘に立っているもの
        </h2>
        <p className="muted">数字を見るだけで、その日に何があったかだいたい分かるようにしてあります。</p>
        <div className="lg-wall" style={{ marginTop: 16 }}>
          {wall.map((l) => (
            <Link className="plaque" key={l.slug} href={`/legends/${l.slug}`}>
              <span className="plaque-badge">
                <img src={`/sprites/${l.icon}.webp`} alt="" loading="lazy" />
              </span>
              <span className="plaque-b">
                <b>{l.title}</b>
                <time>{l.span ?? l.date.replace(/-/g, "/")}</time>
                <span className={`plaque-fig${/^[\d,.]+$/.test(l.figure.n) ? "" : " is-word"}`}>
                  <b>{l.figure.n}</b>
                  {l.figure.unit && <i>{l.figure.unit}</i>}
                  <span>{l.figure.cap}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>どうやって伝説になるのか</h2>
        <p>
          どれも最初は、週のはじめの企画会議で出た一言でした。「怖いイメージを変えたい」「イワシで3日いける」。
          その場で笑って終わることもあるし、そのまま来週の予定になることもある。
        </p>
        <div className="tiles" style={{ marginTop: 14 }}>
          <Link className="tile" href="/streams/meeting" style={{ ["--tile" as string]: "var(--roof-gold)" }}>
            <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
            <span className="tile-text">
              <b>企画会議を見る</b>
              <i>伝説が生まれる場所</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
          <Link className="tile" href="/board" style={{ ["--tile" as string]: "var(--roof-mint)" }}>
            <img className="tile-icon" src="/sprites/mailbox.webp" alt="" />
            <span className="tile-text">
              <b>次の伝説を出す</b>
              <i>掲示板に書くと、会議に持っていく</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
        </div>
      </Panel>
    </PageShell>
  );
}
