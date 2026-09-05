import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { LEGENDS } from "@/content/legends";
import Icon from "@/components/ui/Icon";
import { Fig } from "@/components/streams/Vid";
import { H, Sheet, Tape, Zone } from "@/components/streams/Sheet";
import { ArtMedal, ArtMeeting, ArtMonument } from "@/components/streams/Art";

export const metadata: Metadata = {
  title: "伝説の丘",
  description: "イランまで12日間歩いた話、GWエジプト祭り、年越し24時間配信。語り継がれている企画たち。",
};

export default function LegendsPage() {
  const [top, ...rest] = LEGENDS;
  /** 新しい順に並べ直す。何が最近の話なのかが先に分かるように。 */
  const wall = [...rest].sort((a, b) => (a.date < b.date ? 1 : -1));
  /** 残っている配信の本数。伝説がどれだけの日数でできているかの目安。 */
  const videos = LEGENDS.reduce((n, l) => n + l.streams.length, 0);
  const oldest = [...LEGENDS].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  /** 「この12日間を読む」の12日。字で埋め込むと、いちばんの1つが入れ替わったとき嘘になる。 */
  const topDays = top.facts?.find((f) => f.unit?.includes("日"));

  return (
    <PageShell crumbs={[{ label: "伝説の丘" }]}>
      {/* カモメは見出しの言い直しをしない（`docs/island-design.md` 5章）。
          「企画会議から生まれる」は下の節で言うので、ここは読みかたの案内だけにする。 */}
      <PageHead
        icon="hall-museum"
        title="伝説の丘"
        lead={`いまでも話に出てくる、大きい企画と大きい日が${LEGENDS.length}つ。どれも週のはじめの企画会議から始まった。`}
        say="数字だけ追っていっても分かるよ。気になったのを押すと、その日ぜんぶが出てくる。"
      />

      <Sheet>
        {/* いちばん語られている1つ。紙の上半分を丸ごと使って、数字を先に見せる */}
        <Zone>
          <Link className="zk-hero lg-hero" href={`/legends/${top.slug}`}>
            <span className="lg-hero-tag">
              <ArtMedal size={20} />
              いちばん語られている
            </span>
            <div className="zk-hero-art">
              <img src={`/sprites/${top.icon}.webp`} alt="" />
            </div>
            <div className="zk-tape-h">
              <Tape>{top.title}</Tape>
            </div>
            <div className="lg-hero-fig">
              <Fig f={top.figure} />
            </div>
            <p className="zk-hero-note">{top.lead}</p>
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
            <span className="zk-open">
              {topDays ? `この${topDays.n}${topDays.unit}を読む` : "この企画を読む"}
              <Icon name="right" size={14} />
            </span>
          </Link>
        </Zone>

        {/* 丘に来た人が最初に思うのは「これ何?」。答え（企画会議で出た一言）を
            一覧より先に置く（`docs/island-ux.md` 5.7）。いちばんの1つだけは、
            この面の主役なので上に残す。 */}
        <Zone>
          <H art={<ArtMeeting size={32} />}>これ、どうやって伝説になったんだろう</H>
          <p className="zk-lead">
            どれも最初は、週のはじめの企画会議で出た一言。「怖いイメージを変えたい」「イワシで3日いける」。
            その場で笑って終わる日もあるし、そのまま来週の予定になる日もある。
          </p>
        </Zone>

        <Zone tight>
          <H art={<ArtMonument size={32} />} note={`${LEGENDS.length}つ・配信 ${videos}本・${oldest.date.slice(0, 4)}年から`}>
            丘に立っているもの
          </H>
          <p className="zk-lead">数字ひとつで、その日に何があったかだいたい分かる。</p>
        </Zone>

        <Zone flush>
          <div className="lg-wall">
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
        </Zone>

      </Sheet>

      <div className="tiles">
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
    </PageShell>
  );
}
