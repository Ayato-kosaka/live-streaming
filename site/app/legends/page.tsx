import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { LEGENDS } from "@/content/legends";
import Icon from "@/components/ui/Icon";
import { Fig } from "@/components/streams/Vid";
import { H, Sheet, Tape, Zone } from "@/components/streams/Sheet";
import { ArtMedal, ArtMeeting, ArtMonument } from "@/components/streams/Art";
import Ask from "@/components/live/Ask";

export const metadata: Metadata = {
  title: "伝説の企画",
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

  /**
   * もう一度やれるもの。
   *
   * 「ショート動画100万再生」と「登録1000人」は、やり直せる企画ではなく
   * 通り過ぎた出来事なので、選択肢に入れない。押しても叶わないものを混ぜると、
   * 押した先に現実が無くなる。
   *
   * 札の字は `content/legends.ts` から取る。ここで書き写すと、
   * 題名が変わったときにこちらだけ古い字が残る。
   */
  const AGAIN = ["iran-walk", "egypt-festival", "newyear-24h", "roulette-georgia", "kazbegi", "iwashi-festival"];
  const again = AGAIN.map((slug) => LEGENDS.find((l) => l.slug === slug)).filter((l) => !!l);

  return (
    <PageShell crumbs={[{ label: "伝説の企画" }]}>
      {/* カモメは遊び方のある面だけに出す（`docs/island-ux.md` 5.2）。
          ここは読む面なので出さない。読みかた（数字だけ追えば分かる）は
          「丘に立っているもの」の1行が受け持つ。 */}
      <PageHead
        icon="hall-museum"
        title="伝説の企画"
        lead={`いまでも話に出てくる、大きい企画と大きい日が${LEGENDS.length}つ。どれも週のはじめの企画会議から始まった。`}
      />

      <Sheet>
        {/* いちばん語られている1つ。紙の上半分を丸ごと使って、数字を先に見せる */}
        <Zone>
          {/* 一覧のぶんは、指が乗ってから読む（prefetch={false}）。画面に入った時点では読まない */}
          <Link className="zk-hero lg-hero" href={`/legends/${top.slug}`} prefetch={false}>
            <span className="lg-hero-tag">
              <ArtMedal size={20} />
              いちばん語られている
            </span>
            <div className="zk-tape-h">
              <Tape>{top.title}</Tape>
            </div>
            <div className="zk-hero-art">
              {/* 主役の絵は、焼き直したほう（`sprites/hero/`）を直に指す。
                  1x/2x で配ると、等倍の画面がここだけ小さいほうを選ぶ */}
              <img src={`/sprites/hero/${top.icon}.webp`} alt="" />
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
          {/* スマホ幅で「う」1文字だけが2行目に落ちていた。意味を落とさずに縮める */}
          <H art={<ArtMeeting size={32} />}>どうやって伝説になったんだろう</H>
          {/* 2文目（「その場で笑って終わる日もあるし…」）は落とした。
              例の2つで、企画がどこから来るかは言えている。
              丘に立っているものより前に、読み物を3行置かない。 */}
          <p className="zk-lead">
            どれも最初は、週のはじめの企画会議で出た一言。「怖いイメージを変えたい」「イワシで3日いける」。
          </p>
        </Zone>

        {/* 読みかたの1行（「数字ひとつで…」）はここに置かない。
            マスが絵を先に出すようになったので、絵と題名を見れば分かる。
            読む前に読みかたを説明する行は、丘に立っているものより先に出る。 */}
        <Zone tight>
          <H art={<ArtMonument size={32} />} note={`配信 ${videos}本・${oldest.date.slice(0, 4)}年から`}>
            丘に立っているもの
          </H>
        </Zone>

        <Zone flush>
          <div className="lg-wall">
            {wall.map((l) => (
              <Link className="plaque" key={l.slug} href={`/legends/${l.slug}`} prefetch={false}>
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

        {/* 丘に来た人ができることが「読む」しかなかった。
            伝説は週のはじめの企画会議から生まれる、と面の上のほうに書いてあるのに、
            この面から会議へ渡せるものが1つも無かった（掲示板への送りはあるが、
            そこでは200字を書かされる）。**書かずに1つ選べる段**をここに作る
            （`docs/island-play.md` 7章の、押すと書くのあいだの断層）。

            この問いはこの面にしか置けない。丘に何が立っているかを持っているのが
            この面だけで、選択肢がそのまま丘の札になっているから。 */}
        <Zone tight>
          <H art={<ArtMedal size={32} />}>もう一度やるなら</H>
          <p className="zk-lead">
            どれも1回きりで終わった企画。同じことをもう一度やるとしたら、どれがいい?
          </p>
          <Ask
            id="legends-again"
            q="もう一度やるなら、どれ?"
            options={again.map((l) => ({ id: l.slug, label: l.title }))}
            after={
              <>
                ここに無い案は、<Link href="/board">掲示板</Link>に書けます。
              </>
            }
          />
        </Zone>
      </Sheet>

      <div className="tiles">
        <Link className="tile" href="/streams/meeting" style={{ ["--tile" as string]: "var(--roof-gold)" }}>
          <img className="tile-icon" src="/sprites/tower-studio.webp" alt="" />
          <span className="tile-text">
            <b>企画会議を見る</b>
            <i>伝説が生まれる場所</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link className="tile" href="/board" style={{ ["--tile" as string]: "var(--roof-mint)" }}>
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
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
