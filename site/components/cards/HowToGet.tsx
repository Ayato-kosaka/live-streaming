import Link from "next/link";
import type { ReactNode } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import Say from "@/components/ui/Say";
import { say } from "@/content/nights";

/**
 * もらいかた。**カードの壁のいちばん下に置く1枚。**
 *
 * ## 何を書いて、何を書かないか
 *
 * 面のいちばん上のリードが「その日の写真に、キャラクターを1人だけ入れて
 * 持って帰れます」と言っている。**そこで答えられていないのは
 * 「じゃあ、どうやったらもらえるのか」だけ**なので、ここはそれだけを書く。
 *
 * 前にも同じ場所に紙があって、あやとに剥がされている。
 * あやとの言葉（2026-09-10）:
 *
 * > このページすごくUX が悪い。
 * > 「どうやったら、もらえるんだろう」の説明が最上部の説明と被ってて要らない。
 *
 * 剥がされた理由は**中身がリードと同じだったこと**なので、戻すときの決まりは
 * 「リードが言っていることを、1文字も言い直さない」。写真に誰が立つのか、
 * 何枚あるのか、名前が出る人と出ない人の違いは、ここでは言わない。
 * **書くのは、来てくれた人がこれから何をするかだけ**（`docs/island-misses.md` #7）。
 *
 * **本人が選べることだけは別。** どの名前で投げるかは本人が決めるので、
 * 決める材料になる「そうすると、こうなる」までは書く。それも1文で終える。
 *
 * ## 「選べる」と読める書き方をしない
 *
 * 写真に入れられるのは**その人自身のキャラクターだけ**で、好きな1人を
 * 選べるものではない（`docs/island-cards.md` 1章）。ここを曖昧に書くと、
 * 2026-09-14 に9時間13分ぶん本番に出した約束の広げすぎ
 * （`docs/island-misses.md` #98）を、今度は文言のほうでやることになる。
 * だから3つ目の手順は「増えていく」までしか言わない。
 *
 * ## 「Doneru の名前を YouTube とそろえて」とは書かない
 *
 * 前はここに「Doneru に出す名前は、YouTube と同じに。写真は YouTube の
 * アカウントにとどきます」と書いてあって、それで面ごと止めてあった。
 * **2つの意味で間違っている。**
 *
 * 1. カードに乗る絵は、**投げた瞬間に名乗っていた名前**だけから決まる
 *    （`functions/src/cards.ts` の `iconsOf`。名乗りはカードの書類に
 *    焼き込んである）。名前をそろえることは、届く条件ではない。
 * 2. あやとの決め（2026-09-15）:「みんなが見える場所では匿名性を守りたい」。
 *    「そろえて」は、**視聴者さんに匿名をやめろと言っている。**
 *    守ると決めたものを、画面のほうが壊しに行っていた。
 *
 * 別名で投げるのは正しい使い方なので、「そろえて」ではなく
 * 「そうするとこうなる」だけを書く。ちがう名前で投げた回は公開の面に
 * 出てこない（`components/cards/cards.ts` の `withIcons` が、絵に
 * 結びつかないカードを落とす）——**それは不具合ではなく、名前を出さずに
 * 渡せるということ。** だから困りごとではなく、選べることとして置く。
 *
 * ## Doneru の初回が遅れることは、ここに書かない
 *
 * 表に無い どねID から投げると、紐付くまでカードが作られない
 * （`python/island_cards.py` が `channelId` の無い台帳行を飛ばす。
 * 紐付けるのはあやとで、口は `GET/POST /donors`）。紐付いたあとは日次が
 * さかのぼって配る。**視聴者さんの側に打つ手が1つも無い**ので、書いても
 * 行き場がない。これはこちらが埋める穴であって、画面に置く説明ではない。
 *
 * ## 配信の時刻を、ここに書かない
 *
 * 旅のあいだは始まる時刻が決まらない（`content/chapters.ts` の `looseStart`）。
 * 島じゅうの言い方は `content/nights.ts` が1か所で持っていて、画面が出てから
 * 差し替わる（`components/ui/Say.tsx`）。**ここに「毎晩22時」と焼くと、
 * 旅の17日ぶん、島の他の面と違うことを言い続ける。**
 */

type Step = {
  icon: IconName;
  /** その人が何をするか。**手順の名前は動詞で終える** */
  title: string;
  /** 1行だけ添える。ここに条件や仕組みを書かない */
  line: ReactNode;
};

const STEPS: Step[] = [
  {
    icon: "live",
    title: "配信を見に来る",
    /* 時刻は島で1か所（`content/nights.ts`）。旅のあいだは
       「毎日12時間くらい」に差し替わる */
    line: (
      <>
        <Say t={say("bare")} />、世界のどこかから。
      </>
    ),
  },
  {
    icon: "tip",
    title: "その日に、投げ銭する",
    line: "スパチャでも、Doneru でも。",
  },
  {
    icon: "photo",
    title: "じぶんのことに、増えていく",
    /* **「もらう」を押す場所はどこにも無い**（`docs/island-cards.md` 1章）。
       探させないために、無いことをここで1回だけ言う。 */
    line: "その日の写真が、そのまま置いてあります。もらう手つづきはありません。",
  },
];

export default function HowToGet() {
  return (
    <section className="panel paper akg">
      <h2>もらいかた</h2>
      {/* 手順は順番が意味を持つので `ol`。点線の道は CSS が引く
          （`app/css/cards.css` の `.akg-mark`）。 */}
      <ol className="akg-steps">
        {STEPS.map((s, i) => (
          <li className="akg-step" key={s.title}>
            <span className="akg-mark" aria-hidden>
              <span className="akg-disc">
                <Icon name={s.icon} size={30} />
              </span>
            </span>
            <span className="akg-say">
              <b className="akg-head">
                {/* 何番目かは字で出す。読み上げには番号が要らない（`ol` が持っている） */}
                <i className="akg-n" aria-hidden>
                  {i + 1}
                </i>
                {s.title}
              </b>
              <span className="akg-line">{s.line}</span>
            </span>
          </li>
        ))}
      </ol>

      <Link className="akg-go" href="/me">
        じぶんのことを見る
        <Icon name="right" size={14} />
      </Link>

      <div className="akg-notes">
        <section className="akg-note">
          <h3>キャラクターって？</h3>
          <p>あやとが、ひとりずつ描いています。</p>
          <Link className="akg-go" href="/friends">
            住んでる人を見る
            <Icon name="right" size={14} />
          </Link>
        </section>
        {/* **「そろえて」と言わない。** 別名で投げるのは正しい使い方で、
            そうした回は公開の面に出ない（`cards.ts` の `withIcons`）。
            起きることだけを書いて、選べることとして置く。 */}
        <section className="akg-note">
          <h3>べつの名前で投げたいとき</h3>
          <p>
            ちがう名前で投げた日は、その写真にあなたは出てきません。
            名前を出したくない日は、そちらで。
          </p>
        </section>
      </div>
    </section>
  );
}
