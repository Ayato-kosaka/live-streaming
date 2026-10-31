"use client";

import { LINE_PENDING, LINE_STAMPS, LINE_VOTES } from "@/content/goods";
import Longer from "@/components/ui/Longer";
import { shutDest, themeById } from "@/content/themes";
import {
  useWordVotes,
  VoteFoot,
  VoteHeart,
  VoteTally,
} from "@/components/goods/wordVotes";

/** いいねを置いている付箋の宛先 */
const THEME = "goods-linestamp";

/**
 * **締め切った宛先か。** 判定は島の表の1本（`content/themes.ts` の `shutDest`）。
 * ここで `closed` を直に見ない——企画あてのように日で締まる形に変わった日に、
 * 判定が2か所になる。宛先は日付を持たないので、焼いた時点で決まる。
 */
/* **ここも机から足したぶんを重ねない**（2026-10-15）。切り替わるのは
   ハート（押せる）と数（読むだけ）で、**押す相手は付箋ではなく候補のセリフ**。
   候補そのもの（`LINE_WORDS`）が焼き込みなので、候補と押しどころは Git で
   一緒に動かす。机で貼り先を締め切ると閉じるのは付箋の窓（`Notes`）のほうで、
   こちらは閉じない——それでよい。 */
const SHUT = shutDest(themeById(THEME), null);

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
 *
 * ## 締め切ったあと（2026-10-14）
 *
 * 40種類を LINE に申請して、宛先 `goods-linestamp` は畳んだ。
 * **押しどころは1つも残さない**——まだ札の無い字を押すと、立てるところで
 * 断られる（押して失敗するボタンになる）。付いた数は `VoteTally` で
 * 押せない形のまま見せる（締め切った宛先の付箋と同じ扱い）。
 */
export default function StampVotes() {
  /* 鍵にする字はセリフそのもの。**`LINE_VOTES` を渡す**——
     その場で `map` すると、毎回新しい配列に見えて数え直しが止まらない。
     1枚につき「絵のとおりの字 ＋ 同じスタンプを指すほかの字」で、
     **押すのも枠に出るのも先頭**（`content/goods.ts` の `also`） */
  const votes = useWordVotes(THEME, LINE_VOTES);

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
              {SHUT ? (
                <VoteTally word={s.line} votes={votes} />
              ) : (
                <VoteHeart word={s.line} votes={votes} />
              )}
            </span>
          </li>
        )}
      </Longer>
      <VoteFoot votes={votes} />
    </div>
  );
}
