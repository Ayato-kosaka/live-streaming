import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import AskCopy from "./AskCopy";
import { foodCountryName, foodsOf, type DailyFood as Food } from "@/content/nordicFood";

/**
 * その国の、ふだんのごはん。
 *
 * **国の slug を1つ受け取って、その国のぶんだけを描く。** 旅程も日付も見ない。
 * だから日ごとの面（`/nordic/day/[n]`）にも、国の面（`/nordic/[country]`）にも
 * 同じものを置ける。どこに差し込むかは、置く側が決める。
 *
 * ## 畳んでおく
 *
 * 1国 5〜7品ある。開いたまま縦に並べると、それだけで3画面になる
 * （`docs/island-standards.md` 7）。閉じているあいだに見えるのは
 * **名前・読み・一行**の3つで、それで「これは何か」は分かる。
 * 中を読むのは、気になった1品だけでいい。
 *
 * ## ここはサーバで描き切る
 *
 * ブラウザまで運ぶのは、写す押しどころ1つだけ（`AskCopy.tsx`）。
 * この面に `"use client"` を付けると `content/nordicFood.ts` が丸ごと束に入って、
 * **1国しか出さない面に6カ国40品ぶんが乗る**（実測 72KB / gzip 27KB）。
 * 旅の面は電波の細いところで開くので、そこは払わない。
 *
 * ## 印は自前の SVG
 *
 * 絵文字は1文字も置かない（`docs/island-design.md` 1）。
 */
export default function DailyFood({
  country,
  named = false,
}: {
  country: string;
  /** 同じ面に国が2つ以上並ぶ日は、題に国の名前を入れる。 */
  named?: boolean;
}) {
  const foods = foodsOf(country);
  if (foods.length === 0) return null;
  const name = foodCountryName(country);

  return (
    <section className="panel paper nfood" id={`food-${country}`}>
      {/* 国の名前は題に入れない。390px だと「スウェーデンの人は、ふ／だん…」で
          割れるし、この部品が乗る面は国の名前をもう言っている。
          **同じ面で同じことを2回言わない**（`docs/island-misses.md` 決めごと6）。 */}
      {/* 国が1つの日は、題に国名を入れない（置く面がもう言っている）。
          **2つ以上並ぶ日は入れる。** 入れないと同じ題が3つ続いて、
          どれがどの国のものか題からは分からなくなる（8日目がそれ。
          エストニア・フィンランド・スウェーデンの3つが並ぶ）。
          長い題は 390px で名前の途中から割れるので、短いほうの言い方にする。 */}
      <h2>{named && name ? `${name}の、ふだんのごはん` : "ふだん、何を食べてるんだろう"}</h2>
      {/* 観光の名物ではなく、棚と食卓にあるもの、と一行で言い切る。
          どういう条件で選んだかは中の話なので、画面には書かない。 */}
      <p className="nfood-lead">
        {name ? `${name}の、スーパーの棚と家の食卓にあるもの。` : "スーパーの棚と、家の食卓にあるもの。"}
      </p>
      <div className="folds">
        {foods.map((f) => (
          <FoodRow key={`${f.country}-${f.name}`} food={f} />
        ))}
      </div>
    </section>
  );
}

function FoodRow({ food }: { food: Food }) {
  return (
    <Fold
      title={
        <>
          {food.name}
          <span className="nfd-read">{food.read}</span>
        </>
      }
      lead={food.jp}
    >
      <div className="nfd">
        <div className="nfd-tags">
          <span className="nfd-tag">{food.where}</span>
          {food.season && (
            <span className="nfd-tag">
              <Icon name="calendar" size={14} />
              {food.season}
            </span>
          )}
          {food.price && <span className="nfd-tag">{food.price}</span>}
        </div>
        <p className="nfd-body">{food.body}</p>
        <div className="nfd-how">
          <b>食べ方</b>
          <p>{food.how}</p>
        </div>
        {/* 乗せてくれた人に聞く一言。テーマの「人との交流（ヒッチハイク）」は、
            **相手が教える側に回ったときにいちばん続く。** だから当てにいく問いは
            置かない（決めごとは `content/nordicFood.ts` の頭）。

            いちばん大きい字を現地語の一文にして、その下に読みと訳を置く。
            画面を相手に向ければ、そのまま読んでもらえる並びになる。
            **どこかに書き写して掲げる前提では作っていない。** */}
        <div className="nfd-ask">
          <b className="nfd-ask-h">聞いてみる</b>
          <p className="nfd-say">{food.ask.say}</p>
          <p className="nfd-yomi">{food.ask.read}</p>
          <p className="nfd-jp">{food.ask.jp}</p>
          <AskCopy say={food.ask.say} />
        </div>
      </div>
    </Fold>
  );
}
