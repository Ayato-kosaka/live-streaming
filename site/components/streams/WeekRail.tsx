import { STREAM_TYPES } from "@/content/streamTypes";
import { ArtSun, ArtTrophy } from "./Art";
import Tonight, { type FreeKind, type WeekKind } from "./Tonight";
import WeekToday from "./WeekToday";
import { DAYS } from "./days";

/**
 * 1週間の回りかた。
 *
 * 「配信の型が5つあります」と並べても、来た人が知りたい
 * 「今夜は何をやってる日なんだろう」には答えられない。
 * `when`（週のはじめ / 週の後半 / 金曜 / 天気がいい日 / 毎月末）を、
 * 表ではなく1本の帯に置き直して、順番と重なりを目で見せる。
 *
 * 決まった時間割ではないので、「だいたい」と書いておく。
 *
 * ## 答えを、図から読み取らせない
 *
 * 図だけだと、読む人はまず「今日は何曜日だったか」を思い出すことになる。
 * しかも水曜と日曜はどの帯にも入っていないので、その2日は図を読んでも答えが無い。
 * **今夜の答えは字で先に言って（`Tonight`）、図はそのあとの
 * 「だいたいこう回っている」を受け持つ。** 今日の列にも印を打つ（`WeekToday`）。
 *
 * 今日は焼けないので（`output: "export"`）、その2つだけ画面が出てから決める。
 * **`STREAM_TYPES` をまるごとブラウザへ渡さない。** 答えに要るのは名前と
 * 曜日の範囲だけで、本文まで連れていくと、この面だけで数KB増える。
 */
export default function WeekRail() {
  const onWeek = STREAM_TYPES.filter((t) => typeof t.week === "object");
  const free = STREAM_TYPES.filter((t) => typeof t.week === "string");

  const weekKinds: WeekKind[] = onWeek.map((t) => {
    const w = t.week as { from: number; to: number };
    return { slug: t.slug, name: t.name, from: w.from, to: w.to };
  });
  const freeKinds: FreeKind[] = free.map((t) => ({
    slug: t.slug,
    name: t.name,
    monthend: t.week === "monthend",
  }));

  return (
    <div className="wk">
      <Tonight week={weekKinds} free={freeKinds} />

      {/* 曜日の見出しと帯は、同じ7列の格子に載っている。今日の列を1本だけ
          通したいので、その2つをここで1つの箱にまとめて、地にする */}
      <div className="wk-grid">
        <WeekToday />

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
                  {/* **7つのマスに、列を明かして置く。** 帯（`.wk-fill`）が
                      先に列を押さえるので、任せると余ったマスが8列目・9列目に
                      こぼれる。7列が 45.1px から 43.4px に痩せて、
                      **曜日の見出しと帯が最大12pxずれていた**（今日の列を
                      通して初めて見えた） */}
                  {DAYS.map((d, i) => (
                    <i key={d} style={{ gridColumn: i + 1 }} />
                  ))}
                  <span className="wk-fill" style={{ gridColumn: `${w.from + 1} / ${w.to + 2}` }} />
                </div>
              </div>
            );
          })}
        </div>
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
