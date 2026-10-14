"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import PhotoPost from "@/components/nordic/PhotoPost";
import ReadAgain from "@/components/me/ReadAgain";
import { useOwner } from "@/lib/auth";
import CardMonth from "./CardMonth";
import CardSheet from "./CardSheet";
import DayPanel from "./DayPanel";
import { useCardWall, type PhotoGroup, type PlanDays } from "./cards";

/**
 * あやと島カード。**1日ぶんが1枚の紙で、並ぶのは写真。**
 *
 * ## 旅の写真（`/nordic/photos`）を、ここへ寄せた（2026-09-10）
 *
 * 同じ写真の同じ人を、2つの面が別々の言い方で出していた。
 * あやとの言葉:
 *
 * > そもそもこの画面入らなくて cards に統合すべきでは？
 * > /nordic/photos のUXの方がわかりやすいから統合して欲しい
 *
 * 寄せ先を `/cards` にしたのは、**写真が旅より長く残る**から。
 * `/nordic/photos` は「これから › 北欧ヒッチハイク › 旅の写真」の下にいて、
 * 旅が終わると入口ごと過去の話になる。カードは島の常設で、
 * `/about`・`/friends`・`/me` の3か所から来る。
 *
 * 見た目と手ざわりは**写真の側**に寄せた。日ごとの紙・素の写真のマス・
 * 押すと大きく出て入れる人を選ぶ、まで元の `PhotoWall` と同じ。
 *
 * ## 写真の口とカードの口の、両方を読む
 *
 * カードは「写真 × その日に投げてくれた人」なので、カードだけを見ていると
 * **まだ誰も投げていない写真が1枚も出ない。** あやとが貼った直後がそれで、
 * 貼った本人が「入らなかった」と思う。写真の一覧を土台にして、
 * 立てる人をカードから重ねる（`cards.ts` の `useCardWall`）。
 *
 * **口が2つあるということは、落ち方が3通りあるということ**（#34 #36）。
 * ここは長いあいだ「2つとも落ちたときだけ」つながらないと言っていて、
 * **片方だけ落ちると「まだ1枚もありません」と言い切っていた。**
 * 細い電波でいちばん多いのは片方だけ落ちることなので、いちばんよく起きる
 * 落ち方が、いちばん大きな嘘になっていた。
 * 「まだ1枚もありません」と言ってよいのは、**2つとも読めた上での0枚だけ。**
 *
 * ## マスに、代表の1人を埋めない
 *
 * あやとの言葉:「代表でキャラクターを埋めるのはやめて欲しい」。
 * 一覧のマスは**素の写真**で、キャラクターを入れるのは開いた先だけ。
 * 開いた先も、はじめは誰も入っていない（`CardSheet`）。
 *
 * ## 見かたは2つ。**並びと、カレンダー**（2026-10-13）
 *
 * あやと:「あやと島カードはカレンダーから選べることもできたらもっと
 * 見やすいかも？」**「も」なので、並びは消さない。** 札2枚で切り替える。
 * どちらの見かたでも、1日ぶんの紙は同じもの（`DayPanel`）を出す。
 *
 * ## マスに厚みを付けない
 *
 * 並びのマスが**全部押せる**ので、1枚ずつには付けない（`docs/island-design.md`
 * 3章の3の例外）。押せないマスをこの並びに混ぜないこと。
 */
export default function CardWall({ plans }: { plans: PlanDays }) {
  const { days, photosRead, cardsRead, add, drop, reload } = useCardWall();
  const [open, setOpen] = useState<PhotoGroup | null>(null);
  /** 見かた。**並び（いままで）か、カレンダーか** */
  const [cal, setCal] = useState(false);
  /* 貼る道具は、あやとにだけ出す。判定は1か所に置いてある
     （`lib/auth.tsx` の `useOwner`）。 */
  const owner = useOwner();

  /* まだ返事を待っている口がある。骨を出してよいのはここだけ */
  const waiting = photosRead === "wait" || cardsRead === "wait";
  /* 2つとも読めた。**「まだ1枚もありません」と言ってよいのは、このときだけ。** */
  const read = photosRead === "ok" && cardsRead === "ok";
  /* 読みに行けなかった口。**片方だけ落ちた日がいちばん多い。**
     両方落ちていても札は1つ（読み直すのはまとめて）で、写真のほうを名乗る。
     写真は並びの土台なので、そこが読めていないと欠けたことに気づけない。 */
  const missing =
    photosRead === "down" ? "旅の写真"
    : cardsRead === "down" ? "カード"
    : null;

  return (
    <>
      {/* 貼る道具は紙の上に載せない。**板（`.dform`）そのものが作業台**で、
          紙に入れると枠が二重になる（`docs/island-design.md` 3章）。 */}
      {owner && <PhotoPost onAdded={add} />}

      {/* まだ待っている口がある。**「無い」とも「読めなかった」とも言えない** */}
      {waiting && (days === null || days.length === 0) && (
        <section className="panel paper">
          <div className="wait is-card" aria-hidden>
            <span />
            <span />
          </div>
        </section>
      )}

      {/* 読みに行けなかった口があるとき。**片方だけでもここに出る。**
          押しどころは1つでよく（読み直すのは両方まとめて）、
          何が欠けているかだけ名前で言う。 */}
      {missing && <ReadAgain what={missing} onRetry={reload} />}

      {/* **「まだ1枚もありません」と言えるのは、2つとも読めた上での0枚だけ。** */}
      {read && days !== null && days.length === 0 && (
        <div className="blank">
          <b>まだ1枚もありません</b>
          <p>配信のあった日に撮った写真が、ここに並びます。</p>
          <Link prefetch={false} className="blank-go" href="/nordic">
            旅のよていを見る
            <Icon name="right" size={15} />
          </Link>
        </div>
      )}

      {/* 見かたの札。**カードが1枚でもあるときだけ出す**——0枚の紙に
          切り替えを出しても、どちらを押しても同じ空っぽが出る。 */}
      {days !== null && days.length > 0 && (
        <div className="akd-views" role="group" aria-label="どの見かたで さがしますか">
          <button
            type="button"
            className={`akd-view${cal ? "" : " is-on"}`}
            aria-pressed={!cal}
            onClick={() => setCal(false)}
          >
            日づけでならべる
          </button>
          <button
            type="button"
            className={`akd-view${cal ? " is-on" : ""}`}
            aria-pressed={cal}
            onClick={() => setCal(true)}
          >
            カレンダーでさがす
          </button>
        </div>
      )}

      {cal && days !== null && days.length > 0 && (
        <CardMonth days={days} plans={plans} onOpen={setOpen} />
      )}

      {/* 1日ぶんが1枚の紙。**旅の日数ぶんだけ増える**ので、はじめは3日ぶん
          （#225）。 */}
      {!cal && (
        <Longer items={days ?? []} first={3} step={6} unit="日ぶん" as="div">
          {(d) => <DayPanel key={d.day} day={d} plans={plans[d.day]} onOpen={setOpen} />}
        </Longer>
      )}

      {open && (
        <CardSheet
          group={open}
          plans={plans[open.day]}
          onClose={() => setOpen(null)}
          /* 消えたら、その場で棚から落として紙を閉じる。**読み直しに行かない。**
             消したのはこちらなので、消えたことはもう分かっている。 */
          onDropped={(id) => {
            drop(id);
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
