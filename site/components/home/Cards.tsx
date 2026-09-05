import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";

/**
 * 章の中の大きなカード。トップページの主役はこれ。
 *
 * これまでは全部が同じ高さの「タイル」で、押す先の重さの違いが見えなかった。
 * 大きさで序列を付ける: 章の主役は big、その周りは小さいまま。
 *
 * あつ森のカタログのカードは、絵が枠から少しはみ出している。はみ出すと、
 * 平らな四角ではなく「箱の中に物が入っている」ように見える。ここでも同じことをしている。
 */
export function BigCard({
  href,
  icon,
  title,
  note,
  stat,
  statLabel,
  accent,
  children,
}: {
  href: string;
  /** site/public/sprites のスプライト名 */
  icon: string;
  title: string;
  note: string;
  /** 1枚に数字は1つだけ。多いと何も残らない。 */
  stat?: ReactNode;
  statLabel?: string;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <Link className="hbig" href={href} style={accent ? { ["--hb" as string]: accent } : undefined}>
      <span className="hbig-art">
        <img src={`/sprites/${icon}.webp`} alt="" loading="lazy" />
      </span>
      <span className="hbig-body">
        <b>{title}</b>
        <i>{note}</i>
        {children}
      </span>
      {stat !== undefined && (
        <span className="hbig-stat">
          <em>{stat}</em>
          {statLabel && <span>{statLabel}</span>}
        </span>
      )}
      <span className="hbig-go" aria-hidden>
        <Icon name="right" size={16} />
      </span>
    </Link>
  );
}

/**
 * 横に流して見る帯。国旗・料理・住人のように「数が多くて、1つ1つは軽い」ものに使う。
 *
 * 縦に積むと画面をいくら使っても足りないし、数の多さも伝わらない。
 * 指で送れるようにして、端が切れて見えるところまでを含めて「まだ先がある」と伝える。
 */
export function Strip({
  title,
  more,
  moreLabel,
  children,
}: {
  title: string;
  more?: string;
  moreLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="hstrip">
      <div className="hstrip-head">
        <h3>{title}</h3>
        {more && (
          <Link className="hstrip-more" href={more}>
            {moreLabel ?? "ぜんぶ見る"}
            <Icon name="right" size={13} />
          </Link>
        )}
      </div>
      <div className="hstrip-rail">{children}</div>
    </div>
  );
}
