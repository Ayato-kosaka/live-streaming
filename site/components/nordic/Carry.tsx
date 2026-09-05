"use client";

import { useFund } from "./fund";
import { legTag, useLegIdeas } from "./ideas";
import { TieMark } from "./Seats";

/**
 * 連れていくボードの、動くところ。
 *
 * 区間カードには席が2つある。**足代（お金）と、道しるべ（言葉）。**
 * 片方だけの区間は、まだ半分。**両方そろって、はじめてその区間はつながる。**
 *
 * 言葉の席を「お金を出さない人への親切」として添えているのではない。
 * 直近1年でコメントした人は1,821人、投げ銭したことがある人は55人（3%）。
 * お金だけを参加の形にすると、97%を締め出す。だから
 * **言葉がないと区間が完成しない**という構造にしてある（`docs/nordic-fund.md` 3章）。
 *
 * 出さない理由を作らないための決まりも、ここに効いている。
 *   - 「あと◯◯円足りません」を書かない
 *   - 埋まっていない区間を灰色にしない。空いている席として書く
 *   - 満ちたらバーを消す。満タンのバーは「もう要らないのに集めている」に見える
 *   - 個人の金額も、順位も、どこにも出さない
 */

const yen = (n: number) => `${n.toLocaleString()}円`;

/** 合計から、この区間に入っているぶんを出す。読めないときは null。 */
function poured(total: number | null, cost: number, before: number, reach: boolean) {
  if (total === null || !reach) return null;
  return Math.max(0, Math.min(cost, total - before));
}

export type FareProps = {
  /** 何に要るのか */
  what: string;
  /** 区間の値段（円）。決まっていない区間は付かない */
  cost?: number;
  /** 円に直す前の数字 */
  src?: string;
  /** この区間より手前の足代の合計 */
  before: number;
  /** ここまで流していいか */
  reach: boolean;
};

/** 足代の席。 */
export function Fare({ what, cost, src, before, reach }: FareProps) {
  const f = useFund();

  // 値段がまだ決まっていない区間（陸路6区間の宿代・GitHub #107）。
  // 席を消さずに「調べている」と出す。席が消えると、区間が1席しかないように見える。
  if (!cost) {
    return (
      <p className="fare-todo">
        <b>{what}</b>
        <i>いくらで見ているか、いま調べています</i>
      </p>
    );
  }

  const got = poured(f?.total ?? null, cost, before, reach);
  const full = got !== null && got >= cost;

  return (
    <div className="fare">
      <p className="fare-what">
        <b>{what}</b>
        <i>
          {yen(cost)}
          {src ? `（${src}）` : ""}
        </i>
      </p>
      {/* まだ1円も届いていない区間には、バーも数字も出さない。
          0円のバーは「誰も出していない」に見えるので、値段だけ出しておく。 */}
      {got !== null && got > 0 && !full && (
        <>
          <span className="fare-bar">
            <i style={{ width: `${Math.max(3, Math.round((got / cost) * 100))}%` }} />
          </span>
          <p className="fare-got">
            このうち <b>{yen(got)}</b> は、もう誰かが出してくれました
          </p>
        </>
      )}
      {full && <p className="fare-full">ここは、誰かが出してくれました</p>}
    </div>
  );
}

export type TieProps = {
  /** 区間の id */
  leg: string;
  /** 足代の席がそもそも要るか（寄り道は要らない） */
  needsFare: boolean;
  cost?: number;
  before: number;
  reach: boolean;
};

/**
 * つながりの読み上げ。区間カードの席の上に1行だけ置く。
 *
 * 「両方そろうとつながります」という決まりの文を10回並べても読まれない。
 * **いまどうなっているかを言う**ようにしてある。埋まると文が変わる。
 */
export function Tie({ leg, needsFare, cost, before, reach }: TieProps) {
  const f = useFund();
  const posts = useLegIdeas(legTag(leg));

  const got = cost ? poured(f?.total ?? null, cost, before, reach) : null;
  const fareDone = !needsFare || (got !== null && !!cost && got >= cost);
  const n = posts?.length ?? 0;
  const tied = fareDone && n > 0;

  let say: React.ReactNode;
  if (tied) {
    say = (
      <>
        <b>つながりました。</b>
        {needsFare ? "足代も道しるべも、そろっています" : "お金の要らない区間に、道しるべが立っています"}
      </>
    );
  } else if (fareDone) {
    say = (
      <>
        {needsFare ? "足代はそろっています" : "越えるのにお金の要らない区間です"}。
        道しるべが1つ立つと、ここはつながります
      </>
    );
  } else if (n > 0) {
    say = (
      <>
        道しるべが <b>{n}つ</b>。足代がそろうと、ここはつながります
      </>
    );
  } else {
    say = <>この区間は、これからつながります。席が2つ空いています</>;
  }

  return (
    <p className={`rtie${tied ? " is-tied" : ""}`}>
      <TieMark tied={tied} size={30} />
      <span>{say}</span>
    </p>
  );
}

/**
 * 何人が連れてきたか。ボードの見出しの下に1回だけ出す。
 *
 * 区間ごとに人数を出せると気持ちがいいが、Doneru の表示名と島のログインを
 * 突き合わせる手段がない。人違いは、お金の話では致命的なので**やらない**。
 * だから金額は区間に、人数はボード全体に置く（`docs/nordic-fund.md` 5章）。
 */
export function CarriedBy() {
  const f = useFund();
  if (!f?.people) return null;
  return (
    <p className="carried">
      いままでに <b>{f.people}人</b> が、この旅を連れてきました。
    </p>
  );
}
