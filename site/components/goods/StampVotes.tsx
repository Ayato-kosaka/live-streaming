"use client";

import { LINE_PENDING, LINE_STAMPS, LINE_WORDS } from "@/content/goods";
import { useWordVotes, VoteFoot, VoteHeart } from "@/components/goods/wordVotes";

/**
 * あやとのスタンプの候補に、いいねを押す。
 *
 * あやとの言葉（2026-10-08）:
 *
 * > LINEスタンプ（検討中）→ 検討中は色々候補を出していいねとか押せるように。
 *
 * ## 仕掛けは `wordVotes.tsx` の1本
 *
 * 押した数を置く先は**付箋そのもの**（`islandNotes` / 宛先 `goods-linestamp`）で、
 * 入れ物も口も1つも足していない。読む・押す・立てる・楽観更新・読めなかった日の
 * 扱いは、カレンダーの試作（`CalendarTries.tsx`）と**同じ1本**を使う
 * （`components/goods/wordVotes.tsx`）。**写しを作らない**——同じ用事に
 * 仕掛けが2つあると、片方だけ直す日が必ず来る。
 *
 * ここに残っているのは、この欄にしか無いもの——**スタンプの絵の並べ方**だけ。
 */
export default function StampVotes() {
  /* 鍵にする字はセリフそのもの。**`LINE_WORDS` を渡す**——
     その場で `map` すると、毎回新しい配列に見えて数え直しが止まらない */
  const votes = useWordVotes("goods-linestamp", LINE_WORDS);

  return (
    <div className="gd-stamps">
      <ol className="gd-grid">
        {LINE_STAMPS.map((s) => (
          <li key={s.id}>
            {/* 絵が届いていないあいだ、枠に出しているのは**透かしだけの板**で、
                絵が入る場所がそのまま見える（`tools/goods/stampbake.py`）。
                届いたら `content/goods.ts` の `art` に道を書くだけ */}
            <span className="gd-stampart">
              <img
                src={s.art ?? LINE_PENDING}
                alt=""
                width={360}
                height={360}
                loading="lazy"
              />
              {!s.art && <em>絵はこれから</em>}
            </span>
            <b className="gd-stampline">{s.line}</b>
            <VoteHeart word={s.line} votes={votes} />
          </li>
        ))}
      </ol>
      <VoteFoot votes={votes} />
    </div>
  );
}
