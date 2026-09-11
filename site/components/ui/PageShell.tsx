import Link from "next/link";
import type { ReactNode } from "react";
import { SPOTS } from "../island/layout";
import { Gull } from "../island/Guide";
import PlaceList, { ALL_HREF, ALL_LABEL } from "./PlaceList";
import MeButton from "./MeButton";
import { FOOT, UI } from "@/content/voice";
import HashJump from "./HashJump";
import Say from "./Say";

export { ALL_HREF, ALL_LABEL };

type Crumb = { label: string; href?: string };

/**
 * 看板。
 *
 * ## 狭い画面は1段。行き先の一覧は持たない
 *
 * 9月5日まで、狭い画面の看板は 129px あった。6つの札が3列×2段に並ぶので、
 * どうしても2段ぶんの背が要る。その下に現在地の行（48〜89px）が続くので、
 * **中身が始まるまでに 177〜218px、1画面の 21〜26% を、106面ぜんぶが
 * 同じ絵で使っていた。**
 *
 * 狭い画面の看板は
 *
 *     [ 島 ]   いま：○○
 *
 * の1段だけ。**「いま、どこ」しか言わない。**
 *
 * ## 「ぜんぶ」（`/all`）は看板から外した
 *
 * あやとの言葉:「あやとのこと等おした、ヘッダについて、「全部」は出さなくて良い」。
 * 一度は狭い画面の唯一の口として看板に入れたが、紙の終わり（砂浜）が
 * **同じ一覧を開いたまま**持っているので、面を開くたびに上と下で2回誘っていた。
 *
 * **到達性は落ちない。** 砂浜の「島のなか ぜんぶ」から `/all` が1タップ、
 * そこから96枚が2タップ。看板に出していたときと同じ数で着く。
 * 10軒は砂浜から1タップ（看板の6つは広い画面ならそのまま1タップ）。
 *
 * ## 広い画面（900px 以上）は6つの札のまま
 *
 * あちらは元から1段で、背は 78px しかない。畳む理由が無いので触らない。
 * どちらの器を出すかは CSS が決める（`app/css/pages.css` の `.ih-nav`）。
 * **`display: none` で消すので、隠れているほうは読み上げにも出てこない。**
 */
export function IslandHeader({
  current,
  here,
}: {
  current?: string;
  /** いま居る面の名前。パンくずの最後の1つ。 */
  here?: string;
}) {
  return (
    <header className="ih">
      <div className="ih-in">
        {/* ここだけは先読みを残す。島は全部の面のハブで、いちばん押される。
            それに、ほとんどの人は島から入ってくるので、島の JS はもう
            キャッシュに乗っている。残しても実際には払わない。 */}
        <Link href="/" className="ih-home">
          <Gull size={26} shadow={false} />
          <b>あやと島</b>
        </Link>
        {/* 狭い画面の「いま、どこ」。札の朱枠が消えるぶんを字で言う。
            パンくずは狭い画面で隠れる面があるので、ここは別に持つ。 */}
        {here && (
          <p className="ih-here">
            <span aria-hidden>いま</span>
            <b>{here}</b>
          </p>
        )}
        {/* ここには「ぜんぶ」（`/all`）への板があった。**看板からは外した。**
            あやとの言葉:「あやとのこと等おした、ヘッダについて、
            「全部」は出さなくて良い」。

            看板は「いま、どこ」を言うためのもので、行き先の索引は
            紙の終わり（砂浜 `.ifoot-doors`）が開いたまま持っている。
            上と下の両方に同じ口を出すと、面を開くたびに2回誘うことになる。

            **到達性は落ちない。** 砂浜の「島のなか ぜんぶ」から `/all` が
            1タップ、そこから96枚が2タップ。看板に出していたときと同じ数。 */}
        <nav className="ih-nav" aria-label="島のなか">
          {SPOTS.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              prefetch={false}
              className={`ih-link${current === s.id ? " is-on" : ""}`}
            >
              <img src={`/sprites/${s.icon}.webp`} alt="" />
              {s.label}
            </Link>
          ))}
        </nav>
        {/* 自分のアイコン。**ログインしている人にだけ出る**（`MeButton`）。
            島での見え方・貼った付箋・出した企画・ログアウトは、
            この先の1か所にまとめてある（#163）。 */}
        <MeButton />
      </div>
    </header>
  );
}

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="現在地">
      {/* 上の帯にも同じ「島」があるので、ここは先読みしない。
          途中の階層は行き先が重い。/nordic/sweden のパンくずから /nordic を
          先読みすると、それだけで 41KB(素 646KB)。押されるとは限らないぶんは持たない。 */}
      <Link href="/" prefetch={false}>
        島
      </Link>
      {items.map((it) => (
        <span key={it.label}>
          <i aria-hidden>›</i>
          {it.href ? (
            <Link href={it.href} prefetch={false}>
              {it.label}
            </Link>
          ) : (
            <b>{it.label}</b>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHead({
  icon,
  emoji,
  mark,
  logo,
  title,
  lead,
  say,
  meta,
}: {
  /** 見出しの絵。島に置いてあるスプライト名。 */
  icon?: string;
  /** 中身そのものを表す印(国旗や料理)。UIの飾りには使わない。 */
  /** 絵文字。もう使わない。残っているのは移行中のページだけ。 */
  emoji?: string;
  /** 自前の印（国旗やアイコン）。emoji の置き換え。 */
  mark?: ReactNode;
  /** 公式のアプリアイコンなど */
  logo?: string;
  title: string;
  /** 前置き。**「いま」を言う面では、そこだけリンクを混ぜられるように節で受ける**
      （`app/map/parts.tsx`）。旅のあいだだけ言い方の変わる1行（`Say`）も部品で来る。
      ほとんどの面は文字列のまま渡す。 */
  lead?: ReactNode;
  /** 案内役のひとこと。 */
  say?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="phead">
      {logo && <img className="phead-logo" src={logo} alt="" />}
      {!logo && icon && <img className="phead-icon" src={`/sprites/${icon}.webp`} alt="" />}
      {!logo && !icon && mark && <span className="phead-mark" aria-hidden>{mark}</span>}
      {!logo && !icon && !mark && emoji && <span className="phead-mark" aria-hidden>{emoji}</span>}
      <h1>{title}</h1>
      {lead && <p className="phead-lead">{lead}</p>}
      {say && (
        <div className="gsay phead-say">
          <span className="gsay-bird"><Gull size={52} /></span>
          <p className="gsay-bubble">{say}</p>
        </div>
      )}
      {meta && <div className="phead-meta">{meta}</div>}
    </div>
  );
}

/**
 * ページの終わり。島に戻ってきたところ（`docs/island-world.md` 1.6-3）。
 *
 * **ここは開いたまま置く。島の中で `/all` へ行ける口は、ここだけ。**
 * 看板からも島の上からも外したので、行き先の索引はこの1か所が持つ。
 * 一覧を書くのは `PlaceList` なので、行き先が増えても直すのは1か所。
 */
export function IslandFooter({ current, atAll }: { current?: string; atAll?: boolean }) {
  return (
    <footer className="ifoot">
      {/* 上の帯の「あやと島」と同じ行き先。二重に先読みしても意味がない */}
      <Link href="/" className="ifoot-back" prefetch={false}>
        <Gull size={24} shadow={false} /> {UI.backToIsland}
      </Link>
      <nav aria-label="島に建っているもの">
        <PlaceList current={current} atAll={atAll} />
      </nav>
      <p className="ifoot-note">
        <Say t={FOOT.note} /> <Link href="/privacy" prefetch={false} className="ifoot-privacy">プライバシーポリシー</Link>
      </p>
    </footer>
  );
}

export default function PageShell({
  children,
  current,
  crumbs,
  atAll,
}: {
  children: ReactNode;
  current?: string;
  crumbs?: Crumb[];
  /** この面が `/all` そのものか。自分への口を出さないために渡す。 */
  atAll?: boolean;
}) {
  // 看板に出す現在地は、パンくずのいちばん奥。面の h1 と同じ文字列になる
  // （`docs/island-ux.md` 4.3「1つの場所には1つの名前」）。
  const here = crumbs?.length ? crumbs[crumbs.length - 1].label : undefined;
  return (
    <>
      {/* `#…` 付きで着いたとき、その場所まで送る。**面が出てから伸びるので、
          ブラウザ任せでは着かない**（`components/ui/HashJump.tsx`）。
          島の面はどこも中身を取りにいくので、ここ1か所で持つ。 */}
      <HashJump />
      <IslandHeader current={current} here={here} />
      <main className="page">
        {/* 現在地の行。残るのはパンくずだけなので、
            狭い画面で「島 › ○○」の1段しかない面では
            行ごと畳まれる（`app/css/way.css`）。2段以上のパンくずは、
            親への戻り道を持っているので出したまま。 */}
        {crumbs && (
          <div className="wayrow">
            <Crumbs items={crumbs} />
          </div>
        )}
        {children}
      </main>
      <IslandFooter current={current} atAll={atAll} />
    </>
  );
}
