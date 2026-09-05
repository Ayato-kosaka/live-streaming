import type { ReactNode } from "react";

/**
 * トップページの章。
 *
 * ## 地を海から砂に変えた理由
 *
 * 章の地を剥がしたあと、見出しの白い字が海の上に直に載っていた。
 * 字の後ろだけ水を暗くする暗幕を敷いてあったが、**実測 1.91〜2.78 : 1** で
 * 4.5 : 1 に遠く届かない。暗幕は中心しか濃くならず、見出しの幅の大半は素の海のまま。
 * 目で見ても「海に落ちた汚れ」にしか見えない。影を足す方向では2周ぶん解けなかった。
 *
 * 海は時間帯で色が変わる（朝 #16a0e0 / 昼 #0d87de / 夕 #4a45c6 / 夜 #1b4a94）。
 * **どの色の上でも読める字は、白にも墨にも無い。** だから地のほうを変える。
 *
 * 島の浜を1枚敷いて、その上に章を載せる。海は章と章のあいだに残るので、
 * 「島の板の上にいる」（`docs/island-world.md` 2章の `/` = 板）は保ったまま、
 * 字は砂の上に落ちる。砂は `docs/island-world.md` 3.2 の色の表にある
 * 「意味を持つ色」ではない。島の地面そのものなので、何も指していない。
 *
 * ## 章ごとに違う顔をさせる
 *
 * 前は4章とも「絵・題・矢印」の横並びカードを積んだだけで、
 * 違うのは看板の文字だけだった。章の中身はそれぞれ別の部品に分けてある。
 *   これから … しらせと時計（NextUp）
 *   いま     … 名刺（Meishi）1枚
 *   これまで … 棚の格子（Shelf）
 *   見にいく … 画面（動画と外の口）
 */
export default function Chapter({
  id,
  kicker,
  title,
  note,
  children,
}: {
  /** 章の識別。home.css の [data-chap] が受ける。 */
  id: "next" | "now" | "past" | "watch";
  /** 看板の上に小さく出る一言。章の立ち位置。 */
  kicker: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="hchap" data-chap={id}>
      {/* 打ち寄せる泡。砂の帯の上ぎわに置くと、海から浜へ上がったことになる */}
      <span className="hchap-foam" aria-hidden />
      <div className="hchap-mat">
        <header className="hchap-head">
          <Sign kicker={kicker} />
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

/**
 * 吊るした木の看板。
 *
 * あつ森の看板は「輪郭線がない・面の中に木目と影がある・下に厚みがある」の3点でできている。
 * 線を1本も引かず、板・木目・厚み・ハイライトを別々の面として重ねている。
 *
 * 字は白から墨にした。こはくの板（`--frame` #f2b054）に白を置くと **1.91 : 1** で、
 * 4章の見出しの中でいちばん薄かった。彫った字として墨を置けば 5 : 1 を超える。
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
