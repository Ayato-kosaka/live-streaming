import type { ReactNode } from "react";

/**
 * トップページの章の見出し。
 *
 * 同じ形のパネルが縦に並ぶだけだと、どこを見ればいいのか分からない、という指摘があった。
 * 「これから／いま／これまで」の3つに区切って、区切り目に木の看板を吊るす。
 * 看板は画像ではなく SVG。章ごとに色だけ変わればいいので、絵を3枚持つより軽い。
 */
export default function Chapter({
  id,
  kicker,
  title,
  note,
  children,
}: {
  /** 章の色みを決める。home.css の [data-chap] が受ける。 */
  id: "next" | "now" | "past" | "watch";
  /** 看板の上に小さく出る一言。章の立ち位置。 */
  kicker: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="hchap" data-chap={id}>
      <header className="hchap-head">
        <Sign kicker={kicker} />
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * 吊るした木の看板。
 *
 * あつ森の看板は「輪郭線がない・面の中に木目と影がある・下に厚みがある」の3点でできている。
 * 線を1本も引かず、板・木目・厚み・ハイライトを別々の面として重ねている。
 */
function Sign({ kicker }: { kicker: string }) {
  return (
    <span className="hsign">
      <svg viewBox="0 0 220 74" width="220" height="74" aria-hidden focusable="false">
        {/* 吊り縄。板より奥に置きたいので先に描く */}
        <path d="M62 6 L74 22" className="hsign-rope" />
        <path d="M158 6 L146 22" className="hsign-rope" />
        {/* 板の厚み。真下ではなく少し右下にずらすと、本物の見え方に近づく */}
        <rect x="16" y="26" width="190" height="42" rx="14" className="hsign-lip" />
        <rect x="14" y="20" width="190" height="42" rx="14" className="hsign-face" />
        {/* 木目。板と同系の少し濃い色で、細く2本だけ。3本以上入れると汚れて見える */}
        <path d="M30 32 q40 -4 78 0 q40 4 82 0" className="hsign-grain" />
        <path d="M34 52 q46 5 88 1 q34 -3 66 1" className="hsign-grain" />
        {/* 上端のハイライト。これが無いと板が平らに見える */}
        <rect x="22" y="24" width="174" height="7" rx="3.5" className="hsign-lit" />
        {/* 留めの木ねじ */}
        <circle cx="30" cy="41" r="3.4" className="hsign-nail" />
        <circle cx="188" cy="41" r="3.4" className="hsign-nail" />
      </svg>
      <em>{kicker}</em>
    </span>
  );
}
