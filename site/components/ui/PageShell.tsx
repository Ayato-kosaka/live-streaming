import Link from "next/link";
import type { ReactNode } from "react";
import { SPOTS } from "../island/layout";
import { Gull } from "../island/Guide";
import { FOOT, UI } from "@/content/voice";

export function IslandHeader({ current }: { current?: string }) {
  return (
    <header className="ih">
      <div className="ih-in">
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

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="現在地">
      <Link href="/">島</Link>
      {items.map((it) => (
        <span key={it.label}>
          <i aria-hidden>›</i>
          {it.href ? <Link href={it.href}>{it.label}</Link> : <b>{it.label}</b>}
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

export function IslandFooter() {
  return (
    <footer className="ifoot">
      <Link href="/" className="ifoot-back">
        <Gull size={24} shadow={false} /> {UI.backToIsland}
      </Link>
      <p className="ifoot-note">{FOOT.note}</p>
    </footer>
  );
}

export default function PageShell({
  children,
  current,
  crumbs,
}: {
  children: ReactNode;
  current?: string;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <>
      <IslandHeader current={current} />
      <main className="page">
        {crumbs && <Crumbs items={crumbs} />}
        {children}
      </main>
      <IslandFooter />
    </>
  );
}
