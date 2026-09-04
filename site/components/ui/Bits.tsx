import Link from "next/link";
import type { ReactNode } from "react";

/** YouTube のサムネ + 再生リンク。埋め込みはクリックしてから読み込む(軽さのため)。 */
export function StreamCard({
  videoId,
  title,
  date,
  tag,
}: {
  videoId: string;
  title: string;
  date?: string;
  tag?: string;
}) {
  return (
    <a
      className="scard"
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="scard-thumb">
        <img
          src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          width={320}
          height={180}
        />
        <span className="scard-play" aria-hidden>
          ▶
        </span>
      </span>
      <span className="scard-body">
        {(tag || date) && (
          <span className="scard-meta">
            {tag && <em>{tag}</em>}
            {date && <time>{date.replace(/-/g, "/")}</time>}
          </span>
        )}
        <b>{title}</b>
      </span>
    </a>
  );
}

export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {children}
    </section>
  );
}

export function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
      {sub && <i>{sub}</i>}
    </div>
  );
}

export function TileLink({
  href,
  emoji,
  icon,
  logo,
  title,
  note,
  accent,
}: {
  href: string;
  /** 中身そのものを表す印(国旗や料理)。UIの飾りには使わない。 */
  emoji?: string;
  /** 島に置いてあるスプライト名。行き先が島の場所なら、こちらを使う。 */
  icon?: string;
  /** 公式のアプリアイコンなど。あればいちばん優先して出す。 */
  logo?: string;
  title: string;
  note?: string;
  accent?: string;
}) {
  return (
    <Link className="tile" href={href} style={accent ? { ["--tile" as string]: accent } : undefined}>
      {logo ? (
        <img className="tile-logo" src={logo} alt="" />
      ) : icon ? (
        <img className="tile-icon" src={`/sprites/${icon}.webp`} alt="" />
      ) : (
        <span className="tile-emoji" aria-hidden>
          {emoji}
        </span>
      )}
      <span className="tile-text">
        <b>{title}</b>
        {note && <i>{note}</i>}
      </span>
      <span className="tile-go" aria-hidden>
        →
      </span>
    </Link>
  );
}
