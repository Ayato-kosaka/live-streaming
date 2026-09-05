import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { Mark } from "./Marks";
import { DAYS, cityName, dayHref, dayName, type Day, type Leg } from "@/content/nordic";

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

/** その日に動く道。「カトヴィツェ → クラクフ → オシフィエンチム」 */
function way(legs: Leg[]) {
  return [cityName(legs[0].from), ...legs.map((l) => cityName(l.to))];
}

/** その日の移動のしかた。同じものは1回だけ言う（「フェリー・フェリー」にしない）。 */
function how(legs: Leg[]) {
  const ways = [...new Set(legs.map((l) => MOVE[l.move]))].join("と");
  const km = legs.reduce((a, l) => a + (l.km ?? 0), 0);
  return km ? `${ways} ${km.toLocaleString()}km` : ways;
}

function Row({ day }: { day: Day }) {
  const legs = day.legs ?? [];
  const asks = legs.filter((l) => l.fork).length;
  return (
    <Link className="ndayr" href={dayHref(day)}>
      <Mark art={legs[0].art} size={38} className="ndayr-art" />
      <span className="ndayr-body">
        <span className="ndayr-top">
          <b>{dayName(day)}</b>
          {day.date && <time dateTime={day.date}>{when(day.date)}</time>}
          {/* 「いま、ここ」は `TripNow` が現在地を読んでから出す。 */}
          <span className="nday-now">いま、ここ</span>
          {/* **投票の入口が、どこからも見えなくならないようにする。**
              わかれ道は1日ぶんのページへ移したので、この行には
              「中に答えられるものがある」とだけ書く。数はまだ出さない
              （押す前に多いほうへ引っぱらないため・`Fork.tsx`）。
              下の行に置くと、移動と泊まりで1行あふれて、9日ぶんで 200px 太る。
              字数も詰める。「答えられることが1つ」だと日付のある行で折り返した。 */}
          {asks > 0 && (
            <span className="ndayr-ask">答えられる{asks > 1 ? `${asks}つ` : ""}</span>
          )}
        </span>
        <span className="ndayr-way">
          {way(legs).map((c, i) => (
            <span key={c + i}>
              {i > 0 && <i aria-hidden>→</i>}
              {c}
            </span>
          ))}
        </span>
        <span className="ndayr-how">
          <span>{how(legs)}</span>
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
      {DAYS.map((day) => (
        <li key={day.id} className={`nday${day.bare ? " is-bare" : ""}`} id={day.id}>
          {day.legs?.length ? (
            <Row day={day} />
          ) : (
            /* 予備の2日。**中身のページを持たない。**
               どこへ行くかが決まっていないから予備なので、開いても書けることが無い。
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
      {/* 終わり。ここが企画の芯なので、旅程表の最後の行として置く。
          相手の名前も、どういう人かも書かない（`docs/nordic-fund.md` 1章）。 */}
      <li className="nday is-goal">
        <div className="ndayr is-flat">
          <span className="ndayr-body">
            <span className="ndayr-top">
              <b>着いた朝</b>
            </span>
            <span className="ndayr-way">
              <span>ストックホルム</span>
            </span>
            <span className="ndayr-say">
              船が着いたら終わりです。ここに、会いたい人がいます。友だちの家に約1週間。
            </span>
          </span>
        </div>
      </li>
    </ol>
  );
}
