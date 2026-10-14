import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "./Icon";

/**
 * YouTube のサムネ + 再生リンク。埋め込みはクリックしてから読み込む(軽さのため)。
 *
 * `nth` は「その日の何本目か」。**同じ日に同じ題名の配信が2本ある**ことが
 * あって（止まって立て直した回。2025-05-10 のエジプト・シワがそれ）、
 * 読み上げがリンクの字だけを並べて読むと、2枚が1文字も違わない。
 * 題名は YouTube に実在するものなので直せない（`docs/island-design.md` 1章の
 * 唯一の例外）ので、**読み上げる名前のほうに順番を足して見分けをつける。**
 * ぶつかっていない配信には渡さない——どの配信にも「1本目」が付くと、
 * 読み上げがうるさいだけで何も分からない。
 */
export function StreamCard({
  videoId,
  title,
  date,
  tag,
  nth,
}: {
  videoId: string;
  title: string;
  date?: string;
  tag?: string;
  nth?: number;
}) {
  return (
    <a
      className="scard"
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={nth ? `${date ? date.replace(/-/g, "/") + " " : ""}${title}（この日の${nth}本目）` : undefined}
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
          <Icon name="play" size={17} />
        </span>
      </span>
      <span className="scard-body">
        {(tag || date) && (
          <span className="scard-meta">
            {tag && <em>{tag}</em>}
            {date && <time>{date.replace(/-/g, "/")}</time>}
          </span>
        )}
        {/* YouTube に実在する題名。**引用なので直さない**
            （`docs/island-design.md` 1章の唯一の例外）。印は題名の箱そのものに
            付ける——`tools/sprites/noemoji.mjs` はこの印の中だけを数えない。 */}
        <b data-quote="title">{title}</b>
      </span>
    </a>
  );
}

/**
 * 島の外のページに置くまとまり。
 *
 * **既定は紙。** 島の外のページは「島で拾った紙」なので（`docs/island-world.md` 1.5）、
 * 厚みのある板を積むのは間違い。以前は `className="paper"` と書いたときだけ紙になる
 * 作りで、書き忘れた面がまるごと板のまま残っていた（`/nordic` `/now` `/next/new`）。
 * 書き忘れが板になるより、書き忘れが紙になるほうが正しい。
 *
 * 板にしたいとき（押すもの・書くものを載せる台）だけ `board` を渡す。
 */
export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const board = /\bboard\b/.test(className);
  const kind = board ? "" : " paper";
  return (
    <section className={`panel${kind} ${className}`} style={style}>
      {children}
    </section>
  );
}

/* sub も ReactNode。「滞在107日目」のように、画面が出てから数え直すものが入る
   （`components/atlas/StayDays.tsx`）。静的書き出しなので、日数は焼き込めない。 */
export function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: ReactNode }) {
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
  prefetch = false,
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
  /**
   * 行き先を先に取ってくるか。**既定は取らない。**
   * タイルは「次にどこへ行くか」の並びで、出るのはたいてい何枚も一緒。
   * 全部先読みすると、押されない面の中身まで丸ごと落ちてくる。
   * ここぞという1枚だけ `prefetch` を立てる。
   */
  prefetch?: boolean;
}) {
  return (
    <Link
      className="tile"
      href={href}
      prefetch={prefetch}
      style={accent ? { ["--tile" as string]: accent } : undefined}
    >
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
        <Icon name="right" size={15} />
      </span>
    </Link>
  );
}
