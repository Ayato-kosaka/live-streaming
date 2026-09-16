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
 * ## Doneru の1行は、書き直さずに消した（2026-09-16）
 *
 * 前はここに「Doneru に出す名前は、YouTube と同じに。写真は YouTube の
 * アカウントにとどきます」と書いてあって、それで面ごと止めてあった。
 * **2つの意味で間違っていた。**
 *
 * 1. カードに乗る絵は、**投げた瞬間に名乗っていた名前**だけから決まる
 *    （`functions/src/cards.ts` の `iconsOf`。名乗りはカードの書類に
 *    焼き込んである）。名前をそろえることは、届く条件ではない。
 * 2. あやとの決め（2026-09-15）:「みんなが見える場所では匿名性を守りたい」。
 *    「そろえて」は、**視聴者さんに匿名をやめろと言っている。**
 *
 * **裏返して「ちがう名前で投げた日は出てきません」にもしない。**
 * 守れない約束だから。絵を当てるのは**読むたび**で、そのときの名簿を引く
 * （`functions/src/cards.ts` の `listCards` → `iconsOf`）。呼び名は
 * あやとがあとから足せる（`functions/src/islandCharacter.ts` の
 * `lookupKeys`）。**今日は当たらない名乗りが、呼び名を1つ足した日から
 * 当たる。** 過去にさかのぼって絵が出る。匿名でいられると読んで投げた人を、
 * こちらの都合であとから裏切ることになる。
 *
 * 匿名で投げたい人が困らない状態は、**画面の1行ではなく仕組みで持つ。**
 * いま実際そうなっている（別名の回は公開の面に出ない）。**約束にしない。**
 *
 * ## Doneru の初回が遅れることも、書かない
 *
 * 表に無い どねID から投げると、そもそもカードが作られない
 * （`python/island_tips.py` が `channelId: null` で台帳に入れ、
 * `functions/src/streamEvents.ts` の `mintCards` と
 * `python/island_cards.py` がその行を飛ばす）。紐付けるのはあやとで、
 * 口（`GET/POST /donors`）もあやとだけ。**視聴者さんの側に打つ手が
 * 1つも無い**ので、書いても行き場がない。これはこちらが埋める穴であって、
 * 画面に置く説明ではない。
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
        {/* **「描けた日にこれまでのぶんも」を落とさない。** 絵の無い人の
            カードは、持っていても画面に出ない（`cards.ts` の `withIcons`）。
            それを言わずに手順3だけ置くと、初めて投げてくれた人が
            「置いてあります」を読んで `/me` を開き、0枚を見ることになる。
            カードの書類は投げた日にもう作られているので、絵ができた日に
            さかのぼって出るのは本当（`functions/src/cards.ts` の `iconsOf`
            は読むたびに名簿を引く）。 */}
        <section className="akg-note">
          <h3>キャラクターって？</h3>
          <p>あやとが、ひとりずつ描いています。まだの人は、描けた日にこれまでのぶんも出てきます。</p>
          <Link className="akg-go" href="/friends">
            住んでる人を見る
            <Icon name="right" size={14} />
          </Link>
        </section>
      </div>
    </section>
  );
}
