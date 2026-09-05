import { STREAM_TYPES } from "@/content/streamTypes";
import { ArtSun, ArtTrophy } from "./Art";

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

/**
 * 1週間の回りかた。
 *
 * 「配信の型が5つあります」と並べても、来た人が知りたい
 * 「今夜は何をやってる日なんだろう」には答えられない。
 * `when`（週のはじめ / 週の後半 / 金曜 / 天気がいい日 / 毎月末）を、
 * 表ではなく1本の帯に置き直して、順番と重なりを目で見せる。
 *
 * 決まった時間割ではないので、「だいたい」と書いておく。
 */
export default function WeekRail() {
  const onWeek = STREAM_TYPES.filter((t) => typeof t.week === "object");
  const free = STREAM_TYPES.filter((t) => typeof t.week === "string");

  return (
    <div className="wk pat">
      <div className="wk-days">
        {DAYS.map((d, i) => (
          <span key={d} className={i > 4 ? "is-end" : undefined}>
            {d}
          </span>
        ))}
      </div>

      <div className="wk-rows">
        {onWeek.map((t) => {
          const w = t.week as { from: number; to: number };
          return (
            <div className="wk-row" key={t.slug} style={{ ["--ty" as string]: t.color }}>
              <span className="wk-tag">
                <img src={`/sprites/${t.icon}.webp`} alt="" />
                <b>{t.name}</b>
                <i>{t.when}</i>
              </span>
              <div className="wk-track">
                {DAYS.map((d) => (
                  <i key={d} />
                ))}
                <span className="wk-fill" style={{ gridColumn: `${w.from + 1} / ${w.to + 2}` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="wk-free">
        {free.map((t) => (
          <span key={t.slug} style={{ ["--ty" as string]: t.color }}>
            {t.week === "any" ? <ArtSun size={24} /> : <ArtTrophy size={24} />}
            {t.name}
            <em>{t.when}</em>
          </span>
        ))}
      </div>

      <p className="wk-note">決まった時間割ではなくて、だいたいこう回っている、というくらい。</p>
    </div>
  );
}
