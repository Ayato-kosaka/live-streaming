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
 * ## 「選べる」と読める書き方をしない
 *
 * 写真に入れられるのは**その人自身のキャラクターだけ**で、好きな1人を
 * 選べるものではない（`docs/island-cards.md` 1章）。ここを曖昧に書くと、
 * 2026-09-14 に9時間13分ぶん本番に出した約束の広げすぎ
 * （`docs/island-misses.md` #98）を、今度は文言のほうでやることになる。
 * だから3つ目の手順は「増えていく」までしか言わない。
 *
 * ## Doneru の1行が、`/me` へ送らない理由
 *
 * どねID と YouTube を結ぶ道具はあやとの机にある（`components/me/DonorLinks.tsx`。
 * 口も `GET/POST /donors` であやとだけ）。**視聴者さんが自分で結ぶ場所は無い。**
 * 「つなぎに行こう」と送ると、着いた先に何も無い。
 * 本人にできるのは Doneru に出す名前をそろえておくことなので、それだけを書く。
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
        <section className="akg-note">
          <h3>Doneru から投げた人へ</h3>
          <p>Doneru に出す名前は、YouTube と同じに。写真は YouTube のアカウントにとどきます。</p>
        </section>
      </div>
    </section>
  );
}
