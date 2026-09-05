import type { CSSProperties, ReactNode } from "react";

/**
 * 紙の型（図鑑のページ）の組み立て部品。
 *
 * 本物のUIは、押すもの＝厚みのある板、読むもの＝紙に刷ったページ、で分かれている
 * （`docs/ac-reference.md` の7章）。一覧と詳細はぜんぶ紙のほうなので、
 * 「紙を1枚敷いて、細い罫線で区画に割る」という同じ作りをここに1回だけ書く。
 *
 * 紙の中に板を混ぜない。外へ出ていくボタンだけ、紙の外に置く。
 */

/** 紙1枚。ページの本文をこの中に入れる。 */
export function Sheet({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="zk" style={style}>
      <div className="zk-sheet">{children}</div>
    </section>
  );
}

/**
 * 紙の中の区画。上に1本の罫線が引かれる（いちばん上だけ引かれない）。
 * `flush` は格子を紙の端まで敷きたいとき、`tight` は上下を詰めたいとき。
 */
export function Zone({
  children,
  flush,
  tight,
}: {
  children: ReactNode;
  flush?: boolean;
  tight?: boolean;
}) {
  return <div className={`zk-zone${flush ? " is-flush" : ""}${tight ? " is-tight" : ""}`}>{children}</div>;
}

/**
 * 区画の見出し。蛍光ペンの帯を字の後ろに敷く。
 * 帯を字の形に沿わせたいので、色を持つのは中の `span` のほう。
 *
 * `art` は見出しの左に置く小さいイラスト。帯の中に入れると
 * 蛍光ペンが絵の上を通ってしまうので、帯の外に出す。
 */
export function H({
  children,
  note,
  art,
}: {
  children: ReactNode;
  note?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <h2 className="zk-hr">
      {art && <span className="zk-hi">{art}</span>}
      <span className="zk-h">{children}</span>
      {note && <span className="zk-hn">{note}</span>}
    </h2>
  );
}

/** 紙に貼った白い題名の札。テープで少し斜めに留めてある。 */
export function Tape({ children }: { children: ReactNode }) {
  return <span className="zk-tape">{children}</span>;
}

/**
 * 記録の欄。数字を罫線で仕切って並べる。
 * `unit` は数字のうしろに小さく付く（32品 の「品」）。
 */
export function Rec({
  items,
}: {
  items: { n: ReactNode; unit?: string; label: string; note?: string }[];
}) {
  return (
    <div className="zk-rec">
      {items.map((x) => (
        <div key={x.label}>
          <b>
            {x.n}
            {x.unit && <i>{x.unit}</i>}
          </b>
          <span>{x.label}</span>
          {x.note && <em>{x.note}</em>}
        </div>
      ))}
    </div>
  );
}
