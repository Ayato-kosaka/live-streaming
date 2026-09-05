"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CHAIN, chapterDays, FUND_GOAL_YEN, NEXT_CHAPTER, type Chapter } from "@/content/chapters";
import { CHAPTER_STATS } from "@/content/chapterStats";
import { useFund } from "@/components/nordic/fund";
import Icon from "@/components/ui/IconCore";
import IslandMark, { buildStage } from "./IslandMark";
import { chapterHref } from "./route";

/**
 * 島の連なり。
 *
 * **旅そのものを見せる画面**（`docs/island-atlas.md` 1章）。
 * ヨーロッパ・中東・コーカサス（いまここ）・北欧が、日付の順に一列に並ぶ。
 * イランは本線から下へ枝分かれした小島として、コーカサスの下に付く。
 *
 * ## 縦一列にした理由
 *
 * 旅は西から東への一方通行なので、地図に沿わせて横に並べたくなる。
 * ただし島の大きさは 434日 と 10日 で 6.6倍ちがう。横に並べると
 * いちばん大きい島に合わせて全部が縮み、スマホでは端から端まで
 * 一度に見えなくなる（島の名前と日数も読めなくなる）。
 * **縦に積むと、島の大小と、日付の順と、名前が同時に読める。**
 *
 * ## 数字は、画面が出てから数え直す
 *
 * 静的書き出しなので、いまいる島の「434日」はビルドした日で焼かれる
 * （`CLAUDE.md` のつまずきやすいところ）。島の大きさもその日数から出るので、
 * 焼いた値でまず描いて、`useEffect` で今日の日数に置き換える。
 */
export default function Chain() {
  // 焼いた日数でまず描く。ずれるのは進行中の章だけで、
  // 半径は日数の平方根なので数日ぶんの差は絵に出ない
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);
  const fund = useFund();
  const pct = fund ? Math.min(100, Math.round((fund.total / FUND_GOAL_YEN) * 100)) : 0;

  return (
    <ol className="chain">
      {CHAIN.map((c) => {
        const days = chapterDays(c, today ?? undefined);
        const branch = Boolean(c.branchOf);
        const now = !c.to && !c.branchOf && c.from;
        const next = c === NEXT_CHAPTER;
        const st = CHAPTER_STATS[c.slug];
        return (
          <li
            key={c.slug}
            data-ch={c.slug}
            className={`chain-row${branch ? " is-branch" : ""}${now ? " is-now" : ""}${next ? " is-next" : ""}`}
          >
            {/* 枝は、本線からわざと外して細い線でつなぐ。
                「先へ進んだのではなく、逸れて戻ってきた」を線の太さで言う */}
            {branch && <span className="chain-fork" aria-hidden />}
            <Link className="chain-isle" href={chapterHref(c)} prefetch={false}>
              <span className="chain-art">
                <IslandMark
                  slug={c.slug}
                  days={days}
                  stage={next ? buildStage(pct) : undefined}
                />
              </span>
              <span className="chain-body">
                {now && <em className="chain-here">いまここ</em>}
                <b className="chain-name">{c.name}</b>
                <i className="chain-when">{when(c)}</i>
                <span className="chain-note">{c.note}</span>
                {next ? (
                  <>
                    <span className="chain-nums">
                      <span>
                        <b>{days}</b>日の予定
                      </span>
                    </span>
                    <Fund total={fund?.total ?? null} />
                  </>
                ) : (
                  <span className="chain-nums">
                    {/* 日数を数字の並びの先頭に置く。**島の大きさを決めているのはこれ**
                        なので、他の数字と同じ行にあると絵と数がつながる */}
                    <span>
                      <b>{days.toLocaleString()}</b>日
                    </span>
                    {st && (
                      <>
                        <span>
                          <b>{st.streams}</b>本
                        </span>
                        <span>
                          <b>{st.people.toLocaleString()}</b>人
                        </span>
                        <span>
                          <b>{c.countries.length}</b>カ国
                        </span>
                      </>
                    )}
                  </span>
                )}
              </span>
              <Icon name="right" size={16} className="chain-go" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 集まった額と目標額。
 *
 * **姿だけでは、出した人が自分の1回の効きめを見られない**
 * （`docs/island-atlas.md` 7章）。読めなかったら金額をどこにも出さない。
 * 0円と出すのがいちばん悪い（`components/nordic/fund.ts` と同じ考え）。
 */
function Fund({ total }: { total: number | null }) {
  const goal = `${(FUND_GOAL_YEN / 10_000).toLocaleString()}万円`;
  if (total === null) return <span className="chain-fund">目標 {goal}</span>;
  const man = total / 10_000;
  const got = man >= 1 ? `${man.toFixed(man >= 10 ? 0 : 1).replace(/\.0$/, "")}万円` : `${total.toLocaleString()}円`;
  return (
    <span className="chain-fund">
      <b>{got}</b> / {goal}
    </span>
  );
}

/** 期間の書き方。終わった章は「2024年10月 〜 2025年3月」、いまの章は「〜 いま」 */
function when(c: Chapter): string {
  if (!c.from) return "これから";
  return `${ym(c.from)} 〜 ${c.to ? ym(c.to) : "いま"}`;
}

const ym = (d: string) => {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
};
