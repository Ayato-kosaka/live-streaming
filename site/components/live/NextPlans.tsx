"use client";

import { useCallback, useEffect, useState } from "react";
import { getState } from "@/lib/api";
import { livePlans, planPhase, type Plan } from "@/content/plans";
import { themeById } from "@/content/themes";
import Longer from "@/components/ui/Longer";
import Notes from "./Notes";
import PlanCard, { PlanRow } from "./PlanCard";

/** 日付の早い順。日付の無いものは後ろ。 */
const byDate = (a: Plan, b: Plan) => (a.date ?? "9999").localeCompare(b.date ?? "9999");

/**
 * 企画1つぶんの付箋。
 *
 * **宛先はテーマ（`content/themes.ts`）で、企画の id をそのまま使う。**
 *
 * ここは長いあいだ、企画だけ別の口（`POST /notes` の `planId`）に書いていた。
 * #160 でテーマ付きの付箋に作り替えたとき、移行のあいだ壊れないようにと
 * 古い口を残したまま閉じ忘れていて、**ここから書いたものは `theme` を
 * 持たないので、`GET /stickies` の一覧から外れていた**（あの口は
 * `theme` の無いものを落とす）。あやとが6枚書いて1枚も出てこなかったのがこれ。
 * `【】` のときと同じ形の失敗で、原因も同じ「書く場所と読む場所の食い違い」。
 *
 * だから欄そのものを `Notes` に寄せる。書くのも読むのも `/stickies` の1本になり、
 * 貼った付箋は掲示板の棚にも同じ日に出る。
 *
 * **テーマの無い企画には、欄を出さない。** 書けるのに表に出ない口を残すのが、
 * いま直した不具合そのものだった。企画に付箋を集めたくなったら
 * `content/themes.ts` に1行足す。
 */
function PlanNotes({ plan }: { plan: Plan }) {
  const theme = themeById(plan.id);
  if (!theme) return null;
  return (
    <div
      id={`${plan.id}-notes`}
      style={{ scrollMarginTop: 78, marginTop: "var(--sp-5)" }}
    >
      <h3 className="sub" style={{ margin: 0 }}>
        みんなの付箋
      </h3>
      {/* 紙の上に紙を重ねない（`bare`）。書く欄を付箋の山より前に出すのは
          `Notes` の仕事なので、ここでは順番を組み立てない。
          掲示板・国の面・企画の面で、置き方が1つになる。 */}
      <Notes bare theme={theme.id} />
    </div>
  );
}

/**
 * これからの企画ぜんぶ。
 *
 * 島に来た人がまっさきに知りたいのは「次に何をするのか」。
 * だからいちばん近い企画だけを主役として大きく開いておき、
 * そのあとの企画は日付順に、題名と日付で追えるように並べる。
 *
 * **いま行っているものがあれば、それが主役。** 旅の最中に来た人が
 * まず知りたいのは「いま何が起きているか」で、次の予定ではない。
 *
 * 静的書き出しなので「もう終わったかどうか」はビルド時の日付で焼き込まれてしまう。
 * 画面が出るまでは日付順に全部を「これから」として出し、
 * 出てから今日の日付で、いま行っているものと終わったものに分ける。
 *
 * **「終わった」に倒すのは、終わったと分かったときだけ。** 始まる日しか
 * 持たせていなかったころ、出発の当日から旅のあいだじゅう
 * 「もう行ってきた」と出ていた（`content/plans.ts` の `planPhase`）。
 */
export default function NextPlans() {
  const [today, setToday] = useState<Date | null>(null);
  /**
   * 島から届く2つの日。**着いた日と、旅が終わった日は別**
   * （`content/plans.ts` の `reached` と `doneFromState`）。
   */
  const [facts, setFacts] = useState<{ arrived: string | null; ended: string | null } | null>(null);

  /* ここが読むのは、島から届く日付だけになった。付箋は `PlanNotes` の中の
     `Notes` が、テーマの口（`/stickies`）から自分で読む。
     読めなかったときは焼いてある予定のまま出す。旅の日付が届かないことは、
     見ている人には関係のない話なので、断りを出さない
     （`docs/island-design.md` 4章）。 */
  const load = useCallback(() => {
    getState()
      .then((s) =>
        setFacts({
          arrived: s.nordic?.arrivedOn ?? null,
          ended: s.nordic?.endedOn ?? null,
        }),
      )
      .catch(() => setFacts(null));
  }, []);

  useEffect(() => {
    setToday(new Date());
    load();
  }, [load]);

  /* 島から届いた日を貼る。**「着いた」を企画の終わりにしない。**
     ストックホルムに着いてから発つまでに7泊ある
     （`content/plans.ts` の `livePlans`・`docs/nordic-depart.md`）。 */
  const sorted = [...livePlans(facts)].sort(byDate);
  /* 画面が出るまで（today が null）は、全部を「これから」として並べる。
     焼き込みの日付で「終わった」と言わない。 */
  const phase = (p: Plan) => (today ? planPhase(p, today) : "before");
  const now = sorted.filter((p) => phase(p) === "during");
  const done = sorted.filter((p) => phase(p) === "after");
  const before = sorted.filter((p) => phase(p) === "before");
  // いま行っているものが主役。無ければ、いちばん近いこれから
  const ahead = [...now, ...before];
  const [lead, ...rest] = ahead;

  return (
    <>
      {/* しらせの帯を外した。すぐ下の札が「あと何日」を大きい数字で言っていて、
          帯はその同じことを小さい字でもう一度言っていた（同じ数が2回出る）。
          件数は道のりの見出しが持っている。 */}
      {lead && (
        <PlanCard plan={lead}>
          <PlanNotes plan={lead} />
        </PlanCard>
      )}

      {/* これからの予定が1つも無い日。「まだ何も無い」で終わらせず、
          次にすることを1つ置く（`docs/island-design.md` 4章）。
          today が入るまでは出さない。焼き込みの日付で「予定なし」と言わない。
          **いま行っているものがあれば、ここは出さない。** 旅の最中に
          「決まっている予定はありません」と出ていた（すぐ下に旅が並んでいるのに）。 */}
      {today && ahead.length === 0 && (
        <section className="panel paper">
          <h2>いま、決まっている予定はありません</h2>
          <p>
            次の企画は、たいてい掲示板から生まれます。むちゃなものほど通るので、思いついたことをそのまま。
          </p>
        </section>
      )}

      {/* このあとの予定。**一覧と札を分けない。**
          飛び石の段がそのまま開いて中身になる（`docs/island-ux.md` 5.8）。
          目次と本文を並べて置くと、押した先に同じ題名がもう一度出てくる。 */}
      {rest.length > 0 && (
        <section className="panel paper">
          <h2>このあと、どこへ行くんだろう</h2>
          {/* 飛び石は1つ 60px ほどだが、日付の決まった企画は増える一方。
              **どこまで先を見せるかを決めておく**（#225）。 */}
          <Longer items={rest} first={6} step={12} unit="つ" className="nx-road">
            {(p) => (
              <PlanRow plan={p} key={p.id}>
                <PlanNotes plan={p} />
              </PlanRow>
            )}
          </Longer>
        </section>
      )}

      {done.length > 0 && (
        <section className="panel paper">
          <h2>もう行ってきた</h2>
          {/* 終わった企画は**1つも減らない。** 何年ぶんでも下に積み上がるので、
              これからより短く出す。読み返す人は押して出す。 */}
          <Longer items={done} first={4} step={12} unit="つ" className="nx-road">
            {(p) => (
              <PlanRow plan={p} key={p.id}>
                <PlanNotes plan={p} />
              </PlanRow>
            )}
          </Longer>
        </section>
      )}
    </>
  );
}
