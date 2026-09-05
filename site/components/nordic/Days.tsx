import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import { Mark } from "./Marks";
import { Answer } from "./Fork";
import { DAYS, NORDIC_LOG, ROUTE, nordicCountry, type Leg } from "@/content/nordic";

/**
 * 旅のよてい。日付ごとに1行。**この面の本体。**
 *
 * ここは区間ごとの10枚のカードだった。1枚ずつを畳んであって、開くと中に
 * 「足代の席」「道しるべの席」があり、両方そろうと区間が「つながる」という
 * 作りだった。**通じなかった。** 席もつながりも、この面のためにこちらが
 * 作った言葉で、読む人は誰も知らない。説明が要る言葉は画面に出さない
 * （`docs/nordic-fund.md` 「捨てた設計」）。
 *
 * 代わりに、そのまま読めるものにする。**何日目に、どこからどこへ、どうやって、
 * その日に何があるか。** 日付は切符のある2日にだけ入っている。
 * 残りは埋めない。陸路はぜんぶヒッチハイクなので、乗せてもらえた日でずれる。
 *
 * 畳まない。10日ぶんを上から下まで読めるのが旅程表なので、
 * 押して開かないと中身が分からない形にはしない。
 *
 * 国の話はここでしない。`/nordic/[国]` に見どころが161件あって、
 * そこへの入口は「通る6カ国」が持っている。同じものを2回描かない。
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

export default function Days() {
  return (
    <ol className="ndays">
      {DAYS.map((day) => {
        const log = day.legs.map((l) => NORDIC_LOG[l.id]).find(Boolean);
        return (
          <li key={day.n} className="nday" id={`day-${day.n}`}>
            <p className="nday-when">
              <b>{day.n}日目</b>
              {day.date && <time dateTime={day.date}>{when(day.date)}</time>}
              {/* 「いま、ここ」は `TripNow` が現在地を読んでから出す。
                  どの日が今日の話なのかは、上から読まなくても分かるようにしておく。 */}
              <span className="nday-now">いま、ここ</span>
              {/* 泊まるところは、独立した行にしない。1日あたり37px、10日で370px。 */}
              {day.stay && (
                <span className="nday-stay">
                  <Icon name="home" size={14} />
                  {day.stay}
                </span>
              )}
            </p>

            {day.legs.map((l) => {
              const c = l.enters ? nordicCountry(l.enters) : undefined;
              return (
                <div key={l.id} className="nday-go" data-leg={l.id}>
                  <Mark art={l.art} size={38} className="nday-art" />
                  <div className="nday-txt">
                    <p className="nday-way">
                      {l.from} <span aria-hidden>→</span> {l.to}
                      {l.side && <i>日帰りの寄り道</i>}
                    </p>
                    <p className="nday-how">
                      {MOVE[l.move]}
                      {l.km ? ` ${l.km.toLocaleString()}km` : ""}
                      {l.time ? ` / ${l.time}` : ""}
                      {c && (
                        <span className="nday-enter">
                          <Flag slug={c.slug} size={16} />
                          {c.name}へ
                        </span>
                      )}
                    </p>
                    {l.fixed && <p className="nday-fixed">{l.fixed}</p>}
                    {l.note && <p className="nday-note">{l.note}</p>}
                  </div>
                </div>
              );
            })}

            {/* 越えた日にだけ、聞いた答えが残る。まだの日の問いは、
                下の「この旅に、言う」に並んでいる（`Asks.tsx`）。 */}
            {day.legs.map((l) =>
              l.fork ? (
                <Answer key={l.id} leg={l.id} seq={ROUTE.indexOf(l)} fork={l.fork} />
              ) : null,
            )}



            {/* 越えた日にだけ入る。よていだけの表は、出発前にしか読む理由がない。 */}
            {log && (
              <div className="nday-log">
                <p>{log.body}</p>
                {log.video && (
                  <a
                    className="nday-vid"
                    href={`https://www.youtube.com/watch?v=${log.video}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    その日の配信を見る
                    <Icon name="external" size={14} />
                  </a>
                )}
              </div>
            )}
          </li>
        );
      })}
      {/* 終わり。ここが企画の芯なので、旅程表の最後の行として置く。
          相手の名前も、どういう人かも書かない（`docs/nordic-fund.md` 1章）。 */}
      <li className="nday is-goal">
        <p className="nday-when">
          <b>翌朝</b>
        </p>
        <p className="nday-way">ストックホルム</p>
        <p className="nday-note">
          船が着いたら終わりです。ここに、会いたい人がいます。友だちの家に約1週間。
        </p>
      </li>
    </ol>
  );
}
