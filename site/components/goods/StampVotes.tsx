"use client";

import { LINE_PENDING, LINE_STAMPS, LINE_VOTES } from "@/content/goods";
import Longer from "@/components/ui/Longer";
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
 * 扱いは `components/goods/wordVotes.tsx` の1本に置いてある。**写しを作らない**
 * ——いいねを使う欄がもう1つ増えた日に、同じ用事の仕掛けが2つになる
 * （カレンダーの試作が2026-10-12 まで同じ1本を使っていた）。
 *
 * ここに残っているのは、この欄にしか無いもの——**スタンプの絵の並べ方**だけ。
 */
export default function StampVotes() {
  /* 鍵にする字はセリフそのもの。**`LINE_VOTES` を渡す**——
     その場で `map` すると、毎回新しい配列に見えて数え直しが止まらない。
     1枚につき「絵のとおりの字 ＋ 同じスタンプを指すほかの字」で、
     **押すのも枠に出るのも先頭**（`content/goods.ts` の `also`） */
  const votes = useWordVotes("goods-linestamp", LINE_VOTES);

  return (
    <div className="gd-stamps">
      {/* **一度に全部は出さない**（`docs/island-standards.md` 7章）。

          17枚を並べると、390px でこの欄だけ 2,418px——面ぜんぶ（6,206px）の
          4割を1つの欄が持っていって、下の SUZURI が5画面目に沈んでいた。
          セリフは**増える**ので、枚数が変わっても背が変わらない形にする。

          畳み方は島に1つ（`components/ui/Longer.tsx`）。カードの
          「あと◯日ぶんだす」・付箋の「あと◯枚だす」と同じ押しどころ・
          同じ言い方になる。**上限で切らない**——押せば最後まで出る。
          はじめに出すのは6枚（2列×3段）。1枚が絵・セリフ・ハートの3段なので、
          数を増やすと1押しで画面3つぶん伸びる。 */}
      <Longer items={LINE_STAMPS} first={6} unit="枚" as="ol" className="gd-grid">
        {(s) => (
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
            {/* **ハートは枠の底にそろえる。** セリフが2行になる枠があるので
                （「にわかに信じられへん」は PC の 110px 幅で折り返す）、
                そろえないと**その枠のハートだけが1行ぶん下がって**、
                並びの行がガタつく。マスの背は grid がそろえてくれるので、
                下に寄せるのはここ1行で足りる */}
            <span style={{ marginTop: "auto" }}>
              <VoteHeart word={s.line} votes={votes} />
            </span>
          </li>
        )}
      </Longer>
      <VoteFoot votes={votes} />
    </div>
  );
}
