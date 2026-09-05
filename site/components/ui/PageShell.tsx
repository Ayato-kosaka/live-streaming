import Link from "next/link";
import type { ReactNode } from "react";
import { DOORS, SPOTS } from "../island/layout";
import { Gull } from "../island/Guide";
import Icon from "./Icon";
import { FOOT, UI } from "@/content/voice";

/** 行き先を全部並べた面。上の現在地の行と、下の砂浜の両方から行ける。 */
export const ALL_HREF = "/all";
export const ALL_LABEL = "島のなか ぜんぶ";

export function IslandHeader({ current }: { current?: string }) {
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
      </div>
    </header>
  );
}

/**
 * 現在地の行。
 *
 * 左が「いまどこにいるか」、右が「どこへでも行ける口」。
 * **口を上の帯には入れない。** 帯は行き先6つの受け皿で、狭い画面では
 * 3列×2段にちょうど収まっている（`app/css/pages.css` の `.ih-nav`）。
 * ここへ7つ目を足すと列が割れて、6つの名前が切れる。名前が切れた札は
 * 入口として働かないので、器を別に立てる（`layout.ts` の `DOORS` の決まり）。
 *
 * パンくずの行はもともと全部の面にあり、狭い画面では「島 › ○○」の1段だけの
 * ときに見た目を消している（真上の帯が同じことを言っているため）。
 * その行を借りると、**新しい段を1つも増やさずに**口を置ける。
 */
function WayRow({
  crumbs,
  atAll,
}: {
  crumbs?: { label: string; href?: string }[];
  atAll?: boolean;
}) {
  return (
    <div className="wayrow">
      {crumbs ? <Crumbs items={crumbs} /> : <span />}
      {/* **その面自身への口は出さない。** `/all` の上に「ぜんぶ」を出すと、
          押しても同じ紙が出てくる。厚みのある板は「どこかへ行ける」と
          言っているので（`docs/island-design.md` 3-3）、行き先が
          いま居る場所なら、言っていることが嘘になる。 */}
      {!atAll && (
        <Link className="way-all" href={ALL_HREF} prefetch={false}>
          <Icon name="signpost" size={16} />
          <span className="way-all-long">島のなか</span>ぜんぶ
        </Link>
      )}
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
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
 * **ここには10軒ぜんぶ並べる。** 上の帯を6つに絞ってあるのは、
 * 帯が「いま、どこへ行くか」を選ばせる列だからで、狭い列に10個入れると
 * どれも読めなくなる。砂浜は面を読み終わったあとの場所なので、
 * 選ばせる列ではなく**戻り道の一覧**として置ける。
 * これで、帯に出ていない4軒（作った料理・伝説の企画・いまどこ・住んでる人）へも
 * どの面からでも1回で行ける。
 */
export function IslandFooter() {
  return (
    <footer className="ifoot">
      {/* 上の帯の「あやと島」と同じ行き先。二重に先読みしても意味がない */}
      <Link href="/" className="ifoot-back" prefetch={false}>
        <Gull size={24} shadow={false} /> {UI.backToIsland}
      </Link>
      <nav className="ifoot-doors" aria-label="島に建っているもの">
        {DOORS.map((d) => (
          <Link key={d.id} href={d.href} prefetch={false} className="ifoot-door">
            <img src={`/sprites/${d.icon}.webp`} alt="" loading="lazy" />
            {d.label}
          </Link>
        ))}
        <Link href={ALL_HREF} prefetch={false} className="ifoot-door is-all">
          <Icon name="signpost" size={18} />
          {ALL_LABEL}
        </Link>
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
  crumbs?: { label: string; href?: string }[];
  /** この面が `/all` そのものか。自分への口を出さないために渡す。 */
  atAll?: boolean;
}) {
  return (
    <>
      <IslandHeader current={current} />
      <main className="page">
        <WayRow crumbs={crumbs} atAll={atAll} />
        {children}
      </main>
      <IslandFooter />
    </>
  );
}
