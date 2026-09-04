import Link from "next/link";
import type { ReactNode } from "react";
import { SPOTS } from "../island/layout";

export function IslandHeader({ current }: { current?: string }) {
  return (
    <header className="ih">
      <div className="ih-in">
        <Link href="/" className="ih-home">
          <span aria-hidden>🏝️</span>
          <b>あやと島</b>
        </Link>
        <nav className="ih-nav" aria-label="島のなか">
          {SPOTS.map((s) => (
            <Link key={s.id} href={s.href} className={`ih-link${current === s.id ? " is-on" : ""}`}>
              <span aria-hidden>{s.emoji}</span>
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
  emoji,
  title,
  lead,
  meta,
}: {
  emoji: string;
  title: string;
  lead?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="phead">
      <span className="phead-emoji" aria-hidden>
        {emoji}
      </span>
      <h1>{title}</h1>
      {lead && <p className="phead-lead">{lead}</p>}
      {meta && <div className="phead-meta">{meta}</div>}
    </div>
  );
}

export function IslandFooter() {
  return (
    <footer className="ifoot">
      <Link href="/" className="ifoot-back">
        <span aria-hidden>🏝️</span> 島にもどる
      </Link>
      <p className="ifoot-note">
        あやと島 — あやとと愉快な仲間達。毎晩22時、世界のどこかから生配信しています。
      </p>
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
