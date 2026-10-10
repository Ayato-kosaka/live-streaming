"use client";

import {
  CALENDARS,
  CAL_SHOT_H,
  CAL_SHOT_W,
  CAL_WORDS,
} from "@/content/goods";
import { useWordVotes, VoteFoot, VoteHeart } from "@/components/goods/wordVotes";

/**
 * カレンダーの試作を3つ並べて、どれがいいかを押してもらう。
 *
 * あやとの言葉（2026-10-10）は `content/goods.ts` の `Calendar` の頭に置いてある。
 * 3つの型（イラスト・海外の風景・配信のスクショ）も、あちらが出したとおり。
 *
 * ## 仕掛けは `wordVotes.tsx` の1本
 *
 * LINEスタンプ（`StampVotes.tsx`）と**同じものを使う。** 宛先が
 * `goods-calendar`、鍵にする字が `CAL_WORDS` になるだけで、
 * 読む・押す・立てる・楽観更新・読めなかった日の扱いは1行も写していない。
 *
 * ## ハートは型に1つ
 *
 * 知りたいのは「イラストか、風景か、スクショか」なので、絵1枚ずつには付けない。
 * 2枚並んでいるのは、**同じ型で1年つづいたときの見当**を付けるため（1月と7月）。
 *
 * ## 縦に並べる
 *
 * 390px で3つを横に並べると、絵が小指の爪になる。型は縦、型の中の2枚は横。
 */
export default function CalendarTries() {
  const votes = useWordVotes("goods-calendar", CAL_WORDS);

  return (
    <div className="gd-cals">
      {CALENDARS.map((cal) => (
        <div className="gd-cal" key={cal.id}>
          <div className="gd-calh">
            <b>{cal.name}</b>
            <VoteHeart word={cal.vote} votes={votes} />
          </div>
          <div className="gd-calshots">
            {cal.shots.map((shot) => (
              <img
                key={shot.src}
                src={shot.src}
                alt={shot.alt}
                width={CAL_SHOT_W}
                height={CAL_SHOT_H}
                /* 場所を先に取る。**寸法は `content/goods.ts` の1本から**
                   取る（ここに数を書くと、焼き直した日にここだけ古くなる。
                   `site/selftest/ayatoart_selftest.mjs` と同じ轍） */
                style={{ aspectRatio: `${CAL_SHOT_W} / ${CAL_SHOT_H}` }}
                loading="lazy"
              />
            ))}
          </div>
        </div>
      ))}
      <VoteFoot votes={votes} />
    </div>
  );
}
