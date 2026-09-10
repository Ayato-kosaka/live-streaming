import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { Mark } from "./Marks";
import DayLogMarks from "./DayLogMarks";
import { ArrivedRow, EndRow } from "./GoalRow";
import { ARRIVE, DAYS, DEPART, LEAVE, cityName, dayHref, dayName, type Day, type Leg } from "@/content/nordic";

/**
 * 旅のよてい。**1日1行だけ。中身は1日ぶんのページにある。**
 *
 * ここは長いあいだ、9日ぶんの区間・注記・国境・わかれ道を全部この面に並べていた。
 * 旅程表だけで 1,764px あり、面ぜんぶ（6,369px）の3割近くを使っていた。
 * オーナーの言葉はこう:
 *
 * > 旅の予定の部分は1日1日はシンプルにしながら、ボタンをポンって押せば
 * > 新しいその詳しく見るページに入れて、で中が見れるっていう感じにしたい
 *
 * **なので、行に置くのは「押す前に知りたいこと」だけにする。**
 * 何日目か・どこを通るか・どうやって・どこに泊まるか。読んだ結果
 * 「この日を詳しく見たい」と思えるところまでで止めて、あとは中へ入ってもらう。
 *
 * **押せる行には厚みを付け、押せない行は完全に平らにする**
 * （`docs/island-design.md` 3章）。予備の2日と着いた朝には中身のページが無いので、
 * そこだけ紙のまま置く。行が全部押せるわけではないので、
 * 「一面ぜんぶ押せる並びには厚みを付けない」の例外は使えない。
 *
 * 畳まない。上から下まで読めるのが旅程表なので、
 * 押して開かないと中身が分からない形にはしない。
 */

const MOVE: Record<Leg["move"], string> = {
  fly: "飛行機",
  hitch: "ヒッチハイク",
  ferry: "フェリー",
  walk: "歩き",
  van: "マシュルートカ",
};

/**
 * 「2026-09-11」→「9月11日(金)」
 *
 * `new Date(...)` に投げて `getDate()` を読むと、**箱の時計で日がずれる**。
 * 書き出しは UTC で走るので、日本時間の 00:00 は前の日の 15:00 になり、
 * 9月11日が「9月10日(木)」と焼き込まれていた（実測）。
 * 曜日だけ UTC で出して、月日は文字列から取る。
 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

/** その日に動く道。「トビリシ → クタイシ → カトヴィツェ」。動かない日はその街だけ。 */
function way(day: Day) {
  const legs = day.legs ?? [];
  if (legs.length === 0) return day.city ? [day.city] : [];
  return [cityName(legs[0].from), ...legs.map((l) => cityName(l.to))];
}

/** その日の移動のしかた。同じものは1回だけ言う（「フェリー・フェリー」にしない）。 */
function how(day: Day) {
  const legs = day.legs ?? [];
  // 動かない日は、動かないと書く。距離も乗り物も無い日がこの旅に1日だけある
  if (legs.length === 0) return "動かない日";
  const ways = [...new Set(legs.map((l) => MOVE[l.move]))].join("と");
  const km = legs.reduce((a, l) => a + (l.km ?? 0), 0);
  return km ? `${ways} ${km.toLocaleString()}km` : ways;
}

function Row({ day }: { day: Day }) {
  const legs = day.legs ?? [];
  // 動かない日は、行そのものがわかれ道を持つ（`content/nordic.ts` の `Day.fork`）
  const asks = legs.filter((l) => l.fork).length + (day.fork ? 1 : 0);
  const art = legs[0]?.art ?? day.art;
  return (
    <Link className="ndayr" href={dayHref(day)}>
      {art && <Mark art={art} size={38} className="ndayr-art" />}
      <span className="ndayr-body">
        <span className="ndayr-top">
          <b>{dayName(day)}</b>
          {day.date && <time dateTime={day.date}>{when(day.date)}</time>}
          {/* 旅とは別の出来事（いまは出発の日の「配信2周年」だけ）。
              日付のすぐ隣に置く。ここを離すと、どの日の話か分からなくなる。 */}
          {day.badge && <span className="ndayr-badge">{day.badge}</span>}
          {/* 「いま、ここ」は `TripNow` が現在地を読んでから出す。
              **本人の字で押さえられている日だけが「いま、ここ」。**
              旅程の日付から引いただけの日は「きょう」——今日がこの行の日だ、
              という暦の話までにとどめる（`components/nordic/where.ts`）。 */}
          <span className="nday-now">いま、ここ</span>
          <span className="nday-day">きょう</span>
          {/* **投票の入口が、どこからも見えなくならないようにする。**
              わかれ道は1日ぶんのページへ移したので、この行には
              「中に答えられるものがある」とだけ書く。数はまだ出さない
              （押す前に多いほうへ引っぱらないため・`Fork.tsx`）。
              下の行に置くと、移動と泊まりで1行あふれて、9日ぶんで 200px 太る。
              字数も詰める。「答えられることが1つ」だと日付のある行で折り返した。 */}
          {asks > 0 && (
            <span className="ndayr-ask">答えられる{asks > 1 ? `${asks}つ` : ""}</span>
          )}
          {/* その日に起きたことが書かれた行の印。**書かれるまで出ない。**
              出すかどうかを決めるのは `DayLogMarks`（画面が出てから読む）。
              書いたものが旅程表から見えないと、読む人は9日ぶんの行を
              1つずつ開いて確かめることになる。 */}
          <span className="ndayr-log">その日の話</span>
        </span>
        <span className="ndayr-way">
          {way(day).map((c, i) => (
            <span key={c + i}>
              {i > 0 && <i aria-hidden>→</i>}
              {c}
            </span>
          ))}
        </span>
        <span className="ndayr-how">
          <span>{how(day)}</span>
          {/* 印を付けない。13px の小さな絵は、この地の上ではただの黒い塊に見えた。
              「泊まる」の2文字のほうが、遠目でも読める。 */}
          {day.stay && <span className="ndayr-stay">泊まる {cityName(day.stay)}</span>}
        </span>
      </span>
      <Icon name="right" size={16} className="ndayr-go" />
    </Link>
  );
}

export default function Days() {
  return (
    <ol className="ndays">
      {/* 書かれた日の行に印を付ける。字も数字も持たない（読むだけ）ので、
          旅程表そのものを面の JS に連れてこない。 */}
      <DayLogMarks />
      {DAYS.map((day) => (
        <li key={day.id} className={`nday${day.bare ? " is-bare" : ""}`} id={day.id}>
          {day.legs?.length || day.city ? (
            <Row day={day} />
          ) : (
            /* ストックホルムでの7泊。**中身のページを持たない。**
               何をするかがまだ決まっていないので、開いても書けることが無い。
               押せないので、厚みも矢印も付けない。 */
            <div className="ndayr is-flat">
              <span className="ndayr-body">
                <span className="ndayr-top">
                  <b>{dayName(day)}</b>
                </span>
                {day.say && <span className="ndayr-say">{day.say}</span>}
              </span>
            </div>
          )}
        </li>
      ))}
      {/* **「着いた」と「旅がおわった」は別の行にする。**
          長いあいだ、旅程表の最後は「着いた朝／船が着いたら終わりです」の1行だけで、
          着いたら旅も終わる作りだった。あやとの言葉（2026-09-06）:

          > ストックホルム出るまでが北欧旅です。

          着く日（9/20）は**会いたい人に会えた日**で、旅が終わる日（9/27）は
          ストックホルムを発つ日。あいだに7泊ある。片方の行にまとめると、
          着いた瞬間に旅が終わったことになる。
          相手の名前も、どういう人かも書かない（`docs/nordic-fund.md` 1章）。 */}
      <li className="nday is-goal">
        <ArrivedRow depart={DEPART.slice(0, 10)} arrive={ARRIVE} />
      </li>
      <li className="nday is-goal is-end">
        <EndRow leave={LEAVE.date} fixed={LEAVE.fixed} />
      </li>
    </ol>
  );
}
