import Link from "next/link";
import type { ReactNode } from "react";
import { SPOTS } from "../island/layout";
import { Gull } from "../island/Guide";
import Icon from "./Icon";
import PlaceList, { ALL_HREF, ALL_LABEL } from "./PlaceList";
import { FOOT, UI } from "@/content/voice";

export { ALL_HREF, ALL_LABEL };

type Crumb = { label: string; href?: string };

/**
 * 看板。
 *
 * ## 狭い画面では1段。行き先の一覧は畳んで持つ
 *
 * 9月5日まで、狭い画面の看板は 129px あった。6つの札が3列×2段に並ぶので、
 * どうしても2段ぶんの背が要る。その下に現在地の行（48〜89px）が続くので、
 * **中身が始まるまでに 177〜218px、1画面の 21〜26% を、106面ぜんぶが
 * 同じ絵で使っていた。**
 *
 * `docs/island-ux.md` 5.2 の答えをそのまま採る。狭い画面の看板は
 *
 *     [ 島 ]   いま：○○   [ ほかの場所 ]
 *
 * の1段だけにして、行き先は「ほかの場所」を押すと下りてくる一覧（`PlaceList`）に
 * 持たせる。**到達性は落ちない。** 前は帯に出ている6つが1タップ、
 * 残り4つは砂浜まで送るか「ぜんぶ」経由で2タップだった。いまは
 * 10軒とも「ほかの場所」→ 行き先の2タップで、砂浜まで送れば10軒とも1タップ。
 * どこからでも2タップ、は保たれる。
 *
 * ## 広い画面（900px 以上）は6つの札のまま
 *
 * あちらは元から1段で、背は 78px しかない。畳む理由が無いので触らない。
 * 「ぜんぶ」だけ、現在地の行から札の列の最後へ移した（口を1つに寄せるため）。
 * どちらの器を出すかは CSS が決める（`app/css/pages.css` の `.ih-nav` / `.ihx`）。
 * **`display: none` で消すので、隠れているほうは読み上げにも出てこない。**
 */
export function IslandHeader({
  current,
  here,
  atAll,
}: {
  current?: string;
  /** いま居る面の名前。パンくずの最後の1つ。 */
  here?: string;
  atAll?: boolean;
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
        {/* 狭い画面の口。中身は砂浜と同じ `PlaceList`。 */}
        <details className="ihx">
          <summary className="ihx-open">
            <Icon name="signpost" size={16} />
            ほかの場所
            <Icon name="chevron" size={13} className="ihx-chev" />
          </summary>
          <div className="ihx-sheet">
            <PlaceList variant="sheet" current={current} atAll={atAll} />
          </div>
        </details>
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
          {/* **その面自身への口は出さない。** `/all` の上に「ぜんぶ」を出すと、
              押しても同じ紙が出てくる。厚みのある板は「どこかへ行ける」と
              言っているので（`docs/island-design.md` 3-3）、行き先が
              いま居る場所なら、言っていることが嘘になる。 */}
          {!atAll && (
            <Link href={ALL_HREF} prefetch={false} className="ih-link is-all">
              <Icon name="signpost" size={16} />
              ぜんぶ
            </Link>
          )}
        </nav>
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
  lead?: string;
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
 * **ここは開いたまま置く。** 上の看板の口は畳んであるので、読み終わった人が
 * 次を選ぶときに、もう一度押させない。中身は看板の一覧と同じ部品
 * （`PlaceList`）なので、行き先が増えても直すのは1か所。
 */
export function IslandFooter({ current, atAll }: { current?: string; atAll?: boolean }) {
  return (
    <footer className="ifoot">
      {/* 上の帯の「あやと島」と同じ行き先。二重に先読みしても意味がない */}
      <Link href="/" className="ifoot-back" prefetch={false}>
        <Gull size={24} shadow={false} /> {UI.backToIsland}
      </Link>
      <nav aria-label="島に建っているもの">
        <PlaceList variant="foot" current={current} atAll={atAll} />
      </nav>
      <p className="ifoot-note">{FOOT.note}</p>
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
      <IslandHeader current={current} here={here} atAll={atAll} />
      <main className="page">
        {/* 現在地の行。**「ぜんぶ」の札は看板へ移した。**
            残るのはパンくずだけなので、狭い画面で「島 › ○○」の1段しかない面では
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
